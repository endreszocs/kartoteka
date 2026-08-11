import 'server-only'

/**
 * A MAI HALADÁS — a `backup_log`-ból, SZÁMLÁLÁSSAL (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN KÜLÖN EZ, ÉS MIÉRT NEM A `computeCoverage`
 * ════════════════════════════════════════════════════════════════════════════
 * A haladás-jelzőt a felület MÁSODPERCENKÉNT kérdezi, amíg a mentés fut. A
 * `computeCoverage` viszont 14 NAP × ~784 napló-sort és 783 gyülekezet-sort
 * lapoz végig — az áttekintő kártyához ez helyes, egy néhány másodperces
 * lekérdezéshez viszont pazarlás, és épp a mentés alatt terhelné az adatbázist.
 *
 * Ez a modul UGYANABBÓL A TÁBLÁBÓL dolgozik — nincs második állapot-tároló —,
 * de csak MEGSZÁMOL: négy `count`-lekérdezés, nulla sor átvitele.
 *
 * ⚠️ A ZÖLD BIZONYÍTÁSA VÁLTOZATLAN. „Kész" kizárólag az a hatókör, aminek
 *    `status='ok'` ÉS `drive_verified_at IS NOT NULL` (feltöltve, visszaolvasva,
 *    ellenőrző összeg egyezett). Egy „ok" sor igazolás nélkül NEM kész.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { bucharestRunDate } from './payload'

export interface NapiHaladas {
  /** A nap kulcsa (Europe/Bucharest), `YYYY-MM-DD`. */
  nap: string
  /** Ennyi hatókörnek KELLENE ma mentés: aktív gyülekezetek (+ a rendszerszintű). */
  varhato: number
  /** Feltöltve, VISSZAOLVASVA, ellenőrző összeg egyezett. Csak ez a „kész". */
  igazolt: number
  /** A mentés megpróbálkozott vele, és elbukott. */
  hibas: number
  /** Épp fut (vagy „ok", de igazolás nélkül) — NEM kész. */
  fut: number
  /** Amihez ma még hozzá sem értünk. */
  erintetlen: number
  /** `true`, ha a napló-tábla még nincs telepítve (SQL hiányzik). */
  needsSql: boolean
  error?: string
}

function ureHaladas(nap: string, varhato: number): NapiHaladas {
  return {
    nap,
    varhato,
    igazolt: 0,
    hibas: 0,
    fut: 0,
    erintetlen: varhato,
    needsSql: false,
  }
}

function hianyzikATabla(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  // 42P01 = undefined_table. A szöveges ág azért kell, mert a PostgREST néha
  // csak üzenetet ad (séma-gyorsítótár).
  return error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message ?? '')
}

/**
 * A mai nap haladása, a hívó hatókörére szűkítve.
 *
 * @param congregationIds `null` = korlátlan (master/rendszergazda). Üres tömb =
 *        SEMMI — fail-closed, ahogy a felület többi része is.
 * @param globalisIsVarhato A kerületi admin a rendszerszintű mentést nem látja,
 *        ezért tőle nem is várjuk el.
 */
export async function loadNapiHaladas(
  supabase: SupabaseClient,
  args: {
    congregationIds: string[] | null
    globalisIsVarhato: boolean
    nap?: string
  },
): Promise<NapiHaladas> {
  const nap = args.nap ?? bucharestRunDate()
  const globalisDb = args.globalisIsVarhato ? 1 : 0

  if (args.congregationIds !== null && args.congregationIds.length === 0) {
    return ureHaladas(nap, globalisDb)
  }

  // ── 1) MENNYI HATÓKÖRNEK KELLENE MENTÉS
  let congQuery = supabase
    .from('congregations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if (args.congregationIds !== null) congQuery = congQuery.in('id', args.congregationIds)
  const { count: aktivDb, error: congHiba } = await congQuery
  if (congHiba) {
    // ⚠️ NÉMA NULLA HELYETT HANGOS HIBA. Egy „0 / 0 kész" haladás-jelző a
    //    legrosszabb válasz: úgy nézne ki, mintha minden rendben lenne.
    return { ...ureHaladas(nap, 0), error: `A gyülekezetek nem számolhatók meg: ${congHiba.message}` }
  }
  const varhato = (aktivDb ?? 0) + globalisDb

  // ── 2) A MAI NAPLÓ-SOROK ÁLLAPOTONKÉNT
  const alap = () => {
    let q = supabase
      .from('backup_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'napi')
      .eq('run_date', nap)
    if (args.congregationIds !== null) q = q.in('congregation_id', args.congregationIds)
    return q
  }

  const [igazoltRes, hibasRes, futRes] = await Promise.all([
    alap().eq('status', 'ok').not('drive_verified_at', 'is', null),
    alap().eq('status', 'hiba'),
    // „fut", VAGY „ok" igazolás nélkül — mindkettő ugyanazt jelenti: NEM kész.
    alap().or('status.eq.fut,and(status.eq.ok,drive_verified_at.is.null)'),
  ])

  const elsoHiba = igazoltRes.error ?? hibasRes.error ?? futRes.error
  if (elsoHiba) {
    if (hianyzikATabla(elsoHiba)) return { ...ureHaladas(nap, varhato), needsSql: true }
    return { ...ureHaladas(nap, varhato), error: `A mentési napló nem olvasható: ${elsoHiba.message}` }
  }

  const igazolt = igazoltRes.count ?? 0
  const hibas = hibasRes.count ?? 0
  const fut = futRes.count ?? 0

  return {
    nap,
    varhato,
    igazolt,
    hibas,
    fut,
    // ⚠️ Nem mehet negatívba: ha valaki kézzel sorokat vitt be, vagy egy
    //    gyülekezetet közben inaktívvá tettek, az összeg átléphetné a várhatót.
    //    Egy negatív „érintetlen" a felületen értelmezhetetlen lenne.
    erintetlen: Math.max(0, varhato - igazolt - hibas - fut),
    needsSql: false,
  }
}
