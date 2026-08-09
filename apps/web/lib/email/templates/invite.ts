import 'server-only'

/**
 * Admin-meghívó e-mail sablon (2026-08-09).
 *
 * A rendszergazda (vagy kerületi admin) egy ismert e-mail-címre küld szép,
 * személyes hangvételű meghívót a Kartotéka rendszerbe. A CTA a kanonikus
 * regisztrációs oldalra mutat (/hozzaferes-kerese) — ott a meghívott a bevett,
 * biztonságos úton hozza létre a fiókját (kérelem → rendszergazdai jóváhagyás).
 *
 * A vizuális réteg a broadcast-levelek buildHtmlBody() mintáját követi
 * (lib/broadcasts/email.ts): MSO-safe táblás layout, gradient brand-fejléc
 * logóval, fehér tartalomkártya, reszponzív @media szabályok, EREK-lábléc.
 */

import type { EmailSendArgs } from '../types'

const APP_URL = 'https://kartoteka.app'
const LOGO_URL = `${APP_URL}/kartoteka-logo.png`
const ICON_URL = `${APP_URL}/EREK.png`
const CTA_URL = `${APP_URL}/hozzaferes-kerese`

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A rendszer főbb moduljai — a levélben rövid „mit kap" felsorolásként. */
const FEATURES: Array<{ title: string; desc: string }> = [
  { title: 'Tagnyilvántartás', desc: 'családi kartonok, választói névjegyzék, családfa' },
  { title: 'Pénzügy', desc: 'járulékok, nyugták, számadás, költségvetés' },
  { title: 'Anyakönyvek', desc: 'keresztelés, konfirmáció, esketés, temetés' },
  { title: 'Leltár és iktató', desc: 'hivatalos iratok, jegyzőkönyvek egy helyen' },
]

export function inviteEmail(args: {
  email: string
  /** A meghívott neve — ha az admin megadta. */
  name?: string | null
  /** A meghívó admin neve (a levélben feladóként jelenik meg). */
  inviterName: string
  /** Az admin opcionális személyes üzenete. */
  personalMessage?: string | null
}): EmailSendArgs {
  const name = args.name?.trim() || ''
  const personalMessage = args.personalMessage?.trim() || ''
  const inviterName = args.inviterName.trim() || 'A Kartotéka rendszergazdája'

  const greeting = name ? `Kedves ${name}!` : 'Kedves Testvérünk!'
  const subject = `${inviterName} meghívja Önt a Kartotéka rendszerbe`

  // ── Plain-text változat ────────────────────────────────────────────────
  const text = `${greeting}

${inviterName} szeretettel meghívja Önt a Kartotéka rendszerbe — az Erdélyi
Református Egyházkerület gyülekezeti nyilvántartó alkalmazásába.
${personalMessage ? `
Személyes üzenete:
„${personalMessage}"
` : ''}
A Kartotékában egy helyen kezelheti gyülekezete életét:
${FEATURES.map((f) => `  • ${f.title} — ${f.desc}`).join('\n')}

Csatlakozáshoz nyissa meg az alábbi oldalt, és töltse ki a rövid
hozzáférés-kérelmet (néhány perc):
${CTA_URL}

Hogyan tovább?
  1. Kitölti a hozzáférés-kérelmet a fenti linken.
  2. A rendszergazda jóváhagyja a kérelmét — erről e-mailt kap.
  3. Beléphet, és használatba veheti gyülekezete Kartotékáját.

Ha a meghívót nem várta, vagy nem Önnek szól, kérjük, hagyja figyelmen kívül —
fiók nem jön létre automatikusan.

Áldott napot kíván:
A Kartotéka rendszer
Erdélyi Református Egyházkerület`

  // ── HTML változat — a broadcast-levelek vizuális nyelvén ───────────────
  const personalMessageBlock = personalMessage
    ? `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr>
                        <td style="background:#f0fdfa;border-left:3px solid #0f766e;border-radius:0 12px 12px 0;padding:14px 18px">
                          <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#115e59">Személyes üzenet</p>
                          <p style="margin:0;font-size:15px;line-height:1.65;color:#134e4a;font-style:italic;white-space:pre-wrap">„${escHtml(personalMessage)}"</p>
                          <p style="margin:8px 0 0 0;font-size:13px;color:#0f766e;font-weight:600">— ${escHtml(inviterName)}</p>
                        </td>
                      </tr>
                    </table>`
    : ''

  const featureRows = FEATURES.map(
    (f) => `
                      <tr>
                        <td valign="top" style="padding:6px 0;width:22px">
                          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#0f766e;margin-top:6px"></span>
                        </td>
                        <td style="padding:6px 0;font-size:14px;line-height:1.55;color:#334155">
                          <strong style="color:#0f172a">${escHtml(f.title)}</strong> — ${escHtml(f.desc)}
                        </td>
                      </tr>`,
  ).join('')

  const steps: string[] = [
    'Kitölti a rövid hozzáférés-kérelmet a fenti gombbal (néhány perc).',
    'A rendszergazda jóváhagyja a kérelmét — erről e-mailt kap.',
    'Beléphet, és használatba veheti gyülekezete Kartotékáját.',
  ]
  const stepRows = steps
    .map(
      (s, i) => `
                      <tr>
                        <td valign="top" style="padding:5px 10px 5px 0;width:30px">
                          <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:999px;background:#ccfbf1;color:#115e59;font-size:12px;font-weight:700;text-align:center">${i + 1}</span>
                        </td>
                        <td style="padding:5px 0;font-size:14px;line-height:1.55;color:#334155">${escHtml(s)}</td>
                      </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escHtml(subject)}</title>
  <!--[if mso]>
  <style type="text/css">body,table,td,p,a,li,blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}</style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width:600px) {
      .kt-container { width: 100% !important; max-width: 100% !important; }
      .kt-pad-x { padding-left: 12px !important; padding-right: 12px !important; }
      .kt-card-pad { padding: 22px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased">
  <!-- Előnézeti szöveg (inbox-preview) — a levélben nem látszik -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
    Szeretettel meghívjuk a Kartotékába — az erdélyi gyülekezetek közös nyilvántartó rendszerébe.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:0;margin:0">
    <tr>
      <td align="center" style="padding:0;background:#f1f5f9">

        <table role="presentation" class="kt-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%">

          <!-- HEADER — Kartotéka brand sáv -->
          <tr>
            <td align="left" class="kt-pad-x" style="padding:32px 24px 0 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#115e59 0%,#0f766e 55%,#14b8a6 100%);border-radius:20px 20px 0 0;padding:0">
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
                    <!-- Badge -->
                    <p style="margin:0 0 12px 0;display:inline-block;padding:5px 14px;background:#f0fdfa;color:#115e59;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Személyes meghívó</p>

                    <!-- Cím -->
                    <h1 style="margin:8px 0 0 0;font-family:'Georgia',serif;font-size:26px;line-height:1.25;color:#0f172a;font-weight:600">Szeretettel meghívjuk a Kartotékába</h1>

                    <!-- Elválasztó -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr><td style="border-top:1px solid #e2e8f0;line-height:0;height:0">&nbsp;</td></tr>
                    </table>

                    <p style="margin:0 0 14px 0;font-size:15px;color:#0f172a;font-weight:600">${escHtml(greeting)}</p>

                    <p style="margin:0 0 10px 0;font-size:15px;line-height:1.65;color:#334155">
                      <strong style="color:#0f172a">${escHtml(inviterName)}</strong> szeretettel meghívja Önt a
                      <strong style="color:#0f172a">Kartotéka</strong> rendszerbe — az Erdélyi Református Egyházkerület
                      gyülekezeti nyilvántartó alkalmazásába, amelyet lelkipásztorok és gyülekezeti
                      munkatársak használnak nap mint nap.
                    </p>
${personalMessageBlock}
                    <p style="margin:16px 0 6px 0;font-size:15px;line-height:1.65;color:#334155">A Kartotékában egy helyen kezelheti gyülekezete életét:</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px 0">
${featureRows}
                    </table>

                    <!-- CTA -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding:22px 0 6px 0">
                          <a href="${CTA_URL}" style="display:inline-block;padding:15px 34px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:14px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(15,118,110,0.35)">Csatlakozom a Kartotékához &rarr;</a>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:0 0 10px 0;font-size:12px;color:#94a3b8">A gomb a hivatalos regisztrációs oldalra visz: ${CTA_URL.replace('https://', '')}</td>
                      </tr>
                    </table>

                    <!-- Lépések -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 4px 0;background:#f8fafc;border-radius:14px">
                      <tr>
                        <td style="padding:16px 18px">
                          <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">Hogyan tovább?</p>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${stepRows}
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#94a3b8">
                      Ha a meghívót nem várta, vagy nem Önnek szól, kérjük, hagyja figyelmen kívül —
                      fiók nem jön létre automatikusan.
                    </p>

                    <p style="margin:20px 0 0 0;font-size:14px;font-style:italic;color:#64748b">Áldott napot kíván:<br/>A Kartotéka rendszer</p>
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
                    A meghívót ${escHtml(inviterName)} küldte a Kartotéka rendszeren keresztül.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;line-height:1.5">
                    <a href="${APP_URL}" style="color:#475569;text-decoration:underline;font-weight:500">Kartotéka rendszer megnyitása &rarr;</a>
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

  return {
    to: { email: args.email, name: name || undefined },
    subject,
    text,
    html,
    tags: ['admin-invite'],
  }
}
