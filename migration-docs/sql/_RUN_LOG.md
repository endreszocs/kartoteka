# SQL migráció napló — Kartotéka

A `migration-docs/sql/` mappa 197+ SQL fájlt tartalmaz. Ez a napló követi, melyik migráció **futott le** a production Supabase-en, melyik **PENDING** (futtatásra vár), és melyiknek a státusza **ELLENŐRIZENDŐ** (csak Endre tudja).

## Konvenció

```
- [x] YYYY-MM-DD HH:MM — fájlnév.sql
       Megjegyzés (opcionális)

- [ ] fájlnév.sql — PENDING (még nem futott)
       Indok: ...

- [?] fájlnév.sql — ELLENŐRIZENDŐ
       (csak Endre tudja megerősíteni, hogy futott-e)
```

A `[x]` kipipált bejegyzéseknek időbélyeg jár (mikor futott le). A `[ ]` pending bejegyzéseknek **indok** kell (miért nem futott még, mire vár). A `[?]` ellenőrizendő bejegyzéseknek nem kell indok — csak Endre kell hogy futtassa `SELECT * FROM pg_proc WHERE proname = '...'` típusú ellenőrzést.

---

## 🔴 PENDING – Egyházkerületi S3: fogadó felület (2026-08-16)

- [ ] **`2026-08-16-egyhazkeruleti-S3-fogado.sql`** — PENDING
       A kerületi fogadó felület adatbázis-alapja. NÉGY dolgot old meg:
       **(1) 9. csapda — a fagyasztott irat védelme.** BEFORE UPDATE trigger
       (`diocese_felterjesztes_kerulet_oszlopvedelem`): kerületi útról CSAK a
       status / received_* / returned_reason / notes / unlock_* / updated_at
       változhat. A `snapshot_data`, `iktatoszam`, `submitted_*`, `doc_type`,
       `year`, `diocese_id`, `district_id` SOHA — a kerület nem hamisíthatja meg
       a megye beküldött iratát. **Engedélyezési listás** (`to_jsonb` diff),
       tehát minden később hozzáadott oszlop automatikusan védett. A MEGYEI
       felküldés (`rogzitDioceseFelterjesztes`) és a rendszergazda átmegy rajta.
       Külön záradék köti a `received_by`-t (csak a saját uid) és az
       `unlock_requested_by`-t (kerület felől csak NULL-ra) — okirat-integritás.
       **(2) 10. csapda — a valódi lánc.** `dioceses` UNIQUE (id, district_id) +
       kompozit FK (diocese_id, district_id): egy esperes nem küldhet fel
       tetszőleges kerülethez. ⚠️ Ettől KÉT FK mutat a `dioceses`-re, tehát a
       PostgREST-beágyazás kétértelmű (PGRST201) — a fájl 2/B-205 sora és a
       fejléce is figyelmeztet rá.
       **(3) A kerületi SZÁMVEVŐ olvasása.** A meglévő `_kerulet_select` a
       `current_user_district_ids()`-t hívja (csak admin) → az ellenőr ÜRES
       listát látott volna, ami „nincs beküldve"-nek látszik. Új, külön SELECT
       policy a `current_user_district_olvaso_ids()`-re.
       **(4) Az ÉRTESÍTÉS-LÁNC kerületi vége.** Az `ertesitesek_szint_insert`
       `congregation_id IS NOT NULL`-t követel, a felterjesztés viszont a MEGYE
       irata (nincs gyülekezete) → kerületi adminként MINDEN átvétel/
       visszaküldés/feloldás-értesítés elbukott volna az RLS-en, némán. Új,
       szűk `ertesitesek_kerulet_insert` policy: gyülekezet nélküli sor, a hívó
       kerületébe eső egyházmegye AKTÍV tisztségviselőjének címezve.

---

## 🔴 PENDING – Egyházkerületi szint: S1c rálátás-bezárás + S2 identitás (2026-08-16)

- [ ] **`2026-08-16-egyhazkeruleti-S1c-ralatas-bezaras.sql`** — PENDING
       ENDRE K4 DÖNTÉSE: „A kerület nem írhatja és nem is olvassa a kerület
       gyülekezeteinek és egyházmegyéinek az adatait, csak a hivatalosan
       beküldött adatokat illetve azoknak az összesítőjét."
       A `felettes_szint_hozzaferese()` és a `felettes_szint_gyulekezet_ids()`
       megye-only alakra vált (a 2026-08-11-es fájl előkészített, sosem futott
       „2/B" szakaszából, betűhűen), és az 5 megyei pénzügyi policy kerületi ága
       megszűnik. Egy csapásra ~40 tábláról tűnik el a kerületi sor-szintű
       rálátás — a 0/D szakasz NÉV SZERINT felsorolja őket futtatás előtt.
       ⚠️ MEGMARAD (fail-closed őrszem ellenőrzi, mielőtt bármit elvenne):
       `document_submissions_district_select/_update` (a beküldött iratok — csak
       a továbbított/véglegesített sorokra), `diocese_felterjesztes_kerulet_*`
       (a felterjesztési csatorna), a törzsadat-olvasás és a
       `district_member_counts()` összesítő RPC.
       ⚠️ MEGMARAD a `felettes_szint_szerkesztheto()` kerületi lába is: az a
       GYÜLEKEZETI TÖRZSADAT (név, cím) szerkesztése, ami adminisztratív
       funkció, nem „a gyülekezet adata" — ha ezt is el akarod venni, szólj.
       A 2/E szakasz 4 lépéses KÉZI PRÓBÁT ír le.

- [ ] **`2026-08-16-egyhazkeruleti-S2-identitas.sql`** — PENDING
       A `districts` hivatalos identitása: 29 új oszlop a `dioceses` mintájára,
       de KERÜLETI vezetői nevekkel (`puspok_nev`, `puspok_cim`,
       `adminisztrator_nev`, `szamvevo_nev`) — `esperes_*` NEM jön létre.
       Plusz `teszt boolean` (a „Teszt Egyházkerület" látható megjelöléséhez),
       `districts-logos` storage bucket, és az ELSŐ írás-policy a táblán
       (`districts_update_district_scope`) — eddig egyetlen sem volt, tehát a
       kerületi admin nem tudta menteni a saját adatait.
       ⚠️ ANON-VÉDELEM: a fájl EGYETLEN GRANT-ot sem ad az anonnak, és a COMMIT
       ELŐTT `has_column_privilege()`-dzsel végigméri mind a 29 új oszlopot —
       szivárgás esetén RAISE EXCEPTION-nel VISSZAGÖRDÍTI az egész tranzakciót.
       ❓ **ENDRE DÖNTÉSÉRE VÁR** (a fájl fejlécében is): a püspöki pecsét és az
       aláírás publikus bucketbe kerül, tehát az URL birtokában bejelentkezés
       nélkül letölthető. Ez okirat-hamisítási felület. Ma a gyülekezeti és a
       megyei szint is így működik — a döntés mind a hármat érinti.

---

## 🔴 PENDING – Egyházmegyei számvevő neve (2026-08-15, Endre kérése)

- [ ] **`2026-08-15-egyhazmegyei-szamvevo-nev.sql`** — PENDING
       Indok: egyetlen NULLABLE oszlop (`dioceses.szamvevo_nev`) a hivatalos
       megyei irat aláírás-rovatához. A beállítás-varázsló mostantól LISTÁBÓL
       kínálja fel a vezetőket (esperes / jegyző / számvevő) — a megye
       gyülekezeteinek lelkészei és a megyéhez kiosztott szerepkörök közül —,
       de a számvevő nevének eddig nem volt hova kerülnie.
       ⚠️ NEM sürgős: az app FAIL-SOFT. Amíg nem fut le, a mentés a
       `szamvevo_nev` nélkül megy végbe (updateDioceseFailSoft), tehát semmi
       más adat nem vész el — csak ez az egy mező nem tárolódik.

---

## 🔴 PENDING – Egyházkerületi szint (3. szint) S0 + S1 (2026-08-15)

- [ ] **`2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql`** — ⚠️ PENDING, SÜRGŐS
       Indok: az S0 0/B szakasza kimutatta, hogy az `anon` szerepnek
       **TRUNCATE** joga van a `districts` és a `dioceses` táblán (a
       `authenticated`-nek szintén). **A TRUNCATE-re az RLS SOHA nem
       vonatkozik**: hiába nincs a `districts`-en egyetlen írás-policy sem,
       a TRUNCATE joggal a teljes törzsadat kiüríthető — és a `districts`
       kiürítése az egész rendszert megbénítaná (mind a 25 egyházmegye FK-val
       mutat rá). Az S1 abban a változatában, ami lefutott, csak a SELECT-et és
       a három DML-jogot vonta vissza. Ez a fájl `REVOKE ALL PRIVILEGES`-szel
       zárja le, és MEGMÉRI, hány másik táblán él ugyanez (azokhoz nem nyúl).

- [x] 2026-08-15 — **`2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql`** ✅ LEFUTOTT
       A 2. szakasz mind a 26 sora zöld: az új szerep kiosztható, az olvasó
       függvény megvan GRANT-tal, és a `has_column_privilege()` döntő próbája
       igazolta, hogy az anon a CIF-et, IBAN-t, pecsétet, aláírást, címet és
       elérhetőségeket **már NEM olvassa**, miközben az (id, name, district_id)
       hármas megmaradt a regisztrációs űrlapnak.
       ⚠️ **DE:** a fájl 1/A szakaszának `LIKE '%role%'` szűrője MELLÉFOGOTT —
       lásd a következő tételt. A repóban a szűrő azóta oszlop-alapú
       (`conkey`), tehát egy ÚJRAfuttatás már nem okozná ugyanezt.

- [ ] **`2026-08-15-egyhazkeruleti-S1-JAVITAS-custom-label-check.sql`** — ⚠️ PENDING, SÜRGŐS
       Indok: az S1 1/A szakasza a szerep-értéklista CHECK-jét kereste
       `pg_get_constraintdef(...) LIKE '%role%'` szűrővel. Ez a
       `profile_roles_custom_label_check`-et IS megfogta (a definíciója említi
       a `role` oszlopot), eldobta, és a helyére — ugyanazzal a névvel — a
       szerep-értéklistát tette. Következmény: az egyedi szerepkörök
       CÍMKE-integritási őre némán megszűnt (ezután `role = 'custom'` sor
       létrejöhetne címke nélkül). **Adat nem veszett el, egyetlen sor sem
       módosult** — csak egy CHECK cserélődött ki. Ez a fájl visszateszi az
       eredeti, 2026-04-17-i alakra, fail-closed módon (ha közben keletkezett
       szabálysértő sor, megáll és név szerint felsorolja).
       A másik három CHECK (scope, approval_status, scope_id) és a `profiles`
       tábla érintetlen — a 0. szakasz ezt bizonyítja is.

- [ ] **`2026-08-15-egyhazkeruleti-S0-allapotfelmeres.sql`** — PENDING, **CSAK OLVASÓ**
       ⚠️ Az első próbálkozás `42P01: missing FROM-clause entry for table "t"`
       hibával elszállt (a 0/C szakasz második ágából kimaradt a saját
       `FROM (VALUES …) AS t(tabla)` záradéka). JAVÍTVA. Az egész repót
       őrzi ezután a `scripts/selftest-sql-union-from.mjs` önellenőrzés,
       ami pontosan ezt a hibaosztályt keresi minden SQL riport-blokkban.
       Indok: ez a 3. szint MINDEN további SQL-jének bemenete. Egyetlen SELECT,
       semmit nem módosít. A `migration-docs/Database_schema.sql` dump ELAVULT
       (2026-07-10-ig ér), a 2026-08-15-ös migrációk nincsenek benne — ezért
       tilos belőle tervezni. Ez a fájl az ÉLŐ adatbázisból adja vissza: a
       `districts` oszlopkészletét, a 6 scope-oszlopos tábla CHECK-jét és
       részleges indexeit, a `current_user_*` függvények meglétét ÉS
       GRANT-jait, a `felettes_szint_hozzaferese()` kerületi lábát (K4 döntés),
       a `district` hatókörű `profile_roles` sorokat, a
       `diocese_felterjesztes` egyedi indexének oszlopszámát (3 = rossz,
       4 = helyes), valamint a 14 dokumentált csapda mérési pontjait.
       ⚠️ FUTTASD ELŐBB, MINT AZ S1-ET, és az eredményt küldd vissza.

- [ ] **`2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql`** — PENDING (S0 után)
       Indok: három, egymástól független javítás egyetlen tranzakcióban.
       (A) Az `egyhazkeruleti_szamvevo` szerep felvétele a `profiles.role` és a
       `profile_roles.role` CHECK-jébe — enélkül az app-oldali szerep
       KIOSZTHATATLAN (23514). (B) `current_user_district_olvaso_ids()` — a
       kerületi OLVASÓ hatókör, a `current_user_diocese_olvaso_ids()` betűhű
       párja; az app-tükre `apps/web/lib/auth/level-scope.ts`
       (DISTRICT_WRITE_ROLES / DISTRICT_READ_ROLES), a két réteget a
       `scripts/selftest-kerulet-hatokor.mjs` köti össze. (C) ⛔ ÉLŐ SZIVÁRGÁS
       ZÁRÁSA: a `dioceses` hivatalos adatai (CIF, IBAN, pecsét-URL,
       aláírás-URL) MA bejelentkezés nélkül olvashatók — az `anon` szerep
       tábla-szintű SELECT joga oszlop-szintűre szűkül
       (`districts` → id, name; `dioceses` → id, name, district_id).
       Ez fail-closed a jövőre: az S2-ben érkező érzékeny oszlopokra az anon
       automatikusan NEM kap jogot.
       ⚠️ FUTTATÁS UTÁN 2 PERCES PRÓBA: inkognitó ablakban a
       `/hozzaferes-kerese` oldal két legördülőjének MEG KELL TELNIE.

---

## 🔴 PENDING – Dokumentumtár: gyülekezeti fájl-terület (2026-08-15, 7. pont A)

- [ ] **`2026-08-15-dokumentumtar-gyulekezeti-fajlok.sql`** — PENDING (még nem futott)
       Indok: a dokumentumtár PR merge előtt kell futtatni a Supabase SQL
       Editorban. Új `gyulekezeti_dokumentum` tábla (RLS + oszlop-szintű
       UPDATE grant a soft-delete-hez) + `gyulekezeti-dokumentumok` privát
       bucket (25 MB) + storage policy-k. Idempotens; a végén beépített
       verifikációs SELECT (minden sor ✅ kell legyen). Amíg nem fut le, az
       app hangos magyar hibával jelzi a hiányt (fail-closed).

---

## 🔴 PENDING – filmszerű honlaptéma és publikus témaolvasás (2026-07-18)

- [x] 2026-07-18 — **`2026-07-17-public-site-v2-themes.sql`** ✅ LEFUTOTT
       A négysoros produkciós eredmény igazolta mind a négy aktív témát; a
       `filmszeru-tortenet` preset `sort_order=4` értékkel létrejött. A seed
       tiszta, idempotens DML; policyt és grantet nem módosított.

- [ ] **`2026-07-17-public-site-read-security.sql`** — REVIEW-DRAFT / BLOKKOLT
       Nem része a filmszerű téma kiadásának. Csak a teljes tagiportál-P0 és
       workflow cutover után futtatható. A 2026-07-18-i téves próbafutás a
       hiányzó `KARTOTEKA_P0_AUTH_ISOLATION_V1` exact marker preflightján
       fail-closed leállt; a tranzakció teljesen visszagördült, részleges
       adatbázis-módosítás nem maradt.

---

## 🔴 PENDING – publikus oldal adatvezérelt alkalmak és sitemap (2026-07-18)

- [ ] **`2026-07-18-public-site-content-and-sitemap.sql`** — PENDING (még nem futott)
       Indok: a 2026-07-17-es tagi portál és `public-site-read-security` lánc
       sikeres postflightjára, majd felhasználói SQL Editor-jóváhagyásra vár.
       Hatás: validált `public_sites.service_times` JSONB, privát SECURITY DEFINER
       olvasók és két szűk, anon SECURITY INVOKER RPC a publikus contexthez és
       sitemaphez. Kötelező sorrend:
       `migration-docs/public-site-2026-07-18-rollout.md`.

---

## 🔵 DIAGNOSZTIKA — csak OLVAS (SELECT), 2026-06-19

Az import-párosítás audithoz. Nem módosítanak semmit; futtasd a Supabase SQL editorban,
és az eredményt küldd vissza — ezek alapján döntünk a spouse-bridge-ről és az idempotencia-indexről.

- [ ] **`2026-06-19-diag-asszonynevek-szcs-nev.sql`** — DIAGNOSZTIKA (csak olvas)
       Férjes asszonyok név-tárolása + lánykori (szcs_nev) kitöltöttség → eldönti, kell-e spouse-bridge (P1-4).
- [ ] **`2026-06-19-diag-import-duplikatumok.sql`** — DIAGNOSZTIKA (csak olvas)
       Meglévő befizetés-duplikátumok kimutatása egy esetleges idempotens UNIQUE index ELŐTT.
- [x] 2026-06-19 — **`2026-06-19-diag-300-belso-mozgas.sql`** ✅ LEFUTOTT
       Eredmény: 300.01 belsotetel="300.01" → valóban belső mozgás → a fix (eda5237a) IGAZOLT, marad.
- [x] 2026-06-19 — **`2026-06-19-diag-asszonynevek-szcs-nev.sql`** ✅ LEFUTOTT
       Eredmény: 125/183 (~68%) nő a férj nevén → spouse-bridge ELVETVE.
- [x] 2026-06-19 — **`2026-06-19-diag-import-duplikatumok.sql`** ✅ LEFUTOTT
       Eredmény: 0 ütközés → idempotens UNIQUE index NEM ajánlott (app-szintű dedup elég).
- [x] 2026-06-19 — **`2026-06-19-diag-berleti-dupla-szamitas.sql`** ✅ LEFUTOTT
       Eredmény: szerzodes_db=0 → NINCS bérleti szerződés → a dupla-számítás jelenleg nem fordulhat elő.
- [ ] **`2026-06-19-diag-azonos-nevu-szemelyek.sql`** — DIAGNOSZTIKA (csak olvas)
       Azonos nevű személyek a tagnyilvántartásban + a cím feloldja-e őket (egyházfenntartás-import
       duplikáció-kockázat). Az A)–C) eredmény kell a robusztus párosítás-tervhez.

---

## 🔴 PENDING (futtatásra vár) — 2026-05-17

### Sorrend nem számít (mind független művelet)

- [x] 2026-05-17 — **`2026-05-15-legacy-cleanup-drop.sql`** ✅ LEFUTOTT
       19× `DROP TABLE IF EXISTS *_ARCHIVE_2026_04_15` (Endre megerősítette: sikeresen lefutott).

- [x] 2026-05-17 — **`2026-05-17-security-definer-search-path-pin.sql`** ✅ LEFUTOTT
       17× `ALTER FUNCTION ... SET search_path = public, pg_temp` (CVE-2018-1058 mitigation).
       A verifikációs SELECT mind a 17 függvényre `✅ OK (public, pg_temp)` státuszt adott.
       **Történet**: az 1. próbafutás (eredeti, 19 függvényt céloz) `42883: function public.issue_license(text, text, text, inet, text) does not exist` hibára futott — a tranzakció rollback-elt. Production-audit (Supabase Studio diagnosztikai SELECT) megerősítette, hogy 2 függvény (`issue_license`, `revoke_license`) hiányzik (a standalone-licenses.sql migráció nem futott — a Tauri standalone licensz-flow nincs élesben). A migráció szerkesztve, 2 ALTER kivéve → 2. futás hibamentes.

- [x] 2026-05-17 — **`2026-05-06-egyhfenntartas-import-dup-index.sql`** ✅ LEFUTOTT
       `CREATE INDEX IF NOT EXISTS idx_befizetes_egyhf_import_lookup` (5-mezős partial). Verifikáció: a `befizetescel.id_szamadasicel='101.01'` lookup visszaadta `{id: 80, nev: 'Egyházfenntartói járulék', aktiv: true}` — a downstream import-flow használhatja.

- [ ] **`2026-05-29-keresztseg-alapige-oszlop.sql`** — PENDING (még nem futott)
       Indok: Schema cache hiba "Could not find the 'alapige' column of 'keresztseg'".
       Hatás: `ALTER TABLE keresztseg ADD COLUMN IF NOT EXISTS alapige varchar` (nullable, idempotens).
       A baptism-dialog, registry validation és Excel-import már most is hivatkozik az oszlopra.

- [ ] **`2026-05-29-iktato-fazis-3-workflow.sql`** — PENDING (még nem futott)
       Indok: Iktató Fázis 3 — Workflow. Évvégi lezárás + másodpéldány-flag + hivatali út.
       Hatás: (1) `iktato.has_duplicate boolean DEFAULT false` oszlop hozzáadása;
       (2) új `iktato_yearly_closures` tábla (PK: congregation_id+year) — egy év csak egyszer zárható le;
       (3) RLS POLICY-k a yearly_closures-re (SELECT a saját gyülekezetre, INSERT csak admin/pastor/master).
       A `closeFilingYear` action és a UI „X-es év lezárása" gomb használja.
       BEGIN/COMMIT csomagolva (P2-12 betartva).

- [ ] **`2026-04-30k-diagnoszt-baptism-szulok.sql`** — diagnosztikai SELECT-ek a keresztelő szülő-load hibakereséséhez. Read-only, séma-érintetlen. Hardcoded `id = 1163`, cserélendő.

- [ ] **`2026-04-30l-backfill-csalad-text-szulokbol.sql`** — DRY-RUN előnézet (1-3. blokk) + élő backfill (4-7. blokk, kommentelt). Az élő UPDATE/INSERT a `/* ... */` blokkban — uncomment szükséges.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis5-gdpr-valasztoi.sql`** ✅ LEFUTOTT
       Verifikáció (Endre): `recompute_voter_eligibility` RPC létezik. A GDPR-mezők +
       választói automatika élesben.
       Tartalom: Tagnyilvántartás Fázis 5 — GDPR-hozzájárulások (P3-5) + választói automatika (P3-7).
       Hatás: (1) `szemely` új oszlopok: `gdpr_consent_at`, `photo_consent`, `mailing_consent`,
       `voter_manual_override` (+ CHECK 0/1); (2) `recompute_voter_eligibility(uuid)` RPC —
       szabály-alapú választói névjegyzék (18+, konfirmált, élő aktív tag), a kézi felülbírálást
       tiszteletben tartva; beállítja a `szemely.voter_eligible` flag-et, visszaad { eligible,
       total, added, removed }.
       ⚠️ A webapp-kód (GDPR-panel a személyi kartonon, „Jogosultság frissítése" gomb a Választók
       fülön) hivatkozik ezekre — a migráció nélkül a mezők nem jelennek meg / az újraszámítás
       hibát ad, de adatvesztés nincs. Verifikáció: fájl végi diagnosztika (4 oszlop + RPC).
       BEGIN/COMMIT csomagolva.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql`** ✅ LEFUTOTT
       Tagnyilvántartás Fázis 1 biztonsági hotfix (átvilágítás P0-1…P0-4, P1-3, P1-4 —
       lásd `docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md`).
       Hatás: (1) `felmentes`/`presbiter`/`csoport` táblákra `congregation_id` oszlop + backfill
       + BEFORE INSERT trigger (felmentes, presbiter); (2) a `USING (true)` policyk
       (felmentes_all/felmentes_access, presbiter_all/presbiter_read, csoport_read) cseréje
       gyülekezet-szűrt policykra; (3) új `tagnyilvantartas_tag_torles(integer)` RPC — atomikus,
       jogosultság-ellenőrzött végleges törlés pénzügyi + anyakönyvi védelemmel; (4) új
       `app_get_or_create_locality(text)` / `app_get_or_create_street(text, integer)` RPC-k
       (guardolt címtörzs-bővítés a korábbi csendes 1-es fallback helyett).
       **Verifikáció (Endre, 2026-06-10):** felmentes NULL=0 ✅ · presbiter NULL=0 ✅ ·
       csoport NULL=1 → az árva „1. körzet" sor (id=1; 0 presbiter/csalad/haztartas
       hivatkozás, a kód sem használja defaultként) még aznap TÖRÖLVE —
       utóellenőrzés: 0 árva sor ✅. A backfill így 100%-os mindhárom táblán.
       A 2026-06-10-es webapp-kód (tag-törlés RPC, címtörzs-RPC-k) mostantól deployolható.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis2-3-megbizhatosag.sql`** ✅ LEFUTOTT
       Tagnyilvántartás Fázis 2-3 (átvilágítás P1-5, P1-6, P1-7c).
       **Verifikáció (Endre, 2026-06-10):** `uidx_szemely_cnp_per_congregation` index
       létrejött ✅ — ez egyben igazolja, hogy CNP-duplikátum nem volt; az árva
       befizetes.id_csalad hivatkozásokat a migráció nullázta, a FK él.
       Hatás: (1) `befizetes.id_csalad` FK a csalad-ra (árva hivatkozások NULL-ozása után);
       (2) `uidx_szemely_cnp_per_congregation` partial unique — CNP-egyediség gyülekezeten
       belül (duplikátumnál NEM bukik el: NOTICE + a fájl végi diagnosztika listázza);
       (3) `sirhelyelhunyt.id_szemely` oszlop + backfill a temetes-hivatkozáson át + trigger;
       (4) `tagnyilvantartas_csalad_mentes(...)` RPC — atomikus család+gyerek mentés,
       tag-szintű gyülekezet-ellenőrzéssel.
       ⚠️ SORREND: a Fázis 2-3 webapp-kód deployja ELŐTT futtatandó (a saveFamily már az
       RPC-t hívja; nélküle a család-mentés érthető hibaüzenettel leáll, adatvesztés nélkül).
       Verifikáció: fájl végi diagnosztika — árva befizetes=0, CNP-duplikátum lista üres
       (vagy rendezendő), sirhelyelhunyt-linkek feltöltve, index létrejött.
       BEGIN/COMMIT csomagolva (P2-12 betartva).

- [x] 2026-05-17 — **`2026-05-17-iktato-sequence-pointer-rpc.sql`** ✅ LEFUTOTT
       Új `iktato_sequence_pointers` tábla + `next_iktato_sequence(uuid, integer)` SECURITY DEFINER RPC + backfill + partial UNIQUE INDEX (P3-5 race-fix).
       Verifikáció: `next_iktato_sequence` ✅ OK, `search_path=public, pg_temp`, partial UNIQUE INDEX létrejött, pointer-tábla 0 sor (productionben még nincs iktato-bejegyzés). A frontend `saveFilingEntry` mostantól az RPC-t hívja az atomic sorszámért.

---

## 🟢 LEFUTOTT (a kódbázis ezekre épít) — 2026-04-08 — 2026-05-06

A 2026-04-08 és 2026-05-06 közötti migrációk feltehetően mind lefutottak — a Kartotéka kódbázisa épít rájuk (lásd `apps/web/app/(dashboard)/**/actions.ts` import-ok, RPC-hivatkozások, table-referenciák, RLS-policy-k). A pontos időbélyeg-listához a Supabase Studio `supabase_migrations.schema_migrations` táblát kell lekérdezni, vagy Endre memóriáját.

Tipikus chronologia (csoportosítva fő-csomagok szerint):

### 2026-04-09 — Alapok (3 fájl)
- [?] `2026-04-09-extension-table-policies.sql`
- [?] `2026-04-09-god-mode-and-congregation-finance.sql`
- [?] `2026-04-09-profile-and-congregation-extensions.sql`

### 2026-04-12 — Phase 0 RLS hardening + új modulok (10 fájl)
- [?] `2026-04-12-budget-modifications.sql`
- [?] `2026-04-12-document-submissions.sql`
- [?] `2026-04-12-jegyzokonyv-restructure.sql`
- [?] `2026-04-12-missziós-muhely-rls.sql`
- [?] `2026-04-12-phase-0-rls-hardening.sql`
- [?] `2026-04-12-presbiteri-jegyzokonyvek.sql`
- [?] `2026-04-12-public-magazines.sql`
- [?] `2026-04-12-public-site-stats.sql`
- [?] `2026-04-12-public-site-tables.sql`
- [?] `2026-04-12-storage-buckets.sql`
- [?] `2026-04-12-support-tickets.sql`

### 2026-04-13 — RLS finomítás (5 fájl)
- [?] `2026-04-13-rls-ALL-FIXED.sql`
- [?] `2026-04-13-rls-congregation-tables.sql`
- [?] `2026-04-13-rls-hybrid-admin-tables.sql`
- [?] `2026-04-13-rls-mm-misc-tables.sql`
- [?] `2026-04-13-rls-reference-tables.sql`

### 2026-04-15 — Annual reports, MM RLS fix, standalone licenses
- [?] `2026-04-15-annual-reports-extension.sql`
- [?] `2026-04-15-mm-rls-fix.sql`
- [?] `2026-04-15-mm-rls-fix-part2.sql`
- [?] `2026-04-15-remove-default-god-mode-pin.sql`
- [?] `2026-04-15-standalone-licenses.sql`

### 2026-04-21 — M6 RLS audit + DIAG-only (1 fájl)
- [?] `2026-04-21-m6-2-rls-audit-full.sql` (AUDIT-only — SELECT-ek, semmilyen DDL)

### 2026-04-23 — M0 hotfixes (3 fájl)
- [?] `2026-04-23-m0-DIAGNOSTIC.sql`
- [?] `2026-04-23-m0-HOTFIX-grants.sql`
- [?] `2026-04-23-m0-REPAIR-idempotent.sql`
- [?] `2026-04-23-m0-5-devices-licenses-audit.sql`

### 2026-04-24 — M7 sorszámok + admin wipe (2 fájl)
- [?] `2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql`
- [?] `2026-04-24-admin-wipe-congregation-data.sql`

### 2026-04-25 — M0.5 + M7 iratszám pointers (2 fájl)
- [?] `2026-04-25-m0-5-audit-log-view.sql`
- [?] `2026-04-25-a-m7-9a-iratszam-pointers.sql`

### 2026-04-26 — Family-link inference RPC (1 fájl)
- [?] `2026-04-26-family-link-inference-rpc.sql`

### 2026-04-30 — Tag-validáció diagnoszt + backfill (2 fájl)
- [?] `2026-04-30k-diagnoszt-baptism-szulok.sql` (lásd PENDING fent)
- [?] `2026-04-30l-backfill-csalad-text-szulokbol.sql` (lásd PENDING fent)

### 2026-05-02 — Finance import RPC + access-requests + user-trigger (10+ fájl)
- [?] `2026-05-02-diagnose-users-visibility.sql`
- [?] `2026-05-02-finance-dup-lookup-indexes.sql`
- [?] `2026-05-02-finance-import-rpc.sql`
- [?] `2026-05-02-fix-access-requests-COMPLETE.sql`
- [?] `2026-05-02-fix-access-requests-anon-insert.sql`
- [?] `2026-05-02-handle-new-user-trigger.sql`
- [?] `2026-05-02-member-validation-errors.sql`
- [?] `2026-05-02-profiles-approved-to-active.sql`
- [?] `2026-05-02-rls-fix-merge-v7-result.sql`

### 2026-05-03 — Finance kódok (4 fájl)
- [?] `2026-05-03-finance-300-01-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-celok.sql`
- [?] `2026-05-03-finance-import-rpc-v2.sql`

### 2026-05-04 — Admin RPC-k + onboarding (13 fájl)
- [?] `2026-05-04-admin-user-status-rpc.sql`
- [?] `2026-05-04b-grant-service-role-profiles.sql`
- [?] `2026-05-04c-profile-congregations-rpc.sql`
- [?] `2026-05-04d-ertesitesek-read-at-archived.sql`
- [?] `2026-05-04e-system-broadcasts-allow-resend.sql`
- [?] `2026-05-04f-complete-user-onboarding-rpc.sql`
- [?] `2026-05-04g-pending-wizard-diagnosis.sql`
- [?] `2026-05-04h-beke-tivadar-diagnosis.sql`
- [?] `2026-05-04i-restart-user-onboarding-rpc.sql`
- [?] `2026-05-04j-complete-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04k-restart-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04l-chitanta-tombok-rls-fix.sql`
- [?] `2026-05-04m-create-teszt-congregation.sql`

### 2026-05-05 — Pastor service history (1 fájl)
- [?] `2026-05-05-pastor-service-history-tartozas-mod.sql`

---

## Nem érintett SQL fájlok (197+ a többi)

A fenti chronologia nem teljes — a `migration-docs/sql/` mappa 197 fájlt tartalmaz, és a 2026-04-08 előtti (M0, M1, M2, M3, M4, M5 sprintek) migrációk százainak száma. Ezek mind lefutottak (mert a fő séma — `congregations`, `profiles`, `szemely`, `csalad`, `befizetes`, `kiadas`, `chitanta_*`, `befizetescel`, `kiadascel`, `szamadasicel`, `iratszam_*`, `audit_log` stb. — már létezik a productionben).

A teljes lista lekérése Supabase Studio-ban:
```sql
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations ORDER BY version;
```

---

## Hibajavítások (drop, restore)

Eddig nem volt katasztrofális PITR-rollback. Ha jövőben szükség lesz, ide jegyezzük:

| Időpont | Művelet | Indok | Eredmény |
|---|---|---|---|
| (üres) | | | |

---

## Hivatkozások

- **DIAGNOSTICS P2-9 + P2-10**: a _RUN_LOG.md hiánya és pending SQL-ek
- **DIAGNOSTICS P2-11**: SECURITY DEFINER search_path → `2026-05-17-security-definer-search-path-pin.sql`
- **DIAGNOSTICS P2-12**: a RPC-installer migrációk BEGIN/COMMIT csomagolása — új migrációknál betartani
