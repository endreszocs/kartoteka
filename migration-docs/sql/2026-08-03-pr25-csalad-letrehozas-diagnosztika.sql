-- ============================================================================
-- PR-25 DIAGNOSZTIKA (2026-08-03) — „Az új családi karton létrehozása nem sikerült"
--
-- CSAK OLVAS, semmit nem módosít. A cél: BIZONYÍTANI (nem tippelni), miért
-- utasítja el az adatbázis az új családi karton létrehozását Beder Patrik
-- szülő-összekötésekor.
--
-- Két életszerű magyarázat van, és ez a lekérdezés eldönti, melyik:
--   (A) JOGOSULTSÁG (RLS): a `csalad` tábla szabálya csak a saját gyülekezetet
--       ismeri (profiles.congregation_id), az egyházkerületi hatókört nem.
--   (B) ADAT: a szülőnek nincs érvényes utcája / más gyülekezethez tartozik /
--       hiányzik a születési dátuma stb.
--
-- ⚠️ GYORS ELŐ-TESZT a felületen (30 másodperc): nyisd meg a Tagnyilvántartás
--    → Családok fület. Ha a családok listája ÜRES, az (A) magyarázat felé
--    mutat; ha látod a családokat, akkor (B) a valószínűbb — a 4. pont
--    szerep-emulációs próbája ezt véglegesen eldönti.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl egyben. 5 eredménytábla.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A felhasználói profilok hatóköre (a te fiókod: endreszocs@gmail.com)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  p.id                          AS profil_id,
  p.email,
  p.role                        AS szerep,
  p.status,
  p.congregation_id             AS profil_gyulekezet_skalar,
  c.name                        AS profil_gyulekezet_nev,
  p.district_id                 AS keruleti_hatokor,
  (SELECT string_agg(DISTINCT pr.scope_id::text, ', ')
     FROM public.profile_roles pr WHERE pr.profile_id = p.id) AS profile_roles_scope
FROM public.profiles p
LEFT JOIN public.congregations c ON c.id = p.congregation_id
WHERE p.status = 'active'
ORDER BY p.email;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Beder Patrik és a szülő-jelöltjei — VAN-E ÉRVÉNYES UTCÁJUK, melyik
--    gyülekezethez tartoznak, van-e már aktív családjuk
--    (a gyülekezet-szűrő SZÁNDÉKOSAN nincs benne: így derül ki, ha a szülő
--     más gyülekezetben van vagy nincs gyülekezete)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  'GYERMEK' AS szerep,
  s.id, s.csaladnev || ' ' || s.k_nev AS nev, s.sz_datum,
  s.apjaneve, s.anyjaneve,
  s.c_utcaid,
  (SELECT a.name FROM public.adrstreet a WHERE a.id = s.c_utcaid) AS utca_erveny,
  s.congregation_id,
  (SELECT COUNT(*) FROM public.gyerek g
     JOIN public.csalad c ON c.id = g.id_csalad AND c.isaktiv = true
    WHERE g.id_szemely = s.id) AS aktiv_gyermek_tagsag
FROM public.szemely s
WHERE lower(s.csaladnev) = 'beder' AND lower(s.k_nev) LIKE 'patrik%'

UNION ALL

SELECT
  'SZULO-JELOLT', sz.id, sz.csaladnev || ' ' || sz.k_nev, sz.sz_datum,
  NULL, NULL,
  sz.c_utcaid,
  (SELECT a.name FROM public.adrstreet a WHERE a.id = sz.c_utcaid),
  sz.congregation_id,
  (SELECT COUNT(*) FROM public.csalad c
    WHERE c.isaktiv = true AND (c.id_ferfi = sz.id OR c.id_no = sz.id))
FROM public.szemely sz
WHERE EXISTS (
  SELECT 1 FROM public.szemely ch
  WHERE lower(ch.csaladnev) = 'beder' AND lower(ch.k_nev) LIKE 'patrik%'
    AND (
      lower(COALESCE(ch.apjaneve, '')) = lower(COALESCE(sz.csaladnev, '') || ' ' || COALESCE(sz.k_nev, ''))
      OR lower(COALESCE(ch.anyjaneve, '')) = lower(COALESCE(sz.csaladnev, '') || ' ' || COALESCE(sz.k_nev, ''))
    )
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. A `csalad` RLS-segédfüggvény TÉNYLEGES törzse (itt látszik, hogy a szűk
--    `current_user_congregation_id()` skalárt használja-e)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  pg_get_functiondef('public.csalad_resolves_to_accessible_cong(integer,integer)'::regprocedure) AS csalad_szabaly,
  pg_get_functiondef('public.gyerek_resolves_to_accessible_cong(integer,integer)'::regprocedure) AS gyerek_szabaly;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. DÖNTŐ PRÓBA: a te felhasználód nevében kiértékeljük a szabályokat.
--    ⚠️ Írd át a <PROFIL_ID>-t az 1. pont eredményéből (a sajátod), a
--    <SZULO_ID>-t pedig a 2. pont SZULO-JELOLT sorából!
-- ────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<PROFIL_ID>","role":"authenticated"}';
--   SELECT
--     public.current_user_congregation_id()                         AS lathato_gyulekezet,
--     public.current_user_has_global_access()                       AS globalis_hozzaferes,
--     public.current_user_can_access_congregation('43cff37f-1131-4c79-8082-0e8af61cf40a')
--                                                                   AS baratosi_hozzaferes,
--     public.csalad_resolves_to_accessible_cong(<SZULO_ID>, NULL)   AS csalad_iras_engedelyezett,
--     public.gyerek_resolves_to_accessible_cong(NULL, <GYERMEK_ID>) AS gyerek_iras_engedelyezett;
-- ROLLBACK;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Kiegészítő: van-e olyan aktív családi karton, amelyre a rendszer NEM lát
--    rá a szűk szabály miatt (ha ez nagy szám, az az (A) magyarázatot erősíti)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE c.isaktiv)                                   AS aktiv_csalad_osszesen,
  COUNT(*) FILTER (WHERE c.isaktiv AND c.id_ferfi IS NULL AND c.id_no IS NULL)
                                                                      AS felnott_nelkuli_karton,
  COUNT(*) FILTER (WHERE c.isaktiv AND NOT EXISTS (
    SELECT 1 FROM public.szemely s
    WHERE s.id IN (c.id_ferfi, c.id_no) AND s.congregation_id IS NOT NULL))
                                                                      AS gyulekezet_nelkuli_felnottel
FROM public.csalad c;
