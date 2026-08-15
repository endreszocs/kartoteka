-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MEGYEI ÖSSZESÍTŐ — FELOLDÁS-KÉRÉS OSZLOPAI                  2026-08-15   ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-osszesito-feloldas.sql   ║
-- ║ (Egyházmegyei szint terv, 3.5–3.6 + Endre 3–4. döntése:                   ║
-- ║  „az összesítő KÜLÖN véglegesítése ugyanazzal a gombbal")                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT AD HOZZÁ a `diocese_felterjesztes` táblához (amit a
-- 2026-08-15-egyhazmegyei-uj-tablak.sql 1/C szakasza hoz létre):
--
--  (A) `unlock_requested` (boolean, NOT NULL DEFAULT false)
--      `unlock_reason`    (text)
--      `unlock_requested_at` (timestamptz), `unlock_requested_by` (uuid)
--
-- MIÉRT KELL: az EGYSÉGES véglegesítés-gomb (packages/ui-app/src/shared/
-- FinalizeButton.tsx) viselkedése mind a hat gyülekezeti iratnál AZONOS:
-- véglegesítés → zárolás → „Feloldás kérése" kötelező indoklással. Endre
-- döntése szerint a megyei ÖSSZESÍTŐ is UGYANEZT a gombot kapja. A feloldás
-- azonban két úton mehet, és a másodikhoz TÁROLNI kell a kérést:
--
--   1. Ha az egyházkerület MÉG NEM VETTE ÁT (status='submitted'), az app a
--      felküldést VISSZAVONJA (status='draft'), és a `notes` naplóba írja,
--      mikor és miért. Ehhez nem kell új oszlop.
--   2. Ha az egyházkerület MÁR ÁTVETTE (status='received'), a visszavonás
--      hazugság lenne (az irat a felettes szint kezében van) — ilyenkor a
--      KÉRÉS rögzül ezekben az oszlopokban, és a kerület bírálja el (a
--      kerületi fogadó felület a 3. szint külön körében épül).
--
-- E fájl NÉLKÜL a program NEM romlik el: az összesítő és a felküldés működik,
-- csak a MÁR ÁTVETT összesítő feloldás-kérése áll meg beszédes magyar
-- üzenettel, ami megnevezi ezt a fájlt (app-oldali fail-soft ág:
-- apps/web/lib/finance/diocese-felterjesztes.ts).
--
-- TANULSÁGOK, AMIKRE ÉPÜL:
--   · „A migration-fájl NEM bizonyíték" → 0. szakasz állapotfelmérés + záró
--     ellenőrző SELECT (az eredményt küldd vissza).
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → ÚJ policy itt
--     nincs (a meglévők a TÁBLÁRA szólnak, az oszlop-bővítés nem érinti őket),
--     de a záró SELECT `has_table_privilege`-dzsel visszaellenőrzi a jogokat.
--   · Mentés-besorolás (backup_table_policy — az oszlop neve: tabla!): a
--     `diocese_felterjesztes` MÁR besorolt (uj-tablak 1/F, globalis / R2) —
--     oszlop-bővítés új sort nem igényel, de a besorolás LÉTÉT ellenőrizzük
--     (besorolatlan táblánál a napi mentés HANGOSAN megáll).
--
-- FUTTATÁSI SORREND (Endre futtatja, Supabase SQL Editor):
--   ELŐTTE: 2026-08-15-egyhazmegyei-uj-tablak.sql (ez hozza létre a táblát!)
--           majd 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT).
--   2.  1. SZAKASZ — BŐVÍTÉS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — az eredményt küldd vissza).
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS — akárhányszor újrafuttatható.
--
-- ⚠️ SORREND-CSAPDA (változatlanul él): ha valamikor ÚJRA lefuttatod a
--    2026-08-15-egyhazmegyei-uj-tablak.sql fájlt, az visszahozza a RÉGI, három
--    oszlopos egyedi indexet — ilyenkor a
--    2026-08-15-egyhazmegyei-felterjesztes-modositas.sql fájlt is futtasd le
--    utána. EZ a fájl attól függetlenül biztonságos.



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
SELECT 2, '0/B · E FÁJL OSZLOPAI',
       'Megvan-e már a 4 feloldás-oszlop? (4 = újrafuttatás, 0 = első futás)',
       (SELECT count(*)::text || ' / 4' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_felterjesztes'
          AND column_name IN ('unlock_requested','unlock_reason',
                              'unlock_requested_at','unlock_requested_by')),
       'Tájékoztató — az 1. szakasz mindkét esetben biztonságos.'

UNION ALL
SELECT 3, '0/C · ÖSSZESÍTŐ SOROK',
       'Hány számvevői összesítő van már felküldve?',
       COALESCE((SELECT count(*)::text FROM public.diocese_felterjesztes
                 WHERE doc_type = 'szamvevoi_osszesito'), '—'),
       'A meglévő sorok unlock_requested-je false lesz (nincs függő kérés).'

UNION ALL
SELECT 4, '0/D · MENTÉS-BESOROLÁS',
       'diocese_felterjesztes a backup_table_policy-ban? (az oszlop neve: tabla)',
       COALESCE((SELECT 'megvan — hatokor=' || hatokor || ', reteg=' || reteg::text
                 FROM public.backup_table_policy WHERE tabla = 'diocese_felterjesztes'),
                '⛔ NINCS — futtasd a 2026-08-15-egyhazmegyei-uj-tablak.sql-t (besorolatlan táblánál a napi mentés megáll)'),
       'Oszlop-bővítéshez új besorolás nem kell, a meglévőnek léteznie kell.';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — BŐVÍTÉS                                    FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- Fail-closed előfeltétel-őr: hiányzó alaptáblánál beszédes magyar hibával
-- állunk meg — nem futunk tovább hibás előfeltétellel.
DO $orszem$
BEGIN
  IF to_regclass('public.diocese_felterjesztes') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs diocese_felterjesztes tábla — előbb a 2026-08-15-egyhazmegyei-uj-tablak.sql fusson le.';
  END IF;
END $orszem$;

ALTER TABLE public.diocese_felterjesztes
  ADD COLUMN IF NOT EXISTS unlock_requested     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_reason        text,
  ADD COLUMN IF NOT EXISTS unlock_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS unlock_requested_by  uuid;

COMMENT ON COLUMN public.diocese_felterjesztes.unlock_requested IS
  '2026-08-15 (megyei összesítő): folyamatban lévő feloldás-kérés a MÁR ÁTVETT felterjesztésre. A még át nem vett (submitted) felterjesztést az app visszavonja (status=draft), ott ez az oszlop nem használt.';
COMMENT ON COLUMN public.diocese_felterjesztes.unlock_reason IS
  '2026-08-15: a feloldás-kérés kötelező (≥10 karakteres) indoklása — ebből dönt az egyházkerület.';
COMMENT ON COLUMN public.diocese_felterjesztes.unlock_requested_at IS
  '2026-08-15: mikor kérték a feloldást (a kérés elévülésének megítéléséhez).';
COMMENT ON COLUMN public.diocese_felterjesztes.unlock_requested_by IS
  '2026-08-15: ki kérte a feloldást (auth.users id — FK SZÁNDÉKOSAN nincs, a repó bevett mintája szerint a *_by oszlopokon).';

-- Gyors visszakeresés a (majdani) kerületi bíráló felületnek: melyik
-- felterjesztésen van függő feloldás-kérés. Részleges index — csak a függő
-- sorok kerülnek bele (a tábla döntő többsége soha).
CREATE INDEX IF NOT EXISTS diocese_felterjesztes_unlock_idx
  ON public.diocese_felterjesztes (district_id, year)
  WHERE unlock_requested = true;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2/A · OSZLOPOK' AS szakasz,
       'Megvan mind a 4 feloldás-oszlop?' AS mit,
       (SELECT count(*)::text || ' / 4' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_felterjesztes'
          AND column_name IN ('unlock_requested','unlock_reason',
                              'unlock_requested_at','unlock_requested_by')) AS ertek,
       'Ha nem 4: a már átvett összesítő feloldás-kérése magyar hibával áll meg.' AS teendo

UNION ALL
SELECT 101, '2/B · ALAPÉRTÉK',
       'unlock_requested NOT NULL, alapérték false?',
       COALESCE((SELECT 'is_nullable=' || is_nullable || ', default=' || COALESCE(column_default,'nincs')
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='diocese_felterjesztes'
                   AND column_name='unlock_requested'),
                '⛔ NINCS'),
       'NULL-os zászlóból „talán van kérés" lenne — az alapérték false kötelező.'

UNION ALL
SELECT 102, '2/C · RÉSZLEGES INDEX',
       'Létezik a függő kérések indexe?',
       CASE WHEN to_regclass('public.diocese_felterjesztes_unlock_idx') IS NOT NULL
            THEN 'igen' ELSE '⛔ NEM' END,
       'A kerületi bíráló felület ezen keresi majd a függő kéréseket.'

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

UNION ALL
SELECT 106, '2/G · FÜGGŐ KÉRÉSEK',
       'Van-e most függő feloldás-kérés? (első futáskor 0 a helyes)',
       COALESCE((SELECT count(*)::text FROM public.diocese_felterjesztes
                 WHERE unlock_requested = true), '—'),
       'Tájékoztató.'

ORDER BY sorszam;
