'use client'

/**
 * Korábbi bizonylatok újranyomtatása — a Nyomtatási központban.
 *
 * Listázza a mentett Decont és Dispoziție bizonylatokat az adott évre, és
 * mindegyik újranyomtatható / PDF-be menthető a hű (snapshot alapú) HTML-ből.
 */

import { useCallback, useEffect, useState } from 'react'
import { FileText, Printer, Save } from 'lucide-react'
import { buildDecontHtml, buildDispozitieHtml } from '@kartoteka/ui-app'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import {
  listDeconts,
  getDecontForReprint,
  type DecontListItem,
} from '@/app/(dashboard)/penzugy/decont-actions'
import {
  listDispozitiok,
  getDispozitieForReprint,
  type DispozitieListItem,
} from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'

interface Props {
  open: boolean
  congregationName: string
  currentYear: number
}

const fmt = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SavedDocsReprint({ open, congregationName, currentYear }: Props) {
  const [year, setYear] = useState(currentYear)
  const [deconts, setDeconts] = useState<DecontListItem[]>([])
  const [dispozitiok, setDispozitiok] = useState<DispozitieListItem[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (y: number) => {
    setLoading(true)
    try {
      const [d, dp] = await Promise.all([listDeconts(y), listDispozitiok(y)])
      setDeconts(d)
      setDispozitiok(dp)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load(year)
  }, [open, year, load])

  async function printDecont(id: string, mode: 'browser' | 'pdf') {
    const data = await getDecontForReprint(id)
    if (!data) { toast.error('A decont nem található.'); return }
    const html = buildDecontHtml({ congregationName, ...data })
    if (mode === 'pdf') await printToPdf(html, `Decont_${data.sorszam}_${data.date}.pdf`, { format: 'a4', orientation: 'portrait' })
    else await printToBrowser(html)
  }

  async function printDispozitie(id: string, mode: 'browser' | 'pdf') {
    const data = await getDispozitieForReprint(id)
    if (!data) { toast.error('A dispoziție nem található.'); return }
    const html = buildDispozitieHtml({ congregationName: `Parohia Reformată ${congregationName}`, ...data })
    if (mode === 'pdf') await printToPdf(html, `Dispozitie_${data.tipus}_${data.sorszam}_${data.date}.pdf`, { format: 'a4', orientation: 'portrait' })
    else await printToBrowser(html)
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-heading text-base text-slate-800">
          <FileText className="size-4 text-violet-600" /> Korábbi bizonylatok újranyomtatása
        </h3>
        <label className="text-xs text-slate-500">Év:
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear)}
            className="ml-2 h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm" />
        </label>
      </div>

      {loading && <p className="text-sm text-slate-400">Betöltés…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Decontok */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700/70">Decont — Elszámolások</p>
          {deconts.length === 0 ? (
            <p className="text-sm text-slate-400">Nincs mentett decont ebben az évben.</p>
          ) : (
            <ul className="space-y-1.5">
              {deconts.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <strong>#{d.sorszam}</strong> · {d.datum} · {d.elszamolo_nev || '—'} · {fmt(d.osszkoltseg)} RON
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Nyomtatás" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => void printDecont(d.id, 'browser')}><Printer className="size-4" /></button>
                    <button type="button" aria-label="PDF" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => void printDecont(d.id, 'pdf')}><Save className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dispozitiók */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700/70">Dispoziție de plată / încasare</p>
          {dispozitiok.length === 0 ? (
            <p className="text-sm text-slate-400">Nincs mentett dispoziție ebben az évben.</p>
          ) : (
            <ul className="space-y-1.5">
              {dispozitiok.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <strong className={d.tipus === 'plata' ? 'text-red-600' : 'text-emerald-600'}>{d.tipus === 'plata' ? 'Plată' : 'Încasare'} #{d.sorszam}</strong> · {d.datum} · {d.nev || '—'} · {fmt(d.osszeg)} RON
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Nyomtatás" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => void printDispozitie(d.id, 'browser')}><Printer className="size-4" /></button>
                    <button type="button" aria-label="PDF" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => void printDispozitie(d.id, 'pdf')}><Save className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
