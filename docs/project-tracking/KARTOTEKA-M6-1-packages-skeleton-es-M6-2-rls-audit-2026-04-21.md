# M6.1 + M6.2 — Shared packages skeleton és 113-tábla RLS audit

**Dátum:** 2026-04-21
**Fázis:** M6 (architektúra konszolidáció), első két lépés
**Státusz:**
- M6.1 ✅ Kivitelezve (5 package skeleton + npm workspace verifikáció)
- M6.2 🟡 SQL átadva, Endre futtatja Supabase Studio-ban

A teljes Tauri desktop migrációs roadmap itt: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## M6.1 — Shared packages skeleton

**Cél:** felépíteni az 5 új közös csomagot, amelyek az M6.8 és az M7+ modul-hullámok során a web és a desktop közös frontend + business logic rétegét hordozzák.

### Elkészült csomagok

| Csomag | Szerep | Függőségek | tsconfig |
|---|---|---|---|
| `@kartoteka/core` | Business logic — use-case fn-ek, domain kalkulátorok | `@kartoteka/supabase-client`, `@kartoteka/schema-types`, `@kartoteka/validations`, `zod` | TS-only |
| `@kartoteka/ui-app` | App-szintű React komponensek (302 komponens célhelye) | `@kartoteka/core`, `@kartoteka/ui`, `@kartoteka/validations`, CVA, lucide, tailwind-merge | TSX, `react-jsx` |
| `@kartoteka/offline-sync` | StorageBackend absztrakció + pull/push orchestrator | `@kartoteka/supabase-client`, `@kartoteka/schema-types` | TS-only |
| `@kartoteka/auth` | RBAC helper-ek, scope-builder-ek | `@kartoteka/supabase-client`, `@kartoteka/schema-types` | TS-only |
| `@kartoteka/validations` | Közös zod sémák | `zod` | TS-only |

Minden csomag minimális `src/index.ts`-szel indult (üres `export {}` + részletes dokumentációs kommentek a szándékolt modul-szerkezettel). A valós tartalom modul-hullámonként érkezik M6.8 és M7+ alatt.

### Fájlstruktúra

```
packages/
├── core/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── ui-app/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── offline-sync/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── auth/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
└── validations/
    ├── package.json
    ├── tsconfig.json
    └── src/index.ts
```

### Verifikáció

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npm install
# → added 5 packages, 1017 audited

npm run typecheck --workspace=@kartoteka/core          # 0 hiba
npm run typecheck --workspace=@kartoteka/ui-app        # 0 hiba
npm run typecheck --workspace=@kartoteka/offline-sync  # 0 hiba
npm run typecheck --workspace=@kartoteka/auth          # 0 hiba
npm run typecheck --workspace=@kartoteka/validations   # 0 hiba
```

A root `package.json` `workspaces: ["apps/*", "packages/*"]` — nincs módosítás szükséges, az npm auto-felismerte az új csomagokat.

### Konvenciók, amiket a skeleton dokumentumok rögzítenek

- **Use-case minta a `core`-ban**: `(input, ctx) → Promise<Result>`, ahol `ctx` tartalmazza a `supabase`, `runtime: 'web'|'desktop'`, `audit` mezőket. RLS a biztonsági alapréteg.
- **Komponens szabályok a `ui-app`-ban**: minden komponens kliens-oldali; adathívás csak `core` use-case-eken át; UI primitív `ui`-ból; validáció `validations`-ből; fájl I/O a jövőbeli `storage` package-en át.
- **Offline-sync kettős kilátás**: `StorageBackend` interface, web-en `DexieBackend`, desktopon `TauriSqliteBackend`. A Dexie import desktop oldalon **tilos** (M6.7 ESLint rule és tsconfig).
- **Auth szabály** (memory: `feedback_szerepkor_kiosztas`): kliens-oldali RBAC csak UI-védelem; az igazi védelem a Supabase RLS + SECURITY DEFINER fn-ek. Szerep-kiosztás csak admin/egyházkerületi admin joga, audit trail kötelező.

---

## M6.2 — 113-tábla RLS audit (SQL átadva Endrének)

**Cél:** feltárni minden `public` séma táblán, hogy RLS be van-e kapcsolva, vannak-e policy-k, és a Tauri roadmap szerinti modul-prioritás minden táblája védett-e. Ez **blokkoló előfeltétel** az M7+ modul-hullámokhoz.

### Az SQL fájl

**Hely:** [`migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql`](../../migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql)

**Csak SELECT, nem módosít semmit.** A fájl 6 riportot futtat egymás után:

1. **Teljes public-séma RLS overview** — minden tábla, dinamikusan a `pg_class`-ból
2. **Modul-priorizált audit** — 103+ tábla a 22 dashboard modulhoz + admin + publikus + system csoportokba rendezve, priority szerint (P0 → P3 → web-only → system)
3. **anon role engedélyek** — publikus SELECT-ek a privát táblákon (gyanús), automatikus kategorizálással
4. **Hiányzó policy-k** — RLS bekapcsolva, de 0 policy (minden tiltva)
5. **SECURITY DEFINER helper fn-ek** — `current_user_congregation_id`, `current_user_has_global_access`, `current_user_can_access_congregation`, `is_admin`, `same_congregation`, `is_owner` létének ellenőrzése
6. **Összefoglaló counter** — prioritásonként OK / WARN / FAIL szám

### Modul-táblahozzárendelés

A VALUES lista tényleges sémából olvasott táblaneveket használ (ellenőrizve `Database_schema.sql`-ből 2026-04-21-én, ~103 explicit tábla). Pl.:

- **P0 pénzügy** (22 tábla): `chitanta_tombok`, `oblio_fiokok`, `oblio_szamlak`, `oblio_kiadas_match`, `bankszamlak`, `bankszamla_nyito_egyenleg`, `befizetes`, `befizetescel`, `kiadas`, `kiadascel`, `kiadasikiseroiv`, `koltsegvetes`, `szamadasicel`, `jarulek_kedvezmeny`, `monetar`, `berleti_szerzodes`, `congregation_annual_fees`, `congregation_custom_fees`, `congregation_subscriptions`, `transactions`, `valuta_atert`, `nom_cimlet`
- **P0 tagnyilvántartás** (9): `szemely`, `csalad`, `gyerek`, `presbiter`, `csaladlatogatas`, `csoport`, `bekoltozott`, `elkoltozott`, `belsomozgas`
- **P0 anyakönyv** (7): `attert`, `kitert`, `keresztseg`, `konfirmalas`, `hazassag`, `temetes`, `felmentes`
- **P1** (~23): jegyzőkönyv (4), iktato (2), leltar (3), munkanapló (1), éves jelentés (2), profile (5), congregation (4), dashboard-egyházmegye (4), notifications (1), bealitas
- **P2** (6): sirhely (4), programs (2)
- **P3** (16+1): `mm_*` (16), support (1)
- **Web-only admin** (8): `access_requests`, `admin_access_requests`, `system_broadcasts`, `system_finance_costs`, `system_pricing_tiers`, `system_settings`, `licenses`, `user_devices`
- **Web-only publikus** (5): `public_sites`, `public_site_themes`, `public_posts`, `public_magazines`, `public_magazine_issues`
- **System / address / audit** (13): `adr*` (5), `nevnap`, `audit_log`, `logger`, `import_logs`, `document*` (3), `wizard_progress`

Ha egy hivatkozott tábla **nincs** a DB-ben (séma-drift), a riport kifejezetten jelzi: `🕳 Tábla HIÁNYZIK (séma-drift?)`.

### Blokkoló acceptance szabályok

- **P0 + P1**: `fail_rls_off = 0` ÉS `warn_no_policy = 0` ÉS `fail_missing = 0`
- **P2**: `fail_rls_off ≤ 2` (engedélyezett, de M12 előtt javítandó)
- **SECURITY DEFINER fn-ek**: mind `✅ OK`

Ha a riport nem elégíti ki ezeket, **M7 indítása blokkolva** — a hiányokat külön fix-migrációk orvosolják (pl. `2026-04-22-m6-2a-rls-fix-{tabla}.sql`).

### Futtatási utasítás (Endrének)

1. Supabase Studio → SQL Editor
2. Teljes fájl tartalma beillesztve, `Run`
3. A 6 riport az SQL Editor több outputjában jelenik meg (Result tabs)
4. A 6. összefoglaló sor táblázatosan mutatja priority-nként az OK/WARN/FAIL számokat
5. Az eredmény megosztása (screenshot vagy CSV export) → visszajön hozzám, az esetleges hiányokra **M6.2a fix-migrációk** készülnek

---

## Dokumentációs nyom (3 réteg, memory: `feedback_dokumentalj_mindent`, `feedback_changelog_mentes`)

- **Project log**: ez a fájl
- **CHANGELOG**: `docs/CHANGELOG.md` 2026-04-21 bejegyzés (külön blokk M6.1+M6.2-ről)
- **Obsidian AGY**: atomi jegyzet későbbi frissítésben (M6.2 riport eredménye után, mert az az igazi gondolat)

## Következő lépések (M6 fázis folytatása)

- **M6.2 riport eredmény** megvárása → `2026-04-22-m6-2a-rls-fix-*.sql` fájlok a hiányokra, ha kellenek
- **M6.3** — `/api/standalone/*` 6 route törlése + `next.config.ts` standalone konfig egyszerűsítése + `lib/standalone/` felülvizsgálata
- **M6.4** — Edge Function-ök: `supabase/functions/{oblio-oauth,oblio-invoice,mail-send,ai-chat}/` (secret-gateway)
- **M6.5** — Next.js 16: `middleware.ts` → `proxy.ts` átnevezés + 4 ESLint warning kijavítása
- **M6.6** — Desktop auth session Tauri keyring-be (`src-tauri/src/auth.rs` új modul, `auth_store_session`/`auth_read_session`/`auth_clear_session` command-ok)
- **M6.7** — Dexie import tiltása desktopon (`apps/desktop/tsconfig.json` + ESLint)
- **M6.8** — Offline orchestrator átemelése `apps/web/lib/offline/*` → `packages/offline-sync/src/*`

Ezek után kezdődik **M7 (Wave 1: Pénzügy)**.
