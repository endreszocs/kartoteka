# EGYHÁZMEGYEI SZINT — TELJES KIVITELI TERV (2026-08-15)

**Ez egy TERV-dokumentum. Kód ebben a körben nem készült.** Minden állítás mellett
fájl:sor vagy külső forrás-hivatkozás áll. A terv két előkészítő felmérésre épül:
az állapot-felmérésre (repó-kódtérkép + szivárgás-leletek) és a
követelmény-kutatásra (Kánon, Legea 489/2006, EREK-dokumentumok — források a
dokumentum végén).

**Endre követelményei (szó szerint értelmezve):**
1. Az egyházmegye CSAK a saját gyülekezeteit láthatja.
2. Az egyházmegyének SAJÁT leltára, könyvelése, iktatása van — a MEGLÉVŐ modulok
   újrahasznosításával, diocese-ID-hez kötve.
3. A beküldött hivatalos iratok (számadás, költségvetés, módosítás, vagyonleltári
   jelentés, választók névjegyzéke) gyülekezetenként, ÉVEKRE VISSZAMENŐLEG,
   átláthatóan.
4. ÖSSZESÍTŐ felület, amivel az egyházmegye a begyűjtött adatokat összesítve
   FELKÜLDI az egyházkerületének.
5. A kinézet a gyülekezeti felülettel AZONOS design-nyelvű, csak megyei
   kimutatásokkal.
6. A headerben megyei profilnál „Egyházmegyénk" és „Egyházmegye beállításai"
   (admin oldalon rejtve).
7. KÉSŐBBI fázis: egyházmegyei offline Windows program (itt csak fejezet-vázlat).

---

## 0. TALÁLT BIZTONSÁGI HIBÁK — P0, AZONNAL JAVÍTANDÓ SZELET

Az állapot-felmérés IGEN, talált olyan hibákat, amelyeken keresztül más megye
(vagy jogosulatlan szerep) adatai láthatók/írhatók. Ez a szelet (S1, lásd 5.
fejezet) MINDEN más munka ELŐTT megy.

### 0.1 ⛔ A diocese_* RLS-policyk `pr.scope='diocese'` ága SZEREP-SZŰRŐ NÉLKÜLI

**Hol:** `migration-docs/sql/2026-08-09-megye-kerulet-rls-fix.sql:236` (és a
párhuzamos ágak: :252, :273, :289, :310, :326 — mind az öt táblán:
`diocese_bealitas`, `diocese_befizetes`, `diocese_kiadas`, `diocese_koltsegvetes`,
`diocese_annual_reports`). A `FOR ALL` policy harmadik ága így szól:

```sql
OR (pr.scope = 'diocese' AND pr.scope_id = diocese_bealitas.diocese_id)
```

— **nincs `pr.role IN (…)` szűrés**. Következmény: BÁRMILYEN jóváhagyott, aktív
`diocese` hatókörű `profile_roles` sor (akár `custom`, `konyvelo`, `lelkesz`
szerepű!) direkt PostgREST-hívással **ÍRHATJA** a megye pénzügyi könyveit. Az app
oldalon a `level-scope.ts` szerep-szűrt feloldói (DIOCESE_WRITE_ROLES:172,
DIOCESE_READ_ROLES:178) kizárják őket — de az adatbázis nem, és a védelemnek a
DB-n KELL élnie (a memóriában rögzített hibaosztály: „minden RLS-policynek
profile_roles-láb kell" — de SZEREP-SZŰRT láb kell).

A `2026-08-11-szamvevo-megyei-hozzaferes.sql` csak a `egyhazmegyei_szamvevo`-t
zárja le RESTRICTIVE policyval, és SAJÁT MAGA dokumentálja (215., 231–232. sor),
hogy a custom-lyukat NYITVA hagyja.

**Javítás (S1 szelet, SQL):** az öt `diocese_*_all` policy újraírása úgy, hogy a
diocese-ág a KANONIKUS SQL-függvényeket használja:
- írás (`FOR ALL` / `WITH CHECK`): `diocese_id IN (SELECT current_user_diocese_ids())`
  — ez már szerep-szűrt (esperes + egyhazmegyei_admin, definíció:
  `2026-08-11-globalis-hozzaferes-szukites.sql:824`, app-tükör:
  `apps/web/lib/auth/level-scope.ts:172`);
- olvasás: külön `FOR SELECT` policy `current_user_diocese_olvaso_ids()`-szal
  (+ számvevő; app-tükör: level-scope.ts:178).
Így a policy és az app SOHA nem húzhat szét — pontosan az a széthúzás szűnik
meg, amit a level-scope.ts fejléce (37–67. sor) hibaosztályként dokumentál.

### 0.2 ⛔ „Futott-e élesben?" — állapotfelmérés kötelező (a migration-fájl NEM bizonyíték)

A kor6-memória szerint a `2026-08-11-szamvevo-megyei-hozzaferes.sql` a
futtatásra-váró listán volt; a `2026-08-09-megye-kerulet-rls-fix.sql` állapota
sem igazolt. A repó és a produkció NÉMÁN széthúzhat (rögzített hibaosztály:
„A migration-fájl NEM bizonyíték").

**Javítás (S1 SQL, 0. szakasz):** az új SQL-fájl ELEJÉN fail-closed
állapotfelmérés:
- `pg_policies`-ből ellenőrizni, hogy az öt `diocese_*_all` policy szövege
  tartalmazza-e a szerep-szűrőt (ha az új szöveg már él → NOOP, idempotencia);
- `pg_proc`-ból ellenőrizni, hogy `current_user_diocese_ids()` és
  `current_user_diocese_olvaso_ids()` LÉTEZIK-e élesben — ha nem, a fájl
  `RAISE EXCEPTION`-nel álljon le beszédes magyar üzenettel (ne fusson tovább
  hibás előfeltétellel);
- **GRANT-tanulság** (memória: „RLS-policy auth sémából olvas → GRANT nélkül
  403-leállás"): a policy a HÍVÓ szerepében fut. Minden érintett függvényre és
  táblára `has_table_privilege` / `has_function_privilege` ellenőrzés az
  `authenticated` szerepre, és ahol kell, explicit `GRANT EXECUTE` /
  `GRANT USAGE+SELECT` — MÉG A POLICY-CSERE ELŐTT, egy tranzakcióban (a
  „átmeneti tágítást okozó előfeltétel menjen egy tranzakcióba" tanulság).

### 0.3 ⚠️ Skalár-hatókör maradványok: kerületi admin elavult skalárral MÁS megye törzsadatát írhatja

A `resolveDioceseScopeIds` (`apps/web/lib/auth/level-scope.ts:134-154`)
szerep-SZŰRETLEN, és skalár-fallbackkel dolgozik. Ezt használja:
- `getDioceseScopeContext` (level-scope.ts:359 → :366),
- `resolveDocumentScope` (`dashboard-egyhazmegye/document-actions.ts:828`),
- `requireDioceseAccess` (`dashboard-egyhazmegye/diocese-actions.ts:119` és a
  :128 esperes-ág; ugyanez `chitanta-tombok-actions.ts:64,71`),
- `getDioceseAnnualReports` (`eves-jelentes/actions.ts:226`).

Mivel `access.esperes = isEsperesRole()` az `egyhazkeruleti_admin`-t IS lefedi
(`lib/auth/roles.ts:35-41`, a level-scope.ts:259-262 kommentje is rögzíti): egy
kerületi admin ELAVULT `profiles.diocese_id`-vel (akár MÁSIK kerület megyéje!)
diocese-scope `profile_roles` sor nélkül:
- látja annak submission-mátrixát és éves jelentéseit, ÉS
- a `diocese-actions.ts:128` esperes-ágán `canManage=true`-val a törzsadatait
  (IBAN, CIF, címer, kapcsolat) **SZERKESZTHETI** — ezen az ágon nincs
  district-ellenőrzés (a :136 kerületi-admin ág `assertDioceseInScope`-ja ide
  el sem jut, mert a :128 előbb igazra vált).

Edge-eset (csak profile_roles-mentes user + elavult skalár), de PONTOSAN a
memóriában rögzített skalár-hibaosztály („Skalár hatókör + `if (id) filter` =
néma teljes szivárgás").

**Javítás (S1, app-oldal):**
- `requireDioceseAccess` :128 esperes-ága a szerep-szűrt
  `resolveDioceseWriteScopeIds(access)`-t használja `resolveDioceseScopeIds`
  helyett; a kerületi admin KIZÁRÓLAG a :136 `assertDioceseInScope`-os ágon
  mehet át (a :128-as ágból explicit kizárni: `access.esperes &&
  !access.egyhazkeruletiAdmin`, vagy egyszerűbben: a :128 feltétele legyen
  `resolveDioceseWriteScopeIds(access).includes(targetId)`);
- `resolveDocumentScope` (document-actions.ts:828) és `getDioceseAnnualReports`
  (eves-jelentes/actions.ts:226) olvasói ágai `resolveDioceseReadScopeIds`-re
  váltanak;
- `getDioceseScopeContext` a `scopeId`-t továbbra is a tág feloldóból adhatja a
  MEGJELENÍTÉSHEZ (hero-cím), de kap két új mezőt: `readScopeIds` és
  `writeScopeIds` (szerep-szűrt), és a hívók listaszűrésre CSAK ezeket
  használhatják — a JSDoc-ban magyar MIÉRT-kommenttel.

### 0.4 ⚠️ `document_submissions_diocese_access` — a régi, NULLABLE oszlopon pivotáló policy MA IS ÉL

**Hol:** `migration-docs/sql/2026-04-17-document-submissions-fix.sql:89-109` —
`FOR ALL` policy, a sor NULLABLE `diocese_id` oszlopán pivotál. Párja az
app-oldali fallback: `submitDocument`-ben
`rowDioceseId = congDioceseId || profile?.diocese_id`
(`document-actions.ts:354-355`). Megye-besorolás nélküli gyülekezet + elavult
beküldő-skalár = a beküldött sor MÁS megye RLS-nézetébe eshet.

**Javítás (S1):**
- SQL: a régi policy DROP + csere a 2026-08-11-es kanonikus mintára
  (`document_submissions_szint_all` / `felettes_szint_gyulekezet_ids` — a
  valódi `congregations.diocese_id` láncon);
- app: a `submitDocument` fallback fail-closed lesz — ha a gyülekezetnek nincs
  `diocese_id`-ja, magyar hibaüzenet („A gyülekezethez nincs egyházmegye
  rendelve — kérd a rendszergazdát, hogy állítsa be; enélkül a beküldés rossz
  egyházmegyénél kötne ki."), NEM néma skalár-fallback.

### 0.5 🟡 Kapu nélküli / divergens apróságok

- `checkDioceseSetupStatus` (`diocese-actions.ts:348`): bármely bejelentkezett
  user tetszőleges dioceseId-re hívhatja. Csak mezőnév-listát ad vissza
  (minimális kockázat), de kapu nélküli → S1-ben `requireDioceseAccess(id,
  'read')` kapu elé.
- `listAssignments` (`admin/profile-congregations-actions.ts:58`):
  `isDioceseLevel` CSAK skalár role-ból → a profile_roles-only esperes hibát
  kap, a megyei dashboard `pendingAssignments`-e némán üres (fail-closed
  divergencia, nem leak) → `canReadDioceseScope(access)`-re váltás.

### 0.6 Kapcsolódó, de KÜLÖN kezelendő tétel

Az esperes ma több NEM-diocese táblán GLOBÁLIS hozzáférésű
(`current_user_has_global_access`) — a megyére szűkítés terve kész:
`docs/project-tracking/KARTOTEKA-jovobeli-esperes-megyei-admin-szukites.md`,
futtatás előtt kötelező audittal. Ez NEM az S1 része (nagy robbanási sugár),
külön szeletként ütemezzük (S9), Endre külön jóváhagyásával — lásd 6. fejezet
D6 döntés.

---

## 1. ADATMODELL

### 1.1 Ami MÁR VAN (újrahasznosítandó)

| Tábla | Szerep | Kulcs | Megjegyzés |
|---|---|---|---|
| `dioceses` | törzsadat (név, IBAN, CIF, címer…) | id | setup-wizard írja (`components/modals/diocese-setup-wizard.tsx`) |
| `diocese_befizetes` / `diocese_kiadas` | megyei főkönyv | diocese_id | a `tablesFor('diocese')` térkép köti be (`lib/auth/finance-scope.ts:93-108`) |
| `diocese_bealitas` | éves konfig + véglegesítés-flagek | diocese_id + eve (int!) | `szamadas_veglegesitve`, `koltsegvetes_veglegesitve` |
| `diocese_koltsegvetes` | megyei költségvetés | diocese_id + eve | |
| `diocese_annual_reports` | megyei zárszámadás-snapshot | diocese_id + year | ⛔ MA 0 fogyasztó — zsákutca (3.4 pont) |
| `document_submissions` | gyülekezet→megye beküldések | congregation_id + year + document_type | MIND A 6 irat-típus megvan (`lib/constants/documents.ts:6-15`) |
| `chitanta_tombok` (scope='egyhazmegye') | megyei nyugtatömbök | | `dashboard-egyhazmegye/chitanta-tombok-actions.ts` |
| `annual_reports` | GYÜLEKEZETI éves jelentések | congregation_id | a megye olvassa (`eves-jelentes/actions.ts:211`) |

### 1.2 Az újrahasznosítás elve: SCOPE-OSZLOP a meglévő táblákon (nem tábla-duplikálás)

Endre kérése: „a MEGLÉVŐ modulok újrahasznosításával, diocese-ID-hez kötve".
Két minta él a repóban:
- **(a) külön `diocese_*` táblák** — a pénzügy így épült (tablesFor-térkép).
  Ott indokolt volt: az oszlopkészlet ELTÉR (eve int vs id string, más
  kategória-oszlop — finance-scope.ts:76-86 dokumentálja).
- **(b) scope-oszlop a meglévő táblán** — a `chitanta_tombok` így megy
  (scope='egyhazmegye').

**A leltárra és az iktatóra a (b) mintát javasoljuk**, mert:
1. az oszlopkészlet AZONOS lenne (nincs finance-féle eltérés-kényszer);
2. az iktatónak 3 mellék-táblája van (`iktato_csatolmany`, `iktato_sablonok`,
   `iktato_yearly_closures` — lásd `iktato/actions.ts`, `csatolmany-actions.ts`,
   `template-actions.ts`), duplikálásuk a „második felület a régi implementációt
   őrzi" hibaosztály melegágya lenne;
3. a közös kód (actions, UI) egyetlen `scopeCol`-kapcsolóval megy — soha
   széthúzó másolat.

**Migráció-terv (idempotens, ellenőrzéssel):**
```
leltar_tetelek, iktato, iktato_sablonok, iktato_yearly_closures:
  + diocese_id uuid NULL REFERENCES dioceses(id)
  congregation_id: NOT NULL → NULL-ozható (ALTER ... DROP NOT NULL)
  + CHECK (num_nonnulls(congregation_id, diocese_id) = 1)   -- pontosan az egyik!
```
A CHECK a fail-closed őr: sor nem létezhet scope nélkül, és nem lehet
„mindkét scope-é" sem. Az `iktato_csatolmany` az iktato-sor FK-ján át örökli a
scope-ot, oszlop-bővítés ott nem kell (de az RLS-ét a szülő-lánc szerint kell
újraírni).

### 1.3 ÚJ táblák (későbbi szeletek)

| Tábla | Cél | Szelet |
|---|---|---|
| `diocese_felterjesztes` | megye→kerület felküldés (összesítő, saját számadás/költségvetés) — **explicit NOT NULL** `diocese_id` + `district_id`, doc_type, year, status, snapshot_data, iktatoszam | S6 |
| `valasztoi_nevjegyzek` | névjegyzék-állapotgép (Kánon 37.§) gyülekezetenként+évente; a beküldés maga továbbra is `document_submissions` | S7 |
| `vizitacio` + `vizitacio_meghagyas` | esperesi vizitációk (Kánon 74–75.§) + meghagyás-nyilvántartás | S8 |

MIÉRT külön `diocese_felterjesztes` és nem a `document_submissions` bővítése:
a 0.4 pontban dokumentált hibaosztály (nullable pivot-oszlop) pontosan abból
jött, hogy egy tábla két különböző küldő-szintet szolgált ki. A felküldő lánc
két végpontja itt MÁS ENTITÁS (megye→kerület), explicit NOT NULL oszlopokkal
olcsóbb és biztonságosabb, mint a meglévő tábla felpuhítása.

### 1.4 RLS-terv (minden új/módosított policyre)

Alapelvek (a memóriában rögzített tanulságokból):
1. **Kanonikus függvények**: minden diocese-ág `current_user_diocese_ids()`
   (írás) ill. `current_user_diocese_olvaso_ids()` (olvasás) — SOHA nem kézzel
   másolt EXISTS-lánc. Így egyetlen helyen él a szerep-lista, és az app-tükör
   (level-scope.ts:172,178) sem húzhat szét.
2. **GRANT-tanulság**: minden SQL-fájl 0. szakasza `has_table_privilege` /
   `has_function_privilege` ellenőrzéssel indul; ha a policy bármit olvas, amire
   az `authenticated`-nek nincs joga, a fájl beszédes hibával áll le, és a
   GRANT a policy-cserével EGY tranzakcióban megy.
3. **Számvevő**: olvasás igen, írás nem — a meglévő RESTRICTIVE minta
   (`2026-08-11-szamvevo-megyei-hozzaferes.sql`) kiterjesztése az új táblákra.
4. **Gyülekezeti láb érintetlen**: a scope-oszlopos táblákon (leltar_tetelek,
   iktato…) a meglévő congregation-policyk kiegészülnek
   `AND congregation_id IS NOT NULL` őrrel, és ÚJ, különálló diocese-láb policy
   jön melléjük — a meglévő gyülekezeti viselkedés byte-ra változatlan marad.
5. **Idempotencia + záró ellenőrzés**: minden fájl végén SELECT-blokk, ami a
   policy-szövegeket és a jogosultságokat visszaellenőrzi (Endre futtatja, az
   eredményt visszaküldi — memória: „Bizonytalanságnál ellenőrző SQL").

---

## 2. MODULONKÉNTI TERV

### 2.0 Közös alap: modul-scope helper (S3 első lépése)

A pénzügy már EGY forrásból oldja fel a hatókört
(`penzugy/page.tsx:30` → `getFinanceScopeContext`, finance-scope.ts:144). A
leltár/iktató/dokumentumtár viszont `effectiveCongregationId`-t használ, és
diocese-scope-ban `CongregationOnlyNotice`-t ad (`leltar/page.tsx:36-41`,
`iktato/page.tsx:38`, `dokumentumtar/page.tsx:29`; oka:
`effective-access.ts:412-421` diocese-szerepnél null-t ad).

**Új közös helper: `apps/web/lib/auth/module-scope.ts`** — a finance-scope
mintájára, de tábla-térkép nélkül (a scope-oszlopos modellhez):
```ts
interface ModuleScopeContext {
  scope: 'congregation' | 'diocese'
  scopeCol: 'congregation_id' | 'diocese_id'
  scopeId: string          // fail-closed: nincs feloldható scope → { error }
  canWrite: boolean        // számvevő: false
  readOnlyReason: string | null
}
```
Feloldási sorrend és fail-closed viselkedés BETŰRE a finance-scope.ts:144-…
mintája szerint (aktív szerep dönt; skalár csak profile_roles-mentes „örökölt"
usernél; hibánál `{ error }`, SOHA szűretlen lekérdezés). Ezt használja a
leltár (S3), az iktató (S4) és később a dokumentumtár (S11 opció) — közös
helper, soha széthúzó másolat.

### 2.1 Könyvelés (Pénzügy) — MA IS MŰKÖDIK diocese-módban, hiányok:

Ami van: egy-forrás scope (penzugy/page.tsx:30), tablesFor-térkép, a bank/
monetár/leltár-ajánló fülek diocese-ban rejtve (`components/finance/
finance-tabs.tsx:456,622,776,781,941`), megyei nyugtatömbök.

Hiányok (S6-ba ütemezve, kivéve ahol jelezve):
1. **„Az egyházmegyei pénzügy mondjon igazat" 5 tételes audit** (6. kör 1. spec,
   RÉSZBEN kész) — tételes végigjárás, ami még hazudik, javítás.
2. `penzugy/actions.ts:1853-1858`: diocese-normalizálásnál
   `budget_mod1..3_finalized` hardkódolt false → a `diocese_bealitas`-ba fel
   kell venni a módosítás-flageket (SQL) és bekötni.
3. `lib/finance/budget-reporting.ts:566`: a borítón nincs egyházmegye-név és
   egyházkerület-sor → megyei borító-fejléc (a 4.2 pont név-helperével).
4. A megyei zárszámadás snapshot-ja NYERS `szerverOsszesito`
   (`penzugy/actions.ts:3375-3377`, saját kommentje szerint is) → kanonikus
   pillanatképre váltás (3.4 pont).
5. Ismert kapcsolódó hiba: desktopról 0-soros bealitas-UPDATE „success"
   (`docs/ATVILAGITAS-2026-08-15.md:186`, task#25) — az ottani javítással
   együtt kezelendő, itt csak hivatkozzuk.

### 2.2 Leltár diocese-módban (S3)

- `leltar_tetelek` + `diocese_id` oszlop (1.2 migráció) + RLS diocese-láb (1.4).
- `leltar/page.tsx:36-41`: a `CongregationOnlyNotice` helyett a module-scope
  helperrel diocese-ágra vált; a `leltar/actions.ts` minden
  `.eq('congregation_id', …)` hívása `.eq(ctx.scopeCol, ctx.scopeId)`-ra.
- Leltári szám-sorszámozás scope-onként külön számsor (a meglévő számozási
  logika scope-kulcsú szűréssel — NEM új implementáció).
- A meglévő funkciók (kategória-szűrők, kiemelt „új tétel" gomb — task#12;
  román/magyar fisa — task#11; 2500 lejes küszöb) VÁLTOZTATÁS NÉLKÜL öröklődnek,
  mert ugyanaz a kód fut.
- Delegált import (`getDelegatedImportStatus('inventory')`, leltar/page.tsx:49)
  első körben marad gyülekezet-only (import diocese-módban → 6. fejezet D9).
- A régi terv (`migration-docs/todo/phase-egyhazmegyei-penzugy-leltar.md`)
  `diocese_leltar` külön-táblás megközelítését ez a terv FELÜLÍRJA (1.2 indoklás).

### 2.3 Iktató diocese-módban (S4)

- `iktato`, `iktato_sablonok`, `iktato_yearly_closures` + `diocese_id` (1.2);
  `iktato_csatolmany` a szülő-láncon örökli.
- `iktato/page.tsx:38` + `iktato/actions.ts` (:34 a fő lekérdezés) + a
  mellék-actionok (csomo, qr, csatolmany, template) scope-kapcsolóra.
- Iktatószám-sorszám: a `lib/filing/sequence-preview.ts:65` congregation-kulcsú
  előnézete scope-kulcsúra bővül — megyénként+évenként saját számsor.
- **Esperesi hivatali pecsét + aláírás**: a task#24-ben megépült gyülekezeti
  PNG-pecsét/aláírás funkció újrahasznosítása megyei asszetekkel (tárolás a
  `dioceses` törzsadat mellé / storage diocese-prefixű útvonalra). Jogszabályi
  háttér: Legea 489/2006 Art. 15 — a pecséten kötelező a hivatalos elnevezés.
- Storage-útvonalak és storage-RLS: a csatolmányok bucket-szabályait a
  diocese-prefixre is ki kell terjeszteni — a szelet SQL-jének része.
- Ügykörjegyzék: az EREK-megfeleltetés
  (`docs/project-tracking/KARTOTEKA-iktato-EREK-ugykorjegyzek-megfeleloseg-2026-05-28.md`)
  megyei ügykörei ugyanabból a katalógusból jönnek; B6 (hivatali út: gyülekezet
  CSAK a megyén át levelez a kerülettel) az iktató-típusoknál jelzőként.

### 2.4 Dokumentumtár diocese-módban (S11, opcionális)

A `gyulekezeti_dokumentum` tábla (dokumentumtar/actions.ts:71) ugyanazzal a
scope-oszlopos mintával bővíthető. Endre listájában nem szerepelt kötelezőként
→ döntés a 6. fejezetben (D9).

---

## 3. BEKÜLDÖTT IRATOK ARCHÍVUMA + ÖSSZESÍTŐ → EGYHÁZKERÜLETI FELKÜLDÉS

### 3.1 Ami MÁR MŰKÖDIK (nem építjük újra)

Gyülekezet→megye lánc (állapot-felmérés, ellenőrizve):
`AccountingFinalizeWizard` → `finalizeAndSubmitAccounting` (zár-először) →
`submitDocument` → `document_submissions` upsert + felülírás-védelem + megyei
értesítés (`document-actions.ts:331-475`). Megyén: `getSubmissionMatrix:940`
(év-ablak, fail-closed) → `updateSubmissionStatus:528`
(received/reviewed/finalized/returned) → `forwardToKerulet:648` → kerületen:
`getKeruletSubmissions:708` + `acknowledgeKeruletReceipt:760`.

Mind a 6 irat-típus megvan (`lib/constants/documents.ts:6-15`): szamadas,
koltsegvetes, koltsegvetes_modositas, vagyonleltar, valasztok_nevjegyzeke,
lelkeszi_jelentes — Endre 3. követelményének típus-listája LEFEDETT, típus-
bővítő SQL NEM kell.

### 3.2 Archívum-nézet: gyülekezetenként, évekre visszamenőleg (S5)

A 6. kör 3. specje szerint a szint = ÚTVONAL: a mai 8 kliens-oldali fül helyett
alútvonalak a `/dashboard-egyhazmegye/*` alatt (ma NULLA alútvonal van, csak
page.tsx + actions). Első alútvonal: **`/dashboard-egyhazmegye/iratok`**:
- **Mátrix-nézet** (év-választóval): gyülekezet × irat-típus, státusz-jelzéssel —
  a meglévő `getSubmissionMatrix` adatcsomagjára épül (P2-#19 év-ablak +
  darabszám már megvan, page.tsx:125-129 komment).
- **Gyülekezeti dosszié-nézet** (ÚJ): egy gyülekezet ÖSSZES éve egy idővonalon,
  irat-típusonként csoportosítva, snapshot-nézővel — ez adja az „évekre
  visszamenőleg, átláthatóan" követelményt. Szerver-oldal: a meglévő
  lekérdezések congregation-szűrős változata (fail-closed:
  `assertCongregationInCallerDiocese`, `actions.ts:53` mintájára).
- Határidő-jelzés: a `DOCUMENT_DEADLINES` (documents.ts:100-109) alapján
  „késésben" badge (C2/C3 határidő-konfig → 6. fejezet D4).

### 3.3 Beérkeztetés-munkafolyamat: esperesi iktatószám + számvevői státusz (S5, az S4 után)

Követelmény (E1 + A1–A6): a beérkező iratra az esperesi hivatal IKTATÓSZÁMOT ad
(a lelkészi jelentés fejléce kifejezetten kéri — IT 65/2025,
`docs/EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md` 0. és 5. fejezet),
és a számvevő ellenőrzi (Kánon 90.§).

Terv:
- `document_submissions` + 2 oszlop (SQL): `diocese_iktato_id uuid NULL
  REFERENCES iktato(id)`, `szamvevo_ellenorizte_at timestamptz NULL` (+
  `szamvevo_ellenorizte_by`).
- `updateSubmissionStatus` „received" ágába beépül: ha a megyének van
  diocese-iktatója (S4 kész), EGY gombbal iktató-bejegyzés jön létre
  (tárgy = irat-típus + gyülekezet + év), és az iktatószám visszaíródik a
  submission-sorba. Nincs iktató → a mai viselkedés változatlan (fokozatos
  bevezetés).
- A „reviewed" státuszt a SZÁMVEVŐ is beállíthatja — ez az EGYETLEN megyei írás,
  amit a számvevőnek engedünk, DEDIKÁLT RLS-lábbal (RESTRICTIVE-kompatibilis,
  csak a két új oszlop + status='reviewed' átmenet) — minden más írása tiltva
  marad. (Ha ez túl finom szemcséjű az RLS-nek: alternatíva, hogy a reviewed-et
  is az esperes rögzíti „a számvevő ellenőrizte" pipával — 6. fejezet D3.)
- Esperes/számvevő aláírás + pecsét a kinyomtatott átvételi igazoláson: a 2.3
  pecsét-funkcióval.

### 3.4 A MEGYE SAJÁT számadásának zsákutca-javítása (S6)

Ma: `finalizeAccounting` diocese-ága (`penzugy/actions.ts:3350-3391`)
`diocese_bealitas` + `diocese_annual_reports` upsertet ír (submission +
finalization egyben, :3366 komment), de a `diocese_annual_reports`-ot SENKI NEM
OLVASSA (0 fogyasztó; a tablesFor.annualReport térkép-bejegyzés is holt), és a
snapshot a NYERS `szerverOsszesito` (:3375-3377 saját kommentje szerint sem
kanonikus).

Terv:
- a diocese-ág is a kanonikus pillanatkép-számítást használja (a gyülekezeti ág
  2026-08-11-es P0-javításának mintájára, :3394-től dokumentálva) — a megyei
  hivatalos ív végpont-kódjaira szűrve;
- a `diocese_annual_reports` MEGMARAD a megye saját zárszámadás-tárának, és
  VÉGRE fogyasztót kap: (a) a megyei Pénzügy „Számadás" nézete innen mutatja a
  véglegesített éveket, (b) a kerületi dashboard felterjesztés-nézete (3.6).

### 3.5 Számvevői összesítő (Kánon 90.§) — az „ÖSSZESÍTŐ felület" (S6)

Kánon 90.§: a számvevő a megye gyülekezeteinek zárszámadását és költségvetését
„kellő időben ÖSSZESÍTI". A hivatalos űrlapok: „Költségvetés számadás összesítő
– 2025" (reformatus.ro/?download=28475) és „Könyvelés 2026 – egyházmegyék
számára" (reformatus.ro/?download=30154).

Terv (két lépcső):
1. **MVP (S6):** `/dashboard-egyhazmegye/osszesito` alútvonal — a megye ÖSSZES
   gyülekezetének VÉGLEGESÍTETT számadás-snapshotjaiból (document_submissions
   snapshot_data, kanonikus kulcsokkal) soronkénti + kategóriánkénti összesítés
   képernyőn, Casa+Banca záróbontással és a következő évi nyitóval való
   összevetéssel (A3 követelmény), hiányzó gyülekezetek listájával (fail-closed:
   ami nincs véglegesítve, az LÁTHATÓAN hiányzik, nem némán nulla). Export:
   nyomtatható táblázat a meglévő nyomtatási-központ mintáival.
2. **Hivatalos űrlap-hű export:** CSAK azután, hogy Endre letöltötte a két
   xlsx-et (letöltéshez felhasználói engedély kell — 6. fejezet D2) és a
   mezőkészletet leegyeztettük. Az Excel-kitöltés mintája:
   `excel_koltsegvetes_fejlec_cellak` memória (B78/B79 fejléc-cellák analógia).
   Román rovatnevek kötelezők (Legea 489 Art. 16: „Evidenţa financiar-contabilă
   se va ţine şi în limba română" — kétnyelvű nyomtatvány, E6).

### 3.6 Felküldés a kerületnek (S6)

Új tábla: `diocese_felterjesztes` (1.3) + folyamat:
- az összesítő nézetből „Felterjesztés az egyházkerületnek" gomb → snapshot
  fagyasztás + státusz `submitted`;
- doc_type-ok első körben: `szamvevoi_osszesito`, `megyei_szamadas`,
  `megyei_koltsegvetes` (B1+B2 — az esperesi hivatal saját költségvetése/
  zárszámadása ugyanígy, a diocese_annual_reports-ból);
- kerületi oldal: a meglévő `getKeruletSubmissions`/`acknowledgeKeruletReceipt`
  minta ANALÓGIÁJÁRA (nem másolatára!) `getDioceseFelterjesztesek` +
  átvétel-nyugtázás a `/dashboard-kerulet` egy új kártyáján;
- RLS: diocese-oldal írás `current_user_diocese_ids()`, kerület-oldal olvasás/
  státuszírás a district-hatókör kanonikus függvényével.
- A gyülekezeti egyedi iratok TOVÁBBÍTÁSA (forwardToKerulet, :648) változatlanul
  él mellette — a felterjesztés az ÖSSZESÍTETT megyei csomag útja (B6 hivatali
  út elve).

### 3.7 Választói névjegyzék állapotgép (Kánon 37.§ — VERIFIKÁLT eljárásrend) (S7)

Új `valasztoi_nevjegyzek` tábla (1.3): congregation_id, year, status
(`keszul` → `kozszemlen` [máj. 15–23] → `dontes` [jún. 3-ig] → `felterjesztve`
[jún. 5-ig, 2 példány] → `fellebbezes` [jún. 20-ig] → `hitelesitve` [jún. 30,
esperesi keltezéssel] → `ervenyes` [júl. 1 → köv. év jún. 30, Kánon 38.§]),
dátum-mezőkkel + „esperesi példány az irattárban" jelzővel + hátralékos-de-
utólag-fizető tag hivatalbóli felvételének naplójával.
- A gyülekezeti oldalon a meglévő voters-tab beküldője
  (`submitDocument('valasztok_nevjegyzeke', …)`) kap egy állapot-sávot;
- a megyei oldalon a hitelesítés az esperes gombja (számvevőnek nincs joga),
  határidő-figyelmeztetésekkel.

### 3.8 Vizitáció-nyilvántartás (Kánon 74–75.§) (S8)

`vizitacio` tábla: diocese_id, congregation_id, datum, tipus
(rendes/rendkivuli), jegyzokonyv_iktato_id (a megyei iktatóra FK),
+ `vizitacio_meghagyas` sorok (szöveg, határidő, teljesítve). Szabály:
legalább 3 évente minden gyülekezet (évente ~1/3); 15 nappal előtte írásbeli
értesítés. A megyei dashboard kap egy „vizitációs ciklus" kártyát (mely
gyülekezetnél mikor volt utoljára — a 3 évnél régebbiek kiemelve), és a
lelkészi jelentés III.12 mezője (utolsó vizitáció dátuma) innen tölthető
(EREK-spec). A meghagyás-nyilvántartás a KONYVELES-doc:169 hiányát zárja.

---

## 4. HEADER, BEÁLLÍTÁSOK, KINÉZET — „azonos design-nyelv"

### 4.1 „Egyházmegyénk" + „Egyházmegye beállításai" a headerben (S2)

A gyülekezeti minta (memória: „Gyülekezeti-adat ablakok architektúra"):
„Gyülekezetünk adatai" READ-ONLY ablak; minden szerkesztés a setup-wizardban
(dialog-v2 variantok). Ugyanez megyeire:
- **„Egyházmegyénk"**: read-only adat-ablak a `dioceses` törzsadatból (név,
  kerület, IBAN, CIF, kapcsolat, címer) — a meglévő gyülekezeti ablak-komponens
  általánosításával (közös komponens, prop-alapú adatforrás; NEM másolat);
- **„Egyházmegye beállításai"**: a MEGLÉVŐ `diocese-setup-wizard.tsx` megnyitása
  menüpontból (ma csak auto-open hiányos adatnál — page.tsx:188-191);
- megjelenítés CSAK diocese-scope aktív profilnál; admin oldalakon rejtve
  (Endre explicit kérése) — a header-komponens scope-feltétele a sidebar
  `isDioceseScope` logikájával azonos forrásból.

### 4.2 Címduplázás-javítás (S2)

`dashboard-egyhazmegye/page.tsx:155` ma:
``` `${dioceseRow.name} Református Egyházmegye` ```
— miközben a `dioceses.name` MÁR tartalmazza a toldatot („Kézdi-Orbai
Református Egyházmegye", `migration-docs/sql/2026-04-30-dioceses-seed.sql:54`)
→ a hero „…Egyházmegye Református Egyházmegye"-t ír.

Javítás: a `lib/lelkeszi-jelentes/print.ts:119-124` duplázás-védő
heurisztikájának KIEMELÉSE közös helperbe (pl.
`lib/format/egyhazmegye-nev.ts`), és MINDKÉT hely (print.ts + page.tsx:155 +
a 2.1/3. borító-fejléc) ugyanazt hívja — közös helper, soha széthúzó másolat.

### 4.3 Sötét mód (S2)

`dashboard-egyhazmegye/page.tsx:207` és `:244` hardcode-olt light-gradient
(a `docs/ATVILAGITAS-2026-08-15.md:43` 32-fájlos listáján is szerepel). A
javítás a repó token-alapú mintájával (admin `_shared` készlet — memória:
„Admin redesign 2026-07"). Csak a megyei felület fájljait javítjuk itt; a
teljes 32-fájlos sötét-mód-kör a task#9 alatt marad.

### 4.4 Sidebar + fülek → alútvonalak (S2 alap, S3–S6 bővítés)

Ma: diocese-scope-ban CSAK Irányítópult + Pénzügy
(`components/layout/sidebar-adaptive-v4.tsx:669-670`), a 8 fülből 1 placeholder
(Misszió — `diocese-dashboard-tabs.tsx:322`), a Pénzügy a dashboardról nem
elérhető közvetlenül. Ez a „csupasz, gyülekezetitől eltérő felület" panasz oka.

Terv:
- S2: a `dioceseMainItems` bővítése a Pénzügy MELLÉ: Leltár, Iktató, Iratok
  (`/dashboard-egyhazmegye/iratok`), Összesítő — a még meg nem épült célpontok
  a szeletük szállításáig NEM kerülnek be (nincs halott link);
- a menüpont-lista egy helyen él (sidebar-adaptive-v4.tsx :669 blokk), a
  gyülekezeti szekció-struktúra (:692-696 „Fő modulok / Szolgálati
  adminisztráció") mintájára megyei szekciók;
- a 8 fül fokozatosan alútvonalakká válik (6. kör 3. spec) — fülenként akkor,
  amikor a tartalma szeletet kap; a Misszió-placeholder az S10
  (statisztikai csomag) szállításáig ELTŰNIK a fülsorból (ne mutasson üres
  ígéretet).

---

## 5. ÜTEMEZETT SZELETEK — mindegyik önállóan szállítható

Minden szelet: feature-ág → PR → CHANGELOG (lelkész-barát) → merge → deploy
(memória: „Munkamódszer: changelog + deploy fázisonként"). Az SQL-fájlokat
Endre futtatja (memória: „Nincs Supabase MCP"), MINDIG 0. szakasz
állapotfelméréssel + záró ellenőrző SELECT-tel.

| # | Szelet | Fő fájlok (becslés) | SQL | Függés |
|---|---|---|---|---|
| **S1** | **P0 biztonsági javítások (0. fejezet)** | ~7 kódfájl | 1 új | — |
| S2 | UI-alap: cím, sötét mód, header-ablakok, sidebar | ~8 fájl | nincs | — |
| S3 | Modul-scope helper + Leltár diocese-mód | ~6 fájl | 1 új | S1 |
| S4 | Iktató diocese-mód + pecsét | ~10 fájl | 1 új | S3 |
| S5 | Iratok-archívum alútvonal + beérkeztetés | ~7 fájl | 1 új | S1 (iktatószám-rész: S4) |
| S6 | Megyei számadás-javítás + Összesítő + Felterjesztés | ~9 fájl | 1 új | S1, S5 |
| S7 | Választói névjegyzék állapotgép | ~5 fájl | 1 új | S5 |
| S8 | Vizitáció-nyilvántartás | ~5 fájl | 1 új | S4 (iktató-FK) |
| S9 | Esperes globális→megyei RLS-szűkítés (kész terv-doc auditja + futtatás) | főleg SQL | 1 új | S1; külön jóváhagyás (D6) |
| S10 | Statisztikai csomag + Misszió-fül (6. kör 2. spec) | ~6 fájl | nincs/1 | S5 |
| S11 | (Opció) Dokumentumtár diocese-mód | ~4 fájl | 1 új | S3; döntés: D9 |
| S12 | Desktop offline egyházmegyei program | — | — | fejezet-vázlat lent |

### S1 — P0 biztonsági szelet (részletei a 0. fejezetben)

- **SQL** (`migration-docs/sql/2026-08-15-egyhazmegyei-rls-szerep-szuro.sql` —
  a megvalósító szelet hozza létre): 0. szakasz állapotfelmérés (0.2) → 5
  diocese_* policy újraírás kanonikus függvényekkel (0.1) →
  `document_submissions_diocese_access` csere (0.4) → GRANT-ok → záró
  ellenőrző SELECT-ek.
- **Kód:** `lib/auth/level-scope.ts` (read/write scope-mezők a kontextusban),
  `dashboard-egyhazmegye/diocese-actions.ts` (:119,:128 + :348 kapu),
  `dashboard-egyhazmegye/document-actions.ts` (:354-355 fail-closed, :828),
  `dashboard-egyhazmegye/chitanta-tombok-actions.ts` (:64,:71),
  `eves-jelentes/actions.ts` (:226),
  `admin/profile-congregations-actions.ts` (:58).

### S2 — UI-alap (4. fejezet)

`dashboard-egyhazmegye/page.tsx` (:155,:207,:244), új
`lib/format/egyhazmegye-nev.ts`, `lib/lelkeszi-jelentes/print.ts` (helperre
kötés), `components/layout/sidebar-adaptive-v4.tsx` (:669-674), header-komponens
+ „Egyházmegyénk" ablak (közös dialog-v2 variant), `diocese-setup-wizard.tsx`
menüből nyitás. Mobil-first ellenőrzés kötelező (memória-követelmény).

### S3–S8 — a 2–3. fejezet szerint

Mindegyik SQL-je: scope-oszlop migráció VAGY új tábla + RLS az 1.4 elvei
szerint, idempotensen. A kód a közös helpereken át megy; tilos a
„diocese-változat" másolat-fájl.

### S12 — Desktop offline egyházmegyei program — FEJEZET-VÁZLAT (későbbi terv-doc váza)

Ma a desktopon NINCS diocese-scope: `apps/desktop/src/lib/sync.ts` csak a
`profiles.diocese_id` OSZLOPOT szinkronizálja; a diocese_* táblák se az
offline-registryben (`apps/web/lib/offline/table-registry.ts:252` — csak
komment), se a desktopon. A majdani terv fejezetei:

1. **Scope-modell offline**: getDesktopUser() kiterjesztése diocese-szereppel
   (SOHA nem auth.getUser() — memória-szabály); profilváltó desktopon.
2. **Tábla-registry bővítés**: diocese_* pénzügyi táblák + scope-oszlopos
   leltár/iktató sorok szinkron-szabályai (szűrés: csak a SAJÁT megye sorai
   kerülnek a helyi DB-be — az offline gép nem hordozhat más megyét).
3. **Write-through és ütközés**: a meglévő E0–E3 write-through minta
   kiterjesztése; a „0-soros UPDATE = hamis success" hibaosztály
   (ATVILAGITAS:186) desktop-oldali őrrel.
4. **Beküldés offline**: felterjesztés/beérkeztetés csak online — offline
   sorba-állítás (queue) terve.
5. **Pixel-paritás**: a desktop⇄web paritás-módszertan (memória: B/D hullámok)
   alkalmazása a megyei képernyőkre.
6. **Telepítés esperesi hivatalokban**: aláírt build, auto-update, mentés.

---

## 6. NYITOTT DÖNTÉSEK ENDRÉNEK

| # | Döntés | Javaslatunk | Hol hat |
|---|---|---|---|
| **D1** | Leltár/iktató: scope-oszlop a meglévő táblán (b) VAGY külön diocese_* táblák (a)? | **(b) scope-oszlop** — 1.2 indoklás | S3, S4 |
| **D2** | A két reformatus.ro xlsx (?download=28475 összesítő űrlap, ?download=30154 egyházmegyei csomag) letöltése az összesítő mezőkészletéhez — engedélyezed/letöltöd? | MVP előbb enélkül (3.5/1. lépcső), űrlap-hű export utána | S6 |
| **D3** | A számvevő „reviewed" státusz-írása: kapjon dedikált szűk RLS-írási jogot, VAGY az esperes rögzíti „számvevő ellenőrizte" pipával? | dedikált szűk jog (a valós munkamenetet tükrözi) — de az RLS-komplexitás miatt elfogadható a pipa is | S5 |
| **D4** | Beadási határidők (C2/C3): a Kánon 57.§ m szerint „az egyházmegye rendelkezései szerint" — legyenek megyénként állítható határidő-mezők (dioceses vagy diocese_bealitas), amiket az esperes állít? | igen, megyénkénti konfig; alapértelmezés a mai `DOCUMENT_DEADLINES` (documents.ts:100-109) | S5 |
| **D5** | Kerületi fogadó oldal terjedelme most: csak átvétel-nyugtázás (MVP) VAGY teljes kerületi workflow (ellenőrzés, visszaküldés)? | MVP átvétel-nyugtázás; a kerületi szint saját köre később | S6 |
| **D6** | Esperes globális→megyei RLS-szűkítés (kész terv: docs/project-tracking/KARTOTEKA-jovobeli-esperes-megyei-admin-szukites.md): mikor fusson? | S1 UTÁN külön szeletként (S9), előtte kötelező audit | S9 |
| **D7** | Kassza-többlet bankba: 3 nap (Valtozasok 2026) vs 2 munkanap (Utmutato) — dokumentált ellentmondás (KONYVELES-doc:389-395). Melyik szabály éljen a figyelmeztetésekben? | döntést igényel (könyvelővel egyeztetve) | pénzügyi figyelmeztetések |
| **D8** | `custom` szerepű diocese-sorok: megerősíted, hogy megyei rálátást CSAK nevesített szerep (esperes/megyei admin/számvevő) kaphat, custom soha? | igen — a level-scope.ts:63-67 és az S1 RLS erre épül | S1 |
| **D9** | Dokumentumtár diocese-mód + megyei leltár-import kell-e az első körökben? | nem — S11 opcióként hátra | S11 |
| **D10** | `diocese_annual_reports` megtartása a megye saját zárszámadás-tárának (3.4) VAGY beolvasztás a diocese_felterjesztes-be? | megtartás + fogyasztó bekötése (kevesebb migráció, a tablesFor-térkép él) | S6 |

---

## FORRÁSOK

- RRE Kánon 2006 — http://nagyvaradret.ro/uploads/letoltesek/19349Kanon2006.pdf
  (37–38.§ választói névjegyzék; 57.§ m felterjesztések; 73.§ esperes; 74–75.§
  vizitáció; 90.§ számvevő; 98.§ e közgyűlés)
- Legea 489/2006 republicată (hivatalos PDF: mmuncii.gov.ro) — Art. 8, 10–12,
  14–16 (pecsét, román nyelvű nyilvántartás), 23–24, 27–28
- EREK adminisztráció-letöltések — https://reformatus.ro/dokumentumok/adminisztracio
- IT 65/2025 (lelkészi jelentés), IT 66/2023 (digitális munkanapló) —
  `docs/EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md`
- `docs/KONYVELES-2026-OSSZEHASONLITAS-TERV-2026-08-14.md` (Penzugyi_vizsgalat
  tételes követelmények, 41 vizsgálati tétel)
- `docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md` (ORDIN 3103/2017, OMFP
  2634/2015, OMFP 2861/2009, Legea 82/1991)
- `docs/project-tracking/KARTOTEKA-iktato-EREK-ugykorjegyzek-megfeleloseg-2026-05-28.md`
- `docs/project-tracking/KARTOTEKA-jovobeli-esperes-megyei-admin-szukites.md`
- Állapot-felmérés + követelmény-kutatás: a 2026-08-15-i előkészítő ágensek
  eredménye (e dokumentum 0–3. fejezetében fájl:sor szinten beépítve).
