'use server'

/**
 * Konkordancia — szentiras.eu REST API proxy (2026-08-09).
 *
 * A szentiras.eu ingyenes API-kulcsot kér (X-API-Key fejléc, 60 kérés/perc) —
 * a kulcsot a SZENTIRAS_API_KEY környezeti változó adja. Kulcs nélkül a
 * felület { needsKey: true }-t kap és útmutatót mutat (graceful degradation).
 *
 * Végpontok:
 *   GET https://szentiras.eu/api/search/{szó}[/{fordítás}]?book=&limit=
 *   GET https://szentiras.eu/api/idezet/{hivatkozás}[/{fordítás}]
 *
 * Feltétel (szentiras.eu): a forrás feltüntetése — a felület kiírja.
 * A válasz-szerkezetet TOLERÁNSAN dolgozzuk fel (rekurzív vers-kinyerés),
 * hogy az API kisebb változásai ne törjék el a keresőt.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { IgehelyResult, KonkordanciaHit, KonkordanciaResult } from '@/lib/worklog/igeterv-types'

const API_BASE = 'https://szentiras.eu/api'
/** A bibliaszöveg statikus — hosszú fetch-cache kímélje az önkéntes API-t. */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 7

function apiKey(): string | null {
  const key = process.env.SZENTIRAS_API_KEY?.trim()
  return key || null
}

function friendlyHttpError(status: number): string {
  if (status === 401) return 'A szentiras.eu API-kulcs érvénytelen (SZENTIRAS_API_KEY).'
  if (status === 403) return 'A szentiras.eu API-kulcs le van tiltva.'
  if (status === 429) return 'A szentiras.eu kereső túl sok kérést kapott — próbáld újra egy perc múlva.'
  return `A szentiras.eu nem válaszolt (HTTP ${status}).`
}

/**
 * Rekurzív, tolerans vers-kinyerés: olyan objektumokat keresünk, amelyekben
 * van szöveg-mező ('szoveg'/'text') és igehely ('szep'/'hivatkozas'/'ref'/'hely'/'gepi').
 */
function extractHits(node: unknown, translation: string | null, out: KonkordanciaHit[], depth = 0): void {
  if (!node || depth > 8 || out.length >= 400) return
  if (Array.isArray(node)) {
    for (const item of node) extractHits(item, translation, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const obj = node as Record<string, unknown>

  const text =
    (typeof obj.szoveg === 'string' && obj.szoveg) ||
    (typeof obj.text === 'string' && obj.text) ||
    null
  if (text) {
    let ref: string | null = null
    const hely = obj.hely as Record<string, unknown> | undefined
    if (hely && typeof hely === 'object') {
      ref = (typeof hely.szep === 'string' && hely.szep) || (typeof hely.gepi === 'string' && hely.gepi) || null
    }
    ref =
      ref ||
      (typeof obj.szep === 'string' && obj.szep) ||
      (typeof obj.hivatkozas === 'string' && obj.hivatkozas) ||
      (typeof obj.ref === 'string' && obj.ref) ||
      (typeof obj.reference === 'string' && obj.reference) ||
      null
    if (ref) {
      const rowTranslation =
        (typeof obj.forditas === 'string' && obj.forditas) ||
        (typeof obj.translationAbbrev === 'string' && obj.translationAbbrev) ||
        translation
      out.push({ ref, text: text.trim(), translation: rowTranslation })
      return
    }
  }

  for (const value of Object.values(obj)) {
    extractHits(value, translation, out, depth + 1)
  }
}

function extractTotal(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null
  const obj = node as Record<string, unknown>
  for (const key of ['fullTextResultCount', 'talalatokSzama', 'totalCount', 'total', 'hitCount', 'osszes']) {
    const v = obj[key]
    if (typeof v === 'number') return v
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = extractTotal(value)
      if (found != null) return found
    }
  }
  return null
}

// ─── Keresés (konkordancia) ─────────────────────────────────────────────────

export async function searchScripture(
  query: string,
  options?: { translation?: string | null; book?: string | null; limit?: number },
): Promise<KonkordanciaResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const q = query.trim()
  if (q.length < 2) return { hits: [] }

  const key = apiKey()
  if (!key) return { needsKey: true }

  const translation = options?.translation?.trim() || null
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 200)
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (options?.book?.trim()) params.set('book', options.book.trim())

  const path = translation
    ? `${API_BASE}/search/${encodeURIComponent(q)}/${encodeURIComponent(translation)}`
    : `${API_BASE}/search/${encodeURIComponent(q)}`

  try {
    const res = await fetch(`${path}?${params.toString()}`, {
      headers: { 'X-API-Key': key },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return { error: friendlyHttpError(res.status) }
    const json = (await res.json()) as unknown
    const hits: KonkordanciaHit[] = []
    extractHits(json, translation, hits)
    return { hits: hits.slice(0, limit), totalCount: extractTotal(json) }
  } catch (e) {
    return { error: e instanceof Error ? `A keresés nem sikerült: ${e.message}` : 'A keresés nem sikerült.' }
  }
}

// ─── Igehely-lekérés ────────────────────────────────────────────────────────

export async function getScripturePassage(
  reference: string,
  translation?: string | null,
): Promise<IgehelyResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const ref = reference.trim()
  if (!ref) return { error: 'Add meg az igehelyet (pl. Jn 3,16).' }

  const key = apiKey()
  if (!key) return { needsKey: true }

  const trans = translation?.trim() || null
  const path = trans
    ? `${API_BASE}/idezet/${encodeURIComponent(ref)}/${encodeURIComponent(trans)}`
    : `${API_BASE}/idezet/${encodeURIComponent(ref)}`

  try {
    const res = await fetch(path, {
      headers: { 'X-API-Key': key },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return { error: friendlyHttpError(res.status) }
    const json = (await res.json()) as unknown
    const hits: KonkordanciaHit[] = []
    extractHits(json, trans, hits)
    if (hits.length === 0) return { error: 'Nem található ilyen igehely — ellenőrizd a hivatkozást (pl. Jn 3,16).' }
    return {
      ref,
      translation: trans,
      verses: hits.map((h) => ({ ref: h.ref, text: h.text })),
    }
  } catch (e) {
    return { error: e instanceof Error ? `A lekérés nem sikerült: ${e.message}` : 'A lekérés nem sikerült.' }
  }
}
