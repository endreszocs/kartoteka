-- ============================================================================
-- KARTOTEKA WC-1.2 — TVA-plafon flag seed a szamadasicel táblán
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Előfeltétel: 2026-04-16-wc1-tva-figyelo-schema.sql (LEFUTOTT ✅)
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- A szamadasicel kódok TVA-plafon flag beállítása a Codul fiscal szerint.
-- A KONZERVATÍV elv szerint állítjuk be: ami bizonytalan, azt FALSE-ra,
-- a könyvelő egyedileg kapcsolhatja át.
--
-- IDEMPOTENS: egy-egy UPDATE. Futás után a seed visszafordítható FALSE-ra
-- a szakasz "KÉZI JAVÍTÁS" végén leírt statement-ekkel.
--

BEGIN;


-- ============================================================================
-- 1. Alapértelmezés: minden sor FALSE (biztonsági reset, ha volt valami)
-- ============================================================================
-- Ha csak részleges seedet futtatunk, erre nincs szükség.
-- De új rendszerben (ahol a default false), a DEFAULT miatt minden új sor
-- false-val jön létre, és eddig még nem állítottuk semmit. Kihagyjuk a reset-et.


-- ============================================================================
-- 2. TRUE értékek — gazdasági tevékenység
-- ============================================================================

-- 104.xx — gazdasági tevékenységből származó bevételek (chirie, arendare)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = true,
  tva_mentesseg_hivatkozas = 'art. 292 alin. (2) lit. e) Codul fiscal — închiriere/arendare de bunuri imobile, scutit fără drept de deducere, SE IA în calculul plafonului TVA (395 000 RON, OG 22/2025)'
WHERE id LIKE '104.%';

-- 103.04 — banki kamat, árfolyam, kötvények, osztalékok (pénzügyi ügyletek)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = true,
  tva_mentesseg_hivatkozas = 'art. 292 alin. (2) lit. a) Codul fiscal — operațiuni financiare (dobânzi, acțiuni, obligațiuni), scutit, SE IA în calculul plafonului TVA'
WHERE id = '103.04';

-- 103.06 — iratterjesztés, könyveladás (gazdasági termékértékesítés)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = true,
  tva_mentesseg_hivatkozas = 'Gazdasági termékértékesítés (livrare de bunuri), operațiune supusă TVA — BELESZÁMÍT a plafonba'
WHERE id = '103.06';

-- 103.07 — javak és részvények értékesítése
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = true,
  tva_mentesseg_hivatkozas = 'art. 292 alin. (2) lit. a) és f) Codul fiscal — pénzügyi és ingatlan értékesítés, SE IA în calculul plafonului TVA'
WHERE id = '103.07';


-- ============================================================================
-- 3. FALSE + cult mentesség hivatkozás (a jogi alap dokumentálása)
-- ============================================================================

-- 101.xx — egyházi tevékenység (járulék, persely, adomány, úrasztali, sírhely)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'art. 292 alin. (1) lit. k) Codul fiscal — cult religios, prestări de servicii în interesul colectiv al membrilor, scutit, NU se ia în calculul plafonului TVA'
WHERE id LIKE '101.%';

-- 102.xx — missziós és diakóniai tevékenység
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'art. 292 alin. (1) lit. k) Codul fiscal — activități strâns legate de cult, scutit, NU se ia în calculul plafonului TVA'
WHERE id LIKE '102.%';

-- 103.01, 103.02, 103.08, 103.09 — adomány, pályázat, számlavisszatérítés, szponzor
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'Nem gazdasági tevékenység (adomány / szubvenció / visszatérítés), NU se ia în calculul plafonului TVA'
WHERE id IN ('103.01', '103.02', '103.08', '103.09');

-- 103.03 — "Más bevételek" — BIZONYTALAN kategória, KÖNYVELŐI EGYEDI ELBÍRÁLÁS
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'Vegyes kategória — alapértelmezetten NEM számít a plafonba, de ha konkrét gazdasági tevékenység rejtőzik benne (pl. szolgáltatás harmadik félnek), a könyvelő egyedileg felülbírálhatja ÉS külön célkódra utalhat.'
WHERE id = '103.03';

-- 103.05 — konferencia, szeretetvendégség hozzájárulás (VEGYES, de inkább tag-jellegű)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'Alapértelmezetten NEM számít a plafonba — tag és közösségi hozzájárulás, art. 292 alin. (1) lit. k). Ha konkrét esemény külső feleknek történő szolgáltatása, a könyvelő felülbírálhatja.'
WHERE id = '103.05';

-- 105.xx — szubvenciók, támogatások
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'Szubvenció / támogatás — nem gazdasági tevékenység, NU se ia în calculul plafonului TVA'
WHERE id LIKE '105.%';

-- 100.xx — pénztármaradvány (technikai, nem bevétel)
UPDATE public.szamadasicel
SET
  tva_plafonba_szamit = false,
  tva_mentesseg_hivatkozas = 'Technikai sor (pénztármaradvány, belső mozgás) — nem bevétel, nem releváns a plafonra'
WHERE id LIKE '100.%';


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) Plafonba beszámítók összesítője
SELECT id, nev, tva_plafonba_szamit
FROM public.szamadasicel
WHERE tva_plafonba_szamit = true
ORDER BY id;

-- B) Kategóriák eloszlása (1xx bevétel csoport)
SELECT
  CASE
    WHEN id LIKE '100.%' OR id = '100' THEN '100. Pénztármaradvány'
    WHEN id LIKE '101.%' OR id = '101' THEN '101. Egyházi tevékenység'
    WHEN id LIKE '102.%' OR id = '102' THEN '102. Misszió/diakónia'
    WHEN id LIKE '103.%' OR id = '103' THEN '103. Más bevételek'
    WHEN id LIKE '104.%' OR id = '104' THEN '104. Gazdasági (TVA-plafonba!)'
    WHEN id LIKE '105.%' OR id = '105' THEN '105. Szubvenciók'
    ELSE 'Egyéb'
  END AS kategoria,
  COUNT(*) AS osszes,
  SUM(CASE WHEN tva_plafonba_szamit THEN 1 ELSE 0 END) AS plafonba,
  SUM(CASE WHEN NOT tva_plafonba_szamit THEN 1 ELSE 0 END) AS kivul
FROM public.szamadasicel
WHERE aktiv = true AND (id LIKE '1%' OR id LIKE '0%')
GROUP BY 1
ORDER BY 1;

-- C) A hivatkozás-szöveg ellenőrzése (volt-e minden sorra beállítva)
SELECT
  COUNT(*) AS osszes,
  SUM(CASE WHEN tva_mentesseg_hivatkozas IS NULL THEN 1 ELSE 0 END) AS hivatkozas_nelkul
FROM public.szamadasicel
WHERE aktiv = true;


-- ============================================================================
-- KÉZI JAVÍTÁS (ha a könyvelő egyedi értéket szeretne állítani)
-- ============================================================================
--
-- Adott célkódra TRUE:
--   UPDATE public.szamadasicel
--   SET tva_plafonba_szamit = true,
--       tva_mentesseg_hivatkozas = 'egyedi indoklás'
--   WHERE id = 'KÓD';
--
-- Adott célkódra FALSE:
--   UPDATE public.szamadasicel
--   SET tva_plafonba_szamit = false,
--       tva_mentesseg_hivatkozas = 'egyedi indoklás'
--   WHERE id = 'KÓD';
