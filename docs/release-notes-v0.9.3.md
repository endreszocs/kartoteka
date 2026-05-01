# Kartotéka v0.9.3 — Sprint S · Vizuális egységesítés (csak web)

*2026-05-01 · Endre számára: a felhasználói visszajelzés nyomán a teljes
webes Kartotéka megjelenése igazodik a 3 témához.*

## Áldás!

A Sprint R csak a témákat (Csendes parókia / Kerített kert / Zsoltáros)
hozta el, de a teljes felület még a régi szürke/fehér színeken futott.
**Ez most megoldódott.** A webes Kartotéka **minden oldala** automatikusan
követi a választott témát — a kártyák radius-a, árnyéka, betűtípusai, info-
és státusz-jelzői mind cserélődnek.

A desktop appot ez nem érinti — a Sprint R v0.8.5 marad érvényben asztalon.

## Mit hoz a v0.9.3?

### 🎨 A 3 téma látható az egész felületen

A korábbi 289 komponens (a webes 78%-a) most **automatikusan átveszi a téma
színeit** egy globális CSS-overrides réteg révén. Konkrétan:

- **Csendes parókia**: 16px ívelt soft kártyák, mély kékeszöld sidebar,
  Cormorant Garamond serif címek, meleg krém háttér.
- **Kerített kert** *(alapértelmezett)*: 12px szögletes minimal kártyák,
  hűvös zöld paletta, Fraunces + Geist betűk, semleges háttér.
- **Zsoltáros**: 6px klasszikus kártyák, mély barna sidebar narancsos
  akcenttel, Roboto Slab címek, meleg krémes háttér.

### 📊 Dashboard widgetek témára igazítva

A dashboard kártyái (Aktív tagok, Családok, Pénzügy, Weboldal, Prezentáció,
Korelosztás, Közelgő alkalmak, Születésnapok stb.) ikonjai, gradient-jei,
blur-dekorációi mind a választott téma `--accent`/`--accent2` színeit
használják. A pénzügyi szemantika (zöld bevétel, piros kiadás, narancs
warning) **megmarad** — ezek nem cserélődnek, mert intent-jelzések.

### 🔐 Bejelentkező / regisztrációs oldal megújítva

Az `(auth)` route-csoport jobb-paneles hero-szakasza (Bibliai idézet,
Kartoteka logó) **téma-aware** lett — a `--sidebar` háttér színt és az
accent-overlay-eket használja. Mind a 3 téma alatt karakteres megjelenés.

### 🧱 Apró bug-fix

A keresőmezők `Input` komponensének focus-állapota fehérre váltott — sötét
módban szürke-szürke kontrasztot okozott. Most már a téma kártya-színét
használja (`--card`).

## Technikai részletek

### Új réteg: `packages/ui/src/utility-overrides.css`

Egyetlen CSS fájl, ami a `[data-theme="..."]` szelektorok alatt felülírja
a leggyakrabban használt Tailwind szín-osztályokat:

| Tailwind class | Csere a témára |
|---|---|
| `text-slate-{400,500}` (1605× összesen) | `var(--muted-foreground)` |
| `text-slate-{600,700,800,900}` (1521×) | `var(--foreground)` |
| `bg-white` (+ /60..96 átlátszó variánsok) (404×) | `var(--card)` + color-mix |
| `bg-slate-{50,100}` (386×) | `var(--muted)` |
| `border-slate-{100,200,300}` + `border-white` (395×) | `var(--border)` |
| `bg-{amber,emerald,sky,rose,violet,indigo,cyan,teal}-50` info-tinták | `color-mix(in oklab, var(--accent) 10%, var(--card))` |
| `text-{color}-{700,800,900}` info-szövegek | `color-mix(in oklab, var(--accent) 70%, var(--foreground))` |

A pénzügyi és státusz-intent színek (`text-emerald-500/600` bevétel,
`text-red-{400,500,600}` kiadás/hiba) **érintetlen** maradnak.

### Bővített téma-vars: `packages/ui/src/themes.css`

Minden 6 blokk (3 téma × light/dark) megkapta:
- `--radius-card`, `--radius-stat`, `--radius-mod`, `--radius-input`, `--radius-nav`
- `--shadow-card`, `--shadow-card-hover` (sötét módban erősebb)
- `--page-bg-overlay-1`, `--page-bg-overlay-2` (téma-szín radial gradient)
- `--h1-size`, `--h1-weight`, `--h1-spacing`, `--h3-size`, `--h3-weight`

### Custom class-ok refaktora: `packages/ui/src/kartoteka.css`

- `body` háttér — fix amber/teal helyett `var(--page-bg-overlay-1/2)`
- `card-raised`, `icon-raised`, `modal-input`, `page-shell` — mind a téma-vars-ok
- `:where([data-theme]) h1/h2/h3` — téma-serif font + méret/súly/space

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` (53 oldal) | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite, kontroll) | ✅ Zöld |

## A felhasználói panaszra adott válasz

> *"Alkalmazd a mellékelt design sablont a weboldal teljes felületére.
> A weboldal vizuális stílusa, színei, betűtípusai, gombjai, kártyái,
> térközei, ikonhasználata és elrendezése igazodjon a küldött sablonhoz."*

A v0.8.5-ben a sablon **infrastruktúrája** kész volt (témák, betűk, motívumok),
de a tényleges UI még a régi színeken futott. A v0.9.3 **minden modul** (24
dashboard, 53 webes oldal, 57 modal) megjelenését a sablonhoz igazítja —
**egyetlen utility-overrides rétegen keresztül**, kockázatmentesen, a meglévő
funkciókat változatlanul hagyva.

## Sprint T előjegyzés

- IncomeDialog (873s) port a `packages/ui-app/finance/`-ba (Sprint Q F3.2)
- Tauri-mini installer wrapper-app (Sprint R F6 halasztott)
- `feedback_modal_design_system` szabvány teljes 57-fájlos átszorítása

## Áldás kísérje a használatát!

*Soli Deo Gloria*
