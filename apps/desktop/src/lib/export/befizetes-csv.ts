/**
 * befizetes-csv — CSV-export helper a befizetés-listához (A-M7.3d5, 2026-04-24).
 *
 * Miért CSV és nem XLSX?
 *   - Zero dependency: nincs szükség exceljs vagy xlsx library-re a desktop bundle-ban
 *   - Excel megnyitja natívan (UTF-8 BOM-mal a magyar ékezetek helyesek)
 *   - A lelkészek tipikusan Excel-t használnak → import a náluk is megy
 *   - Könnyebben auditálható, text-es formátum
 *
 * Az XLSX-export egy jövőbeli iterációban (A-M10, `@kartoteka/excel`) fog bejönni,
 * amikor a `@kartoteka/storage` is kész és egységes a fájl-kezelés mindkét
 * platformon. Addig a CSV bőven elég.
 *
 * Mentés: browser `Blob` + `URL.createObjectURL` + `<a download>` trükk —
 * a Tauri WebView támogatja, a user a böngésző-szintű „Mentés másként"
 * dialógust kap. Későbbi A-M10-ben a Tauri-plugin-dialog-gal szebb lesz.
 */

import type { BefizetesListRow } from '@kartoteka/validations'

/**
 * RFC 4180 + Excel-kompat szerint escape-eli az értéket:
 *   - Ha tartalmaz `"`, `,`, `;`, `\n` vagy `\r`: idézőjelbe csomagolva
 *   - `"` önmagában `""`-re duplázva
 */
function escapeCsvValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.length === 0) return ''
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Egy sor CSV-ként — a helyi `;` elválasztó (EU Excel konvenció),
 * UTF-8-ban a magyar ékezetek működnek.
 */
function rowToCsv(values: Array<string | number | null | undefined>): string {
  return values.map(escapeCsvValue).join(';')
}

/**
 * A befizetés-lista → CSV-string. Az első sor a fejléc.
 *
 * Oszlopok (a user-facing mezők):
 *   - Dátum
 *   - Iratszám
 *   - Típus (Készpénz / Banki)
 *   - Tag
 *   - Kategória
 *   - Családi (igen / nem)
 *   - Összeg (RON)
 *   - Fizetett év
 *   - Sztornózott (igen / nem + indok)
 *   - Megjegyzés
 */
export function buildBefizetesCsv(rows: BefizetesListRow[]): string {
  const header = [
    'Dátum',
    'Iratszám',
    'Típus',
    'Tag',
    'Kategória',
    'Család-szintű',
    'Összeg (RON)',
    'Fizetett év',
    'Sztornó',
    'Sztornó indoklás',
    'Megjegyzés',
  ]
  const lines: string[] = [rowToCsv(header)]

  for (const r of rows) {
    lines.push(
      rowToCsv([
        r.datum,
        r.iratszam,
        r.irattipus,
        r.szemely_nev ?? '',
        r.befizetescel_nev ?? '',
        r.csalad ? 'igen' : 'nem',
        r.osszeg,
        r.fizetettev,
        r.stornozott ? 'igen' : 'nem',
        r.stornozott_indok ?? '',
        r.megjegyzes ?? '',
      ]),
    )
  }

  return lines.join('\r\n') // CRLF — Excel-kompat
}

/**
 * Indítja a böngésző letöltését a megadott CSV-sztringgel.
 *
 * UTF-8 BOM (`\uFEFF`) elől — anélkül az Excel a magyar ékezeteket
 * „Ã¡"-ként olvassa.
 *
 * @param csv A CSV-tartalom
 * @param filename A javasolt fájlnév (pl. „befizetesek-2026.csv")
 */
export function downloadCsv(csv: string, filename: string): void {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // A revoke késleltetett — a browser-nek idő kell hogy elindítsa a download-ot
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Fájlnév-építő a szűrők alapján. Példa:
 *   - befizetesek-2026.csv (teljes év)
 *   - befizetesek-2026-szurt.csv (szűrt nézet)
 */
export function buildBefizetesCsvFilename(
  year: number,
  filtersActive: boolean,
): string {
  const suffix = filtersActive ? '-szurt' : ''
  return `befizetesek-${year}${suffix}.csv`
}
