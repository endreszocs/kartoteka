-- ============================================================================
-- 2026-09-05 — PROFIL: PONTOSSÁG (Endre 4. pontja, profil-kör)
-- ============================================================================
-- MIT AD
-- ──────
-- 1) `pastor_profiles.avatar_source` — a profilkép FORRÁSÁNAK döntése:
--      'upload' = a feltöltött kép, 'google' = a Google-fiók képe, 'none' = nincs
--      kép (monogram), NULL = örökölt szabály (feltöltés > metaadat > Google).
--    MIÉRT: a Google `picture` eddig MEGELŐZTE a lelkész saját feltöltését, és a
--    „nincs kép" döntést nem lehetett kifejezni — a metaadat törlése után a
--    Google-kép visszaugrott. (Feloldó: apps/web/lib/auth/profile-avatar-shared.ts)
--
-- 2) EGYSZERI átemelés: `pastor_profiles.previous_service_places` (régi, vesszős
--    szöveg-tömb) → `pastor_service_history` (strukturált, kanonikus), CSAK
--    azoknál, akiknek még NINCS strukturált soruk. Elem = egy sor (`hely`),
--    a sorrend az elem sorszáma. A tömb elemeit NEM daraboljuk vesszőnél
--    (a „Kolozsvár, Alsóváros" egyetlen hely) — ami egy elemben van, egy sor
--    lesz, veszteség nélkül; utólag a Szerkesztés fülön szétbontható.
--    A legacy tömböt NEM töröljük (a felület deduplikálva mutatja „Régi
--    (szöveges) bejegyzés" címkével) — a törlés külön tulajdonosi döntés.
--
-- 3) `emergency_phone` = a saját `profiles.phone` → NULL. A welcome-varázsló a
--    lelkész SAJÁT számát írta a sürgősségi mezőbe, ami a mező célját
--    (másik elérhető személy) kiüresítette.
--    ⚠️ A varázsló sora (apps/web/app/(setup)/welcome/actions.ts) külön kör —
--       amíg az nem javul, új regisztrációnál újra keletkezhet ilyen sor.
--
-- 4) `logos` Storage vödör: SAJÁT profilkép-mappa policy-k
--    (`profiles/{auth.uid()}/…`) — INSERT, UPDATE és DELETE. Külön, ADDITÍV
--    policy-k (a policy-k VAGY-kapcsolatban állnak), ezért:
--      · nem függenek attól, lefutott-e a 2026-08-25-ös B6-SQL (annak
--        `profiles` ága ugyanezt adja INSERT/UPDATE-re, DELETE-re viszont NEM);
--      · a törlés-ág CSAK a saját mappára szól — a „Kép eltávolítása" gomb és a
--        fix nevű (`avatar.{ext}`) felülírás régi variánsainak takarítása ehhez kell.
--    A vödör PUBLIKUS marad (a címer a /gy/[slug] oldalon kell) — a profilkép
--    privát vödörbe költöztetése (aláírt URL) KÜLÖN döntés.
--
-- 5) VERIFIKÁCIÓ egy UNION ALL rácsban (a Supabase-szerkesztő csak az UTOLSÓ
--    rácsot mutatja).
--
-- MENTÉS-BESOROLÁS: NINCS új tábla (csak oszlop + sorok + policy) → nem kell
-- backup_table_policy besorolás.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl. Idempotens — többször is
-- futtatható, a 2) átemelés második futásra nem duplikál (NOT EXISTS őr).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) avatar_source oszlop + CHECK (conkey szerint célozva)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pastor_profiles
  ADD COLUMN IF NOT EXISTS avatar_source text;

DO $avatar_check$
DECLARE
  v_attnum int2;
  v_name text;
BEGIN
  SELECT a.attnum INTO v_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.pastor_profiles'::regclass AND a.attname = 'avatar_source';

  -- Ha már van CHECK PONTOSAN ezen az egy oszlopon, de más néven: eldobjuk,
  -- hogy a névvel célzott újrakiadás ne duplázzon. (conkey szerint — a
  -- pg_get_constraintdef LIKE-os keresés MÁS constraintet is elvihetne.)
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.pastor_profiles'::regclass
    AND c.contype = 'c'
    AND c.conkey = ARRAY[v_attnum]::int2[]
    AND c.conname <> 'pastor_profiles_avatar_source_check';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pastor_profiles DROP CONSTRAINT %I', v_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pastor_profiles_avatar_source_check'
      AND conrelid = 'public.pastor_profiles'::regclass
  ) THEN
    ALTER TABLE public.pastor_profiles
      ADD CONSTRAINT pastor_profiles_avatar_source_check
      CHECK (avatar_source IS NULL OR avatar_source IN ('upload', 'google', 'none'));
  END IF;
END
$avatar_check$;

COMMENT ON COLUMN public.pastor_profiles.avatar_source IS
  '2026-09-05: a profilkép forrásának döntése — upload | google | none; NULL = örökölt szabály (photo_url > user_metadata.avatar_url > picture). Feloldó: apps/web/lib/auth/profile-avatar-shared.ts';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Egyszeri átemelés: previous_service_places → pastor_service_history
-- ─────────────────────────────────────────────────────────────────────────
DO $atemeles$
DECLARE
  v_db int := 0;
BEGIN
  IF to_regclass('public.pastor_service_history') IS NULL THEN
    RAISE WARNING 'A pastor_service_history tábla nem létezik — az átemelés kimarad (előbb a 2026-05-05-pastor-service-history-tartozas-mod.sql fusson le).';
    RETURN;
  END IF;

  EXECUTE $q$
    INSERT INTO public.pastor_service_history (user_id, hely, szerep, ev_tol, ev_ig, megjegyzes, sorrend)
    SELECT pp.user_id,
           btrim(e.hely),
           NULL, NULL, NULL,
           'Átemelve a régi szöveges bejegyzésből (2026-09-05) — az évek és a szerep utólag pótolhatók.',
           (e.ord - 1)::int
    FROM public.pastor_profiles pp
    CROSS JOIN LATERAL unnest(COALESCE(pp.previous_service_places, '{}'::text[])) WITH ORDINALITY AS e(hely, ord)
    WHERE btrim(COALESCE(e.hely, '')) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.pastor_service_history sh WHERE sh.user_id = pp.user_id
      )
  $q$;
  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'Átemelt szolgálati előzmény-sorok: %', v_db;
END
$atemeles$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Sürgősségi telefon = saját telefon → NULL
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.pastor_profiles pp
SET emergency_phone = NULL
FROM public.profiles p
WHERE p.id = pp.user_id
  AND pp.emergency_phone IS NOT NULL
  AND btrim(pp.emergency_phone) <> ''
  AND regexp_replace(pp.emergency_phone, '[^0-9+]', '', 'g')
      = regexp_replace(COALESCE(p.phone, ''), '[^0-9+]', '', 'g');

-- ─────────────────────────────────────────────────────────────────────────
-- 4) logos vödör — SAJÁT profilkép-mappa (additív policy-k)
-- ─────────────────────────────────────────────────────────────────────────
-- A mappa-őr mindhárom policy-ban azonos: az objektum neve
-- `profiles/<a hívó auth.uid()>/…` — MÁS felhasználó mappájához nincs jog.
DROP POLICY IF EXISTS "logos_profilkep_sajat_insert" ON storage.objects;
CREATE POLICY "logos_profilkep_sajat_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (string_to_array(name, '/'))[1] = 'profiles'
    AND (string_to_array(name, '/'))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "logos_profilkep_sajat_update" ON storage.objects;
CREATE POLICY "logos_profilkep_sajat_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (string_to_array(name, '/'))[1] = 'profiles'
    AND (string_to_array(name, '/'))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (string_to_array(name, '/'))[1] = 'profiles'
    AND (string_to_array(name, '/'))[2] = auth.uid()::text
  );

-- A törlés: CSAK a saját mappa. A gyülekezeti (címer/pecsét) objektumokra ez a
-- policy NEM ad törlési jogot — a B6 döntése („a pecsét némán eltűnne") marad.
DROP POLICY IF EXISTS "logos_profilkep_sajat_delete" ON storage.objects;
CREATE POLICY "logos_profilkep_sajat_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (string_to_array(name, '/'))[1] = 'profiles'
    AND (string_to_array(name, '/'))[2] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFIKÁCIÓ — EGY eredmény-rács
-- ============================================================================
SELECT lepes, allapot FROM (
  SELECT 1 AS sorrend, '01. pastor_profiles.avatar_source oszlop + CHECK' AS lepes,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pastor_profiles' AND column_name = 'avatar_source')
      AND EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'pastor_profiles_avatar_source_check' AND conrelid = 'public.pastor_profiles'::regclass)
    THEN '✅' ELSE '❌' END AS allapot
  UNION ALL
  SELECT 2, '02. logos saját profilkép-mappa policy-k (insert/update/delete)',
    CASE WHEN (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname IN ('logos_profilkep_sajat_insert', 'logos_profilkep_sajat_update', 'logos_profilkep_sajat_delete')) = 3
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 3, '03. B6 logos_pastor_write tartalmaz profiles-ágat (tájékoztató)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'logos_pastor_write' AND COALESCE(with_check, '') LIKE '%profiles%')
    THEN '✅ igen' ELSE 'ℹ️ nincs (a saját-mappa policy-k ettől függetlenül élnek)' END
  UNION ALL
  SELECT 4, '04. átemelt szolgálati előzmény-sorok (tájékoztató)',
    COALESCE((SELECT count(*)::text FROM public.pastor_service_history
      WHERE megjegyzes LIKE 'Átemelve a régi szöveges bejegyzésből%'), '0')
  UNION ALL
  SELECT 5, '05. legacy tömbbel, de strukturált sor NÉLKÜL maradt profil (0 kell)',
    CASE WHEN (SELECT count(*) FROM public.pastor_profiles pp
        WHERE cardinality(COALESCE(pp.previous_service_places, '{}'::text[])) > 0
          AND EXISTS (SELECT 1 FROM unnest(pp.previous_service_places) x WHERE btrim(COALESCE(x, '')) <> '')
          AND NOT EXISTS (SELECT 1 FROM public.pastor_service_history sh WHERE sh.user_id = pp.user_id)) = 0
    THEN '✅ 0' ELSE '❌ ' || (SELECT count(*) FROM public.pastor_profiles pp
        WHERE cardinality(COALESCE(pp.previous_service_places, '{}'::text[])) > 0
          AND NOT EXISTS (SELECT 1 FROM public.pastor_service_history sh WHERE sh.user_id = pp.user_id)) END
  UNION ALL
  SELECT 6, '06. sürgősségi telefon = saját telefon (0 kell)',
    CASE WHEN (SELECT count(*) FROM public.pastor_profiles pp JOIN public.profiles p ON p.id = pp.user_id
        WHERE pp.emergency_phone IS NOT NULL AND btrim(pp.emergency_phone) <> ''
          AND regexp_replace(pp.emergency_phone, '[^0-9+]', '', 'g') = regexp_replace(COALESCE(p.phone, ''), '[^0-9+]', '', 'g')) = 0
    THEN '✅ 0' ELSE '❌ maradt' END
  UNION ALL
  SELECT 7, '07. profiles.email ≠ auth.users.email (tájékoztató — a felület ⚠️-t mutat)',
    (SELECT count(*)::text FROM public.profiles p JOIN auth.users u ON u.id = p.id
      WHERE lower(btrim(COALESCE(p.email, ''))) IS DISTINCT FROM lower(btrim(COALESCE(u.email, ''))))
    || ' profil'
  UNION ALL
  SELECT 8, '08. profiles.diocese_id ≠ a gyülekezet láncáé (tájékoztató — ha >0, a skalár-propagálás külön kör)',
    (SELECT count(*)::text FROM public.profiles p JOIN public.congregations c ON c.id = p.congregation_id
      WHERE p.diocese_id IS NOT NULL AND c.diocese_id IS NOT NULL AND p.diocese_id <> c.diocese_id)
    || ' profil'
  UNION ALL
  SELECT 9, '09. napló ''kezdeti'' sorai (tájékoztató — a felület „A napló indulása"-t ír)',
    CASE WHEN to_regclass('public.szolgalati_hely_naplo') IS NULL THEN 'ℹ️ a tábla nem létezik'
      ELSE (SELECT count(*)::text || ' sor, ' || COALESCE(min(created_at)::date::text, '—') || ' … ' || COALESCE(max(created_at)::date::text, '—')
            FROM public.szolgalati_hely_naplo WHERE jelleg = 'kezdeti') END
  UNION ALL
  SELECT 10, '10. avatar-metaadat minta (tájékoztató): avatar_url / picture / avatar_source',
    (SELECT count(*) FILTER (WHERE raw_user_meta_data ? 'avatar_url')::text || ' avatar_url, '
         || count(*) FILTER (WHERE raw_user_meta_data ? 'picture')::text || ' picture'
       FROM auth.users)
    || ', ' || (SELECT count(*)::text FROM public.pastor_profiles WHERE avatar_source IS NOT NULL) || ' explicit döntés'
) x
ORDER BY sorrend;
