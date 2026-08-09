-- KARTOTEKA — Admin kereszt-gyülekezeti egyeztetési felület (2026-08-09)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél: a MÁR BENT LÉVŐ adatok kereszt-gyülekezeti egyeztetése + admin felület.
-- A 2026-04-26-os cross-congregation infrastruktúra (tábla + trigger + RPC-k)
-- csak az ÚJ rögzítéseknél/módosításoknál jelez — a korábban bevitt duplikátumok
-- soha nem kaptak értesítő-sort. Ez a migráció:
--
--   1. Bővíti a notification_type CHECK-et a 'retroactive_scan' értékkel
--      (a visszamenőleges átvizsgálás által talált párok jelölése).
--   2. Új oszlopok: admin_notified_at / admin_notified_by — az admin mikor
--      értesítette a két lelkészt (e-mail + app-értesítés).
--   3. admin_scan_cross_congregation_duplicates() — TELJES-ÁLLOMÁNY átvizsgálás:
--      set-alapú párkeresés (normalizált név + születési dátum VAGY telefon),
--      csak az erős egyezések (name_birth / name_phone), mindkét irányú
--      duplikátum-védelemmel. CSAK rendszergazda futtathatja.
--      ⚠️ A Teszt gyülekezet (7e570000-…-0003) KIZÁRVA — a benne lévő ~440
--      szándékos Barátosi-klón (id+631) különben elárasztaná a felületet.
--   4. admin_list_cross_congregation_matches() — az admin felület listája,
--      gazdagítva (nevek, gyülekezetek, szül. dátumok, lelkész-elérhetőségek).
--      Rendszergazda: minden; egyházkerületi admin: csak a saját kerülete
--      gyülekezeteit érintő párok.
--   5. admin_notify_cross_match_pastors() — app-értesítés a két lelkésznek
--      (SECURITY DEFINER ertesitesek-írás) + admin_notified pecsét a pár minden sorára.
--   6. admin_resolve_cross_match_pair() — döntés a pár MINDEN (tükör-)sorára.
--
-- Idempotens: CREATE OR REPLACE + IF NOT EXISTS.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. notification_type CHECK bővítése ('retroactive_scan')
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.cross_congregation_match_notifications
    DROP CONSTRAINT IF EXISTS cross_congregation_match_notifications_notification_type_check;

ALTER TABLE public.cross_congregation_match_notifications
    ADD CONSTRAINT cross_congregation_match_notifications_notification_type_check
    CHECK (notification_type IN ('new_member', 'update_match', 'retroactive_scan'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Admin-értesítés oszlopok
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.cross_congregation_match_notifications
    ADD COLUMN IF NOT EXISTS admin_notified_at timestamptz,
    ADD COLUMN IF NOT EXISTS admin_notified_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.cross_congregation_match_notifications.admin_notified_at IS
    'Mikor küldött az admin értesítést a két érintett lelkésznek (e-mail + app-értesítés).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Jogosultság-segédek (belső, nem GRANT-olt)
-- ────────────────────────────────────────────────────────────────────────────

-- Teljes (rendszer-szintű) admin?
CREATE OR REPLACE FUNCTION public.ccm_caller_is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $ccm_sysadmin$
    SELECT EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role = 'admin'
          AND pr.scope = 'system'
          AND pr.active = true
          AND pr.approval_status = 'approved'
    );
$ccm_sysadmin$;

-- A hívó egyházkerületi admin kerület-id-i (üres tömb, ha nem az).
-- Az app scope-modelljével azonosan (lib/auth/admin-scope.ts): a profile_roles
-- district-scope sorai + a profiles.district_id fallback UNION-ja.
CREATE OR REPLACE FUNCTION public.ccm_caller_district_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $ccm_districts$
    SELECT COALESCE(array_agg(DISTINCT s.district_id), '{}'::uuid[])
    FROM (
        SELECT pr.scope_id AS district_id
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role = 'egyhazkeruleti_admin'
          AND pr.scope = 'district'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.district_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'egyhazkeruleti_admin'
          AND p.district_id IS NOT NULL
    ) s;
$ccm_districts$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. admin_scan_cross_congregation_duplicates — teljes-állomány átvizsgálás
-- ────────────────────────────────────────────────────────────────────────────
--
-- Erős egyezések a MÁR BENT LÉVŐ adatok közt:
--   name_phone — normalizált teljes név + normalizált telefon egyezik
--   name_birth — normalizált teljes név + születési dátum egyezik
-- Gyenge (csak név / csak telefon) egyezést NEM rögzítünk (a triggerrel azonos
-- szabály) — azok csak az interaktív bevitelnél jelennek meg.
--
-- Duplikátum-védelem: ha a párra (bármelyik irányban, bármilyen confidence-szel)
-- MÁR van sor, nem szúrunk be újat.

CREATE OR REPLACE FUNCTION public.admin_scan_cross_congregation_duplicates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '120s'
AS $admin_scan$
DECLARE
    v_teszt_cong constant uuid := '7e570000-0000-4000-8000-000000000003';
    v_inserted integer := 0;
    v_total_open integer := 0;
BEGIN
    IF NOT public.ccm_caller_is_system_admin() THEN
        RAISE EXCEPTION 'Csak rendszergazda futtathatja a teljes-állomány átvizsgálást.';
    END IF;

    WITH candidates AS (
        SELECT
            a.id AS a_id,
            a.congregation_id AS a_cong,
            b.id AS b_id,
            b.congregation_id AS b_cong,
            CASE
                WHEN a.telefon IS NOT NULL AND b.telefon IS NOT NULL
                     AND public.normalize_phone(a.telefon) IS NOT NULL
                     AND public.normalize_phone(a.telefon) = public.normalize_phone(b.telefon)
                    THEN 'name_phone'
                ELSE 'name_birth'
            END AS confidence
        FROM public.szemely a
        JOIN public.szemely b
          ON a.id < b.id
         AND a.congregation_id IS DISTINCT FROM b.congregation_id
         AND public.normalize_name(COALESCE(a.csaladnev,'') || ' ' || COALESCE(a.k_nev,''))
             = public.normalize_name(COALESCE(b.csaladnev,'') || ' ' || COALESCE(b.k_nev,''))
         AND (
             (a.sz_datum IS NOT NULL AND a.sz_datum = b.sz_datum)
             OR (
                 a.telefon IS NOT NULL AND b.telefon IS NOT NULL
                 AND public.normalize_phone(a.telefon) IS NOT NULL
                 AND public.normalize_phone(a.telefon) = public.normalize_phone(b.telefon)
             )
         )
        WHERE a.isvisible = true
          AND b.isvisible = true
          AND a.congregation_id IS NOT NULL
          AND b.congregation_id IS NOT NULL
          AND a.congregation_id <> v_teszt_cong
          AND b.congregation_id <> v_teszt_cong
          AND public.normalize_name(COALESCE(a.csaladnev,'') || ' ' || COALESCE(a.k_nev,'')) IS NOT NULL
    ),
    fresh AS (
        SELECT c.*
        FROM candidates c
        WHERE NOT EXISTS (
            SELECT 1 FROM public.cross_congregation_match_notifications n
            WHERE (n.triggering_szemely_id = c.a_id AND n.matched_szemely_id = c.b_id)
               OR (n.triggering_szemely_id = c.b_id AND n.matched_szemely_id = c.a_id)
        )
    ),
    ins AS (
        INSERT INTO public.cross_congregation_match_notifications (
            notification_type,
            triggering_szemely_id,
            triggering_congregation_id,
            matched_szemely_id,
            matched_congregation_id,
            confidence
        )
        SELECT 'retroactive_scan', f.a_id, f.a_cong, f.b_id, f.b_cong, f.confidence
        FROM fresh f
        ON CONFLICT (triggering_szemely_id, matched_szemely_id, confidence) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM ins;

    SELECT COUNT(*) INTO v_total_open
    FROM public.cross_congregation_match_notifications
    WHERE resolution IS NULL;

    RETURN jsonb_build_object(
        'success', true,
        'new_matches', v_inserted,
        'total_open', v_total_open
    );
END;
$admin_scan$;

COMMENT ON FUNCTION public.admin_scan_cross_congregation_duplicates() IS
    'Visszamenőleges kereszt-gyülekezeti duplikátum-keresés a teljes állományon (erős egyezések). Csak rendszergazda. A Teszt gyülekezet kizárva.';

GRANT EXECUTE ON FUNCTION public.admin_scan_cross_congregation_duplicates() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. admin_list_cross_congregation_matches — admin lista (gazdagítva)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_cross_congregation_matches(
    p_include_resolved boolean DEFAULT false,
    p_limit integer DEFAULT 300,
    p_notification_id uuid DEFAULT NULL
) RETURNS TABLE(
    id uuid,
    notification_type text,
    confidence text,
    created_at timestamptz,
    resolution text,
    resolved_at timestamptz,
    admin_notified_at timestamptz,
    triggering_szemely_id integer,
    triggering_szemely_name text,
    triggering_sz_datum date,
    triggering_cnp text,
    triggering_congregation_id uuid,
    triggering_congregation_name text,
    triggering_pastor_user_id uuid,
    triggering_pastor_name text,
    triggering_pastor_email text,
    matched_szemely_id integer,
    matched_szemely_name text,
    matched_sz_datum date,
    matched_cnp text,
    matched_congregation_id uuid,
    matched_congregation_name text,
    matched_pastor_user_id uuid,
    matched_pastor_name text,
    matched_pastor_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $admin_list$
DECLARE
    v_is_admin boolean := public.ccm_caller_is_system_admin();
    v_districts uuid[] := public.ccm_caller_district_ids();
BEGIN
    IF NOT v_is_admin AND COALESCE(array_length(v_districts, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Nincs jogosultság az egyeztetési listához.';
    END IF;

    -- Páronként EGY sor: az A→B és B→A irányú (vagy több confidence-szel rögzített)
    -- tükör-sorok közül a nyitott, legrégebbi kerül a listába (DISTINCT ON).
    RETURN QUERY
    SELECT q.* FROM (
        SELECT DISTINCT ON (
            LEAST(n.triggering_szemely_id, n.matched_szemely_id),
            GREATEST(n.triggering_szemely_id, n.matched_szemely_id)
        )
            n.id AS o_id,
            n.notification_type AS o_notification_type,
            n.confidence AS o_confidence,
            n.created_at AS o_created_at,
            n.resolution AS o_resolution,
            n.resolved_at AS o_resolved_at,
            n.admin_notified_at AS o_admin_notified_at,
            n.triggering_szemely_id AS o_t_szemely_id,
            NULLIF(btrim(COALESCE(ts.csaladnev,'') || ' ' || COALESCE(ts.k_nev,'')), '')::text AS o_t_szemely_name,
            ts.sz_datum AS o_t_sz_datum,
            ts.cnp::text AS o_t_cnp,
            n.triggering_congregation_id AS o_t_cong_id,
            COALESCE(tc.nev_hu, tc.name, 'Ismeretlen gyülekezet')::text AS o_t_cong_name,
            tp.id AS o_t_pastor_user_id,
            tp.full_name::text AS o_t_pastor_name,
            tp.email::text AS o_t_pastor_email,
            n.matched_szemely_id AS o_m_szemely_id,
            NULLIF(btrim(COALESCE(ms.csaladnev,'') || ' ' || COALESCE(ms.k_nev,'')), '')::text AS o_m_szemely_name,
            ms.sz_datum AS o_m_sz_datum,
            ms.cnp::text AS o_m_cnp,
            n.matched_congregation_id AS o_m_cong_id,
            COALESCE(mc.nev_hu, mc.name, 'Ismeretlen gyülekezet')::text AS o_m_cong_name,
            mp.id AS o_m_pastor_user_id,
            mp.full_name::text AS o_m_pastor_name,
            mp.email::text AS o_m_pastor_email
        FROM public.cross_congregation_match_notifications n
        LEFT JOIN public.szemely ts ON ts.id = n.triggering_szemely_id
        LEFT JOIN public.szemely ms ON ms.id = n.matched_szemely_id
        LEFT JOIN public.congregations tc ON tc.id = n.triggering_congregation_id
        LEFT JOIN public.congregations mc ON mc.id = n.matched_congregation_id
        LEFT JOIN LATERAL (
            SELECT p.id, p.full_name, p.email
            FROM public.profiles p
            WHERE p.congregation_id = n.triggering_congregation_id
              AND p.role = 'lelkesz'
            ORDER BY p.full_name NULLS LAST
            LIMIT 1
        ) tp ON true
        LEFT JOIN LATERAL (
            SELECT p.id, p.full_name, p.email
            FROM public.profiles p
            WHERE p.congregation_id = n.matched_congregation_id
              AND p.role = 'lelkesz'
            ORDER BY p.full_name NULLS LAST
            LIMIT 1
        ) mp ON true
        WHERE (p_notification_id IS NULL OR n.id = p_notification_id)
          AND (p_include_resolved OR n.resolution IS NULL)
          AND (
              v_is_admin
              OR EXISTS (
                  -- Kerületi admin: legalább az egyik érintett gyülekezet a kerületében van
                  SELECT 1
                  FROM public.congregations c
                  JOIN public.dioceses d ON d.id = c.diocese_id
                  WHERE c.id IN (n.triggering_congregation_id, n.matched_congregation_id)
                    AND d.district_id = ANY (v_districts)
              )
          )
        ORDER BY
            LEAST(n.triggering_szemely_id, n.matched_szemely_id),
            GREATEST(n.triggering_szemely_id, n.matched_szemely_id),
            (n.resolution IS NULL) DESC,
            n.created_at ASC
    ) q
    ORDER BY (q.o_resolution IS NULL) DESC, q.o_created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 300), 1000));
END;
$admin_list$;

COMMENT ON FUNCTION public.admin_list_cross_congregation_matches(boolean, integer, uuid) IS
    'Admin egyeztetési lista: kereszt-gyülekezeti tag-egyezések gazdagítva (nevek, gyülekezetek, lelkész-elérhetőség). Rendszergazda: minden; kerületi admin: csak a saját kerülete.';

GRANT EXECUTE ON FUNCTION public.admin_list_cross_congregation_matches(boolean, integer, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Belső segéd: jogosult-e a hívó az adott egyeztetési tételhez?
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ccm_caller_can_access_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $ccm_can$
DECLARE
    v_districts uuid[];
    v_allowed boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;
    IF public.ccm_caller_is_system_admin() THEN
        RETURN true;
    END IF;
    v_districts := public.ccm_caller_district_ids();
    IF COALESCE(array_length(v_districts, 1), 0) = 0 THEN
        RETURN false;
    END IF;
    SELECT EXISTS (
        SELECT 1
        FROM public.cross_congregation_match_notifications n
        JOIN public.congregations c
          ON c.id IN (n.triggering_congregation_id, n.matched_congregation_id)
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE n.id = p_notification_id
          AND d.district_id = ANY (v_districts)
    ) INTO v_allowed;
    RETURN v_allowed;
END;
$ccm_can$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. admin_notify_cross_match_pastors — app-értesítés a két lelkésznek + pecsét
-- ────────────────────────────────────────────────────────────────────────────
--
-- Az e-mailt az app küldi (Brevo); ez az RPC a két lelkész app-on belüli
-- értesítését (ertesitesek) írja SECURITY DEFINER-rel — a kerületi admin saját
-- kliense az ertesitesek RLS-én elbukna, ezért NEM az app írja közvetlenül.
-- Az admin_notified_at/by pecsétet a pár MINDEN sorára (A→B és B→A tükör-sorok,
-- több confidence) rákerül.

CREATE OR REPLACE FUNCTION public.admin_notify_cross_match_pastors(
    p_notification_id uuid,
    p_cim text,
    p_uzenet_triggering text,
    p_uzenet_matched text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_notify$
DECLARE
    v_notif record;
    v_t_pastor uuid;
    v_m_pastor uuid;
    v_inserted integer := 0;
BEGIN
    IF NOT public.ccm_caller_can_access_notification(p_notification_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság az értesítés kiküldéséhez.';
    END IF;

    SELECT * INTO v_notif
    FROM public.cross_congregation_match_notifications
    WHERE id = p_notification_id;

    IF v_notif IS NULL THEN
        RAISE EXCEPTION 'Ismeretlen egyeztetési tétel: %', p_notification_id;
    END IF;

    SELECT p.id INTO v_t_pastor
    FROM public.profiles p
    WHERE p.congregation_id = v_notif.triggering_congregation_id
      AND p.role = 'lelkesz'
    ORDER BY p.full_name NULLS LAST
    LIMIT 1;

    SELECT p.id INTO v_m_pastor
    FROM public.profiles p
    WHERE p.congregation_id = v_notif.matched_congregation_id
      AND p.role = 'lelkesz'
    ORDER BY p.full_name NULLS LAST
    LIMIT 1;

    IF v_t_pastor IS NOT NULL THEN
        INSERT INTO public.ertesitesek (user_id, cim, uzenet, tipus, hivatkozas, olvasva)
        VALUES (v_t_pastor, p_cim, p_uzenet_triggering, 'warning', '/tagnyilvantartas', false);
        v_inserted := v_inserted + 1;
    END IF;
    IF v_m_pastor IS NOT NULL THEN
        INSERT INTO public.ertesitesek (user_id, cim, uzenet, tipus, hivatkozas, olvasva)
        VALUES (v_m_pastor, p_cim, p_uzenet_matched, 'warning', '/tagnyilvantartas', false);
        v_inserted := v_inserted + 1;
    END IF;

    -- Pecsét a pár MINDEN sorára (tükör-irányok, több confidence)
    UPDATE public.cross_congregation_match_notifications
    SET admin_notified_at = now(),
        admin_notified_by = auth.uid()
    WHERE (triggering_szemely_id = v_notif.triggering_szemely_id AND matched_szemely_id = v_notif.matched_szemely_id)
       OR (triggering_szemely_id = v_notif.matched_szemely_id AND matched_szemely_id = v_notif.triggering_szemely_id);

    RETURN jsonb_build_object(
        'success', true,
        'inserted_count', v_inserted,
        'triggering_pastor_found', v_t_pastor IS NOT NULL,
        'matched_pastor_found', v_m_pastor IS NOT NULL
    );
END;
$admin_notify$;

COMMENT ON FUNCTION public.admin_notify_cross_match_pastors(uuid, text, text, text) IS
    'Admin: app-on belüli értesítés a kereszt-egyezés MINDKÉT lelkészének (ertesitesek) + admin_notified pecsét a pár minden sorára. Az e-mailt az app külön küldi.';

GRANT EXECUTE ON FUNCTION public.admin_notify_cross_match_pastors(uuid, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. admin_resolve_cross_match_pair — döntés a pár MINDEN sorára
-- ────────────────────────────────────────────────────────────────────────────
--
-- A resolve_cross_congregation_match egyetlen sort zár; a tükör-sor (B→A) és a
-- más confidence-szel rögzített sorok nyitva maradnának — a badge és a
-- számlálók sosem tisztulnának ki. Ez a wrapper a PÁR minden sorát lezárja
-- (csak ahol a resolution még NULL — az első döntés nyer, mint eddig).

CREATE OR REPLACE FUNCTION public.admin_resolve_cross_match_pair(
    p_notification_id uuid,
    p_resolution text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_resolve$
DECLARE
    v_notif record;
    v_updated integer := 0;
BEGIN
    IF p_resolution NOT IN ('same_person', 'different_person', 'dismissed') THEN
        RAISE EXCEPTION 'Érvénytelen resolution: %', p_resolution;
    END IF;

    IF NOT public.ccm_caller_can_access_notification(p_notification_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság a döntés rögzítéséhez.';
    END IF;

    SELECT * INTO v_notif
    FROM public.cross_congregation_match_notifications
    WHERE id = p_notification_id;

    IF v_notif IS NULL THEN
        RAISE EXCEPTION 'Ismeretlen egyeztetési tétel: %', p_notification_id;
    END IF;

    UPDATE public.cross_congregation_match_notifications
    SET resolution = p_resolution,
        resolved_at = now()
    WHERE resolution IS NULL
      AND (
          (triggering_szemely_id = v_notif.triggering_szemely_id AND matched_szemely_id = v_notif.matched_szemely_id)
          OR (triggering_szemely_id = v_notif.matched_szemely_id AND matched_szemely_id = v_notif.triggering_szemely_id)
      );
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'updated_count', v_updated, 'resolution', p_resolution);
END;
$admin_resolve$;

COMMENT ON FUNCTION public.admin_resolve_cross_match_pair(uuid, text) IS
    'Admin: kereszt-gyülekezeti egyezés-pár LEZÁRÁSA — a pár minden (tükör- és több-confidence) sorát rendezi.';

GRANT EXECUTE ON FUNCTION public.admin_resolve_cross_match_pair(uuid, text) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új függvények létrejöttek?
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'ccm_caller_is_system_admin',
      'ccm_caller_district_ids',
      'ccm_caller_can_access_notification',
      'admin_scan_cross_congregation_duplicates',
      'admin_list_cross_congregation_matches',
      'admin_notify_cross_match_pastors',
      'admin_resolve_cross_match_pair'
  )
ORDER BY p.proname;

-- 2. Új oszlopok?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cross_congregation_match_notifications'
  AND column_name IN ('admin_notified_at', 'admin_notified_by');

-- 3. CHECK bővült?
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'cross_congregation_match_notifications_notification_type_check';

-- 4. (OPCIONÁLIS, admin-fiókkal) — próba-scan:
-- SELECT public.admin_scan_cross_congregation_duplicates();
-- Várt: {"success": true, "new_matches": N, "total_open": M}
