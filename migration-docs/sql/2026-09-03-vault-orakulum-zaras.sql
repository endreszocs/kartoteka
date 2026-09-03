-- =============================================================================
-- A VAULT-ORÁKULUM ZÁRÁSA  (átvilágítás P0, 2026-09-03)
-- =============================================================================
--
-- ⛔ A HIBA, AMIT JAVÍT
--
-- 1) A `public.vault_decrypt(encrypted_input, key_input)` SECURITY DEFINER
--    függvény, és a KULCSOT PARAMÉTERBEN kapja. A létrehozó migráció
--    (2026-04-16-wc2-vault-functions.sql) EGYETLEN GRANT/REVOKE sort sem
--    tartalmaz → a PostgreSQL alapértelmezése szerint PUBLIC EXECUTE marad.
--    Vagyis bárki, aki be tud jelentkezni, a böngésző konzoljából
--    TETSZŐLEGES kulccsal hívhatja: ez egy visszafejtő ORÁKULUM.
--
-- 2) A `public.oblio_fiokok`-ra teljes táblás `GRANT SELECT ... TO authenticated`
--    van, az RLS pedig CSAK sor-szintű — így az `api_secret_encrypted`
--    rejtjelszöveg benne van minden `select('*')`-ban, kliensről is.
--
-- A kettő együtt: a rejtjelszöveg kiolvasható, majd az orákulumon próbálgatható.
-- Az alkalmazás saját kulcslánca a 6 jegyű god-mode PIN-t és az ÖRÖKÖLT ÜRES
-- KULCSOT is tartalmazza (secret-vault.ts) — az üres kulcsú régi sorok tehát
-- ELSŐ PRÓBÁLKOZÁSRA nyílnak, a PIN-esek 10^6 online próbálkozásból. A nyeremény
-- nemcsak az Oblio API-kulcs (amivel valódi, ANAF SPV-re felmenő e-Facturát
-- lehet kiállítani és sztornózni a gyülekezet nevében), hanem MAGA A PIN is.
--
-- ⚠️ ELŐFELTÉTEL — ELŐBB A KÓD, UTÁNA EZ AZ SQL
-- A `secret-vault.ts` mostantól a SERVICE-ROLE klienssel hívja a két függvényt
-- (2026-09-03-i javítás). Ez az SQL csak azután futtatható, hogy az a verzió
-- ÉLESBEN van — különben az Oblio-funkciók (számla-kiállítás, kapcsolat-teszt,
-- kintlévőség-lista) jogosultsági hibára futnak.
-- Ellenőrizd: a Pénzügy → Oblio beállítás „Kapcsolat tesztelése" gombja működik-e.
--
-- Futtatás: Supabase SQL editor, egyben.
-- =============================================================================

BEGIN;

-- ── 1) A VISSZAFEJTŐ ORÁKULUM BEZÁRÁSA ──────────────────────────────────────
-- A szerep-lista tolerálja a nem létező szerepeket: a member-portál szerepek
-- egy része a repóban létezik, élesben nem feltétlenül (megégett lecke).
DO $$
DECLARE
  fv text;
  szerep text;
BEGIN
  FOREACH fv IN ARRAY ARRAY[
    'public.vault_encrypt(text,text)',
    'public.vault_decrypt(text,text)'
  ] LOOP
    -- PUBLIC-tól mindenképp
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fv);

    FOREACH szerep IN ARRAY ARRAY[
      'anon', 'authenticated', 'app_staff_user', 'app_pending_user', 'member_portal_user'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = szerep) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fv, szerep);
      END IF;
    END LOOP;

    -- A szerver-oldali kód (service_role) továbbra is futtathatja.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fv);
    END IF;
  END LOOP;
END $$;

-- ── 2) A REJTJELSZÖVEG SE LEGYEN KLIENSRŐL OLVASHATÓ ────────────────────────
-- Teljes táblás SELECT helyett OSZLOP-SZINTŰ jog: az `api_secret_encrypted` és
-- az `utolso_token` kimarad. A repó minden Oblio-lekérdezése explicit
-- oszloplistás, ezért ez nem tör el felületet — a `select('*')` viszont
-- (helyesen) 42501-et kapna.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE SELECT ON public.oblio_fiokok FROM authenticated;

    EXECUTE (
      SELECT format(
        'GRANT SELECT (%s) ON public.oblio_fiokok TO authenticated',
        string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      )
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'oblio_fiokok'
        AND column_name NOT IN ('api_secret_encrypted', 'utolso_token')
    );
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ELLENŐRZÉS (a COMMIT után külön futtatva)
-- =============================================================================

-- ⚠️ EGYETLEN lekérdezés, UNION ALL-lal: a Supabase SQL editor CSAK AZ UTOLSÓ
--    eredmény-rácsot mutatja, ezért három külön SELECT-ből kettőt sosem látnál.

SELECT * FROM (

  -- (A) A két függvény jogai. A `proacl` NULL = PUBLIC EXECUTE (ez a hiba maga).
  SELECT
    1                                                     AS sorrend,
    'A · függvény-jogok'                                  AS vizsgalat,
    p.oid::regprocedure::text                             AS targy,
    COALESCE(array_to_string(p.proacl, ' | '), 'NULL = PUBLIC EXECUTE') AS reszlet,
    CASE
      WHEN p.proacl IS NULL                                        THEN '⛔ NYITVA — a REVOKE nem futott le'
      WHEN array_to_string(p.proacl, ',') LIKE '%authenticated=X%' THEN '⛔ NYITVA — authenticated még futtathatja'
      WHEN array_to_string(p.proacl, ',') LIKE '%service_role=X%'  THEN '✅ zárva, a szerver futtathatja'
      ELSE '⚠ zárva, de a service_role sem futtathatja — az Oblio elromlik'
    END                                                   AS allapot
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('vault_encrypt', 'vault_decrypt')

  UNION ALL

  -- (B) OLVASHATJA-e még a rejtjelszöveget a bejelentkezett felhasználó?
  --     HELYES EREDMÉNY: innen NULLA sor jön.
  --
  --     ⚠️ CSAK A SELECT SZÁMÍT. Az INSERT/UPDATE jog ezeken az oszlopokon
  --     SZÁNDÉKOSAN megmarad: az Oblio-beállítás mentése (`saveOblioConfig`) a
  --     bejelentkezett felhasználó kapcsolatán ír — a titkot már titkosítva.
  --     Írni tudni nem jelent olvasni tudást, és a sorokat továbbra is az RLS
  --     határolja. (A javítás első futásán ez a szűrő hiányzott, és a lekérdezés
  --     vaklármát adott: INSERT/UPDATE sorokat jelentett szivárgásként.)
  SELECT
    2,
    'B · rejtjelszöveg-OLVASÁS',
    cp.column_name || ' → ' || cp.grantee,
    cp.privilege_type,
    '⛔ EZ NEM MARADHAT ITT'
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public'
    AND cp.table_name = 'oblio_fiokok'
    AND cp.column_name IN ('api_secret_encrypted', 'utolso_token')
    AND cp.grantee IN ('authenticated', 'anon', 'PUBLIC')
    AND cp.privilege_type = 'SELECT'

  UNION ALL

  -- (C) Hány titok él még (a tartalomhoz nem nyúlunk, csak darabszám).
  SELECT
    3,
    'C · tárolt titkok',
    'oblio_fiokok, api_secret_encrypted IS NOT NULL',
    count(*)::text,
    CASE WHEN count(*) > 0
      THEN '⚠ érdemes a titkot ÚJRA MENTENI a felületről, hogy erős kulccsal íródjon felül'
      ELSE '✅ nincs tárolt titok'
    END
  FROM public.oblio_fiokok
  WHERE api_secret_encrypted IS NOT NULL

) AS ellenorzes
ORDER BY sorrend, targy;
