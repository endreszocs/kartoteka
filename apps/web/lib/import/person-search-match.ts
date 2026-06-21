/**
 * Kézi tag-kereső — tiszta, ékezet- és pozíció-független illesztő logika.
 *
 * Endre kérése (2026-06-20): „Mindegy legyen mit írok, keressen" — bármilyen
 * névrész (vezeték-, kereszt-, LÁNYKORI és FÉRJEZETT név), foglalkozás VAGY
 * LAKCÍM alapján. Kulcs-eset: a lány férjhez ment, megváltozott a neve
 * (Beder Csilla Tímea → Kovács Csilla Tímea), de a „Beder Csilla Timea" keresés
 * (akár ékezet nélkül) is megtalálja a lánykori néven keresztül.
 *
 * Külön (nem `'use server'`) modul, hogy DB nélkül unit-tesztelhető legyen.
 */

/** Ékezet-független, kisbetűs normalizálás: „Tímea" == „Timea", „Kővári" == „Kovari". */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // kombináló ékezetek (az ő/ű is helyesen o/u lesz)
    .toLowerCase()
    .trim()
}

/** A keresőkifejezést normalizált tokenekre bontja (üreseket kiszűrve). */
export function tokenize(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean)
}

export interface SearchableFields {
  /** Név-mezők: csaladnev, k_nev, szcs_nev (lánykori), ferjk_nev (férjezett). */
  nameParts: Array<string | null | undefined>
  /** Cím/egyéb: utcanév, házszám, foglalkozás. */
  addressParts: Array<string | null | undefined>
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pontszám egy személyre a tokenekhez képest, vagy `null`, ha NEM találat.
 *
 * Szabály: MINDEN token szerepeljen valahol — a teljes néven VAGY a címen/foglalkozáson
 * (AND a tokenek között). A névtalálat többet ér a cím-találatnál; a szó-eleji egyezés bónusz.
 */
export function personSearchScore(
  fields: SearchableFields,
  tokens: string[],
): number | null {
  if (tokens.length === 0) return null
  const nameHay = normalizeForSearch(fields.nameParts.filter(Boolean).join(' '))
  const addrHay = normalizeForSearch(fields.addressParts.filter(Boolean).join(' '))
  const fullHay = `${nameHay} ${addrHay}`

  let score = 0
  for (const t of tokens) {
    const inName = nameHay.includes(t)
    if (!inName && !addrHay.includes(t)) return null
    score += inName ? 12 : 6
    if (new RegExp(`(^|\\s)${escapeRe(t)}`).test(fullHay)) score += 4
  }
  return score
}
