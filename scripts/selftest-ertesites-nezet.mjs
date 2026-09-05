// selftest-ertesites-nezet.mjs — az értesítések „Apple-chat" nézetének őrszemei
//
// ⛔ MI VOLT A HIBA (2026-09-05, Endre 3. pontja)
//   Az értesítések felülete nem tudta megmondani, KITŐL jött az üzenet; a
//   hírlevél markdownja (`## …`, `**…**`) nyersen jelent meg a csengőben és az
//   oldalon; a csengő némán, `user_id`-őr nélkül írt a kliens-Supabase-be.
//   Az új beszélgetés-nézet a feladó szerint csoportosít, a szerver által
//   renderelt `uzenetHtml`-t mutatja, és minden írást szerver-akcióra bíz.
//
// ŐRSZEMEK
//   B1–B7  beszelgetesek.ts: csoportosítás / rendezés / olvasatlan-szám / szűrő /
//          keresés / autolink / dátum-elválasztó / URL-állapot (transpile + futtatás)
//   B1n    negatív: a RENDEZÉS NÉLKÜLI mutánson az őrszem BUKIK
//   H1–H2  forrás-őr: `dangerouslySetInnerHTML` CSAK az `uzenetHtml`-lel — a
//          szálban (uzenet-torzs.tsx); a csengőben egyáltalán nincs
//   H1n    negatív: a `__html: sor.uzenet` mutánson BUKIK (két változat)
//   T1     az új komponensekben nincs `bg-white` / `text-slate-` / `bg-slate-`
//   C1     a csengő szerver-akcióból él (nincs `.from('ertesitesek')`, van toast.error,
//          realtime `event: '*'`)
//   U1     URL-állapot: `ertesitesUrl` ⇄ `urlAllapot` oda-vissza
//   V1–V2  (bírálói P2) szál-választás CSAK létező szálra: nem illő `?felado=`
//          → nincs választás (mobilon a lista marad); V1n a vakon hívő mutáns
//   R1     (bírálói P1) a realtime topic ELŐFIZETÉSENKÉNT egyedi — a csengő és
//          a /notifications nézet nem oszthat közös csatornát a singleton
//          kliensen; R1n a közös-topic mutáns
//   L1     (bírálói P2) a támogatási válasz mélylinkje a VALÓDI szál-kulcsból
//          épül; a küldő kulcsa = az olvasó kulcsa (két független út)
//   K1–K7  (P3, bírálói P3) a „megoldva" EGY szabálya (uzenetek-shared →
//          megoldasLevezetes): a 2026-09-05 ELŐTTI kérelem-sor ELDŐLT kérelemmel
//          megoldottként jelenik meg (nincs „Válaszra vár", nincs gombpár);
//          ismeretlen kérelem → fail-closed függő; a mellék-lekérés hibája →
//          figyelmeztetés-szöveg, nem néma függő
//   K1n/K3n negatív: a kérelem-ág nélküli és a fail-open mutánson az őr BUKIK
//   K3/K3w (P3-utómunka, bírálói P3) FEHÉRLISTA: egy ismeretlen (a CHECK-en kívüli)
//          állapot NEM döntés; K3w a feketelistás („bármi, ami nem pending") mutáns
//   K6/K6n (bírálói P3) a régi `admin_access:<id>` hivatkozásból CSAK szabályos UUID
//          (a TS és az SQL EGY szabálya — egy rossz alak 22P02-vel az egész darabot
//          elbuktatná); K6n az UUID-szűrő nélküli mutáns
//   K8/K8n (bírálói P2) a KÉRELMEZŐ döntés-sora (success/danger + kérelem-hivatkozás)
//          MAGA A DÖNTÉS: a tartalék-ágon (ismeretlen kérelem, hiányzó oszlop) SEM
//          kap „Válaszra vár" pillt / gombpárt; a lelkész warning-sora ugyanott
//          függő marad (a típus dönt); K8n a döntés-ág nélküli mutáns
//   K9/K9n (bírálói P3) a döntés-soron NINCS „Ez a baj azóta elmúlt … időközben
//          elutasításra került" (mondat/idő null, dontesSor true); K9n a mutáns,
//          amely a döntés-sorra is mondatot ad
//   K10    (bírálói P3) a BEKÖTÉS end-to-end: nyers kérelem-sor → kerelemAllapotTerkep
//          (ugyanaz, amit a kerelemAllapotok hív) → kerelemAzonosito kulcs → szabály
//   S1–S5  forrás-őr: az alakit() az egy szabályt hívja (nincs második); a
//          kérelem-lekérés darabolt, a hibája a válasz `warning` mezőjébe megy
//          — a listában ÉS a csengőben, a számláló-hibától függetlenül (S3n a
//          néma mutáns; S3b/S3bn: a csengő borostyán dobozban kiírja); a nézet
//          kiírja; a pill/gombpár/számláló CSAK a valaszraVarE-n át dönt (S5n a
//          csupasz-adminRequestId mutáns)
//   S1n    (bírálói P3) a `kerelem: undefined` és a saját-térképes mutánson az
//          őr BUKIK — az integrációs pont többé nem vakfolt
//   S6/S6n (bírálói P2) a döntés-sor már BESZÚRÁSKOR megoldva (mindkét döntési
//          ágon, a döntés idejével), az insert-segéd írja, a sémán visszaesik;
//          S6n a megoldva nélkül beszúró mutáns
//   S7/S7n (bírálói P3) a buborék zöld sávja CSAK megoldva ∧ ¬döntés-soron; a
//          Megoldva pill marad; S7n a döntés-soron is sávot rajzoló mutáns

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

const WEB = path.join(ROOT, 'apps/web')
const LIB_SRC = path.join(WEB, 'lib/notifications/beszelgetesek.ts')
const FELADO_SRC = path.join(WEB, 'lib/notifications/felado.ts')
const SHARED_SRC = path.join(WEB, 'lib/notifications/uzenetek-shared.ts')
const IDO_SRC = path.join(WEB, 'lib/utils/idopont-bukarest.ts')
const TORZS_SRC = path.join(WEB, 'components/notifications/uzenet-torzs.tsx')
const BELL_SRC = path.join(WEB, 'components/layout/notification-bell-refined.tsx')
const REALTIME_SRC = path.join(WEB, 'components/notifications/use-ertesites-realtime.ts')
const INBOX_SRC = path.join(WEB, 'components/notifications/ertesites-inbox.tsx')
const ADMIN_SRC = path.join(WEB, 'app/(dashboard)/admin/actions.ts')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** A beszelgetesek modul betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betoltLib(libForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-beszelgetes-'))
  try {
    const idoCjs = path.join(tmp, 'idopont-bukarest.cjs')
    const feladoCjs = path.join(tmp, 'felado.cjs')
    const sharedCjs = path.join(tmp, 'uzenetek-shared.cjs')
    fs.writeFileSync(idoCjs, t(fs.readFileSync(IDO_SRC, 'utf8')))
    fs.writeFileSync(feladoCjs, t(fs.readFileSync(FELADO_SRC, 'utf8')))
    fs.writeFileSync(
      sharedCjs,
      t(fs.readFileSync(SHARED_SRC, 'utf8')).replace(/require\(["']\.\/felado["']\)/g, `require(${JSON.stringify(feladoCjs)})`),
    )
    fs.writeFileSync(
      path.join(tmp, 'beszelgetesek.cjs'),
      t(libForras)
        .replace(/require\(["']@\/lib\/utils\/idopont-bukarest["']\)/g, `require(${JSON.stringify(idoCjs)})`)
        .replace(/require\(["']\.\/felado["']\)/g, `require(${JSON.stringify(feladoCjs)})`)
        .replace(/require\(["']\.\/uzenetek-shared["']\)/g, `require(${JSON.stringify(sharedCjs)})`),
    )
    return require_(path.join(tmp, 'beszelgetesek.cjs'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** A felado modul önállóan (a küldő-oldali kulcs-képlethez, L1). */
function betoltFelado() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-felado-'))
  try {
    const feladoCjs = path.join(tmp, 'felado.cjs')
    fs.writeFileSync(feladoCjs, t(fs.readFileSync(FELADO_SRC, 'utf8')))
    return require_(feladoCjs)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Az uzenetek-shared modul ADOTT forrásszöveggel (a megoldva-szabály mutánsaihoz is). */
function betoltShared(sharedForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-shared-'))
  try {
    const feladoCjs = path.join(tmp, 'felado.cjs')
    fs.writeFileSync(feladoCjs, t(fs.readFileSync(FELADO_SRC, 'utf8')))
    const sharedCjs = path.join(tmp, 'uzenetek-shared.cjs')
    fs.writeFileSync(sharedCjs, t(sharedForras).replace(/require\(["']\.\/felado["']\)/g, `require(${JSON.stringify(feladoCjs)})`))
    return require_(sharedCjs)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ── Fixtúra: 3 feladó, szándékosan ÖSSZEKEVERT sorrendben ─────────────────
function sor(id, extra) {
  return {
    id,
    tipus: 'info',
    cim: `Cím ${id}`,
    uzenet: `Törzs ${id}`,
    olvasva: false,
    archived: false,
    createdAt: '2026-09-01T10:00:00Z',
    readAt: null,
    hivatkozas: null,
    adminRequestId: null,
    congregationNev: null,
    megoldva: false,
    megoldvaAt: null,
    megoldasUzenet: null,
    ...extra,
  }
}
const RENDSZER = { tipus: 'rendszer', nev: 'Kartotéka rendszer', id: null, levezetett: true }
const ADMIN = { tipus: 'rendszergazda', nev: 'Rendszergazda', id: null, levezetett: false }
const GYUL = { tipus: 'gyulekezet', nev: 'Kézdi-Orbai Egyházközség', id: 'g1', levezetett: false }

const SOROK = [
  // Rendszer: 3 olvasott, a legfrissebb 09-03
  sor('r1', { felado: RENDSZER, olvasva: true, createdAt: '2026-09-02T08:00:00Z' }),
  sor('r3', { felado: RENDSZER, olvasva: true, createdAt: '2026-09-03T08:00:00Z' }),
  sor('r2', { felado: RENDSZER, olvasva: true, createdAt: '2026-09-02T09:00:00Z' }),
  // Rendszergazda: 2 sor, 1 olvasatlan, a legfrissebb 09-04 (markdown-hírlevél)
  sor('a2', { felado: ADMIN, olvasva: false, createdAt: '2026-09-04T08:00:00Z', tipus: 'release', uzenet: '## A hírlevélben 2 frissítést küldünk ki:\n\n- **2026-09-03** — X (bugfix)', uzenetFormat: 'markdown', uzenetHtml: '<h2>A hírlevélben…</h2>' }),
  sor('a1', { felado: ADMIN, olvasva: true, createdAt: '2026-09-01T08:00:00Z' }),
  // Gyülekezet: 1 olvasatlan, a legfrissebb 09-05 — és egy archivált
  sor('g1', { felado: GYUL, olvasva: false, createdAt: '2026-09-05T08:00:00Z', adminRequestId: 'req-1' }),
  sor('g0', { felado: GYUL, olvasva: true, archived: true, createdAt: '2026-08-20T08:00:00Z' }),
]

const libNyers = fs.readFileSync(LIB_SRC, 'utf8')
const lib = betoltLib(libNyers)

// B1: csoportosítás + rendezés
const aktiv = lib.szurSorok(SOROK, 'mind')
assert(aktiv.length === 6 && !aktiv.some((s) => s.archived), 'B0: a „mind" szűrő az archiváltat kihagyja (6 sor)')
const besz = lib.csoportositBeszelgetesek(aktiv)
assert(besz.length === 3, `B1: 3 feladó → 3 szál (kapott: ${besz.length})`)
assert(
  besz.map((b) => b.felado.tipus).join(',') === 'gyulekezet,rendszergazda,rendszer',
  `B1: a szálak a legutóbbi üzenet szerint állnak (kapott: ${besz.map((b) => b.felado.tipus).join(',')})`,
)
const adminSzal = besz.find((b) => b.felado.tipus === 'rendszergazda')
assert(adminSzal.sorok.map((s) => s.id).join(',') === 'a1,a2', 'B2: a szálon belül időrend NÖVEKVŐ (régi fent, új lent)')
assert(adminSzal.utolso.id === 'a2', 'B2: az utolsó üzenet a legfrissebb')
const rendszerSzal = besz.find((b) => b.felado.tipus === 'rendszer')
assert(rendszerSzal.sorok.map((s) => s.id).join(',') === 'r1,r2,r3', 'B2: az összekevert bemenet is időrendbe áll')
assert(
  besz.map((b) => b.olvasatlan).join(',') === '1,1,0',
  `B3: olvasatlan-szám szálanként (kapott: ${besz.map((b) => b.olvasatlan).join(',')})`,
)
assert(lib.osszesOlvasatlan(besz) === 2, 'B3: összes olvasatlan = 2')
assert(besz[0].valaszraVar === 1, 'B3: a hozzáférés-kérelem „válaszra vár" a gyülekezeti szálon')
assert(besz.every((b) => b.kulcs === `${b.felado.tipus}:${b.felado.id ?? b.felado.nev.toLowerCase()}`) || besz.every((b) => typeof b.kulcs === 'string' && b.kulcs.startsWith(`${b.felado.tipus}:`)), 'B1: a szál-kulcs a beszelgetesKulcs képletéből jön (típus:…)')

// B4: szűrők — az archívum és a „megtartott" sor
assert(lib.szurSorok(SOROK, 'archivalt').map((s) => s.id).join(',') === 'g0', 'B4: az archívum-szűrő csak az archiváltat adja')
assert(lib.szurSorok(SOROK, 'olvasatlan').map((s) => s.id).sort().join(',') === 'a2,g1', 'B4: az olvasatlan-szűrő csak az olvasatlant adja')
assert(
  lib.szurSorok(SOROK, 'olvasatlan', new Set(['a1'])).map((s) => s.id).sort().join(',') === 'a1,a2,g1',
  'B4: a most olvasottnak jelölt (megtartott) sor NEM tűnik el az olvasatlan-szűrőből',
)

// B5: kivonat markdown-jelek nélkül + keresés ékezet nélkül
const a2 = SOROK.find((s) => s.id === 'a2')
const kiv = lib.sorKivonata({ ...a2, kivonat: undefined })
assert(!kiv.includes('##') && !kiv.includes('**') && kiv.startsWith('A hírlevélben 2 frissítést'), `B5: a markdown-kivonatban nincs ## / ** (kapott: „${kiv}")`)
assert(lib.keresBeszelgetesek(besz, 'kezdi').length === 1 && lib.keresBeszelgetesek(besz, 'kezdi')[0].felado.id === 'g1', 'B5: a keresés ékezet- és kisbetű-független („kezdi" → Kézdi)')
assert(lib.keresBeszelgetesek(besz, '').length === 3, 'B5: üres keresés = minden szál')

// B6: autolink + dátum-elválasztó
const tok = lib.autolinkTokenek('Képernyőkép: https://kartoteka.app/kep.png. Kész.')
assert(
  tok.length === 3 && tok[1].tipus === 'link' && tok[1].ertek === 'https://kartoteka.app/kep.png' && tok[2].ertek === '. Kész.',
  `B6: az autolink a mondatvégi pontot nem viszi a linkbe (kapott: ${JSON.stringify(tok)})`,
)
assert(lib.autolinkTokenek('nincs link').length === 1 && lib.autolinkTokenek('nincs link')[0].tipus === 'szoveg', 'B6: link nélküli szöveg egy szöveg-token')
assert(lib.datumElvalaszto('2026-09-05', '2026-09-05', '2026-09-04') === 'Ma', 'B6: dátum-elválasztó „Ma"')
assert(lib.datumElvalaszto('2026-09-04', '2026-09-05', '2026-09-04') === 'Tegnap', 'B6: dátum-elválasztó „Tegnap"')
assert(/2026.*szeptember.*3/.test(lib.datumElvalaszto('2026-09-03', '2026-09-05', '2026-09-04')), 'B6: régebbi nap → teljes magyar dátum (Bukarest)')
assert(lib.elozoNapKulcs('2026-09-05') === '2026-09-04', 'B6b: előző nap kulcsa')
assert(lib.elozoNapKulcs('2026-03-01') === '2026-02-28', 'B6b: hónap-határ')
assert(lib.elozoNapKulcs('2026-01-01') === '2025-12-31', 'B6b: év-határ')
assert(lib.elozoNapKulcs('nem-datum') === 'nem-datum', 'B6b: hibás kulcs → önmaga (nem dob)')
const blokkok = lib.napiBlokkok(rendszerSzal.sorok)
assert(blokkok.length === 2 && blokkok[0].sorok.length === 2 && blokkok[1].sorok.length === 1, 'B6: napi blokkok (09-02: 2 sor, 09-03: 1 sor)')

// B7 / U1: URL-állapot oda-vissza
const url = lib.ertesitesUrl({ felado: 'gyulekezet:g1', uzenet: 'u1', szuro: 'archivalt' })
assert(url === '/notifications?felado=gyulekezet%3Ag1&uzenet=u1&archivum=1', `U1: ertesitesUrl (kapott: ${url})`)
const vissza = lib.urlAllapot((k) => new URL(`https://x${url}`).searchParams.get(k))
assert(vissza.felado === 'gyulekezet:g1' && vissza.uzenet === 'u1' && vissza.szuro === 'archivalt' && vissza.archivum === true, 'U1: urlAllapot visszaadja a felado/uzenet/archivum állapotot')
assert(lib.ertesitesUrl({ ful: 'kerelmek', kerelem: 'k1' }) === '/notifications?ful=kerelmek&kerelem=k1', 'U1: a kérelmek fül mélylinkje')
assert(lib.ertesitesUrl({}) === '/notifications', 'U1: üres állapot → csupasz útvonal')
assert(lib.urlAllapot(() => null).szuro === 'mind' && lib.urlAllapot(() => null).ful === 'uzenetek', 'U1: paraméter nélkül az alapok')

// B1n NEGATÍV: a „régi világ" — rendezés nélkül — a MAI forrásból
const regiVilag = libNyers.replace('return lista.sort(beszelgetesSorrend)', 'return lista')
if (regiVilag === libNyers) {
  assert(false, 'B1n: a rendezés-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
} else {
  const regiLib = betoltLib(regiVilag)
  const regiBesz = regiLib.csoportositBeszelgetesek(aktiv)
  assert(
    regiBesz.map((b) => b.felado.tipus).join(',') !== 'gyulekezet,rendszergazda,rendszer',
    'B1n: a RENDEZÉS NÉLKÜLI mutánson a szálak sorrendje ROSSZ — az őrszem tud pirosra váltani',
  )
}

// ── H1–H2: forrás-őr — dangerouslySetInnerHTML CSAK uzenetHtml-lel ─────────
/**
 * A kapu szabálya: minden `__html:` értéke VAGY közvetlenül `…uzenetHtml`,
 * VAGY egy azonosító, amelynek deklarációja `uzenetHtml`-ből származik; és a
 * fájlban SEHOL nincs `__html: <valami>.uzenet` (Html nélkül).
 */
function htmlKapu(src) {
  if (/__html:\s*[\w.]*\.uzenet(?!Html)\b/.test(src)) return { ok: false, ok_miert: 'nyers `.uzenet` megy a __html-be' }
  const talalatok = [...src.matchAll(/__html:\s*([\w.]+)/g)]
  for (const m of talalatok) {
    const ertek = m[1]
    if (/uzenetHtml$/.test(ertek)) continue
    const nev = ertek.split('.')[0]
    const dekl = new RegExp(`const\\s+${nev}\\s*=([^\\n]*)`).exec(src)
    if (!dekl) return { ok: false, ok_miert: `a(z) ${nev} deklarációja nem található` }
    if (!/uzenetHtml/.test(dekl[1])) return { ok: false, ok_miert: `a(z) ${nev} nem az uzenetHtml-ből származik` }
    if (/\.uzenet(?!Html)\b/.test(dekl[1])) return { ok: false, ok_miert: `a(z) ${nev} a nyers uzenet-ből is táplálkozik` }
  }
  return { ok: true, darab: talalatok.length }
}

const torzsSrc = fs.readFileSync(TORZS_SRC, 'utf8')
const bellSrc = fs.readFileSync(BELL_SRC, 'utf8')
const torzsKapu = htmlKapu(torzsSrc)
assert(torzsKapu.ok && torzsKapu.darab >= 1, `H1: a szál törzse CSAK az uzenetHtml-t adja a dangerouslySetInnerHTML-nek (${torzsKapu.ok ? `${torzsKapu.darab} hely` : torzsKapu.ok_miert})`)
assert(!bellSrc.includes('dangerouslySetInnerHTML'), 'H2: a csengő-panelben NINCS dangerouslySetInnerHTML (csak kivonat)')
assert(bellSrc.includes('sorKivonata('), 'H2: a csengő a jelek nélküli kivonatot mutatja (sorKivonata)')

// H1n NEGATÍV (két mutáns)
const mutans1 = torzsSrc.replace('__html: html', '__html: sor.uzenet')
if (mutans1 === torzsSrc) assert(false, 'H1n/a: a mutáns NEM különbözik az eredetitől — a negatív asszert vak')
else assert(!htmlKapu(mutans1).ok, 'H1n/a: a `__html: sor.uzenet` mutánson a kapu BUKIK')
const mutans2 = torzsSrc.replace(/const html = [^\n]*/, 'const html = sor.uzenet')
if (mutans2 === torzsSrc) assert(false, 'H1n/b: a mutáns NEM különbözik az eredetitől — a negatív asszert vak')
else assert(!htmlKapu(mutans2).ok, 'H1n/b: a `const html = sor.uzenet` mutánson a kapu BUKIK')

// ── T1: téma-tokenek az új komponensekben ──────────────────────────────────
const TOKEN_FAJLOK = [
  'components/notifications/beszelgetes-lista.tsx',
  'components/notifications/beszelgetes-szal.tsx',
  'components/notifications/uzenet-buborek.tsx',
  'components/notifications/uzenet-torzs.tsx',
  'components/notifications/felado-avatar.tsx',
  'components/notifications/ertesites-inbox.tsx',
  'components/notifications/notifications-tabs.tsx',
  'components/notifications/transfer-request-card.tsx',
  'components/layout/notification-bell-refined.tsx',
]
for (const rel of TOKEN_FAJLOK) {
  const src = fs.readFileSync(path.join(WEB, rel), 'utf8')
  const tiltott = ['bg-white', 'text-slate-', 'bg-slate-'].filter((s) => src.includes(s))
  assert(tiltott.length === 0, `T1: ${rel} — nincs hardkódolt fehér/slate (${tiltott.join(', ') || 'tiszta'})`)
}

// ── C1: a csengő szerver-akcióból él ───────────────────────────────────────
assert(!bellSrc.includes(".from('ertesitesek')"), "C1: a csengő NEM olvas/ír közvetlenül az `ertesitesek` táblába")
assert(bellSrc.includes('listFrissErtesitesekAction'), 'C1: a csengő a listFrissErtesitesekAction-ból tölt')
assert(bellSrc.includes('jelolMindOlvasottnakAction') && bellSrc.includes('toast.error'), 'C1: az „összes olvasottnak" szerver-akció, hibánál toast')
assert(!bellSrc.includes("event: 'INSERT'"), "C1: a csengő nem csak INSERT-re figyel")
assert(bellSrc.includes('DialogContent') === false, 'C1: a régi részletes Dialog kivezetve')
assert(/olvasatlan > 99 \? '99\+'/.test(bellSrc), 'C1: a jelvény 99+ ága a valódi számlálóból')
const realtimeSrc = fs.readFileSync(REALTIME_SRC, 'utf8')
assert(realtimeSrc.includes("event: '*'") && realtimeSrc.includes('user_id=eq.'), "C1: a realtime hook `event: '*'` + saját user_id szűrő")

// ── V1: szál-választás CSAK létező szálra (bírálói P2) ─────────────────────
// A régi világ: `aktivKulcs = allapot.felado ?? …` → a nem illő kulcs `aktiv = null`-t
// adott, mobilon viszont a listát is elrejtette (üres „Tiszta a postaláda" szál).
{
  const v1 = lib.valasztSzal(besz, besz, SOROK, { felado: 'rendszergazda', uzenet: null })
  assert(v1.valasztott === false && v1.aktiv === besz[0], 'V1: nem illő `?felado=` kulcs → NINCS választás (mobilon a lista marad), asztalon az első szál')
  const v2 = lib.valasztSzal(besz, besz, SOROK, { felado: adminSzal.kulcs, uzenet: null })
  assert(v2.valasztott === true && v2.aktiv === adminSzal, 'V1: illő kulcs → a szál nyílik')
  const v3 = lib.valasztSzal(besz, besz, SOROK, { felado: null, uzenet: 'a1' })
  assert(v3.valasztott === true && v3.aktiv === adminSzal, 'V1: `?uzenet=` mélylink feladó nélkül is megtalálja a szálat')
  const v4 = lib.valasztSzal(besz, besz, SOROK, { felado: 'nincs:ilyen', uzenet: 'a1' })
  assert(v4.valasztott === true && v4.aktiv === adminSzal, 'V1: nem illő felado + illő uzenet → az üzenet szála nyílik')
  const v5 = lib.valasztSzal(besz, besz, SOROK, { felado: null, uzenet: 'g0' })
  assert(v5.valasztott === true && v5.aktiv.felado.id === 'g1', 'V1: archivált sor mélylinkje a szálat találja, ha a szál a szűrőben létezik')
  const v6 = lib.valasztSzal([], [], SOROK, { felado: null, uzenet: null })
  assert(v6.valasztott === false && v6.aktiv === null, 'V1: üres lista → nincs szál, nincs választás')
  const v7 = lib.valasztSzal(besz, [], SOROK, { felado: null, uzenet: null })
  assert(v7.valasztott === false && v7.aktiv === null, 'V1: a kereső kiszűrt mindent → nincs alapértelmezett szál')

  // V1n NEGATÍV: a vakon hívő mutáns — az URL kulcsát létezés-ellenőrzés nélkül nyitja
  const vakVilag = libNyers.replace('if (talalat) return { aktiv: talalat, valasztott: true }', 'return { aktiv: talalat ?? null, valasztott: true }')
  if (vakVilag === libNyers) {
    assert(false, 'V1n: a vakon-hívő mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  } else {
    const vak = betoltLib(vakVilag).valasztSzal(besz, besz, SOROK, { felado: 'rendszergazda', uzenet: null })
    assert(vak.valasztott === true && vak.aktiv === null, 'V1n: a vakon hívő mutáns ÜRES szálat nyit — az őrszem tud pirosra váltani')
  }
}

// V2: az inbox a valasztSzal-on át választ, nem az URL-t hiszi el
const inboxSrc = fs.readFileSync(INBOX_SRC, 'utf8')
assert(inboxSrc.includes('valasztSzal('), 'V2: az ertesites-inbox a valasztSzal-lal választ szálat')
assert(!/szalNyitva\s*=\s*!!allapot\.felado/.test(inboxSrc), 'V2: a „szál nyitva" NEM a csupasz `!!allapot.felado` (nem illő kulcs nem rejti el a listát)')

// ── R1: egyedi realtime topic előfizetésenként (bírálói P1) ────────────────
// A singleton kliensen az AZONOS topic KÖZÖS csatorna: a /notifications elhagyása
// a csengő csatornáját is bezárta volna (removeChannel → socket._remove).
assert(!/\.channel\(`ertesitesek-\$\{userId\}`\)/.test(realtimeSrc), 'R1: a realtime topic NEM a csupasz `ertesitesek-${userId}`')
assert(/\.channel\(`ertesitesek-\$\{userId\}-\$\{[A-Za-z_]+\}`\)/.test(realtimeSrc), 'R1: a topic előfizetésenként egyedi utótagot kap')
assert(/^let\s+[A-Za-z_]+\s*=\s*0/m.test(realtimeSrc) && /\+\+[A-Za-z_]+/.test(realtimeSrc), 'R1: az utótag modul-szintű sorszám (StrictMode kettős effektje is két külön csatorna)')
const realtimeMutans = realtimeSrc.replace(/\.channel\(`ertesitesek-\$\{userId\}-\$\{[A-Za-z_]+\}`\)/, '.channel(`ertesitesek-${userId}`)')
assert(
  realtimeMutans !== realtimeSrc && /\.channel\(`ertesitesek-\$\{userId\}`\)/.test(realtimeMutans),
  'R1n: a közös-topic mutánson az őr BUKIK',
)

// ── L1: a támogatási válasz mélylinkje a VALÓDI szál-kulcsból (bírálói P2) ──
const adminSrc = fs.readFileSync(ADMIN_SRC, 'utf8')
assert(!/hivatkozas:\s*'\/notifications\?felado=rendszergazda'/.test(adminSrc), 'L1: a támogatási válasz NEM a halott `?felado=rendszergazda` mélylinkre mutat')
assert(/hivatkozas:\s*ertesitesUrl\(\{\s*felado:\s*feladoMezokKulcsa\(feladoAdat\)\s*\}\)/.test(adminSrc), 'L1: a mélylink a küldő kulcsából (feladoMezokKulcsa → ertesitesUrl) épül')
{
  // Két FÜGGETLEN út: a küldő (feladoMezok → feladoMezokKulcsa) és az olvasó
  // (a DB-sor oszlopai → feladoBontas → beszelgetesKulcs) ugyanazt a kulcsot adja.
  const felado = betoltFelado()
  const mezok = felado.feladoMezok('rendszergazda', 'Szőcs Endre', 'uuid-admin-1')
  const kuldoKulcs = felado.feladoMezokKulcsa(mezok)
  const olvasoKulcs = felado.beszelgetesKulcs(felado.feladoBontas({ tipus: 'support_reply', hivatkozas: `/notifications?felado=${kuldoKulcs}`, ...mezok }))
  assert(kuldoKulcs === 'rendszergazda:uuid-admin-1' && kuldoKulcs === olvasoKulcs, `L1: a küldő mélylink-kulcsa = az olvasó szál-kulcsa (${kuldoKulcs} / ${olvasoKulcs})`)
  assert(kuldoKulcs !== 'rendszergazda', 'L1: a kulcs NEM a csupasz típusnév')
  // …és a mélylink valóban NYIT egy szálat, amelyben egy ilyen sor van
  const sorAdmin = sor('s1', { felado: felado.feladoBontas({ tipus: 'support_reply', ...mezok }), tipus: 'support_reply' })
  const szalak = lib.csoportositBeszelgetesek([sorAdmin])
  const url = lib.ertesitesUrl({ felado: kuldoKulcs })
  const allapot = lib.urlAllapot((k) => new URL(`https://x${url}`).searchParams.get(k))
  const nyit = lib.valasztSzal(szalak, szalak, [sorAdmin], allapot)
  assert(nyit.valasztott === true && nyit.aktiv?.sorok[0]?.id === 's1', `L1: a mélylink (${url}) a támogatási válasz szálát nyitja`)
}

// ── K1–K7: a „megoldva" EGY szabálya — a kérelem TÉNYLEGES állapotából (P3) ──
// A régi világ: a 2026-09-05 előtti döntés a lelkész kérelem-sorát nem jelölte
// meg, a felület pedig CSAK a sor saját jelöléséből döntött → a „Válaszra vár"
// pill és a Jóváhagyás/Elutasítás gombpár örökre ott maradt (a gombok már csak
// „A kérelem már elbírálásra került." hibát adtak).
const sharedNyers = fs.readFileSync(SHARED_SRC, 'utf8')
const shared = betoltShared(sharedNyers)
const K_APPROVED = { status: 'approved', approvedAt: '2026-06-01T10:00:00Z', deniedAt: null, expiresAt: '2026-06-02T10:00:00Z' }
const K_DENIED = { status: 'denied', approvedAt: null, deniedAt: '2026-06-03T10:00:00Z', expiresAt: null }
const K_PENDING = { status: 'pending', approvedAt: null, deniedAt: null, expiresAt: null }
const K_CIM = 'Rendszergazdai hozzáférés kérése'
// Szabályos UUID-k: a kerelemAzonosito CSAK ilyet fogad el (bírálói P3) — a
// térkép kulcsa és az SQL castja ugyanezt az alakot várja.
const REQ_OLD = '0f3c1a2b-4d5e-4f60-8a71-9b82c3d4e5f6'
const REQ_NEW = '7e57c0de-1234-4abc-9def-0123456789ab'
{
  // K1: RÉGI sor (oszlop false / hiányzik, nincs cím-előtag) + ELDŐLT kérelem → megoldott
  // A lelkész KÉRELEM-sora: `warning` + kérelem-hivatkozás (admin/actions.ts írja így).
  const k1 = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_OLD, kerelem: K_APPROVED })
  assert(k1.megoldva === true && k1.dontesSor === false, 'K1: régi kérelem-sor ELDŐLT (approved) kérelemmel → megoldva (és NEM döntés-sor)')
  assert(k1.megoldvaAt === '2026-06-01T10:00:00Z', 'K1: a „mikor" a DÖNTÉS ideje (approved_at), nem a mai nap')
  assert(/jóváhagyásra/.test(k1.megoldasUzenet ?? ''), 'K1: a zöld sáv mondata a döntés fajtáját mondja (jóváhagyás)')
  const k1d = shared.megoldasLevezetes({ megoldvaOszlop: undefined, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_OLD, kerelem: K_DENIED })
  assert(
    k1d.megoldva === true && k1d.megoldvaAt === '2026-06-03T10:00:00Z' && /elutasításra/.test(k1d.megoldasUzenet ?? ''),
    'K1: elutasított kérelem → megoldva, denied_at, elutasítás-mondat (a megoldva oszlop hiánya — undefined — sem zavar)',
  )
  // …és a FELÜLET ugyanebből az EGY mezőből dönt: nincs pill, nincs gombpár, a szál számlálója 0
  const regiSor = sor('k1', { felado: GYUL, tipus: 'warning', adminRequestId: REQ_OLD, megoldva: k1.megoldva, megoldvaAt: k1.megoldvaAt, megoldasUzenet: k1.megoldasUzenet })
  assert(lib.valaszraVarE(regiSor) === false, 'K1: valaszraVarE → false a megoldott kérelem-soron (nincs „Válaszra vár", nincs gombpár)')
  assert(lib.csoportositBeszelgetesek([regiSor])[0].valaszraVar === 0, 'K1: a szál „válaszra vár" számlálója 0')

  // K2: FÜGGŐ kérelem → válaszra vár (a jogos eset változatlan)
  const k2 = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, kerelem: K_PENDING })
  assert(k2.megoldva === false && k2.megoldvaAt === null && k2.megoldasUzenet === null, 'K2: függő kérelem → nem megoldott, nincs levezetett idő/mondat')
  assert(lib.valaszraVarE(sor('k2', { adminRequestId: 'req-p', megoldva: k2.megoldva })) === true, 'K2: valaszraVarE → true a függő kérelmen')

  // K3: ISMERETLEN kérelem (RLS elrejtette / törölték / a lekérés hibája → üres térkép) → FAIL-CLOSED függő
  const k3 = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, kerelem: undefined })
  assert(k3.megoldva === false, 'K3: ismeretlen kérelem → NEM megoldott (fail-closed: valódi függőt sosem rejtünk el)')
  assert(shared.kerelemEldoltE({ status: '', approvedAt: null, deniedAt: null, expiresAt: null }) === false, 'K3: üres státusz → nem eldőlt')
  assert(shared.kerelemEldoltE(null) === false && shared.kerelemEldoltE({ status: 'expired', approvedAt: null, deniedAt: null, expiresAt: null }) === true, 'K3: null → nem eldőlt; expired → eldőlt')
  // K3 (bírálói P3): FEHÉRLISTA — egy ISMERETLEN (a CHECK-en kívüli) állapot NEM döntés,
  // a komment és a kód ugyanazt mondja; a lista = az élő CHECK három döntés-állapota
  assert(shared.kerelemEldoltE({ status: 'foo', approvedAt: null, deniedAt: null, expiresAt: null }) === false, 'K3: ISMERETLEN állapot („foo") → NEM eldőlt (fehérlista, nem „bármi, ami nem pending")')
  assert(shared.kerelemEldoltE({ status: ' Approved ', approvedAt: null, deniedAt: null, expiresAt: null }) === true, 'K3: a fehérlista kisbetű- és szóköz-tűrő („ Approved " → eldőlt)')
  assert([...shared.KERELEM_ELDOLT_ALLAPOTOK].sort().join(',') === 'approved,denied,expired', `K3: KERELEM_ELDOLT_ALLAPOTOK = az élő CHECK döntés-állapotai (approved, denied, expired; kapott: ${[...shared.KERELEM_ELDOLT_ALLAPOTOK].join(',')})`)
  assert(
    shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_OLD, kerelem: { status: 'foo', approvedAt: '2026-06-01T10:00:00Z', deniedAt: null, expiresAt: null } }).megoldva === false,
    'K3: ismeretlen állapotú kérelem → a lelkész sora FÜGGŐ marad (fail-closed), akkor is, ha időbélyeg van rajta',
  )

  // K4: a sor SAJÁT oszlopa és a cím-előtag továbbra is elég (a régi két forrás él)
  const k4 = shared.megoldasLevezetes({ megoldvaOszlop: true, cim: 'X', kerelem: K_PENDING })
  assert(k4.megoldva === true, 'K4: megoldva oszlop true → megoldva (a kérelem-ág nem veszi el)')
  assert(k4.megoldvaAt === null && k4.megoldasUzenet === null, 'K4: a levezetett idő/mondat CSAK a kérelem-ágból jön (függő kérelemnél null)')
  assert(shared.megoldasLevezetes({ megoldvaOszlop: false, cim: `${shared.MEGOLDVA_CIM_ELOTAG}Mentés`, kerelem: undefined }).megoldva === true, 'K4: cím-előtag → megoldva')

  // K5: expired → a lejárat ideje, „lejárt vagy visszavonták"
  const k5 = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: 'X', kerelem: { status: 'expired', approvedAt: '2026-05-01T00:00:00Z', deniedAt: null, expiresAt: '2026-05-02T00:00:00Z' } })
  assert(k5.megoldva === true && k5.megoldvaAt === '2026-05-02T00:00:00Z' && /lejárt/.test(k5.megoldasUzenet ?? ''), 'K5: expired → megoldva, expires_at, lejárt-mondat')

  // K6: az azonosító EGY szabálya — oszlop elsőbbség, régi `admin_access:<uuid>` hivatkozás,
  // CSAK szabályos UUID (bírálói P3: egy rossz alak 22P02-vel az EGÉSZ darabot elbuktatná,
  // és minden kérelem-sor a saját jelölésére esne vissza — a rossz alak ezért már itt null)
  assert(shared.kerelemAzonosito(REQ_NEW, `admin_access:${REQ_OLD}`) === REQ_NEW, 'K6: az admin_request_id oszlop az első')
  assert(shared.kerelemAzonosito(null, `admin_access:${REQ_OLD}`) === REQ_OLD, 'K6: régi sor: a hivatkozás `admin_access:<uuid>` alakjából')
  assert(shared.kerelemAzonosito(null, `admin_access:${REQ_OLD.toUpperCase()}`) === REQ_OLD, 'K6: nagybetűs UUID → kisbetűsen (a térkép kulcsa a PostgREST alakja)')
  assert(shared.kerelemAzonosito(null, 'admin_access:hiv-1') === null && shared.kerelemAzonosito('hiv-1', null) === null, 'K6: ROSSZ alakú azonosító (nem UUID) → null — oszlopból és hivatkozásból egyaránt')
  assert(shared.kerelemAzonosito(null, `admin_access:${REQ_OLD}x`) === null, 'K6: UUID + farok → null (pontos alak, nem előtag-egyezés)')
  assert(
    shared.kerelemAzonosito(null, '/notifications?x=1') === null && shared.kerelemAzonosito(null, 'admin_access:') === null && shared.kerelemAzonosito(undefined, null) === null,
    'K6: más hivatkozás / üres azonosító → null',
  )
  assert(shared.UUID_MINTA.test(REQ_OLD) && !shared.UUID_MINTA.test('hiv-1') && !shared.UUID_MINTA.test(`${REQ_OLD}x`), 'K6: UUID_MINTA = pontos 8-4-4-4-12 hexa alak (az SQL ugyanebből a konstansból castol)')

  // K7: a mellék-lekérés hibája → HANGOS figyelmeztetés (nem néma függő); a rejtett kérelem is nevén nevezve
  const allapotok = new Map([['req-ok', K_APPROVED]])
  const fuggo = { kerelemId: 'req-x', sajatMegoldva: false, archived: false }
  const f1 = shared.kerelemFigyelmeztetes({ hiba: 'permission denied', sorok: [fuggo, { kerelemId: null, sajatMegoldva: false, archived: false }], allapotok: new Map() })
  assert(typeof f1 === 'string' && f1.includes('permission denied') && /1 üzenetnél/.test(f1), `K7: lekérés-hiba + érintett sor → a hibaüzenet és a darabszám a szövegben (kapott: „${f1}")`)
  assert(
    shared.kerelemFigyelmeztetes({ hiba: 'permission denied', sorok: [{ kerelemId: null, sajatMegoldva: false, archived: false }], allapotok: new Map() }) === null,
    'K7: hiba, de egyetlen sor sem hivatkozik kérelemre → nincs mit mondani',
  )
  const f2 = shared.kerelemFigyelmeztetes({ hiba: null, sorok: [fuggo, { kerelemId: 'req-ok', sajatMegoldva: false, archived: false }], allapotok })
  assert(typeof f2 === 'string' && /^1 üzenet/.test(f2) && /nem látsz/.test(f2), `K7: hiba nélkül, de REJTETT (nem látható) kérelem → figyelmeztetés a darabszámmal (kapott: „${f2}")`)
  assert(
    shared.kerelemFigyelmeztetes({ hiba: null, sorok: [{ kerelemId: 'req-x', sajatMegoldva: true, archived: false }, { kerelemId: 'req-y', sajatMegoldva: false, archived: true }], allapotok }) === null,
    'K7: rejtett kérelem, de a sor saját jele megoldva / archivált → nincs figyelmeztetés (nem zaj)',
  )
  assert(shared.kerelemFigyelmeztetes({ hiba: null, sorok: [{ kerelemId: 'req-ok', sajatMegoldva: false, archived: false }], allapotok }) === null, 'K7: minden hivatkozott kérelem látható → nincs figyelmeztetés')

  // K8 (bírálói P2): a KÉRELMEZŐ DÖNTÉS-SORA (success/danger + kérelem-hivatkozás) MAGA A DÖNTÉS.
  // A régi világ: a valaszraVarE MINDEN nem-megoldott, kérelem-hivatkozásos sort válaszra várónak
  // vett → a TARTALÉK-ÁGON (a kérelem-lekérés hibája → üres térkép, ÉS a megoldva oszlop
  // hiányzik / nincs jelölve) a kérelmező a SAJÁT elutasításán kapott „Válaszra vár" pillt és
  // Jóváhagyás/Elutasítás gombot. Most: nincs mire várni — a típus dönt.
  for (const tipus of ['success', 'danger']) {
    const cim = tipus === 'success' ? 'Hozzáférés jóváhagyva' : 'Hozzáférés elutasítva'
    const k8 = shared.megoldasLevezetes({ megoldvaOszlop: undefined, cim, tipus, adminRequestId: REQ_NEW, kerelem: undefined })
    assert(k8.megoldva === true && k8.dontesSor === true, `K8: a kérelmező ${tipus} döntés-sora a tartalék-ágon (ismeretlen kérelem, hiányzó oszlop) is MEGOLDOTT`)
    assert(lib.valaszraVarE(sor(`k8-${tipus}`, { tipus, adminRequestId: REQ_NEW, megoldva: k8.megoldva })) === false, `K8: valaszraVarE → false a kérelmező ${tipus} során (nincs pill, nincs gombpár)`)
  }
  // …a bíráló K-esete: success + adminRequestId + kerelem: undefined + megoldva oszlop true → nem vár válaszra
  const k8o = shared.megoldasLevezetes({ megoldvaOszlop: true, cim: 'Hozzáférés jóváhagyva', tipus: 'success', adminRequestId: REQ_NEW, kerelem: undefined })
  assert(k8o.megoldva === true && lib.valaszraVarE(sor('k8o', { tipus: 'success', adminRequestId: REQ_NEW, megoldva: k8o.megoldva })) === false, 'K8: success + kérelem-hivatkozás + ismeretlen kérelem + megoldva oszlop true → valaszraVarE false')
  // …de a LELKÉSZ kérelem-sora (warning) ugyanezen a tartalék-ágon FÜGGŐ marad — a típus dönt, nem az azonosító
  const k8w = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_NEW, kerelem: undefined })
  assert(k8w.megoldva === false && k8w.dontesSor === false && lib.valaszraVarE(sor('k8w', { tipus: 'warning', adminRequestId: REQ_NEW, megoldva: k8w.megoldva })) === true, 'K8: a lelkész warning kérelem-sora ismeretlen kérelemmel FÜGGŐ marad (fail-closed) — a típus dönt')
  assert(
    shared.kerelemDontesSorE('success', REQ_NEW) && shared.kerelemDontesSorE('danger', REQ_NEW) && !shared.kerelemDontesSorE('warning', REQ_NEW) && !shared.kerelemDontesSorE('success', null) && !shared.kerelemDontesSorE('info', REQ_NEW),
    'K8: kerelemDontesSorE = (success | danger) ∧ kérelem-hivatkozás — más típus / hivatkozás nélkül nem döntés-sor',
  )
  assert([...shared.KERELEM_DONTES_TIPUSOK].sort().join(',') === 'danger,success', 'K8: a döntés-típusok = a notifications/actions.ts két döntés-értesítése (success, danger)')

  // K9 (bírálói P3): a döntés-soron NINCS „Ez a baj azóta elmúlt … időközben elutasításra került"
  // — a sor maga a döntés: megoldva, de sáv nélkül (mondat/idő null, dontesSor true)
  const k9 = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: 'Hozzáférés elutasítva', tipus: 'danger', adminRequestId: REQ_NEW, kerelem: K_DENIED })
  assert(k9.megoldva === true && k9.dontesSor === true && k9.megoldasUzenet === null && k9.megoldvaAt === null, 'K9: a kérelmező danger döntés-sora ELDŐLT kérelemmel: megoldva, de NINCS levezetett mondat/idő (a buborék sávot nem rajzol)')
  const k9s = shared.megoldasLevezetes({ megoldvaOszlop: true, cim: 'Hozzáférés jóváhagyva', tipus: 'success', adminRequestId: REQ_NEW, kerelem: K_APPROVED })
  assert(k9s.dontesSor === true && k9s.megoldasUzenet === null && k9s.megoldvaAt === null, 'K9: a success döntés-sor sem kap „időközben jóváhagyásra került" mondatot')
  const k9w = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_NEW, kerelem: K_DENIED })
  assert(k9w.dontesSor === false && /elutasításra/.test(k9w.megoldasUzenet ?? '') && k9w.megoldvaAt === '2026-06-03T10:00:00Z', 'K9: ugyanaz a kérelem a LELKÉSZ kérelem-során: a sáv mondata és ideje megvan (ott jogos)')

  // K10 (bírálói P3): a BEKÖTÉS end-to-end — a nyers kérelem-sorokból épülő térkép (kerelemAllapotTerkep,
  // UGYANAZ a függvény, amit a kerelemAllapotok hív) kulcsa = a kerelemAzonosito alakja, és a láncon
  // át a régi sor megoldódik. Eddig a `kerelem: undefined` mutáns az alakit()-ban zölden átment.
  const terkep = shared.kerelemAllapotTerkep([
    { id: REQ_OLD.toUpperCase(), status: 'approved', approved_at: '2026-06-01T10:00:00Z', denied_at: null, expires_at: null },
    { id: REQ_NEW, status: null, approved_at: null, denied_at: null, expires_at: null },
  ])
  assert(
    terkep.size === 2 && terkep.has(REQ_OLD) && terkep.get(REQ_OLD).status === 'approved' && terkep.get(REQ_OLD).approvedAt === '2026-06-01T10:00:00Z',
    'K10: a térkép kulcsa KISBETŰS (a nagybetűs id is a kerelemAzonosito alakjára kerül) és az állapot-mezők átjönnek',
  )
  assert(terkep.get(REQ_NEW).status === '' && shared.kerelemEldoltE(terkep.get(REQ_NEW)) === false, 'K10: NULL státusz → üres sztring (nem dob, nem eldőlt)')
  const regiId = shared.kerelemAzonosito(null, `admin_access:${REQ_OLD.toUpperCase()}`)
  const lanc = shared.megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: regiId, kerelem: regiId ? terkep.get(regiId) : undefined })
  assert(lanc.megoldva === true && lanc.megoldvaAt === '2026-06-01T10:00:00Z' && lanc.dontesSor === false, 'K10: a lánc végig (nyers sor → térkép → azonosító → szabály): a régi sor megoldott, a döntés idejével')
  const tovabb = shared.kerelemAllapotTerkep([{ id: 'ffffffff-0000-4000-8000-000000000001', status: 'pending', approved_at: null, denied_at: null, expires_at: null }], terkep)
  assert(tovabb === terkep && terkep.size === 3 && terkep.has(REQ_OLD), 'K10: a darabolt lekérés UGYANABBA a térképbe ír (a második darab nem törli az elsőt)')
}

// K1n / K3n NEGATÍV: a régi világ és a fail-open világ — a MAI forrásból
{
  const regi = sharedNyers.replace('startsWith(MEGOLDVA_CIM_ELOTAG) || dontesSor || eldolt', 'startsWith(MEGOLDVA_CIM_ELOTAG) || dontesSor')
  if (regi === sharedNyers) assert(false, 'K1n: a kérelem-ág mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(regi).megoldasLevezetes({ megoldvaOszlop: false, cim: K_CIM, tipus: 'warning', adminRequestId: REQ_OLD, kerelem: K_APPROVED })
    assert(r.megoldva === false, 'K1n: a kérelem-ág NÉLKÜLI mutánson a régi sor FÜGGŐ marad — az őrszem tud pirosra váltani')
  }
  const nyitott = sharedNyers.replace('if (!k) return false', 'if (!k) return true')
  if (nyitott === sharedNyers) assert(false, 'K3n: a fail-open mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(nyitott).megoldasLevezetes({ megoldvaOszlop: false, cim: 'X', kerelem: undefined })
    assert(r.megoldva === true, 'K3n: a FAIL-OPEN mutáns az ismeretlen kérelmet MEGOLDOTTNAK mondja — az őrszem tud pirosra váltani')
  }
  // K3w NEGATÍV (bírálói P3): a FEKETELISTÁS világ — „bármi, ami nem pending" = döntés
  const feketelista = sharedNyers.replace('return KERELEM_ELDOLT_ALLAPOTOK.includes(s)', "return s !== '' && s !== 'pending'")
  if (feketelista === sharedNyers) assert(false, 'K3w: a feketelista-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(feketelista).kerelemEldoltE({ status: 'foo', approvedAt: null, deniedAt: null, expiresAt: null })
    assert(r === true, 'K3w: a FEKETELISTÁS mutáns az ismeretlen állapotot DÖNTÉSNEK veszi — az őrszem tud pirosra váltani')
  }
  // K6n NEGATÍV (bírálói P3): az UUID-szűrő nélküli azonosító — a rossz alak is átmegy (→ 22P02 a lekérésben)
  const laza = sharedNyers.replace('return UUID_MINTA.test(s) ? s.toLowerCase() : null', 'return s ? s.toLowerCase() : null')
  if (laza === sharedNyers) assert(false, 'K6n: az UUID-szűrő nélküli mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(laza).kerelemAzonosito(null, 'admin_access:hiv-1')
    assert(r === 'hiv-1', 'K6n: az UUID-szűrő NÉLKÜLI mutáns a rossz alakot is átengedi — az őrszem tud pirosra váltani')
  }
  // K8n NEGATÍV (bírálói P2): a döntés-ág nélküli szabály — a kérelmező a tartalék-ágon gombot kap
  const dontesNelkul = sharedNyers.replace('startsWith(MEGOLDVA_CIM_ELOTAG) || dontesSor || eldolt', 'startsWith(MEGOLDVA_CIM_ELOTAG) || eldolt')
  if (dontesNelkul === sharedNyers) assert(false, 'K8n: a döntés-ág mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(dontesNelkul).megoldasLevezetes({ megoldvaOszlop: undefined, cim: 'Hozzáférés elutasítva', tipus: 'danger', adminRequestId: REQ_NEW, kerelem: undefined })
    assert(r.megoldva === false && lib.valaszraVarE(sor('k8n', { tipus: 'danger', adminRequestId: REQ_NEW, megoldva: r.megoldva })) === true, 'K8n: a döntés-ág NÉLKÜLI mutánson a kérelmező elutasítás-sora „Válaszra vár" — az őrszem tud pirosra váltani')
  }
  // K9n NEGATÍV (bírálói P3): a döntés-sorra is mondatot adó szabály — „Ez a baj azóta elmúlt. … elutasításra került."
  const savMindenhol = sharedNyers.replace('const kerelem = eldolt && !dontesSor ? (input.kerelem ?? null) : null', 'const kerelem = eldolt ? (input.kerelem ?? null) : null')
  if (savMindenhol === sharedNyers) assert(false, 'K9n: a sáv-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else {
    const r = betoltShared(savMindenhol).megoldasLevezetes({ megoldvaOszlop: false, cim: 'Hozzáférés elutasítva', tipus: 'danger', adminRequestId: REQ_NEW, kerelem: K_DENIED })
    assert(typeof r.megoldasUzenet === 'string' && /elutasításra/.test(r.megoldasUzenet), 'K9n: a döntés-sorra is mondatot adó mutánson az önellentmondó sáv visszajön — az őrszem tud pirosra váltani')
  }
}

// ── S1–S5: forrás-őr — az adatréteg és a nézet EGY szabályból dönt (P3) ────
const ACTIONS_SRC = path.join(WEB, 'lib/notifications/uzenetek-actions.ts')
const DONTES_SRC = path.join(WEB, 'app/(dashboard)/notifications/actions.ts')
const INSERT_SRC = path.join(WEB, 'lib/notifications/ertesites-insert.ts')
const PAGE_SRC = path.join(WEB, 'app/(dashboard)/notifications/page.tsx')
const BUBOREK_SRC = path.join(WEB, 'components/notifications/uzenet-buborek.tsx')
const LISTA_SRC = path.join(WEB, 'components/notifications/beszelgetes-lista.tsx')
{
  const actionsSrc = fs.readFileSync(ACTIONS_SRC, 'utf8')
  // S1: az alakit() az egy szabályt hívja — nincs saját (második) szabály
  assert(/const adminRequestId = kerelemAzonosito\(r\.admin_request_id, r\.hivatkozas\)/.test(actionsSrc), 'S1: az alakit() az azonosítót a kerelemAzonosito egy szabályából veszi')
  assert(/const megoldas = megoldasLevezetes\(\{/.test(actionsSrc) && /megoldva: megoldas\.megoldva/.test(actionsSrc), 'S1: az alakit() a megoldva mezőt a megoldasLevezetes egy szabályából tölti')
  assert(/megoldvaAt: r\.megoldva_at \?\? megoldas\.megoldvaAt/.test(actionsSrc) && /megoldasUzenet: r\.megoldas_uzenet \?\? megoldas\.megoldasUzenet/.test(actionsSrc), 'S1: a sor saját időbélyege/mondata az első, a kérelemből levezetett a tartalék')
  assert(!/cim\.startsWith\(MEGOLDVA_CIM_ELOTAG\)/.test(actionsSrc) && !/r\.admin_request_id \?\?/.test(actionsSrc), 'S1: az akció-fájlban NINCS második szabály (a régi cím-előtag / hivatkozás-parse alak)')
  // S1 (bírálói P3 — a BEKÖTÉS): az alakit() a kérelem állapotát a térképből, a típust és az
  // azonosítót is átadja; a kerelemAllapotok a shared tiszta térkép-építőjét hívja (K10 futtatja)
  const bekotesOk = (src) =>
    /kerelem: adminRequestId \? kerelmek\.get\(adminRequestId\) : undefined,/.test(src) &&
    /tipus: r\.tipus,\s*\n\s*adminRequestId,\s*\n\s*kerelem:/.test(src) &&
    /kerelemAllapotTerkep\(\(data \?\? \[\]\) as NyersKerelemSor\[\], allapotok\)/.test(src) &&
    !/allapotok\.set\(/.test(src)
  assert(bekotesOk(actionsSrc), 'S1: az alakit() a hivatkozott kérelem állapotát a térképből adja át (kerelem: kerelmek.get(adminRequestId)), a típussal és az azonosítóval; a térképet a shared kerelemAllapotTerkep építi (nincs saját második)')
  assert(/dontesSor: megoldas\.dontesSor/.test(actionsSrc), 'S1: a dontesSor jel is a szabályból jön (a buborék sávja ebből dönt)')
  {
    // S1n NEGATÍV: a `kerelem: undefined` mutáns — a RÉGI hibás világ az integrációs ponton
    const vakBekotes = actionsSrc.replace('kerelem: adminRequestId ? kerelmek.get(adminRequestId) : undefined,', 'kerelem: undefined,')
    assert(vakBekotes !== actionsSrc && !bekotesOk(vakBekotes), 'S1n: a `kerelem: undefined` (bekötés nélküli) mutánson az őr BUKIK')
    // …és a saját (második) térkép-építős mutáns
    const sajatTerkep = actionsSrc.replace('kerelemAllapotTerkep((data ?? []) as NyersKerelemSor[], allapotok)', "for (const k of data ?? []) allapotok.set(k.id, { status: k.status ?? '', approvedAt: null, deniedAt: null, expiresAt: null })")
    assert(sajatTerkep !== actionsSrc && !bekotesOk(sajatTerkep), 'S1n: a saját (második) térkép-építős mutánson az őr BUKIK')
  }
  // S2: a kérelem-állapotok lekérése darabolt, és a hibája NEM néma
  assert(
    /\.from\('admin_access_requests'\)\s*\n\s*\.select\('id, status, approved_at, denied_at, expires_at'\)\s*\n\s*\.in\('id', idk\.slice\(i, i \+ KERELEM_DARAB\)\)/.test(actionsSrc),
    'S2: a kérelem-állapot az admin_access_requests-ből, KERELEM_DARAB-os darabokban (414-őr)',
  )
  const darab = /const KERELEM_DARAB = (\d+)/.exec(actionsSrc)
  assert(!!darab && Number(darab[1]) <= 100, 'S2: a darab legfeljebb 100 (a proxy URL-korlátja)')
  assert(/if \(error\) return \{ allapotok: new Map\(\), hiba: error\.message \}/.test(actionsSrc), 'S2: a lekérés hibája ÜRES térképpel + hiba-szöveggel tér vissza (nem catch, nem néma)')
  assert(!/catch\s*\{[^}]*return \{ allapotok/.test(actionsSrc), 'S2: nincs néma catch a kérelem-lekérés körül')
  // S3: a hiba a válaszban utazik — a listában ÉS a csengőben a NEM VÉGZETES `warning` mezőben
  assert(
    /const figyelmeztetes = kerelemAllapotFigyelmeztetes\(nyers, kerelmek\)\s*\n\s*if \(figyelmeztetes\) eredmeny\.warning = figyelmeztetes/.test(actionsSrc),
    'S3: listErtesitesekAction → a figyelmeztetés a válasz `warning` mezőjébe',
  )
  // 2026-09-05 (ellenőrzés-ügynök): a csengőben is a `warning` mezőbe — a számláló-hibától
  // FÜGGETLENÜL (a régi `else if` lánc elnyelte, ha a számláló is hibázott), nem az error-ba
  assert(
    /if \(kerelemFigyelmeztetesSzoveg\) eredmeny\.warning = kerelemFigyelmeztetesSzoveg/.test(actionsSrc) && !/eredmeny\.error = kerelemFigyelmeztetesSzoveg/.test(actionsSrc) && !/else if \(kerelemFigyelmeztetesSzoveg\)/.test(actionsSrc),
    'S3: listFrissErtesitesekAction → a figyelmeztetés a csengő `warning` mezőjébe (nem az error-ba, nem else-if mögött)',
  )
  assert(
    /friss\?\.warning \? \(\s*\n\s*<p role="status"[^\n]*amber[^\n]*>\s*\n\s*\{friss\.warning\}/.test(bellSrc),
    'S3b: a csengő KIÍRJA a friss.warning-ot (borostyán role=status doboz, mint a listában)',
  )
  {
    const bellNema = bellSrc.replace(/\{friss\?\.warning \? \([\s\S]*?\) : null\}\n/, '')
    assert(bellNema !== bellSrc && !/\{friss\.warning\}/.test(bellNema), 'S3bn: a warning-dobozt nem rajzoló (néma) csengő-mutánson az őr BUKIK')
  }
  // S3n NEGATÍV: a néma mutáns — a warning-sor törölve
  const nema = actionsSrc.replace(/\s*if \(figyelmeztetes\) eredmeny\.warning = figyelmeztetes/, '')
  assert(nema !== actionsSrc && !/if \(figyelmeztetes\) eredmeny\.warning = figyelmeztetes/.test(nema), 'S3n: a warning nélküli (néma) mutánson az őr BUKIK')
  // S4: a nézet KIÍRJA
  const pageSrc = fs.readFileSync(PAGE_SRC, 'utf8')
  assert(/kezdoFigyelmeztetes=\{uzenetek\.warning \?\? null\}/.test(pageSrc), 'S4: a /notifications oldal átadja a warning-ot az inboxnak')
  assert(/setFigyelmeztetes\(r\.warning \?\? null\)/.test(inboxSrc) && /\{figyelmeztetes \? \(\s*\n\s*<p role="status"/.test(inboxSrc), 'S4: az inbox frissíti és role="status" dobozban kiírja a figyelmeztetést')
  // S5: a pill, a gombpár és a számláló CSAK a valaszraVarE-n át (= az egy `megoldva` mező) dönt
  const buborekSrc = fs.readFileSync(BUBOREK_SRC, 'utf8')
  const listaSrc = fs.readFileSync(LISTA_SRC, 'utf8')
  assert(/const valaszraVar = valaszraVarE\(sor\)/.test(buborekSrc) && /\{valaszraVar \? \(\s*\n\s*<span[^\n]*\n\s*Válaszra vár/.test(buborekSrc), 'S5: a buborék „Válaszra vár" pillje a valaszraVarE-ből dönt')
  assert(/\{valaszraVar && sor\.adminRequestId \? \(/.test(buborekSrc), 'S5: a Jóváhagyás/Elutasítás gombpár is a valaszraVarE mögött áll')
  assert(!/\{sor\.adminRequestId \? \(/.test(buborekSrc) && !/!sor\.megoldva/.test(buborekSrc), 'S5: a buborékban NINCS második szabály (csupasz adminRequestId / !megoldva feltétel)')
  assert(/b\.valaszraVar > 0 \?/.test(listaSrc) && !/adminRequestId/.test(listaSrc), 'S5: a beszélgetés-lista a szál valaszraVar számlálójából dönt, nem az azonosítóból')
  assert(/const valaszraVar = valaszraVarE\(sor\)/.test(bellSrc) && !/\{sor\.adminRequestId \? \(/.test(bellSrc), 'S5: a csengő pillje is a valaszraVarE-ből dönt')
  assert(/return !!sor\.adminRequestId && !sor\.megoldva && !sor\.archived/.test(libNyers), 'S5: valaszraVarE = adminRequestId ∧ ¬megoldva ∧ ¬archivált — az egyetlen `megoldva` mezőből')
  // S5n NEGATÍV: a buborék-mutáns, amely az azonosítóból dönt (a régi, két-szabályos világ)
  const ketSzabaly = buborekSrc.replace('{valaszraVar ? (', '{sor.adminRequestId ? (')
  assert(ketSzabaly !== buborekSrc && /\{sor\.adminRequestId \? \(/.test(ketSzabaly), 'S5n: a csupasz-adminRequestId mutánson az őr BUKIK')

  // S6 (bírálói P2): a TÁROLT jel EGY szabály szerint — a kérelmező döntés-sora már BESZÚRÁSKOR
  // megoldva, MINDKÉT döntési ágon (jóváhagyás: success, elutasítás: danger), a döntés idejével;
  // az insert-segéd írja is, és a 2026-08-11-es SQL előtti sémán az oszlop nélkül esik vissza.
  // (A kerelemErtesitesMegoldva `.neq('user_id', kérelmező)` szűrője ezért maradhat: a kérelmező
  // sorát nem a döntés utáni frissítés, hanem a beszúrás jelöli — a visszatöltéssel egyezően.)
  const dontesSrc = fs.readFileSync(DONTES_SRC, 'utf8')
  const insertSrc = fs.readFileSync(INSERT_SRC, 'utf8')
  const dontesBeszurasOk = (src) => {
    const blokkok = [...src.matchAll(/await insertErtesites\(\s*\n\s*supabase,\s*\n\s*\{([\s\S]*?)\},\s*\n\s*\{ forras: '(admin-access-[a-z]+)' \}/g)]
    if (blokkok.length !== 2) return { ok: false, miert: `${blokkok.length} döntési beszúrás (2 kell: jóváhagyás + elutasítás)` }
    for (const b of blokkok) {
      const torzs = b[1]
      if (!/admin_request_id: request\.id,/.test(torzs)) return { ok: false, miert: `${b[2]}: nincs admin_request_id` }
      if (!/megoldva: true,/.test(torzs)) return { ok: false, miert: `${b[2]}: nincs megoldva: true` }
      if (!/megoldva_at: dontesIdeje,/.test(torzs)) return { ok: false, miert: `${b[2]}: nincs megoldva_at: dontesIdeje` }
    }
    return { ok: true }
  }
  const s6 = dontesBeszurasOk(dontesSrc)
  assert(s6.ok, `S6: a jóváhagyás ÉS az elutasítás döntés-sora beszúráskor megoldva: true + megoldva_at: dontesIdeje (${s6.ok ? 'mindkét ág' : s6.miert})`)
  assert(/tipus: 'success',[\s\S]*?megoldva: true,/.test(dontesSrc) && /tipus: 'danger',[\s\S]*?megoldva: true,/.test(dontesSrc), 'S6: a success (jóváhagyva) és a danger (elutasítva) sor egyaránt jelölt')
  assert(
    /if \(sor\.megoldva === true\) \{\s*\n\s*rekord\.megoldva = true\s*\n\s*rekord\.megoldva_at = sor\.megoldva_at \?\? new Date\(\)\.toISOString\(\)/.test(insertSrc),
    'S6: az insertErtesites a megoldva + megoldva_at oszlopot írja (időbélyeg nélküli jelölés nincs — a rács 03. sora)',
  )
  assert(/'megoldva',\s*\n\s*'megoldva_at',/.test(insertSrc), 'S6: a megoldva / megoldva_at az ELHAGYHATO_OSZLOPOK-ban (a 2026-08-11-es SQL előtti sémán a sor nélkülük megy be, nem hasal el)')
  {
    // S6n NEGATÍV: az EGYIK ágon megoldva nélkül beszúró mutáns (a RÉGI világ) — a tárolt jel két szabály szerint állna
    const regiBeszuras = dontesSrc.replace(/\s*megoldva: true,\n\s*megoldva_at: dontesIdeje,/, '')
    assert(regiBeszuras !== dontesSrc && !dontesBeszurasOk(regiBeszuras).ok, 'S6n: a megoldva NÉLKÜL beszúró mutánson az őr BUKIK')
    const idoNelkul = insertSrc.replace('rekord.megoldva_at = sor.megoldva_at ?? new Date().toISOString()', '')
    assert(idoNelkul !== insertSrc && !/rekord\.megoldva = true\s*\n\s*rekord\.megoldva_at = /.test(idoNelkul), 'S6n: az időbélyeg nélkül jelölő insert-mutánson az őr BUKIK')
  }

  // S7 (bírálói P3): a zöld „Ez a baj azóta elmúlt" sáv NEM a döntés-soron — a Megoldva pill igen
  assert(/\{sor\.megoldva && !sor\.dontesSor \? \(\s*\n\s*<p[^\n]*emerald/.test(buborekSrc), 'S7: a buborék zöld sávja CSAK megoldva ∧ ¬döntés-soron (a kérelmező elutasításán nincs „elmúlt a baj")')
  assert(/\{sor\.megoldva \? \(\s*\n\s*<span[^\n]*emerald[^\n]*\n[^\n]*\n\s*Megoldva/.test(buborekSrc), 'S7: a Megoldva pill a döntés-soron is látszik (csak a sáv marad el)')
  assert(!/\{sor\.megoldva \? \(\s*\n\s*<p/.test(buborekSrc), 'S7: NINCS csupasz `sor.megoldva`-ra rajzolt sáv')
  {
    const savMindig = buborekSrc.replace('{sor.megoldva && !sor.dontesSor ? (', '{sor.megoldva ? (')
    assert(savMindig !== buborekSrc && (!/\{sor\.megoldva && !sor\.dontesSor \? \(/.test(savMindig) || /\{sor\.megoldva \? \(\s*\n\s*<p/.test(savMindig)), 'S7n: a döntés-soron is sávot rajzoló mutánson az őr BUKIK')
  }
}

// ── Összegzés ──────────────────────────────────────────────────────────────
console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
if (failedCount > 0) {
  console.error(`${failedCount} őrszem BUKOTT.`)
  process.exit(1)
}
process.exit(0)
