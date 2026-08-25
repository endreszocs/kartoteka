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

/**
 * 2026-08-26 (Leltar 3_43 kör): a 10 tételes lista a HG 2139/2004 katalógus
 * egyházi gyakorlatban leggyakoribb tételeivel bővült — a Kézdi-Orbai
 * egyházmegye hivatalos „Gyakoribb használati idők" segédletének teljes
 * tartalma + a korábbi 10 tétel (változatlan kódokkal). A `defEv` a min–max
 * sáv kerekített közepe, ahol a segédlet nem mond mást.
 */
export const INVENTORY_AMORTIZATION_CATALOG: InventoryAmortizationCatalogEntry[] = [
  { kod: '1.6.2', nev: 'Egyházi, tanügyi épületek', minEv: 40, maxEv: 60, defEv: 50 },
  { kod: '2.1.16.5', nev: 'Hőközpontok (kazánok)', minEv: 8, maxEv: 12, defEv: 10 },
  { kod: '2.2.9', nev: 'Számítógépek, nyomtatók, pénztárgépek', minEv: 2, maxEv: 4, defEv: 3 },
  { kod: '2.3.2.1.1', nev: 'Személyszállító gépkocsi', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '2.3.2.1.2', nev: 'Mikrobusz', minEv: 4, maxEv: 8, defEv: 6 },
  { kod: '2.3.2.2.1', nev: 'Áruszállító gépkocsi 4.5 t-ig', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '2.4.2.1', nev: 'Gyümölcsös — alma, körte, szilva, gesztenye', minEv: 16, maxEv: 24, defEv: 20 },
  { kod: '2.4.2.2', nev: 'Gyümölcsös — cseresznye, meggy, barack', minEv: 9, maxEv: 15, defEv: 12 },
  { kod: '2.4.2.6', nev: 'Szőlős', minEv: 16, maxEv: 24, defEv: 20 },
  { kod: '3.1.1', nev: 'Bútorok (általános)', minEv: 9, maxEv: 15, defEv: 12 },
  { kod: '3.1.1.1', nev: 'Irodai (kereskedelmi) bútorzat', minEv: 3, maxEv: 5, defEv: 4 },
  { kod: '3.1.2', nev: 'Cégtáblák, feliratok', minEv: 2, maxEv: 4, defEv: 3 },
  { kod: '3.1.4', nev: 'Berendezési tárgyak', minEv: 8, maxEv: 12, defEv: 10 },
  { kod: '3.1.5', nev: 'TV, rádió, mosógép, hűtő, porszívó, hangszerek', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.2.1', nev: 'Irodai gépek (írógép, fénymásoló)', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.2.2', nev: 'Telefon, fax', minEv: 3, maxEv: 5, defEv: 4 },
  { kod: '3.2.4', nev: 'Más irodai berendezések', minEv: 3, maxEv: 5, defEv: 4 },
  { kod: '3.3.2', nev: 'Páncélszekrény (vas pénztár)', minEv: 16, maxEv: 24, defEv: 20 },
  { kod: '3.3.4', nev: 'Tűzvédelmi berendezések', minEv: 12, maxEv: 18, defEv: 15 },
  { kod: '3.3.5', nev: 'Biztonsági berendezések (riasztó, kamera)', minEv: 8, maxEv: 12, defEv: 10 },
  { kod: '3.4', nev: 'Más berendezés (egyéb alapeszköz)', minEv: 8, maxEv: 15, defEv: 12 },
]

export function getInventoryAmortizationCatalogEntry(code?: string | null): InventoryAmortizationCatalogEntry | null {
  if (!code) return null
  return INVENTORY_AMORTIZATION_CATALOG.find(entry => entry.kod === code) || null
}

/**
 * HG 2139/2004 főcsoport a katalóguskód első számjegyéből (1/2/3) — a hivatalos
 * Leltar 3_43 munkafüzet „Alapeszköz típusa" oszlopának megfeleltetéséhez.
 * Ismeretlen/hiányzó kódnál null (sosem tippelünk).
 */
export function getAlapeszkozCsoportFromKod(code?: string | null): 1 | 2 | 3 | null {
  const first = String(code || '').trim().charAt(0)
  if (first === '1') return 1
  if (first === '2') return 2
  if (first === '3') return 3
  return null
}
