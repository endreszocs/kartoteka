/**
 * Egész szám → szó konverzió magyar és román nyelven.
 *
 * Használat: nyugta-generátor („adică / éspedig" mező).
 * A pénznem („lej" / „RON") külön kerül a szöveghez.
 *
 * Példa:
 *   numberToWordsHu(420)  →  "négyszázhúsz"
 *   numberToWordsRo(420)  →  "patrusute douazeci"
 */

// ─────────────────────────────────────────────────────────────
// MAGYAR
// ─────────────────────────────────────────────────────────────

const HU_EGYESEK = [
  '', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc',
]
const HU_TIZESEK = [
  '', 'tíz', 'húsz', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven',
]
const HU_TIZENX: Record<number, string> = {
  10: 'tíz',
  11: 'tizenegy', 12: 'tizenkettő', 13: 'tizenhárom', 14: 'tizennégy',
  15: 'tizenöt', 16: 'tizenhat', 17: 'tizenhét', 18: 'tizennyolc', 19: 'tizenkilenc',
  20: 'húsz',
  21: 'huszonegy', 22: 'huszonkettő', 23: 'huszonhárom', 24: 'huszonnégy',
  25: 'huszonöt', 26: 'huszonhat', 27: 'huszonhét', 28: 'huszonnyolc', 29: 'huszonkilenc',
}

function huUnder100(n: number): string {
  if (n === 0) return ''
  if (HU_TIZENX[n]) return HU_TIZENX[n]
  if (n < 10) return HU_EGYESEK[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  if (ones === 0) return HU_TIZESEK[tens]
  return `${HU_TIZESEK[tens]}${HU_EGYESEK[ones]}`
}

function huUnder1000(n: number): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  let out = ''
  if (hundreds > 0) {
    if (hundreds === 1) out = 'száz'
    else out = `${HU_EGYESEK[hundreds]}száz`
  }
  if (rest > 0) {
    out += huUnder100(rest)
  }
  return out
}

/**
 * Egész szám szóban (magyar). 0 ≤ n ≤ 999 999 999.
 * Pénznem nem szerepel a kimenetben — azt külön kell hozzáfűzni.
 */
export function numberToWordsHu(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  const intPart = Math.floor(Math.abs(n))
  if (intPart === 0) return 'nulla'

  const millions = Math.floor(intPart / 1_000_000)
  const thousands = Math.floor((intPart % 1_000_000) / 1000)
  const rest = intPart % 1000

  const parts: string[] = []
  if (millions > 0) {
    parts.push(millions === 1 ? 'egymillió' : `${huUnder1000(millions)}millió`)
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('ezer')
    else parts.push(`${huUnder1000(thousands)}ezer`)
  }
  if (rest > 0) {
    parts.push(huUnder1000(rest))
  }

  return parts.join('')
}

// ─────────────────────────────────────────────────────────────
// ROMÁN
// ─────────────────────────────────────────────────────────────

const RO_EGYESEK = [
  '', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă',
]
const RO_TIZENX: Record<number, string> = {
  10: 'zece', 11: 'unsprezece', 12: 'doisprezece', 13: 'treisprezece',
  14: 'paisprezece', 15: 'cincisprezece', 16: 'șaisprezece',
  17: 'șaptesprezece', 18: 'optsprezece', 19: 'nouăsprezece',
}
const RO_TIZESEK = [
  '', '', 'douăzeci', 'treizeci', 'patruzeci', 'cincizeci',
  'șaizeci', 'șaptezeci', 'optzeci', 'nouăzeci',
]

function roUnder100(n: number): string {
  if (n === 0) return ''
  if (RO_TIZENX[n]) return RO_TIZENX[n]
  if (n < 10) return RO_EGYESEK[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  if (ones === 0) return RO_TIZESEK[tens]
  return `${RO_TIZESEK[tens]} și ${RO_EGYESEK[ones]}`
}

function roUnder1000(n: number): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  let out = ''
  if (hundreds === 1) out = 'o sută'
  else if (hundreds === 2) out = 'două sute'
  else if (hundreds > 0) out = `${RO_EGYESEK[hundreds]} sute`
  if (rest > 0) {
    if (out) out += ' '
    out += roUnder100(rest)
  }
  return out
}

/**
 * Egész szám szóban (román). 0 ≤ n ≤ 999 999 999.
 */
export function numberToWordsRo(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  const intPart = Math.floor(Math.abs(n))
  if (intPart === 0) return 'zero'

  const millions = Math.floor(intPart / 1_000_000)
  const thousands = Math.floor((intPart % 1_000_000) / 1000)
  const rest = intPart % 1000

  const parts: string[] = []
  if (millions === 1) parts.push('un milion')
  else if (millions > 1) parts.push(`${roUnder1000(millions)} milioane`)
  if (thousands === 1) parts.push('o mie')
  else if (thousands === 2) parts.push('două mii')
  else if (thousands > 0) parts.push(`${roUnder1000(thousands)} de mii`)
  if (rest > 0) parts.push(roUnder1000(rest))

  return parts.join(' ')
}

/**
 * Pénzösszeg betűvel — egész + tört rész (ha van).
 * Példa: amountInWordsHu(420.50) → "négyszázhúsz lej és ötven báni"
 */
export function amountInWordsHu(amount: number): string {
  const intPart = Math.floor(amount)
  const fracPart = Math.round((amount - intPart) * 100)
  const intWords = numberToWordsHu(intPart)
  if (fracPart === 0) return `${intWords} lej`
  const fracWords = numberToWordsHu(fracPart)
  return `${intWords} lej és ${fracWords} báni`
}

export function amountInWordsRo(amount: number): string {
  const intPart = Math.floor(amount)
  const fracPart = Math.round((amount - intPart) * 100)
  const intWords = numberToWordsRo(intPart)
  if (fracPart === 0) return `${intWords} lei`
  const fracWords = numberToWordsRo(fracPart)
  return `${intWords} lei și ${fracWords} bani`
}
