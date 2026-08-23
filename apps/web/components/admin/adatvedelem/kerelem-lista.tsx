'use client'

/**
 * Érintetti kérelmek listája + állapot-váltás (2026-08-23).
 *
 * A lista HATÁRIDŐ SZERINT rendezett (legsürgetőbb elöl, a lezártak hátul), és
 * minden soron LÁTHATÓ a határidő állapota:
 *   · piros  — lejárt
 *   · sárga  — 7 napon belül jár le
 *   · kék    — még bőven van idő
 *   · zöld   — lezárva
 *
 * A besorolást a KÖZÖS MAG (`adatvedelem-shared.ts`) végzi, ugyanaz a függvény,
 * amit az őrszem tesztel — a színezés tehát nem „szemre" történik.
 */

import { useState } from 'react'
import { CircleCheck, Inbox, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  torolAdatvedelmiKerelmet,
  valtsdAdatvedelmiKerelemAllapotat,
} from '@/app/(dashboard)/admin/adatvedelem-actions'
import {
  KERELEM_ALLAPOTOK,
  KERELEM_ALLAPOT_CIMKE,
  KERELEM_TIPUS_CIMKE,
  ellenorizdAllapotValtast,
  hataridoAllapot,
  kellTeljesitesDatum,
  lezartAllapot,
  type AdatvedelmiKerelemSor,
  type KerelemAllapot,
} from '@/app/(dashboard)/admin/adatvedelem-shared'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { maiNap, magyarDatum } from './datum'

const MEZO_OSZTALY =
  'h-10 w-full rounded-xl border border-input/90 bg-card/78 px-3 text-sm text-foreground ' +
  'outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20'

interface KerelemListaProps {
  sorok: AdatvedelmiKerelemSor[]
  /** A mai nap — a szülő adja, hogy minden sor UGYANAZT a napot használja. */
  ma: string
  rendszergazda: boolean
  onValtozas: () => void
}

export function KerelemLista({ sorok, ma, rendszergazda, onValtozas }: KerelemListaProps) {
  if (sorok.length === 0) {
    return (
      <AdminEmptyState
        icon={Inbox}
        title="Még egyetlen érintetti kérelem sincs rögzítve"
        hint={
          'Ide kerül minden olyan megkeresés, amelyben valaki a róla tárolt adatokról kérdez, ' +
          'javítást, törlést vagy korlátozást kér. A rögzítés a bizonyíték: a törvény szerint ' +
          'egy hónapon belül válaszolni kell, és igazolni kell tudni, hogy válaszoltunk.'
        }
      />
    )
  }

  return (
    <ul className="space-y-3">
      {sorok.map((sor) => (
        <KerelemKartya
          key={sor.id}
          sor={sor}
          ma={ma}
          rendszergazda={rendszergazda}
          onValtozas={onValtozas}
        />
      ))}
    </ul>
  )
}

function KerelemKartya({
  sor,
  ma,
  rendszergazda,
  onValtozas,
}: {
  sor: AdatvedelmiKerelemSor
  ma: string
  rendszergazda: boolean
  onValtozas: () => void
}) {
  const [nyitva, setNyitva] = useState(false)
  const [mentes, setMentes] = useState(false)
  const [allapot, setAllapot] = useState<KerelemAllapot>(sor.allapot)
  const [teljesites, setTeljesites] = useState<string>(sor.teljesitesDatuma ?? maiNap())
  const [megjegyzes, setMegjegyzes] = useState<string>(sor.megjegyzes ?? '')

  const ertekeles = hataridoAllapot({ hatarido: sor.hatarido, ma, allapot: sor.allapot })
  const lezar = kellTeljesitesDatum(allapot)

  async function mentesInditasa() {
    const bemenet = {
      id: sor.id,
      allapot,
      teljesitesDatuma: lezar ? teljesites : null,
      megjegyzes: megjegyzes || null,
    }
    const hiba = ellenorizdAllapotValtast(bemenet)
    if (hiba) {
      toast.error(hiba)
      return
    }
    setMentes(true)
    try {
      const eredmeny = await valtsdAdatvedelmiKerelemAllapotat(bemenet)
      if (eredmeny.hiba) {
        toast.error(eredmeny.hiba)
        return
      }
      toast.success('Az állapot mentve.')
      setNyitva(false)
      onValtozas()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setMentes(false)
    }
  }

  async function torles() {
    if (
      !window.confirm(
        'Biztosan törlöd ezt a kérelmet? A napló bizonyíték-értékű — csak elgépelés javítására töröljünk.',
      )
    ) {
      return
    }
    setMentes(true)
    try {
      const eredmeny = await torolAdatvedelmiKerelmet(sor.id)
      if (eredmeny.hiba) {
        toast.error(eredmeny.hiba)
        return
      }
      toast.success('A kérelem törölve.')
      onValtozas()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A törlés nem sikerült.')
    } finally {
      setMentes(false)
    }
  }

  return (
    <li className="card-raised overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-base text-foreground">{sor.erintettNeve}</p>
            <StatusBadge intent={ertekeles.intent} dot>
              {ertekeles.cimke}
            </StatusBadge>
            <StatusBadge intent={lezartAllapot(sor.allapot) ? 'success' : 'neutral'}>
              {KERELEM_ALLAPOT_CIMKE[sor.allapot]}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {KERELEM_TIPUS_CIMKE[sor.kerelemTipusa]}
            {sor.erintettEmail ? ' · ' + sor.erintettEmail : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Beérkezett: <span className="tabular-nums">{magyarDatum(sor.beerkezesDatuma)}</span>
            {' · '}
            Határidő: <span className="tabular-nums">{magyarDatum(sor.hatarido)}</span>
            {sor.teljesitesDatuma ? (
              <>
                {' · '}Teljesítve:{' '}
                <span className="tabular-nums">{magyarDatum(sor.teljesitesDatuma)}</span>
              </>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {sor.congregationId
              ? 'Egyházközség: ' + (sor.congregationNev || 'ismeretlen')
              : 'Rendszerszintű kérelem (nem egy gyülekezethez tartozik)'}
            {sor.intezteNev ? ' · Intézi: ' + sor.intezteNev : ''}
          </p>
          {sor.megjegyzes ? (
            <p className="mt-1 whitespace-pre-line rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground ring-1 ring-inset ring-border">
              {sor.megjegyzes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="lg" variant="outline" onClick={() => setNyitva((v) => !v)}>
            {nyitva ? 'Bezárás' : 'Állapot módosítása'}
          </Button>
          {rendszergazda ? (
            <Button
              type="button"
              size="lg"
              variant="destructive"
              onClick={torles}
              disabled={mentes}
              aria-label="Kérelem törlése"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {nyitva ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={'allapot-' + sor.id}>Állapot</Label>
            <select
              id={'allapot-' + sor.id}
              className={MEZO_OSZTALY}
              value={allapot}
              onChange={(e) => setAllapot(e.target.value as KerelemAllapot)}
            >
              {KERELEM_ALLAPOTOK.map((a) => (
                <option key={a} value={a}>
                  {KERELEM_ALLAPOT_CIMKE[a]}
                </option>
              ))}
            </select>
          </div>

          {lezar ? (
            <div className="space-y-1.5">
              <Label htmlFor={'teljesites-' + sor.id}>Teljesítés (válaszadás) dátuma *</Label>
              <Input
                id={'teljesites-' + sor.id}
                type="date"
                value={teljesites}
                onChange={(e) => setTeljesites(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">
                Nyitott állapothoz nem tartozik teljesítés-dátum — az csak lezáráskor kerül be.
              </p>
            </div>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={'megjegyzes-' + sor.id}>Megjegyzés (mit válaszoltunk)</Label>
            <textarea
              id={'megjegyzes-' + sor.id}
              className="min-h-[88px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="button" size="lg" onClick={mentesInditasa} disabled={mentes}>
              <CircleCheck className="size-4" aria-hidden />
              {mentes ? 'Mentés…' : 'Mentés'}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
