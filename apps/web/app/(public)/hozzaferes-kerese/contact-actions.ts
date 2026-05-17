'use server'

/**
 * Publikus kapcsolatfelvétel a rendszergazdával (2026-05-02, v0.9.36).
 *
 * A hozzáférés-kérelem sikeres beküldése után, ha a felhasználó nem kap
 * emailt, ezen az actionön át küldhet üzenetet közvetlenül a rendszergazdának.
 * Brevo-n keresztül megy, reply-to a felhasználó email-jére.
 */

import { sendEmail } from '@/lib/email/send'

// DIAGNOSTICS P3-4: SUPPORT_EMAIL env-ből (fallback a régi hardcode-ra
// a backward-compat miatt, amíg az env-változó nincs beállítva minden
// deployment-en).
const SYSADMIN_EMAIL = process.env.SUPPORT_EMAIL || 'endreszocs@gmail.com'
const SYSADMIN_NAME = process.env.SUPPORT_NAME || 'Szőcs Endre rendszergazda'

export interface ContactSysadminInput {
  fromEmail: string
  fromName: string
  message: string
}

export interface ContactSysadminResult {
  success: boolean
  error?: string
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function contactSysadmin(
  input: ContactSysadminInput,
): Promise<ContactSysadminResult> {
  const fromEmail = (input.fromEmail || '').trim().toLowerCase()
  const fromName = (input.fromName || '').trim()
  const message = (input.message || '').trim()

  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { success: false, error: 'Érvényes email-címet adjon meg.' }
  }
  if (!fromName || fromName.length < 2) {
    return { success: false, error: 'Adja meg a nevét.' }
  }
  if (!message || message.length < 10) {
    return { success: false, error: 'Üzenet legalább 10 karakter hosszú legyen.' }
  }
  if (message.length > 5000) {
    return { success: false, error: 'Üzenet legfeljebb 5000 karakter lehet.' }
  }

  const subject = `Kartotéka — kapcsolatfelvétel: ${fromName}`

  const text = `${fromName} (${fromEmail}) üzenete a Kartotéka publikus oldaláról:

${message}

──────────────────────────────────────────────
Erre az email-re közvetlenül válaszolhatsz — a Reply-To a kérelmező címére mutat.`

  const html = `
<div style="font-family:'Inter',Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fffefa;color:#1f2a24;">
  <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px;">
    Új kapcsolatfelvétel
  </div>

  <h2 style="font-family:Georgia,'Cormorant Garamond',serif;font-size:22px;margin:0 0 16px;color:#0f3a32;">
    ${escHtml(fromName)}
  </h2>

  <p style="margin:0 0 16px;font-size:14px;color:#475569;">
    A felhasználó <strong>${escHtml(fromEmail)}</strong> email-címről jelentkezett a Kartotéka publikus
    oldalán a hozzáférés-kérelem után. Az alábbi üzenetet hagyta:
  </p>

  <div style="background:#f8fafc;border-left:3px solid #166534;padding:14px 18px;border-radius:6px;margin:16px 0;">
    <p style="margin:0;font-size:14px;color:#1e293b;white-space:pre-wrap;line-height:1.6;">
${escHtml(message)}
    </p>
  </div>

  <p style="margin:24px 0 8px;font-size:13px;color:#64748b;">
    Erre az email-re közvetlenül válaszolhatsz — a <strong>Reply-To</strong> mező a kérelmező
    címére mutat (${escHtml(fromEmail)}).
  </p>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <p style="margin:0;font-size:12px;color:#94a3b8;font-style:italic;">
    Kartotéka — Erdélyi Református Egyházkerület<br/>
    Automatikusan küldött üzenet a publikus kapcsolat-űrlapról.
  </p>
</div>`

  const res = await sendEmail({
    to: { email: SYSADMIN_EMAIL, name: SYSADMIN_NAME },
    subject,
    text,
    html,
    replyTo: { email: fromEmail, name: fromName },
    tags: ['contact-sysadmin'],
  })

  if (!res.success) {
    return {
      success: false,
      error: 'Az üzenet küldése nem sikerült. Próbálja meg később, vagy küldjön közvetlenül emailt.',
    }
  }

  return { success: true }
}
