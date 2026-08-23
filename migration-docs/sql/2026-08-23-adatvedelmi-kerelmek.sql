-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ADATVÉDELMI FEDEZET 2. RÉSZ — érintetti kérelmek + ÁSZF-elfogadások      ║
-- ║ Fájl: migration-docs/sql/2026-08-23-adatvedelmi-kerelmek.sql  2026-08-23 ║
-- ║ Terv: docs/ESZREVETELEK-TERV-2026-08-22.md — adatvédelmi fedezet hulláma ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT
-- ════════════════════════════════════════════════════════════════════════════
-- Az új Adatvédelmi tájékoztató EGY HÓNAPOS határidőt ígér az érintetti
-- kérelmekre (hozzáférés, helyesbítés, törlés, korlátozás, tiltakozás,
-- adathordozhatóság, hozzájárulás visszavonása), a GDPR 5(2) cikke pedig
-- ELSZÁMOLTATHATÓSÁGOT követel: bizonyítani kell tudni, hogy teljesítettük.
-- Ma nincs sem felület, sem napló, sem határidő-követés.
--
-- Az ÁSZF 13. pontja szerint „a további használat elfogadásnak minősül" —
-- ezt is bizonyítani kell tudni: KI, MIKOR, MELYIK verziót.
--
-- Két új tábla:
--   · public.adatvedelmi_kerelmek — az érintetti kérelmek naplója
--   · public.aszf_elfogadasok     — ki, mikor, melyik jogi verziót fogadta el
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ A KÓD MÁR ÉLESBEN VAN, EZ AZ SQL UTÓLAG FUT
-- ════════════════════════════════════════════════════════════════════════════
-- A webes felület (/admin/adatvedelem) EL VAN INDÍTVA a táblák nélkül is: a
-- 42P01 (undefined_table) / PGRST205 hibára szép magyar magyarázatot ír ki
-- („Ez a napló még nincs bekapcsolva…"), és NEM fest piros hibaoldalt.
-- Amíg tehát ez a fájl nem fut le, semmi nem romlik el — csak a napló üres.
-- A lefutás után a felület magától életre kel (a NOTIFY pgrst gondoskodik
-- arról, hogy a PostgREST azonnal lássa az új táblákat).
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ SZÁNDÉKOSAN NEM TÁROLUNK IP-CÍMET / BÖNGÉSZŐ-UJJLENYOMATOT
-- ════════════════════════════════════════════════════════════════════════════
-- Az `aszf_elfogadasok` tábla HÁROM adatot őriz: profil, verzió, időpont.
-- Kísértés volt IP-t vagy user-agentet is tárolni („erősebb bizonyíték"), de:
-- az Adatvédelmi tájékoztató NEM sorolja fel ezeket az adatkörök között, tehát
-- a tárolásuk MAGA lenne adatvédelmi jogsértés — a bizonyíték rontaná el azt,
-- amit bizonyítani hivatott. Ha ez valaha mégis kell, ELŐBB a jogi szöveget
-- kell bővíteni, és csak utána ezt a táblát.
--
-- ════════════════════════════════════════════════════════════════════════════
-- HOGYAN FUTTASD
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Futtasd le a 0. SZAKASZT (csak SELECT-ek) — ez megmondja, hol állunk.
-- 2. Futtasd le az 1. SZAKASZT — EGY tranzakció (BEGIN … COMMIT).
-- 3. Futtasd le a 2. SZAKASZT — az ellenőrző lekérdezés. Minden sor „✅" kell
--    legyen; ahol „⛔", ott a „teendő" oszlop megmondja, mi a dolgod.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- ON CONFLICT DO NOTHING — bármikor újrafuttatható.
--
-- ADATMIGRÁCIÓ: NINCS. Két üres tábla; visszamenőleg nem tudunk elfogadást
-- vagy kérelmet igazolni (ez a napló INNENTŐL épül — ezt a felület is kiírja).
--
-- FÜGGŐSÉGEK (mind élesben, 2026-08-22-i állapot szerint):
--   · public.congregations, public.profiles
--   · public.current_user_has_global_access()   (2026-08-11 szűkített törzs)
--   · public.profile_roles                      (a scope-divergencia elleni láb)
--   · public.backup_table_policy                (2026-08-11 biztonsági mentés)
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS (semmit nem módosít)                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ MIÉRT KELL. A projekt rögzített hibaosztálya: „a migration-fájl NEM
-- bizonyíték arra, hogy élesben lefutott" — a repó és a produkció NÉMÁN
-- széthúzhat. Előbb nézzük meg, mi VAN, és csak utána írjunk.

SELECT
  ('tábla: ' || t.mit)::text                          AS mit,
  (CASE WHEN to_regclass('public.' || t.mit) IS NOT NULL
        THEN 'MÁR LÉTEZIK' ELSE 'még nincs' END)::text AS ertek,
  (CASE WHEN to_regclass('public.' || t.mit) IS NOT NULL
        THEN 'Az 1. szakasz akkor is biztonságos (IF NOT EXISTS), de nézd meg az oszlopokat.'
        ELSE 'Rendben — az 1. szakasz létre fogja hozni.' END)::text AS teendo
FROM (VALUES ('adatvedelmi_kerelmek'), ('aszf_elfogadasok')) AS t(mit)

UNION ALL

-- A policy-k EZT a függvényt hívják. Ha hiányzik, a policy nem tagadna, hanem
-- HIBÁZNA (42883) — az RLS-csapda „testvére", amit már megfizettünk.
SELECT
  'függvény: current_user_has_global_access()',
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
       ) THEN 'létezik' ELSE 'HIÁNYZIK' END,
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'current_user_has_global_access'
       ) THEN 'Rendben.'
       ELSE '⛔ ÁLLJ MEG. Előbb a 2026-08-11-globalis-hozzaferes-szukites.sql kell.' END

UNION ALL

-- ⚠️ A policy-k a public.profile_roles-ból OLVASNAK. GRANT nélkül a policy nem
-- tagad, hanem HIBÁZIK → 403-as leállás. Ez a projekt rögzített hibaosztálya.
SELECT
  'jog: authenticated SELECT a profile_roles-on',
  CASE WHEN has_table_privilege('authenticated', 'public.profile_roles', 'SELECT')
       THEN 'van' ELSE 'NINCS' END,
  CASE WHEN has_table_privilege('authenticated', 'public.profile_roles', 'SELECT')
       THEN 'Rendben.'
       ELSE 'Az 1. szakasz pótolja (GRANT SELECT ON public.profile_roles).' END

UNION ALL

SELECT
  'tábla: backup_table_policy (mentés-besorolás)',
  CASE WHEN to_regclass('public.backup_table_policy') IS NOT NULL
       THEN 'létezik' ELSE 'nincs' END,
  CASE WHEN to_regclass('public.backup_table_policy') IS NOT NULL
       THEN 'Rendben — az 1. szakasz besorolja az új táblákat.'
       ELSE 'Nem baj: az 1. szakasz besorolása feltételesen fut.' END;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ, EGYETLEN TRANZAKCIÓBAN                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1a) adatvedelmi_kerelmek — az érintetti kérelmek naplója
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.adatvedelmi_kerelmek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),

  -- NULLABLE, SZÁNDÉKOSAN: a kérelem érkezhet a RENDSZERHEZ is (az adatkezelő
  -- maga a rendszergazda), nem csak egy egyházközséghez. A NULL sorokat
  -- kizárólag a rendszergazda látja (lásd az RLS-t) — ez fail-closed.
  congregation_id uuid,

  erintett_neve text NOT NULL,
  erintett_email text,

  kerelem_tipusa text NOT NULL,

  beerkezes_datuma date NOT NULL DEFAULT CURRENT_DATE,

  -- ⚠️ A HATÁRIDŐT AZ ALKALMAZÁS SZÁMOLJA (beérkezés + 1 hónap), és a KÖZÖS
  -- MAG (apps/web/app/(dashboard)/admin/adatvedelem-shared.ts) egyetlen tiszta
  -- függvénye adja — ugyanaz fut a böngészőben és a szerveren, és önellenőrzés
  -- (scripts/selftest-adatvedelmi-naplo.mjs) őrzi. SZÁNDÉKOSAN NINCS generált
  -- oszlop és nincs trigger: két igazság (SQL-képlet + TS-képlet) némán
  -- széthúzna, és épp a jogilag legkényesebb számon.
  hatarido date NOT NULL,

  allapot text NOT NULL DEFAULT 'uj',
  teljesites_datuma date,

  -- Ki intézi/intézte. SET NULL: egy profil törlése ne vigye magával a
  -- bizonyíték-értékű naplósort.
  intezte_profile_id uuid,

  megjegyzes text,

  letrehozva timestamptz NOT NULL DEFAULT now(),
  modositva timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT adatvedelmi_kerelmek_pkey PRIMARY KEY (id),

  CONSTRAINT adatvedelmi_kerelmek_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT adatvedelmi_kerelmek_intezte_fkey
    FOREIGN KEY (intezte_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT adatvedelmi_kerelmek_nev_check
    CHECK (length(btrim(erintett_neve)) > 0),

  -- A lista SORRENDJE a shared-mag KERELEM_TIPUSOK tömbjével AZONOS. Ha az
  -- egyiket bővíted, a másikat is KÖTELEZŐ.
  CONSTRAINT adatvedelmi_kerelmek_tipus_check
    CHECK (kerelem_tipusa IN (
      'hozzaferes', 'helyesbites', 'torles', 'korlatozas',
      'tiltakozas', 'adathordozhatosag', 'hozzajarulas_visszavonas', 'egyeb'
    )),

  CONSTRAINT adatvedelmi_kerelmek_allapot_check
    CHECK (allapot IN ('uj', 'folyamatban', 'teljesitve', 'elutasitva', 'reszben')),

  -- A határidő SOSEM lehet a beérkezés előtt (elgépelés-védelem).
  CONSTRAINT adatvedelmi_kerelmek_hatarido_check
    CHECK (hatarido >= beerkezes_datuma),

  -- ⚠️ KÉTOSZLOPOS KONZISZTENCIA (a Kuka-tábla precedense): nyitott ügyhöz
  -- TILOS teljesítés-dátum, lezárt ügyhöz KÖTELEZŐ. Enélkül a napló olyan
  -- „teljesítve" sorokat is tartalmazhatna, amelyekhez nincs dátum — vagyis
  -- pont azt nem tudnánk bizonyítani, amiért a napló készült.
  CONSTRAINT adatvedelmi_kerelmek_teljesites_check
    CHECK (
      (allapot IN ('uj', 'folyamatban') AND teljesites_datuma IS NULL)
      OR
      (allapot IN ('teljesitve', 'elutasitva', 'reszben') AND teljesites_datuma IS NOT NULL)
    ),

  CONSTRAINT adatvedelmi_kerelmek_teljesites_datum_check
    CHECK (teljesites_datuma IS NULL OR teljesites_datuma >= beerkezes_datuma)
);

COMMENT ON TABLE public.adatvedelmi_kerelmek IS
  '2026-08-23 (adatvédelmi fedezet 2. rész): érintetti kérelmek naplója. Az Adatvédelmi tájékoztató 1 hónapos határidőt ígér, a GDPR 5(2) elszámoltathatóságot követel — ez a tábla a bizonyíték. Felület: /admin/adatvedelem. A congregation_id NULL = rendszerszintű kérelem (csak rendszergazda látja).';
COMMENT ON COLUMN public.adatvedelmi_kerelmek.hatarido IS
  'A törvényes válaszadási határidő: beérkezés + 1 HÓNAP (nem 30 nap). Az alkalmazás számolja a közös magban (adatvedelem-shared.ts → hataridoSzamitas); önellenőrzés: scripts/selftest-adatvedelmi-naplo.mjs. Generált oszlop/trigger SZÁNDÉKOSAN nincs — két képlet némán széthúzna.';
COMMENT ON COLUMN public.adatvedelmi_kerelmek.allapot IS
  'uj / folyamatban = nyitott (a határidő ketyeg); teljesitve / elutasitva / reszben = lezárt. A részleges teljesítés is ÉRDEMI VÁLASZ, ezért lezártnak számít.';

-- A legfontosabb nézet: „mi jár le hamarosan, gyülekezetenként".
CREATE INDEX IF NOT EXISTS adatvedelmi_kerelmek_cong_hatarido_idx
  ON public.adatvedelmi_kerelmek (congregation_id, hatarido, id);

-- Rendszergazdai összkép: nyitott ügyek határidő szerint.
CREATE INDEX IF NOT EXISTS adatvedelmi_kerelmek_allapot_hatarido_idx
  ON public.adatvedelmi_kerelmek (allapot, hatarido);


-- ────────────────────────────────────────────────────────────────────────────
-- 1b) aszf_elfogadasok — ki, mikor, MELYIK verziót
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aszf_elfogadasok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  -- A jogi dialógus LEGAL_VERSION konstansa (pl. '2.0'). Az alkalmazás csak az
  -- ALAKJÁT ellenőrzi — a tartalom forrása EGYETLEN hely, a jogi szöveg.
  verzio text NOT NULL,
  elfogadva_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aszf_elfogadasok_pkey PRIMARY KEY (id),
  CONSTRAINT aszf_elfogadasok_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- IDEMPOTENCIA: egy felhasználó egy verziót EGYSZER fogad el. A rögzítő őr
  -- minden belépéskor megpróbálja; a 23505-öt az alkalmazás sikernek veszi, és
  -- a LEGELSŐ elfogadás időpontja marad — ez a jogilag helyes érték.
  CONSTRAINT aszf_elfogadasok_profile_verzio_key UNIQUE (profile_id, verzio),

  CONSTRAINT aszf_elfogadasok_verzio_check
    CHECK (length(btrim(verzio)) BETWEEN 1 AND 32)
);

COMMENT ON TABLE public.aszf_elfogadasok IS
  '2026-08-23 (adatvédelmi fedezet 2. rész): az ÁSZF 13. pontja szerint „a további használat elfogadásnak minősül" — ez a tábla bizonyítja, ki, mikor és MELYIK verziót látta. ⚠️ SZÁNDÉKOSAN NINCS IP-cím és user-agent: azokat az Adatvédelmi tájékoztató nem sorolja fel az adatkörök között, tehát a tárolásuk maga lenne jogsértés. Ha kellene, ELŐBB a jogi szöveget kell bővíteni.';

-- „Hányan fogadták el a 2.0-t, és mikor?"
CREATE INDEX IF NOT EXISTS aszf_elfogadasok_verzio_idx
  ON public.aszf_elfogadasok (verzio, elfogadva_at DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- 1c) GRANT — ⚠️ RLS ÖNMAGÁBAN NEM ELÉG
-- ────────────────────────────────────────────────────────────────────────────
-- GRANT nélkül a hívó 42501-et kap, nem „0 sort" — az őrszem pedig „nem tudjuk
-- igazolni"-t írna. És mivel az ALTER DEFAULT PRIVILEGES (2026-04-23 m0 hotfix)
-- óta a séma default-jai tágak lehetnek, explicit REVOKE is kell.
--
-- ⚠️ Az `anon` MINDKÉT táblán teljesen ki van zárva: bejelentkezés nélkül itt
-- semmi keresnivaló nincs.

REVOKE ALL ON public.adatvedelmi_kerelmek FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adatvedelmi_kerelmek TO authenticated;

REVOKE ALL ON public.aszf_elfogadasok FROM anon, authenticated;
-- ⚠️ NINCS UPDATE és NINCS DELETE: az elfogadás-napló BIZONYÍTÉK. Ha átírható
-- vagy törölhető lenne, semmit nem bizonyítana. (A rendszergazda a Supabase
-- konzolján továbbra is beavatkozhat — de az nyomot hagy.)
GRANT SELECT, INSERT ON public.aszf_elfogadasok TO authenticated;

-- A policy-k a public.profile_roles-ból olvasnak. GRANT nélkül a policy nem
-- tagad, hanem HIBÁZIK (2026-08-14: éles leállás volt ebből a hibaosztályból).
-- Idempotens és ártalmatlan — a profile_roles saját RLS-e él.
GRANT SELECT ON public.profile_roles TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 1d) RLS — FAIL-CLOSED
-- ────────────────────────────────────────────────────────────────────────────
-- adatvedelmi_kerelmek — HÁROM ág, és MINDHÁROM szűkebb, mint a szokásos
-- „gyülekezeti" minta:
--
--   (1) RENDSZERGAZDA: mindent (a congregation_id IS NULL sorokat is).
--   (2) LELKÉSZ, skalár láb: a SAJÁT gyülekezete sorai.
--   (3) LELKÉSZ, profile_roles láb: ugyanaz, a scope-divergencia ellen
--       (a skalár profiles.congregation_id ⇄ effectiveCongregationId
--       széthúzhat; e nélkül az érintett némán 0 sort kapna).
--
-- ⚠️ AMI SZÁNDÉKOSAN KIMARADT — ÉS MIÉRT:
--
--   · KÖNYVELŐ / SZÁMVEVŐ. A szokásos minta a
--     `current_user_can_access_congregation()`-t hívná, ami őket is beengedi.
--     Itt NEM: ez a napló magánszemélyek nevét, e-mail-címét és kérelmének
--     tartalmát őrzi — a pénzügyi hozzárendelés erre nem jogosít.
--
--   · EGYHÁZKERÜLETI SZINT. A 2026-08-16-i K4 döntés: „a kerület nem írhatja
--     és nem is olvashatja a kerület gyülekezeteinek adatait, csak a
--     hivatalosan beküldött adatokat, illetve azoknak az összesítőjét."
--     A kerületi adminnak tehát NINCS ága. A felület ezt KIÍRJA (nem néma
--     üres lista): „Az egyházkerületi szint az egyházközségek személyes
--     adatait nem tekintheti meg."
--
--   · EGYHÁZMEGYEI SZINT. Ugyanezért.
--
-- Mindkét kihagyás TUDATOS SZŰKÍTÉS, nem feledékenység. Ha valaha bővül, a
-- jogalapot ELŐBB az Adatvédelmi tájékoztatóban kell rögzíteni.

ALTER TABLE public.adatvedelmi_kerelmek ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aszf_elfogadasok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adatvedelmi_kerelmek_all ON public.adatvedelmi_kerelmek;
CREATE POLICY adatvedelmi_kerelmek_all
  ON public.adatvedelmi_kerelmek
  FOR ALL
  TO authenticated
  USING (
    public.current_user_has_global_access()
    OR (
      adatvedelmi_kerelmek.congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.status = 'active'
          AND p.role = 'lelkesz'
          AND p.congregation_id = adatvedelmi_kerelmek.congregation_id
      )
    )
    OR (
      adatvedelmi_kerelmek.congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        JOIN public.profiles p2 ON p2.id = pr.profile_id
        WHERE pr.profile_id = (SELECT auth.uid())
          AND p2.status = 'active'
          AND pr.scope = 'congregation'
          AND pr.scope_id = adatvedelmi_kerelmek.congregation_id
          AND pr.role = 'lelkesz'
          AND pr.active
          AND pr.approval_status = 'approved'
      )
    )
  )
  WITH CHECK (
    public.current_user_has_global_access()
    OR (
      adatvedelmi_kerelmek.congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.status = 'active'
          AND p.role = 'lelkesz'
          AND p.congregation_id = adatvedelmi_kerelmek.congregation_id
      )
    )
    OR (
      adatvedelmi_kerelmek.congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        JOIN public.profiles p2 ON p2.id = pr.profile_id
        WHERE pr.profile_id = (SELECT auth.uid())
          AND p2.status = 'active'
          AND pr.scope = 'congregation'
          AND pr.scope_id = adatvedelmi_kerelmek.congregation_id
          AND pr.role = 'lelkesz'
          AND pr.active
          AND pr.approval_status = 'approved'
      )
    )
  );

COMMENT ON POLICY adatvedelmi_kerelmek_all ON public.adatvedelmi_kerelmek IS
  '2026-08-23: FAIL-CLOSED. Rendszergazda mindent; a gyülekezet LELKÉSZE (skalár + profile_roles láb, mindkettőn profiles.status=''active'') a saját gyülekezete sorait. Könyvelő/számvevő, megyei és KERÜLETI szint SZÁNDÉKOSAN kimarad (2026-08-16 K4 döntés + a napló személyesadat-tartalma). A congregation_id IS NULL sorok kizárólag a rendszergazdáé.';

-- aszf_elfogadasok — mindenki a SAJÁT sorát látja és írja; a rendszergazda
-- mindet OLVASSA. Módosítani/törölni senki nem tud (nincs rá GRANT), ezért
-- külön UPDATE/DELETE policy sem kell.

DROP POLICY IF EXISTS aszf_elfogadasok_select ON public.aszf_elfogadasok;
CREATE POLICY aszf_elfogadasok_select
  ON public.aszf_elfogadasok
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.current_user_has_global_access()
  );

DROP POLICY IF EXISTS aszf_elfogadasok_insert_own ON public.aszf_elfogadasok;
CREATE POLICY aszf_elfogadasok_insert_own
  ON public.aszf_elfogadasok
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()));

COMMENT ON POLICY aszf_elfogadasok_insert_own ON public.aszf_elfogadasok IS
  '2026-08-23: mindenki KIZÁRÓLAG a saját nevében rögzíthet elfogadást. Más nevében elfogadni nem lehet — különben a napló pont a bizonyító erejét veszítené el.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1e) BIZTONSÁGI MENTÉS — besorolás
-- ────────────────────────────────────────────────────────────────────────────
-- Besorolás nélkül a napi mentés HANGOSAN megáll („réteg nélküli tábla").
-- Feltételesen fut: ha a backup_table_policy még nem létezik, csendben kihagyja.

DO $besorolas$
BEGIN
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE NOTICE 'ℹ️ backup_table_policy nincs — a mentés-besorolás kihagyva.';
    RETURN;
  END IF;

  INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
  VALUES
    -- ⚠️ 'globalis', NEM 'gyulekezet'. A gyülekezeti hatókör alapértelmezett
    -- szűrője `t.congregation_id = $1`, ami a RENDSZERSZINTŰ (congregation_id
    -- IS NULL) kérelmeket NÉMÁN kihagyná a mentésből — pontosan azokat, amelyek
    -- közvetlenül az adatkezelőhöz érkeztek. Inkább mentsük az egészet.
    ('adatvedelmi_kerelmek', 'globalis', 6, true,
     '2026-08-23 (adatvédelmi fedezet 2. rész): érintetti kérelmek naplója. FK a congregations-re és a profiles-ra → azok után állítandó vissza. Globális hatókör: a congregation_id NULL (rendszerszintű) sorokat a gyülekezeti szűrő kihagyná.'),
    ('aszf_elfogadasok', 'globalis', 4, true,
     '2026-08-23 (adatvédelmi fedezet 2. rész): ÁSZF-elfogadások (profil + verzió + időpont). FK a profiles-ra. Bizonyíték-értékű, nem módosítható napló.')
  ON CONFLICT (tabla) DO NOTHING;
END
$besorolas$;

COMMIT;

-- A PostgREST séma-gyorsítótárának frissítése — enélkül a felület még percekig
-- PGRST205-öt kapna, és továbbra is a „még nincs bekapcsolva" üzenetet írná ki.
NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS (minden sor „✅" kell legyen)                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A SQL Editor csak az UTOLSÓ eredményhalmazt mutatja, ezért ez EGYETLEN
-- lekérdezés, három magyar oszloppal: mit / érték / teendő.

SELECT * FROM (

  SELECT
    'tábla: adatvedelmi_kerelmek'::text AS mit,
    CASE WHEN to_regclass('public.adatvedelmi_kerelmek') IS NOT NULL
         THEN '✅ létezik' ELSE '⛔ HIÁNYZIK' END::text AS ertek,
    CASE WHEN to_regclass('public.adatvedelmi_kerelmek') IS NOT NULL
         THEN 'Nincs teendő.'
         ELSE 'Futtasd újra az 1. szakaszt, és nézd meg a hibaüzenetet.' END::text AS teendo,
    1 AS sorrend

  UNION ALL SELECT
    'tábla: aszf_elfogadasok',
    CASE WHEN to_regclass('public.aszf_elfogadasok') IS NOT NULL
         THEN '✅ létezik' ELSE '⛔ HIÁNYZIK' END,
    CASE WHEN to_regclass('public.aszf_elfogadasok') IS NOT NULL
         THEN 'Nincs teendő.'
         ELSE 'Futtasd újra az 1. szakaszt, és nézd meg a hibaüzenetet.' END,
    2

  UNION ALL SELECT
    'RLS bekapcsolva: adatvedelmi_kerelmek',
    CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = 'adatvedelmi_kerelmek'), false)
         THEN '✅ igen' ELSE '⛔ NEM' END,
    CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = 'adatvedelmi_kerelmek'), false)
         THEN 'Nincs teendő.'
         ELSE '⛔ A policy tétlen lenne! ALTER TABLE … ENABLE ROW LEVEL SECURITY;' END,
    3

  UNION ALL SELECT
    'RLS bekapcsolva: aszf_elfogadasok',
    CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = 'aszf_elfogadasok'), false)
         THEN '✅ igen' ELSE '⛔ NEM' END,
    CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = 'aszf_elfogadasok'), false)
         THEN 'Nincs teendő.'
         ELSE '⛔ A policy tétlen lenne! ALTER TABLE … ENABLE ROW LEVEL SECURITY;' END,
    4

  UNION ALL SELECT
    'policy: adatvedelmi_kerelmek_all',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'adatvedelmi_kerelmek'
                        AND policyname = 'adatvedelmi_kerelmek_all')
         THEN '✅ létezik' ELSE '⛔ HIÁNYZIK' END,
    'Enélkül az RLS MINDENT tagadna (fail-closed, de a felület üres lenne).',
    5

  UNION ALL SELECT
    'policy: aszf_elfogadasok_select + _insert_own',
    CASE WHEN (SELECT count(*) FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'aszf_elfogadasok') >= 2
         THEN '✅ mindkettő' ELSE '⛔ HIÁNYOS' END,
    'Kettő kell: olvasás (saját + rendszergazda) és beszúrás (csak saját).',
    6

  UNION ALL SELECT
    'jog: authenticated a kérelmeken (SELECT/INSERT/UPDATE/DELETE)',
    CASE WHEN has_table_privilege('authenticated', 'public.adatvedelmi_kerelmek', 'SELECT')
          AND has_table_privilege('authenticated', 'public.adatvedelmi_kerelmek', 'INSERT')
          AND has_table_privilege('authenticated', 'public.adatvedelmi_kerelmek', 'UPDATE')
          AND has_table_privilege('authenticated', 'public.adatvedelmi_kerelmek', 'DELETE')
         THEN '✅ mind a négy' ELSE '⛔ HIÁNYOS' END,
    '⚠️ GRANT nélkül a policy nem tagad, hanem HIBÁZIK (42501) — 403-as leállás.',
    7

  UNION ALL SELECT
    'jog: authenticated az ÁSZF-naplón (SELECT+INSERT, de NINCS UPDATE/DELETE)',
    CASE WHEN has_table_privilege('authenticated', 'public.aszf_elfogadasok', 'SELECT')
          AND has_table_privilege('authenticated', 'public.aszf_elfogadasok', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.aszf_elfogadasok', 'UPDATE')
          AND NOT has_table_privilege('authenticated', 'public.aszf_elfogadasok', 'DELETE')
         THEN '✅ pontosan jó' ELSE '⛔ ELTÉR' END,
    'A napló BIZONYÍTÉK: ha átírható vagy törölhető, nem bizonyít semmit.',
    8

  UNION ALL SELECT
    'jog: anon KI van zárva mindkét táblából',
    CASE WHEN NOT has_table_privilege('anon', 'public.adatvedelmi_kerelmek', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.aszf_elfogadasok', 'SELECT')
         THEN '✅ ki van zárva' ELSE '⛔ AZ ANON OLVASHAT!' END,
    'Bejelentkezés nélkül itt semmi keresnivaló nincs. REVOKE ALL … FROM anon;',
    9

  UNION ALL SELECT
    'jog: authenticated SELECT a profile_roles-on (a policy ebből olvas)',
    CASE WHEN has_table_privilege('authenticated', 'public.profile_roles', 'SELECT')
         THEN '✅ van' ELSE '⛔ NINCS' END,
    '⚠️ A projekt rögzített hibaosztálya: GRANT nélkül a policy HIBÁZIK, nem tagad.',
    10

  UNION ALL SELECT
    'mentés-besorolás: adatvedelmi_kerelmek + aszf_elfogadasok',
    CASE WHEN to_regclass('public.backup_table_policy') IS NULL THEN 'ℹ️ nincs ilyen tábla'
         WHEN (SELECT count(*) FROM public.backup_table_policy
               WHERE tabla IN ('adatvedelmi_kerelmek', 'aszf_elfogadasok')) = 2
         THEN '✅ mindkettő besorolva' ELSE '⛔ HIÁNYOS' END,
    'Besorolás nélkül a napi mentés HANGOSAN megáll („réteg nélküli tábla").',
    11

  UNION ALL SELECT
    'index: hatarido szerinti keresés',
    CASE WHEN (SELECT count(*) FROM pg_indexes
               WHERE schemaname = 'public'
                 AND indexname IN ('adatvedelmi_kerelmek_cong_hatarido_idx',
                                   'adatvedelmi_kerelmek_allapot_hatarido_idx',
                                   'aszf_elfogadasok_verzio_idx')) = 3
         THEN '✅ mind a három' ELSE '⛔ HIÁNYOS' END,
    'Csak teljesítmény — a felület enélkül is működik.',
    12

) AS ellenorzes
ORDER BY sorrend;
