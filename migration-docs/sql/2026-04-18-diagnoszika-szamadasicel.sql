-- =========================================================================
-- 2026-04-18 — Diagnosztika: szamadasicel + befizetescel + kiadascel állapot
-- =========================================================================
-- JAVÍTÁS 2026-04-18:
--   Az első verzió `kod` oszlopra hivatkozott — a `szamadasicel` táblában
--   NINCS `kod` oszlop (Endre visszajelzése alapján). Az `id` maga a kód
--   (pl. "101.07"). Az SQL most csak a tényleges oszlopokat kérdezi.
--
-- CÉL:
--   Endre jelezte, hogy a BCR import dropdownban egyes tételeknél (pl. 101.07)
--   CSAK a kód látszik, a név nem. A hiba NEM a DB-ben van (Endre ellenőrizte).
--
-- GYANÚ (kliens-oldali szűrés):
--   `app/(dashboard)/penzugy/actions.ts:450` a `szamadasicel` táblából CSAK a
--   `szint = 'gyulekezet'` rekordokat kéri le. A 2026-04-17-i szint-migráció
--   a 101.07-et (és 17 másikat) `egyhazmegye` szintre állította. DE a
--   `befizetescel` / `kiadascel` táblában valószínűleg VAN még sor, ami ezekre
--   a kódokra hivatkozik — ezért a kliens kéri, de nem talál hozzá nevet.
--
-- EZ AZ SQL CSAK OLVAS. Futtatása után az eredményt elküldve látható:
--   - Mennyi szamadasicel van szintenként
--   - A konkrét „problémás" tételek (101.07, 101.08, 203.06, stb.)
--   - Van-e olyan befizetescel/kiadascel, aminek az id_szamadasicel-je
--     „egyhazmegye" vagy „kerulet" szintű tétel (szint-mismatch)
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) SZAMADASICEL TÁBLA TÉNYLEGES OSZLOPAI
--    Ez a lekérdezés mutatja meg pontosan, milyen oszlopok vannak — hogy ne
--    feltételezzek rosszul. Ezt is küldd el kérlek.
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'szamadasicel'
ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────
-- 1) SZAMADASICEL ÁLLAPOT — mennyi van szintenként
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  szint,
  type,
  COUNT(*) AS db,
  COUNT(*) FILTER (WHERE nev IS NOT NULL AND btrim(nev) <> '') AS van_nev,
  COUNT(*) FILTER (WHERE nev IS NULL OR btrim(nev) = '') AS nincs_nev
FROM public.szamadasicel
GROUP BY szint, type
ORDER BY szint, type;


-- ─────────────────────────────────────────────────────────────────────────
-- 2) A KONKRÉTAN PANASZKODOTT KÓDOK (id maga a kód)
--    Ha itt rendesen kitöltve látod a nev-et, akkor a DB tiszta.
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  id,
  nev,
  type,
  sorszam,
  szint
FROM public.szamadasicel
WHERE id IN (
  '101.07',  -- Központi járulékok - egyházmegyei bevétel
  '101.08',  -- Egyházközségek fizetésalapja - emei bevétel
  '103.04',  -- Banki kamatok, árfolyam nyereségek...
  '203.03',  -- Kezelési költségek, árfolyam veszteségek
  '203.06',  -- Központi járulékok
  '203.07',  -- Bérjövedelmek 10%-a központi járulékba
  '206.05',  -- Kiadások egyházközségek részére
  '206.06'   -- Kiadások a felsőbb egyházi intézmények részére
)
ORDER BY id;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) A TELJES szamadasicel TARTALMA (id maga a kód)
--    Ezt is küldd el. Innen látom pontosan mi van a DB-ben.
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  id,
  nev,
  type,
  sorszam,
  szint
FROM public.szamadasicel
ORDER BY id;


-- ─────────────────────────────────────────────────────────────────────────
-- 4) BEFIZETESCEL LOOKUP — melyik szamadasicel-re mutatnak
--    Itt látszik, ha a junction táblában van olyan sor, ami „egyhazmegye"
--    szintű tételre mutat (ebből keletkezik az UI-beli zavar).
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  bc.id AS bc_id,
  bc.id_szamadasicel,
  bc.nev AS bc_nev,
  sc.nev AS szamadasicel_nev,
  sc.szint AS szamadasicel_szint,
  sc.type AS szamadasicel_type,
  CASE
    WHEN sc.id IS NULL THEN '❌ ORPHAN — szamadasicel nincs'
    WHEN sc.szint <> 'gyulekezet' THEN '⚠ SZINT MISMATCH — ' || sc.szint
    ELSE '✅ OK'
  END AS status
FROM public.befizetescel bc
LEFT JOIN public.szamadasicel sc ON sc.id = bc.id_szamadasicel
WHERE sc.id IS NULL
   OR sc.szint <> 'gyulekezet'
ORDER BY bc.id_szamadasicel;


-- ─────────────────────────────────────────────────────────────────────────
-- 5) KIADASCEL LOOKUP — melyik szamadasicel-re mutatnak
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  kc.id AS kc_id,
  kc.id_szamadasicel,
  kc.nev AS kc_nev,
  sc.nev AS szamadasicel_nev,
  sc.szint AS szamadasicel_szint,
  sc.type AS szamadasicel_type,
  CASE
    WHEN sc.id IS NULL THEN '❌ ORPHAN — szamadasicel nincs'
    WHEN sc.szint <> 'gyulekezet' THEN '⚠ SZINT MISMATCH — ' || sc.szint
    ELSE '✅ OK'
  END AS status
FROM public.kiadascel kc
LEFT JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
WHERE sc.id IS NULL
   OR sc.szint <> 'gyulekezet'
ORDER BY kc.id_szamadasicel;


-- ─────────────────────────────────────────────────────────────────────────
-- 6) BEFIZETESCEL TELJES TARTALMA — a wizard bevétel-kategória listája ebből épül
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  bc.id,
  bc.id_szamadasicel,
  bc.nev AS bc_nev,
  bc.nevro AS bc_nevro,
  bc.aktiv,
  sc.nev AS sc_nev,
  sc.szint AS sc_szint
FROM public.befizetescel bc
LEFT JOIN public.szamadasicel sc ON sc.id = bc.id_szamadasicel
ORDER BY bc.id_szamadasicel;


-- ─────────────────────────────────────────────────────────────────────────
-- 7) KIADASCEL TELJES TARTALMA
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  kc.id,
  kc.id_szamadasicel,
  kc.nev AS kc_nev,
  kc.nevro AS kc_nevro,
  kc.aktiv,
  sc.nev AS sc_nev,
  sc.szint AS sc_szint
FROM public.kiadascel kc
LEFT JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
ORDER BY kc.id_szamadasicel;


-- =========================================================================
-- ELVÁRT DIAGNÓZIS:
--   - 0) a szamadasicel tábla tényleges oszlopai — ebből kiderül, mi van
--   - 1) szint='egyhazmegye' sorok: kb. 18 (a 2026-04-17-i migráció szerint)
--   - 4-5) ha van sor a listában → igazolódik a gyanú: a befizetescel/kiadascel
--        tartalmaz egyhazmegye-szintű tételekre mutató sort, amit a kliens
--        lekér, de a szamadasicel szűrt lekérdezés miatt név nélkül jelenít meg
--
--   Javítás (az eredmény alapján 3 opció):
--     A) junction tábla tisztítás: a befizetescel/kiadascel-ből töröljük/
--        `aktiv=false`-ra állítjuk a nem-gyülekezeti szintű tételekre mutató
--        sorokat (ezek a gyülekezeti kartotéka szempontjából feleslegesek)
--     B) szamadasicel lekérés szűrés eltávolítása: szerver-oldalon minden
--        szintet lekérünk, a UI filtererez
--     C) kliens-oldali szűrés: a bevCelMap / kiaCelMap összeállításakor
--        kihagyjuk azokat, ahol a szamadasicel.szint != 'gyulekezet'
-- =========================================================================
