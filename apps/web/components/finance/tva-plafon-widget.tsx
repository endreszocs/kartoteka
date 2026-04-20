'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/constants/finance'
import {
  tvaSzintLabel,
  tvaSzintMagyarazat,
  type TvaFigyelmeztetesSzint,
  type TvaPlafonResult,
} from '@/lib/finance/tva-plafon-constants'
import {
  calculateTvaPlafonForYear,
  notifyTvaPlafonOverflow,
} from '@/app/(dashboard)/penzugy/tva-actions'

interface Props {
  /** Alapértelmezés: aktuális év. */
  year?: number
}

function szintStyling(szint: TvaFigyelmeztetesSzint) {
  switch (szint) {
    case 'nyugodt':
      return {
        container: 'border-slate-200 bg-white',
        badge: 'bg-slate-100 text-slate-600',
        bar: 'bg-slate-300',
        icon: <CheckCircle2 className="size-5 text-slate-500" />,
      }
    case 'sarga':
      return {
        container: 'border-amber-200 bg-amber-50/60',
        badge: 'bg-amber-100 text-amber-800',
        bar: 'bg-amber-400',
        icon: <Info className="size-5 text-amber-600" />,
      }
    case 'narancs':
      return {
        container: 'border-orange-300 bg-orange-50/70',
        badge: 'bg-orange-200 text-orange-900',
        bar: 'bg-orange-500',
        icon: <AlertTriangle className="size-5 text-orange-600" />,
      }
    case 'piros':
      return {
        container: 'border-red-300 bg-red-50/70',
        badge: 'bg-red-200 text-red-900',
        bar: 'bg-red-500',
        icon: <ShieldAlert className="size-5 text-red-600" />,
      }
  }
}

export function TvaPlafonWidget({ year }: Props) {
  const [data, setData] = useState<TvaPlafonResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let active = true
    calculateTvaPlafonForYear(year)
      .then((res) => {
        if (!active) return
        if (res.success) {
          setData(res.data)
          setError(null)

          // Ha a szint piros (plafon átlépve), proaktív toast + értesítés küldése
          // a lelkésznek/esperesnek. A deduplikáció a server oldalon van (évente
          // egyszer megy ki).
          if (res.data.szint === 'piros' && !res.data.maris_tva_alany) {
            toast.warning(
              `TVA-plafon átlépve (${res.data.year}): ${formatCurrency(res.data.szamoltForgalomRon)} RON. ` +
                'Sürgős teendő: keresd a könyvelőt a 010-es nyomtatvány benyújtásához.',
              { duration: 12_000 },
            )
            // Háttér-értesítés (fire-and-forget)
            void notifyTvaPlafonOverflow(res.data.year)
          }
        } else {
          setError(res.error)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [year])

  if (loading) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-slate-400">TVA-plafon figyelő</p>
        <p className="mt-2 text-sm text-slate-500">Számítás folyamatban…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50/60 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-red-700">TVA-plafon figyelő — hiba</p>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    )
  }

  if (!data) return null

  // Ha már TVA-alany, a widget más üzenetet ad
  if (data.maris_tva_alany) {
    return (
      <div className="rounded-[24px] border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 text-violet-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">TVA-alany státusz</p>
            <h3 className="mt-1 font-heading text-lg text-slate-800">Már TVA-alany vagy</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              A gyülekezet ÁFA-alany. A plafon-figyelő ebben az esetben nem releváns. A könyvelővel
              egyeztetve készüljenek az ÁFA-bevallások.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Ha nincs plafonba számító forgalom, minimál üzenet (ne zsúfoljuk tele a dashboardot)
  if (data.szamoltForgalomRon === 0) {
    return null
  }

  const style = szintStyling(data.szint)
  const progressPercent = Math.min(100, data.szazalek)

  return (
    <>
      <div className={`rounded-[24px] border p-5 shadow-sm ${style.container}`}>
        <div className="flex items-start gap-3">
          {style.icon}
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  TVA-plafon figyelő · {data.year}
                </p>
                <h3 className="mt-1 font-heading text-lg text-slate-800">
                  {formatCurrency(data.szamoltForgalomRon)} RON / {formatCurrency(data.tvaPlafonRon)} RON
                </h3>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}>
                {tvaSzintLabel(data.szint)} · {data.szazalek.toFixed(1)}%
              </span>
            </div>

            {/* Progressz bar */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full transition-all ${style.bar}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {tvaSzintMagyarazat(data.szint)}
            </p>

            {data.beszamitoTetelek.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Beszámító kategóriák:{' '}
                  <span className="font-medium text-slate-700">
                    {data.beszamitoTetelek.map((t) => t.szamadasicelKod).join(', ')}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setDetailsOpen(true)}
                >
                  Részletek
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Részletek modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>TVA-plafon — kategóriánkénti bontás · {data.year}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${style.container}`}>
              <p className="text-sm leading-6 text-slate-700">
                {tvaSzintMagyarazat(data.szint)}
              </p>
            </div>

            {/* Részletes lista */}
            <div className="space-y-2">
              {data.beszamitoTetelek.map((t) => (
                <div key={t.szamadasicelKod} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {t.szamadasicelKod} · {t.celNev}
                      </p>
                      {t.jogszabalyiHivatkozas && (
                        <p className="mt-1 text-xs italic leading-5 text-slate-500">
                          {t.jogszabalyiHivatkozas}
                        </p>
                      )}
                    </div>
                    <p className="font-heading text-lg text-slate-800">
                      {formatCurrency(t.osszesen)} RON
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Összesen sor */}
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Összesen</p>
                <p className="font-heading text-xl text-slate-900">
                  {formatCurrency(data.szamoltForgalomRon)} RON
                </p>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Plafon: {formatCurrency(data.tvaPlafonRon)} RON · Teljesítés: {data.szazalek.toFixed(1)}%
              </p>
            </div>

            {/* Jogi lábjegyzet */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-xs leading-5 text-slate-600">
              <p>
                <strong>Jogi alap:</strong> Codul fiscal art. 310 (kis vállalkozás plafon, 395 000 RON
                2025.09.01 óta — OG 22/2025) + art. 292 alin. (1) lit. k) (cult religios mentesség) + art. 292
                alin. (2) lit. e) (ingatlan-bérbeadás mentes, de számít a plafonba).
              </p>
              <p className="mt-2">
                Ez a figyelő <strong>nem ügyvédi/könyvelői tanácsadás</strong>. A regisztrációs eljárást
                a könyvelő intézi.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
