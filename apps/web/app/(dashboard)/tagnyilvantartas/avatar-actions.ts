'use server'

/**
 * Személy-avatar akciók (2026-06-11, Endre kérése).
 *
 * KUTATÁSI HÁTTÉR (lásd `@kartoteka/ui-app` members/social-avatar.ts):
 *   - graph.facebook.com/{NUMERIKUS_ID}/picture token nélkül működik;
 *     az `is_silhouette` flag mondja meg, valódi kép-e.
 *   - og:image scrape (FB username / Instagram): best-effort — login-fal
 *     miatt gyakran nem ad képet; ilyenkor a kézi feltöltés az út.
 *   - A közösségi CDN-képek lejáró aláírt URL-ek → a képet MINDIG letöltjük
 *     és a saját 'avatars' Storage bucketbe mentjük (sosem hotlink).
 *
 * GDPR-megjegyzés: nyilvánosan közzétett profilképről van szó, amit a
 * lelkész tudatosan társít — a kép a gyülekezet saját tárhelyére kerül.
 */

import { revalidatePath } from 'next/cache'

import {
  avatarStoragePath,
  extractOgImage,
  graphPictureJsonUrl,
  graphPictureUrl,
  parseSocialProfileUrl,
  realPictureUrlFromGraphJson,
} from '@kartoteka/ui-app'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

async function downloadImage(url: string): Promise<{ base64: string; mime: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*,*/*;q=0.8' },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) return { error: `A kép letöltése nem sikerült (HTTP ${res.status}).` }
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    if (!mime.startsWith('image/')) return { error: 'A link nem képet adott vissza.' }
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return { error: 'Üres kép érkezett.' }
    if (buf.byteLength > MAX_IMAGE_BYTES) return { error: 'A kép túl nagy (max 5 MB).' }
    return { base64: Buffer.from(buf).toString('base64'), mime }
  } catch (e) {
    return { error: `Letöltési hiba: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Nyilvános profilkép letöltése a megadott közösségi linkből (best-effort).
 * A képet NEM menti — a kliens előnézet után a saveMemberAvatar-ral véglegesít.
 */
export async function fetchSocialAvatarImage(
  socialUrl: string,
): Promise<{ base64: string; mime: string } | { error: string }> {
  const access = await getEffectiveCongregationContext()
  if (!access.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const parsed = parseSocialProfileUrl(socialUrl)

  // 1) MEGBÍZHATÓ út: numerikus Facebook-ID → Graph picture
  if (parsed.provider === 'facebook-id' && parsed.identifier) {
    try {
      const jsonRes = await fetch(graphPictureJsonUrl(parsed.identifier), { cache: 'no-store' })
      if (jsonRes.ok) {
        const url = realPictureUrlFromGraphJson(await jsonRes.json())
        if (!url) {
          return {
            error:
              'Ehhez a Facebook-profilhoz nem érhető el nyilvános kép (a profilkép nem publikus). Használd a kézi feltöltést.',
          }
        }
        return downloadImage(url)
      }
      // JSON-végpont hiba → közvetlen kép-redirect próba
      return downloadImage(graphPictureUrl(parsed.identifier))
    } catch (e) {
      return { error: `Facebook-lekérési hiba: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  // 2) Best-effort: og:image a profil-oldal HTML-jéből (FB username / Instagram)
  if (parsed.provider === 'facebook-username' || parsed.provider === 'instagram') {
    try {
      const res = await fetch(parsed.normalizedUrl, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
        cache: 'no-store',
      })
      if (res.ok) {
        const og = extractOgImage(await res.text())
        if (og) {
          const img = await downloadImage(og)
          if (!('error' in img)) return img
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

/**
 * Avatar + közösségi link mentése: a kép a saját 'avatars' bucketbe töltődik,
 * a szemely.kep a publikus URL-t, a social_profil_url a linket kapja.
 */
export async function saveMemberAvatar(
  szemelyId: number,
  params: {
    /** Új kép (nyers base64 + mime); null = kép törlése; undefined = nem változik. */
    kep?: { base64: string; mime: string } | null
    socialUrl: string | null
  },
): Promise<{ success?: boolean; error?: string | null }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  // A személy a saját gyülekezethez tartozik-e (RLS mellett is explicit)
  const { data: person, error: personErr } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (personErr) return { error: personErr.message }
  if (!person) return { error: 'A személy nem található a gyülekezetben.' }

  const update: Record<string, unknown> = {
    social_profil_url: params.socialUrl?.trim() || null,
  }

  if (params.kep === null) {
    // Kép törlése — a Storage-objektumot is takarítjuk (best-effort)
    update.kep = null
    await supabase.storage
      .from('avatars')
      .remove([avatarStoragePath(congregationId, szemelyId)])
      .catch(() => undefined)
  } else if (params.kep) {
    const path = avatarStoragePath(congregationId, szemelyId)
    const bytes = Buffer.from(params.kep.base64, 'base64')
    if (bytes.byteLength === 0) return { error: 'Üres kép.' }
    if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: 'A kép túl nagy (max 5 MB).' }
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: params.kep.mime || 'image/jpeg', upsert: true })
    if (upErr) {
      return {
        error: `Kép-feltöltési hiba: ${upErr.message}. (Fut már a 2026-06-11p-szemely-social-avatar.sql?)`,
      }
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-törő paraméter — a stabil útvonal felülírásakor a böngésző-cache ne ragadjon.
    update.kep = `${pub.publicUrl}?v=${Date.now()}`
  }

  const { error: updErr } = await supabase.from('szemely').update(update).eq('id', szemelyId)
  if (updErr) {
    return {
      error: `Mentési hiba: ${updErr.message}. (Fut már a 2026-06-11p-szemely-social-avatar.sql?)`,
    }
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
