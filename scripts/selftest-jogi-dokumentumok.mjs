#!/usr/bin/env node
/**
 * JOGI DOKUMENTUMOK önellenőrzés (2026-08-22, bővítve 2026-08-23).
 *
 * Mit véd:
 *   · apps/web/components/auth/legal-dialog.tsx — az Adatvédelmi tájékoztató,
 *     az ÁSZF, a Súgó és a Kapcsolat tartalma mindhárom nyelven (hu/ro/en).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — A JOGI SZÖVEG NÉMÁN ELSZAKADT A KÓDTÓL
 * ════════════════════════════════════════════════════════════════════════════
 * A jogi szöveg az egyetlen olyan felület, amelyet SEMMILYEN teszt nem érintett,
 * miközben ÁLLÍTÁSOKAT tesz a kódról. A 2026-08-22 előtti változat emiatt két
 * ténylegesen HAMIS mondatot tartalmazott:
 *
 *  (1) „Az adatok soha nem kerülnek át harmadik országba" / „nem kerülnek át
 *      USA-ba". Ez akkor még igaz lehetett, de azóta ÉLESBEN két csatornán is
 *      kilépett adat az EU-ból: a napi biztonsági mentés a Google Drive-ba megy
 *      (apps/web/lib/google-drive/drive-client.ts), a beépített AI-csevegő pedig
 *      a begépelt üzenetet és a felhasználó keresztnevét továbbította egy EU-n
 *      kívüli nyelvi modellhez. Egy adatvédelmi tájékoztatóban a hamis
 *      „soha" a legsúlyosabb hibafajta: pont azt rombolja le, amiért írták.
 *      (A második csatorna 2026-08-23-án MEGSZŰNT — lásd lentebb az (5) pontot;
 *      a mentés csatornája viszont MEGMARADT, azt tehát nem szabad kitörölni.)
 *
 *  (2) A GDPR 13–14. cikke szerinti kötelező elemek fele hiányzott: az adat
 *      forrása (14. cikk), az adathordozhatóság és a hozzájárulás
 *      visszavonásának joga, a megőrzési idők, a címzettek/adatfeldolgozók
 *      listája, a harmadik országos garanciák, az automatizált döntéshozatal
 *      hiánya, a sütik, az incidenskezelés 72 órája és a gyermekek adatai.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 2026-08-23 — A MÁSODIK KÖR KÉT ÚJ HIBAOSZTÁLYA
 * ════════════════════════════════════════════════════════════════════════════
 *  (3) A hiányzó üzemeltetői adatok 49 külön helyen, kézzel írt
 *      „kitöltendő: …" felirattal álltak, mindhárom nyelven duplikálva.
 *      Ez két bajt okoz: (a) Endrének 49 helyen kellene ugyanazt átírnia —
 *      egy kimaradó hely NÉMÁN hamis szöveget hagy; (b) élesben a felhasználók
 *      49 borostyán figyelmeztetést látnának. Mostantól MIND a 49 hely EGY
 *      konfig-objektumból (UZEMELTETO_ADATOK) olvas → M7, M8.
 *
 *  (4) A dialógus végig FIX VILÁGOS Tailwind-osztályokat és inline hex/rgba
 *      színeket használt (text-slate-700, bg-emerald-50/50, #275638 …).
 *      Sötét módban ez olvashatatlan vagy vakító. A projekt szabálya a
 *      token-alapú szín (--foreground, --primary, --accent, --border …) → M9.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 2026-08-23 — AZ AI-CSEVEGŐ MEGSZŰNT: EGY ÚJ HIBAOSZTÁLY
 * ════════════════════════════════════════════════════════════════════════════
 *  (5) A rendszerből TELJESEN eltávolítottuk a beépített AI-csevegőt (Endre
 *      döntése, GDPR-indokkal: az oda begépelt szöveg EU-n kívüli szolgáltatóhoz
 *      ment). Ezzel megszűnt EGY adatfeldolgozó és EGY harmadik-országbeli
 *      adattovábbítási cél. A jogi szövegnek ezután SEM többet, SEM kevesebbet
 *      nem szabad állítania a valóságnál — és itt KÉT ELLENTÉTES irányba lehet
 *      elrontani:
 *        · TÚL KEVÉS törlés: valahol (jellemzően a ritkábban olvasott román vagy
 *          angol blokkban) bent marad egy „Aladár" / „OpenRouter" említés →
 *          a dokumentum ÖNMAGÁVAL kerül ellentmondásba. Jogi kockázat.
 *        · TÚL SOK törlés: valaki a 7. szakaszt (harmadik országba továbbítás)
 *          egészben kidobja, és visszaírja a régi, HAMIS „az adatok soha nem
 *          hagyják el az EU-t" mondatot — pedig a Google Drive-os napi mentés
 *          MEGMARADT. Ez pontosan az (1) pont hibája lenne, újra.
 *      Mindkét irányt az M10 fogja meg → M10.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A TÍZ MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *  M1  SZINTAXIS        — a fájl JSX/TS-értelemben hibátlanul elemezhető.
 *  M2  NINCS HAMIS ÍGÉRET — a „soha nem kerül harmadik országba" típusú
 *                         mondatok nem térhetnek vissza.
 *  M3  GDPR 13–14. ELEMEK — a kötelező tájékoztatási elemek MINDHÁROM nyelven
 *                         megvannak (hu/ro/en), külön az ÁSZF és a Súgó elemei;
 *                         továbbá a szakaszszámozás hézagmentes, és a Súgó/ÁSZF
 *                         kereszthivatkozásai a HELYES szakaszra mutatnak.
 *  M4  KÓD ⇄ SZÖVEG     — amit a szöveg állít a tárolásról, azt a kód is így
 *                         csinálja: a süti- és tárolókulcsok és a Kuka 30 napja a
 *                         FORRÁSFÁJLOKBÓL van visszamérve; a megszűnt AI-csevegő
 *                         forrásfájljainak pedig tényleg nem szabad ott lenniük.
 *  M5  HELYŐRZŐ-FEGYELEM — kitalált cégadat (e-mail, adószám) nem kerülhet a
 *                         SZÖVEGTÖRZSBE; ami hiányzik, azt a konfig jelöli.
 *  M6  NEGATÍV ASSZERT  — a mércék a RÉGI (HEAD-en lévő) szövegre és tíz
 *                         mutánsra ténylegesen elbuknak. Őr negatív asszert
 *                         nélkül vak.
 *  M7  KÖZPONTI KONFIG  — a kitöltendő értékek EGY objektumból jönnek; a
 *                         szövegtörzsben nincs szétszórt „kitöltendő" felirat,
 *                         és minden `mezo="…"` létező konfig-kulcsra mutat.
 *  M8  MINDKÉT ÁLLAPOT  — a komponenst TÉNYLEGESEN lefuttatva: üres mezőnél
 *                         megjelenik a feltűnő helyőrző, kitöltött mezőnél
 *                         viszont CSAK az érték, jelölés nélkül.
 *  M9  SÖTÉT MÓD        — nincs fix világos szín-osztály és nincs inline
 *                         hex/rgba szín; a Placeholder is token-színt használ.
 *  M10 AI-MENTESSÉG     — a megszűnt AI-csevegőnek NINCS többé nyoma a jogi
 *                         szövegben (se szolgáltató-név, se működő-AI-t feltételező
 *                         mondat), MINDHÁROM nyelvi blokkban egyszerre; miközben a
 *                         harmadik-országbeli továbbítás szakasza MEGMARADT és
 *                         továbbra is megnevezi a Google Drive-ot a garanciákkal.
 *
 * Futtatás:  node scripts/selftest-jogi-dokumentumok.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REL = 'apps/web/components/auth/legal-dialog.tsx'
const TARGET = path.join(ROOT, REL)

let hibak = 0
const bukottMercek = new Set()

function jelent(merce, ok, uzenet) {
  if (ok) {
    console.log(`   ✓ ${uzenet}`)
    return
  }
  hibak++
  bukottMercek.add(merce)
  console.log(`   ✗ [${merce}] ${uzenet}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   SEGÉDLET — kommentek kiszedése
   A szöveges mércék CSAK a megjelenő tartalmat nézhetik: egy magyarázó
   kommentbe írt „adathordozhatóság" nem tájékoztat senkit.

   ⚠️ 2026-08-23: a korábbi sorrend (előbb a JSX-komment — kapcsos zárójelbe
   zárt blokk-komment — mintája, utána a sima blokk-komment) NÉMÁN FELFALTA A
   KÓDOT. A `\{\s*\/\*[\s\S]*?\*\/\s*\}`
   minta ugyanis nem csak JSX-kommentre illik: egy `interface X {` sor után
   következő JSDoc property-komment is „nyitó kapcsos + blokk-komment",
   és a lezárást a minta a fájl egy MÁSIK pontján találta meg — 45 ezer karakter,
   köztük a teljes PrivacyContent, egyetlen szóközzé olvadt. A mércék ettől
   „a komponens NINCS meg a fájlban" hibát jelentettek. Megoldás: ELŐBB minden
   blokk-kommentet kiszedünk (ezzel a JSX-komment belseje is eltűnik), és csak
   utána takarítjuk el az üresen maradt `{ }` párt.
   ══════════════════════════════════════════════════════════════════════════ */
function kommentNelkul(szoveg) {
  return szoveg
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blokk-komment (a /** */ és a {/* */} belseje is)
    .replace(/\{\s*\}/g, ' ') // a JSX-komment üresen maradt kapcsos zárójele
    .replace(/^[ \t]*\/\/.*$/gm, ' ') // teljes soros // komment
}

function fuggvenyTorzs(szoveg, nev) {
  const start = szoveg.indexOf(`function ${nev}(`)
  if (start === -1) return ''
  const kovetkezo = szoveg.indexOf('\nfunction ', start + 1)
  return kovetkezo === -1 ? szoveg.slice(start) : szoveg.slice(start, kovetkezo)
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ')

/* ══════════════════════════════════════════════════════════════════════════
   SEGÉDLET — a KITÖLTENDŐ KONFIG blokk leválasztása
   A konfigban SZABAD e-mail-cím és adószám (oda való!), a szövegtörzsben NEM.
   A markerek a NYERS forrásban vannak (a komment-szűrő kiszedné őket), ezért
   a vágás mindig a nyers szövegen történik.
   ══════════════════════════════════════════════════════════════════════════ */
const KONFIG_KEZDET = 'KITÖLTENDŐ KONFIG — KEZDET'
const KONFIG_VEGE = 'KITÖLTENDŐ KONFIG — VÉGE'

function szetvag(egesz) {
  const a = egesz.indexOf(KONFIG_KEZDET)
  const b = egesz.indexOf(KONFIG_VEGE)
  if (a === -1 || b === -1 || b < a) return { konfig: '', torzs: egesz, megvan: false }
  return { konfig: egesz.slice(a, b), torzs: egesz.slice(0, a) + egesz.slice(b), megvan: true }
}

/* ══════════════════════════════════════════════════════════════════════════
   SEGÉDLET — a komponens TÉNYLEGES lefuttatása (M8)
   A fájlt TypeScripttel lefordítjuk, a JSX-et pedig egy pici saját
   „createElement"-re irányítjuk, így React nélkül is meg tudjuk nézni, MIT
   ír ki a komponens. Így az M8 nem a logika MÁSOLATÁT, hanem az ÉLES kódot
   játssza újra.
   ══════════════════════════════════════════════════════════════════════════ */
function betoltModul(forras) {
  const js = ts.transpileModule(forras, {
    fileName: 'legal-dialog.tsx',
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: '__jsx',
      jsxFragmentFactory: '__jsxFrag',
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const csonk = new Proxy(function () {}, { get: () => csonk, apply: () => null })
  const kovetel = () => new Proxy({}, { get: () => csonk })
  const __jsx = (type, props, ...children) => ({ __elem: true, type, props, children })
  const __jsxFrag = '__FRAGMENT__'
  const modul = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__jsx', '__jsxFrag', js)(
    modul,
    modul.exports,
    kovetel,
    __jsx,
    __jsxFrag,
  )
  return modul.exports
}

function szoveggeAlakit(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(szoveggeAlakit).join('')
  if (typeof node === 'object' && node.__elem) {
    if (typeof node.type === 'function') {
      const props = { ...(node.props ?? {}) }
      if (node.children.length) {
        props.children = node.children.length === 1 ? node.children[0] : node.children
      }
      return szoveggeAlakit(node.type(props))
    }
    return szoveggeAlakit(node.children)
  }
  return ''
}

/* ══════════════════════════════════════════════════════════════════════════
   M1 — SZINTAXIS
   ══════════════════════════════════════════════════════════════════════════ */
function m1Szintaxis(forras, cimke) {
  const sf = ts.createSourceFile(
    'legal-dialog.tsx',
    forras,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )
  const diags = sf.parseDiagnostics ?? []
  const ok = diags.length === 0
  const elso = ok
    ? ''
    : ` — első: ${ts.flattenDiagnosticMessageText(diags[0].messageText, ' ')} (pozíció ${diags[0].start})`
  jelent('M1', ok, `${cimke}: a fájl elemezhető (${diags.length} elemzési hiba)${elso}`)
  return ok
}

/* ══════════════════════════════════════════════════════════════════════════
   M2 — NINCS HAMIS ÍGÉRET
   ══════════════════════════════════════════════════════════════════════════ */
const TILTOTT_MONDATOK = [
  { minta: /soha nem kerülnek át harmadik országba/i, mit: 'HU: „soha nem kerülnek át harmadik országba"' },
  { minta: /nem kerülnek át usa-ba/i, mit: 'HU: „nem kerülnek át USA-ba"' },
  { minta: /az adatok soha nem hagyják el az? ?eu/i, mit: 'HU: „soha nem hagyják el az EU-t"' },
  { minta: /datele nu p[aă]r[aă]sesc niciodat[aă]/i, mit: 'RO: „datele nu părăsesc niciodată"' },
  { minta: /data never leaves the eu/i, mit: 'EN: „data never leaves the EU"' },
]

function m2NincsHamisIgeret(tiszta) {
  for (const { minta, mit } of TILTOTT_MONDATOK) {
    jelent('M2', !minta.test(tiszta), `nincs benne a cáfolt állítás — ${mit}`)
  }
  // A pozitív oldal: a tényleges kilépési csatornát MEG KELL nevezni.
  // 2026-08-23 óta EGY ilyen csatorna van: a Google Drive-os napi mentés.
  for (const [nyelv, fn, kell] of [
    ['HU', 'PrivacyContent', ['google drive', 'megfelelőségi határozat', 'scc']],
    ['RO', 'PrivacyRO', ['google drive', 'decizia de adecvare', 'scc']],
    ['EN', 'PrivacyEN', ['google drive', 'adequacy decision', 'standard contractual clauses']],
  ]) {
    const torzs = norm(fuggvenyTorzs(tiszta, fn))
    for (const k of kell) {
      jelent('M2', torzs.includes(k), `${nyelv} adatvédelem megnevezi: „${k}"`)
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M3 — GDPR 13–14. CIKK SZERINTI KÖTELEZŐ ELEMEK
   ══════════════════════════════════════════════════════════════════════════ */
const ELEMEK = {
  PrivacyContent: {
    nyelv: 'HU adatvédelem',
    kell: [
      ['adatkezelő megnevezése', 'adatkezelő'],
      ['adatfeldolgozói szerep', 'adatfeldolgozó'],
      ['jogalap — 6. cikk', '6. cikk'],
      ['különleges adat — 9. cikk (2) d)', '9. cikk'],
      ['az adat forrása (14. cikk)', 'honnan származnak'],
      ['címzettek / adatfeldolgozók', 'supabase'],
      ['megőrzési idő', 'meddig őrizzük'],
      ['hozzáférés joga', 'hozzáférés'],
      ['helyesbítés joga', 'helyesbítés'],
      ['törlés joga', 'törlés'],
      ['korlátozás joga', 'korlátozás'],
      ['tiltakozás joga', 'tiltakozás'],
      ['adathordozhatóság joga', 'adathordozhatóság'],
      ['hozzájárulás visszavonása', 'visszavon'],
      ['panasz a felügyeleti hatóságnál', 'anspdcp'],
      ['romániai végrehajtási törvény', '190/2018'],
      ['nincs automatizált döntéshozatal', 'automatikus dönt'],
      ['sütik / technikai tárolás', 'süti'],
      ['adatvédelmi incidens 72 óra', '72 órán belül'],
      ['gyermekek adatai', 'gyermek'],
      ['válaszadási határidő', 'egy hónapon belül'],
      ['hatásvizsgálat (DPIA)', 'hatásvizsgálat'],
    ],
  },
  PrivacyRO: {
    nyelv: 'RO adatvédelem',
    kell: [
      ['operator', 'operator'],
      ['persoană împuternicită', 'împuternicit'],
      ['temei — art. 6', 'art. 6'],
      ['date speciale — art. 9', 'art. 9'],
      ['sursa datelor', 'sursa datelor'],
      ['persoane împuternicite', 'supabase'],
      ['durata păstrării', 'cât timp păstrăm'],
      ['drept de acces', 'acces'],
      ['rectificare', 'rectificare'],
      ['ștergere', 'ștergere'],
      ['restricționare', 'restricționare'],
      ['opoziție', 'opoziție'],
      ['portabilitate', 'portabilitatea'],
      ['retragerea consimțământului', 'retragerea consimțământului'],
      ['plângere la autoritate', 'anspdcp'],
      ['legea națională', '190/2018'],
      ['fără decizii automate', 'nu ia decizii automate'],
      ['cookie-uri', 'cookie'],
      ['incident — 72 de ore', '72 de ore'],
      ['datele copiilor', 'copiilor'],
      ['termen de o lună', 'o lună'],
      ['DPIA', 'dpia'],
    ],
  },
  PrivacyEN: {
    nyelv: 'EN adatvédelem',
    kell: [
      ['controller', 'controller'],
      ['processor', 'processor'],
      ['legal basis — Art. 6', 'art. 6(1)'],
      ['special category — Art. 9(2)(d)', 'art. 9(2)(d)'],
      ['source of the data', 'source of the data'],
      ['processors named', 'supabase'],
      ['retention', 'how long do we keep'],
      ['right of access', 'access'],
      ['rectification', 'rectification'],
      ['erasure', 'erasure'],
      ['restriction', 'restriction'],
      ['objection', 'objection'],
      ['portability', 'portability'],
      ['withdrawal of consent', 'withdrawal of consent'],
      ['complaint to authority', 'anspdcp'],
      ['national law', '190/2018'],
      ['no automated decisions', 'no automated decisions'],
      ['cookies', 'cookies'],
      ['breach — 72 hours', '72 hours'],
      ["children's data", 'children'],
      ['one month deadline', 'within one month'],
      ['DPIA', 'dpia'],
    ],
  },
  TermsContent: {
    nyelv: 'HU ÁSZF',
    kell: [
      ['a felek megnevezése', 'szerződő felek'],
      ['szolgáltatás leírása', 'mi a kartotéka rendszer'],
      ['ki használhatja', 'ki használhatja'],
      ['felhasználói kötelezettségek', 'kötelezettség'],
      ['rendelkezésre állás', 'rendelkezésre állás'],
      ['felelősség-korlátozás', 'felelősség'],
      ['adatfeldolgozás (28. cikk)', '28. cikk'],
      ['szellemi tulajdon', 'szellemi tulajdon'],
      ['megszűnés és adatkiadás', 'megszűnése'],
      ['módosítás joga', 'módosítása'],
      ['irányadó jog', 'irányadó jog'],
      ['részleges érvénytelenség', 'érvénytelen'],
      ['kapcsolattartás', 'kapcsolattartás'],
    ],
  },
  TermsRO: {
    nyelv: 'RO ÁSZF',
    kell: [
      ['părțile', 'părțile'],
      ['descrierea serviciului', 'descrierea serviciului'],
      ['cine poate folosi', 'cine poate folosi'],
      ['obligațiile utilizatorului', 'obligațiile utilizatorului'],
      ['disponibilitate', 'disponibilitate'],
      ['limitarea răspunderii', 'limitarea răspunderii'],
      ['art. 28 GDPR', 'art. 28'],
      ['proprietate intelectuală', 'proprietate intelectuală'],
      ['încetare', 'încetarea accesului'],
      ['modificarea termenilor', 'modificarea termenilor'],
      ['jurisdicție', 'jurisdicție'],
      ['nulitate parțială', 'nul'],
      ['comunicări', 'comunicări'],
    ],
  },
  TermsEN: {
    nyelv: 'EN ÁSZF',
    kell: [
      ['the parties', 'the parties'],
      ['description of the service', 'description of the service'],
      ['who may use it', 'who may use it'],
      ['user obligations', 'user obligations'],
      ['availability', 'availability'],
      ['limitation of liability', 'limitation of liability'],
      ['Art. 28 GDPR', 'article 28'],
      ['intellectual property', 'intellectual property'],
      ['termination', 'termination'],
      ['modification of terms', 'modification of terms'],
      ['governing law', 'governing law'],
      ['severability', 'severability'],
      ['notices', 'notices'],
    ],
  },
  HelpContent: {
    nyelv: 'HU súgó',
    kell: [
      ['ki látja az adataimat', 'ki látja az adataimat'],
      ['hol tárolódnak', 'hol tárolódnak az adatok'],
      ['törlés kérése', 'kérhetem az adataim törlését'],
      ['mentések', 'biztonsági mentésekkel'],
      ['a három szint', 'három szint'],
      ['sütik', 'sütiket'],
      ['incidens', 'adatvédelmi incidens'],
      ['nincs AI a rendszerben', 'nem működik ai-csevegő'],
    ],
  },
  HelpRO: {
    nyelv: 'RO súgó',
    kell: [
      ['cine vede datele', 'cine îmi vede datele'],
      ['unde sunt stocate', 'unde sunt stocate datele'],
      ['ștergerea datelor', 'ștergerea datelor mele'],
      ['copii de siguranță', 'copiile de siguranță'],
      ['cele trei niveluri', 'cele trei niveluri'],
      ['cookie-uri', 'cookie-uri'],
      ['incident', 'incident de securitate'],
      ['fără AI în sistem', 'nu funcționează niciun asistent ai'],
    ],
  },
  HelpEN: {
    nyelv: 'EN súgó',
    kell: [
      ['who can see my data', 'who can see my data'],
      ['where is the data stored', 'where is the data stored'],
      ['erasure request', 'request erasure of my data'],
      ['backups', 'what happens to the backups'],
      ['three levels', 'three levels'],
      ['cookies', 'do you use cookies'],
      ['breach', 'data breach'],
      ['no AI in the system', 'runs no ai assistant'],
    ],
  },
}

function m3Elemek(tiszta) {
  for (const [fn, { nyelv, kell }] of Object.entries(ELEMEK)) {
    const torzs = norm(fuggvenyTorzs(tiszta, fn))
    if (!torzs) {
      jelent('M3', false, `${nyelv}: a(z) ${fn} komponens NINCS meg a fájlban`)
      continue
    }
    const hianyzo = kell.filter(([, minta]) => !torzs.includes(norm(minta)))
    jelent(
      'M3',
      hianyzo.length === 0,
      `${nyelv}: ${kell.length - hianyzo.length}/${kell.length} kötelező elem megvan` +
        (hianyzo.length ? ` — hiányzik: ${hianyzo.map(([c]) => c).join(', ')}` : ''),
    )
  }
  m3Szakaszszamok(tiszta)
}

/* ── M3/b — a szakaszszámozás és a rá mutató hivatkozások ────────────────────
   A dokumentum ÖNMAGÁRA hivatkozik („lásd a 7. szakaszt"), és a Súgó/ÁSZF is a
   tájékoztató szakaszszámaira mutat. Ha a számozás átrendeződik, ezek a mutatók
   NÉMÁN rossz helyre visznek — pont ez történt a 2026-08-22-i átírásnál: a Súgó
   „az Adatvédelmi tájékoztató 6. szakaszában" mondata a régi számozásra mutatott.
   ──────────────────────────────────────────────────────────────────────────── */
function szakaszCimek(torzs) {
  const map = new Map()
  for (const m of torzs.matchAll(/<SectionTitle>\s*(\d+)\.\s*([^<]*)</g)) {
    map.set(Number(m[1]), norm(m[2]))
  }
  return map
}

const MUTATOK = [
  {
    hol: 'HelpContent',
    minta: /Adatvédelmi tájékoztató<\/strong> (\d+)\. szakaszában találja/,
    celKulcs: 'milyen adatokat kezelünk',
    leiras: 'Súgó → „milyen adatokat kezel a rendszer"',
  },
  {
    hol: 'TermsContent',
    minta: /Adatvédelmi tájékoztató (\d+)\. szakasza ad naprakész/,
    celKulcs: 'hol vannak az adatok',
    leiras: 'ÁSZF → az adatfeldolgozók naprakész listája',
  },
  {
    hol: 'TermsContent',
    minta: /Adatvédelmi tájékoztató (\d+)\. szakaszában írt megőrzési/,
    celKulcs: 'meddig őrizzük',
    leiras: 'ÁSZF → megőrzési idők',
  },
]

function m3Szakaszszamok(tiszta) {
  const privacy = fuggvenyTorzs(tiszta, 'PrivacyContent')
  const terms = fuggvenyTorzs(tiszta, 'TermsContent')
  const pCimek = szakaszCimek(privacy)
  const tCimek = szakaszCimek(terms)

  for (const [nev, cimek, elso] of [
    ['HU adatvédelem', pCimek, 0],
    ['HU ÁSZF', tCimek, 1],
  ]) {
    const szamok = [...cimek.keys()].sort((a, b) => a - b)
    const hezagos = szamok.some((sz, i) => sz !== elso + i)
    jelent(
      'M3',
      szamok.length > 0 && !hezagos,
      `${nev}: a szakaszszámozás hézagmentes (${elso}…${szamok[szamok.length - 1] ?? '?'}, ${szamok.length} szakasz)`,
    )
  }

  // Önhivatkozások: minden „N. szakasz" mutatónak létező szakaszra kell mutatnia.
  const onhivatkozas = [...privacy.matchAll(/(\d+)\.\s*szakasz/g)].map((m) => Number(m[1]))
  const rossz = [...new Set(onhivatkozas)].filter((n) => !pCimek.has(n))
  jelent(
    'M3',
    rossz.length === 0,
    `HU adatvédelem: minden önhivatkozás létező szakaszra mutat${rossz.length ? ` — lógó: ${rossz.join(', ')}` : ''}`,
  )

  // Kereszthivatkozások: a Súgó és az ÁSZF mutatói a HELYES szakaszra visznek.
  for (const { hol, minta, celKulcs, leiras } of MUTATOK) {
    const torzs = fuggvenyTorzs(tiszta, hol).replace(/\s+/g, ' ')
    const talalat = minta.exec(torzs)
    if (!talalat) {
      jelent('M3', false, `${leiras}: a hivatkozás NEM található meg (elmozdult a szöveg?)`)
      continue
    }
    const szam = Number(talalat[1])
    const cim = pCimek.get(szam) ?? ''
    jelent(
      'M3',
      cim.includes(norm(celKulcs)),
      `${leiras}: a ${szam}. szakaszra mutat, annak címe „${cim || 'NINCS ILYEN SZAKASZ'}"`,
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M4 — KÓD ⇄ SZÖVEG: a tájékoztató állításait a FORRÁSBÓL mérjük vissza
   ══════════════════════════════════════════════════════════════════════════ */
function olvas(rel) {
  const p = path.join(ROOT, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

function m4KodEsSzoveg(tiszta) {
  const alacsony = tiszta.toLowerCase()

  // (a) süti- és tárolókulcsok
  const sessionModeSrc = olvas('apps/web/lib/auth/session-mode.ts')
  const sessionCookie = /SESSION_MODE_COOKIE\s*=\s*'([^']+)'/.exec(sessionModeSrc)?.[1]
  jelent('M4', Boolean(sessionCookie), `a session-mode süti kulcsa kiolvasható a kódból (${sessionCookie ?? 'NEM'})`)
  if (sessionCookie) {
    jelent('M4', alacsony.includes(sessionCookie.toLowerCase()), `a tájékoztató néven nevezi a(z) „${sessionCookie}" sütit`)
  }

  const splashSrc = olvas('apps/web/components/ui/splash-screen.tsx')
  const splashKey = /SESSION_KEY\s*=\s*'([^']+)'/.exec(splashSrc)?.[1]
  jelent('M4', Boolean(splashKey), `a splash sessionStorage-kulcs kiolvasható a kódból (${splashKey ?? 'NEM'})`)
  if (splashKey) {
    jelent('M4', alacsony.includes(splashKey.toLowerCase()), `a tájékoztató néven nevezi a(z) „${splashKey}" tárolókulcsot`)
  }

  // (b) AI-csevegő — 2026-08-23-án TELJESEN megszűnt. Korábban itt fordítva állt
  //     a mérce: amit a kód hív (OpenRouter / Groq / Gemini), azt a tájékoztatónak
  //     fel KELLETT sorolnia. Most a kód oldaláról azt mérjük vissza, hogy a
  //     funkció tényleg nincs többé — mert ha a forrásfájlok visszakerülnének, a
  //     jogi szöveg NÉMÁN válna hiányossá (bejelentetlen adatfeldolgozó).
  const AI_FORRASOK = [
    'apps/web/lib/constants/ai.ts',
    'apps/web/app/api/ai/chat/route.ts',
    'apps/web/components/ai/ai-chat-widget.tsx',
    'apps/web/components/ai/ai-chat-widget-lazy.tsx',
  ]
  const megmaradt = AI_FORRASOK.filter((rel) => fs.existsSync(path.join(ROOT, rel)))
  jelent(
    'M4',
    megmaradt.length === 0,
    `az AI-csevegő forrásfájljai nincsenek meg a kódban${megmaradt.length ? ` — MÉG MEGVAN: ${megmaradt.join(', ')}` : ''}`,
  )

  // (c) Kuka megőrzési idő — a szöveg és a felület ugyanazt mondja
  const kukaSrc = olvas('apps/web/app/(dashboard)/kuka/page.tsx')
  const kukaNap = /(\d+)\s*nap(?:on|ig)?\s*bel[üu]l/i.exec(kukaSrc)?.[1] ?? /(\d+)\s*nap/i.exec(kukaSrc)?.[1]
  jelent('M4', Boolean(kukaNap), `a Kuka megőrzési ideje kiolvasható a felületről (${kukaNap ?? 'NEM'} nap)`)
  if (kukaNap) {
    jelent(
      'M4',
      new RegExp(`${kukaNap}\\s*nap`, 'i').test(tiszta),
      `a tájékoztató ugyanazt a megőrzési időt írja: ${kukaNap} nap`,
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M5 — HELYŐRZŐ-FEGYELEM: kitalált cégadat nem kerülhet a SZÖVEGTÖRZSBE
   ────────────────────────────────────────────────────────────────────────────
   2026-08-23: az e-mail-tilalom mostantól a KITÖLTENDŐ KONFIG BLOKKON KÍVÜLI
   részre vonatkozik. A konfigban az e-mail-cím a HELYÉN van (oda írja Endre);
   a jogi szövegtörzsbe hardcode-olva viszont továbbra is TILOS — pont az a
   hiba, amit ez a mérce eleve célzott.
   ══════════════════════════════════════════════════════════════════════════ */
const EMAIL_MINTA = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const KAPCSOLAT_MEZOK = ['adatvedelmiEmail', 'postaiCim', 'telefon', 'dpoElerhetoseg']

function m5Helyorzok(tisztaTorzs, tiszta) {
  jelent('M5', /function Placeholder\(/.test(tiszta), 'a Placeholder komponens definiálva van')

  const nyito = (tiszta.match(/<Placeholder>/g) ?? []).length
  const zaro = (tiszta.match(/<\/Placeholder>/g) ?? []).length
  jelent('M5', nyito === zaro && nyito > 0, `a helyőrzők párban állnak (${nyito} nyitó / ${zaro} záró)`)

  const emailek = [...new Set(tisztaTorzs.match(EMAIL_MINTA) ?? [])]
  jelent(
    'M5',
    emailek.length === 0,
    `nincs kitalált e-mail-cím a szövegtörzsben${emailek.length ? ` — talált: ${emailek.join(', ')}` : ''}`,
  )

  // Mindhárom nyelv Kapcsolat-fülén az elérhetőség a KONFIGBÓL jön — soha nincs
  // se kitalálva, se kézzel odaírva.
  for (const [fn, tag] of [
    ['ContactContent', 'AdatHU'],
    ['ContactRO', 'AdatRO'],
    ['ContactEN', 'AdatEN'],
  ]) {
    const torzs = fuggvenyTorzs(tisztaTorzs, fn)
    const hianyzo = KAPCSOLAT_MEZOK.filter((m) => !torzs.includes(`<${tag} mezo="${m}"`))
    jelent(
      'M5',
      torzs.length > 0 && hianyzo.length === 0,
      `${fn}: az elérhetőség a konfigból jön${hianyzo.length ? ` — hiányzik: ${hianyzo.join(', ')}` : ''}`,
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M7 — KÖZPONTI KITÖLTŐ-KONFIG
   Egy hely, ahol Endrének írnia kell. A szövegtörzsben nincs többé kézzel írt
   „kitöltendő" felirat, és minden `mezo="…"` létező kulcsra mutat (elgépelés
   ellen a typecheck is véd, de itt is megfogjuk).
   ══════════════════════════════════════════════════════════════════════════ */
const KITOLTENDO_FELIRATOK = [/kitöltendő/i, /de completat/i, /to be filled in/i]

function m7KozpontiKonfig(egesz, konfigNyers, tisztaTorzs, tiszta, modul) {
  jelent('M7', konfigNyers.length > 0, 'a KITÖLTENDŐ KONFIG blokk megvan (marker-kommentek között)')
  jelent(
    'M7',
    /export const UZEMELTETO_ADATOK\s*:\s*UzemeltetoAdatok\s*=/.test(konfigNyers),
    'a konfig egyetlen, nevesített típusú objektum: UZEMELTETO_ADATOK',
  )
  jelent(
    'M7',
    /const HIANY_FELIRAT\s*:\s*Record<LegalLang,\s*Record<UzemeltetoMezo,\s*string>>/.test(konfigNyers),
    'a nyelvenkénti hiány-feliratok is egy szigorúan típusos táblában vannak',
  )

  // (a) a szövegtörzsben NINCS kézzel írt „kitöltendő" felirat
  for (const minta of KITOLTENDO_FELIRATOK) {
    const talalat = minta.test(tisztaTorzs)
    jelent('M7', !talalat, `a szövegtörzsben nincs kézzel írt felirat: ${minta.source}`)
  }

  // (b) helyőrző CSAK egy helyen születik: az Adat komponensben
  const helyorzoDb = (tiszta.match(/<Placeholder>/g) ?? []).length
  jelent('M7', helyorzoDb === 1, `<Placeholder> pontosan egy helyen szerepel (talált: ${helyorzoDb})`)
  const adatTorzs = fuggvenyTorzs(tiszta, 'Adat')
  jelent(
    'M7',
    adatTorzs.includes('<Placeholder>{HIANY_FELIRAT[lang][mezo]}</Placeholder>'),
    'az egyetlen helyőrző az Adat komponensben, a konfig feliratával',
  )

  // (c) a kulcsok és a használat összeér
  const kulcsok = modul && modul.UZEMELTETO_ADATOK ? Object.keys(modul.UZEMELTETO_ADATOK) : []
  jelent('M7', kulcsok.length >= 12, `a konfig ${kulcsok.length} mezőt tartalmaz (12–15 közötti nagyságrend)`)

  const hasznalt = [...new Set([...tisztaTorzs.matchAll(/<Adat(?:HU|RO|EN)\s+mezo="([^"]+)"/g)].map((m) => m[1]))]
  const ismeretlen = hasznalt.filter((m) => !kulcsok.includes(m))
  jelent(
    'M7',
    kulcsok.length > 0 && ismeretlen.length === 0,
    `minden mezo="…" létező konfig-kulcsra mutat${ismeretlen.length ? ` — ismeretlen: ${ismeretlen.join(', ')}` : ''}`,
  )
  const hasznalatlan = kulcsok.filter((k) => !hasznalt.includes(k))
  jelent(
    'M7',
    kulcsok.length > 0 && hasznalatlan.length === 0,
    `minden konfig-mező meg is jelenik valahol${hasznalatlan.length ? ` — árva: ${hasznalatlan.join(', ')}` : ''}`,
  )

  // (d) a kiadott állapot: minden érték null vagy NEM üres szöveg
  if (kulcsok.length) {
    const rossz = kulcsok.filter((k) => {
      const v = modul.UZEMELTETO_ADATOK[k]
      return !(v === null || (typeof v === 'string' && v.trim().length > 0))
    })
    jelent('M7', rossz.length === 0, `minden konfig-érték null vagy valódi szöveg${rossz.length ? ` — hibás: ${rossz.join(', ')}` : ''}`)
  }

  // (e) mindhárom nyelvhez van felirat, minden mezőre
  if (modul && modul.UZEMELTETO_ADATOK) {
    for (const nyelv of ['hu', 'ro', 'en']) {
      const hianyzo = kulcsok.filter((k) => {
        try {
          return !szoveggeAlakit(modul.Adat({ lang: nyelv, mezo: k })).trim()
        } catch {
          return true
        }
      })
      jelent('M7', hianyzo.length === 0, `${nyelv}: minden mezőnek van felirata${hianyzo.length ? ` — néma: ${hianyzo.join(', ')}` : ''}`)
    }
  }
  // Az `egesz` paraméter szándékosan itt marad: a marker-kommentek a NYERS
  // forrásban vannak, és a jövőbeli mércék innen dolgoznának tovább.
  void egesz
}

/* ══════════════════════════════════════════════════════════════════════════
   M8 — MINDKÉT ÁLLAPOT ÚJRAJÁTSZVA (az ÉLES komponenst futtatva)
   · üres mező  → feltűnő „⚠️ kitöltendő: …" jelölés;
   · kitöltött  → CSAK az érték, mindenféle jelölés nélkül.
   ══════════════════════════════════════════════════════════════════════════ */
const PROBA_ERTEK = {
  adatvedelmiEmail: 'proba.cim@pelda-teszt.invalid',
  alap: 'PRÓBA-ÉRTÉK',
}

function m8MindketAllapot(modul) {
  if (!modul || !modul.UZEMELTETO_ADATOK || typeof modul.Adat !== 'function') {
    jelent('M8', false, 'a komponens nem tölthető be (UZEMELTETO_ADATOK / Adat hiányzik)')
    return
  }
  const konfig = modul.UZEMELTETO_ADATOK
  const kulcsok = Object.keys(konfig)

  for (const nyelv of ['hu', 'ro', 'en']) {
    const uresBaj = []
    const kitoltottBaj = []

    for (const mezo of kulcsok) {
      const eredeti = konfig[mezo]

      // 1) ÜRES állapot — legyen feltűnő helyőrző
      konfig[mezo] = null
      const uresen = szoveggeAlakit(modul.Adat({ lang: nyelv, mezo })).trim()
      if (!uresen.includes('⚠️')) uresBaj.push(`${mezo} („${uresen}")`)

      // 2) KITÖLTÖTT állapot — CSAK az érték, jelölés nélkül
      const proba = PROBA_ERTEK[mezo] ?? `${PROBA_ERTEK.alap} (${mezo})`
      konfig[mezo] = proba
      const kitoltve = szoveggeAlakit(modul.Adat({ lang: nyelv, mezo })).trim()
      if (kitoltve !== proba || kitoltve.includes('⚠️')) {
        kitoltottBaj.push(`${mezo} („${kitoltve}")`)
      }

      // 3) csupa szóköz = NINCS kitöltve (fail-closed)
      konfig[mezo] = '   '
      const szokozzel = szoveggeAlakit(modul.Adat({ lang: nyelv, mezo })).trim()
      if (!szokozzel.includes('⚠️')) uresBaj.push(`${mezo} (csak szóköz → „${szokozzel}")`)

      konfig[mezo] = eredeti
    }

    jelent('M8', uresBaj.length === 0, `${nyelv}: üres mezőnél feltűnő a helyőrző${uresBaj.length ? ` — néma: ${uresBaj.join(', ')}` : ''}`)
    jelent(
      'M8',
      kitoltottBaj.length === 0,
      `${nyelv}: kitöltött mezőnél CSAK az érték látszik${kitoltottBaj.length ? ` — hibás: ${kitoltottBaj.join(', ')}` : ''}`,
    )
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M9 — SÖTÉT MÓD: token-alapú színek, nincs fix világos osztály
   A projekt színrendszere CSS-változó-alapú (packages/ui/src/kartoteka.css:
   --foreground, --muted-foreground, --primary, --accent, --border …), és a
   `.dark` blokk ezeket írja felül. Egy `text-slate-700` vagy egy inline
   `#275638` ezt megkerüli → sötét módban olvashatatlan vagy vakító felület.
   ══════════════════════════════════════════════════════════════════════════ */
const TAILWIND_PALETTA =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const FIX_SZIN_OSZTALY = new RegExp(
  `\\b(?:text|bg|border|from|via|to|ring|divide|decoration|placeholder|shadow|outline|fill|stroke|caret)-(?:${TAILWIND_PALETTA})-[0-9]{2,3}\\b`,
  'g',
)
const FIX_FEHER_FEKETE = /\b(?:text|bg|border|ring|divide|fill|stroke)-(?:white|black)\b/g
const INLINE_SZIN = /style=\{\{[\s\S]{0,400}?\}\}/g
const HEX_VAGY_RGB = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/

function m9SotetMod(tiszta) {
  const paletta = [...new Set(tiszta.match(FIX_SZIN_OSZTALY) ?? [])]
  jelent(
    'M9',
    paletta.length === 0,
    `nincs fix Tailwind-paletta osztály${paletta.length ? ` — talált: ${paletta.slice(0, 8).join(', ')}${paletta.length > 8 ? ' …' : ''}` : ''}`,
  )

  const feherFekete = [...new Set(tiszta.match(FIX_FEHER_FEKETE) ?? [])]
  jelent(
    'M9',
    feherFekete.length === 0,
    `nincs hardcode-olt fehér/fekete osztály${feherFekete.length ? ` — talált: ${feherFekete.join(', ')}` : ''}`,
  )

  const inlineSzinek = (tiszta.match(INLINE_SZIN) ?? []).filter((s) => HEX_VAGY_RGB.test(s))
  jelent(
    'M9',
    inlineSzinek.length === 0,
    `nincs inline hex/rgba szín a JSX-ben${inlineSzinek.length ? ` — ${inlineSzinek.length} db, első: ${inlineSzinek[0].slice(0, 60)}…` : ''}`,
  )

  // Pozitív oldal: tényleg a projekt tokenjeit használjuk.
  for (const token of ['text-foreground', 'text-muted-foreground', 'border-border', 'bg-primary/', 'bg-accent/']) {
    jelent('M9', tiszta.includes(token), `használja a token-osztályt: ${token}`)
  }

  // A helyőrző sötét módban is olvasható kell legyen: token-szín, nem fix érték.
  const ph = fuggvenyTorzs(tiszta, 'Placeholder')
  jelent(
    'M9',
    ph.includes('text-foreground') && !HEX_VAGY_RGB.test(ph),
    'a Placeholder jelölése token-színt használ (sötét módban is olvasható)',
  )

  // A közös kartoteka.css `.kt-legal-content strong/em` szabálya FIX sötét
  // színt ad; a dialógusnak felül KELL írnia token-színre, különben sötét
  // módban a sok <strong> beleolvad a háttérbe.
  jelent(
    'M9',
    /\.kt-legal-content strong\s*\{\s*color:\s*var\(--foreground\)/.test(tiszta),
    'a .kt-legal-content strong színe token-re van felülírva',
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   M10 — AI-MENTESSÉG, DE NEM TÚLTÖRLÉS
   ────────────────────────────────────────────────────────────────────────────
   2026-08-23: a beépített AI-csevegő megszűnt. Ez a mérce KÉT ellentétes hibát
   fog meg egyszerre:

     (a) MARADVÁNY — bent felejtett „Aladár" / „OpenRouter" / „Groq" / „Gemini"
         említés, vagy egy olyan mondat, amely MŰKÖDŐ AI-t feltételez („ne írjon
         személyes adatot a csevegőbe", „fereastra de chat", „never type personal
         data"). Jellemzően a ritkábban olvasott román vagy angol blokkban marad
         bent → a dokumentum önmagával kerül ellentmondásba. Ezért a számlálás
         NYELVI BLOKKONKÉNT külön történik: „a hármuk közül kettőben megcsináltuk"
         nem elég.

     (b) TÚLTÖRLÉS — valaki a 7. szakaszt (harmadik országba továbbítás) egészben
         kidobja, mert „az AI miatt volt". Pedig a MÁSIK ok, a Google Drive-os
         napi mentés, MEGMARADT. Ilyenkor visszakúszik a régi, HAMIS „az adatok
         soha nem hagyják el az EU-t" mondat. Ezért ITT is megköveteljük, hogy a
         7. szakasz mindhárom nyelven megnevezze a Google Drive-ot és a
         garanciákat (megfelelőségi határozat + SCC).

   ⚠️ FONTOS, MIT NEM TILT: azt a rövid, ŐSZINTE bejegyzést, hogy a rendszerben
   NINCS AI-segéd („nem működik AI-csevegő", „nu funcționează niciun asistent AI",
   „runs no AI assistant"). Az nem maradvány, hanem tájékoztatás — a tiltólista
   ezért a SZOLGÁLTATÓ-NEVEKRE és a működő AI-t feltételező mondatokra szól.
   ══════════════════════════════════════════════════════════════════════════ */
const TILTOTT_AI_MINTAK = [
  { minta: /alad[áa]r/i, mit: 'az egykori AI-segéd neve („Aladár")' },
  { minta: /openrouter/i, mit: 'OpenRouter (AI-szolgáltató)' },
  { minta: /\bgroq\b/i, mit: 'Groq (AI-szolgáltató)' },
  { minta: /gemini/i, mit: 'Google Gemini (AI-szolgáltató)' },
  { minta: /ai-seg[ée]d/i, mit: 'HU: „AI-segéd" — a megszűnt funkció megnevezése' },
  { minta: /asistentul ai/i, mit: 'RO: „asistentul AI" — a megszűnt funkció megnevezése' },
  { minta: /ai helper/i, mit: 'EN: „AI helper" — a megszűnt funkció megnevezése' },
  { minta: /\bchat\b/i, mit: 'a megszűnt csevegőablak („chat")' },
  { minta: /ne írjon.{0,80}személyes adatot/i, mit: 'HU: „ne írjon … személyes adatot" (a csevegőre szólt)' },
  { minta: /nu introduce[țt]i.{0,80}date personale/i, mit: 'RO: „nu introduceți … date personale" (a csevegőre szólt)' },
  { minta: /(never|do not|don't) type personal data/i, mit: 'EN: „never/do not type personal data" (a csevegőre szólt)' },
]

/** A „soha nem hagyja el az EU-t" típusú ABSZOLÚT állítás — a Google Drive-os
 *  mentés miatt HAMIS. A minősített mondatok („a napi működés során nem hagyja
 *  el", „Day-to-day operation never leaves the Union") IGAZAK, azokat nem tiltjuk. */
const TULTORLES_MINTAK = [
  { minta: /soha nem hagyj(a|ák) el (az )?(eu|uniót)/i, mit: 'HU: „soha nem hagyja el az EU-t/az Uniót"' },
  { minta: /soha nem kerül(nek)? (át )?harmadik/i, mit: 'HU: „soha nem kerül át harmadik országba"' },
  { minta: /nu p[aă]r[aă]sesc niciodat[aă]/i, mit: 'RO: „nu părăsesc niciodată"' },
  { minta: /nu ies niciodat[aă] din (ue|uniune)/i, mit: 'RO: „nu ies niciodată din UE"' },
  { minta: /data never leaves? the (eu|union)/i, mit: 'EN: „data never leaves the EU/Union"' },
]

/** Egy szakasz szövege a következő szakasz címéig (pl. a 7. a 8.-ig). */
function szakaszSzoveg(torzs, szam) {
  const re = new RegExp(
    `<SectionTitle>\\s*${szam}\\.[\\s\\S]*?(?=<SectionTitle>\\s*${szam + 1}\\.)`,
  )
  return re.exec(torzs)?.[0] ?? ''
}

const NYELVI_BLOKKOK = [
  { nyelv: 'HU', fn: ['PrivacyContent', 'TermsContent', 'HelpContent', 'ContactContent'] },
  { nyelv: 'RO', fn: ['PrivacyRO', 'TermsRO', 'HelpRO', 'ContactRO'] },
  { nyelv: 'EN', fn: ['PrivacyEN', 'TermsEN', 'HelpEN', 'ContactEN'] },
]

const HARMADIK_ORSZAG = [
  {
    nyelv: 'HU',
    fn: 'PrivacyContent',
    kell: ['google drive', 'megfelelőségi határozat', 'scc'],
  },
  { nyelv: 'RO', fn: 'PrivacyRO', kell: ['google drive', 'decizia de adecvare', 'scc'] },
  {
    nyelv: 'EN',
    fn: 'PrivacyEN',
    kell: ['google drive', 'adequacy decision', 'standard contractual clauses'],
  },
]

function m10AiMentesseg(tiszta) {
  // (a) MARADVÁNY — nyelvi blokkonként külön, hogy a „csak a magyart javítottam"
  //     eset is elbukjon.
  for (const { nyelv, fn } of NYELVI_BLOKKOK) {
    const blokk = fn.map((f) => fuggvenyTorzs(tiszta, f)).join('\n')
    if (!blokk.trim()) {
      jelent('M10', false, `${nyelv}: a nyelvi blokk komponensei nem találhatók (${fn.join(', ')})`)
      continue
    }
    const talalt = TILTOTT_AI_MINTAK.filter(({ minta }) => minta.test(blokk))
    jelent(
      'M10',
      talalt.length === 0,
      `${nyelv}: 0 AI-maradvány a szövegben${talalt.length ? ` — talált: ${talalt.map((t) => t.mit).join('; ')}` : ''}`,
    )
  }

  // (b) TÚLTÖRLÉS — a harmadik-országbeli továbbítás szakasza MEGMARADT.
  for (const { nyelv, fn, kell } of HARMADIK_ORSZAG) {
    const szakasz = norm(szakaszSzoveg(fuggvenyTorzs(tiszta, fn), 7))
    if (!szakasz) {
      jelent('M10', false, `${nyelv}: a 7. szakasz (harmadik országba továbbítás) ELTŰNT`)
      continue
    }
    const hianyzo = kell.filter((k) => !szakasz.includes(norm(k)))
    jelent(
      'M10',
      hianyzo.length === 0,
      `${nyelv}: a 7. szakasz továbbra is megnevezi a mentés csatornáját és garanciáit` +
        (hianyzo.length ? ` — hiányzik: ${hianyzo.join(', ')}` : ''),
    )
  }

  // (c) és NEM kúszott vissza a hamis „soha nem hagyja el az EU-t".
  for (const { minta, mit } of TULTORLES_MINTAK) {
    jelent('M10', !minta.test(tiszta), `nincs benne az abszolút (hamis) állítás — ${mit}`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FUTTATÓ
   ══════════════════════════════════════════════════════════════════════════ */
function ellenoriz(egesz, cimke, { szintaxis = true } = {}) {
  hibak = 0
  bukottMercek.clear()
  console.log(`\n── ${cimke} ──`)
  if (szintaxis) m1Szintaxis(egesz, cimke)

  const { konfig, torzs, megvan } = szetvag(egesz)
  const tiszta = kommentNelkul(egesz)
  const tisztaTorzs = kommentNelkul(torzs)

  let modul = null
  let betoltesHiba = ''
  try {
    modul = betoltModul(egesz)
  } catch (e) {
    betoltesHiba = String(e && e.message ? e.message : e).split('\n')[0]
  }

  m2NincsHamisIgeret(tiszta)
  m3Elemek(tiszta)
  m4KodEsSzoveg(tiszta)
  m5Helyorzok(tisztaTorzs, tiszta)
  if (!megvan) jelent('M7', false, 'a KITÖLTENDŐ KONFIG marker-kommentek nem találhatók')
  m7KozpontiKonfig(egesz, konfig, tisztaTorzs, tiszta, modul)
  if (betoltesHiba) jelent('M8', false, `a modul nem futtatható: ${betoltesHiba}`)
  m8MindketAllapot(modul)
  m9SotetMod(tiszta)
  m10AiMentesseg(tiszta)

  return { hibak, mercek: new Set(bukottMercek) }
}

const egesz = fs.readFileSync(TARGET, 'utf8')

console.log('═══ JOGI DOKUMENTUMOK ÖNELLENŐRZÉS ═══')
const eles = ellenoriz(egesz, 'ÉLES FÁJL')

/* ── M6: NEGATÍV ASSZERT ────────────────────────────────────────────────── */
console.log('\n── M6: negatív asszert (a régi szöveg és a mutánsok BUKJANAK) ──')

const negativHibak = []

// (a) A VALÓDI régi változat a HEAD-ről.
let regi = ''
try {
  regi = execFileSync('git', ['show', `HEAD:${REL}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
} catch (e) {
  console.log(`   ! a HEAD-változat nem olvasható (${e.message.split('\n')[0]}) — ez a mérce kimarad`)
}
if (regi) {
  const r = ellenoriz(regi, 'HEAD (a javítás ELŐTTI szöveg)', { szintaxis: false })
  const bukik = r.hibak > 0 && r.mercek.has('M2') && r.mercek.has('M3') && r.mercek.has('M10')
  if (!bukik) {
    negativHibak.push('a HEAD-változat NEM bukott el az M2/M3/M10 mércén — az őr vak lenne')
  }
  console.log(
    `   ${bukik ? '✓' : '✗'} a régi szöveg ${r.hibak} ponton bukik (mércék: ${[...r.mercek].join(', ') || 'egy sem'})`,
  )
}

// (b) Szintetikus mutánsok — mércénként legalább egy.
const MUTANSOK = [
  {
    nev: 'M1 — elrontott JSX (lezáratlan tag)',
    merce: 'M1',
    keszit: (s) => s.replace('<SectionTitle>0. A lényeg dióhéjban</SectionTitle>', '<SectionTitle>0. A lényeg dióhéjban'),
    szintaxis: true,
  },
  {
    nev: 'M2 — visszatér a hamis „soha nem kerülnek át harmadik országba"',
    merce: 'M2',
    keszit: (s) =>
      s.replace(
        '<SectionTitle>7. Kikerül-e adat az Európai Unióból?</SectionTitle>',
        '<SectionTitle>7. Kikerül-e adat az Európai Unióból?</SectionTitle>\n      <p>Az adatok soha nem kerülnek át harmadik országba.</p>',
      ),
  },
  {
    nev: 'M3 — kiesik az adathordozhatóság joga (HU)',
    merce: 'M3',
    keszit: (s) => s.replace(/adathordozhatóság/gi, 'adatátadás'),
  },
  {
    // Ez a mutáns a 2026-08-22-i ÁTSZÁMOZÁS valódi hibáját játssza újra: a Súgó
    // egy létező, de MÁS szakaszra mutat. Számtanilag hibátlan, tartalmilag hamis.
    nev: 'M3/b — a Súgó rossz (de létező) szakaszra hivatkozik',
    merce: 'M3',
    keszit: (s) =>
      s.replace(
        '<strong>Adatvédelmi tájékoztató</strong> 3. szakaszában találja.',
        '<strong>Adatvédelmi tájékoztató</strong> 9. szakaszában találja.',
      ),
  },
  {
    nev: 'M4 — a szöveg más süti-kulcsot ír, mint a kód',
    merce: 'M4',
    keszit: (s) => s.replace(/session-mode/g, 'maradjak-bent'),
  },
  {
    // A M5 eredeti célja: kitalált cégadat kerül a jogi szövegbe. Most az
    // <AdatHU …/> hívás helyére írunk be kézzel egy e-mail-címet.
    nev: 'M5 — kitalált e-mail-cím kerül a szövegtörzsbe',
    merce: 'M5',
    keszit: (s) => s.replace('<AdatHU mezo="adatvedelmiEmail" />', 'adatvedelem@kartoteka.app'),
  },
  {
    nev: 'M7 — visszatér egy kézzel írt, szétszórt helyőrző',
    merce: 'M7',
    keszit: (s) =>
      s.replace(
        '<SectionTitle>0. A lényeg dióhéjban</SectionTitle>',
        '<SectionTitle>0. A lényeg dióhéjban</SectionTitle>\n      <p><Placeholder>kitöltendő: valamilyen pótolandó adat</Placeholder></p>',
      ),
  },
  {
    nev: 'M7/b — elgépelt mezőnév a szövegtörzsben',
    merce: 'M7',
    keszit: (s) => s.replace('<AdatHU mezo="postaiCim" />', '<AdatHU mezo="postalCim" />'),
  },
  {
    // A KITÖLTÖTT állapot romlik el: a jelölés akkor is megjelenik, ha van érték.
    nev: 'M8 — a helyőrző kitöltött mezőnél is megjelenik',
    merce: 'M8',
    keszit: (s) => s.replace('if (kitoltottE(ertek)) return <>{ertek}</>', 'if (false) return <>{ertek}</>'),
  },
  {
    // Az ÜRES állapot romlik el: hiányzó adat esetén NÉMÁN semmi sem látszik.
    nev: 'M8/b — üres mezőnél némán eltűnik a figyelmeztetés',
    merce: 'M8',
    keszit: (s) => s.replace('if (kitoltottE(ertek)) return <>{ertek}</>', 'if (true) return <>{ertek}</>'),
  },
  {
    nev: 'M9 — visszatér a fix világos szín-osztály (text-slate-700)',
    merce: 'M9',
    keszit: (s) =>
      s.replace('text-[14px] leading-relaxed text-foreground', 'text-[14px] leading-relaxed text-slate-700'),
  },
  {
    // (a) MARADVÁNY: visszakerül egy „Aladár"-említés a MAGYAR blokkba.
    nev: 'M10 — visszakerül egy „Aladár" AI-említés (HU)',
    merce: 'M10',
    keszit: (s) =>
      s.replace(
        '<SectionTitle>0. A lényeg dióhéjban</SectionTitle>',
        '<SectionTitle>0. A lényeg dióhéjban</SectionTitle>\n      <p>Az „Aladár" AI-segéd a begépelt üzenetet az OpenRouter felé továbbítja.</p>',
      ),
  },
  {
    // Ugyanaz, de CSAK az angol blokkban — ez a „két nyelvet javítottam, a
    // harmadikat elfelejtettem" valós eset. A nyelvenkénti számlálás fogja meg.
    nev: 'M10/b — az AI-említés csak az ANGOL blokkban marad bent',
    merce: 'M10',
    keszit: (s) =>
      s.replace(
        '<SectionTitle>7. Does data leave the EU?</SectionTitle>',
        '<SectionTitle>7. Does data leave the EU?</SectionTitle>\n      <p>The „Aladár" AI helper receives only what you type; never type personal data into the chat.</p>',
      ),
  },
  {
    // (b) TÚLTÖRLÉS 1.: visszatér a hamis „soha nem hagyja el az EU-t".
    nev: 'M10/c — visszatér a hamis „soha nem hagyják el az EU-t"',
    merce: 'M10',
    keszit: (s) =>
      s.replace(
        '<SectionTitle>7. Kikerül-e adat az Európai Unióból?</SectionTitle>',
        '<SectionTitle>7. Kikerül-e adat az Európai Unióból?</SectionTitle>\n      <p>Az adatok soha nem hagyják el az EU-t.</p>',
      ),
  },
  {
    // (b) TÚLTÖRLÉS 2.: valaki a mentés csatornáját is kitörli a 7. szakaszból.
    nev: 'M10/d — a 7. szakaszból eltűnik a Google Drive (túltörlés)',
    merce: 'M10',
    keszit: (s) => s.replace(/Google Drive/g, 'egy felhőtárhely'),
  },
  {
    nev: 'M9/b — visszatér az inline hex szín a Placeholder-en',
    merce: 'M9',
    keszit: (s) =>
      s.replace(
        '<mark className="rounded border border-dashed border-accent bg-accent/30 px-1.5 py-0.5 text-[12.5px] font-semibold text-foreground">',
        '<mark className="rounded px-1.5 py-0.5 text-[12.5px] font-semibold" style={{ background: \'rgba(217, 119, 6, 0.16)\', color: \'#275638\' }}>',
      ),
  },
]

for (const m of MUTANSOK) {
  const mutans = m.keszit(egesz)
  if (mutans === egesz) {
    negativHibak.push(`${m.nev}: a mutáns NEM különbözik az eredetitől (elmozdult a horgony)`)
    console.log(`   ✗ ${m.nev} — a mutáció nem fogott`)
    continue
  }
  const r = ellenoriz(mutans, `MUTÁNS · ${m.nev}`, { szintaxis: Boolean(m.szintaxis) })
  const bukik = r.mercek.has(m.merce)
  if (!bukik) {
    negativHibak.push(`${m.nev}: a(z) ${m.merce} mérce NEM bukott el rajta`)
  }
  console.log(`   ${bukik ? '✓' : '✗'} ${m.nev} → ${m.merce} ${bukik ? 'elbukik (helyes)' : 'ÁTMEGY (vak őr!)'}`)
}

/* ── ÖSSZEGZÉS ──────────────────────────────────────────────────────────── */
console.log('\n═══ ÖSSZEGZÉS ═══')
console.log(`ÉLES fájl hibái: ${eles.hibak}`)
console.log(`Negatív asszert hibái: ${negativHibak.length}`)
for (const h of negativHibak) console.log(`  ✗ ${h}`)

if (eles.hibak === 0 && negativHibak.length === 0) {
  console.log('\n✅ PASS — mind a tíz mérce teljesül.')
  process.exit(0)
}
console.log('\n❌ FAIL')
process.exit(1)
