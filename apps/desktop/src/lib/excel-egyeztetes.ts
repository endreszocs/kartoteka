/**
 * excel-egyeztetes — az E4 Excel ↔ Kartotéka összevetés KÖZÖS magja
 * (D12, 2026-08-28, Endre döntése: az egyeztetés automatikusan is fusson).
 *
 * Eddig a logika a Beállítások → Könyvelés panel handleE4Check-jében élt
 * beágyazva — így csak kézzel futott, és semmi nem figyelmeztetett, ha
 * sosem futtatták (a webes rögzítés Excel-kimaradását CSAK ez jelezné).
 * A közös mag két helyről hívódik:
 *   - a panel kézi „Egyeztetés futtatása" gombjáról (változatlan UI),
 *   - az Excel write-sync sikeres írása után, throttled auto-futással
 *     (excel-write-sync.ts) — eltérésnél figyelmeztető esemény megy a
 *     shellnek.
 *
 * CSAK OLVAS: sem az Excelbe, sem a DB-be nem ír.
 */

import { getDesktopSupabase } from './supabase'
import { excelReadSheetSums } from './excel'
import { getBankMap } from './excel-settings'

export interface E4Sor {
  lap: string
  excelDb: number
  excelBev: number
  excelKiad: number
  kartotekaDb: number | null
  kartotekaBev: number | null
  kartotekaKiad: number | null
  /** null = a Kartotéka-oldal nem olvasható (offline) — nem tudjuk megítélni. */
  egyezik: boolean | null
}

async function kartotekaOsszegek(
  congregationId: string,
  ev: number,
  bankszamlaId: number | null,
): Promise<{ bev: number; kiad: number; db: number } | null> {
  try {
    const supabase = getDesktopSupabase()
    let bevQ = supabase
      .from('befizetes')
      .select('osszeg')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .eq('stornozott', false)
      .gte('datum', `${ev}-01-01`)
      .lte('datum', `${ev}-12-31`)
    let kiadQ = supabase
      .from('kiadas')
      .select('osszeg')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .eq('stornozott', false)
      .gte('datum', `${ev}-01-01`)
      .lt('datum', `${ev + 1}-01-01`)
    if (bankszamlaId === null) {
      bevQ = bevQ.is('bankszamla_id', null)
      kiadQ = kiadQ.is('bankszamla_id', null)
    } else {
      bevQ = bevQ.eq('bankszamla_id', bankszamlaId)
      kiadQ = kiadQ.eq('bankszamla_id', bankszamlaId)
    }
    const [bevRes, kiadRes] = await Promise.all([bevQ, kiadQ])
    if (bevRes.error || kiadRes.error) return null
    const bevList = (bevRes.data ?? []) as Array<{ osszeg: number }>
    const kiadList = (kiadRes.data ?? []) as Array<{ osszeg: number }>
    return {
      bev: Math.round(bevList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100,
      kiad: Math.round(kiadList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100,
      db: bevList.length + kiadList.length,
    }
  } catch {
    return null // offline — csak az Excel-oldal látszik
  }
}

/**
 * A Kassza-lap + a megerősített bank betű-lapok összevetése a Kartotéka
 * (nem törölt, nem sztornózott) tételeivel. Az Excel a tükör-sorokkal
 * nettóz, így az összegeknek egyeznie kell; kézzel vezetett sorok eltérést
 * adhatnak — pont ezt kell látni.
 */
export async function excelKartotekaOsszevetes(
  adatokPath: string,
  congregationId: string,
  ev: number,
): Promise<E4Sor[]> {
  const sorok: E4Sor[] = []

  // Kassza-lap ↔ készpénzes tételek
  const kasszaSums = await excelReadSheetSums(adatokPath, 'Kassza')
  const kassza = await kartotekaOsszegek(congregationId, ev, null)
  sorok.push({
    lap: 'Kassza',
    excelDb: kasszaSums.rowCount,
    excelBev: kasszaSums.bevSum,
    excelKiad: kasszaSums.kiadSum,
    kartotekaDb: kassza?.db ?? null,
    kartotekaBev: kassza?.bev ?? null,
    kartotekaKiad: kassza?.kiad ?? null,
    egyezik:
      kassza === null
        ? null
        : Math.abs(kasszaSums.bevSum - kassza.bev) < 0.005 &&
          Math.abs(kasszaSums.kiadSum - kassza.kiad) < 0.005,
  })

  // Megerősített bank-lapok ↔ az adott bankszámla tételei
  const map = getBankMap(congregationId, ev)
  if (map?.confirmed) {
    for (const entry of map.entries) {
      const sums = await excelReadSheetSums(adatokPath, entry.letter)
      const bank = await kartotekaOsszegek(congregationId, ev, entry.bankszamlaId)
      sorok.push({
        lap: `${entry.letter} (${entry.bankNeve})`,
        excelDb: sums.rowCount,
        excelBev: sums.bevSum,
        excelKiad: sums.kiadSum,
        kartotekaDb: bank?.db ?? null,
        kartotekaBev: bank?.bev ?? null,
        kartotekaKiad: bank?.kiad ?? null,
        egyezik:
          bank === null
            ? null
            : Math.abs(sums.bevSum - bank.bev) < 0.005 &&
              Math.abs(sums.kiadSum - bank.kiad) < 0.005,
      })
    }
  }

  return sorok
}
