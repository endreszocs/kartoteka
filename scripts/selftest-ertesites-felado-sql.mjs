// selftest-ertesites-felado-sql.mjs — az ertesitesek feladó-migráció SQL-forrásőre (2026-09-05)
//
// ⛔ MI VOLT A HIBA (a bíráló P0 találata, futtatás előtt)
//   A visszatöltő UPDATE `FROM LATERAL public.ertesites_felado_levezetes(e.tipus, …)`
//   alakban a CÉLTÁBLA aliasára (e) hivatkozott a FROM-listából. A PostgreSQL
//   ezt elutasítja (analyze.c transformUpdateStmt: a FROM feldolgozása alatt
//   `p_lateral_ok = false`) → `ERROR: invalid reference to FROM-clause entry
//   for table "e"`. A Supabase-szerkesztő egy tranzakcióban futtatja a fájlt →
//   az EGÉSZ migráció visszagördült volna: se oszlop, se trigger, se
//   írásvédelem. A migration-fájl nem bizonyíték (memory) — de a forrás-alak
//   őrizhető, hogy egy „egyszerűsítő" refaktor ne írja vissza.
//
// ŐRSZEMEK
//   L1   a fájlban NINCS olyan UPDATE, amely a FROM LATERAL-ból a saját
//        cél-aliasára hivatkozik
//   L1n  negatív: a régi alakra visszaírt mutánson az őr BUKIK
//   L2   a visszatöltés az al-lekérdezéses (x alias + CROSS JOIN LATERAL) alakban
//        él, és az id-n kapcsolódik a célsorhoz
//   L3   az írásvédelmi trigger a visszatöltés UTÁN jön létre, és ELŐTTE
//        el van dobva (ismételt futtatásnál különben némán visszaírná a NULL-t)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const SQL_PATH = path.join(ROOT, 'migration-docs/sql/2026-09-05-ertesitesek-felado.sql')
const SQL = fs.readFileSync(SQL_PATH, 'utf8')

/** SQL-kommentek nélkül — hogy egy kommentbe írt régi alak ne tévessze meg az őrt. */
function kommentNelkul(sql) {
  return sql
    .split('\n')
    .map((s) => s.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Talál-e olyan UPDATE-et, amelynek a FROM-részében LATERAL hívás a cél-alias
 * oszlopaira hivatkozik? (A cél-alias = az `UPDATE <tábla> <alias>` után álló szó.)
 */
function celAliasraHivatkozoLateral(sql) {
  const tiszta = kommentNelkul(sql)
  const re = /UPDATE\s+public\.ertesitesek\s+(\w+)\s+SET[\s\S]*?;/g
  let m
  while ((m = re.exec(tiszta)) !== null) {
    const alias = m[1]
    const utasitas = m[0]
    const fromIdx = utasitas.search(/\bFROM\b/)
    if (fromIdx < 0) continue
    const fromResz = utasitas.slice(fromIdx)
    // A FROM-lista LATERAL hívása a cél-aliasra mutat? Az al-lekérdezéses alak
    // (x alias) NEM üt, mert ott a LATERAL az x-re hivatkozik.
    const lateralRe = new RegExp(`LATERAL\\s+[\\w.]+\\s*\\([^)]*\\b${alias}\\.`)
    if (lateralRe.test(fromResz)) return true
  }
  return false
}

// L1 — a mai forrás
assert(!celAliasraHivatkozoLateral(SQL), 'L1: nincs UPDATE, amely a FROM LATERAL-ból a cél-aliasára (e.) hivatkozik')

// L1n — a régi (elhasaló) alak mutánsa
{
  const regiAlak = `UPDATE public.ertesitesek e
SET felado_tipus = lv.felado_tipus,
    felado_nev   = lv.felado_nev,
    felado_id    = lv.felado_id,
    felado_levezetett = true
FROM LATERAL public.ertesites_felado_levezetes(e.tipus, e.hivatkozas, e.cim, e.congregation_id, e.uzenet) lv
WHERE e.felado_tipus IS NULL;`
  const mutans = `${SQL}\n${regiAlak}\n`
  assert(celAliasraHivatkozoLateral(mutans), 'L1n: a régi `FROM LATERAL fn(e.…)` alakra visszaírt mutánson az őr BUKIK')
  // És egy kommentbe írt régi alak NEM téveszti meg (a komment-szűrő él).
  const kommentMutans = `${SQL}\n${regiAlak.split('\n').map((s) => `-- ${s}`).join('\n')}\n`
  assert(!celAliasraHivatkozoLateral(kommentMutans), 'L1k: kommentbe írt régi alak nem riasztja az őrt')
}

// L2 — az al-lekérdezéses alak megvan, az id-n kapcsolódik
{
  const tiszta = kommentNelkul(SQL)
  const alLekerdezes =
    /UPDATE\s+public\.ertesitesek\s+e\s+SET[\s\S]*?FROM\s*\(\s*SELECT\s+x\.id[\s\S]*?FROM\s+public\.ertesitesek\s+x\s+CROSS JOIN LATERAL\s+public\.ertesites_felado_levezetes\(\s*x\.tipus[\s\S]*?\)\s*l\s+WHERE\s+x\.felado_tipus IS NULL\s*\)\s*lv\s+WHERE\s+lv\.id\s*=\s*e\.id\s+AND\s+e\.felado_tipus IS NULL;/
  assert(alLekerdezes.test(tiszta), 'L2: a visszatöltés al-lekérdezéses alakban (x alias + CROSS JOIN LATERAL), lv.id = e.id kapcsolással')
}

// L3 — trigger-sorrend: DROP a visszatöltés ELŐTT, CREATE UTÁNA
{
  const tiszta = kommentNelkul(SQL)
  const visszatoltes = tiszta.search(/UPDATE\s+public\.ertesitesek\s+e\s+SET\s+felado_tipus\s*=\s*lv\.felado_tipus/)
  const drop = tiszta.indexOf('DROP TRIGGER IF EXISTS trg_ertesitesek_felado_irasvedelem')
  const create = tiszta.indexOf('CREATE TRIGGER trg_ertesitesek_felado_irasvedelem')
  assert(visszatoltes > 0 && drop > 0 && create > 0, 'L3-előfeltétel: a visszatöltés, a DROP és a CREATE TRIGGER mind megvan')
  assert(drop < visszatoltes && visszatoltes < create, 'L3: írásvédelmi trigger — DROP a visszatöltés ELŐTT, CREATE UTÁNA (ismételt futás nem írja vissza a NULL-t)')
}

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
process.exit(failedCount > 0 ? 1 : 0)
