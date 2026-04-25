# M6.7 — Dexie / IndexedDB import tiltása a desktop kliensben

**Dátum:** 2026-04-22
**Fázis:** M6.7 — Tauri desktop "dual-storage" megszüntetés
**Státusz:** ✅ Kivitelezve + verifikálva (21 fájl, 0 tiltott import)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért kell

A roadmap szerint (OPÓIÓ A-dominált hibrid):
- **Web** offline rétege: Dexie (IndexedDB)
- **Desktop** offline rétege: SQLCipher (Rust/Tauri backend) — **NEM Dexie**

A kettős storage megszüntetése azért kritikus, mert:
1. A Rust-SQLCipher már tranzakciós, AES-256-mal titkosított, revision-alapú konfliktus-kezeléssel — fölösleges és káros Dexie-mirror-ral duplikálni
2. Rendszer-szintű inkonzisztencia (pl. Dexie állapot friss, SQLCipher stale) adatvesztést okozhat
3. A jövőbeli `@kartoteka/offline-sync` (M6.8) `StorageBackend` interface mögötti absztrakció csak akkor tiszta, ha **webes Dexie ≠ desktop Dexie**

A jelenlegi állapot ellenőrzése (2026-04-22):
- `apps/desktop/src/**/*.{ts,tsx}`: **0 Dexie import**
- `apps/desktop/package.json` dependencies: **nincs** `dexie` vagy `dexie-react-hooks`

Tehát a feladat **preventív**: ne kerülhessen be.

## Mi a megoldás

**Script:** [`scripts/check-desktop-banned-imports.mjs`](../../scripts/check-desktop-banned-imports.mjs)

- Tiszta Node.js (Windows-kompatibilis, nincs grep/ripgrep függőség)
- Végigolvassa a `apps/desktop/src/` TS/TSX/JS/JSX/MJS/CJS fájljait
- Regex-mintával keres tiltott `from '<banned>'` / `import '<banned>'` / `require('<banned>')` formákat
- Fail eseten **részletes magyarázat** a konzolra (melyik fájl, melyik import, miért tiltott)

**Tiltott csomagok (bővíthető lista):**

| Modul | Ok |
|---|---|
| `dexie` | Web-only; desktop a @kartoteka/offline-sync SQLCipher backendjét használja |
| `dexie-react-hooks` | ua.; `useLiveQuery` alternatívája a @kartoteka/offline-sync `useSyncQuery` (M6.8) |
| `@kartoteka/offline-sync/dexie-backend` | A DexieBackend a web-impl; desktop a TauriSqliteBackend-et importálja |

**Integráció:** `apps/desktop/package.json` scripts:
```diff
- "build": "tsc && vite build",
- "tauri": "tauri"
+ "lint:imports": "node ../../scripts/check-desktop-banned-imports.mjs",
+ "build": "npm run lint:imports && tsc && vite build",
+ "tauri": "npm run lint:imports && tauri"
```

A `dev` szándékosan nem fut át rajta — lokálisan a Vite import-error-ral jelez (Dexie amúgy sincs telepítve). A build és a `tauri` (dev + build egyaránt) viszont kötelezően védett.

## Verifikáció

```bash
cd "D:/Egyházi APP/KARTOTEKA"
node scripts/check-desktop-banned-imports.mjs
# → ✅ M6.7 import-check OK (21 fájl vizsgálva, 0 tiltott import).
```

## Mi NEM volt scope-ban

- **ESLint konfig** (desktop-on jelenleg nincs) — külön munka, M15 UI-polírozás előtt érdemes; de az M6.7 alapszintű védelem **ESLint nélkül is** működik a script-alapú pre-build check-kel
- **Tsconfig `paths` override** a dexie-re — hacky megoldás, inkább a script-alapú ellenőrzést választottuk
- **CI/CD integráció** — M14 során a GitHub Actions PR-runner-ben is le fog futni ez a check

## Kapcsolódó fájlok

- [`scripts/check-desktop-banned-imports.mjs`](../../scripts/check-desktop-banned-imports.mjs) (új)
- [`apps/desktop/package.json`](../../apps/desktop/package.json) (scripts módosítva)

## Következő M6 lépések

- **M6.3** — `/api/standalone/*` 6 route törlése + `next.config.ts` egyszerűsítés (portable build kivezetés, ~30 perc)
- **M6.4** — Supabase Edge Function gateway (`oblio-oauth`, `oblio-invoice`, `mail-send`, `ai-chat`) — M7 előfeltétele
- **M6.6** — Desktop auth Tauri keyring-be (Rust `auth.rs`)
- **M6.8** — Offline orchestrator átemelése `apps/web/lib/offline/*` → `packages/offline-sync/src/*`

Az M6.2 teljes zöld (`p1_total=26, ok=26, fail_rls_off=0`) — **M7 pénzügyi wave már indulhat**, amint az M6 fázis többi része is kész.
