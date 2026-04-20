import 'server-only'

/**
 * Signed URL helper a Supabase Storage-hoz (M0.6).
 *
 * A privát bucket-ekhez (documents-encrypted) **nem** lehet közvetlen public URL.
 * A signed URL egy időkorlátos (15 perc) letöltési link, amit a szerver-action
 * ad ki az admin/tulajdonos kérésére.
 *
 * Használat:
 *   const url = await getDocumentSignedUrl(documentId)
 *   return { url }   // a kliens <a href={url}> letölti a ciphertext-et,
 *                    // majd a Tauri-kliens dekriptálja
 */

import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'documents-encrypted'
const DEFAULT_TTL_SECONDS = 15 * 60   // 15 perc

export interface SignedUrlResult {
  url?: string
  error?: string
}

/**
 * Signed download URL kibocsátása egy dokumentumra.
 *
 * Az RLS a `documents` táblán ellenőrzi, hogy a user hozzáférhet-e a doc-hoz.
 * Ha igen, a Storage is engedi (a bucket-policy ugyanezt a feltételt nézi).
 */
export async function getDocumentSignedUrl(
  documentId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<SignedUrlResult> {
  const supabase = await createClient()

  // 1. Lekérjük a storage_path-t (RLS ellenőrzi a jogosultságot)
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (docErr) return { error: docErr.message }
  if (!doc) return { error: 'Dokumentum nem található vagy nincs hozzáférésed.' }

  const path = (doc as { storage_path: string }).storage_path

  // 2. Signed URL generálás
  const { data: signed, error: signErr } = await supabase
    .storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, ttlSeconds)

  if (signErr) return { error: signErr.message }
  if (!signed?.signedUrl) return { error: 'Nem sikerült signed URL-t generálni.' }

  return { url: signed.signedUrl }
}

/**
 * Ha az admin egyszerre több doc-hoz akar URL-t kérni (pl. batch-export).
 */
export async function getDocumentSignedUrls(
  documentIds: string[],
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<Record<string, SignedUrlResult>> {
  const result: Record<string, SignedUrlResult> = {}
  for (const id of documentIds) {
    result[id] = await getDocumentSignedUrl(id, ttlSeconds)
  }
  return result
}

export const STORAGE_BUCKET = BUCKET_NAME
export const DEFAULT_SIGNED_URL_TTL = DEFAULT_TTL_SECONDS
