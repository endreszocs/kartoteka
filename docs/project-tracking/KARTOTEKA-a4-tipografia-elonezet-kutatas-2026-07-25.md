# A4-tipográfia + élő előnézet-skálázás — kutatási jelentés (F8e terv-input)

**Dátum:** 2026-07-25 · **Cél:** a hivatalos igazolások/levelek A4-elrendezésének és tipográfiájának rendbetétele, valamint az élő előnézet fit-to-page skálázásának VÉGLEGES javítása (3. bejelentés ugyanarra a hibára).

## A három legfontosabb tanulság

1. **Az előnézet-hiba gyökere:** a `transform: scale()` a layout UTÁN hat — a skálázott lap **változatlan méretű dobozt** foglal a folyamban, ezért túllóg/levágódik. A wrapper méretét KÉZZEL kell a skálával szorozni, `transform-origin: 0 0` mellett, és a centrálást a wrapperre tenni. Emellé kötelező a `scrollbar-gutter: stable` (vagy fix `overflow-y: scroll`) a görgetősáv-oszcilláció ellen.
2. **NE válts `zoom`-ra:** a html2canvas explicit nem támogatja, és mivel layout közben hat, MÁS helyen törhet sort, mint a nyomtatás — nyomtatási előnézetnél elfogadhatatlan.
3. **A csúnya tördelés gyökere a sorkizárás elválasztás nélkül.** Javítás: `text-align: left` + `hyphens: auto` + `lang="hu"/"ro"/"en"/"de"`, `line-height: 1.45`, bekezdés-TÉRKÖZ behúzás helyett; a „lent üres a lap" ellen flex-oszlop + `margin-top: auto` az aláírás-blokkon.

## 1. Hivatalos A4-irat tipográfia (DIN 5008 + magyar ügyviteli gyakorlat)

| Elem | Érték |
|---|---|
| Bal margó (lefűzés) | **25 mm** |
| Jobb margó | **20 mm** |
| Felső margó | **20 mm** (fejléc-sáv max. 45 mm-ig) |
| Alsó margó | **18–20 mm** |
| Betűméret | **12 pt** serif (Times/Tinos/Liberation Serif) |
| Sorköz | **1.45** (DIN-minimum 130%, Butterick 120–145%) |
| Szövegtükör | 210 − 25 − 20 = **165 mm** (≈ 78–82 kar./sor) |
| Bekezdés | `margin: 0 0 3.5mm`, `text-indent: 0` (térköz VAGY behúzás — sosem mindkettő) |
| Igazítás | **balra zárt** + `hyphens: auto` (justify csak elválasztással, PDF-úton kockázatos) |
| Aláírás fölött | 18–20 mm üres hely; pecsét-hely 35 × 35 mm |

**Kanonikus CSS-profil:**
```css
.page {
  width: 210mm; min-height: 297mm;
  padding: 20mm 20mm 18mm 25mm; box-sizing: border-box;
  display: flex; flex-direction: column;
  font-family: "Times New Roman", Tinos, "Liberation Serif", Georgia, serif;
  font-size: 12pt; line-height: 1.45; color: #000; background: #fff;
  text-align: left; hyphens: auto; hyphenate-limit-chars: 6 3 3;
  text-wrap: pretty; orphans: 3; widows: 3;
  print-color-adjust: exact; -webkit-print-color-adjust: exact;
}
.page__header { flex: 0 0 auto; }
.page__body   { flex: 1 1 auto; }
.page__sign   { flex: 0 0 auto; margin-top: auto; }  /* KULCS: aláírás a tükör aljára */
.page p { margin: 0 0 3.5mm; text-indent: 0; }
.page h1 { font-size: 17pt; font-weight: 700; letter-spacing: .08em; text-align: center; margin: 14mm 0 10mm; break-after: avoid; }
.page__sign, table tr { break-inside: avoid; }
```
- `hyphens: auto` magyar szótárral: Chrome 87+/Firefox 9+/Safari 9.1+ (94,7% lefedettség) — **a `lang` attribútum KÖTELEZŐ**, nélküle nincs elválasztás.
- Román tipográfia: vessző-alatti **ș/ț** (U+0219/U+021B), NEM cedillás ş/ţ.

## 2. Nyomtatási CSS

- `@page { size: A4; margin: 0 }` + padding a `.page`-en (a Chrome a `@page` margót csak „Default" beállításnál veszi figyelembe; a padding nem rontható el).
- mm/pt mértékegység (1 mm = 3.7795 px; **210 mm = 793.7 px**, **297 mm = 1122.5 px**; 12 pt = 16 px).
- `orphans`/`widows`: Chromium igen, **Firefox NEM implementálja** (2002 óta nyitott bug) — ne erre alapozz.
- `break-inside: avoid` = kérés, nem garancia (ha az elem magasabb egy lapnál, a böngésző töri).
- Ismétlődő fejléc: `@page` margin box-ok **Chrome 131+/Safari 18.2+**, de a html2canvas TELJESEN figyelmen kívül hagyja → explicit `.page` divek a megbízható út (a projektben már így van).
- Fontok: Linux/headless Chrome-on nincs Times New Roman → Liberation Serif fallback (közeli, de nem bitpontos). Determinizmushoz self-hosted **Tinos** (metrika-kompatibilis, Apache).

## 3. html2canvas korlátok (PDF-út)

**Nem támogatott:** `box-shadow`, `filter`, `mix-blend-mode`, `object-fit`, `border-image`, `writing-mode`, **`zoom`**, `font-variant-ligatures`, oldaltörés-tulajdonságok; `transform` „limited".
**Canvas-plafon:** Chrome 32767 px / 268 M px²; **Safari ~16,8 M px²** (a legszűkebb) → A4 `scale: 2` = 3,56 M px² biztonságos, `scale: 3` Safariban bukik. A `scale`-t **mindig explicit** add meg (alapból devicePixelRatio!).
**Justify:** ismert `word-spacing` renderelési hiba (#2526) → kerülendő.
**Hyphens:** a kötőjel layout-motor-generálta glifa, nincs a DOM-szövegben → PDF-ben elveszhet; ha zavaró, `&shy;` (U+00AD) vagy PDF-úton `hyphens: none` a konzisztenciáért.
**Szabály:** soha ne skálázd azt az elemet, amit a html2canvas renderel — a skála a wrapperen legyen, render előtt vedd le.

## 4. Fit-to-page előnézet — a robusztus minta

**Szerkezet (3 réteg):** scroll-container (ITT mérünk) → fit-wrapper (layout-méret = A4 × scale, ezt centráljuk) → page (fix 793.7 × 1122.5 px, `transform: scale(s)`, origin `0 0`).

```tsx
const A4_W = 210 * (96 / 25.4)   // 793.70
const A4_H = 297 * (96 / 25.4)   // 1122.52

useLayoutEffect(() => {                    // NEM useEffect — különben 1 frame-ig 1.0-val villan
  const host = hostRef.current; if (!host) return
  let raf = 0
  const apply = () => {
    const w = host.clientWidth - pad
    if (w <= 0) return                     // rejtett/display:none konténer → NE írj
    const next = Math.min(1, Math.max(0.2, w / A4_W))
    setScale(prev => (Math.abs(prev - next) > 0.0005 ? next : prev))  // küszöb → nincs RO-loop
  }
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply) })
  ro.observe(host); apply()
  return () => { ro.disconnect(); cancelAnimationFrame(raf) }
}, [])
```
```tsx
<div ref={hostRef} style={{ overflowY: 'scroll', scrollbarGutter: 'stable' }}>
  <div style={{ width: A4_W * scale, height: A4_H * scale, margin: '0 auto' }}>   {/* wrapper adja a layout-méretet */}
    <div style={{ width: A4_W, height: A4_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>…</div>
  </div>
</div>
```

**Buktató-lista:** (1) a transform nem változtat layout-méretet → wrapper kézi skálázása kötelező; (2) `transform-origin` alapból center → `0 0` kell, centrálás a wrapperen; (3) mérési visszacsatolás → skálafüggetlen ősön mérj; (4) scrollbar-hurok → `scrollbar-gutter: stable`/fix `overflow-y: scroll` (Safariban a gutter gyenge → fix scroll); (5) RO-loop → küszöb + rAF-halasztás; (6) 0-mérés rejtett konténerben → `if (w<=0) return`; (7) `useLayoutEffect`; (8) `Math.max(minScale, …)` is kell; (9) **`@media print`-ben `transform: none`** (skálázott állapotban nyomtatva zsugorított lap + a transzformált elem atomikus doboz → nem tud lapokra törni); (10) törtskálánál elmosódás — ne tegyél rá `filter`/`will-change`-t.

**iframe-specifikus:** magasságmérés `onLoad` UTÁN + `doc.fonts.ready` + rAF (a webfont újratördel!); `Math.max(body.scrollHeight, documentElement.scrollHeight, …)` vagy jobb: belső wrapper `getBoundingClientRect()` (törtpixel!); zsugorodáshoz mérés előtt `height=0`; `sandbox` `allow-same-origin` NÉLKÜL → `contentDocument` null → minden mérés elhal.

## 5. paged.js? — NEM

Fix elrendezésű 1–2 oldalas iratoknál nincs mit tördelni; a `@page` margin box-ok Chrome 131 óta natívak; a canvas-PDF-út nem profitál belőle. Az explicit `.page` divek maradnak. (Hosszú, folyó kimutatásnál — pl. éves jelentés — később megérheti.)

## 6. Források

DIN 5008 (fp-francotyp, 1a-Studi, letterformat.org) · Sulinet ügyviteli tananyag · Butterick Practical Typography (ten minutes, justified text) · MyFonts Fontology · caniuse (hyphens hu, widows/orphans, zoom) · MDN (@page, Printing, zoom, ResizeObserver, scrollbar-gutter) · Chrome for Developers (print margins, Chrome 131) · Doppio (page breaks, margin boxes) · voussoir.net (CSS for printing) · Ctrl.blog serif stacks · Liberation fonts · mudosdigital (transform-origin + responsive preview — a fő minta) · budavariam (iframe zoom) · modern-css.com (zoom vs transform) · justmarkup · ZeeCoder/use-resize-observer · WICG/resize-observer #38 · TrackJS (RO-loop) · loke.dev (scrollbar-gutter) · usefulangle (iframe resize) · html2canvas features/FAQ/#3169/#2526 · pqina.nl (canvas limit) · html2pdf.js #153 · pagedjs.org
