'use server'

/**
 * Iktató F8d — QR-kódos telefonos feltöltés (desktop → mobil) server actions.
 *
 * Tervdoc: docs/project-tracking/KARTOTEKA-iktato-szkenneles-kutatas-2026-07-25.md
 * DB-kontraktus: migration-docs/sql/2026-07-25-f8d-qr-feltoltes.sql
 *
 * MUNKAMENET:
 *  1. A desktop „Fotózás telefonnal (QR)" gombja createQrSession-t hív → egy
 *     rövid életű (10 perces) upload_sessions sor születik. A NYERS token CSAK
 *     a QR-kód URL-jébe kerül; a DB-be a sha256-hash-e megy (a mobil-oldali
 *     RPC-k maguk hash-elik a kapott nyers tokent).
 *  2. A telefon a publikus /m/feltoltes/{token} oldalon, bejelentkezés nélkül
 *     tölt fel a 'qr-staging/{session_id}/…' útra, majd a qr_register_upload
 *     RPC írja a csatolmány-sort (a gyülekezet a MUNKAMENET-SORBÓL — soha nem
 *     a hívó felhasználóból: scope-divergencia hibaosztály).
 *  3. A desktop pollQrUploads-szal figyeli a beérkezést (2,5 mp), és a
 *     closeQrSession-nel bármikor visszavonhatja a munkamenetet.
 *
 * ⚠️ BIZTONSÁG: a token az EGYETLEN belépő a mobil-oldalhoz, ezért
 *    - kriptográfiailag erős, 48 karakteres (randomUUID + extra random),
 *    - sosem tárolódik nyersen, sosem kerül logba,
 *    - 10 perc után lejár, és a desktopról kézzel is lezárható,
 *    - a QR-URL-be SEMMILYEN személyes adat nem kerül (csak a token).
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { IktatoCsatolmany } from '@/lib/iktato/csomo-types'
import { listCsatolmanyok } from './csatolmany-actions'

// ─────────────────────────────────────────────────────────────────
// 1) Munkamenet indítása — a QR-kód tartalmának előállítása
// ─────────────────────────────────────────────────────────────────

/**
 * QR-feltöltő munkamenet indítása egy iktatott irathoz.
 *
 * Visszaadja a NYERS tokent és a mobil-URL-t (ebből készül a QR-kód a
 * kliensen). A token csak itt, a válaszban létezik nyersen — a DB-ben a
 * sha256-hash-e tárolódik.
 */
export async function createQrSession(iktatoId: string): Promise<{
  session: {
    sessionId: string
    token: string
    url: string
    expiresAt: string
    maxFiles: number
    uploadedCount: number
    iktatoszam: string
  } | null
  error: string | null
}> {
  const { supabase, congregationId: congId, userId } = await getCongCtx()
  if (!congId) return { session: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  if (!ervenyesUuid(iktatoId)) {
    return { session: null, error: 'Érvénytelen irat-azonosító.' }
  }

  // Az irat létezik-e (nem törölt) a saját gyülekezetben — az iktatószám a
  // telefonon is megjelenik, ezért itt is szükségünk van rá.
  const { data: entry, error: entryErr } = await supabase
    .from('iktato')
    .select('id, year, sequence_number')
    .eq('id', iktatoId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .maybeSingle()
  if (entryErr) {
    return { session: null, error: `Az irat ellenőrzése sikertelen: ${entryErr.message}` }
  }
  if (!entry) {
    return { session: null, error: 'Az iktatott irat nem található — lehet, hogy időközben törölték.' }
  }

  const alapUrl = await feltoltoAlapUrl()
  if (!alapUrl) {
    return {
      session: null,
      error:
        'A telefonos feltöltő címe nem állapítható meg (hiányzó vagy hibás NEXT_PUBLIC_APP_URL beállítás) — szólj a rendszergazdának.',
    }
  }

  // Token: 32 hex (randomUUID) + 16 hex (extra random) = 48 karakter.
  const token = `${randomUUID().replace(/-/g, '')}${randomBytes(8).toString('hex')}`
  // ⚠️ KISBETŰS hex — a DB-oldali encode(digest(token,'sha256'),'hex') ezzel egyezik.
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex')

  // TTL: 10 perc (a DB-plafon 2 óra — a tervdoc szerinti gyakorlati érték 5–10 perc).
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('upload_sessions')
    .insert([
      {
        congregation_id: congId,
        iktato_id: iktatoId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        max_files: 20,
        created_by_profile_id: userId ?? null,
      },
    ])
    .select('id, expires_at, max_files, uploaded_count')
    .single()
  if (error || !data) {
    return { session: null, error: friendlyQrError('A QR-munkamenet indítása sikertelen', error) }
  }

  const row = data as {
    id: string
    expires_at: string
    max_files: number
    uploaded_count: number
  }
  return {
    session: {
      sessionId: row.id,
      token,
      url: `${alapUrl}/m/feltoltes/${token}`,
      expiresAt: row.expires_at,
      maxFiles: row.max_files,
      uploadedCount: row.uploaded_count,
      iktatoszam: `${(entry as { year: number }).year}/${(entry as { sequence_number: number }).sequence_number}`,
    },
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2) Munkamenet lezárása (visszavonás)
// ─────────────────────────────────────────────────────────────────

/**
 * A QR-munkamenet kézi lezárása — a QR-kód azonnal érvénytelen lesz.
 * Idempotens: már lezárt/lejárt munkamenetre sem hibázik.
 */
export async function closeQrSession(sessionId: string): Promise<{
  status: string | null
  uploadedCount: number | null
  error: string | null
}> {
  const { supabase, congregationId: congId } = await getCongCtx()
  if (!congId) return { status: null, uploadedCount: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  if (!ervenyesUuid(sessionId)) {
    return { status: null, uploadedCount: null, error: 'Érvénytelen munkamenet-azonosító.' }
  }

  const { data, error } = await supabase.rpc('qr_session_close', { p_session_id: sessionId })
  if (error) {
    return { status: null, uploadedCount: null, error: friendlyQrError('A munkamenet lezárása sikertelen', error) }
  }
  const eredmeny = (data || {}) as { status?: string; uploaded_count?: number }
  return {
    status: eredmeny.status ?? null,
    uploadedCount: eredmeny.uploaded_count ?? null,
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// 3) Beérkezés-figyelés (polling-fallback a Realtime helyett)
// ─────────────────────────────────────────────────────────────────

/**
 * A telefonról frissen beérkezett csatolmányok lekérése (a meglévő
 * listCsatolmanyok-ra építve), plusz a munkamenet állapota (számláló,
 * lejárat) — a desktop 2,5 másodpercenként hívja, amíg a QR nyitva van.
 *
 * @param sinceIso  ISO-timestamp; csak az ennél frissebb sorok jönnek vissza.
 *                  null = minden sor (első hívás).
 */
export async function pollQrUploads(
  iktatoId: string,
  sinceIso: string | null,
  sessionId?: string,
): Promise<{
  ujCsatolmanyok: IktatoCsatolmany[]
  session: { uploadedCount: number; status: string; expiresAt: string } | null
  error: string | null
}> {
  const { supabase, congregationId: congId } = await getCongCtx()
  if (!congId) {
    return { ujCsatolmanyok: [], session: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }

  const { csatolmanyok, error } = await listCsatolmanyok(iktatoId)
  if (error) return { ujCsatolmanyok: [], session: null, error }

  const hatar = sinceIso ? Date.parse(sinceIso) : Number.NaN
  const ujak = Number.isFinite(hatar)
    ? csatolmanyok.filter((cs) => {
        const t = Date.parse(cs.created_at || '')
        return Number.isFinite(t) && t > hatar
      })
    : csatolmanyok

  let session: { uploadedCount: number; status: string; expiresAt: string } | null = null
  if (sessionId && ervenyesUuid(sessionId)) {
    const { data } = await supabase
      .from('upload_sessions')
      .select('uploaded_count, status, expires_at')
      .eq('id', sessionId)
      .eq('congregation_id', congId)
      .maybeSingle()
    if (data) {
      const row = data as { uploaded_count: number; status: string; expires_at: string }
      session = {
        uploadedCount: row.uploaded_count,
        status: row.status,
        expiresAt: row.expires_at,
      }
    }
  }

  return { ujCsatolmanyok: ujak, session, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 4) Pecsét-adatok egy irathoz (desktop-oldali pecsételéshez)
// ─────────────────────────────────────────────────────────────────

/**
 * A digitális iktató-pecsét tartalma egy irathoz: iktatószám, gyülekezetnév,
 * iratcsomó (ha van). A dátumot a hívó adja hozzá (helyi nap).
 *
 * Külön action, hogy a csatolmány-panel bárhonnan beágyazva is teljes
 * pecsétet tudjon rajzolni (a szülő komponensnek nem kell átadnia semmit).
 */
export async function getIktatoPecsetAdat(iktatoId: string): Promise<{
  adat: { iktatoszam: string; gyulekezet: string; iratcsomo: string | null } | null
  error: string | null
}> {
  const ctx = await getEffectiveAccessContext()
  const supabase = ctx.supabase
  const congId = ctx.effectiveCongregationId
  if (!congId) return { adat: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  if (!ervenyesUuid(iktatoId)) return { adat: null, error: 'Érvénytelen irat-azonosító.' }

  // A csomo_id csak az F6-migráció után létezik — hiánya nem lehet végzetes.
  let year: number | null = null
  let seq: number | null = null
  let csomoId: string | null = null

  const teljes = await supabase
    .from('iktato')
    .select('year, sequence_number, csomo_id')
    .eq('id', iktatoId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .maybeSingle()
  if (teljes.error) {
    const alap = await supabase
      .from('iktato')
      .select('year, sequence_number')
      .eq('id', iktatoId)
      .eq('congregation_id', congId)
      .eq('deleted', false)
      .maybeSingle()
    if (alap.error) {
      return { adat: null, error: `A pecsét-adatok lekérése sikertelen: ${alap.error.message}` }
    }
    if (alap.data) {
      year = (alap.data as { year: number }).year
      seq = (alap.data as { sequence_number: number }).sequence_number
    }
  } else if (teljes.data) {
    const row = teljes.data as { year: number; sequence_number: number; csomo_id: string | null }
    year = row.year
    seq = row.sequence_number
    csomoId = row.csomo_id ?? null
  }

  if (year == null || seq == null) {
    return { adat: null, error: 'Az iktatott irat nem található — lehet, hogy időközben törölték.' }
  }

  let iratcsomo: string | null = null
  if (csomoId) {
    const { data: csomo } = await supabase
      .from('iratcsomo')
      .select('nev')
      .eq('id', csomoId)
      .eq('congregation_id', congId)
      .maybeSingle()
    iratcsomo = (csomo as { nev: string } | null)?.nev ?? null
  }

  return {
    adat: {
      iktatoszam: `${year}/${seq}`,
      gyulekezet: ctx.congregationName || 'Gyülekezet',
      iratcsomo,
    },
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek ('use server' fájl csak async function-t exportálhat)
// ─────────────────────────────────────────────────────────────────

async function getCongCtx() {
  const ctx = await getEffectiveAccessContext()
  return { supabase: ctx.supabase, congregationId: ctx.effectiveCongregationId, userId: ctx.userId }
}

/** Lazán ellenőrzött uuid-alak — a nyilvánvalóan hibás bemenet korai kiszűrése. */
function ervenyesUuid(ertek: string | null | undefined): boolean {
  return !!ertek && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ertek)
}

/** Séma/hitelesség-ellenőrzött origin (útvonal és query nélkül), vagy null. */
function biztonsagosOrigin(jelolt: string | null | undefined): string | null {
  if (!jelolt) return null
  try {
    const url = new URL(jelolt)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * A mobil feltöltő-oldal alap-URL-je.
 *
 * Élesben KIZÁRÓLAG az env (vagy a kartoteka.app fallback) számít — a kérés
 * Host fejlécét szándékosan NEM használjuk (host-header-poisoning: a QR-kód
 * idegen címre vinné a telefont a saját, érvényes tokennel). Fejlesztésben a
 * host-fejléc a fallback, hogy a telefon a LAN-on elérje a dev-szervert.
 */
async function feltoltoAlapUrl(): Promise<string | null> {
  const envUrl = biztonsagosOrigin(process.env.NEXT_PUBLIC_APP_URL?.trim())
  if (envUrl) return envUrl
  if (process.env.NODE_ENV === 'production') return 'https://kartoteka.app'

  const fejlecek = await headers()
  const forwardedHost = fejlecek.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || fejlecek.get('host')?.trim()
  if (!host || /[\s/\\]/.test(host)) return null
  const proto = fejlecek.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const sema = proto === 'https' ? 'https' : 'http'
  return biztonsagosOrigin(`${sema}://${host}`)
}

/**
 * DB-hiba magyarul, hangosan. 42P01/42703/PGRST202/PGRST205 = a tábla/RPC
 * hiányzik → az F8d-migráció még nincs lefuttatva (cselekvésre felszólító üzenet).
 */
function friendlyQrError(
  prefix: string,
  error: { code?: string; message: string } | null | undefined,
): string {
  if (!error) return `${prefix}: ismeretlen hiba.`
  const hianyzoMigracio =
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205'
  if (hianyzoMigracio) {
    return `${prefix}: a telefonos (QR-kódos) feltöltéshez szükséges adatbázis-migráció még nincs lefuttatva (migration-docs/sql/2026-07-25-f8d-qr-feltoltes.sql). Részlet: ${error.message}`
  }
  return `${prefix}: ${error.message}`
}
