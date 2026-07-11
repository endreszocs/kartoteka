'use client'

/**
 * Címzés-választó (kör / szerepkör / gyülekezet / megye / kerület).
 *
 * 2026-07-11 admin-redesign:
 *  - a célzás-állapot immár SZEKCIÓNKÉNT külön példány (TargetSelection),
 *    így a „Fejlesztések kiküldése" és az „Új üzenet" célzása nem szivárog
 *    át egymásba;
 *  - token-alapú színek (primary), mobil-first chip-sor a scope-gombokra.
 */

import { useState } from 'react'
import { Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  BROADCAST_TARGET_SCOPE_LABELS,
  ROLE_OPTIONS,
  type BroadcastTargetRole,
  type BroadcastTargetScope,
} from '@/lib/broadcasts/types'
import { describeScope } from './format'

export interface CongLite {
  id: string
  name: string
  diocese_id: string | null
}
export interface DioceseLite {
  id: string
  name: string
  district_id: string | null
}
export interface DistrictLite {
  id: string
  name: string
}

/** Egy szekció saját címzés-állapota. */
export interface TargetSelection {
  scope: BroadcastTargetScope
  role: BroadcastTargetRole
  congIds: string[]
  dioceseIds: string[]
  districtIds: string[]
}

export const DEFAULT_TARGET: TargetSelection = {
  scope: 'all',
  role: 'lelkesz',
  congIds: [],
  dioceseIds: [],
  districtIds: [],
}

/** Emberi címke az aktuális címzéshez. */
export function describeTarget(t: TargetSelection): string {
  return describeScope(t.scope, t.role, {
    congs: t.congIds.length,
    dioceses: t.dioceseIds.length,
    districts: t.districtIds.length,
  })
}

/** True, ha lista-alapú célzásnál még nincs kiválasztva egy elem sem. */
export function targetIsIncomplete(t: TargetSelection): boolean {
  if (t.scope === 'congregation') return t.congIds.length === 0
  if (t.scope === 'diocese') return t.dioceseIds.length === 0
  if (t.scope === 'district') return t.districtIds.length === 0
  return false
}

/** A server actionök közös célzás-paraméterei. */
export function targetToActionArgs(t: TargetSelection): {
  targetScope: BroadcastTargetScope
  targetRole: BroadcastTargetRole | null
  targetCongregationIds?: string[]
  targetDioceseIds?: string[]
  targetDistrictIds?: string[]
} {
  return {
    targetScope: t.scope,
    targetRole: t.scope === 'role' ? t.role : null,
    targetCongregationIds: t.scope === 'congregation' ? t.congIds : undefined,
    targetDioceseIds: t.scope === 'diocese' ? t.dioceseIds : undefined,
    targetDistrictIds: t.scope === 'district' ? t.districtIds : undefined,
  }
}

export function TargetPicker({
  value,
  onChange,
  congregations,
  dioceses,
  districts,
}: {
  value: TargetSelection
  onChange: (v: TargetSelection) => void
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
}) {
  const set = (patch: Partial<TargetSelection>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
      <div>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <Label className="mb-0">Kik kapják meg?</Label>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Küldés mindenkinek, egy szerepkörnek, vagy kiválasztott gyülekezeteknek /
          egyházmegyéknek / egyházkerületeknek.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BROADCAST_TARGET_SCOPE_LABELS) as BroadcastTargetScope[]).map((s) => {
          const active = value.scope === s
          return (
            <Button
              key={s}
              type="button"
              variant="outline"
              onClick={() => set({ scope: s })}
              aria-pressed={active}
              className={`min-h-11 rounded-xl px-3 ${
                active
                  ? 'border-transparent bg-primary/10 font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                  : 'text-muted-foreground'
              }`}
            >
              {BROADCAST_TARGET_SCOPE_LABELS[s]}
            </Button>
          )
        })}
      </div>

      {value.scope === 'role' && (
        <div>
          <Label htmlFor="target-role-select">Szerepkör</Label>
          <select
            id="target-role-select"
            value={value.role}
            onChange={(e) => set({ role: e.target.value as BroadcastTargetRole })}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.scope === 'congregation' && (
        <MultiSelectList
          label="Gyülekezet(ek) kiválasztása"
          items={congregations.map((c) => ({ id: c.id, label: c.name }))}
          selected={value.congIds}
          onChange={(ids) => set({ congIds: ids })}
        />
      )}

      {value.scope === 'diocese' && (
        <MultiSelectList
          label="Egyházmegyé(k) kiválasztása"
          items={dioceses.map((d) => ({ id: d.id, label: d.name }))}
          selected={value.dioceseIds}
          onChange={(ids) => set({ dioceseIds: ids })}
        />
      )}

      {value.scope === 'district' && (
        <MultiSelectList
          label="Egyházkerület(ek) kiválasztása"
          items={districts.map((d) => ({ id: d.id, label: d.name }))}
          selected={value.districtIds}
          onChange={(ids) => set({ districtIds: ids })}
        />
      )}
    </div>
  )
}

function MultiSelectList({
  label,
  items,
  selected,
  onChange,
}: {
  label: string
  items: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Keresés…"
        aria-label={`${label} — keresés`}
        className="mt-1"
      />
      <div className="mt-2 max-h-52 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm italic text-muted-foreground">Nincs találat.</p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="size-4 shrink-0 rounded border-input accent-[var(--primary)]"
              />
              <span className="flex-1 truncate">{item.label}</span>
            </label>
          ))
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Kiválasztva: {selected.length}</p>
    </div>
  )
}
