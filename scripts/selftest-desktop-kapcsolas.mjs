// selftest-desktop-kapcsolas.mjs — az asztali eszköz-kapcsolás (device-flow) őrszemei
//
// ⛔ MI A KOCKÁZAT (2026-09-05)
//   Az asztali app jelszó nélkül, a webes fiókon át kap munkamenetet. A lánc
//   több ponton törhet némán: (1) a kód-aritmetika a két oldalon széthúz
//   (más hash → a szerver sosem találja a sort; más ellenőrző kód → a lelkész
//   soha nem hagy jóvá); (2) a Tauri CSP nem engedi a webes origót (a fetch
//   némán elhal, a képernyő örökké „várakozik"); (3) a webes API-útvonalat a
//   proxy bejelentkezésre irányítja (JSON helyett HTML-t kap az app);
//   (4) a webview CORS-előkérése Allow-Origin nélkül bukik → az app hamisan
//   „nincs internet"-et mond; (5) a `nyit` átirányítás Railway mögött a belső
//   localhost:8080-ra küldi a böngészőt → a jóváhagyó oldal soha nem nyílik meg;
//   (6) a spam-fék globális kapuja csak az IP-nélküli ágon fut → forgó hamis
//   x-forwarded-for-ral a tábla korlátlanul tölthető.
//
// ŐRSZEMEK
//   K1–K5  kód-aritmetika: alak, hossz, egyediség, determinisztikus hash és
//          ellenőrző kód, a hash ≠ ellenőrző-domén
//   K6n    negatív: egy elgépelt (42 karakteres) kód NEM érvényes
//   C1/C1n Tauri CSP connect-src tartalmazza a kartoteka.app-ot (+ mutáns)
//   M1     a proxy-middleware átengedi az /api/desktop-kapcsolas/ útvonalat
//   M2–M3  CORS: OPTIONS 204 + Allow-Origin a Tauri origókra; a 400-as válasz
//          is hordja; idegen origó NEM kap Allow-Origin-t; Origin nélkül sem
//   M2n    negatív: az OPTIONS export nélküli route-mutánson BUKIK
//   M2cn   negatív: az allowlist nélküli cors-mutáns idegen origónak is ad
//   O1–O5  getPublicOrigin: env → x-forwarded-host → host → kérés-URL; láncolt fejléc
//   O1n    negatív: a `request.url`-ből induló mutánson BUKIK
//   N1/N1n a nyit route a getPublicOrigin-t használja, NEM a nextUrl.origin-t
//   S1–S5  SQL-forrásőrök: RLS, kizart_titok, explicit REVOKE az authenticated-től
//          a GRANT ELŐTT (a 2026-04-23-as default privileges öröksége ellen), anon semmi
//   S3n    negatív: a REVOKE authenticated nélküli mutánson BUKIK
//   W1/W1n a token_hash az igényléskor NULL-ra íródik (egyszer használatos)
//   W2     a szerver-réteg nem naplózza a kódot/tokent
//   W3–W3d spam-fék: a GLOBÁLIS kapu IP-vel is fut; per-IP 30; névtelen vödör 60
//   W3n    negatív: a globális kapu nélküli mutánson az őr BUKIK

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

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText

const olvas = (p) => fs.readFileSync(p, 'utf8')

/** TS-kommentek nélkül — hogy egy kommentbe írt minta ne tévessze meg az őrt. */
function kommentNelkul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((s) => {
      const tr = s.trim()
      return !tr.startsWith('//') && !tr.startsWith('*')
    })
    .join('\n')
}

// ── Műhely: TS → CJS ideiglenes mappába, a projekt-importok átírásával ────
const WEB = path.join(ROOT, 'apps/web')
const KOD_SRC = path.join(ROOT, 'packages/supabase-client/src/desktop-kapcsolas-kod.ts')
const SZERVER_SRC = path.join(WEB, 'lib/desktop-kapcsolas/szerver.ts')
const CORS_SRC = path.join(WEB, 'lib/desktop-kapcsolas/cors.ts')
const ORIGIN_SRC = path.join(WEB, 'lib/utils/public-origin.ts')
const IPHASH_SRC = path.join(WEB, 'lib/utils/ip-hash.ts')
const INDITAS_SRC = path.join(WEB, 'app/api/desktop-kapcsolas/inditas/route.ts')
const ALLAPOT_SRC = path.join(WEB, 'app/api/desktop-kapcsolas/allapot/route.ts')
const NYIT_SRC = path.join(WEB, 'app/api/desktop-kapcsolas/nyit/route.ts')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-dk-'))
const ir = (nev, js) => {
  const p = path.join(tmp, nev)
  fs.writeFileSync(p, js)
  return p
}
const atir = (js, extra = {}) =>
  js
    .replace(/require\(["']server-only["']\)/g, `require(${JSON.stringify(path.join(tmp, 'server-only.cjs'))})`)
    .replace(/require\(["']@\/lib\/supabase\/admin-client["']\)/g, `require(${JSON.stringify(path.join(tmp, 'admin-client.cjs'))})`)
    .replace(/require\(["']@\/lib\/utils\/ip-hash["']\)/g, `require(${JSON.stringify(path.join(tmp, 'ip-hash.cjs'))})`)
    .replace(/require\(["']@\/lib\/utils\/public-origin["']\)/g, `require(${JSON.stringify(path.join(tmp, 'public-origin.cjs'))})`)
    .replace(/require\(["']@\/lib\/desktop-kapcsolas\/cors["']\)/g, `require(${JSON.stringify(path.join(tmp, extra.cors ?? 'cors.cjs'))})`)
    .replace(/require\(["']@\/lib\/desktop-kapcsolas\/szerver["']\)/g, `require(${JSON.stringify(path.join(tmp, 'szerver-stub.cjs'))})`)
    .replace(/require\(["']@kartoteka\/supabase-client["']\)/g, `require(${JSON.stringify(path.join(tmp, 'kod.cjs'))})`)
    .replace(/require\(["']next\/server["']\)/g, `require(${JSON.stringify(path.join(tmp, 'next-server.cjs'))})`)

ir('server-only.cjs', 'module.exports = {}')
ir('admin-client.cjs', 'module.exports = { getSupabaseAdminClient: () => globalThis.__kartotekaAlAdmin }')
ir('kod.cjs', t(olvas(KOD_SRC)))
ir('ip-hash.cjs', t(olvas(IPHASH_SRC)))
ir('cors.cjs', t(olvas(CORS_SRC)))
ir('public-origin.cjs', t(olvas(ORIGIN_SRC)))
ir(
  'szerver-stub.cjs',
  `module.exports = {
    DESKTOP_KAPCSOLAS_SUTI: 'kt-desktop-kapcsolas',
    DESKTOP_KAPCSOLAS_SUTI_MP: 900,
    tisztaEszkozNev: (x) => (typeof x === 'string' ? x : null),
    inditKapcsolast: async () => ({ ok: true, id: '11111111-1111-4111-8111-111111111111', ellenorzoKod: '123456', lejar: new Date().toISOString() }),
    lekerKapcsolasAllapot: async () => ({ allapot: 'varakozik' }),
  }`,
)
// A valódi next/server, ha betölthető Node alatt; különben egy minimális,
// Response-alapú NextResponse (a route csak a .json()-t és a konstruktort használja).
ir(
  'next-server.cjs',
  `let mod = null
  try { mod = require(${JSON.stringify(path.join(ROOT, 'node_modules/next/server'))}) } catch { mod = null }
  if (!mod || typeof mod.NextResponse !== 'function' || typeof mod.NextResponse.json !== 'function') {
    class NextResponse extends Response {
      static json(body, init) {
        const h = new Headers(init && init.headers)
        if (!h.has('content-type')) h.set('content-type', 'application/json')
        return new NextResponse(JSON.stringify(body), { ...(init || {}), headers: h })
      }
    }
    mod = { NextResponse, __stub: true }
  }
  module.exports = mod`,
)

const betolt = (nev, src, extra) => require_(ir(nev, atir(t(src), extra)))
const kodMod = require_(path.join(tmp, 'kod.cjs'))

// ── K: kód-aritmetika a KÖZÖS modulból ────────────────────────────────────
const kod1 = kodMod.ujKapcsolasiKod()
const kod2 = kodMod.ujKapcsolasiKod()
assert(/^[A-Za-z0-9_-]{43}$/.test(kod1), 'K1: a kód 43 karakteres base64url')
assert(kod1 !== kod2, 'K2: két kód nem egyezik (véletlen)')
assert(kodMod.kapcsolasiKodErvenyes(kod1) === true, 'K3: az érvényes kódot elfogadja')
const h1 = await kodMod.kapcsolasiKodHash(kod1)
const h1b = await kodMod.kapcsolasiKodHash(kod1)
const e1 = await kodMod.ellenorzoKod(kod1)
const e1b = await kodMod.ellenorzoKod(kod1)
assert(h1 === h1b && /^[0-9a-f]{64}$/.test(h1), 'K4: a hash determinisztikus, 64 hex')
assert(e1 === e1b && /^[0-9]{6}$/.test(e1), 'K5: az ellenőrző kód determinisztikus, 6 jegy')
assert(!h1.includes(e1) && h1.slice(0, 8) !== e1, 'K5b: az ellenőrző kód nem a hash előtagja (külön domén)')
assert(kodMod.ellenorzoKodFormazott('123456') === '123 456', 'K5c: formázás „123 456"')
assert(kodMod.kapcsolasiKodErvenyes(kod1.slice(0, 42)) === false, 'K6n: 42 karakteres (csonka) kód NEM érvényes')
assert(kodMod.kapcsolasiKodErvenyes(kod1 + '=') === false, 'K6n2: kitöltő „=" jellel NEM érvényes')
assert(kodMod.kapcsolasiKodErvenyes(null) === false && kodMod.kapcsolasiKodErvenyes(42) === false, 'K6n3: nem-sztring NEM érvényes')

// ── C: Tauri CSP ──────────────────────────────────────────────────────────
const CONF = path.join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json')
const conf = JSON.parse(olvas(CONF))
const csp = String(conf.app?.security?.csp ?? '')
const connectSrc = (csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? '').trim()
function cspEngediWebet(connect) {
  return /https:\/\/kartoteka\.app(\s|$)/.test(connect)
}
assert(cspEngediWebet(connectSrc), 'C1: a CSP connect-src tartalmazza a https://kartoteka.app origót')
assert(!cspEngediWebet(connectSrc.replace('https://kartoteka.app', '')), 'C1n: az origó nélküli CSP-n az őrszem BUKIK')

// ── M1: proxy-middleware ──────────────────────────────────────────────────
const MW = olvas(path.join(WEB, 'lib/supabase/middleware.ts'))
assert(
  /isDesktopKapcsolasApiRoute\(pathname\)/.test(MW) && /startsWith\('\/api\/desktop-kapcsolas\/'\)/.test(MW),
  'M1: a middleware átengedi az /api/desktop-kapcsolas/ útvonalat (különben JSON helyett bejelentkező-oldal jönne)',
)

// ── M2–M3: CORS a két API-útvonalon (FUNKCIONÁLIS — a route-ok tényleg futnak) ──
{
  const INDITAS_FORRAS = olvas(INDITAS_SRC)
  const ALLAPOT_FORRAS = olvas(ALLAPOT_SRC)
  const inditas = betolt('inditas-route.cjs', INDITAS_FORRAS)
  const allapot = betolt('allapot-route.cjs', ALLAPOT_FORRAS)
  const nextServer = require_(path.join(tmp, 'next-server.cjs'))
  console.log(`      (next/server: ${nextServer.__stub ? 'minimális stub' : 'valódi könyvtár'})`)

  const URL_I = 'https://kartoteka.app/api/desktop-kapcsolas/inditas'
  const URL_A = 'https://kartoteka.app/api/desktop-kapcsolas/allapot'
  const elokeres = (origin) =>
    new Request(URL_I, { method: 'OPTIONS', headers: origin ? { origin, 'access-control-request-method': 'POST' } : {} })
  const post = (url, body, origin) =>
    new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body })

  assert(typeof inditas.OPTIONS === 'function' && typeof allapot.OPTIONS === 'function', 'M2: mindkét route exportál OPTIONS-t (előkérés-kezelő)')

  const o1 = await inditas.OPTIONS(elokeres('http://tauri.localhost'))
  assert(
    o1.status === 204 &&
      o1.headers.get('access-control-allow-origin') === 'http://tauri.localhost' &&
      /POST/.test(o1.headers.get('access-control-allow-methods') ?? '') &&
      /content-type/i.test(o1.headers.get('access-control-allow-headers') ?? '') &&
      /Origin/.test(o1.headers.get('vary') ?? ''),
    'M2a: inditas OPTIONS → 204 + Allow-Origin=http://tauri.localhost (WebView2) + Methods POST + Headers content-type + Vary: Origin',
  )
  const o2 = await inditas.OPTIONS(elokeres('tauri://localhost'))
  assert(o2.headers.get('access-control-allow-origin') === 'tauri://localhost', 'M2b: a tauri://localhost (macOS/Linux) origó is engedett')
  const o3 = await inditas.OPTIONS(elokeres('http://localhost:1420'))
  assert(o3.headers.get('access-control-allow-origin') === 'http://localhost:1420', 'M2c: a fejlesztői http://localhost:1420 origó is engedett')

  const p400 = await inditas.POST(post(URL_I, 'nem json', 'http://tauri.localhost'))
  assert(
    p400.status === 400 && p400.headers.get('access-control-allow-origin') === 'http://tauri.localhost',
    'M2d: a HIBÁS (400) válasz is hordja az Allow-Origin-t — a hibaüzenet eljut az appig',
  )
  const idegen = await inditas.POST(post(URL_I, JSON.stringify({ kod: kod1 }), 'https://gonosz.example'))
  assert(
    idegen.status === 200 && idegen.headers.get('access-control-allow-origin') === null && /Origin/.test(idegen.headers.get('vary') ?? ''),
    'M2e: idegen origó NEM kap Allow-Origin-t (a böngésző blokkol), a Vary: Origin viszont ott van',
  )
  const nincsOrigin = await inditas.OPTIONS(elokeres(null))
  assert(nincsOrigin.status === 204 && nincsOrigin.headers.get('access-control-allow-origin') === null, 'M2f: Origin nélküli (curl-szerű) hívó: 204, Allow-Origin nélkül')

  const a1 = await allapot.OPTIONS(new Request(URL_A, { method: 'OPTIONS', headers: { origin: 'http://tauri.localhost' } }))
  assert(a1.status === 204 && a1.headers.get('access-control-allow-origin') === 'http://tauri.localhost', 'M3: allapot OPTIONS → 204 + Allow-Origin')
  const a400 = await allapot.POST(post(URL_A, '{"kod": 42}', 'http://tauri.localhost'))
  assert(a400.status === 400 && a400.headers.get('access-control-allow-origin') === 'http://tauri.localhost', 'M3b: allapot 400-as válasz is hordja az Allow-Origin-t')
  const a200 = await allapot.POST(post(URL_A, JSON.stringify({ kod: kod1 }), 'http://tauri.localhost'))
  assert(a200.status === 200 && a200.headers.get('access-control-allow-origin') === 'http://tauri.localhost', 'M3c: allapot 200-as válasz hordja az Allow-Origin-t')

  // M2n — a RÉGI világ: nincs OPTIONS export
  const inditasMutans = INDITAS_FORRAS.replace(/export async function OPTIONS[\s\S]*?\n\}\n/, '')
  assert(inditasMutans !== INDITAS_FORRAS, 'M2n-előfeltétel: az OPTIONS-mutáns előállítható')
  const regi = betolt('inditas-route-mutans.cjs', inditasMutans)
  assert(typeof regi.OPTIONS !== 'function', 'M2n: az OPTIONS export nélküli (régi) mutánson az őr BUKIK')

  // M2cn — allowlist nélküli cors-mutáns: idegen origó is Allow-Origin-t kapna
  const CORS_FORRAS = olvas(CORS_SRC)
  const corsMutans = CORS_FORRAS.replace(/DESKTOP_KAPCSOLAS_ENGEDETT_ORIGOK\.includes\(origin\)/, 'true')
  assert(corsMutans !== CORS_FORRAS, 'M2cn-előfeltétel: az allowlist-mutáns előállítható')
  const cm = require_(ir('cors-mutans.cjs', t(corsMutans)))
  assert(
    cm.corsFejlecek({ headers: new Headers({ origin: 'https://gonosz.example' }) })['Access-Control-Allow-Origin'] === 'https://gonosz.example',
    'M2cn: az allowlist nélküli mutáns idegen origónak is ad Allow-Origin-t — az őr tud pirosra váltani',
  )
}

// ── O: getPublicOrigin (Railway mögött a request.url a BELSŐ localhost:8080) ──
{
  const ORIGIN_FORRAS = olvas(ORIGIN_SRC)
  const po = require_(path.join(tmp, 'public-origin.cjs'))
  const req = (url, headers) => ({ url, headers: new Headers(headers) })
  const mentett = process.env.NEXT_PUBLIC_APP_URL
  try {
    delete process.env.NEXT_PUBLIC_APP_URL
    const railway = req('http://localhost:8080/api/desktop-kapcsolas/nyit?id=x', {
      host: 'localhost:8080',
      'x-forwarded-host': 'kartoteka.app',
      'x-forwarded-proto': 'https',
    })
    assert(po.getPublicOrigin(railway) === 'https://kartoteka.app', 'O1: env nélkül, Railway-fejlécekkel → https://kartoteka.app (NEM a belső localhost:8080)')
    process.env.NEXT_PUBLIC_APP_URL = 'https://kartoteka.app/'
    assert(po.getPublicOrigin(req('http://localhost:8080/x', { host: 'localhost:8080' })) === 'https://kartoteka.app', 'O2: NEXT_PUBLIC_APP_URL az első (a záró / nélkül, origóként)')
    delete process.env.NEXT_PUBLIC_APP_URL
    assert(po.getPublicOrigin(req('http://localhost:8080/x', {})) === 'http://localhost:8080', 'O3: fejlécek nélkül a kérés URL-jének origója (lokális dev)')
    assert(po.getPublicOrigin(req('http://localhost:3000/x', { host: 'localhost:3000' })) === 'http://localhost:3000', 'O4: csak host-fejléc, proxy nélkül → a kérés sémája (http), nem vak https')
    assert(
      po.getPublicOrigin(req('http://localhost:8080/x', { 'x-forwarded-host': 'kartoteka.app, belso.proxy', 'x-forwarded-proto': 'https, http' })) === 'https://kartoteka.app',
      'O5: láncolt proxy-fejlécekből az ELSŐ tag számít',
    )

    // O1n — a régi világ: a request.url origója az első
    const mutans = ORIGIN_FORRAS.replace(
      /const envOrigin = process\.env\.NEXT_PUBLIC_APP_URL\?\.trim\(\)/,
      'return new URL(request.url).origin\n  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()',
    )
    assert(mutans !== ORIGIN_FORRAS, 'O1n-előfeltétel: a mutáns előállítható')
    const pm = require_(ir('public-origin-mutans.cjs', t(mutans)))
    assert(pm.getPublicOrigin(railway) === 'http://localhost:8080', 'O1n: a request.url-ből induló mutáns a belső localhost:8080-at adja — az őr tud pirosra váltani')
  } finally {
    if (mentett === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = mentett
  }
}

// ── N: a nyit route forrás-őre ────────────────────────────────────────────
{
  const NYIT = kommentNelkul(olvas(NYIT_SRC))
  function nyitHelyes(src) {
    return /new URL\('\/desktop-kapcsolas',\s*getPublicOrigin\(request\)\)/.test(src) && !/nextUrl\.origin/.test(src)
  }
  assert(nyitHelyes(NYIT), 'N1: a nyit route a getPublicOrigin(request)-ből épít, és NEM használ nextUrl.origin-t')
  const nyitMutans = NYIT.replace('getPublicOrigin(request)', 'request.nextUrl.origin')
  assert(nyitMutans !== NYIT && !nyitHelyes(nyitMutans), 'N1n: a nextUrl.origin-re visszaírt mutánson az őr BUKIK')
}

// ── S: SQL-forrásőrök ─────────────────────────────────────────────────────
const SQL = olvas(path.join(ROOT, 'migration-docs/sql/2026-09-05-desktop-kapcsolas.sql'))
assert(/ALTER TABLE public\.desktop_kapcsolas ENABLE ROW LEVEL SECURITY/.test(SQL), 'S1: RLS bekapcsolva a desktop_kapcsolas táblán')
assert(/\('desktop_kapcsolas',\s*'kizart_titok'/.test(SQL), 'S2: mentés-besorolás kizart_titok (a token soha nem kerül mentésbe)')
function authenticatedJogokSzukek(sql) {
  const revoke = sql.indexOf('REVOKE ALL ON public.desktop_kapcsolas FROM authenticated;')
  const grant = sql.indexOf('GRANT SELECT, DELETE ON public.desktop_kapcsolas TO authenticated')
  const nincsInsertGrant = !/GRANT[^;]*INSERT[^;]*desktop_kapcsolas[^;]*authenticated/.test(sql)
  return revoke >= 0 && grant >= 0 && revoke < grant && nincsInsertGrant
}
assert(
  authenticatedJogokSzukek(SQL),
  'S3: EXPLICIT REVOKE ALL … FROM authenticated a GRANT SELECT, DELETE ELŐTT (a 2026-04-23-as default privileges INSERT/UPDATE-öröksége ellen), INSERT-grant nincs',
)
assert(!authenticatedJogokSzukek(SQL.replace('REVOKE ALL ON public.desktop_kapcsolas FROM authenticated;', '')), 'S3n: a REVOKE authenticated nélküli mutánson az őr BUKIK')
assert(/REVOKE ALL ON public\.desktop_kapcsolas FROM anon/.test(SQL), 'S4: az anon semmit nem kap')
assert(/USING \(user_id = auth\.uid\(\) AND allapot = 'felhasznalva'\)/.test(SQL), 'S5: a SELECT-policy csak a saját, felhasznált sorokat adja')

// ── W1/W2: a szerver-réteg egyszer használatos tokenje (forrás-őr) ────────
const SZERVER = olvas(SZERVER_SRC)
function egyszerHasznalatos(src) {
  const igenyles = src.slice(src.indexOf('export async function lekerKapcsolasAllapot'))
  return /\.update\(\{\s*allapot:\s*'felhasznalva',\s*token_hash:\s*null/.test(igenyles) && /\.eq\('allapot',\s*'jovahagyva'\)/.test(igenyles)
}
assert(egyszerHasznalatos(SZERVER), 'W1: az igénylés atomikus (allapot=jovahagyva feltétel) és a token_hash NULL-ra íródik')
assert(!egyszerHasznalatos(SZERVER.replace("token_hash: null, felhasznalva_at", 'felhasznalva_at')), 'W1n: a NULL-ozás nélküli mutánson az őrszem BUKIK')
assert(!/console\.(log|error|warn)\([^)]*(kod|token_hash|tokenHash)\b/.test(SZERVER), 'W2: a szerver-réteg nem naplózza a kódot/tokent')

// ── W3: spam-fék — FUNKCIONÁLIS (ál-admin-klienssel, a valódi szerver.ts fut) ──
{
  /** Ál-Supabase: a count-lekérdezés a szűrő szerint ad számot (globális / IP / névtelen). */
  function alAdmin(szamok) {
    const builder = () => {
      const st = {}
      const b = {
        select() { return b },
        gte() { return b },
        eq(col, val) { st.eq = { col, val }; return b },
        is(col, val) { st.is = { col, val }; return b },
        insert() { return b },
        update() { return b },
        in() { return b },
        maybeSingle() { return Promise.resolve({ data: { id: 'sor-1' }, error: null }) },
        then(resolve, reject) {
          let count = szamok.globalis ?? 0
          if (st.eq?.col === 'ip_hash') count = szamok.ip ?? 0
          else if (st.is?.col === 'ip_hash' && st.is.val === null) count = szamok.nevtelen ?? 0
          return Promise.resolve({ count, error: null }).then(resolve, reject)
        },
      }
      return b
    }
    return { from: () => builder(), rpc: async () => ({ data: null, error: null }) }
  }
  const szerverMod = require_(ir('szerver.cjs', atir(t(SZERVER))))
  const indit = async (szamok, ip) => {
    globalThis.__kartotekaAlAdmin = alAdmin(szamok)
    return szerverMod.inditKapcsolast({ kod: kodMod.ujKapcsolasiKod(), eszkozNev: null, ip })
  }
  const csendes = console.error
  console.error = () => {}
  try {
    const IP = '203.0.113.5'
    const r1 = await indit({ globalis: 200, ip: 0 }, IP)
    assert(r1.ok === false && r1.status === 429, 'W3: a GLOBÁLIS plafon (200/óra) IP-VEL IS üt — a hamisítható x-forwarded-for nem kerüli meg')
    const r2 = await indit({ globalis: 0, ip: 30 }, IP)
    assert(r2.ok === false && r2.status === 429, 'W3a: per-IP plafon (30/óra) üt')
    const r3 = await indit({ globalis: 199, ip: 29 }, IP)
    assert(r3.ok === true && typeof r3.id === 'string', 'W3b: a plafonok alatt a kérés átmegy (id-t ad)')
    const r4 = await indit({ globalis: 0, nevtelen: 60 }, null)
    assert(r4.ok === false && r4.status === 429, 'W3c: IP NÉLKÜL a névtelen vödör (60/óra) üt — nincs feltétel nélküli átengedés')
    const r5 = await indit({ globalis: 200, nevtelen: 0 }, null)
    assert(r5.ok === false && r5.status === 429, 'W3d: IP nélkül a globális plafon is üt')
    const r6 = await indit({ globalis: 0, nevtelen: 59 }, null)
    assert(r6.ok === true, 'W3e: IP nélkül a vödör alatt átmegy')

    // W3n — a globális számlálás kikötve (mint a régi „csak NULL-IP-nél" világ)
    const mutans = SZERVER.replace(/utolsoOraKeresek\(admin, egyOrajaIso, null\),/, 'Promise.resolve({ count: 0 }),')
    assert(mutans !== SZERVER, 'W3n-előfeltétel: a globális-kapu mutáns előállítható')
    const mutansMod = require_(ir('szerver-mutans.cjs', atir(t(mutans))))
    globalThis.__kartotekaAlAdmin = alAdmin({ globalis: 200, ip: 0 })
    const rm = await mutansMod.inditKapcsolast({ kod: kodMod.ujKapcsolasiKod(), eszkozNev: null, ip: IP })
    assert(rm.ok === true, 'W3n: a globális kapu nélküli mutánson a 200-as globális terhelés ÁTMEGY — az őr tud pirosra váltani')
  } finally {
    console.error = csendes
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
