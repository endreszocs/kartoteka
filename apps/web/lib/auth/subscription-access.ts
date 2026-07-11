import { createAdminClient } from '@/lib/supabase/admin'
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  type CongregationAccessResult,
  type GateableUserContext,
  type SubscriptionAccessStatus,
} from '@/lib/auth/subscription-access-types'

/**
 * Előfizetés-alapú funkció-gating MAGJA.
 *
 * Ez egy sima szerver-modul (NEM 'use server' action), mert a DashboardLayout
 * szerver-komponens közvetlenül hívja — nem kliens-action. Így exportálhat
 * függvényt is, típust is; a típusok mégis külön fájlban vannak (bárhonnan
 * biztonságosan importálhatók, szerver-kód berántása nélkül).
 *
 * ── BIZTONSÁGOS DEFAULT ELV ──────────────────────────────────────────────
 * A gating SOHA nem zárhat ki senkit hiba/hiányzó adat esetén. Minden ismeretlen,
 * hiányzó vagy hibás állapot → NEM blokkol. KIZÁRÓLAG az explicit `'suspended'`
 * DB-státusz blokkol. A séma-oszlopok (access_status stb.) még nem léteznek a
 * futó DB-ben (a user futtatja az SQL-t) — ezért minden lekérdezés try/catch-ben
 * fut, és a legrosszabb esetben is engedélyező (`'none'`, `isBlocked=false`)
 * eredményt ad vissza.
 */

/** A legrosszabb eset: engedélyező, nem-blokkoló default. */
const SAFE_DEFAULT: CongregationAccessResult = {
  status: 'none',
  isBlocked: false,
  reason: null,
  trialEndsAt: null,
  subscriptionType: null,
}

function safeDefault(): CongregationAccessResult {
  return { ...SAFE_DEFAULT }
}

/**
 * Egy létező rekord `access_status` értékét normalizálja.
 * Érvényes érték → önmaga. Ismeretlen/hiányzó érték egy LÉTEZŐ rekordon →
 * `'active'` (biztonságos default: soha nem blokkolunk ismeretlen státuszból).
 */
function normalizeStatus(raw: unknown): SubscriptionAccessStatus {
  if (typeof raw === 'string' && (SUBSCRIPTION_ACCESS_STATUSES as readonly string[]).includes(raw)) {
    return raw as SubscriptionAccessStatus
  }
  return 'active'
}

/**
 * A megadott gyülekezet legfrissebb AKTÍV előfizetési sorának hozzáférés-státusza.
 *
 * A `congregation_subscriptions` táblát a SERVICE-ROLE klienssel (createAdminClient)
 * olvassa: a tábla RLS-e admin-only, de a gating-hez a gyülekezeti usernek is
 * ismernie kell a SAJÁT státuszát. (Csak olvasás, egyetlen sor, hot-path index van rá.)
 *
 * @param congregationId A gyülekezet UUID-ja, vagy null (→ biztonságos default).
 * @returns Mindig érvényes {@link CongregationAccessResult}; hibából soha nem blokkol.
 */
export async function getCongregationAccessStatus(
  congregationId: string | null,
): Promise<CongregationAccessResult> {
  // Null / hiányzó gyülekezet → biztonságos default (nem blokkolunk).
  if (!congregationId) return safeDefault()

  try {
    const admin = createAdminClient()
    // Nincs service-role kulcs a környezetben → nem tudunk ellenőrizni → engedünk.
    if (!admin) return safeDefault()

    const { data, error } = await admin
      .from('congregation_subscriptions')
      .select('access_status, trial_ends_at, suspend_reason, tipus')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true)
      // Legfrissebb aktív sor: elsődlegesen a létrehozás, majd id-tiebreaker.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Bármilyen hiba (hiányzó oszlop/tábla a migráció előtt, RLS, hálózat)
    // → biztonságos default. NEM dobunk, NEM blokkolunk.
    if (error) return safeDefault()

    // Nincs aktív előfizetési rekord → 'none' (nem blokkol).
    if (!data) return safeDefault()

    const row = data as {
      access_status?: unknown
      trial_ends_at?: string | null
      suspend_reason?: string | null
      tipus?: string | null
    }

    const status = normalizeStatus(row.access_status)
    const isBlocked = status === 'suspended'

    return {
      status,
      isBlocked,
      reason: isBlocked ? (row.suspend_reason ?? null) : null,
      trialEndsAt: row.trial_ends_at ?? null,
      subscriptionType: row.tipus ?? null,
    }
  } catch {
    // A legrosszabb eset is engedélyező.
    return safeDefault()
  }
}

/**
 * Szinkron helper: egyáltalán kell-e státuszt kérni a felhasználóhoz?
 *
 * Igaz KIZÁRÓLAG akkor, ha a user GYÜLEKEZETI scope-ú — azaz NEM admin, NEM
 * master, NEM egyházkerületi admin, és az aktív scope-ja nem rendszer/kerületi/
 * egyházmegyei. Így az admin/master/kerületi/egyházmegyei felhasználók SOHA
 * nincsenek gating-elve (nem is kérünk hozzájuk státuszt).
 *
 * FONTOS: az `activeScope === null/undefined` eset (elsődleges szerepkörű,
 * profile_roles nélküli gyülekezeti lelkész) IS gyülekezeti → true. Ez nem zár ki
 * senkit: a tényleges blokk csak explicit `'suspended'` státuszra következik be.
 */
export function shouldGateUser(ctx: GateableUserContext): boolean {
  // Admin-jellegű szerepek soha nincsenek gating-elve.
  if (ctx.master || ctx.admin || ctx.egyhazkeruletiAdmin) return false

  // Nem-gyülekezeti (admin-jellegű) scope-ok: rendszer / kerületi / egyházmegyei.
  if (
    ctx.activeScope === 'system' ||
    ctx.activeScope === 'district' ||
    ctx.activeScope === 'diocese'
  ) {
    return false
  }

  // Gyülekezeti scope (vagy elsődleges szerepkör, scope nélkül) → gating-elhető.
  return true
}
