-- KARTOTEKA — Igehirdetési terv (2026-08-09)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- A munkanapló ÚJ „Igehirdetési terv" füléhez: előre tervezett alkalmak
-- (dátum, napszak, alkalom, textus, lekció, énekek, szolgálattevő, emlékeztető).
-- A terv-sor később egy kattintással munkanapló-bejegyzéssé alakítható
-- (marker: munkanaplo.id_jellege = 'igeterv:<uuid>' + visszamutató munkanaplo_id),
-- és kérésre a gyülekezeti naptárban (gyulekezeti_programok) is megjelenik
-- (program_id kapcsolat) — így a Google Naptár ICS-feed is viszi.
--
-- Idempotens: IF NOT EXISTS + CREATE OR REPLACE.

BEGIN;

CREATE TABLE IF NOT EXISTS public.igehirdetesi_terv (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
    datum date NOT NULL,
    napszak text NOT NULL DEFAULT 'de' CHECK (napszak IN ('de', 'du', 'este')),
    -- Alkalom megnevezése (pl. 'Vasárnap délelőtt', 'Húsvét 1. napja', 'Bűnbánati hét')
    alkalom text,
    -- Igehirdetés címe / témája
    cim text,
    -- Textus (alapige) és lekció (bibliaolvasás)
    textus text,
    bibliaolvasas text,
    -- Énekek — vesszővel elválasztott énekszámok ('153, 25, 430b'), a munkanaplóval azonosan
    enekek text,
    szolgalattevo text,
    megjegyzes text,
    -- Emlékeztető: hány nappal az alkalom előtt kérjen app-értesítést (NULL = nincs)
    emlekezteto_napok integer CHECK (emlekezteto_napok IS NULL OR emlekezteto_napok BETWEEN 0 AND 60),
    emlekezteto_elkuldve timestamptz,
    -- Kapcsolatok
    munkanaplo_id integer,          -- a belőle készült munkanapló-bejegyzés
    program_id uuid,                -- a gyülekezeti naptár-bejegyzés (gyulekezeti_programok)
    -- Könyvelés
    userid uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL DEFAULT 0,
    deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_igehirdetesi_terv_cong_datum
    ON public.igehirdetesi_terv (congregation_id, datum)
    WHERE deleted = false;

COMMENT ON TABLE public.igehirdetesi_terv IS
    'Igehirdetési terv: előre tervezett istentiszteleti alkalmak (textus, lekció, énekek, emlékeztető). A munkanapló Igehirdetési terv fülének táblája.';

-- RLS — gyülekezet-hatókör (a többi congregation-táblával azonos minta)
ALTER TABLE public.igehirdetesi_terv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS igehirdetesi_terv_access ON public.igehirdetesi_terv;
CREATE POLICY igehirdetesi_terv_access ON public.igehirdetesi_terv
    FOR ALL TO authenticated
    USING (
        congregation_id = public.current_user_congregation_id()
        OR public.current_user_has_global_access()
    )
    WITH CHECK (
        congregation_id = public.current_user_congregation_id()
        OR public.current_user_has_global_access()
    );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'igehirdetesi_terv'
ORDER BY ordinal_position;

SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.igehirdetesi_terv'::regclass;
-- Várt: igehirdetesi_terv_access, '*' (FOR ALL)
