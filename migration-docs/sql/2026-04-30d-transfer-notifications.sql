-- KARTOTEKA — Átjelentkezési értesítési rendszer
-- Dátum: 2026-04-30d (negyedik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre kérése):
-- "Ők [elköltözöttek] már a gyülekezeti nyilvántartóban úgy jelennek meg, mint
-- akik nem az adott gyülekezethez tartoznak, hanem egy másikhoz. Itt fontos
-- hogy a gyülekezettel össze kell egyeztetni ahová ment és az ottani lelkész
-- egy rendszerüzenetet kell kapjon, hogy pl. a Barátosi Református
-- Egyházközségből 2 személy: Teszt Elek és Teszt Jázmin, átjelentkezési
-- szándékát jelezte az Árkosi Református egyházközséghez."
--
-- Ez a SQL 4 dolgot csinál:
--
--   1. ALTER TABLE elkoltozott — új mező `hova_congregation_id` (FK congregations)
--      → eddig csak `hovaid` (helység/locality) volt, de a célgyülekezet pontos
--        beazonosítása ezzel az új mezővel lehetséges (lelkészi jóváhagyáshoz)
--
--   2. CREATE TABLE member_transfer_notifications — átjelentkezési kérelem-tábla
--      → minden ALTER INSERT az elkoltozott-ba létrehoz egy notification rekordot,
--        ha a hova_congregation_id ki van töltve (trigger)
--      → státusz: pending → accepted / rejected
--
--   3. RLS policy — a forrás VAGY cél gyülekezet lelkésze láthatja
--
--   4. AFTER INSERT TRIGGER az elkoltozott-on — automatikus notification

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. elkoltozott.hova_congregation_id új oszlop
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.elkoltozott
    ADD COLUMN IF NOT EXISTS hova_congregation_id uuid
    REFERENCES public.congregations(id);

COMMENT ON COLUMN public.elkoltozott.hova_congregation_id IS
    'A célgyülekezet, ahová az elköltözött tag átjelentkezik. NULL ha külföldre vagy ismeretlen helyre. 2026-04-30 — Endre kérése: lelkészi jóváhagyás workflow-hoz.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. member_transfer_notifications új tábla
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.member_transfer_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Forrás (honnan jön a tag) és cél (hova megy)
    source_congregation_id uuid NOT NULL REFERENCES public.congregations(id),
    target_congregation_id uuid NOT NULL REFERENCES public.congregations(id),

    -- Az érintett tag és a forrás-rekord (elkoltozott)
    szemely_id integer NOT NULL REFERENCES public.szemely(id),
    elkoltozott_id integer NOT NULL REFERENCES public.elkoltozott(id) ON DELETE CASCADE,

    -- A tag adatainak pillanatfelvétele a transfer pillanatában
    -- (név, sz_datum, ferfi, cnp, lakcím — ezek alapján a célgyülekezet
    -- lelkésze el tudja dönteni, valóban őhozzá tartozik-e)
    member_snapshot jsonb NOT NULL,

    -- Státusz
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),

    -- Időbélyegek
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz, -- amikor a célgyülekezet lelkésze megnyitotta
    responded_at timestamptz, -- amikor elfogadta / elutasította
    responded_by uuid REFERENCES auth.users(id),
    response_note text -- opcionális magyarázat (pl. "Nem ismerem ezt a tagot")
);

CREATE INDEX IF NOT EXISTS idx_mtn_target_pending
    ON public.member_transfer_notifications (target_congregation_id, status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mtn_source
    ON public.member_transfer_notifications (source_congregation_id, created_at DESC);

COMMENT ON TABLE public.member_transfer_notifications IS
    'Átjelentkezési értesítések: ha egy tag átköltözik egyik gyülekezetből egy másikba, a célgyülekezet lelkésze itt kapja meg az értesítést és el/elutasíthatja. 2026-04-30.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS — a forrás VAGY cél gyülekezet lelkésze láthatja
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.member_transfer_notifications ENABLE ROW LEVEL SECURITY;

-- A felhasználó BÁRMELYIK gyülekezet (forrás vagy cél) tagja, akkor láthatja.
-- Ezzel a forrás-gyülekezet rögzítője is látja a saját rekordjait, és a
-- cél-gyülekezet lelkésze is látja a feléje érkezőket.
DO $$ BEGIN
    CREATE POLICY mtn_access ON public.member_transfer_notifications
        FOR ALL TO authenticated
        USING (
            source_congregation_id = current_user_congregation_id()
            OR target_congregation_id = current_user_congregation_id()
            OR current_user_has_global_access()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger — AFTER INSERT ON elkoltozott → automatikus notification
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_transfer_notification_on_elkoltozott()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_szemely_data jsonb;
BEGIN
    -- Csak akkor generálunk notification-t, ha:
    --   - hova_congregation_id ki van töltve (van célgyülekezet)
    --   - és a célgyülekezet KÜLÖNBÖZIK a forrástól (különben értelmetlen)
    IF NEW.hova_congregation_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.hova_congregation_id = NEW.congregation_id THEN
        RETURN NEW;
    END IF;

    -- Tag-snapshot kinyerése a szemely táblából
    SELECT jsonb_build_object(
        'csaladnev', sz.csaladnev,
        'k_nev', sz.k_nev,
        'szcs_nev', sz.szcs_nev,
        'sz_datum', sz.sz_datum,
        'ferfi', sz.ferfi,
        'cnp', sz.cnp,
        'cim', sz.c_szam,
        'megjegyzes', NEW.megjegyzes,
        'mikor', NEW.mikor
    )
    INTO v_szemely_data
    FROM public.szemely sz
    WHERE sz.id = NEW.id_szemely;

    -- Insert notification
    INSERT INTO public.member_transfer_notifications (
        source_congregation_id,
        target_congregation_id,
        szemely_id,
        elkoltozott_id,
        member_snapshot,
        status
    ) VALUES (
        NEW.congregation_id,
        NEW.hova_congregation_id,
        NEW.id_szemely,
        NEW.id,
        COALESCE(v_szemely_data, '{}'::jsonb),
        'pending'
    );

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_elkoltozott_create_transfer_notification ON public.elkoltozott;
CREATE TRIGGER trg_elkoltozott_create_transfer_notification
    AFTER INSERT ON public.elkoltozott
    FOR EACH ROW
    EXECUTE FUNCTION public.create_transfer_notification_on_elkoltozott();

COMMENT ON FUNCTION public.create_transfer_notification_on_elkoltozott() IS
    'AFTER INSERT a elkoltozott-on: ha a hova_congregation_id ki van töltve és a célgyülekezet különbözik a forrástól, automatikusan létrehoz egy member_transfer_notifications rekordot pending státusszal. 2026-04-30.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. elkoltozott.hova_congregation_id oszlop létezik
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'elkoltozott'
  AND column_name = 'hova_congregation_id';
-- Várt: 1 sor — uuid, nullable

-- 2. member_transfer_notifications tábla létezik (oszlop-lista)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'member_transfer_notifications'
ORDER BY ordinal_position;
-- Várt: 12 oszlop (id, source_congregation_id, target_congregation_id,
--       szemely_id, elkoltozott_id, member_snapshot, status, created_at,
--       read_at, responded_at, responded_by, response_note)

-- 3. RLS engedélyezve
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('member_transfer_notifications')
  AND relnamespace = 'public'::regnamespace;
-- Várt: t (true)

-- 4. Trigger létezik
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_elkoltozott_create_transfer_notification';
-- Várt: 1 sor — INSERT, elkoltozott

-- 5. Aktív notifikációk (most még üres)
SELECT COUNT(*) AS pending_notifications
FROM public.member_transfer_notifications
WHERE status = 'pending';
-- Várt: 0
