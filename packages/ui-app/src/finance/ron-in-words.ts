/**
 * Román összeg → betűvel kiírás (lei + bani).
 *
 * A `Dispozitie de plata_2026.xlsx` AG/AH oszlopainak logikáját portolja
 * tiszta TypeScriptre, de helyes román helyesírással (szóközök, „și", „de").
 *
 * Példák:
 *   ronInWords(221)     → "Douăsute douăzeci și unu lei și 00 bani"
 *   ronInWords(1234.5)  → "Una mie două sute treizeci și patru lei și 50 bani"
 *   ronInWords(100)     → "Una sută lei și 00 bani"
 *
 * NEM importál környezet-függő modult — web és desktop egyaránt használja
 * (élő nyomtatási előnézet + PDF).
 */

const UNITS_M = ['', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă']
const UNITS_F = ['', 'una', 'două', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă']
const TEENS = [
  'zece', 'unsprezece', 'doisprezece', 'treisprezece', 'paisprezece',
  'cincisprezece', 'șaisprezece', 'șaptesprezece', 'optsprezece', 'nouăsprezece',
]
const TENS = ['', '', 'douăzeci', 'treizeci', 'patruzeci', 'cincizeci', 'șaizeci', 'șaptezeci', 'optzeci', 'nouăzeci']

/** 1..99 szóban, a megadott nem (gender) szerint az egyesekre. */
function tensWords(n: number, feminine: boolean): string {
  const units = feminine ? UNITS_F : UNITS_M
  if (n === 0) return ''
  if (n < 10) return units[n]
  if (n < 20) return TEENS[n - 10]
  const t = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? TENS[t] : `${TENS[t]} și ${units[u]}`
}

/** 1..999 szóban. */
function threeDigits(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (h === 1) parts.push('o sută')
  else if (h === 2) parts.push('două sute')
  else if (h >= 3) parts.push(`${UNITS_M[h]} sute`)
  const restWords = tensWords(rest, feminine)
  if (restWords) parts.push(restWords)
  return parts.join(' ')
}

/**
 * Igaz, ha a szám elé „de" kell a főnév előtt (pl. „o sută DE lei"):
 * az utolsó két számjegy 0, vagy 20–99 között van.
 */
function needsDe(n: number): boolean {
  const last2 = n % 100
  return n !== 0 && (last2 === 0 || last2 >= 20)
}

function integerWords(n: number, feminine: boolean): string {
  if (n === 0) return 'zero'
  const millions = Math.floor(n / 1_000_000)
  const afterM = n % 1_000_000
  const thousands = Math.floor(afterM / 1000)
  const rest = afterM % 1000
  const parts: string[] = []

  if (millions > 0) {
    if (millions === 1) parts.push('un milion')
    else if (millions === 2) parts.push('două milioane')
    else parts.push(`${threeDigits(millions, false)}${needsDe(millions) ? ' de' : ''} milioane`)
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('o mie')
    else if (thousands === 2) parts.push('două mii')
    else {
      const tw = threeDigits(thousands, true) // „mie" nőnemű
      parts.push(`${tw}${needsDe(thousands) ? ' de' : ''} mii`)
    }
  }
  if (rest > 0) parts.push(threeDigits(rest, feminine))
  return parts.join(' ')
}

function capitalizeFirst(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * Teljes összeg betűvel: „<lei betűvel>[ de] lei și NN bani".
 * Az első betű nagy. A bani két számjeggyel, számmal jelenik meg
 * (a hivatalos gyakorlat szerint, pl. „și 00 bani").
 */
export function ronInWords(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0
  const lei = Math.floor(safe + 1e-9)
  const bani = Math.round((safe - lei) * 100)
  // Kerekítési átfordulás kezelése (pl. 0.999 → 1 leu, 0 bani)
  const leiFinal = bani === 100 ? lei + 1 : lei
  const baniFinal = bani === 100 ? 0 : bani

  // 1 leu kivétel: „un leu" (nem „unu lei")
  if (leiFinal === 1) {
    const baniStr1 = String(baniFinal).padStart(2, '0')
    return capitalizeFirst(`un leu și ${baniStr1} ${baniFinal === 1 ? 'ban' : 'bani'}`)
  }
  const leiWords = integerWords(leiFinal, false) // „lei" hímnemű
  const de = needsDe(leiFinal) ? ' de' : ''
  const baniStr = String(baniFinal).padStart(2, '0')
  const baniNoun = baniFinal === 1 ? 'ban' : 'bani'
  return capitalizeFirst(`${leiWords}${de} lei și ${baniStr} ${baniNoun}`)
}

/**
 * Dispoziție-specifikus betűvel-kiírás.
 *
 * A hivatalos rendelvény tömör formát kér: a szám-szavak EGYBEÍRVA (szóközök
 * nélkül), az első betű nagy, a „de lei"/„lei" külön marad, és 0 bani esetén a
 * bani-rész teljesen elmarad.
 *
 * Példák:
 *   ronInWordsDispozitie(850)     → "Optsutecincizeci de lei"
 *   ronInWordsDispozitie(221)     → "Douăsutedouăzeciișiunu de lei"
 *   ronInWordsDispozitie(221.5)   → "Douăsutedouăzeciișiunu de lei și cincizeci bani"
 *   ronInWordsDispozitie(1)       → "Un leu"
 */
export function ronInWordsDispozitie(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0
  const lei = Math.floor(safe + 1e-9)
  const bani = Math.round((safe - lei) * 100)
  const leiFinal = bani === 100 ? lei + 1 : lei
  const baniFinal = bani === 100 ? 0 : bani

  // A szám-szavakból minden szóközt eltávolítunk (a „de" + főnév külön marad).
  const noSpaces = (s: string) => s.replace(/\s+/g, '')

  let leiPart: string
  if (leiFinal === 1) {
    leiPart = 'un leu'
  } else {
    const de = needsDe(leiFinal) ? ' de' : ''
    leiPart = `${noSpaces(integerWords(leiFinal, false))}${de} lei`
  }

  // 0 bani esetén nem írjuk ki a bani-részt.
  if (baniFinal === 0) {
    return capitalizeFirst(leiPart)
  }
  const baniNoun = baniFinal === 1 ? 'ban' : 'bani'
  return capitalizeFirst(`${leiPart} și ${noSpaces(integerWords(baniFinal, false))} ${baniNoun}`)
}

/** RON összeg formázása román konvenció szerint: 1.234,50 */
export function formatRon(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const fixed = Math.abs(safe).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${safe < 0 ? '-' : ''}${withThousands},${decPart}`
}
