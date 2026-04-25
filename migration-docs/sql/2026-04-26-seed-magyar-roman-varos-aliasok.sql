-- KARTOTEKA SEED — Magyar→román város-aliasok az adrlocality_alias-ba
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — opcionális, de erősen ajánlott
--
-- Cél:
-- A `adrlocality.name_hu` mező nagyon hiányos a román DB-ben — csak az erdélyi
-- nagyobb városoknak van magyar neve. A `find_locality_match()` fuzzy-küszöbe (0.6)
-- nem elég ahhoz, hogy pl. "Bukarest" → "Bucureşti" egyezzen.
--
-- Ez a seed beölti a leggyakrabban előforduló magyar→román várost az
-- `adrlocality_alias` táblába (lang='hu' jelöléssel). Az alias-tábla már létezik
-- a sémában, és a `find_locality_match()` használja az "alias" confidence-szel
-- (similarity=0.95).
--
-- LISTA (összes 50+ erdélyi/regáti város, magyar neveik):
--   Erdélyi: Kolozsvár, Marosvásárhely, Brassó, Nagyvárad, Temesvár, Arad,
--            Szatmárnémeti, Nagybánya, Csíkszereda, Sepsiszentgyörgy, stb.
--   Regáti: Bukarest, Konstanca, Iaşi, Galaţi, Craiova, Ploieşti, stb.
--
-- Idempotens: ON CONFLICT DO NOTHING — ha az alias már létezik, kihagyjuk.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ha egy lookup-pal találunk egy locality-t (pl. "Bucureşti"),
-- beszúrunk hozzá egy alias-rekordot magyar névvel
-- ────────────────────────────────────────────────────────────────────────────

-- Egyediség biztosítás (ha még nincs)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_adrlocality_alias_name_locality_lang
    ON public.adrlocality_alias (adrlocality_id, alias_name, lang);

-- ────────────────────────────────────────────────────────────────────────────
-- Insert helper (anonymous block-ban, hogy hibatűrő legyen)
-- ────────────────────────────────────────────────────────────────────────────

DO $seed$
DECLARE
    v_pairs jsonb := '[
        {"hu": "Bukarest", "ro": "Bucureşti"},
        {"hu": "Kolozsvár", "ro": "Cluj-Napoca"},
        {"hu": "Marosvásárhely", "ro": "Târgu Mureş"},
        {"hu": "Brassó", "ro": "Braşov"},
        {"hu": "Nagyvárad", "ro": "Oradea"},
        {"hu": "Temesvár", "ro": "Timişoara"},
        {"hu": "Arad", "ro": "Arad"},
        {"hu": "Szatmárnémeti", "ro": "Satu Mare"},
        {"hu": "Nagybánya", "ro": "Baia Mare"},
        {"hu": "Csíkszereda", "ro": "Miercurea Ciuc"},
        {"hu": "Sepsiszentgyörgy", "ro": "Sfântu Gheorghe"},
        {"hu": "Székelyudvarhely", "ro": "Odorheiu Secuiesc"},
        {"hu": "Gyergyószentmiklós", "ro": "Gheorgheni"},
        {"hu": "Kézdivásárhely", "ro": "Târgu Secuiesc"},
        {"hu": "Barót", "ro": "Baraolt"},
        {"hu": "Beszterce", "ro": "Bistriţa"},
        {"hu": "Dés", "ro": "Dej"},
        {"hu": "Torda", "ro": "Turda"},
        {"hu": "Zilah", "ro": "Zalău"},
        {"hu": "Nagykároly", "ro": "Carei"},
        {"hu": "Máramarossziget", "ro": "Sighetu Marmaţiei"},
        {"hu": "Nagyenyed", "ro": "Aiud"},
        {"hu": "Gyulafehérvár", "ro": "Alba Iulia"},
        {"hu": "Déva", "ro": "Deva"},
        {"hu": "Hunyad", "ro": "Hunedoara"},
        {"hu": "Vajdahunyad", "ro": "Hunedoara"},
        {"hu": "Petrozsény", "ro": "Petroşani"},
        {"hu": "Lugos", "ro": "Lugoj"},
        {"hu": "Resicabánya", "ro": "Reşiţa"},
        {"hu": "Karánsebes", "ro": "Caransebeş"},
        {"hu": "Medgyes", "ro": "Mediaş"},
        {"hu": "Nagyszeben", "ro": "Sibiu"},
        {"hu": "Segesvár", "ro": "Sighişoara"},
        {"hu": "Vásárhely", "ro": "Târgu Mureş"},
        {"hu": "Konstanca", "ro": "Constanţa"},
        {"hu": "Ploieşt", "ro": "Ploieşti"},
        {"hu": "Galac", "ro": "Galaţi"},
        {"hu": "Brăila", "ro": "Brăila"},
        {"hu": "Iaşi", "ro": "Iaşi"},
        {"hu": "Krajova", "ro": "Craiova"},
        {"hu": "Bákó", "ro": "Bacău"},
        {"hu": "Suceava", "ro": "Suceava"},
        {"hu": "Csernakeresztúr", "ro": "Cristur"},
        {"hu": "Borszék", "ro": "Borsec"},
        {"hu": "Tusnádfürdő", "ro": "Băile Tuşnad"},
        {"hu": "Élesd", "ro": "Aleşd"},
        {"hu": "Margitta", "ro": "Marghita"},
        {"hu": "Bélfenyér", "ro": "Belfir"},
        {"hu": "Köröskisjenő", "ro": "Chişineu-Criş"},
        {"hu": "Vajdahunyad", "ro": "Hunedoara"},
        {"hu": "Mediaş", "ro": "Mediaş"}
    ]'::jsonb;
    v_pair jsonb;
    v_locality_id integer;
    v_inserted_count int := 0;
    v_skipped_count int := 0;
    v_not_found_count int := 0;
BEGIN
    FOR v_pair IN SELECT * FROM jsonb_array_elements(v_pairs)
    LOOP
        -- Megpróbáljuk a román név alapján megtalálni a locality-t
        -- (case-insensitive, unaccent-tolerant)
        SELECT l.id INTO v_locality_id
        FROM public.adrlocality l
        WHERE public.normalize_name(l.name) = public.normalize_name(v_pair->>'ro')
           OR public.normalize_name(l.name_ro) = public.normalize_name(v_pair->>'ro')
        ORDER BY l.usagecnt DESC NULLS LAST, l.id
        LIMIT 1;

        IF v_locality_id IS NOT NULL THEN
            -- Beszúrás (ON CONFLICT DO NOTHING)
            BEGIN
                INSERT INTO public.adrlocality_alias (
                    adrlocality_id, alias_name, lang, source
                ) VALUES (
                    v_locality_id,
                    v_pair->>'hu',
                    'hu',
                    'seed-2026-04-26-magyar-varos-alias'
                );
                v_inserted_count := v_inserted_count + 1;
            EXCEPTION WHEN unique_violation THEN
                v_skipped_count := v_skipped_count + 1;
            END;
        ELSE
            v_not_found_count := v_not_found_count + 1;
            RAISE NOTICE 'NEM TALÁLT: % (%)', v_pair->>'hu', v_pair->>'ro';
        END IF;
    END LOOP;

    RAISE NOTICE '──────────────────────────────────────────────';
    RAISE NOTICE 'Seed eredmény:';
    RAISE NOTICE '  Beszúrva: %', v_inserted_count;
    RAISE NOTICE '  Kihagyva (már létezik): %', v_skipped_count;
    RAISE NOTICE '  Nem talált locality: %', v_not_found_count;
END;
$seed$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Beszúrt aliasok listája (forrás szerint)
SELECT
    a.alias_name AS hu_nev,
    l.name AS ro_nev_hivatalos,
    c.name AS megye,
    a.source
FROM public.adrlocality_alias a
JOIN public.adrlocality l ON l.id = a.adrlocality_id
JOIN public.adrcounty c ON c.id = l.countyid
WHERE a.source = 'seed-2026-04-26-magyar-varos-alias'
ORDER BY a.alias_name;

-- 2. Most TESZTELJÜK: "Bukarest" megtalálható-e?
SELECT * FROM public.find_locality_match('Bukarest', 'RO', 0.6);
-- Várt: 1 sor, match_type='alias', a Bucureşti sora

-- 3. "Kolozsvár" teszt
SELECT * FROM public.find_locality_match('Kolozsvár', 'RO', 0.6);

-- 4. "Csíkszereda" teszt
SELECT * FROM public.find_locality_match('Csíkszereda', 'RO', 0.6);
