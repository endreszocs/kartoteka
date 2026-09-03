import 'server-only'

/**
 * ANAF SPV 60 napos letöltési határidő — emlékeztető e-mail (2026-09-03).
 *
 * Endre kérése: a lelkész KÉRÉSÉRE tudjon e-mailt küldeni arról, hogy régóta
 * (pl. két hónapja) nem volt Oblio-import.
 *
 * ⚠️ EZ SOHA NEM MEGY EL MAGÁTÓL. Kizárólag a felületen indított, tudatos
 * kattintásra küldjük — a levél a lelkész saját döntése, nem a rendszeré.
 *
 * MIÉRT FONTOS: az ANAF SPV csak 60 napra visszamenőleg adja vissza a
 * befogadott számlákat. A 60. nap után a régebbi számlák onnan MÁR NEM
 * tölthetők le — egyenként kell elkérni a beszállítótól.
 */

import { escHtml } from '../escape'
import type { EmailSendArgs, EmailRecipient } from '../types'

export interface OblioHataridoEmailArgs {
  cimzett: EmailRecipient
  /** A gyülekezet megjelenítendő neve. */
  gyulekezet: string
  /** Hány nap telt el az utolsó Oblio-letöltés óta. `null` = még soha nem volt. */
  eltelt: number | null
  /** Az utolsó letöltés napja (YYYY-MM-DD), ha volt. */
  utolsoLetoltes: string | null
}

/** Hónapokban is kimondjuk, mert így fogja fel az ember („már két hónapja"). */
function honapSzoveg(nap: number): string {
  const honap = Math.floor(nap / 30)
  if (honap < 1) return `${nap} napja`
  if (honap === 1) return `több mint egy hónapja (${nap} napja)`
  return `több mint ${honap} hónapja (${nap} napja)`
}

export function oblioHataridoEmail(args: OblioHataridoEmailArgs): EmailSendArgs {
  const { cimzett, gyulekezet, eltelt, utolsoLetoltes } = args

  const lejart = eltelt != null && eltelt >= 60
  const soha = eltelt == null

  const accentColor = lejart ? '#b91c1c' : '#a16207'
  const accentBg = lejart ? '#fee2e2' : '#fef3c7'
  const accentLabel = lejart ? 'Lejárt határidő' : 'Esedékes teendő'

  const cim = soha
    ? 'Még nem volt e-Factura beolvasás'
    : lejart
      ? 'Lejárt az ANAF SPV 60 napos letöltési határidő'
      : 'Közeledik az ANAF SPV letöltési határidő'

  const vezeto = soha
    ? `A <strong>${escHtml(gyulekezet)}</strong> nyilvántartásában még egyetlen befogadott e-Factura beolvasás sincs rögzítve.`
    : `A <strong>${escHtml(gyulekezet)}</strong> utolsó e-Factura beolvasása <strong>${escHtml(
        honapSzoveg(eltelt as number),
      )}</strong> történt${utolsoLetoltes ? ` (${escHtml(utolsoLetoltes)})` : ''}.`

  const kovetkezmeny = lejart
    ? `<p style="margin:0 0 12px;"><strong>Az ANAF SPV csak 60 napra visszamenőleg adja vissza a befogadott
         számlákat.</strong> A 60 napnál régebbi számlák onnan már <strong>nem tölthetők le</strong> — azokat
         egyenként kell elkérni a beszállítótól.</p>`
    : `<p style="margin:0 0 12px;">Az ANAF SPV csak <strong>60 napra visszamenőleg</strong> adja vissza a
         befogadott számlákat. Amíg ezen belül vagy, minden letölthető — utána viszont a beszállítótól
         kell elkérni a hiányzókat.</p>`

  const teendo = `
    <p style="margin:0 0 8px;font-weight:600;color:#0f172a;">Mi a teendő</p>
    <ol style="margin:0 0 12px;padding-left:20px;line-height:1.7;">
      <li>Jelentkezz be az <strong>Oblio Wallet</strong> felületére.</li>
      <li>Töltsd le a befogadott e-Facturák ZIP-jét.</li>
      <li>Tedd a fájlt a Kartotéka <strong>Oblio → befogadott</strong> mappájába.</li>
      <li>Az asztali Kartotékában indítsd el a <strong>beolvasást</strong>.</li>
    </ol>`

  const bodyHtml = `
    <p style="margin:0 0 12px;">${vezeto}</p>
    ${kovetkezmeny}
    ${teendo}
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
      Ezt a levelet a Kartotéka azért küldte, mert valaki a Pénzügy → Oblio ellenőrzés
      felületen kérte. A rendszer magától nem küld ilyen emlékeztetőt.
    </p>`

  const text = [
    cim,
    '',
    soha
      ? `A ${gyulekezet} nyilvántartásában még egyetlen befogadott e-Factura beolvasás sincs rögzítve.`
      : `A ${gyulekezet} utolsó e-Factura beolvasása ${honapSzoveg(eltelt as number)} történt${
          utolsoLetoltes ? ` (${utolsoLetoltes})` : ''
        }.`,
    '',
    lejart
      ? 'Az ANAF SPV csak 60 napra visszamenőleg adja vissza a befogadott számlákat. A 60 napnál régebbi számlák onnan már NEM tölthetők le — azokat egyenként kell elkérni a beszállítótól.'
      : 'Az ANAF SPV csak 60 napra visszamenőleg adja vissza a befogadott számlákat.',
    '',
    'Mi a teendő:',
    '  1. Jelentkezz be az Oblio Wallet felületére.',
    '  2. Töltsd le a befogadott e-Facturák ZIP-jét.',
    '  3. Tedd a fájlt a Kartotéka Oblio → befogadott mappájába.',
    '  4. Az asztali Kartotékában indítsd el a beolvasást.',
    '',
    'Ezt a levelet a Kartotéka azért küldte, mert valaki a Pénzügy → Oblio ellenőrzés felületen kérte.',
    'A rendszer magától nem küld ilyen emlékeztetőt.',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
      <div style="display:inline-block;padding:4px 12px;background:${accentBg};color:${accentColor};border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
        ${escHtml(accentLabel)}
      </div>
      <h1 style="margin:16px 0 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;color:#0f172a;line-height:1.3;">
        ${escHtml(cim)}
      </h1>
      <div style="margin-top:16px;font-size:15px;line-height:1.6;color:#334155;">
        ${bodyHtml}
      </div>
    </div>
    <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#94a3b8;">Kartotéka · kartoteka.app</p>
  </div>
</body></html>`

  return {
    to: cimzett,
    subject: soha
      ? `Kartotéka — még nem volt e-Factura beolvasás (${gyulekezet})`
      : lejart
        ? `Kartotéka — LEJÁRT az ANAF 60 napos határidő (${gyulekezet})`
        : `Kartotéka — esedékes az e-Factura beolvasás (${gyulekezet})`,
    text,
    html,
    tags: ['oblio-hatarido'],
  }
}
