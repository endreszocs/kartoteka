import 'server-only'

/**
 * Broadcast email — az új `lib/email/send.ts` abstrakciót használja (2026-04-23 M0.2+).
 *
 * A provider választás env-ből: `EMAIL_PROVIDER=brevo|resend` (default: brevo).
 * Ez a wrapper kompatibilis a régi `sendBroadcastEmail(args)` hívásokkal, csak
 * belül a közös `sendEmail()` függvényt hívja.
 *
 * Chunk-olás: ha sok címzett van, a Brevo max 99, a Resend max 50 —
 * mi 50-es chunkokat küldünk (mindkettő elbírja).
 */

import type { BroadcastTipus } from './types'
import { sendEmail } from '@/lib/email/send'

interface SendBroadcastEmailArgs {
  to: string[]
  subject: string
  bodyText: string
  tipus: BroadcastTipus
  hivatkozas?: string | null
  /** Ha megadod, ezt a HTML-t használjuk a template helyett (pl. hírlevélhez). */
  customHtml?: string
}

export async function sendBroadcastEmail(
  args: SendBroadcastEmailArgs,
): Promise<{ success: boolean; error?: string; sent?: number }> {
  if (args.to.length === 0) {
    return { success: true, sent: 0 }
  }

  const html = args.customHtml ?? buildHtmlBody(args)
  const text = args.bodyText + (args.hivatkozas ? `\n\nRészletek: ${args.hivatkozas}` : '')

  // 50-es chunkok — mindegy melyik provider
  const chunks = chunkArray(args.to, 50)
  let totalSent = 0
  let firstError: string | undefined

  for (const chunk of chunks) {
    const result = await sendEmail({
      to: chunk.map((email) => ({ email })),
      subject: args.subject,
      text,
      html,
      tags: ['broadcast', args.tipus],
    })

    if (!result.success) {
      firstError = firstError || result.error
      // Nem dobjuk el a többi chunk-ot — próbálkozunk velük is,
      // de loggoljuk a hibát
      console.error(`[sendBroadcastEmail] chunk hiba: ${result.error}`)
    } else {
      totalSent += chunk.length
    }
  }

  if (firstError && totalSent === 0) {
    return { success: false, error: firstError }
  }

  return { success: true, sent: totalSent }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

const tipusAccent: Record<BroadcastTipus, { bg: string; text: string; label: string }> = {
  info: { bg: '#eff6ff', text: '#1e40af', label: 'Tájékoztatás' },
  success: { bg: '#f0fdf4', text: '#166534', label: 'Sikeres művelet' },
  warning: { bg: '#fefce8', text: '#854d0e', label: 'Figyelmeztetés' },
  danger: { bg: '#fef2f2', text: '#991b1b', label: 'Fontos' },
  release: { bg: '#f5f3ff', text: '#5b21b6', label: 'Új verzió' },
}

function buildHtmlBody(args: SendBroadcastEmailArgs): string {
  const accent = tipusAccent[args.tipus]
  const linkButton = args.hivatkozas
    ? `<p style="margin-top:24px"><a href="${escapeHtml(args.hivatkozas)}" style="display:inline-block;padding:12px 24px;background:#1e3a8a;color:#fff;text-decoration:none;border-radius:12px;font-weight:600">Részletek megtekintése</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans',Arial,sans-serif;color:#1e293b">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.04)">
      <div style="display:inline-block;padding:4px 12px;background:${accent.bg};color:${accent.text};border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">${accent.label}</div>
      <h1 style="margin:16px 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#0f172a">${escapeHtml(args.subject)}</h1>
      <div style="margin-top:16px;font-size:15px;line-height:1.6;color:#334155;white-space:pre-line">${escapeHtml(args.bodyText)}</div>
      ${linkButton}
    </div>
    <p style="margin-top:24px;text-align:center;font-size:12px;color:#94a3b8">Kartotéka — Egyházi nyilvántartó rendszer<br/>Az üzenetet az alkalmazás rendszergazdája küldte.</p>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
