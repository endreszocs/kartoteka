'use client'

/**
 * Nyomtatási központ a jegyzőkönyvek főoldalán.
 * Kinyitható kártya — kiválasztható bármelyik mentett jegyzőkönyv, majd nyomtatási központ.
 */

import { useState, useCallback } from 'react'
import { Printer, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getMinutesById } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { MinutesPrintDialog } from './minutes-print-dialog'
import { toast } from 'sonner'

interface MinutesEntry {
  id: string
  ev: number
  ules_sorszam: number
  datum: string
  allapot: string
}

interface MinutesPrintSelectorProps {
  minutes: MinutesEntry[]
  congregationName: string
  /** Ha true, egy gombként jelenik meg (a hero sávban), nem kártyaként */
  inline?: boolean
}

export function MinutesPrintSelector({ minutes, congregationName, inline }: MinutesPrintSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printData, setPrintData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function handleSelect(id: string) {
    setLoading(id)
    const data = await getMinutesById(id)
    setLoading(null)
    if (!data) { toast.error('Nem sikerült betölteni.'); return }
    setPrintData(data)
    setPrintOpen(true)
  }

  const generatePrintHtml = useCallback((type: string): string => {
    if (!printData) return '<p>Nincs adat.</p>'
    const d = printData as {
      datum: string; tipus?: string; hely?: string; elnok_neve?: string; jegyzo_neve?: string
      hitelesito1?: string; hitelesito2?: string; igevers?: string; megjegyzes?: string; kezdes?: string
      resztvevok: Array<{ nev: string; statusz: string }>
      napirendi_pontok: Array<{ sorszam: number; cim: string; eloado?: string; targyalas?: string }>
      hatarozatok: Array<{ sorszam: number; szoveg: string }>
    }
    const yr = new Date(d.datum).getFullYear()
    const tipusNev = d.tipus === 'kozgyulesi' ? 'Közgyűlésének' : 'Presbitériumának'
    const jelen = d.resztvevok.filter((r) => r.statusz === 'jelen').map((r) => r.nev).join(', ')
    const igazoltan = d.resztvevok.filter((r) => r.statusz === 'igazoltan_tavol').map((r) => r.nev).join(', ')

    const css = `* { box-sizing: border-box; } body { font-family: 'Times New Roman', serif; color: #111; margin: 0; padding: 30mm 25mm; font-size: 12pt; line-height: 1.7; } @page { size: A4 portrait; margin: 0; } @media print { body { padding: 20mm 25mm 30mm 30mm; } }`

    const sig = `<div style="margin-top:28px;text-align:center;font-size:11pt;">K.m.f</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;text-align:center;font-size:11pt;">
        <div><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.elnok_neve || '___'}<br>lelkipásztor</div></div>
        <div><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.jegyzo_neve || '___'}<br>gondnok-jegyző</div></div>
      </div>
      <div style="text-align:center;font-size:11pt;margin-top:16px;">Hitelesítők:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px;text-align:center;font-size:11pt;">
        <div><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.hitelesito1 || '___'}</div></div>
        <div><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.hitelesito2 || '___'}</div></div>
      </div>`

    if (type === 'hatarozat_kivonat') {
      let rows = ''
      d.hatarozatok.forEach((h) => { rows += `<tr><td style="border:1px solid #334;padding:6px;text-align:center;font-weight:bold;">${h.sorszam}/${yr}</td><td style="border:1px solid #334;padding:6px;">${h.szoveg}</td></tr>` })
      return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${css}</style></head><body>
        <div style="text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:3px;font-size:14pt;margin-bottom:16px;">HATÁROZAT KIVONAT — ${yr}</div>
        <div style="border-bottom:1px solid #334;padding-bottom:8px;margin-bottom:14px;font-style:italic;font-weight:bold;">${congregationName}</div>
        <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #334;padding:6px;background:#e2e8f0;">Szám</th><th style="border:1px solid #334;padding:6px;background:#e2e8f0;">Határozat</th></tr></thead><tbody>${rows}</tbody></table>
        ${sig}</body></html>`
    }

    if (type === 'meghivo') {
      let napirendList = ''
      d.napirendi_pontok.forEach((np) => { napirendList += `<div style="padding-left:16px;margin-bottom:3px;">— ${np.cim}</div>` })
      return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${css}</style></head><body>
        <div style="border-bottom:2px solid #334;padding-bottom:10px;margin-bottom:16px;"><div style="font-size:13pt;font-weight:bold;font-style:italic;">${congregationName}</div><div style="font-style:italic;font-weight:bold;">Lelkipásztori Hivatala.</div></div>
        <div style="text-align:center;font-weight:bold;font-style:italic;font-size:14pt;letter-spacing:6px;margin:24px 0;">M e g h í v ó</div>
        <p style="text-align:justify;">Tisztelettel hívom meg a ${d.tipus === 'kozgyulesi' ? 'Gyülekezet tagjait' : 'Presbitérium tagjait'} a <strong>${d.datum}</strong>-én, <strong>${d.kezdes || '___'}</strong> órakor kezdődő gyűlésre. Helyszín: <strong>${d.hely || '___'}</strong>.</p>
        ${napirendList ? `<p style="font-weight:bold;margin-top:16px;">Tárgysorozat:</p>${napirendList}` : ''}
        <p style="margin-top:24px;">Kelt: ${d.datum}</p><p style="font-style:italic;">Atyafiai köszöntéssel,</p>
        <div style="margin-top:16px;border-top:1px solid #111;width:180px;padding-top:4px;">lelkipásztor</div></body></html>`
    }

    // Jegyzőkönyv
    let content = ''
    d.napirendi_pontok.forEach((np) => {
      content += `<div style="margin-top:16px;"><strong>${np.sorszam}-${yr}.</strong>&emsp;${np.cim}${np.eloado ? ` — <em>Előadó: ${np.eloado}</em>` : ''}`
      if (np.targyalas) content += `<p style="text-align:justify;margin:6px 0;">${np.targyalas.replace(/\n/g, '<br>')}</p>`
      content += '</div>'
    })
    d.hatarozatok.forEach((h) => {
      content += `<div style="margin:8px 0 8px 35%;text-align:justify;font-style:italic;">${h.szoveg.replace(/\n/g, '<br>')}</div>`
    })

    return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${css}</style></head><body>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid #334;padding-bottom:8px;margin-bottom:8px;">
        <div style="font-style:italic;"><div style="font-weight:bold;">${congregationName}</div><div>Lelkipásztori Hivatala.</div></div>
        <div style="text-align:right;font-size:10pt;color:#475;">JEGYZŐKÖNYV</div>
      </div>
      <p style="text-align:justify;font-style:italic;">Jegyzőkönyv, mely készült a ${congregationName} ${tipusNev} <strong>${d.datum}</strong>-én a ${d.hely || 'gyülekezeti teremben'} tartott rendes gyűlésén.</p>
      <p><strong>Elnök:</strong> ${d.elnok_neve || '—'}, <strong>Jegyző:</strong> ${d.jegyzo_neve || '—'}</p>
      ${d.igevers ? `<p><strong>Felolvasott ige:</strong> ${d.igevers}</p>` : ''}
      <p><strong><u>Jelen vannak:</u></strong> ${jelen || '—'}</p>
      ${igazoltan ? `<p><strong>Igazoltan távol:</strong> ${igazoltan}</p>` : ''}
      ${content}
      ${d.megjegyzes ? `<p style="margin-top:12px;">${d.megjegyzes}</p>` : ''}
      ${sig}</body></html>`
  }, [printData, congregationName])

  const printableMinutes = minutes.filter((m) => m.allapot === 'veglegesitett' || m.allapot === 'hitelesitett')

  // Normál mód: ha nincs adat, nem jelenünk meg. Inline módban mindig megjelenünk.
  if (!inline && printableMinutes.length === 0 && minutes.length === 0) return null

  // ── Inline mód: gomb a hero sávban ──
  if (inline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          <Printer className="size-4" />
          Nyomtatási központ
        </button>

        {/* Jegyzőkönyv választó dialógus */}
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nyomtatási központ</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-500 -mt-2 mb-3">Válassz egy véglegesített jegyzőkönyvet</p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {printableMinutes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nincs véglegesített jegyzőkönyv.</p>
              ) : (
                printableMinutes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setExpanded(false); void handleSelect(m.id) }}
                    disabled={loading === m.id}
                    className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold shrink-0">
                      {m.ules_sorszam}.
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{m.ev}/{m.ules_sorszam}. gyűlés</p>
                      <p className="text-xs text-slate-400">{m.datum}</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 text-[10px] shrink-0">Végleges</Badge>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {printData && (
          <MinutesPrintDialog
            open={printOpen}
            onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
            generateHtml={generatePrintHtml}
            year={new Date((printData as { datum: string }).datum).getFullYear()}
          />
        )}
      </>
    )
  }

  // ── Normál mód: teljes kártya ──
  return (
    <>
      {printData && (
        <MinutesPrintDialog
          open={printOpen}
          onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
          generateHtml={generatePrintHtml}
          year={printData ? new Date((printData as { datum: string }).datum).getFullYear() : new Date().getFullYear()}
        />
      )}
    </>
  )
}
