// selftest-ertesites-p3-sql.mjs — a 2026-09-05-ertesitesek-p3.sql forrásőre (P3-utómunka)
//
// ⛔ MI VOLT A HIBA (bírálói P3, 2026-09-05)
//   A 2026-09-05 ELŐTTI hozzáférés-kérelem sorok (ertesitesek.admin_request_id
//   kitöltve) „Válaszra vár" pillje és gombpárja sosem oldódott fel: a
//   „megoldva" jelölés csak az új döntési úton történik. Az SQL egyszeri
//   visszatöltése a már ELDŐLT kérelmek sorait jelöli meg — de egy rossz WHERE
//   (nem idempotens, vagy a meglévő időbélyeget felülíró) másodszorra hazudna,
//   és a `ertesites_felado_levezetes` explicit EXECUTE-ja sem szivároghat az
//   anon szerepnek. A migration-fájl nem bizonyíték (memory) — de az ALAKJA
//   őrizhető, hogy egy „egyszerűsítő" refaktor ne törje el.
//
// ⛔ A JAVÍTÓ KÖR LELETE (bírálói P3, 2026-09-05)
//   A TS és az SQL KÉT szabályt írt UGYANARRA a kapcsolásra: a TS bármilyen
//   `admin_access:<akármi>` hivatkozást elfogadott (az uuid oszlopra küldve
//   EGYETLEN rossz alak 22P02-vel az EGÉSZ darabot elbuktatta volna), az SQL
//   csak UUID-t; a TS feketelistával döntött („bármi, ami nem pending"), az SQL
//   ugyanígy — a komment viszont ISMERT állapotot ígért. Most MINDKETTŐ a TS
//   konstansaiból áll elő (UUID_MINTA_SZOVEG, KERELEM_ELDOLT_ALLAPOTOK,
//   KERELEM_HIVATKOZAS_ELOTAG — uzenetek-shared.ts), és ez az őr ONNAN méri az
//   SQL alakját: két forrás nincs.
//
// ŐRSZEMEK
//   Q0   fejléc: MIT AD / MIÉRT / Futtatás / „nem hoz létre táblát, mentés-besorolás
//        nem kell"; a fájlban NINCS CREATE TABLE / DELETE / TRUNCATE (kommentek nélkül)
//   Q1   a visszatöltő UPDATE: r.status IN (<KERELEM_ELDOLT_ALLAPOTOK>) — FEHÉRLISTA, a
//        TS konstansból mérve — ÉS e.megoldva IS DISTINCT FROM true (idempotens — a
//        második futás 0 sort érint); a fájlban SEHOL nincs `<> 'pending'` feketelista
//   Q1n  negatív: az idempotencia-feltétel nélküli mutánson az őr BUKIK
//   Q1w  negatív: a feketelistás (`r.status <> 'pending'`) mutánson az őr BUKIK
//   Q2   megoldva_at = coalesce(e.megoldva_at, …) — a meglévő időbélyeg SOHA nem íródik felül;
//        Q2n: a `megoldva_at = now()` mutánson BUKIK
//   Q3   a kapcsolás: admin_request_id ELSŐ, a régi `admin_access:<uuid>` hivatkozás a
//        tartalék; a regex-literál = '^' + előtag + UUID_MINTA_SZOVEG + '$' SZÓ SZERINT a
//        TS-ből; a substr-pozíció = az előtag hossza + 1; a literál pontosan kétszer
//        (UPDATE + rács); Q3n: az UUID-regex nélküli (LIKE-os) cast-mutánson BUKIK
//   Q4   GRANT EXECUTE … TO authenticated, service_role; REVOKE … FROM anon;
//        NINCS GRANT anon-nak / PUBLIC-nak; Q4n: az anon-GRANT mutánson BUKIK
//   Q5   előfeltétel-őr (DO … RAISE EXCEPTION) a megoldva oszlopra ÉS a függvényre,
//        és az UPDATE ELŐTT áll
//   Q6   verifikációs rács: UNION ALL, a „0 kell" sor UGYANAZT a fehérlistás predikátumot
//        és UGYANAZT a kapcsolást méri, has_function_privilege mind a 3 szerepre
//        (anon: ❌ ha van joga)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const SQL_PATH = path.join(ROOT, 'migration-docs/sql/2026-09-05-ertesitesek-p3.sql')
const SHARED_PATH = path.join(ROOT, 'apps/web/lib/notifications/uzenetek-shared.ts')
const SQL = fs.readFileSync(SQL_PATH, 'utf8')
const SHARED = fs.readFileSync(SHARED_PATH, 'utf8')

/** SQL-kommentek nélkül — hogy egy kommentbe írt alak ne tévessze meg az őrt. */
function kommentNelkul(sql) {
  return sql
    .split('\n')
    .map((s) => s.replace(/--.*$/, ''))
    .join('\n')
}
const TISZTA = kommentNelkul(SQL)

/** Regex-biztos szöveg (a TS konstansokból épített mintákhoz). */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── A TS KONSTANSOK — az SQL ezekből áll elő, az őr innen mér (két forrás nincs) ──
const elotagM = /KERELEM_HIVATKOZAS_ELOTAG\s*=\s*'([^']+)'/.exec(SHARED)
const uuidM = /UUID_MINTA_SZOVEG\s*=\s*'([^']+)'/.exec(SHARED)
const eldoltM = /KERELEM_ELDOLT_ALLAPOTOK[^=]*=\s*\[([^\]]+)\]/.exec(SHARED)
assert(
  !!elotagM && !!uuidM && !!eldoltM,
  'Q-előfeltétel: a TS konstansok (KERELEM_HIVATKOZAS_ELOTAG, UUID_MINTA_SZOVEG, KERELEM_ELDOLT_ALLAPOTOK) megvannak az uzenetek-shared.ts-ben',
)
const ELOTAG = elotagM ? elotagM[1] : 'admin_access:'
const UUID = uuidM ? uuidM[1] : ''
const ELDOLT = eldoltM ? [...eldoltM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
assert(
  ELDOLT.join(',') === 'approved,denied,expired',
  `Q-előfeltétel: a fehérlista = approved,denied,expired (az élő CHECK döntés-állapotai; kapott: ${ELDOLT.join(',') || 'üres'})`,
)
assert(/^\[0-9a-fA-F\]\{8\}-/.test(UUID) && /\{12\}$/.test(UUID), `Q-előfeltétel: UUID_MINTA_SZOVEG a 8-4-4-4-12 hexa alak (kapott: ${UUID || 'üres'})`)

/** Az SQL-ben elvárt regex-literál: '^admin_access:<UUID_MINTA_SZOVEG>$' — szó szerint. */
const HIV_REGEX_SQL = `'^${ELOTAG}${UUID}$'`
/** A fehérlista SQL-alakja: status IN ('approved', 'denied', 'expired') — szóköz-tűrő minta (forrás-sztring). */
const ELDOLT_IN_SRC = `status\\s+IN\\s*\\(\\s*${ELDOLT.map((s) => `'${s}'`).join('\\s*,\\s*')}\\s*\\)`
/** A kapcsolás: coalesce(e.admin_request_id, CASE WHEN e.hivatkozas ~ '<regex>' THEN substr(e.hivatkozas, N)::uuid END) */
const kapcsolasRe = (elottePrefix) =>
  new RegExp(
    `${elottePrefix}coalesce\\(\\s*e\\.admin_request_id\\s*,\\s*CASE\\s+WHEN\\s+e\\.hivatkozas\\s*~\\s*${esc(HIV_REGEX_SQL)}\\s*THEN\\s+substr\\(e\\.hivatkozas,\\s*(\\d+)\\)::uuid\\s+END\\s*\\)`,
  )

/** A visszatöltő UPDATE utasítás (a pontosvesszőig). */
function visszatoltoUpdate(sqlTiszta) {
  const m = /UPDATE\s+public\.ertesitesek\s+e\s+SET\s+megoldva\s*=\s*true[\s\S]*?;/.exec(sqlTiszta)
  return m ? m[0] : null
}

// ── Q0: fejléc + tiltott utasítások ────────────────────────────────────────
assert(/^-- MIT AD/m.test(SQL) && /MIÉRT/.test(SQL) && /^-- Futtatás:/m.test(SQL), 'Q0: a fejléc a projekt-mintát követi (MIT AD / MIÉRT / Futtatás)')
assert(/NEM HOZ LÉTRE TÁBLÁT/.test(SQL) && /MENTÉS-BESOROLÁS NEM KELL/.test(SQL), 'Q0: a fájl kimondja: nem hoz létre táblát, mentés-besorolás nem kell')
assert(!/\bCREATE\s+TABLE\b/i.test(TISZTA), 'Q0: NINCS CREATE TABLE (kommentek nélkül mérve)')
assert(!/\bDELETE\s+FROM\b/i.test(TISZTA) && !/\bTRUNCATE\b/i.test(TISZTA) && !/\bDROP\s+TABLE\b/i.test(TISZTA), 'Q0: NINCS DELETE / TRUNCATE / DROP TABLE — adatot nem töröl')
assert(/2026-08-11-ertesites-megoldva\.sql/.test(SQL) && /2026-09-05-ertesitesek-felado\.sql/.test(SQL), 'Q0: az előfeltétel-fájlok név szerint szerepelnek a fejlécben')

// ── Q1: az idempotens, FEHÉRLISTÁS WHERE ───────────────────────────────────
const UPD = visszatoltoUpdate(TISZTA)
assert(!!UPD, 'Q1-előfeltétel: a visszatöltő UPDATE (UPDATE public.ertesitesek e SET megoldva = true …) megvan')

/** Az UPDATE WHERE-je tartalmazza-e mindkét szűrőt (fehérlistás eldőlt kérelem + még jelöletlen sor)? */
function idempotensE(upd) {
  if (!upd) return false
  const whereIdx = upd.search(/\bWHERE\b/)
  if (whereIdx < 0) return false
  const where = upd.slice(whereIdx)
  return new RegExp(`r\\.${ELDOLT_IN_SRC}`).test(where) && /e\.megoldva\s+IS\s+DISTINCT\s+FROM\s+true/.test(where)
}
assert(idempotensE(UPD), `Q1: a WHERE: r.status IN (${ELDOLT.map((s) => `'${s}'`).join(', ')}) — fehérlista a TS konstansból — ÉS e.megoldva IS DISTINCT FROM true (idempotens, NULL-biztos)`)
assert(!/status\s*<>\s*'pending'/.test(TISZTA) && !/status\s*!=\s*'pending'/.test(TISZTA), "Q1: SEHOL nincs feketelista (`<> 'pending'`) — egy ismeretlen (a CHECK-en kívüli) állapot nem dönt")
assert(!/e\.megoldva\s*=\s*false/.test(UPD ?? ''), 'Q1: NEM `megoldva = false` (a NULL-os sort az kihagyná)')
assert(/FROM\s+public\.admin_access_requests\s+r\b/.test(UPD ?? ''), 'Q1: a kérelem-tábla a FROM-ban (admin_access_requests r)')

// Q1n NEGATÍV — az idempotencia-feltétel nélküli mutáns
{
  const mutans = (UPD ?? '').replace(/\s*AND\s+e\.megoldva\s+IS\s+DISTINCT\s+FROM\s+true/, '')
  if (!UPD || mutans === UPD) assert(false, 'Q1n: a mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else assert(!idempotensE(mutans), 'Q1n: az idempotencia-feltétel nélküli mutánson az őr BUKIK')
}
// Q1w NEGATÍV — a FEKETELISTÁS világ („bármi, ami nem pending" = döntés)
{
  const mutans = (UPD ?? '').replace(/r\.status\s+IN\s*\([^)]*\)/, "r.status <> 'pending'")
  if (!UPD || mutans === UPD) assert(false, 'Q1w: a feketelista-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else assert(!idempotensE(mutans), "Q1w: a feketelistás (`r.status <> 'pending'`) mutánson az őr BUKIK")
}

// ── Q2: a meglévő időbélyeg SOHA nem íródik felül ─────────────────────────
function idobelyegOrzottE(upd) {
  return /megoldva_at\s*=\s*coalesce\(\s*e\.megoldva_at\s*,/.test(upd ?? '')
}
assert(idobelyegOrzottE(UPD), 'Q2: megoldva_at = coalesce(e.megoldva_at, …) — a meglévő időbélyeg az első')
assert(/WHEN\s+'approved'\s+THEN\s+r\.approved_at/.test(UPD ?? '') && /WHEN\s+'denied'\s+THEN\s+r\.denied_at/.test(UPD ?? ''), 'Q2: a tartalék a DÖNTÉS ideje (approved_at / denied_at), nem a mai nap')
assert(/now\(\)\s*\)/.test(UPD ?? ''), 'Q2: a now() csak a coalesce VÉGSŐ tartaléka')
{
  const mutans = (UPD ?? '').replace(/megoldva_at\s*=\s*coalesce\([\s\S]*?now\(\)\s*\)/, 'megoldva_at = now()')
  if (!UPD || mutans === UPD) assert(false, 'Q2n: a mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else assert(!idobelyegOrzottE(mutans), 'Q2n: a `megoldva_at = now()` (felülíró) mutánson az őr BUKIK')
}

// ── Q3: a kapcsolás — oszlop ELSŐ, régi hivatkozás a tartalék, a regex és a substr-pozíció a TS konstansokból ──
{
  const kapcs = kapcsolasRe('r\\.id\\s*=\\s*')
  const kapcsM = kapcs.exec(UPD ?? '')
  assert(!!kapcsM, `Q3: r.id = coalesce(e.admin_request_id, CASE WHEN hivatkozas ~ ${HIV_REGEX_SQL} THEN substr(…)::uuid END) — a regex SZÓ SZERINT a TS UUID_MINTA_SZOVEG-ből`)
  assert(kapcsM && Number(kapcsM[1]) === ELOTAG.length + 1, `Q3: a substr a(z) ${ELOTAG.length + 1}. pozíciótól indul (az „${ELOTAG}" előtag hossza + 1)`)
  assert((TISZTA.match(new RegExp(esc(HIV_REGEX_SQL), 'g')) ?? []).length === 2, 'Q3: a regex-literál pontosan kétszer (UPDATE + rács) — a két kapcsolás azonos, más alak nincs')
  // Minden ::uuid cast egy `CASE WHEN e.hivatkozas ~ '<regex>' THEN … END` őr mögött áll — ha a
  // regex-őrös blokkokat kivesszük, ::uuid nem maradhat (LIKE-os vagy csupasz cast = 22P02-kockázat).
  const orNelkul = TISZTA.replace(new RegExp(`CASE\\s+WHEN\\s+e\\.hivatkozas\\s*~\\s*${esc(HIV_REGEX_SQL)}[\\s\\S]*?END`, 'g'), '')
  assert(!/::uuid/.test(orNelkul) && !/hivatkozas\s+LIKE\s+'admin_access:%'/i.test(TISZTA), 'Q3: NINCS regex-őr nélküli ::uuid cast (LIKE-os / csupasz) — 22P02 nem lehet')
  // Q3n NEGATÍV — az UUID-regex NÉLKÜLI (LIKE-os) cast: egy rossz alakú régi hivatkozás 22P02-vel az egész UPDATE-et elbuktatná
  const vakCast = (UPD ?? '').replace(
    new RegExp(`CASE\\s+WHEN\\s+e\\.hivatkozas\\s*~\\s*${esc(HIV_REGEX_SQL)}\\s*THEN\\s+substr\\(e\\.hivatkozas,\\s*\\d+\\)::uuid\\s+END`),
    `CASE WHEN e.hivatkozas LIKE '${ELOTAG}%' THEN substr(e.hivatkozas, ${ELOTAG.length + 1})::uuid END`,
  )
  if (!UPD || vakCast === UPD) assert(false, 'Q3n: a cast-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  else assert(!kapcs.test(vakCast), 'Q3n: az UUID-regex NÉLKÜLI (LIKE-os) cast-mutánson az őr BUKIK')
}

// ── Q4: EXECUTE — authenticated + service_role IGEN, anon / PUBLIC NEM ────
const FN = 'public\\.ertesites_felado_levezetes\\(text,\\s*text,\\s*text,\\s*uuid,\\s*text\\)'
const grantRe = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${FN}\\s+TO\\s+authenticated\\s*,\\s*service_role\\s*;`)
const revokeAnonRe = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${FN}\\s+FROM\\s+anon\\s*;`)
function anonGrantE(sqlTiszta) {
  return /GRANT\s+[^;]*ON\s+FUNCTION\s+[^;]*\bTO\b[^;]*\b(anon|PUBLIC)\b/i.test(sqlTiszta)
}
assert(grantRe.test(TISZTA), 'Q4: GRANT EXECUTE … TO authenticated, service_role (az 5 paraméteres aláírásra)')
assert(revokeAnonRe.test(TISZTA), 'Q4: REVOKE ALL … FROM anon MARAD')
assert(!anonGrantE(TISZTA), 'Q4: NINCS GRANT anon-nak / PUBLIC-nak')
{
  const mutans = `${TISZTA}\nGRANT EXECUTE ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) TO anon;\n`
  assert(anonGrantE(mutans), 'Q4n: az anon-GRANT mutánson az őr BUKIK')
  const kommentMutans = `${TISZTA}\n-- GRANT EXECUTE ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) TO anon;\n`
  assert(!anonGrantE(kommentNelkul(kommentMutans)), 'Q4k: kommentbe írt anon-GRANT nem riasztja az őrt (a komment-szűrő él)')
}

// ── Q5: előfeltétel-őr az UPDATE ELŐTT ─────────────────────────────────────
{
  const orIdx = TISZTA.search(/DO\s+\$elofeltetel\$/)
  const updIdx = TISZTA.search(/UPDATE\s+public\.ertesitesek\s+e\s+SET\s+megoldva/)
  const orBlokk = orIdx >= 0 ? TISZTA.slice(orIdx, updIdx > orIdx ? updIdx : undefined) : ''
  assert(orIdx >= 0 && updIdx > orIdx, 'Q5: az előfeltétel-őr (DO $elofeltetel$) az UPDATE ELŐTT áll')
  assert(/column_name\s*=\s*'megoldva'/.test(orBlokk) && /column_name\s*=\s*'megoldva_at'/.test(orBlokk) && /RAISE\s+EXCEPTION/.test(orBlokk), 'Q5: az őr a megoldva ÉS a megoldva_at oszlopot méri, hiánynál RAISE EXCEPTION (fail-closed)')
  assert(/to_regprocedure\('public\.ertesites_felado_levezetes\(text,text,text,uuid,text\)'\)\s+IS\s+NULL/.test(orBlokk), 'Q5: az őr a levezető függvény meglétét is méri')
  assert((orBlokk.match(/RAISE\s+EXCEPTION/g) ?? []).length >= 3, 'Q5: három külön, nevén nevezett megállás (tábla / oszlop / függvény)')
}

// ── Q6: a verifikációs rács ────────────────────────────────────────────────
{
  const racsIdx = TISZTA.search(/WITH\s+kerelem_sor\s+AS/)
  const racs = racsIdx >= 0 ? TISZTA.slice(racsIdx) : ''
  assert(racsIdx >= 0 && (racs.match(/UNION ALL/g) ?? []).length >= 6, 'Q6: a rács EGY UNION ALL-lánc (a szerkesztő csak az utolsó rácsot mutatja)')
  assert(
    /0 kell/.test(SQL.slice(SQL.indexOf('WITH kerelem_sor'))) && new RegExp(`(?<![.\\w])${ELDOLT_IN_SRC}\\s+AND\\s+megoldva\\s+IS\\s+DISTINCT\\s+FROM\\s+true`).test(racs),
    'Q6: a „0 kell" sor UGYANAZT a fehérlistás predikátumot méri, mint az UPDATE WHERE-je',
  )
  const racsKapcs = kapcsolasRe('ON\\s+r\\.id\\s*=\\s*').exec(racs)
  assert(!!racsKapcs && Number(racsKapcs[1]) === ELOTAG.length + 1, 'Q6: a rács kapcsolása = az UPDATE kapcsolása (oszlop + régi hivatkozás, ugyanaz a regex és substr-pozíció)')
  for (const szerep of ['authenticated', 'service_role', 'anon']) {
    assert(new RegExp(`has_function_privilege\\('${szerep}'`).test(racs), `Q6: has_function_privilege mérés — ${szerep}`)
  }
  assert(/has_function_privilege\('anon'[\s\S]*?THEN\s+'❌/.test(racs), 'Q6: az anon EXECUTE-ja a rácsban ❌ (fordított logika: a jog HIÁNYA a jó)')
}

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
process.exit(failedCount > 0 ? 1 : 0)
