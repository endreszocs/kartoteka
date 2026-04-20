-- ═══════════════════════════════════════════════════════════════
-- adrcountry + adrcounty seed (2026-04-21)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Románia (ID-t fix tartunk, hogy kiszámítható legyen)
INSERT INTO public.adrcountry (id, name, sname, name_hu, name_ro)
VALUES (1, 'România', 'RO', 'Románia', 'România')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sname = EXCLUDED.sname,
  name_hu = EXCLUDED.name_hu,
  name_ro = EXCLUDED.name_ro;

SELECT setval('public.adrcountry_id_seq', GREATEST(2, (SELECT MAX(id) + 1 FROM public.adrcountry)), false);

-- 42 román megye (41 megye + Bukarest)
-- Az adrcounty táblán unique (name, countryid) constraint — ON CONFLICT DO NOTHING-gel kezelve.
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code)
VALUES
  ('Alba', 'AB', 1, 'Fehér', 'Alba', 'AB', '01'),
  ('Arad', 'AR', 1, 'Arad', 'Arad', 'AR', '02'),
  ('Argeș', 'AG', 1, 'Arges', 'Argeș', 'AG', '03'),
  ('Bacău', 'BC', 1, 'Bákó', 'Bacău', 'BC', '04'),
  ('Bihor', 'BH', 1, 'Bihar', 'Bihor', 'BH', '05'),
  ('Bistrița-Năsăud', 'BN', 1, 'Beszterce-Naszód', 'Bistrița-Năsăud', 'BN', '06'),
  ('Botoșani', 'BT', 1, 'Botosán', 'Botoșani', 'BT', '07'),
  ('Brașov', 'BV', 1, 'Brassó', 'Brașov', 'BV', '08'),
  ('Brăila', 'BR', 1, 'Brăila', 'Brăila', 'BR', '09'),
  ('Buzău', 'BZ', 1, 'Buzău', 'Buzău', 'BZ', '10'),
  ('Caraș-Severin', 'CS', 1, 'Krassó-Szörény', 'Caraș-Severin', 'CS', '11'),
  ('Călărași', 'CL', 1, 'Călărași', 'Călărași', 'CL', '12'),
  ('Cluj', 'CJ', 1, 'Kolozs', 'Cluj', 'CJ', '13'),
  ('Constanța', 'CT', 1, 'Konstanca', 'Constanța', 'CT', '14'),
  ('Covasna', 'CV', 1, 'Kovászna', 'Covasna', 'CV', '15'),
  ('Dâmbovița', 'DB', 1, 'Dâmbovița', 'Dâmbovița', 'DB', '16'),
  ('Dolj', 'DJ', 1, 'Dolzs', 'Dolj', 'DJ', '17'),
  ('Galați', 'GL', 1, 'Galac', 'Galați', 'GL', '18'),
  ('Giurgiu', 'GR', 1, 'Gyurgyevó', 'Giurgiu', 'GR', '19'),
  ('Gorj', 'GJ', 1, 'Gorzs', 'Gorj', 'GJ', '20'),
  ('Harghita', 'HR', 1, 'Hargita', 'Harghita', 'HR', '21'),
  ('Hunedoara', 'HD', 1, 'Hunyad', 'Hunedoara', 'HD', '22'),
  ('Ialomița', 'IL', 1, 'Ialomița', 'Ialomița', 'IL', '23'),
  ('Iași', 'IS', 1, 'Jász', 'Iași', 'IS', '24'),
  ('Ilfov', 'IF', 1, 'Ilfov', 'Ilfov', 'IF', '25'),
  ('Maramureș', 'MM', 1, 'Máramaros', 'Maramureș', 'MM', '26'),
  ('Mehedinți', 'MH', 1, 'Mehedinc', 'Mehedinți', 'MH', '27'),
  ('Mureș', 'MS', 1, 'Maros', 'Mureș', 'MS', '28'),
  ('Neamț', 'NT', 1, 'Német', 'Neamț', 'NT', '29'),
  ('Olt', 'OT', 1, 'Olt', 'Olt', 'OT', '30'),
  ('Prahova', 'PH', 1, 'Prahova', 'Prahova', 'PH', '31'),
  ('Satu Mare', 'SM', 1, 'Szatmár', 'Satu Mare', 'SM', '32'),
  ('Sălaj', 'SJ', 1, 'Szilágy', 'Sălaj', 'SJ', '33'),
  ('Sibiu', 'SB', 1, 'Szeben', 'Sibiu', 'SB', '34'),
  ('Suceava', 'SV', 1, 'Szucsáva', 'Suceava', 'SV', '35'),
  ('Teleorman', 'TR', 1, 'Teleorman', 'Teleorman', 'TR', '36'),
  ('Timiș', 'TM', 1, 'Temes', 'Timiș', 'TM', '37'),
  ('Tulcea', 'TL', 1, 'Tulcsa', 'Tulcea', 'TL', '38'),
  ('Vaslui', 'VS', 1, 'Vaszló', 'Vaslui', 'VS', '39'),
  ('Vâlcea', 'VL', 1, 'Vâlcea', 'Vâlcea', 'VL', '40'),
  ('Vrancea', 'VN', 1, 'Vrancsa', 'Vrancea', 'VN', '41'),
  ('București', 'B', 1, 'Bukarest', 'București', 'B', '42')
ON CONFLICT (name, countryid) DO NOTHING;

-- Ha már létező megyék vannak (név alapján), frissítjük a meta adatokat
UPDATE public.adrcounty SET name_hu = 'Fehér', name_ro = 'Alba', auto_code = 'AB', siruta_code = '01' WHERE countryid = 1 AND (name = 'Alba' OR name = 'Fehér' OR sname = 'AB') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Arad', name_ro = 'Arad', auto_code = 'AR', siruta_code = '02' WHERE countryid = 1 AND (name = 'Arad' OR name = 'Arad' OR sname = 'AR') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Arges', name_ro = 'Argeș', auto_code = 'AG', siruta_code = '03' WHERE countryid = 1 AND (name = 'Argeș' OR name = 'Arges' OR sname = 'AG') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Bákó', name_ro = 'Bacău', auto_code = 'BC', siruta_code = '04' WHERE countryid = 1 AND (name = 'Bacău' OR name = 'Bákó' OR sname = 'BC') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Bihar', name_ro = 'Bihor', auto_code = 'BH', siruta_code = '05' WHERE countryid = 1 AND (name = 'Bihor' OR name = 'Bihar' OR sname = 'BH') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Beszterce-Naszód', name_ro = 'Bistrița-Năsăud', auto_code = 'BN', siruta_code = '06' WHERE countryid = 1 AND (name = 'Bistrița-Năsăud' OR name = 'Beszterce-Naszód' OR sname = 'BN') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Botosán', name_ro = 'Botoșani', auto_code = 'BT', siruta_code = '07' WHERE countryid = 1 AND (name = 'Botoșani' OR name = 'Botosán' OR sname = 'BT') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Brassó', name_ro = 'Brașov', auto_code = 'BV', siruta_code = '08' WHERE countryid = 1 AND (name = 'Brașov' OR name = 'Brassó' OR sname = 'BV') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Brăila', name_ro = 'Brăila', auto_code = 'BR', siruta_code = '09' WHERE countryid = 1 AND (name = 'Brăila' OR name = 'Brăila' OR sname = 'BR') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Buzău', name_ro = 'Buzău', auto_code = 'BZ', siruta_code = '10' WHERE countryid = 1 AND (name = 'Buzău' OR name = 'Buzău' OR sname = 'BZ') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Krassó-Szörény', name_ro = 'Caraș-Severin', auto_code = 'CS', siruta_code = '11' WHERE countryid = 1 AND (name = 'Caraș-Severin' OR name = 'Krassó-Szörény' OR sname = 'CS') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Călărași', name_ro = 'Călărași', auto_code = 'CL', siruta_code = '12' WHERE countryid = 1 AND (name = 'Călărași' OR name = 'Călărași' OR sname = 'CL') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Kolozs', name_ro = 'Cluj', auto_code = 'CJ', siruta_code = '13' WHERE countryid = 1 AND (name = 'Cluj' OR name = 'Kolozs' OR sname = 'CJ') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Konstanca', name_ro = 'Constanța', auto_code = 'CT', siruta_code = '14' WHERE countryid = 1 AND (name = 'Constanța' OR name = 'Konstanca' OR sname = 'CT') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Kovászna', name_ro = 'Covasna', auto_code = 'CV', siruta_code = '15' WHERE countryid = 1 AND (name = 'Covasna' OR name = 'Kovászna' OR sname = 'CV') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Dâmbovița', name_ro = 'Dâmbovița', auto_code = 'DB', siruta_code = '16' WHERE countryid = 1 AND (name = 'Dâmbovița' OR name = 'Dâmbovița' OR sname = 'DB') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Dolzs', name_ro = 'Dolj', auto_code = 'DJ', siruta_code = '17' WHERE countryid = 1 AND (name = 'Dolj' OR name = 'Dolzs' OR sname = 'DJ') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Galac', name_ro = 'Galați', auto_code = 'GL', siruta_code = '18' WHERE countryid = 1 AND (name = 'Galați' OR name = 'Galac' OR sname = 'GL') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Gyurgyevó', name_ro = 'Giurgiu', auto_code = 'GR', siruta_code = '19' WHERE countryid = 1 AND (name = 'Giurgiu' OR name = 'Gyurgyevó' OR sname = 'GR') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Gorzs', name_ro = 'Gorj', auto_code = 'GJ', siruta_code = '20' WHERE countryid = 1 AND (name = 'Gorj' OR name = 'Gorzs' OR sname = 'GJ') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Hargita', name_ro = 'Harghita', auto_code = 'HR', siruta_code = '21' WHERE countryid = 1 AND (name = 'Harghita' OR name = 'Hargita' OR sname = 'HR') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Hunyad', name_ro = 'Hunedoara', auto_code = 'HD', siruta_code = '22' WHERE countryid = 1 AND (name = 'Hunedoara' OR name = 'Hunyad' OR sname = 'HD') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Ialomița', name_ro = 'Ialomița', auto_code = 'IL', siruta_code = '23' WHERE countryid = 1 AND (name = 'Ialomița' OR name = 'Ialomița' OR sname = 'IL') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Jász', name_ro = 'Iași', auto_code = 'IS', siruta_code = '24' WHERE countryid = 1 AND (name = 'Iași' OR name = 'Jász' OR sname = 'IS') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Ilfov', name_ro = 'Ilfov', auto_code = 'IF', siruta_code = '25' WHERE countryid = 1 AND (name = 'Ilfov' OR name = 'Ilfov' OR sname = 'IF') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Máramaros', name_ro = 'Maramureș', auto_code = 'MM', siruta_code = '26' WHERE countryid = 1 AND (name = 'Maramureș' OR name = 'Máramaros' OR sname = 'MM') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Mehedinc', name_ro = 'Mehedinți', auto_code = 'MH', siruta_code = '27' WHERE countryid = 1 AND (name = 'Mehedinți' OR name = 'Mehedinc' OR sname = 'MH') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Maros', name_ro = 'Mureș', auto_code = 'MS', siruta_code = '28' WHERE countryid = 1 AND (name = 'Mureș' OR name = 'Maros' OR sname = 'MS') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Német', name_ro = 'Neamț', auto_code = 'NT', siruta_code = '29' WHERE countryid = 1 AND (name = 'Neamț' OR name = 'Német' OR sname = 'NT') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Olt', name_ro = 'Olt', auto_code = 'OT', siruta_code = '30' WHERE countryid = 1 AND (name = 'Olt' OR name = 'Olt' OR sname = 'OT') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Prahova', name_ro = 'Prahova', auto_code = 'PH', siruta_code = '31' WHERE countryid = 1 AND (name = 'Prahova' OR name = 'Prahova' OR sname = 'PH') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Szatmár', name_ro = 'Satu Mare', auto_code = 'SM', siruta_code = '32' WHERE countryid = 1 AND (name = 'Satu Mare' OR name = 'Szatmár' OR sname = 'SM') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Szilágy', name_ro = 'Sălaj', auto_code = 'SJ', siruta_code = '33' WHERE countryid = 1 AND (name = 'Sălaj' OR name = 'Szilágy' OR sname = 'SJ') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Szeben', name_ro = 'Sibiu', auto_code = 'SB', siruta_code = '34' WHERE countryid = 1 AND (name = 'Sibiu' OR name = 'Szeben' OR sname = 'SB') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Szucsáva', name_ro = 'Suceava', auto_code = 'SV', siruta_code = '35' WHERE countryid = 1 AND (name = 'Suceava' OR name = 'Szucsáva' OR sname = 'SV') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Teleorman', name_ro = 'Teleorman', auto_code = 'TR', siruta_code = '36' WHERE countryid = 1 AND (name = 'Teleorman' OR name = 'Teleorman' OR sname = 'TR') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Temes', name_ro = 'Timiș', auto_code = 'TM', siruta_code = '37' WHERE countryid = 1 AND (name = 'Timiș' OR name = 'Temes' OR sname = 'TM') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Tulcsa', name_ro = 'Tulcea', auto_code = 'TL', siruta_code = '38' WHERE countryid = 1 AND (name = 'Tulcea' OR name = 'Tulcsa' OR sname = 'TL') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Vaszló', name_ro = 'Vaslui', auto_code = 'VS', siruta_code = '39' WHERE countryid = 1 AND (name = 'Vaslui' OR name = 'Vaszló' OR sname = 'VS') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Vâlcea', name_ro = 'Vâlcea', auto_code = 'VL', siruta_code = '40' WHERE countryid = 1 AND (name = 'Vâlcea' OR name = 'Vâlcea' OR sname = 'VL') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Vrancsa', name_ro = 'Vrancea', auto_code = 'VN', siruta_code = '41' WHERE countryid = 1 AND (name = 'Vrancea' OR name = 'Vrancsa' OR sname = 'VN') AND siruta_code IS NULL;
UPDATE public.adrcounty SET name_hu = 'Bukarest', name_ro = 'București', auto_code = 'B', siruta_code = '42' WHERE countryid = 1 AND (name = 'București' OR name = 'Bukarest' OR sname = 'B') AND siruta_code IS NULL;

-- Fallback: ha egy megye hiányzott (pl. Alba) — explicit INSERT (name, countryid) alapján
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Alba', 'AB', 1, 'Fehér', 'Alba', 'AB', '01' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Alba' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Arad', 'AR', 1, 'Arad', 'Arad', 'AR', '02' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Arad' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Argeș', 'AG', 1, 'Arges', 'Argeș', 'AG', '03' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Argeș' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Bacău', 'BC', 1, 'Bákó', 'Bacău', 'BC', '04' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Bacău' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Bihor', 'BH', 1, 'Bihar', 'Bihor', 'BH', '05' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Bihor' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Bistrița-Năsăud', 'BN', 1, 'Beszterce-Naszód', 'Bistrița-Năsăud', 'BN', '06' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Bistrița-Năsăud' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Botoșani', 'BT', 1, 'Botosán', 'Botoșani', 'BT', '07' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Botoșani' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Brașov', 'BV', 1, 'Brassó', 'Brașov', 'BV', '08' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Brașov' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Brăila', 'BR', 1, 'Brăila', 'Brăila', 'BR', '09' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Brăila' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Buzău', 'BZ', 1, 'Buzău', 'Buzău', 'BZ', '10' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Buzău' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Caraș-Severin', 'CS', 1, 'Krassó-Szörény', 'Caraș-Severin', 'CS', '11' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Caraș-Severin' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Călărași', 'CL', 1, 'Călărași', 'Călărași', 'CL', '12' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Călărași' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Cluj', 'CJ', 1, 'Kolozs', 'Cluj', 'CJ', '13' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Cluj' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Constanța', 'CT', 1, 'Konstanca', 'Constanța', 'CT', '14' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Constanța' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Covasna', 'CV', 1, 'Kovászna', 'Covasna', 'CV', '15' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Covasna' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Dâmbovița', 'DB', 1, 'Dâmbovița', 'Dâmbovița', 'DB', '16' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Dâmbovița' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Dolj', 'DJ', 1, 'Dolzs', 'Dolj', 'DJ', '17' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Dolj' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Galați', 'GL', 1, 'Galac', 'Galați', 'GL', '18' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Galați' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Giurgiu', 'GR', 1, 'Gyurgyevó', 'Giurgiu', 'GR', '19' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Giurgiu' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Gorj', 'GJ', 1, 'Gorzs', 'Gorj', 'GJ', '20' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Gorj' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Harghita', 'HR', 1, 'Hargita', 'Harghita', 'HR', '21' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Harghita' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Hunedoara', 'HD', 1, 'Hunyad', 'Hunedoara', 'HD', '22' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Hunedoara' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Ialomița', 'IL', 1, 'Ialomița', 'Ialomița', 'IL', '23' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Ialomița' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Iași', 'IS', 1, 'Jász', 'Iași', 'IS', '24' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Iași' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Ilfov', 'IF', 1, 'Ilfov', 'Ilfov', 'IF', '25' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Ilfov' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Maramureș', 'MM', 1, 'Máramaros', 'Maramureș', 'MM', '26' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Maramureș' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Mehedinți', 'MH', 1, 'Mehedinc', 'Mehedinți', 'MH', '27' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Mehedinți' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Mureș', 'MS', 1, 'Maros', 'Mureș', 'MS', '28' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Mureș' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Neamț', 'NT', 1, 'Német', 'Neamț', 'NT', '29' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Neamț' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Olt', 'OT', 1, 'Olt', 'Olt', 'OT', '30' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Olt' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Prahova', 'PH', 1, 'Prahova', 'Prahova', 'PH', '31' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Prahova' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Satu Mare', 'SM', 1, 'Szatmár', 'Satu Mare', 'SM', '32' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Satu Mare' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Sălaj', 'SJ', 1, 'Szilágy', 'Sălaj', 'SJ', '33' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Sălaj' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Sibiu', 'SB', 1, 'Szeben', 'Sibiu', 'SB', '34' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Sibiu' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Suceava', 'SV', 1, 'Szucsáva', 'Suceava', 'SV', '35' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Suceava' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Teleorman', 'TR', 1, 'Teleorman', 'Teleorman', 'TR', '36' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Teleorman' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Timiș', 'TM', 1, 'Temes', 'Timiș', 'TM', '37' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Timiș' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Tulcea', 'TL', 1, 'Tulcsa', 'Tulcea', 'TL', '38' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Tulcea' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Vaslui', 'VS', 1, 'Vaszló', 'Vaslui', 'VS', '39' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Vaslui' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Vâlcea', 'VL', 1, 'Vâlcea', 'Vâlcea', 'VL', '40' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Vâlcea' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'Vrancea', 'VN', 1, 'Vrancsa', 'Vrancea', 'VN', '41' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'Vrancea' AND countryid = 1);
INSERT INTO public.adrcounty (name, sname, countryid, name_hu, name_ro, auto_code, siruta_code) SELECT 'București', 'B', 1, 'Bukarest', 'București', 'B', '42' WHERE NOT EXISTS (SELECT 1 FROM public.adrcounty WHERE name = 'București' AND countryid = 1);

COMMIT;

-- Ellenőrzés: 42 megyének kell lennie
SELECT COUNT(*) AS megye_count FROM public.adrcounty;
SELECT name_ro, name_hu, auto_code, siruta_code FROM public.adrcounty WHERE siruta_code IS NOT NULL ORDER BY siruta_code;