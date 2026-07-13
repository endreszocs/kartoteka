-- ============================================================================
-- 2026-07-11 (S10, 2026-07-13 JAVÍTVA) — Monetár címlettörzs (nom_cimlet)
-- feltöltése + önjavító RPC.
--
-- HIBA #1: a Monetár mentése „címlettörzs hiányos" hibával állt le, mert a
--   `nom_cimlet` tábla hiányos volt.
-- HIBA #2 (2026-07-13): az első seed-futtatás „duplicate key … id=1 already
--   exists" hibát dobott, mert a `nom_cimlet_id_seq` SZEKVENCIA nem volt
--   szinkronban a meglévő sorokkal (explicit id-s import után gyakori) — a
--   beszúrás auto-id-je ütközött egy létező id-vel.
--
-- MEGOLDÁS: a beszúrás ELŐTT szinkronizáljuk a szekvenciát a max(id)-hoz, majd
--   idempotensen (val+divide szerint) pótoljuk a hiányzó 12 hivatalos címletet.
--   A SECURITY DEFINER függvény az RLS-t megkerülve, önjavítóan fut.
--
-- FUTTATÁS: Supabase SQL editor. Biztonságos újra-futtatni.
-- A `nom_cimlet` érték = val / divide (pl. 50/100 = 0.5 = 50 bani).
-- ============================================================================

-- ── 1) SECURITY DEFINER önjavító függvény ───────────────────────────────────
create or replace function public.ensure_cash_denominations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 2026-07-13: a szekvencia szinkronizálása a meglévő sorokhoz (id-ütközés ellen).
  --   üres tábla  → next = 1
  --   nem üres    → next = max(id) + 1
  perform setval(
    'nom_cimlet_id_seq',
    greatest((select coalesce(max(id), 0) from public.nom_cimlet), 1),
    (select exists (select 1 from public.nom_cimlet))
  );

  insert into public.nom_cimlet (name, val, divide, deleted)
  select d.name, d.val, d.divide, false
  from (values
    ('500 lejes bankjegy', 500, 1),
    ('200 lejes bankjegy', 200, 1),
    ('100 lejes bankjegy', 100, 1),
    ('50 lejes bankjegy',   50, 1),
    ('20 lejes bankjegy',   20, 1),
    ('10 lejes bankjegy',   10, 1),
    ('5 lejes bankjegy',     5, 1),
    ('1 lejes címlet',       1, 1),
    ('50 banis érme',       50, 100),
    ('10 banis érme',       10, 100),
    ('5 banis érme',         5, 100),
    ('1 banis érme',         1, 100)
  ) as d(name, val, divide)
  where not exists (
    select 1 from public.nom_cimlet n
    where n.val = d.val and n.divide = d.divide and n.deleted is not true
  );
end;
$$;

grant execute on function public.ensure_cash_denominations() to authenticated;

-- ── 2) Azonnali feltöltés (a függvényt közvetlenül is meghívjuk) ─────────────
select public.ensure_cash_denominations();

-- ── 3) Ellenőrzés (várt: legalább a 12 hivatalos címlet, deleted=false) ──────
select id, name, val, divide, (val::numeric / greatest(divide, 1)) as ertek_ron
from public.nom_cimlet
where deleted is not true
order by (val::numeric / greatest(divide, 1)) desc;
