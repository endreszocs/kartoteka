#!/usr/bin/env node
/**
 * SQL RIPORT-BLOKK önellenőrzés — „hiányzó FROM egy UNION ALL ágban" (2026-08-15).
 *
 * Mit véd: a `migration-docs/sql/` alatti, KÉZZEL FUTTATOTT migrációk
 * riport-blokkjait (a ház „0. SZAKASZ — ÁLLAPOTFELMÉRÉS" és „2. SZAKASZ —
 * ELLENŐRZÉS" mintája: egyetlen nagy `SELECT … UNION ALL … ORDER BY sorszam`).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * Ezeket az SQL-eket Endre KÉZZEL futtatja a Supabase Studióban — nincs
 * Supabase MCP és nincs helyi Postgres, tehát a fájl NEM próbálható ki
 * futtatás előtt. Egyetlen hiba az EGÉSZ lekérdezést megbuktatja, és a kör
 * újraindul: „nem futott le" → javítás → újraküldés.
 *
 * A konkrét hibaosztály (2026-08-15-én élesben elsült):
 *
 *     SELECT … FROM (VALUES ('a'),('b')) AS t(tabla)   ← az 1. ágnak VAN FROM-ja
 *     UNION ALL
 *     SELECT t.tabla || ' …'                            ← a 2. ág t-re hivatkozik,
 *            …                                             DE NINCS SAJÁT FROM-ja
 *
 * Az emberi szem átsiklik rajta, mert a két ág egymás alatt áll és „láthatóan
 * ugyanarról a listáról szól". A Postgres viszont minden UNION-ágat KÜLÖN
 * lekérdezésnek tekint — a FROM NEM öröklődik:
 *
 *     ERROR: 42P01: missing FROM-clause entry for table "t"
 *
 * A hiba a fájl KÖZEPÉN van, tehát a Studio semmit nem ad vissza: az egész
 * felmérés elvész. Ez a teszt másodpercek alatt megtalálja.
 *
 * MIT NEM VIZSGÁL (szándékosan, a téves riasztás elkerüléséért):
 *   · nem-SELECT utasításokat (INSERT/UPDATE/DELETE — ott az `excluded.` és az
 *     `UPDATE … FROM` alias-szabályai mások),
 *   · dollar-quote-olt PL/pgSQL törzseket (DO blokkok, függvények),
 *   · CTE-ket (WITH …) — azok nevei ágon kívül is láthatók.
 * Vagyis: ha ez a teszt szól, az szinte biztosan VALÓDI hiba.
 *
 * Futtatás:  node scripts/selftest-sql-union-from.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SQL_DIR = path.join(REPO_ROOT, 'migration-docs', 'sql')
// 2026-08-28: a `docs/` alatti, KÉZZEL FUTTATANDÓ diagnosztikai/javító SQL-ek eddig
// KIMARADTAK az őrből — pedig pontosan ugyanaz a hibaosztály fenyegeti őket (egy
// UNION ALL ág saját FROM nélkül 42P01-gyel az EGÉSZ lekérdezést eldobja), és ezeket
// a lelkész futtatja élesben. A 2026-08-27-i pénzügy-átvilágítás óta 8+ ilyen fájl áll
// a `docs/`-ban, és az őr „zöld"-et jelentett rájuk anélkül, hogy megnézte volna őket.
const DOCS_DIR = path.join(REPO_ROOT, 'docs')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * Azok a nevek, amik `nev.oszlop` alakban állnak, de NEM tábla-aliasok.
 * Az `excluded` az `ON CONFLICT DO UPDATE SET x = excluded.y` ál-relációja;
 * a séma-előnevek (public.foo) pedig nyilván nem aliasok.
 */
const NEM_ALIAS = new Set([
  'excluded',
  'public',
  'information_schema',
  'pg_catalog',
  'storage',
  'auth',
  'extensions',
  'new',
  'old',
])

/**
 * Karakterenkénti zárójel-mélység. A sztring-literálok (`'…'`, benne `''`
 * escape-pel), a sorvégi megjegyzések és a dollar-quote-olt blokkok belseje
 * `-1`-et kap: azokat sehol nem elemezzük.
 */
function melysegTerkep(s) {
  const d = new Array(s.length).fill(0)
  let szint = 0
  let i = 0
  while (i < s.length) {
    // sorvégi megjegyzés
    if (s[i] === '-' && s[i + 1] === '-') {
      while (i < s.length && s[i] !== '\n') d[i++] = -1
      continue
    }
    // dollar-quote
    if (s[i] === '$') {
      const m = /^\$[a-zA-Z0-9_]*\$/.exec(s.slice(i))
      if (m) {
        const cimke = m[0]
        const veg = s.indexOf(cimke, i + cimke.length)
        const zar = veg < 0 ? s.length : veg + cimke.length
        while (i < zar) d[i++] = -1
        continue
      }
    }
    // sztring-literál
    if (s[i] === "'") {
      d[i++] = -1
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            d[i++] = -1
            d[i++] = -1
            continue
          }
          d[i++] = -1
          break
        }
        d[i++] = -1
      }
      continue
    }
    if (s[i] === '(') {
      d[i] = szint
      szint++
    } else if (s[i] === ')') {
      szint--
      d[i] = szint
    } else {
      d[i] = szint
    }
    i++
  }
  return d
}

/** Az `s`-ben a `;` karakterek 0. mélységű pozíciói — utasítás-határok. */
function utasitasHatarok(s, d) {
  const ki = []
  for (let i = 0; i < s.length; i++) if (s[i] === ';' && d[i] === 0) ki.push(i)
  return ki
}

const sorSzam = (s, poz) => s.slice(0, poz).split('\n').length

function ellenorizFajl(teljesUt) {
  const src = fs.readFileSync(teljesUt, 'utf8')
  const rel = path.relative(REPO_ROOT, teljesUt).replace(/\\/g, '/')
  const d = melysegTerkep(src)

  const hatarok = utasitasHatarok(src, d)
  const talalatok = []
  let kezd = 0

  for (const veg of [...hatarok, src.length]) {
    const eleje = src.slice(kezd, veg)
    const eltolas = kezd
    kezd = veg + 1

    // Csak TISZTA riport-blokkot vizsgálunk: az utasítás első értelmes szava
    // SELECT legyen, és legyen benne legalább egy 0. mélységű UNION ALL.
    const elsoSzo = /^[\s]*([a-zA-Z]+)/.exec(
      eleje.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trimStart(),
    )
    if (!elsoSzo || elsoSzo[1].toUpperCase() !== 'SELECT') continue

    const unionPozok = []
    for (const m of eleje.matchAll(/\bUNION\s+ALL\b/gi)) {
      if (d[eltolas + m.index] === 0) unionPozok.push([m.index, m.index + m[0].length])
    }
    if (unionPozok.length === 0) continue

    // Ágakra vágás
    const agak = []
    let elozo = 0
    for (const [a, b] of unionPozok) {
      agak.push([elozo, a])
      elozo = b
    }
    agak.push([elozo, eleje.length])

    for (const [a, b] of agak) {
      const ag = eleje.slice(a, b)
      const agEltolas = eltolas + a
      // 0. mélység az ÁGON belül: az ág eleje a teljes fájl d-jében is 0.
      const agD = d.slice(agEltolas, agEltolas + ag.length)

      // Definiált aliasok (0. mélységben)
      const definialt = new Set()
      for (const m of ag.matchAll(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)) {
        if (agD[m.index] === 0) definialt.add(m[1].toLowerCase())
      }
      for (const m of ag.matchAll(
        /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_."]*)\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
      )) {
        if (agD[m.index] !== 0) continue
        const alias = m[2].toLowerCase()
        if (['on', 'where', 'as', 'union', 'order', 'group', 'left', 'right', 'inner', 'full', 'cross', 'join', 'limit'].includes(alias)) continue
        definialt.add(alias)
      }
      // WITH-CTE nevek (ágon kívülről is láthatók)
      for (const m of eleje.matchAll(/\bWITH\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi)) {
        definialt.add(m[1].toLowerCase())
      }

      // Használt aliasok (0. mélységben)
      const hasznalt = new Map()
      for (const m of ag.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.[a-zA-Z_]/g)) {
        if (agD[m.index] !== 0) continue
        const nev = m[1].toLowerCase()
        if (NEM_ALIAS.has(nev)) continue
        if (!hasznalt.has(nev)) hasznalt.set(nev, agEltolas + m.index)
      }

      for (const [nev, poz] of hasznalt) {
        if (definialt.has(nev)) continue
        talalatok.push({ nev, sor: sorSzam(src, poz) })
      }
    }
  }

  return { rel, talalatok }
}

if (!fs.existsSync(SQL_DIR)) {
  fail(`hiányzik a mappa: migration-docs/sql`)
  process.exit(1)
}

// Mindkét gyökér — teljes útakkal, hogy a hibaüzenetben is látszódjék, melyikből jött.
const fajlok = [
  ...fs.readdirSync(SQL_DIR)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .map((f) => path.join(SQL_DIR, f)),
  ...(fs.existsSync(DOCS_DIR)
    ? fs.readdirSync(DOCS_DIR)
        .filter((f) => f.toLowerCase().endsWith('.sql'))
        .map((f) => path.join(DOCS_DIR, f))
    : []),
].sort()

let hibasFajlok = 0
let vizsgalt = 0

for (const f of fajlok) {
  const { rel, talalatok } = ellenorizFajl(f)
  vizsgalt++
  if (talalatok.length === 0) continue
  hibasFajlok++
  for (const t of talalatok) {
    fail(
      `${rel}:${t.sor} — a(z) "${t.nev}" aliasnak NINCS FROM-ja ebben a UNION ALL ágban. ` +
        'A FROM NEM öröklődik a szomszéd ágból; a Postgres 42P01-gyel az EGÉSZ ' +
        'lekérdezést eldobja. Tedd az ág végére a saját FROM (VALUES …) AS ' +
        `${t.nev}(…) sorát.`,
    )
  }
}

if (!failed) {
  ok(`${vizsgalt} SQL-fájl riport-blokkjai átnézve — minden UNION ALL ágnak megvan a saját FROM-ja`)
}

if (failed) {
  console.error(`\nSQL riport-blokk önellenőrzés: HIBA (${hibasFajlok} fájl)`)
  process.exit(1)
}
console.log('\nSQL riport-blokk önellenőrzés: minden zöld')
