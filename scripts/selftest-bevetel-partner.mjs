#!/usr/bin/env node
/**
 * BEVÉTEL-PARTNER MEMÓRIA önellenőrzés (2026-08-29, Endre kérése)
 *
 * MIT ŐRIZ:
 *   (1) az új bevetel_partner tábla SQL-je teljes: roles-first RLS (a repó
 *       hibaosztály-szabálya: minden policynek profile_roles-láb kell),
 *       egyediségi kulcs (congregation + nyers_nev), cél-CHECK;
 *   (2) a név-normalizálás KONZERVATÍV: kisbetű + trim + szóköz-össze, de az
 *       írásjel MARAD („S.A." ≠ „SA" — dokumentált csapda);
 *   (3) a banki import ALKALMAZZA a memóriát (tag/cégnév automatikus
 *       beállítása a kivonat-név alapján);
 *   (4) a szerkesztőben történt tag-hozzárendelés/név-beírás banki bevételen
 *       MEGJEGYZŐDIK (rememberBevetelPartner);
 *   (5) a Tranzakciók-jelző a feltöltött számla-párokat is zöldnek mutatja.
 *
 * NEGATÍV ASSZERT: alkalmazás-törlő + megjegyzés-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-bevetel-partner.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-29-bevetel-partner.sql')
const NEV = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'bevetel-partner-nev.ts')
const ACT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'bevetel-partner-actions.ts')
const IMP = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'bank-import-actions.ts')
const EDIT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const OBLIO = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'oblio-ellenorzes-actions.ts')
const TRTAB = path.join(REPO, 'apps', 'web', 'components', 'finance', 'transactions-tab.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(files) {
  const hibak = []

  // (1) SQL
  if (!files.has(SQL)) {
    hibak.push('a bevetel_partner SQL HIÁNYZIK')
  } else {
    const s = files.get(SQL)
    if ((s.match(/CREATE POLICY bevetel_partner_/g) || []).length < 4) {
      hibak.push('SQL: nincs meg mind a 4 RLS-policy')
    }
    if ((s.match(/profile_roles/g) || []).length < 4) {
      hibak.push('SQL: a roles-first láb hiányzik valamelyik policyből (skalár-hatókör hibaosztály)')
    }
    if (!/uniq_bevetel_partner_nev/.test(s)) hibak.push('SQL: nincs egyediségi index')
    if (!/bevetel_partner_cel_check/.test(s)) hibak.push('SQL: nincs cél-CHECK (tag VAGY név)')
  }

  // (3) az import alkalmazza a memóriát
  const imp = stripComments(files.get(IMP))
  if (!/getBevetelPartnerMemoria\(\)/.test(imp) || !/normalizaltBankiNev\(/.test(imp)) {
    hibak.push('bank-import: a partner-memória nincs alkalmazva — a kézi hozzárendelés minden hónapban újra kellene')
  }
  // (4) a szerkesztő megjegyzi
  const edit = stripComments(files.get(EDIT))
  if (!/rememberBevetelPartner\(\{/.test(edit)) {
    hibak.push('szerkesztő: a hozzárendelés nem jegyződik meg (rememberBevetelPartner hiányzik)')
  }
  // (5) Tranzakciók-jelző: feltöltött párok
  const oblio = stripComments(files.get(OBLIO))
  if (!/szallitoi_szamla_kiadas/.test(oblio) || !/feltoltottParok/.test(oblio)) {
    hibak.push('oblio-actions: a feltöltött számla-párok nem kerülnek a jelző-halmazba')
  }
  const tr = stripComments(files.get(TRTAB))
  if (!/feltoltottParok/.test(tr)) {
    hibak.push('transactions-tab: a jelző nem uniózza a feltöltött párokat')
  }
  // az akciók léteznek
  const act = stripComments(files.get(ACT))
  if (!/rememberBevetelPartner/.test(act) || !/getBevetelPartnerMemoria/.test(act)) {
    hibak.push('bevetel-partner-actions: hiányzó akció')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [NEV, ACT, IMP, EDIT, OBLIO, TRTAB]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  if (fs.existsSync(SQL)) m.set(SQL, fs.readFileSync(SQL, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('bevétel-partner memória: SQL + import-alkalmazás + megjegyzés + Tranzakció-jelző a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── VISELKEDÉS — a normalizáló (konzervatív!) ───────────────────────────────
if (hibak.length === 0) {
  const nevSrc = files.get(NEV)
  const talalat = nevSrc.match(/return \(nev \?\? ''\)([^\n]+)/)
  if (!talalat) bukik('a normalizáló törzse nem emelhető ki (fail-closed)')
  else {
    const fn = (nev) => eval(`((nev) => (nev ?? '')${talalat[1]})`)(nev)
    const esetek = [
      ['  Kovács   János ', 'kovács jános', 'trim + szóköz-össze + kisbetű'],
      ['EXAMPLE S.A.', 'example s.a.', 'az írásjel MARAD (S.A. ≠ SA)'],
      [null, '', 'null → üres'],
    ]
    for (const [be, vart, magyarazat] of esetek) {
      const kapott = fn(be)
      if (kapott === vart) pass(`viselkedés: ${magyarazat}`)
      else bukik(`viselkedés: ${magyarazat} — kapott: ${JSON.stringify(kapott)}, várt: ${JSON.stringify(vart)}`)
    }
  }
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: az import-alkalmazás kilövése
  const m1files = beolvas()
  const i1 = m1files.get(IMP)
  const i1mut = i1.replace(/getBevetelPartnerMemoria\(\)/g, 'getBevetelPartnerMemoria_KIKAPCSOLVA()')
  m1files.set(IMP, i1mut)
  if (i1mut === i1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: az alkalmazás kilövésére az őr NEM bukik — vak')
  else pass('M1 mutáns (import-alkalmazás kilőve) → az őr elbuktatja')

  // M2: a megjegyzés kilövése a szerkesztőből
  const m2files = beolvas()
  const e2 = m2files.get(EDIT)
  const e2mut = e2.replace(/rememberBevetelPartner\(\{/, 'rememberBevetelPartner_KIKAPCSOLVA({')
  m2files.set(EDIT, e2mut)
  if (e2mut === e2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a megjegyzés kilövésére az őr NEM bukik — vak')
  else pass('M2 mutáns (megjegyzés kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — bevétel-partner memória rendben`)
