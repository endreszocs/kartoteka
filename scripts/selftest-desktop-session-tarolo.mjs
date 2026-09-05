// selftest-desktop-session-tarolo.mjs — az asztali munkamenet-tároló őrszeme
//
// ⛔ MI VOLT A HIBA (2026-09-03 felülvizsgálat P0, 2026-09-05 bizonyítva)
//   A közös createKartotekaBrowserClient a @supabase/ssr createBrowserClient-jét
//   hívta az asztali app keyring-adapterével is — az ssr viszont a saját
//   süti-tárolóját ÍRJA RÁ az átadott `auth.storage`-ra. A desktop-munkamenet
//   így a WebView sütijében élt, a keyring-adapter (és a Rust auth.rs) halott
//   kód volt — miközben a dokumentáció az ellenkezőjét állította.
//
// ŐRSZEMEK
//   T1   authOptions-szel a kliens auth-tárolója PONTOSAN az átadott adapter
//   T2   authOptions nélkül (web) a kliens NEM az átadott adaptert használja
//        (nem is kap ilyet) — az ssr-út érintetlen
//   T1n  negatív: a RÉGI (ssr-es) ág mutánsán az őrszem BUKIK — vagyis a
//        teszt tényleg a felülírást méri, nem csak a kód szövegét
//   F1   forrás-őr: az asztali ág a @supabase/supabase-js createClient-jét
//        használja, nem az ssr-t

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

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

// A böngésző-környezet minimuma az ssr isBrowser()-éhez (window + document).
globalThis.window = globalThis.window ?? { location: { href: 'http://localhost/' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = globalThis.document ?? { cookie: '' }
if (!globalThis.localStorage) {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
  }
}

const SRC = path.join(ROOT, 'packages/supabase-client/src/browser.ts')
const forras = fs.readFileSync(SRC, 'utf8')

function betolt(src) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-dst-'))
  try {
    const js = ts
      .transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
      .outputText.replace(/require\(["']@supabase\/ssr["']\)/g, `require(${JSON.stringify(path.join(ROOT, 'node_modules/@supabase/ssr'))})`)
      .replace(/require\(["']@supabase\/supabase-js["']\)/g, `require(${JSON.stringify(path.join(ROOT, 'node_modules/@supabase/supabase-js'))})`)
    fs.writeFileSync(path.join(tmp, 'browser.cjs'), js)
    return require_(path.join(tmp, 'browser.cjs'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const URL_ = 'https://example.supabase.co'
const KEY = 'anon-teszt-kulcs'

const adapter = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
}

// T1 — a mai forrás
{
  const mod = betolt(forras)
  const client = mod.createKartotekaBrowserClient({
    url: URL_,
    anonKey: KEY,
    authOptions: { storage: adapter, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
  assert(mod.authStorageOf(client) === adapter, 'T1: authOptions-szel a kliens auth-tárolója PONTOSAN az átadott (keyring) adapter')
  const web = mod.createKartotekaBrowserClient({ url: URL_, anonKey: KEY })
  assert(mod.authStorageOf(web) !== adapter && mod.authStorageOf(web) != null, 'T2: authOptions nélkül (web) saját, könyvtári tároló — az ssr-út érintetlen')
}

// T1n — a RÉGI ág mutánsa: az asztali ágon is az ssr createBrowserClient fut
{
  const mutans = forras.replace(
    /return createSupabaseJsClient\(config\.url, config\.anonKey, \{[\s\S]*?\n    \}\)\n  \}/,
    'return createBrowserClient(config.url, config.anonKey, { auth: config.authOptions })\n  }',
  )
  assert(mutans !== forras, 'T1n-előfeltétel: a mutáns tényleg különbözik')
  const mod = betolt(mutans)
  const client = mod.createKartotekaBrowserClient({
    url: URL_,
    anonKey: KEY,
    authOptions: { storage: adapter, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
  assert(mod.authStorageOf(client) !== adapter, 'T1n: a régi (ssr-es) ágon az adapter ELVÉSZ — az őrszem tényleg a felülírást méri')
}

// F1 — forrás-őr
{
  const asztaliAg = forras.slice(forras.indexOf('if (config.authOptions)'))
  assert(/createSupabaseJsClient\(config\.url, config\.anonKey/.test(asztaliAg), 'F1: az asztali ág a nyers supabase-js createClient-et hívja')
  assert(!/createBrowserClient\(config\.url, config\.anonKey, \{\s*auth: config\.authOptions/.test(forras), 'F1n: az ssr-es authOptions-átadás eltűnt a forrásból')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
// EXPLICIT KILÉPÉS: a webes (ssr) kliens auto-refresh időzítője Node alatt örökké életben tartaná a folyamatot.
process.exit(failedCount > 0 ? 1 : 0)
