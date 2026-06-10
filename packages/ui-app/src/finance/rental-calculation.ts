/**
 * Bérleti szerződés és bérleti hátralék számítási logika.
 *
 * A logika a Vanilla JS forrás alapján készült:
 *   migration-docs/source-links/penzugy_tartozasok.js:304-399
 *   (_renderBerletTartozas függvény)
 *
 * FONTOS DUPLIKÁCIÓ: a hátralék-számítás "duális párosítást" használ —
 * minden szerződésre az `id_szemely` alapján ÉS a `berlo_nev` (case-insensitive
 * trim) alapján is összegzi a befizetéseket. Ha egy befizetés mindkét
 * kritériumhoz illeszkedik (pl. azonos személy + egyező név), **kétszer
 * számolódik**. Ez a Vanilla JS-es viselkedés, amit a migráció során
 * szándékosan megtartunk — a régi kód és a pénzügyi historikus adatok ezzel
 * konzisztensek. Jövőbeli refaktorban érdemes mérlegelni, hogy csak az
 * `id_szemely` alapú párosítás legyen elsődleges, és a név csak fallback.
 */

import type { RentalContractRow, RentalDebtRow, RentalTipus } from './types'
// 2026-06-10: a `calculateEvesDij` a megosztott `helpers`-ből jön (azonos
// implementáció) — a korábbi lokális duplikátum eltávolítva a barrel-ütközés
// elkerüléséért (helpers.ts is exportálja).
import { calculateEvesDij } from './helpers'

export interface RentalPaymentLike {
  id_szemely: number | null
  forrasa: string | null
  fizetettev: number | null
  osszeg: number
}

// ── Segédfüggvények ──────────────────────────────────────────

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseYear(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback
  const y = Number(String(iso).slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : fallback
}

function parseMonthIndex(iso: string | null | undefined): number {
  // 0-11 (január = 0). Ha parse nem sikerül, 0-t ad vissza (január).
  if (!iso) return 0
  const m = Number(String(iso).slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : 0
}

// ── Részarányos díj egy adott évre ───────────────────────────

/**
 * Részarányos (arányos) bérleti díj egy adott évre.
 *
 * Szabály:
 * - Ha az év a szerződés kezdet/vége tartományán kívül esik → 0
 * - Ha az év TELJES évben lefedett → teljes éves díj
 * - Ha az év a KEZDET éve → a kezdő hónap alapján arányosítva:
 *   `evesDij * (12 - kezdetHonap) / 12`  (kezdetHonap: 0=január)
 * - Ha az év a VÉGE éve (és van vege) → a záró hónap alapján:
 *   `evesDij * (vegeHonap + 1) / 12`  (vegeHonap: 0=január)
 *
 * Példa: 2025-05-15 — 2026-03-31 szerződés, éves díj 1200 RON:
 * - 2025: 8 hónap aktív (május-december) = 1200 * 8/12 = 800
 * - 2026: 3 hónap aktív (január-március) = 1200 * 3/12 = 300
 */
export function calculateAranyosDij(contract: RentalContractRow, year: number): number {
  const evesDij = calculateEvesDij(contract)
  if (evesDij <= 0) return 0

  const szKezdetEv = parseYear(contract.kezdet, 9999)
  const szVegeEv = contract.vege ? parseYear(contract.vege, 9999) : 9999

  if (year < szKezdetEv || year > szVegeEv) return 0

  let aranyos = evesDij

  if (year === szKezdetEv) {
    const kezdetHonap = parseMonthIndex(contract.kezdet) // 0-11
    aranyos = (evesDij * (12 - kezdetHonap)) / 12
  }

  if (year === szVegeEv && contract.vege) {
    const vegeHonap = parseMonthIndex(contract.vege) // 0-11
    aranyos = (evesDij * (vegeHonap + 1)) / 12
  }

  return aranyos
}

// ── Bérleti hátralék számítás ────────────────────────────────

/**
 * Bérleti hátralék számítása egy szerződéshalmazra és a kapcsolódó
 * befizetésekre, egy év-intervallumra.
 *
 * Minden aktív (NEM törölt) szerződésre kiszámolja:
 * - `elvart`  — az évenként aránylagos elvárt díjak összege
 * - `fizett`  — a befizetett összeg az intervallumon belül (duális párosítás)
 * - `hatralek = max(0, elvart - fizett)`
 *
 * Duális párosítás: a befizetés akkor számít ehhez a szerződéshez, ha:
 * - `befizetes.id_szemely === contract.id_szemely`, VAGY
 * - `befizetes.forrasa.trim().toLowerCase() === contract.berlo_nev.trim().toLowerCase()`
 *
 * Ha mindkettő igaz és eltérő befizetésekre vonatkozik → összeadódnak
 * (a Vanilla JS-ben is így működik).
 *
 * @param contracts  az összes aktív bérleti szerződés (nem törölt)
 * @param payments   az összes 104.04/104.05 kódú befizetés az adott évekre
 * @param yearFrom   kezdő év (inkluzív)
 * @param yearTo     záró év (inkluzív)
 */
export function calculateRentalDebts(
  contracts: RentalContractRow[],
  payments: RentalPaymentLike[],
  yearFrom: number,
  yearTo: number,
): RentalDebtRow[] {
  // Befizetéseket szervezzük személy-ID és név szerint, évenként
  const bySzemely = new Map<number, Map<number, number>>()
  const byNev = new Map<string, Map<number, number>>()

  for (const p of payments) {
    const ev = p.fizetettev
    if (ev == null) continue
    const osszeg = toNum(p.osszeg)

    if (p.id_szemely != null) {
      let szMap = bySzemely.get(p.id_szemely)
      if (!szMap) {
        szMap = new Map()
        bySzemely.set(p.id_szemely, szMap)
      }
      szMap.set(ev, (szMap.get(ev) ?? 0) + osszeg)
    }

    if (p.forrasa) {
      const key = p.forrasa.trim().toLowerCase()
      if (key) {
        let nevMap = byNev.get(key)
        if (!nevMap) {
          nevMap = new Map()
          byNev.set(key, nevMap)
        }
        nevMap.set(ev, (nevMap.get(ev) ?? 0) + osszeg)
      }
    }
  }

  // Aktív szerződések szűrése (aktiv=true, deleted=false)
  const aktivContracts = contracts.filter(c => c.aktiv && !c.deleted)

  const result: RentalDebtRow[] = []

  for (const contract of aktivContracts) {
    let elvart = 0
    let fizett = 0

    const nevKey = contract.berlo_nev.trim().toLowerCase()

    for (let ev = yearFrom; ev <= yearTo; ev++) {
      elvart += calculateAranyosDij(contract, ev)

      let eviFizetes = 0
      if (contract.id_szemely != null) {
        eviFizetes += bySzemely.get(contract.id_szemely)?.get(ev) ?? 0
      }
      if (nevKey) {
        eviFizetes += byNev.get(nevKey)?.get(ev) ?? 0
      }
      fizett += eviFizetes
    }

    const hatralek = Math.max(0, elvart - fizett)

    result.push({
      contractId: contract.id,
      berlo_nev: contract.berlo_nev,
      leiras: contract.leiras,
      tipus: contract.tipus as RentalTipus,
      evesDij: calculateEvesDij(contract),
      fizett,
      hatralek,
    })
  }

  return result
}

// ── Aggregátor segéd ─────────────────────────────────────────

/**
 * Összegzi a hátralék-sorokat:
 * - `totalEvesDij` — az összes aktív szerződés éves díja
 * - `totalFizetett` — a vizsgált időszak összes bérleti befizetése
 * - `totalHatralek` — az összes szerződés hátralékának összege
 */
export function summarizeRentalDebts(rows: RentalDebtRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.totalEvesDij += r.evesDij
      acc.totalFizetett += r.fizett
      acc.totalHatralek += r.hatralek
      return acc
    },
    { totalEvesDij: 0, totalFizetett: 0, totalHatralek: 0 },
  )
}
