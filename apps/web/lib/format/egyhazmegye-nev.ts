/**
 * Egyházmegye-név formázó — a „Református Egyházmegye" toldat DUPLÁZÁS-VÉDŐ
 * heurisztikája KÖZÖS helyen.
 *
 * MIÉRT (egyházmegyei terv, 4.2): a `dioceses.name` a seedben MÁR tartalmazza
 * a toldatot („Kézdi-Orbai Református Egyházmegye"), a megjelenítő helyek
 * viszont sablonból fűzték hozzá („${name} Református Egyházmegye") — az
 * eredmény: „…Egyházmegye Református Egyházmegye". Ugyanez a heurisztika élt
 * a lelkészi jelentés nyomtatójában (lib/lelkeszi-jelentes/print.ts) —
 * mostantól MINDKÉT hely ezt a helpert hívja (közös helper, soha széthúzó
 * másolat).
 */

/**
 * A teljes, hivatalos egyházmegye-név: ha a tárolt név még nem tartalmazza az
 * „Egyházmegye" szót, megkapja a „Református Egyházmegye" toldatot; ha már
 * tartalmazza, változatlanul marad (nincs duplázás). Üres/None bemenetre üres
 * stringet ad — a hívó dönti el, mi a helykitöltője (hero-cím, nyomtatvány).
 */
export function formatEgyhazmegyeNev(nev: string | null | undefined): string {
  const nyers = (nev || '').trim()
  if (!nyers) return ''
  return nyers.toUpperCase().includes('EGYHÁZMEGYE')
    ? nyers
    : `${nyers} Református Egyházmegye`
}
