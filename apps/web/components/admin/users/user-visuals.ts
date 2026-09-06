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
import { PROFILE_STATUS_LABELS } from '@/lib/profile-roles/labels'
import { isProfileStatus, type ProfileStatus } from '@/lib/types/auth'

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

/**
 * 2026-09-05 (P3-utómunka): a státusz-látvány a `ProfileStatus` unióra
 * KIMERÍTŐ térkép — egy új DB-érték (lib/types/auth.ts) itt is fordítási
 * hibával követel színt, nem futásidőben esik a semleges ágra. A CÍMKE nem itt
 * él: a `PROFILE_STATUS_LABELS` az egyetlen forrás (eddig a „deleted" itt
 * „Törölve", a profilban „Törölt" volt — két igazság ugyanarra a sorra).
 */
const USER_STATUS_VISUALS: Record<ProfileStatus, Omit<UserStatusMeta, 'label'>> = {
  active: { intent: 'success', accent: 'border-l-[3px] border-l-emerald-400 dark:border-l-emerald-600' },
  pending: { intent: 'warning', accent: 'border-l-4 border-l-amber-400 dark:border-l-amber-500' },
  rejected: { intent: 'danger', accent: 'border-l-[3px] border-l-rose-400 dark:border-l-rose-600' },
  deleted: { intent: 'neutral', accent: 'border-l-[3px] border-l-border' },
}

/**
 * A paraméter szándékosan `string | null` (a `UserWithScope.status` a DB nyers
 * értékét hordozza): az ismeretlen érték NEM kap hamis címkét — a nyers kulcs
 * jelenik meg semleges színnel, mint a `getProfileStatusLabel`-nél.
 */
export function getUserStatusMeta(status: string | null): UserStatusMeta {
  if (isProfileStatus(status)) return { label: PROFILE_STATUS_LABELS[status], ...USER_STATUS_VISUALS[status] }
  return {
    label: status || 'Ismeretlen',
    intent: 'neutral',
    accent: 'border-l-[3px] border-l-border',
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

/**
 * „Utoljára aktív" — magyar relatív idő (2026-07-11, 2. kör).
 *
 * A getAllUsersWithScope által számolt `lastActiveAt`-hoz (a profiles.last_seen_at
 * heartbeat és az auth last_sign_in_at közül a frissebb). null → „még nem lépett be".
 * Rövid, lelkész-barát: „az imént", „3 perce", „2 órája", „tegnap", „5 napja",
 * ezen túl konkrét dátum.
 */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'még nem lépett be'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'ismeretlen'
  const diffMs = Date.now() - t
  if (diffMs < 0) return 'az imént'
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'az imént'
  if (min < 60) return `${min} perce`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} órája`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'tegnap'
  if (days < 7) return `${days} napja`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'egy hete' : `${weeks} hete`
  }
  // Egy hónapon túl: konkrét dátum (év csak ha nem az idei).
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('hu-HU', {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
