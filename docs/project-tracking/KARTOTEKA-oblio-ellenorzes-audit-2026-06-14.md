# KARTOTEKA — `penzugy#oblio_ellenorzes` audit + fejlesztési terv

**Dátum**: 2026-06-14
**Módszer**: 18-ágenses workflow (5 kód-audit + 4 webkutatás + 8 adverzariális API-verifikáció + szintézis), ~1.4M token
**Állapot**: felmérés kész, implementáció nem kezdődött el
**Előzmény-doksik**: `KARTOTEKA-wc2-10-oblio-ellenorzes-2026-04-16.md`, `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`

---

## Vezetői összefoglaló

A `penzugy#oblio_ellenorzes` egy érett, funkciógazdag modul: manuális Oblio Wallet ZIP-letöltés →
File System Access API → JSZip → UBL parser → Dexie cache → 5-lépcsős matcher → `oblio_kiadas_match`
perzisztálás → diagnosztika / wizard / nyomtatás / 60 napos csengő.

Két **azonnali P0 adatvesztési kockázat** van (csendes fájltörlés), több **P1 hibás-párosítási**
és teljesítmény-probléma, és egy erős **megfelelőségi** szál (60 nap / 10 év archiválás, 15% bírság,
Legea 88/2026). A stratégiai irányt 8 ellenőrző ágens **három hivatalos forrással igazolta**: az
**Oblio API nem alkalmas a befogadott (primite) e-Factura lekérésére** — tehát a manuális ZIP **nem
technikai adósság**, hanem az Oblio korlátja; az egyetlen nevesített automatizálási út az **ANAF SPV
közvetlen REST API**.

---

## Hogyan működik ma (adatfolyam)

1. A lelkész az Oblio Walletből letölt egy ZIP-et a befogadott UBL XML-ekkel egy helyi mappába.
2. `oblio-folder.ts` (File System Access API) beolvassa → `processAllZipsInFolder` JSZip-pel kibontja
   (az n-edik PDF az n-edik XML alapnevére átnevezve, `semnatura_*` XML kihagyva).
3. `ubl-parser.ts` (DOMParser, UBL 2.1) parse-ol → `oblio-cache.ts` (Dexie/IndexedDB) cache-el.
4. `oblio-matcher.ts` 5 lépcsőben párosít a `kiadas` rekordokkal:
   (1) korábbi perzisztált match → (2) CUI + összeg ±1 RON + dátum ±60 nap → (3) név-substring + összeg + dátum →
   (4) csak összeg + dátum, ha pontosan 1 jelölt → (5) maradék párosítatlan.
5. A high-confidence match-ek `bulkSaveOblioMatches`-en át az `oblio_kiadas_match` táblába kerülnek
   (UNIQUE `congregation_id, anaf_uuid`; RLS + WITH CHECK gyülekezeti scope).
6. UI (`OblioEllenorzesTab.tsx`, ~1773 sor): KPI-sáv, szűrők, kézi párosító, diagnosztika, árva-PDF
   tartalom-elemzés (PDF.js), nyomtatási központ, 60 napos ANAF-csengő (`check_oblio_deadline_for_user` RPC).

Az Oblio REST kliens (`oblio-client.ts`/`oblio-auth.ts`, OAuth2 client_credentials) jelenleg **csak
kimenő számla-kiállításra** van, a befogadott egyeztetéshez nem.

---

## Erősségek (amit meg kell tartani)

- A 5-lépcsős, fokozatosan lazuló matcher jól strukturált; a determinisztikus CUI-elsőbbség → fuzzy-fallback
  sorrend egybevág az iparági reconciliation waterfall-mintával.
- Erős szerver-biztonság: minden action `getEffectiveAccessContext`-en megy át, RLS + WITH CHECK második védvonal →
  cross-tenant szivárgás kizárt.
- A UBL parser robusztus (localName-alapú namespace-kezelés, Invoice/CreditNote típus, CUI 3 forrásból, soha nem dob exception-t).
- Átfogó munkafolyamat (diagnosztika, kézi párosító, wizard, árva-PDF, nyomtatás); Dexie cache spórolja a parse-t.
- Az alapfeltevés helyes és **verifikált**: a manuális ZIP-import kanonikus út, nem indokolatlan kompromisszum.
- A shared UI komponens (`fileSystem: OblioFileSystem` props-interfész) készen áll a desktop-portolásra.

---

## ⚠️ P0 — azonnali kockázat (adatvesztés)

### P0-1 — Duplikátum auto-törlés csendben törli a felhasználó XML-fájljait `[critical]`
**Hol**: `OblioEllenorzesTab.tsx:462-504`
**Probléma**: a `handleRefresh` minden frissítéskor (auto-refresh-nél is) megerősítés nélkül törli a
„duplikátumnak" ítélt XML-eket. A kritérium pusztán `anafUuid || fileName` egyezés — mivel az UUID-kinyerés
nem 100%-os, két **különböző** számla azonos fallback-azonosítót kaphat, és a rendszer az „első" után az
összes többit véglegesen törli a lemezről. Nincs kuka, byte-összehasonlítás, visszavonás.
**Javaslat**: az auto-törlést alapból KI; duplikátum-csoportokat figyelmeztető sávban mutatni, csak explicit
kattintásra törölni. Ha automata kell: (1) tartalom-hash/byte-méret összehasonlítás, ne csak UUID; (2) törlés
helyett `duplikatum/` almappába mozgatás (puha törlés); (3) SOHA ne töröljön, ha a parse elbukott vagy az
`anafUuid` a fileName-re esett vissza. **Effort: M**

### P0-2 — `renameFileInFolder` névütközéskor másolás nélkül törli a forrást `[critical]`
**Hol**: `oblio-folder.ts:299-306`
**Probléma**: a „rename = olvas → új névvel ír → régit töröl" implementáció ütközés-ágon hibás: ha a cél
már létezik, az írás-blokk kimarad, de a `removeEntry(oldName)` feltétel nélkül lefut → az eredeti árva PDF
nyom nélkül törlődik (hamis tartalom-egyezésnél két különböző PDF kerülhet azonos bázisnévre).
**Javaslat**: ütközés-ágon NE töröld a forrást — vagy byte-egyezést ellenőrizz, vagy adj vissza hibát és kezeld
tovább árvaként, vagy egyedi `_(n)` szuffix. Minimum: a `removeEntry` csak a `!exists` (tényleges írás) ágban fusson. **Effort: S** ⭐ quick win

---

## P1 — jelentős hibák / teljesítmény / megfelelőség

| ID | Cím | Hol | Effort/Impact |
|----|-----|-----|------|
| **P1-1** | Pénznem-ellenőrzés teljes hiánya — deviza-számla téves párosítása. Az EUR `brut` közvetlenül a RON-összeghez hasonlítódik. **Javaslat**: currency-gate (eltérő pénznem → soha ne auto-high, `invoice_currency` oszlop). | `oblio-matcher.ts:245-368` | M / high ⭐ |
| **P1-2** | Sztornó/jóváíró (CreditNote) előjel nincs kezelve — egy jóváíró összegre egyezhet más valós kiadással. **Javaslat**: `signedBrut`, előjel-tudatos hasonlítás, sztornó alacsonyabb confidence. | `oblio-matcher.ts:258,296,341` | M / high |
| **P1-3** | Greedy, sorrend-függő hozzárendelés — nem globálisan optimális. Azonos beszállító+összeg+nap esetén az első tömbbeli XML viszi a kiadást. **Javaslat**: a name-ág tie-breakere nézze a dátum/összeg-deltát is; konfliktus-klaszterekre Hungarian-algoritmus; kétértelműnél ne auto-match. | `oblio-matcher.ts:256-349` | L / high |
| **P1-4** | Túl megengedő név-substring — fals pozitív auto-perzisztálás (cég-szótövek: `construct`, `trans`, `total`). **Javaslat**: szóhatár + min. hossz, stoplista, token-set/Jaro-Winkler; a name-ág csak CUI-megerősítéssel perzisztáljon. | `oblio-matcher.ts:106-129,302` | M / high |
| **P1-5** | `bulkSaveOblioMatches` N+1 szekvenciális round-trip — 500 számlánál time-out. **Javaslat**: valódi batch (egy `.in()` SELECT + egy `.upsert([])` + egyetlen `revalidatePath`). | `oblio-ellenorzes-actions.ts:216-234` | M / high ⭐ |
| **P1-6** | `localStorage 'oblio-dismissed-uuids'` globális kulcs — gyülekezetek közötti átszivárgás. **Javaslat**: `…::${congregationSlug}` kulcs, slug-váltáskor újratöltés. | `OblioEllenorzesTab.tsx:278,289` | S / high ⭐ |
| **P1-7** | Nincs lista-virtualizáció — 500+ sor egyszerre renderelődik; a `Row` nincs memo-zva. **Javaslat**: virtualizáció vagy lapozás + `React.memo`. | `OblioEllenorzesTab.tsx:1369-1380` | M / medium |
| **P1-8** | Teljesen hiányzik az audit-log a match/kiadás/config mutációknál (a projektnek van `logAuditEvent` rendszere). **Javaslat**: audit minden mutáló action-höz; `kiadasId` a metadata-ba (a `kiadas.id` integer, a `target_id` UUID). | `oblio-ellenorzes-actions.ts` | M / high |
| **P1-9** | `createKiadasFromXmlAndMatch` nem tranzakcionális — árva kiadás keletkezhet (insert siker + match bukás → `success:true`). **Javaslat**: egy Postgres-funkció tranzakcióban, vagy kompenzáló rollback. | `oblio-ellenorzes-actions.ts:370-469` | M / high |
| **P1-10** | `handleRefresh` nincs re-entrancy guarddal — párhuzamos scan-ek versengenek (ez a P0-1 egyik triggere is). **Javaslat**: `useRef` inFlight guard + „rerun requested" minta. | `OblioEllenorzesTab.tsx:359` | M / high |
| **P1-11** | Tartós (10 éves) jogi archívum hiánya — az SPV 60 nap után törli az XML-t, a jogi dokumentum az aláírt XML. **Javaslat**: aláírt XML + aláírás-fájl Supabase Storage-ba, kiadáshoz csatolva, „XML archiválva" státusz. | (megfelelőség) | L / high |

---

## P2 — értékes fejlesztések

- **P2-1** Megfelelőségi diagnosztika: „könyvelt SPV nélkül" (15% bírság-kockázat) + „SPV-ben van, nincs könyvelve" kategóriák, kattintható KPI-kkal. `[L/high]`
- **P2-2** CNP-szállító kezelése — Legea 88/2026 (2026.06.01) óta nem kötelesek e-Facturára → jogosan árva kiadás, ne riasszon. `[M/medium]`
- **P2-3** Két eltérő `ubl-parser.ts` mindkettő él (package vs `apps/web/lib`) — parse-drift. **Javaslat**: egyetlen forrás, modalok is a package-ből importáljanak. `[S/medium]` ⭐
- **P2-4** Tartalom-alapú dedup-kulcs (CUI + számlaszám + dátum + bruttó), nem fájlnév/UUID; a `0.00 PayableAmount` `||`-fallback bug (`ubl-parser.ts:281-283`). `[M/medium]`
- **P2-5** 60 napos RPC a `profiles.congregation_id`-re kötve — a könyvelő szerepkör sosem kap figyelmeztetést. **Javaslat**: `p_congregation_id` paraméter az effective kontextusból. `[M/medium]`
- **P2-6** Vault kulcs csendben a `GOD_MODE_PIN`-re esik vissza (`secret-vault.ts:22`). **Javaslat**: production-ben kötelező `VAULT_ENCRYPTION_KEY`, a PIN-fallback eltávolítása. `[M/medium]`
- **P2-7** Natív `window.confirm/alert` 3 destruktív akciónál + nincs Oblio súgó-fejezet + toast-áradat (6-8/frissítés). **Javaslat**: brandelt AlertDialog, súgó-kategória, egy összefoglaló toast. `[M/medium]`
- **P2-8** PDF tartalom-párosító vakfoltjai: nincs pénznem-ellenőrzés, substring-számlaszám medium→átnevez, nem-Y-rendezett amount-regex, CDN-ről töltött PDF.js worker (offline desktopon bukik). `[M/medium]`
- **P2-9** Beépített UBL→ember-olvasható számlanézet — a befogadottnál gyakran NINCS PDF, csak XML; a nyers XML a lelkésznek értelmetlen. `[L/medium]`
- **P2-10** `handleRefresh` teljes újra-scan minden hívásnál (egy kézi match után is) — nincs inkrementális frissítés. `[L/medium]`
- **P2-11** Desktop-paritás hiánya — az Oblio fül web-only, a Tauri appban nincs (pedig a natív fs ott természetesebb). `[XL/medium]`

---

## P3 — finomítás / nice-to-have

- **P3-1** Dátum-tolerancia túl tág és iránytalan (`Math.abs`, 60 nap mindenhol). **Javaslat**: iránytudatos ablak (−5…+60 nap), szűkebb a 4. lépésben. `[S/low]`
- **P3-2** `AMOUNT_TOLERANCE` fix 1 RON, méret-független + hiányos CUI-normalizálás. **Javaslat**: `max(1.0, összeg*0.001)`, egységes `normalizeCui()`. `[S/low]`
- **P3-3** Hozzáférhetőség: emoji-ikonok aria nélkül, `aria-sort` hiánya, zsargon (CUI/SPV/ANAF UUID) magyarázat nélkül, raw-XML gomb a lelkésznek, mobil tábla görgetésbe szorul, „Párosít összest" megerősítés/undo nélkül. `[M/low]`
- **P3-4** Apró szerver-konzisztencia: `removeOblioMatch` csendes siker nem létező id-re; `recordOblioDownloadNow` hiányzó `aktiv=true` szűrő; `openLocalFile` 30s fix revoke. `[S/low]` ⭐
- **P3-5** Részleges/aggregált kifizetés (N:1, 1:N) nincs kezelve — egy utalás több számlára. **Javaslat**: subset-sum heurisztika per CUI; a séma már megengedi az N:1-et. `[XL/low]`

---

## Verifikált stratégiai megállapítás (3 hivatalos forrás)

**Az Oblio API NEM tudja kiváltani a befogadott e-Factura manuális ZIP-letöltését.**
8 adverzariális ellenőrző ágens igazolta:

- Az `oblio.eu/api`, a PHP SDK (`OblioSoftware/OblioApi`) és a NodeJS SDK (`OblioSoftware/OblioApiJs`) **kizárólag
  kimenő/saját dokumentumokat** kezel. Nincs `primite`/`received`/`incoming`/SPV-inbox végpont.
- A `GET /api/docs/einvoice` csak a **saját, Oblio-ban kiállított** számlák SPV-archívumát tölti le.
- A webhook-topikok (13 db) mind kimenő/belső eseményre vonatkoznak — **nincs „befogadott számla érkezett"** push.
- A befogadott számlák csak az Oblio webfelületén (Rapoarte > Documente din SPV / Oblio Wallet) érhetők el.

**Következmény**: a manuális ZIP **nem hiba** — az Oblio korlátja. Az automatizálás kanonikus útja az
**ANAF SPV közvetlen REST API** (`listaMesajeFactura` / `listaMesajePaginatieFactura`, max 500/lapozható,
`filtru=P` befogadottra, majd `descarcare?id=`), OAuth2 Bearer + **minősített digitális tanúsítvány**.
(Harmadik fél aggregátorok — pl. Socrate — is léteznek; az ANAF-direkt a kanonikus, de nem az egyetlen út.)

Források: `oblio.eu/api`, `github.com/OblioSoftware/OblioApi`, `github.com/OblioSoftware/OblioApiJs`,
`oblio.eu/integrari/e-factura`, `mfinante.gov.ro/static/10/eFactura/prezentare api efactura.pdf`.

---

## Új funkció-ötletek

1. **ANAF SPV közvetlen REST integráció** (stratégiai) — kiváltja a manuális ZIP-et a befogadott számláknál;
   a tanúsítvány-elérés miatt **desktopon (Tauri) kezdeni** logikus, egybevág a desktop-paritás munkával.
2. **Folytonos konfidencia-pontszám + 4 akció-sáv** (auto-mentés ≥0.95 / megerősítés 0.80–0.95 / review-sor
   0.60–0.80 / elvetés <0.60) a bináris high/medium/low helyett.
3. **Top-3 jelölt auto-javaslat** a kézi párosítóban pontszámmal és indoklással (üres kereső helyett).
4. **Tartós jogi archívum** (Supabase Storage, aláírt XML + aláírás-fájl, 10 év, külön archiválási csengő).
5. **Megfelelőségi kontroll-panel** (15% bírság + hiányzó költség riasztó-kategóriák).
6. **CNP-szállító jelölő** („e-Factura nem kötelező") + 13-nullás vevő-CUI B2C-felismerés.
7. **Beépített UBL→HU/RO számlanézet** (a befogadottnál gyakran nincs PDF).
8. **Tömeges jóváhagyás + Undo** toast-akcióval és audit-loggal.
9. **Mobil/desktop paritás** (kártyás lista mobilon, Oblio fül Tauri-portolása).

---

## Tágabb perspektíva

- **Automatizálás**: az Oblio-klienst NE bővítsd befogadott-lekéréshez (nincs ilyen végpont). Ha automatizálsz,
  nyiss külön epikát az **ANAF-direkt szinkronra** (egyúttal kiváltja a 60 napos manuális letöltést). mTLS a
  `logincert.anaf.ro` felé webben nehéz, **Tauri-desktopon reális** → desktop-only-ként kezdeni.
- **Megfelelőség**: a 60 napos csengő szemantikája a **letöltési/archiválási** határidőre vonatkozzon (SPV 60 nap
  után törli; megőrzés 10 év; jogi dokumentum az aláírt XML, nem a PDF). A 2026-os szabályok (Legea 88/2026:
  CNP-mentesség; 15% bírság SPV nélküli B2B-könyvelésért) közvetlenül érintik a diagnosztika logikáját.
- **Matcher**: tedd explicitté a waterfall-t konfidencia-pontszámmal és review-sorral, a greedy-t cseréld
  konfliktus-klaszteres globális hozzárendelésre, és **minden mutációt auditálj**.

---

## Quick winek (kis effort, nagy érték)

`P0-2` (rename-bug, S) · `P1-6` (dismiss-scope, S) · `P1-1` (currency-gate, M) · `P2-3` (parser-dedup, S) · `P3-4` (szerver-konzisztencia, S)

## Javasolt sorrend

1. **Most**: P0-1, P0-2 (adatvesztés) + a P1-10 re-entrancy guard (a P0-1 triggere).
2. **Ezután**: a párosítás-helyesség P1-blokkja (P1-1 currency, P1-2 sztornó, P1-4 név), majd P1-5 (batch) + P1-6 (scope) + P1-8 (audit).
3. **Megfelelőség**: P1-11 archívum + P2-1/P2-2 diagnosztika.
4. **Stratégiai**: ANAF SPV direkt integráció (külön epika, desktop-first).
