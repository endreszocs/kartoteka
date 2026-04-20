# KARTOTEKA — Új szerepkörök (könyvelő + számvevő) és lokális PDF-szinkronizáció

**Dátum**: 2026-04-16
**Állapot**: tervezés, új munkacsomag WC-7 (szerepkörök) és WC-8 (lokális PDF sync)
**Érinti**: `KARTOTEKA-penzugy-feladatlista-2026-04-16.md`, `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`, `KARTOTEKA-tva-figyelo-terv-2026-04-16.md`

---

## A) Lokális PDF szinkronizáció — felhasználói döntés 2026-04-16

### Felhasználói válasz
> „A lelkész saját számítógépén legyen automatikusan mentve és legyen hivatkozva a megadott számlára. Így nem lesz tárolva felhőben csak lokálisan. A lokális szinkronizációval az is szinkronizálódik. Fontos, hogy a lelkésznek legyen kiválasztott hely ahová szinkronizálja az adatbázis adatait! (Ellenőrizd a már meglévő beépített modulokat!)"

### A meglévő rendszer ellenőrizve ✅

A KARTOTEKA-ban **már működik** a lokális fájlrendszer-kezelés:

**Fájl**: `lib/offline/fs-handle-store.ts`

Elérhető API:
- `isFileSystemAccessSupported()` — Chrome/Edge ellenőrzés (Firefox/Safari nem támogatja)
- `pickRootDirectory()` — megnyitja a natív mappa-választót (`showDirectoryPicker`)
- `getStoredRootHandle()` — perzisztált handle visszaadás (Dexie-ben tárolva)
- `forgetRootDirectory()` — handle törlése
- `ensurePermission(handle)` — readwrite permission újra-kérés (minden reload-kor)
- `getOrCreateModuleSubdir(rootHandle, slug)` — `KARTOTEKA/<slug>/` almappa létrehozása
- `writeFile(dir, fileName, blob)` — **atomic swap**-pal (tmp → rename) ír
- `readFile(dir, fileName)` — Blob visszaadás

**Ez tökéletesen lefedi** az Oblio PDF-mentés követelményét, nincs új fejlesztés az alapon.

### Megvalósítási terv

**1. Gyökérmappa beállítása**
- A lelkész a gyülekezeti beállítások → „Szinkronizáció és tárolás" menüben kiválaszt egy gyökérmappát
- Ha **már beállított** egy gyökérmappát más modul miatt (pl. Excel import, full backup), **azt használjuk** — nem kérdezünk újra
- A `fs-handle-store.ts` mellett **már létezik** `monthly-sync.ts` (standalone build), és `full-backup.ts` (offline) — mindkettő ugyanazt a gyökér-handle-t használja

**2. Oblio PDF almappa**
- A kiállított számlák PDF-je ide kerül: `KARTOTEKA/oblio-szamlak/<ev>/<sorozat>-<sorszam>.pdf`
- Pl.: `KARTOTEKA/oblio-szamlak/2026/KA-00123.pdf`
- `getOrCreateModuleSubdir(rootHandle, 'oblio-szamlak')` használatával
- Ha a PDF még **nincs lokálisan**, a rendszer letölti az Oblio URL-ről és az `writeFile`-lal lementi

**3. DB-ben csak a helyi útvonal referenciája**
- Az `oblio_szamlak` tábla a következő mezőket használja:
  - `pdf_url` — Oblio publikus URL (backup, ha a lokális elvész)
  - **ÚJ**: `pdf_local_path text` — a lokális file relatív útvonala (pl. `oblio-szamlak/2026/KA-00123.pdf`)
- Nem tároljuk az abszolút elérési utat (a handle-alapú File System Access-szel nem kell)

**4. UI: „PDF" gomb a számla-historián**
- Első klikk: ha a PDF lokálisan megvan → megnyitás
- Ha nincs → letöltés Oblio URL-ről → lokális mentés → megnyitás
- Ha nincs gyökérmappa beállítva → tooltip: „Kérlek, állíts be egy szinkronizációs mappát a Beállítások menüben"
- Firefox/Safari esetén: **fallback** — közvetlen megnyitás az Oblio URL-ről (nincs lokális mentés)

**5. Szinkronizáció**
- A meglévő havi sync/backup workflow-hoz csatlakoztatjuk: minden hónap végén a rendszer **ellenőrzi**, hogy az Oblio-ban kiállított számlák PDF-jei mind lokálisan is megvannak-e
- Ami hiányzik, letölti
- Így még ha a lelkész nem klikkelt is „PDF" gombra, a háttér szinkronizál

**6. Adatbázis adatainak lokális szinkronja** (a felhasználó kérése szerint „az adatbázis adatait")
- A rendszer **már tudja** ezt a `lib/offline/full-backup.ts`-en keresztül
- A gyökérmappa alá a `full-backup` létrehoz egy mentést
- Az Oblio PDF tárolás **ebbe illeszkedik**, nem külön csatorna

### DB migráció

```sql
ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS pdf_local_path text;

COMMENT ON COLUMN public.oblio_szamlak.pdf_local_path IS
  'Relatív útvonal a lelkész lokális szinkronizációs mappájához képest. Pl. oblio-szamlak/2026/KA-00123.pdf. Ha üres, a PDF még nincs lokálisan letöltve.';
```

### Új munkacsomag: WC-8 — Lokális Oblio PDF sync

```
WC-8 Lokális PDF szinkronizáció
├── 8.1 DB migráció (pdf_local_path oszlop)
├── 8.2 Lokális mappa kezelő library
│      Új fájl: lib/finance/oblio/oblio-local-storage.ts
│      - ensureOblioSubdir() — almappa létrehozás
│      - downloadAndStoreInvoicePdf(oblioSzamlaId) — URL → blob → writeFile
│      - openLocalInvoicePdf(oblioSzamlaId) — readFile → blob URL → új ablak
│      - syncMissingLocalPdfs() — background task, hiányzó PDF-ek
├── 8.3 UI: PDF gomb a számla-historián (bővítés)
├── 8.4 Fallback nem Chrome-os böngészőkhöz (közvetlen Oblio URL)
├── 8.5 Integráció a havi sync workflow-ba
└── 8.6 Tesztelés: mindkét böngésző típusra (Chrome/Edge + Firefox/Safari fallback)
```

---

## B) Új szerepkörök: `konyvelo` + `egyhazmegyei_szamvevo`

### Felhasználói válasz
> „Legyen két szerepkör erre a feladatra: könyvelő és egyházmegyei számvevő"

### Jelenlegi szerepkör-modell

**Fájl**: `lib/types/auth.ts`
```typescript
export type Role = 'lelkesz' | 'esperes' | 'egyhazmegyei_admin' | 'admin'
```

**Fájl**: `lib/auth/roles.ts`
- `isMasterAdmin(email)` — env `MASTER_ADMIN_EMAIL` alapján
- `isAdminRole(role, email)` — admin vagy master admin
- `isEsperesRole(role, email)` — esperes, egyházmegyei_admin, admin

### Új szerepkörök meghatározása

**Felhasználói végleges döntés 2026-04-16**: **3 új szerepkör**, a teljes lista 7 elemű:

```typescript
type Role =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'    // ÚJ
  | 'admin'                   // most tisztán rendszergazdai
  | 'konyvelo'                // ÚJ
  | 'egyhazmegyei_szamvevo'   // ÚJ
```

#### `egyhazkeruleti_admin` (ÚJ, harmadik)
- **Hatókör**: egy teljes egyházkerület (`districts.id` szerint, `profiles.district_id`)
- **Jog olvasni**: minden gyülekezet az egyházkerület alatt, minden egyházmegye és annak gyülekezetei
- **Jog írni**:
  - Aktiválhat `konyvelo` szerepkört és gyülekezetekhez rendelheti őt (feltétel: a gyülekezet a saját kerülete alatt van)
  - Rendelhet `egyhazmegyei_szamvevo`-t (a saját kerülete alatti egyházmegyékhez)
  - `/dashboard-kerulet` oldalt látja, de **csak a saját kerületéhez**
- **NEM**:
  - Más kerületek adatait
  - Rendszerszintű beállításokat (az továbbra is csak `admin`)
  - Direkt tagi/anyakönyvi adatmódosítás (az a gyülekezeti lelkészi feladat)

#### `konyvelo`
- **Hatókör**: egy gyülekezet (pontosan az, amelyikhez rendelve van)
- **Jog olvasni**:
  - Teljes pénzügyi modul (kassza, bank, költségvetés, számadás, tranzakciók, tartozások, bérleti, decont, monetár)
  - `szamadasicel` katalógus (`tva_plafonba_szamit` flag)
  - `oblio_szamlak`, `oblio_fiokok` (de az `api_secret` semmiképp)
  - `leltar_tetelek` (az amortizáció könyvelői szempontból releváns)
- **Jog írni**:
  - `szamadasicel.tva_plafonba_szamit` (ő a szakmai review)
  - Megjegyzések, audit megjegyzések (új `audit_notes` tábla? későbbre)
- **NEM**:
  - Tagi adatok (`szemely`, `csalad`) — GDPR miatt
  - Anyakönyv (`keresztseg`, `hazassag`, `temetes`) — nem szakterülete
  - Új bérleti szerződés rögzítése — az a lelkész
  - Bevétel/kiadás törlése vagy módosítása — csak olvashatja

#### `egyhazmegyei_szamvevo`
- **Hatókör**: egy teljes egyházmegye (`diocese_id` szerint) — minden gyülekezete
- **Jog olvasni**:
  - Minden gyülekezet teljes pénzügyi adatai az egyházmegyében
  - Éves jelentések (`annual_reports`)
  - TVA, Oblio számlák, amortizáció
- **Jog írni**:
  - Auditori megjegyzések, éves jelentés véglegesítés (review after esperes)
- **NEM**:
  - Lelkészi adatok, tagi adatok az adott egyházmegyén kívül
  - Pénzügyi tételek módosítása vagy törlése (csak olvas)

### DB migráció

```sql
-- 1. Role enum bővítés
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role = ANY (ARRAY['lelkesz','esperes','egyhazmegyei_admin','admin','konyvelo','egyhazmegyei_szamvevo'])
  );

COMMENT ON COLUMN public.profiles.role IS
  'Szerepkör: lelkesz (gyülekezeti lelkipásztor), esperes, egyhazmegyei_admin, admin (rendszer), konyvelo (szakmai pénzügyi review, gyülekezeti szint), egyhazmegyei_szamvevo (egyházmegyei auditori szerep).';
```

### Kódszintű változtatások

**Fájl**: `lib/types/auth.ts` — Role type bővítés
```typescript
export type Role =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'admin'
  | 'konyvelo'         // ÚJ
  | 'egyhazmegyei_szamvevo'  // ÚJ
```

**Fájl**: `lib/auth/roles.ts` — új helperek
```typescript
export function isKonyveloRole(role: Role): boolean {
  return role === 'konyvelo'
}

export function isSzamvevoRole(role: Role): boolean {
  return role === 'egyhazmegyei_szamvevo'
}

export function canReviewFinancial(role: Role, email?: string | null): boolean {
  return role === 'konyvelo'
    || role === 'egyhazmegyei_szamvevo'
    || isEsperesRole(role, email)
}

export function canEditTvaFlags(role: Role, email?: string | null): boolean {
  return role === 'konyvelo' || isAdminRole(role, email)
}
```

### RLS policy-k

Az alábbi táblákhoz szükséges RLS policy bővítés a 2 új szerepkörre:

| Tábla | `konyvelo` policy | `egyhazmegyei_szamvevo` policy |
|---|---|---|
| `befizetes`, `kiadas` | SELECT, WHERE `congregation_id = profiles.congregation_id` | SELECT, WHERE `congregation.diocese_id = profiles.diocese_id` |
| `berleti_szerzodes` | SELECT | SELECT |
| `oblio_szamlak` | SELECT | SELECT |
| `oblio_fiokok` | SELECT (de NEM `api_secret_encrypted`) | SELECT (ua.) |
| `szamadasicel` | SELECT + UPDATE csak `tva_plafonba_szamit` és `tva_mentesseg_hivatkozas` oszlopokra | SELECT |
| `leltar_tetelek` | SELECT | SELECT |
| `annual_reports` | SELECT | SELECT + UPDATE `review_notes`, `reviewed_at`, `reviewed_by` |
| `szemely`, `csalad` | **NEM** olvas | **NEM** olvas |

### UI változtatások

- Navigáció: a `konyvelo` csak a Pénzügy + Leltár menüket látja, más nem
- `egyhazmegyei_szamvevo`: egyházmegyei dashboard + minden gyülekezet pénzügye olvasható nézetben
- Profile: új szerepkör-badge, eltérő színnel (pl. szürke a számvevőnek)

### Felhasználó-regisztráció és szerepkör-hozzárendelés

Jelenleg az `admin` tudja szerepkört beállítani (`/admin` oldalakon). Az új szerepkörök ehhez illeszkednek:
- `admin` állíthat `konyvelo` vagy `egyhazmegyei_szamvevo` szerepkört
- A hozzárendelésnél meg kell adni a gyülekezetet (vagy egyházmegyét) is
- **KÖNYVELŐI meghívás**: a lelkész küldhessen meghívót a könyvelőjének email-ben (a rendszeren keresztül), az admin jóváhagyásával? Vagy csak az admin csinálja?

### Új munkacsomag: WC-7 — Új szerepkörök

```
WC-7 Új szerepkörök: konyvelo + egyhazmegyei_szamvevo
├── 7.1 DB migráció (role CHECK constraint bővítés)
├── 7.2 TypeScript Role type bővítés (lib/types/auth.ts)
├── 7.3 roles.ts helperek (isKonyveloRole, canEditTvaFlags stb.)
├── 7.4 RLS policy audit és bővítés (12+ tábla)
├── 7.5 UI navigáció - szűrt menük szerepkörönként
├── 7.6 Admin felület: szerepkör-hozzárendelés új opciók
├── 7.7 Lelkészi könyvelő-meghívó (opcionális, későbbre)
├── 7.8 Tesztelés: 2 új szerepkörrel külön user, átfogó jogosultsági teszt
└── 7.9 Dokumentáció + használati útmutató szekció
```

---

## Integráció a WC sorrendbe

### Új sorrend-javaslat

```
WC-0  Előkészítés (kész)
WC-7  Új szerepkörök (előbb, mert a WC-1 TVA-figyelő ezt használja review-hoz)
WC-1  TVA figyelő
WC-2  Oblio / e-Factura
WC-8  Lokális PDF sync (WC-2 után, mert a WC-2 a PDF URL-t rögzíti)
WC-3  Amortizáció
WC-5  Egyházmegyei dashboard
WC-4  Használati útmutató
WC-6  Dokumentáció, zárás
```

### Logika
- **WC-7 előbb, mint WC-1**: mert a TVA flag-et a **könyvelő** állítja be, és a szerepkör nélkül nem értelmezhető
- **WC-8 a WC-2 után**: a WC-2 hozza létre az `oblio_szamlak` tábla `pdf_url` mezőjét, a WC-8 pedig a `pdf_local_path` bővítést és a szinkronizáció logikáját

---

## Új nyitott kérdések (max 3, zárókérdések)

1. **Könyvelői meghívó** — a lelkész tudjon-e könyvelőt meghívni a rendszerbe (email + regisztrációs link), vagy csak az admin rendelhet hozzá könyvelő szerepkört? **Javaslat**: **csak admin** az első körben (egyszerűbb, kontrollált).
2. **Számvevő hozzárendelés** — egyházmegyei számvevő ki rendeli hozzá? Az `egyhazmegyei_admin` a saját egyházmegyéjéhez, vagy csak `admin`? **Javaslat**: **`egyhazmegyei_admin` is** (mert az egyházmegye szervezte fel a számvevőt).
3. **`konyvelo` egy vagy több gyülekezethez**? Egy könyvelő szolgálhat több gyülekezetet. Jelenleg a `profiles.congregation_id` egyetlen érték. **Javaslat**: **most csak 1 gyülekezet** támogatott, később bővíthető `many-to-many`-re (új tábla). A könyvelő szükség esetén több accountot hoz létre — nem a legelegánsabb, de gyors.

---

## Kockázatok

1. **RLS policy-audit nagy munka** — 12+ tábla, minden szerepkörre külön. Könnyen elnézhető, hogy egy tábla nem kapott update-et. **Mitigáció**: automata teszt script, ami minden szerepkörrel végigpróbál minden táblán egy SELECT-et és egy UPDATE-et, és szövegesen leírja, mit engedett / tiltott.
2. **A 2 új szerepkör zavarhat** a meglévő `lelkesz` / `esperes` logikán — minden UI feltételt (`role === 'lelkesz'`) át kell vizsgálni, mert **nem-lelkesz** eset új lehet. **Mitigáció**: `canReadFinancial(role)`, `canEditFinancial(role)` típusú helperek bevezetése mindenhová.
3. **Lokális PDF Firefox/Safari nem támogatja** — a felhasználói oldal tisztán Chrome/Edge? **Mitigáció**: fallback = közvetlen Oblio URL; a UI jelzi, hogy „Firefox-on a helyi mentés nem működik, a PDF mindig az Oblio szerveréről nyílik meg".
4. **Meglévő sync modulok kompatibilitás** — `monthly-sync.ts` és `full-backup.ts` **ugyanazt** a gyökér-handle-t használja? **Ellenőrzendő** a WC-8 elején. Ha nem, egyesíteni kell.
