# Sprint A — Stabilitás + Dashboard triviális paritás

**Dátum**: 2026-04-25 (este, a v0.4.1 release után)
**Fázis**: post-v0.4.1 stabilitás — Endre 10 észrevételére adott válasz
**Kódolási ciklus**: ~3 óra (3 audit + 4 bug-fix + 3 új közös komponens + home-page refaktor)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A v0.4.1 release után Endre 10 konkrét észrevételt jelzett (sidebar/responzív/online-detect/SQLCipher/szövegkijelölés/dashboard-hiányosság/migrációs hiányosság). Ne találgassunk, hanem **elemezz és kérdezz** — alapelv. Három párhuzamos audit (Explore agent) feltárta a tüneteket és a fő kérdés választ adott: **40-45 nap** maradt a teljes desktop paritáshoz.

A Sprint A három részre bontva:
- **A1**: 3 UI/runtime bug fix (responzív centerelés, szöveg-kijelölés, session-üzenet wording)
- **A2**: SQLCipher gyökér-ok-fix → auto-recovery (a manual `Remove-Item` parancs élesben elfogadhatatlan volt)
- **A3**: Dashboard „Triviális" csoport portálása — `@kartoteka/ui-app/dashboard/` új réteg, desktop home-page bekötve

**0 funkcionális regresszió** terve — minden módosítás javítás vagy gazdagítás.

---

## 2. A1 — 3 gyors UI/runtime fix

| # | Fájl | Mit |
|---|------|-----|
| A1.1 | `packages/ui/src/layout/kartoteka-shell.tsx:138` | `<main>`-en belül az új `<div className="mx-auto w-full max-w-7xl">` wrapper — a tartalom most centerálva, max 1280px |
| A1.2 | `apps/desktop/src/index.css:34` | `* { user-select: none }` → csak `[data-tauri-drag-region]` lock — minden szöveg kijelölhető |
| A1.3 | `apps/desktop/src/lib/session-state.ts:54-57` | „csatlakozz a hálózatra" → „jelentkezz be újra a megújításhoz" — a refresh-token expiry helyes wording |

---

## 3. A2 — SQLCipher auto-recovery

| Fájl | Mit |
|------|-----|
| `apps/desktop/src-tauri/src/db.rs:125-200` | `open_and_migrate(app)` → `open_and_migrate_inner(app, allow_recovery: bool)` minta. Ha a sanity-check fail (pl. M2.2→M2.3 kulcs-séma váltás után, vagy sérült DB), automatikusan: (1) bezárja a connection-t, (2) régi DB-t átnevez `kartoteka.db.broken-<unix-ts>`-re (backup), (3) Credential Manager kulcs törlés, (4) retry egy tiszta DB-vel és új kulccsal. Végtelen-loop védelem: csak egyszer próbáljuk újra. |

**Hatás**: a felhasználónak **nem** kell PowerShell-paranccsal törölnie a `kartoteka.db` fájlt. Az `eprintln!` log fejlesztői célokra megmarad.

**Kockázat**: az auto-recovery csak akkor fut, ha a régi DB sanity-check fail-jel jön. Ha a DB jó volt, de utána sérülne valamilyen okból, a backup-fájl marad (manuális visszaállítás lehetséges).

---

## 4. A3 — Dashboard „Triviális" csoport portálás

### Új közös komponensek — `packages/ui-app/src/dashboard/`

| Fájl | Mit | Forrás |
|------|-----|--------|
| `HeroBannerScripture.tsx` | Üdvözlő gradient-banner napi igével és névnap-chippel | webes `apps/web/components/dashboard/hero-banner-scripture-v2.tsx` |
| `KpiCards.tsx` | 5 KPI-kártya (aktív tagok, családok, éves pénzforgalom, weboldal, prezentáció) | webes `apps/web/components/dashboard/kpi-cards.tsx` |
| `BottomStats.tsx` | 7 alsó demográfiai stat (férfiak, nők, gyermekek, átlagéletkor, fizetők, presbiterek, egyenleg) | webes `apps/web/components/dashboard/bottom-stats.tsx` |

**Stratégiai egyszerűsítés**: a komponensek **NEM fetch-elnek**, és **NEM használnak platform-specifikus helpereket** (Next.js Link, web-helperek). Minden adatot props-ban kapnak; a wrapper (web vagy desktop home-page) számolja ki és adja át. A `KpiCards` opcionális `onPublicSiteClick` és `onPresentationClick` callback-ekkel oldja meg a navigációt — ha hiányoznak (pl. desktop-on most), a kártya `cursor-default`.

`packages/ui-app/src/index.ts` — barrel-export bővítve a 3 új komponenssel.

### Desktop integráció — `apps/desktop/src/pages/home-page.tsx`

A korábbi 4 saját KPI-kártya + üdvözlő Card → most:
- `<HeroBannerScripture>` — fetch-eli a webes app `/api/daily-verse` endpointját (5s timeout, offline fallback Példabeszédek 3:5)
- `<KpiCards>` — desktop most az aktív tagok számát ismeri lokálisan; családok/pénzforgalom/weboldal 0 vagy „—" (Sprint B kalkulál)
- `<BottomStats>` — mind 0 / „—" most (Sprint B)

Megtartva: Gyors hozzáférés (3 modul-link), Fejlesztői állapot info-doboz.

A `KpiCard` és `formatRelativeTime` belső helper függvények eltávolítva (a közös komponens átveszi).

### Webes integráció

**Most NEM** — a webes `/dashboard/page.tsx` a meglévő, gazdagabb komponenseket használja (a régi pure-Next.js verziókat). Ha a 100% paritás-alapelv azt diktálja, hogy **mindkét platform a közös réteget használja**, a webet egy későbbi sprintben átállítjuk a `@kartoteka/ui-app` komponensekre, és átadjuk neki a saját adatait (ez 1-2 órás munka). De most a desktop hiánya volt a sürgető, nem fordítva.

---

## 5. Hatás és kockázat

- **Funkcionális változás (user-facing)**: a desktop home-page most **gazdagabb és közelebb áll a webes irányítópulthoz**. A KPI-számok (családok, pénzforgalom, demográfia) még 0/„—" — ez a következő sprint pillér.
- **TS-ellenőrzés + Vite build + Tauri rebuild**: Endre futtatja a Sprint végén (a 4 commit egyszerre).
- **Cargo újra-fordul**: a `db.rs` változás miatt 30-60 mp inkrementális Rust build (nem first-build).
- **Web build**: a `kartoteka-shell.tsx` változás csak desktopra hat; a web `KartotekaShell` import 0 helyen van.

---

## 6. Hátralévő lépések (Sprint B és C)

### Sprint B (4-6 óra) — Dashboard „Közepes" csoport
- Lokális `getLocalCsaladokCount()` utility a sync.ts-ben — családok-szám real-time
- Születésnapok widget (mai + 14 nap) — `szemely_local` szűrése `szuletes_dat`-ra
- Névnapok widget — naptári lookup + `nev_meanings` lokalizált adat
- Friss munkanapló-list widget (10 utolsó) — `munkanaplo_local` query
- BottomStats demográfiai kalkuláció — `szemely_local` GROUP BY nem + életkor

### Sprint C (5-7 nap) — Anyakönyv P0
- Web SQL séma elemzése (keresztelés, házasság, temetés táblák)
- `*_local` Rust-tábla generálás → új migráció a `apps/desktop/src-tauri/src/db.rs`-ben
- `@kartoteka/core/anyakonyv/` use-case-ek
- Desktop UI: `apps/desktop/src/pages/anyakonyv-*.tsx` + offline write-sync

---

## 7. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-A-stabilitas-dashboard-2026-04-25.md` ✅
- **Strukturált / user-facing**: `docs/CHANGELOG.md` — új bejegyzés a tetejére (lentebb a tartalma)
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Endre 10 észrevétele — diagnosztika és Sprint A válasz"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
