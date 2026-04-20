import 'server-only'

/**
 * Brevo (ex-SendinBlue) email provider implementáció.
 *
 * Free tier: 300/nap (~9000/hó), EU-szerverek (Franciaország), GDPR-szigorú.
 * Env változók:
 *   - BREVO_API_KEY — a kulcs
 *   - BREVO_FROM_EMAIL — az alapértelmezett feladó címe (pl. "no-reply@kartoteka.ro")
 *   - BREVO_FROM_NAME — az alapértelmezett feladó neve (pl. "Kartotéka Rendszer")
 *
 * Ha a csomag még nincs telepítve (`@getbrevo/brevo`), a dinamikus import
 * miatt a build NEM törik, csak a futási hiba jön elő, ha tényleg küldeni akarunk.
 */

import type { EmailProvider, EmailSendArgs, EmailSendResult } from '../types'

export const brevoProvider: EmailProvider = {
  name: 'brevo',

  async send(args: EmailSendArgs): Promise<EmailSendResult> {
    const apiKey = process.env.BREVO_API_KEY
    if (!apiKey) {
      return {
        success: false,
        provider: 'brevo',
        error: 'BREVO_API_KEY env változó nincs beállítva.',
      }
    }

    const fromEmail = args.from?.email || process.env.BREVO_FROM_EMAIL
    const fromName = args.from?.name || process.env.BREVO_FROM_NAME || 'Kartotéka'
    if (!fromEmail) {
      return {
        success: false,
        provider: 'brevo',
        error: 'BREVO_FROM_EMAIL env változó nincs beállítva.',
      }
    }

    const toList = Array.isArray(args.to) ? args.to : [args.to]
    if (toList.length === 0) {
      return { success: true, provider: 'brevo' }
    }

    // Brevo REST API v3 — közvetlen HTTP hívás (nem kell SDK-függőség)
    // https://developers.brevo.com/reference/sendtransacemail
    try {
      const body = {
        sender: { email: fromEmail, name: fromName },
        to: toList.map((r) => ({ email: r.email, name: r.name })),
        subject: args.subject,
        htmlContent: args.html,
        textContent: args.text,
        replyTo: args.replyTo
          ? { email: args.replyTo.email, name: args.replyTo.name }
          : undefined,
        tags: args.tags,
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.text()
        return {
          success: false,
          provider: 'brevo',
          error: `Brevo API ${res.status}: ${errBody.slice(0, 200)}`,
        }
      }

      const payload = (await res.json()) as { messageId?: string }
      return {
        success: true,
        provider: 'brevo',
        messageId: payload.messageId,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ismeretlen'
      return {
        success: false,
        provider: 'brevo',
        error: `Brevo hívási hiba: ${msg}`,
      }
    }
  },
}
