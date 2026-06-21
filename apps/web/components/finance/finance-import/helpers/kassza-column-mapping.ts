/**
 * Kassza/bank-lap OSZLOP-EGYEZTETÉS — fejléc-alapú, automatikus, de ELLENŐRIZHETŐ.
 *
 * 2026-06-19 (FÁZIS 2) — multigyülekezetes biztonság. A hivatalos EREK könyvelési
 * sablon fejlécei alapján rendeljük a fájl oszlopait a cél-mezőkhöz. EZ AZ EGYETLEN
 * FORRÁS: a parser (`kasszaRowToRecord`) ÉS az ellenőrző UI is ezt használja, így
 * amit a felhasználó lát, az pontosan az, amivel a beolvasás dolgozik → más
 * gyülekezet eltérő elrendezésénél sem dolgozunk vakon rossz oszloppal.
 */

export type KasszaFieldKey =
  | 'datum'
  | 'iratszam'
  | 'irattipus'
  | 'nev'
  | 'bevOsszeg'
  | 'bevCel'
  | 'kiaOsszeg'
  | 'kiaCel'
  | 'megjegyzes'
  | 'kod'

export interface KasszaFieldDef {
  key: KasszaFieldKey
  /** Emberbarát címke az ellenőrző UI-hoz. */
  label: string
  /** Kötelező-e az importhoz (ha hiányzik → figyelmeztetés/blokk). */
  required: boolean
  /** Fejléc-szinonimák (a hivatalos sablon + gyakori variánsok). */
  synonyms: string[]
}

/** A cél-mezők + szinonimáik (a sor4 hivatalos fejlécből + tűrés). */
export const KASSZA_FIELDS: KasszaFieldDef[] = [
  { key: 'datum', label: 'Dátum', required: true, synonyms: ['Dátum', 'Datum', 'datum'] },
  { key: 'iratszam', label: 'Iratszám (sorszám)', required: false, synonyms: ['Iratszám', 'Iratszam', 'iratszam'] },
  { key: 'irattipus', label: 'Irattípus', required: false, synonyms: ['Irattip.', 'Irattípus', 'irattipus', 'Irattip'] },
  { key: 'nev', label: 'Név / Forrás', required: true, synonyms: ['Név', 'Nev', 'Forrás', 'Befizető'] },
  { key: 'bevOsszeg', label: 'Bevétel – Összeg', required: true, synonyms: ['Bev. - Összeg', 'Bevétel - Összeg', 'Bevétel'] },
  { key: 'bevCel', label: 'Bevétel – Költségvetési név', required: false, synonyms: ['Bevétel - Költ.vet. név', 'Bevétel - Költvet. név', ' Bevétel - Költ.vet. név', 'Bev cél'] },
  { key: 'kiaOsszeg', label: 'Kiadás – Összeg', required: true, synonyms: ['Kiad. - Összeg', 'Kiadás - Összeg', 'Kiadás'] },
  { key: 'kiaCel', label: 'Kiadás – Költségvetési név', required: false, synonyms: ['Kiadás - költ.vet. név', ' Kiadás - költ.vet. név', 'Kiad cél'] },
  { key: 'megjegyzes', label: 'Megjegyzés', required: false, synonyms: ['Megjegyzés', 'Megjegyzes'] },
  { key: 'kod', label: 'Költségvetési kód', required: true, synonyms: ['Költségvetési szám', 'szám', 'Költs. szám', 'KöltsSzám'] },
]

export interface KasszaColumnDetection {
  /** mező-kulcs → a felismert fejléc-szöveg (vagy null, ha nincs). */
  mapping: Record<KasszaFieldKey, string | null>
  /** A nem-felismert KÖTELEZŐ mezők (ha nem üres → figyelmeztetés/blokk). */
  missingRequired: KasszaFieldKey[]
}

/** Fejléc-normalizálás az egyezéshez: kisbetű, szóköz-eltávolítás. */
function normHeader(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, '')
}

/**
 * A fájl fejlécei alapján felismeri az oszlop→mező párosítást. Determinisztikus,
 * az első illeszkedő szinonima nyer.
 */
export function detectKasszaColumns(headers: string[]): KasszaColumnDetection {
  const normalized = headers.map((h) => ({ raw: h, norm: normHeader(h) }))
  const mapping = {} as Record<KasszaFieldKey, string | null>
  const missingRequired: KasszaFieldKey[] = []

  for (const field of KASSZA_FIELDS) {
    let found: string | null = null
    for (const syn of field.synonyms) {
      const synNorm = normHeader(syn)
      const hit = normalized.find((h) => h.norm === synNorm)
      if (hit) {
        found = hit.raw
        break
      }
    }
    mapping[field.key] = found
    if (!found && field.required) missingRequired.push(field.key)
  }

  return { mapping, missingRequired }
}
