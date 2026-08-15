-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MEGYEI FELTERJESZTÉS — KÖLTSÉGVETÉS-MÓDOSÍTÁS ÁG            2026-08-15   ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-felterjesztes-          ║
-- ║       modositas.sql                                                      ║
-- ║ (Egyházmegyei szint terv, 3.6 + Endre 3. döntése: „az egyházmegye SAJÁT  ║
-- ║  számadásának / költségvetésének / KÖLTSÉGVETÉS-MÓDOSÍTÁSÁNAK            ║
-- ║  véglegesítése és felküldése")                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT AD HOZZÁ a `diocese_felterjesztes` táblához (amit a
-- 2026-08-15-egyhazmegyei-uj-tablak.sql 1/C szakasza hoz létre):
--
--  (A) `modification_number` oszlop (NOT NULL DEFAULT 0)
--      MIÉRT: a megye egy évben HÁROM költségvetés-módosítást is felküldhet.
--      A tábla eredeti egyedi indexe (diocese_id, doc_type, year) ezt egyetlen
--      sorba préselte volna: a 2. módosítás NÉMÁN FELÜLÍRTA volna az 1.-et, és
--      a felküldött hivatalos csomagok közül egy nyomtalanul eltűnt volna.
--
--  (B) `megyei_koltsegvetes_modositas` doc_type
--      MIÉRT: Endre döntése mind a HÁROM megyei iratra kimondja a
--      véglegesítés + felküldés útját; az eredeti CHECK csak a számadást, a
--      költségvetést és a számvevői összesítőt ismerte, így a módosítás
--      felküldése nyers adatbázis-hibára futott volna.
--
--  (C) Az egyedi index cseréje a NÉGY oszlopos alakra
--      (diocese_id, doc_type, year, modification_number).
--      MIÉRT NÉGY OSZLOPOS, sima (nem kifejezés-) index: a PostgREST `upsert`
--      csak OSZLOPLISTÁS ütközés-célt tud (`on_conflict=…`), kifejezés-indexet
--      (pl. COALESCE(...)) nem — ezért az oszlop NOT NULL DEFAULT 0, és az
--      index sima oszloplista. A kód pontosan ezt a négyest adja meg
--      (apps/web/lib/finance/diocese-felterjesztes.ts).
--
-- TANULSÁGOK, AMIKRE ÉPÜL:
--   · „A migration-fájl NEM bizonyíték" → 0. szakasz állapotfelmérés + záró
--     ellenőrző SELECT (az eredményt küldd vissza).
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → itt ÚJ policy
--     nincs (a meglévők a táblára szólnak, oszlop-bővítés nem érinti őket), de
--     a záró SELECT `has_table_privilege`-dzsel visszaellenőrzi a jogokat.
--   · Mentés-besorolás: a `diocese_felterjesztes` MÁR besorolt (az uj-tablak
--     fájl 1/F szakasza: globalis / R2) — oszlop-bővítés nem igényel új sort,
--     de a záró SELECT ellenőrzi, hogy a besorolás megvan (besorolatlan
--     táblánál a napi mentés HANGOSAN megáll).
--
-- FUTTATÁSI SORREND (Endre futtatja, Supabase SQL Editor):
--   ELŐTTE: 2026-08-15-egyhazmegyei-uj-tablak.sql (ez hozza létre a táblát!)
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT).
--   2.  1. SZAKASZ — BŐVÍTÉS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — az eredményt küldd vissza).
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + CHECK-újraírás + index-csere —
-- akárhányszor újrafuttatható.
--
-- ⚠️ SORREND-CSAPDA: ha valamikor ÚJRA lefuttatod a
--    2026-08-15-egyhazmegyei-uj-tablak.sql fájlt, az visszahozza a RÉGI, három
--    oszlopos egyedi indexet (diocese_id, doc_type, year) — ami a 2. és 3.
--    költségvetés-módosítást ugyanabba a sorba préselné. Ilyenkor EZT a fájlt
--    is futtasd le utána; a 2/C ellenőrző sor megmondja, ha a régi index
--    visszakerült.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · CÉL-TÁBLA' AS szakasz,
       'Létezik-e a diocese_felterjesztes?' AS mit,
       CASE WHEN to_regclass('public.diocese_felterjesztes') IS NULL
            THEN '⛔ NINCS — előbb a 2026-08-15-egyhazmegyei-uj-tablak.sql fusson le!'
            ELSE 'megvan' END AS ertek,
       'Ha nincs: az 1. szakasz beszédes magyar hibával leáll.' AS teendo

UNION ALL
SELECT 2, '0/B · E FÁJL OSZLOPA',
       'Megvan-e már a modification_number? (1 = újrafuttatás, 0 = első futás)',
       (SELECT count(*)::text || ' / 1' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_felterjesztes'
          AND column_name = 'modification_number'),
       'Tájékoztató — az 1. szakasz mindkét esetben biztonságos.'

UNION ALL
SELECT 3, '0/C · DOC_TYPE ÉRTÉKKÉSZLET',
       'Engedi-e már a CHECK a megyei_koltsegvetes_modositas típust?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%megyei_koltsegvetes_modositas%'
                             THEN 'igen (újrafuttatás)' ELSE 'még nem (első futás)' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.diocese_felterjesztes')
                   AND conname  = 'diocese_felterjesztes_doc_type_check'),
                '⛔ nincs ilyen CHECK — a tábla más alakú, nézd át kézzel'),
       'Az 1. szakasz a CHECK-et mindkét esetben a NÉGY típusos alakra írja át.'

UNION ALL
SELECT 4, '0/D · MEGLÉVŐ SOROK',
       'Hány felterjesztés van már rögzítve? (a bővítés meglévő sorra is biztonságos)',
       COALESCE((SELECT count(*)::text FROM public.diocese_felterjesztes), '—'),
       'A meglévő sorok modification_number-e 0 lesz (számadás/alap költségvetés).'

UNION ALL
SELECT 5, '0/E · MENTÉS-BESOROLÁS',
       'diocese_felterjesztes a backup_table_policy-ban? (az oszlop neve: tabla)',
       COALESCE((SELECT 'megvan — hatokor=' || hatokor || ', reteg=' || reteg::text
                 FROM public.backup_table_policy WHERE tabla = 'diocese_felterjesztes'),
                '⛔ NINCS — futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t (besorolatlan táblánál a napi mentés megáll)'),
       'Oszlop-bővítéshez új besorolás nem kell, a meglévőnek léteznie kell.';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — BŐVÍTÉS                                    FUTTATÁS: 2.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- Fail-closed előfeltétel-őr: hiányzó alaptáblánál beszédes magyar hibával
-- állunk meg — nem futunk tovább hibás előfeltétellel.
DO $$
BEGIN
  IF to_regclass('public.diocese_felterjesztes') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs diocese_felterjesztes tábla — előbb a 2026-08-15-egyhazmegyei-uj-tablak.sql fusson le.';
  END IF;
END $$;

-- (A) Módosítás-sorszám. NOT NULL DEFAULT 0, mert a PostgREST upsert csak
--     oszloplistás ütközés-célt ismer (NULL-os oszlop egyedi indexben nem
--     viselkedne egyediként: NULL <> NULL).
ALTER TABLE public.diocese_felterjesztes
  ADD COLUMN IF NOT EXISTS modification_number integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.diocese_felterjesztes.modification_number IS
  '2026-08-15: költségvetés-MÓDOSÍTÁS sorszáma (1–3). 0 = számadás / alap költségvetés / összesítő. Az egyedi index része — enélkül a 2. módosítás felülírná az 1.-et.';

-- Őr: a módosítás-sorszám 0–3 lehet, és CSAK a módosítás-típusnál nem 0.
-- (A „mindkettő" és a „sehol" állapot is hazugság lenne a felküldött iratról.)
ALTER TABLE public.diocese_felterjesztes
  DROP CONSTRAINT IF EXISTS diocese_felterjesztes_modnum_check;
ALTER TABLE public.diocese_felterjesztes
  ADD CONSTRAINT diocese_felterjesztes_modnum_check
  CHECK (
    modification_number BETWEEN 0 AND 3
    AND ((doc_type = 'megyei_koltsegvetes_modositas' AND modification_number BETWEEN 1 AND 3)
      OR (doc_type <> 'megyei_koltsegvetes_modositas' AND modification_number = 0))
  );

-- (B) A doc_type értékkészlete a NEGYEDIK típussal.
ALTER TABLE public.diocese_felterjesztes
  DROP CONSTRAINT IF EXISTS diocese_felterjesztes_doc_type_check;
ALTER TABLE public.diocese_felterjesztes
  ADD CONSTRAINT diocese_felterjesztes_doc_type_check
  CHECK (doc_type IN ('szamvevoi_osszesito','megyei_szamadas',
                      'megyei_koltsegvetes','megyei_koltsegvetes_modositas'));

-- (C) Egyedi index csere: a módosítás-sorszám is a kulcs része.
DROP INDEX IF EXISTS public.diocese_felterjesztes_dio_tipus_ev_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS diocese_felterjesztes_dio_tipus_ev_mod_uidx
  ON public.diocese_felterjesztes (diocese_id, doc_type, year, modification_number);

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2/A · OSZLOP' AS szakasz,
       'Megvan a modification_number, NOT NULL, alapérték 0?' AS mit,
       COALESCE((SELECT 'igen — is_nullable=' || is_nullable || ', default=' || COALESCE(column_default,'nincs')
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='diocese_felterjesztes'
                   AND column_name='modification_number'),
                '⛔ NINCS — az 1. szakasz nem futott végig') AS ertek,
       'Ha nincs: a megyei költségvetés-módosítás felküldése magyar hibával áll meg.' AS teendo

UNION ALL
SELECT 101, '2/B · DOC_TYPE',
       'Engedi a CHECK mind a 4 típust?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%megyei_koltsegvetes_modositas%'
                             THEN 'igen' ELSE '⛔ NEM' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.diocese_felterjesztes')
                   AND conname  = 'diocese_felterjesztes_doc_type_check'),
                '⛔ nincs CHECK'),
       'Ha nem: a módosítás felküldése adatbázis-hibára futna.'

UNION ALL
SELECT 102, '2/C · EGYEDI INDEX',
       'A négy oszlopos egyedi index létezik, a régi hármas eltűnt?',
       (SELECT CASE
          WHEN to_regclass('public.diocese_felterjesztes_dio_tipus_ev_mod_uidx') IS NOT NULL
           AND to_regclass('public.diocese_felterjesztes_dio_tipus_ev_uidx') IS NULL
          THEN 'igen'
          ELSE '⛔ NEM — az upsert ütközés-célja nem működne' END),
       'A kódban az on_conflict: diocese_id,doc_type,year,modification_number.'

UNION ALL
SELECT 103, '2/D · GRANT-TANULSÁG',
       'Az authenticated ír-olvas a diocese_felterjesztes-en? (RLS szűri tovább)',
       (SELECT CASE WHEN has_table_privilege('authenticated','public.diocese_felterjesztes','SELECT')
                     AND has_table_privilege('authenticated','public.diocese_felterjesztes','INSERT')
                     AND has_table_privilege('authenticated','public.diocese_felterjesztes','UPDATE')
                    THEN 'igen' ELSE '⛔ NEM — GRANT hiányzik (403-leállás lenne)' END),
       'A policy a hívó szerepében fut — GRANT nélkül 403.'

UNION ALL
SELECT 104, '2/E · RLS ÉL',
       'RLS bekapcsolva a diocese_felterjesztes-en?',
       (SELECT CASE WHEN relrowsecurity THEN 'igen' ELSE '⛔ NEM — futtasd újra az uj-tablak SQL-t' END
        FROM pg_class WHERE oid = to_regclass('public.diocese_felterjesztes')),
       'Megyei írás + számvevői/kerületi olvasás policyk.'

UNION ALL
SELECT 105, '2/F · MENTÉS-BESOROLÁS',
       'diocese_felterjesztes besorolva a mentésbe?',
       COALESCE((SELECT 'megvan — hatokor=' || hatokor || ', reteg=' || reteg::text
                 FROM public.backup_table_policy WHERE tabla = 'diocese_felterjesztes'),
                '⛔ NINCS — a napi mentés megállna'),
       'Besorolatlan tábla = a mentés fail-closed leáll.'

ORDER BY sorszam;
