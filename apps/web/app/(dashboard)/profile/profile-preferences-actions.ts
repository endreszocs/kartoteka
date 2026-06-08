'use server'

/**
 * Felhasználói UI beállítások (profile_preferences) szerver akciói.
 *
 * ALAPELV (Endre, 2026-04-18):
 *   Ha egy felhasználónak több szerepköre van (pl. gyülekezeti lelkipásztor +
 *   egyházmegyei esperes), akkor bejelentkezéskor alapértelmezetten a
 *   LEGMAGASABB szintű aktív dashboard nyíljon meg. Ezt felülírhatja a
 *   felhasználó a profilbeállításokban.
 *
 * Funkciók:
 *   1. getProfilePreferences() — saját beállítások
 *   2. updateDefaultDashboard(pref) — az alapértelmezett dashboard beállítása
 *   3. resolveDefaultDashboardPath() — melyik útvonalra irányítsuk
 *      bejelentkezés után
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'

export type DefaultDashboard =
  | 'auto'
  | 'gyulekezet'
  | 'egyhazmegye'
  | 'egyhazkerulet'
  | 'admin'

export interface ProfilePreferences {
  user_id: string
  default_dashboard: DefaultDashboard
  last_used_scope: string | null
  last_used_scope_id: string | null
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Olvasás
// ─────────────────────────────────────────────────────────────────────────

export async function getProfilePreferences(): Promise<{
  data?: ProfilePreferences
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const { data, error } = await access.supabase
    .from('profile_preferences')
    .select('*')
    .eq('user_id', access.user.id)
    .maybeSingle()

  if (error) return { error: error.message }

  // Ha nincs, default értékek
  if (!data) {
    return {
      data: {
        user_id: access.user.id,
        default_dashboard: 'auto',
        last_used_scope: null,
        last_used_scope_id: null,
        updated_at: new Date().toISOString(),
      },
    }
  }

  return { data: data as ProfilePreferences }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Alapértelmezett dashboard beállítása
// ─────────────────────────────────────────────────────────────────────────

export async function updateDefaultDashboard(
  pref: DefaultDashboard,
): Promise<{ ok?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const validValues: DefaultDashboard[] = ['auto', 'gyulekezet', 'egyhazmegye', 'egyhazkerulet', 'admin']
  if (!validValues.includes(pref)) {
    return { error: 'Érvénytelen dashboard érték.' }
  }

  // Upsert
  const { error } = await access.supabase
    .from('profile_preferences')
    .upsert({
      user_id: access.user.id,
      default_dashboard: pref,
    }, { onConflict: 'user_id' })

  if (error) return { error: error.message }
  revalidatePath('/profile')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Az aktuálisan használt scope mentése (profilváltás után)
// ─────────────────────────────────────────────────────────────────────────

export async function saveLastUsedScope(
  scope: string,
  scopeId: string | null,
): Promise<{ ok?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const { error } = await access.supabase
    .from('profile_preferences')
    .upsert({
      user_id: access.user.id,
      last_used_scope: scope,
      last_used_scope_id: scopeId,
    }, { onConflict: 'user_id' })

  if (error) return { error: error.message }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 4) Az alapértelmezett dashboard útvonalának feloldása
//    Ez a függvény a bejelentkezés utáni redirect-hez használt.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Visszaadja azt az útvonalat, ahová a felhasználót irányítani kell
 * bejelentkezés után, a saját beállítása és szerepkörei alapján.
 *
 * Logika:
 *   1. Ha a felhasználó explicit beállította (nem 'auto') → oda irányítjuk
 *      (feltéve, hogy van megfelelő szerepköre; ha nincs, fallback)
 *   2. Ha 'auto' (default), akkor a legmagasabb aktív szerepkör szerint:
 *        - admin/master → /dashboard-kerulet
 *        - egyházkerületi admin → /dashboard-kerulet
 *        - esperes / egyházmegyei admin → /dashboard-egyhazmegye
 *        - lelkipásztor / gyülekezeti könyvelő/számvevő → /dashboard
 */
export async function resolveDefaultDashboardPath(): Promise<string> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return '/login'
  if (!access.master && access.profile?.status === 'pending') return '/pending'
  if (!access.master && access.missingPrimaryRole) return '/pending?reason=no-role'

  // Ha a felhasználó profilváltóval explicit scope-ban van, a kezdőoldalnak
  // ugyanazt a munkateret kell követnie. Ez előzi meg, hogy gyülekezeti
  // profilból a / automatikusan kerületi vagy admin oldalra ugorjon.
  if (access.activeProfileRole) {
    if (access.activeProfileRole.scope === 'system' && !(access.admin || access.master)) {
      return '/dashboard'
    }
    return getHomePathForScope(access.activeProfileRole.scope)
  }

  // Saját preferenciák olvasása
  const { data: pref } = await access.supabase
    .from('profile_preferences')
    .select('default_dashboard')
    .eq('user_id', access.user.id)
    .maybeSingle()

  const defaultDashboard: DefaultDashboard =
    ((pref as { default_dashboard?: DefaultDashboard } | null)?.default_dashboard) || 'auto'

  // 1) Explicit beállítás ellenőrzése (és fallback, ha nincs jogosultság)
  if (defaultDashboard === 'admin' && (access.admin || access.master)) {
    return '/admin'
  }
  if (defaultDashboard === 'egyhazkerulet' && access.egyhazkeruletiAdmin) {
    return '/dashboard-kerulet'
  }
  if (defaultDashboard === 'egyhazmegye' && access.esperes) {
    return '/dashboard-egyhazmegye'
  }
  if (defaultDashboard === 'gyulekezet') {
    return '/dashboard'
  }

  // 2) Auto: a legmagasabb aktív szerepkör szerint
  // (konzisztens az effective-access.ts defaultDashboardPath-szal)
  if (access.admin || access.master) return '/dashboard-kerulet'
  if (access.egyhazkeruletiAdmin) return '/dashboard-kerulet'
  if (access.esperes) return '/dashboard-egyhazmegye'
  return '/dashboard'
}
