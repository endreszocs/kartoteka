import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WelcomeWizardProfile {
  onboarding_completed_at?: string | null
  congregation_id?: string | null
  full_name?: string | null
}

export interface WelcomeWizardStatus {
  required: boolean
  firstStep: 2 | 3 | 4
  reasons: string[]
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function isValidMonthDay(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{2}-\d{2}$/.test(value)) return false
  const [month, day] = value.split('-').map(Number)
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

function earlierStep(current: WelcomeWizardStatus['firstStep'], candidate: WelcomeWizardStatus['firstStep']) {
  return candidate < current ? candidate : current
}

/**
 * A welcome wizard nem csak a `profiles.onboarding_completed_at` flagtol fugg.
 * Reset/wipe utan elofordulhat, hogy a flag bent marad, mikozben a gyulekezet
 * kritikus alapadatai vagy a penzugyi induloadatok mar hianyoznak.
 */
export async function getWelcomeWizardStatus(
  supabase: SupabaseClient,
  profile: WelcomeWizardProfile | null,
  congregationIdOverride?: string | null,
): Promise<WelcomeWizardStatus> {
  const reasons: string[] = []
  let firstStep: WelcomeWizardStatus['firstStep'] = 4

  if (!profile?.onboarding_completed_at) {
    reasons.push('onboarding-not-completed')
    firstStep = earlierStep(firstStep, 2)
  }

  if (isBlank(profile?.full_name)) {
    reasons.push('pastor-name-missing')
    firstStep = earlierStep(firstStep, 3)
  }

  const congregationId = congregationIdOverride || profile?.congregation_id || null
  if (!congregationId) {
    reasons.push('congregation-missing')
    firstStep = earlierStep(firstStep, 2)
    return { required: true, firstStep, reasons }
  }

  const { data: congregation } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, cim, eves_jarulek, jarulek_hatarid')
    .eq('id', congregationId)
    .maybeSingle()

  if (!congregation) {
    reasons.push('congregation-row-missing')
    firstStep = earlierStep(firstStep, 2)
    return { required: true, firstStep, reasons }
  }

  const row = congregation as Record<string, unknown>
  if (isBlank(row.nev_hu) && isBlank(row.name)) {
    reasons.push('congregation-name-missing')
    firstStep = earlierStep(firstStep, 2)
  }
  if (isBlank(row.cim)) {
    reasons.push('congregation-address-missing')
    firstStep = earlierStep(firstStep, 2)
  }
  if ((Number(row.eves_jarulek) || 0) <= 0) {
    reasons.push('yearly-fee-missing')
    firstStep = earlierStep(firstStep, 4)
  }
  if (!isValidMonthDay(row.jarulek_hatarid)) {
    reasons.push('yearly-fee-deadline-missing')
    firstStep = earlierStep(firstStep, 4)
  }

  return { required: reasons.length > 0, firstStep, reasons }
}
