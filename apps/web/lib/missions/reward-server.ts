import 'server-only'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'

import {
  type MissionPointEvent,
  type MissionRewardOutcome,
} from './gamification'

const MISSING_LEDGER_CODES = new Set(['42P01', 'PGRST204', 'PGRST205'])

type LedgerRow = {
  pont: number | null
  uj_osszpontszam: number | null
  elozo_szint: string | null
  uj_szint: string | null
  uj_jelvenyek: unknown
  migralt: boolean | null
  utolso_kiserlet_alkalmazva: boolean | null
}

/**
 * A DB-trigger által már atomikusan rögzített jutalom kimenetét olvassa vissza.
 * Migráció előtt vagy PostgREST schema-cache átmenetben fail-closed működik:
 * nem oszt kliensoldali pótpontot, mert az a DB-triggerrel kettős jutalmat okozhatna.
 */
export async function awardMissionEvent(
  userId: string,
  event: MissionPointEvent,
  sourceId: string,
): Promise<MissionRewardOutcome | null> {
  const access = await getEffectiveAccessContext()
  const admin = createAdminClient()
  const reader = admin || access.supabase

  const { data, error } = await reader
    .from('mm_jutalom_esemenyek')
    .select(
      'pont, uj_osszpontszam, elozo_szint, uj_szint, uj_jelvenyek, migralt, utolso_kiserlet_alkalmazva',
    )
    .eq('user_id', userId)
    .eq('esemeny_tipus', event)
    .eq('forras_id', sourceId)
    .maybeSingle()

  if (data) return normalizeLedgerReward(data as LedgerRow)

  if (!error) {
    console.warn('[awardMissionEvent] A forrásművelethez nem jött létre jutalomnapló-sor.', {
      event,
      sourceId,
    })
    return null
  }

  if (!MISSING_LEDGER_CODES.has(error.code || '')) {
    console.error('[awardMissionEvent] Jutalomnapló olvasási hiba:', error.message)
    return null
  }

  console.error(
    '[awardMissionEvent] A jutalomnapló migrációja vagy PostgREST schema-cache-e még nem elérhető; jutalom-visszajelzés kihagyva.',
    { event, sourceId, code: error.code },
  )
  return null
}

function normalizeLedgerReward(row: LedgerRow): MissionRewardOutcome {
  const newBadges = Array.isArray(row.uj_jelvenyek)
    ? row.uj_jelvenyek.filter((value): value is string => typeof value === 'string')
    : []

  return {
    applied: Boolean(row.utolso_kiserlet_alkalmazva) && !row.migralt,
    points: Number(row.pont || 0),
    totalPoints: row.uj_osszpontszam === null ? null : Number(row.uj_osszpontszam),
    previousLevel: row.elozo_szint,
    newLevel: row.uj_szint,
    newBadges,
  }
}
