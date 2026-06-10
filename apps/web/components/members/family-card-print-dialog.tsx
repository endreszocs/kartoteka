'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getFamilyCardPrintData } from '@/app/(dashboard)/tagnyilvantartas/family-actions'

/**
 * 2026-06-10 — Nyomtatható CSALÁDI KARTON (lefűzhető A4 lap).
 *
 * Tartalma:
 *   - fejléc: család neve, gyülekezet, lakcím, körzet
 *   - tagok táblázata relációkkal (Családfő / Házastárs / gyermekek),
 *     anyakönyvi dátumokkal (születés, keresztelés, konfirmáció)
 *   - házasságkötés sora
 *   - tag-megjegyzések (ha vannak — a személyi kartonról)
 *   - OPCIONÁLISAN: az utolsó 5 év befizetései + családlátogatások
 *
 * Minta: voter-print-dialog — bal oldalt opciók, jobb oldalt élő iframe
 * előnézet, nyomtatás az iframe-ből (így a képernyő-UI nem kerül papírra).
 */

type PrintData = Awaited<ReturnType<typeof getFamilyCardPrintData>>

interface FamilyCardPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('hu-HU')
}

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildCardHtml(data: NonNullable<PrintData>, opts: { payments: boolean; visits: boolean }): string {
  const personRow = (p: NonNullable<PrintData>['adults'][number]) => `
    <tr>
      <td class="role">${esc(p.szerep)}</td>
      <td class="name">${esc(p.nev)}${p.meghalt ? ' <span class="dagger">†</span>' : ''}</td>
      <td>${fmtDate(p.szuletes)}</td>
      <td>${fmtDate(p.keresztseg)}</td>
      <td>${fmtDate(p.konfirmacio)}</td>
    </tr>
    ${p.megjegyzes ? `<tr class="note-row"><td></td><td colspan="4" class="note">Megjegyzés: ${esc(p.megjegyzes)}</td></tr>` : ''}
  `

  const paymentsBlock = opts.payments && data.payments.length > 0 ? `
    <h2>Befizetések (utolsó 5 év)</h2>
    <table class="data">
      <thead><tr><th>Dátum</th><th>Év</th><th>Cél</th><th class="right">Összeg</th></tr></thead>
      <tbody>
        ${data.payments.map(p => `
          <tr>
            <td>${fmtDate(p.datum)}</td>
            <td>${p.ev ?? '—'}</td>
            <td>${esc(p.cel) || 'Befizetés'}</td>
            <td class="right">${p.osszeg.toFixed(2)} RON</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  const visitsBlock = opts.visits && data.visits.length > 0 ? `
    <h2>Családlátogatások</h2>
    <table class="data">
      <thead><tr><th>Dátum</th><th>Lelkész</th><th>Megjegyzés</th></tr></thead>
      <tbody>
        ${data.visits.map(v => `
          <tr>
            <td>${fmtDate(v.datum)}</td>
            <td>${esc(v.lelkesz) || '—'}</td>
            <td>${esc(v.megjegyzes) || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>Családi karton — ${esc(data.familyName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; margin: 0; font-size: 12.5px; line-height: 1.45; }
  .head { text-align: center; border-bottom: 2.5px double #0f766e; padding-bottom: 10px; }
  .head .cong { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #475569; }
  .head h1 { font-size: 21px; margin: 6px 0 2px; letter-spacing: 0.06em; }
  .head .fam { font-size: 16px; font-weight: 700; color: #0f766e; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; margin: 10px 0 4px; font-size: 12px; color: #334155; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: #0f766e; border-bottom: 1px solid #99f6e4; padding-bottom: 3px; margin: 18px 0 6px; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 4px 6px; }
  table.data td { padding: 4.5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.role { font-weight: 700; color: #0f766e; white-space: nowrap; width: 80px; }
  td.name { font-weight: 600; }
  td.right, th.right { text-align: right; }
  tr.note-row td { border-bottom: 1px solid #e2e8f0; padding-top: 0; }
  td.note { font-size: 11px; font-style: italic; color: #64748b; }
  .dagger { color: #64748b; }
  .marriage { margin: 6px 0 0; font-size: 12px; color: #334155; }
  .footer { margin-top: 26px; display: flex; justify-content: space-between; font-size: 10.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  .sign { margin-top: 34px; display: flex; justify-content: flex-end; }
  .sign .line { width: 220px; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid #94a3b8; padding-top: 4px; }
</style>
</head>
<body>
  <div class="head">
    <p class="cong">${esc(data.congregation)}</p>
    <h1>CSALÁDI KARTON</h1>
    <p class="fam">${esc(data.familyName)}</p>
  </div>

  <div class="meta">
    <span><strong>Lakcím:</strong> ${esc(data.address) || 'nincs rögzítve'}</span>
    <span><strong>Körzet:</strong> ${esc(data.district) || '—'}</span>
  </div>

  <h2>A család tagjai</h2>
  <table class="data">
    <thead>
      <tr><th>Reláció</th><th>Név</th><th>Született</th><th>Keresztelve</th><th>Konfirmált</th></tr>
    </thead>
    <tbody>
      ${data.adults.map(personRow).join('')}
      ${data.children.map(personRow).join('')}
    </tbody>
  </table>
  ${data.marriage ? `<p class="marriage"><strong>Házasságkötés:</strong> ${fmtDate(data.marriage.datum)}${data.marriage.lelkesz ? ` — eskette: ${esc(data.marriage.lelkesz)}` : ''}</p>` : ''}

  ${paymentsBlock}
  ${visitsBlock}

  <div class="sign"><div class="line">lelkipásztor</div></div>

  <div class="footer">
    <span>Kartotéka — családi karton</span>
    <span>Nyomtatva: ${new Date().toLocaleDateString('hu-HU')}</span>
  </div>
</body>
</html>`
}

export function FamilyCardPrintDialog({ open, onOpenChange, familyId }: FamilyCardPrintDialogProps) {
  const [data, setData] = useState<PrintData>(null)
  const [loading, setLoading] = useState(false)
  const [includePayments, setIncludePayments] = useState(false)
  const [includeVisits, setIncludeVisits] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setData(null)
      getFamilyCardPrintData(familyId).then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, familyId])

  const html = useMemo(
    () => (data ? buildCardHtml(data, { payments: includePayments, visits: includeVisits }) : null),
    [data, includePayments, includeVisits],
  )

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] !w-[min(1060px,calc(100vw-2rem))] !max-w-[min(1060px,calc(100vw-2rem))] overflow-hidden p-0" showCloseButton={false}>
        <div className="flex h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <DialogTitle className="font-heading text-lg">Családi karton nyomtatása</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-400">A4-es, lefűzhető lap — relációkkal, anyakönyvi adatokkal és megjegyzésekkel.</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-700"
              aria-label="Bezárás"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row">
            {/* Opciók */}
            <div className="w-full shrink-0 space-y-3 sm:w-60">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Tartalom</p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <input type="checkbox" checked readOnly className="mt-0.5 accent-teal-600" disabled />
                <span>
                  <span className="font-medium text-slate-700">Relációk + anyakönyv</span>
                  <span className="block text-xs text-slate-400">Mindig a karton része</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includePayments}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Befizetések</span>
                  <span className="block text-xs text-slate-400">Az utolsó 5 év tételei</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includeVisits}
                  onChange={(e) => setIncludeVisits(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Családlátogatások</span>
                  <span className="block text-xs text-slate-400">Utolsó alkalmak</span>
                </span>
              </label>

              <Button
                onClick={handlePrint}
                disabled={!html || loading}
                className="w-full gap-2 rounded-xl bg-teal-600 hover:bg-teal-700"
              >
                <Printer className="size-4" /> Nyomtatás
              </Button>
            </div>

            {/* Élő előnézet */}
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
              {loading && (
                <div className="flex h-full items-center justify-center text-sm text-slate-400 animate-pulse">
                  Családi karton összeállítása…
                </div>
              )}
              {!loading && !data && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                  Nem sikerült betölteni a család adatait.
                </div>
              )}
              {!loading && html && (
                <iframe ref={iframeRef} title="Családi karton előnézet" srcDoc={html} className="h-full w-full bg-white" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
