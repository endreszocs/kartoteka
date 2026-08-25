// selftest-tisztsegek.mjs — a presbitérium/tisztségek/naptár kör őrszemei (2026-08-26)
//
// ⛔ MIÉRT KELLENEK
//   A kör egyházjogi szabályt kódol (kvórum = aktív TELJES presbiterek + a
//   lelkész; a pót tanácskozási joggal), GDPR-kaput (név-publikálás CSAK
//   hozzájárulással, az RPC WHERE-ágában) és a naptár ünnep-egyforrását.
//   Mindhárom „csendben visszaromló" osztály — mutáns-negatívokkal védjük.
//
// ŐRSZEMEK
//   K1–K4  kvórum-szabály (+ K1n: az óvilági szabály-mutáns BUKIK)
//   A1–A3  aktív-mandátum + lejárat-badge (+ A1n: jövőbeli-kezdet mutáns BUKIK)
//   U1–U3  ünnep-egyforrás (12 nap, 2026-os húsvét-lánc, fogyasztó-őrök)
//   R1–R2  ismétlődés: 'evi' + ismetlodes_vege (+ R2n: plafon-mutáns BUKIK)
//   S1–S6  SQL-forrásőrök (backfill-sorrend, consent-kapu az RPC-ben,
//          törlő-RPC tisztsegek-lába, mentés-besorolás, integritás-trigger)

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
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const SHARED_SRC = path.join(ROOT, 'apps/web/lib/tisztsegek/shared.ts')
const HOLIDAYS_SRC = path.join(ROOT, 'apps/web/lib/utils/reformed-holidays.ts')
const RECURRENCE_SRC = path.join(ROOT, 'apps/web/lib/utils/program-recurrence.ts')
const MIG_SRC = path.join(ROOT, 'migration-docs/sql/2026-08-26-presbiterium-tisztsegek.sql')
const MINUTES_SRC = path.join(ROOT, 'apps/web/components/minutes/minutes-editor.tsx')
const ANNUAL_PRINT_SRC = path.join(ROOT, 'apps/web/components/dashboard/annual-plan-print.tsx')
const ICS_SRC = path.join(ROOT, 'apps/web/lib/calendar/ics.ts')
const CAL_SRC = path.join(ROOT, 'apps/web/components/dashboard/program-calendar.tsx')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-tisztsegek-'))
process.on('exit', () => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* takarítás */ }
})

let modCounter = 0
function betolt(forras) {
  modCounter += 1
  const cjs = path.join(tmp, `mod-${modCounter}.cjs`)
  fs.writeFileSync(cjs, t(forras))
  return require_(cjs)
}

const shared = betolt(fs.readFileSync(SHARED_SRC, 'utf8'))
const holidays = betolt(fs.readFileSync(HOLIDAYS_SRC, 'utf8'))
const recurrence = betolt(fs.readFileSync(RECURRENCE_SRC, 'utf8'))

// ── K: kvórum-szabály (Endre-döntés: teljes értékűek + a lelkész) ───────────
const resztvevok = [
  ...Array.from({ length: 10 }, (_, i) => ({ szerep: i < 2 ? 'presbiter, gondnok' : 'presbiter', statusz: i < 6 ? 'jelen' : 'igazoltan_tavol' })),
  { szerep: 'pótpresbiter (tanácskozási joggal)', statusz: 'jelen' },
  { szerep: 'tiszteletbeli presbiter (tanácskozási joggal)', statusz: 'jelen' },
]
const kv = shared.kvorumSzamitas(resztvevok)
assert(kv.alap === 11, 'K1: alap = 10 teljes presbiter + a lelkész (a 2 pót/tb. NEM számít)')
assert(kv.szukseges === 6, 'K2: szükséges = floor(11/2)+1 = 6')
assert(kv.jelen === 7 && kv.megvan === true, 'K3: jelen = 6 szavazati jogú + a lelkész = 7 → határozatképes')
const kv2 = shared.kvorumSzamitas(resztvevok.map((r, i) => (i < 6 && r.szerep === 'presbiter' ? { ...r, statusz: 'igazolatlanul_tavol' } : r)))
assert(kv2.megvan === false, 'K4: ha a teljes értékűek többsége hiányzik, a pótok jelenléte sem menti meg')

// K1n (negatív): az ÓVILÁGI szabály (minden sor számít, a lelkész nem) mutánsa
// más eredményt ad — az őrszem tehát nem vak.
{
  const src = fs.readFileSync(SHARED_SRC, 'utf8')
  const m1 = 'const alap = szavazok.length + 1'
  const m2 = "const jelen = szavazok.filter(r => (r.statusz || 'jelen') === 'jelen').length + 1"
  if (!src.includes(m1) || !src.includes(m2)) {
    assert(false, 'K1n: a kvórum-képlet sorai nem találhatók (a forrás változott?)')
  } else {
    const mutans = betolt(src
      .replace(m1, 'const alap = resztvevok.length')
      .replace(m2, "const jelen = resztvevok.filter(r => (r.statusz || 'jelen') === 'jelen').length"))
    const mk = mutans.kvorumSzamitas(resztvevok)
    assert(mk.alap !== kv.alap, 'K1n: az óvilági (pót is számít, lelkész nem) mutáns MÁS alapot ad — az őrszem fog')
  }
}

// ── A: aktív mandátum + badge ───────────────────────────────────────────────
assert(shared.aktivE(null, null, '2026-08-26') === true, 'A1a: dátum nélkül aktív (régi adat)')
assert(shared.aktivE('2026-01-01', '2029-01-01', '2026-08-26') === true, 'A1b: futó mandátum aktív')
assert(shared.aktivE('2026-01-01', '2026-08-25', '2026-08-26') === false, 'A1c: lejárt mandátum NEM aktív')
assert(shared.aktivE('2027-01-01', '2030-01-01', '2026-08-26') === false, 'A1d: JÖVŐBELI kezdet NEM aktív (nem publikálódik, kvórumba nem számít)')
assert(shared.mandatumAllapot('2024-01-01', '2026-12-01', '2026-08-26') === 'hamarosan_lejar', 'A2: fél éven belüli lejárat → sárga')
assert(shared.mandatumAllapot(null, null, '2026-08-26') === 'nincs_megadva', 'A3: dátum nélkül → szürke (nem hamis zöld)')

// A1n (negatív): a jövőbeli-kezdet ellenőrzés kiirtása BUKIK az A1d-n.
{
  const src = fs.readFileSync(SHARED_SRC, 'utf8')
  const sor = 'if (kezdete && kezdete > ma) return false'
  if (!src.includes(sor)) {
    assert(false, 'A1n: a jövőbeli-kezdet őr sora nem található (a forrás változott?)')
  } else {
    const mutans = betolt(src.replace(sor, ''))
    assert(mutans.aktivE('2027-01-01', '2030-01-01', '2026-08-26') === true, 'A1n: a kezdet-őr nélküli mutáns a jövőbeli mandátumot aktívnak venné — az őrszem fog')
  }
}

// ── U: ünnep-egyforrás ──────────────────────────────────────────────────────
const unnepek2026 = holidays.getUnnepnapokForYear(2026)
assert(unnepek2026.length === 12, 'U1: 12 kanonikus ünnepnap évente')
const u = new Map(unnepek2026.map((x) => [x.name, x.date]))
assert(u.get('Húsvét') === '2026-04-05' && u.get('Húsvéthétfő') === '2026-04-06', 'U2a: 2026 — Húsvét ápr. 5. + Húsvéthétfő ápr. 6.')
assert(u.get('Pünkösd') === '2026-05-24' && u.get('Pünkösdhétfő') === '2026-05-25' && u.get('Virágvasárnap') === '2026-03-29', 'U2b: 2026 — Pünkösd/Pünkösdhétfő/Virágvasárnap lánc')
assert(u.get('Karácsony 2. napja') === '2026-12-26', 'U2c: Karácsony 2. napja külön néven')
{
  const annualSrc = stripComments(fs.readFileSync(ANNUAL_PRINT_SRC, 'utf8'))
  assert(!annualSrc.includes('easterSunday'), 'U3a: az éves terv nyomtatásból a SAJÁT húsvét-számítás törölve (egy forrás)')
  assert(annualSrc.includes('getUnnepnapokForYear'), 'U3b: az éves terv a kanonikus ünneplistát használja')
  const icsSrc = stripComments(fs.readFileSync(ICS_SRC, 'utf8'))
  assert(icsSrc.includes('getUnnepnapokForYear'), 'U3c: az ICS-feed is a kanonikus ünneplistát használja')
  const calSrc = stripComments(fs.readFileSync(CAL_SRC, 'utf8'))
  assert(calSrc.includes('getUnnepnapTerkep'), 'U3d: a képernyő-naptár mutatja az ünnepeket (eddig semmit nem jelzett)')
}

// ── R: ismétlődés — 'evi' + ismetlodes_vege ─────────────────────────────────
function prog(felul) {
  return {
    id: 'p1', cim: 'Búcsú', datum: '2024-09-08', datum_vege: null, ido_kezdes: null,
    ido_befejezes: null, helyszin: null, tipus: 'istentisztelet', prioritas: 'normal',
    ismetlodes_tipus: null, ismetlodes_vege: null, egyedi_tipus_nev: null,
    egyedi_emoji: null, megjegyzes: null, teljesitett: false, teljesites_datum: null,
    letrehozta_id: null, letrehozta_nev: null, congregation_id: null,
    created_at: '', updated_at: '', ...felul,
  }
}
{
  const evi = recurrence.expandProgramOccurrences([prog({ ismetlodes_tipus: 'evi' })], 2026)
  const datumok = evi.map((p) => p.datum)
  assert(datumok.includes('2024-09-08') && datumok.includes('2025-09-08') && datumok.includes('2026-09-08') && datumok.length === 3, 'R1: évi ismétlődés — 2024/2025/2026. szept. 8. (3 alkalom)')

  const veges = recurrence.expandProgramOccurrences(
    [prog({ ismetlodes_tipus: 'heti', datum: '2026-01-05', ismetlodes_vege: '2026-01-31' })],
    2026,
  )
  assert(veges.length === 4 && veges[veges.length - 1].datum === '2026-01-26', 'R2: az ismetlodes_vege levágja a sorozatot (jan. 5/12/19/26 — nem fut az év végéig)')

  // R2n (negatív): a vége-clamp kiirtása → a sorozat az év végéig futna.
  const src = fs.readFileSync(RECURRENCE_SRC, 'utf8')
  const sor = 'if (p.ismetlodes_vege && p.ismetlodes_vege < horizon) horizon = p.ismetlodes_vege'
  if (!src.includes(sor)) {
    assert(false, 'R2n: a vége-clamp sora nem található (a forrás változott?)')
  } else {
    const mutans = betolt(src.replace(sor, ''))
    const m = mutans.expandProgramOccurrences(
      [prog({ ismetlodes_tipus: 'heti', datum: '2026-01-05', ismetlodes_vege: '2026-01-31' })],
      2026,
    )
    assert(m.length > 4, 'R2n: a clamp nélküli mutánson a sorozat túlfut — az őrszem fog')
  }
}

// ── S: SQL-forrásőrök ───────────────────────────────────────────────────────
{
  const mig = fs.readFileSync(MIG_SRC, 'utf8')
  const fogondnokIdx = mig.indexOf("SET funkcio = 'fogondnok'")
  const gondnokIdx = mig.indexOf("SET funkcio = 'gondnok'")
  const potIdx = mig.indexOf("SET fokozat = 'pot'")
  assert(fogondnokIdx > -1 && gondnokIdx > -1 && fogondnokIdx < gondnokIdx, 'S1: backfill-sorrend — a főgondnok-minta ELŐBB fut, mint a gondnok (LIKE-csapda)')
  assert(potIdx > -1 && potIdx < gondnokIdx, 'S1b: a pótpresbiter-minta is a gondnok előtt fut')

  const rpcStart = mig.indexOf('CREATE OR REPLACE FUNCTION public.public_site_tisztsegek')
  const rpcEnd = mig.indexOf('COMMENT ON FUNCTION public.public_site_tisztsegek', rpcStart)
  const rpcBlokk = mig.slice(rpcStart, rpcEnd)
  assert((rpcBlokk.match(/nev_publikalas_consent = true/g) || []).length >= 2, 'S2: a consent-kapu a publikus RPC MINDKÉT ágának WHERE-jében él (nem a UI-ban)')
  assert((rpcBlokk.match(/publikus = true/g) || []).length >= 2, 'S2b: a publikus-jelölés kapuja is az RPC-ben van')
  assert(rpcBlokk.includes('meghalt = false') && rpcBlokk.includes('isvisible = true'), 'S2c: elhunyt/rejtett személy neve nem publikálódhat')

  const tisztsegekDel = mig.indexOf('DELETE FROM public.tisztsegek t WHERE t.id_szemely = p_szemely_id')
  const presbiterDel = mig.indexOf('DELETE FROM public.presbiter p WHERE p.id_szemely = p_szemely_id')
  assert(tisztsegekDel > -1 && presbiterDel > -1 && tisztsegekDel < presbiterDel, 'S3: a személytörlő RPC a tisztsegek-sorokat is viszi (a presbiter-törlés előtt)')

  assert(mig.includes("('tisztsegek', 'gyulekezet', 4, true"), 'S4: mentés-besorolás (backup_table_policy) UGYANEBBEN a fájlban — enélkül az éjszakai mentés elhasal')
  assert(/tisztsegek_set_congregation[\s\S]*?RAISE EXCEPTION[\s\S]*?nem egyezik a személy gyülekezetével/.test(mig), 'S5: a kereszt-gyülekezeti integritás-trigger HIBÁT DOB eltérésnél (nem csak tölt)')
  assert(mig.includes('ELŐFELTÉTEL-HIBA') && mig.includes('KARTOTEKA_MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1'), 'S6: a törlő-RPC felülírása fail-closed ujjlenyomat-ellenőrzés mögött van')
}

// ── Fogyasztó-őr: a jegyzőkönyv-szerkesztő az új kvórum-szabályt használja ──
{
  const minutesSrc = stripComments(fs.readFileSync(MINUTES_SRC, 'utf8'))
  assert(minutesSrc.includes('kvorumSzamitas'), 'F1: a minutes-editor a közös kvórum-szabályból számol')
  const mutans = minutesSrc.replace(/kvorumSzamitas/g, '')
  assert(!mutans.includes('kvorumSzamitas'), 'F1n: a bekötés nélküli (óvilági) editoron az őrszem BUKNA — nem vak')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
