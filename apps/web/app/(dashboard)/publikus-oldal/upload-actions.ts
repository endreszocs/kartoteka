'use server'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  PUBLIC_SITE_MEDIA_BUCKET,
  PUBLIC_MAGAZINES_BUCKET,
  heroImagePath,
  crestImagePath,
  postCoverImagePath,
  magazineIssuePath,
  sanitizeFilename,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_PDF_TYPES,
  MAX_IMAGE_SIZE,
  MAX_PDF_SIZE,
} from '@/lib/public-site/storage'
import { validateSlug } from '@/lib/public-site/slug'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'

/**
 * Biztonsági: UUID validátor a magazin issueId-hez.
 * Megakadályozza, hogy path traversal karaktereket lehessen beletenni.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

interface UploadResult {
  url?: string
  error?: string
}

type UploadTarget =
  | { kind: 'hero' }
  | { kind: 'crest' }
  | { kind: 'post-cover'; postSlug: string }
  | { kind: 'magazine-cover'; issueId: string }
  | { kind: 'magazine-pdf'; issueId: string }

/**
 * Kép feltöltése a public-site-media bucket-be.
 * A FormData tartalmaz egy 'file' mezőt és egy 'target' JSON-t.
 */
export async function uploadPublicSiteImage(formData: FormData): Promise<UploadResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod publikus média feltöltéséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const file = formData.get('file')
  const targetRaw = formData.get('target')

  if (!(file instanceof File)) return { error: 'Nincs feltöltendő fájl.' }
  if (typeof targetRaw !== 'string') return { error: 'Érvénytelen feltöltési cél.' }

  let target: UploadTarget
  try {
    target = JSON.parse(targetRaw) as UploadTarget
  } catch {
    return { error: 'Érvénytelen feltöltési cél JSON.' }
  }

  // Méret és MIME ellenőrzés
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: 'Csak JPG, PNG vagy WebP képek engedélyezettek.' }
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: `A fájl túl nagy (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB).` }
  }

  const safeName = sanitizeFilename(file.name)

  let path: string
  switch (target.kind) {
    case 'hero':
      path = heroImagePath(congregationId, safeName)
      break
    case 'crest':
      path = crestImagePath(congregationId, safeName)
      break
    case 'post-cover': {
      // Path traversal védelem: slug validáció
      if (typeof target.postSlug !== 'string') {
        return { error: 'Érvénytelen poszt azonosító.' }
      }
      const slugCheck = validateSlug(target.postSlug)
      if (!slugCheck.valid) {
        return { error: slugCheck.error || 'Érvénytelen poszt slug.' }
      }
      path = postCoverImagePath(congregationId, target.postSlug, safeName)
      break
    }
    case 'magazine-cover': {
      // Path traversal védelem: csak UUID engedélyezett
      if (!isValidUuid(target.issueId)) {
        return { error: 'Érvénytelen lapszám azonosító.' }
      }
      path = magazineIssuePath(congregationId, target.issueId, safeName)
      break
    }
    default:
      return { error: 'Képfeltöltéshez érvénytelen cél.' }
  }

  // Defense in depth: ellenőrzés, hogy a végső path az elvárt prefixszel kezdődik.
  // Ez megakadályozza, hogy ha valahol még path traversal karakterek bejussanak,
  // azok kihatással legyenek.
  if (!path.startsWith(`${congregationId}/`) || path.includes('..')) {
    return { error: 'Érvénytelen útvonal.' }
  }

  // Hero és crest: engedjük a felülírást (ugyanaz a slot)
  // Post-cover és magazine-cover: a sanitizeFilename timestamp-et ad, így nem ütközik
  const allowUpsert = target.kind === 'hero' || target.kind === 'crest'

  const { error } = await access.supabase.storage
    .from(PUBLIC_SITE_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: allowUpsert,
      contentType: file.type,
    })

  if (error) return { error: error.message }

  const { data: urlData } = access.supabase.storage
    .from(PUBLIC_SITE_MEDIA_BUCKET)
    .getPublicUrl(path)

  return { url: urlData.publicUrl }
}

/**
 * Magazin PDF feltöltése a public-magazines bucket-be.
 */
export async function uploadMagazinePdf(formData: FormData): Promise<UploadResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod magazin feltöltéséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const file = formData.get('file')
  const issueId = formData.get('issueId')

  if (!(file instanceof File)) return { error: 'Nincs feltöltendő fájl.' }
  if (typeof issueId !== 'string' || !issueId) return { error: 'Hiányzó lapszám azonosító.' }

  // Path traversal védelem
  if (!isValidUuid(issueId)) {
    return { error: 'Érvénytelen lapszám azonosító.' }
  }

  if (!ALLOWED_PDF_TYPES.has(file.type)) {
    return { error: 'Csak PDF fájl tölthető fel.' }
  }
  if (file.size > MAX_PDF_SIZE) {
    return { error: `A fájl túl nagy (max ${MAX_PDF_SIZE / 1024 / 1024} MB).` }
  }

  const safeName = sanitizeFilename(file.name)
  const path = magazineIssuePath(congregationId, issueId, safeName)

  // Defense in depth
  if (!path.startsWith(`${congregationId}/`) || path.includes('..')) {
    return { error: 'Érvénytelen útvonal.' }
  }

  const { error } = await access.supabase.storage
    .from(PUBLIC_MAGAZINES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) return { error: error.message }

  const { data: urlData } = access.supabase.storage
    .from(PUBLIC_MAGAZINES_BUCKET)
    .getPublicUrl(path)

  return { url: urlData.publicUrl }
}
