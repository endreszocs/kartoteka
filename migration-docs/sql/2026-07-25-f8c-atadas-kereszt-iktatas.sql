-- ==========================================================================
-- 2026-07-25 — F8c: Egyháztag-átadás KERESZT-GYÜLEKEZETI iktató RPC
-- ==========================================================================
-- KONTEXTUS (F8c — átadási igazolás + elfogadó válaszlevél teljes köre):
--
--   (1) Az egyháztag-átadási igazolás kiállításakor az irat a FOGADÓ
--       gyülekezet iktatójába is bekerül BEJÖVŐ iratként, hivatkozással a
--       küldő iktatószámára (external_ref_szam).
--   (2) Amikor a fogadó lelkész az átjelentkezési kérelmet ELBÍRÁLJA,
--       automatikus válaszlevél készül: a fogadónál KIMENŐ iratként iktatva
--       (a szokásos saveFilingEntry úton), ÉS a KÜLDŐ gyülekezet iktatójában
--       BEJÖVŐ iratként megjelenve — ehhez is ez az RPC kell.
--
--   A next_iktato_sequence RPC közvetlen hívása erre NEM alkalmas: annak
--   auth-ellenőrzése a hívó SAJÁT gyülekezetéhez köt (a küldő lelkésze nem
--   tagja a fogadó gyülekezetnek). Ezért ez a SECURITY DEFINER RPC:
--
--     • AUTH-HORGONY: csak akkor iktat idegen gyülekezetbe, ha a hívó
--       gyülekezete és a célgyülekezet között LÉTEZIK friss átjelentkezési
--       kérelem (member_transfer_notifications) az adott személyre —
--       bármelyik irányban (kezdő irat: a küldő hív, a cél a fogadó;
--       válaszlevél: a fogadó hív, a cél a küldő). Friss = pending VAGY az
--       utolsó 30 napban elbírált (a válaszlevél az elfogadás UTÁN megy!).
--     • Cél-évi lezárás-guard (iktato_yearly_closures).
--     • Atomikus sorszám a CÉL gyülekezetre: a next_iktato_sequence
--       pointer-magjának inline megismétlése (INSERT ... ON CONFLICT DO
--       UPDATE ... RETURNING — row-lock sorosítással, 2026-05-17 minta).
--     • INSERT az iktato-ba a célgyülekezet nevében, ugykor_kod='2.'
--       (egyháztagsági ügykör).
--
-- ELŐFELTÉTELEK (mind élesben van):
--   • 2026-04-30d-transfer-notifications.sql  (member_transfer_notifications)
--   • 2026-05-17-iktato-sequence-pointer-rpc.sql (iktato_sequence_pointers)
--   • 2026-05-29-iktato-fazis-3-workflow.sql  (iktato_yearly_closures)
--   • 2026-07-11-f1-iktato-rpc-k.sql          (is_master_admin helper)
--
-- MIKOR KELL FUTTATNI: az F8c PR merge ELŐTT, a Supabase SQL Editorban
--   (az app az új RPC-re támaszkodik — előbb a DB, aztán a deploy).
--
-- IDEMPOTENS: CREATE OR REPLACE — biztonságos ismételt futtatás.
--   Táblát/oszlopot nem módosít.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RPC: kereszt-gyülekezeti iktató-bejegyzés (átadási irat / válaszlevél)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.iktato_atadas_bejegyzes(
  p_szemely_id integer,
  p_target_congregation_id uuid,
  p_direction text,
  p_subject text,
  p_sender_or_recipient text,
  p_kelt date,
  p_external_ref_szam text,
  p_targykivonat text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_direction text := lower(btrim(COALESCE(p_direction, '')));
  v_subject text := NULLIF(btrim(COALESCE(p_subject, '')), '');
  v_sender text := NULLIF(btrim(COALESCE(p_sender_or_recipient, '')), '');
  v_ext_ref text := NULLIF(btrim(COALESCE(p_external_ref_szam, '')), '');
  v_targykivonat text := NULLIF(btrim(COALESCE(p_targykivonat, '')), '');
  v_kelt date := COALESCE(p_kelt, CURRENT_DATE);
  v_year integer;
  v_seq integer;
  v_iktato_id uuid;
BEGIN
  -- ── Alap-validációk ────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges a kereszt-gyülekezeti iktatáshoz.'
      USING ERRCODE = '28000';
  END IF;

  IF p_szemely_id IS NULL OR p_target_congregation_id IS NULL THEN
    RAISE EXCEPTION 'Hiányzó személy-azonosító vagy célgyülekezet a kereszt-iktatáshoz.'
      USING ERRCODE = '22023';
  END IF;

  IF v_direction NOT IN ('incoming', 'outgoing') THEN
    RAISE EXCEPTION 'Érvénytelen iktatási irány: % (megengedett: incoming, outgoing).', p_direction
      USING ERRCODE = '22023';
  END IF;

  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'Az irat tárgya (subject) kötelező a kereszt-iktatáshoz.'
      USING ERRCODE = '22023';
  END IF;

  v_year := EXTRACT(YEAR FROM v_kelt)::integer;

  -- ── 1. AUTH-HORGONY: friss átjelentkezési kérelem a két fél között ─────
  -- A hívó gyülekezet-tagsága: profiles.congregation_id VAGY aktív+approved
  -- congregation-scope profile_roles-sor, role admin/lelkesz (az F1-es
  -- reopen_iktato_year minta kiterjesztése a profile_roles-ágra).
  -- A kérelem BÁRMELYIK irányban horgonyozhat:
  --   a) kezdő átadási irat:  a KÜLDŐ hív → a cél a FOGADÓ (source=hívó, target=cél)
  --   b) elbíráló válaszlevél: a FOGADÓ hív → a cél a KÜLDŐ (target=hívó, source=cél)
  -- Friss = pending VAGY az utolsó 30 napban elbírált (a válaszlevél az
  -- elfogadás/elutasítás UTÁN kerül kiállításra!).
  -- Master admin (god-mode) horgony nélkül is iktathat (F1-precedens:
  -- next_iktato_sequence).
  IF NOT public.is_master_admin() AND NOT EXISTS (
    WITH hivo_gyulekezetei AS (
      SELECT p.congregation_id AS cid
        FROM public.profiles p
       WHERE p.id = v_uid
         AND p.congregation_id IS NOT NULL
         AND p.role IN ('admin', 'lelkesz')
         AND p.deleted_at IS NULL
         AND p.anonymized_at IS NULL
      UNION
      SELECT pr.scope_id AS cid
        FROM public.profile_roles pr
       WHERE pr.profile_id = v_uid
         AND pr.scope = 'congregation'
         AND pr.scope_id IS NOT NULL
         AND pr.role IN ('admin', 'lelkesz')
         AND pr.active = true
         AND pr.approval_status = 'approved'
    )
    SELECT 1
      FROM public.member_transfer_notifications mtn
     WHERE mtn.szemely_id = p_szemely_id
       AND (
         mtn.status = 'pending'
         OR (
           mtn.status IN ('accepted', 'rejected')
           AND mtn.responded_at IS NOT NULL
           AND mtn.responded_at >= now() - interval '30 days'
         )
       )
       AND (
         -- a) a hívó a KÜLDŐ oldal, a cél a FOGADÓ (kezdő átadási irat)
         (
           mtn.target_congregation_id = p_target_congregation_id
           AND mtn.source_congregation_id IN (SELECT cid FROM hivo_gyulekezetei)
         )
         -- b) a hívó a FOGADÓ oldal, a cél a KÜLDŐ (elbíráló válaszlevél)
         OR (
           mtn.source_congregation_id = p_target_congregation_id
           AND mtn.target_congregation_id IN (SELECT cid FROM hivo_gyulekezetei)
         )
       )
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság a kereszt-gyülekezeti iktatáshoz: nem található friss (függő vagy 30 napon belül elbírált) átjelentkezési kérelem ehhez a személyhez (%) a hívó gyülekezete és a célgyülekezet (%) között.',
      p_szemely_id, p_target_congregation_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- A célgyülekezet léte (magyar hibaüzenet a nyers FK-hiba helyett).
  IF NOT EXISTS (
    SELECT 1 FROM public.congregations c WHERE c.id = p_target_congregation_id
  ) THEN
    RAISE EXCEPTION 'A célgyülekezet nem található (%).', p_target_congregation_id
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- ── 2. Cél-évi lezárás-guard ───────────────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM public.iktato_yearly_closures yc
     WHERE yc.congregation_id = p_target_congregation_id
       AND yc.year = v_year
  ) THEN
    RAISE EXCEPTION 'A fogadó gyülekezet iktatókönyve a(z) % évre lezárt — a kereszt-gyülekezeti iktatás nem végezhető el.', v_year;
  END IF;

  -- ── 3. ATOMIKUS SORSZÁM a CÉL gyülekezetre ─────────────────────────────
  -- A next_iktato_sequence pointer-magjának inline megismétlése (2026-05-17
  -- minta): INSERT ... ON CONFLICT DO UPDATE ... RETURNING — a row-szintű
  -- lock sorosítja a párhuzamos hívásokat. A next_iktato_sequence közvetlen
  -- hívása itt NEM jó, mert annak auth-ellenőrzése a hívó SAJÁT
  -- gyülekezetéhez köt.
  INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
  VALUES (p_target_congregation_id, v_year, 1)
  ON CONFLICT (congregation_id, year) DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_seq;

  -- ── 4. INSERT az iktato-ba a célgyülekezet nevében ─────────────────────
  -- external_ref_kelt = v_kelt: a hivatkozott külső irat (a másik fél
  -- levele) kelte megegyezik az iktatott irat keltével — ugyanarról a
  -- dokumentumról van szó, a másik gyülekezet iktatószámával hivatkozva.
  -- beerkezes_ideje: bejövő iratnál a mai nap (elektronikus beérkezés).
  -- userid: a kiállító (hívó) felhasználó — nyomon követhetőség.
  INSERT INTO public.iktato (
    congregation_id,
    year,
    sequence_number,
    direction,
    subject,
    sender_or_recipient,
    kelt,
    beerkezes_ideje,
    external_ref_szam,
    external_ref_kelt,
    targykivonat,
    ugykor_kod,
    deleted,
    userid
  ) VALUES (
    p_target_congregation_id,
    v_year,
    v_seq,
    v_direction,
    v_subject,
    v_sender,
    v_kelt,
    CASE WHEN v_direction = 'incoming' THEN CURRENT_DATE ELSE NULL END,
    v_ext_ref,
    CASE WHEN v_ext_ref IS NOT NULL THEN v_kelt ELSE NULL END,
    v_targykivonat,
    '2.', -- egyháztagsági ügykör (átadás/átjelentkezés)
    false,
    v_uid
  )
  RETURNING id INTO v_iktato_id;

  RETURN jsonb_build_object(
    'year', v_year,
    'sequence_number', v_seq,
    'iktato_id', v_iktato_id
  );
END;
$$;

COMMENT ON FUNCTION public.iktato_atadas_bejegyzes(integer, uuid, text, text, text, date, text, text) IS
  '2026-07-25 F8c: kereszt-gyülekezeti iktató-bejegyzés egyháztag-átadáshoz. Auth-horgony: friss (pending vagy 30 napon belül elbírált) member_transfer_notifications sor a hívó gyülekezete és a cél között, bármelyik irányban; master admin kivétel. Lezárás-guard + atomikus sorszám (pointer-mag inline) + iktato INSERT ugykor_kod=2. Visszatérés: {year, sequence_number, iktato_id}.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Jogosultságok — csak bejelentkezett felhasználó hívhatja
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.iktato_atadas_bejegyzes(integer, uuid, text, text, text, date, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iktato_atadas_bejegyzes(integer, uuid, text, text, text, date, text, text)
  TO authenticated;

COMMIT;

-- ==========================================================================
-- DIAGNOSZTIKA / VERIFIKÁCIÓ (futtasd a COMMIT után, olvasó jellegű)
-- ==========================================================================

-- 1. A függvény létezik, SECURITY DEFINER, rögzített search_path-szal,
--    és a szignatúra a várt:
SELECT
  p.proname AS verify_target,
  CASE WHEN p.prosecdef THEN '✅ SECURITY DEFINER' ELSE '❌ NEM definer' END AS secdef,
  COALESCE(array_to_string(p.proconfig, '; '), '❌ NINCS search_path pin') AS config,
  pg_get_function_identity_arguments(p.oid) AS argumentumok,
  pg_get_function_result(p.oid) AS visszateres
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'iktato_atadas_bejegyzes';
-- Várt: 1 sor — ✅ SECURITY DEFINER, search_path=public, pg_temp,
--   argumentumok: p_szemely_id integer, p_target_congregation_id uuid,
--   p_direction text, p_subject text, p_sender_or_recipient text,
--   p_kelt date, p_external_ref_szam text, p_targykivonat text — jsonb.

-- 2. Az authenticated szerepkör hívhatja, az anon nem:
SELECT
  has_function_privilege(
    'authenticated',
    'public.iktato_atadas_bejegyzes(integer, uuid, text, text, text, date, text, text)',
    'EXECUTE'
  ) AS authenticated_hivhatja, -- várt: true
  has_function_privilege(
    'anon',
    'public.iktato_atadas_bejegyzes(integer, uuid, text, text, text, date, text, text)',
    'EXECUTE'
  ) AS anon_hivhatja; -- várt: false

-- 3. (Opcionális, élesítés utáni gyors betekintés) A legutóbbi kereszt-iktatott
--    átadási bejegyzések a 2. ügykörben, külső hivatkozással:
SELECT i.congregation_id, i.year, i.sequence_number, i.direction,
       i.subject, i.sender_or_recipient, i.external_ref_szam, i.kelt, i.created_at
FROM public.iktato i
WHERE i.ugykor_kod = '2.'
  AND i.deleted = false
  AND i.created_at >= now() - interval '7 days'
ORDER BY i.created_at DESC
LIMIT 20;
