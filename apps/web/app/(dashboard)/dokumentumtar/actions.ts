'use server'

/**
 * Gyülekezeti dokumentumtár (7. pont A szelet) — server actions.
 *
 * MUNKAMENET (az iktató-csatolmány F6 kontraktus mintájára):
 *  1. A fájl-feltöltés KLIENS-oldalról megy a 'gyulekezeti-dokumentumok'
 *     privát bucketbe (a storage.objects RLS-policy engedi a saját gyülekezet
 *     prefixét) — a szerver itt csak az utat készíti elő
 *     (prepareDokumentumUpload) és a metaadat-sort írja (registerDokumentum).
 *  2. Útvonal-konvenció: {congregation_id}/{kategoria}/{uuid}-{fájlnév} —
 *     SOHA nem név-slug (ismert hibaosztály: átnevezés = néma fájlvesztés).
 *  3. A metaadat-sor NEM módosítható (csak a soft-delete oszlopokra van
 *     oszlop-szintű UPDATE grant) — a sor a feltöltéskori állapotot
 *     dokumentálja.
 *  4. Törlés KÉTLÉPCSŐS (a Kuka mintájára): softDeleteDokumentum → a sor a
 *     Kukába kerül, a fájl a bucketben MARAD (visszaállítható:
 *     restoreDokumentum); purgeDokumentum → végleges törlés (storage-objektum
 *     + sor), CSAK már Kukában lévő sorra (fail-closed kényszer).
 *
 * ⚠️ Minden hiba magyarul és hangosan — a storage-hibát TILOS elnyelni.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  GYDOK_BUCKET,
  GYDOK_KATEGORIA_KEYS,
  GYDOK_MAX_BYTES,
  GYDOK_ALLOWED_TYPES_LEIRAS,
  isAllowedGydokMime,
  isGydokKategoria,
  sanitizeGydokFileName,
  type DokumentumListaInput,
  type GydokKategoria,
  type GyulekezetiDokumentum,
} from '@/lib/dokumentumtar/dokumentum-types'

// Lapozás-korlátok — a kliens nem kérhet korlátlan ablakot.
const DEFAULT_OLDAL_MERET = 20
const MAX_OLDAL_MERET = 100

// ─────────────────────────────────────────────────────────────────
// 1) Lapozott lista (kategória- és szöveg-szűréssel, Kuka-nézettel)
// ─────────────────────────────────────────────────────────────────
// A DokumentumListaInput típus a dokumentum-types.ts-ben él — a 'use server'
// fájl Next.js 16 alatt CSAK async function-t exportálhat.

/**
 * A gyülekezet dokumentumai lapozva. A rendezés determinisztikus
 * (created_at + id) — enélkül a .range() ablakok átfedhetnének/kihagyhatnának
 * sorokat (K1 Főkönyv-lapozás tanulsága).
 */
export async function listDokumentumok(
  input: DokumentumListaInput = {},
): Promise<{ rows: GyulekezetiDokumentum[]; osszesen: number; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { rows: [], osszesen: 0, error: NINCS_GYULEKEZET }

  if (input.kategoria != null && !isGydokKategoria(input.kategoria)) {
    return { rows: [], osszesen: 0, error: `Ismeretlen dokumentum-kategória: ${input.kategoria}` }
  }

  const oldalMeret = Math.min(Math.max(1, input.oldalMeret ?? DEFAULT_OLDAL_MERET), MAX_OLDAL_MERET)
  const oldal = Math.max(1, input.oldal ?? 1)
  const from = (oldal - 1) * oldalMeret
  const to = from + oldalMeret - 1
  const ascending = input.irany === 'asc'

  let query = supabase
    .from('gyulekezeti_dokumentum')
    .select('*', { count: 'exact' })
    .eq('congregation_id', congId)
    .eq('deleted', input.kuka === true)

  if (input.kategoria) query = query.eq('kategoria', input.kategoria)

  const kereses = (input.kereses || '').trim()
  if (kereses) {
    // Az ilike speciális karaktereit (% _ \) escape-eljük, hogy a felhasználói
    // szöveg literálisan keressen — enélkül pl. a "100%" mindenre találna.
    const escaped = kereses.replace(/[\\%_]/g, (m) => `\\${m}`)
    query = query.ilike('file_name', `%${escaped}%`)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending })
    .order('id', { ascending })
    .range(from, to)

  if (error) {
    return { rows: [], osszesen: 0, error: friendlyDbError('A dokumentumok betöltése sikertelen', error) }
  }
  return { rows: (data || []) as GyulekezetiDokumentum[], osszesen: count ?? 0, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 2) Kategóriánkénti darabszámok (kártyákhoz) + Kuka-darabszám
// ─────────────────────────────────────────────────────────────────

export async function getDokumentumKategoriaSzamok(): Promise<{
  szamok: Record<string, number>
  kukaSzam: number
  error: string | null
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { szamok: {}, kukaSzam: 0, error: NINCS_GYULEKEZET }

  // Kategóriánként EGZAKT head-count (sor-letöltés nélkül) — egy sima
  // select + kliens-oldali összeszámolás a PostgREST 1000 soros default
  // plafonja miatt NAGY tárnál némán alulszámolna (fail-closed elv: inkább
  // 5 olcsó count-kör párhuzamosan, mint csendben hamis szám).
  const kategoriaCounts = GYDOK_KATEGORIA_KEYS.map((key) =>
    supabase
      .from('gyulekezeti_dokumentum')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congId)
      .eq('deleted', false)
      .eq('kategoria', key),
  )
  const kukaCount = supabase
    .from('gyulekezeti_dokumentum')
    .select('id', { count: 'exact', head: true })
    .eq('congregation_id', congId)
    .eq('deleted', true)

  const results = await Promise.all([...kategoriaCounts, kukaCount])

  // Bármelyik kör hibája HANGOS — részleges (félrevezető) összesítést nem adunk.
  const firstError = results.find((r) => r.error)?.error
  if (firstError) {
    return { szamok: {}, kukaSzam: 0, error: friendlyDbError('A dokumentum-összesítés sikertelen', firstError) }
  }

  const szamok: Record<string, number> = {}
  GYDOK_KATEGORIA_KEYS.forEach((key, i) => {
    szamok[key] = results[i].count ?? 0
  })
  const kukaSzam = results[results.length - 1].count ?? 0
  return { szamok, kukaSzam, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 3) Feltöltés előkészítése — a kontraktus-út kiszámítása
// ─────────────────────────────────────────────────────────────────

/**
 * A kliens-oldali storage-feltöltés előkészítése: validál (kategória, MIME,
 * méret), és visszaadja a kötelező objektum-utat:
 * {congregation_id}/{kategoria}/{uuid}-{fájlnév}.
 *
 * A kliens EZZEL az úttal tölt fel (supabase.storage.from(...).upload), majd
 * a sikeres feltöltés után registerDokumentum-ot hív ugyanezzel az úttal.
 */
export async function prepareDokumentumUpload(input: {
  kategoria: GydokKategoria
  fileName: string
  mimeType: string
  meretBytes: number
}): Promise<{ path: string | null; error: string | null }> {
  const { congId } = await getCongId()
  if (!congId) return { path: null, error: NINCS_GYULEKEZET }

  if (!isGydokKategoria(input.kategoria)) {
    return { path: null, error: `Ismeretlen dokumentum-kategória: ${input.kategoria}` }
  }
  if (!isAllowedGydokMime(input.mimeType)) {
    return {
      path: null,
      error: `Nem támogatott fájltípus (${input.mimeType || 'ismeretlen'}). Feltölthető: ${GYDOK_ALLOWED_TYPES_LEIRAS}.`,
    }
  }
  if (!Number.isFinite(input.meretBytes) || input.meretBytes <= 0) {
    return { path: null, error: 'A fájl üresnek tűnik (0 bájt) — ellenőrizd, és próbáld újra.' }
  }
  if (input.meretBytes > GYDOK_MAX_BYTES) {
    return { path: null, error: 'A fájl túl nagy — legfeljebb 25 MB tölthető fel.' }
  }

  const safeName = sanitizeGydokFileName(input.fileName)
  const path = `${congId}/${input.kategoria}/${crypto.randomUUID()}-${safeName}`
  return { path, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 4) Dokumentum metaadat-sor rögzítése
// ─────────────────────────────────────────────────────────────────

/**
 * A dokumentum metaadat-sorának beszúrása. A fájl-feltöltés KLIENS-oldalról
 * történik (lásd prepareDokumentumUpload) — ez az action csak validál és a
 * táblát írja.
 */
export async function registerDokumentum(input: {
  kategoria: GydokKategoria
  storagePath: string
  fileName: string
  mimeType?: string | null
  meretBytes?: number | null
  megjegyzes?: string | null
}): Promise<{ dokumentum: GyulekezetiDokumentum | null; error: string | null }> {
  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { dokumentum: null, error: NINCS_GYULEKEZET }

  if (!isGydokKategoria(input.kategoria)) {
    return { dokumentum: null, error: `Ismeretlen dokumentum-kategória: ${input.kategoria}` }
  }
  const fileName = (input.fileName || '').trim()
  if (!fileName) return { dokumentum: null, error: 'A dokumentum megnevezése nem lehet üres.' }
  if (fileName.length > 200) {
    return { dokumentum: null, error: 'A dokumentum megnevezése legfeljebb 200 karakter lehet.' }
  }

  // Út-hamisítás elleni őr: a storage_path CSAK a saját gyülekezet + a
  // megadott kategória prefixe alatt lehet (a kontraktus-út első két szegmense).
  const expectedPrefix = `${congId}/${input.kategoria}/`
  if (!input.storagePath || !input.storagePath.startsWith(expectedPrefix)) {
    return {
      dokumentum: null,
      error: 'Érvénytelen tárolási út — a dokumentum nem ehhez a gyülekezethez/kategóriához tartozik.',
    }
  }
  if (input.mimeType != null && !isAllowedGydokMime(input.mimeType)) {
    return {
      dokumentum: null,
      error: `Nem támogatott fájltípus (${input.mimeType}). Feltölthető: ${GYDOK_ALLOWED_TYPES_LEIRAS}.`,
    }
  }
  if (input.meretBytes != null && input.meretBytes > GYDOK_MAX_BYTES) {
    return { dokumentum: null, error: 'A fájl túl nagy — legfeljebb 25 MB tölthető fel.' }
  }

  const { data, error } = await supabase
    .from('gyulekezeti_dokumentum')
    .insert([
      {
        congregation_id: congId,
        kategoria: input.kategoria,
        file_name: fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType || null,
        meret_bytes: input.meretBytes ?? null,
        megjegyzes: (input.megjegyzes || '').trim() || null,
        created_by_profile_id: userId ?? null,
      },
    ])
    .select('*')
    .single()

  if (error) {
    // 23505 = a storage_path már regisztrálva (elveszett válasz utáni retry)
    if (error.code === '23505') {
      return {
        dokumentum: null,
        error: 'Ez a fájl már rögzítve van a dokumentumtárban — frissítsd a listát.',
      }
    }
    return { dokumentum: null, error: friendlyDbError('A dokumentum rögzítése sikertelen', error) }
  }
  revalidatePath('/dokumentumtar')
  return { dokumentum: data as GyulekezetiDokumentum, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 5) Signed URL a megnyitáshoz/letöltéshez (600 s)
// ─────────────────────────────────────────────────────────────────

/**
 * Időkorlátos (600 másodperces) link a dokumentumhoz. `letoltesre = true`
 * esetén a link letöltést kényszerít az EREDETI fájlnévvel (Content-
 * Disposition: attachment) — enélkül a böngésző az uuid-s tárolási nevet
 * adná a mentett fájlnak.
 */
export async function getDokumentumUrl(
  id: string,
  letoltesre = false,
): Promise<{ url: string | null; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { url: null, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('gyulekezeti_dokumentum')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) return { url: null, error: friendlyDbError('A dokumentum lekérése sikertelen', error) }
  if (!data) return { url: null, error: 'A dokumentum nem található — lehet, hogy időközben törölték.' }

  const row = data as { storage_path: string; file_name: string }
  const { data: signed, error: signErr } = await supabase.storage
    .from(GYDOK_BUCKET)
    .createSignedUrl(row.storage_path, 600, letoltesre ? { download: row.file_name } : undefined)
  if (signErr) return { url: null, error: `A link készítése sikertelen: ${signErr.message}` }
  if (!signed?.signedUrl) return { url: null, error: 'A link készítése sikertelen (üres válasz).' }
  return { url: signed.signedUrl, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 6) Törlés a Kukába (soft-delete) + visszaállítás
// ─────────────────────────────────────────────────────────────────

/**
 * A dokumentum a Kukába kerül — a fájl a bucketben MARAD, a sor
 * visszaállítható (restoreDokumentum). Végleges törlés: purgeDokumentum.
 */
export async function softDeleteDokumentum(
  id: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { success: false, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('gyulekezeti_dokumentum')
    .update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_profile_id: userId ?? null,
    })
    .eq('id', id)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .select('id')
  if (error) return { success: false, error: friendlyDbError('A dokumentum Kukába helyezése sikertelen', error) }
  // FAIL-CLOSED: a 0 érintett sor NEM siker — vagy nincs ilyen sor, vagy már
  // a Kukában van (némán „sikerült"-et jelenteni tilos).
  if (!data || data.length === 0) {
    return { success: false, error: 'A dokumentum nem található, vagy már a Kukában van — frissítsd a listát.' }
  }
  revalidatePath('/dokumentumtar')
  return { success: true, error: null }
}

/** A Kukában lévő dokumentum visszaállítása. */
export async function restoreDokumentum(
  id: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('gyulekezeti_dokumentum')
    .update({ deleted: false, deleted_at: null, deleted_by_profile_id: null })
    .eq('id', id)
    .eq('congregation_id', congId)
    .eq('deleted', true)
    .select('id')
  if (error) return { success: false, error: friendlyDbError('A dokumentum visszaállítása sikertelen', error) }
  if (!data || data.length === 0) {
    return { success: false, error: 'A dokumentum nem található a Kukában — frissítsd a listát.' }
  }
  revalidatePath('/dokumentumtar')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 7) Végleges törlés — storage-objektum + tábla-sor
// ─────────────────────────────────────────────────────────────────

/**
 * VÉGLEGES törlés: ELŐSZÖR a storage-objektum, UTÁNA a tábla-sor.
 * Fail-closed kényszerek:
 *  - csak MÁR A KUKÁBAN lévő sor törölhető véglegesen (kétlépcsős törlés),
 *  - a storage-hiba hangos — ilyenkor a sor is megmarad, hogy újra lehessen
 *    próbálni (ne maradjon gazdátlan fájl a privát bucketben).
 */
export async function purgeDokumentum(
  id: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('gyulekezeti_dokumentum')
    .select('id, storage_path, file_name, deleted')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) return { success: false, error: friendlyDbError('A dokumentum lekérése sikertelen', error) }
  if (!data) return { success: false, error: 'A dokumentum nem található — lehet, hogy már törölték.' }

  const row = data as { id: string; storage_path: string; file_name: string; deleted: boolean }
  if (!row.deleted) {
    return {
      success: false,
      error: 'Végleges törlés csak a Kukából lehetséges — előbb helyezd a dokumentumot a Kukába.',
    }
  }

  const { data: removed, error: removeErr } = await supabase.storage
    .from(GYDOK_BUCKET)
    .remove([row.storage_path])
  if (removeErr) {
    // HANGOS hiba — a metaadat-sor marad, a törlés újrapróbálható.
    return {
      success: false,
      error: `A fájl törlése a tárhelyről sikertelen (${row.file_name}): ${removeErr.message} — a bejegyzés megmaradt, próbáld újra.`,
    }
  }
  // ⚠️ A remove() a policy által KISZŰRT (nem törölhető) objektumnál is hiba
  // NÉLKÜL, üres listával tér vissza — ez a néma no-op megkülönböztethetetlen
  // a „már korábban eltűnt" esettől. Létezés-próbával döntünk: ha a fájl még
  // megvan, hangos hiba és a metaadat-sor MARAD (különben örökre árva,
  // hivatkozás nélküli fájl maradna a privát bucketben).
  if (!removed || removed.length === 0) {
    const { data: probe } = await supabase.storage
      .from(GYDOK_BUCKET)
      .createSignedUrl(row.storage_path, 60)
    if (probe?.signedUrl) {
      return {
        success: false,
        error: `A fájl törlése a tárhelyről nem történt meg (${row.file_name}) — valószínűleg jogosultsági (policy-) hiba. A bejegyzés megmaradt, próbáld újra.`,
      }
    }
    // A létezés-próba sem találja → az objektum tényleg nincs már meg,
    // a sor törlése a helyes folytatás.
  }

  const { data: deleted, error: delErr } = await supabase
    .from('gyulekezeti_dokumentum')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congId)
    .select('id')
  if (delErr) {
    return {
      success: false,
      error: `A dokumentum-bejegyzés törlése sikertelen: ${delErr.message} (a fájl a tárhelyről már törlődött — próbáld újra a bejegyzés törlését)`,
    }
  }
  if (!deleted || deleted.length === 0) {
    return { success: false, error: 'A dokumentum-bejegyzés nem található — lehet, hogy már törölték.' }
  }
  revalidatePath('/dokumentumtar')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek ('use server' fájl csak async function-t exportálhat)
// ─────────────────────────────────────────────────────────────────

const NINCS_GYULEKEZET = 'Nincs bejelentkezett felhasználó vagy gyülekezet.'

async function getCongId() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId, userId }
}

/**
 * DB-hiba magyarul, hangosan. 42P01/42703/PGRST205 = a tábla/oszlop hiányzik
 * → a dokumentumtár-migráció még nem futott le (cselekvésre felszólító üzenet).
 */
function friendlyDbError(prefix: string, error: { code?: string; message: string }): string {
  const migrationMissing =
    error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205'
  if (migrationMissing) {
    return `${prefix}: a dokumentumtárhoz szükséges adatbázis-migráció még nincs lefuttatva (migration-docs/sql/2026-08-15-dokumentumtar-gyulekezeti-fajlok.sql). Részlet: ${error.message}`
  }
  return `${prefix}: ${error.message}`
}
