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
const labelsP = ir('labels.cjs', olvas(F.labels), [['@/lib/profile-roles/types', typesP]])
const avatarP = ir('avatar.cjs', olvas(F.avatar))
const nameP = ir('name.cjs', olvas(F.name))

// ── T: dátum-formázók — GYEREK-FOLYAMATBAN, nyugati zónában ──────────────────
// A `process.env.TZ` futásidejű átállítása platformonként eltérően viselkedik;
// a külön Node-folyamat env-je BIZTOSAN érvényes az első Date-hívás előtt.
{
  const script = `
    const d = require(${JSON.stringify(dateP)});
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
      napEgyezik: d.ugyanazABukarestiNap('2026-04-25T21:30:00Z', '2026-04-26T05:00:00Z'),
      napKulon: d.ugyanazABukarestiNap('2026-04-25T20:30:00Z', '2026-04-26T05:00:00Z'),
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
  assert(r.napEgyezik === true && r.napKulon === false, `T8: ugyanazABukarestiNap a bukaresti naptári napot nézi (${r.napEgyezik}/${r.napKulon})`)
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

fs.rmSync(TMP, { recursive: true, force: true })

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
if (failedCount > 0) {
  console.error('A profil-pontosság önellenőrzés ELBUKOTT.')
  process.exit(1)
}
process.exit(0)
