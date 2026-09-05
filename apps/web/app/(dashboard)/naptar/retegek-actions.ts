'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { isMissingRpcError } from '@/lib/profiles/officials'
import type {
  AnyakonyviEsemeny,
  NaptarRetegek,
  NevnapEsemeny,
  SzuletesnapEsemeny,
} from '@/lib/calendar/naptar-retegek-types'
import { ANYAKONYV_TABLA_CIMKE } from '@/lib/calendar/naptar-retegek-types'
// MÉLY import (nem a barrel!): a barrel 'use client' komponenseket is exportál,
// ezt a fájlt viszont szerver-akció húzza. Ugyanaz a minta, mint a
// lib/calendar/pastoral-events.ts-ben.
import { formatNameWithPrefix } from '@kartoteka/ui-app/src/members/name-format'

/**
 * NAPTÁR-RÉTEGEK — egy év anyakönyvi eseményei, születésnapjai és névnapjai
 * (2026-09-05).
 *
 * EGY IGAZSÁGFORRÁS: ez az akció OLVAS az anyakönyvből és a tagnyilvántartásból;
 * semmit nem másol programmá. A csempe, az éves nyomtatvány és a születésnapos
 * naptár mind innen kapja a rétegeket.
 *
 * HATÓKÖR: a bejelentkezett felhasználó aktív gyülekezete
 * (getEffectiveCongregationContext) — az RLS a saját jogán szűr, a
 * naptar_szemely_* függvények SECURITY INVOKER-ek.
 *
 * FAIL-SOFT rétegenként: ha egy forrás nem elérhető (pl. a 2026-09-05-ös SQL
 * még nem futott le), a többi réteg attól még megjön, és a hiba EMBERI
 * üzenetként utazik a felületre — soha nem néma üres lista.
 *
 * SZEMÉLYES ADAT: a visszaadott nevek CSAK az alkalmazásban jelennek meg. A
 * nyilvános weboldal és az ICS-feed sosem hívja ezt.
 */

const EV_MIN = 1900
const EV_MAX = 2100

type SzemelyMini = { id: number; csaladnev: string | null; k_nev: string | null; namepattern?: string | null; allapot?: string | null } | null

function nev(sz: SzemelyMini): string {
  if (!sz) return '(ismeretlen)'
  return formatNameWithPrefix({ csaladnev: sz.csaladnev, k_nev: sz.k_nev, namepattern: sz.namepattern ?? null, allapot: sz.allapot ?? null })
}

/** 'YYYY-MM-DD' egy date VAGY timestamp-without-tz sztringből — időzóna-konverzió NÉLKÜL. */
function napKulcs(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1] : null
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Az évforduló napja a CÉLÉVBEN; febr. 29. nem szökőévben febr. 28-ra csúszik (a lelkészi feed szabálya). */
function evfordulo(honap: number, nap: number, ev: number): string | null {
  if (!Number.isInteger(honap) || !Number.isInteger(nap) || honap < 1 || honap > 12) return null
  if (nap < 1 || nap > DAYS_IN_MONTH[honap - 1]) return null
  const d = honap === 2 && nap === 29 && !isLeap(ev) ? 28 : nap
  return `${ev}-${String(honap).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export async function getNaptarRetegek(year: number): Promise<NaptarRetegek> {
  const ev = Number.isInteger(year) ? Math.min(EV_MAX, Math.max(EV_MIN, year)) : new Date().getFullYear()
  const ures: NaptarRetegek = { ev, anyakonyv: [], szuletesnapok: [], nevnapok: [], hibak: [] }

  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return ures

  const tol = `${ev}-01-01`
  const ig = `${ev + 1}-01-01`

  // ── 1) Anyakönyvi tények az évben ────────────────────────────────────────
  const anyakonyv: AnyakonyviEsemeny[] = []
  const hibak: NaptarRetegek['hibak'] = []

  const [ker, haz, konf, tem, linkek] = await Promise.all([
    supabase
      .from('keresztseg')
      .select('id, datum, lelkeszneve, szemely:szemely!id_szemely(id, csaladnev, k_nev, namepattern, allapot)')
      .eq('congregation_id', congregationId)
      .gte('datum', tol)
      .lt('datum', ig)
      .order('datum'),
    supabase
      .from('hazassag')
      .select('id, datum, lelkeszneve, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, namepattern, allapot), no:szemely!id_no(id, csaladnev, k_nev, namepattern, allapot)')
      .eq('congregation_id', congregationId)
      .gte('datum', tol)
      .lt('datum', ig)
      .order('datum'),
    supabase
      .from('konfirmalas')
      .select('id, datum, lelkeszneve, szemely:szemely!id_szemely(id, csaladnev, k_nev, namepattern, allapot)')
      .eq('congregation_id', congregationId)
      .gte('datum', tol)
      .lt('datum', ig)
      .order('datum'),
    supabase
      .from('temetes')
      .select('id, tdatum, hdatum, lelkeszneve, szemely:szemely!id_szemely(id, csaladnev, k_nev, namepattern, allapot)')
      .eq('congregation_id', congregationId)
      .gte('tdatum', tol)
      .lt('tdatum', ig)
      .order('tdatum'),
    // A tervezett program ⇄ anyakönyvi sor kapcsolatok (a 2026-09-05-ös oszlopok).
    // Ha az oszlop még nincs, ez hibát ad — fail-soft: kapcsolat nélkül megyünk tovább.
    supabase
      .from('gyulekezeti_programok')
      .select('id, anyakonyv_tabla, anyakonyv_id')
      .eq('congregation_id', congregationId)
      .not('anyakonyv_id', 'is', null),
  ])

  const linkTerkep = new Map<string, string>()
  if (!linkek.error) {
    for (const l of (linkek.data ?? []) as Array<{ id: string; anyakonyv_tabla: string | null; anyakonyv_id: number | null }>) {
      if (l.anyakonyv_tabla && l.anyakonyv_id != null) linkTerkep.set(`${l.anyakonyv_tabla}:${l.anyakonyv_id}`, l.id)
    }
  }

  const anyakonyvHiba = [ker.error, haz.error, konf.error, tem.error].find(Boolean)
  if (anyakonyvHiba) {
    hibak.push({ reteg: 'anyakonyv', uzenet: `Az anyakönyvi események nem tölthetők be: ${anyakonyvHiba.message}` })
  }

  for (const r of (ker.data ?? []) as unknown as Array<{ id: number; datum: string; lelkeszneve: string | null; szemely: SzemelyMini }>) {
    const datum = napKulcs(r.datum)
    if (!datum) continue
    const n = nev(r.szemely)
    anyakonyv.push({
      kulcs: `keresztseg:${r.id}`, tabla: 'keresztseg', id: r.id, datum,
      cim: `${ANYAKONYV_TABLA_CIMKE.keresztseg} — ${n}`, nevek: [n], lelkesz: r.lelkeszneve,
      programId: linkTerkep.get(`keresztseg:${r.id}`) ?? null,
    })
  }
  for (const r of (haz.data ?? []) as unknown as Array<{ id: number; datum: string; lelkeszneve: string | null; ferfi: SzemelyMini; no: SzemelyMini }>) {
    const datum = napKulcs(r.datum)
    if (!datum) continue
    const n1 = nev(r.ferfi)
    const n2 = nev(r.no)
    anyakonyv.push({
      kulcs: `hazassag:${r.id}`, tabla: 'hazassag', id: r.id, datum,
      cim: `${ANYAKONYV_TABLA_CIMKE.hazassag} — ${n1} és ${n2}`, nevek: [n1, n2], lelkesz: r.lelkeszneve,
      programId: linkTerkep.get(`hazassag:${r.id}`) ?? null,
    })
  }
  // Konfirmáció: a tömeges anyakönyvezés N sort ad EGY alkalomra — a naptár
  // egy eseményt mutat („Konfirmáció — 12 fő"), a nevekkel. Az azonosító az
  // első sor id-ja; a program-kapcsolat bármelyik sor id-ján állhat.
  {
    const napok = new Map<string, Array<{ id: number; lelkeszneve: string | null; szemely: SzemelyMini }>>()
    for (const r of (konf.data ?? []) as unknown as Array<{ id: number; datum: string; lelkeszneve: string | null; szemely: SzemelyMini }>) {
      const datum = napKulcs(r.datum)
      if (!datum) continue
      if (!napok.has(datum)) napok.set(datum, [])
      napok.get(datum)!.push({ id: r.id, lelkeszneve: r.lelkeszneve, szemely: r.szemely })
    }
    for (const [datum, sorok] of napok) {
      const nevek = sorok.map((r) => nev(r.szemely)).sort((a, b) => a.localeCompare(b, 'hu'))
      const elso = sorok[0]
      const programId = sorok.map((r) => linkTerkep.get(`konfirmalas:${r.id}`)).find(Boolean) ?? null
      anyakonyv.push({
        kulcs: `konfirmalas:${elso.id}`, tabla: 'konfirmalas', id: elso.id, datum,
        cim: sorok.length === 1
          ? `${ANYAKONYV_TABLA_CIMKE.konfirmalas} — ${nevek[0]}`
          : `${ANYAKONYV_TABLA_CIMKE.konfirmalas} — ${sorok.length} fő`,
        nevek, lelkesz: elso.lelkeszneve, programId,
      })
    }
  }
  for (const r of (tem.data ?? []) as unknown as Array<{ id: number; tdatum: string; hdatum: string | null; lelkeszneve: string | null; szemely: SzemelyMini }>) {
    const datum = napKulcs(r.tdatum)
    if (!datum) continue
    const n = nev(r.szemely)
    anyakonyv.push({
      kulcs: `temetes:${r.id}`, tabla: 'temetes', id: r.id, datum,
      cim: `${ANYAKONYV_TABLA_CIMKE.temetes} — ${n}`, nevek: [n], lelkesz: r.lelkeszneve,
      programId: linkTerkep.get(`temetes:${r.id}`) ?? null,
    })
  }
  anyakonyv.sort((a, b) => (a.datum === b.datum ? a.kulcs.localeCompare(b.kulcs) : a.datum.localeCompare(b.datum)))

  // ── 2) Személy-alap + névnapok a KÖZÖS SQL-függvényekből ─────────────────
  const szuletesnapok: SzuletesnapEsemeny[] = []
  const nevnapok: NevnapEsemeny[] = []

  const [alapRes, nevnapRes] = await Promise.all([
    supabase.rpc('naptar_szemely_alap', { p_congregation: congregationId }),
    supabase.rpc('naptar_szemely_nevnapok', { p_congregation: congregationId }),
  ])

  type AlapSor = { szemely_id: number; csaladnev: string | null; k_nev: string | null; namepattern: string | null; allapot: string | null; ferfi: boolean | null; sz_datum: string | null }
  const alapTerkep = new Map<number, AlapSor>()

  if (alapRes.error) {
    const uzenet = isMissingRpcError(alapRes.error, 'naptar_szemely_alap')
      ? 'A születésnapos réteg még nincs bekapcsolva az adatbázisban — futtasd le a migration-docs/sql/2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql fájlt.'
      : `A születésnapok nem tölthetők be: ${alapRes.error.message}`
    hibak.push({ reteg: 'szuletesnapok', uzenet })
  } else {
    for (const s of (alapRes.data ?? []) as AlapSor[]) {
      alapTerkep.set(s.szemely_id, s)
      const szul = napKulcs(s.sz_datum)
      if (!szul) continue
      const [y, m, d] = szul.split('-').map(Number)
      const kor = ev - y
      if (kor <= 0) continue
      const datum = evfordulo(m, d, ev)
      if (!datum) continue
      szuletesnapok.push({
        kulcs: `szul:${s.szemely_id}:${ev}`,
        szemelyId: s.szemely_id,
        datum,
        nev: nev({ id: s.szemely_id, csaladnev: s.csaladnev, k_nev: s.k_nev, namepattern: s.namepattern, allapot: s.allapot }),
        kor,
        ferfi: s.ferfi,
      })
    }
    szuletesnapok.sort((a, b) => (a.datum === b.datum ? a.nev.localeCompare(b.nev, 'hu') : a.datum.localeCompare(b.datum)))
  }

  if (nevnapRes.error) {
    const uzenet = isMissingRpcError(nevnapRes.error, 'naptar_szemely_nevnapok')
      ? 'A névnapos réteg még nincs bekapcsolva az adatbázisban — futtasd le a migration-docs/sql/2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql fájlt.'
      : `A névnapok nem tölthetők be: ${nevnapRes.error.message}`
    hibak.push({ reteg: 'nevnapok', uzenet })
  } else if (!alapRes.error) {
    type NevnapSor = { szemely_id: number; honap: number; nap: number; nev: string; elsodleges: boolean }
    for (const r of (nevnapRes.data ?? []) as NevnapSor[]) {
      const alap = alapTerkep.get(r.szemely_id)
      if (!alap) continue
      const datum = evfordulo(Number(r.honap), Number(r.nap), ev)
      if (!datum) continue
      nevnapok.push({
        kulcs: `nevnap:${r.szemely_id}:${r.honap}-${r.nap}:${ev}`,
        szemelyId: r.szemely_id,
        datum,
        nev: nev({ id: alap.szemely_id, csaladnev: alap.csaladnev, k_nev: alap.k_nev, namepattern: alap.namepattern, allapot: alap.allapot }),
        nevnapNev: r.nev,
        elsodleges: Boolean(r.elsodleges),
      })
    }
    nevnapok.sort((a, b) => (a.datum === b.datum ? a.nev.localeCompare(b.nev, 'hu') : a.datum.localeCompare(b.datum)))
  }

  return { ev, anyakonyv, szuletesnapok, nevnapok, hibak }
}

/**
 * A NAPTÁR-NYOMTATVÁNYOK NAPLÓZÁSA (2026-09-05, cal-birthday-8). Személyes
 * adat (név + életkor, anyakönyvi nevek) hagyja el a rendszert papíron — a
 * betekintés-kimutatás eddig ezt nem látta.
 *
 * EGY naplózó, KÉT csatorna (a bíráló találata: ugyanaz a réteg ment ki két
 * nyomtatványon, és csak az egyik naplózott):
 *   · `koszonto`  — születésnapos/névnapos naptár (mindig személyes adat);
 *   · `eves_terv` — az éves programterv LELKÉSZI példánya, ha bármelyik
 *                   személyes réteg (anyakönyv / születésnap / névnap) be van
 *                   kapcsolva. A gyülekezeti példányon réteg nincs (az építő
 *                   szűri), azt a hívó nem is naplózza.
 *
 * Az audit-kulcs CSAK a zárt térképből jöhet — a kliens által küldött szöveg
 * sosem válhat kulccsá. Az új kulcsnak a betekintés-szótárban
 * (`lib/export/betekintes-naplo.ts` MUVELET_MONDATOK) is lennie kell, különben
 * a kimutatás „ismeretlen műveletet" mond (őrszem: selftest-naptar-nyomtatvany F7b).
 *
 * Best-effort: SOHA nem dob, a nyomtatást nem blokkolja (a logAuditEvent maga
 * is lenyeli a hibáit) — a `logCnpFelfedes` (tagnyilvantartas/cnp-actions.ts)
 * mintája. A `szurok` a modál beállításai (változat, kapcsolók, hónap-
 * tartomány, tételszámok, lapszám) — így a naplóból látszik, MI ment ki, nem
 * csak hogy.
 */
const NYOMTATVANY_NAPLO_KULCS = {
  koszonto: 'naptar.szuletesnapos_nyomtatas',
  eves_terv: 'naptar.eves_terv_nyomtatas',
} as const
type NaptarNyomtatvanyTipus = keyof typeof NYOMTATVANY_NAPLO_KULCS

export async function naplozNaptarNyomtatas(input: {
  tipus: NaptarNyomtatvanyTipus
  ev: number
  szurok: Record<string, unknown>
}): Promise<void> {
  try {
    const action = input && Object.prototype.hasOwnProperty.call(NYOMTATVANY_NAPLO_KULCS, input.tipus)
      ? NYOMTATVANY_NAPLO_KULCS[input.tipus]
      : null
    if (!action) return
    const ev = Number(input.ev)
    if (!Number.isInteger(ev) || ev < EV_MIN || ev > EV_MAX) return
    const { user, congregationId } = await getEffectiveCongregationContext()
    if (!user || !congregationId) return
    // Csak egyszerű értékek mennek a naplóba (a metadata jsonb — ne nőjön).
    const szurok: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(input.szurok ?? {})) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') szurok[k] = v
    }
    // Dinamikus import: a napló-modul `server-only` — ez a fájl szerver-akció,
    // a fejléc importjai a réteg-olvasóé maradnak.
    const { logAuditEvent } = await import('@/lib/audit/log')
    await logAuditEvent({
      action,
      // A betekintés-kimutatás a személyre vonatkozik: az anyakönyvi nevek is
      // a `szemely` sorokból jönnek (join), ezért mindkét fajtánál ez a cél.
      targetTable: 'szemely',
      metadata: { tipus: input.tipus, ev, szurok },
    })
  } catch {
    // Csendes — a naplózási hiba nem akadályozhatja a nyomtatást.
  }
}
