-- ═══════════════════════════════════════════════════════════════════════════
--  SZÁLLÍTÓI SZÁMLÁK — ANAF-KULCS VÁLTÁS DIAGNOSZTIKA (CSAK OLVAS)
--  2026-09-04 — Futtatja: Endre (Supabase Studio SQL Editor)
--
--  MIÉRT: Endre valódi ANAF SPV-exportján kiderült, hogy a fájlnév-alapú
--  kulcsképzés az ELSŐ 8+ jegyű számfutamot vette, nem az UTOLSÓT. Az ANAF neve
--  `<CÉG>_<SOROZAT>_<INDEX>.xml` — az INDEX az utolsó rész. Ha a SOROZAT is
--  8+ jegyű (LIDL `1038726021242`, Electrica `EFI2613512321`), a régi kulcs a
--  szállító számlaszámának belseje lett, nem az ANAF-index. 14-ből 6 fájlnál.
--
--  A KÓD MOSTANTÓL az utolsó futamot használja, ÉS a duplikátum-ellenőrzés a
--  RÉGI kulcsot is nézi (kettős kulcs) — újraimportnál NEM keletkezik második
--  sor. Az élő sorok kulcsa VÁLTOZATLAN marad, amíg ezt nem döntjük el.
--
--  EZ A LEKÉRDEZÉS MEGMONDJA: hány élő sor áll a régi (első-futam) kulcson,
--  és mi lenne az új kulcsa. SEMMIT NEM MÓDOSÍT.
--
--  HOGYAN FUTTASD — KÉT BLOKK, EGYESÉVEL (a szerkesztő csak az UTOLSÓ rácsot
--  mutatja). Sorrend: 1. ÖSSZKÉP → 2. TÉTELES.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1. LEKÉRDEZÉS — ÖSSZKÉP (jelöld ki innentől a 2. bannerig)
-- ═══════════════════════════════════════════════════════════════════════════

WITH sorok AS (
  SELECT
    sz.id, sz.congregation_id, sz.anaf_uuid, sz.szamla_szam, sz.szallito_nev,
    d.file_name,
    -- A fájlnév 8+ jegyű számfutamai, sorrendben (kiterjesztés nélkül).
    regexp_matches(regexp_replace(COALESCE(d.file_name, ''), '\.(zip|xml|pdf)+$', '', 'i'), '\d{8,}', 'g') AS futam
  FROM public.szallitoi_szamla sz
  LEFT JOIN public.gyulekezeti_dokumentum d ON d.id = sz.xml_dokumentum_id
),
futamok AS (
  SELECT id, congregation_id, anaf_uuid, szamla_szam, szallito_nev, file_name,
         array_agg(futam[1]) AS futamok
  FROM sorok
  GROUP BY 1,2,3,4,5,6
),
besorolt AS (
  SELECT *,
         futamok[1] AS elso,
         futamok[array_length(futamok, 1)] AS utolso,
         CASE
           WHEN file_name IS NULL THEN '4) nincs kapcsolt XML — a kulcs nem számolható újra'
           WHEN array_length(futamok, 1) IS NULL THEN '3) a fájlnévben nincs 8+ jegyű futam (identitás- vagy UUID-kulcs)'
           WHEN array_length(futamok, 1) = 1 THEN '1) egy futam — a régi és az új kulcs AZONOS'
           WHEN anaf_uuid = futamok[1] AND futamok[1] <> futamok[array_length(futamok, 1)]
             THEN '2) ⚠️ RÉGI (első-futam) kulcson áll — az új kulcs más lenne'
           WHEN anaf_uuid = futamok[array_length(futamok, 1)] THEN '1b) már az ÚJ (utolsó-futam) kulcson áll'
           ELSE '5) a kulcs nem a fájlnévből jött (cbc:UUID / azon:)'
         END AS besorolas
  FROM futamok
),
o1 AS (SELECT besorolas AS kulcs, count(*)::text AS ertek FROM besorolt GROUP BY 1),
o2 AS (
  SELECT '➡️ VERDIKT' AS kulcs,
         CASE WHEN (SELECT count(*) FROM besorolt WHERE besorolas LIKE '2)%') = 0
              THEN '✅ nincs régi kulcson álló sor — nincs teendő'
              ELSE '⚠️ ' || (SELECT count(*) FROM besorolt WHERE besorolas LIKE '2)%')::text ||
                   ' sor a régi kulcson — a kettős ellenőrzés védi; átkulcsolás OPCIONÁLIS (2. blokk mutatja)'
         END AS ertek
),
o3 AS (SELECT 'összes élő szállítói számla' AS kulcs, count(*)::text FROM public.szallitoi_szamla)
SELECT * FROM o2
UNION ALL SELECT * FROM o1
UNION ALL SELECT * FROM o3
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
--  2. LEKÉRDEZÉS — A RÉGI KULCSON ÁLLÓ SOROK TÉTELESEN (jelöld ki innentől)
--
--  Csak akkor futtasd, ha az 1. blokk verdiktje ⚠️. Olvasás: `regi_kulcs` = ami
--  ma az anaf_uuid-ban áll, `uj_kulcs` = amit a mai kód adna. Az `utkozik`
--  oszlop jelzi, ha az új kulcs MÁR foglalt egy másik soron (akkor átkulcsolni
--  TILOS — az egy valódi másik számla).
-- ═══════════════════════════════════════════════════════════════════════════

WITH sorok AS (
  SELECT sz.id, sz.congregation_id, sz.anaf_uuid, sz.szamla_szam, sz.szallito_nev, sz.kiallitas_datum, d.file_name,
         regexp_matches(regexp_replace(COALESCE(d.file_name, ''), '\.(zip|xml|pdf)+$', '', 'i'), '\d{8,}', 'g') AS futam
  FROM public.szallitoi_szamla sz
  JOIN public.gyulekezeti_dokumentum d ON d.id = sz.xml_dokumentum_id
),
futamok AS (
  SELECT id, congregation_id, anaf_uuid, szamla_szam, szallito_nev, kiallitas_datum, file_name,
         array_agg(futam[1]) AS futamok
  FROM sorok GROUP BY 1,2,3,4,5,6,7
),
regi AS (
  SELECT *, futamok[array_length(futamok, 1)] AS uj_kulcs
  FROM futamok
  WHERE array_length(futamok, 1) >= 2
    AND anaf_uuid = futamok[1]
    AND futamok[1] <> futamok[array_length(futamok, 1)]
)
SELECT
  r.id,
  COALESCE(c.nev_hu, c.name) AS gyulekezet,
  r.szallito_nev,
  r.szamla_szam,
  r.kiallitas_datum,
  r.anaf_uuid AS regi_kulcs,
  r.uj_kulcs,
  EXISTS (SELECT 1 FROM public.szallitoi_szamla x
          WHERE x.congregation_id = r.congregation_id AND x.anaf_uuid = r.uj_kulcs AND x.id <> r.id) AS utkozik,
  r.file_name
FROM regi r
LEFT JOIN public.congregations c ON c.id = r.congregation_id
ORDER BY gyulekezet, r.kiallitas_datum;

-- ─────────────────────────────────────────────────────────────────────────────
--  OPCIONÁLIS ÁTKULCSOLÁS — CSAK HA ENDRE KÉRI, ÉS CSAK A 2. BLOKK ÁTNÉZÉSE UTÁN.
--  Kikommentelve érkezik. Feltétel: `utkozik = false` minden érintett soron.
--  A kettős kulcsú duplikátum-ellenőrzés miatt NEM KÖTELEZŐ: újraimport nélküle
--  sem duplikál. Csak a PDF-párosítóval való név-egyezés miatt lenne tisztább.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.szallitoi_szamla sz
-- SET anaf_uuid = r.uj_kulcs
-- FROM ( ... a 2. blokk `regi` CTE-je ... ) r
-- WHERE sz.id = r.id
--   AND NOT EXISTS (SELECT 1 FROM public.szallitoi_szamla x
--                   WHERE x.congregation_id = sz.congregation_id AND x.anaf_uuid = r.uj_kulcs AND x.id <> sz.id);
