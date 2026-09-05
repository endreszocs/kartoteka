#!/usr/bin/env node
/**
 * JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés (2026-09-04, P1).
 *
 * Mit véd:
 *   - `apps/web/app/(auth)/forgot-password/actions.ts`  → setNewPassword
 *   - `apps/web/app/(dashboard)/profile/actions.ts`     → updatePassword
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-03-i védelmi felülvizsgálat megállapítása: a jelszóváltás után
 * SEMMILYEN munkamenet-visszavonás nem történt — az egész repóban nem volt
 * egyetlen `scope: 'global'` vagy `scope: 'others'` kiléptetés sem. Aki azért
 * állított vissza jelszót, mert attól tartott, hogy valaki hozzáfért a
 * fiókjához, pontosan azt nem érte el, amiért csinálta.
 *
 * A 2026-09-04-i mérés ezt súlyosbította: a munkameneteknek NINCS abszolút
 * lejáratuk (`auth.sessions.not_after` mind NULL), és a legrégebbi élő
 * munkamenet 122 napos volt. Ami nem lesz kifejezetten visszavonva, az
 * gyakorlatilag örökké él.
 *
 * MIÉRT ESIK KI KÖNNYEN: a `signOut({ scope: 'others' })` hívás a jelszó
 * beállítása UTÁN áll, tehát „a munka már kész" — egy refaktorban kézenfekvő
 * fölöslegesnek nézni és kihagyni. A hiánya pedig NÉMA: a jelszó attól még
 * megváltozik, a felület sikert jelez, és semmi nem hibázik.
 *
 * Az asszertek MUTÁNS-ELLENŐRZÉSSEL futnak: eljátsszuk a régi, hibás alakot a
 * MAI forrásból, és bizonyítjuk, hogy az őrszem bukna rá.
 *
 * Futtatás:  node scripts/selftest-jelszo-munkamenet.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const FORRASOK = [
  {
    cimke: 'jelszó-visszaállítás (setNewPassword)',
    ut: path.join(REPO_ROOT, 'apps', 'web', 'app', '(auth)', 'forgot-password', 'actions.ts'),
  },
  {
    cimke: 'jelszó-változtatás a profilban (updatePassword)',
    ut: path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'profile', 'actions.ts'),
  },
]

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * Kommentek eltávolítása.
 *
 * MIÉRT KELL: a javítás dokumentációja szó szerint idézi a hiányzó hívást
 * (`scope: 'others'`), és egy naiv regex a KOMMENTRE is ráillene — az őrszem
 * így akkor is átengedne, amikor a tényleges kód már nem tartalmazza.
 * Ez a projekt rögzített hibaosztálya (lásd selftest-hatokor.mjs SZ4b).
 */
function kommentNelkul(forras) {
  return forras
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((sor) => !/^\s*\/\//.test(sor))
    .join('\n')
}

// A tényleges hívás, kommentek nélkül.
const VISSZAVONAS_RE = /supabase\.auth\.signOut\(\s*\{\s*scope:\s*'others'\s*\}\s*\)/

for (const { cimke, ut } of FORRASOK) {
  if (!fs.existsSync(ut)) {
    fail(`${cimke}: a forrásfájl nem található (${path.relative(REPO_ROOT, ut)})`)
    continue
  }

  const forras = kommentNelkul(fs.readFileSync(ut, 'utf8'))

  // ── 1. Megtörténik-e egyáltalán a visszavonás? ───────────────────────────
  if (VISSZAVONAS_RE.test(forras)) {
    ok(`${cimke}: a jelszóváltás visszavonja a többi munkamenetet`)
  } else {
    fail(
      `${cimke}: HIÁNYZIK a signOut({ scope: 'others' }) hívás. ` +
        'A jelszóváltás így nem szüntetné meg a betolakodó munkamenetét — ' +
        'pedig a felhasználó pont ezért változtat jelszót.',
    )
    continue
  }

  // ── 2. A jelszó BEÁLLÍTÁSA UTÁN áll-e? ───────────────────────────────────
  // Ha elé kerülne, a visszavonás a SAJÁT, még érvényes munkamenetet érintené,
  // az `updateUser` pedig hitelesítés nélkül maradna.
  const updateIdx = forras.indexOf('updateUser({ password')
  const signOutIdx = forras.search(VISSZAVONAS_RE)
  if (updateIdx !== -1 && signOutIdx > updateIdx) {
    ok(`${cimke}: a visszavonás a jelszó beállítása UTÁN fut`)
  } else {
    fail(
      `${cimke}: a visszavonás nem a jelszó beállítása után áll. ` +
        'Előtte futtatva a saját munkamenetet vonná vissza, és az updateUser hitelesítés nélkül maradna.',
    )
  }

  // ── 3. NEM 'global' — az a saját munkamenetet is megölné ─────────────────
  if (/signOut\(\s*\{\s*scope:\s*'global'\s*\}\s*\)/.test(forras)) {
    fail(
      `${cimke}: 'global' hatókörű kiléptetés a jelszóváltás ágán. ` +
        'Ez a MOSTANI munkamenetet is megölné, a felhasználó a siker-üzenetet sem látná. ' +
        "A helyes hatókör: 'others'.",
    )
  } else {
    ok(`${cimke}: nem 'global' — a mostani munkamenet megmarad`)
  }

  // ── 4. A visszavonás hibája nem NÉMA ─────────────────────────────────────
  // A jelszó ekkor MÁR megváltozott, visszagörgetni nem lehet — de elhallgatni
  // sem szabad: pont a biztonsági hatás maradt el.
  const hibaKezeles =
    /kileptetesHiba/.test(forras) &&
    /console\.error\(/.test(forras.slice(signOutIdx, signOutIdx + 900))
  if (hibaKezeles) {
    ok(`${cimke}: a visszavonás hibája naplózódik, nem néma`)
  } else {
    fail(
      `${cimke}: a visszavonás hibája nincs kezelve. ` +
        'Néma kiesés esetén a felhasználó azt hinné, biztonságban van.',
    )
  }

  // ── 5. MUTÁNS-ELLENŐRZÉS ─────────────────────────────────────────────────
  const mutans = forras.replace(VISSZAVONAS_RE, 'undefined')
  if (VISSZAVONAS_RE.test(mutans)) {
    fail(`${cimke}: MUTÁNS TÚLÉLTE — az asszert nem a tényleges hívást méri.`)
  } else {
    ok(`${cimke}: mutáns-ellenőrzés — a hívás eltávolítása megbuktatja az asszertet`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6. A FELÜLET SZÓL-E RÓLA
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT ŐRIZZÜK EZT IS: a mellékhatás valódi és váratlan — a lelkész desktopja
// és telefonja jelszóváltás után újra belépést kér. Ha ezt nem mondjuk meg,
// a felhasználó azt hiszi, elromlott valami, és felhív. A biztonsági javítás
// akkor jó, ha nem termel támogatási hívást.
const UI = path.join(REPO_ROOT, 'apps', 'web', 'components', 'modals', 'settings-dialog.tsx')
if (fs.existsSync(UI)) {
  const ui = kommentNelkul(fs.readFileSync(UI, 'utf8'))
  if (/többi eszközön/i.test(ui)) {
    ok('a felület elmondja, hogy a többi eszközön kiléptetjük a felhasználót')
  } else {
    fail(
      'a jelszó-változtató felület nem szól arról, hogy a többi eszközön megszűnik a bejelentkezés. ' +
        'A váratlan újra-belépés támogatási hívást termel.',
    )
  }
  if (/res\.warning/.test(ui)) {
    ok('a felület megjeleníti a visszavonás-figyelmeztetést, ha volt')
  } else {
    fail('a felület elnyeli a warning mezőt — a felhasználó nem tudná meg, ha a visszavonás elmaradt.')
  }
}

console.log('')
if (failed) {
  console.error('❌ JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('✅ JELSZÓVÁLTÁS → MUNKAMENET-VISSZAVONÁS önellenőrzés: minden asszert rendben')
