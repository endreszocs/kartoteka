import type { EmailSendArgs } from '../types'

/**
 * 2026-06-05 — Lelkészcsere-átadás értesítő email a rendszergazdának és az
 * egyházmegyei számvevőnek, amikor a távozó lelkész elindítja az átadást.
 */
export function transferInitiatedEmail(args: {
  recipientEmail: string
  recipientName?: string
  recipientRole: 'rendszergazda' | 'számvevő'
  congregationName: string
  fromPastorName: string
  reason?: string | null
  portalUrl: string
}): EmailSendArgs {
  const { recipientEmail, recipientName, recipientRole, congregationName, fromPastorName, reason, portalUrl } = args

  const subject = `Lelkészcsere-átadás indult: ${congregationName}`

  const intro = `${recipientName ? recipientName + ',' : 'Kedves Címzett,'}`
  const roleLine =
    recipientRole === 'számvevő'
      ? 'Mint az egyházmegye számvevője, kérjük, nézd át a gyülekezet adatait, és hagyd jóvá vagy rögzíts meghagyásokat.'
      : 'Mint rendszergazda, kérjük, nézd át a gyülekezet adatait, és hagyd jóvá vagy rögzíts meghagyásokat. (Ha az egyházmegyében nincs számvevő, a te jóváhagyásod elegendő — kérjük, vedd fel a kapcsolatot a számvevővel.)'

  const text =
    `${intro}\n\n` +
    `${fromPastorName} elindította a(z) ${congregationName} gyülekezet átadását.\n\n` +
    (reason ? `Indok: ${reason}\n\n` : '') +
    `${roleLine}\n\n` +
    `Nyisd meg a rendszert: ${portalUrl}\n\n` +
    `Áldás, Kartotéka`

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="color:#0f172a;font-size:20px">Lelkészcsere-átadás indult</h2>
    <p>${intro}</p>
    <p><strong>${fromPastorName}</strong> elindította a(z) <strong>${congregationName}</strong>
       gyülekezet átadását.</p>
    ${reason ? `<p style="background:#f1f5f9;border-radius:10px;padding:10px 12px"><strong>Indok:</strong> ${reason}</p>` : ''}
    <p>${roleLine}</p>
    <p style="margin:24px 0">
      <a href="${portalUrl}" style="background:#0ea5e9;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:10px;display:inline-block">Megnyitás a rendszerben</a>
    </p>
    <p style="color:#64748b;font-size:13px">Áldás,<br/>Kartotéka</p>
  </div>`

  return {
    to: { email: recipientEmail, name: recipientName },
    subject,
    text,
    html,
    tags: ['congregation-transfer'],
  }
}

/** A bejövő lelkésznek, amikor a rendszergazda véglegesítette az átadást. */
export function transferCompletedEmail(args: {
  recipientEmail: string
  recipientName?: string
  congregationName: string
  loginUrl: string
}): EmailSendArgs {
  const { recipientEmail, recipientName, congregationName, loginUrl } = args
  const subject = `Átvetted a(z) ${congregationName} gyülekezetet`
  const text =
    `${recipientName ? recipientName + ',' : 'Kedves Lelkész,'}\n\n` +
    `A rendszergazda véglegesítette az átadást: mostantól a(z) ${congregationName} gyülekezet ` +
    `lelkészeként használhatod a Kartotéka rendszert.\n\nBelépés: ${loginUrl}\n\nÁldás, Kartotéka`
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="color:#0f172a;font-size:20px">Átvetted a gyülekezetet</h2>
    <p>${recipientName ? recipientName + ',' : 'Kedves Lelkész,'}</p>
    <p>A rendszergazda véglegesítette az átadást: mostantól a(z) <strong>${congregationName}</strong>
       gyülekezet lelkészeként használhatod a Kartotéka rendszert.</p>
    <p style="margin:24px 0">
      <a href="${loginUrl}" style="background:#10b981;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:10px;display:inline-block">Belépés</a>
    </p>
    <p style="color:#64748b;font-size:13px">Áldás,<br/>Kartotéka</p>
  </div>`
  return { to: { email: recipientEmail, name: recipientName }, subject, text, html, tags: ['congregation-transfer'] }
}

/** A bejövő lelkésznek, ha MÉG NINCS a rendszerben — regisztrálnia kell. */
export function transferInviteEmail(args: {
  recipientEmail: string
  congregationName: string
  registerUrl: string
}): EmailSendArgs {
  const { recipientEmail, congregationName, registerUrl } = args
  const subject = `Meghívó: vedd át a(z) ${congregationName} gyülekezetet a Kartotékában`
  const text =
    `Kedves Lelkész,\n\n` +
    `Téged jelöltek meg a(z) ${congregationName} gyülekezet új lelkészeként a Kartotéka rendszerben. ` +
    `Mivel még nincs fiókod, kérjük, regisztrálj (igényelj hozzáférést), és válaszd ki a(z) ${congregationName} ` +
    `gyülekezetet. A rendszergazda ezután jóváhagyja a hozzáférésed.\n\n` +
    `Regisztráció: ${registerUrl}\n\nÁldás, Kartotéka`
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="color:#0f172a;font-size:20px">Meghívó a gyülekezet átvételére</h2>
    <p>Kedves Lelkész,</p>
    <p>Téged jelöltek meg a(z) <strong>${congregationName}</strong> gyülekezet új lelkészeként.
       Mivel még nincs fiókod, kérjük, <strong>regisztrálj</strong> (igényelj hozzáférést), és válaszd ki a(z)
       <strong>${congregationName}</strong> gyülekezetet. A rendszergazda ezután jóváhagyja a hozzáférésed.</p>
    <p style="margin:24px 0">
      <a href="${registerUrl}" style="background:#0ea5e9;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:10px;display:inline-block">Regisztráció / hozzáférés igénylése</a>
    </p>
    <p style="color:#64748b;font-size:13px">Áldás,<br/>Kartotéka</p>
  </div>`
  return { to: { email: recipientEmail }, subject, text, html, tags: ['congregation-transfer'] }
}
