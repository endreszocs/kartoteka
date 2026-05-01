# Kartotéka v0.8.3 — Sprint R · Mikro-interakciók

*2026-05-01 · Endre számára: a betöltések, indítás és oldalváltások UX-finomítása.*

## Áldás!

Ez a kiadás **finomabbá, simábbá** teszi a Kartotéka érzetét. A desktop appnál
indításkor megjelenik a logós **Splash képernyő**, az oldalak között **lágy
áttünés** van, és a hosszan töltődő részekhez **Skeleton-vázak** készültek.

## Mit hoz a v0.8.3?

### 🌅 Splash képernyő indításkor (desktop)

A Kartotéka asztali app indításakor 1.5 másodpercig megjelenik egy **Splash
képernyő**: a választott téma mély színével (sidebar-háttér), a Kartotéka
logóval (lágy pulzálás), márkanévvel és „Adatok szinkronizálása…" szöveggel.
Az alkalmazás a háttérben már mountol és tölt — a Splash csak overlay,
így a tényleges indulási idő nem nőtt meg.

**Téma-érzékeny**: ha Csendes parókia van beállítva, a Splash mély kékeszöld;
Kerített kertnél sötét zöld; Zsoltárosnál mély barna. Mindhárom harmonikus.

### 🌫 Page transition — lágy áttünés a webes oldalak között

A web Kartotékában mostantól **minden oldalváltás** során a tartalom
**fade + translateY + blur** kombinációval jelenik meg (420ms, lágy
`cubic-bezier(.2, .7, .2, 1)` görbével). Nem törő, nem agresszív — finom.

### 💀 Skeleton-vázak (előkészítve)

A `packages/ui-app` mostantól tartalmaz **Skeleton-komponenseket** (`SkeletonCard`,
`SkeletonRow`, `SkeletonTable`, `Skeleton`) shimmer-animációval. A modulok
fokozatosan átállnak ezekre a Suspense fallback helyén — a v0.8.3-ban még
csak az infrastruktúra készült el, a tényleges használat a következő release-ekben
jön.

### ⏳ Loading + DelayedLoading

A `LoadingScreen` egy full-screen loading állapot Spinner-rel (Calvin-csillag
vagy ring) és opcionális lépéses checklist-tel — alkalmas hosszú lekérdezések
maszkolására. A `DelayedLoading` csak >800ms után jelenik meg (UX best practice
— rövid lekérdezésnél ne villogjon).

## Technikai részletek

### Új komponensek a `@kartoteka/ui-app`-ben

- `SplashScreen`, `LoadingScreen`, `DelayedLoading`
- `Skeleton`, `SkeletonCard`, `SkeletonRow`, `SkeletonTable`
- `IndeterminateBar`, `ProgressBar`
- `CalvinSpinner`, `RingSpinner`
- `PageTransition`

### CSS keyframes (a `packages/ui/src/kartoteka.css`-ben)

7 új keyframe + 6 utility class:
- `kt-fade-in`, `kt-page-enter`, `kt-shimmer`, `kt-spin`, `kt-pulse`,
  `kt-progress-bar`, `kt-slide-up`, `kt-pop`

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` (52 oldal Next.js webpack) | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite) | ✅ Zöld |

## Sprint R hátralévő fázisai

| Fázis | Verzió | Tartalom | Státusz |
|---|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra | LEZÁRVA |
| ✅ F2 | v0.8.1 | Téma-választó GA | LEZÁRVA |
| ✅ F3 | v0.8.2 | Missziós Műhely home + desktop paritás | LEZÁRVA |
| ✅ F4 | **v0.8.3** | **Mikro-interakciók (Splash, Loading, Skeleton, page transition)** | **LEZÁRVA** |
| F5 | v0.8.4 | Onboarding & Auth (csak web) | hátra |
| F6 | v0.8.5 | Tauri-mini installer app (980×660 wizard) | hátra |

## Áldás kísérje a használatát!

*Soli Deo Gloria*
