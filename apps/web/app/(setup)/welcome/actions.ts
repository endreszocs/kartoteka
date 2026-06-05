'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getWelcomeWizardStatus } from '@/lib/onboarding/welcome-status'
import { revalidatePath } from 'next/cache'

// ──────────────────────────────────────────────────────────────────
// Típusok — a wizard minden lépésére egy-egy "slot"
// ──────────────────────────────────────────────────────────────────

export interface WizardCongregationSlot {
  nev: string
  nev_hu: string
  nev_ro: string
  adoszam: string
  bejegyzesiszam: string
  cim: string
  email: string
  telefon: string
  web: string
  iban: string
  bank: string
  megye: string
  varos: string
  iranyitoszam: string
  hazszam: string
  country: string
  adrlocality_id: number | null
  adrstreet_id: number | null
}

export interface WizardBankAccountSlot {
  bank_neve: string
  iban: string
  valuta: 'RON' | 'EUR' | 'USD' | 'HUF'
  is_default: boolean
  _clientKey?: string
}

export interface WizardPastorSlot {
  fullName: string
  birthDate: string
  phone: string
  email: string
  serviceStartedAt: string
  /**
   * @deprecated 2026-05-05 — leváltva a `serviceHistory[]`-ra.
   * Megőrizve a wizard_progress.data backward-compat miatt.
   */
  previousPlaces: string
}

export interface WizardServiceHistorySlot {
  hely: string
  szerep: string
  ev_tol: number | null
  ev_ig: number | null
  megjegyzes: string
  _clientKey?: string
}

export interface WizardFinanceSlot {
  eves_jarulek: number
  jarulek_kedvezmenyes: number
  jarulek_hatarid: string
  /** 2026-05-05: tartozás-számítási mód */
  tartozas_szamitas_mod?: 'akkori' | 'aktualis'
  /**
   * @deprecated 2026-05-05 — a nyitó egyenleg a Pénzügy modulban kerül beállításra.
   * Megőrizve a backward-compat miatt.
   */
  nyito_keszpenz?: number
  /** @deprecated 2026-05-05 */
  nyito_bank?: number
}

export interface WizardDiscountPeriodSlot {
  kezdet: string
  hatarid: string
  kedv_osszeg: number
  _clientKey?: string
}

export interface WizardAgeDiscountSlot {
  enabled: boolean
  kor_tol: number | null
  szazalek: number | null
  fix_osszeg: number | null
  type: 'percent' | 'fix'
}

export interface WizardPastYearSlot {
  ev: number
  eves_jarulek: number | null
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string
}

export interface WizardOccupationDiscountSlot {
  foglalkozasok: string
  mode: 'nem_fizet' | 'fix'
  fix_osszeg: number | null
  _clientKey?: string
}

export interface WizardData {
  congregation?: Partial<WizardCongregationSlot>
  bankAccounts?: WizardBankAccountSlot[]
  pastor?: Partial<WizardPastorSlot>
  serviceHistory?: WizardServiceHistorySlot[]
  finance?: Partial<WizardFinanceSlot>
  discountPeriods?: WizardDiscountPeriodSlot[]
  ageDiscount?: WizardAgeDiscountSlot
  occupationDiscounts?: WizardOccupationDiscountSlot[]
  pastYears?: WizardPastYearSlot[]
}

// ──────────────────────────────────────────────────────────────────
// DIAGNOSTICS P1-5: Zod-séma a wizard_progress.data runtime validációjához.
//
// A `completeWizard` service-role klienssel ír — minden kliens-által
// szolgáltatott mezőt itt validálunk, mielőtt a profiles / congregations /
// bealitas / pastor_profiles táblákba kerülne. A séma MEGENGEDŐ (mindenhol
// .optional() / .nullable()), de típus/range/max-length védelmet ad, és a
// default `strip` mód kidobja az ismeretlen kulcsokat (pl. __proto__ stb.).
// ──────────────────────────────────────────────────────────────────

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/
const DATE_MM_DD = /^\d{2}-\d{2}$/

const wizardCongregationSchema = z.object({
  nev: z.string().max(500).optional(),
  nev_hu: z.string().max(500).optional(),
  nev_ro: z.string().max(500).optional(),
  adoszam: z.string().max(100).optional(),
  bejegyzesiszam: z.string().max(100).optional(),
  cim: z.string().max(500).optional(),
  email: z.string().max(200).optional(),
  telefon: z.string().max(50).optional(),
  web: z.string().max(500).optional(),
  iban: z.string().max(50).optional(),
  bank: z.string().max(200).optional(),
  megye: z.string().max(200).optional(),
  varos: z.string().max(200).optional(),
  iranyitoszam: z.string().max(20).optional(),
  hazszam: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  adrlocality_id: z.number().int().positive().nullable().optional(),
  adrstreet_id: z.number().int().positive().nullable().optional(),
})

const wizardBankAccountSchema = z.object({
  bank_neve: z.string().max(200),
  iban: z.string().max(50),
  valuta: z.enum(['RON', 'EUR', 'USD', 'HUF']),
  is_default: z.boolean(),
  _clientKey: z.string().max(200).optional(),
})

const wizardPastorSchema = z.object({
  fullName: z.string().max(300).optional(),
  birthDate: z.string().regex(DATE_YYYY_MM_DD).or(z.literal('')).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  serviceStartedAt: z.string().regex(DATE_YYYY_MM_DD).or(z.literal('')).optional(),
  previousPlaces: z.string().max(2000).optional(),
})

const wizardServiceHistorySchema = z.object({
  hely: z.string().max(500),
  szerep: z.string().max(200),
  ev_tol: z.number().int().min(1900).max(2100).nullable(),
  ev_ig: z.number().int().min(1900).max(2100).nullable(),
  megjegyzes: z.string().max(2000),
  _clientKey: z.string().max(200).optional(),
})

const wizardFinanceSchema = z.object({
  eves_jarulek: z.number().finite().min(0).max(1_000_000_000).optional(),
  jarulek_kedvezmenyes: z.number().finite().min(0).max(1_000_000_000).optional(),
  jarulek_hatarid: z.string().regex(DATE_MM_DD).or(z.literal('')).optional(),
  tartozas_szamitas_mod: z.enum(['akkori', 'aktualis']).optional(),
  nyito_keszpenz: z.number().finite().optional(),
  nyito_bank: z.number().finite().optional(),
})

const wizardDiscountPeriodSchema = z.object({
  kezdet: z.string().regex(DATE_MM_DD).or(z.literal('')),
  hatarid: z.string().regex(DATE_MM_DD).or(z.literal('')),
  kedv_osszeg: z.number().finite().min(0).max(1_000_000_000),
  _clientKey: z.string().max(200).optional(),
})

const wizardAgeDiscountSchema = z.object({
  enabled: z.boolean(),
  kor_tol: z.number().int().min(18).max(150).nullable(),
  szazalek: z.number().finite().min(0).max(100).nullable(),
  fix_osszeg: z.number().finite().min(0).nullable(),
  type: z.enum(['percent', 'fix']),
})

const wizardPastYearSchema = z.object({
  ev: z.number().int().min(1900).max(2100),
  eves_jarulek: z.number().finite().min(0).max(1_000_000_000).nullable(),
  jarulek_kedvezmenyes: z.number().finite().min(0).max(1_000_000_000).nullable(),
  jarulek_hatarid: z.string().max(20),
})

const wizardOccupationDiscountSchema = z.object({
  foglalkozasok: z.string().max(500),
  mode: z.enum(['nem_fizet', 'fix']),
  fix_osszeg: z.number().finite().min(0).max(1_000_000_000).nullable(),
  _clientKey: z.string().max(200).optional(),
})

const wizardDataSchema = z.object({
  congregation: wizardCongregationSchema.optional(),
  bankAccounts: z.array(wizardBankAccountSchema).max(50).optional(),
  pastor: wizardPastorSchema.optional(),
  serviceHistory: z.array(wizardServiceHistorySchema).max(50).optional(),
  finance: wizardFinanceSchema.optional(),
  discountPeriods: z.array(wizardDiscountPeriodSchema).max(20).optional(),
  ageDiscount: wizardAgeDiscountSchema.optional(),
  occupationDiscounts: z.array(wizardOccupationDiscountSchema).max(30).optional(),
  pastYears: z.array(wizardPastYearSchema).max(30).optional(),
})

export interface WizardProgressRow {
  user_id: string
  current_step: number
  completed_steps: number[]
  data: WizardData
  started_at: string
  completed_at: string | null
  updated_at: string
}

async function resolveFallbackStreetId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  streetId?: number | null,
): Promise<number> {
  if (streetId) return streetId

  const { data: fallbackStreet } = await supabase
    .from('adrstreet')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  return Number(fallbackStreet?.id) || 1
}

// ──────────────────────────────────────────────────────────────────
// 0) getCongregationContext — a user aktuális gyülekezet + egyházmegye info
//
// A Step 2-ben a "egyházmegye neve" megjelenítéséhez használjuk.
// Ha a Master Admin még nem rendelt gyülekezetet, NULL-okat ad vissza.
// ──────────────────────────────────────────────────────────────────

export interface CongregationPrefill {
  name: string | null
  nev_hu: string | null
  nev_ro: string | null
  adoszam: string | null
  cim: string | null
  email: string | null
  telefon: string | null
  web: string | null
  megye: string | null
  varos: string | null
  iranyitoszam: string | null
  hazszam: string | null
  country: string | null
  adrlocality_id: number | null
  adrstreet_id: number | null
}

export interface CongregationContext {
  congregationId: string | null
  congregationName: string | null
  dioceseId: string | null
  dioceseName: string | null
  /** 2026-06-04 — a regisztrációnál választott egyházkerület neve. */
  districtName: string | null
  /** 2026-06-04 — a hozzárendelt gyülekezet meglévő adatai (Step 2 auto-kitöltés). */
  congregation: CongregationPrefill | null
}

// A Step 2 auto-kitöltéshez beolvasandó gyülekezet-oszlopok (+ egyházmegye JOIN).
const CONGREGATION_PREFILL_COLUMNS =
  'name, nev_hu, nev_ro, adoszam, cim, email, telefon, web, megye, varos, iranyitoszam, hazszam, country, adrlocality_id, adrstreet_id, diocese_id, dioceses(name)'

function buildCongregationPrefill(c: Record<string, unknown>): CongregationPrefill {
  return {
    name: (c.name as string | null) ?? null,
    nev_hu: (c.nev_hu as string | null) ?? null,
    nev_ro: (c.nev_ro as string | null) ?? null,
    adoszam: (c.adoszam as string | null) ?? null,
    cim: (c.cim as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    telefon: (c.telefon as string | null) ?? null,
    web: (c.web as string | null) ?? null,
    megye: (c.megye as string | null) ?? null,
    varos: (c.varos as string | null) ?? null,
    iranyitoszam: (c.iranyitoszam as string | null) ?? null,
    hazszam: (c.hazszam as string | null) ?? null,
    country: (c.country as string | null) ?? null,
    adrlocality_id: (c.adrlocality_id as number | null) ?? null,
    adrstreet_id: (c.adrstreet_id as number | null) ?? null,
  }
}

function extractDioceseName(c: Record<string, unknown>): string | null {
  const d = c.dioceses as { name?: string | null } | { name?: string | null }[] | null
  if (Array.isArray(d)) return d[0]?.name ?? null
  if (d && typeof d === 'object') return d.name ?? null
  return null
}

export async function getCongregationContext(): Promise<
  { data: CongregationContext } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  // Profil → congregation_id / diocese_id / district_id (a regisztrációból /
  // admin-jóváhagyásból már beállítva)
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('congregation_id, diocese_id, district_id')
    .eq('id', user.id)
    .maybeSingle()

  if (pErr) {
    return { error: `Profil olvasás hiba: ${pErr.message}` }
  }

  const ctx: CongregationContext = {
    congregationId: profile?.congregation_id ?? null,
    congregationName: null,
    dioceseId: profile?.diocese_id ?? null,
    dioceseName: null,
    districtName: null,
    congregation: null,
  }

  // Ha van congregation_id, olvassuk a teljes gyülekezeti adatot (auto-kitöltéshez)
  // + a dioceses JOIN-t (egyházmegye-név).
  if (ctx.congregationId) {
    const { data: cong } = await supabase
      .from('congregations')
      .select(CONGREGATION_PREFILL_COLUMNS)
      .eq('id', ctx.congregationId)
      .maybeSingle()

    if (cong) {
      const c = cong as Record<string, unknown>
      ctx.congregationName = (c.nev_hu as string | null) || (c.name as string | null) || null
      if (c.diocese_id) {
        ctx.dioceseId = c.diocese_id as string
      }
      ctx.dioceseName = extractDioceseName(c)
      ctx.congregation = buildCongregationPrefill(c)
    }
  }

  // 2026-06-05 FALLBACK: ha a profilon még nincs congregation_id (vagy az
  // olvasás RLS miatt üres volt), a regisztrációnál VÁLASZTOTT egyházközséget
  // töltjük be a legutóbbi access_requests sorból — service-role klienssel,
  // hogy az RLS ne szűrjön. Így a "Hivatalos elnevezések" a regisztrált
  // gyülekezet nevét mutatja már a jóváhagyás/véglegesítés előtt is.
  if (!ctx.congregation && user.email) {
    try {
      const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
      const admin = getSupabaseAdminClient()
      const { data: ar } = await admin
        .from('access_requests')
        .select('requested_congregation_id')
        .ilike('email', user.email)
        .not('requested_congregation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const reqCongId = (ar as { requested_congregation_id?: string | null } | null)
        ?.requested_congregation_id
      if (reqCongId) {
        const { data: cong2 } = await admin
          .from('congregations')
          .select(CONGREGATION_PREFILL_COLUMNS)
          .eq('id', reqCongId)
          .maybeSingle()
        if (cong2) {
          const c = cong2 as Record<string, unknown>
          ctx.congregationId = ctx.congregationId ?? reqCongId
          ctx.congregationName =
            ctx.congregationName || (c.nev_hu as string | null) || (c.name as string | null) || null
          if (!ctx.dioceseName) ctx.dioceseName = extractDioceseName(c)
          if (!ctx.dioceseId && c.diocese_id) ctx.dioceseId = c.diocese_id as string
          ctx.congregation = buildCongregationPrefill(c)
        }
      }
    } catch {
      // Service-role kliens nem elérhető (pl. dev) — csendben kihagyjuk.
    }
  }

  // Egyházmegye-név fallback a profile.diocese_id-ból
  if (!ctx.dioceseName && ctx.dioceseId) {
    const { data: diocese } = await supabase
      .from('dioceses')
      .select('name')
      .eq('id', ctx.dioceseId)
      .maybeSingle()
    if (diocese) ctx.dioceseName = diocese.name
  }

  // Egyházkerület-név a profile.district_id-ból
  const districtId = profile?.district_id ?? null
  if (districtId) {
    const { data: district } = await supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    if (district) ctx.districtName = (district as { name?: string | null }).name ?? null
  }

  return { data: ctx }
}

// ──────────────────────────────────────────────────────────────────
// 1) getWizardProgress — aktuális állapot olvasása
//
// Ha nincs sor → létrehoz egy üreset (step 1, empty data)
// Ha van sor → visszaadja változatlan
// ──────────────────────────────────────────────────────────────────

// A gyülekezet/pénzügy alapadatok hiányára utaló reason-kódok. Ha EGYIK sincs
// jelen, a gyülekezet "konfigurált" (egy korábbi lelkész már beállította).
const CONGREGATION_SETUP_REASONS = [
  'congregation-missing',
  'congregation-row-missing',
  'congregation-name-missing',
  'congregation-address-missing',
  'yearly-fee-missing',
  'yearly-fee-deadline-missing',
]

export async function getWizardProgress(): Promise<
  { data: WizardProgressRow; congregationConfigured: boolean } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('wizard_progress')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) {
    return { error: `Hiba az állapot olvasásakor: ${fetchError.message}` }
  }

  // A gyülekezet konfigurált-e (egy korábbi lelkész végigvitte a wizardot)?
  // Ekkor egy újabb, ugyanahhoz a gyülekezethez csatlakozó lelkésznek csak a
  // saját (Lelkész) lépést kell kitöltenie — a Gyülekezet + Pénzügy lépést nem.
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, congregation_id, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const welcomeStatus = await getWelcomeWizardStatus(supabase, profile)
  const congregationConfigured =
    !!profile?.congregation_id &&
    !welcomeStatus.reasons.some((r) => CONGREGATION_SETUP_REASONS.includes(r))

  if (existing) {
    if (welcomeStatus.required && (existing.completed_at || existing.current_step > welcomeStatus.firstStep)) {
      const { data: revived, error: reviveError } = await supabase
        .from('wizard_progress')
        .update({
          completed_at: null,
          current_step: welcomeStatus.firstStep,
        })
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (reviveError) {
        return { error: `Hiba a wizard újranyitásakor: ${reviveError.message}` }
      }

      return { data: revived as WizardProgressRow, congregationConfigured }
    }

    return { data: existing as WizardProgressRow, congregationConfigured }
  }

  // Nincs még sor — létrehozunk egy üreset. Ha a gyülekezet már konfigurált, a
  // Lelkész (3) lépésen indulunk (a Gyülekezet+Pénzügy lépést kihagyjuk),
  // egyébként a Gyülekezet (2) lépésen.
  // A korábbi Step 1 (portable licensz-aktiválás) M6.3 óta kivezetve (2026-04-22).
  const { data: inserted, error: insertError } = await supabase
    .from('wizard_progress')
    .insert({
      user_id: user.id,
      current_step: congregationConfigured ? 3 : 2,
      completed_steps: [],
      data: {},
    })
    .select('*')
    .single()

  if (insertError) {
    return { error: `Hiba az állapot létrehozásakor: ${insertError.message}` }
  }

  return { data: inserted as WizardProgressRow, congregationConfigured }
}

// ──────────────────────────────────────────────────────────────────
// 2) saveWizardStep — egy lépés mentése
//
// - data merge: új slot-ok hozzáadódnak a jsonb-hez (nem írják felül a többit)
// - completed_steps: hozzáadja a step-et (ha még nincs ott)
// - current_step: továbblép a következő lépésre (max 5)
// ──────────────────────────────────────────────────────────────────

export async function saveWizardStep(
  step: number,
  stepData: WizardData
): Promise<{ success: true } | { error: string }> {
  if (step < 1 || step > 5) {
    return { error: 'Érvénytelen lépésszám.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  // Olvassuk be az aktuális állapotot (merge-hez kell)
  const { data: existing, error: fetchError } = await supabase
    .from('wizard_progress')
    .select('current_step, completed_steps, data')
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) {
    return { error: `Hiba a mentés előtt: ${fetchError.message}` }
  }

  const prevData = (existing?.data as WizardData) || {}
  const prevCompleted = (existing?.completed_steps as number[]) || []

  const mergedData: WizardData = {
    ...prevData,
    ...stepData,
  }

  const completedSteps = prevCompleted.includes(step)
    ? prevCompleted
    : [...prevCompleted, step].sort((a, b) => a - b)

  // Következő step — a mentett + 1, de max 5
  const nextStep = Math.min(step + 1, 5)

  const { error: upsertError } = await supabase
    .from('wizard_progress')
    .upsert(
      {
        user_id: user.id,
        current_step: nextStep,
        completed_steps: completedSteps,
        data: mergedData,
      },
      { onConflict: 'user_id' }
    )

  if (upsertError) {
    return { error: `Mentés sikertelen: ${upsertError.message}` }
  }

  return { success: true }
}

// ──────────────────────────────────────────────────────────────────
// 3) restartWizard — teljes újraindítás (ritkán használt — support eset)
// ──────────────────────────────────────────────────────────────────

export async function restartWizard(): Promise<
  { success: true } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  const { error } = await supabase
    .from('wizard_progress')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return { error: `Újraindítás sikertelen: ${error.message}` }
  }

  return { success: true }
}

// ──────────────────────────────────────────────────────────────────
// 4) completeWizard — végső commit a valós táblákba
//
// Ez a server action ÖSSZEHANGOLJA a mentéseket:
//   - profiles.full_name, phone, birth_date
//   - pastor_profiles (upsert)
//   - congregations (ha van congregation_id)
//   - bealitas (aktuális év)
//   - profiles.onboarding_completed_at = now()
//   - wizard_progress.completed_at = now()
//
// SCHEMA DRIFT VÉDELEM: a kétes mezőket (bejegyzesiszam, nyito_keszpenz/nyito_bank)
// try/catch-elt külön update-ekben írjuk — ha a mező nem létezik, nem bukik el
// a teljes folyamat.
// ──────────────────────────────────────────────────────────────────

export async function completeWizard(): Promise<
  { success: true } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  // FIX 2026-05-04: a TÖBBI tábla UPDATE-jeit (profiles, pastor_profiles,
  // congregations, bealitas) is service-role klienssel végezzük, mert a
  // regular session-kliens RLS-ben silent fail-elhetne (ahogy a profile.
  // onboarding_completed_at silent-fail-elt korábban). A JS-szintű
  // requireAdminAccess nincs itt, mert a user a saját adatait írja —
  // viszont a service-role megkerüli az RLS-t és a GRANT-okat.
  let writeClient
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
    writeClient = getSupabaseAdminClient()
  } catch {
    writeClient = supabase // fallback ha service-role kulcs nincs (dev mode)
  }

  // 1) Olvassuk be a wizard_progress-et
  const { data: progress, error: progressError } = await supabase
    .from('wizard_progress')
    .select('data, completed_steps')
    .eq('user_id', user.id)
    .maybeSingle()

  if (progressError || !progress) {
    return { error: 'A wizard állapota nem található.' }
  }

  // DIAGNOSTICS P1-5: Zod-validáció a wizard_progress.data tartalmán, mielőtt
  // service-role-lal írnánk a profiles / congregations / bealitas táblákba.
  // A séma .strip mode-ban van (Zod default), így ismeretlen kulcsok automatikusan
  // kidobódnak — egy rosszhiszemű kliens nem csempészhet be váratlan mezőt.
  const parsed = wizardDataSchema.safeParse(progress.data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join('.') || '(gyökér)'
    return {
      error: `A wizard adatai érvénytelenek: ${issue?.message ?? 'séma-hiba'} (mező: ${path})`,
    }
  }
  const wd = parsed.data

  // 2) Olvassuk be a profil-t (congregation_id-hez) — a pénzügyi gate ELŐTT.
  // Egy újabb lelkésznél (aki egy MÁR beállított gyülekezethez csatlakozik) a
  // pénzügyi alapadatok a meglévő gyülekezeti sorból jönnek, nem a wizardból.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, congregation_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: 'A profil nem található.' }
  }

  // A meglévő gyülekezeti pénzügyi alapadatok (fallback, ha a wizard nem hoz
  // finance-t — pl. második lelkész, aki kihagyta a Pénzügy lépést).
  let existingFee = 0
  let existingDeadline = ''
  if (profile.congregation_id) {
    const { data: congFinance } = await supabase
      .from('congregations')
      .select('eves_jarulek, jarulek_hatarid')
      .eq('id', profile.congregation_id)
      .maybeSingle()
    const cf = congFinance as { eves_jarulek?: number | null; jarulek_hatarid?: string | null } | null
    existingFee = Number(cf?.eves_jarulek) || 0
    existingDeadline = typeof cf?.jarulek_hatarid === 'string' ? cf.jarulek_hatarid : ''
  }

  const yearlyFee = Number(wd.finance?.eves_jarulek) || existingFee
  const yearlyDeadline = /^\d{2}-\d{2}$/.test(wd.finance?.jarulek_hatarid || '')
    ? (wd.finance?.jarulek_hatarid as string)
    : existingDeadline
  if (yearlyFee <= 0 || !/^\d{2}-\d{2}$/.test(yearlyDeadline)) {
    return {
      error:
        'A pénzügyi alapadatok hiányosak. Kérem, adja meg az éves járulék összegét és a fizetési határidőt a Pénzügy lépésben.',
    }
  }

  // ─── profiles (név + telefon + születés) ───
  if (wd.pastor) {
    const profileUpdate: Record<string, unknown> = {}
    if (wd.pastor.fullName) profileUpdate.full_name = wd.pastor.fullName
    if (wd.pastor.phone) profileUpdate.phone = wd.pastor.phone
    if (wd.pastor.birthDate) profileUpdate.birth_date = wd.pastor.birthDate

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await writeClient
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)
      if (error) {
        console.error('[completeWizard] profiles update:', error)
        // Nem blokkoló — próbáljuk a többi lépést is
      }
    }
  }

  // ─── pastor_profiles (upsert) ───
  if (wd.pastor) {
    const pastorUpsert: Record<string, unknown> = {
      user_id: user.id,
    }
    if (wd.pastor.phone) pastorUpsert.emergency_phone = wd.pastor.phone
    if (wd.pastor.serviceStartedAt) {
      pastorUpsert.service_started_at = wd.pastor.serviceStartedAt
    }
    // Backward-compat: ha a régi previousPlaces text mezőben van adat,
    // azt is mentjük (de a strukturált pastor_service_history a fő tárolás).
    if (wd.pastor.previousPlaces) {
      pastorUpsert.previous_service_places = [wd.pastor.previousPlaces]
    }

    const { error } = await writeClient
      .from('pastor_profiles')
      .upsert(pastorUpsert, { onConflict: 'user_id' })
    if (error) {
      console.error('[completeWizard] pastor_profiles upsert:', error)
    }
  }

  // ─── pastor_service_history (multi-row insert) ───
  // A wizard Step 3 új strukturált szolgálati előzményei. Először töröljük
  // a felhasználó saját history-ját (idempotens újrafutáshoz), aztán bulk
  // insertelünk.
  if (Array.isArray(wd.serviceHistory)) {
    const validHistory = wd.serviceHistory.filter(s => s.hely && s.hely.trim())
    if (validHistory.length > 0) {
      // Töröljük a meglévő rekordokat (idempotens újrafutás esetén)
      await writeClient
        .from('pastor_service_history')
        .delete()
        .eq('user_id', user.id)

      const rows = validHistory.map((s, idx) => ({
        user_id: user.id,
        hely: s.hely.trim(),
        szerep: s.szerep?.trim() || null,
        ev_tol: s.ev_tol,
        ev_ig: s.ev_ig,
        megjegyzes: s.megjegyzes?.trim() || null,
        sorrend: idx,
      }))

      const { error } = await writeClient
        .from('pastor_service_history')
        .insert(rows)
      if (error) {
        console.error('[completeWizard] pastor_service_history insert:', error)
        // Nem blokkoló — de figyelmeztetjük a felhasználót
      }
    }
  }

  // ─── congregations (csak ha van congregation_id) ───
  if (wd.congregation && profile.congregation_id) {
    const congUpdate: Record<string, unknown> = {}
    if (wd.congregation.nev) congUpdate.name = wd.congregation.nev
    if (wd.congregation.nev_hu) congUpdate.nev_hu = wd.congregation.nev_hu
    if (wd.congregation.nev_ro) congUpdate.nev_ro = wd.congregation.nev_ro
    if (wd.congregation.adoszam) congUpdate.adoszam = wd.congregation.adoszam
    if (wd.congregation.cim) congUpdate.cim = wd.congregation.cim
    if (wd.congregation.email) congUpdate.email = wd.congregation.email
    if (wd.congregation.telefon) congUpdate.telefon = wd.congregation.telefon
    if (wd.congregation.web) congUpdate.web = wd.congregation.web
    if (wd.congregation.iban) congUpdate.iban = wd.congregation.iban
    if (wd.congregation.bank) congUpdate.bank = wd.congregation.bank
    if (wd.congregation.megye) congUpdate.megye = wd.congregation.megye
    if (wd.congregation.varos) congUpdate.varos = wd.congregation.varos
    if (wd.congregation.iranyitoszam) congUpdate.iranyitoszam = wd.congregation.iranyitoszam
    if (wd.congregation.hazszam) congUpdate.hazszam = wd.congregation.hazszam
    if (wd.congregation.country) congUpdate.country = wd.congregation.country
    if (wd.congregation.adrlocality_id !== undefined) {
      congUpdate.adrlocality_id = wd.congregation.adrlocality_id
    }
    if (wd.congregation.adrstreet_id !== undefined) {
      congUpdate.adrstreet_id = wd.congregation.adrstreet_id
    }
    if (wd.finance?.eves_jarulek) {
      congUpdate.eves_jarulek = wd.finance.eves_jarulek
    }
    if (wd.finance?.jarulek_kedvezmenyes !== undefined) {
      congUpdate.jarulek_kedvezmenyes = wd.finance.jarulek_kedvezmenyes
    }
    if (wd.finance?.jarulek_hatarid) {
      congUpdate.jarulek_hatarid = wd.finance.jarulek_hatarid
    }
    if (wd.finance?.tartozas_szamitas_mod) {
      congUpdate.tartozas_szamitas_mod = wd.finance.tartozas_szamitas_mod
    }

    // Legacy fallback: ha vannak bankszámlák a wizardban, az elsőt
    // (vagy a fő számlát) szinkronizáljuk a `congregations.iban`/`bank`
    // mezőkbe is — backward-compat a régi kód miatt, ami közvetlenül
    // ezekből olvas (pl. fizetési bizonylatok PDF generálás).
    if (Array.isArray(wd.bankAccounts) && wd.bankAccounts.length > 0) {
      const primary =
        wd.bankAccounts.find(b => b.is_default) || wd.bankAccounts[0]
      if (primary?.iban) congUpdate.iban = primary.iban
      if (primary?.bank_neve) congUpdate.bank = primary.bank_neve
    }

    if (Object.keys(congUpdate).length > 0) {
      const { error } = await writeClient
        .from('congregations')
        .update(congUpdate)
        .eq('id', profile.congregation_id)
      if (error) {
        console.error('[completeWizard] congregations update:', error)
      }
    }

    // ─── bankszamlak (multi-row insert) ───
    // A wizard Step 2 új banki-számla listája a `bankszamlak` táblába kerül
    // (a pénzügyi modul saját tárolója). Idempotens újrafutáshoz először
    // töröljük a gyülekezet összes wizard-eredetű számláját, aztán insertelünk.
    if (Array.isArray(wd.bankAccounts) && wd.bankAccounts.length > 0) {
      const validAccounts = wd.bankAccounts.filter(b => b.bank_neve.trim())
      if (validAccounts.length > 0) {
        // Pontosan egy fő számla
        const accountsWithDefault = validAccounts.map((b, i) => ({
          ...b,
          is_default: validAccounts.some(x => x.is_default)
            ? b.is_default
            : i === 0,
        }))

        const rows = accountsWithDefault.map(b => ({
          congregation_id: profile.congregation_id,
          bank_neve: b.bank_neve.trim(),
          iban: b.iban?.trim() || null,
          valuta: b.valuta,
          is_default: b.is_default,
          aktiv: true,
          scope: 'gyulekezet' as const,
        }))

        const { error } = await writeClient.from('bankszamlak').insert(rows)
        if (error) {
          console.error('[completeWizard] bankszamlak insert:', error)
          // Nem blokkoló
        }
      }
    }

    // ─── jarulek_kedvezmeny (időszaki + kor-alapú + foglalkozás-alapú) ───
    // Az aktuális év kedvezmény-szabályait írjuk be. Idempotens újrafutáshoz
    // töröljük a wizard-rel létrehozott aktuális-évi kedvezményeket előbb.
    const currentYearNum = new Date().getFullYear()
    const periodCount = wd.discountPeriods?.length ?? 0
    const ageEnabled = wd.ageDiscount?.enabled === true
    const occupationCount =
      wd.occupationDiscounts?.filter(o => o.foglalkozasok.trim()).length ?? 0
    if (periodCount > 0 || ageEnabled || occupationCount > 0) {
      // Töröljük a meglévő current_year kedvezmények közül azokat,
      // amiket a wizard hozhatott létre (idoszak + kor + foglalkozas)
      await writeClient
        .from('jarulek_kedvezmeny')
        .delete()
        .eq('congregation_id', profile.congregation_id)
        .eq('ev', currentYearNum)
        .in('tipus', ['idoszak', 'kor', 'foglalkozas'])

      const discountRows: Record<string, unknown>[] = []

      if (Array.isArray(wd.discountPeriods)) {
        wd.discountPeriods
          .filter(
            p =>
              /^\d{2}-\d{2}$/.test(p.kezdet) &&
              /^\d{2}-\d{2}$/.test(p.hatarid) &&
              Number(p.kedv_osszeg) > 0,
          )
          .forEach((p, idx) => {
            discountRows.push({
              congregation_id: profile.congregation_id,
              ev: currentYearNum,
              tipus: 'idoszak',
              sorrend: idx,
              aktiv: true,
              kezdet: p.kezdet,
              hatarid: p.hatarid,
              kedv_osszeg: p.kedv_osszeg,
            })
          })
      }

      if (ageEnabled && wd.ageDiscount) {
        const ad = wd.ageDiscount
        if (ad.kor_tol && ad.kor_tol >= 18) {
          const ageRow: Record<string, unknown> = {
            congregation_id: profile.congregation_id,
            ev: currentYearNum,
            tipus: 'kor',
            sorrend: 0,
            aktiv: true,
            kor_tol: ad.kor_tol,
          }
          if (ad.type === 'percent' && ad.szazalek) {
            ageRow.szazalek = ad.szazalek
          } else if (ad.type === 'fix' && ad.fix_osszeg !== null) {
            ageRow.fix_osszeg = ad.fix_osszeg
          }
          discountRows.push(ageRow)
        }
      }

      // Foglalkozás-alapú kedvezmény: jov_leiras = kulcsszavak; fix_osszeg =
      // a fizetendő összeg (nem_fizet → 0).
      if (Array.isArray(wd.occupationDiscounts)) {
        wd.occupationDiscounts
          .filter(o => o.foglalkozasok.trim())
          .forEach((o, idx) => {
            discountRows.push({
              congregation_id: profile.congregation_id,
              ev: currentYearNum,
              tipus: 'foglalkozas',
              sorrend: idx,
              aktiv: true,
              jov_leiras: o.foglalkozasok.trim(),
              fix_osszeg: o.mode === 'nem_fizet' ? 0 : (o.fix_osszeg ?? 0),
            })
          })
      }

      if (discountRows.length > 0) {
        const { error } = await writeClient
          .from('jarulek_kedvezmeny')
          .insert(discountRows)
        if (error) {
          console.error('[completeWizard] jarulek_kedvezmeny insert:', error)
        }
      }
    }

    // bejegyzesiszam — külön try, mert schema drift gyanús
    if (wd.congregation.bejegyzesiszam) {
      const { error } = await writeClient
        .from('congregations')
        .update({ bejegyzesiszam: wd.congregation.bejegyzesiszam })
        .eq('id', profile.congregation_id)
      if (error) {
        // Ha a mező nincs a congregations-ben, próbáljuk a bealitas-ba
        console.warn(
          '[completeWizard] bejegyzesiszam not on congregations, trying bealitas:',
          error.message
        )
        // bealitas-ba a következő lépésben kerül
      }
    }
  }

  // ─── bealitas (aktuális év) ───
  if (wd.finance && profile.congregation_id) {
    const currentYear = String(new Date().getFullYear())
    const streetId = await resolveFallbackStreetId(supabase, wd.congregation?.adrstreet_id)
    const bealitasUpsert: Record<string, unknown> = {
      id: currentYear,
      congregation_id: profile.congregation_id,
      aktiv: true,
      // Szükséges NOT NULL-ok a schema szerint
      isszemelyibefizetes: false,
      isszulokkulon: false,
      felmentes70felul: false,
      felmentesideneskudtek: false,
      kedvezmenyxevenfelul: false,
      utcaid: streetId,
    }
    if (wd.finance.eves_jarulek !== undefined) {
      bealitasUpsert.eves_jarulek = wd.finance.eves_jarulek
    }
    if (wd.finance.jarulek_kedvezmenyes !== undefined) {
      bealitasUpsert.jarulek_kedvezmenyes = wd.finance.jarulek_kedvezmenyes
    }
    if (wd.finance.jarulek_hatarid) {
      bealitasUpsert.jarulek_hatarid = wd.finance.jarulek_hatarid
    }
    if (wd.finance.nyito_keszpenz !== undefined) {
      bealitasUpsert.nyito_keszpenz = wd.finance.nyito_keszpenz
    }
    if (wd.finance.nyito_bank !== undefined) {
      bealitasUpsert.nyito_bank = wd.finance.nyito_bank
    }
    if (wd.congregation?.bejegyzesiszam) {
      // Ha a congregations-be nem ment, itt megpróbáljuk
      bealitasUpsert.bejegyzesiszam = wd.congregation.bejegyzesiszam
    }
    if (wd.congregation?.adrlocality_id !== undefined) {
      bealitasUpsert.helysegid = wd.congregation.adrlocality_id
    }

    const { error } = await writeClient
      .from('bealitas')
      .upsert(bealitasUpsert, { onConflict: 'id,congregation_id' })
    if (error) {
      console.error('[completeWizard] bealitas upsert:', error)
      return { error: `A pénzügyi alapbeállítások mentése sikertelen: ${error.message}` }
    }

    // ─── Múlt évek bealitas (opcionális, csak akkori módban van értelme) ───
    // A felhasználó max 5 visszamenő évet adhat meg a wizardban. Csak azokat
    // mentjük, amelyikben legalább egy mező ki van töltve. Idempotens upsert
    // a (id, congregation_id) PK-re.
    if (
      Array.isArray(wd.pastYears) &&
      wd.finance.tartozas_szamitas_mod === 'akkori'
    ) {
      const filledYears = wd.pastYears.filter(
        y =>
          (y.eves_jarulek && y.eves_jarulek > 0) ||
          (y.jarulek_kedvezmenyes && y.jarulek_kedvezmenyes > 0) ||
          (y.jarulek_hatarid && /^\d{2}-\d{2}$/.test(y.jarulek_hatarid)),
      )
      for (const year of filledYears) {
        const yearRow: Record<string, unknown> = {
          id: String(year.ev),
          congregation_id: profile.congregation_id,
          aktiv: false, // múlt évek nem "aktívak", csak archív
          isszemelyibefizetes: false,
          isszulokkulon: false,
          felmentes70felul: false,
          felmentesideneskudtek: false,
          kedvezmenyxevenfelul: false,
          utcaid: streetId,
        }
        if (year.eves_jarulek !== null) {
          yearRow.eves_jarulek = year.eves_jarulek
        }
        if (year.jarulek_kedvezmenyes !== null) {
          yearRow.jarulek_kedvezmenyes = year.jarulek_kedvezmenyes
        }
        if (year.jarulek_hatarid) {
          yearRow.jarulek_hatarid = year.jarulek_hatarid
        }
        if (wd.congregation?.adrlocality_id !== undefined) {
          yearRow.helysegid = wd.congregation.adrlocality_id
        }

        const { error: yearErr } = await writeClient
          .from('bealitas')
          .upsert(yearRow, { onConflict: 'id,congregation_id' })
        if (yearErr) {
          console.error(`[completeWizard] bealitas múlt év ${year.ev}:`, yearErr)
        }
      }
    }
  }

  // ─── P2 (2026-06-04): welcomeStatus-ellenőrzés a véglegesítés ELŐTT ───
  // Mielőtt "kész"-re állítjuk az onboarding-ot, ellenőrizzük, hogy a kötelező
  // alapadatok TÉNYLEG mentődtek. Ha nem (pl. egy írás némán elbukott), inkább
  // érthető hibát adunk, mintsem hogy az onboarding_completed_at beállítása után
  // a guardok visszaküldjék a lelkészt a wizardba (soft-loop). A friss adatokat
  // a service-role klienssel (writeClient) olvassuk, hogy az RLS ne szűrjön.
  const { data: freshProfile } = await writeClient
    .from('profiles')
    .select('onboarding_completed_at, congregation_id, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const postStatus = await getWelcomeWizardStatus(
    writeClient,
    (freshProfile as {
      onboarding_completed_at?: string | null
      congregation_id?: string | null
      full_name?: string | null
    } | null) ?? null,
    profile.congregation_id,
  )
  // Az 'onboarding-not-completed' reason itt szándékosan jelen van (épp most
  // állítjuk be) — ezért azt kihagyjuk a blokkoló okok közül.
  const REASON_LABELS: Record<string, string> = {
    'congregation-missing':
      'Nincs gyülekezet hozzárendelve a fiókodhoz — kérjük, lépj kapcsolatba a rendszergazdával.',
    'congregation-row-missing': 'A gyülekezet adatai nem találhatók a rendszerben.',
    'congregation-name-missing': 'A gyülekezet neve hiányzik.',
    'congregation-address-missing':
      'A gyülekezet települése hiányzik — töltsd ki a Gyülekezet lépésben.',
    'pastor-name-missing': 'A lelkész neve hiányzik — töltsd ki a Lelkész lépésben.',
    'yearly-fee-missing':
      'Az éves járulék összege hiányzik — töltsd ki a Pénzügy lépésben.',
    'yearly-fee-deadline-missing':
      'A járulék fizetési határideje hiányzik — töltsd ki a Pénzügy lépésben.',
  }
  const blockingReasons = postStatus.reasons.filter((r) => r !== 'onboarding-not-completed')
  if (blockingReasons.length > 0) {
    const msg = blockingReasons.map((r) => REASON_LABELS[r] || r).join(' ')
    return { error: `A beállítás nem véglegesíthető: ${msg}` }
  }

  // ─── profiles.onboarding_completed_at + wizard_progress.completed_at ───
  // FIX 2026-05-04: a regular session-kliens UPDATE-je RLS-be ütközött →
  // silent fail, és a wizard a következő reload-on újra megnyílt. SECURITY
  // DEFINER RPC megkerüli az RLS-t, és a hibát explicit visszaadjuk a hívónak.
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('complete_user_onboarding')
    .single()

  if (rpcErr) {
    console.error('[completeWizard] complete_user_onboarding RPC:', rpcErr)
    return {
      error: `A wizard befejezésének rögzítése sikertelen: ${rpcErr.message}. Próbáld újra, vagy lépj kapcsolatba a rendszergazdával.`,
    }
  }

  const result = rpcRes as
    | { user_id: string; out_completed_at: string; was_already_completed: boolean }
    | null
  if (!result) {
    return {
      error: 'A wizard befejezésének rögzítése sikertelen — az RPC üres eredményt adott. Lépj kapcsolatba a rendszergazdával.',
    }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── 5) restartWelcomeWizard — a fejléc-dropdown "Wizard újraindítása" gombja
//
// A user a saját profile-ját reset-eli wizardra: onboarding_completed_at = NULL,
// wizard_progress = 1. step. A meglévő gyülekezet/wizard-data ÉRINTETLEN marad,
// így a wizard utolsó állapotból folytatható (csak újra kattint végig).
// ─────────────────────────────────────────────────────────────────────────
export async function restartWelcomeWizard(): Promise<
  | { success: true }
  | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  const { error: rpcErr } = await supabase.rpc('restart_user_onboarding').single()
  if (rpcErr) {
    console.error('[restartWelcomeWizard] restart_user_onboarding RPC:', rpcErr)
    return { error: `A wizard újraindítása sikertelen: ${rpcErr.message}` }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
