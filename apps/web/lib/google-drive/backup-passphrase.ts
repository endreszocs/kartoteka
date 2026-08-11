import 'server-only'

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ ÁTMENETI IKER — OLVASD EL, MIELŐTT MÓDOSÍTOD                          ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ A mentési jelszó KANONIKUS implementációja a végleges terv szerint        ║
 * ║ `apps/web/lib/backup/passphrase.ts` lesz (párhuzamos ágon készül).        ║
 * ║ Ez a fájl azért létezik, hogy a LETÖLTÉSI KAPU és a jelszó-beállítás      ║
 * ║ NE várjon arra az ágra, és a felület ne kényszerüljön jelszó nélküli      ║
 * ║ (tehát nem létező) védelemre.                                            ║
 * ║                                                                          ║
 * ║ AMINT a `lib/backup/passphrase.ts` megérkezik:                           ║
 * ║   1) hasonlítsd össze a két KDF-paraméter-készletet (N, r, p, só-hossz,   ║
 * ║      HMAC-kulcs) — EL KELL TÉRNIÜK NULLA PONTON,                          ║
 * ║   2) kösd át a hívásokat oda,                                            ║
 * ║   3) TÖRÖLD EZT A FÁJLT.                                                  ║
 * ║ Két, egymásról nem tudó jelszó-ellenőrzés a legrosszabb kimenet: az       ║
 * ║ egyik javítása némán érintetlenül hagyná a másikat.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ─── A SÉMA ────────────────────────────────────────────────────────────────
 *   inner    = scrypt(jelszo, verifier_salt, 32, { N: 2^17, r: 8, p: 1 })
 *   verifier = HMAC-SHA256(BACKUP_ENCRYPTION_KEY, inner)
 *
 * Miért SZERVER-KULCSOS a verifier: egy adatbázis-szivárgás önmagában NE tegye
 * offline törhetővé a jelszót. A támadónak a Railway env-változó IS kellene.
 *
 * Miért `scrypt` és nem Argon2id: `node:crypto`, nulla új függőség, és a
 * Drive-mappába feltöltött önálló visszafejtő szkript ugyanígy Node-ban fut.
 *
 * ⚠️ A NYERS JELSZÓ SOHA nem kerül naplóba, válaszba, e-mailbe — sem az
 *    értéke, sem a HOSSZA. A rendszer nem tudja megmondani, és nem is akarja.
 */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import {
  generateRecoveryKeypair,
  unwrapRecoveryPrivateKey,
  wrapRecoveryPrivateKey,
} from '@/lib/backup/keys'
import type { WrappedRecoveryPrivateKey } from '@/lib/backup/types'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { bufferToPgBytea, loadServerBackupKey, pgByteaToBuffer } from './keys'
import { isMissingTableError } from './settings'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const SCRYPT_N = 2 ** 17
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 256 * 1024 * 1024
const SO_BAJT = 16

/** A mentési jelszó MINIMÁLIS hossza. Négy szó jobb, mint egy betűkeverék. */
export const JELSZO_MIN_HOSSZ = 12

/** Sebességfék: ennyi hibás próbálkozás után 15 percig zárva. */
const FEK_PROBA = 5
const FEK_PERC = 15

async function deriveInner(jelszo: string, salt: Buffer): Promise<Buffer> {
  return scrypt(jelszo.normalize('NFKC'), salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
}

async function deriveVerifier(jelszo: string, salt: Buffer): Promise<Buffer> {
  const inner = await deriveInner(jelszo, salt)
  return createHmac('sha256', loadServerBackupKey()).update(inner).digest()
}

export interface PassphraseResult {
  success: boolean
  error?: string
}

/**
 * A mentési jelszó beállítása vagy cseréje.
 * Ha már van beállított jelszó, a RÉGIT is kérjük — különben egy eltérített
 * munkamenet csendben átvehetné a mentések feletti uralmat.
 */
export async function setBackupPassphrase(args: {
  regiJelszo: string | null
  ujJelszo: string
  actorProfileId: string | null
}): Promise<PassphraseResult> {
  if (args.ujJelszo.trim().length < JELSZO_MIN_HOSSZ) {
    return { success: false, error: `A mentési jelszó legyen legalább ${JELSZO_MIN_HOSSZ} karakter.` }
  }

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('backup_settings')
    .select('passphrase_verifier, verifier_salt, recovery_public_key, recovery_private_wrapped')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return { success: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
    }
    return { success: false, error: error.message }
  }

  const meglevoVerifier = pgByteaToBuffer((data as { passphrase_verifier?: unknown } | null)?.passphrase_verifier)
  const meglevoSo = pgByteaToBuffer((data as { verifier_salt?: unknown } | null)?.verifier_salt)

  if (meglevoVerifier && meglevoSo) {
    if (!args.regiJelszo) {
      return { success: false, error: 'A jelszó cseréjéhez a MOSTANI mentési jelszót is meg kell adni.' }
    }
    const probaVerifier = await deriveVerifier(args.regiJelszo, meglevoSo)
    if (
      probaVerifier.length !== meglevoVerifier.length ||
      !timingSafeEqual(probaVerifier, meglevoVerifier)
    ) {
      return { success: false, error: 'A megadott mostani mentési jelszó nem helyes.' }
    }
  }

  // ── HELYREÁLLÍTÓ KULCSPÁR (kulcs-letét) ───────────────────────────────────
  //
  // ⚠️ JELSZÓCSERÉNÉL A KULCSPÁR NEM CSERÉLŐDIK, csak ÚJRABURKOLJUK az új
  //    jelszóval. Új kulcspár esetén minden KORÁBBI mentés a régi nyilvános
  //    kulcshoz lenne pecsételve — vagyis az új jelszó azokat NEM nyitná ki,
  //    és a tulajdonos ezt csak egy visszaállításnál venné észre.
  const regiBurkolt = (data as { recovery_private_wrapped?: unknown } | null)
    ?.recovery_private_wrapped as WrappedRecoveryPrivateKey | null | undefined

  let kulcspar
  if (regiBurkolt && args.regiJelszo) {
    try {
      kulcspar = unwrapRecoveryPrivateKey(regiBurkolt, args.regiJelszo)
    } catch {
      // A régi jelszó fentebb ÁTMENT az ellenőrzésen, tehát ez csak sérült
      // blob lehet. Új kulcspárt csinálunk, de HANGOSAN: a régi fájlok
      // jelszavas nyithatósága elveszik, ezért ezt ki KELL mondani.
      kulcspar = generateRecoveryKeypair()
      // (a figyelmeztetés a visszatérési értékben megy vissza, lásd lentebb)
    }
  } else {
    kulcspar = generateRecoveryKeypair()
  }

  const ujBurkolt = wrapRecoveryPrivateKey(kulcspar, args.ujJelszo)

  const ujSo = randomBytes(SO_BAJT)
  const ujVerifier = await deriveVerifier(args.ujJelszo, ujSo)

  const { error: updateError } = await supabase
    .from('backup_settings')
    .update({
      passphrase_verifier: bufferToPgBytea(ujVerifier),
      verifier_salt: bufferToPgBytea(ujSo),
      passphrase_set_at: new Date().toISOString(),
      passphrase_set_by: args.actorProfileId,
      recovery_public_key: bufferToPgBytea(kulcspar.publicRaw),
      recovery_private_wrapped: ujBurkolt,
      recovery_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (updateError) {
    if (isMissingTableError(updateError)) {
      return {
        success: false,
        error:
          'A mentés-rendszer SQL-migrációja hiányos: nincsenek helyreállító-kulcs oszlopok ' +
          '(recovery_public_key / recovery_private_wrapped). Futtasd le újra a ' +
          'migration-docs/sql/2026-08-11-biztonsagi-mentes.sql fájlt.',
      }
    }
    return { success: false, error: updateError.message }
  }
  return { success: true }
}

/**
 * A HELYREÁLLÍTÓ NYILVÁNOS KULCS + a jelszóval burkolt titkos fele.
 *
 * A mentés-motor ezt kéri le minden futásnál: a nyilvános kulccsal PECSÉTELI
 * a DEK-et, a burkolt titkos kulcsot pedig VÁLTOZATLANUL bemásolja a fájl
 * fejlécébe. A jelszót közben soha nem ismeri meg.
 */
export async function loadRecoveryKeyMaterial(): Promise<{
  publicRaw: Buffer | null
  wrappedPrivate: WrappedRecoveryPrivateKey | null
  error?: string
}> {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('backup_settings')
      .select('recovery_public_key, recovery_private_wrapped')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      // Hiányzó oszlop = a migráció régebbi. Nem végzetes: a mentés elkészül,
      // csak szerver-kulcsos marad — és a motor ezt FIGYELMEZTETÉSKÉNT írja ki.
      return { publicRaw: null, wrappedPrivate: null, error: error.message }
    }
    const pub = pgByteaToBuffer((data as { recovery_public_key?: unknown } | null)?.recovery_public_key)
    const wrapped = (data as { recovery_private_wrapped?: unknown } | null)
      ?.recovery_private_wrapped as WrappedRecoveryPrivateKey | null | undefined
    return { publicRaw: pub, wrappedPrivate: wrapped ?? null }
  } catch (e: unknown) {
    return {
      publicRaw: null,
      wrappedPrivate: null,
      error: e instanceof Error ? e.message : 'ismeretlen hiba',
    }
  }
}

/**
 * ⚠️ FIGYELMEZTETÉS A FELÜLETNEK (szó szerint kiírandó):
 * a jelszó cseréje NEM fejti újra a régi mentéseket. A cserét MEGELŐZŐ
 * fájlokat továbbra is CSAK a RÉGI jelszó nyitja. Ezt a felület kimondja.
 */
export const JELSZO_CSERE_FIGYELMEZTETES =
  'A jelszó cseréje a KORÁBBI mentéseket NEM írja át: azokat továbbra is csak a régi ' +
  'jelszó nyitja. A régi jelszót ezért ne dobd el, amíg a régi mentések meg vannak.'

export interface VerifyResult {
  ok: boolean
  /** true = a sebességfék zárt (túl sok hibás próbálkozás). */
  fek?: boolean
  error?: string
}

/**
 * Jelszó-ellenőrzés sebességfékkel. A hibás próbálkozás a
 * `backup_restore_log`-ba kerül (`tipus = 'passphrase_fail'`) — az a tábla
 * CSAK HOZZÁFŰZHETŐ, tehát a próbálkozó nem tudja eltüntetni a nyomát.
 */
export async function verifyBackupPassphrase(args: {
  jelszo: string
  actorProfileId: string | null
  actorEmail: string | null
  actorIpHash: string | null
}): Promise<VerifyResult> {
  const supabase = getSupabaseAdminClient()

  // ── Sebességfék ──
  const ota = new Date(Date.now() - FEK_PERC * 60_000).toISOString()
  const { data: hibak, error: fekHiba } = await supabase
    .from('backup_restore_log')
    .select('id')
    .eq('tipus', 'passphrase_fail')
    .gte('started_at', ota)
    .eq('actor_profile_id', args.actorProfileId ?? '00000000-0000-0000-0000-000000000000')
    .limit(FEK_PROBA + 1)

  if (fekHiba && isMissingTableError(fekHiba)) {
    return { ok: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
  }
  if (!fekHiba && (hibak ?? []).length >= FEK_PROBA) {
    return {
      ok: false,
      fek: true,
      error: `Túl sok hibás próbálkozás. Várj ${FEK_PERC} percet, mielőtt újra próbálod.`,
    }
  }

  const { data, error } = await supabase
    .from('backup_settings')
    .select('passphrase_verifier, verifier_salt')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'A mentés-rendszer SQL-migrációja még nem futott le.' }
    }
    return { ok: false, error: error.message }
  }

  const verifier = pgByteaToBuffer((data as { passphrase_verifier?: unknown } | null)?.passphrase_verifier)
  const so = pgByteaToBuffer((data as { verifier_salt?: unknown } | null)?.verifier_salt)
  if (!verifier || !so) {
    // Fail-closed: beállított jelszó nélkül NINCS letöltés és NINCS visszaállítás.
    return {
      ok: false,
      error:
        'Nincs beállított mentési jelszó. Előbb állítsd be (Admin → Biztonsági mentés → Mentési jelszó).',
    }
  }

  const proba = await deriveVerifier(args.jelszo, so)
  const egyezik = proba.length === verifier.length && timingSafeEqual(proba, verifier)

  if (!egyezik) {
    await supabase
      .from('backup_restore_log')
      .insert({
        tipus: 'passphrase_fail',
        actor_profile_id: args.actorProfileId,
        actor_email: args.actorEmail,
        actor_ip_hash: args.actorIpHash,
        outcome: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'Hibás mentési jelszó.',
      })
      .then(
        () => undefined,
        () => undefined,
      )
    return { ok: false, error: 'A megadott mentési jelszó nem helyes.' }
  }

  return { ok: true }
}
