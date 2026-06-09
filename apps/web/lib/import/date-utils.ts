/**
 * Import dátum-normalizálás — időzóna-csúszás NÉLKÜL.
 *
 * **A javított hiba (2026-06-09):** a korábbi parserek `Date.toISOString().slice(0,10)`-et
 * használtak, ami UTC-re konvertál. A SheetJS `cellDates:true` Date-objektumai HELYI időben
 * vannak; egy helyi éjfél-közeli dátum UTC-ben ±1 napot csúszhat (pl. Románia GMT+2/+3-ban
 * egy `00:30` helyi dátum az előző naptári napra esik UTC-ben). A pénzügyi importnál ez
 * elfogadhatatlan (rossz év/hónap a befizetésen).
 *
 * Megoldás: a Date-objektumokból HELYI naptári komponenseket olvasunk
 * (`getFullYear/getMonth/getDate`), az Excel-serial számokat pedig UTC-epoch-matekkal
 * konvertáljuk (ahol nincs időzóna), így mindkét ág stabil.
 *
 * A felhasználó kiemelt elvárása: „a dátumokat bármilyen formában is vezetik be, értelmezhető
 * legyen" — ezért a string-ág elfogad ISO-t, magyar (`2025.01.07`) és fordított magyar
 * (`07.01.2025`) formátumot is.
 */

/** `Date` → `'YYYY-MM-DD'` HELYI naptári komponensekből (nincs UTC-eltolás). */
export function dateToLocalIso(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Excel dátum-serial szám → `'YYYY-MM-DD'`. Időzóna-független: a serial egy naptári napot
 * jelöl, ezért UTC-epoch-matekkal számolunk és UTC-komponenst olvasunk vissza.
 * Epoch: 1900-01-01, az Excel hibás 1900-02-29-e miatt -2 nappal korrigálva.
 */
export function excelSerialToLocalIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const epochMs = Date.UTC(1900, 0, 1) - 2 * 24 * 60 * 60 * 1000
  const ms = epochMs + Math.round(serial) * 24 * 60 * 60 * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Univerzális dátum → `'YYYY-MM-DD'` (vagy null). Kezeli:
 *  - `Date` objektum (SheetJS cellDates) → helyi komponens
 *  - Excel-serial szám → UTC-epoch
 *  - ISO string: `2025-01-07`, `2025-01-07T…`
 *  - Magyar: `2025.01.07`, `2025.01.07.`, `2025/01/07`, `2025. 01. 07.`
 *  - Fordított magyar: `07.01.2025`, `07/01/2025`
 *  - Végső próba: `new Date(str)` → HELYI komponens (nem UTC)
 */
export function toLocalIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return dateToLocalIso(value)
  if (typeof value === 'number') return excelSerialToLocalIso(value)
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // ISO: 2025-01-07 (esetleg idő-résszel)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Magyar: 2025.01.07 / 2025.01.07. / 2025/01/07 / 2025. 01. 07.
  const huMatch = trimmed.match(/^(\d{4})[.\s/]+\s*(\d{1,2})[.\s/]+\s*(\d{1,2})/)
  if (huMatch) {
    const [, y, m, d] = huMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Fordított magyar: 07.01.2025 / 07/01/2025
  const huRevMatch = trimmed.match(/^(\d{1,2})[.\s/]+\s*(\d{1,2})[.\s/]+\s*(\d{4})/)
  if (huRevMatch) {
    const [, d, m, y] = huRevMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Végső próba: natív parse, HELYI komponensből olvasva
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) return dateToLocalIso(parsed)

  return null
}
