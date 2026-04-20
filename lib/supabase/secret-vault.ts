/**
 * Supabase secret vault — pgcrypto-alapú titkosítás.
 *
 * Az Oblio API secret-et (és más érzékeny adatokat) **soha nem tároljuk
 * plain text-ben** a DB-ben. Ez a modul biztosítja a titkosítást és
 * visszafejtést.
 *
 * A titkosítási kulcs (`VAULT_KEY`) a szerver-oldali env-ből jön
 * (`VAULT_ENCRYPTION_KEY`). Soha nem kerül a kliens-kódba.
 *
 * **SECURITY DEFINER függvények nem szükségesek**: a server action-ök
 * közvetlenül hívják ezeket a helper-eket, amelyek SQL-ben futtatják
 * a pgcrypto-t.
 *
 * A pgcrypto extension-t a `2026-04-16-wc2-oblio-integracio.sql`
 * migráció engedélyezte: `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || process.env.GOD_MODE_PIN || ''

if (!VAULT_KEY) {
  console.warn(
    '[secret-vault] VAULT_ENCRYPTION_KEY env nem beállított. ' +
    'A titkosítás nem biztonságos — a GOD_MODE_PIN-t használom fallbackként. ' +
    'Éles rendszerben állítsd be a VAULT_ENCRYPTION_KEY-t.',
  )
}

/**
 * Szöveges adat titkosítása pgcrypto pgp_sym_encrypt-el.
 * Az eredmény egy pgcrypto-kompatibilis bytea → text (armor-olt PGP blokk).
 *
 * @returns A titkosított string (PGP armor formátum).
 */
export async function encryptSecret(
  supabase: SupabaseClient,
  plaintext: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('vault_encrypt', {
    plaintext_input: plaintext,
    key_input: VAULT_KEY,
  })

  if (error) {
    throw new Error(`Titkosítás sikertelen: ${error.message}`)
  }

  return data as string
}

/**
 * Titkosított adat visszafejtése pgcrypto pgp_sym_decrypt-el.
 *
 * @returns A visszafejtett plain text.
 * @throws Ha a visszafejtés sikertelen (rossz kulcs, sérült adat).
 */
export async function decryptSecret(
  supabase: SupabaseClient,
  encryptedText: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('vault_decrypt', {
    encrypted_input: encryptedText,
    key_input: VAULT_KEY,
  })

  if (error) {
    throw new Error(`Visszafejtés sikertelen: ${error.message}`)
  }

  return data as string
}
