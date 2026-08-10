-- KARTOTEKA — EGYETLEN lekérdezés: RLS-állapot + maradék árvák (2026-08-10)
--
-- MIÉRT ÍGY: a Supabase SQL Editor több utasításnál CSAK AZ UTOLSÓ eredményét
-- mutatja, ezért a fontos válaszok háromszor elvesztek. Ez a fájl EGYETLEN
-- SELECT-et tartalmaz — bármit is jelölsz ki, ez az eredmény jön vissza.
--
-- HOGYAN OLVASD:
--   • „ÖSSZEGZÉS: profiles RLS"            → true = rendben, false = SÜRGŐS
--   • „ÖSSZEGZÉS: RLS-kikapcsolt táblák"   → 0 = rendben
--   • „RLS KIKAPCSOLVA" sorok              → ezeken a táblákon a policy-k
--     TÉTLENEK (a „policy_db" mutatja, hány policy vár hiába)
--   • „ÖSSZEGZÉS: egyházmegye nélküli gyülekezet" → 0 = rendben, különben az
--     /admin/gyulekezetek oldalon rendelhető hozzá megye

SELECT x.tetel, x.reszlet, x.ertek
FROM (
  -- ── Összegző sorok (elöl) ────────────────────────────────────────────────
  SELECT 0 AS sorrend,
         'ÖSSZEGZÉS: profiles RLS bekapcsolva'::text AS tetel,
         ''::text AS reszlet,
         (SELECT c.relrowsecurity::text
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'profiles') AS ertek

  UNION ALL
  SELECT 1,
         'ÖSSZEGZÉS: RLS-kikapcsolt táblák száma',
         '',
         (SELECT count(*)::text
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND c.relrowsecurity = false)

  UNION ALL
  SELECT 2,
         'ÖSSZEGZÉS: egyházmegye nélküli gyülekezet',
         '',
         (SELECT count(*)::text FROM public.congregations WHERE diocese_id IS NULL)

  -- ── Részletek: mely táblákon van kikapcsolva az RLS ──────────────────────
  UNION ALL
  SELECT 3,
         'RLS KIKAPCSOLVA',
         c.relname::text,
         'policy_db=' || (SELECT count(*) FROM pg_policies p
                           WHERE p.schemaname = 'public' AND p.tablename = c.relname)::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false

  -- ── Részletek: mely gyülekezeteknek nincs egyházmegyéje ──────────────────
  UNION ALL
  SELECT 4,
         'EGYHÁZMEGYE NÉLKÜL',
         COALESCE(cg.nev_hu, cg.name)::text,
         COALESCE(NULLIF(btrim(cg.egyhazmegye), ''), '(nincs szöveges megye sem)')
  FROM public.congregations cg
  WHERE cg.diocese_id IS NULL
) x
ORDER BY x.sorrend, x.reszlet;
