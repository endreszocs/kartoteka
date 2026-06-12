/**
 * Desktop avatar-szolgáltatás (2026-06-11, Endre kérése).
 *
 * A webes `avatar-actions.ts` tükre, Rust-oldali letöltéssel (a webview
 * fetch-et a kép-CDN-ek CORS-a blokkolja; a Rust-fetch ráadásul Endre
 * lakossági IP-jéről fut — az og:image best-effort itt erősebb, mint a
 * szerver-IP-s weben). A kép a közös 'avatars' Storage bucketbe kerül
 * (lejáró közösségi CDN-URL-t SOSEM tárolunk), a szemely.kep +
 * social_profil_url frissül — és a lokális tükör (szemely_local) is.
 */

import { invoke } from '@tauri-apps/api/core'

import {
  avatarStoragePath,
  extractOgImage,
  graphPictureJsonUrl,
  graphPictureUrl,
  parseSocialProfileUrl,
  realPictureUrlFromGraphJson,
} from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { getVerifiedSession } from './verified-session'
import { dbExecute } from './local-db'
import { notifyLocalDataChanged } from './sync-orchestrator'
import { errorMessage } from './error'

interface FetchedImage {
  base64: string
  mime: string
}

/** Rust-oldali kép-letöltés (CORS-mentes). */
export async function fetchImageViaRust(url: string): Promise<FetchedImage> {
  return invoke<FetchedImage>('fetch_image', { url })
}

/** Rust-oldali HTML-letöltés (og:image scrape-hez). */
async function fetchPageTextViaRust(url: string): Promise<string> {
  return invoke<string>('fetch_page_text', { url })
}

/**
 * Nyilvános profilkép letöltése közösségi linkből (best-effort) — a webes
 * `fetchSocialAvatarImage` lánc tükre: graph (numerikus FB-ID, megbízható) →
 * og:image scrape (FB-username/Instagram, best-effort) → őszinte hiba.
 */
export async function fetchSocialAvatarImageDesktop(
  socialUrl: string,
): Promise<FetchedImage | { error: string }> {
  const parsed = parseSocialProfileUrl(socialUrl)

  if (parsed.provider === 'facebook-id' && parsed.identifier) {
    try {
      const jsonText = await fetchPageTextViaRust(graphPictureJsonUrl(parsed.identifier))
      try {
        const url = realPictureUrlFromGraphJson(JSON.parse(jsonText))
        if (!url) {
          return {
            error:
              'Ehhez a Facebook-profilhoz nem érhető el nyilvános kép (a profilkép nem publikus). Használd a kézi feltöltést.',
          }
        }
        return await fetchImageViaRust(url)
      } catch {
        // JSON-parse hiba → közvetlen kép-redirect próba
        return await fetchImageViaRust(graphPictureUrl(parsed.identifier))
      }
    } catch (e) {
      return { error: `Facebook-lekérési hiba: ${errorMessage(e)}` }
    }
  }

  if (parsed.provider === 'facebook-username' || parsed.provider === 'instagram') {
    try {
      const html = await fetchPageTextViaRust(parsed.normalizedUrl)
      const og = extractOgImage(html)
      if (og) {
        try {
          return await fetchImageViaRust(og)
        } catch {
          /* esünk az őszinte hibaüzenetre */
        }
      }
    } catch {
      /* esünk az őszinte hibaüzenetre */
    }
    return {
      error:
        'A profilkép automatikus letöltése nem sikerült (a platform bejelentkezéshez köti). ' +
        'Tipp: nyisd meg a profilt, mentsd le a képet, és töltsd fel kézzel — a link így is mentésre kerül.',
    }
  }

  return { error: 'Képletöltéshez Facebook vagy Instagram profil-linket adj meg.' }
}

/** Base64 → Uint8Array (a Storage-feltöltéshez). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Avatar + közösségi link mentése (ONLINE művelet, B6-őrrel): Storage-upload
 * → szemely update → szemely_local tükör-frissítés → adat-változás jelzés.
 */
export async function saveMemberAvatarDesktop(
  szemelyId: number,
  congregationId: string,
  params: {
    kep?: { base64: string; mime: string } | null
    socialUrl: string | null
  },
): Promise<{ success?: boolean; error?: string | null }> {
  const verified = await getVerifiedSession()
  if (!verified.ok) return { error: verified.message }

  try {
    const supabase = getDesktopSupabase()
    const update: Record<string, unknown> = {
      social_profil_url: params.socialUrl?.trim() || null,
    }

    if (params.kep === null) {
      update.kep = null
      await supabase.storage
        .from('avatars')
        .remove([avatarStoragePath(congregationId, szemelyId)])
        .catch(() => undefined)
    } else if (params.kep) {
      const path = avatarStoragePath(congregationId, szemelyId)
      const bytes = base64ToBytes(params.kep.base64)
      if (bytes.byteLength === 0) return { error: 'Üres kép.' }
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: params.kep.mime || 'image/jpeg', upsert: true })
      if (upErr) {
        return {
          error: `Kép-feltöltési hiba: ${upErr.message}. (Fut már a 2026-06-11p-szemely-social-avatar.sql?)`,
        }
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      update.kep = `${pub.publicUrl}?v=${Date.now()}`
    }

    const { error: updErr } = await supabase
      .from('szemely')
      .update(update)
      .eq('id', szemelyId)
      .eq('congregation_id', congregationId)
    if (updErr) {
      return {
        error: `Mentési hiba: ${updErr.message}. (Fut már a 2026-06-11p-szemely-social-avatar.sql?)`,
      }
    }

    // Lokális tükör azonnali frissítése (a következő pull is hozná, de így
    // a UI azonnal a friss képet mutatja).
    try {
      if ('kep' in update) {
        await dbExecute(
          `UPDATE szemely_local SET kep = ?1, social_profil_url = ?2 WHERE id = ?3`,
          [(update.kep as string | null) ?? null, (update.social_profil_url as string | null) ?? null, szemelyId],
        )
      } else {
        await dbExecute(
          `UPDATE szemely_local SET social_profil_url = ?1 WHERE id = ?2`,
          [(update.social_profil_url as string | null) ?? null, szemelyId],
        )
      }
      notifyLocalDataChanged()
    } catch {
      /* a tükör-frissítés best-effort — a pull úgyis hozza */
    }

    return { success: true }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}
