/**
 * bevetel-partner-nev — a banki kivonat partner-nevének NORMALIZÁLÁSA a
 * bevétel-oldali partner-memória kulcsához (Endre 2026-08-28-i kérése).
 *
 * SZÁNDÉKOSAN konzervatív: kisbetűsítés + trim + többes szóköz össze.
 * Írásjelet NEM vetünk el — a repó dokumentált csapdája, hogy az
 * agresszív normalizálás („S.A." → „SA") KÜLÖNBÖZŐ cégeket mosna össze.
 * A memória célja a PONTOS ismétlődés felismerése (a bank ugyanazt a nevet
 * küldi minden hónapban), nem a fuzzy-egyezés.
 */
export function normalizaltBankiNev(nev: string | null | undefined): string {
  return (nev ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}
