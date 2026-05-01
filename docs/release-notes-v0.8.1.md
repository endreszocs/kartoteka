# Kartotéka v0.8.1 — Sprint R · Vizuális megújulás (1. kiadás)

*2026-05-01 · Endre számára: a Sprint R első élesedő release-e — két fázis (F1 +
F2) összevonva.*

## Áldás!

Ez a kiadás **látható változásokat** hoz a felhasználói felületen, és egyben
megnyitja az utat a **vizuális megújulás** előtt. A fő újítás: a Beállítások
alatt mostantól **3 különböző stílusban** is használhatod a Kartotékát.

## Mit hoz a v0.8.1?

### 🎨 Téma-választó a Beállítások › Megjelenés alatt

Mostantól három, egymástól markánsan különböző **vizuális téma** közül választhatsz:

- **Csendes parókia** — meleg, lelkipásztori; Cormorant Garamond serif címek,
  mély kékeszöld oldalsáv. A nyugodt, klasszikus szépség kedvelőinek.
- **Kerített kert** *(alapértelmezett)* — modern, tiszta SaaS-jellegű paletta;
  Fraunces és Geist betűk, hűvös zöld árnyalatok. Az új alapértelmezett.
- **Zsoltáros** — klasszikus, méltóságteljes; Roboto Slab címek, mély barna keret
  narancsos akcenttel. Aki a könyvszerű ritmust szereti.

A választás azonnal érvénybe lép, minden megnyitott fülön szinkronizál, és a
következő bejelentkezésnél is megmarad. Ha másik eszközön is megnyitod a
Kartotékát, ott külön választhatsz — a beállítás eszközhöz kötött.

### 🌓 Sötét/világos mód külön választható

A téma stílusa és a sötét/világos mód **két különálló beállítás** lett — bármelyik
téma bármelyik módban használható. A meglévő „Téma" szekció új neve:
**Sötét/világos mód**.

> **A táblázatok szerkezete változatlan** marad minden témánál — csak a színek,
> fontok és kártya-keretek követik a választott stílust. A nyilvántartások
> megszokott elrendezése pontosan ugyanaz marad.

### 📋 A választás megőrzése

A téma-választást a böngésződben (web) és a Kartoteka desktop app-on belül
**lokálisan tároljuk** — egyik eszközről a másikra nem ugrik át automatikusan.
Ha minden eszközödön ugyanazt a stílust szeretnéd, választd ki külön mindenhol.

## Technikai részletek (a karbantartónak)

### Új komponensek

- **`ThemePicker`** — body-pattern, 3 preview-kártya mini sidebar-ral,
  accent-swatch-csal, font-mintával. Web és desktop egyaránt használja.
- **`ThemeStyleProvider` + `useThemeStyle()`** — perzisztens választás
  `kartoteka-theme-style-v1` localStorage kulcson; cross-tab szinkron (storage event);
  `<html data-theme="...">` attr beállítás.
- **`ThemeStylePicker`** — composite, közvetlenül a context-ből olvas (alternatíva).

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` (51 oldal Next.js webpack) | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite, 50+ font asset) | ✅ Zöld |

### Kompatibilitás

A jelenlegi `:root` (light) és `.dark` CSS-vars szakaszok **változatlanok** a
`packages/ui/src/kartoteka.css`-ben — fallback marad. Az új téma-réteg a
`[data-theme="..."]` szelektorokkal felülírja a CSS-vars értékeit, de a Tailwind
utility class-ok érintetlenek. **Visszafelé kompatibilis.**

A `data-theme="kert"` az alapértelmezett (a v0.8.0 óta), így az új user-élmény
a Kerített kert stílust mutatja, a régi user-okat pedig **a saját választásuk**
viszi tovább.

## Sprint R hátralévő fázisai

| Fázis | Verzió | Tartalom |
|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra (LEZÁRVA) |
| ✅ F2 | **v0.8.1** | **Téma-választó GA + first release** |
| F3 | v0.8.2 | Missziós Műhely home átépítés + desktop paritás |
| F4 | v0.8.3 | Mikro-interakciók (Splash, Loading, Skeleton, page transition) |
| F5 | v0.8.4 | Onboarding & Auth (csak web) |
| F6 | v0.8.5 | Tauri-mini installer app (980×660 wizard) |

## Áldás kísérje a használatát!

*Soli Deo Gloria*
