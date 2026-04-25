# Sprint I — Sírhelyek READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint H után)
**Fázis**: Új modul desktop-paritás — temetők, parcellák, bérletek, elhunytak
**Kódolási ciklus**: ~1 óra (Rust v25 + sync.ts + új oldal + route)
**Státusz**: ✅ KÉSZ

---

## 1. Vezetői összefoglaló

A Sprint I a **Sírhelyek** modult hozza desktopra (READ-ONLY) — 4 mirror-tábla:
- `sirhelytemeto_local` (temető)
- `sirhely_local` (parcella)
- `sirhelyberles_local` (bérlet)
- `sirhelyelhunyt_local` (elhunyt)

**Speciális szempont**: a parcella/bérlet/elhunyt **NEM tartalmaz** `congregation_id` mezőt a Supabase sémában. A pull-stratégia ezért **layered**: először temetők, aztán parcellák a temető-FK-n, aztán bérletek + elhunytak a parcella-FK-n keresztül szűrve.

UI: **temető-szűrő** (pill-gombok) → **parcella-lista** (táblázat) → **kattintásra inline részletek** (bérletek + elhunytak két oszlopban).

Egyedi feature: **„Lejár 90 napon belül"** stat-kártya — a bérletek lejárati figyelő, narancs gradient kiemelés, ha van ilyen.

---

## 2. Új fájlok

### Rust v25 migráció
4 új tábla 8 indexszel. A FK-k `temetoid` és `sirhelyid` integerek. Az `aktiv` (temető) és `deleted` (mind4) INTEGER 0/1.

### TypeScript sync.ts
- 4 új interface (`CemeteryLocalRow`, `PlotLocalRow`, `RentalLocalRow`, `DeceasedLocalRow`)
- `CemeteryStats` (5 mező: cemeteries / plots / rentals / deceased / **rentalsExpiringSoon**)
- `pullCemeteriesOfOwnCongregation(userId)` — 4-rétegű pull
- `getLocalCemeteryStats(userId)` — 5 párhuzamos COUNT (EXISTS-szűrésekkel a join-okra)
- `getLocalCemeteries(userId)` — saját temetők
- `getLocalPlotsOfCemetery(temetoId)` — egy temető parcellái
- `getLocalPlotDetail(plotId)` — egy parcella bérletei + elhunytjai
- `getLastPullCemeteryIso(userId)`

### Desktop oldal — `apps/desktop/src/pages/sirhelyek-page.tsx`
~330 sor. PageHero + 5 stat-kártya + temető-pill-szűrő + parcella-táblázat (kattintható sorok inline-expand-elnek) + 2-oszlopos részlet (PlotRentals + PlotDeceased).

### Route — App.tsx
`/sirhelyek` → `<SirhelyekPage />`. Eddig PlaceholderPage volt.

### Bug fix benne
A `tbody`-n belül `<>` fragment + `key` nem működik React-ben — `<Fragment key={...}>` használata.

---

## 3. Architektúra-döntések

### Miért layered pull (és nem JOIN)?

A Supabase select-ekben a FK-on keresztüli `.in('temetoid', ids)` minta jól skálázódik egy gyülekezetre (max 5-10 temető × max 500 parcella × max 5 bérlet/elhunyt = max ~25 ezer sor). Egy SQL JOIN-szerver-oldali nehezebben kezelhető a Supabase RPC-keretben (külön RPC kéne).

### Miért inline-expand (és nem detail-page)?

A parcella kevés extra adatot tartalmaz (max ~5-10 bérlet és elhunyt). Inline-expand gyorsabb a navigációhoz: a lelkész végigmegy parcellákon kattintva, NEM kell route-váltás. A jegyzőkönyveknél a hosszabb tartalom miatt másik megközelítés jobb (külön oldal).

### Lejár 90 napon belül stat — miért 90?

Egy bérleti év végén a lelkészeknek időt kell adni a hosszabbításra/kapcsolatfelvételre. 90 nap = 1 negyedév előretekintés egészséges egyensúly. Nem 30 nap (túl rövid), nem 1 év (túl tág).

---

## 4. Hatás és kockázat

- Új modul, 0 regresszió.
- Új migráció v25: <100 ms.
- Cargo újra-fordul: hatodik fordulat ezen a session-ön.

---

## 5. Mai teljes desktop-paritás státusz

| Modul | Sprint | Státusz |
|-------|--------|---------|
| Tagnyilvántartás | M8 | ✅ Read+Write |
| Családok | M8.3 | ✅ Read+Write |
| Munkanapló | M7 | ✅ Read+Write |
| Pénzügy (5 oldal) | A-M7 | ✅ Read+Write |
| **Anyakönyv** (8 tábla) | C+D | ✅ READ-ONLY |
| **Leltár** | F | ✅ READ-ONLY |
| **Iktató** | G | ✅ READ-ONLY |
| **Jegyzőkönyvek** (4 tábla) | H | ✅ READ-ONLY |
| **Sírhelyek** (4 tábla) | I | ✅ READ-ONLY |
| Programok | — | dashboard widget, nincs önálló oldal |
| Missziós műhely | — | komplex, későbbre |
| Éves jelentés | — | komplex, statisztika-aggregátum |
| Publikus oldal admin | — | webes-only marad |

**5 új READ-ONLY modul** ma (Anyakönyv, Leltár, Iktató, Jegyzőkönyvek, Sírhelyek) = az adminisztratív teljes paritás zárva.

---

## 6. Hátralévő

- **Sprint E — Anyakönyv WRITE-flow** (5-7 nap, Claude Design eredménye után)
- **Sprint J+** — Leltár / Iktató / Jegyzőkönyvek / Sírhelyek WRITE-flow (a forms után)
- **Missziós műhely + Éves jelentés** READ-ONLY (komplex, több táblás)
- **Programok** dashboard widget desktop-paritása (egyszerű, 1 óra)
- **Egyházmegyei dashboard** desktop-paritás (komplex aggregátum)

---

## 7. Dokumentáció

- **Operatív** (ez a fájl) ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítve
- **Gondolati**: Notion → Kartotéka projekt napló-oldal: *„Sprint I — Sírhelyek és a layered FK-pull minta"*

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
