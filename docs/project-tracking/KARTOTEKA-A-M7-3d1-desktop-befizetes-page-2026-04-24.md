# A-M7.3d1 — Desktop befizetés oldal (`/penzugy/befizetes`)

**Dátum:** 2026-04-24
**Scope:** Az A-M7.3 kör első desktop UI-ja — teljes CRUD élet-ciklust megjelenítő oldal
**Státusz:** ✅ kész, online-only (offline az A-M7.3d2-ben)
**Kapcsolódó:** A-M7.3a/b/c (shared backend), A-M7.2 chitanta minta

---

## 1. Mit ad ma a lelkésznek?

A desktop alkalmazásban **ma új oldal jelent meg:** `/penzugy/befizetes` — a lelkész rögzítheti, listázhatja és rendezheti a gyülekezet bevételeit offline-os desktopról. A web-flow párhuzamos, ugyanazzal a backend-del (shared use-case-ek).

**Komplett flow:**

1. **Év-szűrő** a fejlécben (az aktuális + elmúlt 5 év közül)
2. **Új befizetés rögzítő form** — dátum, melyik évre, tag-kereső (diakritika-tolerans autocomplete), kategória-dropdown (~50 előre-definiált cél), összeg, típus (Készpénz / Banki), iratszám (automatikus vagy manuális), megjegyzés
3. **Lista szekció** az adott év 50 legfrissebb befizetésével (dátum-csökkenő); sztornózott sorok áthúzva
4. **Sztornó inline-panel** kötelező indoklással (min 5 char) — cascade a kapcsolt chitantákra és belső-mozgás párjára
5. **Soft-delete** gomb browser-confirm-mal
6. **Offline figyelmeztetés** — a form disabled-re kerül, a lelkész tudja, miért szünetel

**Magyar, pasztorális hangnem, reszponzív kártya-layout** — a chitanta-oldal mintájára.

---

## 2. Mi változott?

### 2.1 Új use-case — `listBefizetesCelekUseCase`

**Fájl:** `packages/core/src/finance/befizetes/list-cel.ts` (~60 sor)

- Zod séma: `befizetesCelRowSchema` (id, nev, nevro, aktiv, id_szamadasicel, belsotetel, parentid) + `listBefizetesCelekInputSchema` (csak `onlyActive?` flag)
- A `befizetescel` tábla ~50 soros listája — nem congregation-scope
- `onlyActive: true` default — az inaktív kategóriák csak admin-nézetben

Ez a 9. use-case a befizetés-körben, együttesen most **9 shared use-case + 9 web adapter** a befizetés-domain-en.

### 2.2 Új desktop oldal — `BefizetesPage`

**Fájl:** `apps/desktop/src/pages/befizetes-page.tsx` (~620 sor, inline komponensekkel)

Három fő sub-komponens:

**a) `BefizetesPage` (root)**
- Auth + congregation_id betöltés (ugyanaz a minta, mint a chitanta-page-en)
- Online/offline event-tracking
- Évszűrő state (default: aktuális év)
- Kategória-lista (celek) betöltése egyszer a mount-kor
- `refreshKey` state a lista újratöltéséhez a form success után

**b) `IncomeForm`**
- 8 mezős űrlap: dátum, fizetettev, tag-kereső, kategória, összeg, típus, iratszám, megjegyzés
- **Tag-kereső debounce-olva** (300 ms) a `searchMembersForFinanceUseCase`-zel
- Diakritika-normalizálás a core-ban (NFD)
- Max 8 találat, kattintható találati lista
- Kiválasztott tag zöld címkével, „Törlés" gombbal
- Iratszám auto-generálás Készpénz típusnál (onMount + fizetettev változás)
- Save: `saveIncomeUseCase` → `duplicateReceipt` flag speciális hibaüzenet
- Form-reset success után (dátum + kategória marad)
- Success-banner 5 mp-ig (a következő befizetés nehéz akkor áll, ha rögtön kezdené)

**c) `RecentIncomeSection`**
- `listIncomeUseCase`: év-szerinti fizetettev szűrő, 50 limit, sztornózottak áthúzva
- Sztornó és soft-delete gombok minden nem-stornózott soron
- **Inline sztornó-panel** — nem külön modal, hanem a sor alatt bővül
- Indoklás (min 5 char) + Mégse + Sztornó gombok
- Soft-delete: `window.confirm()` → `softDeleteIncomeUseCase`

### 2.3 Route bekötés

**Fájl:** `apps/desktop/src/App.tsx`

```tsx
<Route path="/penzugy/befizetes" element={<BefizetesPage />} />
```

**Fontos:** a sidebar-navigáció a `/penzugy`-ra irányítja a lelkészt, ami egyelőre PlaceholderPage-et mutat. A `/penzugy/befizetes` közvetlen URL-en vagy a jövőbeli submenü-linkkel érhető el. A sidebar-submenu (pénzügyi al-oldalak listázása) külön polish-lépés.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/core + validations) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error (2 felesleges import korábban, javítva) |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **35 fájl**, 0 tiltott |

**Nem tesztelt (funkcionális smoke):**
- E2E kattintgatás a `/penzugy/befizetes`-en (a dev-runtime a **következő Endre-ellenőrzés** része)
- Tag-kereső teljesítmény nagy gyülekezeten (1000+ szemely) — elméletileg 8-as limit + ILIKE-index
- Cascade-sztornó megjelenítése — a `StornoIncomeResult.cascadedChitantas` visszajelzés egyelőre nincs UI-n
- Soft-delete → lista-refresh: a törölt sor eltűnik a `includeDeleted: false` default miatt, de **visszahozni** jelenleg nincs UI (backend már tud, csak a toggle hiányzik)

---

## 4. Tervezési döntések

1. **Sztornó inline-panel, nem külön modal** — a lelkész nem veszti el a kontextust, a sor adatai felett van az indoklás-mező.

2. **Soft-delete browser confirm** — a destruktív műveletet nem modalbe tettük, mert ritkán használják (csak elírás/dupla-entry esetén). A confirm nyelve magyar, pontos.

3. **Tag-kereső debounce 300 ms** — a szerver ILIKE 2+ karakter után; gyors gépelés nem küld felesleges query-t.

4. **Cél-ID → név fallback** — ha a `listIncomeUseCase` join nem ad nevet (pl. nem található), a kliens-oldali `celNevById` map-ből visszatöltjük. Védelem az esetleges drift ellen.

5. **Év-szűrő mindig `fizetettev` szerint** — a lista-alapértelmezés; a `yearField: 'datum'` kliens-szűrő későbbi iteráció lehet.

6. **Nincs család-támogatás a form-ban** (egyszerűsítés) — `id_csalad: null` fixen. A tag-kereső vezeti a fő flow-t. A család-befizetés az A-M7.3d2 polish-körben lesz (getFamilyIdForPersonUseCase használatával).

7. **Iratszám auto-trigger** — amikor Készpénz típus VAGY fizetettev változik, ÉS a mező üres. Ha a user explicit módosította, nem írjuk felül.

---

## 5. Biztonsági szempontok

1. **Congregation-scope** minden hívásban explicit — `getLocalOwnProfile(userId).congregation_id` alapján
2. **RLS a szerver-oldalon** — az `auth` user JWT-je adja a scope-ot; az explicit `congregationId` gyakorlatilag a lokális cache-re támaszkodik
3. **Offline-disable** — a form submit-gomb és az input-ok disabled-re kerülnek offline-módban
4. **A core `saveIncomeUseCase` már zod-validálja az inputot** — a UI csak kliens-oldali pre-check-et ad (pozitív összeg, kategória kötelező)

---

## 6. Mi marad hátra — polish-lépések

### Közeli (A-M7.3d2 tervben)
- **Sidebar pénzügy-submenu** — a `/penzugy` link-kattintásnál al-lista: „Befizetés", „Chitanța kiállítás", „Nyugtatömbök", „Oblio-e-Factura" (később)
- **Család-támogatás a form-ban** — ha a tag családba tartozik, checkbox: „Család-szintű befizetés"
- **Cascade-visszajelzés a sztornó-siker után** — „1 chitanta és 1 belső-mozgás is sztornózva"
- **Nyílt sztornózás feloldás** („visszavonás") — jelenleg a sztornózott sor véglegesnek tűnik

### Hosszabb (A-M7.3d3)
- **Offline-capability** — a chitanta minta szerint: Rust v12 `befizetes_local` + `befizetescel_local` + pull-szink + outbox-push
- **Iratszám-wallet** analóg a chitanța-wallethez

### Jövőbeli (A-M7.4+)
- **Éves finance-view** (`initFinance` port) — bevétel-kiadás agregáció, kategória-breakdown
- **Excel-import batch** — a `saveIncomeBatch` port + UI
- **Kiadás (expense) kör** — a befizetés-kör tükörképe

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — **KELL** bejegyzés: ez az első user-facing desktop-UI a befizetés-körből
3. **Obsidian** — az A-M7.3 teljes kör (a-b-c-d1) záróakkordjaként atomic-note: „Desktop befizetés — CRUD oldal mintája"
