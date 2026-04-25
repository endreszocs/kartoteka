/**
 * Session-állapot analízis a UI-feedback-hez (A-M6.9, 2026-04-22; v0.5.3 fix).
 *
 * A lelkész mindig tudja, milyen állapotban van a munkamenete:
 *   - **Online**: van friss Supabase session — a szinkron aktív
 *   - **Offline munkamenet**: nincs Supabase session, de PIN-nel beléptünk
 *
 * **Fix v0.5.3 (2026-04-25)**: a korábbi „A munkamenet hamarosan lejár" warning
 * **mindig** megjelent online állapotban is, mert a Supabase `session.expires_at`
 * az **access tokenre** vonatkozik (~1 óra élettartam), nem a refresh tokenre.
 * Az access token automatikusan megújul a háttérben — nincs szükség user-figyelmeztetésre.
 * Ha a refresh-token tényleg lejár (~30 nap után), akkor a Supabase az
 * `onAuthStateChange`-en `SIGNED_OUT` eventet küld, és az AuthGate a `/login`-ra
 * vagy PIN-entry-re tereli a felhasználót. Tehát:
 *   - Van session  → 🟢 Online (semmi figyelmeztetés)
 *   - Nincs session, van offline-mode → 🟠 Offline munkamenet
 *   - Nincs session, nincs offline-mode → 🌑 Kijelentkezve (gate redirect)
 *
 * Memória alapelv: `feedback_lelkesz_informalas.md` — pontos, NEM félrevezető
 * üzenet, és semmiképp nem felesleges riasztás.
 */

import type { Session } from '@supabase/supabase-js'

import { isOfflineMode } from './auth-pin'

export type SessionKind = 'online' | 'offline-pin' | 'signed-out'

export interface SessionInfo {
  kind: SessionKind
  /** Az access token lejárati ISO timestamp-je (~1 órás auto-refresh ciklus). */
  expiresAt: string | null
  /** Rövid, pasztorális üzenet a UI-ra. */
  label: string
  /** UI-szín hint (emerald = OK, orange = offline-mode, slate = signed out). */
  tone: 'emerald' | 'orange' | 'slate'
}

export function analyzeSession(session: Session | null): SessionInfo {
  if (session) {
    const expiresAtSec = session.expires_at ?? null
    const expiresAtIso = expiresAtSec
      ? new Date(expiresAtSec * 1000).toISOString()
      : null

    return {
      kind: 'online',
      expiresAt: expiresAtIso,
      label: 'Online',
      tone: 'emerald',
    }
  }

  if (isOfflineMode()) {
    return {
      kind: 'offline-pin',
      expiresAt: null,
      label:
        'Offline munkamenet — a változtatásaid a következő csatlakozáskor szinkronizálódnak.',
      tone: 'orange',
    }
  }

  return {
    kind: 'signed-out',
    expiresAt: null,
    label: 'Kijelentkezve',
    tone: 'slate',
  }
}
