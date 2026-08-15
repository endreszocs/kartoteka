-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI SZÁMVEVŐ NEVE — új oszlop a dioceses táblán      2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-szamvevo-nev.sql        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT CSINÁL: egyetlen új, NULLABLE oszlop — `dioceses.szamvevo_nev`.
--
-- MIÉRT (Endre kérése, 2026-08-15):
--   A beállítás-varázsló 4. lépésén eddig csak az esperes és a jegyző neve
--   szerepelt. A hivatalos megyei irat aláírás-rovata viszont HÁROM nevet
--   kíván: az esperesét, az egyházmegyei gondnokét/jegyzőét ÉS a MEGYEI
--   SZÁMVEVŐÉT. A számvevő neve eddig sehol nem volt tárolva — a nyomtatványra
--   nem is kerülhetett rá.
--
--   Ugyanebben a körben a vezetők nevét már nem kézzel kell begépelni: a
--   varázsló felkínálja a megye gyülekezeteinek lelkészeit és a megyéhez
--   kiosztott szerepköröket (`getDioceseVezetoJeloltek`). A számvevőnél ez
--   különösen hasznos, mert az `egyhazmegyei_szamvevo` szerepkör a
--   rendszergazdai felületen amúgy is ki van osztva — a nevet tehát a rendszer
--   MÁR TUDJA, csak eddig nem kérdezte meg.
--
-- MIÉRT NULLABLE (és miért nem kötelező):
--   Nem minden egyházmegyének van kiosztott számvevője. A `nev_ro` esetében
--   (2026-08-15-dioceses-nev-ro-en.sql) azért lett app-szintű a kötelezőség,
--   mert a tábla már tartalmazott sorokat érték nélkül; itt ennél is
--   egyszerűbb a helyzet: a mező SZÁNDÉKOSAN opcionális, az app sem kéri.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE → a backup_table_policy besorolás nem változik
-- (a `dioceses` már be van sorolva: hatokor='globalis', reteg=1).
--
-- FUTTATÁSI SORREND:
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT, semmit nem módosít).
--   2.  1. SZAKASZ — A BŐVÍTÉS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT).
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS — akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · JELENLEGI ÁLLAPOT' AS szakasz,
       'Létezik-e már a dioceses.szamvevo_nev oszlop?' AS mit,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='dioceses'
                           AND column_name='szamvevo_nev')
            THEN '✅ már létezik (újrafuttatás rendben)'
            ELSE '— még nincs (ez a fájl hozza létre)' END AS ertek,
       'Egyetlen NULLABLE text oszlop. Semmilyen meglévő adatot nem érint.' AS teendo

UNION ALL
SELECT 2, '0/A · JELENLEGI ÁLLAPOT',
       'A vezetői mezők mai kitöltöttsége',
       (SELECT count(*)::text FROM public.dioceses WHERE COALESCE(esperes_nev,'') <> '')
       || ' megyénél van esperes-név, '
       || (SELECT count(*)::text FROM public.dioceses WHERE COALESCE(jegyzo_nev,'') <> '')
       || ' megyénél jegyző-név (összesen '
       || (SELECT count(*)::text FROM public.dioceses) || ' megye)',
       'Tájékoztató — a számvevő-név most mindenütt üres lesz, a varázsló tölti majd.'

UNION ALL
SELECT 3, '0/A · JELENLEGI ÁLLAPOT',
       'Hány megyéhez van KIOSZTVA egyházmegyei számvevő szerepkör?',
       (SELECT count(DISTINCT scope_id)::text FROM public.profile_roles
        WHERE scope='diocese' AND role='egyhazmegyei_szamvevo'
          AND active = true AND approval_status='approved') || ' megye',
       'A varázsló EZEKNÉL fogja egy kattintásra felkínálni a nevet (getDioceseVezetoJeloltek). Ahol nincs kiosztva, ott kézzel írható be — és a felület megmondja, hol lehet hozzárendelni.'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A BŐVÍTÉS                                  FUTTATÁS: 2.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

ALTER TABLE public.dioceses
  ADD COLUMN IF NOT EXISTS szamvevo_nev text;

COMMENT ON COLUMN public.dioceses.szamvevo_nev IS
  '2026-08-15 (Endre): az egyházmegyei SZÁMVEVŐ neve — a hivatalos irat aláírás-rovatához. SZÁNDÉKOSAN nullable: nem minden egyházmegyének van kiosztott számvevője. A beállítás-varázsló listából kínálja fel azt, akinek `egyhazmegyei_szamvevo` szerepkör-sora van erre a megyére (getDioceseVezetoJeloltek), de kézzel is megadható.';

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2/A · BŐVÍTÉS' AS szakasz,
       'Megvan a dioceses.szamvevo_nev?' AS mit,
       COALESCE((SELECT data_type || CASE WHEN is_nullable='YES' THEN ' (nullable ✅)' ELSE ' (NOT NULL ⚠️)' END
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='dioceses'
                   AND column_name='szamvevo_nev'),
                '⛔ NINCS — a bővítés nem futott le') AS ertek,
       'Elvárt: text (nullable ✅).' AS teendo

UNION ALL
SELECT 2, '2/A · BŐVÍTÉS',
       'REGRESSZIÓS ŐR: a többi vezetői oszlop megvan?',
       (SELECT string_agg(column_name, ', ' ORDER BY column_name)
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dioceses'
          AND column_name IN ('esperes_nev','esperes_cim','jegyzo_nev','szamvevo_nev')),
       'Mind a négynek szerepelnie kell. Ha valamelyik hiányzik, a varázsló mentése elhasalna.'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE. Amíg ez nem fut le, a varázsló számvevő-mezője HANGOS hibával      ║
-- ║ jelzi a hiányt (a mentés a nem létező oszlopon elhasalna) — a többi      ║
-- ║ mező viszont változatlanul menthető.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
