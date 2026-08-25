#!/usr/bin/env node
/**
 * build-biblia-olvasoterv.mjs — egyéves bibliaolvasó terv GENERÁTOR.
 *
 * Determinisztikusan előállítja az apps/web/lib/dashboard/biblia-olvasoterv.ts
 * fájlt a packages/biblia/src/data/verse-counts.json katalógusból:
 *   - PONTOSAN 365 nap, az ÖSSZES 1189 fejezet PONTOSAN EGYSZER lefedve;
 *   - két párhuzamos sáv: Ószövetség sorban (1Móz→Mal) + Újszövetség sorban
 *     (Mt→Jel), a napi adag versszám szerint kiegyensúlyozva (~85-95 vers/nap;
 *     általában 2-3 ÓSZ-fejezet + 1 ÚSZ-fejezet);
 *   - az olvasmány-sztringek EGY könyvön belüli fejezet-tartományok
 *     ('1Móz 1-3', 'Mt 1', 'Zsolt 119') — validateReference-kompatibilisek.
 *
 * Futtatás:  node scripts/build-biblia-olvasoterv.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VERSE_COUNTS = path.join(ROOT, 'packages', 'biblia', 'src', 'data', 'verse-counts.json')
const BOOKS_TS = path.join(ROOT, 'packages', 'biblia', 'src', 'books.ts')
const OUT_FILE = path.join(ROOT, 'apps', 'web', 'lib', 'dashboard', 'biblia-olvasoterv.ts')

const NAPOK = 365
const OSZ_KONYVEK = 39 // GEN…MAL a kanonikus sorrendben

// ── Katalógus + kanonikus magyar rövidítések (egyetlen igazság-forrás) ───────

const vc = JSON.parse(fs.readFileSync(VERSE_COUNTS, 'utf8'))
if (!Array.isArray(vc.order) || vc.order.length !== 66) {
  console.error(`HIBA: a verse-counts.json order-e nem 66 könyv (${vc.order?.length}).`)
  process.exit(1)
}

// Az abbrev-eket a books.ts forrásából olvassuk (nem duplikáljuk kézzel) —
// fail-closed: ha nem találjuk mind a 66-ot, a generátor leáll.
const booksSrc = fs.readFileSync(BOOKS_TS, 'utf8')
const ABBREV = {}
const abbrevRe = /code:\s*'([0-9A-Z]{3})'\s*,\s*canonical:\s*'[^']*'\s*,\s*abbrev:\s*'([^']+)'/g
for (let m; (m = abbrevRe.exec(booksSrc)); ) ABBREV[m[1]] = m[2]
for (const code of vc.order) {
  if (!ABBREV[code]) {
    console.error(`HIBA: nincs kanonikus rövidítés a(z) ${code} könyvhöz a books.ts-ben.`)
    process.exit(1)
  }
}

/** Lapos fejezetlista: [{ code, chapter, verses }] a kanonikus sorrendben. */
function fejezetek(codes) {
  const out = []
  for (const code of codes) {
    const counts = vc.counts[code]
    if (!Array.isArray(counts)) {
      console.error(`HIBA: hiányzó versszám-lista a(z) ${code} könyvhöz.`)
      process.exit(1)
    }
    counts.forEach((verses, i) => out.push({ code, chapter: i + 1, verses }))
  }
  return out
}

const oszFejezetek = fejezetek(vc.order.slice(0, OSZ_KONYVEK))
const uszFejezetek = fejezetek(vc.order.slice(OSZ_KONYVEK))
const osszesVers = [...oszFejezetek, ...uszFejezetek].reduce((a, f) => a + f.verses, 0)
const napiCel = osszesVers / NAPOK

// ── Napi adagok kiosztása (determinisztikus, versszám-kiegyensúlyozott) ──────
//
// ÚSZ-sáv: napi legfeljebb 1 fejezet, egyenletesen szétterítve (kerekítéses
// ütemezés: az 1. napon indul, összesen pont a 260 fejezet). ÓSZ-sáv: mohó
// feltöltés ADAPTÍV napi célhoz (hátralévő versek / hátralévő napok — így egy
// nagy fejezet, pl. a Zsolt 119 túllövését a többi nap simán elnyeli, nem egy
// „kiéheztetett" nap issza meg), tartalék-őrrel, hogy egyetlen nap se maradjon
// olvasmány nélkül, és a sáv pont a 365. napon fogyjon el.

const napok = [] // [{ nap, chapters: [{code, chapter, verses}] }]
let oszPtr = 0
let uszPtr = 0
let kumulalt = 0

const uszDarab = uszFejezetek.length
const uszEddig = (nap) => Math.round((nap * uszDarab) / NAPOK)

for (let nap = 1; nap <= NAPOK; nap++) {
  const maiFejezetek = []
  let mai = 0

  // ÚSZ: e napon jár-e fejezet
  if (uszPtr < uszDarab && uszEddig(nap) > uszEddig(nap - 1)) {
    const f = uszFejezetek[uszPtr++]
    maiFejezetek.push(f)
    mai += f.verses
  }

  if (nap === NAPOK) {
    // Zárónap: minden maradék (a mohó ütemezés legfeljebb töredéknyit hagy itt)
    while (oszPtr < oszFejezetek.length) {
      const f = oszFejezetek[oszPtr++]
      maiFejezetek.push(f)
      mai += f.verses
    }
    while (uszPtr < uszDarab) {
      const f = uszFejezetek[uszPtr++]
      maiFejezetek.push(f)
      mai += f.verses
    }
  } else {
    // Adaptív napi cél: a még hátralévő versek egyenletes elosztása
    const maiCel = (osszesVers - kumulalt) / (NAPOK - nap + 1)
    // Tartalék-őr: minden hátralévő napra maradjon legalább 1 ÓSZ-fejezet
    const maxPtr = oszFejezetek.length - (NAPOK - nap)
    while (oszPtr < maxPtr) {
      const f = oszFejezetek[oszPtr]
      // „közelebb visz-e": vedd el, ha a fél fejezettel még a cél alatt vagyunk
      if (mai + f.verses / 2 > maiCel) break
      maiFejezetek.push(f)
      mai += f.verses
      oszPtr++
    }
    // Üres nap tilos: ha se ÚSZ, se ÓSZ nem került ma sorra, kényszer-vétel
    if (maiFejezetek.length === 0 && oszPtr < oszFejezetek.length) {
      const f = oszFejezetek[oszPtr++]
      maiFejezetek.push(f)
      mai += f.verses
    }
  }

  kumulalt += mai
  napok.push({ nap, chapters: maiFejezetek })
}

if (oszPtr !== oszFejezetek.length || uszPtr !== uszDarab) {
  console.error(`HIBA: nem fogyott el minden fejezet (ÓSZ ${oszPtr}/${oszFejezetek.length}, ÚSZ ${uszPtr}/${uszDarab}).`)
  process.exit(1)
}

// ── Olvasmány-sztringek: egymást követő fejezetek EGY könyvön belül ──────────

function olvasmanyok(chapters) {
  const out = []
  let i = 0
  while (i < chapters.length) {
    const { code, chapter } = chapters[i]
    let end = chapter
    let j = i + 1
    while (j < chapters.length && chapters[j].code === code && chapters[j].chapter === end + 1) {
      end = chapters[j].chapter
      j++
    }
    out.push(end === chapter ? `${ABBREV[code]} ${chapter}` : `${ABBREV[code]} ${chapter}-${end}`)
    i = j
  }
  return out
}

// Megjelenítési sorrend: ÓSZ elöl, ÚSZ hátul ('1Móz 1-3 · Mt 1')
const uszCodes = new Set(vc.order.slice(OSZ_KONYVEK))
const terv = napok.map(({ nap, chapters }) => {
  const rendezett = [...chapters.filter((f) => !uszCodes.has(f.code)), ...chapters.filter((f) => uszCodes.has(f.code))]
  return { nap, olvasmanyok: olvasmanyok(rendezett) }
})

// ── Ellenőrzés generáláskor is (fail-closed) ─────────────────────────────────

{
  const lefedve = new Set()
  let dupla = 0
  for (const { chapters } of napok) {
    for (const { code, chapter } of chapters) {
      const id = `${code}.${chapter}`
      if (lefedve.has(id)) dupla++
      lefedve.add(id)
    }
  }
  const osszesFejezet = oszFejezetek.length + uszFejezetek.length
  if (terv.length !== NAPOK || lefedve.size !== osszesFejezet || dupla !== 0) {
    console.error(`HIBA: terv=${terv.length} nap, lefedett=${lefedve.size}/${osszesFejezet} fejezet, duplikátum=${dupla}.`)
    process.exit(1)
  }
  if (terv.some((n) => n.olvasmanyok.length === 0)) {
    console.error('HIBA: van olvasmány nélküli nap.')
    process.exit(1)
  }
}

// ── Statisztika a konzolra ───────────────────────────────────────────────────

const napiVersek = napok.map((n) => n.chapters.reduce((a, f) => a + f.verses, 0))
const min = Math.min(...napiVersek)
const max = Math.max(...napiVersek)
const atlag = osszesVers / NAPOK
const uszNapok = napok.filter((n) => n.chapters.some((f) => vc.order.indexOf(f.code) >= OSZ_KONYVEK)).length
const oszDb = napok.map((n) => n.chapters.filter((f) => vc.order.indexOf(f.code) < OSZ_KONYVEK).length)
const sav85_95 = napiVersek.filter((v) => v >= 85 && v <= 95).length
const sav75_105 = napiVersek.filter((v) => v >= 75 && v <= 105).length

console.log('Bibliaolvasó terv statisztika:')
console.log(`  napok:            ${terv.length}`)
console.log(`  fejezetek:        ${oszFejezetek.length} ÓSZ + ${uszFejezetek.length} ÚSZ = ${oszFejezetek.length + uszFejezetek.length}`)
console.log(`  versek összesen:  ${osszesVers}`)
console.log(`  napi versek:      átlag ${atlag.toFixed(1)}, min ${min}, max ${max}`)
console.log(`  85–95 vers sáv:   ${sav85_95} nap (${((sav85_95 / NAPOK) * 100).toFixed(0)}%), 75–105: ${sav75_105} nap (${((sav75_105 / NAPOK) * 100).toFixed(0)}%)`)
console.log(`  ÚSZ-os napok:     ${uszNapok}/${NAPOK} (${((uszNapok / NAPOK) * 100).toFixed(0)}%)`)
console.log(`  ÓSZ fejezet/nap:  min ${Math.min(...oszDb)}, max ${Math.max(...oszDb)}, átlag ${(oszFejezetek.length / NAPOK).toFixed(2)}`)

// ── TS-fájl kiírása ──────────────────────────────────────────────────────────

const sorok = terv.map(
  ({ nap, olvasmanyok: o }) => `  { nap: ${nap}, olvasmanyok: [${o.map((s) => `'${s}'`).join(', ')}] },`,
)

const ts = `// GENERÁLT — kézzel ne szerkeszd; újragenerálás: node scripts/build-biblia-olvasoterv.mjs
//
// Egyéves bibliaolvasó terv: PONTOSAN 365 nap, az összes 1189 fejezet PONTOSAN
// egyszer. Két párhuzamos sáv — Ószövetség sorban (1Móz→Mal) és Újszövetség
// sorban (Mt→Jel) —, a napi adag versszám szerint kiegyensúlyozva
// (átlag ${atlag.toFixed(1)} vers/nap; általában 2-3 ÓSZ-fejezet + 1 ÚSZ-fejezet).
// A szökőévi február 29. kezelése: lásd olvasotervNapSorszam (napi-ige-types.ts).

import type { OlvasotervNap } from './napi-ige-types'

export const OLVASOTERV: OlvasotervNap[] = [
${sorok.join('\n')}
]
`

fs.writeFileSync(OUT_FILE, ts, 'utf8')
console.log(`\nKiírva: ${path.relative(ROOT, OUT_FILE)} (${terv.length} nap)`)
