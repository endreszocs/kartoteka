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

// ── Összegzés ──────────────────────────────────────────────────────────────
console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
if (failedCount > 0) {
  console.error(`${failedCount} őrszem BUKOTT.`)
  process.exit(1)
}
process.exit(0)
