-- ═══════════════════════════════════════════════════════════════════════════
-- PR-18 (2026-08-01) — DUPLA CSALÁDTAGSÁG DIAGNOSZTIKA + TAKARÍTÁS
--
-- Háttér: eddig sem a felület, sem az adatbázis nem akadályozta meg, hogy egy
-- személy egyszerre KÉT (vagy több) család tagja legyen — a gyermek-kereső nem
-- szűrt, a CNP-alapú auto-család második gyerek-sort szúrt be, és a gyerek
-- táblán nincs UNIQUE. A PR-18 a felületen és a szerveren már véd; ez az SQL a
-- KORÁBBAN létrejött duplákat mutatja meg (1–5), és a veszélytelen duplát
-- takarítja (6).
--
-- Futtatás: Supabase SQL Editor. Az 1–5 csak SELECT (biztonságos).
-- A 6-os blokk TÖRÖL (csak a bizonyítottan redundáns sorokat) — előbb nézd meg
-- az 1–5 eredményét!
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Gyermek TÖBB aktív családban (gyerek tábla) ──────────────────────────
SELECT
  g.id_szemely,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  c2.name AS gyulekezet,
  array_agg(DISTINCT g.id_csalad ORDER BY g.id_csalad) AS csalad_idk,
  count(DISTINCT g.id_csalad) AS aktiv_csaladok_szama
FROM gyerek g
JOIN csalad cs ON cs.id = g.id_csalad AND cs.isaktiv = true
JOIN szemely sz ON sz.id = g.id_szemely
LEFT JOIN congregations c2 ON c2.id = sz.congregation_id
GROUP BY g.id_szemely, sz.csaladnev, sz.k_nev, c2.name
HAVING count(DISTINCT g.id_csalad) > 1
ORDER BY aktiv_csaladok_szama DESC, nev;

-- ── 2. UGYANABBAN a családban duplázott gyerek-sor ──────────────────────────
SELECT
  g.id_szemely,
  g.id_csalad,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  count(*) AS sorok_szama
FROM gyerek g
JOIN szemely sz ON sz.id = g.id_szemely
GROUP BY g.id_szemely, g.id_csalad, sz.csaladnev, sz.k_nev
HAVING count(*) > 1
ORDER BY sorok_szama DESC;

-- ── 3. Felnőtt TÖBB aktív családban (csalad.id_ferfi / id_no) ───────────────
WITH felnott AS (
  SELECT id AS csalad_id, id_ferfi AS szemely_id FROM csalad WHERE isaktiv = true AND id_ferfi IS NOT NULL
  UNION ALL
  SELECT id, id_no FROM csalad WHERE isaktiv = true AND id_no IS NOT NULL
)
SELECT
  f.szemely_id,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  c2.name AS gyulekezet,
  array_agg(f.csalad_id ORDER BY f.csalad_id) AS csalad_idk,
  count(*) AS aktiv_csaladok_szama
FROM felnott f
JOIN szemely sz ON sz.id = f.szemely_id
LEFT JOIN congregations c2 ON c2.id = sz.congregation_id
GROUP BY f.szemely_id, sz.csaladnev, sz.k_nev, c2.name
HAVING count(*) > 1
ORDER BY aktiv_csaladok_szama DESC, nev;

-- ── 4. Felnőtt az EGYIK családban + gyermek egy MÁSIKBAN ────────────────────
-- (Tipikus: a gyermek felnőtt és megházasodott, de a szülei családjából nem
-- lett kivezetve. A PR-18 után az ilyen áthelyezés már rákérdez.)
SELECT
  sz.id AS szemely_id,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  c2.name AS gyulekezet,
  cs_felnott.id AS felnottkent_csalad_id,
  g.id_csalad AS gyermekkent_csalad_id
FROM szemely sz
JOIN csalad cs_felnott
  ON cs_felnott.isaktiv = true
 AND (cs_felnott.id_ferfi = sz.id OR cs_felnott.id_no = sz.id)
JOIN gyerek g ON g.id_szemely = sz.id AND g.id_csalad <> cs_felnott.id
JOIN csalad cs_gyerek ON cs_gyerek.id = g.id_csalad AND cs_gyerek.isaktiv = true
LEFT JOIN congregations c2 ON c2.id = sz.congregation_id
ORDER BY nev;

-- ── 5. Több NYITOTT haztartas_tag különböző háztartásokban (új modell) ──────
SELECT
  ht.id_szemely,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  c2.name AS gyulekezet,
  array_agg(DISTINCT h.legacy_csalad_id ORDER BY h.legacy_csalad_id) AS legacy_csalad_idk,
  count(DISTINCT ht.id_haztartas) AS nyitott_haztartasok
FROM haztartas_tag ht
JOIN haztartas h ON h.id = ht.id_haztartas AND h.ervenyes_ig IS NULL AND h.isaktiv = true
JOIN szemely sz ON sz.id = ht.id_szemely
LEFT JOIN congregations c2 ON c2.id = sz.congregation_id
WHERE ht.ervenyes_ig IS NULL
GROUP BY ht.id_szemely, sz.csaladnev, sz.k_nev, c2.name
HAVING count(DISTINCT ht.id_haztartas) > 1
ORDER BY nyitott_haztartasok DESC, nev;

-- ═══════════════════════════════════════════════════════════════════════════
-- ── 6. TAKARÍTÁS (ÍRÓ művelet!) — csak a 2. pont redundáns sorai ────────────
-- Ugyanabban a családban duplázott gyerek-sorokból a legkisebb id-jút tartjuk
-- meg. Ez adatvesztés nélküli (a tagság megmarad, csak a fölös sor tűnik el).
-- A több-családos eseteket (1., 3., 4.) NEM javítjuk automatikusan — azokat a
-- felületről rendezd (személyi karton → „Áthelyezés"), mert ott döntés kell,
-- hogy MELYIK család a helyes.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM gyerek g
USING gyerek g2
WHERE g.id_szemely = g2.id_szemely
  AND g.id_csalad = g2.id_csalad
  AND g.id > g2.id;

-- Ellenőrzés a takarítás után (0 sort kell adjon):
SELECT g.id_szemely, g.id_csalad, count(*) AS sorok_szama
FROM gyerek g
GROUP BY g.id_szemely, g.id_csalad
HAVING count(*) > 1;
