# Kartotéka v0.7.6 — Pénzügy almenü a sidebarban

## ✨ Új a sidebarban: kibontható Pénzügy almenü

A baloldali navigáció **Pénzügy** menüpontja mostantól egy kis chevron-nal
(▶) megjelölve kibontható, és minden pénzügyi oldal egy kattintással elérhető.

**Hogy működik:**

- **A Pénzügy ikonra kattintva** → a /penzugy főoldalra navigálsz (ahogy eddig).
- **A jobb oldali kis chevron-ra kattintva** → kibontódik az almenü a 7
  pénzügyi oldallal (Áttekintés, Bevétel, Kiadás, Belső mozgás, Nyugta,
  Nyugtatömbök, Bank import). Még egyszer rákattintva becsukódik.
- **Automatikusan kibontva indul**, ha épp egy pénzügyi oldalon vagy.
- **Az aktív oldal kiemelve** jelenik meg az almenüben (világos színnel,
  bold-dal és világos pötty-jelölővel).
- **Vékony függőleges vonal** mutatja a hierarchiát a sub-itemek mellett.

## 📌 Felhasználói szempontból

A frissítés tisztán pluszt ad — a meglévő navigáció változatlan, csak
gyorsabb lesz az átugrálás a pénzügyi oldalak között:

- Korábban: Pénzügy menüpont → Áttekintés oldal → bal oldalon kártya-választó
  → kattintás Bevétel kártyára → Bevétel oldal (3 kattintás).
- Most: Sidebar Pénzügy → kibont → Bevétel sub-item → Bevétel oldal (2
  kattintás).

A frissítés UI-feladatokon **nem hoz változást** — minden gomb, lista,
form ott van, ahol eddig.

## 🌐 Webes verzió is bővült

A webes /penzugy oldalon a 11 fül (Áttekintés, Kassza, Bank, Tranzakciók,
Költségvetés, Számadás, Tartozások, Bérleti, Monetár, Oblio, Súgó) szintén
elérhető a sidebar Pénzügy almenüjéből, hash-alapú navigációval
(`/penzugy#cashbook` stb.). Az aktív fül megőrződik újratöltéskor is.

## 🔧 Műszaki háttér

- `MenuItem.children?: MenuItem[]` modell — kibontható almenü támogatás.
- `KartotekaSidebar` (közös) + `SidebarAdaptiveV4` (webes saját) párhuzamos
  bővítés — új ALAPELV: minden feature MINDKÉT platformra egyszerre.
- Hash-listener a `finance-tabs.tsx`-ben — `useEffect` mount + `hashchange`
  event.
- 3 build zöld: ui (tsc), web (Next.js 16 webpack, 51 oldal), desktop
  (lint + tsc + vite).

---

Részletek: `docs/CHANGELOG.md`
