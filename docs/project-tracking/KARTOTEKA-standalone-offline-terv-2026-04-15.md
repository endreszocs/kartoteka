# KARTOTEKA — Standalone Windows Offline csomag (Fázis 7) — KOMPLETT TERV

**Dokumentum dátuma**: 2026-04-15
**Becsült időtartam**: 3 hét (MVP), 4-5 hét (production polish)
**Státusz**: TERVEZET — jóváhagyásra vár

---

## 1. EXECUTIVE SUMMARY

Egy **Windows-ra tömörített ZIP csomag**, amit a lelkész saját gépén kicsomagol, regisztrál, majd **100% offline** használja. Havonta 1× internet-közelbe kerülve a rendszer szinkronizálódik a Supabase-zel.

**Fő ígéretek**:
1. ZIP kicsomagolás → dupla-klikk → első indítás varázsló → kész
2. Nincs szükség folyamatos netre (csak havonta 1×)
3. Licensz-védett (NEM továbbadható USB-n másik gépre)
4. A Fázis 0-6 PWA réteg integrálódik (Dexie + Excel + Kuka + ZIP backup)

**Nem cél**:
- Multi-OS (csak Windows 10/11)
- Mobile app
- Több felhasználó 1 gépen
- Peer-to-peer offline sync (pl. USB-n két lelkész között)

---

## 2. ARCHITEKTÚRA

### 2.1 Magas szintű áttekintés

```
┌─────────────────────────────────────────────────────────────────┐
│  KARTOTEKA-<slug>-v1.0.zip                                     │
│                                                                  │
│  ┌──────────────┐     ┌──────────────────┐                     │
│  │ KARTOTEKA.bat│───▶ │ node.exe         │                     │
│  │ (launcher)   │     │ (embedded Node)  │                     │
│  └──────────────┘     └────────┬─────────┘                     │
│                                │                                  │
│                         ┌──────▼────────────────────────┐       │
│                         │ Next.js standalone server     │       │
│                         │ http://localhost:3000         │       │
│                         └──────┬────────────────────────┘       │
│                                │ opens browser                   │
│                         ┌──────▼───────┐                         │
│                         │ Chrome/Edge  │                         │
│                         │ (User's)     │                         │
│                         └──────┬───────┘                         │
│                                │                                  │
│                         ┌──────▼────────────────────────┐       │
│                         │ React Client                   │       │
│                         │ + Dexie (reactive cache)       │       │
│                         └──────┬────────────────────────┘       │
│                                │                                  │
│                         ┌──────▼────────────────────────┐       │
│                         │ Next.js Server Actions         │       │
│                         │ + Offline-aware Supabase       │       │
│                         │   wrapper                       │       │
│                         └──────┬────────────────────────┘       │
│                                │                                  │
│         ┌──────────────────────┼──────────────────────┐         │
│         │ ONLINE               │ OFFLINE              │         │
│         ▼                      ▼                      ▼         │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────┐ │
│  │ Supabase     │◀───▶│ SQLite       │     │ license.dat    │ │
│  │ (authoritative│     │ (local auth) │     │ (JWT + fingerp)│ │
│  │  cloud)       │     │ data/*.db    │     └────────────────┘ │
│  └──────────────┘     └──────────────┘                          │
│  Havi sync                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Adatfolyamok (3-tier replication)

**TIER 1 — Supabase (felhő, authoritative)**:
- Minden gyülekezet+minden lelkész közös adatbázisa
- Csak olyankor író/olvasó, amikor online
- Havi sync push+pull ide/innen

**TIER 2 — SQLite (lokális, authoritative)**:
- A lelkész saját gépén a `data/kartoteka.db` fájl
- 100% a Supabase tükörképe + a saját offline módosítások
- Minden írás ide megy először (gyors, mindig elérhető)
- Havi sync-kor push-olja a változásokat a Supabase-re + lehúzza ami ott új

**TIER 3 — Dexie (böngésző, reactive cache)**:
- A UI reactive "fast path"-a (useLiveQuery a Fázis 0-6-ból)
- A SQLite-ból betöltődik app-indításkor
- Minden SQLite-write után update-elődik

**Miért ez a 3-tier?**
- Dexie = azonnali reaktív UI (milliszekundumok)
- SQLite = perzisztens offline adattár (tab-független, ZIP-be mehet)
- Supabase = multi-device sync + backup
- Ha csak Dexie lenne: a böngésző cache clear kitörölné az adatot
- Ha csak SQLite lenne: minden query Next.js API-n keresztül menne (lassabb UI)

### 2.3 Technológiai döntések

| Komponens | Választott | Verzió | Indok |
|---|---|---|---|
| Alkalmazás shell | **Portable Node.js + batch launcher** | Node 20.18 LTS | Meglévő Next.js app változatlanul működik, nincs új stack |
| Embedded DB | **better-sqlite3** | ^11.5.0 | Szinkron API, egy fájl (.db), jól tesztelt, ~3 MB |
| DB migráció tool | **drizzle-kit** vagy natív SQL | - | Séma verzió-kontroll |
| JWT lib | **jose** (már projektben) | - | License token sign/verify |
| Machine fingerprint | **node-machine-id** | ^1.1.12 | Windows: HKLM\MachineGuid + BIOS serial |
| Packaging | **PowerShell/batch script** | Windows native | Teljes ZIP generálás build során |
| Installer (opcionális) | **Inno Setup** vagy NSIS | — | Csak ha felhasználó igényli |

**Rejected alternatíva**: Electron — +200 MB bundle, tanulási görbe, nincs látható előny

---

## 3. KÖNYVTÁRSTRUKTÚRA

### 3.1 Forrás repo (fejlesztési)

```
KARTOTEKA/
├── app/                            (meglévő Next.js kód, változatlan)
├── components/
├── lib/
│   ├── offline/                    (Fázis 0-6 — PWA/Dexie, változatlan)
│   └── standalone/                 ÚJ — Fázis 7 kódja
│       ├── sqlite-db.ts            better-sqlite3 singleton
│       ├── sqlite-schema.sql       26 tábla létrehozása
│       ├── sqlite-migrations/      v1.sql, v2.sql, ...
│       ├── offline-supabase-wrapper.ts  Dual-backend: Supabase vagy SQLite
│       ├── license.ts              JWT generator + validator + fingerprint
│       ├── monthly-sync.ts         Push-pull koordinátor
│       └── first-run-wizard/       React komponensek a wizard-hoz
│           ├── step-1-license.tsx
│           ├── step-2-congregation.tsx
│           ├── step-3-pastor.tsx
│           └── step-4-finance.tsx
├── app/
│   └── (setup)/                    ÚJ — első indítási route group
│       ├── layout.tsx
│       └── welcome/page.tsx
├── public/
├── standalone-build/               ÚJ — build tool scriptek
│   ├── build-portable.ps1          Fő build script
│   ├── bundle-node.ps1             Node.js portable letöltés
│   ├── strip-node-modules.ps1      Production-only dependencies
│   ├── generate-bat.ps1            KARTOTEKA.bat sablon
│   └── sign-license-pubkey.pem     A kiadott csomagban
└── migration-docs/
    └── sql/
        └── 2026-04-15-licenses.sql  ÚJ — licenses tábla Supabase-ben
```

### 3.2 Kicsomagolt KARTOTEKA csomag (felhasználónál)

```
KARTOTEKA-baratosi-v1.0.0/
├── KARTOTEKA.bat                   Dupla-klikk indítás
├── Első-indítás.md                 Rövid útmutató magyarul
├── runtime/
│   └── node-v20.18.0-win-x64/
│       └── node.exe                (~40 MB)
├── app/
│   ├── .next/
│   │   └── standalone/
│   │       ├── server.js           Next.js prod server entry
│   │       └── [minden kell]
│   ├── public/                     (Excel ikonok, manifest, sw.js)
│   ├── node_modules/               (csak production deps, ~30 MB)
│   └── package.json                (minimális)
├── data/                           (app creates on first run)
│   ├── kartoteka.db                SQLite adat (inicial: üres)
│   ├── license.dat                 JWT + fingerprint (first-run után)
│   └── sync-log.txt                havi sync history
├── docs/
│   ├── Kezdes.md                   "Mit csinálj elsőnek"
│   └── GYIK.md
└── LICENSE.txt
```

**Össz becslés**: 150-200 MB

---

## 4. FÁZIS 7 — RÉSZLETES BONTÁS

### Fázis 7a — SQLite backend (1 hét)

#### Cél
A 26 tábla sémájának **tükörképe** SQLite-ban. A Supabase kliens wrapper-je **dual-backend** legyen.

#### Új fájlok

**`lib/standalone/sqlite-db.ts`** (~200 sor)
```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let dbInstance: Database.Database | null = null

export function getSqliteDb(): Database.Database {
  if (!dbInstance) {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
    dbInstance = new Database(path.join(dataDir, 'kartoteka.db'))
    dbInstance.pragma('journal_mode = WAL')
    dbInstance.pragma('foreign_keys = ON')
    runMigrations(dbInstance)
  }
  return dbInstance
}

function runMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT
  )`)
  const currentVersion = (db.prepare('SELECT MAX(version) as v FROM _migrations').get() as { v: number | null })?.v ?? 0
  const migrationFiles = fs.readdirSync(
    path.join(process.cwd(), 'lib/standalone/sqlite-migrations')
  ).sort()
  for (const file of migrationFiles) {
    const version = parseInt(file.match(/^v(\d+)/)?.[1] ?? '0')
    if (version <= currentVersion) continue
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'lib/standalone/sqlite-migrations', file), 'utf8'
    )
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(
      version, new Date().toISOString()
    )
  }
}
```

**`lib/standalone/sqlite-migrations/v1.sql`** (~500 sor) — 26 tábla + mutation_queue + sync_meta

**`lib/standalone/offline-supabase-wrapper.ts`** (~300 sor)
```typescript
import { createClient } from '@supabase/supabase-js'
import { getSqliteDb } from './sqlite-db'
import { isStandaloneMode } from './runtime-detect'

const STANDALONE = isStandaloneMode()

/**
 * Drop-in replacement a Supabase kliens helyett standalone módban.
 * Ha offline, SQLite-ra ír. Ha online, mindkettőre (+queue).
 */
export function createOfflineAwareClient(url: string, key: string) {
  if (!STANDALONE) {
    return createClient(url, key)
  }

  const supabase = createClient(url, key)

  return {
    from(table: string) {
      return {
        select(cols: string = '*') {
          return {
            async then(cb: Function) {
              const db = getSqliteDb()
              const rows = db.prepare(`SELECT ${cols} FROM ${table}`).all()
              cb({ data: rows, error: null })
            },
            eq(col: string, val: unknown) { /* ... */ },
            // ...
          }
        },
        async insert(rows: unknown | unknown[]) {
          const db = getSqliteDb()
          const stmt = db.prepare(/* INSERT OR REPLACE */)
          // + mutation queue entry
          // + ha online: push Supabase-re
          return { data: rows, error: null }
        },
        // update, delete ugyanúgy
      }
    },
  }
}
```

**`lib/standalone/runtime-detect.ts`** (~20 sor)
```typescript
export function isStandaloneMode(): boolean {
  return process.env.KARTOTEKA_STANDALONE === 'true'
}
```

A `KARTOTEKA.bat` ezt beállítja: `set KARTOTEKA_STANDALONE=true` a Node indítás előtt.

#### Módosított fájlok

`lib/supabase/client.ts`, `lib/supabase/server.ts` — beépített check: ha `isStandaloneMode()`, akkor az offline-aware wrapper-t adja vissza.

#### Acceptance criteria
- [ ] A `sqlite-migrations/v1.sql` lefut, a 26 tábla létrejön
- [ ] Egy `supabase.from('szemely').select('*')` hívás SQLite-ból olvas standalone-ban
- [ ] Egy `supabase.from('szemely').insert()` SQLite-ba ír
- [ ] Ha online, a mutation queue-ba is bekerül a push-ra váró sor

---

### Fázis 7b — Első indítási varázsló (0.7 hét)

#### Cél
Új app-route group (`app/(setup)`), ami a `license.dat` hiányában vagy érvénytelenségekor aktiválódik. 4-lépéses wizard.

#### Új fájlok

**`app/(setup)/layout.tsx`** — middleware-hez hasonló wrapper, ami ellenőrzi a license-t. Ha nincs → wizard oldalra irányít.

**`app/(setup)/welcome/page.tsx`** — 4-lépéses wizard
- Lépés 1: Email + jelszó (Supabase login) → license kérés
- Lépés 2: Gyülekezet alapadatok űrlap
- Lépés 3: Lelkész személyes adatok űrlap
- Lépés 4: Pénzügyi alapbeállítások űrlap
- Finish: Kezdeti pull Supabase-ről → SQLite feltöltés

**`middleware.ts`** — meglévő, kiterjesztve:
```typescript
// Ha standalone mode és nincs valid license → redirect /welcome
if (isStandaloneMode() && !hasValidLicense()) {
  return NextResponse.redirect(new URL('/welcome', req.url))
}
```

#### UI sketch

```
┌────────────────────────────────────────────┐
│  KARTOTEKA — Első indítás                  │
│                                             │
│  [●]  [○]  [○]  [○]                        │
│  Licensz  Gyül.  Lelkész  Pénzügy         │
│                                             │
│  Bejelentkezés                             │
│  ──────────────────────────────────        │
│  Email:     [____________________]         │
│  Jelszó:    [____________________]         │
│                                             │
│  ℹ️ Az első indításkor egyszer              │
│  kapcsolódni kell az internethez,           │
│  hogy a licenszt leellenőrizzük.           │
│                                             │
│  [Mégse]                    [Tovább →]     │
└────────────────────────────────────────────┘
```

#### Acceptance criteria
- [ ] Friss install → `/welcome` wizard jelenik meg
- [ ] 4 lépés végigjárható (validáció, hiba-kezelés)
- [ ] Sikeres regisztrációkor `data/license.dat` létrejön
- [ ] Wizard után `/` dashboard-ra redirect

---

### Fázis 7c — License rendszer + anti-copy (0.7 hét)

#### Cél
JWT-alapú license token, amit a Supabase ad ki, gép-fingerprinttel kötött.

#### Komponensek

**Szerver oldal** (Supabase Edge Function vagy Next.js API route — de a Supabase projekten):

`migration-docs/sql/2026-04-15-licenses.sql`:
```sql
CREATE TABLE public.standalone_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  machine_fingerprint text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean DEFAULT false,
  last_sync_at timestamptz,
  UNIQUE(user_id, machine_fingerprint)
);

-- Egy user csak X db standalone licensz-t használhat egyidejűleg
CREATE POLICY license_insert_own ON standalone_licenses
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RPC: license_issue(email, password, fingerprint) → JWT
CREATE OR REPLACE FUNCTION public.issue_license(
  p_fingerprint text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cong_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  SELECT congregation_id INTO v_cong_id FROM public.profiles WHERE id = v_user_id;
  IF v_cong_id IS NULL THEN
    RAISE EXCEPTION 'User has no congregation';
  END IF;
  
  INSERT INTO standalone_licenses (
    user_id, congregation_id, machine_fingerprint, expires_at
  ) VALUES (
    v_user_id, v_cong_id, p_fingerprint, now() + interval '35 days'
  )
  ON CONFLICT (user_id, machine_fingerprint) DO UPDATE SET
    expires_at = now() + interval '35 days',
    last_sync_at = now();
  
  -- Visszaadja a tokent (JWT-t külön edge function generálja)
  RETURN 'TOKEN_PLACEHOLDER';
END;
$$;
```

**Supabase Edge Function** `issue-license`:
```typescript
// supabase/functions/issue-license/index.ts
import { SignJWT } from 'https://deno.land/x/jose/index.ts'

const PRIVATE_KEY = await crypto.subtle.importKey(
  'pkcs8',
  Deno.env.get('LICENSE_PRIVATE_KEY_PEM'),
  { name: 'RSA-PSS', hash: 'SHA-256' },
  true, ['sign']
)

Deno.serve(async (req) => {
  const { fingerprint } = await req.json()
  const authHeader = req.headers.get('authorization')
  
  // Supabase-hez kapcsolódik, validálja a user-t, meghívja az issue_license RPC-t
  const { data: user } = await supabase.auth.getUser(authHeader)
  if (!user) return new Response('unauthorized', { status: 401 })
  
  const { data: cong } = await supabase.from('profiles').select('congregation_id').eq('id', user.id).single()
  
  const jwt = await new SignJWT({
    sub: user.id,
    cong_id: cong.congregation_id,
    fp: fingerprint,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 35 * 24 * 60 * 60,  // 35 nap
  })
    .setProtectedHeader({ alg: 'PS256' })
    .sign(PRIVATE_KEY)
  
  return new Response(JSON.stringify({ token: jwt }), {
    headers: { 'content-type': 'application/json' }
  })
})
```

**Kliens oldal**:

**`lib/standalone/license.ts`**:
```typescript
import { jwtVerify, importSPKI } from 'jose'
import { machineIdSync } from 'node-machine-id'
import fs from 'fs'
import path from 'path'

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`

export async function getMachineFingerprint(): Promise<string> {
  // Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
  // + CPU model + BIOS serial (opcionális)
  return machineIdSync({ original: true })  // SHA-256 hash
}

export async function validateLicense(): Promise<{
  valid: boolean
  reason?: string
  userId?: string
  congId?: string
  expiresAt?: Date
  daysRemaining?: number
}> {
  const licensePath = path.join(process.cwd(), 'data', 'license.dat')
  if (!fs.existsSync(licensePath)) {
    return { valid: false, reason: 'NO_LICENSE' }
  }
  
  const token = fs.readFileSync(licensePath, 'utf8').trim()
  const publicKey = await importSPKI(PUBLIC_KEY_PEM, 'PS256')
  
  try {
    const { payload } = await jwtVerify(token, publicKey)
    const fp = await getMachineFingerprint()
    if (payload.fp !== fp) {
      return { valid: false, reason: 'FINGERPRINT_MISMATCH' }
    }
    
    const expiresAt = new Date((payload.exp as number) * 1000)
    const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
    
    if (daysRemaining < 0) {
      return { valid: false, reason: 'EXPIRED', expiresAt }
    }
    
    return {
      valid: true,
      userId: payload.sub as string,
      congId: payload.cong_id as string,
      expiresAt,
      daysRemaining,
    }
  } catch (e) {
    return { valid: false, reason: 'INVALID_SIGNATURE' }
  }
}

export async function requestNewLicense(email: string, password: string): Promise<{
  ok: boolean
  error?: string
}> {
  const fp = await getMachineFingerprint()
  // ... Supabase login + call issue-license edge function
  const { token } = await response.json()
  fs.writeFileSync(path.join(process.cwd(), 'data', 'license.dat'), token)
  return { ok: true }
}
```

#### Viselkedési szabályok

| Nap (utolsó sync óta) | Viselkedés |
|---|---|
| 0-30 | Normál működés |
| 30-35 | Warning banner: „X nap múlva kell szinkronizálni" |
| 35-45 | Degradált mód: új rekordok OK, de Excel export disabled |
| 45-60 | Read-only mód: csak olvasható, új írás NEM |
| 60+ | Teljes blokk: bejelentkezés kötelező újra |

#### Acceptance criteria
- [ ] A `license.dat` fájl JWT-t tartalmaz érvényes aláírással
- [ ] Másik gépre másolva: `FINGERPRINT_MISMATCH` hibaüzenet
- [ ] 35 napnál: warning banner megjelenik
- [ ] 45 napnál: Excel export disabled
- [ ] 60 napnál: read-only

---

### Fázis 7d — Havi szinkronizáció (0.6 hét)

#### Cél
Amikor online, egy "sync now" gomb vagy auto-trigger letölti a Supabase-ről az új adatokat és feltölti a lokális változásokat.

#### Új fájlok

**`lib/standalone/monthly-sync.ts`** (~250 sor)
```typescript
import { getSqliteDb } from './sqlite-db'
import { createClient } from '@supabase/supabase-js'
import { TABLE_REGISTRY } from '@/lib/offline/table-registry'

export async function performMonthlySync(opts: {
  supabaseUrl: string
  supabaseKey: string
  congregationId: string
  onProgress?: (p: { phase: string; table: string; done: number; total: number }) => void
}): Promise<{
  success: boolean
  pulled: Record<string, number>
  pushed: Record<string, number>
  conflicts: Array<{ table: string; id: string }>
  errors: string[]
}> {
  const db = getSqliteDb()
  const supabase = createClient(opts.supabaseUrl, opts.supabaseKey)
  
  // 1) PULL phase: minden tábla delta
  const pulled: Record<string, number> = {}
  for (const entry of TABLE_REGISTRY) {
    const lastPullAt = db.prepare(
      'SELECT last_pull_at FROM _sync_meta WHERE table_name = ?'
    ).get(entry.dexieTable)
    
    const { data, error } = await supabase
      .from(entry.supabaseTable)
      .select('*')
      .gt('updated_at', lastPullAt || '1970-01-01')
      .eq('congregation_id', opts.congregationId)
    
    if (error) { /* ... */ continue }
    
    // Upsert a helyi SQLite-ba
    const upsert = db.prepare(`INSERT OR REPLACE INTO ${entry.dexieTable} VALUES (?, ...)`)
    for (const row of data) upsert.run(...Object.values(row))
    
    pulled[entry.dexieTable] = data.length
    db.prepare('UPDATE _sync_meta SET last_pull_at = ? WHERE table_name = ?')
      .run(new Date().toISOString(), entry.dexieTable)
  }
  
  // 2) PUSH phase: mutation queue
  const pushed: Record<string, number> = {}
  const conflicts: Array<{ table: string; id: string }> = []
  const mutations = db.prepare(`
    SELECT * FROM _mutation_queue WHERE status = 'pending' ORDER BY timestamp ASC
  `).all()
  
  for (const m of mutations) {
    const { error, data } = await supabase.from(m.table).upsert(JSON.parse(m.payload))
    if (error?.code === '409' /* conflict */) {
      conflicts.push({ table: m.table, id: m.row_id })
    } else if (!error) {
      db.prepare('DELETE FROM _mutation_queue WHERE id = ?').run(m.id)
      pushed[m.table] = (pushed[m.table] || 0) + 1
    }
  }
  
  // 3) Új license-t is kérünk (havi megújítás)
  const newLicense = await requestNewLicense(/* ... */)
  
  return { success: true, pulled, pushed, conflicts, errors: [] }
}
```

#### UI integráció

A `/offline` oldalra bővítjük egy új kártyát: **„Szinkronizáció a szerverrel"**
- Gomb: „Sync most" — manuális indítás
- Utolsó sync időpontja
- Next sync: „N nap múlva kötelező"
- Progress bar a sync közben

#### Acceptance criteria
- [ ] A `performMonthlySync` lefut, kiírja a pulled/pushed számokat
- [ ] Conflicts-ot dialog-ba hozza (reuse Fázis 2 conflict-dialog)
- [ ] Sikeres sync után a license expires+35 napra tolódik

---

### Fázis 7e — Packaging (0.5 hét)

#### Cél
`npm run build:portable` → generál egy `KARTOTEKA-<slug>-v1.0.0.zip` fájlt.

#### Build script

**`standalone-build/build-portable.ps1`**:
```powershell
param(
  [string]$Slug = "default",
  [string]$Version = "1.0.0"
)

$BuildDir = ".\build\portable"
$OutputZip = "KARTOTEKA-$Slug-v$Version.zip"

# 1. Clean
Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $BuildDir -Force

# 2. Next.js standalone build
$env:KARTOTEKA_STANDALONE = "true"
npm run build

# 3. Copy Next.js standalone
Copy-Item -Recurse ".\.next\standalone" "$BuildDir\app\.next\standalone"
Copy-Item -Recurse ".\.next\static" "$BuildDir\app\.next\static"
Copy-Item -Recurse ".\public" "$BuildDir\app\public"
Copy-Item -Recurse ".\lib\standalone\sqlite-migrations" "$BuildDir\app\lib\standalone\sqlite-migrations"

# 4. Download portable Node.js
if (-not (Test-Path ".\cache\node-v20.18.0-win-x64.zip")) {
  Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip" `
    -OutFile ".\cache\node-v20.18.0-win-x64.zip"
}
Expand-Archive ".\cache\node-v20.18.0-win-x64.zip" -DestinationPath "$BuildDir\runtime"

# 5. Generate KARTOTEKA.bat
@"
@echo off
title KARTOTEKA - $Slug
cd /d %~dp0
set KARTOTEKA_STANDALONE=true
set PORT=3000
start "" "http://localhost:3000"
runtime\node-v20.18.0-win-x64\node.exe app\.next\standalone\server.js
pause
"@ | Out-File -Encoding ASCII "$BuildDir\KARTOTEKA.bat"

# 6. Copy docs
Copy-Item ".\docs\user\Elso-indítás.md" "$BuildDir\Elso-indítás.md"

# 7. ZIP
Compress-Archive -Path "$BuildDir\*" -DestinationPath $OutputZip -Force

Write-Host "✅ $OutputZip ($([math]::Round((Get-Item $OutputZip).Length / 1MB, 2)) MB)"
```

#### `package.json` update

```json
{
  "scripts": {
    "build:portable": "powershell -ExecutionPolicy Bypass -File standalone-build/build-portable.ps1 -Slug default -Version 1.0.0"
  }
}
```

#### Next.js config

`next.config.ts` bővítése:
```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // HOZZÁADÁS!
  // ...
}
```

Ez létrehozza a `.next/standalone/` könyvtárat minden szükséges dep-pel.

#### Acceptance criteria
- [ ] `npm run build:portable` futás után `KARTOTEKA-default-v1.0.0.zip` létrejön (~180 MB)
- [ ] Kicsomagolva, dupla-klikk `KARTOTEKA.bat` → szerver elindul
- [ ] Böngésző nyílik `localhost:3000`-en
- [ ] Első indítási wizard látható
- [ ] Wizard után a normál app működik
- [ ] Bezárás után a szerver leáll

---

## 5. SZEMÉLYRE SZABOTT CSOMAG (OPCIONÁLIS)

Minden lelkésznek **saját ZIP** generálódhat:
- `KARTOTEKA-baratosi-v1.0.zip`
- `KARTOTEKA-kolozsvar-v1.0.zip`
- `KARTOTEKA-marosvasarhely-v1.0.zip`

Előre a ZIP-be beépítve:
- Gyülekezet slug (a backup mappa előre beállított)
- Pre-pulled adatbázis (data/kartoteka.db a gyülekezet jelen állapotával)
- License? NEM — az first-run-on kérjük (per gép)

**Build command**:
```bash
npm run build:portable -- --slug baratosi --cong-id "uuid..."
```

Ez lehet a **következő lépcső** — első verzióban mindenki ugyanazt a ZIP-et kapja.

---

## 6. TESZTELÉSI MATRIX

| Teszt | Scenárió | Várható |
|---|---|---|
| **T1** | Friss install → indítás | Wizard megjelenik |
| **T2** | Wizard online (real credentials) | License generálódik, main app betöltődik |
| **T3** | Wizard offline | „Internet szükséges az első indításhoz" hiba |
| **T4** | Install 2. gépen (USB-n másolva) | „Fingerprint mismatch" hiba |
| **T5** | Offline editálás 10 napig | Minden működik |
| **T6** | Offline editálás 35 napig | Warning banner |
| **T7** | Offline editálás 50 napig | Degraded mode (no Excel export) |
| **T8** | Offline editálás 65 napig | Read-only |
| **T9** | Online visszatérés → sync | Delta pull + push, conflicts dialog ha van |
| **T10** | Sync alatt net megszakad | Graceful error, queue megmarad |
| **T11** | SQLite fájl törlése | Adatvesztés, új wizard (újra online kell) |
| **T12** | `license.dat` törlése | Wizard újra, de same machine — sikerül |
| **T13** | Wizard után Excel export | Működik (PWA réteg változatlan) |
| **T14** | Bezárás, újranyitás | Adatok megmaradnak (SQLite perzisztens) |

---

## 7. BIZTONSÁGI KOCKÁZATOK + MITIGATION

| Kockázat | Súlyosság | Mitigation |
|---|---|---|
| **USB-s másolás 2. gépre** | Magas | Machine fingerprint JWT-ben |
| **license.dat törlés + újra-issue** | Közepes | Szerver-oldali UNIQUE(user_id, fp) — ugyanaz fp reissue OK, más fp új licensz |
| **SQLite fájl ellopása** | Magas (személyes adatok!) | SQLCipher? Opcionális, +10% perf cost. MVP-ben nincs |
| **JWT private key kiszivárgás** | Katasztrofális | Supabase secret env, rotation plan |
| **Brute-force licensz kérés** | Alacsony | Rate limit az edge function-ban (10/óra/user) |
| **Helyi SQLite corruption** | Közepes | Minden sync előtt `.db` fájl `backup-YYYY-MM-DD.db`-re mentés |
| **Elfelejtett havi sync → adatvesztés** | Közepes | Email értesítés 25 napnál (ha van net valamikor) |
| **Malware, ami a `data/` mappát módosítja** | Alacsony-közepes | SHA-256 hash a license-ben + minden sync-kor check |

---

## 8. TIMELINE

### 3 hetes MVP

```
Hét 1: Fázis 7a (SQLite backend)
├── H: 26 tábla SQLite séma (sqlite-migrations/v1.sql)
├── K-Sz: better-sqlite3 integráció, offline-supabase-wrapper.ts
├── Cs: mutation queue SQLite-ba (Dexie mintára)
└── P: teszt + bugfix

Hét 2: Fázis 7b + 7c (Wizard + License)
├── H-K: Wizard 4 lépés + first-run flow
├── Sz-Cs: License JWT rendszer (kliens + Supabase edge function)
├── P: Machine fingerprint, anti-copy check

Hét 3: Fázis 7d + 7e (Sync + Package)
├── H-K: Monthly sync orchestrator
├── Sz: /offline oldalon sync UI
├── Cs-P: build-portable.ps1 script, ZIP generálás, teszt
```

### Post-MVP polish (plusz 1-2 hét)

- Pre-pulled per-congregation ZIP-ek
- Inno Setup Windows installer (.exe)
- Auto-update mechanizmus (havonta új .zip letöltés a Supabase-ről)
- Gépkötés finomítás (CPU + BIOS serial + TPM)
- SQLCipher titkosítás (opt-in)
- Email értesítés a havi sync-ről

---

## 9. DÖNTÉSPONTOK

Mielőtt elkezdjük, ezek a döntéseket kell meghozni:

### D1: License offline időtartam
- **Opció A**: 30 nap strict (szigorú, de biztos)
- **Opció B**: 60 nap + degraded mode (engedékenyebb)
- **Opció C**: végtelen, csak warning (legengedékenyebb)

**Javaslat**: Opció B — 60 nap tolerancia elég az anti-abuse-hoz.

### D2: SQLite vs PGlite
**PGlite** = PostgreSQL WASM-ban, kompatibilis a Supabase SQL-jével.
- **Előny**: ugyanaz az SQL, kevesebb adaptáció
- **Hátrány**: nagyobb bundle (~25 MB), újabb technológia (2024 óta), kisebb ecosystem

**Javaslat**: SQLite — stabil, tesztelt, better-sqlite3 kiváló performance.

### D3: Machine fingerprint mélysége
- **Level 1**: csak `machine-id` (HKLM\MachineGuid) — 10 sor kód
- **Level 2**: + CPU ID + BIOS serial — 50 sor kód + wmic parsing
- **Level 3**: + TPM chip ID — 200 sor kód, komplex

**Javaslat**: Level 1 — a Windows MachineGuid már elég egyedi egy lelkészi szcenárióhoz. USB-n vitt ZIP más machineGuid-ot fog látni.

### D4: Wizard-ban lehet-e offline folytatni?
Ha a lelkész az első indításnál **nem fér internet közelébe**, mit csináljon?
- **Opció A**: Nem indul el, amíg nincs net. Telefonnal hotspot készítenie kell az első 5 percre.
- **Opció B**: Off-line wizard → license kérés pár hónapra később. Addig csak a manuálisan beírt adatokkal dolgozik.

**Javaslat**: Opció A — jelentős egyszerűsítés, a lelkész telefonjáról is megkapja a hotspot-ot 5 percre.

### D5: Egyszerű .zip vs Windows installer (.exe)
- **.zip** (ajánlott MVP-nek): dupla-klikk kicsomagolás, KARTOTEKA.bat indítás
- **.exe** (polish): Inno Setup, Start Menu shortcut, Uninstaller, auto-update

**Javaslat**: .zip először. Ha a lelkészek kérik, az .exe 2 nap bónusz munka.

### D6: Több gép egy lelkésznek?
Ha a lelkésznek van **irodai gép + laptop**, kell-e támogatni?
- **Opció A**: Egy licensz = egy gép. Másik gépen újra regisztrálni kell (a lelkész email+pw-vel, új fp).
- **Opció B**: Egy licensz = max N (pl. 3) gép. Multi-device.

**Javaslat**: Opció A — egyszerűbb. Ha kell, upgrade Opció B-re.

### D7: Szerver-oldali licensz-ellenőrzés (havi sync-nél)
A havi sync-kor **revoke** check kell-e? Ha a szerver-oldalon egy licensz `revoked = true`-ra állítódik (pl. pénzügyi ok miatt), azonnal leáll a kliens?
- **Opció A**: Igen — havi sync-kor check, ha revoked → app kilép
- **Opció B**: Nem — csak az új licensz kiadása fail-el

**Javaslat**: Opció A — pénzügyi kontroll a szervezetnek.

---

## 10. KÖLTSÉGBECSLÉS

**Fejlesztési munkaórák** (1 fejlesztő):
- Fázis 7a: 40 óra
- Fázis 7b: 20 óra
- Fázis 7c: 20 óra
- Fázis 7d: 20 óra
- Fázis 7e: 15 óra
- Tesztelés + bugfix: 25 óra
- Dokumentáció: 10 óra
- **Összesen**: 150 óra ≈ 3-4 hét

**Szerver-oldali költségek**:
- Supabase Edge Functions: ingyenes tier elég (havi 500k invocation, 1 lelkész havi 1× = 12/év)
- Opcionális: RSA kulcs generálás, kezelés (0 €)

**Kliens-oldali**:
- Portable Node.js: ingyenes
- better-sqlite3: ingyenes
- node-machine-id: ingyenes
- **Végső csomag méret**: 150-200 MB

---

## 11. FELHASZNÁLÓI ÚTMUTATÓ (mellékelt dokumentum)

**`Első-indítás.md`** a ZIP-ben:

```markdown
# KARTOTEKA első indítás

Tisztelt Lelkész!

Köszönöm, hogy használja a KARTOTEKA rendszert.

## Mit kell tenni ELŐSZÖR

1. **Csomagolja ki** a ZIP-et egy mappába, pl. `C:\KARTOTEKA`
2. **Csatlakozzon internethez** egyszer (otthoni wifi, telefon hotspot) — 
   csak 5 percre kell!
3. **Dupla-klikk** a `KARTOTEKA.bat` fájlra.
4. Böngésző automatikusan megnyílik a helyi alkalmazásra.
5. **Töltse ki a varázslót**:
   - Email + jelszó (már regisztrált fiókkal)
   - Gyülekezet adatai
   - Saját adatai
   - Pénzügyi alapok
6. A rendszer letölti az aktuális gyülekezeti adatokat.
7. **Készen áll!** Mostantól offline is dolgozhat.

## Havonta egyszer

Amikor legközelebb internet-közelbe kerül:
- A KARTOTEKA automatikusan szinkronizál
- Vagy kattintson a **„Szinkronizálás most"** gombra a fejlécben

## Figyelmeztetés

- **NE** másolja át a fájlokat más gépre — csak ezen a számítógépen fog működni
- **NE** törölje a `data/` mappát — ebben vannak az adatai
- **HAVONTA** szinkronizáljon — különben 60 nap után csak olvashatóvá válik

## Segítség

Ha bármi kérdése van: support@kartoteka.erek.ro
```

---

## 12. KÖVETKEZŐ LÉPÉSEK — mit csinálok, ha jóváhagyod

1. **Azonnal**: Next.js config bővítés `output: 'standalone'`-nal → build próba
2. **1. nap**: `lib/standalone/sqlite-db.ts` + v1.sql megírása
3. **2. nap**: offline-supabase-wrapper első verzió (read-only)
4. **3-4. nap**: CRUD push-pull a SQLite-SQ között
5. **5. nap**: Wizard layout + step 1
6. **...** folytatás a fenti timeline szerint

---

## 13. JÓVÁHAGYÁSHOZ KÉRT DÖNTÉSEK

Kérem jelezd a 7 döntéspontra (D1-D7) a választásodat, és **bármi kiegészítést/módosítást** a tervben.

Utána elkezdem a Fázis 7a megvalósítását.
