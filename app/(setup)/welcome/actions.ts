'use server'

import { createClient } from '@/lib/supabase/server'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
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
}

export interface WizardPastorSlot {
  fullName: string
  birthDate: string
  phone: string
  email: string
  serviceStartedAt: string
  previousPlaces: string
}

export interface WizardFinanceSlot {
  eves_jarulek: number
  jarulek_kedvezmenyes: number
  jarulek_hatarid: string
  nyito_keszpenz: number
  nyito_bank: number
}

export interface WizardData {
  congregation?: Partial<WizardCongregationSlot>
  pastor?: Partial<WizardPastorSlot>
  finance?: Partial<WizardFinanceSlot>
}

export interface WizardProgressRow {
  user_id: string
  current_step: number
  completed_steps: number[]
  data: WizardData
  started_at: string
  completed_at: string | null
  updated_at: string
}

// ──────────────────────────────────────────────────────────────────
// 0) getCongregationContext — a user aktuális gyülekezet + egyházmegye info
//
// A Step 2-ben a "egyházmegye neve" megjelenítéséhez használjuk.
// Ha a Master Admin még nem rendelt gyülekezetet, NULL-okat ad vissza.
// ──────────────────────────────────────────────────────────────────

export interface CongregationContext {
  congregationId: string | null
  congregationName: string | null
  dioceseId: string | null
  dioceseName: string | null
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

  // Profil → congregation_id
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('congregation_id, diocese_id')
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
  }

  // Ha van congregation_id, olvassuk a congregation + dioceses JOIN-t
  if (ctx.congregationId) {
    const { data: cong } = await supabase
      .from('congregations')
      .select('name, nev_hu, diocese_id, dioceses(name)')
      .eq('id', ctx.congregationId)
      .maybeSingle()

    if (cong) {
      ctx.congregationName = cong.nev_hu || cong.name || null
      if (cong.diocese_id) {
        ctx.dioceseId = cong.diocese_id as string
      }
      // dioceses JOIN eredmény shape: { name: string } | { name: string }[] (Supabase függő)
      const d = cong.dioceses as { name: string } | { name: string }[] | null
      if (Array.isArray(d)) {
        ctx.dioceseName = d[0]?.name ?? null
      } else if (d && typeof d === 'object') {
        ctx.dioceseName = d.name ?? null
      }
    }
  }

  // Ha nincs dioceseName a congregation-ből, de van diocese_id a profile-on, olvassuk direkt
  if (!ctx.dioceseName && ctx.dioceseId) {
    const { data: diocese } = await supabase
      .from('dioceses')
      .select('name')
      .eq('id', ctx.dioceseId)
      .maybeSingle()
    if (diocese) ctx.dioceseName = diocese.name
  }

  return { data: ctx }
}

// ──────────────────────────────────────────────────────────────────
// 1) getWizardProgress — aktuális állapot olvasása
//
// Ha nincs sor → létrehoz egy üreset (step 1, empty data)
// Ha van sor → visszaadja változatlan
// ──────────────────────────────────────────────────────────────────

export async function getWizardProgress(): Promise<
  { data: WizardProgressRow } | { error: string }
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

  if (existing) {
    return { data: existing as WizardProgressRow }
  }

  // Nincs még sor — létrehozunk egy üreset
  // Standalone módban Step 1 (licensz) a kezdő, web módban Step 2 (a user
  // már bejelentkezett, nincs licensz-lépés).
  const startingStep = isStandaloneMode() ? 1 : 2

  const { data: inserted, error: insertError } = await supabase
    .from('wizard_progress')
    .insert({
      user_id: user.id,
      current_step: startingStep,
      completed_steps: [],
      data: {},
    })
    .select('*')
    .single()

  if (insertError) {
    return { error: `Hiba az állapot létrehozásakor: ${insertError.message}` }
  }

  return { data: inserted as WizardProgressRow }
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

  // 1) Olvassuk be a wizard_progress-et
  const { data: progress, error: progressError } = await supabase
    .from('wizard_progress')
    .select('data, completed_steps')
    .eq('user_id', user.id)
    .maybeSingle()

  if (progressError || !progress) {
    return { error: 'A wizard állapota nem található.' }
  }

  const wd = progress.data as WizardData

  // 2) Olvassuk be a profil-t (congregation_id-hez)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, congregation_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: 'A profil nem található.' }
  }

  // ─── profiles (név + telefon + születés) ───
  if (wd.pastor) {
    const profileUpdate: Record<string, unknown> = {}
    if (wd.pastor.fullName) profileUpdate.full_name = wd.pastor.fullName
    if (wd.pastor.phone) profileUpdate.phone = wd.pastor.phone
    if (wd.pastor.birthDate) profileUpdate.birth_date = wd.pastor.birthDate

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase
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
    if (wd.pastor.previousPlaces) {
      pastorUpsert.previous_service_places = [wd.pastor.previousPlaces]
    }

    const { error } = await supabase
      .from('pastor_profiles')
      .upsert(pastorUpsert, { onConflict: 'user_id' })
    if (error) {
      console.error('[completeWizard] pastor_profiles upsert:', error)
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
    if (wd.finance?.eves_jarulek) {
      congUpdate.eves_jarulek = wd.finance.eves_jarulek
    }
    if (wd.finance?.jarulek_kedvezmenyes !== undefined) {
      congUpdate.jarulek_kedvezmenyes = wd.finance.jarulek_kedvezmenyes
    }
    if (wd.finance?.jarulek_hatarid) {
      congUpdate.jarulek_hatarid = wd.finance.jarulek_hatarid
    }

    if (Object.keys(congUpdate).length > 0) {
      const { error } = await supabase
        .from('congregations')
        .update(congUpdate)
        .eq('id', profile.congregation_id)
      if (error) {
        console.error('[completeWizard] congregations update:', error)
      }
    }

    // bejegyzesiszam — külön try, mert schema drift gyanús
    if (wd.congregation.bejegyzesiszam) {
      const { error } = await supabase
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
      utcaid: 1,
    }
    if (wd.finance.eves_jarulek !== undefined) {
      bealitasUpsert.eves_jarulek = wd.finance.eves_jarulek
    }
    if (wd.congregation?.bejegyzesiszam) {
      // Ha a congregations-be nem ment, itt megpróbáljuk
      bealitasUpsert.bejegyzesiszam = wd.congregation.bejegyzesiszam
    }

    const { error } = await supabase
      .from('bealitas')
      .upsert(bealitasUpsert, { onConflict: 'id' })
    if (error) {
      console.error('[completeWizard] bealitas upsert:', error)
    }
  }

  // ─── profiles.onboarding_completed_at ───
  const nowIso = new Date().toISOString()
  const { error: profMarkErr } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: nowIso })
    .eq('id', user.id)
  if (profMarkErr) {
    console.error('[completeWizard] profiles.onboarding_completed_at:', profMarkErr)
  }

  // ─── wizard_progress.completed_at ───
  const { error: wpMarkErr } = await supabase
    .from('wizard_progress')
    .update({ completed_at: nowIso, current_step: 5 })
    .eq('user_id', user.id)
  if (wpMarkErr) {
    console.error('[completeWizard] wizard_progress.completed_at:', wpMarkErr)
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
