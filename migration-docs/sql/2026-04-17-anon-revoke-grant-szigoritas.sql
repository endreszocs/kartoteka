-- =========================================================================
-- 2026-04-17 — KRITIKUS BIZTONSÁGI JAVÍTÁS: anon REVOKE + authenticated szigorítás
-- =========================================================================
-- AUDIT EREDMÉNYE (2026-04-17):
--   * Az `anon` (bejelentkezetlen) szerep TELJES jogosultságokat (SELECT, INSERT,
--     UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE) kapott a kritikus magán
--     táblákon: befizetes, csalad, gyerek, hazassag, iktato, keresztseg,
--     kiadas, koltsegvetes, konfirmalas, munkanaplo, szemely, temetes.
--   * Az `authenticated` szerep is veszélyes jogokat kapott: TRUNCATE (egy
--     lelkész kiüríthet egy egész táblát!), REFERENCES, TRIGGER.
--
-- ALAPELV (Endre, 2026-04-17):
--   * Az `anon` szerep CSAK a publikus tartalomhoz (public_sites, public_posts,
--     public_magazines, daily_verse, stb.) férhet hozzá — a magán táblákhoz
--     SOHA.
--   * Az `authenticated` szerep csak a normális CRUD jogokat kapja (SELECT,
--     INSERT, UPDATE, DELETE) — soha TRUNCATE/REFERENCES/TRIGGER.
--
-- Ez a fájl IDEMPOTENS — biztonsággal újrafuttatható.
-- =========================================================================

-- 1) ANON REVOKE — a bejelentkezetlen szerep MINDEN jogának visszavétele
--    a magán táblákról

REVOKE ALL ON public.befizetes FROM anon;
REVOKE ALL ON public.kiadas FROM anon;
REVOKE ALL ON public.szemely FROM anon;
REVOKE ALL ON public.csalad FROM anon;
REVOKE ALL ON public.gyerek FROM anon;
REVOKE ALL ON public.keresztseg FROM anon;
REVOKE ALL ON public.hazassag FROM anon;
REVOKE ALL ON public.temetes FROM anon;
REVOKE ALL ON public.konfirmalas FROM anon;
REVOKE ALL ON public.iktato FROM anon;
REVOKE ALL ON public.koltsegvetes FROM anon;
REVOKE ALL ON public.munkanaplo FROM anon;

-- További táblák, amelyeknek szintén nem szabad anon hozzáférést adni
-- (a phase-0 hardening után ne feltételezzünk semmit — explicit REVOKE)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'bankszamlak', 'belsomozgas', 'leltar_tetelek', 'sirhely',
    'sirhelyberles', 'sirhelyelhunyt', 'sirhelytemeto',
    'kiadasikiseroiv', 'jarulek_kedvezmeny', 'valuta_atert',
    'oblio_szamlak', 'oblio_kiadas_match', 'oblio_fiokok',
    'berleti_szerzodes', 'iktato_sablonok', 'presbiter',
    'csaladlatogatas', 'bekoltozott', 'elkoltozott', 'attert', 'kitert',
    'felmentes', 'congregation_annual_fees', 'document_submissions',
    'bealitas', 'profile_congregations', 'admin_access_requests',
    'annual_reports', 'monetar', 'transactions',
    'jegyzokonyv_napirendi_pontok', 'jegyzokonyv_hatarozatok',
    'jegyzokonyv_resztvevok', 'presbiteri_jegyzokonyvek',
    'pastor_profiles', 'support_messages', 'ertesitesek',
    'logger', 'import_logs', 'system_settings'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END$$;

-- 2) AUTHENTICATED szigorítás — a veszélyes jogok visszavétele
--    A normális CRUD jogok (SELECT, INSERT, UPDATE, DELETE) megmaradnak.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'iktato', 'koltsegvetes', 'munkanaplo', 'leltar_tetelek',
    'bankszamlak', 'belsomozgas', 'sirhely', 'sirhelyberles',
    'sirhelyelhunyt', 'sirhelytemeto', 'kiadasikiseroiv',
    'jarulek_kedvezmeny', 'valuta_atert', 'berleti_szerzodes',
    'iktato_sablonok', 'presbiter', 'csaladlatogatas',
    'bekoltozott', 'elkoltozott', 'attert', 'kitert', 'felmentes',
    'document_submissions', 'bealitas', 'profile_congregations',
    'admin_access_requests', 'annual_reports', 'congregation_annual_fees',
    'oblio_szamlak', 'oblio_kiadas_match', 'oblio_fiokok',
    'jegyzokonyv_napirendi_pontok', 'jegyzokonyv_hatarozatok',
    'jegyzokonyv_resztvevok', 'presbiteri_jegyzokonyvek',
    'monetar', 'transactions'
  ])
  LOOP
    -- TRUNCATE: tábla teljes törlése — SOHA ne legyen authenticated-nek
    -- REFERENCES: foreign key létrehozása mások tábláira — nem kell user-nek
    -- TRIGGER: trigger létrehozása — admin-only feladat
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END$$;

-- 3) Biztosítjuk, hogy a service_role mindent kapjon (admin szervízoknak)
--    — ez nem javítás, csak biztonsági redundancia
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'iktato', 'koltsegvetes', 'munkanaplo'
  ])
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END$$;

-- =========================================================================
-- ELLENŐRZÉS — futtasd ugyanitt
-- =========================================================================

-- 1) Anon nem kap semmit a privát táblákon?
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'iktato', 'koltsegvetes', 'munkanaplo'
  )
GROUP BY table_name, grantee
ORDER BY table_name;
-- VÁRT EREDMÉNY: ÜRES tábla (nincs egy sem)

-- 2) Authenticated csak DELETE/INSERT/SELECT/UPDATE-t kap?
SELECT
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN (
    'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek',
    'keresztseg', 'hazassag', 'temetes', 'konfirmalas',
    'iktato', 'koltsegvetes', 'munkanaplo'
  )
GROUP BY table_name
ORDER BY table_name;
-- VÁRT EREDMÉNY: minden sor "DELETE, INSERT, SELECT, UPDATE" (nincs TRUNCATE/TRIGGER/REFERENCES)
