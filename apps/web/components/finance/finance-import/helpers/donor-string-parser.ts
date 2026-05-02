/**
 * Donor-string parser a Kassza/XML "Forrása" / "Név" oszlopra.
 *
 * A magyar lelkészi adminisztrációban a befizető szöveges azonosítója egy
 * sajátos "név - cím" kombináció, pl.:
 *   - "Beder Győzőné Elvira - Főút 27"            (asszony férjes nevén)
 *   - "Özv. Beder Árpádné Gizella - Főút 85"     (özvegy + férjes név)
 *   - "Özv. Beder Béláné Finta Vilma - Horvátok 150" (lánykori név is)
 *   - "Szőcs Endre - Parókia 214"                 (egyszerű férfinév)
 *   - "Elv. Finta Gábor - Horvátok 152"           (elvált prefix)
 *   - "Bartha Józsefné Irén - ? 0"                 (üres/ismeretlen cím)
 *   - "Bajkó Szende"                              (cím nélküli)
 *   - "INTERNATIONAL PAPER BUSINESS SRL"          (cég → ne parsolja)
 *
 * Ez a parser ezeket struktúrált adattá bontja, hogy a quad-lookup
 * megtalálja a tagnyilvántartásban.
 *
 * 2026-05-02 (Fázis 2): teljes algoritmus, valós EREK 2025 adatokra kalibrálva.
 */

import { detectCompany } from './company-detector'

export interface DonorParseResult {
  /** A teljes input, változatlan (trim-elve) */
  raw: string
  /** Ha igaz, ne próbáljuk személynek nézni */
  isCompany: boolean
  /** "Özv." / "Elv." / "id." / "ifj." / "Dr." (max 6 char + pont), ha van */
  prefix: string | null
  /** Saját családnév férfi vagy lány-leány esetén; női férjes esetén null */
  csaladnev: string | null
  /** Keresztnév (vagy női férjes esetén a saját keresztnév) */
  k_nev: string | null
  /** Női férjes esetén a férj családneve (pl. "Beder") */
  husbandFamilyName: string | null
  /** Női férjes esetén a teljes férjes-név (pl. "Beder Győzőné") */
  husbandName: string | null
  /** Női férjes esetén a lánykori családnév, ha jelölve van */
  szcs_nev: string | null
  /** Utca neve toldalék nélkül (pl. "Főút") */
  street: string | null
  /** Házszám (pl. "27", "27/A", "85bis", "?") */
  houseNumber: string | null
  /** Konfidencia: high (név + cím egyértelmű) / medium (cím nélkül vagy hiányos) / low */
  parseConfidence: 'high' | 'medium' | 'low'
}

const PREFIX_PATTERN = /^(Özv\.|Elv\.|Dr\.|id\.|ifj\.|Br\.|Gr\.)\s+/i

/**
 * Egy egész token "né"-re végződik-e? (Pl. "Győzőné", "Béláné", "Józsefné".)
 *
 * Nem `\b` szóhatárt használunk, mert az ASCII-csak — a magyar `é`, `ő` után
 * nem ismer szóhatárt, és így a regex hibázik. Helyette a token végét
 * vizsgáljuk: a token utolsó 2 karakter `né` legyen, és a token nagybetűvel
 * kezdődjön (különben pl. "öné" típusú technikai szövegek hamisan illeszkednének).
 */
function isFerjesToken(token: string): boolean {
  if (!token) return false
  if (token.length < 4) return false
  if (!/^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(token)) return false
  return /né$/i.test(token)
}

/**
 * Üres parse-eredmény, ha nem-stringet kapunk vagy üres az input.
 */
function emptyResult(raw: string): DonorParseResult {
  return {
    raw,
    isCompany: false,
    prefix: null,
    csaladnev: null,
    k_nev: null,
    husbandFamilyName: null,
    husbandName: null,
    szcs_nev: null,
    street: null,
    houseNumber: null,
    parseConfidence: 'low',
  }
}

/**
 * A donor-string struktúrált értelmezése.
 *
 * Algoritmus:
 *   1. Cég-flag (`detectCompany`) — azonnali kilépés
 *   2. Splitelés " - ", " – ", " — " separator-okkal
 *   3. Cím-rész utolsó tokene házszám, többi utca
 *   4. Név-rész:
 *      a. Prefix-detekció (Özv./Elv./id./ifj./Dr./Br./Gr.)
 *      b. "né"-suffix detekció a tokenekben → női férjes-név
 *         - "Beder Győzőné Elvira"             → husbandFamilyName=Beder, husbandName="Beder Győzőné", k_nev="Elvira"
 *         - "Beder Béláné Finta Vilma"         → husbandFamilyName=Beder, husbandName="Beder Béláné", szcs_nev=Finta, k_nev=Vilma
 *      c. Egyébként: első token = csaladnev, többi = k_nev
 *   5. Confidence kalkulálás
 */
export function parseDonorString(input: string | null | undefined): DonorParseResult {
  if (input === null || input === undefined) return emptyResult('')
  const raw = String(input).trim()
  if (raw.length === 0) return emptyResult('')

  // 1. Cég-flag — azonnal megáll
  if (detectCompany(raw)) {
    return {
      ...emptyResult(raw),
      isCompany: true,
      parseConfidence: 'high',
    }
  }

  // 2. Splitelés " - " / " – " / " — " separator-okkal
  const SEPARATOR = /\s+[-–—]\s+/
  const parts = raw.split(SEPARATOR)

  let namePart = parts[0]?.trim() || ''
  const addressPart = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null

  // 3. Cím-rész feldolgozása
  let street: string | null = null
  let houseNumber: string | null = null
  if (addressPart) {
    // Az utolsó token a házszám (lehet "27", "27/A", "85bis", "?")
    const addressTokens = addressPart.split(/\s+/)
    if (addressTokens.length >= 2) {
      houseNumber = addressTokens[addressTokens.length - 1]
      street = addressTokens.slice(0, -1).join(' ')
    } else if (addressTokens.length === 1) {
      // Csak egy token → vagy utca csak, vagy csak szám
      if (/^\d/.test(addressTokens[0])) {
        houseNumber = addressTokens[0]
      } else {
        street = addressTokens[0]
      }
    }

    // "?" és "0" mint házszám érvénytelen, de jelöljük
    if (houseNumber === '?' || houseNumber === '0') {
      // megtartjuk a sztringes formában, a quad-lookup nem használja
    }
  }

  // 4. Név-rész feldolgozása
  let prefix: string | null = null
  let csaladnev: string | null = null
  let k_nev: string | null = null
  let husbandFamilyName: string | null = null
  let husbandName: string | null = null
  let szcs_nev: string | null = null

  // 4a. Prefix-detekció
  const prefixMatch = namePart.match(PREFIX_PATTERN)
  if (prefixMatch) {
    prefix = normalizePrefix(prefixMatch[1])
    namePart = namePart.slice(prefixMatch[0].length).trim()
  }

  const tokens = namePart.split(/\s+/).filter((t) => t.length > 0)

  if (tokens.length === 0) {
    // Csak prefix vagy üres név (pl. "Özv.")
    return {
      raw,
      isCompany: false,
      prefix,
      csaladnev: null,
      k_nev: null,
      husbandFamilyName: null,
      husbandName: null,
      szcs_nev: null,
      street,
      houseNumber,
      parseConfidence: 'low',
    }
  }

  // 4b. "né"-suffix detekció (női férjes-név)
  let ferjesIdx = -1
  for (let i = 0; i < tokens.length; i++) {
    if (isFerjesToken(tokens[i])) {
      ferjesIdx = i
      break
    }
  }

  if (ferjesIdx >= 1) {
    // "Beder Győzőné Elvira" → ferjesIdx=1
    //   - tokens[0] = "Beder"               → husbandFamilyName
    //   - tokens[0..1] = "Beder Győzőné"    → husbandName (férjes-név)
    //   - tokens[2..] = "Elvira"            → k_nev
    husbandFamilyName = tokens[0]
    husbandName = tokens.slice(0, ferjesIdx + 1).join(' ')

    // 4c. Lánykori név detektálás
    // "Beder Béláné Finta Vilma" → tokens=[Beder, Béláné, Finta, Vilma], ferjesIdx=1
    //   - tokens[0]   = Beder    → husbandFamilyName
    //   - tokens[0..1] = "Beder Béláné" → husbandName
    //   - tokens[2]   = Finta    → szcs_nev (lánykori családnév)
    //   - tokens[3..] = Vilma    → k_nev
    const tail = tokens.slice(ferjesIdx + 1)
    if (
      tail.length >= 2 &&
      isLikelyFamilyName(tail[0]) &&
      isLikelyGivenName(tail.slice(1).join(' '))
    ) {
      szcs_nev = tail[0]
      k_nev = tail.slice(1).join(' ')
    } else if (tail.length >= 1) {
      k_nev = tail.join(' ')
    }
    // csaladnev marad null — a férjes asszonynak nincs saját családneve a Kasszában
  } else {
    // 4d. Egyszerű férfi/leányneves eset:
    //   - tokens[0] = csaladnev
    //   - tokens[1..] = k_nev (lehet összetett: "Mária Magdolna", "Sándor Barna")
    if (tokens.length === 1) {
      // Csak egy szó — bizonytalan, nézhetjük családnévnek vagy keresztnévnek
      // A legtöbb esetben magánszemélynek családnév önmagában nincs értelmes,
      // ezért k_nev-be tesszük (low confidence).
      k_nev = tokens[0]
    } else {
      csaladnev = tokens[0]
      k_nev = tokens.slice(1).join(' ')
    }
  }

  // 5. Confidence kalkulálás
  let parseConfidence: 'high' | 'medium' | 'low'
  const hasName = !!(csaladnev || husbandFamilyName || k_nev)
  const hasAddress = !!(street && houseNumber && houseNumber !== '?' && houseNumber !== '0')
  if (hasName && hasAddress) {
    parseConfidence = 'high'
  } else if (hasName) {
    parseConfidence = 'medium'
  } else {
    parseConfidence = 'low'
  }

  return {
    raw,
    isCompany: false,
    prefix,
    csaladnev,
    k_nev,
    husbandFamilyName,
    husbandName,
    szcs_nev,
    street,
    houseNumber,
    parseConfidence,
  }
}

/**
 * Prefix normalizálás: "ÖZV." → "Özv.", "elv." → "Elv.", stb.
 */
function normalizePrefix(raw: string): string {
  const lower = raw.toLowerCase()
  // Az első betű nagybetű
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Igaz, ha a token valószínűleg családnév (nagybetűs első betű, max 1-2 szó).
 */
function isLikelyFamilyName(token: string): boolean {
  if (!token) return false
  return /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(token)
}

/**
 * Igaz, ha a string valószínűleg keresztnév (nagybetűs első betű).
 */
function isLikelyGivenName(s: string): boolean {
  if (!s) return false
  return /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(s)
}

/* ───────────────────────────────────────────────────────────────────────
 * @testdata — manuális smoke test (Fázis 2)
 *
 * Tipikus esetek:
 *   parseDonorString('Beder Győzőné Elvira - Főút 27')
 *     → husbandFamilyName: 'Beder', husbandName: 'Beder Győzőné',
 *       k_nev: 'Elvira', street: 'Főút', houseNumber: '27', confidence: 'high'
 *
 *   parseDonorString('Özv. Beder Árpádné Gizella - Főút 85')
 *     → prefix: 'Özv.', husbandFamilyName: 'Beder', husbandName: 'Beder Árpádné',
 *       k_nev: 'Gizella', street: 'Főút', houseNumber: '85', confidence: 'high'
 *
 *   parseDonorString('Özv. Beder Béláné Finta Vilma - Horvátok 150')
 *     → prefix: 'Özv.', husbandFamilyName: 'Beder', husbandName: 'Beder Béláné',
 *       szcs_nev: 'Finta', k_nev: 'Vilma', street: 'Horvátok', houseNumber: '150'
 *
 *   parseDonorString('Szőcs Endre - Parókia 214')
 *     → csaladnev: 'Szőcs', k_nev: 'Endre', street: 'Parókia', houseNumber: '214'
 *
 *   parseDonorString('Elv. Finta Gábor - Horvátok 152')
 *     → prefix: 'Elv.', csaladnev: 'Finta', k_nev: 'Gábor', street: 'Horvátok'
 *
 *   parseDonorString('Bajkó Szende')
 *     → csaladnev: 'Bajkó', k_nev: 'Szende', address: null, confidence: 'medium'
 *
 *   parseDonorString('INTERNATIONAL PAPER BUSINESS SRL')
 *     → isCompany: true
 *
 *   parseDonorString('Bóné Sándor Barna - Templom 4')
 *     → csaladnev: 'Bóné', k_nev: 'Sándor Barna' (összetett keresztnév)
 *
 *   parseDonorString('Bartha Józsefné Irén - ? 0')
 *     → husbandFamilyName: 'Bartha', husbandName: 'Bartha Józsefné',
 *       k_nev: 'Irén', street: '?', houseNumber: '0', confidence: 'medium'
 * ─────────────────────────────────────────────────────────────────────── */
