# KARTOTEKA — E3 Iktató sablonok modul

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — E3 terv
**Projekt log lépés**: 034.

---

## Vezetői összefoglaló

Az E3 feladat létrehozza az **irat-sablonok** modult a KARTOTEKA Iktató fülében. Eddig a gyülekezet lelkészei kézzel írtak/szerkesztettek Word dokumentumokat (keresztelési igazolás, konfirmációs igazolás, tagsági igazolás, stb.), mostantól:

- **Sablonként** eltárolhatók a gyakran használt dokumentum-formátumok
- **Placeholderek** (`{{nev}}`, `{{datum}}`, stb.) automatikusan kitöltődnek a rendszer-kontextusból, ill. a user által
- **Egy kattintással** generálható PDF (vagy közvetlen nyomtatás)
- **4 alapsablon** (Keresztelési-, Konfirmációs-, Esketési-, Tagsági igazolás) előregyártott

---

## Architektúra áttekintés

```
app/(dashboard)/iktato/page.tsx (változatlan)
  └─ FilingMain (bővítve: tab switcher)
      ├─ Tab 1: "Iktatott iratok" → FilingEntriesView (régi CRUD)
      └─ Tab 2: "Sablonok" → FilingTemplatesTab (ÚJ)
          ├─ Sablon kártyák (grid, aktív/inaktív szekció)
          ├─ "+ Új sablon" → FilingTemplateDialog (HTML editor + placeholder detektor)
          ├─ "Generálás" → FilingTemplateGenerator (élő preview + PDF letöltés)
          └─ "Alapsablonok betöltése" → SEED_TEMPLATES insert
```

### Placeholder rendszer

A sablonok HTML tartalmat tárolnak `{{kulcs}}` placeholderekkel. Két kategória:

**Automatikus** (rendszer tölti ki):
- `{{gyulekezet}}` — gyülekezet hivatalos neve (nev_hu)
- `{{lelkipasztor}}` — `profiles.full_name`
- `{{iratszam}}` — év/következő sorszám (`iktato` táblából)
- `{{datum}}` — magyar formátum ("2026. április 15.")
- `{{ev}}` — aktuális év
- `{{helyseg}}` — `congregations.cim`

**Kézi** (user tölti ki a generátorban):
- `{{nev}}`, `{{szul_datum}}`, `{{lakcim}}`, `{{apja_neve}}`, `{{anyja_neve}}`
- `{{kereszteles_datuma}}`, `{{konfirmalas_datuma}}`
- `{{ferj_nev}}`, `{{feleseg_nev}}`, `{{eskuvo_datuma}}`
- `{{indoklas}}`
- Bármi egyéb kulcs, amit a sablon-szerző használ

### Biztonság

- **Sablon tartalma (HTML)** — az admin (gyülekezeti user) szerkesztheti, bízunk benne
- **Placeholder értékek** — `escapeHtml()` funkció XSS-t kizárja
- **URL biztonság** — nincs URL input, csak szöveg
- **RLS** — gyülekezeti szintű izoláció; csak saját gyülekezet sablonjait lehet látni/szerkeszteni
- **Hard delete** — csak master admin; a sima user soft delete-et csinál (`deleted=true`)

---

## Implementált fájlok

### Új fájlok (7)

| Fájl | Sorok | Tartalom |
|---|---|---|
| `migration-docs/sql/2026-04-15-iktato-sablonok.sql` | ~110 | Új tábla `iktato_sablonok` (id, congregation_id, nev, tipus, leiras, tartalom, aktiv, sorrend, created_by, timestamps, deleted) + 5 RLS policy + 2 index + updated_at trigger |
| `lib/filing/templates.ts` | ~250 | Típusok, konstansok (TEMPLATE_TYPES, TEMPLATE_TYPE_LABELS, TEMPLATE_TYPE_COLORS), `escapeHtml()`, `extractPlaceholders()`, `renderTemplate()`, `formatHungarianDate()`, `buildAutoValues()`, SEED_TEMPLATES (4 db), PLACEHOLDER_DOCS (17 db) |
| `app/(dashboard)/iktato/template-actions.ts` | ~270 | 7 server action: `listFilingTemplates`, `getFilingTemplate`, `saveFilingTemplate`, `deleteFilingTemplate`, `toggleFilingTemplateActive`, `seedDefaultFilingTemplates`, `generateNextIratszam`, `getAutoPlaceholderContext` |
| `components/filing/filing-template-dialog.tsx` | ~240 | HTML sablon szerkesztő modal — teal gradient, 4 input (név/típus/leírás/tartalom), placeholder dokumentáció lenyitható, detektált placeholderek live badge-ek |
| `components/filing/filing-template-generator.tsx` | ~245 | Sablon generáló modal — indigo/violet gradient, 2 oszlopos layout: bal oldalon placeholder mezők (auto/manual), jobb oldalon élő HTML preview. PDF letöltés + Nyomtatás akció |
| `components/filing/filing-templates-tab.tsx` | ~310 | Sablonok tab — kártya grid (aktív/inaktív szekciók), mindegyik kártyán név + típus badge + placeholder chip-ek + akciógombok (Generálás, Szerkesztés, Aktiválás/Inaktiválás, Törlés). "Alapsablonok betöltése" gomb első használatkor |
| `docs/project-tracking/KARTOTEKA-e3-iktato-sablonok-2026-04-15.md` | ~220 | Ez a dokumentum |

### Módosított fájl (1)

| Fájl | Módosítás |
|---|---|
| `components/filing/filing-main.tsx` | Tab switcher hozzáadása ("Iktatott iratok" / "Sablonok"), az `FilingEntriesView` alkomponenssé extracted (props: filtered, stats, year, direction, searchQuery, yearOptions, loading, openDialog, handleDelete) — a `Dialog` a parent scope-ban marad, mert az a state-ekhez férhetik hozzá |

---

## Alapértelmezett sablonok (SEED)

A `SEED_TEMPLATES` konstans 4 sablont tartalmaz:

1. **Keresztelési igazolás** — a Vanilla JS-ben lévő hardcoded template placeholderesített változata
2. **Konfirmációs igazolás** — új
3. **Esketési igazolás** — új
4. **Tagsági igazolás** — új

Mind `igazolas` típusú, Times New Roman fonttal, A4 margin-el, aláírási résszel.

A user a **"Alapsablonok betöltése"** gombra kattintva behúzza ezeket. A `seedDefaultFilingTemplates` action:
- Lekéri a meglévő sablonok neveit
- Csak azokat szúrja be, amik ÚJAK (név alapján, case-sensitive)
- Visszatér `{ inserted: number, skipped: number }`-tel

Így többször is nyomható a gomb, idempotens.

---

## Kulcsfontosságú döntések

### 1. HTML tartalom, nem rich-text editor

MVP-ben a sablon tartalma egyszerű textarea-ba írt HTML. Miért?
- **Nincs függőség**: nem kell Tiptap/Lexical/stb. editor
- **Rugalmasabb**: a user (aki már szokva van a Word/HTML-hez) inline stílusokat adhat meg
- **Nyomtatás-barát**: a tartalom A4-re van szabva, a user kontrollálja a margókat, fontokat
- **Tanulási út**: ha később kellemetlen, átválthatunk Tiptap-re — a tárolt adat ugyanaz marad

A `FilingTemplateDialog` segít: a placeholder dokumentáció, a detektált placeholderek live megjelenítése, és a textarea `font-mono` stílussal van megjelenítve.

### 2. Placeholderek kétirányú

**Kinyerés**: `extractPlaceholders(template)` — regex `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g` kinyeri a kulcsokat.

**Rendering**: `renderTemplate(template, values)` — ahol nincs érték, `__________` marad (kitölthető).

Ez azt jelenti, hogy a sablon bátran tartalmazhat ismeretlen placeholdereket (a user a generátorban egyszerűen hagyja üresen), és nem fog hibát dobni.

### 3. Tab switcher, nem dedikált route

A `/iktato` oldalon belül tabbal oldjuk meg a Sablonok váltást, nem új route-tal (`/iktato/sablonok`). Miért?
- **Kontextus**: a user már az iktatóban van, csak más nézetet akar
- **Gyorsabb**: nincs navigáció, csak state váltás
- **Egyszerűbb URL**: `/iktato` marad a belépési pont
- **Admin workspace konzisztens**: a `ModuleAdminWorkspace` wrapper így is működik (egy belépési pont)

### 4. Autopreview a generátorban

A `FilingTemplateGenerator` két oszlopos: bal oldal a mezők (placeholderek), jobb oldal az élő HTML preview. Minden input változásra azonnal frissül a preview (`renderTemplate()` a render body-ban). Nincs "Előnézet" gomb — rögtön látod a kitöltés hatását.

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **A `placeholderek auto-kitöltése`**: a `getAutoPlaceholderContext()` a `congregations.cim`-et használja a `{{helyseg}}` mezőhöz. Ha ez a mező a `congregations` táblában üres, a `{{helyseg}}` is üres lesz. Ellenőrizendő, hogy mindegyik gyülekezetnek van kitöltve.

2. **XSS a tartalomban**: az admin szabadon írhat HTML-t a sablonba. Ha egy admin account kompromittálódik, a támadó `<script>`-et írhatna. Mitigáció: a sablon csak a saját gyülekezet PDF generálásánál renderel (nincs publikus megjelenítés), a print iframe-ben külön document, de a user-agent futtathatja a JS-t. Későbbi fázisra: DOMPurify integrálás.

3. **A `helyseg` placeholder**: a `congregations.cim` egy hosszabb cím lehet (pl. "400162 Cluj-Napoca, str. Eroilor 18"). A seed sablonokban a helyseg "Kolozsvár" formájú várost vár — ha a cim = teljes cím, kicsit csúnya lesz. Érdemes lehet külön `congregations.varos` oszlop, vagy a seed template formázást megfelelőbbre állítani.

4. **A sablon HTML méret**: a textarea elvileg korlátlan méretű karakterláncot fogad el. Egy nagyon hosszú sablon lassíthatja a UI-t. A Zod validációban nincs max korlát a `tartalom`-ra — lehet, hogy érdemes 50KB korlátot tenni.

### Nyitott pontok (későbbre)

- **Rich text editor** (Tiptap) integráció — ha a user nehéznek tartja a HTML-t
- **Sablon import/export** JSON-ban (sablon megosztás más gyülekezetek között)
- **Sablon verziókövetés** — ha módosul egy sablon, a régi verzió archívba kerül
- **Publikus (kerületi) sablon-könyvtár** — a kerület ajánlott sablonokat oszt meg
- **Integráció az Iktatás oldallal** — az "Új irat" gombhoz hozzákapcsolható egy "Sablonból generálás" opció, ami egyidejűleg iktatja az iratot és létrehozza a dokumentumot
- **Sablon kategorizálás szint 2.**: `jegyzokonyv`, `meghivo`, `hatarozat` típusokra is legyen alap sablon
- **A iratszám auto-iktatás**: most a `generateNextIratszam` csak olvas, de generáláskor érdemes lehet automatikusan iktatni egy új sort a `iktato` táblába

---

## Verifikáció

### TypeScript + ESLint

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit                    # → 0 hiba ✅
npx.cmd eslint "components/filing/..." "lib/filing/..." "app/(dashboard)/iktato/..."  # → 0 hiba ✅
```

### Manuális funkcionális teszt

A részletes tesztlépéseket a `KARTOTEKA-security-test-checklist-2026-04-15.md` E3 szekció tartalmazza.

**Előkészítés**:
1. SQL migráció futtatása Supabase Studio-ban (`2026-04-15-iktato-sablonok.sql`)

**Fő forgatókönyv**:
1. /iktato oldal → "Sablonok" fül
2. Üres lista → "Alapsablonok betöltése" gomb
3. 4 sablon betöltve
4. Egy sablonon "Generálás" → Modal megnyílik
5. Az automatikus placeholderek (gyulekezet, lelkipasztor, iratszam, datum, helyseg, ev) előtöltődve
6. User kitölti a kézi mezőket (nev, szul_datum, apja_neve, anyja_neve, kereszteles_datuma)
7. Jobb oldalon élő preview
8. "PDF letöltése" → a fájl letöltődik (fájlnév: `Keresztelési_igazolás.pdf`)

---

## Roadmap pozíció Q3 2026

1. ✅ D1 — MM Sziget „Közös Munka" (Q3 első feladat)
2. ✅ **E3 — Iktató sablonok** (Q3 második feladat)
3. ⏳ E1 — Admin import befejezése (1 hét)
4. ⏳ Döntés 1: transactions tábla használata (1 hét)
5. ⏳ Legacy DB cleanup (1.5 hét)
6. ⏳ E2 — Adatmodell egységesítés admin (1-2 hét)

---

## Kapcsolódó dokumentumok

- **E3 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Vanilla JS forrás**: `migration-docs/source-links/iktato_api.js` sorok 310-340 (Keresztelési igazolás hardcoded)
- **Tesztelési checklist**: `KARTOTEKA-security-test-checklist-2026-04-15.md` (E3 szekció)
- **Projekt log**: 034. lépés

---

**Dokumentum státusza**: VÉGLEGESÍTETT (E3 MVP — 6/6 alfázis)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: Manuális tesztek után. SQL futtatás + UI teszt szükséges.
