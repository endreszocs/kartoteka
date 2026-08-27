#!/usr/bin/env node
/**
 * SQL őrszem — „a RAISE helyőrzői és argumentumai nem stimmelnek" (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (élesben elsült, 42601)
 * ─────────────────────────────────────────
 *   RAISE EXCEPTION 'a % neve „%%", nem „%%" …', v_id, v_ro, v_vart;
 *   →  ERROR: 42601: too many parameters specified for RAISE
 *
 * A PL/pgSQL RAISE-ben a `%%` **LITERÁLIS SZÁZALÉKJEL**, NEM helyőrző. A fenti
 * formátumban tehát EGYETLEN helyőrző van (az első `%`), miközben HÁROM
 * argumentum megy át. A hiba FORDÍTÁSI idejű: az egész DO blokk elszáll, még
 * mielőtt bármit csinálna — vagyis egy egyébként kifogástalan migrációt buktat
 * meg a legelső sorában.
 *
 * ⚠️ MIÉRT KELL EZ AZ ŐRSZEM: a `migration-docs/sql/` fájlokat Endre KÉZZEL
 * futtatja a Supabase Studióban — nincs Supabase MCP és nincs helyi Postgres,
 * tehát a fájl NEM próbálható ki futtatás előtt. Egyetlen ilyen elütés egy
 * teljes kört visz el: „nem futott le" → javítás → újraküldés. Ez a teszt
 * pontosan azt méri, amit egy futtatás mérne.
 *
 * MIT ELLENŐRIZ
 *   R1  minden RAISE-ben a helyőrzők száma == az argumentumok száma
 *   R2  a `%%` NEM számít helyőrzőnek (ez volt a csapda)
 *   R3n NEGATÍV mutáns: a hibás alakon az őrszem BUKIK
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SQL_DIR = path.join(__dirname, '..', 'migration-docs', 'sql')

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

/**
 * Egy RAISE formátum-sztring HELYŐRZŐINEK száma.
 *
 * ⚠️ A `%%` literális százalékjel — előbb kivesszük, csak utána számolunk.
 * (Ez maga a hibaosztály: aki nem így számol, ugyanabba a csapdába esik.)
 */
export function helyorzokSzama(formatum) {
  return (formatum.replace(/%%/g, '').match(/%/g) || []).length
}

/**
 * A fájl RAISE utasításai: formátum-sztring + argumentumok.
 *
 * Egyszerű, de a ház SQL-jeire pontos elemzés: a RAISE-től a záró `;`-ig
 * olvasunk, az első egyszeres idézőjeles literál a formátum, az utána
 * következő vesszős lista az argumentumok. A `''` (escape-elt aposztróf) a
 * literálon belül kezelve.
 */
export function raiseUtasitasok(sql) {
  const talalatok = []
  const re = /RAISE\s+(?:EXCEPTION|NOTICE|WARNING|INFO|LOG|DEBUG)\s+/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    let i = m.index + m[0].length
    if (sql[i] !== "'") continue // pl. `RAISE EXCEPTION USING …` vagy változó

    // ⚠️ EGYMÁS MELLETTI LITERÁLOK ÖSSZEFŰZŐDNEK. Az SQL-ben
    //      'első rész '
    //      'második rész'
    //    EGYETLEN sztring. Az első elemzőm csak az elsőt vette, ezért a
    //    helyőrzőket alulszámolta, az argumentumokat pedig egyáltalán nem
    //    találta meg — és hibátlan, ÉLESBEN LEFUTOTT fájlokra kiabált.
    let formatum = ''
    let statikus = true
    for (;;) {
      i += 1 // a nyitó aposztróf után
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            formatum += "'"
            i += 2
            continue
          }
          break
        }
        formatum += sql[i]
        i += 1
      }
      i += 1 // a záró aposztróf után

      // Csak whitespace/komment jöhet a következő literálig.
      let j = i
      for (;;) {
        while (j < sql.length && /\s/.test(sql[j])) j += 1
        if (sql[j] === '-' && sql[j + 1] === '-') {
          const sorVege = sql.indexOf(String.fromCharCode(10), j)
          j = sorVege < 0 ? sql.length : sorVege + 1
          continue
        }
        break
      }
      if (sql[j] === "'") { i = j; continue }

      // ⚠️ `||` összefűzés: a formátum NEM statikus, nem elemezhető.
      if (sql[j] === '|' && sql[j + 1] === '|') statikus = false
      i = j
      break
    }

    const sorszam = sql.slice(0, m.index).split(String.fromCharCode(10)).length
    if (!statikus) {
      talalatok.push({ sorszam, formatum, argumentumok: [], statikus: false })
      continue
    }

    // Az utasítás hátralévő része a záró `;`-ig — a `;` KERESÉSE közben is
    // ügyelünk a sztringekre és a zárójelekre.
    let k = i
    let melyseg = 0
    let vege = sql.length
    while (k < sql.length) {
      const ch = sql[k]
      if (ch === "'") {
        k += 1
        while (k < sql.length) {
          if (sql[k] === "'") { if (sql[k + 1] === "'") { k += 2; continue } break }
          k += 1
        }
      } else if (ch === '(') melyseg += 1
      else if (ch === ')') melyseg -= 1
      else if (ch === ';' && melyseg === 0) { vege = k; break }
      k += 1
    }
    const maradek = sql.slice(i, vege)

    // ⚠️ A VESSZŐ ZÁRÓJELEN VAGY SZTRINGEN BELÜL NEM ELVÁLASZTÓ:
    //    a `COALESCE(v_hiba, 'valami')` EGY argumentum, nem kettő.
    const argResz = maradek.split(/[ \t\r\n]USING[ \t\r\n]/i)[0].trim()
    const argumentumok = []
    if (argResz.startsWith(',')) {
      let mely = 0
      let aktualis = ''
      for (let x = 1; x < argResz.length; x += 1) {
        const ch = argResz[x]
        if (ch === "'") {
          aktualis += ch
          x += 1
          while (x < argResz.length) {
            aktualis += argResz[x]
            if (argResz[x] === "'") { if (argResz[x + 1] === "'") { aktualis += argResz[x + 1]; x += 2; continue } break }
            x += 1
          }
          continue
        }
        if (ch === '(') mely += 1
        if (ch === ')') mely -= 1
        if (ch === ',' && mely === 0) { argumentumok.push(aktualis.trim()); aktualis = ''; continue }
        aktualis += ch
      }
      if (aktualis.trim()) argumentumok.push(aktualis.trim())
    }

    talalatok.push({ sorszam, formatum, argumentumok, statikus: true })
  }
  return talalatok
}

// ---------------------------------------------------------------------------
// R1–R2 — minden migrációs fájl minden RAISE-e
// ---------------------------------------------------------------------------
const fajlok = fs
  .readdirSync(SQL_DIR)
  .filter(f => f.endsWith('.sql'))
  .map(f => path.join(SQL_DIR, f))

let raiseDb = 0
const rosszak = []
for (const fajl of fajlok) {
  const sql = fs.readFileSync(fajl, 'utf8')
  for (const r of raiseUtasitasok(sql)) {
    if (r.statikus === false) continue // `||` összefűzés — nem elemezhető statikusan
    raiseDb += 1
    const hely = helyorzokSzama(r.formatum)
    if (hely !== r.argumentumok.length) {
      rosszak.push(
        `${path.basename(fajl)}:${r.sorszam} — ${hely} helyőrző, ${r.argumentumok.length} argumentum`,
      )
    }
  }
}

assert(raiseDb > 0, `R1-elo: találtunk RAISE utasításokat (${raiseDb} db, ${fajlok.length} fájlban)`)
assert(
  rosszak.length === 0,
  `R1: minden RAISE helyőrző-száma megegyezik az argumentumok számával${
    rosszak.length ? String.fromCharCode(10) + '      ' + rosszak.join(String.fromCharCode(10) + '      ') : ''
  }`,
)

// R2 — a `%%` nem helyőrző
assert(helyorzokSzama('a % neve „%%"') === 1, 'R2: a `%%` LITERÁLIS százalékjel, nem helyőrző')
assert(helyorzokSzama('%% %% %%') === 0, 'R2b: csupa `%%` = nulla helyőrző')
assert(helyorzokSzama('% % %') === 3, 'R2c: három külön `%` = három helyőrző')

// ---------------------------------------------------------------------------
// R3n (negatív) — az ÉLESBEN ELSÜLT alakon az őrszem BUKIK
// ---------------------------------------------------------------------------
{
  const ovilagi = `DO $x$
BEGIN
  RAISE EXCEPTION
    'ELŐFELTÉTEL: a % azonosítójú település neve „%%", nem „%%" — elcsúszott.',
    v_id, v_ro, v_vart;
END
$x$;`
  const [r] = raiseUtasitasok(ovilagi)
  assert(!!r, 'R3n-elo: az elemző megtalálta a hibás RAISE-t')
  assert(
    helyorzokSzama(r.formatum) === 1 && r.argumentumok.length === 3,
    `R3n: az ÉLESBEN ELSÜLT alakon az őrszem BUKNA (${helyorzokSzama(r?.formatum ?? '')} helyőrző, ${r?.argumentumok.length ?? 0} argumentum) — nem vak`,
  )
}

// R3p (pozitív kontroll) — a JAVÍTOTT alakon átmegy
{
  const javitott = `DO $x$
BEGIN
  RAISE EXCEPTION
    'ELŐFELTÉTEL: a % azonosítójú település neve „%", nem „%" — elcsúszott.',
    v_id, v_ro, v_vart;
END
$x$;`
  const [r] = raiseUtasitasok(javitott)
  assert(
    helyorzokSzama(r.formatum) === 3 && r.argumentumok.length === 3,
    'R3p: a javított alakon az őrszem átengedi (3 helyőrző, 3 argumentum)',
  )
}

// ---------------------------------------------------------------------------
// R4 — VEZÉRLŐKARAKTER AZ ŐRSZEM-FORRÁSOKBAN
//
// ⛔ MA KÉTSZER is elsült: egy szóhatár-jelölő a szerkesztő-eszközön át
//    LITERÁLIS BACKSPACE-szé (0x08) vált a reguláris kifejezésben. Az ilyen
//    regex SOHA nem illeszkedik — az őrszem tehát némán VAKKÁ válik, miközben
//    zöldet jelent. Ez a legrosszabb fajta hiba: hamis biztonságot ad.
//
//    (A projekt memóriájában rögzített hibaosztály: „Write + literál
//    vezérlőkarakter regexben".)
// ---------------------------------------------------------------------------
{
  const fajlok = fs
    .readdirSync(__dirname)
    .filter(f => f.startsWith('selftest-') && f.endsWith('.mjs'))
  // ⚠️ CSAK A REGULÁRIS KIFEJEZÉSEN BELÜLI vezérlőkarakter a veszélyes.
  //    Sztring-literálban lehet TELJESEN JOGOS: a selftest-backup.mjs például
  //    a ZIP magic bájtjait ('PK' + 0x03 + 0x04) használja tesztadatnak.
  //    Egy őrszem, ami erre is kiabál, hamis riasztásokkal szoktat le a
  //    figyelmeztetések olvasásáról — ezért szűken célzunk: két perjel KÖZÖTT,
  //    ugyanabban a sorban álló vezérlőkarakterre.
  const VEZERLO = '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]'
  const REGEX_SORBAN = new RegExp('/[^/\\n]*' + VEZERLO + '[^/\\n]*/[gimsuy]*')
  const fertozott = []
  for (const f of fajlok) {
    const sorok = fs.readFileSync(path.join(__dirname, f), 'utf8').split(String.fromCharCode(10))
    sorok.forEach((sor, idx) => {
      if (REGEX_SORBAN.test(sor)) fertozott.push(f + ':' + (idx + 1))
    })
  }
  assert(fajlok.length > 10, `R4-elo: tényleg átnéztük az őrszemeket (${fajlok.length} fájl)`)
  assert(
    fertozott.length === 0,
    `R4: egyetlen őrszem REGEXÉBEN sincs literális vezérlőkarakter (${fertozott.join(', ') || 'egy sem'})`,
  )

  // R4n (negatív): a MAI hibás alakon az őrszem BUKIK.
  // (A backspace-t futásidőben állítjuk elő, hogy magába a fájlba ne kerüljön.)
  const bs = String.fromCharCode(8)
  const hibasSor = '    const argResz = maradek.split(/' + bs + 'USING' + bs + '/i)[0].trim()'
  assert(
    REGEX_SORBAN.test(hibasSor),
    'R4n: a ma elsült, backspace-es regexen az őrszem BUKNA — nem vak',
  )
  // …és a JOGOS bináris tesztadatra NEM kiabál.
  const jogosSor = "      unpackContainer(Buffer.from('PK" + String.fromCharCode(3) + String.fromCharCode(4) + "valami zip'), dek)"
  assert(
    !REGEX_SORBAN.test(jogosSor),
    'R4p: a ZIP magic bájtjaira (sztring-literál, nem regex) NEM riaszt — nincs hamis riasztás',
  )
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
