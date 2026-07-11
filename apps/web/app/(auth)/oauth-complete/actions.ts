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
  if (!user.email) {
    return { error: 'A Google-fiókhoz nem tartozik email-cím.' }
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

  // ── PARITÁS a jelszavas úttal (2026-07-11, 2. kör) ─────────────────────────
  // A Google-regisztráló UGYANAZT az access_requests-sort kapja, mint a
  // jelszavas úton — így az admin elbíráló wizardban a teljes kérelem-kontextus
  // (kért szerepkör, kaszkád kerület→megye→gyülekezet, indoklás, referrer,
  // dokumentum) látszik. Service-role klienssel (RLS-biztos + megbízható
  // dup-check); ha a szolgáltatáskulcs nem elérhető (pl. dev), az authenticated
  // kliens is jogosult INSERT-re (anon+authenticated GRANT + WITH CHECK true).
  const email = user.email.toLowerCase()
  let arClient = supabase
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
    arClient = getSupabaseAdminClient()
  } catch {
    // marad az authenticated kliens
  }

  const arPayload = {
    email,
    full_name: parsed.data.fullName,
    requested_role: parsed.data.requestedRole,
    congregation_slug: parsed.data.congregation,
    phone: parsed.data.phone,
    justification: parsed.data.justification?.trim() || null,
    referrer: parsed.data.referrer?.trim() || null,
    requested_district_id: parsed.data.districtId,
    requested_diocese_id: parsed.data.dioceseId,
    requested_congregation_id: parsed.data.requestedCongregationId,
    document_path: parsed.data.documentPath?.trim() || null,
    resulting_user_id: user.id,
  }

  try {
    // Duplikált beküldés ne hozzon két pending sort: ha már van pending kérelem
    // ehhez az emailhez (pl. újratöltött oldal), azt FRISSÍTJÜK; különben új sort
    // szúrunk be.
    const { data: existing } = await arClient
      .from('access_requests')
      .select('id')
      .ilike('email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing && (existing as { id?: string }).id) {
      await arClient
        .from('access_requests')
        .update(arPayload)
        .eq('id', (existing as { id: string }).id)
    } else {
      await arClient.from('access_requests').insert(arPayload)
    }
  } catch (e) {
    // A profil már mentve; a kérelem-sor best-effort — nem blokkoljuk a
    // regisztrációt. (Az admin a profil-adatokból így is elbírálhat.)
    console.warn(
      '[oauth-complete] access_requests upsert hiba:',
      e instanceof Error ? e.message : e,
    )
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
