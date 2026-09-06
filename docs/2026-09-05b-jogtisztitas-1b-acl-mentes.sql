-- ═══════════════════════════════════════════════════════════════════════════
--  JOGTISZTÍTÁS — 1/b. LÉPÉS: TELJES ACL-PILLANATKÉP  =  EZ A MENTÉS
--  Fájl: docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql            (2026-09-05b)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIT CSINÁL
--  ──────────
--  Egyetlen rácsot ad: a `public` séma MINDEN rutinjának mai jogállapotát,
--  plusz egy KÉSZ SQL-oszlopot, amivel egy-egy rutin jogai visszaállíthatók.
--  Egyetlen sort sem ír, egyetlen jogot sem módosít.
--
--  ⚠️ MIÉRT KÜLÖN FÁJL: a Supabase SQL-szerkesztő CSAK AZ UTOLSÓ rácsot
--     mutatja. Amíg ez az előméréssel egy fájlban volt, egyetlen félrekattintás
--     elég lett volna ahhoz, hogy vagy a 28 soros előmérés vesszen el némán,
--     vagy a mentés maradjon el. Ismert, kétszer megfizetett hibaosztály
--     (pl. migration-docs/sql/2026-08-11-lelkeszi-naptar-token.sql:283-284).
--
--  A SORREND
--  ─────────
--    1a)  docs/2026-09-05b-jogtisztitas-1-elomeres.sql   (futtasd, küldd vissza)
--    1b)  EZ A FÁJL  → futtasd, és TÖLTSD LE CSV-BE. EZ A MENTÉS.
--    2)   Csak azután: migration-docs/sql/2026-09-05b-jogtisztitas-2-migracio.sql
--
--  ⛔ MIT TUD ÉS MIT NEM TUD EZ A MENTÉS — OLVASD EL, MIELŐTT MEGBÍZOL BENNE
--  ────────────────────────────────────────────────────────────────────────
--   TUDJA:  egy adott rutin MAI jogait pontosan reprodukálni. A
--           `visszaallito_parancsok` oszlop ELŐSZÖR mindent letakarít
--           (`REVOKE ALL … FROM <letező szerepek>, PUBLIC;`), és CSAK AZUTÁN
--           adja vissza a mai GRANT-okat. A sort EGÉSZBEN kell lefuttatni.
--   ⛔ NEM TUDJA: a puszta GRANT-ok visszajátszása NEM állítja vissza az
--           eredeti állapotot. A B) fájl 1) lépése több száz rutinra ÚJ,
--           EXPLICIT `authenticated` és `service_role` ACL-bejegyzést ír be;
--           egy előzetes REVOKE nélkül a visszajátszás a RÉGI és az ÚJ jogok
--           UNIÓJÁT adná. Pontosan ez az a bejegyzés-fajta, amiről a B) fájl
--           maga írja (B:100-102, B:448-450), hogy „az örökölt PUBLIC-jog
--           eltávolítható; egy explicit ACL-bejegyzés viszont már nem".
--           EZÉRT van minden sor elején a REVOKE.
--   ⚠️ AHOL `mai_acl` = NULL: annak a rutinnak MA NINCS saját ACL-bejegyzése,
--           a Postgres beépített alapértelmezése (`PUBLIC=X`) él. A PONTOS
--           visszaállítás ilyenkor az ACL KIÜRÍTÉSE, nem egy explicit
--           `GRANT … TO PUBLIC` — az MÁS katalógus-állapot. A generált sor
--           ezt külön ki is mondja a saját szövegében.
--
--  HOGYAN MENTSD
--  ─────────────
--   Futtasd le, majd a Supabase SQL-szerkesztő „Download CSV" gombjával
--   töltsd le, VAGY jelöld ki a teljes rácsot és másold be egy szövegfájlba.
--   SZÁNDÉKOSAN NEM ír mentő táblát a `public` sémába: ismert hibaosztály,
--   hogy minden ÚJ élő tábla besorolást kíván a `backup_table_policy`-ban,
--   különben a napi mentés fail-closed megáll. A mentés itt a Te CSV-d.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.oid::regprocedure::text                        AS szignatura,
  CASE p.prokind WHEN 'f' THEN 'fuggveny'
                 WHEN 'p' THEN 'eljaras'
                 WHEN 'a' THEN 'aggregatum'
                 WHEN 'w' THEN 'ablakfuggveny'
                 ELSE p.prokind::text END          AS fajta,
  p.prosecdef                                      AS security_definer,
  p.proowner::regrole::text                        AS tulajdonos,
  EXISTS (SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p.oid AND d.deptype = 'e') AS kiterjesztes_tag,
  COALESCE(p.proacl::text, '(NULL = orokolt alapertelmezes: PUBLIC=X)') AS mai_acl,
  -- ⚠️ BEÁGYAZOTT CASE minden szerepnél: a Postgres az AND kiértékelési
  --    sorrendjét NEM garantálja, tehát egy nem létező szerepnél a
  --    has_function_privilege 22023-mal elszállna, és az EGÉSZ mentés
  --    meghiúsulna — pont akkor, amikor a legnagyobb szükség lenne rá.
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       THEN has_function_privilege('anon', p.oid, 'EXECUTE') END          AS anon,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
       THEN has_function_privilege('service_role', p.oid, 'EXECUTE') END  AS service_role,

  -- ─────────────────────────────────────────────────────────────────────────
  -- A VISSZAÁLLÍTÓ SOR:  1) teljes takarítás  →  2) a mai GRANT-ok.
  -- A REVOKE szerep-listája a `pg_roles`-ból áll össze (NEM beégetve): egy
  -- nem létező szerepre kiadott REVOKE 42704-gyel elszállna.
  -- ─────────────────────────────────────────────────────────────────────────
  CASE WHEN p.proacl IS NULL
       THEN '-- FIGYELEM: ennek a rutinnak MA NINCS sajat ACL-bejegyzese (orokolt PUBLIC=X). '
            || 'A PONTOS visszaallitas az ACL KIURITESE: add ki CSAK a lenti REVOKE-ot, '
            || 'a GRANT ... TO PUBLIC-ot NE - az mar EXPLICIT bejegyzes lenne, ami mas katalogus-allapot. '
       ELSE '' END
  || 'REVOKE ALL ON ROUTINE ' || p.oid::regprocedure::text || ' FROM '
  || COALESCE((SELECT string_agg(quote_ident(ro.rolname), ', ' ORDER BY ro.rolname)
               FROM pg_roles ro
               WHERE ro.rolname = ANY(ARRAY['anon','authenticated','service_role',
                                            'supabase_auth_admin','supabase_storage_admin',
                                            'authenticator','dashboard_user'])) || ', ', '')
  || 'PUBLIC; '
  || COALESCE((SELECT string_agg(
                 'GRANT ' || a.privilege_type || ' ON ROUTINE ' || p.oid::regprocedure::text
                 || ' TO ' || CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                   ELSE quote_ident(pg_get_userbyid(a.grantee)) END || ';',
                 ' ' ORDER BY a.grantee, a.privilege_type)
               FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a.privilege_type = 'EXECUTE'), '')          AS visszaallito_parancsok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1;
