/**
 * Iktató F8e — KÖZÖS A4 DOKUMENTUM-STÍLUS (E1-kontraktus).
 *
 * A user éles teszt-észrevétele (2026-07-25): „a nyomtatási előnézet tördelése,
 * sorköze, kinézete csúnya, a tartalom túllóg és levágódik". A gyökérokok és a
 * javítás forrása a kutatási tervdoc — BETŰRE innen jönnek a paraméterek:
 *   docs/project-tracking/KARTOTEKA-a4-tipografia-elonezet-kutatas-2026-07-25.md
 *
 * A három lényegi tanulság, amit ez a modul kódba önt:
 *  1. A csúnya tördelés gyökere a SORKIZÁRÁS elválasztás nélkül → `text-align:
 *     left` + `hyphens: auto` + `hyphenate-limit-chars`, `line-height: 1.45`,
 *     bekezdés-TÉRKÖZ (3.5mm) behúzás HELYETT — sosem mindkettő.
 *     ⚠️ A `hyphens: auto` CSAK akkor működik, ha a dokumentumon ott a `lang`
 *     attribútum — ezért adja a `dokumentumBurok` KÖTELEZŐEN a `<html lang="…">`-t.
 *  2. A „lent üres a lap / lelóg az aláírás" ellen a lap FLEX-OSZLOP:
 *     `.page__header` (fix) · `.page__body` (nyúlik) · `.page__sign`
 *     (`margin-top: auto` → mindig a szövegtükör aljára ül).
 *  3. Hivatalos A4-tükör (DIN 5008 + magyar ügyviteli gyakorlat): 25mm bal
 *     (lefűzés), 20mm jobb/felső, 18mm alsó margó, 12pt serif.
 *
 * WYSIWYG-elv: az élő előnézet, a böngészős nyomtatás és a PDF UGYANEZT a
 * HTML+CSS-t kapja. `@page { margin: 0 }` + a lap-margót a `.page` paddingja
 * adja (a Chrome a `@page` margót csak „Default" nyomtató-beállításnál veszi
 * figyelembe, a padding viszont mindig hat).
 *
 * A `.page` a `sheet` osztályt IS viseli: a nyomtatási motor (print-engine-v2)
 * a `body .sheet` elemeket rendereli laponként külön canvasra (ez kerüli meg a
 * GPU canvas-plafont), és a `<body data-sheet-count="1">` a csonka-PDF-őr
 * bemenete. Az egy-lapos irat így a gyors, pixelpontos laponkénti úton megy.
 *
 * Tisztán szinkron, DOM- és DB-mentes modul (a hívó iframe/srcdoc-ba tölti).
 */

// ─────────────────────────────────────────────────────────────────
// A4 pixel-méretek (96 CSS-dpi) — a fit-to-page előnézet skálázásához
// ─────────────────────────────────────────────────────────────────

/** 210 mm CSS-pixelben (210 × 96 / 25.4) — a fit-wrapper szélesség-alapja. */
export const A4_W_PX = 793.7
/** 297 mm CSS-pixelben (297 × 96 / 25.4) — a fit-wrapper magasság-alapja. */
export const A4_H_PX = 1122.52

// ─────────────────────────────────────────────────────────────────
// A kanonikus stílus-profil
// ─────────────────────────────────────────────────────────────────

/**
 * A hivatalos irat kanonikus A4 CSS-profilja — a `<style>` TARTALMA
 * (a tag-eket a hívó, illetve a `dokumentumBurok` teszi köré).
 *
 * Osztály-szerződés (a dokumentum-családok és a kiállító erre épít):
 *  - `.page` (+ `sheet`)   — maga az A4 lap, flex-oszlop
 *  - `.page__header`       — levélfej + Szám/Tárgy sávok
 *  - `.page__meta` · `.doc-szam` · `.doc-targy`
 *  - `.page__body`         — a törzs (a család `buildBody` kimenete)
 *  - `.page__sign`         — keltezés + aláírás-blokk (a tükör alján)
 *  - `.doc-torzs` · `p` · `p.doc-sor` · `p.doc-megszolitas` · `p.doc-udvarlas`
 *  - `.alairas-sor` · `.alairas-kelt` · `.alairas-blokk` · `.alairas-vonal`
 *    · `.alairas-nev` · `.alairas-szerep` · `.pecset-hely`
 */
export function dokumentumStilus(): string {
  return `
    /* ── Lap-geometria: @page margó 0, a tükröt a .page paddingja adja ── */
    @page { size: A4 portrait; margin: 0; }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      /* Az előnézet-iframe-ben SOHA ne legyen vízszintes görgetés. */
      overflow-x: hidden;
    }

    /* ── Az A4 lap (DIN 5008 + magyar ügyviteli gyakorlat) ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      /* felső 20mm · jobb 20mm · alsó 18mm · bal 25mm (lefűző-margó) */
      padding: 20mm 20mm 18mm 25mm;
      background: #fff;
      color: #000;
      /* KULCS: flex-oszlop — az aláírás-blokk így ül a tükör aljára. */
      display: flex;
      flex-direction: column;
      font-family: 'Times New Roman', Tinos, 'Liberation Serif', Georgia, serif;
      font-size: 12pt;
      line-height: 1.45;
      /* Balra zárt + automatikus elválasztás (a sorkizárás elválasztás nélkül
         adta a „lyukas", csúnya sorokat; a html2canvas justify-hibás is). */
      text-align: left;
      -webkit-hyphens: auto;
      hyphens: auto;
      hyphenate-limit-chars: 6 3 3;
      text-wrap: pretty;
      orphans: 3;
      widows: 3;
      overflow-wrap: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      page-break-after: always;
      break-after: page;
    }
    /* Egy-lapos iratnál (és az utolsó lapnál) nincs üres záró-oldal. */
    .page:last-child { page-break-after: auto; break-after: auto; }

    .page__header { flex: 0 0 auto; }
    .page__body   { flex: 1 1 auto; }
    .page__sign   {
      flex: 0 0 auto;
      margin-top: auto;      /* KULCS: a szövegtükör aljára */
      padding-top: 18mm;     /* az aláírás fölött 18–20mm üres hely */
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ── Tipográfia ── */
    .page p { margin: 0 0 3.5mm; text-indent: 0; }
    .page p:last-child { margin-bottom: 0; }
    .page h1 {
      font-size: 17pt; font-weight: 700; letter-spacing: .08em;
      text-align: center; margin: 14mm 0 10mm;
      page-break-after: avoid; break-after: avoid;
    }
    .page h2 {
      font-size: 13pt; font-weight: 700; letter-spacing: .04em;
      margin: 6mm 0 3mm;
      page-break-after: avoid; break-after: avoid;
    }
    .page b, .page strong { font-weight: 700; }
    .page img { max-width: 100%; }
    .page table { width: 100%; border-collapse: collapse; }
    .page table tr { page-break-inside: avoid; break-inside: avoid; }
    .page ul, .page ol { margin: 0 0 3.5mm; padding-left: 8mm; }

    /* ── Fejléc-sáv: levélfej + Szám/Tárgy ── */
    .page__meta { margin: 6mm 0 8mm; }
    .page__meta > div { margin: 0 0 1.5mm; }
    .page__meta > div:last-child { margin-bottom: 0; }
    .doc-targy { font-weight: 700; }

    /* ── Törzs-bekezdések (behúzás NÉLKÜL, térközzel) ── */
    /* Középre zárt dokumentum-cím az igazolásokon (a család nyelv szerinti
       neve). Szűkebb térköz, mint az általános .page h1 — itt már fölötte áll
       a levélfej és a Szám/Tárgy sáv. */
    .doc-torzs .doc-cim {
      font-size: 15pt; font-weight: 700; letter-spacing: .12em;
      text-align: center; margin: 0 0 8mm;
      page-break-after: avoid; break-after: avoid;
    }
    .doc-torzs p { margin: 0 0 3.5mm; text-indent: 0; }
    .doc-torzs p.doc-sor { margin: 0 0 2mm; }
    .doc-torzs p.doc-megszolitas { margin: 0 0 4mm; }
    .doc-torzs p.doc-udvarlas { margin: 6mm 0 0; }

    /* ── Keltezés + aláírás-blokk ── */
    .alairas-sor {
      display: flex; justify-content: space-between;
      align-items: flex-end; gap: 10mm;
    }
    .alairas-kelt { flex: 0 1 auto; }
    .alairas-blokk { flex: 0 0 auto; width: 65mm; text-align: center; }
    .alairas-vonal { border-bottom: 0.5pt solid #000; height: 12mm; margin-bottom: 1.5mm; }
    .alairas-nev { font-weight: 700; }
    .alairas-szerep { font-size: 10.5pt; }
    /* Pecsét-hely: a hivatalos gyakorlat szerint 35 × 35 mm. */
    .pecset-hely { width: 35mm; height: 35mm; flex: 0 0 auto; }

    /* ── Nyomtatás ── */
    @media print {
      html, body { background: #fff; }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        box-shadow: none;
        /* KÖTELEZŐ: a fit-to-page előnézet skálája SOHA ne menjen nyomtatásba —
           a transzformált elem atomikus doboz, nem tudna lapokra törni. */
        -webkit-transform: none !important;
        transform: none !important;
      }
    }`
}

// ─────────────────────────────────────────────────────────────────
// Teljes A4 dokumentum-burok
// ─────────────────────────────────────────────────────────────────

/** HTML-escape a burok saját (nem előre escape-elt) értékeihez. */
function esc(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface DokumentumBurokOpts {
  /**
   * A dokumentum nyelve — a `<html lang="…">` attribútumba kerül.
   * KÖTELEZŐ: e nélkül a böngésző NEM végez szótagolást (`hyphens: auto`),
   * és a balra zárt sorok megint csúnyán szakadnának.
   */
  lang: string
  /** A böngésző-fül és a mentett PDF címe (nyers szöveg — a burok escape-eli). */
  cim?: string
  /** Levélfej-HTML (buildLetterheadHtml kimenete) — üresen kimarad a sáv. */
  fejlecHtml?: string
  /** A „Szám: 12/2026" sor KÉSZ (escape-elt) HTML-je vagy szövege. */
  szamSor?: string
  /** A „Tárgy: …" sor KÉSZ (escape-elt) HTML-je vagy szövege. */
  targySor?: string
  /** A dokumentum törzse — jellemzően a család `buildBody` kimenete. */
  torzsHtml: string
  /** Keltezés + aláírás-blokk KÉSZ HTML-je (a tükör aljára kerül). */
  alairasHtml?: string
  /** Kiegészítő CSS a stíluslap VÉGÉRE (opcionális felülírásokhoz). */
  extraCss?: string
}

/**
 * A teljes, önhordó A4 HTML-dokumentum — előnézet, nyomtatás és PDF ugyanezt
 * kapja (WYSIWYG). A szerkezet fixen a kontraktus szerinti:
 *
 *   html[lang] > body[data-sheet-count=1] > .page.sheet
 *      ├── .page__header  (levélfej + .page__meta: Szám / Tárgy)
 *      ├── .page__body    (törzs)
 *      └── .page__sign    (keltezés + aláírás — margin-top:auto-val a lap alján)
 */
export function dokumentumBurok(opts: DokumentumBurokOpts): string {
  const lang = (opts.lang || 'hu').trim() || 'hu'
  const cim = (opts.cim || '').trim()
  const fejlec = (opts.fejlecHtml || '').trim()
  const szam = (opts.szamSor || '').trim()
  const targy = (opts.targySor || '').trim()
  const alairas = (opts.alairasHtml || '').trim()
  const extraCss = (opts.extraCss || '').trim()

  const metaSav =
    szam || targy
      ? `<div class="page__meta">${szam ? `\n      <div class="doc-szam">${szam}</div>` : ''}${
          targy ? `\n      <div class="doc-targy">${targy}</div>` : ''
        }\n    </div>`
      : ''

  const fejlecSav =
    fejlec || metaSav
      ? `<div class="page__header">${fejlec ? `\n    ${fejlec}` : ''}${metaSav ? `\n    ${metaSav}` : ''}\n  </div>`
      : ''

  const alairasSav = alairas ? `<div class="page__sign">\n    ${alairas}\n  </div>` : ''

  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(cim)}</title>
<style>${dokumentumStilus()}${extraCss ? `\n\n    /* ── Egyedi kiegészítés ── */\n    ${extraCss}` : ''}
</style>
</head>
<body data-sheet-count="1">
<div class="page sheet">
  ${fejlecSav}
  <div class="page__body">
    ${opts.torzsHtml}
  </div>
  ${alairasSav}
</div>
</body>
</html>`
}
