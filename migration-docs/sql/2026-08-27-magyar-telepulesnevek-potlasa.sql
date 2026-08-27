-- ============================================================================
-- MAGYAR TELEPÜLÉSNEVEK PÓTLÁSA a cím-törzsben (2026-08-27)
--
-- ⛔ MI DERÜLT KI ÉLESBEN
-- ──────────────────────
-- A kétnyelvű elérhetőség-blokk él, de a MAGYAR cím valójában nem magyar:
--     magyar sor:  Parohiei 214, 527050 Brateş, Kovászna megye
--     román sor:   Parohiei 214, 527050 Brateş, jud. Covasna
-- A megye rendben van (Kovászna / Covasna), a TELEPÜLÉS viszont mindkét
-- sorban románul áll, mert az `adrlocality.name_hu` üres, és a felület
-- becsületesen a beírt `congregations.varos` szabad szövegre esik vissza.
--
-- ⚠️ EZT AZ ELŐZŐ FELMÉRÉSEM NEM VETTE ÉSZRE: az ÍTÉLET-sora csak a
--    `name_ro`-t ellenőrizte, a `name_hu`-t nem — ezért „✅ teljes"-t jelentett.
--    Egy félig ellenőrzött kapu rosszabb a nyitottnál: hamis biztonságot ad.
--    A felmérő javítva; ez a fájl az ADATOT pótolja.
--
-- ⚠️ SEMMILYEN NEVET NEM TALÁLUNK KI. Ez a fájl alapból CSAK OLVAS: megmutatja,
--    mely települések magyar neve hiányzik. A pótló UPDATE ki van kommentezve,
--    és NEKED kell beleírnod a neveket — egy találgatott helységnév egy
--    hivatalos gyülekezeti oldalon rosszabb, mint a hiánya.
--
-- ⚠️ NE FUTTASD EGYBEN — a Supabase editor csak az utolsó rácsot mutatja.
--    Jelöld ki az 1. blokkot → Run, aztán a 2.-at.
-- ============================================================================


-- ── 1. Mekkora a hiány? (országos kép) ─────────────────────────────────────
SELECT '1. Cím-törzs teljessége' AS szakasz, mit, kitoltott, osszes,
       round(100.0 * kitoltott / NULLIF(osszes, 0), 1) AS szazalek
FROM (
  SELECT 'adrlocality.name_hu' AS mit,
         count(*) FILTER (WHERE NULLIF(btrim(name_hu), '') IS NOT NULL) AS kitoltott,
         count(*) AS osszes
  FROM public.adrlocality
  UNION ALL
  SELECT 'adrlocality.name_ro',
         count(*) FILTER (WHERE NULLIF(btrim(name_ro), '') IS NOT NULL), count(*)
  FROM public.adrlocality
  UNION ALL
  -- Ami TÉNYLEG számít: azok a települések, ahol van gyülekezet.
  SELECT 'adrlocality.name_hu — CSAK ahol van gyülekezet',
         count(*) FILTER (WHERE NULLIF(btrim(l.name_hu), '') IS NOT NULL), count(*)
  FROM public.adrlocality l
  WHERE EXISTS (
    SELECT 1 FROM public.congregations c
    WHERE c.adrlocality_id = l.id AND c.status = 'active'
  )
) AS t
ORDER BY mit;


-- ── 2. Melyik gyülekezet települése hiányzik magyarul? ─────────────────────
--     Ez a fájl utolsó OLVASÓ utasítása — ezt látod, ha egyben futtatod.
--     A `javasolt_nev` CSAK TIPP a gyülekezet magyar nevéből; ELLENŐRIZD,
--     mielőtt bármit beírnál. (A „-i" képző levágása nem mindig helyes:
--     pl. „Kolozsvári" → „Kolozsvár" jó, de sok név nem így képződik.)
SELECT '2. Hiányzó magyar településnév' AS szakasz,
       l.id AS adrlocality_id,
       l.name AS torzs_neve,
       l.name_ro AS roman_nev,
       c.nev_hu AS gyulekezet,
       c.varos AS beirt_varos,
       CASE WHEN c.nev_hu ~ '^[^ ]+i ' THEN
         regexp_replace(split_part(c.nev_hu, ' ', 1), 'i$', '')
       END AS javasolt_nev_TIPP
FROM public.adrlocality l
JOIN public.congregations c ON c.adrlocality_id = l.id
WHERE c.status = 'active'
  AND NULLIF(btrim(l.name_hu), '') IS NULL
ORDER BY c.nev_hu;


-- ============================================================================
-- 3. PÓTLÁS — KI VAN KOMMENTEZVE. Töltsd ki, majd vedd ki a kommentet.
--
-- ⚠️ Az `adrlocality` ORSZÁGOS törzstábla: amit ide írsz, MINDEN gyülekezetre
--    hat, amelyik ehhez a településhez van kötve. Ezért csak biztos nevet írj
--    be, és soronként — tömeges, generált fordítás itt TILOS.
--
-- ⚠️ A `WHERE … name_hu IS NULL` feltétel benne marad: egy MÁR kitöltött
--    nevet ez a szkript nem írhat felül.
-- ============================================================================

-- UPDATE public.adrlocality
--    SET name_hu = 'Barátos',
--        review_source = 'kezi-potlas-2026-08-27'
--  WHERE id = <ide az 1. lekérdezésből az adrlocality_id>
--    AND NULLIF(btrim(name_hu), '') IS NULL;


-- ── 4. ELLENŐRZÉS a pótlás után (futtasd az UPDATE UTÁN) ───────────────────
-- SELECT '4. Pótlás után' AS szakasz,
--        c.nev_hu AS gyulekezet,
--        l.name_hu AS telepules_hu,
--        l.name_ro AS telepules_ro,
--        i.cim_hu,
--        i.cim_ro,
--        CASE WHEN i.cim_hu IS DISTINCT FROM i.cim_ro
--             THEN '✅ a két nyelv tényleg eltér'
--             ELSE '⚠️ még mindig azonos' END AS allapot
-- FROM public.congregations c
-- JOIN public.public_sites ps ON ps.congregation_id = c.id AND ps.is_published
-- LEFT JOIN public.adrlocality l ON l.id = c.adrlocality_id
-- LEFT JOIN LATERAL public.public_site_identitas(ps.slug) i ON true
-- ORDER BY c.nev_hu;
