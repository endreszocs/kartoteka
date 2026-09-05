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

// ═══════════════════════════════════════════════════════════════════════════
// 2026-09-05 — P3-UTÓMUNKA (desk-p3)
//
// ⛔ MI VOLT A HIBA
//   (1) a kijelentkezés csak a PIN-t / lastUser-t törölte — a regiszter 30 mp-es
//       pollja, `online` listenere és a ketyegő 1,5 mp-es összevonó időzítő az
//       ELŐZŐ felhasználóé maradt, és a következő belépő alatt is futott;
//   (2) az ONLINE mentések (profil, munkanapló, tag) a tükröt frissítették, de a
//       regiszter összevont körét NEM indították — csak az offline/outbox ág;
//   (3) a helyi közelgő programok `datum >= ma` szűrője a MÁR ELKEZDŐDÖTT
//       többnapos alkalmat (szabadság) kidobta, a tükör nem ismerte az
//       ismetlodes_vege / publikus / anyakönyv-kapcsolat oszlopokat, és a
//       program-típusok címkéi/színei a desktopon két helyen, a webtől
//       függetlenül éltek.
//
// ŐRSZEMEK
//   R3   stopAllWriteSyncs FUTTATVA: engedély null, online-listener levéve,
//        összevonó időzítő törölve, a következő kör NEM indít push-ert; utána a
//        start tiszta lapról újraindít (listener nem duplázódik)
//   R3n  két mutáns (engedély marad / listener marad) → BUKIK
//   R4   forrás-őr: a 4 kijelentkezési út (shell, AuthGate kilépés, varázsló
//        „másik fiók", visszavont eszköz) a signOut ELŐTT hívja
//   R4n  mutáns (a shell nem hívja) → BUKIK
//   N1   forrás-őr: az 5 online mentési ág (profil, munkanapló ×3, tag) a siker
//        után notifyLocalWriteCommitted-et hív; az offline ág NEM duplázik
//   N1n  mutáns (a tag-ág jelzése kivéve) → BUKIK
//   PR1  program-tipusok ⇄ webes constants/dashboard.ts: 21 típus, 5 magán, 4
//        anyakönyvi BETŰRE azonos; magán típuson a nyilvános jelölés SOHA nem
//        igaz (funkcionális); a fájlban NINCS címke/emoji/szín térkép (bíráló P3,
//        2026-09-05: a harmadik, senki által nem olvasott másolat törölve — a
//        rajzoló forrás az ui-app UpcomingPrograms, azt a PR1f méri)
//   PR1n három mutáns (a desktop magán-listája eltér / a web bővül / egy térkép
//        visszakerül a fájlba) → BUKIK
//   PR1f (ellenőrzés-ügynök) az ui-app UpcomingPrograms NEM exportált címke/szín-
//        tükre is a webes dashboard.ts-hez MÉRT (kulcs-sorrend + érték); PR1fn két
//        mutáns (ui-app címke eltér / a web bővül) → BUKIK
//   PR2  (node:sqlite) a db.rs CREATE + v28/v31/v34 ALTER-ek lefutnak; a pull
//        INSERT 27 oszlopa bemegy; az ÉLŐ kezdőlap-út FUTTATVA (getLocalPrograms
//        SQL + az ui-app expandUpcomingProgramOccurrences kibontója, rögzített
//        órával — a kezdőlap év-választása és id-dedupja tükrözve): jan. 2-án az
//        ELŐZŐ ÉV dec. 27-én kezdődő, jan. 5-ig tartó szabadság LÁTSZIK (bíráló
//        P2), a magán típus látszik, a novemberben indult HETI sorozat januári
//        alkalmai látszanak, a távoli / szilveszterkor lejárt / lezárt sorozat
//        kimarad, a teljesített marad (áthúzva); dec. 25-én az évhatáron átnyúló
//        alkalom és a sorozat alkalmai EGYSZER szerepelnek (id-dedup); a magán
//        sor publikus-a a tükörben 0, a ragadt 1-et az olvasás normalizálja
//   PR2n három mutáns (a régi `datum >= év-01-01` év-szűrő / a kibontó a KEZDŐ
//        napra szűr / a kezdőlap nem dedupál) → BUKIK
//   PR2j forrás-őr: a SQL-oldali második ablak-szabály (getLocalUpcomingPrograms,
//        hívó nélkül) NINCS többé a sync.ts-ben; PR2jn mutáns (visszakerül) → BUKIK
//   PR3  forrás-őr: a pull a publikus-t a szabályon át írja, az olvasó normalizál
//        és a közös oszloplistából olvas, a kezdőlap átadja az ismetlodes_vege-t,
//        évhatárnál a következő évet is kéri és id szerint dedupál; PR3n két
//        mutáns (nyers publikus / nincs dedup) → BUKIK
//   PR4  (bíráló P2, cal-print-11 desktop-paritás, 2026-09-05) a getLocalPrograms
//        év-szűrője az INTERVALLUM METSZETE — datum ≤ év vége ÉS (datum_vege VAGY
//        datum) ≥ év eleje — a webes program-ev-metszet.ts tükre, PLUSZ a korábbi
//        években indult ISMÉTLŐDŐ sorozatok (5 évre vissza — a webes
//        getProgramsForYear második lekérdezésének tükre, ami a desktopról eddig
//        hiányzott). (node:sqlite) FUTTATVA: a dec. 30. – jan. 2. tábor januárban
//        LÁTSZIK, az előző évi egynapos és a hibás (kezdő előtti) záró napú sor
//        nem; a NEM-COALESCE ok (a kezdő nap utáni hibás záró napnál a kezdő dönt)
//        is mérve; a 2030-ban indult heti sorozat 2031-ben LÁTSZIK, a 6+ éve
//        indult és a régi nem-ismétlődő sor nem
//   PR4n mutáns (a régi `datum >= év-01-01` alak) → a tábor eltűnik → BUKIK;
//        PR4nc mutáns (COALESCE-alak) → a webtől eltér → BUKIK; PR4nr mutáns (a
//        sorozat-ág kivéve) → a heti sorozat eltűnik → BUKIK
//   PR4s forrás-őr ugyanerre (node:sqlite nélkül is él); PR4sn / PR4sn/b / PR4sn/c
//        mutánsok → BUKIK
// ═══════════════════════════════════════════════════════════════════════════

/** A regiszter betöltése ADOTT forrással, a tmp-mappa MEGTARTÁSÁVAL (a dinamikus importok végig élnek). */
function betoltRegisztert(regSrc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-stop-'))
  const hivott = new Set()
  const kulcs = `__hivott_${Date.now()}_${Math.random().toString(36).slice(2)}`
  global[kulcs] = hivott
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
    stub('outbox', ['processOutbox', 'runOutboxSyncGuarded']) + `\nexports.getLocalOwnProfile = async () => ({ congregation_id: 'gy-1' });`,
  )
  const regPath = path.join(tmp, `registry-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`)
  fs.writeFileSync(regPath, t(regSrc))
  const reg = require_(regPath)
  return { reg, hivott, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) }
}

/**
 * Az R3 forgatókönyv ADOTT regiszter-forrással: start → stop → „most" kör →
 * újrastart. Rögzített window (a listener-számot méri) és ál-időzítők (a
 * függő összevonó időzítőt méri) — determinisztikus, nem vár 1,5 mp-et.
 */
async function stopForgatokonyv(regSrc) {
  const eredetiWindow = globalThis.window
  const eredetiSetTimeout = globalThis.setTimeout
  const eredetiClearTimeout = globalThis.clearTimeout
  const eredetiSetInterval = globalThis.setInterval
  const eredetiClearInterval = globalThis.clearInterval
  const listenerek = new Map()
  const idozitok = new Map()
  const intervalok = new Set()
  let kovId = 1
  globalThis.window = {
    addEventListener(nev, fn) {
      listenerek.set(nev, [...(listenerek.get(nev) ?? []), fn])
    },
    removeEventListener(nev, fn) {
      listenerek.set(nev, (listenerek.get(nev) ?? []).filter((f) => f !== fn))
    },
    dispatchEvent() {},
  }
  // Csak a regiszter modul-példánya látja az ál-időzítőket (a betöltés a csere
  // ALATT történik; a `tick` segédünk az eredeti setTimeout-ot használja).
  globalThis.setTimeout = (fn, ms) => {
    const id = kovId++
    idozitok.set(id, { fn, ms })
    return id
  }
  globalThis.clearTimeout = (id) => {
    idozitok.delete(id)
  }
  globalThis.setInterval = (fn, ms) => {
    const id = kovId++
    intervalok.add(id)
    return id
  }
  globalThis.clearInterval = (id) => {
    intervalok.delete(id)
  }
  const { reg, hivott, cleanup } = betoltRegisztert(regSrc)
  const tick = () => new Promise((r) => eredetiSetTimeout(r, 5))
  try {
    await reg.startAllWriteSyncs('u-1')
    const indulas = {
      pusherek: hivott.size,
      listener: (listenerek.get('online') ?? []).length,
      interval: intervalok.size,
      engedely: reg.getWriteSyncRegistryStatus().engedelyezettUserId,
    }
    // Egy lokális mentés jelzése — a debounce időzítő felfegyverkezik…
    reg.notifyLocalWriteCommitted()
    const fuggoIdozitoStopElott = idozitok.size
    // …majd KIJELENTKEZÉS.
    reg.stopAllWriteSyncs()
    const stopUtan = {
      engedely: reg.getWriteSyncRegistryStatus().engedelyezettUserId,
      listener: (listenerek.get('online') ?? []).length,
      interval: intervalok.size,
      fuggoIdozito: idozitok.size,
    }
    // A még függő (ál-)időzítőket elsütjük — a törölt debounce nem futhat.
    for (const { fn } of [...idozitok.values()]) fn()
    idozitok.clear()
    hivott.clear()
    await reg.runAllWriteSyncsNow()
    await tick()
    const stopUtanPusherek = hivott.size
    // Újrastart tiszta lapról (a következő belépő).
    hivott.clear()
    await reg.startAllWriteSyncs('u-2')
    const ujra = {
      pusherek: hivott.size,
      listener: (listenerek.get('online') ?? []).length,
      interval: intervalok.size,
      engedely: reg.getWriteSyncRegistryStatus().engedelyezettUserId,
    }
    return { indulas, fuggoIdozitoStopElott, stopUtan, stopUtanPusherek, ujra }
  } finally {
    globalThis.window = eredetiWindow
    globalThis.setTimeout = eredetiSetTimeout
    globalThis.clearTimeout = eredetiClearTimeout
    globalThis.setInterval = eredetiSetInterval
    globalThis.clearInterval = eredetiClearInterval
    cleanup()
  }
}

function stopRendben(r) {
  const hibak = []
  if (r.indulas.pusherek !== 8) hibak.push(`induláskor ${r.indulas.pusherek}/8 push-er`)
  if (r.indulas.listener !== 1 || r.indulas.interval !== 1) hibak.push('induláskor nincs 1 listener + 1 poll')
  if (r.fuggoIdozitoStopElott !== 1) hibak.push(`a notify után ${r.fuggoIdozitoStopElott} függő időzítő (1 kell)`)
  if (r.stopUtan.engedely !== null) hibak.push('stop után az engedély megmaradt')
  if (r.stopUtan.listener !== 0) hibak.push('stop után az online-listener fent maradt')
  if (r.stopUtan.interval !== 0) hibak.push('stop után a poll fut tovább')
  if (r.stopUtan.fuggoIdozito !== 0) hibak.push('stop után az összevonó időzítő nem törlődött')
  if (r.stopUtanPusherek !== 0) hibak.push(`stop után a „most" kör ${r.stopUtanPusherek} push-ert indított`)
  if (r.ujra.pusherek !== 8 || r.ujra.engedely !== 'u-2') hibak.push('újrastart után nem indul mind a 8 push-er az új usernek')
  if (r.ujra.listener !== 1 || r.ujra.interval !== 1) hibak.push(`újrastart után ${r.ujra.listener} listener / ${r.ujra.interval} poll (1/1 kell)`)
  return hibak
}

{
  const r = await stopForgatokonyv(REG_SRC)
  const hibak = stopRendben(r)
  assert(hibak.length === 0, `R3 stopAllWriteSyncs: engedély null + listener le + poll le + időzítő törölve + a kör üres + tiszta újrastart (${hibak.join('; ') || 'rendben'})`)

  // R3n/a — az engedély megmarad (csak a triggerek mennek le)
  const mutA = REG_SRC.replace(/export function stopAllWriteSyncs\(\): void \{\n  engedelyezettUserId = null\n/, 'export function stopAllWriteSyncs(): void {\n')
  assert(mutA !== REG_SRC, 'R3n/a a mutáció változtatott (fail-closed)')
  assert(stopRendben(await stopForgatokonyv(mutA)).length > 0, 'R3n/a mutáns (az engedély megmarad a stop után) → az őr BUKIK')

  // R3n/b — a listener fent marad
  const mutB = REG_SRC.replace(/\n  if \(onlineListener && typeof window !== 'undefined'\) \{\n    window\.removeEventListener\('online', onlineListener\)\n  \}\n/, '\n')
  assert(mutB !== REG_SRC, 'R3n/b a mutáció változtatott (fail-closed)')
  assert(stopRendben(await stopForgatokonyv(mutB)).length > 0, 'R3n/b mutáns (az online-listener fent marad) → az őr BUKIK')
}

// ── R4: a kijelentkezési utak a signOut ELŐTT állítják le a push-ereket ────
const SHELL_SRC = fs.readFileSync(path.join(LIB, 'shell', 'desktop-shell.tsx'), 'utf8')
const WIZARD_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src', 'pages', 'elso-inditas-page.tsx'), 'utf8')
const DASH_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src', 'pages', 'dashboard-page.tsx'), 'utf8')

/** A `kezdet` mintától az első `auth.signOut(` hívásig terjedő szakaszban van-e stopAllWriteSyncs()? */
function stopASignOutElott(src, kezdet) {
  const s = stripComments(src)
  const i = s.indexOf(kezdet)
  if (i < 0) return `nincs meg: ${kezdet}`
  const j = s.indexOf('auth.signOut(', i)
  if (j < 0) return `nincs signOut a(z) ${kezdet} után`
  return /stopAllWriteSyncs\(\)/.test(s.slice(i, j)) ? null : `a(z) ${kezdet} nem hívja a stopAllWriteSyncs()-et a signOut előtt`
}
function kijelentkezesOr({ shell, gate, wizard, dash }) {
  const hibak = []
  if (!/import \{ stopAllWriteSyncs \} from '\.\.\/write-sync-registry'/.test(shell)) hibak.push('a shell nem importálja a stopAllWriteSyncs-et')
  for (const [src, kezdet] of [
    [shell, 'const handleSignOut = useCallback(async () => {'],
    [gate, 'const kilepes = useCallback(async () => {'],
    [wizard, 'async function kilep() {'],
    [dash, 'A kliens automatikusan kijelentkezik.'],
  ]) {
    const h = stopASignOutElott(src, kezdet)
    if (h) hibak.push(h)
  }
  return hibak
}
{
  const hibak = kijelentkezesOr({ shell: SHELL_SRC, gate: GATE_SRC, wizard: WIZARD_SRC, dash: DASH_SRC })
  assert(hibak.length === 0, `R4 mind a 4 kijelentkezési út a signOut ELŐTT állítja le a push-ereket (${hibak.join('; ') || 'rendben'})`)
  const mut = SHELL_SRC.replace(/\n\s*stopAllWriteSyncs\(\)\n/, '\n')
  assert(mut !== SHELL_SRC && kijelentkezesOr({ shell: mut, gate: GATE_SRC, wizard: WIZARD_SRC, dash: DASH_SRC }).length > 0, 'R4n mutáns (a shell handleSignOut nem hívja) → az őr BUKIK')
}

// ── N1: az ONLINE mentési ágak is jeleznek a regiszternek ─────────────────
const ONLINE_MENTOK = ['updateOwnProfile', 'createWorklogEntry', 'updateWorklogEntry', 'deleteWorklogEntry', 'updateSzemelyEntry']
/** Egy exportált függvény törzse (a következő top-level deklarációig). */
function fnTorzs(src, nev) {
  const i = src.indexOf(`export async function ${nev}(`)
  if (i < 0) return null
  const j = src.slice(i + 1).search(/\n(export |async function |function |const [A-Za-z_]+ = )/)
  return j < 0 ? src.slice(i) : src.slice(i, i + 1 + j)
}
function onlineJelzesOr(syncSrc) {
  const s = stripComments(syncSrc)
  const hibak = []
  for (const nev of ONLINE_MENTOK) {
    const torzs = fnTorzs(s, nev)
    if (!torzs) {
      hibak.push(`${nev}: nincs meg`)
      continue
    }
    const k = torzs.indexOf('if (await isOnlineWithSession()) {')
    if (k < 0) {
      hibak.push(`${nev}: nincs online ág`)
      continue
    }
    // Az online `if` blokk a függvénytörzs szintjén (2 szóköz) záródik — a
    // belső try/catch-ek (pl. a munkanapló delta-pull catch-e) mélyebben.
    const blokkVege = torzs.indexOf('\n  }\n', k)
    const onlineBlokk = torzs.slice(k, blokkVege < 0 ? undefined : blokkVege)
    const jelzes = onlineBlokk.indexOf('notifyLocalWriteCommitted()')
    if (jelzes < 0) {
      hibak.push(`${nev}: az online siker-ág nem jelez`)
      continue
    }
    // Dupla jelzés tilos: a siker-ág (a jelzésig) NEM az outboxon át jelez —
    // az outbox-ág (`enqueueOutbox` / `fallbackToOutbox`) maga jelez.
    if (/enqueueOutbox\(|fallbackToOutbox\(/.test(onlineBlokk.slice(0, jelzes))) hibak.push(`${nev}: az online siker-ág outboxba is ír (dupla jelzés)`)
  }
  return hibak
}
{
  const hibak = onlineJelzesOr(SYNC_SRC)
  assert(hibak.length === 0, `N1 az 5 online mentési ág a siker után notifyLocalWriteCommitted-et hív, outbox-dupla nélkül (${hibak.join('; ') || 'rendben'})`)
  const torzs = fnTorzs(SYNC_SRC, 'updateSzemelyEntry')
  const mut = SYNC_SRC.replace(torzs, torzs.replace(/\n\s*notifyLocalWriteCommitted\(\)\n/, '\n'))
  assert(mut !== SYNC_SRC && onlineJelzesOr(mut).length > 0, 'N1n mutáns (a tag online ága nem jelez) → az őr BUKIK')
}

// ── PR1: program-típusok — a webes forrás BETŰRE azonos tükre ─────────────
const WEB_DASH_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'lib', 'constants', 'dashboard.ts'), 'utf8')
const PROGTIP_SRC = fs.readFileSync(path.join(LIB, 'program-tipusok.ts'), 'utf8')
/** Import-mentes TS modul betöltése (transpile → CJS). */
function betoltTiszta(src, nev) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-${nev}-`))
  const p = path.join(tmp, `${nev}.cjs`)
  fs.writeFileSync(p, t(src))
  const mod = require_(p)
  fs.rmSync(tmp, { recursive: true, force: true })
  return mod
}
function paritasHibak(webSrc, desktopSrc) {
  const web = betoltTiszta(webSrc, 'web-dashboard')
  const dt = betoltTiszta(desktopSrc, 'program-tipusok')
  const hibak = []
  const parok = [
    ['PROGRAM_TYPES', 'PROGRAM_TIPUSOK'],
    ['MAGAN_PROGRAM_TIPUSOK', 'MAGAN_PROGRAM_TIPUSOK'],
    ['ANYAKONYVI_PROGRAM_TIPUSOK', 'ANYAKONYVI_PROGRAM_TIPUSOK'],
  ]
  for (const [w, d] of parok) {
    if (JSON.stringify(web[w]) !== JSON.stringify(dt[d])) hibak.push(`${d} ≠ web ${w}`)
  }
  // Bíráló P3 (2026-09-05): a címke/emoji/szín térkép és a rajzoló segédek NEM
  // élhetnek itt — a desktopon senki nem olvasta őket (a kezdőlap az ui-app
  // UpcomingPrograms tükréből rajzol, azt a PR1f méri a webhez). Egy visszakerülő
  // térkép harmadik, mért-de-holt másolat lenne.
  const tiltott = ['PROG_TIPUS_EMOJI', 'PROG_TIPUS_LABELS', 'PROG_TIPUS_COLOR', 'programTipusCimke', 'programTipusEmoji', 'programTipusSzin']
  const tisztaDesktop = stripComments(desktopSrc)
  for (const nev of tiltott) {
    if (nev in dt || new RegExp(`\\b${nev}\\b`).test(tisztaDesktop)) hibak.push(`${nev}: harmadik másolat a desktopon (holt adat)`)
  }
  return { hibak, dt, web }
}
{
  const { hibak, dt, web } = paritasHibak(WEB_DASH_SRC, PROGTIP_SRC)
  assert(hibak.length === 0, `PR1 program-tipusok = a webes constants/dashboard.ts tükre (lista, magán, anyakönyvi), címke/emoji/szín térkép NÉLKÜL (${hibak.join('; ') || 'rendben'})`)
  const uj5 = ['kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag']
  assert(dt.PROGRAM_TIPUSOK.length === 21 && uj5.every((x) => dt.PROGRAM_TIPUSOK.includes(x)), 'PR1a 21 típus, az 5 új (anyakönyvi + szabadság) benne')
  assert(
    uj5.every((x) => dt.programNyilvanos(x, true) === false && dt.programNyilvanos(x, 1) === false && dt.programPublikusTukorErtek(x, true) === 0),
    'PR1b magán típuson a nyilvános jelölés SOHA nem igaz — akármit mond a tárolt érték',
  )
  assert(
    dt.programNyilvanos('istentisztelet', true) === true && dt.programNyilvanos('bibliaora', 1) === true && dt.programNyilvanos('bibliaora', 0) === false && dt.programNyilvanos('kozossegi', null) === false,
    'PR1c nem-magán típuson a tárolt érték dönt (true/1 → igaz; 0/null → nem)',
  )
  assert(web.isMaganProgramTipus('szabadsag') === dt.isMaganProgramTipus('szabadsag') && dt.isAnyakonyviProgramTipus('szabadsag') === false, 'PR1e isMagan/isAnyakonyvi a webbel egyezik')

  // PR1n/a — a desktop magán-listája eltér (egy magán típus kimarad → a temetés publikus lehetne)
  const mutA = PROGTIP_SRC.replace("['szabadsag', 'kereszteles', 'eskuvo', 'konfirmacio', 'temetes'] as const", "['szabadsag', 'kereszteles', 'eskuvo', 'konfirmacio'] as const")
  assert(mutA !== PROGTIP_SRC && paritasHibak(WEB_DASH_SRC, mutA).hibak.length > 0, 'PR1n/a mutáns (a desktop magán-listájából kimarad a temetés) → az őr BUKIK')
  // PR1n/c — egy címke-térkép visszakerül a desktopra (harmadik másolat)
  const mutC = `${PROGTIP_SRC}\nexport const PROG_TIPUS_LABELS: Record<string, string> = { egyeb: 'Egyéb' }\n`
  assert(paritasHibak(WEB_DASH_SRC, mutC).hibak.length > 0, 'PR1n/c mutáns (címke-térkép visszakerül a desktopra) → az őr BUKIK')
  // PR1n/b — a WEB bővül egy típussal, a desktop nem követi
  const mutB = WEB_DASH_SRC.replace("'kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag',\n] as const", "'kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag', 'zarandoklat',\n] as const")
  assert(mutB !== WEB_DASH_SRC && paritasHibak(mutB, PROGTIP_SRC).hibak.length > 0, 'PR1n/b mutáns (a web bővül, a desktop nem) → az őr BUKIK')
}

// ── PR1f: az ui-app UpcomingPrograms belső tükre is MÉRT (nem csak a desktop-é) ──
// (ellenőrzés-ügynök, 2026-09-05) A közös widget a webes dashboard.ts címke- és
// szín-térképének NEM exportált másolatát tartja; a desktop a webhez van mérve
// (PR1), az ui-app eddig senkihez — egy ott elcsúszó címke némán maradt volna.
// (A U1 őr a naptár-rétegek selftestben csak a kulcsok MEGLÉTÉT nézi.)
{
  const UPCOMING_SRC = fs.readFileSync(path.join(ROOT, 'packages', 'ui-app', 'src', 'dashboard', 'UpcomingPrograms.tsx'), 'utf8')
  /** A két térkép objektum-literálja kivágva, önálló modulként betöltve (a widget React/lucide importjai nélkül). */
  function uiAppTerkepek(src) {
    const labels = src.match(/const PROG_TIPUS_LABELS: Record<string, string> = \{[\s\S]*?\n\}/)?.[0]
    const color = src.match(/const PROG_TIPUS_COLOR: Record<string, string> = \{[\s\S]*?\n\}/)?.[0]
    if (!labels || !color) return null
    return betoltTiszta(`${labels}\n${color}\nexport { PROG_TIPUS_LABELS, PROG_TIPUS_COLOR }`, 'ui-app-terkepek')
  }
  function uiAppParitasHibak(uiSrc, webSrc) {
    const ui = uiAppTerkepek(uiSrc)
    if (!ui) return ['a térképek nem vághatók ki az UpcomingPrograms.tsx-ből']
    const web = betoltTiszta(webSrc, 'web-dashboard-ui')
    const hibak = []
    if (JSON.stringify(web.PROGRAM_TYPES) !== JSON.stringify(Object.keys(ui.PROG_TIPUS_LABELS))) hibak.push('ui-app PROG_TIPUS_LABELS kulcsai ≠ web PROGRAM_TYPES')
    for (const k of ['PROG_TIPUS_LABELS', 'PROG_TIPUS_COLOR']) {
      if (JSON.stringify(web[k]) !== JSON.stringify(ui[k])) hibak.push(`ui-app ${k} ≠ web ${k}`)
    }
    return hibak
  }
  const hibak = uiAppParitasHibak(UPCOMING_SRC, WEB_DASH_SRC)
  assert(hibak.length === 0, `PR1f az ui-app UpcomingPrograms címke- és szín-térképe BETŰRE a webes dashboard.ts tükre (${hibak.join('; ') || 'rendben'})`)
  const mutUi = UPCOMING_SRC.replace("temetes: 'Temetés', szabadsag: 'Szabadság',", "temetes: 'Temetes', szabadsag: 'Szabadság',")
  assert(mutUi !== UPCOMING_SRC && uiAppParitasHibak(mutUi, WEB_DASH_SRC).length > 0, 'PR1fn/a mutáns (az ui-app egy címkéje eltér a webtől) → az őr BUKIK')
  const webBovul = WEB_DASH_SRC.replace("'kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag',\n] as const", "'kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag', 'zarandoklat',\n] as const")
  assert(webBovul !== WEB_DASH_SRC && uiAppParitasHibak(UPCOMING_SRC, webBovul).length > 0, 'PR1fn/b mutáns (a web bővül egy típussal, az ui-app nem követi) → az őr BUKIK')
}

// ── PR2: helyi közelgő programok VALÓDI SQLite-on (node:sqlite) ────────────
const DB_RS = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src-tauri', 'src', 'db.rs'), 'utf8')
{
  let DatabaseSync = null
  try {
    ;({ DatabaseSync } = require_('node:sqlite'))
  } catch {
    DatabaseSync = null
  }
  const oszlopokM = SYNC_SRC.match(/const PROGRAM_LOCAL_OSZLOPOK = `([\s\S]*?)`\n/)
  const evesTorzs = fnTorzs(SYNC_SRC, 'getLocalPrograms')
  const evesSqlM = evesTorzs && evesTorzs.match(/dbSelect<ProgramLocalRow>\(\n\s*`([\s\S]*?)`,/)
  const pullTorzsSrc = fnTorzs(SYNC_SRC, 'pullProgramsOfOwnCongregation')
  const insertSqlM = pullTorzsSrc && pullTorzsSrc.match(/dbExecuteMany\(\n\s*`([\s\S]*?)`,/)
  assert(Boolean(oszlopokM && evesSqlM && insertSqlM), 'PR2 a PROGRAM_LOCAL_OSZLOPOK, a getLocalPrograms SELECT-je és a pull-INSERT SQL-je megtalálható')

  // Az ÉLŐ kezdőlap-út kibontója: az ui-app UpcomingPrograms.tsx React-mentes
  // szelete (Dátum-segédek … Részkomponensek) — benne az
  // expandUpcomingProgramOccurrences és a dátum-segédei. A widget rajzoló része
  // (React, lucide) kimarad; a kivágott szelet önálló modulként töltődik.
  const UPCOMING_TSX = fs.readFileSync(path.join(ROOT, 'packages', 'ui-app', 'src', 'dashboard', 'UpcomingPrograms.tsx'), 'utf8')
  function kibontoModul(tsxSrc) {
    const a = tsxSrc.indexOf('// ── Dátum-segédek')
    const b = tsxSrc.indexOf('// ── Részkomponensek')
    if (a < 0 || b < 0 || b <= a) return null
    return betoltTiszta(tsxSrc.slice(a, b), 'ui-app-kibonto')
  }
  /** A kibontó `new Date()`-je rögzített napra áll (helyi idő, dél); az argumentumos Date-hívások érintetlenek. */
  function rogzitettOraval(iso, fn) {
    const Valodi = globalThis.Date
    const fixMs = new Valodi(`${iso}T12:00:00`).getTime()
    class RogzitettDate extends Valodi {
      constructor(...a) {
        if (a.length === 0) super(fixMs)
        else super(...a)
      }
      static now() {
        return fixMs
      }
    }
    globalThis.Date = RogzitettDate
    try {
      return fn()
    } finally {
      globalThis.Date = Valodi
    }
  }
  const createM = DB_RS.match(/CREATE TABLE IF NOT EXISTS gyulekezeti_programok_local \([\s\S]*?\);/)
  const alterek = [...DB_RS.matchAll(/ALTER TABLE gyulekezeti_programok_local ADD COLUMN [^;]+;/g)].map((m) => m[0])
  assert(Boolean(createM) && alterek.length >= 7, `PR2a db.rs: CREATE + ${alterek.length} ALTER a programok tükrén (v28: leiras/szin, v31: revision, v34: ismetlodes_vege/publikus/anyakonyv_tabla/anyakonyv_id)`)
  assert(
    /if current < 34 \{[\s\S]*?ismetlodes_vege TEXT;[\s\S]*?publikus INTEGER NOT NULL DEFAULT 0;[\s\S]*?anyakonyv_tabla TEXT;[\s\S]*?anyakonyv_id INTEGER;[\s\S]*?PRAGMA user_version = 34;/.test(DB_RS),
    'PR2b a v34 migráció a 4 oszlopot adja hozzá és a user_version-t 34-re lépteti',
  )

  if (!DatabaseSync) {
    console.log('PR2 kihagyva: node:sqlite nem elérhető ebben a Node-ban (nem hiba).')
  } else if (oszlopokM && evesSqlM && insertSqlM && createM) {
    const oszlopok = oszlopokM[1]
    const insertSql = insertSqlM[1].replace('${PROGRAM_LOCAL_OSZLOPOK}', oszlopok)
    const evesSqlSablon = evesSqlM[1].replace('${PROGRAM_LOCAL_OSZLOPOK}', oszlopok)
    const oszlopLista = oszlopok.split(',').map((c) => c.trim()).filter(Boolean)
    const dt = betoltTiszta(PROGTIP_SRC, 'program-tipusok-pr2')

    const db = new DatabaseSync(':memory:')
    db.exec(createM[0])
    for (const a of alterek) db.exec(a)
    const st = db.prepare(insertSql)
    /** Egy sor a pull-INSERT-nek — a batch-építő oszlopsorrendje szerint. */
    const sor = (id, tipus, datum, datumVege, extra = {}) => {
      const ertek = {
        id, congregation_id: 'gy-1', cim: `${tipus}-${id}`, datum, datum_vege: datumVege, ido_kezdes: null, ido_befejezes: null,
        helyszin: null, tipus, prioritas: 'normal', ismetlodes_tipus: null, egyedi_tipus_nev: null, egyedi_emoji: null,
        megjegyzes: null, teljesitett: 0, teljesites_datum: null, letrehozta_id: null, letrehozta_nev: null,
        leiras: null, szin: null, revision: 1, ismetlodes_vege: null,
        // A pull a szabályon át ír: magán típuson 0, akármit mond a szerver.
        publikus: dt.programPublikusTukorErtek(tipus, true),
        anyakonyv_tabla: null, anyakonyv_id: null, created_at: null, updated_at: null,
        ...extra,
      }
      return oszlopLista.map((c) => ertek[c])
    }
    /** Az év-SELECT futtatása: annyi paramétert kötünk, ahányat a (mutáns) SQL hivatkozik. */
    const evSorok = (sql, gy, ev) => {
      const n = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])))
      return db.prepare(sql).all(...[gy, `${ev}-01-01`, `${ev}-12-31`, `${ev - 5}-01-01`].slice(0, n))
    }
    const kibonto = kibontoModul(UPCOMING_TSX)
    assert(Boolean(kibonto && typeof kibonto.expandUpcomingProgramOccurrences === 'function'), 'PR2-előfeltétel: az ui-app kibontója (expandUpcomingProgramOccurrences) betölthető a Dátum-segédek … Részkomponensek szeletből')
    /**
     * Az ÉLŐ kezdőlap-út (home-page.tsx tükre): tárgyév (+ évhatárnál a következő
     * év) → id szerinti dedup → a tükör sorai bejegyzésként → kibontás + 14 napos
     * ablak, rögzített „ma"-val.
     */
    const kezdolapUt = (sql, kib, gy, ma, { dedup = true } = {}) => {
      const ev = Number(ma.slice(0, 4))
      const ablakVege = new Date(new Date(`${ma}T12:00:00`).getTime() + 14 * 86400000)
      const osszes = [...evSorok(sql, gy, ev), ...(ablakVege.getFullYear() !== ev ? evSorok(sql, gy, ev + 1) : [])]
      const sorok = dedup ? [...new Map(osszes.map((p) => [p.id, p])).values()] : osszes
      const bejegyzesek = sorok.map((p) => ({ ...p, teljesitett: p.teljesitett === 1 }))
      return rogzitettOraval(ma, () => kib.expandUpcomingProgramOccurrences(bejegyzesek, 14))
    }

    // ── A forgatókönyv: „ma" = 2031. január 2. — bíráló P2: az ELŐZŐ évben kezdődő, még tartó szabadság ──
    const gyA = { congregation_id: 'gy-elo' }
    st.run(...sor('szab', 'szabadsag', '2030-12-27', '2031-01-05', gyA))                                  // dec. 27. → jan. 5.: ELKEZDŐDÖTT, még tart → LÁTSZIK
    st.run(...sor('tem', 'temetes', '2031-01-03', null, gyA))                                              // magán, holnapután → látszik, publikus 0
    st.run(...sor('ist', 'istentisztelet', '2031-01-04', null, gyA))                                       // nyilvános → látszik
    st.run(...sor('heti', 'bibliaora', '2030-11-05', null, { ...gyA, ismetlodes_tipus: 'heti' }))          // 2030 novemberében indult HETI sorozat → jan. 7. és 14. LÁTSZIK
    st.run(...sor('lezart', 'imaora', '2030-10-01', null, { ...gyA, ismetlodes_tipus: 'heti', ismetlodes_vege: '2030-12-31' })) // 2030 végén lezárt sorozat → NEM
    st.run(...sor('tavoli', 'bibliaora', '2031-01-25', null, gyA))                                         // az ablakon túl → kimarad
    st.run(...sor('regi', 'tabor', '2030-12-28', '2030-12-31', gyA))                                       // szilveszterkor véget ért → kimarad
    st.run(...sor('kesz', 'imaora', '2031-01-05', null, { ...gyA, teljesitett: 1 }))                       // teljesített → az agenda áthúzva mutatja: BENT, teljesitett=true
    st.run(...sor('kezi', 'kereszteles', '2031-01-06', null, { ...gyA, publikus: 1 }))                     // tükörben ragadt hibás jelölés → olvasáskor 0

    const A = kezdolapUt(evesSqlSablon, kibonto, 'gy-elo', '2031-01-02')
    const idA = A.map((r) => r.id)
    const szab = A.find((r) => r.id === 'szab')
    assert(Boolean(szab) && szab.datum === '2030-12-27' && szab.datum_vege === '2031-01-05', `PR2c az ÉLŐ úton jan. 2-án a dec. 27. – jan. 5. szabadság (az előző évben kezdődött, még tart) LÁTSZIK (kapott: ${idA.join(',')})`)
    assert(['tem', 'kezi', 'ist'].every((x) => idA.includes(x)), 'PR2d a magán típusok (temetés, keresztelő) a lelkész gépén LÁTSZANAK, a nyilvános alkalommal együtt')
    assert(!idA.includes('tavoli') && !idA.includes('regi') && !idA.includes('lezart'), 'PR2e az ablakon túli, a szilveszterkor véget ért alkalom és a lezárt sorozat kimarad')
    const heti = A.filter((r) => r.id === 'heti').map((r) => r.datum)
    assert(JSON.stringify(heti) === JSON.stringify(['2031-01-07', '2031-01-14']), `PR2e2 a 2030 novemberében indult HETI sorozat januári alkalmai (jan. 7., 14.) látszanak — a korábbi évben indult sorozat az új évben nem tűnik el (kapott: ${heti.join(',') || '—'})`)
    const kesz = A.find((r) => r.id === 'kesz')
    assert(Boolean(kesz) && kesz.teljesitett === true, 'PR2e3 a teljesített alkalom az agendában marad, teljesitett=true (a webes agenda áthúzva mutatja)')
    const nyers = (id) => db.prepare('SELECT publikus, tipus FROM gyulekezeti_programok_local WHERE id = ?').get(id)
    assert(nyers('tem').publikus === 0, 'PR2f a pull a magán sor publikus-át 0-val írta (a szerver true-ja ellenére)')
    assert(nyers('kezi').publikus === 1 && dt.programPublikusTukorErtek(nyers('kezi').tipus, nyers('kezi').publikus) === 0, 'PR2g a tükörben ragadt publikus=1 magán sort az olvasás-oldali szabály 0-ra normalizálja')
    assert(oszlopLista.length === 27 && (insertSql.match(/\?\d+/g) ?? []).length === 27, `PR2h a pull-INSERT 27 oszlop / 27 paraméter (kapott: ${oszlopLista.length} / ${(insertSql.match(/\?\d+/g) ?? []).length})`)

    // ── B forgatókönyv: „ma" = 2031. december 25. — évhatár: a következő évet is kéri, id szerint dedupál ──
    const gyB = { congregation_id: 'gy-evhatar' }
    st.run(...sor('b-atnyulo', 'szabadsag', '2031-12-28', '2032-01-03', gyB))                              // évhatáron átnyúló: MINDKÉT évi lekérdezés hozza → EGYSZER
    st.run(...sor('b-ujev', 'istentisztelet', '2032-01-02', null, gyB))                                    // a következő évi → látszik
    st.run(...sor('heti2', 'bibliaora', '2031-09-03', null, { ...gyB, ismetlodes_tipus: 'heti' }))         // sorozat: mindkét lekérdezés hozza → alkalmanként EGYSZER
    const B = kezdolapUt(evesSqlSablon, kibonto, 'gy-evhatar', '2031-12-25')
    const napokB = (id) => B.filter((r) => r.id === id).map((r) => r.datum)
    assert(JSON.stringify(napokB('b-atnyulo')) === JSON.stringify(['2031-12-28']) && napokB('b-ujev').length === 1, `PR2i dec. 25-én az évhatáron átnyúló szabadság EGYSZER szerepel, a jan. 2-i (következő évi) alkalom látszik (kapott: ${napokB('b-atnyulo').join(',')} / ${napokB('b-ujev').join(',')})`)
    assert(JSON.stringify(napokB('heti2')) === JSON.stringify(['2031-12-31', '2032-01-07']), `PR2i2 a szeptemberben indult heti sorozat két alkalma (dec. 31., jan. 7.) EGYSZER-EGYSZER — nincs dupla a két évi lekérdezésből (kapott: ${napokB('heti2').join(',') || '—'})`)

    // PR2n/a — a RÉGI világ: a kezdő nap éve (SQL)
    const regiSql = evesSqlSablon.replace(/AND datum <= \?3\s+AND \(datum_vege >= \?2 OR datum >= \?2\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)\)/, 'AND datum >= ?2\n        AND datum <= ?3')
    assert(regiSql !== evesSqlSablon, 'PR2n/a-előfeltétel: a régi év-szűrő előállítható')
    assert(!kezdolapUt(regiSql, kibonto, 'gy-elo', '2031-01-02').some((r) => r.id === 'szab'), 'PR2n/a a régi `datum >= év-01-01` szűrőn a szabadság januárban ELTŰNIK az élő útról — az őr tud pirosra váltani')
    // PR2n/b — a kibontó ablak-szűrője a KEZDŐ napot nézi (a régi ablak-szabály)
    const regiKibonto = kibontoModul(UPCOMING_TSX.replace('return start <= windowEnd && end >= todayStr', 'return start <= windowEnd && start >= todayStr'))
    assert(Boolean(regiKibonto) && !kezdolapUt(evesSqlSablon, regiKibonto, 'gy-elo', '2031-01-02').some((r) => r.id === 'szab'), 'PR2n/b mutáns (a kibontó a kezdő napra szűr) → az elkezdődött szabadság KIESIK — az őr BUKIK')
    // PR2n/c — a kezdőlap nem dedupál
    assert(kezdolapUt(evesSqlSablon, kibonto, 'gy-evhatar', '2031-12-25', { dedup: false }).filter((r) => r.id === 'b-atnyulo').length === 2, 'PR2n/c dedup nélkül az átnyúló alkalom KÉTSZER szerepel — az őr tud pirosra váltani')

    // PR4 (bíráló P2, 2026-09-05): a getLocalPrograms év-szűrője ÖNMAGÁBAN futtatva —
    // az intervallum metszete (a webes program-ev-metszet.ts tükre) + a korábbi
    // években indult sorozatok (a webes getProgramsForYear második lekérdezésének
    // tükre). Külön gyülekezet-azonosító ('gy-ev') és fix évek.
    {
      const gy = { congregation_id: 'gy-ev' }
      st.run(...sor('tabor', 'tabor', '2030-12-30', '2031-01-02', gy))          // előző év végén kezdődő, többnapos → 2031-ben LÁTSZIK
      st.run(...sor('ujev', 'istentisztelet', '2031-01-01', null, gy))          // jan. 1. egynapos → látszik
      st.run(...sor('szilveszter', 'imaora', '2030-12-31', null, gy))           // előző évi egynapos → NEM
      st.run(...sor('kovetkezo', 'bibliaora', '2032-01-01', null, gy))          // következő évi → NEM
      st.run(...sor('atnyulo', 'szabadsag', '2031-12-28', '2032-01-03', gy))    // az év végén kezdődő, átnyúló → látszik
      st.run(...sor('hibas', 'egyeb', '2030-12-30', '2030-12-20', gy))          // hibás (kezdő előtti) záró nap, előző évi kezdő → NEM (a kezdő dönt)
      st.run(...sor('hibas2', 'egyeb', '2031-03-01', '2030-02-01', gy))         // hibás záró nap, de a kezdő az évben → LÁTSZIK (a webes programZaroNapja is a kezdőre esik)
      st.run(...sor('heti-regi', 'bibliaora', '2030-11-05', null, { ...gy, ismetlodes_tipus: 'heti' }))  // előző évben indult sorozat → LÁTSZIK (5 éven belül)
      st.run(...sor('heti-osi', 'bibliaora', '2020-01-01', null, { ...gy, ismetlodes_tipus: 'heti' }))   // 6+ éve indult sorozat → NEM (a webes 5 éves plafon)
      st.run(...sor('nem-sorozat-regi', 'imaora', '2029-06-01', null, gy))                                // régi, NEM ismétlődő egynapos → NEM
      const evFuttat = (sql) => evSorok(sql, 'gy-ev', 2031).map((r) => r.id)
      const evIdk = evFuttat(evesSqlSablon)
      assert(evIdk.includes('tabor') && evIdk.includes('ujev') && evIdk.includes('atnyulo'), 'PR4 a dec. 30. – jan. 2. tábor, a jan. 1-jei alkalom és az év végén kezdődő szabadság a 2031-es listában van (az intervallum metszi az évet)')
      assert(!evIdk.includes('szilveszter') && !evIdk.includes('kovetkezo') && !evIdk.includes('hibas'), 'PR4b az előző évi egynapos, a következő évi és a hibás (kezdő előtti) záró napú, előző évi sor kimarad — a kezdő nap dönt, nem szivárog át')
      assert(evIdk.includes('hibas2'), 'PR4c a hibás záró napú, de az évben kezdődő sor LÁTSZIK — a kezdő nap dönt, mint a webes programZaroNapja')
      assert(evIdk.includes('heti-regi') && !evIdk.includes('heti-osi') && !evIdk.includes('nem-sorozat-regi'), 'PR4d a 2030-ban indult heti sorozat a 2031-es listában van; a 6+ éve indult sorozat és a régi nem-ismétlődő sor nincs (a webes második lekérdezés tükre)')
      // PR4n — a RÉGI világ: a kezdő nap éve
      const evRegi = evesSqlSablon.replace(/AND datum <= \?3\s+AND \(datum_vege >= \?2 OR datum >= \?2\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)\)/, 'AND datum >= ?2\n        AND datum <= ?3')
      assert(evRegi !== evesSqlSablon, 'PR4n-előfeltétel: a régi (kezdő nap éve) szűrő előállítható')
      assert(!evFuttat(evRegi).includes('tabor'), 'PR4n a régi `datum >= év-01-01` szűrőn a tábor januárból ELTŰNIK — az őr tud pirosra váltani')
      // PR4nc — a COALESCE-alak MÁS: a hibás (kezdő előtti) záró napot venné
      const evCoalesce = evesSqlSablon.replace('(datum_vege >= ?2 OR datum >= ?2', '(COALESCE(datum_vege, datum) >= ?2')
      assert(evCoalesce !== evesSqlSablon && !evFuttat(evCoalesce).includes('hibas2'), 'PR4nc a COALESCE-alakon az évben kezdődő, hibás záró napú sor KIESIK (eltér a webes szabálytól) — ezért nem COALESCE')
      // PR4nr — a sorozat-ág nélkül (a 2026-09-05 előtti desktop)
      const evNemSorozat = evesSqlSablon.replace(/\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)/, '')
      assert(evNemSorozat !== evesSqlSablon && !evFuttat(evNemSorozat).includes('heti-regi'), 'PR4nr a sorozat-ág nélkül a 2030-ban indult heti sorozat 2031-ből ELTŰNIK — az őr tud pirosra váltani')
    }
    db.close()
  }
}

// ── PR4s: getLocalPrograms év-szűrője — forrás-őr (node:sqlite nélkül is él) ──
function evMetszetOr(syncSrc) {
  const torzs = fnTorzs(stripComments(syncSrc), 'getLocalPrograms') ?? ''
  const hibak = []
  if (!torzs) hibak.push('getLocalPrograms nincs meg')
  if (!/AND datum <= \?3\s+AND \(datum_vege >= \?2 OR datum >= \?2\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)\)/.test(torzs)) hibak.push('nem az intervallum-metszet + sorozat alak (datum ≤ ?3 ÉS (datum_vege ≥ ?2 VAGY datum ≥ ?2 VAGY (ismétlődő ÉS datum ≥ ?4)))')
  if (/AND datum >= \?2\s+AND datum <= \?3/.test(torzs)) hibak.push('a régi „kezdő nap éve" szűrő')
  if (/COALESCE\(datum_vege, datum\) >= \?2/.test(torzs)) hibak.push('COALESCE-alak (a hibás, kezdő előtti záró napot venné — eltér a webes programZaroNapja-tól)')
  if (!/`\$\{targetYear\}-01-01`, `\$\{targetYear\}-12-31`, `\$\{targetYear - 5\}-01-01`/.test(torzs)) hibak.push('a ?2/?3/?4 paraméter nem az év első és utolsó napja + az 5 évvel korábbi év eleje')
  return hibak
}
{
  const hibak = evMetszetOr(SYNC_SRC)
  assert(hibak.length === 0, `PR4s getLocalPrograms: az év METSZETE (datum ≤ ?3 ÉS (datum_vege ≥ ?2 VAGY datum ≥ ?2)) + a korábbi években indult sorozatok (ismétlődő ÉS datum ≥ ?4) — a webes program-ev-metszet.ts és a getProgramsForYear második lekérdezésének tükre (${hibak.join('; ') || 'rendben'})`)
  const mut = SYNC_SRC.replace(/AND datum <= \?3\s+AND \(datum_vege >= \?2 OR datum >= \?2\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)\)/, 'AND datum >= ?2\n        AND datum <= ?3')
  assert(mut !== SYNC_SRC && evMetszetOr(mut).length > 0, 'PR4sn mutáns (a régi `datum >= év-01-01` alak) → az őr BUKIK')
  const mutC = SYNC_SRC.replace('(datum_vege >= ?2 OR datum >= ?2', '(COALESCE(datum_vege, datum) >= ?2')
  assert(mutC !== SYNC_SRC && evMetszetOr(mutC).length > 0, 'PR4sn/b mutáns (COALESCE-alak) → az őr BUKIK')
  const mutR = SYNC_SRC.replace(/\s+OR \(ismetlodes_tipus IS NOT NULL AND datum >= \?4\)/, '')
  assert(mutR !== SYNC_SRC && evMetszetOr(mutR).length > 0, 'PR4sn/c mutáns (a sorozat-ág kivéve — a korábbi évben indult heti sorozat januártól eltűnne) → az őr BUKIK')
}

// ── PR2j: a SQL-oldali MÁSODIK ablak-szabály (getLocalUpcomingPrograms) nincs többé ──
// (bíráló P3, 2026-09-05) A függvénynek egyetlen felület sem volt hívója; a „már
// elkezdődött többnapos alkalom benne marad" szabály EGY helyen él: az ui-app
// kibontójában (a PR2 azt futtatja). Egy visszakerülő SQL-oldali példány holt
// kód lenne, amit egy őr „véd", miközben az élő út mást tehet.
function holtKodOr(syncSrc) {
  const s = stripComments(syncSrc)
  const hibak = []
  if (/getLocalUpcomingPrograms/.test(s)) hibak.push('getLocalUpcomingPrograms visszakerült (hívó nélküli második ablak-szabály)')
  if (/COALESCE\(datum_vege, datum\) >= \?/.test(s)) hibak.push('SQL-oldali „záró nap ≥ ma" ablak-szűrő a sync.ts-ben (a szabály helye az ui-app kibontója)')
  return hibak
}
{
  const hibak = holtKodOr(SYNC_SRC)
  assert(hibak.length === 0, `PR2j a sync.ts-ben nincs getLocalUpcomingPrograms és nincs SQL-oldali ablak-szűrő — az ablak-szabály egyetlen helye az ui-app kibontója (${hibak.join('; ') || 'rendben'})`)
  const mut = `${SYNC_SRC}\nexport async function getLocalUpcomingPrograms(userId: string): Promise<ProgramLocalRow[]> {\n  return []\n}\n`
  assert(holtKodOr(mut).length > 0, 'PR2jn mutáns (a hívó nélküli függvény visszakerül) → az őr BUKIK')
}

// ── PR3: forrás-őrök a programok tükrén ────────────────────────────────────
const HOME_SRC = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src', 'pages', 'home-page.tsx'), 'utf8')
function programTukorOr(syncSrc, homeSrc) {
  const s = stripComments(syncSrc)
  const hibak = []
  const pull = fnTorzs(s, 'pullProgramsOfOwnCongregation') ?? ''
  if (!/programPublikusTukorErtek\(String\(r\.tipus \?\? 'egyeb'\), r\.publikus/.test(pull)) hibak.push('a pull nem a szabályon át írja a publikus-t')
  if (!/r\.ismetlodes_vege/.test(pull) || !/r\.anyakonyv_tabla/.test(pull) || !/r\.anyakonyv_id/.test(pull)) hibak.push('a pull nem viszi az ismetlodes_vege / anyakönyv-kapcsolat oszlopokat')
  for (const nev of ['getLocalPrograms']) {
    const torzs = fnTorzs(s, nev) ?? ''
    if (!/rows\.map\(normalizaltProgramSor\)/.test(torzs)) hibak.push(`${nev}: nincs olvasás-oldali normalizálás`)
    if (!/\$\{PROGRAM_LOCAL_OSZLOPOK\}/.test(torzs)) hibak.push(`${nev}: nem a közös oszloplistából olvas`)
  }
  const h = stripComments(homeSrc)
  if (!/ismetlodes_vege: p\.ismetlodes_vege/.test(h)) hibak.push('a kezdőlap nem adja át az ismetlodes_vege-t a kibontónak')
  if (!/needNextYear \? getLocalPrograms\(user\.id, curYear \+ 1\)/.test(h)) hibak.push('a kezdőlap évhatárnál nem kéri a következő évet')
  // 2026-09-05: a két évi lekérdezés (tárgyév + évhatárnál a következő) ugyanazt a
  // sort hozhatja (átnyúló alkalom, korábbi évben indult sorozat) — id szerint
  // EGYSZER, különben a kibontó duplázná (a webes getProgramsForYear `egyszer` Map-je).
  if (!/const egyszer = new Map\(\[\.\.\.programsThisYear, \.\.\.programsNextYear\]\.map\(\(p\) => \[p\.id, p\] as const\)\)/.test(h) || !/\[\.\.\.egyszer\.values\(\)\]\.map\(/.test(h)) hibak.push('a kezdőlap nem dedupál id szerint a két évi lekérdezés után (a kibontó megduplázná az alkalmakat)')
  return hibak
}
{
  const hibak = programTukorOr(SYNC_SRC, HOME_SRC)
  assert(hibak.length === 0, `PR3 pull a szabályon át ír, az olvasó normalizál és a közös oszloplistából olvas, a kezdőlap átadja az ismetlodes_vege-t, évhatárnál a következő évet is kéri és id szerint dedupál (${hibak.join('; ') || 'rendben'})`)
  const mut = SYNC_SRC.replace("programPublikusTukorErtek(String(r.tipus ?? 'egyeb'), r.publikus as boolean | null)", "(r.publikus as boolean | null) ? 1 : 0")
  assert(mut !== SYNC_SRC && programTukorOr(mut, HOME_SRC).length > 0, 'PR3n/a mutáns (a pull nyersen írja a publikus-t) → az őr BUKIK')
  const mutH = HOME_SRC.replace('[...egyszer.values()].map(', '[...programsThisYear, ...programsNextYear].map(')
  assert(mutH !== HOME_SRC && programTukorOr(SYNC_SRC, mutH).length > 0, 'PR3n/b mutáns (a kezdőlap nem dedupál) → az őr BUKIK')
}

console.log('')
if (failedCount > 0) {
  console.error(`${failedCount}/${total} teszt HIBÁS`)
  process.exit(1)
}
console.log(`${total}/${total} teszt zöld — desktop szinkron rendben`)
process.exit(0)
