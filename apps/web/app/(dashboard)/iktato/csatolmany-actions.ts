'use server'

/**
 * Iktató F6 — csatolmány (befotózott/feltöltött irat-oldalak) server actions
 * (K5, KONTRAKTUS C).
 *
 * MUNKAMENET (a K1 DB-kontraktus szerint):
 *  1. A fájl-feltöltés KLIENS-oldalról megy az 'iktato-csatolmanyok' privát
 *     bucketbe (a storage.objects RLS-policy engedi a saját gyülekezet
 *     prefixét) — a szerver itt csak az utat készíti elő (prepareCsatolmanyUpload)
 *     és a metaadat-sort írja (registerCsatolmany).
 *  2. storage_path NULL = csak metaadat-rögzítés (papíralapú irat jelzése,
 *     nincs digitalizált fájl).
 *  3. Csatolmány-sor NEM módosítható (a táblán nincs UPDATE grant/policy) —
 *     a helyes út: törlés + új rögzítés.
 *  4. A storage-objektum sem írható felül — minden feltöltés új, uuid-s utat kap.
 *
 * ⚠️ Minden hiba magyarul és hangosan — a storage-hibát TILOS elnyelni.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  CSATOLMANY_BUCKET,
  CSATOLMANY_MAX_BYTES,
  CSATOLMANY_ALLOWED_MIME_TYPES,
  isAllowedCsatolmanyMime,
  sanitizeCsatolmanyFileName,
  type IktatoCsatolmany,
} from '@/lib/iktato/csomo-types'

// ─────────────────────────────────────────────────────────────────
// 1) Egy irat csatolmányai
// ─────────────────────────────────────────────────────────────────

/** Az irat csatolmányai oldal-sorszám szerint növekvő sorrendben. */
export async function listCsatolmanyok(
  iktatoId: string,
): Promise<{ csatolmanyok: IktatoCsatolmany[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) {
    return { csatolmanyok: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }

  const { data, error } = await supabase
    .from('iktato_csatolmany')
    .select('*')
    .eq('iktato_id', iktatoId)
    .eq('congregation_id', congId)
    .order('oldal_sorszam', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    return { csatolmanyok: [], error: friendlyDbError('A csatolmányok betöltése sikertelen', error) }
  }
  return { csatolmanyok: (data || []) as IktatoCsatolmany[], error: null }
}

// ─────────────────────────────────────────────────────────────────
// 2) Feltöltés előkészítése — a kontraktus-út kiszámítása
// ─────────────────────────────────────────────────────────────────

/**
 * A kliens-oldali storage-feltöltés előkészítése: validál (irat létezik-e a
 * saját gyülekezetben, MIME + méret), és visszaadja a kötelező objektum-utat:
 * {congregation_id}/{iktato_id}/{uuid}-{fájlnév}.
 *
 * A kliens EZZEL az úttal tölt fel (supabase.storage.from(...).upload), majd
 * a sikeres feltöltés után registerCsatolmany-t hív ugyanezzel az úttal.
 */
export async function prepareCsatolmanyUpload(input: {
  iktatoId: string
  fileName: string
  mimeType: string
  meretBytes: number
}): Promise<{ path: string | null; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { path: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  if (!isAllowedCsatolmanyMime(input.mimeType)) {
    return {
      path: null,
      error: `Nem támogatott fájltípus (${input.mimeType || 'ismeretlen'}). Engedélyezett: JPEG, PNG, WebP kép vagy PDF.`,
    }
  }
  if (!Number.isFinite(input.meretBytes) || input.meretBytes <= 0) {
    return { path: null, error: 'A fájl üresnek tűnik (0 bájt) — ellenőrizd, és próbáld újra.' }
  }
  if (input.meretBytes > CSATOLMANY_MAX_BYTES) {
    return { path: null, error: 'A fájl túl nagy — legfeljebb 10 MB tölthető fel.' }
  }

  const entryErr = await verifyEntry(supabase, congId, input.iktatoId)
  if (entryErr) return { path: null, error: entryErr }

  const safeName = sanitizeCsatolmanyFileName(input.fileName)
  const path = `${congId}/${input.iktatoId}/${crypto.randomUUID()}-${safeName}`
  return { path, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 3) Csatolmány metaadat-sor rögzítése
// ─────────────────────────────────────────────────────────────────

/**
 * A csatolmány metaadat-sorának beszúrása. A fájl-feltöltés KLIENS-oldalról
 * történik (lásd prepareCsatolmanyUpload) — ez az action csak validál és a
 * táblát írja. storagePath = null → csak metaadat-rögzítés (papíralapú irat).
 *
 * Az oldalSorszam kihagyása esetén automatikusan a következő szabad sorszámot
 * kapja (max meglévő + 1).
 */
export async function registerCsatolmany(input: {
  iktatoId: string
  storagePath: string | null
  fileName: string
  mimeType?: string | null
  meretBytes?: number | null
  oldalSorszam?: number | null
  megjegyzes?: string | null
}): Promise<{ csatolmany: IktatoCsatolmany | null; error: string | null }> {
  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { csatolmany: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const fileName = (input.fileName || '').trim()
  if (!fileName) return { csatolmany: null, error: 'A csatolmány megnevezése nem lehet üres.' }
  if (fileName.length > 200) {
    return { csatolmany: null, error: 'A csatolmány megnevezése legfeljebb 200 karakter lehet.' }
  }

  // Út-hamisítás elleni őr: a storage_path CSAK a saját gyülekezet + az adott
  // irat prefixe alatt lehet (a kontraktus-út első két szegmense).
  if (input.storagePath) {
    const expectedPrefix = `${congId}/${input.iktatoId}/`
    if (!input.storagePath.startsWith(expectedPrefix)) {
      return {
        csatolmany: null,
        error: 'Érvénytelen tárolási út — a csatolmány nem ehhez az irathoz/gyülekezethez tartozik.',
      }
    }
    if (input.mimeType != null && !isAllowedCsatolmanyMime(input.mimeType)) {
      return {
        csatolmany: null,
        error: `Nem támogatott fájltípus (${input.mimeType}). Engedélyezett: ${CSATOLMANY_ALLOWED_MIME_TYPES.join(', ')}.`,
      }
    }
    if (input.meretBytes != null && input.meretBytes > CSATOLMANY_MAX_BYTES) {
      return { csatolmany: null, error: 'A fájl túl nagy — legfeljebb 10 MB tölthető fel.' }
    }
  }

  const entryErr = await verifyEntry(supabase, congId, input.iktatoId)
  if (entryErr) return { csatolmany: null, error: entryErr }

  // Oldal-sorszám: explicit érték, vagy a következő szabad (max+1)
  let oldalSorszam = input.oldalSorszam ?? null
  if (oldalSorszam != null && (!Number.isInteger(oldalSorszam) || oldalSorszam < 1)) {
    return { csatolmany: null, error: 'Az oldal sorszáma 1-től kezdődő egész szám lehet.' }
  }
  if (oldalSorszam == null) {
    const { data: last, error: lastErr } = await supabase
      .from('iktato_csatolmany')
      .select('oldal_sorszam')
      .eq('iktato_id', input.iktatoId)
      .eq('congregation_id', congId)
      .order('oldal_sorszam', { ascending: false })
      .limit(1)
    if (lastErr) {
      return {
        csatolmany: null,
        error: friendlyDbError('A következő oldal-sorszám megállapítása sikertelen', lastErr),
      }
    }
    oldalSorszam = ((last?.[0] as { oldal_sorszam: number } | undefined)?.oldal_sorszam ?? 0) + 1
  }

  const { data, error } = await supabase
    .from('iktato_csatolmany')
    .insert([
      {
        iktato_id: input.iktatoId,
        // Denormalizált — a K1 kontraktus szerint az iktato sorával egyezően
        // KELL beszúrni (a verifyEntry fentebb pont ezt garantálja).
        congregation_id: congId,
        storage_path: input.storagePath || null,
        file_name: fileName,
        mime_type: input.mimeType || null,
        meret_bytes: input.meretBytes ?? null,
        oldal_sorszam: oldalSorszam,
        megjegyzes: (input.megjegyzes || '').trim() || null,
        created_by_profile_id: userId ?? null,
      },
    ])
    .select('*')
    .single()
  if (error) {
    return { csatolmany: null, error: friendlyDbError('A csatolmány rögzítése sikertelen', error) }
  }
  revalidatePath('/iktato')
  return { csatolmany: data as IktatoCsatolmany, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 4) Signed URL a megnyitáshoz (600 s)
// ─────────────────────────────────────────────────────────────────

/**
 * Időkorlátos (600 másodperces) letöltési link a csatolmány fájljához.
 * Csak metaadat-rögzítésnél (storage_path = NULL) értelmezhetetlen → hiba.
 */
export async function getCsatolmanyUrl(
  id: string,
): Promise<{ url: string | null; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { url: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const { data, error } = await supabase
    .from('iktato_csatolmany')
    .select('storage_path')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) return { url: null, error: friendlyDbError('A csatolmány lekérése sikertelen', error) }
  if (!data) return { url: null, error: 'A csatolmány nem található — lehet, hogy időközben törölték.' }

  const storagePath = (data as { storage_path: string | null }).storage_path
  if (!storagePath) {
    return {
      url: null,
      error: 'Ehhez a csatolmányhoz nincs feltöltött fájl — csak metaadat-rögzítés történt (papíralapú irat).',
    }
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(CSATOLMANY_BUCKET)
    .createSignedUrl(storagePath, 600)
  if (signErr) return { url: null, error: `A letöltési link készítése sikertelen: ${signErr.message}` }
  if (!signed?.signedUrl) return { url: null, error: 'A letöltési link készítése sikertelen (üres válasz).' }
  return { url: signed.signedUrl, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 5) Csatolmány törlése — storage-objektum + tábla-sor
// ─────────────────────────────────────────────────────────────────

/**
 * Csatolmány törlése: ELŐSZÖR a storage-objektum (ha van), UTÁNA a tábla-sor.
 * A storage-hiba hangos — ilyenkor a sor is megmarad, hogy újra lehessen
 * próbálni (ne maradjon gazdátlan fájl a bucketben).
 */
export async function deleteCsatolmany(
  id: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const { data, error } = await supabase
    .from('iktato_csatolmany')
    .select('id, storage_path, file_name')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) return { success: false, error: friendlyDbError('A csatolmány lekérése sikertelen', error) }
  if (!data) return { success: false, error: 'A csatolmány nem található — lehet, hogy már törölték.' }

  const row = data as { id: string; storage_path: string | null; file_name: string }
  if (row.storage_path) {
    const { error: removeErr } = await supabase.storage
      .from(CSATOLMANY_BUCKET)
      .remove([row.storage_path])
    if (removeErr) {
      // HANGOS hiba — a metaadat-sor marad, a törlés újrapróbálható.
      return {
        success: false,
        error: `A fájl törlése a tárhelyről sikertelen (${row.file_name}): ${removeErr.message} — a csatolmány-bejegyzés megmaradt, próbáld újra.`,
      }
    }
    // Megjegyzés: ha az objektum már korábban eltűnt, a remove hiba nélkül,
    // üres listával tér vissza — ilyenkor a sor törlése a helyes folytatás.
  }

  const { data: deleted, error: delErr } = await supabase
    .from('iktato_csatolmany')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congId)
    .select('id')
  if (delErr) {
    return {
      success: false,
      error: `A csatolmány-bejegyzés törlése sikertelen: ${delErr.message}${
        row.storage_path ? ' (a fájl a tárhelyről már törlődött — próbáld újra a bejegyzés törlését)' : ''
      }`,
    }
  }
  if (!deleted || deleted.length === 0) {
    return { success: false, error: 'A csatolmány-bejegyzés nem található — lehet, hogy már törölték.' }
  }
  revalidatePath('/iktato')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek ('use server' fájl csak async function-t exportálhat)
// ─────────────────────────────────────────────────────────────────

async function getCongId() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId, userId }
}

type SupabaseCtx = Awaited<ReturnType<typeof getCongId>>['supabase']

/** Az irat létezik-e (nem törölt) a saját gyülekezetben — null = rendben. */
async function verifyEntry(
  supabase: SupabaseCtx,
  congId: string,
  iktatoId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('iktato')
    .select('id')
    .eq('id', iktatoId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .maybeSingle()
  if (error) return `Az irat ellenőrzése sikertelen: ${error.message}`
  if (!data) return 'Az iktatott irat nem található — lehet, hogy időközben törölték.'
  return null
}

/**
 * DB-hiba magyarul, hangosan. 42P01/42703/PGRST205 = a tábla/oszlop hiányzik
 * → az F6-migráció még nem futott le (cselekvésre felszólító üzenet).
 */
function friendlyDbError(prefix: string, error: { code?: string; message: string }): string {
  const migrationMissing =
    error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205'
  if (migrationMissing) {
    return `${prefix}: a csatolmány-funkcióhoz szükséges adatbázis-migráció még nincs lefuttatva (migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql). Részlet: ${error.message}`
  }
  return `${prefix}: ${error.message}`
}
