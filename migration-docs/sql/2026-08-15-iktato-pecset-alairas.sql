-- ==========================================================================
-- 2026-08-15 — 24. pont: PECSÉT + ALÁÍRÁS KÉP az iktató-nyomtatványokra
-- ==========================================================================
-- KONTEXTUS (Endre kérése, 7. kör 24. pont): az iktatóban feltölthető PNG
--   PECSÉT és ALÁÍRÁS kép, amelyek a nyomtatott iratokra kerülnek — a pecsét
--   KÖZÉPRE (halványan), az aláírás az aláíró neve/vonala FÖLÉ. Érintett
--   nyomtatványok: iktatópecsét-nyomtatvány, iktatókönyv, iratcsomó-leltár,
--   kiállított igazolások/levelek (certificate-issue-dialog), életút-igazolás.
--
-- TÁROLÁS — a címer (cimer_url) bevált mintája szerint:
--   * a KÉP-FÁJL a meglévő `logos` PUBLIC Storage bucketben él, a
--     `congregations/{congregation_id}/{pecset|alairas}-{timestamp}-{név}`
--     útvonalon (ugyanaz a mappa, mint a címeré → a meglévő storage-policy
--     változtatás nélkül lefedi; ÚJ storage-SQL ezért NEM kell);
--   * a congregations táblára két ÚJ, nullable oszlop kerül:
--     pecset_url + alairas_url (public URL) — NULL = nincs feltöltve, minden
--     nyomtatvány a mai formájában (üres vonal / szaggatott P.H. kör) készül.
--   ⚠️ A `logos` bucket PUBLIC (a címer-precedens miatt): a feltöltött
--     aláírás-kép URL-birtokában bárki által letölthető. Ezt a feltöltő
--     felület nem titkolja; szigorítás (privát bucket + signed URL) külön,
--     a címerrel közös döntést igényelne.
--
-- MIKOR KELL FUTTATNI: a 24. pont PR merge ELŐTT, a Supabase SQL Editorban.
--   Amíg nem fut le:
--     * a „Gyülekezet beállítása" ablak pecsét/aláírás szakasza HANGOS magyar
--       hibával erre a fájlra mutat (fail-closed),
--     * a nyomtatványok viszont NÉMÁN kép nélkül, a mai formájukban készülnek
--       (a getCongregationHeader a két oszlopot KÜLÖN, elnyelt hibájú
--       lekérdezésben olvassa — a kiállító emiatt nem törhet el).
--
-- ADATMIGRÁCIÓ: NINCS — két új nullable oszlop, backfill nem kell.
--
-- MENTÉS-BESOROLÁS: ÚJ TÁBLA NINCS → új backup_table_policy sor sem kell;
--   a congregations tábla már besorolt (a verifikáció ellenőrzi, hogy tényleg
--   az-e — ha ❌-et adna, a napi mentés amúgy is hangosan állna).
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + GRANT (additív) — biztonságos
--   ismételt futtatás.
--
-- FÜGGŐSÉGEK (már élesben vannak):
--   * public.congregations (cimer_url minta)
--   * `logos` public Storage bucket + a congregations/… feltöltési policy
--     (a címer-feltöltés bizonyítja, hogy él)
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Az új oszlopok — a cimer_url mintájára (nullable text, public URL)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS pecset_url text;

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS alairas_url text;

COMMENT ON COLUMN public.congregations.pecset_url IS
  '2026-08-15 (24. pont): a gyülekezet hivatalos pecsétjének képe (PNG/WEBP, logos bucket, public URL) — az iktató-nyomtatványok KÖZEPÉRE kerül, halványan. NULL = nincs feltöltve, a nyomtatványok a korábbi formájukban készülnek.';
COMMENT ON COLUMN public.congregations.alairas_url IS
  '2026-08-15 (24. pont): a lelkipásztori aláírás képe (PNG/WEBP, logos bucket, public URL) — az iktató-nyomtatványokon az aláíró neve/vonala FÖLÉ kerül. NULL = üres aláírás-vonal. ⚠️ A logos bucket public: az URL birtokában a kép bárki által letölthető (a címer-precedens).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. GRANT — additív oszlop-szintű UPDATE. Ha a congregations táblán
--    tábla-szintű UPDATE grant él (a setup-mentés ma is user-tokennel ír),
--    ez redundáns és ártalmatlan; ha valahol oszlop-szintűre szigorodna,
--    e nélkül az új oszlopok némán írhatatlanok lennének (fail-closed
--    gondolkodás: inkább explicit engedély, mint csendes 42501).
-- ─────────────────────────────────────────────────────────────────────────

GRANT UPDATE (pecset_url, alairas_url) ON public.congregations TO authenticated;

COMMIT;

-- PostgREST schema cache reload (az új oszlopok azonnali láthatóságához —
-- e nélkül a „could not find column in schema cache" hiba jönne az appból)
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz (a SQL Editor csak az utolsó
-- SELECT-et mutatja). Minden ✅ kell legyen; ❌ = kézi utánanézés kell.
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  'oszlop: congregations.' || c.column_name AS verify_target,
  CASE WHEN c.is_nullable = 'YES' AND c.data_type = 'text'
       THEN '✅ létezik (nullable text)'
       ELSE '❌ VÁRATLAN típus: ' || c.data_type || ' / nullable=' || c.is_nullable END AS status
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name = 'congregations'
   AND c.column_name IN ('pecset_url', 'alairas_url')
UNION ALL
-- Hiányzó oszlop kimutatása (a fenti ág üres sora önmagában nem tűnne fel)
SELECT
  'oszlop-hiány: congregations.' || t.oszlop AS verify_target,
  '❌ HIÁNYZIK — az ALTER TABLE nem futott le' AS status
  FROM (VALUES ('pecset_url'), ('alairas_url')) AS t(oszlop)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'congregations'
      AND c.column_name = t.oszlop
 )
UNION ALL
SELECT
  'grant (oszlop-UPDATE): congregations.' || g.column_name AS verify_target,
  '✅ authenticated írhatja' AS status
  FROM information_schema.role_column_grants g
 WHERE g.table_schema = 'public'
   AND g.table_name = 'congregations'
   AND g.grantee = 'authenticated'
   AND g.privilege_type = 'UPDATE'
   AND g.column_name IN ('pecset_url', 'alairas_url')
UNION ALL
-- Mentés-besorolás: a congregations tábla MÁR besorolt kell legyen
-- (új sor nem kell — új tábla nincs; ez csak őrszem-ellenőrzés).
SELECT
  'mentés-besorolás: congregations' AS verify_target,
  CASE WHEN EXISTS (SELECT 1 FROM public.backup_table_policy WHERE tabla = 'congregations')
       THEN '✅ besorolva (változatlan)'
       ELSE '❌ NINCS besorolva — a napi mentés hangosan áll, külön rendezendő!' END AS status
ORDER BY verify_target;
