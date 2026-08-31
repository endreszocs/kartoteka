#!/usr/bin/env node
/**
 * MENTÉS-ELŐELLENŐRZÉS önellenőrzés (2026-08-31, az átvilágító diagnosztika 3. pontja)
 *
 * A PROBLÉMA: a Tétel rögzítő HÁROM külön szerver-hívással ment (bevétel →
 * kiadás → belső mozgás), tranzakció nélkül. Ha egy KÉSŐBBI fázis bukott, a
 * korábbi VÉGLEGESEN bent maradt — részleges, felemás állapot.
 *
 * MIÉRT NEM KOMPENZÁCIÓ A MEGOLDÁS: a „mentsük, majd hiba esetén vonjuk vissza"
 * (saga) minta ELLENŐRZÖTTEN rosszabb volt a réginél — a részleges visszavonás
 * némán elveszejtett sorokat, a dobott hiba dupla könyvelést engedett, és az új
 * visszavonó végpont megkerülte a sztornó-politikát. Tranzakció nélkül a
 * kompenzáció nem tehető biztonságossá.
 *
 * A MEGOLDÁS: ELŐELLENŐRZÉS. A mentés MEGKEZDÉSE ELŐTT egyetlen, tisztán OLVASÓ
 * szerver-hívás átvizsgálja MINDKÉT köteget ugyanazokkal a kapukkal, amelyeken
 * a mentés elbukna. Ha bármi hibás, EL SEM INDUL a mentés — nincs mit
 * visszagörgetni, nem keletkezik részleges állapot.
 *
 * MIT ŐRIZ:
 *  (1) van `ellenorizMentesElore` szerver-akció, amely CSAK OLVAS (nincs benne
 *      insert/update/upsert/delete — új írási vagy törlő felület SOHA);
 *  (2) ugyanazokat a kapukat futtatja, mint a mentés: hatókör + írási kapu +
 *      zod-séma MINDKÉT kötegre + véglegesített-év + iratszám-duplikátum;
 *  (3) a duplikátum-ellenőrzés a KÖTEGEN BELÜLI ütközést is nézi (két azonos
 *      iratszám egy mentésben — a szerver ezt csak a 2. sornál venné észre,
 *      amikor az 1. már bent van);
 *  (4) a kliens a mentés LEGELEJÉN hívja, MINDEN írás előtt — ha hibát ad,
 *      megáll, és semmi nem megy ki;
 *  (5) FAIL-OPEN a hálózatra: ha maga az előellenőrzés nem fut le (offline,
 *      nincs bekötve), a mentés a RÉGI úton megy tovább — az előellenőrzés
 *      kényelem, nem védelem, és soha nem akadályozhatja meg a rögzítést.
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (E1–E5).
 *
 * Futtatás:  node scripts/selftest-mentes-eloellenorzes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'combined-entry-dialog.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Függvényhatáros ablak — a fix hosszú ablak átlóg a szomszédba és vakítja a mutánst. */
function ablak(src, jelzo, vegJelzok) {
  const start = src.indexOf(jelzo)
  if (start < 0) return null
  let end = src.length
  for (const v of vegJelzok) {
    const i = src.indexOf(v, start + jelzo.length)
    if (i >= 0 && i < end) end = i
  }
  return src.slice(start, end)
}

function asszertek(files, jelent) {
  let helyi = 0
  const hiba = (msg) => { helyi++; if (jelent) bukik(msg) }
  const jo = (msg) => { if (jelent) pass(msg) }

  const act = stripComments(files.get(ACTIONS))
  const body = stripComments(files.get(BODY))
  const dlg = stripComments(files.get(DIALOG))

  const elo = ablak(act, 'export async function ellenorizMentesElore', ['\nexport async function'])
  if (!elo) {
    hiba('nincs ellenorizMentesElore szerver-akció — a mentés továbbra is félúton bukhat el')
    return helyi
  }

  // (1) ⛔ CSAK OLVAS — semmilyen írási/törlő művelet
  const irasok = ['.insert(', '.update(', '.upsert(', '.delete(']
  const talaltIras = irasok.filter((m) => elo.includes(m))
  if (talaltIras.length === 0) {
    jo('előellenőrzés: CSAK OLVAS (nincs új írási vagy törlő felület)')
  } else {
    hiba(`az előellenőrzés ír vagy töröl (${talaltIras.join(', ')}) — új támadási/adatvesztési felület`)
  }

  // (2) ugyanazok a kapuk, mint a mentésnél
  const kapuk = [
    ['getFinanceScope()', 'hatókör'],
    ['financeWriteBlock(scope)', 'írási kapu'],
    ['incomeBatchSchema.safeParse', 'bevétel zod-séma'],
    ['expenseBatchSchema.safeParse', 'kiadás zod-séma'],
    ['assertYearsNotFinalizedForCreate', 'véglegesített-év kapu'],
  ]
  const hianyzo = kapuk.filter(([minta]) => !elo.includes(minta)).map(([, nev]) => nev)
  if (hianyzo.length === 0) {
    jo('előellenőrzés: a mentés MINDEN kapuját futtatja (hatókör, írás, zod ×2, év-zár)')
  } else {
    hiba(`az előellenőrzésből hiányzik: ${hianyzo.join(', ')} — a mentés máson bukna el, mint amit előre néztünk`)
  }

  // (3) iratszám-duplikátum: DB-ben ÉS a kötegen BELÜL is
  if (elo.includes('checkReceiptDuplicateUseCase') && elo.includes('checkExpenseReceiptDuplicateUseCase')) {
    jo('előellenőrzés: iratszám-duplikátum mindkét oldalon (a leggyakoribb bukás-ok)')
  } else {
    hiba('az előellenőrzés nem nézi az iratszám-duplikátumot — pont a leggyakoribb bukás maradna félútra')
  }
  if (elo.includes('kotegenBeluliIratszamUtkozes')) {
    jo('előellenőrzés: a KÖTEGEN BELÜLI iratszám-ütközést is elkapja')
  } else {
    hiba('a kötegen belüli iratszám-ütközés nincs ellenőrizve — a 2. azonos sor bukna, az 1. már bent lenne')
  }

  // (4) a kliens a LEGELEJÉN hívja — minden írás előtt
  const mentes = ablak(body, 'async function handleSaveInner', ['\n  const dateInvalid'])
  // A FAIL-OPEN jelző KOMMENTBEN él (a `catch` üres törzsében), ezért ahhoz a NYERS
  // forrásból is vágunk ablakot — a stripComments különben kitörölné.
  const mentesNyers = ablak(files.get(BODY), 'async function handleSaveInner', ['\n  const dateInvalid'])
  if (!mentes) {
    hiba('nem található a handleSaveInner')
  } else {
    const eloHely = mentes.indexOf('onPreflightCheck')
    const elsoIras = Math.min(
      ...['await onSaveIncomeBatch(', 'await onSaveExpenseBatch(', 'await onSaveInternalTransfer(']
        .map((m) => { const i = mentes.indexOf(m); return i < 0 ? Number.MAX_SAFE_INTEGER : i }),
    )
    if (eloHely >= 0 && eloHely < elsoIras) {
      jo('kliens: az előellenőrzés MINDEN írás ELŐTT fut (nem keletkezhet részleges állapot)')
    } else {
      hiba('az előellenőrzés nem az első írás előtt fut — a részleges mentés visszatérne')
    }
    // (5) FAIL-OPEN: az előellenőrzés kiesése nem akadályozhatja a rögzítést
    if (mentesNyers && mentesNyers.includes('ELOELLENORZES-FAIL-OPEN')) {
      jo('előellenőrzés: FAIL-OPEN — ha maga nem fut le, a mentés a régi úton megy tovább')
    } else {
      hiba('az előellenőrzés hibája megállítaná a mentést — offline/hibás ellenőrzés esetén nem lehetne rögzíteni')
    }
  }

  // (6) a web-dialógus bekötötte
  if (dlg.includes('onPreflightCheck')) {
    jo('web: a rögzítő-dialógus bekötötte az előellenőrzést')
  } else {
    hiba('a web-dialógus nem köti be az előellenőrzést — sosem futna')
  }

  return helyi
}

function beolvas() {
  const m = new Map()
  for (const fp of [ACTIONS, BODY, DIALOG]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
console.log('— Pozitív asszertek —')
asszertek(files, true)

console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'E1: az előellenőrzés hívásának kivétele — visszatér a részleges mentés',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('onPreflightCheck') ? s.replaceAll('onPreflightCheck', 'nincsEloellenorzes') : null),
  },
  {
    nev: 'E2: az év-zár kapu kivétele az előellenőrzésből',
    fajl: ACTIONS,
    alkalmaz: (s) => {
      const a = ablak(s, 'export async function ellenorizMentesElore', ['\nexport async function'])
      if (!a || !a.includes('assertYearsNotFinalizedForCreate')) return null
      return s.replace(a, a.replaceAll('assertYearsNotFinalizedForCreate', 'nincsEvZar'))
    },
  },
  {
    nev: 'E3: a kötegen belüli iratszám-ütközés ellenőrzésének kivétele',
    fajl: ACTIONS,
    alkalmaz: (s) => (s.includes('kotegenBeluliIratszamUtkozes')
      ? s.replaceAll('kotegenBeluliIratszamUtkozes', 'nemNezzuk')
      : null),
  },
  {
    nev: 'E4: ÍRÁS becsempészése az előellenőrzésbe (új adatvesztési felület)',
    fajl: ACTIONS,
    alkalmaz: (s) => {
      const a = ablak(s, 'export async function ellenorizMentesElore', ['\nexport async function'])
      if (!a) return null
      return s.replace(a, a.replace('  return { ok: true }', "  await scope.supabase.from('befizetes').update({ deleted: true }).eq('id', 1)\n  return { ok: true }"))
    },
  },
  {
    nev: 'E5: a FAIL-OPEN kivétele — az előellenőrzés hibája megállítaná a rögzítést',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('ELOELLENORZES-FAIL-OPEN')
      ? s.replaceAll('ELOELLENORZES-FAIL-OPEN', 'nincs-fail-open')
      : null),
  },
]

for (const m of mutansok) {
  const mm = beolvas()
  const eredeti = mm.get(m.fajl)
  const mutalt = m.alkalmaz(eredeti)
  if (mutalt == null || mutalt === eredeti) {
    bukik(`${m.nev} — a mutáns nem alkalmazható (vak minta?)`)
    continue
  }
  mm.set(m.fajl, mutalt)
  const hibak = asszertek(mm, false)
  if (hibak > 0) pass(`${m.nev} — az őr elkapja (${hibak} asszert bukik)`)
  else bukik(`${m.nev} — az őr VAK erre a mutánsra!`)
}

console.log('')
if (fail > 0) {
  console.error(`${fail} hiba, ${ok} rendben — a mentés-előellenőrzés őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — mentés-előellenőrzés (részleges mentés megelőzése) őr zöld`)
