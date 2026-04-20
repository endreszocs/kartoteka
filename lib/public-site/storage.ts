// Storage bucket útvonal konvenciók

export const PUBLIC_SITE_MEDIA_BUCKET = 'public-site-media'
export const PUBLIC_MAGAZINES_BUCKET = 'public-magazines'

/**
 * Poszt borítókép útvonala:
 *   public-site-media/{congregationId}/posts/{postSlug}/{filename}
 */
export function postCoverImagePath(
  congregationId: string,
  postSlug: string,
  filename: string,
): string {
  return `${congregationId}/posts/${postSlug}/${filename}`
}

/**
 * Hero kép útvonala a gyülekezeti kezdőlapon:
 *   public-site-media/{congregationId}/hero/{filename}
 */
export function heroImagePath(congregationId: string, filename: string): string {
  return `${congregationId}/hero/${filename}`
}

/**
 * Címer / logó útvonala:
 *   public-site-media/{congregationId}/crest/{filename}
 */
export function crestImagePath(congregationId: string, filename: string): string {
  return `${congregationId}/crest/${filename}`
}

/**
 * Magazin lapszám fájlok útvonala:
 *   public-magazines/{congregationId}/{issueId}/{filename}
 */
export function magazineIssuePath(
  congregationId: string,
  issueId: string,
  filename: string,
): string {
  return `${congregationId}/${issueId}/${filename}`
}

/**
 * Egy uploadolt fájlnévből biztonságos tárolásnevet csinál
 * (ékezet mentes, speciális karakterek eltávolítva, egyedi timestamp).
 */
export function sanitizeFilename(original: string): string {
  const ext = original.split('.').pop()?.toLowerCase() || 'bin'
  const base = original
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'file'
  const ts = Date.now()
  return `${base}-${ts}.${ext}`
}

// Elfogadott MIME típusok
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2 MB

export const ALLOWED_PDF_TYPES = new Set(['application/pdf'])
export const MAX_PDF_SIZE = 20 * 1024 * 1024 // 20 MB
