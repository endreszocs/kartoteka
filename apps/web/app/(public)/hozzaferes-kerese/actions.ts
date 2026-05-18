'use server'

/**
 * Publikus access-request server action (M0.2).
 *
 * Anon user hívhatja — a Supabase RLS engedélyezi az INSERT-et.
 * Rate-limit: max 3 kérelem / IP / 24 óra (SQL-függvénnyel).
 * A user confirmation-emailt kap Brevo-n keresztül (vagy Resend-en, env szerint).
 * Az admin(ok) is kapnak notification-emailt.
 */

import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { hashClientIp } from '@/lib/utils/ip-hash'
import { sendEmail } from '@/lib/email/send'
import { confirmationEmail, adminNotificationEmail } from '@/lib/email/templates/access-request'

export type AccessRequestRole =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'

const ROLE_LABELS: Record<AccessRequestRole, string> = {
  lelkesz: 'Lelkész',
  esperes: 'Esperes',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  konyvelo: 'Könyvelő',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
}

const VALID_ROLES: AccessRequestRole[] = Object.keys(ROLE_LABELS) as AccessRequestRole[]

export interface SubmitAccessRequestInput {
  email: string
  full_name: string
  requested_role: AccessRequestRole
  /** Új mező (v0.9.37): a kérelmező itt adja meg a saját jelszavát.
   *  A signUp() egyből Supabase-user fiókot is létrehoz az `auth.users`-ben,
   *  `email_confirmed_at = null` állapotban. Az admin elfogadás után
   *  `profiles.status = 'active'` lesz, és a user a megadott jelszóval beléphet.
   *  Min. 8 karakter. */
  password: string
  congregation_slug?: string
  phone?: string
  justification?: string
  referrer?: string
}

export interface SubmitResult {
  success: boolean
  error?: string
  rateLimited?: boolean
  /** 2026-05-02 (v0.9.43): jelzi, hogy az email már regisztrálva van —
   *  a UI ekkor egy speciális képernyőt mutat: "Belépés / Elfelejtett jelszó". */
  alreadyExists?: boolean
}

/**
 * Publikus access-request submission.
 *
 * Teljes flow:
 *  1. Input validáció (szerveroldalon)
 *  2. IP-hash kiszámítása a request headerekből
 *  3. Rate-limit ellenőrzés (3/24h)
 *  4. INSERT az access_requests táblába
 *  5. Confirmation email a kérelmezőnek
 *  6. Notification email az admin(ok)nak
 *
 * Hibák nem szökkenek fel kivételként — minden esetben `SubmitResult`-et ad vissza.
 */
export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<SubmitResult> {
  // ── 1. Input validáció ──────────────────────────────────────
  const email = (input.email || '').trim().toLowerCase()
  const fullName = (input.full_name || '').trim()
  const role = input.requested_role
  const password = input.password || ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Érvényes email-címet adjon meg.' }
  }
  if (!fullName || fullName.length < 3) {
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
  if (!input.phone?.trim()) {
    return { success: false, error: 'A telefonszám megadása kötelező.' }
  }

  // ── 2. IP-hash (GDPR-kompatibilis: csak hash, nem IP) ───────
  const requestHeaders = await headers()
  const ipHash = hashClientIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 300) || null

  // ── 3. Supabase kliens (anon — RLS policy engedélyezi az INSERT-et) ──
  const supabase = await createClient()

  // ── 4. Rate-limit ellenőrzés ───────────────────────────────
  if (ipHash) {
    const { data: rlOk, error: rlErr } = await supabase.rpc('check_access_request_rate_limit', {
      p_ip_hash: ipHash,
    })
    if (rlErr) {
      console.error('[access-request] rate-limit check hiba:', rlErr.message)
      // Nem blokkoljuk — inkább engedjük át, mint hogy jogos kérelmet elutasítsunk
    } else if (rlOk === false) {
      return {
        success: false,
        rateLimited: true,
        error: 'Túl sok kérelem érkezett erről az eszközről 24 órán belül. Kérjük, próbálja később.',
      }
    }
  }

  // ── 5. SUPABASE SIGN-UP — user fiók létrehozás a megadott jelszóval ─
  // 2026-05-02 (v0.9.37): a felhasználó kérése — a kérelmező adja meg a
  // jelszavát az űrlapon. A signUp() létrehoz egy auth.users sort
  // (email_confirmed_at = null), és emailt küld a Supabase-en keresztül
  // (vagy a Brevo SMTP-n, ha be van állítva a Supabase-ben).
  //
  // A POSTGRES "profiles" trigger automatikusan létrehoz egy 'pending' státuszú
  // profil-sort. Az admin elfogadás → status='active' → a user beléphet.
  //
  // Ha az email már foglalt (signUp 422), bizonyos Supabase-verziók
  // sikeres válasszal térnek vissza — csak nem küldenek email-t. Ez
  // intentional anti-enumeration. Ekkor mi még meg tudjuk csinálni az
  // access_requests insert-et, ami az admin szempontjából elegendő.
  const { error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        requested_role: role,
      },
      emailRedirectTo:
        (process.env.NEXT_PUBLIC_APP_URL || 'https://kartoteka.app') +
        '/login?confirmed=1',
    },
  })

  if (signUpErr) {
    // 2026-05-02 (v0.9.43) — Felhasználó kérése: ha az email már létezik,
    // konkrét üzenetet adjunk, NE pedig csendben folytassuk az access_request
    // insertet (mert a user nem értené miért nem kap email-t).
    //
    // Egy belső gyülekezeti rendszerben az email-enumeration kockázata
    // alacsony — a UX fontosabb: a usert átirányítjuk a Belépés vagy az
    // Elfelejtett jelszó oldalra.
    const isUserExists =
      /already registered|already exists|user_already_exists/i.test(signUpErr.message)
    if (isUserExists) {
      return {
        success: false,
        alreadyExists: true,
        error:
          'Ez az email-cím már regisztrálva van a Kartotéka rendszerben. ' +
          'Ha emlékszik a jelszavára, lépjen be — különben állítsa vissza az "Elfelejtett jelszó" oldalon.',
      }
    }
    return {
      success: false,
      error: `A fiók-létrehozás nem sikerült: ${signUpErr.message}`,
    }
  }

  // ── 6. INSERT az access_requests-be (admin elbírálás listája) ───────
  const { error: insErr } = await supabase
    .from('access_requests')
    .insert({
      email,
      full_name: fullName,
      requested_role: role,
      congregation_slug: input.congregation_slug?.trim() || null,
      phone: input.phone?.trim() || null,
      justification: input.justification?.trim() || null,
      referrer: input.referrer?.trim() || null,
      ip_hash: ipHash,
      user_agent: userAgent,
    })

  if (insErr) {
    return {
      success: false,
      error: insErr.message || 'Nem sikerült rögzíteni a kérelmet.',
    }
  }

  // ── 6. Email-ek — fire-and-log (ha sikertelen, nem akadályozza a flow-t) ──

  // 6/a. Confirmation a kérelmezőnek
  const confirmRes = await sendEmail(
    confirmationEmail({
      email,
      fullName,
      requestedRole: ROLE_LABELS[role],
    }),
  )
  if (!confirmRes.success) {
    console.error('[access-request] confirmation email hiba:', confirmRes.error)
  }

  // 6/b. Admin notification — nézzük meg, kik az aktív admin-ok
  // (egyelőre a `profiles.role='admin'` user-eket; M0.5-ben ez finomodhat)
  const { data: admins } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'admin')
    .not('email', 'is', null)

  const adminPortalUrl =
    (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/admin?tab=access-requests'

  if (admins && admins.length > 0) {
    for (const admin of admins as Array<{ email: string; full_name: string | null }>) {
      const adminRes = await sendEmail(
        adminNotificationEmail({
          adminEmail: admin.email,
          adminName: admin.full_name || undefined,
          requesterName: fullName,
          requesterEmail: email,
          requestedRole: ROLE_LABELS[role],
          congregationSlug: input.congregation_slug || null,
          justification: input.justification || null,
          adminPortalUrl,
        }),
      )
      if (!adminRes.success) {
        console.error(`[access-request] admin email hiba (${admin.email}):`, adminRes.error)
      }
    }
  }

  return { success: true }
}
