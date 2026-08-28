-- ═══════════════════════════════════════════════════════════════════════════
-- NYUGTASZÁM-INDEX FELMÉRÉS (D4, pénzügyi audit 2026-08-28) — CSAK OLVAS
--
-- MIÉRT: a nyugtaszám-védő partial UNIQUE index a '%észpénz%' irattípusra
-- szűr, így a webes Chitanță-mentésen (és minden más irattípuson) SEMMILYEN
-- DB-szintű duplikátum-védelem nincs — a MAX+1 alapú számozás mögött ez az
-- egyetlen kényszer. A ház szabálya („nyugtaszám-index INERT — naiv
-- szigorítás TILOS"): ELŐBB felmérjük, mi van a táblában, és CSAK utána
-- döntünk az index-predikátumról — egy vak szigorítás a meglévő (legitim
-- ismétlődésű) adatokon CREATE INDEX-hibával vagy hamis blokkolással sülne el.
--
-- MIT CSINÁL: EGYETLEN eredményrácsban (UNION ALL):
--   [A] a befizetes/kiadas iratszam/nyugta indexei a predikátumukkal,
--   [B] hány NEM-egyedi (congregation+év+irattípus+iratszam) csoport van
--       élő (nem törölt, nem stornózott) sorokon — irattípusonként,
--   [C] a 20 legnagyobb ismétlődő csoport mintaként.
-- SEMMIT NEM MÓDOSÍT. Az eredményt Endre visszaküldi, és együtt döntünk.
-- ═══════════════════════════════════════════════════════════════════════════

WITH idx AS (
  SELECT
    'A | index' AS tipus,
    format('%s ON %s — %s', indexname, tablename, indexdef) AS szoveg,
    1 AS rendezo
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('befizetes', 'kiadas')
    AND (indexdef ILIKE '%iratszam%' OR indexdef ILIKE '%nyugta%')
),
bef_dup AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::int AS ev, irattipus, iratszam, COUNT(*) AS db
  FROM public.befizetes
  WHERE deleted = false AND stornozott = false AND iratszam IS NOT NULL AND btrim(iratszam) <> ''
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) > 1
),
kia_dup AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::int AS ev, irattipus, iratszam, COUNT(*) AS db
  FROM public.kiadas
  WHERE deleted = false AND stornozott = false AND iratszam IS NOT NULL AND btrim(iratszam) <> ''
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) > 1
),
osszesito AS (
  SELECT
    'B | duplikátum-összesítő' AS tipus,
    format('befizetes | irattípus: %s | ismétlődő csoport: %s | érintett sor: %s',
      COALESCE(irattipus, '(üres)'), COUNT(*), SUM(db)) AS szoveg,
    2 AS rendezo
  FROM bef_dup GROUP BY irattipus
  UNION ALL
  SELECT
    'B | duplikátum-összesítő',
    format('kiadas | irattípus: %s | ismétlődő csoport: %s | érintett sor: %s',
      COALESCE(irattipus, '(üres)'), COUNT(*), SUM(db)),
    2
  FROM kia_dup GROUP BY irattipus
),
minta AS (
  SELECT
    'C | minta (top 20)' AS tipus,
    format('%s | %s. év | irattípus: %s | iratszám: %s | %s sor',
      tabla, ev, COALESCE(irattipus, '(üres)'), iratszam, db) AS szoveg,
    3 AS rendezo
  FROM (
    SELECT 'befizetes' AS tabla, ev, irattipus, iratszam, db FROM bef_dup
    UNION ALL
    SELECT 'kiadas', ev, irattipus, iratszam, db FROM kia_dup
    ORDER BY db DESC
    LIMIT 20
  ) t
)
SELECT tipus, szoveg FROM (
  SELECT * FROM idx
  UNION ALL
  SELECT * FROM osszesito
  UNION ALL
  SELECT * FROM minta
  UNION ALL
  SELECT 'B | duplikátum-összesítő', 'NINCS ismétlődő iratszám-csoport élő sorokon', 2
  WHERE NOT EXISTS (SELECT 1 FROM bef_dup) AND NOT EXISTS (SELECT 1 FROM kia_dup)
) osszes
ORDER BY rendezo, szoveg;

-- ═══════════════════════════════════════════════════════════════════════════
-- DÖNTÉS (2026-08-28, a fenti felmérés éles eredménye alapján — D4 LEZÁRVA):
-- az index-predikátum NEM szigorítható. Az élő ismétlődések LEGITIMEK:
--   · Chit. (104 csoport / 271 sor): EGY nyomtatott chitanță TÖBB befizetőt
--     fed (családi/többsoros nyugta) — a sorok jogosan osztoznak a számon;
--   · Extr (5+12 csoport): a havi kivonatszám dokumentáltan ismétlődik
--     (lásd: bank_iratszam_extr_op_semantika — „NE javítsd");
--   · banki (3 csoport): kivonaton belüli díjcsoportok (pl. incasare-comision).
-- A chitanță-kiállítás duplikátum-védelme az issue_chitanta_atomic RPC-ben
-- (FOR UPDATE + idempotencia-kapu, P0-12) és az app-oldali dup-checkben él.
-- A meglévő '%észpénz%' partial UNIQUE index változatlanul marad.
-- ═══════════════════════════════════════════════════════════════════════════
