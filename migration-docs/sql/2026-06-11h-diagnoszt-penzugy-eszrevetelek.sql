-- ============================================================================
-- KARTOTÉKA — Diagnosztika a 2026-06-11-i pénzügyi észrevételekhez (Endre futtatja)
-- CSAK OLVAS — semmit nem módosít. Futtasd a Supabase SQL Editorban, és a
-- 3 eredményt küldd vissza ellenőrzésre.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) „permission denied for table befizetes" — GRANT-ok megerősítése
--
-- HIPOTÉZIS (kód-elemzés alapján, magas konfidenciával): a hibát az okozta,
-- hogy a desktop PIN-es (offline) munkamenetben — ahol NINCS bejelentkezett
-- Supabase-session — működő internet mellett az ONLINE mentési ágat
-- választotta, így a kérés ANON szerepkörrel ment, amit a Postgres helyesen
-- utasít el. A kliens-oldali javítás kész (session-tudatos döntés).
-- Ez a lekérdezés azt erősíti meg, hogy a GRANT-ok rendben vannak:
--   ELVÁRT: authenticated → SELECT/INSERT/UPDATE van; anon → SEMMI (vagy üres).
-- ----------------------------------------------------------------------------
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('befizetes', 'kiadas', 'belsomozgas', 'befizetescel', 'kiadascel', 'szamadasicel')
   AND grantee IN ('anon', 'authenticated')
 ORDER BY table_name, grantee, privilege_type;

-- ----------------------------------------------------------------------------
-- 2) Kategória-szűrés ellenőrzése — MIT ZÁR KI az új szabály?
--
-- Az új kliens-szabály: könyvelhető = a kód illeszkedik a
--   ^(10[1-7]|20[1-7])\.[0-9]+$  mintára (hivatalos levél)  ÉS
--   szint = 'gyulekezet' (vagy üres).
-- Ez a lista azt mutatja, mely ma-aktív kategóriák TŰNNEK EL a rögzítőből —
-- ELVÁRT: csak aggregát-fejek („(5+...+12)" típusú nevek), 100.xx egyenleg-
-- sorok, belső-mozgás kódok és egyházmegyei/kerületi tételek legyenek köztük.
-- Ha BÁRMI olyan szerepel itt, amit könyvelni szoktatok → jelezd!
-- ----------------------------------------------------------------------------
SELECT 'BEVETEL' AS oldal, b.id AS cel_id, b.id_szamadasicel AS kod,
       s.nev, s.szint,
       CASE
         WHEN b.id_szamadasicel !~ '^(10[1-7]|20[1-7])\.[0-9]+$' THEN 'nem hivatalos levél-kód'
         WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 'nem gyülekezeti szint'
       END AS kizaras_oka
  FROM befizetescel b
  LEFT JOIN szamadasicel s ON s.id = b.id_szamadasicel
 WHERE b.aktiv = true
   AND (b.id_szamadasicel !~ '^(10[1-7]|20[1-7])\.[0-9]+$'
        OR (s.szint IS NOT NULL AND s.szint <> 'gyulekezet'))
UNION ALL
SELECT 'KIADAS', k.id, k.id_szamadasicel, s.nev, s.szint,
       CASE
         WHEN k.id_szamadasicel !~ '^(10[1-7]|20[1-7])\.[0-9]+$' THEN 'nem hivatalos levél-kód'
         WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 'nem gyülekezeti szint'
       END
  FROM kiadascel k
  LEFT JOIN szamadasicel s ON s.id = k.id_szamadasicel
 WHERE k.aktiv = true
   AND (k.id_szamadasicel !~ '^(10[1-7]|20[1-7])\.[0-9]+$'
        OR (s.szint IS NOT NULL AND s.szint <> 'gyulekezet'))
 ORDER BY 1, 3;

-- ----------------------------------------------------------------------------
-- 3) Ami a rögzítőben MARAD — gyors darabszám-ellenőrzés
--   ELVÁRT: bevétel-levelek ≈ 39, kiadás-levelek ≈ 48 (a hivatalos 87),
--   + a kanonikus belső-mozgás kódok (300.01/301.01/400.01/401.01/402.02).
-- ----------------------------------------------------------------------------
SELECT 'BEVETEL marad' AS mit, COUNT(*) AS db
  FROM befizetescel b
  LEFT JOIN szamadasicel s ON s.id = b.id_szamadasicel
 WHERE b.aktiv = true
   AND b.id_szamadasicel ~ '^(10[1-7]|20[1-7])\.[0-9]+$'
   AND (s.szint IS NULL OR s.szint = 'gyulekezet')
UNION ALL
SELECT 'KIADAS marad', COUNT(*)
  FROM kiadascel k
  LEFT JOIN szamadasicel s ON s.id = k.id_szamadasicel
 WHERE k.aktiv = true
   AND k.id_szamadasicel ~ '^(10[1-7]|20[1-7])\.[0-9]+$'
   AND (s.szint IS NULL OR s.szint = 'gyulekezet');
