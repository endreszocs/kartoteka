# Kartotéka — Oblio (e-Factura) desktop+web fájl-tár terv

**Dátum:** 2026-07-10 · **Készítette:** feltárás (Fable 5) · **Igény (ÚJ #11):** „az Oblio rész is tökéletesen működjön, ahol összedolgozik a desktop és web felület! Vagyis az a hely, ahová telepítve van a desktop verzió, ott lehet majd az Oblio fájlokat őrizni, elosztani! Ezt tudja kezelni a rendszer!"

> **Értelmezés:** az ANAF e-Factura (Oblio Wallet-ből letöltött) számla-fájlok (XML/PDF/ZIP) **kanonikus tárhelye a desktop gép** (fix mappa), és a **web is „lássa"** ezeket — a rendszer kezelje az elosztást. Jelenleg a két platform két, egymástól **teljesen független** fájl-tárat használ, és CSAK a párosítás-metaadat (DB) közös.

> **Megbízhatóság-jelölés:** `[KÓD]` = kódolvasással igazolt · `[GREP]` = kereszthivatkozás-kereséssel (hívó nincs) igazolt.

---

## 0. Jelenlegi architektúra dióhéjban `[KÓD]`

### Közös réteg — `packages/ui-app/src/finance/oblio/`
- **Tiszta logika (web+desktop közösen használja):** `ubl-parser.ts` (UBL XML → `UblInvoiceMeta`), `oblio-matcher.ts` (`matchXmlsToKiadas` — pure), `pdf-content-parser.ts` + `pdf-xml-content-matcher.ts` (PDF.js tartalom-elemzés), `pdf-xml-name-matcher.ts` (ANAF fájlnév-minta), `oblio-print-builder.ts`, `oblio-types/-errors/-status-labels`.
- **`oblio-filesystem.ts`** — `OblioFileSystem` interface (11 metódus, :66–120); az interfész-doc szerint web/desktop/iOS adaptert kapna — **valójában egyetlen implementáció létezik** (web `BrowserOblioFileSystem`).
- **`OblioEllenorzesTab.tsx`** (~1800 sor) — a teljes ellenőrző fül; **csak a web használja** (`apps/web/components/finance/oblio-ellenorzes-tab.tsx:20,49`).
- **`oblio-cache.ts`** — IndexedDB (Dexie) parse-cache; szintén **csak web** (a desktop minden betöltésnél újraparse-ol, `desktop-oblio-tab.tsx:293–304`).

### WEB oldal
- **Fájl-forrás:** File System Access API (Chrome/Edge only, `apps/web/lib/offline/fs-handle-store.ts:28–31`). A felhasználó által kiválasztott root (Dexie-ben perzisztált handle, `:44–113`; permission minden session-ben újra kérendő) alatt: **`<root>/KARTOTEKA/<gyülekezet-slug>/oblio-ellenorzes/{befogadott, feldolgozva-zip}`** (`apps/web/lib/finance/oblio/oblio-folder.ts:46–97`; a slug: `finance-tabs.tsx:618` `slugifyCongregationName`).
- **Flow** (`packages/ui-app/.../OblioEllenorzesTab.tsx:371–709` `handleRefresh`): ZIP-kibontás böngészőben (jszip, `oblio-folder.ts:368–550`, fájlnév-mintás PDF↔XML párosítással `:445–498`) → parse+IndexedDB cache (`:426–476`) → duplikátum-detektálás (`:478–511`) → matcher → high-confidence match-ek batch-perzisztálása. **A fájlok a `befogadott/`-ban MARADNAK** (a web tárhelye maga a bedobó mappa); csak a ZIP kerül át a `feldolgozva-zip/` archívumba.
- **Server actions** (`apps/web/app/(dashboard)/penzugy/oblio-ellenorzes-actions.ts`, 649 sor): `listOblioMatchesAndKiadasok` (:63–110), `saveOblioMatch` (:132–209), `removeOblioMatch` (:211–250), `bulkSaveOblioMatches` (:256–347), `recordOblioDownloadNow` (:388–429), `getExpenseCategoriesForOblio` (:444–475), `createKiadasFromXmlAndMatch` (:497–623, kompenzáló rollbackkel), `checkOblioDeadline` (:629–649). **A szerver fájlt SOHA nem lát — csak metaadatot.**
- **Mount:** `finance-tabs.tsx:616–622` (`oblio_ellenorzes` fül, keepMounted).

### DESKTOP oldal (Tauri 2)
- **Fájl-tár a Rust-rétegben, FIX helyen:** `%USERPROFILE%\Documents\Kartoteka\Oblio\{befogadott, feldolgozott, zip-arhivum}` (`apps/desktop/src-tauri/src/excel.rs:626–649`). **Nincs gyülekezet-szegmens az útvonalban!**
- **Rust commandok** (`excel.rs`): `oblio_folder_info` (:693), `oblio_setup_folder` (:713), `oblio_ingest` (:906–981 — ZIP kibontás + laza XML/PDF áthelyezés a `feldolgozott/`-ba, ZIP → `zip-arhivum/` epoch-prefixszel, a bedobó **kiürül**), `oblio_list_processed` (:985), `oblio_read_text` (:1030), `oblio_read_base64` (:1042), `oblio_rename_processed` (:1057). TS-burok: `apps/desktop/src/lib/oblio.ts`.
- **UI:** `apps/desktop/src/components/desktop-oblio-tab.tsx` (1394 sor) — a webes fül **újraimplementációja** (NEM a shared `OblioEllenorzesTab`-ot használja, NEM az `OblioFileSystem` interfészt): shared parser+matcher (:40–54) + közvetlen supabase-js hívások az `oblio_kiadas_match`-re (:149–179, :230–247, :369–377, :554–571) + **offline kézi-párosítás sor** localStorage-ban, hálózat visszatértekor flush (:104–179) + offline kiadás-forrás a lokális SQLite-tükörből (:267–279) + PDF.js tartalom-elemzés árva PDF-ekre (:659–712). Mount: `apps/desktop/src/pages/penzugy-page.tsx:635–643`.
- **Beállítás-panel:** `apps/desktop/src/components/settings/oblio-mappa-panel.tsx` (mappa előkészítés/megnyitás).

### Közös adatréteg (DB, Supabase)
- **`oblio_kiadas_match`** (migráció: `migration-docs/sql/2026-04-16-wc2-10-oblio-ellenorzes.sql:40–77`): párosítás + XML-metaadat-snapshot (supplier_cui/name, invoice_number/date/amount) + `local_file_relpath` (a gyakorlatban **puszta fájlnév**, nem útvonal — web: `OblioEllenorzesTab` `fileName`-t ad át; desktop: `desktop-oblio-tab.tsx:361,535`). UNIQUE `(congregation_id, anaf_uuid)`. RLS: `current_user_can_access_congregation` (:123–147).
- **`oblio_fiokok.utolso_xml_letoltes_at`** + `check_oblio_deadline_for_user()` RPC (:110–291) — ANAF 60 napos letöltési határidő csengő-értesítéssel; mindkét platform frissíti (web: actions :388–429; desktop: `desktop-oblio-tab.tsx:430–455`).
- (Külön modul: `oblio_fiokok`/`oblio_szamlak` + `oblio-auth/-client/-invoice-builder` = **kimenő** számlázás Oblio REST API-val — ez NEM a fájl-tár témája, csak névrokon.)

---

## 1. Mi működik, mi hiányzik / hibás `[KÓD]`

| # | Megállapítás | Bizonyíték |
|---|---|---|
| 1 | **A „közös fizikai mappa" ígéret HAMIS.** A desktop-panel doc-ja szerint a webes egyeztetés „ugyanerre a fizikai mappára mutatva" történik — valójában a web `<root>/KARTOTEKA/<slug>/oblio-ellenorzes/befogadott`-ot, a desktop `Documents\Kartoteka\Oblio\befogadott`-ot használ; a két út **soha nem eshet egybe** (más struktúra, más nevek). | `oblio-mappa-panel.tsx:10–12` vs `oblio-folder.ts:46–72` vs `excel.rs:626–649` |
| 2 | **Semmilyen fájl-elosztás nincs**: a web a desktop gépen tárolt fájlokat NEM éri el (böngésző nem lát idegen gépet), a szerver/DB csak metaadatot tárol. Ha a lelkész a desktopon dolgozza fel a számlákat, a webes fülön az XML-lista ÜRES (csak a match-sorok látszanak a kiadás oldalán). | actions fejléc-komment `oblio-ellenorzes-actions.ts:4–12`; `OblioEllenorzesTab.tsx:384–395` (root nélkül hibaüzenet) |
| 3 | **Nincs felhő-backup**: a számla-PDF/XML egyetlen példánya a desktop gépen (plusz a ZIP a `zip-arhivum`-ban, ugyanazon a gépen). Gép-csere/meghibásodás = fájlvesztés; az ANAF 60 napon túl nem adja újra (`2026-04-16-wc2-10:113–117`). | — |
| 4 | **A desktop mappa nem gyülekezet-szintű**: több gyülekezetes felhasználónál (multi-pastor) a fájlok keverednek; a szűrés csak DB-oldalon congregation_id szerint történik, a `feldolgozott/` mappában minden együtt van. | `excel.rs:627–649` (nincs cong-szegmens) vs web `oblio-folder.ts:68` |
| 5 | **Nincs év/hónap struktúra** egyik platformon sem — a user igénye a rendezett tár. A web szándékosan év-nélküli (`oblio-folder.ts:50–57` komment), a desktop `feldolgozott/` lapos. | — |
| 6 | **Desktop ingest párosítási rés**: a Rust ZIP-kibontó CSAK az 1 XML + 1 PDF esetben párosít; a web fájlnév-mintás párosítója (`extractIdsFromPdfName`) nincs portolva Rust-ba → több-számlás ZIP-nél desktopon sok „árva PDF" keletkezik (utólagos PDF.js tartalom-elemzés kompenzálja, kézi gombnyomásra). | `excel.rs:849–880` vs `oblio-folder.ts:430–513` |
| 7 | **Kettős tab-implementáció (drift-kockázat)**: a desktop 1394 soros saját fület tart fenn a shared 1800 soros helyett; a webes funkciók egy része (nyomtatási dialógus, párosítás-diagnosztika dialógus, duplikátum-kezelő sáv, rendezhető oszlopok, IndexedDB cache) desktopon hiányzik. Az eredetileg tervezett `TauriOblioFileSystem` adapter sosem készült el. | `desktop-oblio-tab.tsx:1–16`; `oblio-filesystem.ts:61`; `docs/release-notes-v0.7.9.md:26,49` |
| 8 | **Webes mód törékeny**: Chrome/Edge-only, session-enként permission-újrakérés, a felhasználó rossz (felhő-szinkronizált) mappát választhat — pont ez motiválta a desktop fix-mappás modelljét. | `fs-handle-store.ts:28–31,119–140,280–306`; `oblio-mappa-panel.tsx:4–8` |
| 9 | Ami **JÓL működik és megtartandó**: a shared parser/matcher (tesztelt, pure), az `oblio_kiadas_match` metaadat-snapshot modell (a UI match-nézete fájl NÉLKÜL is kirajzolható belőle), a desktop offline-outbox minta (pending match-ek), az idempotens ingest (skip-ha-létezik). | `oblio-matcher.ts`; `desktop-oblio-tab.tsx:104–179`; `excel.rs:774–798` |

---

## 2. CÉL-architektúra

**Elv:** a **desktop gép a kanonikus fájl-tár** (offline-first, a lelkész fizikailag látja a mappát), a **felhő az elosztó- és backup-réteg**, a **web olvasó** (és párosító) kliens. A ZIP-archívum SOSEM megy felhőbe (redundáns).

### Mappa-struktúra a desktopon (cél)

```
Documents\Kartoteka\Oblio\
  befogadott\                     ← bedobó (változatlan; beolvasás után kiürül)
  <gyülekezet-slug>\              ← ÚJ: gyülekezet-szegmens (1 gyülekezetnél is, migrációval)
    feldolgozott\<év>\<hó>\       ← ÚJ: a számla issueDate-je szerint (nem a letöltés dátuma!)
    zip-arhivum\                  ← változatlan (epoch-prefix)
```

### Elosztási mechanizmus — 3 opció

**(a) Teljes fájl-feltöltés Supabase Storage-ba.** A desktop ingest után minden XML+PDF felmegy egy privát `oblio-files` bucketbe (`{congregation_id}/{év}/{hó}/{fájlnév}` kulcs), a web signed URL-lel nyitja.
- - Tárhely: XML ~10–100 KB, ANAF PDF-render ~50–400 KB/számla → **egy kis gyülekezet éve ~20–150 MB PDF-fel, ~5–15 MB csak-XML-lel**. A **Supabase Free tier 1 GB storage** + korlátos havi egress — több gyülekezettel, több évvel a PDF-es változat **pár év alatt betelhet**.
- - Egress minden webes PDF-nyitásnál.
- + Teljes webes paritás + valódi backup.

**(b) Csak metaadat-szinkron (fájl a desktopon marad).** Új `oblio_files` tábla a parse-olt `UblInvoiceMeta`-val (JSONB, ~2–5 KB/számla) + relpath/size/hash. A web a listát/párosítást teljes értékűen tudja (a matcher pure, csak meta kell neki — `oblio-matcher.ts`), de az eredeti PDF/XML-t NEM tudja megnyitni; a UI jelzi: „a fájl a(z) X gépen: `feldolgozott/2026/03/….pdf`".
- + Nulla tárhely-költség, egyszerű.
- − Nincs backup, a web nem tud számlát mutatni/nyomtatni eredetiből. (Részleges pótlás: az `oblio-print-builder` a metából HTML számla-képet tud rajzolni — `OblioInvoicePrintDialogBody` már ma metából dolgozik.)

**(c) HIBRID — AJÁNLOTT.** Metaadat-szinkron MINDIG (b), plusz fájl-feltöltés rétegezve:
1. **XML mindig felmegy** (apró, és ez a hiteles bizonylat — az ANAF-nál az XML a számla).
2. **PDF beállítás-függően** (alapértelmezés: IGEN, amíg kvóta engedi; kapcsoló a desktop Beállítások → Oblio panelen). Kvóta-őr: 700 MB felett figyelmeztetés, PDF-feltöltés automatikus kikapcsolása 900 MB-nál.
3. ZIP soha.
- + A web mindent lát és az XML-t mindig meg tudja nyitni/letölteni; backup a lényegi bizonylatra garantált; a tárhely-növekedés kontrollált.
- − Két igazság-forrás (desktop fájl + storage objektum) — szabály kell: **a Storage append-only archívum**, a desktop-törlés nem törli a felhőből (lásd Kockázatok).

### Adatfolyam (hibrid)

```
Oblio Wallet ZIP → Documents\Kartoteka\Oblio\befogadott
   → [desktop] oblio_ingest (Rust): kibontás → feldolgozott/<év>/<hó>/ + zip-arhivum
   → [desktop] parse (shared ubl-parser) → oblio_files UPSERT (meta+hash) [offline-outbox]
   → [desktop] Storage upload: XML (mindig) + PDF (beállítás) [offline-outbox]
   → [web] oblio_files SELECT → matcher → oblio_kiadas_match (változatlan)
   → [web] fájl-megnyitás: createSignedUrl(storage_path) → új tab
```

---

## 3. DB-séma + Storage változás

### Új tábla: `oblio_files`

```sql
CREATE TABLE public.oblio_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  anaf_uuid text NOT NULL,               -- fájlnévből/XML-ből (mint oblio_kiadas_match)
  kind text NOT NULL CHECK (kind IN ('xml','pdf')),
  file_name text NOT NULL,
  relpath text NOT NULL,                 -- pl. 'feldolgozott/2026/03/1234_….xml'
  size_bytes bigint NOT NULL,
  content_hash text NOT NULL,            -- sha256 — dedup + multi-gép ütközés-detektálás
  file_mtime timestamptz,
  meta jsonb,                            -- UblInvoiceMeta (csak kind='xml')
  storage_path text,                     -- NULL = nincs feltöltve (csak meta)
  uploaded_at timestamptz,
  source_device text,                    -- gép-azonosító (multi-desktop diagnosztika)
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (congregation_id, anaf_uuid, kind)
);
```
- RLS: pontosan az `oblio_kiadas_match` mintája (`2026-04-16-wc2-10-oblio-ellenorzes.sql:123–147`, `current_user_can_access_congregation`).
- Index: `(congregation_id, kind)`, `(congregation_id, ((meta->>'issueDate')))` az év-szűréshez.

### Storage bucket: `oblio-files` (privát!)

- Kulcs: `{congregation_id}/{év}/{hó}/{sanitizált fájlnév}` — az ANAF-fájlnevek szám/UUID jellegűek, de sanitizálni kell (Storage-kulcs charset).
- Policy-minta már VAN a projektben: `migration-docs/sql/2026-04-12-storage-buckets.sql` (bucket INSERT + `storage.objects` policy-k). Itt: `public=false`, minden művelet `authenticated` + `public.current_user_can_access_congregation(((storage.foldername(name))[1])::uuid)`.
- Létező bucket-precedensek: `avatars` (server-side upload minta: `apps/web/app/(dashboard)/tagnyilvantartas/avatar-actions.ts:156–166`), `logos`, `public-site-media`, `public-magazines`. A desktop MÁR használ Storage-ot olvasásra (`apps/desktop/src/lib/avatar.ts:146`) — a supabase-js kliens (`getDesktopSupabase`) uploadra is képes, nem kell Rust HTTP.

---

## 4. Lépcsős implementációs terv

### F0 — Döntések + mérés (fél nap)
- Nyitott kérdések tisztázása a felhasználóval (6. pont).
- Mérés a valós gépen: hány fájl / összméret a `Documents\Kartoteka\Oblio`-ban; `SELECT count(*), pg_size_pretty(...)` az `oblio_kiadas_match`-en. → PDF-feltöltés alapértelmezésének kalibrálása.

### F1 — Desktop fájl-tár rendezése (Rust) — a user által kért „őrzés"
- `excel.rs`: `oblio_ingest` bővítése — kibontáskor az XML-ből **minimál-parse** (regex a `<cbc:IssueDate>`-re) → cél: `feldolgozott/<év>/<hó>/`; a párosított PDF ugyanoda; dátum-nélküli/árva → `feldolgozott/egyeb/`. A webes fájlnév-mintás XML↔PDF párosítás (`pdf-xml-name-matcher` logika) portolása Rust-ba (#6 rés zárása).
- `oblio_list_processed` → rekurzív bejárás, `OblioFileEntry` kap `relpath`-ot; `oblio_read_text/base64/rename` név helyett relpath-alapú.
- Gyülekezet-szegmens: `Oblio/<slug>/…` + **egyszeri migráció** induláskor (meglévő lapos `feldolgozott/` tartalom bemozgatása; idempotens).
- Meglévő lapos állomány át-sorolása év/hó alá: „Rendezés" gomb az `oblio-mappa-panel`-en (parse → move).
- Érintett: `excel.rs:617–1070+`, `apps/desktop/src/lib/oblio.ts`, `desktop-oblio-tab.tsx` (path-kezelés), `oblio-mappa-panel.tsx`.

### F2 — Metaadat-szinkron (`oblio_files`)
- SQL-migráció (3. pont) — `migration-docs/sql/2026-07-XX-oblio-files.sql`.
- Desktop: a `loadData` parse-lépése után (`desktop-oblio-tab.tsx:288–313`) batch UPSERT az `oblio_files`-ba (meta+hash+relpath); offline esetén outbox a meglévő `pendingMatches` minta szerint (:104–179) vagy az `excel-enqueue` várólista mintájára.
- Hash-számítás: Rust-oldalon az ingestben (sha256 crate) — a listázó adja vissza, ne a TS olvassa be kétszer a fájlt.

### F3 — Fájl-feltöltés Storage-ba (desktop)
- Bucket + policy migráció (3. pont).
- Desktop upload-worker: az `oblio_files` azon sorai, ahol `storage_path IS NULL` és (kind='xml' VAGY pdf-feltöltés engedélyezett) → `supabase.storage.from('oblio-files').upload(...)` → `storage_path`+`uploaded_at` UPDATE. Retry-val, háttérben, ingest UTÁN (sosem blokkolja).
- Kvóta-őr: `sum(size_bytes) where storage_path is not null` → figyelmeztetés/PDF-stop küszöbök; kijelzés az `oblio-mappa-panel`-en.

### F4 — Web „felhő-tár" mód
- Új server actions (`oblio-ellenorzes-actions.ts` mellé): `listOblioFiles(year)` (meta JSONB → `UblInvoiceMeta[]`), `getOblioFileSignedUrl(fileId)` (`createSignedUrl`, 60 mp).
- `OblioEllenorzesTab` adatforrás-absztrakció: ha van felhő-adat (`oblio_files` nem üres), a lista onnan épül (a matcher-hívás változatlan — pure); a FolderCard helyén „Felhő-tár — a desktop által feltöltve, utolsó szinkron: …" kártya. Fájl-megnyitás: signed URL új tabon; ha `storage_path IS NULL` (csak-meta PDF), a relpath-ot mutatjuk („a desktop gépen található").
- A meglévő File System Access mód **megmarad fallbacknek** (F0-döntéstől függően) — a két forrás UUID-n dedupolva egyesíthető, de az 1. iterációban elég a „felhő-forrás ELSŐBBSÉGE, ha létezik".

### F5 — (Opcionális, F0-döntés) Web → desktop irány
- Webes ZIP-feltöltés a bucket `{cong}/inbox/` prefixére + `oblio_inbox` jelzősor; a desktop ingest induláskor letölti, lefuttatja rajta a normál pipeline-t, majd törli az inboxból. Csak akkor, ha a felhasználó tényleg tölt le ZIP-et desktop-mentes gépen.

### F6 — Takarítás + hosszú táv
- Holt kód eltávolítása (7. pont).
- Hosszú táv: `TauriOblioFileSystem` adapter megírása és a `desktop-oblio-tab.tsx` kiváltása a shared `OblioEllenorzesTab`-bal (drift megszűnik, webes funkciók — nyomtatás, diagnosztika, duplikátum-sáv — desktopra kerülnek). Nagy falat, külön sprint.

---

## 5. Kockázatok

- **Két igazság-forrás:** desktop-fájl vs Storage-objektum. Szabály: a Storage **append-only archívum** — desktop-oldali törlés/átnevezés NEM töröl felhőből; az `oblio_files.relpath` frissül, a `storage_path` marad. Törlés csak explicit admin-művelettel.
- **Free tier:** 1 GB storage + havi egress-korlát. A hibrid (XML-mindig, PDF-kapcsolható) + kvóta-őr kezeli; de több gyülekezet + több év PDF-fel → előbb-utóbb Pro vagy PDF-off.
- **Offline-first sérthetetlen:** az ingest és a helyi párosítás hálózat nélkül is menjen (ma is így van, `desktop-oblio-tab.tsx:265–282`); a szinkron/upload kizárólag best-effort outbox.
- **Multi-desktop (2 gép ugyanarra a gyülekezetre):** UPSERT `(congregation_id, anaf_uuid, kind)` + `content_hash` egyezés-ellenőrzés; eltérő hash-nél NEM írunk felül, hanem konflikt-jelzés (ritka, de csendes felülírás tilos).
- **`anaf_uuid` fallback-ütközés:** a webes duplikátum-tanulság (`OblioEllenorzesTab.tsx:478–502` — két KÜLÖNBÖZŐ számla kaphat azonos fallback-azonosítót) az `oblio_files` UNIQUE kulcsát is érinti → UPSERT előtt hash-egyezés-guard.
- **Storage-kulcs sanitizálás** (ékezet/space a fájlnévben) — az eredeti név a DB-ben marad, a kulcs sanitizált.
- **RLS a storage.objects-en:** a mappa-név-alapú congregation-check-et második felhasználóval kötelező tesztelni (a `2026-04-21-m6-2-rls-audit-full.sql` mintájára).
- **Rust ingest-módosítás regressziója:** a meglévő lapos `feldolgozott/` állomány migrációja idempotens legyen; a `zip-arhivum`-ból mindig rekonstruálható (a webes `reprocessZipsFromArchive` elve).

---

## 6. Nyitott kérdések a felhasználónak

1. **PDF-ek is menjenek a felhőbe**, vagy csak XML+metaadat? (tárhely vs. teljes webes élmény; javaslat: PDF is, kvóta-őrrel)
2. A desktop Oblio-mappa legyen **gyülekezetenként albontva**? (több gyülekezetes felhasználónál kötelező; egy-gyülekezetesnél is javasolt a jövőbiztosság miatt)
3. A webes **Chrome-mappás mód maradjon** fallbacknek, vagy a felhő-tár teljesen kiváltsa? (javaslat: maradjon, de a felhő-forrás az elsődleges)
4. Kell-e a **web → desktop irány** (F5: webről feltöltött ZIP-et a desktop dolgozza fel)?
5. **Retenció:** meddig őrizzük a felhőben a fájlokat? (a romániai bizonylat-őrzési kötelezettség többéves — a helyi tárban mindenképp marad minden; a felhőből pl. 5 évnél régebbi PDF törölhető-e kvóta-nyomás esetén?)
6. Ha a kvóta betelik: **Supabase Pro** elfogadható, vagy PDF-feltöltés-stop a politika?

---

## 7. Holt / hibás / félrevezető Oblio-kódtöredékek `[GREP]`

| # | Töredék | Hely | Bizonyíték / teendő |
|---|---|---|---|
| 1 | `updateKiadasCui` server action — **sehonnan nem hívott** | `oblio-ellenorzes-actions.ts:353–382` | grep: csak a definíció + tervdoksik találata; a CUI-szinkront a `saveOblioMatch.syncCuiToKiadas` (:183–188) végzi → törölhető |
| 2 | `downloadLocalFile` — hívó nélkül; nem része a `BrowserOblioFileSystem` adapternek | `oblio-folder.ts:246–259` (adapter: :657–668) | törölhető |
| 3 | `readFileAsBlob` — hívó nélkül | `oblio-folder.ts:221–223` | törölhető |
| 4 | `oblioDefaultFolder` TS-burok + `oblio_default_folder` Rust command — regisztrálva (`lib.rs:30,104`), de UI-hívó nincs | `apps/desktop/src/lib/oblio.ts:31–33`; `excel.rs:687–689` | törölhető (vagy az F1 mappa-migráció használja fel) |
| 5 | `TauriOblioFileSystem` — csak ígéret, sosem készült el; helyette 1394 soros duplikált fül | `oblio-filesystem.ts:61`; `release-notes-v0.7.9.md:26,49`; `desktop-oblio-tab.tsx` | F6-ban feloldani |
| 6 | **HAMIS docstring:** a webes egyeztetés „ugyanerre a fizikai mappára mutatva" történne | `oblio-mappa-panel.tsx:10–12` | a két út soha nem azonos (1. tábla #1) — F1-ben javítandó szöveg |
| 7 | **Elavult docstring/komment:** „befogadott/<év>/" évmappa — sosem épült meg; a SQL-komment `local_file_relpath` példája (`oblio-ellenorzes/2026/befogadott/…`) sem igaz (puszta fájlnév kerül bele) | `OblioEllenorzesTab.tsx:111`; `2026-04-16-wc2-10-oblio-ellenorzes.sql:88–90` | F1/F2-ben aktualizálni |
| 8 | 10 deprecated re-export shim a webes lib-ben (`oblio-types/-errors/-matcher/-cache/-print-builder/-status-labels`, `ubl-parser`, `pdf-content-parser`, `pdf-xml-name-matcher`, `pdf-xml-content-matcher` — mind `export * from '@kartoteka/ui-app'`) | `apps/web/lib/finance/oblio/*` (4–6 sorosak) | élnek, de az importok átírásával kivezethetők (F6) |
| 9 | Desktop ingest párosítási rés (1+1-en túl nincs fájlnév-mintás XML↔PDF párosítás) | `excel.rs:849–880` vs web `oblio-folder.ts:445–498` | F1 zárja |
| 10 | Az `oblio-cache.ts` (IndexedDB) shared-ben van, de desktopon kihasználatlan — a desktop minden `loadData`-nál minden XML-t újraolvas+parse-ol | `desktop-oblio-tab.tsx:293–304` | F6 (shared tab átvétele) oldja; addig elfogadható |

---

**Összefoglaló ítélet:** a rendszer két, önmagában működő, de egymásról nem tudó fájl-silót épített (web: FS Access + `KARTOTEKA/<slug>/…`; desktop: Rust + `Documents\Kartoteka\Oblio`), és csak az `oblio_kiadas_match` metaadat közös. A user igénye (desktop = őrző hely, rendszer = elosztó) a **hibrid (c)** modellel teljesíthető: desktop-oldali év/hó-rendezett tár (F1) + `oblio_files` metaadat-szinkron (F2) + XML-mindig / PDF-kapcsolhatóan Storage-feltöltés (F3) + webes felhő-olvasó mód (F4). A meglévő tesztelt parser/matcher és a match-tábla változatlanul újrahasznosul.
