import 'server-only'

/**
 * Eszköz revoke / restore email-sablonok (M4.2).
 *
 * Két helyzetre:
 *   1. deviceRevokedEmail — a user-nek, ha az admin visszavonta az eszközét
 *   2. deviceRestoredEmail — a user-nek, ha az admin feloldotta a revoke-ot
 *
 * Stílus: ugyanaz, mint az access-request-emaileknél, csak más accent-színnel
 * (revoke = destructive/rose, restore = emerald).
 */

import type { EmailSendArgs } from '../types'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(opts: {
  accentColor: string
  accentBg: string
  accentLabel: string
  title: string
  bodyHtml: string
  footerNote?: string
}): string {
  return `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
      <div style="display:inline-block;padding:4px 12px;background:${opts.accentBg};color:${opts.accentColor};border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
        ${escHtml(opts.accentLabel)}
      </div>
      <h1 style="margin:16px 0 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;color:#0f172a;line-height:1.3;">
        ${escHtml(opts.title)}
      </h1>
      <div style="margin-top:16px;font-size:15px;line-height:1.6;color:#334155;">
        ${opts.bodyHtml}
      </div>
    </div>
    <p style="margin-top:24px;text-align:center;font-size:12px;color:#94a3b8;">
      Kartotéka — Egyházi nyilvántartó rendszer<br/>
      ${opts.footerNote ? escHtml(opts.footerNote) : 'Erdélyi Református Egyházkerület'}
    </p>
  </div>
</body></html>`
}

function formatHungarianDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 1) REVOKED — az eszköz hozzáférését visszavonták
// ─────────────────────────────────────────────────────────────────────────

export function deviceRevokedEmail(args: {
  email: string
  fullName: string | null
  deviceName: string | null
  platform: string
  reason: string
  revokedAtIso: string
}): EmailSendArgs {
  const subject = `Kartotéka — eszköz hozzáférése visszavonva`
  const greeting = args.fullName ? `Tisztelt ${args.fullName}!` : 'Tisztelt Felhasználó!'
  const displayName = args.deviceName || args.platform
  const whenLabel = formatHungarianDateTime(args.revokedAtIso)

  const text = `${greeting}

A rendszergazda visszavonta a(z) "${displayName}" (${args.platform}) eszköz hozzáférését a Kartotéka rendszerhez.

Visszavonás időpontja: ${whenLabel}
Indok: ${args.reason}

Az adott eszközön ezentúl nem tud bejelentkezni. A rendszer automatikusan kijelentkezteti.

Ha ezt tévedésnek tartja, keresse fel az egyházkerületi rendszergazdát, aki a hozzáférést ismét engedélyezheti.

Áldott napot kíván:
Az Erdélyi Református Egyházkerület Kartotéka rendszere`

  const html = layout({
    accentColor: '#b91c1c',
    accentBg: '#fee2e2',
    accentLabel: 'Eszköz visszavonva',
    title: greeting,
    bodyHtml: `
      <p>A rendszergazda visszavonta a(z)
      <strong>${escHtml(displayName)}</strong> (${escHtml(args.platform)})
      eszköz hozzáférését a Kartotéka rendszerhez.</p>

      <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <p style="margin:0 0 6px;font-size:13px;color:#7f1d1d;font-weight:600;">Visszavonás időpontja</p>
        <p style="margin:0 0 12px;font-size:14px;color:#7f1d1d;">${escHtml(whenLabel)}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#7f1d1d;font-weight:600;">Indok</p>
        <p style="margin:0;font-size:14px;color:#7f1d1d;">${escHtml(args.reason)}</p>
      </div>

      <p>Az adott eszközön ezentúl nem tud bejelentkezni — a rendszer automatikusan
      kijelentkezteti, amint észleli a visszavonást (legkésőbb 30 másodpercen belül).</p>

      <p>Ha ezt tévedésnek tartja, keresse fel az egyházkerületi rendszergazdát,
      aki a hozzáférést ismét engedélyezheti.</p>

      <p style="margin-top:24px;font-style:italic;color:#64748b;">Áldott napot kíván:<br/>
      Az Erdélyi Református Egyházkerület Kartotéka rendszere</p>
    `,
    footerNote: 'Ez az email a rendszergazda által indított visszavonásra automatikusan keletkezett.',
  })

  return { to: { email: args.email, name: args.fullName ?? undefined }, subject, text, html }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) RESTORED — az admin feloldotta a revoke-ot
// ─────────────────────────────────────────────────────────────────────────

export function deviceRestoredEmail(args: {
  email: string
  fullName: string | null
  deviceName: string | null
  platform: string
  restoredAtIso: string
}): EmailSendArgs {
  const subject = `Kartotéka — eszköz hozzáférése újra engedélyezve`
  const greeting = args.fullName ? `Tisztelt ${args.fullName}!` : 'Tisztelt Felhasználó!'
  const displayName = args.deviceName || args.platform
  const whenLabel = formatHungarianDateTime(args.restoredAtIso)

  const text = `${greeting}

A rendszergazda újra engedélyezte a(z) "${displayName}" (${args.platform}) eszköz hozzáférését a Kartotéka rendszerhez.

Feloldás időpontja: ${whenLabel}

Az adott eszközön újra bejelentkezhet.

Áldott napot kíván:
Az Erdélyi Református Egyházkerület Kartotéka rendszere`

  const html = layout({
    accentColor: '#047857',
    accentBg: '#d1fae5',
    accentLabel: 'Eszköz újra aktív',
    title: greeting,
    bodyHtml: `
      <p>A rendszergazda újra engedélyezte a(z)
      <strong>${escHtml(displayName)}</strong> (${escHtml(args.platform)})
      eszköz hozzáférését a Kartotéka rendszerhez.</p>

      <div style="background:#f0fdf4;border-left:3px solid #10b981;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <p style="margin:0 0 6px;font-size:13px;color:#065f46;font-weight:600;">Feloldás időpontja</p>
        <p style="margin:0;font-size:14px;color:#065f46;">${escHtml(whenLabel)}</p>
      </div>

      <p>Az adott eszközön újra bejelentkezhet a Kartotéka rendszerbe.</p>

      <p style="margin-top:24px;font-style:italic;color:#64748b;">Áldott napot kíván:<br/>
      Az Erdélyi Református Egyházkerület Kartotéka rendszere</p>
    `,
    footerNote: 'Ez az email a rendszergazda által indított feloldásra automatikusan keletkezett.',
  })

  return { to: { email: args.email, name: args.fullName ?? undefined }, subject, text, html }
}
