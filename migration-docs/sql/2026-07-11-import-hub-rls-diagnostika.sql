-- =============================================================================
-- 2026-07-11 — Admin Import-hub: RLS-diagnosztika (CSAK OLVASÁS, nem módosít)
-- =============================================================================
--
-- Kontextus: az /admin/import gyülekezet-választós központból a rendszergazda
-- BÁRMELYIK gyülekezethez importálhat. A tagnyilvántartás (members) modul a
-- meglévő RPC-ken megy (import_family_head_batch stb. — jellemzően SECURITY
-- DEFINER, azaz RLS-t megkerül), így ott a cross-congregation import már
-- működik. A multi-sheet modulok (Anyakönyv/Pénzügy/Munkanapló/Iktató) azonban
-- KÖZVETLEN insert-et hajtanak végre a felhasználó session-jével
-- (batch-import-actions.ts → supabase.from(targetTable).insert()), így RLS alá
-- esnek.
--
-- KÉRDÉS: engedi-e az RLS, hogy egy master/teljes admin a SAJÁT effektív
-- gyülekezetétől ELTÉRŐ congregation_id-vel szúrjon be sort? Ha a meglévő
-- INSERT-policy csak a felhasználó saját gyülekezetére enged (WITH CHECK
-- congregation_id = <saját>), akkor a multi-sheet admin-import minden sora
-- RLS-hibával kihagyódik (az UI ezt soronként jelzi — nem omlik össze).
--
-- Ez a script CSAK diagnosztika: kilistázza az érintett táblák INSERT-policy-jait.
-- Az eredmény alapján dönthető el, kell-e admin-permisszív policy (külön,
-- jóváhagyott migrációban — EZ A FÁJL NEM MÓDOSÍT SEMMIT).
-- =============================================================================

-- 1) INSERT-policy-k az import-céltáblákon
select
  c.relname                as tabla,
  pol.polname              as policy,
  case pol.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end                      as parancs,
  pg_get_expr(pol.polqual, pol.polrelid)      as using_kifejezes,
  pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_kifejezes
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'szemely', 'csalad', 'presbiter',
    'befizetes', 'kiadas',
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes',
    'bekoltozott', 'elkoltozott', 'attert', 'kitert',
    'munkanaplo', 'iktato'
  )
  and pol.polcmd in ('a', '*')  -- INSERT vagy ALL
order by c.relname, pol.polname;

-- 2) Van-e a projektben admin/master-felismerő segédfüggvény, amire egy jövőbeli
--    admin-permisszív policy építhet? (pl. is_admin(), is_master(), is_god_mode())
select
  p.proname                as fuggveny,
  pg_get_function_result(p.oid) as visszateres,
  pg_get_functiondef(p.oid)     as definicio
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%is_admin%'
    or p.proname ilike '%is_master%'
    or p.proname ilike '%god_mode%'
    or p.proname ilike '%is_god%'
  )
order by p.proname;

-- 3) RLS engedélyezve van-e egyáltalán ezeken a táblákon?
select
  c.relname       as tabla,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'szemely', 'csalad', 'presbiter',
    'befizetes', 'kiadas',
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes',
    'bekoltozott', 'elkoltozott', 'attert', 'kitert',
    'munkanaplo', 'iktato'
  )
order by c.relname;

-- =============================================================================
-- ÉRTELMEZÉS:
--   - Ha a WITH CHECK kifejezés a felhasználó saját congregation_id-jéhez köti a
--     beszúrást (és nincs admin/god-mode ág), akkor a multi-sheet ADMIN
--     cross-congregation import RLS-be ütközik → külön, jóváhagyott migráció kell,
--     amely a (2) pontban talált admin/master segédfüggvényre épülő permisszív
--     INSERT-policy-t ad hozzá az érintett táblákhoz.
--   - Ha már van admin/master/god-mode ág a WITH CHECK-ben, akkor a hub multi-sheet
--     importja RLS-szinten is működik, nincs teendő.
-- =============================================================================
