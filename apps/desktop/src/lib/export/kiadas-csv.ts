/**
 * kiadas-csv — CSV export a kiadás-listához (A-M7.4d, 2026-04-24).
 *
 * A `befizetes-csv.ts` tükörképe a `kiadas` lista adatmodelljével.
 * Ugyanaz a pattern: UTF-8 BOM, `;`-elválasztó, CRLF sorvég, RFC 4180 escape.
 */

import type { KiadasListRow } from '@kartoteka/validations'

function escapeCsvValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.length === 0) return ''
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowToCsv(values: Array<string | number | null | undefined>): string {
  return values.map(escapeCsvValue).join(';')
}

export function buildKiadasCsv(rows: KiadasListRow[]): string {
  const header = [
    'Dátum',
    'Iratszám',
    'Típus',
    'Átvevő (tag)',
    'Átvevő (név)',
    'CUI',
    'Kategória',
    'Összeg (RON)',
    'Vonatkozó időszak',
    'Sztornó',
    'Sztornó indoklás',
    'Megjegyzés',
  ]
  const lines: string[] = [rowToCsv(header)]

  for (const r of rows) {
    lines.push(
      rowToCsv([
        r.datum.slice(0, 10), // ISO timestamp → YYYY-MM-DD
        r.iratszam,
        r.irattipus,
        r.atvevo_nev ?? '',
        r.atvevo ?? '',
        r.kedvezmenyezett_cui ?? '',
        r.kiadascel_nev ?? '',
        r.osszeg,
        r.vonatkozo_idoszak ?? '',
        r.stornozott ? 'igen' : 'nem',
        r.stornozott_indok ?? '',
        r.megjegyzes ?? '',
      ]),
    )
  }

  return lines.join('\r\n')
}

export function downloadKiadasCsv(csv: string, filename: string): void {
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
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function buildKiadasCsvFilename(year: number, filtersActive: boolean): string {
  const suffix = filtersActive ? '-szurt' : ''
  return `kiadasok-${year}${suffix}.csv`
}
