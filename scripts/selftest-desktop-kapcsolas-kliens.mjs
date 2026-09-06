#!/usr/bin/env node
// selftest-desktop-kapcsolas-kliens.mjs — az asztali eszköz-kapcsolás KLIENS-oldali
// várakozójának őrszemei (2026-09-05, P3-utómunka / desk-p3).
//
// (A szerver-oldali lánc — kód-aritmetika, CORS, middleware, SQL, spam-fék — a
// `selftest-desktop-kapcsolas.mjs`-ben él; ez a fájl az ASZTALI
// `apps/desktop/src/lib/desktop-kapcsolas.ts`-t és a varázslót méri.)
//
// ⛔ MI VOLT A HIBA
//   (1) az `allapot` útvonal ÁTMENETI hibája (HTTP 5xx, 429, hálózat, nem-JSON
//       proxy-lap) a kliensen `{ allapot: 'ismeretlen', uzenet: 'HTTP 503' }`
//       lett, amit a várakozó VÉGLEGES hibának vett — „Indíts újat", miközben a
//       lelkész a weben épp jóváhagyott; a hálózati kivételt a 10. után feladta;
//   (2) az elhalt belépő (`verifyOtp` bukás — pl. másik gépen újabb jóváhagyás
//       tette lejárttá a korábbi sort) nyers hibaszövegként jelent meg, és a
//       varázslóban nem volt egy gombos újraindítás.
//
// ŐRSZEMEK (mind negatív asszerttel — a mutánson BUKNIA kell)
//   K1   osztalyozAllapotHttp: 2xx ok; 0/408/425/429/5xx átmeneti; többi 4xx végleges
//   K2   ismeretlenAllapotAtmeneti: „nem válaszol" → átmeneti; „törölt kérés" → végleges
//   K2c  KERESZTFÁJL-őr (bíráló P3, 2026-09-05): a SZERVER (apps/web/lib/desktop-
//        kapcsolas/szerver.ts lekerKapcsolasAllapot) MINDEN `ismeretlen` üzenet-
//        literálját a kliens ismeretlenAllapotAtmeneti-je osztályozza — a hiba-ág
//        (DB-hiba, „nem válaszol") → ÁTMENETI, a hiányzó sor („törölt kérés") →
//        VÉGLEGES; ismeretlen ág-alak → az őr bukik (nem találgat)
//   K2cn két mutáns (a szerver átfogalmazza az átmeneti üzenetet / a végleges
//        üzenetbe kerül a kulcsszó) → BUKIK
//   K3   atmenetiVisszalepesMs: duplázódik, plafonnal
//   F1   varjJovahagyasra FUTTATVA (ál-fetch + ál-Supabase): 503 → 429 → hálózat →
//        502-HTML → varakozik → ismeretlen(„nem válaszol") → jovahagyva: SIKER;
//        onZavar szólt, majd null-lal jelezte a gyógyulást; a verifyOtp a tokent kapta
//   F1n  két mutáns (5xx végleges / minden hiba végleges — a régi világ) → BUKIK
//   F2   4xx (404) → azonnal végleges hiba, ujrainditas, EGY kérés
//   F3   szerver `lejart` (üzenettel) → lejart + ujrainditas + az üzenet átmegy
//   F4   verifyOtp otp_expired/403 → lejart + ujrainditas + az ÉRTHETŐ üzenet,
//        a token NEM szerepel benne; általános verifyOtp-hiba → hiba + ujrainditas
//   F5   felhasznalva / törölt kérés → hiba + ujrainditas; elutasitva → nincs ujrainditas
//   F6   folyamatos 503 a LEJÁRATIG: a várakozó NEM adja fel korábban (≥3 kérés),
//        a végén lejart + ujrainditas + az üzenet a hálózatra utal
//   F7   abort → megszakitva
//   W1   forrás-őr: sem a kliens, sem a varázsló nem naplózza / nem írja üzenetbe a
//        kódot vagy a tokent
//   U1   forrás-őr: a varázsló `ujrainditas`-ból gombot mutat (Összekapcsolás
//        újraindítása → inditWebesKapcsolast), onZavar-t köt be és mutatja a zavart,
//        a gomb min-h-11 (érintőfelület)
//   U1n  mutáns (a gomb kivéve) → BUKIK
//   U2   forrás-őr (bíráló P3): a varázsló figyelmeztető dobozai — a várakozás
//        alatti zavar-doboz is — a téma-token/alpha mintát hordják (az auth-gate
//        GateLap-é: border-amber-500/40 bg-amber-500/10 text-foreground), nyers
//        amber paletta (bg-amber-50, text-amber-900…) és dark: variáns nélkül
//   U2n  mutáns (a zavar-doboz a régi bg-amber-50 + dark: alakra) → BUKIK
//
// Futtatás:  node scripts/selftest-desktop-kapcsolas-kliens.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const LIB = path.join(ROOT, 'apps', 'desktop', 'src', 'lib')

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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const KLIENS_SRC = fs.readFileSync(path.join(LIB, 'desktop-kapcsolas.ts'), 'utf8')
const ERROR_SRC = fs.readFileSync(path.join(LIB, 'error.ts'), 'utf8')
const KOD_SRC = fs.readFileSync(path.join(ROOT, 'packages', 'supabase-client', 'src', 'desktop-kapcsolas-kod.ts'), 'utf8')
const WIZARD_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src', 'pages', 'elso-inditas-page.tsx'), 'utf8')

// ── Műhely: a kliens betöltése ADOTT forrással, a projekt-importok stubjaival ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-dk-kliens-'))
const ir = (nev, js) => {
  const p = path.join(tmp, nev)
  fs.writeFileSync(p, js)
  return p
}
ir('error.cjs', t(ERROR_SRC))
ir('kod.cjs', t(KOD_SRC))
ir('opener.cjs', 'exports.openUrl = async () => {}')
ir('supabase.cjs', 'exports.getDesktopSupabase = () => globalThis.__alSupabase')

let betoltesSzam = 0
function betoltKlienst(src) {
  // `import.meta.env` a CJS-ben szintaxishiba → üres env (az alap origó marad).
  const js = t(src.replace(/import\.meta\.env/g, '({})'))
    .replace(/require\(["']@tauri-apps\/plugin-opener["']\)/g, `require(${JSON.stringify(path.join(tmp, 'opener.cjs'))})`)
    .replace(/require\(["']@kartoteka\/supabase-client["']\)/g, `require(${JSON.stringify(path.join(tmp, 'kod.cjs'))})`)
    .replace(/require\(["']\.\/error["']\)/g, `require(${JSON.stringify(path.join(tmp, 'error.cjs'))})`)
    .replace(/require\(["']\.\/supabase["']\)/g, `require(${JSON.stringify(path.join(tmp, 'supabase.cjs'))})`)
  betoltesSzam += 1
  return require_(ir(`kliens-${betoltesSzam}.cjs`, js))
}

const kliens = betoltKlienst(KLIENS_SRC)

// ── K: tiszta osztályozók ──────────────────────────────────────────────────
{
  const o = kliens.osztalyozAllapotHttp
  assert(o(200) === 'ok' && o(204) === 'ok', 'K1a 2xx → ok')
  assert([0, 408, 425, 429, 500, 502, 503, 504].every((s) => o(s) === 'atmeneti'), 'K1b 0/408/425/429/5xx → ÁTMENETI (a várakozás folytatódik)')
  assert([400, 401, 403, 404, 410, 422].every((s) => o(s) === 'vegleges'), 'K1c 400/401/403/404/410/422 → VÉGLEGES')
  assert(kliens.ismeretlenAllapotAtmeneti('A szerver most nem válaszol — az app újra próbálja.') === true, 'K2a „nem válaszol" ismeretlen → átmeneti')
  assert(kliens.ismeretlenAllapotAtmeneti('Ismeretlen vagy már törölt kérés.') === false && kliens.ismeretlenAllapotAtmeneti(undefined) === false, 'K2b „törölt kérés" / üzenet nélkül → végleges')
  const v = kliens.atmenetiVisszalepesMs
  assert(v(1, 100) === 100 && v(2, 100) === 200 && v(3, 100) === 400 && v(0, 100) === 100, 'K3a a visszalépés duplázódik (alap × 2^(n-1))')
  assert(v(10, 100, 1500) === 1500 && v(6, 2000) === kliens.VISSZALEPES_MAX_MS, 'K3b plafon (alap: 15 mp)')
}

// ── K2c: KERESZTFÁJL-őr — a SZERVER `ismeretlen` literáljai a kliens osztályozóján ──
// A kliens egy magyar üzenetszövegre kulcsol a hálózati határon át; a szerver
// fájlja (kapcsolas-p3 tulajdon) egy átfogalmazással némán véglegessé tenné a
// gyógyuló DB-hibát. Ezért itt a SZERVER forrásából kinyert literálokat mérjük.
const SZERVER_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'lib', 'desktop-kapcsolas', 'szerver.ts'), 'utf8')
/**
 * A szerver `ismeretlen` válaszai a kiváltó ág alakjával: `if (error) {…return}` /
 * `if (igenyError) {…}` → DB-hiba (ÁTMENETI), `if (!data) return …` → hiányzó sor
 * (VÉGLEGES). Más ág-alak → `vart: null` → az őr bukik (fail-closed), nem találgat.
 */
function szerverIsmeretlenLiteralok(src) {
  const s = stripComments(src)
  const re = /if \((!?[A-Za-z]+)\)\s*(?:\{[^{}]*?)?\s*return \{ allapot: 'ismeretlen', uzenet: '([^']+)' \}/g
  const lista = []
  for (const m of s.matchAll(re)) {
    const felt = m[1]
    const vart = felt.startsWith('!') ? 'vegleges' : /error/i.test(felt) ? 'atmeneti' : null
    lista.push({ felt, uzenet: m[2], vart })
  }
  return lista
}
function keresztOr(szerverSrc, mod) {
  const lista = szerverIsmeretlenLiteralok(szerverSrc)
  const hibak = []
  if (lista.filter((x) => x.vart === 'atmeneti').length < 2) hibak.push('nincs meg a szerver két átmeneti (DB-hiba) ága')
  if (lista.filter((x) => x.vart === 'vegleges').length < 1) hibak.push('nincs meg a szerver végleges (hiányzó sor) ága')
  for (const x of lista) {
    if (!x.vart) {
      hibak.push(`ismeretlen ág-alak: if (${x.felt})`)
      continue
    }
    const kapott = mod.ismeretlenAllapotAtmeneti(x.uzenet) ? 'atmeneti' : 'vegleges'
    if (kapott !== x.vart) hibak.push(`„${x.uzenet}" (if (${x.felt})): a kliens ${kapott}-nek veszi, a szerver ${x.vart}-nek szánta`)
  }
  return hibak
}
{
  const hibak = keresztOr(SZERVER_SRC, kliens)
  assert(hibak.length === 0, `K2c a szerver minden 'ismeretlen' literálját a kliens a szánt osztályba sorolja (hiba-ág → átmeneti, hiányzó sor → végleges) (${hibak.join('; ') || 'rendben'})`)
  const mutA = SZERVER_SRC.split('A szerver most nem válaszol — az app újra próbálja.').join('A szerver átmenetileg nem elérhető — az app újra próbálja.')
  assert(mutA !== SZERVER_SRC && keresztOr(mutA, kliens).length > 0, 'K2cn/a mutáns (a szerver átfogalmazza az átmeneti üzenetet) → az őr BUKIK — különben a kliens végleges hibának venné a gyógyuló zavart')
  const mutB = SZERVER_SRC.replace("uzenet: 'Ismeretlen vagy már törölt kérés.'", "uzenet: 'A kérés nem válaszol: ismeretlen vagy már törölt.'")
  assert(mutB !== SZERVER_SRC && keresztOr(mutB, kliens).length > 0, 'K2cn/b mutáns (a végleges üzenetbe kerül a kulcsszó) → az őr BUKIK — különben a kliens a lejáratig várna egy törölt kérésre')
}

// ── F: a várakozó FUTTATVA — ál-fetch (forgatókönyv) + ál-Supabase ─────────
const KOD = 'A'.repeat(43)
const TOKEN = 'titkos-token-hash-0123456789'
function keresMinta(lejarMs = 60_000) {
  return { kod: KOD, id: '11111111-1111-4111-8111-111111111111', ellenorzo: '123 456', lejar: new Date(Date.now() + lejarMs).toISOString(), url: 'https://kartoteka.app/x' }
}
/**
 * Forgatókönyv-alapú fetch: a lista elemei sorban jönnek; az utolsó ismétlődik.
 *  - { status, json }  → JSON-válasz
 *  - { status, text }  → nem-JSON (proxy-lap)
 *  - 'halozat'         → a fetch dob (TypeError: Failed to fetch)
 */
function alFetch(lista) {
  const hivasok = []
  globalThis.fetch = async (url, init) => {
    hivasok.push({ url: String(url), body: init?.body })
    const i = Math.min(hivasok.length - 1, lista.length - 1)
    const elem = lista[i]
    if (elem === 'halozat') throw new TypeError('Failed to fetch')
    if ('text' in elem) return new Response(elem.text, { status: elem.status, headers: { 'content-type': 'text/html' } })
    return new Response(JSON.stringify(elem.json), { status: elem.status, headers: { 'content-type': 'application/json' } })
  }
  return hivasok
}
function alSupabase(verifyEredmeny) {
  const hivasok = []
  globalThis.__alSupabase = {
    auth: {
      verifyOtp: async (arg) => {
        hivasok.push(arg)
        return verifyEredmeny
      },
    },
  }
  return hivasok
}
const GYORS = { lekerdezesMs: 4, visszalepesMaxMs: 16 }
async function futtatVarakozot(mod, lista, verifyEredmeny = { data: {}, error: null }, extra = {}) {
  const fetchHivasok = alFetch(lista)
  const otpHivasok = alSupabase(verifyEredmeny)
  const zavarok = []
  const eredmeny = await mod.varjJovahagyasra(extra.keres ?? keresMinta(), {
    ...GYORS,
    onZavar: (u) => zavarok.push(u),
    signal: extra.signal,
  })
  return { eredmeny, fetchHivasok, otpHivasok, zavarok }
}

const F1_LISTA = [
  { status: 503, json: { allapot: 'ismeretlen', uzenet: 'Service Unavailable' } },
  { status: 429, json: { allapot: 'ismeretlen', uzenet: 'Too Many Requests' } },
  'halozat',
  { status: 502, text: '<html>Bad Gateway</html>' },
  { status: 200, json: { allapot: 'varakozik' } },
  { status: 200, json: { allapot: 'ismeretlen', uzenet: 'A szerver most nem válaszol — az app újra próbálja.' } },
  { status: 200, json: { allapot: 'jovahagyva', tokenHash: TOKEN } },
]
{
  const { eredmeny, fetchHivasok, otpHivasok, zavarok } = await futtatVarakozot(kliens, F1_LISTA)
  assert(eredmeny.ok === true, `F1 503 → 429 → hálózat → 502-HTML → varakozik → ismeretlen(nem válaszol) → jovahagyva: SIKER (kapott: ${JSON.stringify(eredmeny)})`)
  assert(fetchHivasok.length === 7, `F1a mind a 7 kör lefutott, nem adta fel (kérések: ${fetchHivasok.length})`)
  assert(otpHivasok.length === 1 && otpHivasok[0].token_hash === TOKEN && otpHivasok[0].type === 'magiclink', 'F1b a verifyOtp a tokent kapta (magiclink)')
  const nemNull = zavarok.filter((z) => z !== null)
  assert(nemNull.length >= 5 && zavarok.includes(null), `F1c az onZavar minden átmeneti zavarnál szólt (${nemNull.length}×), és a gyógyulást null-lal jelezte`)
  assert(!zavarok.some((z) => typeof z === 'string' && (z.includes(KOD) || z.includes(TOKEN))), 'F1d a zavar-üzenetekben nincs kód/token')
  assert(fetchHivasok.every((h) => h.url === 'https://kartoteka.app/api/desktop-kapcsolas/allapot' && JSON.parse(h.body).kod === KOD), 'F1e a lekérdezés az allapot útvonalra megy a titkos kóddal (törzsben, nem URL-ben)')

  // F1n/a — a RÉGI világ: az 5xx végleges
  const mutA = KLIENS_SRC.replace(
    "if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'atmeneti'",
    "if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'vegleges'",
  )
  assert(mutA !== KLIENS_SRC, 'F1n/a-előfeltétel: a mutáns előállítható')
  const ra = await futtatVarakozot(betoltKlienst(mutA), F1_LISTA)
  assert(ra.eredmeny.ok === false && ra.fetchHivasok.length === 1, 'F1n/a mutáns (5xx végleges) → az első 503-nál feladja — az őr tud pirosra váltani')
  // F1n/b — a RÉGI világ: minden lekérdezési kivétel végleges
  const mutB = KLIENS_SRC.replace('if (err instanceof AllapotVeglegesHiba) {', 'if (true) {')
  assert(mutB !== KLIENS_SRC, 'F1n/b-előfeltétel: a mutáns előállítható')
  const rb = await futtatVarakozot(betoltKlienst(mutB), F1_LISTA)
  assert(rb.eredmeny.ok === false, 'F1n/b mutáns (minden hiba végleges) → BUKIK')
}
{
  const { eredmeny, fetchHivasok } = await futtatVarakozot(kliens, [{ status: 404, json: { allapot: 'ismeretlen', uzenet: 'Nincs ilyen útvonal.' } }])
  assert(eredmeny.ok === false && eredmeny.ok_tipus === 'hiba' && eredmeny.ujrainditas === true && fetchHivasok.length === 1, `F2 404 → azonnal végleges hiba + ujrainditas, EGY kéréssel (kapott: ${JSON.stringify(eredmeny)})`)
  const r400 = await futtatVarakozot(kliens, [{ status: 400, json: { allapot: 'ismeretlen', uzenet: 'Hibás kapcsolási kód.' } }])
  assert(r400.eredmeny.ok === false && /Hibás kapcsolási kód/.test(r400.eredmeny.uzenet), 'F2a a 400 üzenete átmegy a felületre')
}
{
  const { eredmeny } = await futtatVarakozot(kliens, [{ status: 200, json: { allapot: 'lejart', uzenet: 'A jóváhagyás érvényét vesztette: másik gépen újabb jóváhagyás készült.' } }])
  assert(eredmeny.ok === false && eredmeny.ok_tipus === 'lejart' && eredmeny.ujrainditas === true && /érvényét vesztette/.test(eredmeny.uzenet), `F3 szerver „lejart" → lejart + ujrainditas + a szerver üzenete (kapott: ${JSON.stringify(eredmeny)})`)
}
{
  const jovahagyva = [{ status: 200, json: { allapot: 'jovahagyva', tokenHash: TOKEN } }]
  const r1 = await futtatVarakozot(kliens, jovahagyva, { data: null, error: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' } })
  assert(
    r1.eredmeny.ok === false && r1.eredmeny.ok_tipus === 'lejart' && r1.eredmeny.ujrainditas === true && r1.eredmeny.uzenet === kliens.BELEPO_ELHALT_UZENET,
    `F4 elhalt belépő (otp_expired/403) → lejart + ujrainditas + az ÉRTHETŐ „indítsd újra" üzenet (kapott: ${JSON.stringify(r1.eredmeny)})`,
  )
  assert(!r1.eredmeny.uzenet.includes(TOKEN) && /újra/i.test(r1.eredmeny.uzenet), 'F4a az üzenetben nincs token, és újraindításra hív')
  const r2 = await futtatVarakozot(kliens, jovahagyva, { data: null, error: { status: 500, message: 'Database error' } })
  assert(r2.eredmeny.ok === false && r2.eredmeny.ok_tipus === 'hiba' && r2.eredmeny.ujrainditas === true && /Database error/.test(r2.eredmeny.uzenet) && !r2.eredmeny.uzenet.includes(TOKEN), 'F4b általános verifyOtp-hiba → hiba + ujrainditas, a hiba szövegével, token nélkül')
  assert(kliens.belepoElhalt({ status: 401 }) && kliens.belepoElhalt({ message: 'Email link is invalid or has expired' }) && !kliens.belepoElhalt({ status: 500, message: 'x' }) && !kliens.belepoElhalt(null), 'F4c belepoElhalt: 401/403/404, otp_expired, „expired/invalid" → igen; 500 → nem')
}
{
  const r1 = await futtatVarakozot(kliens, [{ status: 200, json: { allapot: 'felhasznalva', uzenet: 'A belépő-token már fel lett használva.' } }])
  assert(r1.eredmeny.ok === false && r1.eredmeny.ok_tipus === 'hiba' && r1.eredmeny.ujrainditas === true, 'F5a felhasznalva → hiba + ujrainditas (fail-closed)')
  const r2 = await futtatVarakozot(kliens, [{ status: 200, json: { allapot: 'ismeretlen', uzenet: 'Ismeretlen vagy már törölt kérés.' } }])
  assert(r2.eredmeny.ok === false && r2.eredmeny.ok_tipus === 'hiba' && r2.eredmeny.ujrainditas === true && r2.fetchHivasok.length === 1, 'F5b törölt kérés (ismeretlen, végleges üzenet) → hiba + ujrainditas, egy kéréssel')
  const r3 = await futtatVarakozot(kliens, [{ status: 200, json: { allapot: 'elutasitva' } }])
  assert(r3.eredmeny.ok === false && r3.eredmeny.ok_tipus === 'elutasitva' && !r3.eredmeny.ujrainditas, 'F5c elutasitva → elutasitva, ujrainditas nélkül')
}
{
  const { eredmeny, fetchHivasok, zavarok } = await futtatVarakozot(kliens, [{ status: 503, json: { allapot: 'ismeretlen', uzenet: 'Service Unavailable' } }], undefined, { keres: keresMinta(70) })
  assert(eredmeny.ok === false && eredmeny.ok_tipus === 'lejart' && eredmeny.ujrainditas === true, `F6 folyamatos 503-nál a LEJÁRATIG vár, aztán lejart + ujrainditas (kapott: ${JSON.stringify(eredmeny)})`)
  assert(fetchHivasok.length >= 3 && zavarok.length >= 3, `F6a nem adta fel korábban: ${fetchHivasok.length} kérés, ${zavarok.length} zavar-jelzés`)
  assert(/nem válaszolt|internet/i.test(eredmeny.uzenet), 'F6b a lejárat üzenete a hálózati zavarra utal')
}
{
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 8)
  const { eredmeny } = await futtatVarakozot(kliens, [{ status: 200, json: { allapot: 'varakozik' } }], undefined, { signal: ac.signal })
  assert(eredmeny.ok === false && eredmeny.ok_tipus === 'megszakitva', 'F7 abort → megszakitva')
}

// ── W1: a kód/token SOHA nem kerül naplóba vagy üzenetbe ───────────────────
function titokNaploOr(src) {
  const s = stripComments(src)
  const hibak = []
  if (/console\.(log|error|warn|info|debug)\([^)]*\b(kod|keres\.kod|tokenHash|token_hash)\b/.test(s)) hibak.push('console.* a kóddal/tokennel')
  // Üzenet-sablonba (template literal) interpolált titok
  if (/\$\{[^}]*(tokenHash|token_hash|keres\.kod)[^}]*\}/.test(s)) hibak.push('a kód/token üzenetbe interpolálva')
  return hibak
}
{
  const h1 = titokNaploOr(KLIENS_SRC)
  const h2 = titokNaploOr(WIZARD_SRC)
  assert(h1.length === 0 && h2.length === 0, `W1 sem a kliens, sem a varázsló nem naplózza / nem írja üzenetbe a kódot vagy a tokent (${[...h1, ...h2].join('; ') || 'rendben'})`)
  const mut = KLIENS_SRC.replace('return { ok: true }', "console.warn('belépő', allapot.tokenHash)\n      return { ok: true }")
  assert(mut !== KLIENS_SRC && titokNaploOr(mut).length > 0, 'W1n mutáns (a token a naplóba kerül) → az őr BUKIK')
}

// ── U1: a varázsló — újraindítás gomb + a zavar mutatása ───────────────────
function varazsloOr(src) {
  const s = stripComments(src)
  const hibak = []
  if (!/const \[belepesUjrainditas, setBelepesUjrainditas\] = useState\(false\)/.test(s)) hibak.push('nincs belepesUjrainditas állapot')
  if (!/setBelepesUjrainditas\(eredmeny\.ujrainditas === true\)/.test(s)) hibak.push('az eredmény ujrainditas-a nem kerül az állapotba')
  if (!/onZavar: setKapcsolasZavar/.test(s)) hibak.push('az onZavar nincs bekötve a várakozóba')
  if (!/\{kapcsolasZavar && \(/.test(s)) hibak.push('a zavar nem jelenik meg a várakozás alatt')
  const gomb = s.match(/\{belepesUjrainditas && \(\s*<Button[\s\S]*?<\/Button>\s*\)\}/)
  if (!gomb) hibak.push('nincs újraindítás gomb a hiba mellett')
  else {
    if (!/onClick=\{\(\) => void inditWebesKapcsolast\(\)\}/.test(gomb[0])) hibak.push('a gomb nem az inditWebesKapcsolast-ot hívja')
    if (!/Összekapcsolás újraindítása/.test(gomb[0])) hibak.push('a gomb felirata nem az újraindításról szól')
    if (!/min-h-11/.test(gomb[0])) hibak.push('a gomb érintőfelülete 44 px alatt')
    if (!/disabled=\{belepesFut\}/.test(gomb[0])) hibak.push('a gomb futás közben is kattintható (dupla indítás)')
  }
  return hibak
}
{
  const hibak = varazsloOr(WIZARD_SRC)
  assert(hibak.length === 0, `U1 a varázsló: ujrainditas → „Összekapcsolás újraindítása" gomb (min-h-11, futás alatt tiltva), onZavar bekötve és mutatva (${hibak.join('; ') || 'rendben'})`)
  const mut = WIZARD_SRC.replace(/\{belepesUjrainditas && \(\s*<Button[\s\S]*?<\/Button>\s*\)\}/, '')
  assert(mut !== WIZARD_SRC && varazsloOr(mut).length > 0, 'U1n mutáns (az újraindítás gomb kivéve) → az őr BUKIK')
}

// ── U2: a varázsló figyelmeztető dobozai — téma-token/alpha minta, nyers paletta nélkül ──
// (bíráló P3, 2026-09-05) A projekt-elv: sötét mód CSAK téma-tokenekkel. A desktop
// témájában nincs warning token; a bevett figyelmeztető minta az auth-gate GateLap-é
// (border-amber-500/40 bg-amber-500/10 + text-foreground), ami dark: variáns nélkül
// mindkét témában olvasható. A nyers bg-amber-50 + dark:bg-amber-950/30 pár ellene megy.
function figyelmeztetoMintaOr(src) {
  const s = stripComments(src)
  const hibak = []
  const zavar = s.match(/\{kapcsolasZavar && \(\s*<p[^>]*className="([^"]*)"/)
  if (!zavar) hibak.push('nincs meg a várakozás alatti zavar-doboz')
  else {
    const cls = zavar[1]
    for (const kell of ['border-amber-500/40', 'bg-amber-500/10', 'text-foreground']) {
      if (!cls.includes(kell)) hibak.push(`a zavar-doboz osztályai közül hiányzik: ${kell}`)
    }
    if (/dark:/.test(cls)) hibak.push('a zavar-doboz dark: variánst hord (a téma-token/alpha minta nem igényli)')
  }
  const nyers = s.match(/\b(bg-amber-50|bg-amber-950\/30|text-amber-900|text-amber-100|border-amber-300\/70|border-amber-700\/60)\b/g)
  if (nyers) hibak.push(`nyers amber paletta a varázslóban: ${[...new Set(nyers)].join(', ')}`)
  return hibak
}
{
  const hibak = figyelmeztetoMintaOr(WIZARD_SRC)
  assert(hibak.length === 0, `U2 a varázsló figyelmeztető dobozai (a zavar-doboz is) a GateLap alpha-mintáját hordják (border-amber-500/40 bg-amber-500/10 text-foreground), dark: variáns és nyers paletta nélkül (${hibak.join('; ') || 'rendben'})`)
  const mut = WIZARD_SRC.replace(
    'border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-foreground',
    'border-amber-300/70 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100',
  )
  assert(mut !== WIZARD_SRC && figyelmeztetoMintaOr(mut).length > 0, 'U2n mutáns (a zavar-doboz a régi nyers amber + dark: alakra) → az őr BUKIK')
}

fs.rmSync(tmp, { recursive: true, force: true })

console.log('')
if (failedCount > 0) {
  console.error(`${failedCount}/${total} teszt HIBÁS`)
  process.exit(1)
}
console.log(`${total}/${total} teszt zöld — asztali eszköz-kapcsolás kliens rendben`)
process.exit(0)
