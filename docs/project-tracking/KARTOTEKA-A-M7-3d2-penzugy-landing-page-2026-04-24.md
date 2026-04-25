# A-M7.3d2 — `/penzugy` landing oldal (al-modul választó kártyák)

**Dátum:** 2026-04-24
**Scope:** A sidebar „Pénzügy" link-kattintás után ma már nem PlaceholderPage jön, hanem egy kártyás almodul-választó. A napi indulópont a pénzügyi flow-hoz.
**Státusz:** ✅ kész — triviális polish, de user-facing érték
**Kapcsolódó:** A-M7.2 (chitanța-kör), A-M7.3a/b/c/d1 (befizetés-kör)

---

## 1. Mit ad ma a lelkésznek?

Eddig a sidebar „Pénzügy" link a `PlaceholderPage`-et mutatta — „Hamarosan" üzenetet. Ma egy **élő oldal** nyílik meg 3 kártyával:

1. **Befizetés rögzítése** (🟢 Új badge) — `/penzugy/befizetes`
2. **Chitanța kiállítása** — `/penzugy/chitanta`
3. **Nyugtatömbök** — `/penzugy/chitanta-tombok`

Plusz egy „Hamarosan" szekció a közeljövő funkciókról:
- Bank-import
- Oblio / e-Factura
- TVA-plafon figyelő
- Éves pénzügyi áttekintés

---

## 2. Mi változott?

### 2.1 Új oldal — `PenzugyLandingPage`

**Fájl:** `apps/desktop/src/pages/penzugy-landing-page.tsx` (~150 sor)

- 3 modul-kártya `MODULES` array-ben (konfiguráció-szerű — könnyen bővíthető)
- Minden kártya:
  - Ikon (Banknote / ReceiptText / BookOpenCheck) színes `icon-raised` keretben
  - Opcionális státusz-badge (pl. „Új")
  - Cím (font-heading)
  - Leírás (1-2 mondat a lelkésznek)
  - „Megnyitás →" CTA a kártya alján
  - Hover-effekt: enyhe scale + shadow
- `useNavigate` a React Router v7-hez
- Reszponzív rács: `sm:grid-cols-2 lg:grid-cols-3`
- „Hamarosan" szekció — jelzi, mi tartozik még a pénzügy-körbe

### 2.2 Route frissítés

**Fájl:** `apps/desktop/src/App.tsx`

```tsx
<Route path="/penzugy" element={<PenzugyLandingPage />} />
<Route path="/penzugy/befizetes" element={<BefizetesPage />} />
<Route path="/penzugy/chitanta" element={<ChitantaPage />} />
<Route path="/penzugy/chitanta-tombok" element={<ChitantaTombokPage />} />
```

A `/penzugy` most a landing-et mutatja; a PlaceholderPage csak a wildcard `*` route-ra esik (nem definiált pénzügyi almodulok).

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **36 fájl**, 0 tiltott |

---

## 4. Tervezési döntések

1. **Kártya-alapú UI, nem submenu a sidebar-ban** — a submenu-hoz módosítani kellene a `@kartoteka/ui` `KartotekaShell`-t, ami mindkét platform-ot érinti. A landing-page csak desktop-specifikus, semmi további breakage.

2. **A sidebar-link változatlan (`/penzugy`)** — a web-app is ugyanarra navigál, csak ott egy másik oldalt lát a user. Később (ha a submenu bejön, vagy a web-app is landing-page-et kap), konszolidálhatjuk.

3. **„Hamarosan" szekció** — feedback_lelkesz_informalas alapelv: a lelkész tudja, mit várhat még. Nem csak „ez van ma", hanem „ez lesz még".

4. **A kártya-badge „Új"** a befizetésen — gyors ráirányítás az új funkcióra; 1-2 hónap múlva eltűnik.

5. **`card-raised` + `icon-raised` class-ek** — a design system konzisztensen tartja a desktopon is a prémium look-ot, ahogy a HomePage és a Dashboard.

---

## 5. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — rövid user-facing bejegyzés (a landing-page látható)
3. **Obsidian** — nem szükséges külön note: a polish jellegű változás, az A-M7.3 kör záróakkordjához csatolva
