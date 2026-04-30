-- KARTOTEKA — Elkoltozott trigger bővítés: szemely.member_status='elkoltozott'
-- Dátum: 2026-04-30g (hetedik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre kérése):
-- "Akik elköltöztek, azok már nem tartoznak a gyülekezethez. Ha a másik
--  gyülekezet még nem fogadta el, akkor az állapotuk legyen FÜGGŐBEN
--  ELKÖLTÖZÖTT, de a gyülekezetben már ne számoljuk bele. Ha a másik
--  gyülekezet lelkésze nem fogadta el, akkor a megfelelő rendszerüzenettel
--  visszakerül a forrás gyülekezet AKTÍV gyülekezeti tagjai közé!"
--
-- Életciklus:
--   1. Elköltözés-import / kézi rögzítés → szemely.member_status='elkoltozott'
--      (függőben — még a forrás-gyülekezethez tartozik a congregation_id-vel)
--   2a. Célgyülekezet ELFOGADJA → szemely.congregation_id=target,
--       szemely.member_status='aktív' (más gyülekezet aktív tagja)
--   2b. Célgyülekezet ELUTASÍTJA → szemely.member_status='aktív'
--       (vissza a forrás-gyülekezetbe)
--
-- Tagnyilvántartás-szűrés: a member_status='elkoltozott' tagok ki vannak
-- zárva az "aktív" listából (de látszanak az "Elköltözöttek" szűrővel).
--
-- Ez a SQL frissíti a `create_transfer_notification_on_elkoltozott` triggert,
-- hogy a szemely.member_status frissítését is elvégezze (függetlenül attól,
-- hogy van-e hova_congregation_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_transfer_notification_on_elkoltozott()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_szemely_data jsonb;
BEGIN
    -- ──────────────────────────────────────────────────────────────────
    -- 1. MINDIG: szemely.member_status='elkoltozott'
    --    Ez fut akkor is, ha hova_congregation_id IS NULL (külföldre,
    --    ismeretlen helyre stb.). A tag státusza megváltozik —
    --    a tagnyilvántartás "aktív" listából kikerül.
    -- ──────────────────────────────────────────────────────────────────
    UPDATE public.szemely
    SET member_status = 'elkoltozott',
        updated_at = now()
    WHERE id = NEW.id_szemely
      AND member_status IS DISTINCT FROM 'elkoltozott';

    -- ──────────────────────────────────────────────────────────────────
    -- 2. Notifikáció generálás (csak ha hova_congregation_id ki van töltve
    --    ÉS különbözik a forrástól — különben értelmetlen)
    -- ──────────────────────────────────────────────────────────────────
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

COMMENT ON FUNCTION public.create_transfer_notification_on_elkoltozott() IS
    'AFTER INSERT a elkoltozott-on: (1) MINDIG szemely.member_status=elkoltozott. (2) Ha hova_congregation_id ki van töltve, member_transfer_notification pending státusszal. 2026-04-30g.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL — meglévő elkoltozott rekordokra
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha már voltak korábbi import-ok az elkoltozott táblába, azoknál a
-- szemely.member_status nem frissült. Ezt egy egyszeri UPDATE-tel pótoljuk.

UPDATE public.szemely sz
SET member_status = 'elkoltozott',
    updated_at = now()
WHERE sz.member_status IS DISTINCT FROM 'elkoltozott'
  AND EXISTS (
    SELECT 1 FROM public.elkoltozott e WHERE e.id_szemely = sz.id
  );

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════════════════

-- 1. A trigger frissült?
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_elkoltozott_create_transfer_notification';
-- Várt: 1 sor

-- 2. Hány tag van most "elkoltozott" státuszban?
SELECT member_status, COUNT(*) AS db
FROM public.szemely
WHERE member_status IN ('elkoltozott', 'aktív', 'kitért')
GROUP BY member_status
ORDER BY db DESC;

-- 3. Konkrétan: az elkoltozott tábla sorai vs az "elkoltozott" státuszú tagok
SELECT
    (SELECT COUNT(*) FROM public.elkoltozott) AS elkoltozott_rekordok,
    (SELECT COUNT(*) FROM public.szemely WHERE member_status = 'elkoltozott') AS elkoltozott_tagok;
-- Várt: a két érték közel azonos (a tagok között lehet néhány aki több
--       gyülekezetet érintett — egy tag csak egyszer van az aktuális
--       szemely-rekordon).
