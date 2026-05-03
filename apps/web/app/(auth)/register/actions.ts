'use server'

import { createClient } from '@/lib/supabase/server'
import { registerSchema, type RegisterInput } from '@/lib/validations/auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAdminAboutRegistration(supabase: any, fullName: string, email: string, congregation: string) {
  try {
    // Master Admin profil keresése
    const masterEmail = process.env.MASTER_ADMIN_EMAIL
    if (!masterEmail) return

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', masterEmail)
      .single()

    if (!adminProfile) return

    await supabase.from('ertesitesek').insert([{
      user_id: adminProfile.id,
      tipus: 'registration',
      cim: 'Új regisztráció',
      uzenet: `${fullName} (${email}) regisztrált a(z) ${congregation} gyülekezetből. Jóváhagyásra vár.`,
      olvasva: false,
    }])
  } catch {
    // Ha az értesítés sikertelen, ne blokkolja a regisztrációt
  }
}

export async function signUp(data: RegisterInput) {
  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // Supabase Auth regisztráció
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
      },
    },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { error: 'Ez az e-mail cím már regisztrálva van.' }
    }
    if (authError.message.includes('at least 6 characters')) {
      return { error: 'A jelszónak legalább 6 karakter hosszúnak kell lennie.' }
    }
    return { error: `Hiba a regisztrációkor: ${authError.message}` }
  }

  if (!authData.user) {
    return { error: 'Ismeretlen hiba történt a regisztrációkor.' }
  }

  // Profil sor létrehozása (status: pending)
  // Megjegyzés: a `dioceseId` csak akkor mentődik, ha érvényes UUID —
  // a Master Admin a jóváhagyáskor rendeli el végül a pontos hozzárendelést.
  const profileInsert: Record<string, unknown> = {
    id: authData.user.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    congregation: parsed.data.congregation,
    status: 'pending',
  }

  if (parsed.data.birthDate && parsed.data.birthDate.trim()) {
    profileInsert.birth_date = parsed.data.birthDate
  }
  if (parsed.data.dioceseId && parsed.data.dioceseId.trim()) {
    profileInsert.diocese_id = parsed.data.dioceseId
  }

  const { error: profileError } = await supabase.from('profiles').insert([profileInsert])

  if (profileError) {
    return { error: `Hiba a profil létrehozásakor: ${profileError.message}` }
  }

  // Pastor profile preemptív létrehozás szolgálatkezdés dátummal
  // (később a wizard Step 3 frissíti további adatokkal)
  if (parsed.data.serviceStartedAt && parsed.data.serviceStartedAt.trim()) {
    await supabase.from('pastor_profiles').upsert(
      {
        user_id: authData.user.id,
        service_started_at: parsed.data.serviceStartedAt,
      },
      { onConflict: 'user_id' }
    )
  }

  // SzuperAdmin értesítés az új regisztrációról
  await notifyAdminAboutRegistration(
    supabase,
    parsed.data.fullName,
    parsed.data.email,
    parsed.data.congregation
  )

  return {
    success: 'Regisztráció sikeres! Kérem várja meg a rendszergazda jóváhagyását. A jóváhagyásról e-mail értesítést is fog kapni.',
  }
}
