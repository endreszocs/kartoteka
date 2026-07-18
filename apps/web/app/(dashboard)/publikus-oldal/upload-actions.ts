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

function withCacheVersion(publicUrl: string): string {
  const url = new URL(publicUrl)
  url.searchParams.set('v', Date.now().toString(36))
  return url.toString()
}

interface UploadResult {
  url?: string
  error?: string
}

interface CleanupResult {
  success?: boolean
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

  let path: string
  switch (target.kind) {
    case 'hero': {
      path = heroImagePath(congregationId, sanitizeFilename(file.name))
      break
    }
    case 'crest': {
      path = crestImagePath(congregationId, sanitizeFilename(file.name))
      break
    }
    case 'post-cover': {
      // Path traversal védelem: slug validáció
      if (typeof target.postSlug !== 'string') {
        return { error: 'Érvénytelen poszt azonosító.' }
      }
      const slugCheck = validateSlug(target.postSlug)
      if (!slugCheck.valid) {
        return { error: slugCheck.error || 'Érvénytelen poszt slug.' }
      }
      path = postCoverImagePath(
        congregationId,
        target.postSlug,
        sanitizeFilename(file.name),
      )
      break
    }
    case 'magazine-cover': {
      // Path traversal védelem: csak UUID engedélyezett
      if (!isValidUuid(target.issueId)) {
        return { error: 'Érvénytelen lapszám azonosító.' }
      }
      // Egy lapszámhoz egyetlen borító-slot tartozik. A determinisztikus név
      // miatt egy új feltöltés felülírja a régit, nem hoz létre árva fájlokat.
      path = magazineIssuePath(congregationId, target.issueId, 'cover')
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

  // Hero, crest és magazinborító egy-egy felülírható slot. A posztborítók
  // továbbra is egyedi, időbélyeges fájlnevet kapnak.
  const allowUpsert =
    target.kind === 'hero' || target.kind === 'crest' || target.kind === 'magazine-cover'

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

  return {
    url:
      target.kind === 'magazine-cover'
        ? withCacheVersion(urlData.publicUrl)
        : urlData.publicUrl,
  }
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

  // Egy lapszámhoz egyetlen PDF-slot tartozik. Újrafeltöltéskor felülírjuk,
  // így megszakadt vagy megismételt próbálkozás sem halmoz árva objektumokat.
  const path = magazineIssuePath(congregationId, issueId, 'issue.pdf')

  // Defense in depth
  if (!path.startsWith(`${congregationId}/`) || path.includes('..')) {
    return { error: 'Érvénytelen útvonal.' }
  }

  const { error } = await access.supabase.storage
    .from(PUBLIC_MAGAZINES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (error) return { error: error.message }

  const { data: urlData } = access.supabase.storage
    .from(PUBLIC_MAGAZINES_BUCKET)
    .getPublicUrl(path)

  return { url: withCacheVersion(urlData.publicUrl) }
}

/**
 * Eltávolítja egy lapszám gyülekezethez kötött PDF- és borítófájljait.
 *
 * A kliens csak a lapszám UUID-jét küldi. A gyülekezeti prefixet minden
 * esetben a szerveroldali, ellenőrzött hozzáférési kontextusból képezzük,
 * ezért más gyülekezet mappája nem célozható meg.
 */
export async function cleanupMagazineIssueUploads(
  issueId: string,
): Promise<CleanupResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod magazinfájlok törléséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (!isValidUuid(issueId)) return { error: 'Érvénytelen lapszám azonosító.' }

  const prefix = `${congregationId}/${issueId}`
  const cleanupErrors: string[] = []
  const buckets = [PUBLIC_MAGAZINES_BUCKET, PUBLIC_SITE_MEDIA_BUCKET] as const
  const pageSize = 100
  const maxObjectsPerBucket = 1000

  for (const bucket of buckets) {
    const objectPaths: string[] = []
    let offset = 0
    let listingFailed = false

    while (offset < maxObjectsPerBucket) {
      const { data, error } = await access.supabase.storage
        .from(bucket)
        .list(prefix, {
          limit: pageSize,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        })

      if (error) {
        cleanupErrors.push(`${bucket}: a fájllista nem olvasható (${error.message})`)
        listingFailed = true
        break
      }

      const objects = data ?? []
      for (const object of objects) {
        if (object.id && object.name) objectPaths.push(`${prefix}/${object.name}`)
      }

      if (objects.length < pageSize) break
      offset += objects.length
    }

    if (listingFailed) continue
    if (offset >= maxObjectsPerBucket) {
      cleanupErrors.push(`${bucket}: túl sok fájl található a lapszám mappájában`)
      continue
    }

    for (let index = 0; index < objectPaths.length; index += pageSize) {
      const { error } = await access.supabase.storage
        .from(bucket)
        .remove(objectPaths.slice(index, index + pageSize))

      if (error) {
        cleanupErrors.push(`${bucket}: a fájlok nem törölhetők (${error.message})`)
        break
      }
    }
  }

  if (cleanupErrors.length > 0) {
    return {
      error: `A lapszám fájljainak takarítása nem fejeződött be: ${cleanupErrors.join('; ')}`,
    }
  }

  return { success: true }
}
