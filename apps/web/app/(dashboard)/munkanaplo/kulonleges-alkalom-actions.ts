'use server'

/**
 * Különleges gyülekezeti alkalmak — server actions (2026-08-11, 6. kör).
 *
 * Tábla: kulonleges_alkalom
 *   (migration-docs/sql/2026-08-11-kulonleges-alkalmak.sql).
 * Amíg a migráció nincs lefuttatva, minden action `{ needsSql: true }`-t ad —
 * a felület barátságos magyar üzenettel degradál, SOHA nem hasal el.
 *
 * FAIL-CLOSED
 *   Aktív gyülekezet nélkül NINCS lista és NINCS mentés. A `congregation_id`
 *   szűrő MINDEN lekérdezésen és MINDEN íráson rajta van — a `.eq()` nem opció,
 *   a NULL skalár + „ha van id, szűrj" minta szivárgás-osztály (3. kör).
 *
 * MIT NEM CSINÁL — TUDATOSAN
 *   · NEM ír a `gyulekezeti_programok` táblába (a `teljesitett` pipát sem
 *     olvassa és nem is állítja: az sorozat-szintű, nem auditált, és nem a
 *     „megtörtént-e" kérdés válasza).
 *   · NEM tesz automatikussá jelentés-rubrikát — csak javaslat-forrás.
 *   · NINCS véglegesítés-kapu: a hivatalos szám a lelkeszi_jelentes snapshotban
 *     fagy be, egy utólag rögzített alkalom nem tud beküldött számot elmozdítani.
 *     A zárolás csak a jogos „elfelejtettem a márciusi koncertet" esetet blokkolná.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  URES_OSSZESITES,
  kerdezendoTipus,
  ketertelmuTipus,
  maiDatum,
  szamolOsszesites,
  type KulonlegesAllapot,
  type KulonlegesListaResult,
  type KulonlegesTetel,
  type KulonlegesValaszInput,
} from '@/lib/worklog/kulonleges-alkalom-shared'

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/

const valaszSchema = z.object({
  id: z.string().uuid().optional(),
  programId: z.string().uuid().nullable().optional(),
  tervezettDatum: z.string().regex(DATUM_RE, 'Érvénytelen tervezett dátum.'),
  tenylegesDatum: z.string().regex(DATUM_RE, 'Érvénytelen tényleges dátum.').nullable().optional(),
  cim: z.string().min(1, 'Az alkalom megnevezése kötelező.').max(300, 'A megnevezés túl hosszú.'),
  allapot: z.enum(['megtartva', 'elmaradt', 'nem_kulonleges']),
  szeretetvendegseg: z.boolean().optional(),
  resztvevok: z
    .number()
    .int('A létszám csak egész szám lehet.')
    .min(0, 'A létszám nem lehet negatív.')
    .max(100000, 'Ez a létszám nem életszerű.')
    .nullable()
    .optional(),
  megjegyzes: z.string().max(2000, 'A megjegyzés túl hosszú.').nullable().optional(),
})

const MIGRACIO_UZENET =
  'A különleges alkalmak nyilvántartása még nincs bekapcsolva. ' +
  'Futtasd le a 2026-08-11-es „különleges alkalmak" adatbázis-migrációt ' +
  '(migration-docs/sql/2026-08-11-kulonleges-alkalmak.sql), majd nyisd meg újra ezt az ablakot.'

/** A tábla még nem létezik (a migráció nincs lefuttatva)? */
function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205') return true
  const m = (err.message || '').toLowerCase()
  return (
    m.includes('kulonleges_alkalom') &&
    (m.includes('does not exist') || m.includes('schema cache'))
  )
}

/** Egyedi-index ütközés (ugyanarra a naptár-sorra már van élő válasz). */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return (
    err.code === '23505' ||
    (err.message || '').includes('uq_kulonleges_alkalom_program') ||
    // A 2026-08-11 előtti, dátumos index neve — ha valahol még az él.
    (err.message || '').includes('uq_kulonleges_alkalom_terv')
  )
}

/**
 * RLS-tiltás (42501) → MAGYAR mondat.
 *
 * 2026-08-11 (6. kör, reviewer-major): a nyers
 * „new row violates row-level security policy for table …" angol Postgres-üzenet
 * a lelkésznek értelmezhetetlen. A tipikus ok: profilváltás után egy olyan
 * gyülekezetbe ír, amihez a policy nem enged — ilyenkor a teendő PROFILVÁLTÁS,
 * nem hibajelentés.
 */
function jogosultsagUzenet(err: { code?: string; message?: string } | null): string | null {
  if (!err) return null
  const m = (err.message || '').toLowerCase()
  if (err.code === '42501' || m.includes('row-level security')) {
    return (
      'Ehhez a gyülekezethez most nincs jogosultságod a mentéshez. ' +
      'Válts profilt a jobb felső menüben arra a gyülekezetre, amelyikhez ez az alkalom tartozik, ' +
      'majd próbáld újra. Ha továbbra sem megy, jelezd a rendszergazdának.'
    )
  }
  return null
}

/** Egységes hibaüzenet a mentési ágakhoz: magyar mondat, ha van; különben a nyers ok. */
function mentesHiba(err: { code?: string; message?: string }, elotag: string): string {
  return jogosultsagUzenet(err) || `${elotag}: ${err.message}`
}

type ProgramSor = {
  id: string
  cim: string | null
  datum: string | null
  helyszin: string | null
  tipus: string | null
  ismetlodes_tipus: string | null
}

type ValaszSor = {
  id: string
  program_id: string | null
  tervezett_datum: string | null
  tenyleges_datum: string | null
  cim: string | null
  szeretetvendegseg: boolean | null
  allapot: string | null
  resztvevok: number | null
  megjegyzes: string | null
  ev: number | null
}

/**
 * Párosító kulcs: EGY naptár-sor = EGY válasz.
 *
 * 2026-08-11 (6. kör, reviewer-major): a kulcsból KIKERÜLT a tervezett dátum.
 * Korábban `(program_id, tervezett_datum)` volt — a tervezett napot AZONOSSÁGNAK
 * kezelte, pedig az ADAT. Ha a lelkész a naptárban áthelyezte az alkalmat
 * (dec. 14. → dec. 21.), a válasz a régi napon maradt: az (a) ág a programot ÚJ,
 * megválaszolatlan tételként vette fel, a (b) ág pedig a régi választ KÜLÖN
 * sorként hozta vissza. Ugyanaz az alkalom kétszer, jelzés nélkül — és mindkettő
 * megerősítve KÉT élő „megtartva" sor, amit az összesítés kétszer számolt.
 * Egy aláírt, az egyházmegyének beküldött nyomtatvány mellé kínált szám
 * felfelé hamisítása.
 */
function parKulcs(programId: string): string {
  return `prog:${programId}`
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Lista + összesítés
// ─────────────────────────────────────────────────────────────────────────

/**
 * Az adott ÉV megerősítendő / megerősített különleges alkalmai.
 *
 * KÉT lekérdezés, mindkettő `selectAllPaged`-del (a néma 1000 soros csonkítás
 * ellen), determinisztikus `id` rendezéssel:
 *  (a) `gyulekezeti_programok` — CSAK a NEM ismétlődő tételek (`ismetlodes_tipus
 *      IS NULL`) az év ablakában. Az ismétlődő sorozat (heti bibliaóra) EGY sor
 *      52 alkalommal: rutin, és sorozat-szinten megerősíteni súlyos hamis szám
 *      lenne. Ezért NEM a `getProgramsForYear`-t hívjuk — az szándékosan
 *      visszahozza a korábbi évek sorozatait is.
 *  (b) `kulonleges_alkalom` — az év tervezett-ablaka VAGY a generált `ev` oszlop
 *      (így az évhatáron átcsúszott alkalom is a HELYES év listáján jelenik meg).
 */
export async function listKulonlegesAlkalmak(ev: number): Promise<KulonlegesListaResult> {
  const ures = { tetelek: [], osszesites: { ...URES_OSSZESITES } }
  if (!Number.isInteger(ev) || ev < 1900 || ev > 2200) {
    return { ...ures, error: 'Érvénytelen év.' }
  }

  const { supabase, congregationId } = await getEffectiveCongregationContext()
  // FAIL-CLOSED: aktív gyülekezet nélkül üres lista + HANGOS üzenet (a néma
  // szűretlen lista a 3. kör szivárgás-hibaosztálya).
  if (!congregationId) {
    return { ...ures, error: 'Nincs aktív gyülekezet kiválasztva.' }
  }

  const evStart = `${ev}-01-01`
  const evEnd = `${ev}-12-31`

  const [programRes, valaszRes] = await Promise.all([
    selectAllPaged<ProgramSor>(
      supabase
        .from('gyulekezeti_programok')
        .select('id, cim, datum, helyszin, tipus, ismetlodes_tipus')
        .eq('congregation_id', congregationId)
        .is('ismetlodes_tipus', null)
        .gte('datum', evStart)
        .lte('datum', evEnd),
    ),
    selectAllPaged<ValaszSor>(
      supabase
        .from('kulonleges_alkalom')
        .select(
          'id, program_id, tervezett_datum, tenyleges_datum, cim, szeretetvendegseg, allapot, resztvevok, megjegyzes, ev',
        )
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .or(
          `and(tervezett_datum.gte.${evStart},tervezett_datum.lte.${evEnd}),ev.eq.${ev}`,
        ),
    ),
  ])

  if (valaszRes.error) {
    if (isMissingTableError(valaszRes.error)) {
      return { ...ures, needsSql: true, error: MIGRACIO_UZENET }
    }
    return { ...ures, error: `A különleges alkalmak betöltése sikertelen: ${valaszRes.error.message}` }
  }
  if (programRes.error) {
    return { ...ures, error: `A naptár betöltése sikertelen: ${programRes.error.message}` }
  }

  const programok = programRes.data.filter((p) => !!p.datum)
  const programById = new Map(programok.map((p) => [p.id, p]))

  // Válaszok NAPTÁR-SOR szerint. Ha egy programra (a 2026-08-11 előtti, dátumos
  // egyedi index hagyatékaként) mégis TÖBB élő sor volna, ITT egyesítjük: a
  // legutóbb tervezett marad, és a tétel `duplikaltValasz` jelzőt kap — a
  // felület HANGOSAN kiírja. Némán soha nem számolhatunk kétszer.
  const valaszByProgram = new Map<string, ValaszSor>()
  const duplikaltProgramok = new Set<string>()
  const programNelkuli: ValaszSor[] = []
  for (const v of valaszRes.data) {
    if (!(v.tervezett_datum || '').slice(0, 10)) continue
    if (!v.program_id) {
      programNelkuli.push(v)
      continue
    }
    const meglevo = valaszByProgram.get(v.program_id)
    if (!meglevo) {
      valaszByProgram.set(v.program_id, v)
      continue
    }
    duplikaltProgramok.add(v.program_id)
    const a = (meglevo.tervezett_datum || '').slice(0, 10)
    const b = (v.tervezett_datum || '').slice(0, 10)
    if (b > a) valaszByProgram.set(v.program_id, v)
  }

  const tetelek: KulonlegesTetel[] = []
  const felhasznaltValasz = new Set<string>()

  // (a) A naptár nem ismétlődő tételei — csak a KÜLÖNLEGES/kétértelmű típusok,
  //     plusz minden olyan, amire már VAN válasz (a lelkész keze mindig erősebb).
  for (const p of programok) {
    const terv = (p.datum || '').slice(0, 10)
    const v = valaszByProgram.get(p.id) || null
    if (!v && !kerdezendoTipus(p.tipus)) continue
    if (v) felhasznaltValasz.add(parKulcs(p.id))
    const allapot = (v?.allapot as KulonlegesAllapot | undefined) || null
    // A naptárban áthelyezett tétel: a válasz a RÉGI napon áll. NEM új sor —
    // ugyanaz az alkalom. A tervezett nap a naptár mai állása; a következő
    // mentés a válasz `tervezett_datum`-át is erre igazítja.
    const regiTerv = (v?.tervezett_datum || '').slice(0, 10)
    tetelek.push({
      id: v?.id || null,
      programId: p.id,
      tervezettDatum: terv,
      tenylegesDatum: v?.tenyleges_datum ? v.tenyleges_datum.slice(0, 10) : null,
      // A cím MÁSOLATA erősebb: a naptár-sor utólag átnevezhető, a rögzített
      // alkalom megnevezése nem változhat a lelkész háta mögött.
      cim: (v?.cim || p.cim || 'Névtelen alkalom').trim(),
      tipus: p.tipus || null,
      helyszin: p.helyszin || null,
      szeretetvendegseg: v?.szeretetvendegseg === true,
      allapot,
      resztvevok: v?.resztvevok ?? null,
      megjegyzes: v?.megjegyzes || null,
      ev: v?.ev ?? null,
      naptarbolTorolve: false,
      athelyezveRolo: !!v && !!regiTerv && regiTerv !== terv ? regiTerv : null,
      duplikaltValasz: duplikaltProgramok.has(p.id),
      masEvbe: v?.ev != null && v.ev !== ev,
      ketertelmu: ketertelmuTipus(p.tipus),
    })
  }

  // (b) A maradék válaszok: kézzel hozzáadott alkalmak (program_id = NULL),
  //     illetve olyan tervek, amelyek naptár-sora már nincs meg ebben az évben
  //     (törölték, vagy másik évbe helyezték) — ezek SOHA nem tűnhetnek el.
  for (const v of [...programNelkuli, ...valaszByProgram.values()]) {
    if (v.program_id && felhasznaltValasz.has(parKulcs(v.program_id))) continue
    const terv = (v.tervezett_datum || '').slice(0, 10)
    if (!terv) continue
    const evbenTervezve = terv >= evStart && terv <= evEnd
    tetelek.push({
      id: v.id,
      programId: v.program_id,
      tervezettDatum: terv,
      tenylegesDatum: v.tenyleges_datum ? v.tenyleges_datum.slice(0, 10) : null,
      cim: (v.cim || 'Névtelen alkalom').trim(),
      tipus: null,
      helyszin: null,
      szeretetvendegseg: v.szeretetvendegseg === true,
      allapot: (v.allapot as KulonlegesAllapot | null) || null,
      resztvevok: v.resztvevok ?? null,
      megjegyzes: v.megjegyzes || null,
      ev: v.ev ?? null,
      naptarbolTorolve: !!v.program_id && !programById.has(v.program_id) && evbenTervezve,
      athelyezveRolo: null,
      duplikaltValasz: !!v.program_id && duplikaltProgramok.has(v.program_id),
      masEvbe: v.ev != null && v.ev !== ev,
      ketertelmu: false,
    })
  }

  // Időrend: a tervezett nap szerint, azonos napon a cím szerint (stabil).
  tetelek.sort((a, b) =>
    a.tervezettDatum === b.tervezettDatum
      ? a.cim.localeCompare(b.cim, 'hu')
      : a.tervezettDatum.localeCompare(b.tervezettDatum),
  )

  return { tetelek, osszesites: szamolOsszesites(tetelek, ev, maiDatum()) }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Válasz mentése (megvolt / nem volt / ne kérdezd többé)
// ─────────────────────────────────────────────────────────────────────────

type MentesEredmeny = { id?: string; error?: string; needsSql?: boolean }

/**
 * Egy tervezett alkalom megerősítése. Idempotens: ugyanarra a tervre a második
 * hívás FRISSÍT (a DB egyedi indexe a kettős számolás őre).
 */
export async function saveKulonlegesValasz(input: KulonlegesValaszInput): Promise<MentesEredmeny> {
  return mentValasz(input, false)
}

/**
 * Utólag rögzített (nem betervezett) különleges alkalom. `program_id = NULL`,
 * ezért belőle ugyanarra a napra több is lehet (két alkalom egy napon).
 */
export async function addKulonlegesAlkalom(input: KulonlegesValaszInput): Promise<MentesEredmeny> {
  return mentValasz({ ...input, id: undefined, programId: null }, true)
}

async function mentValasz(
  input: KulonlegesValaszInput,
  ujAlkalom: boolean,
): Promise<MentesEredmeny> {
  const parsed = valaszSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const programId = ujAlkalom ? null : d.programId || null

  // ŐR: ismétlődő sorozatra SOHA nem születhet megerősítés. A heti bibliaóra
  // EGY naptár-sor 52 alkalommal — sorozat-szinten „megvolt"-ra billentve egy
  // kattintás 52 alkalmat állítana egynek (vagy egyet ötvenkettőnek). Ezt
  // SZERVER-OLDALON zárjuk, nem csak a UI-ban.
  if (programId) {
    const { data: prog, error: progErr } = await supabase
      .from('gyulekezeti_programok')
      .select('id, ismetlodes_tipus, congregation_id')
      .eq('id', programId)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    if (progErr) return { error: `A naptár-tétel ellenőrzése sikertelen: ${progErr.message}` }
    if (!prog) {
      return { error: 'Ez a naptár-tétel nem található ebben a gyülekezetben.' }
    }
    if ((prog as { ismetlodes_tipus: string | null }).ismetlodes_tipus) {
      return {
        error:
          'Az ismétlődő sorozat rutin alkalom (pl. heti bibliaóra) — arra nem kérdezünk rá. ' +
          'Ha ebből egy konkrét alkalom mégis különleges volt, vedd fel külön alkalomként.',
      }
    }
  }

  const megtartva = d.allapot === 'megtartva'
  // Megtartott alkalomnak KELL tényleges dátum — alap: a tervezett nap. A többi
  // állapotnál NULL (a DB CHECK-jei is ezt várják).
  const tenyleges = megtartva ? d.tenylegesDatum || d.tervezettDatum : null

  const record: Record<string, unknown> = {
    congregation_id: congregationId,
    program_id: programId,
    tervezett_datum: d.tervezettDatum,
    tenyleges_datum: tenyleges,
    cim: d.cim.trim(),
    // A létszám / szeretetvendégség-jelölés csak megtartott alkalmon értelmes.
    szeretetvendegseg: megtartva ? d.szeretetvendegseg === true : false,
    allapot: d.allapot,
    resztvevok: megtartva ? (d.resztvevok ?? null) : null,
    megjegyzes: (d.megjegyzes || '').trim() || null,
    updated_at: new Date().toISOString(),
    deleted: false,
  }

  // ── UPDATE (ismert sor) ──
  if (d.id) {
    const { data, error } = await supabase
      .from('kulonleges_alkalom')
      .update(record)
      .eq('id', d.id)
      .eq('congregation_id', congregationId)
      .select('id')
    if (error) {
      if (isMissingTableError(error)) return { needsSql: true, error: MIGRACIO_UZENET }
      return { error: mentesHiba(error, 'A mentés nem sikerült') }
    }
    if (!data || data.length === 0) {
      return { error: 'Ez a bejegyzés időközben eltűnt — frissítsd a listát, és próbáld újra.' }
    }
    revalidatePath('/munkanaplo')
    return { id: d.id }
  }

  // ── INSERT, ütközésnél FRISSÍTÉS ──
  const { data: ins, error: insErr } = await supabase
    .from('kulonleges_alkalom')
    .insert({
      ...record,
      rogzitette_id: user.id,
      rogzitette_nev: fullName || '',
    })
    .select('id')
    .maybeSingle()

  if (!insErr) {
    revalidatePath('/munkanaplo')
    return { id: (ins as { id: string } | null)?.id }
  }
  if (isMissingTableError(insErr)) return { needsSql: true, error: MIGRACIO_UZENET }

  // Ugyanarra a NAPTÁR-SORRA már van élő válasz (két megnyitott lap, kettős
  // koppintás, vagy a naptárban időközben áthelyezett dátum) → NEM hibázunk,
  // hanem frissítjük. Ez a DB-őr és a UI közti helyes találkozás.
  // 2026-08-11 (6. kör, reviewer-major): a `tervezett_datum` szűrő KIKERÜLT —
  // az egyedi index (congregation_id, program_id) párja pontosan ez a WHERE,
  // és a régi, dátumos változat a mozgatott naptár-tételnél SOSEM talált volna
  // sort (a `.update()` 0 sort ír, a hívó mégis sikert lát).
  if (isUniqueViolation(insErr) && programId) {
    const { data: upd, error: updErr } = await supabase
      .from('kulonleges_alkalom')
      .update(record)
      .eq('congregation_id', congregationId)
      .eq('program_id', programId)
      .eq('deleted', false)
      .select('id')
    if (updErr) return { error: mentesHiba(updErr, 'A mentés nem sikerült') }
    if (!upd || upd.length === 0) {
      return {
        error:
          'A mentés nem sikerült: erre a naptár-tételre már van válasz, de nem sikerült megnyitni. ' +
          'Frissítsd a listát, és próbáld újra.',
      }
    }
    revalidatePath('/munkanaplo')
    return { id: (upd[0] as { id: string }).id }
  }

  return { error: mentesHiba(insErr, 'A mentés nem sikerült') }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Válasz visszavonása (soft delete)
// ─────────────────────────────────────────────────────────────────────────

/**
 * A válasz visszavonása — SOFT delete. A tervezett alkalom ezután újra
 * megválaszolatlanként jelenik meg a listán (a naptár-tétel érintetlen).
 */
export async function torolKulonlegesValasz(
  id: string,
): Promise<{ success?: true; error?: string; needsSql?: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Érvénytelen azonosító.' }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const { error } = await supabase
    .from('kulonleges_alkalom')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('congregation_id', congregationId)

  if (error) {
    if (isMissingTableError(error)) return { needsSql: true, error: MIGRACIO_UZENET }
    return { error: mentesHiba(error, 'A visszavonás nem sikerült') }
  }
  revalidatePath('/munkanaplo')
  return { success: true }
}
