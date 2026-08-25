#!/usr/bin/env node
/**
 * TITOK-SZÉF önellenőrzés (2026-08-24).
 *
 * Mit véd:
 *   · apps/web/lib/supabase/secret-vault.ts            — a kulcs-választás
 *   · apps/web/app/(dashboard)/admin/rendszer/page.tsx — a látható jelzés
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — A SZÉF KULCSA NÉMÁN EGY 6 JEGYŰ PIN-RE ESETT VISSZA
 * ════════════════════════════════════════════════════════════════════════════
 * A javítás előtt a széf kulcsa egyetlen sor volt:
 *
 *     const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || process.env.GOD_MODE_PIN || ''
 *
 * Ha a `VAULT_ENCRYPTION_KEY` nem volt beállítva, a rendszer a god-mode PIN-nel
 * TITKOSÍTOTT. A PIN a saját kódunk szerint (`god-mode/actions-v4.ts`,
 * `isValidPin`: /^\d{6}$/) pontosan 6 számjegy → 10^6 lehetőség: egy megszerzett
 * adatbázis-mentésből offline, másodpercek alatt kifejthető az Oblio API-kulcs
 * ÉS maga a god-mode PIN is (ami a god-mode felület második faktora).
 *
 * A figyelmeztetés ráadásul HALOTT KÓD volt: az `if (!VAULT_KEY)` csak akkor
 * lépett be, ha MINDKETTŐ hiányzott — vagyis pont abban az esetben hallgatott,
 * amikor a PIN-fallback ténylegesen aktív (VAULT nincs, PIN van).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ AMIT EZ AZ ŐRSZEM SZÁNDÉKOSAN NEM KÖVETEL
 * ════════════════════════════════════════════════════════════════════════════
 * A már titkosított sorok CSAK az eredeti kulccsal fejthetők vissza. Ezért a
 * VISSZAFEJTÉS-nek meg KELL tartania a régi PIN-fallbackot — enélkül a meglévő
 * Oblio-titkok némán olvashatatlanná válnának (éles adatvesztés). Az M4 mérce
 * ezt a megtartást VÉDI: aki „biztonsági szigorításként" kidobná a fallbackot,
 * abba itt fog beleütközni.
 *
 * Ugyanígy: a rövid (32 karakternél kisebb) kulcs CSAK jelzést kap, megállítani
 * NEM állítja meg a rendszert — ezt az M2/b mutáns őrzi.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A HAT MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *  M1  SZINTAXIS   — mindkét érintett fájl TS/TSX-értelemben elemezhető.
 *  M2  TISZTA MAG  — a `szefKulcsDontes()` mind a négy env-állapotra a helyes
 *                    döntést adja; a forrásban (kommentek nélkül) nincs többé
 *                    `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN` egysoros.
 *  M3  ÍRÁS        — erős kulcs nélkül az `encryptSecret` FAIL-CLOSED megáll
 *                    (a DB-t meg sem szólítja), erős kulccsal pedig KIZÁRÓLAG
 *                    az erős kulccsal titkosít — a PIN sosem lesz írókulcs.
 *  M4  OLVASÁS     — a `decryptSecret` a fallback kulcsokat IS megpróbálja
 *                    (PIN, majd az örökölt ÜRES kulcs), így a régi sorok
 *                    olvashatók maradnak. A régi kulcs `|| ''`-re is eshetett:
 *                    ha a PIN az ADATBÁZISBAN élt és nem env-ben, a széf ÜRES
 *                    jelszóval titkosított — az ilyen sor is olvasható kell
 *                    maradjon.
 *  M5  HANGOS SZÓ  — VAULT hiányzik DE PIN van → a figyelmeztetés MEGSZÓLAL
 *                    (modul-betöltéskor ÉS első használatkor). Ez pontosan az
 *                    az eset, ami a javítás előtt némán elment.
 *  M6  ADMIN JELZÉS— a /admin/rendszer oldal kiírja a széf figyelmeztetését,
 *                    de csak a fő rendszergazdának, és a kulcsot sosem.
 *
 *  NEGATÍV ASSZERT — a RÉGI világ a MAI forrásból, string-átalakítással
 *                    visszaállítva (NEM git-történelemből: a projektben már
 *                    elsült, hogy commitkor a HEAD maga lett a javított fájl).
 *                    Ha egy csere nem fog (elmozdult horgony), az őrszem SZÓL.
 *
 * Futtatás:  node scripts/selftest-titok-szef.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REL = {
  vault: 'apps/web/lib/supabase/secret-vault.ts',
  adminOldal: 'apps/web/app/(dashboard)/admin/rendszer/page.tsx',
}

/** 64 hex karakter — ilyet ad az `openssl rand -hex 32`. */
const EROS_KULCS = '0123456789abcdef'.repeat(4)
/** A god-mode PIN alakja: PONTOSAN 6 számjegy (isValidPin: /^\d{6}$/). */
const PIN = '123456'
/** Beállított, de gyenge kulcs — jelzést kap, de NEM állítja meg a rendszert. */
const ROVID_KULCS = 'rovid-kulcs'

/* ══════════════════════════════════════════════════════════════════════════
   ALAPOK
   ══════════════════════════════════════════════════════════════════════════ */

const require_ = createRequire(path.join(ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const egysegesSorvegek = (s) => s.replace(/\r\n/g, '\n')

function olvas(rel) {
  const teljes = path.join(ROOT, rel)
  if (!fs.existsSync(teljes)) return null
  return egysegesSorvegek(fs.readFileSync(teljes, 'utf8'))
}

/**
 * Kommentek kiszedése.
 * A szöveges mércék CSAK a valóban lefutó kódot nézhetik: egy magyarázó
 * kommentbe írt `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN` senkit nem titkosít —
 * ez a fájl épp ilyen kommentet tartalmaz (a régi anti-minta idézeteként).
 */
function kommentNelkul(szoveg) {
  return szoveg
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ') // JSX-komment
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blokk-komment (a /** */ is)
    .replace(/^[ \t]*\/\/.*$/gm, ' ') // teljes soros // komment
}

const norm = (s) => s.replace(/\s+/g, ' ')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-szef-selftest-'))
let modulSzamlalo = 0

/** A `server-only` import horgonya — a TS→CJS fordításnál ki kell venni. */
const SERVER_ONLY_HORGONY = "import 'server-only'"

/**
 * TS → CJS fordítás és betöltés.
 *
 * Fail-closed: (1) ha a `server-only` horgony eltűnik, szólunk (elmozdult
 * horgony); (2) ha valaha PROJEKT-import kerülne a fájlba, inkább itt bukjon
 * el, érthető üzenettel — a `node:` beépítettek megengedettek.
 */
function tsToCjs(forras, cimke) {
  if (!forras.includes(SERVER_ONLY_HORGONY)) {
    throw new Error(
      `${cimke}: nem találom a "${SERVER_ONLY_HORGONY}" sort — elmozdult a horgony, ` +
        'az őrszem nem tudja betölteni a modult. Frissítsd a SERVER_ONLY_HORGONY konstanst.',
    )
  }
  const kod = forras.replace(SERVER_ONLY_HORGONY, '')
  const out = ts.transpileModule(kod, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: 'secret-vault.ts',
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${cimke}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}) — ` +
        'az őrszem csak beépített modulokat használó forrást tud önállóan fordítani.',
    )
  }
  return out.outputText
}

const ENV_KULCSOK = ['VAULT_ENCRYPTION_KEY', 'GOD_MODE_PIN']

function envMent() {
  const m = {}
  for (const k of ENV_KULCSOK) m[k] = process.env[k]
  return m
}

function envAllit(ertekek) {
  for (const k of ENV_KULCSOK) {
    const v = ertekek[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

/** Egy hívás console.warn-jainak begyűjtése. */
async function warnBen(fn) {
  const gyujto = []
  const eredeti = console.warn
  console.warn = (...a) => gyujto.push(a.map((x) => String(x)).join(' '))
  try {
    const eredmeny = await fn()
    return { eredmeny, warnok: gyujto, hiba: null }
  } catch (e) {
    return { eredmeny: null, warnok: gyujto, hiba: e }
  } finally {
    console.warn = eredeti
  }
}

/**
 * Friss modul-példány betöltése MEGADOTT env mellett.
 * Minden példány külön fájlnévre kerül, hogy a require-cache ne adja vissza a
 * korábbit — a modul-szintű figyelmeztetés így minden betöltésnél újrafut.
 */
async function betolt(forras, env, cimke) {
  const kod = tsToCjs(forras, cimke)
  const dest = path.join(TMP, `szef-${++modulSzamlalo}.js`)
  fs.writeFileSync(dest, kod, 'utf8')

  const mentett = envMent()
  envAllit(env)
  const r = await warnBen(async () => require_(dest))
  envAllit(mentett)
  if (r.hiba) throw r.hiba
  return { modul: r.eredmeny, betoltesiWarnok: r.warnok }
}

/** Adott env-ben futtat egy (aszinkron) hívást, warn-gyűjtéssel. */
async function envBenHiv(env, fn) {
  const mentett = envMent()
  envAllit(env)
  const r = await warnBen(fn)
  envAllit(mentett)
  return r
}

/**
 * Hamis Supabase kliens.
 * A `vault_encrypt` „ENC(<kulcs>):<szöveg>" alakot ad, a `vault_decrypt` pedig
 * CSAK akkor fejt vissza, ha a kapott kulcs egyezik a titkosításkor használttal
 * — épp úgy, ahogy a pgcrypto `pgp_sym_decrypt` rossz kulcsnál hibát dob.
 */
function hamisSupabase(naplo) {
  return {
    async rpc(fn, args) {
      naplo.push({ fn, kulcs: args.key_input })
      if (fn === 'vault_encrypt') {
        return { data: `ENC(${args.key_input}):${args.plaintext_input}`, error: null }
      }
      if (fn === 'vault_decrypt') {
        const elotag = `ENC(${args.key_input}):`
        const be = String(args.encrypted_input)
        if (be.startsWith(elotag)) return { data: be.slice(elotag.length), error: null }
        return { data: null, error: { message: 'Wrong key or corrupt data' } }
      }
      return { data: null, error: { message: `ismeretlen rpc: ${fn}` } }
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   A MÉRCÉK
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Egy „világ" (a két forrásfájl szövege) végigmérése.
 * @returns {{ mercek: Set<string>, uzenetek: string[] }} a BUKOTT mércék
 */
async function ellenoriz(vilag, cimke, opciok = {}) {
  const bukott = new Set()
  const uzenetek = []
  const halk = Boolean(opciok.halk)

  const jelent = (merce, ok, uzenet) => {
    if (ok) {
      if (!halk) console.log(`   ✓ ${uzenet}`)
      return
    }
    bukott.add(merce)
    uzenetek.push(`[${merce}] ${uzenet}`)
    if (!halk) console.log(`   ✗ [${merce}] ${uzenet}`)
  }

  if (!halk) console.log(`\n── ${cimke} ──`)

  /* ── M1: SZINTAXIS ───────────────────────────────────────────────────── */
  for (const [nev, forras, tsx] of [
    ['secret-vault.ts', vilag.vault, false],
    ['admin/rendszer/page.tsx', vilag.adminOldal, true],
  ]) {
    if (forras === null) {
      jelent('M1', false, `hiányzik a forrásfájl: ${nev}`)
      continue
    }
    const sf = ts.createSourceFile(
      nev,
      forras,
      ts.ScriptTarget.ES2020,
      true,
      tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const diags = sf.parseDiagnostics ?? []
    jelent('M1', diags.length === 0, `${nev} szintaktikailag ép${diags.length ? ` (${diags.length} hiba)` : ''}`)
  }

  if (vilag.vault === null || vilag.adminOldal === null) {
    for (const m of ['M2', 'M3', 'M4', 'M5', 'M6']) bukott.add(m)
    return { mercek: bukott, uzenetek }
  }

  /* ── M2/szöveg: az anti-minta nem térhet vissza ───────────────────────── */
  const vaultKod = norm(kommentNelkul(vilag.vault))
  jelent(
    'M2',
    !/process\.env\.VAULT_ENCRYPTION_KEY\s*\|\|\s*process\.env\.GOD_MODE_PIN/.test(vaultKod),
    'a forrásban (kommentek nélkül) nincs `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN` egysoros',
  )

  /* ── A modul betöltése (M2–M5 futásidejű mércéihez) ───────────────────── */
  let modul = null
  try {
    const b = await betolt(vilag.vault, { VAULT_ENCRYPTION_KEY: EROS_KULCS }, cimke)
    modul = b.modul
  } catch (e) {
    for (const m of ['M2', 'M3', 'M4', 'M5']) {
      jelent(m, false, `a modul nem tölthető be: ${String(e?.message || e)}`)
    }
    await m6AdminJelzes(vilag, jelent)
    return { mercek: bukott, uzenetek }
  }

  if (typeof modul.szefKulcsDontes !== 'function' || typeof modul.szefAllapot !== 'function') {
    for (const m of ['M2', 'M3', 'M4', 'M5']) {
      jelent(m, false, 'hiányzik a `szefKulcsDontes` / `szefAllapot` export (nincs tiszta mag)')
    }
    await m6AdminJelzes(vilag, jelent)
    return { mercek: bukott, uzenetek }
  }

  /* ── M2: a tiszta mag négy állapota ───────────────────────────────────── */
  const d = (vaultKey, godModePin) => modul.szefKulcsDontes({ vaultKey, godModePin })

  {
    // (a) SEMMI: se erős kulcs, se PIN
    const r = d(undefined, undefined)
    jelent('M2', r.irhato === false, '(nincs kulcs) az írás TILTVA')
    jelent(
      'M2',
      r.olvasoKulcsok.length === 1 && r.olvasoKulcsok[0] === '',
      '(nincs kulcs) csak az ÖRÖKÖLT ÜRES kulcs marad olvasásra (a régi `|| \'\'` ág terméke)',
    )
    jelent('M2', typeof r.figyelmeztetes === 'string', '(nincs kulcs) van figyelmeztetés')
  }
  {
    // (b) ⭐ A VESZÉLYES ESET: nincs erős kulcs, DE van PIN
    const r = d(undefined, PIN)
    jelent('M2', r.irhato === false, '⭐ (csak PIN) az írás TILTVA — nem keletkezik új, gyenge kulcsú titok')
    jelent('M2', r.irasKulcs === null, '⭐ (csak PIN) nincs írókulcs')
    jelent('M2', r.olvasoKulcsok.includes(PIN), '(csak PIN) a régi adat OLVASHATÓ marad (a PIN-t próbálja)')
    jelent(
      'M2',
      typeof r.figyelmeztetes === 'string' && r.figyelmeztetes.includes('VAULT_ENCRYPTION_KEY'),
      '⭐ (csak PIN) MEGSZÓLAL a figyelmeztetés — ez volt a halott kód esete',
    )
  }
  {
    // (c) Erős kulcs, PIN nélkül
    const r = d(EROS_KULCS, undefined)
    jelent('M2', r.irhato === true && r.irasKulcs === EROS_KULCS, '(erős kulcs) az írás ENGEDVE, az erős kulccsal')
    jelent('M2', r.figyelmeztetes === null, '(erős kulcs) NINCS figyelmeztetés')
  }
  {
    // (d) Erős kulcs ÉS PIN — az átmeneti állapot: a kulcs már be van állítva,
    //     de a régi sorok még a PIN-nel titkosítottak.
    const r = d(EROS_KULCS, PIN)
    jelent('M2', r.irhato === true && r.irasKulcs === EROS_KULCS, '(erős kulcs + PIN) az ÍRÁS csak az erős kulccsal')
    jelent(
      'M2',
      r.olvasoKulcsok[0] === EROS_KULCS && r.olvasoKulcsok.includes(PIN),
      '⭐ (erős kulcs + PIN) az OLVASÁS a PIN-t is megpróbálja — a meglévő titkok nem vesznek el',
    )
    jelent('M2', r.figyelmeztetes === null, '(erős kulcs + PIN) nincs figyelmeztetés')
  }
  {
    // (e) Rövid kulcs: JELZÉST kap, de NEM állítja meg a rendszert.
    const r = d(ROVID_KULCS, undefined)
    jelent('M2', r.irhato === true, '(rövid kulcs) az írás MEGY TOVÁBB — működő rendszert nem törünk el')
    jelent('M2', typeof r.figyelmeztetes === 'string', '(rövid kulcs) mégis van jelzés a naplóban')
  }
  {
    // (f) Csupa szóköz = nincs kulcs; azonos kulcs kétszer = egyszer próbáljuk.
    const ures = d('   ', undefined)
    jelent('M2', ures.irhato === false, '(csupa szóköz) nem számít kulcsnak')
    const ketto = d(PIN, PIN)
    jelent(
      'M2',
      ketto.olvasoKulcsok.length === 2,
      '(azonos kulcs kétszer) nincs fölösleges próbálkozás (a kulcs + az örökölt üres)',
    )
  }

  /* ── M3: ÍRÁS — fail-closed ───────────────────────────────────────────── */
  {
    const naplo = []
    const r = await envBenHiv({ GOD_MODE_PIN: PIN }, () =>
      modul.encryptSecret(hamisSupabase(naplo), 'oblio-api-titok'),
    )
    const dobott = r.hiba !== null
    jelent('M3', dobott, '⭐ erős kulcs nélkül az encryptSecret MEGÁLL (nem titkosít a 6 jegyű PIN-nel)')
    jelent(
      'M3',
      dobott && String(r.hiba.message).includes('VAULT_ENCRYPTION_KEY'),
      'a hibaüzenet megnevezi a VAULT_ENCRYPTION_KEY-t (beszédes, magyar)',
    )
    jelent('M3', naplo.length === 0, 'a DB-t meg sem szólítja (nem keletkezik félkész sor)')
  }
  {
    const naplo = []
    const r = await envBenHiv({ VAULT_ENCRYPTION_KEY: EROS_KULCS, GOD_MODE_PIN: PIN }, () =>
      modul.encryptSecret(hamisSupabase(naplo), 'oblio-api-titok'),
    )
    jelent('M3', r.hiba === null, 'erős kulccsal az írás MŰKÖDIK')
    jelent(
      'M3',
      naplo.length === 1 && naplo[0].kulcs === EROS_KULCS,
      '⭐ az írókulcs KIZÁRÓLAG az erős kulcs — a PIN sosem lesz írókulcs',
    )
  }

  /* ── M4: OLVASÁS — a fallback kulcs is sorra kerül ────────────────────── */
  {
    // A régi világ terméke: a titok még a PIN-nel készült.
    const regiTitok = `ENC(${PIN}):oblio-api-titok`
    const naplo = []
    const r = await envBenHiv({ VAULT_ENCRYPTION_KEY: EROS_KULCS, GOD_MODE_PIN: PIN }, () =>
      modul.decryptSecret(hamisSupabase(naplo), regiTitok),
    )
    jelent(
      'M4',
      r.hiba === null && r.eredmeny === 'oblio-api-titok',
      '⭐ a PIN-nel titkosított RÉGI titok az erős kulcs beállítása után is OLVASHATÓ',
    )
    jelent(
      'M4',
      naplo.length === 2 && naplo[0].kulcs === EROS_KULCS && naplo[1].kulcs === PIN,
      'a sorrend helyes: előbb az erős kulcs, csak utána a régi fallback',
    )
  }
  {
    // Erős kulccsal titkosított sor: egyetlen próbálkozás elég.
    const naplo = []
    const r = await envBenHiv({ VAULT_ENCRYPTION_KEY: EROS_KULCS, GOD_MODE_PIN: PIN }, () =>
      modul.decryptSecret(hamisSupabase(naplo), `ENC(${EROS_KULCS}):uj-titok`),
    )
    jelent('M4', r.hiba === null && r.eredmeny === 'uj-titok', 'az erős kulcsú titok visszafejthető')
    jelent('M4', naplo.length === 1, 'sikeres első próbálkozás után nem próbálkozik tovább')
  }
  {
    // ⭐ A LEGRÉGEBBI ÖRÖKSÉG: a régi sor `vault || pin || ''` volt. Ha egyik env
    // sem volt beállítva (a PIN az ADATBÁZISBAN élt, nem env-ben), a széf ÜRES
    // kulccsal titkosított. Az ilyen sor a kulcs beállítása után is olvasható
    // kell maradjon — különben éles adatvesztés.
    const naplo = []
    const r = await envBenHiv({ VAULT_ENCRYPTION_KEY: EROS_KULCS }, () =>
      modul.decryptSecret(hamisSupabase(naplo), 'ENC():regi-kulcs-nelkuli-titok'),
    )
    jelent(
      'M4',
      r.hiba === null && r.eredmeny === 'regi-kulcs-nelkuli-titok',
      '⭐ az ÜRES kulccsal titkosított legrégebbi sor is olvasható marad',
    )
    jelent(
      'M4',
      naplo.length >= 1 && naplo[naplo.length - 1].kulcs === '',
      'az üres kulcs a LEGUTOLSÓ próbálkozás (nem előzi meg az erőset)',
    )
  }
  {
    // Sérült adat: minden kulcs elbukik → beszédes hiba, nem néma üres érték.
    const naplo = []
    const r = await envBenHiv({ VAULT_ENCRYPTION_KEY: EROS_KULCS, GOD_MODE_PIN: PIN }, () =>
      modul.decryptSecret(hamisSupabase(naplo), 'ENC(masvalami):x'),
    )
    jelent('M4', r.hiba !== null, 'sérült/idegen adatnál HIBÁT dob (nem ad vissza némán semmit)')
    jelent(
      'M4',
      r.hiba !== null && !String(r.hiba.message).includes(EROS_KULCS) && !String(r.hiba.message).includes(PIN),
      'a hibaüzenet SOHA nem árulja el a kulcsot',
    )
  }

  /* ── M5: HANGOS SZÓ ───────────────────────────────────────────────────── */
  {
    // ⭐ VAULT hiányzik, DE PIN van — a javítás előtt ez ment el némán.
    const b = await betolt(vilag.vault, { GOD_MODE_PIN: PIN }, cimke)
    const szoveg = b.betoltesiWarnok.join(' | ')
    jelent(
      'M5',
      b.betoltesiWarnok.length > 0 && szoveg.includes('VAULT_ENCRYPTION_KEY'),
      '⭐ (VAULT nincs, PIN van) a modul BETÖLTÉSEKOR megszólal a napló',
    )
    jelent('M5', !szoveg.includes(PIN), 'a napló nem írja ki a PIN-t')
  }
  {
    // Erős kulcs mellett NINCS zaj.
    const b = await betolt(vilag.vault, { VAULT_ENCRYPTION_KEY: EROS_KULCS }, cimke)
    jelent('M5', b.betoltesiWarnok.length === 0, '(erős kulcs) a napló csendes — nincs vaklárma')
  }
  {
    // ELSŐ HASZNÁLATKOR is szól: a modul erős kulccsal töltődött (néma), de a
    // hívás pillanatában már nincs erős kulcs.
    const b = await betolt(vilag.vault, { VAULT_ENCRYPTION_KEY: EROS_KULCS }, cimke)
    const naplo = []
    const r = await envBenHiv({ GOD_MODE_PIN: PIN }, () =>
      b.modul.encryptSecret(hamisSupabase(naplo), 'x'),
    )
    jelent(
      'M5',
      r.warnok.join(' | ').includes('VAULT_ENCRYPTION_KEY'),
      '⭐ ELSŐ HASZNÁLATKOR is megszólal (nem csak induláskor)',
    )
  }

  /* ── M6: ADMIN JELZÉS ─────────────────────────────────────────────────── */
  await m6AdminJelzes(vilag, jelent)

  return { mercek: bukott, uzenetek }
}

/** M6 — a /admin/rendszer oldal látható jelzése. */
async function m6AdminJelzes(vilag, jelent) {
  if (vilag.adminOldal === null) {
    jelent('M6', false, 'hiányzik az admin oldal')
    return
  }
  const kod = norm(kommentNelkul(vilag.adminOldal))
  jelent('M6', kod.includes("from '@/lib/supabase/secret-vault'"), 'az admin oldal a széfből kéri az állapotot')
  jelent('M6', kod.includes('szefAllapot()'), 'ténylegesen meghívja a `szefAllapot()`-ot')
  jelent('M6', kod.includes('{szef.figyelmeztetes}'), 'ki is ÍRJA a figyelmeztetést (nem csak lekéri)')
  jelent('M6', /master\s*&&/.test(kod), 'csak a fő rendszergazdának mutatja')
  jelent('M6', !kod.includes('process.env'), 'a kulcs maga sosem kerül a felületre')
}

/* ══════════════════════════════════════════════════════════════════════════
   FUTÁS
   ══════════════════════════════════════════════════════════════════════════ */

const ELES = {
  vault: olvas(REL.vault),
  adminOldal: olvas(REL.adminOldal),
}

console.log('═══ TITOK-SZÉF ÖNELLENŐRZÉS ═══')
const eles = await ellenoriz(ELES, 'ÉLES FÁJLOK')

/* ── NEGATÍV ASSZERT ─────────────────────────────────────────────────────── */
console.log('\n── NEGATÍV ASSZERT (a régi világ és a mutánsok BUKJANAK) ──')

const negativHibak = []

/**
 * A RÉGI VILÁG a MAI forrásból, string-átalakítással.
 *
 * ⛔ SZÁNDÉKOSAN NEM `git show HEAD:…`: a projektben már elsült, hogy commitkor
 * a HEAD maga lett a javított fájl (az őrszem saját magára írt hibát), a
 * rögzített commit pedig sekély CI-klónban (fetch-depth 1) el sem érhető.
 *
 * A hat csere együtt pontosan a `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN`
 * szemantikát állítja vissza:
 *   · az írás bármelyik meglévő kulccsal megy (akár a 6 jegyű PIN-nel),
 *   · a visszafejtés EGYETLEN kulcsot ismer,
 *   · a figyelmeztetés csak akkor szólal meg, ha MINDKETTŐ hiányzik (halott kód).
 */
const REGI_VILAG_CSEREK = [
  [
    '  const irhato = eros.length > 0\n',
    '  const irhato = eros.length > 0 || pin.length > 0\n',
  ],
  [
    '  const irasKulcs = irhato ? eros : null\n',
    '  const irasKulcs = eros.length > 0 ? eros : pin.length > 0 ? pin : null\n',
  ],
  [
    '  const olvasoKulcsok = [...Array.from(new Set(jeloltek)), OROKOLT_URES_KULCS]\n',
    '  const olvasoKulcsok = [...jeloltek, OROKOLT_URES_KULCS].slice(0, 1)\n',
  ],
  [
    '  const pinFallbackAktiv = !irhato && pin.length > 0\n',
    '  const pinFallbackAktiv = false\n',
  ],
  [
    '  const nincsSemmilyenKulcs = !irhato && pin.length === 0\n',
    '  const nincsSemmilyenKulcs = eros.length === 0 && pin.length === 0\n',
  ],
  [
    '  const gyanusanRovid = irhato && eros.length < MIN_KULCS_HOSSZ\n',
    '  const gyanusanRovid = false\n',
  ],
]

function regiVilagForras(mai) {
  let s = mai
  for (const [mibol, mire] of REGI_VILAG_CSEREK) {
    if (!s.includes(mibol)) {
      throw new Error(
        `elmozdult a horgony — a régi világ nem állítható elő ebből a sorból: ${mibol.trim()}`,
      )
    }
    s = s.replace(mibol, mire)
  }
  return s
}

if (ELES.vault === null) {
  negativHibak.push('a secret-vault.ts nem olvasható — a negatív asszert nem futtatható')
} else {
  let regi = null
  try {
    regi = regiVilagForras(ELES.vault)
  } catch (e) {
    negativHibak.push(`RÉGI VILÁG: ${String(e?.message || e)}`)
  }

  if (regi !== null) {
    const r = await ellenoriz({ ...ELES, vault: regi }, 'RÉGI VILÁG (vaultKey || pin)', { halk: true })
    for (const vart of ['M2', 'M3', 'M4', 'M5']) {
      const bukik = r.mercek.has(vart)
      if (!bukik) negativHibak.push(`RÉGI VILÁG: a(z) ${vart} mérce NEM bukott el rajta — vak őr!`)
      console.log(
        `   ${bukik ? '✓' : '✗'} RÉGI VILÁG → ${vart} ${bukik ? 'elbukik (helyes)' : 'ÁTMEGY (vak őr!)'}`,
      )
    }
  }
}

/* Szintetikus mutánsok — egy-egy mérce célzott vakságára. */
const MUTANSOK = [
  {
    nev: 'M1 — elrontott szintaxis a széfben (hiányzó kapcsos zárójel)',
    merce: 'M1',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        'export function szefKulcsDontes(bemenet: SzefKulcsBemenet): SzefKulcsDontes {',
        'export function szefKulcsDontes(bemenet: SzefKulcsBemenet): SzefKulcsDontes',
      ),
  },
  {
    nev: 'M2/M3 — visszatér a `|| GOD_MODE_PIN` egysoros az env-olvasásba',
    merce: 'M3',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        '    vaultKey: process.env.VAULT_ENCRYPTION_KEY,\n',
        '    vaultKey: process.env.VAULT_ENCRYPTION_KEY || process.env.GOD_MODE_PIN,\n',
      ),
  },
  {
    nev: 'M2/a — a rövid kulcs nem kap jelzést (némán gyenge marad)',
    merce: 'M2',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        '  const gyanusanRovid = irhato && eros.length < MIN_KULCS_HOSSZ\n',
        '  const gyanusanRovid = false\n',
      ),
  },
  {
    nev: 'M2/b — TÚLSZIGORÍTÁS: a rövid kulcs MEGÁLLÍTJA az írást (működő rendszert törne)',
    merce: 'M2',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        '  const irhato = eros.length > 0\n',
        '  const irhato = eros.length >= MIN_KULCS_HOSSZ\n',
      ),
  },
  {
    nev: 'M4 — ADATVESZTÉS: eltűnik az örökölt ÜRES kulcs a sor végéről',
    merce: 'M4',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        '  const olvasoKulcsok = [...Array.from(new Set(jeloltek)), OROKOLT_URES_KULCS]\n',
        '  const olvasoKulcsok = Array.from(new Set(jeloltek))\n',
      ),
  },
  {
    nev: 'M4 — ADATVESZTÉS: a visszafejtés már csak az első kulcsot próbálja',
    merce: 'M4',
    fajl: 'vault',
    keszit: (s) =>
      s.replace(
        '  for (const kulcs of allapot.olvasoKulcsok) {',
        '  for (const kulcs of allapot.olvasoKulcsok.slice(0, 1)) {',
      ),
  },
  {
    nev: 'M5 — a figyelmeztetés újra halott kód (nincs induláskori napló)',
    merce: 'M5',
    fajl: 'vault',
    keszit: (s) => s.replace('naplozFigyelmeztetest(szefAllapot())\n', 'void szefAllapot()\n'),
  },
  {
    nev: 'M6/a — az admin jelzés mindenkinek látszik (eltűnt a master-kapu)',
    merce: 'M6',
    fajl: 'adminOldal',
    keszit: (s) =>
      s.replace(
        'const mutatFigyelmeztetest = master && szef.figyelmeztetes !== null',
        'const mutatFigyelmeztetest = szef.figyelmeztetes !== null',
      ),
  },
  {
    nev: 'M6/b — az admin oldal lekéri, de nem írja ki a figyelmeztetést',
    merce: 'M6',
    fajl: 'adminOldal',
    keszit: (s) => s.replace('{szef.figyelmeztetes}', '{null}'),
  },
]

for (const m of MUTANSOK) {
  const eredeti = ELES[m.fajl]
  if (eredeti === null) {
    negativHibak.push(`${m.nev}: a mutálandó fájl (${REL[m.fajl]}) nem olvasható`)
    console.log(`   ✗ ${m.nev} — a forrásfájl hiányzik`)
    continue
  }
  const mutalt = m.keszit(eredeti)
  if (mutalt === eredeti) {
    negativHibak.push(`${m.nev}: a mutáns NEM különbözik az eredetitől (elmozdult a horgony)`)
    console.log(`   ✗ ${m.nev} — a mutáció nem fogott`)
    continue
  }
  let r
  try {
    r = await ellenoriz({ ...ELES, [m.fajl]: mutalt }, `MUTÁNS · ${m.nev}`, { halk: true })
  } catch (e) {
    // A betöltés összeomlása is „bukás" — de csak akkor fogadjuk el, ha a
    // mércét amúgy is a szintaxisra írtuk.
    r = { mercek: new Set(['M1', 'M2', 'M3', 'M4', 'M5']), uzenetek: [String(e?.message || e)] }
  }
  const bukik = r.mercek.has(m.merce)
  if (!bukik) negativHibak.push(`${m.nev}: a(z) ${m.merce} mérce NEM bukott el rajta`)
  console.log(`   ${bukik ? '✓' : '✗'} ${m.nev} → ${m.merce} ${bukik ? 'elbukik (helyes)' : 'ÁTMEGY (vak őr!)'}`)
}

/* ── ÖSSZEGZÉS ───────────────────────────────────────────────────────────── */
try {
  fs.rmSync(TMP, { recursive: true, force: true })
} catch {
  /* takarítási hiba nem buktathatja el az őrszemet */
}

console.log('\n═══ ÖSSZEGZÉS ═══')
console.log(`ÉLES fájlok hibái: ${eles.uzenetek.length}`)
for (const u of eles.uzenetek) console.log(`  ✗ ${u}`)
console.log(`Negatív asszert hibái: ${negativHibak.length}`)
for (const h of negativHibak) console.log(`  ✗ ${h}`)

if (eles.uzenetek.length === 0 && negativHibak.length === 0) {
  console.log('\n✅ PASS — mind a hat mérce teljesül, és a régi világ elbukik rajtuk.')
  process.exit(0)
}
console.log('\n❌ FAIL')
process.exit(1)
