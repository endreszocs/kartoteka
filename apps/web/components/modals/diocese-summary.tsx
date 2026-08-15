'use client'

/**
 * „Egyházmegyénk" — READ-ONLY, kategorizált adat-ablak a `dioceses`
 * törzsadatból, a „Gyülekezetünk adatai" ablak (congregation-summary.tsx)
 * MINTÁJÁRA és annak KÖZÖS építőköveivel (summary-kit.tsx — közös komponens,
 * soha széthúzó másolat).
 *
 * MEGNYITÁS: a fejléc avatár-menüjének „Egyházmegyénk" pontja, KIZÁRÓLAG
 * diocese-scope aktív profilnál (egyházmegyei terv, 4.1). A szerkesztés az
 * „Egyházmegye beállításai" ablakban (diocese-setup-wizard) történik — ide
 * csak megtekintés való; számvevőnek (canWrite=false) a szerkesztés-gomb
 * nem is jelenik meg (ne mutassunk olyan gombot, ami nem vezet sehová).
 *
 * A jogosultság-kapu a SZERVEREN él (getDioceseSummaryData → getDiocese
 * tagsági ellenőrzése) — ez a komponens csak megjelenít.
 */

import { useEffect, useState } from 'react'
import {
  Building2, FileText, Landmark, MapPin, Pencil, Phone, Users, Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SummaryGroup as Group, SummaryRowLine as Row } from './summary-kit'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import {
  getDioceseSummaryData,
  type DioceseRecord,
} from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'

type SummaryData = DioceseRecord & { districtName: string | null }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  dioceseId: string
  /** Írhat-e a néző (esperes / megyei admin)? Számvevőnél false → nincs szerkesztés-gomb. */
  canWrite: boolean
  /** Az „Egyházmegye beállításai" varázsló megnyitása (a shell dialog-state-je). */
  onOpenSetup: () => void
}

export function DioceseSummaryDialog({ open, onOpenChange, dioceseId, canWrite, onOpenSetup }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SummaryData | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // queueMicrotask: az effect törzsében tilos a szinkron setState (kaszkádoló
    // újrarender) — a diocese-setup-wizard betöltőjének bevált mintája.
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      void getDioceseSummaryData(dioceseId).then((res) => {
        if (cancelled) return
        if (res.error || !res.data) {
          setError(res.error || 'Nem sikerült betölteni az egyházmegye adatait.')
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, dioceseId])

  // A hivatalos cím egyetlen olvasható sorban (a nyomtatványokéval azonos sorrend).
  const cimSor = data
    ? [
        [data.cim_iranyitoszam, data.cim_telepules].filter(Boolean).join(' '),
        data.cim_utca,
        [data.cim_megye, data.cim_orszag].filter(Boolean).join(', '),
      ].filter(Boolean).join(', ')
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[96vw] !max-w-[96vw] sm:!max-w-[min(980px,96vw)] max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        {/* Képernyőolvasónak — a látható cím a színes hero-ban van. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Egyházmegyénk — adatlap</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
            Az egyházmegye adatainak betöltése…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Színes hero — címer + név + szerkesztés (a gyülekezeti ablak design-nyelve) */}
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-teal-500 via-emerald-500 to-sky-600 p-5 text-white shadow-lg sm:p-6">
              <div className="absolute -right-8 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-12 left-10 size-36 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white shadow-md">
                    {data.cimer_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={data.cimer_url} alt="Egyházmegyei címer" className="h-full w-full object-contain p-1.5" />
                      : <Building2 className="size-9 text-teal-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">Egyházmegyénk</p>
                    <h2 className="font-heading text-2xl leading-tight sm:text-3xl">
                      {formatEgyhazmegyeNev(data.name) || 'Egyházmegye'}
                    </h2>
                    {data.districtName && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium backdrop-blur">{data.districtName}</span>
                      </div>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-slate-900/85 text-white hover:bg-slate-900"
                      onClick={() => {
                        // Előbb zárjuk ezt az ablakot, aztán nyílik a varázsló —
                        // két egymásra nyíló dialógus mobilon kezelhetetlen.
                        onOpenChange(false)
                        onOpenSetup()
                      }}
                    >
                      <Pencil className="mr-1.5 size-4" /> Szerkesztés a beállításokban
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Group icon={<FileText className="size-4" />} title="Alapadatok" accent="sky">
                <Row label="Hivatalos név" value={data.name || undefined} copyText={data.name || undefined} copyLabel="Hivatalos név" />
                <Row label="Román név (hivatalos)" value={data.nev_ro || undefined} copyText={data.nev_ro || undefined} copyLabel="Román név" />
                {data.nev_en ? <Row label="Angol név" value={data.nev_en} copyText={data.nev_en} copyLabel="Angol név" /> : null}
                <Row label="CIF (adóazonosító)" value={data.cif || undefined} mono copyText={data.cif || undefined} copyLabel="CIF" />
                <Row label="Magyar adószám" value={data.adoszam || undefined} mono copyText={data.adoszam || undefined} copyLabel="Adószám" />
                {data.cnp_letter ? <Row label="Hivatali főszám" value={data.cnp_letter} mono /> : null}
              </Group>

              <Group icon={<Landmark className="size-4" />} title="Egyházi hovatartozás" accent="indigo">
                <Row label="Egyházkerület" value={data.districtName || undefined} />
              </Group>

              <Group icon={<MapPin className="size-4" />} title="Hivatalos cím" accent="rose">
                <Row label="Cím" value={cimSor || undefined} copyText={cimSor || undefined} copyLabel="Cím" />
              </Group>

              <Group icon={<Phone className="size-4" />} title="Elérhetőség" accent="teal">
                <Row label="E-mail" value={data.email || undefined} copyText={data.email || undefined} copyLabel="E-mail cím" href={data.email ? `mailto:${data.email}` : undefined} />
                <Row label="Telefon" value={data.telefon || undefined} mono copyText={data.telefon || undefined} copyLabel="Telefonszám" href={data.telefon ? `tel:${data.telefon.replace(/\s/g, '')}` : undefined} />
                <Row label="Weboldal" value={data.weboldal || undefined} copyText={data.weboldal || undefined} copyLabel="Weboldal" href={data.weboldal ? (data.weboldal.startsWith('http') ? data.weboldal : `https://${data.weboldal}`) : undefined} />
              </Group>

              <Group icon={<Wallet className="size-4" />} title="Bankszámla" accent="violet">
                <Row
                  label={`${data.bank_nev || 'Bank'}${data.bank_fo_iban_valuta ? ` (${data.bank_fo_iban_valuta})` : ''}`}
                  value={data.bank_fo_iban || undefined}
                  mono
                  copyText={data.bank_fo_iban || undefined}
                  copyLabel={`${data.bank_nev || 'Bank'} IBAN`}
                />
              </Group>

              <Group icon={<Users className="size-4" />} title="Vezetés" accent="amber">
                <Row
                  label={data.esperes_cim ? `Esperes (${data.esperes_cim})` : 'Esperes'}
                  value={data.esperes_nev || undefined}
                />
                <Row label="Egyházmegyei jegyző" value={data.jegyzo_nev || undefined} />
              </Group>
            </div>

            <p className="px-1 text-center text-xs text-slate-400 dark:text-slate-500">
              Ez az ablak csak megtekintésre szolgál. A szerkesztés az Egyházmegye beállításai ablakban érhető el.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
