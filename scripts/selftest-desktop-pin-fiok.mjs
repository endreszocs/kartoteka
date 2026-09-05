// selftest-desktop-pin-fiok.mjs — a desktop PIN-tulajdonos kötés és a Fiók / Kapcsolat fül őrszemei
//
// ⛔ MI VOLT A HIBA (2026-09-05, desk-auth-2 / P1)
//   A PIN-hash egyetlen, felhasználó nélküli keyring-slot volt. Ha A lelkész
//   gépén később B lépett be online, a `hasPin()` igaz volt → B sosem kapott
//   PIN-beállítást, és A kódjával bárki offline beléphetett B tükrébe. A
//   „Emlékezz erre a gépre" jelző a localStorage-ban élt a PIN-től függetlenül:
//   törölt PIN mellett is kulcs nélküli ajtó volt. A pin-setup „Később" gombja
//   a Beállítások egy nem létező helyére mutatott, és a reset-jelzőt sem törölte.
//
// ŐRSZEMEK
//   A1–A9  auth-pin.ts FUTTATVA (transpile + mockolt Tauri invoke + window):
//          tulajdonos-egyeztetés ('nincs'/'sajat'/'idegen', tulajdonos nélküli
//          PIN = idegen → fail-closed), setPin tulajdonossal ír, üres tulajdonos
//          tilos, clearPin a tulajdonost ÉS a remember-jelzőt is törli,
//          offlineBelepesEngedett PIN nélkül hamis + önjavítóan töröl
//   A2n    negatív: a tulajdonos-ellenőrzést kivevő mutánson (mindig 'sajat') BUKIK
//   A5n    negatív: a tulajdonos-írást kivevő mutánson BUKIK
//   A8n    negatív: a PIN-ellenőrzés nélküli remember-jelzőn BUKIK
//   B1–B8  forrás-őrök: pin-entry tulajdonos-kapu + „Összekapcsolás újra";
//          login-page belépés utáni ág (idegen → clearPin); varázsló belepesUtan
//          + ok=pin ágon signOut a kapcsolás ELŐTT; settings 'fiok' fül ELSŐ;
//          pin-setup „Később" törli a reset-jelzőt; főoldal „Kapcsolat állapota";
//          Adat & biztonság /dev link; fiok-panel tartalma
//   B1n/B2n/B4n/B5n  negatív mutánsok a forrás-őrökre
//
// ⛔ BÍRÁLÓ TALÁLATOK (2026-09-05)
//   P1  a tükör-tulajdonos wipe-ág feltétel nélkül törölte a PIN-t — a
//       jelszavas /login → /pin-setup → / úton a BELÉPŐ frissen beállított
//       kódját is (az AuthGate csak a /pin-setup UTÁN mountol).
//   P1  a varázsló 3. lépésének effektje a döntő-lap (tukorDontes) alatt
//       újra és újra indította a betöltést → végtelen hurok.
//   P2  a varázsló „Másik fiók" gombja paraméter nélküli signOut-ot hívott
//       (= 'global': a lelkész MINDEN eszközét kijelentkeztette).
//   C1–C3 local-mirror-owner FUTTATVA (valódi auth-pin + mock DB): a belépő
//         saját kódja a wipe-ot TÚLÉLI; az idegen kód törlődik; kód nélkül nincs hiba
//   C1n   mutáns (feltétel nélküli clearPin) → BUKIK
//   B3f   forrás-őr: a 3. lépés effektje a döntő-lap alatt NEM indít újra
//         (feltétel + függőség) + mutáns; kilep() törli a döntést
//   B3g   forrás-őr: a varázsló és a login MINDEN signOut-ja scope:'local' + mutáns
//
// Futtatás:  node scripts/selftest-desktop-pin-fiok.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DESKTOP = path.join(ROOT, 'apps/desktop/src')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

function kommentNelkul(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((s) => {
    const i = s.indexOf('//')
    if (i === -1) return s
    const elotte = s.slice(0, i)
    return ((elotte.match(/['"`]/g) || []).length % 2 === 0) ? elotte : s
  }).join('\n')
}

// ── Mock-környezet: window (session/localStorage) + Tauri invoke ──────────
function tarolo() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  }
}

/** A keyring-mock állapota: PIN-hash léte + tulajdonos + hívás-napló. */
function keyringMock() {
  const state = { hasPin: false, owner: null, calls: [] }
  state.invoke = async (cmd, args) => {
    state.calls.push({ cmd, args })
    switch (cmd) {
      case 'auth_pin_has':
        return state.hasPin
      case 'auth_pin_set':
        state.hasPin = true
        return undefined
      case 'auth_pin_clear':
        state.hasPin = false
        return undefined
      case 'auth_read_item':
        return args.key === 'auth-pin-owner' ? state.owner : null
      case 'auth_store_item':
        if (!String(args.key).startsWith('auth-')) throw new Error('csak auth- előtag')
        if (args.key === 'auth-pin-owner') state.owner = args.value
        return undefined
      case 'auth_clear_item':
        if (args.key === 'auth-pin-owner') state.owner = null
        return undefined
      default:
        throw new Error(`váratlan invoke: ${cmd}`)
    }
  }
  return state
}

const AUTH_PIN_SRC = fs.readFileSync(path.join(DESKTOP, 'lib/auth-pin.ts'), 'utf8')

/** Az auth-pin modul betöltése ADOTT forrással (mutánsokhoz is), friss mockokkal. */
function betoltAuthPin(forras, nev) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-pin-${nev}-`))
  const kr = keyringMock()
  globalThis.window = { sessionStorage: tarolo(), localStorage: tarolo() }
  try {
    const modDir = path.join(tmp, 'node_modules/@tauri-apps/api')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'core.js'), 'module.exports = { invoke: (...a) => globalThis.__kartotekaInvoke(...a) }')
    globalThis.__kartotekaInvoke = kr.invoke
    fs.writeFileSync(path.join(tmp, 'auth-pin.cjs'), t(forras))
    const mod = require_(path.join(tmp, 'auth-pin.cjs'))
    return { mod, kr, win: globalThis.window }
  } finally {
    // A require már beolvasta — a fájlok törölhetők (Windows-on a cjs zárolás nélkül).
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
}

// ── A: auth-pin.ts futtatva ───────────────────────────────────────────────
{
  const { mod, kr } = betoltAuthPin(AUTH_PIN_SRC, 'eredeti')
  kr.hasPin = true
  kr.owner = 'user-A'
  assert((await mod.pinTulajdonosEllenorzes('user-A')) === 'sajat', 'A1: a tulajdonos saját kódja → sajat')
  assert((await mod.pinTulajdonosEllenorzes('user-B')) === 'idegen', 'A2: másik fiók kódja → idegen')
  kr.owner = null
  assert((await mod.pinTulajdonosEllenorzes('user-A')) === 'idegen', 'A3: tulajdonos NÉLKÜLI (frissítés előtti) kód → idegen (fail-closed)')
  kr.hasPin = false
  assert((await mod.pinTulajdonosEllenorzes('user-A')) === 'nincs', 'A4: nincs kód → nincs')

  kr.calls.length = 0
  await mod.setPin('1234', 'user-B')
  const setIdx = kr.calls.findIndex((c) => c.cmd === 'auth_pin_set')
  const ownerIdx = kr.calls.findIndex((c) => c.cmd === 'auth_store_item' && c.args.key === 'auth-pin-owner' && c.args.value === 'user-B')
  assert(setIdx >= 0 && ownerIdx > setIdx && kr.owner === 'user-B', 'A5: setPin a hash UTÁN a tulajdonost is a keyringbe írja (auth-pin-owner)')
  assert((await mod.pinTulajdonosEllenorzes('user-B')) === 'sajat', 'A5b: a frissen beállított kód a beállító sajátja')

  let dobott = false
  try { await mod.setPin('1234', '') } catch { dobott = true }
  assert(dobott, 'A6: tulajdonos nélküli setPin TILOS (dob)')

  // clearPin: hash + tulajdonos + remember-jelző
  mod.setRememberOffline(7)
  assert(mod.isRememberOfflineActive(), 'A7a: a remember-jelző beállítható')
  await mod.clearPin()
  assert(!kr.hasPin && kr.owner === null && !mod.isRememberOfflineActive(), 'A7: clearPin a hash-t, a tulajdonost ÉS a remember-jelzőt is törli')

  // offlineBelepesEngedett: remember-jelző PIN nélkül érvénytelen + önjavít
  mod.setRememberOffline(7)
  kr.hasPin = false
  assert(mod.isOfflineMode(), 'A8a: PIN nélkül a puszta isOfflineMode még igaz (ez volt a rés)')
  assert((await mod.offlineBelepesEngedett()) === false, 'A8: offlineBelepesEngedett PIN nélkül HAMIS')
  assert(!mod.isRememberOfflineActive() && !mod.isOfflineMode(), 'A8b: …és a kulcs nélküli remember-jelzőt önjavítóan törli')
  kr.hasPin = true
  mod.setRememberOffline(7)
  assert((await mod.offlineBelepesEngedett()) === true, 'A9: remember-jelző + PIN → engedett')
}

// A2n — a tulajdonos-ellenőrzést kivevő mutáns (a „régi világ": hasPin igaz = mehet)
{
  const MINTA = "return owner !== null && owner === userId ? 'sajat' : 'idegen'"
  const mutans = AUTH_PIN_SRC.replace(MINTA, "return 'sajat'")
  if (mutans === AUTH_PIN_SRC) {
    assert(false, 'A2n: a tulajdonos-mutáns NEM különbözik — a negatív asszert vak')
  } else {
    const { mod, kr } = betoltAuthPin(mutans, 'mutans-tulajdonos')
    kr.hasPin = true
    kr.owner = 'user-A'
    assert((await mod.pinTulajdonosEllenorzes('user-B')) !== 'idegen', 'A2n: a tulajdonos-ellenőrzés nélküli mutánson az őrszem BUKIK (idegen kód átmegy)')
  }
}

// A5n — a tulajdonos-írást kivevő mutáns
{
  const mutans = AUTH_PIN_SRC.replace('await setPinOwner(ownerUserId)', '/* mutáns */')
  if (mutans === AUTH_PIN_SRC) {
    assert(false, 'A5n: a setPin-mutáns NEM különbözik — a negatív asszert vak')
  } else {
    const { mod, kr } = betoltAuthPin(mutans, 'mutans-setpin')
    await mod.setPin('1234', 'user-B')
    assert(kr.owner !== 'user-B', 'A5n: a tulajdonos-írás nélküli mutánson az őrszem BUKIK (tulajdonos nélküli PIN)')
  }
}

// A8n — a remember-jelző PIN-hez kötésének kivétele
{
  const mutans = AUTH_PIN_SRC.replace(/if \(!van\) \{\n\s*clearRememberOffline\(\)/, 'if (false) {\n    clearRememberOffline()')
  if (mutans === AUTH_PIN_SRC) {
    assert(false, 'A8n: a remember-mutáns NEM különbözik — a negatív asszert vak')
  } else {
    const { mod, kr } = betoltAuthPin(mutans, 'mutans-remember')
    kr.hasPin = false
    mod.setRememberOffline(7)
    assert((await mod.offlineBelepesEngedett()) === true, 'A8n: a PIN-ellenőrzés nélküli mutánson az őrszem BUKIK (kulcs nélküli ajtó)')
  }
}

// ── C: local-mirror-owner.ts FUTTATVA — a wipe és a belépő saját PIN-je ───
const MIRROR_SRC = fs.readFileSync(path.join(DESKTOP, 'lib/local-mirror-owner.ts'), 'utf8')

/**
 * A tükör-tulajdonos modul betöltése ADOTT forrással: a VALÓDI auth-pin (a
 * keyring-mockkal), mock lastUser és egy pici, memóriabeli local_meta.
 */
function betoltMirrorOwner(forras, nev, { tulajdonos = null, lastUser = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-tukor-${nev}-`))
  const kr = keyringMock()
  globalThis.window = { sessionStorage: tarolo(), localStorage: tarolo() }
  globalThis.__kartotekaInvoke = kr.invoke
  const db = { meta: new Map(), torolt: [] }
  if (tulajdonos) db.meta.set('mirror_owner_user_id', tulajdonos)
  globalThis.__kartotekaDb = db
  globalThis.__kartotekaLastUser = lastUser
  try {
    const modDir = path.join(tmp, 'node_modules/@tauri-apps/api')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'core.js'), 'module.exports = { invoke: (...a) => globalThis.__kartotekaInvoke(...a) }')
    fs.writeFileSync(path.join(tmp, 'auth-pin.js'), t(AUTH_PIN_SRC))
    fs.writeFileSync(path.join(tmp, 'desktop-user.js'), 'exports.getLastUser = () => globalThis.__kartotekaLastUser')
    fs.writeFileSync(
      path.join(tmp, 'local-db.js'),
      `const db = () => globalThis.__kartotekaDb;
exports.dbSelect = async (sql, params = []) => {
  if (/FROM sqlite_master/.test(sql)) return ['local_meta', 'szemely_local', 'outbox'].filter((n) => n !== params[0]).map((name) => ({ name }));
  if (/FROM local_meta WHERE k = \\?/.test(sql)) { const v = db().meta.get(params[0]); return v ? [{ v }] : []; }
  if (/COUNT\\(\\*\\)/.test(sql)) return [{ n: 0 }];
  if (/FROM profiles_local/.test(sql)) return [];
  throw new Error('váratlan SELECT: ' + sql);
};
exports.dbExecute = async (sql, params = []) => {
  if (/CREATE TABLE IF NOT EXISTS local_meta/.test(sql)) return;
  if (/INSERT INTO local_meta/.test(sql)) { db().meta.set(params[0], params[1]); return; }
  if (/^DELETE FROM/.test(sql.trim())) { db().torolt.push(sql); return; }
  throw new Error('váratlan EXECUTE: ' + sql);
};`,
    )
    fs.writeFileSync(path.join(tmp, 'local-mirror-owner.cjs'), t(forras))
    const mod = require_(path.join(tmp, 'local-mirror-owner.cjs'))
    return { mod, kr, db }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
}

{
  // C1: a gép tükre A-é; B a /login → /pin-setup úton MÁR beállította a saját
  // kódját; csak ezután fut a tulajdonos-ellenőrzés (AuthGate) → wipe, de B
  // kódja MARAD.
  const { mod, kr, db } = betoltMirrorOwner(MIRROR_SRC, 'c1', { tulajdonos: 'user-A' })
  kr.hasPin = true
  kr.owner = 'user-B'
  const res = await mod.ensureLocalMirrorOwner('user-B')
  assert(res.ok === true && res.wiped === true && db.torolt.length > 0, 'C1a tulajdonos-váltás: a tükör kiürül (wiped)')
  assert(kr.hasPin === true && kr.owner === 'user-B', 'C1 a BELÉPŐ frissen beállított PIN-je a wipe-ot TÚLÉLI (nem törlődik némán)')
  assert(db.meta.get('mirror_owner_user_id') === 'user-B', 'C1b az új tulajdonos bejegyezve')
}
{
  // C2: a gépen A kódja van, B lép be → a wipe az IDEGEN kódot törli.
  const { mod, kr } = betoltMirrorOwner(MIRROR_SRC, 'c2', { tulajdonos: 'user-A' })
  kr.hasPin = true
  kr.owner = 'user-A'
  const res = await mod.ensureLocalMirrorOwner('user-B')
  assert(res.ok === true && res.wiped === true && kr.hasPin === false && kr.owner === null, 'C2 tulajdonos-váltáskor az ELŐZŐ felhasználó (idegen) kódja törlődik')
}
{
  // C3: nincs kód a gépen → a wipe nem hibázik, nem hív törlést.
  const { mod, kr } = betoltMirrorOwner(MIRROR_SRC, 'c3', { tulajdonos: 'user-A' })
  kr.hasPin = false
  const res = await mod.ensureLocalMirrorOwner('user-B')
  assert(res.ok === true && res.wiped === true && !kr.calls.some((c) => c.cmd === 'auth_pin_clear'), 'C3 kód nélkül a wipe nem hív PIN-törlést, és nem hibázik')
}
{
  // C1n: feltétel nélküli clearPin (a bíráló által talált mai alak)
  const MINTA = "if ((await pinTulajdonosEllenorzes(userId)) === 'idegen') await clearPin()"
  const mutans = MIRROR_SRC.replace(MINTA, 'await clearPin()')
  if (mutans === MIRROR_SRC) {
    assert(false, 'C1n: a wipe-mutáns NEM különbözik — a negatív asszert vak')
  } else {
    const { mod, kr } = betoltMirrorOwner(mutans, 'c1n', { tulajdonos: 'user-A' })
    kr.hasPin = true
    kr.owner = 'user-B'
    await mod.ensureLocalMirrorOwner('user-B')
    assert(kr.hasPin === false, 'C1n a feltétel nélküli clearPin mutánson az őrszem BUKIK (a belépő kódja eltűnik)')
  }
}

// ── B: forrás-őrök ────────────────────────────────────────────────────────
const PIN_ENTRY = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'pages/pin-entry-page.tsx'), 'utf8'))
const LOGIN = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'pages/login-page.tsx'), 'utf8'))
const VARAZSLO = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'pages/elso-inditas-page.tsx'), 'utf8'))
const SETTINGS = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'components/settings-dialog.tsx'), 'utf8'))
const PIN_SETUP = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'pages/pin-setup-page.tsx'), 'utf8'))
const HOME = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'pages/home-page.tsx'), 'utf8'))
const ADATBIZT = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'components/settings/adat-biztonsag-panel.tsx'), 'utf8'))
const FIOK = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'components/settings/fiok-panel.tsx'), 'utf8'))
const PIN_KARTYA = kommentNelkul(fs.readFileSync(path.join(DESKTOP, 'components/settings/pin-kartya.tsx'), 'utf8'))

// B1 — pin-entry: tulajdonos-kapu + fail-closed + „Összekapcsolás újra"
function pinEntryKapuzott(src) {
  return (
    /getGepUtolsoUser\(\)/.test(src) &&
    /pinTulajdonosEllenorzes\(gepUser\.id\)/.test(src) &&
    /if \(!gepUser\) \{[\s\S]{0,200}setTulajdonos\('ismeretlen'\)/.test(src) &&
    /tulajdonos !== 'sajat'/.test(src) &&
    /\$\{ELSO_INDITAS_UT\}\?lepes=belepes`/.test(src) &&
    /Összekapcsolás újra/.test(src)
  )
}
assert(pinEntryKapuzott(PIN_ENTRY), 'B1: a PIN-belépő a gép utolsó userét egyezteti a kód tulajdonosával, ismeretlen usernél zár, és „Összekapcsolás újra" gombot ad')
assert(/offlineBelepesEngedett\(\)/.test(PIN_ENTRY), 'B1b: a PIN-belépő a remember-jelzőt PIN-hez kötve (offlineBelepesEngedett) fogadja el')
{
  const mutans = PIN_ENTRY.replace('pinTulajdonosEllenorzes(gepUser.id)', "Promise.resolve('sajat')")
  assert(mutans !== PIN_ENTRY && !pinEntryKapuzott(mutans), 'B1n: a tulajdonos-egyeztetés nélküli pin-entry mutánson az őrszem BUKIK')
}

// B2 — login-page: belépés után idegen PIN → clearPin → /pin-setup
function loginRendezi(src) {
  const i = src.indexOf('async function belepesFolytatas')
  if (i < 0) return false
  const torzs = src.slice(i, src.indexOf('async function handleSubmit'))
  return (
    /pinTulajdonosEllenorzes\(uid\)/.test(torzs) &&
    /allapot === 'idegen'[\s\S]{0,80}await clearPin\(\)[\s\S]{0,120}navigate\('\/pin-setup'/.test(torzs) &&
    /allapot === 'nincs'[\s\S]{0,80}navigate\('\/pin-setup'/.test(torzs) &&
    !/hasPin\(\)/.test(torzs)
  )
}
assert(loginRendezi(LOGIN), 'B2: a login belépés utáni ága a PIN-tulajdonost egyezteti; idegen → clearPin → /pin-setup; nincs → /pin-setup; a régi hasPin-ág eltűnt')
{
  const mutans = LOGIN.replace('await clearPin()', '/* mutáns */')
  assert(mutans !== LOGIN && !loginRendezi(mutans), 'B2n: a clearPin nélküli login-mutánson az őrszem BUKIK (az idegen kód a gépen maradna)')
}

// B3 — varázsló: belepesUtan + mount-ág rendezi az idegen PIN-t; ok=pin ágon signOut a kapcsolás ELŐTT
{
  const helper = VARAZSLO.indexOf('const idegenPinRendezes')
  const helperTorzs = helper >= 0 ? VARAZSLO.slice(helper, helper + 900) : ''
  assert(
    /pinTulajdonosEllenorzes\(uid\)/.test(helperTorzs) && /allapot === 'idegen'[\s\S]{0,60}await clearPin\(\)/.test(helperTorzs),
    'B3: a varázsló idegenPinRendezes segédje az idegen kódot törli',
  )
  const bu = VARAZSLO.indexOf('async function belepesUtan')
  const buTorzs = VARAZSLO.slice(bu, VARAZSLO.indexOf('const gyulekezetBetoltes'))
  assert(bu >= 0 && /await idegenPinRendezes\(s\.user\.id\)/.test(buTorzs), 'B3b: a belepesUtan (device-flow) ág hívja az idegen-PIN rendezést')
  const mountAg = VARAZSLO.slice(VARAZSLO.indexOf('jelolVarazsloFolyamatban(true)'), VARAZSLO.indexOf('async function inditWebesKapcsolast'))
  assert(/idegenPinRendezes\(s\.user\.id\)/.test(mountAg), 'B3c: a /login-ról visszatérő (mount) ág is rendezi az idegen PIN-t')
  const signOutIdx = mountAg.indexOf("signOut({ scope: 'local' })")
  const getSessionIdx = mountAg.indexOf('supabase.auth.getSession()')
  assert(/if \(okPin\)/.test(mountAg) && signOutIdx >= 0 && signOutIdx < getSessionIdx, 'B3d: az ok=pin (elfelejtett kód) ágon a helyi munkamenet ELDOBÁSA megelőzi a kapcsolást (brief D1)')
  assert(/<PinUrlap/.test(VARAZSLO) && !/auth_pin_set|setPin\(/.test(VARAZSLO), 'B3e: a varázsló PIN-lépése a KÖZÖS PinUrlap-ot használja (nincs második űrlap-törzs)')
}

// B3f — a 3. lépés effektje a döntő-lap (tukorDontes) alatt NEM indít újra betöltést
function lepes3EffektKapuzott(src) {
  const i = src.indexOf('if (lepes !== 2 || !user')
  if (i < 0) return false
  const feltetel = src.slice(i, src.indexOf('\n', i))
  const depsI = src.indexOf('[lepes, user, profil, gyulFut, gyulHiba', i)
  const deps = depsI >= 0 ? src.slice(depsI, src.indexOf(']', depsI)) : ''
  // A hívás mikrotaszkból (a betöltés első sora szinkron setState — effektben tilos).
  const torzs = src.slice(i, depsI > 0 ? depsI : i + 600)
  return /\|\| tukorDontes\) return/.test(feltetel) && /\btukorDontes\b/.test(deps) && /queueMicrotask\(/.test(torzs)
}
assert(lepes3EffektKapuzott(VARAZSLO), 'B3f: a gyülekezet-lépés effektje a döntő-lap alatt nem indít újra (feltétel + függőség), és mikrotaszkból hív')
{
  const kilepI = VARAZSLO.indexOf('async function kilep()')
  const kilepTorzs = kilepI >= 0 ? VARAZSLO.slice(kilepI, VARAZSLO.indexOf('function pinMentve')) : ''
  assert(/setTukorDontes\(null\)/.test(kilepTorzs) && /clearLastUser\(\)/.test(kilepTorzs), 'B3f2: a kilep() a tükör-döntést és a gép utolsó userét is törli (a következő fiók tiszta lapról indul)')
  const mutans = VARAZSLO.replace('|| gyulHiba || tukorDontes) return', '|| gyulHiba) return')
  assert(mutans !== VARAZSLO && !lepes3EffektKapuzott(mutans), 'B3fn: a tukorDontes-feltétel nélküli mutánson az őrszem BUKIK (végtelen újrahívás)')
}

// B3g — MINDEN signOut a varázslóban és a loginon scope:'local' (a globális a lelkész összes eszközét kilőné)
function mindenSignOutHelyi(src) {
  const hivasok = [...src.matchAll(/signOut\(([^)]*)\)/g)]
  return hivasok.length > 0 && hivasok.every((m) => /scope:\s*'local'/.test(m[1]))
}
assert(mindenSignOutHelyi(VARAZSLO) && [...VARAZSLO.matchAll(/signOut\(/g)].length >= 2, "B3g: a varázsló minden signOut-ja (ok=pin ág + Másik fiók) scope: 'local'")
assert(mindenSignOutHelyi(LOGIN), `B3g2: a login MFA „Mégse" ága is scope: 'local'-lal jelentkezik ki`)
{
  const mutans = VARAZSLO.replace("getDesktopSupabase().auth.signOut({ scope: 'local' })", 'getDesktopSupabase().auth.signOut()')
  assert(mutans !== VARAZSLO && !mindenSignOutHelyi(mutans), 'B3gn: a paraméter nélküli (globális) signOut mutánson az őrszem BUKIK')
}

// B4 — settings: 'fiok' fül ELSŐ + FiokPanel bekötve + alapértelmezett
function fiokFulElso(src) {
  const elsoTrigger = src.match(/<TabsTrigger value="([a-z]+)"/)
  return Boolean(elsoTrigger && elsoTrigger[1] === 'fiok') && /<TabsContent value="fiok"/.test(src) && /<FiokPanel/.test(src)
}
assert(fiokFulElso(SETTINGS), "B4: a Beállítások 'fiok' füle a lista ELSŐ eleme, FiokPanel-lel")
assert(/useState<string>\(initialTab \?\? 'fiok'\)/.test(SETTINGS), 'B4b: az alapértelmezett fül a Fiók / Kapcsolat')
assert(!/Kijelentkezés minden eszközön \(hamarosan\)/.test(SETTINGS), 'B4c: a „Kijelentkezés minden eszközön (hamarosan)" letiltott gomb eltűnt (a Fiók fülön ÉL)')
{
  const mutans = SETTINGS.replace(/<TabsTrigger value="fiok"[\s\S]*?<\/TabsTrigger>\s*/, '')
  assert(mutans !== SETTINGS && !fiokFulElso(mutans), "B4n: a 'fiok' fül nélküli mutánson az őrszem BUKIK")
}

// B5 — pin-setup: „Később" törli a reset-jelzőt; a szöveg a valós útra mutat
function keseobbTorol(src) {
  const i = src.indexOf('function handleSkip')
  if (i < 0) return false
  const torzs = src.slice(i, i + 400)
  return /clearPinResetPending\(\)[\s\S]{0,120}navigate\(/.test(torzs)
}
assert(keseobbTorol(PIN_SETUP), 'B5: a pin-setup „Később" ága törli a kartoteka-pin-reset-pending jelzőt (desk-auth-14)')
assert(/Fiók \/ Kapcsolat/.test(PIN_SETUP) && !/Adat & biztonság menüben/.test(PIN_SETUP), 'B5b: a „Később" szövege a valós helyre (Beállítások → Fiók / Kapcsolat) mutat')
assert(/<PinUrlap/.test(PIN_SETUP) && /setPin\(pin, userId\)/.test(PIN_KARTYA), 'B5c: a PinSetupPage a közös PinUrlap-ot használja, amely a kódot a userhez kötve írja')
{
  const mutans = PIN_SETUP.replace(/function handleSkip\(\) \{[\s\S]*?clearPinResetPending\(\)\n/, 'function handleSkip() {\n')
  assert(mutans !== PIN_SETUP && !keseobbTorol(mutans), 'B5n: a jelző-törlés nélküli pin-setup mutánson az őrszem BUKIK')
}

// B6 — főoldal: „Kapcsolat állapota" a „Fejlesztői állapot" helyett, a Fiók fülre mutató gombbal
assert(!/Fejlesztői állapot/.test(HOME) && !/navigate\('\/dev'\)/.test(HOME), 'B6: a főoldalon nincs többé „Fejlesztői állapot" doboz / /dev gomb')
assert(/Kapcsolat állapota/.test(HOME) && /'kartoteka:open-settings'[^\n]*tab: 'fiok'/.test(HOME), `B6b: a főoldal „Kapcsolat állapota" kártyája a Beállítások 'fiok' fülét nyitja`)
assert(/getOutboxStats\(\)/.test(HOME) && /getOutboxSyncStatus\(\)/.test(HOME) && /analyzeSession\(/.test(HOME), 'B6c: a kártya a meglévő forrásokból él (outbox-statisztika, outbox-futás, analyzeSession)')
assert(/offlineBelepesEngedett\(\)/.test(HOME), 'B6d: a főoldal a helyi munkamenetet PIN-hez kötve ellenőrzi')

// B7 — Adat & biztonság: a /dev link ide költözött, a 2FA-kártya innen a Fiók fülre
assert(/navigate\('\/dev'\)/.test(ADATBIZT) && !/Kétlépcsős belépés/.test(ADATBIZT), 'B7: az Adat & biztonság alján a fejlesztői eszközök linkje; a 2FA-kártya nincs itt')

// B8 — fiok-panel tartalma
assert(
  /<PinKartya/.test(FIOK) && /torolVarazsloKesz\(/.test(FIOK) && /analyzeSession\(/.test(FIOK) && /\?lepes=belepes/.test(FIOK) &&
    /pullOwnProfile\(/.test(FIOK) && /pullOwnCongregation\(/.test(FIOK) && /Kétlépcsős belépés/.test(FIOK) && /scope: 'others'/.test(FIOK),
  'B8: a Fiók / Kapcsolat panel: PIN-kártya, varázsló újrafuttatás, munkamenet (Online belépés + más eszközök kijelentkeztetése), Újraellenőrzés, 2FA-útjelző',
)
assert(!/\b(bg|text|border)-(slate|white)\b/.test(FIOK.replace(/dark:[a-z-/0-9]+/g, '')), 'B8b: a fiok-panel csak téma-tokeneket használ (nincs hardkódolt slate/white)')

console.log(`\n${total - failedCount}/${total} teszt zöld`)
if (failedCount > 0) {
  console.error('❌ FAIL — desktop PIN-tulajdonos / Fiók fül őrszemek')
  process.exit(1)
}
console.log('✅ PASS — desktop PIN-tulajdonos / Fiók fül őrszemek')
process.exit(0)
