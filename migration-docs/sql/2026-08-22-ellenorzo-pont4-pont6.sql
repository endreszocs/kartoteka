-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ELLENŐRZŐ LEKÉRDEZÉSEK — 4. PONT (szerepkörök) + 6. PONT (román nevek)   ║
-- ║ Fájl: migration-docs/sql/2026-08-22-ellenorzo-pont4-pont6.sql 2026-08-22 ║
-- ║ Terv: docs/ESZREVETELEK-TERV-2026-08-22.md — „H0 · bizonyítás" hullám    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ EZ A FÁJL SEMMIT NEM MÓDOSÍT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Nincs benne `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` és nincs
-- `BEGIN`/`COMMIT` sem. Kizárólag `SELECT`-ek. Bármikor, bárhányszor futtatható.
--
-- MIÉRT KELL: két ponton a diagnózis a repóból NEM dönthető el, mert a
-- projekt saját, kétszer megélt hibaosztálya áll az útban —
--
--   „a migration-fájl NEM bizonyíték arra, hogy élesben lefutott."
--
-- A 4. pontnál ez KÖZVETLENÜL számít: a gyanúsított RLS-policy forrásfájljának
-- (2026-04-16-wc7-uj-szerepkorok.sql) a 7. sora szó szerint ezt írja:
--
--       -- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE, MÉG NEM FUTTATVA
--
-- Ez a repó EGYETLEN ilyen jelölésű SQL-je. Vagyis lehet, hogy a policy
-- élesben LÉTRE SEM JÖTT — és akkor az „üres Szerepkörök fül" oka nem a kód,
-- hanem a hiányzó policy. Ezt csak az élő adatbázis mondja meg.
--
-- A 6. pontnál pedig az a gyanú, hogy a tünet (magyar név a román íven) NEM
-- kódhiba, hanem ADATHIÁNY: a `dioceses.nev_ro` oszlop csak 2026-08-15 óta
-- létezik, és a már meglévő megye-sorokon NULL. Ha ez igaz, a kódjavítás
-- önmagában LÁTSZÓLAG HATÁSTALAN lesz.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HOGYAN FUTTASD
-- ════════════════════════════════════════════════════════════════════════════
--
-- A Supabase SQL editorban, EGYESÉVEL, A/1-től B/3-ig. Minden lekérdezés
-- eredményét küldd vissza (elég a képernyőkép vagy a másolt táblázat).
-- A legvégén, a „HOGYAN OLVASD AZ EREDMÉNYT" fejezetben ott a döntési tábla.
--
-- Az A/1 és A/2 az e-mail-címedre szűr. Ha más fiókkal néznéd, írd át:
--       lower('endreszocs@gmail.com')
--
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ A. SZAKASZ — 4. PONT: MIÉRT ÜRES AZ EGYHÁZMEGYEI „SZEREPKÖRÖK" FÜL?      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────────────────
-- A/1. KI VAGYOK? — ez dönti el, MELYIK kódág és MELYIK RLS-policy fut rád.
-- ────────────────────────────────────────────────────────────────────────────
-- Amit nézni kell:
--   · skalar_role = 'admin'                 → rendszergazda (a fejléc ezt írja
--                                             ki tévesen „Kerületi admin"-ként)
--   · skalar_role = 'egyhazkeruleti_admin'  → valódi kerületi admin
--   · district_id IS NULL                   → a kerületi hatókör NEM oldható
--                                             fel → néma üres lista

SELECT
  p.id,
  p.email,
  p.role            AS skalar_role,
  p.status,
  p.district_id,
  p.diocese_id,
  p.congregation_id
FROM public.profiles p
WHERE lower(p.email) = lower('endreszocs@gmail.com');


-- ────────────────────────────────────────────────────────────────────────────
-- A/2. VAN-E PROFILE_ROLES SOROM? — a „roles-first" hatókör forrása.
-- ────────────────────────────────────────────────────────────────────────────
-- Ha itt NINCS sor, de az A/1-ben van skalár szerep, akkor a rendszer két
-- forrása széthúz: az app-oldali kapu az egyiket, az RLS a másikat nézi.

SELECT
  pr.scope,
  pr.scope_id,
  pr.role,
  pr.active,
  pr.approval_status,
  pr.granted_at
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
WHERE lower(p.email) = lower('endreszocs@gmail.com')
ORDER BY pr.granted_at DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- A/3. VAN-E EGYÁLTALÁN ADAT A TÁBLÁBAN?
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ EZ A LEGFONTOSABB LEKÉRDEZÉS AZ EGÉSZ 4. PONTBAN.
-- Ha az összes = 0, akkor a fül TÉNYSZERŰEN HELYESEN üres, és nincs is mit
-- „megjavítani" a lekérdezésen — csak a FELIRAT hazudik (a fül „Szerepkörök"
-- néven a könyvelői/számvevői hozzárendeléseket mutatja).

SELECT
  COALESCE(d2.name, '‹nincs egyházkerület›') AS egyhazkerulet,
  COALESCE(d.name,  '‹nincs egyházmegye›')   AS egyhazmegye,
  count(*) FILTER (WHERE pc.approval_status = 'pending')  AS fuggoben,
  count(*) FILTER (WHERE pc.approval_status = 'approved') AS aktiv,
  count(*)                                                AS osszes
FROM public.profile_congregations pc
JOIN public.congregations c  ON c.id  = pc.congregation_id
LEFT JOIN public.dioceses  d  ON d.id  = c.diocese_id
LEFT JOIN public.districts d2 ON d2.id = d.district_id
GROUP BY ROLLUP (d2.name, d.name)
ORDER BY 1, 2;


-- ────────────────────────────────────────────────────────────────────────────
-- A/4. MELY POLICY-K ÉLNEK MA A TÁBLÁN?
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ ITT DŐL EL, HOGY A „VÁZLAT — MÉG NEM FUTTATVA" FÁJL LEFUTOTT-E.
-- Amit keresel: van-e `profile_congregations_kerulet_admin_all` nevű sor.
--   · HA NINCS  → a kerületi admin RLS-útja élesben LÉTRE SEM JÖTT.
--                 Ez önmagában megmagyarázza az üres listát.
--   · HA VAN    → nézd meg a `using_feltetel`-t: hivatkozik-e a
--                 `profile_roles`-ra, vagy csak a skalár `profiles.role`-ra
--                 (utóbbi = a „minden policy-nak profile_roles-láb kell"
--                 hibaosztály).

SELECT
  policyname                                   AS policy_neve,
  cmd                                          AS muvelet,
  CASE WHEN permissive = 'PERMISSIVE'
       THEN 'megengedő' ELSE 'szűkítő' END     AS tipus,
  roles::text                                  AS mely_szerepekre,
  COALESCE(qual,       '‹nincs USING›')        AS using_feltetel,
  COALESCE(with_check, '‹nincs WITH CHECK›')   AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'profile_congregations'
ORDER BY policyname;


-- ────────────────────────────────────────────────────────────────────────────
-- A/5. VAN-E MÉG KERÜLETI LÁB A HATÓKÖR-HELPEREKBEN?
-- ────────────────────────────────────────────────────────────────────────────
-- A 2026-08-16-i S1c migráció (a te K4 döntésed) SZÁNDÉKOSAN kivette a
-- kerületi lábat. Ez a lekérdezés megmondja, hogy tényleg megtörtént-e.
--   · van_keruleti_lab = false  → az S1c szűkítés ÉLESBEN VAN, tehát ez az út
--                                 a kerületi admin számára ZÁRVA (ez a
--                                 SZÁNDÉKOLT állapot, nem hiba)
--   · a fuggveny_letezik = false → a helper nincs is meg (más a baj)

-- A `LEFT JOIN` szándékos: így a NEM LÉTEZŐ helper is megjelenik egy sorban
-- (`fuggveny_letezik = false`), nem pedig némán hiányzik a találatok közül.

WITH vart(fuggveny) AS (
  VALUES
    ('felettes_szint_gyulekezet_ids'),
    ('felettes_szint_hozzaferese'),
    ('current_user_district_ids'),
    ('current_user_diocese_ids')
)
SELECT
  v.fuggveny,
  (p.oid IS NOT NULL)                                             AS fuggveny_letezik,
  (pg_get_functiondef(p.oid) LIKE '%current_user_district_ids%')  AS van_keruleti_lab,
  (pg_get_functiondef(p.oid) LIKE '%profile_roles%')              AS van_profile_roles_lab
FROM vart v
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p      ON p.proname = v.fuggveny
                        AND p.pronamespace = n.oid
ORDER BY v.fuggveny;


-- ────────────────────────────────────────────────────────────────────────────
-- A/6. A HATÓKÖR-FELOLDÓ REPRODUKCIÓJA — a két néma csapda kimérése.
-- ────────────────────────────────────────────────────────────────────────────
-- Ez pontosan azt számolja ki, amit az app-oldali `getScopedCongregationIds()`
-- kiszámolna rád. Két dolgot keresünk:
--   · keruletek_szama = 0        → a kód `.in('congregation_id', [])`-t küld,
--                                  ami 0 sort ad HIBA NÉLKÜL (néma üres lista)
--   · hatokorbe_eso_gyulekezetek > 100 → az azonosítók az URL-be kerülnek, és
--                                  a proxy 414-gyel eldobja (nem 0 sor, hanem
--                                  HIBA) → 80-asával darabolni kell

WITH en AS (
  SELECT id, role, district_id
  FROM public.profiles
  WHERE lower(email) = lower('endreszocs@gmail.com')
),
kerulet AS (
  SELECT DISTINCT x.district_id
  FROM (
    -- (a) roles-first: a profile_roles district-hatóköre
    SELECT pr.scope_id AS district_id
    FROM public.profile_roles pr, en
    WHERE pr.profile_id = en.id
      AND pr.scope = 'district'
      AND pr.active
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
    UNION
    -- (b) skalár fallback: a profiles.district_id
    SELECT en.district_id
    FROM en
    WHERE en.district_id IS NOT NULL
  ) x
)
SELECT
  (SELECT count(*) FROM kerulet)                       AS keruletek_szama,
  (SELECT count(*)
     FROM public.congregations c
     JOIN public.dioceses d ON d.id = c.diocese_id
    WHERE d.district_id IN (SELECT district_id FROM kerulet)) AS hatokorbe_eso_gyulekezetek,
  CASE
    WHEN (SELECT count(*) FROM kerulet) = 0
      THEN '⛔ NÉMA ÜRES LISTA: nincs feloldható kerületi hatókör → .in([]) fut'
    WHEN (SELECT count(*) FROM public.congregations c
            JOIN public.dioceses d ON d.id = c.diocese_id
           WHERE d.district_id IN (SELECT district_id FROM kerulet)) > 100
      THEN '⚠️ 414-CSAPDA: >100 azonosító megy az URL-be → darabolás kötelező'
    ELSE '✅ a hatókör feloldható és a méret is rendben'
  END                                                  AS teendo;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ B. SZAKASZ — 6. PONT: MENNYIRE HIÁNYZIK A ROMÁN NÉV?                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────────────────
-- B/1. LÉTEZIK-E EGYÁLTALÁN A `nev_ro` OSZLOP MIND A HÁROM SZINTEN?
-- ────────────────────────────────────────────────────────────────────────────
-- Ha valamelyik hiányzik, az adott szint román íve nem is javítható kóddal.

SELECT
  c.table_name                                  AS tabla,
  c.column_name                                 AS oszlop,
  c.data_type                                   AS tipus,
  CASE WHEN c.is_nullable = 'YES'
       THEN 'lehet üres' ELSE 'kötelező' END    AS kitoltottseg
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('congregations', 'dioceses', 'districts')
  AND c.column_name IN ('name', 'nev_hu', 'nev_ro', 'nev_en', 'cif', 'adoszam')
ORDER BY c.table_name, c.column_name;


-- ────────────────────────────────────────────────────────────────────────────
-- B/2. HÁNY SORON HIÁNYZIK A ROMÁN NÉV? — a tünet mértéke.
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ EZ A LEGFONTOSABB LEKÉRDEZÉS AZ EGÉSZ 6. PONTBAN.
-- Ha a `dioceses` sorában a hiányzó szám nagy, akkor a kódjavítás önmagában
-- LÁTSZÓLAG HATÁSTALAN lesz — előbb az adatot kell pótolni.

SELECT
  'dioceses'                                                       AS tabla,
  count(*)                                                         AS osszes_sor,
  count(*) FILTER (WHERE coalesce(nev_ro, '') = '')                AS nincs_roman_nev,
  round(100.0 * count(*) FILTER (WHERE coalesce(nev_ro, '') = '')
        / NULLIF(count(*), 0), 1)                                  AS hianyzo_szazalek
FROM public.dioceses
UNION ALL
SELECT
  'districts',
  count(*),
  count(*) FILTER (WHERE coalesce(nev_ro, '') = ''),
  round(100.0 * count(*) FILTER (WHERE coalesce(nev_ro, '') = '')
        / NULLIF(count(*), 0), 1)
FROM public.districts
UNION ALL
SELECT
  'congregations',
  count(*),
  count(*) FILTER (WHERE coalesce(nev_ro, '') = ''),
  round(100.0 * count(*) FILTER (WHERE coalesce(nev_ro, '') = '')
        / NULLIF(count(*), 0), 1)
FROM public.congregations
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- B/3. MELYIK KONKRÉT EGYHÁZMEGYÉNÉL HIÁNYZIK?
-- ────────────────────────────────────────────────────────────────────────────
-- A képernyőképeden a Kézdi-Orbai Református Egyházmegye szerepelt — várhatóan
-- ott lesz ebben a listában. Ezeket a beállítás-varázslón át kell pótolni,
-- NEM `UPDATE`-tel: a magyar névből képzett román alak HAMIS ADAT lenne egy
-- hivatalos, aláírt nyomtatványon.

SELECT
  COALESCE(d2.name, '‹nincs egyházkerület›') AS egyhazkerulet,
  d.name                                     AS egyhazmegye_magyar,
  COALESCE(d.nev_ro, '‹ÜRES›')               AS egyhazmegye_roman,
  'Beállítás-varázslóban pótlandó'           AS teendo
FROM public.dioceses d
LEFT JOIN public.districts d2 ON d2.id = d.district_id
WHERE coalesce(d.nev_ro, '') = ''
ORDER BY 1, 2;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ HOGYAN OLVASD AZ EREDMÉNYT — DÖNTÉSI TÁBLA                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── 4. PONT ────────────────────────────────────────────────────────────────
--
--  A/3 „osszes" = 0
--      → A fül TÉNYSZERŰEN HELYESEN üres. Nincs adat, amit mutathatna.
--        TEENDŐ: csak a FELIRAT javítandó („Könyvelői hozzárendelések"), a
--        lekérdezésen nincs mit javítani. A többi ok LAPPANGÓ marad — akkor
--        sülne el, ha lenne adat.
--
--  A/4-ben NINCS `profile_congregations_kerulet_admin_all`
--      → A kerületi admin RLS-útja ÉLESBEN LÉTRE SEM JÖTT (a „VÁZLAT — MÉG NEM
--        FUTTATVA" fájl tényleg nem futott).
--        TEENDŐ: ez a D2 döntés tárgya. A policy megírása hatókört TÁGÍT, és
--        ütközik a K4 döntéseddel — csak az explicit jóváhagyásoddal.
--
--  A/5-ben `van_keruleti_lab` = false
--      → Az S1c szűkítés élesben van, tehát ez az út SZÁNDÉKOSAN zárva.
--        TEENDŐ: nincs. Ez a helyes, kívánt állapot — nem hiba.
--
--  A/6 „keruletek_szama" = 0
--      → A NÉMA ÜRES LISTA csapdája élesben elsül.
--        TEENDŐ: a beszédes hibaüzenet (a terv 4/2. lépése) MINDENKÉPP kell.
--
--  A/6 „hatokorbe_eso_gyulekezetek" > 100
--      → A 414-csapda élesben elsülne, amint az üres-tömb hibát javítjuk.
--        TEENDŐ: a darabolás (a terv 4/5. lépése) KÖTELEZŐ, nem opcionális.
--
-- ── 6. PONT ────────────────────────────────────────────────────────────────
--
--  B/2 `dioceses.nincs_roman_nev` > 0
--      → A tünet fő oka ADATHIÁNY, ahogy a felmérés állította.
--        TEENDŐ: a B/3 listáját a beállítás-varázslón át pótolni. A kódjavítás
--        (közös kétnyelvű helper) enélkül is elkészül, de a papíron csak az
--        adat pótlása után látszik majd az eredménye.
--
--  B/2 `dioceses.nincs_roman_nev` = 0
--      → Az adat MEGVAN, tehát a tünet mégis KÓDHIBA: a román név nem jut el a
--        nyomtatványig (a lekérdezés nem kéri le, vagy a builder nem olvassa).
--        TEENDŐ: a kódjavítás önmagában megoldja — és ez esetben a
--        `penzugy/actions.ts` `nev_ro`-lekérését kell először megnézni.
--
--  B/1-ben hiányzik valamelyik `nev_ro` oszlop
--      → Az adott szint román íve nem javítható kóddal; előbb séma-módosítás
--        kell. (A repó szerint mindhárom oszlop létezik — ha mégsem, az azt
--        jelenti, hogy a vonatkozó migráció nem futott le.)
--
-- ════════════════════════════════════════════════════════════════════════════
-- Az eredményeket küldd vissza — ezek alapján élesedik vagy esik el a
-- 4. és a 6. pont diagnózisa, és csak utána nyúlunk az RLS-hez.
-- ════════════════════════════════════════════════════════════════════════════
