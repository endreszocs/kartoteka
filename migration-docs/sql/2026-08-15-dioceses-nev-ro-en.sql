-- ═══════════════════════════════════════════════════════════════════════════
--  EGYHÁZMEGYE: ROMÁN (kötelező) ÉS ANGOL (opcionális) NÉV
--  2026-08-15 — Endre észrevétele
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI HIÁNYZOTT: a `congregations` táblán régóta ott a `nev_ro` és a `nev_en`
--  (a hivatalos nyomtatványok fejléce ezekből építi a kétnyelvű nevet, pl.
--  „BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG / PAROHIA REFORMATA BRATES") — a
--  `dioceses` tábláról viszont KIMARADT. Emiatt az Egyházmegye beállítása
--  varázsló Alapadatok lapján nem is lehetett megadni őket, és a megyei
--  nyomtatványok fejléce csak magyarul tudott megjelenni.
--
--  ENDRE DÖNTÉSE: a ROMÁN név KÖTELEZŐ (Romániában ez a hivatalos alak),
--  az ANGOL opcionális.
--
--  MIÉRT NINCS DB-SZINTŰ NOT NULL a `nev_ro`-n: a tábla MÁR TARTALMAZ
--  egyházmegye-sorokat román név nélkül. Egy azonnali NOT NULL a meglévő
--  sorokon bukna, egy „töltsük fel a magyar névvel" alapérték pedig HAMIS
--  adatot írna a hivatalos nyomtatványra. Ezért a kötelezőséget az
--  ALKALMAZÁS érvényesíti (setup-varázsló + zod-séma), a meglévő megyék
--  pedig a következő beállítás-mentéskor pótolják — a varázsló addig sem
--  enged tovább nélküle.
--
--  ⚠️ Idempotens, újrafuttatható. A végén ellenőrző lekérdezés.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. ÁLLAPOTFELMÉRÉS (csak olvas — futtatás ELŐTT nézd meg) ──────────────
SELECT
  'jelenlegi állapot' AS szakasz,
  count(*) AS egyhazmegyek_szama,
  count(*) FILTER (
    WHERE to_regclass('public.dioceses') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'dioceses' AND column_name = 'nev_ro'
      )
  ) AS mar_van_oszlop_jelzo
FROM public.dioceses;

BEGIN;

-- ─── 1. OSZLOPOK ───────────────────────────────────────────────────────────
ALTER TABLE public.dioceses
  ADD COLUMN IF NOT EXISTS nev_ro text,
  ADD COLUMN IF NOT EXISTS nev_en text;

COMMENT ON COLUMN public.dioceses.nev_ro IS
  'Az egyházmegye hivatalos ROMÁN neve (pl. „Protopopiatul Reformat Chezdi-Orbai"). 2026-08-15: a nyomtatvány-fejlécek kétnyelvű alakjához KÖTELEZŐ — a kötelezőséget az alkalmazás (setup-varázsló + zod) érvényesíti, mert a meglévő sorokon a DB-szintű NOT NULL bukna vagy hamis adatot írna.';

COMMENT ON COLUMN public.dioceses.nev_en IS
  'Az egyházmegye ANGOL neve (opcionális) — a congregations.nev_en párja.';

COMMIT;

-- ─── 2. ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────
SELECT
  100 AS sorszam,
  '2/A · OSZLOPOK' AS szakasz,
  'Megvan a nev_ro és a nev_en a dioceses táblán? (2 = rendben)' AS mit,
  count(*)::text || ' / 2' AS ertek,
  'Ha nem 2: az 1. szakasz nem futott le.' AS teendo
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dioceses'
  AND column_name IN ('nev_ro', 'nev_en')

UNION ALL

SELECT
  101,
  '2/B · KITÖLTÖTTSÉG',
  'Hány egyházmegyénél hiányzik még a ROMÁN név? (a varázsló következő mentésekor pótlódik)',
  count(*) FILTER (WHERE nev_ro IS NULL OR btrim(nev_ro) = '')::text || ' / ' || count(*)::text,
  'Tájékoztató: a megyei nyomtatvány fejléce addig csak a magyar nevet írja ki (sablonszöveg nélkül).'
FROM public.dioceses

ORDER BY sorszam;
