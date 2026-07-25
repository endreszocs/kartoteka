-- ============================================================================
-- F6.3 — „fizetett év" ⇄ „pénztári nap" eltérés MÉRÉSE (2026-07-25)
--
-- MIÉRT: két, egymástól független évfogalom él a rendszerben:
--   * befizetes.fizetettev = KÖTELEZETTSÉGI (jogcím-) ÉV — „melyik évre szól"
--   * befizetes.datum      = PÉNZTÁRI NAP            — „mikor folyt be"
-- A tartozás-motor a fizetettev-vel számol, a kassza/számadás a datum-mal.
-- Ez ÖNMAGÁBAN helyes; a kockázat ott van, ahol a kettő KEVEREDIK.
--
-- Ez a szkript CSAK OLVAS (SELECT) — semmit nem módosít. Futtasd le a Supabase
-- SQL editorban (Database → SQL Editor), és küldd vissza az eredményt. Ez dönti
-- el, hogy a két hátralévő, NAGY kockázatú javítás (asztali kassza-szemantika
-- és a bizonylatszám-sorozat tengelye) egyáltalán él-e élesben.
--
-- ⚠️ A blokkokat FUTTASD EGYENKÉNT (jelöld ki az adott SELECT-et és Ctrl+Enter),
--    így külön-külön látod az öt eredménytáblát.
--
-- Egyetlen gyülekezetre szűkítés: minden blokkban van egy kikommentelt sor
--   -- AND b.congregation_id = '….uuid'
-- — vedd ki a kommentet és írd be az azonosítót, ha csak egy gyülekezet érdekel.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) MENNYI a tényleges eltérés? (fizetettev <> a dátum éve)
--    Ha 0 sor jön: a két tengely gyakorlatilag egybeesik → a kockázat elméleti.
-- ---------------------------------------------------------------------------
SELECT
  b.congregation_id,
  b.fizetettev,
  EXTRACT(YEAR FROM b.datum)::int AS datum_ev,
  count(*)                        AS db,
  sum(b.osszeg)                   AS osszeg,
  min(b.datum)                    AS legkorabbi,
  max(b.datum)                    AS legkesobbi
FROM public.befizetes b
WHERE b.deleted = false
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
  AND b.fizetettev <> EXTRACT(YEAR FROM b.datum)::int
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- ---------------------------------------------------------------------------
-- 2) Ez ÉVHATÁRON túli hátralék-rendezés, vagy szórvány elgépelés?
--    (a jellemző, EGÉSZSÉGES eset: januárban rendezett előző évi hátralék)
-- ---------------------------------------------------------------------------
SELECT
  CASE
    WHEN EXTRACT(YEAR FROM b.datum)::int = b.fizetettev + 1
     AND EXTRACT(MONTH FROM b.datum)::int <= 3 THEN 'egészséges: év eleji hátralék-rendezés'
    WHEN EXTRACT(YEAR FROM b.datum)::int > b.fizetettev THEN 'későbbi befizetés (év közben)'
    ELSE 'ELŐRE fizetett (a dátum éve < fizetettev) — ritka, ellenőrizendő'
  END          AS eset,
  count(*)     AS db,
  min(b.datum) AS legkorabbi,
  max(b.datum) AS legkesobbi
FROM public.befizetes b
WHERE b.deleted = false
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
  AND b.fizetettev <> EXTRACT(YEAR FROM b.datum)::int
GROUP BY 1
ORDER BY 2 DESC;


-- ---------------------------------------------------------------------------
-- 3) BIZONYLATSZÁM-KOCKÁZAT (a legdrágább hiba, ha él).
--
--    A DB egyediség-szabálya a JOGCÍM-ÉV szerint csoportosít
--    (uniq_befizetes_iratszam_year_congregation: congregation_id, fizetettev,
--    iratszam — a részleges feltétele: deleted=false AND irattipus ILIKE
--    '%észpénz%' AND belso_mozgas_xkey IS NULL; a STORNÓZOTT sor is FOGLAL!),
--    a sorszám-generátor viszont a DÁTUM évéből dolgozik.
--
--    Ez a lekérdezés azokat az iratszámokat mutatja, amelyek EGY jogcím-éven
--    belül TÖBB dátum-évhez tartoznak — vagyis ahol a két tengely tényleg
--    széttart. (A „nyugtaszám évente újraindul" eset NEM jön vissza, mert a
--    csoportosítás tartalmazza a fizetettev-et.)
--    Ha 0 sor jön: a sorszámozás átállítása kockázat nélkül elvégezhető.
-- ---------------------------------------------------------------------------
SELECT
  b.congregation_id,
  b.fizetettev,
  b.iratszam,
  count(*)                                            AS db,
  array_agg(DISTINCT EXTRACT(YEAR FROM b.datum)::int) AS datum_evek,
  bool_or(b.stornozott)                               AS van_stornozott,
  min(b.datum)                                        AS legkorabbi,
  max(b.datum)                                        AS legkesobbi
FROM public.befizetes b
WHERE b.deleted = false
  -- a UNIQUE index részleges feltételével AZONOS szűrés (a stornó is foglal!):
  AND b.irattipus ILIKE '%észpénz%'
  AND b.belso_mozgas_xkey IS NULL
  AND b.iratszam IS NOT NULL
  AND b.iratszam NOT ILIKE 'AUTO%'
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
GROUP BY 1, 2, 3
HAVING count(DISTINCT EXTRACT(YEAR FROM b.datum)::int) > 1
ORDER BY 1, 2, 3;


-- ---------------------------------------------------------------------------
-- 3/b) Ugyanez a másik irányból: egy DÁTUM-éven belül ugyanaz az iratszám
--      több jogcím-évvel — a sorszám-generátor (datum-alapú) így hézagot vagy
--      ütközést kaphat. Szintén 0 sor = nincs élő kockázat.
-- ---------------------------------------------------------------------------
SELECT
  b.congregation_id,
  EXTRACT(YEAR FROM b.datum)::int                        AS datum_ev,
  b.iratszam,
  count(*)                                               AS db,
  array_agg(DISTINCT b.fizetettev ORDER BY b.fizetettev) AS jogcim_evek
FROM public.befizetes b
WHERE b.deleted = false
  AND b.irattipus ILIKE '%észpénz%'
  AND b.belso_mozgas_xkey IS NULL
  AND b.iratszam IS NOT NULL
  AND b.iratszam NOT ILIKE 'AUTO%'
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
GROUP BY 1, 2, 3
HAVING count(DISTINCT b.fizetettev) > 1
ORDER BY 1, 2, 3;


-- ---------------------------------------------------------------------------
-- 4) ASZTALI-KOCKÁZAT: mekkora a két nézet különbsége?
--    Az asztali app a helyi másolatot a JOGCÍM-ÉV szerint tölti, a böngésző
--    viszont a DÁTUM szerint — az „elter" oszlop mutatja, hány tétel esik a
--    két halmaz különbségébe.
-- ---------------------------------------------------------------------------
SELECT
  b.congregation_id,
  EXTRACT(YEAR FROM b.datum)::int AS datum_ev,
  count(*) FILTER (WHERE b.fizetettev = EXTRACT(YEAR FROM b.datum)::int)  AS egyezik,
  count(*) FILTER (WHERE b.fizetettev <> EXTRACT(YEAR FROM b.datum)::int) AS elter,
  round(
    100.0 * count(*) FILTER (WHERE b.fizetettev <> EXTRACT(YEAR FROM b.datum)::int)
      / NULLIF(count(*), 0),
    1
  ) AS elter_szazalek
FROM public.befizetes b
WHERE b.deleted = false
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
GROUP BY 1, 2
ORDER BY 1, 2 DESC;


-- ---------------------------------------------------------------------------
-- 5) Van-e érvénytelen jogcím-év? (a séma szerint NOT NULL — ez csak ellenőrzés)
-- ---------------------------------------------------------------------------
SELECT count(*) AS ervenytelen_fizetettev
FROM public.befizetes b
WHERE b.deleted = false
  -- AND b.congregation_id = '00000000-0000-0000-0000-000000000000'
  AND (b.fizetettev IS NULL OR b.fizetettev < 1900 OR b.fizetettev > 2100);
