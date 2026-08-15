-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI KÖNYVELÉS TELJESSÉ TÉTELE (S6 — pénzügy-rész)    2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-konyveles-s6.sql        ║
-- ║ (Egyházmegyei szint terv, 2.1 + 3.4 — a megyei saját számadás /          ║
-- ║  költségvetés / módosítás VÉGLEGESÍTÉSÉNEK adatbázis-alapja)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT AD HOZZÁ (docs/EGYHAZMEGYEI-SZINT-TERV-2026-08-15.md, 2.1 + 3.4 pont):
--
--  (A) diocese_bealitas + KÖLTSÉGVETÉS-FELOLDÁS kérelem-oszlopok:
--        koltsegvetes_unlock_requested / _request_reason / _request_at
--      MIÉRT: a számadásnak MÁR VAN feloldás-kérés útja megyei szinten
--      (szamadas_unlock_requested — 2026-04-18-egyhazmegyei-penzugy-fazis8.sql),
--      a költségvetésnek nem volt — a `requestBudgetUnlock` diocese-ága eddig
--      „nem támogatott" hibával állt le. Az egységes véglegesítés-gomb (Endre
--      4. döntése) a feloldás-kérés útját is EGYFORMÁN kéri mind a hat
--      irat-típusnál — a kérelem mostantól megyei szinten is RÖGZÜL (az
--      elbírálás a 3. szint — egyházkerület — külön körében nyílik meg).
--
--  (B) diocese_bealitas + SZÁMADÁS-HATÁROZAT oszlopok:
--        szamadas_hatarozat_szam / szamadas_hatarozat_datum
--      MIÉRT: a véglegesítő wizard megyei ágon is bekéri a jóváhagyó gyűlés
--      jegyzőkönyvi számát és dátumát, de eddig CSAK a snapshot JSON-ba került
--      — a megyei nyomtatvány-borító „Tárgyalta és jóváhagyta…" sora üresen
--      maradt (ugyanaz a hiba, amit az átvilágítás 15. pontja a gyülekezeti
--      oldalon már javított).
--
-- ⚠️ A költségvetés-MÓDOSÍTÁS flagek (koltsegvetes_mod1..3_veglegesitve +
--    _veglegesites_datuma + _veglegesitette) NEM itt jönnek létre: azokat a
--    2026-08-15-egyhazmegyei-uj-tablak.sql 1/B szakasza adja hozzá. Ez a fájl
--    a 0. szakaszban ELLENŐRZI, hogy megvannak-e.
--
-- TANULSÁGOK, AMIKRE ÉPÜL:
--   · „A migration-fájl NEM bizonyíték" → 0. szakasz állapotfelmérés + záró
--     ellenőrző SELECT (az eredményt küldd vissza).
--   · RLS/GRANT: ÚJ policy vagy tábla itt NINCS — a diocese_bealitas meglévő
--     (az S1-ben szerep-szűrtre írt) policyjai az új oszlopokra is érvényesek,
--     a számvevő RESTRICTIVE írás-tiltója pedig változatlanul tilt. A záró
--     SELECT ezt has_table_privilege-dzsel visszaellenőrzi.
--   · Mentés-besorolás: a diocese_bealitas MÁR besorolt
--     (2026-08-11-biztonsagi-mentes.sql: globalis / R2) — oszlop-bővítés nem
--     igényel új sort; a záró SELECT a besorolást is visszaellenőrzi.
--
-- FUTTATÁSI SORREND (Endre futtatja, Supabase SQL Editor):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT).
--   2.  1. SZAKASZ — OSZLOP-BŐVÍTÉS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — az eredményt küldd vissza).
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS — akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · CÉL-TÁBLA' AS szakasz,
       'Létezik-e a diocese_bealitas?' AS mit,
       CASE WHEN to_regclass('public.diocese_bealitas') IS NULL
            THEN '⛔ NINCS — előbb a 2026-04-18-egyhazmegyei-penzugy-fazis8.sql fusson le!'
            ELSE 'megvan' END AS ertek,
       'Ha nincs: az 1. szakasz hangosan le fog állni.' AS teendo

UNION ALL
SELECT 2, '0/B · MÓDOSÍTÁS-FLAGEK (előfeltétel)',
       'Megvannak-e a koltsegvetes_mod1..3 oszlopok? (9 = rendben)',
       (SELECT count(*)::text || ' / 9' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name LIKE 'koltsegvetes_mod%'),
       'Ha nem 9: ELŐBB a 2026-08-15-egyhazmegyei-uj-tablak.sql 1/B szakasza fusson le — enélkül a megyei költségvetés-módosítás véglegesítése magyar hibával áll meg (a kód szándékosan nem ír „vakon").'

UNION ALL
SELECT 3, '0/C · E FÁJL OSZLOPAI',
       'Megvannak-e már az új oszlopok? (5 = újrafuttatás, 0 = első futás)',
       (SELECT count(*)::text || ' / 5' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name IN ('koltsegvetes_unlock_requested','koltsegvetes_unlock_request_reason',
                              'koltsegvetes_unlock_request_at','szamadas_hatarozat_szam',
                              'szamadas_hatarozat_datum')),
       'Tájékoztató — az 1. szakasz mindkét esetben biztonságos.'

UNION ALL
SELECT 4, '0/D · MENTÉS-BESOROLÁS',
       'diocese_bealitas a backup_table_policy-ban? (az oszlop neve: tabla)',
       COALESCE((SELECT 'megvan — hatokor=' || hatokor || ', reteg=' || reteg::text
                 FROM public.backup_table_policy WHERE tabla = 'diocese_bealitas'),
                '⛔ NINCS — futtasd a 2026-08-11-biztonsagi-mentes.sql-t (besorolatlan táblánál a napi mentés megáll)'),
       'Oszlop-bővítéshez új besorolás nem kell, a meglévőnek léteznie kell.';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — OSZLOP-BŐVÍTÉS                             FUTTATÁS: 2.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- Fail-closed előfeltétel-őr: hiányzó alaptáblánál beszédes magyar hibával
-- állunk meg — nem futunk tovább hibás előfeltétellel.
DO $$
BEGIN
  IF to_regclass('public.diocese_bealitas') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs diocese_bealitas tábla — előbb a 2026-04-18-egyhazmegyei-penzugy-fazis8.sql fusson le.';
  END IF;
END $$;

-- (A) Költségvetés-feloldás kérelem — a szamadas_unlock_* meglévő mintájára.
ALTER TABLE public.diocese_bealitas
  ADD COLUMN IF NOT EXISTS koltsegvetes_unlock_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koltsegvetes_unlock_request_reason text,
  ADD COLUMN IF NOT EXISTS koltsegvetes_unlock_request_at timestamptz;

COMMENT ON COLUMN public.diocese_bealitas.koltsegvetes_unlock_requested IS
  '2026-08-15 (S6): a megye SAJÁT költségvetésének feloldás-kérelme (az egységes véglegesítés-gomb útja). Az elbíráló a felettes szint (egyházkerület) — a fogadó oldala a 3. szint külön körében épül; addig a kérelem itt rögzül.';
COMMENT ON COLUMN public.diocese_bealitas.koltsegvetes_unlock_request_reason IS
  '2026-08-15 (S6): a feloldás-kérelem indoklása (≥10 karakter, a felület kényszeríti ki).';
COMMENT ON COLUMN public.diocese_bealitas.koltsegvetes_unlock_request_at IS
  '2026-08-15 (S6): a feloldás-kérelem időpontja.';

-- (B) Számadás-határozat a megyei borítóra — a gyülekezeti bealitas
--     szamadas_hatarozat_szam/_datum oszlopainak megyei párja.
ALTER TABLE public.diocese_bealitas
  ADD COLUMN IF NOT EXISTS szamadas_hatarozat_szam text,
  ADD COLUMN IF NOT EXISTS szamadas_hatarozat_datum date;

COMMENT ON COLUMN public.diocese_bealitas.szamadas_hatarozat_szam IS
  '2026-08-15 (S6): a megyei számadást jóváhagyó gyűlés jegyzőkönyvi/határozat-száma — a véglegesítő wizard tölti; a nyomtatvány-borító „Tárgyalta és jóváhagyta…" sora innen él.';
COMMENT ON COLUMN public.diocese_bealitas.szamadas_hatarozat_datum IS
  '2026-08-15 (S6): a jóváhagyó gyűlés dátuma.';

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2/A · ÚJ OSZLOPOK' AS szakasz,
       'Megvan mind az 5 új oszlop? (5 = rendben)' AS mit,
       (SELECT count(*)::text || ' / 5' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name IN ('koltsegvetes_unlock_requested','koltsegvetes_unlock_request_reason',
                              'koltsegvetes_unlock_request_at','szamadas_hatarozat_szam',
                              'szamadas_hatarozat_datum')) AS ertek,
       'Ha nem 5: az 1. szakasz nem futott végig.' AS teendo

UNION ALL
SELECT 101, '2/B · MÓDOSÍTÁS-FLAGEK',
       'Megvan mind a 9 koltsegvetes_mod% oszlop? (a másik fájl 1/B szakasza)',
       (SELECT count(*)::text || ' / 9' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name LIKE 'koltsegvetes_mod%'),
       'Ha nem 9: futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t is — a megyei módosítás-véglegesítés addig magyar hibával áll meg.'

UNION ALL
SELECT 102, '2/C · RLS ÉL',
       'RLS bekapcsolva a diocese_bealitas-on?',
       (SELECT CASE WHEN relrowsecurity THEN 'igen' ELSE '⛔ NEM — futtasd a 2026-08-15-egyhazmegyei-rls-szerep-szuro.sql-t' END
        FROM pg_class WHERE oid = to_regclass('public.diocese_bealitas')),
       'Az új oszlopokra a meglévő (S1-ben szerep-szűrt) policyk érvényesek.'

UNION ALL
SELECT 103, '2/D · GRANT-TANULSÁG',
       'Az authenticated ír-olvas a diocese_bealitas-on? (RLS szűri tovább)',
       (SELECT CASE WHEN has_table_privilege('authenticated','public.diocese_bealitas','SELECT')
                     AND has_table_privilege('authenticated','public.diocese_bealitas','UPDATE')
                    THEN 'igen' ELSE '⛔ NEM — GRANT hiányzik (403-leállás lenne)' END),
       'A policy a hívó szerepében fut — GRANT nélkül 403.'

UNION ALL
SELECT 104, '2/E · MENTÉS-BESOROLÁS',
       'diocese_bealitas + diocese_annual_reports besorolva? (2 = rendben)',
       (SELECT count(*)::text || ' / 2' FROM public.backup_table_policy
        WHERE tabla IN ('diocese_bealitas','diocese_annual_reports')),
       'Ha nem 2: futtasd a 2026-08-11-biztonsagi-mentes.sql-t.'

ORDER BY sorszam;
