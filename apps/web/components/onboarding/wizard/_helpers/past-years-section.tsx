'use client'

/**
 * Múlt évek egyházfenntartási beállításai szakasz a Welcome wizard
 * Step 4-ben (2026-05-05).
 *
 * 5 visszamenő évet kínál fel az aktuális évhez képest. Minden év:
 *   - alapösszeg (eves_jarulek)
 *   - kedvezményes összeg (jarulek_kedvezmenyes)
 *   - határidő (jarulek_hatarid, MM-DD)
 *
 * A `bealitas` táblába mentődik a `completeWizard()`-ban (id = év string,
 * congregation_id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid).
 *
 * Ha a tartozás-számítási mód `akkori`, a rendszer ezeket a beállításokat
 * használja a múlt évek tartozásának pontos kiszámítására.
 *
 * UX: minden évhez egy collapsible kártya. Üresen hagyható.
 */

import { useState } from 'react'
import { CalendarRange, ChevronDown, ChevronUp, Info } from 'lucide-react'

import {
  WizardSectionCard,
  WizardField,
  WizardInputGrid,
  WizardBanner,
  Input,
} from './wizard-ui'

export interface PastYearSlot {
  ev: number // év (pl. 2025)
  eves_jarulek: number | null
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string // MM-DD
}

export function buildPastYearsList(currentYear: number, count = 5): PastYearSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    ev: currentYear - (i + 1),
    eves_jarulek: null,
    jarulek_kedvezmenyes: null,
    jarulek_hatarid: '',
  }))
}

interface PastYearsSectionProps {
  years: PastYearSlot[]
  onChange: (next: PastYearSlot[]) => void
  /** Ha 'aktualis' a számítási mód, ez a szakasz NEM látszik (nem kell). */
  visible: boolean
}

export function PastYearsSection({
  years,
  onChange,
  visible,
}: PastYearsSectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (!visible) return null

  function updateYear(idx: number, patch: Partial<PastYearSlot>) {
    onChange(years.map((y, i) => (i === idx ? { ...y, ...patch } : y)))
  }

  const filledCount = years.filter(
    y => y.eves_jarulek || y.jarulek_kedvezmenyes || y.jarulek_hatarid,
  ).length

  return (
    <WizardSectionCard
      icon={CalendarRange}
      iconColor="text-sky-700"
      iconBg="bg-sky-50"
      title="Korábbi évek beállításai (opcionális)"
      description="Ha pontosan akarod kiszámolni a tagok régebbi tartozásait, add meg az előző 5 év járulékait. Ez az „akkori év szerint” számítási mód miatt fontos."
    >
      <WizardBanner tone="info" icon={Info}>
        <p>
          <strong>Mikor érdemes kitölteni?</strong> Ha vannak tagok, akiknek 1-5 évre
          visszamenő tartozása van, és pontosan szeretnéd látni mennyivel
          tartoznak. Ha most kezded a nyilvántartást vagy nincsenek régi
          tartozások, hagyd üresen — bármikor pótolható később.
        </p>
      </WizardBanner>

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50/40 p-3 text-sm font-medium text-sky-900 transition-colors hover:bg-sky-50"
      >
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          <span>
            {expanded ? 'Korábbi évek elrejtése' : 'Korábbi évek megnyitása'}
            {filledCount > 0 && (
              <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs">
                {filledCount} év kitöltve
              </span>
            )}
          </span>
        </span>
        <span className="text-xs text-sky-700/70">
          {years[0]?.ev ?? ''} – {years[years.length - 1]?.ev ?? ''}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {years.map((y, idx) => (
            <div
              key={y.ev}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h4 className="mb-3 text-sm font-semibold text-slate-800">
                {y.ev}. év
              </h4>
              <WizardInputGrid cols={3}>
                <WizardField
                  id={`past-${y.ev}-jarulek`}
                  label="Alapösszeg (RON)"
                  hint={`A ${y.ev} évi éves járulék`}
                >
                  <Input
                    id={`past-${y.ev}-jarulek`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="120"
                    value={y.eves_jarulek ?? ''}
                    onChange={e =>
                      updateYear(idx, {
                        eves_jarulek: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </WizardField>
                <WizardField
                  id={`past-${y.ev}-kedv`}
                  label="Kedvezményes (RON)"
                  hint="Ha volt kedvezmény"
                >
                  <Input
                    id={`past-${y.ev}-kedv`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="60"
                    value={y.jarulek_kedvezmenyes ?? ''}
                    onChange={e =>
                      updateYear(idx, {
                        jarulek_kedvezmenyes: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </WizardField>
                <WizardField
                  id={`past-${y.ev}-hatarid`}
                  label="Határidő (MM-DD)"
                  hint="pl. 07-01"
                >
                  <Input
                    id={`past-${y.ev}-hatarid`}
                    placeholder="07-01"
                    value={y.jarulek_hatarid}
                    onChange={e =>
                      updateYear(idx, { jarulek_hatarid: e.target.value })
                    }
                  />
                </WizardField>
              </WizardInputGrid>
            </div>
          ))}
        </div>
      )}
    </WizardSectionCard>
  )
}
