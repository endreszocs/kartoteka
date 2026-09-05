'use client'

/**
 * Szolgálati előzmények SOR-SZERKESZTŐ a profil-dialógus Szerkesztés fülére
 * (2026-09-05, profil-kör D3).
 *
 * MIÉRT: a Szerkesztés fül eddig egyetlen vesszős szöveg-mezőt írt a legacy
 * `pastor_profiles.previous_service_places` tömbbe, miközben a Szolgálat fül a
 * strukturált `pastor_service_history` táblát mutatta — a mentés láthatatlan
 * volt, és a vesszős helynév („Kolozsvár, Alsóváros") kettéesett. Mostantól a
 * strukturált tábla a kanonikus, és ez a szerkesztő írja.
 *
 * A sor-modell és a kulcs-gyár a welcome-varázslóé (`ServiceHistorySlot`,
 * `createEmptyServiceHistory`) — egy igazságforrás; csak a megjelenítés más
 * (a modal Input/Label primitívei, a varázsló kártya-stílusa nélkül).
 *
 * ⛔ React-kulcs SOHA nem gépelt tartalomból (`_clientKey`) — különben a sor
 *    újra-mountol és a fókusz elvész gépelés közben.
 */

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createEmptyServiceHistory,
  type ServiceHistorySlot,
} from '@/components/onboarding/wizard/_helpers/service-history-section'

export type { ServiceHistorySlot }
export { createEmptyServiceHistory }

interface Props {
  items: ServiceHistorySlot[]
  onChange: (next: ServiceHistorySlot[]) => void
  /** Mezőnkénti hibák a szerverről: kulcs `serviceHistory.<index>.<mező>` vagy `serviceHistory.<index>`. */
  errors?: Record<string, string>
  disabled?: boolean
}

// A részleges beírást („2", „20", „201") NEM dobjuk null-ra — a kontrollált
// mező különben nem lenne írható; a tartomány-ellenőrzés a zod-sémáé.
function parseYear(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = parseInt(trimmed, 10)
  return Number.isNaN(n) ? null : n
}

export function ServiceHistoryEditor({ items, onChange, errors = {}, disabled = false }: Props) {
  function addItem() {
    onChange([...items, createEmptyServiceHistory()])
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function updateItem(idx: number, patch: Partial<ServiceHistorySlot>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const hiba = (idx: number, mezo: string) => errors[`serviceHistory.${idx}.${mezo}`] || undefined
  const sorHiba = (idx: number) => errors[`serviceHistory.${idx}`] || undefined

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Még nincs felvéve korábbi szolgálati hely. A gombbal vehetsz fel egyet — hely, szerep és évek.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li key={item._clientKey} className="min-w-0 space-y-3 rounded-2xl border border-border bg-muted/40 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {idx + 1}. szolgálati hely
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 min-w-11 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeItem(idx)}
                  disabled={disabled}
                  aria-label={`${idx + 1}. szolgálati hely törlése`}
                >
                  <Trash2 className="size-4" />
                  <span className="hidden sm:inline">Törlés</span>
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`sh-hely-${item._clientKey}`}>Hely (gyülekezet, intézmény, város)</Label>
                <Input
                  id={`sh-hely-${item._clientKey}`}
                  value={item.hely}
                  onChange={(e) => updateItem(idx, { hely: e.target.value })}
                  placeholder="pl. Kolozsvár-Alsóváros"
                  aria-invalid={Boolean(hiba(idx, 'hely'))}
                  disabled={disabled}
                />
                {hiba(idx, 'hely') && <p className="text-xs text-destructive">{hiba(idx, 'hely')}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`sh-szerep-${item._clientKey}`}>Szerep / titulus</Label>
                  <Input
                    id={`sh-szerep-${item._clientKey}`}
                    value={item.szerep}
                    onChange={(e) => updateItem(idx, { szerep: e.target.value })}
                    placeholder="pl. segédlelkész"
                    aria-invalid={Boolean(hiba(idx, 'szerep'))}
                    disabled={disabled}
                  />
                  {hiba(idx, 'szerep') && <p className="text-xs text-destructive">{hiba(idx, 'szerep')}</p>}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`sh-evtol-${item._clientKey}`}>Kezdő év</Label>
                  <Input
                    id={`sh-evtol-${item._clientKey}`}
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={2100}
                    value={item.ev_tol ?? ''}
                    onChange={(e) => updateItem(idx, { ev_tol: parseYear(e.target.value) })}
                    placeholder="2015"
                    aria-invalid={Boolean(hiba(idx, 'evTol'))}
                    disabled={disabled}
                  />
                  {hiba(idx, 'evTol') && <p className="text-xs text-destructive">{hiba(idx, 'evTol')}</p>}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`sh-evig-${item._clientKey}`}>Záró év</Label>
                  <Input
                    id={`sh-evig-${item._clientKey}`}
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={2100}
                    value={item.ev_ig ?? ''}
                    onChange={(e) => updateItem(idx, { ev_ig: parseYear(e.target.value) })}
                    placeholder="üres = jelenleg"
                    aria-invalid={Boolean(hiba(idx, 'evIg'))}
                    disabled={disabled}
                  />
                  {hiba(idx, 'evIg') && <p className="text-xs text-destructive">{hiba(idx, 'evIg')}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`sh-megj-${item._clientKey}`}>Megjegyzés (opcionális)</Label>
                <Input
                  id={`sh-megj-${item._clientKey}`}
                  value={item.megjegyzes}
                  onChange={(e) => updateItem(idx, { megjegyzes: e.target.value })}
                  placeholder="pl. egyetemi gyakorlat alatt"
                  aria-invalid={Boolean(hiba(idx, 'megjegyzes'))}
                  disabled={disabled}
                />
                {hiba(idx, 'megjegyzes') && <p className="text-xs text-destructive">{hiba(idx, 'megjegyzes')}</p>}
              </div>
              {sorHiba(idx) && <p className="text-xs text-destructive">{sorHiba(idx)}</p>}
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="h-11 gap-2" onClick={addItem} disabled={disabled}>
        <Plus className="size-4" />
        {items.length === 0 ? 'Szolgálati hely hozzáadása' : 'További szolgálati hely'}
      </Button>
      {errors.serviceHistory && <p className="text-xs text-destructive">{errors.serviceHistory}</p>}
    </div>
  )
}
