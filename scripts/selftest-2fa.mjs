#!/usr/bin/env node
/**
 * KÉTLÉPCSŐS BELÉPÉS (2FA) — forrás-őr önellenőrzés (2026-08-15, 8. pont A).
 *
 * MIT ŐRIZ (kritikus biztonsági invariánsok a forrásszövegben):
 *  - a mentőkód SOHA nem tárolódik nyersen (scrypt-hash + timing-safe összevetés)
 *  - a middleware aal-őre él (opt-in: nextLevel aal2 + currentLevel != aal2)
 *  - a 2FA-átirányítás a session-mode cookie-t IS beállítja (különben a
 *    2. lépcső után azonnali „lejárt session"-kiléptetés jönne)
 *  - a mentőkódos belépés a faktort leveszi és naplóz (vészkijárat-modell)
 *  - a jogi szöveg már nem „bevezetés alatt"-ot állít
 *
 * Futtatás:  node scripts/selftest-2fa.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

const read = (rel) => {
  const p = path.join(REPO_ROOT, ...rel.split('/'))
  if (!fs.existsSync(p)) { fail(`hiányzik a fájl: ${rel}`); return null }
  return fs.readFileSync(p, 'utf8')
}

const actions = read('apps/web/app/(dashboard)/profile/biztonsag/actions.ts')
const mw = read('apps/web/lib/supabase/middleware.ts')
const login = read('apps/web/app/(auth)/login/actions.ts')
const legal = read('apps/web/components/auth/legal-dialog.tsx')
const sql = read('migration-docs/sql/2026-08-15-mfa-mentokodok.sql')
if (!actions || !mw || !login || !legal || !sql) process.exit(1)

// F1: a mentőkód csak hash-elve tárolódik, timing-safe összevetéssel
if (actions.includes('scryptSync') && actions.includes('timingSafeEqual') && !/insert\([^)]*kod[^_h)]/.test(actions)) {
  ok('F1: mentőkód scrypt-hash + timing-safe összevetés')
} else fail('F1: a mentőkód-tárolás vagy -összevetés nem biztonságos!')

// F2: a hibás-kód ágon nincs korai kilépés (minden sort végigpróbálunk)
if (actions.includes('talalt === null') && actions.includes('korai')) {
  ok('F2: a kód-keresés nem lép ki korán (idő-szivárgás ellen)')
} else fail('F2: a mentőkód-keresés korai kilépéses lehet!')

// F3: middleware aal-őr — opt-in feltétellel
if (mw.includes('getAuthenticatorAssuranceLevel') && mw.includes("nextLevel === 'aal2'") && mw.includes("currentLevel !== 'aal2'")) {
  ok('F3: middleware aal-őr (opt-in: csak faktoros fióknál kényszerít)')
} else fail('F3: HIÁNYZIK a middleware aal-őr!')

// F4: a /login/ellenorzes bent maradhat auth-útként (nincs bounce)
if (mw.includes("'/login/ellenorzes'")) ok('F4: a 2. lépcső oldala nem pattan vissza')
else fail('F4: a /login/ellenorzes nincs kivételezve a middleware-ben!')

// F5: a 2FA-átirányítás a session-mode cookie-t is beállítja
const kétfaBlokk = login.slice(login.indexOf('getAuthenticatorAssuranceLevel'), login.indexOf("redirect('/login/ellenorzes')"))
if (kétfaBlokk.includes('SESSION_MODE_COOKIE')) {
  ok('F5: a 2FA-átirányítás előtt session-mode cookie-t állítunk')
} else fail('F5: a 2FA-út kihagyja a session-mode cookie-t → azonnali kiléptetés jönne!')

// F6: a mentőkódos belépés leveszi a faktort ÉS naplóz
if (actions.includes('deleteFactor') && actions.includes('mfa.mentokod_belepes')) {
  ok('F6: mentőkódos belépés = faktor-levétel + hangos napló')
} else fail('F6: a mentőkódos vészkijárat nem teljes!')

// F7: a jogi szöveg már nem „bevezetés alatt"-ot állít
if (!legal.includes('bevezetés alatt') && !legal.includes('being introduced') && !legal.includes('în curs de introducere')) {
  ok('F7: a jogi szöveg frissült (a 2FA elérhető)')
} else fail('F7: a jogi szöveg még „bevezetés alatt"-ot állít!')

// F8: a migráció fail-closed alapjai (RLS + csak select-policy + mentés-besorolás)
if (sql.includes('ENABLE ROW LEVEL SECURITY') && sql.includes('backup_table_policy') && (sql.match(/CREATE POLICY/g) || []).length === 1) {
  ok('F8: mentőkód-tábla RLS + egyetlen select-policy + mentés-besorolás')
} else fail('F8: a mentőkód-migráció védelme hiányos!')

// F9: a DESKTOP login is kezeli a 2. lepcsot (challenge+verify)
const dLogin = read('apps/desktop/src/pages/login-page.tsx')
if (dLogin && dLogin.includes('getAuthenticatorAssuranceLevel') && dLogin.includes('mfa.challenge') && dLogin.includes('mfa.verify')) {
  ok('F9: a desktop belepo-oldal kezeli a TOTP-lepcsot')
} else fail('F9: a desktop login NEM kezeli a 2FA-t — nema kizaras jonne!')

// F10: az AuthGate nem enged be aal1-es sessiont, ha a fioknak faktora van
const dGate = read('apps/desktop/src/lib/auth-gate.tsx')
if (dGate && dGate.includes('mfaSzukseges') && dGate.includes('getAuthenticatorAssuranceLevel')) {
  ok('F10: az AuthGate aal-ellenorzessel enged be')
} else fail('F10: az AuthGate barmilyen sessiont beenged — 2FA-kerulout!')

// ── D szelet (2026-08-15): god-mode + audit kemenyites ──────────────────────

const godMode = read('apps/web/app/(dashboard)/god-mode/actions-v4.ts')
const godSession = read('apps/web/lib/auth/god-mode-session.ts')
const pinHash = read('apps/web/lib/auth/pin-hash.ts')
const auditLog = read('apps/web/lib/audit/log.ts')
const dashActions = read('apps/web/app/(dashboard)/actions.ts')
const effAccess = read('apps/web/lib/auth/effective-access.ts')
const guard = read('apps/web/app/(dashboard)/delegated-import/guard.ts')
const optinSql = read('migration-docs/sql/2026-08-15-mfa-optin-rls.sql')

// F11: a god-mode PIN sose hasonlitodik `!==`-vel, es hash-elve tarolodik
if (
  godMode && pinHash &&
  !godMode.includes('cleanedPin !== storedPin.pin') &&
  godMode.includes('secretMatches') &&
  godMode.includes('hashSecret') &&
  pinHash.includes('timingSafeEqual')
) {
  ok('F11: god-mode PIN scrypt-hash + konstans ideju osszevetes')
} else fail('F11: a god-mode PIN tarolasa/osszevetese nem biztonsagos!')

// F12: a god_mode_until suti HMAC-alairt es a felhasznalohoz kotott
if (
  godSession && godMode &&
  godSession.includes('createHmac') && godSession.includes('timingSafeEqual') &&
  godMode.includes('signGodModeCookieValue') && godMode.includes('verifyGodModeCookieValue')
) {
  ok('F12: a god-mode suti alairt (nem hamisithato)')
} else fail('F12: a god-mode suti nyers epoch — hamisithato!')

// F13: MINDEN suti-olvaso az alairas-ellenorzon at megy (nincs nyers Number())
if (
  effAccess && guard &&
  effAccess.includes('verifyGodModeCookieValue') && !effAccess.includes('Number(cookie.value)') &&
  guard.includes('verifyGodModeCookieValue') && !guard.includes('Number(raw)')
) {
  ok('F13: effective-access + delegalt-import kapuor is alairast ellenoriz')
} else fail('F13: maradt nyers god-mode-suti-olvaso — kerulout!')

// F14: az audit tolti az ip/user_agent mezot, es a sikertelen login + logout is naplozott
if (
  auditLog && login && dashActions &&
  auditLog.includes('x-forwarded-for') && auditLog.includes('p_user_agent') &&
  login.includes("'login_failed'") && dashActions.includes("action: 'logout'")
) {
  ok('F14: audit ip+eszkoz + login_failed + logout esemenyek')
} else fail('F14: az audit-lefedettseg hianyos (ip/user_agent/login_failed/logout)!')

// F15: az opt-in RLS migracio tartalmazza az auth-sema GRANT-okat
// (2026-08-15 eles leallas tanulsaga: e nelkul minden lekerdezes 403!)
if (
  optinSql &&
  optinSql.includes('GRANT USAGE ON SCHEMA auth TO authenticated') &&
  optinSql.includes('GRANT SELECT ON auth.mfa_factors TO authenticated') &&
  optinSql.includes('has_table_privilege')
) {
  ok('F15: az RLS-migracio auth-GRANT-okkal + jog-ellenorzessel szallit')
} else fail('F15: az RLS-migraciobol hianyzik az auth-GRANT — 403-leallast okozna!')

if (failed) { console.error('\n2FA selftest: HIBA'); process.exit(1) }
console.log('\n2FA selftest: minden rendben ✅')
