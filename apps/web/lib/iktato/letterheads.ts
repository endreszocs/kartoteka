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
 * NÉGY NYELV (hu/ro/en/de — a német F8e, 2026-07-25): a gyülekezet neve a
 * fejléc nyelvéhez igazodik (nev_hu/nev_ro/nev_en, fallback: hivatalos name),
 * a feliratok („Lelkipásztori Hivatala" / „Oficiul Parohial" / „Parish Office" /
 * „Pfarramt", „Telefon/fax:" stb.) az adott nyelven jelennek meg. Hiányzó adat
 * esetén a teljes sor/felirat kimarad (nem marad üres „Telefon:" címke).
 *
 * NÉMET NÉV: a gyülekezetnek NINCS német nevet tároló oszlopa, ezért a német
 * fejléc a magyar/hivatalos névből képezi a „Reformierte Kirchengemeinde
 * {helység}" alakot (deGemeindeNev) — a helységnevet a jól ismert név-alakokból
 * bontja ki (gyulekezetNevMag). A dokumentum-törzs német formulái ugyanezt a
 * magot használják („Das Pfarramt der Reformierten Kirchengemeinde …").
 *
 * Tisztán szinkron, DB-mentes modul — a sablon-HTML elejére ágyazódik
 * (inline CSS, a renderTemplate/A4-előnézet pipeline-nal kompatibilis;
 * az előnézet, a PDF és a nyomtatás ugyanezt a markupot kapja — WYSIWYG).
 * A gyökér-elem `class="letterhead"` horgonyt is kap, hogy a közös A4-stíluslap
 * (dokumentum-stilus.ts) a `.page__header` sávban finomhangolhassa.
 */

import type { CongregationHeaderData, LetterheadLang } from './certificate-types'

/** A fejléc-nyelvválasztó opciói (UI select-hez). */
export const LETTERHEAD_LANGS: Array<{ value: LetterheadLang; label: string }> = [
  { value: 'hu', label: 'Magyar' },
  { value: 'ro', label: 'Română' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]

/** A „Lelkipásztori Hivatala" felirat megfelelője nyelvenként. */
const OFFICE_LABELS: Record<LetterheadLang, string> = {
  hu: 'Lelkipásztori Hivatala',
  ro: 'Oficiul Parohial',
  en: 'Parish Office',
  de: 'Pfarramt',
}

/** A „Telefon/fax:" címke nyelvenként (a román is Telefon/fax-ot használ). */
const PHONE_LABELS: Record<LetterheadLang, string> = {
  hu: 'Telefon/fax:',
  ro: 'Telefon/fax:',
  en: 'Phone/fax:',
  de: 'Telefon/Fax:',
}

/**
 * Román utcanév-típusok, amelyek elé NEM kell „str. " előtag: már van típus-
 * megjelölés (str./strada/aleea/bulevardul/calea/piața/șoseaua…), vagy a cím
 * eleve házszámmal kezdődik (falusi „nr. 45" forma).
 */
const RO_UTCA_TIPUS = /^(str\.?|strada|stradela|aleea|bulevardul|b-?dul\.?|calea|pia[țt]a|p-?[țt]a\.?|șoseaua|sos\.?|splaiul|drumul|intrarea|fundătura|fundatura|trecerea|nr\.?)(\s|$)/i

/**
 * A cím ROMÁN sorának utcaneve elé „str. " előtag, ha még nincs típus-
 * megjelölése (user-észrevétel, 2026-07-25: a román címsor hivatalos formája
 * „str. {utcanév} {házszám}"). Számmal kezdődő értéket (házszám-only cím)
 * változatlanul hagy. A MAGYAR sor utcaneve érintetlen marad.
 */
export function roUtcaElotag(utcaNev: string): string {
  const t = (utcaNev || '').trim()
  if (!t || /^\d/.test(t) || RO_UTCA_TIPUS.test(t)) return t
  return `str. ${t}`
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

// ─────────────────────────────────────────────────────────────────
// Gyülekezetnév-„mag" (helységnév) — a német formulákhoz (F8e)
// ─────────────────────────────────────────────────────────────────

/**
 * A gyülekezetnév HELYSÉG-MAGJA a jól ismert név-alakokból:
 *   „Parohia Reformată Barătoș"        → „Barătoș"
 *   „Barátosi Református Egyházközség" → „Barátos"   (a magyar „-i" képző le)
 *   „Reformed Parish of Barátos"       → „Barátos"
 *   „Reformierte Kirchengemeinde …"    → „…"
 * Ismeretlen alaknál `null` — ilyenkor a hívó a TELJES nevet használja egy
 * nyelvtanilag semleges formulában (nem gyárt hibás német szerkezetet).
 *
 * Miért kell: a gyülekezetnek nincs német (és gyakran angol) nevet tároló
 * oszlopa, a német fejléc/törzs viszont „Reformierte Kirchengemeinde {helység}"
 * alakot kíván — ezt a magból építjük.
 */
export function gyulekezetNevMag(nev: string): string | null {
  const t = (nev || '').trim()
  if (!t) return null

  const roM = t.match(/^parohia\s+reformat[aă]\s+(.+)$/i)
  if (roM) return roM[1].trim()

  const enM = t.match(/^(?:the\s+)?reformed\s+parish\s+of\s+(.+)$/i)
  if (enM) return enM[1].trim()

  const deM = t.match(/^(?:die\s+)?reformierten?\s+kirchengemeinde\s+(.+)$/i)
  if (deM) return deM[1].trim()

  // Magyar: „(A) Barátosi Református Egyházközség(e)" → „Barátosi" → „Barátos".
  const huM = t.match(/^(?:a[z]?\s+)?(.+?)\s+reform[áa]tus\s+egyh[áa]zk[öo]zs[ée]g(?:e)?$/i)
  if (huM) {
    const jelzo = huM[1].trim()
    // A magyar „-i" melléknévképző levágása (Barátosi → Barátos, Kolozsvári →
    // Kolozsvár). Csak akkor, ha marad értelmes hosszúságú tő.
    if (/i$/i.test(jelzo) && jelzo.length > 3) return jelzo.slice(0, -1)
    return jelzo
  }

  return null
}

/**
 * A gyülekezet NÉMET neve: „Reformierte Kirchengemeinde {helység}".
 * Ismeretlen név-alaknál a nyers nevet adja vissza (nem told hozzá hibásan
 * ragozott német szerkezetet). PLAIN szöveget ad — a hívó escape-el.
 */
export function deGemeindeNev(nev: string): string {
  const mag = gyulekezetNevMag(nev)
  return mag ? `Reformierte Kirchengemeinde ${mag}` : (nev || '').trim()
}

/** A gyülekezet neve a fejléc nyelvén — hiányzó fordításnál a hivatalos név. */
function pickName(lang: LetterheadLang, header: CongregationHeaderData): string {
  const fallback = (header.hivatalosNev || '').trim()
  // Németnek nincs saját oszlopa (CongregationHeaderData változatlan) → a
  // magyar név a kiindulás, abból képezzük a német alakot (lásd lentebb).
  const byLang =
    lang === 'ro' ? header.nevRo : lang === 'en' ? header.nevEn : header.nevHu
  const alap = (byLang || '').trim() || fallback
  return lang === 'de' ? deGemeindeNev(alap) : alap
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
 *
 * F8e: a gyökér `class="letterhead"`, a sorok `letterhead__*` osztályokat
 * kapnak (a közös A4-stíluslap horgonyai), a külső térköz pedig mm-ben van —
 * így a blokk pontosan illeszkedik a `.page__header` flex-sávba. A belső
 * inline stílusok megmaradnak, hogy a levélfej stíluslap NÉLKÜL is (pl. az
 * életút-nyomtatványban) ugyanúgy nézzen ki.
 */
export function buildLetterheadHtml(lang: LetterheadLang, header: CongregationHeaderData): string {
  const nev = pickName(lang, header)

  const textLines: string[] = []

  // (1) Az egyházközség neve a fejléc nyelvén + alatta a hivatal-felirat.
  if (nev) {
    const title = lang === 'hu' ? `${huArticle(nev)} ${esc(nev)}` : esc(nev)
    textLines.push(
      `<div class="letterhead__title" style="font-weight:bold;font-size:13.5pt;letter-spacing:0.02em;">${title}</div>`,
      `<div class="letterhead__office" style="font-weight:bold;font-size:11pt;letter-spacing:0.02em;">${esc(OFFICE_LABELS[lang])}</div>`,
    )
  }

  // (2) Cím: magyarul ÉS külön sorban románul, ha mindkét változat ismert;
  // ha csak az egyik áll rendelkezésre, az kerül ki EGY (közös) sorban.
  const cimHu = (header.cimHu || '').trim()
  const cimRo = (header.cimRo || '').trim()
  const addressLines = cimRo && cimRo !== cimHu ? [cimHu, cimRo].filter(Boolean) : cimHu ? [cimHu] : cimRo ? [cimRo] : []
  addressLines.forEach((a, i) => {
    textLines.push(
      `<div class="letterhead__row"${i === 0 ? ' style="margin-top:1mm;"' : ''}>${esc(a)}</div>`,
    )
  })

  // (3) CIF külön sorban.
  const cifRow = labeled('CIF:', header.cif)
  if (cifRow) textLines.push(`<div class="letterhead__row">${cifRow}</div>`)

  // (4) Elérhetőségek egy sorban — csak a kitöltöttek.
  const contactRow = joinRow([
    labeled(PHONE_LABELS[lang], header.telefon),
    labeled('E-mail:', header.email),
    labeled('Web:', header.web),
  ])
  if (contactRow) textLines.push(`<div class="letterhead__row">${contactRow}</div>`)

  // Logó balra — hiányában a szöveg-blokk önmagában, továbbra is balra zárva.
  // A méret mm-ben: a levélfej-sáv így minden lap-léptékkel együtt skálázódik
  // (a hivatalos fejléc-sáv a felső 45mm-en belül marad).
  const logo = header.cimerUrl
    ? `<img src="${esc(header.cimerUrl)}" alt="" style="height:18mm;max-width:30mm;object-fit:contain;flex:0 0 auto;display:block;" />`
    : ''

  return `<div class="letterhead" style="display:flex;align-items:center;gap:5mm;text-align:left;font-family:'Times New Roman',serif;font-size:10pt;line-height:1.35;padding-bottom:2.5mm;margin:0 0 6mm;border-bottom:2px double #000;">
  ${logo}
  <div style="flex:1 1 auto;min-width:0;">
    ${textLines.join('\n    ')}
  </div>
</div>`
}
