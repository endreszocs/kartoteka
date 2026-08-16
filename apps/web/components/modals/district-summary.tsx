'use client'

/**
 * „Egyházkerületünk" — READ-ONLY, kategorizált adat-ablak a `districts`
 * törzsadatból. Az „Egyházmegyénk" ablak (diocese-summary.tsx) MINTÁJÁRA és
 * annak KÖZÖS építőköveivel (summary-kit.tsx) — soha széthúzó másolat.
 *
 * MEGNYITÁS: a fejléc avatár-menüjének „Egyházkerületünk" pontja, KIZÁRÓLAG
 * district-scope aktív profilnál. A szerkesztés az „Egyházkerület beállításai"
 * ablakban (district-setup-wizard) történik — ide csak megtekintés való.
 * A kerületi SZÁMVEVŐNEK (canWrite=false) a szerkesztés-gomb nem jelenik meg:
 * ne mutassunk olyan gombot, ami nem vezet sehová.
 *
 * ⚠️ K4 (Endre döntése, 2026-08-15): „A kerület nem írhatja és nem is olvassa a
 *    kerület gyülekezeteinek és egyházmegyéinek az adatait, csak a hivatalosan
 *    beküldött adatokat illetve azoknak az összesítőjét."
 *    Ezért ez az ablak az egyházmegyékből KIZÁRÓLAG DARABSZÁMOT mutat — nevet,
 *    címet, pénzügyet nem. A szerver-oldali `getDistrictSummaryData` ugyanezt
 *    tartja be (`head: true` számlálás).
 *
 * A jogosultság-kapu a SZERVEREN él (getDistrictSummaryData → getDistrict) —
 * ez a komponens csak megjelenít.
 */

import { useEffect, useState } from 'react'
import {
  AlertTriangle, Building2, FileText, Landmark, MapPin, Pencil, Phone, Stamp, Users, Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SummaryGroup as Group, SummaryRowLine as Row } from './summary-kit'
import {
  getDistrictSummaryData,
  type DistrictRecord,
} from '@/app/(dashboard)/dashboard-kerulet/district-actions'

type SummaryData = DistrictRecord & { dioceseCount: number; migracioLefutott: boolean }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  districtId: string
  /** Írhat-e a néző (egyházkerületi admin)? A SZÁMVEVŐNÉL false → nincs szerkesztés-gomb. */
  canWrite: boolean
  /** Az „Egyházkerület beállításai" varázsló megnyitása (a shell dialog-state-je). */
  onOpenSetup: () => void
}

export function DistrictSummaryDialog({
  open, onOpenChange, districtId, canWrite, onOpenSetup,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SummaryData | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // queueMicrotask: az effect törzsében tilos a szinkron setState (kaszkádoló
    // újrarender — react-hooks/set-state-in-effect ERROR). A megyei ablak
    // bevált mintája.
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      void getDistrictSummaryData(districtId).then((res) => {
        if (cancelled) return
        if (res.error || !res.data) {
          setError(res.error || 'Nem sikerült betölteni az egyházkerület adatait.')
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, districtId])

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
          <DialogTitle>Egyházkerületünk — adatlap</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Az egyházkerület adatainak betöltése…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Színes hero — a kerületi szint LILA (a profilválasztó SCOPE_COLOR-jával egyezik). */}
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 p-5 text-white shadow-lg sm:p-6">
              <div className="absolute -right-8 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-12 left-10 size-36 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white shadow-md">
                    {data.cimer_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={data.cimer_url} alt="Egyházkerületi címer" className="h-full w-full object-contain p-1.5" />
                      : <Building2 className="size-9 text-violet-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
                      Egyházkerületünk
                    </p>
                    <h2 className="font-heading text-2xl leading-tight sm:text-3xl">
                      {data.name || 'Egyházkerület'}
                      {/* Endre kérése: a teszt-kerület LÁTHATÓAN meg legyen jelölve,
                          hogy éles használatban ne lehessen összekeverni. A jelzés
                          a SZERVERTŐL kapott `teszt` mezőből jön — nem lokális
                          név-felismerésből, mert az felületenként mást mondana. */}
                      {data.teszt && (
                        <span className="ml-2 align-middle rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                          teszt
                        </span>
                      )}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium backdrop-blur">
                        {data.dioceseCount.toLocaleString('hu-HU')} egyházmegye
                      </span>
                    </div>
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

            {/* Ha az S2 migráció még nem futott le, a mezők üresen JELENNÉNEK meg —
                ami úgy nézne ki, mintha az adat elveszett volna. Inkább mondjuk meg. */}
            {!data.migracioLefutott && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Az egyházkerület hivatalos adatai még nincsenek kitöltve. A rendszergazdának
                  előbb le kell futtatnia a <strong>2026-08-16-egyhazkeruleti-S2-identitas.sql</strong>
                  {' '}migrációt, utána a beállítás-varázslóban megadhatók az adatok.
                </span>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Group icon={<FileText className="size-4" />} title="Alapadatok" accent="sky">
                <Row label="Hivatalos név" value={data.name || undefined} copyText={data.name || undefined} copyLabel="Hivatalos név" />
                <Row label="Román név (hivatalos)" value={data.nev_ro || undefined} copyText={data.nev_ro || undefined} copyLabel="Román név" />
                {data.nev_en ? <Row label="Angol név" value={data.nev_en} copyText={data.nev_en} copyLabel="Angol név" /> : null}
                <Row label="CIF (adóazonosító)" value={data.cif || undefined} mono copyText={data.cif || undefined} copyLabel="CIF" />
                <Row label="Magyar adószám" value={data.adoszam || undefined} mono copyText={data.adoszam || undefined} copyLabel="Adószám" />
                {data.cnp_letter ? <Row label="Hivatali főszám" value={data.cnp_letter} mono /> : null}
              </Group>

              {/* ⚠️ K4: KIZÁRÓLAG darabszám — a megyék neve és adatai NEM jelennek meg. */}
              <Group icon={<Landmark className="size-4" />} title="Egyházi szerkezet" accent="indigo">
                <Row label="Egyházmegyék száma" value={data.dioceseCount.toLocaleString('hu-HU')} />
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
                {/* 2026-08-15 (Endre): a bankszámla NEM kötelező — ha üres, ezt
                    LÁTHATÓAN mondjuk ki, ne csak egy üres sor maradjon a helyén. */}
                {data.bank_fo_iban ? (
                  <Row
                    label={`${data.bank_nev || 'Bank'}${data.bank_fo_iban_valuta ? ` (${data.bank_fo_iban_valuta})` : ''}`}
                    value={data.bank_fo_iban}
                    mono
                    copyText={data.bank_fo_iban}
                    copyLabel={`${data.bank_nev || 'Bank'} IBAN`}
                  />
                ) : (
                  <Row label="Bankszámla" value="Még nincs megadva — később pótolható" />
                )}
              </Group>

              <Group icon={<Users className="size-4" />} title="Vezetés" accent="amber">
                <Row
                  label={data.puspok_cim ? `Püspök (${data.puspok_cim})` : 'Püspök'}
                  value={data.puspok_nev || undefined}
                />
                <Row label="Egyházkerületi adminisztrátor" value={data.adminisztrator_nev || undefined} />
                {data.szamvevo_nev ? <Row label="Egyházkerületi számvevő" value={data.szamvevo_nev} /> : null}
              </Group>

              {(data.pecset_url || data.alairas_url) && (
                <Group icon={<Stamp className="size-4" />} title="Irat-hitelesítés" accent="emerald">
                  <Row label="Pecsét" value={data.pecset_url ? 'Feltöltve' : undefined} />
                  <Row label="Aláírás" value={data.alairas_url ? 'Feltöltve' : undefined} />
                </Group>
              )}
            </div>

            <p className="px-1 text-center text-xs text-muted-foreground">
              Ez az ablak csak megtekintésre szolgál. A szerkesztés az Egyházkerület beállításai ablakban érhető el.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
