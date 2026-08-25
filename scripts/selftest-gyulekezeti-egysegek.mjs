// selftest-gyulekezeti-egysegek.mjs — Gyülekezeti egységek (2026-08-25) őrszemei
//
// ⛔ MI VOLT A HIBA-KOCKÁZAT
//   1) A lelkészi jelentés mentése TELJES CSERÉVEL írja a kezi_adatok/
//      felulirasok jsonb-ket, és a kulcsokat katalógus-szűrőn engedi át
//      (keziMezok/autoMezok Set). A bontás-cellák `egyseg:<id>:<mezoId>`
//      kulcsai NINCSENEK a katalógusban → a szűrő bővítése nélkül minden
//      bontás-cella NÉMÁN ELVESZNE minden mentéskor.
//   2) Az új gyulekezeti_egysegek tábla besorolás nélkül HANGOSAN elbuktatja
//      a napi mentést (backup_table_policy fail-closed kapu), RLS nélkül
//      pedig nyitva állna; az RPC anon-joggal kiszivárogtatna.
//
// MIÉRT VAN EZ A FÁJL
//   A fenti két védelem szöveges jelenlétét őrzi a MAI forrásból épített
//   mutánsokkal (a „git show HEAD:" alapú negatív asszert a rögzített
//   hibaosztály szerint TILOS — a saját commitjától bukna meg).
//
// ŐRSZEMEK
//   E1–E6  egysegek-shared.ts viselkedés (transpile + futtatás)
//   S1–S3  saveLelkesziJelentes kulcs-szűrője (forrás-ellenőrzés)
//   S1n    negatív: a szűrő-őr a 3 mutánson BUKIK (nem vak)
//   Q1–Q5  SQL-migráció (backup-besorolás, RLS, 4 policy, anon-revoke, trigger)
//   Q1n    negatív: az SQL-őr a 3 mutánson BUKIK

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

// ─────────────────────────────────────────────────────────────────────────
// E — egysegek-shared.ts viselkedés (transpile + futtatás)
// ─────────────────────────────────────────────────────────────────────────

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

const SHARED_SRC = path.join(ROOT, 'apps/web/lib/gyulekezet/egysegek-shared.ts')
const sharedKod = fs.readFileSync(SHARED_SRC, 'utf8')
const out = ts.transpileModule(sharedKod, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
})
// A modulnak önállónak kell maradnia — futásidejű relatív/projekt-import tilos.
assert(
  !/require\(["'][^."']/.test(out.outputText),
  'E0: az egysegek-shared.ts import-mentes (önállóan betölthető)',
)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-egysegek-'))
let shared
try {
  const f = path.join(tmp, 'egysegek-shared.cjs')
  fs.writeFileSync(f, out.outputText)
  shared = require_(f)

  const { parseEgysegMezoKulcs, egysegMezoKulcs, ANYA_OSZLOP_ID, BONTAS_MEZO_IDS } = shared
  const UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'

  assert(
    JSON.stringify(parseEgysegMezoKulcs(egysegMezoKulcs(UUID, 'I.10'))) ===
      JSON.stringify({ egysegId: UUID, mezoId: 'I.10' }),
    'E1: uuid-s kulcs oda-vissza (egysegMezoKulcs → parseEgysegMezoKulcs)',
  )
  assert(
    JSON.stringify(parseEgysegMezoKulcs(`egyseg:${ANYA_OSZLOP_ID}:VII.3`)) ===
      JSON.stringify({ egysegId: 'anya', mezoId: 'VII.3' }),
    "E2: az anyaközpont oszlop kulcsa ('egyseg:anya:<mezoId>') érvényes",
  )
  assert(
    parseEgysegMezoKulcs('egyseg:nem-uuid:I.10') === null,
    'E3: nem-uuid egység-azonosító → null (idegen kulcs nem csúszik át)',
  )
  assert(
    parseEgysegMezoKulcs(`egyseg:${UUID}:`) === null && parseEgysegMezoKulcs('egyseg::I.10') === null,
    'E4: üres mező- vagy egység-azonosító → null',
  )
  assert(parseEgysegMezoKulcs('I.10') === null, 'E5: sima mezoId nem bontás-kulcs')
  assert(
    Array.isArray(BONTAS_MEZO_IDS) && BONTAS_MEZO_IDS.includes('I.10') && BONTAS_MEZO_IDS.length >= 12,
    'E6: a bontás mutató-készlete nem üres és tartalmazza az I.10-et',
  )
  assert(
    shared.SZERVEZETI_TIPUS_CIMKEK?.tars === 'Társegyházközség' &&
      shared.EGYSEG_TIPUS_CIMKEK?.egyhazresz === 'Egyházrész',
    'E7: a társegyházközség és az egyházrész típus a katalógusban van',
  )
  assert(
    typeof shared.kozpontCimke === 'function' &&
      shared.kozpontCimke('tars') !== shared.kozpontCimke('anya') &&
      shared.kozpontCimke('anya') === shared.ANYAKOZPONT_CIMKE,
    'E8: társegyházközségnél a központ-felirat KÖZÖS, nem anyaközpont',
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ─────────────────────────────────────────────────────────────────────────
// Segédek a forrás-őrszemekhez
// ─────────────────────────────────────────────────────────────────────────

/** TS/JS kommentek eltávolítása (a „létezik a szó, de csak kommentben" csapda ellen). */
function kommentNelkulTs(kod) {
  return kod
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((sor) => {
      const i = sor.indexOf('//')
      if (i === -1) return sor
      // durva string-védelem: ha a // előtt páratlan számú idézőjel van, hagyjuk
      const elotte = sor.slice(0, i)
      const idezok = (elotte.match(/['"`]/g) || []).length
      return idezok % 2 === 0 ? elotte : sor
    })
    .join('\n')
}

/** SQL-kommentek (-- …) eltávolítása. */
function kommentNelkulSql(sql) {
  return sql
    .split('\n')
    .filter((sor) => !sor.trim().startsWith('--'))
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────
// S — a saveLelkesziJelentes kulcs-szűrője (forrás-őrszem + mutánsok)
// ─────────────────────────────────────────────────────────────────────────

const ACTIONS_SRC = path.join(ROOT, 'apps/web/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts')
const actionsKodNyers = fs.readFileSync(ACTIONS_SRC, 'utf8')

/**
 * PURE ellenőrző — mutánsokkal is hívható. A mentés-szűrő három kötelező eleme:
 *  (a) parseEgysegMezoKulcs a kezi-ágban a keziMezok.has mellett,
 *  (b) parseEgysegMezoKulcs a felulirasok-ágban az autoMezok.has mellett,
 *  (c) az egység-azonosító érvényesség-őre (ervenyesEgysegIds.has).
 */
function mentesSzuroVedE(kodNyers) {
  const kod = kommentNelkulTs(kodNyers)
  const fnStart = kod.indexOf('async function saveLelkesziJelentesImpl')
  const start = fnStart !== -1 ? fnStart : kod.indexOf('export async function saveLelkesziJelentes')
  if (start === -1) return { rendben: false, uzenet: 'a saveLelkesziJelentes nem található' }
  const torzs = kod.slice(start, start + 6000)
  const keziAg =
    /keziMezok\.has\(/.test(torzs) &&
    /parseEgysegMezoKulcs\(/.test(torzs) &&
    /keziMezok\.has\(\s*p\.mezoId\s*\)/.test(torzs)
  const autoAg = /autoMezok\.has\(\s*p\.mezoId\s*\)/.test(torzs)
  const egysegOr = /ervenyesEgysegIds\.has\(\s*p\.egysegId\s*\)/.test(torzs)
  if (!keziAg) return { rendben: false, uzenet: 'a kezi-ág nem engedi át a bontás-kulcsokat' }
  if (!autoAg) return { rendben: false, uzenet: 'a felulirasok-ág nem engedi át a bontás-kulcsokat' }
  if (!egysegOr) return { rendben: false, uzenet: 'hiányzik az egység-azonosító érvényesség-őre' }
  return { rendben: true, uzenet: 'rendben' }
}

const sEredmeny = mentesSzuroVedE(actionsKodNyers)
assert(sEredmeny.rendben, `S1: a mentés kulcs-szűrője átengedi és őrzi a bontás-kulcsokat (${sEredmeny.uzenet})`)
assert(
  /parseEgysegMezoKulcs/.test(kommentNelkulTs(actionsKodNyers)),
  'S2: a parseEgysegMezoKulcs nem csak kommentben szerepel',
)
assert(
  /bontas/.test(kommentNelkulTs(actionsKodNyers)) && /snapshot/i.test(actionsKodNyers),
  'S3: a bontás a snapshot-építésben is jelen van',
)

// NEGATÍV ASSZERTEK — a „régi világ" a MAI forrásból áll elő (mutánsok).
const sMutansok = [
  [
    'parseEgysegMezoKulcs-hívások törölve (a régi, kulcs-eldobó szűrő)',
    actionsKodNyers.replace(/parseEgysegMezoKulcs\(/g, 'void(0) && ('),
  ],
  [
    'az egység-érvényesség-őr törölve',
    actionsKodNyers.replace(/ervenyesEgysegIds\.has\(\s*p\.egysegId\s*\)/g, 'true /*mutáns*/ && false'),
  ],
  [
    'csak kommentben marad a védelem',
    actionsKodNyers
      .replace(/parseEgysegMezoKulcs\(/g, 'void(0) && (')
      .concat('\n// parseEgysegMezoKulcs( keziMezok.has( p.mezoId ) ervenyesEgysegIds.has( p.egysegId ) autoMezok.has( p.mezoId )\n'),
  ],
]
let sMindBukik = true
for (const [nev, mutans] of sMutansok) {
  if (mutans === actionsKodNyers) {
    sMindBukik = false
    assert(false, `S1n: a mutáns („${nev}") NEM különbözik az eredetitől — a negatív asszert vak`)
    continue
  }
  if (mentesSzuroVedE(mutans).rendben) {
    sMindBukik = false
    assert(false, `S1n: az őrszem ZÖLD maradt az elrontott változaton („${nev}") — túl laza minta`)
  }
}
if (sMindBukik) assert(true, 'S1n: a mentés-szűrő őrszeme mind a 3 mutánson BUKIK (tud pirosra váltani)')

// ─────────────────────────────────────────────────────────────────────────
// Q — az SQL-migráció kötelező védelmei (forrás-őrszem + mutánsok)
// ─────────────────────────────────────────────────────────────────────────

const SQL_SRC = path.join(ROOT, 'migration-docs/sql/2026-08-25-gyulekezeti-egysegek.sql')
const sqlNyers = fs.readFileSync(SQL_SRC, 'utf8')

/** PURE ellenőrző az SQL-re — mutánsokkal is hívható. */
function sqlVedelmekE(nyers) {
  const sql = kommentNelkulSql(nyers)
  if (!/INSERT INTO public\.backup_table_policy[\s\S]{0,400}?'gyulekezeti_egysegek'/.test(sql))
    return { rendben: false, uzenet: 'hiányzik a backup_table_policy besorolás (a napi mentés elhasalna)' }
  if (!/ALTER TABLE public\.gyulekezeti_egysegek ENABLE ROW LEVEL SECURITY/.test(sql))
    return { rendben: false, uzenet: 'hiányzik az RLS bekapcsolása' }
  const policyDb = (sql.match(/CREATE POLICY gyulekezeti_egysegek_\w+/g) || []).length
  if (policyDb !== 4) return { rendben: false, uzenet: `nem 4 policy van a táblán (${policyDb})` }
  if (!/REVOKE ALL ON FUNCTION public\.gyulekezeti_hierarchia\(\) FROM anon/.test(sql))
    return { rendben: false, uzenet: 'az RPC anon-tiltása hiányzik' }
  if (!/trg_congregations_szervezet_guard/.test(sql))
    return { rendben: false, uzenet: 'hiányzik a congregations őr-trigger' }
  if (!/profile_roles/.test(sql) || !/approval_status = 'approved'/.test(sql))
    return { rendben: false, uzenet: 'az RLS-policyk profile_roles-lába hiányzik (roles-first szabály)' }
  // 2026-08-25/2 HIBAOSZTÁLY: a Supabase SQL editor nem garantál session-
  // állapotot — TEMP tábla a migrációban 42P01-gyel elhasal (élesben elsült).
  if (/CREATE\s+TEMP(ORARY)?\s+TABLE/i.test(sql))
    return { rendben: false, uzenet: 'TEMP tábla a migrációban — a Supabase SQL editor alatt elhasal (42P01)' }
  if (!/'tars'/.test(sql) || !/'egyhazresz'/.test(sql))
    return { rendben: false, uzenet: 'a társegyházközség (tars/egyhazresz) értékek hiányoznak a CHECK-ekből' }
  return { rendben: true, uzenet: 'rendben' }
}

const qEredmeny = sqlVedelmekE(sqlNyers)
assert(qEredmeny.rendben, `Q1: az SQL-migráció kötelező védelmei megvannak (${qEredmeny.uzenet})`)

const qMutansok = [
  ['backup-besorolás törölve', sqlNyers.replace(/INSERT INTO public\.backup_table_policy/g, 'INSERT INTO public.mutans_tabla')],
  ['RLS-bekapcsolás törölve', sqlNyers.replace(/ENABLE ROW LEVEL SECURITY/g, '')],
  ['anon-revoke törölve', sqlNyers.replace(/REVOKE ALL ON FUNCTION public\.gyulekezeti_hierarchia\(\) FROM anon;?/g, '')],
  ['csak kommentben marad a backup-besorolás', sqlNyers.replace(/INSERT INTO public\.backup_table_policy/g, 'INSERT INTO public.mutans_tabla').concat("\n-- INSERT INTO public.backup_table_policy ('gyulekezeti_egysegek')\n")],
  ['TEMP tábla visszacsempészve (a 42P01-hibaosztály)', sqlNyers.replace(/BEGIN;/, "BEGIN;\nCREATE TEMP TABLE _mutans_futas AS SELECT true AS elso;")],
  ['tars érték kivéve a CHECK-ből', sqlNyers.replace(/'tars'/g, "'anya'")],
]
let qMindBukik = true
for (const [nev, mutans] of qMutansok) {
  if (mutans === sqlNyers) {
    qMindBukik = false
    assert(false, `Q1n: a mutáns („${nev}") NEM különbözik az eredetitől — a negatív asszert vak`)
    continue
  }
  if (sqlVedelmekE(mutans).rendben) {
    qMindBukik = false
    assert(false, `Q1n: az SQL-őrszem ZÖLD maradt az elrontott változaton („${nev}")`)
  }
}
if (qMindBukik) assert(true, 'Q1n: az SQL-őrszem mind a 6 mutánson BUKIK (tud pirosra váltani)')

// A refaktor-integritás: a fő jelentés a kiemelt tiszta magot hívja.
const worklogAutoPath = path.join(ROOT, 'apps/web/lib/lelkeszi-jelentes/worklog-auto.ts')
assert(fs.existsSync(worklogAutoPath), 'R1: a worklog-auto.ts (kiemelt tiszta mag) létezik')
assert(
  /worklogAutoMezok\(/.test(kommentNelkulTs(actionsKodNyers)),
  'R2: az aggregátor a worklogAutoMezok tiszta magot hívja',
)

// ─────────────────────────────────────────────────────────────────────────

console.log(`\nÖsszesen: ${total}, hibás: ${failedCount}`)
if (failedCount > 0) {
  console.error('❌ FAIL — gyulekezeti-egysegek őrszemek')
  process.exit(1)
}
console.log('✅ PASS — gyulekezeti-egysegek őrszemek')
