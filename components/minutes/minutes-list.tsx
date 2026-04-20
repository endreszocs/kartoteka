'use client'

/**
 * Presbiteri/közgyűlési jegyzőkönyvek lista — keresés, szűrés, év választó.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Check, Edit3, Clock, BookOpen, Printer } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getMinutesList, searchMinutes, getMinutesById } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { MinutesPrintDialog } from './minutes-print-dialog'
import { toast } from 'sonner'

interface MinutesEntry {
  id: string
  ev: number
  ules_sorszam: number
  datum: string
  hely: string | null
  allapot: string
  elnok_neve: string | null
}

interface MinutesListProps {
  initialMinutes: MinutesEntry[]
  currentYear: number
  congregationName?: string
}

const STATUS_MAP: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: 'Piszkozat', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Edit3 },
  veglegesitett: { label: 'Véglegesítve', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check },
  hitelesitett: { label: 'Hitelesítve', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Check },
}

export function MinutesList({ initialMinutes, currentYear, congregationName = 'Református Egyházközség' }: MinutesListProps) {
  const [minutes, setMinutes] = useState(initialMinutes)
  const [year, setYear] = useState(currentYear)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ hatarozat_szam: string; szoveg: string; datum: string; ules_sorszam: number; ev: number; jegyzokonyv_id: string }>>([])
  const [searching, setSearching] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printData, setPrintData] = useState<Record<string, unknown> | null>(null)

  async function handleYearChange(newYear: number) {
    setYear(newYear)
    const data = await getMinutesList(newYear)
    setMinutes(data as MinutesEntry[])
  }

  async function handlePrint(id: string) {
    const data = await getMinutesById(id)
    if (!data) { toast.error('Nem sikerült betölteni a jegyzőkönyvet.'); return }
    setPrintData(data)
    setPrintOpen(true)
  }

  const generatePrintHtml = useCallback((type: string): string => {
    if (!printData) return '<p>Nincs adat.</p>'
    const d = printData as { datum: string; tipus?: string; hely?: string; elnok_neve?: string; jegyzo_neve?: string; hitelesito1?: string; hitelesito2?: string; igevers?: string; felolvasas?: string; megjegyzes?: string; resztvevok: Array<{ nev: string; statusz: string }>; napirendi_pontok: Array<{ sorszam: number; cim: string; eloado?: string; targyalas?: string }>; hatarozatok: Array<{ sorszam: number; szoveg: string; napirendi_pont_id?: string }> }
    const yr = new Date(d.datum).getFullYear()
    const tipusNev = d.tipus === 'kozgyulesi' ? 'Közgyűlésének' : 'Presbitériumának'
    const jelen = d.resztvevok.filter((r) => r.statusz === 'jelen').map((r) => r.nev).join(', ')
    const igazoltan = d.resztvevok.filter((r) => r.statusz === 'igazoltan_tavol').map((r) => r.nev).join(', ')

    const baseStyles = `* { box-sizing: border-box; } body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; padding: 30mm 25mm; font-size: 12pt; line-height: 1.7; } @page { size: A4 portrait; margin: 0; } @media print { body { padding: 20mm 25mm 30mm 30mm; } }`

    const sigBlock = `<div style="margin-top:28px;text-align:center;font-size:11pt;">K.m.f</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;"><div style="text-align:center;"><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.elnok_neve || '___'}<br>lelkipásztor</div></div><div style="text-align:center;"><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.jegyzo_neve || '___'}<br>gondnok-jegyző</div></div></div><div style="text-align:center;font-size:11pt;margin-top:16px;">Hitelesítők:</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px;"><div style="text-align:center;"><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.hitelesito1 || '___'}</div></div><div style="text-align:center;"><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin:0 auto;">${d.hitelesito2 || '___'}</div></div></div>`

    if (type === 'hatarozat_kivonat') {
      let rows = ''
      d.hatarozatok.forEach((h) => { rows += `<tr><td style="border:1px solid #334;padding:6px;text-align:center;font-weight:bold;">${h.sorszam}/${yr}</td><td style="border:1px solid #334;padding:6px;">${h.szoveg}</td></tr>` })
      return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${baseStyles}</style></head><body><div style="text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:3px;font-size:14pt;margin-bottom:16px;">HATÁROZAT KIVONAT — ${yr}</div><div style="border-bottom:1px solid #334;padding-bottom:8px;margin-bottom:14px;font-style:italic;font-weight:bold;">${congregationName}</div><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #334;padding:6px;background:#e2e8f0;">Szám</th><th style="border:1px solid #334;padding:6px;background:#e2e8f0;">Határozat</th></tr></thead><tbody>${rows}</tbody></table>${sigBlock}</body></html>`
    }

    if (type === 'meghivo') {
      const napLabel = d.tipus === 'kozgyulesi' ? 'közgyűlésre' : 'presbiteri gyűlésre'
      let napirendList = ''
      d.napirendi_pontok.forEach((np) => { napirendList += `<div style="padding-left:16px;margin-bottom:3px;">— ${np.cim}</div>` })
      return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${baseStyles}</style></head><body><div style="border-bottom:2px solid #334;padding-bottom:10px;margin-bottom:16px;"><div style="font-size:13pt;font-weight:bold;font-style:italic;">${congregationName}</div><div style="font-style:italic;font-weight:bold;">Lelkipásztori Hivatala.</div></div><div style="text-align:center;font-weight:bold;font-style:italic;font-size:14pt;letter-spacing:6px;margin:24px 0;">M e g h í v ó</div><p style="text-align:justify;">Tisztelettel hívom meg a ${d.tipus === 'kozgyulesi' ? 'Gyülekezet tagjait' : 'Presbitérium tagjait'} a <strong>${d.datum}</strong>-én, <strong>${(printData as { kezdes?: string }).kezdes || '___'}</strong> órakor kezdődő ${napLabel}.</p>${napirendList ? `<p style="font-weight:bold;margin-top:16px;">Tárgysorozat:</p>${napirendList}` : ''}<p style="margin-top:24px;">Kelt: ${d.datum}</p><p style="font-style:italic;">Atyafiai köszöntéssel,</p><div style="margin-top:16px;border-top:1px solid #111;width:180px;padding-top:4px;">lelkipásztor</div></body></html>`
    }

    // Jegyzőkönyv
    let content = ''
    d.napirendi_pontok.forEach((np) => {
      content += `<div style="margin-top:16px;"><strong>${np.sorszam}-${yr}.</strong>&emsp;${np.cim}${np.eloado ? ` — <em>Előadó: ${np.eloado}</em>` : ''}`
      if (np.targyalas) content += `<p style="text-align:justify;margin:6px 0;">${np.targyalas.replace(/\n/g, '<br>')}</p>`
      const npHatarozatok = d.hatarozatok.filter((h) => h.napirendi_pont_id)
      npHatarozatok.forEach((h) => { content += `<div style="margin:8px 0 8px 35%;text-align:justify;font-style:italic;">${h.szoveg.replace(/\n/g, '<br>')}</div>` })
      content += '</div>'
    })

    return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><style>${baseStyles}</style></head><body><div style="display:flex;justify-content:space-between;border-bottom:1px solid #334;padding-bottom:8px;margin-bottom:8px;"><div style="font-style:italic;"><div style="font-weight:bold;">${congregationName}</div><div>Lelkipásztori Hivatala.</div></div><div style="text-align:right;font-size:10pt;color:#475;">JEGYZŐKÖNYV</div></div><p style="text-align:justify;font-style:italic;">Jegyzőkönyv, mely készült a ${congregationName} ${tipusNev} <strong>${d.datum}</strong>-én a ${d.hely || 'gyülekezeti teremben'} tartott rendes gyűlésén.</p><p><strong>Elnök:</strong> ${d.elnok_neve || '—'}, <strong>Jegyző:</strong> ${d.jegyzo_neve || '—'}</p>${d.igevers ? `<p><strong>Felolvasott ige:</strong> ${d.igevers}</p>` : ''}<p><strong><u>Jelen vannak:</u></strong> ${jelen || '—'}</p>${igazoltan ? `<p><strong>Igazoltan távol:</strong> ${igazoltan}</p>` : ''}${content}${d.megjegyzes ? `<p style="margin-top:12px;">${d.megjegyzes}</p>` : ''}${sigBlock}</body></html>`
  }, [printData, congregationName])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    const results = await searchMinutes(searchQuery.trim())
    setSearchResults(results)
    setSearching(false)
    if (results.length === 0) toast.info('Nincs találat a határozatokban.')
  }

  return (
    <div className="space-y-4">
      {/* Szűrők és keresés */}
      <div className="card-raised p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={(e) => void handleYearChange(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}. év</option>
              ))}
            </select>
            <Badge variant="secondary" className="text-xs">{minutes.length} jegyzőkönyv</Badge>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="Keresés határozatokban..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
              className="rounded-xl"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSearch()}
              disabled={searching}
              className="rounded-xl shrink-0"
            >
              <Search className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Keresési eredmények */}
      {searchResults.length > 0 && (
        <div className="card-raised p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Keresési eredmények ({searchResults.length})
            </p>
            <Button size="sm" variant="ghost" className="text-xs text-slate-400" onClick={() => setSearchResults([])}>
              Bezárás
            </Button>
          </div>
          <div className="space-y-2">
            {searchResults.map((r, i) => (
              <Link
                key={i}
                href={`/jegyzokonyvek/${r.jegyzokonyv_id}`}
                className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 hover:bg-indigo-50/60 transition"
              >
                <Badge className="bg-indigo-100 text-indigo-700 shrink-0">{r.hatarozat_szam}</Badge>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 line-clamp-2">{r.szoveg}</p>
                  <p className="text-xs text-slate-400 mt-1">{r.ev}/{r.ules_sorszam}. ülés — {r.datum}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Jegyzőkönyv lista */}
      {minutes.length === 0 ? (
        <div className="card-raised p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="font-heading text-lg text-slate-700 mb-1">Nincs jegyzőkönyv</h3>
          <p className="text-sm text-slate-500 mb-4">A {year}. évre még nincs rögzített jegyzőkönyv.</p>
          <Link
            href="/jegyzokonyvek/uj"
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
          >
            Jegyzőkönyv rögzítése
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {minutes.map((m) => {
            const status = STATUS_MAP[m.allapot] || STATUS_MAP.draft
            const StatusIcon = status.icon

            return (
              <Link
                key={m.id}
                href={`/jegyzokonyvek/${m.id}`}
                className="card-raised flex items-center gap-4 p-4 transition hover:shadow-md hover:border-indigo-200/60"
              >
                {/* Sorszám */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <span className="text-lg font-bold">{m.ules_sorszam}.</span>
                </div>

                {/* Tartalom */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {m.ev}/{m.ules_sorszam}. presbiteri gyűlés
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${status.className}`}>
                      <StatusIcon className="mr-0.5 size-3" />
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {m.datum}
                    {m.hely ? ` · ${m.hely}` : ''}
                    {m.elnok_neve ? ` · Elnök: ${m.elnok_neve}` : ''}
                  </p>
                </div>

                {/* Nyomtatás gomb véglegesített jegyzőkönyvekhez */}
                <div className="flex items-center gap-2 shrink-0">
                  {(m.allapot === 'veglegesitett' || m.allapot === 'hitelesitett') && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handlePrint(m.id) }}
                      className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition"
                      title="Nyomtatási központ"
                    >
                      <Printer className="size-4" />
                    </button>
                  )}
                  <div className="text-slate-300">→</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Nyomtatási központ dialógus */}
      {printData && (
        <MinutesPrintDialog
          open={printOpen}
          onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
          generateHtml={generatePrintHtml}
          year={year}
        />
      )}
    </div>
  )
}
