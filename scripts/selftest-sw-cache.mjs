#!/usr/bin/env node
/**
 * SERVICE WORKER GYORSTÁR önellenőrzés (2026-08-24).
 *
 * Mit véd:
 *   · apps/web/app/sw.ts — a PWA service worker runtime-cache szabályai
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — A GYORSTÁR SZEMÉLYES ADATOT ÍRT A LEMEZRE
 * ════════════════════════════════════════════════════════════════════════════
 * A `sw.ts` a `runtimeCaching: [authRouteCaching, ...defaultCache]` sorral
 * VÁLOGATÁS NÉLKÜL átvette a @serwist/next alapkészletét. Abban négy
 * NetworkFirst szabály ADATOT tesz a Cache Storage-be, 24 órára:
 *
 *   · `pages-rsc-prefetch` és `pages-rsc` — minden azonos eredetű, `RSC: 1`
 *     fejlécű kérés. Az RSC-payload maga a kirenderelt szerver-komponens
 *     ADATA: névsorok, CNP-k, pénzügyi sorok.
 *   · `pages` — a HTML dokumentumok.
 *   · `apis` — minden azonos eredetű `/api/*` GET, `networkTimeoutSeconds: 10`
 *     mellett (lassú hálón a 10. másodperc után a LEMEZRŐL jött a válasz).
 *
 * Közös hivatali gépen ez azt jelentette, hogy a kartoték adatai olvasható
 * fájlként a lemezen maradtak. (A kijelentkezéskori ürítést egy korábbi kör
 * már megcsinálta — `lib/utils/helyi-tarolo-urites.ts` —, de az csak akkor
 * véd, ha a felhasználó tényleg kijelentkezik.)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ AMIT EZ AZ ŐRSZEM MÁSKÉNT CSINÁL, MINT EGY SZÖVEGKERESŐ
 * ════════════════════════════════════════════════════════════════════════════
 * A négy cache NÉV SZERINTI kiszűrése ÖNMAGÁBAN NEM ELÉG — és ez pont az a
 * fajta hiba, amit egy szöveges mérce nem lát meg:
 *
 *   · a `pages` bejegyzés a KÉRÉS `Content-Type` fejlécét nézi, amit a
 *     böngésző navigációnál NEM küld → ez a szabály a gyakorlatban sosem
 *     fogott, a kirenderelt HTML valójában az `others` gyűjtőbe esett;
 *   · ha a két RSC-bejegyzést eltávolítjuk, az RSC-kérés is az `others`
 *     gyűjtőbe csúszik (`sameOrigin && !pathname.startsWith("/api/")`) —
 *     vagyis a „javítás" után is lemezre kerül.
 *
 * Ezért az őrszem a szabályokat VALÓBAN LEFUTTATJA: a `sw.ts`-t átfordítja,
 * a @serwist/next VALÓDI alapkészletét betölti (csak a stratégia-osztályokat
 * cseréli bábura), majd szintetikus kéréseket ereszt rá, és megnézi, MELYIK
 * szabály nyer. Így a mérce a viselkedést méri, nem a szándékot.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A MÉRCÉK
 * ════════════════════════════════════════════════════════════════════════════
 *  S1 HORGONY     — a @serwist/next alapkészletében tényleg megvan mind a négy
 *                   adat-cache neve (ha átnevezték, a szűrő némán vak lenne).
 *  S2 SZINTAXIS   — a `sw.ts` TS-értelemben elemezhető.
 *  S3 SZÖVEG      — a `sw.ts` (KOMMENTEK NÉLKÜL) nem szórja szét nyersen a
 *                   `defaultCache`-t a `runtimeCaching` tömbbe.
 *  S4 ADAT        — dokumentum-, RSC- és `/api/*` GET-kérés a hitelesített
 *                   felületen NetworkOnly-t kap (nem megy lemezre).
 *  S5 PUBLIKUS    — a `/gy/` gyülekezeti oldal TOVÁBBRA IS cache-elhető.
 *  S6 APP-HÉJ     — a héj (JS, CSS, ikon, betűkészlet, statikus JSON) és a
 *                   Google Fonts TOVÁBBRA IS cache-elhető.
 *  S7 SZERKEZET   — a végleges szabálylistában egyetlen handler cache-neve
 *                   sem a négy adat-cache egyike.
 *  S8 NEGATÍV ASSZERT — a MAI forrásból előállított „régi világ" és a
 *                   mutánsok ténylegesen ELBUKNAK. Őr negatív asszert nélkül
 *                   vak. (A régi világot NEM a git-történelemből vesszük:
 *                   commit után a HEAD már a javított fájl lenne, sekély
 *                   CI-klónban pedig egy rögzített commit sem érhető el.)
 *  S9 TARTALÉK    — az ADATMENTES offline tartalék lap (2026-08-25).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * S9 — MIÉRT KELL RÁ KÜLÖN MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 * A fenti javítás ára az volt, hogy offline a böngésző CSUPASZ hibaoldala
 * fogadta a lelkészt. Erre jött a Serwist `fallbacks`: internet nélkül a
 * `public/nincs-internet.html` jelenik meg. Ennek HÁROM, egymástól független
 * feltétele van, és MINDHÁROM tud NÉMÁN elromlani:
 *
 *   (1) a `sw.ts` `fallbacks` bejegyzése a helyes URL-re mutat, és CSAK
 *       navigációra szól (RSC-nek vagy `/api`-nak HTML-t visszaadni rosszabb,
 *       mint hibázni);
 *   (2) a lap PRECACHE-ELVE van — a `next.config.ts` `globPublicPatterns`
 *       POZITÍV lista, ami nincs benne, az nincs a lemezen. Enélkül a
 *       `matchPrecache` üresen tér vissza, és a tartalék lap pont akkor nem
 *       elérhető, amikor kellene;
 *   (3) a `proxy.ts` matcher KIHAGYJA a lapot. Enélkül a Supabase
 *       `updateSession` a bejelentkezetlen kérést a `/login`-ra irányítja — és
 *       mivel a service worker telepítése tipikusan a bejelentkezés ELŐTT fut
 *       le, a precache-be a BEJELENTKEZŐ OLDAL kerülne offline tartaléknak.
 *
 * Plusz a lényeg: a tartalék lap LEMEZRE kerül, tehát bizonyítani kell, hogy
 * ADATMENTES — nincs benne hálózati hívás, IndexedDB-olvasás, külső
 * hivatkozás és szerver-oldali behelyettesítés. (Ezért NEM egy Next-oldalt
 * precache-elünk: az `/offline` oldal payloadjába a `(dashboard)` layout a
 * bejelentkezett felhasználó profilját és a gyülekezet nevét is beleadja.)
 *
 * Futtatás:  node scripts/selftest-sw-cache.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// A @serwist/next alapkészlete MODUL-BETÖLTÉSKOR dönt: fejlesztői módban
// mindenre NetworkOnly-t ad, és akkor a mérce hamis biztonságot mutatna.
// Az ÉLES listát akarjuk mérni, ezért itt kényszerítjük a production ágat.
process.env.NODE_ENV = 'production'

const SW_REL = 'apps/web/app/sw.ts'
const SW_ABS = path.join(ROOT, SW_REL)
const SERWIST_WORKER_ABS = path.join(ROOT, 'node_modules/@serwist/next/dist/index.worker.js')

/* ── S9: az offline tartalék lap három lába ───────────────────────────────── */
const TARTALEK_REL = 'apps/web/public/nincs-internet.html'
const TARTALEK_ABS = path.join(ROOT, TARTALEK_REL)
/** A fájlnév, ahogy a `globPublicPatterns` pozitív listájában szerepel. */
const TARTALEK_FAJLNEV = 'nincs-internet.html'
/** Az URL, amit a `sw.ts` `fallbacks` bejegyzésének használnia kell. */
const TARTALEK_URL = '/nincs-internet.html'

const SERWIST_MAG_DIR = path.join(ROOT, 'node_modules/serwist/dist')

/**
 * A `serwist` mag-csomag forrása egyben (index + chunkok). A chunk-fájlnevek
 * verzióról verzióra változnak, ezért nem egy fájlnévre horgonyzunk.
 * FAIL-CLOSED: ha a könyvtár nincs meg, kivétel.
 */
function serwistMagForras() {
  if (!fs.existsSync(SERWIST_MAG_DIR)) {
    throw new Error(`a serwist mag-csomag nem található: ${SERWIST_MAG_DIR} (fail-closed)`)
  }
  const darabok = [path.join(SERWIST_MAG_DIR, 'index.js')]
  const chunkDir = path.join(SERWIST_MAG_DIR, 'chunks')
  if (fs.existsSync(chunkDir)) {
    for (const f of fs.readdirSync(chunkDir)) {
      if (f.endsWith('.js')) darabok.push(path.join(chunkDir, f))
    }
  }
  return darabok
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n')
}

const NEXT_CONFIG_REL = 'apps/web/next.config.ts'
const NEXT_CONFIG_ABS = path.join(ROOT, NEXT_CONFIG_REL)
const PROXY_REL = 'apps/web/proxy.ts'
const PROXY_ABS = path.join(ROOT, PROXY_REL)

/** A @serwist/next alapkészletének ADAT-cache-ei — ezek egyike sem maradhat bent. */
const ADAT_CACHE_NEVEK = ['pages-rsc-prefetch', 'pages-rsc', 'pages', 'apis']

const ORIGIN = 'https://kartoteka.app'

let hibak = 0
const bukottMercek = new Set()

function jelent(merce, ok, uzenet) {
  if (ok) {
    console.log(`   ✓ ${uzenet}`)
    return
  }
  hibak++
  bukottMercek.add(merce)
  console.log(`   ✗ [${merce}] ${uzenet}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   SEGÉDLET — kommentek kiszedése
   A szöveges mérce CSAK a valóban lefutó kódot nézheti. A `sw.ts` fejlécében
   SZÁNDÉKOSAN ott áll a régi, hibás sor (`[authRouteCaching, ...defaultCache]`)
   magyarázatként — egy kommentbe írt szabály viszont egyetlen bájtot sem tesz
   a lemezre. Ha a mérce nem szedné ki a kommenteket, örökre riasztana.
   ══════════════════════════════════════════════════════════════════════════ */
function kommentNelkul(szoveg) {
  return (
    szoveg
      // ELŐBB a teljes soros `//` kommentek — a sorrend NEM mindegy. A
      // next.config.ts egyik magyarázó sorában ott áll a `["**/*"]` glob-minta;
      // annak a `/*`-át a blokk-komment söprés nyitásnak nézte, és a fájl felét
      // megette (a `globPublicPatterns` tömbbel együtt). Némán: a mérce nem
      // találta a horgonyt.
      .replace(/^[ \t]*\/\/.*$/gm, ' ')
      // A blokk-komment nyitása csak sor elején vagy elválasztó után számít —
      // különben a `"icons/**/*"` sztringliterált is kommentnek néznénk.
      .replace(/(^|[\s;,{([=])\/\*[\s\S]*?\*\//g, '$1 ')
  )
}

/**
 * Ugyanez HTML-re: előbb az `<!-- … -->` blokkok, aztán a benne lévő CSS/JS
 * kommentek. A tartalék lap fejlécében SZÁNDÉKOSAN ott áll, hogy „NEM olvas
 * IndexedDB-t" — ha a mérce nem szedné ki a kommenteket, pont a magyarázattól
 * riasztana.
 */
function htmlKommentNelkul(szoveg) {
  return kommentNelkul(szoveg.replace(/<!--[\s\S]*?-->/g, ' '))
}

/**
 * Egy `kulcs: [ … ]` tömb-literál elemei a forrásból (kommentek nélkül).
 * FAIL-CLOSED: ha a horgony nem található, kivételt dob — az őrszem SZÓL,
 * nem siklik el felette.
 */
function tombLiteralElemei(forras, kulcs, honnan) {
  const tiszta = kommentNelkul(forras)
  const egyezes = tiszta.match(new RegExp(`${kulcs}:\\s*\\[([\\s\\S]*?)\\]`))
  if (!egyezes) {
    throw new Error(
      `${honnan}: a \`${kulcs}\` tömb nem található — elmozdult a mérce horgonya (fail-closed)`,
    )
  }
  return [...egyezes[1].matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[0])
}

/** Egy forrásbeli string-literál VALÓDI értéke (a `\\.` → `\.` feloldásával). */
function literalErteke(literal) {
  // A selftest saját forrásán fut, nem külső bemeneten — a literál kiértékelése
  // itt a legpontosabb feloldás (a kézi visszafejtés csendben félreértené a
  // regex-escape-eket).
  return new Function(`return ${literal}`)()
}

/**
 * A `proxy.ts` matcher-mintája regexként. A Next a path-to-regexp-en engedi át,
 * de a minta itt egyetlen, kézzel írt regex-csoport (`/((?!…).*)`), tehát az
 * `^…$` közé zárva pontosan azt méri, amit a Next is: melyik útvonalra fut le a
 * Supabase `updateSession`.
 */
function proxyMatcherRegex(proxyForras) {
  const literalok = tombLiteralElemei(proxyForras, 'matcher', PROXY_REL)
  if (literalok.length === 0) {
    throw new Error(`${PROXY_REL}: a matcher tömb üres — elmozdult a horgony (fail-closed)`)
  }
  return literalok.map((lit) => new RegExp(`^${literalErteke(lit)}$`))
}

/** Lefut-e a proxy (Supabase updateSession) erre az útvonalra? */
function proxyElkapja(regexek, utvonal) {
  return regexek.some((r) => r.test(utvonal))
}

/* ══════════════════════════════════════════════════════════════════════════
   A SZABÁLYOK BETÖLTÉSE — a sw.ts VALÓDI lefuttatása bábu-stratégiákkal
   ══════════════════════════════════════════════════════════════════════════ */

const BABU_SERWIST = `
/** Bábu stratégia-osztályok: csak a nevet és a cache-nevet őrzik meg. */
class Strategia {
  constructor(opciok = {}) {
    this.cacheName = typeof opciok?.cacheName === 'string' ? opciok.cacheName : undefined
    this.strategiaNev = new.target.name
  }
}
export class NetworkOnly extends Strategia {}
export class NetworkFirst extends Strategia {}
export class CacheFirst extends Strategia {}
export class CacheOnly extends Strategia {}
export class StaleWhileRevalidate extends Strategia {}
export class ExpirationPlugin { constructor(o) { this.opciok = o } }
export class RangeRequestsPlugin { constructor(o) { this.opciok = o } }
export class Serwist {
  constructor(opciok) { globalThis.__SW_OPCIOK = opciok }
  addEventListeners() {}
}
`

/** Egy ideiglenes munkakönyvtár, benne a bábuk + a valódi alapkészlet. */
function keszitsMuhelyt(tmp) {
  fs.writeFileSync(path.join(tmp, 'babu-serwist.mjs'), BABU_SERWIST, 'utf8')

  if (!fs.existsSync(SERWIST_WORKER_ABS)) {
    throw new Error(
      `a @serwist/next alapkészlete nem található: ${SERWIST_WORKER_ABS} — ` +
        'a csomag átrendeződött, a mérce horgonya elmozdult (fail-closed)',
    )
  }
  const eredeti = fs.readFileSync(SERWIST_WORKER_ABS, 'utf8')
  const atirt = eredeti.replace(/from\s+["']serwist["']/g, "from './babu-serwist.mjs'")
  if (atirt === eredeti) {
    throw new Error(
      'a @serwist/next alapkészletében nem található a `from "serwist"` import — ' +
        'a mérce horgonya elmozdult (fail-closed)',
    )
  }
  fs.writeFileSync(path.join(tmp, 'serwist-next-worker.mjs'), atirt, 'utf8')
}

/**
 * A `sw.ts` forrásából futtatható ESM modult csinál, majd betölti, és
 * visszaadja a `Serwist`-nek átadott TELJES opció-objektumot (ebben van a
 * `runtimeCaching` lista ÉS a `fallbacks` bejegyzés is).
 */
async function opciokBetoltese(tmp, swForras, azonosito) {
  const js = ts.transpileModule(swForras, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'sw.ts',
  }).outputText

  const atirt = js
    .replace(/from\s+["']@serwist\/next\/worker["']/g, "from './serwist-next-worker.mjs'")
    .replace(/from\s+["']serwist["']/g, "from './babu-serwist.mjs'")

  if (atirt.includes("'@serwist/next/worker'") || /from\s+["']serwist["']/.test(atirt)) {
    throw new Error(`${azonosito}: az importok átírása nem fogott (fail-closed)`)
  }

  const fajl = path.join(tmp, `sw-${azonosito}.mjs`)
  fs.writeFileSync(fajl, atirt, 'utf8')

  globalThis.self = { __SW_MANIFEST: [] }
  globalThis.__SW_OPCIOK = undefined
  await import(pathToFileURL(fajl).href)

  const opciok = globalThis.__SW_OPCIOK
  if (!opciok || !Array.isArray(opciok.runtimeCaching)) {
    throw new Error(`${azonosito}: a Serwist nem kapott runtimeCaching listát`)
  }
  return opciok
}

/* ══════════════════════════════════════════════════════════════════════════
   MINI-ROUTER — a Serwist útválasztójának replikája
   Az első illeszkedő szabály nyer; a `method` alapértéke GET.
   ══════════════════════════════════════════════════════════════════════════ */

function keres({ ut, fejlecek = {}, mode = 'no-cors', destination = '', method = 'GET' }) {
  const url = new URL(ut, ORIGIN)
  const terkep = new Map(
    Object.entries(fejlecek).map(([kulcs, ertek]) => [kulcs.toLowerCase(), ertek]),
  )
  return {
    request: {
      method,
      mode,
      destination,
      url: url.href,
      headers: { get: (nev) => terkep.get(String(nev).toLowerCase()) ?? null },
    },
    url,
    sameOrigin: url.origin === ORIGIN,
    event: {},
  }
}

function nyertesSzabaly(szabalyok, k) {
  for (const szabaly of szabalyok) {
    if ((szabaly.method ?? 'GET') !== k.request.method) continue
    const m = szabaly.matcher
    let talalat = false
    if (typeof m === 'function') talalat = Boolean(m(k))
    else if (m instanceof RegExp) talalat = m.test(k.url.href)
    else if (typeof m === 'string') talalat = k.url.href === m || k.url.pathname === m
    if (talalat) return szabaly
  }
  return null
}

/** Lemezre ír-e a nyertes szabály? (NetworkOnly = nem.) */
function lemezreIr(szabalyok, k) {
  const szabaly = nyertesSzabaly(szabalyok, k)
  if (!szabaly) return { ir: false, nev: '(egy szabály sem)' }
  const kezelo = szabaly.handler ?? {}
  const strategia = kezelo.strategiaNev ?? 'ismeretlen'
  return {
    ir: strategia !== 'NetworkOnly',
    nev: `${strategia}${kezelo.cacheName ? ` → "${kezelo.cacheName}"` : ''}`,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   A SZINTETIKUS KÉRÉSEK
   ══════════════════════════════════════════════════════════════════════════ */

/** S4 — a hitelesített felület ADAT-válaszai: EGYIK SEM mehet lemezre. */
const ADAT_KERESEK = [
  {
    nev: 'RSC-prefetch a tagnyilvántartásra',
    k: keres({
      ut: '/tagnyilvantartas?_rsc=1a2b3',
      fejlecek: { RSC: '1', 'Next-Router-Prefetch': '1' },
    }),
  },
  {
    nev: 'RSC-payload a pénzügyre (kliens-oldali navigáció)',
    k: keres({ ut: '/penzugy', fejlecek: { RSC: '1' } }),
  },
  {
    nev: 'RSC csak a `_rsc` paraméterrel (fejléc nélkül)',
    k: keres({ ut: '/penzugy/naplo?_rsc=9f8e7' }),
  },
  {
    nev: 'HTML dokumentum-navigáció a tagnyilvántartásra',
    k: keres({ ut: '/tagnyilvantartas', mode: 'navigate', destination: 'document' }),
  },
  {
    nev: 'HTML dokumentum-navigáció az anyakönyvre',
    k: keres({ ut: '/anyakonyv/keresztelo', mode: 'navigate', destination: 'document' }),
  },
  { nev: '/api/calendar GET', k: keres({ ut: '/api/calendar?ev=2026' }) },
  { nev: '/api/internal GET', k: keres({ ut: '/api/internal/osszesito' }) },
  // ⚠️ A `/gy/` NEM teljesen publikus: a tagi fiók a bejelentkezett tag SAJÁT
  // adatait rendereli szerver-oldalon, a tagi portál pedig a belépési folyamat.
  {
    nev: '/gy/<slug>/tagi-fiok dokumentum (a tag saját adatai)',
    k: keres({ ut: '/gy/baratosi/tagi-fiok', mode: 'navigate', destination: 'document' }),
  },
  {
    nev: '/gy/<slug>/tagi-fiok RSC-payload',
    k: keres({ ut: '/gy/baratosi/tagi-fiok', fejlecek: { RSC: '1' } }),
  },
  {
    nev: '/gy/<slug>/tagi-portal dokumentum (belépési folyamat)',
    k: keres({ ut: '/gy/baratosi/tagi-portal', mode: 'navigate', destination: 'document' }),
  },
]

/** S5 — a PUBLIKUS gyülekezeti oldal offline-elhető MARAD. */
const PUBLIKUS_KERESEK = [
  {
    nev: '/gy/ dokumentum-navigáció',
    k: keres({ ut: '/gy/baratosi', mode: 'navigate', destination: 'document' }),
  },
  { nev: '/gy/ RSC-payload', k: keres({ ut: '/gy/baratosi/posts', fejlecek: { RSC: '1' } }) },
  {
    nev: '/gy/ magazin dokumentum',
    k: keres({ ut: '/gy/baratosi/magazin', mode: 'navigate', destination: 'document' }),
  },
  {
    nev: '/gy/ rólunk dokumentum',
    k: keres({ ut: '/gy/baratosi/rolunk', mode: 'navigate', destination: 'document' }),
  },
  { nev: '/gy/ képi asset', k: keres({ ut: '/gy/baratosi/kepek/hero.jpg', destination: 'image' }) },
]

/** S6 — az ALKALMAZÁS-HÉJ cache-elhető MARAD (enélkül offline el sem indul). */
const APP_HEJ_KERESEK = [
  { nev: 'Next.js chunk (JS)', k: keres({ ut: '/_next/static/chunks/main-abc123.js', destination: 'script' }) },
  { nev: 'Next.js stíluslap (CSS)', k: keres({ ut: '/_next/static/css/app-9f0e.css', destination: 'style' }) },
  { nev: 'alkalmazás-ikon', k: keres({ ut: '/icons/kartoteka-icon.png', destination: 'image' }) },
  { nev: 'betűkészlet', k: keres({ ut: '/fonts/inter-latin.woff2', destination: 'font' }) },
  { nev: 'PWA manifest', k: keres({ ut: '/manifest.json' }) },
  // A next.config.ts kifejezetten erre a futásidejű cache-re épít: a Károli
  // Biblia JSON-ja NINCS precache-elve, lusta fetch tölti be első használatkor.
  { nev: 'Károli Biblia JSON (lusta betöltés)', k: keres({ ut: '/bibles/karoli.json' }) },
  {
    nev: 'Google Fonts (idegen eredet)',
    k: keres({ ut: 'https://fonts.gstatic.com/s/inter/v13/latin.woff2', destination: 'font' }),
  },
]

/** S9 — ezekre a kérésekre KELL az offline tartalék lap (teljes oldalbetöltés). */
const TARTALEK_KELL = [
  {
    nev: 'navigáció a tagnyilvántartásra',
    k: keres({ ut: '/tagnyilvantartas', mode: 'navigate', destination: 'document' }),
  },
  {
    nev: 'navigáció a bejelentkezésre',
    k: keres({ ut: '/login', mode: 'navigate', destination: 'document' }),
  },
  {
    nev: 'navigáció a publikus gyülekezeti oldalra',
    k: keres({ ut: '/gy/baratosi', mode: 'navigate', destination: 'document' }),
  },
]

/** S9 — ezekre SZÁNDÉKOSAN NEM (HTML-lapot adni rájuk rosszabb, mint hibázni). */
const TARTALEK_TILOS = [
  {
    nev: 'RSC-payload (a Next útválasztóját zavarná össze)',
    k: keres({ ut: '/penzugy', fejlecek: { RSC: '1' } }),
  },
  {
    nev: 'RSC-prefetch',
    k: keres({ ut: '/tagnyilvantartas?_rsc=1a2b3', fejlecek: { RSC: '1', 'Next-Router-Prefetch': '1' } }),
  },
  { nev: '/api GET (a hívó kódot zavarná össze)', k: keres({ ut: '/api/calendar?ev=2026' }) },
  { nev: 'JS chunk', k: keres({ ut: '/_next/static/chunks/main-abc123.js', destination: 'script' }) },
  { nev: 'kép-asset', k: keres({ ut: '/kartoteka-icon.png', destination: 'image' }) },
  {
    nev: 'idegen eredetű betűkészlet',
    k: keres({ ut: 'https://fonts.gstatic.com/s/inter/v13/latin.woff2', destination: 'font' }),
  },
]

/**
 * S9 — amit a tartalék lap forrása NEM tartalmazhat.
 * A lap LEMEZRE kerül és bejelentkezés nélkül is megnyílik: se hálózatról, se
 * a helyi tárolóból nem szedhet elő adatot, és a build/szerver sem
 * helyettesíthet bele semmit.
 */
const TILTOTT_MINTAK = [
  { minta: /fetch\s*\(/i, mit: 'hálózati hívás (fetch)' },
  { minta: /XMLHttpRequest/i, mit: 'hálózati hívás (XMLHttpRequest)' },
  { minta: /\bindexedDB\b/i, mit: 'IndexedDB-olvasás (a Dexie-tükörben SZEMÉLYES ADAT van)' },
  { minta: /\bDexie\b/i, mit: 'Dexie-hivatkozás' },
  { minta: /WebSocket|EventSource|sendBeacon/i, mit: 'egyéb hálózati csatorna' },
  { minta: /https?:\/\//i, mit: 'külső hivatkozás (offline nem töltődne be)' },
  { minta: /<script[^>]+src=/i, mit: 'külső szkript' },
  { minta: /<link[^>]+stylesheet/i, mit: 'külső stíluslap' },
  { minta: /\{\{|<\?|<%|\$\{/, mit: 'szerver-oldali behelyettesítés nyoma' },
]

/** S9 — amit viszont TARTALMAZNIA kell (a brief három elvárása). */
const KOTELEZO_MINTAK = [
  { minta: /<html[^>]*\slang="hu"/i, mit: 'magyar nyelvű lap (lang="hu")' },
  { minta: /<meta[^>]+name="viewport"/i, mit: 'mobil-first viewport' },
  { minta: /prefers-color-scheme:\s*dark/i, mit: 'sötét mód' },
]

/* ══════════════════════════════════════════════════════════════════════════
   AZ ELLENŐRZÉS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Lefuttatja az S3–S7 és S9 mércéket egy adott VILÁGON.
 *
 * A „világ" a négy forrásfájl együtt (`sw`, `config`, `proxy`, `tartalek`) —
 * mert az offline tartalék lap csak akkor működik, ha MIND A NÉGY a helyén van.
 * Visszaadja, mely mércék buktak el — a negatív asszert ezt olvassa.
 */
async function ellenoriz(tmp, vilag, azonosito, cimke) {
  console.log(`\n── ${cimke} ──`)
  const elozoHibak = hibak
  const elozoMercek = new Set(bukottMercek)
  bukottMercek.clear()

  const forras = vilag.sw

  /* S3 — szöveges: nem szórjuk szét nyersen a defaultCache-t. */
  const tiszta = kommentNelkul(forras)
  const tombEgyezes = tiszta.match(/runtimeCaching:\s*\[[^\]]*\]/)
  jelent('S3', Boolean(tombEgyezes), 'a runtimeCaching tömb megtalálható a kódban (kommentek nélkül)')
  if (tombEgyezes) {
    jelent(
      'S3',
      !tombEgyezes[0].includes('...defaultCache'),
      `a runtimeCaching NEM szórja szét nyersen a defaultCache-t (talált: ${tombEgyezes[0].replace(/\s+/g, ' ')})`,
    )
  }

  /* S4–S7 — viselkedés. */
  const opciok = await opciokBetoltese(tmp, forras, azonosito)
  const szabalyok = opciok.runtimeCaching

  for (const { nev, k } of ADAT_KERESEK) {
    const e = lemezreIr(szabalyok, k)
    jelent('S4', !e.ir, `${nev} → ${e.nev}${e.ir ? ' — LEMEZRE ÍR!' : ''}`)
  }
  for (const { nev, k } of PUBLIKUS_KERESEK) {
    const e = lemezreIr(szabalyok, k)
    jelent('S5', e.ir, `${nev} → ${e.nev}${e.ir ? '' : ' — a publikus oldal offline-elhetősége elveszett!'}`)
  }
  for (const { nev, k } of APP_HEJ_KERESEK) {
    const e = lemezreIr(szabalyok, k)
    jelent('S6', e.ir, `${nev} → ${e.nev}${e.ir ? '' : ' — az app-héj kiesett a cache-ből!'}`)
  }

  const bentMaradtAdatCache = szabalyok
    .map((sz) => sz.handler?.cacheName)
    .filter((nev) => typeof nev === 'string' && ADAT_CACHE_NEVEK.includes(nev))
  jelent(
    'S7',
    bentMaradtAdatCache.length === 0,
    `a szabálylistában nincs adat-cache${bentMaradtAdatCache.length ? ` (bent maradt: ${bentMaradtAdatCache.join(', ')})` : ''}`,
  )

  /* ── S9: az ADATMENTES offline tartalék lap ───────────────────────────────
     Három láb + a lap adatmentessége. Bármelyik hiányzik: a lelkészt offline
     megint a csupasz böngésző-hibaoldal fogadja — némán. */

  // (1) A `sw.ts` tényleg átadta a fallback bejegyzést a Serwistnek?
  const tartalekBejegyzesek = opciok.fallbacks?.entries ?? []
  const tartalek = tartalekBejegyzesek.find((b) => b?.url === TARTALEK_URL)
  jelent(
    'S9',
    Boolean(tartalek),
    `a Serwist fallback-bejegyzése a(z) ${TARTALEK_URL}-re mutat`
      + (tartalek ? '' : ` (talált: ${JSON.stringify(tartalekBejegyzesek.map((b) => b?.url))})`),
  )

  // (2) A bejegyzés CSAK navigációra szól.
  if (tartalek && typeof tartalek.matcher === 'function') {
    const hiba = new Error('offline')
    for (const { nev, k } of TARTALEK_KELL) {
      let talalat = false
      try {
        talalat = Boolean(tartalek.matcher({ request: k.request, event: {}, error: hiba }))
      } catch {
        talalat = false
      }
      jelent('S9', talalat, `${nev} → megkapja a tartalék lapot${talalat ? '' : ' — NEM kapja meg!'}`)
    }
    for (const { nev, k } of TARTALEK_TILOS) {
      let talalat = true
      try {
        talalat = Boolean(tartalek.matcher({ request: k.request, event: {}, error: hiba }))
      } catch {
        talalat = false
      }
      jelent('S9', !talalat, `${nev} → NEM kap HTML-t${talalat ? ' — PEDIG KAPNA!' : ''}`)
    }
  } else if (tartalek) {
    jelent('S9', false, 'a fallback-bejegyzésnek nincs matcher függvénye')
  }

  // (3) PRECACHE — a `globPublicPatterns` pozitív listája tartalmazza-e?
  //     Enélkül a `matchPrecache` üresen tér vissza: a lap pont offline hiányzik.
  const globMinta = tombLiteralElemei(vilag.config, 'globPublicPatterns', NEXT_CONFIG_REL)
  const precacheelt = globMinta.some((lit) => literalErteke(lit) === TARTALEK_FAJLNEV)
  jelent(
    'S9',
    precacheelt,
    `a tartalék lap PRECACHE-ELVE van (${NEXT_CONFIG_REL} → globPublicPatterns)`
      + (precacheelt ? '' : ' — offline maga a tartalék lap sem érhető el!'),
  )

  // (4) PROXY — a Supabase updateSession NEM foghatja el, különben a precache
  //     a bejelentkező oldalt tenné el tartaléknak.
  const proxyRegexek = proxyMatcherRegex(vilag.proxy)
  const elkapja = proxyElkapja(proxyRegexek, TARTALEK_URL)
  jelent(
    'S9',
    !elkapja,
    `a proxy (updateSession) KIHAGYJA a(z) ${TARTALEK_URL}-t`
      + (elkapja ? ' — bejelentkezetlenül a /login-ra irányítana, azt precache-elnénk!' : ''),
  )
  // Horgony: a matcher ne legyen vakon „semmire sem illeszkedő" — a védett
  // útvonalakra TOVÁBBRA IS le kell futnia.
  jelent(
    'S9',
    proxyElkapja(proxyRegexek, '/tagnyilvantartas'),
    'a proxy a védett útvonalakra továbbra is lefut (/tagnyilvantartas)',
  )

  // (5) A lap ADATMENTES és statikus.
  const lapTiszta = htmlKommentNelkul(vilag.tartalek)
  for (const { minta, mit } of TILTOTT_MINTAK) {
    jelent('S9', !minta.test(lapTiszta), `a tartalék lapban nincs ${mit}`)
  }
  for (const { minta, mit } of KOTELEZO_MINTAK) {
    jelent('S9', minta.test(vilag.tartalek), `a tartalék lapon megvan: ${mit}`)
  }

  const sajatHibak = hibak - elozoHibak
  const sajatMercek = new Set(bukottMercek)
  // A globális állapot visszaállítása: csak az ÉLES futás hibái számítanak.
  bukottMercek.clear()
  for (const m of elozoMercek) bukottMercek.add(m)
  hibak = elozoHibak

  return { hibak: sajatHibak, mercek: sajatMercek }
}

/* ══════════════════════════════════════════════════════════════════════════
   FUTÁS
   ══════════════════════════════════════════════════════════════════════════ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-sw-cache-'))
let kilepesiKod = 1

try {
  keszitsMuhelyt(tmp)

  const ELES_FORRAS = fs.readFileSync(SW_ABS, 'utf8')

  // FAIL-CLOSED: ha a tartalék lap nincs a helyén, az őrszem SZÓL — nem
  // futtatja le félig a mércéket egy hiányzó fájlra.
  if (!fs.existsSync(TARTALEK_ABS)) {
    throw new Error(
      `az offline tartalék lap hiányzik: ${TARTALEK_REL} — ` +
        'a `fallbacks` bejegyzés nélküle NÉMÁN hatástalan (fail-closed)',
    )
  }

  /** A „világ": a négy forrásfájl együtt — a tartalék lap mind a négytől függ. */
  const ELES_VILAG = {
    sw: ELES_FORRAS,
    config: fs.readFileSync(NEXT_CONFIG_ABS, 'utf8'),
    proxy: fs.readFileSync(PROXY_ABS, 'utf8'),
    tartalek: fs.readFileSync(TARTALEK_ABS, 'utf8'),
  }

  console.log('═══ SERVICE WORKER GYORSTÁR önellenőrzés ═══')

  /* ── S1: HORGONY ────────────────────────────────────────────────────────── */
  console.log('\n── S1: horgony (a négy adat-cache neve létezik a @serwist/next-ben) ──')
  const serwistForras = fs.readFileSync(SERWIST_WORKER_ABS, 'utf8')
  for (const nev of ADAT_CACHE_NEVEK) {
    jelent('S1', serwistForras.includes(`"${nev}"`), `a "${nev}" cache-név megvan az alapkészletben`)
  }

  // A tartalék lap MECHANIZMUSA is horgony: ha a serwist egy frissítésben
  // átalakítja, a `fallbacks` NÉMÁN hatástalanná válna (a lap ott maradna a
  // precache-ben, de sosem jutna a képernyőre).
  const magForras = serwistMagForras()
  const MECHANIZMUS_HORGONYOK = [
    { minta: 'fallbackUrls: fallbacks.entries', mit: 'a `fallbacks` bekötése a PrecacheFallbackPlugin-be' },
    { minta: 'class NetworkOnly extends Strategy', mit: 'a NetworkOnly Strategy — csak így kap plugint' },
    { minta: 'iterateCallbacks("handlerDidError")', mit: 'a hibaághoz kötött tartalék-válasz' },
  ]
  for (const { minta, mit } of MECHANIZMUS_HORGONYOK) {
    jelent('S1', magForras.includes(minta), `a serwist mag még tudja: ${mit}`)
  }

  /* ── S2: SZINTAXIS ──────────────────────────────────────────────────────── */
  console.log('\n── S2: szintaxis ──')
  const sf = ts.createSourceFile(SW_REL, ELES_FORRAS, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const parseHibak = sf.parseDiagnostics ?? []
  jelent(
    'S2',
    parseHibak.length === 0,
    `${SW_REL} elemezhető${parseHibak.length ? ` (${parseHibak.length} hiba)` : ''}`,
  )

  /* ── S3–S7 + S9: az ÉLES világ ──────────────────────────────────────────── */
  const eles = await ellenoriz(tmp, ELES_VILAG, 'eles', 'S3–S7 + S9: az ÉLES forrás')
  hibak += eles.hibak
  for (const m of eles.mercek) bukottMercek.add(m)

  /* ── S8: NEGATÍV ASSZERT ────────────────────────────────────────────────── */
  console.log('\n── S8: negatív asszert (a régi világ és a mutánsok BUKJANAK) ──')
  console.log('   (a régi világ a MAI forrásból készül string-átalakítással, NEM a git-történelemből)')

  const RUNTIME_SOR =
    'runtimeCaching: [authRouteCaching, hitelesitettAdatCaching, ...adatCacheNelkuliAlap],'

  /* Minden mutáns megmondja, MELYIK forrásfájlt írja át (`mezo`), és mely
     mércéknek KELL elbukniuk rajta (`vart`). Ha a csere nem fog, az őrszem
     fail-closed módon szól: elmozdult a horgony. */
  const MUTANSOK = [
    {
      nev: 'S8/a — A RÉGI VILÁG: `[authRouteCaching, ...defaultCache]` (maga a lelet)',
      mezo: 'sw',
      vart: ['S3', 'S4', 'S7'],
      keszit: (s) => s.replace(RUNTIME_SOR, 'runtimeCaching: [authRouteCaching, ...defaultCache],'),
    },
    {
      mezo: 'sw',
      nev: 'S8/b — CSAK a névszűrés marad (a NetworkOnly szabály nélkül)',
      // Ez a fontos: a négy cache kiszűrése ÖNMAGÁBAN nem elég, mert a
      // dokumentum és az RSC az `others` gyűjtőbe csúszik — vagyis lemezre.
      vart: ['S4'],
      keszit: (s) => s.replace(RUNTIME_SOR, 'runtimeCaching: [authRouteCaching, ...adatCacheNelkuliAlap],'),
    },
    {
      nev: 'S8/c — CSAK a NetworkOnly marad (a névszűrés visszavonva)',
      mezo: 'sw',
      vart: ['S7'],
      keszit: (s) => s.replace('...adatCacheNelkuliAlap]', '...defaultCache]'),
    },
    {
      nev: 'S8/d — a publikus /gy/ kivétel eltűnik (a gyülekezeti oldal is kiesik)',
      mezo: 'sw',
      vart: ['S5'],
      keszit: (s) => s.replace('if (publikusGyulekezetiUt(utvonal)) return false', ''),
    },
    {
      mezo: 'sw',
      // A naiv „az egész /gy/ publikus" világ: ilyenkor a tagi fiók SSR-HTML-je
      // és RSC-payloadja — a tag SAJÁT adatai — lemezre kerülnek.
      nev: 'S8/e — a /gy/ kivétel naivan MINDENRE szól (a tagi fiók is kiesik a védelemből)',
      vart: ['S4'],
      keszit: (s) =>
        s.replace('return !TAGI_SZEGMENSEK.includes(harmadikSzegmens)', 'return true'),
    },
    {
      nev: 'S8/f — az app-héj is a NetworkOnly-ba esik (offline el sem indulna)',
      mezo: 'sw',
      vart: ['S6'],
      keszit: (s) =>
        s.replace(
          'if (utvonal.startsWith(APP_HEJ_ELOTAG)) return false',
          'if (utvonal.startsWith(APP_HEJ_ELOTAG)) return true',
        ),
    },

    /* ── S9 „régi világa" és csapdái ─────────────────────────────────────────
       Az S8/g a 2026-08-24-i állapotot állítja vissza: a szivárgás elzárva, de
       offline a csupasz böngésző-hibaoldal fogad. A többi a három láb egy-egy
       néma törése. */
    {
      nev: 'S8/g — A RÉGI VILÁG (2026-08-24): nincs `fallbacks` (csupasz hibaoldal offline)',
      mezo: 'sw',
      vart: ['S9'],
      keszit: (s) => s.replace(/\n\s*fallbacks:\s*\{[\s\S]*?\n\s*\},\n/, '\n'),
    },
    {
      nev: 'S8/h — a fallback URL elgépelve (a precache-ben nincs ilyen lap)',
      mezo: 'sw',
      vart: ['S9'],
      keszit: (s) => s.replace(`'${TARTALEK_URL}'`, "'/offline.html'"),
    },
    {
      nev: 'S8/i — a fallback MINDENRE szól (az RSC és az /api is HTML-t kapna)',
      mezo: 'sw',
      vart: ['S9'],
      keszit: (s) => s.replace('matcher: ({ request }) => dokumentumKeres(request),', 'matcher: () => true,'),
    },
    {
      nev: 'S8/j — a lap kiesik a precache pozitív listájából (offline nem érhető el)',
      mezo: 'config',
      vart: ['S9'],
      keszit: (s) => s.replace(`"${TARTALEK_FAJLNEV}",`, ''),
    },
    {
      nev: 'S8/k — a proxy-kihagyás eltűnik (a precache a /login-t tenné el tartaléknak)',
      mezo: 'proxy',
      vart: ['S9'],
      keszit: (s) => s.replace('nincs-internet\\\\.html|', ''),
    },
    {
      nev: 'S8/l — a tartalék lap hálózatról töltene be adatot',
      mezo: 'tartalek',
      vart: ['S9'],
      keszit: (s) => s.replace('frissit();', 'fetch("/api/allapot"); frissit();'),
    },
    {
      nev: 'S8/m — a tartalék lap az IndexedDB-ből olvasna (ott SZEMÉLYES ADAT van)',
      mezo: 'tartalek',
      vart: ['S9'],
      keszit: (s) => s.replace('frissit();', 'indexedDB.open("kartoteka"); frissit();'),
    },
  ]

  const negativHibak = []
  let sorszam = 0

  for (const m of MUTANSOK) {
    sorszam++
    const eredeti = ELES_VILAG[m.mezo]
    const mutalt = m.keszit(eredeti)
    if (mutalt === eredeti) {
      // FAIL-CLOSED: ha a csere nem fogott, elmozdult a horgony — az őrszem
      // ilyenkor SZÓL, nem hallgat.
      negativHibak.push(`${m.nev}: a mutáció NEM fogott (elmozdult a horgony a(z) ${m.mezo} forrásban)`)
      console.log(`   ✗ ${m.nev} — a mutáció nem fogott`)
      continue
    }
    const mutaltVilag = { ...ELES_VILAG, [m.mezo]: mutalt }
    const r = await ellenoriz(tmp, mutaltVilag, `mutans-${sorszam}`, `MUTÁNS · ${m.nev}`)
    const hianyzo = m.vart.filter((merce) => !r.mercek.has(merce))
    if (hianyzo.length > 0) {
      negativHibak.push(`${m.nev}: a(z) ${hianyzo.join(', ')} mérce NEM bukott el rajta`)
    }
    console.log(
      `   ${hianyzo.length === 0 ? '✓' : '✗'} ${m.nev} → elbukott mércék: ${[...r.mercek].join(', ') || 'egy sem'} (vártuk: ${m.vart.join(', ')})`,
    )
  }

  /* Ellenpélda: a KOMMENTBEN álló régi sor NEM buktathatja el az S3-at.
     (A sw.ts fejlécében szándékosan ott a régi, hibás sor magyarázatként.) */
  {
    const kommentelt = `${ELES_FORRAS}\n// runtimeCaching: [authRouteCaching, ...defaultCache],\n`
    const tiszta = kommentNelkul(kommentelt)
    const tombEgyezes = tiszta.match(/runtimeCaching:\s*\[[^\]]*\]/)
    const atmegy = Boolean(tombEgyezes) && !tombEgyezes[0].includes('...defaultCache')
    if (!atmegy) {
      negativHibak.push('a kommentben álló régi sor elbuktatta az S3-at — a söprés nem szedi ki a kommenteket')
    }
    console.log(
      `   ${atmegy ? '✓' : '✗'} ellenpélda · a kommentben álló régi sor ${atmegy ? 'nem bukik (helyes)' : 'BUKIK (téves riasztás!)'}`,
    )
  }

  /* ── ÖSSZEGZÉS ──────────────────────────────────────────────────────────── */
  console.log('\n═══ ÖSSZEGZÉS ═══')
  console.log(`ÉLES hibák: ${hibak}${bukottMercek.size ? ` (mércék: ${[...bukottMercek].join(', ')})` : ''}`)
  console.log(`Negatív asszert hibái: ${negativHibak.length}`)
  for (const h of negativHibak) console.log(`  ✗ ${h}`)

  if (hibak === 0 && negativHibak.length === 0) {
    console.log('\n✅ PASS — mind a kilenc mérce teljesül.')
    kilepesiKod = 0
  } else {
    console.log('\n❌ FAIL')
  }
} catch (hiba) {
  console.log(`\n❌ FAIL — az őrszem nem tudott lefutni: ${hiba?.message ?? hiba}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

process.exit(kilepesiKod)
