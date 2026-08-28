/**
 * Pénzügyi nyomtatási modul — hivatalos nyomtatványok.
 *
 * Kimenetek:
 *  1. Registru Casa (Kasszakönyv) — havi kassza kimutatás
 *  2. Registru Banca — havi banki kimutatás (bankszámlánként)
 *  3. Registrul-Jurnal — összesített naplókönyv (kassza + bank)
 *  4. Kiadási kísérőív — napi kiadás bizonylat
 */

// 2026-06-11 (Endre #4, nyomtatási központ desktopra): a fájl az
// `apps/web/lib/finance/reporting.ts`-ből költözött ide VÁLTOZATLAN
// builder-logikával — a web re-export shimen át ugyanezt használja.
import type {
  BefitetesRow,
  KiadasRow,
  BankAccount,
  SzamadasiCel,
  FinancePrintType,
  NyugtatombReportRow,
} from './types'
import { hivatalosKetnyelvuNev } from './entity-name'

/** Kibővített típusok a tényleges DB oszlopokkal, amik a típus definícióból hiányozhatnak */
type IncomeRow = BefitetesRow & { bankszamla_id?: number | null }
type ExpenseRow = KiadasRow & { bankszamla_id?: number | null }

/**
 * 2026-07-11 (S9): a hivatalos nyomtatványok RON-ban készülnek (a fejlécek
 * „lei"/„RON"-t írnak). Ezért MINDEN összeg a RON-ekvivalenst (osszeg_ron)
 * használja, nem a deviza-összeget. RON számlán osszeg == osszeg_ron (fallback),
 * devizás (EUR/HUF) számlán az átváltott lej-érték.
 */
const ronOf = (r: { osszeg: number; osszeg_ron?: number | null }): number =>
  Number(r.osszeg_ron ?? r.osszeg) || 0

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export interface FinancePrintResult {
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
  html: string
}

export const FINANCE_PRINT_TYPES: Array<{
  id: FinancePrintType
  title: string
  subtitle: string
  description: string
}> = [
  {
    id: 'registru_casa',
    title: 'Registru Casa',
    subtitle: 'Kasszakönyv',
    description: 'Havi kassza kimutatás bevételekkel, kiadásokkal és napi egyenleggel.',
  },
  {
    id: 'registru_banca',
    title: 'Registru Banca',
    subtitle: 'Banki könyv',
    description: 'Havi banki kimutatás bankszámlánként, bevételekkel és kiadásokkal.',
  },
  {
    id: 'registru_jurnal',
    title: 'Registrul-Jurnal',
    subtitle: 'Összesített naplókönyv',
    description: 'Havi összesített kassza és banki naplókönyv, egyetlen kimutatásban.',
  },
  {
    id: 'csoport_naplo',
    title: 'Csoportnapló',
    subtitle: 'Jogcímenkénti tétellista',
    description: 'Minden költségvetési jogcím (számadási cél) alatt a hozzá tartozó tételek listája, jogcímenkénti részösszeggel és végösszeggel. Román + magyar, oldalszámozva.',
  },
  {
    id: 'kiadasi_kiseroiv',
    title: 'Kiadási kísérőív',
    subtitle: 'Napi kiadás bizonylat',
    description: 'Egy nap kiadásai egyetlen bizonylaton, éves sorszámozással.',
  },
  {
    id: 'nyugtatomb_kimutatas',
    title: 'Nyugtatömb kimutatás',
    subtitle: 'Nyomdai tömbök nyilvántartása',
    description: 'Éves összesítés a kerülettől vett nyugtatömbökről: nyomdai és saját sorszámtartomány, dátumok, felhasznált darabszám.',
  },
  {
    id: 'decont_reprint',
    title: 'Decont — Elszámolások',
    subtitle: 'Korábbi elszámolások újranyomtatása',
    description: 'A korábban mentett elszámolási lapok (Decont) listából kiválaszthatók és újranyomtathatók.',
  },
  {
    id: 'dispozitie_reprint',
    title: 'Dispoziție de plată / încasare',
    subtitle: 'Korábbi rendelvények újranyomtatása',
    description: 'A korábban mentett kifizetési és bevételezési rendelvények listából kiválaszthatók és újranyomtathatók.',
  },
]

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * A kiállító hivatalos, KÉTNYELVŰ megnevezése a román regiszterek fejlécébe —
 * escape-elve.
 *
 * ⛔ MI VOLT A HIBA (2026-08-22, 6. pont): itt `congregationNameRo ||
 * congregationName` állt. A vagy-lánc üres román névnél HANG NÉLKÜL a magyar
 * nevet írta ki — a REGISTRU CASA fejlécébe „Kézdi-Orbai Református
 * Egyházmegye" került, egy végig román íven. És ez nem ritka eset: a
 * `dioceses.nev_ro` oszlop csak 2026-08-15 óta létezik, a MEGLÉVŐ megye-sorokon
 * NULL. Most mindkét név kimegy, ha megvan; ha a román hiányzik, CSAK a magyar
 * áll ott — sablon-kiegészítés nélkül (a hiányt a beállítás-varázslón kell
 * pótolni, nem a nyomtatóban kitalálni).
 *
 * A logika a közös `hivatalosKetnyelvuNev`-ben él (entity-name.ts) — ugyanezt a
 * döntést a Számadás-borító, a Decont, a kísérőív, a Monetár és a leltár-ívek
 * is kérik; másolatból némán széthúzó felületek lettek volna.
 */
function entitasNev(data: Pick<FinanceReportData, 'congregationName' | 'congregationNameRo'>): string {
  return esc(hivatalosKetnyelvuNev(data.congregationName, data.congregationNameRo))
}

/** Hivatalos szám formátum: szóköz ezresek, pont tizedes, 2 jegy */
function fmtNum(n: number): string {
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + parts[0] + '.' + parts[1]
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return (d.split('T')[0] || '').replace(/-/g, '.')
}

const MONTH_NAMES_RO = [
  'IANUARIE', 'FEBRUARIE', 'MARTIE', 'APRILIE', 'MAI', 'IUNIE',
  'IULIE', 'AUGUST', 'SEPTEMBRIE', 'OCTOMBRIE', 'NOIEMBRIE', 'DECEMBRIE',
]


// 2026-08-14 (K1): a RÖGZÍTETT irattípus kerül a nyomtatványra. Korábban
// minden készpénzes sor „Chit."-ként ment ki — egy Factură vagy Dispoziție
// alapján fizetett tétel a hivatalos regiszteren ellentmondott a lefűzött
// bizonylatnak. A hivatalos ív („Irattip.", Sugo: „nyugta (chitanta), számla
// (factura) stb. rövidített megnevezését lehet beírni") szabad szöveget vár.
function getDocType(row: BefitetesRow | KiadasRow): string {
  const irattipus = (row.irattipus || '').trim()
  if (irattipus === 'Banki') return 'Extr' // legacy tárolt érték
  if (!irattipus || irattipus === 'Készpénz') return 'Chit.' // alapérték kasszára
  return irattipus
}

function getDocNumber(row: BefitetesRow | KiadasRow): string {
  return ('iratszam' in row ? row.iratszam : null) || ('nyugta' in row ? row.nyugta : null) || ('bizonylatszam' in row ? (row as KiadasRow).bizonylatszam : null) || ''
}

// #3 (Endre): a GYÜLEKEZETI saját sorszám (befizetes.nyugta) — a kerületi (iratszam) mellett.
// Csak bevételnél értelmezett; kiadásnál üres.
function getCongregationNumber(row: BefitetesRow | KiadasRow): string {
  return ('nyugta' in row ? (row as BefitetesRow).nyugta : null) || ''
}

function getCategoryCode(row: BefitetesRow | KiadasRow, bevCelMap: Record<number, string>, kiaCelMap: Record<number, string>): string {
  if ('id_befizetescel' in row && row.id_befizetescel) return bevCelMap[row.id_befizetescel] || ''
  if ('id_kiadascel' in row && (row as KiadasRow).id_kiadascel) return kiaCelMap[(row as KiadasRow).id_kiadascel!] || ''
  return ''
}

function getDescription(row: BefitetesRow | KiadasRow, bevCelMap: Record<number, string>, kiaCelMap: Record<number, string>, cellek: SzamadasiCel[]): string {
  const code = getCategoryCode(row, bevCelMap, kiaCelMap)
  const cel = cellek.find((c) => c.kod === code)
  const name = 'forrasa' in row ? (row as BefitetesRow).forrasa : ('kedvezmenyzett' in row ? (row as KiadasRow).kedvezmenyzett || (row as KiadasRow).atvevo : null)
  // 2026-07-10 (S3 #1c): a hivatalos ROMÁN nyomtatványokon (Registru Casa/Banca/
  // Jurnal) a jogcím ROMÁN neve az elsődleges (pl. „Contribuția anuală a
  // credincioșilor" az „Egyházfenntartói járulék" helyett); magyar csak fallback.
  // 2026-08-14 (K1): a MEGJEGYZÉS is bekerül — a hivatalos ív Explicații oszlopa
  // a Magyarázat + Név + MEGJEGYZÉS hármasból áll (Sugo: „Az ide beírt megjegyzés
  // bekerül a Főkönyvbe, a banknaplóba és csoportnaplóba. Itt lehet
  // megkülönböztetni az altételeket, pl. közköltségnél a fűtés, világítás…").
  // Korábban a lelkész altétel-bontása mindhárom regiszterből eltűnt.
  const megjegyzes = ('megjegyzes' in row ? (row as { megjegyzes?: string | null }).megjegyzes : null) || ''
  const parts = [name, cel?.nevro || cel?.nev, megjegyzes.trim()].filter(Boolean)
  return parts.join(' — ')
}

// ---------------------------------------------------------------------------
// Stílusok
// ---------------------------------------------------------------------------

function styles() {
  return `
    /* WYSIWYG: @page margó 0 — a margót a .page paddingje (10mm) adja, így a
       képernyős előnézet ÉS a nyomtatás AZONOS tartalom-szélességet kap
       (különben a @page margó + a padding összeadódna → eltérő tördelés). */
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #eef1f5; padding: 18px 0; }
    .page { width: 297mm; min-height: 210mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 10mm; break-after: page; position: relative; }
    /* 2026-07-17 (F3, Q5): CSAK a kísérőív lapja flex-oszlop — az aláírók a lap aljára
       tolódnak, ha a tartalom rövidebb (túlcsorduló tartalomnál a tartalom után, az
       utolsó oldalon állnak). SZÁNDÉKOSAN nem globális: a WebKit (Safari/iOS) a
       flex-konténert nyomtatásban nem tördeli lapokra — a többoldalas regisztereket
       egy globális flex .page félbevágott sorokkal nyomtatná. */
    .page--bottom-footer { display: flex; flex-direction: column; }
    /* 2026-08-15 (Endre: „szövegek fedik egymást"): az aljára tolt aláírás-sáv
       PONTOSAN az abszolút pozíciójú oldalszám (.page-num, bottom:10mm) helyére
       ért le — a „pg. N" a Gondnok/Curator aláírás-vonalára íródott. A 8mm alsó
       margó az aláírásokat az oldalszám FÖLÉ emeli. */
    .page--bottom-footer .footer { margin-top: auto; padding-top: 14px; margin-bottom: 8mm; }
    .page:last-child { break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .header-left { font-size: 12px; }
    .header-left .entity { font-weight: bold; font-size: 13px; }
    .header-center { text-align: center; flex: 1; }
    .header-center .title { font-size: 18px; font-weight: bold; text-transform: uppercase; }
    .header-right { text-align: right; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #334155; padding: 4px 5px; font-size: 10px; vertical-align: top; }
    th { background: #fff; text-align: center; font-weight: bold; font-size: 9px; }
    thead { display: table-header-group; }
    tr, td, th { page-break-inside: avoid; }
    /* 2026-08-15 (Endre): az összeg-cella 5-6 jegyű számnál sortörött
       („12 345,67" két sorba) — pénzösszeg SOHA nem törhet meg. */
    .text-right { text-align: right; white-space: nowrap; }
    .text-center { text-align: center; }
    /* Festéktakarékos: nincs háttér-kitöltés, csak félkövér + dupla felső keret */
    .totals { font-weight: bold; border-top: 2px solid #334155; }
    .carry { font-weight: bold; font-style: italic; }
    .footer { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11px; }
    .footer-item { text-align: center; min-width: 120px; }
    .footer-line { border-top: 1px solid #0f172a; margin-top: 28px; padding-top: 4px; }
    .page-num { position: absolute; bottom: 10mm; right: 10mm; font-size: 10px; color: #64748b; }
    /* 2026-07-17 (F3): printben a lapmagasság MEGMARAD (1-2mm ráhagyással a
       @page-hez képest, az átcsordulás ellen) — korábban a min-height:auto miatt
       a lap „összement" és az aláírók/oldalszám felcsúszott a táblázat alá,
       eltérve az előnézettől és a PDF-től. */
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: 208mm; margin: 0; box-shadow: none; } }
  `
}

function stylesPortrait() {
  return styles()
    .replace('A4 landscape', 'A4 portrait')
    .replace('width: 297mm; min-height: 210mm', 'width: 210mm; min-height: 297mm')
    .replace('min-height: 208mm', 'min-height: 295mm')
}

function wrap(title: string, content: string, extraOrPortrait?: string | boolean) {
  const portrait = extraOrPortrait === true
  const extra = typeof extraOrPortrait === 'string' ? extraOrPortrait : ''
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${portrait ? stylesPortrait() : styles()}</style>${extra}</head><body>${content}</body></html>`
}

// ---------------------------------------------------------------------------
// Adatszűrés
// ---------------------------------------------------------------------------

export interface FinanceReportFilters {
  year: number
  month: number | null // 1-12, null = teljes év (hónaponként külön oldal)
  bankAccountId?: number | null
  /** Csoportnaplónál: csak erre a jogcím-kódra szűr (null/undefined = összes jogcím). */
  categoryKod?: string | null
}

export interface FinanceReportData {
  income: IncomeRow[]
  expense: ExpenseRow[]
  bankAccounts: BankAccount[]
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") — a hivatalos
   *  (román) nyomtatványok fejlécében ez jelenik meg a magyar név helyett. */
  congregationNameRo?: string
  carryoverCash: number
  carryoverBank: number
  /** 2026-07-17 (F4): a kiválasztott év RÖGZÍTETT nyitó egyenlegei bankszámlánként
   *  (bankszamla_nyito_egyenleg.nyito_egyenleg_ron, bankszamla_id → RON). A Registru
   *  Banca ebből veszi az egy-számlás nyitót.
   *
   *  2026-08-28 (Endre döntése): GYÜLEKEZETI hatókörben ez az EGYETLEN forrás — a
   *  legacy `bankszamlak.nyito_egyenleg` már nem fallback, lásd `felsoSzintLegacyNyito`. */
  bankNyitoMap?: Record<number, number>
  /**
   * ⚠️ CSAK EGYHÁZMEGYEI / EGYHÁZKERÜLETI hatókörben igaz — SÉMA-KORLÁT, nem szándék.
   *
   * Endre 2026-08-28-i döntése: „A gyülekezet beállításainál legyenek a nyitó
   * egyenlegek, egy [helyen], és onnan számoljon mindent." Ezt gyülekezeti szinten
   * végre is hajtottuk: a `bankNyitoMap` (= `bankszamla_nyito_egyenleg` évenkénti
   * tábla) az egyetlen forrás.
   *
   * A FELSŐBB SZINT viszont FIZIKAILAG nem tud oda rögzíteni:
   * `bankszamla_nyito_egyenleg.congregation_id` **NOT NULL**, a `bankszamlak` viszont
   * mind a három szint közös táblája (`scope` oszloppal). Ezért az
   * `initFinanceFelsoSzint` fixen ÜRES `bankNyitoMap`-et ad, és a megyei Registru
   * Banca nyitója 100%-ban a legacy skalárból jön.
   *
   * Ha ezt a flaget feltétel nélkül elhagynánk, a MEGYEI banknapló nyitó sora
   * 0-ra esne — ez a kör legdrágább elkerülhető hibája.
   *
   * ADÓSSÁG, NEM VÉGÁLLAPOT: a következő kör feladata a felsőbb szint saját
   * nyitó-tárolója (a `congregation_id` NOT NULL feloldása vagy scope-oszlopos
   * tábla). Ez a mező addig a greppelhető jelzőkaró.
   */
  felsoSzintLegacyNyito?: boolean
  /** Nyugtatömb kimutatás soradatai — csak a `nyugtatomb_kimutatas` típushoz kötelező. */
  nyugtatombok?: NyugtatombReportRow[]
}


function filterByMonth<T extends { datum: string; deleted: boolean; stornozott?: boolean }>(
  rows: T[],
  year: number,
  month: number,
): T[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott tétel a hivatalos
  // regiszterekben (Registru Casa/Banca/Jurnal) SEM szerepelhet — a stornó
  // a tételt érvényteleníti, a nyomtatott naplóból is ki kell maradnia.
  return rows.filter((r) => !r.deleted && !r.stornozott && (r.datum || '').startsWith(prefix))
    .sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))
}

// Kassza vs bank szétválasztás a `bankszamla_id` alapján (NULL = kassza), NEM az irattípus
// alapján — az importált tételek irattípusa „Chit."/„Extr" (nem „Készpénz"/„Banki"), így az
// irattípus-szűrés kihagyta őket. A `bankszamla_id` a kézi ÉS az importált adatra is helyes.
function filterCash<T extends { irattipus: string | null; bankszamla_id?: number | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.bankszamla_id)
}

function filterBank<T extends { irattipus: string | null; bankszamla_id?: number | null }>(rows: T[], bankId?: number | null): T[] {
  if (bankId) return rows.filter((r) => r.bankszamla_id === bankId)
  return rows.filter((r) => !!r.bankszamla_id)
}

/** Korábbi hónapok összegyenlegének kiszámítása */
function computeCarryover(
  income: BefitetesRow[],
  expense: KiadasRow[],
  year: number,
  month: number,
  filterFn: <T extends { irattipus: string | null; bankszamla_id?: number | null }>(rows: T[]) => T[],
  openingBalance: number,
): number {
  let balance = openingBalance
  for (let m = 1; m < month; m++) {
    const mInc = filterFn(filterByMonth(income, year, m))
    const mExp = filterFn(filterByMonth(expense, year, m))
    balance += mInc.reduce((s, r) => s + ronOf(r), 0)
    balance -= mExp.reduce((s, r) => s + ronOf(r), 0)
  }
  return balance
}

// ---------------------------------------------------------------------------
// 1. REGISTRU CASA (Kasszakönyv)
// ---------------------------------------------------------------------------

/** Belső típus a builder függvényekhez — month kötelező */
type MonthFilters = FinanceReportFilters & { month: number }

function buildRegistruCasa(data: FinanceReportData, f: MonthFilters): FinancePrintResult {
  const mIncome = filterCash(filterByMonth(data.income, f.year, f.month))
  const mExpense = filterCash(filterByMonth(data.expense, f.year, f.month))
  const carry = computeCarryover(data.income, data.expense, f.year, f.month, filterCash, data.carryoverCash)

  // Összes tranzakció egyesítve, dátum szerint rendezve
  type Row = { date: string; docType: string; docNum: string; congNum: string; desc: string; income: number; expense: number; code: string }
  const rows: Row[] = []

  for (const r of mIncome) {
    // #3: a gyülekezeti szám (nyugta) — ha megegyezik a kerületivel (régi, tükrözött adat), ne ismételjük.
    const dn = getDocNumber(r)
    const cn = getCongregationNumber(r)
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: dn, congNum: cn && cn !== dn ? cn : '',
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      income: ronOf(r), expense: 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  for (const r of mExpense) {
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r), congNum: '',
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      income: 0, expense: ronOf(r),
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  let balance = carry
  let totalInc = 0
  let totalExp = 0
  let tbody = ''
  rows.forEach((r, i) => {
    balance += r.income - r.expense
    totalInc += r.income
    totalExp += r.expense
    // 2026-07-10 (S3 #1b): a "Simb. cont." (költségvetési szám) oszlop ELTÁVOLÍTVA
    // a felhasználó kérésére — a hivatalos regiszteren nem szükséges.
    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td class="text-center">${r.date}</td>
      <td class="text-center">${esc(r.docType)}</td>
      <td class="text-center">${esc(r.docNum)}</td>
      <td class="text-center">${esc(r.congNum)}</td>
      <td>${esc(r.desc)}</td>
      <td class="text-right">${r.income ? fmtNum(r.income) : ''}</td>
      <td class="text-right">${r.expense ? fmtNum(r.expense) : ''}</td>
      <td class="text-right">${fmtNum(balance)}</td>
    </tr>`
  })

  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${entitasNev(data)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">REGISTRU CASA</div></div>
      <div class="header-right"><div>LUNA ${monthRo}</div><div>Anul: ${f.year}</div></div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">Nr<br>crt</th><th rowspan="2">Data<br>inreg.</th><th colspan="3">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Sume</th><th rowspan="2">Sold zi</th></tr>
        <tr><th>Fel</th><th>Nr. ker.</th><th>Nr. gyül.</th><th>Incasate</th><th>Platite</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td></tr>
      </thead>
      <tbody>
        <tr class="carry"><td colspan="6" class="text-right">Sold luna precedenta:</td><td class="text-right">${fmtNum(carry)}</td><td></td><td class="text-right">${fmtNum(carry)}</td></tr>
        ${tbody}
        <tr class="totals"><td colspan="6" class="text-right">TOTAL LUNA</td><td class="text-right">${fmtNum(totalInc)}</td><td class="text-right">${fmtNum(totalExp)}</td><td class="text-right">${fmtNum(balance)}</td></tr>
      </tbody>
    </table>
    <div class="footer">
      <div class="footer-item"><div class="footer-line">Conducătorul unității — Lelkész/Gondnok</div></div>
      <div class="footer-item"><div class="footer-line">Întocmit — Készítette</div></div>
      <div class="footer-item"><div class="footer-line">Verificat — Ellenőrizte</div></div>
    </div>
    <div class="page-num">pg. 1</div>
  </div>`

  return {
    title: 'Registru Casa',
    filename: `Registru_Casa_${f.year}_${String(f.month).padStart(2, '0')}.pdf`,
    orientation: 'landscape',
    html: wrap('Registru Casa', html),
  }
}

// ---------------------------------------------------------------------------
// 2. REGISTRU BANCA
// ---------------------------------------------------------------------------

function buildRegistruBanca(data: FinanceReportData, f: MonthFilters): FinancePrintResult {
  const bankFilter = <T extends { irattipus: string | null; bankszamla_id?: number | null }>(rows: T[]) => filterBank(rows, f.bankAccountId)
  const mIncome = bankFilter(filterByMonth(data.income, f.year, f.month))
  const mExpense = bankFilter(filterByMonth(data.expense, f.year, f.month))

  const bank = data.bankAccounts.find((b) => b.id === f.bankAccountId)
  // 2026-07-17 (F4): a per-éves rögzített nyitó az elsődleges.
  // EGY-számlás módban az aggregát carryoverBank-ra SOHA nem esünk vissza (az egy
  // MÁSIK számla rögzített nyitóját mutatná ennek a számlának a nyitójaként).
  //
  // 2026-08-28 (Endre döntése — „egy hely, és onnan számoljon mindent"):
  // a legacy, ÉV NÉLKÜLI `bankszamlak.nyito_egyenleg` KIVEZETVE a gyülekezeti
  // számításból. Élesben ott 15 000 áll, miközben a kanonikus 2025-ös sor
  // 107 771,39 — két különböző szám ugyanarra a számlára.
  //
  // ⚠️ A legacy ág NEM törölhető, csak HATÓKÖRRE SZŰKÍTHETŐ: a felsőbb szintnek
  // nincs hova rögzítenie a nyitót (`bankszamla_nyito_egyenleg.congregation_id`
  // NOT NULL), ezért ott a skalár az EGYETLEN forrás. Lásd `felsoSzintLegacyNyito`.
  //
  // Gyülekezeti hatókörben a flag hiányzik → 0 jön, és a nyomtatvány `nyitoBizonytalan`
  // jelzést kap. Ez CSAK a hibaágon látszik (ha a nyitó-feloldás lekérdezése elbukik);
  // normál működésben a `bankNyitoMap` MINDEN számlára tartalmaz bejegyzést.
  const recordedNyito = f.bankAccountId != null ? data.bankNyitoMap?.[f.bankAccountId] : undefined
  const legacyNyito = data.felsoSzintLegacyNyito === true ? Number(bank?.nyito_egyenleg ?? 0) || 0 : 0
  const openBal =
    recordedNyito != null
      ? recordedNyito
      : f.bankAccountId != null
        ? legacyNyito
        : data.carryoverBank
  const carry = computeCarryover(data.income, data.expense, f.year, f.month, bankFilter, openBal)

  type Row = { date: string; docType: string; docNum: string; desc: string; income: number; expense: number; code: string }
  const rows: Row[] = []

  for (const r of mIncome) {
    rows.push({ date: fmtDate(r.datum), docType: 'Extr', docNum: getDocNumber(r), desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek), income: ronOf(r), expense: 0, code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap) })
  }
  for (const r of mExpense) {
    rows.push({ date: fmtDate(r.datum), docType: 'OP', docNum: getDocNumber(r), desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek), income: 0, expense: ronOf(r), code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap) })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  let balance = carry
  let totalInc = 0
  let totalExp = 0
  let tbody = ''
  rows.forEach((r, i) => {
    balance += r.income - r.expense
    totalInc += r.income
    totalExp += r.expense
    // 2026-07-10 (S3 #1b): "Simb. cont." oszlop eltávolítva.
    tbody += `<tr><td class="text-center">${i + 1}</td><td class="text-center">${r.date}</td><td class="text-center">${esc(r.docType)}</td><td class="text-center">${esc(r.docNum)}</td><td>${esc(r.desc)}</td><td class="text-right">${r.income ? fmtNum(r.income) : ''}</td><td class="text-right">${r.expense ? fmtNum(r.expense) : ''}</td><td class="text-right">${fmtNum(balance)}</td></tr>`
  })

  const bankLabel = bank ? `${bank.bank_neve}${bank.iban ? ` (${bank.iban})` : ''}` : 'Bank'
  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${entitasNev(data)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">REGISTRU BANCA</div><div style="font-size:11px;margin-top:2px">${esc(bankLabel)}</div></div>
      <div class="header-right"><div>LUNA ${monthRo} Anul: ${f.year}</div><div>Operatiuni prin RON</div></div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">Nr<br>crt</th><th rowspan="2">Data<br>inreg.</th><th colspan="2">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Sume</th><th rowspan="2">Sold zi</th></tr>
        <tr><th>Fel</th><th>Numar</th><th>Incasate</th><th>Platite</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td></tr>
      </thead>
      <tbody>
        <tr class="carry"><td colspan="5" class="text-right">Sold luna precedenta:</td><td class="text-right">${fmtNum(carry)}</td><td></td><td class="text-right">${fmtNum(carry)}</td></tr>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">TOTAL LUNA</td><td class="text-right">${fmtNum(totalInc)}</td><td class="text-right">${fmtNum(totalExp)}</td><td class="text-right">${fmtNum(balance)}</td></tr>
      </tbody>
    </table>
    <div class="footer">
      <div class="footer-item"><div class="footer-line">Conducătorul unității — Lelkész/Gondnok</div></div>
      <div class="footer-item"><div class="footer-line">Întocmit — Készítette</div></div>
      <div class="footer-item"><div class="footer-line">Verificat — Ellenőrizte</div></div>
    </div>
    <div class="page-num">pg. 1</div>
  </div>`

  return {
    title: 'Registru Banca',
    filename: `Registru_Banca_${f.year}_${String(f.month).padStart(2, '0')}.pdf`,
    orientation: 'landscape',
    html: wrap('Registru Banca', html),
  }
}

// ---------------------------------------------------------------------------
// 3. REGISTRUL-JURNAL (összesített naplókönyv)
// ---------------------------------------------------------------------------

function buildRegistruJurnal(data: FinanceReportData, f: MonthFilters): FinancePrintResult {
  const mIncome = filterByMonth(data.income, f.year, f.month)
  const mExpense = filterByMonth(data.expense, f.year, f.month)

  // Előző havi egyenlegek
  const carryCashInc = computeCarryover(data.income, data.expense, f.year, f.month, filterCash, data.carryoverCash)
  const carryBankInc = computeCarryover(data.income, data.expense, f.year, f.month, (r) => filterBank(r), data.carryoverBank)

  // Számoljuk ki az előző havi kiadás összegét is a report row számozáshoz
  let prevRowCount = 0
  for (let m = 1; m < f.month; m++) {
    prevRowCount += filterByMonth(data.income, f.year, m).length + filterByMonth(data.expense, f.year, m).length
  }

  type Row = { date: string; docType: string; docNum: string; desc: string; cashInc: number; bankInc: number; cashExp: number; bankExp: number; code: string }
  const rows: Row[] = []

  for (const r of mIncome) {
    const isCash = !r.bankszamla_id // #5-fix: kassza = nincs bankszámla (nem az irattipus szövege)
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      cashInc: isCash ? ronOf(r) : 0,
      bankInc: !isCash ? ronOf(r) : 0,
      cashExp: 0, bankExp: 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  for (const r of mExpense) {
    const isCash = !r.bankszamla_id // #5-fix: kassza = nincs bankszámla (nem az irattipus szövege)
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      cashInc: 0, bankInc: 0,
      cashExp: isCash ? ronOf(r) : 0,
      bankExp: !isCash ? ronOf(r) : 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  // Előző hónapok kumulatív összegei
  let prevCI = 0, prevBI = 0, prevCE = 0, prevBE = 0
  for (let m = 1; m < f.month; m++) {
    const mi = filterByMonth(data.income, f.year, m)
    const me = filterByMonth(data.expense, f.year, m)
    for (const r of mi) {
      const isCash = !r.bankszamla_id // #5-fix: kassza = nincs bankszámla (nem az irattipus szövege)
      if (isCash) prevCI += ronOf(r); else prevBI += ronOf(r)
    }
    for (const r of me) {
      const isCash = !r.bankszamla_id // #5-fix: kassza = nincs bankszámla (nem az irattipus szövege)
      if (isCash) prevCE += ronOf(r); else prevBE += ronOf(r)
    }
  }

  // ── 2026-08-14 (K1, BLOKKOLÓ-javítás): VALÓDI 40 SOROS LAPOZÁS ──────────
  // A Főkönyv az EGYETLEN kötelezően BEKÖTENDŐ nyomtatvány (5 évente vagy 200
  // laponként kemény táblába) — korábban egyetlen végtelen táblázat volt,
  // bedrótozott „pg. 1"-gyel. A hivatalos ív 40 soros lapokkal dolgozik,
  // laponkénti átvitellel („De reportat pagina" alul, „Report" felül), és a
  // bekötéshez FOLYTATÓLAGOS lapszám kell az éven belül (a hónapok lapjai
  // folytatják egymást).
  const JURNAL_SOR_PER_LAP = 40
  /** Az utolsó lapon a záró blokk (3 összegző sor + aláírás-sáv) helye. */
  const JURNAL_ZARO_TARTALEK = 6

  // Folytatólagos lapszám: az előző hónapok lapjainak száma ugyanezzel a
  // képlettel (üres hónap is legalább 1 lap — kinyomtatva az is egy ív).
  const lapszamHoz = (sorok: number): number => {
    const lapok = Math.max(1, Math.ceil(sorok / JURNAL_SOR_PER_LAP))
    const utolsoLapSorai = sorok - (lapok - 1) * JURNAL_SOR_PER_LAP
    return utolsoLapSorai > JURNAL_SOR_PER_LAP - JURNAL_ZARO_TARTALEK ? lapok + 1 : lapok
  }
  let prevPages = 0
  for (let m = 1; m < f.month; m++) {
    prevPages += lapszamHoz(
      filterByMonth(data.income, f.year, m).length + filterByMonth(data.expense, f.year, m).length,
    )
  }

  // Sorok lapokra osztása.
  const lapok: Row[][] = []
  for (let i = 0; i < rows.length; i += JURNAL_SOR_PER_LAP) {
    lapok.push(rows.slice(i, i + JURNAL_SOR_PER_LAP))
  }
  if (lapok.length === 0) lapok.push([])
  // Ha az utolsó lapon nem fér el a záró blokk, külön lapra kerül.
  if (lapok[lapok.length - 1].length > JURNAL_SOR_PER_LAP - JURNAL_ZARO_TARTALEK) {
    lapok.push([])
  }

  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const fejlec = `<div class="header">
      <div class="header-left"><div>Unitate:</div><div class="entity">${entitasNev(data)}</div></div>
      <div class="header-center"><div class="title">REGISTRUL-JURNAL DE INCASARI SI PLATI</div></div>
      <div class="header-right"><div>LUNA ${monthRo} ANUL ${f.year}</div></div>
    </div>`
  const thead = `<thead>
        <tr><th rowspan="2">Nr.<br>crt.</th><th rowspan="2">Data<br>inreg.</th><th colspan="2">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Incasari</th><th colspan="2">Plati</th></tr>
        <tr><th>Fel</th><th>Numar</th><th>Numerar</th><th>Banca</th><th>Numerar</th><th>Banca</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td></tr>
      </thead>`

  // Göngyölt oszlop-összegek a lap-átvitelhez. A nyitó átvitel („Report din
  // luna precedenta") a hó ELEJI állapot; minden további lap teteje az addigi
  // göngyölt állást hozza át („Report din pagina precedenta").
  let gCI = 0, gBI = 0, gCE = 0, gBE = 0
  let sorszam = 0
  let totCI = 0, totBI = 0, totCE = 0, totBE = 0
  for (const r of rows) { totCI += r.cashInc; totBI += r.bankInc; totCE += r.cashExp; totBE += r.bankExp }
  const rulCI = prevCI + totCI, rulBI = prevBI + totBI, rulCE = prevCE + totCE, rulBE = prevBE + totBE
  const soldCash = carryCashInc + totCI - totCE
  const soldBank = carryBankInc + totBI - totBE

  const html = lapok
    .map((lapSorok, lapIdx) => {
      const utolso = lapIdx === lapok.length - 1
      // A lap tetején álló átvitel-sor.
      const reportSor =
        lapIdx === 0
          ? `<tr class="carry"><td colspan="5" class="text-right">Report din luna precedenta:</td><td class="text-right">${fmtNum(prevCI + data.carryoverCash)}</td><td class="text-right">${fmtNum(prevBI + data.carryoverBank)}</td><td class="text-right">${fmtNum(prevCE)}</td><td class="text-right">${fmtNum(prevBE)}</td></tr>`
          : `<tr class="carry"><td colspan="5" class="text-right">Report din pagina precedenta:</td><td class="text-right">${fmtNum(gCI)}</td><td class="text-right">${fmtNum(gBI)}</td><td class="text-right">${fmtNum(gCE)}</td><td class="text-right">${fmtNum(gBE)}</td></tr>`

      let tbody = ''
      for (const r of lapSorok) {
        sorszam += 1
        gCI += r.cashInc; gBI += r.bankInc; gCE += r.cashExp; gBE += r.bankExp
        // 2026-07-10 (S3 #1b): "Simb. cont." oszlop eltávolítva.
        tbody += `<tr>
      <td class="text-center">${prevRowCount + sorszam}</td>
      <td class="text-center">${r.date}</td>
      <td class="text-center">${esc(r.docType)}</td>
      <td class="text-center">${esc(r.docNum)}</td>
      <td>${esc(r.desc)}</td>
      <td class="text-right">${r.cashInc ? fmtNum(r.cashInc) : ''}</td>
      <td class="text-right">${r.bankInc ? fmtNum(r.bankInc) : ''}</td>
      <td class="text-right">${r.cashExp ? fmtNum(r.cashExp) : ''}</td>
      <td class="text-right">${r.bankExp ? fmtNum(r.bankExp) : ''}</td>
    </tr>`
      }

      // A lap alja: nem-utolsó lapon átvitel a következőre; az utolsón a záró blokk.
      const zaras = utolso
        ? `<tr class="totals"><td colspan="5" class="text-right">Total luna</td><td class="text-right">${fmtNum(totCI)}</td><td class="text-right">${fmtNum(totBI)}</td><td class="text-right">${fmtNum(totCE)}</td><td class="text-right">${fmtNum(totBE)}</td></tr>
        <tr class="totals"><td colspan="5" class="text-right">Total rulaj</td><td class="text-right">${fmtNum(rulCI + data.carryoverCash)}</td><td class="text-right">${fmtNum(rulBI + data.carryoverBank)}</td><td class="text-right">${fmtNum(rulCE)}</td><td class="text-right">${fmtNum(rulBE)}</td></tr>
        <tr class="totals"><td colspan="5" class="text-right">Sold numerar (6-8) / Sold banca (7-9)</td><td class="text-right">${fmtNum(soldCash)}</td><td class="text-right">${fmtNum(soldBank)}</td><td colspan="2"></td></tr>`
        : `<tr class="carry"><td colspan="5" class="text-right">De reportat pagina urmatoare:</td><td class="text-right">${fmtNum(gCI)}</td><td class="text-right">${fmtNum(gBI)}</td><td class="text-right">${fmtNum(gCE)}</td><td class="text-right">${fmtNum(gBE)}</td></tr>`

      return `<div class="page">
    ${fejlec}
    <table>
      ${thead}
      <tbody>
        ${reportSor}
        ${tbody}
        ${zaras}
      </tbody>
    </table>
    ${utolso ? `<div class="footer">
      <div class="footer-item"><div class="footer-line">Conducătorul unității — Lelkész/Gondnok</div></div>
      <div class="footer-item"><div class="footer-line">Întocmit — Készítette</div></div>
      <div class="footer-item"><div class="footer-line">Verificat — Ellenőrizte</div></div>
    </div>` : ''}
    <div class="page-num">pg. ${prevPages + lapIdx + 1}</div>
  </div>`
    })
    .join('')

  return {
    title: 'Registrul-Jurnal',
    filename: `Registru_Jurnal_${f.year}_${String(f.month).padStart(2, '0')}.pdf`,
    orientation: 'landscape',
    html: wrap('Registrul-Jurnal', html),
  }
}

// ---------------------------------------------------------------------------
// 4. KIADÁSI KÍSÉRŐÍV (napi kiadási bizonylat)
// ---------------------------------------------------------------------------

export function buildKiadasiKiseroiv(params: {
  expenses: KiadasRow[]
  date: string
  pageNumber: number
  congregationName: string
  /**
   * 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`). A
   * BORDEROU DE PLĂȚI végig román nyomtatvány, a fejlécében mégis CSAK a magyar
   * név állt — román név-ág egyáltalán nem létezett rajta. OPCIONÁLIS, hogy a
   * desktop hívói ne törjenek; ha üres, a magyar név áll ott EGYEDÜL.
   */
  congregationNameRo?: string
  kiaCelMap: Record<number, string>
  cellek: SzamadasiCel[]
  /** 2026-07-17 (F3, Q10): a kísérőív forrása — pl. „Kassza" vagy egy bankszámla neve.
      Forrásonként KÜLÖN sorozat fut (a pageNumber már forrás-szűrten érkezik). */
  sourceLabel?: string
}): FinancePrintResult {
  const { expenses, date, pageNumber, congregationName, congregationNameRo, kiaCelMap, cellek, sourceLabel } = params

  const total = expenses.reduce((s, r) => s + ronOf(r), 0)

  let tbody = ''
  expenses.forEach((r, i) => {
    const code = r.id_kiadascel ? (kiaCelMap[r.id_kiadascel] || '') : ''
    const cel = cellek.find((c) => c.kod === code)
    const name = r.atvevo || ''
    // 2026-07-17 (F3, Q1/Q2): a „Költségv. Tétel" oszlopban a jogcím MAGYAR + ROMÁN
    // neve áll (a nyers kód nem) — a kód csak fallback, ha egyik név sincs meg.
    const celCell = cel
      ? `${esc(cel.nev || '')}${cel.nevro ? `<div style="font-style:italic;color:#475569">${esc(cel.nevro)}</div>` : ''}` || esc(code)
      : esc(code)

    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${esc(getDocNumber(r))}</td>
      <td>${esc(r.irattipus || 'Chit.')}</td>
      <td>${celCell}</td>
      <td>${esc(name)}</td>
      <td class="text-right">${fmtNum(ronOf(r))}</td>
    </tr>`
  })

  const sourceLine = sourceLabel ? `<div>Sursa / Forr&aacute;s: ${esc(sourceLabel)}</div>` : ''
  const sourceSlug = sourceLabel
    ? '_' + sourceLabel.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    : ''

  const html = `<div class="page page--bottom-footer">
    <!-- 2026-08-28 (Endre): a közös .header flexében a hosszú bal oldali név
         KITOLTA a címet a középről. Itt rács (1fr / auto / 1fr): a két
         szélső oszlop egyenlő, a cím így VALÓDI középen áll. -->
    <div class="header" style="display:grid;grid-template-columns:1fr auto 1fr;column-gap:10px;align-items:start;">
      <div class="header-left"><div class="entity">${entitasNev({ congregationName, congregationNameRo })}</div></div>
      <div class="header-center" style="flex:none;">
        <div class="title" style="text-decoration:underline">BORDEROU DE PL&#258;&#538;I</div>
        <div style="font-size:12px;font-weight:bold;">KIAD&Aacute;SI K&Iacute;S&Eacute;R&Odblac;&Iacute;V</div>
      </div>
      <div class="header-right"><div>Kiad&aacute;s sorsz&aacute;ma / Nr. plat&#259;: <strong>${pageNumber}</strong></div><div>${fmtDate(date)}</div>${sourceLine}<div>Registrul-Jurnal</div></div>
    </div>
    <table style="table-layout:fixed;">
      <colgroup>
        <col style="width:7%"><col style="width:12%"><col style="width:7%">
        <col style="width:27%"><col style="width:34%"><col style="width:13%">
      </colgroup>
      <thead><tr>
        <th>Nr. plat&#259;<br>Kiad. sz.</th><th>Nr. doc.<br>Iratsz&aacute;m</th><th>Fel<br>Irat</th><th>Capitol buget<br>K&ouml;lts&eacute;gv. t&eacute;tel</th><th>Denumirea pl&#259;&#539;ii<br>Kiad&aacute;s megnevez&eacute;se</th><th>Suma<br>&Ouml;sszeg</th>
      </tr></thead>
      <tbody>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">Total pl&#259;&#539;i / &Ouml;sszesen kiad&aacute;s - ${fmtDate(date)}</td><td class="text-right">${fmtNum(total)}</td></tr>
      </tbody>
    </table>
    <div class="footer">
      <div class="footer-item"><div class="footer-line">Lelkip&aacute;sztor / Preot</div></div>
      <div class="footer-item"><div class="footer-line">Ellen&odblac;rizte / Verificat</div></div>
      <div class="footer-item"><div class="footer-line">Gondnok / Curator</div></div>
    </div>
    <div class="page-num">pg. ${pageNumber}</div>
  </div>`

  return {
    title: 'Kiadási kísérőív',
    filename: `Kiadasi_kiseroiv${sourceSlug}_${fmtDate(date).replace(/\./g, '_')}.pdf`,
    orientation: 'portrait',
    html: wrap('Kiadási kísérőív', html, true),
  }
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

/**
 * Nyugtatömb kimutatás — a kerülettől vett tömbök éves nyilvántartása.
 * Nyomdai sorszámtartomány, saját (gyülekezeti) sorszámtartomány, dátumok,
 * felhasznált/összes darabszám.
 */
function buildNyugtatombKimutatas(data: FinanceReportData, year: number): FinancePrintResult {
  const rows = data.nyugtatombok || []
  // 2026-08-22 (6. pont): a fejléc-cím ROMÁN („Evidența carnetelor de
  // chitanțe"), a kiállító neve alatta mégis CSAK magyar volt — pedig a
  // `congregationNameRo` MÁR ITT VOLT az adatban, csak senki nem olvasta.
  // Most kétnyelvű; ha nincs román név, a magyar áll egyedül (a `—` a
  // korábbi, név nélküli eset tartaléka).
  const entitasFelirat = entitasNev(data) || '&mdash;'

  function fmtHu(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const head = `
    <div class="title-row">
      <div>
        <div class="title">Evidența carnetelor de chitanțe — Nyugtatömb kimutatás — ${year}</div>
        <div class="subtitle">${entitasFelirat}</div>
      </div>
      <div class="pageinfo">A4 fekvő · pg. 1</div>
    </div>
  `

  const tableRows = rows.length === 0
    ? `<tr><td colspan="11" class="empty">Nu există carnet pus în folosință în anul ${year}. / Nincs olyan tömb, amelyet ${year}-ban használatba vettek.</td></tr>`
    : rows.map(r => `
      <tr>
        <td class="center">${r.sorszam}</td>
        <td>${esc(r.block_nr || '—')}</td>
        <td class="bold">${esc(r.seria)}</td>
        <td class="right mono">${r.nyomdai_kezdet}</td>
        <td class="right mono">${r.nyomdai_veg}</td>
        <td>${fmtHu(r.datum_kezdet)}</td>
        <td>${fmtHu(r.datum_veg)}</td>
        <td class="right mono">${r.sajat_kezdet ?? '—'}</td>
        <td class="right mono">${r.sajat_veg ?? '—'}</td>
        <td class="right">${r.felhasznalt_darabszam} / ${r.darabszam_ossz}</td>
        <td class="${r.aktiv ? 'badge-active' : 'badge-closed'}">${r.aktiv ? 'Activ / Aktív' : 'Închis / Lezárt'}</td>
      </tr>
    `).join('')

  const table = `
    <table class="nt">
      <thead>
        <tr>
          <th>Nr. crt.<br>Sorsz.</th>
          <th>Nr. bloc<br>Blokksz.</th>
          <th>Seria<br>Sorozat</th>
          <th>Serie tipar de la<br>Nyomdai kezdet</th>
          <th>Serie tipar până la<br>Nyomdai vég</th>
          <th>Prima dată<br>Első dátum</th>
          <th>Ultima dată<br>Utolsó dátum</th>
          <th>Nr. propriu de la<br>Saját kezdet</th>
          <th>Nr. propriu până la<br>Saját vég</th>
          <th>Utilizate / Total<br>Felhasznált / Össz</th>
          <th>Stare<br>Állapot</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `

  const totals = rows.length > 0 ? `
    <div class="totals">
      Összesen / Total: <strong>${rows.length}</strong> tömb / carnete ·
      ${rows.reduce((sum, r) => sum + r.felhasznalt_darabszam, 0)} felhasznált nyugta / chitanțe utilizate din
      ${rows.reduce((sum, r) => sum + r.darabszam_ossz, 0)} össz / total
    </div>
  ` : ''

  // 2026-08-15 (Endre): kétnyelvű aláírás-feliratok — a nyomtatvány többi része
  // (fejléc, oszlopnevek, végösszegek) már magyar/román, az aláírás-sáv nem volt az.
  const signatures = `
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Lelkipásztor<br><em>Preot</em></div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Gondnok<br><em>Curator</em></div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Pénztáros<br><em>Casier</em></div>
      </div>
    </div>
  `

  const extraStyles = `
    <style>
      .title-row { display:flex; justify-content:space-between; align-items:end; margin-bottom: 10px; border-bottom: 1.5px solid #334155; padding-bottom: 6px; }
      .title { font-size: 16px; font-weight: bold; }
      .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
      .pageinfo { font-size: 10px; color: #64748b; }
      .nt { width: 100%; border-collapse: collapse; font-size: 10px; }
      .nt th, .nt td { border: 1px solid #334155; padding: 4px 6px; }
      .nt th { background: #fff; font-weight: bold; font-size: 9px; text-align: left; border-bottom: 2px solid #334155; }
      .nt .center { text-align: center; }
      .nt .right { text-align: right; }
      .nt .bold { font-weight: 600; }
      .nt .mono { font-family: 'Courier New', monospace; }
      .nt .empty { text-align: center; color: #94a3b8; padding: 20px; font-style: italic; }
      .badge-active { color: #065f46; font-weight: 600; }
      .badge-closed { color: #64748b; }
      .totals { margin-top: 10px; font-size: 10px; color: #334155; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-top: 40px; }
      .sig-box { text-align: center; }
      .sig-line { border-top: 1px solid #0f172a; margin-bottom: 4px; height: 1px; width: 100%; }
      .sig-label { font-size: 10px; }
    </style>
  `

  const content = `<div class="page">${head}${table}${totals}${signatures}</div>`

  return {
    title: `Nyugtatömb kimutatás — ${year}`,
    filename: `Nyugtatomb_kimutatas_${year}.pdf`,
    orientation: 'landscape',
    html: wrap(`Nyugtatömb kimutatás — ${year}`, content, extraStyles),
  }
}

// ---------------------------------------------------------------------------
// CSOPORTNAPLÓ — jogcímenkénti (számadási cél) tétellista, román + magyar
// ---------------------------------------------------------------------------

// 2026-07-10 (S3 #1e): a fel nem oldott jogcímű tételek gyűjtőcsoportjának
// szentinel-kódja — sosem ütközik valódi számadásicél-kóddal, ezért a
// jogcím-szűrő (categoryKod) automatikusan kihagyja.
const CSOPORTNAPLO_BESOROLATLAN_KOD = '—'

/** Számadásicél-kódok hierarchikus rendezése (101.01 < 101.02 < 104.04). */
function sortCells(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

/**
 * Csoportnapló: minden költségvetési jogcím (számadási cél) alatt a hozzá tartozó
 * tételek listája, jogcímenkénti részösszeggel és végösszeggel. Bevétel + kiadás
 * külön szekcióban, román + magyar felirattal. Az időszak: a kiválasztott hónap,
 * vagy (ha nincs) a TELJES év (NEM hónaponként bontva — jogcím szerint összegyűjtve).
 * A belső mozgások (3xx/4xx/100-as kód vagy belső-mozgás kulcs) kimaradnak.
 * 2026-07-10 (S3 #1e): a jogcímre fel nem oldható tételek nem vesznek el —
 * a szekció végi „Fără capitol — Besorolatlan" csoportba kerülnek, lábjegyzettel.
 */
function buildCsoportNaplo(data: FinanceReportData, filters: FinanceReportFilters): FinancePrintResult {
  const { year, month } = filters
  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-`
  // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott tétel a csoportnaplóból is kimarad.
  const inPeriod = <T extends { datum: string; deleted: boolean; stornozott?: boolean }>(rows: T[]): T[] =>
    rows.filter((r) => !r.deleted && !r.stornozott && (r.datum || '').startsWith(prefix))

  // 2026-07-10 (#3 defense-in-depth): a 100-as fejezet (legacy belső mozgás) is belső.
  const isInternal = (code: string, xkey: unknown) =>
    !!xkey || /^[34]/.test(code) || code === '100' || code.startsWith('100.')

  type Item = { datum: string; docType: string; docNum: string; partner: string; megjegyzes: string; osszeg: number }
  type Group = { kod: string; nev: string; items: Item[]; total: number }

  const buildGroups = (
    rows: (IncomeRow | ExpenseRow)[],
    celMap: Record<number, string>,
    celType: 'B' | 'K',
    isIncome: boolean,
  ): Group[] => {
    const map = new Map<string, Group>()
    // 2026-07-10 (S3 #1e) FŐ HIBA-FIX: korábban a fel nem oldott jogcímű sorok
    // (`id_befizetescel`/`id_kiadascel` NULL, vagy nem oldódik fel a
    // bev/kiaCelMap-ben) `if (!code) continue`-val ELVESZTEK — emiatt a
    // csoportnapló ÜRES lehetett, miközben a Registru Casa (ami kód nélkül is
    // listáz) tele volt. Mostantól ezek egy „Fără capitol — Besorolatlan"
    // gyűjtőcsoportba kerülnek a szekció VÉGÉN, figyelmeztető lábjegyzettel.
    let unclassified: Group | null = null
    for (const r of inPeriod(rows)) {
      const id = isIncome ? (r as IncomeRow).id_befizetescel : (r as ExpenseRow).id_kiadascel
      const code = id ? celMap[id] || '' : ''
      // Belső mozgás (xkey VAGY 3xx/4xx/100-as kód) továbbra is kimarad — a kód
      // nélküli, de xkey-es sor is belső mozgás, NEM besorolatlan tétel.
      if (isInternal(code, (r as { belso_mozgas_xkey?: unknown }).belso_mozgas_xkey)) continue
      let g: Group
      if (!code) {
        if (!unclassified) {
          unclassified = {
            kod: CSOPORTNAPLO_BESOROLATLAN_KOD,
            nev: 'Fără capitol — Besorolatlan (hiányzó/érvénytelen jogcím)',
            items: [],
            total: 0,
          }
        }
        g = unclassified
      } else {
        const cel = data.cellek.find((c) => c.kod === code && c.type === celType)
        if (!map.has(code)) map.set(code, { kod: code, nev: cel?.nev || code, items: [], total: 0 })
        g = map.get(code)!
      }
      const amt = ronOf(r)
      g.total += amt
      const partner = isIncome
        ? (r as IncomeRow).forrasa || '—'
        : (r as ExpenseRow).kedvezmenyzett || (r as ExpenseRow).atvevo || '—'
      g.items.push({
        datum: fmtDate(r.datum),
        docType: getDocType(r),
        docNum: getDocNumber(r),
        partner: String(partner),
        megjegyzes: r.megjegyzes || '',
        osszeg: amt,
      })
    }
    const groups = [...map.values()].sort((a, b) => sortCells(a.kod, b.kod))
    if (unclassified) groups.push(unclassified) // mindig a szekció legvégén
    for (const g of groups) g.items.sort((a, b) => a.datum.localeCompare(b.datum))
    return groups
  }

  const catKod = filters.categoryKod || null
  const bevGroupsAll = buildGroups(data.income, data.bevCelMap, 'B', true)
  const kiaGroupsAll = buildGroups(data.expense, data.kiaCelMap, 'K', false)
  // Jogcím-választó: ha egy konkrét jogcímet kértek, csak azt listázzuk.
  const bevGroups = catKod ? bevGroupsAll.filter((g) => g.kod === catKod) : bevGroupsAll
  const kiaGroups = catKod ? kiaGroupsAll.filter((g) => g.kod === catKod) : kiaGroupsAll

  // ── 2026-08-14 (15. pont): a csoportnapló LAPOKRA BONTÁSA ────────────────
  // Korábban a teljes bevétel+kiadás EGYETLEN <div class="page">-be került, ami
  // korlátlanul nőtt: az előnézetben nem látszott lapokra osztva, nyomtatásban
  // pedig a 2. laptól a .page 10mm-es paddingje nem érvényesült (a @page margó 0),
  // így a táblázat a papír széléig futott, és sem a fejléc, sem az oldalszám nem
  // ismétlődött. Mostantól a szakaszok sor-alapú lapozóval oszlanak lapokra —
  // ugyanaz az elv, mint a részszámadásnál (budget-reporting.ts `oldalMeretek`).

  /** Egy lapokra osztható sor a csoportnaplóban. */
  interface NaploSor {
    html: string
    /** Jogcím-fejléc: nem maradhat árván egy lap alján (a következő lapra tolódik). */
    keepWithNext?: boolean
  }

  /** Egy szakasz (Bevételek / Kiadások) lapozható tartalma. */
  interface NaploSzakasz {
    titleRo: string
    titleHu: string
    partnerRo: string
    partnerHu: string
    totalRo: string
    totalHu: string
    rows: NaploSor[]
    total: number
  }

  const renderSection = (
    titleRo: string,
    titleHu: string,
    groups: Group[],
    partnerRo: string,
    partnerHu: string,
    totalRo: string,
    totalHu: string,
  ): NaploSzakasz | null => {
    if (groups.length === 0) return null
    let rowNo = 0
    let sectionTotal = 0
    const rows: NaploSor[] = []
    for (const g of groups) {
      sectionTotal += g.total
      rows.push({
        html: `<tr class="cat-head"><td colspan="7"><strong>${esc(g.kod)}</strong> — ${esc(g.nev)} <span class="cat-count">(${g.items.length} tétel)</span></td></tr>`,
        keepWithNext: true,
      })
      for (const it of g.items) {
        rowNo += 1
        rows.push({
          html: `<tr class="item">
              <td class="text-center">${rowNo}</td>
              <td class="text-center">${it.datum}</td>
              <td class="text-center">${esc(it.docType)}</td>
              <td class="text-center">${esc(it.docNum)}</td>
              <td>${esc(it.partner)}</td>
              <td>${esc(it.megjegyzes)}</td>
              <td class="text-right">${fmtNum(it.osszeg)}</td>
            </tr>`,
        })
      }
      rows.push({
        html: `<tr class="carry"><td colspan="6" class="text-right">Total capitol — Jogcím összesen:</td><td class="text-right">${fmtNum(g.total)}</td></tr>`,
      })
    }
    return { titleRo, titleHu, partnerRo, partnerHu, totalRo, totalHu, rows, total: sectionTotal }
  }

  const bevSec = renderSection('I. VENITURI', 'BEVÉTELEK', bevGroups, 'Sursa / Partener', 'Forrás / Partner', 'TOTAL VENITURI', 'BEVÉTELEK ÖSSZESEN')
  const kiaSec = renderSection('II. CHELTUIELI', 'KIADÁSOK', kiaGroups, 'Beneficiar', 'Kedvezményezett', 'TOTAL CHELTUIELI', 'KIADÁSOK ÖSSZESEN')
  const sections: NaploSzakasz[] = [bevSec, kiaSec].filter((s): s is NaploSzakasz => s !== null)

  const periodLabel = month ? `LUNA ${MONTH_NAMES_RO[month - 1]} ${year}` : `ANUL ${year}`
  const periodLabelHu = month ? `${year}. ${month}. hónap` : `${year}. teljes év`
  const balance = (bevSec?.total ?? 0) - (kiaSec?.total ?? 0)
  const empty = sections.length === 0
  // 2026-07-10 (S3 #1e): van-e besorolatlan tétel → figyelmeztető lábjegyzet.
  const hasUnclassified =
    bevGroups.some((g) => g.kod === CSOPORTNAPLO_BESOROLATLAN_KOD) ||
    kiaGroups.some((g) => g.kod === CSOPORTNAPLO_BESOROLATLAN_KOD)

  // 2026-08-14 (15. pont): a korábbi `@page { @bottom-right { counter(page) } }`
  // szabály CSS Paged Media margin-box — ezt EGYETLEN böngészőmotor sem támogatja
  // (Chrome/Firefox/Safari mind figyelmen kívül hagyja), csak Prince/Paged.js.
  // A nyomtatvány így oldalszám nélkül jött ki, holott a típusleírás azt ígéri:
  // „Román + magyar, oldalszámozva". Helyette a többi register bevált idiómája:
  // lapon belüli `.page-num` div, valódi „pg. N / M" számozással.
  const extra = `<style>
    .section-title { font-size: 13px; font-weight: bold; margin: 16px 0 2px; text-transform: uppercase; border-bottom: 2px solid #334155; padding-bottom: 2px; }
    .cat-head td { font-weight: bold; font-size: 10.5px; border-top: 1.5px solid #334155; padding: 5px 5px 3px; }
    .cat-head .cat-count { font-weight: normal; font-style: italic; color: #64748b; font-size: 9px; }
    .cat-block { break-inside: auto; }
    .grand { margin-top: 14px; border-top: 2px solid #334155; padding-top: 8px; display: flex; justify-content: flex-end; gap: 28px; font-size: 12px; font-weight: bold; }
    .grand .lbl { color: #475569; font-weight: normal; }
    /* 2026-07-10 (S3 #1e): besorolatlan-figyelmeztetés lábjegyzet */
    .warn-note { margin-top: 10px; font-size: 10px; color: #92400e; border: 1px solid #d97706; border-radius: 4px; padding: 6px 8px; }
  </style>`

  // ── Lap-geometria (fekvő A4) ────────────────────────────────────────────
  // A súlyok „sor-egyenértékben" értendők; 1 egység = egy tétel-sor magassága.
  // Levezetés a fenti styles() méreteiből (1 egység ≈ 5,6mm):
  //   · lap:            210mm − 2×10mm padding            = 190mm
  //   · fejléc-blokk:   ~14mm                              →  marad 176mm
  //   · tétel-sor:      10px betű + 2×4px padding + keret  ≈ 5,6mm  = 1 egység
  //   · szakaszcím + táblázat-fejléc: 8,7 + 1,6 + 8,7mm    ≈ 19mm   ≈ 4 egység
  //   · záró blokk (végösszeg ~9mm + aláírás-sáv ~16mm)    ≈ 25mm   ≈ 5 egység
  // A kapacitás szándékosan 30 (a nyers 176/5,6 ≈ 31 helyett): a hosszú
  // partner-nevek két sorba törhetnek, és a túlcsordulás rosszabb az üres helynél.
  const CSN_SOR_PER_LAP = 30
  const CSN_ZARO_TARTALEK = 5
  /** A szakaszcím + a hozzá tartozó táblázat-fejlécsor együttes sor-egyenértéke. */
  const CSN_CIM_SULY = 4

  const fejlecBlokk = `<div class="header">
      <div class="header-left"><div class="entity">${entitasNev(data)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">Registru grupat pe capitole</div><div style="font-size:12px;font-weight:normal">Csoportnapló — jogcímenkénti tétellista</div></div>
      <div class="header-right"><div>${periodLabel}</div><div>${periodLabelHu}</div></div>
    </div>`

  const alairasBlokk = `<div class="footer">
      <div class="footer-item"><div class="footer-line">Conducătorul unității — Lelkész/Gondnok</div></div>
      <div class="footer-item"><div class="footer-line">Întocmit — Készítette</div></div>
      <div class="footer-item"><div class="footer-line">Verificat — Ellenőrizte</div></div>
    </div>`

  const zaroBlokk = `<div class="grand">
      <div><span class="lbl">Total venituri / Bevétel:</span> ${fmtNum(bevSec?.total ?? 0)}</div>
      <div><span class="lbl">Total cheltuieli / Kiadás:</span> ${fmtNum(kiaSec?.total ?? 0)}</div>
      <div><span class="lbl">Rezultat / Egyenleg:</span> ${fmtNum(balance)}</div>
    </div>${
      hasUnclassified
        ? `<p class="warn-note">⚠ Notă / Megjegyzés: a „<strong>Fără capitol — Besorolatlan</strong>" csoport tételeihez nem tartozik érvényes költségvetési jogcím (számadási cél). Összegük a végösszegben szerepel, de fejezet-bontásuk hiányzik — javítsd a tételeket a Pénzügy fülön (jogcím kiválasztása), majd nyomtasd újra a naplót.</p>`
        : ''
    }`

  let content: string
  if (empty) {
    // 2026-07-10 (S3 #1e): az üres állapot nevezze meg az időszakot (és a
    // jogcímet), és mondja el, hogyan lehet másik időszakra váltani — így
    // a felhasználó nem hibának, hanem üres időszaknak látja.
    content = `<div class="page">
    ${fejlecBlokk}
    <p style="text-align:center;margin-top:40px;color:#64748b;line-height:1.7">
      Nincs könyvelt tétel a kiválasztott időszakban: <strong>${esc(periodLabelHu)}</strong>${catKod ? ` — jogcím: <strong>${esc(catKod)}</strong>` : ''}.<br>
      Válassz másik évet vagy hónapot (vagy „Teljes év" nézetet${catKod ? ', illetve másik jogcímet' : ''}) a bal oldali szűrőkkel.<br>
      <span style="font-size:11px">Nu există înregistrări în perioada selectată (${esc(periodLabel)}).</span>
    </p>
    ${alairasBlokk}
    <div class="page-num">pg. 1 / 1</div>
  </div>`
  } else {
    // A szakaszok EGYETLEN folyamatos sorfolyamot alkotnak, és ott törnek lapra,
    // ahol a lap betelik — így nem keletkezik félig üres lap pusztán azért, mert
    // új szakasz kezdődik. Egy lapra tehát kerülhet a Venituri vége ÉS a
    // Cheltuieli eleje is (külön táblázatban, saját fejléccel).
    type Egyseg =
      | { tipus: 'cim'; sec: NaploSzakasz; suly: number }
      | { tipus: 'sor'; sec: NaploSzakasz; html: string; keepWithNext?: boolean; suly: number }
      | { tipus: 'osszeg'; sec: NaploSzakasz; suly: number }

    const egysegek: Egyseg[] = []
    for (const sec of sections) {
      egysegek.push({ tipus: 'cim', sec, suly: CSN_CIM_SULY })
      for (const r of sec.rows) {
        egysegek.push({ tipus: 'sor', sec, html: r.html, keepWithNext: r.keepWithNext, suly: 1 })
      }
      egysegek.push({ tipus: 'osszeg', sec, suly: 1 })
    }

    // Súly szerinti lapokra osztás.
    const lapok: Egyseg[][] = []
    let aktualis: Egyseg[] = []
    let suly = 0
    for (const e of egysegek) {
      if (suly + e.suly > CSN_SOR_PER_LAP && aktualis.length > 0) {
        lapok.push(aktualis)
        aktualis = []
        suly = 0
      }
      aktualis.push(e)
      suly += e.suly
    }
    if (aktualis.length > 0) lapok.push(aktualis)

    // Árva blokkok a lap alján: a szakaszcím tételsor nélkül, illetve a
    // jogcím-fejléc a saját tételei nélkül — mindkettő a következő lapra tolódik.
    const arva = (e: Egyseg): boolean =>
      e.tipus === 'cim' || (e.tipus === 'sor' && e.keepWithNext === true)
    for (let i = 0; i < lapok.length - 1; i++) {
      while (lapok[i].length > 1 && arva(lapok[i][lapok[i].length - 1])) {
        lapok[i + 1].unshift(lapok[i].pop() as Egyseg)
      }
    }

    // Ha az utolsó lapon már nem férne el a záró blokk (végösszeg + esetleges
    // figyelmeztetés + aláírás-sáv), az külön lapra kerül.
    const utolsoSuly = lapok[lapok.length - 1].reduce((a, e) => a + e.suly, 0)
    if (utolsoSuly > CSN_SOR_PER_LAP - CSN_ZARO_TARTALEK) lapok.push([])

    const osszLap = lapok.length
    content = lapok
      .map((lapEgysegek, idx) => {
        const utolsoOsszesen = idx === osszLap - 1

        // A lap egységeit szakaszonként FUTAMOKRA bontjuk: minden futam egy
        // önálló táblázat, saját szakaszcímmel és fejlécsorral.
        const futamok: Egyseg[][] = []
        for (const e of lapEgysegek) {
          const utolsoFutam = futamok[futamok.length - 1]
          if (utolsoFutam && utolsoFutam[0].sec === e.sec) utolsoFutam.push(e)
          else futamok.push([e])
        }

        const tablazatok = futamok
          .map((futam) => {
            const s = futam[0].sec
            // Ha a futam NEM a szakasz címével kezdődik, akkor ez a szakasz az
            // előző lapról folytatódik — a cím ezt jelzi.
            const folytatas = futam[0].tipus !== 'cim'
            const cimUtotag = folytatas
              ? ' <span style="font-weight:normal;font-style:italic">· continuare — folytatás</span>'
              : ''
            const sorok = futam.filter((e): e is Extract<Egyseg, { tipus: 'sor' }> => e.tipus === 'sor')
            const vanOsszeg = futam.some((e) => e.tipus === 'osszeg')
            return `<h2 class="section-title">${s.titleRo} — ${s.titleHu}${cimUtotag}</h2>
      <table>
        <thead>
          <tr>
            <th>Nr.<br>Sorsz.</th>
            <th>Data<br>Dátum</th>
            <th>Fel<br>Irat</th>
            <th>Nr. doc.<br>Iratszám</th>
            <th>${s.partnerRo}<br>${s.partnerHu}</th>
            <th>Observații<br>Megjegyzés</th>
            <th>Suma (lei)<br>Összeg</th>
          </tr>
        </thead>
        <tbody class="cat-block">${sorok.map((r) => r.html).join('')}</tbody>
        ${vanOsszeg ? `<tbody><tr class="totals"><td colspan="6" class="text-right">${s.totalRo} — ${s.totalHu}:</td><td class="text-right">${fmtNum(s.total)}</td></tr></tbody>` : ''}
      </table>`
          })
          .join('')

        return `<div class="page">
    ${fejlecBlokk}
    ${tablazatok}
    ${utolsoOsszesen ? zaroBlokk : ''}
    ${utolsoOsszesen ? alairasBlokk : ''}
    <div class="page-num">pg. ${idx + 1} / ${osszLap}</div>
  </div>`
      })
      .join('')
  }

  return {
    title: `Csoportnapló — ${periodLabelHu}`,
    filename: `Csoportnaplo_${year}${month ? '_' + String(month).padStart(2, '0') : '_teljes_ev'}.pdf`,
    orientation: 'landscape',
    html: wrap(`Csoportnapló — ${periodLabelHu}`, content, extra),
  }
}

/**
 * Fő belépési pont.
 * Ha `filters.month` null → teljes éves nyomtatvány: minden hónapra külön oldal,
 * éves sorszámozással (pg. 1, 2, 3...).
 */
export function buildFinancePrintDocument(
  type: FinancePrintType,
  data: FinanceReportData,
  filters: FinanceReportFilters,
): FinancePrintResult {
  // Nyugtatömb kimutatás — külön builder, dátum szűrés nélkül (éves nézet)
  if (type === 'nyugtatomb_kimutatas') {
    return buildNyugtatombKimutatas(data, filters.year)
  }

  // A kiadási kísérőívet külön kell hívni (buildKiadasiKiseroiv)
  if (type === 'kiadasi_kiseroiv') {
    const monthToUse = filters.month || new Date().getMonth() + 1
    return buildRegistruCasa(data, { ...filters, month: monthToUse })
  }

  // Csoportnapló — jogcímenként, az EGÉSZ időszakra csoportosítva (NEM hónaponként iterálva)
  if (type === 'csoport_naplo') {
    return buildCsoportNaplo(data, filters)
  }

  const builder = type === 'registru_casa' ? buildRegistruCasa
    : type === 'registru_banca' ? buildRegistruBanca
    : buildRegistruJurnal

  // Ha konkrét hónap van kiválasztva → egyetlen oldalas report
  if (filters.month) {
    return builder(data, { ...filters, month: filters.month })
  }

  // Teljes éves mód: minden hónapra külön oldal, összefűzve egyetlen dokumentumba
  const pages: string[] = []
  let pageNum = 0

  for (let m = 1; m <= 12; m++) {
    // Ellenőrizzük, hogy van-e adat ebben a hónapban
    const monthPrefix = `${filters.year}-${String(m).padStart(2, '0')}`
    const hasData = data.income.some((r) => !r.deleted && (r.datum || '').startsWith(monthPrefix))
      || data.expense.some((r) => !r.deleted && (r.datum || '').startsWith(monthPrefix))

    if (!hasData) continue

    const monthResult = builder(data, { ...filters, month: m } as MonthFilters)
    // Kivonjuk a <body>...</body> közötti tartalmat és az oldalszámot frissítjük
    const bodyMatch = monthResult.html.match(/<body>([\s\S]*)<\/body>/)
    if (bodyMatch) {
      pageNum += 1
      // Cseréljük a pg. 1-et pg. {pageNum}-re
      const pageContent = bodyMatch[1].replace(/pg\.\s*1/, `pg. ${pageNum}`)
      pages.push(pageContent)
    }
  }

  if (pages.length === 0) {
    // Nincs adat az egész évben — üres report
    return builder(data, { ...filters, month: 1 })
  }

  const titleMap: Record<string, string> = {
    registru_casa: 'Registru Casa',
    registru_banca: 'Registru Banca',
    registru_jurnal: 'Registrul-Jurnal',
  }

  const title = titleMap[type] || 'Pénzügyi nyomtatvány'
  const content = pages.join('\n')

  return {
    title: `${title} — ${filters.year}. teljes év`,
    filename: `${type}_${filters.year}_teljes_ev.pdf`,
    orientation: 'landscape',
    html: wrap(`${title} — ${filters.year}`, content),
  }
}
