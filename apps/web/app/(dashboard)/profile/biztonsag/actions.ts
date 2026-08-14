'use server'

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { logAuditEvent } from '@/lib/audit/log'

/**
 * Kétlépcsős belépés (2FA) — mentőkód szerver-akciók (2026-08-15, 8. pont).
 *
 * ENDRE DÖNTÉSE: opt-in — aki bekapcsolja, annak kötelező; akinek nincs
 * faktora, annál semmi nem változik.
 *
 * MENTŐKÓD-MODELL (a Supabase natív TOTP nem ad mentőkódot):
 *  - bekapcsoláskor 8 egyszer használható kód készül; CSAK scrypt-hash
 *    tárolódik (mfa_mentokodok tábla), a nyers kód egyetlen egyszer látszik;
 *  - mentőkódos belépésnél a kód elhasználódik, a TOTP-faktor LEKERÜL a
 *    fiókról (admin API) és minden lépés naplózott — a lelkész bejut, a
 *    2FA-t újra be kell kapcsolnia. Ez a bevett minta: a mentőkód nem a
 *    2FA megkerülése, hanem vészkijárat, ami után tiszta lappal indul.
 */

const MENTOKOD_DB = 8
// Könnyen gépelhető, összetéveszthető karakterek nélkül (nincs 0/O, 1/I/L).
const MENTOKOD_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function ujMentokod(): string {
  const bytes = randomBytes(8)
  let kod = ''
  for (let i = 0; i < 8; i++) {
    kod += MENTOKOD_ABC[bytes[i]! % MENTOKOD_ABC.length]
    if (i === 3) kod += '-'
  }
  return kod
}

function hashMentokod(kod: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(kod.toUpperCase().replace(/[^A-Z0-9]/g, ''), salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function mentokodEgyezik(kod: string, tarolt: string): boolean {
  const [sema, saltHex, hashHex] = tarolt.split('$')
  if (sema !== 'scrypt' || !saltHex || !hashHex) return false
  const proba = scryptSync(
    kod.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    Buffer.from(saltHex, 'hex'),
    32,
  )
  const tenyleges = Buffer.from(hashHex, 'hex')
  return proba.length === tenyleges.length && timingSafeEqual(proba, tenyleges)
}

/**
 * 8 új mentőkód generálása — a 2FA bekapcsolásának KÖTELEZŐ záró lépése
 * (a kártya a sikeres TOTP-ellenőrzés után azonnal hívja). A korábbi kódok
 * érvénytelenednek. A nyers kódok CSAK ebben a válaszban léteznek.
 */
export async function generateMentokodok(): Promise<{ kodok?: string[]; error?: string }> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Csak ellenőrzött TOTP-faktor mellett van értelme mentőkódnak.
  const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
  if (fErr) return { error: `A faktorok lekérdezése nem sikerült: ${fErr.message}` }
  const vanTotp = (factors?.totp || []).some((f) => f.status === 'verified')
  if (!vanTotp) return { error: 'Előbb a kétlépcsős belépést kell bekapcsolni.' }

  const kodok = Array.from({ length: MENTOKOD_DB }, () => ujMentokod())
  const sorok = kodok.map((k) => ({ user_id: user.id, kod_hash: hashMentokod(k) }))

  const admin = getSupabaseAdminClient()
  const { error: delErr } = await admin.from('mfa_mentokodok').delete().eq('user_id', user.id)
  if (delErr) return { error: `A korábbi kódok érvénytelenítése nem sikerült: ${delErr.message}` }
  const { error: insErr } = await admin.from('mfa_mentokodok').insert(sorok)
  if (insErr) {
    // 42P01 = a migráció még nem futott le — érthető üzenet, ne kriptikus kód.
    if (insErr.code === '42P01') {
      return { error: 'A mentőkód-tábla még nincs az adatbázisban (2026-08-15-mfa-mentokodok.sql futtatása szükséges).' }
    }
    return { error: `A mentőkódok mentése nem sikerült: ${insErr.message}` }
  }

  await logAuditEvent(
    { action: 'mfa.mentokodok_generalva', targetTable: 'mfa_mentokodok', metadata: { darab: MENTOKOD_DB } },
    supabase,
  )
  return { kodok }
}

/** A mentőkód-készlet állapota a Biztonság-kártyához (darabszámok, hash nélkül). */
export async function getMentokodStatus(): Promise<{
  szabad: number
  elhasznalt: number
  error?: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('mfa_mentokodok').select('id, used_at')
  if (error) {
    // A tábla hiánya (migráció előtt) nem hiba a kártyán — 0/0.
    if (error.code === '42P01') return { szabad: 0, elhasznalt: 0 }
    return { szabad: 0, elhasznalt: 0, error: error.message }
  }
  const sorok = data || []
  return {
    szabad: sorok.filter((s) => !s.used_at).length,
    elhasznalt: sorok.filter((s) => s.used_at).length,
  }
}

/**
 * Mentőkódos belépés (a /login/ellenorzes oldalról, aal1-es sessionnel):
 * érvényes kód → a kód elhasználódik, MINDEN TOTP-faktor lekerül a fiókról
 * (admin API), a belépés folytatódhat. Hangosan naplózott vészkijárat.
 */
export async function mentokodBelepes(kod: string): Promise<{ success?: boolean; error?: string }> {
  const tisztitott = (kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (tisztitott.length < 8) return { error: 'A mentőkód 8 karakteres (a kötőjel nem számít).' }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const admin = getSupabaseAdminClient()
  const { data: sorok, error } = await admin
    .from('mfa_mentokodok')
    .select('id, kod_hash')
    .eq('user_id', user.id)
    .is('used_at', null)
  if (error) return { error: `A mentőkódok ellenőrzése nem sikerült: ${error.message}` }

  // MINDEN szabad kódot végigpróbálunk (timing-safe összevetéssel) — korai
  // kilépés nélkül, hogy a próbálkozás-idő ne szivárogtasson találat-helyet.
  let talalt: string | null = null
  for (const sor of sorok || []) {
    if (mentokodEgyezik(tisztitott, sor.kod_hash) && talalt === null) talalt = sor.id
  }
  if (!talalt) {
    await logAuditEvent(
      { action: 'mfa.mentokod_hibas', targetTable: 'mfa_mentokodok', metadata: {} },
      supabase,
    )
    return { error: 'A mentőkód nem érvényes (vagy már fel lett használva).' }
  }

  const { error: useErr } = await admin
    .from('mfa_mentokodok')
    .update({ used_at: new Date().toISOString() })
    .eq('id', talalt)
    .is('used_at', null)
  if (useErr) return { error: `A mentőkód elhasználása nem sikerült: ${useErr.message}` }

  // A TOTP-faktorok levétele — e nélkül az aal-őr nem engedné tovább.
  const { data: faktorok, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  if (listErr) return { error: `A faktorok lekérdezése nem sikerült: ${listErr.message}` }
  for (const f of faktorok?.factors || []) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id })
    if (delErr) return { error: `A kétlépcsős faktor levétele nem sikerült: ${delErr.message}` }
  }

  await logAuditEvent(
    {
      action: 'mfa.mentokod_belepes',
      targetTable: 'mfa_mentokodok',
      metadata: { megjegyzes: 'Mentőkódos belépés — a TOTP-faktor levéve, a 2FA-t újra be kell kapcsolni.' },
    },
    supabase,
  )
  return { success: true }
}

/** Naplózás a kártya kliens-oldali be-/kikapcsolása után (a hitelesítés a Supabase-é). */
export async function logMfaEsemeny(esemeny: 'bekapcsolva' | 'kikapcsolva'): Promise<void> {
  const supabase = await createClient()
  await logAuditEvent(
    { action: `mfa.${esemeny}`, targetTable: 'auth.mfa_factors', metadata: {} },
    supabase,
  )
}
