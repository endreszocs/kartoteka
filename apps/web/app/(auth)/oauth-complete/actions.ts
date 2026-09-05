'use server'

import { loadStaffAccessRequestState } from '@/lib/auth/post-login-destination'
import {
  removeAccessRequestDocument,
  storeAccessRequestDocument,
} from '@/lib/access-requests/document-storage'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { createClient } from '@/lib/supabase/server'
import { oauthCompleteSchema, type OAuthCompleteInput } from '@/lib/validations/auth'

const SUBMISSION_SUCCESS =
  'Regisztráció sikeres! Kérem várja meg a rendszergazda jóváhagyását. A jóváhagyásról e-mail értesítést is fog kapni.'

const SUBMISSION_ERROR =
  'A kérelmet most nem sikerült biztonságosan rögzíteni. Kérjük, próbálja meg később.'

export async function completeOAuthProfile(
  data: OAuthCompleteInput,
  documentData?: FormData,
) {
  const parsed = oauthCompleteSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }
  if (!user.email) {
    return { error: 'A Google-fiókhoz nem tartozik email-cím.' }
  }

  // A státuszt és a már beadott kérelmet kizárólag a self-only,
  // e-mail-paraméter nélküli RPC alapján ellenőrizzük.
  const stateResult = await loadStaffAccessRequestState(supabase)
  if (!stateResult.ok) {
    return { error: SUBMISSION_ERROR }
  }

  if (stateResult.state.isActiveStaff) {
    return { error: 'A fiók már aktív; nincs szükség új hozzáférési kérelemre.' }
  }

  // Idempotens ismételt beküldés: a saját, már létező kérelmet nem írjuk felül.
  if (stateResult.state.hasAccessRequest) {
    await supabase.auth.signOut({ scope: 'local' })
    return { success: SUBMISSION_SUCCESS }
  }

  // A pending kliens P0 után nem írhat közvetlenül access_requests sort.
  // A service kliens csak ezen a szerveroldali, getUser()-rel hitelesített és
  // szerveroldalon validált útvonalon használható.
  let adminClient: ReturnType<typeof getSupabaseAdminClient>
  try {
    adminClient = getSupabaseAdminClient()
  } catch (error) {
    console.error(
      '[oauth-complete] A szerveroldali kérelemíró kliens nem érhető el:',
      error instanceof Error ? error.message : error,
    )
    return { error: SUBMISSION_ERROR }
  }

  // A handle_new_user triggernek már létre kellett hoznia a profilt. Nem upsertelünk
  // és nem írunk id/e-mail/status/role/scope mezőt: kizárólag a P0 allowlist
  // biztonságos self mezőit frissítjük a meglévő soron.
  const profileUpdate: {
    full_name: string
    phone: string
    birth_date?: string
  } = {
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
  }
  if (parsed.data.birthDate?.trim()) {
    profileUpdate.birth_date = parsed.data.birthDate
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (profileError || !updatedProfile) {
    console.error(
      '[oauth-complete] A biztonságos profilfrissítés sikertelen:',
      profileError?.message ?? 'a saját profil nem található',
    )
    return { error: SUBMISSION_ERROR }
  }

  const email = user.email.trim().toLowerCase()
  const requestPayload = {
    // Egy staff Auth userhez ebben a flow-ban legfeljebb egy legacy kérelem
    // tartozhat. A determinisztikus PK a párhuzamos dupla beküldést is lezárja.
    id: user.id,
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
    resulting_user_id: user.id,
  }

  // A self-state és az INSERT közötti versenyhelyzetet egy utolsó, szerveroldali
  // idempotencia-ellenőrzéssel zárjuk. Meglévő sort soha nem frissítünk a kliens
  // új payloadjával.
  const { data: existingByUser, error: existingByUserError } = await adminClient
    .from('access_requests')
    .select('id')
    .eq('resulting_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingByUserError) {
    console.error('[oauth-complete] A kérelem-idempotencia ellenőrzése sikertelen.')
    return { error: SUBMISSION_ERROR }
  }

  let existingRequest = existingByUser
  if (!existingRequest) {
    const { data: existingByEmail, error: existingByEmailError } = await adminClient
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingByEmailError) {
      console.error('[oauth-complete] A kérelem-idempotencia ellenőrzése sikertelen.')
      return { error: SUBMISSION_ERROR }
    }
    existingRequest = existingByEmail
  }

  let requestInserted = false
  if (!existingRequest) {
    let documentPath: string | null = null
    try {
      documentPath = await storeAccessRequestDocument(user.id, documentData)
    } catch (error) {
      console.error(
        '[oauth-complete] A dokumentum szerveroldali ellenőrzése/tárolása sikertelen:',
        error instanceof Error ? error.message : error,
      )
      return { error: SUBMISSION_ERROR }
    }

    const { error: requestError } = await adminClient
      .from('access_requests')
      .insert({ ...requestPayload, document_path: documentPath })

    if (requestError) {
      await removeAccessRequestDocument(documentPath)
    }
    if (requestError && requestError.code !== '23505') {
      console.error('[oauth-complete] A hozzáférési kérelem rögzítése sikertelen.')
      return { error: SUBMISSION_ERROR }
    }
    requestInserted = !requestError
  }

  // Szuperadmin értesítés az új regisztrációról. Ez best-effort, és nem olvas
  // pending RLS-kontextusból más profilokat.
  if (requestInserted) {
    try {
      const masterEmail = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase()
      if (masterEmail) {
        const { data: adminProfile } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', masterEmail)
          .maybeSingle()

        if (adminProfile) {
          // A feladó a REGISZTRÁLÓ felhasználó (a profil-azonosító = auth user id).
          await insertErtesites(
            adminClient,
            {
              user_id: adminProfile.id,
              tipus: 'registration',
              cim: 'Új regisztráció (Google)',
              uzenet: `${parsed.data.fullName} (${email}) regisztrált Google-fiókkal a(z) ${parsed.data.congregation} gyülekezetből. Jóváhagyásra vár.`,
              olvasva: false,
              ...feladoMezok('felhasznalo', parsed.data.fullName, user.id),
            },
            { forras: 'oauth-regisztracio' },
          )
        }
      }
    } catch (error) {
      console.warn(
        '[oauth-complete] A regisztrációs értesítés nem küldhető:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  // Pending fióknál csak az aktuális böngésző-sessiont zárjuk le.
  await supabase.auth.signOut({ scope: 'local' })

  return { success: SUBMISSION_SUCCESS }
}
