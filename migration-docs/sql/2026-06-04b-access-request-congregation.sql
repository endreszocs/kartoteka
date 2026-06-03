-- ============================================================================
-- 2026-06-04 — Hozzáférés-kérelem: egyházközség listából (FK) + 1-kattintásos jóváhagyás
-- ============================================================================
-- CÉL (Endre kérése):
--   A regisztrációnál az egyházmegye UTÁN az egyházközséget is LISTÁBÓL válassza
--   a kérelmező (a megye szűri a listát). Így a Hozzáférés-kérelmek fülön az
--   admin EGY gombnyomással elfogadhatja ÉS a VALÓS gyülekezethez rendelheti a
--   lelkészt — kézi gépelés nélkül.
--
--   Ehhez:
--     1. access_requests.requested_congregation_id (FK a congregations-re)
--     2. egy anon-hívható RPC, ami a publikus űrlapnak visszaadja a
--        gyülekezeteket (id, name, diocese_id) — a teljes congregations tábla
--        anon-megnyitása NÉLKÜL (az pénzügyi oszlopokat is tartalmaz).
--
-- ELŐFELTÉTEL: előbb fusson a 2026-06-04-congregations-seed.sql.
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run. Idempotens.
-- ============================================================================

BEGIN;

-- ── 1. access_requests — választott egyházközség (FK) ───────────────────────
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS requested_congregation_id uuid REFERENCES public.congregations(id);

COMMENT ON COLUMN public.access_requests.requested_congregation_id IS
  'A kérelmező által listából választott egyházközség (congregations FK). A jóváhagyáskor ez lesz a profiles.congregation_id. 2026-06-04.';

-- ── 2. RPC — gyülekezetlista a publikus regisztrációs űrlaphoz ──────────────
-- Csak (id, name, diocese_id) — semmilyen pénzügyi/PII oszlop. SECURITY DEFINER,
-- hogy a congregations RLS-t megkerülje, de CSAK ezt a 3 mezőt adja vissza.
CREATE OR REPLACE FUNCTION public.congregations_for_registration()
RETURNS TABLE(id uuid, name text, diocese_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, COALESCE(NULLIF(btrim(c.nev_hu), ''), c.name) AS name, c.diocese_id
  FROM public.congregations c
  WHERE c.diocese_id IS NOT NULL
  ORDER BY COALESCE(NULLIF(btrim(c.nev_hu), ''), c.name)
$$;

COMMENT ON FUNCTION public.congregations_for_registration() IS
  'A publikus regisztrációs űrlap gyülekezet-választójához: (id, name, diocese_id). Nem ad vissza pénzügyi/PII adatot. 2026-06-04.';

GRANT EXECUTE ON FUNCTION public.congregations_for_registration() TO anon, authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────

-- Új oszlop
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'access_requests'
  AND column_name = 'requested_congregation_id';

-- RPC működik? (várt: 782 sor körül)
SELECT COUNT(*) AS gyulekezetek_az_rpc_bol FROM public.congregations_for_registration();

-- Minta: egy egyházmegye gyülekezetei
SELECT cf.name
FROM public.congregations_for_registration() cf
JOIN public.dioceses d ON d.id = cf.diocese_id
WHERE d.name = 'Nagybányai Református Egyházmegye'
ORDER BY cf.name
LIMIT 10;
