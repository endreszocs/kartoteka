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

---

## 6. E3 RÉSZLETES TERV — az E3-tervező workflow szintézise (`wf_96e4c6bc-4dc`)

> Kód-alapú, 5 párhuzamos feltáró + szintézis. Ez a kanonikus E3-terv.

**Architektúra:** egy ÚJ, desktop-only **`excel_outbox` + `excel_row_map`** pár (KÜLÖN a meglévő finance `outbox`-tól!), amit EGYETLEN háttér-worker ürít, ami az ÖSSZES Excel-I/O kizárólagos tulajdonosa. **A trigger NEM a mentéskor van:** online mentés → enqueue sikerkor; offline mentés → enqueue CSAK a push-sync után, amikor a valódi szerver-id rákerül (`markBefizetesSynced`/`markKiadasSynced`), mert offline a `{id:-1}` és a wallet-iratszám MÉG újraosztható egy unique-konfliktusnál. Idempotencia app-oldalon az `excel_row_map`-pel, **`xkey` stabil kulccsal** (belső-mozgásnál `xkey + side`) — az `excel_append_rows`-nak nincs visszaolvasása/dedupja, ezért a worker kihagy minden tételt, aminek már van row_map-bejegyzése. Minden a `LS_SYNC` kapcsoló (default OFF) + az E2 spot-check mögött.

### Lépések
- **0. KAPU:** a 2 user-döntés (lent) + az E2 spot-check SQL 0 kód-eltérést adjon a teszt-gyülekezetre (a lépésterv szerint az E2 kód-egyenlőség hard gate). Go/no-go, nincs kód.
- **1. SQLite séma (`db.rs`, user_version=30):** `excel_outbox(id, op 'append'|'reversal', identity_key, side DEFAULT 'main', target_sheet, payload_json, congregation_id, ev, status, retry_count, last_attempt_at, last_error, created_at)` + `excel_row_map(identity_key, side DEFAULT 'main', file_path, sheet, row_index, appended_at, PRIMARY KEY(identity_key, side))`. A PK(identity_key, side) az idempotencia gerince. KÜLÖN a finance `outbox`-tól.
- **2. Rust `excel_append_reversal` (`excel.rs`, `lib.rs`, `excel.ts`):** EGY tükör-sor a next-empty-row-ra, ellentett előjelű összeggel + `megjegyzes` prefix `SZTORNÓ: <iratszam>`. (Ha Endre in-place-t akar: `excel_update_row(file_path, sheet, row_index, row)` csak D–L — de sérti az append-only-t + veszélyes nyitott fájlnál.) NINCS Rust-oldali E-oszlop dedup — az idempotencia a workerben marad, a Rust buta auditálható író.
- **3. Core PURE D–L row-builder (`packages/core/src/finance/excel/row-builder.ts`):** unit-tesztelhető, nincs Supabase/Tauri. KasszaRow: F=irattíp az E2 irattíp-szótárból; **cent-pontos kerekítés `Math.round(x*100)/100`** (= Excel `ROUND(...,2)`). Név-feloldás (MÁR MEGOLDVA): levél → `bevKod`/`kiadKod` = a feloldott `szamadasicel.nev` (= hivatalos I/K név); belső-mozgás → per-számla `fi`/bankszámla név. A szótárakat paraméterként injektáld.
- **4. Backend metódusok (`tauri-sqlite-backend.ts`):** `enqueueExcelRow`, `getPendingExcelRows`, `markExcelRowDone`, `markExcelRowBlocked`/`updateExcelRowAttempt`, `hasRowMap`, `insertRowMap`, `getRowMap`. **Identity-key kontraktus:** normál tételnél `identity_key = xkey` (server-bound uuid a `save.ts`-ben, stabil a local→server átmeneten — NEM az `id:-1`!); belső-mozgásnál ugyanaz az xkey `side='kassza'`/`side='bank'`. A worker `insertRowMap`-et CSAK a Rust `first_row` visszatérése UTÁN ír.
- **5. Worker (`apps/desktop/src/lib/excel-write-sync.ts`):** a `befizetes-write-sync.ts` mintájára (singleton inFlight guard, 30s poll, online/event/manual trigger, exp-backoff). Tételenként: (1) LS_SYNC OFF → marad; (2) filePath az LS_FOLDER-ből; (3) `hasRowMap` → markDone (crash-dedup); (4) `excel_append_rows`/`excel_append_reversal`; (5) siker → `insertRowMap(firstRow)`+markDone; (6) fájl-zárolva (Excel nyitva) → marad+retry+`'Excel nyitva — N tétel várakozik'` (SOHA csendben); (7) egyéb → backoff → 'blocked'. **KRITIKUS: szigorúan EGYESÉVEL** (a teljes-fájl backup+rewrite nem konkurencia-biztos), `created_at` sorrendben (a belső-mozgás 2 oldala együtt érkezzen).
- **6. Trigger A — online mentés sikerkor (`combined-entry-dialog.tsx`, `save.ts`):** sikeres ONLINE eredmény után (`result.success && !result.pending`) enqueue `op='append'`, `identity_key=xkey`. Ajánlott: a use-case ADJA VISSZA az xkey-t (Decision 3, egysoros). Nevek a dialógus prop-jaiból.
- **7. Trigger B — offline tétel CSAK a push-sync után (`befizetes-write-sync.ts`, `kiadas-write-sync.ts`):** az offline `id:-1` + az iratszám újraosztható (23505 → `resolveBefizetesConflict`), ezért az Excel-append NEM mentéskor. Beköt a `markBefizetesSynced(localId, serverId)` sikerágába (~190. sor): ott végleges az iratszám + van szerver-id; olvasd a lokális pending sort (xkey + mezők), építsd a D–L sort, `enqueueExcelRow(identity_key=xkey)`. Online+offline is xkey-re kulcsol → nincs dupla. **NE enqueue-olj a 23505 konfliktus-ágon.**
- **8. Belső-mozgás — KÉT enqueue (`belsomozgas-page.tsx`, `belsomozgas/save.ts`):** egy mozgás 2 Excel-sor. `side='kassza'` (Kassza-lap) + `side='bank'` (betű-lap), közös `identity_key=belsomozgas xkey`. Per-számla nevek a `fi`/bankszámla-ból. Ha a forrás/cél nem oldható fel `bankszamla_id`-ra → 'blocked' világos okkal (SOHA ne tippelj betű-lapot).
- **9. Bank→betű-lap mapping + Beállítás-UX (`konyveles-panel.tsx`, `excel.ts`):** E2 auto deviza-mapping (`excel_read_meta` → C3 deviza; RON→A, EUR→B), tárolás `localStorage` JSON `congregationId+év` kulccsal. Beállítás-alpanel: `excelReadMeta` → mutatja a javasolt párokat → **kötelező egyszeri megerősítés az ELSŐ bank-írás előtt**. A worker visszautasít nem-megerősített betű-lapot. Több-RON-számla: `bank_neve` szerint rendezve, kötelező megerősítés.
- **10. Storno/undo/edit (append-only) (`storno-confirm-dialog.tsx`, `transaction-edit-dialog.tsx`, `storno.ts`):** storno = in-place `stornozott=true` → Excelben tükör-sor. Ajánlott (Decision 1): storno sikerkor enqueue `op='reversal'`, `identity_key=xkey + side='storno'` (idempotens). Kaszkád (belső-mozgás pár + chitanták) mindegyik saját reversal. undo-storno: külön side. edit: régi-reverzál + új-append (2 tétel). Év-véglegesítésnél (ha a use-case blokkolt) NE enqueue-olj.
- **11. Kapcsoló élesítése + státusz + verifikáció (`konyveles-panel.tsx`):** a `LS_SYNC` toggle indítsa/állítsa a workert (boot-on is, ha enabled — `startBefizetesAutoSync` mintára). A `'(E3-ban élesedik)'` jegyzet helyett élő státusz (várakozó-szám, 'Excel nyitva', utolsó hiba, „Szinkron most" gomb). Verifikáció EGY MÁSOLATON: (1) készpénz-bevétel a Kasszán jó I-névvel+összeggel; (2) banki kiadás a párosított betű-lapon; (3) újrafuttatás NEM duplázza; (4) storno = ellenelőjeles sor; (5) belső-mozgás = pontosan 2 sor; (6) nyitott fájlnál 'Excel nyitva' + queue marad. Külön PR + CHANGELOG fázisonként, toggle default OFF.

### NYITOTT DÖNTÉSEK (Endre dönti el E3 előtt)
1. **Storno/undo/edit append-only Excelben:** (a) **ellenelőjeles SZTORNÓ tükör-sor [AJÁNLOTT]** — audit + a képletek a DB-igazságra nettóznak + marad append-only; (b) semmi — legegyszerűbb, de a Kassza a sztornózott összeget élőként mutatja; (c) sor-átírás — vizuálisan egyezik, de sérti az append-only-t + veszélyes nyitott fájlnál. *Egyeztetendő: az EREK hivatalos módszertan negatív sort vár-e, vagy cancellation-jelölőt — utóbbinál az F/megjegyzes konvenció változik, de az append-only marad.*
2. **Bank→betű-lap mapping tárolása + megerősítés:** **localStorage `congregationId+év` + kötelező egyszeri megerősítés az első bank-írás előtt [AJÁNLOTT]**; vagy SQLite `excel_bank_map` (ha év-közti lekérdezés kell). A worker blokkol nem-megerősített betű-lapot. Több-RON tie-break: `bank_neve` rendezés + megerősítés.
3. **A save use-case adja-e vissza az `xkey`-t?** **Igen [AJÁNLOTT]** — egysoros, low-risk; egy `identity_key` logikai tranzakciónként, akár online (6.) akár offline-push (7.) → ez akadályozza meg a dupla-írást a hivatalos könyvbe.

### TOP FINANCE-KOCKÁZATOK (mind mitigálva a tervben)
1. **Dupla-írás retry/crash-nél** — ha az `excel_append_rows` sikerül, de a worker crashel a row_map-írás előtt → mitigáció: egyesével, row_map AZONNAL a `first_row` után, `hasRowMap` MINDEN Rust-hívás ELŐTT, kulcs = stabil `xkey` (NEM `id:-1`/iratszám — az újraosztható).
2. **Offline sor túl korai append-je** — mentéskori enqueue (`id:-1`) olyan iratszámot ír, amit a `resolveBefizetesConflict` ÚJRAOSZTHAT → mitigáció: offline CSAK a push-sync sikerágában, soha mentéskor, soha a 23505-ön.
3. **Rossz lap (pénz rossz számlakönyvbe)** — hibás `bankszamla_id`→betű vagy feloldatlan belső-mozgás → mitigáció: kötelező Beállítás-megerősítés az első bank-írás előtt + BLOCK (nem tippelés) feloldatlannál.
4. **Kerekítés-drift vs Excel `ROUND(...,2)`** — cent-eltérés töri a Hibak cross-checket → mitigáció: cent-pontos kerekítés a core-ban + Hibak=0 ellenőrzés (E4). Multi-deviza bank-sornál DÖNTSD EL: a betű-lapra a valuta-összeg (`osszeg`) vagy a RON-egyenérték (`osszeg_ron`) megy-e (a C3 devizának megfelelően).
5. **Konkurens/részleges fájl-írás korrumpálja az xlsx-et** — a Rust egész workbookot újraír → mitigáció: szigorú single-flight worker, queue marad + látható 'Excel nyitva' zárolásnál, a meglévő időbélyeges backup + atomikus rename a crash-biztonság.
