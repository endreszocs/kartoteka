import 'server-only'

/**
 * Access-request email-sablonok (M0.2).
 *
 * Négy helyzetre:
 *   1. confirmationEmail — a kérelmezőnek, hogy megkaptuk a kérelmét
 *   2. adminNotificationEmail — az adminnak, hogy új kérelem érkezett
 *   3. approvedEmail — a kérelmezőnek, hogy elfogadtuk (M0.3-ban küldi majd a rendszer)
 *   4. rejectedEmail — a kérelmezőnek, hogy elutasítottuk (indoklással)
 *
 * Mindegyik Hungarian, barátságos hangvételű, pásztori kontextusban.
 *
 * A sablonok tiszta HTML + inline CSS (email-kliensek Tailwind-et nem értik),
 * mobil-kompatibilisek (max-width 600px), és a fontok fallback-olnak
 * (Cormorant Garamond → Georgia → Times New Roman).
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

/** Közös header/footer, hogy minden email egységes legyen */
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

// ─────────────────────────────────────────────────────────────────────────
// 1) CONFIRMATION — a kérelmezőnek, hogy megkaptuk
// ─────────────────────────────────────────────────────────────────────────

export function confirmationEmail(args: {
  email: string
  fullName: string
  requestedRole: string
}): EmailSendArgs {
  const subject = `Kartotéka — hozzáférés-kérelmét megkaptuk, ${args.fullName}`

  const text = `Tisztelt ${args.fullName}!

Köszönjük, hogy hozzáférés-kérelmet nyújtott be a Kartotéka rendszerhez (${args.requestedRole} szerepkörre).

A kérelmét rögzítettük, és az egyházkerületi rendszergazda rövidesen átnézi.
Általában 1-3 munkanapon belül válaszolunk. Amint döntöttünk, emailben értesítjük.

Ha bármilyen kérdése van, válaszoljon erre az emailre.

Áldott napot kíván:
A Kartotéka rendszer`

  const html = layout({
    accentColor: '#1e40af',
    accentBg: '#eff6ff',
    accentLabel: 'Kérelem rögzítve',
    title: `Tisztelt ${escHtml(args.fullName)}!`,
    bodyHtml: `
      <p>Köszönjük, hogy hozzáférés-kérelmet nyújtott be a Kartotéka rendszerhez
      <strong>${escHtml(args.requestedRole)}</strong> szerepkörre.</p>

      <p>A kérelmét rögzítettük, és az egyházkerületi rendszergazda rövidesen átnézi.
      Általában <strong>1-3 munkanapon belül</strong> válaszolunk. Amint döntöttünk, emailben értesítjük.</p>

      <div style="background:#f0fdf4;border-left:3px solid #10b981;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#065f46;">
          Ha bármilyen kérdése van, válaszoljon erre az emailre — a rendszergazda látni fogja.
        </p>
      </div>

      <p style="margin-top:24px;font-style:italic;color:#64748b;">Áldott napot kíván:<br/>
      A Kartotéka rendszer</p>
    `,
    footerNote: 'Ez egy automatikus visszaigazolás — a rendszer generálta.',
  })

  return { to: { email: args.email, name: args.fullName }, subject, text, html }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) ADMIN NOTIFICATION — az admin-nak új kérelem jött
// ─────────────────────────────────────────────────────────────────────────

export function adminNotificationEmail(args: {
  adminEmail: string
  adminName?: string
  requesterName: string
  requesterEmail: string
  requestedRole: string
  congregationSlug?: string | null
  justification?: string | null
  adminPortalUrl: string
}): EmailSendArgs {
  const subject = `[Kartotéka] Új hozzáférés-kérelem — ${args.requesterName} (${args.requestedRole})`

  const text = `Új hozzáférés-kérelem érkezett:

Név: ${args.requesterName}
Email: ${args.requesterEmail}
Szerepkör: ${args.requestedRole}
${args.congregationSlug ? `Gyülekezet: ${args.congregationSlug}\n` : ''}${args.justification ? `Indoklás: ${args.justification}\n\n` : '\n'}
Átnézés: ${args.adminPortalUrl}

Kartotéka Admin`

  const html = layout({
    accentColor: '#854d0e',
    accentBg: '#fefce8',
    accentLabel: 'Új kérelem',
    title: 'Új hozzáférés-kérelem érkezett',
    bodyHtml: `
      <p>${args.adminName ? `Tisztelt ${escHtml(args.adminName)}!` : 'Tisztelt rendszergazda!'}</p>

      <p>Új hozzáférés-kérelem érkezett a Kartotéka rendszerhez:</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:120px;">Név:</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escHtml(args.requesterName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Email:</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">
            <a href="mailto:${escHtml(args.requesterEmail)}" style="color:#0f766e;text-decoration:none;">
              ${escHtml(args.requesterEmail)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Szerepkör:</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escHtml(args.requestedRole)}</td>
        </tr>
        ${args.congregationSlug ? `
        <tr>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Gyülekezet:</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escHtml(args.congregationSlug)}</td>
        </tr>
        ` : ''}
      </table>

      ${args.justification ? `
      <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:600;color:#475569;">Indoklás:</p>
        <p style="margin:0;font-style:italic;color:#334155;white-space:pre-wrap;">„${escHtml(args.justification)}"</p>
      </div>
      ` : ''}

      <p style="margin-top:24px;">
        <a href="${escHtml(args.adminPortalUrl)}" style="display:inline-block;padding:12px 24px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;">
          Kérelmek átnézése →
        </a>
      </p>

      <p style="margin-top:16px;font-size:13px;color:#64748b;">
        Amíg nem dönt, a kérelmezőt a rendszer <strong>„várakozásban"</strong> állapotba teszi. Általában 1-3 munkanap az ajánlott válaszidő.
      </p>
    `,
  })

  return {
    to: { email: args.adminEmail, name: args.adminName },
    subject,
    text,
    html,
    tags: ['access-request', 'admin-notification'],
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) APPROVED — a kérelmezőnek, hogy elfogadtuk
// ─────────────────────────────────────────────────────────────────────────

export function approvedEmail(args: {
  email: string
  fullName: string
  inviteUrl: string           // a link, amivel a user regisztrálni tudja magát (Supabase invite URL)
  requestedRole: string
}): EmailSendArgs {
  const subject = `Kartotéka — hozzáférés-kérelmét elfogadtuk, ${args.fullName}`

  const text = `Tisztelt ${args.fullName}!

Örömmel értesítjük, hogy a Kartotéka rendszerhez benyújtott hozzáférés-kérelmét ELFOGADTUK.
Szerepköre a rendszerben: ${args.requestedRole}.

A belépéshez kattintson az alábbi linkre, és állítsa be a jelszavát:
${args.inviteUrl}

Ez a link 7 napig érvényes.

Üdvözlettel:
A Kartotéka rendszer`

  const html = layout({
    accentColor: '#166534',
    accentBg: '#f0fdf4',
    accentLabel: 'Elfogadva',
    title: `Örömmel értesítjük, ${escHtml(args.fullName)}!`,
    bodyHtml: `
      <p>A Kartotéka rendszerhez benyújtott hozzáférés-kérelmét <strong>elfogadtuk</strong>.</p>

      <p>Szerepköre a rendszerben:
      <strong style="color:#0f766e;">${escHtml(args.requestedRole)}</strong></p>

      <p>A belépéshez kattintson az alábbi gombra, és állítsa be a jelszavát:</p>

      <p style="margin:24px 0;text-align:center;">
        <a href="${escHtml(args.inviteUrl)}" style="display:inline-block;padding:14px 32px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;">
          Belépés beállítása →
        </a>
      </p>

      <p style="font-size:13px;color:#64748b;">Ez a link <strong>7 napig</strong> érvényes. Ha lejárt, kérjük, válaszoljon erre az emailre, és új linket küldünk.</p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>

      <p style="margin-top:16px;font-style:italic;color:#64748b;">Áldott napot kíván:<br/>
      A Kartotéka rendszer</p>
    `,
  })

  return { to: { email: args.email, name: args.fullName }, subject, text, html }
}

// ─────────────────────────────────────────────────────────────────────────
// 4) REJECTED — a kérelmezőnek, hogy elutasítottuk
// ─────────────────────────────────────────────────────────────────────────

export function rejectedEmail(args: {
  email: string
  fullName: string
  rejectionReason: string
}): EmailSendArgs {
  const subject = `Kartotéka — hozzáférés-kérelméről, ${args.fullName}`

  const text = `Tisztelt ${args.fullName}!

Sajnálattal értesítjük, hogy a Kartotéka rendszerhez benyújtott hozzáférés-kérelmét nem tudjuk elfogadni a jelenlegi formájában.

Oka:
${args.rejectionReason}

Ha a kérdés tisztázódik, nyugodtan küldjön új kérelmet vagy válaszoljon erre az emailre.

Üdvözlettel:
A Kartotéka rendszer`

  const html = layout({
    accentColor: '#991b1b',
    accentBg: '#fef2f2',
    accentLabel: 'Nem fogadható el',
    title: `Tisztelt ${escHtml(args.fullName)}!`,
    bodyHtml: `
      <p>Sajnálattal értesítjük, hogy a Kartotéka rendszerhez benyújtott hozzáférés-kérelmét
      <strong>nem tudjuk elfogadni</strong> a jelenlegi formájában.</p>

      <div style="background:#fef2f2;border-left:3px solid #991b1b;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <p style="margin:0 0 8px;font-weight:600;color:#991b1b;">Oka:</p>
        <p style="margin:0;color:#450a0a;white-space:pre-wrap;">${escHtml(args.rejectionReason)}</p>
      </div>

      <p>Ha a kérdés tisztázódik, nyugodtan küldjön új kérelmet vagy válaszoljon erre az emailre —
      a rendszergazda látni fogja.</p>

      <p style="margin-top:24px;font-style:italic;color:#64748b;">Üdvözlettel:<br/>
      A Kartotéka rendszer</p>
    `,
  })

  return { to: { email: args.email, name: args.fullName }, subject, text, html }
}
