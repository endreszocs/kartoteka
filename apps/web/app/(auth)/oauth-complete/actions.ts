'use server'

import { createClient } from '@/lib/supabase/server'
import { oauthCompleteSchema, type OAuthCompleteInput } from '@/lib/validations/auth'

export async function completeOAuthProfile(data: OAuthCompleteInput) {
  const parsed = oauthCompleteSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }

  // Ellenőrizzük, nincs-e már profil (duplikáció védelem)
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existing) {
    return { error: 'A profil már létezik. Kérem, jelentkezzen be újra.' }
  }

  const { error: insertError } = await supabase.from('profiles').insert([{
    id: user.id,
    email: user.email,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    congregation: parsed.data.congregation,
    status: 'pending',
  }])

  if (insertError) {
    return { error: `Hiba a profil létrehozásakor: ${insertError.message}` }
  }

  // SzuperAdmin értesítés az új regisztrációról
  try {
    const masterEmail = process.env.MASTER_ADMIN_EMAIL
    if (masterEmail) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', masterEmail)
        .single()

      if (adminProfile) {
        await supabase.from('ertesitesek').insert([{
          user_id: adminProfile.id,
          tipus: 'registration',
          cim: 'Új regisztráció (Google)',
          uzenet: `${parsed.data.fullName} (${user.email}) regisztrált Google fiókkal a(z) ${parsed.data.congregation} gyülekezetből. Jóváhagyásra vár.`,
          olvasva: false,
        }])
      }
    }
  } catch {
    // Ne blokkolja a regisztrációt
  }

  // Kijelentkeztetés — pending státuszú fiók nem léphet be
  await supabase.auth.signOut()

  return {
    success: 'Regisztráció sikeres! Kérem várja meg a kerületi SzuperAdmin jóváhagyását.',
  }
}
