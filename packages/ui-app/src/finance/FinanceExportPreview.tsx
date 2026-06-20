'use client'

/**
 * Export-előnézet overlay — a táblák „Export (Excel)" gombja ezt nyitja meg
 * (NEM tölt le egyből). Megmutatja a hivatalos Adatok_2025 oszloprendet, egy
 * rövid magyarázatot, és a sorok TELJES listáját (görgethető); a letöltés és a
 * nyomtatás külön gombbal indul.
 *
 * Saját, könnyű overlay (nincs shadcn-függőség) — web és desktop egyaránt.
 */

import { Download, FileSpreadsheet, Printer, X } from 'lucide-react'

export interface FinanceExportPreviewProps {
  aoa: (string | number)[][]
  filename: string
  onClose: () => void
  onDownload: (aoa: (string | number)[][], filename: string) => void
}

function escHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function FinanceExportPreview({
  aoa,
  filename,
  onClose,
  onDownload,
}: FinanceExportPreviewProps) {
  const headers = (aoa[0] || []) as (string | number)[]
  const body = aoa.slice(1)

  function handlePrint() {
    if (typeof window === 'undefined') return
    const title = filename.replace(/\.xlsx$/i, '')
    const headHtml = `<tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr>`
    const bodyHtml = body
      .map(
        (row) =>
          `<tr>${headers
            .map((_, ci) => `<td>${escHtml((row as (string | number)[])[ci] ?? '')}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"/>
      <title>${escHtml(title)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: Arial, "Segoe UI", sans-serif; color: #14213d; margin: 0; }
        h1 { font-size: 14px; margin: 0 0 2px; }
        .meta { font-size: 10px; color: #475569; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
        thead { display: table-header-group; }
        th, td { border: 1px solid #94a3b8; padding: 3px 5px; text-align: left; vertical-align: top; }
        th { background: #e2e8f0; font-weight: bold; }
        tbody tr:nth-child(even) td { background: #f1f5f9; }
      </style></head>
      <body>
        <h1>${escHtml(title)}</h1>
        <div class="meta">Hivatalos oszloprend (Adatok_2025) · ${body.length} tétel</div>
        <table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
      </body></html>`

    const win = window.open('', '_blank', 'width=1100,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.onafterprint = () => {
      try {
        win.close()
      } catch {
        /* a felhasználó már bezárta */
      }
    }
    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        /* megszakítva */
      }
    }, 350)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fejléc */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="size-4" />
            </span>
            <div>
              <h3 className="font-heading text-base text-slate-800">Export előnézet</h3>
              <p className="text-[11px] text-slate-500">{filename}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Bezárás"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Magyarázat */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-relaxed text-slate-600">
          Ez az export a hivatalos <strong>Adatok_2025.xlsx</strong> oszloprendjét követi
          (Dátum · Iratszám · Irattíp. · Név · Bevétel összeg/jogcím · Kiadás összeg/jogcím ·
          Megjegyzés), ezért később <strong>vissza is importálható</strong>. Az előnézet a
          jelenlegi <strong>(szűrt) {body.length} sort</strong> teljes egészében mutatja — letöltheted
          Excelbe vagy kinyomtathatod.
        </div>

        {/* Táblázat-előnézet — TELJES lista, görgethető */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-white">
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap"
                  >
                    {String(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="even:bg-slate-50/60">
                  {headers.map((_, ci) => (
                    <td
                      key={ci}
                      className="border-b border-slate-100 px-2 py-1 text-slate-700 align-top"
                    >
                      {String((row as (string | number)[])[ci] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {body.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Nincs exportálható sor.</p>
          )}
        </div>

        {/* Lábléc — gombok */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Mégse
          </button>
          <button
            type="button"
            disabled={body.length === 0}
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="size-4" />
            Nyomtatás
          </button>
          <button
            type="button"
            disabled={body.length === 0}
            onClick={() => {
              onDownload(aoa, filename)
              onClose()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="size-4" />
            Letöltés (Excel)
          </button>
        </div>
      </div>
    </div>
  )
}
