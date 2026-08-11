import 'server-only'

/**
 * A MENTÉS-RENDSZER ŐRSZEME (2026-08-11).
 *
 * ─── MIÉRT NINCS KÜLÖN ŐRSZEM-CRON ─────────────────────────────────────────
 * A figyelmeztető sáv MAGA az őrszem: szerver-oldalon, OLDALBETÖLTÉSKOR
 * számolódik a `max(finished_at)`-ból. Nem attól függ, hogy a mentő kód
 * lefutott-e. Ha a cron törlődik, ha a deploy elromlik, ha a route 500-at ad —
 * a sáv AKKOR IS megjelenik, mert a HIÁNYBÓL számol.
 * A riasztás nem lakhat abban, amit figyel.
 *
 * ─── A ZÖLD BIZONYÍTÁSA ────────────────────────────────────────────────────
 * ⚠️ `status = 'ok'` ÖNMAGÁBAN NEM ELÉG. Csak az a mentés számít, amelyiket
 * a rendszer VISSZA IS OLVASTA a Drive-ról és a hash egyezett
 * (`drive_verified_at IS NOT NULL`). Egy „ok" sor igazolás nélkül PIROS.
 * Ez a modul soha nem állít elő zöldet, amit nem tud bizonyítani.
 *
 * ─── BEVALLOTT KORLÁT ──────────────────────────────────────────────────────
 * Ha senki nem lép be az alkalmazásba, a sávot senki nem látja. Ezért fut a
 * cron-szkript hibás kilépési kóddal, és ezért megy e-mail is.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'

import { bukarestiNapKulcs, huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

import { isMissingTableError } from './settings'
import {
  ELAVULT_ORA,
  KRITIKUS_ORA,
  type BackupHealth,
  type DailyCoverage,
  type PulseDay,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Dátum-segédek — Europe/Bucharest HELYI nap (a cron 02:00-kor fut ott)
// ─────────────────────────────────────────────────────────────────────────────

export function bukarestiNap(date: Date = new Date()): string {
  // 'en-CA' → YYYY-MM-DD. A napváltás a mentés naptári kulcsa, ezért a
  // szerver UTC-je NEM használható: 23:00 UTC-kor Bukarestben már holnap van.
  return bukarestiNapKulcs(date)
}

/** Naptári eltolás YYYY-MM-DD alakon (DST-független, mert nincs benne óra). */
export function napEltol(nap: string, napokkal: number): string {
  const [y, m, d] = nap.split('-').map((s) => Number(s))
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + napokkal * 86_400_000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

export function huNap(nap: string): string {
  const [y, m, d] = nap.split('-')
  return `${y}. ${m}. ${d}.`
}

/**
 * ⚠️ 2026-08-11 JAVÍTÁS — EZ A FÜGGVÉNY A SZERVER ZÓNÁJÁT HASZNÁLTA.
 *
 * A fájl `server-only`, tehát ez a formázás MINDIG a Railway-konténerben fut,
 * ahol nincs `TZ` beállítva → UTC. A tulajdonos ezért a kártya fejlécében
 * „15:32"-t látott, közvetlenül alatta viszont (a böngészőben formázott sorban)
 * „18:32"-t — ugyanarról az eseményről. A helyes érték a 18:32.
 *
 * Mostantól a formázás a KÖZÖS, Europe/Bucharest-re szögezett modulból jön, amit
 * a kliens-komponensek is ugyanígy használnak — így a két szám nem tud
 * széthúzni. ⛔ Kézi óra-eltolás TILOS: a különbség télen 2 óra, nem 3.
 */
export function huIdopont(iso: string | null): string {
  return huIdopontBukarest(iso, 'long')
}

// ─────────────────────────────────────────────────────────────────────────────
// A hatókör: melyik gyülekezetekre VÁRUNK mentést
// ─────────────────────────────────────────────────────────────────────────────

export interface ScopeInput {
  /** `null` = korlátlan (master / rendszergazda). Üres tömb = SEMMI. */
  congregationIds: string[] | null
}

interface CongregationRow {
  id: string
  name: string | null
  nev_hu: string | null
}

/** Az aktív gyülekezetek a hatókörben. Hiba esetén DOB — nem ad üres listát. */
export async function loadScopedCongregations(
  supabase: SupabaseClient,
  scope: ScopeInput,
): Promise<CongregationRow[]> {
  if (scope.congregationIds !== null && scope.congregationIds.length === 0) return []

  let query = supabase.from('congregations').select('id, name, nev_hu').eq('status', 'active')
  if (scope.congregationIds !== null) {
    query = query.in('id', scope.congregationIds)
  }
  const { data, error } = await query.order('id', { ascending: true })
  if (error) {
    // Néma nulla helyett hangos hiba: „0 gyülekezet, minden rendben" a
    // legrosszabb lehetséges válasz egy mentés-felügyelettől.
    throw new Error(`A gyülekezetek listája nem tölthető be: ${error.message}`)
  }
  return (data ?? []) as CongregationRow[]
}

export function congregationNev(c: CongregationRow): string {
  return (c.nev_hu || c.name || c.id).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Napló-lekérdezés
// ─────────────────────────────────────────────────────────────────────────────

interface LogSlice {
  id: number
  scope: 'gyulekezet' | 'globalis'
  congregation_id: string | null
  status: 'fut' | 'ok' | 'hiba'
  drive_verified_at: string | null
  run_date: string
  kind: string
}

/**
 * A 14 napos napló-szelet.
 *
 * ⚠️ LAPOZOTT OLVASÁS (2026-08-11 javítás). A szelet mérete
 * 14 nap × (gyülekezetek + 1) sor: 72 gyülekezet fölött ÁTLÉPI a PostgREST
 * 1000 soros plafonját, ami NÉMÁN csonkol. A csonkolt szeletből a lefedettség
 * „hiányzik"-ot mutatna olyan gyülekezetekre, amelyeknek megvan a mentése —
 * vagy fordítva. Egy felügyeleti kijelző, ami tévedhet, rosszabb a semminél.
 */
async function loadLogSlice(
  supabase: SupabaseClient,
  scope: ScopeInput,
  tolNap: string,
  igNap: string,
): Promise<{ rows: LogSlice[]; needsSql: boolean; error?: string }> {
  let query = supabase
    .from('backup_log')
    .select('id, scope, congregation_id, status, drive_verified_at, run_date, kind')
    .gte('run_date', tolNap)
    .lte('run_date', igNap)
    .eq('kind', 'napi')

  if (scope.congregationIds !== null) {
    if (scope.congregationIds.length === 0) return { rows: [], needsSql: false }
    // A kerületi admin a `globalis` hatókört NEM látja — csak a saját
    // gyülekezeteit. Az `in` szűrő a NULL congregation_id-t kizárja.
    query = query.in('congregation_id', scope.congregationIds)
  }

  const paged = await selectAllPaged<LogSlice>(query, { maxRows: 200_000 })
  if (paged.error) {
    if (isMissingTableError(paged.error as { message?: string; code?: string })) {
      return { rows: [], needsSql: true }
    }
    return { rows: [], needsSql: false, error: paged.error.message }
  }
  return { rows: paged.data, needsSql: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Egészség
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A legutóbbi IGAZOLT mentés. A lekérdezés SZÁNDÉKOSAN szűr a
 * `drive_verified_at IS NOT NULL`-ra — igazolás nélkül nincs zöld.
 */
export async function computeBackupHealth(
  supabase: SupabaseClient,
  scope: ScopeInput,
  driveHiba: string | null,
): Promise<{ health: BackupHealth; needsSql: boolean; error?: string }> {
  let query = supabase
    .from('backup_log')
    .select('finished_at')
    .eq('status', 'ok')
    .not('drive_verified_at', 'is', null)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)

  if (scope.congregationIds !== null) {
    if (scope.congregationIds.length === 0) {
      return {
        health: {
          allapot: 'nincs_mentes',
          utolsoIgazoltAt: null,
          oraSzam: null,
          driveHiba,
          mondat: 'Ehhez a hatókörhöz nem tartozik gyülekezet, ezért mentési adat sem.',
        },
        needsSql: false,
      }
    }
    query = query.in('congregation_id', scope.congregationIds)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) {
      return {
        health: {
          allapot: 'sql_hianyzik',
          utolsoIgazoltAt: null,
          oraSzam: null,
          driveHiba,
          mondat:
            'A biztonsági mentés adatbázis-része még nincs telepítve — a rendszer JELENLEG NEM KÉSZÍT mentést.',
        },
        needsSql: true,
      }
    }
    return {
      health: {
        allapot: 'nincs_mentes',
        utolsoIgazoltAt: null,
        oraSzam: null,
        driveHiba,
        mondat: 'A mentési napló nem olvasható — nem tudjuk igazolni, hogy készült-e mentés.',
      },
      needsSql: false,
      error: error.message,
    }
  }

  const utolso = (data ?? [])[0]?.finished_at as string | undefined
  if (!utolso) {
    return {
      health: {
        allapot: 'nincs_mentes',
        utolsoIgazoltAt: null,
        oraSzam: null,
        driveHiba,
        mondat: 'MÉG EGYETLEN ELLENŐRZÖTT BIZTONSÁGI MENTÉS SEM KÉSZÜLT.',
      },
      needsSql: false,
    }
  }

  const oraSzam = (Date.now() - new Date(utolso).getTime()) / 3_600_000
  const allapot: BackupHealth['allapot'] =
    oraSzam > KRITIKUS_ORA ? 'kritikus' : oraSzam > ELAVULT_ORA ? 'elavult' : 'friss'

  const napok = Math.floor(oraSzam / 24)
  const mondat =
    allapot === 'friss'
      ? `Az utolsó ellenőrzött mentés: ${huIdopont(utolso)}.`
      : allapot === 'elavult'
        ? `${napok >= 1 ? `${napok} napja` : `${Math.round(oraSzam)} órája`} nem készült ellenőrzött biztonsági mentés.`
        : `TÖBB MINT ${napok} NAPJA nem készült ellenőrzött biztonsági mentés.`

  return {
    health: { allapot, utolsoIgazoltAt: utolso, oraSzam, driveHiba, mondat },
    needsSql: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// „Tegnap valódi volt-e a mentés?"
// ─────────────────────────────────────────────────────────────────────────────

function ureCoverage(nap: string, varhato: number): DailyCoverage {
  return {
    nap,
    varhato,
    igazolt: 0,
    hibas: 0,
    befejezetlen: 0,
    hianyzik: varhato,
    problemasNevek: [],
  }
}

/**
 * A nap lefedettsége hatókörönként. Az EGYSÉG a GYÜLEKEZET: nincs egyetlen
 * óriási országos fájl, tehát a válasz sem lehet „az országos mentés talán jó".
 * Vagy „42 IGAZOLT és 18 HIÁNYZIK, névvel" — vagy semmi.
 */
export function osszesitNap(
  nap: string,
  congregations: CongregationRow[],
  rows: LogSlice[],
  globalisIsVarhato: boolean,
): DailyCoverage {
  const napiSorok = rows.filter((r) => r.run_date === nap)
  const byCong = new Map<string, LogSlice>()
  let globalis: LogSlice | null = null
  for (const r of napiSorok) {
    if (r.scope === 'globalis') {
      globalis = r
    } else if (r.congregation_id) {
      const meglevo = byCong.get(r.congregation_id)
      // Ha több sor van (nem szabadna), a JOBBIK nem nyer: az igazolt győz,
      // de a hiányzót soha nem tekintjük meglévőnek.
      if (!meglevo || (meglevo.drive_verified_at === null && r.drive_verified_at !== null)) {
        byCong.set(r.congregation_id, r)
      }
    }
  }

  const coverage = ureCoverage(nap, congregations.length + (globalisIsVarhato ? 1 : 0))
  coverage.hianyzik = 0

  const problemas: string[] = []
  for (const c of congregations) {
    const sor = byCong.get(c.id)
    if (!sor) {
      coverage.hianyzik += 1
      problemas.push(congregationNev(c))
      continue
    }
    if (sor.status === 'ok' && sor.drive_verified_at) {
      coverage.igazolt += 1
    } else if (sor.status === 'hiba') {
      coverage.hibas += 1
      problemas.push(congregationNev(c))
    } else {
      // 'fut' vagy 'ok' igazolás NÉLKÜL → NEM számít késznek.
      coverage.befejezetlen += 1
      problemas.push(congregationNev(c))
    }
  }

  if (globalisIsVarhato) {
    if (!globalis) {
      coverage.hianyzik += 1
      problemas.push('Rendszerszintű (globális) mentés')
    } else if (globalis.status === 'ok' && globalis.drive_verified_at) {
      coverage.igazolt += 1
    } else if (globalis.status === 'hiba') {
      coverage.hibas += 1
      problemas.push('Rendszerszintű (globális) mentés')
    } else {
      coverage.befejezetlen += 1
      problemas.push('Rendszerszintű (globális) mentés')
    }
  }

  coverage.problemasNevek = problemas.slice(0, 20)
  return coverage
}

export interface CoverageReport {
  needsSql: boolean
  error?: string
  tegnap: DailyCoverage
  ma: DailyCoverage
  pulzus: PulseDay[]
}

/** 14 napos pulzus + a tegnapi/mai lefedettség — EGY lekérdezésből. */
export async function computeCoverage(
  supabase: SupabaseClient,
  scope: ScopeInput,
  globalisIsVarhato: boolean,
): Promise<CoverageReport> {
  const ma = bukarestiNap()
  const tegnap = napEltol(ma, -1)
  const tol = napEltol(ma, -13)

  let congregations: CongregationRow[] = []
  try {
    congregations = await loadScopedCongregations(supabase, scope)
  } catch (error: unknown) {
    return {
      needsSql: false,
      error: error instanceof Error ? error.message : 'Ismeretlen hiba.',
      tegnap: ureCoverage(tegnap, 0),
      ma: ureCoverage(ma, 0),
      pulzus: [],
    }
  }

  const slice = await loadLogSlice(supabase, scope, tol, ma)
  if (slice.needsSql) {
    return {
      needsSql: true,
      tegnap: ureCoverage(tegnap, congregations.length + (globalisIsVarhato ? 1 : 0)),
      ma: ureCoverage(ma, congregations.length + (globalisIsVarhato ? 1 : 0)),
      pulzus: [],
    }
  }

  const pulzus: PulseDay[] = []
  for (let i = 13; i >= 0; i -= 1) {
    const nap = napEltol(ma, -i)
    const cov = osszesitNap(nap, congregations, slice.rows, globalisIsVarhato)
    pulzus.push({ nap, igazolt: cov.igazolt, hibas: cov.hibas + cov.befejezetlen, varhato: cov.varhato })
  }

  return {
    needsSql: false,
    error: slice.error,
    tegnap: osszesitNap(tegnap, congregations, slice.rows, globalisIsVarhato),
    ma: osszesitNap(ma, congregations, slice.rows, globalisIsVarhato),
    pulzus,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A FIGYELMEZTETŐ SÁV — a LEFEDETTSÉGBŐL, nem egyetlen időbélyegből
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sáv állapota.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 JAVÍTÁS — MIÉRT NEM ELÉG A `max(finished_at)`
 * ════════════════════════════════════════════════════════════════════════════
 * A sáv korábban a `computeBackupHealth()`-re épült, ami EGYETLEN, szűretlen
 * `max(finished_at)`-ot néz: se `kind`, se gyülekezetenkénti bontás. Ebből
 * következett, hogy EGYETLEN igazolt mentés — akár egy „Mentés most" kattintás,
 * akár egy visszaállítás előtti futás EGY gyülekezetre — 48 órán át ZÖLDEN
 * tartotta a sávot, miközben a napi cron halott volt és 40 másik gyülekezetnek
 * nem készült semmije. Az őrszem pont akkor hallgatott, amikor beszélnie kellett.
 *
 * Mostantól a sáv a TEGNAPI LEFEDETTSÉGBŐL számol (`computeCoverage`, ami
 * `kind='napi'`-ra szűr és gyülekezetenként bont), és MEGNEVEZI a hiányzókat.
 * A `computeBackupHealth` időbélyege megmarad — az mondja meg, MIKOR volt
 * utoljára bármi igazolt.
 */
export async function computeBannerHealth(
  supabase: SupabaseClient,
  scope: ScopeInput,
  globalisIsVarhato: boolean,
  driveHiba: string | null,
): Promise<{ health: BackupHealth; needsSql: boolean }> {
  const alap = await computeBackupHealth(supabase, scope, driveHiba)
  if (alap.needsSql) return { health: alap.health, needsSql: true }

  const lefedettseg = await computeCoverage(supabase, scope, globalisIsVarhato)
  if (lefedettseg.needsSql) return { health: alap.health, needsSql: true }

  const tegnap = lefedettseg.tegnap
  const bajos = tegnap.hianyzik + tegnap.hibas + tegnap.befejezetlen

  // Ha tegnap MINDEN hatókör igazolt volt, a sáv nyugodt lehet — de az
  // időbélyeg-alapú „elavult/kritikus" jelzést NEM írjuk felül: ha az utolsó
  // igazolt mentés mégis régi, az továbbra is baj.
  if (bajos === 0 || tegnap.varhato === 0) return { health: alap.health, needsSql: false }

  const nevek = tegnap.problemasNevek.slice(0, 5).join(', ')
  const tobb = tegnap.problemasNevek.length > 5 ? ` és még ${tegnap.problemasNevek.length - 5}` : ''

  return {
    needsSql: false,
    health: {
      ...alap.health,
      // A hiány MÉRTÉKE dönt: ha minden hatókör kimaradt, az nem „elavult",
      // hanem a mentés-rendszer leállása.
      allapot: bajos >= tegnap.varhato ? 'kritikus' : 'elavult',
      mondat:
        `TEGNAP (${huNap(tegnap.nap)}) ${bajos} hatókörnek NEM készült ellenőrzött mentése ` +
        `(${tegnap.igazolt}/${tegnap.varhato} kész)` +
        (nevek ? `: ${nevek}${tobb}.` : '.'),
    },
  }
}

// A figyelmeztető sáv adatát a
// `app/(dashboard)/admin/biztonsagi-mentes/actions.ts` → `getBackupBannerStateAction()`
// állítja elő, a fenti `computeBannerHealth()`-re építve. SZÁNDÉKOSAN nincs
// külön, „olcsóbb" változat: két egészség-számítás előbb-utóbb szétsodródna, és a
// sáv mást mondana, mint a felület — ez pontosan az a néma eltérés, amit ez a
// rendszer nem engedhet meg magának.
