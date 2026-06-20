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

/** Kibővített típusok a tényleges DB oszlopokkal, amik a típus definícióból hiányozhatnak */
type IncomeRow = BefitetesRow & { bankszamla_id?: number | null }
type ExpenseRow = KiadasRow & { bankszamla_id?: number | null }

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


function getDocType(row: BefitetesRow | KiadasRow): string {
  const irattipus = row.irattipus || ''
  if (irattipus === 'Banki') return 'Extr'
  return 'Chit.'
}

function getDocNumber(row: BefitetesRow | KiadasRow): string {
  return ('iratszam' in row ? row.iratszam : null) || ('nyugta' in row ? row.nyugta : null) || ('bizonylatszam' in row ? (row as KiadasRow).bizonylatszam : null) || ''
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
  const parts = [name, cel?.nev].filter(Boolean)
  return parts.join(' — ')
}

// ---------------------------------------------------------------------------
// Stílusok
// ---------------------------------------------------------------------------

function styles() {
  return `
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #eef1f5; padding: 18px 0; }
    .page { width: 297mm; min-height: 210mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 10mm; break-after: page; position: relative; }
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
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    /* Festéktakarékos: nincs háttér-kitöltés, csak félkövér + dupla felső keret */
    .totals { font-weight: bold; border-top: 2px solid #334155; }
    .carry { font-weight: bold; font-style: italic; }
    .footer { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11px; }
    .footer-item { text-align: center; min-width: 120px; }
    .footer-line { border-top: 1px solid #0f172a; margin-top: 28px; padding-top: 4px; }
    .page-num { position: absolute; bottom: 10mm; right: 10mm; font-size: 10px; color: #64748b; }
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
  `
}

function stylesPortrait() {
  return styles().replace('A4 landscape', 'A4 portrait').replace('width: 297mm; min-height: 210mm', 'width: 210mm; min-height: 297mm')
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
  /** Nyugtatömb kimutatás soradatai — csak a `nyugtatomb_kimutatas` típushoz kötelező. */
  nyugtatombok?: NyugtatombReportRow[]
}


function filterByMonth<T extends { datum: string; deleted: boolean }>(
  rows: T[],
  year: number,
  month: number,
): T[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return rows.filter((r) => !r.deleted && (r.datum || '').startsWith(prefix))
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
    balance += mInc.reduce((s, r) => s + Number(r.osszeg || 0), 0)
    balance -= mExp.reduce((s, r) => s + Number(r.osszeg || 0), 0)
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
  type Row = { date: string; docType: string; docNum: string; desc: string; income: number; expense: number; code: string }
  const rows: Row[] = []

  for (const r of mIncome) {
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      income: Number(r.osszeg || 0), expense: 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  for (const r of mExpense) {
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      income: 0, expense: Number(r.osszeg || 0),
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
    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td class="text-center">${r.date}</td>
      <td class="text-center">${esc(r.docType)}</td>
      <td class="text-center">${esc(r.docNum)}</td>
      <td>${esc(r.desc)}</td>
      <td class="text-right">${r.income ? fmtNum(r.income) : ''}</td>
      <td class="text-right">${r.expense ? fmtNum(r.expense) : ''}</td>
      <td class="text-right">${fmtNum(balance)}</td>
      <td class="text-center">${esc(r.code)}</td>
    </tr>`
  })

  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${esc(data.congregationNameRo || data.congregationName)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">REGISTRU CASA</div></div>
      <div class="header-right"><div>LUNA ${monthRo}</div><div>Anul: ${f.year}</div></div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">Nr<br>crt</th><th rowspan="2">Data<br>inreg.</th><th colspan="2">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Sume</th><th rowspan="2">Sold zi</th><th rowspan="2">Simb.<br>cont.</th></tr>
        <tr><th>Fel</th><th>Numar</th><th>Incasate</th><th>Platite</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td></tr>
      </thead>
      <tbody>
        <tr class="carry"><td colspan="5" class="text-right">Sold luna precedenta:</td><td class="text-right">${fmtNum(carry)}</td><td></td><td class="text-right">${fmtNum(carry)}</td><td></td></tr>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">TOTAL LUNA</td><td class="text-right">${fmtNum(totalInc)}</td><td class="text-right">${fmtNum(totalExp)}</td><td class="text-right">${fmtNum(balance)}</td><td></td></tr>
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
  const openBal = bank?.nyito_egyenleg || data.carryoverBank
  const carry = computeCarryover(data.income, data.expense, f.year, f.month, bankFilter, openBal)

  type Row = { date: string; docType: string; docNum: string; desc: string; income: number; expense: number; code: string }
  const rows: Row[] = []

  for (const r of mIncome) {
    rows.push({ date: fmtDate(r.datum), docType: 'Extr', docNum: getDocNumber(r), desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek), income: Number(r.osszeg || 0), expense: 0, code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap) })
  }
  for (const r of mExpense) {
    rows.push({ date: fmtDate(r.datum), docType: 'OP', docNum: getDocNumber(r), desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek), income: 0, expense: Number(r.osszeg || 0), code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap) })
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
    tbody += `<tr><td class="text-center">${i + 1}</td><td class="text-center">${r.date}</td><td class="text-center">${esc(r.docType)}</td><td class="text-center">${esc(r.docNum)}</td><td>${esc(r.desc)}</td><td class="text-right">${r.income ? fmtNum(r.income) : ''}</td><td class="text-right">${r.expense ? fmtNum(r.expense) : ''}</td><td class="text-right">${fmtNum(balance)}</td><td class="text-center">${esc(r.code)}</td></tr>`
  })

  const bankLabel = bank ? `${bank.bank_neve}${bank.iban ? ` (${bank.iban})` : ''}` : 'Bank'
  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${esc(data.congregationNameRo || data.congregationName)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">REGISTRU BANCA</div><div style="font-size:11px;margin-top:2px">${esc(bankLabel)}</div></div>
      <div class="header-right"><div>LUNA ${monthRo} Anul: ${f.year}</div><div>Operatiuni prin RON</div></div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">Nr<br>crt</th><th rowspan="2">Data<br>inreg.</th><th colspan="2">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Sume</th><th rowspan="2">Sold zi</th><th rowspan="2">Simb.<br>cont.</th></tr>
        <tr><th>Fel</th><th>Numar</th><th>Incasate</th><th>Platite</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td></tr>
      </thead>
      <tbody>
        <tr class="carry"><td colspan="5" class="text-right">Sold luna precedenta:</td><td class="text-right">${fmtNum(carry)}</td><td></td><td class="text-right">${fmtNum(carry)}</td><td></td></tr>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">TOTAL LUNA</td><td class="text-right">${fmtNum(totalInc)}</td><td class="text-right">${fmtNum(totalExp)}</td><td class="text-right">${fmtNum(balance)}</td><td></td></tr>
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
    const isCash = r.irattipus === 'Készpénz' || (!r.irattipus && !r.bankszamla_id)
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      cashInc: isCash ? Number(r.osszeg || 0) : 0,
      bankInc: !isCash ? Number(r.osszeg || 0) : 0,
      cashExp: 0, bankExp: 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  for (const r of mExpense) {
    const isCash = r.irattipus === 'Készpénz' || (!r.irattipus && !r.bankszamla_id)
    rows.push({
      date: fmtDate(r.datum), docType: getDocType(r), docNum: getDocNumber(r),
      desc: getDescription(r, data.bevCelMap, data.kiaCelMap, data.cellek),
      cashInc: 0, bankInc: 0,
      cashExp: isCash ? Number(r.osszeg || 0) : 0,
      bankExp: !isCash ? Number(r.osszeg || 0) : 0,
      code: getCategoryCode(r, data.bevCelMap, data.kiaCelMap),
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))

  let totCI = 0, totBI = 0, totCE = 0, totBE = 0
  let tbody = ''
  rows.forEach((r, i) => {
    totCI += r.cashInc; totBI += r.bankInc; totCE += r.cashExp; totBE += r.bankExp
    tbody += `<tr>
      <td class="text-center">${prevRowCount + i + 1}</td>
      <td class="text-center">${r.date}</td>
      <td class="text-center">${esc(r.docType)}</td>
      <td class="text-center">${esc(r.docNum)}</td>
      <td>${esc(r.desc)}</td>
      <td class="text-right">${r.cashInc ? fmtNum(r.cashInc) : ''}</td>
      <td class="text-right">${r.bankInc ? fmtNum(r.bankInc) : ''}</td>
      <td class="text-right">${r.cashExp ? fmtNum(r.cashExp) : ''}</td>
      <td class="text-right">${r.bankExp ? fmtNum(r.bankExp) : ''}</td>
      <td class="text-center">${esc(r.code)}</td>
    </tr>`
  })

  // Előző hónapok kumulatív összegei
  let prevCI = 0, prevBI = 0, prevCE = 0, prevBE = 0
  for (let m = 1; m < f.month; m++) {
    const mi = filterByMonth(data.income, f.year, m)
    const me = filterByMonth(data.expense, f.year, m)
    for (const r of mi) {
      const isCash = r.irattipus === 'Készpénz' || (!r.irattipus && !r.bankszamla_id)
      if (isCash) prevCI += Number(r.osszeg || 0); else prevBI += Number(r.osszeg || 0)
    }
    for (const r of me) {
      const isCash = r.irattipus === 'Készpénz' || (!r.irattipus && !r.bankszamla_id)
      if (isCash) prevCE += Number(r.osszeg || 0); else prevBE += Number(r.osszeg || 0)
    }
  }

  const rulCI = prevCI + totCI, rulBI = prevBI + totBI, rulCE = prevCE + totCE, rulBE = prevBE + totBE
  const soldCash = carryCashInc + totCI - totCE
  const soldBank = carryBankInc + totBI - totBE

  const monthRo = MONTH_NAMES_RO[f.month - 1]
  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div>Unitate:</div><div class="entity">${esc(data.congregationNameRo || data.congregationName)}</div></div>
      <div class="header-center"><div class="title">REGISTRUL-JURNAL DE INCASARI SI PLATI</div></div>
      <div class="header-right"><div>LUNA ${monthRo} ANUL ${f.year}</div></div>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">Nr.<br>crt.</th><th rowspan="2">Data<br>inreg.</th><th colspan="2">Document</th><th rowspan="2">Explicatii</th><th colspan="2">Incasari</th><th colspan="2">Plati</th><th rowspan="2">Simb.<br>cont.</th></tr>
        <tr><th>Fel</th><th>Numar</th><th>Numerar</th><th>Banca</th><th>Numerar</th><th>Banca</th></tr>
        <tr style="font-size:8px"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td><td>10</td></tr>
      </thead>
      <tbody>
        <tr class="carry"><td colspan="5" class="text-right">Report din luna precedenta:</td><td class="text-right">${fmtNum(prevCI + data.carryoverCash)}</td><td class="text-right">${fmtNum(prevBI + data.carryoverBank)}</td><td class="text-right">${fmtNum(prevCE)}</td><td class="text-right">${fmtNum(prevBE)}</td><td></td></tr>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">Total luna</td><td class="text-right">${fmtNum(totCI)}</td><td class="text-right">${fmtNum(totBI)}</td><td class="text-right">${fmtNum(totCE)}</td><td class="text-right">${fmtNum(totBE)}</td><td></td></tr>
        <tr class="totals"><td colspan="5" class="text-right">Total rulaj</td><td class="text-right">${fmtNum(rulCI + data.carryoverCash)}</td><td class="text-right">${fmtNum(rulBI + data.carryoverBank)}</td><td class="text-right">${fmtNum(rulCE)}</td><td class="text-right">${fmtNum(rulBE)}</td><td></td></tr>
        <tr class="totals"><td colspan="5" class="text-right">Sold numerar (6-8) / Sold banca (7-9)</td><td class="text-right">${fmtNum(soldCash)}</td><td class="text-right">${fmtNum(soldBank)}</td><td colspan="3"></td></tr>
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
  kiaCelMap: Record<number, string>
  cellek: SzamadasiCel[]
}): FinancePrintResult {
  const { expenses, date, pageNumber, congregationName, kiaCelMap, cellek } = params

  const total = expenses.reduce((s, r) => s + Number(r.osszeg || 0), 0)

  let tbody = ''
  expenses.forEach((r, i) => {
    const code = r.id_kiadascel ? (kiaCelMap[r.id_kiadascel] || '') : ''
    const cel = cellek.find((c) => c.kod === code)
    const name = r.kedvezmenyzett || r.atvevo || ''
    const desc = [name, cel?.nev].filter(Boolean).join(' — ')

    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${esc(getDocNumber(r))}</td>
      <td>${esc(r.irattipus || 'Chit.')}</td>
      <td class="text-center">${esc(code)}</td>
      <td>${esc(desc)}</td>
      <td class="text-right">${fmtNum(Number(r.osszeg || 0))}</td>
    </tr>`
  })

  const html = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${esc(congregationName)}</div></div>
      <div class="header-center"><div class="title" style="text-decoration:underline">KIAD&Aacute;SI K&Iacute;S&Eacute;R&Odblac;&Iacute;V</div></div>
      <div class="header-right"><div>${pageNumber}. sz. kiad&aacute;s ${fmtDate(date)}</div><div>Kasszak&ouml;nyv</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Kiad. sz.</th><th>Iratsz&aacute;m</th><th>Irat</th><th>K&ouml;lts&eacute;gv. T&eacute;tel</th><th>Kiad&aacute;s megnevez&eacute;se</th><th>&Ouml;sszeg</th>
      </tr></thead>
      <tbody>
        ${tbody}
        <tr class="totals"><td colspan="5" class="text-right">&Ouml;sszesen kiad&aacute;s - ${fmtDate(date)}</td><td class="text-right">${fmtNum(total)}</td></tr>
      </tbody>
    </table>
    <div class="footer">
      <div class="footer-item"><div class="footer-line">Lelkip&aacute;sztor</div></div>
      <div class="footer-item"><div class="footer-line">Ellen&odblac;rizte</div></div>
      <div class="footer-item"><div class="footer-line">Gondnok</div></div>
    </div>
    <div class="page-num">pg. ${pageNumber}</div>
  </div>`

  return {
    title: 'Kiadási kísérőív',
    filename: `Kiadasi_kiseroiv_${fmtDate(date).replace(/\./g, '_')}.pdf`,
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
  const congregationName = data.congregationName || '—'

  function fmtHu(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const head = `
    <div class="title-row">
      <div>
        <div class="title">Nyugtatömb kimutatás — ${year}</div>
        <div class="subtitle">${esc(congregationName)}</div>
      </div>
      <div class="pageinfo">A4 fekvő · pg. 1</div>
    </div>
  `

  const tableRows = rows.length === 0
    ? `<tr><td colspan="11" class="empty">Nincs olyan tömb, amelyet ${year}-ban használatba vettek.</td></tr>`
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
        <td class="${r.aktiv ? 'badge-active' : 'badge-closed'}">${r.aktiv ? 'Aktív' : 'Lezárt'}</td>
      </tr>
    `).join('')

  const table = `
    <table class="nt">
      <thead>
        <tr>
          <th>Sorsz.</th>
          <th>Blokksz.</th>
          <th>Seria</th>
          <th>Nyomdai kezdet</th>
          <th>Nyomdai vég</th>
          <th>Első dátum</th>
          <th>Utolsó dátum</th>
          <th>Saját kezdet</th>
          <th>Saját vég</th>
          <th>Felhasznált / Össz</th>
          <th>Állapot</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `

  const totals = rows.length > 0 ? `
    <div class="totals">
      Összesen: <strong>${rows.length}</strong> tömb ·
      ${rows.reduce((sum, r) => sum + r.felhasznalt_darabszam, 0)} felhasznált nyugta /
      ${rows.reduce((sum, r) => sum + r.darabszam_ossz, 0)} össz
    </div>
  ` : ''

  const signatures = `
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Lelkipásztor</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Gondnok</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Pénztáros</div>
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
 * A belső mozgások (3xx/4xx kód vagy belső-mozgás kulcs) kimaradnak.
 */
function buildCsoportNaplo(data: FinanceReportData, filters: FinanceReportFilters): FinancePrintResult {
  const { year, month } = filters
  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-`
  const inPeriod = <T extends { datum: string; deleted: boolean }>(rows: T[]): T[] =>
    rows.filter((r) => !r.deleted && (r.datum || '').startsWith(prefix))

  const isInternal = (code: string, xkey: unknown) => !!xkey || /^[34]/.test(code)

  type Item = { datum: string; docType: string; docNum: string; partner: string; megjegyzes: string; osszeg: number }
  type Group = { kod: string; nev: string; items: Item[]; total: number }

  const buildGroups = (
    rows: (IncomeRow | ExpenseRow)[],
    celMap: Record<number, string>,
    celType: 'B' | 'K',
    isIncome: boolean,
  ): Group[] => {
    const map = new Map<string, Group>()
    for (const r of inPeriod(rows)) {
      const id = isIncome ? (r as IncomeRow).id_befizetescel : (r as ExpenseRow).id_kiadascel
      const code = id ? celMap[id] || '' : ''
      if (!code) continue
      if (isInternal(code, (r as { belso_mozgas_xkey?: unknown }).belso_mozgas_xkey)) continue
      const cel = data.cellek.find((c) => c.kod === code && c.type === celType)
      if (!map.has(code)) map.set(code, { kod: code, nev: cel?.nev || code, items: [], total: 0 })
      const g = map.get(code)!
      const amt = Number(r.osszeg || 0)
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
    for (const g of map.values()) g.items.sort((a, b) => a.datum.localeCompare(b.datum))
    return [...map.values()].sort((a, b) => sortCells(a.kod, b.kod))
  }

  const catKod = filters.categoryKod || null
  const bevGroupsAll = buildGroups(data.income, data.bevCelMap, 'B', true)
  const kiaGroupsAll = buildGroups(data.expense, data.kiaCelMap, 'K', false)
  // Jogcím-választó: ha egy konkrét jogcímet kértek, csak azt listázzuk.
  const bevGroups = catKod ? bevGroupsAll.filter((g) => g.kod === catKod) : bevGroupsAll
  const kiaGroups = catKod ? kiaGroupsAll.filter((g) => g.kod === catKod) : kiaGroupsAll

  const renderSection = (
    titleRo: string,
    titleHu: string,
    groups: Group[],
    partnerRo: string,
    partnerHu: string,
    totalRo: string,
    totalHu: string,
  ): { html: string; total: number } => {
    if (groups.length === 0) return { html: '', total: 0 }
    let rowNo = 0
    let sectionTotal = 0
    const blocks = groups
      .map((g) => {
        sectionTotal += g.total
        const itemRows = g.items
          .map((it) => {
            rowNo += 1
            return `<tr>
              <td class="text-center">${rowNo}</td>
              <td class="text-center">${it.datum}</td>
              <td class="text-center">${esc(it.docType)}</td>
              <td class="text-center">${esc(it.docNum)}</td>
              <td>${esc(it.partner)}</td>
              <td>${esc(it.megjegyzes)}</td>
              <td class="text-right">${fmtNum(it.osszeg)}</td>
            </tr>`
          })
          .join('')
        return `<tbody class="cat-block">
          <tr class="cat-head"><td colspan="7"><strong>${esc(g.kod)}</strong> — ${esc(g.nev)} <span class="cat-count">(${g.items.length} tétel)</span></td></tr>
          ${itemRows}
          <tr class="carry"><td colspan="6" class="text-right">Total capitol — Jogcím összesen:</td><td class="text-right">${fmtNum(g.total)}</td></tr>
        </tbody>`
      })
      .join('')

    const html = `
      <h2 class="section-title">${titleRo} — ${titleHu}</h2>
      <table>
        <thead>
          <tr>
            <th>Nr.<br>Sorsz.</th>
            <th>Data<br>Dátum</th>
            <th>Fel<br>Irat</th>
            <th>Nr. doc.<br>Iratszám</th>
            <th>${partnerRo}<br>${partnerHu}</th>
            <th>Observații<br>Megjegyzés</th>
            <th>Suma (lei)<br>Összeg</th>
          </tr>
        </thead>
        ${blocks}
        <tbody><tr class="totals"><td colspan="6" class="text-right">${totalRo} — ${totalHu}:</td><td class="text-right">${fmtNum(sectionTotal)}</td></tr></tbody>
      </table>`
    return { html, total: sectionTotal }
  }

  const bev = renderSection('I. VENITURI', 'BEVÉTELEK', bevGroups, 'Sursa / Partener', 'Forrás / Partner', 'TOTAL VENITURI', 'BEVÉTELEK ÖSSZESEN')
  const kia = renderSection('II. CHELTUIELI', 'KIADÁSOK', kiaGroups, 'Beneficiar', 'Kedvezményezett', 'TOTAL CHELTUIELI', 'KIADÁSOK ÖSSZESEN')

  const periodLabel = month ? `LUNA ${MONTH_NAMES_RO[month - 1]} ${year}` : `ANUL ${year}`
  const periodLabelHu = month ? `${year}. ${month}. hónap` : `${year}. teljes év`
  const balance = bev.total - kia.total
  const empty = bevGroups.length === 0 && kiaGroups.length === 0

  const extra = `<style>
    @page { @bottom-right { content: "pg. " counter(page) " / " counter(pages); font-size: 9px; color: #64748b; } }
    .section-title { font-size: 13px; font-weight: bold; margin: 16px 0 2px; text-transform: uppercase; border-bottom: 2px solid #334155; padding-bottom: 2px; }
    .cat-head td { font-weight: bold; font-size: 10.5px; border-top: 1.5px solid #334155; padding: 5px 5px 3px; }
    .cat-head .cat-count { font-weight: normal; font-style: italic; color: #64748b; font-size: 9px; }
    .cat-block { break-inside: auto; }
    .grand { margin-top: 14px; border-top: 2px solid #334155; padding-top: 8px; display: flex; justify-content: flex-end; gap: 28px; font-size: 12px; font-weight: bold; }
    .grand .lbl { color: #475569; font-weight: normal; }
  </style>`

  const content = `<div class="page">
    <div class="header">
      <div class="header-left"><div class="entity">${esc(data.congregationNameRo || data.congregationName)}</div><div>Unitate</div></div>
      <div class="header-center"><div class="title">Registru grupat pe capitole</div><div style="font-size:12px;font-weight:normal">Csoportnapló — jogcímenkénti tétellista</div></div>
      <div class="header-right"><div>${periodLabel}</div><div>${periodLabelHu}</div></div>
    </div>
    ${
      empty
        ? '<p style="text-align:center;margin-top:40px;color:#64748b">Nincs könyvelt tétel ebben az időszakban. / Nu există înregistrări în această perioadă.</p>'
        : bev.html + kia.html
    }
    ${
      empty
        ? ''
        : `<div class="grand">
      <div><span class="lbl">Total venituri / Bevétel:</span> ${fmtNum(bev.total)}</div>
      <div><span class="lbl">Total cheltuieli / Kiadás:</span> ${fmtNum(kia.total)}</div>
      <div><span class="lbl">Rezultat / Egyenleg:</span> ${fmtNum(balance)}</div>
    </div>`
    }
    <div class="footer">
      <div class="footer-item"><div class="footer-line">Conducătorul unității — Lelkész/Gondnok</div></div>
      <div class="footer-item"><div class="footer-line">Întocmit — Készítette</div></div>
      <div class="footer-item"><div class="footer-line">Verificat — Ellenőrizte</div></div>
    </div>
  </div>`

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
