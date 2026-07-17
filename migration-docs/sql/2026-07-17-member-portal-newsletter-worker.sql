-- REVIEW-DRAFT -- MEG NE FUTTASD ELES ADATBAZISON.
-- 2026-07-17 -- Tagi portal: hirlevel-kuldo worker protokoll
--
-- Kotelezo elozmeny:
--   2026-07-17-member-portal-data-and-newsletters.sql
--
-- Biztonsagi szerzodes:
--   * a worker RPC-kat kizarolag service_role hivhatja;
--   * a queue claim FOR UPDATE SKIP LOCKED alapu, rovid lejaratu lease-szel;
--   * minden claim egyedi tokenje megakadalyozza, hogy egy regi worker irjon felul
--     egy ujabb claimet;
--   * a complete/retry RPC ugyanazzal a tokennel idempotensen ujrahivhato;
--   * kozvetlen tabla-DML tovabbra sem kap grantot a service_role;
--   * a protokoll at-least-once. Ha a provider elfogadta a levelet, de a worker a
--     complete RPC elott megszakad, a lease lejarta utan ritkan duplikalt level
--     keletkezhet. Provider-oldali idempotenciakulcs nelkul exactly-once nem
--     garantalhato.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '5min';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- --------------------------------------------------------------------------
-- 0. Fail-closed preflight
-- --------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_column text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Tagi newsletter worker: csak postgres SQL Editor szereppel futtathato; current_user=%',
      current_user;
  END IF;

  IF pg_catalog.to_regprocedure(
       'member_private.member_portal_data_version()'
     ) IS NULL
     OR member_private.member_portal_data_version()
          IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1'
     OR pg_catalog.obj_description(
          'member_private.member_portal_data_version()'::regprocedure,
          'pg_proc'
        ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DATA_AND_NEWSLETTERS_V1' THEN
    RAISE EXCEPTION 'A tagi data/newsletter V1 marker hianyzik vagy driftelt.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.member_portal_worker_claim_newsletter_deliveries(integer,integer,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.member_portal_worker_complete_newsletter_delivery(uuid,uuid,text,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.member_portal_worker_retry_newsletter_delivery(uuid,uuid,text,text,integer,integer)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'member_private.member_portal_newsletter_refresh_campaign(uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'member_private.member_portal_newsletter_worker_version()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'A newsletter worker RPC-k vagy private helperek mar leteznek.';
  END IF;

  FOREACH v_column IN ARRAY ARRAY[
    'attempt_count',
    'next_attempt_at',
    'last_attempt_at',
    'claim_token',
    'last_claim_token',
    'processing_started_at',
    'lease_expires_at',
    'sent_at',
    'failed_at',
    'last_provider',
    'provider_message_id',
    'last_error'
  ]::text[]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.member_newsletter_deliveries'::regclass
        AND a.attname = v_column
        AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Varatlan newsletter delivery worker oszlop: %', v_column;
    END IF;
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY[
    'delivery_sent_count',
    'delivery_failed_count',
    'delivery_cancelled_count',
    'delivery_started_at',
    'delivery_completed_at'
  ]::text[]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.member_newsletter_campaigns'::regclass
        AND a.attname = v_column
        AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Varatlan newsletter campaign worker oszlop: %', v_column;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass(
       'public.member_newsletter_deliveries_worker_due_idx'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public.member_newsletter_deliveries_worker_lease_idx'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'A newsletter worker indexek mar leteznek.';
  END IF;
END;
$preflight$;

-- --------------------------------------------------------------------------
-- 1. Worker allapotmezok es szigoru state CHECK-ek
-- --------------------------------------------------------------------------

ALTER TABLE public.member_newsletter_campaigns
  ADD COLUMN delivery_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN delivery_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN delivery_cancelled_count integer NOT NULL DEFAULT 0,
  ADD COLUMN delivery_started_at timestamptz,
  ADD COLUMN delivery_completed_at timestamptz;

ALTER TABLE public.member_newsletter_deliveries
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN claim_token uuid,
  ADD COLUMN last_claim_token uuid,
  ADD COLUMN processing_started_at timestamptz,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN last_provider text,
  ADD COLUMN provider_message_id text,
  ADD COLUMN last_error text;

-- A V1 guard kizárólag queued -> cancelled kliensátmenetet enged. A következő
-- egyszeri backfill ezért a tranzakción belül, a guard ideiglenes levétele
-- mellett fut; hiba esetén a teljes tranzakció a triggerrel együtt rollbackel.
DROP TRIGGER member_newsletter_deliveries_10_guard
  ON public.member_newsletter_deliveries;

UPDATE public.member_newsletter_deliveries
SET next_attempt_at = queued_at
WHERE delivery_status = 'queued';

ALTER TABLE public.member_newsletter_deliveries
  ALTER COLUMN next_attempt_at SET DEFAULT statement_timestamp();

ALTER TABLE public.member_newsletter_campaigns
  DROP CONSTRAINT member_newsletter_campaigns_status_check,
  DROP CONSTRAINT member_newsletter_campaigns_state_check,
  ADD CONSTRAINT member_newsletter_campaigns_status_check
    CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  ADD CONSTRAINT member_newsletter_campaigns_delivery_count_check
    CHECK (
      delivery_sent_count >= 0
      AND delivery_failed_count >= 0
      AND delivery_cancelled_count >= 0
      AND (
        recipient_snapshot_count IS NULL
        OR delivery_sent_count + delivery_failed_count + delivery_cancelled_count
             <= recipient_snapshot_count
      )
    ),
  ADD CONSTRAINT member_newsletter_campaigns_state_check
    CHECK (
      (
        status = 'draft'
        AND recipient_snapshot_count IS NULL
        AND queued_at IS NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
        AND delivery_sent_count = 0
        AND delivery_failed_count = 0
        AND delivery_cancelled_count = 0
        AND delivery_started_at IS NULL
        AND delivery_completed_at IS NULL
      )
      OR (
        status = 'queued'
        AND recipient_snapshot_count IS NOT NULL
        AND queued_at IS NOT NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
        AND delivery_sent_count = 0
        AND delivery_failed_count = 0
        AND delivery_cancelled_count = 0
        AND delivery_started_at IS NULL
        AND delivery_completed_at IS NULL
      )
      OR (
        status = 'sending'
        AND recipient_snapshot_count IS NOT NULL
        AND queued_at IS NOT NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
        AND delivery_started_at IS NOT NULL
        AND delivery_completed_at IS NULL
      )
      OR (
        status = 'sent'
        AND recipient_snapshot_count IS NOT NULL
        AND queued_at IS NOT NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
        AND delivery_failed_count = 0
        AND delivery_sent_count + delivery_cancelled_count
              = recipient_snapshot_count
        AND delivery_started_at IS NOT NULL
        AND delivery_completed_at IS NOT NULL
      )
      OR (
        status = 'failed'
        AND recipient_snapshot_count IS NOT NULL
        AND queued_at IS NOT NULL
        AND cancelled_at IS NULL
        AND cancellation_reason IS NULL
        AND delivery_failed_count > 0
        AND delivery_sent_count + delivery_failed_count + delivery_cancelled_count
              = recipient_snapshot_count
        AND delivery_started_at IS NOT NULL
        AND delivery_completed_at IS NOT NULL
      )
      OR (
        status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND delivery_sent_count = 0
        AND delivery_failed_count = 0
        AND delivery_cancelled_count = COALESCE(recipient_snapshot_count, 0)
        AND delivery_started_at IS NULL
        AND delivery_completed_at IS NULL
      )
    );

ALTER TABLE public.member_newsletter_deliveries
  DROP CONSTRAINT member_newsletter_deliveries_status_check,
  DROP CONSTRAINT member_newsletter_deliveries_state_check,
  ADD CONSTRAINT member_newsletter_deliveries_status_check
    CHECK (delivery_status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  ADD CONSTRAINT member_newsletter_deliveries_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND 100),
  ADD CONSTRAINT member_newsletter_deliveries_provider_check
    CHECK (last_provider IS NULL OR last_provider IN ('brevo', 'resend', 'disabled')),
  ADD CONSTRAINT member_newsletter_deliveries_provider_message_check
    CHECK (
      provider_message_id IS NULL
      OR char_length(provider_message_id) BETWEEN 1 AND 512
    ),
  ADD CONSTRAINT member_newsletter_deliveries_last_error_check
    CHECK (last_error IS NULL OR char_length(last_error) BETWEEN 1 AND 1000),
  ADD CONSTRAINT member_newsletter_deliveries_state_check
    CHECK (
      (
        delivery_status = 'queued'
        AND next_attempt_at IS NOT NULL
        AND claim_token IS NULL
        AND processing_started_at IS NULL
        AND lease_expires_at IS NULL
        AND sent_at IS NULL
        AND failed_at IS NULL
        AND cancelled_at IS NULL
        AND provider_message_id IS NULL
      )
      OR (
        delivery_status = 'processing'
        AND attempt_count > 0
        AND next_attempt_at IS NULL
        AND last_attempt_at IS NOT NULL
        AND claim_token IS NOT NULL
        AND processing_started_at IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND sent_at IS NULL
        AND failed_at IS NULL
        AND cancelled_at IS NULL
        AND provider_message_id IS NULL
      )
      OR (
        delivery_status = 'sent'
        AND attempt_count > 0
        AND next_attempt_at IS NULL
        AND claim_token IS NULL
        AND processing_started_at IS NULL
        AND lease_expires_at IS NULL
        AND sent_at IS NOT NULL
        AND failed_at IS NULL
        AND cancelled_at IS NULL
        AND last_provider IN ('brevo', 'resend')
      )
      OR (
        delivery_status = 'failed'
        AND attempt_count > 0
        AND next_attempt_at IS NULL
        AND claim_token IS NULL
        AND processing_started_at IS NULL
        AND lease_expires_at IS NULL
        AND sent_at IS NULL
        AND failed_at IS NOT NULL
        AND cancelled_at IS NULL
        AND last_error IS NOT NULL
        AND provider_message_id IS NULL
      )
      OR (
        delivery_status = 'cancelled'
        AND next_attempt_at IS NULL
        AND claim_token IS NULL
        AND processing_started_at IS NULL
        AND lease_expires_at IS NULL
        AND sent_at IS NULL
        AND failed_at IS NULL
        AND cancelled_at IS NOT NULL
        AND provider_message_id IS NULL
      )
    );

COMMENT ON TABLE public.member_newsletter_deliveries IS
  'Kampanyonkenti recipient snapshot es at-least-once email queue. A service_role-only claim/complete/retry RPC kezeli; kozvetlen worker DML nincs.';

COMMENT ON COLUMN public.member_newsletter_deliveries.last_claim_token IS
  'Az utolso lezart claim tokenje. A complete/retry valaszvesztes utani idempotens ujrahivast teszi lehetove.';

CREATE INDEX member_newsletter_deliveries_worker_due_idx
  ON public.member_newsletter_deliveries (next_attempt_at, queued_at, id)
  WHERE delivery_status = 'queued';

CREATE INDEX member_newsletter_deliveries_worker_lease_idx
  ON public.member_newsletter_deliveries (lease_expires_at, id)
  WHERE delivery_status = 'processing';

-- --------------------------------------------------------------------------
-- 2. Guardok: lelkeszi queue/cancel es belso worker atmenetek szetvalasztasa
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION member_private.member_newsletter_campaign_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_worker boolean := COALESCE(
    pg_catalog.current_setting('kartoteka.newsletter_worker', true) = 'on',
    false
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
       OR NEW.created_by_profile_id IS DISTINCT FROM (SELECT auth.uid())
       OR NOT member_private.member_portal_staff_can_review_congregation(
         NEW.congregation_id
       ) THEN
      RAISE EXCEPTION 'Kampanyt csak exact sajat-gyulekezeti lelkesz hozhat letre draftkent.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id
     OR NEW.campaign_kind IS DISTINCT FROM OLD.campaign_kind
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A kampany identitasa es tartalma letrehozas utan nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  IF v_worker THEN
    IF NOT (
      (OLD.status = 'queued' AND NEW.status IN ('sending', 'sent'))
      OR (OLD.status = 'sending' AND NEW.status IN ('sending', 'sent', 'failed'))
    )
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
    OR NEW.recipient_snapshot_count IS DISTINCT FROM OLD.recipient_snapshot_count
    OR NEW.queued_at IS DISTINCT FROM OLD.queued_at THEN
      RAISE EXCEPTION 'Ervenytelen belso worker kampany-atmenet: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
       NEW.congregation_id
     ) THEN
    RAISE EXCEPTION 'A kampanyt csak exact sajat-gyulekezeti lelkesz allithatja.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.delivery_sent_count IS DISTINCT FROM OLD.delivery_sent_count
    OR NEW.delivery_failed_count IS DISTINCT FROM OLD.delivery_failed_count
     OR NEW.delivery_cancelled_count IS DISTINCT FROM OLD.delivery_cancelled_count
     OR NEW.delivery_started_at IS DISTINCT FROM OLD.delivery_started_at
     OR NEW.delivery_completed_at IS DISTINCT FROM OLD.delivery_completed_at
     OR NOT (
       (OLD.status = 'draft' AND NEW.status IN ('queued', 'cancelled'))
       OR (OLD.status = 'queued' AND NEW.status = 'cancelled')
     ) THEN
    RAISE EXCEPTION 'Ervenytelen lelkeszi kampany-atmenet: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NEW.recipient_snapshot_count IS DISTINCT FROM OLD.recipient_snapshot_count
       OR NEW.queued_at IS DISTINCT FROM OLD.queued_at THEN
      RAISE EXCEPTION 'Cancel soran a recipient snapshot metaadata nem modosithato.'
        USING ERRCODE = '23514';
    END IF;

    SELECT pg_catalog.count(*)::integer
      INTO NEW.delivery_cancelled_count
    FROM public.member_newsletter_deliveries d
    WHERE d.campaign_id = NEW.id
      AND d.delivery_status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION member_private.member_newsletter_delivery_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_campaign_congregation_id uuid;
  v_campaign_status text;
  v_worker boolean := COALESCE(
    pg_catalog.current_setting('kartoteka.newsletter_worker', true) = 'on',
    false
  );
BEGIN
  SELECT c.congregation_id, c.status
    INTO v_campaign_congregation_id, v_campaign_status
  FROM public.member_newsletter_campaigns c
  WHERE c.id = NEW.campaign_id;

  IF NOT FOUND
     OR v_campaign_congregation_id IS DISTINCT FROM NEW.congregation_id THEN
    RAISE EXCEPTION 'A delivery snapshot kampanya vagy tenantja elter.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.delivery_status <> 'queued'
       OR NOT member_private.member_portal_staff_can_review_congregation(
         NEW.congregation_id
       ) THEN
      RAISE EXCEPTION 'Uj delivery snapshotot csak exact lelkesz hozhat letre queued allapotban.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.member_account_id IS DISTINCT FROM OLD.member_account_id
     OR NEW.person_id_snapshot IS DISTINCT FROM OLD.person_id_snapshot
     OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.recipient_display_name IS DISTINCT FROM OLD.recipient_display_name
     OR NEW.preferred_locale IS DISTINCT FROM OLD.preferred_locale
     OR NEW.queued_at IS DISTINCT FROM OLD.queued_at THEN
    RAISE EXCEPTION 'A delivery recipient snapshot identitasa nem modosithato.'
      USING ERRCODE = '23514';
  END IF;

  IF v_worker THEN
    IF v_campaign_status NOT IN ('queued', 'sending')
       OR NOT (
         (OLD.delivery_status = 'queued' AND NEW.delivery_status IN (
           'processing', 'cancelled'
         ))
         OR (OLD.delivery_status = 'processing' AND NEW.delivery_status IN (
           'processing', 'queued', 'sent', 'failed', 'cancelled'
         ))
       )
       OR (
         NEW.delivery_status <> 'cancelled'
         AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       ) THEN
      RAISE EXCEPTION 'Ervenytelen belso worker delivery-atmenet: % -> %',
        OLD.delivery_status, NEW.delivery_status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT member_private.member_portal_staff_can_review_congregation(
       NEW.congregation_id
     )
     OR OLD.delivery_status <> 'queued'
     OR NEW.delivery_status <> 'cancelled'
     OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
     OR NEW.last_attempt_at IS DISTINCT FROM OLD.last_attempt_at
     OR NEW.claim_token IS DISTINCT FROM OLD.claim_token
     OR NEW.last_claim_token IS DISTINCT FROM OLD.last_claim_token
     OR NEW.processing_started_at IS DISTINCT FROM OLD.processing_started_at
     OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
     OR NEW.failed_at IS DISTINCT FROM OLD.failed_at
     OR NEW.last_provider IS DISTINCT FROM OLD.last_provider
     OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
     OR NEW.last_error IS DISTINCT FROM OLD.last_error THEN
    RAISE EXCEPTION 'A delivery snapshot lelkesz altal csak queued -> cancelled iranyban modosithato.'
      USING ERRCODE = '23514';
  END IF;

  -- A korabbi cancel RPC csak a statuszt es cancelled_at-ot irja. A worker
  -- protokoll next_attempt_at mezojet itt zarjuk le atomikusan.
  NEW.next_attempt_at := NULL;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER member_newsletter_deliveries_10_guard
  BEFORE INSERT OR UPDATE ON public.member_newsletter_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION member_private.member_newsletter_delivery_guard();

-- --------------------------------------------------------------------------
-- 3. Private kampany-aggregator es rollout marker
-- --------------------------------------------------------------------------

CREATE FUNCTION member_private.member_portal_newsletter_refresh_campaign(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_campaign public.member_newsletter_campaigns%ROWTYPE;
  v_sent integer;
  v_failed integer;
  v_cancelled integer;
  v_pending integer;
  v_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF pg_catalog.current_setting('kartoteka.newsletter_worker', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'A kampany-aggregator csak worker RPC-bol hivhato.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.*
    INTO v_campaign
  FROM public.member_newsletter_campaigns c
  WHERE c.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A worker kampany nem talalhato.' USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'campaign_id', v_campaign.id,
      'status', v_campaign.status,
      'sent', v_campaign.delivery_sent_count,
      'failed', v_campaign.delivery_failed_count
    );
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (WHERE d.delivery_status = 'sent')::integer,
    pg_catalog.count(*) FILTER (WHERE d.delivery_status = 'failed')::integer,
    pg_catalog.count(*) FILTER (WHERE d.delivery_status = 'cancelled')::integer,
    pg_catalog.count(*) FILTER (
      WHERE d.delivery_status IN ('queued', 'processing')
    )::integer
    INTO v_sent, v_failed, v_cancelled, v_pending
  FROM public.member_newsletter_deliveries d
  WHERE d.campaign_id = p_campaign_id;

  v_status := CASE
    WHEN v_pending > 0 THEN 'sending'
    WHEN v_failed > 0 THEN 'failed'
    ELSE 'sent'
  END;

  UPDATE public.member_newsletter_campaigns c
  SET status = v_status,
      delivery_sent_count = v_sent,
      delivery_failed_count = v_failed,
      delivery_cancelled_count = v_cancelled,
      delivery_started_at = COALESCE(c.delivery_started_at, v_now),
      delivery_completed_at = CASE
        WHEN v_pending = 0 THEN COALESCE(c.delivery_completed_at, v_now)
        ELSE NULL
      END
  WHERE c.id = p_campaign_id;

  RETURN pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', v_status,
    'sent', v_sent,
    'failed', v_failed,
    'cancelled', v_cancelled,
    'pending', v_pending
  );
END;
$function$;

CREATE FUNCTION member_private.member_portal_newsletter_worker_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT 'KARTOTEKA_MEMBER_PORTAL_NEWSLETTER_WORKER_V1'::text;
$function$;

COMMENT ON FUNCTION member_private.member_portal_newsletter_worker_version() IS
  'KARTOTEKA_MEMBER_PORTAL_NEWSLETTER_WORKER_V1';

REVOKE ALL ON FUNCTION member_private.member_portal_newsletter_refresh_campaign(uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION member_private.member_portal_newsletter_worker_version()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

-- --------------------------------------------------------------------------
-- 4. Service-role-only claim / complete / retry RPC-k
-- --------------------------------------------------------------------------

CREATE FUNCTION public.member_portal_worker_claim_newsletter_deliveries(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 900,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  delivery_id uuid,
  claim_token uuid,
  campaign_id uuid,
  campaign_kind text,
  subject text,
  body_text text,
  recipient_email text,
  recipient_display_name text,
  preferred_locale text,
  attempt_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_campaign_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'A newsletter claim RPC csak service_role workernek engedelyezett.'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit NOT BETWEEN 1 AND 25
     OR p_lease_seconds NOT BETWEEN 60 AND 1800 THEN
    RAISE EXCEPTION 'Ervenytelen worker claim limit vagy lease.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('kartoteka.newsletter_worker', 'on', true);

  -- A snapshot utan visszavont hozzajarulast a kuldes pillanataban is
  -- tiszteletben tartjuk. Az ilyen, meg nem claimelt sor terminalis cancelled
  -- allapotba kerul, es nem jut el az email providerhez.
  FOR v_campaign_id IN
    WITH cancelled AS (
      UPDATE public.member_newsletter_deliveries d
      SET delivery_status = 'cancelled',
          next_attempt_at = NULL,
          last_claim_token = d.claim_token,
          claim_token = NULL,
          processing_started_at = NULL,
          lease_expires_at = NULL,
          cancelled_at = v_now,
          last_error = 'recipient_no_longer_eligible',
          updated_at = v_now
      FROM public.member_newsletter_campaigns c
      WHERE c.id = d.campaign_id
        AND c.status IN ('queued', 'sending')
        AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
        AND (
          d.delivery_status = 'queued'
          OR (
            d.delivery_status = 'processing'
            AND d.lease_expires_at <= v_now
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.member_accounts ma
          JOIN public.member_newsletter_preferences pref
            ON pref.member_account_id = ma.id
           AND pref.email_opt_in = true
          JOIN public.member_person_links l
            ON l.member_account_id = ma.id
           AND l.person_id = d.person_id_snapshot
           AND l.congregation_id = d.congregation_id
           AND l.status = 'active'
          JOIN public.szemely s
            ON s.id = l.person_id
           AND s.congregation_id = l.congregation_id
           AND s.isvisible = true
          WHERE ma.id = d.member_account_id
            AND ma.status = 'active'
            AND ma.email_confirmed_at IS NOT NULL
            -- Queue utan megvaltozott Auth-emailre sem a regi, sem egy
            -- hallgatolagosan uj cimre nem kuldunk. A stale snapshot cancelled;
            -- az uj cim csak egy uj kampany pillanatkepebe kerulhet be.
            AND ma.email = d.recipient_email
            AND CASE c.campaign_kind
              WHEN 'announcements' THEN pref.announcements_opt_in
              WHEN 'events' THEN pref.events_opt_in
              ELSE true
            END
        )
      RETURNING d.campaign_id
    )
    SELECT DISTINCT x.campaign_id FROM cancelled x
  LOOP
    PERFORM member_private.member_portal_newsletter_refresh_campaign(v_campaign_id);
  END LOOP;

  -- A nulla cimzettes kampany ne maradjon orokke queued allapotban.
  UPDATE public.member_newsletter_campaigns c
  SET status = 'sent',
      delivery_sent_count = 0,
      delivery_failed_count = 0,
      delivery_started_at = v_now,
      delivery_completed_at = v_now
  WHERE c.status = 'queued'
    AND c.recipient_snapshot_count = 0
    AND (p_campaign_id IS NULL OR c.id = p_campaign_id);

  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.member_newsletter_deliveries d
    JOIN public.member_newsletter_campaigns c
      ON c.id = d.campaign_id
     AND c.status IN ('queued', 'sending')
     AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    JOIN public.member_accounts ma
      ON ma.id = d.member_account_id
     AND ma.status = 'active'
     AND ma.email_confirmed_at IS NOT NULL
     AND ma.email = d.recipient_email
    JOIN public.member_newsletter_preferences pref
      ON pref.member_account_id = ma.id
     AND pref.email_opt_in = true
    JOIN public.member_person_links l
      ON l.member_account_id = ma.id
     AND l.person_id = d.person_id_snapshot
     AND l.congregation_id = d.congregation_id
     AND l.status = 'active'
    JOIN public.szemely s
      ON s.id = l.person_id
     AND s.congregation_id = l.congregation_id
     AND s.isvisible = true
    WHERE (
      (
        d.delivery_status = 'queued'
        AND d.next_attempt_at <= v_now
      ) OR (
        d.delivery_status = 'processing'
        AND d.lease_expires_at <= v_now
      )
    )
    AND CASE c.campaign_kind
      WHEN 'announcements' THEN pref.announcements_opt_in
      WHEN 'events' THEN pref.events_opt_in
      ELSE true
    END
    ORDER BY
      CASE WHEN d.delivery_status = 'queued' THEN d.next_attempt_at
           ELSE d.lease_expires_at END,
      d.queued_at,
      d.id
    LIMIT p_limit
    FOR UPDATE OF d, c, pref SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.member_newsletter_deliveries d
    SET delivery_status = 'processing',
        attempt_count = d.attempt_count + 1,
        next_attempt_at = NULL,
        last_attempt_at = v_now,
        claim_token = pg_catalog.gen_random_uuid(),
        processing_started_at = v_now,
        lease_expires_at = v_now
          + pg_catalog.make_interval(secs => p_lease_seconds),
        sent_at = NULL,
        failed_at = NULL,
        provider_message_id = NULL,
        updated_at = v_now
    FROM candidates x
    WHERE d.id = x.id
    RETURNING d.*
  ),
  campaigns_started AS (
    UPDATE public.member_newsletter_campaigns c
    SET status = 'sending',
        delivery_started_at = COALESCE(c.delivery_started_at, v_now)
    WHERE c.id IN (SELECT DISTINCT d.campaign_id FROM claimed d)
      AND c.status = 'queued'
    RETURNING c.id
  )
  SELECT
    d.id,
    d.claim_token,
    d.campaign_id,
    c.campaign_kind,
    c.subject,
    c.body_text,
    d.recipient_email,
    d.recipient_display_name,
    d.preferred_locale,
    d.attempt_count
  FROM claimed d
  JOIN public.member_newsletter_campaigns c ON c.id = d.campaign_id
  LEFT JOIN campaigns_started started ON started.id = d.campaign_id
  ORDER BY d.queued_at, d.id;
END;
$function$;

CREATE FUNCTION public.member_portal_worker_complete_newsletter_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider text,
  p_provider_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_delivery public.member_newsletter_deliveries%ROWTYPE;
  v_provider text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_provider, '')));
  v_message_id text := NULLIF(
    pg_catalog.btrim(COALESCE(p_provider_message_id, '')),
    ''
  );
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_campaign jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'A newsletter complete RPC csak service_role workernek engedelyezett.'
      USING ERRCODE = '42501';
  END IF;

  IF p_delivery_id IS NULL
     OR p_claim_token IS NULL
     OR v_provider NOT IN ('brevo', 'resend')
     OR pg_catalog.char_length(v_message_id) > 512 THEN
    RAISE EXCEPTION 'Ervenytelen newsletter complete parameter.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('kartoteka.newsletter_worker', 'on', true);

  SELECT d.*
    INTO v_delivery
  FROM public.member_newsletter_deliveries d
  WHERE d.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A newsletter delivery nem talalhato.' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.delivery_status = 'sent'
     AND v_delivery.last_claim_token = p_claim_token THEN
    RETURN pg_catalog.jsonb_build_object(
      'delivery_id', v_delivery.id,
      'delivery_status', 'sent',
      'idempotent_replay', true
    );
  END IF;

  IF v_delivery.delivery_status <> 'processing'
     OR v_delivery.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'A newsletter completion claim tokenje elavult vagy elter.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.member_newsletter_deliveries d
  SET delivery_status = 'sent',
      next_attempt_at = NULL,
      last_claim_token = d.claim_token,
      claim_token = NULL,
      processing_started_at = NULL,
      lease_expires_at = NULL,
      sent_at = v_now,
      failed_at = NULL,
      last_provider = v_provider,
      provider_message_id = v_message_id,
      last_error = NULL,
      updated_at = v_now
  WHERE d.id = v_delivery.id;

  v_campaign := member_private.member_portal_newsletter_refresh_campaign(
    v_delivery.campaign_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'delivery_id', v_delivery.id,
    'delivery_status', 'sent',
    'idempotent_replay', false,
    'campaign', v_campaign
  );
END;
$function$;

CREATE FUNCTION public.member_portal_worker_retry_newsletter_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider text,
  p_error text,
  p_max_attempts integer DEFAULT 4,
  p_base_retry_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_delivery public.member_newsletter_deliveries%ROWTYPE;
  v_provider text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_provider, '')));
  v_error text := NULLIF(pg_catalog.btrim(COALESCE(p_error, '')), '');
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_next_attempt_at timestamptz;
  v_next_status text;
  v_delay_seconds integer;
  v_campaign jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'A newsletter retry RPC csak service_role workernek engedelyezett.'
      USING ERRCODE = '42501';
  END IF;

  IF p_delivery_id IS NULL
     OR p_claim_token IS NULL
     OR v_provider NOT IN ('brevo', 'resend', 'disabled')
     OR v_error IS NULL
     OR pg_catalog.char_length(v_error) > 1000
     OR p_max_attempts NOT BETWEEN 1 AND 10
     OR p_base_retry_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'Ervenytelen newsletter retry parameter.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('kartoteka.newsletter_worker', 'on', true);

  SELECT d.*
    INTO v_delivery
  FROM public.member_newsletter_deliveries d
  WHERE d.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A newsletter delivery nem talalhato.' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.delivery_status IN ('queued', 'failed', 'cancelled')
     AND v_delivery.last_claim_token = p_claim_token THEN
    RETURN pg_catalog.jsonb_build_object(
      'delivery_id', v_delivery.id,
      'delivery_status', v_delivery.delivery_status,
      'attempt_count', v_delivery.attempt_count,
      'next_attempt_at', v_delivery.next_attempt_at,
      'idempotent_replay', true
    );
  END IF;

  IF v_delivery.delivery_status <> 'processing'
     OR v_delivery.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'A newsletter retry claim tokenje elavult vagy elter.'
      USING ERRCODE = '40001';
  END IF;

  IF v_delivery.attempt_count >= p_max_attempts THEN
    v_next_status := 'failed';
    v_next_attempt_at := NULL;
  ELSE
    v_next_status := 'queued';
    v_delay_seconds := LEAST(
      21600,
      pg_catalog.round(
        p_base_retry_seconds::numeric
        * pg_catalog.power(
          2::numeric,
          GREATEST(v_delivery.attempt_count - 1, 0)
        )
      )::integer
    );
    v_next_attempt_at := v_now
      + pg_catalog.make_interval(secs => v_delay_seconds);
  END IF;

  UPDATE public.member_newsletter_deliveries d
  SET delivery_status = v_next_status,
      next_attempt_at = v_next_attempt_at,
      last_claim_token = d.claim_token,
      claim_token = NULL,
      processing_started_at = NULL,
      lease_expires_at = NULL,
      sent_at = NULL,
      failed_at = CASE WHEN v_next_status = 'failed' THEN v_now ELSE NULL END,
      last_provider = v_provider,
      provider_message_id = NULL,
      last_error = v_error,
      updated_at = v_now
  WHERE d.id = v_delivery.id;

  v_campaign := member_private.member_portal_newsletter_refresh_campaign(
    v_delivery.campaign_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'delivery_id', v_delivery.id,
    'delivery_status', v_next_status,
    'attempt_count', v_delivery.attempt_count,
    'next_attempt_at', v_next_attempt_at,
    'idempotent_replay', false,
    'campaign', v_campaign
  );
END;
$function$;

COMMENT ON FUNCTION public.member_portal_worker_claim_newsletter_deliveries(integer, integer, uuid) IS
  'Service-role-only atomikus newsletter claim FOR UPDATE SKIP LOCKED es lejarati lease hasznalataval; opcionlisan egy exact campaign_id-ra szukitheto.';
COMMENT ON FUNCTION public.member_portal_worker_complete_newsletter_delivery(uuid, uuid, text, text) IS
  'Service-role-only idempotens newsletter success completion provider message ID-val.';
COMMENT ON FUNCTION public.member_portal_worker_retry_newsletter_delivery(uuid, uuid, text, text, integer, integer) IS
  'Service-role-only idempotens retry/terminal failure exponential backoff-fal.';

REVOKE ALL ON FUNCTION public.member_portal_worker_claim_newsletter_deliveries(integer, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_worker_complete_newsletter_delivery(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.member_portal_worker_retry_newsletter_delivery(uuid, uuid, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

GRANT EXECUTE ON FUNCTION public.member_portal_worker_claim_newsletter_deliveries(integer, integer, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.member_portal_worker_complete_newsletter_delivery(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.member_portal_worker_retry_newsletter_delivery(uuid, uuid, text, text, integer, integer)
  TO service_role;

-- Kozvetlen tabla-DML tovabbra sem lehet worker API. A SECURITY DEFINER RPC
-- tulajdonosi joggal ir, minden mas szereplo csak a korabbi SELECT policy-kat
-- hasznalhatja.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.member_newsletter_campaigns, public.member_newsletter_deliveries
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
       app_pending_user, member_portal_user;

-- --------------------------------------------------------------------------
-- 5. Fail-closed postflight
-- --------------------------------------------------------------------------

DO $postflight$
DECLARE
  v_proc regprocedure;
BEGIN
  IF member_private.member_portal_newsletter_worker_version()
       IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_NEWSLETTER_WORKER_V1'
     OR pg_catalog.obj_description(
          'member_private.member_portal_newsletter_worker_version()'::regprocedure,
          'pg_proc'
        ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_NEWSLETTER_WORKER_V1' THEN
    RAISE EXCEPTION 'A newsletter worker rollout marker driftelt.';
  END IF;

  IF pg_catalog.to_regclass(
       'public.member_newsletter_deliveries_worker_due_idx'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public.member_newsletter_deliveries_worker_lease_idx'
     ) IS NULL THEN
    RAISE EXCEPTION 'A newsletter worker due/lease index hianyzik.';
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'public.member_portal_worker_claim_newsletter_deliveries(integer,integer,uuid)'::regprocedure,
    'public.member_portal_worker_complete_newsletter_delivery(uuid,uuid,text,text)'::regprocedure,
    'public.member_portal_worker_retry_newsletter_delivery(uuid,uuid,text,text,integer,integer)'::regprocedure
  ]::regprocedure[]
  LOOP
    IF NOT pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('app_staff_user', v_proc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('app_pending_user', v_proc, 'EXECUTE')
       OR pg_catalog.has_function_privilege('member_portal_user', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'A newsletter worker RPC ACL driftelt: %', v_proc;
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege(
       'service_role', 'public.member_newsletter_deliveries', 'INSERT,UPDATE,DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'service_role', 'public.member_newsletter_campaigns', 'INSERT,UPDATE,DELETE'
     ) THEN
    RAISE EXCEPTION 'A service_role varatlan kozvetlen newsletter DML-t kapott.';
  END IF;
END;
$postflight$;

COMMIT;

-- Read-only telepitesi ellenorzes
SELECT pg_catalog.jsonb_build_object(
  'marker', member_private.member_portal_newsletter_worker_version(),
  'queued', pg_catalog.count(*) FILTER (WHERE delivery_status = 'queued'),
  'processing', pg_catalog.count(*) FILTER (WHERE delivery_status = 'processing'),
  'sent', pg_catalog.count(*) FILTER (WHERE delivery_status = 'sent'),
  'failed', pg_catalog.count(*) FILTER (WHERE delivery_status = 'failed'),
  'cancelled', pg_catalog.count(*) FILTER (WHERE delivery_status = 'cancelled')
) AS member_portal_newsletter_worker_verification
FROM public.member_newsletter_deliveries;
