/**
 * Közös hiba-üzenet konverter.
 *
 * A Tauri `invoke` Rust-oldali `Result<T, String>`-ből a JS oldalon
 * egyszerű **string**-et ad vissza hibánál (NEM Error-instance). Ezt
 * a `err instanceof Error` check nem fogja el, és a felhasználó
 * „ismeretlen hiba" üzenetet kap a valódi üzenet helyett.
 *
 * Ez a helper minden szokásos forma (Error, string, object, null)
 * ellen robusztus, és a Rust-oldali String-eket is továbbadja.
 */
export function errorMessage(err: unknown): string {
  if (err === null || err === undefined) return 'ismeretlen hiba'
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    // Supabase-like { message, code, details } szerkezetek
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    try {
      return JSON.stringify(err)
    } catch {
      return 'nem sorialható hiba-objektum'
    }
  }
  return String(err)
}
