#!/usr/bin/env node
/**
 * ADATVÉDELMI FEDEZET önellenőrzés (2026-08-23).
 *
 * Mit véd:
 *   · a repó EGÉSZE                                   — NE legyen AI-csevegőseged
 *   · apps/web/components/layout/header-refined-v3.tsx — a kijelentkezési út
 *   · apps/web/lib/utils/helyi-tarolo-urites.ts      — a KÖZÖS ürítő helper
 *   · apps/web/app/dev-reset/page.tsx                — a második hívó (ne húzzon szét)
 *   · apps/web/lib/offline/db.ts                     — (csak olvasva) a Dexie DB neve
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — A JOGI SZÖVEG TÖBBET ÍGÉRT, MINT AMIT A KÓD ADOTT
 * ════════════════════════════════════════════════════════════════════════════
 * Az Adatvédelmi tájékoztató két KONKRÉT állítást tett a felületről:
 *
 *  (1) az „Aladár" AI-segédbe ne írjanak személyes adatot, mert a begépelt
 *      szöveg EU-n kívüli szolgáltatóhoz kerül (OpenRouter / Groq / Gemini);
 *  (2) közös gépen érdemes kijelentkezni.
 *
 * 2026-08-23 előtt a felület EGYIKET SEM támogatta: a csevegőablakban egyetlen
 * szó sem állt a külső feldolgozásról, kijelentkezéskor pedig SEMMI nem ürült —
 * a service worker gyorstárában ott maradt az RSC-payload (névsorok, CNP,
 * pénzügyi sorok), az IndexedDB-ben pedig a teljes offline tükör. A közös
 * hivatali gépen a következő ember bejelentkezés NÉLKÜL olvashatta ki.
 *
 * Egy adatvédelmi tájékoztató akkor ér valamit, ha a kód is azt csinálja, amit
 * ígér. Ez az őrszem ezt a kettőt köti össze.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ ENDRE DÖNTÉSE (2026-08-23): AZ AI-CSEVEGŐSEGÉD MEGSZŰNT
 * ════════════════════════════════════════════════════════════════════════════
 * Szó szerint: „azt a csevegő asszisztenst teljesen vedd ki a rendszerből!
 * Mintha ott se lenne, hogy a GDPR-nak megfeleljen!"
 *
 * MIÉRT: az „Aladár" AI-segédbe begépelt szöveg EU-n KÍVÜLI szolgáltatókhoz
 * ment (OpenRouter / Groq / Google Gemini). Ez volt az EGYETLEN harmadik
 * országba irányuló adattovábbítás a rendszerben. A funkcióval együtt maga az
 * adattovábbítás is megszűnt — ezért kerülhetett ki az adatvédelmi
 * tájékoztatóból a harmadik országbeli továbbítás.
 *
 * Az egykori (2026-08-23-ig élt) figyelmeztetés-mérce ezzel OKAFOGYOTTÁ vált:
 * nincs többé csevegőablak, amiben figyelmeztetni lehetne. A helyére a
 * FORDÍTOTT mérce került: bizonyítsuk, hogy a segéd tényleg nincs sehol.
 *
 * ⚠️ AKI VISSZATENNÉ AZ AI-T: ez a mérce SZÁNDÉKOSAN fail-closed. Nem
 * „elfelejtett takarítás", hanem rögzített döntés. Előbb EZT A DÖNTÉST kell
 * Endrével újratárgyalni (és az adatvédelmi tájékoztatóba visszaírni a
 * harmadik országbeli adattovábbítást), és csak utána szabad ezt a mércét
 * lazítani.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ ÖT MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *  M1  SZINTAXIS       — a három érintett fájl TS/JSX-értelemben elemezhető.
 *  M2  NINCS AI-SEGÉD  — a három AI-útvonal nem létezik, és a forrásban (az
 *                        apps/ és packages/ alatt, kommentek nélkül) nincs
 *                        többé hivatkozás a csevegőablakra, a végpontjára és
 *                        a külső szolgáltatók kulcsaira.
 *  M3  KIJELENTKEZÉS   — a kijelentkezés hívja a közös ürítőt, méghozzá a
 *                        szerver-oldali signOut() ELŐTT (nincs versenyhelyzet).
 *  M4  KÖZÖS HELPER    — tényleg törli a Cache Storage-t ÉS az offline
 *                        IndexedDB-t; a DB nevét visszaméri a db.ts-ből; NEM
 *                        söpri el a felhasználó beállításait; és a /dev-reset
 *                        UGYANEZT a helpert hívja (nem másolatot).
 *  M5  NEGATÍV ASSZERT — a mércék a javítás ELŐTTI valódi forrásra és a
 *                        mutánsokra ténylegesen elbuknak. Őr negatív asszert
 *                        nélkül vak.
 *
 * Futtatás:  node scripts/selftest-adatvedelmi-fedezet.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REL = {
  header: 'apps/web/components/layout/header-refined-v3.tsx',
  helper: 'apps/web/lib/utils/helyi-tarolo-urites.ts',
  devReset: 'apps/web/app/dev-reset/page.tsx',
  offlineDb: 'apps/web/lib/offline/db.ts',
}

let hibak = 0
const bukottMercek = new Set()
const bukottUzenetek = []

function jelent(merce, ok, uzenet) {
  if (ok) {
    console.log(`   ✓ ${uzenet}`)
    return
  }
  hibak++
  bukottMercek.add(merce)
  bukottUzenetek.push(uzenet)
  console.log(`   ✗ [${merce}] ${uzenet}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   SEGÉDLET — kommentek kiszedése
   A szöveges mércék CSAK a valóban lefutó kódot / megjelenő szöveget nézhetik:
   egy magyarázó kommentbe írt „személyes adat" senkit nem tájékoztat, egy
   kommentbe írt `caches.delete()` semmit nem töröl — és egy kommentben
   emlegetett `ai-chat-widget` sem küld adatot az Unión kívülre.
   ══════════════════════════════════════════════════════════════════════════ */
function kommentNelkul(szoveg) {
  return szoveg
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ') // JSX-komment
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blokk-komment (a /** */ is)
    .replace(/^[ \t]*\/\/.*$/gm, ' ') // teljes soros // komment
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ')

/** A `handleSignOut` törzse — a következő top-szintű deklarációig. */
function signOutTorzs(forras) {
  const start = forras.indexOf('function handleSignOut(')
  if (start === -1) return ''
  const utana = forras.slice(start + 1)
  const vege = utana.search(/\n {2}(const|async function|function|return) /)
  return vege === -1 ? forras.slice(start) : forras.slice(start, start + 1 + vege)
}

/* ══════════════════════════════════════════════════════════════════════════
   M1 — SZINTAXIS
   ══════════════════════════════════════════════════════════════════════════ */
function m1Szintaxis(forrasok) {
  for (const kulcs of ['header', 'helper', 'devReset']) {
    const forras = forrasok[kulcs]
    if (forras === null) {
      jelent('M1', false, `${REL[kulcs]}: a fájl nem olvasható`)
      continue
    }
    const tsx = REL[kulcs].endsWith('.tsx')
    const sf = ts.createSourceFile(
      path.basename(REL[kulcs]),
      forras,
      ts.ScriptTarget.Latest,
      true,
      tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const diags = sf.parseDiagnostics ?? []
    const elso = diags.length
      ? ` — első: ${ts.flattenDiagnosticMessageText(diags[0].messageText, ' ')} (pozíció ${diags[0].start})`
      : ''
    jelent('M1', diags.length === 0, `${REL[kulcs]}: elemezhető (${diags.length} elemzési hiba)${elso}`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M2 — NINCS AI-CSEVEGŐSEGÉD (lásd a fájl elején Endre 2026-08-23-i döntését)
   ══════════════════════════════════════════════════════════════════════════ */

/** A megszűnt AI-segéd három útvonala. Egyiknek sem szabad léteznie. */
const AI_TILTOTT_UTAK = [
  'apps/web/components/ai',
  'apps/web/app/api/ai',
  'apps/web/lib/constants/ai.ts',
]

/**
 * Tiltott hivatkozások a forrásban. A három kulcsnév azért van itt, mert a
 * MEGLÉTÜK jelentené, hogy valahol megint EU-n kívülre megy adat.
 */
const AI_TILTOTT_MINTAK = [
  'ai-chat-widget',
  'AiChatWidget',
  'constants/ai',
  'api/ai',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
]

const SOPRESI_GYOKEREK = ['apps', 'packages']

/** Fordítási / függőségi könyvtárak — nem forrás. */
const KIHAGYOTT_KONYVTARAK = new Set([
  'node_modules',
  '.next',
  '.git',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  'target', // apps/desktop/src-tauri/target (Rust)
])

const FORRAS_KITERJESZTESEK = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/**
 * Kiterjesztés nélküli, mégis forrásnak számító fájlok. A `.env.example` azért
 * van itt, mert az EU-n kívüli szolgáltatók kulcsai ott is meghirdethetők.
 * A VALÓDI `.env` / `.env.local` SZÁNDÉKOSAN kimarad: az a fejlesztő gépén
 * lévő magánfájl, nem a repó tartalma.
 */
const EXTRA_FORRAS_FAJLOK = new Set(['.env.example'])

/**
 * A build által GENERÁLT fájlok. A `public/sw.js` a szerviz-munkás köteg: a
 * Next útvonal-listáját is beleégeti, és MINDEN buildnél újraíródik — tehát
 * nem forrás, és nem is javítható „kézzel".
 */
const GENERALT_FAJLOK = new Set(['apps/web/public/sw.js'])

function forrasFajl(rel) {
  if (GENERALT_FAJLOK.has(rel)) return false
  const nev = path.basename(rel)
  return FORRAS_KITERJESZTESEK.has(path.extname(nev)) || EXTRA_FORRAS_FAJLOK.has(nev)
}

function* bejar(dirRel) {
  let bejegyzesek
  try {
    bejegyzesek = fs.readdirSync(path.join(ROOT, dirRel), { withFileTypes: true })
  } catch {
    return
  }
  for (const b of bejegyzesek) {
    const rel = `${dirRel}/${b.name}`
    if (b.isDirectory()) {
      if (KIHAGYOTT_KONYVTARAK.has(b.name)) continue
      yield* bejar(rel)
    } else if (b.isFile() && forrasFajl(rel)) {
      yield rel
    }
  }
}

/**
 * Egy „világ" = amit az M2 söprés lát. Három változata van: az ÉLES
 * munkakönyvtár, egy régi commit (git), és a szintetikus mutánsok.
 *   · letezik(rel) — létezik-e az adott útvonal
 *   · keres(minta) — mely forrásfájlokban bukkan fel a minta
 *   · fajlDb       — hány forrásfájlt látott a söprés (fail-closed számláló)
 */
function elesVilag() {
  const fajlok = []
  for (const gyoker of SOPRESI_GYOKEREK) {
    for (const rel of bejar(gyoker)) {
      let tartalom
      try {
        tartalom = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      } catch {
        continue
      }
      fajlok.push({ rel, tiszta: kommentNelkul(tartalom) })
    }
  }
  return {
    cimke: 'munkakönyvtár',
    fajlDb: fajlok.length,
    letezik: (rel) => fs.existsSync(path.join(ROOT, rel)),
    keres: (minta) => fajlok.filter((f) => f.tiszta.includes(minta)).map((f) => f.rel),
  }
}

function gitVilag(ref, cimke) {
  const gitFut = (args) =>
    execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  let lista
  try {
    lista = gitFut(['ls-tree', '-r', '--name-only', ref, '--', ...SOPRESI_GYOKEREK])
  } catch {
    return null // sekély klón vagy hiányzó objektum — a hívó kihagyja a részmércét
  }
  const fajlDb = lista.split('\n').filter((rel) => rel && forrasFajl(rel)).length
  return {
    cimke,
    fajlDb,
    letezik: (rel) => {
      try {
        gitFut(['cat-file', '-e', `${ref}:${rel}`])
        return true
      } catch {
        return false
      }
    },
    keres: (minta) => {
      try {
        return gitFut(['grep', '-l', '-I', '--fixed-strings', '-e', minta, ref, '--', ...SOPRESI_GYOKEREK])
          .split('\n')
          .filter(Boolean)
          .map((sor) => sor.replace(`${ref}:`, ''))
      } catch {
        return [] // a git grep 1-gyel tér vissza, ha nincs találat
      }
    },
  }
}

/**
 * Szintetikus világ a negatív asszerthez — CSAK a memóriában él, a repóban
 * semmilyen nyomot nem hagy.
 */
function szintetikusVilag(cimke, { utak = [], fajlok = {}, fajlDb = 999 } = {}) {
  const lista = Object.entries(fajlok).map(([rel, tartalom]) => ({ rel, tiszta: kommentNelkul(tartalom) }))
  const utKeszlet = new Set(utak)
  return {
    cimke,
    // A darabszám külön mérce; a minta-mutánsoknál SZÁNDÉKOSAN kielégítjük,
    // hogy a bukás oka biztosan a vizsgált minta legyen, ne a számláló.
    fajlDb,
    letezik: (rel) => utKeszlet.has(rel),
    keres: (minta) => lista.filter((f) => f.tiszta.includes(minta)).map((f) => f.rel),
  }
}

function m2NincsAiSeged(vilag) {
  // Fail-closed: ha a söprés nem olvasott érdemi mennyiségű forrást, akkor NEM
  // „tiszta a repó", hanem elromlott a bejárás (rossz ROOT, kihagyott gyökér).
  jelent('M2', vilag.fajlDb >= 200, `a söprés ${vilag.fajlDb} forrásfájlt olvasott (${vilag.cimke})`)

  for (const ut of AI_TILTOTT_UTAK) {
    jelent('M2', !vilag.letezik(ut), `nincs meg az AI-útvonal: ${ut}`)
  }

  for (const minta of AI_TILTOTT_MINTAK) {
    const hol = vilag.keres(minta)
    const reszlet = hol.length ? ` — ${hol.slice(0, 3).join(', ')}${hol.length > 3 ? ` (+${hol.length - 3})` : ''}` : ''
    jelent('M2', hol.length === 0, `a forrásban nincs „${minta}" hivatkozás${reszlet}`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M3 — KIJELENTKEZÉS
   ══════════════════════════════════════════════════════════════════════════ */
function m3Kijelentkezes(header) {
  if (header === null) {
    jelent('M3', false, `${REL.header}: a fájl nem olvasható`)
    return
  }
  const tiszta = kommentNelkul(header)

  jelent(
    'M3',
    /import\s*\{[^}]*uritsdAHelyiAdatCachet[^}]*\}\s*from\s*'@\/lib\/utils\/helyi-tarolo-urites'/.test(tiszta),
    'a kijelentkezési út importálja a KÖZÖS ürítő helpert',
  )

  const torzs = signOutTorzs(tiszta)
  jelent('M3', torzs.length > 0, 'megtalálható a handleSignOut() törzse')

  const uritesIdx = torzs.search(/await\s+uritsdAHelyiAdatCachet\(/)
  const signOutIdx = torzs.search(/await\s+signOut\(/)
  jelent('M3', uritesIdx !== -1, 'a handleSignOut() ténylegesen HÍVJA az ürítőt')
  jelent('M3', signOutIdx !== -1, 'a handleSignOut() hívja a szerver-oldali signOut()-ot')
  jelent(
    'M3',
    uritesIdx !== -1 && signOutIdx !== -1 && uritesIdx < signOutIdx,
    'az ürítés a signOut() ELŐTT fut (a redirect után már nem futna le)',
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   M4 — KÖZÖS HELPER
   ══════════════════════════════════════════════════════════════════════════ */
function m4KozosHelper(forrasok) {
  const helper = forrasok.helper
  if (helper === null) {
    jelent('M4', false, `${REL.helper}: a közös ürítő helper HIÁNYZIK`)
    return
  }
  const tiszta = kommentNelkul(helper)

  // (a) Cache Storage
  jelent('M4', /caches\.keys\(\)/.test(tiszta), 'a helper végigjárja a Cache Storage kulcsait')
  jelent('M4', /caches\.delete\(/.test(tiszta), 'a helper TÖRLI a Cache Storage bejegyzéseit')

  // (b) IndexedDB
  jelent('M4', /indexedDB\.deleteDatabase\(/.test(tiszta), 'a helper eldobja az offline IndexedDB-t')
  jelent(
    'M4',
    /indexedDB\.deleteDatabase\(\s*OFFLINE_DB_NEV\s*\)/.test(tiszta),
    'a törlés a névkonstansra hivatkozik (nem beégetett szövegre)',
  )

  // (c) A DB neve EGYEZIK a Dexie-séma nevével — különben némán a semmit törölnénk.
  const helperNev = tiszta.match(/export const OFFLINE_DB_NEV\s*=\s*'([^']+)'/)?.[1] ?? null
  const dexieNev = forrasok.offlineDb ? kommentNelkul(forrasok.offlineDb).match(/super\('([^']+)'\)/)?.[1] ?? null : null
  jelent(
    'M4',
    helperNev !== null && dexieNev !== null && helperNev === dexieNev,
    `a helper DB-neve egyezik a db.ts-belivel (helper: ${helperNev ?? '—'} / db.ts: ${dexieNev ?? '—'})`,
  )

  // (d) NEM söpri el a felhasználó szándékolt beállításait.
  jelent(
    'M4',
    !/localStorage\.clear\(\)/.test(tiszta) && !/sessionStorage\.clear\(\)/.test(tiszta) && !/\btarolo\.clear\(\)/.test(tiszta),
    'a helper NEM hív teljes clear()-t (a téma és a beállítások megmaradnak)',
  )
  jelent(
    'M4',
    /MEGTARTOTT_LOCALSTORAGE_KULCSOK[\s\S]{0,400}'theme'/.test(tiszta),
    'a megtartott kulcsok között ott a téma („theme")',
  )
  jelent(
    'M4',
    tiszta.includes('kartoteka_splash_shown'),
    'a nyitóképernyő-jelzőt (kartoteka_splash_shown) sem törli feleslegesen',
  )
  jelent(
    'M4',
    /removeItem\(/.test(tiszta),
    'a takarítás kulcsonként töröl (removeItem), nem vakon',
  )

  // (e) A MÁSODIK hívó ugyanezt a helpert használja — ne húzzon szét két másolat.
  const devReset = forrasok.devReset
  if (devReset === null) {
    jelent('M4', false, `${REL.devReset}: a fájl nem olvasható`)
    return
  }
  const devTiszta = kommentNelkul(devReset)
  jelent(
    'M4',
    /import\s*\{[^}]*uritsdAHelyiAdatCachet[^}]*\}\s*from\s*'@\/lib\/utils\/helyi-tarolo-urites'/.test(devTiszta) &&
      /uritsdAHelyiAdatCachet\(/.test(devTiszta),
    'a /dev-reset UGYANEZT a közös helpert hívja',
  )
  jelent(
    'M4',
    !/caches\.delete\(/.test(devTiszta),
    'a /dev-reset már NEM tart saját cache-ürítő másolatot (nem tud széthúzni)',
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   FUTTATÓ
   ══════════════════════════════════════════════════════════════════════════ */
function ellenoriz(forrasok, cimke, { szintaxis = true, aiVilag = null } = {}) {
  hibak = 0
  bukottMercek.clear()
  bukottUzenetek.length = 0
  console.log(`\n── ${cimke} ──`)
  if (szintaxis) m1Szintaxis(forrasok)
  if (aiVilag) m2NincsAiSeged(aiVilag)
  m3Kijelentkezes(forrasok.header)
  m4KozosHelper(forrasok)
  return { hibak, mercek: new Set(bukottMercek), uzenetek: [...bukottUzenetek] }
}

/**
 * A sorvégeket egységesítjük (a repóban vegyesen van CRLF és LF). Enélkül a
 * több soros minták a CRLF-es fájlokon némán nem illeszkednének — és épp a
 * NEGATÍV asszert (a mutánsok) vakulna meg tőle.
 */
const egysegesSorvegek = (s) => (s === null ? null : s.replace(/\r\n/g, '\n'))

function olvas(rel) {
  const teljes = path.join(ROOT, rel)
  try {
    return egysegesSorvegek(fs.readFileSync(teljes, 'utf8'))
  } catch {
    return null
  }
}

const ELES = {
  header: olvas(REL.header),
  helper: olvas(REL.helper),
  devReset: olvas(REL.devReset),
  offlineDb: olvas(REL.offlineDb),
}

const ELES_AI_VILAG = elesVilag()

console.log('═══ ADATVÉDELMI FEDEZET ÖNELLENŐRZÉS ═══')
const eles = ellenoriz(ELES, 'ÉLES FÁJLOK', { aiVilag: ELES_AI_VILAG })

/* ── M5: NEGATÍV ASSZERT ─────────────────────────────────────────────────── */
console.log('\n── M5: negatív asszert (a régi állapot és a mutánsok BUKJANAK) ──')

const negativHibak = []

/**
 * A javítás ELŐTTI állapot egy RÖGZÍTETT commitban.
 *
 * ⚠️ Korábban itt `HEAD` állt. Az csak addig működött, amíg a javítás
 * commitolatlan volt: amint bekerült a történelembe, a HEAD MÁR a javított
 * állapot lett volna, a visszajátszás pedig némán elveszítette volna az
 * értelmét (sőt: „a régi állapot nem bukik el" hibát írt volna magára az őrre).
 * Ezért a commit-azonosító rögzített — a 699188c8 az utolsó olyan commit,
 * amelyben MÉG megvolt az AI-csevegőseged, MÉG nem takarított a kijelentkezés,
 * és a közös ürítő helper MÉG nem is létezett.
 */
const JAVITAS_ELOTTI_COMMIT = '699188c8054e5c9ed584ba7cd03daea4e4a94b89'

function commitbol(rel) {
  try {
    return egysegesSorvegek(
      execFileSync('git', ['show', `${JAVITAS_ELOTTI_COMMIT}:${rel}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 40 * 1024 * 1024,
        // A git hibaüzenetét elnyeljük: a helper fájl HIÁNYA a régi commiton
        // VÁRT eredmény (akkor még nem létezett) — ne nézzen ki hibának.
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return null // a régi commiton nem létező fájl — pontosan ezt várjuk a helpertől
  }
}

const REGI_FORRASOK = {
  header: commitbol(REL.header),
  helper: commitbol(REL.helper),
  devReset: commitbol(REL.devReset),
  offlineDb: commitbol(REL.offlineDb),
}
const REGI_AI_VILAG = gitVilag(JAVITAS_ELOTTI_COMMIT, `a ${JAVITAS_ELOTTI_COMMIT.slice(0, 8)} commit`)

if (REGI_FORRASOK.header === null && REGI_AI_VILAG === null) {
  // ⚠️ 2026-08-24 — EZ A KIMARADÁS VÁRHATÓ, NEM HIBA, és nem is teszi vakká az őrt.
  // Két oka lehet: (1) a CI sekély klónt használ (fetch-depth 1), ott egyetlen
  // régi commit sem elérhető; (2) a 699188c8 SQUASH-merge-dzsel került a main-be,
  // tehát a commit-objektum a főágon amúgy sem létezik.
  // A tényleges fedezetet a LENTI szintetikus világok adják — azok git nélkül,
  // determinisztikusan játsszák újra ugyanezeket a hibákat. Ez a blokk csak
  // ráadás: valódi történelemmel is igazolja a mércét, ha a történelem elérhető.
  console.log(
    `   ! a ${JAVITAS_ELOTTI_COMMIT.slice(0, 8)} commit nem olvasható (sekély klón vagy squash-merge) — ` +
      'ez a RÁADÁS-részmérce kimarad; a fedezetet a szintetikus világok adják',
  )
} else {
  const r = ellenoriz(REGI_FORRASOK, 'A JAVÍTÁS ELŐTTI VALÓDI ÁLLAPOT', {
    szintaxis: false,
    aiVilag: REGI_AI_VILAG,
  })
  const bukik = r.mercek.has('M2') && r.mercek.has('M3') && r.mercek.has('M4')
  if (!bukik) {
    negativHibak.push('a régi állapot NEM bukott el mind az M2/M3/M4 mércén — az őr vak lenne')
  }
  console.log(
    `   ${bukik ? '✓' : '✗'} a régi állapot ${r.hibak} ponton bukik (mércék: ${[...r.mercek].join(', ') || 'egy sem'})`,
  )
}

/* (b) Szintetikus AI-világok — az M2 mércének mindegyiken buknia kell.
      Csak a memóriában élnek: a repóban egyetlen fájlt sem hoznak létre. */
const AI_VILAG_MUTANSOK = [
  {
    nev: 'M2/a — visszakerül a components/ai/ mappa',
    utak: ['apps/web/components/ai'],
    varhato: 'nincs meg az AI-útvonal: apps/web/components/ai',
  },
  {
    nev: 'M2/b — visszakerül az api/ai/ végpont',
    utak: ['apps/web/app/api/ai'],
    varhato: 'nincs meg az AI-útvonal: apps/web/app/api/ai',
  },
  {
    nev: 'M2/c — visszakerül a lib/constants/ai.ts',
    utak: ['apps/web/lib/constants/ai.ts'],
    varhato: 'nincs meg az AI-útvonal: apps/web/lib/constants/ai.ts',
  },
  {
    // A VALÓDI, 2026-08-23 előtti sor a dashboard layoutból.
    nev: 'M2/d — a layout megint behúzza a csevegőablakot',
    fajlok: {
      'apps/web/app/(dashboard)/layout.tsx':
        "import { AiChatWidgetLazy } from '@/components/ai/ai-chat-widget-lazy'\n\nexport default function DashboardLayout() {\n  return <AiChatWidgetLazy hasApiKey={true} />\n}\n",
    },
    varhato: 'a forrásban nincs „ai-chat-widget" hivatkozás',
  },
  {
    nev: 'M2/e — megint van EU-n kívüli kulcs a kódban',
    fajlok: {
      'apps/web/app/valami/route.ts': 'const kulcs = process.env.OPENROUTER_API_KEY\n',
    },
    varhato: 'a forrásban nincs „OPENROUTER_API_KEY" hivatkozás',
  },
  {
    nev: 'M2/f — a .env.example megint meghirdeti a Groq/Gemini kulcsot',
    fajlok: { 'apps/web/.env.example': 'GROQ_API_KEY=\nGEMINI_API_KEY=\n' },
    varhato: 'a forrásban nincs „GROQ_API_KEY" hivatkozás',
  },
  {
    nev: 'M2/g — valaki megint hívja az /api/ai végpontot',
    fajlok: { 'packages/ui/src/valami.tsx': "await fetch('/api/ai/chat', { method: 'POST' })\n" },
    varhato: 'a forrásban nincs „api/ai" hivatkozás',
  },
  {
    // Fail-closed számláló: ha a bejárás elromlik és 0 fájlt olvas, az NEM
    // „tiszta repó". Enélkül egy elrontott útvonal némán zöldre váltana.
    nev: 'M2/h — a söprés elromlik és egyetlen forrást sem olvas',
    fajlDb: 0,
    varhato: 'a söprés 0 forrásfájlt olvasott',
  },
]

for (const m of AI_VILAG_MUTANSOK) {
  const vilag = szintetikusVilag(m.nev, {
    utak: m.utak ?? [],
    fajlok: m.fajlok ?? {},
    fajlDb: m.fajlDb ?? 999,
  })
  hibak = 0
  bukottMercek.clear()
  bukottUzenetek.length = 0
  console.log(`\n── MUTÁNS · ${m.nev} ──`)
  m2NincsAiSeged(vilag)
  const bukik = bukottMercek.has('M2') && bukottUzenetek.some((u) => u.startsWith(m.varhato))
  if (!bukik) negativHibak.push(`${m.nev}: az M2 mérce NEM a várt okból bukott el („${m.varhato}")`)
  console.log(`   ${bukik ? '✓' : '✗'} ${m.nev} → M2 ${bukik ? 'elbukik (helyes)' : 'ÁTMEGY (vak őr!)'}`)
}

/* (c) SZÁNDÉKOS ELLENPÉLDA: a KOMMENTBEN álló említés NEM bukhat.
      Ez bizonyítja, hogy a söprés tényleg a kommentek nélküli szöveget nézi —
      különben az M2 „zöldje" akár azért is jöhetne, mert a minta sosem talál. */
{
  const vilag = szintetikusVilag('csak kommentben említve', {
    fajlok: {
      'apps/web/lib/valami.ts':
        '/** Történelem: itt élt az ai-chat-widget (AiChatWidget), a constants/ai és az api/ai. */\n' +
        '// Az OPENROUTER_API_KEY, GROQ_API_KEY és GEMINI_API_KEY 2026-08-23-án megszűnt.\n' +
        'export const x = 1\n',
    },
  })
  hibak = 0
  bukottMercek.clear()
  bukottUzenetek.length = 0
  console.log('\n── ELLENPÉLDA · a puszta KOMMENT-említés nem bukhat ──')
  m2NincsAiSeged(vilag)
  const atmegy = !bukottMercek.has('M2')
  if (!atmegy) negativHibak.push('a kommentben álló említés elbuktatta az M2-t — a söprés nem szedi ki a kommenteket')
  console.log(`   ${atmegy ? '✓' : '✗'} a kommentben álló említés ${atmegy ? 'nem bukik (helyes)' : 'BUKIK (téves riasztás!)'}`)
}

/* (d) Szintetikus fájl-mutánsok az M1/M3/M4 mércékre. */
const MUTANSOK = [
  {
    nev: 'M1 — elrontott JSX a /dev-reset oldalon (lezáratlan tag)',
    merce: 'M1',
    fajl: 'devReset',
    szintaxis: true,
    keszit: (s) => s.replace('🧹 Cache reset folyamatban</h1>', '🧹 Cache reset folyamatban'),
  },
  {
    nev: 'M3/a — a kijelentkezés már NEM hívja az ürítőt',
    merce: 'M3',
    fajl: 'header',
    keszit: (s) => s.replace(/\n[ \t]*await uritsdAHelyiAdatCachet\(\)/, ''),
  },
  {
    // A valódi versenyhelyzet újrajátszása: a signOut() redirect-tel elhagyja az
    // oldalt, így az utána következő takarítás SOHA nem futna le.
    nev: 'M3/b — az ürítés a signOut() UTÁNRA kerül (versenyhelyzet)',
    merce: 'M3',
    fajl: 'header',
    // A `await signOut()` sort kivesszük a helyéről, és rögtön a
    // `setSigningOut(true)` után szúrjuk vissza — így a takarítás a redirect
    // MÖGÉ kerül. (Formázás-független mutáció: nem függ a try/catch alakjától.)
    keszit: (s) =>
      s
        .replace(/\n[ \t]*await signOut\(\)/, '')
        .replace(/(\n([ \t]*)setSigningOut\(true\))/, '$1\n$2await signOut()'),
  },
  {
    nev: 'M4/a — a helper már nem törli a Cache Storage-t',
    merce: 'M4',
    fajl: 'helper',
    keszit: (s) => s.replace('await caches.delete(kulcs)', 'void kulcs'),
  },
  {
    nev: 'M4/b — a helper már nem dobja el az offline IndexedDB-t',
    merce: 'M4',
    fajl: 'helper',
    keszit: (s) => s.replace('indexedDB.deleteDatabase(OFFLINE_DB_NEV)', 'null as unknown as IDBOpenDBRequest'),
  },
  {
    nev: 'M4/c — a helper elgépelt DB-nevet töröl (némán a semmit)',
    merce: 'M4',
    fajl: 'helper',
    keszit: (s) => s.replace("export const OFFLINE_DB_NEV = 'kartoteka_offline'", "export const OFFLINE_DB_NEV = 'kartoteka-offline'"),
  },
  {
    nev: 'M4/d — a helper vakon clear()-t hív (elviszi a témát és a beállításokat)',
    merce: 'M4',
    fajl: 'helper',
    keszit: (s) => s.replace('      tarolo.removeItem(kulcs)', '      localStorage.clear()'),
  },
  {
    nev: 'M4/e — a /dev-reset visszatér a saját másolatához (széthúzás)',
    merce: 'M4',
    fajl: 'devReset',
    keszit: (s) =>
      s
        .replace(/import \{ uritsdAHelyiAdatCachet \} from '@\/lib\/utils\/helyi-tarolo-urites'\n/, '')
        .replace(
          /await uritsdAHelyiAdatCachet\(\{[\s\S]*?\}\)/,
          'for (const key of await caches.keys()) await caches.delete(key)',
        ),
  },
]

for (const m of MUTANSOK) {
  const eredeti = ELES[m.fajl]
  if (eredeti === null) {
    negativHibak.push(`${m.nev}: a mutálandó fájl (${REL[m.fajl]}) nem olvasható`)
    console.log(`   ✗ ${m.nev} — a forrásfájl hiányzik`)
    continue
  }
  const mutalt = m.keszit(eredeti)
  if (mutalt === eredeti) {
    negativHibak.push(`${m.nev}: a mutáns NEM különbözik az eredetitől (elmozdult a horgony)`)
    console.log(`   ✗ ${m.nev} — a mutáció nem fogott`)
    continue
  }
  const r = ellenoriz({ ...ELES, [m.fajl]: mutalt }, `MUTÁNS · ${m.nev}`, { szintaxis: Boolean(m.szintaxis) })
  const bukik = r.mercek.has(m.merce)
  if (!bukik) negativHibak.push(`${m.nev}: a(z) ${m.merce} mérce NEM bukott el rajta`)
  console.log(`   ${bukik ? '✓' : '✗'} ${m.nev} → ${m.merce} ${bukik ? 'elbukik (helyes)' : 'ÁTMEGY (vak őr!)'}`)
}

/* ── ÖSSZEGZÉS ──────────────────────────────────────────────────────────── */
console.log('\n═══ ÖSSZEGZÉS ═══')
console.log(`ÉLES fájlok hibái: ${eles.hibak}`)
console.log(`Negatív asszert hibái: ${negativHibak.length}`)
for (const h of negativHibak) console.log(`  ✗ ${h}`)

if (eles.hibak === 0 && negativHibak.length === 0) {
  console.log('\n✅ PASS — mind az öt mérce teljesül.')
  process.exit(0)
}
console.log('\n❌ FAIL')
process.exit(1)
