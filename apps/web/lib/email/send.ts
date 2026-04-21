import 'server-only'

/**
 * Unified email send entry point.
 *
 * Provider-választás env-ből: `EMAIL_PROVIDER=brevo|resend`.
 * Alapértelmezett: `brevo` (2026-04-22-től EREK elvárása, EU GDPR-kompatibilis).
 *
 * Ha a provider nincs beállítva (API key hiányzik), a send() **nem dobja**
 * kivételt — csak `success: false`-t ad vissza. A hívó kód felelőssége
 * logolni / fallback-elni.
 */

import { brevoProvider } from './providers/brevo'
import { resendProvider } from './providers/resend'
import type { EmailProvider, EmailSendArgs, EmailSendResult } from './types'

export function getEmailProvider(): EmailProvider {
  const choice = (process.env.EMAIL_PROVIDER || 'brevo').toLowerCase()
  switch (choice) {
    case 'resend':
      return resendProvider
    case 'brevo':
    default:
      return brevoProvider
  }
}

/**
 * Küldj el egy emailt a konfigurált provider-rel.
 *
 * @example
 * const r = await sendEmail({
 *   to: { email: 'user@example.com', name: 'Kedves János' },
 *   subject: 'Üdvözöljük',
 *   text: 'Szia!',
 *   html: '<p>Szia!</p>',
 * })
 * if (!r.success) console.error(r.error)
 */
export async function sendEmail(args: EmailSendArgs): Promise<EmailSendResult> {
  const provider = getEmailProvider()
  return provider.send(args)
}
