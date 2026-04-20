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
