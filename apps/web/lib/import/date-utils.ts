/**
 * Import dátum-normalizálás — időzóna-csúszás NÉLKÜL.
 *
 * **A javított hiba (2026-06-19):** a SheetJS `cellDates:true` a dátum-serial → `Date`
 * konverziónál apró (≈ pár másodperces) hibát ejt, ÉS pozitív időzóna-eltolásnál (pl.
 * Románia UTC+2/+3) az eredmény az ELŐZŐ naptári nap 23:59:xx-ére esik
 * (pl. a 2025-01-01 → `2024-12-31 23:59:36`). Ezért a korábbi „helyi komponens"-olvasás
 * (`getFullYear/getMonth/getDate`) is egy napot csúszott — a valós EREK Kassza-fülön
 * MIND az 563 dátum −1 napra (rossz év/hónap a befizetésen!). A felhőben (UTC) viszont
 * helyes volt, ezért nem bukott ki korábban — csak helyi gépen / asztali appban.
 *
 * **Megoldás:** mivel ezek dátum-cellák (idő nélkül), a Date-et a LEGKÖZELEBBI helyi naphoz
 * kerekítjük (`+12 óra`, majd helyi komponens). Ez minden időzónában (UTC és UTC+2/+3 is)
 * a helyes naptári napot adja — empirikusan igazolva: 563/563. Az Excel-serial számokat
 * továbbra is UTC-epoch-matekkal konvertáljuk (`excelSerialToLocalIso`), ami szintén helyes.
 *
 * A felhasználó kiemelt elvárása: „a dátumokat bármilyen formában is vezetik be, értelmezhető
 * legyen" — ezért a string-ág elfogad ISO-t, magyar (`2025.01.07`) és fordított magyar
 * (`07.01.2025`) formátumot is.
 */

/**
 * Excel dátum-cella (`Date`, SheetJS `cellDates:true`) → `'YYYY-MM-DD'`.
 *
 * A SheetJS pozitív időzónában az előző nap 23:59:xx-ére csúsztatja a dátum-serialt;
 * mivel idő nélküli NAPOT jelöl, a legközelebbi helyi naphoz kerekítünk (+12 óra).
 * Így UTC alatt is helyes marad (00:00 → +12 ó = aznap dél → aznap).
 */
export function dateToLocalIso(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null
  const rounded = new Date(d.getTime() + 12 * 60 * 60 * 1000)
  const y = rounded.getFullYear()
  const m = String(rounded.getMonth() + 1).padStart(2, '0')
  const day = String(rounded.getDate()).padStart(2, '0')
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
