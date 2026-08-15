/**
 * Leltári érték-számítás — közös web ⇄ desktop (2026-08-15, desktop-paritás
 * 4. szelet).
 *
 * A webes `apps/web/lib/inventory/reporting.ts`-ből emeltük ide VÁLTOZATLAN
 * viselkedéssel: a lineáris (havi) amortizáció-számítás és a megjelenítési
 * név EGY helyen él — a webes reporting innen importál (a saját másolatai
 * törölve), a desktop fisa-előnézet és leltár-lista szintén.
 *
 * Tudatosan PURE modul (nincs React/DB) — a fisa-builder (fisa.ts) mintája.
 */

import type { InventoryItem } from './constants'

/** Dátum éjfélre normalizálva; hibás/hiányzó értéknél null (fail-closed). */
export function normalizeInventoryDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export function getInventoryQuantity(item: InventoryItem) {
  return Number(item.mennyiseg || 1) || 1
}

/** Könyv szerinti érték = egységnyi beszerzési érték × mennyiség. */
export function getInventoryBookValue(item: InventoryItem) {
  return (Number(item.beszerzes_erteke || 0) || 0) * getInventoryQuantity(item)
}

export function getInventoryDisplayName(item: InventoryItem) {
  if (item.kategoria_key === 'konyv') {
    const author = item.szerzo?.trim()
    return author ? `${author}: ${item.megnevezes}` : item.megnevezes
  }

  return item.megnevezes
}

/**
 * Aktuális (amortizált) leltári érték. Csak az alapeszköz amortizálódik —
 * lineáris havi leírással, a katalógus szerinti használati idő alapján;
 * minden más kategória a könyv szerinti értéken áll.
 */
export function calculateInventoryCurrentValue(item: InventoryItem, referenceDate = new Date()) {
  const bookValue = getInventoryBookValue(item)
  if (item.kategoria_key !== 'alapeszkoz') return bookValue
  if (!item.hasznalati_ido || !item.beszerzes_datuma) return bookValue

  const purchaseDate = normalizeInventoryDate(item.beszerzes_datuma)
  if (!purchaseDate) return bookValue

  const months = Math.max(
    0,
    (referenceDate.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (referenceDate.getMonth() - purchaseDate.getMonth()),
  )
  const amortizationBase = Number(item.beszerzes_erteke || 0) || 0
  const annualPeriod = Math.max(1, Number(item.hasznalati_ido || 0))
  const monthlyDepreciation = amortizationBase / (annualPeriod * 12)
  const currentUnitValue = Math.max(0, amortizationBase - months * monthlyDepreciation)

  return currentUnitValue * getInventoryQuantity(item)
}
