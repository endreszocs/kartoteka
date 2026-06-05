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

/**
 * A welcome wizard nem csak a `profiles.onboarding_completed_at` flagtol fugg.
 * Reset/wipe utan elofordulhat, hogy a flag bent marad, mikozben a gyulekezet
 * kritikus alapadatai vagy a penzugyi induloadatok mar hianyoznak.
 *
 * 2026-06-05: a `firstStep` a TÉNYLEGESEN hiányzó ADATOK legkorábbi lépése.
 * Ha a gyülekezet alapadatai + pénzügy már megvannak (egy korábbi lelkész
 * beállította), és csak az adott felhasználó saját onboardingja hiányzik,
 * a Lelkész (3) lépésen indulunk — így egy újabb, ugyanahhoz a gyülekezethez
 * csatlakozó lelkésznek CSAK a saját adatait kell kitöltenie.
 */
export async function getWelcomeWizardStatus(
  supabase: SupabaseClient,
  profile: WelcomeWizardProfile | null,
  congregationIdOverride?: string | null,
): Promise<WelcomeWizardStatus> {
  const reasons: string[] = []
  // A hiányzó ADATOK alapján melyik lépésekre van szükség:
  let needCongregation = false // Step 2 (Gyülekezet)
  let needPastor = false // Step 3 (Lelkész — személyes)
  let needFinance = false // Step 4 (Pénzügy)

  if (isBlank(profile?.full_name)) {
    reasons.push('pastor-name-missing')
    needPastor = true
  }

  const computeFirstStep = (): WelcomeWizardStatus['firstStep'] => {
    if (needCongregation) return 2
    if (needPastor) return 3
    if (needFinance) return 4
    // Minden adat megvan, csak a saját onboarding hiányzik → Lelkész lépés.
    return 3
  }

  const congregationId = congregationIdOverride || profile?.congregation_id || null
  if (!congregationId) {
    reasons.push('congregation-missing')
    needCongregation = true
    if (!profile?.onboarding_completed_at) reasons.push('onboarding-not-completed')
    return { required: true, firstStep: 2, reasons }
  }

  const { data: congregation } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, cim, varos, eves_jarulek, jarulek_hatarid')
    .eq('id', congregationId)
    .maybeSingle()

  if (!congregation) {
    reasons.push('congregation-row-missing')
    needCongregation = true
    if (!profile?.onboarding_completed_at) reasons.push('onboarding-not-completed')
    return { required: true, firstStep: 2, reasons }
  }

  const row = congregation as Record<string, unknown>
  if (isBlank(row.nev_hu) && isBlank(row.name)) {
    reasons.push('congregation-name-missing')
    needCongregation = true
  }
  // FIX 2026-05-04: a cím-elfogadás megengedőbb. Sok kis falusi gyülekezetnél
  // nincs külön utcanév (`cim`), csak helység + házszám. Ezért a "address-missing"
  // ellenőrzés most a `varos` (helység) mezőre épül — ezt a wizard 2. lépés is
  // kötelezően bekéri. Ha a varos megvan, a cím elfogadott.
  if (isBlank(row.varos) && isBlank(row.cim)) {
    reasons.push('congregation-address-missing')
    needCongregation = true
  }
  if ((Number(row.eves_jarulek) || 0) <= 0) {
    reasons.push('yearly-fee-missing')
    needFinance = true
  }
  if (!isValidMonthDay(row.jarulek_hatarid)) {
    reasons.push('yearly-fee-deadline-missing')
    needFinance = true
  }

  if (!profile?.onboarding_completed_at) {
    reasons.push('onboarding-not-completed')
  }

  return { required: reasons.length > 0, firstStep: computeFirstStep(), reasons }
}
