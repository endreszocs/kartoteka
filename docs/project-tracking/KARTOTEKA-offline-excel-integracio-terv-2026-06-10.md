# KARTOTÉKA — Offline desktop ⇄ hivatalos Excel-könyvelés integráció (kivitelezési terv)

**Dátum:** 2026-06-10 · **Készítette:** átvilágítás (4 párhuzamos felderítő ágens + kézi Excel-elemzés és Tauri-verifikáció)
**Tárgy:** A letölthető Windows (Tauri) offline app integrálása a Beke Tivadar-féle hivatalos EREK-könyvelési Excel-fájlokkal, kétirányú adatszinkronnal a felhő-DB és az Excel között. Pixelpontos paritás a webalkalmazással.

> **Státusz (2026-06-10): 3.0 PoC-spike ✅ GO — a megvalósíthatóság bizonyítva.** A 0. szakasz GO/NO-GO kapuja zöld (lásd a 8. szakaszt). Könyvtár: **umya-spreadsheet (pure Rust)** — nincs szükség Python-sidecarra (5. nyitott kérdés eldőlt). A kivitelezés folytatódhat a 3.1 (kód-szótár) → 3.2 (Tauri-alapok) iránnyal. **Pénzügyi kód még nem készült** — a következő lépés a kód-szótár 1:1 egyeztetés.

---

## 0. Vezetői összefoglaló

A Kartotéka offline desktop appja ma **felhő-only**: a lokális SQLite (SQLCipher) gyorsítótár kétirányban szinkronizál a Supabase-szel (pull + outbox-alapú write-push, offline iratszám-„pénztárcával"). A feladat egy **harmadik szinkrontárgy** beépítése: a gyülekezet gépén lévő hivatalos Excel-könyvelés (`Adatok_2026.xlsx`).

A hivatalos Excel egy **egykönyvelős (single-entry) pénztárkönyv**: a `Kassza` munkalap (10 000+ sor) az **egyetlen adatbeviteli pont**, minden más lap (A–T költségvetési oldalak, Számadás, Kimutatások) **képletekkel automatikusan számolódik** belőle. Ez a tervet alapvetően meghatározza: **kizárólag a `Kassza` lap D–M adatoszlopaiba szabad írni, a képlet-cellákhoz soha.**

**Javasolt szinkron-modell (biztonsági okból):**
- **DB → Excel: automatikus, folyamatos write-through.** Minden Kartotékában rögzített készpénzes tétel azonnal megjelenik a `Kassza` lapon. *Ez „a két helyre mentés".*
- **Excel → DB: vezérelt, kézi egyeztetés (nem néma).** Ha a lelkész közvetlenül az Excelben szerkeszt, egy „Egyeztetés" művelet diff-előnézettel mutatja az eltéréseket, és a felhasználó hagyja jóvá az importot.

**Miért nem teljesen néma kétirányú?** A normalizált pénzügyi adatbázis a hivatalos könyvelés kanonikus forrása. Egy elgépelés vagy véletlen Excel-szerkesztés néma visszaszinkronnal meghamisítaná a hivatalos könyvet. A pénzügynél a kontrollált, előnézetes import a felelős megoldás — miközben a felhasználó élménye továbbra is „mindkettő mindig friss".

---

## 1. Hogyan működik MA — térkép

### 1.1 Desktop app (Tauri 2, v0.8.7) — verifikált

- **Stack:** Tauri 2 + Vite/React frontend, Rust backend, **SQLCipher-titkosított SQLite** (`rusqlite` `bundled-sqlcipher`), kódaláírt NSIS-telepítő (magyar). [`Cargo.toml`, `tauri.conf.json` — ellenőrizve]
- **Rust command-felület:** generikus `db_execute(sql, params)` / `db_select(sql, params)`, plusz eszköz- és PIN-kezelő commandok, és a sorszám-„pénztárca" commandjai (`iratszam_wallet_claim_next`, `chitanta_wallet_claim_next`). [`src-tauri/src/lib.rs`, `db.rs`]
- **Szinkron-architektúra:**
  - **Pull (olvasás):** `sync-orchestrator.ts` — indításkor teljes pull, percenként „light bundle", 5 percenként „full bundle", online-eseményre azonnal. Egy globális `dataVersion` számláló minden sikeres pull után frissíti az oldalakat (offline-first auto-reload). [verifikálva]
  - **Write-push (írás):** entitásonkénti `*-write-sync.ts` modulok (`befizetes-write-sync.ts`, `kiadas-write-sync.ts`, `csalad-`, `szemely-`, `gyerek-`, `chitanta-sync.ts`). Offline íráskor: (1) **offline iratszám-allokáció** az `iratszam_wallet_local` pool-ból atomikusan; (2) pending sor a `*_pending_local` SQLite-táblába `sync_state='pending'`; (3) mutáció az **`outbox` sorba** (`op`, `target_table`, `payload` JSON, `retry_count`, `expected_revision`). Push: online-eseményre + 30 mp-es poll + kézi „Sync most"; exponenciális backoff (0/30s/60s/2p/5p/15p), 5 sikertelen kísérlet után **konfliktus-állapot**. UNIQUE-ütközés (`23505`, foglalt iratszám) → automatikus konfliktus + felhasználói feloldás (törlés vagy újraszámozás). [`*-write-sync.ts` — ágens-felderítés]
- **Jelenlegi korlátok az Excelhez (verifikálva):**
  - **Nincs fájlrendszer-jogosultság:** `capabilities/default.json` = `core:default` + `opener:default` + `updater:default`. Nincs `fs`/`dialog`/`path` plugin.
  - **Nincs xlsx-képesség:** a Cargo.toml-ban semmilyen Excel-crate (umya/calamine/rust_xlsxwriter), és nincs Python-runtime a bundle-ben.
  - CSP `connect-src`: csak Supabase + Railway.

### 1.2 A hivatalos Excel-rendszer — kézzel elemezve

**`Adatok_2026.xlsx` (1,4 MB, 26 munkalap)** — az ADAT-fájl:
| Lap | Szerep |
|---|---|
| **`Kassza`** | **MASTER pénztárkönyv** — az egyetlen adatbeviteli pont (10 000+ sornyi kapacitás). Oszlopok a 7. sortól: **D=Dátum, E=Iratszám, F=Irattíp, G=Név, H=Bevétel összeg, I=Bevétel költségvetési kód, J=Kiadás összeg, K=Kiadás költségvetési kód, L=Megjegyzés, M=Magyarázat.** (A–C és N oszlopok: **képletek**.) |
| `Monetar` | Készpénz-címletszámolás (darab × címlet) |
| `Kasszakonyv` | Nyomtatható pénztárkönyv (REGISTRU DE CASĂ) — képlet |
| `A` … `T` (20 lap) | Költségvetési oldalak — mind a `Kassza`-ból szűrt, **képlettel** számolt nézet, kategóriánként |
| `Hibak` | Ellenőrző kereszt-számítások (Kassza vs. A–T lapok nettó nullára kell kijöjjön) |
| `Szamadas` | Számadás-összesítő — képlet |
| `Koltsegvetes` | Költségvetés (terv vs. tény) — képlet |

**`Kimutatasok_2026.xlsx` (2 MB, 6 lap)** — RIPORT-fájl, **külső linkkel** az `Adatok_2026`-ra: `Fo_konyv` (főkönyvi napló), `Naplo`, `Csoportnaplo` (egyházfenntartói járulék körzetenként), `Kiadasi_kiseroiv`, `Resz_szamadas`. *Ezt a fájlt nem írjuk — az Excel a megnyitáskor frissíti a linkeket.*

**`Nyomtatvanyok/` mappa** — önálló (nem linkelt) nyomtatványok, amelyek meglévő Kartotéka-modulokhoz köthetők: `Iktato.xlsx` → iktató, `Munkanaplo_Lelkeszi jelentes.xlsx` → munkanapló + éves jelentés, `Lelkeszi jelentes.xlsx` → éves jelentés, `Dispozitie de plata_2026.xlsx` → dispozíció, `Elszamolas_2026.xlsx` → elszámolás/decont, `Anyagraktarkonyv.xlsx` → leltár.

**Kulcsmegállapítás:** mivel minden számítás a `Kassza`-ból ered, **az integráció = a `Kassza` D–M oszlopaiba való biztonságos sor-hozzáfűzés.** A teljes számítási kaszkád (A–T, Számadás, Kimutatások) az Excel megnyitásakor automatikusan újraszámolódik.

### 1.3 Kartotéka pénzügyi adatmodell ↔ Kassza megfelelés

A Kassza oszlopai tisztán megfeleltethetők a `befizetes` (bevétel) és `kiadas` (kiadás) tábláknak:

| Excel `Kassza` oszlop | Kartotéka mező | Megjegyzés |
|---|---|---|
| D — Dátum | `befizetes/kiadas.datum` | |
| E — Iratszám | `.iratszam` | Kartotéka az `iratszam_pointers` RPC / offline wallet alapján generálja → **ez lesz a hiteles szám** |
| F — Irattíp | `.irattipus` | **Szótár-normalizálás kell** (lásd 4. nyitott kérdés) |
| G — Név | `befizetes` → személy neve / `kiadas.atvevo` | |
| H — Bevétel összeg | `befizetes.osszeg` | 2 tizedesre kerekítve (Excel `ROUND(...,2)`) |
| I — Bevétel kód | `befizetes.id_befizetescel → befizetescel.id_szamadasicel` (pl. `101.01`) | **Kód-szótár 1:1 egyeztetés kötelező** |
| J — Kiadás összeg | `kiadas.osszeg` | |
| K — Kiadás kód | `kiadas.id_kiadascel → kiadascel.id_szamadasicel` | |
| L — Megjegyzés | `.megjegyzes` | |
| M — Magyarázat | (belső mozgás / sztornó indok) | |

**Csak a KÉSZPÉNZES tételek kerülnek a Kassza-ba:** `irattipus ~ 'készpénz'` ÉS `belso_mozgas_xkey IS NULL` ÉS `deleted = false`. A bank, a belső mozgás és a multi-valuta NEM tartozik ide (a Kassza csak készpénz). A `Monetar` lap a `monetar` + `nom_cimlet` táblákhoz köthető.

---

## 2. Az integráció architektúrája (javaslat)

### 2.1 Hol éljen az Excel és hogyan kerül a gépre

- Telepítéskor a hivatalos Excel-csomag a felhasználó gépére kerül (a jelenlegi minta: `…\Adatok\Konyveles_2026_a\`). **Nyitott kérdés:** a telepítő szállítsa-e (üres sablonként), vagy a meglévő gyülekezeti fájlt regisztrálja a felhasználó? (lásd 6. szakasz).
- A fájl pontos elérési útját a felhasználó **a Beállításokban adja meg / erősíti meg** (fájlválasztó), és a desktop a `settings`/local-DB-ben tárolja (`excel_file_path`, `excel_year`).

### 2.2 Rust-oldali írás — biztonságos, kontrollált felület

A széles `fs` plugin helyett **dedikált Rust command** (a meglévő `db_execute` mintára), amely a teljes Excel-műveletet a Rust-rétegben végzi — szűk jogosultsági felület, auditálható:

```
#[tauri::command] excel_append_kassza(file_path, rows: Vec<KasszaRow>) -> Result<AppendReport>
#[tauri::command] excel_read_kassza(file_path) -> Result<Vec<KasszaRow>>   // egyeztetéshez
#[tauri::command] excel_backup(file_path) -> Result<backup_path>
```

- **xlsx-könyvtár:** a Tauri/Rust kontextusban a reális választás az **`umya-spreadsheet`** (pure-Rust, olvas+ír, megőrzi a többi lap képleteit/stílusait), mert nem igényel Python-runtime-ot a bundle-ben. **DE ezt a 0. fázisban kötelező validálni** ezen a konkrét fájlon (lásd 3.0). Ha az `umya` nem őrzi meg megbízhatóan a definiált neveket / a Kimutatasok külső linkjeit / az A–T képleteket, a tartalék terv egy **Python-sidecar `openpyxl`-lel** (PyInstaller egybináris, Tauri sidecarként) — ez a legjobban bizonyított formula-megőrző, cserébe nagyobb telepítő.
- **APPEND-ONLY a `Kassza`-ra:** csak a D–M oszlopok az utolsó adatsor után; az A–C, N és minden más lap érintetlen.
- **Recalc-on-open:** a mentett fájlban beállítjuk a „teljes újraszámítás megnyitáskor" jelzőt, hogy a felhasználónak ne kelljen F9-et nyomnia.
- **Biztonsági öv:** minden írás előtt időbélyeges biztonsági másolat (`.bak`), és tranzakciós minta (ideiglenes fájlba ír → atomikus átnevezés), hogy egy megszakadt írás ne tegye tönkre a könyvet.

### 2.3 Excel-szinkron sor (a meglévő cloud-outbox mellé)

A felhő-outboxtól **elkülönült** `excel_sync` mechanizmus, mert más a hibamódja (fájl-zár, nem hálózat):

- **`excel_outbox` SQLite-tábla:** `xkey`, `op` (insert/update/delete), `payload`, `status`, `retry_count`, `last_error`.
- **`excel_row_map` SQLite-tábla:** `xkey ↔ kassza_sor` leképezés — így egy DB-tétel későbbi módosítása/sztornója a **megfelelő** Excel-sort frissíti, és az újraszinkron **nem duplikál**. (A leképezést sidecar-táblában tartjuk, nem az Excel-be írt rejtett oszlopban — az utóbbi elronthatná a képleteket.)
- **Trigger:** minden sikeres DB-write után + fájl-zár felszabadulására + kézi gomb. Ha az Excel meg van nyitva (zárolt), a művelet a sorban marad, és a státuszsáv jelzi: „Excel nyitva — mentsd be és zárd be a frissítéshez."

### 2.4 Adatfolyam (egy készpénzes befizetés példáján)

```
Lelkész rögzít egy befizetést (online VAGY offline)
  │
  ├─►  DB-ág (meglévő):  pending_local → outbox → Supabase (push), iratszám-wallet
  │
  └─►  Excel-ág (ÚJ):    excel_outbox(insert, xkey) → excel_append_kassza(D–M)
                          → excel_row_map(xkey ↔ sor) → backup → recalc-on-open
```

Mindkét ág **idempotens** és **offline-tűrő**. A felhasználó bármelyik felületet nyitja (web / desktop / Excel), ugyanazt látja.

---

## 3. Fázisok (mérföldkövek)

### 3.0 — PoC-spike: a formula-megőrzés bizonyítása *(kötelező első lépés, GO/NO-GO kapu)*
A teljes terv ezen áll vagy bukik. Az `Adatok_2026.xlsx` **másolatán**:
1. `umya-spreadsheet`-tel beolvasni, a `Kassza`-ba 5 próbasort fűzni (D–M), elmenteni.
2. Excelben megnyitni és ellenőrizni: az A–T lapok, a `Szamadas`, a `Hibak` kereszt-számítások és a `Kimutatasok_2026.xlsx` külső linkjei **helyesen újraszámolnak**, a 45 definiált név megmarad.
3. Ha `umya` megbukik → ugyanez `openpyxl` Python-sidecarral.
**Kimenet:** döntés a könyvtárról + a telepítő-méret hatásának ismerete.

### 3.1 — Pénzügyi szótár-egyeztetés *(finance-kritikus)*
1. Az Excel `Koltsegvetes`/`Szamadas` lapjaiból kinyerni a **teljes költségvetési kód-készletet** és az A–T oldal-hozzárendelést.
2. **1:1 összevetni** a Kartotéka `szamadasicel` kódkészletével (`101.01` stb.). Minden eltérés (hiányzó kód, eltérő szám, eltérő típus) dokumentált lelett és rendezendő, MIELŐTT bármilyen összeg az Excelbe kerül.
3. Az `irattipus` (F oszlop) szótár normalizálása (Excel A/L/Z … ↔ Kartotéka 'Készpénz'/…).

### 3.2 — Tauri-alapok
- `fs`/dedikált Rust command + capability bővítés; `excel_append_kassza` / `excel_read_kassza` / `excel_backup`; backup + atomikus mentés + recalc-on-open. Beállítás-UI az Excel elérési útjához.

### 3.3 — DB → Excel write-through (a fő irány)
- `excel_outbox` + `excel_row_map` táblák; az `befizetes-write-sync` / `kiadas-write-sync` sikeres DB-write-ja után az Excel-ág enqueue-zése; a készpénz-szűrő pontos alkalmazása; insert/update/delete (sztornó) kezelése; fájl-zár-tűrő újrapróbálkozás; státuszsáv.

### 3.4 — Kezdeti egyeztetés *(duplikáció-mentesség)*
- Első összekapcsoláskor: az Excel meglévő `Kassza`-sorai vs. a DB tételei egyeztetése (iratszám + dátum + összeg alapján), az `excel_row_map` felépítése **duplikálás nélkül**. Meglévő, eltérő számozású történeti adat kezelése (offset/folytatólagos számozás).

### 3.5 — Excel → DB vezérelt egyeztetés (a biztonságos „visszairány")
- „Egyeztetés az Excellel" művelet: `excel_read_kassza` → diff a DB-vel → **előnézet** (új / módosult / törölt sorok) → felhasználói jóváhagyással import. Soha nem néma.

### 3.6 — Pixelpontos paritás a webbel *(állandó követelmény)*
- A desktop `befizetes-page` (≈1600 sor) és `kiadas-page` (≈1400 sor) konvergálása a **megosztott `@kartoteka/ui-app` finance-komponensekre**, amelyeket a web is használ (`CashbookTab`, `IncomeDialogBody`/`ExpenseDialogBody`, `FinanceDashboard`, `BankTab`, `MonetaryTab` stb.). Cél: egyetlen forrásból renderelt, azonos megjelenésű felület; a desktop csak az offline-wallet/sync-réteget adja hozzá. (A ma még desktopon hiányzó nézetek — Számadás, Költségvetés, Decont/Dispozíció, Oblio — fokozatos bekötése.)

### 3.7 — Nyomtatványok (későbbi bővítés)
- A `Nyomtatvanyok/` űrlapok (iktató, munkanapló, éves jelentés, dispozíció, elszámolás, leltár) opcionális kitöltése a megfelelő Kartotéka-modulokból — ugyanazzal az append-only/biztonsági mintával.

---

## 4. Pénzügyi precizitási sarokpontok (kötelező betartani)

1. **Kerekítés:** minden összeg `ROUND(…, 2)` az Excellel azonosan; a kód oldalon `Decimal`/egész-cent aritmetika, soha nem nyers `float`-kerekítés.
2. **Kód-egyezés 1:1:** a `szamadasicel` ↔ Excel költségvetési kódok teljes egyezése a feltétel (3.1). Eltérő kódra **nem írunk** összeget.
3. **Készpénz-szűrő pontossága:** csak `irattipus ~ készpénz` ÉS `belso_mozgas_xkey IS NULL` ÉS `deleted=false`. A bank/belső mozgás kimarad a Kassza-ból.
4. **Idempotencia:** `excel_row_map` (xkey ↔ sor) garantálja, hogy újraszinkron/újraindítás nem duplikál és nem hagy árva sort.
5. **Sztornó = update/delete a megfelelő soron**, nem új ellentétes sor (hacsak a hivatalos metodika nem ezt írja elő — 3.1-ben tisztázandó).
6. **Backup minden írás előtt + atomikus mentés** — megszakadt írás nem ronthatja a könyvet.
7. **Hibak-lap = igazságpróba:** írás után az Excel `Hibak` kereszt-ellenőrzéseinek nullára kell kijönniük; ha nem, a sync hibát jelez és nem erősíti meg a sort.

---

## 5. Kockázatok

| # | Kockázat | Hatás | Mitigáció |
|---|---|---|---|
| K1 | A választott xlsx-könyvtár elrontja a képleteket/linkeket/neveket | Hibás hivatalos könyv | **3.0 PoC GO/NO-GO**; append-only; backup; Hibak-lap ellenőrzés |
| K2 | Kód-szótár eltérés Excel ↔ Kartotéka között | Rossz költségvetési sorba kerül a pénz | 3.1 kötelező 1:1 egyeztetés a pénzmozgás előtt |
| K3 | Néma kétirányú sync Excel-elgépelést visszaír a kanonikus DB-be | Könyv-hamisítás | DB=forrás; Excel→DB csak előnézetes, jóváhagyott import |
| K4 | Excel nyitva (fájl-zár) íráskor | Sikertelen mentés | excel_outbox sorban tartja + retry + státusz-üzenet |
| K5 | Kezdeti történeti adat duplikálódik | Dupla bevétel a könyvben | 3.4 kezdeti egyeztetés, row-map duplikáció-mentesen |
| K6 | Python-sidecar (ha kell) növeli a telepítőt | Nagyobb letöltés | Csak ha az umya megbukik; egybináris PyInstaller |
| K7 | Iratszám-ütközés a wallet és a meglévő Excel-számozás közt | Foglalt szám / lyuk | Kartotéka-számozás a hiteles; 3.4-ben offset-egyeztetés |

---

## 6. Döntések

### Eldöntve (2026-06-10, Endre)
1. ✅ **Szinkron-irány:** a javasolt biztonságos modell — **DB→Excel automatikus write-through, Excel→DB vezérelt-előnézetes egyeztetés.** A felhő-DB a hivatalos könyv kanonikus forrása.
2. ✅ **Excel forrása:** a felhasználó **meglévő gyülekezeti fájlját regisztráljuk** (Beállítások → fájlválasztó). A meglévő történeti adatot megőrizzük → a **3.4 kezdeti egyeztetés** duplikáció-mentesen fésüli össze a DB-vel.

### Még nyitott (a kivitelezés indulása előtt tisztázandó)
3. **Több gyülekezet / egy fájl:** egy desktop-telepítés egy gyülekezet egy Excel-fájljához kötődik, vagy lehet több? Évváltás (`Adatok_2027.xlsx`)?
4. **Irattíp-szótár:** a hivatalos F-oszlop kódkészlete (A/L/Z…) — van-e kanonikus lista, amihez igazodjunk? (a 3.1 fázis amúgy is kinyeri az Excelből)
5. **Telepítő-méret tűrés:** ha a 3.0 PoC szerint Python-sidecar kell az openpyxl-hez (biztosabb formula-megőrzés), elfogadható-e a nagyobb telepítő, vagy maradjunk a pure-Rust umya-nál?
6. **Bank/belső mozgás:** a hivatalos rendszerben a bank külön nyomtatványban van — kell-e azt is tükrözni, vagy a Kassza (készpénz) az integráció első köri hatóköre?

---

## 7. Státusz és következő lépés

**Státusz (2026-06-10): a terv felülvizsgálatra vár (Endre olvassa át).** Kód nem indul, amíg a jóváhagyás meg nem érkezik.

A jóváhagyás után a javasolt indulás: a **3.0 PoC-spike** (umya-spreadsheet append-teszt egy Excel-másolaton + újraszámítás-ellenőrzés — GO/NO-GO kapu), párhuzamosan a **3.1 kód-szótár egyeztetéssel** (tisztán elemző, nem ír semmit). A 3.4 (kezdeti egyeztetés) a 2. döntés miatt biztosan a hatókör része.

---

## 8. 3.0 PoC-spike eredmény (2026-06-10) — ✅ GO

**Cél:** bizonyítani, hogy egy Rust xlsx-könyvtár sorokat tud fűzni a `Kassza` laphoz a többi lap képleteinek, a definiált neveknek és a fájlszerkezetnek a megőrzésével.

**Módszer:** az éles `Adatok_2026.xlsx` **másolatán** egy `umya-spreadsheet` (2.3.3, pure Rust) spike: 3 teszt-tranzakció a `Kassza` D–L oszlopaiba (a 7–9. sorba), majd mentés. Az eredményt `openpyxl`-lel ellenőriztem input vs. output összevetéssel.

**Eredmény — minden megőrződött:**
| Ellenőrzés | Input | Output | Státusz |
|---|---|---|---|
| Munkalapok (név+sorrend) | 26 | 26 | ✅ azonos |
| Definiált nevek | 45 | 45 | ✅ egy sem veszett el |
| Képletek/lap (Kassza) | 15 986 | 15 986 | ✅ |
| Képletek/lap (A / Hibak / Számadás / Költségvetés) | 2991 / 4629 / 2645 / 1157 | ugyanannyi | ✅ minden lapon |
| Beírt adat (Kassza D7–L9) | — | helyes | ✅ |
| B/C/M/N képlet-cellák a beírt sorokban | képlet | képlet | ✅ érintetlen |
| Mintaképlet byte-azonosság (`=DATE(Hibak!$A$1,1,1)`) | — | — | ✅ azonos |

**Két fontos megállapítás:**
1. **A `Kassza` lapon a felhasználói beviteli tartomány valójában D–L** (nem D–M): a B, C, **M (Magyarázat), N (szám)** oszlopokban **minden sorban előre kitöltött képletek** vannak (10 000+ sorig). Tehát az integráció **D–L** oszlopokba ír, és M/N-hez SOHA nem nyúl. *(A 4. szakasz oszlop-megfelelését erre korrigálni kell az implementációnál.)*
2. **Az `Adatok_2026.xlsx`-nek nincs külső linkje** (a Kimutatások hivatkozik az Adatokra, nem fordítva) → az Adatok írása a külső-link-törés kockázatát **teljesen kizárja**.

**A `fullCalcOnLoad` (recalc megnyitáskor):** az umya nem írja ki (a writer-kódja ki van kommentezve), így a cache-elt képletértékek elavulnak. **Megoldva:** az `xl/workbook.xml`-be utólag beinjektálva a `<calcPr ... fullCalcOnLoad="1"/>` attribútumot (a zip újracsomagolásával) — bizonyítottan érvényes, megnyitható munkafüzet, és az Excel megnyitáskor magától újraszámol (nincs kézi F9). A fájlméret-csökkenés (1,43 → 1,16 MB) **kizárólag** a cache-elt képletértékek elhagyásából ered, nem képletvesztésből.

**Döntés:**
- **Könyvtár: umya-spreadsheet** (pure Rust, Tauri-kompatibilis, nincs Python-sidecar → kisebb telepítő). ✅ 5. nyitott kérdés eldőlt.
- **Írási stratégia:** append-only a `Kassza` D–L-be, backup minden írás előtt, atomikus mentés, majd `fullCalcOnLoad` patch.

**Emberi záró-ellenőrzés (hátravan):** a `C:\Users\endre\kartoteka-excel-poc\test_output_calc.xlsx` megnyitása **valódi Excelben**, és szemrevételezés: a 3 teszt-sor megjelenik a `Kassza`-ban, és a Számadás / A–T lapok / (külön megnyitva) a Kimutatások helyesen újraszámolnak. Ez a GO végső, gépileg nem pótolható megerősítése — éles pénzügyi kód csak ezután készül.

**Következő lépések:** 3.1 kód-szótár 1:1 egyeztetés (tisztán elemző) → 3.2 Tauri-alapok (umya bekötése a desktop crate-be, `excel_append_kassza`/`excel_read_kassza`/`excel_backup` Rust commandok + fs-capability + Excel-fájl regisztrálás a Beállításokban).
