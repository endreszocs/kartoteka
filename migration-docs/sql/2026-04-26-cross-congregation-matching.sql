-- KARTOTEKA — Cross-congregation tag-azonosítás (Fázis 2 + 2.5)
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a 2026-04-26-FIX-egyhazi-cnp-* után
--
-- Cél:
-- A `find_potential_cross_congregation_match` RPC + `cross_congregation_match_notifications`
-- tábla + `AFTER UPDATE` trigger a `szemely` táblán.
--
-- Két használati eset:
-- 1. Új tag bevitelnél (member-form-dialog mentés ELŐTT) — server action explicit hívja
-- 2. Utólagos módosítás (csaladnev/k_nev/telefon változott) — TRIGGER automatikusan hívja
--    + notifikációt rögzít a két érintett lelkész számára
--
-- Adatvédelem (`feedback_gyulekezeti_autonomia`):
-- - SECURITY DEFINER → cross-congregation lookup, de a return type SZIGORÚAN limitált
-- - Visszaadás: gyülekezet neve, egyházi CNP, név — semmi más személyes adat
-- - A notifikációk RLS: csak a triggering vagy matched gyülekezet user-jei láthatják
--
-- Idempotens: CREATE OR REPLACE + IF NOT EXISTS

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. immutable_unaccent — IMMUTABLE wrapper az unaccent köré (index-elhető)
-- ────────────────────────────────────────────────────────────────────────────
--
-- A standard `unaccent(text)` STABLE, nem IMMUTABLE — emiatt nem használható
-- expression-indexben. Készítünk egy IMMUTABLE wrappert ami expliciten megadja
-- a `unaccent` szótárat, így biztonságosan indexelhető.

CREATE OR REPLACE FUNCTION public.immutable_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $immutable_unaccent$
    SELECT public.unaccent('public.unaccent'::regdictionary, input);
$immutable_unaccent$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
    'IMMUTABLE wrapper az unaccent köré — expression-indexben használható.';

-- A normalize_name függvényt FRISSÍTJÜK, hogy az immutable_unaccent-et használja
CREATE OR REPLACE FUNCTION public.normalize_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $normalize_name$
    SELECT CASE
        WHEN input IS NULL OR btrim(input) = '' THEN NULL
        ELSE lower(btrim(regexp_replace(public.immutable_unaccent(input), '\s+', ' ', 'g')))
    END;
$normalize_name$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Expression-indexek a szemely táblán a gyors cross-congregation kereséshez
-- ────────────────────────────────────────────────────────────────────────────

-- Normalizált név (csaladnev + k_nev) — case-insensitive, ékezet-mentes
CREATE INDEX IF NOT EXISTS idx_szemely_normalized_full_name
    ON public.szemely (
        public.normalize_name(COALESCE(csaladnev, '') || ' ' || COALESCE(k_nev, ''))
    )
    WHERE isvisible = true;

-- Normalizált telefon
CREATE INDEX IF NOT EXISTS idx_szemely_normalized_phone
    ON public.szemely (public.normalize_phone(telefon))
    WHERE isvisible = true AND telefon IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. cross_congregation_match_notifications tábla
-- ────────────────────────────────────────────────────────────────────────────
--
-- Rögzít minden gyanús egyezést, amit a rendszer detekált.
-- A notifikációk megjelennek mindkét érintett gyülekezet user-jeinél (in-app dialog).

CREATE TABLE IF NOT EXISTS public.cross_congregation_match_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A trigger-esetnek típusa: új tag bevitel vs utólagos módosítás
    notification_type text NOT NULL CHECK (notification_type IN ('new_member', 'update_match')),
    -- Ki a trigger person (most regisztrálták / most módosították)
    triggering_szemely_id integer NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
    triggering_congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
    -- Ki a matched person (a már létező rekord másik gyülekezetben)
    matched_szemely_id integer NOT NULL REFERENCES public.szemely(id) ON DELETE CASCADE,
    matched_congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
    -- A confidence szint
    confidence text NOT NULL CHECK (confidence IN ('name_phone', 'name_birth', 'phone_only', 'name_only')),
    -- Rendezés állapot: ha mindkét lelkész döntött
    resolution text CHECK (resolution IN ('same_person', 'different_person', 'dismissed')),
    resolved_by_triggering_user uuid REFERENCES auth.users(id),
    resolved_by_matched_user uuid REFERENCES auth.users(id),
    resolved_at timestamptz,
    -- Akinek már megmutattuk a notifikációt
    seen_by_triggering_user_at timestamptz,
    seen_by_matched_user_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Egyediség: ne dupla notifikáció ugyanarra a párra
    UNIQUE (triggering_szemely_id, matched_szemely_id, confidence)
);

CREATE INDEX IF NOT EXISTS idx_ccm_notif_triggering_cong
    ON public.cross_congregation_match_notifications(triggering_congregation_id, created_at DESC)
    WHERE resolution IS NULL;

CREATE INDEX IF NOT EXISTS idx_ccm_notif_matched_cong
    ON public.cross_congregation_match_notifications(matched_congregation_id, created_at DESC)
    WHERE resolution IS NULL;

-- RLS: csak a 2 érintett gyülekezet user-jei láthatják
ALTER TABLE public.cross_congregation_match_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccm_notif_select ON public.cross_congregation_match_notifications;
CREATE POLICY ccm_notif_select ON public.cross_congregation_match_notifications
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                  p.congregation_id = triggering_congregation_id
                  OR p.congregation_id = matched_congregation_id
              )
        )
        OR EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = auth.uid()
              AND pr.role = 'admin'
              AND pr.scope = 'system'
              AND pr.active = true
              AND pr.approval_status = 'approved'
        )
    );

DROP POLICY IF EXISTS ccm_notif_update ON public.cross_congregation_match_notifications;
CREATE POLICY ccm_notif_update ON public.cross_congregation_match_notifications
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                  p.congregation_id = triggering_congregation_id
                  OR p.congregation_id = matched_congregation_id
              )
        )
    );

COMMENT ON TABLE public.cross_congregation_match_notifications IS
    'Gyanús cross-congregation tag-egyezések. Két lelkésznek (a trigger + matched gyülekezet) jelenik meg, mindketten dönthetnek (same_person / different_person / dismissed). RLS: csak az érintett gyülekezet user-jei látják.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. find_potential_cross_congregation_match — fő RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemenet:
--   p_csaladnev, p_k_nev — kötelező név-mezők
--   p_telefon — opcionális (még pontosabb egyezéshez)
--   p_sz_datum — opcionális (név+szül.dátum egyezés is lehetséges)
--   p_exclude_szemely_id — UPDATE esetnél a self-match elkerüléséhez
--   p_exclude_congregation_id — opcionális (a saját gyülekezetét nem jelezzük)
--
-- Kimenet (TABLE):
--   matched_szemely_id, matched_congregation_id, matched_congregation_name,
--   egyhazi_cnp, matched_csaladnev, matched_k_nev, confidence
--
-- Confidence szintek (csökkenő prioritás):
--   'name_phone' — név + telefon egyezés (BIZTOS — egyazon személy)
--   'name_birth' — név + születési dátum egyezés (NAGYON VALÓSZÍNŰ)
--   'phone_only' — csak telefon egyezés (FIGYELMEZTETÉS)
--   'name_only'  — csak név egyezés (GYENGE — csak ha minden más NULL)

CREATE OR REPLACE FUNCTION public.find_potential_cross_congregation_match(
    p_csaladnev text,
    p_k_nev text,
    p_telefon text DEFAULT NULL,
    p_sz_datum date DEFAULT NULL,
    p_exclude_szemely_id integer DEFAULT NULL,
    p_exclude_congregation_id uuid DEFAULT NULL
) RETURNS TABLE(
    matched_szemely_id integer,
    matched_congregation_id uuid,
    matched_congregation_name text,
    egyhazi_cnp varchar(20),
    matched_csaladnev varchar(30),
    matched_k_nev varchar(25),
    confidence text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $find_match$
DECLARE
    v_norm_full_name text;
    v_norm_phone text;
BEGIN
    -- Bemenet normalizálás
    v_norm_full_name := public.normalize_name(
        COALESCE(p_csaladnev, '') || ' ' || COALESCE(p_k_nev, '')
    );
    v_norm_phone := public.normalize_phone(p_telefon);

    -- Védelem: ha sem név sem telefon nincs, ne dolgozzunk
    IF v_norm_full_name IS NULL AND v_norm_phone IS NULL THEN
        RETURN;
    END IF;

    -- Egyetlen union-with-prioritás query, DISTINCT ON-nal a legjobb match-et adjuk
    -- minden talált szemely-re (ha több feltétellel is egyezik, a legmagasabb confidence nyer).
    RETURN QUERY
    SELECT DISTINCT ON (s.id)
        s.id::integer AS matched_szemely_id,
        s.congregation_id AS matched_congregation_id,
        COALESCE(c.nev_hu, c.name, 'Ismeretlen gyülekezet')::text AS matched_congregation_name,
        s.cnp AS egyhazi_cnp,
        s.csaladnev AS matched_csaladnev,
        s.k_nev AS matched_k_nev,
        CASE
            WHEN v_norm_phone IS NOT NULL
                 AND public.normalize_phone(s.telefon) = v_norm_phone
                 AND public.normalize_name(
                     COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                 ) = v_norm_full_name
                THEN 'name_phone'
            WHEN p_sz_datum IS NOT NULL
                 AND s.sz_datum = p_sz_datum
                 AND public.normalize_name(
                     COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                 ) = v_norm_full_name
                THEN 'name_birth'
            WHEN v_norm_phone IS NOT NULL
                 AND public.normalize_phone(s.telefon) = v_norm_phone
                THEN 'phone_only'
            ELSE 'name_only'
        END::text AS confidence
    FROM public.szemely s
    LEFT JOIN public.congregations c ON c.id = s.congregation_id
    WHERE s.isvisible = true
      AND (p_exclude_szemely_id IS NULL OR s.id != p_exclude_szemely_id)
      AND (p_exclude_congregation_id IS NULL OR s.congregation_id != p_exclude_congregation_id)
      AND (
          -- legalább a név vagy telefon egyezzen
          (v_norm_full_name IS NOT NULL
           AND public.normalize_name(
               COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
           ) = v_norm_full_name)
          OR
          (v_norm_phone IS NOT NULL
           AND s.telefon IS NOT NULL
           AND public.normalize_phone(s.telefon) = v_norm_phone)
      )
    ORDER BY s.id, confidence;
END;
$find_match$;

COMMENT ON FUNCTION public.find_potential_cross_congregation_match(text, text, text, date, integer, uuid) IS
    'Cross-congregation tag-egyezés keresése. SECURITY DEFINER → globális lookup, de a return type csak: gyülekezet név, CNP, név (semmi más személyes adat NEM szivárog). 4 confidence szint.';

GRANT EXECUTE ON FUNCTION public.find_potential_cross_congregation_match(text, text, text, date, integer, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. tg_szemely_check_cross_congregation TRIGGER
-- ────────────────────────────────────────────────────────────────────────────
--
-- Lefut minden szemely UPDATE-nél, ha csaladnev/k_nev/telefon változott.
-- Új notifikációkat rögzít minden talált name_phone vagy name_birth egyezésre.
-- A name_phone és name_birth a "biztos" / "nagyon valószínű" — ezek igényelnek
-- felugró ablakot. A phone_only és name_only csak a tagnyilvántartás listában
-- jelenik meg majd jelölőként (külön logika a UI-ban).

CREATE OR REPLACE FUNCTION public.tg_szemely_check_cross_congregation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $check_ccm$
DECLARE
    v_match record;
BEGIN
    -- Csak akkor fut, ha érdekes mező változott
    IF TG_OP = 'UPDATE' THEN
        IF NEW.csaladnev IS NOT DISTINCT FROM OLD.csaladnev
           AND NEW.k_nev IS NOT DISTINCT FROM OLD.k_nev
           AND NEW.telefon IS NOT DISTINCT FROM OLD.telefon THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Csak látható (isvisible=true) tagokat ellenőrizzünk
    IF NEW.isvisible IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Match keresés
    FOR v_match IN
        SELECT * FROM public.find_potential_cross_congregation_match(
            NEW.csaladnev,
            NEW.k_nev,
            NEW.telefon,
            NEW.sz_datum,
            NEW.id,
            NEW.congregation_id
        )
        WHERE confidence IN ('name_phone', 'name_birth')
    LOOP
        -- Új notifikáció (ON CONFLICT DO NOTHING — egyediségi index miatt)
        INSERT INTO public.cross_congregation_match_notifications (
            notification_type,
            triggering_szemely_id,
            triggering_congregation_id,
            matched_szemely_id,
            matched_congregation_id,
            confidence
        ) VALUES (
            CASE WHEN TG_OP = 'INSERT' THEN 'new_member' ELSE 'update_match' END,
            NEW.id,
            NEW.congregation_id,
            v_match.matched_szemely_id,
            v_match.matched_congregation_id,
            v_match.confidence
        )
        ON CONFLICT (triggering_szemely_id, matched_szemely_id, confidence) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$check_ccm$;

DROP TRIGGER IF EXISTS szemely_check_cross_congregation ON public.szemely;
CREATE TRIGGER szemely_check_cross_congregation
    AFTER INSERT OR UPDATE ON public.szemely
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_szemely_check_cross_congregation();

COMMENT ON FUNCTION public.tg_szemely_check_cross_congregation() IS
    'AFTER INSERT/UPDATE trigger a szemely táblán: cross-congregation match keresése (name_phone, name_birth confidence). Új notifikáció a cross_congregation_match_notifications táblába (ON CONFLICT DO NOTHING).';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. resolve_cross_congregation_match RPC — döntés rögzítése
-- ────────────────────────────────────────────────────────────────────────────
--
-- A lelkész (vagy admin) eldönti egy notification-ről hogy:
--   'same_person' — ugyanaz a személy → a triggering szemely CNP-je megváltozik
--                   a matched szemely CNP-jére (összevonás)
--   'different_person' — más személy → a notification csak resolved jelölést kap,
--                   a triggering szemely megtartja a saját CNP-jét
--   'dismissed' — bezártam, nem érdekel most → resolution rögzítve, később visszanyitható

CREATE OR REPLACE FUNCTION public.resolve_cross_congregation_match(
    p_notification_id uuid,
    p_resolution text  -- 'same_person' | 'different_person' | 'dismissed'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $resolve_ccm$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_congregation uuid;
    v_notif record;
    v_is_triggering boolean;
    v_is_matched boolean;
    v_other_resolved boolean := false;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    IF p_resolution NOT IN ('same_person', 'different_person', 'dismissed') THEN
        RAISE EXCEPTION 'Érvénytelen resolution: %. Használható: same_person, different_person, dismissed', p_resolution;
    END IF;

    -- Lekérjük a notification rekordot
    SELECT * INTO v_notif
    FROM public.cross_congregation_match_notifications
    WHERE id = p_notification_id;

    IF v_notif IS NULL THEN
        RAISE EXCEPTION 'Ismeretlen notification: %', p_notification_id;
    END IF;

    -- Ki a hívó: triggering vagy matched gyülekezet user-je?
    SELECT congregation_id INTO v_caller_congregation
    FROM public.profiles WHERE id = v_caller;

    v_is_triggering := (v_caller_congregation = v_notif.triggering_congregation_id);
    v_is_matched := (v_caller_congregation = v_notif.matched_congregation_id);

    IF NOT v_is_triggering AND NOT v_is_matched THEN
        -- Esetleg system admin: engedélyezzük
        IF NOT EXISTS (
            SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller
              AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved'
        ) THEN
            RAISE EXCEPTION 'Nincs jogosultság ehhez a notification-höz.';
        END IF;
    END IF;

    -- Ha 'same_person': a triggering szemely CNP-je megváltozik a matched CNP-jére
    -- DE ehhez MINDKÉT lelkésznek 'same_person'-t kell mondania (kettős egyetértés).
    -- Ezt egyszerűsítjük: ha az első lelkész 'same_person', csak rögzítjük; ha a
    -- második is 'same_person', AKKOR vonjuk össze a CNP-t. Ezt a logikát a
    -- frontend kezeli majd — most csak a resolution-t rögzítjük.

    -- Frissítjük a notification rekordot
    UPDATE public.cross_congregation_match_notifications
    SET
        resolution = CASE WHEN resolution IS NULL THEN p_resolution ELSE resolution END,
        resolved_by_triggering_user = CASE WHEN v_is_triggering THEN v_caller ELSE resolved_by_triggering_user END,
        resolved_by_matched_user = CASE WHEN v_is_matched THEN v_caller ELSE resolved_by_matched_user END,
        resolved_at = CASE WHEN resolution IS NULL THEN now() ELSE resolved_at END
    WHERE id = p_notification_id;

    -- Ha 'same_person' VAGY 'different_person' — utólagos összevonáshoz egy
    -- külön server action / wizard kell. Ez most csak a notifikáció állapotát
    -- frissíti — a tényleges CNP-merge külön (manual) lépésben.

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', p_notification_id,
        'resolution', p_resolution
    );
END;
$resolve_ccm$;

COMMENT ON FUNCTION public.resolve_cross_congregation_match(uuid, text) IS
    'Cross-congregation notification döntés rögzítése (same_person / different_person / dismissed). A tényleges CNP-merge külön lépésben (frontend).';

GRANT EXECUTE ON FUNCTION public.resolve_cross_congregation_match(uuid, text) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Új függvények létrejöttek?
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'immutable_unaccent',
    'normalize_name',
    'find_potential_cross_congregation_match',
    'tg_szemely_check_cross_congregation',
    'resolve_cross_congregation_match'
)
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 2. Tábla és indexek
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'cross_congregation_match_notifications'
       OR indexname LIKE 'idx_szemely_normalized%')
ORDER BY tablename, indexname;

-- 3. Trigger aktív?
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'szemely'
  AND trigger_name = 'szemely_check_cross_congregation';

-- 4. Próba hívás (NEM-DESTRUKTÍV — nincs adat egyelőre)
SELECT * FROM public.find_potential_cross_congregation_match(
    'Teszt',
    'János',
    '0740123456'
);
-- Várt: 0 sor (még nincs egyetlen tag se)

-- 5. RLS policy aktív?
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.cross_congregation_match_notifications'::regclass;
