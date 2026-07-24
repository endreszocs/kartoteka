const MAX_PUBLIC_URL_LENGTH = 2048

/**
 * Publikus, kattinthato vagy kepforraskent hasznalt kulso URL kapuja.
 *
 * A `new URL()` onmagaban a `javascript:` es `data:` semakat is ervenyesnek
 * tekinti. Ezeket ezert explicit tiltjuk, es a felhasznalonev/jelszo reszt is
 * elutasitjuk, hogy a megjelenitett host ne lehessen felrevezeto.
 */
export function safePublicHttpsUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_PUBLIC_URL_LENGTH) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null

    return parsed.href
  } catch {
    return null
  }
}

export function isSafePublicHttpsUrl(value: string): boolean {
  return safePublicHttpsUrl(value) !== null
}
