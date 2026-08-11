-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — CHANGELOG-JELÖLÉSEK: CSILLAGOZÁS + KÉZI „KIKÜLDÖTTNEK JELÖLÉS"
-- Fájl:     migration-docs/sql/2026-08-12-changelog-jelolesek.sql
-- Dátum:    2026-08-12
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
-- Módosít:  EGY új táblát hoz létre. Meglévő adatot NEM ír át és NEM töröl.
--           Egy meglévő RLS-policy-t (system_broadcasts) SZÉLESÍT — lásd SZAKASZ 4.
--
-- ─── MIT OLD MEG ────────────────────────────────────────────────────────────
-- Endre jelzése (2026-08-12): „a FRISSÍTÉSEKNÉL azokat is mutatja hogy nem volt
-- kikuldve amik mar voltak kikuldve! … kerlek lehessen CSILLAGOZNI a
-- fontosabbakat vagy KIKULDOTTNEK JELOLNI."
--
-- A hibát magát KÓD javítja, ehhez SQL nem kell (lásd a CHANGELOG-ot). Ez a
-- tábla a KÉT ÚJ FUNKCIÓT szolgálja ki:
--   (a) CSILLAGOZÁS — melyik frissítés a fontos,
--   (b) KÉZI „KIKÜLDÖTTNEK JELÖLÉS" — a rendszergazda kimondhatja, hogy egy
--       bejegyzés el van intézve, ANÉLKÜL hogy ~495 gyülekezetnek újra
--       kimenne az értesítés és az e-mail. Egy kiküldött e-mailt nem lehet
--       visszahívni; ma az EGYETLEN „megoldás" a valódi újraküldés volt.
--
-- ─── MIÉRT ÚJ TÁBLA, MIÉRT NEM ÚJ OSZLOP A system_broadcasts-ON ─────────────
-- Mert a `system_broadcasts`-ban CSAK kiküldött bejegyzésnek van sora. Egy még
-- ki NEM küldött frissítést nem lehetne megcsillagozni — pedig épp azt akarjuk.
--
-- ─── MIÉRT KÖZÖS ÉS NEM SZEMÉLYES ───────────────────────────────────────────
-- A „kiküldöttnek jelölve" nem ízlés, hanem TÉNYÁLLÍTÁS a rendszer állapotáról.
-- Ha személyes lenne, két rendszergazda ellentmondó képet látna, és ugyanaz a
-- frissítés kétszer menne ki ~495 gyülekezetnek — visszafordíthatatlanul.
-- Ráadásul a valódi kiküldés (`system_broadcasts`) ÚGYIS közös: egy személyes
-- réteg mellé téve a felület két, egymásnak ellentmondó logikát mutatna.
-- A csillag ugyanígy: a hírlevél TARTALMÁT rendezi (mi kerüljön előre) — közös
-- szerkesztői döntés, nem magánjegyzet.
-- KÖZÖS, DE ELSZÁMOLTATHATÓ: a tábla tárolja, KI és MIKOR jelölte, és a felület
-- ezt kiírja („Kiemelte: Szőcs Endre · 2026-08-12"). Ha később mégis kellene
-- személyes csillag, egy (kulcs, user_id) kompozit kulcsú MÁSODIK tábla
-- hozzátehető anélkül, hogy ez változna.
--
-- ─── A JELÖLÉS VISSZAVONHATÓ ────────────────────────────────────────────────
-- A sor törölhető (`DELETE`), és a felületen is van „Jelölés visszavonása".
-- Enélkül ugyanabba a csapdába sétálnánk, mint amit most javítunk: egy
-- állapot, amit a rendszer felvesz, de levenni nem tud.
--
-- ─── VISSZAVONÁS (rollback) ─────────────────────────────────────────────────
-- A táblát eldobni CSAK akkor szabad, ha a felület is visszaáll. A parancs:
--   -- DROP TABLE IF EXISTS public.changelog_jelolesek;
-- (A kód FAIL-SOFT: ha a tábla nincs meg, a Frissítések oldal ugyanúgy működik,
--  csak a csillag és a kézi jelölés nem érhető el — nem hasal el.)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── SZAKASZ 0 — ELŐFELTÉTEL (fail-closed) ──────────────────────────────────
-- Ha ez NEM a Kartotéka éles adatbázisa, itt megállunk, mielőtt bármit írnánk.
DO $szakasz0$
BEGIN
  IF to_regclass('public.system_broadcasts') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.system_broadcasts tábla. Ez nem a Kartotéka éles adatbázisa, vagy a 2026-04-17-system-broadcasts.sql még nem futott le.';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'MEGÁLLTAM: nincs public.profiles tábla.';
  END IF;
  IF to_regclass('public.profile_roles') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.profile_roles tábla. Az új RLS-policy-nak profile_roles-lába van; enélkül a policy némán senkit nem engedne be.';
  END IF;
  RAISE NOTICE 'SZAKASZ 0 rendben — system_broadcasts, profiles és profile_roles megvan.';
END
$szakasz0$;

-- ─── SZAKASZ 1 — A TÁBLA ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.changelog_jelolesek (
  -- A CHANGELOG-bejegyzés kulcsa (`<!-- key: ... -->`), ugyanaz az érték, ami a
  -- system_broadcasts.release_changelog_key mezőbe kerül kiküldéskor.
  release_changelog_key   text PRIMARY KEY,

  -- (a) CSILLAG
  kiemelt                 boolean NOT NULL DEFAULT false,
  kiemelte                uuid,
  kiemelve_at             timestamptz,

  -- (b) KÉZI „KIKÜLDÖTTNEK JELÖLVE"
  kikuldottnek_jelolve_at timestamptz,
  kikuldottnek_jelolte    uuid,

  -- Szabad szöveg: MIÉRT jelölte kiküldöttnek („e-mailben már elment", stb.)
  megjegyzes              text,

  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- A kulcs alakja kötött: kisbetű, szám, kötőjel. Így egy elgépelt/ékezetes
  -- kulcs itt AZONNAL elbukik, nem hetekkel később, néma nem-egyezésként.
  CONSTRAINT changelog_jelolesek_kulcs_alak_check
    CHECK (release_changelog_key ~ '^[a-z0-9-]+$'),

  -- Elszámoltathatóság: ha kiemelt, legyen időbélyeg is.
  CONSTRAINT changelog_jelolesek_kiemelt_ido_check
    CHECK (kiemelt = false OR kiemelve_at IS NOT NULL)
);

COMMENT ON TABLE public.changelog_jelolesek IS
  '2026-08-12: KÖZÖS (nem személyes) kézi jelölések a docs/CHANGELOG.md bejegyzésein: csillag (kiemelt) és „kézzel kiküldöttnek jelölve". Az utóbbi NEM valódi kiküldés — a felület külön ikonnal és külön szöveggel mutatja, különben megint valótlant állítana.';
COMMENT ON COLUMN public.changelog_jelolesek.kikuldottnek_jelolve_at IS
  '2026-08-12: a rendszergazda KÉZZEL mondta ki, hogy ez a bejegyzés el van intézve. Alternatívája a valódi újraküldés lenne, ami ~495 gyülekezetnek ismét kimenne — visszafordíthatatlanul.';
COMMENT ON COLUMN public.changelog_jelolesek.megjegyzes IS
  '2026-08-12: MIÉRT lett kézzel jelölve. Szabad szöveg, a felület kiírja a jelölő neve mellett.';

-- ─── SZAKASZ 2 — INDEX ──────────────────────────────────────────────────────
-- A felület két kérdést tesz fel: „mi a kiemelt?" és „mi van kézzel jelölve?".
-- Mindkettő ritka igaz-érték egy kicsi táblán → részleges index.
CREATE INDEX IF NOT EXISTS changelog_jelolesek_kiemelt_idx
  ON public.changelog_jelolesek (kiemelve_at DESC)
  WHERE kiemelt;
CREATE INDEX IF NOT EXISTS changelog_jelolesek_kezi_idx
  ON public.changelog_jelolesek (kikuldottnek_jelolve_at DESC)
  WHERE kikuldottnek_jelolve_at IS NOT NULL;

-- ─── SZAKASZ 3 — JOGOK + RLS ────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.changelog_jelolesek TO authenticated;
ALTER TABLE public.changelog_jelolesek ENABLE ROW LEVEL SECURITY;

-- ⚠️ AZ ÚJ POLICY-NAK KÉT LÁBA VAN.
-- A projekt rögzített hibaosztálya, hogy a policy-k a RÉGI skalár
-- `profiles.role` mezőre épülnek, miközben a jogosultságok az 5. körben
-- átköltöztek a `profile_roles` táblába. Egy skalár-lábú policy NÉMÁN üres
-- listát ad — és a felület azt „nincs adat"-ként mutatja.
DROP POLICY IF EXISTS changelog_jelolesek_admin_access ON public.changelog_jelolesek;
CREATE POLICY changelog_jelolesek_admin_access
  ON public.changelog_jelolesek
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('admin', 'egyhazkeruleti_admin')
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.role IN ('admin', 'egyhazkeruleti_admin')
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
  );

-- ─── SZAKASZ 4 — A MEGLÉVŐ system_broadcasts POLICY UGYANEZEN A LÁBON ───────
-- ⚠️ EZ A SZAKASZ A BEJELENTETT HIBA EGYIK LEHETSÉGES GYÖKÉR-OKÁT SZÜNTETI MEG.
-- A 2026-04-17-es policy KIZÁRÓLAG a skalár `profiles.role`-t nézi. Ha a te
-- profilodon ez a mező üres vagy más lett (mert a szerepkör a profile_roles
-- táblába költözött), akkor a `system_broadcasts` MINDEN olvasása üres listát ad
-- — és a Frissítések oldalon MINDEN bejegyzés „Még nincs kiküldve"-t mutat.
-- A policy itt SZÉLESEDIK (profile_roles-láb), NEM szűkül: aki eddig bejutott,
-- ezután is bejut.
DO $szakasz4$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_broadcasts'
      AND policyname = 'system_broadcasts_admin_access'
  ) THEN
    EXECUTE $ddl$
      DROP POLICY system_broadcasts_admin_access ON public.system_broadcasts;
    $ddl$;
    RAISE NOTICE 'SZAKASZ 4 — a régi, skalár-lábú system_broadcasts policy eldobva.';
  END IF;

  EXECUTE $ddl$
    CREATE POLICY system_broadcasts_admin_access
      ON public.system_broadcasts
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'
            AND p.role IN ('admin', 'egyhazkeruleti_admin')
        )
        OR EXISTS (
          SELECT 1 FROM public.profile_roles pr
          WHERE pr.profile_id = auth.uid()
            AND pr.role IN ('admin', 'egyhazkeruleti_admin')
            AND pr.active = true
            AND pr.approval_status = 'approved'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'
            AND p.role IN ('admin', 'egyhazkeruleti_admin')
        )
        OR EXISTS (
          SELECT 1 FROM public.profile_roles pr
          WHERE pr.profile_id = auth.uid()
            AND pr.role IN ('admin', 'egyhazkeruleti_admin')
            AND pr.active = true
            AND pr.approval_status = 'approved'
        )
      );
  $ddl$;
  RAISE NOTICE 'SZAKASZ 4 rendben — a system_broadcasts policy-nak mostantól profile_roles-lába is van.';
END
$szakasz4$;

-- ─── SZAKASZ 5 — ZÁRÓ ŐRSZEM (a COMMIT ELŐTT) ───────────────────────────────
-- Ha bármi nem úgy sikerült, ahogy kell, INKÁBB NE LEGYEN SEMMI, mint egy
-- félkész tábla nyitott jogokkal.
DO $orszem$
DECLARE
  v_policy_db     integer;
  v_sb_policy_db  integer;
  v_grant_db      integer;
  v_rls           boolean;
BEGIN
  IF to_regclass('public.changelog_jelolesek') IS NULL THEN
    RAISE EXCEPTION 'ŐRSZEM: a changelog_jelolesek tábla nem jött létre.';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.changelog_jelolesek'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'ŐRSZEM: a changelog_jelolesek táblán NINCS bekapcsolva az RLS. Sorszintű védelem nélkül ez a tábla nem maradhat.';
  END IF;

  SELECT count(*) INTO v_policy_db
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'changelog_jelolesek';
  IF v_policy_db < 1 THEN
    RAISE EXCEPTION 'ŐRSZEM: RLS be van kapcsolva, de NINCS policy a changelog_jelolesek táblán — így senki nem érné el.';
  END IF;

  SELECT count(*) INTO v_sb_policy_db
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'system_broadcasts'
    AND policyname = 'system_broadcasts_admin_access'
    AND qual LIKE '%profile_roles%';
  IF v_sb_policy_db < 1 THEN
    RAISE EXCEPTION 'ŐRSZEM: a system_broadcasts policy-ban nincs profile_roles-láb. A SZAKASZ 4 nem érte el a célját.';
  END IF;

  SELECT count(*) INTO v_grant_db
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'changelog_jelolesek'
    AND grantee = 'authenticated'
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF v_grant_db < 4 THEN
    RAISE EXCEPTION 'ŐRSZEM: hiányzik a GRANT az authenticated szerepnek (találat: %). Enélkül a felület jogosultsági hibát kapna.', v_grant_db;
  END IF;

  RAISE NOTICE 'ZÁRÓ ŐRSZEM rendben — tábla, RLS, policy (2 lábbal) és GRANT a helyén.';
END
$orszem$;

-- ─── SZAKASZ 6 — ELLENŐRZÉS ─────────────────────────────────────────────────
-- ⚠️ A Supabase SQL-szerkesztő CSAK AZ UTOLSÓ utasítás eredményét mutatja,
--    ezért itt EGYETLEN SELECT áll, UNION ALL-lal összefűzve.
SELECT 1 AS n,
       'A) changelog_jelolesek tábla' AS ellenorzes,
       CASE WHEN to_regclass('public.changelog_jelolesek') IS NULL
            THEN 'NINCS' ELSE 'megvan' END AS eredmeny,
       'megvan' AS varhato
UNION ALL
SELECT 2, 'B) sorszintű védelem (RLS) bekapcsolva',
       CASE WHEN (SELECT relrowsecurity FROM pg_class
                   WHERE oid = 'public.changelog_jelolesek'::regclass)
            THEN 'igen' ELSE 'NEM' END,
       'igen'
UNION ALL
SELECT 3, 'C) policy a changelog_jelolesek táblán',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'changelog_jelolesek'),
       '1'
UNION ALL
SELECT 4, 'D) jogok az authenticated szerepnek',
       (SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'changelog_jelolesek'
           AND grantee = 'authenticated'),
       'DELETE, INSERT, SELECT, UPDATE'
UNION ALL
SELECT 5, 'E) system_broadcasts policy: van-e profile_roles-láb',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'system_broadcasts'
                 AND policyname = 'system_broadcasts_admin_access'
                 AND qual LIKE '%profile_roles%')
            THEN 'igen' ELSE 'NEM' END,
       'igen — enélkül a skalár profiles.role dönt egyedül, és az némán üres listát adhat'
UNION ALL
SELECT 6, 'F) meglévő jelölések száma',
       (SELECT count(*)::text FROM public.changelog_jelolesek),
       '0 az első futtatáskor'
ORDER BY 1;

COMMIT;
