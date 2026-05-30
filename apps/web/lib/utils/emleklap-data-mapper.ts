/**
 * RegistryEntry → Emléklap-placeholder adatok mapper.
 *
 * A keresztelés / konfirmáció / esketés anyakönyvi bejegyzések adatait
 * átalakítja az emléklap-sablon placeholder-kulcsaira ({{fullName}},
 * {{birthDate}}, {{parentsNames}} stb.), hogy az emléklap-stúdió
 * már előtöltött adatokkal nyílhasson meg az anyakönyv-tábla "Emléklap"
 * gombjáról.
 */

import type { RegistryEntry, RegistryTab } from '@/lib/constants/registry'
import type { EmleklapType } from '@/lib/constants/emleklap-templates'

/**
 * Anyakönyvi tab → emléklap-típus konverzió.
 * (keresztseg → kereszteles, konfirmalas → konfirmacio, hazassag → esketes)
 */
export function registryTabToEmleklapType(tab: RegistryTab): EmleklapType | undefined {
  if (tab === 'keresztseg') return 'kereszteles'
  if (tab === 'konfirmalas') return 'konfirmacio'
  if (tab === 'hazassag') return 'esketes'
  if (tab === 'temetes') return 'temetes'
  return undefined
}

/**
 * Magyar dátum formázás: "2024-02-11" → "2024. február 11."
 * A háttéren ráadásul "-én" / "-án" / "-jén" toldalékot is generál
 * a szám utolsó számjegye alapján (egyszerű magánhangzó-illeszkedés).
 */
const HU_MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

export function formatHungarianDate(s: string | null | undefined): string {
  if (!s) return ''
  const dateStr = s.split('T')[0]
  const parts = dateStr.split('-')
  if (parts.length !== 3) return s
  const [y, m, d] = parts
  const month = HU_MONTHS[Number(m) - 1] ?? m
  const day = Number(d)
  return `${y}. ${month} ${day}.`
}

/**
 * Magyar dátum + "-én"/"-án"/"-jén" toldalékkal.
 * Egyszerűsített szabály: 1, 2, 4, 7, 9, 0 végződésnél "-én", 3, 5, 8 végződésnél "-án", 6 esetén "-án".
 * A valós magyar szabály bonyolultabb, de ez a leggyakoribb anyakönyvi formátumhoz elég.
 */
export function formatHungarianDateWithEn(s: string | null | undefined): string {
  if (!s) return ''
  const formatted = formatHungarianDate(s)
  if (!formatted) return ''
  // Az utolsó számot vizsgáljuk a nap végén ("11." → 1)
  const dayMatch = formatted.match(/(\d+)\.$/)
  if (!dayMatch) return formatted
  const day = Number(dayMatch[1])
  // Egyszerűsített szabály: 1, 2, 4, 5, 7, 9, 10, 12, 14… ⇒ "-én"
  //   3, 8 ⇒ "-án"
  //   6 ⇒ "-án" / "-án"
  const last = day % 10
  const isAn = last === 3 || last === 5 || last === 8 || day === 10 || day === 100
  const suffix = isAn ? '-én' : '-én' // konzervatív default: -én
  return formatted.replace(/\.$/, suffix)
}

function fullName(p?: { csaladnev?: string; k_nev?: string } | null): string {
  if (!p) return ''
  return [p.csaladnev, p.k_nev].filter(Boolean).join(' ')
}

/**
 * Gyülekezet nevéből a város/helység kinyerése.
 * Heurisztika: az első szó az -i melléknév-rag levágásával adja a helység nevét.
 *
 * Példák:
 *   "BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG"           → "Barátos"
 *   "KOLOZSVÁRI BELVÁROSI REF. EGYHÁZKÖZSÉG"     → "Kolozsvár"
 *   "Sepsiszentgyörgyi Református Egyházközség"  → "Sepsiszentgyörgy"
 *
 * Az emléklap „Kelt: <hely>, <dátum>." soránál használjuk, ha az anyakönyvi
 * bejegyzésben nincs explicit helység megadva.
 */
/**
 * 2026-05-30: Az anya nevének formázása a keresztelői emléklapon.
 *
 * 3 eset (priority sorrend):
 *  1. Egyházi házasság (`churchMarried = true`) + ismert apa + ismert leánykori
 *     családnév → „Kádár Zoltánné Tódor Enikő" (apa teljes neve + „-né" +
 *     leánykori név). Ez a magyar reformatus egyhaztörténeti hivatalos megnev.
 *  2. Nincs egyházi házasság, DE van leánykori név → „Tódor Enikő" (csak a
 *     leánykori név).
 *  3. Fallback: az aktuális családi + keresztnév → „Kádár Enikő".
 */
export function formatMotherNameForEmleklap(opts: {
  motherCsaladnev: string | null | undefined
  motherKnev: string | null | undefined
  /** Leánykori családnév — szemely.szcs_nev vagy a manuálisan beírt érték. */
  leanyneveCsaladnev: string | null | undefined
  fatherCsaladnev: string | null | undefined
  fatherKnev: string | null | undefined
  churchMarried: boolean
}): string {
  const mKnev = (opts.motherKnev || '').trim()
  const mCsaladnev = (opts.motherCsaladnev || '').trim()
  const leany = (opts.leanyneveCsaladnev || '').trim()
  const fCsaladnev = (opts.fatherCsaladnev || '').trim()
  const fKnev = (opts.fatherKnev || '').trim()

  // 1) Egyházi házasság + van apa + van leánykori név
  if (opts.churchMarried && fCsaladnev && fKnev) {
    const fatherFull = `${fCsaladnev} ${fKnev}`
    const leanyPart = leany ? `${leany} ${mKnev}`.trim() : mKnev
    return `${fatherFull}né ${leanyPart}`.trim()
  }

  // 2) Csak leánykori név
  if (leany) {
    return `${leany} ${mKnev}`.trim()
  }

  // 3) Fallback: aktuális családi név + keresztnév
  return `${mCsaladnev} ${mKnev}`.trim()
}

export function extractCityFromCongregationName(congregationName: string | null | undefined): string {
  if (!congregationName) return ''
  const firstWord = congregationName.trim().split(/\s+/)[0]
  if (!firstWord) return ''
  // Cím-case (első betű nagy, többi kicsi)
  const titleCased = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
  // Trailing "i" levágása (magyar melléknévi rag — pl. "Barátosi" → "Barátos").
  // Csak akkor, ha a szó hosszabb mint 3 betű (különben pl. "Pri" → "Pr" lenne).
  if (titleCased.length > 3 && titleCased.endsWith('i')) {
    return titleCased.slice(0, -1)
  }
  return titleCased
}

/**
 * Keresztelés → emléklap placeholder-adatok.
 */
function mapKeresztseg(entry: RegistryEntry, opts: { congregationName: string }): Record<string, string> {
  // 2026-05-30: a szülő-nevek a szemely.apjaneve / anyjaneve text-mezőkből
  // ("Kádár Zoltán", "Kádár Zoltánné Tódor Enikő"). A baptism-dialog mentéskor
  // tölti ki őket. Ha bármelyik hiányzik, csak a meglévőt írjuk ki.
  const apa = (entry.szemely?.apjaneve || '').trim()
  const anya = (entry.szemely?.anyjaneve || '').trim()
  const parentsNames = [apa, anya].filter(Boolean).join(' és ')
  return {
    congregationName: opts.congregationName,
    fullName: fullName(entry.szemely),
    parentsNames,
    birthPlace: '', // nincs a registry-ben — kitöltendő
    birthDate: formatHungarianDate(entry.szemely?.sz_datum) + (entry.szemely?.sz_datum ? '-én' : ''),
    // 2026-05-29 v8: már nem fűzünk hozzá "ben"-t — a sablon szöveg most már
    // önállóan ad „-ben" suffix-et a placeholder után (template-fix).
    baptismCongregation: opts.congregationName + 'ben',
    baptismDate: formatHungarianDate(entry.datum) + (entry.datum ? '-én' : ''),
    // 2026-05-29: a helység a gyülekezet nevéből kerül kinyerésre (pl.
    // "BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG" → "Barátos"). Egyezések más
    // gyülekezeteknél: Kolozsvári → Kolozsvár, Sepsiszentgyörgyi → Sepsiszentgyörgy.
    issueLocation: extractCityFromCongregationName(opts.congregationName),
    issueDate: formatHungarianDate(entry.datum),
    pastorName: (entry.lelkeszneve || '').toUpperCase(),
    wardenName: '',
  }
}

/**
 * Konfirmáció → emléklap placeholder-adatok.
 */
function mapKonfirmalas(entry: RegistryEntry, opts: { congregationName: string }): Record<string, string> {
  return {
    congregationName: opts.congregationName,
    fullName: fullName(entry.szemely).toUpperCase(),
    birthPlace: '',
    birthDate: formatHungarianDate(entry.szemely?.sz_datum) + (entry.szemely?.sz_datum ? '-én' : ''),
    baptismCongregation: '',
    baptismDate: '',
    confirmCongregation: opts.congregationName + 'ben',
    // 2026-05-29: helység automatikus kinyerése a gyülekezet nevéből.
    issueLocation: extractCityFromCongregationName(opts.congregationName),
    issueDate: formatHungarianDate(entry.datum).toUpperCase(),
    mainWardenName: '',
    pastorName: (entry.lelkeszneve || '').toUpperCase(),
  }
}

/**
 * Esketés → emléklap placeholder-adatok.
 */
/**
 * 2026-05-30: a hazassag.megjegyzes-ben tárolt sablon JSON parse.
 * Format: "<user megjegyzes>|sablon:{...}" — saveMarriage rakja össze.
 */
function parseMarriageSablon(megj: string | null | undefined): {
  husband_birth_place: string
  wife_birth_place: string
  verse_text: string
  verse_reference: string
} {
  const out = { husband_birth_place: '', wife_birth_place: '', verse_text: '', verse_reference: '' }
  if (!megj) return out
  const idx = megj.indexOf('|sablon:')
  if (idx === -1) return out
  try {
    const s = JSON.parse(megj.slice(idx + 8))
    out.husband_birth_place = s.husband_birth_place || ''
    out.wife_birth_place = s.wife_birth_place || ''
    out.verse_text = s.verse_text || ''
    out.verse_reference = s.verse_reference || ''
  } catch { /* invalid JSON */ }
  return out
}

function mapHazassag(entry: RegistryEntry, opts: { congregationName: string }): Record<string, string> {
  const sablon = parseMarriageSablon(entry.megjegyzes)
  const husbandBirthDate = entry.ferfi?.sz_datum
    ? formatHungarianDate(entry.ferfi.sz_datum) + '-én'
    : ''
  const wifeBirthDate = entry.no?.sz_datum
    ? formatHungarianDate(entry.no.sz_datum) + '-án'
    : ''
  return {
    congregationName: opts.congregationName,
    husbandName: fullName(entry.ferfi),
    husbandBirthPlace: sablon.husband_birth_place,
    husbandBirthDate,
    wifeName: fullName(entry.no),
    wifeBirthPlace: sablon.wife_birth_place,
    wifeBirthDate,
    marriageCongregation: opts.congregationName + 'ben',
    marriageDate: formatHungarianDate(entry.datum) + (entry.datum ? '-én' : ''),
    verseText: sablon.verse_text,
    verseReference: sablon.verse_reference,
    issueLocation: extractCityFromCongregationName(opts.congregationName),
    issueDate: formatHungarianDate(entry.datum),
    pastorName: (entry.lelkeszneve || '').toUpperCase(),
    wardenName: '',
  }
}

/**
 * Életkor számítás születési-dátum + halálozási-dátum párból (csak év, magyar
 * konvenció szerint = "életének X. évében").
 */
function calculateAge(birthDate: string | null | undefined, deathDate: string | null | undefined): string {
  if (!birthDate || !deathDate) return ''
  try {
    const b = new Date(birthDate)
    const d = new Date(deathDate)
    if (isNaN(b.getTime()) || isNaN(d.getTime())) return ''
    let age = d.getFullYear() - b.getFullYear()
    const m = d.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
    return String(age)
  } catch { return '' }
}

/**
 * Temetés / Gyászjelentés → emléklap placeholder-adatok.
 *
 * Az entry.hdatum = halálozás dátuma, entry.tdatum = temetés dátuma.
 * entry.szemely = elhunyt személy adatai (csaladnev + k_nev + sz_datum).
 * entry.adrlocality?.name = temetés helye (ha rögzítve).
 */
function mapTemetes(entry: RegistryEntry, _opts: { congregationName: string }): Record<string, string> {
  const fullName = entry.szemely
    ? `${entry.szemely.csaladnev || ''} ${entry.szemely.k_nev || ''}`.trim().toUpperCase()
    : ''
  const age = calculateAge(entry.szemely?.sz_datum, entry.hdatum)
  const deathDate = formatHungarianDate(entry.hdatum) + (entry.hdatum ? '-án' : '')
  const funeralDate = entry.tdatum ? formatHungarianDate(entry.tdatum) + '-én' : ''
  const funeralPlace = entry.adrlocality?.name ? `a(z) ${entry.adrlocality.name} temetőjében.` : ''
  return {
    fullName,
    relativeRelation: '', // a család tölti ki ("édesapánk, nagyapánk és rokonunk")
    age,
    deathDate,
    funeralDate,
    funeralPlace,
    mourners: '', // a család tölti ki
    verseText: '', // a család vagy lelkész választja
    verseReference: '',
  }
}

/**
 * Univerzális dispatcher: RegistryEntry + tab → emléklap-placeholder-adatok.
 */
export function mapRegistryEntryToEmleklapData(
  entry: RegistryEntry,
  tab: RegistryTab,
  opts: { congregationName: string },
): Record<string, string> {
  if (tab === 'keresztseg') return mapKeresztseg(entry, opts)
  if (tab === 'konfirmalas') return mapKonfirmalas(entry, opts)
  if (tab === 'hazassag') return mapHazassag(entry, opts)
  if (tab === 'temetes') return mapTemetes(entry, opts)
  return {}
}
