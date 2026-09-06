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
//   x-forwarded-for-ral a tábla korlátlanul tölthető; (7) a proxy ELŐTAG
//   alapján enged át → egy jövőbeli /api/desktop-kapcsolas/* végpont döntés
//   nélkül nyilvános; (8) a GoTrue generateLink a fiók EGYETLEN recovery-
//   tokenjét cseréli → két gyors jóváhagyásból az első gép HALOTT tokent kap;
//   (9) a lejárt, de jóváhagyott sor tovább adja a tokent.
//
// ŐRSZEMEK
//   K1–K5  kód-aritmetika: alak, hossz, egyediség, determinisztikus hash és
//          ellenőrző kód, a hash ≠ ellenőrző-domén
//   K6n    negatív: egy elgépelt (42 karakteres) kód NEM érvényes
//   C1/C1n Tauri CSP connect-src tartalmazza a kartoteka.app-ot (+ mutáns)
//   M1/M1a a proxy-middleware PONTOS allowlistje: inditas/allapot/nyit átmegy,
//          minden más /api/desktop-kapcsolas/* alapból munkamenet-köteles
//   M1n    negatív: a prefix-alapú (régi) mutánson az őr BUKIK
//   M1b/M1c az allowlist ⇄ a route-fájlok kötése: minden allowlist-bejegyzéshez
//          LÉTEZŐ route.ts tartozik, az allowlist PONTOSAN a három ismert útvonal,
//          és minden létező route-mappa döntött (nyilvános VAGY munkamenet-köteles)
//   M1bn   negatív: egy beszúrt/elgépelt allowlist-bejegyzésen az őr BUKIK
//   W4–W4f jóváhagyás-felülírás: a korábbi jovahagyva sorok lejart-ra (token NULL)
//          a generateLink ELŐTT; audit CSAK a még élő sorról, titok nélkül (a már
//          lejárt sor lezárása takarítás, nem „felülírás"); fail-closed, ha a
//          lezárás hibázik
//   W4n    negatív: a felülírás-lépés nélküli mutánson az őr BUKIK
//   W4an   negatív: a FORDÍTOTT sorrendű (generateLink a lezárás ELŐTT) mutánson
//          a W4a feltétele hamis — a sorrend mért, nem csak a lépés megléte
//   W4cn   negatív: a lejárt sort is auditáló mutánson az őr BUKIK
//   W4g    a generateLink bukása a lezárás UTÁN: ok:false + a napló őrzi, hogy N
//          élő jóváhagyás utód nélkül zárult (a felülírt gép üzenete nem hazudik)
//   W4gn   negatív: a bukás-napló nélküli mutánson az őr BUKIK
//   W6–W6c keresMasikFuggoJovahagyast (a jóváhagyó nézet jelzése) FUNKCIONÁLISAN:
//          a négy szűrő (user_id, jovahagyva, neq saját id, gt lejar), a „van"
//          válasz alakja, hiba → „ismeretlen" (nem néma „nincs"), userId nélkül null
//   W6n/W6n2 negatív: a fail-open (hiba → nincs) / a neq nélküli mutánson BUKIK
//   A1–A3  (ellenőrzés-ügynök) a JÓVÁHAGYÓ OLDAL bekötése: az akció a userId-vel
//          olvas (masikFuggoJovahagyas → masikGepVarakozik) és a felulirva számot
//          adja vissza; a leképezés futtatva; a panel a döntés ELŐTT kiírja a másik
//          gép függő jóváhagyását (ismeretlen ≠ néma „nincs"), UTÁNA a felülírást;
//          az audit-kulcs a betekintés-napló szótárában is él
//   A1n/A2n negatív: a userId nélkül olvasó akció / a sáv nélküli panel → BUKIK
//   W5–W5c a lejárt jovahagyva sor NEM ad tokent (lejart-ra zár); a lejart-válasz
//          üzenete kimondja az okot: a felülírt sorra a KONKRÉT „egy újabb
//          jóváhagyás lezárta" szöveg (nem az általános), a sima lejártra mindkét ok
//   W5n    negatív: a lejárat-vak mutáns a lejárt sorból is tokent ad → BUKIK
//   W5bn   negatív: a lejartOka → mindig általános mutánson a W5b BUKIK
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
    .replace(/require\(["']@\/lib\/audit\/log["']\)/g, `require(${JSON.stringify(path.join(tmp, 'audit-log.cjs'))})`)
    .replace(/require\(["']@\/lib\/utils\/public-origin["']\)/g, `require(${JSON.stringify(path.join(tmp, 'public-origin.cjs'))})`)
    .replace(/require\(["']@\/lib\/desktop-kapcsolas\/cors["']\)/g, `require(${JSON.stringify(path.join(tmp, extra.cors ?? 'cors.cjs'))})`)
    .replace(/require\(["']@\/lib\/desktop-kapcsolas\/szerver["']\)/g, `require(${JSON.stringify(path.join(tmp, 'szerver-stub.cjs'))})`)
    .replace(/require\(["']@kartoteka\/supabase-client["']\)/g, `require(${JSON.stringify(path.join(tmp, 'kod.cjs'))})`)
    .replace(/require\(["']next\/server["']\)/g, `require(${JSON.stringify(path.join(tmp, 'next-server.cjs'))})`)

ir('server-only.cjs', 'module.exports = {}')
ir('admin-client.cjs', 'module.exports = { getSupabaseAdminClient: () => globalThis.__kartotekaAlAdmin }')
// Ál-audit: minden bejegyzést a globális listába gyűjt (W4c/W4d ezt olvassa).
ir(
  'audit-log.cjs',
  'module.exports = { logAuditEvent: async (esemeny) => { (globalThis.__kartotekaAudit = globalThis.__kartotekaAudit || []).push(esemeny); return true } }',
)
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

// ── M1: proxy-middleware — PONTOS allowlist a három asztali útvonalra (FUNKCIONÁLIS) ──
{
  const MW = olvas(path.join(WEB, 'lib/supabase/middleware.ts'))
  assert(
    /isDesktopKapcsolasApiRoute\(pathname\)/.test(MW),
    'M1: a middleware kapuja az isDesktopKapcsolasApiRoute-tal dönt (különben JSON helyett bejelentkező-oldal jönne az appnak)',
  )
  /** Kivágja az allowlistet + a döntő függvényt, és a middleware többi importja NÉLKÜL tölti be. */
  function kapuModul(src, nev) {
    const m = src.match(
      /const DESKTOP_KAPCSOLAS_NYILVANOS_UTVONALAK[\s\S]*?function isDesktopKapcsolasApiRoute\(pathname: string\): boolean \{[\s\S]*?\n\}/,
    )
    if (!m) return null
    return require_(ir(nev, t(`${m[0]}\nexport { isDesktopKapcsolasApiRoute }`)))
  }
  const NYILT = ['/api/desktop-kapcsolas/inditas', '/api/desktop-kapcsolas/allapot', '/api/desktop-kapcsolas/nyit']
  const ZART = [
    '/api/desktop-kapcsolas/',
    '/api/desktop-kapcsolas',
    '/api/desktop-kapcsolas/torles',
    '/api/desktop-kapcsolas/inditas/',
    '/api/desktop-kapcsolas/inditas/x',
    '/api/desktop-kapcsolas/allapot2',
    '/api/desktop-kapcsolasx/inditas',
  ]
  function pontosAllowlist(mod) {
    return (
      Boolean(mod) &&
      NYILT.every((p) => mod.isDesktopKapcsolasApiRoute(p) === true) &&
      ZART.every((p) => mod.isDesktopKapcsolasApiRoute(p) === false)
    )
  }
  const kapu = kapuModul(MW, 'mw-kapu.cjs')
  assert(kapu !== null, 'M1-előfeltétel: az allowlist + a döntő függvény kivágható a middleware-ből')
  assert(
    pontosAllowlist(kapu),
    'M1a: inditas/allapot/nyit átmegy; minden más /api/desktop-kapcsolas/* (al-útvonal, záró perjel, jövőbeli végpont) alapból munkamenet-köteles',
  )
  // M1n — a RÉGI világ: előtag-alapú átengedés
  const mwMutans = MW.replace(
    /function isDesktopKapcsolasApiRoute\(pathname: string\): boolean \{[\s\S]*?\n\}/,
    "function isDesktopKapcsolasApiRoute(pathname: string): boolean {\n  return pathname.startsWith('/api/desktop-kapcsolas/')\n}",
  )
  assert(mwMutans !== MW, 'M1n-előfeltétel: a prefix-mutáns előállítható')
  const kapuMutans = kapuModul(mwMutans, 'mw-kapu-mutans.cjs')
  assert(
    kapuMutans !== null && kapuMutans.isDesktopKapcsolasApiRoute('/api/desktop-kapcsolas/torles') === true && !pontosAllowlist(kapuMutans),
    'M1n: a prefix-alapú (régi) mutáns egy jövőbeli /api/desktop-kapcsolas/torles-t is átenged — az őr tud pirosra váltani',
  )

  // ── M1b/M1c: az allowlist ⇄ a route-fájlok kötése (2026-09-05, a bíráló P3 találata) ──
  // Az útvonal-szöveg három helyen él (allowlist, asztali kliens, route-mappák). A
  // pontos allowlist a prefixnél SZOROSABBAN kötődik a fájlrendszerhez: egy
  // átnevezett mappa vagy egy elgépelt bejegyzés NÉMÁN a bejelentkezés-kapura
  // ejtené az asztali POST-ot (307 → /login HTML → az app a lejáratig újrapróbál).
  /** Az allowlist-Set szöveges tagjai a middleware forrásából. */
  function allowlistTagok(src) {
    const set = src.match(/const DESKTOP_KAPCSOLAS_NYILVANOS_UTVONALAK[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1]
    if (typeof set !== 'string') return null
    return [...set.matchAll(/'([^']*)'/g)].map((m) => m[1])
  }
  const routeFajl = (p) => path.join(WEB, 'app', p, 'route.ts')
  /** Az allowlist PONTOSAN a három ismert útvonal, és mindegyikhez létező route.ts tartozik. */
  function allowlistKotveARouteokhoz(src) {
    const tagok = allowlistTagok(src)
    return (
      Array.isArray(tagok) &&
      tagok.length === NYILT.length &&
      NYILT.every((p) => tagok.includes(p)) &&
      tagok.every((p) => fs.existsSync(routeFajl(p)))
    )
  }
  assert(allowlistKotveARouteokhoz(MW), 'M1b: az allowlist három bejegyzése PONTOSAN a NYILT lista, és mindegyikhez létező app/api/…/route.ts tartozik')
  // M1bn — beszúrt (jövőbeli) bejegyzés route-fájl nélkül → BUKIK; elgépelt bejegyzés → BUKIK
  const mwBeszurt = MW.replace("'/api/desktop-kapcsolas/nyit',", "'/api/desktop-kapcsolas/nyit',\n  '/api/desktop-kapcsolas/torles',")
  const mwElgepelt = MW.replace("'/api/desktop-kapcsolas/allapot'", "'/api/desktop-kapcsolas/alapot'")
  assert(mwBeszurt !== MW && mwElgepelt !== MW, 'M1bn-előfeltétel: a beszúrt és az elgépelt allowlist-mutáns előállítható')
  assert(
    !allowlistKotveARouteokhoz(mwBeszurt) && !allowlistKotveARouteokhoz(mwElgepelt),
    'M1bn: egy route-fájl nélküli beszúrt bejegyzésen ÉS egy elgépelt bejegyzésen az őr BUKIK',
  )
  // M1c — minden LÉTEZŐ route-mappa döntött: vagy nyilvános (allowlist), vagy
  // kifejezetten munkamenet-köteles (ez a lista). Egy új mappa addig piros, amíg
  // a szerzője nem dönt — a fail-closed alapértelmezés nem lehet véletlen.
  const MUNKAMENET_KOTELES_LETEZO = []
  const routeMappak = fs
    .readdirSync(path.join(WEB, 'app/api/desktop-kapcsolas'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(WEB, 'app/api/desktop-kapcsolas', d.name, 'route.ts')))
    .map((d) => `/api/desktop-kapcsolas/${d.name}`)
  const dontetlen = routeMappak.filter((p) => !NYILT.includes(p) && !MUNKAMENET_KOTELES_LETEZO.includes(p))
  assert(
    routeMappak.length >= 3 && dontetlen.length === 0,
    `M1c: minden létező /api/desktop-kapcsolas/* route-mappa döntött (nyilvános vagy munkamenet-köteles)${dontetlen.length ? ` — döntetlen: ${dontetlen.join(', ')}` : ''}`,
  )
}

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

// ── W4/W5: jóváhagyás-felülírás + lejárt jóváhagyott sor (FUNKCIONÁLIS — a valódi szerver.ts fut, ál-admin-klienssel) ──
{
  const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const ID_UJ = '22222222-2222-4222-8222-222222222222'
  const ID_REGI = '33333333-3333-4333-8333-333333333333'
  const ID_LEJART = '44444444-4444-4444-8444-444444444444'
  const JOVO = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const MULT = new Date(Date.now() - 60 * 1000).toISOString()

  /** Ál-Supabase, ami MINDEN hívást naplóz (tábla, művelet, payload, szűrők — sorrendben), és a `valasz` szerint felel. */
  function naploAdmin(valasz) {
    const hivasok = []
    const from = (tabla) => {
      const h = { tabla, muvelet: 'select', payload: null, szurok: [], select: null }
      const b = {
        select(cols) { h.select = cols; return b },
        update(p) { h.muvelet = 'update'; h.payload = p; return b },
        insert(p) { h.muvelet = 'insert'; h.payload = p; return b },
        eq(c, v) { h.szurok.push(['eq', c, v]); return b },
        neq(c, v) { h.szurok.push(['neq', c, v]); return b },
        gt(c, v) { h.szurok.push(['gt', c, v]); return b },
        gte(c, v) { h.szurok.push(['gte', c, v]); return b },
        in(c, v) { h.szurok.push(['in', c, v]); return b },
        is(c, v) { h.szurok.push(['is', c, v]); return b },
        order() { return b },
        limit() { return b },
        maybeSingle() { h.single = true; return b },
        then(resolve, reject) { hivasok.push(h); return Promise.resolve(valasz(h)).then(resolve, reject) },
      }
      return b
    }
    return {
      hivasok,
      from,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        admin: {
          generateLink: async (arg) => {
            const h = { tabla: 'auth', muvelet: 'generateLink', payload: { type: arg.type }, szurok: [] }
            hivasok.push(h)
            return valasz(h)
          },
        },
      },
    }
  }
  const szures = (h, tipus, oszlop, ertek) => h.szurok.some(([tp, c, v]) => tp === tipus && c === oszlop && v === ertek)
  const felulirasIdx = (hivasok, user) =>
    hivasok.findIndex(
      (h) =>
        h.muvelet === 'update' &&
        h.payload?.allapot === 'lejart' &&
        h.payload?.token_hash === null &&
        szures(h, 'eq', 'user_id', user) &&
        szures(h, 'eq', 'allapot', 'jovahagyva'),
    )
  const linkIdx = (hivasok) => hivasok.findIndex((h) => h.muvelet === 'generateLink')

  /** A jóváhagyás forgatókönyve: a kérés sora várakozik és él; a fiókon egy korábbi, le nem kért jóváhagyás áll. */
  const jovahagyasValasz = (opts = {}) => (h) => {
    if (h.muvelet === 'generateLink') {
      // `linkHiba`: a GoTrue kimaradása — a lezárás UTÁN (W4g).
      if (opts.linkHiba) return { data: null, error: { code: 'gotrue_nem_valaszol' } }
      return { data: { properties: { hashed_token: 'TITKOS-TOKEN' }, user: { id: USER } }, error: null }
    }
    if (h.muvelet === 'select' && szures(h, 'eq', 'id', ID_UJ)) {
      return {
        data: { id: ID_UJ, ellenorzo_kod: '123456', eszkoz_nev: 'Iroda', allapot: 'varakozik', user_id: null, created_at: MULT, lejar: JOVO, jovahagyva_at: null, felhasznalva_at: null },
        error: null,
      }
    }
    if (h.muvelet === 'update' && h.payload?.allapot === 'lejart') {
      if (opts.felulirasHiba) return { data: null, error: { message: 'kapcsolat megszakadt' } }
      // Két korábbi sor: egy még ÉLŐ (ezt írjuk felül) és egy már lejárt (csak takarítás — nem „felülírás").
      return {
        data: [
          { id: ID_REGI, eszkoz_nev: 'Otthoni gép', jovahagyva_at: MULT, lejar: JOVO },
          { id: ID_LEJART, eszkoz_nev: 'Régi laptop', jovahagyva_at: MULT, lejar: MULT },
        ],
        error: null,
      }
    }
    if (h.muvelet === 'update' && h.payload?.allapot === 'jovahagyva') return { data: { id: ID_UJ }, error: null }
    return { data: null, error: null }
  }
  const jovahagy = (mod, admin) => {
    globalThis.__kartotekaAudit = []
    globalThis.__kartotekaAlAdmin = admin
    return mod.jovahagyKapcsolast({ id: ID_UJ, userId: USER, email: 'lelkesz@example.org' })
  }

  const szerverMod = require_(ir('szerver-w4.cjs', atir(t(SZERVER))))
  const csendes = console.error
  console.error = () => {}
  try {
    // W4 — a boldog út
    const admin = naploAdmin(jovahagyasValasz())
    const r = await jovahagy(szerverMod, admin)
    const fIdx = felulirasIdx(admin.hivasok, USER)
    const lIdx = linkIdx(admin.hivasok)
    assert(r.ok === true && r.felulirva === 1, 'W4: a jóváhagyás sikerül, és jelenti: 1 (még ÉLŐ) korábbi jóváhagyás lett felülírva — a már lejártat nem számolja')
    assert(
      fIdx >= 0 && lIdx >= 0 && fIdx < lIdx,
      'W4a: a korábbi jovahagyva sorok lejart-ra állítása (token_hash NULL, user_id + allapot szűrővel) a generateLink ELŐTT fut',
    )
    assert(fIdx >= 0 && szures(admin.hivasok[fIdx], 'neq', 'id', ID_UJ), 'W4b: a felülírás a MOST jóváhagyott sort kihagyja (neq id)')
    const audit = globalThis.__kartotekaAudit
    /**
     * Audit CSAK a még ÉLŐ felülírt sorról (2026-09-05, a bíráló P3 találata): a
     * betekintés-napló a KULCSBÓL mond „felülírta"-t, a metaadatot nem nézi — a
     * már lejárt sor lezárása takarítás (mint a lekerKapcsolasAllapot-ban), arról
     * „felülírás"-bejegyzés NEM készülhet.
     */
    const auditCsakAzElorol = (lista) => {
      const f = lista.filter((e) => e.action === 'desktop.kapcsolas_felulirva')
      const elo = f.find((e) => e.targetId === ID_REGI)
      return f.length === 1 && elo?.targetTable === 'desktop_kapcsolas' && elo?.metadata?.felulirta === ID_UJ && !f.some((e) => e.targetId === ID_LEJART)
    }
    assert(
      auditCsakAzElorol(audit),
      'W4c: PONTOSAN a még élő felülírt sorról készül audit (desktop.kapcsolas_felulirva, a régi sor azonosítójával + a felülíró kérés hivatkozásával); a már lejárt sorról NINCS — a napló nem mond „felülírás"-t takarításra',
    )
    const auditSzoveg = JSON.stringify(audit)
    assert(!auditSzoveg.includes('TITKOS-TOKEN') && !/token_hash|kod_hash/.test(auditSzoveg), 'W4d: az audit-bejegyzés titkot nem hordoz (sem tokent, sem kód-hash-t)')
    // W4cn — a RÉGI világ: a lejárt sort is „felülírás"-ként auditáló ciklus
    const mutansAudit = SZERVER.replace(/for \(const regi of eloSorok\)/, 'for (const regi of felulirt.sorok)')
    assert(mutansAudit !== SZERVER, 'W4cn-előfeltétel: a mindent-auditáló mutáns előállítható')
    const mutansAuditMod = require_(ir('szerver-w4cn-mutans.cjs', atir(t(mutansAudit))))
    const rcn = await jovahagy(mutansAuditMod, naploAdmin(jovahagyasValasz()))
    assert(
      rcn.ok === true && !auditCsakAzElorol(globalThis.__kartotekaAudit) && globalThis.__kartotekaAudit.some((e) => e.targetId === ID_LEJART),
      'W4cn: a lejárt sort is auditáló (régi) mutánson az őr BUKIK — a takarításra is „felülírás" kerülne a naplóba',
    )

    // W4g — a generateLink a lezárás UTÁN bukik: ok:false, a sor nem lesz jovahagyva, és a
    // napló őrzi, hogy az ÉLŐ korábbi jóváhagyás utód nélkül zárult (a felülírt gép
    // üzenete ettől még igaz — lásd LEJART_UZENET.felulirva + W5b). Titok nélkül.
    const naploG = []
    console.error = (...args) => { naploG.push(args.map(String).join(' ')) }
    const adminG = naploAdmin(jovahagyasValasz({ linkHiba: true }))
    const rg = await jovahagy(szerverMod, adminG)
    console.error = () => {}
    const utodNelkul = naploG.find((s) => /utód nélkül/.test(s))
    assert(
      rg.ok === false &&
        felulirasIdx(adminG.hivasok, USER) >= 0 &&
        linkIdx(adminG.hivasok) >= 0 &&
        !adminG.hivasok.some((h) => h.muvelet === 'update' && h.payload?.allapot === 'jovahagyva') &&
        typeof utodNelkul === 'string' &&
        /\b1 korábbi jóváhagyás/.test(utodNelkul) &&
        utodNelkul.includes(ID_REGI) &&
        !utodNelkul.includes(ID_LEJART) &&
        !utodNelkul.includes('TITKOS-TOKEN'),
      'W4g: a generateLink bukásakor (a lezárás után) a jóváhagyás megáll, és a napló kimondja: 1 élő korábbi jóváhagyás utód nélkül zárult (csak az élő azonosítója, titok nélkül)',
    )
    // W4gn — a bukás-napló nélküli mutáns: a lezárt sor nyomtalanul marad utód nélkül
    const mutansG = SZERVER.replace(/\n\s*utodNelkulZarult\([^)]*\)/g, '')
    assert(mutansG !== SZERVER, 'W4gn-előfeltétel: a napló nélküli mutáns előállítható')
    const mutansGMod = require_(ir('szerver-w4gn-mutans.cjs', atir(t(mutansG))))
    const naploGM = []
    console.error = (...args) => { naploGM.push(args.map(String).join(' ')) }
    const rgm = await jovahagy(mutansGMod, naploAdmin(jovahagyasValasz({ linkHiba: true })))
    console.error = () => {}
    assert(rgm.ok === false && !naploGM.some((s) => /utód nélkül/.test(s)), 'W4gn: a bukás-napló nélküli mutánson az őr BUKIK (nyomtalan lezárás)')

    // W4f — FAIL-CLOSED: ha a lezárás hibázik, a jóváhagyás megáll, token nem készül
    const adminHiba = naploAdmin(jovahagyasValasz({ felulirasHiba: true }))
    const rh = await jovahagy(szerverMod, adminHiba)
    assert(
      rh.ok === false && linkIdx(adminHiba.hivasok) === -1 && !adminHiba.hivasok.some((h) => h.muvelet === 'update' && h.payload?.allapot === 'jovahagyva'),
      'W4f: ha a korábbi jóváhagyás lezárása hibázik, a jóváhagyás megáll (fail-closed) — nincs generateLink, a sor nem lesz jovahagyva',
    )

    // W4n — a RÉGI világ: a felülírás-lépés törölve
    const mutans = SZERVER.replace(/const felulirt = await felulirKorabbiJovahagyasokat\([^)]*\)/, 'const felulirt = { ok: true, sorok: [] }')
    assert(mutans !== SZERVER, 'W4n-előfeltétel: a felülírás-mutáns előállítható')
    const mutansMod = require_(ir('szerver-w4-mutans.cjs', atir(t(mutans))))
    const adminM = naploAdmin(jovahagyasValasz())
    const rmut = await jovahagy(mutansMod, adminM)
    assert(
      rmut.ok === true && felulirasIdx(adminM.hivasok, USER) === -1 && linkIdx(adminM.hivasok) >= 0,
      'W4n: a felülírás nélküli mutánson a generateLink a korábbi sor lezárása NÉLKÜL fut (halott token a másik gépen) — az őr tud pirosra váltani',
    )
    // W4an — a SORREND mutánsa (2026-09-05, a bíráló P3 találata: „mutáns a sorrendre"):
    // a generateLink a lezárás ELŐTT fut. Ebben az alakban a kettő közti ablakban a
    // másik gép a MÁR HALOTT tokent kapná, és ha a lezárás bukna, a sora örökre halott
    // tokennel állna `jovahagyva`-n. A W4a a hívás-sorrendet méri — itt annak hamisnak
    // kell lennie, különben a sorrend-őr vak (csak a lépés megléte volna mérve).
    const mutansSorrend = SZERVER.replace(
      /const felulirt = await felulirKorabbiJovahagyasokat\(/,
      "await admin.auth.admin.generateLink({ type: 'magiclink', email: input.email })\n  const felulirt = await felulirKorabbiJovahagyasokat(",
    )
    assert(mutansSorrend !== SZERVER, 'W4an-előfeltétel: a sorrend-mutáns előállítható')
    const mutansSorrendMod = require_(ir('szerver-w4an-mutans.cjs', atir(t(mutansSorrend))))
    const adminS = naploAdmin(jovahagyasValasz())
    const rsm = await jovahagy(mutansSorrendMod, adminS)
    const fIdxS = felulirasIdx(adminS.hivasok, USER)
    const lIdxS = linkIdx(adminS.hivasok)
    assert(
      rsm.ok === true && fIdxS >= 0 && lIdxS >= 0 && !(fIdxS < lIdxS),
      'W4an: a fordított sorrendű mutánson (generateLink a lezárás ELŐTT) a W4a sorrend-feltétele HAMIS — az őr tud pirosra váltani',
    )

    // W5 — a lejárt JÓVÁHAGYOTT sor tokent NEM ad, lejart-ra zár
    const allapotValasz = (sor) => (h) => {
      if (h.muvelet === 'select' && szures(h, 'eq', 'kod_hash', h.szurok.find(([tp, c]) => tp === 'eq' && c === 'kod_hash')?.[2])) return { data: sor, error: null }
      if (h.muvelet === 'update') return { data: { id: sor.id }, error: null }
      return { data: null, error: null }
    }
    const lejartJovahagyott = { id: 'sor-j', allapot: 'jovahagyva', token_hash: 'TITKOS-TOKEN', lejar: MULT, jovahagyva_at: MULT }
    const adminL = naploAdmin(allapotValasz(lejartJovahagyott))
    globalThis.__kartotekaAlAdmin = adminL
    const rl = await szerverMod.lekerKapcsolasAllapot(kod1)
    const lezaras = adminL.hivasok.find(
      (h) => h.muvelet === 'update' && h.payload?.allapot === 'lejart' && h.payload?.token_hash === null && szures(h, 'eq', 'id', 'sor-j') && szures(h, 'eq', 'allapot', 'jovahagyva'),
    )
    assert(
      rl.allapot === 'lejart' && rl.tokenHash === undefined && Boolean(lezaras),
      'W5: a lejárt (lejar < now) jovahagyva sor NEM ad tokent — lejart-ra zár (token_hash NULL, allapot=jovahagyva feltétellel), és lejárt-választ ad',
    )
    assert(typeof rl.uzenet === 'string' && /indítsd újra/i.test(rl.uzenet), 'W5a: a lejárt-válasz üzenete az újraindításra utasít (az asztali app ezt mutatja)')
    // W5b — a FELÜLÍRT sor (lejart, jóvá volt hagyva, a lejárata még a jövőben) üzenete kimondja a felülírást
    const felulirtSor = { id: 'sor-f', allapot: 'lejart', token_hash: null, lejar: JOVO, jovahagyva_at: MULT }
    globalThis.__kartotekaAlAdmin = naploAdmin(allapotValasz(felulirtSor))
    const rf = await szerverMod.lekerKapcsolasAllapot(kod1)
    /**
     * A felülírt sor üzenete a KONKRÉT szöveg (2026-09-05, a bíráló P3 találata):
     * az általános üzenet („…vagy egy újabb jóváhagyás felülírta…") a régi
     * `/felülírta/ + /indítsd újra/` mintát IS kielégítette, tehát a lejartOka →
     * mindig-általános mutáns zölden átment. Itt a felülírt-szöveg jelenléte ÉS az
     * általános „vagy egy újabb" hiánya együtt kell.
     */
    const felulirtUzenet = (u) => typeof u === 'string' && /egy újabb jóváhagyás lezárta/.test(u) && !/vagy egy újabb/.test(u) && /indítsd újra/i.test(u)
    assert(
      rf.allapot === 'lejart' && rf.tokenHash === undefined && felulirtUzenet(rf.uzenet),
      'W5b: a felülírt jóváhagyás lejart-válasza a KONKRÉT szöveg: „egy újabb jóváhagyás lezárta" (nem az általános „lejárt VAGY felülírta") + indítsd újra',
    )
    // W5bn — a lejartOka mindig az általános üzenetet adja (a levezetés elveszett)
    const mutansOk = SZERVER.replace(/function lejartOka\([\s\S]*?\n\}/, 'function lejartOka(_s: unknown): string {\n  return LEJART_UZENET.altalanos\n}')
    assert(mutansOk !== SZERVER, 'W5bn-előfeltétel: a mindig-általános mutáns előállítható')
    const mutansOkMod = require_(ir('szerver-w5bn-mutans.cjs', atir(t(mutansOk))))
    globalThis.__kartotekaAlAdmin = naploAdmin(allapotValasz(felulirtSor))
    const rfm = await mutansOkMod.lekerKapcsolasAllapot(kod1)
    assert(
      rfm.allapot === 'lejart' && !felulirtUzenet(rfm.uzenet) && /felülírta/.test(rfm.uzenet ?? '') && /indítsd újra/i.test(rfm.uzenet ?? ''),
      'W5bn: a mindig-általános mutáns a felülírt sorra az általános szöveget adja (a RÉGI laza minta még átengedné) — az őr tud pirosra váltani',
    )
    // W5c — a sima lejárt sor (sosem volt jóváhagyva): mindkét lehetséges okot megnevezi
    const simaLejart = { id: 'sor-l', allapot: 'lejart', token_hash: null, lejar: MULT, jovahagyva_at: null }
    globalThis.__kartotekaAlAdmin = naploAdmin(allapotValasz(simaLejart))
    const rs = await szerverMod.lekerKapcsolasAllapot(kod1)
    assert(
      rs.allapot === 'lejart' && /lejárt/.test(rs.uzenet ?? '') && /felülírta/.test(rs.uzenet ?? '') && /indítsd újra/i.test(rs.uzenet ?? ''),
      'W5c: a lejart sor általános üzenete mindkét okot megnevezi (lejárt VAGY felülírta) + újraindítás',
    )

    // W5n — a RÉGI világ: a jóváhagyott sor lejárata nem számít
    const mutansL = SZERVER.replace(/if \(sor\.allapot === 'jovahagyva' && lejartE\)/, 'if (false)')
    assert(mutansL !== SZERVER, 'W5n-előfeltétel: a lejárat-mutáns előállítható')
    const mutansLMod = require_(ir('szerver-w5-mutans.cjs', atir(t(mutansL))))
    globalThis.__kartotekaAlAdmin = naploAdmin(allapotValasz(lejartJovahagyott))
    const rml = await mutansLMod.lekerKapcsolasAllapot(kod1)
    assert(
      rml.allapot === 'jovahagyva' && rml.tokenHash === 'TITKOS-TOKEN',
      'W5n: a lejárat-vak mutáns a lejárt jóváhagyott sorból is kiadja a tokent — az őr tud pirosra váltani',
    )

    // ── W6: keresMasikFuggoJovahagyast — a jóváhagyó nézet jelzése FUNKCIONÁLISAN ──
    // (2026-09-05, a bíráló P3 találata: az A1–A3 csak az akció forrás-regexét és a
    // leképezést mérte; a szerver-oldali szűrők és a hiba-ág őrizetlenül álltak — a
    // `neq` nélkül a SAJÁT sor is „másik gép"-nek látszana, a `gt` nélkül egy lejárt
    // jóváhagyás hamis riasztás lenne, a fail-open hiba-ág hamisan „nincs"-et mondana.)
    const MASIK = { id: ID_REGI, eszkoz_nev: 'Otthoni gép', jovahagyva_at: MULT, lejar: JOVO }
    const olvasValasz = (opts = {}) => (h) => {
      if (h.muvelet === 'select' && szures(h, 'eq', 'id', ID_UJ)) {
        return {
          data: { id: ID_UJ, ellenorzo_kod: '123456', eszkoz_nev: 'Iroda', allapot: 'varakozik', user_id: null, created_at: MULT, lejar: JOVO, jovahagyva_at: null, felhasznalva_at: null },
          error: null,
        }
      }
      if (h.muvelet === 'select' && szures(h, 'eq', 'user_id', USER)) {
        if (opts.hiba) return { data: null, error: { message: 'kapcsolat megszakadt' } }
        return { data: opts.ures ? [] : [MASIK], error: null }
      }
      return { data: null, error: null }
    }
    const masikLekeres = (hivasok) => hivasok.find((h) => h.muvelet === 'select' && szures(h, 'eq', 'user_id', USER))
    /** A négy szűrő EGYÜTT: user_id · allapot=jovahagyva · a saját sor kizárva (neq) · csak élő (lejar > most). */
    const negySzuro = (h) =>
      Boolean(h) &&
      szures(h, 'eq', 'user_id', USER) &&
      szures(h, 'eq', 'allapot', 'jovahagyva') &&
      szures(h, 'neq', 'id', ID_UJ) &&
      h.szurok.some(([tp, c, v]) => tp === 'gt' && c === 'lejar' && typeof v === 'string' && Math.abs(Date.parse(v) - Date.now()) < 60_000)
    const olvas6 = async (mod, admin, userId) => {
      globalThis.__kartotekaAlAdmin = admin
      return mod.olvasKapcsolasKeres(ID_UJ, userId)
    }
    const admin6 = naploAdmin(olvasValasz())
    const o6 = await olvas6(szerverMod, admin6, USER)
    assert(
      negySzuro(masikLekeres(admin6.hivasok)) &&
        JSON.stringify(o6?.masikFuggoJovahagyas) === JSON.stringify({ allapot: 'van', id: ID_REGI, eszkoz_nev: 'Otthoni gép', jovahagyva_at: MULT, lejar: JOVO }),
      'W6: olvasKapcsolasKeres(id, userId) a másik függő jóváhagyást a NÉGY szűrővel keresi (user_id, jovahagyva, neq saját id, gt lejar=most), és { allapot: van, eszköznév, jovahagyva_at, lejar } alakban adja',
    )
    const o6h = await olvas6(szerverMod, naploAdmin(olvasValasz({ hiba: true })), USER)
    assert(
      o6h?.masikFuggoJovahagyas?.allapot === 'ismeretlen' && typeof o6h.masikFuggoJovahagyas.hiba === 'string',
      'W6a: a lekérdezés hibája → { allapot: ismeretlen, hiba } — nem néma „nincs"',
    )
    const o6u = await olvas6(szerverMod, naploAdmin(olvasValasz({ ures: true })), USER)
    assert(o6u?.masikFuggoJovahagyas?.allapot === 'nincs', 'W6b: üres találat → { allapot: nincs }')
    const admin6n = naploAdmin(olvasValasz())
    const o6n = await olvas6(szerverMod, admin6n, undefined)
    assert(
      o6n?.id === ID_UJ && o6n.masikFuggoJovahagyas === null && !masikLekeres(admin6n.hivasok),
      'W6c: userId nélkül a mező null (nem vizsgáltuk), és a második lekérdezés el sem indul',
    )
    // W6n — a fail-open mutáns: hiba → „nincs"
    const mutans6 = SZERVER.replace("return { allapot: 'ismeretlen', hiba: error.message }", "return { allapot: 'nincs' }")
    assert(mutans6 !== SZERVER, 'W6n-előfeltétel: a fail-open mutáns előállítható')
    const mutans6Mod = require_(ir('szerver-w6n-mutans.cjs', atir(t(mutans6))))
    const o6m = await olvas6(mutans6Mod, naploAdmin(olvasValasz({ hiba: true })), USER)
    assert(o6m?.masikFuggoJovahagyas?.allapot === 'nincs', 'W6n: a fail-open mutáns a hibára hamisan „nincs"-et mond — az őr tud pirosra váltani')
    // W6n2 — a saját sort kizáró `neq` törölve: a most jóváhagyandó sor is „másik gép"-nek látszana
    const mutans6b = SZERVER.replace(/(\.eq\('allapot', 'jovahagyva'\)\n\s*)\.neq\('id', kiveveId\)\n(\s*\.gt\('lejar')/, '$1$2')
    assert(mutans6b !== SZERVER, 'W6n2-előfeltétel: a neq nélküli mutáns előállítható (csak a keresésben, a felülírásban nem)')
    const mutans6bMod = require_(ir('szerver-w6n2-mutans.cjs', atir(t(mutans6b))))
    const admin6b = naploAdmin(olvasValasz())
    await olvas6(mutans6bMod, admin6b, USER)
    assert(
      Boolean(masikLekeres(admin6b.hivasok)) && !negySzuro(masikLekeres(admin6b.hivasok)),
      'W6n2: a neq nélküli mutáns lekérdezéséből hiányzik a saját sor kizárása — az őr tud pirosra váltani',
    )
  } finally {
    console.error = csendes
    delete globalThis.__kartotekaAudit
  }
}

// ── A1–A3: a JÓVÁHAGYÓ OLDAL bekötése (2026-09-05, ellenőrzés-ügynök) ──────
// A szerver-réteg (W4/W5) már jelzi a másik függő jóváhagyást és a felülírás
// számát — de ha az akció nem adja át a userId-t, és a panel nem írja ki, a
// lelkész VAKON hagy jóvá, és a másik gép várakozása némán szakad meg.
{
  const AKCIO = kommentNelkul(olvas(path.join(WEB, 'app/(dashboard)/desktop-kapcsolas/actions.ts')))
  const PANEL = kommentNelkul(olvas(path.join(WEB, 'components/desktop/desktop-kapcsolas-panel.tsx')))
  const NAPLO = kommentNelkul(olvas(path.join(WEB, 'lib/export/betekintes-naplo.ts')))
  const akcioOk = (k) =>
    /const sor = await olvasKapcsolasKeres\(id\.toLowerCase\(\), f\.userId\)/.test(k) &&
    /masikGepVarakozik: masikGepVarakozikNezet\(sor\.masikFuggoJovahagyas\)/.test(k) &&
    /return \{ ok: true, felulirva: eredmeny\.felulirva \}/.test(k)
  assert(akcioOk(AKCIO), 'A1: getKapcsolasKeres a userId-vel olvas (masikFuggoJovahagyas → masikGepVarakozik), a jóváhagyás a felulirva számot adja vissza')
  // A1n — a RÉGI világ: userId nélkül olvas → a szerver nem vizsgál (null), a panel nem tud szólni
  const akcioMutans = AKCIO.replace('const sor = await olvasKapcsolasKeres(id.toLowerCase(), f.userId)', 'const sor = await olvasKapcsolasKeres(id.toLowerCase())')
  assert(akcioMutans !== AKCIO && !akcioOk(akcioMutans), 'A1n: a userId nélkül olvasó (régi) akció-mutánson az őr BUKIK')
  // A1u — a leképezés FUTTATVA (a 'use server' fájlból kivágva, a többi import nélkül)
  const lekepezes = AKCIO.match(/function masikGepVarakozikNezet\([\s\S]*?\n\}/)?.[0]
  assert(Boolean(lekepezes), 'A1u-előfeltétel: a masikGepVarakozikNezet kivágható az akció-fájlból')
  if (lekepezes) {
    const m = require_(ir('akcio-lekepezes.cjs', t(`${lekepezes}\nexport { masikGepVarakozikNezet }`)))
    const van = m.masikGepVarakozikNezet({ allapot: 'van', id: 'sor-x', eszkoz_nev: 'Irodai gép', jovahagyva_at: '2026-09-05T10:00:00Z', lejar: '2026-09-05T10:10:00Z' })
    assert(
      m.masikGepVarakozikNezet(null) === null &&
        m.masikGepVarakozikNezet({ allapot: 'nincs' }) === null &&
        m.masikGepVarakozikNezet({ allapot: 'ismeretlen', hiba: 'db' }) === 'ismeretlen' &&
        JSON.stringify(van) === JSON.stringify({ eszkozNev: 'Irodai gép', jovahagyvaAt: '2026-09-05T10:00:00Z' }),
      'A1u: a leképezés — nem vizsgált/nincs → null; ismeretlen → „ismeretlen" (nem néma „nincs"); van → eszköznév + időbélyeg, a másik sor azonosítója nélkül',
    )
  }
  const panelOk = (k) =>
    /keres\.masikGepVarakozik === 'ismeretlen'/.test(k) &&
    /Nem sikerült ellenőrizni, van-e másik függő jóváhagyásod/.test(k) &&
    /annak a várakozása megszakad, ott újra kell indítani az összekapcsolást/.test(k) &&
    /allapot\.felulirva > 0 &&/.test(k) &&
    /A korábbi gép várakozása megszakadt — ott indítsd újra az összekapcsolást\./.test(k)
  assert(panelOk(PANEL), 'A2: a panel a döntés ELŐTT kiírja a másik gép függő jóváhagyását (ismeretlen: „nem sikerült ellenőrizni"), a jóváhagyás UTÁN a felülírást')
  const panelMutans = PANEL.replace(/\{!nemFolytathato && keres\.masikGepVarakozik && \([\s\S]*?\n        \)\}\n/, '')
  assert(panelMutans !== PANEL && !panelOk(panelMutans), 'A2n: a figyelmeztető sáv nélküli (néma) panel-mutánson az őr BUKIK')
  // A3 — az audit-kulcs a kimutatás szótárában is él (különben „ismeretlen műveletet végzett")
  const auditKulcs = SZERVER.match(/action: '(desktop\.kapcsolas_felulirva)'/)?.[1]
  assert(
    auditKulcs === 'desktop.kapcsolas_felulirva' && new RegExp(`'${auditKulcs}': '[^']*felülírta[^']*'`).test(NAPLO),
    'A3: a felülírás audit-kulcsa (szerver.ts) a betekintés-napló MUVELET_MONDATOK szótárában magyar mondattal szerepel',
  )
}

fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
