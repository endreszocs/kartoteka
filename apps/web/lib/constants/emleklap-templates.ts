/**
 * Anyakönyvi emléklapok — szerkeszthető sablonrendszer.
 *
 * 3 sablon (Keresztelői, Házasságkötési, Konfirmációi) × 2 egyházkerület-
 * variáns (EREK = Erdélyi, KEREK = Királyhágómelléki). A háttérképek tartalmazzák
 * a kereteket + címereket + az állandó címeket ("KERESZTELŐI EMLÉKLAP" stb.);
 * a változó szövegmezőket a renderer rétegezi a háttérre.
 *
 * Koordináta-rendszer: a háttér-aspect-arányhoz viszonyított SZÁZALÉKOK
 * (`x`, `y`, `width`). A `fontSize` szintén a háttér MAGASSÁG %-ában, hogy
 * minden képernyő-méreten és nyomtatási DPI-n arányos maradjon.
 *
 * Placeholder-helyettesítés: `{{fullName}}`, `{{birthDate}}` stb. — a renderer
 * a `data` objektumból olvassa be a kulcsokat.
 */

export type EmleklapType = 'kereszteles' | 'esketes' | 'konfirmacio'
export type EmleklapVariant = 'erek' | 'kerek'

export interface EmleklapField {
  /** Egyedi mező-azonosító (a template-en belül). */
  id: string
  /** Magyar címke a szerkesztő-űrlap számára. */
  label: string
  /** Alapértelmezett szöveg vagy placeholder (`{{key}}` formátum). */
  defaultValue: string
  /** X-koordináta a háttér SZÉLESSÉG %-ában (0–100). A `textAlign` jelöli a horgonyt. */
  x: number
  /** Y-koordináta a háttér MAGASSÁG %-ában (0–100). Top-anchor. */
  y: number
  /** Szélesség a háttér SZÉLESSÉG %-ában. */
  width: number
  /** Font-méret a háttér MAGASSÁG %-ában (pl. 2.4 = 2.4% az A4 magasság-ának). */
  fontSize: number
  /** Font-család. */
  fontFamily: string
  /** Font-súly (400, 500, 700 stb.). */
  fontWeight: number
  /** Kurzív / dőlt. */
  italic?: boolean
  /** Szín (hex vagy css-szín). */
  color: string
  /** Vízszintes igazítás a `width`-en belül. */
  textAlign: 'left' | 'center' | 'right' | 'justify'
  /** Sortávolság. */
  lineHeight: number
  /** Betűköz (em-ben). */
  letterSpacing: number
  /** TextTransform. */
  textTransform?: 'none' | 'uppercase' | 'lowercase'
  /** Több sorba törhet-e (paragrafusnál `true`). */
  multiline?: boolean
  /** Megjegyzés a szerkesztőnek (tooltip / segéd-szöveg). */
  hint?: string
}

export interface EmleklapTemplate {
  id: string
  /** Megjelenítendő név. */
  name: string
  /** Sablon-típus. */
  type: EmleklapType
  /** Egyházkerület-variáns (csak a háttérkép-utat befolyásolja). */
  variant: EmleklapVariant
  /** Háttérkép URL (a `public/templates/emleklap/`-ből). */
  backgroundImage: string
  /** A4 álló arány — 210/297 = 0.7071. A renderer ezt használja a width/height-hez. */
  aspectRatio: number
  /** Szerkeszthető szövegmezők (rétegek). */
  fields: EmleklapField[]
}

// ─────────────────────────────────────────────────────────────────────────
// Közös stílusok — Cormorant Garamond a klasszikus szöveghez, dekoratív
// kurzív font a kiemelt nevekhez. A fallback Times-os, hogy bármilyen
// rendszeren megjelenjen.
// ─────────────────────────────────────────────────────────────────────────

const FONT_SERIF = "'Cormorant Garamond', 'Cormorant', 'Garamond', 'Times New Roman', serif"
const FONT_CURSIVE = "'Great Vibes', 'Allura', 'Lucida Handwriting', 'Brush Script MT', cursive"
const FONT_SANS_SMALL = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"

// Egységes színek a 3 sablonhoz
const COLOR_HEADING = '#1f2a24'
const COLOR_BODY = '#1f2a24'
const COLOR_ACCENT = '#5c4220'
const COLOR_SMALL = '#3f4a44'

// ─────────────────────────────────────────────────────────────────────────
// 1. KERESZTELŐI EMLÉKLAP
// ─────────────────────────────────────────────────────────────────────────

// Koordináták 2026-05-29 v2: a hivatalos EREK keresztelői minta + a felhasználói
// screenshot rendering-pozíciók szerint kalibrálva.
//
// Hatter statikus pozíciók (a public/templates/emleklap/erek-kereszteloi-hatter.png alapján):
//   címer: y~5–22%
//   "KERESZTELŐI" nagy cím: y~33–42%
//   "EMLÉKLAP" subtitle: y~43–44%
//   "BÜSZKÉN KÖSZÖNTJÜK" caps: y~45–47%
//   kereszt-grafika: y~46–73%
//   alsó dekoratív széle: y~92–95%
//
// A változó mezők ezek KÖZÉ vannak elhelyezve. A cursive név a kereszt
// vízszintes karján (y~49–54%), a paragrafus a kereszt függőleges szárán.
const KERESZTELESI_FIELDS: EmleklapField[] = [
  // v4 (2026-05-29) — user-driven kalibráció:
  // 1. congregationName KÖZVETLENÜL a "KERESZTELŐI" cím FÖLÉ (y=23, ~+5% lejjebb)
  // 2. fullName KISEBB, OLVASHATÓBB cursive font (3.0 helyett 4.2) a díszes
  //    keret közepén (a kereszt vízszintes karján)
  // 3. paragraph nagyobb (1.8 helyett 1.6) + félkövér (fw 500) az olvashatóságért
  // 4. pastorName/wardenName az aláírás-vonalakhoz igazítva (y=75-76)
  {
    // v6 (2026-05-29) — user: „a kerületi logó alatti dísz és a keresztelői
    // felirat közé". A hatter címer-dísze y~16%-ig tart, a KERESZTELŐI cím
    // y~22%-tól kezdődik — a gyülekezet neve ebbe a sávba kerül.
    id: 'congregationName',
    label: 'Gyülekezet neve (felső sor)',
    defaultValue: '{{congregationName}}',
    x: 7.5,
    y: 14.0,
    width: 85,
    fontSize: 1.85,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    hint: 'pl. BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
  },
  {
    id: 'fullName',
    label: 'Megkeresztelt teljes neve',
    defaultValue: '{{fullName}}',
    x: 20,
    y: 44.0,
    width: 60,
    fontSize: 3.0,
    fontFamily: FONT_CURSIVE,
    fontWeight: 400,
    italic: true,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.0,
    letterSpacing: 0,
    hint: 'pl. Bocîrnea Dominik',
  },
  {
    id: 'relativeLabel',
    label: '„testvérünket" felirat',
    defaultValue: 'testvérünket',
    x: 7.5,
    y: 50.0,
    width: 85,
    fontSize: 1.55,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    italic: true,
    color: COLOR_BODY,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  {
    id: 'paragraph',
    label: 'Fő szöveg (5-6 sor)',
    defaultValue: '{{parentsNames}} gyermekét, aki {{birthPlace}} született {{birthDate}}, és akit a {{baptismCongregation}}-ben {{baptismDate}} a szent keresztség által az Atya, Fiú, Szentlélek Isten szövetségébe, a keresztyén Anyaszentegyházba befogadtunk.',
    x: 10,
    y: 53.5,
    width: 80,
    fontSize: 1.8,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.45,
    letterSpacing: 0,
    multiline: true,
    hint: 'A teljes bekezdést itt szerkesztheted. A {{placeholderek}} az adatokból kerülnek behelyettesítésre.',
  },
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 7.5,
    y: 65.0,
    width: 85,
    fontSize: 1.7,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_BODY,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    hint: 'pl. Barátos, 2025. április 27.',
  },
  // ─── Aláírások ─── a hatter aláírás-vonalai ~y=77-78%, ezek alá kerül a név
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 6,
    y: 75.5,
    width: 30,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 6,
    y: 78.0,
    width: 30,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
  {
    id: 'wardenName',
    label: 'Gondnok neve',
    defaultValue: '{{wardenName}}',
    x: 64,
    y: 75.5,
    width: 30,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'wardenRole',
    label: 'Gondnok titulus',
    defaultValue: 'GONDNOK',
    x: 64,
    y: 78.0,
    width: 30,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 2. HÁZASSÁGKÖTÉSI EMLÉKLAP
// ─────────────────────────────────────────────────────────────────────────

// EREK esketési hatter — statikus elemek pozíciói:
//   címer: y~5–14%
//   "HÁZASSÁGKÖTÉSI" nagy cím: y~22–32%
//   "EMLÉKLAP" small: y~33%
//   kereszt-grafika: y~40–67%
//   alsó dekoráció: y~92–95%
const ESKETESI_FIELDS: EmleklapField[] = [
  // v4 (2026-05-29) — keresztelői mintára: congr. közvetlenül a cím fölött,
  // cursive nevek kisebbek + díszes keret közepén, paragraph nagyobb + félkövér,
  // aláírások az aláírás-vonalakhoz igazítva.
  {
    // v6 (2026-05-29): a címer-dísz és HÁZASSÁGKÖTÉSI cím közé (azonos logika
    // mint a keresztelőin).
    id: 'congregationName',
    label: 'Gyülekezet neve (felső sor)',
    defaultValue: '{{congregationName}}',
    x: 7.5,
    y: 14.0,
    width: 85,
    fontSize: 1.85,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'husbandName',
    label: 'Férj neve',
    defaultValue: '{{husbandName}},',
    x: 20,
    y: 35.0,
    width: 60,
    fontSize: 2.3,
    fontFamily: FONT_CURSIVE,
    fontWeight: 400,
    italic: true,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.0,
    letterSpacing: 0,
  },
  {
    id: 'husbandBirth',
    label: 'Férj születése',
    defaultValue: 'aki {{husbandBirthPlace}} született {{husbandBirthDate}}',
    x: 7.5,
    y: 40.5,
    width: 85,
    fontSize: 1.6,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  {
    id: 'andLabel',
    label: '„és" szó',
    defaultValue: 'és',
    x: 7.5,
    y: 43.5,
    width: 85,
    fontSize: 1.6,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    italic: true,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  {
    id: 'wifeName',
    label: 'Feleség neve',
    defaultValue: '{{wifeName}},',
    x: 20,
    y: 46.5,
    width: 60,
    fontSize: 2.3,
    fontFamily: FONT_CURSIVE,
    fontWeight: 400,
    italic: true,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.0,
    letterSpacing: 0,
  },
  {
    id: 'wifeBirth',
    label: 'Feleség születése',
    defaultValue: 'aki {{wifeBirthPlace}} született {{wifeBirthDate}}',
    x: 7.5,
    y: 52.0,
    width: 85,
    fontSize: 1.6,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  {
    id: 'paragraph',
    label: 'Esketés szöveg',
    defaultValue: 'a {{marriageCongregation}}-ben {{marriageDate}} Isten és a gyülekezet színe előtt házassági szent szövetséget kötött.',
    x: 10,
    y: 56.0,
    width: 80,
    fontSize: 1.75,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.45,
    letterSpacing: 0,
    multiline: true,
  },
  {
    id: 'biblicalVerse',
    label: 'Igevers (idézet)',
    defaultValue: '„{{verseText}}" ({{verseReference}})',
    x: 10,
    y: 62.0,
    width: 80,
    fontSize: 1.75,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    italic: true,
    color: COLOR_ACCENT,
    textAlign: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
    multiline: true,
    hint: 'pl. „Egymás terhét hordozzátok…" (Gal 6,2)',
  },
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 7.5,
    y: 68.0,
    width: 85,
    fontSize: 1.65,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_BODY,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 6,
    y: 75.5,
    width: 30,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 6,
    y: 78.0,
    width: 30,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
  {
    id: 'wardenName',
    label: 'Gondnok neve',
    defaultValue: '{{wardenName}}',
    x: 64,
    y: 75.5,
    width: 30,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'wardenRole',
    label: 'Gondnok titulus',
    defaultValue: 'GONDNOK',
    x: 64,
    y: 78.0,
    width: 30,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 3. KONFIRMÁCIÓI EMLÉKLAP
// ─────────────────────────────────────────────────────────────────────────

// EREK konfirmációi hatter — statikus elemek pozíciói:
//   2 igevers + címer: y~3–13%
//   "KONFIRMÁCIÓI EMLÉKLAP" cím: y~18–28%
//   felső vízszintes vonal: y~30%
//   dekoratív kelyhes-grafika: y~50–65%
//   alsó vízszintes vonal: y~67%
//   alsó dekoráció: y~92–95%
const KONFIRMACIOI_FIELDS: EmleklapField[] = [
  // v6 (2026-05-29): a 2 igevers/címer és a KONFIRMÁCIÓI cím közé. Az eredeti
  // minta nem tartalmazza, de user-kérésre minden sablonon legyen.
  {
    id: 'congregationName',
    label: 'Gyülekezet neve (felső sor)',
    defaultValue: '{{congregationName}}',
    x: 7.5,
    y: 14.0,
    width: 85,
    fontSize: 1.7,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    hint: 'pl. BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
  },
  // v4 (2026-05-29) — konfirmacioi: bevezető + név a felső vonal alatt szorosan,
  // paragraph nagyobb + félkövér, aláírások az aláírás-vonalakhoz igazítva.
  {
    id: 'introLabel',
    label: 'Bevezető (Alulírottak hivatalosan bizonyítjuk)',
    defaultValue: 'ALULÍROTTAK HIVATALOSAN BIZONYÍTJUK, HOGY',
    x: 7.5,
    y: 32.5,
    width: 85,
    fontSize: 1.45,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  },
  {
    id: 'fullName',
    label: 'Konfirmált teljes neve',
    defaultValue: '{{fullName}}',
    x: 7.5,
    y: 36.0,
    width: 85,
    fontSize: 2.3,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.05,
    textTransform: 'uppercase',
  },
  {
    id: 'paragraph',
    label: 'Fő szöveg (részletek)',
    defaultValue: 'testvérünk, aki {{birthPlace}}, {{birthDate}} született, akit a {{baptismCongregation}}-ben {{baptismDate}} megkereszteltek, miután a gyülekezet presbiterei a Heidelbergi Káté alapján hite felől megvizsgálták, a mai napon a {{confirmCongregation}}-ben a szent gyülekezet előtt igaz hitéről vallást, egyháza iránti hűségére fogadást tett. Mindezek alapján a Református Anyaszentegyház önálló tagjai közé felvettük és az úrvacsora vételére felhatalmaztuk.',
    x: 8,
    y: 41.0,
    width: 84,
    fontSize: 1.6,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.45,
    letterSpacing: 0,
    multiline: true,
  },
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 7.5,
    y: 65.0,
    width: 85,
    fontSize: 1.7,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.05,
    textTransform: 'uppercase',
  },
  // Konfirmáció: főgondnok BAL, lelkipásztor JOBB (eltér a többi sablontól!)
  {
    id: 'mainWardenName',
    label: 'Fő-gondnok neve',
    defaultValue: '{{mainWardenName}}',
    x: 8,
    y: 74.0,
    width: 32,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'mainWardenRole',
    label: 'Fő-gondnok titulus',
    defaultValue: 'FŐGONDNOK',
    x: 8,
    y: 76.5,
    width: 32,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 60,
    y: 74.0,
    width: 32,
    fontSize: 1.4,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_HEADING,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 60,
    y: 76.5,
    width: 32,
    fontSize: 1.0,
    fontFamily: FONT_SANS_SMALL,
    fontWeight: 400,
    color: COLOR_SMALL,
    textAlign: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.08,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// Sablon-katalógus (6 sablon)
// ─────────────────────────────────────────────────────────────────────────

export const EMLEKLAP_TEMPLATES: EmleklapTemplate[] = [
  {
    id: 'kereszteles-erek',
    name: 'Keresztelői emléklap — EREK',
    type: 'kereszteles',
    variant: 'erek',
    backgroundImage: '/templates/emleklap/erek-kereszteloi-hatter.png',
    aspectRatio: 210 / 297,
    fields: KERESZTELESI_FIELDS,
  },
  {
    id: 'kereszteles-kerek',
    name: 'Keresztelői emléklap — KEREK',
    type: 'kereszteles',
    variant: 'kerek',
    backgroundImage: '/templates/emleklap/kerek-kereszteloi-hatter.png',
    aspectRatio: 210 / 297,
    fields: KERESZTELESI_FIELDS,
  },
  {
    id: 'esketes-erek',
    name: 'Házasságkötési emléklap — EREK',
    type: 'esketes',
    variant: 'erek',
    backgroundImage: '/templates/emleklap/erek-esketesi-hatter.png',
    aspectRatio: 210 / 297,
    fields: ESKETESI_FIELDS,
  },
  {
    id: 'esketes-kerek',
    name: 'Házasságkötési emléklap — KEREK',
    type: 'esketes',
    variant: 'kerek',
    backgroundImage: '/templates/emleklap/kerek-esketesi-hatter.png',
    aspectRatio: 210 / 297,
    fields: ESKETESI_FIELDS,
  },
  {
    id: 'konfirmacio-erek',
    name: 'Konfirmációi emléklap — EREK',
    type: 'konfirmacio',
    variant: 'erek',
    backgroundImage: '/templates/emleklap/erek-konfirmalasi-hatter.png',
    aspectRatio: 210 / 297,
    fields: KONFIRMACIOI_FIELDS,
  },
  {
    id: 'konfirmacio-kerek',
    name: 'Konfirmációi emléklap — KEREK',
    type: 'konfirmacio',
    variant: 'kerek',
    backgroundImage: '/templates/emleklap/kerek-konfirmalasi-hatter.png',
    aspectRatio: 210 / 297,
    fields: KONFIRMACIOI_FIELDS,
  },
]

/** Gyors lookup ID alapján. */
export const EMLEKLAP_TEMPLATES_MAP: Record<string, EmleklapTemplate> = EMLEKLAP_TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = t
    return acc
  },
  {} as Record<string, EmleklapTemplate>,
)

/**
 * Placeholder-helyettesítés egy szövegben.
 * Pl. "Üdvözöljük {{fullName}}!" + { fullName: "Anna" } → "Üdvözöljük Anna!"
 */
export function fillTemplate(text: string, data: Record<string, string | undefined>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key]
    return value ?? ''
  })
}

/**
 * Példa adathalmaz a 3 típushoz — UI-előnézethez és a fejlesztői dokumentációhoz.
 */
export const EMLEKLAP_SAMPLE_DATA: Record<EmleklapType, Record<string, string>> = {
  kereszteles: {
    congregationName: 'BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
    fullName: 'Bocirnea Dominik',
    parentsNames: 'Bocirnea Andrei és Pataki Zelma',
    birthPlace: 'Dániában Aabenraa-ban',
    birthDate: '2024. február 11.-én',
    baptismCongregation: 'Barátosi Református Egyházközségben',
    baptismDate: '2025. április 27-én',
    issueLocation: 'Barátos',
    issueDate: '2025. április 27.',
    pastorName: 'SZŐCS ENDRE',
    wardenName: 'MÁRK A. LÁSZLÓ',
  },
  esketes: {
    congregationName: 'BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
    husbandName: 'Deák Barabás-Mihály',
    husbandBirthPlace: 'Kovásznán',
    husbandBirthDate: '1983 február 21.-én',
    wifeName: 'Szász Emőke',
    wifeBirthPlace: 'Kovásznán',
    wifeBirthDate: '1992 április 16.-án',
    marriageCongregation: 'Barátosi Református Egyházközségben',
    marriageDate: '2025. május 10.-én',
    verseText: 'Egymás terhét hordozzátok, és úgy töltsétek be a Krisztus törvényét',
    verseReference: 'Gal 6,2',
    issueLocation: 'Barátos',
    issueDate: '2025. május 10.',
    pastorName: 'SZŐCS ENDRE',
    wardenName: 'MÁRK A. LÁSZLÓ',
  },
  konfirmacio: {
    congregationName: 'BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
    fullName: 'CSÁKÁNY ÁRPÁD',
    birthPlace: 'Kovásznán',
    birthDate: '2005. április 12-én',
    baptismCongregation: 'Kovásznai Református Egyházközségben',
    baptismDate: '2005. augusztus 20-án',
    confirmCongregation: 'Kovászna I. Református Egyházközségben',
    issueLocation: 'Barátos',
    issueDate: '2020. AUGUSZTUS 23.',
    mainWardenName: 'MÁRK A. LÁSZLÓ',
    pastorName: 'SZŐCS ENDRE',
  },
}
