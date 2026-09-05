// selftest-profil-pontossag.mjs — a profil-kör (2026-09-05, Endre 4. pontja) őrszemei
//
// ⛔ MI A KOCKÁZAT
//   A profil-dialógus három forrásból mutatott más-más igazságot, szó közepén
//   törte az egyházmegye nevét (`break-all`), sötét módban fedetlen
//   opacitás-osztályokat használt, a DATE-mezőket TZ-érzékenyen formázta, és a
//   Szerkesztés fül a legacy tömböt írta a strukturált tábla helyett. Mindegyik
//   javítás NÉMÁN visszaejthető egy későbbi refaktorral — ezért forrás-őrök
//   mutánssal, és egység-tesztek a segédekre.
//
// ŐRSZEMEK
//   T1–T7  date.ts: formatDateOnlyHu / formatTimestampHu TZ-biztos (gyerek-
//          folyamat, TZ=America/Los_Angeles) + a régi `new Date(iso)`-alapú
//          formatHuDate ugyanott az ELŐZŐ napot adja (a hibaosztály bizonyítéka)
//   S1–S4  PROFILE_STATUS_LABELS 4 kulcs + ismeretlen kulcs nyersen, jelölve
//   R1–R6  getRoleLabel: kanonikus, legacy, custom, ismeretlen, üres
//   A1–A7  resolveAvatarUrl 4 forrás-esete + örökölt sorrend + protokoll-szűrő
//   N1–N3  getInitials / extractFirstName előtag-szűréssel
//   G1     StatCard `break-words`, NINCS `break-all` (+ mutáns)
//   G2     nincs hardkódolt bg-white / text-slate / bg-slate / fedetlen opacitás a dialógusban (+ mutáns)
//   G3     a hero-jelvény az AKTÍV szerepből jön, nem a display_title-ből (+ mutáns)
//   G4     getProfileDialogData az access-kontextusból + gyülekezet-lánc select (+ mutáns)
//   G5     saveProfileDetails a pastor_service_history-t írja, a legacy tömböt NEM (+ mutáns)
//   G6     őszinte napló-feliratok (+ mutáns)
//   G7     EGY címke-térkép (+ mutáns)
//   G8     monogram egy helyről
//   G9     revision-kapu + audit a mentésben (+ mutáns)
//   G10    nincs toLocaleDateString a dialógusban, a közös formázók importálva
//   G11    a feltöltés szerver-akció, fix objektumnév, MIME + méret-kapu
//   G12    SQL-őr: nincs CREATE TABLE / TEMP TABLE / RAISE %%, van UNION ALL rács (+ mutáns)
//   G13    a dashboard layout a közös resolveAvatarUrl-t használja
//
//   2026-09-05 bíráló P2-k (a hibaosztály: „sorrend-függő összevetés", „néma lánc-hiba", „dobott akció-hiba"):
//   SH1–SH7 shValtozottE: sorrendtartó, trim-tűrő; a RÉGI minta (DESC-re rendezett kliens vs
//          rendezetlen DB) azonos tartalomra „változott"-at mondott — bizonyítva
//   G14    EGY kanonikus rendezett lekérés a betöltésnek ÉS a mentésnek; nincs ev_tol-átrendezés (+ mutáns)
//   G15    a lánc-segédek hibát adnak vissza, nem néma null-t; lancHiba a válaszban + a felületen (+ mutáns)
//   G16    getPastorProfileCompat nem dob (readError); a betöltés/mentés fail-closed; a dialógus
//          MINDEN szerver-akció hívását try/catch-ben tartja (+ mutáns)
//
//   2026-09-05 P3-UTÓMUNKA (a bírálat nem blokkoló találatai):
//   P1     a forrás-váltás (Google / feltöltött / monogram) CSAK a döntést írja — nem töröl fájlt,
//          a photo_url érintetlen; vissza lehet váltani (+ mutáns)
//   P2     a Storage remove() visszaadott listája ELLENŐRZÖTT (RLS-néma no-op ≠ siker); a törlésnél a
//          hivatkozott fájl toröletlensége HIBA; egység-tesztek toroletlenUtak / profilkepObjektumUt (+ mutáns)
//   P3     „örökölt szerep" = approved_by NULL ÉS approved_at ≈ created_at (±5 mp), nem napra-egyezés;
//          a régi napra-egyezés az aznapi admin-jóváhagyásra is igazat adott — bizonyítva (+ mutáns)
//   P4     a Kapcsolatok-döntés EGY feloldóból (lelkesziSzerepbenE) mind a 4 helyen (+ mutáns)
//   P5     a fülek érintőfelülete min-h-11 (44 px) (+ mutáns)
//   P6     nincs megjelenített tartalomból képzett React-kulcs (+ mutáns)
//   P7     ProfileStatus a 4 élő DB-értékkel; PROFILE_STATUS_LABELS kimerítő (Record<ProfileStatus,…>) (+ mutáns)
//   P8     a végleges törlés kétlépéses megerősítő dialógusból; nincs window.confirm (+ mutáns)
//   P9     (ellenőrzés-ügynök) a Felhasználók-oldal státusz-látványa Record<ProfileStatus,…>, a CÍMKE a
//          PROFILE_STATUS_LABELS-ből (eddig két forrás: „Törölve" ⇄ „Törölt"); futtatva (+ mutáns)
//   P3c    a napra-egyezésnek (ugyanazABukarestiNap) NINCS app-oldali hívója — az örökölt-szerep döntése
//          kizárólag az orokoltSzerepE (+ mutáns); a date.ts docblock-SZÖVEGÉT nem asszertáljuk (más terület)
//
//   2026-09-05 BÍRÁLAT UTÁNI JAVÍTÁSOK (profil-p3 javító):
//   P2b/P2f a törlésnél a HIVATKOZOTT fájlt a list() nélkül is kérjük (a list() is RLS-néma); a folyamat a
//          tiszta függvényekkel szimulálva: üres list() + üres remove() → HIBA, a RÉGI folyamat „törölve" (+ mutáns)
//   P4c    a kapcsolatokElerheto a szerveren UGYANAZZAL a bemenettel (access), mint a másik három hely (+ mutáns);
//          missingPrimaryRole → fail-closed false (+ forrás-mutáns)
//   P10    a forrás-váltó az EFFEKTÍV forrásból jelöl; a gombsor örökölt metaadat-képnél is látszik; a törlés-toast
//          csak igazolt tárhely-törlésnél „végleges" (+ mutánsok)
//   P11    effektivAvatarSource EGY szabály a képnek és a gomboknak, a szerver adja (+ mutánsok)
//
// Futtatás:  node scripts/selftest-profil-pontossag.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const F = {
  date: path.join(ROOT, 'apps/web/lib/utils/date.ts'),
  konst: path.join(ROOT, 'apps/web/lib/constants/dashboard.ts'),
  labels: path.join(ROOT, 'apps/web/lib/profile-roles/labels.ts'),
  types: path.join(ROOT, 'apps/web/lib/profile-roles/types.ts'),
  avatar: path.join(ROOT, 'apps/web/lib/auth/profile-avatar-shared.ts'),
  name: path.join(ROOT, 'apps/web/lib/utils/name.ts'),
  dialog: path.join(ROOT, 'apps/web/components/modals/profile-dialog.tsx'),
  actions: path.join(ROOT, 'apps/web/app/(dashboard)/profile/actions.ts'),
  header: path.join(ROOT, 'apps/web/components/layout/header-refined-v3.tsx'),
  page: path.join(ROOT, 'apps/web/app/(dashboard)/profile/page.tsx'),
  layout: path.join(ROOT, 'apps/web/app/(dashboard)/layout.tsx'),
  sql: path.join(ROOT, 'migration-docs/sql/2026-09-05-profil-pontossag.sql'),
  shared: path.join(ROOT, 'apps/web/app/(dashboard)/profile/profile-dialog-shared.ts'),
  // P3-utómunka (2026-09-05)
  authTypes: path.join(ROOT, 'apps/web/lib/types/auth.ts'),
  orokolt: path.join(ROOT, 'apps/web/lib/profile-roles/orokolt-szerep.ts'),
  aktivSzerep: path.join(ROOT, 'apps/web/lib/profile-roles/aktiv-szerep.ts'),
  kapcsPage: path.join(ROOT, 'apps/web/app/(dashboard)/profile/kapcsolatok/page.tsx'),
  kapcsActions: path.join(ROOT, 'apps/web/app/(dashboard)/profile/kapcsolatok/actions.ts'),
}
for (const [k, f] of Object.entries(F)) {
  if (!fs.existsSync(f)) {
    console.error(`FAIL: hiányzó fájl (${k}): ${path.relative(ROOT, f)}`)
    process.exit(1)
  }
}

// ── Modul-betöltő: TS → CJS egy ideiglenes mappába, az alias-importok átírva ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-profil-'))
function ir(nev, forras, cserek = []) {
  let js = t(forras)
  for (const [alias, cel] of cserek) {
    js = js.replace(new RegExp(`require\\(["']${alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']\\)`, 'g'), `require(${JSON.stringify(cel)})`)
  }
  const p = path.join(TMP, nev)
  fs.writeFileSync(p, js)
  return p
}
const konstP = ir('dashboard-const.cjs', olvas(F.konst))
const dateP = ir('date.cjs', olvas(F.date), [['@/lib/constants/dashboard', konstP]])
const typesP = ir('types.cjs', olvas(F.types))
// A labels.ts a ProfileStatus típus-guardot (isProfileStatus) a lib/types/auth-ból hozza (P7).
const authTypesP = ir('auth-types.cjs', olvas(F.authTypes))
const labelsP = ir('labels.cjs', olvas(F.labels), [
  ['@/lib/profile-roles/types', typesP],
  ['@/lib/types/auth', authTypesP],
])
const avatarP = ir('avatar.cjs', olvas(F.avatar))
const nameP = ir('name.cjs', olvas(F.name))

// ── T: dátum-formázók — GYEREK-FOLYAMATBAN, nyugati zónában ──────────────────
// A `process.env.TZ` futásidejű átállítása platformonként eltérően viselkedik;
// a külön Node-folyamat env-je BIZTOSAN érvényes az első Date-hívás előtt.
{
  const script = `
    const d = require(${JSON.stringify(dateP)});
    // A RÉGI napra-egyezés a MAI forrásból újraépítve (formatTimestampHu-egyezés): a hibaosztály
    // bizonyítéka nem függ attól, hogy a date.ts (más terület tulajdona) őrzi-e még a régi segédet.
    const regiNapraEgyezes = (a, b) => { const na = d.formatTimestampHu(a); return Boolean(na) && na === d.formatTimestampHu(b) };
    const out = {
      a: d.formatDateOnlyHu('2019-09-01'),
      b: d.formatDateOnlyHu('1975-03-02'),
      c: d.formatDateOnlyHu('2026-12-31T00:00:00+02:00'),
      d: d.formatDateOnlyHu('abc'),
      e: d.formatDateOnlyHu(null),
      f: d.formatTimestampHu('2026-08-14T21:30:00Z'),
      g: d.formatTimestampHu('2026-01-14T22:30:00Z', { time: true }),
      h: d.formatTimestampHu('nem-datum'),
      regi: d.formatHuDate('2019-09-01'),
      napEgyezik: regiNapraEgyezes('2026-04-25T21:30:00Z', '2026-04-26T05:00:00Z'),
      napKulon: regiNapraEgyezes('2026-04-25T20:30:00Z', '2026-04-26T05:00:00Z'),
      tzNap: new Date('2019-09-01').getDate(),
    };
    process.stdout.write(JSON.stringify(out));
  `
  const raw = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: 'America/Los_Angeles' },
    encoding: 'utf8',
  })
  const r = JSON.parse(raw)
  assert(r.tzNap === 31, `T0: a gyerek-folyamat valóban nyugati zónában fut (new Date('2019-09-01').getDate() = ${r.tzNap}, 31 kell)`)
  assert(r.a === '2019. szeptember 1.', `T1: formatDateOnlyHu('2019-09-01') = '${r.a}' (TZ=America/Los_Angeles alatt is szeptember 1.)`)
  assert(r.b === '1975. március 2.', `T2: formatDateOnlyHu('1975-03-02') = '${r.b}'`)
  assert(r.c === '2026. december 31.', `T3: formatDateOnlyHu időbélyeg-előtagból csak a napot veszi = '${r.c}'`)
  assert(r.d === '' && r.e === '', `T4: érvénytelen / üres bemenet → üres sztring ('${r.d}', '${r.e}')`)
  assert(r.f === '2026. augusztus 15.', `T5: formatTimestampHu('2026-08-14T21:30Z') Bukarest (UTC+3) szerint = '${r.f}'`)
  assert(r.g === '2026. január 15. 00:30', `T6: formatTimestampHu téli (UTC+2) idővel = '${r.g}'`)
  assert(r.h === '', `T6b: érvénytelen időbélyeg → üres ('${r.h}')`)
  // A HIBAOSZTÁLY bizonyítéka: a régi, Date-alapú formázó ugyanitt az ELŐZŐ napot adja.
  assert(r.regi.includes('31'), `T7n: a régi formatHuDate('2019-09-01') nyugati zónában '${r.regi}' — augusztus 31-et ír (ezért kellett a string-split)`)
  assert(r.napEgyezik === true && r.napKulon === false, `T8: a régi napra-egyezés (formatTimestampHu-egyezés) a bukaresti naptári napot nézi (${r.napEgyezik}/${r.napKulon})`)
}

// ── S: státusz-címkék ─────────────────────────────────────────────────────────
{
  const L = require_(labelsP)
  const kulcsok = Object.keys(L.PROFILE_STATUS_LABELS).sort()
  assert(JSON.stringify(kulcsok) === JSON.stringify(['active', 'deleted', 'pending', 'rejected']), `S1: PROFILE_STATUS_LABELS 4 kulcsa: ${kulcsok.join(',')}`)
  assert(L.PROFILE_STATUS_LABELS.rejected === 'Elutasítva' && L.PROFILE_STATUS_LABELS.deleted === 'Törölt', 'S2: rejected/deleted címkéje magyar, nem „Várakozik"')
  const ism = L.getProfileStatusLabel('archivalt')
  assert(ism.label === 'archivalt' && ism.ismeretlen === true, 'S3: ismeretlen státusz → a NYERS kulcs + ismeretlen=true (nem hamis „Várakozik")')
  const ures = L.getProfileStatusLabel(null)
  assert(ures.ismeretlen === true, 'S4: üres státusz → ismeretlen=true')

  // ── R: szerep-címkék
  assert(L.getRoleLabel('admin') === 'Rendszergazda', 'R1: admin → Rendszergazda (nem „Kerületi admin")')
  assert(L.getRoleLabel('master_admin') === 'Főadmin', 'R2: legacy master_admin → Főadmin')
  assert(L.getRoleLabel('custom', 'Ifjúsági referens') === 'Ifjúsági referens', 'R3: custom + egyedi felirat → az egyedi felirat')
  assert(L.getRoleLabel('egyhazmegyei_szamvevo') === 'Egyházmegyei számvevő', 'R4: egyhazmegyei_szamvevo → Egyházmegyei számvevő')
  assert(L.getRoleLabel('valami_uj_kulcs') === 'valami uj kulcs', 'R5: ismeretlen kulcs → nyersen (olvashatóan), nem hamis címke')
  assert(L.getRoleLabel(null) === 'Nincs hozzárendelt szerepkör', 'R6: üres szerep → „Nincs hozzárendelt szerepkör"')
  assert(L.getProfileEyebrow('konyvelo') === 'Könyvelői profil' && L.getProfileEyebrow('lelkesz') === 'Lelkipásztori profil', 'R7: a szemöldök a szerep szerint (könyvelőnél nem „Lelkipásztori profil")')
}

// ── A: avatar-feloldás ───────────────────────────────────────────────────────
{
  const { resolveAvatarUrl } = require_(avatarP)
  const F_ = { photoUrl: 'https://x.test/feltoltott.jpg', metadataAvatarUrl: 'https://x.test/meta.jpg', picture: 'https://lh3.test/google.jpg' }
  assert(resolveAvatarUrl({ source: 'upload', ...F_ }) === F_.photoUrl, 'A1: upload → a feltöltött kép (a Google-kép ellenére)')
  assert(resolveAvatarUrl({ source: 'google', ...F_ }) === F_.picture, 'A2: google → a Google-fiók képe')
  assert(resolveAvatarUrl({ source: 'none', ...F_ }) === null, 'A3: none → NINCS kép, akkor sem, ha mindhárom forrás létezik')
  assert(resolveAvatarUrl({ source: null, ...F_ }) === F_.photoUrl, 'A4: örökölt (NULL) → az explicit feltöltés győz (a régi sorrend MEGFORDÍTVA)')
  assert(resolveAvatarUrl({ source: null, ...F_, photoUrl: null }) === F_.metadataAvatarUrl, 'A5: örökölt, feltöltés nélkül → metaadat')
  assert(resolveAvatarUrl({ source: null, photoUrl: null, metadataAvatarUrl: null, picture: F_.picture }) === F_.picture, 'A6: örökölt, csak Google-kép → a Google-kép')
  assert(resolveAvatarUrl({ source: 'upload', ...F_, photoUrl: 'javascript:alert(1)' }) === null, 'A7: nem http(s) protokoll → null (nem esik vissza a Google-képre)')
}

// ── N: név-segédek ──────────────────────────────────────────────────────────
{
  const N = require_(nameP)
  assert(N.getInitials('Nt. Kovács János') === 'KJ', `N1: getInitials('Nt. Kovács János') = '${N.getInitials('Nt. Kovács János')}' (az előtag nem monogram)`)
  assert(N.getInitials('Szőcs Endre') === 'SE' && N.getInitials('') === '?', 'N2: első + utolsó szó; üres névnél „?"')
  assert(N.extractFirstName('Nt. Dr. Kovács János') === 'János' && N.extractFirstName(null) === null, 'N3: extractFirstName az előtagokat szűri, üresnél null')
}

// ── Forrás-őrök ─────────────────────────────────────────────────────────────
const dialog = olvas(F.dialog)
const actions = olvas(F.actions)
const header = olvas(F.header)
const page = olvas(F.page)
const layout = olvas(F.layout)
const labelsSrc = olvas(F.labels)
const sql = olvas(F.sql)

function szakasz(forras, kezdet, hossz = 2000) {
  const i = forras.indexOf(kezdet)
  return i >= 0 ? forras.slice(i, i + hossz) : ''
}

// G1 — StatCard: break-words, NINCS break-all
{
  const sc = szakasz(dialog, 'function StatCard', 900)
  const kod = kodCsak(sc)
  const or = (k) => /break-words/.test(k) && !/break-all/.test(k)
  assert(sc.length > 0 && or(kod), 'G1: a StatCard `break-words`-öt használ és nincs benne `break-all`')
  // A mutáns a KÓDRA megy (a kommentekből kiszűrve), különben az első találat egy komment lenne.
  const mutans = kod.replace(/break-words/g, 'break-all')
  assert(mutans !== kod && !or(mutans), 'G1n: a `break-all` visszaírásával az őr BUKIK (nem vak)')
  assert(/\[overflow-wrap:anywhere\]/.test(kod), 'G1b: az `overflow-wrap:anywhere` opcionális (csak az e-mail kéri)')
  assert(/wrap="anywhere"/.test(kodCsak(dialog)) && (kodCsak(dialog).match(/wrap="anywhere"/g) || []).length <= 2, 'G1c: az anywhere-tördelés CSAK az e-mail helyein (StatCard + ProfileRow)')
}

// G2 — nincs hardkódolt szín / fedetlen opacitás a dialógusban
{
  const kod = kodCsak(dialog)
  const tiltott = /\bbg-white\b|\bbg-white\/|\btext-slate-|\bbg-slate-|\bborder-slate-|\bbg-amber-50\/\d|\btext-teal-700|\bbreak-all\b/
  assert(!tiltott.test(kod), 'G2: a dialógusban nincs bg-white / text-slate / bg-slate / border-slate / fedetlen opacitás-osztály')
  const mutans = kod.replace('bg-card p-4', 'bg-white/86 p-4')
  assert(mutans !== kod && tiltott.test(mutans), 'G2n: a `bg-white/86` visszaírásával az őr BUKIK')
  // a színes chipek MIND kapnak dark: párt
  const chipek = kod.match(/(?:bg|text|border)-(?:rose|indigo|violet|emerald|amber)-\d+/g) || []
  const darkok = kod.match(/dark:(?:bg|text|border)-(?:rose|indigo|violet|emerald|amber)-\d+(?:\/\d+)?/g) || []
  assert(chipek.length > 0 && darkok.length >= chipek.length / 2, `G2b: a színes chipekhez van dark: pár (${chipek.length} világos, ${darkok.length} sötét)`)
}

// G3 — a hero-jelvény az aktív szerepből jön
{
  const kod = kodCsak(dialog)
  assert(!/displayTitle\s*\|\|\s*(primaryRoleLabel|aktivRoleLabel|getRoleLabel)/.test(kod) && /aktivRoleLabel/.test(kod) && /data\??\.aktiv/.test(kod), 'G3: a jelvény = aktív szerep; a display_title nem előzi meg')
  const mutans = kod.replace('<span className="min-w-0 break-words">{aktivRoleLabel}</span>', '<span className="min-w-0 break-words">{data.pastorProfile.displayTitle || aktivRoleLabel}</span>')
  assert(mutans !== kod && /displayTitle\s*\|\|\s*aktivRoleLabel/.test(mutans), 'G3n: a display_title visszaírásával az őr BUKIK')
}

// G4 — getProfileDialogData az access-kontextusból + gyülekezet-lánc
{
  const sc = szakasz(actions, 'export async function getProfileDialogData', 3000)
  const lanc = szakasz(actions, 'async function loadGyulekezetLanc', 1200)
  assert(/getEffectiveAccessContext\(/.test(kodCsak(sc)), 'G4: getProfileDialogData a getEffectiveAccessContext()-ből indul')
  assert(/dioceses:diocese_id\(id, name, district_id, districts:district_id\(id, name\)\)/.test(kodCsak(lanc)), 'G4b: az egyházmegye/kerület a GYÜLEKEZET LÁNCÁBÓL (egy relációs select)')
  const mutans = kodCsak(lanc.replace(/dioceses:diocese_id\([^)]*\([^)]*\)\)/, ''))
  assert(!/dioceses:diocese_id\(/.test(mutans), 'G4n: a lánc-select kivételével az őr BUKIK')
  assert(!/from\('dioceses'\)\.select\('name'\)\.eq\('id', dioceseId\)/.test(kodCsak(actions)), 'G4c: a régi skalár-alapú dioceses-lekérés nem tért vissza elsődleges forrásként')
}

// G5 — saveProfileDetails a strukturált táblát írja, a legacy tömböt nem
{
  const sc = szakasz(actions, 'export async function saveProfileDetails', 9000)
  const kod = kodCsak(sc)
  assert(/from\('pastor_service_history'\)[\s\S]*?\.insert\(/.test(kod) && !/previous_service_places:/.test(kod), 'G5: a mentés a pastor_service_history-ba szúr, previous_service_places-t NEM ír')
  const mutans = kod.replace('previous_roles: data.previousRoles', 'previous_service_places: data.previousRoles, previous_roles: data.previousRoles')
  assert(mutans !== kod && /previous_service_places:/.test(mutans), 'G5n: a legacy írás visszaírásával az őr BUKIK')
  assert(/\.insert\(rows\)[\s\S]*?\.delete\(\)/.test(kod), 'G5b: sorrend: ELŐBB insert, csak utána delete (hiba esetén nem vész el adat)')
}

// G6 — őszinte napló-feliratok
{
  const kod = kodCsak(dialog)
  assert(!/Nyilvántartásba véve: /.test(kod) && !/\(nincs korábbi\)/.test(kod) && /Első hozzárendelés/.test(kod) && /napló indulása/.test(kod), 'G6: „A napló indulása" + „Első hozzárendelés"; nincs „Nyilvántartásba véve" / „(nincs korábbi)"')
  const mutans = kod.replace('A napló indulása: ', 'Nyilvántartásba véve: ')
  assert(mutans !== kod && /Nyilvántartásba véve: /.test(mutans), 'G6n: a régi felirat visszaírásával az őr BUKIK')
  assert(/Szolgálat kezdete/.test(kod) && /serviceStartedAt/.test(kod), 'G6b: külön „Szolgálat kezdete" sor a kézi dátumból')
}

// G7 — EGY címke-térkép
{
  assert(!/PROFILE_ROLE_LABELS/.test(kodCsak(dialog)) && !/function roleLabel\(/.test(kodCsak(page)) && !/LEGACY_ROLE_LABELS/.test(kodCsak(header)), 'G7: a dialógus/oldal/fejléc saját címke-térképe megszűnt')
  assert(/LEGACY_ROLE_LABELS/.test(kodCsak(labelsSrc)) && /from '@\/lib\/profile-roles\/labels'/.test(dialog) && /from '@\/lib\/profile-roles\/labels'/.test(header) && /from '@\/lib\/profile-roles\/labels'/.test(page), 'G7b: mindhárom felület a labels.ts-ből címkéz, a legacy kulcsok ott élnek')
  const mutans = kodCsak(labelsSrc.replace(/export const LEGACY_ROLE_LABELS[\s\S]*?\n\}\n/, ''))
  assert(!/LEGACY_ROLE_LABELS/.test(mutans.replace(/LEGACY_ROLE_LABELS\[role\]/, '')), 'G7n: a labels.ts-ből törölt LEGACY_ROLE_LABELS-szel az őr BUKIK')
}

// G8 — monogram egy helyről
{
  const regi = /\.map\(\s*\(?(?:part|name)\)?\s*=>\s*(?:part|name)\[0\]\s*\)/
  assert(!regi.test(kodCsak(dialog)) && !regi.test(kodCsak(header)) && /getInitials/.test(dialog) && /getInitials/.test(header), 'G8: a dialógus és a fejléc a közös getInitials-t használja')
}

// G9 — revision-kapu + audit
{
  const sc = szakasz(actions, 'export async function saveProfileDetails', 9000)
  const kod = kodCsak(sc)
  assert(/\.eq\('revision'/.test(kod) && /logAuditEvent\(/.test(kod) && /'profile\.update'/.test(kod) && /közben módosult/.test(kod), 'G9: revision-kapu + „közben módosult" + audit \'profile.update\' a mentésben')
  const mutans = kod.replace(/q = q\.eq\('revision', revision\)/, '')
  assert(mutans !== kod && !/\.eq\('revision'/.test(mutans), 'G9n: a revision-kapu törlésével az őr BUKIK')
  assert(/metadata: \{ changed \}/.test(kod), 'G9b: az audit a változott mezők NEVEIT rögzíti (értékek nélkül)')
}

// G10 — dátumformázás
{
  const kod = kodCsak(dialog)
  assert(!/toLocaleDateString/.test(kod) && /formatDateOnlyHu/.test(dialog) && /formatTimestampHu/.test(dialog), 'G10: nincs toLocaleDateString; a közös formázók importálva')
  assert(/formatDateOnlyHu\(data\.birthDate\)/.test(kod) && /formatDateOnlyHu\(data\.pastorProfile\.serviceStartedAt\)/.test(kod), 'G10b: a DATE-mezők a string-split formázóval (TZ-biztos)')
}

// G11 — feltöltés szerver-akcióval
{
  const kod = kodCsak(dialog)
  assert(!/storage\.from\('logos'\)\.upload\(/.test(kod) && !/@\/lib\/supabase\/client/.test(dialog) && /uploadProfilePhoto/.test(dialog) && /removeProfilePhoto/.test(dialog) && /applyGooglePhoto/.test(dialog), 'G11: a dialógus nem tölt fel kliens-oldalról; upload/remove/google szerver-akciók')
  const up = kodCsak(szakasz(actions, 'export async function uploadProfilePhoto', 2500))
  assert(/avatar\.\$\{ext\}/.test(up) && /PROFILE_PHOTO_MIME\[file\.type\]/.test(up) && /PROFILE_PHOTO_MAX_BYTES/.test(up), 'G11b: fix objektumnév (avatar.{ext}) + MIME-lista + méret-kapu az akcióban')
  assert(/avatar_source: source/.test(kodCsak(actions)) && /'none'/.test(kodCsak(actions)), 'G11c: az eltávolítás avatar_source=none döntést ír (nem csak metaadat-null)')
}

// G12 — SQL-őr
{
  const kod = sql.replace(/^\s*--.*$/gm, '')
  assert(!/CREATE\s+TABLE/i.test(kod), 'G12: a profil-SQL nem hoz létre táblát (nem kell backup_table_policy)')
  assert(!/TEMP(?:ORARY)?\s+TABLE/i.test(kod), 'G12b: nincs TEMP TABLE (Supabase SQL editor session-csapda)')
  assert(!/RAISE[^;]*%%/.test(kod), 'G12c: nincs `%%` a RAISE-ben (42601)')
  assert((kod.match(/UNION ALL/g) || []).length >= 8 && /ORDER BY sorrend/.test(kod), 'G12d: a verifikáció EGY UNION ALL rács')
  assert(/c\.conkey = ARRAY\[v_attnum\]::int2\[\]/.test(kod) && /pastor_profiles_avatar_source_check/.test(kod), 'G12e: a CHECK conkey szerint célozva, névvel')
  assert(/NOT EXISTS \(\s*SELECT 1 FROM public\.pastor_service_history sh WHERE sh\.user_id = pp\.user_id\s*\)/.test(kod), 'G12f: az átemelés csak strukturált sor NÉLKÜLI profilra (idempotens)')
  assert(/logos_profilkep_sajat_delete/.test(kod) && /\(string_to_array\(name, '\/'\)\)\[2\] = auth\.uid\(\)::text/.test(kod), 'G12g: a törlés-policy CSAK a saját mappára')
  const mutans = kod + '\nCREATE TABLE public.x (id int);'
  assert(/CREATE\s+TABLE/i.test(mutans), 'G12n: egy CREATE TABLE beszúrásával az őr BUKIK')
}

// G13 — a layout a közös feloldót használja
{
  const kod = kodCsak(layout)
  assert(/resolveAvatarUrl\(\{/.test(kod) && !/metadataAvatarUrl \|\| fallbackPhotoUrl/.test(kod) && !/function extractFirstName/.test(kod) && /from '@\/lib\/utils\/name'/.test(layout), 'G13: a dashboard layout a resolveAvatarUrl-t és a közös extractFirstName-et használja')
}

// ── SH: a szolgálati előzmény „változott-e" összevetése (tiszta függvény) ────
{
  const sharedP = ir('profile-shared.cjs', olvas(F.shared), [['zod', path.join(ROOT, 'node_modules/zod')]])
  const S = require_(sharedP)
  const sor = (hely, evTol, evIg = null, szerep = null, megjegyzes = null) => ({ hely, szerep, evTol, evIg, megjegyzes })
  const db = [sor('Kolozsvár', 2005, 2010), sor('Sepsiszentgyörgy', 2010, null)]
  assert(S.shValtozottE(db, db.map((r) => ({ ...r }))) === false, 'SH1: azonos tartalom, azonos rend → NEM változott (nincs törlés+újraírás, nincs hamis audit)')
  assert(S.shValtozottE(db, [sor(' Kolozsvár ', 2005, 2010, '', ''), sor('Sepsiszentgyörgy', 2010, null, '', '')]) === false, 'SH2: trim / üres⇄null különbség nem változás')
  assert(S.shValtozottE(db, [...db, sor('Brassó', 2020)]) === true, 'SH3: új sor → változott')
  assert(S.shValtozottE(db, [db[0]]) === true, 'SH4: törölt sor → változott')
  assert(S.shValtozottE(db, [db[1], db[0]]) === true, 'SH5: a sorrend a szerkeszthető állapot része → felcserélve változott')
  assert(S.shValtozottE([], []) === false && S.shValtozottE([], [sor('X', null)]) === true, 'SH5b: üres⇄üres nem változás; üres → egy sor változás')
  // A HIBAOSZTÁLY bizonyítéka: a régi kód a betöltésnél kezdő év szerint CSÖKKENŐRE
  // rendezett, a mentés előtt rendezetlenül olvasott, és sorrendtartóan hasonlított.
  const regiOsszevetes = (a, b) => JSON.stringify(a.map(S.shKulcs)) !== JSON.stringify(b.map(S.shKulcs))
  const betoltesDesc = [...db].sort((a, b) => (b.evTol ?? -1) - (a.evTol ?? -1))
  assert(regiOsszevetes(db, betoltesDesc) === true, 'SH6n: a RÉGI minta azonos tartalomra is „változott"-at mondott (DESC-re rendezett kliens vs rendezetlen DB) — ezért kell az EGY kanonikus rend')
  assert(S.shValtozottE(db, db) === false && S.shValtozottE(betoltesDesc, betoltesDesc) === false, 'SH7: ugyanabban a rendben mindkét oldal → nem változott (a kanonikus rend az őr feltétele)')
}

// G14 — EGY kanonikus rendezett lekérés a betöltésnek és a mentésnek
{
  const kod = kodCsak(actions)
  const helper = szakasz(kod, 'function serviceHistoryLekeres', 700)
  assert(helper.length > 0 && /\.order\('sorrend'/.test(helper) && /\.order\('id'/.test(helper), 'G14: serviceHistoryLekeres determinisztikus rendet ad (sorrend → kezdő év → id)')
  const hivasok = (kod.match(/serviceHistoryLekeres\(supabase, user\.id\)/g) || []).length
  assert(hivasok === 2, `G14b: a betöltés ÉS a mentés-előtti olvasás ugyanazt a lekérést hívja (${hivasok} hívás, 2 kell)`)
  assert(!/ev_tol \?\? -1/.test(kod) && !/\.sort\(\(a, b\) => \(b\.ev_tol/.test(kod), 'G14c: nincs kezdő év szerinti átrendezés a szerveren (a kanonikus rend az egyetlen)')
  const mutans = kod.replace('}>).map((r) => ({ id: r.id, hely: r.hely', '}>).sort((a, b) => (b.ev_tol ?? -1) - (a.ev_tol ?? -1)).map((r) => ({ id: r.id, hely: r.hely')
  assert(mutans !== kod && /ev_tol \?\? -1/.test(mutans), 'G14n: a DESC-átrendezés visszaírásával az őr BUKIK')
  const mentes = kodCsak(szakasz(actions, 'export async function saveProfileDetails', 9000))
  assert(!/from\('pastor_service_history'\)\s*\.select\(/.test(mentes) && /shValtozottE\(/.test(mentes), 'G14d: a mentés nem saját (rendezetlen) selecttel olvas; az összevetés a közös shValtozottE')
  assert(!/\.sort\(/.test(kodCsak(szakasz(dialog, 'function slotsFromData', 500))), 'G14e: a dialógus sem rendezi át a sorokat (a szerkesztő a kanonikus rendet mutatja és menti)')
}

// G15 — a lánc-segédek nem némák
{
  const kod = kodCsak(actions)
  const lanc = szakasz(kod, 'async function loadGyulekezetLanc', 1500)
  const megye = szakasz(kod, 'async function loadEgyhazmegyeLanc', 1200)
  const nema = /if \(error \|\| !data\) return null/
  assert(lanc.length > 0 && megye.length > 0 && !nema.test(lanc) && !nema.test(megye), 'G15: a lánc-segédek nem nyelik el némán a hibát')
  assert(/hiba: `a gyülekezet lánca nem olvasható/.test(lanc) && /hiba: 'a hivatkozott gyülekezet sora nem található/.test(lanc) && /hiba: `az egyházmegye lánca nem olvasható/.test(megye), 'G15b: hiba ÉS „nincs sor" külön szöveggel a visszatérési értékben')
  // A függvény hosszabb 9000 karakternél — a visszatérési objektum a végén van.
  const betolt = szakasz(kod, 'export async function getProfileDialogData', 20000)
  assert(/\n\s+lancHiba,\n/.test(betolt) && /lancHiba: string \| null/.test(olvas(F.shared)), 'G15c: lancHiba a válaszban és a típusban')
  const dkod = kodCsak(dialog)
  assert(/data\.lancHiba/.test(dkod) && /most nem olvasható/.test(dkod) && /data\?\.lancHiba \? nemOlvashato/.test(dkod), 'G15d: a dialógus kiírja a lánc-hibát; a hiányzó név „nem olvasható", nem „nincs hozzárendelve"')
  assert(/aktivLancRes\.hiba[\s\S]{0,400}access\.congregationName/.test(kod) && /aktivLancRes\.hiba[\s\S]{0,300}access\.congregationDioceseName/.test(kod), 'G15e: lánc-hibánál a fejléc gyorstárának neve a fallback')
  const mutans = lanc.replace('if (error) {', 'if (error || !data) return null\n  if (error) {')
  assert(mutans !== lanc && nema.test(mutans), 'G15n: a néma null visszaírásával az őr BUKIK')
}

// G16 — nincs dobott akció-hiba; a dialógus minden hívása try/catch-ben
{
  const compat = kodCsak(szakasz(actions, 'async function getPastorProfileCompat', 1800))
  assert(compat.length > 0 && !/throw new Error/.test(compat) && /readError: result\.error\.message/.test(compat), 'G16: getPastorProfileCompat nem dob — readError-ral tér vissza')
  const mutans = compat.replace('readError: result.error.message,', '').replace(/return \{\s*row: null,\s*extensionReady: false,\s*extensionMessage: `A bővített profil most nem olvasható/, 'throw new Error(result.error.message)')
  assert(mutans !== compat && /throw new Error/.test(mutans), 'G16n: a throw visszaírásával az őr BUKIK')
  const betolt = kodCsak(szakasz(actions, 'export async function getProfileDialogData', 9000))
  const mentes = kodCsak(szakasz(actions, 'export async function saveProfileDetails', 9000))
  assert(/pastorProfileCompat\.readError/.test(betolt) && /elozoPastor\.readError/.test(mentes), 'G16b: a betöltés hibát ad vissza, a mentés el sem indul readError-nál (fail-closed)')
  const kapu = mentes.indexOf('elozoPastor.readError')
  const elsoIras = mentes.search(/\.update\(|\.upsert\(|\.insert\(/)
  assert(kapu >= 0 && elsoIras > kapu, 'G16c: a readError-kapu MEGELŐZI az első írást a mentésben')

  const dkod = kodCsak(dialog)
  // Egy hívás akkor van try/catch-ben, ha az őt megelőző `try {` az őt tartalmazó
  // függvényen belül van, és a következő `} catch (e) {` még a következő függvény előtt jön.
  const tryCatchBen = (kod, hivas) => {
    const i = kod.indexOf(hivas)
    if (i < 0) return false
    const tryI = kod.lastIndexOf('try {', i)
    const fnI = kod.lastIndexOf('function ', i)
    const catchI = kod.indexOf('} catch (e) {', i)
    const nextFnI = kod.indexOf('function ', i)
    return tryI > fnI && catchI >= 0 && (nextFnI < 0 || catchI < nextFnI)
  }
  const akciok = ['await getProfileDialogData()', 'await saveProfileDetails(', 'await uploadProfilePhoto(', 'await removeProfilePhoto()', 'await applyGooglePhoto()']
  for (const a of akciok) assert(tryCatchBen(dkod, a), `G16d: a dialógusban „${a}" try/catch-ben van`)
  assert(/hibaSzoveg\(e\)/.test(dkod) && /setLoadError\(/.test(dkod) && /Újra/.test(dkod), 'G16e: a dobott hiba magyar szöveggel a felületre (toast + a dialógus törzsében „Újra" gombbal)')
  const mutans2 = dkod.replace(/\} catch \(e\) \{\s*if \(cancelled\) return[\s\S]*?toast\.error\(uzenet\)\s*\} finally \{/, '} finally {')
  assert(mutans2 !== dkod && !tryCatchBen(mutans2, 'await getProfileDialogData()'), 'G16n2: a betöltő catch-ágának törlésével az őr BUKIK')
}

// ═══════════════════════════════════════════════════════════════════════════
// P3-UTÓMUNKA (2026-09-05) — a bírálat nem blokkoló találatai
// ═══════════════════════════════════════════════════════════════════════════

// P1 — a forrás-váltás (Google / feltöltött / monogram) NEM töröl fájlt, a photo_url-hoz nem nyúl
{
  const kod = kodCsak(actions)
  const valt = szakasz(kod, 'async function valtAvatarForras', 2600)
  const google = szakasz(kod, 'export async function applyGooglePhoto', 400)
  const or = (k) => !/torolProfilkepFajlokat\(/.test(k) && !/torolRegiProfilkepeket/.test(k) && /irAvatarDontes\(supabase, user\.id, source, undefined\)/.test(k)
  assert(
    valt.length > 0 && google.length > 0 && or(valt) && /valtAvatarForras\(supabase, user, 'google'\)/.test(google) && !/torolProfilkepFajlokat/.test(google),
    'P1: applyGooglePhoto a közös valtAvatarForras-on át CSAK a döntést írja — nem töröl fájlt, a photo_url érintetlen',
  )
  const mutans = valt.replace('irAvatarDontes(supabase, user.id, source, undefined)', 'irAvatarDontes(supabase, user.id, source, null)\n  await torolProfilkepFajlokat(supabase, user.id)')
  assert(mutans !== valt && !or(mutans), 'P1n: a fájl-törlés + photo_url-nullázás visszaírásával az őr BUKIK')
  const ir_ = szakasz(kod, 'async function irAvatarDontes', 1600)
  assert(/if \(photoUrl !== undefined\) sor\.photo_url = photoUrl/.test(ir_) && /avatar_source: source/.test(ir_), 'P1b: irAvatarDontes csak megadott photoUrl-t ír (undefined = érintetlen), a döntést mindig')
  assert(
    /export async function applyUploadedPhoto/.test(kod) && /export async function applyNoPhoto/.test(kod) && /Nincs feltöltött profilkép, amire vissza lehetne váltani/.test(kod),
    'P1c: vissza lehet váltani a feltöltött képre (fail-closed: csak ha van) és a monogramra — törlés nélkül',
  )
}

// P2 — a Storage remove() visszaadott listája ELLENŐRZÖTT (RLS-néma no-op ≠ siker)
{
  const kod = kodCsak(actions)
  const torol = szakasz(kod, 'async function torolProfilkepFajlokat', 1400)
  const or = (k) => /const \{ data: torolt, error: rmErr \} = await supabase\.storage\.from\('logos'\)\.remove\(kert\)/.test(k) && /toroletlen: toroletlenUtak\(kert, torolt\)/.test(k)
  assert(torol.length > 0 && or(torol), 'P2: a remove() eredményét a kért listával összevetjük (toroletlenUtak), nem csak az error-t nézzük')
  const mutans = torol.replace('const { data: torolt, error: rmErr }', 'const { error: rmErr }').replace('toroletlen: toroletlenUtak(kert, torolt)', 'toroletlen: []')
  assert(mutans !== torol && !or(mutans), 'P2n: az eredmény-ellenőrzés kivételével (a régi néma siker) az őr BUKIK')
  const rm = szakasz(kod, 'export async function removeProfilePhoto', 6000)
  const rmOr = (k) =>
    /profilkepObjektumUt\(photoUrl\)/.test(k) &&
    /torolProfilkepFajlokat\(supabase, user\.id, \{ kotelezo: sajatFajl \?\? undefined \}\)/.test(k) &&
    /if \(sajatFajl && torles\.toroletlen\.includes\(sajatFajl\)\)/.test(k)
  assert(rm.length > 0 && rmOr(rm), 'P2b: a törlésnél a HIVATKOZOTT (saját mappabeli) fájlt a lista NÉLKÜL is kérjük, és a toröletlensége HIBA (fail-closed), semmi sem változik')
  // Bírálat P3: a régi alak a kért listát CSAK a list()-ből vette — RLS-néma üres listázásnál a hivatkozott
  // fájl kérése kimaradt, a törlés „igazoltnak" számított, a hivatkozás nullázódott, a fájl maradt.
  const rmMutans = rm.replace('torolProfilkepFajlokat(supabase, user.id, { kotelezo: sajatFajl ?? undefined })', 'torolProfilkepFajlokat(supabase, user.id)')
  assert(rmMutans !== rm && !rmOr(rmMutans), 'P2bn: a „csak a lista" (kötelező út nélküli) törlés-kérés visszaírásával az őr BUKIK')
  assert(/torlesFigyelmeztetes\(/.test(kod) && /nem igazolta vissza/.test(kod), 'P2c: az eltérés figyelmeztetésként ér a hívóhoz (néma siker tilos)')
  const rmTarhely = rm.indexOf('torolProfilkepFajlokat(supabase, user.id, { kotelezo: sajatFajl ?? undefined })')
  const rmDb = rm.indexOf('irAvatarDontes(supabase, user.id, ujForras, null)')
  assert(rmTarhely >= 0 && rmDb > rmTarhely, 'P2d: sorrend — előbb a tárhely (igazolt törlés), csak utána az adatbázis')
  assert(/const fajlTorolve = Boolean\(sajatFajl\)/.test(rm) && /\n\s+fajlTorolve,\n/.test(rm) && /fajlTorolve\?: boolean/.test(olvas(F.shared)), 'P2e: a válasz kimondja, IGAZOLT-e a tárhely-törlés (fajlTorolve) — a felület csak ebből mond „véglegesen törölve"-t')
  assert(/listabanHianyzott/.test(rm) && /nem szerepelt a tárhely-mappa listájában/.test(rm), 'P2e2: a listából hiányzó, de töröletlen hivatkozott fájl külön (érthető) hibaszöveget kap')

  const S = require_(ir('profile-shared-p3.cjs', olvas(F.shared), [['zod', path.join(ROOT, 'node_modules/zod')]]))
  assert(
    JSON.stringify(S.toroletlenUtak(['profiles/u/avatar.jpg', 'profiles/u/avatar.png'], [{ name: 'profiles/u/avatar.jpg' }])) === JSON.stringify(['profiles/u/avatar.png']),
    'P2u1: toroletlenUtak — a vissza nem igazolt út marad',
  )
  assert(S.toroletlenUtak(['profiles/u/avatar.jpg'], []).length === 1 && S.toroletlenUtak(['profiles/u/avatar.jpg'], null).length === 1, 'P2u2: üres / null válasz → MINDEN kért út toröletlen (RLS-néma no-op nem siker)')
  assert(S.toroletlenUtak([], []).length === 0 && S.toroletlenUtak(['a'], [{ name: 'a' }]).length === 0, 'P2u3: teljes egyezés → nincs toröletlen')
  assert(S.profilkepObjektumUt('https://x.supabase.co/storage/v1/object/public/logos/profiles/u1/avatar.jpg?v=1725') === 'profiles/u1/avatar.jpg', 'P2u4: profilkepObjektumUt a nyilvános URL-ből az objektum-utat adja (a ?v= nélkül)')
  assert(S.profilkepObjektumUt('https://lh3.googleusercontent.com/a/b') === null && S.profilkepObjektumUt(null) === null, 'P2u5: nem logos-URL / üres → null')
  // P2u6–P2u8 — a törlésre kért lista: a hivatkozott fájl a list() nélkül is kért (a list() RLS-néma)
  assert(JSON.stringify(S.torlesreKertUtak([], { kotelezo: 'profiles/u/avatar.jpg' })) === JSON.stringify(['profiles/u/avatar.jpg']), 'P2u6: torlesreKertUtak — ÜRES listázásnál is kéri a hivatkozott fájlt')
  assert(JSON.stringify(S.torlesreKertUtak(['profiles/u/avatar.jpg', 'profiles/u/avatar.png'], { kotelezo: 'profiles/u/avatar.jpg' })) === JSON.stringify(['profiles/u/avatar.jpg', 'profiles/u/avatar.png']), 'P2u7: a listázott hivatkozott fájl nem duplázódik')
  assert(JSON.stringify(S.torlesreKertUtak(['profiles/u/avatar.jpg', 'profiles/u/avatar.png'], { kivetel: 'profiles/u/avatar.png', kotelezo: 'profiles/u/avatar.png' })) === JSON.stringify(['profiles/u/avatar.jpg']), 'P2u8: a kivétel (az épp feltöltött fájl) akkor sem kért, ha kötelezőként is meg van adva')
  // P2f — A FOLYAMAT SZIMULÁLVA a tiszta függvényekkel: RLS-néma ÜRES list() + a saját mappára mutató photo_url.
  const hivatkozottUt = S.profilkepObjektumUt('https://x.supabase.co/storage/v1/object/public/logos/profiles/u1/avatar.jpg?v=1')
  const ujFolyamat = (listazott, toroltValasz) => {
    const kert = S.torlesreKertUtak(listazott, { kotelezo: hivatkozottUt })
    const toroletlen = kert.length === 0 ? [] : S.toroletlenUtak(kert, toroltValasz)
    return toroletlen.includes(hivatkozottUt) ? 'HIBA' : 'torolve'
  }
  assert(ujFolyamat([], []) === 'HIBA', 'P2f: üres listázás + a remove() üres válasza → HIBA (a hivatkozás NEM nullázódik, a toast nem mond törlést)')
  assert(ujFolyamat([], [{ name: hivatkozottUt }]) === 'torolve', 'P2f2: üres listázás, de a remove() igazolja a hivatkozott fájl törlését → törölve')
  // A HIBAOSZTÁLY bizonyítéka: a RÉGI folyamat a kért listát CSAK a list()-ből vette.
  const regiFolyamat = (listazott, toroltValasz) => {
    const kert = listazott
    const toroletlen = kert.length === 0 ? [] : S.toroletlenUtak(kert, toroltValasz)
    return toroletlen.includes(hivatkozottUt) ? 'HIBA' : 'torolve'
  }
  assert(regiFolyamat([], []) === 'torolve', 'P2fn: a RÉGI folyamat ugyanerre „törölve"-t mondott (a fájl maradt, a hivatkozás nullázódott) — ezért kell a kötelező út')
}

// P3 — „örökölt szerep": pontos aláírás (approved_by NULL ÉS approved_at ≈ created_at, ±5 mp)
{
  const O = require_(ir('orokolt-szerep.cjs', olvas(F.orokolt)))
  const be = (approvedAt, fiok, approvedBy = null) => ({ approvedBy, approvedAt, fiokLetrejott: fiok })
  assert(O.orokoltSzerepE(be('2026-04-17T10:00:00Z', '2026-04-17T10:00:00Z')) === true, 'P3u1: azonos időbélyeg + approved_by NULL → örökölt')
  assert(O.orokoltSzerepE(be('2026-04-17T10:00:04.500Z', '2026-04-17T10:00:00Z')) === true, 'P3u2: 4,5 mp eltérés a tűrésen belül → örökölt')
  assert(O.orokoltSzerepE(be('2026-04-17T10:00:06Z', '2026-04-17T10:00:00Z')) === false, 'P3u3: 6 mp → NEM örökölt')
  assert(O.orokoltSzerepE(be('2026-04-17T13:00:00Z', '2026-04-17T10:00:00Z')) === false, 'P3u4: AZNAP, 3 órával később admin által kiosztott szerep → NEM örökölt')
  assert(O.orokoltSzerepE(be('2026-04-17T10:00:00Z', '2026-04-17T10:00:00Z', 'admin-uuid')) === false, 'P3u5: approved_by kitöltve → NEM örökölt, akkor sem, ha az időbélyeg egyezik')
  assert(
    O.orokoltSzerepE(be(null, '2026-04-17T10:00:00Z')) === false && O.orokoltSzerepE(be('nem-datum', '2026-04-17T10:00:00Z')) === false && O.orokoltSzerepE(be('2026-04-17T10:00:00Z', null)) === false,
    'P3u6: hiányzó / érvénytelen időbélyeg → false (bizonytalanul nem állítjuk)',
  )
  assert(O.OROKOLT_SZEREP_TURES_MS === 5000, 'P3u7: a tűrés 5 mp')
  // A HIBAOSZTÁLY bizonyítéka: a régi napra-egyezés az aznapi admin-jóváhagyást is örököltnek látta.
  const D = require_(dateP)
  // A régi minta a MAI forrásból (formatTimestampHu-egyezés) — nem a date.ts régi segédjét hívjuk.
  const regiNapraEgyezes = (a, b) => Boolean(D.formatTimestampHu(a)) && D.formatTimestampHu(a) === D.formatTimestampHu(b)
  assert(regiNapraEgyezes('2026-04-17T13:00:00Z', '2026-04-17T10:00:00Z') === true, 'P3n0: a RÉGI napra-egyezés a 3 órával későbbi (aznapi) jóváhagyásra is igazat ad — ezért kellett a pontos aláírás')
  const kod = kodCsak(actions)
  const or = (k) => /orokolt: orokoltSzerepE\(\{ approvedBy: r\.approved_by, approvedAt: r\.approved_at, fiokLetrejott: createdAt \}\)/.test(k) && !/ugyanazABukarestiNap/.test(k)
  assert(or(kod) && /from '@\/lib\/profile-roles\/orokolt-szerep'/.test(actions), 'P3: az actions az orokoltSzerepE-t hívja, a napra-egyezés kikerült')
  const mutans = kod.replace('orokolt: orokoltSzerepE({ approvedBy: r.approved_by, approvedAt: r.approved_at, fiokLetrejott: createdAt })', 'orokolt: r.approved_by == null && ugyanazABukarestiNap(r.approved_at, createdAt)')
  assert(mutans !== kod && !or(mutans), 'P3n: a napra-egyezés visszaírásával az őr BUKIK')
}

// P4 — a Kapcsolatok-döntés EGY feloldóból (lelkesziSzerepbenE) mind a 4 helyen
{
  const A = require_(ir('aktiv-szerep.cjs', olvas(F.aktivSzerep)))
  assert(A.lelkesziSzerepbenE({ activeProfileRole: { role: 'lelkesz' }, role: 'konyvelo' }) === true, 'P4u1: az aktív profil-szerep dönt')
  assert(A.lelkesziSzerepbenE({ activeProfileRole: { role: 'konyvelo' }, role: 'lelkesz' }) === false, 'P4u2: könyvelői profilra váltott lelkész → NEM lelkészi szerepben (a skalár nem előzi meg az aktívat)')
  assert(A.lelkesziSzerepbenE({ activeProfileRole: null, role: 'lelkesz' }) === true, 'P4u3: aktív sor nélkül a legacy skalár a fallback')
  assert(A.lelkesziSzerepbenE({ activeProfileRole: null, role: null }) === false && A.aktivSzerepKulcs({ activeProfileRole: null, role: undefined }) === null, 'P4u4: semmi → false / null')
  // Bírálat P2: az access.role ISMERETLEN skalárnál 'lelkesz'-re esik vissza (kijelző-célra) — a feloldó ezt
  // NEM veheti jognak: missingPrimaryRole → fail-closed false/null.
  assert(
    A.lelkesziSzerepbenE({ activeProfileRole: null, role: 'lelkesz', missingPrimaryRole: true }) === false &&
      A.aktivSzerepKulcs({ activeProfileRole: null, role: 'lelkesz', missingPrimaryRole: true }) === null,
    "P4u5: ISMERETLEN elsődleges szerepnél (missingPrimaryRole) a kontextus 'lelkesz' visszaesése NEM jog → false/null (fail-closed)",
  )
  const Am = require_(ir('aktiv-szerep-mutans.cjs', olvas(F.aktivSzerep).replace('if (ctx.missingPrimaryRole) return null', '')))
  assert(Am.lelkesziSzerepbenE({ activeProfileRole: null, role: 'lelkesz', missingPrimaryRole: true }) === true, 'P4u5n: a missingPrimaryRole-kapu kivételével a feloldó fail-open (true) lenne — a P4u5 őr ezt BUKÁSKÉNT látja')
  const dkod = kodCsak(dialog)
  const pkod = kodCsak(page)
  const kp = kodCsak(olvas(F.kapcsPage))
  const ka = kodCsak(olvas(F.kapcsActions))
  const regi = /\brole\s*(?:===|!==)\s*'lelkesz'/
  const or = (k) => /lelkesziSzerepbenE\(access\)/.test(k) && !regi.test(k)
  assert(or(pkod) && or(kp) && or(ka), 'P4: a /profile oldal, a /profile/kapcsolatok oldal és annak akciói a közös lelkesziSzerepbenE(access)-ből döntenek — nincs saját role === lelkesz szabály')
  assert(!regi.test(dkod) && !/isLelkesz/.test(dkod) && /kapcsolatokElerheto=\{data\.kapcsolatokElerheto\}/.test(dkod), 'P4b: a dialógus linkje a szerver által számolt kapcsolatokElerheto-ból él (nem számol újra)')
  // Bírálat P2: a dialógus-adat eddig a NYERS profile?.role-t adta át, a másik három hely az access-t —
  // ismeretlen/hiányzó skalárnál a két forrás széthúzott. EGY bemenet mind a négy helyen.
  const akod = kodCsak(actions)
  const orC = (k) => /kapcsolatokElerheto: lelkesziSzerepbenE\(access\)/.test(k) && !/lelkesziSzerepbenE\(\{ activeProfileRole/.test(k)
  assert(orC(akod), 'P4c: a kapcsolatokElerheto a szerveren UGYANAZZAL a bemenettel (access), mint a másik három hely — nem a nyers profile.role-lal')
  const mutansC = akod.replace('kapcsolatokElerheto: lelkesziSzerepbenE(access)', 'kapcsolatokElerheto: lelkesziSzerepbenE({ activeProfileRole: aktivRole, role: profile?.role })')
  assert(mutansC !== akod && !orC(mutansC), 'P4cn: a nyers profile.role-os (széttartó) alak visszaírásával az őr BUKIK')
  const mutans = kp.replace('if (!lelkesziSzerepbenE(access)) {', "if (access.role !== 'lelkesz') {")
  assert(mutans !== kp && !or(mutans), 'P4n: a skalár-alapú döntés visszaírásával az őr BUKIK')
}

// P5 — a fülek érintőfelülete 44 px (min-h-11), nincs min-h-10
{
  const kod = kodCsak(dialog)
  const or = (k) => {
    const f = k.match(/<TabsTrigger [^>]*className="([^"]+)"/g) || []
    return f.length === 3 && f.every((x) => /\bmin-h-11\b/.test(x) && !/\bmin-h-10\b/.test(x))
  }
  assert(or(kod), 'P5: mind a 3 fül min-h-11 (44 px), nincs min-h-10')
  const mutans = kod.replace('<TabsTrigger value="attekintes" className="min-h-11', '<TabsTrigger value="attekintes" className="min-h-10')
  assert(mutans !== kod && !or(mutans), 'P5n: a min-h-10 visszaírásával az őr BUKIK')
}

// P6 — React-kulcs nem a megjelenített tartalomból
{
  const kod = kodCsak(dialog)
  const or = (k) => !/key=\{item\}/.test(k) && (k.match(/\.map\(\(item, i\) => \(/g) || []).length === 2 && (k.match(/<span key=\{i\}/g) || []).length === 2
  assert(or(kod), 'P6: a két chip-lista (régi helyek, korábbi szerepek) kulcsa az index, nem a szöveg')
  const mutans = kod.replace('legacyHelyek.map((item, i) => (', 'legacyHelyek.map((item) => (').replace('<span key={i} className="max-w-full break-words rounded-full bg-secondary', '<span key={item} className="max-w-full break-words rounded-full bg-secondary')
  assert(mutans !== kod && !or(mutans), 'P6n: a tartalom-kulcs visszaírásával az őr BUKIK')
}

// P7 — ProfileStatus a 4 élő DB-értékkel; a címke-térkép kimerítő
{
  const akod = kodCsak(olvas(F.authTypes))
  const or = (k) => /PROFILE_STATUS_VALUES = \['pending', 'active', 'rejected', 'deleted'\] as const/.test(k) && /export type ProfileStatus = \(typeof PROFILE_STATUS_VALUES\)\[number\]/.test(k)
  assert(or(akod), 'P7: ProfileStatus = pending | active | rejected | deleted (egy forrásból, a DB íróival egyezően)')
  const lkod = kodCsak(labelsSrc)
  assert(/PROFILE_STATUS_LABELS: Record<ProfileStatus, string>/.test(lkod) && /isProfileStatus\(status\)/.test(lkod), 'P7b: a címke-térkép a ProfileStatus-ra KIMERÍTŐ (új érték → fordítási hiba), a feloldó típus-guarddal')
  const mutans = akod.replace("PROFILE_STATUS_VALUES = ['pending', 'active', 'rejected', 'deleted'] as const", "PROFILE_STATUS_VALUES = ['pending', 'active'] as const")
  assert(mutans !== akod && !or(mutans), 'P7n: a kétértékű unió visszaírásával az őr BUKIK')
  const T = require_(authTypesP)
  assert(
    T.isProfileStatus('rejected') && T.isProfileStatus('deleted') && T.isProfileStatus('pending') && T.isProfileStatus('active') && !T.isProfileStatus('approved') && !T.isProfileStatus(null),
    'P7u: isProfileStatus a 4 értéket ismeri; az örökölt approved-ot és a null-t nem',
  )
  const L = require_(labelsP)
  assert(L.getProfileStatusLabel('rejected').label === 'Elutasítva' && L.getProfileStatusLabel('approved').ismeretlen === true, 'P7u2: rejected → Elutasítva; approved → ismeretlen (⚠️), nem hamis címke')
}

// P8 — a végleges törlés kétlépéses megerősítő dialógusból; nincs window.confirm
{
  const kod = kodCsak(dialog)
  const or = (k) => !/window\.confirm\(/.test(k) && /<AdminConfirmDialog/.test(k) && /tone="danger"/.test(k) && /onConfirm=\{\(\) => void handlePhotoDelete\(\)\}/.test(k)
  assert(or(kod) && /from '@\/components\/admin\/admin-confirm-dialog'/.test(dialog), 'P8: a végleges törlés a meglévő megerősítő dialógusból indul (danger), nincs window.confirm')
  assert((kod.match(/await removeProfilePhoto\(\)/g) || []).length === 1 && (kod.match(/void handlePhotoDelete\(\)/g) || []).length === 1, 'P8b: removeProfilePhoto egyetlen hívója a handlePhotoDelete, azt egyedül a dialógus onConfirm-ja hívja')
  const mutans = kod.replace('onConfirm={() => void handlePhotoDelete()}', 'onConfirm={() => {}}').replace('onClick={() => setTorlesMegerosites(true)}', "onClick={() => { if (window.confirm('Törlöd?')) void handlePhotoDelete() }}")
  assert(mutans !== kod && !or(mutans), 'P8n: a window.confirm visszaírásával az őr BUKIK')
  const valt = szakasz(kod, 'async function handleForrasValtas', 1400)
  assert(valt.length > 0 && !/removeProfilePhoto/.test(valt) && /await applyUploadedPhoto\(\)/.test(valt) && /await applyNoPhoto\(\)/.test(valt) && /await applyGooglePhoto\(\)/.test(valt), 'P8c: a forrás-váltó a három nem-destruktív akciót hívja, törlést nem')
  assert(/Feltöltött kép törlése/.test(kod) && /data\.feltoltottKepVan/.test(kod) && /<ForrasGomb/.test(kod) && /aria-pressed=\{aktiv\}/.test(kod), 'P8d: külön „Feltöltött kép törlése" gomb + forrás-váltó gombok (aria-pressed)')
}

// P9 — (ellenőrzés-ügynök, 2026-09-05) a Felhasználók-oldal státusz-látványa a ProfileStatus-ra
//      KIMERÍTŐ térkép, a CÍMKE a PROFILE_STATUS_LABELS-ből (eddig két forrás: „Törölve" ⇄ „Törölt")
{
  const uvP = path.join(ROOT, 'apps/web/components/admin/users/user-visuals.ts')
  const uv = olvas(uvP)
  const kod = kodCsak(uv)
  const or = (k) =>
    /USER_STATUS_VISUALS: Record<ProfileStatus, Omit<UserStatusMeta, 'label'>>/.test(k) &&
    /if \(isProfileStatus\(status\)\) return \{ label: PROFILE_STATUS_LABELS\[status\], \.\.\.USER_STATUS_VISUALS\[status\] \}/.test(k) &&
    !/case 'active':/.test(k) &&
    !/label: 'Törölve'/.test(k)
  assert(or(kod), 'P9: getUserStatusMeta — Record<ProfileStatus,…> látvány-térkép + címke a PROFILE_STATUS_LABELS-ből, nincs saját switch / saját címke')
  const mutans = kod.replace(
    'if (isProfileStatus(status)) return { label: PROFILE_STATUS_LABELS[status], ...USER_STATUS_VISUALS[status] }',
    "switch (status) { case 'active': return { label: 'Aktív', intent: 'success', accent: '' }; case 'deleted': return { label: 'Törölve', intent: 'neutral', accent: '' } }",
  )
  assert(mutans !== kod && !or(mutans), 'P9n: a saját switch-es / saját címkés (régi) mutánson az őr BUKIK')
  // P9u — FUTTATVA: a címke a labels-térképpel azonos; ismeretlen érték nyersen, semleges színnel
  const UV = require_(ir('user-visuals.cjs', uv, [
    ['@/lib/profile-roles/labels', labelsP],
    ['@/lib/types/auth', authTypesP],
  ]))
  const L = require_(labelsP)
  assert(
    ['pending', 'active', 'rejected', 'deleted'].every((s) => UV.getUserStatusMeta(s).label === L.PROFILE_STATUS_LABELS[s]) &&
      UV.getUserStatusMeta('deleted').label === 'Törölt' &&
      UV.getUserStatusMeta('pending').intent === 'warning' && UV.getUserStatusMeta('rejected').intent === 'danger' && UV.getUserStatusMeta('active').intent === 'success' &&
      UV.getUserStatusMeta('approved').label === 'approved' && UV.getUserStatusMeta('approved').intent === 'neutral' &&
      UV.getUserStatusMeta(null).label === 'Ismeretlen',
    'P9u: mind a 4 státusz címkéje = PROFILE_STATUS_LABELS (deleted → „Törölt"); az örökölt approved nyersen, semlegesen; null → Ismeretlen',
  )
}

// P10 — (bírálat P3) a forrás-váltó az EFFEKTÍV forrásból jelöl; a gombsor örökölt metaadat-képnél is látszik;
//       a törlés-toast csak IGAZOLT tárhely-törlésnél „végleges"
{
  const kod = kodCsak(dialog)
  const aktivJelolesek = (k) => k.match(/aktiv=\{data\.(\w+) === '(?:upload|google|none)'\}/g) || []
  const or = (k) => {
    const a = aktivJelolesek(k)
    return a.length === 3 && a.every((x) => /data\.effektivAvatarSource ===/.test(x)) && !/aktiv=\{data\.avatarSource ===/.test(k)
  }
  assert(or(kod), `P10: mind a 3 forrás-gomb aktiv jelölése az effektivAvatarSource-ból (${aktivJelolesek(kod).length} gomb) — NULL döntésű, örökölt soron is jelöl`)
  const mutans = kod.replace("aktiv={data.effektivAvatarSource === 'upload'}", "aktiv={data.avatarSource === 'upload'}")
  assert(mutans !== kod && !or(mutans), 'P10n: a döntés-alapú (NULL-nál „semmi sincs kiválasztva") jelölés visszaírásával az őr BUKIK')
  assert(/effektivAvatarSource: res\.effektivAvatarSource \?\? null/.test(kod), 'P10b: a fotó-akciók eredménye az effektív forrást is átveszi (a kliens nem vezeti le újra)')
  const sav = /\(data\.feltoltottKepVan \|\| data\.googlePictureElerheto \|\| Boolean\(data\.avatarUrl\)\) && \(/
  assert(sav.test(kod), 'P10c: a forrás-gombsor akkor is látszik, ha CSAK örökölt metaadat-kép van (a Monogram = az egyetlen elrejtés)')
  const mutans2 = kod.replace('(data.feltoltottKepVan || data.googlePictureElerheto || Boolean(data.avatarUrl)) && (', '(data.feltoltottKepVan || data.googlePictureElerheto) && (')
  assert(mutans2 !== kod && !sav.test(mutans2), 'P10cn: a szűkebb (metaadat-képnél gomb nélküli) feltétel visszaírásával az őr BUKIK')
  const del = szakasz(kod, 'async function handlePhotoDelete', 1400)
  const delOr = (k) => /res\.fajlTorolve\s*\?\s*'A feltöltött profilkép véglegesen törölve\.'/.test(k) && !/toast\.success\('A feltöltött profilkép véglegesen törölve\.'\)/.test(k)
  assert(del.length > 0 && delOr(del), 'P10d: a „véglegesen törölve" toast CSAK igazolt tárhely-törlésnél (fajlTorolve), különben „a hivatkozás törölve"')
  const mutans3 = del.replace(/toast\.success\(\s*res\.fajlTorolve\s*\?\s*'A feltöltött profilkép véglegesen törölve\.'\s*:\s*'[^']*',?\s*\)/, "toast.success('A feltöltött profilkép véglegesen törölve.')")
  assert(mutans3 !== del && !delOr(mutans3), 'P10dn: a feltétel nélküli „véglegesen törölve" visszaírásával az őr BUKIK')
}

// P11 — (bírálat P3) az EFFEKTÍV forrás EGY szabályból: a kép ÉS a gombok jelölése ugyanabból (effektivAvatarSource), a szerver adja
{
  const { effektivAvatarSource, resolveAvatarUrl } = require_(avatarP)
  const F_ = { photoUrl: 'https://x.test/feltoltott.jpg', metadataAvatarUrl: 'https://x.test/meta.jpg', picture: 'https://lh3.test/google.jpg' }
  assert(effektivAvatarSource({ source: 'google', ...F_ }) === 'google' && effektivAvatarSource({ source: 'none', ...F_ }) === 'none', 'P11u1: explicit döntés → maga a döntés')
  assert(effektivAvatarSource({ source: null, ...F_ }) === 'upload', 'P11u2: örökölt (NULL) sor feltöltött képpel → upload (a „Feltöltött kép" gomb jelölve)')
  assert(effektivAvatarSource({ source: null, photoUrl: null, metadataAvatarUrl: F_.picture, picture: F_.picture }) === 'google', 'P11u3: örökölt, a metaadat = a Google-kép → google')
  assert(effektivAvatarSource({ source: null, photoUrl: null, metadataAvatarUrl: F_.metadataAvatarUrl, picture: null }) === null, 'P11u4: örökölt, ismeretlen eredetű metaadat-kép → null (nincs rá gomb, csak a Monogram)')
  assert(
    effektivAvatarSource({ source: null, photoUrl: null, metadataAvatarUrl: null, picture: null }) === 'none' &&
      effektivAvatarSource({ source: 'furcsa', photoUrl: null, metadataAvatarUrl: null, picture: F_.picture }) === 'google',
    'P11u5: semmi → none; ismeretlen döntés-érték = örökölt szabály',
  )
  for (const source of ['upload', 'google', 'none', null]) {
    const eff = effektivAvatarSource({ source, ...F_ })
    const url = resolveAvatarUrl({ source, ...F_ })
    const vart = eff === 'upload' ? F_.photoUrl : eff === 'google' ? F_.picture : eff === 'none' ? null : F_.metadataAvatarUrl
    assert(url === vart, `P11u6: a kép és az effektív forrás EGY szabályból (source=${source}: ${eff} → ${url})`)
  }
  const avkod = kodCsak(olvas(F.avatar))
  assert(/switch \(effektivAvatarSource\(input\)\)/.test(avkod), 'P11: resolveAvatarUrl az effektivAvatarSource-ból dönt (a sorrend EGY helyen él)')
  const mutans = avkod.replace('switch (effektivAvatarSource(input))', 'switch (input.source)')
  assert(mutans !== avkod && !/switch \(effektivAvatarSource\(input\)\)/.test(mutans), 'P11n: a döntés-skalár szerinti (második sorrendet szülő) switch visszaírásával az őr BUKIK')
  const betolt = kodCsak(szakasz(actions, 'export async function getProfileDialogData', 20000))
  assert(/effektivAvatarSource: effektivAvatarSource\(avatarForrasok\)/.test(betolt) && /const avatarUrl = resolveAvatarUrl\(avatarForrasok\)/.test(betolt), 'P11b: a szerver UGYANABBÓL a bemenetből adja a képet ÉS az effektív forrást')
  assert(/effektivAvatarSource: AvatarSource \| null/.test(olvas(F.shared)), 'P11c: az adatszerződésben az effektív forrás külön mező (a döntés — avatarSource — írása változatlan)')
  const mutans2 = betolt.replace('effektivAvatarSource: effektivAvatarSource(avatarForrasok),', '')
  assert(mutans2 !== betolt && !/effektivAvatarSource: effektivAvatarSource\(avatarForrasok\)/.test(mutans2), 'P11bn: a szerver-oldali effektív forrás elhagyásával az őr BUKIK')
}

// P3c — az „örökölt szerep" döntése KIZÁRÓLAG az orokoltSzerepE; a napra-egyezésnek (ugyanazABukarestiNap)
//       nincs app-oldali hívója. A date.ts docblock-SZÖVEGÉT szándékosan NEM asszertáljuk (más terület tulajdona —
//       egy átfogalmazás ott nem buktathatja a profil-őrt); az invariáns a hívók hiánya.
{
  /** apps/web TS/TSX fájljai (node_modules, .next és rejtett mappák nélkül). */
  function tsFajlok(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) tsFajlok(p, acc)
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p)
    }
    return acc
  }
  const napraEgyezoHivo = (forras) => /ugyanazABukarestiNap\(/.test(kodCsak(forras))
  const hivok = tsFajlok(path.join(ROOT, 'apps/web'))
    .filter((p) => path.resolve(p) !== path.resolve(F.date))
    .filter((p) => napraEgyezoHivo(olvas(p)))
    .map((p) => path.relative(ROOT, p))
  assert(hivok.length === 0, `P3c: az apps/web-ben NINCS app-oldali hívója az ugyanazABukarestiNap-nak (${hivok.join(', ') || 'rendben'})`)
  // Mutáns: egy app-oldali forrás, amely a napra-egyezésből dönt — a hívó-szűrő megtalálja (az őr nem vak);
  // a kommentbeli említést viszont nem számolja hívónak.
  assert(
    napraEgyezoHivo('const orokolt = r.approved_by == null && ugyanazABukarestiNap(r.approved_at, createdAt)') === true &&
      napraEgyezoHivo('// ugyanazABukarestiNap(a, b) csak kommentben') === false,
    'P3cn: a napra-egyezésből döntő forrást a hívó-szűrő megtalálja (a kommentet nem) — a régi alak visszaírásával az őr BUKNA',
  )
}

fs.rmSync(TMP, { recursive: true, force: true })

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
if (failedCount > 0) {
  console.error('A profil-pontosság önellenőrzés ELBUKOTT.')
  process.exit(1)
}
process.exit(0)
