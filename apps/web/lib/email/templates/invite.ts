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

import { escHtml } from '../escape'
import type { EmailSendArgs } from '../types'
import { INVITE_FEATURE_CATEGORIES } from '@/app/(dashboard)/admin/meghivo-shared'

const APP_URL = 'https://kartoteka.app'
const LOGO_URL = `${APP_URL}/kartoteka-logo.png`
const ICON_URL = `${APP_URL}/EREK.png`
const CTA_URL = `${APP_URL}/hozzaferes-kerese`

/** A levél a fejlesztő-lelkipásztor nevében szól (2026-08-09, Endre kérése). */
const DEVELOPER_NAME = 'Szőcs Endre'
const DEVELOPER_TITLE = 'barátosi lelkipásztor, a Kartotéka fejlesztője'
const DEVELOPER_EMAIL = 'endreszocs@gmail.com'

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
  // Ha nem maga a fejlesztő küldi, a levél alján jelezzük, ki továbbította.
  // Ékezet- és sorrend-tűrő összevetés (Szőcs/Szocs, „Szőcs Endre"/„Endre Szőcs").
  const normalizeName = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const inviterNorm = normalizeName(inviterName)
  const inviterDiffers = !(inviterNorm.includes('szocs') && inviterNorm.includes('endre'))

  const greeting = name ? `Békesség Istentől, kedves ${name}!` : 'Békesség Istentől!'
  const subject = 'Békesség Istentől! — Meghívó a Kartotéka rendszerbe'

  // ── Plain-text változat ────────────────────────────────────────────────
  const text = `${greeting}

${DEVELOPER_NAME} vagyok, a barátosi református gyülekezet lelkipásztora.
A Kartotéka az én fejlesztésem: lelkészként pontosan tudom, mennyi időt
visznek el a nyilvántartások, a könyvelés és a hivatalos nyomtatványok —
ezért készítettem el ezt a rendszert, hogy mindez EGY helyen, egyszerűen
és magyarul intézhető legyen. Szeretettel hívlak, hogy a gyülekezeted is
használja!
${personalMessage ? `
${inviterDiffers ? `${inviterName} személyes üzenete:` : 'Személyes üzenetem:'}
„${personalMessage}"
` : ''}
MIT TUD A KARTOTÉKA?

${INVITE_FEATURE_CATEGORIES.map(
  (c) => `${c.emoji} ${c.title.toUpperCase()}
${c.items.map((i) => `   • ${i}`).join('\n')}`,
).join('\n\n')}

CSATLAKOZÁS — néhány perc az egész:
${CTA_URL}

Hogyan tovább?
  1. A fenti címen kitöltöd a rövid hozzáférés-kérelmet.
  2. A kérelmet jóváhagyjuk — erről e-mailt kapsz.
  3. Belépsz, és használatba veheted a gyülekezeted Kartotékáját.
${inviterDiffers ? `
Ezt a meghívót ${inviterName} küldte Neked a Kartotéka rendszeren keresztül.
` : ''}
Ha a meghívót nem vártad, vagy nem Neked szól, kérlek, hagyd figyelmen
kívül — fiók nem jön létre automatikusan.

Kérdésed van? Írj bátran: ${DEVELOPER_EMAIL}

Áldás, békesség!

${DEVELOPER_NAME}
${DEVELOPER_TITLE}
${APP_URL}`

  // ── HTML változat — a broadcast-levelek vizuális nyelvén ───────────────
  const personalMessageBlock = personalMessage
    ? `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr>
                        <td style="background:#f0fdfa;border-left:3px solid #0f766e;border-radius:0 12px 12px 0;padding:14px 18px">
                          <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#115e59">Személyes üzenet</p>
                          <p style="margin:0;font-size:15px;line-height:1.65;color:#134e4a;font-style:italic;white-space:pre-wrap">„${escHtml(personalMessage)}"</p>
                          <p style="margin:8px 0 0 0;font-size:13px;color:#0f766e;font-weight:600">— ${escHtml(inviterDiffers ? inviterName : DEVELOPER_NAME)}</p>
                        </td>
                      </tr>
                    </table>`
    : ''

  // Kategorizált rendszerbemutató — emoji + cím + pontokba szedett lista.
  const featureRows = INVITE_FEATURE_CATEGORIES.map(
    (c) => `
                      <tr>
                        <td colspan="2" style="padding:12px 0 3px 0;font-size:15px;color:#0f172a;font-weight:700">
                          <span style="font-size:17px;vertical-align:middle">${c.emoji}</span>&nbsp; ${escHtml(c.title)}
                        </td>
                      </tr>
${c.items
  .map(
    (i) => `
                      <tr>
                        <td valign="top" style="padding:2px 0 2px 8px;width:22px">
                          <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:#0f766e;margin-top:7px"></span>
                        </td>
                        <td style="padding:2px 0;font-size:13.5px;line-height:1.55;color:#334155">${escHtml(i)}</td>
                      </tr>`,
  )
  .join('')}`,
  ).join('')

  const steps: string[] = [
    'A fenti gombbal kitöltöd a rövid hozzáférés-kérelmet (néhány perc).',
    'A kérelmet jóváhagyjuk — erről e-mailt kapsz.',
    'Belépsz, és használatba veheted a gyülekezeted Kartotékáját.',
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
    Békesség Istentől! Szőcs Endre barátosi lelkipásztor vagyok — szeretettel hívlak a Kartotékába, az erdélyi gyülekezetek nyilvántartó rendszerébe.
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
                    <h1 style="margin:8px 0 0 0;font-family:'Georgia',serif;font-size:26px;line-height:1.25;color:#0f172a;font-weight:600">Szeretettel hívlak a Kartotékába</h1>

                    <!-- Elválasztó -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr><td style="border-top:1px solid #e2e8f0;line-height:0;height:0">&nbsp;</td></tr>
                    </table>

                    <p style="margin:0 0 14px 0;font-size:16px;color:#0f172a;font-weight:700">${escHtml(greeting)}</p>

                    <p style="margin:0 0 10px 0;font-size:15px;line-height:1.7;color:#334155">
                      <strong style="color:#0f172a">${DEVELOPER_NAME}</strong> vagyok, a barátosi református
                      gyülekezet lelkipásztora. A <strong style="color:#0f172a">Kartotéka</strong> az én
                      fejlesztésem: lelkészként pontosan tudom, mennyi időt visznek el a nyilvántartások,
                      a könyvelés és a hivatalos nyomtatványok — ezért készítettem el ezt a rendszert,
                      hogy mindez <strong style="color:#0f172a">egy helyen, egyszerűen és magyarul</strong>
                      intézhető legyen. Szeretettel hívlak, hogy a gyülekezeted is használja!
                    </p>
${personalMessageBlock}
                    <p style="margin:18px 0 2px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">Mit tud a Kartotéka?</p>

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
                      Ha a meghívót nem vártad, vagy nem Neked szól, kérlek, hagyd figyelmen kívül —
                      fiók nem jön létre automatikusan. Kérdésed van? Írj bátran:
                      <a href="mailto:${DEVELOPER_EMAIL}" style="color:#0f766e;text-decoration:underline">${DEVELOPER_EMAIL}</a>
                    </p>

                    <p style="margin:22px 0 0 0;font-size:15px;line-height:1.6;color:#334155">
                      Áldás, békesség!<br/>
                      <strong style="color:#0f172a">${DEVELOPER_NAME}</strong><br/>
                      <span style="font-size:13px;color:#64748b">${DEVELOPER_TITLE}</span>
                    </p>
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
