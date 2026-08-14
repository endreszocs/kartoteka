import 'server-only'

import { cookies } from 'next/headers'

import { assertCongregationInScope } from '@/lib/auth/admin-scope'
import type { EffectiveAccessContext } from '@/lib/auth/effective-access'
// A god-mode munkamenet sütije 2026-08-15 (8. pont D) óta HMAC-aláírt,
// felhasználóhoz kötött érték — az ellenőrzés a közös modulon át történik.
import { GOD_MODE_COOKIE, verifyGodModeCookieValue } from '@/lib/auth/god-mode-session'

/**
 * Delegált import — SZERVEROLDALI kapuőr (2026-08-11, #16).
 *
 * A hiba, amit betöm: a 6 jegyű PIN-nel feloldható „Rendszergazdai importáló"
 * eddig CSAK a felületen létezett. Minden modul-oldal kiszámolta a
 * `showAdminImport = godMode.active || delegatedImport.active` értéket, és ha
 * false volt, egyszerűen ELREJTETTE a fület — de a `executeBatchImport` és a
 * `parseAndPreview` szerver-akció egyetlen sorban sem olvasta a
 * `delegated_import_<modul>` sütit. Egy `'use server'` export viszont ÉLŐ
 * POST-végpont: bármelyik bejelentkezett felhasználó elküldhette az akció
 * azonosítóját egy preparált munkafüzettel, és tömegesen szúrhatott sorokat a
 * saját gyülekezete `szemely` / `befizetes` / `kiadas` / `iktato` /
 * `leltar_tetelek` tábláiba — PIN nélkül, a 2 órás munkamenet, a brute-force
 * korlátozó és az aktiválási audit-nyom teljes megkerülésével.
 *
 * A kapuőr HÁROM legitim utat ismer el (fail-closed: bármi más elutasítás):
 *   1. `delegated`   — érvényes `delegated_import_<modul>` süti, amely UGYANARRA
 *                      a cél-gyülekezetre szól és még nem járt le,
 *   2. `god_mode`    — a master admin aktív god-mode munkamenete,
 *   3. `admin_scope` — a rendszergazdai Import központ (/admin/import) útja:
 *                      master / teljes / egyházkerületi admin, a cél-gyülekezet
 *                      pedig a hatókörében van (kerületi adminnál a saját
 *                      egyházkerülete). Ez az út szándékosan nem kér PIN-t —
 *                      az /admin layout már rendszergazdához köti.
 */

export const DELEGATED_IMPORT_COOKIE_PREFIX = 'delegated_import_'

export function sanitizeModuleKey(moduleKey: string) {
  return (moduleKey || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
}

export function getDelegatedImportCookieName(moduleKey: string) {
  return `${DELEGATED_IMPORT_COOKIE_PREFIX}${sanitizeModuleKey(moduleKey)}`
}

export function parseDelegatedImportCookie(value: string | undefined) {
  if (!value) return null
  const [congregationId, expiresAtRaw] = value.split('|')
  const expiresAt = Number(expiresAtRaw)
  if (!congregationId || !Number.isFinite(expiresAt)) return null
  return { congregationId, expiresAt }
}

/** Melyik jogcímen engedtük át a hívást (naplózáshoz / diagnosztikához). */
export type DelegatedImportGrant = 'delegated' | 'god_mode' | 'admin_scope'

type GuardAccess = Pick<
  EffectiveAccessContext,
  'supabase' | 'user' | 'master' | 'admin' | 'egyhazkeruletiAdmin' | 'profileRoles' | 'profile'
>

const DENIED_MESSAGE =
  'Az importáláshoz előbb fel kell oldani a Rendszergazdai importálót a 6 jegyű PIN-nel ' +
  '(a modul „Rendszergazdai importáló" fülén), vagy a rendszergazdai Import központot kell használni.'

/**
 * Fail-closed engedély-ellenőrzés a batch importhoz.
 *
 * @param moduleKey             a FormData `module` mezője (members, finance, registry,
 *                              worklog, filing, inventory…) — ez egyben a süti kulcsa is
 * @param targetCongregationId  a MÁR feloldott cél-gyülekezet (resolveImportTargetCongregationId).
 *                              `null` csak az írás nélküli fájl-elemzésnél (parseAndPreview)
 *                              fordulhat elő, amikor a rendszergazdának nincs saját gyülekezete.
 */
export async function assertDelegatedImportAllowed(
  moduleKey: string,
  targetCongregationId: string | null,
  access: GuardAccess,
): Promise<{ ok: true; grant: DelegatedImportGrant } | { ok: false; error: string }> {
  if (!access.user) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }

  const cleanModuleKey = sanitizeModuleKey(moduleKey)
  if (!cleanModuleKey) return { ok: false, error: 'Ismeretlen import-modul.' }

  const isAdmin = Boolean(access.master || access.admin || access.egyhazkeruletiAdmin)
  const cookieStore = await cookies()

  // 3/b) Nincs cél-gyülekezet: ide csak az írás nélküli fájl-elemzés juthat el
  //      (a beszúró ág korábban hangos hibával megáll). Ilyenkor egyedül a
  //      rendszergazdai Import központ útja értelmezhető.
  if (!targetCongregationId) {
    if (isAdmin) return { ok: true, grant: 'admin_scope' }
    return { ok: false, error: 'Nincs aktív gyülekezet.' }
  }

  // 1) Delegált (PIN-nel feloldott) munkamenet — modulra ÉS gyülekezetre szól.
  const parsed = parseDelegatedImportCookie(
    cookieStore.get(getDelegatedImportCookieName(cleanModuleKey))?.value,
  )
  if (
    parsed &&
    parsed.congregationId === targetCongregationId &&
    Date.now() < parsed.expiresAt
  ) {
    return { ok: true, grant: 'delegated' }
  }

  // 2) Master admin aktív god-mode munkamenete — aláírás-ellenőrzéssel
  //    (2026-08-15, 8. pont D: a nyers epoch-süti hamisítható volt).
  if (access.master) {
    const raw = cookieStore.get(GOD_MODE_COOKIE)?.value
    if (verifyGodModeCookieValue(raw, access.user.id) !== null) {
      return { ok: true, grant: 'god_mode' }
    }
  }

  // 3) Rendszergazdai Import központ — admin + hatókör (kerületi admin csak a
  //    saját egyházkerületébe importálhat).
  if (isAdmin) {
    try {
      await assertCongregationInScope(access, targetCongregationId)
      return { ok: true, grant: 'admin_scope' }
    } catch {
      return { ok: false, error: 'Ehhez a gyülekezethez nincs jogosultsága (másik egyházkerület).' }
    }
  }

  return { ok: false, error: DENIED_MESSAGE }
}
