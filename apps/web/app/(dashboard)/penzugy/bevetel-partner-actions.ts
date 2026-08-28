'use server'

/**
 * Bevétel-oldali partner-memória (Endre 2026-08-28-i kérése).
 *
 * A banki kivonat partner-nevéhez egyszer hozzárendelt tag (vagy beírt
 * név/cégnév) MEGJEGYZŐDIK, és a következő banki importnál magától
 * alkalmazódik — így az éves adományozó/szponzor-áttekintés teljes képet ad.
 *
 * Tábla: bevetel_partner (2026-08-29-bevetel-partner.sql) — gyülekezetenként
 * egyedi normalizált név-kulccsal.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { normalizaltBankiNev } from '@/lib/finance/bevetel-partner-nev'

export interface BevetelPartnerEmlek {
  szemelyId: number | null
  megjelenitesNev: string | null
}

/** A gyülekezet TELJES partner-memóriája (kis tábla — egyben jön). */
export async function getBevetelPartnerMemoria(): Promise<{
  data: Record<string, BevetelPartnerEmlek>
  error: string | null
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) {
    return { data: {}, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }
  const { data, error } = await access.supabase
    .from('bevetel_partner')
    .select('nyers_nev, szemely_id, megjelenites_nev')
    .eq('congregation_id', access.effectiveCongregationId)
  if (error) return { data: {}, error: error.message }
  const eredmeny: Record<string, BevetelPartnerEmlek> = {}
  for (const sor of (data || []) as Array<{
    nyers_nev: string
    szemely_id: number | null
    megjelenites_nev: string | null
  }>) {
    eredmeny[sor.nyers_nev] = {
      szemelyId: sor.szemely_id,
      megjelenitesNev: sor.megjelenites_nev,
    }
  }
  return { data: eredmeny, error: null }
}

/**
 * Egy banki partner-név → tag/cégnév párosítás megjegyzése (upsert).
 * Best-effort hívásra tervezve: a hívó a hibát naplózhatja, de a fő művelet
 * (mentés/szerkesztés) sikerét nem boríthatja.
 */
export async function rememberBevetelPartner(input: {
  nyersNev: string
  szemelyId?: number | null
  megjelenitesNev?: string | null
}): Promise<{ success: boolean; error: string | null }> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) {
    return { success: false, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }
  const kulcs = normalizaltBankiNev(input.nyersNev)
  if (!kulcs) return { success: false, error: 'Üres partner-név nem jegyezhető meg.' }
  const szemelyId = input.szemelyId ?? null
  const megjelenitesNev = (input.megjelenitesNev ?? '').trim() || null
  if (szemelyId === null && megjelenitesNev === null) {
    return { success: false, error: 'Tag VAGY név/cégnév szükséges a megjegyzéshez.' }
  }
  const { error } = await access.supabase
    .from('bevetel_partner')
    .upsert(
      {
        congregation_id: access.effectiveCongregationId,
        nyers_nev: kulcs,
        szemely_id: szemelyId,
        megjelenites_nev: megjelenitesNev,
        created_by: access.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'congregation_id,nyers_nev' },
    )
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}
