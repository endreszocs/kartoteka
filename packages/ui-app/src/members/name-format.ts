/**
 * Kanonikus név-formázás előtagokkal (2026-08-01, PR-19) — KÖZÖS web+desktop.
 *
 * A szemely.namepattern mező szemantikája: CSAK ELŐTAG ("id.", "ifj.", "Dr.",
 * "özv."). A legacy import korábban teljes nevet írt bele (15 karakterre
 * csonkolva) — a 2026-04-26-os cleanup a nem előtag-szerűeket nullázta, de
 * újra bekerülhetnek, ezért MINDEN megjelenítés előtt az isPrefixLikeNamepattern
 * guard dönt. Az "özv."/"elv." előtag az `allapot` mezőből számítódik.
 *
 * ⛔ TILOS a `namepattern || nev` minta — az előtagot teljes névként mutatná
 * ("ifj." név nélkül). Ez volt a születésnapos lista 2026-08-01-es hibája.
 */

export interface NameWithPrefixInput {
  csaladnev: string | null
  k_nev: string | null
  namepattern?: string | null
  allapot?: string | null
}

/**
 * Detektálja, hogy egy `namepattern` érték TÉNYLEG PREFIX-szerű-e
 * ("id.", "ifj.", "Dr.", "özv." — max 6 karakter, ponttal végződik,
 * nincs benne szóköz). Teljes név / hosszabb szöveg → false.
 */
export function isPrefixLikeNamepattern(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 6) return false
  if (!trimmed.endsWith('.')) return false
  if (/\s/.test(trimmed)) return false
  return true
}

/** "Özvegy" detektálás — kezeli az "özvegy", "Özv.", "özv.", "ozv" formákat. */
export function isOzvegyAllapot(allapot: string | null | undefined): boolean {
  if (!allapot) return false
  const norm = allapot.trim().toLowerCase().replace(/\.$/, '')
  return norm === 'özvegy' || norm === 'özv' || norm === 'ozvegy' || norm === 'ozv'
}

/**
 * Teljes megjelenítendő név: [elv.] [özv.] [namepattern] Családnév Keresztnév.
 * Üres név esetén '(névtelen)' — SOHA nem ad vissza csupasz előtagot.
 */
export function formatNameWithPrefix(
  member: NameWithPrefixInput | null | undefined,
  spouseDeceased?: boolean,
): string {
  if (!member) return '-'
  const prefixes: string[] = []

  if (member.allapot === 'elvált') prefixes.push('elv.')

  let isOzvegy = isOzvegyAllapot(member.allapot)
  if (!isOzvegy && spouseDeceased) isOzvegy = true
  if (isOzvegy) prefixes.push('özv.')

  // A namepattern-t CSAK akkor használjuk prefixként, ha tényleg PREFIX-SZERŰ.
  if (isPrefixLikeNamepattern(member.namepattern)) {
    const np = member.namepattern!.trim()
    // Az allapot-ból már hozzáadott özv.-t ne duplázzuk
    if (!prefixes.some((p) => p.toLowerCase() === np.toLowerCase())) prefixes.push(np)
  }

  const baseName = `${member.csaladnev || ''} ${member.k_nev || ''}`.trim()
  // 2026-08-01 (PR-19): üres név mellett SOHA nem áll magában az előtag —
  // ez adta a „ifj. ♂" sorokat a születésnapos listán.
  if (!baseName) return '(névtelen)'

  const prefix = prefixes.length > 0 ? prefixes.join(' ') + ' ' : ''
  return `${prefix}${baseName}`
}
