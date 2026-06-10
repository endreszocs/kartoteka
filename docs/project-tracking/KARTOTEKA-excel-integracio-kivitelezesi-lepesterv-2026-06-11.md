# KARTOTÉKA — Excel-könyvelés integráció · részletes kivitelezési lépésterv

**Dátum:** 2026-06-11 · **Előzmény:** [offline-excel-integráció terv](KARTOTEKA-offline-excel-integracio-terv-2026-06-10.md) (PoC GO + 2026-06-11 korrigált szerkezet, 9. szakasz)
**Státus:** jóváhagyásra vár — kód csak Endre „mehet" után indul.

## Endre döntései (2026-06-11)
1. **Bank-mapping:** automatikus deviza-alapú javaslat (betű-lap 3. sor devizája → Kartotéka-bankszámla), Beállításokban megerősíthető.
2. **Mappa-forrás:** becsomagolt üres `Konyveles_2026_a` sablon minden felhasználónak (a meglévő-fájl regisztrálás opcionális későbbi bővítés).
3. **Most:** részletes lépésterv (ez a doksi) → jóváhagyás → kódolás.

## Cél (egy mondatban)
A letöltött desktop appba becsomagolt hivatalos EREK könyvelés-mappa, amelybe a Kartotékában rögzített **készpénzes ÉS banki** tételek automatikusan, biztonságosan beíródnak a megfelelő lapra (Kassza / A / B…), úgy hogy az `Adatok_<év>.xlsx` és a Kartotéka **mindig egyezik**, évente új mappával.

---

## Fázis E0 — Tauri-alapok (capability + umya + fs) ⟶ *nincs még pénzügyi írás*

**Cél:** a desktop crate képes legyen biztonságosan xlsx-et írni/olvasni.

- `apps/desktop/src-tauri/Cargo.toml`: `umya-spreadsheet = "2.3"` (a PoC-ban bizonyított verzió), `zip` (a `fullCalcOnLoad` patch-hez).
- `apps/desktop/src-tauri/capabilities/default.json`: `fs`, `path`, `dialog` pluginek + szűk hatókör (csak a Könyvelés-mappára).
- **Rust commandok** (`src-tauri/src/excel.rs`, a `db_execute` mintára — szűk, auditálható felület):
  | Command | Feladat |
  |---|---|
  | `excel_append_rows(file_path, sheet, rows: Vec<KasszaRow>)` | D–L append a megadott lap (Kassza/A/B…) utolsó adatsora után |
  | `excel_update_row(file_path, sheet, row_index, row)` | egy sor D–L felülírása (szerkesztés/sztornó) |
  | `excel_read_sheet(file_path, sheet)` | egy lap D–L sorainak kiolvasása (egyeztetéshez) |
  | `excel_read_meta(file_path)` | lap-nevek + betű-lapok 3. sor (deviza) + nyitó egyenlegek + utolsó adatsor indexek |
  | `excel_backup(file_path)` | időbélyeges `.bak` |
  | `excel_recalc_patch(file_path)` | `xl/workbook.xml` → `fullCalcOnLoad="1"` (zip újracsomagolás) |
  | `excel_init_year_folder(year)` | a becsomagolt sablonból új `Konyveles_<év>_a` mappa létrehozása + nyitó egyenleg átvezetés |
- **Minden írás:** backup → ideiglenes fájlba ír → atomikus átnevezés → recalc-patch. (K6 mitigáció.)
- **DoD:** egy teszt-sor append-elhető a Kasszára egy másolaton, a fájl megnyitható, a képletek élnek.

## Fázis E1 — Bundling + Könyvelés-mappa + Beállítás

- `tauri.conf.json` → `bundle.resources`: a teljes `Konyveles_2026_a` (Adatok + Kimutatasok + Nyomtatvanyok + PDF-ek) becsomagolása.
- **Első indítás / gyülekezet-választás:** ha még nincs Könyvelés-mappa, az app a becsomagolt sablont egy írható helyre másolja:
  `…\Documents\Kartoteka\Konyveles_<év>_a\` (alapértelmezett; Beállításban módosítható).
- **Beállítások UI** (`apps/desktop/src/components/settings/` új panel: „Könyvelés (Excel)"):
  - aktuális mappa-útvonal megjelenítése,
  - „Mappa kiválasztása" (dialog) + „Mappa megnyitása" (opener),
  - „Excel-szinkron be/ki" kapcsoló,
  - az `excel_folder_path` / `excel_year` / `excel_sync_enabled` a local settings-be.
- **Évente új mappa:** ha az aktuális év ≠ a mappa éve → felajánlja az `excel_init_year_folder(újév)`-et (előző évi **záró egyenlegek → nyitó egyenleg**). *Megjegyzés: az új évi hivatalos sablont az EREK adja ki → app-frissítéssel szállítjuk; addig az előző sablon szerkezetét visszük tovább.*
- **DoD:** friss telepítés után a mappa ott van, a Beállításban látszik és megnyitható.

## Fázis E2 — Szótárak (finance-kritikus, tisztán elemző)

- **Költségvetési kód 1:1:** az Excel `Koltsegvetes`/`Szamadas` kód-készlete ↔ Kartotéka `szamadasicel` (pl. `101.01`). Eltérés = dokumentált lelet, rendezés MIELŐTT pénz íródik. *(Az I/K oszlopba a kód **szöveges neve** megy — pl. „Egyházfenntartói járulék" —, ahogy a 2025 adat mutatja; a leképezés `befizetescel/kiadascel → szamadasicel.nev`.)*
- **Bank-mapping (auto):** `excel_read_meta` kiolvassa minden betű-lap devizáját → Kartotéka `bankszamla` (valuta + név) párosítás (RON→A, EUR→B…). A Beállításban megerősíthető/felülírható. Tárolás: `excel_bank_map` (bankszamla_id ↔ betű-lap).
- **Irattíp (F) szótár:** Kartotéka kontextus → Excel F érték: nyugtás befizetés → `Chit.`, banki kivonatos tétel → `Extr`, átutalási megbízás → `OP`, számla → `Fact.`, dispozíció → `Disp. Plata`, decont → `Decont.` (a 2025 valós eloszlás alapján).
- **DoD:** kód-egyezési riport (0 eltérés vagy rendezett lista) + jóváhagyott bank- és F-szótár.

## Fázis E3 — Write-through (DB → Excel, a fő irány)

- **`excel_outbox` SQLite-tábla:** `xkey`, `op` (insert/update/delete), `target_sheet`, `payload`, `status`, `retry_count`, `last_error`.
- **`excel_row_map` SQLite-tábla:** `xkey ↔ (sheet, row_index)` — a későbbi szerkesztés/sztornó a **megfelelő** sort frissíti, az újraszinkron **nem duplikál**.
- **Bekötés a meglévő write-sync-be:** sikeres DB-write után (`befizetes-write-sync` / `kiadas-write-sync` / `belsomozgas`):
  - **célzás:** `irattipus='Készpénz'` → `Kassza`; `irattipus='Banki'` + `bankszamla_id` → a mapping szerinti betű-lap;
  - **belső mozgás** = KÉT enqueue (Kassza-oldal + betű-lap-oldal, ahogy a hivatalos rendszer);
  - enqueue `excel_outbox`-ba → `excel_append_rows` → `excel_row_map` → backup → recalc-patch.
- **Sztornó/szerkesztés:** `excel_update_row` a row_map szerinti soron (nem új ellentétes sor — kivéve ha a metodika mást ír elő, E2-ben tisztázva).
- **Fájl-zár tűrés:** ha az Excel nyitva (zárolt), a sor az outboxban marad + retry + státuszsáv: „Excel nyitva — mentsd be és zárd be a frissítéshez."
- **DoD:** egy Kartotékában rögzített készpénzes + egy banki tétel megjelenik a Kassza ill. az A lapon; a Számadás újraszámol.

## Fázis E4 — Hibak-validáció (igazságpróba)

- Írás után `excel_read_sheet('Hibak')` → a kereszt-ellenőrzéseknek nullára kell kijönniük; ha nem, a sync hibát jelez és nem erősíti meg a sort. (K1 mitigáció.)

## Fázis E5 — Excel → DB vezérelt egyeztetés (biztonságos visszairány)

- „Egyeztetés az Excellel" gomb: `excel_read_sheet` minden vezetett lapon → diff a DB-vel (iratszám+dátum+összeg) → **előnézet** (új/módosult/törölt) → felhasználói jóváhagyással import. Soha nem néma. (K3 mitigáció.)

---

## Pénzügyi sarokpontok (kötelező)
1. **Append-only D–L**, M/N és minden számolt laphoz SOHA.
2. **Kerekítés** `ROUND(…,2)` az Excellel azonosan; egész-cent aritmetika.
3. **Kód 1:1** (E2) a pénzmozgás előtt.
4. **Idempotencia** `excel_row_map`-pal.
5. **Backup + atomikus mentés** minden írás előtt.
6. **Hibak = 0** írás után (E4).
7. **DB = kanonikus forrás**; Excel→DB csak előnézetes (E5).

## Kockázatok (a 2026-06-10 terv 5. szakasza + új)
- **ÚJ K8 — bank-mapping téves:** rossz bankszámla → rossz betű-lap. Mitigáció: auto-javaslat deviza+név alapján, Beállításban kötelező megerősítés az első banki tétel előtt; a betű-lap nyitó egyenlege (6. sor) egyeztetése a Kartotéka-nyitóval.
- **ÚJ K9 — évi sablon eltérés:** a következő évi EREK-sablon szerkezete változhat. Mitigáció: app-frissítéssel szállított sablon + szerkezet-verzió ellenőrzés indításkor.

## Javasolt sorrend
E0 → E1 (használható mappa+beállítás, még pénzügyi írás nélkül) → E2 (szótárak, elemző) → **E3 (a fő érték: write-through)** → E4 (Hibak) → E5 (visszairány). Minden fázis külön PR + verifikáció, az E3 előtt az E2 kód-egyezés kötelező kapu.
