/**
 * Pénzügyi tábla-export letöltése `.xlsx`-ként (SheetJS).
 *
 * A megosztott `buildFinanceExportAoa` (ui-app) állítja elő a hivatalos
 * oszloprendű kétdimenziós tömböt; ez a web-oldali segéd csak Workbook-ká
 * alakítja és letölti. Az eredmény visszaimportálható az `Adatok_2025.xlsx`
 * sémájába (azonos fejléc).
 */

import * as XLSX from 'xlsx'

export function exportAoaToXlsx(
  aoa: (string | number)[][],
  filename: string,
  sheetName = 'Adatok',
): void {
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Oszlopszélességek a hivatalos elrendezéshez (olvashatóbb fájl).
  ws['!cols'] = [
    { wch: 12 }, // Dátum
    { wch: 10 }, // Iratszám
    { wch: 9 }, // Irattip.
    { wch: 28 }, // Név
    { wch: 13 }, // Bev. Összeg
    { wch: 26 }, // Bevétel költségvetési név
    { wch: 13 }, // Kiad. Összeg
    { wch: 26 }, // Kiadás költségvetési név
    { wch: 34 }, // Megjegyzés
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}
