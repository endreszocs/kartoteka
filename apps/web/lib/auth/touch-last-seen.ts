import { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Utoljára aktív" heartbeat — a profiles.last_seen_at frissítése.
 *
 * A dashboard layout minden betöltésnél meghívja, DE a frissítés THROTTLE-olt:
 * a WHERE-feltétel csak akkor ír, ha a legutóbbi aktivitás > 1 órája (vagy null).
 * Így a hot-path (minden oldalnavigáció) gyakorlatilag 0 sort ír — a folyamatos
 * aktivitás mégis óránkénti pontossággal követhető az admin felhasználó-listában.
 *
 * Service-role klienssel fut (a profiles RLS megkerülése egyetlen self-update-hez),
 * és FIRE-AND-FORGET-barát: minden hibát elnyel, SOHA nem dob — a heartbeat
 * semmilyen körülmények közt nem törheti el a betöltést.
 */
const THROTTLE_MS = 60 * 60 * 1000 // 1 óra

export async function touchLastSeen(userId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    if (!admin) return
    const nowIso = new Date().toISOString()
    const thresholdIso = new Date(Date.now() - THROTTLE_MS).toISOString()
    await admin
      .from('profiles')
      .update({ last_seen_at: nowIso })
      .eq('id', userId)
      // Csak akkor ír, ha még nincs érték, vagy több mint 1 órája frissült.
      .or(`last_seen_at.is.null,last_seen_at.lt.${thresholdIso}`)
  } catch {
    // A heartbeat SOHA nem befolyásolhatja a betöltést.
  }
}
