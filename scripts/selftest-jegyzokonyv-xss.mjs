#!/usr/bin/env node
/**
 * JEGYZŐKÖNYV-NYOMTATVÁNY XSS önellenőrzés (2026-08-24, biztonsági kör — B3).
 *
 * Mit véd: `apps/web/lib/minutes/print.ts` — a jegyzőkönyv, a határozat-kivonat
 * és a meghívó KÖZÖS HTML-építője, valamint a három hívó felület.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A nyomtatvány HTML-jét HÁROM komponens állította elő (minutes-editor,
 * minutes-list, minutes-print-selector), és EGYIK sem escape-elt EGYETLEN
 * mezőt sem. Egy jegyzőkönyv-írásra jogosult felhasználó `<img src=x
 * onerror=…>`-t írhatott egy határozat szövegébe, és az BÁRKINÉL lefutott, aki
 * megnyitotta a nyomtatási előnézetet — a NÉZŐ (esperes, számvevő,
 * RENDSZERGAZDA) munkamenetével, a kartoteka.app originben.
 *
 * A javításnak KÉT olyan tulajdonsága van, ami egy későbbi refaktorban némán
 * visszaeshet, ezért mindkettőre asszert van:
 *   1. MINDEN mező escape-elődik;
 *   2. a sorrend KÖTÖTT — előbb escape, UTÁNA `\n` → `<br>`. Fordítva a `<br>`
 *      is escape-elődne, és a sortörés ELVESZNE a hivatalos nyomtatványból.
 * Plusz egy harmadik: a három komponens NE építsen újra saját HTML-t.
 *
 * MINDEN asszert MUTÁNS-ELLENŐRZÉSSEL fut: eljátsszuk a RÉGI, hibás világot —
 * a MAI forrásból, string-átalakítással, NEM git-történelemből — és bizonyítjuk,
 * hogy a merce ELBUKIK rajta. Őrszem negatív asszert nélkül vak.
 *
 * Ha egy horgony elmozdul (a mutáns nem állítható elő), az őrszem HANGOSAN
 * bukik — nem hallgat el.
 *
 * Futtatás:  node scripts/selftest-jegyzokonyv-xss.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/** Fájl beolvasása — hiányzó fájl HANGOS hiba, nem néma átugrás. */
function olvasForras(...reszek) {
  const teljes = path.join(REPO_ROOT, ...reszek)
  if (!fs.existsSync(teljes)) {
    fail(`hiányzik a fájl: ${path.join(...reszek)}`)
    return null
  }
  return fs.readFileSync(teljes, 'utf8')
}

/** Kommentek eltávolítása: blokk-kommentek + a csak-kommentből álló sorok. */
function kommentNelkul(src) {
  if (!src) return ''
  const blokkNelkul = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return blokkNelkul
    .split('\n')
    .filter((sor) => {
      const t = sor.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/**
 * Egy szöveges őrszem-asszert MUTÁNS-ellenőrzéssel.
 * @param pred (forras) => boolean — igaz, ha a forrás HELYES
 */
function orszem(nev, pred, joForras, mutans) {
  if (joForras === null || joForras === undefined) return
  if (mutans === joForras) {
    fail(`${nev}: az őrszem nem tudta előállítani a mutánst (ELMOZDULT HORGONY)`)
    return
  }
  if (!pred(joForras)) {
    fail(`${nev}: a JELENLEGI forrás megbukik az asszerten`)
    return
  }
  if (pred(mutans)) {
    fail(`${nev}: az őrszem VAK — a régi, hibás alak is átmegy rajta`)
    return
  }
  ok(`${nev} (mutáns-ellenőrzéssel)`)
}

// ════════════════════════════════════════════════════════════════════════════
// A) FUNKCIONÁLIS RÉSZ — a közös HTML-építő TISZTA függvényként
// ════════════════════════════════════════════════════════════════════════════

const PRINT_TS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'minutes', 'print.ts')
const TEMPLATES_TS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'filing', 'templates.ts')
const IDOPONT_TS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'utils', 'idopont-bukarest.ts')

/** A `@/lib/...` alias Node-ban nem oldható fel — a temp-beli társfájlra írjuk át. */
const ALIAS_TERKEP = [
  [/require\((['"])@\/lib\/filing\/templates\1\)/g, "require('./filing-templates.js')"],
  [/require\((['"])@\/lib\/utils\/idopont-bukarest\1\)/g, "require('./idopont-bukarest.js')"],
]

/**
 * A közös HTML-építő betöltése.
 * @param atalakito (ts-forras) => ts-forras | null — a MUTÁNS előállítója
 *   (null = a horgony elmozdult, az őrszem szóljon)
 * @param aliasKotelezo ha true, a `@/lib/filing/templates` require-nek jelen
 *   kell lennie a transpile-olt kimenetben — különben a modul már NEM a közös
 *   escape-előt használja, és erről tudnunk kell.
 */
function betoltPrintModul(ts, requireFn, atalakito, aliasKotelezo) {
  let printKod = fs.readFileSync(PRINT_TS, 'utf8')
  if (atalakito) {
    const atalakitott = atalakito(printKod)
    if (atalakitott === null || atalakitott === printKod) return { hiba: 'ELMOZDULT_HORGONY' }
    printKod = atalakitott
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-jk-xss-selftest-'))
  const forditas = (kod, fajlNev) => {
    const out = ts.transpileModule(kod, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: fajlNev,
    }).outputText
    return ALIAS_TERKEP.reduce((acc, [minta, csere]) => acc.replace(minta, csere), out)
  }

  const printJs = ts.transpileModule(printKod, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: 'print.ts',
  }).outputText

  if (aliasKotelezo && !/@\/lib\/filing\/templates/.test(printJs)) {
    fs.rmSync(tmp, { recursive: true, force: true })
    return { hiba: 'NINCS_KOZOS_ESCAPE_IMPORT' }
  }

  const printAtirt = ALIAS_TERKEP.reduce((acc, [minta, csere]) => acc.replace(minta, csere), printJs)

  fs.writeFileSync(path.join(tmp, 'idopont-bukarest.js'), forditas(fs.readFileSync(IDOPONT_TS, 'utf8'), 'idopont-bukarest.ts'), 'utf8')
  fs.writeFileSync(path.join(tmp, 'filing-templates.js'), forditas(fs.readFileSync(TEMPLATES_TS, 'utf8'), 'templates.ts'), 'utf8')
  const cel = path.join(tmp, 'print.js')
  fs.writeFileSync(cel, printAtirt, 'utf8')

  try {
    return { modul: requireFn(cel) }
  } catch (e) {
    return { hiba: `BETOLTES: ${e?.message || e}` }
  } finally {
    // A require már beolvasta a fájlokat — a temp törölhető.
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* nem kritikus */ }
  }
}

// ── Támadó adat: MINDEN szövegmezőben ───────────────────────────────────────
const TAMADAS = '<img src=x onerror="alert(1)">'
const SZKRIPT = '<script>alert(2)</script>'
// A sortörés-mintában SZÁNDÉKOSAN nincs HTML: így az escape nem torzítja, és a
// `<br>` jelenléte önmagában bizonyítja a helyes sorrendet.
const SORTORES = 'SORELSO\nSORMASODIK'
const TOBBSOROS = `${TAMADAS}\n${SORTORES}\n${SZKRIPT}`

function tesztAdat() {
  return {
    congregationName: `Gyülekezet ${TAMADAS}`,
    tipus: 'presbiteri',
    datum: `2026-03-14${TAMADAS}`,
    hely: `Terem ${TAMADAS}`,
    kezdes: `18:00 ${SZKRIPT}`,
    elnok_neve: `Elnök ${TAMADAS}`,
    jegyzo_neve: `Jegyző ${SZKRIPT}`,
    hitelesito1: `Hitelesítő1 ${TAMADAS}`,
    hitelesito2: `Hitelesítő2 ${SZKRIPT}`,
    igevers: `Ige ${TAMADAS}`,
    felolvasas: `Felolvasás ${SZKRIPT}`,
    megjegyzes: TOBBSOROS,
    resztvevok: [
      { nev: `Jelen ${TAMADAS}`, statusz: 'jelen' },
      { nev: `Távol ${SZKRIPT}`, statusz: 'igazoltan_tavol' },
    ],
    napirendi_pontok: [
      {
        id: 'np-1',
        sorszam: 1,
        cim: `Napirend ${TAMADAS}`,
        eloado: `Előadó ${SZKRIPT}`,
        targyalas: TOBBSOROS,
      },
    ],
    hatarozatok: [
      { sorszam: 1, szoveg: TOBBSOROS, napirendi_pont_id: 'np-1' },
      { sorszam: 2, szoveg: `Kötetlen határozat ${TAMADAS}`, napirendi_pont_id: null },
    ],
  }
}

const TIPUSOK = ['jegyzokonyv', 'meghivo', 'hatarozat_kivonat']
const OPCIOK = [
  ['szerkesztő nézet', { napirendOszlop: true, presbiterLista: true }],
  ['mentett nézet', {}],
]

/**
 * A mercék egy betöltött modulra.
 * @returns { xssRendben: boolean, sortoresRendben: boolean, escRendben: boolean, reszletek: string[] }
 */
function mercek(modul) {
  const reszletek = []
  let xssRendben = true
  let sortoresRendben = true

  for (const [opcioNev, opciok] of OPCIOK) {
    for (const tipus of TIPUSOK) {
      let html
      try {
        html = modul.buildMinutesPrintHtml(tipus, tesztAdat(), opciok)
      } catch (e) {
        reszletek.push(`${tipus} (${opcioNev}): kivétel — ${e?.message || e}`)
        xssRendben = false
        sortoresRendben = false
        continue
      }

      // 1. Nincs ÉLŐ tag/eseménykezelő a kimenetben.
      //    ⚠️ A puszta `onerror=` NEM jó merce: escape után is ott marad a
      //    szövegben (`&lt;img src=x onerror=&quot;alert(1)&quot;&gt;`) — az
      //    számít, hogy a `<` és az idézőjel escape-elődött-e. Ezért az ÉLŐ
      //    eseménykezelőt keressük: `on…=` UTÁN közvetlenül idézőjel/kódrészlet.
      if (/on\w+\s*=\s*["']?\s*alert/i.test(html)) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): ÉLŐ eseménykezelő a kimenetben`) }
      if (/<script/i.test(html)) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): ÉLŐ <script a kimenetben`) }
      if (/<img/i.test(html)) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): ÉLŐ <img a kimenetben`) }
      if (html.includes(TAMADAS)) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): a nyers <img>-hasznos teher SZÓ SZERINT benne van`) }
      if (html.includes(SZKRIPT)) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): a nyers <script>-hasznos teher SZÓ SZERINT benne van`) }
      // 2. …viszont az ESCAPE-ELT alak ott van (tehát a mező tényleg kiíródott).
      if (!html.includes('&lt;img')) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): hiányzik az escape-elt &lt;img`) }
      if (!html.includes('&lt;script')) { xssRendben = false; reszletek.push(`${tipus} (${opcioNev}): hiányzik az escape-elt &lt;script`) }

      // 3. A SORTÖRÉS megmarad — ez bizonyítja, hogy escape UTÁN jön a <br>.
      //    (A `hatarozat_kivonat` és a `jegyzokonyv` írja ki a többsoros mezőket;
      //     a meghívóban nincs többsoros mező, ezért ott nem várjuk el.)
      if (tipus !== 'meghivo') {
        if (!html.includes('SORELSO<br>SORMASODIK')) {
          sortoresRendben = false
          reszletek.push(`${tipus} (${opcioNev}): elveszett a sortörés (nincs SORELSO<br>SORMASODIK)`)
        }
      }
    }
  }

  // 4. A közös escape-elő tényleg mind az 5 karaktert kezeli.
  const escRendben = modul.esc('&<>"\'') === '&amp;&lt;&gt;&quot;&#39;'

  return { xssRendben, sortoresRendben, escRendben, reszletek }
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  ts = null
}

if (!fs.existsSync(PRINT_TS)) {
  fail('hiányzik a közös HTML-építő: apps/web/lib/minutes/print.ts')
} else if (!ts) {
  console.log('INFO: a typescript csomag nem elérhető — a FUNKCIONÁLIS rész kimarad (a szöveges mercék futnak)')
} else {
  // ── A/1. A JELENLEGI forrás: minden merce teljesül ────────────────────────
  const jo = betoltPrintModul(ts, require_, null, true)
  if (jo.hiba) {
    fail(`a közös HTML-építő nem tölthető be: ${jo.hiba}`)
  } else {
    const m = mercek(jo.modul)
    if (m.escRendben) ok('esc() mind az 5 HTML-karaktert kezeli (& < > " \')')
    else fail('esc() NEM kezeli mind az 5 HTML-karaktert')
    if (m.xssRendben) ok('a beinjektált <img onerror>/<script> MINDEN nyomtatványban escape-elve jelenik meg')
    else fail(`XSS-merce bukott: ${m.reszletek.join(' | ')}`)
    if (m.sortoresRendben) ok('a sortörés megmarad (escape → utána <br>)')
    else fail(`sortörés-merce bukott: ${m.reszletek.join(' | ')}`)
  }

  // ── A/2. NEGATÍV ASSZERT — „régi világ" 1.: NINCS escape ──────────────────
  //
  // A mai forrásból állítjuk elő: a közös escape-elő importját azonosság-
  // függvényre cseréljük. Ez pontosan a 2026-08-24 előtti viselkedés.
  const ESC_IMPORT = "import { escapeHtml } from '@/lib/filing/templates'"
  const m1 = betoltPrintModul(
    ts,
    require_,
    (src) => (src.includes(ESC_IMPORT)
      ? src.replace(ESC_IMPORT, 'const escapeHtml = (value: string): string => String(value)')
      : null),
    false,
  )
  if (m1.hiba === 'ELMOZDULT_HORGONY') {
    fail('NEGATÍV ASSZERT 1: nem állítható elő az escape NÉLKÜLI változat (elmozdult az escape-import horgonya) — az őrszem VAK lenne')
  } else if (m1.hiba) {
    fail(`NEGATÍV ASSZERT 1: a mutáns nem tölthető be: ${m1.hiba}`)
  } else {
    const m = mercek(m1.modul)
    if (m.xssRendben) fail('NEGATÍV ASSZERT 1: az őrszem VAK — az escape NÉLKÜLI változat is átmegy az XSS-mercén')
    else ok('NEGATÍV ASSZERT 1: az escape nélküli (régi) változat ELBUKIK az XSS-mercén')
  }

  // ── A/3. NEGATÍV ASSZERT — „régi világ" 2.: FORDÍTOTT SORREND ─────────────
  //
  // Ha a `<br>` beszúrása MEGELŐZI az escape-et, a `<br>` maga is escape-elődik
  // (`&lt;br&gt;`), és a sortörés elveszik a hivatalos nyomtatványból.
  const SORREND_HORGONY = "return esc(value).replace(/\\n/g, '<br>')"
  const SORREND_MUTANS = "return esc(String(value ?? '').replace(/\\n/g, '<br>'))"
  const m2 = betoltPrintModul(
    ts,
    require_,
    (src) => (src.includes(SORREND_HORGONY) ? src.replace(SORREND_HORGONY, SORREND_MUTANS) : null),
    false,
  )
  if (m2.hiba === 'ELMOZDULT_HORGONY') {
    fail('NEGATÍV ASSZERT 2: nem állítható elő a fordított sorrendű változat (elmozdult az escTobbsoros horgonya) — az őrszem VAK lenne')
  } else if (m2.hiba) {
    fail(`NEGATÍV ASSZERT 2: a mutáns nem tölthető be: ${m2.hiba}`)
  } else {
    const m = mercek(m2.modul)
    if (m.sortoresRendben) fail('NEGATÍV ASSZERT 2: az őrszem VAK — a fordított sorrend is átmegy a sortörés-mercén')
    else ok('NEGATÍV ASSZERT 2: a fordított sorrend (előbb <br>, utána escape) ELBUKIK a sortörés-mercén')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// B) SZÖVEGES RÉSZ — a három felület NE építsen saját HTML-t
// ════════════════════════════════════════════════════════════════════════════
//
// A projekt dokumentált hibaosztálya: „a második felület a régi implementációt
// őrzi". Itt pontosan ez sült el — három másolat, egyikben sem volt escape.
// Ha valaki visszamásolja a nyers interpolációt, a merce bukjon.
//
// A vizsgálat KOMMENT NÉLKÜLI forráson fut: a javítás dokumentációja szó
// szerint idézi a régi hibás alakot (`<img src=x onerror=…>`), és egy naiv
// regex arra is ráillene.

const KOMPONENSEK = [
  ['minutes-editor.tsx', olvasForras('apps', 'web', 'components', 'minutes', 'minutes-editor.tsx')],
  ['minutes-list.tsx', olvasForras('apps', 'web', 'components', 'minutes', 'minutes-list.tsx')],
  ['minutes-print-selector.tsx', olvasForras('apps', 'web', 'components', 'minutes', 'minutes-print-selector.tsx')],
]

/** A régi, hibás alak egy sűrített darabja — pontosan ezt másolták háromszor. */
const REGI_NYERS_HTML =
  '    const regi = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"></head><body>' +
  '${d.megjegyzes}${h.szoveg.replace(/\\n/g, \'<br>\')}</body></html>`\n'

for (const [nev, src] of KOMPONENSEK) {
  orszem(
    `B1 ${nev} a KÖZÖS HTML-építőt hívja, nem épít saját dokumentumot`,
    (forras) => {
      const tiszta = kommentNelkul(forras)
      if (!/buildMinutesPrintHtml\s*\(/.test(tiszta)) return false
      if (!/from '@\/lib\/minutes\/print'/.test(tiszta)) return false
      // Saját HTML-dokumentum építése (bármelyik jele) → bukás.
      if (/<!DOCTYPE/i.test(tiszta)) return false
      if (/<html\b/i.test(tiszta)) return false
      // Nyers sortörés-konverzió a komponensben = escape nélküli interpoláció.
      if (/replace\(\/\\n\/g/.test(tiszta)) return false
      return true
    },
    src,
    (src || '') + REGI_NYERS_HTML,
  )
}

// ── B2: az ELŐNÉZETI iframe sandboxolt (mélységi védelem) ───────────────────
//
// A `srcDoc`-os iframe sandbox NÉLKÜL a szülő originjét örökli. Ez CSAK az
// előnézet — a nyomtatás a print-engine-v2 saját, nem-sandboxolt iframe-jében
// fut, ezért a `sandbox=""` itt nem töri el a nyomtatást.
{
  const dialog = olvasForras('apps', 'web', 'components', 'minutes', 'minutes-print-dialog.tsx')
  orszem(
    'B2 az előnézeti srcDoc-iframe sandboxolt',
    (forras) => {
      const tiszta = kommentNelkul(forras)
      const m = tiszta.match(/<iframe[\s\S]*?\/>/)
      if (!m) return false
      if (!/srcDoc=\{html\}/.test(m[0])) return false
      return /sandbox=""/.test(m[0])
    },
    dialog,
    (dialog || '').replace(/\n\s*sandbox=""/, ''),
  )
}

// ── B3: a közös modul a REPÓ közös escape-előjét használja ──────────────────
{
  const printSrc = olvasForras('apps', 'web', 'lib', 'minutes', 'print.ts')
  orszem(
    'B3 a közös HTML-építő a repó közös escapeHtml-jét importálja (nincs saját másolat)',
    (forras) => /import \{ escapeHtml \} from '@\/lib\/filing\/templates'/.test(kommentNelkul(forras)),
    printSrc,
    (printSrc || '').replace(
      "import { escapeHtml } from '@/lib/filing/templates'",
      'const escapeHtml = (v: string) => v',
    ),
  )

  // ── B4: a közös escape-elő tényleg mind az 5 karaktert lefedi ─────────────
  const templatesSrc = olvasForras('apps', 'web', 'lib', 'filing', 'templates.ts')
  orszem(
    'B4 a közös escapeHtml mind az 5 karaktert cseréli (& < > " \')',
    (forras) => {
      const tiszta = kommentNelkul(forras)
      const blokk = tiszta.match(/export function escapeHtml[\s\S]*?\n\}/)
      if (!blokk) return false
      return (
        /replaceAll\('&', '&amp;'\)/.test(blokk[0]) &&
        /replaceAll\('<', '&lt;'\)/.test(blokk[0]) &&
        /replaceAll\('>', '&gt;'\)/.test(blokk[0]) &&
        /replaceAll\('"', '&quot;'\)/.test(blokk[0]) &&
        /replaceAll\("'", '&#39;'\)/.test(blokk[0])
      )
    },
    templatesSrc,
    // ⚠️ Sima szöveg-csere, NEM regex sorvég-horgonnyal: a repóban vegyesen
    // van CRLF és LF, egy `\)\n` minta a CRLF-es fájlokon némán nem találna.
    (templatesSrc || '').replace(".replaceAll('<', '&lt;')", ''),
  )
}

if (failed) {
  console.error('\nA jegyzőkönyv-XSS önellenőrzés BUKOTT.')
  process.exit(1)
}
console.log('\nA jegyzőkönyv-XSS önellenőrzés rendben.')
