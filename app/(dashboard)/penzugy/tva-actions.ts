'use server'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  calculateTvaPlafon,
  getTvaPlafonbaSzamitoCelok,
} from '@/lib/finance/tva-plafon'
import type { TvaPlafonResult } from '@/lib/finance/tva-plafon-constants'

/**
 * TVA-plafon figyelő — server actions.
 *
 * A UI a Pénzügy Dashboard widgetből hívja.
 *
 * Jogosultság: minden bejelentkezett user, akinek van hozzáférése az aktív
 * gyülekezethez (RLS a helper függvényeken át szűri).
 */

export type TvaStatusResult =
  | {
      success: true
      data: TvaPlafonResult
    }
  | {
      success: false
      error: string
    }

/**
 * Kiszámítja a TVA-plafon felé történő gyülekezeti forgalmat egy adott évre.
 * Ha a year paraméter nincs megadva, az aktuális naptári évet használja.
 */
export async function calculateTvaPlafonForYear(year?: number): Promise<TvaStatusResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }

  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return { success: false, error: 'Nincs aktív gyülekezet kiválasztva.' }
  }

  try {
    const result = await calculateTvaPlafon(
      access.supabase,
      congregationId,
      year ?? new Date().getFullYear(),
    )
    return { success: true, data: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Hiba a TVA-plafon számításakor: ${msg}` }
  }
}

/**
 * Lekérdezi, hogy a gyülekezet már TVA-alany-e (lekérdezi a
 * congregations.tva_alany mezőt).
 *
 * A UI ennek függvényében más üzenetet mutat:
 * - TRUE: "Már TVA-alany — ez a figyelő nem releváns"
 * - FALSE: a plafon-figyelő normál módban
 */
export async function getTvaStatus(): Promise<{
  success: boolean
  tvaAlany?: boolean
  tvaKod?: string | null
  tvaAlanyTol?: string | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }

  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('congregations')
    .select('tva_alany, tva_kod, tva_alany_tol')
    .eq('id', congregationId)
    .maybeSingle()

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    tvaAlany: Boolean(data?.tva_alany),
    tvaKod: data?.tva_kod ?? null,
    tvaAlanyTol: data?.tva_alany_tol ?? null,
  }
}

/**
 * Lekérdezi a plafonba számító szamadasicel kódok listáját.
 * A UI a részletek modalban használja a "kik számítanak" bemutatásához.
 */
export async function listTvaPlafonbaSzamitoCelok(): Promise<{
  success: boolean
  data?: Array<{ id: string; nev: string; tva_mentesseg_hivatkozas: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }

  try {
    const data = await getTvaPlafonbaSzamitoCelok(access.supabase)
    return { success: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Ha a TVA-plafon átlépés (piros szint) történt, értesítést küld
 * a gyülekezet lelkészének. Deduplikáció: egy évben csak egy értesítés
 * a `hivatkozas = 'tva-plafon-atlepes-{year}'` alapján.
 *
 * A widget hívja a dashboard betöltésekor, ha a szint 'piros'. Nem változtatja
 * az állapotot, ha már létezik értesítés az évre.
 *
 * @returns `notified: true` ha új értesítés jött létre, `false` ha már létezett.
 */
export async function notifyTvaPlafonOverflow(year: number): Promise<{
  success: boolean
  notified?: boolean
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }

  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  const supabase = access.supabase

  // 1. Lekérdezzük, hogy tényleg piros szint van-e (biztonsági ellenőrzés, nehogy
  //    a UI hibásan hívja meg a funkciót)
  const tvaResult = await calculateTvaPlafon(supabase, congregationId, year)
  if (tvaResult.szint !== 'piros') {
    return { success: true, notified: false }
  }

  const hivatkozas = `tva-plafon-atlepes-${year}`

  // 2. A gyülekezet lelkészének (és esperesének) lekérdezése
  const { data: pastors } = await supabase
    .from('profiles')
    .select('id, role, diocese_id')
    .eq('status', 'active')
    .or(`congregation_id.eq.${congregationId},and(role.eq.esperes,diocese_id.not.is.null)`)

  if (!pastors || pastors.length === 0) {
    return { success: true, notified: false }
  }

  // Csak a releváns címzetteket tartjuk meg
  const recipients = pastors.filter((p) => {
    if (p.role === 'lelkesz') return true
    if (p.role === 'esperes') return true
    if (p.role === 'egyhazmegyei_admin') return true
    return false
  })

  if (recipients.length === 0) {
    return { success: true, notified: false }
  }

  // 3. Dedup ellenőrzés — ha már van értesítés ebben a gyülekezetben erre az évre,
  //    nem küldünk újat
  const { data: existing } = await supabase
    .from('ertesitesek')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('hivatkozas', hivatkozas)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return { success: true, notified: false }
  }

  // 4. Új értesítés létrehozása minden érintett címzettnek
  const cim = `TVA-plafon átlépve (${year}): ${tvaResult.szamoltForgalomRon.toLocaleString('hu-HU')} RON`
  const uzenet =
    `A gyülekezet ${year}-ben meghaladta a TVA-alany plafont (395 000 RON). ` +
    `A román törvény szerint 10 napon belül a könyvelőnek be kell nyújtania a 010-es nyomtatványt az ANAF-hoz. ` +
    `A következő hónap elsejétől a gyülekezet TVA-alannyá válik. ` +
    `Részletek: Pénzügy → Áttekintés → TVA-plafon figyelő.`

  const rows = recipients.map((p) => ({
    user_id: p.id,
    congregation_id: congregationId,
    cim,
    uzenet,
    tipus: 'warning',
    hivatkozas: '/penzugy',
  }))

  // Közös hivatkozás-flagel egy ertesitesek-et a dedup-hoz (az első sor)
  // A többi hasonló, de különböző user_id-val. Mind ugyanazt a hivatkozás-szöveget
  // kapja, amit a dedup-nál ellenőrzünk:
  const firstWithFlag = { ...rows[0], hivatkozas }
  const rest = rows.slice(1)

  const { error } = await supabase.from('ertesitesek').insert([firstWithFlag, ...rest])

  if (error) return { success: false, error: error.message }

  return { success: true, notified: true }
}
