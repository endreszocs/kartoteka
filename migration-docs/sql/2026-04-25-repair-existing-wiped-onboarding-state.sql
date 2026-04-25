-- KARTOTEKA - egyszeri javitas mar korabban wipe-olt gyulekezethez
-- Datum: 2026-04-25
-- Futtatja: Endre (Supabase SQL editor)
--
-- MIKOR KELL EZ?
--   Ha a gyulekezet wipe-ja MAR LEFUTOTT a javitott
--   `wipe_congregation_data()` elott, akkor a profile es wizard allapot
--   bennmaradhat "kesz onboarding" statuszban.
--
-- MIT CSINAL?
--   - csak a megadott congregation_id-hoz tartozo profile sorokat erinti
--   - onboarding_completed_at = NULL
--   - walkthrough_completed = false
--   - walkthrough_skipped_at = NULL
--   - torli a kapcsolodo wizard_progress sorokat
--
-- BIZTONSAG:
--   - nincs automatikus futas
--   - kezzel kell beirni a congregation UUID-t
--   - ha a placeholder marad bent, a script hibat dob es leall

BEGIN;

DO $repair$
DECLARE
    target_congregation_id_text TEXT := 'REPLACE_WITH_CONGREGATION_UUID';
    target_congregation_id UUID;
    v_exists BOOLEAN;
BEGIN
    IF target_congregation_id_text = 'REPLACE_WITH_CONGREGATION_UUID' THEN
        RAISE EXCEPTION 'Add meg a target_congregation_id UUID-t a script tetejen, mielott futtatod.';
    END IF;

    target_congregation_id := target_congregation_id_text::uuid;

    SELECT EXISTS(
        SELECT 1
        FROM public.congregations
        WHERE id = target_congregation_id
    )
    INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Nincs ilyen gyulekezet: %', target_congregation_id;
    END IF;

    UPDATE public.profiles
    SET
        walkthrough_completed = false,
        walkthrough_skipped_at = NULL,
        onboarding_completed_at = NULL,
        updated_at = now()
    WHERE congregation_id = target_congregation_id;

    DELETE FROM public.wizard_progress
    WHERE user_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.congregation_id = target_congregation_id
    );
END;
$repair$;

COMMIT;

-- === ELLENORZES (kulon futtasd) ===

-- 1. Csereld ki itt is a UUID-t:
-- SELECT
--   p.id,
--   p.email,
--   p.full_name,
--   p.walkthrough_completed,
--   p.walkthrough_skipped_at,
--   p.onboarding_completed_at
-- FROM public.profiles p
-- WHERE p.congregation_id = 'REPLACE_WITH_CONGREGATION_UUID'::uuid
-- ORDER BY p.email;

-- 2. Elvart: 0 sor
-- SELECT *
-- FROM public.wizard_progress
-- WHERE user_id IN (
--   SELECT id
--   FROM public.profiles
--   WHERE congregation_id = 'REPLACE_WITH_CONGREGATION_UUID'::uuid
-- );
