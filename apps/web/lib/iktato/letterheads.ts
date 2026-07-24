/**
 * Iktató F8a — többnyelvű hivatalos fejléc (levélfej) építő.
 *
 * Balra igazított elrendezés (user-kérés, 2026-07-25): a LOGÓ (cimer_url)
 * a BAL oldalon, mellette jobbra a szöveg-blokk:
 *
 *     [logó]   A Barátosi Református Egyházközség
 *              Lelkipásztori Hivatala
 *              527045 Barátos, Fő út 45.        ← cím magyarul
 *              527045 Barătoș, Str. …           ← cím románul, KÜLÖN sorban,
 *                                                  ha ismert (most: nincs tárolva
 *                                                  → egy közös sor)
 *              CIF: 12345678
 *              Telefon/fax: 0267-123456 · E-mail: … · Web: …
 *     ────────────────────────────────────── (dupla elválasztó-vonal)
 *
 * HÁROM NYELV (hu/ro/en): a gyülekezet neve a fejléc nyelvéhez igazodik
 * (nev_hu/nev_ro/nev_en, fallback: hivatalos name), a feliratok
 * („Lelkipásztori Hivatala" / „Oficiul Parohial" / „Parish Office",
 * „Telefon/fax:" stb.) az adott nyelven jelennek meg. Hiányzó adat esetén
 * a teljes sor/felirat kimarad (nem marad üres „Telefon:" címke).
 *
 * Tisztán szinkron, DB-mentes modul — a sablon-HTML elejére ágyazódik
 * (inline CSS, a renderTemplate/A4-előnézet pipeline-nal kompatibilis;
 * az előnézet, a PDF és a nyomtatás ugyanezt a markupot kapja — WYSIWYG).
 */

import type { CongregationHeaderData, LetterheadLang } from './certificate-types'

/** A fejléc-nyelvválasztó opciói (UI select-hez). */
export const LETTERHEAD_LANGS: Array<{ value: LetterheadLang; label: string }> = [
  { value: 'hu', label: 'Magyar' },
  { value: 'ro', label: 'Română' },
  { value: 'en', label: 'English' },
]

/** A „Lelkipásztori Hivatala" felirat megfelelője nyelvenként. */
const OFFICE_LABELS: Record<LetterheadLang, string> = {
  hu: 'Lelkipásztori Hivatala',
  ro: 'Oficiul Parohial',
  en: 'Parish Office',
}

/** A „Telefon/fax:" címke nyelvenként (a román is Telefon/fax-ot használ). */
const PHONE_LABELS: Record<LetterheadLang, string> = {
  hu: 'Telefon/fax:',
  ro: 'Telefon/fax:',
  en: 'Phone/fax:',
}

/** HTML-escape minden dinamikus értékre (XSS + törött markup ellen). */
function esc(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** "A" / "Az" névelő a gyülekezetnév első betűje szerint (magánhangzó → "Az"). */
function huArticle(name: string): string {
  const first = (name.trim().charAt(0) || '').toLowerCase()
  return 'aáeéiíoóöőuúüű'.includes(first) ? 'Az' : 'A'
}

/** A gyülekezet neve a fejléc nyelvén — hiányzó fordításnál a hivatalos név. */
function pickName(lang: LetterheadLang, header: CongregationHeaderData): string {
  const fallback = (header.hivatalosNev || '').trim()
  const byLang =
    lang === 'ro' ? header.nevRo : lang === 'en' ? header.nevEn : header.nevHu
  return (byLang || '').trim() || fallback
}

/**
 * Egy "címke: érték" pár, csak ha van érték — különben üres string,
 * így a hiányzó adat felirata sem jelenik meg.
 */
function labeled(label: string, value: string | null): string {
  const v = (value || '').trim()
  return v ? `${label} ${esc(v)}` : ''
}

/** A nem-üres darabok összefűzése " · " elválasztóval egy sorrá. */
function joinRow(parts: string[]): string {
  return parts.filter(Boolean).join(' &middot; ')
}

/**
 * A hivatalos fejléc-blokk HTML-je a kért nyelven.
 *
 * A visszaadott HTML önhordó (inline CSS), a sablon-tartalom ELÉ fűzhető —
 * az A4-előnézet, a PDF és a nyomtatás ugyanazt a markupot kapja.
 * MEGJEGYZÉS: ez a blokk app-generált (NEM megy át a sanitizeFilingHtml-en),
 * ezért használhat flex/object-fit tulajdonságokat is.
 */
export function buildLetterheadHtml(lang: LetterheadLang, header: CongregationHeaderData): string {
  const nev = pickName(lang, header)

  const textLines: string[] = []

  // (1) Az egyházközség neve a fejléc nyelvén + alatta a hivatal-felirat.
  if (nev) {
    const title = lang === 'hu' ? `${huArticle(nev)} ${esc(nev)}` : esc(nev)
    textLines.push(
      `<div style="font-weight:bold;font-size:15px;letter-spacing:0.02em;">${title}</div>`,
      `<div style="font-weight:bold;font-size:13px;letter-spacing:0.02em;">${esc(OFFICE_LABELS[lang])}</div>`,
    )
  }

  // (2) Cím: magyarul ÉS külön sorban románul, ha mindkét változat ismert;
  // ha csak az egyik áll rendelkezésre, az kerül ki EGY (közös) sorban.
  const cimHu = (header.cimHu || '').trim()
  const cimRo = (header.cimRo || '').trim()
  const addressLines = cimRo && cimRo !== cimHu ? [cimHu, cimRo].filter(Boolean) : cimHu ? [cimHu] : cimRo ? [cimRo] : []
  addressLines.forEach((a, i) => {
    textLines.push(`<div${i === 0 ? ' style="margin-top:3px;"' : ''}>${esc(a)}</div>`)
  })

  // (3) CIF külön sorban.
  const cifRow = labeled('CIF:', header.cif)
  if (cifRow) textLines.push(`<div>${cifRow}</div>`)

  // (4) Elérhetőségek egy sorban — csak a kitöltöttek.
  const contactRow = joinRow([
    labeled(PHONE_LABELS[lang], header.telefon),
    labeled('E-mail:', header.email),
    labeled('Web:', header.web),
  ])
  if (contactRow) textLines.push(`<div>${contactRow}</div>`)

  // Logó balra — hiányában a szöveg-blokk önmagában, továbbra is balra zárva.
  const logo = header.cimerUrl
    ? `<img src="${esc(header.cimerUrl)}" alt="" style="height:64px;max-width:110px;object-fit:contain;flex:0 0 auto;display:block;" />`
    : ''

  return `<div style="display:flex;align-items:center;gap:16px;text-align:left;font-family:'Times New Roman',serif;font-size:12px;line-height:1.5;padding-bottom:10px;margin-bottom:24px;border-bottom:2px double #000;">
  ${logo}
  <div style="flex:1 1 auto;min-width:0;">
    ${textLines.join('\n    ')}
  </div>
</div>`
}
