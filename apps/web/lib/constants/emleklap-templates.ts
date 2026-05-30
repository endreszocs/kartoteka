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

export type EmleklapType = 'kereszteles' | 'esketes' | 'konfirmacio' | 'temetes'
// 2026-05-30: 'kek' variant — a kék-fehér népi díszítésű keresztelési sablon
// (lásd migration-docs/.../Regi/keresztelesi_emleklap_web_rekonstrukcio_specifikacio.md)
export type EmleklapVariant = 'erek' | 'kerek' | 'kek' | 'hagyomanyos'

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
// 2026-05-30 (konfirmáció spec): Cinzel font a konfirmációi emléklap-szövegekhez
const FONT_CINZEL = "'Cinzel', 'Cormorant Garamond', Georgia, serif"

// Egységes színek a 3 sablonhoz
const COLOR_HEADING = '#1f2a24'
const COLOR_BODY = '#1f2a24'
const COLOR_ACCENT = '#5c4220'
const COLOR_SMALL = '#3f4a44'
// 2026-05-30 (konfirmáció spec): mély-fekete a Cinzel szövegekhez
const COLOR_BLACK = '#0B0B0A'
// 2026-05-30 (temetés / gyászjelentés spec): fekete háttér + fehér/szürke szövegek
const FONT_CINZEL_DECO = "'Cinzel Decorative', 'Cinzel', Georgia, serif"
const COLOR_GRIEF_WHITE = '#F5F5F1'  // fő fehér
const COLOR_GRIEF_GRAY = '#D9D9D4'   // másodlagos szürke
const COLOR_GRIEF_MUTED = '#C8C8C2'  // halvány szürke

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
    // v8 (2026-05-29): user-screenshot szerint y=32 a KERESZTELŐI cím belsejébe
    // került (rendering offset ~+5-10%). y=23 a gap-ben, a cím FÖLÉ.
    id: 'congregationName',
    label: 'Gyülekezet neve (felső sor)',
    defaultValue: '{{congregationName}}',
    x: 10,
    y: 23.0,
    width: 80,
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
    x: 10,
    y: 50.0,
    width: 80,
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
    // v8 (2026-05-29): user-kérés: sorkizárt + a {{baptismCongregation}}-ből
    // eltávolítva a "-ben" suffix (a mapper most már önállóan adja hozzá).
    id: 'paragraph',
    label: 'Fő szöveg (5-6 sor)',
    defaultValue: '{{parentsNames}} gyermekét, aki {{birthPlace}} született {{birthDate}}, és akit a {{baptismCongregation}} {{baptismDate}} a szent keresztség által az Atya, Fiú, Szentlélek Isten szövetségébe, a keresztyén Anyaszentegyházba befogadtunk.',
    x: 13,
    y: 53.5,
    width: 74,
    fontSize: 1.8,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_HEADING,
    textAlign: 'justify',
    lineHeight: 1.45,
    letterSpacing: 0,
    multiline: true,
    hint: 'A teljes bekezdést itt szerkesztheted. A {{placeholderek}} az adatokból kerülnek behelyettesítésre.',
  },
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 10,
    y: 65.0,
    width: 80,
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
    x: 10,
    y: 75.5,
    width: 28,
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
    x: 10,
    y: 78.0,
    width: 28,
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
    x: 60,
    y: 75.5,
    width: 28,
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
    x: 60,
    y: 78.0,
    width: 28,
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
// 1.b KERESZTELÉSI EMLÉKLAP — KÉK variant (kék-fehér népi díszítésű)
// ─────────────────────────────────────────────────────────────────────────
//
// Spec: migration-docs/.../Regi/keresztelesi_emleklap_web_rekonstrukcio_specifikacio.md
// Koordinátarendszer: 1024 × 1536 px → %-ban átszámítva.
// Háttér: fehér + kék virágos népi díszítések (Keret.png).
// Fő szín: #0B2B66 (sötétkék), másodlagos: #1B2440 (sötét szürkéskék).

// 2026-05-30 v4 (Hagyományos kék – Keret_1.png új spec):
//   minden szöveg egységesen mélykék (#061B5C), kék-fehér népi háttéren.
const COLOR_KEK_BLUE = '#061B5C'

// 2026-05-30 (esketés Pixelpontos spec): a házasságkötési emléklaphoz arany
// egyházközség-név (#B58942) + sötét fő-szöveg (#2A2728).
const COLOR_ESK_GOLD = '#B58942'
const COLOR_ESK_DARK = '#2A2728'
// 2026-05-30 (Hagyományos esketés — piros népi keret spec):
//   sötét vörös fejlécek/nevek (#641A16), sötét fő-szöveg (#2E2523).
const COLOR_ESK_DARK_RED = '#641A16'
const COLOR_ESK_HAGY_BODY = '#2E2523'

// 2026-05-30 v4 (Hagyományos kék – Keret_1.png + kereszteloi_emleklap_szoveg_elhelyezes.md):
// Vászon: 1054 × 1492 px. Színek: egységes mélykék #061B5C.
// Konvenció: a renderer x/y a mező BAL FELSŐ sarka. A spec center-ben adja meg,
// ezért: x_field = (x_center_pct - width_field/2),
//        y_field = y_center_pct - fontSize/2.
const KERESZTELESI_KEK_FIELDS: EmleklapField[] = [
  // 4.1 Egyházközség neve — Cinzel
  // 2026-05-30 fix: a spec 30 px font + ls=8 px hosszú gyülekezet-névnél
  // (pl. „BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG") kilóg a kék díszítésű széleken
  // („B" + „G" levágódott). Csökkentett betűméret és betűköz, szélesebb width.
  {
    id: 'congregationName',
    label: 'Gyülekezet neve',
    defaultValue: '{{congregationName}}',
    x: 7,
    y: 20.4,
    width: 86,
    fontSize: 1.55,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.13,
    textTransform: 'uppercase',
    hint: 'pl. BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG',
  },
  // 4.2 Főcím „KERESZTELŐI" — Cinzel 82px, ls=9px (=0.110em), center (527,406)
  {
    id: 'titleLine1',
    label: 'Főcím – 1. sor',
    defaultValue: 'KERESZTELŐI',
    x: 10,
    y: 24.46,
    width: 80,
    fontSize: 5.50,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0.110,
    textTransform: 'uppercase',
  },
  // 4.3 Alcím „EMLÉKLAP" — Cinzel 31px, ls=15px (=0.484em), center (527,485)
  {
    id: 'titleLine2',
    label: 'Főcím – 2. sor (alcím)',
    defaultValue: 'EMLÉKLAP',
    x: 30,
    y: 31.47,
    width: 40,
    fontSize: 2.08,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.484,
    textTransform: 'uppercase',
  },
  // 4.4 Köszöntő „BÜSZKÉN KÖSZÖNTJÜK" — Cinzel 31px, ls=4px (=0.129em), center (527,578)
  {
    id: 'greeting',
    label: 'Köszöntő sor',
    defaultValue: 'BÜSZKÉN KÖSZÖNTJÜK',
    x: 20,
    y: 37.70,
    width: 60,
    fontSize: 2.08,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.129,
    textTransform: 'uppercase',
  },
  // 4.5 Gyermek neve — Great Vibes, hosszú név wrap-pelhet 2 sorra.
  // 2026-05-30 fix v2: a spec 78 px (5.23%) hosszú név (pl. „Kádár Viktória-
  // Olivia") esetén 2 sorra ment és a 2. sor rácsúszott a „testvérünket"-re.
  // 4.0% font (≈60 px) + szélesebb (88%) width → 22-25 karakteres név még 1
  // sorba fér; ennél hosszabb 2 sorba wrap-pel és sűrűbb lineHeight=1.05-tel
  // még belefér a „testvérünket" elé.
  {
    id: 'fullName',
    label: 'Keresztelt neve',
    defaultValue: '{{fullName}}',
    x: 6,
    y: 41.5,
    width: 88,
    fontSize: 3.66, // 2026-05-30: -5 px (≈55 px @ 1492-es vászon)
    fontFamily: FONT_CURSIVE,
    fontWeight: 400,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
    multiline: true,
  },
  // 4.6 „testvérünket" — Cormorant 29px SemiBold.
  // 2026-05-30: y 48.09 → 50.5% (kompromisszum: 1-soros névnél kicsivel
  // távolabb, 2-soros wrap-pelt névnél is van levegő — fullName 2 sor bottom
  // ≈49.9%, így legalább 0.6% kiscsi puffer).
  {
    id: 'relativeLabel',
    label: '„testvérünket" sor',
    defaultValue: 'testvérünket',
    x: 40,
    y: 50.5,
    width: 20,
    fontSize: 1.94,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.103,
  },
  // 4.7-4.12 Folyószöveg (6 sor) — Cormorant 29px, ls=2.2px (=0.076em),
  // sorköz 42px (lineHeight=1.448). x_center=527, width=700px → 66.4%, x=16.8%
  // y_center=818 (sor 1) → y_top=53.86%. Multiline + auto-wrap.
  {
    id: 'paragraph',
    label: 'Törzsszöveg (5-6 sor)',
    defaultValue: '{{parentsNames}} gyermekét, aki {{birthPlace}} született {{birthDate}}, és akit a {{baptismCongregation}} {{baptismDate}} a szent keresztség által az Atya, Fiú, Szentlélek Isten szövetségébe, a keresztyén Anyaszentegyházba befogadtunk.',
    x: 16.80,
    y: 53.86,
    width: 66.41,
    fontSize: 1.94,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.448,
    letterSpacing: 0.076,
    multiline: true,
    hint: 'A teljes bekezdést itt szerkesztheted.',
  },
  // 4.13 Dátum „Barátos, …" — Cormorant 31px, ls=2.5px (=0.081em), center (527,1109)
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 30,
    y: 73.29,
    width: 40,
    fontSize: 2.08,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.081,
  },
  // 4.14 Bal aláíró név — Cormorant 25px SemiBold, ls=1.5px (=0.06em), center (309,1238)
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 18.32,
    y: 82.14,
    width: 22,
    fontSize: 1.68,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  // 4.15 Bal tisztség — Cormorant 17px SemiBold, ls=1.5px (=0.088em), center (309,1273)
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 18.32,
    y: 84.75,
    width: 22,
    fontSize: 1.14,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.088,
    textTransform: 'uppercase',
  },
  // 4.16 Jobb aláíró név — center (740,1238)
  {
    id: 'wardenName',
    label: 'Gondnok neve',
    defaultValue: '{{wardenName}}',
    x: 59.21,
    y: 82.14,
    width: 22,
    fontSize: 1.68,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
  },
  // 4.17 Jobb tisztség — center (740,1273)
  {
    id: 'wardenRole',
    label: 'Gondnok titulus',
    defaultValue: 'GONDNOK',
    x: 59.21,
    y: 84.75,
    width: 22,
    fontSize: 1.14,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_KEK_BLUE,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.088,
    textTransform: 'uppercase',
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 2. HÁZASSÁGKÖTÉSI EMLÉKLAP
// ─────────────────────────────────────────────────────────────────────────

// 2026-05-30 v9 — esketési_emleklap_pixelpontos_spec.md alapján.
// Vászon: 1448 × 2047 px (A4 portrait). Center-anchored mezők:
//   x_field = center_x_pct - width/2,  y_field = center_y_pct - fontSize/2
// Színek: arany (#B58942) az egyházközség-névhez, sötét (#2A2728) a többihez.
const ESKETESI_FIELDS: EmleklapField[] = [
  // 6.1 Egyházközség neve — Cinzel 32 px, ls=6 px (=0.1875em), center (724, 488)
  {
    id: 'congregationName',
    label: 'Gyülekezet neve',
    defaultValue: '{{congregationName}}',
    x: 10,
    y: 23.05,
    width: 80,
    fontSize: 1.563,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_ESK_GOLD,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.1875,
    textTransform: 'uppercase',
  },
  // 6.1.1 Vőlegény neve — Cormorant Garamond 56 px italic 700, center (724, 815)
  {
    id: 'husbandName',
    label: 'Vőlegény neve',
    defaultValue: '{{husbandName}}',
    x: 15,
    y: 38.44,
    width: 70,
    fontSize: 2.736,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    italic: true,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
  },
  // 6.1.2 Vőlegény szül. sora — Cormorant 34 px 500, ls=0.5 px (=0.0147em), center (724, 896)
  {
    id: 'husbandBirth',
    label: 'Vőlegény születése',
    defaultValue: 'aki {{husbandBirthPlace}} született {{husbandBirthDate}}',
    x: 10,
    y: 42.94,
    width: 80,
    fontSize: 1.661,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.015,
  },
  // 6.1.3 „és" — Cormorant 34 px 500, center (724, 955)
  {
    id: 'andLabel',
    label: '„és" szó',
    defaultValue: 'és',
    x: 45,
    y: 45.82,
    width: 10,
    fontSize: 1.661,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 6.1.4 Menyasszony neve — Cormorant 56 px italic 700, center (724, 1033)
  {
    id: 'wifeName',
    label: 'Menyasszony neve',
    defaultValue: '{{wifeName}}',
    x: 15,
    y: 49.09,
    width: 70,
    fontSize: 2.736,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    italic: true,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
  },
  // 6.1.5 Menyasszony szül. sora — Cormorant 34 px 500, center (724, 1113)
  {
    id: 'wifeBirth',
    label: 'Menyasszony születése',
    defaultValue: 'aki {{wifeBirthPlace}} született {{wifeBirthDate}}',
    x: 10,
    y: 53.54,
    width: 80,
    fontSize: 1.661,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.015,
  },
  // 7. Házasságkötési 3-soros blokk — Cormorant 35 px 500, gap 66 px (lineHeight=1.886).
  // 1. sor center y=1226, font 35 px → y_top=59.03%. Fix \n sortörés.
  {
    id: 'paragraph',
    label: 'Esketés-szöveg (3 sor)',
    defaultValue: 'a {{marriageCongregation}}\n{{marriageDate}} Isten és a gyülekezet színe előtt\nházassági szent szövetséget kötött.',
    x: 10,
    y: 59.03,
    width: 80,
    fontSize: 1.710,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.886,
    letterSpacing: 0,
    multiline: true,
    hint: 'Fix 3 sorra tördelve (\\n-nel). A „-én" suffix-et a placeholder már tartalmazza.',
  },
  // 8. Igevers — Cormorant 38 px 700, 2 sor, gap 60 px (lineHeight=1.579).
  // center (724, 1452) → y_top=70.00%.
  {
    id: 'biblicalVerse',
    label: 'Igevers (idézet)',
    defaultValue: '„{{verseText}}" ({{verseReference}})',
    x: 10,
    y: 70.00,
    width: 80,
    fontSize: 1.857,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.579,
    letterSpacing: 0,
    multiline: true,
    hint: 'pl. „Egymás terhét hordozzátok…" (Gal 6,2). \\n-nel törhető 2 sorra.',
  },
  // 9. Alsó dátum — Cormorant 35 px 500, center (724, 1603) → y_top=77.46%.
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 20,
    y: 77.46,
    width: 60,
    fontSize: 1.710,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 11. Bal név — Cormorant 31 px 600, center x=414 (28.59%), y=1838 → y_top=89.04%.
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 16.09,
    y: 89.04,
    width: 25,
    fontSize: 1.514,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  // 11. Bal tisztség — Cormorant 19 px 500, y=1888 → y_top=91.77%.
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 16.09,
    y: 91.77,
    width: 25,
    fontSize: 0.928,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  },
  // 11. Jobb név — center x=1030 (71.13%), y=1838.
  {
    id: 'wardenName',
    label: 'Gondnok neve',
    defaultValue: '{{wardenName}}',
    x: 58.63,
    y: 89.04,
    width: 25,
    fontSize: 1.514,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  // 11. Jobb tisztség
  {
    id: 'wardenRole',
    label: 'Gondnok titulus',
    defaultValue: 'GONDNOK',
    x: 58.63,
    y: 91.77,
    width: 25,
    fontSize: 0.928,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_DARK,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 2b. HÁZASSÁGKÖTÉSI EMLÉKLAP — Hagyományos (piros népi keret)
//     Spec: hazassagkotesi_emleklap_piros_keret_pixelterv.md (1055×1491 px)
//     Center-anchored: x_field = center_x_pct - width/2, y_field = center_y_pct - font/2
// ─────────────────────────────────────────────────────────────────────────
const ESKETESI_HAGYOMANYOS_FIELDS: EmleklapField[] = [
  // 6.1 Egyházközség — Cinzel 23 px 600, ls=3.5 px (=0.152em), center (528, 245)
  {
    id: 'congregationName',
    label: 'Gyülekezet neve',
    defaultValue: '{{congregationName}}',
    x: 10,
    y: 15.66,
    width: 80,
    fontSize: 1.543,
    fontFamily: FONT_CINZEL,
    fontWeight: 600,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.152,
    textTransform: 'uppercase',
  },
  // 6.1 Főcím 1 „HÁZASSÁGKÖTÉSI" — Cinzel 56 px 600, ls=3 px (=0.054em), center (528, 359)
  {
    id: 'titleLine1',
    label: 'Főcím – 1. sor',
    defaultValue: 'HÁZASSÁGKÖTÉSI',
    x: 10,
    y: 22.20,
    width: 80,
    fontSize: 3.756,
    fontFamily: FONT_CINZEL,
    fontWeight: 600,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0.054,
    textTransform: 'uppercase',
  },
  // 6.1 Főcím 2 „EMLÉKLAP" — Cinzel 56 px 600, ls=5 px (=0.089em), center (528, 428)
  {
    id: 'titleLine2',
    label: 'Főcím – 2. sor',
    defaultValue: 'EMLÉKLAP',
    x: 10,
    y: 26.83,
    width: 80,
    fontSize: 3.756,
    fontFamily: FONT_CINZEL,
    fontWeight: 600,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0.089,
    textTransform: 'uppercase',
  },
  // 6.2 Férj neve — Cormorant 39 px italic 700, center (528, 544)
  {
    id: 'husbandName',
    label: 'Vőlegény neve',
    defaultValue: '{{husbandName}}',
    x: 15,
    y: 35.18,
    width: 70,
    fontSize: 2.616,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    italic: true,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
  },
  // 6.2 Férj szül. — Cormorant 25 px 500, center (528, 600)
  {
    id: 'husbandBirth',
    label: 'Vőlegény születése',
    defaultValue: 'aki {{husbandBirthPlace}} született {{husbandBirthDate}}',
    x: 10,
    y: 39.40,
    width: 80,
    fontSize: 1.677,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 6.2 „és" — Cormorant 24 px 500, center (528, 645)
  {
    id: 'andLabel',
    label: '„és" szó',
    defaultValue: 'és',
    x: 45,
    y: 42.45,
    width: 10,
    fontSize: 1.610,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 6.2 Feleség neve — Cormorant 39 px italic 700, center (528, 699)
  {
    id: 'wifeName',
    label: 'Menyasszony neve',
    defaultValue: '{{wifeName}}',
    x: 15,
    y: 45.57,
    width: 70,
    fontSize: 2.616,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    italic: true,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
  },
  // 6.2 Feleség szül. — center (528, 755)
  {
    id: 'wifeBirth',
    label: 'Menyasszony születése',
    defaultValue: 'aki {{wifeBirthPlace}} született {{wifeBirthDate}}',
    x: 10,
    y: 49.80,
    width: 80,
    fontSize: 1.677,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 6.3 Házasságkötési 3-soros blokk — Cormorant 24 px 500, gap 37-38 px (lineHeight≈1.563)
  // Center y1=824 → y_top=54.46%.
  {
    id: 'paragraph',
    label: 'Esketés-szöveg (3 sor)',
    defaultValue: 'a {{marriageCongregation}}\n{{marriageDate}} Isten és a gyülekezet színe előtt\nházassági szent szövetséget kötött.',
    x: 10,
    y: 54.46,
    width: 80,
    fontSize: 1.610,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.563,
    letterSpacing: 0,
    multiline: true,
    hint: 'Fix 3 sorra tördelve (\\n-nel).',
  },
  // 6.4 Igevers 2 sor — Cormorant 30 px italic 600, gap 48 px (lineHeight=1.6)
  // Center (528, 958) → y_top=63.24%.
  {
    id: 'biblicalVerse',
    label: 'Igevers (idézet)',
    defaultValue: '„{{verseText}}" ({{verseReference}})',
    x: 10,
    y: 63.24,
    width: 80,
    fontSize: 2.012,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    italic: true,
    color: COLOR_ESK_DARK_RED,
    textAlign: 'center',
    lineHeight: 1.6,
    letterSpacing: 0,
    multiline: true,
    hint: 'pl. „Egymás terhét hordozzátok…" (Gal 6,2). \\n-nel törhető 2 sorra.',
  },
  // 6.5 Alsó dátum — Cormorant 27 px 500, center (528, 1074) → y_top=71.12%.
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 20,
    y: 71.12,
    width: 60,
    fontSize: 1.811,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0,
  },
  // 9. Bal név — Cormorant 23 px 600, center x=316 (29.95%), y=1202 → y_top=79.85%.
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 17.95,
    y: 79.85,
    width: 24,
    fontSize: 1.543,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  // 9. Bal tisztség — Cormorant 13 px 500, y=1230 → y_top=82.07%.
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 17.95,
    y: 82.07,
    width: 24,
    fontSize: 0.872,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  // 9. Jobb név — center x=740 (70.14%).
  {
    id: 'wardenName',
    label: 'Gondnok neve',
    defaultValue: '{{wardenName}}',
    x: 58.14,
    y: 79.85,
    width: 24,
    fontSize: 1.543,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  // 9. Jobb tisztség
  {
    id: 'wardenRole',
    label: 'Gondnok titulus',
    defaultValue: 'GONDNOK',
    x: 58.14,
    y: 82.07,
    width: 24,
    fontSize: 0.872,
    fontFamily: FONT_SERIF,
    fontWeight: 500,
    color: COLOR_ESK_HAGY_BODY,
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
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
// v9 (2026-05-30): teljes újraírás a konfirmacios_emleklap_web_rekonstrukcio_specifikacio.md alapján.
// Koordinátarendszer: 1448 × 2048 px → %-os konverzió.
// Pl. y=776 px → 776/2048 = 37.89%; fontSize=25 px → 25/2048 = 1.22%.
// A center-anchored elemek bal-felső sarkát kiszámoljuk: leftX = centerX - width/2.
const KONFIRMACIOI_FIELDS: EmleklapField[] = [
  // v4 (2026-05-29) — konfirmacioi: bevezető + név a felső vonal alatt szorosan,
  // paragraph nagyobb + félkövér, aláírások az aláírás-vonalakhoz igazítva.
  // 7.1 Bevezető (spec: x=724, y=776, w=850, fontSize=25, ls=8px, fw=500)
  {
    id: 'introLabel',
    label: 'Bevezető (Alulírottak hivatalosan bizonyítjuk)',
    defaultValue: 'ALULÍROTTAK HIVATALOSAN BIZONYÍTJUK, HOGY',
    x: 20.65,
    y: 37.89,
    width: 58.70,
    fontSize: 1.22,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_BLACK,
    textAlign: 'center',
    lineHeight: 1.36,
    letterSpacing: 0.32,
    textTransform: 'uppercase',
  },
  // 7.2 Konfirmált neve (spec: x=724, y=820, w=700, fontSize=33, ls=8px, fw=700)
  {
    id: 'fullName',
    label: 'Konfirmált teljes neve',
    defaultValue: '{{fullName}}',
    x: 25.83,
    y: 40.04,
    width: 48.34,
    fontSize: 1.61,
    fontFamily: FONT_CINZEL,
    fontWeight: 700,
    color: COLOR_BLACK,
    textAlign: 'center',
    lineHeight: 1.27,
    letterSpacing: 0.24,
    textTransform: 'uppercase',
  },
  // 7.3 Személyes adat sor (spec: x=724, y=880, w=1150, fontSize=25, ls=8px)
  {
    id: 'personalLine',
    label: 'Személyes adat sor (szül. hely + dátum)',
    defaultValue: 'TESTVÉRÜNK, AKI {{birthPlace}}, {{birthDate}} SZÜLETETT,',
    x: 10.29,
    y: 42.97,
    width: 79.42,
    fontSize: 1.22,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_BLACK,
    textAlign: 'center',
    lineHeight: 1.36,
    letterSpacing: 0.32,
    textTransform: 'uppercase',
  },
  // 7.4 Törzsszöveg (spec: 8 sor, x=724, w=1250, fontSize=25, ls=8px, y=927-1262)
  // Multiline-bal egy mezőben tartjuk — a renderer ránéz a 86.32% width-re
  // és letter-spacing 0.32-rel hasonló sortörést ad. UPPERCASE.
  {
    id: 'paragraph',
    label: 'Konfirmációs törzsszöveg',
    defaultValue: 'AKIT A {{baptismCongregation}} {{baptismDate}} MEGKERESZTELTEK, MIUTÁN A GYÜLEKEZET PRESBITEREI A HEIDELBERGI KÁTÉ ALAPJÁN HITE FELŐL MEGVIZSGÁLTÁK, A MAI NAPON A {{confirmCongregation}} A SZENT GYÜLEKEZET ELŐTT IGAZ HITÉRŐL VALLÁST, EGYHÁZA IRÁNTI HŰSÉGÉRE FOGADÁST TETT. MINDEZEK ALAPJÁN A REFORMÁTUS ANYASZENTEGYHÁZ ÖNÁLLÓ TAGJAI KÖZÉ FELVETTÜK ÉS AZ ÚRVACSORA VÉTELÉRE FELHATALMAZTUK.',
    x: 6.84,
    y: 45.27,
    width: 86.32,
    fontSize: 1.22,
    fontFamily: FONT_CINZEL,
    fontWeight: 500,
    color: COLOR_BLACK,
    textAlign: 'center',
    lineHeight: 1.36,
    letterSpacing: 0.32,
    textTransform: 'uppercase',
    multiline: true,
  },
  // 8. Kelt (spec: x=724, y=1578, w=700, fontSize=26, ls=8px, fw=400)
  {
    id: 'placeAndDate',
    label: 'Kelt (hely + dátum)',
    defaultValue: '{{issueLocation}}, {{issueDate}}',
    x: 25.83,
    y: 77.05,
    width: 48.34,
    fontSize: 1.27,
    fontFamily: FONT_CINZEL,
    fontWeight: 400,
    color: COLOR_BLACK,
    textAlign: 'center',
    lineHeight: 1.31,
    letterSpacing: 0.31,
    textTransform: 'uppercase',
  },
  // 9.1 Főgondnok BAL (spec: x=255 left, y=1650, w=330, fontSize=26, ls=7px, fw=400)
  {
    id: 'mainWardenName',
    label: 'Fő-gondnok neve',
    defaultValue: '{{mainWardenName}}',
    x: 17.61,
    y: 80.57,
    width: 22.79,
    fontSize: 1.27,
    fontFamily: FONT_CINZEL,
    fontWeight: 400,
    color: COLOR_BLACK,
    textAlign: 'left',
    lineHeight: 1.62,
    letterSpacing: 0.27,
    textTransform: 'uppercase',
  },
  {
    id: 'mainWardenRole',
    label: 'Fő-gondnok titulus',
    defaultValue: 'FŐGONDNOK',
    x: 17.61,
    y: 82.62, // +42px (line-height) = +2.05%
    width: 22.79,
    fontSize: 1.27,
    fontFamily: FONT_CINZEL,
    fontWeight: 400,
    color: COLOR_BLACK,
    textAlign: 'left',
    lineHeight: 1.62,
    letterSpacing: 0.27,
    textTransform: 'uppercase',
  },
  // 9.2 Lelkipásztor JOBB (spec: x=980 left, y=1650, w=370, fontSize=26, ls=7px)
  {
    id: 'pastorName',
    label: 'Lelkipásztor neve',
    defaultValue: '{{pastorName}}',
    x: 67.68,
    y: 80.57,
    width: 25.55,
    fontSize: 1.27,
    fontFamily: FONT_CINZEL,
    fontWeight: 400,
    color: COLOR_BLACK,
    textAlign: 'left',
    lineHeight: 1.62,
    letterSpacing: 0.27,
    textTransform: 'uppercase',
  },
  {
    id: 'pastorRole',
    label: 'Lelkipásztor titulus',
    defaultValue: 'LELKIPÁSZTOR',
    x: 67.68,
    y: 82.62,
    width: 25.55,
    fontSize: 1.27,
    fontFamily: FONT_CINZEL,
    fontWeight: 400,
    color: COLOR_BLACK,
    textAlign: 'left',
    lineHeight: 1.62,
    letterSpacing: 0.27,
    textTransform: 'uppercase',
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 4. TEMETÉSI EMLÉKLAP / GYÁSZJELENTÉS
// ─────────────────────────────────────────────────────────────────────────
//
// 2026-05-30: a gyaszjelentes_web_rekonstrukcio_specifikacio.md spec alapján.
// Koordinátarendszer: 2480 × 3508 px (A4 300 DPI) — %-ban átszámítva.
// Fekete háttér (#020202), fehér/szürke szövegek.
// Központi vonal: x=1240 px (50%).

const TEMETESI_FIELDS: EmleklapField[] = [
  // 2026-05-30: a "GYÁSZJELENTÉS" főcím (6.1 spec) ELTÁVOLÍTVA — a háttérkép
  // már tartalmazza, nem kell külön szöveg-rétegbe írni. A bevezető helye
  // (y=26.94%) változatlan, mivel az abszolút koordináta.
  // 6.3 Bevezető szöveg (spec: x=1240, y=945, w=1450, fs=60, ls=1px)
  // 2026-05-30: a user kérésére a default szöveg "egyháztagunk és hitbeli
  // testvérünk" — családi rokonság helyett az egyházi kontextus. A user
  // a vászonon (in-place) cserélheti pl. "édesapánk, nagyapánk és rokonunk"-ra.
  {
    id: 'intro',
    label: 'Bevezető (rokoni viszony)',
    defaultValue: 'Mély fájdalommal tudatjuk, hogy szeretett\n{{relativeRelation}}',
    x: 20.77, // (1240-725)/2480
    y: 26.94, // 945/3508
    width: 58.47, // 1450/2480
    fontSize: 1.71, // 60/3508
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.37, // 82/60
    letterSpacing: 0.017,
    multiline: true,
    hint: 'pl. "édesapánk, nagyapánk és rokonunk"',
  },
  // 6.4 Név (spec: x=1240, y=1225, w=1600, fs=158, ls=8px, fw=700)
  {
    id: 'fullName',
    label: 'Elhunyt neve',
    defaultValue: '{{fullName}}',
    x: 17.74,
    y: 34.92,
    width: 64.52,
    fontSize: 4.50,
    fontFamily: FONT_SERIF,
    fontWeight: 700,
    color: COLOR_GRIEF_WHITE,
    textAlign: 'center',
    lineHeight: 1.11,
    letterSpacing: 0.051,
    textTransform: 'uppercase',
  },
  // 6.5 Életkor (spec: x=1240, y=1445, w=1550, fs=57)
  {
    id: 'ageContext',
    label: 'Életkor / körülmény',
    defaultValue: 'életének {{age}}. évében, türelemmel viselt betegség után',
    x: 18.75,
    y: 41.19,
    width: 62.50,
    fontSize: 1.62,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.26,
    letterSpacing: 0.018,
  },
  // 6.6 Elhunyt dátuma (spec: x=1240, y=1625, w=1550, fs=72, ls=3px, fw=600)
  // 2026-05-30: a "csendesen" jelző eltávolítva — csak "elhunyt"
  {
    id: 'deathDate',
    label: 'Elhunyt dátuma',
    defaultValue: '{{deathDate}} elhunyt.',
    x: 18.75,
    y: 46.32,
    width: 62.50,
    fontSize: 2.05,
    fontFamily: FONT_SERIF,
    fontWeight: 600,
    color: COLOR_GRIEF_WHITE,
    textAlign: 'center',
    lineHeight: 1.25,
    letterSpacing: 0.042,
  },
  // 6.7 Temetési információk (spec: x=1240, y=1850, w=1550, fs=62, ls=1px)
  // 2026-05-30: az idő 24 órás formátumban (HH:MM órakor) — a funeralDate
  // placeholder a teljes "YYYY. hónap N-én, HH:MM órakor" alakot ad.
  {
    id: 'funeral',
    label: 'Temetési info',
    defaultValue: 'Búcsúztatása református szertartás szerint\n{{funeralDate}}\n{{funeralPlace}}',
    x: 18.75,
    y: 52.74,
    width: 62.50,
    fontSize: 1.77,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.35,
    letterSpacing: 0.016,
    multiline: true,
  },
  // 2026-05-30 ÚJ: virrasztás mező — opcionális. A háttér gap-jébe (y=60.5%)
  // illeszkedik a funeral (vége ~y=60%) és memory (y=64.28%) közé.
  {
    id: 'vigil',
    label: 'Virrasztás (opcionális)',
    defaultValue: '{{vigilLine}}',
    x: 18.75,
    y: 60.50,
    width: 62.50,
    fontSize: 1.62,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    italic: true,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.30,
    letterSpacing: 0.016,
    multiline: true,
    hint: 'pl. "Virrasztás: 2026. március 24-én 19:00 órakor, a ravatalozóban"',
  },
  // 6.8 Emlékező sor (spec: x=1240, y=2255, w=1500, fs=65, italic)
  {
    id: 'memory',
    label: 'Emlékező sor',
    defaultValue: 'Emlékét szeretettel és kegyelettel megőrizzük.',
    x: 19.76,
    y: 64.28,
    width: 60.48,
    fontSize: 1.85,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    italic: true,
    color: COLOR_GRIEF_WHITE,
    textAlign: 'center',
    lineHeight: 1.26,
    letterSpacing: 0.031,
  },
  // 6.9 Gyászolók (spec: x=1240, y=2485, w=1450, fs=62)
  // 2026-05-30: csak a {{mourners}} placeholder — ha üres, a teljes
  // sor eltűnik. A "Gyászolják:" prefix-et a felhasználó írja be ha kéri.
  {
    id: 'family',
    label: 'Gyászolók',
    defaultValue: '{{mourners}}',
    x: 20.77,
    y: 70.83,
    width: 58.47,
    fontSize: 1.77,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.32,
    letterSpacing: 0.016,
    multiline: true,
  },
  // 6.10 Igevers (spec: x=1240, y=2875, w=1200, fs=52, italic)
  {
    id: 'verse',
    label: 'Igevers',
    defaultValue: '„{{verseText}}"',
    x: 25.81,
    y: 81.96,
    width: 48.39,
    fontSize: 1.48,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    italic: true,
    color: COLOR_GRIEF_GRAY,
    textAlign: 'center',
    lineHeight: 1.31,
    letterSpacing: 0.019,
    multiline: true,
  },
  // 6.11 Igehely (spec: x=1240, y=3065, w=500, fs=44, ls=3px)
  {
    id: 'verseRef',
    label: 'Igehely',
    defaultValue: '{{verseReference}}',
    x: 39.92,
    y: 87.37,
    width: 20.16,
    fontSize: 1.25,
    fontFamily: FONT_SERIF,
    fontWeight: 400,
    color: COLOR_GRIEF_MUTED,
    textAlign: 'center',
    lineHeight: 1.27,
    letterSpacing: 0.068,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// Sablon-katalógus (8 sablon: 3 sákramentum × EREK/KEREK + temetés/gyászjelentés)
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
  // 2026-05-30: új kék-fehér népi díszítésű keresztelési sablon
  // (spec: migration-docs/.../Regi/keresztelesi_emleklap_web_rekonstrukcio_specifikacio.md)
  // Eredeti dimenzió 1024×1536 (aspect 0.667) — A4-re skálázzuk (a háttér
  // enyhén nyúlik, de a relatív szöveg-pozíciók megmaradnak).
  {
    id: 'kereszteles-kek',
    name: 'Keresztelői emléklap — KÉK (kék-fehér népi díszítés)',
    type: 'kereszteles',
    variant: 'kek',
    backgroundImage: '/templates/emleklap/kek-kereszteloi-hatter.png',
    aspectRatio: 210 / 297,
    fields: KERESZTELESI_KEK_FIELDS,
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
  // 2026-05-30: új hagyományos (piros népi keret) esketési sablon.
  // Spec: hazassagkotesi_emleklap_piros_keret_pixelterv.md (1055×1491 px)
  {
    id: 'esketes-hagyomanyos',
    name: 'Házasságkötési emléklap — Hagyományos (piros népi keret)',
    type: 'esketes',
    variant: 'hagyomanyos',
    backgroundImage: '/templates/emleklap/hagyomanyos-esketesi-hatter.png',
    aspectRatio: 210 / 297,
    fields: ESKETESI_HAGYOMANYOS_FIELDS,
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
  // 2026-05-30: gyászjelentés sablon. Nincs EREK/KEREK variáció — egy
  // egységes, fekete-fehér ornamentikás (magyar népi motívumos) dizájn.
  {
    id: 'temetes-erek',
    name: 'Gyászjelentés',
    type: 'temetes',
    variant: 'erek',
    backgroundImage: '/templates/emleklap/temetes-hatter.png',
    aspectRatio: 210 / 297,
    fields: TEMETESI_FIELDS,
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
  temetes: {
    fullName: 'KOVÁCS ISTVÁN',
    relativeRelation: 'édesapánk, nagyapánk és rokonunk',
    age: '78',
    deathDate: '2026. március 18-án',
    funeralDate: '2026. március 25-én, szerdán 14:00',
    funeralPlace: 'a Felsővárosi Református Temető ravatalozójában.',
    mourners: 'Szerető családja és mindazok,\nakik ismerték és tisztelték',
    verseText: 'Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.',
    verseReference: 'Jób 1,21',
  },
}
