import 'server-only'

import { assertCongregationInScope } from '@/lib/auth/admin-scope'
import type { EffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Import cél-gyülekezet feloldása (2026-07-11, admin import-hub).
 *
 * A rendszergazdai import-hub (/admin/import) bármelyik gyülekezethez importálhat.
 * A futtató-actionök (batch-import, family-head, families-from-persons) FormData-ban
 * kapják az opcionális `targetCongregationId`-t. Ez a helper egységesen dönt:
 *
 *   1. NINCS explicit cél (vagy megegyezik az aktív gyülekezettel) →
 *      a RÉGI viselkedés: az aktív (saját / god-mode) gyülekezet. A gyülekezeti
 *      import-út (delegált / god-mode) NEM változik.
 *   2. VAN explicit, az aktívtól ELTÉRŐ cél → csak rendszergazda (master / teljes /
 *      egyházkerületi admin) teheti, és a cél a hatókörébe kell essen
 *      (assertCongregationInScope — kerületi admin csak a saját egyházkerületét).
 *
 * Így az explicit cél-paraméter sosem lehet jogosultság-emelés: enélkül minden
 * a régi módon fut, vele pedig kötelező az admin + hatókör-ellenőrzés.
 */
export async function resolveImportTargetCongregationId(
  explicitId: string | null | undefined,
  access: EffectiveAccessContext,
): Promise<{ congregationId: string | null; error?: string }> {
  const trimmed = (explicitId ?? '').trim()

  // 1. Nincs explicit cél, vagy az aktív gyülekezet → régi viselkedés.
  if (!trimmed || trimmed === access.effectiveCongregationId) {
    return { congregationId: access.effectiveCongregationId }
  }

  // 2. Explicit, eltérő cél → csak rendszergazda + hatókör.
  const isAdmin = access.master || access.admin || access.egyhazkeruletiAdmin
  if (!isAdmin) {
    return {
      congregationId: null,
      error: 'Másik gyülekezetbe csak rendszergazda importálhat.',
    }
  }

  try {
    await assertCongregationInScope(access, trimmed)
  } catch (e) {
    return {
      congregationId: null,
      error: e instanceof Error ? e.message : 'Ehhez a gyülekezethez nincs jogosultsága.',
    }
  }

  return { congregationId: trimmed }
}
