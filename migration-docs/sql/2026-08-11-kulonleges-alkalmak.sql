-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — Különleges gyülekezeti alkalmak nyilvántartása (2026-08-11, 6. kör)
-- ════════════════════════════════════════════════════════════════════════════
--
-- MIT CSINÁL
--   EGYETLEN új táblát hoz létre: public.kulonleges_alkalom. Ide kerül, hogy egy
--   előre betervezett KÜLÖNLEGES alkalom (szeretetvendégség, hangverseny, tábor,
--   kirándulás, gyülekezeti nap, evangelizáció, jótékonysági alkalom) megtörtént-e,
--   mikor, és hányan voltak ott.
--
-- MIT NEM CSINÁL — TUDATOSAN
--   · NEM nyúl a gyulekezeti_programok táblához (se oszlop, se CHECK-bővítés).
--     Azt a naptár-widget, a Google ICS-feed és több felület is olvassa; a
--     „ne kérdezd többé" állapot elfér EBBEN a táblában (allapot='nem_kulonleges').
--   · NEM tesz automatikussá egyetlen jelentés-rubrikát sem. A III.4
--     (Szeretetvendégségek száma) és a II.10 (Más alkalmak) KÉZI marad; a
--     nyilvántartás csak JAVASLATOT ad a mező mellé, egy „Beírom" gombbal.
--     Így egy hiányosan vezetett nyilvántartás SOHA nem tud aláírt, beküldött
--     nyomtatványon kisebb számot nyomtatni annál, amit a lelkész tud.
--   · NEM módosít és NEM töröl semmilyen meglévő adatot. Visszagörgethető.
--
-- FUTTATÁS — HÁROM KÜLÖN FUTTATÁS, EBBEN A SORRENDBEN
--   A Supabase SQL Editor több utasításnál CSAK AZ UTOLSÓ eredményét mutatja,
--   ezért minden ellenőrzés EGYETLEN SELECT. Jelöld ki a szakaszt, és futtasd
--   ÖNMAGÁBAN (Ctrl+Enter a kijelölésre):
--     SZAKASZ 0 — állapotfelmérés (FUTTASD ELŐSZÖR, és olvasd el!)
--     SZAKASZ 1 — a migráció
--     SZAKASZ 2 — ellenőrzés (a fájl megléte NEM bizonyíték a lefutásra)
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 0 — ÁLLAPOTFELMÉRÉS.  Jelöld ki EZT az egy SELECT-et, és futtasd.║
-- ║ Ha bármelyik sor ❌, NE FUTTASD a SZAKASZ 1-et — küldd vissza a képernyőt.║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌ ÁLLJ MEG' END AS rendben
FROM (
  SELECT 1 AS sorrend,
         'A kulonleges_alkalom tábla MÉG NEM létezik'::text AS mit_mer,
         (to_regclass('public.kulonleges_alkalom') IS NULL)::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'A gyulekezeti_programok tábla létezik (FK-cél)',
         (to_regclass('public.gyulekezeti_programok') IS NOT NULL)::text, 'true'

  UNION ALL SELECT 3, 'A congregations tábla létezik (FK-cél)',
         (to_regclass('public.congregations') IS NOT NULL)::text, 'true'

  -- 2026-08-11 (6. kör, reviewer-major): az RLS a KANONIKUS helperre épül, nem a
  -- `current_user_congregation_id()` SKALÁRRA. Az az 5. kör óta CSAK a
  -- `profiles.congregation_id`-t adja vissza — a profilváltóval dolgozó lelkész
  -- (két gyülekezet) és a „Belépés a gyülekezetbe" admin ettől NÉMÁN üres listát
  -- kapott volna (az RLS szűr, nem hibázik), az írás pedig nyers angol
  -- Postgres-üzenettel bukott volna. Ezért ezek LÉTEZÉSE ELŐFELTÉTEL.
  UNION ALL SELECT 4, 'current_user_can_access_congregation(uuid) létezik (RLS-hez kell)',
         (to_regprocedure('public.current_user_can_access_congregation(uuid)') IS NOT NULL)::text, 'true'

  UNION ALL SELECT 5, 'felettes_szint_gyulekezet_ids() létezik (esperes/kerület olvasás)',
         (to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NOT NULL)::text, 'true'

  UNION ALL SELECT 6, 'PostgreSQL 12+ (generált oszlop támogatás)',
         (current_setting('server_version_num')::int >= 120000)::text, 'true'

  UNION ALL SELECT 7, 'gen_random_uuid() elérhető',
         (to_regprocedure('gen_random_uuid()') IS NOT NULL)::text, 'true'

  -- TÁJÉKOZTATÓ sorok (mindig ✅) — mekkora munkalistára számítson a lelkész
  UNION ALL SELECT 8, 'TÁJÉKOZTATÓ — nem ismétlődő naptár-tétel 2026-ban (db)',
         COALESCE((SELECT count(*)::text FROM public.gyulekezeti_programok
                   WHERE ismetlodes_tipus IS NULL
                     AND datum BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'), '0'),
         COALESCE((SELECT count(*)::text FROM public.gyulekezeti_programok
                   WHERE ismetlodes_tipus IS NULL
                     AND datum BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'), '0')

  UNION ALL SELECT 9, 'TÁJÉKOZTATÓ — ebből KÜLÖNLEGES típusú 2026-ban (db)',
         COALESCE((SELECT count(*)::text FROM public.gyulekezeti_programok
                   WHERE ismetlodes_tipus IS NULL
                     AND datum BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
                     AND tipus IN ('hangverseny','tabor','evangelizacio',
                                   'konferencia','diakoniai','kozossegi')), '0'),
         COALESCE((SELECT count(*)::text FROM public.gyulekezeti_programok
                   WHERE ismetlodes_tipus IS NULL
                     AND datum BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
                     AND tipus IN ('hangverseny','tabor','evangelizacio',
                                   'konferencia','diakoniai','kozossegi')), '0')
) x
ORDER BY x.sorrend;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 1 — A MIGRÁCIÓ.  Jelöld ki a BEGIN-től a COMMIT-ig, és futtasd.  ║
-- ║ Idempotens: IF NOT EXISTS + DROP/CREATE — kétszer futtatva sem árt.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ŐRSZEM (fail-closed): ha a kanonikus hozzáférés-helper hiányzik, a policy
-- létrehozása bukna — de csak a COMMIT előtti utolsó pillanatban, félig kész
-- állapotot sugallva. Inkább ITT álljunk meg, beszédes magyar üzenettel.
-- A migration-fájl megléte NEM bizonyíték arra, hogy az 5. kör lefutott ÉLESBEN.
DO $orszem$
BEGIN
    IF to_regprocedure('public.current_user_can_access_congregation(uuid)') IS NULL THEN
        RAISE EXCEPTION '⛔ Hiányzik a public.current_user_can_access_congregation(uuid) — előbb a 2026-08-11-globalis-hozzaferes-szukites.sql-t futtasd le.';
    END IF;
    IF to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NULL THEN
        RAISE EXCEPTION '⛔ Hiányzik a public.felettes_szint_gyulekezet_ids() — előbb a 2026-08-11-globalis-hozzaferes-szukites.sql-t futtasd le.';
    END IF;
END
$orszem$;

CREATE TABLE IF NOT EXISTS public.kulonleges_alkalom (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    congregation_id uuid NOT NULL
        REFERENCES public.congregations(id) ON DELETE CASCADE,

    -- A naptár-tétel, amelyből lett. NULL = utólag rögzített alkalom (nem volt
    -- betervezve), VAGY a naptár-sort azóta TÖRÖLTÉK. A deleteProgram valódi
    -- (hard) DELETE-et futtat, ezért ON DELETE SET NULL: a naptár takarítása
    -- SOHA nem tüntetheti el a már rögzített alkalmat.
    program_id uuid
        REFERENCES public.gyulekezeti_programok(id) ON DELETE SET NULL,

    -- A tervezett nap. Ez különbözteti meg az alkalmakat (a naptár-sor egy
    -- sor), ezért része az egyedi kulcsnak. Elmaradt alkalomnál ez a
    -- „mikor lett volna".
    tervezett_datum date NOT NULL,
    -- A tényleges nap. Megtartott alkalomnál KÖTELEZŐ (alap: a tervezett nap).
    -- Ez az EGYETLEN helyes kezelése az évhatáron átcsúszott alkalomnak.
    tenyleges_datum date,

    -- MÁSOLAT a naptár-tétel címéből: a naptár-sor törölhető és átnevezhető,
    -- a rögzített alkalom megnevezése nem változhat utólag.
    cim text NOT NULL,

    -- A jelentés KÉT szám-rovata közti besorolás — nem 7 rubrika, mert a
    -- nyomtatványon pontosan két hely van:
    --   true  → III.4 „Szeretetvendégségek száma"
    --   false → II.10 „Más alkalmak"
    szeretetvendegseg boolean NOT NULL DEFAULT false,

    -- HÁROM állapot:
    --   'megtartva'      → beleszámít a javaslatba
    --   'elmaradt'       → nem számít sehova, de megmarad (jövőre látszik, miért
    --                      esett vissza a szám, és az esperes rákérdezhet)
    --   'nem_kulonleges' → a lelkész kimondta: ne kérdezd többé (a kétértelmű
    --                      naptár-típusok — unnep / noszovetseg / egyeb — kikapcsolása)
    allapot text NOT NULL
        CONSTRAINT kulonleges_alkalom_allapot_chk
        CHECK (allapot IN ('megtartva', 'elmaradt', 'nem_kulonleges')),

    -- Jelenlét. NULL egy MEGTARTOTT soron = „nem számoltam meg" — ez ÉRVÉNYES,
    -- végleges válasz, az alkalom attól még számít darabnak. A létszám EGYETLEN
    -- hivatalos rubrikába sem folyik (a III.4/II.10 „alkalom" egységű), csak a
    -- IX.1 „A gyülekezet életének fontosabb eseményei" szövegébe kínálható fel.
    resztvevok integer
        CHECK (resztvevok IS NULL OR (resztvevok >= 0 AND resztvevok <= 100000)),

    -- Egy mondat a jelentésbe: ki szolgált, ki lépett fel, mi történt.
    megjegyzes text,

    -- A JELENTÉS ÉVE — generált oszlop, nem sodródhat el a dátumtól.
    -- (Ha a szerver „generation expression is not immutable" hibát adna, cseréld:
    --  date_part('year', COALESCE(tenyleges_datum, tervezett_datum))::integer)
    ev integer GENERATED ALWAYS AS
        (EXTRACT(YEAR FROM COALESCE(tenyleges_datum, tervezett_datum))::integer) STORED,

    -- Megtartott alkalomnak KELL tényleges dátum, különben az `ev` tippelne.
    CONSTRAINT kulonleges_alkalom_datum_chk CHECK (
        allapot <> 'megtartva' OR tenyleges_datum IS NOT NULL),
    -- Létszám csak megtartott alkalomhoz tartozhat.
    CONSTRAINT kulonleges_alkalom_letszam_chk CHECK (
        resztvevok IS NULL OR allapot = 'megtartva'),
    -- Szeretetvendégség-jelölés csak megtartott alkalmon értelmes.
    CONSTRAINT kulonleges_alkalom_szv_chk CHECK (
        szeretetvendegseg = false OR allapot = 'megtartva'),

    rogzitette_id uuid REFERENCES auth.users(id),
    rogzitette_nev text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted boolean NOT NULL DEFAULT false
);

-- EGY NAPTÁR-SORRA EGY ÉLŐ VÁLASZ — DB-szintű őr a kettős számolás ellen.
--
-- 2026-08-11 (6. kör, reviewer-major): a kulcsból KIMARADT a `tervezett_datum`.
-- A régi (congregation_id, program_id, tervezett_datum) hármas azt hitte, hogy a
-- tervezett nap az AZONOSSÁG része — pedig az ADAT. Ha a lelkész a naptárban
-- ÁTHELYEZI a betervezett alkalmat (dec. 14. → dec. 21., a leggyakoribb
-- naptár-művelet), a már megválaszolt sor a régi napon maradt, a naptár-tétel az
-- újon: ugyanaz az alkalom KÉTSZER jelent meg a listán, és a második megerősítése
-- NEM ütközött az elsővel — két élő `megtartva` sor lett belőle. Az összesítés
-- mindkettőt beszámolta, tehát az aláírt, egyházmegyének BEKÜLDÖTT jelentés
-- III.4 / II.10 rubrikájához kínált javaslat FELFELÉ hamisított.
--
-- A `program_id IS NOT NULL` feltétel SZÁNDÉKOS: a terv nélkül, utólag rögzített
-- alkalmakból lehet több ugyanarra a napra (két külön alkalom egy napon).
DROP INDEX IF EXISTS public.uq_kulonleges_alkalom_terv;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kulonleges_alkalom_program
    ON public.kulonleges_alkalom (congregation_id, program_id)
    WHERE program_id IS NOT NULL AND deleted = false;

CREATE INDEX IF NOT EXISTS idx_kulonleges_alkalom_cong_ev
    ON public.kulonleges_alkalom (congregation_id, ev)
    WHERE deleted = false;

CREATE INDEX IF NOT EXISTS idx_kulonleges_alkalom_cong_terv
    ON public.kulonleges_alkalom (congregation_id, tervezett_datum)
    WHERE deleted = false;

COMMENT ON TABLE public.kulonleges_alkalom IS
    'Különleges gyülekezeti alkalmak megerősítése a lelkészi jelentéshez '
    '(megtörtént-e, mikor, hányan voltak). A III.4 / II.10 rubrika JAVASLATÁNAK '
    'forrása — a hivatalos számot a lelkész írja be kézzel.';
COMMENT ON COLUMN public.kulonleges_alkalom.allapot IS
    'megtartva | elmaradt | nem_kulonleges (= ne kérdezd többé)';
COMMENT ON COLUMN public.kulonleges_alkalom.resztvevok IS
    'Jelenlét. NULL megtartott soron = „nem számoltam meg" (érvényes válasz). '
    'Hivatalos szám-rubrikába NEM folyik.';
COMMENT ON COLUMN public.kulonleges_alkalom.ev IS
    'Generált: a TÉNYLEGES (ha van), különben a tervezett dátum éve. '
    'Az évhatáron átcsúszott alkalom így automatikusan a helyes év jelentéséhez tartozik.';

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — a KANONIKUS helperrel (2026-08-11, 6. kör, reviewer-major)
-- ────────────────────────────────────────────────────────────────────────────
--
-- MIÉRT NEM a beégetett
--   `congregation_id = current_user_congregation_id() OR current_user_has_global_access()`
-- minta, amit a régebbi táblák használnak:
--
--  (1) A `current_user_congregation_id()` a `profiles.congregation_id` SKALÁRT
--      adja vissza (2026-04-12-phase-0-rls-hardening.sql:39-50). Az app viszont
--      a `getEffectiveCongregationContext()`-ből kapott hatókörrel szűr és ír,
--      ami `activeProfileRole.scopeId`-ből VAGY admin `override.congregationId`-ből
--      is jöhet. A kettő SZÉTHÚZ — ez a memóriában rögzített
--      „skalár ⇄ profile_roles divergencia" hibaosztály. Következmény: a
--      profilváltóval a MÁSIK gyülekezetében dolgozó lelkész OLVASÁSKOR üres
--      listát kap (az RLS SZŰR, nem hibázik → „Nincs megválaszolatlan alkalom",
--      holott van, és a III.4 / II.10 javaslat 0-t mutat egy aláírandó papír
--      mellett), ÍRÁSKOR pedig nyers angol Postgres-hibát.
--  (2) A `current_user_has_global_access()` az 5. kör óta CSAK RENDSZERGAZDÁT
--      jelent — az esperes/egyházmegyei admin ezen az ágon már nem lát semmit.
--
-- A `current_user_can_access_congregation(uuid)` HAT ága mindezt lefedi:
--   (1) rendszergazda · (2) saját gyülekezet (skalár) · (3) egyházmegye/kerület ·
--   (4) egyházmegyei számvevő jóváhagyva · (5) könyvelő m2m jóváhagyva ·
--   (6) profile_roles gyülekezeti hatókör (PROFILVÁLTÓ) — pontosan a hiányzó láb.
ALTER TABLE public.kulonleges_alkalom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kulonleges_alkalom_access ON public.kulonleges_alkalom;
CREATE POLICY kulonleges_alkalom_access ON public.kulonleges_alkalom
    FOR ALL TO authenticated
    USING      (public.current_user_can_access_congregation(kulonleges_alkalom.congregation_id))
    WITH CHECK (public.current_user_can_access_congregation(kulonleges_alkalom.congregation_id));

COMMENT ON POLICY kulonleges_alkalom_access ON public.kulonleges_alkalom IS
    '2026-08-11 (6. kör): a KANONIKUS current_user_can_access_congregation(uuid)-re épül, '
    'nem a current_user_congregation_id() skalárra — különben a profilváltóval dolgozó '
    'lelkész és a „Belépés a gyülekezetbe" admin némán ÜRES listát kapna.';

-- Additív FELETTES SZINTŰ OLVASÁS — az 5. kör `<tábla>_szint_select` mintája.
-- Az a DO-blokk a FUTÁSKOR létező táblákat sorolta fel, ez a tábla akkor még nem
-- létezett; enélkül az esperes / egyházmegyei / kerületi szint egyáltalán nem
-- olvasná. (A `current_user_can_access_congregation` (3) ága ugyan lefedi a
-- megyét/kerületet, de a névre szóló policy az, ami a mintát ellenőrizhetővé
-- teszi — és a helper (3) ága szigorúbb feltételekkel dolgozik.)
DROP POLICY IF EXISTS kulonleges_alkalom_szint_select ON public.kulonleges_alkalom;
CREATE POLICY kulonleges_alkalom_szint_select ON public.kulonleges_alkalom
    FOR SELECT TO authenticated
    USING (
        kulonleges_alkalom.congregation_id
            = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[]))
    );

COMMENT ON POLICY kulonleges_alkalom_szint_select ON public.kulonleges_alkalom IS
    '2026-08-11 (6. kör): additív megyei/kerületi OLVASÁS, a P1 #17 <tábla>_szint_select '
    'mintája szerint. Csak SELECT — az írás a kulonleges_alkalom_access policy-n marad.';

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VISSZAVONÁS (rollback) — CSAK ha vissza kell állni a migráció ELŐTTI     ║
-- ║ állapotra. FIGYELEM: a már rögzített különleges alkalmak ELVESZNEK.      ║
-- ║ Semmilyen MÁS adatot nem érint (a jelentés-számok kéziek, érintetlenek). ║
-- ║ Vedd le a kommentjeleket, jelöld ki, futtasd.                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- BEGIN;
--   DROP TABLE IF EXISTS public.kulonleges_alkalom;  -- a policy + indexek vele mennek
-- COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 2 — ELLENŐRZÉS.  Jelöld ki EZT az egy SELECT-et, és futtasd.     ║
-- ║ MIND a 13 sornak ✅-nak kell lennie.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend,
         'A tábla létrejött'::text AS mit_mer,
         (to_regclass('public.kulonleges_alkalom') IS NOT NULL)::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'Oszlopok száma',
         COALESCE((SELECT count(*)::text FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='kulonleges_alkalom'), '0'), '16'

  UNION ALL SELECT 3, 'Az `ev` oszlop GENERÁLT (nem sodródhat el a dátumtól)',
         COALESCE((SELECT is_generated FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='kulonleges_alkalom'
                     AND column_name='ev'), 'NINCS ILYEN OSZLOP'), 'ALWAYS'

  UNION ALL SELECT 4, 'allapot CHECK — a 3 érték benne van',
         COALESCE((SELECT (pg_get_constraintdef(oid) LIKE '%nem_kulonleges%')::text
                   FROM pg_constraint
                   WHERE conrelid = to_regclass('public.kulonleges_alkalom')
                     AND conname = 'kulonleges_alkalom_allapot_chk'), 'NINCS'), 'true'

  UNION ALL SELECT 5, 'Dátum-őr CHECK (megtartva → van tényleges dátum)',
         COALESCE((SELECT 'true' FROM pg_constraint
                   WHERE conrelid = to_regclass('public.kulonleges_alkalom')
                     AND conname = 'kulonleges_alkalom_datum_chk' LIMIT 1), 'NINCS'), 'true'

  UNION ALL SELECT 6, 'Létszám-őr CHECK (létszám csak megtartott alkalomhoz)',
         COALESCE((SELECT 'true' FROM pg_constraint
                   WHERE conrelid = to_regclass('public.kulonleges_alkalom')
                     AND conname = 'kulonleges_alkalom_letszam_chk' LIMIT 1), 'NINCS'), 'true'

  -- A kulcs a NAPTÁR-SOR, nem a nap: a régi (…, tervezett_datum) hármas mellett
  -- egy áthelyezett naptár-tétel KÉT élő „megtartva" sort engedett ugyanarra az
  -- alkalomra → felfelé hamisított javaslat az aláírt jelentéshez.
  UNION ALL SELECT 7, 'Egyedi index a NAPTÁR-SORRA (kettős számolás elleni DB-őr)',
         COALESCE((SELECT 'true' FROM pg_indexes
                   WHERE schemaname='public' AND tablename='kulonleges_alkalom'
                     AND indexname='uq_kulonleges_alkalom_program' LIMIT 1), 'NINCS'), 'true'

  UNION ALL SELECT 12, 'A RÉGI, dátumos egyedi index MÁR NINCS',
         (NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public' AND tablename='kulonleges_alkalom'
                        AND indexname='uq_kulonleges_alkalom_terv'))::text, 'true'

  UNION ALL SELECT 8, 'Év-index (a lista lekérdezéséhez)',
         COALESCE((SELECT 'true' FROM pg_indexes
                   WHERE schemaname='public' AND tablename='kulonleges_alkalom'
                     AND indexname='idx_kulonleges_alkalom_cong_ev' LIMIT 1), 'NINCS'), 'true'

  UNION ALL SELECT 9, 'FK program_id ON DELETE SET NULL (a naptár törölhető)',
         COALESCE((SELECT (confdeltype = 'n')::text FROM pg_constraint
                   WHERE conrelid = to_regclass('public.kulonleges_alkalom')
                     AND contype = 'f'
                     AND confrelid = to_regclass('public.gyulekezeti_programok')
                   LIMIT 1), 'NINCS FK'), 'true'

  UNION ALL SELECT 10, 'RLS BE van kapcsolva',
         COALESCE((SELECT relrowsecurity::text FROM pg_class
                   WHERE oid = to_regclass('public.kulonleges_alkalom')), 'NINCS TÁBLA'), 'true'

  -- A fő policy a KANONIKUS helperre épül (nem a skalárra) — ez az a sor, ami a
  -- „profilváltás után néma üres lista" hibaosztályt kizárja.
  UNION ALL SELECT 11, 'A fő policy a current_user_can_access_congregation()-re épül',
         COALESCE((SELECT ((COALESCE(qual,'') || ' ' || COALESCE(with_check,''))
                            LIKE '%current_user_can_access_congregation%')::text
                   FROM pg_policies
                   WHERE schemaname='public' AND tablename='kulonleges_alkalom'
                     AND policyname='kulonleges_alkalom_access' LIMIT 1), 'NINCS POLICY'), 'true'

  UNION ALL SELECT 13, 'Additív felettes szintű SELECT policy (esperes/kerület)',
         COALESCE((SELECT 'true' FROM pg_policies
                   WHERE schemaname='public' AND tablename='kulonleges_alkalom'
                     AND policyname='kulonleges_alkalom_szint_select' LIMIT 1), 'NINCS'), 'true'
) x
ORDER BY x.sorrend;
