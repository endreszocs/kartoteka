// selftest-desktop-keyring-darabolas.mjs — az asztali kulcstár-darabolás őrszeme
//
// ⛔ MI VOLT A HIBA (2026-09-05, desktop-brief 2.1 „KEYRING-BLOB LIMIT", P0)
//   A Windows Credential Manager egy bejegyzésben legfeljebb 2560 bájtot tárol
//   (windows-sys CRED_MAX_CREDENTIAL_BLOB_SIZE); a keyring 3.6.3 a jelszót
//   UTF-16-ban méri (windows.rs: encode_utf16().count()*2 > 2560 → TooLong).
//   A Supabase-session JSON (két JWT + user-objektum) ennél jóval nagyobb, a
//   régi auth_store_item egyetlen set_password-del írt → TooLong → a TS-adapter
//   console.error-ral elnyelte → a munkamenet NEM perzisztált, minden indításnál
//   újra kellett volna kapcsolni. A darabolás (auth.rs) ezt oldja meg; a TS-
//   adapter hibája pedig állapotba kerül (getUtolsoKulcstarHiba), és az
//   örökölt ssr-süti egyszer törlődik (torolOrokoltSutiket).
//
//   + A félbeszakadt előző futás (2026-09-05 hajnal) darabolója az írás UTÁNI
//   takarítást a 0. daraptól indította → a frissen írt darabokat is törölte.
//   Ezt a sorrendet a Rust-tesztek mérik (MemTar), itt forrás-őr védi (R4).
//
// A tényleges round-trip a Rust unit-tesztekben fut (cargo test auth — PowerShell,
// CARGO_TARGET_DIR=C:\kartoteka-target); ez a fájl a JELENLÉTET és a SORRENDET
// őrzi a forrásban, a TS-adaptert pedig valóban futtatja (transpile + stub).
//
// ŐRSZEMEK
//   R1   auth.rs: plafon-konstans (2560) + CHUNK_UTF16 (1000) + '.n' fejléc
//   R2   tarol(): darabol (chunk_value), darabonként ír, a fejlécet UTOLJÁRA írja
//   R3   olvas(): join_chunks (bármely hiányzó darab → None + takarítás), fejléc
//        nélkül a sima kulcsra esik (régi alak); a 3 command a darabolót hívja
//   R4   az írás utáni takarítás a FRISS darabszámtól indul (nem 0-tól)
//   R5   a regressziós Rust-tesztek jelen vannak
//   R1n  negatív: a RÉGI (egyetlen set_password) command-mutáns BUKIK
//   R2n  negatív: a darabolás nélküli tarol()-mutáns BUKIK
//   R4n  negatív: a 0-tól induló takarítás-mutáns BUKIK
//   S1   supabase.ts: torolOrokoltSutiket() a kliens létrehozása ELŐTT (sorrend)
//   S1n  negatív: a hívás nélküli mutáns BUKIK
//   S2   viselkedés: az sb-…-auth-token(.N / -code-verifier) sütik törlődnek,
//        a többi marad; a jelző után a takarítás nem ír többé (egyszeri)
//   S2b  viselkedés: a kliens-gyár maga is elvégzi a takarítást
//   S3   viselkedés: setItem-hiba → getUtolsoKulcstarHiba() kitöltve, console.error MARAD
//   S3n  negatív: a néma (állapot nélküli) adapter-mutánson az állapot üres marad

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

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

const AUTH_RS = path.join(ROOT, 'apps/desktop/src-tauri/src/auth.rs')
const SUPA_TS = path.join(ROOT, 'apps/desktop/src/lib/supabase.ts')

const rustForras = fs.readFileSync(AUTH_RS, 'utf8')
const tsForras = fs.readFileSync(SUPA_TS, 'utf8')

/** Kommentek nélkül mérünk — a fejléc-komment is leírja a darabolást, az nem kód. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Egy függvény törzse a fejléc utáni első '{'-tól a záró '}'-ig (zárójel-számlálás). */
function fnTorzs(src, fej) {
  const start = src.indexOf(fej)
  if (start < 0) return null
  const nyit = src.indexOf('{', start)
  if (nyit < 0) return null
  let melyseg = 0
  for (let i = nyit; i < src.length; i++) {
    if (src[i] === '{') melyseg += 1
    else if (src[i] === '}') {
      melyseg -= 1
      if (melyseg === 0) return { start, nyit, veg: i + 1, torzs: src.slice(nyit, i + 1) }
    }
  }
  return null
}

/** A törzs cseréje egy másikra (mutánsokhoz). */
function cserelTorzs(src, fej, ujTorzs) {
  const t = fnTorzs(src, fej)
  if (!t) return src
  return src.slice(0, t.nyit) + ujTorzs + src.slice(t.veg)
}

// ── Rust forrás-őrök ─────────────────────────────────────────────────────

function rustOrszemek(src) {
  const kod = stripComments(src)
  const hibak = []

  if (!/const CRED_MAX_CREDENTIAL_BLOB_SIZE:\s*usize\s*=\s*2560/.test(kod))
    hibak.push('R1: nincs CRED_MAX_CREDENTIAL_BLOB_SIZE = 2560 plafon-konstans')
  if (!/const CHUNK_UTF16:\s*usize\s*=\s*1000/.test(kod)) hibak.push('R1: nincs CHUNK_UTF16 = 1000 darab-méret')
  if (!/const CHUNK_HEADER_SUFFIX:\s*&str\s*=\s*"\.n"/.test(kod)) hibak.push("R1: nincs '.n' fejléc-utótag")

  const tarol = fnTorzs(kod, 'pub(crate) fn tarol(')
  if (!tarol) hibak.push('R2: nincs tarol() függvény')
  else {
    const t = tarol.torzs
    if (!/chunk_value\(/.test(t)) hibak.push('R2: a tarol() nem darabol (nincs chunk_value hívás)')
    if (!/for \(i, part\) in parts\.iter\(\)\.enumerate\(\)[\s\S]*?tar\.ir\(&chunk_key\(sanitized, i\), part\)/.test(t))
      hibak.push('R2: a tarol() nem írja darabonként a bejegyzéseket')
    if (
      !/tar\.ir\(&chunk_key\(sanitized, i\), part\)[\s\S]*?tar\.ir\(&header_key\(sanitized\), &parts\.len\(\)\.to_string\(\)\)/.test(
        t,
      )
    )
      hibak.push('R2: a fejléc nem a darabok UTÁN íródik')
    const takaritasok = [...t.matchAll(/torol_darabokat\(tar, sanitized, ([^,]+),/g)].map((m) => m[1].trim())
    if (takaritasok.length === 0 || takaritasok[takaritasok.length - 1] !== 'parts.len()')
      hibak.push(
        `R4: az írás utáni takarítás nem a friss darabszámtól indul (utolsó hívás kezdő-indexe: ${takaritasok.at(-1) ?? 'nincs'})`,
      )
  }

  const olvas = fnTorzs(kod, 'pub(crate) fn olvas(')
  if (!olvas) hibak.push('R3: nincs olvas() függvény')
  else {
    if (!/join_chunks\(&parts\)/.test(olvas.torzs)) hibak.push('R3: az olvas() nem a join_chunks-szal fűz')
    if (!/None\s*=>\s*\{[\s\S]*?torol_mindent\(tar, sanitized\)\?;[\s\S]*?Ok\(None\)/.test(olvas.torzs))
      hibak.push('R3: az olvas() hiányzó darabnál nem fail-closed (None + takarítás)')
    if (!/else\s*\{[\s\S]*?return tar\.olvas\(sanitized\);/.test(olvas.torzs))
      hibak.push('R3: az olvas() fejléc nélkül nem a sima kulcsra esik (régi, darabolatlan alak)')
  }

  const store = fnTorzs(kod, 'pub fn auth_store_item(')
  if (!store) hibak.push('R3: nincs auth_store_item command')
  else if (!/tarol\(&OsKulcstar, &sanitized, &value\)/.test(store.torzs) || /set_password/.test(store.torzs))
    hibak.push('R3: az auth_store_item nem a daraboló tarol()-t hívja (közvetlen set_password)')
  const read = fnTorzs(kod, 'pub fn auth_read_item(')
  if (!read || !/olvas\(&OsKulcstar, &sanitized\)/.test(read.torzs)) hibak.push('R3: az auth_read_item nem a daraboló olvas()-t hívja')
  const clear = fnTorzs(kod, 'pub fn auth_clear_item(')
  if (!clear || !/torol_mindent\(&OsKulcstar, &sanitized\)/.test(clear.torzs))
    hibak.push('R3: az auth_clear_item nem törli a fejlécet + minden darabot (torol_mindent)')

  if (!/fn a_takaritas_nem_torli_a_friss_darabokat\(\)/.test(src)) hibak.push('R5: hiányzik a friss-darab takarítás regressziós Rust-teszt')
  if (!/fn tarol_olvas_round_trip_4000_karakter_unicode\(\)/.test(src)) hibak.push('R5: hiányzik a 4000 karakteres unicode round-trip Rust-teszt')
  if (!/fn hianyzo_darab_fail_closed_none_es_a_roncs_eltakaritva\(\)/.test(src)) hibak.push('R5: hiányzik a hiányzó-darab fail-closed Rust-teszt')

  return hibak
}

{
  const hibak = rustOrszemek(rustForras)
  for (const h of hibak) console.error(`  → ${h}`)
  assert(hibak.length === 0, 'R1–R5: auth.rs darabol (2560/1000/.n), fejléc utoljára, fail-closed olvasás, takarítás a friss darabszámtól, Rust-tesztek jelen')
}

// R1n — a RÉGI command: egyetlen set_password, darabolás nélkül
{
  const mutans = cserelTorzs(
    rustForras,
    'pub fn auth_store_item(',
    '{\n    let sanitized = sanitize_key(&key)?;\n    OsKulcstar::entry(&sanitized)?.set_password(&value).map_err(|e| e.to_string())\n}',
  )
  assert(mutans !== rustForras, 'R1n-előfeltétel: a command-mutáns különbözik')
  assert(rustOrszemek(mutans).some((h) => h.startsWith('R3: az auth_store_item')), 'R1n: a RÉGI (egyetlen set_password) command-mutánson az őrszem BUKIK')
}

// R2n — tarol() darabolás nélkül (egyetlen bejegyzés)
{
  const mutans = cserelTorzs(rustForras, 'pub(crate) fn tarol(', '{\n    tar.ir(sanitized, value)\n}')
  assert(mutans !== rustForras, 'R2n-előfeltétel: a tarol()-mutáns különbözik')
  assert(rustOrszemek(mutans).some((h) => h.startsWith('R2:')), 'R2n: a darabolás nélküli tarol()-mutánson az őrszem BUKIK')
}

// R4n — a félbeszakadt futás hibája: takarítás 0-tól az írás után
{
  const mutans = rustForras.replace('torol_darabokat(tar, sanitized, parts.len(), korabbi)', 'torol_darabokat(tar, sanitized, 0, korabbi)')
  assert(mutans !== rustForras, 'R4n-előfeltétel: a takarítás-mutáns különbözik')
  assert(rustOrszemek(mutans).some((h) => h.startsWith('R4:')), 'R4n: a 0-tól induló (friss darabokat törlő) takarítás-mutánson az őrszem BUKIK')
}

// ── TS forrás-őrök ───────────────────────────────────────────────────────

function tsOrszemek(src) {
  const kod = stripComments(src)
  const hibak = []
  const gyar = fnTorzs(kod, 'export function getDesktopSupabase(')
  if (!gyar) hibak.push('S1: nincs getDesktopSupabase()')
  else {
    const a = gyar.torzs.indexOf('torolOrokoltSutiket()')
    const b = gyar.torzs.indexOf('createKartotekaBrowserClient(')
    if (a < 0) hibak.push('S1: a kliens-gyár nem hívja a torolOrokoltSutiket()-et')
    else if (b < 0 || a > b) hibak.push('S1: a torolOrokoltSutiket() nem a kliens létrehozása ELŐTT fut')
  }
  if (!/export function torolOrokoltSutiket\(/.test(kod)) hibak.push('S1: nincs exportált torolOrokoltSutiket()')
  if (!/export function getUtolsoKulcstarHiba\(/.test(kod)) hibak.push('S3: nincs exportált getUtolsoKulcstarHiba()')
  const set = fnTorzs(kod, 'async setItem(')
  if (!set || !/jegyezKulcstarHibat\('setItem'/.test(set.torzs)) hibak.push('S3: a setItem hibája néma (nincs kulcstár-hiba állapot)')
  return hibak
}

{
  const hibak = tsOrszemek(tsForras)
  for (const h of hibak) console.error(`  → ${h}`)
  assert(hibak.length === 0, 'S1: supabase.ts — torolOrokoltSutiket() a kliens előtt, exportált hiba-állapot, hangos setItem')
}

{
  const mutans = tsForras.replace(/^\s*torolOrokoltSutiket\(\)\s*$/m, '')
  assert(mutans !== tsForras, 'S1n-előfeltétel: a süti-takarítás nélküli mutáns különbözik')
  assert(tsOrszemek(mutans).some((h) => h.startsWith('S1:')), 'S1n: a takarítás-hívás nélküli mutánson az őrszem BUKIK')
}

// ── TS viselkedés (transpile + stubok) ───────────────────────────────────

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a viselkedési őrszemek kihagyva (nem hiba).')
  console.log(`\n${total - failedCount}/${total} teszt zöld`)
  process.exit(failedCount > 0 ? 1 : 0)
}

/** A supabase.ts betöltése ADOTT forrással; a Tauri-invoke és a kliens-gyár stub. */
function betoltSupabaseTs(src) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-keyring-'))
  try {
    fs.writeFileSync(path.join(tmp, 'tauri-core.cjs'), 'module.exports = { invoke: (...a) => globalThis.__kartotekaInvoke(...a) }')
    fs.writeFileSync(
      path.join(tmp, 'supabase-client.cjs'),
      'module.exports = { createKartotekaBrowserClient: (cfg) => ({ __cfg: cfg }) }',
    )
    const js = ts
      .transpileModule(src.replace(/import\.meta\.env/g, 'globalThis.__viteEnv'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/require\(["']@tauri-apps\/api\/core["']\)/g, `require(${JSON.stringify(path.join(tmp, 'tauri-core.cjs'))})`)
      .replace(/require\(["']@kartoteka\/supabase-client["']\)/g, `require(${JSON.stringify(path.join(tmp, 'supabase-client.cjs'))})`)
    fs.writeFileSync(path.join(tmp, 'supabase.cjs'), js)
    return require_(path.join(tmp, 'supabase.cjs'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Minimális süti-tár: a document.cookie getter/setter böngésző-szemantikával (lejárt → törlés). */
function sutiTar(kezdeti) {
  const jar = new Map(Object.entries(kezdeti))
  let irasok = 0
  const doc = {}
  Object.defineProperty(doc, 'cookie', {
    get() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set(s) {
      irasok += 1
      const [par, ...attrs] = String(s)
        .split(';')
        .map((x) => x.trim())
      const eq = par.indexOf('=')
      const nev = eq < 0 ? par : par.slice(0, eq)
      const lejart = attrs.some(
        (a) => /^max-age=0$/i.test(a) || (/^expires=/i.test(a) && new Date(a.slice(8)).getTime() < Date.now()),
      )
      if (lejart) jar.delete(nev)
      else jar.set(nev, eq < 0 ? '' : par.slice(eq + 1))
    },
  })
  return { doc, jar, irasok: () => irasok }
}

function ujKornyezet(sutik) {
  const tar = sutiTar(sutik)
  globalThis.document = tar.doc
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
  }
  globalThis.__viteEnv = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-teszt' }
  return { ...tar, mem }
}

const OROKOLT_SUTIK = {
  'sb-abcdefghijklmnopqrst-auth-token': 'base64-eyJhY2Nlc3M',
  'sb-abcdefghijklmnopqrst-auth-token.0': 'darab0',
  'sb-abcdefghijklmnopqrst-auth-token.1': 'darab1',
  'sb-abcdefghijklmnopqrst-auth-token-code-verifier': 'pkce',
  'kartoteka-tema': 'kert',
}

// S2 — a takarítás viselkedése
{
  const k = ujKornyezet(OROKOLT_SUTIK)
  globalThis.__kartotekaInvoke = async () => null
  const mod = betoltSupabaseTs(tsForras)
  const r = mod.torolOrokoltSutiket()
  assert(r.torolt.length === 4 && r.maradt.length === 0, `S2: 4 örökölt süti törölve, 0 maradt (kapott: ${r.torolt.length}/${r.maradt.length})`)
  assert(![...k.jar.keys()].some((n) => n.startsWith('sb-')), 'S2: az sb-…-auth-token, .0/.1 és -code-verifier sütik eltűntek a tárból')
  assert(k.jar.has('kartoteka-tema'), 'S2: a nem Supabase-süti érintetlen')
  assert(k.mem.has('kartoteka-suti-takaritas-v1'), 'S2: a takarítás jelzője beállt (tiszta tár után)')
  const elotte = k.irasok()
  const r2 = mod.torolOrokoltSutiket()
  assert(k.irasok() === elotte && r2.torolt.length === 0, 'S2: a jelző után a takarítás nem ír többé sütit (egyszeri, idempotens)')
}

// S2b — a kliens-gyár maga is takarít
{
  const k = ujKornyezet(OROKOLT_SUTIK)
  globalThis.__kartotekaInvoke = async () => null
  const mod = betoltSupabaseTs(tsForras)
  const client = mod.getDesktopSupabase()
  assert(client?.__cfg?.authOptions?.storage != null, 'S2b: a kliens a keyring-adapterrel jön létre')
  assert(![...k.jar.keys()].some((n) => n.startsWith('sb-')), 'S2b: a getDesktopSupabase() a kliens előtt eltakarította az örökölt sütiket')
}

// S3 — setItem-hiba → látható állapot
{
  ujKornyezet({})
  globalThis.__kartotekaInvoke = async () => {
    throw "Keyring 'auth-sb-abcdefghijklmnopqrst-auth-token' mentés sikertelen: TooLong"
  }
  const mod = betoltSupabaseTs(tsForras)
  const storage = mod.getDesktopSupabase().__cfg.authOptions.storage
  assert(mod.getUtolsoKulcstarHiba() === null, 'S3: induláskor nincs kulcstár-hiba')
  const eredeti = console.error
  let hivva = 0
  console.error = () => {
    hivva += 1
  }
  try {
    await storage.setItem('sb-abcdefghijklmnopqrst-auth-token', '{"access_token":"x"}')
  } finally {
    console.error = eredeti
  }
  const h = mod.getUtolsoKulcstarHiba()
  assert(h?.muvelet === 'setItem' && /TooLong/.test(h?.uzenet ?? ''), 'S3: setItem-hiba → getUtolsoKulcstarHiba() a Rust-üzenettel kitöltve')
  assert(h?.kulcs === 'sb-abcdefghijklmnopqrst-auth-token' && h?.darab === 1, 'S3: a hiba kulcsa + sorszáma rögzítve')
  assert(hivva === 1, 'S3: a console.error MARAD (egyszer, a hibánál)')
}

// S3n — a néma adapter-mutáns: csak console.error, állapot nélkül
{
  const mutans = tsForras.replace(/jegyezKulcstarHibat\('setItem', key, e\)/, "console.error('[auth] keyring setItem sikertelen:', e)")
  assert(mutans !== tsForras, 'S3n-előfeltétel: a néma mutáns különbözik')
  assert(tsOrszemek(mutans).some((h) => h.startsWith('S3:')), 'S3n: a néma setItem-mutánson a forrás-őr BUKIK')
  ujKornyezet({})
  globalThis.__kartotekaInvoke = async () => {
    throw 'TooLong'
  }
  const mod = betoltSupabaseTs(mutans)
  const storage = mod.getDesktopSupabase().__cfg.authOptions.storage
  const eredeti = console.error
  console.error = () => {}
  try {
    await storage.setItem('sb-x-auth-token', 'v')
  } finally {
    console.error = eredeti
  }
  assert(mod.getUtolsoKulcstarHiba() === null, 'S3n: a néma mutánson az állapot üres marad — az S3 őrszem tényleg a jelzést méri')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
