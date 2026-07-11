import type { ProfileRoleScope } from '@/lib/profile-roles/types'

/**
 * Előfizetés-alapú hozzáférés-vezérlés (funkció-gating) típusai.
 *
 * Külön fájlban (a Next.js 16 'use server' konvenció szerint egy 'use server'
 * modul NEM exportálhat típust/konstanst). Így ez a fájl bárhonnan biztonságosan
 * importálható (layout, kliens-komponens, action) anélkül, hogy szerver-kódot
 * (createAdminClient) rántana be.
 */

/**
 * A `congregation_subscriptions.access_status` DB-oszlop lehetséges értékei.
 * A HOZZÁFÉRÉST vezérli, függetlenül a `tipus` árazás-típustól.
 */
export type SubscriptionAccessStatus = 'active' | 'trial' | 'free' | 'suspended' | 'grace'

/**
 * A gating-mag által visszaadott státusz. A `'none'` szintetikus érték:
 * NINCS aktív előfizetési rekord a gyülekezethez (biztonságos default — NEM blokkol).
 */
export type CongregationAccessStatus = SubscriptionAccessStatus | 'none'

/**
 * A `congregation_subscriptions.access_status` érvényes értékei
 * (futásidejű normalizáláshoz).
 */
export const SUBSCRIPTION_ACCESS_STATUSES: readonly SubscriptionAccessStatus[] = [
  'active',
  'trial',
  'free',
  'suspended',
  'grace',
] as const

/**
 * A `getCongregationAccessStatus` visszatérési értéke.
 *
 * BIZTONSÁGOS DEFAULT: `isBlocked` KIZÁRÓLAG akkor igaz, ha a státusz explicit
 * `'suspended'`. Minden más eset (nincs rekord, hiba, hiányzó oszlop/tábla,
 * ismeretlen érték, null congregationId) → `isBlocked=false`.
 */
export interface CongregationAccessResult {
  /** A hozzáférés-státusz; `'none'` ha nincs aktív előfizetési rekord. */
  status: CongregationAccessStatus
  /** Blokkolt-e a gyülekezet? CSAK `status === 'suspended'` esetén igaz. */
  isBlocked: boolean
  /** A leállítás indoka (`suspend_reason`), csak suspended esetén; egyébként null. */
  reason: string | null
  /** A teszt-időszak vége (`trial_ends_at`, ISO dátum-string) vagy null. */
  trialEndsAt: string | null
  /** Az árazás-típus (`tipus`: havi/eves/teszt/kedvezmeny/ingyenes) vagy null. */
  subscriptionType: string | null
}

/**
 * A `shouldGateUser` szinkron helper bemenete. A layout ezekből dönti el,
 * egyáltalán kell-e státuszt kérnie a felhasználóhoz.
 */
export interface GateableUserContext {
  /** Master admin (email-alapú). SOHA nincs gating-elve. */
  master: boolean
  /** Rendszer-admin. SOHA nincs gating-elve. */
  admin: boolean
  /** Egyházkerületi admin. SOHA nincs gating-elve. */
  egyhazkeruletiAdmin: boolean
  /**
   * Az éppen aktív profile_role scope-ja (`activeProfileRole?.scope`).
   * `'system' | 'district' | 'diocese'` → admin-jellegű, NEM gating-elhető.
   * `'congregation'` vagy hiányzó (null/undefined, elsődleges szerepkör) → gyülekezeti.
   */
  activeScope: ProfileRoleScope | null | undefined
}
