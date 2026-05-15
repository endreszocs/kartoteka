# 🚀 KARTOTEKA Standalone — Production Deployment Útmutató

**Dokumentum dátuma**: 2026-04-15
**Cél**: Lépésről lépésre végigvezetni a Fázis 7 (standalone Windows offline csomag) production-be telepítésén.
**Célközönség**: Rendszergazda / DevOps

---

## 📋 Tartalom

1. [Előfeltételek](#1-előfeltételek)
2. [Supabase setup](#2-supabase-setup)
3. [RSA kulcspár generálás + tárolás](#3-rsa-kulcspár-generálás)
4. [Edge Function deployment](#4-edge-function-deployment)
5. [Build environment beállítás](#5-build-environment)
6. [ZIP csomag generálás](#6-zip-csomag-generálás)
7. [Lelkészi telepítés](#7-lelkészi-telepítés)
8. [Tesztelés + verifikáció](#8-tesztelés)
9. [Hibaelhárítás](#9-hibaelhárítás)
10. [Rollback procedúra](#10-rollback)

---

## 1. Előfeltételek

### Szoftverek a build-gépen

- ✅ **Node.js 20.18 LTS** (a portable verzió is ezt használja)
- ✅ **PowerShell 5.1+** (Windows beépített)
- ✅ **OpenSSL** (RSA kulcsgeneráláshoz, Git Bash-ban van)
- ✅ **Supabase CLI** (Edge Function deploy-hoz)
  - Telepítés: `npm install -g supabase`
  - Vagy: `scoop install supabase`

### Hozzáférések

- ✅ **Supabase project** admin hozzáférés
  - URL: `https://bjytiawckbibqmtlezfl.supabase.co`
  - Service role kulcs (a Supabase dashboard-ban: Project Settings → API)
- ✅ **Build gép Windows** (PowerShell, Internet)
- ✅ **GitHub repo** push hozzáférés

---

## 2. Supabase setup

### 2.1 SQL migrációk futtatása

A Supabase SQL Editor-ban (Project URL → SQL Editor → New query) **sorrendben** futtasd:

```sql
-- 1. Korábbi PWA infrastruktúra (ha még nem fut)
-- File: migration-docs/sql/2026-04-15-sync-tracking.sql
-- (a 30+ tábla `revision` + `updated_at` + trigger)

-- 2. Recycle bin (Kuka)
-- File: migration-docs/sql/2026-04-15-recycle-bin-cleanup.sql

-- 3. MM bookmark (defenzív, csendben kihagyja magát ha mm_otletek nincs)
-- File: migration-docs/sql/2026-04-15-mm-bookmarks.sql

-- 4. Sirhely FK relax
-- File: migration-docs/sql/2026-04-15-sirhely-fk-relax.sql

-- 5. STANDALONE LICENSES (Fázis 7c)
-- File: migration-docs/sql/2026-04-15-standalone-licenses.sql
```

### 2.2 Verifikáció

```sql
-- Tábla létezése
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'standalone_licenses'
);

-- RPC-k léteznek
SELECT proname FROM pg_proc
WHERE proname IN ('issue_license', 'list_my_licenses', 'revoke_license');

-- Próbahívás (egy bejelentkezett user-rel a frontend-en)
-- SELECT * FROM public.list_my_licenses();
```

---

## 3. RSA kulcspár generálás

### 3.1 Generálás OpenSSL-lel

PowerShell vagy Git Bash-ban:

```bash
# Privát kulcs (PKCS8 PEM, RSA 2048-bit)
openssl genpkey -algorithm RSA -out license-private.pem -pkeyopt rsa_keygen_bits:2048

# Publikus kulcs kinyerés
openssl rsa -in license-private.pem -pubout -out license-public.pem

# Ellenőrzés
cat license-private.pem | head -3
# -----BEGIN PRIVATE KEY-----

cat license-public.pem | head -3
# -----BEGIN PUBLIC KEY-----
```

> 🔐 **Biztonság**: a `license-private.pem` SOHA ne kerüljön Git-be, USB-stickre, vagy email-be! Csak a Supabase secret-be töltsd be.

### 3.2 Privát kulcs Supabase secret-be

```bash
# Supabase CLI authenticate
supabase login

# Project link
supabase link --project-ref bjytiawckbibqmtlezfl

# Secret feltöltés (egy sorba a teljes PEM tartalom)
supabase secrets set LICENSE_PRIVATE_KEY_PEM="$(cat license-private.pem)"

# Ellenőrzés
supabase secrets list
# Listában: LICENSE_PRIVATE_KEY_PEM
```

### 3.3 Publikus kulcs előkészítés a build-hez

A `license-public.pem` tartalmát a build env változóba kell betenni:

```powershell
# Windows PowerShell:
$env:LICENSE_PUBLIC_KEY_PEM = Get-Content -Raw license-public.pem
```

vagy `.env.local` fájlba (NEM `.env.production`, mert kerül Git-be!):

```env
# .env.local (NE commit-old!)
LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
...
-----END PUBLIC KEY-----"
```

---

## 4. Edge Function deployment

### 4.1 Deploy a Supabase-re

```bash
cd D:\Egyházi APP\KARTOTEKA
supabase functions deploy issue-license
```

### 4.2 Verifikáció

```bash
# A function listája
supabase functions list

# Várható: issue-license  v1  ACTIVE  ...
```

### 4.3 Tesztelés (curl-rel)

```bash
# Egy Supabase user JWT kell hozzá (a frontendből másolható ki)
curl -X POST \
  "https://bjytiawckbibqmtlezfl.supabase.co/functions/v1/issue-license" \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"fingerprint":"a1b2c3d4e5f6789012345678901234567890abcdef","osInfo":"Windows 11","appVersion":"1.0.0"}'

# Várható válasz:
# {
#   "token": "eyJhbGc...",
#   "licenseId": "uuid...",
#   "userId": "uuid...",
#   "congregationId": "uuid...",
#   "expiresAt": "2026-05-20T...",
#   "issuedAt": "2026-04-15T..."
# }
```

---

## 5. Build environment

### 5.1 `.env.production` beállítás

A KARTOTEKA repo gyökerében:

```env
# .env.production (Git-ben tárolható, csak publikus értékek)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-env>

# Csak prod build-hez (publikus kulcs)
LICENSE_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----
MIIBIjANBgk...
-----END PUBLIC KEY-----

# A `LICENSE_USE_EDGE_FUNCTION=true` triggereli az Edge Function hívást
# (a `LICENSE_PRIVATE_KEY_PEM` hiányában is, csak akkor megy az edge-re)
LICENSE_USE_EDGE_FUNCTION=true

# Verzió tag
KARTOTEKA_VERSION=1.0.0
```

### 5.2 .env.local biztonsági ellenőrzés

```powershell
# Bizonyosodj meg, hogy a .gitignore-ban van!
git check-ignore .env.local
# Várható: .env.local

# És hogy NINCS commit-olva:
git ls-files | findstr ".env.local"
# Várható: üres lista
```

---

## 6. ZIP csomag generálás

### 6.1 Build script futtatás

```powershell
# Single-package build (default verzió)
npm run build:portable

# Per-congregation build (ha kész):
npm run build:portable -- -Slug "baratosi" -Version "1.0.0"
```

### 6.2 Mit csinál a script (~7-15 perc)

| Lépés | Idő | Eredmény |
|---|---|---|
| 1. Tisztítás | <1s | `build/portable/` mappa törölve |
| 2. `next build` | 60-120s | `.next/standalone/` létrejön |
| 3. Standalone fájlok másolás | 5s | Az `app/` mappa előáll |
| 4. Node.js portable letöltés | 30-60s (cache esetén 1s) | `runtime/node-v20.18-win-x64/` |
| 5. KARTOTEKA.bat generálás | <1s | Launcher BAT fájl |
| 6. Dokumentumok másolás | <1s | `docs/` mappa |
| 7. ZIP csomagolás | 30-60s | `dist/KARTOTEKA-<slug>-v<ver>.zip` (~180 MB) |

### 6.3 Output verifikáció

```powershell
# A ZIP létezik
ls dist/

# Méret 100-250 MB tartomány
(Get-Item "dist/KARTOTEKA-default-v1.0.0.zip").Length / 1MB
# Várható: ~180

# Tartalom-check
Expand-Archive -Path "dist/KARTOTEKA-default-v1.0.0.zip" -DestinationPath "C:\temp\test-kartoteka" -Force
ls "C:\temp\test-kartoteka"
# KARTOTEKA.bat, ELSO-INDULAS.md, app/, runtime/, data/, docs/
```

---

## 7. Lelkészi telepítés

### 7.1 ZIP átadás módjai

| Mód | Pro | Kontra |
|---|---|---|
| **USB stick** | Offline átadás, biztonságos | Fizikai találkozás kell |
| **Email link** (privát Drive/OneDrive) | Egyszerű | Internet + jelszó-védett URL kell |
| **Direkt FTP/SFTP** | Központi szerverről | Műszaki tudás kell a lelkésznek |
| **GitHub Releases** (privát) | Verziókövetett | Account-szintű hozzáférés |

**Ajánlott**: USB stick vagy az esperesi hivatal által hostolt belső szerver.

### 7.2 Telepítési instrukciók (lelkésznek)

A `ELSO-INDULAS.md` fájl benne van a ZIP-ben. Tartalma:

```
1. Csomagold ki a ZIP-et egy mappába (pl. C:\KARTOTEKA)
2. Csatlakozz internethez (egyszer, ~5 percre)
3. Dupla-klikk: KARTOTEKA.bat
4. A wizard végigvezet a beállításon
5. Készen állsz!
```

### 7.3 Mit lát a lelkész

1. Fekete parancsablak megnyílik (ne zárja be!)
2. 3 másodperc múlva a Chrome/Edge megnyílik `http://localhost:3000`-en
3. **Welcome wizard** 4 lépésben végigvezeti
4. Wizard után az alkalmazás a normál `/dashboard`-ra ugrik

---

## 8. Tesztelés

### 8.1 End-to-end teszt forgatókönyv

| Lépés | Várható |
|---|---|
| 1. ZIP kicsomagolás | A mappastruktúra létrejön |
| 2. KARTOTEKA.bat futtatás | Console ablak + Chrome megnyílik |
| 3. /welcome megjelenik | 4 lépéses wizard látható |
| 4. Email + jelszó megadás | Sikeres bejelentkezés, "Tovább" gomb aktív |
| 5. "Megerősítem" checkbox | Tovább gomb engedélyezve |
| 6. Step 2-3-4 kitöltés | Adatok mentődnek a state-be |
| 7. "Adatok letöltése" (step 5) | 1-3 perc, progress látszik |
| 8. Redirect /dashboard | KARTOTEKA-fő oldal megjelenik |
| 9. License banner | Nincs (újonnan kiállított) |
| 10. /offline → License Status | "Aktív" zöld, 35 nap maradt |
| 11. Új személy felvétel offline | Mentés sikeres, queue-ba kerül |
| 12. Chrome bezárás + KARTOTEKA.bat újraindítás | Wizard NEM jelenik meg, dashboard betölt |

### 8.2 Anti-copy teszt

| Teszt | Hogyan | Várható |
|---|---|---|
| **Ugyanazon a gépen újraindítás** | KARTOTEKA.bat restart | Wizard nem jelenik meg, simán működik |
| **Másik gépre másolás (USB)** | Mappát átmásolod USB-ről másik PC-re | Wizard megjelenik, "FINGERPRINT_MISMATCH" hibaüzenettel |
| **Másik Windows-user (ugyanaz a gép)** | Másik fiókkal logolsz be Windows-ba, KARTOTEKA.bat futtatás | Wizard megjelenik, új licensz kell (USERNAME különbözik) |
| **license.dat törlés** | `del data\license.dat` | Wizard megjelenik, újra-aktiválás |

### 8.3 Degradation teszt (manuálisan)

A lokális JWT-t lehet módosítani teszt-céllal:

```javascript
// Console-ban
const jwt = require('jose')
// Generate egy lejárt JWT-t (35 napja iat) → a banner megjelenik
```

---

## 9. Hibaelhárítás

### Hiba: "Cannot find module 'better-sqlite3'"

A `next build` után az `.next/standalone/node_modules/`-ban hiányzik a natív modul.

**Megoldás**:
```powershell
cd .next\standalone
npm install --omit=dev better-sqlite3
```

### Hiba: "wmic is not recognized"

Windows 11-en a `wmic` deprecated, néhol nem érhető el.

**Megoldás**: Engedélyezd a `wmic`-et:
```powershell
DISM /Online /Add-Capability /CapabilityName:WMIC~~~~
```

### Hiba: License banner mindig a "missing" státuszt mutatja

A `data/license.dat` nem létezik vagy a runtime nem találja.

**Megoldás**:
```powershell
ls data\
# Léteznie kell: license.dat, kartoteka.db
```

### Hiba: Edge Function 401

A Supabase user JWT érvénytelen, vagy a service role kulcs nincs beállítva.

**Megoldás**:
```bash
supabase secrets list
# Várható: SUPABASE_SERVICE_ROLE_KEY (auto), LICENSE_PRIVATE_KEY_PEM
```

---

## 10. Rollback

### Vissza-deploy egy korábbi verzióra

```bash
# Edge Function — eltávolítás
supabase functions delete issue-license

# SQL — DROP minden új objektumot
psql $DATABASE_URL -f migration-docs/sql/2026-04-15-standalone-licenses-rollback.sql
```

### Lelkészi gépeken

A KARTOTEKA mappa törlésével az adat is elveszik (a `data/` mappában van). **Csak akkor töröld**, ha a kartoteka.db-t és license.dat-ot először biztonsági mentésbe rakod.

```powershell
# Első: backup
Copy-Item -Recurse C:\KARTOTEKA\data C:\KARTOTEKA-backup-data

# Aztán törlés
Remove-Item -Recurse C:\KARTOTEKA
```

---

## 📞 Támogatás

- **Devops**: `tech@kartoteka.erek.ro`
- **Production support**: `helpdesk@kartoteka.erek.ro`
- **Sürgős**: `+40 740 XXX XXX`

---

**KARTOTEKA Devops Team**
*Erdélyi Református Egyházkerület · 2026*
