# Kartotéka v0.8.4 — Sprint R · Onboarding (csak web)

*2026-05-01 · Endre számára: új user flow webes bevezetőhöz.*

## Áldás!

A webes Kartotéka mostantól **4 lépéses bevezető wizard**-dal várja az új
felhasználókat. Egy nyugodt, képes flow vezeti végig az új lelkészeket az
első indítástól a tényleges használatig.

## Mit hoz a v0.8.4?

### 🌅 Onboarding wizard a webes oldalon

Az **`/onboarding` URL-en** elérhető 4 lépés:

1. **Üdvözöljük a Kartotékában** — meleg üdvözlés, templom kép balra,
   Mt 4,7 idézet alul.
2. **Gyülekezet beállítása** — gyülekezet név, egyházkerület, lelkipásztor
   előnézete (most még mock — a beállítás form-mezei a Sprint S-ben kerülnek).
3. **Adatok importálása** — Excel/CSV import drop-zone, „Tallózás" gomb.
4. **Kész vagyunk** — pipa-kör + „Belépés a Kartotékába" CTA → dashboard.

**A „Kihagyom" link** az 1-3. lépésen elérhető — egyetlen kattintással a
dashboardra ugorhatsz.

### 🎨 Téma-érzékeny

Az onboarding **azt a témát viseli**, amit a user kiválasztott (Csendes
parókia, Kerített kert vagy Zsoltáros) — minden szín, betűtípus, motívum
követi a választott stílust.

### 📋 A login és register vizuális redesign halasztva

A design-handoff `LoginScreen` komponense **Sprint S F1-re halasztva**. Indok:
a meglévő `LoginForm` és `RegisterForm` éles Supabase auth-flow-t tartalmaz
(signin, OAuth, session refresh, password validation, rate-limit). Vizuális
sebészete kockázatos lenne, és a felhasználói élmény szempontjából most
másodlagos. **Sprint S F1 külön foglalkozik vele, alapos teszttel.**

A jelenlegi login/register **változatlanul működik** és továbbra is azt használjuk.

### 💻 A desktop appot NEM érinti

Az onboarding csak a webes Kartotékában jelenik meg. A desktop appon a
session a webes bejelentkezésből érkezik (közös Supabase auth) — ott nincs
új flow.

## Technikai részletek

### Új komponens

- **`OnboardingScreen`** — body-pattern, `assetBase` + `onComplete` + `onSkip`
  + `initialStep` props. A `packages/ui-app/src/onboarding/`-ban él.
- **`ChurchSetupWidget`, `ImportWidget`** — beágyazott step-widget-ek
  (2. és 3. lépés mock-jai).
- **`OnboardArt`** — central illustration a 4 lépéshez (templom × 2,
  sugárzó Biblia, pipa-kör).

### Új útvonal

- **Web**: `/onboarding` (új `apps/web/app/onboarding/page.tsx`)
- **Asseteket**: `apps/web/public/onboarding/27-church.png` és
  `28-bible-rays.png` bemásolva.

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` (53 oldal) | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite) | ✅ Zöld |

## Sprint R hátralévő fázisai

| Fázis | Verzió | Tartalom | Státusz |
|---|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra | LEZÁRVA |
| ✅ F2 | v0.8.1 | Téma-választó GA | LEZÁRVA |
| ✅ F3 | v0.8.2 | Missziós Műhely home + desktop paritás | LEZÁRVA |
| ✅ F4 | v0.8.3 | Mikro-interakciók (Splash, Loading, Skeleton, page transition) | LEZÁRVA |
| ✅ F5 | **v0.8.4** | **Onboarding wizard (csak web)** | **LEZÁRVA** |
| F6 | v0.8.5 | Tauri-mini installer app (980×660 wizard) | hátra |

## Sprint S előjegyzés

- **Login/Register vizuális redesign** — a design-handoff `LoginScreen` portolása.
- IncomeDialog (873 sor) port a `packages/ui-app/finance/`-ba (Sprint Q F3.2).
- Tauri SQLite write flow + offline outbox.

## Áldás kísérje a használatát!

*Soli Deo Gloria*
