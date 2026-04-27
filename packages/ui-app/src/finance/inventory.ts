/**
 * Leltári amortizációs katalógus — finance shared modulhoz (Sprint Q F3.2, v0.7.11).
 *
 * A webes `apps/web/lib/constants/inventory.next.ts`-ből kiemelt 10 tételes
 * katalógus. A bevétel-rögzítés (IncomeDialogBody) használja a kapcsolt
 * leltári alapeszköz-kód kiválasztásához.
 *
 * A webes oldal re-exportálja a sharedból (kompatibilitás).
 */

export interface InventoryAmortizationCatalogEntry {
  kod: string
  nev: string
  minEv: number
  maxEv: number
  defEv: number
}

export const INVENTORY_AMORTIZATION_CATALOG: InventoryAmortizationCatalogEntry[] = [
  { kod: '1.6.2', nev: 'Egyházi, tanügyi épületek', minEv: 40, maxEv: 60, defEv: 50 },
  { kod: '2.1.16.5', nev: 'Hőközpontok (kazánok)', minEv: 8, maxEv: 12, defEv: 10 },
  { kod: '2.2.9', nev: 'Számítógépek, nyomtatók, pénztárgépek', minEv: 2, maxEv: 4, defEv: 3 },
  { kod: '2.3.2.1.1', nev: 'Személyszállító gépkocsi', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '2.3.2.1.2', nev: 'Mikrobusz', minEv: 4, maxEv: 8, defEv: 6 },
  { kod: '2.3.2.2.1', nev: 'Áruszállító gépkocsi 4.5 t-ig', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.1.1', nev: 'Bútorok (általános)', minEv: 9, maxEv: 15, defEv: 12 },
  { kod: '3.1.1.1', nev: 'Irodai bútor', minEv: 3, maxEv: 5, defEv: 4 },
  { kod: '3.1.5', nev: 'Hangszerek (orgonán kívül)', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.2.1', nev: 'Irodai gépek (a számítógép kivételével)', minEv: 4, maxEv: 6, defEv: 5 },
]

export function getInventoryAmortizationCatalogEntry(code?: string | null): InventoryAmortizationCatalogEntry | null {
  if (!code) return null
  return INVENTORY_AMORTIZATION_CATALOG.find(entry => entry.kod === code) || null
}
