/**
 * Séma-drift felismerés (KÖZÖS helper) — 2026-08-15.
 *
 * MIÉRT: a repó és az éles adatbázis NÉMÁN széthúzhat (a migration-fájl nem
 * bizonyíték arra, hogy le is futott — ismert hibaosztály). Amikor a kód egy
 * ÚJ oszlopot ír vagy olvas, a PostgREST „Could not find the '…' column" /
 * "column … does not exist" hibával áll le. Az ilyen írásoknál a hívó
 * eldöntheti: (a) újrapróbálja az új oszlopok NÉLKÜL (opcionális pecsét-mezők,
 * pl. *_finalized_at), vagy (b) hangos magyar hibával megáll (kötelező zászló,
 * pl. valasztok_finalized — enélkül a funkció nem létezik).
 *
 * Egy helyen él, mert a penzugy/leltar/valasztok akciók MIND ugyanezt a
 * felismerést használják — széthúzó másolat tilos.
 */
export function isMissingColumnError(message?: string | null): boolean {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}
