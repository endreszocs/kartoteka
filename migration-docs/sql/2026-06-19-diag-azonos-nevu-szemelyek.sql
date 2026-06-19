-- ============================================================================
-- DIAGNOSZTIKA — Azonos nevű személyek a tagnyilvántartásban
-- (egyházfenntartás-import duplikáció-kockázat felmérése). 2026-06-19. CSAK OLVAS.
--
-- HÁTTÉR (Adatok_2025.xlsx elemzés): a 101.01 befizetők "Név - Cím" formátumúak.
-- A duplikáció-veszély akkor valós, ha egy névhez TÖBB személy tartozik a
-- tagnyilvántartásban. A CÍM a fő megkülönböztető — de csak ha a cím is rögzítve van
-- és egyezik. Ez az SQL felméri, mennyire oldja fel a cím az azonos neveket.
-- ============================================================================

-- A) AZONOS (csaladnev + k_nev) nevű ÉLŐ személyek, és hány KÜLÖNBÖZŐ címük van.
--    Olvasat: azonos_nevuek>1 + kulonbozo_cim = azonos_nevuek → a cím feloldja (jó).
--             azonos_nevuek>1 + kulonbozo_cim < azonos_nevuek → van olyan,
--             akit a cím sem különböztet meg → KÉZI döntés kell.
WITH base AS (
  SELECT s.id,
         lower(btrim(coalesce(s.csaladnev,''))) AS cs,
         lower(btrim(coalesce(s.k_nev,'')))     AS kn,
         coalesce(a.name_hu, a.name, '')        AS utca,
         coalesce(s.c_szam,'')                  AS hsz
  FROM szemely s
  LEFT JOIN adrstreet a ON a.id = s.c_utcaid
  WHERE s.isvisible = true AND coalesce(s.meghalt, false) = false
)
SELECT cs, kn,
       count(*)                                                            AS azonos_nevuek,
       count(DISTINCT lower(btrim(utca)) || '|' || lower(btrim(hsz)))      AS kulonbozo_cim,
       array_agg(DISTINCT btrim(utca || ' ' || hsz))                       AS cimek
FROM base
WHERE cs <> '' AND kn <> ''
GROUP BY cs, kn
HAVING count(*) > 1
ORDER BY count(*) DESC, cs, kn
LIMIT 100;

-- B) ÖSSZESÍTŐ: hány azonos-nevű CSOPORT van, és ebből hányat NEM old fel a cím.
WITH base AS (
  SELECT s.id,
         lower(btrim(coalesce(s.csaladnev,''))) AS cs,
         lower(btrim(coalesce(s.k_nev,'')))     AS kn,
         lower(btrim(coalesce(a.name_hu, a.name, ''))) || '|' || lower(btrim(coalesce(s.c_szam,''))) AS cimkey
  FROM szemely s
  LEFT JOIN adrstreet a ON a.id = s.c_utcaid
  WHERE s.isvisible = true AND coalesce(s.meghalt, false) = false
),
g AS (
  SELECT cs, kn, count(*) AS db, count(DISTINCT cimkey) AS cimek
  FROM base WHERE cs <> '' AND kn <> ''
  GROUP BY cs, kn HAVING count(*) > 1
)
SELECT
  count(*)                                  AS azonos_nevu_csoport,
  sum(db)                                   AS erintett_szemely,
  count(*) FILTER (WHERE cimek < db)        AS van_cimben_is_utkozo,   -- a cím sem dönt → kézi
  count(*) FILTER (WHERE cimek = db)        AS cim_teljesen_feloldja
FROM g;

-- C) A fájlban talált 7 KRITIKUS azonos-nevű befizető a tagnyilvántartásban:
--    ha MINDKÉT cím megjelenik → tényleg 2 külön ember (a cím-szűrés helyesen dönt).
--    ha csak 1 cím van a DB-ben → a másik című befizetés tévesen ehhez köthető → KÉZI.
SELECT lower(btrim(s.csaladnev)) AS cs,
       lower(btrim(s.k_nev))     AS kn,
       coalesce(a.name_hu, a.name) AS utca,
       s.c_szam,
       s.id
FROM szemely s
LEFT JOIN adrstreet a ON a.id = s.c_utcaid
WHERE s.isvisible = true
  AND (lower(btrim(s.csaladnev)), lower(btrim(s.k_nev))) IN (
        ('beder','győző'), ('nagy','csaba'), ('joós','albert'), ('beder','attila'),
        ('bitai','lázár'), ('bitai','józsef'), ('márk','lászló')
      )
ORDER BY cs, kn, utca;

-- D) FÉRJES NEVEK feloldhatósága: a fájlban 127 "...né" befizető volt. A párosító a
--    férj-családnévvel + a feleség keresztnevével keres. Hány nő van egyáltalán, és
--    közülük mennyinek van kitöltve a szcs_nev (lánykori) — ez a maiden-fallbackhez kell.
SELECT
  count(*) FILTER (WHERE ferfi = false)                                         AS no_total,
  count(*) FILTER (WHERE ferfi = false AND coalesce(btrim(szcs_nev),'') <> '')  AS no_szcs_kitoltve
FROM szemely
WHERE isvisible = true AND coalesce(meghalt, false) = false;
