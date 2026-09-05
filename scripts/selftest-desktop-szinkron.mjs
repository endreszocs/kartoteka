#!/usr/bin/env node
// selftest-desktop-szinkron.mjs — a desktop szinkron helyességének őrszemei (2026-09-05)
//
// ⛔ MI VOLT A HIBA (desk-sync felmérés, 2026-09-04)
//   (1) a klasszikus outbox MINDEN átmeneti hibát (hálózat, 5xx, időtúllépés)
//       VÉGLEGES `failed`-nek vett — a sor a gépen ragadt, újrapróbálás csak a
//       /dev oldalon; (2) a tag/család/gyermek push-erek csak a megfelelő
//       oldal mountján indultak (8 külön listener) — offline felvett tag a
//       gépen maradt; (3) az orchestrator minden pull-hibát elnyelt (mindig
//       „Friss adatok"), session nélkül is futott, és a TRUNCATE+INSERT
//       pull-ok egy üres (anon / inaktív státusz) válaszból KIÜRÍTETTÉK a
//       helyi tükröt; (4) a belépés státusz-vak volt (pending fiók teljes
//       héjat kapott); (5) a könyvtári SIGNED_OUT explicit kijelentkezésként
//       törölte a lastUser cache-t.
//
// ŐRSZEMEK (mind negatív asszerttel — a mutánson BUKNIA kell)
//   R1   a regiszter mind a 8 push-ert indítja (transpile + futtatás, mock)
//   R1n  mutáns: egy push-er kivéve → BUKIK
//   R2   engedély nélkül (felfüggesztve) EGY push-er sem indul
//   O1   orchestrator: session nélkül EGYETLEN pull sem fut, állapot 'offline-pin'
//   O1n  mutáns: a session-őr kikötve → BUKIK
//   O2   minden pull bukik → 'error', bukottTablak = N, voltSiker=false
//   O3   egy pull bukik → 'partial' + a tábla neve
//   O4   a 0-sor-szelep figyelmeztetése → 'partial'
//   H1   hiba-osztályozó: átmeneti vs. végleges osztályok
//   H2   visszalépés: 30 mp → 8 perc, 5 próba
//   H3   forrás-őr: a processOutbox catch-ága osztályoz + markOutboxAttempt
//   H3n  mutáns: a catch mindig `failed` → BUKIK
//   S1   szelepDontes: 0 szerver + N helyi → kihagy; 0+0 → csere; N → csere
//   S2   forrás-őr: a 8 teljes-cserés pullban a szelep a DELETE ELŐTT áll
//   S2n  mutáns: a programok pull szelepe kikötve → BUKIK
//   S3   (node:sqlite) a tag-upsert KAPUJA: függő outbox-sor mellett a helyi
//        módosítás marad, a többi sor frissül
//   G1   auth-gate: státusz-kapu, regiszter-indítás, hasPin időkorlát,
//        a passzív SIGNED_OUT nem töröl — 3 mutáns → BUKIK
//
// ⛔ BÍRÁLÓ P1 (2026-09-05): a `withSyncTimeout` NEM szakítja meg a push-t, de
//   a push-erek `finally { inFlight = false }`-je az időkorlátnál feloldotta az
//   őrt → a következő kör ugyanazokat a pending sorokat ÚJRA felküldte (a
//   tag/család/gyermek insertnek nincs idempotencia-kulcsa → duplikált
//   szerver-sorok); a pull-oldalon két párhuzamos TRUNCATE+INSERT.
//   F1–F3 FutoOr (a regiszter valódi osztálya): futás-megosztás, időtúllépés
//        után az őr TART, siker/hiba old
//   P1   szemely-write-sync FUTTATVA (mockolt Supabase, beragadt insert +
//        30 ms-os időkorlát): a 2. és 3. kör NEM küldi fel újra a sort
//   P1n  mutáns (az őr nem a tényleges véghez kötve — a mai finally) → BUKIK
//   P2   forrás-őr: mind a 7 push-er FutoOr-t használ, nincs inFlight-finally;
//        az orchestrator pull-jai kulcsonként FutoOr-ral futnak
//   P2n  mutáns → BUKIK
//   O6   orchestrator FUTTATVA: beragadt leltár-pull után a 2. kör NEM indít
//        párhuzamos pullt; a lezárás után a 3. kör újat indít és sikeres
//
// Futtatás:  node scripts/selftest-desktop-szinkron.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const LIB = path.join(ROOT, 'apps', 'desktop', 'src', 'lib')

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

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const REG_SRC = fs.readFileSync(path.join(LIB, 'write-sync-registry.ts'), 'utf8')
const ORCH_SRC = fs.readFileSync(path.join(LIB, 'sync-orchestrator.ts'), 'utf8')
const SYNC_SRC = fs.readFileSync(path.join(LIB, 'sync.ts'), 'utf8')
const GATE_SRC = fs.readFileSync(path.join(LIB, 'auth-gate.tsx'), 'utf8')

// Böngésző-váz a modulokhoz (a regiszter `window`-t és `navigator`-t néz).
globalThis.window = globalThis.window ?? {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
}
// (a Node saját `navigator`-a csak getter; `onLine` nincs rajta → a hálózat-őr átenged)
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent {}

// ── R: a regiszter ─────────────────────────────────────────────────────────
const PUSHEREK = ['chitanta', 'befizetes', 'kiadas', 'szemely', 'csalad', 'gyerek', 'excel', 'outbox']

/** A regiszter betöltése ADOTT forrással + 8 mock push-errel; a hívott push-erek halmazát adja. */
async function futtatRegisztert(regSrc, { engedely = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-szinkron-'))
  const hivott = new Set()
  // Modul-példányonként KÜLÖN globális halmaz — egy előző példány háttér-köre
  // ne írhasson a következő teszt halmazába.
  const kulcs = `__hivott_${Date.now()}_${Math.random().toString(36).slice(2)}`
  global[kulcs] = hivott
  try {
    const stub = (nev, fnNevek) =>
      fnNevek.map((fn) => `exports.${fn} = async () => { global['${kulcs}'].add('${nev}'); return {}; };`).join('\n')
    fs.writeFileSync(path.join(tmp, 'chitanta-sync.js'), stub('chitanta', ['runChitantaSyncManually', 'runChitantaSyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'befizetes-write-sync.js'), stub('befizetes', ['runBefizetesSyncManually', 'runBefizetesSyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'kiadas-write-sync.js'), stub('kiadas', ['runKiadasSyncManually', 'runKiadasSyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'szemely-write-sync.js'), stub('szemely', ['runSzemelySyncManually', 'runSzemelySyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'csalad-write-sync.js'), stub('csalad', ['runCsaladSyncManually', 'runCsaladSyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'gyerek-write-sync.js'), stub('gyerek', ['runGyerekSyncManually', 'runGyerekSyncGuarded']))
    fs.writeFileSync(path.join(tmp, 'excel-write-sync.js'), stub('excel', ['runExcelWriteSyncManually', 'runExcelWriteSyncGuarded']))
    fs.writeFileSync(
      path.join(tmp, 'sync.js'),
      stub('outbox', ['processOutbox', 'runOutboxSyncGuarded']) +
        `\nexports.getLocalOwnProfile = async () => ({ congregation_id: 'gy-1' });`,
    )
    const regPath = path.join(tmp, `registry-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`)
    fs.writeFileSync(regPath, t(regSrc))
    const reg = require_(regPath)
    // A start maga indítja az azonnali kört és visszaadja a Promise-át — ezt
    // várjuk meg (egy párhuzamos második hívás a `running` őrön kimaradna).
    if (engedely) await reg.startAllWriteSyncs('u-1')
    else {
      reg.felfuggesztWriteSyncs()
      await reg.runAllWriteSyncsNow()
    }
    return { hivott, reg }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

{
  const { hivott, reg } = await futtatRegisztert(REG_SRC)
  const hianyzik = PUSHEREK.filter((p) => !hivott.has(p))
  assert(hianyzik.length === 0, `R1 a regiszter mind a 8 push-ert indítja (hiányzik: ${hianyzik.join(', ') || '—'})`)
  assert(
    JSON.stringify(reg.WRITE_SYNC_PUSHEREK) === JSON.stringify(PUSHEREK),
    'R1 a WRITE_SYNC_PUSHEREK lista a 8 ismert push-er',
  )
}
{
  // R1n: a gyermek push-er kivéve a regiszterből
  const mut = REG_SRC.replace(/\n\s*await lepes\('gyerek',[\s\S]*?\)\)\n/, '\n')
  assert(mut !== REG_SRC, 'R1n a mutáció változtatott (fail-closed)')
  const { hivott } = await futtatRegisztert(mut)
  assert(!PUSHEREK.every((p) => hivott.has(p)), 'R1n mutáns (gyerek push-er kivéve) → az őr BUKIK')
}
{
  const { hivott } = await futtatRegisztert(REG_SRC, { engedely: false })
  assert(hivott.size === 0, 'R2 felfüggesztett regiszter (tükör-ellenőrzés alatt) egyetlen push-ert sem indít')
}

// ── O: az orchestrator ─────────────────────────────────────────────────────
const PULL_NEVEK = [
  'pullOwnProfile', 'pullOwnCongregation', 'pullMembersOfOwnCongregation', 'pullFamiliesOfOwnCongregation',
  'pullWorklogOfOwnCongregation', 'pullProgramsOfOwnCongregation', 'pullGyerekOfOwnCongregation',
  'pullRegistryOfOwnCongregation', 'pullInventoryOfOwnCongregation', 'pullFilingOfOwnCongregation',
  'pullMinutesOfOwnCongregation', 'pullCemeteriesOfOwnCongregation', 'pullAnnualReportsOfOwnCongregation',
  'pullAdrlocalityCatalog',
]

async function futtatOrchestratort(orchSrc, forgatokonyv) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-orch-'))
  try {
    fs.writeFileSync(
      path.join(tmp, 'react.js'),
      `exports.useState = () => [null, () => {}]; exports.useEffect = () => {}; exports.useRef = () => ({ current: null }); exports.useCallback = (f) => f;`,
    )
    fs.writeFileSync(path.join(tmp, 'auth-pin.js'), `exports.isOfflineMode = () => global.__orch.offlineMode;`)
    fs.writeFileSync(
      path.join(tmp, 'nevnap-sync.js'),
      `exports.pullNevnapCatalog = async () => { await global.__orch.pull('nevnap'); return { success: true, pulled: 1 }; };`,
    )
    fs.writeFileSync(
      path.join(tmp, 'sync.js'),
      PULL_NEVEK.map((n) => `exports.${n} = async () => global.__orch.pull('${n}');`).join('\n') +
        `\nexports.getLocalOwnProfile = async () => ({ congregation_id: null });`,
    )
    fs.writeFileSync(path.join(tmp, 'verified-session.js'), `exports.getVerifiedSession = async () => global.__orch.session;`)
    // A regiszter VALÓDI (FutoOr, SyncTimeoutError…), csak az időkorlát rövid,
    // hogy a beragadt-pull forgatókönyv (O6) másodpercek alatt lefusson.
    const regReal = path.join(tmp, 'registry-real.cjs')
    fs.writeFileSync(regReal, t(REG_SRC))
    fs.writeFileSync(
      path.join(tmp, 'write-sync-registry.js'),
      `const real = require(${JSON.stringify(regReal)});\n` +
        `module.exports = { ...real, withSyncTimeout: (p, c, ms) => real.withSyncTimeout(p, c, ms ?? ${Number(forgatokonyv.idokorlatMs ?? 60_000)}) };`,
    )
    // A 'react' csupasz modulnév: a temp-könyvtár saját node_modules-ába tesszük.
    fs.mkdirSync(path.join(tmp, 'node_modules', 'react'), { recursive: true })
    fs.copyFileSync(path.join(tmp, 'react.js'), path.join(tmp, 'node_modules', 'react', 'index.js'))
    const orchPath = path.join(tmp, `orch-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`)
    fs.writeFileSync(orchPath, t(orchSrc))
    const hivasok = []
    global.__orch = {
      offlineMode: forgatokonyv.offlineMode ?? false,
      session: forgatokonyv.session,
      pull: (nev) => {
        hivasok.push(nev)
        return forgatokonyv.pull(nev)
      },
    }
    const orch = require_(orchPath)
    const eredmeny = await orch.futtatSzinkronKor('u-1', true)
    return { eredmeny, hivasok, orch }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const NINCS_SESSION = { ok: false, reason: 'no-session', message: 'nincs' }
const VAN_SESSION = { ok: true, session: { user: { id: 'u-1' } } }

{
  const { eredmeny, hivasok } = await futtatOrchestratort(ORCH_SRC, {
    session: NINCS_SESSION,
    offlineMode: true,
    pull: () => ({ pulledRows: 1 }),
  })
  assert(hivasok.length === 0, `O1 session nélkül EGYETLEN pull sem fut (hívások: ${hivasok.length})`)
  assert(eredmeny.state === 'offline-pin', `O1 PIN-módban az állapot 'offline-pin' (kapott: ${eredmeny.state})`)
}
{
  // O1n: a session-őr kikötése — mindig „van session"
  const mut = ORCH_SRC.replace(
    'const verified = await getVerifiedSession()',
    "const verified = { ok: true, session: { user: { id: userId } } } as Awaited<ReturnType<typeof getVerifiedSession>>",
  )
  assert(mut !== ORCH_SRC, 'O1n a mutáció változtatott (fail-closed)')
  const { hivasok } = await futtatOrchestratort(mut, {
    session: NINCS_SESSION,
    offlineMode: true,
    pull: () => ({ pulledRows: 1 }),
  })
  assert(hivasok.length > 0, 'O1n mutáns (session-őr kikötve) → az őr BUKIK (pull-ok session nélkül futottak)')
}
{
  const { eredmeny } = await futtatOrchestratort(ORCH_SRC, {
    session: VAN_SESSION,
    pull: (nev) => Promise.reject(new Error(`bukott: ${nev}`)),
  })
  assert(eredmeny.state === 'error', `O2 minden pull bukik → 'error' (kapott: ${eredmeny.state})`)
  assert(eredmeny.voltSiker === false, 'O2 voltSiker=false → a data-version nem lép')
  assert(
    eredmeny.bukottTablak.length === eredmeny.jelentesek.length && eredmeny.jelentesek.length >= 14,
    `O2 minden tábla a bukottak közt (${eredmeny.bukottTablak.length}/${eredmeny.jelentesek.length})`,
  )
  assert(typeof eredmeny.elsoHiba === 'string' && eredmeny.elsoHiba.startsWith('bukott:'), 'O2 az első hiba szövege visszajön')
}
{
  const { eredmeny } = await futtatOrchestratort(ORCH_SRC, {
    session: VAN_SESSION,
    pull: (nev) =>
      nev === 'pullProgramsOfOwnCongregation' ? Promise.reject(new Error('42501 permission denied')) : { pulledRows: 2 },
  })
  assert(eredmeny.state === 'partial', `O3 egy pull bukik → 'partial' (kapott: ${eredmeny.state})`)
  assert(
    eredmeny.bukottTablak.length === 1 && eredmeny.bukottTablak[0] === 'Programok',
    `O3 a bukott tábla neve: ${eredmeny.bukottTablak.join(', ')}`,
  )
  assert(eredmeny.voltSiker === true, 'O3 részleges sikernél a data-version léphet')
}
{
  const { eredmeny } = await futtatOrchestratort(ORCH_SRC, {
    session: VAN_SESSION,
    pull: (nev) =>
      nev === 'pullInventoryOfOwnCongregation'
        ? { pulledRows: 0, skipped: 'ures-szerver-halmaz', figyelmeztetes: 'Leltár: a szerver 0 sort adott' }
        : { pulledRows: 1 },
  })
  assert(eredmeny.state === 'partial', `O4 a 0-sor-szelep figyelmeztetése 'partial' (kapott: ${eredmeny.state})`)
  assert(eredmeny.bukottTablak.includes('Leltár'), 'O4 a szelep által kihagyott tábla látszik')
}
{
  const { eredmeny, hivasok } = await futtatOrchestratort(ORCH_SRC, {
    session: { ok: true, session: { user: { id: 'MASIK' } } },
    pull: () => ({ pulledRows: 1 }),
  })
  assert(hivasok.length === 0 && eredmeny.state === 'error', 'O5 más fiók sessionje → nincs pull, hangos hiba')
}

// ── H: hiba-osztályozó + visszalépés (a valódi regiszter-modulból) ────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-reg-'))
  const regPath = path.join(tmp, 'reg.cjs')
  fs.writeFileSync(regPath, t(REG_SRC))
  const reg = require_(regPath)
  const o = reg.osztalyozSzinkronHiba
  assert(o(new TypeError('Failed to fetch')) === 'atmeneti', 'H1 TypeError: Failed to fetch → átmeneti')
  assert(o(Object.assign(new Error('x'), { name: 'AbortError' })) === 'atmeneti', 'H1 AbortError → átmeneti')
  assert(o({ status: 503, message: 'Service Unavailable' }) === 'atmeneti', 'H1 503 → átmeneti')
  assert(o({ code: 'PGRST002', message: 'schema cache' }) === 'atmeneti', 'H1 PGRST002 → átmeneti')
  assert(o(new reg.SyncTimeoutError('x', 30000)) === 'atmeneti', 'H1 időtúllépés → átmeneti')
  assert(o({ code: '23505', message: 'duplicate key' }) === 'vegleges', 'H1 23505 → végleges')
  assert(o({ code: '42501', message: 'permission denied' }) === 'vegleges', 'H1 42501 → végleges')
  assert(o({ status: 400, message: 'Bad Request' }) === 'vegleges', 'H1 400 → végleges')
  assert(o(new Error('conflict: a szerver-oldali revision eltér')) === 'vegleges', 'H1 revision-ütközés → végleges')
  assert(o(new Error('érvénytelen JSON payload')) === 'vegleges', 'H1 érvénytelen JSON → végleges')
  assert(o({ code: '23505', message: 'network timeout while inserting' }) === 'vegleges', 'H1 23505 hálózati szöveggel is végleges')

  assert(reg.OUTBOX_MAX_PROBA === 5, 'H2 5 próba a plafon')
  assert(reg.outboxBackoffMs(1) === 30_000 && reg.outboxBackoffMs(5) === 480_000 && reg.outboxBackoffMs(9) === 480_000, 'H2 visszalépés 30 mp → 8 perc (plafonnal)')
  const now = Date.parse('2026-09-05T10:00:00.000Z')
  assert(reg.outboxUjraprobalhato({ retry_count: 0, last_attempt_at: null }, now) === true, 'H2 első próba azonnal')
  assert(reg.outboxUjraprobalhato({ retry_count: 1, last_attempt_at: '2026-09-05T09:59:45.000Z' }, now) === false, 'H2 15 mp után még nem (30 mp a visszalépés)')
  assert(reg.outboxUjraprobalhato({ retry_count: 1, last_attempt_at: '2026-09-05T09:59:20.000Z' }, now) === true, 'H2 40 mp után igen')
  assert(reg.outboxUjraprobalhato({ retry_count: 4, last_attempt_at: '2026-09-05T09:57:00.000Z' }, now) === false, 'H2 4. kudarc után 4 perc kell (3 perc nem elég)')
  fs.rmSync(tmp, { recursive: true, force: true })
}

/** A processOutboxInner catch-ágának forrás-őre. */
function outboxCatchOr(syncSrc) {
  const src = stripComments(syncSrc)
  const s = src.indexOf('async function processOutboxInner(')
  const e = src.indexOf('function destructureUpdatePayload(', s)
  if (s < 0 || e < 0) return ['processOutboxInner / destructureUpdatePayload nem található']
  const body = src.slice(s, e)
  const hibak = []
  // A döntés PONTOS alakja: átmeneti ÉS a plafon alatt → markOutboxAttempt
  // (a pending marad). Egy „mindig failed" mutáns ezt a feltételt veszti el.
  if (!/if \(osztalyozSzinkronHiba\(err\) === 'atmeneti' && probak < OUTBOX_MAX_PROBA\) \{\s*await markOutboxAttempt\(/.test(body)) {
    hibak.push('a catch-ág nem az osztályozó + plafon alapján tartja pending-ben a sort (markOutboxAttempt)')
  }
  if (!/OUTBOX_MAX_PROBA/.test(body)) hibak.push('nincs próba-plafon')
  if (!/outboxUjraprobalhato\(/.test(body)) hibak.push('nincs visszalépés-szűrő a pending sorokon')
  return hibak
}
{
  const hibak = outboxCatchOr(SYNC_SRC)
  assert(hibak.length === 0, `H3 processOutbox: átmeneti hiba → pending marad (${hibak.join('; ') || 'rendben'})`)
  const mut = SYNC_SRC.replace("osztalyozSzinkronHiba(err) === 'atmeneti' && probak < OUTBOX_MAX_PROBA", 'false')
  assert(mut !== SYNC_SRC, 'H3n a mutáció változtatott (fail-closed)')
  assert(outboxCatchOr(mut).length > 0, 'H3n mutáns (a catch mindig failed) → az őr BUKIK')
}

// ── S: 0-sor-szelep ────────────────────────────────────────────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-reg2-'))
  const regPath = path.join(tmp, 'reg.cjs')
  fs.writeFileSync(regPath, t(REG_SRC))
  const reg = require_(regPath)
  assert(reg.szelepDontes({ szerverSorok: 0, lokalisSorok: 5 }) === 'kihagy', 'S1 szerver 0 + helyi 5 → kihagy')
  assert(reg.szelepDontes({ szerverSorok: 0, lokalisSorok: 0 }) === 'csere', 'S1 szerver 0 + helyi 0 → csere')
  assert(reg.szelepDontes({ szerverSorok: 3, lokalisSorok: 5 }) === 'csere', 'S1 szerver 3 → csere')
  assert(reg.szelepDontes({ szerverSorok: 0, lokalisSorok: 5, igazoltanUres: true }) === 'csere', 'S1 igazoltan üres → csere')
  fs.rmSync(tmp, { recursive: true, force: true })
}

const CSERES_PULLOK = [
  'pullRegistryOfOwnCongregation', 'pullInventoryOfOwnCongregation', 'pullFilingOfOwnCongregation',
  'pullMinutesOfOwnCongregation', 'pullCemeteriesOfOwnCongregation', 'pullProgramsOfOwnCongregation',
  'pullAnnualReportsOfOwnCongregation', 'pullAdrlocalityCatalog',
]
function pullTorzs(src, nev) {
  const s = src.indexOf(`export async function ${nev}(`)
  if (s < 0) return null
  const e = src.indexOf('\nexport ', s + 10)
  return src.slice(s, e < 0 ? undefined : e)
}
function szelepOr(syncSrc) {
  const src = stripComments(syncSrc)
  const hibak = []
  if (!/async function tukorCsereSzelep\(/.test(src)) hibak.push('nincs tukorCsereSzelep')
  if (!/szelepDontes\(/.test(src)) hibak.push('a szelep nem a közös szelepDontes-t hívja')
  for (const nev of CSERES_PULLOK) {
    const body = pullTorzs(src, nev)
    if (!body) {
      hibak.push(`${nev} nem található`)
      continue
    }
    const sz = body.indexOf('tukorCsereSzelep(')
    const del = body.search(/DELETE FROM/)
    if (sz < 0) hibak.push(`${nev}: nincs szelep`)
    else if (del >= 0 && del < sz) hibak.push(`${nev}: a DELETE a szelep ELŐTT fut`)
    if (!/skipped: 'ures-szerver-halmaz'/.test(body)) hibak.push(`${nev}: a kihagyás nem jelent (skipped)`)
  }
  return hibak
}
{
  const hibak = szelepOr(SYNC_SRC)
  assert(hibak.length === 0, `S2 a 8 teljes-cserés pull szelepe a DELETE előtt áll (${hibak.join('; ') || 'rendben'})`)
  const body = pullTorzs(SYNC_SRC, 'pullProgramsOfOwnCongregation')
  const mut = SYNC_SRC.replace(body, body.replace('tukorCsereSzelep(', 'tukorCsereSzelep_KIKAPCSOLVA('))
  assert(mut !== SYNC_SRC, 'S2n a mutáció változtatott (fail-closed)')
  assert(szelepOr(mut).length > 0, 'S2n mutáns (programok szelepe kikötve) → az őr BUKIK')
}

// ── S3: a tag-upsert kapuja VALÓDI SQLite-on (node:sqlite, ha elérhető) ───
{
  let DatabaseSync = null
  try {
    ;({ DatabaseSync } = require_('node:sqlite'))
  } catch {
    DatabaseSync = null
  }
  const m = SYNC_SRC.match(/const MEMBER_UPSERT_SQL = `([\s\S]*?)`\n/)
  assert(Boolean(m), 'S3 a MEMBER_UPSERT_SQL konstans megtalálható')
  if (!DatabaseSync) {
    console.log('S3 kihagyva: node:sqlite nem elérhető ebben a Node-ban (nem hiba).')
  } else if (m) {
    const sql = m[1]
    const oszlopok = sql.match(/INSERT INTO szemely_local\s*\(([\s\S]*?)\)\s*VALUES/)[1]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    const db = new DatabaseSync(':memory:')
    db.exec(
      `CREATE TABLE szemely_local (${oszlopok.map((c) => (c === 'id' ? 'id INTEGER PRIMARY KEY' : `${c} TEXT`)).join(', ')});
       CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT, target_table TEXT, target_id TEXT,
         payload TEXT, status TEXT DEFAULT 'pending', mutation_id TEXT, created_at TEXT, retry_count INTEGER DEFAULT 0, last_error TEXT);
       INSERT INTO szemely_local (id, k_nev, revision) VALUES (1, 'helyi-modositas', '3');
       INSERT INTO szemely_local (id, k_nev, revision) VALUES (2, 'regi', '1');
       INSERT INTO outbox (op, target_table, target_id, payload, status) VALUES ('update', 'szemely', '1', '{}', 'pending');`,
    )
    const paramSzam = (sql.match(/\?\d+/g) ?? []).map((p) => Number(p.slice(1))).reduce((a, b) => Math.max(a, b), 0)
    const params = (id, kNev) => {
      const arr = new Array(paramSzam).fill(null)
      arr[0] = id
      arr[oszlopok.indexOf('k_nev')] = kNev
      return arr
    }
    const st = db.prepare(sql)
    st.run(...params(1, 'szerver'))
    st.run(...params(2, 'szerver'))
    st.run(...params(3, 'uj'))
    const sorok = db.prepare('SELECT id, k_nev FROM szemely_local ORDER BY id').all()
    assert(sorok[0].k_nev === 'helyi-modositas', 'S3 függő outbox-sor mellett a helyi módosítás MARAD (a pull nem írja felül)')
    assert(sorok[1].k_nev === 'szerver', 'S3 függő sor nélkül a szerver-változat frissít')
    assert(sorok.length === 3 && sorok[2].k_nev === 'uj', 'S3 az új szerver-sor beszúródik')
    db.close()
  }
}

// ── G: az AuthGate forrás-őrei ─────────────────────────────────────────────
function gateOr(gateSrc) {
  const src = stripComments(gateSrc)
  const hibak = []
  if (!/profil\.status === 'active'/.test(src) || !/'blokkolt'/.test(src)) hibak.push('nincs státusz-kapu (profiles_local.status)')
  if (!/startAllWriteSyncs\(/.test(src)) hibak.push('a push-ereket nem a regiszter indítja')
  if (!/felfuggesztWriteSyncs\(\)/.test(src)) hibak.push('session-váltáskor nincs push-er felfüggesztés (desk-sync-20)')
  if (!/HAS_PIN_TIMEOUT_MS/.test(src) || !/Promise\.race\(\[\s*hasPin\(\)/.test(src)) hibak.push('a hasPin IPC időkorlát nélkül vár')
  if (!/mfa\.listFactors\(\)/.test(src)) hibak.push('a 2FA-döntés nem a szerver faktor-listájából jön')
  if (!/megerositesKell/.test(src)) hibak.push('a tükör-váltás függő-sor döntése hiányzik')
  const so = src.indexOf("if (event === 'SIGNED_OUT') {")
  const soVege = src.indexOf('subscription.unsubscribe', so)
  const soBlokk = so >= 0 ? src.slice(so, soVege) : ''
  if (!soBlokk) hibak.push('nincs SIGNED_OUT ág')
  else {
    const exp = soBlokk.indexOf('explicitKijelentkezesVolt()')
    const clr = soBlokk.indexOf('clearLastUser()')
    if (exp < 0 || clr < 0 || exp > clr) hibak.push('a SIGNED_OUT ág feltétel nélkül törli a lastUser-t (a lejárt refresh explicit kijelentkezésnek számít)')
  }
  if (/<Navigate to="\/login"/.test(src) && !/mfaSzukseges === true/.test(src)) hibak.push('a /login-ra terelés nem csak az MFA-ág')
  return hibak
}
{
  const hibak = gateOr(GATE_SRC)
  assert(hibak.length === 0, `G1 auth-gate: státusz-kapu + regiszter + időkorlátok + passzív SIGNED_OUT (${hibak.join('; ') || 'rendben'})`)
  const m1 = GATE_SRC.replace("profil.status === 'active'", 'true')
  assert(m1 !== GATE_SRC && gateOr(m1).length > 0, 'G1n/a mutáns (státusz-kapu kiütve) → az őr BUKIK')
  const m2 = GATE_SRC.replace(/startAllWriteSyncs\(/g, 'startAllWriteSyncs_KIKAPCSOLVA(')
  assert(m2 !== GATE_SRC && gateOr(m2).length > 0, 'G1n/b mutáns (regiszter-indítás kiütve) → az őr BUKIK')
  const m3 = GATE_SRC.replace('if (explicitKijelentkezesVolt()) {', 'if (true) {')
  assert(m3 !== GATE_SRC && gateOr(m3).length > 0, 'G1n/c mutáns (a passzív SIGNED_OUT is töröl) → az őr BUKIK')
}

// ── F: FutoOr — a futás-őr a regiszter VALÓDI osztályából ─────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-futoor-'))
  const regPath = path.join(tmp, 'reg.cjs')
  fs.writeFileSync(regPath, t(REG_SRC))
  const reg = require_(regPath)
  fs.rmSync(tmp, { recursive: true, force: true })
  const tick = () => new Promise((r) => setTimeout(r, 5))

  let inditasok = 0
  let resolveLassu = null
  const lassu = new Promise((r) => {
    resolveLassu = r
  })
  let kesz = null
  const or = new reg.FutoOr()
  const p1 = or.futtat(() => {
    inditasok += 1
    return lassu
  }, (v) => {
    kesz = v
  })
  const p2 = or.futtat(() => {
    inditasok += 1
    return lassu
  })
  assert(p1 === p2 && inditasok === 1 && or.fut === true, 'F1 futó példány mellett a második hívás UGYANAZT az ígéretet kapja, nem indít újat')

  let idotullepes = false
  try {
    await reg.withSyncTimeout(p1, 'próba', 20)
  } catch (e) {
    idotullepes = e instanceof reg.SyncTimeoutError
  }
  assert(idotullepes && or.fut === true, 'F2 időtúllépés után a hívó hibát kap, de az őr TARTJA a futást (fut=true)')
  const p3 = or.futtat(() => {
    inditasok += 1
    return lassu
  })
  assert(p3 === p1 && inditasok === 1, 'F2b időtúllépés UTÁN sem indul új példány')

  resolveLassu(42)
  await p1
  await tick()
  assert(or.fut === false && kesz === 42, 'F2c a TÉNYLEGES befejezés oldja az őrt, és az onKesz a valódi eredményt kapja')

  const or2 = new reg.FutoOr()
  const pHiba = or2.futtat(() => Promise.reject(new Error('x')))
  await pHiba.catch(() => {})
  await tick()
  assert(or2.fut === false, 'F3 a hibával záruló futás is oldja az őrt (nem ragad be)')
}

// ── P: a tag-push-er FUTTATVA — beragadt insert, rövid időkorlát ───────────
const SZEMELY_SRC = fs.readFileSync(path.join(LIB, 'szemely-write-sync.ts'), 'utf8')

// A push-erek `!navigator.onLine`-t néznek; a Node navigator-án nincs onLine →
// hamisan „offline". A tesztben online gépet szimulálunk.
try {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true })
} catch {
  /* régebbi Node: nincs navigator → az őr átenged */
}

/** A szemely-write-sync betöltése ADOTT forrással; a beszúrás addig „beragad", amíg a teszt fel nem oldja. */
async function futtatSzemelyPushert(src, nev) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-szemely-${nev}-`))
  const kulcs = `__szemely_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const allapot = {
    insertHivasok: 0,
    pending: [{ id: 1, sync_state: 'pending', retry_count: 0, last_attempt_at: null }],
    synced: [],
    resolveInsert: null,
  }
  global[kulcs] = allapot
  try {
    fs.writeFileSync(
      path.join(tmp, 'supabase.js'),
      `const a = () => global['${kulcs}'];
exports.getDesktopSupabase = () => ({
  from: () => ({ insert: () => ({ select: () => ({ maybeSingle: () => {
    a().insertHivasok += 1;
    return new Promise((res) => { a().resolveInsert = res });
  } }) }) }),
});`,
    )
    fs.writeFileSync(
      path.join(tmp, 'tauri-sqlite-backend.js'),
      `const a = () => global['${kulcs}'];
exports.getTauriSqliteBackend = () => ({
  listLocalPendingSzemely: async () => a().pending,
  getLocalPendingSzemely: async (id) => ({ id, k_nev: 'Próba', cnp: null }),
  markSzemelySynced: async (id, sid) => { a().synced.push([id, sid]); a().pending = a().pending.filter((r) => r.id !== id); },
  updateSzemelyAttempt: async () => {},
  markSzemelyConflict: async () => {},
});`,
    )
    fs.writeFileSync(
      path.join(tmp, 'verified-session.js'),
      `exports.getVerifiedSession = async () => ({ ok: true, session: { user: { id: 'u-1' } } });`,
    )
    const regReal = path.join(tmp, 'registry-real.cjs')
    fs.writeFileSync(regReal, t(REG_SRC))
    fs.writeFileSync(
      path.join(tmp, 'write-sync-registry.js'),
      `const real = require(${JSON.stringify(regReal)});\n` +
        `module.exports = { ...real, withSyncTimeout: (p, c, ms = 30) => real.withSyncTimeout(p, c, ms) };`,
    )
    const modPath = path.join(tmp, `szemely-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`)
    fs.writeFileSync(modPath, t(src))
    const mod = require_(modPath)
    return { mod, allapot }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

{
  const { mod, allapot } = await futtatSzemelyPushert(SZEMELY_SRC, 'eredeti')
  // 1. kör: a beszúrás beragad → 30 ms-os időkorlát → a hívó visszakapja a kezét.
  await mod.runSzemelySyncGuarded('gy-1')
  assert(allapot.insertHivasok === 1, 'P1a az első kör elindította a beszúrást')
  assert(mod.getSzemelySyncStatus().running === true, 'P1b időtúllépés után az őr TARTJA a futást (running=true)')
  // 2. kör (30 mp-es poll / online / lokális mentés) + kézi kör: NEM indul új beszúrás.
  await mod.runSzemelySyncGuarded('gy-1')
  let keziIdotullepes = false
  try {
    await mod.runSzemelySyncManually('gy-1')
  } catch (e) {
    keziIdotullepes = /időtúllépés/.test(String(e && e.message))
  }
  assert(allapot.insertHivasok === 1, 'P1 a második és a kézi kör NEM küldi fel újra ugyanazt a pending sort (nincs duplikált tag)')
  assert(keziIdotullepes, 'P1c a kézi kör időtúllépést JELENT (nem néma), de nem indít új beszúrást')
  // A szerver végre válaszol → a sor synced, az őr old, az eredmény-cache frissül.
  allapot.resolveInsert({ data: { id: 501 }, error: null })
  await new Promise((r) => setTimeout(r, 20))
  assert(allapot.synced.length === 1 && allapot.synced[0][1] === 501, 'P1d a kései szerver-válasz a sort synced-re állítja (server_id=501)')
  assert(mod.getSzemelySyncStatus().running === false, 'P1e a TÉNYLEGES befejezés oldja az őrt')
  assert(mod.getSzemelySyncStatus().lastResult?.succeeded === 1, 'P1f az eredmény-cache a valódi végén frissül (succeeded=1)')
}
{
  // P1n: az őr NEM a tényleges véghez kötve (a régi világ: a finally az időkorlátnál oldott)
  const mut = SZEMELY_SRC.replace('return futoOr.futtat(', 'return ((indit) => indit())(')
  assert(mut !== SZEMELY_SRC, 'P1n a mutáció változtatott (fail-closed)')
  const { mod, allapot } = await futtatSzemelyPushert(mut, 'mutans')
  await mod.runSzemelySyncGuarded('gy-1')
  await mod.runSzemelySyncGuarded('gy-1')
  assert(allapot.insertHivasok >= 2, 'P1n mutáns (az őr az időkorlátnál felszabadul) → az őr BUKIK (a sor kétszer megy fel)')
  if (allapot.resolveInsert) allapot.resolveInsert({ data: { id: 1 }, error: null })
}

// ── P2: forrás-őr mind a 7 push-erre + az orchestrator pull-jaira ─────────
const PUSHER_FAJLOK = [
  'chitanta-sync.ts',
  'befizetes-write-sync.ts',
  'kiadas-write-sync.ts',
  'szemely-write-sync.ts',
  'csalad-write-sync.ts',
  'gyerek-write-sync.ts',
  'excel-write-sync.ts',
]
function pusherOr(src) {
  const s = stripComments(src)
  const hibak = []
  if (!/new FutoOr</.test(s)) hibak.push('nincs FutoOr')
  if (/let inFlight\b/.test(s)) hibak.push('régi inFlight jelző')
  if (/finally\s*\{\s*inFlight = false/.test(s)) hibak.push('az őrt a finally oldja (időkorlátnál is)')
  if (!/if \(futoOr\.fut\) return/.test(s)) hibak.push('a guarded kör nem a FutoOr-t nézi')
  if (!/withSyncTimeout\(indit(Push|Kor)\(/.test(s)) hibak.push('a kör nem a megosztott indítón át fut')
  return hibak
}
{
  const osszes = []
  for (const f of PUSHER_FAJLOK) {
    const hibak = pusherOr(fs.readFileSync(path.join(LIB, f), 'utf8'))
    if (hibak.length) osszes.push(`${f}: ${hibak.join(', ')}`)
  }
  assert(osszes.length === 0, `P2 mind a 7 push-er őre a tényleges befejezéshez kötött (${osszes.join('; ') || 'rendben'})`)
  const orchTiszta = stripComments(ORCH_SRC)
  assert(
    /new Map<string, FutoOr</.test(orchTiszta) && /withSyncTimeout\(or\.futtat\(fn\)/.test(orchTiszta),
    'P2b az orchestrator pull-jai kulcsonként FutoOr-ral futnak (nincs párhuzamos TRUNCATE+INSERT)',
  )
  const mut = SZEMELY_SRC.replace('const futoOr = new FutoOr<SzemelyPushResult>()', 'let inFlight = false')
  assert(mut !== SZEMELY_SRC && pusherOr(mut).length > 0, 'P2n mutáns (FutoOr helyett inFlight jelző) → az őr BUKIK')
}

// ── O6: beragadt pull — a következő kör NEM indít párhuzamosat ───────────
{
  let resolveLeltar = null
  // Az ELSŐ leltár-pull ragad be (a szerver késik); a lezárás után indított
  // következő már rendesen válaszol.
  let leltarBeragad = true
  const LELTAR = 'pullInventoryOfOwnCongregation'
  const { eredmeny, hivasok, orch } = await futtatOrchestratort(ORCH_SRC, {
    session: VAN_SESSION,
    idokorlatMs: 30,
    pull: (nev) =>
      nev === LELTAR && leltarBeragad
        ? new Promise((r) => {
            resolveLeltar = r
          })
        : { pulledRows: 1 },
  })
  const leltarHivasok = () => hivasok.filter((n) => n === LELTAR).length
  assert(
    eredmeny.state === 'partial' && eredmeny.bukottTablak.includes('Leltár') && /időtúllépés/.test(eredmeny.elsoHiba ?? ''),
    `O6a a beragadt leltár-pull időtúllépést jelent (kapott: ${eredmeny.state}, ${eredmeny.elsoHiba})`,
  )
  const masodik = await orch.futtatSzinkronKor('u-1', true)
  assert(leltarHivasok() === 1, `O6 a második kör NEM indít párhuzamos leltár-pullt — a futóra csatlakozik (hívások: ${leltarHivasok()})`)
  assert(masodik.bukottTablak.includes('Leltár'), 'O6b a második kör is időtúllépést jelent, amíg a régi pull fut')
  leltarBeragad = false
  resolveLeltar({ pulledRows: 7 })
  await new Promise((r) => setTimeout(r, 10))
  const harmadik = await orch.futtatSzinkronKor('u-1', true)
  assert(
    leltarHivasok() === 2 && harmadik.state === 'success',
    `O6c a lezárult pull után a következő kör újat indít, és sikeres (hívások: ${leltarHivasok()}, állapot: ${harmadik.state})`,
  )
}

console.log('')
if (failedCount > 0) {
  console.error(`${failedCount}/${total} teszt HIBÁS`)
  process.exit(1)
}
console.log(`${total}/${total} teszt zöld — desktop szinkron rendben`)
process.exit(0)
