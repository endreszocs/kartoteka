-- ==========================================================================
-- 2026-07-25 — F8d: QR-kódos telefonos feltöltés (desktop → mobil) — DB-alap
-- ==========================================================================
-- KONTEXTUS (iktató dokumentum-digitalizálás, F8d fázis — terv:
-- docs/project-tracking/KARTOTEKA-iktato-szkenneles-kutatas-2026-07-25.md):
--
--   A desktopon a „Fotózás telefonnal" gomb egy rövid életű feltöltő-
--   munkamenetet (upload_sessions) hoz létre; a QR-kód CSAK a munkamenet
--   URL-jét hordozza (benne a nyers tokennel). A telefon bejelentkezés
--   nélkül, a token birtokában tölt fel az 'iktato-csatolmanyok' privát
--   bucket 'qr-staging/{session_id}/...' útjaira, majd a qr_register_upload
--   RPC regisztrálja a csatolmány-sort a munkamenet iktató-tételéhez.
--
--   BIZTONSÁGI ELVEK (a kutatási doksi 1. és 7. pontja szerint):
--     • A tokent SOHA nem tároljuk nyersen — csak a sha256-hash-ét
--       (token_hash = kisbetűs hex, ld. oszlop-komment). A kliens sosem
--       küld hash-t: az RPC-k maguk hash-elik a kapott nyers tokent
--       (digest(p_token, 'sha256') — pgcrypto, élesben a public sémában
--       a 2026-04-16-wc2-oblio-integracio.sql óta).
--     • Az anon szerep SEMMILYEN közvetlen tábla-hozzáférést nem kap —
--       kizárólag a két SECURITY DEFINER RPC-t (lookup + register) hívhatja,
--       és a storage-ba is csak aktív munkamenet 'qr-staging/{session_id}/'
--       prefixe alá tölthet (definer-helper a policy-ban, ld. 9a).
--     • A csatolmány-sor congregation/iktato-ja MINDIG a munkamenet-sorból
--       jön (scope-divergencia hibaosztály elleni védelem), az RPC path-őre
--       pedig kikényszeríti a 'qr-staging/{session_id}/...' útvonal-alakot.
--     • A tárolt fájl MIME-típusa és mérete a storage.objects metaadatából
--       jön (ha van) — a telefon állítása csak tartalék (6. szakasz).
--     • DB-oldali TTL-plafon: expires_at legfeljebb created_at + 2 óra
--       (a signed upload URL fix 2 órás élettartamához igazítva) — app-hiba
--       esetén sem születhet „örök" QR-munkamenet.
--     • Lejárat-takarítás: a lejárt sorokat a qr_sweep_expired_sessions
--       helper állítja 'expired'-re, a lookup/register/close SIKERES ágán
--       meghívva (⚠️ ld. lentebb: RAISE-re a takarítás visszagördülne).
--
-- ⚠️ MIÉRT NEM A SAJÁT SORÁT JELÖLI EXPIRED-RE A LOOKUP/REGISTER?
--   Mert a lejárt munkamenetre magyar hibaüzenettel RAISE-elünk, a kivétel
--   pedig a teljes függvény-tranzakciót (így az UPDATE-et is) visszagörgeti
--   — a jelölés SOHA nem maradna meg. Helyette a SIKERES ágon söprünk:
--   ilyenkor a gyülekezet ÖSSZES lejárt-de-aktív sora (kötegelve, legfeljebb
--   200) átáll 'expired'-re, és az UPDATE véglegesül. A funkcionális
--   védelmet egyébként is az expires_at összevetése adja, nem a status —
--   a status a desktop-kijelzés/audit kedvéért pontos.
--
-- MIKOR KELL FUTTATNI: az F8d PR merge ELŐTT, a Supabase SQL Editorban
--   (az app az új táblára + RPC-kre támaszkodik — előbb a DB, aztán deploy).
--
-- ⚠️ SORREND-FÜGGÉS: ez a fájl a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql
--   UTÁN futtatandó (annak tábláira/bucketjére/policy-jaira épül), és a 9b/9c
--   szakasz ÚJRAÍRJA az F6-os select/delete storage-policy-ket a qr-staging
--   ággal bővítve. Ha az F6-os fájlt később ÚJRA lefuttatnád, az a qr-ágat
--   eltünteti — olyankor EZT a fájlt is futtasd újra.
--
-- ADATMIGRÁCIÓ: NINCS — új tábla + új RPC-k + policy-bővítés.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--   DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS + constraint-pótló
--   DO-blokk — biztonságos ismételt futtatás.
--
-- FÜGGŐSÉGEK (mind élesben van):
--   • pgcrypto extension (public séma, 2026-04-16-wc2-oblio-integracio.sql)
--   • public.current_user_congregation_id() + current_user_has_global_access()
--     (2026-04-12-phase-0-rls-hardening)
--   • public.profile_roles (2026-04-17-profile-roles-fazis-1)
--   • public.iktato + iktato_id_congregation_uk UNIQUE (id, congregation_id)
--     (2026-07-17-f6 — az összetett FK alapja)
--   • public.iktato_csatolmany + 'iktato-csatolmanyok' privát bucket +
--     iktato_csatolmanyok_* storage-policy-k (2026-07-17-f6)
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. pgcrypto — a digest() miatt (élesben már megvan, ez csak biztosíték)
-- ─────────────────────────────────────────────────────────────────────────
-- Ha az extension már létezik (akár az 'extensions' sémában), a parancs
-- NOTICE-szal kihagyódik; az RPC-k search_path-ában ezért a public MELLETT
-- az extensions séma is szerepel.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. upload_sessions tábla
-- ─────────────────────────────────────────────────────────────────────────
-- Az (iktato_id, congregation_id) ÖSSZETETT FK az iktato F6-os
-- (id, congregation_id) egyedi párjára hivatkozik — így a munkamenet
-- congregation_id-je garantáltan a hivatkozott iktató-tétel valódi
-- gyülekezete (direkt PostgREST-hívással sem húzható szét), és az
-- ON DELETE CASCADE a kontraktus szerinti iktato-kaszkádot is adja.

CREATE TABLE IF NOT EXISTS public.upload_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  iktato_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  max_files integer NOT NULL DEFAULT 20,
  uploaded_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upload_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT upload_sessions_token_hash_uk UNIQUE (token_hash),
  CONSTRAINT upload_sessions_status_chk
    CHECK (status IN ('active', 'closed', 'expired')),
  CONSTRAINT upload_sessions_max_files_chk
    CHECK (max_files BETWEEN 1 AND 100),
  CONSTRAINT upload_sessions_uploaded_count_chk
    CHECK (uploaded_count >= 0),
  -- TTL-plafon: a munkamenet legfeljebb 2 óráig élhet (a Supabase signed
  -- upload URL fix 2 órás élettartamához igazítva). A terv szerinti
  -- gyakorlati TTL 5–10 perc — ez csak a felső korlát app-hiba ellen.
  CONSTRAINT upload_sessions_expires_at_chk
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 hours'),
  CONSTRAINT upload_sessions_iktato_id_fkey
    FOREIGN KEY (iktato_id, congregation_id)
    REFERENCES public.iktato (id, congregation_id) ON DELETE CASCADE,
  CONSTRAINT upload_sessions_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

-- Idempotencia-őr: ha egy KORÁBBI futtatás a TTL-plafon nélkül hozta létre a
-- táblát, pótoljuk a kényszert (a CREATE TABLE IF NOT EXISTS kihagyná).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'upload_sessions_expires_at_chk'
      AND conrelid = 'public.upload_sessions'::regclass
  ) THEN
    ALTER TABLE public.upload_sessions
      ADD CONSTRAINT upload_sessions_expires_at_chk
      CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 hours');
    RAISE NOTICE 'upload_sessions_expires_at_chk (TTL-plafon) pótolva.';
  END IF;
END $$;

COMMENT ON TABLE public.upload_sessions IS
  '2026-07-25 F8d: QR-kódos telefonos feltöltő-munkamenetek. A desktop hozza létre (rövid TTL, tipikusan 5–10 perc, DB-plafon 2 óra); a telefon a nyers tokennel, bejelentkezés nélkül tölt fel a qr-staging/{session_id}/ prefix alá, a qr_register_upload RPC-n keresztül regisztrálva. A token CSAK hash-elve tárolódik.';
COMMENT ON COLUMN public.upload_sessions.token_hash IS
  'A nyers token sha256-hash-e, KISBETŰS hex kódolással: encode(digest(token, ''sha256''), ''hex'') ≡ Node crypto.createHash(''sha256'').update(token, ''utf8'').digest(''hex''). A nyers token SOHA nem kerül a DB-be.';
COMMENT ON COLUMN public.upload_sessions.expires_at IS
  'A munkamenet lejárata. DB-plafon: legfeljebb created_at + 2 óra (upload_sessions_expires_at_chk); a terv szerinti gyakorlati érték 5–10 perc.';
COMMENT ON COLUMN public.upload_sessions.status IS
  'active = él; closed = kézzel lezárva (qr_session_close); expired = lejárt (a qr_sweep_expired_sessions helper állítja át kötegelten). A funkcionális védelem mindig az expires_at összevetése, nem a status.';
COMMENT ON COLUMN public.upload_sessions.max_files IS
  'A munkamenetben regisztrálható csatolmányok felső korlátja (default 20, CHECK: 1–100).';
COMMENT ON COLUMN public.upload_sessions.uploaded_count IS
  'A qr_register_upload által sikeresen regisztrált csatolmányok száma (az RPC növeli, sor-lock alatt).';
COMMENT ON COLUMN public.upload_sessions.created_by_profile_id IS
  'A munkamenetet indító profil. Szándékosan FK nélkül (F6-os created_by_profile_id minta) — profil-törlés ne blokkolódjon miatta.';

-- Gyülekezeti listázás/RLS + söprés (congregation_id, status, expires_at)
CREATE INDEX IF NOT EXISTS upload_sessions_congregation_idx
  ON public.upload_sessions (congregation_id);
-- FK-index a kaszkádhoz + „e tétel munkamenetei" lekérdezéshez
CREATE INDEX IF NOT EXISTS upload_sessions_iktato_idx
  ON public.upload_sessions (iktato_id);
-- A storage-policy-k szöveges id-összevetéséhez (us.id::text = 2. szegmens);
-- az uuid→text I/O-cast immutable, ezért indexelhető kifejezés.
CREATE INDEX IF NOT EXISTS upload_sessions_id_text_idx
  ON public.upload_sessions ((id::text));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. GRANT — explicit REVOKE kell (a 2026-04-23-m0 default-privileges miatt
--    minden új public-táblára automatikus authenticated-jog öröklődne).
--    * authenticated: SELECT + INSERT + UPDATE (a desktop hozza létre és
--      figyeli a munkamenetet; törlés nincs — a sor audit-nyom marad).
--    * anon: SEMMI közvetlen — csak a definer RPC-ken át ér el bármit.
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.upload_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.upload_sessions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS — a profile_roles-ágas F6-minta, saját gyülekezet
--    (anon-nak NINCS policy → default-deny; DELETE-policy sincs → tiltott)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

-- 3a) olvasás — saját gyülekezet (a desktop innen figyeli a beérkezéseket)
DROP POLICY IF EXISTS upload_sessions_select_own ON public.upload_sessions;
CREATE POLICY upload_sessions_select_own
  ON public.upload_sessions
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    -- Scope-divergencia védelem (ismert gyökérok-osztály): az app az
    -- effectiveCongregationId-t (profile_roles.scope_id) használja, a skalár
    -- profiles.congregation_id ettől eltérhet — enélkül némán 0 sor jönne.
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = upload_sessions.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 3b) létrehozás — saját gyülekezet
DROP POLICY IF EXISTS upload_sessions_insert_own ON public.upload_sessions;
CREATE POLICY upload_sessions_insert_own
  ON public.upload_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = upload_sessions.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 3c) módosítás — saját gyülekezet (kézi lezárás/ismételt QR; a számláló-
--     növelést és a lejárat-söprést a definer RPC-k végzik, azokra az RLS
--     nem vonatkozik). A congregation_id átírását a WITH CHECK zárja ki.
DROP POLICY IF EXISTS upload_sessions_update_own ON public.upload_sessions;
CREATE POLICY upload_sessions_update_own
  ON public.upload_sessions
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = upload_sessions.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = upload_sessions.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. BELSŐ HELPER: lejárat-takarítás (kötegelt, deadlock-mentes)
-- ─────────────────────────────────────────────────────────────────────────
-- A lookup/register/close SIKERES ágán hívjuk (ld. a fejléc ⚠️ szakaszát:
-- a saját sor jelölése RAISE mellett visszagördülne). SKIP LOCKED + ORDER BY
-- + LIMIT: a párhuzamos hívások nem várnak egymásra és nem holtpontolnak.
-- Gyülekezetre szűkítve fut, hogy a költsége határos maradjon.
-- Jogosultság: SENKINEK nincs EXECUTE-ja — csak a definer RPC-kből hívható.

CREATE OR REPLACE FUNCTION public.qr_sweep_expired_sessions(p_congregation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_congregation_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH lejart AS (
    SELECT s.id
      FROM public.upload_sessions s
     WHERE s.congregation_id = p_congregation_id
       AND s.status = 'active'
       AND s.expires_at <= now()
     ORDER BY s.id
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.upload_sessions u
     SET status = 'expired'
    FROM lejart
   WHERE u.id = lejart.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.qr_sweep_expired_sessions(uuid) IS
  '2026-07-25 F8d: belső lejárat-takarító — egy gyülekezet lejárt, de még ''active'' QR-munkamenet-sorait ''expired''-re állítja (kötegelt, ORDER BY + LIMIT 200 + FOR UPDATE SKIP LOCKED). A qr_session_lookup/register/close SIKERES ága hívja. Nincs EXECUTE-joga sem anonnak, sem authenticated-nek.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: qr_session_lookup(p_token) — a telefonos oldal betöltésekor
-- ─────────────────────────────────────────────────────────────────────────
-- Anon is hívhatja (a mobil-oldal bejelentkezés nélküli) — a token az
-- egyetlen belépő. A search_path-ban az extensions séma is szerepel, hogy a
-- digest() akkor is feloldódjon, ha a pgcrypto ott (és nem a public-ban) él.
-- Érvénytelen/lejárt/lezárt munkamenetre MAGYAR üzenettel RAISE-el — halott
-- munkamenetről a kliens ne kapjon adatot.

CREATE OR REPLACE FUNCTION public.qr_session_lookup(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_session public.upload_sessions%ROWTYPE;
  v_status text;
  v_iratszam text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Hiányzó feltöltési token.'
      USING ERRCODE = '22023';
  END IF;

  -- A kliens SOSEM küld hash-t — itt hash-elünk (kisbetűs hex sha256).
  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_session
    FROM public.upload_sessions
   WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Érvénytelen feltöltési munkamenet — a QR-kód nem érvényes.'
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- EFFEKTÍV állapot: a lejárat mindig az expires_at-ből számol (a status
  -- csak kijelzés/audit). A saját sort itt szándékosan NEM írjuk át — a
  -- rákövetkező RAISE úgyis visszagörgetné (ld. fejléc ⚠️); a tartós
  -- takarítást a sikeres ág söprése végzi.
  v_status := v_session.status;
  IF v_status = 'active' AND v_session.expires_at <= now() THEN
    v_status := 'expired';
  END IF;

  IF v_status = 'expired' THEN
    RAISE EXCEPTION 'A feltöltési munkamenet lejárt — kérj új QR-kódot az asztali gépen.'
      USING ERRCODE = 'P0002';
  ELSIF v_status <> 'active' THEN
    RAISE EXCEPTION 'A feltöltési munkamenet le lett zárva az asztali gépen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Iratszám a kijelzéshez (app-konvenció: {év}/{sorszám}) — törölt tételre
  -- nem adunk ki munkamenet-adatot.
  SELECT i.year::text || '/' || i.sequence_number::text
    INTO v_iratszam
    FROM public.iktato i
   WHERE i.id = v_session.iktato_id
     AND i.deleted = false;

  IF v_iratszam IS NULL THEN
    RAISE EXCEPTION 'A munkamenethez tartozó iktató-tétel már nem elérhető (törölve lett).'
      USING ERRCODE = 'P0002';
  END IF;

  -- Tartós lejárat-takarítás (ez az ág már normálisan tér vissza)
  PERFORM public.qr_sweep_expired_sessions(v_session.congregation_id);

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'iktato_id', v_session.iktato_id,
    'congregation_id', v_session.congregation_id,
    'iratszam', v_iratszam,
    'max_files', v_session.max_files,
    'uploaded_count', v_session.uploaded_count,
    'expires_at', v_session.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.qr_session_lookup(text) IS
  '2026-07-25 F8d: QR-feltöltő munkamenet felderítése NYERS tokennel (a sha256-hash-elés ITT történik). Érvénytelen/lejárt/lezárt munkamenetre magyar üzenettel hibát dob; a sikeres ágon kötegelt lejárat-takarítást futtat. Anon is hívhatja — a token az egyetlen belépő. Visszatérés: {session_id, iktato_id, congregation_id, iratszam, max_files, uploaded_count, expires_at}.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: qr_register_upload — a sikeres storage-feltöltés regisztrálása
-- ─────────────────────────────────────────────────────────────────────────
-- Teljes ÚJRA-validálás (a lookup óta bármi változhatott) + darab-limit +
-- path-őr ('qr-staging/{session_id}/...' KÖTELEZŐ) + a storage-objektum
-- valódi léte + idempotens dupla-regisztráció-kezelés.
--   • A csatolmány-sor congregation/iktato-ja a MUNKAMENET-SORBÓL jön
--     (scope-divergencia hibaosztály elleni védelem).
--   • A MIME/méret elsődlegesen a storage.objects metaadatából (amit a
--     Storage a feltöltéskor ír, és amire a bucket 10 MB + 4 MIME-korlátja
--     már ráfutott) — a telefon állítása csak tartalék.

CREATE OR REPLACE FUNCTION public.qr_register_upload(
  p_token text,
  p_storage_path text,
  p_file_name text,
  p_mime text,
  p_meret bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_session public.upload_sessions%ROWTYPE;
  v_status text;
  v_path text := NULLIF(btrim(COALESCE(p_storage_path, '')), '');
  v_file_name text := left(
    regexp_replace(NULLIF(btrim(COALESCE(p_file_name, '')), ''), '[[:cntrl:]]', '', 'g'),
    200);
  v_mime text := NULLIF(btrim(COALESCE(p_mime, '')), '');
  v_meret bigint := p_meret;
  v_obj_mime text;
  v_obj_meret bigint;
  v_expected_prefix text;
  v_sorszam integer;
  v_csatolmany_id uuid;
  v_existing public.iktato_csatolmany%ROWTYPE;
  v_constraint text;
  v_uploaded integer;
BEGIN
  -- ── Bemenet-validálás ──────────────────────────────────────────────────
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Hiányzó feltöltési token.'
      USING ERRCODE = '22023';
  END IF;

  IF v_path IS NULL THEN
    RAISE EXCEPTION 'Hiányzó storage-útvonal a csatolmány regisztrálásához.'
      USING ERRCODE = '22023';
  END IF;

  IF v_file_name IS NULL THEN
    RAISE EXCEPTION 'Hiányzó fájlnév a csatolmány regisztrálásához.'
      USING ERRCODE = '22023';
  END IF;

  -- ── Munkamenet-validálás sor-lock alatt ────────────────────────────────
  -- A FOR UPDATE sorosítja a párhuzamos regisztrálásokat ugyanarra a
  -- munkamenetre → a darab-limit és a számláló-növelés versenymentes.
  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_session
    FROM public.upload_sessions
   WHERE token_hash = v_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Érvénytelen feltöltési munkamenet — a QR-kód nem érvényes.'
      USING ERRCODE = 'P0002';
  END IF;

  -- EFFEKTÍV állapot (a saját sor jelölését a RAISE visszagörgetné — ld. a
  -- fejléc ⚠️ szakaszát; a tartós takarítás lentebb, a sikeres ágon).
  v_status := v_session.status;
  IF v_status = 'active' AND v_session.expires_at <= now() THEN
    v_status := 'expired';
  END IF;

  IF v_status = 'expired' THEN
    RAISE EXCEPTION 'A feltöltési munkamenet lejárt — kérj új QR-kódot az asztali gépen.'
      USING ERRCODE = 'P0002';
  ELSIF v_status <> 'active' THEN
    RAISE EXCEPTION 'A feltöltési munkamenet le lett zárva az asztali gépen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- A cél-iktató még él (soft-delete guard)
  IF NOT EXISTS (
    SELECT 1 FROM public.iktato i
     WHERE i.id = v_session.iktato_id AND i.deleted = false
  ) THEN
    RAISE EXCEPTION 'A munkamenethez tartozó iktató-tétel már nem elérhető (törölve lett).'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Path-őr: KÖTELEZŐEN 'qr-staging/{session_id}/...' ─────────────────
  v_expected_prefix := 'qr-staging/' || v_session.id::text || '/';
  IF length(v_path) > 1024
     OR length(v_path) <= length(v_expected_prefix)
     OR left(v_path, length(v_expected_prefix)) <> v_expected_prefix THEN
    RAISE EXCEPTION 'Szabálytalan storage-útvonal: a fájlnak a(z) % mappában kell lennie.', v_expected_prefix
      USING ERRCODE = '22023';
  END IF;

  -- ── A storage-objektum valóban létezik (fantom-regisztráció ellen), és
  --    a metaadatából vesszük a MIME-ot/méretet, ha van ──────────────────
  SELECT o.metadata->>'mimetype',
         CASE WHEN (o.metadata->>'size') ~ '^[0-9]+$'
              THEN (o.metadata->>'size')::bigint END
    INTO v_obj_mime, v_obj_meret
    FROM storage.objects o
   WHERE o.bucket_id = 'iktato-csatolmanyok'
     AND o.name = v_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A hivatkozott fájl nem található a tárhelyen — előbb a feltöltésnek kell sikerülnie.'
      USING ERRCODE = 'P0002';
  END IF;

  v_mime := COALESCE(NULLIF(btrim(COALESCE(v_obj_mime, '')), ''), v_mime);
  v_meret := COALESCE(v_obj_meret, v_meret);

  -- A bucket engedélyezett MIME-körével azonos lista (F6: 10 MB, 4 típus).
  IF v_mime IS NOT NULL AND v_mime NOT IN
     ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'Nem engedélyezett fájltípus: % (megengedett: JPEG, PNG, WebP, PDF).', v_mime
      USING ERRCODE = '22023';
  END IF;

  IF v_meret IS NOT NULL AND (v_meret <= 0 OR v_meret > 10485760) THEN
    RAISE EXCEPTION 'Érvénytelen fájlméret: % bájt (megengedett: legfeljebb 10 MB).', v_meret
      USING ERRCODE = '22023';
  END IF;

  -- ── Idempotencia: ugyanaz az objektum már regisztrálva (elveszett válasz
  --    utáni ismételt hívás) → a meglévő sort adjuk vissza, számláló nem nő.
  SELECT * INTO v_existing
    FROM public.iktato_csatolmany
   WHERE storage_path = v_path;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'csatolmany_id', v_existing.id,
      'oldal_sorszam', v_existing.oldal_sorszam,
      'uploaded_count', v_session.uploaded_count,
      'max_files', v_session.max_files,
      'ismetelt', true
    );
  END IF;

  -- ── Darab-limit ────────────────────────────────────────────────────────
  IF v_session.uploaded_count >= v_session.max_files THEN
    RAISE EXCEPTION 'Elérted a munkamenet feltöltési korlátját (% fájl) — az asztali gépen indíts új munkamenetet.', v_session.max_files
      USING ERRCODE = '54000'; -- program_limit_exceeded
  END IF;

  -- ── Csatolmány-sor beszúrása (oldal_sorszam = max+1, korlátos újra-
  --    próbálkozás az F6-os iktato_csatolmany_iktato_oldal_uidx versenyére:
  --    ugyanarra az iratra a desktop is oszthat sorszámot) ────────────────
  FOR v_attempt IN 1..5 LOOP
    BEGIN
      SELECT COALESCE(MAX(oldal_sorszam), 0) + 1
        INTO v_sorszam
        FROM public.iktato_csatolmany
       WHERE iktato_id = v_session.iktato_id;

      INSERT INTO public.iktato_csatolmany (
        iktato_id,
        congregation_id,   -- a MUNKAMENET-SORBÓL (scope-divergencia védelem)
        storage_path,
        file_name,
        mime_type,
        meret_bytes,
        oldal_sorszam,
        created_by_profile_id  -- anon hívásnál NULL — az eredetet a qr-staging út jelzi
      ) VALUES (
        v_session.iktato_id,
        v_session.congregation_id,
        v_path,
        v_file_name,
        v_mime,
        v_meret,
        v_sorszam,
        auth.uid()
      )
      RETURNING id INTO v_csatolmany_id;

      EXIT; -- sikeres beszúrás
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'iktato_csatolmany_storage_path_uidx' THEN
        -- Párhuzamos dupla-regisztráció: a másik hívás nyert → idempotens
        -- visszatérés a meglévő sorral.
        SELECT * INTO v_existing
          FROM public.iktato_csatolmany
         WHERE storage_path = v_path;
        RETURN jsonb_build_object(
          'csatolmany_id', v_existing.id,
          'oldal_sorszam', v_existing.oldal_sorszam,
          'uploaded_count', v_session.uploaded_count,
          'max_files', v_session.max_files,
          'ismetelt', true
        );
      END IF;
      IF v_constraint IS DISTINCT FROM 'iktato_csatolmany_iktato_oldal_uidx' THEN
        RAISE; -- nem sorszám-ütközés → az eredeti hibát adjuk tovább
      END IF;
      IF v_attempt = 5 THEN
        RAISE EXCEPTION 'Nem sikerült a csatolmány oldalsorszámának kiosztása (párhuzamos feltöltés-ütközés) — próbáld újra.'
          USING ERRCODE = '40001';
      END IF;
      -- egyébként: újrapróbálkozás friss max+1-gyel
    END;
  END LOOP;

  -- ── Számláló-növelés (a sor-lock alatt versenymentes) ──────────────────
  UPDATE public.upload_sessions
     SET uploaded_count = uploaded_count + 1
   WHERE id = v_session.id
   RETURNING uploaded_count INTO v_uploaded;

  -- Tartós lejárat-takarítás (ez az ág már normálisan tér vissza)
  PERFORM public.qr_sweep_expired_sessions(v_session.congregation_id);

  RETURN jsonb_build_object(
    'csatolmany_id', v_csatolmany_id,
    'oldal_sorszam', v_sorszam,
    'uploaded_count', v_uploaded,
    'max_files', v_session.max_files,
    'ismetelt', false
  );
END;
$$;

COMMENT ON FUNCTION public.qr_register_upload(text, text, text, text, bigint) IS
  '2026-07-25 F8d: QR-feltöltés regisztrálása. Nyers tokennel validál (hash-elés itt), sor-lock alatt ellenőrzi a darab-limitet, path-őr: KÖTELEZŐEN qr-staging/{session_id}/... alak; a csatolmány-sor congregation/iktato-ja a munkamenet-sorból jön, a MIME/méret a storage.objects metaadatából; uploaded_count++. Idempotens ismételt hívásra (ismetelt=true). Visszatérés: {csatolmany_id, oldal_sorszam, uploaded_count, max_files, ismetelt}.';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC: qr_session_close — kézi lezárás a desktopról (csak authenticated)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.qr_session_close(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.upload_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges a feltöltési munkamenet lezárásához.'
      USING ERRCODE = '28000';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó munkamenet-azonosító.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
    FROM public.upload_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A feltöltési munkamenet nem található.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Saját gyülekezet: a 3-ágú RLS-minta EXPLICIT megismétlése — a függvény
  -- SECURITY DEFINER, ezért az RLS itt nem véd automatikusan.
  IF NOT (
    v_session.congregation_id = public.current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = v_uid
        AND pr.scope = 'congregation'
        AND pr.scope_id = v_session.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR public.current_user_has_global_access()
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság a feltöltési munkamenet lezárásához (más gyülekezet munkamenete).'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotens lezárás: aktív → closed (vagy expired, ha közben lejárt);
  -- már lezárt/lejárt sorra nem hibázunk, csak visszaadjuk az állapotot.
  IF v_session.status = 'active' THEN
    IF v_session.expires_at <= now() THEN
      UPDATE public.upload_sessions SET status = 'expired' WHERE id = v_session.id;
      v_session.status := 'expired';
    ELSE
      UPDATE public.upload_sessions SET status = 'closed' WHERE id = v_session.id;
      v_session.status := 'closed';
    END IF;
  END IF;

  -- Tartós lejárat-takarítás a gyülekezet többi munkamenetére is
  PERFORM public.qr_sweep_expired_sessions(v_session.congregation_id);

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'uploaded_count', v_session.uploaded_count
  );
END;
$$;

COMMENT ON FUNCTION public.qr_session_close(uuid) IS
  '2026-07-25 F8d: QR-feltöltő munkamenet kézi lezárása a desktopról (saját gyülekezet, 3-ágú jogosultság-minta). Idempotens: már lezárt/lejárt sorra nem hibázik; a gyülekezet lejárt sorait is takarítja. Visszatérés: {session_id, status, uploaded_count}.';

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC-jogosultságok — REVOKE ALL + célzott GRANT-ok
--    (a CREATE FUNCTION alapból PUBLIC-nak ad EXECUTE-ot!)
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.qr_sweep_expired_sessions(uuid)
  FROM PUBLIC, anon, authenticated;  -- csak a definer RPC-kből hívható

REVOKE ALL ON FUNCTION public.qr_session_lookup(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_session_lookup(text)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.qr_register_upload(text, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_register_upload(text, text, text, text, bigint)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.qr_session_close(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_session_close(uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. STORAGE — az 'iktato-csatolmanyok' bucket qr-staging útjai
-- ─────────────────────────────────────────────────────────────────────────
-- Út-konvenció: qr-staging/{session_id}/{uuid}-{fájlnév}
-- A bucket-szintű védelem (privát, 10 MB, 4 MIME-típus — F6) a qr-staging
-- utakra is érvényes; a bucketet ez a fájl NEM módosítja.

-- 9a) ANON INSERT — CSAK aktív, nem lejárt munkamenet prefixe alá.
--     FONTOS: a policy-kifejezés a HÍVÓ (anon) jogaival fut, az anonnak
--     viszont SEMMILYEN közvetlen joga nincs az upload_sessions-re (2.
--     szakasz REVOKE) — ezért az EXISTS-t egy SECURITY DEFINER helper
--     végzi (ez a kontraktusbeli „EXISTS az upload_sessions-re" anon-oldali
--     megvalósítása). Közvetlen policy-albekérdezéssel 42501-et kapnánk.
--     A TO anon, authenticated szándékos: ha a telefonon épp be van
--     jelentkezve a felhasználó, a feltöltése authenticated-ként fut, és rá
--     a gyülekezet-prefixes F6-policy nem illeszkedne.
--     Megjegyzés: a policy darabszámot nem tud számolni — a regisztrált
--     sorok limitjét a qr_register_upload őrzi; a nyers spam ellen a rövid
--     TTL + a bucket-limit + a desktopon látható beérkezés-számláló véd
--     (kutatási doksi 1. és 7.9. pont).

CREATE OR REPLACE FUNCTION public.qr_staging_upload_allowed(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (storage.foldername(p_object_name))[1] = 'qr-staging'
     AND EXISTS (
       SELECT 1
       FROM public.upload_sessions us
       WHERE us.id::text = (storage.foldername(p_object_name))[2]
         AND us.status = 'active'
         AND us.expires_at > now()
     );
$$;

COMMENT ON FUNCTION public.qr_staging_upload_allowed(text) IS
  '2026-07-25 F8d: storage-policy helper — igaz, ha az objektum-út qr-staging/{aktív, nem lejárt upload_sessions.id}/ alakú. SECURITY DEFINER, mert az anonnak nincs (és nem is lehet) közvetlen SELECT-joga az upload_sessions-re.';

REVOKE ALL ON FUNCTION public.qr_staging_upload_allowed(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_staging_upload_allowed(text)
  TO anon, authenticated;

DROP POLICY IF EXISTS "iktato_csatolmanyok_qr_insert_anon" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_qr_insert_anon" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'iktato-csatolmanyok'
    AND public.qr_staging_upload_allowed(name)
  );

-- 9b) SELECT — az F6-os policy ÚJRAÍRÁSA a qr-staging ággal bővítve.
--     Eredeti ágak változatlanul (gyülekezet-prefix + profile_roles +
--     global access); ÚJ ág: a qr-staging/% út akkor olvasható, ha van
--     hozzá tartozó iktato_csatolmany-sor (name-egyezés a storage_path-szal)
--     a felhasználó gyülekezetében.

DROP POLICY IF EXISTS "iktato_csatolmanyok_select_own" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      -- (a) eredeti F6-ágak: {congregation_id}/... utak
      (storage.foldername(name))[1] = current_user_congregation_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND pr.scope_id::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
      )
      OR current_user_has_global_access()
      -- (b) ÚJ F8d-ág: qr-staging/% — regisztrált csatolmány a saját
      --     gyülekezetben (name-egyezés a storage_path-szal)
      OR (
        (storage.foldername(name))[1] = 'qr-staging'
        AND EXISTS (
          SELECT 1
          FROM public.iktato_csatolmany cs
          WHERE cs.storage_path = objects.name
            AND (
              cs.congregation_id = current_user_congregation_id()
              OR EXISTS (
                SELECT 1
                FROM public.profile_roles pr2
                WHERE pr2.profile_id = (SELECT auth.uid())
                  AND pr2.scope = 'congregation'
                  AND pr2.scope_id = cs.congregation_id
                  AND pr2.active
                  AND pr2.approval_status = 'approved'
              )
            )
        )
      )
    )
  );

-- 9c) DELETE — az F6-os policy ÚJRAÍRÁSA a qr-staging ággal bővítve.
--     A regisztrált-sor ág mellett a MUNKAMENET-GAZDA ág is kell: a
--     feltöltött, de sosem regisztrált (árva) qr-staging objektumokat a
--     munkamenet gyülekezete tudja takarítani (az F6 7c „árva-takarítás"
--     elvének kiterjesztése — enélkül az árvák csak service-role-lal
--     lennének törölhetők).

DROP POLICY IF EXISTS "iktato_csatolmanyok_delete_own" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      -- (a) eredeti F6-ágak: {congregation_id}/... utak
      (storage.foldername(name))[1] = current_user_congregation_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND pr.scope_id::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
      )
      OR current_user_has_global_access()
      -- (b) ÚJ F8d-ág: qr-staging/% — regisztrált csatolmány a saját
      --     gyülekezetben VAGY a munkamenet a saját gyülekezeté (árva-
      --     takarítás)
      OR (
        (storage.foldername(name))[1] = 'qr-staging'
        AND (
          EXISTS (
            SELECT 1
            FROM public.iktato_csatolmany cs
            WHERE cs.storage_path = objects.name
              AND (
                cs.congregation_id = current_user_congregation_id()
                OR EXISTS (
                  SELECT 1
                  FROM public.profile_roles pr2
                  WHERE pr2.profile_id = (SELECT auth.uid())
                    AND pr2.scope = 'congregation'
                    AND pr2.scope_id = cs.congregation_id
                    AND pr2.active
                    AND pr2.approval_status = 'approved'
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.upload_sessions us
            WHERE us.id::text = (storage.foldername(objects.name))[2]
              AND (
                us.congregation_id = current_user_congregation_id()
                OR EXISTS (
                  SELECT 1
                  FROM public.profile_roles pr3
                  WHERE pr3.profile_id = (SELECT auth.uid())
                    AND pr3.scope = 'congregation'
                    AND pr3.scope_id = us.congregation_id
                    AND pr3.active
                    AND pr3.approval_status = 'approved'
                )
              )
          )
        )
      )
    )
  );

-- (Az F6-os INSERT-policy-hoz [iktato_csatolmanyok_insert_own] NEM nyúlunk:
--  az továbbra is csak a {congregation_id}/{iktato_id}/... utakat engedi
--  authenticated-nek; a qr-staging utakra a 9a policy az egyetlen kapu.
--  UPDATE-policy továbbra sincs: objektum nem írható felül.)

COMMIT;

-- PostgREST schema cache reload (az új tábla/RPC-k azonnali láthatóságához)
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz (a SQL Editor csak az utolsó
-- SELECT-et mutatja). Minden ✅ kell legyen; ❌ = kézi utánanézés kell.
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  'oszlop: upload_sessions.' || column_name AS verify_target,
  data_type || ' / nullable=' || is_nullable
    || COALESCE(' / default=' || column_default, '') AS status
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'upload_sessions'
UNION ALL
SELECT
  'constraint: ' || conname AS verify_target,
  '✅ ' || pg_get_constraintdef(oid) AS status
  FROM pg_constraint
 WHERE conrelid = 'public.upload_sessions'::regclass
UNION ALL
SELECT
  'RLS: upload_sessions' AS verify_target,
  CASE WHEN relrowsecurity THEN '✅ engedélyezve' ELSE '❌ NINCS ENGEDÉLYEZVE' END AS status
  FROM pg_class
 WHERE oid = 'public.upload_sessions'::regclass
UNION ALL
SELECT
  'policy (public): upload_sessions / ' || policyname AS verify_target,
  '✅ cmd=' || cmd || ' / roles=' || array_to_string(roles, ',') AS status
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'upload_sessions'
UNION ALL
SELECT
  'grant: upload_sessions / ' || grantee || ' / ' || privilege_type AS verify_target,
  CASE
    WHEN grantee = 'authenticated' AND privilege_type = 'DELETE'
      THEN '❌ DELETE grant NEM várt (a munkamenet-sor audit-nyom)!'
    ELSE '✅'
  END AS status
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'upload_sessions'
   AND grantee IN ('anon', 'authenticated')
UNION ALL
-- Külön (mindig megjelenő) állítás: az anonnak SEMMILYEN tábla-joga nincs
SELECT
  'grant-őr: upload_sessions / anon = SEMMI' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'upload_sessions'
       AND grantee = 'anon'
  ) THEN '❌ AZ ANONNAK VAN TÁBLA-JOGA — nem várt!'
    ELSE '✅ nincs anon tábla-jog (csak a definer RPC-ken át ér el bármit)' END AS status
UNION ALL
SELECT
  'index: ' || indexname AS verify_target,
  '✅' AS status
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'upload_sessions_congregation_idx',
     'upload_sessions_iktato_idx',
     'upload_sessions_id_text_idx'
   )
UNION ALL
SELECT
  'RPC: ' || p.proname AS verify_target,
  CASE WHEN p.prosecdef THEN '✅ SECURITY DEFINER' ELSE '❌ NEM definer!' END
    || ' / ' || COALESCE(array_to_string(p.proconfig, '; '), '❌ NINCS search_path pin')
    || ' / (' || pg_get_function_identity_arguments(p.oid) || ') → '
    || pg_get_function_result(p.oid) AS status
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
 WHERE n.nspname = 'public'
   AND p.proname IN ('qr_session_lookup', 'qr_register_upload',
                     'qr_session_close', 'qr_staging_upload_allowed',
                     'qr_sweep_expired_sessions')
UNION ALL
SELECT
  'RPC-jog: qr_session_lookup / anon' AS verify_target,
  CASE WHEN has_function_privilege('anon', 'public.qr_session_lookup(text)', 'EXECUTE')
       THEN '✅ hívható (várt)' ELSE '❌ NEM hívható — a mobil-oldal nem működne!' END AS status
UNION ALL
SELECT
  'RPC-jog: qr_register_upload / anon' AS verify_target,
  CASE WHEN has_function_privilege('anon',
         'public.qr_register_upload(text, text, text, text, bigint)', 'EXECUTE')
       THEN '✅ hívható (várt)' ELSE '❌ NEM hívható — a mobil-oldal nem működne!' END AS status
UNION ALL
SELECT
  'RPC-jog: qr_session_close / anon' AS verify_target,
  CASE WHEN has_function_privilege('anon', 'public.qr_session_close(uuid)', 'EXECUTE')
       THEN '❌ ANON hívhatja — NEM várt!' ELSE '✅ nem hívható (várt)' END AS status
UNION ALL
SELECT
  'RPC-jog: qr_session_close / authenticated' AS verify_target,
  CASE WHEN has_function_privilege('authenticated', 'public.qr_session_close(uuid)', 'EXECUTE')
       THEN '✅ hívható (várt)' ELSE '❌ NEM hívható!' END AS status
UNION ALL
SELECT
  'RPC-jog: qr_staging_upload_allowed / anon' AS verify_target,
  CASE WHEN has_function_privilege('anon', 'public.qr_staging_upload_allowed(text)', 'EXECUTE')
       THEN '✅ hívható (a 9a policy-hoz kell)' ELSE '❌ NEM hívható — az anon feltöltés elakadna!' END AS status
UNION ALL
SELECT
  'RPC-jog: qr_sweep_expired_sessions / anon+authenticated' AS verify_target,
  CASE WHEN has_function_privilege('anon', 'public.qr_sweep_expired_sessions(uuid)', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.qr_sweep_expired_sessions(uuid)', 'EXECUTE')
       THEN '❌ kívülről hívható — NEM várt (belső helper)!'
       ELSE '✅ csak a definer RPC-kből hívható (várt)' END AS status
UNION ALL
SELECT
  'policy (storage): iktato_csatolmanyok_qr_insert_anon' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'iktato_csatolmanyok_qr_insert_anon'
      AND with_check ILIKE '%qr_staging_upload_allowed%'
      AND 'anon' = ANY (roles)
  ) THEN '✅ definer-helperrel őrzött anon INSERT'
    ELSE '❌ HIÁNYZIK, nem a helpert használja, vagy nincs anon szerepe' END AS status
UNION ALL
SELECT
  'policy (storage): select_own — qr-staging ág' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'iktato_csatolmanyok_select_own'
      AND qual ILIKE '%qr-staging%'
  ) THEN '✅ a qr-staging ág bekerült'
    ELSE '❌ HIÁNYZIK a qr-staging ág — az F6-os fájl felülírta? Futtasd újra ezt a fájlt!' END AS status
UNION ALL
SELECT
  'policy (storage): delete_own — qr-staging + árva-takarító ág' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'iktato_csatolmanyok_delete_own'
      AND qual ILIKE '%qr-staging%'
      AND qual ILIKE '%upload_sessions%'
  ) THEN '✅ qr-staging + munkamenet-gazda (árva) ág bekerült'
    ELSE '❌ HIÁNYZIK a qr-staging/árva ág — az F6-os fájl felülírta? Futtasd újra ezt a fájlt!' END AS status
UNION ALL
SELECT
  'policy (storage): F6 insert_own érintetlen' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'iktato_csatolmanyok_insert_own'
      AND with_check LIKE '%[2]%'
  ) THEN '✅ megvan (a gyülekezeti feltöltési út változatlan)'
    ELSE '❌ HIÁNYZIK — futott az F6-os migráció?' END AS status
UNION ALL
SELECT
  'bucket: iktato-csatolmanyok' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'iktato-csatolmanyok'
      AND public = false
      AND file_size_limit = 10485760
  ) THEN '✅ privát, 10 MB (F6)' ELSE '❌ HIÁNYZIK vagy eltérő beállítás — futott az F6-os migráció?' END AS status
UNION ALL
SELECT
  'extension: pgcrypto (digest)' AS verify_target,
  CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
        AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'digest')
       THEN '✅ elérhető' ELSE '❌ HIÁNYZIK — a token-hash-elés nem működne!' END AS status
UNION ALL
SELECT
  'digest() feloldása az RPC-k search_path-ából' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'digest' AND n.nspname = 'public'
  ) THEN '✅ public.digest() létezik'
    WHEN EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'digest' AND n.nspname = 'extensions'
  ) THEN '✅ extensions.digest() — az RPC-k search_path-ában az extensions is benne van'
    ELSE '❌ NINCS digest() sem a public, sem az extensions sémában!' END AS status
ORDER BY verify_target;
