'use client'

/**
 * Leltár-újratöltés csatorna (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (Endre élesben találta, „nem importált egyet sem"):
 * a Leltar 3_43 import ÉLESBEN LEFUTOTT és 212 tételt be is írt, de a
 * képernyőn semmi nem változott. Ok: az `InventoryMain` a tételeket EGYSZER,
 * csatoláskor tölti be (`useEffect(..., [load])`, a `load` `useCallback(…, [])`).
 * Az importáló kártya viszont UGYANAZON az oldalon, egy MÁSIK fülön él —
 * fülváltáskor nincs újracsatolás, a szerveri `revalidatePath('/leltar')` pedig
 * a kliens-oldali állapotot nem érinti. A lelkész tehát az import UTÁN is a
 * régi (üres) listát látta, és joggal hitte, hogy semmi nem ment be.
 *
 * MEGOLDÁS: az `InventoryMain` a saját `load()` függvényét és a listára-ugrást
 * beteszi ebbe a kontextusba, és a rendszergazdai importáló fül TARTALMÁT
 * (ami a szerveren készül, ezért propot nem tud kapni) ezzel a providerrel
 * öleli körbe. Az importáló így az import végén friss listát tud kérni, és
 * egy gombbal át tud vinni a leltári nyilvántartásra.
 */

import { createContext, useContext } from 'react'

export interface InventoryRefreshApi {
  /** A leltár-lista újratöltése a szerverről. */
  frissit: () => void | Promise<void>
  /** Váltás a „Leltári nyilvántartás" fülre. */
  listaraUgras: () => void
}

const InventoryRefreshContext = createContext<InventoryRefreshApi | null>(null)

export function InventoryRefreshProvider({
  api,
  children,
}: {
  api: InventoryRefreshApi
  children: React.ReactNode
}) {
  return <InventoryRefreshContext.Provider value={api}>{children}</InventoryRefreshContext.Provider>
}

/**
 * A leltár-lista frissítő API-ja. Provider nélkül `null` — a hívó ilyenkor
 * (pl. az admin Import-központban, ahol nincs lista a képernyőn) egyszerűen
 * kihagyja a frissítést, nem hasal el.
 */
export function useInventoryRefresh(): InventoryRefreshApi | null {
  return useContext(InventoryRefreshContext)
}
