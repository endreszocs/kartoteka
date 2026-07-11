/**
 * Frissítések (körüzenet + hírlevél) — közös formázó segédek.
 * 2026-07-11 admin-redesign: a broadcasts-tab.tsx-ből kiemelve, hogy a
 * szétbontott szekció-komponensek egy helyről kapják a címke-logikát.
 */

import {
  BROADCAST_TARGET_ROLE_LABELS,
  BROADCAST_TARGET_SCOPE_LABELS,
  type BroadcastRow,
  type BroadcastTargetRole,
  type BroadcastTargetScope,
  type BroadcastTipus,
  type ChangelogEntry,
} from '@/lib/broadcasts/types'
import type { StatusIntent } from '@/components/admin/_shared/status-badge'

/** A hírlevél technikai marker-sorainak cím-előtagja (broadcasts-actions.ts). */
export const NEWSLETTER_MARKER_PREFIX = '(Hírlevél része)'

/** Üzenet-típus → StatusBadge intent (a korábbi kézi tónus-térkép helyett). */
export const TIPUS_INTENT: Record<BroadcastTipus, StatusIntent> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  release: 'info',
}

/**
 * Címzés emberi nyelven. FIX 2026-07-11: szerepkörnél a magyar címke
 * (pl. „Lelkipásztorok") jelenik meg a nyers kód („lelkesz") helyett.
 */
export function describeScope(
  scope: BroadcastTargetScope,
  role: BroadcastTargetRole,
  counts: { congs: number; dioceses: number; districts: number },
): string {
  switch (scope) {
    case 'all':
      return 'Mindenkinek'
    case 'role':
      return BROADCAST_TARGET_ROLE_LABELS[role]
    case 'congregation':
      return `${counts.congs} gyülekezet`
    case 'diocese':
      return `${counts.dioceses} egyházmegye`
    case 'district':
      return `${counts.districts} egyházkerület`
  }
}

/** A már kiküldött changelog-bejegyzés célzásának címkéje. */
export function formatBroadcastScope(
  status: NonNullable<ChangelogEntry['broadcastStatus']>,
): string {
  if (status.targetScope === 'role' && status.targetRole) {
    return BROADCAST_TARGET_ROLE_LABELS[status.targetRole]
  }
  return BROADCAST_TARGET_SCOPE_LABELS[status.targetScope]
}

/** Archív sor célzásának címkéje (BroadcastRow alapján, darabszámokkal). */
export function describeBroadcastRowScope(b: BroadcastRow): string {
  switch (b.target_scope) {
    case 'role':
      return b.target_role
        ? BROADCAST_TARGET_ROLE_LABELS[b.target_role]
        : BROADCAST_TARGET_SCOPE_LABELS.role
    case 'congregation':
      return `${b.target_congregation_ids?.length ?? 0} gyülekezet`
    case 'diocese':
      return `${b.target_diocese_ids?.length ?? 0} egyházmegye`
    case 'district':
      return `${b.target_district_ids?.length ?? 0} egyházkerület`
    default:
      return 'Mindenkinek'
  }
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * A hivatkozás mező csak akkor jelenjen meg kattintható linkként, ha app-on
 * belüli útvonal (/penzugy) vagy https:// URL — minden mást sima szövegként
 * mutatunk (validálatlan href-bug fix, 2026-07-11).
 */
export function isSafeHivatkozas(value: string): boolean {
  return value.startsWith('/') || value.startsWith('https://')
}
