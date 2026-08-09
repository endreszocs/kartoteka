'use server'

/**
 * Admin-meghívó server action (2026-08-09).
 *
 * A rendszergazda (és a kerületi admin — ő hozza be a saját kerülete
 * lelkészeit) egy ismert e-mail-címre küld szép, személyes meghívó levelet a
 * Kartotéka rendszerbe. A levél CTA-ja a kanonikus /hozzaferes-kerese oldalra
 * mutat — így a fiók a bevett, biztonságos úton jön létre (kérelem →
 * rendszergazdai jóváhagyás), és NEM hozunk létre előre Supabase auth-usert.
 *
 * Miért nem inviteUserByEmail? Az előre létrehozott auth-user némán eltörné a
 * /hozzaferes-kerese regisztrációt ugyanarra a címre (a generateLink
 * type=signup 'user_already_exists'-szel csendben kilép, kérelem nem születik)
 * — ezért a meghívó tisztán e-mail marad, fiók-előkészítés nélkül.
 *
 * A 'use server' fájlból CSAK async függvényeket szabad exportálni (Next.js 16
 * szabály) — a típusok és validációs helperek a meghivo-shared.ts-ben élnek.
 *
 * Nincs DB-migráció: a küldés ténye az audit_log-ba kerül (log_audit_event
 * RPC, best-effort) + szerver-konzol logba.
 */

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { sendEmail } from '@/lib/email/send'
import { inviteEmail } from '@/lib/email/templates/invite'
import { logAuditEvent } from '@/lib/audit/log'

import {
  INVITE_MESSAGE_MAX,
  INVITE_NAME_MAX,
  isValidInviteEmail,
  type InviteInput,
  type InviteResult,
} from './meghivo-shared'

export async function sendKartotekaInvite(input: InviteInput): Promise<InviteResult> {
  // ── Jogosultság: admin / master / kerületi admin ─────────────────────────
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess() // allowDistrictAdmin: true (default)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ehhez a művelethez nincs jogosultsága.' }
  }

  // ── Bemenet-validálás ────────────────────────────────────────────────────
  const email = (input.email || '').trim().toLowerCase()
  if (!email) return { error: 'Adja meg a meghívott e-mail-címét.' }
  if (!isValidInviteEmail(email)) {
    return { error: 'Az e-mail-cím formátuma nem tűnik érvényesnek — kérjük, ellenőrizze.' }
  }

  const name = (input.name || '').trim()
  if (name.length > INVITE_NAME_MAX) {
    return { error: `A név legfeljebb ${INVITE_NAME_MAX} karakter lehet.` }
  }

  const personalMessage = (input.personalMessage || '').trim()
  if (personalMessage.length > INVITE_MESSAGE_MAX) {
    return { error: `A személyes üzenet legfeljebb ${INVITE_MESSAGE_MAX} karakter lehet.` }
  }

  // ── Best-effort duplikátum-ellenőrzés: már regisztrált cím? ──────────────
  // Ha a lekérdezés hibázik (pl. RLS), NEM blokkoljuk a küldést — a meghívó
  // ártalmatlan, a cél csak a fölösleges levél megelőzése.
  try {
    // ilike-minta: a % _ \ jokereket escape-eljük, hogy a jani_lelkesz@…
    // típusú címek ne adjanak hamis találatot.
    const pattern = email.replace(/[\\%_]/g, (m) => `\\${m}`)
    const { data: existing, error: lookupError } = await access.supabase
      .from('profiles')
      .select('id')
      .ilike('email', pattern)
      .limit(1)
      .maybeSingle()

    if (!lookupError && existing) {
      return {
        error:
          'Ez az e-mail-cím már regisztrálva van a Kartotékában — meghívó helyett a Felhasználók listában találja meg a fiókot.',
      }
    }
  } catch {
    // best-effort — küldjük tovább a meghívót
  }

  // ── Levél összeállítása és küldése ───────────────────────────────────────
  const inviterName =
    access.fullName || access.user?.email || 'A Kartotéka rendszergazdája'

  const mail = inviteEmail({
    email,
    name: name || null,
    inviterName,
    personalMessage: personalMessage || null,
  })

  const res = await sendEmail(mail) // sosem dob — a success mezőt ellenőrizzük
  if (!res.success) {
    console.error(`[meghivo] Küldési hiba (${email}): ${res.error || 'ismeretlen'}`)
    return {
      error: `A meghívó küldése nem sikerült: ${res.error || 'a levélküldő szolgáltatás nem érhető el.'}`,
    }
  }

  // ── Nyomkövetés: konzol + audit_log (best-effort, nincs új tábla) ────────
  console.log(
    `[meghivo] Meghívó elküldve: ${email} (küldő: ${inviterName} / ${access.userId}, provider: ${res.provider}${res.messageId ? `, messageId: ${res.messageId}` : ''})`,
  )
  await logAuditEvent(
    {
      action: 'admin_invite.send',
      targetTable: null,
      targetId: null,
      metadata: {
        invited_email: email,
        invited_name: name || null,
        has_personal_message: personalMessage.length > 0,
        provider: res.provider,
        message_id: res.messageId || null,
        access_level: access.accessLevel,
      },
    },
    access.supabase,
  )

  return { success: true }
}
