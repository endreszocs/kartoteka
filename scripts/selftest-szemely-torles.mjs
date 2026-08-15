#!/usr/bin/env node
/**
 * SZEMÉLY-TÖRLÉS KÉT ÚTJA — forrás-őr önellenőrzés (2026-08-14, 1. döntés).
 *
 * A lánc lényege nem egy tiszta számoló-modul, hanem SQL + felület-huzalozás —
 * ezért ez a teszt a KRITIKUS INVARIÁNSOKAT őrzi a forrásszövegben:
 *   - a migráció CSAK a két új, csak-olvasó függvényt adja, és a törlő
 *     RPC-hez NEM nyúl (bírálói BLOCKER: annak a 2026-07-17-es tagi-portál
 *     kompat verziója él(het), zárakkal + markerrel — ütközni TILOS)
 *   - fail-closed: auth.uid()-őr, anon-REVOKE, a belső katalógus zárva
 *   - a P0-allowlist szinkronban van az új RPC-vel
 *   - a dialógus a törlés ELŐTT ellenőriz, és a futó ellenőrzés alatt a
 *     destruktív gomb TILTOTT (nem mondhat mást a confirm, mint ami történik)
 *   - a visszahozás csak a 'törölt' státuszt írja át (elhunyt/elköltözött NEM)
 *
 * Futtatás:  node scripts/selftest-szemely-torles.mjs
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

const sql = read('migration-docs/sql/2026-08-14-szemely-torles-ket-utja.sql')
const p0 = read('migration-docs/sql/2026-07-17-member-portal-p0-auth-isolation.sql')
const actions = read('apps/web/app/(dashboard)/tagnyilvantartas/actions.ts')
// 2026-08-15 (desktop-paritás 2. szelet): a négyutas kivezetés-dialógus a
// KÖZÖS @kartoteka/ui-app csomagba költözött (web+desktop egy forrásból) —
// a forrás-őr mostantól a közös fájlt vizsgálja, a webes wrapper vékony héj.
const dialog = read('packages/ui-app/src/members/MemberRemoveDialog.tsx')
const hidden = read('apps/web/components/modals/hidden-members-dialog.tsx')
if (!sql || !p0 || !actions || !dialog || !hidden) process.exit(1)

// T1: a publikus ellenőrző RPC fail-closed auth.uid()-őrrel indul
if (/IF auth\.uid\(\) IS NULL THEN/.test(sql)) ok('T1: fail-closed auth.uid()-őr az ellenőrző RPC-ben')
else fail('T1: HIÁNYZIK az auth.uid()-őr a migrációból!')

// T2: anon-REVOKE mindkét függvényre (2026-08-11 hardening konvenció)
const anonRevokes = (sql.match(/REVOKE ALL ON FUNCTION [^;]+ FROM anon/g) || []).length
if (anonRevokes >= 2) ok('T2: anon-REVOKE mindkét függvényen')
else fail(`T2: csak ${anonRevokes} anon-REVOKE (várt: 2)`)

// T3: a belső katalógus-függvény az authenticated elől is zárva
if (/REVOKE ALL ON FUNCTION public\.szemely_kapcsolat_lista\(integer\) FROM authenticated/.test(sql)) {
  ok('T3: a belső katalógus közvetlenül nem hívható (authenticated-REVOKE)')
} else fail('T3: HIÁNYZIK az authenticated-REVOKE a belső katalógusról!')

// T4: a migráció a törlő RPC-hez NEM nyúl (bírálói BLOCKER: a 2026-07-17-es
// tagi-portál kompat verzió zárait/markerét egy CREATE OR REPLACE némán
// kiütné, a függő P0-lánc preflightja pedig a markert követeli)
if (!/CREATE (OR REPLACE )?FUNCTION public\.tagnyilvantartas_tag_torles/.test(sql)) {
  ok('T4: a törlő RPC érintetlen (a portál-kompat lánccal nem ütközünk)')
} else fail('T4: a migráció a tagnyilvantartas_tag_torles-t írja felül — ez a portál-lánccal ÜTKÖZIK!')

// T5: a P0-allowlist szinkronban van — az új RPC szerepel, a belső NEM
if (p0.includes("('szemely_kapcsolatok'),")) {
  ok('T5a: a P0 staff-allowlist tartalmazza a szemely_kapcsolatok-ot')
} else fail('T5a: a szemely_kapcsolatok HIÁNYZIK a P0-allowlistből — a P0-lánc kiütné!')
if (!p0.includes("('szemely_kapcsolat_lista')")) {
  ok('T5b: a belső katalógus NINCS az allowlistben (szándékosan zárt)')
} else fail('T5b: a belső szemely_kapcsolat_lista BEKERÜLT az allowlistbe — zárva kell maradnia!')

// T6: a bírálói pótlások a katalógusban (CASCADE/SET NULL hivatkozások)
if (sql.includes('cross_congregation_match_notifications') && sql.includes('family_link_audit')) {
  ok('T6: a katalógus a gyülekezetközi egyezést és a család-link naplót is fedi')
} else fail('T6: a katalógusból hiányzik a cross_congregation_match_notifications vagy a family_link_audit!')

// T7: a kliens kezeli a jövőbeli hidden_kapcsolat státuszt (v3-előkészítés)
if (actions.includes("case 'hidden_kapcsolat':")) ok('T7: removeMember kezeli a hidden_kapcsolat státuszt')
else fail('T7: a removeMember nem kezeli a hidden_kapcsolat státuszt!')

// T8: az előzetes ellenőrzés fail-soft (RPC-hiba → available:false, nem crash)
if (/checkPersonReferences/.test(actions) && /available: false/.test(actions)) {
  ok('T8: checkPersonReferences fail-soft (migráció előtt is működik)')
} else fail('T8: a checkPersonReferences hiányzik vagy nem fail-soft!')

// T9: a dialógus a törlés ELŐTT hívja az ellenőrzést. 2026-08-15 óta a közös
// dialógus props-injektált `checkReferences`-t hív, a webes wrapper pedig a
// checkPersonReferences szerver-akciót injektálja — MINDKÉT láncszem kell.
const webWrapper = read('apps/web/components/modals/member-remove-dialog.tsx')
if (
  dialog.includes('checkReferences(member.id)') &&
  webWrapper.includes('checkPersonReferences')
) {
  ok('T9: a törlés-dialógus előzetesen ellenőrzi a kapcsolatokat (közös dialógus + webes injektálás)')
} else fail('T9: a dialógus nem hívja a checkPersonReferences-t!')

// T10: a megerősítő szöveg a TÉNYLEGES műveletet mondja — és van semleges ág
if (
  dialog.includes('elrejtésre kerül a névsorból') &&
  dialog.includes('VÉGLEGESEN törli') &&
  dialog.includes('A rendszer dönti el')
) {
  ok('T10: a megerősítés mindhárom esetben igazat mond (elrejtés/törlés/semleges)')
} else fail('T10: a megerősítő szövegek nem fedik mindhárom esetet!')

// T11: a visszahozás CSAK a törlési 'törölt' státuszt írja át 'aktív'-ra
if (/member_status === 'törölt'\s*\?\s*\{ isvisible: true, member_status: 'aktív' \}\s*:\s*\{ isvisible: true \}/.test(actions)) {
  ok('T11: a visszahozás csak a törölt státuszt állítja vissza aktívra')
} else fail('T11: a restoreHiddenMember státusz-kezelése eltér a várttól — ellenőrizd!')

// T12: a rejtett-lista gyülekezet-szűrt és isvisible=false-ra szűr (fail-closed)
if (/\.eq\('congregation_id', congregationId\)[\s\S]{0,80}\.eq\('isvisible', false\)/.test(actions)) {
  ok('T12: listHiddenMembers gyülekezet-szűrt + isvisible=false')
} else fail('T12: a listHiddenMembers szűrése hiányos!')

// T13: a destruktív gomb TILTOTT, amíg az előzetes ellenőrzés fut (race-fix)
if (/reason === 'torles' && refs === null/.test(dialog)) {
  ok('T13: a törlés-gomb tiltott az ellenőrzés futása alatt')
} else fail('T13: HIÁNYZIK a refs===null tiltás a törlés-gombról (race)!')

// T14: a rejtett-lista csonkolása NEM néma (K5-#21 hibaosztály)
if (actions.includes('truncated') && hidden.includes('truncated')) {
  ok('T14: a rejtett-lista 500-as plafonja jelzett (nem néma)')
} else fail('T14: az 500-as plafon némán csonkolna!')

// T15: a migrációs hiba-utótag csak hiányzó függvénynél jelenik meg
if (/hianyzoFuggveny/.test(actions)) {
  ok('T15: a félrevezető migrációs utótag csak 42883-nál jelenik meg')
} else fail('T15: a migrációs utótag feltétel nélkül megy ki — félrevezető!')

// T16: a VÉGLEGES törlés naplózott — pillanatkép a törlés ELŐTT, napló a
// 'deleted' státusznál (member.delete.permanent), a fénykép nélkül
if (
  actions.includes("action: 'member.delete.permanent'") &&
  /delete szemelyPillanat\.kep/.test(actions) &&
  actions.indexOf('szemelyPillanat') < actions.indexOf("supabase.rpc('tagnyilvantartas_tag_torles'")
) {
  ok('T16: a végleges törlés pillanatkép-naplós (member.delete.permanent)')
} else fail('T16: a végleges törlés naplózása hiányzik vagy a pillanatkép a törlés UTÁN készülne!')

// T17: a portál-kompat lánc érintetlen — a törlő függvényt EGYIK repóbeli
// 08-14-es fájl sem írja felül (a lánc exact ujjlenyomattal védi)
const compat = read('migration-docs/sql/2026-07-17-member-portal-legacy-workflow-compat.sql')
if (compat && compat.includes("'KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'")) {
  ok('T17: a portál-kompat lánc érintetlen (V1 marker a helyén)')
} else fail('T17: a portál-kompat fájl megváltozott — a törlő-láncot csak a portál-rollout körrel szabad bántani!')

if (failed) { console.error('\nSZEMÉLY-TÖRLÉS selftest: HIBA'); process.exit(1) }
console.log('\nSZEMÉLY-TÖRLÉS selftest: minden rendben ✅')
