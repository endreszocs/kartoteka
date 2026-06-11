# KARTOTÉKA — Pénzügyi szekció teljes átvilágítása (2026-06-11)

> Teljes-spektrumú audit a web + desktop pénzügyről: mi van kész, mi készült el
> MOST (ebben a sessionben), hol kell javítás, fejlesztés vagy új funkció.
> Módszer: 2 párhuzamos feltáró ágens (web finance + desktop/Tauri) + kézi
> mély-olvasás a kritikus útvonalakon + a hivatalos EREK Excel gépi elemzése.

---

## 1. Mi a pénzügyi szekció ma (térkép)

### 1.1 Web (apps/web) — érett, széles funkcionalitás
- **12 fül a `/penzugy` oldalon:** Áttekintés, Kassza, Bank, Tranzakciók,
  Költségvetés, Számadás, Tartozás, Bérleti, Monetár, OBLIO-ellenőrzés, Súgó,
  (admin) Import.
- **~25 server-action modul** (`app/(dashboard)/penzugy/`): befizetés/kiadás CRUD,
  sztornó + visszavonás, bank-import (BCR), nyitóegyenlegek, belső mozgás,
  decont, dispozíció, chitanță + tömbök, Oblio/e-Factura (kiállítás, párosítás,
  ANAF-ellenőrzés), TVA-plafon, tartozás-számítás, import-varázslók,
  év-véglegesítés.
- **Lib-réteg** (`lib/finance/`): bank-egyenleg több devizával, BNR-árfolyam,
  járulék-kedvezmény motor, bérleti kalkuláció, költségvetés-riportok, belső-
  mozgás health-check, Oblio kliens + PDF/XML/UBL parserek.
- **Scope-aware** architektúra (gyülekezet vs. egyházmegye, 2026-04-18 óta).

### 1.2 Desktop (apps/desktop, Tauri 2) — gyors felzárkózásban
- **A-hullám (read-only) KÉSZ:** Áttekintés/Kassza/Tranzakciók/Számadás/Tartozás
  a KÖZÖS `@kartoteka/ui-app` komponensekből (pixel-azonos a webbel).
- **C-hullám (írási út) KÉSZ:** rögzítés (`DesktopCombinedEntryDialog`),
  sztornó + visszavonás, szerkesztés, chitanță-kiállítás — online + offline
  (iratszám-tárca + outbox + push-sync + konfliktus-feloldás).
- **Excel-integráció E0–E1.5b KÉSZ:** hivatalos EREK-sablon becsomagolva,
  mappa-előkészítés, cella-író (egyházmegye auto-konfig), logó-cache,
  lap-metaadat olvasó (deviza, következő üres sor).
- **E3 write-through — EBBEN A SESSIONBEN ELKÉSZÜLT** (lásd 2. pont).

### 1.3 A hivatalos EREK Excel (Adatok_2026.xlsx) — megfejtve
- 26 lap: `Kassza` (készpénz-napló) + `A`–`T` bank-lapok (azonos D–L séma),
  adat a 7. sortól; az I/K oszlop a kategória SZÖVEGES NEVÉT várja (SUMIF név
  szerint aggregál).
- 927 tételes statikus kategória-katalógus (`Hibak!fif/fi`) → kinyerve a
  `migration-docs/excel-2026-katalogus.json`-ba; a `szamadasicel.nev` a
  2026-06-11-i név-fix óta byte-azonos a hivatalos nevekkel (100% lefedettség).
- **Figyelem:** a sablon belső-mozgás kód-kiosztása nem mindenhol következetes
  (pl. `418.01` = „… - S", az R kimaradt; `420.01` = „… - U"). Emiatt az E3
  bank-oldali név-feloldása NÉV szerint történik, kód-képlet helyett — ha nincs
  pontos név, a tétel látható „blokkolt" státuszt kap (sosem tippelünk).

---

## 2. Ebben a sessionben elkészült (2026-06-11)

### 2.1 E3 — DB→Excel write-through (a handoff §6 terv szerint, mind a 3
ajánlott döntéssel: storno = ellenelőjeles tükör-sor · bank-mapping =
localStorage + kötelező megerősítés · stabil identity-kulcs)

| Réteg | Fájl | Mit csinál |
|---|---|---|
| SQLite v30 | `apps/desktop/src-tauri/src/db.rs` | `excel_outbox` (várólista, UNIQUE(identity_key, side)) + `excel_row_map` (idempotencia-térkép, PK(identity_key, side)) |
| Core (pure) | `packages/core/src/finance/excel/row-builder.ts` | D–L sor-építő: bevétel/kiadás/sztornó-tükör/belső-mozgás-pár; cent-kerekítés (= Excel ROUND(…,2)); irattíp-szótár (Készpénz→`Chit.`, Banki→`Extr`) |
| Core (generált) | `packages/core/src/finance/excel/belso-mozgas-nevek.ts` | 80 hivatalos belső-mozgás név a katalógusból (byte-pontos) |
| Beállítások | `apps/desktop/src/lib/excel-settings.ts` | LS-kulcsok + bank→betű-lap térkép (megerősítés-köteles) |
| Enqueue | `apps/desktop/src/lib/excel-enqueue.ts` | minden írási szándék közös belépési pontja (no-throw, INSERT OR IGNORE dedup) |
| Worker | `apps/desktop/src/lib/excel-write-sync.ts` | egyetlen fogyasztó; szigorúan egyesével ír; row-map dedup minden írás előtt; „Excel nyitva"/párosítás-hiány/név-hiány = látható VÁRAKOZÓ állapot, sosem csendes |
| Triggerek | combined-entry-dialog, befizetes/kiadas-page, befizetes/kiadas-write-sync (offline push-sync sikerága), storno-confirm-dialog, penzugy-page (undo), transaction-edit-dialog (régi-reverzál + új-append), belsomozgas-page (2 sor) | online mentés sikerkor azonnal; offline tétel CSAK a push-sync után (végleges iratszám + szerver-id birtokában) |
| UI | `settings/konyveles-panel.tsx` | bank-párosítás deviza-javaslattal + kötelező megerősítés; ÉLŐ státusz (várakozó/beírva/blokkolt + „Szinkron most" + blokkolt-újrapróbálás) |

**Pénzügyi védelmek:** append-only; minden írás előtt automatikus backup +
atomikus mentés (E0 óta); dupla-írás kizárva (row-map + UNIQUE); offline tétel
sosem kerül be újraosztható iratszámmal; bank-lapra megerősítés nélkül soha;
fel-nem-oldható tétel látható okkal várakozik/blokkolódik.

**Kapcsoló default KI** — élesítés előtt az E2 spot-check SQL (kód-egyezés a
teszt-gyülekezetre) + egy MÁSOLATON végzett end-to-end teszt ajánlott
(aláírt 0.9.0 build): (1) készpénz-bevétel jó I-névvel; (2) ismételt futás nem
duplikál; (3) sztornó = ellenelőjeles sor; (4) belső mozgás = pontosan 2 sor;
(5) nyitott fájlnál „Excel nyitva" üzenet + a sor megmarad.

### 2.2 Egyéb javítások
- **Mentett kód (PIN) beragadás JAVÍTVA** — `auth-gate.tsx`: a `getSession()`
  lejárt tokennél hálózati refresh-be futott timeout nélkül → végtelen
  „Betöltés…". Mostantól: offline-mód azonnali rövidzár (nem várja a session-t)
  + 5 mp-es timeout + kései session utólagos felvétele.
- **Splash/PWA feliratok:** „Református …nyilvántartási rendszere" →
  „Egyházi nyilvántartó rendszer…" (`apps/web/public/manifest.json` +
  `apps/web/app/layout.tsx` meta description). A web- és desktop-splash
  feliratok már korábban is helyesek voltak.
- **Desktop mindig maximalizálva indul** (`tauri.conf.json`).
- **Desktop splash = web animált splash** — a 935 soros, 5-fázisú web-splash
  pixelpontos portja (`apps/desktop/src/components/splash-screen.tsx` + a
  Hatter/KEREK/KARTOTEKA_V3 assetek átmásolva; a fontok és a splash-CSS a közös
  `kartoteka.css`-ből jönnek mindkét kliensen).
- **Desktop verzió: 0.8.8 → 0.9.0** (tauri.conf.json + Cargo.toml).

---

## 3. JAVÍTANDÓ — prioritizált hibalista

### P0 (pénz-helyesség / fő-folyamat)
1. ~~PIN-belépés beragadás~~ → **javítva + a user által élesben igazolva** (2.2).
   A teljes gyökérok-lánc: (a) auth-gate getSession() timeout nélkül; (b) a
   DesktopShell + 14 oldal `supabase.auth.getUser()`-re épült, ami offline null
   → végtelen „Betöltés…". Megoldás: központi `getDesktopUser()`
   (lib/desktop-user.ts) — felhő (4s timeout) → utolsó-belépés cache →
   egyetlen lokális `profiles_local` sor; látható hibaüzenet kiúttal a néma
   töltés helyett. Élő képernyő-diagnózissal azonosítva, 0.9.0-ban kiadva.
2. **E3 end-to-end teszt hiányzik** — a kód kész és minden build zöld, de a
   teljes lánc (rögzítés → outbox → valódi xlsx-be írás → Excel-újraszámolás)
   csak aláírt desktop-buildben tesztelhető. A kapcsoló addig default KI.
   *Teendő: 0.9.0 build → teszt egy MÁSOLATON a 2.1 checklista szerint.*

### P1 (adatminőség / hiányzó bekötés)
3. **Desktop bank-import nem köt bankszámlát a tételhez** — a web
   `bank-import-actions` kezeli a bankszámlát, a desktop `bank-import-page`
   `saveIncome/ExpenseUseCase`-hívása viszont NEM ad át `bankszamla_id`-t →
   a banki tételek számla-hozzárendelés nélkül kerülnek a DB-be, és az E3 sem
   tudja betű-lapra írni őket (ezért oda most szándékosan nincs Excel-bekötés).
   *Teendő: bankszámla-választó a desktop bank-importba + `bankszamla_id`
   átadása; utána az import-tételek Excel-enqueue-ja.*
4. **Desktop belső mozgás forrás/cél szabad szöveg** — elgépelhető
   („BCR bank" vs „BCR"), ami a tételt a bank-párosítás név-egyezésén kívülre
   ejti (látható várakozó státusz, de elkerülhető lenne). *Teendő: dropdown a
   gyülekezet aktív bankszámláiból (a webben is név-alapú, de listából).* 
5. **Decont/Dispozitie séma-drift** — a kód (web) használja a
   `decont_id`/`dispozitie_id` oszlopokat és a `penzugyi_bizonylat_sorszam`
   szekvenciát, de a `migration-docs/Database_schema.sql` konszolidált dump
   NEM tartalmazza a táblákat. *Teendő: friss schema-dump generálása, hogy a
   dokumentáció a valós DB-t tükrözze.*

### P2 (karbantarthatóság)
6. **Web dialógus-verziók burjánzása** — `income-dialog` v1/v2/v3,
   `expense-dialog` v1/v2 él egymás mellett. *Teendő: a nem használt verziók
   azonosítása + törlése (route-/import-gráf alapján).* 
7. **`transactions` generikus tábla** — a sémában létezik, célja nem világos
   (kísérleti?). *Teendő: döntés — használatba vétel vagy elvetés + dokumentálás.*
8. **Oblio token-rotáció** — `utolso_token` + expiry cache-elve, de nincs
   explicit frissítési stratégia hibaágra. *Teendő: 401-nél token-újrakérés +
   retry egyszer, naplózással.*

---

## 4. FEJLESZTENDŐ — a meglévőre építő következő lépések

1. **E4 — Excel keresztellenőrzés:** a `Hibak` lap hibaszámlálójának kiolvasása
   minden write-batch után (recalc után 0 kell legyen) + havi spot-check riport
   (DB-összeg vs. Excel-összeg kategóriánként). Ez zárja a kört, hogy a két
   könyvelés BIZONYÍTOTTAN egyezik.
2. **bank↔bank átvezetés + valutacsere Excel-írása** — most látható „blokkolt"
   státuszt kap (kézi átvezetést kér). A sablon „Átutalva …" név-mintái
   lap-függőek; következő lépés a két-betű-lapos pár implementálása.
3. **Offline iratszám-tárca + Excel**: az offline-rögzített tétel most a
   push-sync UTÁN kerül Excelbe (helyes sorrend), de a Kassza-lap így időben
   később frissül — érdemes a Súgóban ezt lelkész-nyelven is jelezni (megvan:
   „Asztali (offline) verzió" szekció bővítése 1 bekezdéssel).
4. **Desktop B-hullám lezárása** — a Bank/Költségvetés/Monetár fülek beemelése
   az egységes `/penzugy` tab-sorba (most a bal almenüben élnek).
5. **Decont + Dispozitie desktop-paritás** — a web-oldali bizonylatok (OP,
   Disp. Plata, Decont.) desktopon is, az Excel F-oszlop irattípusaival
   összekötve (a szótár már kész: `irattipToExcel`).
6. **PIN-kód csere a Beállításokból (A-M15 TODO)** — most csak
   „Elfelejtettem a kódot" + újra-login úton lehet; legyen Beállítások →
   Biztonság → „Kód módosítása" (online session mellett).

---

## 5. ÚJ FUNKCIÓ javaslatok (üzleti érték szerint)

1. ~~Számadás-export a Kimutatasok_2026.xlsx-be~~ — **ELVETVE (Endre, 2026-06-11):
   a Kimutatások-fájlba írni TILOS.** A Kimutatasok_2026.xlsx a hivatalos
   módszertan szerint az Adatok_2026.xlsx-ből AUTOMATIKUSAN veszi át és
   rendszerezi az adatokat — minden tételt kizárólag az Adatok-fájlban kell
   rögzíteni, a megfelelő módon és formában. (Verifikálva: a kódban semmi nem
   ír a Kimutatások-fájlba — a Rust `find_adatok_file` csak `Adatok_*.xlsx`-et
   fogad el írási célnak.)
2. **Pénzügyi év-váltó varázsló** — január 1-jén: új Könyvelés-mappa
   előkészítése + nyitóegyenlegek átvezetése (bank + kassza) + iratszám-tárca
   újratöltési emlékeztető, egy lépésben.
3. **Kassza-zárás napi rutin** — nap végi egyeztető nézet (kassza-egyenleg vs.
   számolt készpénz, monetár-bontással), nyomtatható zárólappal — a lelkészek
   napi munkáját közvetlenül támogatja.
4. **Egyházmegyei konszolidált riport** — a diocese-scope már létezik; a
   gyülekezeti számadások egyházmegyei összesítője (beküldés-státusszal).

---

## 6. Verifikáció (ebben a sessionben)

- `cargo check` (PowerShell, Strawberry Perl, target `C:\kartoteka-target`): ✅ 2.1s
- Desktop build (`lint:imports` + `tsc` + `vite build`): ✅ (fontok bundle-ben)
- Web `tsc --noEmit`: ✅
- A `belso-mozgas-nevek.ts` generátor a katalógus-JSON-ból determinisztikus;
  a 80 név kézzel ellenőrizve a hivatalos `Adatok_2026.xlsx` `Hibak` lapja ellen.
