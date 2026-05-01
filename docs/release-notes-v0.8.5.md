# Kartotéka v0.8.5 — Sprint R LEZÁRVA · Telepítő wizard UI

*2026-05-01 · Endre számára: a Sprint R · Vizuális megújulás záró release-e.*

## Áldás!

Ez a kiadás **lezárja a Sprint R · Vizuális megújulást**. A Windows-telepítőhöz
tervezett **modern wizard UI** elkészült — egyelőre fejlesztői előnézet
formájában, a tényleges telepítő wrapper-integráció Sprint S F2-be kerül.

## Mit hoz a v0.8.5?

### 🪟 Windows-telepítő wizard UI

A design-handoff szerinti **980×660 px modern telepítő wizard** elkészült
shared komponensként. 5 lépéses flow:

1. **Üdvözlés** — banner + „Üdvözli a Kartotéka telepítője" + Tovább gomb
2. **Licencszerződés** — végfelhasználói feltételek + „Elfogadom" checkbox
3. **Telepítés helye** — célmappa + Tallózás gomb + lemezterület-info
4. **Komponensek** — 6 opció (Mag, Sablon-csomag, Szinkron, PDF, Demo, Doksi)
5. **Telepítés** — animált progressbar + konzol-stílusú telepítési napló
6. **Befejezés** — pipa-kör + 3 utólagos opció

Windows 11 stílus: Segoe UI font, lapos ikonok, mély kékeszöld oldalsáv,
fehér tartalmi terület.

### 🔍 Desktop preview a `/dev/installer-preview`-en

A Kartotéka asztali appban a `/dev/installer-preview` URL-en megnyithatod
és kipróbálhatod a wizard UI-t — fejlesztői előnézet, a tényleges
telepítési flow még nem kötött.

### 🛑 A teljes Tauri-mini installer wrapper Sprint S F2-be

A design-spec szerinti teljes szétválasztás (külön Rust + Vite + Tauri
mini-app, ami a fő NSIS-t silent módban indítja) komoly extra munka:
új workspace, build-pipeline integráció (`release-build.ps1` bővítés),
sign-flow, Supabase Storage upload. **Ez Sprint S F2-be kerül**, akkor
egyben a teljes telepítő-élmény átépítésével.

A jelenlegi NSIS bundle **változatlanul működik** — minden friss telepítés
és auto-update a meglévő pipeline-on át megy.

## Technikai részletek

### Új komponens

- **`InstallerWizard`** — body-pattern, `initialStep` + `logoSrc` + `version`
  + `onFinish` + `onCancel` props. A `packages/ui-app/src/installer/`-ben él.
- **6 belső step-komponens** — `InstallerWelcome`, `LicenceBody`,
  `DestinationBody`, `ComponentsBody`, `ProgressBody`, `InstallerFinish`.
- **`WinButton`** — Windows 11 stílusú gomb primary/secondary/disabled
  variánsokkal.

### Új CSS keyframe

- `kt-caret` — blink kurzor a ProgressBody konzol-megjelenítéséhez.

### Új útvonal

- **Desktop**: `/dev/installer-preview` (új `apps/desktop/src/pages/installer-preview-page.tsx`)

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite) | ✅ Zöld |

## 🏁 Sprint R · Vizuális megújulás összefoglaló

| Fázis | Verzió | Tartalom |
|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra (3 téma SSOT, 5 betűcsalád, 7 motívum) |
| ✅ F2 | v0.8.1 | Téma-választó GA (ThemePicker shared, Beállítások › Megjelenés) |
| ✅ F3 | v0.8.2 | Missziós Műhely home (MissionWorkshop + 7 részkomp + 18 design asset) |
| ✅ F4 | v0.8.3 | Mikro-interakciók (Splash + Loading + Skeleton + PageTransition + 7 keyframe) |
| ✅ F5 | v0.8.4 | Onboarding wizard csak web (`/onboarding` 4 lépés) |
| ✅ F6 | **v0.8.5** | **Telepítő wizard UI + `/dev/installer-preview`** |

**6 verzió × ~470-870 soros komponens-fájlok = jelentős vizuális megújulás
mind weben, mind desktopon.** A táblázatok elrendezése változatlan maradt
— csak a színek, fontok, motívumok és landing-szakaszok kapták meg az
új design-nyelvet.

## Sprint S előjegyzés

- **F1**: Login/Register vizuális redesign (`screens.jsx` LoginScreen portolása)
- **F2**: Tauri-mini installer wrapper-app + `release-build.ps1` integráció
- **F3**: IncomeDialog (873 sor + 10 callback) port a sharedba (Sprint Q F3.2)
- **F4+**: Tauri SQLite write flow + offline outbox

## Áldás kísérje a használatát!

*Soli Deo Gloria*
