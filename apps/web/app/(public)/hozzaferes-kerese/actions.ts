'use server'

/**
 * Publikus access-request server action (M0.2).
 *
 * Anon user hívhatja, de az access_requests írás kizárólag a szerver action
 * hitelesített, validált és rate-limitált service útvonalán történik.
 * Rate-limit: max 3 kérelem / IP / 24 óra (SQL-függvénnyel).
 * A user confirmation-emailt kap Brevo-n keresztül (vagy Resend-en, env szerint).
 * Az admin(ok) is kapnak notification-emailt.
 */

import { headers } from 'next/headers'

import {
  removeAccessRequestDocument,
  storeAccessRequestDocument,
} from '@/lib/access-requests/document-storage'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { createPublicServerClient } from '@/lib/supabase/public-server'
import { hashClientIp } from '@/lib/utils/ip-hash'
import { sendEmail } from '@/lib/email/send'
import { confirmationEmail, adminNotificationEmail } from '@/lib/email/templates/access-request'

const GENERIC_SUBMISSION_ERROR =
  'A kérelmet most nem sikerült rögzíteni. Kérjük, próbálja meg később.'

export type AccessRequestRole =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'
  // 2026-08-15 (egyhazkeruleti S1)
  | 'egyhazkeruleti_szamvevo'

const ROLE_LABELS: Record<AccessRequestRole, string> = {
  lelkesz: 'Lelkész',
  esperes: 'Esperes',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  konyvelo: 'Könyvelő',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  egyhazkeruleti_szamvevo: 'Egyházkerületi számvevő',
}

const VALID_ROLES: AccessRequestRole[] = Object.keys(ROLE_LABELS) as AccessRequestRole[]

export interface SubmitAccessRequestInput {
  email: string
  full_name: string
  requested_role: AccessRequestRole
  /** A kérelmező itt adja meg a saját jelszavát.
   *  A szerver egy megerősítésre váró Supabase-user fiókot hoz létre,
   *  `email_confirmed_at = null` állapotban. Az admin elfogadás után
   *  `profiles.status = 'active'` lesz, és a user a megadott jelszóval beléphet.
   *  Min. 8 karakter. */
  password: string
  congregation_slug?: string
  phone?: string
  justification?: string
  referrer?: string
  /** 2026-06-03 — kötelező egyházkerület (districts FK, UUID). */
  requested_district_id: string
  /** 2026-06-03 — kötelező egyházmegye (dioceses FK, UUID). */
  requested_diocese_id: string
  /** 2026-06-04 — kötelező egyházközség listából (congregations FK, UUID).
   *  A jóváhagyáskor ez lesz a profiles.congregation_id. */
  requested_congregation_id: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SubmitResult {
  success: boolean
  error?: string
  rateLimited?: boolean
  /** @deprecated Anti-enumeration miatt a szerver action már soha nem állítja be. */
  alreadyExists?: boolean
  /** @deprecated Anti-enumeration miatt gyülekezetnév nem kerül publikus válaszba. */
  congregationName?: string | null
}

/**
 * Publikus access-request submission.
 *
 * Teljes flow:
 *  1. Input validáció (szerveroldalon)
 *  2. IP-hash kiszámítása a request headerekből
 *  3. Rate-limit ellenőrzés (3/24h)
 *  4. Anti-enumeráló, admin-oldali Auth signup-link generálás
 *  5. Szerveroldali dokumentum-validálás + idempotens access_requests INSERT
 *  6. Saját szolgáltatón át küldött email-megerősítő link
 *  7. Notification email az admin(ok)nak
 *
 * Hibák nem szökkenek fel kivételként — minden esetben `SubmitResult`-et ad vissza.
 */
export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
  documentData?: FormData,
): Promise<SubmitResult> {
  // ── 1. Input validáció ──────────────────────────────────────
  const email = (input.email || '').trim().toLowerCase()
  const fullName = (input.full_name || '').trim()
  const role = input.requested_role
  const password = input.password || ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Érvényes email-címet adjon meg.' }
  }
  if (!fullName || fullName.length < 3 || fullName.length > 200) {
    return { success: false, error: 'Teljes nevét adja meg (min. 3 karakter).' }
  }
  if (!VALID_ROLES.includes(role)) {
    return { success: false, error: 'Érvénytelen szerepkör.' }
  }
  // 2026-05-02 (v0.9.37) — Jelszó-mező kötelezővé téve a felhasználó kérésére.
  if (!password || password.length < 8) {
    return { success: false, error: 'A jelszó legalább 8 karakter hosszú legyen.' }
  }
  if (password.length > 72) {
    return { success: false, error: 'A jelszó legfeljebb 72 karakter lehet (bcrypt limit).' }
  }
  // 2026-05-02 (v0.9.39) — Telefonszám kötelezővé téve.
  if (!input.phone?.trim() || input.phone.trim().length > 50) {
    return { success: false, error: 'A telefonszám megadása kötelező.' }
  }
  // 2026-06-03 — Egyházkerület + egyházmegye kötelezővé téve.
  if (!input.requested_district_id || !UUID_RE.test(input.requested_district_id)) {
    return { success: false, error: 'Válassza ki az egyházkerületet.' }
  }
  if (!input.requested_diocese_id || !UUID_RE.test(input.requested_diocese_id)) {
    return { success: false, error: 'Válassza ki az egyházmegyét.' }
  }
  // 2026-06-04 — Egyházközség listából, kötelező.
  if (!input.requested_congregation_id || !UUID_RE.test(input.requested_congregation_id)) {
    return { success: false, error: 'Válassza ki az egyházközséget.' }
  }
  if ((input.justification?.trim().length ?? 0) > 2000) {
    return { success: false, error: 'Az indoklás legfeljebb 2000 karakter lehet.' }
  }
  if ((input.referrer?.trim().length ?? 0) > 500) {
    return { success: false, error: 'A hivatkozás mező túl hosszú.' }
  }

  // ── 2. IP-hash (GDPR-kompatibilis: csak hash, nem IP) ───────
  const requestHeaders = await headers()
  const ipHash = hashClientIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 300) || null

  if (!ipHash && process.env.NODE_ENV === 'production') {
    console.error('[access-request] A kliens IP-je production környezetben nem oldható fel.')
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  // Cookie-mentes anon kliens: egy meglévő staff/tagi session nem változtathatja
  // meg a publikus rate-limit és referenciaadat-lekérdezések RLS-kontextusát.
  const supabase = createPublicServerClient()

  // ── 4. Rate-limit ellenőrzés ───────────────────────────────
  if (ipHash) {
    const { data: rlOk, error: rlErr } = await supabase.rpc('check_access_request_rate_limit', {
      p_ip_hash: ipHash,
    })
    if (rlErr) {
      console.error('[access-request] rate-limit check hiba:', rlErr.message)
      // A következő lépés privilegizált szerveroldali írás, ezért a rate-limit
      // állapota nélkül fail closed módon megállunk.
      return { success: false, error: GENERIC_SUBMISSION_ERROR }
    } else if (rlOk === false) {
      return {
        success: false,
        rateLimited: true,
        error: 'Túl sok kérelem érkezett erről az eszközről 24 órán belül. Kérjük, próbálja később.',
      }
    }
  }

  // A teljes Auth + kérelem folyamatot a szerver koordinálja. A generateLink
  // pontosan jelzi, hogy új user jött-e létre, ezért egy későbbi DB/Storage hiba
  // esetén csak az ebben a hívásban létrehozott accountot kompenzáljuk vissza.
  let adminClient: ReturnType<typeof getSupabaseAdminClient>
  try {
    adminClient = getSupabaseAdminClient()
  } catch (error) {
    console.error(
      '[access-request] A szerveroldali kérelemíró kliens nem érhető el:',
      error instanceof Error ? error.message : error,
    )
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  // A kliens által küldött három UUID valódi hierarchiáját a szerver ellenőrzi.
  const [dioceseResult, congregationResult] = await Promise.all([
    adminClient
      .from('dioceses')
      .select('id, name, district_id, districts(name)')
      .eq('id', input.requested_diocese_id)
      .maybeSingle(),
    adminClient
      .from('congregations')
      .select('id, name, nev_hu, diocese_id')
      .eq('id', input.requested_congregation_id)
      .maybeSingle(),
  ])

  if (
    dioceseResult.error
    || congregationResult.error
    || !dioceseResult.data
    || !congregationResult.data
    || dioceseResult.data.district_id !== input.requested_district_id
    || congregationResult.data.diocese_id !== input.requested_diocese_id
  ) {
    return { success: false, error: 'A kiválasztott egyházi szervezeti egységek nem illeszkednek.' }
  }

  const congregationName =
    congregationResult.data.nev_hu?.trim()
    || congregationResult.data.name?.trim()
    || input.congregation_slug?.trim()
    || null
  const dioceseName = dioceseResult.data.name?.trim() || null
  const districtRelation = dioceseResult.data.districts as
    | { name?: string | null }
    | Array<{ name?: string | null }>
    | null
  const districtName = Array.isArray(districtRelation)
    ? districtRelation[0]?.name?.trim() || null
    : districtRelation?.name?.trim() || null

  // Idempotencia e-mail alapján még Auth-user létrehozása előtt. A publikus
  // válasz meglévő kérelemnél és meglévő Auth-fióknál is ugyanaz marad.
  const { data: existingRequest, error: existingRequestError } = await adminClient
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingRequestError) {
    console.error('[access-request] Idempotencia-ellenőrzési hiba.')
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }
  if (existingRequest) {
    return { success: true }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.NODE_ENV === 'production' ? 'https://kartoteka.app' : 'http://localhost:3000')
  let confirmationRedirect: string
  try {
    confirmationRedirect = new URL('/login?confirmed=1', appUrl).toString()
  } catch {
    console.error('[access-request] Érvénytelen NEXT_PUBLIC_APP_URL.')
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  const { data: signupLink, error: signupError } =
    await adminClient.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { full_name: fullName },
        redirectTo: confirmationRedirect,
      },
    })

  if (signupError) {
    if (
      signupError.code === 'user_already_exists'
      || /already registered|already exists|user_already_exists/i.test(signupError.message)
    ) {
      return { success: true }
    }
    console.error('[access-request] Auth signup-link generálási hiba:', signupError.code)
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  const candidateUserId = signupLink.user?.id
  const verificationUrl = signupLink.properties?.action_link
  if (
    !candidateUserId
    || !verificationUrl
    || signupLink.user.email?.trim().toLowerCase() !== email
  ) {
    console.error('[access-request] Hiányos vagy eltérő Auth signup-link válasz.')
    if (candidateUserId && UUID_RE.test(candidateUserId)) {
      const { error: cleanupError } =
        await adminClient.auth.admin.deleteUser(candidateUserId)
      if (cleanupError) {
        console.error('[access-request] A hiányos signup-válasz kompenzációja sikertelen.')
      }
    }
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  let documentPath: string | null = null
  try {
    documentPath = await storeAccessRequestDocument(candidateUserId, documentData)
  } catch (error) {
    console.error(
      '[access-request] A dokumentum szerveroldali ellenőrzése/tárolása sikertelen:',
      error instanceof Error ? error.message : error,
    )
    const { error: authCleanupError } =
      await adminClient.auth.admin.deleteUser(candidateUserId)
    if (authCleanupError) {
      console.error(
        '[access-request] A dokumentumhiba utáni Auth kompenzáció sikertelen:',
        authCleanupError.message,
      )
    }
    return { success: false, error: GENERIC_SUBMISSION_ERROR }
  }

  // Az Auth-user, dokumentum és kérelem egy kompenzálható szerveroldali saga.
  const { error: insErr } = await adminClient.from('access_requests').insert({
    id: candidateUserId,
    email,
    full_name: fullName,
    requested_role: role,
    congregation_slug: congregationName,
    phone: input.phone?.trim() || null,
    justification: input.justification?.trim() || null,
    referrer: input.referrer?.trim() || null,
    requested_district_id: input.requested_district_id,
    requested_diocese_id: input.requested_diocese_id,
    requested_congregation_id: input.requested_congregation_id,
    document_path: documentPath,
    ip_hash: ipHash,
    user_agent: userAgent,
    resulting_user_id: candidateUserId,
  })

  if (insErr) {
    await removeAccessRequestDocument(documentPath)
    const { error: authRollbackError } =
      await adminClient.auth.admin.deleteUser(candidateUserId)
    if (authRollbackError) {
      console.error('[access-request] Az Auth kompenzáció sikertelen:', authRollbackError.message)
    }
    if (insErr.code === '23505') return { success: true }
    console.error('[access-request] A kérelem beszúrása sikertelen:', insErr.message)
    return {
      success: false,
      error: GENERIC_SUBMISSION_ERROR,
    }
  }

  // A generateLink nem küld levelet: a megerősítő URL-t a saját, auditálható
  // email-szolgáltatónkon át adjuk át a kérelmezőnek.
  const confirmRes = await sendEmail(
    confirmationEmail({
      email,
      fullName,
      requestedRole: ROLE_LABELS[role],
      verificationUrl,
    }),
  )
  if (!confirmRes.success) {
    console.error('[access-request] confirmation email hiba:', confirmRes.error)
    if (process.env.NODE_ENV === 'production') {
      const { error: requestRollbackError } = await adminClient
        .from('access_requests')
        .delete()
        .eq('id', candidateUserId)

      if (!requestRollbackError) {
        await removeAccessRequestDocument(documentPath)
        const { error: authRollbackError } =
          await adminClient.auth.admin.deleteUser(candidateUserId)
        if (authRollbackError) {
          console.error(
            '[access-request] Az email-hiba utáni Auth kompenzáció sikertelen:',
            authRollbackError.message,
          )
        }
      } else {
        console.error(
          '[access-request] Az email-hiba utáni kérelem-kompenzáció sikertelen:',
          requestRollbackError.message,
        )
      }
      return { success: false, error: GENERIC_SUBMISSION_ERROR }
    }
  }

  // 6/b. Admin notification — nézzük meg, kik az aktív admin-ok
  // (egyelőre a `profiles.role='admin'` user-eket; M0.5-ben ez finomodhat)
  const { data: admins } = await adminClient
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'admin')
    .not('email', 'is', null)

  // 2026-08-11 (#3): a levél CTA-ja eddig a `/admin?tab=access-requests` mélylinkre
  // mutatott. Az admin panel 13-fülű oldala önálló `/admin/<slug>` route-okra bomlott,
  // a `?tab=` paramétert MÁR SENKI nem olvassa — a rendszergazda az admin nyitóoldalára
  // esett, kérelem-lista nélkül, és a kérelem észrevétlen maradt. A pending kérelmek
  // elbírálása a Felhasználók oldal kérelem-bannerében történik.
  const adminPortalUrl = new URL('/admin/felhasznalok', appUrl).toString()

  if (admins && admins.length > 0) {
    for (const admin of admins as Array<{ email: string; full_name: string | null }>) {
      const adminRes = await sendEmail(
        adminNotificationEmail({
          adminEmail: admin.email,
          adminName: admin.full_name || undefined,
          requesterName: fullName,
          requesterEmail: email,
          requestedRole: ROLE_LABELS[role],
          congregationSlug: congregationName,
          districtName,
          dioceseName,
          hasDocument: Boolean(documentPath),
          justification: input.justification || null,
          adminPortalUrl,
        }),
      )
      if (!adminRes.success) {
        console.error(`[access-request] admin email hiba (${admin.email}):`, adminRes.error)
      }
    }
  }

  // A válasz szándékosan azonos egy már létező e-mail esetével.
  return { success: true }
}
