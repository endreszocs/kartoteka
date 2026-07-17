/**
 * Iktató sablonok — típusok, konstansok, placeholder renderelés.
 *
 * A sablonok a `iktato_sablonok` táblában tárolódnak. A `tartalom`
 * mező HTML-t tartalmaz placeholderekkel (pl. `{{nev}}`, `{{datum}}`),
 * amiket a generálás során a user vagy a rendszer kitölti.
 *
 * Gyakran használt placeholders (automatikusan kitölthetők):
 *  - {{gyulekezet}} — a gyülekezet hivatalos neve
 *  - {{lelkipasztor}} — a lelkipásztor neve
 *  - {{iratszam}} — pl. "2025/152" (év/sorszám)
 *  - {{datum}} — mai dátum, formázott (pl. 2026. április 15.)
 *  - {{helyseg}} — a gyülekezet címe/helysége
 *  - {{ev}} — aktuális év
 *
 * Felhasználó által tölthetők:
 *  - {{nev}}, {{cim}}, {{szul_datum}}, {{lakcim}}, stb.
 */

export const TEMPLATE_TYPES = [
  'igazolas',
  'level',
  'hatarozat',
  'meghivo',
  'jegyzokonyv',
  'egyeb',
] as const
export type TemplateType = (typeof TEMPLATE_TYPES)[number]

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  igazolas: 'Igazolás',
  level: 'Levél',
  hatarozat: 'Határozat',
  meghivo: 'Meghívó',
  jegyzokonyv: 'Jegyzőkönyv',
  egyeb: 'Egyéb',
}

export const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  igazolas: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  level: 'bg-blue-50 text-blue-700 ring-blue-200',
  hatarozat: 'bg-amber-50 text-amber-700 ring-amber-200',
  meghivo: 'bg-violet-50 text-violet-700 ring-violet-200',
  jegyzokonyv: 'bg-slate-100 text-slate-700 ring-slate-200',
  egyeb: 'bg-slate-50 text-slate-600 ring-slate-200',
}

export interface FilingTemplate {
  id: string
  congregation_id: string
  nev: string
  tipus: TemplateType
  leiras: string | null
  tartalom: string
  aktiv: boolean
  sorrend: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────
// Placeholder renderelés
// ─────────────────────────────────────────────────────────────────

/**
 * Biztonságos HTML escape — a user-adott placeholder értékekre
 * alkalmazzuk, hogy XSS-t elkerüljünk.
 *
 * A sablon maga (`tartalom`) HTML-t tartalmaz — az admin által
 * megbízható. A VALUES-okat escape-eljük.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Placeholderek kinyerése a sablonból.
 * Pl. "Tisztelt {{nev}}, ..." → ['nev']
 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  const set = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = regex.exec(template)) !== null) {
    set.add(match[1])
  }
  return Array.from(set)
}

/**
 * Sablon renderelése — a placeholderek helyére bekerülnek az értékek.
 * A nem kitöltött placeholderek `________` formában maradnak (hogy a
 * nyomtatott papíron kézzel kitölthetők legyenek).
 */
export function renderTemplate(
  tartalom: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return tartalom.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const val = values[key]
    if (val === undefined || val === null || val === '') {
      return '__________'
    }
    return escapeHtml(String(val))
  })
}

/**
 * Az aktuális dátum magyar formátumban (pl. "2026. április 15.")
 */
export function formatHungarianDate(d?: Date): string {
  const date = d || new Date()
  return date.toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Automatikus placeholder-értékek előállítása a rendszer-kontextusból.
 */
export interface AutoPlaceholderContext {
  gyulekezet?: string | null
  lelkipasztor?: string | null
  iratszam?: string | null
  helyseg?: string | null
}

export function buildAutoValues(ctx: AutoPlaceholderContext): Record<string, string> {
  const now = new Date()
  return {
    gyulekezet: ctx.gyulekezet || '',
    lelkipasztor: ctx.lelkipasztor || '',
    iratszam: ctx.iratszam || '',
    helyseg: ctx.helyseg || '',
    datum: formatHungarianDate(now),
    ev: String(now.getFullYear()),
  }
}

// ─────────────────────────────────────────────────────────────────
// Seed sablonok (default templates)
// ─────────────────────────────────────────────────────────────────

/**
 * Alapértelmezett sablon-kényszerek egy új gyülekezethez. A rendszer
 * első használatkor (vagy egy admin műveletre) ezekkel tölti fel az
 * iktato_sablonok táblát.
 */
export interface SeedTemplate {
  nev: string
  tipus: TemplateType
  leiras: string
  tartalom: string
}

/**
 * A meglévő Vanilla JS "Keresztelési igazolás" sablon HTML formában,
 * placeholderekkel:
 *  - {{gyulekezet}} — automatikusan
 *  - {{nev}} — a keresztelt személy neve
 *  - {{apja_neve}}, {{anyja_neve}} — szülők
 *  - {{szul_datum}} — születési dátum
 *  - {{kereszteles_datuma}} — keresztelési dátum
 *  - {{konfirmalas_datuma}} — konfirmálás dátuma (opcionális)
 *  - {{lelkipasztor}} — automatikusan
 *  - {{datum}} — mai dátum
 *  - {{helyseg}} — a kiállítás helye
 *  - {{iratszam}} — sorszám
 */
const KERESZTELESI_IGAZOLAS = `<div style="padding:50px;font-family:'Times New Roman',serif;line-height:1.6;font-size:14px;">
  <div style="text-align:left;">Szám: {{iratszam}}</div>
  <div style="text-align:center;font-weight:bold;font-size:1.2rem;margin-top:20px;">
    Tárgy: Keresztelési igazolás
  </div>
  <p style="margin-top:40px;text-indent:50px;">
    A <b>{{gyulekezet}}</b> Lelkipásztori Hivatala igazolja, hogy
    <b>{{nev}}</b>, {{apja_neve}} és {{anyja_neve}} református szülők gyermeke
    {{szul_datum}}-án született, a keresztség sákramentumában részesült
    {{kereszteles_datuma}}-én, konfirmált {{konfirmalas_datuma}}-án.
  </p>
  <p style="text-indent:50px;">
    {{nev}} egyházközségünk nyilvántartott tagja, jelen bizonyítványt az ő
    személyes kérésére állítottuk ki.
  </p>
  <div style="margin-top:60px;display:flex;justify-content:space-between;">
    <div>{{helyseg}}, {{datum}}</div>
    <div style="text-align:center;">
      Isten áldásával,<br><br><br>
      _______________________<br>
      {{lelkipasztor}} lelkipásztor
    </div>
  </div>
</div>`

const TAGSAGI_IGAZOLAS = `<div style="padding:50px;font-family:'Times New Roman',serif;line-height:1.6;font-size:14px;">
  <div style="text-align:left;">Szám: {{iratszam}}</div>
  <div style="text-align:center;font-weight:bold;font-size:1.2rem;margin-top:20px;">
    Tárgy: Tagsági igazolás
  </div>
  <p style="margin-top:40px;text-indent:50px;">
    A <b>{{gyulekezet}}</b> Lelkipásztori Hivatala igazolja, hogy
    <b>{{nev}}</b> (szül.: {{szul_datum}}, lakcím: {{lakcim}}) a
    {{gyulekezet}} nyilvántartott tagja.
  </p>
  <p style="text-indent:50px;">
    Jelen igazolást {{indoklas}} céljából, személyes kérésre állítottuk ki.
  </p>
  <div style="margin-top:60px;display:flex;justify-content:space-between;">
    <div>{{helyseg}}, {{datum}}</div>
    <div style="text-align:center;">
      _______________________<br>
      {{lelkipasztor}} lelkipásztor
    </div>
  </div>
</div>`

const ESKETESI_IGAZOLAS = `<div style="padding:50px;font-family:'Times New Roman',serif;line-height:1.6;font-size:14px;">
  <div style="text-align:left;">Szám: {{iratszam}}</div>
  <div style="text-align:center;font-weight:bold;font-size:1.2rem;margin-top:20px;">
    Tárgy: Esketési igazolás
  </div>
  <p style="margin-top:40px;text-indent:50px;">
    A <b>{{gyulekezet}}</b> Lelkipásztori Hivatala igazolja, hogy
    <b>{{ferj_nev}}</b> és <b>{{feleseg_nev}}</b> {{eskuvo_datuma}} napján
    református szertartás szerint házasságot kötöttek a(z) {{gyulekezet}}
    templomában.
  </p>
  <p style="text-indent:50px;">
    Jelen igazolást személyes kérésre állítottuk ki.
  </p>
  <div style="margin-top:60px;display:flex;justify-content:space-between;">
    <div>{{helyseg}}, {{datum}}</div>
    <div style="text-align:center;">
      _______________________<br>
      {{lelkipasztor}} lelkipásztor
    </div>
  </div>
</div>`

const KONFIRMACIOS_IGAZOLAS = `<div style="padding:50px;font-family:'Times New Roman',serif;line-height:1.6;font-size:14px;">
  <div style="text-align:left;">Szám: {{iratszam}}</div>
  <div style="text-align:center;font-weight:bold;font-size:1.2rem;margin-top:20px;">
    Tárgy: Konfirmációs igazolás
  </div>
  <p style="margin-top:40px;text-indent:50px;">
    A <b>{{gyulekezet}}</b> Lelkipásztori Hivatala igazolja, hogy
    <b>{{nev}}</b> (szül.: {{szul_datum}}) a református hitvallást és
    anyaszentegyházunk tanítását ismerve {{konfirmalas_datuma}} napján
    konfirmált.
  </p>
  <p style="text-indent:50px;">
    Jelen igazolást személyes kérésre állítottuk ki.
  </p>
  <div style="margin-top:60px;display:flex;justify-content:space-between;">
    <div>{{helyseg}}, {{datum}}</div>
    <div style="text-align:center;">
      _______________________<br>
      {{lelkipasztor}} lelkipásztor
    </div>
  </div>
</div>`

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    nev: 'Keresztelési igazolás',
    tipus: 'igazolas',
    leiras: 'Keresztség sákramentumában részesült egyháztag számára kiállítható hivatalos igazolás.',
    tartalom: KERESZTELESI_IGAZOLAS,
  },
  {
    nev: 'Konfirmációs igazolás',
    tipus: 'igazolas',
    leiras: 'A konfirmáció tényét rögzítő igazolás.',
    tartalom: KONFIRMACIOS_IGAZOLAS,
  },
  {
    nev: 'Esketési igazolás',
    tipus: 'igazolas',
    leiras: 'Református szertartás szerinti házasságkötést rögzítő igazolás.',
    tartalom: ESKETESI_IGAZOLAS,
  },
  {
    nev: 'Tagsági igazolás',
    tipus: 'igazolas',
    leiras: 'Egyháztagsági státuszt igazoló dokumentum.',
    tartalom: TAGSAGI_IGAZOLAS,
  },
]

// ─────────────────────────────────────────────────────────────────
// Dokumentált placeholder kategóriák (UI tooltiphoz)
// ─────────────────────────────────────────────────────────────────

export const PLACEHOLDER_DOCS: Array<{
  key: string
  label: string
  auto: boolean
  description: string
}> = [
  { key: 'gyulekezet', label: 'Gyülekezet', auto: true, description: 'A gyülekezet hivatalos magyar neve' },
  { key: 'lelkipasztor', label: 'Lelkipásztor', auto: true, description: 'A gyülekezet lelkipásztorának neve' },
  { key: 'iratszam', label: 'Iratszám', auto: true, description: 'Automatikus: év/sorszám' },
  { key: 'datum', label: 'Mai dátum', auto: true, description: 'Automatikus: mai dátum magyar formátumban' },
  { key: 'ev', label: 'Év', auto: true, description: 'Automatikus: aktuális év' },
  { key: 'helyseg', label: 'Helység', auto: true, description: 'A gyülekezet címe/helysége' },
  { key: 'nev', label: 'Név', auto: false, description: 'A személy teljes neve' },
  { key: 'szul_datum', label: 'Születési dátum', auto: false, description: 'A személy születési dátuma' },
  { key: 'lakcim', label: 'Lakcím', auto: false, description: 'A személy lakcíme' },
  { key: 'apja_neve', label: 'Apja neve', auto: false, description: 'Az apa neve' },
  { key: 'anyja_neve', label: 'Anyja neve', auto: false, description: 'Az anya neve' },
  { key: 'kereszteles_datuma', label: 'Keresztelés dátuma', auto: false, description: 'A keresztség dátuma' },
  { key: 'konfirmalas_datuma', label: 'Konfirmálás dátuma', auto: false, description: 'A konfirmálás dátuma' },
  { key: 'ferj_nev', label: 'Férj neve', auto: false, description: 'A házastárs férje' },
  { key: 'feleseg_nev', label: 'Feleség neve', auto: false, description: 'A házastárs felesége' },
  { key: 'eskuvo_datuma', label: 'Esküvő dátuma', auto: false, description: 'A házasságkötés dátuma' },
  { key: 'indoklas', label: 'Indoklás', auto: false, description: 'Az igazolás kiállítási oka' },
  // ─── 2026-07-17 (F6): az igazolás-kiállító (CertificateIssueDialog) személy-alapú
  // placeholderei. auto:false — a régi FilingTemplateGenerator ezekhez nem tölt
  // értéket (ott kézzel tölthetők); az új kiállító az anyakönyvből tölti őket.
  { key: 'nevek', label: 'Nevek (összes kiválasztott)', auto: false, description: 'Az igazolás-kiállítóban kiválasztott összes személy neve összefűzve' },
  { key: 'vallas', label: 'Vallás', auto: false, description: 'A személy vallása (anyakönyvből)' },
  { key: 'kereszteles_helye', label: 'Keresztelés helye', auto: false, description: 'A keresztelés helye (anyakönyvből)' },
  { key: 'keresztszulok', label: 'Keresztszülők', auto: false, description: 'A keresztszülők neve (anyakönyvből)' },
  { key: 'hazastars_nev', label: 'Házastárs neve', auto: false, description: 'A házastárs teljes neve (anyakönyvből)' },
  { key: 'nev_2', label: 'Név (2. személy)', auto: false, description: 'A második kiválasztott személy teljes neve' },
  { key: 'szul_datum_2', label: 'Születési dátum (2. személy)', auto: false, description: 'A második személy születési dátuma' },
  { key: 'apja_neve_2', label: 'Apja neve (2. személy)', auto: false, description: 'A második személy apjának neve' },
  { key: 'anyja_neve_2', label: 'Anyja neve (2. személy)', auto: false, description: 'A második személy anyjának neve' },
  { key: 'kereszteles_datuma_2', label: 'Keresztelés dátuma (2. személy)', auto: false, description: 'A második személy keresztelésének dátuma' },
  { key: 'konfirmalas_datuma_2', label: 'Konfirmálás dátuma (2. személy)', auto: false, description: 'A második személy konfirmálásának dátuma' },
]
