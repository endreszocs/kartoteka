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
  result = result.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:3px;font-family:monospace;font-size:90%;">$1</code>')
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
            <article style="margin:0 0 18px;padding:14px 16px;background:#ffffff;border:1px solid ${meta.borderColor};border-left:4px solid ${meta.color};border-radius:10px;">
              <header style="display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
                <span style="font-size:11px;color:#94a3b8;font-family:monospace;">${esc(e.date)}</span>
                ${e.version ? `<span style="display:inline-block;padding:1px 8px;background:#eef2ff;color:#4338ca;border-radius:10px;font-size:10px;font-weight:700;">v${esc(e.version)}</span>` : ''}
              </header>
              <h3 style="margin:2px 0 6px;color:#0f172a;font-size:17px;font-weight:700;line-height:1.3;">${esc(e.title)}</h3>
              <div style="font-size:14px;color:#334155;">
                ${markdownToHtml(e.bodyMarkdown)}
              </div>
            </article>
          `,
        )
        .join('')

      return `
        <section style="margin:24px 0;">
          <h2 style="display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:12px 16px;background:${meta.bgColor};border-radius:12px;color:${meta.color};font-size:17px;font-weight:700;border:1px solid ${meta.borderColor};">
            <span style="font-size:22px;">${meta.icon}</span>
            ${esc(meta.label)}
            <span style="margin-left:auto;font-size:13px;font-weight:500;opacity:0.75;">${items.length} tétel</span>
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

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(headerTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <!-- Külső wrapper (email kliensek miatt) -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">

        <!-- Belső kártya -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px -20px rgba(15,23,42,0.22);">
          <tr>
            <td>

              <!-- HERO -->
              <div style="position:relative;padding:30px 28px 24px;background:linear-gradient(135deg,#0f766e 0%,#0ea5e9 60%,#4f46e5 100%);color:#ffffff;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                  <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(255,255,255,0.18);border-radius:12px;font-size:22px;">📬</span>
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.4px;opacity:0.9;">Kartotéka fejlesztések</span>
                </div>
                <h1 style="margin:6px 0 4px;font-family:Georgia,'Cormorant Garamond',serif;font-size:28px;font-weight:700;line-height:1.2;">
                  ${esc(headerTitle.replace(/^Kartotéka — /, ''))}
                </h1>
                <p style="margin:8px 0 0;font-size:14px;opacity:0.88;">
                  ${esc(periodLabel)} · ${entries.length} fejlesztés
                </p>
              </div>

              <!-- Üdvözlés + intro -->
              <div style="padding:24px 28px 0;">
                <p style="margin:0 0 12px;color:#0f172a;font-size:15px;line-height:1.6;font-weight:600;">
                  Kedves Felhasználók!
                </p>
                <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.65;">
                  A Kartotéka rendszerben az elmúlt időszakban több új funkció, finomítás és javítás készült el, hogy a mindennapi munka még gördülékenyebb és biztonságosabb legyen. Az alábbiakban kategóriák szerint részletesen bemutatjuk a változásokat.
                </p>
                ${introSection}
              </div>

              <!-- Szekciók -->
              <div style="padding:0 28px 24px;">
                ${sections}
              </div>

              <!-- Lábléc üzenet -->
              <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 6px;font-size:13px;color:#334155;line-height:1.55;">
                  <strong>Kérdésed van?</strong> Fordulj bizalommal Szőcs Endréhez
                  (<a href="mailto:endreszocs@gmail.com" style="color:#0f766e;text-decoration:none;">endreszocs@gmail.com</a>)
                  — bármilyen észrevételt szívesen fogadunk.
                </p>
                <p style="margin:0;font-size:12px;color:#64748b;">
                  Szeretettel,<br>
                  <strong style="color:#0f172a;">A Kartotéka fejlesztőcsapata</strong>
                </p>
              </div>

              <!-- Láblec meta -->
              <div style="padding:14px 28px;background:#0f172a;color:#94a3b8;font-size:11px;text-align:center;">
                <p style="margin:0 0 4px;">
                  Erdélyi Református Egyházkerület · Kartotéka administrációs rendszer
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
</html>`
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
    'bemutatjuk a változásokat.',
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

  lines.push('═══════════════════════════════════════════════════')
  lines.push('Kérdésed van? Fordulj Szőcs Endréhez: endreszocs@gmail.com')
  lines.push('')
  lines.push('Szeretettel, a Kartotéka fejlesztőcsapata')
  lines.push('Erdélyi Református Egyházkerület')
  lines.push('═══════════════════════════════════════════════════')

  return lines.join('\n')
}
