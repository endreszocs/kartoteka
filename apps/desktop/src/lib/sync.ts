/**
 * Kartotéka Desktop — Supabase → SQLite szinkronizáció (M2.4).
 *
 * **M2.4 scope**: a bejelentkezett user saját profilját (egyetlen sor)
 * szinkronizáljuk a `profiles` táblából a lokális `profiles_local`-ba.
 *
 * **Nem része az M2.4-nek** (M2.5+ feladat):
 * - Delta-sync (updated_at > last_pull) — a `profiles` táblán még nincs
 *   `updated_at` oszlop, így most minden pull teljes
 * - Több domain tábla (members, finance, anyakonyv) — külön alfázisok
 * - Push-sync (outbox → Supabase) — M2.5
 * - Konfliktus-kezelés (revision) — M2.6
 *
 * Architektúra:
 *   `pullOwnProfile(userId)` — Supabase SELECT → SQLite INSERT OR REPLACE
 *   `getLocalOwnProfile(userId)` — olvasás csak a lokális DB-ből
 *
 * A `getLastPull('profiles')` a settings-táblában tárolt ISO-idő — most
 * csak info-érték (a pull mindig teljes), de a delta-sync elkészülésekor
 * ez lesz az inkrementális szűrés alapja.
 */

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect, getSetting, setSetting } from './local-db'

/** A `profiles` és `profiles_local` közös, szinkronizált oszlopai. */
export interface ProfileLocalRow {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string | null
  status: string | null
  congregation_id: string | null
  diocese_id: string | null
  district_id: string | null
  synced_at: string
}

/** A `pullOwnProfile` visszaadott statisztikája. */
export interface PullResult {
  pulledRows: number
  lastPullIso: string
}

const LAST_PULL_KEY = 'sync:profiles:last_pull'

/**
 * Letölti az aktuális bejelentkezett user profilját a Supabase-ből,
 * és beírja a lokális `profiles_local` táblába.
 *
 * RLS: a Supabase szigorúan szűri a kiválasztást — a user csak a saját
 * profilját láthatja a `SELECT id = auth.uid()` predikátummal. Ezt
 * itt explicit `.eq('id', userId)`-val is biztosítjuk, dupla-védelemként.
 */
export async function pullOwnProfile(userId: string): Promise<PullResult> {
  const supabase = getDesktopSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Supabase pull hiba: ${error.message}`)
  }
  if (!data) {
    // Nincs profil-sor — ez akkor fordulhat elő, ha a user Supabase-auth-ban
    // létezik, de a `profiles` tábla még nem tartalmaz sort hozzá
    // (pl. kezdeti invite után nem futott le a trigger).
    return { pulledRows: 0, lastPullIso: new Date().toISOString() }
  }

  await dbExecute(
    `INSERT INTO profiles_local
       (id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, synced_at)
     VALUES
       (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       phone = excluded.phone,
       role = excluded.role,
       status = excluded.status,
       congregation_id = excluded.congregation_id,
       diocese_id = excluded.diocese_id,
       district_id = excluded.district_id,
       synced_at = excluded.synced_at`,
    [
      data.id,
      data.email,
      data.full_name,
      data.phone,
      data.role,
      data.status,
      data.congregation_id,
      data.diocese_id,
      data.district_id,
    ],
  )

  const now = new Date().toISOString()
  await setSetting(LAST_PULL_KEY, now)
  return { pulledRows: 1, lastPullIso: now }
}

/**
 * Lokális olvasás — a `profiles_local` tábla adott id-jű sorát adja vissza,
 * vagy `null`-t, ha még nem szinkronizáltuk.
 */
export async function getLocalOwnProfile(userId: string): Promise<ProfileLocalRow | null> {
  const rows = await dbSelect<ProfileLocalRow>(
    `SELECT id, email, full_name, phone, role, status,
            congregation_id, diocese_id, district_id, synced_at
       FROM profiles_local WHERE id = ?1`,
    [userId],
  )
  return rows[0] ?? null
}

/** Az utolsó sikeres pull ISO-ideje vagy `null`, ha még sosem. */
export async function getLastPullIso(): Promise<string | null> {
  return getSetting(LAST_PULL_KEY)
}
