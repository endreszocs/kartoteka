'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getMemberCertificateData } from '@/app/(dashboard)/tagnyilvantartas/actions'

/**
 * 2026-06-10 (Fázis 5, P3-3) — Nyomtatható TAGSÁGI IGAZOLÁS.
 *
 * A4 álló lap: gyülekezet-fejléc, hivatalos igazolás-szöveg a tag személyes
 * adataival, opcionálisan az anyakönyvi adatokkal (keresztelés, konfirmáció),
 * szabad szöveges céllal, kelttel és aláírás-vonallal (P.H.).
 *
 * Minta: family-card-print-dialog — bal oldalt opciók, jobbra élő iframe
 * előnézet, nyomtatás az iframe-ből.
 */

type CertData = Awaited<ReturnType<typeof getMemberCertificateData>>

interface MemberCertificateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  szemelyId: number | null
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

function buildCertificateHtml(
  data: NonNullable<CertData>,
  opts: { purpose: string; includeRegistry: boolean },
): string {
  const m = data.member
  const szuletes = [m.szulhely, m.sz_datum ? fmtDate(m.sz_datum) : null].filter(Boolean).join(', ')

  const registryBlock = opts.includeRegistry && (data.keresztseg || data.konfirmacio) ? `
    <div class="registry">
      ${data.keresztseg ? `<div class="k">Megkeresztelve:</div><div class="v">${fmtDate(data.keresztseg.datum)}${data.keresztseg.hely ? ` — ${esc(data.keresztseg.hely)}` : ''}</div>` : ''}
      ${data.konfirmacio ? `<div class="k">Konfirmált:</div><div class="v">${fmtDate(data.konfirmacio.datum)}${data.konfirmacio.hely ? ` — ${esc(data.konfirmacio.hely)}` : ''}</div>` : ''}
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>Tagsági igazolás — ${esc(m.nev)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; margin: 0; font-size: 13.5px; line-height: 1.65; }
  .head { text-align: center; border-bottom: 2.5px double #0f766e; padding-bottom: 12px; }
  .head .cong { font-size: 15px; font-weight: 700; letter-spacing: 0.04em; }
  .head .addr { font-size: 11.5px; color: #475569; margin-top: 2px; }
  h1 { text-align: center; font-size: 22px; letter-spacing: 0.14em; margin: 34px 0 26px; }
  .body { text-align: justify; margin: 0 0 8px; }
  .name { text-align: center; font-size: 19px; font-weight: 700; margin: 18px 0 6px; }
  .datarow { text-align: center; font-size: 12.5px; color: #334155; margin: 0 0 18px; }
  .registry { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; width: fit-content; margin: 18px auto; font-size: 13px; }
  .registry .k { font-weight: 700; color: #0f766e; }
  .purpose { margin-top: 18px; font-style: italic; }
  .kelt { margin-top: 42px; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign .ph { font-size: 11px; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 50%; width: 86px; height: 86px; display: flex; align-items: center; justify-content: center; }
  .sign .line { width: 230px; text-align: center; font-size: 12px; color: #475569; border-top: 1px solid #64748b; padding-top: 5px; }
  .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <p class="cong">${esc(data.congregation.name)}</p>
    ${data.congregation.cim ? `<p class="addr">${esc(data.congregation.cim)}</p>` : ''}
  </div>

  <h1>TAGSÁGI IGAZOLÁS</h1>

  <p class="body">Alulírott lelkipásztor ezúton hivatalosan igazolom, hogy</p>

  <p class="name">${esc(m.nev)}${m.szcs_nev ? ` <span style="font-weight:400">(szül. ${esc(m.szcs_nev)})</span>` : ''}</p>
  <p class="datarow">
    ${szuletes ? `született: ${esc(szuletes)}` : ''}${szuletes && m.anyjaneve ? ' · ' : ''}${m.anyjaneve ? `anyja neve: ${esc(m.anyjaneve)}` : ''}
    ${m.lakcim ? `<br/>lakcím: ${esc(m.lakcim)}` : ''}
  </p>

  <p class="body">gyülekezetünk nyilvántartott egyháztagja${m.meghalt ? ' volt' : ''}.</p>

  ${registryBlock}

  ${opts.purpose.trim() ? `<p class="purpose">Az igazolás a következő célra készült: ${esc(opts.purpose.trim())}.</p>` : ''}

  <p class="kelt">Kelt: ${esc(data.congregation.name)}, ${new Date().toLocaleDateString('hu-HU')}</p>

  <div class="sign">
    <div class="ph">P.&nbsp;H.</div>
    <div class="line">lelkipásztor</div>
  </div>

  <div class="footer">Kartotéka — gyülekezeti nyilvántartás</div>
</body>
</html>`
}

export function MemberCertificateDialog({ open, onOpenChange, szemelyId }: MemberCertificateDialogProps) {
  const [data, setData] = useState<CertData>(null)
  const [loading, setLoading] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [includeRegistry, setIncludeRegistry] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !szemelyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setData(null)
      getMemberCertificateData(szemelyId).then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, szemelyId])

  const html = useMemo(
    () => (data ? buildCertificateHtml(data, { purpose, includeRegistry }) : null),
    [data, purpose, includeRegistry],
  )

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] !w-[min(1000px,calc(100vw-2rem))] !max-w-[min(1000px,calc(100vw-2rem))] overflow-hidden p-0" showCloseButton={false}>
        <div className="flex h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <DialogTitle className="font-heading text-lg">Tagsági igazolás nyomtatása</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-400">A4-es hivatalos igazolás — aláírással, pecsét helyével.</p>
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
            <div className="w-full shrink-0 space-y-3 sm:w-64">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Az igazolás célja</p>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="pl. keresztszülői tisztség"
                  className="h-10 rounded-xl bg-white"
                />
                <p className="text-[11px] text-slate-400">Üresen hagyható — akkor a cél-sor nem kerül a lapra.</p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includeRegistry}
                  onChange={(e) => setIncludeRegistry(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Anyakönyvi adatok</span>
                  <span className="block text-xs text-slate-400">Keresztelés és konfirmáció dátuma</span>
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
                  Igazolás összeállítása…
                </div>
              )}
              {!loading && !data && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                  Nem sikerült betölteni a tag adatait.
                </div>
              )}
              {!loading && html && (
                <iframe ref={iframeRef} title="Tagsági igazolás előnézet" srcDoc={html} className="h-full w-full bg-white" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
