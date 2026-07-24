-- ==========================================================================
-- 2026-07-17 — Tagi portál: izolált alap-adatmodell, RLS és audit
-- ==========================================================================
--
-- CÉL
--   A publikus gyülekezeti oldalhoz tartozó tagi portál adatainak elkülönítése
--   a belső munkatársi `profiles` modelltől. Ez a migráció kizárólag az alapot
--   telepíti:
--
--     * member_accounts                    — egy auth-fiók tagi identitása;
--     * member_congregation_applications   — gyülekezeti csatlakozási kérelem;
--     * member_person_links                — jóváhagyott kapcsolat a `szemely` sorhoz;
--     * member_portal_audit_log            — append-only, PII-szegény auditnapló.
--
-- NEM RÉSZE ENNEK A MIGRÁCIÓNAK
--   * a signup / approve / reject / suspend RPC-k;
--   * a `profiles`, `profile_roles`, `szemely`, `befizetes`, `auth.users` vagy
--     storage policy-k hardeningja;
--   * a `handle_new_user()` auth-trigger módosítása;
--   * a családfa-, befizetés- és adatmódosítás-lekérdező RPC-k.
--
-- BIZTONSÁGI SORREND
--   A tagi regisztrációt TILOS bekapcsolni, amíg a külön P0 hardening migráció
--   nem szüntette meg a legacy `profiles` / `profile_roles` / `szemely`
--   jogosultsági réseket, és a kontrollált RPC-k nincsenek telepítve.
--
-- HOZZÁFÉRÉSI MODELL
--   * anon: semmit nem ér el;
--   * member_portal_user: csak a saját account/application/link sorait olvassa;
--   * aktív, jóváhagyott gyülekezeti lelkész: a saját gyülekezete review-sorait
--     olvassa; közvetlenül nem írhat;
--   * írás kizárólag későbbi, explicit grantos SECURITY DEFINER RPC-n;
--   * member_portal_audit_log: tag számára nem olvasható, lelkésznek csak a
--     saját gyülekezete eseményei láthatók.
--
-- A jogosultság sehol nem használ `raw_user_meta_data` / `user_metadata`
-- értéket. A lelkészi helper kizárólag aktív `profiles` + aktív, jóváhagyott,
-- congregation-scope `profile_roles` hozzárendelést fogad el.
--
-- FAIL-CLOSED TELEPÍTÉS
--   A live constraint- és tenant-inventory alapján minden külső FK explicit.
--   Hiányzó szerepkör, kulcs, RLS vagy eltérő postflight esetén a teljes
--   tranzakció visszagördül; WARNING/fail-open ág nincs.
-- ==========================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- Fail-closed előfeltételek. A tagi táblák csak a P0 szerepkör-alapozás
-- után telepíthetők, és minden külső céltáblának a várt típussal
-- és kulccsal kell léteznie.
DO $$
DECLARE
  v_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Tagi core: csak postgres SQL Editor szereppel futtatható; current_user=%',
      current_user;
  END IF;

  FOREACH v_role IN ARRAY ARRAY[
    'app_staff_user',
    'app_pending_user',
    'member_portal_user'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = v_role
        AND NOT r.rolcanlogin
        AND NOT r.rolsuper
        AND NOT r.rolbypassrls
    ) THEN
      RAISE EXCEPTION 'Hiányzó vagy nem biztonságos P0 DB-szerepkör: %', v_role;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.congregations') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.profile_roles') IS NULL
     OR pg_catalog.to_regclass('public.szemely') IS NULL THEN
    RAISE EXCEPTION 'A tagi core egyik kötelező céltáblája hiányzik.';
  END IF;

  -- Ez tudatosan first-install migráció. Meglévő vagy részlegesen
  -- telepített tagi objektumot nem javítunk IF NOT EXISTS/OR REPLACE mögött.
  -- Sikeres telepítés után a fájl újrafuttatása is fail-closed megáll;
  -- az állapotot a COMMIT utáni read-only verifierrel kell ellenőrizni.
  IF pg_catalog.to_regnamespace('member_private') IS NOT NULL
     OR pg_catalog.to_regclass('public.member_accounts') IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.member_congregation_applications'
     ) IS NOT NULL
     OR pg_catalog.to_regclass('public.member_person_links') IS NOT NULL
     OR pg_catalog.to_regclass('public.member_portal_audit_log') IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.szemely_member_portal_identity_tenant_key'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'Tagi core: már létezik tagi objektum vagy részleges telepítés; automatikus felülírás tiltva.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.szemely s
    WHERE s.congregation_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A szemely táblában NULL congregation_id található; a tenant-FK nem telepíthető.';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 1. Nem exponált helper-séma
-- --------------------------------------------------------------------------

CREATE SCHEMA member_private AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA member_private
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user,
       member_portal_user, service_role;
GRANT USAGE ON SCHEMA member_private TO app_staff_user, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA member_private
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role,
       app_staff_user, app_pending_user, member_portal_user;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'member_private'
      AND pg_catalog.pg_get_userbyid(n.nspowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'A member_private schema owner eltér; manuális audit szükséges.';
  END IF;

  IF pg_catalog.has_schema_privilege('anon', 'member_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('authenticated', 'member_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('app_pending_user', 'member_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('member_portal_user', 'member_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('app_staff_user', 'member_private', 'CREATE')
     OR pg_catalog.has_schema_privilege('service_role', 'member_private', 'CREATE') THEN
    RAISE EXCEPTION 'A member_private schema grantmodell eltér.';
  END IF;
END
$$;

COMMENT ON SCHEMA member_private IS
  'Tagi portál belső helper- és trigger-függvényei. Nem Data API végpont; közvetlen CREATE jog nincs kliensszerepeknek.';

-- --------------------------------------------------------------------------
-- 2. Tagi fiók
-- --------------------------------------------------------------------------

CREATE TABLE public.member_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,

  -- Kizárólag tagi kapcsolatfelvételi adatok; nincs staff role vagy tenant-jog.
  email text NOT NULL,
  display_name text NOT NULL,
  phone text,
  preferred_locale text NOT NULL DEFAULT 'hu',

  status text NOT NULL DEFAULT 'pending_email',
  status_message text,
  email_confirmed_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  deleted_at timestamptz,

  terms_accepted_at timestamptz NOT NULL,
  privacy_notice_version text NOT NULL,

  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT member_accounts_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT member_accounts_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT member_accounts_status_check
    CHECK (status IN ('pending_email', 'active', 'suspended', 'deleted')),
  CONSTRAINT member_accounts_email_check
    CHECK (
      email = lower(btrim(email))
      AND char_length(email) BETWEEN 3 AND 320
      AND position('@' IN email) > 1
    ),
  CONSTRAINT member_accounts_display_name_check
    CHECK (
      display_name = btrim(display_name)
      AND char_length(display_name) BETWEEN 1 AND 200
    ),
  CONSTRAINT member_accounts_phone_check
    CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 3 AND 64),
  CONSTRAINT member_accounts_locale_check
    CHECK (preferred_locale IN ('hu', 'ro', 'en')),
  CONSTRAINT member_accounts_status_message_check
    CHECK (status_message IS NULL OR char_length(status_message) <= 1000),
  CONSTRAINT member_accounts_privacy_notice_version_check
    CHECK (char_length(btrim(privacy_notice_version)) BETWEEN 1 AND 64),
  CONSTRAINT member_accounts_revision_check CHECK (revision > 0),
  CONSTRAINT member_accounts_status_timestamps_check
    CHECK (
      (
        status = 'pending_email'
        AND activated_at IS NULL
        AND suspended_at IS NULL
        AND deleted_at IS NULL
      )
      OR (
        status = 'active'
        AND email_confirmed_at IS NOT NULL
        AND activated_at IS NOT NULL
        AND deleted_at IS NULL
      )
      OR (
        status = 'suspended'
        AND email_confirmed_at IS NOT NULL
        AND activated_at IS NOT NULL
        AND suspended_at IS NOT NULL
        AND deleted_at IS NULL
      )
      OR (
        status = 'deleted'
        AND deleted_at IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.member_accounts IS
  'Izolált tagi identitás egy Supabase Auth userhez. Nem staff-profil, nem ad szerepet, és önmagában nem ad hozzáférést gyülekezeti személyes adathoz.';
COMMENT ON COLUMN public.member_accounts.auth_user_id IS
  'A közös Supabase Auth felhasználója. UNIQUE: egy auth userhez legfeljebb egy tagi account.';
COMMENT ON COLUMN public.member_accounts.status_message IS
  'A tag számára is megjeleníthető státuszüzenet; belső adminjegyzetet nem szabad itt tárolni.';

CREATE UNIQUE INDEX member_accounts_email_unique_idx
  ON public.member_accounts (lower(email));

CREATE INDEX member_accounts_status_created_idx
  ON public.member_accounts (status, created_at DESC)
  WHERE status <> 'deleted';

-- --------------------------------------------------------------------------
-- 3. Gyülekezeti csatlakozási kérelmek
-- --------------------------------------------------------------------------

CREATE TABLE public.member_congregation_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_account_id uuid NOT NULL,
  congregation_id uuid NOT NULL,

  -- A jóváhagyáskor használt, adatminimalizált egyeztetési pillanatkép.
  applicant_full_name text NOT NULL,
  applicant_email text NOT NULL,
  applicant_phone text,
  applicant_birth_date date NOT NULL,
  applicant_message text,

  status text NOT NULL DEFAULT 'pending_email',
  email_confirmed_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid,
  decision_message text,
  withdrawn_at timestamptz,

  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_congregation_applications_pkey PRIMARY KEY (id),
  CONSTRAINT member_congregation_applications_account_fkey
    FOREIGN KEY (member_account_id)
    REFERENCES public.member_accounts(id)
    ON DELETE CASCADE,
  -- A háromoszlopos kulcs lehetővé teszi, hogy a link táblában az application,
  -- account és congregation összetartozását valódi FK garantálja.
  CONSTRAINT member_congregation_applications_identity_tenant_key
    UNIQUE (id, member_account_id, congregation_id),
  CONSTRAINT member_congregation_applications_status_check
    CHECK (status IN (
      'pending_email',
      'pending_review',
      'approved',
      'rejected',
      'withdrawn'
    )),
  CONSTRAINT member_congregation_applications_name_check
    CHECK (
      applicant_full_name = btrim(applicant_full_name)
      AND char_length(applicant_full_name) BETWEEN 1 AND 200
    ),
  CONSTRAINT member_congregation_applications_email_check
    CHECK (
      applicant_email = lower(btrim(applicant_email))
      AND char_length(applicant_email) BETWEEN 3 AND 320
      AND position('@' IN applicant_email) > 1
    ),
  CONSTRAINT member_congregation_applications_phone_check
    CHECK (
      applicant_phone IS NULL
      OR char_length(btrim(applicant_phone)) BETWEEN 3 AND 64
    ),
  CONSTRAINT member_congregation_applications_birth_date_check
    CHECK (
      applicant_birth_date >= DATE '1900-01-01'
      AND applicant_birth_date < DATE '2100-01-01'
    ),
  CONSTRAINT member_congregation_applications_message_check
    CHECK (applicant_message IS NULL OR char_length(applicant_message) <= 2000),
  CONSTRAINT member_congregation_applications_decision_message_check
    CHECK (decision_message IS NULL OR char_length(decision_message) <= 2000),
  CONSTRAINT member_congregation_applications_revision_check CHECK (revision > 0),
  CONSTRAINT member_congregation_applications_status_timestamps_check
    CHECK (
      (
        status = 'pending_email'
        AND submitted_at IS NULL
        AND reviewed_at IS NULL
        AND reviewed_by_profile_id IS NULL
        AND withdrawn_at IS NULL
      )
      OR (
        status = 'pending_review'
        AND email_confirmed_at IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_at IS NULL
        AND reviewed_by_profile_id IS NULL
        AND withdrawn_at IS NULL
      )
      OR (
        status IN ('approved', 'rejected')
        AND email_confirmed_at IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND reviewed_by_profile_id IS NOT NULL
        AND withdrawn_at IS NULL
      )
      OR (
        status = 'withdrawn'
        AND reviewed_at IS NULL
        AND reviewed_by_profile_id IS NULL
        AND withdrawn_at IS NOT NULL
      )
    ),
  CONSTRAINT member_congregation_applications_rejection_message_check
    CHECK (
      status <> 'rejected'
      OR decision_message IS NOT NULL
         AND char_length(btrim(decision_message)) > 0
    )
);

COMMENT ON TABLE public.member_congregation_applications IS
  'Tag kérelme egy konkrét gyülekezethez. Csak a kézi egyeztetéshez szükséges adatokat tartalmazza; CNP/TAJ/SZIG nem kerülhet ide.';
COMMENT ON COLUMN public.member_congregation_applications.decision_message IS
  'A tag számára is látható döntési indoklás. Belső lelkészi jegyzet az audit/rendszeroldali rétegbe kerüljön.';

-- Egyszerre csak egy nyitott kérelem lehet egy tagi fiókon, így a pending
-- folyamat egyetlen gyülekezet tenantjához kötött.
CREATE UNIQUE INDEX member_applications_one_open_per_account_idx
  ON public.member_congregation_applications (member_account_id)
  WHERE status IN ('pending_email', 'pending_review');

CREATE INDEX member_applications_account_history_idx
  ON public.member_congregation_applications (member_account_id, created_at DESC);

CREATE INDEX member_applications_review_queue_idx
  ON public.member_congregation_applications (congregation_id, submitted_at, created_at)
  WHERE status = 'pending_review';

CREATE INDEX member_applications_reviewer_idx
  ON public.member_congregation_applications (reviewed_by_profile_id, reviewed_at DESC)
  WHERE reviewed_by_profile_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 4. Jóváhagyott személykapcsolatok
-- --------------------------------------------------------------------------

CREATE TABLE public.member_person_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_account_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  person_id integer NOT NULL,
  application_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'active',
  -- A történeti person_id/congregation_id revoked állapotban is megmarad. A
  -- generált őroszlopok csak élő linknél tartják fenn a composite tenant-FK-t,
  -- ezért revocation után a meglévő személy-áthelyezési workflow nem blokkolódik.
  live_person_id integer GENERATED ALWAYS AS (
    CASE WHEN status IN ('active', 'suspended') THEN person_id ELSE NULL END
  ) STORED,
  live_congregation_id uuid GENERATED ALWAYS AS (
    CASE WHEN status IN ('active', 'suspended') THEN congregation_id ELSE NULL END
  ) STORED,
  status_message text,
  linked_by_profile_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  suspended_at timestamptz,
  revoked_at timestamptz,

  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT member_person_links_pkey PRIMARY KEY (id),
  CONSTRAINT member_person_links_account_fkey
    FOREIGN KEY (member_account_id)
    REFERENCES public.member_accounts(id)
    ON DELETE CASCADE,
  CONSTRAINT member_person_links_application_account_tenant_fkey
    FOREIGN KEY (application_id, member_account_id, congregation_id)
    REFERENCES public.member_congregation_applications(
      id,
      member_account_id,
      congregation_id
    )
    ON DELETE CASCADE,
  CONSTRAINT member_person_links_application_key UNIQUE (application_id),
  CONSTRAINT member_person_links_status_check
    CHECK (status IN ('active', 'suspended', 'revoked')),
  CONSTRAINT member_person_links_status_message_check
    CHECK (status_message IS NULL OR char_length(status_message) <= 1000),
  CONSTRAINT member_person_links_revision_check CHECK (revision > 0),
  CONSTRAINT member_person_links_status_timestamps_check
    CHECK (
      (
        status = 'active'
        AND linked_at IS NOT NULL
        AND suspended_at IS NULL
        AND revoked_at IS NULL
        AND status_message IS NULL
      )
      OR (
        status = 'suspended'
        AND linked_at IS NOT NULL
        AND suspended_at IS NOT NULL
        AND revoked_at IS NULL
        AND status_message IS NOT NULL
        AND char_length(btrim(status_message)) > 0
      )
      OR (
        status = 'revoked'
        AND linked_at IS NOT NULL
        AND revoked_at IS NOT NULL
        AND status_message IS NOT NULL
        AND char_length(btrim(status_message)) > 0
      )
    )
);

COMMENT ON TABLE public.member_person_links IS
  'Jóváhagyott kapcsolat a tagi account és a belső `szemely` rekord között. Az account/congregation/application összetartozását FK, az élő személy-tenant egyezést generált őroszlopos composite FK védi; revoked history nem blokkol személy-áthelyezést.';

-- Egy tagi fiók egyszerre csak egy élő (aktív vagy felfüggesztett)
-- személykapcsolatot kaphat. A felfüggesztés nem tenant-váltási kerülőút.
CREATE UNIQUE INDEX member_person_links_one_live_per_account_idx
  ON public.member_person_links (member_account_id)
  WHERE status IN ('active', 'suspended');

-- Egy személyt globálisan egyszerre csak egy élő tagi fiók kezelhet.
-- A szemely.id eleve globális PK; a congregation_id indexbe emelése ugyanazt
-- a személyt hibásan két fiókhoz engedné egy tenantváltás versenyhelyzetében.
CREATE UNIQUE INDEX member_person_links_one_live_per_person_idx
  ON public.member_person_links (person_id)
  WHERE status IN ('active', 'suspended');

CREATE INDEX member_person_links_account_history_idx
  ON public.member_person_links (member_account_id, created_at DESC);

CREATE INDEX member_person_links_congregation_status_idx
  ON public.member_person_links (congregation_id, status, created_at DESC);

CREATE INDEX member_person_links_person_idx
  ON public.member_person_links (person_id);

-- --------------------------------------------------------------------------
-- 5. Append-only tagi auditnapló
-- --------------------------------------------------------------------------

CREATE TABLE public.member_portal_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  actor_user_id uuid,
  actor_kind text NOT NULL,
  event_type text NOT NULL,

  congregation_id uuid,
  member_account_id uuid,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,

  -- Szándékosan csak státuszok/azonosítók; e-mail, telefon, születési dátum,
  -- CNP/TAJ/SZIG vagy teljes old/new rekord nem naplózható ide.
  details jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT member_portal_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT member_portal_audit_actor_kind_check
    CHECK (actor_kind IN ('member', 'staff', 'system')),
  CONSTRAINT member_portal_audit_event_type_check
    CHECK (char_length(event_type) BETWEEN 3 AND 120),
  CONSTRAINT member_portal_audit_subject_type_check
    CHECK (subject_type IN ('member_account', 'congregation_application', 'person_link')),
  CONSTRAINT member_portal_audit_details_object_check
    CHECK (jsonb_typeof(details) = 'object')
);

-- A details mező tudatosan zárt allowlistet használ. Így egy későbbi backend
-- hiba sem tud e-mailt, telefonszámot, születési dátumot vagy teljes rekordot
-- tetszőleges JSON-kulcs alatt az auditnaplóba írni. Új, PII-szegény mezőt csak
-- külön, felülvizsgált migrációval szabad engedélyezni.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.member_portal_audit_log'::regclass
      AND conname = 'member_portal_audit_details_pii_guard_check'
  ) THEN
    ALTER TABLE public.member_portal_audit_log
      ADD CONSTRAINT member_portal_audit_details_pii_guard_check
      CHECK (
        (details - ARRAY[
          'operation',
          'old_status',
          'new_status',
          'application_id',
          'person_id',
          'revision'
        ]::text[]) = '{}'::jsonb
        AND (
          NOT (details ? 'operation')
          OR (
            jsonb_typeof(details -> 'operation') = 'string'
            AND details ->> 'operation' IN ('insert', 'update', 'delete')
          )
        )
        AND (
          NOT (details ? 'old_status')
          OR (
            jsonb_typeof(details -> 'old_status') = 'string'
            AND details ->> 'old_status' IN (
              'pending_email', 'pending_review', 'approved', 'rejected',
              'withdrawn', 'active', 'suspended', 'revoked', 'deleted'
            )
          )
        )
        AND (
          NOT (details ? 'new_status')
          OR (
            jsonb_typeof(details -> 'new_status') = 'string'
            AND details ->> 'new_status' IN (
              'pending_email', 'pending_review', 'approved', 'rejected',
              'withdrawn', 'active', 'suspended', 'revoked', 'deleted'
            )
          )
        )
        AND (
          NOT (details ? 'application_id')
          OR (
            jsonb_typeof(details -> 'application_id') = 'string'
            AND details ->> 'application_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          )
        )
        AND (
          NOT (details ? 'person_id')
          OR (
            jsonb_typeof(details -> 'person_id') = 'string'
            AND details ->> 'person_id' ~ '^-?[0-9]+$'
          )
        )
        AND (
          NOT (details ? 'revision')
          OR (
            jsonb_typeof(details -> 'revision') = 'string'
            AND details ->> 'revision' ~ '^[1-9][0-9]*$'
          )
        )
      );
  END IF;
END
$$;

COMMENT ON CONSTRAINT member_portal_audit_details_pii_guard_check
  ON public.member_portal_audit_log IS
  'Zárt, skaláris allowlist: az audit details mező kizárólag műveletet, státuszt és technikai azonosítót tartalmazhat.';

COMMENT ON TABLE public.member_portal_audit_log IS
  'Append-only tagi portál audit. Tudatosan FK nélküli actor/subject pillanatkép, hogy account/auth törlés után is megmaradjon. PII-t vagy teljes rekord-snapshotot tilos a details mezőbe írni.';

CREATE INDEX member_portal_audit_congregation_time_idx
  ON public.member_portal_audit_log (congregation_id, occurred_at DESC)
  WHERE congregation_id IS NOT NULL;

CREATE INDEX member_portal_audit_account_time_idx
  ON public.member_portal_audit_log (member_account_id, occurred_at DESC)
  WHERE member_account_id IS NOT NULL;

CREATE INDEX member_portal_audit_subject_idx
  ON public.member_portal_audit_log (subject_type, subject_id, occurred_at DESC);

-- --------------------------------------------------------------------------
-- 6. Külső FK-k fail-closed telepítése
-- --------------------------------------------------------------------------
--
-- A live pg_constraint export igazolta a congregations/profiles/szemely PK-kat,
-- a tenant-inventory pedig azt, hogy a szemely.congregation_id teljes. Bármely
-- eltérés EXCEPTION-nel megszakítja a migrációt.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attname = 'id'
     AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.congregations'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_congregation_applications'::regclass
        AND conname = 'member_applications_congregation_fkey'
    ) THEN
      ALTER TABLE public.member_congregation_applications
        ADD CONSTRAINT member_applications_congregation_fkey
        FOREIGN KEY (congregation_id)
        REFERENCES public.congregations(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_person_links'::regclass
        AND conname = 'member_person_links_congregation_fkey'
    ) THEN
      ALTER TABLE public.member_person_links
        ADD CONSTRAINT member_person_links_congregation_fkey
        FOREIGN KEY (congregation_id)
        REFERENCES public.congregations(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tagi portál: congregations(id) nem igazolt UNIQUE/PK; a migráció leállt.';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attname = 'id'
     AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.profiles'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_congregation_applications'::regclass
        AND conname = 'member_applications_reviewer_fkey'
    ) THEN
      ALTER TABLE public.member_congregation_applications
        ADD CONSTRAINT member_applications_reviewer_fkey
        FOREIGN KEY (reviewed_by_profile_id)
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_person_links'::regclass
        AND conname = 'member_person_links_linked_by_fkey'
    ) THEN
      ALTER TABLE public.member_person_links
        ADD CONSTRAINT member_person_links_linked_by_fkey
        FOREIGN KEY (linked_by_profile_id)
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tagi portál: profiles(id) nem igazolt UNIQUE/PK; a migráció leállt.';
  END IF;
END
$$;

-- A live ellenőrzés szerint nincs NULL tenant. Előbb olcsón felvesszük és
-- validáljuk a CHECK-et; a SET NOT NULL így nem igényel új teljes táblaszkennelést.
-- A rövid AccessExclusive lock miatt ezt maintenance ablakban kell futtatni.
ALTER TABLE public.szemely
  ADD CONSTRAINT szemely_member_portal_congregation_not_null_check
  CHECK (congregation_id IS NOT NULL) NOT VALID;

ALTER TABLE public.szemely
  VALIDATE CONSTRAINT szemely_member_portal_congregation_not_null_check;

ALTER TABLE public.szemely
  ALTER COLUMN congregation_id SET NOT NULL;

ALTER TABLE public.szemely
  DROP CONSTRAINT szemely_member_portal_congregation_not_null_check;

-- Névvel ellátott UNIQUE constraint a személy+tenant FK-célhoz. A constraint
-- katalógusból egyértelműen auditálható; nem csak indexnévre hagyatkozunk.
ALTER TABLE public.szemely
  ADD CONSTRAINT szemely_member_portal_identity_tenant_key
  UNIQUE (id, congregation_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attname = 'id'
     AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.szemely'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_person_links'::regclass
        AND conname = 'member_person_links_person_fkey'
    ) THEN
      ALTER TABLE public.member_person_links
        ADD CONSTRAINT member_person_links_person_fkey
        FOREIGN KEY (person_id)
        REFERENCES public.szemely(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.member_person_links'::regclass
        AND conname = 'member_person_links_live_person_tenant_fkey'
    ) THEN
      ALTER TABLE public.member_person_links
        ADD CONSTRAINT member_person_links_live_person_tenant_fkey
        FOREIGN KEY (live_person_id, live_congregation_id)
        REFERENCES public.szemely(id, congregation_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tagi portál: szemely(id) nem igazolt UNIQUE/PK; a migráció leállt.';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 7. Aktív, azonos gyülekezetű lelkészi helper
-- --------------------------------------------------------------------------
--
-- Szándékosan NINCS legacy `profiles.role` fallback. Egy staff user csak akkor
-- kap review-hozzáférést, ha:
--   * van aktív profiles sora; ÉS
--   * van aktív + approved `profile_roles` sora;
--   * role='lelkesz', scope='congregation', scope_id = célgyülekezet.
--
-- Ez sem helyettesíti a P0 hardeningot: a tagi portál bekapcsolása előtt a
-- profiles/profile_roles közvetlen írási réseit külön meg kell szüntetni.

CREATE OR REPLACE FUNCTION member_private.member_portal_staff_can_review_congregation(
  p_congregation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_congregation_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr
        ON pr.profile_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active
        AND pr.approval_status = 'approved'
        AND pr.role = 'lelkesz'
        AND pr.scope = 'congregation'
        AND pr.scope_id = p_congregation_id
    );
$$;

COMMENT ON FUNCTION member_private.member_portal_staff_can_review_congregation(uuid) IS
  'RLS helper: aktív + approved congregation-scope lelkészi assignment a célgyülekezetre. Nem használ user_metadata/JWT authorization claimet.';

CREATE OR REPLACE FUNCTION member_private.member_portal_staff_can_read_account(
  p_member_account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_member_account_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = p_member_account_id
        AND ma.status <> 'deleted'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.member_congregation_applications a
        WHERE a.member_account_id = p_member_account_id
          AND a.status = 'pending_review'
          AND member_private.member_portal_staff_can_review_congregation(a.congregation_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.member_person_links l
        WHERE l.member_account_id = p_member_account_id
          AND l.status IN ('active', 'suspended')
          AND member_private.member_portal_staff_can_review_congregation(l.congregation_id)
      )
    );
$$;

COMMENT ON FUNCTION member_private.member_portal_staff_can_read_account(uuid) IS
  'RLS helper: a lelkész csak függőben lévő review vagy élő személykapcsolat idején olvashat accountot; lezárt historikus sor nem tart fenn hozzáférést.';

REVOKE ALL ON FUNCTION member_private.member_portal_staff_can_review_congregation(uuid)
  FROM PUBLIC, anon, authenticated, app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_staff_can_read_account(uuid)
  FROM PUBLIC, anon, authenticated, app_pending_user, member_portal_user;

GRANT EXECUTE ON FUNCTION member_private.member_portal_staff_can_review_congregation(uuid)
  TO app_staff_user, service_role;
GRANT EXECUTE ON FUNCTION member_private.member_portal_staff_can_read_account(uuid)
  TO app_staff_user, service_role;

-- --------------------------------------------------------------------------
-- 8. Integritás- és workflow-triggerek
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION member_private.member_portal_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := statement_timestamp();
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION member_private.member_account_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_email' THEN
      RAISE EXCEPTION 'Új tagi account csak pending_email állapotban hozható létre.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'A tagi account technikai azonosítói nem módosíthatók.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'deleted' THEN
    RAISE EXCEPTION 'Törölt tagi account nem módosítható.'
      USING ERRCODE = '23514';
  END IF;

  -- Tartós kereszt-tábla invariáns:
  --   * suspended account mellett nem maradhat active link;
  --   * deleted account mellett active/suspended (élő) link sem maradhat.
  -- A linket a kontrollált RPC-nek kell ELŐBB szűkítenie, és csak utána az
  -- accountot módosítania. A workflow RPC minden DML előtt account-kulcsú
  -- advisory lockot vesz fel, majd account -> application -> person sorrendben
  -- zárol; row triggerben már túl késő lenne advisory lockot kérni.
  IF NEW.status = 'suspended' AND EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.member_account_id = NEW.id
      AND l.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tagi account csak az aktív személykapcsolat előzetes felfüggesztése vagy visszavonása után függeszthető fel.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'deleted' AND EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.member_account_id = NEW.id
      AND l.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Tagi account csak minden élő személykapcsolat előzetes visszavonása után törölhető.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending_email' AND NEW.status IN ('active', 'deleted'))
    OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'deleted'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'deleted'))
  ) THEN
    RAISE EXCEPTION 'Érvénytelen tagi account státuszváltás: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION member_private.member_application_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_email' THEN
      RAISE EXCEPTION 'Új tagi kérelem csak pending_email állapotban hozható létre.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id THEN
    RAISE EXCEPTION 'A tagi kérelem account- és congregation-kapcsolata nem módosítható.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status IN ('approved', 'rejected', 'withdrawn')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Lezárt tagi kérelem nem módosítható.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending_email' AND NEW.status IN ('pending_review', 'withdrawn'))
    OR (OLD.status = 'pending_review' AND NEW.status IN ('approved', 'rejected', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION 'Érvénytelen tagi kérelem státuszváltás: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Az application minden íráskor ugyanahhoz az account-emailhez és létező
-- gyülekezethez kötődik. Új kérelem nem indítható, amíg élő link van.
CREATE OR REPLACE FUNCTION member_private.member_application_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_email text;
  v_account_status text;
BEGIN
  SELECT ma.email, ma.status
    INTO v_account_email, v_account_status
    FROM public.member_accounts ma
   WHERE ma.id = NEW.member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi kérelemhez tartozó account nem létezik.'
      USING ERRCODE = '23503';
  END IF;

  IF v_account_status NOT IN ('pending_email', 'active') THEN
    RAISE EXCEPTION 'Felfüggesztett vagy törölt tagi account nem indíthat kérelmet.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.applicant_email IS DISTINCT FROM v_account_email THEN
    RAISE EXCEPTION 'A kérelem email-címe nem egyezik a tagi account email-címével.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM c.id
    FROM public.congregations c
   WHERE c.id = NEW.congregation_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A kérelem célgyülekezete nem létezik.'
      USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.member_account_id = NEW.member_account_id
      AND l.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Aktív vagy felfüggesztett személykapcsolat mellett új kérelem nem indítható.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('approved', 'rejected')
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
     ) THEN
    IF (SELECT auth.uid()) IS NULL
       OR NEW.reviewed_by_profile_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'A kérelem döntéshozója csak a valódi JWT actor lehet.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.profile_roles pr
        ON pr.profile_id = p.id
      WHERE p.id = NEW.reviewed_by_profile_id
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.anonymized_at IS NULL
        AND pr.active
        AND pr.approval_status = 'approved'
        AND pr.role = 'lelkesz'
        AND pr.scope = 'congregation'
        AND pr.scope_id = NEW.congregation_id
    ) THEN
      RAISE EXCEPTION 'A kérelem döntéshozója nem aktív, jóváhagyott lelkész ebben a gyülekezetben.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION member_private.member_person_link_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'Új tagi személykapcsolat csak active állapotban hozható létre.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.linked_by_profile_id IS DISTINCT FROM OLD.linked_by_profile_id
     OR NEW.linked_at IS DISTINCT FROM OLD.linked_at THEN
    RAISE EXCEPTION 'A tagi személykapcsolat azonosítói nem módosíthatók.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'Visszavont tagi személykapcsolat nem módosítható.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'revoked'))
  ) THEN
    RAISE EXCEPTION 'Érvénytelen tagi személykapcsolat státuszváltás: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- A composite FK az application/account/congregation egyezést már garantálja.
-- Ez a trigger a live `szemely.congregation_id` tenant-egyezést, az approved
-- applicationt és aktív accountot ellenőrzi. SECURITY DEFINER szükséges, mert
-- a tag közvetlenül nem olvashatja a belső `szemely` táblát.
--
-- A szemely-oldali tenantváltást csak active/suspended állapotban blokkolja a
-- generált (live_person_id, live_congregation_id) composite FK. Revocation után
-- a történeti snapshot megmarad, de a meglévő transfer workflow ismét futhat.
CREATE OR REPLACE FUNCTION member_private.member_person_link_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_congregation_id uuid;
  v_person_isvisible boolean;
  v_person_member_status text;
  v_application_status text;
  v_account_status text;
BEGIN
  -- A felfüggesztés/visszavonás hozzáférést szűkít; az azonosítók
  -- változtathatatlanságát a következő transition trigger ellenőrzi. Suspended
  -- állapotban a generált tenant-FK tovább él, revoked állapotban felszabadul.
  IF TG_OP = 'UPDATE' AND NEW.status IN ('suspended', 'revoked') THEN
    RETURN NEW;
  END IF;

  -- Konzisztens kereszt-tábla zársorrend: account -> application -> person.
  -- Az account FOR UPDATE zár stabilan tartja a státuszt, és kizárja, hogy a
  -- kapcsolat aktiválása közben ugyanazt az accountot felfüggesszék/töröljék.
  SELECT ma.status
    INTO v_account_status
    FROM public.member_accounts ma
   WHERE ma.id = NEW.member_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tagi account nem létezik.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.status = 'active' AND v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Aktív személykapcsolathoz aktív tagi account szükséges.'
      USING ERRCODE = '23514';
  END IF;

  SELECT a.status
    INTO v_application_status
    FROM public.member_congregation_applications a
   WHERE a.id = NEW.application_id
     AND a.member_account_id = NEW.member_account_id
     AND a.congregation_id = NEW.congregation_id
   FOR UPDATE;

  IF NOT FOUND OR v_application_status <> 'approved' THEN
    RAISE EXCEPTION 'Személykapcsolat csak jóváhagyott, azonos tenantú kérelemből hozható létre.'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.congregation_id, s.isvisible, s.member_status
    INTO v_person_congregation_id, v_person_isvisible, v_person_member_status
    FROM public.szemely s
   WHERE s.id = NEW.person_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A kapcsolni kívánt személy nem létezik (person_id=%).', NEW.person_id
      USING ERRCODE = '23503';
  END IF;

  IF v_person_congregation_id IS NULL
     OR v_person_congregation_id IS DISTINCT FROM NEW.congregation_id THEN
    RAISE EXCEPTION 'Cross-tenant tagi kapcsolat tiltva: a személy és a kérelem gyülekezete eltér.'
      USING ERRCODE = '23514';
  END IF;

  IF v_person_isvisible IS DISTINCT FROM true
     OR pg_catalog.lower(
       pg_catalog.btrim(COALESCE(v_person_member_status, ''))
     ) = 'törölt' THEN
    RAISE EXCEPTION
      'Törölt vagy rejtett személyrekordhoz nem hozható létre élő tagi kapcsolat.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT'
     AND (
       (SELECT auth.uid()) IS NULL
       OR NEW.linked_by_profile_id IS DISTINCT FROM (SELECT auth.uid())
     ) THEN
    RAISE EXCEPTION 'A személykapcsolat létrehozója csak a valódi JWT actor lehet.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr
      ON pr.profile_id = p.id
    WHERE p.id = NEW.linked_by_profile_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active
      AND pr.approval_status = 'approved'
      AND pr.role = 'lelkesz'
      AND pr.scope = 'congregation'
      AND pr.scope_id = NEW.congregation_id
  ) THEN
    RAISE EXCEPTION 'A személykapcsolat létrehozója nem aktív, jóváhagyott lelkész ebben a gyülekezetben.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- A meglévő tagtörlési/áthelyezési folyamatok nem hagyhatnak élő portállinket
-- rejtett, törölt vagy más tenantba került személyen. A kontrollált
-- kompatibilitási RPC-knek előbb revoked állapotba kell vinniük a linket.
CREATE OR REPLACE FUNCTION member_private.member_person_record_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    WHERE l.person_id = OLD.id
      AND l.status IN ('active', 'suspended')
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION
        'Élő tagi portálkapcsolattal rendelkező személy előbb csak a kapcsolat visszavonása után törölhető.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
       OR NEW.isvisible IS DISTINCT FROM true
       OR pg_catalog.lower(
         pg_catalog.btrim(COALESCE(NEW.member_status, ''))
       ) = 'törölt' THEN
      RAISE EXCEPTION
        'Élő tagi portálkapcsolat mellett tenantváltás, elrejtés vagy törölt státusz tiltott; előbb a linket kell visszavonni.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- PII-szegény automatikus audit. Teljes rekordot tudatosan nem ment.
CREATE OR REPLACE FUNCTION member_private.member_portal_log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_actor_user_id uuid;
  v_member_auth_user_id uuid;
  v_member_account_id uuid;
  v_congregation_id uuid;
  v_subject_id uuid;
  v_subject_type text;
  v_actor_kind text := 'system';
  v_details jsonb;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new, v_old);

  v_subject_id := NULLIF(v_row ->> 'id', '')::uuid;

  IF TG_TABLE_NAME = 'member_accounts' THEN
    v_subject_type := 'member_account';
    v_member_account_id := v_subject_id;
    v_member_auth_user_id := NULLIF(v_row ->> 'auth_user_id', '')::uuid;
    v_congregation_id := NULL;
  ELSIF TG_TABLE_NAME = 'member_congregation_applications' THEN
    v_subject_type := 'congregation_application';
    v_member_account_id := NULLIF(v_row ->> 'member_account_id', '')::uuid;
    v_congregation_id := NULLIF(v_row ->> 'congregation_id', '')::uuid;
  ELSE
    v_subject_type := 'person_link';
    v_member_account_id := NULLIF(v_row ->> 'member_account_id', '')::uuid;
    v_congregation_id := NULLIF(v_row ->> 'congregation_id', '')::uuid;
  END IF;

  -- Kizárólag a Supabase Auth által hitelesített JWT subject lehet actor.
  -- Egy kliens által szabadon SET-elhető custom GUC nem alkalmas audit-
  -- identitásnak; service/system műveletnél ez szándékosan NULL marad.
  v_actor_user_id := auth.uid();

  IF v_member_auth_user_id IS NULL AND v_member_account_id IS NOT NULL THEN
    SELECT ma.auth_user_id
      INTO v_member_auth_user_id
      FROM public.member_accounts ma
     WHERE ma.id = v_member_account_id;
  END IF;

  IF v_actor_user_id IS NOT NULL AND v_actor_user_id = v_member_auth_user_id THEN
    v_actor_kind := 'member';
  ELSIF v_actor_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr
      ON pr.profile_id = p.id
    WHERE p.id = v_actor_user_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.anonymized_at IS NULL
      AND pr.active
      AND pr.approval_status = 'approved'
  ) THEN
    v_actor_kind := 'staff';
  END IF;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'operation', lower(TG_OP),
    'old_status', v_old ->> 'status',
    'new_status', v_new ->> 'status',
    'application_id', v_row ->> 'application_id',
    'person_id', v_row ->> 'person_id',
    'revision', v_row ->> 'revision'
  ));

  INSERT INTO public.member_portal_audit_log (
    actor_user_id,
    actor_kind,
    event_type,
    congregation_id,
    member_account_id,
    subject_type,
    subject_id,
    details
  ) VALUES (
    v_actor_user_id,
    v_actor_kind,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    v_congregation_id,
    v_member_account_id,
    v_subject_type,
    v_subject_id,
    v_details
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Az auditnapló valóban append-only: még egy hibás vagy túl széles
-- service_role kódút sem módosíthat/törölhet már létrejött eseményt. A tábla
-- tulajdonosa/superuser migrációval természetesen továbbra is karbantarthatja.
CREATE OR REPLACE FUNCTION member_private.member_portal_audit_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'A tagi portál auditnapló append-only; UPDATE, DELETE és TRUNCATE tiltott.'
    USING ERRCODE = '55000';
END;
$$;

-- Commitkori kétirányú invariáns: approved applicationhöz pontosan egy
-- technikai person-link tartozik. A link később revoked lehet, de a történeti
-- kapcsolat nem tűnhet el. INITIALLY DEFERRED, hogy az approval RPC ugyanabban
-- a tranzakcióban előbb frissíthesse a kérelmet, majd beszúrhassa a linket.
CREATE OR REPLACE FUNCTION member_private.member_approved_application_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_application_id uuid;
  v_application_status text;
  v_link_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'member_congregation_applications' THEN
    v_application_id := NEW.id;
  ELSE
    v_application_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.application_id
      ELSE NEW.application_id
    END;
  END IF;

  SELECT a.status
    INTO v_application_status
    FROM public.member_congregation_applications a
   WHERE a.id = v_application_id;

  -- Account/auth törlési cascade után az application már nem létezik.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_application_status = 'approved' THEN
    SELECT count(*)
      INTO v_link_count
      FROM public.member_person_links l
     WHERE l.application_id = v_application_id;

    IF v_link_count <> 1 THEN
      RAISE EXCEPTION
        'Approved tagi kérelemhez pontosan egy személykapcsolat kell (application_id=%, count=%).',
        v_application_id,
        v_link_count
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- A trigger-függvények közvetlen RPC-hívása tiltott. A trigger maga a tábla
-- ownerének jogosultságával, a SECURITY DEFINER ellenőrzések pedig rögzített,
-- üres search_path-tal futnak.
REVOKE ALL ON FUNCTION member_private.member_portal_touch_updated_at()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_account_transition_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_application_transition_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_application_integrity_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_person_link_transition_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_person_link_integrity_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_person_record_lifecycle_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_portal_log_change()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_portal_audit_append_only_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON FUNCTION member_private.member_approved_application_link_guard()
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;

DROP TRIGGER IF EXISTS member_accounts_10_transition_guard
  ON public.member_accounts;
CREATE TRIGGER member_accounts_10_transition_guard
  BEFORE INSERT OR UPDATE ON public.member_accounts
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_account_transition_guard();

DROP TRIGGER IF EXISTS member_accounts_90_touch
  ON public.member_accounts;
CREATE TRIGGER member_accounts_90_touch
  BEFORE UPDATE ON public.member_accounts
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_touch_updated_at();

DROP TRIGGER IF EXISTS member_accounts_audit
  ON public.member_accounts;
CREATE TRIGGER member_accounts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.member_accounts
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_log_change();

DROP TRIGGER IF EXISTS member_applications_10_transition_guard
  ON public.member_congregation_applications;
CREATE TRIGGER member_applications_10_transition_guard
  BEFORE INSERT OR UPDATE ON public.member_congregation_applications
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_application_transition_guard();

DROP TRIGGER IF EXISTS member_applications_05_integrity_guard
  ON public.member_congregation_applications;
CREATE TRIGGER member_applications_05_integrity_guard
  BEFORE INSERT OR UPDATE ON public.member_congregation_applications
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_application_integrity_guard();

DROP TRIGGER IF EXISTS member_applications_90_touch
  ON public.member_congregation_applications;
CREATE TRIGGER member_applications_90_touch
  BEFORE UPDATE ON public.member_congregation_applications
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_touch_updated_at();

DROP TRIGGER IF EXISTS member_applications_audit
  ON public.member_congregation_applications;
CREATE TRIGGER member_applications_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.member_congregation_applications
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_log_change();

DROP TRIGGER IF EXISTS member_person_links_10_integrity_guard
  ON public.member_person_links;
CREATE TRIGGER member_person_links_10_integrity_guard
  BEFORE INSERT OR UPDATE ON public.member_person_links
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_person_link_integrity_guard();

DROP TRIGGER IF EXISTS member_person_links_20_transition_guard
  ON public.member_person_links;
CREATE TRIGGER member_person_links_20_transition_guard
  BEFORE INSERT OR UPDATE ON public.member_person_links
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_person_link_transition_guard();

DROP TRIGGER IF EXISTS member_person_links_90_touch
  ON public.member_person_links;
CREATE TRIGGER member_person_links_90_touch
  BEFORE UPDATE ON public.member_person_links
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_touch_updated_at();

DROP TRIGGER IF EXISTS member_person_links_audit
  ON public.member_person_links;
CREATE TRIGGER member_person_links_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.member_person_links
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_log_change();

DROP TRIGGER IF EXISTS member_portal_szemely_lifecycle_guard
  ON public.szemely;
CREATE TRIGGER member_portal_szemely_lifecycle_guard
  BEFORE UPDATE OF congregation_id, isvisible, member_status OR DELETE
  ON public.szemely
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_person_record_lifecycle_guard();

DROP TRIGGER IF EXISTS member_portal_audit_immutable_rows
  ON public.member_portal_audit_log;
CREATE TRIGGER member_portal_audit_immutable_rows
  BEFORE UPDATE OR DELETE ON public.member_portal_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_portal_audit_append_only_guard();

DROP TRIGGER IF EXISTS member_portal_audit_no_truncate
  ON public.member_portal_audit_log;
CREATE TRIGGER member_portal_audit_no_truncate
  BEFORE TRUNCATE ON public.member_portal_audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION member_private.member_portal_audit_append_only_guard();

CREATE CONSTRAINT TRIGGER member_applications_approved_link_required
  AFTER INSERT OR UPDATE ON public.member_congregation_applications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_approved_application_link_guard();

CREATE CONSTRAINT TRIGGER member_links_approved_application_required
  AFTER INSERT OR UPDATE OR DELETE ON public.member_person_links
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_approved_application_link_guard();

-- --------------------------------------------------------------------------
-- 9. Grants — külön tag/staff olvasás, közvetlen backend-írás nélkül
-- --------------------------------------------------------------------------

REVOKE ALL ON TABLE public.member_accounts
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON TABLE public.member_congregation_applications
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON TABLE public.member_person_links
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON TABLE public.member_portal_audit_log
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;
REVOKE ALL ON SEQUENCE public.member_portal_audit_log_id_seq
  FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user, service_role;

GRANT SELECT ON TABLE public.member_accounts
  TO member_portal_user, app_staff_user;
GRANT SELECT ON TABLE public.member_congregation_applications
  TO member_portal_user, app_staff_user;
GRANT SELECT ON TABLE public.member_person_links
  TO member_portal_user, app_staff_user;
GRANT SELECT ON TABLE public.member_portal_audit_log
  TO app_staff_user;

-- A service_role sem kap közvetlen CRUD-ot. A későbbi, explicit EXECUTE-
-- granttal rendelkező SECURITY DEFINER workflow RPC-k a táblaowner jogával
-- írnak, így egy hibás service kliens nem tudja megkerülni az invariánsokat.

-- --------------------------------------------------------------------------
-- 10. RLS — default deny + szűk, külön SELECT policy-k
-- --------------------------------------------------------------------------

ALTER TABLE public.member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_congregation_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_person_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_portal_audit_log ENABLE ROW LEVEL SECURITY;

-- Tagi account: saját auth user.
DROP POLICY IF EXISTS member_accounts_select_self
  ON public.member_accounts;
CREATE POLICY member_accounts_select_self
  ON public.member_accounts
  FOR SELECT
  TO member_portal_user, app_staff_user
  USING (auth_user_id = (SELECT auth.uid()));

-- Lelkészi account-olvasás: csak ha saját gyülekezeti application/link kapcsolja.
DROP POLICY IF EXISTS member_accounts_select_review_staff
  ON public.member_accounts;
CREATE POLICY member_accounts_select_review_staff
  ON public.member_accounts
  FOR SELECT
  TO app_staff_user
  USING (
    member_private.member_portal_staff_can_read_account(id)
  );

-- Tagi kérelem: csak a saját account kérelmei.
DROP POLICY IF EXISTS member_applications_select_self
  ON public.member_congregation_applications;
CREATE POLICY member_applications_select_self
  ON public.member_congregation_applications
  FOR SELECT
  TO member_portal_user, app_staff_user
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = member_congregation_applications.member_account_id
        AND ma.auth_user_id = (SELECT auth.uid())
    )
  );

-- Review queue: csak aktív, jóváhagyott lelkész a saját gyülekezetére.
DROP POLICY IF EXISTS member_applications_select_review_staff
  ON public.member_congregation_applications;
-- Closed rejected/withdrawn applications contain matching PII and therefore do
-- not stay staff-readable forever. An approved application remains visible only
-- while its person link is live; the PII-poor audit preserves decision history.
CREATE POLICY member_applications_select_review_staff
  ON public.member_congregation_applications
  FOR SELECT
  TO app_staff_user
  USING (
    member_private.member_portal_staff_can_review_congregation(congregation_id)
    AND (
      status = 'pending_review'
      OR (
        status = 'approved'
        AND EXISTS (
          SELECT 1
          FROM public.member_person_links l
          WHERE l.application_id = member_congregation_applications.id
            AND l.status IN ('active', 'suspended')
        )
      )
    )
  );

-- Tagi link: csak a saját account kapcsolatai.
DROP POLICY IF EXISTS member_person_links_select_self
  ON public.member_person_links;
CREATE POLICY member_person_links_select_self
  ON public.member_person_links
  FOR SELECT
  TO member_portal_user, app_staff_user
  USING (
    EXISTS (
      SELECT 1
      FROM public.member_accounts ma
      WHERE ma.id = member_person_links.member_account_id
        AND ma.auth_user_id = (SELECT auth.uid())
    )
  );

-- Lelkészi link-olvasás: csak a saját gyülekezetére.
DROP POLICY IF EXISTS member_person_links_select_review_staff
  ON public.member_person_links;
-- Revoked links are represented in the audit trail, not kept in the daily
-- pastoral read surface indefinitely.
CREATE POLICY member_person_links_select_review_staff
  ON public.member_person_links
  FOR SELECT
  TO app_staff_user
  USING (
    status IN ('active', 'suspended')
    AND member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

-- Audit: tag számára nincs policy; a saját gyülekezet aktív lelkésze olvashat.
DROP POLICY IF EXISTS member_portal_audit_select_review_staff
  ON public.member_portal_audit_log;
CREATE POLICY member_portal_audit_select_review_staff
  ON public.member_portal_audit_log
  FOR SELECT
  TO app_staff_user
  USING (
    congregation_id IS NOT NULL
    AND member_private.member_portal_staff_can_review_congregation(congregation_id)
  );

-- Szándékosan NINCS INSERT / UPDATE / DELETE policy egyik tagi táblán sem.
-- A későbbi RPC-k SECURITY DEFINER + explicit authorization + tranzakció mellett
-- végzik majd az írást. A SELECT-only grant második védelmi réteg.

-- Fail-closed postflight még a COMMIT előtt. Bármely eltérés a teljes
-- migrációt visszagörgeti; nincs részlegesen telepített tagi adatmodell.
DO $$
DECLARE
  v_table text;
  v_role text;
  v_live_person_index_columns text[];
  v_policy_names text[];
  v_trigger_names text[];
  v_index_columns text[];
  v_predicate text;
  v_index_expression text;
  v_child_columns text[];
  v_parent_columns text[];
  v_fk_update "char";
  v_fk_delete "char";
  r record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'member_accounts',
    'member_congregation_applications',
    'member_person_links',
    'member_portal_audit_log'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity
        AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) THEN
      RAISE EXCEPTION 'Hiányzó vagy RLS nélküli tagi tábla: public.%', v_table;
    END IF;

    FOREACH v_role IN ARRAY ARRAY[
      'anon',
      'authenticated',
      'app_pending_user',
      'member_portal_user',
      'app_staff_user',
      'service_role'
    ]::text[]
    LOOP
      IF pg_catalog.has_table_privilege(
        v_role,
        pg_catalog.format('public.%I', v_table),
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN
        RAISE EXCEPTION 'Tiltott közvetlen írási grant: role=%, table=public.%', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF pg_catalog.has_table_privilege(
       'app_pending_user', 'public.member_accounts', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.member_accounts', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.member_accounts', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'A pending/authenticated/anon szerepkör tagi tábla-SELECT jogot kapott.';
  END IF;

  SELECT pg_catalog.array_agg(a.attname ORDER BY keys.ordinality)
    INTO v_live_person_index_columns
    FROM pg_catalog.pg_index i
    CROSS JOIN LATERAL pg_catalog.unnest(i.indkey)
      WITH ORDINALITY AS keys(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = keys.attnum
   WHERE i.indexrelid = pg_catalog.to_regclass(
     'public.member_person_links_one_live_per_person_idx'
   )
     AND i.indisunique
     AND i.indisvalid;

  IF v_live_person_index_columns IS DISTINCT FROM ARRAY['person_id']::text[] THEN
    RAISE EXCEPTION 'Az egy élő fiók / személy egyediségi index hibás vagy hiányzik.';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
       'member_portal_user', 'public.member_accounts', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'member_portal_user', 'public.member_congregation_applications', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'member_portal_user', 'public.member_person_links', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'member_portal_user', 'public.member_portal_audit_log', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'app_staff_user', 'public.member_accounts', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'app_staff_user', 'public.member_congregation_applications', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'app_staff_user', 'public.member_person_links', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'app_staff_user', 'public.member_portal_audit_log', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'A minimális tag/staff olvasási grantok hiányoznak.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'member_accounts',
        'member_congregation_applications',
        'member_person_links',
        'member_portal_audit_log'
      )
      AND acl.grantee <> c.relowner
      AND NOT (
        acl.privilege_type = 'SELECT'
        AND NOT acl.is_grantable
        AND (
          grantee.rolname IS NOT DISTINCT FROM 'app_staff_user'
          OR (
            grantee.rolname IS NOT DISTINCT FROM 'member_portal_user'
            AND c.relname <> 'member_portal_audit_log'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Váratlan közvetlen tagi tábla-ACL maradt.';
  END IF;

  -- A négy új táblán pontosan a hét ismert, szűk SELECT policy lehet.
  SELECT pg_catalog.array_agg(
           p.tablename || '.' || p.policyname
           ORDER BY p.tablename, p.policyname
         )
    INTO v_policy_names
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN (
      'member_accounts',
      'member_congregation_applications',
      'member_person_links',
      'member_portal_audit_log'
    );

  IF v_policy_names IS DISTINCT FROM ARRAY[
    'member_accounts.member_accounts_select_review_staff',
    'member_accounts.member_accounts_select_self',
    'member_congregation_applications.member_applications_select_review_staff',
    'member_congregation_applications.member_applications_select_self',
    'member_person_links.member_person_links_select_review_staff',
    'member_person_links.member_person_links_select_self',
    'member_portal_audit_log.member_portal_audit_select_review_staff'
  ]::text[] THEN
    RAISE EXCEPTION 'A tagi RLS policy allowlist eltér: %', v_policy_names;
  END IF;

  IF EXISTS (
    WITH expected(tablename, policyname, roles) AS (
      VALUES
        ('member_accounts', 'member_accounts_select_review_staff', ARRAY['app_staff_user']::text[]),
        ('member_accounts', 'member_accounts_select_self', ARRAY['app_staff_user', 'member_portal_user']::text[]),
        ('member_congregation_applications', 'member_applications_select_review_staff', ARRAY['app_staff_user']::text[]),
        ('member_congregation_applications', 'member_applications_select_self', ARRAY['app_staff_user', 'member_portal_user']::text[]),
        ('member_person_links', 'member_person_links_select_review_staff', ARRAY['app_staff_user']::text[]),
        ('member_person_links', 'member_person_links_select_self', ARRAY['app_staff_user', 'member_portal_user']::text[]),
        ('member_portal_audit_log', 'member_portal_audit_select_review_staff', ARRAY['app_staff_user']::text[])
    )
    SELECT 1
    FROM expected e
    LEFT JOIN pg_catalog.pg_policies p
      ON p.schemaname = 'public'
     AND p.tablename = e.tablename
     AND p.policyname = e.policyname
    WHERE p.policyname IS NULL
       OR p.cmd <> 'SELECT'
       OR p.permissive <> 'PERMISSIVE'
       OR p.with_check IS NOT NULL
       OR COALESCE(pg_catalog.btrim(p.qual), '') IN ('', 'true', '(true)')
       OR ARRAY(
         SELECT role_name::text
         FROM pg_catalog.unnest(p.roles) role_name
         ORDER BY role_name::text
       ) IS DISTINCT FROM e.roles
  ) THEN
    RAISE EXCEPTION 'A tagi RLS policy role/cmd/qual modell eltér.';
  END IF;

  -- Mindhárom workflow partial UNIQUE index kulcsa és predikátuma exact.
  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'member_applications_one_open_per_account_idx'::text,
        'public.member_congregation_applications'::regclass,
        ARRAY['member_account_id']::text[],
        'status=ANY(ARRAY[''pending_email''::text,''pending_review''::text])'::text
      ),
      (
        'member_person_links_one_live_per_account_idx'::text,
        'public.member_person_links'::regclass,
        ARRAY['member_account_id']::text[],
        'status=ANY(ARRAY[''active''::text,''suspended''::text])'::text
      ),
      (
        'member_person_links_one_live_per_person_idx'::text,
        'public.member_person_links'::regclass,
        ARRAY['person_id']::text[],
        'status=ANY(ARRAY[''active''::text,''suspended''::text])'::text
      )
    ) AS expected(index_name, table_oid, key_columns, predicate)
  LOOP
    SELECT pg_catalog.regexp_replace(
             pg_catalog.pg_get_expr(i.indpred, i.indrelid),
             '[[:space:]]+',
             '',
             'g'
           )
      INTO v_predicate
    FROM pg_catalog.pg_index i
    WHERE i.indexrelid = pg_catalog.to_regclass('public.' || r.index_name)
      AND i.indrelid = r.table_oid
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indexprs IS NULL;

    IF NOT FOUND OR v_predicate IS NULL THEN
      RAISE EXCEPTION 'Hiányzó/hibás workflow unique index: %', r.index_name;
    END IF;

    IF pg_catalog.left(v_predicate, 1) = '('
       AND pg_catalog.right(v_predicate, 1) = ')' THEN
      v_predicate := SUBSTRING(
        v_predicate FROM 2 FOR pg_catalog.char_length(v_predicate) - 2
      );
    END IF;

    SELECT pg_catalog.array_agg(a.attname ORDER BY keys.ordinality)
      INTO v_index_columns
    FROM pg_catalog.pg_index i
    CROSS JOIN LATERAL pg_catalog.unnest(i.indkey)
      WITH ORDINALITY AS keys(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = keys.attnum
    WHERE i.indexrelid = pg_catalog.to_regclass('public.' || r.index_name);

    IF v_index_columns IS DISTINCT FROM r.key_columns
       OR v_predicate IS DISTINCT FROM r.predicate THEN
      RAISE EXCEPTION
        'Workflow index drift: %, columns=%, predicate=%',
        r.index_name,
        v_index_columns,
        v_predicate;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_expr(i.indexprs, i.indrelid)
    INTO v_index_expression
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = 'public.member_accounts_email_unique_idx'::regclass
    AND i.indrelid = 'public.member_accounts'::regclass
    AND i.indisunique
    AND i.indisvalid
    AND i.indisready
    AND i.indpred IS NULL
    AND i.indnkeyatts = 1;

  IF v_index_expression IS DISTINCT FROM 'lower(email)' THEN
    RAISE EXCEPTION 'A normalizált member email unique index eltér: %', v_index_expression;
  END IF;

  -- A történeti person FK-t és a csak élő linkre érvényes tenant-FK-t külön,
  -- OID/column/action szinten ellenőrizzük.
  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'member_person_links_person_fkey'::text,
        ARRAY['person_id']::text[],
        ARRAY['id']::text[]
      ),
      (
        'member_person_links_live_person_tenant_fkey'::text,
        ARRAY['live_person_id', 'live_congregation_id']::text[],
        ARRAY['id', 'congregation_id']::text[]
      )
    ) AS expected(constraint_name, child_columns, parent_columns)
  LOOP
    SELECT
      ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ORDER BY k.ordinality
      ),
      ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = c.confrelid AND a.attnum = k.attnum
        ORDER BY k.ordinality
      ),
      c.confupdtype,
      c.confdeltype
      INTO v_child_columns, v_parent_columns, v_fk_update, v_fk_delete
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.member_person_links'::regclass
      AND c.confrelid = 'public.szemely'::regclass
      AND c.conname = r.constraint_name
      AND c.contype = 'f'
      AND c.convalidated;

    IF v_child_columns IS DISTINCT FROM r.child_columns
       OR v_parent_columns IS DISTINCT FROM r.parent_columns
       OR v_fk_update <> 'r'
       OR v_fk_delete <> 'r' THEN
      RAISE EXCEPTION
        'A person-link FK katalógusmodellje eltér: name=%, child=%, parent=%, update=%, delete=%',
        r.constraint_name,
        v_child_columns,
        v_parent_columns,
        v_fk_update,
        v_fk_delete;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.member_person_links'::regclass
      AND a.attname IN ('live_person_id', 'live_congregation_id')
      AND a.attgenerated = 's'
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) LIKE '%status%'
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) LIKE '%active%'
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) LIKE '%suspended%'
      AND (
        (a.attname = 'live_person_id'
          AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) LIKE '%person_id%')
        OR (a.attname = 'live_congregation_id'
          AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) LIKE '%congregation_id%')
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'Az élő személy-tenant generated guard oszlopok drifteltek.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.szemely'::regclass
      AND c.conname = 'szemely_member_portal_identity_tenant_key'
      AND c.contype = 'u'
      AND c.convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.szemely'::regclass
      AND a.attname = 'congregation_id'
      AND a.attnotnull
  ) THEN
    RAISE EXCEPTION 'A szemely tenant UNIQUE/NOT NULL alap hiányzik.';
  END IF;

  -- Exact trigger allowlist, benne a két deferred constraint triggerrel.
  SELECT pg_catalog.array_agg(t.tgname ORDER BY t.tgname)
    INTO v_trigger_names
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgrelid IN (
      'public.member_accounts'::regclass,
      'public.member_congregation_applications'::regclass,
      'public.member_person_links'::regclass,
      'public.member_portal_audit_log'::regclass
    );

  IF v_trigger_names IS DISTINCT FROM ARRAY[
    'member_accounts_10_transition_guard',
    'member_accounts_90_touch',
    'member_accounts_audit',
    'member_applications_05_integrity_guard',
    'member_applications_10_transition_guard',
    'member_applications_90_touch',
    'member_applications_approved_link_required',
    'member_applications_audit',
    'member_links_approved_application_required',
    'member_person_links_10_integrity_guard',
    'member_person_links_20_transition_guard',
    'member_person_links_90_touch',
    'member_person_links_audit',
    'member_portal_audit_immutable_rows',
    'member_portal_audit_no_truncate'
  ]::text[] THEN
    RAISE EXCEPTION 'A tagi trigger allowlist eltér: %', v_trigger_names;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'public.szemely'::regclass
      AND t.tgname = 'member_portal_szemely_lifecycle_guard'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
      AND t.tgtype = 27
      AND t.tgfoid =
        'member_private.member_person_record_lifecycle_guard()'::regprocedure::oid
      AND ARRAY(
        SELECT a.attname
        FROM pg_catalog.unnest(t.tgattr) x(attnum)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = t.tgrelid AND a.attnum = x.attnum
        ORDER BY a.attname
      ) = ARRAY['congregation_id', 'isvisible', 'member_status']::text[]
  ) THEN
    RAISE EXCEPTION 'A szemely portál-életciklus trigger exact modellje eltér.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    WHERE NOT t.tgisinternal
      AND t.tgrelid IN (
        'public.member_congregation_applications'::regclass,
        'public.member_person_links'::regclass
      )
      AND t.tgname IN (
        'member_applications_approved_link_required',
        'member_links_approved_application_required'
      )
      AND t.tgdeferrable
      AND t.tginitdeferred
  ) <> 2 THEN
    RAISE EXCEPTION 'Az approved-application constraint triggerek nem deferred-ek.';
  END IF;

  -- A member_private séma és minden függvénye pontos owner/ACL/search_path
  -- modellben jött létre; ismeretlen role nem kaphatott EXECUTE-ot.
  IF NOT pg_catalog.has_schema_privilege(
       'app_staff_user', 'member_private', 'USAGE'
     )
     OR NOT pg_catalog.has_schema_privilege(
       'service_role', 'member_private', 'USAGE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_namespace n
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
       ) acl
       LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = 'member_private'
         AND acl.grantee <> n.nspowner
         AND NOT (
           acl.privilege_type = 'USAGE'
           AND NOT acl.is_grantable
           AND COALESCE(
             grantee.rolname IN ('app_staff_user', 'service_role'),
             false
           )
         )
     ) THEN
    RAISE EXCEPTION 'A member_private schema exact ACL-modellje eltér.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'member_private'
      AND (
        pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg IN ('search_path=', 'search_path=""')
        )
        OR p.prosecdef IS DISTINCT FROM (
          p.proname IN (
            'member_portal_staff_can_review_congregation',
            'member_portal_staff_can_read_account',
            'member_account_transition_guard',
            'member_application_integrity_guard',
            'member_person_link_integrity_guard',
            'member_person_record_lifecycle_guard',
            'member_portal_log_change',
            'member_approved_application_link_guard'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'A member_private function owner/security/search_path modell eltér.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'member_private'
  ) <> 12 THEN
    RAISE EXCEPTION 'A member_private függvénydarabszám eltér.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'member_private'
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND NOT (
        p.proname IN (
          'member_portal_staff_can_review_congregation',
          'member_portal_staff_can_read_account'
        )
        AND COALESCE(
          grantee.rolname IN ('app_staff_user', 'service_role'),
          false
        )
        AND NOT acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'Váratlan member_private function EXECUTE grantee maradt.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
      AND n.nspname = 'member_private'
      AND d.defaclobjtype = 'f'
      AND acl.grantee <> d.defaclrole
  ) THEN
    RAISE EXCEPTION 'Váratlan member_private default function ACL maradt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.member_portal_audit_log'::regclass
      AND c.conname = 'member_portal_audit_details_pii_guard_check'
      AND c.contype = 'c'
      AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'A tagi audit PII guard hiányzik vagy nincs validálva.';
  END IF;

  -- Tényleges kereszt-tábla invariánsok is rollbackelő assertok.
  IF EXISTS (
    SELECT 1
    FROM public.member_person_links l
    JOIN public.member_accounts ma ON ma.id = l.member_account_id
    WHERE (l.status = 'active' AND ma.status <> 'active')
       OR (l.status IN ('active', 'suspended') AND ma.status = 'deleted')
  )
  OR EXISTS (
    SELECT 1
    FROM public.member_congregation_applications a
    LEFT JOIN public.member_person_links l ON l.application_id = a.id
    WHERE a.status = 'approved'
    GROUP BY a.id
    HAVING count(l.id) <> 1
  )
  OR EXISTS (
    SELECT 1
    FROM public.member_person_links l
    JOIN public.member_congregation_applications a ON a.id = l.application_id
    JOIN public.szemely s ON s.id = l.person_id
    WHERE a.status <> 'approved'
       OR a.member_account_id IS DISTINCT FROM l.member_account_id
       OR a.congregation_id IS DISTINCT FROM l.congregation_id
       OR (
         l.status IN ('active', 'suspended')
         AND s.congregation_id IS DISTINCT FROM l.congregation_id
       )
  ) THEN
    RAISE EXCEPTION 'A tagi account/application/link kereszt-tábla invariáns eltér.';
  END IF;
END
$$;

COMMIT;

-- --------------------------------------------------------------------------
-- 11. Read-only telepítési ellenőrzés — egy eredményhalmaz
-- --------------------------------------------------------------------------

WITH expected_tables(table_name) AS (
  VALUES
    ('member_accounts'::text),
    ('member_congregation_applications'::text),
    ('member_person_links'::text),
    ('member_portal_audit_log'::text)
),
table_state AS (
  SELECT
    e.table_name,
    to_regclass('public.' || e.table_name) IS NOT NULL AS exists,
    COALESCE(c.relrowsecurity, false) AS rls_enabled
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass('public.' || e.table_name)
),
write_grants AS (
  SELECT
    count(*) FILTER (
      WHERE g.grantee = 'authenticated'
        AND g.privilege_type IN (
          'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        )
    )::integer AS authenticated_count,
    count(*) FILTER (
      WHERE g.grantee = 'service_role'
        AND g.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    )::integer AS service_role_excess_count
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.table_name IN (
      'member_accounts',
      'member_congregation_applications',
      'member_person_links',
      'member_portal_audit_log'
    )
),
security_definers AS (
  SELECT
    count(*) FILTER (WHERE p.prosecdef)::integer AS definer_count,
    count(*) FILTER (
      WHERE p.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE cfg = 'search_path=' OR cfg = 'search_path=""'
        )
    )::integer AS pinned_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'member_private'
    AND p.proname IN (
      'member_portal_staff_can_review_congregation',
      'member_portal_staff_can_read_account',
      'member_account_transition_guard',
      'member_application_integrity_guard',
      'member_person_link_integrity_guard',
      'member_person_record_lifecycle_guard',
      'member_portal_log_change'
    )
),
private_schema_privileges AS (
  SELECT
    has_schema_privilege('authenticated', 'member_private', 'USAGE')
      AS authenticated_has_usage,
    has_schema_privilege('service_role', 'member_private', 'USAGE')
      AS service_role_has_usage
),
audit_protection AS (
  SELECT
    has_table_privilege(
      'service_role',
      'public.member_portal_audit_log',
      'INSERT'
    ) AS service_role_can_insert,
    has_table_privilege(
      'service_role',
      'public.member_portal_audit_log',
      'UPDATE'
    ) AS service_role_can_update,
    has_table_privilege(
      'service_role',
      'public.member_portal_audit_log',
      'DELETE'
    ) AS service_role_can_delete,
    has_table_privilege(
      'service_role',
      'public.member_portal_audit_log',
      'TRUNCATE'
    ) AS service_role_can_truncate,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.member_portal_audit_log'::regclass
        AND c.conname = 'member_portal_audit_details_pii_guard_check'
        AND c.contype = 'c'
        AND c.convalidated
    ) AS pii_guard_validated,
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgrelid = 'public.member_portal_audit_log'::regclass
        AND t.tgname IN (
          'member_portal_audit_immutable_rows',
          'member_portal_audit_no_truncate'
        )
    ) AS append_only_trigger_count
),
account_link_invariants AS (
  SELECT
    count(*) FILTER (
      WHERE l.status = 'active'
        AND ma.status <> 'active'
    )::integer AS active_link_without_active_account_count,
    count(*) FILTER (
      WHERE l.status IN ('active', 'suspended')
        AND ma.status = 'deleted'
    )::integer AS live_link_on_deleted_account_count
  FROM public.member_person_links l
  JOIN public.member_accounts ma
    ON ma.id = l.member_account_id
)
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', table_name,
        'exists', exists,
        'rls_enabled', rls_enabled
      )
      ORDER BY table_name
    )
    FROM table_state
  ),
  'authenticated_write_grants',
    (SELECT authenticated_count FROM write_grants),
  'service_role_excess_grants',
    (SELECT service_role_excess_count FROM write_grants),
  'select_policy_count', (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'member_accounts',
        'member_congregation_applications',
        'member_person_links',
        'member_portal_audit_log'
      )
      AND cmd = 'SELECT'
  ),
  'trigger_count', (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    WHERE NOT t.tgisinternal
      AND t.tgrelid IN (
        'public.member_accounts'::regclass,
        'public.member_congregation_applications'::regclass,
        'public.member_person_links'::regclass
      )
  ),
  'security_definer_count', (SELECT definer_count FROM security_definers),
  'security_definer_empty_search_path_count', (SELECT pinned_count FROM security_definers),
  'authenticated_member_private_schema_usage',
    (SELECT authenticated_has_usage FROM private_schema_privileges),
  'service_role_member_private_schema_usage',
    (SELECT service_role_has_usage FROM private_schema_privileges),
  'audit_service_role_can_insert',
    (SELECT service_role_can_insert FROM audit_protection),
  'audit_service_role_can_update',
    (SELECT service_role_can_update FROM audit_protection),
  'audit_service_role_can_delete',
    (SELECT service_role_can_delete FROM audit_protection),
  'audit_service_role_can_truncate',
    (SELECT service_role_can_truncate FROM audit_protection),
  'audit_details_pii_guard_validated',
    (SELECT pii_guard_validated FROM audit_protection),
  'audit_append_only_trigger_count',
    (SELECT append_only_trigger_count FROM audit_protection),
  'active_link_without_active_account_count',
    (SELECT active_link_without_active_account_count FROM account_link_invariants),
  'live_link_on_deleted_account_count',
    (SELECT live_link_on_deleted_account_count FROM account_link_invariants)
) AS member_portal_core_verification;
