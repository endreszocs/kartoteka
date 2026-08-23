'use client'

/**
 * Adatvédelmi napló — a felület gerince (2026-08-23).
 *
 * Két napló egy oldalon:
 *   1. ÉRINTETTI KÉRELMEK — határidő-követéssel (GDPR 12(3) + 5(2) cikk).
 *   2. ÁSZF-ELFOGADÁSOK — ki, mikor, melyik verziót (ÁSZF 13. pont).
 *
 * ⚠️ EZ A KÓD ELŐBB MEGY ÉLESBE, MINT AZ SQL. Ha a tábla még hiányzik, a
 * szerver-akció `akadaly: 'tabla_hianyzik'`-kel tér vissza, és ITT egy nyugodt
 * magyar magyarázat jelenik meg — nem piros hibaoldal, nem néma üres lista.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClockAlert, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import {
  listAdatvedelmiKerelmek,
  listAszfElfogadasok,
} from '@/app/(dashboard)/admin/adatvedelem-actions'
import {
  kerelemOsszesito,
  type AdatvedelemAkadaly,
  type AdatvedelmiKerelemSor,
  type AszfElfogadasSor,
} from '@/app/(dashboard)/admin/adatvedelem-shared'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { Button } from '@/components/ui/button'

import { AkadalyPanel } from './akadaly-panel'
import { AszfNaplo } from './aszf-naplo'
import { KerelemLista } from './kerelem-lista'
import { KerelemUrlap } from './kerelem-urlap'
import { maiNap } from './datum'

type Ful = 'kerelmek' | 'aszf'

export function AdatvedelemPanel() {
  const [ful, setFul] = useState<Ful>('kerelmek')

  const [betoltes, setBetoltes] = useState(true)
  const [sorok, setSorok] = useState<AdatvedelmiKerelemSor[]>([])
  const [akadaly, setAkadaly] = useState<AdatvedelemAkadaly>('nincs_akadaly')
  const [akadalyUzenet, setAkadalyUzenet] = useState<string | null>(null)
  const [rendszergazda, setRendszergazda] = useState(false)
  const [gyulekezetek, setGyulekezetek] = useState<Array<{ id: string; nev: string }>>([])
  const [sajatCongregationId, setSajatCongregationId] = useState<string | null>(null)

  const [aszfBetoltes, setAszfBetoltes] = useState(true)
  const [aszfSorok, setAszfSorok] = useState<AszfElfogadasSor[]>([])
  const [aszfAkadaly, setAszfAkadaly] = useState<AdatvedelemAkadaly>('nincs_akadaly')
  const [aszfUzenet, setAszfUzenet] = useState<string | null>(null)

  // A „ma" EGYETLEN helyen keletkezik, és minden sor ugyanazt kapja — így nem
  // fordulhat elő, hogy két sor két különböző naphoz képest számol.
  const [ma, setMa] = useState<string>('')

  const toltsKerelmeket = useCallback(async () => {
    setBetoltes(true)
    try {
      const eredmeny = await listAdatvedelmiKerelmek()
      setAkadaly(eredmeny.akadaly ?? 'nincs_akadaly')
      setAkadalyUzenet(eredmeny.uzenet ?? null)
      setSorok(eredmeny.sorok ?? [])
      setRendszergazda(Boolean(eredmeny.rendszergazda))
      setGyulekezetek(eredmeny.osszesGyulekezet ?? [])
      setSajatCongregationId(eredmeny.sajatCongregationId ?? null)
    } catch (e) {
      setAkadaly('adatbazis_hiba')
      setAkadalyUzenet(e instanceof Error ? e.message : 'Ismeretlen hiba.')
      setSorok([])
    } finally {
      setBetoltes(false)
    }
  }, [])

  const toltsAszfot = useCallback(async () => {
    setAszfBetoltes(true)
    try {
      const eredmeny = await listAszfElfogadasok()
      setAszfAkadaly(eredmeny.akadaly ?? 'nincs_akadaly')
      setAszfUzenet(eredmeny.uzenet ?? null)
      setAszfSorok(eredmeny.sorok ?? [])
    } catch (e) {
      setAszfAkadaly('adatbazis_hiba')
      setAszfUzenet(e instanceof Error ? e.message : 'Ismeretlen hiba.')
      setAszfSorok([])
    } finally {
      setAszfBetoltes(false)
    }
  }, [])

  useEffect(() => {
    setMa(maiNap())
    void toltsKerelmeket()
    void toltsAszfot()
  }, [toltsKerelmeket, toltsAszfot])

  const osszesito = useMemo(() => kerelemOsszesito(sorok, ma), [sorok, ma])

  const frissites = useCallback(() => {
    setMa(maiNap())
    void toltsKerelmeket()
    void toltsAszfot()
    toast.success('Frissítve.')
  }, [toltsKerelmeket, toltsAszfot])

  return (
    <div className="space-y-4">
      {/* Összesítő — a lelkész elsőként ezt nézi meg */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <OsszesitoCsempe cimke="Nyitott kérelem" ertek={osszesito.nyitott} hangulat="semleges" />
        <OsszesitoCsempe
          cimke="7 napon belül lejár"
          ertek={osszesito.kozelgo}
          hangulat={osszesito.kozelgo > 0 ? 'figyelem' : 'semleges'}
        />
        <OsszesitoCsempe
          cimke="Lejárt határidő"
          ertek={osszesito.lejart}
          hangulat={osszesito.lejart > 0 ? 'veszely' : 'semleges'}
        />
        <OsszesitoCsempe cimke="Lezárt ügy" ertek={osszesito.lezart} hangulat="siker" />
      </div>

      {/* Fülek + frissítés */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted/70 p-1 ring-1 ring-inset ring-border">
          <FulGomb aktiv={ful === 'kerelmek'} onClick={() => setFul('kerelmek')} ikon={ClockAlert}>
            Érintetti kérelmek
          </FulGomb>
          <FulGomb aktiv={ful === 'aszf'} onClick={() => setFul('aszf')} ikon={ScrollText}>
            ÁSZF-elfogadások
          </FulGomb>
        </div>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={frissites}
          className="ml-auto gap-1.5"
        >
          <RefreshCw className="size-4" aria-hidden />
          Frissítés
        </Button>
      </div>

      {ful === 'kerelmek' ? (
        <div className="space-y-4">
          <AkadalyPanel akadaly={akadaly} uzenet={akadalyUzenet} />

          {akadaly === 'nincs_akadaly' ? (
            <>
              <KerelemUrlap
                rendszergazda={rendszergazda}
                gyulekezetek={gyulekezetek}
                sajatCongregationId={sajatCongregationId}
                onKesz={() => void toltsKerelmeket()}
              />
              {betoltes ? (
                <AdminSkeleton rows={4} />
              ) : (
                <KerelemLista
                  sorok={sorok}
                  ma={ma}
                  rendszergazda={rendszergazda}
                  onValtozas={() => void toltsKerelmeket()}
                />
              )}
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground ring-1 ring-inset ring-border">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="leading-relaxed">
              Az ÁSZF 13. pontja szerint a rendszer további használata elfogadásnak minősül. Ez a
              napló azt bizonyítja, ki, mikor és <strong>melyik verziót</strong> látta. IP-címet és
              böngésző-azonosítót szándékosan nem tárolunk — azokat az Adatvédelmi tájékoztató nem
              sorolja fel az adatkörök között.
            </p>
          </div>
          <AkadalyPanel akadaly={aszfAkadaly} uzenet={aszfUzenet} />
          {aszfAkadaly === 'nincs_akadaly' ? (
            <AszfNaplo sorok={aszfSorok} betoltes={aszfBetoltes} />
          ) : null}
        </div>
      )}
    </div>
  )
}

const HANGULAT_OSZTALY: Record<'semleges' | 'figyelem' | 'veszely' | 'siker', string> = {
  semleges: 'bg-muted/60 ring-border text-foreground',
  figyelem:
    'bg-amber-50 ring-amber-500/25 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/30',
  veszely:
    'bg-rose-50 ring-rose-500/20 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/30',
  siker:
    'bg-emerald-50 ring-emerald-600/20 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/30',
}

function OsszesitoCsempe({
  cimke,
  ertek,
  hangulat,
}: {
  cimke: string
  ertek: number
  hangulat: 'semleges' | 'figyelem' | 'veszely' | 'siker'
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ring-1 ring-inset ${HANGULAT_OSZTALY[hangulat]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">{cimke}</p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums">{ertek}</p>
    </div>
  )
}

function FulGomb({
  aktiv,
  onClick,
  ikon: Ikon,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  ikon: typeof ClockAlert
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ' +
        (aktiv
          ? 'bg-background text-foreground shadow-sm ring-1 ring-inset ring-border'
          : 'text-muted-foreground hover:text-foreground')
      }
    >
      <Ikon className="size-3.5" aria-hidden />
      {children}
    </button>
  )
}
