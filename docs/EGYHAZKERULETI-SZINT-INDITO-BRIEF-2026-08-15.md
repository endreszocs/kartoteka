# EGYHÁZKERÜLETI SZINT (3. SZINT) — INDÍTÓ BRIEF

**Készült:** 2026-08-15 · **Címzett:** a megvalósítást végző új session
**Előzmény:** a gyülekezeti (1.) és az egyházmegyei (2.) szint ÉLESBEN van (PR #173, #174 + 8 SQL)

---

## 0. MI A FELADAT

Építsd meg az **egyházkerületet a rendszer 3. szintjeként**, az egyházmegyei szint
mintájára: saját belépés, saját identitás (hivatalos név, címer, pecsét, aláírás),
saját leltár/iktatás/könyvelés, a megyék felterjesztéseinek fogadása, archívum és
összesítő — és mindenütt az **egységes véglegesítés-gomb**.

Romániában két magyar református egyházkerület van (Erdélyi, Királyhágómelléki);
a rendszerben a `districts` tábla képviseli őket.

**Ez NEM zöldmezős munka.** A 3. szint kb. 30–40%-ban már áll. A leggyakoribb hiba,
amit elkövethetsz, hogy újraépíted azt, ami már működik. Ezért a 3. fejezetet
(„MI VAN MÁR KÉSZ") olvasd el kétszer.

---

## 1. ENDRE DÖNTÉSEI — EZEK FELÜLÍRNAK MINDENT

Szó szerint, a `docs/EGYHAZMEGYEI-SZINT-DONTESEK-2026-08-15.md` 19–28. sorából:

> „az egyházkerületnek is legyen saját belépése (az egy harmadik szint, külön kör) —
> az egyházmegyénél is az egyházközségeknél gyakorolt véglegesítés gombbal lehet
> felküldeni külön az egyházmegyei számadást, költségvetést - költségvetés módosítást
> és külön véglegesíteni az egyházmegye gyülekezetei által beküldött dokumentumok
> összesítőit!"

És a 4. döntése (2026-08-15):

> „véglegesítés-gomb minden jelentés esetén legyen egyforma és ugyanúgy elhelyezve"

Továbbá állandó elvárások (a memóriából, nem újratárgyalandók):

- **Magyar nyelv** mindenütt — kód-kommentek, UI, commit, SQL-magyarázat.
- **Mobil-first**: minden új felület telefonon is tökéletes legyen.
- **Sötét mód**: token-alapú színek, nincs hardcode-olt fehér felület.
- **SQL-t Endre futtat.** Nincs Supabase MCP ehhez a projekthez. Minden migráció
  külön fájl `migration-docs/sql/` alatt, `0. szakasz` állapotfelméréssel és
  `2. szakasz` ellenőrző lekérdezéssel, magyar `mit / ertek / teendo` oszlopokkal.
- **Fázisonként**: feature-ág → PR → CI → squash-merge. CHANGELOG minden fázisnál,
  lelkész-barát nyelven.

---

## 2. NYITOTT DÖNTÉSEK — JAVASOLT ALAPÉRTELMEZÉSSEL

Tedd fel Endrének **egyetlen üzenetben, a munka legelején**, de **NE állj meg**:
kezdd el az S0–S1 szeletet, ami minden válasz mellett ugyanaz. Ha nem válaszol,
haladj a javasolt alapértelmezéssel, és a PR-ben mondd ki, mit feltételeztél.

| # | Kérdés | Javasolt alapértelmezés |
|---|--------|--------------------------|
| **K1** | **Ki dolgozik kerületi profillal?** Ma EGYETLEN szerep van: `egyhazkeruleti_admin` (`roles.ts:8`). Püspök, főjegyző, kerületi számvevő, kerületi adminisztrátorok nincsenek. | A megyei mintát tükrözzük: `egyhazkeruleti_admin` marad az ÍRÓ, és születik egy **`egyhazkeruleti_szamvevo`** OLVASÓ szerep. Ez érinti: `roles.ts` KNOWN_ROLES, `profile-roles/types.ts` ProfileRoleType + ROLE_LABELS, `permissions.ts` ROLE_TEMPLATES, `profiles.role` és `profile_roles.role` CHECK. |
| **K2** | **Vezet-e a kerület saját könyvet** (számadás, költségvetés), vagy csak fogad és összesít? | IGEN, vezet — a megye is vezet. Ez a legnagyobb szelet (S5), tedd a sor VÉGÉRE, hogy a fogadó felület hamarabb éles legyen. |
| **K3** | **Van-e a kerület felett 4. szint** (Zsinat / országos)? | NINCS. A kerület a lánc teteje: a véglegesítés-gomb ott zárol, de nem küld fel sehova. `district_felterjesztes` tábla NEM készül. |
| **K4** | **Lát-e a kerület sor-szinten a gyülekezetekbe?** Ma IGEN — a `felettes_szint_hozzaferese()` kerületi lába miatt egy kerületi admin közvetlen lekérdezéssel olvashatja a kerülete összes gyülekezetének befizetéseit, személyeit, anyakönyveit. | Endre döntése. Alapértelmezés: **marad**, de a 0. szakasz SQL-je MÉRJE MEG és írja ki, hogy ez a helyzet — ne néma állapot legyen. |
| **K5** | **A kerületi fogadó felület MVP vagy teljes?** (a terv D5 pontja) | **Teljes**: átvétel-nyugtázás + visszaküldés kötelező indoklással + feloldás-kérés elbírálása. Az adatbázis mindhármat MÁR támogatja, csak felület nincs. |

---

## 3. MI VAN MÁR KÉSZ — NE ÉPÍTSD ÚJRA

**Adatbázis (élesben fut):**

- `current_user_district_ids()` — kanonikus, **szerep-szűrt** kerületi feloldó
  (`2026-08-11-globalis-hozzaferes-szukites.sql:860-907`), skalár-fallback elnyomással.
- `felettes_szint_gyulekezet_ids()` — a VALÓDI `congregations.diocese_id → dioceses.district_id`
  láncon (uo. 924-948).
- `diocese_felterjesztes` tábla `district_id NOT NULL`-lal, **a kerületi SELECT és UPDATE
  policy-val együtt** (`2026-08-15-egyhazmegyei-uj-tablak.sql:204-311`).
- `diocese_felterjesztes_unlock_idx (district_id, year) WHERE unlock_requested = true`
  — a feloldás-elbíráló felület indexe (`...-osszesito-feloldas.sql:135-137`).
- A megyei FOR ALL policy-k **harmadik ága** már beengedi a kerületet
  (`...-rls-szerep-szuro.sql:292-297`).
- `szamadasicel.szint = 'kerulet'` érték már megengedett (`Database_schema.sql:560`) —
  de egyetlen felület sem használja.

**Alkalmazás:**

- `/dashboard-kerulet/page.tsx` — 382 sor, ScopeHero + DocumentCenter + KPI-kártyák,
  `resolveDistrictScopeIds`-szal, fail-closed `MissingDistrictScopeNotice`-szal.
- `getSubmissionMatrix('district', …)` — a **district ág már támogatott**.
- A `DioceseArchivumView` komponens újrahasznosítható (a hat irat-típus oszlop-sorrendje benne van).
- A profilválasztó KÉSZ a kerületre: `SCOPE_ORDER`, `SCOPE_SECTION_LABELS` („Egyházkerületi"),
  lila `SCOPE_COLOR`, `getStartPathForScope('district') → /dashboard-kerulet`.
  Csak `district` hatókörű `profile_roles` sor kell a felhasználónak.
- A header `contextChip`-je már tudja a kerületi feliratot (`header-refined-v3.tsx:197-202`).

**Ami viszont NINCS:** a `districts` táblának **mindössze 3 oszlopa van** — `id`, `name`,
`created_at`. Se cím, se adószám, se bank, se pecsét, se román név. A kerületnek ma
**nincs hivatalos identitása** — nem tud fejlécet nyomtatni és nem tud iratot hitelesíteni.

---

## 4. A MUNKA SZELETEI

Ebben a sorrendben. Minden szelet külön PR, külön SQL-fájl, zöld kapukkal.

### S0 · Állapotfelmérés (KÖTELEZŐ ELSŐ LÉPÉS, csak olvasó SQL)

⚠️ **A `migration-docs/Database_schema.sql` dump ELAVULT** — a 2026-08-15-ös migrációk
nincsenek benne (még `congregation_id NOT NULL`-t és `diocese_id` nélküli `iktato`-t mutat).
**Belőle tervezni tilos.** Írj egy csak-olvasó SQL-t Endrének, ami az ÉLŐ adatbázisból adja vissza:

1. a `districts` tábla tényleges oszlopkészletét,
2. a 6 scope-oszlopos tábla jelenlegi CHECK-jét és részleges indexeit,
3. a `current_user_*` függvények meglétét **és GRANT-jait** (`has_function_privilege`),
4. hogy a `felettes_szint_hozzaferese()` prosrc-je tartalmaz-e `district_id`-t (K4!),
5. ki milyen `district` hatókörű `profile_roles` sorral rendelkezik,
6. a `diocese_felterjesztes` egyedi indexét: a **három**oszlopos (rossz) vagy a
   **négy**oszlopos (helyes) van-e érvényben.

### S1 · P0 hatókör-biztonság (döntésfüggetlen — kezdd ezzel)

- `level-scope.ts`: `DISTRICT_WRITE_ROLES` / `DISTRICT_READ_ROLES` +
  `resolveDistrictWriteScopeIds` / `resolveDistrictReadScopeIds` /
  `canWriteDistrictScope` / `describeDistrictWriteBlock` — a `resolveDioceseIdsForRoles`
  (`level-scope.ts:211-242`) **betűhű** mintájára.
- `effective-access.ts:344`: az `egyhazkeruletiAdmin` ma KIZÁRÓLAG a `profiles.role`
  skalárból jön. Kapjon `profile_roles` district-lábat, vagy a három kerületi belépő-kapu
  térjen át `canReadDistrictScope`-ra.
- A **három divergens** kerület-feloldó egységesítése: `getAdminDistrictScope()`
  (`admin-scope.ts:46-51`, szűretlen + feltétel nélküli skalár-unió),
  `resolveDistrictScopeIds` (fallback-elvű), `current_user_district_ids()` (szerep-szűrt).
- A `districts` SELECT policy **szűkítése** a törzsadat-bővítéssel EGY tranzakcióban:
  ma `USING(true)` `authenticated`-re **és külön `anon`-ra is**
  (`2026-04-13-rls-reference-tables.sql:24`, `2026-06-03c-…:29-31`) — a CIF, IBAN,
  pecsét, aláírás nem mehet ki anonim olvasónak.

### S2 · Kerületi identitás

`districts` bővítése a `dioceses` mintájára: `nev_ro` (**kötelező** — a 2026-08-15-i
tanulság), `nev_en`, `cim_*`, `cif`, `adoszam`, `email`, `telefon`, `weboldal`,
`bank_nev`, `bank_fo_iban`, vezetők nevei, `cimer_url`, `pecset_url`, `alairas_url`.
Hozzá: `DistrictSetupWizard` + `DistrictSummaryDialog` + „Egyházkerületünk" /
„Egyházkerület beállításai" a headerben (admin profilnál REJTVE) + sidebar-bővítés
**csak megépült célpontokra** + storage bucket (`districts-logos`) a
`2026-04-18-dioceses-cimer-setup.sql` mintájára.

### S3 · Fogadó felület — ez a legnagyobb üzleti nyereség

A megye ma felküld, **a kerület nem látja**. Nulla kerületi fogyasztója van a
`diocese_felterjesztes` táblának. Kell: lista megyénként és évenként a 4 doc_type-ra,
„Átvettem" (`received_at/_by`), visszaküldés **kötelező indoklással**, a fagyasztott
pillanatkép megtekintése/nyomtatása, és a **feloldás-kérések elbírálása**.
Plusz: a megyei kártyán jelenjen meg az „Átvéve" / „Visszaküldve" státusz — ma csak
„Felküldve"-t mutat. És **értesítés**: a lánc ma némán fut, senki nem kap jelzést.

### S4 · Kerületi archívum + összesítő

`/dashboard-kerulet/iratok` (a `getSubmissionMatrix('district')` már megy) és
`/dashboard-kerulet/osszesito` a `lib/diocese/osszesito-core.ts` mintájára — megyénkénti
bontással, a **hiányzó megyék látható listájával**, a `returned` státusz kizárásával.

### S5 · Kerületi könyvelés + leltár + iktatás (K2-függő, a legnagyobb)

Kettős minta, ahogy a megyénél: a **pénzügy külön táblákat** kap
(`district_befizetes/kiadas/bealitas/koltsegvetes/annual_reports`), a **leltár/iktató
scope-oszlopot** (`district_id`) a meglévő 6 táblán. Kód: `FinanceScope` és `ModuleScope`
harmadik ág, `initFinanceDistrict`, `next_iktato_sequence_dis` RPC.

### S6 · Nyomtatvány kerületi ág

`printScope?: 'congregation' | 'diocese' | 'district'` + a 4 elágazási pont kerületi
felirat-készlete, kétnyelvű fejléc a `districts.nev_ro`-ból, kerületi iktatószám és
közgyűlési határozat a borítón, püspök + főgondnok aláírás. **A 4 oldalas korlát él.**

### S7 · Mentés, Kuka, önellenőrzés

Minden új `district_*` tábla besorolása a `backup_table_policy`-ba, az `inventory.ts`
őrének kiterjesztése, a Kuka védelme, `selftest` bővítés kerületi ív-őrrel — és
**a gyülekezeti + megyei alak VÁLTOZATLANSÁGÁNAK** ellenőrzésével.

---

## 5. ⛔ CSAPDÁK — MINDEGYIK BIZONYÍTOTT, MINDEGYIK EL FOG SÜLNI

### BLOKKOLÓ

**1. A kétoszlopos XOR scope-őr MINDEN kerületi sort elutasít.**
`CHECK (num_nonnulls(congregation_id, diocese_id) = 1)` — kerületi sornál mindkettő NULL,
tehát 0 ≠ 1, és az első kerületi leltári tétel 23514-gyel elhasal.
*Bizonyíték:* `2026-08-15-egyhazmegyei-scope-oszlopok.sql:252-270`.
*Megelőzés:* mind a 6 táblán DROP + ADD háromoszlopos CHECK-re, **egyetlen tranzakcióban**
(különben van egy pillanat scope-őr nélkül). Az idempotencia-őr **ne a névre**, hanem a
definícióra nézzen — a repó mintája `conname`-alapú, és a bővítés némán kimaradna.

**2. Besorolatlan `district_*` tábla → a napi mentés MINDEN gyülekezetnél leáll.**
Az `assertInventoryClassified` dob, és ez a **0. lépés** minden hatókör előtt.
*Bizonyíték:* `apps/web/lib/backup/inventory.ts:163-172` → `worker.ts:514-518`.
*Megelőzés:* minden új táblát létrehozó SQL 1. szakaszának VÉGÉRE, **ugyanabba a
tranzakcióba**: `INSERT INTO backup_table_policy (tabla, …) … ON CONFLICT (tabla) DO UPDATE`.
⚠️ A kulcsoszlop neve **`tabla`**, NEM `table_name` — ez már egyszer elbukott (#172).

**3. `iktato_csatolmany`: nincs egyoszlopos FK az `iktato_id`-n.**
Kerületi sornál mindkét kompozit FK **vákuumosan teljesül** (MATCH SIMPLE), tehát a
csatolmány bármelyik — akár nem létező, akár idegen — iktató-sorra mutathat.
*Megelőzés:* `iktato ADD CONSTRAINT iktato_id_district_uk UNIQUE (id, district_id)`,
majd a harmadik kompozit FK — a scope-oszloppal egy tranzakcióban.

### SÚLYOS

**4. `resolveDistrictScopeIds` szerep-SZŰRETLEN** (`level-scope.ts:339-357`): bármely
`district` hatókörű `profile_roles` sor (akár `custom`, `lelkesz`) kerületi hatókörnek
számít az appban, miközben az RLS csak `egyhazkeruleti_admin`-t enged. Ez pontosan az a
réteg-divergencia, ami a számvevőnél **üres képernyőt hibaüzenet nélkül** okozott.

**5. Egyediségi indexek**: az iktatószám és a leltári szám egyedisége KIZÁRÓLAG
scope-részleges indexeken áll. Kerületi sorra egyik sem illeszkedik → **duplikált
iktatószám** egy hivatalos iraton. Ugyanez az évzárásnál: több lezárás-sor ugyanarra a
(kerület, év) párra, és a `getYearClosure` `.maybeSingle()`-je a PGRST116-ot elnyeli →
**a lezárt év újra iktathatóvá válik**.

**6. A sorszám-RPC `ON CONFLICT … WHERE` arbitere** részleges egyedi indexet keres.
Ha az index külön, később futtatott fájlba kerül, MINDEN kerületi iktatás 42P10-zel áll meg.
→ oszlop + index + RPC + GRANT **egyetlen tranzakcióban**.

**7. Az `uj-tablak.sql` újrafuttatása visszahozza a 3 oszlopos egyedi indexet**, és a
költségvetés-módosítás felküldése némán felülírja az előzőt.
→ a kerületi SQL 0. szakasza fail-closed `RAISE EXCEPTION`-nel álljon meg, ha a hármas visszatért.

**8. A gyülekezeti policy-burkoló DO-blokk újrafuttatáskor megeszi a district-lábakat**
(a szűrője csak `%diocese%`-t zár ki). → egészítsd ki `district`-kizárással.

**9. Kerületi UPDATE-policy a megye FAGYASZTOTT iratát is felülírhatja** — a
`diocese_felterjesztes_kerulet_update` USING/WITH CHECK-je csak a `district_id`-t nézi,
oszlop-korlát nincs. → BEFORE UPDATE trigger: csak `status`, `received_*`,
`returned_reason`, `notes`, `unlock_*` változhat; `snapshot_data` **soha**.

**10. `diocese_felterjesztes.district_id` nincs a valódi megye→kerület lánchoz kötve** —
egy esperes tetszőleges kerülethez küldhet fel. → kompozit FK `(diocese_id, district_id)`.

**11. A kerületi admin az EGÉSZ ORSZÁG szerepkör-tábláját látja és törölheti** —
a `profile_roles_admin_manage` USING-ága hatókör nélküli.

**12. `tablesFor()` és `yearValueFor()` else-ága némán a gyülekezeti térképet adja.**
A `FinanceScope` bővítése **nem ad fordítási hibát** → a kerületi könyvelés a
gyülekezeti táblákba írna. → hozd exhaustive alakra (`switch` + `default: const _n: never`).

**13. A Kukának nincs kerületi útja**, a heti takarítás viszont **fizikailag töröl**.
→ rövid táv: a `purge_recycle_bin()` DELETE-jét szűkítsd `AND congregation_id IS NOT NULL`-ra.

**14. A kerületi sorok bekerülnek a mentésbe, de NINCS visszaállítási útjuk** — a
Visszaállítás gomb minden nem-gyülekezeti hatókörű táblára „MEGTAGADVA"-t ad.
→ Endre döntése; addig is legyen kiírva a felületen, hogy kerületi szinten nincs
önkiszolgáló visszaállítás.

---

## 6. MUNKAMÓDSZER

- **Workflow-val dolgozz**, a megyei kör mintájára: felmérés → szelet-építés párhuzamosan →
  adverzariális ellenőrzés. A szeleteket **ne** egyetlen óriási workflow-ban futtasd —
  szeletenként PR, hogy Endre menet közben tesztelhessen.
- **Minden szelet végén zöld kapu:** `typecheck` (web + desktop), `selftest`, `lint 0 error`.
- **Git:** MINDIG friss ág `origin/main`-ről (`git fetch origin main && git checkout -b … origin/main`).
  A squash-merge után a régi ágra épített commit CONFLICTING PR-t ad, ami el sem indítja a CI-t —
  ez már kétszer megtörtént.
- **Lint-csapdák:** `react-hooks/set-state-in-effect` (szinkron setState effect-törzsben = ERROR),
  `'use server'` fájlban csak async függvény exportálható (típusok külön `*-shared.ts`-be).
- **Endre menet közben ír észrevételeket.** Ha érkezik egy, ne söpörd a végére: ha kicsi,
  javítsd az aktuális szeletben; ha nagy, vedd fel külön szeletnek és mondd meg, hova tetted.
- **Ha bizonytalan vagy egy élő állapotban, ne tippelj** — írj Endrének egy csak-olvasó
  ellenőrző SQL-t, és az eredményből dolgozz.
- **A migrációs fájl megléte NEM bizonyíték arra, hogy lefutott élesben.** Ez a projektben
  már kétszer okozott hibát (legutóbb a `dioceses-logos` bucket miatt: „Bucket not found").

---

## 7. KÉSZ-DEFINÍCIÓ

A kerületi szint akkor kész, ha egy kerületi felhasználó be tud lépni, látja **kizárólag**
a saját kerülete megyéit és gyülekezeteit, a beállítás-varázslóban megadja a hivatalos
adatokat (román névvel, címerrel, pecséttel), **átveszi** a megyék felterjesztéseit,
**visszaküldi** a hibásat indoklással, **elbírálja** a feloldás-kéréseket, megnyitja az
archívumot évekre visszamenőleg, elkészíti az összesítőt — és mindezt a napi mentés
hiánytalanul tartalmazza.
