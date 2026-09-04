#!/usr/bin/env node
/**
 * KASSZA — CÉG-/SZERVEZET-PARTNEREK önellenőrzés (2026-09-04, Endre észrevétele)
 *
 * Endre szó szerint: „A kasszánál a cégeket nem ismeri fel! Ezt javítani kell!
 * Ha a kasszába adnak a cégek szponzort, akkor tudjuk bevezetni!"
 *
 * ⛔ AMI ROSSZ VOLT: a gyülekezeti szintű befizető-kereső KIZÁRÓLAG a `szemely`
 *    táblát nézte. Egy szponzoráló cég (a képernyőképen „SC Kiacom SRL", a
 *    Szponzortámogatások jogcímen) SOHA nem jött elő találatként, a rögzítő
 *    pedig „nem tag"-ot írt mellé. Igaz volt, de haszontalan: nem derült ki,
 *    hogy a cég korábban adott-e már, vagy most gépelték el a nevét — így
 *    ugyanaz a cég többféle írásmóddal került a könyvbe.
 *
 * Hat, egymástól függetlenül elromolható védelem:
 *
 *   (1) A kereső KÉT FORRÁSBÓL hozza a cégeket: a banki import memóriájából
 *       (`bevetel_partner.megjelenites_nev`) és a korábbi, taghoz NEM kötött
 *       bevételi sorokból (`befizetes.forrasa`). Egy forrás önmagában féloldalas.
 *   (2) A BELSŐ MOZGÁS sorok KI VANNAK SZŰRVE — a `forrasa` ott rendszer-
 *       generált („Belső mozgás — kasszából"), nem partner-név.
 *   (3) A cég-találat `kind: 'ceg'`, és a NEGATÍV ál-azonosító SOHA nem kerülhet
 *       `id_szemely` FK-ba (a `payerFromHit` a nem-`szemely` fajtáknál `id: null`).
 *   (4) A kiválasztott cég FELISMERT partner (`linked`), tehát nem világít rá a
 *       „nem tag", és NEM indul rá járulék-ajánló.
 *   (5) PASSZÍV JELZÉS: a begépelt — ki nem választott — ismert cégnév „cég"
 *       jelvényt kap a „nem tag" helyett; ismeretlennél marad a „nem tag".
 *   (6) A passzív jelzés LAPOZOTT listából dolgozik (a PostgREST néma 1000-es
 *       plafonja miatt), és a két lista (kiadás/bevétel) FÜGGETLENÜL tölt.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-kassza-ceg-partner.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'combined-entry-dialog.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [ACTIONS, BODY, DIALOG]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA cég-partner önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}
/** Függvényhatáros ablak — a vég-jelző KÓD legyen, ne komment (a kodCsak kitörli). */
function ablak(forras, kezdo, veg) {
  const k = kodCsak(forras)
  const i = k.indexOf(kezdo)
  if (i < 0) return ''
  const j = k.indexOf(veg, i + kezdo.length)
  return j < 0 ? k.slice(i) : k.slice(i, j)
}

const act = olvas(ACTIONS)
const body = olvas(BODY)
const dlg = olvas(DIALOG)

// ── (1) KÉT FORRÁS ───────────────────────────────────────────────────────
{
  const w = ablak(act, 'async function keresBevetelCegek(', 'export async function listIncomePartnerNames(')
  if (!w) {
    fail('(1) a `keresBevetelCegek` nem található — a kereső nem hoz cégeket')
  } else {
    if (/\.from\('bevetel_partner'\)/.test(w)) ok('(1) forrás: banki import-memória (bevetel_partner)')
    else fail('(1) HIÁNYZIK a bevetel_partner forrás — az átutalással ismert cég nem jönne elő')
    if (/\.from\('befizetes'\)/.test(w)) ok('(1) forrás: korábbi, taghoz nem kötött bevételi sorok')
    else fail('(1) HIÁNYZIK a befizetes forrás — a készpénzben már adott cég nem jönne elő')
    if (/\.is\('id_szemely', null\)/.test(w) && /\.is\('id_csalad', null\)/.test(w)) {
      ok('(1) csak a taghoz NEM kötött sorokból gyűjt (a tagok a személy-ágon jönnek)')
    } else fail('(1) a befizetes-forrás taghoz kötött sorokat is behúzna — duplán jelenne meg a tag')
  }
}
orzo(
  '(1) a gyülekezeti ág PÁRHUZAMOSAN kéri a tagokat és a cégeket',
  act,
  /Promise\.all\(\[\s*queryCongregationMembers\([\s\S]{0,200}?keresBevetelCegek\(/,
  (s) => s.replace(/keresBevetelCegek\(supabase, scope\.scopeId, term\),/, ''),
)

// ── (2) A BELSŐ MOZGÁS NEM PARTNER ───────────────────────────────────────
orzo(
  '(2) a rendszer-generált „Belső mozgás" nevek kiszűrve',
  act,
  /if \(s\.startsWith\('Belső mozgás'\)\) return ''/,
  (s) => s.replace(/if \(s\.startsWith\('Belső mozgás'\)\) return ''/, ''),
)

// ── (3) A NEGATÍV ÁL-AZONOSÍTÓ SOSEM LESZ id_szemely ─────────────────────
{
  const w = ablak(act, "case 'congregation': {", "case 'diocese':")
  if (/kind: 'ceg' as const/.test(w)) ok('(3) a cég-találat fajtája `ceg`')
  else fail('(3) a cég-találat nem `ceg` fajtájú — a kliens személyként kezelné')
  if (/refId: null/.test(w)) ok('(3) a cégnek NINCS refId (nem felső szintű partner-FK)')
  else fail('(3) a cég refId-t kapna — a szerver befizeto_scope_id-ként próbálná menteni')
  // A kliens-oldali garancia: nem-`szemely` fajtánál az id NULL lesz.
  const pf = ablak(body, 'function payerFromHit(', 'function payerMetaParts(')
  if (/id: kind === 'szemely' \? h\.id : null/.test(pf)) {
    ok('(3) a kliens a nem-`szemely` fajtáknál `id: null`-t ad → sosem lesz id_szemely FK')
  } else fail('(3) a payerFromHit garanciája eltűnt — a negatív ál-azonosító FK-ba kerülhetne')
  // NEGATÍV: ha a garancia kiesik, az őrnek buknia kell.
  const mutans = ablak(body.replace("id: kind === 'szemely' ? h.id : null", 'id: h.id'), 'function payerFromHit(', 'function payerMetaParts(')
  if (!/id: kind === 'szemely' \? h\.id : null/.test(mutans)) ok('NEGATÍV — a garancia kivételét az őr elkapná')
  else fail('NEGATÍV — az őr VAK a garancia kivételére')
}

// ── (4) A KIVÁLASZTOTT CÉG FELISMERT ─────────────────────────────────────
orzo(
  '(4) a kiválasztott cég FELISMERT partner (nem „nem tag")',
  body,
  /linked=\{!!single && \(single\.id != null \|\| !!single\.refId \|\| single\.kind === 'ceg'\)\}/,
  (s) => s.replace(/ \|\| single\.kind === 'ceg'/, ''),
)
{
  // A járulék-ajánló CSAK azonosított TAGRA indulhat — cégre soha.
  const w = ablak(body, 'function jarulekSlotVarhato(', 'function renderJarulekSlot(')
  if (/p\.id == null/.test(w)) ok('(4) a járulék-ajánló nem indul cégre (azonosított tag kell)')
  else fail('(4) a járulék-ajánló cégre is elindulhat — értelmetlen díjat ajánlana')
}
{
  // A cég csoport-fejlécet és sorrend-helyet kap a találati listában.
  const kod = kodCsak(body)
  if (/ceg: 'Cégek, szervezetek'/.test(kod)) ok('(4) a találati lista külön csoportban mutatja a cégeket')
  else fail('(4) nincs csoport-felirat a cégeknek')
  if (/PARTNER_CSOPORT_SORREND[^\n]*'ceg'/.test(kod)) ok('(4) a cég-csoport helye rögzített a sorrendben')
  else fail('(4) a cég-csoport kimarad a megjelenítési sorrendből — a találatok eltűnnének')
}

// ── (5) PASSZÍV „CÉG" JELZÉS ─────────────────────────────────────────────
orzo(
  '(5) ismert cégnévnél „cég" jelvény',
  body,
  /showUnlinkedBadge && !linked && ismertCeg &&[\s\S]{0,400}?>\s*cég\s*</,
  (s) => s.replace(/showUnlinkedBadge && !linked && ismertCeg &&/, 'false &&'),
)
orzo(
  '(5) ismeretlen névnél MARAD a „nem tag"',
  body,
  /showUnlinkedBadge && !linked && !ismertCeg &&[\s\S]{0,400}?>\s*nem tag\s*</,
  (s) => s.replace(/showUnlinkedBadge && !linked && !ismertCeg &&/, 'false &&'),
)
{
  // A jelzés a KIVÁLASZTOTT nevet nézi, ha van; különben a begépeltet.
  const kod = kodCsak(body)
  if (/ismertCeg=\{mode === 'income' && !!cegJelzes\?\.\(single \? single\.name : row\.partner\)\}/.test(kod)) {
    ok('(5) a jelzés a kiválasztott, illetve a begépelt nevet vizsgálja')
  } else fail('(5) a „cég" jelzés bemenete nem a tényleges név')
  // A normalizálás a KÖZÖS magból jön — „SC KIACOM SRL" = „SC Kiacom S.R.L.".
  const w = ablak(body, 'const ismertCegek = useMemo(', 'const cegJelzes = useCallback(')
  if (/normalizeNameForMatch/.test(w)) ok('(5) a cégnév-egyeztetés a közös normalizálót használja')
  else fail('(5) a cégnév-egyeztetés nyers összehasonlítás — az írásmód-eltérés „nem tag"-ot adna')
  // FAIL-SAFE: betöltetlen lista → NINCS jelzés, nem „minden ismeretlen".
  if (/if \(!knownIncomePartners\) return null/.test(kodCsak(body))) {
    ok('(5) betöltetlen listánál NINCS jelzés (nem állít semmit)')
  } else fail('(5) a betöltetlen lista minden céget ismeretlennek mondana')
}

// ── (6) LAPOZÁS + FÜGGETLEN BETÖLTÉS ─────────────────────────────────────
{
  const w = ablak(act, 'export async function listIncomePartnerNames(', 'export async function searchIncomePartners(')
  if (!w) fail('(6) a `listIncomePartnerNames` nem található')
  else if ((w.match(/selectAllPaged/g) || []).length >= 2) {
    ok('(6) a passzív jelzés listája MINDKÉT forrásból lapozva jön (nincs néma 1000-es csonkolás)')
  } else fail('(6) a lista nem lapozva jön — a levágott cégek tévesen „nem tag"-ként világítanának')
}
{
  const kod = kodCsak(dlg)
  if (/listIncomePartnerNames\(\)/.test(kod) && /knownIncomePartners=\{ismertCegek\}/.test(kod)) {
    ok('(6) a dialógus betölti és átadja a cég-listát')
  } else fail('(6) a dialógus nem köti be a cég-listát — a jelzés sosem jelenne meg')
  // A két betöltés FÜGGETLEN: külön .then/.catch, hogy az egyik bukása ne
  // vigye el a másik jelzését is.
  const w = ablak(dlg, 'void listExpensePartnerNames()', 'return () => { ervenyes = false }')
  if (/void listIncomePartnerNames\(\)/.test(w) && (w.match(/\.catch\(/g) || []).length >= 2) {
    ok('(6) a kiadás- és a bevétel-lista FÜGGETLENÜL tölt (külön hibaág)')
  } else fail('(6) a két lista összekapcsolva tölt — az egyik bukása elvinné a másikat is')
}

if (failed) { console.error('\nA cég-partner önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA cég-partner önellenőrzés rendben.')
