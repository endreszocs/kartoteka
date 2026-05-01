# Kartotéka v0.8.2 — Sprint R · Missziós Műhely megújulás

*2026-05-01 · Endre számára: a Missziós Műhely modul kezdőoldala teljesen
új vizuális megjelenést kapott a design-handoff szerint.*

## Áldás!

A Missziós Műhely modul **otthonosabb, melegebb, lelkipásztoribb** lett.
Az új kezdőoldal egyetlen ránézésre megmutatja, mit talál ott a szolgáló
lelkipásztor: gyűjteményeket, témákat, letölthető csomagokat, közösségi
ajánlásokat és kategória-csempéket — a Mt 28,19–20 igével a hero közepén.

## Mit hoz a v0.8.2?

### 🎨 Új Missziós Műhely kezdőoldal

A modul kezdőoldala **teljesen megújult** a design-séma alapján:

- **Hero szakasz** — bal oldalt nagy „Missziós műhely" cím, *„Ötletek, segédanyagok
  és közösségi inspiráció a szolgálathoz"* alcím, két CTA gomb (zöld „Felfedezés
  indítása" és kontúros „Újdonságok"). Középen a **Mt 28,19–20** ige idézet,
  jobbra a **csésze + Biblia + olajág** hero-kép.
- **Kiemelt gyűjtemények** — 4 nagy kép-kártya: Kezdő lépések (18 anyag),
  Közösségépítés (24), Hit megélése (31), Evangelizáció (22). Mindegyik a
  segédanyagok aloldalra navigál a megfelelő szűrővel.
- **Témák** — 5-tagú lista (Ifjúság, Gyermekek, Család, Idősek, Dicsőítés és
  Zene) finom zöld pötty ikonokkal és anyag-számmal.
- **Letölthető csomagok** — 3 kiemelt csomag (Húsvéti alkalom, Nyári tábor,
  Ifjúsági alkalomvázlatok) PDF/PPTX/DOCX-szel, méret-kijelzéssel és letöltés
  gombbal.
- **Közösségi ajánlások** — közösségi idézet + 4 avatar (NE, TZ, GA, KS) +32
  további közreműködővel.
- **Böngészés kategóriák szerint** — 6 csempés rács a 6 fő kategóriához
  (Alkalmak, Tanulmányok, Kézműves, Média, Imádság, Szolgálat) képpel.

### 🌿 Meleg krém vizuális nyelv

- **Háttér** — meleg krém alapszín templom-watermarkkal, sarok-levelekkel,
  hills-domborzattal. A `mix-blend-mode: multiply` átláthatóan beleég.
- **Cormorant Garamond serif** címek + **Inter** szöveg.
- **Mély zöld accent** (`#3D6A2C`) és lágy zöld háttér (`#E8EFDF`) a
  kategória-jelölőkön és gombokon.

### 💻 Web és desktop egyezőség

A teljes UI a `packages/ui-app/src/missziosmuhely/` shared csomagban van —
**a web és desktop pixel-pontosan ugyanazt a komponenst rendereli**. A
navigáció platform-specifikus (Next.js router web-en, react-router-dom
desktopon), de a megjelenés azonos.

### 📋 Mit nem változott

A Missziós Műhely **aloldalai** (segédanyagok, fórum, jutalmak, profil)
szándékosan **érintetlen** maradtak — a táblázatos szerkezet változatlan.
Az új CTA-k és kategória-csempék az aloldalakra navigálnak, amikor azok
későbbi fázisokban elkészülnek.

## Technikai részletek

### Új komponensek

- **`MissionWorkshop`** — összeszerelt home oldal, `assetBase` + `onNavigate` props.
- **`MMBackground`, `MMHero`, `MMFeaturedCollections`, `MMThemes`, `MMDownloads`,
  `MMRecommendations`, `MMCategoryGrid`** — 7 részkomponens, mind külön exportálva.
- **`MM_PALETTE`** — meleg krém / mély zöld design-token konstans.

### Új útvonal

- **Web**: `/misszios-muhely` (új `apps/web/app/(dashboard)/misszios-muhely/page.tsx`)
- **Desktop**: `/#/misszios-muhely` (új `apps/desktop/src/pages/misszios-muhely-page.tsx`
  + `App.tsx` route)
- **Sidebar menüpont** már megvolt a `KartotekaShell`-ben — ezzel az updatekkel
  „élő" linkké válik.

### Build & release

| Verify | Eredmény |
|--------|----------|
| `npm run typecheck --workspace=@kartoteka/ui-app` | ✅ Zöld |
| `npm run build --workspace=@kartoteka/web` (52 oldal Next.js webpack) | ✅ Zöld |
| `npm run build --workspace=@kartoteka/desktop` (Vite, 5.13s) | ✅ Zöld |

### Asszet-átvétel

18 kép a `Kartoteka.html` design-handoffból bemásolva mindkét app `public/`
mappájába:
- 1× hero-mug (csésze + Biblia + olajág)
- 4× kollekció-kép (Bible, Hands, Lantern, Sprouts)
- 6× kategória ikon (21–26.png)
- 7× watermark / dekoratív (church, bible-rays, dove, leaves1/2, corner, hills)

## Sprint R hátralévő fázisai

| Fázis | Verzió | Tartalom | Státusz |
|---|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra | LEZÁRVA |
| ✅ F2 | v0.8.1 | Téma-választó GA | LEZÁRVA |
| ✅ F3 | **v0.8.2** | **Missziós Műhely home + desktop paritás** | **LEZÁRVA** |
| F4 | v0.8.3 | Mikro-interakciók (Splash, Loading, Skeleton, page transition) | hátra |
| F5 | v0.8.4 | Onboarding & Auth (csak web) | hátra |
| F6 | v0.8.5 | Tauri-mini installer app (980×660 wizard) | hátra |

## Áldás kísérje a használatát!

*Soli Deo Gloria*
