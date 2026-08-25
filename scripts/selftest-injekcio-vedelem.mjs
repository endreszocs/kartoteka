#!/usr/bin/env node
/**
 * INJEKCIÓ-VÉDELEM önellenőrzés (2026-08-24) — két, egymástól független
 * biztonsági javítás egy őrszem alatt.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * B10 — HTML-INJEKCIÓ A LELKÉSZCSERE-ÉRTESÍTŐ LEVÉLBE
 * ════════════════════════════════════════════════════════════════════════════
 * A `congregation-transfer.ts` HÁROM sablonja nyersen fűzte a HTML-törzsbe a
 * `reason`, `fromPastorName`, `congregationName`, `recipientName` és a
 * link-címeket. Ez a fájl volt a KIVÉTEL: az öt testvérfájl (access-request,
 * device-revoke, invite, restore/alerts, google-drive/alerts) mind escape-elt.
 *
 * A TÁMADÁS: a távozó lelkész az „Indok" mezőbe HTML-t ír (pl. adathalász
 * linket tartalmazó bekezdést). A rendszer a levelet MINDEN aktív
 * rendszergazdának és az egyházmegyei számvevőnek kiküldi — a SAJÁT
 * domainünkről, hitelesnek látszó levélben.
 *
 * A JAVÍTÁS: közös `apps/web/lib/email/escape.ts`, és MIND A HÁROM sablon
 * minden HTML-interpolációja átmegy rajta. Plusz a bemenet zod-séma alá került
 * (`reason` ≤ 500 karakter).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * B14 — CSV KÉPLET-INJEKCIÓ (formula injection)
 * ════════════════════════════════════════════════════════════════════════════
 * Három exportunk kvótált (a `"` duplázásával), de a CSV-idézőjel a MEZŐ
 * HATÁRÁT jelöli, NEM a tartalom típusát. Az Excel/LibreOffice a kvótálás
 * lefejtése UTÁN nézi a cellát: ha `=`, `+`, `-`, `@`, TAB vagy CR karakterrel
 * kezdődik, KÉPLETKÉNT értékeli ki. A munkanapló `cim`/`alapige`/`megjegyzes`/
 * `szolgalt`, az audit-napló `user_email`/`metadata`, és az egyházfenntartás
 * forrás-mezői mind közvetlen felhasználói bevitelek — a CSV-t viszont valaki
 * MÁS (jellemzően a rendszergazda) nyitja meg a saját gépén.
 *
 * A JAVÍTÁS: közös `apps/web/lib/utils/csv.ts` → `csvCella()`, aposztróffal
 * kényszerített szöveg + RFC4180 kvótálás. A tisztán szám alakú érték
 * (pl. `-500`) SZÁNDÉKOSAN érintetlen: az nem képlet, és aposztróffal a
 * negatív pénzösszegek szöveggé romlanának a táblázatban.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A MÉRCÉK
 * ════════════════════════════════════════════════════════════════════════════
 *  M1  SZINTAXIS      — az érintett fájlok TS/TSX-értelemben elemezhetők.
 *  M2  E-MAIL/1.      — a `transferInitiatedEmail` MINDEN interpolált értéket
 *                       escape-el (indok, név, gyülekezet, cím, link).
 *  M3  E-MAIL/2–3.    — a `transferCompletedEmail` ÉS a `transferInviteEmail`
 *                       is escape-el (nem elég az első sablon!).
 *  M4  E-MAIL/SZÖVEG  — a text/plain rész NYERS marad (a javítás nem rontotta
 *                       el a levelek olvasható változatát).
 *  M5  CSV/KÉPLET     — mind a hat veszélyes kezdőkarakter szöveggé kényszerül.
 *  M6  CSV/ÉRINTETLEN — a hétköznapi adat és a tisztán szám érték VÁLTOZATLAN.
 *  M7  BEKÖTÉS        — a hat e-mail-fájl a KÖZÖS escHtml-t használja (nincs
 *                       helyi másolat), a három export a KÖZÖS csvCella-t
 *                       (nincs nyers kvótálás).
 *  M8  SÉMA           — az átadás-indítás bemenete zod-séma alatt van
 *                       (`reason` ≤ 500), és a törzs a séma kimenetét használja.
 *  M9  NEGATÍV ASSZERT— a „régi világ" (a MAI forrásból, string-átalakítással
 *                       előállítva) és a mutánsok ténylegesen ELBUKNAK a
 *                       mércéken. Őrszem negatív asszert nélkül vak.
 *
 * ⛔ A negatív asszert SZÁNDÉKOSAN nem a git-történelemből dolgozik: a projektben
 *    ez már elsült egyszer (commitkor a HEAD maga lett a javított fájl, az
 *    őrszem saját magára írt hibát; rögzített commit pedig sekély CI-klónban
 *    nem is elérhető). A „régi világot" a MAI forrásból állítjuk elő — és ha a
 *    string-átalakítás NEM fog (elmozdult horgony), az őrszem SZÓL.
 *
 * Futtatás:  node scripts/selftest-injekcio-vedelem.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(path.join(ROOT, 'package.json'))

const REL = {
  escape: 'apps/web/lib/email/escape.ts',
  sablon: 'apps/web/lib/email/templates/congregation-transfer.ts',
  csv: 'apps/web/lib/utils/csv.ts',
  actions: 'apps/web/app/(dashboard)/congregation/actions.ts',
  worklog: 'apps/web/components/worklog/worklog-tabs.tsx',
  audit: 'apps/web/components/admin/devices-licenses-tab.tsx',
  egyhf: 'apps/web/components/finance/finance-import/egyhfenntartas/steps/result-step.tsx',
}

/** A testvér e-mail-fájlok: mind a KÖZÖS escHtml-t kell használják. */
const TESTVER_EMAILEK = [
  'apps/web/lib/email/templates/access-request.ts',
  'apps/web/lib/email/templates/device-revoke.ts',
  'apps/web/lib/email/templates/invite.ts',
  'apps/web/lib/restore/alerts.ts',
  'apps/web/lib/google-drive/alerts.ts',
]

/** A három CSV-export — mind a KÖZÖS csvCella-t kell használja. */
const CSV_EXPORTOK = [REL.worklog, REL.audit, REL.egyhf]

function olvas(rel) {
  const p = path.join(ROOT, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

/**
 * Kommentek kiszedése — a szöveges mércék CSAK a valóban lefutó kódot
 * nézhetik. Egy kommentbe írt `escHtml` senkit nem véd meg, és egy kommentben
 * emlegetett régi kvótálás nem hibás kód.
 */
function kommentNelkul(szoveg) {
  return szoveg
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/* ══════════════════════════════════════════════════════════════════════════
   MODUL-ÉPÍTÉS — a TS-forrásokat build nélkül, temp könyvtárban futtatjuk
   ══════════════════════════════════════════════════════════════════════════ */

function tempKonyvtar(nev) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-${nev}-`))
}

function forditsd(forras, fajlNev) {
  return ts.transpileModule(forras, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: fajlNev,
  }).outputText
}

/**
 * A három e-mail-sablon betöltése egy VÁLASZTOTT escape-implementációval.
 * Így tudjuk a „régi világot" (escape nélküli állapot) is lefuttatni.
 */
function epitsdAzEmailModult(escapeForras, sablonForras) {
  const dir = tempKonyvtar('email-injekcio')
  fs.mkdirSync(path.join(dir, 'templates'))
  fs.writeFileSync(path.join(dir, 'escape.js'), forditsd(escapeForras, 'escape.ts'), 'utf8')
  const js = forditsd(sablonForras, 'congregation-transfer.ts')
  // Fail-closed: futásidejű KÜLSŐ (nem relatív) import nem maradhat benne,
  // különben a temp-modul némán mást töltene be, mint amit mérni akarunk.
  if (/require\(["'][^."']/.test(js)) {
    throw new Error('a sablonban futásidejű külső import maradt — a mérés nem hiteles')
  }
  fs.writeFileSync(path.join(dir, 'templates', 'congregation-transfer.js'), js, 'utf8')
  return require_(path.join(dir, 'templates', 'congregation-transfer.js'))
}

function epitsdACsvModult(csvForras) {
  const dir = tempKonyvtar('csv-injekcio')
  const p = path.join(dir, 'csv.js')
  const js = forditsd(csvForras, 'csv.ts')
  if (/require\(["'][^."']/.test(js)) {
    throw new Error('a csv.ts-be futásidejű külső import került — a modulnak önállónak kell maradnia')
  }
  fs.writeFileSync(p, js, 'utf8')
  return require_(p)
}

/* ══════════════════════════════════════════════════════════════════════════
   TÁMADÓ TERHELÉSEK
   ══════════════════════════════════════════════════════════════════════════ */

const INDOK_TAMADAS =
  '</p><p><b>SÜRGŐS</b> <a href="https://tamado.example">kattints</a></p><p>'
const NEV_TAMADAS = 'Kiss János <img src=x onerror=alert(1)>'
const GYULEKEZET_TAMADAS = 'Barátos <script>alert(1)</script>'
const CIMZETT_TAMADAS = 'Nagy Ede" onmouseover="alert(1)'
const LINK_TAMADAS = 'https://kartoteka.app/admin"><script>alert(1)</script><a href="'

/** A veszélyes CSV-kezdőkarakterek, mindegyik VALÓDI képlet-terheléssel. */
const CSV_TAMADASOK = [
  ['egyenlőségjel', '=1+1'],
  ['plusz', '+1+1'],
  ['mínusz', '-1+1'],
  ['kukac', '@SUM(1+1)'],
  ['TAB', '\t=1+1'],
  ['CR', '\r=1+1'],
  ['DDE-parancs', '=cmd|\' /C calc\'!A0'],
]

/* ══════════════════════════════════════════════════════════════════════════
   MÉRCÉK
   ══════════════════════════════════════════════════════════════════════════ */

/** M2 + M3 + M4 — a három e-mail-sablon. */
function ellenorizEmail(M, jelent) {
  // ── M2: az ELSŐ sablon (ez volt a támadási út) ─────────────────────────
  const a = M.transferInitiatedEmail({
    recipientEmail: 'admin@kartoteka.app',
    recipientName: CIMZETT_TAMADAS,
    recipientRole: 'rendszergazda',
    congregationName: GYULEKEZET_TAMADAS,
    fromPastorName: NEV_TAMADAS,
    reason: INDOK_TAMADAS,
    portalUrl: LINK_TAMADAS,
  })
  const h = a.html

  jelent('M2', !h.includes('<a href="https://tamado.example"'),
    'transferInitiatedEmail: a beinjektált adathalász <a href> NINCS a HTML-ben')
  jelent('M2', !h.includes('<b>') && !h.includes('</b>'),
    'transferInitiatedEmail: a beinjektált <b> NINCS a HTML-ben')
  jelent('M2', h.includes('&lt;b&gt;SÜRGŐS&lt;/b&gt;'),
    'transferInitiatedEmail: az indok escape-elt alakban OTT VAN (a szöveg nem vész el)')
  jelent('M2', (h.match(/<a\s/g) || []).length === 1,
    `transferInitiatedEmail: pontosan EGY <a> elem van a levélben (a saját gombunk) — ${(h.match(/<a\s/g) || []).length} db`)
  jelent('M2', !h.includes('<script') && !h.includes('<img'),
    'transferInitiatedEmail: a gyülekezet-névbe / lelkész-névbe írt <script> és <img> nem elem')
  jelent('M2', h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'transferInitiatedEmail: a gyülekezet-név escape-elt alakban van jelen')
  jelent('M2', !h.includes('onmouseover="alert'),
    'transferInitiatedEmail: a címzett nevébe írt attribútum-kitörés nem sikerül')
  jelent('M2', h.includes('href="https://kartoteka.app/admin&quot;&gt;'),
    'transferInitiatedEmail: a portál-link attribútuma nem törhető ki (a " → &quot;)')

  // ── M3: a MÁSODIK és HARMADIK sablon (ne csak az első legyen javítva!) ──
  const b = M.transferCompletedEmail({
    recipientEmail: 'lelkesz@kartoteka.app',
    recipientName: CIMZETT_TAMADAS,
    congregationName: GYULEKEZET_TAMADAS,
    loginUrl: LINK_TAMADAS,
  })
  jelent('M3', !b.html.includes('<script') && !b.html.includes('<img'),
    'transferCompletedEmail: a beinjektált <script>/<img> nem elem')
  jelent('M3', b.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'transferCompletedEmail: a gyülekezet-név escape-elt alakban van jelen')
  jelent('M3', !b.html.includes('onmouseover="alert'),
    'transferCompletedEmail: a címzett nevébe írt attribútum-kitörés nem sikerül')
  jelent('M3', (b.html.match(/<a\s/g) || []).length === 1,
    `transferCompletedEmail: pontosan EGY <a> elem (a saját gombunk) — ${(b.html.match(/<a\s/g) || []).length} db`)

  const c = M.transferInviteEmail({
    recipientEmail: 'uj@kartoteka.app',
    congregationName: GYULEKEZET_TAMADAS,
    registerUrl: LINK_TAMADAS,
  })
  jelent('M3', !c.html.includes('<script'),
    'transferInviteEmail: a beinjektált <script> nem elem')
  jelent('M3', c.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'transferInviteEmail: a gyülekezet-név escape-elt alakban van jelen')
  jelent('M3', (c.html.match(/<a\s/g) || []).length === 1,
    `transferInviteEmail: pontosan EGY <a> elem (a saját gombunk) — ${(c.html.match(/<a\s/g) || []).length} db`)

  // ── M4: a text/plain rész NYERS marad (nem rontottuk el a levelet) ──────
  jelent('M4', a.text.includes(INDOK_TAMADAS) && !a.text.includes('&lt;'),
    'transferInitiatedEmail: a szöveges változat entitás nélkül, nyersen tartalmazza az indokot')
  jelent('M4', a.subject.includes(GYULEKEZET_TAMADAS),
    'transferInitiatedEmail: a tárgy a nyers gyülekezet-nevet viszi (nem entitásosat)')
  // Hétköznapi adat: a levél a NORMÁL szöveget változatlanul mutassa
  const normal = M.transferInitiatedEmail({
    recipientEmail: 'admin@kartoteka.app',
    recipientName: 'Kovács Péter',
    recipientRole: 'számvevő',
    congregationName: 'Barátos',
    fromPastorName: 'Szőcs Endre',
    reason: 'Másik gyülekezetbe helyeztek át 2026 szeptemberétől.',
    portalUrl: 'https://kartoteka.app/dashboard',
  })
  jelent('M4',
    normal.html.includes('Kovács Péter,') &&
    normal.html.includes('<strong>Szőcs Endre</strong>') &&
    normal.html.includes('Másik gyülekezetbe helyeztek át 2026 szeptemberétől.') &&
    normal.html.includes('href="https://kartoteka.app/dashboard"'),
    'a HÉTKÖZNAPI levél változatlan: név, gyülekezet, indok és link torzítás nélkül')
}

/** M5 + M6 — a CSV-cellakódolás. */
function ellenorizCsv(M, jelent) {
  const { csvCella } = M

  // ── M5: a veszélyes kezdőkarakterek ────────────────────────────────────
  jelent('M5', csvCella('=1+1') === `"'=1+1"`,
    `csvCella('=1+1') → ${JSON.stringify(csvCella('=1+1'))} (várt: "'=1+1")`)
  for (const [nev, terheles] of CSV_TAMADASOK) {
    const ki = csvCella(terheles)
    const jo = ki === `"'${terheles}"`
    jelent('M5', jo, `${nev}: ${JSON.stringify(terheles)} → ${JSON.stringify(ki)} (szöveggé kényszerítve)`)
  }
  // A kvótálás lefejtése UTÁN sem kezdődhet képlet-karakterrel a tartalom
  for (const [nev, terheles] of CSV_TAMADASOK) {
    const belso = csvCella(terheles).slice(1, -1).replace(/""/g, '"')
    jelent('M5', /^'/.test(belso),
      `${nev}: a kvótálás lefejtése után is aposztróffal kezdődik (az Excel nem értékeli ki)`)
  }

  // ── M6: a hétköznapi adat és a szám VÁLTOZATLAN ────────────────────────
  jelent('M6', csvCella('Vasárnapi istentisztelet') === '"Vasárnapi istentisztelet"',
    `normál szöveg érintetlen: ${JSON.stringify(csvCella('Vasárnapi istentisztelet'))}`)
  jelent('M6', csvCella('Jn 3,16 — Mert úgy szerette Isten') === '"Jn 3,16 — Mert úgy szerette Isten"',
    'alapige (vessző, gondolatjel, ékezet) érintetlen')
  jelent('M6', csvCella('idézőjeles "szöveg"') === '"idézőjeles ""szöveg"""',
    `RFC4180 kvótálás megmaradt: ${JSON.stringify(csvCella('idézőjeles "szöveg"'))}`)
  jelent('M6', csvCella(null) === '""' && csvCella(undefined) === '""',
    'null / undefined → üres cella (nem „null" felirat)')
  jelent('M6', csvCella(1500) === '"1500"' && csvCella(0) === '"0"',
    'egész szám érintetlen')
  jelent('M6', csvCella(-500) === '"-500"',
    `NEGATÍV összeg SZÁM marad (nem lesz aposztrófos szöveg): ${JSON.stringify(csvCella(-500))}`)
  jelent('M6', csvCella('-1,5') === '"-1,5"' && csvCella('-2.75') === '"-2.75"',
    'negatív tizedes érték is szám marad (magyar és angol tizedesjellel)')
  jelent('M6', csvCella('2026-08-24') === '"2026-08-24"',
    'ISO-dátum érintetlen')
}

/** M7 — bekötés: a közös helperek TÉNYLEG be vannak kötve, másolat nincs. */
function ellenorizBekotes(forrasok, jelent) {
  const sablon = forrasok[REL.sablon]
  if (sablon === null) { jelent('M7', false, `${REL.sablon}: nem olvasható`); return }
  const sablonKod = kommentNelkul(sablon)
  jelent('M7', /import \{ escHtml \} from '\.\.\/escape'/.test(sablonKod),
    `${REL.sablon}: a KÖZÖS escHtml-t importálja`)
  jelent('M7', !/function escHtml\s*\(/.test(sablonKod),
    `${REL.sablon}: nincs benne helyi escHtml-másolat`)

  for (const rel of TESTVER_EMAILEK) {
    const f = forrasok[rel]
    if (f === null) { jelent('M7', false, `${rel}: nem olvasható`); continue }
    const kod = kommentNelkul(f)
    jelent('M7', /import \{ escHtml \} from '(\.\.\/escape|@\/lib\/email\/escape)'/.test(kod),
      `${rel}: a KÖZÖS escHtml-t importálja (nem saját másolat)`)
    jelent('M7', !/function escHtml\s*\(/.test(kod),
      `${rel}: a helyi escHtml-másolat megszűnt`)
  }

  for (const rel of CSV_EXPORTOK) {
    const f = forrasok[rel]
    if (f === null) { jelent('M7', false, `${rel}: nem olvasható`); continue }
    const kod = kommentNelkul(f)
    jelent('M7', /import \{ csvCella \} from '@\/lib\/utils\/csv'/.test(kod),
      `${rel}: a KÖZÖS csvCella-t importálja`)
    jelent('M7', /csvCella\(/.test(kod),
      `${rel}: ténylegesen hívja is a csvCella-t`)
    jelent('M7', !/replace\(\/"\/g,\s*'""'\)/.test(kod),
      `${rel}: nincs benne saját, védtelen kvótálás`)
  }
}

/** M8 — az átadás-indítás bemenete zod-séma alatt van. */
function ellenorizSema(forrasok, jelent) {
  const f = forrasok[REL.actions]
  if (f === null) { jelent('M8', false, `${REL.actions}: nem olvasható`); return }
  const kod = kommentNelkul(f)

  jelent('M8', /const transferInitiateSchema = z\.object\(/.test(kod),
    `${REL.actions}: létezik a transferInitiateSchema`)
  jelent('M8', /reason:\s*z\.string\(\)\.trim\(\)\.max\(500\b/.test(kod),
    `${REL.actions}: a reason mezőn .trim().max(500) korlát áll`)

  // A függvény TÖRZSE: a következő top-szintű export-ig
  const kezdet = kod.indexOf('export async function initiateCongregationTransfer')
  const torzs = kezdet === -1 ? '' : kod.slice(kezdet).split(/\nexport (?:async )?(?:function|interface|const)/)[0]
  jelent('M8', kezdet !== -1, `${REL.actions}: megvan az initiateCongregationTransfer`)
  jelent('M8', /transferInitiateSchema\.safeParse\(input\)/.test(torzs),
    'a törzs safeParse-szal validálja a bemenetet')
  jelent('M8', !/input\.reason/.test(torzs),
    'a törzs SEHOL nem nyúl a nyers input.reason-höz (a séma kimenetét használja)')
  jelent('M8', !/input\.congregationId/.test(torzs),
    'a törzs SEHOL nem nyúl a nyers input.congregationId-hoz')
}

/** M1 — szintaxis. */
function ellenorizSzintaxis(forrasok, jelent) {
  for (const rel of [...Object.values(REL), ...TESTVER_EMAILEK]) {
    const f = forrasok[rel]
    if (f === null) { jelent('M1', false, `${rel}: nem olvasható`); continue }
    const sf = ts.createSourceFile(
      path.basename(rel), f, ts.ScriptTarget.Latest, true,
      rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const diags = sf.parseDiagnostics ?? []
    const elso = diags.length
      ? ` — első: ${ts.flattenDiagnosticMessageText(diags[0].messageText, ' ')} (pozíció ${diags[0].start})`
      : ''
    jelent('M1', diags.length === 0, `${rel}: elemezhető${elso}`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FUTTATÓ
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Egy teljes mérés. A `vilag` írja le, MELYIK forrásokból épüljön a világ —
 * így ugyanaz a mérce-készlet futtatható az ÉLES és a „régi" állapotra is.
 */
function meres(cimke, vilag, { csendes = false } = {}) {
  const bukott = new Set()
  const uzenetek = []
  const jelent = (merce, ok, uzenet) => {
    if (!csendes) console.log(`   ${ok ? '✓' : '✗'} ${ok ? '' : `[${merce}] `}${uzenet}`)
    if (!ok) { bukott.add(merce); uzenetek.push(`${merce}: ${uzenet}`) }
  }
  if (!csendes) console.log(`\n── ${cimke} ──`)

  if (vilag.szintaxis) ellenorizSzintaxis(vilag.forrasok, jelent)

  if (vilag.email) {
    try {
      ellenorizEmail(epitsdAzEmailModult(vilag.email.escape, vilag.email.sablon), jelent)
    } catch (err) {
      jelent('M2', false, `az e-mail-modul nem tölthető be: ${err instanceof Error ? err.message : err}`)
      bukott.add('M3'); bukott.add('M4')
    }
  }
  if (vilag.csv) {
    try {
      ellenorizCsv(epitsdACsvModult(vilag.csv), jelent)
    } catch (err) {
      jelent('M5', false, `a csv-modul nem tölthető be: ${err instanceof Error ? err.message : err}`)
      bukott.add('M6')
    }
  }
  if (vilag.bekotes) ellenorizBekotes(vilag.forrasok, jelent)
  if (vilag.sema) ellenorizSema(vilag.forrasok, jelent)

  return { bukott, uzenetek }
}

/* ── FORRÁSOK BEOLVASÁSA ─────────────────────────────────────────────────── */
const FORRASOK = {}
for (const rel of [...Object.values(REL), ...TESTVER_EMAILEK]) FORRASOK[rel] = olvas(rel)

const hianyzo = Object.entries(FORRASOK).filter(([, v]) => v === null).map(([k]) => k)
if (hianyzo.length) {
  console.error(`FAIL: hiányzó forrásfájl(ok): ${hianyzo.join(', ')}`)
  process.exit(1)
}

console.log('═══ INJEKCIÓ-VÉDELEM ÖNELLENŐRZÉS (B10 + B14) ═══')

const ELES = meres('ÉLES ÁLLAPOT', {
  szintaxis: true,
  forrasok: FORRASOK,
  email: { escape: FORRASOK[REL.escape], sablon: FORRASOK[REL.sablon] },
  csv: FORRASOK[REL.csv],
  bekotes: true,
  sema: true,
})

/* ══════════════════════════════════════════════════════════════════════════
   M9 — NEGATÍV ASSZERT
   A „régi világ" a MAI forrásból, string-átalakítással. Ha egy átalakítás NEM
   fog (elmozdult horgony), az őrszem SZÓL — nem hallgat el vakon.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M9: negatív asszert (a RÉGI világ és a mutánsok BUKJANAK) ──')

const negativHibak = []

/**
 * Egy string-átalakítás FAIL-CLOSED alkalmazása: ha a horgony elmozdult és a
 * csere nem fog, azt HIBAKÉNT jelentjük — különben a negatív asszert némán
 * a JAVÍTOTT forrást mérné, és vakká válna.
 */
function atalakit(nev, forras, mit, mire) {
  const uj = forras.replace(mit, mire)
  if (uj === forras) {
    negativHibak.push(`${nev}: az átalakítás NEM fogott (elmozdult horgony) — a negatív asszert vak lenne`)
    console.log(`   ✗ ${nev} — az átalakítás nem fogott`)
    return null
  }
  return uj
}

/** Egy „régi világ" mérése: a megadott mércéknek EL KELL BUKNIUK. */
function varjukABukast(nev, vilag, mercek) {
  const r = meres(nev, vilag, { csendes: true })
  const hianyzoBukas = mercek.filter((m) => !r.bukott.has(m))
  if (hianyzoBukas.length) {
    negativHibak.push(`${nev}: a(z) ${hianyzoBukas.join(', ')} mérce NEM bukott el rajta (vak őr!)`)
    console.log(`   ✗ ${nev} → ${hianyzoBukas.join(', ')} ÁTMEGY (vak őr!)`)
  } else {
    console.log(`   ✓ ${nev} → ${mercek.join(', ')} elbukik (helyes)`)
  }
  return r
}

/* ── N1: a JAVÍTÁS ELŐTTI e-mail-világ ───────────────────────────────────
   Az escHtml törzsét azonosság-függvényre cseréljük. Ez PONTOSAN az az
   állapot, ami 2026-08-24 előtt élt: a congregation-transfer.ts sablonjai
   nyersen fűzték be az értékeket. */
const REGI_ESCAPE = atalakit(
  'N1 előkészítés — escHtml → azonosság-függvény',
  FORRASOK[REL.escape],
  /export function escHtml\(s: string\): string \{[\s\S]*?\n\}/,
  'export function escHtml(s: string): string {\n  return s\n}',
)
if (REGI_ESCAPE) {
  // Kettős biztosíték: a mutált escHtml TÉNYLEG azonosság-függvény legyen.
  const dir = tempKonyvtar('regi-escape')
  const p = path.join(dir, 'escape.js')
  fs.writeFileSync(p, forditsd(REGI_ESCAPE, 'escape.ts'), 'utf8')
  const { escHtml } = require_(p)
  if (escHtml('<b>&"') !== '<b>&"') {
    negativHibak.push('N1: a „régi" escHtml nem azonosság-függvény — a régi világ nem hiteles')
    console.log('   ✗ N1 — a mutált escHtml nem azonosság-függvény')
  } else {
    varjukABukast(
      'N1 — RÉGI VILÁG: a sablonok escape NÉLKÜL fűznek (a 2026-08-24 előtti állapot)',
      { forrasok: FORRASOK, email: { escape: REGI_ESCAPE, sablon: FORRASOK[REL.sablon] } },
      ['M2', 'M3'],
    )
  }
}

/* ── N2: CSAK AZ ELSŐ sablon escape-el (a második-harmadik kimarad) ───────
   Ez a valóságos „félig megcsinált javítás": a `transferCompletedEmail`-től
   lefelé kivesszük az escape-et. Az M2 (első sablon) ÁTMEGY, az M3 BUKIK —
   ezért nem elég az első sablont megnézni. */
{
  const forras = FORRASOK[REL.sablon]
  const vagas = forras.indexOf('export function transferCompletedEmail')
  if (vagas === -1) {
    negativHibak.push('N2: nem található a transferCompletedEmail — elmozdult horgony')
    console.log('   ✗ N2 — elmozdult horgony')
  } else {
    const fej = forras.slice(0, vagas)
    const farok = forras.slice(vagas).replace(/escHtml\(/g, 'String(')
    const mutans = fej + farok
    if (mutans === forras) {
      negativHibak.push('N2: a mutáció nem fogott (a 2–3. sablonban nincs escHtml?)')
      console.log('   ✗ N2 — a mutáció nem fogott')
    } else {
      const r = varjukABukast(
        'N2 — MUTÁNS: csak az ELSŐ sablon escape-el',
        { forrasok: FORRASOK, email: { escape: FORRASOK[REL.escape], sablon: mutans } },
        ['M3'],
      )
      if (r.bukott.has('M2')) {
        negativHibak.push('N2: az M2 is elbukott — a mutáció túlnyúlt az első sablonra, a mérés nem éles')
        console.log('   ✗ N2 — a mutáció túlnyúlt az első sablonra')
      }
    }
  }
}

/* ── N3: CSAK az első sablonból tűnik el az escape ────────────────────── */
{
  const forras = FORRASOK[REL.sablon]
  const vagas = forras.indexOf('export function transferCompletedEmail')
  if (vagas !== -1) {
    const mutans = forras.slice(0, vagas).replace(/escHtml\(/g, 'String(') + forras.slice(vagas)
    if (mutans === forras) {
      negativHibak.push('N3: a mutáció nem fogott az első sablonon')
      console.log('   ✗ N3 — a mutáció nem fogott')
    } else {
      varjukABukast(
        'N3 — MUTÁNS: az ELSŐ sablon escape nélkül (a levél, amit mindenki megkap)',
        { forrasok: FORRASOK, email: { escape: FORRASOK[REL.escape], sablon: mutans } },
        ['M2'],
      )
    }
  }
}

/* ── N4: a JAVÍTÁS ELŐTTI CSV-világ ──────────────────────────────────────
   A képlet-őrt kikapcsoljuk (a kezdőkarakter-minta SOHA nem illeszkedik).
   Ekkor a csvCella pontosan azzá degenerálódik, ami a javítás előtt a három
   exportban állt: `"${s.replace(/"/g, '""')}"`. */
const REGI_CSV = atalakit(
  'N4 előkészítés — a képlet-őr kikapcsolása',
  FORRASOK[REL.csv],
  'const KEPLET_KEZDET = /^[=+\\-@\\t\\r]/',
  'const KEPLET_KEZDET = /^(?!)/',
)
if (REGI_CSV) {
  const M = epitsdACsvModult(REGI_CSV)
  // Kettős biztosíték: a „régi" csvCella tényleg a puszta kvótálás legyen.
  if (M.csvCella('=1+1') !== '"=1+1"') {
    negativHibak.push('N4: a „régi" csvCella nem a puszta kvótálás — a régi világ nem hiteles')
    console.log('   ✗ N4 — a mutált csvCella nem a régi kódot játssza vissza')
  } else {
    varjukABukast(
      'N4 — RÉGI VILÁG: puszta kvótálás, képlet-védelem nélkül (a 2026-08-24 előtti állapot)',
      { forrasok: FORRASOK, csv: REGI_CSV },
      ['M5'],
    )
  }
}

/* ── N5: a szám-kivétel elmérgesedése ────────────────────────────────────
   Ha a „tiszta szám" kivétel eltűnik, a -500 aposztrófos SZÖVEGGÉ romlik.
   Az M6 mércének ezt észre kell vennie — különben a védelem némán elrontaná
   a negatív pénzösszegeket. */
const TULBUZGO_CSV = atalakit(
  'N5 előkészítés — a szám-kivétel kiiktatása',
  FORRASOK[REL.csv],
  'const TISZTA_SZAM = /^[+-]?\\d+(?:[.,]\\d+)?$/',
  'const TISZTA_SZAM = /^(?!)/',
)
if (TULBUZGO_CSV) {
  varjukABukast(
    'N5 — MUTÁNS: a negatív összeg is aposztrófos szöveggé válik (elromlik a működő adat)',
    { forrasok: FORRASOK, csv: TULBUZGO_CSV },
    ['M6'],
  )
}

/* ── N6: a kvótálás elvesztése ───────────────────────────────────────────
   Ha a `"` duplázása elmarad, a beírt idézőjel MEZŐT VÁLT — az egész CSV
   elcsúszik. A régi kód ezt helyesen csinálta; a javítás nem ronthatta el. */
const KVOTALATLAN_CSV = atalakit(
  'N6 előkészítés — a " duplázás elhagyása',
  FORRASOK[REL.csv],
  ".replace(/\"/g, '\"\"')",
  '',
)
if (KVOTALATLAN_CSV) {
  varjukABukast(
    'N6 — MUTÁNS: elmarad a " duplázása (a régi, HELYES viselkedés elvesztése)',
    { forrasok: FORRASOK, csv: KVOTALATLAN_CSV },
    ['M6'],
  )
}

/* ── N7: a bekötés visszacsúszása — a worklog-export saját kvótálást használ */
{
  const forras = FORRASOK[REL.worklog]
  const REGI_HIVAS = 'row.map((cell) => `"${String(cell).replace(/"/g, \'""\')}"`)'
  const mutans = atalakit(
    'N7 előkészítés — a munkanapló-export visszatér a saját kvótálásához',
    forras,
    'row.map((cell) => csvCella(cell))',
    REGI_HIVAS,
  )
  if (mutans) {
    varjukABukast(
      'N7 — MUTÁNS: a munkanapló-export megkerüli a közös csvCella-t',
      { forrasok: { ...FORRASOK, [REL.worklog]: mutans }, bekotes: true },
      ['M7'],
    )
  }
}

/* ── N8: a bekötés visszacsúszása — a sablon saját escHtml-másolatot tart */
{
  const mutans = atalakit(
    'N8 előkészítés — a sablon saját escHtml-másolatot kap',
    FORRASOK[REL.sablon],
    "import { escHtml } from '../escape'",
    "function escHtml(s: string): string { return s }",
  )
  if (mutans) {
    varjukABukast(
      'N8 — MUTÁNS: a sablon újra saját escHtml-másolatot tart (széthúzás)',
      { forrasok: { ...FORRASOK, [REL.sablon]: mutans }, bekotes: true },
      ['M7'],
    )
  }
}

/* ── N9: a zod-séma eltűnése az átadás-indításból ────────────────────── */
{
  const mutans = atalakit(
    'N9 előkészítés — a bemenet-validáció kiiktatása',
    FORRASOK[REL.actions],
    'const parsed = transferInitiateSchema.safeParse(input)',
    'const parsed = { success: true, data: input } as const',
  )
  if (mutans) {
    varjukABukast(
      'N9 — MUTÁNS: az átadás-indítás megint séma nélkül fogadja a bemenetet',
      { forrasok: { ...FORRASOK, [REL.actions]: mutans }, sema: true },
      ['M8'],
    )
  }
}

/* ── N10: a hosszkorlát feloldása ─────────────────────────────────────── */
{
  const mutans = atalakit(
    'N10 előkészítés — a 500 karakteres korlát feloldása',
    FORRASOK[REL.actions],
    '.max(500,',
    '.max(500000,',
  )
  if (mutans) {
    varjukABukast(
      'N10 — MUTÁNS: az indok hossza gyakorlatilag korlátlan',
      { forrasok: { ...FORRASOK, [REL.actions]: mutans }, sema: true },
      ['M8'],
    )
  }
}

/* ── ÖSSZEGZÉS ──────────────────────────────────────────────────────────── */
console.log('\n═══ ÖSSZEGZÉS ═══')
console.log(`ÉLES állapot hibái: ${ELES.uzenetek.length}`)
for (const u of ELES.uzenetek) console.log(`  ✗ ${u}`)
console.log(`Negatív asszert hibái: ${negativHibak.length}`)
for (const h of negativHibak) console.log(`  ✗ ${h}`)

if (ELES.uzenetek.length === 0 && negativHibak.length === 0) {
  console.log('\n✅ PASS — mind a kilenc mérce teljesül, és a régi világ elbukik rajtuk.')
  process.exit(0)
}
console.log('\n❌ FAIL')
process.exit(1)
