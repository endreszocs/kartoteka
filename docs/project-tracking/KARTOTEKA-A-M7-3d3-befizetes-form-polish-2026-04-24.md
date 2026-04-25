# A-M7.3d3 — Befizetés-oldal polish (család-szintű befizetés + sztornó cascade-visszajelzés)

**Dátum:** 2026-04-24
**Scope:** 4 UX-javítás a `BefizetesPage`-en — család-auto-detektálás, család-checkbox, cascade-visszajelzés, család-jelölő a listán
**Státusz:** ✅ kész
**Kapcsolódó:** A-M7.3d1 (alap befizetés-oldal), A-M7.3b (`getFamilyIdForPersonUseCase`), A-M7.3c (`cascadedChitantas` return)

---

## 1. Mit ad ma a lelkésznek?

Egy simább, napközben használható befizetés-oldal:

### 🆕 Család-szintű befizetés

Ha a kiválasztott tag családhoz tartozik (házas szülő VAGY gyerek), a form **automatikusan felajánlja** a kék keretes „Család-szintű befizetés" checkboxot. Bejelölve: a befizetés az egész családhoz rögzül (`id_csalad` kitöltve, `id_szemely` null, `csalad=true`).

Ha a tag nem tartozik családhoz, diszkrét szöveg: *„Ez a tag nem tartozik családhoz a nyilvántartásban — a befizetés tag-szintű lesz."*

A sikerbanner is jelzi: *„Befizetés rögzítve (iratszám: 42, összeg: 150 RON**, család-szintű**)."*

### 🆕 Sztornó cascade-visszajelzés

A sztornó siker után a lista-szekció fejlécében rövid (6 mp) zöld üzenet:

> **Befizetés sztornózva. Mellé: 1 chitanța is sztornózva + a belső kassza↔bank transfer párja is sztornózva.**

A lelkész most tudja, hogy mi történt háttérben — nem csak a fő sor, hanem a kapcsolt tételek is rendezve lettek. Ha nincs cascade, egyszerűen: *„Befizetés sztornózva."*

### 🆕 Család-jelölő a listán

A lista-sorokban a **`család`** kis kék label jelenik meg a tag-név mellett, ha a befizetés család-szintű. Így a lelkész rögtön látja, mi került tag-szintű és mi család-szintű fiókra.

---

## 2. Mi változott?

### 2.1 Család-auto-detekció — új `useEffect`

**Fájl:** `apps/desktop/src/pages/befizetes-page.tsx`

```tsx
useEffect(() => {
  if (!selectedTag) {
    setFamilyId(null)
    setIsFamilyPayment(false)
    setFamilyLookupDone(false)
    return
  }
  void (async () => {
    // getFamilyIdForPersonUseCase hívás
    // setFamilyId(result.familyId)
    // setFamilyLookupDone(true)
  })()
}, [selectedTag, userId])
```

- A `selectedTag` változáskor triggerel
- Cancellation védelem (ha a user gyorsan új tagot választ)
- Csendes fallback (a UI maximum „nincs család" feliratot mutat)

### 2.2 Család-checkbox + információs szöveg

A kiválasztott tag doboza alá:

- Ha `familyId !== null`: kék `input[type=checkbox]` + „Család-szintű befizetés" + explanatory text
- Ha `familyId === null`: italic „Ez a tag nem tartozik családhoz…" (visszajelzés, hogy a check tényleg lefutott)
- `familyLookupDone` gate: amíg a lookup fut, semmi nem látszik (nem villog)

### 2.3 Submit-logika frissítés

```tsx
const useFamilyMode = isFamilyPayment && familyId !== null
// ...
id_szemely: useFamilyMode ? null : selectedTag?.id ?? null,
id_csalad: useFamilyMode ? familyId : null,
```

Kölcsönös kizárólagosság a zod-sémában már biztosított — itt csak a helyes érték kitöltése.

### 2.4 Sztornó cascade-visszajelzés

```tsx
const cascadeParts: string[] = []
if (result.cascadedChitantas > 0) {
  cascadeParts.push(`${result.cascadedChitantas} chitanța is sztornózva`)
}
if (result.cascadedInternalTransfer) {
  cascadeParts.push('a belső kassza↔bank transfer párja is sztornózva')
}
const cascadeMsg = cascadeParts.length > 0
  ? `Befizetés sztornózva. Mellé: ${cascadeParts.join(' + ')}.`
  : 'Befizetés sztornózva.'
setStornoSuccessMsg(cascadeMsg)
setTimeout(() => setStornoSuccessMsg(null), 6000)
```

A `StornoIncomeResult.cascadedChitantas` és `cascadedInternalTransfer` mezők már megvoltak az A-M7.3c core use-case-ben — most csak a UI-n lettek hasznosítva.

### 2.5 Család-jelölő a listán

```tsx
{r.csalad && (
  <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
    család
  </span>
)}
```

A `BefizetesListRow.csalad: boolean` már léteztett (a zod-séma az A-M7.3a óta tartalmazta).

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 36 fájl, 0 tiltott |

**Kézi smoke-teszt (a következő Endre-check tárgya):**
- Tag kiválasztása → család-checkbox megjelenik (ha van család)
- Checkbox-ot bejelölve → rögzítés → lista sorban „család" címke
- Sztornó egy család-szintű befizetésen → cascade-üzenet

---

## 4. Tervezési döntések

1. **Auto-detekt UI-pattern** (nem explicit „Család kiválasztása" lista) — a lelkész nem akar plusz kattintani; a rendszer intelligensen felajánl.

2. **Családhoz-tartozás szöveges fallback** — fontos, hogy a user értse, miért NEM jön a checkbox. Nem néma hiba, hanem tanító.

3. **Cascade-üzenet rövid (6 mp)** — nem zavarja a sor-műveletet, de elég hosszú ahhoz, hogy elolvassa. A chitanta-stornó 4 mp volt, a befizetés-stornó informatívabb, ezért 6.

4. **Család-jelölő csak ikon-szerű** — nem egész sávot foglal el; a lista olvashatósága nem romlik.

5. **Nincs külön „szerkesztés" mód** — ha rossz a család-flag, a user sztornózza és újrarögzíti. A konzisztens minta a chitantával.

---

## 5. Mi marad hátra

A befizetés-form ma már napi-használatra kész. A következő polish:

- **Tag-szűrő a listán** (pl. „Kovács" tag-et keresve) — a `listIncomeUseCase` már támogatja (`szemelyId` paraméterrel), csak UI kell
- **Kategória-szűrő a listán** — ua.
- **Excel export** — a lista egy hozzá-rendelt gombbal
- **Éves összesítő kártya** — év-totál, kategória-breakdown

Ezek jövőbeli session-ök.

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — rövid user-facing bejegyzés (a család-checkbox és cascade-visszajelzés valós UX-javulás)
3. **Obsidian** — nem szükséges külön note, polish-jellegű változás
