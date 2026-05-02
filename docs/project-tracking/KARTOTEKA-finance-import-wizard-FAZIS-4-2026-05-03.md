# Pénzügyi Import Wizard — Fázis 4 (Wizard UI 1-3. lépés)

**Dátum**: 2026-05-03
**Verzió**: v0.9.45 → v0.9.45 (még nincs verzió-bump)
**Sprint**: nincs

## Cél

Az első wizard UI a Kartotéka pénzügyi import wizard-jához. A v1-ben az 1-3.
lépés él (forrás-típus, sheet-választás, oszlop-mapping), a 4-9. placeholder
"Itt tartunk a fejlesztésben" panelt mutat. **Élesben már látható** —
`/admin/finance-import` URL-en a god-mode aktiválása után megnyílik.

## Mit hoztunk létre

### 1. Step komponensek
**Új mappa**: `apps/web/components/finance/finance-import/steps/`

- [`source-type-step.tsx`](../apps/web/components/finance/finance-import/steps/source-type-step.tsx) —
  4 forráskártya (Kassza aktív, többi "Hamarosan" badge-dzsel szürkítve), drag-drop fájl-feltöltő
- [`sheet-pick-step.tsx`](../apps/web/components/finance/finance-import/steps/sheet-pick-step.tsx) —
  fájl-info + sheet-lista (csak Kassza választható), Vissza/Tovább, hibajelzés ha nincs Kassza
- [`column-mapping-step.tsx`](../apps/web/components/finance/finance-import/steps/column-mapping-step.tsx) —
  Excel fejléc → DB virtuális mező mapping táblázat, auto-suggestion + felhasználói override,
  3 stat (felismert / kihagyott / hiányzó kötelező), profil-tippek listája

### 2. Wizard orchestrator
[`penzugy-import-wizard.tsx`](../apps/web/components/finance/finance-import/penzugy-import-wizard.tsx):

- 9-lépéses állapotgép (a v1-ben 1-3 él, 4-9 placeholder)
- 8 lépés-csíkos `WizardStepper`
- `PageHero` brand-fejléccel ("Pénzügyi adatok importálása")
- `useTransition` a fájl-parsing alatt
- Auto-pick: ha pontosan egyetlen Kassza-fül van, automatikusan kiválasztja
- Toast feedback hibás esetekre

### 3. Admin oldal
[`apps/web/app/(dashboard)/admin/finance-import/page.tsx`](../apps/web/app/(dashboard)/admin/finance-import/page.tsx):

- A meglévő `admin/import/page.tsx` mintáját követi
- `AdminPageHeader` Wallet ikonnal, emerald-teal gradienssel
- `getGodModeStatus()` ellenőrzés — csak god-mode aktív állapotban kapcsol be
- Egyébként pasztorális üzenet: "Aktiváld a rendszergazdai módot..."

### 4. CTA a pénzügy oldalon
[`apps/web/components/finance/finance-tabs.tsx`](../apps/web/components/finance/finance-tabs.tsx):

- A Pénzügy header gomb-sorába egy új "Adatok importálása" link
- **Csak `isGodMode === true`** esetén látható
- A `/admin/finance-import` oldalra navigál (Next.js Link)

## 3-build verifikáció (mind zöld 2026-05-03)

- `npm run typecheck --workspace=@kartoteka/ui-app` ✅
- `npm run build --workspace=@kartoteka/web` ✅ (67 oldal, +1 új /admin/finance-import)
- `npm run build --workspace=@kartoteka/desktop` ✅ (5.87s)
- 74/74 smoke teszt zöld

## Trade-off-ok és tanulságok

| Kérdés | Választott út | Indok |
|---|---|---|
| Wizard scope a v1-ben | 9 stage, 1-3. UI él, 4-9 placeholder | A felhasználó láthatja a teljes roadmap-et, és nem érzi befejezetlennek |
| `Button asChild` | Sima `<Link>` Tailwind class-szal | A projekt `Button` komponense nem támogatja az `asChild` propot |
| `PageHero` API | `Icon` (NEM `icon`), `description` (NEM `subtitle`) | A `@kartoteka/ui-app` PageHero interfész |
| Forrástípus választó UI | "Hamarosan" badge a v2 kártyákon | Endre láthatja a tervet, és tudja hogy XML/Bank A/B várható |
| File-validáció szűkebb | csak `.xlsx`, `.xls` | A Kassza-import egyértelműen Excel — a CSV/XML zavaró lenne |
| 4-9. lépés placeholder szöveg | Pasztorális magyar üzenet | `feedback_lelkesz_informalas` szerint nincs néma hiba |

## Mi következik (Fázis 5)

A "Itt tartunk a fejlesztésben" panel helyett:

1. `kassza-split-step.tsx` — sor-szétválasztás 4 csoporttal
   (income/expense/internal-transfer/skip), sor-szintű override
2. `budget-code-step.tsx` — kód-mapping táblázat (csak meglévő befizetescel/kiadascel)
3. `donor-resolve-step.tsx` — befizető-feloldás + manuális keresés ambiguous esetekhez

A Fázis 5-re a wizard a 6. lépésig megy, de még nem importál — Fázis 6
zárja le az `executeFinanceImport`-tal és a result-step-pel.
