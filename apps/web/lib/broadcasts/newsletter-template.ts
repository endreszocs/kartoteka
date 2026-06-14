/**
 * Fejlesztési hírlevél HTML template.
 *
 * A szokásos CHANGELOG bejegyzésekből generál egy szép, átlátható és érthető
 * HTML emailt. A lelkészeknek szól: világos nyelv, gyönyörű tipográfia,
 * kategória-szerinti csoportosítás, emoji ikonok.
 *
 * Használat:
 *   import { buildNewsletterHtml } from '@/lib/broadcasts/newsletter-template'
 *   const html = buildNewsletterHtml({ entries, introText, periodLabel })
 */

import type { ChangelogEntry, ReleaseCategory } from './types'

// A Kartotéka logó — a production domainről szolgáljuk ki, hogy minden
// email-kliens letölthesse (ugyanaz a forrás, mint a broadcast emailben).
const LOGO_URL = 'https://kartoteka.app/kartoteka-logo.png'

// DicsHub — egy másik, szintén lelkészi szolgálatot segítő projekt ajánlója.
const DICSHUB_LOGO_URL = 'https://kartoteka.app/dicshub-logo.png'
const DICSHUB_URL = 'https://www.dicshub.com/'

/** A hírlevél végére kerülő, barátságos „kedvcsináló" a DicsHub projekthez. */
function dicsHubPromoHtml(): string {
  return `
    <div class="kt-promo" style="margin:0 28px 24px;padding:22px 20px;background:linear-gradient(135deg,#f0f9ff 0%,#eef2ff 100%);border:1px solid #bae6fd;border-radius:14px;text-align:center;">
      <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0369a1;">Egy másik eszköz a szolgálatához</p>
      <img src="${DICSHUB_LOGO_URL}" alt="DicsHub" width="190" style="display:inline-block;width:190px;max-width:72%;height:auto;margin-bottom:10px;" />
      <p style="margin:0 0 12px;font-size:13px;color:#334155;line-height:1.65;">
        A <strong>DicsHub</strong> egy modern istentiszteleti prezentáció- és dicsőítés-szervező
        alkalmazás magyar lelkészeknek és istentisztelet-vezetőknek: énekek, igeversek, imák és
        liturgia-sablonok, gyönyörű kivetítés, telefonos távvezérlő és PowerPoint-export — minden egy helyen.
        Ha keresi, mi segíthet az istentiszteletek előkészítésében, érdemes kipróbálni!
      </p>
      <a href="${DICSHUB_URL}" style="display:inline-block;margin-top:2px;padding:11px 24px;background:#0c4a6e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px;">Fedezze fel a DicsHub-ot →</a>
      <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">www.dicshub.com</p>
    </div>
  `
}

export interface NewsletterInput {
  /** A hírlevélbe kerülő változásnaplók (már szűrt + sorrendezett). */
  entries: ChangelogEntry[]
  /** A lelkésznek szóló rövid bevezetés (szabadon szerkeszthető). */
  introText?: string
  /** „2026 tavasz" vagy „2026. április — új funkciók" stb. */
  periodLabel?: string
  /** Fejléc cím (alapértelmezett: "Kartotéka — Fejlesztési hírlevél") */
  headerTitle?: string
}

// ─────────────────────────────────────────────────────────────
// Segéd
// ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** A markdown body-t egyszerű HTML-re konvertáljuk (nem teljes markdown parser). */
function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const htmlParts: string[] = []
  let inList = false
  let inCodeBlock = false

  for (const raw of lines) {
    const line = raw

    // Code block
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        htmlParts.push('</pre>')
        inCodeBlock = false
      } else {
        if (inList) {
          htmlParts.push('</ul>')
          inList = false
        }
        htmlParts.push('<pre style="background:#f8fafc;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;">')
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      htmlParts.push(esc(line))
      continue
    }

    // H3/H4
    if (line.match(/^###\s+/)) {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      htmlParts.push(`<h3 style="margin:16px 0 6px;color:#0f172a;font-size:15px;font-weight:700;">${markdownInlineToHtml(line.replace(/^###\s+/, ''))}</h3>`)
      continue
    }

    // Üres sor
    if (line.trim() === '') {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      continue
    }

    // Lista
    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      if (!inList) {
        htmlParts.push('<ul style="margin:6px 0 10px 18px;padding:0;color:#334155;">')
        inList = true
      }
      htmlParts.push(`<li style="margin:4px 0;line-height:1.5;">${markdownInlineToHtml(listMatch[1])}</li>`)
      continue
    }

    // Bekezdés
    if (inList) { htmlParts.push('</ul>'); inList = false }
    htmlParts.push(`<p style="margin:8px 0;color:#334155;line-height:1.55;">${markdownInlineToHtml(line)}</p>`)
  }

  if (inList) htmlParts.push('</ul>')
  if (inCodeBlock) htmlParts.push('</pre>')

  return htmlParts.join('\n')
}

function markdownInlineToHtml(s: string): string {
  // Először escape-eljünk, aztán replace-eljünk
  let result = esc(s)
  // **bold**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // *italic* vagy _italic_
  result = result.replace(/(?:^|\s)\*([^*\s][^*]*[^*\s]|\w)\*(?=\s|$)/g, (m, g) => m.replace(`*${g}*`, `<em>${g}</em>`))
  // `code`
  result = result.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:3px;font-family:monospace;font-size:90%;overflow-wrap:anywhere;word-break:break-word;">$1</code>')
  return result
}

// ─────────────────────────────────────────────────────────────
// Kategória-vizuális
// ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<ReleaseCategory, {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  security: {
    label: 'Biztonsági javítások',
    icon: '🔒',
    color: '#b91c1c',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  bugfix: {
    label: 'Hibajavítások',
    icon: '🐛',
    color: '#c2410c',
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  feature: {
    label: 'Új funkciók',
    icon: '✨',
    color: '#15803d',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  improvement: {
    label: 'Fejlesztések',
    icon: '🚀',
    color: '#1d4ed8',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  breaking: {
    label: 'Fontos változások',
    icon: '⚠️',
    color: '#a16207',
    bgColor: '#fefce8',
    borderColor: '#fde68a',
  },
}

const UNCATEGORIZED_META = {
  label: 'Egyéb frissítések',
  icon: '📣',
  color: '#64748b',
  bgColor: '#f8fafc',
  borderColor: '#e2e8f0',
}

// ─────────────────────────────────────────────────────────────
// Fő build
// ─────────────────────────────────────────────────────────────

/**
 * 2026-06-13 (Endre — Gmail-clipping ellen): a kész hírlevél-HTML
 * minifikálása, hogy a TELJES levél (a DicsHub-ajánlóval együtt) EGY emailbe
 * férjen a Gmail ~102 KB-os csonkolási határa alatt (ajánlott cél: < 80 KB).
 *
 * Biztonságos szabályok (EmailOnAcid / Litmus / HTML Crush gyakorlat):
 *  - a sima HTML-kommentek törlése, DE az Outlook feltételes kommentek
 *    (`<!--[if ...]> ... <![endif]-->`, `mso`) MEGŐRZÉSE,
 *  - a `<style>`-blokk CSS-ének tömörítése (CSS-komment + felesleges whitespace),
 *  - a TAG-KÖZI (struktúra-) whitespace összevonása — a `>\s+<` minta CSAK a
 *    tagok közti tiszta behúzást érinti, a szöveg-tartalom közti szándékos
 *    szóközöket NEM (azokat betű előzi/követi, pl. „A <strong>DicsHub</strong>").
 *
 * Nem változtat látható tartalmat; a builder a kiküldéshez ÉS az előnézethez is
 * ezt adja, így a kettő bájtra azonos.
 */
function minifyEmailHtml(html: string): string {
  return html
    // 1) <style> CSS tömörítése
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, css: string) => {
      const min = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // CSS-kommentek
        .replace(/\s+/g, ' ') // whitespace → egy szóköz
        .replace(/\s*([{}:;,])\s*/g, '$1') // operátorok körüli szóköz el
        .trim()
      return `<style>${min}</style>`
    })
    // 2) Sima HTML-kommentek törlése — az MSO/feltételeseket meghagyjuk
    .replace(/<!--([\s\S]*?)-->/g, (full, inner: string) =>
      /\[if\b|\[endif\]|mso/i.test(inner) ? full : '',
    )
    // 3) Tag-közi struktúra-whitespace összevonása
    .replace(/>\s+</g, '><')
    .trim()
}

export function buildNewsletterHtml(input: NewsletterInput): string {
  const {
    entries,
    introText,
    periodLabel = formatPeriod(entries),
    headerTitle = 'Kartotéka — Fejlesztési hírlevél',
  } = input

  // Csoportosítás kategória szerint
  const byCategory = new Map<string, ChangelogEntry[]>()
  for (const e of entries) {
    const key = e.category || '_other'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(e)
  }

  // Kategóriák sorrendje (fontosság szerint)
  const orderedCategories: string[] = [
    'security',
    'breaking',
    'feature',
    'improvement',
    'bugfix',
    '_other',
  ]

  const sections = orderedCategories
    .filter((c) => byCategory.has(c))
    .map((c) => {
      const meta = c === '_other' ? UNCATEGORIZED_META : CATEGORY_META[c as ReleaseCategory]
      const items = byCategory.get(c)!

      const itemsHtml = items
        .map(
          (e) => `
            <article class="kt-art" style="margin:0 0 18px;padding:14px 16px;background:#ffffff;border:1px solid ${meta.borderColor};border-left:4px solid ${meta.color};border-radius:10px;overflow-wrap:break-word;word-break:break-word;">
              <header style="display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
                <span style="font-size:11px;color:#94a3b8;font-family:monospace;">${esc(e.date)}</span>
                ${e.version ? `<span style="display:inline-block;padding:1px 8px;background:#eef2ff;color:#4338ca;border-radius:10px;font-size:10px;font-weight:700;">v${esc(e.version)}</span>` : ''}
              </header>
              <h3 class="kt-art-h3" style="margin:2px 0 6px;color:#0f172a;font-size:17px;font-weight:700;line-height:1.3;overflow-wrap:break-word;word-break:break-word;">${esc(e.title)}</h3>
              <div style="font-size:14px;color:#334155;overflow-wrap:break-word;word-break:break-word;">
                ${markdownToHtml(e.bodyMarkdown)}
              </div>
            </article>
          `,
        )
        .join('')

      return `
        <section style="margin:24px 0;">
          <h2 class="kt-sec-h2" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 12px;padding:12px 16px;background:${meta.bgColor};border-radius:12px;color:${meta.color};font-size:17px;font-weight:700;border:1px solid ${meta.borderColor};overflow-wrap:break-word;word-break:break-word;">
            <span style="font-size:22px;">${meta.icon}</span>
            <span style="flex:1 1 auto;min-width:0;">${esc(meta.label)}</span>
            <span style="font-size:13px;font-weight:500;opacity:0.75;white-space:nowrap;">${items.length} tétel</span>
          </h2>
          ${itemsHtml}
        </section>
      `
    })
    .join('')

  const introSection = introText
    ? `
      <div style="margin:16px 0 24px;padding:16px 18px;background:linear-gradient(135deg,#f0fdfa 0%,#eff6ff 100%);border:1px solid #a5f3fc;border-radius:12px;">
        <p style="margin:0;color:#0c4a6e;font-size:14px;line-height:1.6;font-style:italic;">
          ${esc(introText).replace(/\n/g, '<br>')}
        </p>
      </div>
    `
    : ''

  // Tartalomjegyzék — rövid áttekintés a kategóriákról és a bennük lévő
  // bejegyzések címeiről, hogy az olvasó előre lássa, mire számíthat.
  const presentCategories = orderedCategories.filter((c) => byCategory.has(c))
  const tocHtml = `
    <div style="margin:8px 0 4px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;color:#64748b;">📑 Tartalomjegyzék</p>
      <p style="margin:0 0 14px;color:#334155;font-size:13px;line-height:1.55;">
        Ebben a hírlevélben összesen <strong>${entries.length} fejlesztés</strong> szerepel ${presentCategories.length} témakörben. Az alábbiakban először röviden, majd lentebb részletesen is kifejtve.
      </p>
      ${presentCategories
        .map((c) => {
          const meta = c === '_other' ? UNCATEGORIZED_META : CATEGORY_META[c as ReleaseCategory]
          const items = byCategory.get(c)!
          return `
            <div style="margin:10px 0;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${meta.color};">
                <span style="font-size:16px;">${meta.icon}</span>&nbsp; ${esc(meta.label)}
                <span style="color:#94a3b8;font-weight:600;">(${items.length})</span>
              </p>
              <ul style="margin:2px 0 0;padding:0 0 0 26px;color:#475569;">
                ${items
                  .map(
                    (e) =>
                      `<li style="margin:3px 0;font-size:13px;line-height:1.45;">${esc(e.title)}</li>`,
                  )
                  .join('')}
              </ul>
            </div>
          `
        })
        .join('')}
    </div>
  `

  return minifyEmailHtml(`<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(headerTitle)}</title>
  <style>
    /* Mobil-optimalizálás — kisebb kijelzőkön kompaktabb paddingek és
       betűméretek, hogy a hírlevél telefonon is jól nézzen ki. A media query-t
       a böngésző-előnézet és az Apple/iOS Mail alkalmazza; ahol nincs <style>
       támogatás, ott az inline (asztali) stílus a fallback. */
    @media only screen and (max-width: 480px) {
      .kt-outer { padding: 12px 8px !important; }
      .kt-card { border-radius: 12px !important; }
      .kt-hero { padding: 22px 18px 18px !important; }
      .kt-h1 { font-size: 21px !important; }
      .kt-px { padding-left: 16px !important; padding-right: 16px !important; }
      .kt-promo { padding: 18px 14px !important; margin-left: 16px !important; margin-right: 16px !important; }
      .kt-sec-h2 { font-size: 15px !important; padding: 10px 12px !important; }
      .kt-art { padding: 12px 13px !important; }
      .kt-art-h3 { font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;overflow-x:hidden;word-break:break-word;overflow-wrap:break-word;-webkit-text-size-adjust:100%;">

  <!-- Külső wrapper (email kliensek miatt) -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="kt-outer" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">

        <!-- Belső kártya -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="kt-card" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px -20px rgba(15,23,42,0.22);">
          <tr>
            <td>

              <!-- HERO -->
              <div class="kt-hero" style="position:relative;padding:30px 28px 24px;background:linear-gradient(135deg,#0f766e 0%,#0ea5e9 60%,#4f46e5 100%);color:#ffffff;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                  <tr>
                    <td valign="middle" style="padding-right:12px;">
                      <img src="${LOGO_URL}" alt="Kartotéka" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.18);padding:6px;" />
                    </td>
                    <td valign="middle">
                      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.4px;opacity:0.9;">Kartotéka fejlesztések</span>
                    </td>
                  </tr>
                </table>
                <h1 class="kt-h1" style="margin:6px 0 4px;font-family:Georgia,'Cormorant Garamond',serif;font-size:28px;font-weight:700;line-height:1.2;overflow-wrap:break-word;word-break:break-word;">
                  ${esc(headerTitle.replace(/^Kartotéka — /, ''))}
                </h1>
                <p style="margin:8px 0 0;font-size:14px;opacity:0.88;">
                  ${esc(periodLabel)} · ${entries.length} fejlesztés
                </p>
              </div>

              <!-- Üdvözlés + intro -->
              <div class="kt-px" style="padding:24px 28px 0;">
                <p style="margin:0 0 12px;color:#0f172a;font-size:15px;line-height:1.6;font-weight:600;">
                  Kedves Felhasználók!
                </p>
                <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.65;">
                  A Kartotéka rendszerben az elmúlt időszakban több új funkció, finomítás és javítás készült el, hogy a mindennapi munka még gördülékenyebb és biztonságosabb legyen. Az alábbiakban kategóriák szerint részletesen bemutatásra kerülnek a változások.
                </p>
                ${introSection}
              </div>

              <!-- Tartalomjegyzék -->
              <div class="kt-px" style="padding:8px 28px 0;">
                ${tocHtml}
              </div>

              <!-- DicsHub ajánló — 2026-06-14 (Endre): a részletes szekciók ELÉ
                   került, hogy a Gmail esetleges csonkolása (ami a levél VÉGÉT
                   vágja le ~102 kB felett) esetén IS látsszon, kattintás nélkül.
                   A tartalomjegyzék már fentebb felsorolta az összes újdonságot,
                   így az „egészet" reprezentálja a vágási pont fölött. -->
              ${dicsHubPromoHtml()}

              <!-- Szekciók (részletes kifejtés) -->
              <div class="kt-px" style="padding:8px 28px 24px;">
                ${sections}
              </div>

              <!-- Lábléc üzenet -->
              <div class="kt-px" style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:13px;color:#334155;line-height:1.55;">
                  <strong>Kérdésed van?</strong> Fordulj bizalommal Szőcs Endréhez
                  (<a href="mailto:endreszocs@gmail.com" style="color:#0f766e;text-decoration:none;">endreszocs@gmail.com</a>).
                </p>
              </div>

              <!-- Láblec meta -->
              <div class="kt-px" style="padding:14px 28px;background:#0f172a;color:#94a3b8;font-size:11px;text-align:center;">
                <p style="margin:0 0 4px;">
                  Kartotéka administrációs rendszer
                </p>
                <p style="margin:0;font-family:monospace;opacity:0.7;">
                  Készült: ${new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`)
}

// ─────────────────────────────────────────────────────────────
// Segéd: időszak-címke generálás
// ─────────────────────────────────────────────────────────────

function formatPeriod(entries: ChangelogEntry[]): string {
  if (entries.length === 0) return 'Nincs hírlevél tartalom'
  const dates = entries.map((e) => e.date).sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]
  if (firstDate === lastDate) {
    return formatDateHu(firstDate)
  }
  return `${formatDateHu(firstDate)} — ${formatDateHu(lastDate)}`
}

function formatDateHu(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Egyszerű plain text változat — amikor email kliens nem támogatja a HTML-t.
 */
export function buildNewsletterPlainText(input: NewsletterInput): string {
  const { entries, periodLabel = formatPeriod(entries), introText } = input

  const lines: string[] = [
    '═══════════════════════════════════════════════════',
    '  KARTOTÉKA — Fejlesztési hírlevél',
    `  ${periodLabel} · ${entries.length} fejlesztés`,
    '═══════════════════════════════════════════════════',
    '',
    'Kedves Felhasználók!',
    '',
    'A Kartotéka rendszerben az elmúlt időszakban több új funkció,',
    'finomítás és javítás készült el. Az alábbiakban részletesen',
    'bemutatásra kerülnek a változások.',
    '',
  ]
  if (introText) {
    lines.push(introText, '')
  }

  const byCategory = new Map<string, ChangelogEntry[]>()
  for (const e of entries) {
    const key = e.category || '_other'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(e)
  }

  const orderedCategories: string[] = [
    'security', 'breaking', 'feature', 'improvement', 'bugfix', '_other',
  ]

  // Tartalomjegyzék (rövid áttekintés)
  lines.push('TARTALOMJEGYZÉK')
  for (const c of orderedCategories) {
    const items = byCategory.get(c)
    if (!items || items.length === 0) continue
    const meta = c === '_other' ? UNCATEGORIZED_META : CATEGORY_META[c as ReleaseCategory]
    lines.push(`  ${meta.icon}  ${meta.label} (${items.length})`)
    for (const e of items) {
      lines.push(`       - ${e.title}`)
    }
  }
  lines.push('')

  for (const c of orderedCategories) {
    const items = byCategory.get(c)
    if (!items || items.length === 0) continue
    const meta = c === '_other' ? UNCATEGORIZED_META : CATEGORY_META[c as ReleaseCategory]
    lines.push('───────────────────────────────────────────────────')
    lines.push(`  ${meta.icon}  ${meta.label.toUpperCase()} (${items.length})`)
    lines.push('───────────────────────────────────────────────────')
    lines.push('')
    for (const e of items) {
      lines.push(`  ${e.date}${e.version ? ` · v${e.version}` : ''}`)
      lines.push(`  ▸ ${e.title}`)
      lines.push('')
      for (const bl of e.bodyMarkdown.split('\n').slice(0, 8)) {
        lines.push(`    ${bl}`)
      }
      lines.push('')
    }
  }

  lines.push('───────────────────────────────────────────────────')
  lines.push('  EGY MÁSIK ESZKÖZ A SZOLGÁLATÁHOZ — DICSHUB')
  lines.push('───────────────────────────────────────────────────')
  lines.push('A DicsHub egy modern istentiszteleti prezentáció- és')
  lines.push('dicsőítés-szervező alkalmazás magyar lelkészeknek:')
  lines.push('énekek, igeversek, imák, liturgia-sablonok, kivetítés,')
  lines.push('telefonos távvezérlő és PowerPoint-export — egy helyen.')
  lines.push('Próbálja ki: https://www.dicshub.com/')
  lines.push('')
  lines.push('═══════════════════════════════════════════════════')
  lines.push('Kérdésed van? Fordulj Szőcs Endréhez: endreszocs@gmail.com')
  lines.push('')
  lines.push('Kartotéka administrációs rendszer')
  lines.push('═══════════════════════════════════════════════════')

  return lines.join('\n')
}
