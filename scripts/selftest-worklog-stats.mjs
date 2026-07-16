#!/usr/bin/env node
/**
 * Munkanapló év-statisztika (apps/web/lib/worklog/statistics.ts) önellenőrzés —
 * build/tesztkeret nélkül futtatható (a selftest-biblia.mjs transpile-mintájára).
 *
 * A node_modules-beli `typescript`-tel CommonJS-re fordítja a statisztika-magot
 * és függőségeit (@kartoteka/biblia + lib/constants/worklog) egy temp
 * könyvtárba, majd vegyes mintaadatokon ellenőrzi:
 *   - típus-statisztika (db, össz/átlag-jelenlét, F/N/Gy, napszak, havi idősor),
 *   - parseEnekTokens változatok ('400/B', '400 b', versszak-levágás,
 *     szóközös lista, vegyes szabad szöveg egész szegmense kihagyva),
 *   - alapige-gyakoriság kanonikus alakkal (írásmód-változatok összeolvadnak),
 *   - lefedettség (ismert kis tartomány + könyvenkénti bontás),
 *   - értelmezhetetlen igehelyek listázása (cap nélkül, a teljes distinct lista).
 *
 * Futtatás:  node scripts/selftest-worklog-stats.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

let total = 0
let failedCount = 0
const assert = (cond, msg) => {
  total++
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount++
    console.error(`FAIL: ${msg}`)
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── TypeScript transpiler betöltése ──────────────────────────────────────────
const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  try {
    ts = createRequire(path.join(REPO_ROOT, 'apps', 'web', 'package.json'))('typescript')
  } catch {
    console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
    process.exit(0)
  }
}

// ── Források transpile-olása temp könyvtárba ─────────────────────────────────
// Elrendezés a relatív require-okhoz:
//   tmp/biblia/src/*.js (+ data/verse-counts.json)
//   tmp/web/lib/constants/worklog.js
//   tmp/web/lib/worklog/statistics.js  (átírt importokkal)
const FILES = [
  ['packages/biblia/src/types.ts', 'biblia/src/types.js'],
  ['packages/biblia/src/books.ts', 'biblia/src/books.js'],
  ['packages/biblia/src/parser.ts', 'biblia/src/parser.js'],
  ['packages/biblia/src/format.ts', 'biblia/src/format.js'],
  ['packages/biblia/src/coverage.ts', 'biblia/src/coverage.js'],
  ['packages/biblia/src/index.ts', 'biblia/src/index.js'],
  ['apps/web/lib/constants/worklog.ts', 'web/lib/constants/worklog.js'],
  ['apps/web/lib/worklog/statistics.ts', 'web/lib/worklog/statistics.js'],
]
const DATA_FILE = path.join(REPO_ROOT, 'packages', 'biblia', 'src', 'data', 'verse-counts.json')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-worklog-stats-selftest-'))
try {
  for (const [from, to] of FILES) {
    const code = fs.readFileSync(path.join(REPO_ROOT, from), 'utf8')
    const out = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: from,
    })
    // A path-alias és workspace-csomag importok átírása a temp-elrendezés
    // relatív útjaira (a ts.transpileModule a specifiereket változatlanul hagyja)
    const js = out.outputText
      .replace(/require\((['"])@\/lib\/constants\/worklog\1\)/g, 'require("../constants/worklog")')
      .replace(/require\((['"])@kartoteka\/biblia\1\)/g, 'require("../../../biblia/src/index")')
    const dest = path.join(tmp, to)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, js, 'utf8')
  }
  fs.mkdirSync(path.join(tmp, 'biblia', 'src', 'data'), { recursive: true })
  fs.copyFileSync(DATA_FILE, path.join(tmp, 'biblia', 'src', 'data', 'verse-counts.json'))

  const { computeWorklogStatistics, parseEnekTokens } = require_(
    path.join(tmp, 'web', 'lib', 'worklog', 'statistics.js'),
  )

  // Dinamikus elvárások a versszám-katalógusból (nem tippelünk versszámokat)
  const vc = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  const psa23 = vc.counts.PSA[22] // Zsolt 23 versszáma
  const jhnOssz = vc.counts.JHN.reduce((a, b) => a + b, 0)
  const psaOssz = vc.counts.PSA.reduce((a, b) => a + b, 0)

  // ── parseEnekTokens ────────────────────────────────────────────────────────
  assert(eq(parseEnekTokens('153, 25, 400b'), ['153', '25', '400b']), "parseEnekTokens('153, 25, 400b') → ['153','25','400b']")
  assert(eq(parseEnekTokens('400/B'), ['400b']), "parseEnekTokens('400/B') → ['400b']")
  assert(eq(parseEnekTokens('400B'), ['400b']), "parseEnekTokens('400B') → ['400b']")
  assert(eq(parseEnekTokens('Ifjúsági énekek'), []), 'parseEnekTokens: nem szám-szerű szabad szöveg kimarad')
  assert(eq(parseEnekTokens(null), []) && eq(parseEnekTokens(undefined), []), 'parseEnekTokens: null/undefined → []')
  assert(eq(parseEnekTokens('153;25 090, 12.'), ['153', '25', '90', '12']), 'parseEnekTokens: ;/szóköz elválasztó + vezető nulla + záró pont')
  assert(eq(parseEnekTokens('400 b'), ['400b']), "parseEnekTokens('400 b') → ['400b'] (szóköz-toleráns változat-jel)")
  assert(eq(parseEnekTokens('400/ b'), ['400b']), "parseEnekTokens('400/ b') → ['400b']")
  assert(eq(parseEnekTokens('400. b'), ['400b']), "parseEnekTokens('400. b') → ['400b']")
  assert(eq(parseEnekTokens('153/1-3'), ['153']), "parseEnekTokens('153/1-3') → ['153'] (versszak-jelölés levágva)")
  assert(eq(parseEnekTokens('265:1'), ['265']), "parseEnekTokens('265:1') → ['265'] (kettőspontos versszak levágva)")
  assert(eq(parseEnekTokens('153, Halleluja 68'), ['153']), "parseEnekTokens('153, Halleluja 68') → ['153'] (a 68 NEM válik ERE-énekké)")
  assert(eq(parseEnekTokens('153 25 430'), ['153', '25', '430']), "parseEnekTokens('153 25 430') → szóközös csupa-szám lista működik")

  // ── Mintaadatok ────────────────────────────────────────────────────────────
  let nextId = 1
  const entry = (o) => ({
    id: nextId++,
    idopont: null,
    kategoria: 'szolgalat',
    jellege: 'Istentisztelet',
    id_jellege: null,
    bibliaolvasas: null,
    alapige: null,
    cim: null,
    enekek: null,
    jelenlet_ferfi: null,
    jelenlet_no: null,
    jelenlet_gyermek: null,
    jelenlet_osszesen: 0,
    szolgalt: null,
    persely: null,
    megjegyzes: null,
    mediapath: null,
    du: false,
    deleted: false,
    congregation_id: null,
    ...o,
  })

  const entries = [
    // E1: de, teljes jelenlét-adat, 2 ének, alapige + bibliaolvasás
    entry({
      idopont: '2026-01-05T10:00:00', napszak: 'de',
      jelenlet_osszesen: 50, jelenlet_ferfi: 20, jelenlet_no: 25, jelenlet_gyermek: 5,
      enekek: '153, 25', alapige: 'Jn 3,16', bibliaolvasas: 'Zsolt 23',
    }),
    // E2: legacy du-boolean (nincs napszak), jelenlet_osszesen=0 → F/N/Gy összege (30);
    //     ugyanaz az alapige MÁS írásmóddal → kanonikusan összeolvad
    entry({
      idopont: '2026-01-12T17:00:00', du: true,
      jelenlet_ferfi: 10, jelenlet_no: 15, jelenlet_gyermek: 5,
      enekek: '400/B 153', alapige: 'János 3:16',
    }),
    // E3: este, csak összesített jelenlét, hibás bibliaolvasás
    entry({
      idopont: '2026-02-02T18:00:00', napszak: 'este', jelenlet_osszesen: 40,
      enekek: '400B; 90', alapige: 'Jn 3,17-18', bibliaolvasas: 'Halandzsa 3,4',
    }),
    // E4: legacy sor (kategoria null → jellege dönt), jelenlét nélkül → az átlagba NEM számít
    entry({ idopont: '2026-03-01T10:00:00', kategoria: null }),
    // E5: másik szolgálat-típus; szabad szöveg az ének-mezőben → nem ad ének-tokent
    entry({
      idopont: '2026-03-10T19:00:00', jellege: 'Bibliaóra', napszak: 'este',
      jelenlet_osszesen: 12, enekek: 'Ifjúsági énekek',
    }),
    // E6: katekézis — a tipusok-ból kimarad, de az éneke számít
    entry({ idopont: '2026-04-01T12:00:00', kategoria: 'katekezis', jellege: 'Hittan', enekek: '153' }),
    // E7: látogatás — a tipusok-ból kimarad
    entry({ idopont: '2026-04-02T09:00:00', kategoria: 'latogatas', jellege: 'Családlátogatás' }),
    // E8: TÖRÖLT sor — sehol nem számíthat
    entry({
      idopont: '2026-01-19T10:00:00', deleted: true,
      jelenlet_osszesen: 100, enekek: '153', alapige: 'Jn 3,16',
    }),
  ]

  const r = computeWorklogStatistics(entries)

  // ── 1. Típus-statisztika ───────────────────────────────────────────────────
  assert(r.tipusok.length === 2, `tipusok: 2 típus (katekézis/látogatás/törölt kimarad) — kapott: ${r.tipusok.length}`)
  const ist = r.tipusok[0]
  assert(ist && ist.jellege === 'Istentisztelet' && ist.db === 4, `tipusok[0]: Istentisztelet db=4 — kapott: ${ist?.jellege} db=${ist?.db}`)
  assert(ist.osszJelenlet === 120, `Istentisztelet osszJelenlet=120 (50+30+40+0) — kapott: ${ist.osszJelenlet}`)
  assert(ist.atlagJelenlet === 40, `Istentisztelet atlagJelenlet=40 (120/3 jelenlétes alkalom) — kapott: ${ist.atlagJelenlet}`)
  assert(ist.ferfi === 30 && ist.no === 40 && ist.gyermek === 10, `Istentisztelet F/N/Gy=30/40/10 — kapott: ${ist.ferfi}/${ist.no}/${ist.gyermek}`)
  assert(ist.deDb === 2 && ist.duDb === 1 && ist.esteDb === 1, `Istentisztelet napszak de/du/este=2/1/1 (du-boolean fallback is) — kapott: ${ist.deDb}/${ist.duDb}/${ist.esteDb}`)
  assert(eq(ist.havonta, [2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), `Istentisztelet havonta=[2,1,1,0,…] — kapott: ${JSON.stringify(ist.havonta)}`)
  const biblia = r.tipusok[1]
  assert(biblia && biblia.jellege === 'Bibliaóra' && biblia.db === 1 && biblia.atlagJelenlet === 12 && biblia.esteDb === 1, `tipusok[1]: Bibliaóra db=1 átlag=12 este=1 — kapott: ${JSON.stringify(biblia)}`)

  // ── 2. Ének-statisztika ────────────────────────────────────────────────────
  assert(r.enekek.length === 4, `enekek: 4 azonosító — kapott: ${r.enekek.length} (${r.enekek.map((x) => x.azonosito).join(',')})`)
  const e153 = r.enekek[0]
  assert(e153 && e153.azonosito === '153' && e153.db === 3, `enekek[0]: '153' db=3 (szolgálat+katekézis, törölt nem) — kapott: ${e153?.azonosito} db=${e153?.db}`)
  assert(e153.utolsoDatum === '2026-04-01T12:00:00', `'153' utolsoDatum a katekézis-sor dátuma — kapott: ${e153.utolsoDatum}`)
  assert(r.enekek[1]?.azonosito === '400b' && r.enekek[1]?.db === 2, `enekek[1]: '400b' db=2 ('400/B' és '400B' összeolvad) — kapott: ${r.enekek[1]?.azonosito} db=${r.enekek[1]?.db}`)
  assert(r.enekek[2]?.azonosito === '25' && r.enekek[3]?.azonosito === '90', `holtverseny-sorrend szám szerint: 25 a 90 előtt — kapott: ${r.enekek[2]?.azonosito}, ${r.enekek[3]?.azonosito}`)

  // ── 3. Alapige-gyakoriság (kanonikus alak) ─────────────────────────────────
  assert(r.igehelyek.length === 2, `igehelyek: 2 kulcs (a bibliaolvasás nem számít bele) — kapott: ${r.igehelyek.length}`)
  assert(r.igehelyek[0]?.hivatkozas === 'Jn 3,16' && r.igehelyek[0]?.db === 2, `igehelyek[0]: 'Jn 3,16' db=2 ('Jn 3,16' + 'János 3:16' egy kulcs) — kapott: ${r.igehelyek[0]?.hivatkozas} db=${r.igehelyek[0]?.db}`)
  assert(r.igehelyek[1]?.hivatkozas === 'Jn 3,17–18' && r.igehelyek[1]?.db === 1, `igehelyek[1]: 'Jn 3,17–18' db=1 — kapott: ${r.igehelyek[1]?.hivatkozas}`)

  // ── 4. Lefedettség (alapige + bibliaolvasás közös vershalmaza) ─────────────
  const vartErintett = 3 + psa23 // Jn 3,16 (dedup) + Jn 3,17–18 + Zsolt 23 egésze
  assert(r.lefedettseg.osszes === 31126 && r.lefedettseg.erintett === vartErintett, `lefedettseg: erintett=${vartErintett} / 31126 — kapott: ${r.lefedettseg.erintett} / ${r.lefedettseg.osszes}`)
  assert(r.konyvek.length === 66 && r.konyvek[0].book === 'GEN', `konyvek: 66 könyv bibliai sorrendben (első: GEN) — kapott: ${r.konyvek.length}, ${r.konyvek[0]?.book}`)
  assert(r.konyvek[0].erintett === 0 && r.konyvek[0].szazalek === 0, 'GEN érintetlen (0 vers, 0%)')
  const jhn = r.konyvek.find((k) => k.book === 'JHN')
  assert(jhn && jhn.erintett === 3 && jhn.osszVers === jhnOssz && jhn.szazalek === Math.round((3 / jhnOssz) * 10000) / 100, `JHN: erintett=3 / ${jhnOssz} — kapott: ${JSON.stringify(jhn)}`)
  const psa = r.konyvek.find((k) => k.book === 'PSA')
  assert(psa && psa.erintett === psa23 && psa.osszVers === psaOssz, `PSA: erintett=${psa23} (Zsolt 23 egésze a bibliaolvasásból) — kapott: ${JSON.stringify(psa)}`)

  // ── 5. Értelmezhetetlen igehelyek ──────────────────────────────────────────
  assert(eq(r.ertelmezhetetlenIgehelyek, ['Halandzsa 3,4']), `ertelmezhetetlenIgehelyek=['Halandzsa 3,4'] — kapott: ${JSON.stringify(r.ertelmezhetetlenIgehelyek)}`)

  // ── 6. Értelmezhetetlen igehelyek — nincs 20-as cap, mind visszajön ────────
  const sokHibas = Array.from({ length: 25 }, (_, i) =>
    entry({ idopont: '2026-05-01T10:00:00', alapige: `Halandzsa ${i + 1},1` }),
  )
  const rSok = computeWorklogStatistics(sokHibas)
  assert(
    rSok.ertelmezhetetlenIgehelyek.length === 25,
    `ertelmezhetetlenIgehelyek: mind a 25 distinct hibás visszajön (nincs 20-as cap) — kapott: ${rSok.ertelmezhetetlenIgehelyek.length}`,
  )
  assert(
    rSok.ertelmezhetetlenIgehelyek.includes('Halandzsa 1,1') && rSok.ertelmezhetetlenIgehelyek.includes('Halandzsa 25,1'),
    'ertelmezhetetlenIgehelyek: az első és a 25. hibás is a listában',
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (failedCount > 0) {
  console.error(`\nÖnellenőrzés: HIBA (${failedCount}/${total} bukott)`)
  process.exit(1)
}
console.log(`\nÖnellenőrzés: minden zöld (${total}/${total})`)
