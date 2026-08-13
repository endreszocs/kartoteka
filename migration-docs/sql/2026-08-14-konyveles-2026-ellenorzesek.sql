-- ═══════════════════════════════════════════════════════════════════════════
--  KÖNYVELÉS 2026 ⇄ KARTOTÉKA — ELLENŐRZŐ LEKÉRDEZÉSEK (97 db)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Készült: 2026-08-14 · a docs/KONYVELES-2026-OSSZEHASONLITAS-TERV-2026-08-14.md
--  tervdokumentum kísérője. A számozás ([N.M]) a tervdokumentum területeivel fut.
--
--  ⚠️ KIZÁRÓLAG OLVAS — 0 DDL/DML (gépileg ellenőrizve). Bármikor futtatható.
--  ⚠️ A hivatkozott mind a 27 tábla létezését a repó sémájában visszaellenőriztük.
--
--  HASZNÁLAT: a Supabase SQL Editor egyszerre csak az UTOLSÓ eredményt mutatja,
--  ezért ezt a fájlt NE egyben futtasd — jelöld ki és futtasd le blokkONKÉNT
--  (egy [N.M] kommenttől a következő pontosvesszőig), és az eredményeket
--  másold vissza. A legfontosabbak előre vannak véve az egyes területeken belül.
--
--  Ha egy lekérdezés oszlop-nem-létezik hibát ad (42703), az ÖNMAGÁBAN is lelet:
--  a repó és az éles séma széthúzását bizonyítja — kérlek, azt a hibaüzenetet is
--  küldd vissza.
-- ═══════════════════════════════════════════════════════════════════════════


-- ==========================================================================
--  Pénzügyi vizsgálat — az egyházmegyei/kerületi ellenőrzés szempontrends
-- ==========================================================================

-- [1.1] 1) KÉSZPÉNZ-PLAFON (50 000 lej). Napi záró kassza-egyenleget vezet le a nyitóból + a nem banki (bankszamla_id IS NULL) tételekből. VÁRT EREDMÉNY: NULLA sor. Minden visszaadott sor egy olyan nap, amikor a kasszában 50 000 lejnél több volt — a többletet 3 napon belül bankba kellett volna helyezni (Valtozasok_2026 37-39. sor).
WITH param AS (
  -- <<< ÍRD ÁT a saját gyülekezeted nevére és az ellenőrzött évre >>>
  SELECT c.id AS cid, 2026 AS ev
  FROM public.congregations c
  WHERE c.name ILIKE '%Barátosi%'
),
nyito AS (
  SELECT COALESCE(b.nyito_keszpenz, 0) AS ossz
  FROM public.bealitas b JOIN param p ON b.congregation_id = p.cid
  WHERE b.id = p.ev::text
),
mozgas AS (
  SELECT bf.datum::date AS nap, SUM(COALESCE(bf.osszeg_ron, bf.osszeg)) AS valtozas
  FROM public.befizetes bf JOIN param p ON bf.congregation_id = p.cid
  WHERE bf.bankszamla_id IS NULL AND bf.deleted = false AND bf.stornozott = false
    AND bf.datum >= make_date(p.ev, 1, 1) AND bf.datum <= make_date(p.ev, 12, 31)
  GROUP BY 1
  UNION ALL
  SELECT k.datum::date, -SUM(COALESCE(k.osszeg_ron, k.osszeg))
  FROM public.kiadas k JOIN param p ON k.congregation_id = p.cid
  WHERE k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false
    AND k.datum >= make_date(p.ev, 1, 1) AND k.datum < make_date(p.ev + 1, 1, 1)
  GROUP BY 1
),
napi AS (SELECT nap, SUM(valtozas) AS v FROM mozgas GROUP BY nap),
futо AS (
  SELECT nap,
         ROUND((SELECT ossz FROM nyito) + SUM(v) OVER (ORDER BY nap), 2) AS zaro_keszpenz
  FROM napi
)
SELECT nap, zaro_keszpenz, ROUND(zaro_keszpenz - 50000, 2) AS tullepes_lej
FROM futо
WHERE zaro_keszpenz > 50000
ORDER BY nap;

-- [1.2] 2) NAPI KÉSZPÉNZ-KIFIZETÉSI PLAFONOK. Két szabályt néz egyszerre: egy átvevőnek egy napon max 5 000 lej, és egy napon összesen max 10 000 lej készpénz. VÁRT EREDMÉNY: NULLA sor. Ha jön sor, nézd meg, nem darabolás-e (Valtozasok_2026 53-58. sor: a feldarabolás TILOS).
WITH param AS (
  SELECT c.id AS cid, 2026 AS ev
  FROM public.congregations c
  WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
),
kp AS (
  SELECT k.datum::date AS nap,
         COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs átvevő megadva)') AS atvevo,
         COALESCE(k.osszeg_ron, k.osszeg) AS osszeg
  FROM public.kiadas k JOIN param p ON k.congregation_id = p.cid
  WHERE k.bankszamla_id IS NULL AND k.deleted = false AND k.stornozott = false
    AND k.datum >= make_date(p.ev, 1, 1) AND k.datum < make_date(p.ev + 1, 1, 1)
)
SELECT 'EGY ÁTVEVŐNEK > 5 000 lej / nap' AS szabaly, nap, atvevo,
       ROUND(SUM(osszeg), 2) AS osszeg_lej, COUNT(*) AS tetel_db
FROM kp GROUP BY nap, atvevo HAVING SUM(osszeg) > 5000
UNION ALL
SELECT 'EGY NAPON ÖSSZESEN > 10 000 lej', nap, '(összes átvevő)',
       ROUND(SUM(osszeg), 2), COUNT(*)
FROM kp GROUP BY nap HAVING SUM(osszeg) > 10000
ORDER BY 2, 1;

-- [1.3] 3) DECONT-ELŐLEG PLAFON (1 000 lej / nap / személy). VÁRT EREDMÉNY: NULLA sor. Minden sor egy olyan nap-személy páros, ahol az elszámolásra kiadott készpénzelőleg meghaladta az 1 000 lejt (Valtozasok_2026 44-47. sor).
SELECT d.datum, d.elszamolo_nev,
       ROUND(SUM(d.kapott_eloleg), 2) AS eloleg_osszesen_lej,
       COUNT(*) AS decont_db,
       STRING_AGG(d.sorszam::text, ', ' ORDER BY d.sorszam) AS decont_sorszamok
FROM public.decont d
JOIN public.congregations c ON c.id = d.congregation_id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND d.deleted = false
  AND d.ev = 2026
GROUP BY d.datum, d.elszamolo_nev
HAVING SUM(d.kapott_eloleg) > 1000
ORDER BY d.datum;

-- [1.4] 4) VÉGLEGESÍTETT KÖLTSÉGVETÉS / SZÁMADÁS: megvan-e a presbiteri határozat és az iktatószám. VÁRT EREDMÉNY: ahol a *_finalized igaz, ott MINDEN 'HIÁNYZIK' jelzés nélküli sor. Ha 'HIÁNYZIK' látszik, a nyomtatvány borítóján üres vonal marad. FIGYELEM: még ha ki is van töltve, a jelenlegi kód NEM adja át a nyomtatványnak (budget-reporting.ts:187-189) — ezt csak a kód javítása oldja meg.
SELECT b.id AS ev,
       b.budget_finalized     AS koltsegvetes_veglegesitve,
       b.accounting_finalized AS szamadas_veglegesitve,
       b.leltar_finalized     AS leltar_veglegesitve,
       COALESCE(b.presbiteriumi_hatarozat_szam, 'HIÁNYZIK')  AS kv_hatarozat_szam,
       COALESCE(b.presbiteriumi_hatarozat_datum::text, 'HIÁNYZIK') AS kv_hatarozat_datum,
       COALESCE(b.egyhazkozsegi_iktatoszam, 'HIÁNYZIK')      AS kv_egyhazkozsegi_iktatoszam,
       COALESCE(b.egyhazmegyei_iktatoszam, 'HIÁNYZIK')       AS kv_egyhazmegyei_iktatoszam,
       COALESCE(b.szamadas_hatarozat_szam, 'HIÁNYZIK')       AS szamadas_hatarozat_szam,
       COALESCE(b.szamadas_hatarozat_datum::text, 'HIÁNYZIK') AS szamadas_hatarozat_datum,
       COALESCE(b.szamadas_iktatoszam, 'HIÁNYZIK')           AS szamadas_iktatoszam
FROM public.bealitas b
JOIN public.congregations c ON c.id = b.congregation_id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
ORDER BY b.id DESC;

-- [1.5] 5) LELTÁR-VÉGLEGESÍTÉS: LÉTEZNEK-e egyáltalán élesben a leltar_iktatoszam / leltar_hatarozat_* oszlopok, és van-e bennük bármi. VÁRT EREDMÉNY: az első blokk 3 sort ad (az oszlopok léteznek); a második blokkban a kitoltott_db mindenütt 0 lesz — ez BIZONYÍTJA, hogy a mezőket a kód soha nem írja (a repóban 0 találat rájuk).
SELECT 'oszlop létezik-e' AS vizsgalat, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bealitas'
  AND column_name IN ('leltar_iktatoszam','leltar_hatarozat_szam','leltar_hatarozat_datum',
                      'leltar_finalized','leltar_unlock_requested')
ORDER BY column_name;

-- Külön futtatandó: hány véglegesített leltár-év van adat nélkül?
SELECT b.id AS ev,
       b.leltar_finalized,
       (b.leltar_iktatoszam IS NOT NULL)::int
         + (b.leltar_hatarozat_szam IS NOT NULL)::int
         + (b.leltar_hatarozat_datum IS NOT NULL)::int AS kitoltott_db
FROM public.bealitas b
JOIN public.congregations c ON c.id = b.congregation_id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
ORDER BY b.id DESC;

-- [1.6] 6) KIADÁSI KÍSÉRŐÍV LEFEDETTSÉG. A Változások 2026 (22-23. sor) szerint a kísérőívet a KÉSZPÉNZES ÉS a BANKI kifizetések mellé is ki kell nyomtatni. VÁRT EREDMÉNY: a hianyzo_kiseroiv oszlop mindenütt 0. Ahol nem 0, ott annyi kifizetés van kísérőív nélkül — a vizsgálat a kasszakönyv mellé lefűzött íveket tételesen nézi.
SELECT to_char(k.datum, 'YYYY-MM') AS honap,
       CASE WHEN k.bankszamla_id IS NULL THEN 'készpénz' ELSE 'bank' END AS forras,
       COUNT(*) AS kiadas_db,
       COUNT(kk.id) AS van_kiseroiv,
       COUNT(*) - COUNT(kk.id) AS hianyzo_kiseroiv
FROM public.kiadas k
JOIN public.congregations c ON c.id = k.congregation_id
LEFT JOIN public.kiadasikiseroiv kk ON kk.id_kiadas = k.id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND k.deleted = false AND k.stornozott = false
  AND k.datum >= make_date(2026, 1, 1) AND k.datum < make_date(2027, 1, 1)
  AND COALESCE(k.belso_mozgas_xkey, '') = ''
GROUP BY 1, 2
ORDER BY 1, 2;

-- [1.7] 7) NYUGTATÖMB-FEDETTSÉG. A Penzugyi_vizsgalat 21-24. sora szerint csak az EREK iratterjesztőjéből vett, SORSZÁMOZOTT nyugta használható, és a tömbökről anyagraktárkönyvet kell vezetni. VÁRT EREDMÉNY: a 'tartományon KÍVÜLI' sorok száma 0. Ha van ilyen, olyan nyugtaszámmal állítottak ki bizonylatot, ami egyetlen bejegyzett tömbben sincs benne.
WITH param AS (
  SELECT c.id AS cid FROM public.congregations c
  WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
),
kiadott AS (
  SELECT bf.id, bf.datum, bf.nyugta,
         NULLIF(regexp_replace(bf.nyugta, '\D', '', 'g'), '')::bigint AS nyugta_szam
  FROM public.befizetes bf JOIN param p ON bf.congregation_id = p.cid
  WHERE bf.deleted = false AND bf.stornozott = false
    AND bf.bankszamla_id IS NULL
    AND COALESCE(bf.nyugta, '') <> ''
    AND bf.datum >= make_date(2026, 1, 1) AND bf.datum <= make_date(2026, 12, 31)
),
tombok AS (
  SELECT t.seria, t.szam_kezdet, t.szam_veg
  FROM public.chitanta_tombok t JOIN param p ON t.congregation_id = p.cid
)
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM tombok tb
         WHERE k.nyugta_szam BETWEEN tb.szam_kezdet AND tb.szam_veg
       ) THEN 'tömb-tartományon BELÜL' ELSE 'tartományon KÍVÜLI — ELLENŐRIZD' END AS allapot,
       COUNT(*) AS db,
       MIN(k.nyugta_szam) AS legkisebb,
       MAX(k.nyugta_szam) AS legnagyobb
FROM kiadott k
WHERE k.nyugta_szam IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- [1.8] 8) ÉV VÉGI BÉRLETI KÖVETELÉS — az Extras de cont alapja (Penzugyi_vizsgalat 67-68. sor). Aktív bérleti szerződések, amelyekhez az évben NEM érkezett bevétel. VÁRT EREDMÉNY: minden aktív szerződéshez van bevétel. Amelyikhez nincs, arra kellene aláírt elismerő bizonylatot (Extras de cont confirmat) kérni — ezt a Kartoteka ma nem tudja kiadni.
SELECT bsz.berlo_nev,
       bsz.targy,
       bsz.tipus,
       bsz.jogi_tipus,
       bsz.osszeg AS szerzodeses_osszeg,
       bsz.fizetesi_ciklus,
       bsz.kezdet,
       bsz.vege,
       COALESCE(bev.befolyt, 0) AS befolyt_2026,
       CASE WHEN COALESCE(bev.befolyt, 0) = 0
            THEN 'KÖVETELÉS — Extras de cont kell'
            ELSE 'volt bevétel' END AS allapot
FROM public.berleti_szerzodes bsz
JOIN public.congregations c ON c.id = bsz.congregation_id
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(bf.osszeg_ron, bf.osszeg)) AS befolyt
  FROM public.befizetes bf
  WHERE bf.congregation_id = bsz.congregation_id
    AND bf.deleted = false AND bf.stornozott = false
    AND bf.datum >= make_date(2026, 1, 1) AND bf.datum <= make_date(2026, 12, 31)
    AND bf.forrasa ILIKE '%' || split_part(bsz.berlo_nev, ' ', 1) || '%'
) bev ON true
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND bsz.aktiv = true AND bsz.deleted = false
  AND (bsz.vege IS NULL OR bsz.vege >= make_date(2026, 1, 1))
ORDER BY allapot DESC, bsz.berlo_nev;

-- [1.9] 9) JEGYZŐKÖNYV-TÍPUSOK. A vizsgálat félévi gazdasági bizottsági ellenőrzési jegyzőkönyvet és leltározási jegyzőkönyvet kér (Penzugyi_vizsgalat 18. és 46-48. sor). VÁRT EREDMÉNY: csak 'presbiteri' és 'kozgyulesi' típus jön vissza — ez BIZONYÍTJA, hogy a rendszer nem ismer külön gazdasági/leltározási jegyzőkönyv-típust.
SELECT j.ev,
       j.tipus,
       COUNT(*) AS jegyzokonyv_db,
       COUNT(*) FILTER (WHERE j.allapot = 'draft') AS piszkozat,
       SUM((SELECT COUNT(*) FROM public.jegyzokonyv_hatarozatok h
            WHERE h.jegyzokonyv_id = j.id)) AS hatarozat_db
FROM public.presbiteri_jegyzokonyvek j
JOIN public.congregations c ON c.id = j.congregation_id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
GROUP BY j.ev, j.tipus
ORDER BY j.ev DESC, j.tipus;

-- [1.10] 10) IRATTÁRI LELTÁR ALAPADATAI (Penzugyi_vizsgalat 70. sor: Levéltározás). Megnézi, mennyire van kitöltve az irattári jel, az iratgyűjtő és a lapszám — ezekből a hivatalos Irattari_leltar ív azonnal előállítható lenne. VÁRT EREDMÉNY: a 'hiányzik' oszlopok 0 közelében. Ahol magas, ott az irattári leltár még kitöltés után sem lesz hiteles.
SELECT i.year AS ev,
       COUNT(*) AS iktatott_db,
       COUNT(*) FILTER (WHERE COALESCE(i.irattarijel, '') = '') AS hianyzo_irattari_jel,
       COUNT(*) FILTER (WHERE COALESCE(i.file_folder, '') = '') AS hianyzo_iratgyujto,
       COUNT(*) FILTER (WHERE i.oldalszam IS NULL OR i.oldalszam = 0) AS hianyzo_lapszam,
       COUNT(*) FILTER (WHERE COALESCE(i.ugykor_kod, '') = '') AS hianyzo_ugykor_kod,
       COUNT(*) FILTER (WHERE i.has_duplicate) AS duplikalt_iktatoszam
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND i.deleted = false
GROUP BY i.year
ORDER BY i.year DESC;

-- [1.11] 11) ANYAGRAKTÁR ÉS SEGÉLYSZÁLLÍTMÁNY-NYILVÁNTARTÁS ÁLLAPOTA (Penzugyi_vizsgalat 85-96. sor). Megmutatja, van-e egyáltalán anyag és mozgás, és mennyi mozgásnál hiányzik az iratszám vagy a magyarázat (kitől vettük be / kinek adtuk ki) — ezek nélkül sem NIR, sem bon consum nem építhető rá. VÁRT EREDMÉNY: minden anyagnak van mozgása, és a hiányzó iratszám/magyarázat 0.
SELECT m.nev AS anyag,
       m.mertekegyseg,
       COUNT(mm.id) AS mozgas_db,
       COUNT(*) FILTER (WHERE mm.tipus = 'bevetel') AS bevetel_db,
       COUNT(*) FILTER (WHERE mm.tipus = 'kiadas')  AS kiadas_db,
       COUNT(*) FILTER (WHERE COALESCE(mm.irat_szama, '') = '') AS hianyzo_iratszam,
       COUNT(*) FILTER (WHERE COALESCE(mm.magyarazat, '') = '') AS hianyzo_magyarazat,
       ROUND(COALESCE(SUM(CASE WHEN mm.tipus = 'bevetel' THEN mm.mennyiseg
                               ELSE -mm.mennyiseg END), 0), 3) AS keszlet_egyenleg
FROM public.materials m
JOIN public.congregations c ON c.id = m.congregation_id
LEFT JOIN public.material_movements mm
       ON mm.material_id = m.id AND mm.stornozott = false
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND m.aktiv = true
GROUP BY m.nev, m.mertekegyseg
ORDER BY m.nev;

-- [1.12] 12) BANKI ZÁRÁS ELŐFELTÉTELEI (Penzugyi_vizsgalat 27-30. sor: bankszámlánként külön iratgyűjtő és banknapló; Valtozasok_2026 24-26. sor: a banknapló ÉVES, Jan_Dec változatban nyomtatandó). VÁRT EREDMÉNY: minden aktív számlának van nyitó egyenlege, és minden devizás számlának van december 31-i átértékelése. Hiány esetén a banknapló és a számadás számai nem hitelesek.
SELECT b.bank_neve,
       b.valuta,
       b.iban,
       CASE WHEN ny.nyito_egyenleg_ron IS NULL THEN 'HIÁNYZIK a nyitó egyenleg'
            ELSE ROUND(ny.nyito_egyenleg_ron, 2)::text END AS nyito_2026,
       CASE WHEN b.valuta IS NULL OR b.valuta = 'RON' THEN 'nem devizás'
            WHEN fx.id IS NULL THEN 'HIÁNYZIK az év végi átértékelés'
            ELSE 'átértékelve: ' || fx.arfolyam_datum::text END AS fx_allapot
FROM public.bankszamlak b
JOIN public.congregations c ON c.id = b.congregation_id
LEFT JOIN public.bankszamla_nyito_egyenleg ny
       ON ny.bankszamla_id = b.id AND ny.eve = 2026 AND ny.congregation_id = c.id
LEFT JOIN public.valuta_atert fx
       ON fx.bankszamla_id = b.id AND fx.ev = 2026
      AND fx.congregation_id = c.id AND fx.deleted = false
WHERE c.name ILIKE '%Barátosi%'   -- <<< ÍRD ÁT
  AND b.aktiv = true
ORDER BY b.bank_neve;


-- ==========================================================================
--  Készpénzhasználati törvényi korlátok kikényszerítése (Változások 2026 
-- ==========================================================================

-- [2.1] (a) 50 000 lejes kassza-plafon: mely NAPOKON lépte át a készpénz-egyenleg a törvényi határt? VÁRT EREDMÉNY: 0 sor. Minden visszaadott sor egy olyan nap, amikor a többletet 3 napon belül bankba kellett volna tenni.
-- Kassza = bankszamla_id IS NULL (a rendszer maga is igy szamol: packages/ui-app/src/finance/helpers.ts).
-- A torolt es stornozott tetelek nem szamitanak. Az evi nyito a keszpenz_nyito_egyenleg tablabol jon;
-- ha egy evre nincs nyito sor, 0-val szamol -- ilyenkor az eredmeny ALULBECSULT.
WITH mozgas AS (
  SELECT b.congregation_id, b.datum::date AS nap, COALESCE(b.osszeg_ron, b.osszeg) AS valtozas
    FROM public.befizetes b
   WHERE b.deleted = false AND b.stornozott = false AND b.bankszamla_id IS NULL
  UNION ALL
  SELECT k.congregation_id, k.datum::date, -COALESCE(k.osszeg_ron, k.osszeg)
    FROM public.kiadas k
   WHERE k.deleted = false AND k.stornozott = false AND k.bankszamla_id IS NULL
),
napi AS (
  SELECT congregation_id, nap, EXTRACT(YEAR FROM nap)::int AS ev, SUM(valtozas) AS napi_valtozas
    FROM mozgas
   GROUP BY 1, 2, 3
),
futo AS (
  SELECT n.congregation_id, n.nap, n.ev,
         COALESCE(ny.nyito_egyenleg, 0) + SUM(n.napi_valtozas) OVER (
           PARTITION BY n.congregation_id, n.ev ORDER BY n.nap
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS napi_zaro
    FROM napi n
    LEFT JOIN public.keszpenz_nyito_egyenleg ny
           ON ny.congregation_id = n.congregation_id AND ny.eve = n.ev
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       f.nap,
       ROUND(f.napi_zaro, 2)          AS kassza_zaro_egyenleg,
       ROUND(f.napi_zaro - 50000, 2)  AS tullepes_lej
  FROM futo f
  JOIN public.congregations c ON c.id = f.congregation_id
 WHERE f.napi_zaro > 50000
 ORDER BY f.napi_zaro DESC, f.nap;

-- [2.2] (b) Decont-elolegek napi/szemelyenkenti hatara. VART EREDMENY: 0 sor az 1 000 lejes kuszobre. Ha csak a tullepi_5000 oszlop igaz, akkor is legalabb a Valtozasok 2026 szabalya serul; ha az is igaz, mindket hivatalos forras szerint tullepes tortent.
-- Ket forrast nezunk kulon-kulon (a forras oszlop miatt nincs duplan szamolas):
--   1) a 207.02 (Kiadott hitelek) jogcimre konyvelt KESZPENZES kiadas = az eloleg tenyleges kifizetese
--   2) a decont fejlecebe rogzitett kapott_eloleg
WITH eloleg AS (
  SELECT k.congregation_id,
         k.datum::date AS nap,
         COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs atvevo)') AS szemely,
         'kiadas 207.02 keszpenz'::text AS forras,
         COALESCE(k.osszeg_ron, k.osszeg) AS osszeg
    FROM public.kiadas k
    JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
   WHERE k.deleted = false AND k.stornozott = false
     AND k.bankszamla_id IS NULL
     AND kc.id_szamadasicel = '207.02'
  UNION ALL
  SELECT d.congregation_id,
         d.datum,
         COALESCE(NULLIF(TRIM(d.elszamolo_nev), ''), '(nincs nev)'),
         'decont.kapott_eloleg'::text,
         d.kapott_eloleg
    FROM public.decont d
   WHERE d.deleted = false AND d.kapott_eloleg > 0
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       e.nap, e.szemely, e.forras,
       ROUND(SUM(e.osszeg), 2) AS napi_eloleg,
       (SUM(e.osszeg) > 5000)  AS tullepi_5000
  FROM eloleg e
  JOIN public.congregations c ON c.id = e.congregation_id
 GROUP BY 1, 2, 3, 4
HAVING SUM(e.osszeg) > 1000
 ORDER BY napi_eloleg DESC;

-- [2.3] (c) 5 000 lej/nap/jogi szemely keszpenz-BEVETEL hatara. VART EREDMENY: 0 sor. FIGYELEM: a befizetes tablan nincs CUI/partner-tipus, ezert ez KOZELITES -- a talalatokat kezzel kell atnezni: ha a forras maganszemely volt, ra a 10 000 lejes hatar vonatkozik.
-- Jogi szemelynek azokat a KESZPENZES befizeteseket tekintjuk, amelyek nem taghoz es nem csaladhoz
-- kotottek (id_szemely IS NULL AND id_csalad IS NULL), a forrasa szabad szoveg szerint csoportositva.
-- A belso mozgasokat (3xx kod / belso_mozgas_xkey) kizarjuk.
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       b.datum AS nap,
       COALESCE(NULLIF(TRIM(b.forrasa), ''), '(nincs forras)') AS befizeto,
       ROUND(SUM(COALESCE(b.osszeg_ron, b.osszeg)), 2) AS napi_keszpenz,
       COUNT(*) AS tetelek_szama
  FROM public.befizetes b
  JOIN public.congregations c  ON c.id = b.congregation_id
  LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
 WHERE b.deleted = false AND b.stornozott = false
   AND b.bankszamla_id IS NULL
   AND b.belso_mozgas_xkey IS NULL
   AND COALESCE(bc.id_szamadasicel, '') NOT LIKE '3%'
   AND b.id_szemely IS NULL
   AND b.id_csalad IS NULL
 GROUP BY 1, 2, 3
HAVING SUM(COALESCE(b.osszeg_ron, b.osszeg)) > 5000
 ORDER BY napi_keszpenz DESC;

-- [2.4] (d) Napi OSSZES keszpenzes cegkifizetes > 10 000 lej, illetve EGY partnernek > 5 000 lej egy napon. VART EREDMENY: 0 sor. A ket serto oszlop (serti_5000_partner / serti_10000_napi) megmondja, melyik szabaly borult.
-- Ceg = olyan keszpenzes kiadas, amelynek nincs tag-atvevoje (atvevoid IS NULL) -- a rendszerben ma
-- ez az egyetlen jelzes a jogi szemelyre. A belso mozgasokat (4xx kod / belso_mozgas_xkey) kizarjuk.
WITH kp AS (
  SELECT k.congregation_id,
         k.datum::date AS nap,
         COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs atvevo)') AS partner,
         COALESCE(k.osszeg_ron, k.osszeg) AS osszeg
    FROM public.kiadas k
    JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
   WHERE k.deleted = false AND k.stornozott = false
     AND k.bankszamla_id IS NULL
     AND k.belso_mozgas_xkey IS NULL
     AND k.atvevoid IS NULL
     AND COALESCE(kc.id_szamadasicel, '') NOT LIKE '4%'
),
napi AS (
  SELECT congregation_id, nap, SUM(osszeg) AS napi_ossz FROM kp GROUP BY 1, 2
),
partneres AS (
  SELECT congregation_id, nap, partner, SUM(osszeg) AS partner_ossz, COUNT(*) AS tetelek
    FROM kp GROUP BY 1, 2, 3
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       p.nap, p.partner,
       ROUND(p.partner_ossz, 2) AS egy_partnernek,
       p.tetelek,
       ROUND(n.napi_ossz, 2)    AS napi_osszes_ceg_keszpenz,
       (p.partner_ossz > 5000)  AS serti_5000_partner,
       (n.napi_ossz   > 10000)  AS serti_10000_napi
  FROM partneres p
  JOIN napi n ON n.congregation_id = p.congregation_id AND n.nap = p.nap
  JOIN public.congregations c ON c.id = p.congregation_id
 WHERE p.partner_ossz > 5000 OR n.napi_ossz > 10000
 ORDER BY p.nap DESC, egy_partnernek DESC;

-- [2.5] (e) Egyetlen keszpenzes kiadas 5 000 lej felett. VART EREDMENY: 0 sor a ceg_partner = true esetekben (ott az 5 000 lej feletti reszt kotelezoen banki utalassal kellett volna fizetni). A ceg_partner = false sorok maganszemelyek: rajuk a 10 000 lejes hatar all, es a ber-jogcimek kivetelt kepeznek.
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       k.datum::date AS nap,
       k.iratszam,
       COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs atvevo)') AS partner,
       (k.atvevoid IS NULL) AS ceg_partner,
       kc.id_szamadasicel   AS kod,
       kc.nev               AS jogcim,
       ROUND(COALESCE(k.osszeg_ron, k.osszeg), 2) AS osszeg,
       ROUND(COALESCE(k.osszeg_ron, k.osszeg) - 5000, 2) AS bankba_tartozo_resz
  FROM public.kiadas k
  JOIN public.kiadascel kc  ON kc.id = k.id_kiadascel
  JOIN public.congregations c ON c.id = k.congregation_id
 WHERE k.deleted = false AND k.stornozott = false
   AND k.bankszamla_id IS NULL
   AND k.belso_mozgas_xkey IS NULL
   AND COALESCE(kc.id_szamadasicel, '') NOT LIKE '4%'
   AND COALESCE(k.osszeg_ron, k.osszeg) > 5000
 ORDER BY osszeg DESC;

-- [2.6] (e/pontos) 5 000 lej feletti SZAMLA teljes egeszeben keszpenzben kifizetve -- csak azokra a kiadasokra, amelyekhez ANAF/Oblio-szamla van parositva (itt ismert a szamla teljes osszege). VART EREDMENY: 0 sor.
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       m.invoice_number AS szamlaszam,
       m.invoice_date   AS szamla_datuma,
       m.supplier_name  AS szallito,
       m.supplier_cui   AS szallito_cui,
       ROUND(m.invoice_amount, 2) AS szamla_osszege,
       ROUND(COALESCE(k.osszeg_ron, k.osszeg), 2) AS keszpenzben_fizetve,
       ROUND(m.invoice_amount - 5000, 2) AS bankba_tartozo_resz
  FROM public.oblio_kiadas_match m
  JOIN public.kiadas k        ON k.id = m.kiadas_id
  JOIN public.congregations c ON c.id = m.congregation_id
 WHERE k.deleted = false AND k.stornozott = false
   AND k.bankszamla_id IS NULL
   AND m.invoice_amount > 5000
 ORDER BY m.invoice_amount DESC;

-- [2.7] (f) A kifizetes FELDARABOLASANAK gyanuja: ugyanaz a partner, ugyanaz a nap, legalabb 2 keszpenzes kiadas, egyutt 5 000 lej felett, de EGYENKENT mind 5 000 alatt. VART EREDMENY: 0 sor. Minden talalat kezi atnezest igenyel -- lehet jogos (kulon szamlak), de a szabaly kifejezetten tiltja a darabolast.
WITH kp AS (
  SELECT k.congregation_id,
         k.datum::date AS nap,
         COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs atvevo)') AS partner,
         COALESCE(k.osszeg_ron, k.osszeg) AS osszeg
    FROM public.kiadas k
    JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
   WHERE k.deleted = false AND k.stornozott = false
     AND k.bankszamla_id IS NULL
     AND k.belso_mozgas_xkey IS NULL
     AND COALESCE(kc.id_szamadasicel, '') NOT LIKE '4%'
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       kp.nap, kp.partner,
       COUNT(*)                    AS reszletek_szama,
       ROUND(SUM(kp.osszeg), 2)    AS egyuttes_osszeg,
       ROUND(MAX(kp.osszeg), 2)    AS legnagyobb_reszlet
  FROM kp
  JOIN public.congregations c ON c.id = kp.congregation_id
 GROUP BY 1, 2, 3
HAVING COUNT(*) >= 2
   AND SUM(kp.osszeg) > 5000
   AND MAX(kp.osszeg) <= 5000
 ORDER BY egyuttes_osszeg DESC;

-- [2.8] (g) Maganszemelynek fizetett vagy maganszemelytol elfogadott keszpenz > 10 000 lej/nap/szemely. VART EREDMENY: 0 sor. A ber-jellegu jogcimeket (201.14-201.19) kizartuk, mert az alkalmazott havi fizetese kivetel -- de mivel a rendszerben nincs alkalmazott-nyilvantartas, a kizaras csak kozelites.
WITH mozgas AS (
  SELECT k.congregation_id, k.datum::date AS nap, k.atvevoid AS szemely_id,
         'kifizetes'::text AS irany, COALESCE(k.osszeg_ron, k.osszeg) AS osszeg
    FROM public.kiadas k
    JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
   WHERE k.deleted = false AND k.stornozott = false
     AND k.bankszamla_id IS NULL
     AND k.belso_mozgas_xkey IS NULL
     AND k.atvevoid IS NOT NULL
     AND COALESCE(kc.id_szamadasicel, '') NOT IN
         ('201.14','201.15','201.16','201.17','201.18','201.19')
  UNION ALL
  SELECT b.congregation_id, b.datum, b.id_szemely,
         'bevetel', COALESCE(b.osszeg_ron, b.osszeg)
    FROM public.befizetes b
    LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
   WHERE b.deleted = false AND b.stornozott = false
     AND b.bankszamla_id IS NULL
     AND b.belso_mozgas_xkey IS NULL
     AND b.id_szemely IS NOT NULL
     AND COALESCE(bc.id_szamadasicel, '') NOT LIKE '3%'
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       m.nap, m.irany, m.szemely_id,
       TRIM(COALESCE(sz.csaladnev, '') || ' ' || COALESCE(sz.k_nev, '')) AS szemely,
       ROUND(SUM(m.osszeg), 2) AS napi_keszpenz,
       COUNT(*) AS tetelek_szama
  FROM mozgas m
  JOIN public.congregations c ON c.id = m.congregation_id
  LEFT JOIN public.szemely sz ON sz.id = m.szemely_id
 GROUP BY 1, 2, 3, 4, 5
HAVING SUM(m.osszeg) > 10000
 ORDER BY napi_keszpenz DESC;

-- [2.9] Keszpenzes KOLCSON tilalma: a 107.01 (Kapott hitelek) es a 207.01 (Torlesztett hitelek) jogcimre 2023 novembere ota CSAK banki utalas konyvelheto. VART EREDMENY: 0 sor. (A 107.02 / 207.02 szandekosan kimarad: azok az elszamolasra adott eloleg jogcimei, amiket a rendszer maga is keszpenzben konyvel -- azokat a (b) lekerdezes vizsgalja.)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       'bevetel'::text AS irany,
       b.datum::date   AS nap,
       bc.id_szamadasicel AS kod,
       bc.nev             AS jogcim,
       b.iratszam,
       COALESCE(NULLIF(TRIM(b.forrasa), ''), '(nincs forras)') AS partner,
       ROUND(COALESCE(b.osszeg_ron, b.osszeg), 2) AS osszeg
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  JOIN public.congregations c ON c.id = b.congregation_id
 WHERE b.deleted = false AND b.stornozott = false
   AND b.bankszamla_id IS NULL
   AND bc.id_szamadasicel = '107.01'
UNION ALL
SELECT COALESCE(c.nev_hu, c.name),
       'kiadas',
       k.datum::date,
       kc.id_szamadasicel,
       kc.nev,
       k.iratszam,
       COALESCE(NULLIF(TRIM(k.atvevo), ''), '(nincs atvevo)'),
       ROUND(COALESCE(k.osszeg_ron, k.osszeg), 2)
  FROM public.kiadas k
  JOIN public.kiadascel kc  ON kc.id = k.id_kiadascel
  JOIN public.congregations c ON c.id = k.congregation_id
 WHERE k.deleted = false AND k.stornozott = false
   AND k.bankszamla_id IS NULL
   AND kc.id_szamadasicel = '207.01'
 ORDER BY 3 DESC;

-- [2.10] Adat-lefedettseg meres a jovobeli kikenyszeriteshez: hany keszpenzes kiadasnal ismert egyaltalan a partner tipusa? VART EREDMENY: a cui_ismert es a tag_atvevo aranya egyuttesen kozel 100% kellene legyen ahhoz, hogy a torvenyi korlatokat egyaltalan ki lehessen kenyszeriteni. Ha a nincs_semmi_jelzes arany magas, az bizonyitja, hogy eloszor a rogzito urlapot kell bovitani.
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       EXTRACT(YEAR FROM k.datum)::int AS ev,
       COUNT(*) AS keszpenzes_kiadasok,
       COUNT(*) FILTER (WHERE k.kedvezmenyezett_cui IS NOT NULL
                          AND TRIM(k.kedvezmenyezett_cui) <> '') AS cui_ismert,
       COUNT(*) FILTER (WHERE k.atvevoid IS NOT NULL) AS tag_atvevo,
       COUNT(*) FILTER (WHERE k.atvevoid IS NULL
                          AND (k.kedvezmenyezett_cui IS NULL
                               OR TRIM(k.kedvezmenyezett_cui) = '')) AS nincs_semmi_jelzes,
       ROUND(100.0 * COUNT(*) FILTER (WHERE k.atvevoid IS NULL
                          AND (k.kedvezmenyezett_cui IS NULL
                               OR TRIM(k.kedvezmenyezett_cui) = '')) / NULLIF(COUNT(*), 0), 1)
         AS nincs_semmi_jelzes_szazalek
  FROM public.kiadas k
  JOIN public.congregations c ON c.id = k.congregation_id
  JOIN public.kiadascel kc    ON kc.id = k.id_kiadascel
 WHERE k.deleted = false AND k.stornozott = false
   AND k.bankszamla_id IS NULL
   AND k.belso_mozgas_xkey IS NULL
   AND COALESCE(kc.id_szamadasicel, '') NOT LIKE '4%'
 GROUP BY 1, 2
 ORDER BY 1, 2 DESC;


-- ==========================================================================
--  Lelkészi jelentés — az EGYSZERŰ űrlap és a munkanaplóval EGYBEÉPÍTETT 
-- ==========================================================================

-- [3.1] Kideríti, mely gyülekezeteknek NINCS egyáltalán 2026-os munkanapló-adata. VÁRT EREDMÉNY: ahol a munkanaplo_sor_2026 = 0, ott a lelkészi jelentés 18 hivatalos rubrikája (II.1a, II.2a, II.3a, II.4a, II.6a, II.7a, II.8a, II.9, II.12, II.14, III.1, III.2, III.3, III.5, III.7, III.8, III.10, V.3) automatikusan 0-t fog mutatni — NEM 'nincs adat'-ot. Ha a lista első sorai 0-t mutatnak, a blocker élesben is fennáll. Ha a jelenletet_rogzito_sor jóval kisebb, mint a munkanaplo_sor_2026, akkor az átlagjelenlét-rubrikák (II.1b, II.6b, III.6…) felfelé torzítanak az EREK-számításhoz képest.
-- 1) Van-e egyáltalan 2026-os munkanaplo-adat gyulekezetenkent?
-- A 0-s sorok a "nema nulla" kockazat: ott a jelentes II./III./V.3 rubrikai 0-t kapnak.
SELECT
  c.id                                                          AS congregation_id,
  c.name                                                        AS gyulekezet,
  COUNT(m.id)                                                   AS munkanaplo_sor_2026,
  COUNT(m.id) FILTER (WHERE m.kategoria = 'katekezis')           AS katekezis_sor,
  COUNT(m.id) FILTER (WHERE m.kategoria = 'latogatas')           AS latogatas_sor,
  COUNT(m.id) FILTER (
    WHERE COALESCE(m.jelenlet_osszesen, 0) > 0
       OR COALESCE(m.jelenlet_ferfi, 0)
        + COALESCE(m.jelenlet_no, 0)
        + COALESCE(m.jelenlet_gyermek, 0) > 0
  )                                                             AS jelenletet_rogzito_sor,
  COUNT(m.id) FILTER (WHERE m.napszak IS NULL)                   AS napszak_nelkuli_sor
FROM public.congregations c
LEFT JOIN public.munkanaplo m
       ON m.congregation_id = c.id
      AND m.deleted IS NOT TRUE
      AND LEFT(m.idopont::text, 10) BETWEEN '2026-01-01' AND '2026-12-31'
GROUP BY c.id, c.name
ORDER BY munkanaplo_sor_2026 ASC, c.name;

-- [3.2] Megmutatja, hogy VÉGLEGESÍTETT (aláírt, beküldött) lelkészi jelentések snapshotjában milyen érték áll a munkanapló-alapú rubrikákban, és volt-e mögötte egyáltalán munkanapló-adat. VÁRT EREDMÉNY: minden sorban vagy munkanaplo_sor > 0, vagy a II./III. mezők NULL-ok. Ha van olyan sor, ahol munkanaplo_sor = 0 ÉS a II.1a/III.7/V.3 értéke '0', az bizonyíték arra, hogy már ment ki hamis 0-kkal teli hivatalos nyomtatvány az egyházmegyének.
-- 2) Veglegesitett jelentesek: 0-t irtunk-e ala ures munkanaplo mellett?
SELECT
  c.name                                            AS gyulekezet,
  lj.ev,
  lj.statusz,
  lj.veglegesitve_at,
  (SELECT COUNT(*)
     FROM public.munkanaplo m
    WHERE m.congregation_id = lj.congregation_id
      AND m.deleted IS NOT TRUE
      AND LEFT(m.idopont::text, 10)
          BETWEEN (lj.ev::text || '-01-01') AND (lj.ev::text || '-12-31')
  )                                                 AS munkanaplo_sor,
  lj.snapshot -> 'auto' ->> 'II.1a'                 AS ii_1a_vasarnap_de_alkalom,
  lj.snapshot -> 'auto' ->> 'II.12'                 AS ii_12_urvacsoraosztas,
  lj.snapshot -> 'auto' ->> 'III.1'                 AS iii_1_felnott_bibliaora,
  lj.snapshot -> 'auto' ->> 'III.7'                 AS iii_7_csaladlatogatas,
  lj.snapshot -> 'auto' ->> 'V.3'                   AS v_3_katekezis,
  jsonb_array_length(
    COALESCE(
      (SELECT jsonb_agg(k)
         FROM jsonb_object_keys(COALESCE(lj.felulirasok, '{}'::jsonb)) AS k),
      '[]'::jsonb)
  )                                                 AS felulirasok_db
FROM public.lelkeszi_jelentes lj
JOIN public.congregations c ON c.id = lj.congregation_id
WHERE lj.statusz = 'veglegesitve'
ORDER BY lj.ev DESC, c.name;

-- [3.3] Megméri, mennyi kézi felülírásra kényszerül a lelkész az auto-mezőkben — ez a kettősség hiányának közvetlen ára. VÁRT EREDMÉNY: ideális esetben kevés vagy nulla II./III./V.3 felülírás. Ha egy gyülekezetnél 10-nél több ilyen felülírás van, az azt jelenti, hogy a lelkész gyakorlatilag az EGYSZERŰ űrlapot tölti kézzel, csak sokkal körülményesebben (mezőnkénti ceruza-kattintással) — és a Kartotéka ezt jelenleg nem ismeri fel.
-- 3) Melyik auto-mezot kellett kezzel felulirni? (a kettosseg hianyanak ara)
SELECT
  c.name                    AS gyulekezet,
  lj.ev,
  lj.statusz,
  f.key                     AS felulirt_mezo,
  f.value #>> '{}'          AS beirt_ertek
FROM public.lelkeszi_jelentes lj
JOIN public.congregations c ON c.id = lj.congregation_id
CROSS JOIN LATERAL jsonb_each(COALESCE(lj.felulirasok, '{}'::jsonb)) AS f(key, value)
WHERE f.key LIKE 'II.%'
   OR f.key LIKE 'III.%'
   OR f.key = 'V.3'
ORDER BY c.name, lj.ev DESC, f.key;

-- [3.4] Összeveti a ténylegesen használt munkanapló-jellegeket a hivatalos 37 tételes EREK-lenyílóval. VÁRT EREDMÉNY: csak a Kartotéka 17+8+6 típusa jelenik meg; a hivatalos lista 22 tétele (F. keresztelő, N. keresztelő, F. temetés, N. temetés, Azonos esketés, Vegyes esketés, Keresztelői felkészítő, Jegyesbeszélgetés, Virrasztó, Betegúrvacsora, Presbiteri bibliaóra, Nőszöv. bibliaóra, Házasok bibliaórája, Más bibliaóra 1, Más bibliaóra 2, Digitális alkalmak, Szeretetvendégség, Presbiteri felkészítő, Vasárnapi i.t., Ünnepi i.t., Hétköznapi i.t., valamint a Húsvét/Pünkösd/Karácsony I–III. it.) 0 találatot ad. Ez megerősíti, hogy az egybeépített változat 64 auto-mezőjéből ~30 ma elvi lehetetlenség. A szabad_szoveges oszlop azt mutatja, mennyi sor esik a print-columns.ts fallback-ágába (→ 'Egyéb szolgálat' oszlop → II.9).
-- 4) Milyen jellegek fordulnak elo valojaban, es melyik hivatalos tipus hianyzik?
WITH hasznalt AS (
  SELECT
    COALESCE(NULLIF(TRIM(m.jellege), ''), '(ures)') AS jellege,
    m.kategoria,
    COUNT(*)                                        AS db,
    MIN(LEFT(m.idopont::text, 10))                  AS elso_alkalom,
    MAX(LEFT(m.idopont::text, 10))                  AS utolso_alkalom
  FROM public.munkanaplo m
  WHERE m.deleted IS NOT TRUE
    AND LEFT(m.idopont::text, 10) >= '2025-01-01'
  GROUP BY 1, 2
),
hivatalos(tipus) AS (
  VALUES ('Vasárnapi i.t.'), ('Ünnepi i.t.'), ('Bűnbánati i.t.'), ('Hétköznapi i.t.'),
         ('Úrvacsora templomban'), ('Betegúrvacsora'), ('Felnőtt bibliaóra'),
         ('Ifj. vagy IKE bibliaóra'), ('Presbiteri bibliaóra'), ('Nőszöv. bibliaóra'),
         ('Házasok bibliaórája'), ('Más bibliaóra 1'), ('Más bibliaóra 2'),
         ('F. keresztelő'), ('N. keresztelő'), ('Keresztelői felkészítő'),
         ('F. temetés'), ('N. temetés'), ('Virrasztó'),
         ('Azonos esketés'), ('Vegyes esketés'), ('Jegyesbeszélgetés'),
         ('Digitális alkalmak'), ('Imahét'),
         ('Húsvét I. it.'), ('Húsvét II. it.'), ('Húsvét III. it.'),
         ('Pünkösd I. it.'), ('Pünkösd II. it.'), ('Pünkösd III. it.'),
         ('Karácsony I. it.'), ('Karácsony II. it.'), ('Karácsony III. it.'),
         ('Vallásos ünnepély'), ('Szeretetvendégség'), ('Presbiteri felkészítő'),
         ('Egyéb szolgálat')
)
SELECT
  h.tipus                                    AS hivatalos_erek_tipus,
  COALESCE(u.db, 0)                          AS kartoteka_talalat,
  CASE WHEN u.db IS NULL THEN 'HIANYZIK a Kartotekabol'
       ELSE 'van' END                        AS allapot,
  u.kategoria,
  u.elso_alkalom,
  u.utolso_alkalom
FROM hivatalos h
LEFT JOIN hasznalt u ON u.jellege = h.tipus
ORDER BY (u.db IS NOT NULL), h.tipus;

-- [3.5] Kimutatja azokat a napokat, amikor ugyanabban a napszakban TÖBB istentisztelet volt. VÁRT EREDMÉNY: ha ez a lekérdezés 0 sort ad, a templomlátogatási átlag eltérése nem érinti a gyülekezetet. Ha ad sorokat, akkor a Kartotéka átlaga (II.1b, II.2b) ezeknél a napoknál PONTOSAN FELE (vagy harmada) annak, amit az EREK szabálya előír — a hivatalos súgó (D79/D80) ezt kifejezetten hibaként nevezi meg, és a munkanaplóban erre való a 'de.2' / 'du.2' jelölés, ami a Kartotéka NAPSZAK_OPTIONS listájából hiányzik.
-- 5) Egy napon, egy napszakban tobb istentisztelet? (a de.2 / du.2 problema)
SELECT
  c.name                                                        AS gyulekezet,
  LEFT(m.idopont::text, 10)                                     AS nap,
  COALESCE(m.napszak, CASE WHEN m.du IS TRUE THEN 'du' ELSE 'de' END) AS napszak,
  COUNT(*)                                                      AS alkalom_db,
  SUM(GREATEST(
        COALESCE(m.jelenlet_osszesen, 0),
        COALESCE(m.jelenlet_ferfi, 0)
      + COALESCE(m.jelenlet_no, 0)
      + COALESCE(m.jelenlet_gyermek, 0)))                       AS ossz_jelenlet,
  STRING_AGG(COALESCE(m.jellege, '(ures)'), ' | ' ORDER BY m.id) AS jellegek
FROM public.munkanaplo m
JOIN public.congregations c ON c.id = m.congregation_id
WHERE m.deleted IS NOT TRUE
  AND LEFT(m.idopont::text, 10) BETWEEN '2026-01-01' AND '2026-12-31'
  AND m.jellege IN ('Istentisztelet', 'Igehirdetés', 'Alkalmi istentisztelet',
                    'Esti áhítat', 'Imaóra', 'Úrvacsora')
GROUP BY c.name, 2, 3
HAVING COUNT(*) > 1
ORDER BY c.name, nap;

-- [3.6] Megméri, hány naplózott alkalomnál hiányzik a jelenlét — ez az átlagszámítás EREK-től való eltérésének mértéke. VÁRT EREDMÉNY: jelenlet_nelkuli_alkalom = 0. Minden ilyen sor felfelé torzítja a Kartotéka átlagjelenlét-rubrikáit (II.1b, II.2b, II.3b, II.4b, II.6b, II.7b, II.8b, II.13, III.6), mert a Kartotéka csak a jelenlétet rögzítő alkalmakkal oszt (atlagJelenlet), az EREK-tábla viszont az ÖSSZES alkalommal. Az arany_szazalek oszlop közvetlenül megmondja, hány százalékkal fut el a két szám.
-- 6) Jelenlet nelkuli alkalmak aranya (az atlagszamitas EREK-tol valo elterese)
SELECT
  c.name                                                        AS gyulekezet,
  COUNT(*)                                                      AS osszes_alkalom,
  COUNT(*) FILTER (
    WHERE GREATEST(
            COALESCE(m.jelenlet_osszesen, 0),
            COALESCE(m.jelenlet_ferfi, 0)
          + COALESCE(m.jelenlet_no, 0)
          + COALESCE(m.jelenlet_gyermek, 0)) = 0
  )                                                             AS jelenlet_nelkuli_alkalom,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE GREATEST(
              COALESCE(m.jelenlet_osszesen, 0),
              COALESCE(m.jelenlet_ferfi, 0)
            + COALESCE(m.jelenlet_no, 0)
            + COALESCE(m.jelenlet_gyermek, 0)) = 0
    ) / NULLIF(COUNT(*), 0), 1)                                 AS arany_szazalek
FROM public.munkanaplo m
JOIN public.congregations c ON c.id = m.congregation_id
WHERE m.deleted IS NOT TRUE
  AND m.kategoria = 'szolgalat'
  AND LEFT(m.idopont::text, 10) BETWEEN '2026-01-01' AND '2026-12-31'
GROUP BY c.name
ORDER BY arany_szazalek DESC NULLS LAST;

-- [3.7] Ellenőrzi, hogy a katekézis-alkalmak (V.3 auto-mező) valójában milyen jellegekből állnak össze. VÁRT EREDMÉNY: a hivatalos 163. sor („Hány vallásóra volt az év folyamán?") CSAK a 'Vallásóra' típust kérdezi, a Katekezis lap 1.–5. csoport bontásával. Ha az eredményben a 'Vallásóra' mellett megjelenik az 'Ifjúsági bibliaóra (IKE)', a 'Konfirmáció előkészítő', a 'Gyermek foglalkozás' vagy a 'Hittan' is, az bizonyítja, hogy a V.3 szám a hivatalos rubrikánál MAGASABB — és hogy a gyermekistentisztelet (164. sor) meg a vasárnapi iskola (165. sor) egyáltalán nem választható le.
-- 7) Mibol all ossze a V.3 (katekezis-alkalmak) auto-mezo?
-- A hivatalos EREK 163. sor CSAK a vallasorat kerdezi; a 164/165 kulon rubrika.
SELECT
  c.name                                            AS gyulekezet,
  COALESCE(NULLIF(TRIM(m.jellege), ''), '(ures)')   AS jellege,
  COUNT(*)                                          AS db,
  SUM(COALESCE(m.jelenlet_osszesen, 0)
    + CASE WHEN COALESCE(m.jelenlet_osszesen, 0) = 0
           THEN COALESCE(m.jelenlet_ferfi, 0)
              + COALESCE(m.jelenlet_no, 0)
              + COALESCE(m.jelenlet_gyermek, 0)
           ELSE 0 END)                              AS ossz_resztvevo
FROM public.munkanaplo m
JOIN public.congregations c ON c.id = m.congregation_id
WHERE m.deleted IS NOT TRUE
  AND m.kategoria = 'katekezis'
  AND LEFT(m.idopont::text, 10) BETWEEN '2026-01-01' AND '2026-12-31'
GROUP BY c.name, 2
ORDER BY c.name, db DESC;


-- ==========================================================================
--  Sugo.pdf — a teljes hivatalos könyvelési munkafolyamat (éves + havi ci
-- ==========================================================================

-- [4.1] A hivatalos „zöld cella" hiba megkeresése: van-e olyan könyvelt tétel, aminek nincs érvényes SZÁMADÁSI kódja (bevételnél 1xx, kiadásnál 2xx). VÁRT EREDMÉNY: 0 sor. Minden visszaadott sor egy tétel, ami kimarad a Számadásból, de benne van a kassza/bank egyenlegben — ez okozza a hivatalos 1. sz. hibajelzést.
-- Év és gyülekezet: állítsd át, ha kell.
WITH p AS (SELECT 2026::int AS eve)
SELECT 'befizetes' AS tabla, b.id, b.datum::date AS datum,
       COALESCE(b.osszeg_ron, b.osszeg) AS osszeg_ron,
       sc.id AS szamadasi_kod, b.megjegyzes
FROM public.befizetes b
LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
LEFT JOIN public.szamadasicel  sc ON sc.id = bc.id_szamadasicel
WHERE b.deleted = false
  AND b.stornozott = false
  AND b.belso_mozgas_xkey IS NULL          -- a belső mozgás sosem számadási tétel
  AND b.datum >= make_date((SELECT eve FROM p), 1, 1)
  AND b.datum <= make_date((SELECT eve FROM p), 12, 31)
  AND (sc.id IS NULL OR sc.id NOT LIKE '1%' OR sc.id LIKE '100%')
UNION ALL
SELECT 'kiadas', k.id, k.datum::date,
       COALESCE(k.osszeg_ron, k.osszeg),
       sc.id, k.megjegyzes
FROM public.kiadas k
LEFT JOIN public.kiadascel   kc ON kc.id = k.id_kiadascel
LEFT JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
WHERE k.deleted = false
  AND k.stornozott = false
  AND k.belso_mozgas_xkey IS NULL
  AND k.datum::date >= make_date((SELECT eve FROM p), 1, 1)
  AND k.datum::date <= make_date((SELECT eve FROM p), 12, 31)
  AND (sc.id IS NULL OR sc.id NOT LIKE '2%')
ORDER BY 3, 2;

-- [4.2] A hivatalos 1. sz. hibajelzés (Hibak!B1) megismétlése adatbázis-szinten: a SZÁMADÁSI záróegyenleg (nyitó + Σ 1xx bevétel − Σ 2xx kiadás) egyezik-e a KASSZA + BANK egyenleggel. VÁRT EREDMÉNY: minden sorban `elteres` = 0.00. Bármi más azt jelenti, hogy a beküldendő számadás nem egyeztethető a fizikai kasszával és a bankkivonattal.
WITH p AS (SELECT 2026::int AS eve),
ny AS (
  SELECT c.id AS cid,
         COALESCE(c.nev_hu, c.name) AS gyulekezet,
         COALESCE((SELECT kn.nyito_egyenleg FROM public.keszpenz_nyito_egyenleg kn
                    WHERE kn.congregation_id = c.id AND kn.eve = (SELECT eve FROM p)), 0) AS ny_keszpenz,
         COALESCE((SELECT SUM(bn.nyito_egyenleg_ron) FROM public.bankszamla_nyito_egyenleg bn
                    WHERE bn.congregation_id = c.id AND bn.eve = (SELECT eve FROM p)), 0) AS ny_bank
  FROM public.congregations c
),
bev AS (
  SELECT b.congregation_id AS cid,
         SUM(COALESCE(b.osszeg_ron, b.osszeg)) FILTER (WHERE b.bankszamla_id IS NULL)     AS keszpenz,
         SUM(COALESCE(b.osszeg_ron, b.osszeg)) FILTER (WHERE b.bankszamla_id IS NOT NULL) AS bank,
         SUM(COALESCE(b.osszeg_ron, b.osszeg)) FILTER (
              WHERE b.belso_mozgas_xkey IS NULL AND sc.id LIKE '1%' AND sc.id NOT LIKE '100%') AS ivre_kerul
  FROM public.befizetes b
  LEFT JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  LEFT JOIN public.szamadasicel  sc ON sc.id = bc.id_szamadasicel
  WHERE b.deleted = false AND b.stornozott = false
    AND b.datum >= make_date((SELECT eve FROM p),1,1)
    AND b.datum <= make_date((SELECT eve FROM p),12,31)
  GROUP BY b.congregation_id
),
kia AS (
  SELECT k.congregation_id AS cid,
         SUM(COALESCE(k.osszeg_ron, k.osszeg)) FILTER (WHERE k.bankszamla_id IS NULL)     AS keszpenz,
         SUM(COALESCE(k.osszeg_ron, k.osszeg)) FILTER (WHERE k.bankszamla_id IS NOT NULL) AS bank,
         SUM(COALESCE(k.osszeg_ron, k.osszeg)) FILTER (
              WHERE k.belso_mozgas_xkey IS NULL AND sc.id LIKE '2%') AS ivre_kerul
  FROM public.kiadas k
  LEFT JOIN public.kiadascel    kc ON kc.id = k.id_kiadascel
  LEFT JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
  WHERE k.deleted = false AND k.stornozott = false
    AND k.datum::date >= make_date((SELECT eve FROM p),1,1)
    AND k.datum::date <= make_date((SELECT eve FROM p),12,31)
  GROUP BY k.congregation_id
)
SELECT ny.gyulekezet,
  ROUND(ny.ny_keszpenz + ny.ny_bank + COALESCE(bev.ivre_kerul,0) - COALESCE(kia.ivre_kerul,0), 2) AS szamadas_zaro,
  ROUND(ny.ny_keszpenz + COALESCE(bev.keszpenz,0) - COALESCE(kia.keszpenz,0), 2)                  AS kassza_egyenleg,
  ROUND(ny.ny_bank     + COALESCE(bev.bank,0)     - COALESCE(kia.bank,0), 2)                      AS bank_egyenleg,
  ROUND( (ny.ny_keszpenz + ny.ny_bank + COALESCE(bev.ivre_kerul,0) - COALESCE(kia.ivre_kerul,0))
       - (ny.ny_keszpenz + COALESCE(bev.keszpenz,0) - COALESCE(kia.keszpenz,0))
       - (ny.ny_bank     + COALESCE(bev.bank,0)     - COALESCE(kia.bank,0)), 2)                   AS elteres
FROM ny
LEFT JOIN bev ON bev.cid = ny.cid
LEFT JOIN kia ON kia.cid = ny.cid
WHERE COALESCE(bev.keszpenz,0) <> 0 OR COALESCE(kia.keszpenz,0) <> 0
   OR COALESCE(bev.bank,0) <> 0 OR COALESCE(kia.bank,0) <> 0
ORDER BY ABS(ROUND( (ny.ny_keszpenz + ny.ny_bank + COALESCE(bev.ivre_kerul,0) - COALESCE(kia.ivre_kerul,0))
       - (ny.ny_keszpenz + COALESCE(bev.keszpenz,0) - COALESCE(kia.keszpenz,0))
       - (ny.ny_bank     + COALESCE(bev.bank,0)     - COALESCE(kia.bank,0)), 2)) DESC;

-- [4.3] Kasszaplafon-túllépés (Kassza!I2, 50 000 lej): mely napokon volt a kassza NAPI ZÁRÓ egyenlege 50 000 lej fölött. VÁRT EREDMÉNY: 0 sor. Ha van sor, a többletet 3 munkanapon belül a bankba kellett volna helyezni — a pénzügyi vizsgálat ezt tételesen nézi.
WITH p AS (SELECT 2026::int AS eve),
mozg AS (
  SELECT congregation_id, datum::date AS nap, SUM(COALESCE(osszeg_ron, osszeg)) AS valtozas
  FROM public.befizetes
  WHERE deleted = false AND stornozott = false AND bankszamla_id IS NULL
    AND datum >= make_date((SELECT eve FROM p),1,1)
    AND datum <= make_date((SELECT eve FROM p),12,31)
  GROUP BY 1,2
  UNION ALL
  SELECT congregation_id, datum::date, -SUM(COALESCE(osszeg_ron, osszeg))
  FROM public.kiadas
  WHERE deleted = false AND stornozott = false AND bankszamla_id IS NULL
    AND datum::date >= make_date((SELECT eve FROM p),1,1)
    AND datum::date <= make_date((SELECT eve FROM p),12,31)
  GROUP BY 1,2
),
napi AS (
  SELECT congregation_id, nap, SUM(valtozas) AS valtozas FROM mozg GROUP BY 1,2
),
goro AS (
  SELECT n.congregation_id, n.nap,
         COALESCE(kn.nyito_egyenleg,0)
           + SUM(n.valtozas) OVER (PARTITION BY n.congregation_id ORDER BY n.nap
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS kassza_zaro
  FROM napi n
  LEFT JOIN public.keszpenz_nyito_egyenleg kn
         ON kn.congregation_id = n.congregation_id AND kn.eve = (SELECT eve FROM p)
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet, g.nap, ROUND(g.kassza_zaro,2) AS kassza_zaro
FROM goro g
JOIN public.congregations c ON c.id = g.congregation_id
WHERE g.kassza_zaro > 50000
ORDER BY 1, 2;

-- [4.4] Készpénzfizetési értékhatárok (Valtozasok_2026): egyedi 5 000 lej feletti készpénzes kifizetés, és 10 000 lej feletti NAPI össz-készpénzkiadás. VÁRT EREDMÉNY: 0 sor. Találat esetén a tételt (vagy a napot) a könyvelővel át kell nézni — az 5 000 feletti részt kötelezően átutalással kellett volna rendezni.
WITH p AS (SELECT 2026::int AS eve)
-- 1) Egyetlen készpénzes kifizetés 5 000 lej felett
SELECT 'egyedi >5000' AS jelzes,
       COALESCE(c.nev_hu, c.name) AS gyulekezet,
       k.datum::date AS nap,
       k.id::text    AS azonosito,
       COALESCE(k.atvevo,'')       AS partner,
       ROUND(COALESCE(k.osszeg_ron, k.osszeg),2) AS osszeg_ron
FROM public.kiadas k
JOIN public.congregations c ON c.id = k.congregation_id
WHERE k.deleted = false AND k.stornozott = false
  AND k.bankszamla_id IS NULL                -- készpénz
  AND k.belso_mozgas_xkey IS NULL            -- a bankba letétel nem kifizetés
  AND k.datum::date >= make_date((SELECT eve FROM p),1,1)
  AND k.datum::date <= make_date((SELECT eve FROM p),12,31)
  AND COALESCE(k.osszeg_ron, k.osszeg) > 5000
UNION ALL
-- 2) Napi összesített készpénzkiadás 10 000 lej felett
SELECT 'napi >10000',
       COALESCE(c.nev_hu, c.name),
       k.datum::date,
       NULL,
       NULL,
       ROUND(SUM(COALESCE(k.osszeg_ron, k.osszeg)),2)
FROM public.kiadas k
JOIN public.congregations c ON c.id = k.congregation_id
WHERE k.deleted = false AND k.stornozott = false
  AND k.bankszamla_id IS NULL
  AND k.belso_mozgas_xkey IS NULL
  AND k.datum::date >= make_date((SELECT eve FROM p),1,1)
  AND k.datum::date <= make_date((SELECT eve FROM p),12,31)
GROUP BY 2,3
HAVING SUM(COALESCE(k.osszeg_ron, k.osszeg)) > 10000
ORDER BY 2, 3;

-- [4.5] Párosítatlan belső mozgás (a hivatalos Hibák lap kassza↔bank ellenőrzése): minden belső mozgásnak PONTOSAN két oldala van (egy bevétel + egy kiadás, közös xkey). VÁRT EREDMÉNY: 0 sor. Egy oldalú sor = a másik felet még nem könyvelték (pl. nincs importálva a kivonat), és emiatt a kassza vagy a bank egyenlege hamis.
WITH p AS (SELECT 2026::int AS eve),
oldalak AS (
  SELECT belso_mozgas_xkey AS xkey, congregation_id, datum::date AS nap,
         COALESCE(osszeg_ron, osszeg) AS osszeg, 'bevetel' AS oldal, bankszamla_id
  FROM public.befizetes
  WHERE deleted = false AND stornozott = false AND belso_mozgas_xkey IS NOT NULL
    AND datum >= make_date((SELECT eve FROM p),1,1)
    AND datum <= make_date((SELECT eve FROM p),12,31)
  UNION ALL
  SELECT belso_mozgas_xkey, congregation_id, datum::date,
         COALESCE(osszeg_ron, osszeg), 'kiadas', bankszamla_id
  FROM public.kiadas
  WHERE deleted = false AND stornozott = false AND belso_mozgas_xkey IS NOT NULL
    AND datum::date >= make_date((SELECT eve FROM p),1,1)
    AND datum::date <= make_date((SELECT eve FROM p),12,31)
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       o.xkey,
       MIN(o.nap) AS nap,
       COUNT(*) FILTER (WHERE o.oldal = 'bevetel') AS bevetel_oldal,
       COUNT(*) FILTER (WHERE o.oldal = 'kiadas')  AS kiadas_oldal,
       ROUND(MAX(o.osszeg),2) AS osszeg_ron
FROM oldalak o
JOIN public.congregations c ON c.id = o.congregation_id
GROUP BY 1,2
HAVING COUNT(*) FILTER (WHERE o.oldal = 'bevetel') <> 1
    OR COUNT(*) FILTER (WHERE o.oldal = 'kiadas')  <> 1
ORDER BY 3;

-- [4.6] Séma-valóság ellenőrzés (a migrációs fájl NEM bizonyíték): létezik-e ÉLESBEN a `keszpenz_nyito_egyenleg` tábla, és van-e a `material_movements`-en partner-oszlop a Bevételezési bizonylathoz / bon consumhoz. VÁRT EREDMÉNY: a `keszpenz_nyito_egyenleg` sor `letezik = true`; a partner-oszlopoknál `letezik = false` VÁRHATÓ (ez a felmérésben rögzített hiány) — ha true, akkor az adat már megvan, csak a nyomtatvány hiányzik.
SELECT 'tabla: keszpenz_nyito_egyenleg' AS vizsgalt,
       (to_regclass('public.keszpenz_nyito_egyenleg') IS NOT NULL) AS letezik
UNION ALL
SELECT 'tabla: bankszamla_nyito_egyenleg',
       (to_regclass('public.bankszamla_nyito_egyenleg') IS NOT NULL)
UNION ALL
SELECT 'oszlop: material_movements.' || x.oszlop,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name  = 'material_movements'
                  AND column_name = x.oszlop)
FROM (VALUES ('kitol'), ('kinek'), ('partner'), ('atvevo')) AS x(oszlop)
UNION ALL
SELECT 'tabla (tartozas/kintlevoseg tarolas): ' || t.nev,
       (to_regclass('public.' || t.nev) IS NOT NULL)
FROM (VALUES ('tartozas'), ('kintlevoseg'), ('szamadas_tartozas'), ('creante')) AS t(nev);

-- [4.7] Hiányzó nyitó egyenlegek: van-e olyan év, amelyre már könyveltek tételt, de nincs rögzített készpénz-nyitó vagy bank-nyitó. VÁRT EREDMÉNY: 0 sor. Bármely sor azt jelenti, hogy az adott év kassza- vagy bank-egyenlege 0-ról indul, tehát a Számadás 1–3. sora és a következő évi átvitel is hibás lesz — ez az a hiba, amiért a felsőbb hatóság visszaküldi a számadást.
WITH evek AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::int AS eve
  FROM public.befizetes WHERE deleted = false
  UNION
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::int
  FROM public.kiadas    WHERE deleted = false
)
SELECT COALESCE(c.nev_hu, c.name) AS gyulekezet,
       e.eve,
       (SELECT COUNT(*) FROM public.keszpenz_nyito_egyenleg kn
         WHERE kn.congregation_id = e.congregation_id AND kn.eve = e.eve) AS keszpenz_nyito_sorok,
       (SELECT COUNT(*) FROM public.bankszamla_nyito_egyenleg bn
         WHERE bn.congregation_id = e.congregation_id AND bn.eve = e.eve) AS bank_nyito_sorok,
       (SELECT COUNT(*) FROM public.bankszamlak bs
         WHERE bs.congregation_id = e.congregation_id AND bs.aktiv = true) AS aktiv_bankszamlak
FROM evek e
JOIN public.congregations c ON c.id = e.congregation_id
WHERE e.eve BETWEEN 2020 AND EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND (
    NOT EXISTS (SELECT 1 FROM public.keszpenz_nyito_egyenleg kn
                 WHERE kn.congregation_id = e.congregation_id AND kn.eve = e.eve)
    OR (SELECT COUNT(*) FROM public.bankszamla_nyito_egyenleg bn
         WHERE bn.congregation_id = e.congregation_id AND bn.eve = e.eve)
       < (SELECT COUNT(*) FROM public.bankszamlak bs
           WHERE bs.congregation_id = e.congregation_id AND bs.aktiv = true)
  )
ORDER BY 1, 2;


-- ==========================================================================
--  Anyagraktár — hivatalos Anyagraktarkonyv.xlsx (EREK 2026) ⇄ Kartotéka 
-- ==========================================================================

-- [5.1] Használatban van-e egyáltalán élesben az anyagraktár modul, és melyik gyülekezetben. VÁRT: ha 0 sor jön vissza, a modul még nincs használatban — akkor az összes többi ellenőrzés is üres lesz, és a hiányosságok még nem okoztak kárt, csak a 2026-os évkezdésnél fognak.
-- Anyagraktár használat gyülekezetenként (anyagok, mozgások, időszak)
select c.name                                as gyulekezet,
       count(distinct m.id)                  as anyag_db,
       count(mm.id)                          as mozgas_db,
       min(mm.datum)                         as elso_mozgas,
       max(mm.datum)                         as utolso_mozgas
from public.congregations c
join public.materials m            on m.congregation_id = c.id
left join public.material_movements mm
       on mm.material_id = m.id
      and mm.stornozott = false
group by c.id, c.name
order by count(mm.id) desc, c.name;

-- [5.2] Van-e olyan anyag, amelynek a mozgásaiban TÖBBFÉLE tényleges egységár szerepel. A hivatalos modellben egy készletlapon csak EGY ár lehet (Sugo 15. o.). VÁRT: 0 sor. Ha bármi visszajön, ott kevert értékkészlet van, és a nyomtatott könyv fejléc-egységára a régi sorokra hamis.
-- Kevert egységár egy anyagon belül (a hivatalos modell ezt tiltja)
select m.nev,
       m.mertekegyseg,
       m.egysegar                                                        as torzs_egysegar,
       count(distinct round(mm.ertek / nullif(mm.mennyiseg, 0), 2))      as arak_db,
       array_agg(distinct round(mm.ertek / nullif(mm.mennyiseg, 0), 2))  as elofordulo_arak
from public.materials m
join public.material_movements mm on mm.material_id = m.id
where mm.stornozott = false
  and mm.mennyiseg > 0
group by m.id, m.nev, m.mertekegyseg, m.egysegar
having count(distinct round(mm.ertek / nullif(mm.mennyiseg, 0), 2)) > 1
order by 4 desc, m.nev;

-- [5.3] Mínuszba fordult-e valamelyik anyag készlete vagy készletértéke. Ez a hivatalos Vagyonleltar_jelentes C15–C18 „Figyelmeztetés!!!” esete. VÁRT: 0 sor.
-- Negatív készlet vagy negatív készletérték (hivatalos: 'a készlet mínusz')
select m.nev,
       m.mertekegyseg,
       sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end)         as keszlet,
       round(sum(case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end), 2)       as keszlet_ertek
from public.materials m
join public.material_movements mm on mm.material_id = m.id
where mm.stornozott = false
group by m.id, m.nev, m.mertekegyseg
having sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end) < 0
    or sum(case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end) < 0
order by 3;

-- [5.4] Egyezik-e a könyvelt készletérték a mennyiség × törzs-egységár szorzattal (ez a hivatalos Leltar_iv U oszlopának logikája: U5 = G5 * R5). VÁRT: minden sornál elteres = 0.00. Bármi más azt jelenti, hogy az érték-egyenleg elcsúszott az árlaptól — árváltozás vagy kézi érték-felülírás miatt —, és a leltárív ÉS a vagyonleltári jelentés más számot adna.
-- Érték-egyenleg vs. mennyiség × egységár (a hivatalos leltárív-számítás)
select *
from (
  select m.nev,
         m.egysegar,
         sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end)                                  as keszlet,
         round(sum(case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end), 2)                                as konyvelt_ertek,
         round(coalesce(m.egysegar, 0)
               * sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end), 2)                      as elvart_ertek,
         round(sum(case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end)
               - coalesce(m.egysegar, 0)
               * sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end), 2)                      as elteres
  from public.materials m
  join public.material_movements mm on mm.material_id = m.id
  where mm.stornozott = false
  group by m.id, m.nev, m.egysegar
) t
where abs(t.elteres) > 0.01
order by abs(t.elteres) desc;

-- [5.5] Volt-e olyan időpont, amikor a futó (dátum szerinti) egyenleg mínuszban állt — vagyis visszamenőleg rögzített kiadás vagy stornózott bevétel miatt. A hivatalos Excel ezt soronkénti $M>=0 adatérvényesítéssel megakadályozza; a Kartotéka őre viszont dátumfüggetlen. VÁRT: 0 sor.
-- Futó egyenleg bármely napon mínuszba fordult-e (a hivatalos soronkénti őr)
with futo as (
  select m.nev,
         mm.datum,
         mm.id,
         mm.tipus,
         mm.mennyiseg,
         sum(case when mm.tipus = 'bevetel' then mm.mennyiseg else -mm.mennyiseg end)
           over (partition by mm.material_id
                 order by mm.datum, mm.id
                 rows between unbounded preceding and current row) as futo_egyenleg
  from public.materials m
  join public.material_movements mm on mm.material_id = m.id
  where mm.stornozott = false
)
select nev, datum, id, tipus, mennyiseg, futo_egyenleg
from futo
where futo_egyenleg < 0
order by nev, datum, id;

-- [5.6] Mennyivel tér el a 2025.12.31-i anyagraktári készletérték a felületen ma megjelenő értéktől. VÁRT: ha az `ertek_ma` nem egyezik az `ertek_2025_12_31` oszloppal, akkor a Leltár fül „Anyagraktár” száma NEM a december 31-i állapotot mutatja — vagyis rossz szám kerülne a vagyonleltári jelentésbe. (A dátumot cseréld a beszámolási évre.)
-- Év végi vs. mai anyagraktári készletérték gyülekezetenként
select c.name as gyulekezet,
       round(sum(case when mm.datum <= date '2025-12-31'
                      then case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end
                      else 0 end), 2)                                                   as ertek_2025_12_31,
       round(sum(case when mm.tipus = 'bevetel' then mm.ertek else -mm.ertek end), 2)   as ertek_ma,
       count(*) filter (where mm.datum > date '2025-12-31')                             as datum_utani_mozgas_db
from public.material_movements mm
join public.congregations c on c.id = mm.congregation_id
where mm.stornozott = false
group by c.id, c.name
order by c.name;

-- [5.7] Hány mozgásból hiányzik az iratszám vagy a magyarázat — vagyis a hivatalos anyagraktárkönyv „Irat száma” és „Magyarázat / Kitől vettünk be – kinek adtuk ki” oszlopa. VÁRT: 0 hiányzó. Amennyi hiányzik, annyi üres cella lesz a kinyomtatott, aláírandó lapon.
-- Hiányzó iratszám / magyarázat a mozgásokon (a hivatalos könyv kötelező oszlopai)
select c.name                                                                  as gyulekezet,
       count(*)                                                                as osszes_mozgas,
       count(*) filter (where mm.irat_szama is null or btrim(mm.irat_szama) = '')   as nincs_iratszam,
       count(*) filter (where mm.magyarazat is null or btrim(mm.magyarazat) = '')   as nincs_magyarazat
from public.material_movements mm
join public.congregations c on c.id = mm.congregation_id
where mm.stornozott = false
group by c.id, c.name
order by c.name;

-- [5.8] Van-e egyetlen olyan anyagmozgás is, amely pénzügyi kiadáshoz vagy befizetéshez van kötve. VÁRT (a mai kód szerint): kapcsolt_kiadashoz = 0 ÉS kapcsolt_befizeteshez = 0 — ez bizonyítja, hogy a séma FK-ja használatlan, a pénzügy ⇄ anyagraktár lánc nincs bekötve.
-- A kapcsolt_kiadas_id / kapcsolt_befizetes_id FK használatban van-e egyáltalán
select count(*)                        as osszes_mozgas,
       count(kapcsolt_kiadas_id)       as kapcsolt_kiadashoz,
       count(kapcsolt_befizetes_id)    as kapcsolt_befizeteshez
from public.material_movements;

-- [5.9] Milyen RLS-szabályok élnek ma az anyagraktáron, és használják-e a központi hatókör-függvényeket. VÁRT: 8 policy (4+4), és a `kozponti_fuggvenyt_hasznal` oszlop MINDENHOL false — ez bizonyítja, hogy a 2026-08-11-i globális hozzáférés-szűkítés (amely a current_user_has_global_access() törzsét írta át) ezt a két táblát nem érintette.
-- Anyagraktár RLS-leltár: használja-e a központi hatókör-függvényeket?
select tablename,
       policyname,
       cmd,
       (coalesce(qual, '') ilike '%current_user_can_access_congregation%'
        or coalesce(qual, '') ilike '%current_user_has_global_access%')  as kozponti_fuggvenyt_hasznal,
       qual,
       with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('materials', 'material_movements')
order by tablename, policyname;

-- [5.10] Hány nyugtatömb van, amelyre a hivatalos „Nyugtatömbök anyagraktárkönyve” kinyomtatandó volna. VÁRT: ha a nyugtatomb_db > 0, akkor ma NINCS mód kinyomtatni, mert egyetlen material_movements sor sem tartozik hozzájuk — a pénzügyi vizsgálaton bemutatandó irat hiányzik.
-- Nyugtatömbök, amelyekre anyagraktárkönyvet kellene tudni nyomtatni
select c.name                                        as gyulekezet,
       count(*)                                      as nyugtatomb_db,
       sum(t.darabszam_ossz)                         as nyugta_db_ossz,
       sum(t.felhasznalt_darabszam)                  as felhasznalt_db,
       round(sum(coalesce(t.vasarlas_ara, 0)), 2)    as beszerzesi_ertek
from public.chitanta_tombok t
join public.congregations c on c.id = t.congregation_id
group by c.id, c.name
order by count(*) desc, c.name;


-- ==========================================================================
--  Koltsegvetesi tetelek + "Utmutato az EREK szamadasahoz" (2026) vs. Kar
-- ==========================================================================

-- [6.1] Megvan-e a teljes hivatalos kod-keszlet a szamadasicel tablaban. VART: level_db = 87, csoport_db = 14. Ha level_db < 87, hianyzik hivatalos tetel; ha nyito_100_db > 0, az rendben van (a nyito penztarmaradvany sorai, a nyomtatvany kizarja oket), de az egyeb_db > 0 ismeretlen tobbletet jelez, amit a nyomtatvany viszont RATENNE a hivatalos ivre.
-- Hany hivatalos kod van a rendszerben?
SELECT
  count(*) FILTER (WHERE id ~ '^(10[1-7]|20[1-7])\.[0-9]{2}$')  AS level_db,
  count(*) FILTER (WHERE id ~ '^(10[1-7]|20[1-7])$')             AS csoport_db,
  count(*) FILTER (WHERE id = '100' OR id LIKE '100.%')          AS nyito_100_db,
  count(*) FILTER (
    WHERE id ~ '^[12]'
      AND id !~ '^(10[1-7]|20[1-7])(\.[0-9]{2})?$'
      AND id <> '100' AND id NOT LIKE '100.%'
  )                                                              AS egyeb_1xx_2xx_db,
  count(*)                                                       AS osszes_sor
FROM public.szamadasicel;

-- [6.2] Melyik hivatalos level-kod hianyzik a rendszerbol, es mi a tobblet. VART: mindket lista URES. A generalt lista a hivatalos Szamadas lap E oszlopabol jon (101.01-107.02 es 201.01-207.02).
-- Hianyzo hivatalos level-kodok (VART: 0 sor)
WITH hivatalos(kod) AS (VALUES
 ('101.01'),('101.02'),('101.03'),('101.04'),('101.05'),('101.06'),('101.07'),('101.08'),
 ('102.01'),('102.02'),('102.03'),('102.04'),('102.05'),('102.06'),
 ('103.01'),('103.02'),('103.03'),('103.04'),('103.05'),('103.06'),('103.07'),('103.08'),('103.09'),
 ('104.01'),('104.02'),('104.03'),('104.04'),('104.05'),
 ('105.01'),('105.02'),('105.03'),
 ('106.01'),('106.02'),('106.03'),('106.04'),('106.05'),('106.06'),
 ('107.01'),('107.02'),
 ('201.01'),('201.02'),('201.03'),('201.04'),('201.05'),('201.06'),('201.07'),('201.08'),('201.09'),
 ('201.10'),('201.11'),('201.12'),('201.13'),('201.14'),('201.15'),('201.16'),('201.17'),('201.18'),('201.19'),
 ('202.01'),('202.02'),('202.03'),('202.04'),('202.05'),('202.06'),('202.07'),('202.08'),
 ('203.01'),('203.02'),('203.03'),('203.04'),('203.05'),('203.06'),('203.07'),
 ('204.01'),('204.02'),('204.03'),('204.04'),
 ('205.01'),('205.02'),
 ('206.01'),('206.02'),('206.03'),('206.04'),('206.05'),('206.06'),
 ('207.01'),('207.02')
)
SELECT 'HIANYZIK a rendszerbol' AS allapot, h.kod, NULL::varchar AS nev
FROM hivatalos h
LEFT JOIN public.szamadasicel s ON s.id = h.kod
WHERE s.id IS NULL
UNION ALL
SELECT 'TOBBLET a rendszerben', s.id, s.nev
FROM public.szamadasicel s
WHERE s.id ~ '^(10[1-7]|20[1-7])\.[0-9]{2}$'
  AND s.id NOT IN (SELECT kod FROM hivatalos)
ORDER BY 1, 2;

-- [6.3] A tarolt sorszam megegyezik-e a hivatalos Nr. rand-dal - kulonos tekintettel a lelkeszi jelentes VII/VIII fejezetehez kotott sorokra. VART: minden sorban tarolt_sorszam = hivatalos_nr_rand, es az elteres oszlop 0. Ha a tarolt_sorszam NULL vagy 0, a helyes sorszam sehol nincs meg a rendszerben, es a nyomtatvany javitasa elott fel kell tolteni.
-- A hivatalos Nr. rand vs. a tarolt szamadasicel.sorszam
WITH hiv(kod, hivatalos_nr_rand, megjegyzes) AS (VALUES
  ('101.01',   5, 'lelkeszi jelentes VII.1 - egyhazfenntartoi jarulek'),
  ('101.03',   7, 'lelkeszi jelentes VII.2 - perselypenz'),
  ('101.07',  11, 'egyhazmegyei bevetel'),
  ('101.08',  12, 'egyhazmegyei bevetel'),
  ('105.01',  38, 'itt kezdodik a csuszas (a 36. es 41. osszesito sor miatt)'),
  ('105.03',  40, 'Kongrua - Kolozsvari egyhazmegyeben elerheto'),
  ('106.01',  43, NULL),
  ('107.02',  51, NULL),
  ('201.01',  54, NULL),
  ('201.13',  66, 'lelkeszi jelentes VIII.2.C - epuletek karbantartasa'),
  ('201.15',  68, 'Netto fizetesek - Kolozsvari egyhazmegyeben elerheto'),
  ('201.19',  72, NULL),
  ('205.01',  97, 'lelkeszi jelentes VIII.2.A - uj ingatlanberuhazas'),
  ('205.02',  98, 'lelkeszi jelentes VIII.2.B - altalanos javitasok'),
  ('206.06', 108, NULL),
  ('207.02', 111, NULL)
)
SELECT
  hiv.kod,
  hiv.hivatalos_nr_rand,
  s.sorszam                                  AS tarolt_sorszam,
  COALESCE(s.sorszam, -1) - hiv.hivatalos_nr_rand AS elteres,
  s.nev,
  s.szint,
  hiv.megjegyzes
FROM hiv
LEFT JOIN public.szamadasicel s ON s.id = hiv.kod
ORDER BY hiv.hivatalos_nr_rand;

-- [6.4] A magyar megnevezesek betuhusege - ez az Excel write-through SUMIF-kulcsa (packages/core/src/finance/excel/row-builder.ts az I/K oszlopba a szamadasicel.nev-et irja). VART: minden sorban egyezik = true. Barmelyik false eseten az Excelbe irt tetel osszege NEM kerul bele a hivatalos Szamadas lap G oszlopaba.
-- Betuhu-e a magyar nev a hivatalos Szamadas!C oszlophoz kepest?
WITH hiv(kod, hivatalos_nev) AS (VALUES
  ('101.01', 'Egyhazfenntartoi jarulek'),
  ('101.03', 'Perselypenz'),
  ('101.04', 'Adomanyok hivektol, egyhazi intezmenyektol'),
  ('103.02', 'Palyazatokbol'),
  ('103.09', 'Szponzortamogatasok, adok 3,5 %-a'),
  ('104.04', 'Epuletek berjovedelme'),
  ('105.03', 'Kongrua es jarulekai'),
  ('201.02', 'Kozkoltsegek (futes, vilagitas, viz stb.)'),
  ('201.12', 'Kis erteku leltari targyak beszerzese'),
  ('201.13', 'Karbantartasi kiadasok'),
  ('201.15', 'Netto fizetesek'),
  ('203.06', 'Kozponti jarulekok'),
  ('205.01', 'Uj beruhazasok'),
  ('205.02', 'Altalanos javitasok')
)
SELECT
  hiv.kod,
  hiv.hivatalos_nev              AS hivatalos_ekezet_nelkul,
  s.nev                          AS tarolt_nev,
  s.nevro                        AS tarolt_roman_nev,
  (s.nevro LIKE '%*')            AS roman_nevben_van_csillag,
  length(s.nev)                  AS tarolt_hossz
FROM hiv
LEFT JOIN public.szamadasicel s ON s.id = hiv.kod
ORDER BY hiv.kod;

-- [6.5] Az egyhazmegyei szintre allitott tetelek listaja. VART: PONTOSAN 18 sor, es pontosan ezek: 101.07, 101.08, 105.03, 106.02-106.06, 201.15-201.19, 206.02-206.06. Ha tobb vagy kevesebb, a 2026-04-17-i migracio nem ugy futott le elesben, ahogy a repoban all.
-- Mely tetelek vannak elzarva a gyulekezet elol?
SELECT s.id, s.nev, s.type, s.szint, s.aktiv
FROM public.szamadasicel s
WHERE s.szint <> 'gyulekezet'
ORDER BY s.type, s.id;

-- [6.6] A hivatalos Excel a KOLOZSVARI egyhazmegye gyulekezeteinek engedi a 105.03 (Kongrua) es 201.15 (Netto fizetesek) tetelt, a Kartoteka viszont mindenkitol elzarja. VART: ha itt 0-t latsz mindenhol, az NEM azt jelenti, hogy nincs kongrua - azt, hogy a rendszer nem engedte rogziteni. A gyulekezet listaja megmutatja, kiket erint.
-- Kiket erint a hianyzo egyhazmegye-fuggo tetel-keszlet?
SELECT
  COALESCE(c.nev_hu, c.name)                       AS gyulekezet,
  COALESCE(d.name, c.egyhazmegye)                  AS egyhazmegye,
  (SELECT count(*) FROM public.befizetes b
     JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
    WHERE b.congregation_id = c.id
      AND bc.id_szamadasicel = '105.03'
      AND b.deleted IS NOT TRUE AND b.stornozott IS NOT TRUE
  )                                                AS kongrua_105_03_db,
  (SELECT count(*) FROM public.kiadas k
     JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
    WHERE k.congregation_id = c.id
      AND kc.id_szamadasicel IN ('201.15','201.16','201.17','201.18','201.19')
      AND k.deleted IS NOT TRUE AND k.stornozott IS NOT TRUE
  )                                                AS fizetes_201_15_19_db
FROM public.congregations c
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
WHERE COALESCE(d.name, c.egyhazmegye) ILIKE '%Kolozsv%'
ORDER BY gyulekezet;

-- [6.7] Van-e olyan gyulekezeti konyveles, ami EGYHAZMEGYEI szintu tetelre keszult (szint-mismatch). VART: 0 sor. Ha van talalat, az a penz a kepernyon nem szamit bele a vegosszegbe, a nyomtatott iven viszont igen (lasd budget-reporting.ts:216-240 tulajdonosi dontes).
-- Konyveltek-e egyhazmegyei szintu tetelre?
SELECT 'BEVETEL' AS irany, s.id AS kod, s.nev, s.szint,
       COALESCE(c.nev_hu, c.name) AS gyulekezet,
       count(*) AS tetel_db, sum(COALESCE(b.osszeg_ron, b.osszeg)) AS osszeg_ron
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
JOIN public.szamadasicel s  ON s.id = bc.id_szamadasicel
JOIN public.congregations c ON c.id = b.congregation_id
WHERE s.szint <> 'gyulekezet'
  AND b.deleted IS NOT TRUE AND b.stornozott IS NOT TRUE
  AND b.belso_mozgas_xkey IS NULL
GROUP BY s.id, s.nev, s.szint, gyulekezet
UNION ALL
SELECT 'KIADAS', s.id, s.nev, s.szint,
       COALESCE(c.nev_hu, c.name),
       count(*), sum(COALESCE(k.osszeg_ron, k.osszeg))
FROM public.kiadas k
JOIN public.kiadascel kc   ON kc.id = k.id_kiadascel
JOIN public.szamadasicel s ON s.id = kc.id_szamadasicel
JOIN public.congregations c ON c.id = k.congregation_id
WHERE s.szint <> 'gyulekezet'
  AND k.deleted IS NOT TRUE AND k.stornozott IS NOT TRUE
  AND k.belso_mozgas_xkey IS NULL
GROUP BY s.id, s.nev, s.szint, COALESCE(c.nev_hu, c.name)
ORDER BY 1, 2;

-- [6.8] A lelkeszi jelentes VII/VIII fejezetenek tenyleges tartalma. VART: a VIII.1 es VIII.2 SZOVEG (nincs 66./97./98. sorhoz kotott szam), a VII.9-be pedig jarulek-hatralek kerult - amit az Utmutato 133. sora kifejezetten kizar a kintlevosegek kozul.
-- Mit tartalmaz ma a VII. es VIII. fejezet?
SELECT
  lj.ev,
  COALESCE(c.nev_hu, c.name)                                 AS gyulekezet,
  lj.statusz,
  COALESCE(lj.felulirasok -> 'VII.5', lj.kezi_adatok -> 'VII.5')   AS vii5_elozo_evi_egyenleg,
  COALESCE(lj.felulirasok -> 'VII.6', lj.kezi_adatok -> 'VII.6')   AS vii6_osszbevetel_52_sor,
  COALESCE(lj.felulirasok -> 'VII.7', lj.kezi_adatok -> 'VII.7')   AS vii7_osszkiadas_112_sor,
  COALESCE(lj.felulirasok -> 'VII.9', lj.kezi_adatok -> 'VII.9')   AS vii9_kintlevoseg,
  COALESCE(lj.felulirasok -> 'VII.10', lj.kezi_adatok -> 'VII.10') AS vii10_kifiz_kotelezettseg,
  lj.kezi_adatok -> 'VIII.1'                                  AS viii1_ingatlanok,
  lj.kezi_adatok -> 'VIII.2'                                  AS viii2_epitkezes
FROM public.lelkeszi_jelentes lj
JOIN public.congregations c ON c.id = lj.congregation_id
ORDER BY lj.ev DESC, gyulekezet;

-- [6.9] A veglegesitett szamadas zaro pillanatkepe - ebbol jon a lelkeszi jelentes VII.6/VII.7. VART: a zaro_bevetel a hivatalos 52. sorral, a zaro_kiadas a 112. sorral EGYEZIK. Ha regi_alak = true, a hivatalos szam a kanonikus alobjektumban van (lasd lelkeszi-jelentes-actions.ts:838-844).
-- Mi all a veglegesitett szamadas pillanatkepeben?
SELECT
  COALESCE(c.nev_hu, c.name)                          AS gyulekezet,
  b.id                                                AS bealitas_id,
  b.ervenyessegiev,
  b.accounting_finalized,
  (b.szamadas_zaro_adatok ? 'kanonikus')              AS regi_alak,
  b.szamadas_zaro_adatok #>> '{kanonikus,totalActualIncome}'  AS kanonikus_bevetel,
  b.szamadas_zaro_adatok #>> '{kanonikus,totalActualExpense}' AS kanonikus_kiadas,
  b.szamadas_zaro_adatok ->> 'totalActualIncome'      AS felso_bevetel_52_sor,
  b.szamadas_zaro_adatok ->> 'totalActualExpense'     AS felso_kiadas_112_sor,
  b.szamadas_zaro_adatok ->> 'totalIncome'            AS nyers_bevetel,
  b.szamadas_zaro_adatok ->> 'totalExpense'           AS nyers_kiadas
FROM public.bealitas b
JOIN public.congregations c ON c.id = b.congregation_id
ORDER BY gyulekezet, b.ervenyessegiev DESC;


-- ==========================================================================
--  Kimutatasok_2026 — a nyomtatványok és a kötelező nyomtatási rend
-- ==========================================================================

-- [7.1] Kiadási kísérőív túlcsordulás: a hivatalos ív 20 sor/lap (Kimutatasok_2026 'Kiadasi_kiseroiv' M2='=ROUNDUP(O1/20,0)'), a Kartotéka viszont EGY lapra nyomtat. Itt látszik, mely napokon lenne hivatalosan 2+ lap. VÁRT EREDMÉNY: 0 sor. Ha van sor, azon a napon a nyomtatvány túlcsordul, és onnantól az oldalszám-sorozat is elcsúszik a hivatalostól.
-- Kiadásos napok forrásonként, ahol 20-nál több tétel van (hivatalosan 2+ kísérőív-lap)
select
  k.datum,
  coalesce(k.bankszamla_id::text, 'KASSZA')            as forras,
  count(*)                                             as tetel_db,
  ceil(count(*)::numeric / 20)                         as hivatalos_lapszam
from public.kiadas k
where k.congregation_id = '<GYULEKEZET_ID>'::uuid
  and k.deleted = false
  and coalesce(k.stornozott, false) = false
  and k.datum >= date '2026-01-01'
  and k.datum <  date '2027-01-01'
group by k.datum, coalesce(k.bankszamla_id::text, 'KASSZA')
having count(*) > 20
order by k.datum, forras;

-- [7.2] Registru Casă / Registru Bancă lapozás: a hivatalos napló 40 sor/lap ('Naplo' P2=40), laponként 'TOTAL PAGINA' és 'Sold pagina precedentă' sorral. A Kartotéka hónaponként EGY lapot ad 'pg. 1'-gyel. VÁRT EREDMÉNY: 0 sor. Ahol van sor, ott a nyomtatvány némán több papírra folyik szét, fejléc és lapszám nélkül a 2. laptól.
-- Hónap+forrás bontásban a naplósorok száma; 40 felett a hivatalos napló több lap
with mozgas as (
  select date_trunc('month', b.datum)::date          as ho,
         coalesce(b.bankszamla_id::text, 'KASSZA')   as forras
  from public.befizetes b
  where b.congregation_id = '<GYULEKEZET_ID>'::uuid
    and b.deleted = false
    and coalesce(b.stornozott, false) = false
    and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
  union all
  select date_trunc('month', k.datum)::date,
         coalesce(k.bankszamla_id::text, 'KASSZA')
  from public.kiadas k
  where k.congregation_id = '<GYULEKEZET_ID>'::uuid
    and k.deleted = false
    and coalesce(k.stornozott, false) = false
    and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
)
select ho, forras,
       count(*)                       as naplo_sor_db,
       ceil(count(*)::numeric / 40)   as hivatalos_lapszam
from mozgas
group by ho, forras
having count(*) > 40
order by ho, forras;

-- [7.3] Főkönyv (Registru Jurnal) lapozás: a hivatalos főkönyv 40 sor/lap ('Fo_konyv' M3=40), 'De reportat pagina:' / 'Report pagina precedentă:' átvezetéssel, és KÖTELEZŐEN, bekötve őrzendő. VÁRT EREDMÉNY: 0 sor. Ahány sor visszajön, annyi hónapban a bekötendő főkönyv lapszámozása ma hibás (mind ugyanazt a 'pg. N'-t viseli).
-- Havi főkönyvi sorszám (kassza + MINDEN bankszámla együtt), 40 sor/lap kerettel
with fokonyv as (
  select date_trunc('month', b.datum)::date as ho
  from public.befizetes b
  where b.congregation_id = '<GYULEKEZET_ID>'::uuid
    and b.deleted = false and coalesce(b.stornozott, false) = false
    and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
  union all
  select date_trunc('month', k.datum)::date
  from public.kiadas k
  where k.congregation_id = '<GYULEKEZET_ID>'::uuid
    and k.deleted = false and coalesce(k.stornozott, false) = false
    and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
)
select ho,
       count(*)                      as fokonyvi_sor_db,
       ceil(count(*)::numeric / 40)  as hivatalos_lapszam,
       1                             as kartoteka_lapszam
from fokonyv
group by ho
having count(*) > 40
order by ho;

-- [7.4] Csoportnapló — belső mozgások: a hivatalos 'Csoportnaplo' A3 legördülője a Koltvetnev névtartomány, vagyis MINDEN költségvetési tétel választható, a készpénzletét/-felvétel is. A Kartotéka a 3xx/4xx/100 kódokat kihagyja (reporting.ts:841-842) ÉS a választóból is kiszűri (finance-print-dialog.tsx:152-160). VÁRT EREDMÉNY: ha itt sorok jönnek vissza, azok a tételek SEHOGY nem nyomtathatók csoportnaplóba.
-- Belső mozgásnak minősített jogcímek forgalma (ezek ma nem listázhatók csoportnaplóban)
select sc.id                                        as jogcim_kod,
       sc.nev                                       as jogcim_nev,
       'kiadas'                                     as oldal,
       count(*)                                     as tetel_db,
       sum(coalesce(k.osszeg_ron, k.osszeg))        as osszeg_ron
from public.kiadas k
join public.kiadascel    kc on kc.id = k.id_kiadascel
join public.szamadasicel sc on sc.id = kc.id_szamadasicel
where k.congregation_id = '<GYULEKEZET_ID>'::uuid
  and k.deleted = false and coalesce(k.stornozott, false) = false
  and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
  and (sc.id ~ '^[34]' or sc.id = '100' or sc.id like '100.%')
group by sc.id, sc.nev
union all
select sc.id, sc.nev, 'befizetes',
       count(*), sum(coalesce(b.osszeg_ron, b.osszeg))
from public.befizetes b
join public.befizetescel bc on bc.id = b.id_befizetescel
join public.szamadasicel sc on sc.id = bc.id_szamadasicel
where b.congregation_id = '<GYULEKEZET_ID>'::uuid
  and b.deleted = false and coalesce(b.stornozott, false) = false
  and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
  and (sc.id ~ '^[34]' or sc.id = '100' or sc.id like '100.%')
group by sc.id, sc.nev
order by jogcim_kod, oldal;

-- [7.5] Besorolatlan tételek: jogcím nélküli bevétel/kiadás. Ezek a Kartotéka csoportnaplójában a „Fără capitol — Besorolatlan” csoportba esnek figyelmeztető lábjegyzettel (reporting.ts:868-877, 1040), a hivatalos munkafüzetben pedig az Adatok_2026 'Hibak' lapja jelzi őket (Sugo.txt 190). VÁRT EREDMÉNY: 0 sor. Ha van sor, addig sem a csoportnapló, sem a számadás nem hiteles.
-- Jogcím (számadási cél) nélküli tételek — a Hibak-lap 1. számú hibajelzésének megfelelője
select 'befizetes' as tabla, b.id, b.datum,
       coalesce(b.osszeg_ron, b.osszeg) as osszeg_ron,
       b.forrasa as partner, b.megjegyzes
from public.befizetes b
left join public.befizetescel bc on bc.id = b.id_befizetescel
where b.congregation_id = '<GYULEKEZET_ID>'::uuid
  and b.deleted = false and coalesce(b.stornozott, false) = false
  and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
  and (b.id_befizetescel is null or bc.id_szamadasicel is null)
union all
select 'kiadas', k.id, k.datum,
       coalesce(k.osszeg_ron, k.osszeg),
       k.atvevo, k.megjegyzes
from public.kiadas k
left join public.kiadascel kc on kc.id = k.id_kiadascel
where k.congregation_id = '<GYULEKEZET_ID>'::uuid
  and k.deleted = false and coalesce(k.stornozott, false) = false
  and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
  and (k.id_kiadascel is null or kc.id_szamadasicel is null)
order by datum, tabla;

-- [7.6] Román jogcímnév hiánya: a Registru Casa/Banca/Jurnal az „Explicaţii” oszlopba a jogcím ROMÁN nevét írja (reporting.ts:158 `cel?.nevro || cel?.nev`). Ahol a `nevro` üres vagy egyenlő a magyar névvel, ott MAGYAR szöveg kerül a román hivatalos regiszterbe. VÁRT EREDMÉNY: 0 sor.
-- Ténylegesen használt jogcímek, amelyeknek nincs valódi román nevük
with hasznalt as (
  select distinct kc.id_szamadasicel as cel_id
  from public.kiadas k
  join public.kiadascel kc on kc.id = k.id_kiadascel
  where k.congregation_id = '<GYULEKEZET_ID>'::uuid
    and k.deleted = false and coalesce(k.stornozott, false) = false
    and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
  union
  select distinct bc.id_szamadasicel
  from public.befizetes b
  join public.befizetescel bc on bc.id = b.id_befizetescel
  where b.congregation_id = '<GYULEKEZET_ID>'::uuid
    and b.deleted = false and coalesce(b.stornozott, false) = false
    and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
)
select sc.id as jogcim_kod, sc.nev as magyar_nev, sc.nevro as roman_nev
from public.szamadasicel sc
join hasznalt h on h.cel_id = sc.id
where coalesce(nullif(btrim(sc.nevro), ''), sc.nev) = sc.nev
order by sc.id;

-- [7.7] Beruházási kiadások, amelyekhez a hivatalos kísérőív leltári szám sort nyomtat ('Kiadasi_kiseroiv' A29), a Kartotéka viszont nem. VÁRT EREDMÉNY: az itt visszajövő tételekhez ma kézzel kell a leltári számot ráírni a bizonylatra — érdemes összevetni a leltar_tetelek táblával, hogy be van-e leltározva.
-- 205.xx (Investiţii / Beruházások) jogcímű kiadások — kísérőívükön hiányzik a leltári szám sor
select k.datum,
       coalesce(k.bankszamla_id::text, 'KASSZA') as forras,
       sc.id   as jogcim_kod,
       sc.nev  as jogcim_nev,
       k.atvevo,
       k.iratszam,
       coalesce(k.osszeg_ron, k.osszeg) as osszeg_ron
from public.kiadas k
join public.kiadascel    kc on kc.id = k.id_kiadascel
join public.szamadasicel sc on sc.id = kc.id_szamadasicel
where k.congregation_id = '<GYULEKEZET_ID>'::uuid
  and k.deleted = false and coalesce(k.stornozott, false) = false
  and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
  and sc.id like '205%'
order by k.datum, k.id;

-- [7.8] „Sold zi” szemantika: a hivatalos 'Naplo' H11 képlete a napi egyenleget CSAK a nap utolsó során írja ki, a Kartotéka minden soron. Ez a lekérdezés megmutatja, hány napon van egynél több kassza-mozgás, azaz hány napon lesz több „Sold zi” érték a hivatalos egy helyett. VÁRT EREDMÉNY: minden visszajövő nap egy-egy hely, ahol az ellenőr nem tudja, melyik szám a napi zárás.
-- Kassza-napok több mozgással: itt a Kartotéka több „Sold zi” értéket ír egy helyett
with kassza_mozgas as (
  select b.datum from public.befizetes b
  where b.congregation_id = '<GYULEKEZET_ID>'::uuid
    and b.deleted = false and coalesce(b.stornozott, false) = false
    and b.bankszamla_id is null
    and b.datum >= date '2026-01-01' and b.datum < date '2027-01-01'
  union all
  select k.datum from public.kiadas k
  where k.congregation_id = '<GYULEKEZET_ID>'::uuid
    and k.deleted = false and coalesce(k.stornozott, false) = false
    and k.bankszamla_id is null
    and k.datum >= date '2026-01-01' and k.datum < date '2027-01-01'
)
select datum, count(*) as mozgas_db
from kassza_mozgas
group by datum
having count(*) > 1
order by datum;


-- ==========================================================================
--  Iktató és a 2024. január 1-től érvényes egyházközségi ügykörjegyzék
-- ==========================================================================

-- [8.1] Megvannak-e egyáltalán az EREK 2024-es ügykörjegyzék rovatai az iktato táblán? (A migration-fájl NEM bizonyíték — ez az élő sémát nézi.) VÁRT EREDMÉNY: pontosan 9 sor jön vissza. Ha bármelyik hiányzik, a 2026-05-28-iktato-erek-ugykorjegyzek-bovites.sql nem futott le élesben, és a felület némán elveszti az ügykört.
-- Az EREK 2024-es iktatókönyv-rovatok megléte az élő sémában
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name  = 'iktato'
  AND column_name IN (
        'ugykor_kod', 'retention_type', 'external_ref_szam', 'external_ref_kelt',
        'beerkezes_ideje', 'mellekletek_szama', 'valasz_iktatoszam',
        'has_duplicate', 'oldalszam')
ORDER BY column_name;

-- [8.2] Hány iratnak NINCS ügykör-besorolása (irattári száma) gyülekezetenként és évenként? VÁRT EREDMÉNY: az `ugykor_nelkul` oszlop mindenhol 0. Minden nullánál nagyobb szám olyan iratot jelent, ami a hivatalos iktatókönyv 8. rovatában üresen nyomtat, és a fizikai iratgyűjtőbe nem sorolható be.
-- Besorolatlan (ügykör nélküli) iktatott iratok gyülekezetenként, évenként
SELECT c.name AS gyulekezet,
       i.year AS ev,
       count(*) FILTER (WHERE i.ugykor_kod IS NULL OR btrim(i.ugykor_kod) = '') AS ugykor_nelkul,
       count(*) AS osszes_irat,
       round(100.0 * count(*) FILTER (WHERE i.ugykor_kod IS NULL OR btrim(i.ugykor_kod) = '')
             / NULLIF(count(*), 0), 1) AS szazalek
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE i.deleted = false
GROUP BY c.name, i.year
ORDER BY ugykor_nelkul DESC, i.year DESC;

-- [8.3] Van-e olyan irat, amelynek az ügykör-kódja NEM szerepel a 2024. január 1-től érvényes hivatalos jegyzékben (IT 66/2023)? VÁRT EREDMÉNY: 0 sor. Bármely visszaadott sor olyan iratot jelöl, amit a rendszer nem tud a hivatalos jegyzékbe illeszteni (pl. régi, 2024 előtti szám vagy elgépelés).
-- Ügykör-kódok, amelyek nincsenek benne a hivatalos 2024-es jegyzékben
WITH hivatalos(kod) AS (
  VALUES ('1.'),('2.'),('3.'),('4.'),('5.'),
         ('6.'),('6/1.'),('6/2.'),('6/3.'),('6/4.'),('6/5.'),('6/6.'),('6/7.'),
         ('7.'),('8.'),
         ('9.'),('9/1.'),('9/2.'),
         ('10.'),('11.'),('12.'),
         ('13.'),('13/1.'),('13/2.'),('13/3.'),
         ('14.'),('15.'),('16.'),('17.'),('18.')
)
SELECT c.name AS gyulekezet,
       i.year AS ev,
       i.sequence_number AS iktatoszam,
       i.ugykor_kod AS ervenytelen_kod,
       left(coalesce(i.subject, ''), 60) AS targy
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE i.deleted = false
  AND i.ugykor_kod IS NOT NULL
  AND btrim(i.ugykor_kod) <> ''
  AND NOT EXISTS (SELECT 1 FROM hivatalos h WHERE h.kod = i.ugykor_kod)
ORDER BY i.year DESC, i.sequence_number DESC;

-- [8.4] Vannak-e importból származó, ZÁROLT iratok? Ezeknél a file_folder mezőbe az ügykör NEVE került (pl. 'Levelezés') a legacy F.Á./É.Á./A.K. helyett — ilyen rekordot a felület a zod-enum miatt NEM tud elmenteni, tehát a lelkész sosem tudja javítani. VÁRT EREDMÉNY: 0 sor.
-- Importált iratok, ahol az ügykör NEVE a legacy file_folder mezőbe került
SELECT c.name AS gyulekezet,
       i.year AS ev,
       i.sequence_number AS iktatoszam,
       i.file_folder AS hibas_file_folder,
       i.ugykor_kod AS ugykor_kod_ma,
       left(coalesce(i.subject, ''), 60) AS targy
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE i.deleted = false
  AND i.file_folder IS NOT NULL
  AND i.file_folder NOT IN ('F.Á.', 'É.Á.', 'A.K.')
ORDER BY i.year DESC, i.sequence_number DESC;

-- [8.5] Egyezik-e a tárolt megőrzési típus a hivatalos jegyzékkel (F.Á. = folyamatosan állandó, É.Á. = évente állandó)? VÁRT EREDMÉNY: 0 sor. Eltérés esetén az iratgyűjtő lezárása rossz ritmusban történne (pl. egy É.Á. dossziét nem zárnának le év végén).
-- Megőrzési típus eltérése a hivatalos ügykörjegyzéktől
WITH hivatalos(kod, retention) AS (
  VALUES ('1.','É.Á.'),('2.','F.Á.'),('3.','F.Á.'),('4.','F.Á.'),('5.','F.Á.'),
         ('6/1.','É.Á.'),('6/2.','F.Á.'),('6/3.','F.Á.'),('6/4.','F.Á.'),
         ('6/5.','F.Á.'),('6/6.','F.Á.'),('6/7.','F.Á.'),
         ('7.','F.Á.'),('8.','F.Á.'),('9.','É.Á.'),
         ('10.','É.Á.'),('11.','F.Á.'),('12.','F.Á.'),('13.','F.Á.'),
         ('14.','F.Á.'),('15.','F.Á.'),('16.','F.Á.'),('17.','F.Á.'),('18.','F.Á.')
)
SELECT c.name AS gyulekezet,
       i.year AS ev,
       i.sequence_number AS iktatoszam,
       i.ugykor_kod,
       i.retention_type AS tarolt_megorzes,
       h.retention AS hivatalos_megorzes
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
JOIN hivatalos h ON h.kod = i.ugykor_kod
WHERE i.deleted = false
  AND (i.retention_type IS NULL OR i.retention_type <> h.retention)
ORDER BY i.year DESC, i.sequence_number DESC;

-- [8.6] A küldő iktatószáma rossz mezőbe (irattarijel) került-e az import során? Az irattári jel formája „1/29” (iratgyűjtő/sorszám); ha ott „479/2023” alakú, évszámos szám áll ÉS az external_ref_szam üres, akkor az import félrerakta. VÁRT EREDMÉNY: 0 sor.
-- Külső (küldői) iktatószám gyanúja az irattári jel mezőben
SELECT c.name AS gyulekezet,
       i.year AS ev,
       i.sequence_number AS iktatoszam,
       i.irattarijel AS irattari_jel_tartalma,
       i.external_ref_szam AS kulso_iktatoszam_ma,
       left(coalesce(i.megjegyzes, ''), 90) AS megjegyzes
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE i.deleted = false
  AND i.external_ref_szam IS NULL
  AND i.irattarijel IS NOT NULL
  AND i.irattarijel ~ '[0-9]+\s*/\s*(19|20)[0-9]{2}'
ORDER BY i.year DESC, i.sequence_number DESC;

-- [8.7] Épségben van-e az iktatószám-egyediség és a számláló? VÁRT EREDMÉNY: 'iktatoszam egyedisegi index' = 'VAN', 'duplikalt iktatoszam' = '0', és a 'szamlalo elmaradasa' sorban 0 gyülekezet-év. Ha a számláló elmarad a tényleges maximumtól, a következő iktatás 23505-ös hibával elbukik.
-- Iktatószám-egyediség, duplikátumok és a sorszám-számláló szinkronja
SELECT 'iktatoszam egyedisegi index' AS ellenorzes,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename  = 'iktato'
           AND indexname  = 'iktato_unique_active_cong_year_seq'
       ) THEN 'VAN' ELSE 'NINCS' END AS eredmeny
UNION ALL
SELECT 'duplikalt iktatoszam (aktiv sorok)',
       count(*)::text
FROM (
  SELECT congregation_id, year, sequence_number
  FROM public.iktato
  WHERE deleted = false
  GROUP BY congregation_id, year, sequence_number
  HAVING count(*) > 1
) d
UNION ALL
SELECT 'szamlalo elmaradasa (gyulekezet-ev parok)',
       count(*)::text
FROM (
  SELECT i.congregation_id, i.year, max(i.sequence_number) AS tenyleges_max,
         coalesce(p.last_sequence, 0) AS szamlalo
  FROM public.iktato i
  LEFT JOIN public.iktato_sequence_pointers p
         ON p.congregation_id = i.congregation_id AND p.year = i.year
  WHERE i.deleted = false
  GROUP BY i.congregation_id, i.year, p.last_sequence
  HAVING max(i.sequence_number) > coalesce(p.last_sequence, 0)
) s;

-- [8.8] Kitöltött-e a Lapok száma (oldalszam), amiből a hivatalos Irattári leltár lapszám-oszlopa számolna? VÁRT EREDMÉNY a hivatalos rend szerint: `lapszammal` = `osszes`. A jelenlegi kódban a web-felületen ez a mező NEM tölthető, ezért a valóságban 0 (vagy csak importált/desktopos sorok) várható — ez igazolja, hogy az irattári leltár lapszámozása ma nem készíthető el.
-- Lapszám-kitöltöttség évenként (az Irattári leltár lapszám-oszlopához)
SELECT c.name AS gyulekezet,
       i.year AS ev,
       count(*) AS osszes_irat,
       count(i.oldalszam) AS lapszammal_rendelkezik,
       count(*) - count(i.oldalszam) AS lapszam_nelkul
FROM public.iktato i
JOIN public.congregations c ON c.id = i.congregation_id
WHERE i.deleted = false
GROUP BY c.name, i.year
ORDER BY i.year DESC, c.name;


-- ==========================================================================
--  Főkönyv (Registru Jurnal) — a kötelező, bekötendő nyomtatvány: hivatal
-- ==========================================================================

-- [9.1] Hány LAPOT kellene adnia a Főkönyvnek havonta a hivatalos 40 sor/lap szabály szerint, szemben azzal, hogy a Kartotéka ma hónaponként MINDIG 1 lapot (pg. 1) nyomtat. VÁRT EREDMÉNY: minden sorban hivatalos_lapszam = 1. Ha bármelyik hónapnál hivatalos_lapszam > 1, akkor azon a hónapon a mai nyomtatvány már NEM felel meg a hivatalos ívnek (nincs lapátvitel-sor, és minden lap „pg. 1").
-- Írd át: a gyülekezet azonosítója és az év.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
),
tetel AS (
  -- bevételek (kassza + bank együtt, ahogy a Főkönyv listáz)
  SELECT date_trunc('month', b.datum::date)::date AS ho
  FROM public.befizetes b, p
  WHERE b.congregation_id = p.cid
    AND b.deleted = false AND b.stornozott = false
    AND b.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
  UNION ALL
  -- kiadások (kassza + bank együtt)
  SELECT date_trunc('month', k.datum::date)::date
  FROM public.kiadas k, p
  WHERE k.congregation_id = p.cid
    AND k.deleted = false AND k.stornozott = false
    AND k.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
)
SELECT
  to_char(ho, 'YYYY-MM')                        AS honap,
  count(*)                                      AS tetel_db,
  ceil(count(*)::numeric / 40)::int             AS hivatalos_lapszam,  -- Fo_konyv M3 = 40 sor/lap
  1                                             AS kartoteka_lapszam   -- ma mindig 1 (pg. 1)
FROM tetel
GROUP BY ho
ORDER BY ho;

-- [9.2] A Főkönyv „Report din luna precedentă" sorának 6./7. oszlopa a RÖGZÍTETT évi nyitó egyenlegeket is tartalmazza (a hivatalos íven is így van: Fo_konyv G11 = Q5+Q6, ahol Q6 = Cs!CQ1 = a Kassza lap „Előző évi készpénzegyenleg" értéke). VÁRT EREDMÉNY: pontosan 1 'keszpenz' sor az adott évre, plusz minden élő bankszámlához 1 'bank' sor. Ha ÜRES az eredmény vagy hiányzik egy bankszámla, akkor a Report sor nyitója nem rögzített értékből, hanem visszaszámolt becslésből jön — a kinyomtatott Főkönyv nyitója utólag megváltozhat.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
)
SELECT 'keszpenz'::text        AS tipus,
       NULL::text              AS bankszamla_id,
       n.eve,
       n.nyito_egyenleg::numeric AS nyito_ron
FROM public.keszpenz_nyito_egyenleg n, p
WHERE n.congregation_id = p.cid AND n.eve = p.ev
UNION ALL
SELECT 'bank'::text,
       b.bankszamla_id::text,
       b.eve,
       b.nyito_egyenleg_ron::numeric
FROM public.bankszamla_nyito_egyenleg b, p
WHERE b.congregation_id = p.cid AND b.eve = p.ev
ORDER BY 1, 2;

-- [9.3] A Főkönyv 3. oszlopa („Document / Fel"). A Kartotéka csak akkor ír 'Extr'-t, ha az irattipus PONTOSAN 'Banki' (reporting.ts:129-133) — minden más esetben 'Chit.'. VÁRT EREDMÉNY: a 'bank' csatornájú sorok egyikénél SEM szabadna 'Chit.'-nek állnia (ott 'Extr' / 'OP' a helyes), és a 'kassza' + 'kiadas' kombinációnál a hivatalos ív 'Disp.'-t (Dispoziție de plată) várna. Ha a fokonyv_fel_ma oszlopban a bank-soroknál 'Chit.' szerepel, a nyomtatvány rossz bizonylattípust ír.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
),
t AS (
  SELECT 'bevetel'::text AS irany, b.bankszamla_id, coalesce(b.irattipus,'') AS irattipus
  FROM public.befizetes b, p
  WHERE b.congregation_id = p.cid
    AND b.deleted = false AND b.stornozott = false
    AND b.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
  UNION ALL
  SELECT 'kiadas'::text, k.bankszamla_id, coalesce(k.irattipus,'')
  FROM public.kiadas k, p
  WHERE k.congregation_id = p.cid
    AND k.deleted = false AND k.stornozott = false
    AND k.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
)
SELECT
  CASE WHEN bankszamla_id IS NULL THEN 'kassza' ELSE 'bank' END AS csatorna,
  irany,
  irattipus                                                     AS tarolt_irattipus,
  CASE WHEN irattipus = 'Banki' THEN 'Extr' ELSE 'Chit.' END     AS fokonyv_fel_ma,
  count(*)                                                      AS db
FROM t
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 5 DESC;

-- [9.4] A hivatalos ív 10. oszlopa („Simb. cont.") a jogcím számlaszimbóluma (Fo_konyv K12 = VLOOKUP(költségvetési tétel, Csfi, 2)). A Kartotéka ezt az oszlopot nem nyomtatja; ez a lekérdezés megmutatja, hogy egyáltalán KITÖLTHETŐ lenne-e: hány tételnek nincs jogcíme. VÁRT EREDMÉNY: jogcim_nelkul = 0 mindkét sorban. Ha nem nulla, a 10. oszlop visszaépítése után is üresen maradnának ezek a sorok.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
)
SELECT 'bevetel'::text AS irany,
       count(*)                                          AS osszes,
       count(*) FILTER (WHERE b.id_befizetescel IS NULL) AS jogcim_nelkul
FROM public.befizetes b, p
WHERE b.congregation_id = p.cid
  AND b.deleted = false AND b.stornozott = false
  AND b.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
UNION ALL
SELECT 'kiadas'::text,
       count(*),
       count(*) FILTER (WHERE k.id_kiadascel IS NULL)
FROM public.kiadas k, p
WHERE k.congregation_id = p.cid
  AND k.deleted = false AND k.stornozott = false
  AND k.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31);

-- [9.5] A Nr. crt. sorszám minden nyomtatáskor újraszámolódik (reporting.ts:493-496). Ez a lekérdezés kimutatja a VISSZADÁTUMOZOTT rögzítéseket: azokat a tételeket, amelyeknél egy KÉSŐBB felvitt sor (nagyobb id) KORÁBBI dátumot kapott — minden ilyen sor elcsúsztatja az utána következő összes sorszámot az újranyomtatott Főkönyvben. VÁRT EREDMÉNY: 0 sor. Ha vannak találatok, a már lefűzött lapok sorszámai eltérnek attól, amit a rendszer ma nyomtatna.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
),
t AS (
  SELECT b.id, b.datum::date AS datum, 'befizetes'::text AS tabla
  FROM public.befizetes b, p
  WHERE b.congregation_id = p.cid
    AND b.deleted = false AND b.stornozott = false
    AND b.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
  UNION ALL
  SELECT k.id, k.datum::date, 'kiadas'::text
  FROM public.kiadas k, p
  WHERE k.congregation_id = p.cid
    AND k.deleted = false AND k.stornozott = false
    AND k.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
),
jelolt AS (
  SELECT t.*, max(datum) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS elozo_max_datum
  FROM t
)
SELECT tabla, id, datum, elozo_max_datum,
       (elozo_max_datum - datum) AS visszadatumozva_nap
FROM jelolt
WHERE elozo_max_datum IS NOT NULL AND datum < elozo_max_datum
ORDER BY datum, id;

-- [9.6] Az éves („Jan–Dec") Főkönyv-nyomtatás üres-hónap vizsgálata NEM szűri a stornózott tételeket (reporting.ts:1213-1214), a lapot építő szűrő viszont igen (reporting.ts:268). VÁRT EREDMÉNY: 0 sor. Ha van találat, arra a hónapra a rendszer ÜRES Főkönyv-lapot generál (fejléc + Report sor + záró sorok, tétel nélkül), ami feleslegesen kerülne a bekötendő anyagba.
WITH p AS (
  SELECT '<GYULEKEZET_UUID>'::uuid AS cid, 2026 AS ev
),
t AS (
  SELECT date_trunc('month', b.datum::date)::date AS ho, b.stornozott
  FROM public.befizetes b, p
  WHERE b.congregation_id = p.cid AND b.deleted = false
    AND b.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
  UNION ALL
  SELECT date_trunc('month', k.datum::date)::date, k.stornozott
  FROM public.kiadas k, p
  WHERE k.congregation_id = p.cid AND k.deleted = false
    AND k.datum::date BETWEEN make_date(p.ev,1,1) AND make_date(p.ev,12,31)
)
SELECT to_char(ho, 'YYYY-MM')                        AS honap,
       count(*)                                      AS osszes_nem_torolt,
       count(*) FILTER (WHERE stornozott)            AS stornozott_db,
       count(*) FILTER (WHERE NOT stornozott)        AS ervenyes_db
FROM t
GROUP BY ho
HAVING count(*) FILTER (WHERE NOT stornozott) = 0
ORDER BY ho;


-- ==========================================================================
--  Kiadási kísérőív + Dispoziție de plată/încasare + Decont (elszámolás) 
-- ==========================================================================

-- [10.1] Kideríti, hogy a kifizetési rendelvényeket (Dispoziție de plată) MILYEN költségvetési tételre könyveli a rendszer. VÁRT: ha a gyülekezet ad elszámolási előleget, annak a '207.02' (Kiadott hitelek) kódnál kell megjelennie. Ha az előlegek valódi kiadási tételeknél (pl. 201.11, 201.12, 201.13) állnak, akkor a decont 107.02-es visszavezetése miatt a SZÁMADÁS duplán tartalmazza a kiadást.
-- Milyen KÖLTSÉGVETÉSI TÉTELRE könyvelődnek a kifizetési rendelvények?
SELECT d.ev,
       COALESCE(kc.id_szamadasicel, '(nincs kategoria)') AS szamadasi_kod,
       COALESCE(sc.nev, '-')                             AS tetel_neve,
       count(*)                                          AS db,
       sum(d.osszeg)                                     AS osszeg_ron
FROM public.dispozitie d
LEFT JOIN public.kiadas       k  ON k.id  = d.kiadas_id
LEFT JOIN public.kiadascel    kc ON kc.id = COALESCE(k.id_kiadascel, d.id_kiadascel)
LEFT JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
WHERE d.tipus = 'plata'
  AND d.deleted = false
GROUP BY 1, 2, 3
ORDER BY d.ev DESC, db DESC;

-- [10.2] Megmutatja azokat a decontokat, amelyekben szerepel „kapott előleg”, de az azt megelőző fél évben NINCS hozzá 207.02-re könyvelt kiadás ugyanarra a névre. VÁRT: ÜRES eredmény. Minden sor azt jelenti, hogy a rendszer 107.02-re NÉMÁN visszavezetett egy előleget, amit soha nem adtak ki 207.02-n — a kasszakönyv ilyenkor TÖBBLETET mutat a fizikai pénztárhoz képest.
-- Fedezetlen eloleg-visszavezetes: van eloleg a decontban, de nincs 207.02-es kiadas hozza
SELECT d.ev, d.sorszam, d.datum, d.elszamolo_nev, d.kapott_eloleg, d.osszkoltseg
FROM public.decont d
WHERE d.deleted = false
  AND d.kapott_eloleg > 0
  AND NOT EXISTS (
        SELECT 1
        FROM public.kiadas k
        JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
        WHERE k.congregation_id = d.congregation_id
          AND k.deleted   = false
          AND k.stornozott = false
          AND kc.id_szamadasicel = '207.02'
          AND k.datum::date <= d.datum
          AND k.datum::date >= d.datum - 180
          AND lower(COALESCE(k.atvevo, '')) LIKE '%' || lower(d.elszamolo_nev) || '%'
      )
ORDER BY d.ev DESC, d.sorszam;

-- [10.3] Ellenőrzi a Változások 2026 szerinti 1 000 lej/nap/személy készpénzes előleg-plafont a 207.02-re könyvelt készpénzes kiadásokon. VÁRT: ÜRES eredmény. Minden sor egy-egy szabálysértő nap/személy párost mutat (a rendszer ma ezt nem akadályozza meg).
-- Eloleg-plafon tullepes: 207.02-es KESZPENZES kiadas > 1000 lej / nap / szemely
SELECT k.datum::date                                AS nap,
       COALESCE(NULLIF(btrim(k.atvevo), ''), '(nincs nev)') AS szemely,
       sum(COALESCE(k.osszeg_ron, k.osszeg))        AS napi_eloleg_ron,
       count(*)                                     AS tetel_db
FROM public.kiadas k
JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
WHERE k.deleted    = false
  AND k.stornozott = false
  AND k.bankszamla_id IS NULL          -- keszpenz (nem banki)
  AND kc.id_szamadasicel = '207.02'
GROUP BY 1, 2
HAVING sum(COALESCE(k.osszeg_ron, k.osszeg)) > 1000
ORDER BY 1 DESC;

-- [10.4] Megmutatja azokat a nap+forrás párokat, ahol 20-nál több kiadás van, tehát a hivatalos űrlap TÖBB kísérőív-lapot ír elő (20 sor/lap), a Kartotéka viszont egyetlen hosszú lapot nyomtat. VÁRT: ÜRES. Ahol nem üres, ott a nyomtatvány formailag eltér a hivatalostól, és a `hivatalos_lapszam` oszlop megmondja, hány lap kellene.
-- Hol kellene a hivatalos urlap szerint TOBB kiseroiv-lap? (20 sor / lap)
SELECT k.datum::date                         AS nap,
       COALESCE(b.bank_neve, 'Kassza')       AS forras,
       count(*)                              AS kiadas_db,
       ceil(count(*)::numeric / 20)          AS hivatalos_lapszam
FROM public.kiadas k
LEFT JOIN public.bankszamlak b ON b.id = k.bankszamla_id
WHERE k.deleted = false
  AND k.stornozott = false
GROUP BY 1, 2
HAVING count(*) > 20
ORDER BY 3 DESC;

-- [10.5] Kimutatja, hány BANKI kiadásos nap van bankszámlánként — a Változások 2026 szerint mindegyik mellé KÖTELEZŐ kiadási kísérőívet nyomtatni. VÁRT: ha itt bármelyik bankszámlánál nagy szám áll, akkor pontosan annyi kísérőívet kellett volna kinyomtatni; ma viszont a kísérőív-gomb csak a Tranzakciók fülön van, a Bank fülön nincs.
-- Hany BANKI kiadasos nap van? (mindegyik melle kiseroiv kell)
SELECT b.bank_neve,
       b.valuta,
       count(DISTINCT k.datum::date)          AS kiadasos_napok,
       count(*)                               AS kiadas_db,
       sum(COALESCE(k.osszeg_ron, k.osszeg))  AS osszeg_ron
FROM public.kiadas k
JOIN public.bankszamlak b ON b.id = k.bankszamla_id
WHERE k.deleted = false
  AND k.stornozott = false
GROUP BY 1, 2
ORDER BY 4 DESC;

-- [10.6] Ellenőrzi, léteznek-e (és aktívak-e) azok a kategóriák, amelyekre a hivatalos előleg-kör és a leltári tárgy sor épül. VÁRT: mindhárom sorban `db = 1` és `aktiv = true`. Ha a 107.02 hiányzik, a decont mentése HIBÁVAL leáll (ez szándékos fail-closed viselkedés: decont-actions.ts:302-309). Ha a 207.02 hiányzik vagy inaktív, az előleget nem is lehet a helyes tételre könyvelni.
-- Megvannak-e a hivatalos eloleg-kor kategoriai?
SELECT '207.02 kiadascel (Kiadott hitelek)'      AS mit,
       count(*)                                   AS db,
       bool_or(kc.aktiv)                          AS aktiv
FROM public.kiadascel kc WHERE kc.id_szamadasicel = '207.02'
UNION ALL
SELECT '107.02 befizetescel (Visszakapott hitelek)',
       count(*), bool_or(bc.aktiv)
FROM public.befizetescel bc WHERE bc.id_szamadasicel = '107.02'
UNION ALL
SELECT '201.12 kiadascel (Kis erteku leltari targyak)',
       count(*), bool_or(kc.aktiv)
FROM public.kiadascel kc WHERE kc.id_szamadasicel = '201.12';

-- [10.7] Decontonként megmutatja a tételszámot és azt, hány KÜLÖNBÖZŐ kiadás-kategóriára könyvelődtek a tételei. VÁRT: `tetel_db` legfeljebb 20 (a hivatalos űrlap 20 soros). A `kulonbozo_kategoria` ma MINDIG 1 lesz — ez maga a hiba: ha egy elszámolásban vegyes jellegű számlák vannak, a hivatalos szerint számlánként a megfelelő kiadási tételhez kellene könyvelni.
-- Decontok: tetelszam es kategoria-szoras
SELECT d.ev,
       d.sorszam,
       d.datum,
       d.elszamolo_nev,
       d.kapott_eloleg,
       d.osszkoltseg,
       jsonb_array_length(d.tetelek)      AS tetel_db,
       count(k.id)                        AS konyvelt_kiadas_db,
       count(DISTINCT k.id_kiadascel)     AS kulonbozo_kategoria
FROM public.decont d
LEFT JOIN public.kiadas k
       ON k.decont_id = d.id AND k.deleted = false
WHERE d.deleted = false
GROUP BY 1, 2, 3, 4, 5, 6, 7
ORDER BY d.ev DESC, d.sorszam;

-- [10.8] Kilistázza a 201.12 (Kis értékű leltári tárgyak) tételre könyvelt kiadásokat. VÁRT: minden ilyen sorhoz a hivatalos kísérőív külön „…kiadási szám alatt vásárolt tárgy leltári száma: ____” sort nyomtat, a Kartotéka viszont NEM. Ez a lista mutatja meg, hány kísérőívről hiányzik ma ez a sor — és egyben azt is, melyik beszerzésekhez kellene leltári tétel.
-- 201.12 Kis erteku leltari targyak beszerzese — ezekhez kell a leltari szam sor
SELECT k.datum::date                        AS nap,
       COALESCE(b.bank_neve, 'Kassza')      AS forras,
       k.iratszam,
       k.irattipus,
       k.atvevo,
       COALESCE(k.osszeg_ron, k.osszeg)     AS osszeg_ron,
       k.megjegyzes
FROM public.kiadas k
JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
LEFT JOIN public.bankszamlak b ON b.id = k.bankszamla_id
WHERE k.deleted    = false
  AND k.stornozott = false
  AND kc.id_szamadasicel = '201.12'
ORDER BY 1 DESC
LIMIT 200;

-- [10.9] Ellenőrzi a bizonylat-sorozatok hézagmentességét típusonként (a hivatalos Excel COUNTIF-es sorszámozása hézagmentes). VÁRT: `hiany = 0` minden sorban, és `min_sorszam = 1`. Ha `hiany > 0`, akkor sorszám égett el (megszakadt/visszagörgetett mentés) — a hivatalos sorozatban lyuk van, amit az ellenőrnek meg kell magyarázni.
-- Bizonylat-sorozatok hezagmentessege (decont, dp_plata, dp_incasare)
SELECT ev, 'decont' AS tipus,
       min(sorszam) AS min_sorszam, max(sorszam) AS max_sorszam,
       count(*) AS db, max(sorszam) - count(*) AS hiany
FROM public.decont WHERE deleted = false GROUP BY ev
UNION ALL
SELECT ev, 'dp_' || tipus,
       min(sorszam), max(sorszam), count(*), max(sorszam) - count(*)
FROM public.dispozitie WHERE deleted = false GROUP BY ev, tipus
ORDER BY 1 DESC, 2;

-- [10.10] Megmutatja, hogy a `kiadasikiseroiv` tábla használatban van-e, és milyen RLS-policy védi. VÁRT: `sorok_szama = 0` (a rendszer soha nem írja) ÉS a `using_feltetel` NEM 'true'. Ha a feltétel 'true', bármely bejelentkezett felhasználó olvashatja MÁS gyülekezet kísérőív-sorait — egy holt táblán felesleges nyitott felület.
-- A holt `kiadasikiseroiv` tabla: hasznalatban van-e, es mi vedi?
SELECT (SELECT count(*) FROM public.kiadasikiseroiv) AS sorok_szama,
       p.policyname,
       p.cmd,
       p.roles::text                                  AS szerepek,
       COALESCE(p.qual, '(nincs USING)')              AS using_feltetel
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename  = 'kiadasikiseroiv'
ORDER BY p.policyname;


-- ==========================================================================
--  Adatok_2026 — kasszakönyv és banknapló adatbevitel (Kassza / Kasszakon
-- ==========================================================================

-- [11.1] Kideríti, hogy a belső-mozgás (kassza↔bank, bank↔bank) kódokból mi van a törzsben és mi AKTÍV. VÁRT a hivatalos modell szerint: a 300.01–300.20, 400.01–400.20 és a 301..320 / 401..420 családok is jelen és aktívak lennének. HA csak 300.01 / 301.01 / 400.01 / 401.01 / 402.02 jön vissza aktívként, akkor a 4. eltérés IGAZOLT: a 2. és további bankszámla belső mozgása rossz nevet kap az Excel-exportban.
select s.id as kod, s.nev, s.nevro, s.type, s.aktiv,
       (select count(*) from public.befizetescel bc where bc.id_szamadasicel = s.id) as befizetescel_db,
       (select count(*) from public.kiadascel   kc where kc.id_szamadasicel = s.id) as kiadascel_db
from public.szamadasicel s
where s.id ~ '^(3[0-2][0-9]|4[0-2][0-9])[.]'
order by s.id;

-- [11.2] Megmutatja, hány aktív bankszámlája van gyülekezetenként. A hivatalos Adatok_2026 legfeljebb 20 banklapot (A–T) ismer, és MINDEN számlához külön belső-mozgás tétel tartozik. VÁRT: minden sor <= 20. Ahol az aktiv_bankszamla > 1, ott az előző ellenőrzés hiánya ÉLESEN érinti a könyvelést.
select c.id as congregation_id, c.name as gyulekezet,
       count(*) filter (where b.aktiv) as aktiv_bankszamla,
       count(*) as osszes_bankszamla
from public.congregations c
join public.bankszamlak b on b.congregation_id = c.id
group by c.id, c.name
order by aktiv_bankszamla desc, gyulekezet;

-- [11.3] A hivatalos ív a Kassza H6 („Előző évi készpénzegyenleg”) és a banklapok H6 („Előző évi egyenleg”) celláiból indul. Ez megmutatja, rögzítve van-e a 2026-os nyitó. VÁRT: minden könyvelő gyülekezetnél van keszpenz_nyito_2026 érték, és a bank_nyito_2026_db = aktiv_bank_db. Ahol NULL vagy kevesebb, ott a záró egyenleg és a Számadás 1. sora („Múlt évi pénztármaradvány”) HIBÁS lesz.
select c.name as gyulekezet,
       (select k.nyito_egyenleg from public.keszpenz_nyito_egyenleg k
         where k.congregation_id = c.id and k.eve = 2026) as keszpenz_nyito_2026,
       (select count(*) from public.bankszamlak b
         where b.congregation_id = c.id and b.aktiv) as aktiv_bank_db,
       (select count(*) from public.bankszamla_nyito_egyenleg n
         where n.congregation_id = c.id and n.eve = 2026) as bank_nyito_2026_db
from public.congregations c
order by c.name;

-- [11.4] A hivatalos Kassza lap I2 cellája élesben figyelmeztet, ha a készpénz-egyenleg meghaladja az 50 000 lejt; a Kartotékában ilyen jelzés nincs. Ez visszamenőleg kilistázza azokat a NAPOKAT 2026-ban, amikor a kassza záró egyenlege 50 000 lej fölé ment. VÁRT: ÜRES eredmény. Ha van sor, a többletet 3 napon belül bankba kellett volna helyezni.
with mozgas as (
  select b.congregation_id, b.datum::date as nap, coalesce(b.osszeg_ron, b.osszeg) as valtozas
  from public.befizetes b
  where b.bankszamla_id is null and not b.deleted and not b.stornozott
    and b.datum >= date '2026-01-01' and b.datum <= date '2026-12-31'
  union all
  select k.congregation_id, k.datum::date, -coalesce(k.osszeg_ron, k.osszeg)
  from public.kiadas k
  where k.bankszamla_id is null and not k.deleted and not k.stornozott
    and k.datum >= timestamp '2026-01-01 00:00' and k.datum < timestamp '2027-01-01 00:00'
), napi as (
  select congregation_id, nap, sum(valtozas) as napi_valtozas
  from mozgas group by congregation_id, nap
), gorgo as (
  select n.congregation_id, n.nap,
         coalesce((select ke.nyito_egyenleg from public.keszpenz_nyito_egyenleg ke
                    where ke.congregation_id = n.congregation_id and ke.eve = 2026), 0)
         + sum(n.napi_valtozas) over (partition by n.congregation_id order by n.nap
              rows between unbounded preceding and current row) as zaro_egyenleg
  from napi n
)
select c.name as gyulekezet, g.nap, round(g.zaro_egyenleg, 2) as kassza_zaro_egyenleg
from gorgo g join public.congregations c on c.id = g.congregation_id
where g.zaro_egyenleg > 50000
order by c.name, g.nap;

-- [11.5] A hivatalos ív érvényesítése IF(ROUND(H6,2)=H6,TRUE,FALSE) — legfeljebb 2 tizedes. Ez kilistázza a 2 tizedesnél pontosabb összegeket. VÁRT: 0 sor. Ha van találat, az Excel-export/újraimport kerekítési eltérést okoz, és a Számadás egyenlege fillérekkel elcsúszik.
select 'befizetes' as tabla, b.id, b.congregation_id, b.datum::date as datum, b.osszeg, b.osszeg_ron
from public.befizetes b
where not b.deleted and round(b.osszeg, 2) <> b.osszeg
union all
select 'kiadas', k.id, k.congregation_id, k.datum::date, k.osszeg, k.osszeg_ron
from public.kiadas k
where not k.deleted and round(k.osszeg, 2) <> k.osszeg
order by 1, 4;

-- [11.6] Megmutatja, milyen irattípusokat rögzítenek VALÓJÁBAN. A nyomtatott Registru Casa minden készpénzes sort 'Chit.'-nek, a Registru Banca minden bevételt 'Extr', minden kiadást 'OP'-nak ír. VÁRT: ha itt csak 'Chit.'/'Extr'/'OP' szerepel, a felülírás ártalmatlan. Ha 'Factură', 'Dispoziție', 'Decont', 'Készpénz' stb. is előfordul, akkor a hivatalos regiszter ELLENTMOND a lefűzött iratnak.
select case when bankszamla_id is null then 'kassza' else 'bank' end as hol,
       irattipus, count(*) as db
from (
  select bankszamla_id, irattipus from public.befizetes
   where not deleted and not stornozott
     and datum >= date '2026-01-01' and datum <= date '2026-12-31'
  union all
  select bankszamla_id, irattipus from public.kiadas
   where not deleted and not stornozott
     and datum >= timestamp '2026-01-01 00:00' and datum < timestamp '2027-01-01 00:00'
) t
group by 1, 2
order by 1, db desc;

-- [11.7] Megméri, mennyi információ vész el a nyomtatott regiszterekből. A hivatalos Explicaţii oszlop tartalmazza a Megjegyzést, a Kartotéka getDescription() nem. VÁRT: minél nagyobb a van_megjegyzes szám, annál több sor jelenik meg CSONKA magyarázattal a Registru Casa / Banca / Jurnal lapokon.
select c.name as gyulekezet,
       count(*) filter (where t.megjegyzes is not null and btrim(t.megjegyzes) <> '') as van_megjegyzes,
       count(*) as osszes_tetel
from (
  select congregation_id, megjegyzes from public.befizetes
   where not deleted and not stornozott
     and datum >= date '2026-01-01' and datum <= date '2026-12-31'
  union all
  select congregation_id, megjegyzes from public.kiadas
   where not deleted and not stornozott
     and datum >= timestamp '2026-01-01 00:00' and datum < timestamp '2027-01-01 00:00'
) t
join public.congregations c on c.id = t.congregation_id
group by c.name
order by van_megjegyzes desc;

-- [11.8] A hivatalos Hibak lap C7:C27 minden számlapárra ellenőrzi, hogy a kivezetés és a bevezetés találkozik-e. Ez az adatbázis-oldali megfelelője: azonos napon és azonos RON-összegnél egyeznie kell a belső bevétel- és kiadás-darabszámnak. VÁRT: ÜRES eredmény (mindenhol 0 a különbség). Ami visszajön, ott hiányzik a mozgás párja — pont az, amit a hivatalos ív pirossal jelezne.
with belso as (
  select congregation_id, datum::date as nap,
         round(coalesce(osszeg_ron, osszeg), 2) as ron, 1 as bev, 0 as kia
  from public.befizetes
  where belso_mozgas_xkey is not null and not deleted and not stornozott
    and datum >= date '2026-01-01' and datum <= date '2026-12-31'
  union all
  select congregation_id, datum::date,
         round(coalesce(osszeg_ron, osszeg), 2), 0, 1
  from public.kiadas
  where belso_mozgas_xkey is not null and not deleted and not stornozott
    and datum >= timestamp '2026-01-01 00:00' and datum < timestamp '2027-01-01 00:00'
)
select c.name as gyulekezet, b.nap, b.ron,
       sum(b.bev) as belso_bevetel_db, sum(b.kia) as belso_kiadas_db,
       sum(b.bev) - sum(b.kia) as kulonbseg
from belso b join public.congregations c on c.id = b.congregation_id
group by c.name, b.nap, b.ron
having sum(b.bev) <> sum(b.kia)
order by c.name, b.nap;

-- [11.9] Az Excel-export a kategória NEVÉT írja az I/K oszlopba, és a hivatalos munkafüzet SUMIF-je NÉV szerint aggregál. Ez kilistázza a 2026-ban ténylegesen HASZNÁLT jogcímeket. VÁRT: minden sornál aktiv = true, és a nev/nevro is kitöltött. Ahol aktiv = false vagy nevro üres, ott a hivatalos ívben #N/A lesz a Magyarázat és a Költségvetési szám.
select 'bevetel' as oldal, bc.id_szamadasicel as kod, bc.nev, bc.nevro, bc.aktiv, count(b.id) as hasznalat
from public.befizetes b
join public.befizetescel bc on bc.id = b.id_befizetescel
where not b.deleted and b.datum >= date '2026-01-01' and b.datum <= date '2026-12-31'
group by 1,2,3,4,5
union all
select 'kiadas', kc.id_szamadasicel, kc.nev, kc.nevro, kc.aktiv, count(k.id)
from public.kiadas k
join public.kiadascel kc on kc.id = k.id_kiadascel
where not k.deleted and k.datum >= timestamp '2026-01-01 00:00' and k.datum < timestamp '2027-01-01 00:00'
group by 1,2,3,4,5
order by 1, 2;

-- [11.10] Bizonyítja, hogy a „hónapot a havi kasszakönyvvel lezárjuk” előírásnak NINCS adatbázis-megfelelője. Kilistázza a séma minden olyan oszlopát, ami hónap-/zárolás-szagú. VÁRT: csak ÉVES véglegesítés jön vissza (bealitas.budget_finalized, accounting_finalized, leltar_finalized) — havi zárolást jelző oszlop egy sem. Ha tényleg így van, a 1. eltérés IGAZOLT.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%honap%' or column_name ilike '%month%'
       or column_name ilike '%zarolt%' or column_name ilike '%lezar%'
       or column_name ilike '%finalized%' or column_name ilike '%closed%')
order by table_name, column_name;
