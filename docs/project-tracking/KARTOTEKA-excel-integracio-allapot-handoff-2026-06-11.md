# KARTOTÉKA — Excel-integráció + desktop C-hullám: állapot-handoff (2026-06-11)

> Cél: egy ÚJ session ebből a dokumentumból pontosan tudja folytatni. Minden, ami
> ehhez kell: ág, commitok, kész munka, kulcs-artefaktumok, az E3 write-through terv
> és a nyitott döntések.

## 0. Ág és commitok

- **Ág:** `feature/penzugy-decont-dispozitie-osszevont-bevitel` (NE main-re pusholj — PR vagy explicit engedély).
- **Utolsó commitok (régi → új):**
  - `da83866f` E2 KRITIKUS: Kartotéka nevek ≠ Excel nevek (név-alapú aggregáció)
  - `6a846d7d` 400-as belső-mozgás kódok reconciliation (kanonikus 2026-06-10 modell)
  - `dc44891b` Excel auto-konfig E1.5a — egyházmegye az Excelbe (`excel_set_cells`)
  - `c668375b` Excel auto-konfig — mappa-előkészítéskor auto-beírás + offline cache
  - `08cb1dc3` Excel E1.5b — gyülekezeti logó letöltése + lokális cache (`excel_save_file`)
  - `7aeee198` **2026 hivatalos kategória-katalógus kinyerve + szamadasicel név-fix SQL**

## 1. Mi készült el ebben a sessionben

### C-hullám (desktop pénzügyi írási út, web-paritás) — KÉSZ
A desktop Kassza fülön teljes az írási út, mind verifikálva (web tsc + desktop build + cargo check zöld), commitolva:
- **Rögzítés:** `DesktopCombinedEntryDialog` → `saveIncomeUseCase`/`saveExpenseUseCase` (online + offline ág).
- **Sztornó:** `DesktopStornoConfirmDialog` → `stornoIncomeUseCase`/`stornoExpenseUseCase`.
- **Sztornó-visszavonás:** `undoStornoUseCase` (core).
- **Szerkesztés:** `DesktopTransactionEditDialog` → `updateTransactionUseCase` (+ `isLastTransactionOfTypeUseCase` a dátum-guardhoz).
- **Nyugta (chitanță):** `autoIssueChitantaForBefizetesUseCase` + lookup.
- Közös komponensek: `@kartoteka/ui-app` `CashbookTab` (canEdit/canStorno/… flagek), `CombinedEntryBody`, `FinanceSugoTab` (`extraSections` proppal), `FinanceHero`.
- Desktop Súgó kibővítve: `apps/desktop/src/lib/desktop-help-sections.ts` („Asztali (offline) verzió" szekció).

### Excel-integráció E0–E1.5b — KÉSZ
- **E0** (Rust-alapok): `apps/desktop/src-tauri/src/excel.rs` — `excel_append_rows` (D–L append, backup → next-empty-row(7-től) → recalc-patch fullCalcOnLoad → atomikus rename), `excel_read_meta` (SheetMeta: is_bank, currency C3-ból, next_empty_row), `excel_list_sheets`. Crate-ek: `umya-spreadsheet = "2"`, `zip = "2"`, `base64 = "0.22"`.
- **E1** (bundling + mappa): a teljes EREK-sablon becsomagolva (`apps/desktop/src-tauri/resources/konyveles/Konyveles_2026_a/`, `tauri.conf.json` → `"resources": ["resources/konyveles/**/*"]`). `excel_default_folder`/`excel_folder_info`/`excel_setup_folder` (→ `Documents/Kartoteka/Konyveles_<év>_a`)/`excel_open_folder`. Beállítás-fül: `apps/desktop/src/components/settings/konyveles-panel.tsx` + `settings-dialog.tsx` „Könyvelés" tab.
- **E1.5a** (auto-konfig): `excel_set_cells` (biztonságos cella-író: backup + atomikus + recalc) → a „Gyülekezeti adatok alkalmazása" gomb az egyházmegyét (`dioceses.name`, online; offline a denormalizált `egyhazmegye`, majd `LS_DIOCESE` cache) a `Koltsegvetes!V3`-ba írja. **A mappa-előkészítés AUTOMATIKUSAN is alkalmazza.**
- **E1.5b** (logó): `excel_save_file` (base64 → lokális fájl) → a `cimer_url` letöltése a Könyvelés-mappába (`cimer.<ext>`, `LS_LOGO`). „Csak letöltés/cache" — NEM az Adatok-Excelbe (abban nincs is logó-hely, 0 media-fájl).

### 400-as / belső-mozgás kódok — RENDBERAKVA
Kanonikus 5 kód: `300.01`/`301.01`/`400.01`/`401.01`/`402.02`. A 4 árva (`100.51`/`100.52`/`301.02`/`401.02`) deaktiválva (mind 0 használat). `CombinedEntryBody` javítva: `DEPOSIT_KODS={400.01,301.01}`, `WITHDRAW_KODS={401.01,300.01}` (a 300.01 EDDIG HIÁNYZOTT — bug volt), `BANKBANK_KODS={402.02}`. Lásd: memória `belso_mozgas_kanonikus_kodok`.

### Kategória név-mapping — FELOLDVA (a fő blokkoló)
A hivatalos 2026-os kategória-katalógus **statikus** a sablonban → recalc nélkül kiolvasva:
- **`fif` = `Hibak!$C$51:$H$1040`**: C=magyar név, D=kód, E=román név. **927 kategória.**
- **`fi` = `Hibak!$C$198:$D$1131`**: per-számla belső-mozgás nevek (`300.01` = „Készpénzfelvétel a(z) **A** számláról", A–T = 20 számla).
- Szerkezet: **101–107 bevétel (39 levél) + 201–207 kiadás (48 levél) = 87 hivatalos költségvetési kategória.** 300–420 (mind 20-as) = per-számla belső-mozgás.
- `Koltsegvetes!V3` a 2026 sablonban placeholder (`" REFORMÁTUS EGYHÁZMEGYE"`) → az auto-config ezt írja felül; de a `fif`/`fi` táblák a V3-tól FÜGGETLENÜL teljesek.

### Név-fix — LEFUTOTT (a user futtatta)
- `migration-docs/excel-2026-katalogus.json` — a teljes 927-es katalógus (whitespace-normalizálva), durable E3-artefakt.
- `migration-docs/sql/2026-06-11f-…-DIFF.sql` (read-only riport) + `2026-06-11g-…-UPDATE.sql` (futott: **33 `szamadasicel` sort** igazított a hivatalos Excel-nevekhez, kód=`id` szerint, csak `nev`/`nevro`).
- Eredmény: **100% lefedettség** (nincs `1_HIANYZIK_A_KARTOTEKABOL`), mind a 87 Excel-levél megvan a Kartotékában. **Mostantól `szamadasicel.nev` = a hivatalos Excel I/K név** a leveles kategóriáknál → közvetlenül írható E3-ban.
- A nem-egyező Kartotéka-kódok (`2_NINCS_EXCEL_KATALOGUSBAN`) mind várt: aggregát-sorok (100, 101–107, 201–207), egyenleg-sorok (100.01/100.02), belső-mozgás kódok, inaktív árvák.

## 2. A hivatalos EREK Excel szerkezete (reverse-engineering)

`Adatok_2026.xlsx`, 26 lap:
- **`Kassza`** = KÉSZPÉNZ-napló. Adat-oszlopok D–L: D=Dátum, E=Iratszám, F=Irattíp (Chit./Extr/OP/Fact.), G=Név, H=Bev.összeg, I=Bev.kód (NÉV!), J=Kiad.összeg, K=Kiad.kód (NÉV!), L=Megjegyzés. M/N = képletek. Adat 7. sortól.
- **`A`,`B`,`C`,…,`T`** (egybetűs, nagybetű) = BANKSZÁMLA-könyvek, AZONOS D–L sémával. A számla devizája a betű-lap **C3** cellájában (RON/EUR). `M`–`T` lapok rejtettek.
- Az I/K = legördülő, a `bev`/`kiad` named range-ből (`INDIRECT(Hibak!$Z$122):INDIRECT(Hibak!$Z$123)`, V3-tól függő határok). **Az aggregáció NÉV szerint megy (SUMIF), nem kód szerint.**
- A logó NEM ide való (0 media-fájl).

## 3. E3 — DB→Excel write-through (KÖVETKEZŐ NAGY LÉPÉS)

**Cél:** a desktopon rögzített tétel a hivatalos Excelbe is bekerül (Kassza készpénznél, A/B/C… betű-lap banknál), így Kartotéka és Adatok_2026.xlsx mindig egyezik. Append-only. „pénzügyekkel nem lehet viccelni."

### Kód-alapú feltárás eredménye (E3-tervező workflow, run `wf_96e4c6bc-4dc`)
> A workflow szintézis-terve a session végén még futott; az alábbi tények a kész feltáró-ágensekből + a session tudásából.

**Write-path (`packages/core/src/finance/befizetes/save.ts`, `kiadas/save.ts`):**
- Mentés PER-TÉTEL (a batch a `combined-entry-dialog.tsx`-ben hívja soronként; első hibánál áll).
- ONLINE: Zod → iratszám-generálás (ha üres) → duplikátum-check → Supabase insert → `{id, iratszam}`.
- OFFLINE (csak desktop, csak Készpénz!): iratszám-wallet claim → `befizetes_pending_local`/`kiadas_pending_local` (sync_state='pending') → `outbox` enqueue → `{id:-1, pending:true, iratszam}`. Banki tétel offline TILTOTT.
- Excel-hez kell még: kategória **nev**/kod (most már `szamadasicel.nev`), személy/család/átvevő név (join), `bankszamla_id` banki tételnél.
- **Offline tételnél (id=-1) az Excel-append a sync utánra halasztandó** (a `markBefizetesSynced(localId, serverId)` ad valódi ID-t).

**Excel-bridge (`excel.rs`, `lib/excel.ts`):**
- **NINCS dedup/idempotencia!** `excel_append_rows` csak a next-empty-row-t keresi, NEM ellenőrzi az iratszámot. NINCS sor-visszaolvasás.
- → kell egy **`excel_row_map` lokális SQLite tábla** (a design-doc szerint: `xkey ↔ kassza_sor`), hogy a retry ne duplázzon, és a storno/edit megtalálja az Excel-sort.

**Reversal flow-k (`storno.ts`, `undo-storno.ts`, `update-transaction.ts`):**
- Storno = `stornozott=true` flag (NEM töröl/ír át sort) + kaszkád (belső-mozgás pár, chitanta). Undo = flag nullázása. Edit = in-place UPDATE (dátum csak ha utolsó az évben).
- `bealitas.accounting_finalized` (év+gyülekezet) MINDEN mutációt blokkol.

**Belső-mozgás:** egy mozgás KÉT Excel-sort érint (Kassza + a bank betű-lap), per-számla névvel a `fi` táblából.

**Web offline réteg már létezik:** `apps/web/lib/offline/excel-writer.ts` + `excel-import-diff.ts` (Dexie↔Excel, `_rowId` meta-oszloppal) — érdemes megnézni mintaként.

### NYITOTT DÖNTÉSEK (a user dönti el, E3 előtt)
1. **Sztornó append-only Excelben — hogyan?** (a) reverzáló/negatív sor (teljes audit, de duplázza a sorokat, a SUMIF mindkettőt számolja → nettóz); (b) semmi az Excelben (legegyszerűbb, de DB és Excel eltér storno után); (c) a meglévő sor átírása `excel_row_map`-en át (sérti az append-only elvet, gond ha az Excel nyitva). **Ajánlás vizsgálandó: az EREK hivatalos módszertana mit vár stornóra?**
2. **Bank-számla → betű-lap párosítás UX:** automatikus deviza-alapú javaslat (E2) + a user erősíti meg; hol tároljuk (localStorage vs lokális tábla)?
3. **Mikor írjon Excelbe?** Az „Excel-szinkron" kapcsoló mögött (most OFF), a mentés után azonnal vs. külön sync-gomb; offline a sync utánra halasztva.

### E3 javasolt lépések (inkrementális, verifikálva)
1. `excel_row_map` lokális SQLite tábla + migration (dedup/lokalizáció kulcs).
2. Rust: `excel_read_rows` (E-oszlop/iratszám visszaolvasás) a dedup-hoz, VAGY a row_map elég.
3. Egy `excel-write-sync.ts` modul: a row-builder (D–L), név-feloldás (levél = `szamadasicel.nev`; belső-mozgás = `fi` per-számla név), sheet-választás (Kassza vs betű-lap a bankszámla devizája/párosítása alapján).
4. Trigger a mentés után (a kapcsoló mögött) + offline a sync-flow-ban (`befizetes-write-sync.ts`/`kiadas-write-sync.ts` után).
5. Sztornó/edit reflektálás a választott (1) döntés szerint.
6. Verifikáció: cargo check (PowerShellből!) + FE build + valódi Excel-szemrevételezés.

## 4. Tesztelési korlát
A bundling + auto-konfig + write-through end-to-end teszt **aláírt 0.9.0 desktop buildet igényel** — itt nem futtatható. A V3→chart mechanizmust nem kellett valódi Excelben tesztelni (a katalógus statikus volt), de az append + recalc end-to-end-et igen.

## 5. Fontos környezeti tudnivalók
- **cargo check/build CSAK PowerShellből** (Strawberry Perl); Git-bash MSYS-perl → openssl-sys bukik. Target: `C:\kartoteka-target`. Lásd memória `desktop_cargo_check_powershell`.
- **Nincs Kartotéka Supabase MCP** — SQL-t fájlként készíts a user manuális futtatására (a csatlakozott Supabase MCP a Baratosi Project, NEM a Kartotéka).
- Dev: `npm run dev` (webpack), ne Turbopack. Hibára előbb hard refresh + SW unregister, ne restart.
