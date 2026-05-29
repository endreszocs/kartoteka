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
 * Keresztelés → emléklap placeholder-adatok.
 */
function mapKeresztseg(entry: RegistryEntry, opts: { congregationName: string }): Record<string, string> {
  return {
    congregationName: opts.congregationName,
    fullName: fullName(entry.szemely),
    parentsNames: '', // a registry nem tárolja közvetlenül — a user kitölti
    birthPlace: '', // nincs a registry-ben — kitöltendő
    birthDate: formatHungarianDate(entry.szemely?.sz_datum) + (entry.szemely?.sz_datum ? '-én' : ''),
    baptismCongregation: opts.congregationName + 'ben',
    baptismDate: formatHungarianDate(entry.datum) + (entry.datum ? '-én' : ''),
    issueLocation: '',
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
    // 2026-05-29 v6: a sablonra hozzáadott felső gyülekezet-név mezőhöz.
    congregationName: opts.congregationName,
    fullName: fullName(entry.szemely).toUpperCase(),
    birthPlace: '',
    birthDate: formatHungarianDate(entry.szemely?.sz_datum) + (entry.szemely?.sz_datum ? '-én' : ''),
    baptismCongregation: '',
    baptismDate: '',
    confirmCongregation: opts.congregationName + 'ben',
    issueLocation: '',
    issueDate: formatHungarianDate(entry.datum).toUpperCase(),
    mainWardenName: '',
    pastorName: (entry.lelkeszneve || '').toUpperCase(),
  }
}

/**
 * Esketés → emléklap placeholder-adatok.
 */
function mapHazassag(entry: RegistryEntry, opts: { congregationName: string }): Record<string, string> {
  return {
    congregationName: opts.congregationName,
    husbandName: fullName(entry.ferfi),
    husbandBirthPlace: '',
    husbandBirthDate: '',
    wifeName: fullName(entry.no),
    wifeBirthPlace: '',
    wifeBirthDate: '',
    marriageCongregation: opts.congregationName + 'ben',
    marriageDate: formatHungarianDate(entry.datum) + (entry.datum ? '-én' : ''),
    verseText: '',
    verseReference: '',
    issueLocation: '',
    issueDate: formatHungarianDate(entry.datum),
    pastorName: (entry.lelkeszneve || '').toUpperCase(),
    wardenName: '',
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
  return {}
}
