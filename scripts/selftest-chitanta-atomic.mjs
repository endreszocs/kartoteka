#!/usr/bin/env node
/**
 * CHITANTA ATOMIKUS KIÁLLÍTÁS önellenőrzés (P0-12, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-12 találata:
 * a nyugta-kiállítás KÉT lépésben futott (next_chitanta_full RPC növeli a
 * tömb-számlálót, majd KÜLÖN kliens-oldali INSERT az oblio_szamlak-ba) —
 *   (1) ha az INSERT elhasalt, a nyomdai szám ELÉGETT (lyuk a papírtömbben,
 *       a fizikai tömbben nyomtatott sorszám marad bizonylat nélkül),
 *   (2) a foglaló SELECT-ben nem volt FOR UPDATE — két párhuzamos kiállítás
 *       UGYANAZT a nyomdai számot kaphatta,
 *   (3) dupla-kattintásra két nyugta készülhetett ugyanarra a befizetésre.
 *
 * A JAVÍTÁS: issue_chitanta_atomic RPC — foglalás + INSERT EGY plpgsql
 * tranzakcióban, FOR UPDATE a tömb-soron, idempotencia-kapu a befizetes_id-n
 * (a zár MÖGÖTT megismételve, hogy a párhuzamos dupla-kattot is fogja).
 * A web és a core auto-issue erre vált; a régi RPC-t senki nem hívja.
 *
 * NEGATÍV ASSZERT: FOR UPDATE-törlő + régi-RPC-visszaállító mutánsok.
 *
 * Futtatás:  node scripts/selftest-chitanta-atomic.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-28-chitanta-atomic-rpc.sql')
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'chitanta-actions.ts')
const CORE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'chitanta', 'auto-issue-for-befizetes.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripTsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function stripSqlComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

function ellenoriz(files) {
  const hibak = []

  // ── (1) SQL: az atomikus RPC megvan, és a törzse teljes ──
  if (!files.has(SQL)) {
    hibak.push('SQL: a 2026-08-28-chitanta-atomic-rpc.sql fájl HIÁNYZIK')
  } else {
    const sqlS = stripSqlComments(files.get(SQL))
    const iFn = sqlS.indexOf('FUNCTION public.issue_chitanta_atomic')
    if (iFn < 0) {
      hibak.push('SQL: nincs issue_chitanta_atomic függvény-definíció')
    } else {
      const torzs = sqlS.slice(iFn)
      if (!/FOR\s+UPDATE/i.test(torzs)) {
        hibak.push('SQL: a tömb-foglaló SELECT-ben nincs FOR UPDATE — párhuzamos dupla nyomdai szám')
      }
      if (!/INSERT\s+INTO\s+public\.oblio_szamlak/i.test(torzs)) {
        hibak.push('SQL: az oblio_szamlak INSERT nincs a függvényben — a foglalás és a mentés két tranzakció')
      }
      const idempotencia = torzs.match(/befizetes_id\s*=\s*p_befizetes_id[\s\S]{0,220}?stornozott\s*=\s*false|stornozott\s*=\s*false[\s\S]{0,220}?befizetes_id\s*=\s*p_befizetes_id/gi)
      if (!idempotencia || idempotencia.length < 2) {
        hibak.push('SQL: az idempotencia-kapu (befizetes_id + stornozott=false) nincs meg KÉTSZER (zár előtt + zár mögött)')
      }
      if (!/current_user_can_access_congregation\s*\(\s*p_congregation_id\s*\)/.test(torzs)) {
        hibak.push('SQL: a fail-closed hatókör-kapu (current_user_can_access_congregation) hiányzik')
      }
      if (!/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.issue_chitanta_atomic/i.test(sqlS) ||
          !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.issue_chitanta_atomic[\s\S]{0,120}?TO\s+authenticated/i.test(sqlS)) {
        hibak.push('SQL: a REVOKE PUBLIC/anon + GRANT authenticated páros hiányzik')
      }
    }
  }

  // ── (2) web + core: az auto-issue az atomikus RPC-t hívja, a kétlépcsős út eltűnt ──
  for (const [nev, fajl] of [['web chitanta-actions', WEB], ['core auto-issue', CORE]]) {
    const s = stripTsComments(files.get(fajl))
    if (!s.includes("rpc('issue_chitanta_atomic'")) {
      hibak.push(`${nev}: nem az issue_chitanta_atomic RPC-t hívja`)
    }
    if (s.includes("rpc('next_chitanta_full'")) {
      hibak.push(`${nev}: még a régi next_chitanta_full-t hívja — a foglalás és az INSERT két tranzakció`)
    }
  }

  // ── (3) core: a régi külön kliens-INSERT eltűnt az auto-issue-ból ──
  // (A webben a fájl más funkciói is írnak oblio_szamlak-ot — ott a (2) elég.)
  const coreS = stripTsComments(files.get(CORE))
  if (/from\('oblio_szamlak'\)\s*\.insert\(/.test(coreS)) {
    hibak.push('core auto-issue: még ott a külön kliens-oldali oblio_szamlak INSERT')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const f of [WEB, CORE]) m.set(f, fs.readFileSync(f, 'utf8'))
  if (fs.existsSync(SQL)) m.set(SQL, fs.readFileSync(SQL, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('chitanță: foglalás + INSERT egy tranzakcióban, FOR UPDATE + idempotencia-kapu a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a FOR UPDATE törlése az SQL-ből
  const m1files = beolvas()
  const sqlRaw = m1files.get(SQL)
  const sqlMut = sqlRaw.replace(/FOR UPDATE/g, '')
  m1files.set(SQL, sqlMut)
  if (sqlMut === sqlRaw) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a FOR UPDATE törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (FOR UPDATE törölve) → az őr elbuktatja')

  // M2: a web visszaáll a régi kétlépcsős RPC-re
  const m2files = beolvas()
  const webRaw = m2files.get(WEB)
  const webMut = webRaw.replace(/rpc\('issue_chitanta_atomic'/g, "rpc('next_chitanta_full'")
  m2files.set(WEB, webMut)
  if (webMut === webRaw) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a régi RPC visszaállítására az őr NEM bukik — vak')
  else pass('M2 mutáns (web → next_chitanta_full) → az őr elbuktatja')

  // M3: az idempotencia-kapu kizárása a zár mögül — a MÁSODIK
  // `befizetes_id = p_befizetes_id` feltételt lőjük ki (az elsőt hagyjuk,
  // így pont a zár mögötti ismétlés tűnik el)
  const m3files = beolvas()
  const sqlRaw3 = m3files.get(SQL)
  let db = 0
  const sqlMut3 = sqlRaw3.replace(/befizetes_id = p_befizetes_id/g, (m) => {
    db++
    return db === 2 ? 'befizetes_id = os.befizetes_id' : m
  })
  m3files.set(SQL, sqlMut3)
  if (sqlMut3 === sqlRaw3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3files).length === 0) bukik('M3: a zár mögötti idempotencia-kapu kilövésére az őr NEM bukik — vak')
  else pass('M3 mutáns (zár mögötti idempotencia-kapu kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — chitanță atomikus kiállítás rendben`)
