-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — A MENTÉS TÁBLA-BESOROLÁSÁNAK PÓTLÁSA
-- Fájl:     migration-docs/sql/2026-08-11-mentes-tabla-besorolas.sql
-- Dátum:    2026-08-11
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
--
-- ─── ELŐFELTÉTEL ────────────────────────────────────────────────────────────
--  ELŐBB fusson le: migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
--  (az hozza létre a `backup_table_policy` táblát és a 7 mentés-RPC-t).
--
-- ─── MIÉRT KELL EZ A FÁJL ───────────────────────────────────────────────────
--  A mentés-rendszer FAIL-CLOSED: amíg akár EGY élő tábla besorolatlan, a napi
--  mentés EL SEM INDUL. Ez szándékos — a néma kihagyás a legrosszabb kimenet.
--  A telepítés utáni ellenőrzés HÁROM dolgot talált:
--
--    40-es sor: 17 BESOROLATLAN élő tábla
--               (_merge_run_log, event, logger + 14 mm_* tábla)
--    41-es sor: a `documents` gyülekezeti hatókörű, de NINCS RÉTEGE
--               → mentenénk, de visszaállítani nem tudnánk
--    93-as sor: RÉTEG-INVERZIÓ
--               congregation_remarks (R2) → congregation_transfers (R7)
--
--  Ez a fájl mind a hármat lezárja. MINDEN besorolás indoklása ott áll a saját
--  sora mellett — a besorolás dönti el, mi kerül a lelkész mentésébe és mi nem,
--  ezért egyetlen sor sem maradhat indoklás nélkül.
--
-- ─── ⚠️ NEGYEDIK, AZ ELLENŐRZŐ LEKÉRDEZÉS ÁLTAL NEM LÁTOTT HIBA ─────────────
--  A `congregation_transfers` besorolása `join_predikatum`-ként
--  `t.source_congregation_id = $1`-et kapott — DE A TÁBLÁNAK NINCS ILYEN
--  OSZLOPA. Az oszlopai: `congregation_id`, `from_user_id`, `to_user_id`
--  (2026-06-05g-congregation-transfers.sql:22-48). A `source_congregation_id`
--  a `member_transfer_notifications`-é (2026-04-30d), ott helyes.
--
--  Következmény: a `backup_count_table` 42703 (undefined_column) hibára futott
--  volna, azaz — pontosan úgy, mint a 2026-08-11-i member_accounts-ügyben —
--  EGYETLEN GYÜLEKEZETI MENTÉS SEM KÉSZÜLT VOLNA EL. A 42-es/92-es ellenőrzés
--  ezt NEM fogja meg: az csak a HIÁNYZÓ (NULL) szűrőt nézi, a HIBÁSAT nem.
--  A javítás itt van, mert ugyanezt a sort a réteg-inverzió miatt úgyis írjuk.
--
-- ─── A HÁROM DÖNTÉSI ELV, AMI ALAPJÁN BESOROLTUNK ───────────────────────────
--  1) Ami a lelkész gyülekezetéhez tartozik, az a GYÜLEKEZETI mentésbe megy.
--  2) Ami közös, gyülekezetek FÖLÖTTI tartalom, az a GLOBÁLIS mentésbe megy —
--     és NEM a gyülekezetibe. Ha bekerülne, ugyanaz a közösségi tartalom 495
--     fájlban sokszorozódna, és minden lelkész mentése tartalmazná a TÖBBI
--     gyülekezet lelkészeinek írásait. Ez adatvédelmi kérdés, nem csak méret.
--     ⚖️ A Missziós Műhelyre (mm_*) nézve ez TULAJDONOSI DÖNTÉS, 2026-08-11 —
--        a részletes indoklás az 1. SZAKASZ elején lévő keretes szövegben.
--  3) Amit egyáltalán nem mentünk, az EXPLICIT, megnevezett, indokolt kihagyás
--     (`kizart_egyeb`) — soha nem néma hiány.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed: hiányzó előfeltételnél MEGÁLL)
-- ════════════════════════════════════════════════════════════════════════════
-- A migration-fájl megléte NEM bizonyíték a lefutásra. Mielőtt bármit írnánk,
-- bizonyítjuk, hogy a besorolási tábla és a javítandó oszlopok TÉNYLEG ott
-- vannak. Ha nem, inkább el sem indulunk.
DO $szakasz0$
DECLARE
  v_hianyzo text[] := '{}';
  v_t       text;
BEGIN
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.backup_table_policy. Előbb futtasd le a migration-docs/sql/2026-08-11-biztonsagi-mentes.sql fájlt.';
  END IF;

  -- A `congregation_transfers` szűrőjét `t.congregation_id = $1`-re (az
  -- alapértelmezettre) állítjuk. Ha ez az oszlop nem létezne, a javítás
  -- ugyanabba a 42703-as hibába vinne, amit meg akarunk szüntetni.
  IF to_regclass('public.congregation_transfers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'congregation_transfers'
         AND column_name = 'congregation_id'
     ) THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: a public.congregation_transfers táblának nincs congregation_id oszlopa. Az alapértelmezett gyülekezet-szűrő nem alkalmazható rá — kézi vizsgálat kell.';
  END IF;

  -- A `documents` gyülekezeti hatókörű, saját szűrő nélkül → kell neki
  -- congregation_id, különben a 92-es ellenőrzés (és a mentés) elhasal.
  IF to_regclass('public.documents') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'documents'
         AND column_name = 'congregation_id'
     ) THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: a public.documents táblának nincs congregation_id oszlopa. Ekkor nem sorolható be gyülekezeti hatókörbe saját szűrő nélkül.';
  END IF;

  -- TÁJÉKOZTATÓ: melyik besorolandó tábla nincs (már) élesben? Ez NEM hiba —
  -- a policy-sor akkor is felvehető, az ellenőrzések élő táblához kötnek.
  FOREACH v_t IN ARRAY ARRAY[
    'public._merge_run_log','public.event','public.logger','public.documents',
    'public.mm_otletek','public.mm_otlet_kategoriak','public.mm_otlet_cimkek',
    'public.mm_szavazatok','public.mm_hozzaszolasok','public.mm_feladatok',
    'public.mm_merfoldkovek','public.mm_dokumentumok','public.mm_bookmarks',
    'public.mm_segedanyag_kategoriak','public.mm_segedanyag_ertekelesek',
    'public.mm_felhasznalo_jelveny','public.mm_felhasznalo_statisztika',
    'public.mm_jutalom_esemenyek'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      v_hianyzo := v_hianyzo || v_t;
    END IF;
  END LOOP;

  IF array_length(v_hianyzo, 1) > 0 THEN
    RAISE NOTICE 'TÁJÉKOZTATÓ: ez(ek) a tábla(k) ma nincsenek élesben: %. A besorolásuk így ártalmatlan marad.',
      array_to_string(v_hianyzo, ', ');
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben — az előfeltételek megvannak.';
END
$szakasz0$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 1 — MISSZIÓS MŰHELY (mm_*): GLOBÁLIS, NEM GYÜLEKEZETI
-- ════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚖️ TULAJDONOSI DÖNTÉS — 2026-08-11. EZ NEM TERVEZŐI FELTÉTELEZÉS.        ║
-- ║                                                                          ║
-- ║ A kérdés az volt: a 14 mm_* tábla GYÜLEKEZETHEZ tartozó tartalom-e,      ║
-- ║ vagy KÖZÖSSÉGI? A tulajdonos döntése: KÖZÖSSÉGI. Ebből következően:      ║
-- ║                                                                          ║
-- ║  · a mm_* táblák a GYÜLEKEZETENKÉNTI mentésbe NEM kerülnek bele —        ║
-- ║    egy gyülekezet mentése az adott gyülekezet adata; a közösségi műhely   ║
-- ║    tartalma nem az övé, és 495 fájlba másolva MÁS FELHASZNÁLÓK tartalmát  ║
-- ║    duplikálná, ami adatvédelmi kérdés is;                                ║
-- ║  · a RENDSZERSZINTŰ (globális) mentésbe viszont TELJES EGÉSZÉBEN bele     ║
-- ║    KELL kerülniük — különben a műhely tartalma SEHOL nem lenne mentve,    ║
-- ║    és pont az veszne el, amit senki nem tud újra előállítani: az          ║
-- ║    ötletek, a hozzászólások, a szavazatok, a segédanyagok.               ║
-- ║                                                                          ║
-- ║ ⛔ EZT NE „JAVÍTSD VISSZA" gyülekezeti hatókörre. Ha valaki mégis erre    ║
-- ║    készül, előbb kérdezze meg a tulajdonost — ez az ő döntése volt.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A döntést az alábbi két, egymástól független bizonyíték is alátámasztja:
--
--  (a) SÉMA. A tizennégy tábla közül EGYETLENEGYNEK SINCS `congregation_id`
--      oszlopa és egyiknek sincs FK-ja a `congregations` felé. A kulcsuk vagy
--      `auth.users(id)` (felhasználó-szintű), vagy `mm_otletek(id)` /
--      `mm_segedanyagok(id)` (közös tartalom). Ezért is maradtak besorolatlanul:
--      a 2026-08-11-biztonsagi-mentes.sql 3/h automatikus feltöltése kizárólag
--      a `congregation_id` oszlopos táblákat találta meg.
--
--  (b) SZÁNDÉK. A 2026-04-12-missziós-muhely-rls.sql fejléce kimondja:
--      „A Missziós Műhely egy KÖZÖS TÉR, ahol MINDEN bejelentkezett lelkész
--       látja egymás tartalmait, DE csak a saját tartalmait módosíthatja."
--      Az RLS ennek megfelelően olvasásra `USING (true)`, írásra `auth.uid()`.
--
-- ⛔ MIÉRT NEM GYÜLEKEZETI: az `mm_otletek.otletgazda_gyulekezet` és az
--    `mm_hozzaszolasok.user_gyulekezet` CSAK SZÖVEGES pillanatkép a megjelenítés
--    kedvéért — se FK, se egyediség, se kitöltési garancia. Ugyanaz a hibaosztály,
--    ami miatt a `monetar` kimaradt: „gyülekezethez megbízhatóan NEM rendelhető".
--    Ha erre a szövegre szűrnénk, az elgépelt vagy időközben átnevezett
--    gyülekezetek tartalma NÉMÁN kimaradna.
--
-- ⛔ MIÉRT NEM MEGY MINDENKI MENTÉSÉBE: ha a közös tartalom minden gyülekezeti
--    fájlba bekerülne, akkor (1) 495-ször sokszorozódna, és (2) minden lelkész
--    mentése tartalmazná a TÖBBI lelkész ötleteit, hozzászólásait, pontszámait.
--    Egy kiszivárgott gyülekezeti mentés így az egész ország Missziós Műhelyét
--    kiadná. Ez adatvédelmi kérdés — nem méretezési.
--
-- ✅ A TARTALOM NEM VÉSZ EL: a `globalis` hatókör azt jelenti, hogy a
--    RENDSZERGAZDAI (globális) mentésbe kerül, pontosan egyszer. Ott már ott van
--    a három mm-törzstábla is (mm_kategoriak, mm_jelveny_tipusok,
--    mm_segedanyagok, mind R0) — ez a besorolás azokhoz illeszkedik.
--
-- `visszaallithato = false`: a GOMBBAL indított gyülekezeti visszaállítás SOHA
-- nem nyúlhat közös, gyülekezetek fölötti tartalomhoz — egyetlen gyülekezet
-- visszaállítása nem törölheti más lelkészek írásait. Ez az összes `globalis`
-- soron így van; a globális helyreállítás RUNBOOK, nem kattintás.
--
-- RÉTEGEK — a VALÓDI FK-gráfból (szülő előbb, gyerek utána):
--   R0 = nincs FK-ja másik public táblához (csak auth.users)
--   R1 = van FK-ja egy R0-ás mm-táblához
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES

 -- ─── R0 — gyökér: csak auth.users-re mutat ─────────────────────────────────
 ('mm_otletek','globalis',NULL,0,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): Missziós Műhely ÖTLET — KÖZÖS, gyülekezetek fölötti tartalom. Nincs congregation_id; egyetlen FK-ja otletgazda_id → auth.users. Az otletgazda_gyulekezet CSAK szöveges pillanatkép, szűrésre alkalmatlan. Globális mentésbe, R0 (nincs public-szülője).'),

 ('mm_felhasznalo_statisztika','globalis',NULL,0,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): FELHASZNÁLÓ-szintű MM-pontösszesítő (PK = user_id → auth.users). Nem a gyülekezeté, hanem a lelkészé, és több gyülekezetben szolgáló lelkésznél is EGY sor. Globális mentésbe, R0.'),

 ('mm_jutalom_esemenyek','globalis',NULL,0,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): MM idempotens jutalomnapló (2026-07-12-mm-jutalmazas-atomikus.sql). user_id → auth.users, nincs congregation_id. Ez tartja, hogy egy forrásesemény felhasználónként egyszer pontozható — gyülekezetenként szétvágva a duplikátum-védelme értelmét vesztené. Globális mentésbe, R0.'),

 -- ─── R1 — az R0-ás mm-táblákra épül ────────────────────────────────────────
 ('mm_otlet_kategoriak','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): ötlet ⇄ kategória kapcsolótábla. KOMPOZIT PK (otlet_id, kategoria_id); FK: mm_otletek(R0) + mm_kategoriak(R0). Közös tartalom → globális, R1.'),

 ('mm_otlet_cimkek','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): ötlet szabad címkéi. FK: otlet_id → mm_otletek(R0). Közös tartalom → globális, R1.'),

 ('mm_szavazatok','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): támogatás/csatlakozás egy közös ötletre. FK: mm_otletek(R0) + auth.users. Egy gyülekezet mentésébe véve az ország összes lelkészének szavazata bekerülne → globális, R1.'),

 ('mm_hozzaszolasok','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): FÓRUM-hozzászólás közös ötlethez, ÖN-FK-val (szulo_id → mm_hozzaszolasok, válaszlánc). A user_gyulekezet csak szöveges pillanatkép. Más lelkészek írásai NEM kerülhetnek a lelkész gyülekezeti mentésébe → globális, R1.'),

 ('mm_feladatok','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): a közös munkába vett ötlet feladatai. FK: mm_otletek(R0) + felelos_id → auth.users. A felelős akárMELYIK gyülekezetből jöhet → globális, R1.'),

 ('mm_merfoldkovek','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): a közös ötlet mérföldkövei. FK: otlet_id → mm_otletek(R0). Globális, R1.'),

 ('mm_dokumentumok','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): az ötlethez csatolt fájlok METAADATA (url + méret). FK: mm_otletek(R0) + feltolto_id → auth.users. A fájl maga tárolóban van, a mentésben (v1) nincs benne. Globális, R1.'),

 ('mm_bookmarks','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): FELHASZNÁLÓ könyvjelzői közös ötletre/segédanyagra. FK: auth.users + mm_otletek(R0) + mm_segedanyagok(R0). A lelkészé, nem a gyülekezeté → globális, R1.'),

 ('mm_segedanyag_kategoriak','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): segédanyag ⇄ kategória kapcsolótábla. KOMPOZIT PK; FK: mm_segedanyagok(R0) + mm_kategoriak(R0). A szülő mm_segedanyagok már globális R0 volt — ez oda tartozik. R1.'),

 ('mm_segedanyag_ertekelesek','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): közös segédanyag 1-5 csillagos értékelése + vélemény. FK: mm_segedanyagok(R0) + auth.users. Globális, R1.'),

 ('mm_felhasznalo_jelveny','globalis',NULL,1,false,
  '2026-08-11 — TULAJDONOSI DÖNTÉS (a Missziós Műhely KÖZÖSSÉGI, nem gyülekezeti; a globális mentésbe megy, a gyülekezetibe NEM — ne sorold vissza): a lelkész elnyert MM-jelvényei. FK: auth.users + mm_jelveny_tipusok(R0). Személyhez, nem gyülekezethez kötött → globális, R1.')

ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;
-- ⚠️ `DO UPDATE`, NEM `DO NOTHING`. Egy MÁR TELEPÍTETT adatbázisban a
--    `DO NOTHING` néma nulla-művelet lenne, és a hiba maradna — pontosan ez
--    volt a 2026-08-11-biztonsagi-mentes.sql 3/i szakaszának tanulsága.


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 2 — A HÁROM „ÁRVA" TÁBLA: logger, event, _merge_run_log
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 2/a) logger — MENTJÜK (globális), de SOHA nem állítjuk vissza ──────────
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('logger','globalis',NULL,1,false,
  '2026-08-11: A SUPABASE ELŐTTI alkalmazás VÁLTOZÁS-NAPLÓJA. Oszlopai: name, operation, changes, tblname, tblid, username(varchar!), computer, created — vagyis nem uuid-alapú, hanem a régi asztali kliens gépnév/felhasználónév párosát őrzi. NINCS congregation_id és NINCS FK: gyülekezethez rendelni nem lehet. A teljes kódbázisban (apps, packages, supabase, migrációk) EGYETLEN írás sem hivatkozik rá — befagyott történeti adat. MÉGIS MENTJÜK: valódi rekordok változás-története, a néma elvesztése visszafordíthatatlan. A mintája az audit_log (globalis, R1, visszaallithato=false): a globális, rendszergazdai mentésbe kerül, és egy visszaállítás SOHA nem írhatja felül a rendszer emlékezetét. Van elsődleges kulcsa (id), tehát a kulcs-alapú lapozás rendben van.')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;

-- ─── 2/b) event — EXPLICIT, MEGNEVEZETT KIHAGYÁS ───────────────────────────
-- ⚠️ EZ NEM NÉMA KIHAGYÁS, HANEM KIMONDOTT DÖNTÉS — és van egy KEMÉNY, TECHNIKAI
--    OKA IS, amit ki kell mondani:
--
--    A táblának NINCS ELSŐDLEGES KULCSA (oszlopai: type, val, created).
--    A `backup_dump_table` kulcs-alapú lapozása ilyenkor `ctid`-re esik vissza,
--    ami egy HOT-update-nél elmozdulhat — a 2026-08-11-biztonsagi-mentes.sql
--    44-es ellenőrzése éppen ezért kéri, hogy PK NÉLKÜLI MENTENDŐ tábla NE
--    LEGYEN. Ha ezt a táblát `globalis`-ra sorolnánk, a 44-es ellenőrzés
--    AZONNAL pirosra váltana. Egy üres, halott táblát nem éri meg így megvenni.
--
--    A tartalmi indokok (2026-08-10-nyitott-rls-policyk-takaritas.sql 0h + 7/b):
--      · a 0h. lekérdezés élesben ÜRESNEK találta (0 sor),
--      · nincs congregation_id és nincs FK — tenant-kapcsolat nem vezethető le,
--      · a teljes kódbázisban (apps/web, apps/desktop, packages, supabase/
--        functions, scripts, sőt a legacy source-links JS) EGYETLEN lekérdezés
--        sem hivatkozik rá,
--      · a 2026-04-15-sync-tracking.sql a Supabase előtti alkalmazás
--        append-only naplói közé sorolja (import_logs, logger, event),
--      · az `event_read` nyitott policy 2026-08-10-én eltávolítva, a jogok
--        visszavonva.
--
-- ⚠️ HA VALAHA MÉGIS ÍRNI KEZDENÉNK BELE: ez a sor `kizart_egyeb`-en tartaná,
--    vagyis az új adat NÉMÁN kimaradna. Ezért mondjuk ki: ennek a táblának a
--    HELYES SORSA A TÖRLÉS, nem a mentés. Ez a fájl SZÁNDÉKOSAN NEM ejti el —
--    a törlés külön, tudatos döntés, külön futtatással.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('event','kizart_egyeb',NULL,NULL,false,
  '2026-08-11: EXPLICIT KIHAGYÁS. Üres, PK NÉLKÜLI legacy tábla (type/val/created) a Supabase előtti alkalmazásból; nincs congregation_id, nincs FK, a kódbázis sehol nem hivatkozik rá, a nyitott olvasási policy-ja 2026-08-10-én megszűnt. PK nélkül mentendő táblaként a 44-es ellenőrzést is elbuktatná. NEM néma hiány: ez a sor MAGA a döntés. Javaslat: a tábla eldobandó (külön futtatással).')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;

-- ─── 2/c) _merge_run_log — EXPLICIT, MEGNEVEZETT KIHAGYÁS ──────────────────
-- A 2026-04-26-FIX-merge-spouses-v4-no-temp.sql SEGÉDTÁBLÁJA. A szkript
-- fejléce szó szerint így indokolja: „A v4 perszisztens táblát használ:
-- `_merge_run_log` — ez minden futás után DROP-olódik a script végén." Vagyis
-- MÁR MOST IS EGY ELMARADT TAKARÍTÁS NYOMA: a szkript saját szándéka szerint
-- nem kellene léteznie.
--
-- Oszlopai (phase, ferj_csalad_id, no_csalad_id, action, notes): egy egyszeri
-- adatjavító futás diagnosztikája. NINCS congregation_id és NINCS FK — a benne
-- lévő csalad-azonosítók bármelyik gyülekezethez tartozhatnak, tehát
-- gyülekezethez rendelni nem lehet.
--
-- ⚠️ MIÉRT NEM VESZÍTÜNK VELE SEMMIT: amit ez a tábla LEÍR (mely családok
--    kerültek összevonásra), az EREDMÉNYÉBEN benne van a `csalad` és a
--    `szemely` táblában — mindkettő mentve van (R4, illetve R3). Ez a napló
--    csak a művelet melléktermékének a jegyzőkönyve, nem lelkipásztori adat.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('_merge_run_log','kizart_egyeb',NULL,NULL,false,
  '2026-08-11: EXPLICIT KIHAGYÁS. Egyszeri adatjavító szkript (2026-04-26-FIX-merge-spouses-v4-no-temp.sql) segédtáblája, amit a szkript saját fejléce szerint a futás végén DROP-olni kellett volna. Nincs congregation_id, nincs FK; a benne szereplő csalad-azonosítók bármely gyülekezethez tartozhatnak. Amit rögzít, annak EREDMÉNYE a mentett csalad/szemely táblákban van. NEM lelkipásztori tartalom. Javaslat: a tábla eldobandó (külön futtatással).')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 3 — `documents`: RÉTEG PÓTLÁSA (41-es ellenőrzés)
-- ════════════════════════════════════════════════════════════════════════════
-- MI EZ: a 2026-04-23-m0-6-documents-schema.sql (M0.6) hozta létre — az E2E
-- titkosított dokumentumtár METAADATA. A ciphertext a Supabase Storage
-- `documents-encrypted` bucketjében, a fájlnév titkosítva (filename_encrypted),
-- a dekódoló kulcs (DEK) eszközönként a `document_keys` táblában.
--
-- HOVÁ TARTOZIK — AZ IDEGEN KULCSAI SZERINT:
--   owner_id       → auth.users(id)            (más séma, nem rétegez)
--   congregation_id→ public.congregations(id)  (R1, `globalis` — a bérlő-váz)
--   deleted_by     → auth.users(id)
-- Egyetlen GYÜLEKEZETI hatókörű szülője SINCS, tehát rétegtől függetlenül
-- bárhová tehető. R7-et kap, mert a jelentése és a viselkedése azonos az
-- `iktato_csatolmany`-éval (R7): a sor metaadat, a FÁJL a tárolóban van és a
-- mentésben (v1) nincs benne.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ EZÉRT `visszaallithato = false` — OLVASD EL, MIELŐTT `true`-RA ÁLLÍTANÁD
-- ════════════════════════════════════════════════════════════════════════════
-- A `document_keys.document_id` FK-ja `ON DELETE CASCADE`-del mutat ide, és a
-- `document_keys` a mentésből SZÁNDÉKOSAN KIZÁRT (`kizart_titok`).
--
-- A visszaállítás táblánként `DELETE … WHERE <gyülekezet-szűrő>` + újra-INSERT
-- (2026-08-11-visszaallitas.sql:791). Ha a `documents` visszaállítható lenne,
-- ez a DELETE KASZKÁDBAN elvinné az adott gyülekezet ÖSSZES DEK-jét — amiket
-- soha nem mentettünk, tehát VISSZAHOZHATATLANUL. A sorok utána ugyanazzal az
-- id-vel visszakerülnének, a hozzájuk tartozó titkosított fájlok viszont ÖRÖKRE
-- OLVASHATATLANNÁ válnának. A darabszám-egyeztetés ezt NEM venné észre: a
-- `document_keys` nincs a számolt táblák között.
--
-- Vagyis egy „sikeres", zöld visszaállítás NÉMÁN megsemmisítené a
-- dokumentumtárat. Pontosan az a kimenet, amit a rendszer B alapelve tilt.
--
-- Ezért: MENTJÜK (a metaadat megvan és a globális képben is szerepel), de a
-- gombbal indított visszaállítás HOZZÁ SEM NYÚL — ugyanaz a minta, mint az
-- audit-naplóknál (member_portal_audit_log, family_link_audit: R7, false).
--
-- ⚠️ EGY MARADÉK, AMIT KI KELL MONDANI: a `documents.congregation_id`
--    NULLÁZHATÓ. A csak személyes (congregation_id IS NULL) dokumentumok így
--    EGYETLEN gyülekezeti mentésbe sem kerülnek bele. Ez a rendszer meglévő,
--    általános tulajdonsága (ugyanez áll pl. a member_portal_audit_log-ra is),
--    nem ez a fájl vezeti be — de nem is hallgatjuk el.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('documents','gyulekezet',NULL,7,false,
  '2026-08-11: RÉTEG PÓTOLVA (41-es ellenőrzés). E2E titkosított dokumentumtár METAADATA (M0.6); a ciphertext a Storage documents-encrypted bucketjében, a mentésben (v1) nincs benne — ugyanaz a helyzet, mint az iktato_csatolmany-nál, ezért R7. Nincs gyülekezeti hatókörű szülője (FK-i: auth.users + congregations). visszaallithato = FALSE, mert a document_keys ON DELETE CASCADE-del mutat ide, és az KIZART_TITOK: egy visszaállítás DELETE-je némán elvinné a gyülekezet összes DEK-jét, amit soha nem mentettünk — a fájlok örökre olvashatatlanná válnának, és a darabszám-egyeztetés ezt nem venné észre. FIGYELEM: a congregation_id nullázható, a csak személyes dokumentumok egyik gyülekezeti mentésbe sem kerülnek bele.')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 4 — A RÉTEG-INVERZIÓ FELOLDÁSA (93-as ellenőrzés)
-- ════════════════════════════════════════════════════════════════════════════
-- A TALÁLAT:  congregation_remarks (R2) → congregation_transfers (R7)
--             azaz a GYEREK ALACSONYABB rétegben ült, mint a SZÜLŐJE.
--
-- A VALÓDI FK (2026-06-05g-congregation-transfers.sql:60-70):
--     congregation_remarks.transfer_id → congregation_transfers(id) ON DELETE SET NULL
-- Tehát KÉTSÉGTELEN: a `congregation_remarks` a gyerek, a
-- `congregation_transfers` a szülő. A szülőnek kell ELŐBB jönnie.
--
-- ─── MELYIK OLDAL A HIBÁS? A `congregation_transfers` R7-e ─────────────────
-- Az R7-et onnan kapta, hogy a 3/f („KÉTOLDALÚ HATÓKÖRŰ táblák") szakaszba
-- került, a cross_congregation_match_notifications és a
-- member_transfer_notifications mellé. CSAKHOGY EZ TÉNYBELI TÉVEDÉS:
--
--   · a `member_transfer_notifications` VALÓBAN kétoldalú: van
--     `source_congregation_id` ÉS `target_congregation_id` (2026-04-30d:49),
--   · a `congregation_transfers` viszont EGYETLEN gyülekezetről szól — a
--     LELKÉSZCSERÉRŐL. Két oldala két SZEMÉLY (`from_user_id`, `to_user_id`),
--     nem két gyülekezet. Az egyetlen gyülekezet-oszlopa a `congregation_id`.
--
-- Ebből következik a fájl elején jelzett NEGYEDIK HIBA is: a besoroláskor kapott
-- `t.source_congregation_id = $1` szűrő OLYAN OSZLOPRA hivatkozik, AMI NINCS.
-- A `backup_count_table` 42703-mal elhasalt volna → EGYETLEN GYÜLEKEZETI MENTÉS
-- SEM KÉSZÜLT VOLNA EL. A 92-es ellenőrzés ezt nem látja: az csak a NULL szűrőt
-- keresi, a HIBÁSAT nem. Itt MINDKETTŐT javítjuk, egy sorban.
--
-- ─── AZ ÚJ BESOROLÁS ───────────────────────────────────────────────────────
--   congregation_transfers → R2, join_predikatum = NULL (alapértelmezett
--       `t.congregation_id = $1`). R2, mert a gyülekezet SAJÁT, alapszintű
--       állapota — pontosan oda, ahol a testvére, a `congregation_pastor_history`
--       is van (R2). Egy lelkészcsere-folyamat nem függ se személytől, se
--       pénzügytől, se naplótól.
--   congregation_remarks   → R7. A „meghagyás" az átadás-ellenőrzéskor tett
--       ÉSZREVÉTEL: egy jegyzet, ami az átadási sorra hivatkozik. Természetes
--       helye a naplók/jegyzetek rétege (R7), és így a szülője (R2) BIZTOSAN
--       előbb jön.
--
-- ─── A LÁNC ELLENŐRZÉSE (nem elég „megbökni" a számot) ─────────────────────
--   congregation_transfers SZÜLŐI: congregations (globalis), auth.users
--       → egyetlen `gyulekezet` hatókörű szülője sincs, R2 szabadon adható.
--   congregation_transfers GYEREKEI: KIZÁRÓLAG congregation_remarks
--       (a teljes migrációs törzsben ez az EGYETLEN
--        `REFERENCES public.congregation_transfers`).  R2 < R7 ✅
--   congregation_remarks SZÜLŐI: congregations (globalis),
--       congregation_transfers (R2), auth.users.                R2 < R7 ✅
--   congregation_remarks GYEREKEI: NINCS (semmi nem hivatkozik rá) ✅
--   → új inverzió sem itt, sem máshol nem keletkezik. A fájl végi ellenőrzés
--     ezt nem hiszi el, hanem ÚJRA VÉGIGMÉRI a teljes FK-gráfon.
--
-- Megjegyzés: a `backup_restore_order()` amúgy is a futásidejű FK-gráfból
-- rendez, tehát a sorrend enélkül is helyes lett volna. A `reteg` viszont AZ
-- EMBERI OLVASAT — ha az mást mond, mint a valóság, a következő olvasó rossz
-- következtetést von le belőle. Ezért javítjuk.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES

 ('congregation_transfers','gyulekezet',NULL,2,true,
  '2026-08-11: KÉTSZERESEN JAVÍTVA. (1) A join_predikatum `t.source_congregation_id = $1` volt — ILYEN OSZLOP NINCS: a tábla egyetlen gyülekezet-oszlopa a congregation_id (2026-06-05g:22-48), a source_congregation_id a member_transfer_notifications-é. A hibás szűrő 42703-mal elhasalt volna, azaz EGYETLEN gyülekezeti mentés sem készült volna el; most az alapértelmezett `t.congregation_id = $1` szűrőt kapja (join_predikatum = NULL). (2) NEM kétoldalú tábla: a lelkészcsere két oldala két SZEMÉLY (from_user_id / to_user_id), nem két gyülekezet. R7 → R2, a testvére (congregation_pastor_history, R2) mellé, hogy a gyereke (congregation_remarks) BIZTOSAN utána jöjjön.'),

 ('congregation_remarks','gyulekezet',NULL,7,true,
  '2026-08-11: RÉTEG-INVERZIÓ FELOLDVA (93-as ellenőrzés). A transfer_id → congregation_transfers(id) FK miatt ez a GYEREK, tehát nem lehet a szülője alatt. Tartalmilag is ide való: az átadás-ellenőrzéskor tett észrevétel („meghagyás") egy jegyzet, a naplók/jegyzetek rétege az R7. R2 → R7. Semmi nem hivatkozik rá, így új inverziót nem okoz.')

ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === VISSZAVONÁS (ROLLBACK) — CSAK HA VISSZA KELL CSINÁLNI ===
-- ⚠️ FIGYELEM: ez visszaállítja a besorolatlan állapotot, vagyis A NAPI MENTÉS
--    ÚJRA NEM FOG ELINDULNI (40-es ellenőrzés), és a congregation_transfers
--    visszakapja a NEM LÉTEZŐ oszlopra hivatkozó szűrőt. Csak akkor futtasd,
--    ha bizonyítottan ez a fájl okozott bajt.
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   -- 1) A 17 pótolt besorolás törlése
--   DELETE FROM public.backup_table_policy WHERE tabla IN (
--     'mm_otletek','mm_felhasznalo_statisztika','mm_jutalom_esemenyek',
--     'mm_otlet_kategoriak','mm_otlet_cimkek','mm_szavazatok','mm_hozzaszolasok',
--     'mm_feladatok','mm_merfoldkovek','mm_dokumentumok','mm_bookmarks',
--     'mm_segedanyag_kategoriak','mm_segedanyag_ertekelesek','mm_felhasznalo_jelveny',
--     'logger','event','_merge_run_log'
--   );
--   -- 2) documents — vissza réteg nélkülire (mentjük, de visszaállítani nem)
--   UPDATE public.backup_table_policy
--      SET reteg = NULL, visszaallithato = true,
--          megjegyzes = 'AUTOMATIKUS besorolás (van congregation_id oszlopa). A RÉTEG hiányzik: mentjük, de visszaállítani csak besorolás után lehet.'
--    WHERE tabla = 'documents';
--   -- 3) A réteg-inverzió és a hibás szűrő visszaállítása (EREDETI, HIBÁS állapot)
--   UPDATE public.backup_table_policy
--      SET reteg = 2, join_predikatum = NULL, megjegyzes = NULL
--    WHERE tabla = 'congregation_remarks';
--   UPDATE public.backup_table_policy
--      SET reteg = 7, join_predikatum = 't.source_congregation_id = $1',
--          megjegyzes = 'KÉTOLDALÚ: a FORRÁS oldal menti.'
--    WHERE tabla = 'congregation_transfers';
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- A Supabase SQL Editor CSAK AZ UTOLSÓ eredményt mutatja. Ez a projektnek eddig
-- HÁROM elveszett választásába került, ezért minden ellenőrzés EGYBEN van.
--
-- OLVASÁSI SORREND:
--   1-9   : a három lezárt hiány + a negyedik (hibás szűrő) állapota
--   10-19 : nem keletkezett-e ÚJ baj (PK, szűrő, inverzió)
--   20-29 : tájékoztató darabszámok
--   50    : a 17 újonnan besorolt tábla EGYENKÉNT, ÉLES SORSZÁMMAL
--   90-93 : ami MÉG hiányzik (üresnek kell lennie)
-- ════════════════════════════════════════════════════════════════════════════

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ── 1-9: A HÁROM LEZÁRT HIÁNY + A NEGYEDIK ───────────────────────────────
  SELECT 1 AS sorrend,
         'BESOROLATLAN ELO TABLAK (40-es ellenorzes, 0 kell)'::text AS mit_mer,
         (SELECT count(*) FROM information_schema.tables t
           LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
           WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
             AND p.tabla IS NULL)::text AS ertek,
         '0'::text AS vart

  UNION ALL SELECT 2, 'RETEG NELKULI gyulekezeti tablak (41-es ellenorzes, 0 kell)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor='gyulekezet' AND p.reteg IS NULL)::text, '0'

  UNION ALL SELECT 3, 'RETEG-INVERZIOK szama (93-as ellenorzes, 0 kell)',
         (SELECT count(*)
            FROM pg_constraint c
            JOIN pg_class ch      ON ch.oid = c.conrelid
            JOIN pg_namespace nch ON nch.oid = ch.relnamespace
            JOIN pg_class pa      ON pa.oid = c.confrelid
            JOIN pg_namespace npa ON npa.oid = pa.relnamespace
            JOIN public.backup_table_policy pc ON pc.tabla = ch.relname
            JOIN public.backup_table_policy pp ON pp.tabla = pa.relname
           WHERE c.contype='f' AND nch.nspname='public' AND npa.nspname='public'
             AND ch.relname <> pa.relname
             AND pc.hatokor='gyulekezet' AND pp.hatokor='gyulekezet'
             AND pc.reteg IS NOT NULL AND pp.reteg IS NOT NULL
             AND pc.reteg < pp.reteg)::text, '0'

  UNION ALL SELECT 4, 'A 17 potolt tabla mind be van sorolva',
         (SELECT count(*) FROM public.backup_table_policy WHERE tabla IN (
            '_merge_run_log','event','logger',
            'mm_bookmarks','mm_dokumentumok','mm_feladatok','mm_felhasznalo_jelveny',
            'mm_felhasznalo_statisztika','mm_hozzaszolasok','mm_jutalom_esemenyek',
            'mm_merfoldkovek','mm_otlet_cimkek','mm_otlet_kategoriak','mm_otletek',
            'mm_segedanyag_ertekelesek','mm_segedanyag_kategoriak','mm_szavazatok'))::text, '17'

  UNION ALL SELECT 5, 'documents retege (7 kell) es NEM visszaallithato',
         (SELECT COALESCE(p.reteg::text,'NULL') || ' / visszaallithato=' || p.visszaallithato::text
            FROM public.backup_table_policy p WHERE p.tabla='documents'), '7 / visszaallithato=false'

  UNION ALL SELECT 6, 'congregation_transfers retege (2 kell)',
         (SELECT COALESCE(p.reteg::text,'NULL') FROM public.backup_table_policy p
           WHERE p.tabla='congregation_transfers'), '2'

  UNION ALL SELECT 7, 'congregation_remarks retege (7 kell)',
         (SELECT COALESCE(p.reteg::text,'NULL') FROM public.backup_table_policy p
           WHERE p.tabla='congregation_remarks'), '7'

  -- ⚠️ 8 — A NEGYEDIK HIBA. A hibas szuro NEM latszott a 42-es/92-es soron,
  --    mert azok csak a NULL szurot keresik. Itt tetelesen megnezzuk.
  UNION ALL SELECT 8, 'congregation_transfers szuroje mar NEM a nemletezo source_congregation_id',
         (SELECT COALESCE(p.join_predikatum,'<NULL = alapertelmezett t.congregation_id = $1>')
            FROM public.backup_table_policy p WHERE p.tabla='congregation_transfers'),
         '<NULL = alapertelmezett t.congregation_id = $1>'

  UNION ALL SELECT 9, 'congregation_transfers-nek VAN congregation_id oszlopa',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='congregation_transfers'
                   AND column_name='congregation_id')::text, 'true'

  -- ── 10-19: NEM KELETKEZETT-E UJ BAJ ──────────────────────────────────────
  UNION ALL SELECT 10, 'GYULEKEZETI tabla NULL szuro + NINCS congregation_id (42-es, 0 kell)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor='gyulekezet' AND p.join_predikatum IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=p.tabla
                 AND c.column_name='congregation_id'))::text, '0'

  -- ⚠️ 11 — EZERT nem lett az `event` globalis: PK nelkul a kulcs-alapu
  --    lapozas ctid-re esne vissza, es ez a sor azonnal pirosra valtana.
  UNION ALL SELECT 11, 'PK NELKULI mentendo tablak (44-es ellenorzes, 0 kell)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor IN ('gyulekezet','globalis')
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint con
               WHERE con.conrelid = ('public.' || quote_ident(p.tabla))::regclass
                 AND con.contype='p'))::text, '0'

  -- ⚠️ 12 — MINDEN join_predikatum-ban szereplo `t.<oszlop>` VALODI oszlop-e?
  --    EZ AZ AZ ELLENORZES, AMI A congregation_transfers HIBAJAT ELKAPTA VOLNA
  --    (`t.source_congregation_id` — ilyen oszlop nincs), es amit a 42-es/92-es
  --    sor nem lat, mert az csak a HIANYZO (NULL) szurot keresi.
  --
  --    ⚠️ A `\m` (szo-eleje) HORGONY NEM DISZ: nelkule a mintaba beleakadna az
  --       ALIASOK vege is — a `sirhely` szurojeben szereplo `st.congregation_id`
  --       `t.congregation_id`-kent illeszkedne, es a lekerdezes HAMISAN jelentene
  --       hibasnak minden join-on szurt tablat. A `\m` miatt csak a valodi,
  --       onallo `t.` alias illeszkedik.
  UNION ALL SELECT 12, 'HIBAS join_predikatum (nemletezo t.<oszlop>-ra hivatkozik, 0 kell)',
         (SELECT count(DISTINCT p.tabla)
            FROM public.backup_table_policy p
            JOIN information_schema.tables tb
              ON tb.table_schema='public' AND tb.table_name=p.tabla AND tb.table_type='BASE TABLE'
            CROSS JOIN LATERAL regexp_matches(p.join_predikatum, '\mt\.([a-z_][a-z0-9_]*)', 'g') AS m(oszlop)
           WHERE p.join_predikatum IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=p.tabla
                 AND c.column_name = m.oszlop[1]))::text, '0'

  UNION ALL SELECT 13, 'A 14 mm_* tabla mind GLOBALIS es NEM visszaallithato',
         (SELECT count(*) FROM public.backup_table_policy
           WHERE tabla LIKE 'mm\_%' AND hatokor='globalis' AND visszaallithato=false)::text,
         (SELECT count(*) FROM public.backup_table_policy WHERE tabla LIKE 'mm\_%')::text

  UNION ALL SELECT 14, 'EGYETLEN mm_* tabla sincs gyulekezeti hatokorben (0 kell)',
         (SELECT count(*) FROM public.backup_table_policy
           WHERE tabla LIKE 'mm\_%' AND hatokor='gyulekezet')::text, '0'

  -- ⚠️ 15 — A TULAJDONOSI DONTES SEMA-OLDALI PROBAJA. Ha barmelyik mm_* tabla
  --    MEGIS kap egyszer `congregation_id` oszlopot, akkor a tabla SZANDEKA es
  --    a SEMAJA szethuz — es errol a tulajdonosnak tudnia kell, MIELOTT valaki
  --    ranezesre atsorolja gyulekezetibe. Ez a sor ilyenkor pirosra valt.
  --    (2026-08-11-en a 14 mm_* tabla kozul EGYIKNEK SINCS ilyen oszlopa.)
  UNION ALL SELECT 15, 'mm_* tabla congregation_id oszloppal (0 kell — szandek/sema egyezes)',
         (SELECT count(DISTINCT c.table_name) FROM information_schema.columns c
           WHERE c.table_schema='public' AND c.table_name LIKE 'mm\_%'
             AND c.column_name='congregation_id')::text, '0'

  -- ── 20-29: TAJEKOZTATO ───────────────────────────────────────────────────
  UNION ALL SELECT 20, 'Besorolt tablak szama (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy)::text,
         (SELECT count(*) FROM public.backup_table_policy)::text
  UNION ALL SELECT 21, 'Elo public tablak szama (tajekoztato)',
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE')::text,
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE')::text
  UNION ALL SELECT 22, 'GYULEKEZETI mentesbe kerulo tablak (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='gyulekezet')::text,
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='gyulekezet')::text
  UNION ALL SELECT 23, 'GOMBBAL visszaallithato gyulekezeti tablak (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy
           WHERE hatokor='gyulekezet' AND reteg IS NOT NULL AND visszaallithato)::text,
         (SELECT count(*) FROM public.backup_table_policy
           WHERE hatokor='gyulekezet' AND reteg IS NOT NULL AND visszaallithato)::text
  UNION ALL SELECT 24, 'GLOBALIS mentesbe kerulo tablak (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='globalis')::text,
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='globalis')::text
  UNION ALL SELECT 25, 'EXPLICIT KIZART tablak (titok + egyeb, tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy
           WHERE hatokor IN ('kizart_titok','kizart_egyeb'))::text,
         (SELECT count(*) FROM public.backup_table_policy
           WHERE hatokor IN ('kizart_titok','kizart_egyeb'))::text

  -- ── 50: A 17 UJONNAN BESOROLT TABLA, ELES SORSZAMMAL ─────────────────────
  -- ⚠️ A darabszam VALODI count(*), nem becsles (query_to_xml). Ez adja meg
  --    a valaszt ket nyitott kerdesre is: tenyleg ures-e az `event`, es
  --    mekkora terhet jelent a `logger` a globalis mentesben.
  UNION ALL
  SELECT 50,
         '[' || p.hatokor || ' R' || COALESCE(p.reteg::text,'-') ||
         CASE WHEN p.visszaallithato THEN ' visszaallithato' ELSE ' NEM-visszaall.' END ||
         '] ' || p.tabla,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                             false, true, '')))[1]::text || ' sor',
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                             false, true, '')))[1]::text || ' sor'
  FROM public.backup_table_policy p
  JOIN pg_class c      ON c.relname = p.tabla AND c.relkind = 'r'
  JOIN pg_namespace n  ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE p.tabla IN (
    '_merge_run_log','event','logger',
    'mm_bookmarks','mm_dokumentumok','mm_feladatok','mm_felhasznalo_jelveny',
    'mm_felhasznalo_statisztika','mm_hozzaszolasok','mm_jutalom_esemenyek',
    'mm_merfoldkovek','mm_otlet_cimkek','mm_otlet_kategoriak','mm_otletek',
    'mm_segedanyag_ertekelesek','mm_segedanyag_kategoriak','mm_szavazatok')

  -- ── 90-93: AMI MEG HIANYZIK — MINDEGYIKNEK URESNEK KELL LENNIE ───────────
  UNION ALL
  SELECT 90, 'BESOROLATLAN TABLA — vedd fel a backup_table_policy-be!',
         t.table_name::text, '<nincs policy-sor>'
  FROM information_schema.tables t
  LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
  WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND p.tabla IS NULL

  UNION ALL
  SELECT 91, 'NINCS RETEGE — mentjuk, de visszaallitani nem tudjuk',
         p.tabla, '<reteg = NULL>'
  FROM public.backup_table_policy p
  JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
  WHERE p.hatokor='gyulekezet' AND p.reteg IS NULL

  UNION ALL
  SELECT 92, 'HIBAS join_predikatum — a MENTES 42703-mal elhasalna',
         p.tabla || ': ' || p.join_predikatum, '<nemletezo oszlopra hivatkozik>'
  FROM public.backup_table_policy p
  JOIN information_schema.tables tb
    ON tb.table_schema='public' AND tb.table_name=p.tabla AND tb.table_type='BASE TABLE'
  CROSS JOIN LATERAL regexp_matches(p.join_predikatum, '\mt\.([a-z_][a-z0-9_]*)', 'g') AS m(oszlop)
  WHERE p.join_predikatum IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=p.tabla
        AND c.column_name = m.oszlop[1])

  UNION ALL
  SELECT 93, 'RETEG-INVERZIO: gyerek alacsonyabb retegben, mint a szuloje',
         ch.relname::text || ' (R' || COALESCE(pc.reteg::text,'?') || ') -> ' ||
         pa.relname::text || ' (R' || COALESCE(pp.reteg::text,'?') || ')',
         '<a szulonek elobb kell jonnie>'
  FROM pg_constraint c
  JOIN pg_class ch      ON ch.oid = c.conrelid
  JOIN pg_namespace nch ON nch.oid = ch.relnamespace
  JOIN pg_class pa      ON pa.oid = c.confrelid
  JOIN pg_namespace npa ON npa.oid = pa.relnamespace
  JOIN public.backup_table_policy pc ON pc.tabla = ch.relname
  JOIN public.backup_table_policy pp ON pp.tabla = pa.relname
  WHERE c.contype='f' AND nch.nspname='public' AND npa.nspname='public'
    AND ch.relname <> pa.relname
    AND pc.hatokor='gyulekezet' AND pp.hatokor='gyulekezet'
    AND pc.reteg IS NOT NULL AND pp.reteg IS NOT NULL
    AND pc.reteg < pp.reteg
) x
ORDER BY x.sorrend, x.mit_mer, x.ertek;


-- ════════════════════════════════════════════════════════════════════════════
-- === ENDRE, EZ A DOLGOD ===
-- ════════════════════════════════════════════════════════════════════════════
--  1) Futtasd le EZT a fájlt egyben. A fenti ellenőrzésben az 1-15. sornak
--     mind ✅-nek kell lennie, és a 90-93. sorszámon EGYETLEN SOR SEM lehet.
--
--  2) UTÁNA futtasd le ÚJRA a migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
--     fájl VÉGÉN lévő ELLENŐRZŐ BLOKKOT (a záró, egyetlen nagy SELECT-et —
--     magát a migrációt NEM kell újra lefuttatni, de ártalmatlan, ha mégis:
--     idempotens). Ott ez a HÁROM sor legyen tiszta:
--
--        40 — BESOROLATLAN ELO TABLAK SZAMA .................. 0  ✅
--        41 — RETEG NELKULI gyulekezeti tablak .............. 0  ✅
--        93 — RETEG-INVERZIO ........................... egy sor sem
--
--     A 90-es és a 91-es sorszámon szintén egyetlen sor sem maradhat.
--
--     A tájékoztató darabszámokból CSAK a 31-es változik: 144 → 161
--     (a 17 új besorolás). A 32-es (élő táblák: 149) és a 33-as (gyülekezeti
--     hatókörű táblák) VÁLTOZATLAN — a `documents` eddig is gyülekezeti volt,
--     csak rétege nem volt. A gombbal visszaállítható táblák száma is marad 89:
--     a `documents` réteget kapott, de `visszaallithato = false`-szal, tehát a
--     visszaállító felület nem kínálja fel (lásd a 3. SZAKASZ indoklását).
--
--  3) HA a 40-es SORON MÉGIS MARAD TÁBLA: azt jelenti, hogy azóta született egy
--     új tábla. Ne kerüld meg — sorold be. A pótló INSERT sablonja:
--
--     INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, megjegyzes)
--     VALUES ('<tabla_neve>', 'gyulekezet', 5, 'kézi besorolás 2026-08-11')
--     ON CONFLICT (tabla) DO UPDATE SET hatokor = EXCLUDED.hatokor, reteg = EXCLUDED.reteg;
--
--  4) AMIT ÉRDEMES MEGNÉZNED az 50-es sorszámú soroknál (ezek nem hibák,
--     hanem TÉNYEK, amik döntést érdemelnek):
--       · `event` — ha tényleg 0 sor, a tábla nyugodtan eldobható.
--       · `_merge_run_log` — az egyszeri javító szkript szemete; eldobható.
--         MINDKETTŐ DROP-ját SZÁNDÉKOSAN NEM tettük ebbe a fájlba: a törlés
--         külön, tudatos döntés. Ha eldobod őket, a hozzájuk tartozó
--         `backup_table_policy` sor ártalmatlanul ottmaradhat.
--       · `logger` — ha nagyon sok sor van benne, a GLOBÁLIS mentés mérete nő.
--         Gyülekezeti mentést NEM érint. Ha zavaró, át lehet sorolni
--         `kizart_egyeb`-be — de akkor a régi változás-történet nem lesz mentve.
-- ════════════════════════════════════════════════════════════════════════════
