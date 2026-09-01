#!/usr/bin/env node
/**
 * DESKTOP SORONKÉNTI MENTÉS önellenőrzés (2026-08-31, az átvilágító diagnosztika utolsó pontja)
 *
 * A PROBLÉMA: a web köteg-mentése MINDEN-VAGY-SEMMI (a szerver-akció köztes
 * sorhibánál visszavonja az addigiakat), a DESKTOP viszont SORONKÉNT ír — online
 * és offline egyaránt. Ha az 5 sorból a 3. bukik, az első kettő VÉGLEGESEN bent
 * marad a könyvben, a rögzítő viszont EGYETLEN hibaüzenetet kapott vissza, és
 * EGYETLEN sort sem jelölt meg „elmentve"-ként. Következmény: a felhasználó
 * javít és újra ment → az első két tétel MÁSODSZOR is bekerül (dupla könyvelés),
 * vagy — ha a hibaüzenetnek hisz — kézzel is bevezeti őket.
 *
 * A MEGOLDÁS KÉT RÉTEGŰ:
 *  (1) MEGELŐZÉS — a desktop is futtat ELŐELLENŐRZÉST minden írás előtt
 *      (a web `ellenorizMentesElore`-jének desktop párja): zod, kötegen belüli
 *      iratszám-ütközés, év-zár, iratszám-duplikátum, offline banki/tárca-kapuk.
 *      Ha bármi hibás, a mentés EL SEM INDUL.
 *  (2) BECSÜLETES VISSZAJELZÉS — ha mégis félúton áll meg (hálózat, verseny),
 *      a desktop VISSZAADJA a ténylegesen elmentett sorok azonosítóit
 *      (`savedRowIds`), és a rögzítő MEGJELÖLI őket. A vázlat megmarad
 *      (Endre követelménye), de a bent lévő sorok nem mennek ki másodszor.
 *
 * MIT ŐRIZ:
 *  (1) minden köteg-tétel viszi a FORRÁS-SOR azonosítóját (`sourceRowId`) — a
 *      visszajelzés SOHA nem lehet index-alapú (a köteg rendezve van, és egy
 *      sorból több tétel is lehet: egy nyugta, több befizető);
 *  (2) a desktop mindkét batch-kezelője a HIBA-ágon IS visszaadja a savedRowIds-t;
 *  (3) a rögzítő a hiba-ágon MEGJELÖLI a ténylegesen elmentett sorokat;
 *  (4) a jelölés FAIL-CLOSED: csak a TELJESEN kiment sor kap jelölést (a félig
 *      kiment több befizetős nyugta jelöletlen marad + külön figyelmeztetést kap);
 *  (5) az előellenőrzés kapuja EGYNÉL TÖBB tételre néz, NEM arra, hogy „mindkét
 *      fül tele van" — a desktopon a felemás állapot EGY fülön belül is előáll;
 *  (6) a desktop előellenőrzése TISZTÁN OLVASÓ (nem hív mentő use-case-t, nem
 *      foglal sorszámot a tárcából, nem ír a lokális adatbázisba);
 *  (7) a mentés és az előellenőrzés UGYANABBÓL az input-építőből dolgozik —
 *      különben az előellenőrzés mást vizsgálna, mint amit a mentés kiír.
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (D1–D7).
 *
 * Futtatás:  node scripts/selftest-desktop-soronkenti-mentes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'combined-entry-dialog.tsx')

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

  const body = stripComments(files.get(BODY))
  const desk = stripComments(files.get(DESKTOP))

  // ── (1) sourceRowId: minden köteg-tétel viszi a forrás-sor azonosítóját ──
  const mentesAblak = ablak(body, 'async function handleSaveInner', ['\n  const dateInvalid'])
  if (!mentesAblak) {
    hiba('nem található a handleSaveInner — az őr vak')
    return helyi
  }
  const pushDb = (mentesAblak.match(/(incomeBatch|expenseBatch)\.push\(/g) || []).length
  const sourceDb = (mentesAblak.match(/sourceRowId: r\.id/g) || []).length
  if (pushDb > 0 && sourceDb >= pushDb) {
    jo(`köteg-tételek: mind a ${pushDb} push viszi a forrás-sor azonosítóját (sourceRowId)`)
  } else {
    hiba(`${pushDb} köteg-push van, de csak ${sourceDb} viszi a sourceRowId-t — a visszajelzés nem köthető sorhoz`)
  }
  if (body.includes('sourceRowId?: string')) {
    jo('típus: a köteg-sor deklarálja a sourceRowId-t')
  } else {
    hiba('a köteg-sor típusa nem ismeri a sourceRowId-t')
  }

  // ── (2) a desktop a HIBA-ágon is visszaadja, mi ment el ────────────────
  for (const [jelzo, veg, nev] of [
    ['async function handleIncomeBatch', 'async function handleExpenseBatch', 'bevétel'],
    ['async function handleExpenseBatch', 'async function handlePreflight', 'kiadás'],
  ]) {
    const a = ablak(desk, jelzo, [veg])
    if (!a) { hiba(`nem található a desktop ${nev}-batch kezelője`); continue }
    // MINDEN return-nek, amiben hiba van, vinnie kell a savedRowIds-t.
    // ⚠️ SORALAPÚ mérés: a `[^}]*` minta a template-literál `${i + 1}` kapcsos
    // zárójelénél elvágná a sort, és a savedRowIds-t akkor sem látná, ha ott van.
    const hibasReturnok = a.match(/return \{ error: .*$/gm) || []
    const hianyos = hibasReturnok.filter((r) => !r.includes('savedRowIds'))
    if (hibasReturnok.length > 0 && hianyos.length === 0) {
      jo(`desktop ${nev}: mind a ${hibasReturnok.length} hiba-ág visszaadja az addig elmentett sorokat`)
    } else {
      hiba(`desktop ${nev}: ${hianyos.length} hiba-ág NEM adja vissza a savedRowIds-t — a már bekerült sorok jelöletlenek maradnának (dupla könyvelés)`)
    }
    if (a.includes('savedRowIds.push(row.sourceRowId)')) {
      jo(`desktop ${nev}: minden SIKERES sor azonosítója bekerül a visszajelzésbe`)
    } else {
      hiba(`desktop ${nev}: a sikeres sorok azonosítóját nem gyűjti — üres visszajelzés`)
    }
  }

  // ── (3) a rögzítő a hiba-ágon MEGJELÖLI a ténylegesen elmentett sorokat ──
  const bevHiba = ablak(mentesAblak, 'const res = await onSaveIncomeBatch(', ['const res = await onSaveExpenseBatch('])
  const kiadHiba = ablak(mentesAblak, 'const res = await onSaveExpenseBatch(', ['for (const t of transfers)'])
  for (const [a, nev] of [[bevHiba, 'bevétel'], [kiadHiba, 'kiadás']]) {
    if (!a) { hiba(`nem található a ${nev}-fázis a mentésben`); continue }
    if (a.includes('reszlegesenMentettSorok(') && a.includes('jelolMentettnek(')) {
      jo(`rögzítő ${nev}: a hiba-ág megjelöli a ténylegesen elmentett sorokat`)
    } else {
      hiba(`rögzítő ${nev}: a hiba-ág NEM jelöli meg az elmentett sorokat — az újramentés duplán könyvelné őket`)
    }
    if (a.includes('receiptCacheRef.current.clear()')) {
      jo(`rögzítő ${nev}: részleges mentés után a nyugtaszám-cache ürül (az elkelt számok nem fagynak be)`)
    } else {
      hiba(`rögzítő ${nev}: részleges mentés után a nyugtaszám-cache befagyva marad`)
    }
  }

  // ── (4) FAIL-CLOSED jelölés: csak a TELJESEN kiment sor kap jelölést ────
  const reszAblak = ablak(body, 'export function reszlegesenMentettSorok', ['\nfunction reszlegesUzenet'])
  if (!reszAblak) {
    hiba('nincs reszlegesenMentettSorok — nincs mivel kiértékelni a részleges mentést')
  } else if (reszAblak.includes('db >= osszes') && reszAblak.includes('osszes > 0')) {
    jo('jelölés FAIL-CLOSED: csak az a sor kap „elmentve" jelölést, amelynek MINDEN tétele kiment')
  } else {
    hiba('a jelölés nem fail-closed — a félig kiment (több befizetős) nyugta maradéka NÉMÁN elveszne')
  }

  // ── (5) az előellenőrzés kapuja: EGYNÉL TÖBB tétel, nem „mindkét fül tele" ──
  if (mentesAblak.includes('incomeBatch.length + expenseBatch.length > 1')) {
    jo('előellenőrzés-kapu: EGYNÉL TÖBB tételre fut (a csak-bevétel köteg sem marad ki)')
  } else {
    hiba('az előellenőrzés kapuja nem a tételszámra néz — a leggyakoribb (csak bevétel) eset kimaradna')
  }
  if (mentesAblak.includes('incomeBatch.length > 0 && expenseBatch.length > 0')) {
    hiba('az előellenőrzés csak akkor fut, ha MINDKÉT fül tele van — a desktopon egy fülön belül is keletkezik felemás állapot')
  } else {
    jo('előellenőrzés-kapu: nincs „mindkét fül tele" feltétel')
  }

  // ── (6) a desktop előellenőrzése TISZTÁN OLVASÓ ────────────────────────
  const elo = ablak(desk, 'async function handlePreflight', ['async function handleInternalTransfer'])
  if (!elo) {
    hiba('nincs desktop előellenőrzés (handlePreflight) — a desktop továbbra is félúton bukhat el')
  } else {
    const irok = ['saveIncomeUseCase(', 'saveExpenseUseCase(', 'claimNextIratszamNumber(', 'insertLocal', 'enqueueMutation(', '.insert(', '.update(', '.upsert(', '.delete(']
    const talalt = irok.filter((m) => elo.includes(m))
    if (talalt.length === 0) {
      jo('desktop előellenőrzés: TISZTÁN OLVASÓ (nem ment, nem foglal sorszámot, nem ír a lokális adatbázisba)')
    } else {
      hiba(`a desktop előellenőrzése ÍR (${talalt.join(', ')}) — az „ellenőrzés" maga hozna létre felemás állapotot`)
    }
    const kapuk = [
      ['saveIncomeInputSchema.safeParse', 'bevétel zod-séma'],
      ['saveExpenseInputSchema.safeParse', 'kiadás zod-séma'],
      ['assertYearsNotFinalizedForCreate', 'online év-zár'],
      ['assertYearNotFinalizedOffline', 'offline év-zár'],
      ['checkReceiptDuplicate', 'bevétel iratszám-duplikátum'],
      ['checkExpenseReceiptDuplicate', 'kiadás iratszám-duplikátum'],
      ['getIratszamWalletStatus', 'offline sorszám-tárca fedezete'],
    ]
    const hianyzo = kapuk.filter(([m]) => !elo.includes(m)).map(([, n]) => n)
    if (hianyzo.length === 0) {
      jo('desktop előellenőrzés: a mentés MINDEN kapuját futtatja (zod ×2, év-zár ×2, duplikátum ×2, tárca)')
    } else {
      hiba(`a desktop előellenőrzéséből hiányzik: ${hianyzo.join(', ')} — a mentés máson bukna el, mint amit előre néztünk`)
    }
    if (elo.includes('latott.has(szam)')) {
      jo('desktop előellenőrzés: a KÖTEGEN BELÜLI iratszám-ütközést is elkapja')
    } else {
      hiba('a kötegen belüli iratszám-ütközés nincs ellenőrizve — a 2. azonos sor bukna, az 1. már bent lenne')
    }
  }

  // ── (7) KÖZÖS input-építés: a mentés és az előellenőrzés ugyanazt vizsgálja ──
  if (elo && elo.includes('bevetelInput(') && elo.includes('kiadasInput(')) {
    const ment = ablak(desk, 'async function handleIncomeBatch', ['async function handlePreflight'])
    if (ment && ment.includes('bevetelInput(') && ment.includes('kiadasInput(')) {
      jo('közös input-építés: a mentés ÉS az előellenőrzés ugyanabból az építőből dolgozik')
    } else {
      hiba('a mentés NEM a közös input-építőt használja — az előellenőrzés mást vizsgálna, mint amit a mentés kiír')
    }
  } else if (elo) {
    hiba('az előellenőrzés saját inputot épít — némán széthúzhat attól, amit a mentés kiír')
  }

  // ── (8) a desktop bekötötte az előellenőrzést ──────────────────────────
  if (desk.includes('onPreflightCheck={handlePreflight}')) {
    jo('desktop: a rögzítő-dialógus bekötötte az előellenőrzést')
  } else {
    hiba('a desktop dialógus nem köti be az előellenőrzést — sosem futna')
  }

  return helyi
}

function beolvas() {
  const m = new Map()
  for (const fp of [BODY, DESKTOP]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
console.log('— Pozitív asszertek —')
asszertek(files, true)

console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'D1: a sourceRowId elhagyása a köteg-tételekről — a visszajelzés nem köthető sorhoz',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('sourceRowId: r.id') ? s.replaceAll('sourceRowId: r.id', 'nincsForrasSor: r.id') : null),
  },
  {
    nev: 'D2: a desktop hiba-ága nem adja vissza az addig elmentett sorokat (a RÉGI viselkedés)',
    fajl: DESKTOP,
    alkalmaz: (s) => (s.includes(', savedRowIds, failedIndex: i }')
      ? s.replaceAll(', savedRowIds, failedIndex: i }', ', failedIndex: i }')
      : null),
  },
  {
    nev: 'D3: a rögzítő hiba-ága nem jelöli meg az elmentett sorokat (a RÉGI viselkedés)',
    fajl: BODY,
    alkalmaz: (s) => {
      // A RÉGI világ visszajátszása: a hiba-ág csak toastol, a jelölés kimarad.
      const jel = "          const resz = reszlegesenMentettSorok(incomeBatch, res.savedRowIds)\n"
        + "          if (resz.teljes.length > 0) jelolMentettnek('income', resz.teljes)\n"
      return s.includes(jel) ? s.replace(jel, '') : null
    },
  },
  {
    nev: 'D4: a jelölés fail-closed volta feloldva — a félig kiment nyugta maradéka elveszne',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('if (osszes > 0 && db >= osszes)')
      ? s.replace('if (osszes > 0 && db >= osszes)', 'if (db > 0)')
      : null),
  },
  {
    nev: 'D5: az előellenőrzés kapuja vissza „mindkét fül tele van"-ra — a csak-bevétel köteg kimaradna',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('incomeBatch.length + expenseBatch.length > 1')
      ? s.replace('incomeBatch.length + expenseBatch.length > 1', 'incomeBatch.length > 0 && expenseBatch.length > 0')
      : null),
  },
  {
    nev: 'D6: ÍRÁS becsempészése a desktop előellenőrzésbe (az ellenőrzés maga foglalna sorszámot)',
    fajl: DESKTOP,
    alkalmaz: (s) => {
      const a = ablak(s, '  async function handlePreflight', ['  async function handleInternalTransfer'])
      if (!a) return null
      return s.replace(a, a.replace('    // 1) Zod', "    await offlineBackend?.claimNextIratszamNumber(congregationId, 'befizetes', 2026, 'x')\n    // 1) Zod"))
    },
  },
  {
    nev: 'D7: az előellenőrzés saját inputot épít (széthúzás a mentéstől)',
    fajl: DESKTOP,
    alkalmaz: (s) => {
      const a = ablak(s, '  async function handlePreflight', ['  async function handleInternalTransfer'])
      if (!a || !a.includes('bevetelInput(')) return null
      return s.replace(a, a.replaceAll('bevetelInput(', 'sajatBevetelInput(').replaceAll('kiadasInput(', 'sajatKiadasInput('))
    },
  },
  {
    nev: 'D8: a desktop nem gyűjti a sikeres sorok azonosítóit — üres visszajelzés',
    fajl: DESKTOP,
    alkalmaz: (s) => (s.includes('savedRowIds.push(row.sourceRowId)')
      ? s.replaceAll('if (row.sourceRowId) savedRowIds.push(row.sourceRowId)', 'void row.sourceRowId')
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
  console.error(`${fail} hiba, ${ok} rendben — a desktop soronkénti mentés őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — desktop soronkénti mentés (részleges mentés jelölése + megelőzése) őr zöld`)
