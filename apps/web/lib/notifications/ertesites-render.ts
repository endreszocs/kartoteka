import 'server-only'

/**
 * ÉRTESÍTÉS-TÖRZS RENDERELÉSE — markdown → MEGTISZTÍTOTT HTML (2026-09-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * A rendszergazdai hírlevél és a changelog-körlevél törzse markdown
 * (`## A hírlevélben 2 frissítést küldünk ki:`, `- **2026-09-03** — …`). Az
 * e-mail ág ezt rendereli (lib/broadcasts/email.ts), az alkalmazáson belüli
 * három felület (csengő, /notifications, admin-archívum) viszont SZÓ SZERINT
 * mutatta — a lelkész `##`-eket és csillagokat látott. Ez a modul EGY helyen
 * renderel, a szerveren, hogy a kliens csak kész, megtisztított HTML-t kapjon.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * FAIL-CLOSED — KÉT KAPU
 * ════════════════════════════════════════════════════════════════════════════
 *  1. A HÍVÓ kapuja: az `uzenetek-actions.ts → alakit()` CSAK
 *     `uzenet_format = 'markdown'` sornál hívja ezt. A felhasználói szabad
 *     szöveg (elutasítás indoklása, átjelentkezési megjegyzés, támogatási
 *     válasz) 'text' formátumú, és SOHA nem fut markdownon — a kliens
 *     escape-elt szövegként mutatja.
 *  2. AZ ITTENI kapu: SZŰK engedélylista. Nincs `img` (nyomkövető pixel,
 *     onerror), nincs `class`/`style` (a felület tipográfiája a `.uzenet-torzs`
 *     osztályé), nincs `pre`/`blockquote`/`table`. Link csak https/mailto,
 *     `rel="noopener noreferrer" target="_blank"`. A `<script>` tartalma is
 *     eldobva (sanitize-html `nonTextTags`), nem csak a címkéje.
 *
 * ⚠️ `server-only`: a marked + sanitize-html a kliens-bundle-be nem való; a
 *    kivonat-készítő (`markdownSzoveg`) direktíva-mentes párja az
 *    `uzenetek-shared.ts`-ben él, innen csak re-exportáljuk.
 *
 * ⚠️ A `scripts/selftest-ertesites-felado.mjs` mutáns-őre a
 *    `sanitizeHtml(nyers, SZABALYOK)` sort cseréli `nyers`-re, és bizonyítja,
 *    hogy a `<script>` akkor túléli — vagyis hogy a tisztítás valóban ez a sor.
 */

import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

export { markdownSzoveg, szovegKivonat } from './uzenetek-shared'

/** Engedett címkék — SZÁNDÉKOSAN nincs img, pre, blockquote, table, span, div. */
const ENGEDETT_CIMKEK = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'code']

const SZABALYOK: sanitizeHtml.IOptions = {
  allowedTags: ENGEDETT_CIMKEK,
  // NINCS `'*': ['class']` — a public-site sanitizer engedi, ez itt tilos.
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // A címsor-szintek a felület tipográfiájához igazodnak: h1 → h2, h5/h6 → h4.
    h1: 'h2',
    h5: 'h4',
    h6: 'h4',
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' },
    }),
  },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Markdown → megtisztított HTML. SOHA NEM DOB: ha a markdown-elemző hibázna,
 * a törzs escape-elt szövegként (sortörésekkel) megy tovább — az üzenet így
 * is olvasható, csak formázatlan.
 */
export function renderUzenetHtml(markdown: string): string {
  const forras = String(markdown ?? '')
  let nyers: string
  try {
    // `breaks: true`: az értesítés-törzsekben egy sima sortörés is sortörés —
    // a lelkész nem markdown-szabályok szerint ír, a hírlevél pedig kibírja.
    nyers = marked.parse(forras, { async: false, gfm: true, breaks: true }) as string
  } catch {
    nyers = `<p>${escapeHtml(forras).replace(/\n/g, '<br>')}</p>`
  }
  const tiszta = sanitizeHtml(nyers, SZABALYOK)
  return tiszta.trim()
}
