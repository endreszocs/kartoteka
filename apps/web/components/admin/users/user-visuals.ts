/**
 * Közös vizuális segédek a Felhasználók oldal kártya- és lista-nézetéhez
 * (2026-07-11 admin-redesign).
 *
 * Korábban a getInitials és a státusz-színezés kétszer (eltérően!) élt a
 * user-card.tsx-ben és a user-list-row.tsx-ben — ugyanaz a felhasználó a két
 * nézetben más színt kapott. Innen egyetlen forrásból jön:
 *   - a monogram-képző,
 *   - a státusz → címke + StatusBadge-intent + bal-oldali akcentus leképezés.
 *
 * Színszemantika (a piros helyett): a VÁRAKOZÓ fiók teendő, nem hiba → amber
 * (warning); az elutasítás/törlés marad a rose/semleges vonalon.
 */

import type { CSSProperties } from 'react'

import type { StatusIntent } from '@/components/admin/_shared/status-badge'

export function getInitials(name: string | null, email: string | null): string {
  const source = name || email || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]).join('')
  return letters.toUpperCase() || '?'
}

export interface UserStatusMeta {
  label: string
  intent: StatusIntent
  /** Bal-oldali státusz-akcentus a kártyán/soron (dark-párral) */
  accent: string
}

export function getUserStatusMeta(status: string | null): UserStatusMeta {
  switch (status) {
    case 'active':
      return {
        label: 'Aktív',
        intent: 'success',
        accent: 'border-l-[3px] border-l-emerald-400 dark:border-l-emerald-600',
      }
    case 'pending':
      return {
        label: 'Jóváhagyásra vár',
        intent: 'warning',
        accent: 'border-l-4 border-l-amber-400 dark:border-l-amber-500',
      }
    case 'rejected':
      return {
        label: 'Elutasítva',
        intent: 'danger',
        accent: 'border-l-[3px] border-l-rose-400 dark:border-l-rose-600',
      }
    case 'deleted':
      return {
        label: 'Törölve',
        intent: 'neutral',
        accent: 'border-l-[3px] border-l-border',
      }
    default:
      return {
        label: status || 'Ismeretlen',
        intent: 'neutral',
        accent: 'border-l-[3px] border-l-border',
      }
  }
}

/**
 * Egységes avatar-stílus: téma-token gradient (var(--primary) → var(--accent)),
 * inline style-ként használandó — így mindhárom témát és a dark módot követi.
 */
export const AVATAR_GRADIENT: CSSProperties = {
  background: 'linear-gradient(135deg, var(--primary), var(--accent))',
  color: 'var(--primary-foreground)',
}
