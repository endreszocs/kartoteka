/**
 * Iktató F6 — többnyelvű hivatalos fejléc (levélfej) építő (KONTRAKTUS B).
 *
 * A user példa-formátuma szerinti, középre zárt fejléc-blokk:
 *
 *     [címer, ha van]
 *     A Barátosi Református Egyházközség
 *     Lelkipásztori Hivatala
 *     527045 Barátos, Fő út 45.
 *     Telefon/fax: 0267-123456 · CIF: 12345678
 *     E-mail: hivatal@example.com · Web: www.example.com
 *     ────────────────────────────────────
 *
 * RO változat: "Oficiul Parohial al Parohiei Reformate …" stílusban,
 * ugyanazokkal a mezőkkel. Hiányzó adat esetén a teljes sor/felirat
 * kimarad (nem marad üres "Telefon:" címke).
 *
 * Tisztán szinkron, DB-mentes modul — a sablon-HTML elejére ágyazódik
 * (inline CSS, a renderTemplate/A4-előnézet pipeline-nal kompatibilis).
 */

import type { CongregationHeaderData, LetterheadLang } from './certificate-types'

/** A fejléc-nyelvválasztó opciói (UI select-hez). */
export const LETTERHEAD_LANGS: Array<{ value: LetterheadLang; label: string }> = [
  { value: 'hu', label: 'Magyar' },
  { value: 'ro', label: 'Română' },
]

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
 * az A4-előnézet és a nyomtatás ugyanazt a markupot kapja.
 */
export function buildLetterheadHtml(lang: LetterheadLang, header: CongregationHeaderData): string {
  const nev = (header.hivatalosNev || '').trim()

  // Cím-sorok nyelvenként: a név + "Lelkipásztori Hivatala" két sorban.
  const titleLines: string[] =
    lang === 'ro'
      ? ['Oficiul Parohial al', `Parohiei Reformate &ndash; ${esc(nev)}`]
      : [`${huArticle(nev)} ${esc(nev)}`, 'Lelkipásztori Hivatala']

  const contactRow1 = joinRow([
    labeled('Telefon/fax:', header.telefon),
    labeled('CIF:', header.cif),
  ])
  const contactRow2 = joinRow([
    labeled('E-mail:', header.email),
    labeled('Web:', header.web),
  ])

  const lines: string[] = []
  if (header.cimerUrl) {
    lines.push(
      `<img src="${esc(header.cimerUrl)}" alt="" style="height:58px;max-width:120px;object-fit:contain;display:block;margin:0 auto 6px;" />`,
    )
  }
  if (nev) {
    lines.push(
      `<div style="font-weight:bold;font-size:15px;letter-spacing:0.02em;">${titleLines[0]}</div>`,
      `<div style="font-weight:bold;font-size:15px;letter-spacing:0.02em;">${titleLines[1]}</div>`,
    )
  }
  if (header.cim) {
    lines.push(`<div style="margin-top:2px;">${esc(header.cim)}</div>`)
  }
  if (contactRow1) lines.push(`<div>${contactRow1}</div>`)
  if (contactRow2) lines.push(`<div>${contactRow2}</div>`)

  return `<div style="text-align:center;font-family:'Times New Roman',serif;font-size:12px;line-height:1.45;padding-bottom:8px;margin-bottom:24px;border-bottom:2px double #000;">
  ${lines.join('\n  ')}
</div>`
}
