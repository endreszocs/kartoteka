-- ═══════════════════════════════════════════════════════════════════════════
--  BELSŐ MOZGÁS — DUPLIKÁTUM-KERESŐ (CSAK OLVAS)
--  2026-09-03 — Futtatja: Endre (Supabase Studio SQL Editor)
--
--  MIÉRT: a készpénzes rögzítő „Párosítatlan tétel átvétele" választója
--  (v0.9.215 óta élesben) NEM párosított, hanem DUPLIKÁLT: a mentés friss
--  párosító kulccsal MINDKÉT lábat újra beszúrta, a kiválasztott árva sor
--  pedig érintetlen maradt. Ez a lekérdezés megmutatja, keletkezett-e ebből
--  tényleges kettős könyvelés — és ha igen, pontosan melyik sorokból.
--
--  SEMMIT NEM MÓDOSÍT. Egyetlen sort sem ír, nem töröl.
--
--  HOGYAN FUTTASD — KÉT BLOKK, EGYESÉVEL. A Supabase SQL editor csak az
--  UTOLSÓ eredmény-rácsot mutatja, ezért NE futtasd az egész fájlt egyszerre:
--  jelöld ki az egyik blokkot (bannertől bannerig), Run, olvasd le, aztán a
--  következőt.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1. LEKÉRDEZÉS — ÖSSZKÉP (jelöld ki innentől a 2. bannerig)
--
--  Egy rács, néhány sor. Ha a „gyanús csoport" 0, nincs teendő.
-- ═══════════════════════════════════════════════════════════════════════════

WITH bm_kodok(kod) AS (
  VALUES ('300.01'), ('301.01'), ('400.01'), ('401.01'), ('402.02')
),
-- Minden ÉLŐ belső-mozgás sor, mindkét oldalról, egységes alakban.
sorok AS (
  SELECT 'befizetes' AS oldal, b.id, b.congregation_id, b.datum::date AS datum,
         b.osszeg, b.bankszamla_id, b.belso_mozgas_xkey, b.iratszam, b.forrasa AS partner
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  WHERE bc.id_szamadasicel IN (SELECT kod FROM bm_kodok)
    AND COALESCE(b.deleted, false) = false AND COALESCE(b.stornozott, false) = false
  UNION ALL
  SELECT 'kiadas', k.id, k.congregation_id, k.datum::date,
         k.osszeg, k.bankszamla_id, k.belso_mozgas_xkey, k.iratszam, k.atvevo
  FROM public.kiadas k
  JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
  WHERE kc.id_szamadasicel IN (SELECT kod FROM bm_kodok)
    AND COALESCE(k.deleted, false) = false AND COALESCE(k.stornozott, false) = false
),
-- GYANÚS CSOPORT: ugyanaz a gyülekezet + oldal + dátum + összeg + helyszín
-- TÖBB sorral. Egy szabályos átvezetésnél oldalanként EGY sor áll.
gyanus AS (
  SELECT congregation_id, oldal, datum, osszeg, bankszamla_id, count(*) AS db,
         count(DISTINCT COALESCE(belso_mozgas_xkey, '(nincs)')) AS kulcsok
  FROM sorok
  GROUP BY 1,2,3,4,5
  HAVING count(*) > 1
),
o_csoport AS (
  SELECT '1) gyanús csoport (azonos oldal+dátum+összeg+helyszín, több sorral)' AS kulcs,
         COALESCE(count(*)::text, '0') AS ertek
  FROM gyanus
),
o_tobblet AS (
  SELECT '2) FÖLÖS sorok száma (csoportonként a legelső felett)',
         COALESCE(sum(db - 1)::text, '0')
  FROM gyanus
),
o_osszeg AS (
  SELECT '3) a fölös sorok összege (RON) — ennyivel torzulhat a könyv',
         COALESCE(to_char(sum((db - 1) * osszeg), 'FM999G999G990D00'), '0,00')
  FROM gyanus
),
o_bm_ossz AS (
  SELECT '4) élő belső-mozgás sorok összesen (befizetes / kiadas)',
         (SELECT count(*) FROM sorok WHERE oldal = 'befizetes')::text || ' / ' ||
         (SELECT count(*) FROM sorok WHERE oldal = 'kiadas')::text
),
o_kulcstalan AS (
  SELECT '5) párosító kulcs NÉLKÜLI („árva") sorok',
         (SELECT count(*) FROM sorok WHERE belso_mozgas_xkey IS NULL)::text
),
o_bm_iratszam AS (
  SELECT '6) a RÖGZÍTŐBŐL származó sorok (BM-… iratszám)',
         (SELECT count(*) FROM sorok WHERE iratszam LIKE 'BM-%')::text
),
o_mester AS (
  SELECT '7) belsomozgas mestersorok (élő)',
         (SELECT count(*) FROM public.belsomozgas WHERE COALESCE(deleted, false) = false)::text
)
SELECT * FROM o_csoport
UNION ALL SELECT * FROM o_tobblet
UNION ALL SELECT * FROM o_osszeg
UNION ALL SELECT * FROM o_bm_ossz
UNION ALL SELECT * FROM o_kulcstalan
UNION ALL SELECT * FROM o_bm_iratszam
UNION ALL SELECT * FROM o_mester
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
--  2. LEKÉRDEZÉS — A GYANÚS SOROK TÉTELESEN (jelöld ki innentől a fájl végéig)
--
--  Csak akkor futtasd, ha az 1. lekérdezés 1) sora nem 0.
--  Olvasás: az azonos `csoport` értékű sorok ugyanarra a pénzre vonatkoznak.
--  A `BM-…` iratszámú sor a rögzítőből jött; a kulcs nélküli sor tipikusan a
--  banki importból. TÖRLÉS ELŐTT MINDIG nézd meg a bankkivonatot is.
-- ═══════════════════════════════════════════════════════════════════════════

WITH bm_kodok(kod) AS (
  VALUES ('300.01'), ('301.01'), ('400.01'), ('401.01'), ('402.02')
),
sorok AS (
  SELECT 'befizetes' AS oldal, b.id, b.congregation_id, b.datum::date AS datum,
         b.osszeg, b.bankszamla_id, b.belso_mozgas_xkey, b.iratszam, b.forrasa AS partner,
         b.megjegyzes
  FROM public.befizetes b
  JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
  WHERE bc.id_szamadasicel IN (SELECT kod FROM bm_kodok)
    AND COALESCE(b.deleted, false) = false AND COALESCE(b.stornozott, false) = false
  UNION ALL
  SELECT 'kiadas', k.id, k.congregation_id, k.datum::date,
         k.osszeg, k.bankszamla_id, k.belso_mozgas_xkey, k.iratszam, k.atvevo,
         k.megjegyzes
  FROM public.kiadas k
  JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
  WHERE kc.id_szamadasicel IN (SELECT kod FROM bm_kodok)
    AND COALESCE(k.deleted, false) = false AND COALESCE(k.stornozott, false) = false
),
gyanus AS (
  SELECT congregation_id, oldal, datum, osszeg, bankszamla_id
  FROM sorok
  GROUP BY 1,2,3,4,5
  HAVING count(*) > 1
)
SELECT
  dense_rank() OVER (ORDER BY s.congregation_id, s.datum, s.osszeg, s.oldal, s.bankszamla_id) AS csoport,
  COALESCE(c.nev_hu, c.name, s.congregation_id::text) AS gyulekezet,
  s.oldal,
  s.id,
  s.datum,
  s.osszeg,
  COALESCE(ba.bank_neve, '(kassza)') AS helyszin,
  COALESCE(s.iratszam, '') AS iratszam,
  CASE WHEN s.belso_mozgas_xkey IS NULL THEN 'ÁRVA (nincs kulcs)' ELSE left(s.belso_mozgas_xkey, 8) || '…' END AS parosito_kulcs,
  COALESCE(s.partner, '') AS megnevezes,
  COALESCE(s.megjegyzes, '') AS megjegyzes
FROM sorok s
JOIN gyanus g
  ON g.congregation_id = s.congregation_id AND g.oldal = s.oldal AND g.datum = s.datum
 AND g.osszeg = s.osszeg AND g.bankszamla_id IS NOT DISTINCT FROM s.bankszamla_id
LEFT JOIN public.congregations c ON c.id = s.congregation_id
LEFT JOIN public.bankszamlak ba ON ba.id = s.bankszamla_id
ORDER BY csoport, s.oldal, s.id;
