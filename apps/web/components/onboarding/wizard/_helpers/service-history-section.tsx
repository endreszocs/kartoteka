'use client'

/**
 * Szolgálati előzmények szakasz a Welcome wizard Step 3-ban (2026-05-05).
 *
 * Több korábbi szolgálati hely rögzítését teszi lehetővé. Mentés a
 * `pastor_service_history` táblába a `completeWizard()`-ban.
 *
 * UX:
 *   - Üres állapotban: "+ Új szolgálati hely hozzáadása" gomb
 *   - Hozzáadás után: kártya mezőkkel (hely, szerep, ev_tol, ev_ig, megjegyzes)
 *   - Az ev_ig opcionális — ha üresen marad, "jelenleg ott szolgál"
 *   - Sorrend: ahogy hozzáadták (a sorrend mező sorszámként megy a DB-be)
 */

import { History, MapPin } from 'lucide-react'

import {
  WizardSectionCard,
  WizardField,
  WizardListItem,
  WizardAddButton,
  WizardInputGrid,
  Input,
} from './wizard-ui'

export interface ServiceHistorySlot {
  hely: string
  szerep: string
  ev_tol: number | null
  ev_ig: number | null
  megjegyzes: string
  _clientKey: string
}

export function createEmptyServiceHistory(): ServiceHistorySlot {
  return {
    hely: '',
    szerep: '',
    ev_tol: null,
    ev_ig: null,
    megjegyzes: '',
    _clientKey: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
}

interface ServiceHistorySectionProps {
  items: ServiceHistorySlot[]
  onChange: (next: ServiceHistorySlot[]) => void
}

export function ServiceHistorySection({
  items,
  onChange,
}: ServiceHistorySectionProps) {
  function addItem() {
    onChange([...items, createEmptyServiceHistory()])
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, patch: Partial<ServiceHistorySlot>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function parseYear(value: string): number | null {
    if (!value.trim()) return null
    const n = parseInt(value, 10)
    if (Number.isNaN(n) || n < 1900 || n > 2100) return null
    return n
  }

  return (
    <WizardSectionCard
      icon={History}
      iconColor="text-amber-700"
      iconBg="bg-amber-50"
      title="Szolgálati előzmények (opcionális)"
      description="Korábbi szolgálati helyeid — gyülekezetek, intézmények, ahol szolgáltál. Külön-külön minden helyhez tartozó éveket. Ezt később is bővítheted a profilodban."
    >
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
          Egyelőre nincs felvéve korábbi szolgálati hely. Ha akarsz hozzáadni,
          kattints az alábbi gombra. Ezt a lépést későbbre is halaszthatod.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <WizardListItem
              key={item._clientKey}
              title={
                item.hely ||
                (item.szerep ? `${item.szerep}` : `Szolgálati hely #${idx + 1}`)
              }
              subtitle={
                item.ev_tol || item.ev_ig
                  ? `${item.ev_tol ?? '?'} – ${item.ev_ig ?? 'jelenleg'}${item.szerep ? ` • ${item.szerep}` : ''}`
                  : item.szerep || undefined
              }
              onRemove={() => removeItem(idx)}
            >
              <WizardField
                id={`srv-hely-${idx}`}
                label="Hely (gyülekezet, intézmény, város)"
                required
              >
                <Input
                  id={`srv-hely-${idx}`}
                  placeholder="pl. Kolozsvár-Alsóváros"
                  value={item.hely}
                  onChange={e => updateItem(idx, { hely: e.target.value })}
                />
              </WizardField>

              <WizardInputGrid cols={2}>
                <WizardField
                  id={`srv-szerep-${idx}`}
                  label="Szerep / titulus"
                  hint="pl. lelkipásztor, segédlelkész, káplán, intézményvezető"
                >
                  <Input
                    id={`srv-szerep-${idx}`}
                    placeholder="pl. segédlelkész"
                    value={item.szerep}
                    onChange={e => updateItem(idx, { szerep: e.target.value })}
                  />
                </WizardField>

                <WizardInputGrid cols={2}>
                  <WizardField
                    id={`srv-ev-tol-${idx}`}
                    label="Kezdő év"
                    hint="pl. 2015"
                  >
                    <Input
                      id={`srv-ev-tol-${idx}`}
                      type="number"
                      min={1900}
                      max={2100}
                      placeholder="2015"
                      value={item.ev_tol ?? ''}
                      onChange={e =>
                        updateItem(idx, { ev_tol: parseYear(e.target.value) })
                      }
                    />
                  </WizardField>
                  <WizardField
                    id={`srv-ev-ig-${idx}`}
                    label="Záró év"
                    hint="Hagyd üresen, ha jelenleg ott szolgálsz"
                  >
                    <Input
                      id={`srv-ev-ig-${idx}`}
                      type="number"
                      min={1900}
                      max={2100}
                      placeholder="2020"
                      value={item.ev_ig ?? ''}
                      onChange={e =>
                        updateItem(idx, { ev_ig: parseYear(e.target.value) })
                      }
                    />
                  </WizardField>
                </WizardInputGrid>
              </WizardInputGrid>

              <WizardField
                id={`srv-megjegyzes-${idx}`}
                label="Megjegyzés (opcionális)"
              >
                <textarea
                  id={`srv-megjegyzes-${idx}`}
                  className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="pl. Egyetemi gyakorlat alatt"
                  value={item.megjegyzes}
                  onChange={e =>
                    updateItem(idx, { megjegyzes: e.target.value })
                  }
                />
              </WizardField>
            </WizardListItem>
          ))}
        </div>
      )}

      <WizardAddButton
        onClick={addItem}
        label={
          items.length === 0
            ? 'Új szolgálati hely hozzáadása'
            : 'További szolgálati hely hozzáadása'
        }
      />

      {items.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <MapPin className="size-3.5" />
          <span>
            {items.length} korábbi szolgálati hely felvéve. Ezek a saját profilodban
            jelennek majd meg.
          </span>
        </p>
      )}
    </WizardSectionCard>
  )
}
