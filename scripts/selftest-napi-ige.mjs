// selftest-napi-ige.mjs — Napi ige + bibliaolvasó terv (2026-08-25) őrszemei
//
// ⛔ MI VOLT A HIBA-KOCKÁZAT
//   1) A dashboard „mai ige" kártyája mostantól egy 366 kulcsos helyi naptárból
//      és egy generált 365 napos olvasótervből él. Egyetlen hiányzó kulcs,
//      elgépelt igehely vagy kimaradt/duplán szereplő fejezet NÉMÁN rossz
//      (vagy üres) kártyát adna az év egy adott napján — és csak azon a napon
//      derülne ki.
//   2) A szökőév-szabály (febr. 29. = ráérő nap, utána -1 nap-sorszám) hibája
//      négyévente csúsztatná el az egész tervet.
//
// ŐRSZEMEK
//   A1–A5  napi-ige naptár: 366 egyedi kulcs, minden ige validateReference-zöld,
//          üzenetek 60–260 karakter, maiNapiIge viselkedés
//   B1     olvasóterv: 365 nap, minden nap ≥1 olvasmány, az 1189 fejezet
//          PONTOSAN egyszer lefedve, minden olvasmány validateReference-zöld
//   B1n    negatív: a lefedettség-őr a mutánsokon (nap törölve / nap duplázva)
//          BUKIK (nem vak)
//   C1–C5  olvasotervNapSorszam szökőév-szabály (2027/2028 sarokpontok)
//
// Minta: selftest-gyulekezeti-egysegek.mjs (TS transpile + futtatás).

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
  ts = require_('typescript')
} catch {
  try {
    ts = require_(path.join(ROOT, 'apps/web/node_modules/typescript'))
  } catch {
    console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
    process.exit(0)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Transpile: @kartoteka/biblia + a dashboard napi-ige moduljai egy tmp-be
// ─────────────────────────────────────────────────────────────────────────

const BIBLIA_DIR = path.join(ROOT, 'packages/biblia')
const DASH_DIR = path.join(ROOT, 'apps/web/lib/dashboard')

const TARTALOM_FAJLOK = [
  path.join(DASH_DIR, 'napi-ige-1felev.ts'),
  path.join(DASH_DIR, 'napi-ige-2felev.ts'),
]
const tartalomKesz = TARTALOM_FAJLOK.every((f) => fs.existsSync(f))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-napi-ige-'))

function transpileTo(srcAbs, outRel) {
  const code = fs.readFileSync(srcAbs, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: path.basename(srcAbs),
  })
  const dest = path.join(tmp, outRel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return dest
}

try {
  // biblia csomag (a parser/validátor/katalógus)
  for (const f of ['types', 'books', 'parser', 'format', 'coverage', 'index']) {
    transpileTo(path.join(BIBLIA_DIR, 'src', `${f}.ts`), `biblia/src/${f}.js`)
  }
  fs.mkdirSync(path.join(tmp, 'biblia/src/data'), { recursive: true })
  fs.copyFileSync(
    path.join(BIBLIA_DIR, 'src/data/verse-counts.json'),
    path.join(tmp, 'biblia/src/data/verse-counts.json'),
  )
  const biblia = require_(path.join(tmp, 'biblia/src/index.js'))
  const { parseReference, validateReference, getVerseCounts } = biblia

  // dashboard modulok
  transpileTo(path.join(DASH_DIR, 'napi-ige-types.ts'), 'dashboard/napi-ige-types.js')
  const napiIgeTypes = require_(path.join(tmp, 'dashboard/napi-ige-types.js'))

  const OLVASOTERV_SRC = path.join(DASH_DIR, 'biblia-olvasoterv.ts')
  let OLVASOTERV = null
  if (fs.existsSync(OLVASOTERV_SRC)) {
    transpileTo(OLVASOTERV_SRC, 'dashboard/biblia-olvasoterv.js')
    OLVASOTERV = require_(path.join(tmp, 'dashboard/biblia-olvasoterv.js')).OLVASOTERV
  }

  // ───────────────────────────────────────────────────────────────────────
  // A — a 366 napos napi-ige naptár
  // ───────────────────────────────────────────────────────────────────────

  if (!tartalomKesz) {
    assert(
      false,
      'A0: HIÁNYZIK a napi-ige tartalom (apps/web/lib/dashboard/napi-ige-1felev.ts és/vagy ' +
        'napi-ige-2felev.ts) — a párhuzamosan készülő tartalom-fájlok nélkül a naptár-őrszemek ' +
        'nem futtathatók; amint elkészülnek, ez a selftest zöldre vált',
    )
  } else {
    transpileTo(path.join(DASH_DIR, 'napi-ige-1felev.ts'), 'dashboard/napi-ige-1felev.js')
    transpileTo(path.join(DASH_DIR, 'napi-ige-2felev.ts'), 'dashboard/napi-ige-2felev.js')
    transpileTo(path.join(DASH_DIR, 'napi-ige.ts'), 'dashboard/napi-ige.js')
    const { NAPI_IGEK, maiNapiIge } = require_(path.join(tmp, 'dashboard/napi-ige.js'))
    const felev1 = require_(path.join(tmp, 'dashboard/napi-ige-1felev.js')).NAPI_IGEK_1FELEV
    const felev2 = require_(path.join(tmp, 'dashboard/napi-ige-2felev.js')).NAPI_IGEK_2FELEV

    // (a) 366 egyedi kulcs, mindegyik létező naptári nap, a '02-29'-cel együtt
    const HONAP_NAPOK = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    const vartKulcsok = new Set()
    HONAP_NAPOK.forEach((napok, h) => {
      for (let n = 1; n <= napok; n++) {
        vartKulcsok.add(`${String(h + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`)
      }
    })
    const kulcsok = Object.keys(NAPI_IGEK)
    const atfedes = Object.keys(felev1).filter((k) => k in felev2)
    assert(
      Object.keys(felev1).length + Object.keys(felev2).length === 366 && atfedes.length === 0,
      `A1: a két félév együtt 366 kulcs, átfedés nélkül (1. félév: ${Object.keys(felev1).length}, 2. félév: ${Object.keys(felev2).length}, átfedés: ${atfedes.length})`,
    )
    const hianyzo = [...vartKulcsok].filter((k) => !(k in NAPI_IGEK))
    const tobblet = kulcsok.filter((k) => !vartKulcsok.has(k))
    assert(
      kulcsok.length === 366 && hianyzo.length === 0 && tobblet.length === 0,
      `A2: pontosan a 366 létező naptári nap a kulcskészlet (hiányzó: ${hianyzo.slice(0, 5).join(', ') || '—'}; többlet: ${tobblet.slice(0, 5).join(', ') || '—'})`,
    )

    // (b) minden ige-hivatkozás validateReference-zöld
    const rosszIgek = []
    // (c) minden üzenet 60–260 karakter
    const rosszUzenetek = []
    for (const [kulcs, be] of Object.entries(NAPI_IGEK)) {
      const p = typeof be?.ige === 'string' ? parseReference(be.ige) : { ok: false }
      if (!p.ok || !validateReference(p.segments).valid) rosszIgek.push(`${kulcs}: „${be?.ige}”`)
      const u = typeof be?.uzenet === 'string' ? be.uzenet.trim() : ''
      if (u.length < 60 || u.length > 260) rosszUzenetek.push(`${kulcs} (${u.length} kar.)`)
    }
    assert(
      rosszIgek.length === 0,
      `A3: mind a 366 ige-hivatkozás létező Károli-igehely (hibás: ${rosszIgek.slice(0, 5).join(' · ') || '—'})`,
    )
    assert(
      rosszUzenetek.length === 0,
      `A4: minden üzenet 60–260 karakter, nem üres (kilógó: ${rosszUzenetek.slice(0, 5).join(', ') || '—'})`,
    )

    // maiNapiIge viselkedés (helyi dátumból 'MM-DD' kulcs; szökőnap is)
    assert(
      maiNapiIge(new Date(2027, 0, 1)) === NAPI_IGEK['01-01'] &&
        maiNapiIge(new Date(2028, 1, 29)) === NAPI_IGEK['02-29'] &&
        maiNapiIge(new Date(2027, 11, 31)) === NAPI_IGEK['12-31'],
      'A5: maiNapiIge a napiIgeKulcs szerinti bejegyzést adja (jan. 1., febr. 29., dec. 31.)',
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // B — az egyéves olvasóterv lefedettsége (PURE ellenőrző + mutánsok)
  // ───────────────────────────────────────────────────────────────────────

  const vc = getVerseCounts()
  const osszesFejezet = vc.order.reduce((a, c) => a + vc.counts[c].length, 0)

  /** PURE lefedettség-őr — a mutánsokkal is hívható. */
  function fedettsegEllenorzes(terv) {
    if (!Array.isArray(terv) || terv.length !== 365) {
      return { rendben: false, uzenet: `nem 365 nap (${terv?.length})` }
    }
    const lefedett = new Set()
    for (let i = 0; i < terv.length; i++) {
      const nap = terv[i]
      if (nap?.nap !== i + 1) return { rendben: false, uzenet: `a(z) ${i + 1}. elem nap-sorszáma ${nap?.nap}` }
      if (!Array.isArray(nap.olvasmanyok) || nap.olvasmanyok.length === 0) {
        return { rendben: false, uzenet: `a(z) ${nap.nap}. napon nincs olvasmány` }
      }
      for (const o of nap.olvasmanyok) {
        const p = parseReference(o)
        if (!p.ok) return { rendben: false, uzenet: `${nap.nap}. nap: „${o}” nem értelmezhető` }
        const v = validateReference(p.segments)
        if (!v.valid) return { rendben: false, uzenet: `${nap.nap}. nap: „${o}” — ${v.problemak[0]}` }
        for (const seg of p.segments) {
          // fejezet-granularitás: az olvasmány nem vers-szintű és nem teljes-könyv
          if (seg.startChapter === null || seg.startVerse !== null || seg.endVerse !== null) {
            return { rendben: false, uzenet: `${nap.nap}. nap: „${o}” nem fejezet-szintű olvasmány` }
          }
          const ec = seg.endChapter ?? seg.startChapter
          for (let ch = seg.startChapter; ch <= ec; ch++) {
            const id = `${seg.book}.${ch}`
            if (lefedett.has(id)) return { rendben: false, uzenet: `${nap.nap}. nap: a ${id} fejezet KÉTSZER szerepel` }
            lefedett.add(id)
          }
        }
      }
    }
    if (lefedett.size !== osszesFejezet) {
      return { rendben: false, uzenet: `${lefedett.size}/${osszesFejezet} fejezet van lefedve` }
    }
    return { rendben: true, uzenet: 'rendben' }
  }

  if (!OLVASOTERV) {
    assert(
      false,
      'B0: HIÁNYZIK az apps/web/lib/dashboard/biblia-olvasoterv.ts — futtasd: node scripts/build-biblia-olvasoterv.mjs',
    )
  } else {
    const b = fedettsegEllenorzes(OLVASOTERV)
    assert(
      b.rendben,
      `B1: az olvasóterv 365 nap, minden nap ≥1 olvasmány, az ${osszesFejezet} fejezet PONTOSAN egyszer lefedve (${b.uzenet})`,
    )

    // (f) NEGATÍV mutánsok — a „régi világ" a MAI generátumból áll elő
    const tobbOlvasmanyosNap = OLVASOTERV.find((n) => n.olvasmanyok.length >= 2)?.nap
    const mutansok = [
      ['egy nap (a 100.) törölve', OLVASOTERV.filter((n) => n.nap !== 100)],
      [
        'egy olvasmány kiejtve (365 nap marad — csak a fejezet-számláló foghatja meg)',
        OLVASOTERV.map((n) =>
          n.nap === tobbOlvasmanyosNap ? { nap: n.nap, olvasmanyok: n.olvasmanyok.slice(0, -1) } : n,
        ),
      ],
      [
        'a 2. nap olvasmányai a 3. napéval felülírva (dupla fedés)',
        OLVASOTERV.map((n) => (n.nap === 2 ? { nap: 2, olvasmanyok: OLVASOTERV[2].olvasmanyok } : n)),
      ],
    ]
    let mindBukik = true
    for (const [nev, mutans] of mutansok) {
      if (JSON.stringify(mutans) === JSON.stringify(OLVASOTERV)) {
        mindBukik = false
        assert(false, `B1n: a mutáns („${nev}") NEM különbözik az eredetitől — a negatív asszert vak`)
        continue
      }
      if (fedettsegEllenorzes(mutans).rendben) {
        mindBukik = false
        assert(false, `B1n: a lefedettség-őr ZÖLD maradt az elrontott terven („${nev}")`)
      }
    }
    if (mindBukik) assert(true, 'B1n: a lefedettség-őr mind a 3 mutánson BUKIK (tud pirosra váltani)')
  }

  // ───────────────────────────────────────────────────────────────────────
  // C — olvasotervNapSorszam szökőév-szabály (sarokpontok)
  // ───────────────────────────────────────────────────────────────────────

  const { olvasotervNapSorszam } = napiIgeTypes
  assert(olvasotervNapSorszam(new Date(2027, 2, 1)) === 60, 'C1: 2027-03-01 (nem szökőév) → 60')
  assert(olvasotervNapSorszam(new Date(2027, 11, 31)) === 365, 'C2: 2027-12-31 (nem szökőév) → 365')
  assert(olvasotervNapSorszam(new Date(2028, 1, 29)) === null, 'C3: 2028-02-29 (szökőnap) → null (ráérő nap)')
  assert(olvasotervNapSorszam(new Date(2028, 2, 1)) === 60, 'C4: 2028-03-01 (szökőévben) → 60 (nem csúszik el)')
  assert(olvasotervNapSorszam(new Date(2028, 11, 31)) === 365, 'C5: 2028-12-31 (szökőévben) → 365 (a terv végigér)')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ─────────────────────────────────────────────────────────────────────────

console.log(`\nÖsszesen: ${total}, hibás: ${failedCount}`)
if (failedCount > 0) {
  console.error('❌ FAIL — napi-ige őrszemek')
  process.exit(1)
}
console.log('✅ PASS — napi-ige őrszemek')
