-- KARTOTEKA — Erdélyi Református Egyházkerület 495 egyházközség seed
-- Dátum: 2026-04-30f (hatodik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR: a 2026-04-30c-dioceses-cleanup után a `dioceses` tábla 15
-- egyházmegyét tartalmaz, de a `congregations` tábla CSAK a saját
-- Barátosi rekordot. Az átjelentkezési wizard célgyülekezet-választója
-- és az auto-javaslat ezért nem működik más gyülekezetekre.
--
-- Ez a SQL beimportálja a 495 erdélyi egyházközséget (klasszikus, intézmények
-- — kollégiumok, FIKE, Kórházlelkész — kihagyva). Mindegyik kap:
--   name + nev_hu: hivatalos név (pl. 'Brassó I. Református Egyházközség')
--   district: 'Erdélyi Református Egyházkerület'
--   diocese_id: a megfelelő dioceses sor (lookup name szerint)
--   country: 'Románia'
--   public_slug: slugified név (egyedi)
--
-- IDEMPOTENS: WHERE NOT EXISTS védi a duplikációkat. A meglévő
-- "Barátosi Református Egyházközség" rekordot NEM bántja.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- Brassói Református Egyházmegye — 27 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Alsórákosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsórákosi Református Egyházközség', 'Alsórákosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'alsorakosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsórákosi Református Egyházközség');

-- Bákói Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bákói Református Missziói Egyházközség', 'Bákói Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'bakoi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bákói Református Missziói Egyházközség');

-- Balázstelki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Balázstelki Református Egyházközség', 'Balázstelki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'balazstelki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Balázstelki Református Egyházközség');

-- Bodolai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bodolai Református Egyházközség', 'Bodolai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'bodolai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bodolai Református Egyházközség');

-- Brassó I. Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Brassó I. Református Egyházközség', 'Brassó I. Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'brasso-i-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Brassó I. Református Egyházközség');

-- Brassó II. Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Brassó II. Református Egyházközség', 'Brassó II. Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'brasso-ii-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Brassó II. Református Egyházközség');

-- Brassó III. Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Brassó III. Református Egyházközség', 'Brassó III. Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'brasso-iii-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Brassó III. Református Egyházközség');

-- Bukarest I. Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bukarest I. Református Egyházközség', 'Bukarest I. Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'bukarest-i-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bukarest I. Református Egyházközség');

-- Bukarest II. Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bukarest II. Református Egyházközség', 'Bukarest II. Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'bukarest-ii-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bukarest II. Református Egyházközség');

-- Bürkösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bürkösi Református Egyházközség', 'Bürkösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'burkosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bürkösi Református Egyházközség');

-- Erzsébetvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Erzsébetvárosi Református Egyházközség', 'Erzsébetvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'erzsebetvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Erzsébetvárosi Református Egyházközség');

-- Fogarasi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fogarasi Református Egyházközség', 'Fogarasi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'fogarasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fogarasi Református Egyházközség');

-- Galaci Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Galaci Református Egyházközség', 'Galaci Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'galaci-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Galaci Református Egyházközség');

-- Keresztvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Keresztvári Református Egyházközség', 'Keresztvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'keresztvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Keresztvári Református Egyházközség');

-- Kóbori Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kóbori Református Egyházközség', 'Kóbori Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'kobori-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kóbori Református Egyházközség');

-- Kőhalmi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kőhalmi Református Egyházközség', 'Kőhalmi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'kohalmi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kőhalmi Református Egyházközség');

-- Küküllőalmási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küküllőalmási Református Egyházközség', 'Küküllőalmási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'kukulloalmasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küküllőalmási Református Egyházközség');

-- Medgyesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Medgyesi Református Egyházközség', 'Medgyesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'medgyesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Medgyesi Református Egyházközség');

-- Mihályfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mihályfalvi Református Egyházközség', 'Mihályfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'mihalyfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mihályfalvi Református Egyházközség');

-- Nagymohai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagymohai Református Egyházközség', 'Nagymohai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'nagymohai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagymohai Református Egyházközség');

-- Nagyszebeni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagyszebeni Református Egyházközség', 'Nagyszebeni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'nagyszebeni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagyszebeni Református Egyházközség');

-- Négyfalusi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Négyfalusi Református Egyházközség', 'Négyfalusi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'negyfalusi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Négyfalusi Református Egyházközség');

-- Olthévízi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Olthévízi Református Egyházközség', 'Olthévízi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'olthevizi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Olthévízi Református Egyházközség');

-- Ramnicu Valcea-i Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ramnicu Valcea-i Református Egyházközség', 'Ramnicu Valcea-i Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'ramnicu-valcea-i-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ramnicu Valcea-i Református Egyházközség');

-- Szentágotai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szentágotai Református Egyházközség', 'Szentágotai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'szentagotai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szentágotai Református Egyházközség');

-- Vízaknai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vízaknai Református Egyházközség', 'Vízaknai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'vizaknai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vízaknai Református Egyházközség');

-- Zernyesti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Zernyesti Református Egyházközség', 'Zernyesti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Brassói Református Egyházmegye', d.id, 'Románia', 'zernyesti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Brassói Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Zernyesti Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Dési Református Egyházmegye — 47 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Almásmálomi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Almásmálomi Református Egyházközség', 'Almásmálomi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'almasmalomi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Almásmálomi Református Egyházközség');

-- Apanagyfalui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Apanagyfalui Református Egyházközség', 'Apanagyfalui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'apanagyfalui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Apanagyfalui Református Egyházközség');

-- Árpástói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Árpástói Református Egyházközség', 'Árpástói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'arpastoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Árpástói Református Egyházközség');

-- Bacai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bacai Református Egyházközség', 'Bacai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'bacai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bacai Református Egyházközség');

-- Bálványosváraljai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bálványosváraljai Református Egyházközség', 'Bálványosváraljai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'balvanyosvaraljai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bálványosváraljai Református Egyházközség');

-- Besztercei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Besztercei Református Egyházközség', 'Besztercei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'besztercei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Besztercei Református Egyházközség');

-- Bethleni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bethleni Református Egyházközség', 'Bethleni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'bethleni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bethleni Református Egyházközség');

-- Bonchidai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bonchidai Református Egyházközség', 'Bonchidai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'bonchidai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bonchidai Református Egyházközség');

-- Búzai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Búzai Református Egyházközség', 'Búzai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'buzai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Búzai Református Egyházközség');

-- Cegőtelkei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Cegőtelkei Református Egyházközség', 'Cegőtelkei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'cegotelkei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Cegőtelkei Református Egyházközség');

-- Désaknai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Désaknai Református Egyházközség', 'Désaknai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'desaknai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Désaknai Református Egyházközség');

-- Déscichegyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Déscichegyi Református Egyházközség', 'Déscichegyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'descichegyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Déscichegyi Református Egyházközség');

-- Dési Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dési Református Egyházközség', 'Dési Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'desi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dési Református Egyházközség');

-- Esztényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Esztényi Református Egyházközség', 'Esztényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'esztenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Esztényi Református Egyházközség');

-- Feketelaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Feketelaki Református Egyházközség', 'Feketelaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'feketelaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Feketelaki Református Egyházközség');

-- Felőri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felőri Református Egyházközség', 'Felőri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'felori-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felőri Református Egyházközség');

-- Katonai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Katonai Református Egyházközség', 'Katonai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'katonai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Katonai Református Egyházközség');

-- Kékesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kékesi Református Egyházközség', 'Kékesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'kekesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kékesi Református Egyházközség');

-- Kendilónai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kendilónai Református Egyházközség', 'Kendilónai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'kendilonai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kendilónai Református Egyházközség');

-- Kérői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kérői Református Egyházközség', 'Kérői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'keroi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kérői Református Egyházközség');

-- Kisiklódi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisiklódi Református Egyházközség', 'Kisiklódi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'kisiklodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisiklódi Református Egyházközség');

-- Kozárvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kozárvári Református Egyházközség', 'Kozárvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'kozarvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kozárvári Református Egyházközség');

-- Magyarberétei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarberétei Református Egyházközség', 'Magyarberétei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'magyarberetei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarberétei Református Egyházközség');

-- Magyarborzási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarborzási Református Egyházközség', 'Magyarborzási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'magyarborzasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarborzási Református Egyházközség');

-- Magyardécsei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyardécsei Református Egyházközség', 'Magyardécsei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'magyardecsei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyardécsei Református Egyházközség');

-- Magyarnemegyei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarnemegyei Református Egyházközség', 'Magyarnemegyei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'magyarnemegyei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarnemegyei Református Egyházközség');

-- Melegföldvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Melegföldvári Református Egyházközség', 'Melegföldvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'melegfoldvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Melegföldvári Református Egyházközség');

-- Mezőköbölkúti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőköbölkúti Református Egyházközség', 'Mezőköbölkúti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'mezokobolkuti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőköbölkúti Református Egyházközség');

-- Mezőveresegyházi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőveresegyházi Református Egyházközség', 'Mezőveresegyházi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'mezoveresegyhazi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőveresegyházi Református Egyházközség');

-- Nagysajói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagysajói Református Egyházközség', 'Nagysajói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'nagysajoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagysajói Református Egyházközség');

-- Naszódi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Naszódi Református Egyházközség', 'Naszódi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'naszodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Naszódi Református Egyházközség');

-- Nyíresi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyíresi Református Egyházközség', 'Nyíresi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'nyiresi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyíresi Református Egyházközség');

-- Ördöngösfüzesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ördöngösfüzesi Református Egyházközség', 'Ördöngösfüzesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'ordongosfuzesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ördöngösfüzesi Református Egyházközség');

-- Rettegi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Rettegi Református Egyházközség', 'Rettegi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'rettegi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Rettegi Református Egyházközség');

-- Sajószentandrási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sajószentandrási Református Egyházközség', 'Sajószentandrási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'sajoszentandrasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sajószentandrási Református Egyházközség');

-- Sófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sófalvi Református Egyházközség', 'Sófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'sofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sófalvi Református Egyházközség');

-- Somkeréki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Somkeréki Református Egyházközség', 'Somkeréki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'somkereki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Somkeréki Református Egyházközség');

-- Szamosújvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szamosújvári Református Egyházközség', 'Szamosújvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szamosujvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szamosújvári Református Egyházközség');

-- Szászlekence–Vermesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szászlekence–Vermesi Református Egyházközség', 'Szászlekence–Vermesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szaszlekence-vermesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szászlekence–Vermesi Református Egyházközség');

-- Széki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Széki Református Egyházközség', 'Széki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szeki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Széki Református Egyházközség');

-- Szentmargitai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szentmargitai Református Egyházközség', 'Szentmargitai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szentmargitai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szentmargitai Református Egyházközség');

-- Szentmátéi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szentmátéi Református Egyházközség', 'Szentmátéi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szentmatei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szentmátéi Református Egyházközség');

-- Szépkenyerűszentmártoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szépkenyerűszentmártoni Református Egyházközség', 'Szépkenyerűszentmártoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'szepkenyeruszentmartoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szépkenyerűszentmártoni Református Egyházközség');

-- Tacsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Tacsi Református Egyházközség', 'Tacsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'tacsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Tacsi Református Egyházközség');

-- Újősi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Újősi Református Egyházközség', 'Újősi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'ujosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Újősi Református Egyházközség');

-- Várkudui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Várkudui Református Egyházközség', 'Várkudui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'varkudui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Várkudui Református Egyházközség');

-- Vicei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vicei Református Egyházközség', 'Vicei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Dési Református Egyházmegye', d.id, 'Románia', 'vicei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Dési Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vicei Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Erdővidéki Református Egyházmegye — 15 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Bardoci Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bardoci Református Egyházközség', 'Bardoci Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'bardoci-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bardoci Református Egyházközség');

-- Baróti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Baróti Református Egyházközség', 'Baróti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'baroti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Baróti Református Egyházközség');

-- Bibarcfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bibarcfalvi Református Egyházközség', 'Bibarcfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'bibarcfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bibarcfalvi Református Egyházközség');

-- Bodosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bodosi Református Egyházközség', 'Bodosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'bodosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bodosi Református Egyházközség');

-- Bölöni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bölöni Református Egyházközség', 'Bölöni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'boloni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bölöni Református Egyházközség');

-- Erdőfülei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Erdőfülei Református Egyházközség', 'Erdőfülei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'erdofulei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Erdőfülei Református Egyházközség');

-- Kisbaconi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisbaconi Református Egyházközség', 'Kisbaconi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'kisbaconi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisbaconi Református Egyházközség');

-- Köpeci Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Köpeci Református Egyházközség', 'Köpeci Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'kopeci-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Köpeci Református Egyházközség');

-- Középajtai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Középajtai Református Egyházközség', 'Középajtai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'kozepajtai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Középajtai Református Egyházközség');

-- Magyarhermányi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarhermányi Református Egyházközség', 'Magyarhermányi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'magyarhermanyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarhermányi Református Egyházközség');

-- Nagyajtai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagyajtai Református Egyházközség', 'Nagyajtai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'nagyajtai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagyajtai Református Egyházközség');

-- Nagybaconi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagybaconi Református Egyházközség', 'Nagybaconi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'nagybaconi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagybaconi Református Egyházközség');

-- Olaszteleki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Olaszteleki Református Egyházközség', 'Olaszteleki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'olaszteleki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Olaszteleki Református Egyházközség');

-- Szárazajtai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szárazajtai Református Egyházközség', 'Szárazajtai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'szarazajtai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szárazajtai Református Egyházközség');

-- Székelyszáldobosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyszáldobosi Református Egyházközség', 'Székelyszáldobosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Erdővidéki Református Egyházmegye', d.id, 'Románia', 'szekelyszaldobosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Erdővidéki Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyszáldobosi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Görgényi Református Egyházmegye — 33 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Abafájai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Abafájai Református Egyházközség', 'Abafájai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'abafajai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Abafájai Református Egyházközség');

-- Alsóbölkényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsóbölkényi Református Egyházközség', 'Alsóbölkényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'alsobolkenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsóbölkényi Református Egyházközség');

-- Beresztelkei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Beresztelkei Református Egyházközség', 'Beresztelkei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'beresztelkei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Beresztelkei Református Egyházközség');

-- Borszéki Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Borszéki Református Missziói Egyházközség', 'Borszéki Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'borszeki-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Borszéki Református Missziói Egyházközség');

-- Dedrádszéplaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dedrádszéplaki Református Egyházközség', 'Dedrádszéplaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'dedradszeplaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dedrádszéplaki Református Egyházközség');

-- Disznajói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Disznajói Református Egyházközség', 'Disznajói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'disznajoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Disznajói Református Egyházközség');

-- Erdőcsinádi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Erdőcsinádi Református Egyházközség', 'Erdőcsinádi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'erdocsinadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Erdőcsinádi Református Egyházközség');

-- Fickói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fickói Református Egyházközség', 'Fickói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'fickoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fickói Református Egyházközség');

-- Gernyeszegi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gernyeszegi Református Egyházközség', 'Gernyeszegi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'gernyeszegi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gernyeszegi Református Egyházközség');

-- Görgényszentimrei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Görgényszentimrei Református Egyházközség', 'Görgényszentimrei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'gorgenyszentimrei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Görgényszentimrei Református Egyházközség');

-- Holtmarosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Holtmarosi Református Egyházközség', 'Holtmarosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'holtmarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Holtmarosi Református Egyházközség');

-- Jódratosnyai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Jódratosnyai Református Egyházközség', 'Jódratosnyai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'jodratosnyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Jódratosnyai Református Egyházközség');

-- Kisfülpösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisfülpösi Református Egyházközség', 'Kisfülpösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'kisfulposi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisfülpösi Református Egyházközség');

-- Körtvélyfájai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Körtvélyfájai Református Egyházközség', 'Körtvélyfájai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'kortvelyfajai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Körtvélyfájai Református Egyházközség');

-- Ludvégi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ludvégi Református Egyházközség', 'Ludvégi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'ludvegi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ludvégi Református Egyházközség');

-- Magyarfülpösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarfülpösi Református Egyházközség', 'Magyarfülpösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'magyarfulposi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarfülpösi Református Egyházközség');

-- Magyarói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarói Református Egyházközség', 'Magyarói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'magyaroi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarói Református Egyházközség');

-- Magyarpéterlakai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarpéterlakai Református Egyházközség', 'Magyarpéterlakai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'magyarpeterlakai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarpéterlakai Református Egyházközség');

-- Magyarrégeni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarrégeni Református Egyházközség', 'Magyarrégeni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'magyarregeni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarrégeni Református Egyházközség');

-- Marosfelfalui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosfelfalui Református Egyházközség', 'Marosfelfalui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'marosfelfalui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosfelfalui Református Egyházközség');

-- Maroshévízi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Maroshévízi Református Egyházközség', 'Maroshévízi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'maroshevizi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Maroshévízi Református Egyházközség');

-- Marosjárai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosjárai Református Egyházközség', 'Marosjárai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'marosjarai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosjárai Református Egyházközség');

-- Marossárpataki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marossárpataki Református Egyházközség', 'Marossárpataki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'marossarpataki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marossárpataki Református Egyházközség');

-- Marosvécsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvécsi Református Egyházközség', 'Marosvécsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'marosvecsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvécsi Református Egyházközség');

-- Mezőörményesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőörményesi Református Egyházközség', 'Mezőörményesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'mezoormenyesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőörményesi Református Egyházközség');

-- Pókai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Pókai Református Egyházközség', 'Pókai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'pokai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Pókai Református Egyházközség');

-- Pókakeresztúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Pókakeresztúri Református Egyházközség', 'Pókakeresztúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'pokakereszturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Pókakeresztúri Református Egyházközség');

-- Radnótfájai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Radnótfájai Református Egyházközség', 'Radnótfájai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'radnotfajai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Radnótfájai Református Egyházközség');

-- Sáromberki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sáromberki Református Egyházközség', 'Sáromberki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'saromberki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sáromberki Református Egyházközség');

-- Szászrégeni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szászrégeni Református Egyházközség', 'Szászrégeni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'szaszregeni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szászrégeni Református Egyházközség');

-- Tekei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Tekei Református Egyházközség', 'Tekei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'tekei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Tekei Református Egyházközség');

-- Toldalagi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Toldalagi Református Egyházközség', 'Toldalagi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'toldalagi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Toldalagi Református Egyházközség');

-- Vajdaszentiványi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vajdaszentiványi Református Egyházközség', 'Vajdaszentiványi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Görgényi Református Egyházmegye', d.id, 'Románia', 'vajdaszentivanyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Görgényi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vajdaszentiványi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Hunyadi Református Egyházmegye — 14 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Alpestesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alpestesi Református Egyházközség', 'Alpestesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'alpestesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alpestesi Református Egyházközség');

-- Brádi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Brádi Református Egyházközség', 'Brádi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'bradi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Brádi Református Egyházközség');

-- Dévai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dévai Református Egyházközség', 'Dévai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'devai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dévai Református Egyházközség');

-- Harói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Harói Református Egyházközség', 'Harói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'haroi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Harói Református Egyházközség');

-- Hátszegi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hátszegi Református Egyházközség', 'Hátszegi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'hatszegi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hátszegi Református Egyházközség');

-- Hosdáti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hosdáti Református Egyházközség', 'Hosdáti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'hosdati-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hosdáti Református Egyházközség');

-- Lupényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Lupényi Református Egyházközség', 'Lupényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'lupenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Lupényi Református Egyházközség');

-- Petrilla-Lónyai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Petrilla-Lónyai Református Egyházközség', 'Petrilla-Lónyai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'petrilla-lonyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Petrilla-Lónyai Református Egyházközség');

-- Petrozsényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Petrozsényi Református Egyházközség', 'Petrozsényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'petrozsenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Petrozsényi Református Egyházközség');

-- Piski Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Piski Református Egyházközség', 'Piski Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'piski-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Piski Református Egyházközség');

-- Rákosdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Rákosdi Református Egyházközség', 'Rákosdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'rakosdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Rákosdi Református Egyházközség');

-- Szászvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szászvárosi Református Egyházközség', 'Szászvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'szaszvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szászvárosi Református Egyházközség');

-- Vajdahunyadi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vajdahunyadi Református Egyházközség', 'Vajdahunyadi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'vajdahunyadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vajdahunyadi Református Egyházközség');

-- Vulkáni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vulkáni Református Egyházközség', 'Vulkáni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Hunyadi Református Egyházmegye', d.id, 'Románia', 'vulkani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Hunyadi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vulkáni Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Kalotaszegi Református Egyházmegye — 30 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Bánffyhunyadi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bánffyhunyadi Református Egyházközség', 'Bánffyhunyadi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'banffyhunyadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bánffyhunyadi Református Egyházközség');

-- Bogártelki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bogártelki Református Egyházközség', 'Bogártelki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'bogartelki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bogártelki Református Egyházközség');

-- Egeresi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Egeresi Református Egyházközség', 'Egeresi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'egeresi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Egeresi Református Egyházközség');

-- Farnasi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Farnasi Református Egyházközség', 'Farnasi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'farnasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Farnasi Református Egyházközség');

-- Gyalui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gyalui Református Egyházközség', 'Gyalui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'gyalui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gyalui Református Egyházközség');

-- Gyerővásárhelyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gyerővásárhelyi Református Egyházközség', 'Gyerővásárhelyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'gyerovasarhelyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gyerővásárhelyi Református Egyházközség');

-- Inaktelki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Inaktelki Református Egyházközség', 'Inaktelki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'inaktelki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Inaktelki Református Egyházközség');

-- Kalotadámosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kalotadámosi Református Egyházközség', 'Kalotadámosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'kalotadamosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kalotadámosi Református Egyházközség');

-- Kalotaszentkirályi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kalotaszentkirályi Református Egyházközség', 'Kalotaszentkirályi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'kalotaszentkiralyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kalotaszentkirályi Református Egyházközség');

-- Ketesdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ketesdi Református Egyházközség', 'Ketesdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'ketesdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ketesdi Református Egyházközség');

-- Kispetri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kispetri Református Egyházközség', 'Kispetri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'kispetri-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kispetri Református Egyházközség');

-- Körösfői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Körösfői Református Egyházközség', 'Körösfői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'korosfoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Körösfői Református Egyházközség');

-- Középlaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Középlaki Református Egyházközség', 'Középlaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'kozeplaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Középlaki Református Egyházközség');

-- Magyarbikali Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarbikali Református Egyházközség', 'Magyarbikali Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarbikali-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarbikali Református Egyházközség');

-- Magyargyerőmonostori Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyargyerőmonostori Református Egyházközség', 'Magyargyerőmonostori Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyargyeromonostori-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyargyerőmonostori Református Egyházközség');

-- Magyarkapusi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarkapusi Református Egyházközség', 'Magyarkapusi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarkapusi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarkapusi Református Egyházközség');

-- Magyarkiskapusi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarkiskapusi Református Egyházközség', 'Magyarkiskapusi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarkiskapusi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarkiskapusi Református Egyházközség');

-- Magyarlónai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarlónai Református Egyházközség', 'Magyarlónai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarlonai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarlónai Református Egyházközség');

-- Magyarókerekei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarókerekei Református Egyházközség', 'Magyarókerekei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarokerekei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarókerekei Református Egyházközség');

-- Magyarvalkói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarvalkói Református Egyházközség', 'Magyarvalkói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarvalkoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarvalkói Református Egyházközség');

-- Magyarvistai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarvistai Református Egyházközség', 'Magyarvistai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'magyarvistai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarvistai Református Egyházközség');

-- Mákófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mákófalvi Református Egyházközség', 'Mákófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'makofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mákófalvi Református Egyházközség');

-- Mérai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mérai Református Egyházközség', 'Mérai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'merai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mérai Református Egyházközség');

-- Nádasdaróczi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nádasdaróczi Református Egyházközség', 'Nádasdaróczi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'nadasdaroczi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nádasdaróczi Református Egyházközség');

-- Nagypetri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagypetri Református Egyházközség', 'Nagypetri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'nagypetri-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagypetri Református Egyházközség');

-- Nyárszó-Sárvásári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárszó-Sárvásári Református Egyházközség', 'Nyárszó-Sárvásári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'nyarszo-sarvasari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárszó-Sárvásári Református Egyházközség');

-- Sztánai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sztánai Református Egyházközség', 'Sztánai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'sztanai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sztánai Református Egyházközség');

-- Türei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Türei Református Egyházközség', 'Türei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'turei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Türei Református Egyházközség');

-- Váralmási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Váralmási Református Egyházközség', 'Váralmási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'varalmasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Váralmási Református Egyházközség');

-- Zsoboki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Zsoboki Református Egyházközség', 'Zsoboki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kalotaszegi Református Egyházmegye', d.id, 'Románia', 'zsoboki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kalotaszegi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Zsoboki Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Kézdi-Orbai Református Egyházmegye — 35 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Alsócsernátoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsócsernátoni Református Egyházközség', 'Alsócsernátoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'alsocsernatoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsócsernátoni Református Egyházközség');

-- Barátosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Barátosi Református Egyházközség', 'Barátosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'baratosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Barátosi Református Egyházközség');

-- Berecki Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Berecki Református Missziói Egyházközség', 'Berecki Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'berecki-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Berecki Református Missziói Egyházközség');

-- Bitai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bitai Református Egyházközség', 'Bitai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'bitai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bitai Református Egyházközség');

-- Cófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Cófalvi Református Egyházközség', 'Cófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'cofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Cófalvi Református Egyházközség');

-- Csomakőrösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csomakőrösi Református Egyházközség', 'Csomakőrösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'csomakorosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csomakőrösi Református Egyházközség');

-- Dálnoki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dálnoki Református Egyházközség', 'Dálnoki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'dalnoki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dálnoki Református Egyházközség');

-- Egerpataki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Egerpataki Református Egyházközség', 'Egerpataki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'egerpataki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Egerpataki Református Egyházközség');

-- Eresztevényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Eresztevényi Református Egyházközség', 'Eresztevényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'eresztevenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Eresztevényi Református Egyházközség');

-- Feldobolyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Feldobolyi Református Egyházközség', 'Feldobolyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'feldobolyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Feldobolyi Református Egyházközség');

-- Felsőcsernátoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felsőcsernátoni Református Egyházközség', 'Felsőcsernátoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'felsocsernatoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felsőcsernátoni Református Egyházközség');

-- Ikafalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ikafalvi Református Egyházközség', 'Ikafalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'ikafalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ikafalvi Református Egyházközség');

-- Karatnai Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Karatnai Református Missziói Egyházközség', 'Karatnai Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'karatnai-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Karatnai Református Missziói Egyházközség');

-- Kézdialbisi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kézdialbisi Református Egyházközség', 'Kézdialbisi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kezdialbisi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kézdialbisi Református Egyházközség');

-- Kézdimárkosfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kézdimárkosfalvi Református Egyházközség', 'Kézdimárkosfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kezdimarkosfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kézdimárkosfalvi Református Egyházközség');

-- Kézdimartonfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kézdimartonfalvi Református Egyházközség', 'Kézdimartonfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kezdimartonfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kézdimartonfalvi Református Egyházközség');

-- Kézdivásárhelyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kézdivásárhelyi Református Egyházközség', 'Kézdivásárhelyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kezdivasarhelyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kézdivásárhelyi Református Egyházközség');

-- Kisborosnyói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisborosnyói Református Egyházközség', 'Kisborosnyói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kisborosnyoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisborosnyói Református Egyházközség');

-- Komandói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Komandói Református Egyházközség', 'Komandói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'komandoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Komandói Református Egyházközség');

-- Kovászna I.- Belvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kovászna I.- Belvárosi Református Egyházközség', 'Kovászna I.- Belvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kovaszna-i-belvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kovászna I.- Belvárosi Református Egyházközség');

-- Kovászna II. – Vajnafalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kovászna II. – Vajnafalvi Református Egyházközség', 'Kovászna II. – Vajnafalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'kovaszna-ii-vajnafalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kovászna II. – Vajnafalvi Református Egyházközség');

-- Lécfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Lécfalvi Református Egyházközség', 'Lécfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'lecfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Lécfalvi Református Egyházközség');

-- Maksai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Maksai Református Egyházközség', 'Maksai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'maksai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Maksai Református Egyházközség');

-- Nagyborosnyói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagyborosnyói Református Egyházközség', 'Nagyborosnyói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'nagyborosnyoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagyborosnyói Református Egyházközség');

-- Orbaiteleki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Orbaiteleki Református Egyházközség', 'Orbaiteleki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'orbaiteleki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Orbaiteleki Református Egyházközség');

-- Pákéi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Pákéi Református Egyházközség', 'Pákéi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'pakei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Pákéi Református Egyházközség');

-- Papolci Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Papolci Református Egyházközség', 'Papolci Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'papolci-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Papolci Református Egyházközség');

-- Pávai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Pávai Református Egyházközség', 'Pávai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'pavai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Pávai Református Egyházközség');

-- Sepsibesenyői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsibesenyői Református Egyházközség', 'Sepsibesenyői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'sepsibesenyoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsibesenyői Református Egyházközség');

-- Szacsvai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szacsvai Református Egyházközség', 'Szacsvai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'szacsvai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szacsvai Református Egyházközség');

-- Székelytamásfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelytamásfalvi Református Egyházközség', 'Székelytamásfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'szekelytamasfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelytamásfalvi Református Egyházközség');

-- Szörcsei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szörcsei Református Egyházközség', 'Szörcsei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'szorcsei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szörcsei Református Egyházközség');

-- Torjai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Torjai Református Egyházközség', 'Torjai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'torjai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Torjai Református Egyházközség');

-- Zabolai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Zabolai Református Egyházközség', 'Zabolai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'zabolai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Zabolai Református Egyházközség');

-- Zágoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Zágoni Református Egyházközség', 'Zágoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kézdi-Orbai Református Egyházmegye', d.id, 'Románia', 'zagoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kézdi-Orbai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Zágoni Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Kolozsvári Református Egyházmegye — 36 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Apahidai Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Apahidai Református Missziói Egyházközség', 'Apahidai Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'apahidai-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Apahidai Református Missziói Egyházközség');

-- Bádoki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bádoki Református Egyházközség', 'Bádoki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'badoki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bádoki Református Egyházközség');

-- Bodonkúti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bodonkúti Református Egyházközség', 'Bodonkúti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'bodonkuti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bodonkúti Református Egyházközség');

-- Györgyfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Györgyfalvi Református Egyházközség', 'Györgyfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'gyorgyfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Györgyfalvi Református Egyházközség');

-- Kajántói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kajántói Református Egyházközség', 'Kajántói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kajantoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kajántói Református Egyházközség');

-- Kidei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kidei Református Egyházközség', 'Kidei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kidei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kidei Református Egyházközség');

-- Kisbácsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisbácsi Református Egyházközség', 'Kisbácsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kisbacsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisbácsi Református Egyházközség');

-- Kolozsborsai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsborsai Református Egyházközség', 'Kolozsborsai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsborsai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsborsai Református Egyházközség');

-- Kolozsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsi Református Egyházközség', 'Kolozsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsi Református Egyházközség');

-- Kolozsmonostori Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsmonostori Református Egyházközség', 'Kolozsmonostori Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsmonostori-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsmonostori Református Egyházközség');

-- Kolozspatai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozspatai Református Egyházközség', 'Kolozspatai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozspatai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozspatai Református Egyházközség');

-- Kolozsvár-Alsóvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Alsóvárosi Református Egyházközség', 'Kolozsvár-Alsóvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-alsovarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Alsóvárosi Református Egyházközség');

-- Kolozsvár-Belvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Belvárosi Református Egyházközség', 'Kolozsvár-Belvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-belvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Belvárosi Református Egyházközség');

-- Kolozsvár-Bulgáriatelepi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Bulgáriatelepi Református Egyházközség', 'Kolozsvár-Bulgáriatelepi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-bulgariatelepi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Bulgáriatelepi Református Egyházközség');

-- Kolozsvár-Felsővárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Felsővárosi Református Egyházközség', 'Kolozsvár-Felsővárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-felsovarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Felsővárosi Református Egyházközség');

-- Kolozsvár-Hidelvei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Hidelvei Református Egyházközség', 'Kolozsvár-Hidelvei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-hidelvei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Hidelvei Református Egyházközség');

-- Kolozsvár-Irisztelepi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Irisztelepi Református Egyházközség', 'Kolozsvár-Irisztelepi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-irisztelepi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Irisztelepi Református Egyházközség');

-- Kolozsvár-Kerekdombi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Kerekdombi Református Egyházközség', 'Kolozsvár-Kerekdombi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-kerekdombi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Kerekdombi Református Egyházközség');

-- Kolozsvár-Törökvágási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Törökvágási Református Egyházközség', 'Kolozsvár-Törökvágási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-torokvagasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Törökvágási Református Egyházközség');

-- Kolozsvár-Tóvidéki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Tóvidéki Református Egyházközség', 'Kolozsvár-Tóvidéki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-tovideki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Tóvidéki Református Egyházközség');

-- Kolozsvár-Újalsóvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kolozsvár-Újalsóvárosi Református Egyházközség', 'Kolozsvár-Újalsóvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'kolozsvar-ujalsovarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kolozsvár-Újalsóvárosi Református Egyházközség');

-- Magyarfenesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarfenesi Református Egyházközség', 'Magyarfenesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'magyarfenesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarfenesi Református Egyházközség');

-- Magyarkályáni Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarkályáni Református Missziói Egyházközség', 'Magyarkályáni Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'magyarkalyani-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarkályáni Református Missziói Egyházközség');

-- Magyarlétai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarlétai Református Egyházközség', 'Magyarlétai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'magyarletai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarlétai Református Egyházközség');

-- Magyarpalatkai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarpalatkai Református Egyházközség', 'Magyarpalatkai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'magyarpalatkai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarpalatkai Református Egyházközség');

-- Magyarszováti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarszováti Református Egyházközség', 'Magyarszováti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'magyarszovati-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarszováti Református Egyházközség');

-- Mezőkeszüi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőkeszüi Református Egyházközség', 'Mezőkeszüi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'mezokeszui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőkeszüi Református Egyházközség');

-- Mócsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mócsi Református Egyházközség', 'Mócsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'mocsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mócsi Református Egyházközség');

-- Pusztakamarási Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Pusztakamarási Református Missziói Egyházközség', 'Pusztakamarási Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'pusztakamarasi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Pusztakamarási Református Missziói Egyházközség');

-- Szamosfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szamosfalvi Református Egyházközség', 'Szamosfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'szamosfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szamosfalvi Református Egyházközség');

-- Szászfenesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szászfenesi Református Egyházközség', 'Szászfenesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'szaszfenesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szászfenesi Református Egyházközség');

-- Szucsági Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szucsági Református Egyházközség', 'Szucsági Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'szucsagi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szucsági Református Egyházközség');

-- Tordaszentlászlói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Tordaszentlászlói Református Egyházközség', 'Tordaszentlászlói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'tordaszentlaszloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Tordaszentlászlói Református Egyházközség');

-- Vajdakamarási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vajdakamarási Református Egyházközség', 'Vajdakamarási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'vajdakamarasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vajdakamarási Református Egyházközség');

-- Válaszúti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Válaszúti Református Egyházközség', 'Válaszúti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'valaszuti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Válaszúti Református Egyházközség');

-- Visai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Visai Református Egyházközség', 'Visai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Kolozsvári Református Egyházmegye', d.id, 'Románia', 'visai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Kolozsvári Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Visai Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Küküllői Református Egyházmegye — 57 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Ádámosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ádámosi Református Egyházközség', 'Ádámosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'adamosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ádámosi Református Egyházközség');

-- Backamadarasi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Backamadarasi Református Egyházközség', 'Backamadarasi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'backamadarasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Backamadarasi Református Egyházközség');

-- Balavásári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Balavásári Református Egyházközség', 'Balavásári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'balavasari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Balavásári Református Egyházközség');

-- Bedei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bedei Református Egyházközség', 'Bedei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'bedei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bedei Református Egyházközség');

-- Berekeresztúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Berekeresztúri Református Egyházközség', 'Berekeresztúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'berekereszturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Berekeresztúri Református Egyházközség');

-- Bonyhai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bonyhai Református Egyházközség', 'Bonyhai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'bonyhai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bonyhai Református Egyházközség');

-- Bözödi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bözödi Református Egyházközség', 'Bözödi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'bozodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bözödi Református Egyházközség');

-- Csíkfalvi Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csíkfalvi Református Missziói Egyházközség', 'Csíkfalvi Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'csikfalvi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csíkfalvi Református Missziói Egyházközség');

-- Désfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Désfalvi Református Egyházközség', 'Désfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'desfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Désfalvi Református Egyházközség');

-- Dicsőszentmártoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dicsőszentmártoni Református Egyházközség', 'Dicsőszentmártoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'dicsoszentmartoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dicsőszentmártoni Református Egyházközség');

-- Egrestői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Egrestői Református Egyházközség', 'Egrestői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'egrestoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Egrestői Református Egyházközség');

-- Erdőszentgyörgyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Erdőszentgyörgyi Református Egyházközség', 'Erdőszentgyörgyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'erdoszentgyorgyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Erdőszentgyörgyi Református Egyházközség');

-- Fehéregyházi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fehéregyházi Református Egyházközség', 'Fehéregyházi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'feheregyhazi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fehéregyházi Református Egyházközség');

-- Gegesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gegesi Református Egyházközség', 'Gegesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'gegesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gegesi Református Egyházközség');

-- Gógáni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gógáni Református Egyházközség', 'Gógáni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'gogani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gógáni Református Egyházközség');

-- Gógánváraljai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gógánváraljai Református Egyházközség', 'Gógánváraljai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'goganvaraljai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gógánváraljai Református Egyházközség');

-- Gyulakutai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gyulakutai Református Egyházközség', 'Gyulakutai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'gyulakutai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gyulakutai Református Egyházközség');

-- Haranglábi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Haranglábi Református Egyházközség', 'Haranglábi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'haranglabi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Haranglábi Református Egyházközség');

-- Hármasfalui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hármasfalui Református Egyházközség', 'Hármasfalui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'harmasfalui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hármasfalui Református Egyházközség');

-- Havadi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Havadi Református Egyházközség', 'Havadi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'havadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Havadi Református Egyházközség');

-- Havadtői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Havadtői Református Egyházközség', 'Havadtői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'havadtoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Havadtői Református Egyházközség');

-- Héderfáji Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Héderfáji Református Egyházközség', 'Héderfáji Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'hederfaji-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Héderfáji Református Egyházközség');

-- Héjjasfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Héjjasfalvi Református Egyházközség', 'Héjjasfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'hejjasfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Héjjasfalvi Református Egyházközség');

-- Kelementelki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kelementelki Református Egyházközség', 'Kelementelki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'kelementelki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kelementelki Református Egyházközség');

-- Kibédi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kibédi Református Egyházközség', 'Kibédi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'kibedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kibédi Református Egyházközség');

-- Kiskendi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kiskendi Református Egyházközség', 'Kiskendi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'kiskendi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kiskendi Református Egyházközség');

-- Kóródszentmártoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kóródszentmártoni Református Egyházközség', 'Kóródszentmártoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'korodszentmartoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kóródszentmártoni Református Egyházközség');

-- Küküllőpócsfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küküllőpócsfalvi Református Egyházközség', 'Küküllőpócsfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'kukullopocsfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küküllőpócsfalvi Református Egyházközség');

-- Küküllőszéplaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küküllőszéplaki Református Egyházközség', 'Küküllőszéplaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'kukulloszeplaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küküllőszéplaki Református Egyházközség');

-- Magyarkirályfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarkirályfalvi Református Egyházközség', 'Magyarkirályfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'magyarkiralyfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarkirályfalvi Református Egyházközség');

-- Májai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Májai Református Egyházközség', 'Májai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'majai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Májai Református Egyházközség');

-- Makfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Makfalvi Református Egyházközség', 'Makfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'makfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Makfalvi Református Egyházközség');

-- Márkodi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Márkodi Református Egyházközség', 'Márkodi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'markodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Márkodi Református Egyházközség');

-- Mikefalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mikefalvi Református Egyházközség', 'Mikefalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'mikefalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mikefalvi Református Egyházközség');

-- Nagybúni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagybúni Református Egyházközség', 'Nagybúni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nagybuni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagybúni Református Egyházközség');

-- Nagykendi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagykendi Református Egyházközség', 'Nagykendi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nagykendi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagykendi Református Egyházközség');

-- Nyárádmagyarósi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádmagyarósi Református Egyházközség', 'Nyárádmagyarósi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradmagyarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádmagyarósi Református Egyházközség');

-- Nyárádselyei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádselyei Református Egyházközség', 'Nyárádselyei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradselyei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádselyei Református Egyházközség');

-- Nyárádszentannai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádszentannai Református Egyházközség', 'Nyárádszentannai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradszentannai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádszentannai Református Egyházközség');

-- Nyárádszentimrei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádszentimrei Református Egyházközség', 'Nyárádszentimrei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradszentimrei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádszentimrei Református Egyházközség');

-- Nyárádszentsimoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádszentsimoni Református Egyházközség', 'Nyárádszentsimoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradszentsimoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádszentsimoni Református Egyházközség');

-- Nyárádszeredai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádszeredai Református Egyházközség', 'Nyárádszeredai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'nyaradszeredai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádszeredai Református Egyházközség');

-- Segesvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Segesvári Református Egyházközség', 'Segesvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'segesvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Segesvári Református Egyházközség');

-- Sóváradi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sóváradi Református Egyházközség', 'Sóváradi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'sovaradi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sóváradi Református Egyházközség');

-- Sövényfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sövényfalvi Református Egyházközség', 'Sövényfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'sovenyfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sövényfalvi Református Egyházközség');

-- Szászcsávási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szászcsávási Református Egyházközség', 'Szászcsávási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szaszcsavasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szászcsávási Református Egyházközség');

-- Szederjesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szederjesi Református Egyházközség', 'Szederjesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szederjesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szederjesi Református Egyházközség');

-- Székelyabodi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyabodi Református Egyházközség', 'Székelyabodi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szekelyabodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyabodi Református Egyházközség');

-- Székelytompai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelytompai Református Egyházközség', 'Székelytompai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szekelytompai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelytompai Református Egyházközség');

-- Szentgericei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szentgericei Református Egyházközség', 'Szentgericei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szentgericei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szentgericei Református Egyházközség');

-- Szőkefalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szőkefalvi Református Egyházközség', 'Szőkefalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szokefalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szőkefalvi Református Egyházközség');

-- Szolokmai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szolokmai Református Egyházközség', 'Szolokmai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szolokmai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szolokmai Református Egyházközség');

-- Szovátai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szovátai Református Egyházközség', 'Szovátai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szovatai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szovátai Református Egyházközség');

-- Szövérdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szövérdi Református Egyházközség', 'Szövérdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'szoverdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szövérdi Református Egyházközség');

-- Torboszlói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Torboszlói Református Egyházközség', 'Torboszlói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'torboszloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Torboszlói Református Egyházközség');

-- Vadasdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vadasdi Református Egyházközség', 'Vadasdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'vadasdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vadasdi Református Egyházközség');

-- Vámosgálfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vámosgálfalvi Református Egyházközség', 'Vámosgálfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Küküllői Református Egyházmegye', d.id, 'Románia', 'vamosgalfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Küküllői Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vámosgálfalvi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Maros-Mezőségi Református Egyházmegye — 29 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Csittszentiváni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csittszentiváni Református Egyházközség', 'Csittszentiváni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'csittszentivani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csittszentiváni Református Egyházközség');

-- Galambodi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Galambodi Református Egyházközség', 'Galambodi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'galambodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Galambodi Református Egyházközség');

-- Kissármási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kissármási Református Egyházközség', 'Kissármási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'kissarmasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kissármási Református Egyházközség');

-- Madarasi-Feketei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Madarasi-Feketei Református Egyházközség', 'Madarasi-Feketei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'madarasi-feketei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Madarasi-Feketei Református Egyházközség');

-- Marosszentannai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosszentannai Református Egyházközség', 'Marosszentannai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosszentannai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosszentannai Református Egyházközség');

-- Marosszentkirályi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosszentkirályi Református Egyházközség', 'Marosszentkirályi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosszentkiralyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosszentkirályi Református Egyházközség');

-- Marosvásárhely III. – Alsóvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely III. – Alsóvárosi Református Egyházközség', 'Marosvásárhely III. – Alsóvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-iii-alsovarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely III. – Alsóvárosi Református Egyházközség');

-- Marosvásárhely IV. – Szabadi úti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely IV. – Szabadi úti Református Egyházközség', 'Marosvásárhely IV. – Szabadi úti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-iv-szabadi-uti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely IV. – Szabadi úti Református Egyházközség');

-- Marosvásárhely V. – Felsővárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely V. – Felsővárosi Református Egyházközség', 'Marosvásárhely V. – Felsővárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-v-felsovarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely V. – Felsővárosi Református Egyházközség');

-- Marosvásárhely VI. – Meggyesfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely VI. – Meggyesfalvi Református Egyházközség', 'Marosvásárhely VI. – Meggyesfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-vi-meggyesfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely VI. – Meggyesfalvi Református Egyházközség');

-- Marosvásárhely VII. – Szabadság utcai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely VII. – Szabadság utcai Református Egyházközség', 'Marosvásárhely VII. – Szabadság utcai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-vii-szabadsag-utcai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely VII. – Szabadság utcai Református Egyházközség');

-- Mezőbándi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőbándi Református Egyházközség', 'Mezőbándi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezobandi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőbándi Református Egyházközség');

-- Mezőbergenyei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőbergenyei Református Egyházközség', 'Mezőbergenyei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezobergenyei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőbergenyei Református Egyházközség');

-- Mezőbodoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőbodoni Református Egyházközség', 'Mezőbodoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezobodoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőbodoni Református Egyházközség');

-- Mezőcsávási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőcsávási Református Egyházközség', 'Mezőcsávási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezocsavasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőcsávási Református Egyházközség');

-- Mezőfelei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőfelei Református Egyházközség', 'Mezőfelei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezofelei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőfelei Református Egyházközség');

-- Mezőkölpényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőkölpényi Református Egyházközség', 'Mezőkölpényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezokolpenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőkölpényi Református Egyházközség');

-- Mezőmadarasi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőmadarasi Református Egyházközség', 'Mezőmadarasi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezomadarasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőmadarasi Református Egyházközség');

-- Mezőméhesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőméhesi Református Egyházközség', 'Mezőméhesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezomehesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőméhesi Református Egyházközség');

-- Mezőpaniti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőpaniti Református Egyházközség', 'Mezőpaniti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezopaniti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőpaniti Református Egyházközség');

-- Mezősámsondi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezősámsondi Református Egyházközség', 'Mezősámsondi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezosamsondi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezősámsondi Református Egyházközség');

-- Mezőzáhi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőzáhi Református Egyházközség', 'Mezőzáhi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'mezozahi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőzáhi Református Egyházközség');

-- Nagyernyei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagyernyei Református Egyházközség', 'Nagyernyei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'nagyernyei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagyernyei Református Egyházközség');

-- Nagysármási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagysármási Református Egyházközség', 'Nagysármási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'nagysarmasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagysármási Református Egyházközség');

-- Székelykakasdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelykakasdi Református Egyházközség', 'Székelykakasdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'szekelykakasdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelykakasdi Református Egyházközség');

-- Székelykövesdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelykövesdi Református Egyházközség', 'Székelykövesdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'szekelykovesdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelykövesdi Református Egyházközség');

-- Udvarfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Udvarfalvi Református Egyházközség', 'Udvarfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'udvarfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Udvarfalvi Református Egyházközség');

-- Uzdiszentpéteri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Uzdiszentpéteri Református Egyházközség', 'Uzdiszentpéteri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'uzdiszentpeteri-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Uzdiszentpéteri Református Egyházközség');

-- Várhegyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Várhegyi Református Egyházközség', 'Várhegyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Maros-Mezőségi Református Egyházmegye', d.id, 'Románia', 'varhegyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Maros-Mezőségi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Várhegyi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Marosi Református Egyházmegye — 43 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Ákosfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ákosfalvi Református Egyházközség', 'Ákosfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'akosfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ákosfalvi Református Egyházközség');

-- Búzásbesenyői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Búzásbesenyői Református Egyházközség', 'Búzásbesenyői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'buzasbesenyoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Búzásbesenyői Református Egyházközség');

-- Csejdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csejdi Református Egyházközség', 'Csejdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'csejdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csejdi Református Egyházközség');

-- Csekelaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csekelaki Református Egyházközség', 'Csekelaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'csekelaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csekelaki Református Egyházközség');

-- Cserefalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Cserefalvi Református Egyházközség', 'Cserefalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'cserefalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Cserefalvi Református Egyházközség');

-- Dózsa Györgyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Dózsa Györgyi Református Egyházközség', 'Dózsa Györgyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'dozsa-gyorgyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Dózsa Györgyi Református Egyházközség');

-- Fintaházi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fintaházi Református Egyházközség', 'Fintaházi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'fintahazi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fintaházi Református Egyházközség');

-- Gerendkeresztúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gerendkeresztúri Református Egyházközség', 'Gerendkeresztúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'gerendkereszturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gerendkeresztúri Református Egyházközség');

-- Göcsi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Göcsi Református Egyházközség', 'Göcsi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'gocsi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Göcsi Református Egyházközség');

-- Hagymásbodoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hagymásbodoni Református Egyházközség', 'Hagymásbodoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'hagymasbodoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hagymásbodoni Református Egyházközség');

-- Harasztkeréki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Harasztkeréki Református Egyházközség', 'Harasztkeréki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'harasztkereki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Harasztkeréki Református Egyházközség');

-- Istvánházi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Istvánházi Református Egyházközség', 'Istvánházi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'istvanhazi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Istvánházi Református Egyházközség');

-- Jeddi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Jeddi Református Egyházközség', 'Jeddi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'jeddi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Jeddi Református Egyházközség');

-- Káposztásszentmiklósi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Káposztásszentmiklósi Református Egyházközség', 'Káposztásszentmiklósi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'kaposztasszentmiklosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Káposztásszentmiklósi Református Egyházközség');

-- Kebelei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kebelei Református Egyházközség', 'Kebelei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'kebelei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kebelei Református Egyházközség');

-- Kisgörgényi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisgörgényi Református Egyházközség', 'Kisgörgényi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'kisgorgenyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisgörgényi Református Egyházközség');

-- Koronkai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Koronkai Református Egyházközség', 'Koronkai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'koronkai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Koronkai Református Egyházközség');

-- Kutyfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kutyfalvi Református Egyházközség', 'Kutyfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'kutyfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kutyfalvi Református Egyházközség');

-- Lőrincfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Lőrincfalvi Református Egyházközség', 'Lőrincfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'lorincfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Lőrincfalvi Református Egyházközség');

-- Ludastelepi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ludastelepi Református Egyházközség', 'Ludastelepi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'ludastelepi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ludastelepi Református Egyházközség');

-- Magyarbükkösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarbükkösi Református Egyházközség', 'Magyarbükkösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'magyarbukkosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarbükkösi Református Egyházközség');

-- Magyardellői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyardellői Református Egyházközség', 'Magyardellői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'magyardelloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyardellői Református Egyházközség');

-- Magyarózdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarózdi Református Egyházközség', 'Magyarózdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'magyarozdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarózdi Református Egyházközség');

-- Marosbogáti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosbogáti Református Egyházközség', 'Marosbogáti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosbogati-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosbogáti Református Egyházközség');

-- Maroscsapói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Maroscsapói Református Egyházközség', 'Maroscsapói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'maroscsapoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Maroscsapói Református Egyházközség');

-- Maroskeresztúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Maroskeresztúri Református Egyházközség', 'Maroskeresztúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'maroskereszturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Maroskeresztúri Református Egyházközség');

-- Marosludasi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosludasi Református Egyházközség', 'Marosludasi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosludasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosludasi Református Egyházközség');

-- Marosszentgyörgyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosszentgyörgyi Református Egyházközség', 'Marosszentgyörgyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosszentgyorgyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosszentgyörgyi Református Egyházközség');

-- Marosugrai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosugrai Református Egyházközség', 'Marosugrai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosugrai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosugrai Református Egyházközség');

-- Marosvásárhely I. – Vártemplomi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely I. – Vártemplomi Református Egyházközség', 'Marosvásárhely I. – Vártemplomi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-i-vartemplomi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely I. – Vártemplomi Református Egyházközség');

-- Marosvásárhely II. – Gecse utcai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely II. – Gecse utcai Református Egyházközség', 'Marosvásárhely II. – Gecse utcai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-ii-gecse-utcai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely II. – Gecse utcai Református Egyházközség');

-- Marosvásárhely VIII. – Cserealjai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely VIII. – Cserealjai Református Egyházközség', 'Marosvásárhely VIII. – Cserealjai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-viii-cserealjai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely VIII. – Cserealjai Református Egyházközség');

-- Marosvásárhely IX. – Tulipán utcai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely IX. – Tulipán utcai Református Egyházközség', 'Marosvásárhely IX. – Tulipán utcai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-ix-tulipan-utcai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely IX. – Tulipán utcai Református Egyházközség');

-- Marosvásárhely X. – Kövesdombi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosvásárhely X. – Kövesdombi Református Egyházközség', 'Marosvásárhely X. – Kövesdombi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'marosvasarhely-x-kovesdombi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosvásárhely X. – Kövesdombi Református Egyházközség');

-- Nyárádkarácsonfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádkarácsonfalvi Református Egyházközség', 'Nyárádkarácsonfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'nyaradkaracsonfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádkarácsonfalvi Református Egyházközség');

-- Nyárádszentbenedeki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádszentbenedeki Református Egyházközség', 'Nyárádszentbenedeki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'nyaradszentbenedeki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádszentbenedeki Református Egyházközség');

-- Nyárádtői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nyárádtői Református Egyházközség', 'Nyárádtői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'nyaradtoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nyárádtői Református Egyházközség');

-- Oláhdellői Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Oláhdellői Református Egyházközség', 'Oláhdellői Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'olahdelloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Oláhdellői Református Egyházközség');

-- Radnóti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Radnóti Református Egyházközség', 'Radnóti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'radnoti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Radnóti Református Egyházközség');

-- Somosdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Somosdi Református Egyházközség', 'Somosdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'somosdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Somosdi Református Egyházközség');

-- Székelyvajai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyvajai Református Egyházközség', 'Székelyvajai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'szekelyvajai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyvajai Református Egyházközség');

-- Székesi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székesi Református Egyházközség', 'Székesi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'szekesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székesi Református Egyházközség');

-- Teremiújfalui Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Teremiújfalui Református Egyházközség', 'Teremiújfalui Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Marosi Református Egyházmegye', d.id, 'Románia', 'teremiujfalui-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Marosi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Teremiújfalui Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Nagyenyedi Református Egyházmegye — 29 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Abrudbányai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Abrudbányai Református Egyházközség', 'Abrudbányai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'abrudbanyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Abrudbányai Református Egyházközség');

-- Balázsfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Balázsfalvi Református Egyházközség', 'Balázsfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'balazsfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Balázsfalvi Református Egyházközség');

-- Bethlenszentmiklósi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bethlenszentmiklósi Református Egyházközség', 'Bethlenszentmiklósi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'bethlenszentmiklosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bethlenszentmiklósi Református Egyházközség');

-- Búzásbocsárdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Búzásbocsárdi Református Egyházközség', 'Búzásbocsárdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'buzasbocsardi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Búzásbocsárdi Református Egyházközség');

-- Csombordi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csombordi Református Egyházközség', 'Csombordi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'csombordi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csombordi Református Egyházközség');

-- Enyedszentkirályi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Enyedszentkirályi Református Egyházközség', 'Enyedszentkirályi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'enyedszentkiralyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Enyedszentkirályi Református Egyházközség');

-- Felenyedi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felenyedi Református Egyházközség', 'Felenyedi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'felenyedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felenyedi Református Egyházközség');

-- Felvinci Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felvinci Református Egyházközség', 'Felvinci Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'felvinci-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felvinci Református Egyházközség');

-- Gyulafehérvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gyulafehérvári Református Egyházközség', 'Gyulafehérvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'gyulafehervari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gyulafehérvári Református Egyházközség');

-- Küküllőboldogfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küküllőboldogfalvi Református Egyházközség', 'Küküllőboldogfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'kukulloboldogfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küküllőboldogfalvi Református Egyházközség');

-- Küküllővári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küküllővári Református Egyházközség', 'Küküllővári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'kukullovari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küküllővári Református Egyházközség');

-- Lőrincrévei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Lőrincrévei Református Egyházközség', 'Lőrincrévei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'lorincrevei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Lőrincrévei Református Egyházközség');

-- Magyarbecei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarbecei Református Egyházközség', 'Magyarbecei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'magyarbecei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarbecei Református Egyházközség');

-- Magyarbényei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarbényei Református Egyházközség', 'Magyarbényei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'magyarbenyei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarbényei Református Egyházközség');

-- Magyarigeni Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarigeni Református Missziói Egyházközség', 'Magyarigeni Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'magyarigeni-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarigeni Református Missziói Egyházközség');

-- Magyarlapádi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarlapádi Református Egyházközség', 'Magyarlapádi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'magyarlapadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarlapádi Református Egyházközség');

-- Magyarpéterfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarpéterfalvi Református Egyházközség', 'Magyarpéterfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'magyarpeterfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarpéterfalvi Református Egyházközség');

-- Maroscsúcs-Koppándi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Maroscsúcs-Koppándi Református Egyházközség', 'Maroscsúcs-Koppándi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'maroscsucs-koppandi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Maroscsúcs-Koppándi Református Egyházközség');

-- Marosdécsei Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosdécsei Református Egyházközség', 'Marosdécsei Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'marosdecsei-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosdécsei Református Egyházközség');

-- Marosgombás Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosgombás Református Egyházközség', 'Marosgombás Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'marosgombas-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosgombás Református Egyházközség');

-- Marosnagylaki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosnagylaki Református Egyházközség', 'Marosnagylaki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'marosnagylaki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosnagylaki Református Egyházközség');

-- Marosújvári Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Marosújvári Református Egyházközség', 'Marosújvári Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'marosujvari-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Marosújvári Református Egyházközség');

-- Miriszlói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Miriszlói Református Egyházközség', 'Miriszlói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'miriszloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Miriszlói Református Egyházközség');

-- Nagyenyedi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagyenyedi Református Egyházközség', 'Nagyenyedi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'nagyenyedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagyenyedi Református Egyházközség');

-- Nagymedvési Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagymedvési Református Egyházközség', 'Nagymedvési Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'nagymedvesi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagymedvési Református Egyházközség');

-- Székelykocsárdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelykocsárdi Református Egyházközség', 'Székelykocsárdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'szekelykocsardi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelykocsárdi Református Egyházközség');

-- Torockószentgyörgyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Torockószentgyörgyi Református Egyházközség', 'Torockószentgyörgyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'torockoszentgyorgyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Torockószentgyörgyi Református Egyházközség');

-- Tövisi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Tövisi Református Egyházközség', 'Tövisi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'tovisi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Tövisi Református Egyházközség');

-- Vajasdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Vajasdi Református Egyházközség', 'Vajasdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Nagyenyedi Református Egyházmegye', d.id, 'Románia', 'vajasdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Nagyenyedi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Vajasdi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Sepsi Református Egyházmegye — 31 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Aldobolyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Aldobolyi Református Egyházközség', 'Aldobolyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'aldobolyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Aldobolyi Református Egyházközség');

-- Angyalosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Angyalosi Református Egyházközség', 'Angyalosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'angyalosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Angyalosi Református Egyházközség');

-- Árapataki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Árapataki Református Egyházközség', 'Árapataki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'arapataki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Árapataki Református Egyházközség');

-- Árkosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Árkosi Református Egyházközség', 'Árkosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'arkosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Árkosi Református Egyházközség');

-- Bikfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bikfalvi Református Egyházközség', 'Bikfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'bikfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bikfalvi Református Egyházközség');

-- Erősdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Erősdi Református Egyházközség', 'Erősdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'erosdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Erősdi Református Egyházközség');

-- Étfalvazoltáni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Étfalvazoltáni Református Egyházközség', 'Étfalvazoltáni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'etfalvazoltani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Étfalvazoltáni Református Egyházközség');

-- Fotosmartonosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fotosmartonosi Református Egyházközség', 'Fotosmartonosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'fotosmartonosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fotosmartonosi Református Egyházközség');

-- Gidófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gidófalvi Református Egyházközség', 'Gidófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'gidofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gidófalvi Református Egyházközség');

-- Hídvégi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hídvégi Református Egyházközség', 'Hídvégi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'hidvegi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hídvégi Református Egyházközség');

-- Illyefalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Illyefalvi Református Egyházközség', 'Illyefalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'illyefalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Illyefalvi Református Egyházközség');

-- Kálnoki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kálnoki Református Egyházközség', 'Kálnoki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'kalnoki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kálnoki Református Egyházközség');

-- Kilyéni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kilyéni Református Egyházközség', 'Kilyéni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'kilyeni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kilyéni Református Egyházközség');

-- Kökösi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kökösi Református Egyházközség', 'Kökösi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'kokosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kökösi Református Egyházközség');

-- Komollói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Komollói Református Egyházközség', 'Komollói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'komolloi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Komollói Református Egyházközség');

-- Lisznyói Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Lisznyói Református Egyházközség', 'Lisznyói Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'lisznyoi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Lisznyói Református Egyházközség');

-- Málnási Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Málnási Református Egyházközség', 'Málnási Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'malnasi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Málnási Református Egyházközség');

-- Mikóújfalusi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mikóújfalusi Református Egyházközség', 'Mikóújfalusi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'mikoujfalusi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mikóújfalusi Református Egyházközség');

-- Oltszemi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Oltszemi Református Egyházközség', 'Oltszemi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'oltszemi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Oltszemi Református Egyházközség');

-- Rétyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Rétyi Református Egyházközség', 'Rétyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'retyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Rétyi Református Egyházközség');

-- Sepsibodoki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsibodoki Református Egyházközség', 'Sepsibodoki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsibodoki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsibodoki Református Egyházközség');

-- Sepsikőröspataki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsikőröspataki Református Egyházközség', 'Sepsikőröspataki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsikorospataki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsikőröspataki Református Egyházközség');

-- Sepsimagyarosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsimagyarosi Református Egyházközség', 'Sepsimagyarosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsimagyarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsimagyarosi Református Egyházközség');

-- Sepsiszentgyörgy I. – Vártemplomi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsiszentgyörgy I. – Vártemplomi Református Egyházközség', 'Sepsiszentgyörgy I. – Vártemplomi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsiszentgyorgy-i-vartemplomi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsiszentgyörgy I. – Vártemplomi Református Egyházközség');

-- Sepsiszentgyörgy II. – Szemerjai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsiszentgyörgy II. – Szemerjai Református Egyházközség', 'Sepsiszentgyörgy II. – Szemerjai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsiszentgyorgy-ii-szemerjai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsiszentgyörgy II. – Szemerjai Református Egyházközség');

-- Sepsiszentgyörgy III. – Belvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsiszentgyörgy III. – Belvárosi Református Egyházközség', 'Sepsiszentgyörgy III. – Belvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsiszentgyorgy-iii-belvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsiszentgyörgy III. – Belvárosi Református Egyházközség');

-- Sepsiszentgyörgy IV. – Gyöngyvirág utcai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsiszentgyörgy IV. – Gyöngyvirág utcai Református Egyházközség', 'Sepsiszentgyörgy IV. – Gyöngyvirág utcai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsiszentgyorgy-iv-gyongyvirag-utcai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsiszentgyörgy IV. – Gyöngyvirág utcai Református Egyházközség');

-- Sepsiszentkirályi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Sepsiszentkirályi Református Egyházközség', 'Sepsiszentkirályi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'sepsiszentkiralyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Sepsiszentkirályi Református Egyházközség');

-- Szotyori Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szotyori Református Egyházközség', 'Szotyori Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'szotyori-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szotyori Református Egyházközség');

-- Uzoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Uzoni Református Egyházközség', 'Uzoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'uzoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Uzoni Református Egyházközség');

-- Zaláni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Zaláni Református Egyházközség', 'Zaláni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Sepsi Református Egyházmegye', d.id, 'Románia', 'zalani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Sepsi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Zaláni Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Székelyudvarhelyi Református Egyházmegye — 43 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Agyagfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Agyagfalvi Református Egyházközség', 'Agyagfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'agyagfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Agyagfalvi Református Egyházközség');

-- Alsóboldogfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsóboldogfalvi Református Egyházközség', 'Alsóboldogfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'alsoboldogfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsóboldogfalvi Református Egyházközség');

-- Alsósófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsósófalvi Református Egyházközség', 'Alsósófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'alsosofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsósófalvi Református Egyházközség');

-- Bágyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bágyi Református Egyházközség', 'Bágyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'bagyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bágyi Református Egyházközség');

-- Betfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Betfalvi Református Egyházközség', 'Betfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'betfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Betfalvi Református Egyházközség');

-- Bikafalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bikafalvi Református Egyházközség', 'Bikafalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'bikafalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bikafalvi Református Egyházközség');

-- Bögözi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Bögözi Református Egyházközség', 'Bögözi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'bogozi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Bögözi Református Egyházközség');

-- Csekefalvi Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csekefalvi Református Missziói Egyházközség', 'Csekefalvi Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'csekefalvi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csekefalvi Református Missziói Egyházközség');

-- Csíkszentmártoni Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csíkszentmártoni Református Missziói Egyházközség', 'Csíkszentmártoni Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'csikszentmartoni-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csíkszentmártoni Református Missziói Egyházközség');

-- Csíkszeredai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Csíkszeredai Református Egyházközség', 'Csíkszeredai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'csikszeredai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Csíkszeredai Református Egyházközség');

-- Etédi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Etédi Református Egyházközség', 'Etédi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'etedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Etédi Református Egyházközség');

-- Farcádi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Farcádi Református Egyházközség', 'Farcádi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'farcadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Farcádi Református Egyházközség');

-- Felsőboldogfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felsőboldogfalvi Református Egyházközség', 'Felsőboldogfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'felsoboldogfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felsőboldogfalvi Református Egyházközség');

-- Felsősófalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Felsősófalvi Református Egyházközség', 'Felsősófalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'felsosofalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Felsősófalvi Református Egyházközség');

-- Fiatfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Fiatfalvi Református Egyházközség', 'Fiatfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'fiatfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Fiatfalvi Református Egyházközség');

-- Gyergyószentmiklósi Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Gyergyószentmiklósi Református Missziói Egyházközség', 'Gyergyószentmiklósi Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'gyergyoszentmiklosi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Gyergyószentmiklósi Református Missziói Egyházközség');

-- Hodgyai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Hodgyai Református Egyházközség', 'Hodgyai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'hodgyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Hodgyai Református Egyházközség');

-- Homoródszentmártoni Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Homoródszentmártoni Református Missziói Egyházközség', 'Homoródszentmártoni Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'homorodszentmartoni-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Homoródszentmártoni Református Missziói Egyházközség');

-- Kányádi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kányádi Református Egyházközség', 'Kányádi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'kanyadi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kányádi Református Egyházközség');

-- Kecseti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kecseti Református Egyházközség', 'Kecseti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'kecseti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kecseti Református Egyházközség');

-- Kisgalambfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kisgalambfalvi Református Egyházközség', 'Kisgalambfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'kisgalambfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kisgalambfalvi Református Egyházközség');

-- Kőrispataki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kőrispataki Református Egyházközség', 'Kőrispataki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'korispataki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kőrispataki Református Egyházközség');

-- Küsmődi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Küsmődi Református Egyházközség', 'Küsmődi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'kusmodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Küsmődi Református Egyházközség');

-- Madéfalvi Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Madéfalvi Református Missziói Egyházközség', 'Madéfalvi Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'madefalvi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Madéfalvi Református Missziói Egyházközség');

-- Mátisfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mátisfalvi Református Egyházközség', 'Mátisfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'matisfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mátisfalvi Református Egyházközség');

-- Nagygalambfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagygalambfalvi Református Egyházközség', 'Nagygalambfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'nagygalambfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagygalambfalvi Református Egyházközség');

-- Nagysolymosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Nagysolymosi Református Egyházközség', 'Nagysolymosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'nagysolymosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Nagysolymosi Református Egyházközség');

-- Ócfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ócfalvi Református Egyházközség', 'Ócfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'ocfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ócfalvi Református Egyházközség');

-- Parajdi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Parajdi Református Egyházközség', 'Parajdi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'parajdi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Parajdi Református Egyházközség');

-- Patakfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Patakfalvi Református Egyházközség', 'Patakfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'patakfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Patakfalvi Református Egyházközség');

-- Peteki Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Peteki Református Egyházközség', 'Peteki Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'peteki-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Peteki Református Egyházközség');

-- Rugonfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Rugonfalvi Református Egyházközség', 'Rugonfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'rugonfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Rugonfalvi Református Egyházközség');

-- Siklódi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Siklódi Református Egyházközség', 'Siklódi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'siklodi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Siklódi Református Egyházközség');

-- Siménfalvi Református Missziói Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Siménfalvi Református Missziói Egyházközség', 'Siménfalvi Református Missziói Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'simenfalvi-reformatus-misszioi-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Siménfalvi Református Missziói Egyházközség');

-- Székelydályai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelydályai Református Egyházközség', 'Székelydályai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelydalyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelydályai Református Egyházközség');

-- Székelykeresztúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelykeresztúri Református Egyházközség', 'Székelykeresztúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelykereszturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelykeresztúri Református Egyházközség');

-- Székelymuzsnai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelymuzsnai Református Egyházközség', 'Székelymuzsnai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelymuzsnai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelymuzsnai Református Egyházközség');

-- Székelyszenterzsébeti Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyszenterzsébeti Református Egyházközség', 'Székelyszenterzsébeti Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelyszenterzsebeti-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyszenterzsébeti Református Egyházközség');

-- Székelyudvarhely-Belvárosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyudvarhely-Belvárosi Református Egyházközség', 'Székelyudvarhely-Belvárosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelyudvarhely-belvarosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyudvarhely-Belvárosi Református Egyházközség');

-- Székelyudvarhely-Bethlen-negyedi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyudvarhely-Bethlen-negyedi Református Egyházközség', 'Székelyudvarhely-Bethlen-negyedi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelyudvarhely-bethlen-negyedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyudvarhely-Bethlen-negyedi Református Egyházközség');

-- Székelyudvarhely-Szombatfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Székelyudvarhely-Szombatfalvi Református Egyházközség', 'Székelyudvarhely-Szombatfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szekelyudvarhely-szombatfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Székelyudvarhely-Szombatfalvi Református Egyházközség');

-- Szentkeresztbányai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Szentkeresztbányai Református Egyházközség', 'Szentkeresztbányai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'szentkeresztbanyai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Szentkeresztbányai Református Egyházközség');

-- Telekfalvi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Telekfalvi Református Egyházközség', 'Telekfalvi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Székelyudvarhelyi Református Egyházmegye', d.id, 'Románia', 'telekfalvi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Székelyudvarhelyi Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Telekfalvi Református Egyházközség');

-- ════════════════════════════════════════════════════════════════════════════
-- Tordai Református Egyházmegye — 14 egyházközség
-- ════════════════════════════════════════════════════════════════════════════
-- Ajtoni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ajtoni Református Egyházközség', 'Ajtoni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'ajtoni-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ajtoni Református Egyházközség');

-- Alsó-Felsőszentmihályi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Alsó-Felsőszentmihályi Református Egyházközség', 'Alsó-Felsőszentmihályi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'also-felsoszentmihalyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Alsó-Felsőszentmihályi Református Egyházközség');

-- Aranyosegerbegyi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Aranyosegerbegyi Református Egyházközség', 'Aranyosegerbegyi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'aranyosegerbegyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Aranyosegerbegyi Református Egyházközség');

-- Aranyosgerendi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Aranyosgerendi Református Egyházközség', 'Aranyosgerendi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'aranyosgerendi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Aranyosgerendi Református Egyházközség');

-- Aranyosgyéresi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Aranyosgyéresi Református Egyházközség', 'Aranyosgyéresi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'aranyosgyeresi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Aranyosgyéresi Református Egyházközség');

-- Aranyospolyáni Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Aranyospolyáni Református Egyházközség', 'Aranyospolyáni Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'aranyospolyani-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Aranyospolyáni Református Egyházközség');

-- Detrehemtelepi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Detrehemtelepi Református Egyházközség', 'Detrehemtelepi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'detrehemtelepi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Detrehemtelepi Református Egyházközség');

-- Harasztosi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Harasztosi Református Egyházközség', 'Harasztosi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'harasztosi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Harasztosi Református Egyházközség');

-- Kercsedi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Kercsedi Református Egyházközség', 'Kercsedi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'kercsedi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Kercsedi Református Egyházközség');

-- Magyarfrátai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Magyarfrátai Református Egyházközség', 'Magyarfrátai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'magyarfratai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Magyarfrátai Református Egyházközség');

-- Mezőnagycsányi Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Mezőnagycsányi Református Egyházközség', 'Mezőnagycsányi Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'mezonagycsanyi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Mezőnagycsányi Református Egyházközség');

-- Ótordai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Ótordai Református Egyházközség', 'Ótordai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'otordai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Ótordai Református Egyházközség');

-- Tordatúri Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Tordatúri Református Egyházközség', 'Tordatúri Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'tordaturi-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Tordatúri Református Egyházközség');

-- Újtordai Református Egyházközség
INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)
SELECT gen_random_uuid(), 'Újtordai Református Egyházközség', 'Újtordai Református Egyházközség', 'Erdélyi Református Egyházkerület', 'Tordai Református Egyházmegye', d.id, 'Románia', 'ujtordai-reformatus-egyhazkozseg', false, 0, now(), now()
FROM public.dioceses d
WHERE d.name = 'Tordai Református Egyházmegye'
AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = 'Újtordai Református Egyházközség');

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Erdélyi gyülekezetek statisztikája egyházmegye szerint
SELECT d.name AS egyhazmegye, COUNT(c.id) AS gyulekezetek_szama
FROM public.dioceses d
LEFT JOIN public.congregations c ON c.diocese_id = d.id
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület'
GROUP BY d.id, d.name
ORDER BY d.name;

-- 2. Összes erdélyi gyülekezet (várt: ~483 + a meglévők)
SELECT COUNT(*) AS osszes_erdelyi_gyulekezet
FROM public.congregations c
JOIN public.dioceses d ON c.diocese_id = d.id
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület';

-- 3. Példa: Sepsi Református Egyházmegyéhez tartozó gyülekezetek
SELECT c.name
FROM public.congregations c
JOIN public.dioceses d ON c.diocese_id = d.id
WHERE d.name = 'Sepsi Református Egyházmegye'
ORDER BY c.name;
-- Várt: 31 sor (Sepsiszentgyörgy 4 db, Árkosi, Rétyi, Gidófalvi, ...)