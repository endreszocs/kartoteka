-- ═══════════════════════════════════════════════════════════════════════════
--  TAGNYILVÁNTARTÁS + ANYAKÖNYV ÁTVILÁGÍTÁS — ÉLŐ ÁLLAPOTFELMÉRÉS (CSAK OLVAS)
--  2026-09-02 — Futtatja: Endre (Supabase Studio SQL Editor)
--  2026-09-03 — JAVÍTVA: felesleges ')' + egy holt CTE, ami a 2. lekérdezés
--               táblájára hivatkozott; + új 0. ELŐPRÓBA blokk.
--
--  MIÉRT: a repó SQL-je nem bizonyíték az élő állapotra. Több audit-találat
--  súlya azon múlik, mi fut ÉLESBEN (indexek, triggerek, függvény-verziók,
--  policy-k) és mi van MÁR MOST az adatban (dupla sorszám, lyuk, státusz-
--  változatok). Ez a fájl SEMMIT nem módosít, egyetlen sort sem ír.
--
--  HOGYAN FUTTASD — HÁROM BLOKK, EGYESÉVEL. A Supabase SQL editor csak az
--  UTOLSÓ eredmény-rácsot mutatja, ezért NE futtasd az egész fájlt egyszerre:
--  jelöld ki az egyik blokkot (bannertől bannerig), Run, olvasd le, aztán a
--  következőt. Sorrend: 0. ELŐPRÓBA → 1. ÁLLAPOTFELMÉRÉS → 2. KÜLÖN TÁBLÁK.
--
--  OLVASÁS: a `szakasz` oszlop csoportosít, a `kulcs` a kérdés, az `ertek`
--  a válasz. A „⚠️" jelű sorok a repó szerinti elvárástól eltérnek.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  0. LEKÉRDEZÉS — ELŐPRÓBA (ezt futtasd ELŐSZÖR, külön)
--
--  MIÉRT: az 1. lekérdezés 10 táblára és azok konkrét oszlopaira hivatkozik
--  KÖZVETLENÜL. Ha bármelyik hiányzik az élő adatbázisból, az 1. lekérdezés
--  egyetlen hibaüzenettel elhasal, és nem derül ki, MI hiányzik. Ez a blokk
--  ezt előre megmondja. Semmit nem módosít.
--
--  Jelöld ki innentől az "1. LEKÉRDEZÉS" bannerig, és futtasd.
-- ═══════════════════════════════════════════════════════════════════════════

WITH kell(tabla, oszlop) AS (
  VALUES
    ('szemely','id'), ('szemely','cnp'), ('szemely','congregation_id'), ('szemely','isvisible'),
    ('szemely','meghalt'), ('szemely','member_status'),
    ('csalad','id_ferfi'), ('csalad','id_no'),
    ('keresztseg','congregation_id'), ('keresztseg','egyhazi_szam'), ('keresztseg','datum'), ('keresztseg','id_szemely'),
    ('konfirmalas','congregation_id'), ('konfirmalas','egyhazi_szam'), ('konfirmalas','id_szemely'),
    ('hazassag','congregation_id'), ('hazassag','egyhazi_szam'), ('hazassag','datum'), ('hazassag','id_ferfi'),
    ('temetes','congregation_id'), ('temetes','egyhazi_szam'), ('temetes','tdatum'), ('temetes','id_szemely'),
    ('bekoltozott','congregation_id'), ('bekoltozott','egyhazi_szam'),
    ('elkoltozott','congregation_id'), ('elkoltozott','egyhazi_szam'), ('elkoltozott','id_szemely'),
    ('attert','congregation_id'), ('attert','egyhazi_szam'),
    ('kitert','congregation_id'), ('kitert','egyhazi_szam')
),
hianyok AS (
  SELECT k.tabla, k.oszlop, (to_regclass('public.' || k.tabla) IS NULL) AS tabla_hianyzik
  FROM kell k
  WHERE to_regclass('public.' || k.tabla) IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = k.tabla AND c.column_name = k.oszlop)
),
p_verdikt AS (
  SELECT '0-előpróba' AS szakasz, '1) ➡️ FUTTATHATÓ-E az 1. LEKÉRDEZÉS?' AS kulcs,
         CASE WHEN (SELECT count(*) FROM hianyok) = 0
              THEN '✅ IGEN — futtasd az 1. LEKÉRDEZÉST'
              ELSE '⛔ NEM — előbb nézd meg a lenti hiányzó tételeket (az 1. lekérdezés ezeken hasalna el)' END AS ertek
),
p_tabla AS (
  SELECT '0-előpróba', '2) HIÁNYZÓ tábla',
         COALESCE(string_agg(DISTINCT tabla, ', '), '✅ mind a 10 tábla megvan')
  FROM hianyok WHERE tabla_hianyzik
),
p_oszlop AS (
  SELECT '0-előpróba', '3) HIÁNYZÓ oszlop (a tábla létezik)',
         COALESCE(string_agg(tabla || '.' || oszlop, ', ' ORDER BY tabla, oszlop), '✅ minden hivatkozott oszlop megvan')
  FROM hianyok WHERE NOT tabla_hianyzik
),
p_datum AS (
  SELECT '0-előpróba', '4) dátum-oszlopok típusa (az ÉV-ELTÉRÉS sor EXTRACT-ja csak dátum/időbélyeg típuson megy)',
         COALESCE(string_agg(table_name || '.' || column_name || ' = ' || data_type, ' | ' ORDER BY table_name), '(egyik sem létezik)')
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'keresztseg'  AND column_name = 'datum')
      OR (table_name = 'hazassag'    AND column_name = 'datum')
      OR (table_name = 'konfirmalas' AND column_name = 'datum')
      OR (table_name = 'temetes'     AND column_name = 'tdatum'))
)
SELECT * FROM p_verdikt
UNION ALL SELECT * FROM p_tabla
UNION ALL SELECT * FROM p_oszlop
UNION ALL SELECT * FROM p_datum
ORDER BY 1, 2;

-- ═══════════════════════════════════════════════════════════════════════════
--  1. LEKÉRDEZÉS — AZ ÁLLAPOTFELMÉRÉS (jelöld ki innentől a 2. bannerig)
-- ═══════════════════════════════════════════════════════════════════════════
WITH
-- ── A) SÉMA-TÉNYEK ─────────────────────────────────────────────────────────
a_cnp_index AS (
  SELECT 'A-séma' AS szakasz, 'szemely.cnp indexek' AS kulcs,
         COALESCE(string_agg(indexname || ' :: ' || indexdef, ' | ' ORDER BY indexname), '(nincs)') AS ertek
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'szemely' AND indexdef ILIKE '%cnp%'
),
a_cnp_fk AS (
  SELECT 'A-séma', 'szemely FK-k (id_apja/id_anyja → cnp él-e?)',
         COALESCE(string_agg(conname || ' :: ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname), '(nincs FK)')
  FROM pg_constraint WHERE conrelid = 'public.szemely'::regclass AND contype = 'f'
),
a_notnull AS (
  SELECT 'A-séma', 'NOT NULL állapot (tábla.oszlop = is_nullable / default)',
         string_agg(table_name || '.' || column_name || ' = ' || is_nullable || ' / ' || COALESCE(column_default, 'nincs default'), ' | ' ORDER BY table_name, column_name)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND (
        (table_name = 'szemely' AND column_name IN ('befizetoev','c_utcaid','cnp','ferfi','sz_datum','congregation_id','member_status'))
     OR (table_name = 'csalad'  AND column_name IN ('c_utcaid','c_szam'))
     OR (table_name = 'keresztseg' AND column_name IN ('datum','munkanaploba','egyhazi_szam'))
     OR (table_name = 'temetes' AND column_name IN ('hdatum','tdatum','munkanaploba'))
     OR (table_name = 'hazassag' AND column_name IN ('datum','munkanaploba'))
     OR (table_name = 'bekoltozott' AND column_name IN ('mikor'))
     OR (table_name = 'elkoltozott' AND column_name IN ('mikor','kulfoldre'))
  )
),
a_collation AS (
  SELECT 'A-séma', 'adatbázis collation / ctype',
         (SELECT datcollate || ' / ' || datctype FROM pg_database WHERE datname = current_database())
),
a_egyhazi_szam_idx AS (
  SELECT 'A-séma', 'UNIQUE/CHECK az egyhazi_szam-on (8 anyakönyvi tábla)',
         COALESCE((SELECT string_agg(tablename || ': ' || indexname, ' | ')
                   FROM pg_indexes WHERE schemaname = 'public'
                     AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes','bekoltozott','elkoltozott','attert','kitert')
                     AND indexdef ILIKE '%egyhazi_szam%'), '⚠️ NINCS index az egyhazi_szam-on egyik táblán sem')
),
a_csalad_unique AS (
  SELECT 'A-séma', 'csalad egyediségi indexek (a kód 3 UNIQUE-ra épít: id_ferfi, id_no, (id_ferfi,id_no))',
         COALESCE((SELECT string_agg(indexname || ' :: ' || indexdef, ' | ' ORDER BY indexname)
                   FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'csalad'
                     AND (indexdef ILIKE '%id_ferfi%' OR indexdef ILIKE '%id_no%')), '(nincs)')
),
-- ── B) TRIGGEREK ───────────────────────────────────────────────────────────
b_triggers AS (
  SELECT 'B-trigger', 'triggerek a tag/család/anyakönyvi táblákon',
         COALESCE(string_agg(c.relname || ' ← ' || t.tgname || (CASE WHEN t.tgenabled = 'D' THEN ' (LETILTVA)' ELSE '' END), ' | ' ORDER BY c.relname, t.tgname), '(nincs)')
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
    AND c.relname IN ('szemely','csalad','gyerek','haztartas','haztartas_tag','szemely_kapcsolat','cim',
                      'keresztseg','konfirmalas','hazassag','temetes','bekoltozott','elkoltozott','attert','kitert')
),
b_audit_trg AS (
  SELECT 'B-trigger', 'audit.record_version trigger (audit_trg) mely táblákon?',
         COALESCE((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
                   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname ILIKE '%audit%'), '⚠️ sehol')
),
-- ── C) FÜGGVÉNY-VERZIÓK ────────────────────────────────────────────────────
c_fn AS (
  SELECT 'C-függvény' AS szakasz,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kulcs,
         'md5=' || md5(p.prosrc) || ' · hossz=' || length(p.prosrc)
         || ' · SECDEF=' || p.prosecdef::text
         || CASE WHEN p.proname = 'generate_egyhazi_anyakonyvi_szam' THEN
                 ' · tenant-kapu(auth.uid)=' || (p.prosrc ILIKE '%auth.uid()%')::text
              || ' · lock=' || (p.prosrc ILIKE '%pg_advisory%' OR p.prosrc ILIKE '%FOR UPDATE%')::text
            WHEN p.proname = 'tagnyilvantartas_tag_torles' THEN
                 ' · portál-kompat(marker)=' || (p.prosrc ILIKE '%member_person_links%' OR p.prosrc ILIKE '%portal%')::text
              || ' · törli-e a mozgás-könyveket=' || (p.prosrc ILIKE '%DELETE FROM public.elkoltozott%')::text
            WHEN p.proname = 'current_user_can_access_congregation' THEN
                 ' · felettes_szint(megyei olvasó ág)=' || (p.prosrc ILIKE '%felettes_szint_hozzaferese%')::text
            ELSE '' END AS ertek
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'generate_egyhazi_anyakonyvi_szam','import_registry_batch','tagnyilvantartas_tag_torles',
    'respond_to_member_transfer_notification','create_transfer_notification_on_elkoltozott',
    'set_szemely_meghalt_on_temetes','recompute_voter_eligibility','tagnyilvantartas_csalad_mentes',
    'sync_households_from_csalad','current_user_can_access_congregation','current_user_has_global_access',
    'felettes_szint_hozzaferese','find_potential_cross_congregation_match','szemely_kapcsolatok',
    'app_get_or_create_locality','wipe_congregation_data','normalize_name')
),
c_missing AS (
  SELECT 'C-függvény', '⚠️ HIÁNYZÓ függvény: ' || f, 'nincs a public sémában'
  FROM unnest(ARRAY['respond_to_member_transfer_notification','generate_egyhazi_anyakonyvi_szam','tagnyilvantartas_tag_torles','szemely_kapcsolatok']) AS f
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f)
),
-- ── D) POLICY-K ────────────────────────────────────────────────────────────
d_policies AS (
  SELECT 'D-policy' AS szakasz, tablename AS kulcs,
         string_agg(policyname || ' [' || cmd || '] USING(' || COALESCE(qual, '-') || ')' || COALESCE(' CHECK(' || with_check || ')', ''), ' | ' ORDER BY policyname) AS ertek
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('szemely','csalad','gyerek','haztartas','haztartas_tag','szemely_kapcsolat',
                      'keresztseg','temetes','elkoltozott','member_transfer_notifications')
  GROUP BY tablename
),
-- ── E) ADATMINŐSÉG — SORSZÁM ───────────────────────────────────────────────
e_dup AS (
  SELECT 'E-sorszám' AS szakasz, 'DUPLA egyhazi_szam (tábla: db)' AS kulcs,
         COALESCE(NULLIF(string_agg(t || ': ' || n, ' | '), ''), 'nincs dupla') AS ertek
  FROM (
    SELECT 'keresztseg' t, count(*) n FROM (SELECT congregation_id, egyhazi_szam FROM public.keresztseg WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'konfirmalas', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.konfirmalas WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'hazassag', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.hazassag WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'temetes', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.temetes WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'bekoltozott', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.bekoltozott WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'elkoltozott', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.elkoltozott WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'attert', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.attert WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
    UNION ALL SELECT 'kitert', count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.kitert WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x
  ) d WHERE n > 0
),
e_null AS (
  SELECT 'E-sorszám', 'SZÁM NÉLKÜLI anyakönyvi sorok (tábla: db / összes)',
         (SELECT string_agg(t || ': ' || nn || ' / ' || total, ' | ') FROM (
            SELECT 'keresztseg' t, count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = '') nn, count(*) total FROM public.keresztseg
            UNION ALL SELECT 'konfirmalas', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.konfirmalas
            UNION ALL SELECT 'hazassag', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.hazassag
            UNION ALL SELECT 'temetes', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.temetes
            UNION ALL SELECT 'bekoltozott', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.bekoltozott
            UNION ALL SELECT 'elkoltozott', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.elkoltozott
            UNION ALL SELECT 'attert', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.attert
            UNION ALL SELECT 'kitert', count(*) FILTER (WHERE egyhazi_szam IS NULL OR trim(egyhazi_szam) = ''), count(*) FROM public.kitert
         ) s)
),
e_format AS (
  SELECT 'E-sorszám', 'ROSSZ FORMÁTUMÚ egyhazi_szam (nem ^[0-9]{10}$) — ez megbénítja a generátor ::integer cast-ját',
         (SELECT string_agg(t || ': ' || n, ' | ') FROM (
            SELECT 'keresztseg' t, count(*) n FROM public.keresztseg WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$'
            UNION ALL SELECT 'konfirmalas', count(*) FROM public.konfirmalas WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$'
            UNION ALL SELECT 'hazassag', count(*) FROM public.hazassag WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$'
            UNION ALL SELECT 'temetes', count(*) FROM public.temetes WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$'
            UNION ALL SELECT 'mozgás(4)', (SELECT count(*) FROM public.bekoltozott WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$')
                                        + (SELECT count(*) FROM public.elkoltozott WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$')
                                        + (SELECT count(*) FROM public.attert WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$')
                                        + (SELECT count(*) FROM public.kitert WHERE egyhazi_szam IS NOT NULL AND egyhazi_szam !~ '^[0-9]{10}$')
         ) s)
),
e_year AS (
  SELECT 'E-sorszám', 'ÉV-ELTÉRÉS: a szám évelőtagja ≠ az esemény éve (keresztseg / hazassag / temetes[tdatum] / konfirmalas)',
         (SELECT count(*) FROM public.keresztseg WHERE egyhazi_szam ~ '^[0-9]{10}$' AND left(egyhazi_szam,4)::int <> EXTRACT(YEAR FROM datum)::int)::text
         || ' / ' || (SELECT count(*) FROM public.hazassag WHERE egyhazi_szam ~ '^[0-9]{10}$' AND left(egyhazi_szam,4)::int <> EXTRACT(YEAR FROM datum)::int)::text
         || ' / ' || (SELECT count(*) FROM public.temetes WHERE egyhazi_szam ~ '^[0-9]{10}$' AND left(egyhazi_szam,4)::int <> EXTRACT(YEAR FROM tdatum)::int)::text
         || ' / ' || (SELECT count(*) FROM public.konfirmalas WHERE egyhazi_szam ~ '^[0-9]{10}$' AND left(egyhazi_szam,4)::int <> EXTRACT(YEAR FROM datum)::int)::text
),
e_gaps AS (
  SELECT 'E-sorszám', 'LYUKAK a keresztelési sorszámban (gyülekezet/év: max − darab, ahol > 0; első 20)',
         COALESCE((SELECT string_agg(congregation_id::text || '/' || ev || ': ' || (mx - db), ' | ')
                   FROM (SELECT congregation_id, left(egyhazi_szam,4) ev, max(substring(egyhazi_szam from 7 for 4)::int) mx, count(*) db
                         FROM public.keresztseg WHERE egyhazi_szam ~ '^[0-9]{10}$' GROUP BY 1,2
                         HAVING max(substring(egyhazi_szam from 7 for 4)::int) <> count(*) ORDER BY 1,2 LIMIT 20) g), 'nincs lyuk')
),
-- ── F) ADATMINŐSÉG — SZEMÉLY ÉS ÁLLAPOT ────────────────────────────────────
f_status AS (
  SELECT 'F-állapot', 'member_status értékkészlet (érték: db)',
         (SELECT string_agg(COALESCE(member_status, 'NULL') || ': ' || n, ' | ' ORDER BY n DESC)
          FROM (SELECT member_status, count(*) n FROM public.szemely GROUP BY 1) s)
),
f_meghalt_no_temetes AS (
  SELECT 'F-állapot', 'meghalt=true, de NINCS temetési sor',
         (SELECT count(*) FROM public.szemely s WHERE s.meghalt AND NOT EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = s.id))::text
),
f_temetes_no_meghalt AS (
  SELECT 'F-állapot', 'VAN temetési sor, de meghalt=false vagy member_status≠elhunyt',
         (SELECT count(*) FROM public.szemely s WHERE EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = s.id)
             AND (NOT s.meghalt OR s.member_status IS DISTINCT FROM 'elhunyt'))::text
),
f_elkolt_no_status AS (
  SELECT 'F-állapot', 'VAN elköltözési sor, de a státusz aktív (bármely írásmód)',
         (SELECT count(*) FROM public.szemely s WHERE EXISTS (SELECT 1 FROM public.elkoltozott e WHERE e.id_szemely = s.id)
             AND COALESCE(s.member_status,'') NOT ILIKE 'elk%')::text
),
f_null_cong AS (
  SELECT 'F-állapot', 'szemely.congregation_id IS NULL (látható / összes)',
         (SELECT count(*) FILTER (WHERE isvisible) || ' / ' || count(*) FROM public.szemely WHERE congregation_id IS NULL)
),
f_cnp_dup AS (
  SELECT 'F-állapot', 'CNP-duplikátum GYÜLEKEZETEN BELÜL (látható sorok) / GLOBÁLISAN',
         (SELECT count(*) FROM (SELECT congregation_id, cnp FROM public.szemely WHERE isvisible GROUP BY 1,2 HAVING count(*) > 1) d)::text
         || ' / ' || (SELECT count(*) FROM (SELECT cnp FROM public.szemely GROUP BY 1 HAVING count(*) > 1) d)::text
),
f_generated_cnp AS (
  SELECT 'F-állapot', 'generált CNP-k (999… / EC-…) / valódi',
         (SELECT count(*) FILTER (WHERE cnp ~ '^999[0-9]{7}$') || ' / ' || count(*) FILTER (WHERE cnp LIKE 'EC-%') || ' / ' || count(*) FILTER (WHERE cnp !~ '^999[0-9]{7}$' AND cnp NOT LIKE 'EC-%') FROM public.szemely)
),
-- ── G) ADATMINŐSÉG — TENANT-KONZISZTENCIA ──────────────────────────────────
g_cross AS (
  SELECT 'G-tenant', 'anyakönyvi sor, amelynek személye MÁS gyülekezeté (keresztseg / konfirmalas / hazassag(ferfi) / temetes / elkoltozott)',
         (SELECT count(*) FROM public.keresztseg k JOIN public.szemely s ON s.id = k.id_szemely WHERE s.congregation_id IS DISTINCT FROM k.congregation_id)::text
         || ' / ' || (SELECT count(*) FROM public.konfirmalas k JOIN public.szemely s ON s.id = k.id_szemely WHERE s.congregation_id IS DISTINCT FROM k.congregation_id)::text
         || ' / ' || (SELECT count(*) FROM public.hazassag h JOIN public.szemely s ON s.id = h.id_ferfi WHERE s.congregation_id IS DISTINCT FROM h.congregation_id)::text
         || ' / ' || (SELECT count(*) FROM public.temetes t JOIN public.szemely s ON s.id = t.id_szemely WHERE s.congregation_id IS DISTINCT FROM t.congregation_id)::text
         || ' / ' || (SELECT count(*) FROM public.elkoltozott e JOIN public.szemely s ON s.id = e.id_szemely WHERE s.congregation_id IS DISTINCT FROM e.congregation_id)::text
),
g_mixed_family AS (
  SELECT 'G-tenant', 'VEGYES gyülekezetű családi karton (férj és feleség más gyülekezet)',
         (SELECT count(*) FROM public.csalad c JOIN public.szemely f ON f.id = c.id_ferfi JOIN public.szemely n ON n.id = c.id_no
          WHERE f.congregation_id IS DISTINCT FROM n.congregation_id)::text
),
g_transfer_placeholder AS (SELECT 'G-tenant', 'member_transfer_notifications', 'lásd a 2. LEKÉRDEZÉST (külön futtatandó)')
SELECT * FROM a_cnp_index
UNION ALL SELECT * FROM a_cnp_fk
UNION ALL SELECT * FROM a_notnull
UNION ALL SELECT * FROM a_collation
UNION ALL SELECT * FROM a_egyhazi_szam_idx
UNION ALL SELECT * FROM a_csalad_unique
UNION ALL SELECT * FROM b_triggers
UNION ALL SELECT * FROM b_audit_trg
UNION ALL SELECT * FROM c_fn
UNION ALL SELECT * FROM c_missing
UNION ALL SELECT * FROM d_policies
UNION ALL SELECT * FROM e_dup
UNION ALL SELECT * FROM e_null
UNION ALL SELECT * FROM e_format
UNION ALL SELECT * FROM e_year
UNION ALL SELECT * FROM e_gaps
UNION ALL SELECT * FROM f_status
UNION ALL SELECT * FROM f_meghalt_no_temetes
UNION ALL SELECT * FROM f_temetes_no_meghalt
UNION ALL SELECT * FROM f_elkolt_no_status
UNION ALL SELECT * FROM f_null_cong
UNION ALL SELECT * FROM f_cnp_dup
UNION ALL SELECT * FROM f_generated_cnp
UNION ALL SELECT * FROM g_cross
UNION ALL SELECT * FROM g_mixed_family
UNION ALL SELECT * FROM g_transfer_placeholder
ORDER BY 1, 2;

-- ═══════════════════════════════════════════════════════════════════════════
--  2. LEKÉRDEZÉS — KÜLÖN FUTTATANDÓ (jelöld ki innentől a fájl végéig, Run).
--  Olyan táblákra hivatkozik (audit.record_version, audit_log,
--  member_transfer_notifications), amelyek léte a repóból nem bizonyított —
--  ha valamelyik hiányzik, EZ a lekérdezés hibázik, az 1. nem.
-- ═══════════════════════════════════════════════════════════════════════════
WITH
g_transfer AS (
  SELECT 'G-tenant' AS szakasz, 'member_transfer_notifications státuszok (status: db)' AS kulcs,
         COALESCE((SELECT string_agg(status || ': ' || n, ' | ') FROM (SELECT status, count(*) n FROM public.member_transfer_notifications GROUP BY 1) s), '(üres)') AS ertek
),
h_audit AS (
  SELECT 'H-audit', 'audit.record_version sorok táblánként (top 12)',
         COALESCE((SELECT string_agg(table_name || ': ' || n, ' | ' ORDER BY n DESC)
                   FROM (SELECT table_name, count(*) n FROM audit.record_version GROUP BY 1 ORDER BY 2 DESC LIMIT 12) s), '(üres vagy nincs tábla)')
),
h_audit_registry AS (
  SELECT 'H-audit', 'audit.record_version sorok ANYAKÖNYVI táblákra',
         COALESCE((SELECT count(*)::text FROM audit.record_version WHERE table_name IN ('keresztseg','konfirmalas','hazassag','temetes','bekoltozott','elkoltozott','attert','kitert')), '0')
),
h_audit_log AS (
  SELECT 'H-audit', 'audit_log anyakönyvi/tag akciók (action: db, top 15)',
         COALESCE((SELECT string_agg(action || ': ' || n, ' | ' ORDER BY n DESC)
                   FROM (SELECT action, count(*) n FROM public.audit_log WHERE action ILIKE 'registry%' OR action ILIKE 'member%' GROUP BY 1 ORDER BY 2 DESC LIMIT 15) s), '(nincs ilyen sor)')
)
SELECT * FROM g_transfer
UNION ALL SELECT * FROM h_audit
UNION ALL SELECT * FROM h_audit_registry
UNION ALL SELECT * FROM h_audit_log
ORDER BY 1, 2;
