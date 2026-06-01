-- ────────────────────────────────────────────────────────────────────────
-- Hibrid család-modell — Fázis 1: BACKFILL (régi adatok átemelése)
-- ────────────────────────────────────────────────────────────────────────
-- Dátum: 2026-06-01
-- Felelős: Szőcs Endre + Claude
-- Cél: A meglévő `csalad` + `gyerek` rekordokat átemeljük az új
--      `cim` + `haztartas` + `haztartas_tag` + `szemely_kapcsolat` táblákba.
--
-- ELŐKÖVETELMÉNY: a 2026-06-01-fazis0-haztartas-tablak.sql már lefutott.
--
-- BIZTONSÁG:
--   - A `csalad`, `gyerek`, `szemely` táblákat NEM módosítjuk
--   - IDEMPOTENS: újrafuttatás esetén NEM duplikál (a `legacy_csalad_id`
--     mező + a partial unique index-ek biztosítják ezt)
--   - Tranzakcióban fut — hiba esetén minden rollback-elődik
--
-- ÉRTELMEZÉS:
--   - Minden `csalad` → 1 `cim` + 1 `haztartas`
--   - A férj (`id_ferfi`) + feleség (`id_no`) → `haztartas_tag` rekordok
--     (szerep: csaladfo / hazastars)
--   - Ha mindkét fél megvan → `szemely_kapcsolat` (típus: hazastars)
--   - Minden `gyerek` rekord → 1 `haztartas_tag` (szerep: gyermek)
--     + 1-2 `szemely_kapcsolat` (szulo_gyermek a férjjel/feleséggel)
--
-- KORLÁTOK:
--   - A `csalad` táblának NINCS congregation_id oszlopa → a férj vagy
--     feleség `szemely.congregation_id`-jéből vesszük (a vér szerinti
--     gyermekek congregation_id-ja jellemzően egyezik a szüleikével)
--   - Ha sem a férj sem a feleség nincs megadva (üres család), a
--     `c_utcaid → adrstreet`-en keresztül NEM tudjuk a congregation_id-t
--     biztosan visszafejteni → ezeket átugorjuk, és lentebb listázzuk
--
-- HOGYAN FUTTASD:
--   1. Supabase Dashboard → SQL Editor
--   2. Másold be ezt a teljes fájlt
--   3. Futtasd ("Run")
--   4. Olvasd el a végén megjelenő statisztikát (mennyi átkerült)
--
-- ROLLBACK (ha valami baj van):
--   DELETE FROM haztartas_tag    WHERE id_haztartas IN (SELECT id FROM haztartas WHERE legacy_csalad_id IS NOT NULL);
--   DELETE FROM szemely_kapcsolat WHERE megjegyzes = 'fazis1-backfill';
--   DELETE FROM haztartas        WHERE legacy_csalad_id IS NOT NULL;
--   DELETE FROM cim              WHERE megjegyzes = 'fazis1-backfill';
-- ────────────────────────────────────────────────────────────────────────

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. CIM rekordok létrehozása — minden még nem migrált csalad-ra
-- ────────────────────────────────────────────────────────────────────────
-- A `cim` táblának nincs partial unique index a (c_utcaid, c_szam, ...) hármason,
-- ezért magunk ellenőrizzük az idempotenciát: csak akkor INSERT-elünk, ha
-- a `csalad.id`-hoz még NEM tartozik `haztartas` (és így `cim` sem).
WITH csalad_to_migrate AS (
  SELECT c.id AS csalad_id,
         c.c_utcaid, c.c_szam, c.c_tombhaz, c.c_lepcsohaz, c.c_emelet, c.c_ajto,
         -- A congregation_id-t a férj/feleség közül vesszük (az első nem-NULL):
         COALESCE(sf.congregation_id, sn.congregation_id) AS congregation_id
  FROM public.csalad c
  LEFT JOIN public.szemely sf ON sf.id = c.id_ferfi
  LEFT JOIN public.szemely sn ON sn.id = c.id_no
  WHERE NOT EXISTS (
    SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id
  )
  AND COALESCE(sf.congregation_id, sn.congregation_id) IS NOT NULL
),
inserted_cim AS (
  INSERT INTO public.cim (
    congregation_id, id_utca, szam, tombhaz, lepcsohaz, emelet, ajto,
    tipus, megjegyzes
  )
  SELECT
    congregation_id, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto,
    'otthon', 'fazis1-backfill'
  FROM csalad_to_migrate
  RETURNING id, congregation_id
)
-- ────────────────────────────────────────────────────────────────────────
-- 2. HAZTARTAS rekordok — minden új cim-hez egy
-- ────────────────────────────────────────────────────────────────────────
-- A háztartás "megnevezés" mezőjét automatikusan generáljuk:
-- "[férj-családnév] család — [utca-név] [c_szam]"
-- Ha férj nincs, a feleség családneve kerül a helyébe.
INSERT INTO public.haztartas (
  congregation_id, megnevezes, id_cim, id_csoport, isaktiv,
  legacy_csalad_id, ervenyes_tol
)
SELECT
  COALESCE(sf.congregation_id, sn.congregation_id) AS congregation_id,
  CONCAT(
    COALESCE(sf.csaladnev, sn.csaladnev, '?'),
    ' család — ',
    a.name,
    CASE WHEN c.c_szam IS NOT NULL AND c.c_szam <> '' THEN CONCAT(' ', c.c_szam) ELSE '' END
  ) AS megnevezes,
  -- Az imént INSERT-elt cim id-jét visszakeressük (1-1 match a congregation_id +
  -- a backfill jelölés alapján — ez biztonságos, mert most futtatjuk).
  -- A pontos illesztéshez a c_utcaid + c_szam + c_tombhaz egyezést használjuk.
  (
    SELECT cm.id FROM public.cim cm
    WHERE cm.megjegyzes = 'fazis1-backfill'
    AND cm.id_utca = c.c_utcaid
    AND COALESCE(cm.szam, '') = COALESCE(c.c_szam, '')
    AND COALESCE(cm.tombhaz, '') = COALESCE(c.c_tombhaz, '')
    AND COALESCE(cm.ajto, '') = COALESCE(c.c_ajto, '')
    AND cm.congregation_id = COALESCE(sf.congregation_id, sn.congregation_id)
    ORDER BY cm.created_at DESC
    LIMIT 1
  ) AS id_cim,
  c.id_csoport,
  c.isaktiv,
  c.id AS legacy_csalad_id,
  CURRENT_DATE AS ervenyes_tol
FROM public.csalad c
LEFT JOIN public.szemely sf ON sf.id = c.id_ferfi
LEFT JOIN public.szemely sn ON sn.id = c.id_no
LEFT JOIN public.adrstreet a ON a.id = c.c_utcaid
WHERE NOT EXISTS (
  SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id
)
AND COALESCE(sf.congregation_id, sn.congregation_id) IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3. HAZTARTAS_TAG — férj (családfő szerep)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.haztartas_tag (
  id_haztartas, id_szemely, szerep, is_primary,
  ervenyes_tol, congregation_id
)
SELECT
  h.id,
  c.id_ferfi,
  'csaladfo',
  true,
  CURRENT_DATE,
  h.congregation_id
FROM public.haztartas h
JOIN public.csalad c ON c.id = h.legacy_csalad_id
WHERE c.id_ferfi IS NOT NULL
ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 4. HAZTARTAS_TAG — feleség (házastárs szerep)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.haztartas_tag (
  id_haztartas, id_szemely, szerep, is_primary,
  ervenyes_tol, congregation_id
)
SELECT
  h.id,
  c.id_no,
  'hazastars',
  -- Ha nincs férj, a feleség lesz a "primary"
  CASE WHEN c.id_ferfi IS NULL THEN true ELSE false END,
  CURRENT_DATE,
  h.congregation_id
FROM public.haztartas h
JOIN public.csalad c ON c.id = h.legacy_csalad_id
WHERE c.id_no IS NOT NULL
ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 5. SZEMELY_KAPCSOLAT — házastársi kapcsolat (csak ha mindkét fél megvan)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.szemely_kapcsolat (
  id_szemely_1, id_szemely_2, tipus, ver_szerinti,
  ervenyes_tol, congregation_id, megjegyzes
)
SELECT
  c.id_ferfi,
  c.id_no,
  'hazastars',
  false, -- a házastárs nem vér szerinti rokon
  NULL,  -- ismeretlen házasság-dátum a csalad táblából
  h.congregation_id,
  'fazis1-backfill'
FROM public.haztartas h
JOIN public.csalad c ON c.id = h.legacy_csalad_id
WHERE c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL
ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 6. HAZTARTAS_TAG — gyerekek
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.haztartas_tag (
  id_haztartas, id_szemely, szerep, is_primary,
  ervenyes_tol, congregation_id
)
SELECT
  h.id,
  g.id_szemely,
  'gyermek',
  false,
  CURRENT_DATE,
  h.congregation_id
FROM public.gyerek g
JOIN public.csalad c ON c.id = g.id_csalad
JOIN public.haztartas h ON h.legacy_csalad_id = c.id
ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 7. SZEMELY_KAPCSOLAT — apa → gyerek (vér szerinti)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.szemely_kapcsolat (
  id_szemely_1, id_szemely_2, tipus, ver_szerinti,
  ervenyes_tol, congregation_id, megjegyzes
)
SELECT DISTINCT
  c.id_ferfi,  -- szülő
  g.id_szemely, -- gyermek
  'szulo_gyermek',
  true,
  NULL,
  h.congregation_id,
  'fazis1-backfill'
FROM public.gyerek g
JOIN public.csalad c ON c.id = g.id_csalad
JOIN public.haztartas h ON h.legacy_csalad_id = c.id
WHERE c.id_ferfi IS NOT NULL
ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 8. SZEMELY_KAPCSOLAT — anya → gyerek (vér szerinti)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.szemely_kapcsolat (
  id_szemely_1, id_szemely_2, tipus, ver_szerinti,
  ervenyes_tol, congregation_id, megjegyzes
)
SELECT DISTINCT
  c.id_no,      -- szülő
  g.id_szemely, -- gyermek
  'szulo_gyermek',
  true,
  NULL,
  h.congregation_id,
  'fazis1-backfill'
FROM public.gyerek g
JOIN public.csalad c ON c.id = g.id_csalad
JOIN public.haztartas h ON h.legacy_csalad_id = c.id
WHERE c.id_no IS NOT NULL
ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 9. Statisztika és ellenőrzés
-- ────────────────────────────────────────────────────────────────────────

-- 9.1 Általános számok
SELECT 'csalad — összesen' AS metrika, COUNT(*)::text AS ertek FROM public.csalad
UNION ALL
SELECT 'gyerek — összesen', COUNT(*)::text FROM public.gyerek
UNION ALL
SELECT 'haztartas — átemelve', COUNT(*)::text FROM public.haztartas WHERE legacy_csalad_id IS NOT NULL
UNION ALL
SELECT 'cim — backfill-ből', COUNT(*)::text FROM public.cim WHERE megjegyzes = 'fazis1-backfill'
UNION ALL
SELECT 'haztartas_tag — összesen', COUNT(*)::text FROM public.haztartas_tag
UNION ALL
SELECT 'szemely_kapcsolat — backfill-ből', COUNT(*)::text FROM public.szemely_kapcsolat WHERE megjegyzes = 'fazis1-backfill';

-- 9.2 Át NEM emelt csalad-ok (azonosítható congregation_id nélkül)
SELECT
  c.id AS csalad_id,
  c.id_ferfi,
  c.id_no,
  c.c_utcaid,
  c.c_szam,
  CASE
    WHEN c.id_ferfi IS NULL AND c.id_no IS NULL THEN 'Sem férj, sem feleség — congregation_id ismeretlen'
    ELSE 'A szemely.congregation_id NULL (adatfelvételi hiba)'
  END AS hibaok
FROM public.csalad c
WHERE NOT EXISTS (
  SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id
)
ORDER BY c.id
LIMIT 50;

-- 9.3 Át NEM emelt gyerekek (a csalad-juk nem migrált át)
SELECT
  g.id AS gyerek_id,
  g.id_csalad,
  g.id_szemely
FROM public.gyerek g
WHERE NOT EXISTS (
  SELECT 1 FROM public.haztartas_tag ht
  JOIN public.haztartas h ON h.id = ht.id_haztartas
  WHERE h.legacy_csalad_id = g.id_csalad
  AND ht.id_szemely = g.id_szemely
)
ORDER BY g.id
LIMIT 50;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VÁRT EREDMÉNY (példa egy közepes gyülekezetre):
--   ┌──────────────────────────────────┬────────┐
--   │ metrika                          │ ertek  │
--   ├──────────────────────────────────┼────────┤
--   │ csalad — összesen                │   250  │
--   │ gyerek — összesen                │   180  │
--   │ haztartas — átemelve             │   250  │  ← egyezzen az "csalad" sorral
--   │ cim — backfill-ből               │   250  │  ← egyezzen az "csalad" sorral
--   │ haztartas_tag — összesen         │   640  │  ← férj + feleség + gyerekek
--   │ szemely_kapcsolat — backfill-ből │   400  │  ← házastársak + szülő-gyerek
--   └──────────────────────────────────┴────────┘
--
-- Ha a "haztartas — átemelve" kevesebb mint a "csalad — összesen", akkor
-- a 9.2-es query mutatja azokat, amelyeknél nincs congregation_id (sem férj
-- sem feleség nincs megadva). Ezek manuálisan rendezhetők.
-- ────────────────────────────────────────────────────────────────────────
