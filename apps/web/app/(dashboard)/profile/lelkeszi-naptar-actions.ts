'use server'

/**
 * Lelkészi (privát) naptár-feed — szerver-akciók (2026-08-11).
 *
 * A Profil oldalról hívjuk: hivatkozás lekérése, ÚJ hivatkozás készítése
 * (a régi ettől azonnal érvénytelen), és visszavonás.
 *
 * FAIL-CLOSED
 * ───────────
 *  · Bejelentkezés nélkül semmi.
 *  · Aktív gyülekezet nélkül NEM adunk ki hivatkozást: a feed a token
 *    tulajdonosának gyülekezetéből dolgozik, és egy hatókör nélküli linket
 *    kiadni annyi lenne, mint egy soha nem működő URL-t a Google Naptárba
 *    illesztetni — a lelkész üres naptárat látna, hibaüzenet nélkül.
 *  · A sor `user_id`-ja MINDIG a bejelentkezett felhasználó (az RLS is ezt
 *    követeli) — a hatókört sehol nem a kliens mondja meg.
 *
 * DEPLOY-SORREND-FÜGGETLENSÉG
 * ───────────────────────────
 * Amíg a 2026-08-11-es SQL nem futott le, a `lelkeszi_naptar_token` tábla nem
 * létezik. Ezt felismerjük, és `needsMigration: true`-val térünk vissza —
 * a felület barátságos magyar teendőt mutat, nem PostgREST-hibakódot.
 */

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type {
  PastoralCalendarActionResult,
  PastoralCalendarState,
} from './lelkeszi-naptar-shared'

const MIGRATION_HINT =
  'A lelkészi naptár még nincs bekapcsolva az adatbázisban. Futtasd le a ' +
  'migration-docs/sql/2026-08-11-lelkeszi-naptar-token.sql fájlt a Supabase SQL Editorban, ' +
  'utána frissítsd ezt az oldalt.'

const NO_SCOPE_HINT =
  'Nincs aktív gyülekezeted, ezért a lelkészi naptár most nem hozható létre. ' +
  'Válts gyülekezeti profilra, vagy kérd a rendszergazdát, hogy rendeljen hozzá egy gyülekezetet.'

interface TokenRow {
  token: string | null
  created_at: string | null
  last_used_at: string | null
}

/** A PostgREST „nincs ilyen tábla" hibája = az SQL még nincs lefuttatva. */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const m = (error.message || '').toLowerCase()
  return m.includes('lelkeszi_naptar_token') && (m.includes('does not exist') || m.includes('could not find'))
}

function emptyState(overrides: Partial<PastoralCalendarState> = {}): PastoralCalendarState {
  return {
    token: null,
    createdAt: null,
    lastUsedAt: null,
    needsMigration: false,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Állapot lekérése
// ─────────────────────────────────────────────────────────────────────────

export async function getPastoralCalendarState(): Promise<PastoralCalendarState> {
  const { supabase, userId, congregationId } = await getEffectiveCongregationContext()
  if (!userId) return emptyState({ error: 'Nincs bejelentkezve.' })

  const { data, error } = await supabase
    .from('lelkeszi_naptar_token')
    .select('token, created_at, last_used_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return emptyState({ needsMigration: true, error: MIGRATION_HINT })
    console.error('[profile/lelkeszi-naptar] token olvasása hiba:', error.message)
    return emptyState({ error: 'A lelkészi naptár állapotát nem sikerült betölteni — frissítsd az oldalt.' })
  }

  const row = data as TokenRow | null
  return emptyState({
    token: row?.token ?? null,
    createdAt: row?.created_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    error: congregationId ? undefined : NO_SCOPE_HINT,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Új hivatkozás (a régi ettől AZONNAL érvénytelen)
// ─────────────────────────────────────────────────────────────────────────

export async function generatePastoralCalendarToken(): Promise<PastoralCalendarActionResult> {
  const { supabase, userId, congregationId } = await getEffectiveCongregationContext()
  if (!userId) return { ok: false, error: 'Nincs bejelentkezve.' }
  if (!congregationId) return { ok: false, error: NO_SCOPE_HINT }

  // A tokent a szerveren generáljuk (Node CSPRNG). Nem származtatjuk semmiből:
  // sem a felhasználó azonosítójából, sem a gyülekezet nyilvános
  // calendar_feed_token értékéből — így a nyilvános link birtokában sem
  // találgatható ki a privát.
  const token = randomUUID()

  const { data, error } = await supabase
    .from('lelkeszi_naptar_token')
    .upsert(
      {
        user_id: userId,
        token,
        created_at: new Date().toISOString(),
        // Új hivatkozás → a régi lehúzás-időbélyeg félrevezető lenne.
        last_used_at: null,
      },
      { onConflict: 'user_id' },
    )
    .select('token, created_at, last_used_at')
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: MIGRATION_HINT }
    console.error('[profile/lelkeszi-naptar] token létrehozása hiba:', error.message)
    return { ok: false, error: 'A hivatkozás létrehozása nem sikerült — próbáld újra.' }
  }
  // A PostgREST a 0 sort érintő írásra is hibátlan választ ad (pl. RLS-megtagadás),
  // ezért a néma sikert itt kizárjuk.
  if (!data) {
    return {
      ok: false,
      error: 'A hivatkozás létrehozása nem sikerült (nincs jogosultság). Jelezd a rendszergazdának.',
    }
  }

  revalidatePath('/profile')
  const row = data as TokenRow
  return {
    ok: true,
    state: emptyState({
      token: row.token ?? null,
      createdAt: row.created_at ?? null,
      lastUsedAt: row.last_used_at ?? null,
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Visszavonás — a sor törlésével a feed AZONNAL 404-et ad
// ─────────────────────────────────────────────────────────────────────────

export async function revokePastoralCalendarToken(): Promise<PastoralCalendarActionResult> {
  const { supabase, userId } = await getEffectiveCongregationContext()
  if (!userId) return { ok: false, error: 'Nincs bejelentkezve.' }

  const { error } = await supabase
    .from('lelkeszi_naptar_token')
    .delete()
    .eq('user_id', userId)

  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: MIGRATION_HINT }
    console.error('[profile/lelkeszi-naptar] token visszavonása hiba:', error.message)
    return { ok: false, error: 'A visszavonás nem sikerült — próbáld újra.' }
  }

  revalidatePath('/profile')
  return { ok: true, state: emptyState() }
}
