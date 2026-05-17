import sanitizeHtml from 'sanitize-html'
import { marked } from 'marked'

const ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'strong', 'em', 'a', 'img', 'blockquote',
  'figure', 'figcaption', 'br', 'hr', 'code', 'pre',
]

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'rel', 'target'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  '*': ['class'],
}

/**
 * A Supabase Storage bázis URL-je a környezeti változóból.
 * Ez a hostname engedélyezett képforrásként.
 */
function getSupabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * Szerver-oldali HTML sanitization. Minden `body_html` és `about_html` ezen
 * keresztül kell átmenjen, mielőtt DB-be kerül.
 *
 * - Csak biztonságos tagek maradnak
 * - <script>, <iframe>, <style>, inline event handlerek eldobva
 * - Linkek automatikusan rel="noopener noreferrer" target="_blank" kapnak
 * - Képek CSAK a Supabase Storage host-ról engedélyezettek
 * - https:// protokoll csak
 */
export function sanitizePostBody(input: string): string {
  const storageHost = getSupabaseStorageHost()

  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesByTag: {
      img: ['https'],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    },
    exclusiveFilter: (frame) => {
      // Képeket csak a saját Supabase Storage-ből engedjük
      if (frame.tag === 'img' && frame.attribs.src) {
        if (!storageHost) return true // ha nincs konfigurálva, mindent blokkolunk
        try {
          const parsed = new URL(frame.attribs.src)
          return parsed.host !== storageHost
        } catch {
          return true
        }
      }
      return false
    },
    // Biztonsági plusz: még ha a `style` tag-et engedélyeznénk, ne fusson CSS
    allowedStyles: {},
  })
}

/**
 * Markdown → sanitizált HTML pipeline.
 * A lelkész Markdown-ban ír, a tárolt body_html már sanitizált.
 */
export function markdownToSanitizedHtml(markdown: string): string {
  // marked sync mode — biztonságosabb a server-side rendereléshez
  const rawHtml = marked.parse(markdown, { async: false }) as string
  return sanitizePostBody(rawHtml)
}

/**
 * Iktató-sablon HTML sanitization (DIAGNOSTICS P1-3b).
 *
 * A `iktato_sablonok.tartalom` HTML-je admin/lelkész által szerkesztett —
 * a saját gyülekezet RLS-ében marad, de a sablonok renderelésekor egy
 * rosszhiszemű szerkesztő `<script>` vagy `<iframe>` injektálhatna. Ez a
 * helper meglékelő, de a sablonok layoutját (inline style + div + table)
 * megőrzi:
 *
 *   - Bővebb tag-whitelist: div, span, b, strong, em, br, hr,
 *     ul/ol/li, h1-h6, table-stack, blockquote, pre, code, a, img
 *   - Inline `style` engedélyezve a layout/typography property-listára
 *     (padding, margin, font-*, text-*, display, color, border stb.)
 *   - Style-érték regex `/^[^;<>]+$/` kizárja a többes-property csempészést
 *   - URL scheme: csak https, mailto — `javascript:` URL auto-kiszűrve
 *   - `<script>`, `<iframe>`, inline event handler auto-kiszűrve
 *
 * Ahol használjuk: `filing-template-generator.tsx`, render előtt.
 */
const SAFE_STYLE_VALUE: RegExp[] = [/^[^;<>]+$/]

const FILING_ALLOWED_STYLE_PROPS = [
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing',
  'text-align', 'text-indent', 'text-decoration', 'text-transform', 'white-space',
  'color', 'background-color', 'background',
  'display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'gap',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-style', 'border-width', 'border-color', 'border-radius', 'border-collapse',
  'list-style', 'list-style-type',
  'vertical-align',
  'page-break-before', 'page-break-after', 'page-break-inside',
]

const FILING_ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': Object.fromEntries(
    FILING_ALLOWED_STYLE_PROPS.map(prop => [prop, SAFE_STYLE_VALUE]),
  ),
}

export function sanitizeFilingHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      'div', 'span', 'p',
      'b', 'strong', 'em', 'i', 'u',
      'br', 'hr',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
      'blockquote', 'pre', 'code',
      'a', 'img', 'figure', 'figcaption',
    ],
    allowedAttributes: {
      '*': ['class', 'style'],
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'align', 'valign'],
      table: ['border', 'cellpadding', 'cellspacing'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesByTag: {
      img: ['https', 'data'],
    },
    allowedStyles: FILING_ALLOWED_STYLES,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    },
  })
}

/**
 * About (rólunk) szekció egyszerűbb sanitizálása — még szűkebb whitelist.
 */
export function sanitizeAboutHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br'],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
    },
    allowedSchemes: ['https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    },
  })
}
