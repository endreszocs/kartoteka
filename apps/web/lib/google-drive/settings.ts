import 'server-only'

/**
 * A `backup_settings` EGYETLEN sorának olvasása/írása (2026-08-11).
 *
 * A táblán RLS van BEKAPCSOLVA és SZÁNDÉKOSAN NINCS EGYETLEN POLICY SEM:
 * még hitelesített rendszergazda sem SELECT-elheti közvetlenül. Az egyetlen út
 * a service_role kliens — vagyis EZ A FÁJL. Ezért itt minden függvény
 * feltételezi, hogy a hívó MÁR átment a `requireAdminAccess` kapun.
 *
 * ⚠️ A visszaadott objektum SOHA nem tartalmazza a refresh tokent, sem a
 * jelszó-ellenőrzőt. Aki a tokent akarja, a `getDriveAccessToken()`-t hívja,
 * ami már csak a rövid életű access tokent adja tovább — azt sem naplózzuk.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import {
  DRIVE_TOKEN_AAD,
  DRIVE_TOKEN_INFO,
  bufferToPgBytea,
  decryptSecret,
  encryptSecret,
  pgByteaToBuffer,
} from './keys'
import { RETENTION_DEFAULT, type DriveConnectionStatus, type RetentionConfig } from './types'

/**
 * A PostgREST hibája, ha a tábla/oszlop még nem létezik (a migráció nem futott).
 * A projektben bevett `needsSql` graceful-degradation mintája.
 */
export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') return true
  const m = (error.message || '').toLowerCase()
  return (
    (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) &&
    (m.includes('backup_') || m.includes('relation'))
  )
}

/** A `backup_settings` biztonságos (titok nélküli) vetülete. */
export interface BackupSettingsView {
  enabled: boolean
  jelszoBeallitva: boolean
  jelszoBeallitvaAt: string | null
  drive: DriveConnectionStatus
  retention: RetentionConfig
  maxFileMb: number
  alertEmail: string | null
  lastOkAt: string | null
}

interface RawSettingsRow {
  id: number
  enabled: boolean | null
  passphrase_verifier: string | null
  verifier_salt: string | null
  passphrase_set_at: string | null
  drive_folder_id: string | null
  drive_account_email: string | null
  drive_connected_at: string | null
  drive_refresh_token_enc: string | null
  drive_token_status: string | null
  drive_token_hiba: string | null
  retention: unknown
  max_file_mb: number | null
  alert_email: string | null
  last_ok_at: string | null
}

const SAFE_COLUMNS =
  'id, enabled, passphrase_set_at, drive_folder_id, drive_account_email, drive_connected_at, ' +
  'drive_token_status, drive_token_hiba, retention, max_file_mb, alert_email, last_ok_at'

/**
 * A `passphrase_verifier` / `drive_refresh_token_enc` MEZŐK NÉLKÜLI olvasás.
 * Ez a felület felé menő út — a titkok soha nem hagyják el az adatbázist.
 */
export async function loadBackupSettingsView(
  client?: SupabaseClient,
): Promise<{ view: BackupSettingsView | null; needsSql: boolean; error?: string }> {
  const supabase = client ?? getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('backup_settings')
    .select(`${SAFE_COLUMNS}, passphrase_verifier, drive_refresh_token_enc`)
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return { view: null, needsSql: true }
    // Csak az üzenet — a nyers hibaobjektum a LEKÉRDEZÉST is kiírná.
    return { view: null, needsSql: false, error: error.message }
  }
  if (!data) return { view: null, needsSql: false }

  const row = data as unknown as RawSettingsRow
  const vanToken = typeof row.drive_refresh_token_enc === 'string' && row.drive_refresh_token_enc.length > 2

  return {
    view: {
      enabled: row.enabled !== false,
      jelszoBeallitva: typeof row.passphrase_verifier === 'string' && row.passphrase_verifier.length > 2,
      jelszoBeallitvaAt: row.passphrase_set_at,
      drive: {
        osszekotve: vanToken && !!row.drive_folder_id,
        fiokEmail: row.drive_account_email,
        mappaId: row.drive_folder_id,
        osszekotveAt: row.drive_connected_at,
        tokenAllapot: normalizeTokenStatus(row.drive_token_status),
        tokenHiba: row.drive_token_hiba,
      },
      retention: normalizeRetention(row.retention),
      maxFileMb: typeof row.max_file_mb === 'number' && row.max_file_mb > 0 ? row.max_file_mb : 50,
      alertEmail: row.alert_email,
      lastOkAt: row.last_ok_at,
    },
    needsSql: false,
  }
}

function normalizeTokenStatus(value: unknown): DriveConnectionStatus['tokenAllapot'] {
  return value === 'ok' || value === 'hiba' ? value : 'nincs'
}

export function normalizeRetention(value: unknown): RetentionConfig {
  const src = (value ?? {}) as Record<string, unknown>
  const pick = (k: keyof RetentionConfig): number => {
    const n = Number(src[k])
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : RETENTION_DEFAULT[k]
  }
  return { napi: pick('napi'), heti: pick('heti'), havi: pick('havi') }
}

/**
 * A titkosított refresh token kiolvasása és visszafejtése.
 * ⚠️ Kizárólag a `drive-client.ts` hívja. A visszaadott érték TITOK.
 */
export async function loadDriveRefreshToken(
  client?: SupabaseClient,
): Promise<{ token: string | null; folderId: string | null; needsSql: boolean; error?: string }> {
  const supabase = client ?? getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('backup_settings')
    .select('drive_refresh_token_enc, drive_folder_id')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return { token: null, folderId: null, needsSql: true }
    return { token: null, folderId: null, needsSql: false, error: error.message }
  }

  const enc = pgByteaToBuffer((data as { drive_refresh_token_enc?: unknown } | null)?.drive_refresh_token_enc)
  const folderId = (data as { drive_folder_id?: string | null } | null)?.drive_folder_id ?? null
  if (!enc) return { token: null, folderId, needsSql: false }

  try {
    return { token: decryptSecret(enc, DRIVE_TOKEN_INFO, DRIVE_TOKEN_AAD), folderId, needsSql: false }
  } catch {
    // Tipikus ok: a BACKUP_ENCRYPTION_KEY-t lecserélték. Ez HANGOS hiba —
    // a felület azt fogja mondani, hogy a Drive-ot újra össze kell kötni.
    return {
      token: null,
      folderId,
      needsSql: false,
      error:
        'A tárolt Google-hozzáférés nem fejthető vissza (a titkosítási kulcs megváltozott). ' +
        'Kösd össze újra a Google Drive-ot.',
    }
  }
}

/** A Drive-kapcsolat mentése az OAuth-visszatérés után. */
export async function saveDriveConnection(args: {
  refreshToken: string
  folderId: string
  accountEmail: string | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient()
  let enc: string
  try {
    enc = bufferToPgBytea(encryptSecret(args.refreshToken, DRIVE_TOKEN_INFO, DRIVE_TOKEN_AAD))
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'A kulcs nem tölthető be.' }
  }

  const { error } = await supabase
    .from('backup_settings')
    .update({
      drive_refresh_token_enc: enc,
      drive_folder_id: args.folderId,
      drive_account_email: args.accountEmail,
      drive_connected_at: new Date().toISOString(),
      drive_token_status: 'ok',
      drive_token_hiba: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) {
    return { success: false, error: isMissingTableError(error) ? 'A mentés-rendszer SQL-migrációja még nem futott le.' : error.message }
  }
  return { success: true }
}

/** A Drive-kapcsolat bontása — a token TÖRLŐDIK, nem csak „inaktív" lesz. */
export async function clearDriveConnection(): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('backup_settings')
    .update({
      drive_refresh_token_enc: null,
      drive_folder_id: null,
      drive_account_email: null,
      drive_connected_at: null,
      drive_token_status: 'nincs',
      drive_token_hiba: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * A token-állapot frissítése. A hibaszöveg EMBERI és RÖVID — soha nem a
 * Google nyers válasza (az tokent/secretet is visszhangozhat).
 */
export async function setDriveTokenStatus(
  status: 'ok' | 'hiba',
  hiba?: string | null,
): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient()
    await supabase
      .from('backup_settings')
      .update({
        drive_token_status: status,
        drive_token_hiba: status === 'ok' ? null : (hiba ?? 'Ismeretlen Google-hiba.').slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
  } catch {
    // Az állapot-írás hibája nem boríthatja a hívó műveletet.
  }
}

/**
 * A célmappa azonosítójának rögzítése.
 *
 * ⚠️ MIÉRT KELL: ha a mappát a Drive felületén törlik, az `ensureBackupFolder`
 * újat hoz létre. Ha ezt NEM írjuk vissza, minden futás ÚJ mappát csinálna
 * (mappa-szaporodás), és a napló ⇄ Drive egyeztetés minden korábbi fájlt
 * „hiányzó"-nak látna — pontosan az a néma sodródás, amit el akarunk kerülni.
 */
export async function saveDriveFolderId(folderId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient()
    await supabase
      .from('backup_settings')
      .update({ drive_folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('id', 1)
  } catch {
    // A rögzítés hibája nem boríthatja a futó mentést — a következő futás
    // úgyis újrapróbálja.
  }
}

/** Megőrzési szabály mentése. */
export async function saveRetention(
  retention: RetentionConfig,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('backup_settings')
    .update({ retention, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * A HIBAJELZŐ LEVELEK CÍMZETTJE — egyetlen igazság-forrás.
 *
 * ⚠️ 2026-08-11 JAVÍTÁS. A `setAlertEmailAction` beírta a
 *    `backup_settings.alert_email` mezőt, és azt válaszolta a tulajdonosnak,
 *    hogy „A hibajelző levelek ide mennek: …" — közben EGYETLEN küldő sem
 *    olvasta ezt az oszlopot: mindkettő csak a `BACKUP_ALERT_EMAIL` /
 *    `MASTER_ADMIN_EMAIL` env-változóból dolgozott. A tulajdonos beállíthatott
 *    egy címet, sikert kapott rá, és soha nem érkezett oda semmi.
 *
 * A SORREND: a felületen beállított cím NYER, mert azt a tulajdonos LÁTJA és
 * tudja módosítani; az env-változó csak tartalék.
 */
export async function loadAlertRecipient(
  client?: SupabaseClient,
): Promise<{ cimzett: string | null; forras: 'beallitas' | 'env' | 'nincs' }> {
  try {
    const supabase = client ?? getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('backup_settings')
      .select('alert_email')
      .eq('id', 1)
      .maybeSingle()
    if (!error) {
      const cim = ((data as { alert_email?: string | null } | null)?.alert_email ?? '').trim()
      if (cim.length > 0) return { cimzett: cim, forras: 'beallitas' }
    }
  } catch {
    // Az olvasás hibája nem némíthatja el a riasztást — megyünk az env-re.
  }
  const env = (
    process.env.BACKUP_ALERT_EMAIL?.trim() ||
    process.env.MASTER_ADMIN_EMAIL?.trim() ||
    ''
  ).trim()
  return env.length > 0 ? { cimzett: env, forras: 'env' } : { cimzett: null, forras: 'nincs' }
}

/** Riasztási e-mail cím mentése. */
export async function saveAlertEmail(email: string | null): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('backup_settings')
    .update({ alert_email: email, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
