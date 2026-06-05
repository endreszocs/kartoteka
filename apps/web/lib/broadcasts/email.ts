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
  // A customHtml (hírlevél) saját megszólítással jön — csak a sztenderd
  // (per-bejegyzés) broadcastnál tesszük elé a "Kedves Felhasználók!"-at.
  const text =
    (args.customHtml ? '' : 'Kedves Felhasználók!\n\n') +
    args.bodyText +
    (args.hivatkozas ? `\n\nRészletek: ${args.hivatkozas}` : '')

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

const tipusAccent: Record<BroadcastTipus, { bg: string; text: string; label: string; gradient: string }> = {
  info: {
    bg: '#eff6ff',
    text: '#1e40af',
    label: 'Tájékoztatás',
    gradient: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
  },
  success: {
    bg: '#f0fdf4',
    text: '#166534',
    label: 'Sikeres művelet',
    gradient: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
  },
  warning: {
    bg: '#fefce8',
    text: '#854d0e',
    label: 'Figyelmeztetés',
    gradient: 'linear-gradient(135deg, #854d0e 0%, #b45309 100%)',
  },
  danger: {
    bg: '#fef2f2',
    text: '#991b1b',
    label: 'Fontos',
    gradient: 'linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)',
  },
  release: {
    bg: '#f5f3ff',
    text: '#5b21b6',
    label: 'Új verzió',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
  },
}

// A production URL — a logót innen szolgáljuk ki minden email-fogadónak.
// Ha development-build, akkor is ez a host (a kép a publikus PWA manifest-en át
// elérhető — minden email-kliens letöltheti).
const APP_URL = 'https://kartoteka.app'
const LOGO_URL = `${APP_URL}/kartoteka-logo.png`
const ICON_URL = `${APP_URL}/EREK.png`

// ─────────────────────────────────────────────────────────────
// Markdown → HTML (kis, e-mail-barát renderelő) — hogy a CHANGELOG
// bejegyzések (félkövér, listák, ### címsorok) szépen, elválasztva jelenjenek meg.
// ─────────────────────────────────────────────────────────────

function renderInline(s: string): string {
  let r = escapeHtml(s)
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a">$1</strong>')
  r = r.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-family:monospace;font-size:90%">$1</code>')
  return r
}

function renderMarkdownEmail(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // ### / #### címsor — szekció-fejléc (szépen elválasztva)
    if (/^#{2,4}\s+/.test(line)) {
      closeList()
      const text = renderInline(line.replace(/^#{2,4}\s+/, ''))
      out.push(`<h3 style="margin:20px 0 8px;color:#0f766e;font-size:15px;font-weight:700;border-top:1px solid #e2e8f0;padding-top:14px">${text}</h3>`)
      continue
    }
    // üres sor
    if (line.trim() === '') { closeList(); continue }
    // vízszintes vonal
    if (/^-{3,}$/.test(line.trim())) { closeList(); continue }
    // lista
    const li = line.match(/^[-*]\s+(.+)$/)
    if (li) {
      if (!inList) { out.push('<ul style="margin:8px 0 14px 0;padding-left:20px;color:#334155">'); inList = true }
      out.push(`<li style="margin:6px 0;line-height:1.6">${renderInline(li[1])}</li>`)
      continue
    }
    // bekezdés
    closeList()
    out.push(`<p style="margin:10px 0;color:#334155;line-height:1.65">${renderInline(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}

function buildHtmlBody(args: SendBroadcastEmailArgs): string {
  const accent = tipusAccent[args.tipus]
  const linkButton = args.hivatkozas
    ? `
                <tr><td style="padding-top:24px" align="left">
                  <a href="${escapeHtml(args.hivatkozas)}" style="display:inline-block;padding:14px 28px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px">Részletek megtekintése</a>
                </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(args.subject)}</title>
  <!--[if mso]>
  <style type="text/css">body,table,td,p,a,li,blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}</style>
  <![endif]-->
  <style type="text/css">
    /* Reszponzív szélesség — desktop inboxban szélesebb, mobile-on full-width */
    @media only screen and (max-width:600px) {
      .kt-container { width: 100% !important; max-width: 100% !important; }
      .kt-pad-x { padding-left: 12px !important; padding-right: 12px !important; }
      .kt-card-pad { padding: 22px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased">
  <!-- Outer wrapper — full-width, gradient háttér -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:0;margin:0">
    <tr>
      <td align="center" style="padding:0;background:#f1f5f9">

        <!-- Inner container — max 920px, centered, mobile-on full-width -->
        <table role="presentation" class="kt-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:920px;width:100%">

          <!-- HEADER — Kartotéka brand sáv -->
          <tr>
            <td align="left" class="kt-pad-x" style="padding:32px 24px 0 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${accent.gradient};border-radius:20px 20px 0 0;padding:0">
                <tr>
                  <td class="kt-card-pad" style="padding:32px 36px 28px 36px" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:14px">
                          <img src="${LOGO_URL}" alt="Kartotéka" width="56" height="56" style="display:block;border-radius:14px;background:rgba(255,255,255,0.18);padding:8px" />
                        </td>
                        <td valign="middle">
                          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase">Kartotéka rendszer</p>
                          <h2 style="margin:4px 0 0 0;color:#ffffff;font-family:'Georgia',serif;font-size:22px;font-weight:600;letter-spacing:-0.01em">Egyházi nyilvántartó</h2>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT card -->
          <tr>
            <td align="left" class="kt-pad-x" style="padding:0 24px 0 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:0 0 20px 20px;box-shadow:0 8px 32px rgba(15,23,42,0.06)">
                <tr>
                  <td class="kt-card-pad" style="padding:32px 36px 32px 36px">
                    <!-- Accent badge -->
                    <p style="margin:0 0 12px 0;display:inline-block;padding:5px 14px;background:${accent.bg};color:${accent.text};border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${accent.label}</p>

                    <!-- Title -->
                    <h1 style="margin:8px 0 0 0;font-family:'Georgia',serif;font-size:26px;line-height:1.2;color:#0f172a;font-weight:600">${escapeHtml(args.subject)}</h1>

                    <!-- Divider -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr><td style="border-top:1px solid #e2e8f0;line-height:0;height:0">&nbsp;</td></tr>
                    </table>

                    <!-- Megszólítás -->
                    <p style="margin:0 0 14px 0;font-size:15px;color:#0f172a;font-weight:600">Kedves Felhasználók!</p>

                    <!-- Body (markdown → formázott HTML) -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:15px;color:#334155">${renderMarkdownEmail(args.bodyText)}</td>
                      </tr>
                      ${linkButton}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" class="kt-pad-x" style="padding:24px 24px 32px 24px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" valign="middle" style="padding-bottom:10px">
                    <img src="${ICON_URL}" alt="EREK" width="22" height="22" style="display:inline-block;vertical-align:middle;opacity:0.6" />
                    <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.12em">ERDÉLYI REFORMÁTUS EGYHÁZKERÜLET</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;color:#94a3b8;line-height:1.6;padding-bottom:4px">
                    Az üzenetet a Kartotéka rendszergazdája küldte.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;line-height:1.5">
                    <a href="${APP_URL}" style="color:#475569;text-decoration:underline;font-weight:500">Kartotéka rendszer megnyitása →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
