# A-M7.1c — Desktop `/penzugy/chitanta-tombok` oldal (első end-to-end pénzügyi flow)

**Dátum:** 2026-04-22
**Fázis:** A-M7.1c (chitanta_tombok desktop UI — az A-M7.1a + A-M7.1b lezárása)
**Státusz:** ✅ Kivitelezve + verifikálva (TS 0 error, import-check tiszta 28 fájl)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért

Az A-M7.1a (read-only use-case) és A-M7.1b (write use-case + SQL trigger) után az **első end-to-end pénzügyi flow** a Tauri desktopon. Minden réteg a helyén van:
- Rust SQLite (v9 migráció, `chitanta_tombok_local`)
- TauriSqliteBackend (A-M7.0)
- Core use-case-ek (list + create)
- Zod validációk
- SQL migráció szerver-oldali `revision` + trigger (Endre futtatta)

## Mit csináltunk

### 1. Új oldal — `apps/desktop/src/pages/chitanta-tombok-page.tsx`

Egy fájl, ~430 sor, minden funkció benne:
- **Fejléc** + "Frissítés" és "Új tömb" gombok
- **SourceBadge** — a lelkész mindig tudja, honnan jön az adat:
  - 🟢 Friss szerveradat — "X tömb, éppen a Supabase-ből szinkronizálva"
  - 🟠 Lokális gyorsítótárból — "X tömb. A szerver most nem érhető el; a következő hálózati csatlakozáskor frissül"
- **Success banner** — új tömb rögzítése után 4 mp-ig
- **Error banner** — lista-hiba esetén
- **Empty state** — barátságos magyarázat + "Első tömb rögzítése" CTA
- **Kártya-rács** (sm:2, lg:3 oszlopos):
  - `ChitantaTombCard` komponens — seria + szám-tartomány, tömb-szám, vásárlás dátuma, StatusPill (Aktív / Kevés / Elfogyott / Lezárt), összesen / felhasznált / maradék (kiemelt szín), következő szám, megjegyzés
- **Inline CreateChitantaTombForm** — seria, tömb-szám, szám-kezdet, szám-vég, vásárlás-dátum (default ma), vásárlás-ár, megjegyzés + pasztorális hibaüzenetek

### 2. Routing — `apps/desktop/src/App.tsx`

Új route-hozzáadás: `/penzugy/chitanta-tombok` → `<ChitantaTombokPage />` az `AuthGate` mögött.

### 3. Core use-case hívások (minta-pattern)

**Listázás**:
```ts
const result = await listChitantaTombokUseCase(
  { congregationId },
  { supabase, storage: getTauriSqliteBackend(), runtime: 'desktop' },
)
if (result.success) {
  setRows(result.rows)
  setSource(result.source)  // ← 'supabase' | 'local'
}
```

**Létrehozás**:
```ts
const result = await createChitantaTombUseCase(
  { congregationId, seria, block_nr, szam_kezdet, szam_veg, vasarlas_datuma, vasarlas_ara, megjegyzes },
  { supabase, storage: getTauriSqliteBackend(), runtime: 'desktop', userId },
)
if (result.success) onSuccess(result.row)
else setError(result.error)
```

A `ctx.storage` itt a `getTauriSqliteBackend()` — a core use-case **maga** kezeli a SQLCipher-cache frissítését online-siker után.

## Informálási alapelv (feedback_lelkesz_informalas.md) — tételes ellenőrzés

| Kötelező pont | Megoldás |
|---|---|
| Loading state | Spinner + "Tömbök betöltése…" |
| Success state | Zöld banner 4 mp-ig: "Az új tömb (EREKC24 100-120) elmentve" |
| Error state | Piros banner pasztorális magyar üzenettel |
| Offline-state | Narancs SourceBadge magyar magyarázattal |
| Sync-státusz | Fejlécben SessionStatusIndicator (A-M6.9 óta), kártya-szinten a SourceBadge |

## Verifikáció

```bash
# TS
cd apps/desktop && npx tsc --noEmit                   # 0 error

# Desktop banned-imports (A-M6.7)
node scripts/check-desktop-banned-imports.mjs         # ✅ 28 fájl, 0 tiltott
```

A tényleges futtatáshoz (`npm run desktop:dev`):
1. Login → HomePage
2. Navigáció közvetlenül a `/penzugy/chitanta-tombok` URL-re (a sidebar-link még nincs; A-M7.2-ben kerül be)
3. Online: SourceBadge 🟢 — új tömb rögzítés Supabase-be + lokális cache
4. Offline: SourceBadge 🟠 — lokális cache olvasás; create form most **online-kötelező** (a true-offline outbox a sync-orchestrator után jön, A-M7.x)

## Mi NEM volt scope-ban

- **Sidebar-link** "Pénzügy → Nyugtatömbök" — a menü-struktúra külön, a 22-modulos dashboard navigáció része
- **Kártya-szintű edit/delete** — a `closeChitantaTombUseCase` az A-M7.1b2-ben jön, edit a A-M7.1b3-ban
- **True offline-write** — az outbox-enqueue: a sync-orchestrator shared-re költöztetésével érkezik (A-M7.x)
- **Aktív tömb státusz-panel** (a Supabase `getActiveChitantaTombStatus` Server Action shared verziója) — A-M7.2

## Kapcsolódó fájlok

- [`apps/desktop/src/pages/chitanta-tombok-page.tsx`](../../apps/desktop/src/pages/chitanta-tombok-page.tsx) (új, ~430 sor)
- [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx) (+ import + route)

## Az A-M7.1 teljes kör lezárva

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.1a | List use-case + Rust v9 migráció + web adapter | ✅ |
| A-M7.1b | Create use-case + SQL revision/trigger + web adapter | ✅ |
| A-M7.1c | Desktop end-to-end oldal (ez a dokumentum) | ✅ |

Első E2E pénzügyi flow a Tauri desktopon kész. A minta minden további pénzügyi use-case-hez ugyanaz — csak új zod + új core fájl + (esetleg Rust migráció új táblához) + új web adapter + új desktop route/section.

## Következő lehetőségek

- **A-M7.1b2** — `closeChitantaTombUseCase` + `createChitantaTombokBatch` (kerületi többes-tömb átvétel)
- **A-M7.2** — `getActiveChitantaTombStatus` shared + chitanta-kiállítás (701 soros Server Action refaktor)
- **A-M7.3** — Többi pénzügyi Server Action (bank-import, tva, tartozas, oblio-*, finalization, monetary — 12 fájl)
