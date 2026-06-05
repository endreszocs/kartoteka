'use client'

/**
 * Egyházfenntartási kedvezmények szakasz a Welcome wizard Step 4-ben (2026-05-05).
 *
 * Két jól elválasztott kedvezmény-típus:
 *   - Időszaki kedvezmény (early-bird): határidő (MM-DD) + kedvezményes összeg
 *     Pl. "Március 31-ig fizet → 60 RON; április után → teljes 120 RON"
 *   - Kor-alapú kedvezmény (egyszeres, opcionális): pl. 70 év felettieknek 50%
 *
 * A `jarulek_kedvezmeny` táblába mentődik az aktuális év `current_year`-ére
 * a `completeWizard()`-ban. Több időszaki kedvezmény is rögzíthető (pl.
 * "május végéig 50% kedvezmény, június végéig 25% kedvezmény").
 */

import { Tags, Calendar, Info, UserCheck } from 'lucide-react'

import {
  WizardSectionCard,
  WizardField,
  WizardListItem,
  WizardAddButton,
  WizardInputGrid,
  WizardBanner,
  Input,
} from './wizard-ui'

export interface DiscountPeriodSlot {
  hatarid: string // MM-DD formátum
  kedv_osszeg: number // teljes RON összeg (NEM százalék) — egyszerűbb pasztorálisan
  _clientKey: string
}

export interface AgeDiscountSlot {
  enabled: boolean
  kor_tol: number | null // alsó kor (pl. 70)
  szazalek: number | null // pl. 50 = 50% kedvezmény
  fix_osszeg: number | null // VAGY fix RON összeg (alternatíva a százaléknak)
  /** UI: százalék vagy fix összeg típus választása */
  type: 'percent' | 'fix'
}

export interface OccupationDiscountSlot {
  /** Vesszővel elválasztott foglalkozás-kulcsszavak, pl. "tanuló, diák". A
   *  rendszer a tag `foglalkozas` mezőjét hasonlítja ezekhez (ékezet/kisbetű-
   *  érzéketlenül, teljes szó egyezéssel). */
  foglalkozasok: string
  /** 'nem_fizet' → 0 RON (mentesül); 'fix' → a megadott összeget fizeti. */
  mode: 'nem_fizet' | 'fix'
  fix_osszeg: number | null
  _clientKey: string
}

export function createEmptyDiscountPeriod(): DiscountPeriodSlot {
  return {
    hatarid: '',
    kedv_osszeg: 0,
    _clientKey: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
}

export function createDefaultAgeDiscount(): AgeDiscountSlot {
  return {
    enabled: false,
    kor_tol: 70,
    szazalek: 50,
    fix_osszeg: null,
    type: 'percent',
  }
}

export function createEmptyOccupationDiscount(): OccupationDiscountSlot {
  return {
    foglalkozasok: '',
    mode: 'nem_fizet',
    fix_osszeg: null,
    _clientKey: `occ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
}

interface FeeDiscountsSectionProps {
  periods: DiscountPeriodSlot[]
  ageDiscount: AgeDiscountSlot
  /** 2026-06-05: foglalkozás-alapú kedvezmény (pl. tanuló/diák → nem fizet). */
  occupationDiscounts: OccupationDiscountSlot[]
  onPeriodsChange: (next: DiscountPeriodSlot[]) => void
  onAgeChange: (next: AgeDiscountSlot) => void
  onOccupationChange: (next: OccupationDiscountSlot[]) => void
}

export function FeeDiscountsSection({
  periods,
  ageDiscount,
  occupationDiscounts,
  onPeriodsChange,
  onAgeChange,
  onOccupationChange,
}: FeeDiscountsSectionProps) {
  function addPeriod() {
    onPeriodsChange([...periods, createEmptyDiscountPeriod()])
  }
  function removePeriod(idx: number) {
    onPeriodsChange(periods.filter((_, i) => i !== idx))
  }
  function updatePeriod(idx: number, patch: Partial<DiscountPeriodSlot>) {
    onPeriodsChange(periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  function addOccupation() {
    onOccupationChange([...occupationDiscounts, createEmptyOccupationDiscount()])
  }
  function removeOccupation(idx: number) {
    onOccupationChange(occupationDiscounts.filter((_, i) => i !== idx))
  }
  function updateOccupation(idx: number, patch: Partial<OccupationDiscountSlot>) {
    onOccupationChange(
      occupationDiscounts.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    )
  }

  return (
    <>
      {/* Foglalkozás-alapú kedvezmény (pl. tanuló/diák → nem fizet) */}
      <WizardSectionCard
        icon={Tags}
        iconColor="text-amber-700"
        iconBg="bg-amber-50"
        title="Foglalkozás-alapú kedvezmény (opcionális)"
        description="Adott foglalkozású tagok automatikus kedvezménye — pl. a tanulók/diákok nem fizetnek, vagy csökkentett összeget fizetnek."
      >
        <WizardBanner tone="info" icon={Info}>
          <p>
            <strong>Hogyan működik?</strong> Megadsz egy vagy több foglalkozást
            (pl. <em>tanuló, diák</em>), és hogy ők mennyit fizetnek. A rendszer a
            tag <strong>Foglalkozás</strong> mezőjéhez hasonlítja — ezt a
            Tagnyilvántartásban töltöd ki tagonként.
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>
              Több kulcsszót <strong>vesszővel</strong> sorolj fel
              (pl. <code>tanuló, diák, egyetemista</code>) — bármelyikre illeszkedik.
            </li>
            <li>
              Az egyezés <strong>ékezet- és kisbetű-érzéketlen</strong>, de teljes
              szóra megy: a tag foglalkozása pontosan egyezzen valamelyik kulcsszóval.
            </li>
            <li>
              Egyéni eseteket (egy-egy konkrét tag) a Tagnyilvántartásban,
              felmentéssel is kezelhetsz.
            </li>
          </ul>
        </WizardBanner>

        {occupationDiscounts.length > 0 && (
          <div className="space-y-3">
            {occupationDiscounts.map((o, idx) => (
              <WizardListItem
                key={o._clientKey}
                title={o.foglalkozasok || `Új foglalkozás-kedvezmény #${idx + 1}`}
                subtitle={
                  o.mode === 'nem_fizet'
                    ? 'Nem fizet (mentesül)'
                    : `Fix összeg: ${o.fix_osszeg || 0} RON`
                }
                onRemove={() => removeOccupation(idx)}
              >
                <WizardField
                  id={`occ-fogl-${idx}`}
                  label="Foglalkozás(ok)"
                  required
                  hint="Vesszővel elválasztva, pl. tanuló, diák"
                >
                  <Input
                    id={`occ-fogl-${idx}`}
                    placeholder="tanuló, diák"
                    value={o.foglalkozasok}
                    onChange={e =>
                      updateOccupation(idx, { foglalkozasok: e.target.value })
                    }
                  />
                </WizardField>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    Mennyit fizetnek?
                  </p>
                  <div className="flex gap-2">
                    <label
                      className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                        o.mode === 'nem_fizet'
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`occ-mode-${idx}`}
                        className="size-4"
                        checked={o.mode === 'nem_fizet'}
                        onChange={() => updateOccupation(idx, { mode: 'nem_fizet' })}
                      />
                      <span>Nem fizet (0 RON)</span>
                    </label>
                    <label
                      className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                        o.mode === 'fix'
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`occ-mode-${idx}`}
                        className="size-4"
                        checked={o.mode === 'fix'}
                        onChange={() => updateOccupation(idx, { mode: 'fix' })}
                      />
                      <span>Csökkentett fix összeg</span>
                    </label>
                  </div>
                </div>

                {o.mode === 'fix' && (
                  <WizardField
                    id={`occ-osszeg-${idx}`}
                    label="Fix kedvezményes összeg (RON)"
                    required
                    hint="Ennyit kell fizetnie az ilyen foglalkozású tagoknak."
                  >
                    <Input
                      id={`occ-osszeg-${idx}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="60"
                      value={o.fix_osszeg ?? ''}
                      onChange={e =>
                        updateOccupation(idx, {
                          fix_osszeg: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </WizardField>
                )}
              </WizardListItem>
            ))}
          </div>
        )}

        <WizardAddButton
          onClick={addOccupation}
          label={
            occupationDiscounts.length === 0
              ? 'Foglalkozás-alapú kedvezmény hozzáadása'
              : 'További foglalkozás hozzáadása'
          }
        />
      </WizardSectionCard>

      {/* Időszaki kedvezmények */}
      <WizardSectionCard
        icon={Calendar}
        iconColor="text-violet-700"
        iconBg="bg-violet-50"
        title="Kedvezményes időszakok (opcionális)"
        description="Adott határidőig kedvezményes összeggel fizethetnek a tagok. Több időszak is felvehető — pl. március 31-ig 50%, május 31-ig 25%."
      >
        <WizardBanner tone="info">
          <p>
            <strong>Hogyan működik?</strong> A tagnyilvántartásban minden tagra
            automatikusan kiszámolódik, mennyi a járuléka. Ha a tag a megadott
            határidő (pl. <code>03-31</code>) <em>előtt</em> fizet, akkor a
            kedvezményes összeg jár. Egyébként a teljes éves járulékot
            kell befizetnie.
          </p>
        </WizardBanner>

        {periods.length > 0 && (
          <div className="space-y-3">
            {periods.map((p, idx) => (
              <WizardListItem
                key={p._clientKey}
                title={
                  p.hatarid
                    ? `${p.hatarid} – ${p.kedv_osszeg || 0} RON`
                    : `Új időszaki kedvezmény #${idx + 1}`
                }
                subtitle="Aki ezelőtt a határidő előtt fizet, ennyit fizet."
                onRemove={() => removePeriod(idx)}
              >
                <WizardInputGrid cols={2}>
                  <WizardField
                    id={`disc-hatarid-${idx}`}
                    label="Határidő (MM-DD)"
                    required
                    hint="Hónap-Nap formátum, pl. 03-31"
                  >
                    <Input
                      id={`disc-hatarid-${idx}`}
                      placeholder="03-31"
                      value={p.hatarid}
                      onChange={e =>
                        updatePeriod(idx, { hatarid: e.target.value })
                      }
                    />
                  </WizardField>
                  <WizardField
                    id={`disc-osszeg-${idx}`}
                    label="Kedvezményes összeg (RON)"
                    required
                  >
                    <Input
                      id={`disc-osszeg-${idx}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="60"
                      value={p.kedv_osszeg || ''}
                      onChange={e =>
                        updatePeriod(idx, {
                          kedv_osszeg: Number(e.target.value),
                        })
                      }
                    />
                  </WizardField>
                </WizardInputGrid>
              </WizardListItem>
            ))}
          </div>
        )}

        <WizardAddButton
          onClick={addPeriod}
          label={
            periods.length === 0
              ? 'Új kedvezményes időszak hozzáadása'
              : 'További időszak hozzáadása'
          }
        />
      </WizardSectionCard>

      {/* Kor-alapú kedvezmény */}
      <WizardSectionCard
        icon={UserCheck}
        iconColor="text-emerald-700"
        iconBg="bg-emerald-50"
        title="Kor-alapú kedvezmény — pl. nyugdíjasok (opcionális)"
        description="A nyugdíjas / idős tagok automatikus kedvezménye egy KORHATÁR alapján. A tag korát a rendszer a születési dátumból számolja, így ehhez nem kell külön jelölni, ki nyugdíjas — csak a korhatárt add meg (pl. 65 év). Egyéni eseteket a Tagnyilvántartásban finomíthatsz."
      >
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={ageDiscount.enabled}
            onChange={e =>
              onAgeChange({ ...ageDiscount, enabled: e.target.checked })
            }
          />
          <span className="text-sm text-slate-700">
            <strong>Igen, van kor-alapú kedvezmény</strong> — automatikusan érvényesül a
            megadott korhatárt elért tagokra.
          </span>
        </label>

        {ageDiscount.enabled && (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <WizardField
              id="age-tol"
              label="Korhatár (év)"
              required
              hint="Ettől az életkortól (és felette) jár a kedvezmény."
            >
              <Input
                id="age-tol"
                type="number"
                min={18}
                max={100}
                placeholder="70"
                value={ageDiscount.kor_tol ?? ''}
                onChange={e =>
                  onAgeChange({
                    ...ageDiscount,
                    kor_tol: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </WizardField>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Kedvezmény típusa
              </p>
              <div className="flex gap-2">
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                    ageDiscount.type === 'percent'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    className="size-4"
                    checked={ageDiscount.type === 'percent'}
                    onChange={() =>
                      onAgeChange({ ...ageDiscount, type: 'percent' })
                    }
                  />
                  <span>Százalék (pl. 50%)</span>
                </label>
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                    ageDiscount.type === 'fix'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    className="size-4"
                    checked={ageDiscount.type === 'fix'}
                    onChange={() => onAgeChange({ ...ageDiscount, type: 'fix' })}
                  />
                  <span>Fix RON</span>
                </label>
              </div>
            </div>

            {ageDiscount.type === 'percent' ? (
              <WizardField
                id="age-percent"
                label="Csökkentés százaléka (%)"
                required
                hint="Pl. 50 = az alapösszeg fele jár (50% kedvezmény)."
              >
                <Input
                  id="age-percent"
                  type="number"
                  min={1}
                  max={100}
                  placeholder="50"
                  value={ageDiscount.szazalek ?? ''}
                  onChange={e =>
                    onAgeChange({
                      ...ageDiscount,
                      szazalek: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </WizardField>
            ) : (
              <WizardField
                id="age-fix"
                label="Fix kedvezményes összeg (RON)"
                required
                hint="Az idős tagoknak ennyit kell fizetniük (NEM csökkentés)."
              >
                <Input
                  id="age-fix"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="60"
                  value={ageDiscount.fix_osszeg ?? ''}
                  onChange={e =>
                    onAgeChange({
                      ...ageDiscount,
                      fix_osszeg: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </WizardField>
            )}
          </div>
        )}
      </WizardSectionCard>

      {/* Összefoglaló info */}
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <Tags className="mt-0.5 size-3.5 shrink-0" />
        <span>
          A jövedelem-alapú kedvezmény, mentesítések és egyéb különleges esetek
          később a Tagnyilvántartás → Kezelés menüpontban állíthatók be tagonként.
        </span>
      </div>
    </>
  )
}
