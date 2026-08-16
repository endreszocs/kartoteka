-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S3 — A FOGADÓ FELÜLET ADATBÁZIS-ALAPJA         2026-08-16 ║
-- ║ Fájl: migration-docs/sql/2026-08-16-egyhazkeruleti-S3-fogado.sql         ║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S3 szelet)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ ELŐFELTÉTEL — ELŐBB EZEK FUSSANAK LE, EBBEN A SORRENDBEN:
--      1. 2026-08-15-egyhazmegyei-uj-tablak.sql               (a tábla maga)
--      2. 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql (modification_number
--                                                              + NÉGYoszlopos index)
--      3. 2026-08-15-egyhazmegyei-osszesito-feloldas.sql      (unlock_* oszlopok)
--      4. 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql  (a kerületi OLVASÓ
--                                                              hatókör-függvény)
--    Az 1/0 őrszem FAIL-CLOSED megáll, ha bármelyik hiányzik — az ÉLŐ állapotot
--    méri, nem a repót („a migration-fájl NEM bizonyíték").
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT VAN EZ A FÁJL — A HELYZET EGY MONDATBAN
-- ════════════════════════════════════════════════════════════════════════════
-- A megye MA FELKÜLDI a hivatalos iratait (`rogzitDioceseFelterjesztes`), és A
-- KERÜLET NEM LÁTJA. A `diocese_felterjesztes` táblának NULLA kerületi
-- fogyasztója van. Az S3 szelet ezt az utat nyitja meg — de MIELŐTT a felület
-- megépülne, HÁROM adatbázis-hibát kell orvosolni. Mind a három NÉMA: nem
-- hibaüzenettel jelentkezik, hanem hamis vagy hiányzó adattal.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT CSINÁL — HÁROM DOLOG
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⛔ (1) 9. CSAPDA — A KERÜLET FELÜLÍRHATJA A MEGYE FAGYASZTOTT IRATÁT.
--     TÜNET MA: a `diocese_felterjesztes_kerulet_update` policy USING-ja és
--     WITH CHECK-je KIZÁRÓLAG a `district_id`-t nézi. OSZLOP-KORLÁT NINCS.
--     Vagyis egy kerületi admin egyetlen PATCH-csel átírhatja a
--     `snapshot_data`-t — a megye BEKÜLDÖTT, FAGYASZTOTT iratának a tartalmát —,
--     sőt az `iktatoszam`-ot, a `submitted_at`-et és a `submitted_by`-t is.
--     Ez nem „jogosultsági finomság": ez OKIRAT-INTEGRITÁS. A felterjesztés
--     azért ér valamit, mert bizonyítja, MIT és MIKOR küldött fel a megye. Ha a
--     fogadó fél utólag átírhatja, a bizonyíték értéke nulla — és a megye
--     SEMMIT nem venne észre, mert a saját felületén ugyanazt az egy sort látja.
--
--     MEGOLDÁS: `BEFORE UPDATE` trigger (soronként), ami a KERÜLETI hívónak
--     KIZÁRÓLAG az ügyviteli oszlopok változtatását engedi:
--        status, received_at, received_by, returned_reason, notes,
--        unlock_requested, unlock_reason, unlock_requested_at,
--        unlock_requested_by, updated_at
--     MINDEN MÁS oszlop változása 42501 (insufficient_privilege) hibával áll le.
--
--     ⚠️ A TILTÁS NEM ÁLTALÁNOS. A MEGYEI útnak (`rogzitDioceseFelterjesztes`
--        upsert-je) TOVÁBBRA IS írnia kell a `snapshot_data`-t — különben a
--        felküldés maga törne el. A trigger tehát MEGKÜLÖNBÖZTETI A HÍVÓT:
--          · nincs bejelentkezett identitás (auth.uid() IS NULL) → átengedi
--            (service_role, mentés-visszaállítás, kézzel futtatott karbantartás;
--            ezek az RLS-t is megkerülik, egy trigger-tiltás itt CSAK a
--            visszaállítást törné el);
--          · rendszergazda (current_user_has_global_access()) → átengedi;
--          · a SOR SAJÁT MEGYÉJE (OLD.diocese_id ∈ current_user_diocese_ids())
--            → átengedi, teljes írással;
--          · minden más hívó → CSAK a kerületi útvonalon juthatott ide (más
--            policy nem adna neki UPDATE-et) → OSZLOP-KORLÁT.
--
--     ⚠️ AZ ELLENŐRZÉS FAIL-CLOSED, NEM FELSOROLÁSOS. A trigger nem a TILTOTT
--        oszlopokat sorolja fel, hanem az ENGEDETTEKET, és a `to_jsonb(OLD)` ⇄
--        `to_jsonb(NEW)` teljes összevetésével keresi a különbséget. Ebből
--        következik, hogy egy KÉSŐBB HOZZÁADOTT oszlop AUTOMATIKUSAN védett
--        lesz. Ha felsorolós lenne, minden új oszlop némán kimaradna a védelemből.
--
--     ⚠️ TRIGGER-SORREND — a táblán MÁR ÁLL egy BEFORE UPDATE trigger
--        (`diocese_felterjesztes_updated_at_trigger`, uj-tablak.sql 1/C), ami
--        `NEW.updated_at = now()`-t állít. A Postgres a BEFORE triggereket NÉV
--        SZERINTI ÁBÉCÉ-SORRENDBEN futtatja, tehát:
--            diocese_felterjesztes_kerulet_oszlopvedelem_trigger   ('k')
--            diocese_felterjesztes_updated_at_trigger              ('u')
--        → az ÚJ őrszem fut ELŐBB. DE A SORREND SZÁNDÉKOSAN NEM SZÁMÍT: az
--        `updated_at` RAJTA VAN az engedett listán, tehát akár előbb, akár utóbb
--        írja be a másik trigger a now()-t, az őrszem nem akad fenn rajta. Ha az
--        `updated_at` NEM lenne az engedett listán, a fordított sorrend MINDEN
--        kerületi átvételt megbuktatna — ezért van rajta.
--        (A `updated_at` nem bizonyító erejű mező: a másik trigger úgyis
--        felülírja now()-val, tehát a kerület nem tud vele hamisítani.)
--
-- ⛔ (2) 10. CSAPDA — A `district_id` NINCS A VALÓDI MEGYE→KERÜLET LÁNCHOZ KÖTVE.
--     TÜNET MA: két KÜLÖN, egyoszlopos FK áll a táblán (diocese_id → dioceses,
--     district_id → districts). Mindkettő teljesül akkor is, ha a kettő NEM
--     TARTOZIK EGYMÁSHOZ. Vagyis egy esperes — akár elgépelésből, akár
--     szándékosan — TETSZŐLEGES egyházkerülethez terjesztheti fel az iratát, és
--     az irat a MÁSIK kerület fogadó felületén jelenne meg. A saját kerülete
--     pedig hiába várja: az irat sehol.
--
--     MEGOLDÁS: KOMPOZIT FK —
--        FOREIGN KEY (diocese_id, district_id) REFERENCES dioceses(id, district_id)
--     ELŐFELTÉTELE egy UNIQUE a `dioceses`-en az (id, district_id) páron (a
--     kompozit FK csak UNIQUE/PK célra mutathat). Az S0 mérése szerint ez MA
--     NINCS MEG — ezért ez a fájl mindkettőt megcsinálja, EGY tranzakcióban.
--
--     ⚠️ A `dioceses.district_id` NULLABLE. Ez KÉT dolgot jelent:
--        (a) Egy NULL district_id-jű megye a kompozit FK bevezetése UTÁN SOHA
--            többé nem tudna felterjeszteni: a szülő-kulcs (id, NULL) sosem
--            egyezik a gyerek (id, valami) párral → FK-sértés. Vagyis a megye
--            NÉMÁN kizáródna a felküldésből.
--        (b) A „MATCH SIMPLE vakuum" HAMIS BIZTONSÁGÉRZET: ha valaha valaki
--            lazítaná a `diocese_felterjesztes.district_id` NOT NULL-ját, az
--            ottani NULL-os sorokon a kompozit FK VAKUUMOSAN teljesülne (MATCH
--            SIMPLE mellett egyetlen NULL kikapcsolja az egész ellenőrzést) —
--            az FK „ott lenne", de nem védene.
--        Ezért az 1/0 őrszem MEGSZÁMOLJA a NULL district_id-jű megyéket, és
--        FAIL-CLOSED MEGÁLL, ha akár egy is van (az S0 szerint mind a 25-nek van).
--        Ugyanígy megáll, ha a `diocese_felterjesztes.district_id` NOT NULL-ja
--        eltűnt, és ha van HAMIS district_id-jű felterjesztés (S0: 0 db).
--
--     ⚠️⚠️ PGRST201-CSAPDA — OLVASD EL, MIELŐTT AZ S4/S5 FELÜLETET ÍROD.
--        A kompozit FK-val MÁSODIK idegen kulcs mutat a diocese_felterjesztes-ről
--        a dioceses-re (az egyoszlopos diocese_id-FK mellé). A PostgREST innentől
--        NEM TUD DÖNTENI, melyiken menjen a beágyazás: MINDEN
--            .select('…, dioceses(name)')
--        hívás PGRST201-gyel áll le („more than one relationship was found
--        between 'diocese_felterjesztes' and 'dioceses'"). MA nem tör el semmit,
--        mert a fogadó akció SZÁNDÉKOSAN külön kérdezi le a megyék nevét — de ez
--        NÉMA CSAPDA a következő szeletnek: az S4/S5 fejlesztője ártatlan
--        beágyazást ír, és futásidőben kap 300-as hibát.
--        EGYÉRTELMŰSÍTÉS — a kettő közül az egyik:
--          (a) nevesítsd a kapcsolatot:
--              dioceses!diocese_felterjesztes_diocese_id_fkey(name)
--          (b) vagy kérdezd le a dioceses-t KÜLÖN, és párosítsd kódban
--              (a fogadó akció ma ezt teszi).
--        A 2/B-205 ellenőrző sor MEGSZÁMOLJA a FK-kat: VÁRT 2 db, és ez
--        SZÁNDÉKOS — a második FK nem hiba, hanem a 10. csapda javítása.
--
--     ⚠️ ON UPDATE / ON DELETE SZÁNDÉKOSAN ALAPÉRTELMEZETT (NO ACTION).
--        Ha egy megyét átsorolnak egy MÁSIK egyházkerületbe, a `dioceses`
--        UPDATE-je HANGOSAN elbukik, amíg a megyének felterjesztései vannak.
--        Ez SZÁNDÉKOS: az `ON UPDATE CASCADE` átírná a MÚLTAT — egy már ÁTVETT
--        irat némán átcsúszna a másik kerülethez, mintha mindig is oda érkezett
--        volna. Egy kerület-átsorolás Romániában lényegében sosem történik meg;
--        ha mégis, az akkora esemény, hogy megérdemel egy tudatos, kézi rendezést.
--
-- ⚠️ (3) A KERÜLETI SZÁMVEVŐ NEM LÁTJA A FELTERJESZTÉSEKET.
--     TÜNET MA: a `diocese_felterjesztes_kerulet_select` policy a
--     `current_user_district_ids()`-t hívja, ami KIZÁRÓLAG `egyhazkeruleti_admin`
--     szerepkör-sorokat gyűjt. A kerületi SZÁMVEVŐ (`egyhazkeruleti_szamvevo`)
--     viszont ELLENŐR: pont az ő dolga megnézni a beküldött iratokat. Ma ÜRES
--     listát lát — nem hibát, hanem ürességet, ami „nincs beküldve"-nek látszik.
--
--     MEGOLDÁS: ÚJ, KÜLÖN policy — `diocese_felterjesztes_kerulet_szamvevo_select`
--     [SELECT] —, ami a `current_user_district_olvaso_ids()`-t hívja (az S1
--     hozta létre, és MÁR GRANT-olt). A megyei párja a minta:
--     `diocese_felterjesztes_szamvevo_select`.
--     ⛔ AZ UPDATE POLICY VÁLTOZATLAN MARAD. A számvevő OLVAS, de NEM ÍR —
--        az átvétel-nyugtázás és a visszaküldés a kerületi ADMIN felelőssége.
--        (A PERMISSIVE policy-k VAGY-kapcsolatban állnak: az új SELECT policy
--        BŐVÍTI az olvasók körét, a meglévőt nem érinti.)
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI NINCS BENNE (szándékosan)
-- ════════════════════════════════════════════════════════════════════════════
--   · ÚJ TÁBLA NEM JÖN LÉTRE → a `backup_table_policy` besorolás nem változik.
--     (A `diocese_felterjesztes` MÁR besorolt: uj-tablak.sql 1/F. A kulcsoszlop
--     `tabla`, NEM table_name — lásd #172.) A 0. és a 2. szakasz tájékoztatásul
--     MEGMÉRI a besorolást.
--   · ÁLLAPOTGÉP-KÉNYSZER (pl. „a kerület ne állíthasson `received`-ből
--     `draft`-ba"). A `status` az engedett oszlopok között van, mert az
--     átvétel/visszaküldés/feloldás MIND azt írja. A megengedett ÁTMENETEK
--     kikényszerítése ALKALMAZÁS-szintű döntés (a fogadó felület szerver-akciói),
--     és külön kör: egy elhamarkodott DB-CHECK a feloldás-elbírálást bénítaná meg.
--   · A kerület SAJÁT könyvelése/leltára/iktatása (K2) — az S5 szelet.
--   · A `dioceses`/`districts` törzsadat olvashatósága: VÁLTOZATLAN. Endre K4
--     döntése szerint a kerület a megyék KÖNYVEIBE nem lát bele (azt az S1c
--     zárta le); a megye NEVE viszont kell a „melyik megye küldte" felirathoz,
--     és az továbbra is olvasható.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az UTOLSÓ utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--       Jelöld ki CSAK ezt, futtasd, OLVASD EL.
--   2.  1. SZAKASZ — A VÁLTOZTATÁS. Egyetlen tranzakció (BEGIN … COMMIT),
--       + utána a NOTIFY pgrst sor.
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--   4.  3. SZAKASZ — OPCIONÁLIS KÉZI PRÓBA (végig kikommentezve). Ez BIZONYÍTJA,
--       hogy a trigger tényleg tiltja a hamisítást. Csak akkor futtasd, ha
--       kiveszed a `--` jeleket és beírsz két valódi azonosítót.
--
-- IDEMPOTENS: minden lépés őrzött; akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTELEK ⛔' AS szakasz,
       'Létezik-e a diocese_felterjesztes tábla?' AS mit,
       CASE WHEN to_regclass('public.diocese_felterjesztes') IS NULL
            THEN '⛔ NINCS — az 1. szakasz őrszeme leáll'
            ELSE '✅ létezik (' || (SELECT count(*)::text FROM public.diocese_felterjesztes)
                 || ' sor)' END AS ertek,
       'Ha ⛔: előbb a 2026-08-15-egyhazmegyei-uj-tablak.sql fusson le.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTELEK ⛔',
       'Megvan-e a modification_number oszlop? (költségvetés-módosítás)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                         WHERE c.table_schema='public' AND c.table_name='diocese_felterjesztes'
                           AND c.column_name='modification_number')
            THEN '✅ megvan' ELSE '⛔ NINCS — az 1. szakasz őrszeme leáll' END,
       'Ha ⛔: előbb a 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql fusson le. A fogadó felület a módosítás-számot is kiírja, enélkül a három költségvetés-módosítás egyetlen sorrá olvadna.'

UNION ALL
SELECT 3, '0/A · ELŐFELTÉTELEK ⛔',
       'Megvannak-e a feloldás-oszlopok? (unlock_requested, unlock_reason, unlock_requested_at, unlock_requested_by)',
       (SELECT count(*)::text || ' / 4' FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name='diocese_felterjesztes'
          AND c.column_name IN ('unlock_requested','unlock_reason',
                                'unlock_requested_at','unlock_requested_by')),
       'K5: a fogadó felület TELJES — a feloldás-kérés ELBÍRÁLÁSA is benne van. Ha nem 4/4: előbb a 2026-08-15-egyhazmegyei-osszesito-feloldas.sql fusson le (az 1. szakasz őrszeme leáll).'

UNION ALL
SELECT 4, '0/A · ELŐFELTÉTELEK ⛔',
       'Él-e MÉG a régi, HÁROMoszlopos egyedi index? (7. csapda)',
       CASE WHEN to_regclass('public.diocese_felterjesztes_dio_tipus_ev_uidx') IS NOT NULL
            THEN '⛔ IGEN — a költségvetés-módosítás NÉMÁN felülírja az eredetit'
            WHEN to_regclass('public.diocese_felterjesztes_dio_tipus_ev_mod_uidx') IS NOT NULL
            THEN '✅ nincs — a NÉGYoszlopos van érvényben (helyes)'
            ELSE '⚠️ egyik sincs — a modositas.sql nem futott le' END,
       'Ha ⛔ vagy ⚠️: futtasd (újra) a 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql-t, MIELŐTT a fogadó felület élesedik. Az 1. szakasz őrszeme leáll.'

UNION ALL
SELECT 5, '0/A · ELŐFELTÉTELEK ⛔',
       'Létezik-e a 4 hatókör-függvény, amire ez a fájl épít?',
       (SELECT count(*)::text || ' / 4' FROM (VALUES
          ('public.current_user_has_global_access()'),
          ('public.current_user_diocese_ids()'),
          ('public.current_user_district_ids()'),
          ('public.current_user_district_olvaso_ids()')) AS v(fn)
        WHERE to_regprocedure(v.fn) IS NOT NULL),
       'A trigger az első hármat hívja, az új számvevői policy a negyediket. Ha nem 4/4: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le.'

UNION ALL
SELECT 6, '0/A · ELŐFELTÉTELEK ⛔',
       'MELYIK hatókör-függvény hiányzik?',
       COALESCE((SELECT string_agg(v.fn, ', ' ORDER BY v.fn) FROM (VALUES
          ('public.current_user_has_global_access()'),
          ('public.current_user_diocese_ids()'),
          ('public.current_user_district_ids()'),
          ('public.current_user_district_olvaso_ids()')) AS v(fn)
        WHERE to_regprocedure(v.fn) IS NULL),
        '✅ egy sem — mind a négy megvan'),
       'EZ AZ 1/0 ŐRSZEM PONTOS MUNKALISTÁJA.'

-- ── 0/B · TRIGGEREK — a 9. csapda mai állapota ──────────────────────────────
UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tgname))::int, '0/B · TRIGGEREK ⛔ 9. CSAPDA',
       t.tgname,
       pg_get_triggerdef(t.oid),
       'Tájékoztató: ezek a MEGLÉVŐ triggerek. Az 1. szakasz EGYET tesz melléjük (diocese_felterjesztes_kerulet_oszlopvedelem_trigger) — a meglévő updated_at triggert NEM bántja.'
FROM pg_trigger t
WHERE t.tgrelid = to_regclass('public.diocese_felterjesztes')
  AND NOT t.tgisinternal

UNION ALL
SELECT 18, '0/B · TRIGGEREK ⛔ 9. CSAPDA',
       'Van-e MA BÁRMILYEN oszlop-védelem a fagyasztott iraton?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t2
                         WHERE t2.tgrelid = to_regclass('public.diocese_felterjesztes')
                           AND NOT t2.tgisinternal
                           AND t2.tgname = 'diocese_felterjesztes_kerulet_oszlopvedelem_trigger')
            THEN '✅ van (az S3 már lefutott — újrafuttatás rendben)'
            ELSE '⛔ NINCS — a kerületi admin MA átírhatja a snapshot_data-t, az iktatoszam-ot és a submitted_* mezőket' END,
       'EZ A FÁJL LEGFONTOSABB HOZADÉKA. Okirat-integritás: a felterjesztés azért ér valamit, mert bizonyítja, MIT és MIKOR küldött fel a megye.'

UNION ALL
SELECT 19, '0/B · TRIGGEREK',
       'Létezik-e már az őrszem-FÜGGVÉNY? (a trigger nélkül is létezhet)',
       CASE WHEN to_regprocedure('public.diocese_felterjesztes_kerulet_oszlopvedelem()') IS NULL
            THEN '— még nincs (ez a fájl hozza létre)'
            ELSE '✅ létezik (CREATE OR REPLACE — felülíródik a friss törzzsel)' END,
       'Tájékoztató. Függvény trigger nélkül SEMMIT nem véd — a 2/A 101. sor a valódi bizonyíték.'

-- ── 0/C · POLICY-K — a kerületi olvasás/írás mai képe ───────────────────────
UNION ALL
SELECT (20 + row_number() OVER (ORDER BY pol.policyname))::int, '0/C · POLICY-K',
       pol.policyname || ' [' || pol.cmd || ']',
       'USING: ' || COALESCE(pol.qual, '—') || '   ||   WITH CHECK: ' || COALESCE(pol.with_check, '—'),
       CASE WHEN pol.cmd = 'UPDATE' AND COALESCE(pol.qual,'') LIKE '%district%'
            THEN '⛔ 9. CSAPDA: ez a policy CSAK a district_id-t nézi — OSZLOP-KORLÁT NINCS. A védelmet az 1. szakasz TRIGGERE adja (policy-ban oszlopot korlátozni nem lehet).'
            ELSE 'Tájékoztató.' END
FROM pg_policies pol
WHERE pol.schemaname = 'public' AND pol.tablename = 'diocese_felterjesztes'

UNION ALL
SELECT 27, '0/C · KERÜLETI POLICY-K ⛔',
       'Megvan-e MIND A KETTŐ kerületi policy? (_kerulet_select + _kerulet_update)',
       (SELECT count(*)::text || ' / 2' FROM pg_policies pol2
        WHERE pol2.schemaname='public' AND pol2.tablename='diocese_felterjesztes'
          AND pol2.policyname IN ('diocese_felterjesztes_kerulet_select',
                                  'diocese_felterjesztes_kerulet_update')),
       'Ha nem 2/2: az S1c 2/C-721 sora is ezt méri. Ez a fájl EGYIKET SEM módosítja — csak MELLÉ tesz egy harmadikat (a számvevőnek) és egy triggert.'

UNION ALL
SELECT 28, '0/C · SZÁMVEVŐI POLICY',
       'Létezik-e MÁR a kerületi számvevői SELECT policy?',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pol3
                         WHERE pol3.schemaname='public' AND pol3.tablename='diocese_felterjesztes'
                           AND pol3.policyname = 'diocese_felterjesztes_kerulet_szamvevo_select')
            THEN '✅ létezik (az S3 már lefutott — újrafuttatás rendben)'
            ELSE '— még nincs: a kerületi SZÁMVEVŐ MA ÜRES listát lát (nem hibát!), ami „nincs beküldve"-nek látszik' END,
       'A megyei párja a minta: diocese_felterjesztes_szamvevo_select. Az új policy a current_user_district_olvaso_ids()-t hívja (admin + szamvevo).'

UNION ALL
SELECT 29, '0/C · SZÁMVEVŐI POLICY ⛔',
       'Futtathatja-e az authenticated a current_user_district_olvaso_ids()-t?',
       -- ⚠️ A keresés pg_proc-ból megy, NEM `'…'::regprocedure` cast-tal: egy
       --    KONSTANS regprocedure-cast a TERVEZÉSKOR kiértékelődik, tehát nem
       --    létező függvénynél az EGÉSZ felmérést megbuktatná — akkor is, ha a
       --    CASE ága sosem futna le. (Ez a felmérés épp azt méri, létezik-e.)
       COALESCE((SELECT CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
                             THEN '✅ van GRANT'
                             ELSE '⛔ NINCS — a policy nem TAGADNA, hanem 403-mal HIBÁZNA' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.pronargs = 0
                   AND p.proname = 'current_user_district_olvaso_ids'),
                '— nincs ilyen függvény (lásd az 5-6. sort)'),
       'Bizonyított hibaosztály: a policy a HÍVÓ szerepében fut; GRANT nélkül nem tagad, hanem elszáll. Az 1. szakasz a GRANT-ot mindenképp kiadja (idempotens).'

-- ── 0/D · FK-K és UNIQUE — a 10. csapda mai állapota ────────────────────────
UNION ALL
SELECT (30 + row_number() OVER (ORDER BY con.conname))::int, '0/D · FK-K ⛔ 10. CSAPDA',
       con.conname,
       pg_get_constraintdef(con.oid),
       'Tájékoztató: ezek a MAI FK-k. Ha csak EGYOSZLOPOSAK, akkor a (diocese_id, district_id) pár NINCS a valódi lánchoz kötve — egy esperes tetszőleges kerülethez küldhet fel.'
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.diocese_felterjesztes')
  AND con.contype = 'f'

UNION ALL
SELECT 36, '0/D · KOMPOZIT FK ⛔ 10. CSAPDA',
       'Létezik-e MÁR a KÉToszlopos FK a dioceses felé?',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint c4
              WHERE c4.conrelid = to_regclass('public.diocese_felterjesztes')
                AND c4.contype = 'f'
                AND c4.confrelid = to_regclass('public.dioceses')
                AND array_length(c4.conkey, 1) = 2)
            THEN '✅ létezik (az S3 már lefutott — újrafuttatás rendben)'
            ELSE '⛔ NINCS — a district_id ma szabadon választható' END,
       'A keresés conkey (oszlop-szám) alapján megy, NEM pg_get_constraintdef LIKE-kal — a szöveges illesztés házon belül tiltott, mert a formázás verzióról verzióra változhat.'

UNION ALL
SELECT 37, '0/D · UNIQUE ELŐFELTÉTEL ⛔',
       'Van-e a dioceses-en UNIQUE/PK az (id, district_id) PÁRON?',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint c5
              WHERE c5.conrelid = to_regclass('public.dioceses')
                AND c5.contype IN ('u','p')
                AND array_length(c5.conkey, 1) = 2
                AND c5.conkey @> ARRAY[
                      (SELECT a1.attnum FROM pg_attribute a1
                        WHERE a1.attrelid = to_regclass('public.dioceses') AND a1.attname='id'),
                      (SELECT a2.attnum FROM pg_attribute a2
                        WHERE a2.attrelid = to_regclass('public.dioceses') AND a2.attname='district_id')])
            THEN '✅ van'
            ELSE '— nincs (ez a fájl hozza létre: dioceses_id_district_id_uq)' END,
       'Kompozit FK CSAK UNIQUE vagy PK célra mutathat. Enélkül a 10. csapda nem javítható. Az S0 mérése szerint ma nincs.'

-- ── 0/E · ADAT-ELŐFELTÉTELEK — ezek MEGÁLLÍTHATJÁK az 1. szakaszt ───────────
UNION ALL
SELECT 40, '0/E · ADAT ⛔ BLOKKOLÓ',
       'Hány egyházmegyének NINCS district_id-je?',
       (SELECT count(*)::text || ' db' FROM public.dioceses d WHERE d.district_id IS NULL)
       || COALESCE((SELECT ' → ' || string_agg(d2.name, ', ' ORDER BY d2.name)
                    FROM public.dioceses d2 WHERE d2.district_id IS NULL), ''),
       '⛔ Ha NEM 0: az 1. szakasz MEGÁLL. Ok: a kompozit FK szülő-kulcsa (id, NULL) SOHA nem egyezne a gyerek (id, valami) párral, tehát az a megye NÉMÁN kizáródna a felküldésből. Előbb töltsd ki a district_id-t (Admin → Egyházmegyék). Az S0 szerint mind a 25-nek van.'

UNION ALL
SELECT 41, '0/E · ADAT ⛔ BLOKKOLÓ',
       'Hány felterjesztésen HAMIS a district_id? (nem a megye valódi kerülete)',
       (SELECT count(*)::text FROM public.diocese_felterjesztes f
        JOIN public.dioceses d ON d.id = f.diocese_id
        WHERE d.district_id IS DISTINCT FROM f.district_id)
       || ' db  (összesen '
       || (SELECT count(*)::text FROM public.diocese_felterjesztes) || ' felterjesztésből)',
       '⛔ Ha NEM 0: az 1. szakasz MEGÁLL (különben a kompozit FK egy nyers, magyarázat nélküli Postgres-hibával bukna el). A hamis sorokat ELŐBB javítani kell — a 42. sor kilistázza őket. Az S0 szerint 0 db.'

UNION ALL
SELECT 42, '0/E · ADAT',
       'MELYEK a hamis district_id-jű felterjesztések? (megye → valódi ⇄ rögzített)',
       COALESCE((SELECT string_agg(d3.name || ' / ' || f2.doc_type || ' ' || f2.year::text
                                   || ': valódi=' || COALESCE(d3.district_id::text,'NULL')
                                   || ' ⇄ rögzített=' || f2.district_id::text, ' | ')
                 FROM public.diocese_felterjesztes f2
                 JOIN public.dioceses d3 ON d3.id = f2.diocese_id
                 WHERE d3.district_id IS DISTINCT FROM f2.district_id),
                '✅ egy sem'),
       'EZ A JAVÍTÁS PONTOS MUNKALISTÁJA, ha a 41. sor nem 0.'

UNION ALL
SELECT 43, '0/E · ADAT ⛔ BLOKKOLÓ',
       'Megmaradt-e a diocese_felterjesztes.district_id NOT NULL-ja?',
       COALESCE((SELECT CASE WHEN c6.is_nullable = 'NO'
                             THEN '✅ NOT NULL — árva (kerület nélküli) felterjesztés nem keletkezhet'
                             ELSE '⛔ NULLABLE — a kompozit FK MATCH SIMPLE mellett a NULL-os sorokon VAKUUMOSAN teljesülne (az FK ott lenne, de nem védene)' END
                 FROM information_schema.columns c6
                 WHERE c6.table_schema='public' AND c6.table_name='diocese_felterjesztes'
                   AND c6.column_name='district_id'),
                '⛔ nincs ilyen oszlop'),
       '⛔ Ha ⛔: az 1. szakasz MEGÁLL. A NOT NULL az uj-tablak.sql óta él; ha eltűnt, valaki lazította — előbb derítsük ki, miért.'

UNION ALL
SELECT 44, '0/E · ADAT',
       'Milyen státuszban vannak a mai felterjesztések? (a fogadó felület bemenete)',
       COALESCE((SELECT string_agg(s.status || ': ' || s.db::text, ' | ' ORDER BY s.status)
                 FROM (SELECT COALESCE(status,'(nincs)') AS status, count(*) AS db
                       FROM public.diocese_felterjesztes GROUP BY 1) s),
                '— még egy sem'),
       'Tájékoztató. Ha 0: a fogadó felület üresen indul, ami rendben van — de a teszteléshez kell majd egy megyei felküldés.'

UNION ALL
SELECT 45, '0/E · ADAT',
       'Van-e ELBÍRÁLATLAN feloldás-kérés? (a fogadó felület harmadik funkciója)',
       -- ⚠️ TÜNET, AMI EZT A SORT MEGSZÜLTE: itt eredetileg `f3.unlock_requested`
       --    állt, KÖZVETLEN oszlop-hivatkozásként. A CASE csak a KIÉRTÉKELÉST
       --    kerüli meg, az ELEMZÉST nem: a Postgres az EGÉSZ utasítást feloldja,
       --    mielőtt egyetlen sort is számolna. Ha az oszlop hiányzik (a
       --    feloldas.sql még nem futott), NEM a szép „— nincs unlock_requested
       --    oszlop" szöveg jött volna, hanem az EGÉSZ 0. szakasz elszállt volna
       --    42703-mal — épp abban a helyzetben, amiért a felmérés készült.
       --    A `to_jsonb(f3) ->> 'unlock_requested'` alak PARSE-IDŐBEN ártalmatlan
       --    (a JSON-kulcs nem oszlopnév), ahogy az S2 fájl a `teszt` oszlopnál.
       --    ⛔ NE „egyszerűsítsd" vissza közvetlen oszlop-hivatkozásra.
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns c7
                             WHERE c7.table_schema='public' AND c7.table_name='diocese_felterjesztes'
                               AND c7.column_name='unlock_requested')
            THEN '— nincs unlock_requested oszlop (lásd a 3. sort)'
            ELSE (SELECT count(*)::text || ' db'
                  FROM public.diocese_felterjesztes f3
                  WHERE COALESCE((to_jsonb(f3) ->> 'unlock_requested')::boolean, false)) END,
       'K5: az elbírálás a fogadó felület része. Ha van várakozó kérés, az azonnal látszani fog a kerületnél — eddig SENKI nem látta.'

-- ── 0/F · GRANT, RLS, mentés-besorolás ─────────────────────────────────────
UNION ALL
SELECT 50, '0/F · GRANT',
       'Milyen tábla-szintű joga van az authenticated-nek a diocese_felterjesztes-en?',
       -- ⚠️ TÜNET: itt eredetileg `'public.diocese_felterjesztes'::regclass`
       --    KONSTANS cast állt. Az a TERVEZÉSKOR oldódik fel, tehát nem létező
       --    táblánál az EGÉSZ 0. szakasz elszáll 42P01-gyel — és a szomszédos
       --    sorok gondosan megírt „⛔ nincs ilyen tábla" fallbackje (0/F-51)
       --    SOHA nem tudott volna megjelenni. A to_regclass FUTÁSIDŐBEN NULL-t
       --    ad, a has_table_privilege ekkor NULL → a WHERE nem enged sort →
       --    a COALESCE fallbackje jön. ⛔ NE cseréld vissza konstans castra.
       COALESCE((SELECT string_agg(j.jog, ', ' ORDER BY j.jog)
                 FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS j(jog)
                 WHERE has_table_privilege('authenticated',
                         to_regclass('public.diocese_felterjesztes'), j.jog)),
                '⛔ egy sem'),
       'Az elvárt: SELECT, INSERT, UPDATE. DELETE SZÁNDÉKOSAN nincs — egy felterjesztés nem tűnhet el nyomtalanul (visszavonni a státusszal lehet). Ez a fájl a GRANT-okhoz NEM nyúl.'

UNION ALL
SELECT 51, '0/F · RLS',
       'Be van-e kapcsolva az RLS a diocese_felterjesztes-en?',
       COALESCE((SELECT CASE WHEN cl.relrowsecurity THEN '✅ igen'
                             ELSE '⛔ NINCS — minden policy hatástalan, minden bejelentkezett mindent lát' END
                 FROM pg_class cl WHERE cl.oid = to_regclass('public.diocese_felterjesztes')),
                '⛔ nincs ilyen tábla'),
       '⚠️ A TRIGGER akkor is véd, ha az RLS ki lenne kapcsolva — de a policy-k nem. Az 1. szakasz FELTÉTEL NÉLKÜL kiadja az ENABLE ROW LEVEL SECURITY-t (a Postgres idempotensnek veszi).'

UNION ALL
SELECT 52, '0/F · MENTÉS',
       'Be van-e sorolva a diocese_felterjesztes a napi mentésbe?',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⚠️ nincs backup_table_policy tábla'
            ELSE COALESCE((SELECT '✅ besorolva (hatokor=' || COALESCE(b.hatokor,'?') || ')'
                           FROM public.backup_table_policy b
                           WHERE b.tabla = 'diocese_felterjesztes' LIMIT 1),
                          '⚠️ NINCS besorolva — a napi mentés hangosan áll') END,
       'ÚJ TÁBLA NEM JÖN LÉTRE, tehát új besorolás-sor sem kell (az uj-tablak.sql 1/F már besorolta: globalis / R2). Kulcsoszlop: `tabla` (NEM table_name).'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A VÁLTOZTATÁS                              FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ. Ha bármi hibázik, MINDEN visszagördül.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '5min';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/0) ŐRSZEM — fail-closed. Előfeltétel nélkül NEM futunk.
-- ────────────────────────────────────────────────────────────────────────────
-- „A migration-fájl NEM bizonyíték arra, hogy lefutott élesben." Ez az őrszem
-- az ÉLŐ állapotot méri, nem a repót.
DO $orszem$
DECLARE
  v_hianyzo_oszlop text;
  v_null_megye     text;
  v_hamis_db       integer;
  v_hamis_lista    text;
  v_nullable       text;
BEGIN
  -- (a) A TÁBLA
  IF to_regclass('public.diocese_felterjesztes') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: nincs public.diocese_felterjesztes tábla. Előbb a 2026-08-15-egyhazmegyei-uj-tablak.sql fusson le.';
  END IF;
  IF to_regclass('public.dioceses') IS NULL THEN
    RAISE EXCEPTION 'ELŐFELTÉTEL HIÁNYZIK: nincs public.dioceses tábla.';
  END IF;

  -- (b) A HATÓKÖR-FÜGGVÉNYEK. A trigger az első hármat hívja, az új policy a
  --     negyediket. Ha bármelyik hiányzik, a trigger MINDEN UPDATE-et
  --     megbuktatna — a felküldést is, nemcsak a hamisítást.
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_diocese_ids()') IS NULL
     OR to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: hiányzó kanonikus hatókör-függvény (current_user_has_global_access / current_user_diocese_ids / current_user_district_ids). Előbb a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: nincs current_user_district_olvaso_ids() — enélkül a kerületi SZÁMVEVŐ olvasó-policy-ja nem építhető meg. Előbb a 2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql fusson le.';
  END IF;

  -- (c) A TÁBLA SÉMÁJA. Az engedett-oszlop lista NEVEKRE hivatkozik; ha egy
  --     oszlop hiányzik, a védelem NÉMÁN másra vonatkozna, mint amit hiszünk.
  SELECT string_agg(v.oszlop, ', ' ORDER BY v.oszlop) INTO v_hianyzo_oszlop
  FROM (VALUES ('status'),('received_at'),('received_by'),('returned_reason'),
               ('notes'),('snapshot_data'),('iktatoszam'),('submitted_at'),
               ('submitted_by'),('modification_number'),
               ('unlock_requested'),('unlock_reason'),
               ('unlock_requested_at'),('unlock_requested_by')) AS v(oszlop)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name='diocese_felterjesztes'
                      AND c.column_name = v.oszlop);
  IF v_hianyzo_oszlop IS NOT NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: a diocese_felterjesztes tábláról hiányzik: %. Futtasd le a 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql és a 2026-08-15-egyhazmegyei-osszesito-feloldas.sql fájlt.', v_hianyzo_oszlop;
  END IF;

  -- (d) 7. CSAPDA — a HÁROMoszlopos egyedi index visszatérése. Ha él, a
  --     költségvetés-módosítás felküldése NÉMÁN felülírja az eredeti
  --     költségvetést; a fogadó felület tehát HAMIS iratot mutatna.
  IF to_regclass('public.diocese_felterjesztes_dio_tipus_ev_uidx') IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL-CLOSED: él a régi, HÁROMoszlopos egyedi index (diocese_felterjesztes_dio_tipus_ev_uidx) → a költségvetés-módosítás NÉMÁN felülírja az eredeti költségvetést. Futtasd (újra) a 2026-08-15-egyhazmegyei-felterjesztes-modositas.sql-t, MIELŐTT a kerületi fogadó felület élesedik.';
  END IF;

  -- (e) 10. CSAPDA ELŐFELTÉTELE — NOT NULL a gyerek-oldalon.
  --     Ha ez lazult, a kompozit FK MATCH SIMPLE mellett a NULL-os sorokon
  --     VAKUUMOSAN teljesülne: az FK ott lenne, de nem védene. Ez rosszabb,
  --     mint ha nem lenne FK — hamis biztonságérzetet ad.
  SELECT c.is_nullable INTO v_nullable
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='diocese_felterjesztes'
    AND c.column_name='district_id';
  IF v_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION
      'FAIL-CLOSED: a diocese_felterjesztes.district_id NEM NOT NULL (is_nullable=%). A kompozit FK MATCH SIMPLE mellett a NULL-os sorokon VAKUUMOSAN teljesülne — az FK ott lenne, de nem védene. Előbb derítsük ki, ki és miért lazította.', COALESCE(v_nullable,'?');
  END IF;

  -- (f) 10. CSAPDA ELŐFELTÉTELE — a szülő-oldal teljessége.
  --     Egy NULL district_id-jű megye szülő-kulcsa (id, NULL); a gyerek pár
  --     (id, valami) SOHA nem egyezne vele → az a megye NÉMÁN kizáródna a
  --     felküldésből. Inkább álljunk meg MOST, hangosan.
  SELECT string_agg(d.name, ', ' ORDER BY d.name) INTO v_null_megye
  FROM public.dioceses d WHERE d.district_id IS NULL;
  IF v_null_megye IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL-CLOSED: van egyházkerület nélküli egyházmegye (%). A kompozit FK bevezetése után ezek a megyék SOHA nem tudnának felterjeszteni (a szülő-kulcs (id, NULL) nem egyezik a gyerek (id, valami) párral). Előbb töltsd ki a district_id-t, majd futtasd újra ezt a fájlt.', v_null_megye;
  END IF;

  -- (g) 10. CSAPDA — a MEGLÉVŐ hamis sorok. Az ADD CONSTRAINT amúgy is elbukna
  --     rajtuk, de egy nyers Postgres-hibával, ami nem mondja meg, MIT javíts.
  SELECT count(*),
         string_agg(d.name || ' / ' || f.doc_type || ' ' || f.year::text, ' | ')
    INTO v_hamis_db, v_hamis_lista
  FROM public.diocese_felterjesztes f
  JOIN public.dioceses d ON d.id = f.diocese_id
  WHERE d.district_id IS DISTINCT FROM f.district_id;
  IF v_hamis_db > 0 THEN
    RAISE EXCEPTION
      'FAIL-CLOSED: % felterjesztésen HAMIS a district_id (nem a megye valódi kerülete): %. Ezek a sorok MA a rossz kerület fogadó felületén jelennének meg. Előbb javítsd őket (a 0. szakasz 42. sora listázza a valódi ⇄ rögzített párokat), majd futtasd újra ezt a fájlt.', v_hamis_db, v_hamis_lista;
  END IF;
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) GRANT-ok — a policy és a trigger a HÍVÓ szerepében fut
-- ────────────────────────────────────────────────────────────────────────────
-- Bizonyított hibaosztály: GRANT nélkül a policy nem TAGAD, hanem 403-mal
-- HIBÁZIK. Idempotens és ártalmatlan, ha már megvan.
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()    TO authenticated;
-- ⚠️ 2026-08-16: EZ IS IDE KELL. A fogadó felület LEGFONTOSABB két kapuja — a
--    már meglévő `diocese_felterjesztes_kerulet_select` és `_kerulet_update` —
--    pontosan ezen a függvényen áll, és ezt a két policy-t eddig SENKI nem
--    használta élesben (nulla kerületi fogyasztója volt a táblának). Ha a GRANT
--    hiányzik, a fogadó felület legelső lekérdezése nem üres listát ad, hanem
--    403-mal HIBÁZIK — pontosan az a hibaosztály, amit ez a fájl máshol idéz.
GRANT EXECUTE ON FUNCTION public.current_user_district_ids()         TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) ⛔ 9. CSAPDA — OSZLOP-ŐRSZEM A FAGYASZTOTT IRATON
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT TRIGGER ÉS NEM POLICY: az RLS SOR-szinten dönt, OSZLOP-szinten nem.
-- Egy UPDATE policy meg tudja mondani, MELYIK SORT szabad írni, de azt nem,
-- hogy A SORON BELÜL melyik oszlopot. Az oszlop-szintű GRANT sem jó ide, mert
-- az szerepenként szól, a mi megkülönböztetésünk viszont SOR-FÜGGŐ (ugyanaz az
-- `authenticated` szerep a SAJÁT megyéje során mindent írhat, egy másik megye
-- során semmit a státuszon kívül). Marad a trigger.

CREATE OR REPLACE FUNCTION public.diocese_felterjesztes_kerulet_oszlopvedelem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $kerulet_oszlopvedelem$
DECLARE
  -- A KERÜLETI útvonalon módosítható oszlopok — kizárólag az ÜGYVITEL mezői:
  -- átvétel-nyugtázás, visszaküldés indoklással, feloldás-kérés elbírálása,
  -- napló. AZ IRAT TARTALMA (snapshot_data) ÉS A FELKÜLDÉS PECSÉTJE
  -- (iktatoszam, submitted_at, submitted_by) NINCS KÖZTÜK.
  --
  -- ⚠️ AZ `updated_at` SZÁNDÉKOSAN RAJTA VAN. Nem azért, mert a kerület
  --    írhatja, hanem mert a MÁSIK BEFORE UPDATE trigger
  --    (diocese_felterjesztes_updated_at_trigger) úgyis now()-ra állítja. Ha
  --    nem lenne a listán, a két trigger ábécé-sorrendje döntené el, hogy egy
  --    szabályos átvétel átmegy-e — vagyis a védelem VÉLETLENSZERŰEN buktatna
  --    meg jogos műveleteket. Így viszont a sorrend NEM SZÁMÍT. Hamisításra
  --    alkalmatlan mező: a másik trigger felülírja.
  c_engedett constant text[] := ARRAY[
    'status',
    'received_at', 'received_by',
    'returned_reason',
    'notes',
    'unlock_requested', 'unlock_reason', 'unlock_requested_at', 'unlock_requested_by',
    'updated_at'
  ];
  v_regi    jsonb;
  v_uj      jsonb;
  v_tiltott text;
BEGIN
  -- (1) NINCS BEJELENTKEZETT IDENTITÁS → szerveroldali út.
  --     service_role kulcs, mentés-visszaállítás, kézzel futtatott karbantartó
  --     SQL. Ezek az RLS-t is megkerülik; egy trigger-tiltás itt nem a
  --     hamisítót fogná meg, hanem a VISSZAÁLLÍTÁST törné el. A felületről ez
  --     az ág elérhetetlen: minden kerületi policy auth.uid()-alapú hatókörre
  --     épül, tehát uid nélkül a hívó egyetlen sort sem lát.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (2) RENDSZERGAZDA → teljes írás (hibajavítás, adatmentés).
  IF public.current_user_has_global_access() THEN
    RETURN NEW;
  END IF;

  -- (3) A SOR SAJÁT MEGYÉJE → teljes írás. EZ AZ AZ ÁG, AMI A FELKÜLDÉST
  --     (rogzitDioceseFelterjesztes upsert-je) ÉLETBEN TARTJA: a megye írja a
  --     snapshot_data-t, az iktatószámot és a submitted_* mezőket.
  --     ⚠️ OLD.diocese_id-t nézünk, nem NEW-t: a jogosultság ahhoz kötődik, KIÉ
  --        A SOR MOST — különben egy „írjuk át a diocese_id-t magunkra" trükk
  --        maga adná meg a jogot. (A WITH CHECK amúgy is fogná, de a védelem ne
  --        egy másik réteg helyességén álljon.)
  IF OLD.diocese_id = ANY (COALESCE(public.current_user_diocese_ids(), '{}'::uuid[])) THEN
    RETURN NEW;
  END IF;

  -- (4) MINDEN MÁS HÍVÓ = KERÜLETI ÚT. Ide csak a
  --     diocese_felterjesztes_kerulet_update policy engedhette be (más UPDATE
  --     policy nincs a táblán) → OSZLOP-KORLÁT.
  --
  --     FAIL-CLOSED SZERKEZET: nem a tiltott oszlopokat soroljuk fel, hanem az
  --     engedetteket, és a teljes sort vetjük össze. Egy KÉSŐBB HOZZÁADOTT
  --     oszlop így AUTOMATIKUSAN védett — nem kell rá emlékezni.

  -- ⚠️ (4a) A „KI" IS KÖTVE VAN, NEM CSAK A „MELYIK OSZLOP".
  --     TÜNET, AMI EZT A KÉT ZÁRADÉKOT MEGSZÜLTE: az engedett listán rajta van
  --     a `received_by` és az `unlock_requested_by`, DE a lista csak azt mondja
  --     meg, MELYIK oszlop írható — azt nem, MILYEN ÉRTÉKRE. Enélkül egy
  --     kerületi admin BÁRMILYEN uid-t beírhatott: „nem én vettem át, hanem a
  --     kollégám", sőt FABRIKÁLHATOTT egy sosem történt feloldás-kérést a megye
  --     nevében, amit aztán MAGA bírál el. A fájl SAJÁT célja —
  --     OKIRAT-INTEGRITÁS, a „KI és MIKOR" bizonyítása — épp ezen a két mezőn
  --     nem teljesült volna. Két olcsó záradék, a diff-vizsgálat ELŐTT.
  --     ⛔ NE „egyszerűsítsd" ki azzal, hogy „úgyis rajta vannak az engedett
  --        listán" — pont az a baj, hogy rajta vannak.

  --     (4a/1) `received_by`: KIZÁRÓLAG saját magára állítható. A NULL-ra állítás
  --            (átvétel visszavonása) megengedett — az nem állít hamis tanút.
  IF NEW.received_by IS DISTINCT FROM OLD.received_by
     AND NEW.received_by IS NOT NULL
     AND NEW.received_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'Az átvevő személye nem írható más nevére. Az átvételt AZ VEZETI BE, AKI átveszi: a received_by kizárólag a bejelentkezett felhasználó azonosítója lehet.'
      USING ERRCODE = '42501',
            HINT = 'Hagyd üresen a received_by-t (a szerver a saját azonosítódat írja be), vagy jelentkezzen be az, aki ténylegesen átveszi az iratot. Ha az átvételt vissza kell vonni, a received_by NULL-ra állítható.';
  END IF;

  --     (4a/2) `unlock_requested_by`: a feloldás-kérést A MEGYE rögzíti (a
  --            trigger 3. ága), a kerület CSAK ELBÍRÁLJA — vagyis a kérés
  --            LEZÁRÁSAKOR törli. Kerületi útról tehát KIZÁRÓLAG NULL-ra
  --            állítható. Ha bármilyen NEM NULL értéket írna be, azzal egy
  --            sosem történt megyei kérést fabrikálna, amit aztán maga bírál el.
  IF NEW.unlock_requested_by IS DISTINCT FROM OLD.unlock_requested_by
     AND NEW.unlock_requested_by IS NOT NULL THEN
    RAISE EXCEPTION
      'A feloldás-kérés kérelmezője nem állítható be az egyházkerület felől. A feloldást A MEGYE kéri, a kerület csak ELBÍRÁLJA — az unlock_requested_by kerületi úton kizárólag törölhető (NULL).'
      USING ERRCODE = '42501',
            HINT = 'Elbíráláskor állítsd az unlock_requested_by-t NULL-ra (a kérés lezárása), és a döntést a status + notes mezőkben rögzítsd. Ha a megye még nem kért feloldást, a kérést NEKI kell benyújtania — helyette nem lehet.';
  END IF;

  v_regi := to_jsonb(OLD);
  v_uj   := to_jsonb(NEW);

  SELECT string_agg(k.oszlop, ', ' ORDER BY k.oszlop)
    INTO v_tiltott
  FROM jsonb_object_keys(v_uj) AS k(oszlop)
  WHERE NOT (k.oszlop = ANY (c_engedett))
    AND (v_regi -> k.oszlop) IS DISTINCT FROM (v_uj -> k.oszlop);

  IF v_tiltott IS NOT NULL THEN
    RAISE EXCEPTION
      'A felterjesztett irat TARTALMA nem módosítható az egyházkerület felől. A megye által beküldött irat FAGYASZTOTT: átvenni, visszaküldeni vagy megjegyzéssel ellátni lehet, átírni nem. Tiltott oszlop(ok): %.', v_tiltott
      USING ERRCODE = '42501',
            HINT = 'Ha az irat tartalma hibás, KÜLDD VISSZA indoklással (status = ''returned'' + returned_reason). A javítást a megye végzi el, és újra felterjeszti — így marad nyoma annak, ki mit változtatott.';
  END IF;

  RETURN NEW;
END
$kerulet_oszlopvedelem$;

COMMENT ON FUNCTION public.diocese_felterjesztes_kerulet_oszlopvedelem() IS
  '2026-08-16 (egyházkerületi S3, 9. csapda): OKIRAT-INTEGRITÁS. A kerületi UPDATE-policy csak a district_id-t nézi, oszlopot korlátozni RLS-ben nem lehet — ezért ez a BEFORE UPDATE trigger engedi át a rendszergazdát, a szerveroldali (auth.uid() IS NULL) utat és a sor SAJÁT MEGYÉJÉT teljes írással, minden más hívónak pedig KIZÁRÓLAG az ügyviteli oszlopokat (status, received_*, returned_reason, notes, unlock_*, updated_at). A snapshot_data, iktatoszam, submitted_*, doc_type, year, diocese_id, district_id, modification_number kerületi úton SOHA nem változhat. FAIL-CLOSED: engedélyezési listát használ + teljes to_jsonb összevetést, tehát minden KÉSŐBB hozzáadott oszlop automatikusan védett. ⚠️ KÉT MEZŐN AZ ÉRTÉK IS KÖTÖTT (nem elég, hogy melyik oszlop írható): a received_by csak auth.uid()-ra (vagy NULL-ra) állítható — az átvételt az vezeti be, aki átveszi —, az unlock_requested_by pedig kerületi úton KIZÁRÓLAG NULL-ra, mert a feloldás-kérést a MEGYE rögzíti, a kerület csak elbírálja. Enélkül a kerület idegen nevére írhatta volna az átvételt, és fabrikálhatott volna egy sosem történt megyei feloldás-kérést, amit aztán maga bírál el.';

-- A trigger NEVE „k"-val kezdődik, a meglévő updated_at trigger „u"-val, tehát
-- ez fut előbb (a Postgres a BEFORE triggereket ábécé-sorrendben futtatja).
-- A SORREND SZÁNDÉKOSAN NEM SZÁMÍT — lásd az `updated_at`-magyarázatot fent.
DROP TRIGGER IF EXISTS diocese_felterjesztes_kerulet_oszlopvedelem_trigger
  ON public.diocese_felterjesztes;
CREATE TRIGGER diocese_felterjesztes_kerulet_oszlopvedelem_trigger
  BEFORE UPDATE ON public.diocese_felterjesztes
  FOR EACH ROW
  EXECUTE FUNCTION public.diocese_felterjesztes_kerulet_oszlopvedelem();

COMMENT ON TRIGGER diocese_felterjesztes_kerulet_oszlopvedelem_trigger
  ON public.diocese_felterjesztes IS
  '2026-08-16 (S3): a fagyasztott felterjesztés oszlop-őrszeme. A meglévő diocese_felterjesztes_updated_at_trigger MELLETT él, nem helyette. A két BEFORE UPDATE trigger sorrendje nem számít, mert az updated_at az engedett oszlopok között van.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) ⛔ 10. CSAPDA — A VALÓDI MEGYE→KERÜLET LÁNC KIKÉNYSZERÍTÉSE
-- ────────────────────────────────────────────────────────────────────────────

-- (i) A szülő-oldal UNIQUE-ja. Kompozit FK csak UNIQUE/PK célra mutathat.
--     Az (id, …) prefix miatt ez az index a `dioceses.id` keresésekre is jó,
--     tehát nem „felesleges" index: a PK mellett is hasznos marad.
DO $dioceses_uq$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.dioceses')
                   AND conname  = 'dioceses_id_district_id_uq') THEN
    ALTER TABLE public.dioceses
      ADD CONSTRAINT dioceses_id_district_id_uq UNIQUE (id, district_id);
    RAISE NOTICE '✅ dioceses_id_district_id_uq létrehozva (a kompozit FK célja).';
  ELSE
    RAISE NOTICE 'ℹ️ dioceses_id_district_id_uq már létezik — nem nyúlunk hozzá.';
  END IF;
END
$dioceses_uq$;

COMMENT ON CONSTRAINT dioceses_id_district_id_uq ON public.dioceses IS
  '2026-08-16 (egyházkerületi S3, 10. csapda): NEM önmagáért van — a diocese_felterjesztes (diocese_id, district_id) KOMPOZIT FK-jának a célja. Az id már önmagában egyedi (PK); ez a pár azért kell, mert egy kompozit FK csak UNIQUE/PK célra mutathat. ⛔ NE dobd el: az eldobás magával vinné a felterjesztések lánc-ellenőrzését.';

-- (ii) A kompozit FK. A KÉT MEGLÉVŐ egyoszlopos FK MEGMARAD mellette:
--      a district_id → districts hivatkozást csak az őrzi, és a redundáns
--      diocese_id → dioceses eldobása semmit nem nyerne (a két ellenőrzés
--      költsége elhanyagolható, 25 megyénél).
--
--      ⚠️⚠️ ENNEK ÁRA VAN: PGRST201. Mostantól KÉT FK mutat a dioceses-re,
--         és a PostgREST nem tud választani közülük. Minden
--         `.select('…, dioceses(name)')` beágyazás PGRST201-gyel („more than
--         one relationship was found") LEÁLL — nem üres adatot ad, hanem
--         300-as hibát. MA nem tör el semmit: a fogadó akció SZÁNDÉKOSAN külön
--         kérdezi le a megyék nevét. Az S4/S5 szeletnek viszont NÉMA CSAPDA.
--         EGYÉRTELMŰSÍTÉS: `dioceses!diocese_felterjesztes_diocese_id_fkey(name)`
--         VAGY külön lekérdezés + kódbeli párosítás. (Mérés: 2/B-205 sor.)
--
--      ⚠️ ON UPDATE / ON DELETE ALAPÉRTELMEZETT (NO ACTION) — SZÁNDÉKOSAN.
--         Kerület-átsorolásnál a dioceses UPDATE-je HANGOSAN elbukik, amíg a
--         megyének felterjesztései vannak. Az ON UPDATE CASCADE átírná a
--         MÚLTAT: egy már ÁTVETT irat némán átcsúszna a másik kerülethez,
--         mintha mindig is oda érkezett volna. Ez pont az az okirat-hamisítás,
--         ami ellen az egész fájl szól.
DO $felterj_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.diocese_felterjesztes')
                   AND conname  = 'diocese_felterjesztes_dio_district_fkey') THEN
    ALTER TABLE public.diocese_felterjesztes
      ADD CONSTRAINT diocese_felterjesztes_dio_district_fkey
        FOREIGN KEY (diocese_id, district_id)
        REFERENCES public.dioceses (id, district_id);
    RAISE NOTICE '✅ diocese_felterjesztes_dio_district_fkey létrehozva (10. csapda lezárva).';
  ELSE
    RAISE NOTICE 'ℹ️ diocese_felterjesztes_dio_district_fkey már létezik.';
  END IF;
END
$felterj_fk$;

COMMENT ON CONSTRAINT diocese_felterjesztes_dio_district_fkey
  ON public.diocese_felterjesztes IS
  '2026-08-16 (egyházkerületi S3, 10. csapda): a felterjesztés district_id-je a megye VALÓDI egyházkerülete kell legyen. Korábban két külön, egyoszlopos FK állt itt, amelyek egymástól függetlenül teljesültek — így egy esperes TETSZŐLEGES kerülethez terjeszthette fel az iratát, az pedig a MÁSIK kerület fogadó felületén jelent meg, a sajátja meg hiába várta. ON UPDATE/DELETE SZÁNDÉKOSAN NO ACTION: kerület-átsorolásnál HANGOSAN buk, mert a CASCADE átírná a múltat (egy már átvett irat némán átcsúszna a másik kerülethez).';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) ⚠️ A KERÜLETI SZÁMVEVŐ OLVASÓ-POLICY-JA
-- ────────────────────────────────────────────────────────────────────────────
-- A meglévő _kerulet_select a current_user_district_ids()-t hívja, ami CSAK
-- egyhazkeruleti_admin szerepkör-sorokat gyűjt. A számvevő ELLENŐR: látnia kell
-- a beküldött iratokat. ÚJ, KÜLÖN policy — a meglévőhöz NEM nyúlunk (a
-- PERMISSIVE policy-k VAGY-kapcsolatban állnak, tehát ez BŐVÍT).
--
-- ⛔ AZ UPDATE POLICY VÁLTOZATLAN: a számvevő OLVAS, de NEM ÍR. Az átvétel és a
--    visszaküldés a kerületi ADMIN felelőssége.
--
-- Az RLS bekapcsolása feltétel nélkül megy: a Postgres idempotensnek veszi.
ALTER TABLE public.diocese_felterjesztes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diocese_felterjesztes_kerulet_szamvevo_select
  ON public.diocese_felterjesztes;
CREATE POLICY diocese_felterjesztes_kerulet_szamvevo_select
  ON public.diocese_felterjesztes
  FOR SELECT TO authenticated
  -- A `(SELECT fn())` alak SZÁNDÉKOS: így a tervező InitPlan-ként
  -- LEKÉRDEZÉSENKÉNT EGYSZER futtatja, nem soronként.
  -- A COALESCE(..., '{}') FAIL-CLOSED: üres hatókör → ÜRES eredmény.
  USING (diocese_felterjesztes.district_id
         = ANY (COALESCE((SELECT public.current_user_district_olvaso_ids()), '{}'::uuid[])));

COMMENT ON POLICY diocese_felterjesztes_kerulet_szamvevo_select
  ON public.diocese_felterjesztes IS
  '2026-08-16 (egyházkerületi S3): a KERÜLETI SZÁMVEVŐ (egyhazkeruleti_szamvevo) olvasó-ága. A meglévő _kerulet_select a current_user_district_ids()-t hívja, ami CSAK egyhazkeruleti_admin-t enged — a számvevő tehát ÜRES listát látott (nem hibát!), ami „nincs beküldve"-nek látszott. Ez a policy a current_user_district_olvaso_ids()-t hívja (admin + szamvevo). ÍRÁSI joga NINCS: az átvétel-nyugtázás és a visszaküldés a _kerulet_update policy-n áll, ahhoz ez nem nyúl. A megyei párja: diocese_felterjesztes_szamvevo_select.';


-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) ⛔ AZ ÉRTESÍTÉS-LÁNC KERÜLETI VÉGE — enélkül a megye csengője NÉMA
-- ────────────────────────────────────────────────────────────────────────────
-- A brief S3 pontja külön kiemeli: „És ÉRTESÍTÉS: a lánc ma némán fut, senki
-- nem kap jelzést." A fogadó felület (felterjesztes-actions.ts) ezért a MEGLÉVŐ
-- `ertesitesek` táblába szúr sort, amikor a kerület átvesz, visszaküld vagy
-- feloldás-kérelmet bírál el.
--
-- ⚠️ DE AZ ÉLES INSERT-POLICY EZT NEM ENGEDI. Az `ertesitesek_szint_insert`
--    (2026-08-11-globalis-hozzaferes-szukites.sql:1436-1443) feltétele:
--        congregation_id IS NOT NULL
--        AND current_user_can_access_congregation(congregation_id)
--    A kerület → megye értesítésnek NINCS gyülekezete (a címzett egy megyei
--    tisztségviselő), tehát a sor `congregation_id`-ja NULL → a WITH CHECK
--    HAMIS → az insert elbukik. Kerületi adminként MINDEN értesítés elveszne;
--    csak a rendszergazdai ág menne át.
--
-- MIÉRT NEM ELÉG A `congregation_id` KITÖLTÉSE: a felterjesztés a MEGYE irata,
-- nem egy gyülekezeté. Egy tetszőlegesen választott gyülekezet-azonosító
-- hazugság lenne az értesítés-naplóban, és a gyülekezeti értesítés-listákba is
-- beszivárogna.
--
-- A MEGOLDÁS: külön INSERT-policy, ami PONTOSAN ezt az egy esetet engedi —
-- a hívó a saját KERÜLETÉBE eső megye tisztségviselőjének küldhet gyülekezet
-- nélküli értesítést. Fail-closed: a `COALESCE(..., '{}')` üres hatókörnél
-- semmit nem enged.

ALTER TABLE public.ertesitesek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ertesitesek_kerulet_insert ON public.ertesitesek;
CREATE POLICY ertesitesek_kerulet_insert
  ON public.ertesitesek
  FOR INSERT TO authenticated
  WITH CHECK (
    -- (1) Kizárólag gyülekezet NÉLKÜLI, szint-közi értesítés.
    ertesitesek.congregation_id IS NULL
    -- (2) A címzettnek LÉTEZNIE kell, és a hívó KERÜLETÉBE eső egyházmegye
    --     tisztségviselőjének kell lennie — sem országos körlevél, sem
    --     tetszőleges felhasználó nem címezhető ezen az úton.
    AND ertesitesek.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.dioceses d_skalar ON d_skalar.id = p.diocese_id
      WHERE p.id = ertesitesek.user_id
        AND p.status = 'active'
        AND (
          -- (a) skalár megye-hozzárendelés
          d_skalar.district_id
            = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[]))
          -- (b) vagy nevesített megyei szerepkör-sor
          OR EXISTS (
            SELECT 1
            FROM public.profile_roles pr
            JOIN public.dioceses d_szerep ON d_szerep.id = pr.scope_id
            WHERE pr.profile_id = p.id
              AND pr.scope = 'diocese'
              AND pr.active = true
              AND pr.approval_status = 'approved'
              AND d_szerep.district_id
                    = ANY (COALESCE((SELECT public.current_user_district_ids()), '{}'::uuid[]))
          )
        )
    )
  );

COMMENT ON POLICY ertesitesek_kerulet_insert ON public.ertesitesek IS
  '2026-08-16 (egyházkerületi S3): a kerület → egyházmegye értesítés-lánc. Az ertesitesek_szint_insert `congregation_id IS NOT NULL`-t követel, a felterjesztés viszont a MEGYE irata (nincs gyülekezete), ezért kerületi adminként MINDEN átvétel/visszaküldés/feloldás-értesítés elbukott volna az RLS-en — némán, mert a hívások try/catch-ben futnak. Ez a policy PONTOSAN egy esetet enged: gyülekezet nélküli sor, a hívó KERÜLETÉBE eső egyházmegye AKTÍV tisztségviselőjének címezve (skalár diocese_id VAGY nevesített diocese szerepkör-sor). Fail-closed: üres kerületi hatókörnél semmit nem enged. OLVASÁST nem ad — azt a címzett saját ertesitesek_user policy-ja adja.';

COMMIT;

-- A PostgREST séma-gyorsítótár frissítése (új trigger + policy + constraint).
NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2/A · 9. CSAPDA — OSZLOP-ŐRSZEM' AS szakasz,
       'Létrejött-e az őrszem-FÜGGVÉNY?' AS mit,
       CASE WHEN to_regprocedure('public.diocese_felterjesztes_kerulet_oszlopvedelem()') IS NULL
            THEN '⛔ NINCS' ELSE '✅ létezik' END AS ertek,
       'Önmagában még semmit nem véd — a 101. sor a valódi bizonyíték.' AS teendo

UNION ALL
SELECT 101, '2/A · 9. CSAPDA — OSZLOP-ŐRSZEM',
       'RÁ VAN-E KÖTVE a táblára BEFORE UPDATE triggerként?',
       COALESCE((SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
                 WHERE t.tgrelid = to_regclass('public.diocese_felterjesztes')
                   AND t.tgname = 'diocese_felterjesztes_kerulet_oszlopvedelem_trigger'
                   AND NOT t.tgisinternal),
                '⛔ NINCS RÁKÖTVE — a kerület MA IS átírhatja a snapshot_data-t'),
       'EZ A FÁJL LEGFONTOSABB SORA. Ha ⛔: az 1. szakasz nem futott le (vagy visszagördült) — nézd meg a hibaüzenetet.'

UNION ALL
SELECT 102, '2/A · 9. CSAPDA — TRIGGER-SORREND',
       'Mind a KÉT BEFORE UPDATE trigger megvan, és milyen sorrendben futnak?',
       COALESCE((SELECT string_agg(t2.tgname, '  →  ' ORDER BY t2.tgname)
                 FROM pg_trigger t2
                 WHERE t2.tgrelid = to_regclass('public.diocese_felterjesztes')
                   AND NOT t2.tgisinternal
                   AND (t2.tgtype::integer & 2) <> 0      -- BEFORE
                   AND (t2.tgtype::integer & 16) <> 0),   -- UPDATE
                '⛔ egy sincs'),
       'VÁRT: …_kerulet_oszlopvedelem_trigger → …_updated_at_trigger (ábécé-sorrend). A SORREND SZÁNDÉKOSAN NEM SZÁMÍT: az updated_at az engedett oszlopok között van, tehát a másik trigger now()-ja nem buktatja meg az őrszemet.'

UNION ALL
SELECT 103, '2/A · 9. CSAPDA — AZ ENGEDETT LISTA',
       'Mely oszlopokat engedi a trigger a kerületi útvonalon?',
       'status, received_at, received_by, returned_reason, notes, unlock_requested, unlock_reason, unlock_requested_at, unlock_requested_by, updated_at',
       'MINDEN MÁS (snapshot_data, iktatoszam, submitted_at, submitted_by, doc_type, year, diocese_id, district_id, modification_number, id, created_at) TILTOTT — és minden KÉSŐBB hozzáadott oszlop is, automatikusan (engedélyezési lista + teljes to_jsonb összevetés). ⚠️ KETTŐN AZ ÉRTÉK IS KÖTÖTT: received_by CSAK auth.uid() (vagy NULL), unlock_requested_by kerületi úton CSAK NULL. A próbájuk a 3. szakasz (3) és (4) blokkja.'

-- ── 2/B · 10. csapda — a valódi lánc ────────────────────────────────────────
UNION ALL
SELECT 200, '2/B · 10. CSAPDA — KOMPOZIT FK',
       'Létrejött-e a dioceses UNIQUE (id, district_id)?',
       COALESCE((SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
                 WHERE c.conrelid = to_regclass('public.dioceses')
                   AND c.conname  = 'dioceses_id_district_id_uq'),
                '⛔ NINCS — a kompozit FK nem építhető meg'),
       'A kompozit FK előfeltétele. ⛔ NE dobd el: az eldobás magával vinné a felterjesztések lánc-ellenőrzését is.'

UNION ALL
SELECT 201, '2/B · 10. CSAPDA — KOMPOZIT FK',
       'Létrejött-e a (diocese_id, district_id) → dioceses(id, district_id) FK?',
       COALESCE((SELECT pg_get_constraintdef(c2.oid) FROM pg_constraint c2
                 WHERE c2.conrelid = to_regclass('public.diocese_felterjesztes')
                   AND c2.conname  = 'diocese_felterjesztes_dio_district_fkey'),
                '⛔ NINCS — egy esperes MA IS tetszőleges kerülethez küldhet fel'),
       'A 10. csapda lezárása. ON UPDATE/DELETE SZÁNDÉKOSAN NO ACTION — kerület-átsorolásnál HANGOSAN buk, mert a CASCADE átírná a múltat.'

UNION ALL
SELECT 202, '2/B · 10. CSAPDA — ADAT',
       'Maradt-e HAMIS district_id-jű felterjesztés?',
       (SELECT count(*)::text || ' db' FROM public.diocese_felterjesztes f
        JOIN public.dioceses d ON d.id = f.diocese_id
        WHERE d.district_id IS DISTINCT FROM f.district_id),
       'VÁRT: 0 db — az FK ezt mostantól már nem is engedné keletkezni. Ha mégis nem 0, az FK nem jött létre (lásd 201).'

UNION ALL
SELECT 203, '2/B · 10. CSAPDA — ADAT',
       'Maradt-e egyházkerület nélküli egyházmegye?',
       (SELECT count(*)::text || ' db' FROM public.dioceses d2 WHERE d2.district_id IS NULL),
       'VÁRT: 0 db. Ha nem 0, az 1. szakasz meg sem futott (az őrszem megállította) — töltsd ki a district_id-t, és futtasd újra.'

UNION ALL
SELECT 204, '2/B · 10. CSAPDA — REGRESSZIÓ',
       'Megmaradt-e a district_id NOT NULL-ja?',
       COALESCE((SELECT CASE WHEN c3.is_nullable='NO' THEN '✅ NOT NULL' ELSE '⛔ NULLABLE' END
                 FROM information_schema.columns c3
                 WHERE c3.table_schema='public' AND c3.table_name='diocese_felterjesztes'
                   AND c3.column_name='district_id'),
                '⛔ nincs ilyen oszlop'),
       '⛔ Ha valaha ⛔ lesz: a kompozit FK MATCH SIMPLE mellett a NULL-os sorokon VAKUUMOSAN teljesülne — ott lenne, de nem védene. Ez rosszabb, mintha nem lenne FK.'

UNION ALL
SELECT 205, '2/B · ⚠️ PGRST201-CSAPDA',
       'Hány idegen kulcs mutat a diocese_felterjesztes-ről a dioceses-re?',
       (SELECT count(*)::text || ' db → '
               || COALESCE(string_agg(c8.conname, ', ' ORDER BY c8.conname), '—')
        FROM pg_constraint c8
        WHERE c8.conrelid = to_regclass('public.diocese_felterjesztes')
          AND c8.contype  = 'f'
          AND c8.confrelid = to_regclass('public.dioceses')),
       'VÁRT: 2 db, és ez SZÁNDÉKOS — a második a 10. csapda javítása (kompozit FK), nem hiba, NE dobd el. ⚠️ ÁRA: a PostgREST nem tud választani a kettő közül, ezért MINDEN `select(''…, dioceses(name)'')` beágyazás PGRST201-gyel („more than one relationship was found") LEÁLL — 300-as hiba, nem üres adat. MA nem tör el semmit (a fogadó akció külön kérdezi le a megyeneveket), de az S4/S5 felületnek NÉMA CSAPDA. EGYÉRTELMŰSÍTS: `dioceses!diocese_felterjesztes_diocese_id_fkey(name)` VAGY külön lekérdezés + kódbeli párosítás.'

-- ── 2/C · A kerületi számvevő ──────────────────────────────────────────────
UNION ALL
SELECT 300, '2/C · SZÁMVEVŐI POLICY',
       'Létrejött-e a diocese_felterjesztes_kerulet_szamvevo_select?',
       COALESCE((SELECT 'USING: ' || COALESCE(pol.qual,'—')
                 FROM pg_policies pol
                 WHERE pol.schemaname='public' AND pol.tablename='diocese_felterjesztes'
                   AND pol.policyname='diocese_felterjesztes_kerulet_szamvevo_select'),
                '⛔ NINCS — a kerületi számvevő MA IS üres listát lát'),
       'A USING-ban a current_user_district_olvaso_ids()-nek kell szerepelnie (admin + szamvevo), COALESCE(…, ''{}'') fail-closed burokban.'

UNION ALL
SELECT 301, '2/C · SZÁMVEVŐI POLICY ⛔ REGRESSZIÓ',
       'A számvevő NEM kapott-e véletlenül ÍRÁSI jogot?',
       COALESCE((SELECT string_agg(pol2.policyname || ' [' || pol2.cmd || ']', ', ')
                 FROM pg_policies pol2
                 WHERE pol2.schemaname='public' AND pol2.tablename='diocese_felterjesztes'
                   AND pol2.cmd IN ('UPDATE','INSERT','DELETE','ALL')
                   AND COALESCE(pol2.qual,'') || COALESCE(pol2.with_check,'') LIKE '%district_olvaso%'),
                '✅ egy sem — a számvevő csak OLVAS'),
       '⛔ Ha bármit felsorol: valaki az OLVASÓ hatókört ÍRÁSI policy-ba tette. Az ellenőr nem írhatja azt, amit ellenőriz.'

UNION ALL
SELECT 302, '2/C · POLICY-KÉP',
       'A diocese_felterjesztes ÖSSZES policy-ja MOST',
       COALESCE((SELECT string_agg(pol3.policyname || ' [' || pol3.cmd || ']', ', ' ORDER BY pol3.policyname)
                 FROM pg_policies pol3
                 WHERE pol3.schemaname='public' AND pol3.tablename='diocese_felterjesztes'),
                '⛔ egy sincs'),
       'VÁRT 5: diocese_felterjesztes_all [ALL], _szamvevo_select [SELECT], _kerulet_select [SELECT], _kerulet_update [UPDATE], _kerulet_szamvevo_select [SELECT] (ÚJ).'

UNION ALL
SELECT 303, '2/C · GRANT',
       'Megvan-e mind a 3 függvény-GRANT az authenticated-nek?',
       -- pg_proc-alapú keresés (nem konstans regprocedure-cast) — lásd a 0/C-29
       -- sor magyarázatát: a konstans cast tervezéskor buktatná a lekérdezést.
       (SELECT count(*)::text || ' / 3'
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.pronargs = 0
          AND p.proname IN ('current_user_district_olvaso_ids',
                            'current_user_diocese_ids',
                            'current_user_has_global_access')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
       'VÁRT: 3/3. A trigger az utóbbi kettőt hívja, az új policy az elsőt. GRANT nélkül nem TAGADNÁNAK, hanem 403-mal HIBÁZNÁNAK.'

-- ── 2/D · Regresszió: a MEGYEI út sértetlen? ───────────────────────────────
UNION ALL
SELECT 400, '2/D · REGRESSZIÓ ⚠️',
       'Megvan-e MÉG a megyei ÍRÓ policy? (a felküldés útja)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies pol4
                         WHERE pol4.schemaname='public' AND pol4.tablename='diocese_felterjesztes'
                           AND pol4.policyname='diocese_felterjesztes_all')
            THEN '✅ megvan' ELSE '⛔ ELTŰNT — a megye NEM TUD felküldeni' END,
       'Ez a fájl NEM nyúlt hozzá. Ha eltűnt, más törölte — a rogzitDioceseFelterjesztes() némán 0 sort írna.'

UNION ALL
SELECT 401, '2/D · REGRESSZIÓ ⚠️',
       'Megvan-e MÉG a két meglévő kerületi policy?',
       (SELECT count(*)::text || ' / 2' FROM pg_policies pol5
        WHERE pol5.schemaname='public' AND pol5.tablename='diocese_felterjesztes'
          AND pol5.policyname IN ('diocese_felterjesztes_kerulet_select',
                                  'diocese_felterjesztes_kerulet_update')),
       'VÁRT: 2/2. Ez a fájl EGYIKHEZ SEM nyúlt — csak MELLÉJÜK tett.'

UNION ALL
SELECT 402, '2/D · REGRESSZIÓ',
       'Megmaradt-e a NÉGYoszlopos egyedi index? (7. csapda)',
       CASE WHEN to_regclass('public.diocese_felterjesztes_dio_tipus_ev_mod_uidx') IS NOT NULL
             AND to_regclass('public.diocese_felterjesztes_dio_tipus_ev_uidx') IS NULL
            THEN '✅ igen — a HÁROMoszlopos nincs'
            ELSE '⛔ nem stimmel — az 1. szakasz őrszeme megállt volna, tehát ez futás UTÁN nem fordulhat elő' END,
       'A rogzitDioceseFelterjesztes() onConflict-ja ezt a négyest használja: diocese_id, doc_type, year, modification_number.'

UNION ALL
SELECT 403, '2/D · REGRESSZIÓ',
       'RLS bekapcsolva + GRANT-kép változatlan?',
       COALESCE((SELECT CASE WHEN cl.relrowsecurity THEN 'RLS ✅  |  jogok: ' ELSE 'RLS ⛔  |  jogok: ' END
                 FROM pg_class cl WHERE cl.oid = to_regclass('public.diocese_felterjesztes')), '⛔ ')
       -- ⚠️ to_regclass, NEM konstans `::regclass` cast — lásd a 0/F-50 sor
       --    magyarázatát: a konstans cast tervezéskor buktatta volna az EGÉSZ
       --    2. szakaszt, és a sor eleji „⛔ " fallback sosem jelent volna meg.
       || COALESCE((SELECT string_agg(j.jog, ', ' ORDER BY j.jog)
                    FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS j(jog)
                    WHERE has_table_privilege('authenticated',
                            to_regclass('public.diocese_felterjesztes'), j.jog)), 'egy sem'),
       'VÁRT: RLS ✅ | jogok: INSERT, SELECT, UPDATE. DELETE SZÁNDÉKOSAN nincs — egy felterjesztés nem tűnhet el nyomtalanul.'

UNION ALL
SELECT 404, '2/D · MENTÉS',
       'Be van-e sorolva a diocese_felterjesztes a napi mentésbe?',
       CASE WHEN to_regclass('public.backup_table_policy') IS NULL
            THEN '⚠️ nincs backup_table_policy tábla'
            ELSE COALESCE((SELECT '✅ besorolva (hatokor=' || COALESCE(b.hatokor,'?') || ')'
                           FROM public.backup_table_policy b
                           WHERE b.tabla='diocese_felterjesztes' LIMIT 1),
                          '⚠️ NINCS besorolva — a napi mentés hangosan áll') END,
       'ÚJ TÁBLA NEM JÖTT LÉTRE, tehát új besorolás-sor nem kell (az uj-tablak.sql már besorolta). Kulcsoszlop: `tabla` (NEM table_name).'

-- ── 2/E · KÉZI PRÓBA (ezt EMBER csinálja, nem az SQL) ──────────────────────
UNION ALL
SELECT 900, '2/E · ⚠️ KÉZI PRÓBA',
       '1. Lépj be KERÜLETI SZÁMVEVŐ profillal (egyhazkeruleti_szamvevo)',
       'A FELTERJESZTÉSEKNEK MOSTANTÓL LÁTSZANIUK KELL',
       'Eddig ÜRES listát látott — nem hibát, hanem ürességet, ami „nincs beküldve"-nek látszott. Ha még mindig üres: a 2/C-300 és 2/C-303 sor a magyarázat (policy vagy GRANT).'

UNION ALL
SELECT 901, '2/E · ⚠️ KÉZI PRÓBA',
       '2. Ugyanő próbáljon ÁTVENNI vagy VISSZAKÜLDENI egy iratot',
       'EZT NEM SZABAD TUDNIA',
       'A számvevő ELLENŐR: olvas, de nem ír. Ha sikerül neki, valaki az olvasó hatókört írási policy-ba tette — a 2/C-301 sor méri.'

UNION ALL
SELECT 902, '2/E · ⚠️ KÉZI PRÓBA',
       '3. Lépj be MEGYEI profillal (esperes) → Pénzügy → véglegesítés és felküldés',
       'A FELKÜLDÉSNEK VÁLTOZATLANUL MŰKÖDNIE KELL',
       'EZ A LEGFONTOSABB REGRESSZIÓ-PRÓBA. A megye a SAJÁT során továbbra is írja a snapshot_data-t (a trigger 3. ága). Ha „a felterjesztett irat TARTALMA nem módosítható" hibát kapsz, a trigger megyei ága nem ismerte fel a hívót — AZONNAL szólj, ne kezdd el javítgatni.'

UNION ALL
SELECT 903, '2/E · ⚠️ KÉZI PRÓBA',
       '4. Kerület-átsorolás próbája (CSAK ha épp aktuális)',
       'A dioceses.district_id ÁTÍRÁSA HANGOSAN ELBUKIK, ha a megyének van felterjesztése',
       'Ez SZÁNDÉKOS (NO ACTION, nem CASCADE): a CASCADE átírná a múltat — egy már ÁTVETT irat némán átcsúszna a másik kerülethez. Ha valaha tényleg kell átsorolni, az tudatos, kézi rendezést érdemel.'

UNION ALL
SELECT 904, '2/E · ⚠️ KÉZI PRÓBA',
       '5. A HAMISÍTÁS-PRÓBA — a 3. szakasz (a fájl végén, kikommentezve)',
       'EZ BIZONYÍTJA, HOGY A 9. CSAPDA TÉNYLEG BE VAN ZÁRVA',
       'Egy tranzakcióban felveszi egy kerületi admin identitását, megpróbálja átírni a snapshot_data-t, és ROLLBACK-kel zár. VÁRT: „ERROR: 42501 … A felterjesztett irat TARTALMA nem módosítható". Ha ÁTMEGY, a trigger nem véd — azonnal szólj.'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SZAKASZ — OPCIONÁLIS KÉZI PRÓBA (a 9. csapda bizonyítéka)             ║
-- ║ VÉGIG KIKOMMENTEZVE. Csak akkor futtasd, ha kiveszed a `--` jeleket.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT KELL: a 2. szakasz csak azt bizonyítja, hogy a trigger LÉTEZIK. Azt,
-- hogy TÉNYLEG TILT, csak egy valódi próba mutatja meg. Ez a blokk felveszi egy
-- kerületi admin identitását (ahogy a PostgREST tenné), megpróbálja átírni a
-- fagyasztott iratot, és ROLLBACK-kel zár — vagyis SEMMIT nem hagy maga után.
--
-- ⚠️ A SQL Editorban a session `postgres`-ként fut, ahol auth.uid() NULL → a
--    trigger 1. ága ÁTENGEDNE. Ezért kell a `SET LOCAL ROLE authenticated` és a
--    `request.jwt.claims` beállítása: enélkül a próba HAMIS ZÖLDET adna.
--
-- ELŐKÉSZÜLET — írd be a két azonosítót:
--   (A) egy KERÜLETI ADMIN profil-azonosítója:
--         SELECT pr.profile_id, p.email
--         FROM public.profile_roles pr JOIN public.profiles p ON p.id = pr.profile_id
--         WHERE pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin'
--           AND pr.active AND pr.approval_status = 'approved';
--   (B) egy FELTERJESZTÉS azonosítója ABBAN a kerületben:
--         SELECT f.id, d.name AS megye, f.doc_type, f.year, f.status
--         FROM public.diocese_felterjesztes f JOIN public.dioceses d ON d.id = f.diocese_id;
--
-- ────────────────────────────────────────────────────────────────────────────
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims',
--                   json_build_object('sub', '<IDE-A-KERULETI-ADMIN-PROFILE-ID>',
--                                     'role', 'authenticated')::text,
--                   true);
--
-- -- (1) TILTOTT: az irat TARTALMÁNAK átírása. VÁRT: ERROR 42501.
-- UPDATE public.diocese_felterjesztes
--    SET snapshot_data = '{"hamisitott": true}'::jsonb
--  WHERE id = '<IDE-A-FELTERJESZTES-ID>';
--
-- ROLLBACK;
-- ────────────────────────────────────────────────────────────────────────────
--
-- Ha az (1) hibára futott, futtasd le KÜLÖN ezt is — ennek ÁT KELL MENNIE
-- (1 sor), különben a kerület nem tudná átvenni az iratot:
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims',
--                   json_build_object('sub', '<IDE-A-KERULETI-ADMIN-PROFILE-ID>',
--                                     'role', 'authenticated')::text,
--                   true);
--
-- -- (2) ENGEDETT: átvétel-nyugtázás. VÁRT: UPDATE 1.
-- UPDATE public.diocese_felterjesztes
--    SET status = 'received', received_at = now()
--  WHERE id = '<IDE-A-FELTERJESZTES-ID>';
--
-- ROLLBACK;
-- ────────────────────────────────────────────────────────────────────────────
--
-- ÉS A KÉT ÉRTÉK-KÖTÉS PRÓBÁJA (4a/1 és 4a/2). Az engedett listán MINDKÉT
-- oszlop rajta van — a lista csak azt mondja meg, MELYIK oszlop írható, azt
-- nem, MILYEN ÉRTÉKRE. Ez a két blokk bizonyítja, hogy az ÉRTÉK is kötött:
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims',
--                   json_build_object('sub', '<IDE-A-KERULETI-ADMIN-PROFILE-ID>',
--                                     'role', 'authenticated')::text,
--                   true);
--
-- -- (3) TILTOTT: „nem én vettem át, hanem a kollégám". VÁRT: ERROR 42501.
-- UPDATE public.diocese_felterjesztes
--    SET status = 'received', received_at = now(),
--        received_by = '<EGY MÁSIK, TETSZŐLEGES PROFILE-ID>'
--  WHERE id = '<IDE-A-FELTERJESZTES-ID>';
--
-- -- (4) TILTOTT: sosem történt megyei feloldás-kérés fabrikálása, amit aztán
-- --     maga bírálna el. VÁRT: ERROR 42501.
-- UPDATE public.diocese_felterjesztes
--    SET unlock_requested = true, unlock_reason = 'fabrikált',
--        unlock_requested_at = now(),
--        unlock_requested_by = '<BÁRMELYIK PROFILE-ID>'
--  WHERE id = '<IDE-A-FELTERJESZTES-ID>';
--
-- ROLLBACK;
-- ────────────────────────────────────────────────────────────────────────────



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE.                                                                    ║
-- ║ AMI MÉG HÁTRA VAN (NEM ebben a fájlban):                                 ║
-- ║  · App-oldal: a KERÜLETI FOGADÓ FELÜLET (S3) — a megyék felterjesztései,  ║
-- ║    átvétel-nyugtázás, visszaküldés KÖTELEZŐ indoklással, feloldás-kérés   ║
-- ║    elbírálása. A típusokat az apps/web/lib/finance/diocese-felterjesztes  ║
-- ║    .ts-ből kell átvenni, NEM újra definiálni.                            ║
-- ║  · A kerületi olvasó/író hatókör app-oldali feloldói:                     ║
-- ║    apps/web/lib/auth/level-scope.ts — canReadDistrictScope (a SZÁMVEVŐ is)║
-- ║    ⇄ canWriteDistrictScope (CSAK az admin) + describeDistrictWriteBlock.  ║
-- ║  · A felület a FAGYASZTOTT snapshot_data-ból dolgozzon (Endre K4): a      ║
-- ║    megyék könyveibe a kerület NEM lát bele. A megye NEVE (dioceses.name)  ║
-- ║    olvasható marad — az kell a „melyik megye küldte" felirathoz.          ║
-- ║  · S4: kerületi archívum + összesítő. S5: kerületi könyvelés/leltár (K2). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
