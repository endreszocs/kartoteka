'use client'

/**
 * Új érintetti kérelem rögzítése (2026-08-23).
 *
 * A határidő NEM beírható mező: a KÖZÖS MAG számolja a beérkezés dátumából
 * (beérkezés + 1 hónap), és az űrlap élőben KIÍRJA, mielőtt a lelkész menteni
 * tud. Így a törvényes határidő nem elgépelés kérdése, és a szerver ugyanazt a
 * függvényt hívja — a két felület nem húzhat szét.
 */

import { useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { rogzitsAdatvedelmiKerelmet } from '@/app/(dashboard)/admin/adatvedelem-actions'
import {
  KERELEM_TIPUSOK,
  KERELEM_TIPUS_CIMKE,
  ellenorizdUjKerelmet,
  hataridoSzamitas,
  type KerelemTipus,
  type UjKerelemBemenet,
} from '@/app/(dashboard)/admin/adatvedelem-shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { maiNap, magyarDatum } from './datum'

const MEZO_OSZTALY =
  'h-10 w-full rounded-xl border border-input/90 bg-card/78 px-3 text-sm text-foreground ' +
  'outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20'

interface KerelemUrlapProps {
  rendszergazda: boolean
  gyulekezetek: Array<{ id: string; nev: string }>
  sajatCongregationId: string | null
  onKesz: () => void
}

export function KerelemUrlap({
  rendszergazda,
  gyulekezetek,
  sajatCongregationId,
  onKesz,
}: KerelemUrlapProps) {
  const [nyitva, setNyitva] = useState(false)
  const [mentes, setMentes] = useState(false)
  const [congregationId, setCongregationId] = useState<string>(sajatCongregationId ?? '')
  const [erintettNeve, setErintettNeve] = useState('')
  const [erintettEmail, setErintettEmail] = useState('')
  const [kerelemTipusa, setKerelemTipusa] = useState<KerelemTipus>('hozzaferes')
  const [beerkezesDatuma, setBeerkezesDatuma] = useState(() => maiNap())
  const [megjegyzes, setMegjegyzes] = useState('')

  const hatarido = useMemo(() => hataridoSzamitas(beerkezesDatuma), [beerkezesDatuma])

  function urites() {
    setErintettNeve('')
    setErintettEmail('')
    setKerelemTipusa('hozzaferes')
    setBeerkezesDatuma(maiNap())
    setMegjegyzes('')
    setCongregationId(sajatCongregationId ?? '')
  }

  async function mentesInditasa() {
    const bemenet: UjKerelemBemenet = {
      congregationId: rendszergazda ? (congregationId || null) : sajatCongregationId,
      erintettNeve,
      erintettEmail: erintettEmail || null,
      kerelemTipusa,
      beerkezesDatuma,
      megjegyzes: megjegyzes || null,
    }
    // Ugyanaz az ellenőrzés fut itt és a szerveren — egy szabály, egy szöveg.
    const hiba = ellenorizdUjKerelmet(bemenet)
    if (hiba) {
      toast.error(hiba)
      return
    }
    setMentes(true)
    try {
      const eredmeny = await rogzitsAdatvedelmiKerelmet(bemenet)
      if (eredmeny.hiba) {
        toast.error(eredmeny.hiba)
        return
      }
      toast.success('A kérelem rögzítve — a határidő innentől követhető.')
      urites()
      setNyitva(false)
      onKesz()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setMentes(false)
    }
  }

  if (!nyitva) {
    return (
      <Button type="button" onClick={() => setNyitva(true)} className="gap-1.5">
        <Plus className="size-4" aria-hidden />
        Új kérelem rögzítése
      </Button>
    )
  }

  return (
    <div className="card-raised space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-base text-foreground">Új érintetti kérelem</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setNyitva(false)}>
          Mégsem
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="av-nev">Az érintett neve *</Label>
          <Input
            id="av-nev"
            value={erintettNeve}
            onChange={(e) => setErintettNeve(e.target.value)}
            placeholder="Aki a kérelmet benyújtotta"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="av-email">E-mail-cím (ha van)</Label>
          <Input
            id="av-email"
            type="email"
            value={erintettEmail}
            onChange={(e) => setErintettEmail(e.target.value)}
            placeholder="ide megy a válasz"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="av-tipus">Milyen kérelem? *</Label>
          <select
            id="av-tipus"
            className={MEZO_OSZTALY}
            value={kerelemTipusa}
            onChange={(e) => setKerelemTipusa(e.target.value as KerelemTipus)}
          >
            {KERELEM_TIPUSOK.map((t) => (
              <option key={t} value={t}>
                {KERELEM_TIPUS_CIMKE[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="av-beerkezes">Beérkezés dátuma *</Label>
          <Input
            id="av-beerkezes"
            type="date"
            value={beerkezesDatuma}
            onChange={(e) => setBeerkezesDatuma(e.target.value)}
          />
        </div>

        {rendszergazda ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="av-gyulekezet">Melyik egyházközséget érinti?</Label>
            <select
              id="av-gyulekezet"
              className={MEZO_OSZTALY}
              value={congregationId}
              onChange={(e) => setCongregationId(e.target.value)}
            >
              <option value="">Rendszerszintű kérelem (nem egy gyülekezethez tartozik)</option>
              {gyulekezetek.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nev}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="av-megjegyzes">Megjegyzés (mit kért pontosan, hogyan érkezett)</Label>
          <Textarea
            id="av-megjegyzes"
            value={megjegyzes}
            onChange={(e) => setMegjegyzes(e.target.value)}
            placeholder="Pl.: telefonon kérte a róla tárolt adatok másolatát; e-mailben visszaigazoltuk."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground ring-1 ring-inset ring-border">
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        <span>
          Törvényes válaszadási határidő:{' '}
          <strong className="text-foreground">
            {hatarido ? magyarDatum(hatarido) : 'a beérkezés dátuma hiányzik'}
          </strong>{' '}
          <span className="opacity-80">(a beérkezéstől számított egy hónap)</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={mentesInditasa} disabled={mentes}>
          {mentes ? 'Mentés…' : 'Kérelem rögzítése'}
        </Button>
      </div>
    </div>
  )
}
