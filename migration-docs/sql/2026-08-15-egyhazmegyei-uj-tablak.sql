-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI SZINT — ÚJ TÁBLÁK ÉS OSZLOPOK                    2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-uj-tablak.sql           ║
-- ║ (Egyházmegyei szint terv, 1.3 + 3.3 + 2.1/2 — az S5–S8 szeletek DB-alapja)║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT HOZ LÉTRE (docs/EGYHAZMEGYEI-SZINT-TERV-2026-08-15.md):
--
--  (A) document_submissions + 3 oszlop (3.3 — beérkeztetés-munkafolyamat):
--        diocese_iktato_id      → a beérkező iratra adott ESPERESI iktatószám
--                                 (a megyei iktató-bejegyzés FK-ja)
--        szamvevo_ellenorizte_at / _by → a számvevői ellenőrzés (Kánon 90.§)
--
--  (B) diocese_bealitas + költségvetés-módosítás flagek (2.1/2. pont):
--        koltsegvetes_mod1..3_veglegesitve + _datuma + _veglegesitette
--        (a penzugy/actions.ts:1891-1896 hardkódolt false-ai helyére)
--
--  (C) diocese_felterjesztes ÚJ tábla (1.3 + 3.6 — megye→kerület felküldés):
--        EXPLICIT NOT NULL diocese_id + district_id — a 0.4-ben dokumentált
--        „nullable pivot-oszlop" hibaosztály ellen kezdettől zárt modell.
--
--  (D) valasztoi_nevjegyzek ÚJ tábla (1.3 + 3.7 — Kánon 37–38.§ állapotgép):
--        gyülekezetenként + évente egy sor; a beküldés maga továbbra is a
--        document_submissions-ben él, ez az ELJÁRÁSREND naplója.
--
--  (E) vizitacio + vizitacio_meghagyas ÚJ táblák (1.3 + 3.8 — Kánon 74–75.§).
--
-- TANULSÁGOK, AMIKRE ÉPÜL:
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → minden hívott
--     függvényre GRANT EXECUTE + a táblákra explicit REVOKE+GRANT (a
--     2026-04-23-as ALTER DEFAULT PRIVILEGES miatt e nélkül minden új tábla
--     némán teljes CRUD-ot örökölne).
--   · „Skalár hatókör" hibaosztály → minden hatókör-ág COALESCE(..., '{}')
--     fail-closed; kanonikus függvények, soha kézzel másolt EXISTS-lánc.
--   · Mentés-besorolás (backup_table_policy — az oszlop neve: tabla!) nélkül
--     a napi mentés HANGOSAN megáll → itt sorolunk be, a 2026-08-11-es
--     diocese_* minta szerint (globalis / R2, visszaallithato=false; a
--     valasztoi_nevjegyzek gyülekezeti adat → gyulekezet hatókör).
--
-- FUTTATÁSI SORREND:
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT).
--   2.  1. SZAKASZ — LÉTREHOZÁS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — az eredményt küldd vissza).
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS +
-- DROP POLICY IF EXISTS + ON CONFLICT — akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTELEK' AS szakasz,
       'Létezik-e az 5 kanonikus hatókör-függvény?' AS mit,
       (SELECT count(*)::text || ' / 5' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access','current_user_diocese_ids',
                            'current_user_diocese_olvaso_ids','current_user_district_ids',
                            'felettes_szint_gyulekezet_ids')) AS ertek,
       'Ha nem 5: ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql + 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le.' AS teendo

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · CÉL-TÁBLÁK',
       t.tabla,
       CASE WHEN to_regclass('public.' || t.tabla) IS NULL
            THEN 'még nincs — e fájl hozza létre'
            ELSE '⚠️ MÁR LÉTEZIK (újrafuttatás rendben, a definíció nem íródik felül)' END,
       'Tájékoztató.'
FROM (VALUES ('diocese_felterjesztes'), ('valasztoi_nevjegyzek'),
             ('vizitacio'), ('vizitacio_meghagyas')) AS t(tabla)

UNION ALL
SELECT 20, '0/C · document_submissions',
       'Megvannak-e már az új oszlopok? (diocese_iktato_id, szamvevo_ellenorizte_at, szamvevo_ellenorizte_by)',
       (SELECT count(*)::text || ' / 3' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='document_submissions'
          AND column_name IN ('diocese_iktato_id','szamvevo_ellenorizte_at','szamvevo_ellenorizte_by')),
       '0 = még nincs; 3 = újrafuttatás.'

UNION ALL
SELECT 21, '0/C · diocese_bealitas',
       'Megvannak-e már a költségvetés-módosítás flagek? (9 oszlop)',
       (SELECT count(*)::text || ' / 9' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name LIKE 'koltsegvetes_mod%'),
       '0 = még nincs; 9 = újrafuttatás.'

UNION ALL
SELECT 30, '0/D · MENTÉS-RENDSZER',
       'Létezik a backup_table_policy? (a besoroláshoz kell)',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⛔ NINCS — előbb a 2026-08-11-biztonsagi-mentes.sql fusson le'
            ELSE '✅ van' END,
       'Besorolás nélkül a napi mentés hangosan megáll.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — LÉTREHOZÁS                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ───────────────────────────────────────
DO $orszem$
BEGIN
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_diocese_ids()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzó kanonikus hatókör-függvény — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_olvaso_ids() — ELŐBB a 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le.';
  END IF;
  IF to_regprocedure('public.felettes_szint_gyulekezet_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a felettes_szint_gyulekezet_ids() — a valasztoi_nevjegyzek megyei policy-ja erre épül.';
  END IF;
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs backup_table_policy — előbb a 2026-08-11-biztonsagi-mentes.sql fusson le (besorolás nélkül a mentés megállna).';
  END IF;
END
$orszem$;

-- GRANT-tanulság: a policy a HÍVÓ szerepében fut.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.felettes_szint_gyulekezet_ids()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_congregation_id()    TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) document_submissions — esperesi iktatószám + számvevői ellenőrzés (3.3)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.document_submissions
  ADD COLUMN IF NOT EXISTS diocese_iktato_id uuid,
  ADD COLUMN IF NOT EXISTS szamvevo_ellenorizte_at timestamptz,
  ADD COLUMN IF NOT EXISTS szamvevo_ellenorizte_by uuid;

-- FK a megyei iktató-bejegyzésre. ON DELETE SET NULL: az iktató-sor törlése
-- ne vigye magával a beküldés-sort (a beküldés a hiteles történet).
DO $ds_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_submissions_diocese_iktato_id_fkey'
      AND conrelid = 'public.document_submissions'::regclass
  ) THEN
    ALTER TABLE public.document_submissions
      ADD CONSTRAINT document_submissions_diocese_iktato_id_fkey
      FOREIGN KEY (diocese_iktato_id) REFERENCES public.iktato(id) ON DELETE SET NULL;
  END IF;
END
$ds_fk$;

COMMENT ON COLUMN public.document_submissions.diocese_iktato_id IS
  '2026-08-15 (egyházmegyei szint, 3.3): a beérkező iratra az esperesi hivatal által adott iktatószám — a MEGYEI iktató-bejegyzés (iktato, diocese_id-s sor) FK-ja. NULL = még nincs beiktatva (a megyének nincs diocese-iktatója, vagy a beérkeztetés a régi úton történt).';
COMMENT ON COLUMN public.document_submissions.szamvevo_ellenorizte_at IS
  '2026-08-15 (Kánon 90.§): mikor ellenőrizte a beküldött iratot az egyházmegyei számvevő.';
COMMENT ON COLUMN public.document_submissions.szamvevo_ellenorizte_by IS
  'A számvevő profil-azonosítója. Szándékosan FK nélkül (az iktato_yearly_closures.closed_by_profile_id mintájára) — profil-törlés ne blokkolódjon miatta.';

CREATE INDEX IF NOT EXISTS document_submissions_diocese_iktato_idx
  ON public.document_submissions (diocese_iktato_id)
  WHERE diocese_iktato_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) diocese_bealitas — költségvetés-módosítás véglegesítés-flagek (2.1/2)
-- ────────────────────────────────────────────────────────────────────────────
-- A gyülekezeti bealitas budget_mod1..3_finalized párjai, a diocese_bealitas
-- SAJÁT (magyar) elnevezési konvenciójával, a szamadas/koltsegvetes hármas
-- (flag + datum + ki) mintájára.

ALTER TABLE public.diocese_bealitas
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod1_veglegesitve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod1_veglegesites_datuma date,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod1_veglegesitette uuid,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod2_veglegesitve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod2_veglegesites_datuma date,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod2_veglegesitette uuid,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod3_veglegesitve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod3_veglegesites_datuma date,
  ADD COLUMN IF NOT EXISTS koltsegvetes_mod3_veglegesitette uuid;

COMMENT ON COLUMN public.diocese_bealitas.koltsegvetes_mod1_veglegesitve IS
  '2026-08-15 (egyházmegyei szint, 2.1/2): az 1. költségvetés-módosítás véglegesítve — a penzugy/actions.ts diocese-normalizálásának hardkódolt false-a helyére (bekötés: S6 szelet).';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) diocese_felterjesztes — megye→kerület felküldés (1.3 + 3.6)
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT külön tábla és nem a document_submissions bővítése: a 0.4 hibaosztály
-- (nullable pivot-oszlop) pontosan abból jött, hogy egy tábla két különböző
-- küldő-szintet szolgált ki. Itt a két végpont MÁS ENTITÁS (megye→kerület),
-- explicit NOT NULL oszlopokkal.

CREATE TABLE IF NOT EXISTS public.diocese_felterjesztes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  diocese_id  uuid NOT NULL,
  district_id uuid NOT NULL,
  -- Mit terjeszt fel a megye (3.6 első kör):
  --   szamvevoi_osszesito  — a gyülekezeti számadások számvevői összesítője
  --   megyei_szamadas      — az esperesi hivatal SAJÁT zárszámadása
  --   megyei_koltsegvetes  — az esperesi hivatal SAJÁT költségvetése
  doc_type text NOT NULL
    CHECK (doc_type IN ('szamvevoi_osszesito','megyei_szamadas','megyei_koltsegvetes')),
  year integer NOT NULL,
  -- Állapotgép a document_submissions szókincsével (egy nyelvet beszéljen a két lánc):
  --   draft → submitted → received / returned
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','received','returned')),
  -- A felküldéskor FAGYASZTOTT összesítő-pillanatkép (kanonikus kulcsokkal).
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- A megyei iktatószám SZÖVEGES pillanatképe a felterjesztésen (a hivatalos
  -- irat fejlécére kerül — akkor is olvasható marad, ha az iktató-sor változik).
  iktatoszam text,
  submitted_at timestamptz,
  submitted_by uuid,
  received_at timestamptz,
  received_by uuid,
  returned_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diocese_felterjesztes_pkey PRIMARY KEY (id),
  CONSTRAINT diocese_felterjesztes_diocese_id_fkey
    FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id),
  CONSTRAINT diocese_felterjesztes_district_id_fkey
    FOREIGN KEY (district_id) REFERENCES public.districts(id)
);

COMMENT ON TABLE public.diocese_felterjesztes IS
  '2026-08-15 (egyházmegyei szint, 3.6): a megye ÖSSZESÍTETT csomagjának felküldése az egyházkerületnek (számvevői összesítő + a megye saját számadása/költségvetése). A gyülekezeti egyedi iratok továbbítása (document_submissions.forwarded_to_kerulet) változatlanul él mellette. Mindkét végpont EXPLICIT NOT NULL — a nullable-pivot hibaosztály ellen.';

-- Egy megye egy évben doc_type-onként EGY felterjesztést vezet (a visszaküldött
-- sor újranyitható/újraküldhető — a státusz változik, nem új sor születik).
CREATE UNIQUE INDEX IF NOT EXISTS diocese_felterjesztes_dio_tipus_ev_uidx
  ON public.diocese_felterjesztes (diocese_id, doc_type, year);
CREATE INDEX IF NOT EXISTS diocese_felterjesztes_district_idx
  ON public.diocese_felterjesztes (district_id, year);

-- updated_at trigger (az iratcsomo_set_updated_at mintájára, search_path-pin).
CREATE OR REPLACE FUNCTION public.diocese_felterjesztes_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS diocese_felterjesztes_updated_at_trigger ON public.diocese_felterjesztes;
CREATE TRIGGER diocese_felterjesztes_updated_at_trigger
  BEFORE UPDATE ON public.diocese_felterjesztes
  FOR EACH ROW
  EXECUTE FUNCTION public.diocese_felterjesztes_set_updated_at();

-- GRANT — explicit REVOKE után (a 2026-04-23-as ALTER DEFAULT PRIVILEGES
-- minden új táblára teljes CRUD-ot adna). DELETE SZÁNDÉKOSAN NINCS: egy
-- felterjesztés nem tűnhet el nyomtalanul — visszavonni a státusszal lehet.
REVOKE ALL ON public.diocese_felterjesztes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.diocese_felterjesztes TO authenticated;

ALTER TABLE public.diocese_felterjesztes ENABLE ROW LEVEL SECURITY;

-- Megyei ág: rendszergazda + szerep-szűrt megyei írók (kanonikus alak).
DROP POLICY IF EXISTS diocese_felterjesztes_all ON public.diocese_felterjesztes;
CREATE POLICY diocese_felterjesztes_all
  ON public.diocese_felterjesztes
  FOR ALL TO authenticated
  USING (public.current_user_has_global_access()
         OR diocese_felterjesztes.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  WITH CHECK (public.current_user_has_global_access()
         OR diocese_felterjesztes.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])));

-- Számvevői/olvasói ág (csak SELECT).
DROP POLICY IF EXISTS diocese_felterjesztes_szamvevo_select ON public.diocese_felterjesztes;
CREATE POLICY diocese_felterjesztes_szamvevo_select
  ON public.diocese_felterjesztes
  FOR SELECT TO authenticated
  USING (diocese_felterjesztes.diocese_id
         = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])));

-- Kerületi ág: olvasás + státusz-írás (átvétel-nyugtázás / visszaküldés) a
-- SAJÁT kerület felterjesztésein. Külön SELECT + UPDATE — INSERT/DELETE nincs.
DROP POLICY IF EXISTS diocese_felterjesztes_kerulet_select ON public.diocese_felterjesztes;
CREATE POLICY diocese_felterjesztes_kerulet_select
  ON public.diocese_felterjesztes
  FOR SELECT TO authenticated
  USING (diocese_felterjesztes.district_id
         = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])));

DROP POLICY IF EXISTS diocese_felterjesztes_kerulet_update ON public.diocese_felterjesztes;
CREATE POLICY diocese_felterjesztes_kerulet_update
  ON public.diocese_felterjesztes
  FOR UPDATE TO authenticated
  USING (diocese_felterjesztes.district_id
         = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])))
  WITH CHECK (diocese_felterjesztes.district_id
         = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[])));

-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) valasztoi_nevjegyzek — Kánon 37–38.§ állapotgép (1.3 + 3.7)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.valasztoi_nevjegyzek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  year integer NOT NULL,
  -- Kánon 37.§ szerinti eljárásrend (a dátum-ablakok a Kánonból):
  --   keszul → kozszemlen [máj. 15–23] → dontes [jún. 3-ig] →
  --   felterjesztve [jún. 5-ig, 2 példány] → fellebbezes [jún. 20-ig] →
  --   hitelesitve [jún. 30, esperesi keltezéssel] →
  --   ervenyes [júl. 1 → köv. év jún. 30, Kánon 38.§]
  status text NOT NULL DEFAULT 'keszul'
    CHECK (status IN ('keszul','kozszemlen','dontes','felterjesztve',
                      'fellebbezes','hitelesitve','ervenyes')),
  kozszemle_kezdete date,
  kozszemle_vege date,
  dontes_datuma date,
  felterjesztes_datuma date,
  fellebbezesi_hatarido date,
  hitelesites_datuma date,
  hitelesitette uuid,          -- az esperes profil-azonosítója (FK nélkül — audit)
  ervenyes_tol date,
  ervenyes_ig date,
  -- „Esperesi példány az irattárban" jelző (a 2. példány sorsa).
  esperesi_peldany_irattarban boolean NOT NULL DEFAULT false,
  -- A hátralékos-de-utólag-fizető tag HIVATALBÓLI felvételének naplója
  -- (Kánon 37.§): [{szemely_id, datum, megjegyzes}, …] — csak napló, a
  -- névjegyzék maga a tagnyilvántartás voters-nézetéből áll elő.
  hivatalboli_felvetel_naplo jsonb NOT NULL DEFAULT '[]'::jsonb,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valasztoi_nevjegyzek_pkey PRIMARY KEY (id),
  CONSTRAINT valasztoi_nevjegyzek_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.valasztoi_nevjegyzek IS
  '2026-08-15 (egyházmegyei szint, 3.7): a választói névjegyzék ÉVES ELJÁRÁSREND-naplója (Kánon 37–38.§ állapotgép) gyülekezetenként. A névjegyzék BEKÜLDÉSE továbbra is a document_submissions-ben (valasztok_nevjegyzeke); a hitelesítés az esperes gombja (S7 szelet).';

CREATE UNIQUE INDEX IF NOT EXISTS valasztoi_nevjegyzek_cong_ev_uidx
  ON public.valasztoi_nevjegyzek (congregation_id, year);

CREATE OR REPLACE FUNCTION public.valasztoi_nevjegyzek_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS valasztoi_nevjegyzek_updated_at_trigger ON public.valasztoi_nevjegyzek;
CREATE TRIGGER valasztoi_nevjegyzek_updated_at_trigger
  BEFORE UPDATE ON public.valasztoi_nevjegyzek
  FOR EACH ROW
  EXECUTE FUNCTION public.valasztoi_nevjegyzek_set_updated_at();

-- DELETE szándékosan nincs — az eljárásrend naplója nem tűnhet el.
REVOKE ALL ON public.valasztoi_nevjegyzek FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.valasztoi_nevjegyzek TO authenticated;

ALTER TABLE public.valasztoi_nevjegyzek ENABLE ROW LEVEL SECURITY;

-- Gyülekezeti ág (skalár + profile_roles — a scope-divergencia hibaosztály ellen).
DROP POLICY IF EXISTS valasztoi_nevjegyzek_gyulekezet_all ON public.valasztoi_nevjegyzek;
CREATE POLICY valasztoi_nevjegyzek_gyulekezet_all
  ON public.valasztoi_nevjegyzek
  FOR ALL TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = valasztoi_nevjegyzek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
  )
  WITH CHECK (
    congregation_id = public.current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = valasztoi_nevjegyzek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
  );

-- Megyei ág — a hitelesítés az esperes/megyei admin joga, a VALÓDI
-- congregations.diocese_id láncon (kanonikus felettes-függvény).
DROP POLICY IF EXISTS valasztoi_nevjegyzek_szint_all ON public.valasztoi_nevjegyzek;
CREATE POLICY valasztoi_nevjegyzek_szint_all
  ON public.valasztoi_nevjegyzek
  FOR ALL TO authenticated
  USING (congregation_id
         = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])))
  WITH CHECK (congregation_id
         = ANY (COALESCE((SELECT public.felettes_szint_gyulekezet_ids()), '{}'::uuid[])));

-- Számvevői ág — csak olvasás, a megye gyülekezeteire (Kánon 90.§ ellenőrzés).
DROP POLICY IF EXISTS valasztoi_nevjegyzek_szamvevo_select ON public.valasztoi_nevjegyzek;
CREATE POLICY valasztoi_nevjegyzek_szamvevo_select
  ON public.valasztoi_nevjegyzek
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.congregations c
    WHERE c.id = valasztoi_nevjegyzek.congregation_id
      AND c.diocese_id
          = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[]))
  ));

-- Rendszergazda-ág.
DROP POLICY IF EXISTS valasztoi_nevjegyzek_global_all ON public.valasztoi_nevjegyzek;
CREATE POLICY valasztoi_nevjegyzek_global_all
  ON public.valasztoi_nevjegyzek
  FOR ALL TO authenticated
  USING (public.current_user_has_global_access())
  WITH CHECK (public.current_user_has_global_access());

-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) vizitacio + vizitacio_meghagyas — Kánon 74–75.§ (1.3 + 3.8)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vizitacio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  diocese_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  datum date NOT NULL,
  tipus text NOT NULL DEFAULT 'rendes' CHECK (tipus IN ('rendes','rendkivuli')),
  -- A vizitációs jegyzőkönyv MEGYEI iktató-bejegyzése (S4 után tölthető).
  jegyzokonyv_iktato_id uuid,
  megjegyzes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vizitacio_pkey PRIMARY KEY (id),
  CONSTRAINT vizitacio_diocese_id_fkey
    FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id),
  CONSTRAINT vizitacio_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT vizitacio_jegyzokonyv_iktato_id_fkey
    FOREIGN KEY (jegyzokonyv_iktato_id) REFERENCES public.iktato(id) ON DELETE SET NULL,
  -- A meghagyás-tábla ÖSSZETETT FK-jának alapja (a csatolmány-minta):
  -- a denormalizált diocese_id nem húzhat szét a szülő-sorétól.
  CONSTRAINT vizitacio_id_diocese_uk UNIQUE (id, diocese_id)
);

COMMENT ON TABLE public.vizitacio IS
  '2026-08-15 (egyházmegyei szint, 3.8): esperesi vizitációk nyilvántartása (Kánon 74–75.§ — legalább 3 évente minden gyülekezet, 15 nappal előtte írásbeli értesítés). A gyülekezet a SAJÁT sorait olvassa (a lelkészi jelentés III.12 mezője innen tölthető); írni a megye ír. ⚠️ App-oldali szabály (S8): a congregation_id-nak a diocese_id megyéjébe kell tartoznia — CHECK más táblára nem hivatkozhat, a beszúró akció ellenőrzi.';

CREATE INDEX IF NOT EXISTS vizitacio_diocese_datum_idx
  ON public.vizitacio (diocese_id, datum DESC);
CREATE INDEX IF NOT EXISTS vizitacio_congregation_datum_idx
  ON public.vizitacio (congregation_id, datum DESC);

CREATE TABLE IF NOT EXISTS public.vizitacio_meghagyas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vizitacio_id uuid NOT NULL,
  -- Denormalizált a gyors RLS-hez; az ÖSSZETETT FK garantálja, hogy a szülő
  -- vizitáció valódi megyéje (direkt PostgREST-hívással sem húzhat szét).
  diocese_id uuid NOT NULL,
  szoveg text NOT NULL,
  hatarido date,
  teljesitve boolean NOT NULL DEFAULT false,
  teljesitve_at timestamptz,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vizitacio_meghagyas_pkey PRIMARY KEY (id),
  CONSTRAINT vizitacio_meghagyas_vizitacio_fkey
    FOREIGN KEY (vizitacio_id, diocese_id)
    REFERENCES public.vizitacio (id, diocese_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.vizitacio_meghagyas IS
  '2026-08-15 (egyházmegyei szint, 3.8): a vizitáció MEGHAGYÁSAI (feladatok határidővel) — a KONYVELES-doc:169 hiányát zárja. A diocese_id denormalizált, az összetett FK köti a szülő vizitáció megyéjéhez.';

CREATE INDEX IF NOT EXISTS vizitacio_meghagyas_vizitacio_idx
  ON public.vizitacio_meghagyas (vizitacio_id);

CREATE OR REPLACE FUNCTION public.vizitacio_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vizitacio_updated_at_trigger ON public.vizitacio;
CREATE TRIGGER vizitacio_updated_at_trigger
  BEFORE UPDATE ON public.vizitacio
  FOR EACH ROW
  EXECUTE FUNCTION public.vizitacio_set_updated_at();

REVOKE ALL ON public.vizitacio FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vizitacio TO authenticated;
REVOKE ALL ON public.vizitacio_meghagyas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vizitacio_meghagyas TO authenticated;

ALTER TABLE public.vizitacio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vizitacio_meghagyas ENABLE ROW LEVEL SECURITY;

-- vizitacio: megyei írók + rendszergazda (kanonikus alak).
DROP POLICY IF EXISTS vizitacio_all ON public.vizitacio;
CREATE POLICY vizitacio_all
  ON public.vizitacio
  FOR ALL TO authenticated
  USING (public.current_user_has_global_access()
         OR vizitacio.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  WITH CHECK (public.current_user_has_global_access()
         OR vizitacio.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])));

-- vizitacio: számvevői/olvasói ág (csak SELECT).
DROP POLICY IF EXISTS vizitacio_szamvevo_select ON public.vizitacio;
CREATE POLICY vizitacio_szamvevo_select
  ON public.vizitacio
  FOR SELECT TO authenticated
  USING (vizitacio.diocese_id
         = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])));

-- vizitacio: a GYÜLEKEZET a saját vizitációit OLVASSA (lelkészi jelentés III.12).
DROP POLICY IF EXISTS vizitacio_gyulekezet_select ON public.vizitacio;
CREATE POLICY vizitacio_gyulekezet_select
  ON public.vizitacio
  FOR SELECT TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = vizitacio.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
  );

-- vizitacio_meghagyas: a denormalizált diocese_id-n ugyanaz a három ág.
DROP POLICY IF EXISTS vizitacio_meghagyas_all ON public.vizitacio_meghagyas;
CREATE POLICY vizitacio_meghagyas_all
  ON public.vizitacio_meghagyas
  FOR ALL TO authenticated
  USING (public.current_user_has_global_access()
         OR vizitacio_meghagyas.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  WITH CHECK (public.current_user_has_global_access()
         OR vizitacio_meghagyas.diocese_id
            = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])));

DROP POLICY IF EXISTS vizitacio_meghagyas_szamvevo_select ON public.vizitacio_meghagyas;
CREATE POLICY vizitacio_meghagyas_szamvevo_select
  ON public.vizitacio_meghagyas
  FOR SELECT TO authenticated
  USING (vizitacio_meghagyas.diocese_id
         = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])));

-- A gyülekezet a RÁ vonatkozó vizitáció meghagyásait olvassa (szülő-láncon).
DROP POLICY IF EXISTS vizitacio_meghagyas_gyulekezet_select ON public.vizitacio_meghagyas;
CREATE POLICY vizitacio_meghagyas_gyulekezet_select
  ON public.vizitacio_meghagyas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vizitacio v
    WHERE v.id = vizitacio_meghagyas.vizitacio_id
      AND (
        v.congregation_id = public.current_user_congregation_id()
        OR EXISTS (
          SELECT 1 FROM public.profile_roles pr
          WHERE pr.profile_id = (SELECT auth.uid())
            AND pr.scope = 'congregation'
            AND pr.scope_id = v.congregation_id
            AND pr.active AND pr.approval_status = 'approved'
        )
      )
  ));

-- ────────────────────────────────────────────────────────────────────────────
-- 1/F) Mentés-besorolás (fail-closed kapu — besorolatlan táblánál a napi
--      mentés HANGOSAN megáll). A minta: 2026-08-11-biztonsagi-mentes.sql 3/e
--      (diocese_* = globalis / R2 / visszaallithato=false).
--      ⚠️ DO UPDATE, nem DO NOTHING — a 3/i tanulság: egy már telepített
--      adatbázisban a DO NOTHING a hibás besorolást némán megőrizné.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('diocese_felterjesztes','globalis',NULL,2,false,
  '2026-08-15 (egyházmegyei szint, 3.6): megye→kerület felterjesztések. Egyházmegyei szint — külön hatókör, a diocese_* táblák mintájára a GLOBÁLIS mentésbe (R2: dioceses+districts R1 után). A gyülekezeti visszaállítás nem nyúl hozzá.'),
 ('vizitacio','globalis',NULL,2,false,
  '2026-08-15 (egyházmegyei szint, 3.8): esperesi vizitációk — MEGYEI nyilvántartás (van congregation_id-ja, de a sor a megyéé; gyülekezeti mentésbe véve a gyülekezeti visszaállítás megyei rekordokat írna). Globális mentés, R2. ⚠️ jegyzokonyv_iktato_id az iktato-ra mutat (gyülekezeti hatókörű tábla) — a globális visszaállítás runbookjában az iktato után jön.'),
 ('vizitacio_meghagyas','globalis',NULL,3,false,
  '2026-08-15 (egyházmegyei szint, 3.8): vizitációs meghagyások. FK a vizitacio-ra (R2) → R3. Globális mentés, a vizitacio-val együtt.'),
 ('valasztoi_nevjegyzek','gyulekezet',NULL,2,true,
  '2026-08-15 (egyházmegyei szint, 3.7): a választói névjegyzék éves eljárásrend-naplója — GYÜLEKEZETI adat (congregation_id, alap-szűrő), FK csak a congregations-re → R2. A hitelesitette/hivatalboli napló profil-hivatkozásai FK nélküliek, visszaállításkor nem blokkolnak.')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · TÁBLÁK' AS szakasz,
       'Létrejött mind a 4 új tábla? (4 = rendben)' AS mit,
       (SELECT count(*)::text || ' / 4' FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('diocese_felterjesztes','valasztoi_nevjegyzek',
                             'vizitacio','vizitacio_meghagyas')) AS ertek,
       'Ha nem 4: az 1/C–1/E szakasz nem futott végig.' AS teendo

UNION ALL
SELECT 101, '2 · OSZLOPOK',
       'document_submissions új oszlopai (3 = rendben)',
       (SELECT count(*)::text || ' / 3' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='document_submissions'
          AND column_name IN ('diocese_iktato_id','szamvevo_ellenorizte_at','szamvevo_ellenorizte_by')),
       ''

UNION ALL
SELECT 102, '2 · OSZLOPOK',
       'diocese_bealitas módosítás-flagek (9 = rendben)',
       (SELECT count(*)::text || ' / 9' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='diocese_bealitas'
          AND column_name LIKE 'koltsegvetes_mod%'),
       ''

UNION ALL
SELECT (110 + row_number() OVER (ORDER BY t.tabla))::int, '2 · RLS',
       t.tabla || ' — RLS be + policy-darabszám',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ BE' ELSE '⛔ KI!' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname = t.tabla), 'nincs tábla')
       || ' · ' ||
       (SELECT count(*)::text || ' policy' FROM pg_policies
        WHERE schemaname='public' AND tablename = t.tabla),
       'Várt: diocese_felterjesztes 4, valasztoi_nevjegyzek 4, vizitacio 3, vizitacio_meghagyas 3 policy.'
FROM (VALUES ('diocese_felterjesztes'), ('valasztoi_nevjegyzek'),
             ('vizitacio'), ('vizitacio_meghagyas')) AS t(tabla)

UNION ALL
SELECT 120, '2 · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) policy olvasó-feloldót az új táblákon? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname='public' AND pol.cmd <> 'SELECT'
          AND pol.tablename IN ('diocese_felterjesztes','valasztoi_nevjegyzek',
                                'vizitacio','vizitacio_meghagyas')
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              LIKE '%current_user_diocese_olvaso_ids%'),
       '⛔ Ha nem 0: az ellenőr írhatná, amit ellenőriz.'

UNION ALL
SELECT 121, '2 · GRANT-OK',
       'diocese_felterjesztes + valasztoi_nevjegyzek: NINCS DELETE grant? (0 = rendben)',
       (SELECT count(*)::text FROM information_schema.role_table_grants
        WHERE table_schema='public'
          AND table_name IN ('diocese_felterjesztes','valasztoi_nevjegyzek')
          AND grantee='authenticated' AND privilege_type='DELETE'),
       'A felterjesztés és az eljárásrend-napló nem tűnhet el nyomtalanul.'

UNION ALL
SELECT 122, '2 · EGYEDISÉG',
       'Él a 2 kulcs-index? (diocese_felterjesztes dio+tipus+év, valasztoi_nevjegyzek cong+év)',
       (SELECT count(*)::text || ' / 2' FROM pg_indexes
        WHERE schemaname='public'
          AND indexname IN ('diocese_felterjesztes_dio_tipus_ev_uidx',
                            'valasztoi_nevjegyzek_cong_ev_uidx')),
       ''

UNION ALL
SELECT 123, '2 · MENTÉS-BESOROLÁS',
       'Mind a 4 új tábla besorolva? (4 = rendben)',
       (SELECT count(*)::text || ' / 4' FROM public.backup_table_policy
        WHERE tabla IN ('diocese_felterjesztes','valasztoi_nevjegyzek',
                        'vizitacio','vizitacio_meghagyas')
          AND reteg IS NOT NULL),
       'Besorolatlan táblánál a napi mentés hangosan megáll.'

UNION ALL
SELECT 124, '2 · KOMPOZIT FK',
       'A vizitacio_meghagyas összetett FK-ja a (vizitacio_id, diocese_id) párra mutat?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%diocese_id%'
                             THEN '✅ ' || pg_get_constraintdef(oid)
                             ELSE '⛔ egyoszlopos FK!' END
                 FROM pg_constraint
                 WHERE conname='vizitacio_meghagyas_vizitacio_fkey'
                   AND conrelid='public.vizitacio_meghagyas'::regclass), 'nincs FK'),
       'A denormalizált diocese_id nem húzhat szét a szülőétől.'

ORDER BY 1;
