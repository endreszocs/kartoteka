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

  // A `handle_new_user` trigger az OAuth-belépéskor MÁR létrehozott egy
  // 'pending' státuszú profilt. Itt a kiegészítő adatokat MENTJÜK rá — NEM új
  // INSERT (az PK-ütközést dobna), hanem upsert (UPDATE a meglévő sorra).
  // A status marad 'pending' — a belépéshez admin jóváhagyás kell.
  const profileUpdate: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    congregation: parsed.data.congregation,
    district_id: parsed.data.districtId,
    diocese_id: parsed.data.dioceseId,
  }
  if (parsed.data.birthDate && parsed.data.birthDate.trim()) {
    profileUpdate.birth_date = parsed.data.birthDate
  }

  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert(profileUpdate, { onConflict: 'id' })

  if (upsertError) {
    return { error: `Hiba a profil mentésekor: ${upsertError.message}` }
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
    success: 'Regisztráció sikeres! Kérem várja meg a rendszergazda jóváhagyását. A jóváhagyásról e-mail értesítést is fog kapni.',
  }
}
