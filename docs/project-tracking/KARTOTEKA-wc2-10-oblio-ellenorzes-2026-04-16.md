# KARTOTEKA WC-2.10 — Oblio ellenőrzés (helyi mappa-alapú)

**Dátum**: 2026-04-16
**Állapot**: implementáció elkészült, SQL és UI tesztelésre vár
**Előzmény**: A felhasználó kérte, hogy a beérkező e-Factura számlák ellenőrzése a saját gépén lévő, a KARTOTEKA helyi mappához tartozó almappából történjen — így nem terheli az online tárhelyet, és a hivatalos UBL XML-ek a felhasználónál maradnak (GDPR-friendly).

---

## Felhasználói kérések (2026-04-16)

1. ✅ A KARTOTEKA helyi mappa **része** legyen az Oblio mappa (nem külön)
2. ✅ Hivatalos rendszer-értesítés a csengőnél, amikor közeledik az ANAF SPV 60 napos határidő
3. ✅ ZIP-et a felhasználó tesz a mappába, KARTOTEKA bontja ki (jszip)
4. ✅ Párosítás: CUI + összeg ± tolerancia
5. ✅ Nyomtatási központ használata (mint a leltár — `printToBrowser` / `printToPdf`)
6. ✅ Tranzakciók fülön a kiadás-soroknál ikon

## Implementáció

### Adatbázis (`migration-docs/sql/2026-04-16-wc2-10-oblio-ellenorzes.sql`)

- **Új mező**: `kiadas.kedvezmenyezett_cui text` + index → a beszállító CUI-ja a párosításhoz
- **Új tábla**: `oblio_kiadas_match` (UUID PK, RLS-vel) → perzisztens párosítások
  - `match_method`: `auto_cui` | `auto_name_amount_date` | `manual`
  - `match_confidence`: `high` | `medium` | `low`
  - Egyedi: `(congregation_id, anaf_uuid)`
- **Új mező**: `oblio_fiokok.utolso_xml_letoltes_at` → ANAF 60 napos figyelő
- **Új RPC**: `check_oblio_deadline_for_user()` → idempotens csengő-értesítés
  - 50 nap → warning ("közeledik")
  - 55 nap → warning ("sürgős")
  - 60+ nap → danger ("lejárt")
  - Egy `kind` típusú értesítést csak egyszer küld letöltési ciklusonként

### Backend kód

- **`lib/finance/oblio/ubl-parser.ts`** — UBL 2.1 XML parser, browser DOMParser, semmi npm dep
  - `parseUblXml(xmlText, fallbackUuid?) → UblInvoiceMeta`
  - `extractAnafUuidFromFilename(name)` → fájlnévből UUID kinyerés
- **`lib/finance/oblio/oblio-folder.ts`** — File System Access API + JSZip
  - `getOblioBefogadottDir(slug, year)` → `<root>/KARTOTEKA/<slug>/oblio-ellenorzes/<év>/befogadott/`
  - `getOblioFeldolgozvaDir(slug, year)` → archív ZIP-eknek
  - `getOblioFolderStatus(slug, year)` → UI állapot (5 állapot: nem támogatott / nincs root / nincs permission / üzemkész / hibás)
  - `processAllZipsInFolder(befogadott, feldolgozva)` → ZIP kibontás → ZIP áthelyezés
  - `openLocalFileInBrowser(handle)` → blob URL új tabra
- **`lib/finance/oblio/oblio-cache.ts`** — Külön Dexie DB (`kartoteka_oblio_cache`)
  - Cache key: `<congregationSlug>::<anafUuid>` + fileLastModified-alapú invalidation
- **`lib/finance/oblio/oblio-matcher.ts`** — Pure function, 4 lépcső:
  1. Manuális (perzisztált) match-ek
  2. CUI-alapú auto-match (high confidence)
  3. Név fuzzy + összeg + dátum (medium/low)
  4. Maradék XML-ek `none`-ként
- **`lib/finance/oblio/oblio-print-builder.ts`** — A4 portrait HTML a print központhoz (cyan dizájn, beszállító + összegtáblázat)
- **`lib/utils/slugify.ts`** — Közös slugify (mint az Excel export-ban) — kötelező konzisztencia!

### Server actions (`app/(dashboard)/penzugy/oblio-ellenorzes-actions.ts`)

- `listOblioMatchesAndKiadasok(year)` — DB lekérés
- `saveOblioMatch(input)` — egy match perzisztálás (CUI sync opcionális)
- `bulkSaveOblioMatches(matches[])` — csoportos
- `removeOblioMatch(matchId)` — törlés
- `updateKiadasCui(kiadasId, cui)` — a kiadás CUI-jának beállítása
- `recordOblioDownloadNow()` — utolsó letöltés timestamp
- `checkOblioDeadline()` — RPC wrapper a csengő-értesítéshez

### UI

- **`components/finance/oblio-ellenorzes-folder-card.tsx`** — Mappa-státusz kártya
  - 5 állapot: nem támogatott / nincs root / nincs permission / üzemkész / hibás
  - Üzemkész állapotban: mappa neve, fájl-szám, utolsó letöltés, **ANAF visszaszámláló** (zöld < 50 / sárga 50-49 / narancs <= 5 / piros lejárt)
- **`components/finance/oblio-ellenorzes-tab.tsx`** — A fő fül
  - 4 KPI kártya (összes / párosított / hiányzó match / nincs SPV)
  - Szűrő-chipek (mind / párosított / hiányzó)
  - Táblázat: dátum, beszállító, számlaszám, bruttó, kiadás-match badge, akciók
  - Akciók: 📕 PDF megnyitás (helyi), 🔗 XML megnyitás, 🖨️ print központ (HTML), PDF mentés (print központ), kézi match / match eltávolítás
- **`components/modals/oblio-manual-match-dialog.tsx`** — Kézi párosítás
  - XML adatok megjelenítése
  - Kereső + jelölt-rangsor (összeg + dátum közelség alapján)
  - Mentés → CUI auto-szinkron a kiadásra
- **`components/finance/oblio-expense-status-icon.tsx`** — Kiadás-soros SPV ikon
  - 🟢 párosítva (kattintásra navigál az ellenőrzés fülre)
  - 🟡 nincs párosítva — figyelmeztetés
  - ⚪ még nem ellenőrizve

### Integráció

- **`finance-tabs.tsx`**:
  - Új ColorTabs entry: `{ value: 'oblio_ellenorzes', label: 'Oblio ellenőrzés', color: 'cyan' }`
  - `<TabsContent>` blokk az `OblioEllenorzesTab`-bal
  - Custom event listener (`finance-tab-switch`) — a Tranzakciók fülről átnavigáláshoz
- **`transactions-tab.tsx`**:
  - Új state `expenseSpvMatchedIds: Set<number>` — egyszer lekéri a match-eket
  - Kiadás-soroknál `OblioExpenseStatusIcon` (a befizetés `OblioStatusIcon` mellett)
  - Kattintásra `dispatchEvent('finance-tab-switch', 'oblio_ellenorzes')`
- **`app/(dashboard)/penzugy/page.tsx`**:
  - `void checkOblioDeadline().catch(noop)` — non-blocking, idempotens

## Helyi mappa-struktúra — **ÁLLANDÓ, év-független**

```
<KARTOTEKA root>/
└── KARTOTEKA/
    └── <congregationSlug>/                 ← slugify-szal generált, gyülekezetenként egyedi
        ├── oblio-ellenorzes/               ← ÁLLANDÓ almappa
        │   ├── befogadott/                 ← ⭐ IDE TÖLTI A LELKÉSZ A ZIP-et (mindig ugyanide)
        │   │   ├── 4214783.xml             ← KARTOTEKA kibontotta
        │   │   ├── 4214783.pdf             ← (opcionális, ha a ZIP-ben volt)
        │   │   └── 4329512.xml
        │   └── feldolgozva-zip/            ← KARTOTEKA archívuma
        │       ├── 2026-03-15_export.zip   ← feldolgozási dátum-prefix-szel
        │       └── 2026-04-12_export.zip
        └── (egyéb meglévő almappák — Excel export, stb.)
```

**Kulcs döntés:** az `oblio-ellenorzes/befogadott/` mappa **év-független**.
A lelkész mindig ugyanide menthet — sosem változik. Az évi szűrés a KARTOTEKA
oldalán történik (XML `issueDate` mező + `kiadas.datum` év-szerinti szűrés).

A feldolgozott ZIP archívum fájlnevei `YYYY-MM-DD_` prefixet kapnak, hogy
rekonstruálható legyen a letöltési történet. Ha ugyanaz a fájlnév
többször is megjelenik egy napon, `_(1)`, `_(2)` utótag különbözteti meg őket.

## Munkafolyamat (a lelkész szempontjából)

1. **Egyszer**: bemegy az Oblio Wallet-be → konvertálja a befogadott számlákat „beszállítói dokumentummá" → `Beállítások → Import/Export` → letölti a ZIP-et
2. **A ZIP-et beteszi** a `<KARTOTEKA root>/KARTOTEKA/<gyülekezet>/oblio-ellenorzes/2026/befogadott/` mappába
3. **A KARTOTEKA Pénzügy → Oblio ellenőrzés fülön** kattint a „Frissítés a mappából" gombra
4. **A KARTOTEKA**: kibontja a ZIP-et, parse-olja az XML-eket, párosítja a kiadásokkal, megmutatja az eredményt
5. **A nem párosított XML-ekhez** kattint a 🔗 ikonra → kézi párosítás dialog
6. **Csengő-értesítés**: 50/55/60 nap múlva figyelmeztet, hogy időben le kell tölteni a következő ZIP-et

## Tesztelési ellenőrzőlista

- [ ] Az SQL migráció lefut (a felhasználó futtatja a Supabase SQL editorban)
- [ ] A „Frissítés" gomb a Pénzügy → Oblio ellenőrzés fülön → mappa permission prompt
- [ ] Egy ZIP betétele a `befogadott/` mappába → kattintás Frissítés → a ZIP eltűnik (átkerül a `feldolgozva-zip/`-be), és az XML-ek megjelennek a táblában
- [ ] Egy CUI-egyezés esetén auto-CUI match létrejön (zöld badge)
- [ ] Manuális match dialog: kereső + listázás
- [ ] Match perzisztált → a Tranzakciók fülön a kiadás-soron 🟢 ikon
- [ ] Print központ HTML / PDF működik
- [ ] Helyi PDF megnyitása új tabra
- [ ] Csengő-értesítés: ha az `oblio_fiokok.utolso_xml_letoltes_at`-et 51 napra állítjuk, a Pénzügy oldal load-kor jön egy `oblio-spv-50` értesítés

## Hotfix-ek (2026-04-16)

### #1 — Duplikált React key fix
A táblázat sor-key korábban `e.meta.anafUuid || e.fileName` volt — ha két XML
ugyanazt az UUID-t kapta (pl. ugyanazt a számlát kétszer letöltötted), React
duplicate key warningot dobott (és potenciálisan rossz UI-state-et).
- `key={` `${anafUuid}::${fileName}` `}` egyedi minden esetben
- Az `enriched` lista a `uniqueParsedXmls`-ből épül (UUID-onként az ELSŐ XML),
  így a duplikátumok már a forrásnál kiszűrve

### #2 — Duplikátum-detektor + takarító
Új state `duplicateGroups: { uuid, fileNames[] }[]` — minden olyan UUID, amihez
több XML tartozik a mappában. A figyelmeztető sávon megjelenik:
- UUID + fájlnevek listája
- „Csak az elsőt megtartom" gomb → `removeFilesFromFolder()` törli a duplikátumokat

### #3 — Ismeretlen fájl-detektor + takarító
A `befogadott/` mappában csak `.zip`, `.xml`, `.pdf` az érvényes. Ha más fájl
(pl. `.docx`, `.jpg`, screenshot) kerül oda:
- Toast figyelmeztetés a refresh után
- Sárga warning sáv a fülön: lista + „Törlés a mappából" gomb (megerősítéssel)

### #4 — Letöltési formátum útmutató kártya
Új `OblioFormatGuideCard` komponens (összecsukható `<details>`), mindig látható
a fülön: lépésről-lépésre Oblio Wallet → Import/Export → ZIP letöltés instrukciók
pontos URL-ekkel, valamint a fájlformátum-szabályok.

### #5 — State-vesztés fülváltáskor (kritikus)
A `@base-ui/react` `Tabs.Panel` alapértelmezésben **unmount**-olja az inactive
panelt, így minden visszanavigáláskor a teljes scan újraindult volna. Megoldás:
- A `<TabsContent value="oblio_ellenorzes" keepMounted>` propot kapott
- Csak az Oblio fülre adjuk (a többi Pénzügy fül továbbra is unmount-ol — memóriaspórolás)
- + új auto-refresh useEffect: ha a komponens először találkozik üzemkész
  mappa-állapottal és nincs még enriched adat, automatikusan lefuttatja a
  `handleRefresh()`-t (a `hasAutoRefreshed` flag védi a loop-tól)

### #6 — Print központ a leltár mintára (PDF + HTML)
Új `OblioInvoicePrintDialog` komponens (`components/modals/`):
- **Iframe előnézet** — ha van helyi PDF, közvetlenül a hivatalos ANAF-PDF-et
  mutatja; ha nincs, a generált kétnyelvű HTML-t
- **Direkt nyomtatás** gomb — PDF esetén a `iframe.contentWindow.print()`
  (a böngésző PDF viewer-ének beépített nyomtatása), HTML esetén a
  `printToBrowser()` a print központon át
- **Letöltés / Mentés** gomb — PDF esetén az eredeti fájl letöltése (digitális
  aláírással), HTML esetén `printToPdf()` (regenerált PDF)
- **Bal oldali sáv**: dokumentum-info (számlaszám, beszállító, CUI, dátum,
  összeg, ANAF UUID, fájl) + magyarázat hogy mi történik nyomtatáskor
- **Jobb oldal**: iframe előnézet (78vh / min 600px)
- A **táblázatban** most CSAK 1 nyomtatás-gomb van (a 4 helyett):
  - Rose 🖨️ ha van helyi PDF (= hivatalos)
  - Kék 🖨️ ha csak HTML (= generált)
  - Tooltip mindkettőn árulja el, mi történik kattintáskor
- A 🔗 gyors XML megnyitás (raw) megmaradt audit / fejlesztői szempontból

### #8 — manifest.json syntax error (középrégi bug)
A `middleware.ts` matcher nem zárta ki a `manifest.json`-t, `.js`-t,
`.css`-t, stb. fájlokat, így a Supabase `updateSession` middleware
futott rájuk, és auth redirect esetén HTML-t adott vissza JSON helyett
(→ „Manifest: Line: 1, column: 1, Syntax error" a böngészőben).
- **Javítás**: a matcher most kizárja az összes közös statikus
  asset-et: `manifest.json`, `sw.js`, `workbox-*.js`, `robots.txt`,
  `sitemap.xml`, és minden `.json`, `.js`, `.css`, `.woff`, `.woff2`,
  `.ttf`, `.otf`, `.eot`, `.map`, `.xml`, `.txt`, `.ico` kiterjesztéssel
  végződő URL.

### #9 — PDF-ek nem jelennek meg a mappában
A párosítás korábban **csak UUID alapján** történt: `meta.anafUuid`
↔ a PDF fájlnévéből kinyert UUID. Ez sokszor nem egyezik, mert az
UBL XML `<cbc:UUID>` (ANAF upload index) lehet más, mint a fájlnév.
- **Javítás**: új `normalizeFileBaseName()` helper az `ubl-parser.ts`-ben
  (levágja a kiterjesztést, `semnatura_` prefixet, kisbetűsít). A
  párosítás most **két stratégiával**:
  1. **Fájlnév-gyök alapján** (robusztus) — XML `5884883600.xml` ↔
     PDF `5884883600.pdf`
  2. **UUID alapján** (fallback)
- **Diagnosztikai toast**: a frissítés után a KARTOTEKA kiírja, hány PDF
  lett párosítva fájlnév-gyök és UUID alapján, és hány maradt árván.
- **UI**: a táblázat sorában a beszállító név mellett piros „📕 PDF"
  badge, ha van helyi PDF; új „PDF mellékelt" KPI-kártya.

### #7 — Print HTML kétnyelvűsítés + KARTOTEKA branding
A `oblio-print-builder.ts` teljes átírás:
- **Brand fejléc**: KARTOTEKA logo + „Egyházi nyilvántartó" + gyülekezet név +
  nyomtatás dátuma
- **Cím**: `Factură primită / Befogadott e-Factura számla` (RO + HU egymás alatt)
- **Adatkártyák**: minden mező RO és HU címkével (`Denumire / Név`,
  `CUI / CIF`, `Adresă / Cím`, `Data emiterii / Kibocsátás`, stb.)
- **Pénzügyi táblázat**: `Bază (fără TVA) / Nettó`, `TVA / Forgalmi adó`,
  `Total de plată / Bruttó (fizetendő)`
- **Disclaimer**: a generált HTML egy belső áttekintés, a hivatalos jogi
  dokumentum az ANAF SPV-ben van — **mindkét nyelven**
- **Lábléc**: KARTOTEKA branding + nyomtatás időpontja `Nyomtatva / Tipărit`

## Hotfix-ek (2026-04-16, 2. kör)

### #10 — Iframe margó a print központban
A iframe tartó `p-2`-ról `p-4 sm:p-6`-ra növelve, hogy a preview szellős legyen.

### #11 — Print és PDF mentés egységes design
Korábban 2 különböző renderer dolgozott (preview iframe srcDoc + html2pdf
canvas-os) → eltérő layout. Refaktor után **EGY iframe** mindenre:
- A preview iframe a megjelenítendő tartalomra (PDF vagy HTML)
- A „Direkt nyomtatás" gomb az iframe `print()` API-ját hívja → böngésző
  natív print dialógus → benne kiválasztható a fizikai nyomtató VAGY
  „Mentés PDF-be"
- A html2pdf-alapú PDF mentés MEGSZŰNT — a böngésző Save-as-PDF
  azonos kimenetet ad mint a preview, és a `@page` szabályokat
  (lapszám, footer) is tiszteletben tartja
- HTML esetén már csak 1 gomb („Direkt nyomtatás / PDF mentés")
- PDF esetén 2 gomb („Direkt nyomtatás" + „Eredeti PDF letöltése")

### #12 — Lapszám és KARTOTEKA branding minden oldalon
A `oblio-print-builder.ts` CSS-ében:
```css
@page {
  margin: 16mm 14mm 22mm 14mm;
  @bottom-right { content: counter(page) " / " counter(pages); ... }
  @bottom-center { content: "KARTOTEKA · Egyházi pénzügyi nyilvántartó"; ... }
}
```
A `body` kap `padding: 16mm 14mm 22mm 14mm` ot, **hogy a preview is
ugyanazt a layout-ot mutassa, mint a print**. Print-kor a body padding
nullázódik (`@media print`), és a `@page margin` veszi át a szerepét.

### #13 — Duplikátum AUTO-cleanup (silent)
A korábbi „Csak az elsőt megtartom" gomb csoportonként hatalmas
kattintási overhead-et okozott (500 tételnél 500 kattintás). Most:
- A `handleRefresh` automatikusan, csendben törli a duplikátumokat
  (csak az ELSŐ XML-t tartja meg minden UUID alatt)
- A figyelmeztető sávból a duplikátum-blokk eltávolítva
- Egy success toast jelzi: „X duplikált fájl automatikusan eltávolítva (Y csoport)"

### #14 — PDF diagnosztika (#7-es bug nyomában)
Ha egyetlen PDF sem párosul XML-lel, a felhasználó konkrét diagnosztikát
kap toast-on:
- A PDF base nevek (első 3 példa)
- Az XML base nevek (első 3 példa)
- Magyarázat: „A fájlnevek nem egyeznek. Töltsd le újra az Oblio ZIP-et."
A console-ban (F12) **teljes diagnosztikai objektum** logolódik, ami
tartalmazza az összes PDF base nevet, XML base nevet, és UUID-t.
Ha XML van a mappában, de PDF nincs, info toast jelzi: „X XML, de PDF NEM
található — ellenőrizd, hogy az Oblio ZIP-ben volt-e PDF."

## Nyitott pontok / jövőbeli fejlesztések

- **Saját kiállított e-Factura ellenőrzés**: a fülön mutatni az `oblio_szamlak` SPV-státuszát is (ahol `e_factura_status != 'ok'`) → külön szekció vagy harmadik tab
- **PWA offline detekció**: ha nincs internet, a frissítés egy snapshot-ot mentsen, és sync-eljen a connection visszajöttével
- **Sürgős kifizetés-blokkolás**: opcionálisan a kiadás-rögzítő dialogban erőszerű figyelmeztetés ha a beszállítónak nincs SPV-ben számlája (ma csak passzív ikon)
- **Direkt ANAF SPV integráció (WC-2.11+)**: a 60 napos manuális workflow helyett digitális tanúsítványos OAuth2-vel közvetlen ANAF lekérés — nagy fejlesztés, későbbi fázis
