import 'server-only'

interface HeaderReader {
  get(name: string): string | null
}

function parseOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/** Railwayen az env az igazságforrás; lokális fejlesztésnél a host
 * header a fallback. A kapott origin soha nem tartalmaz útvonalat vagy queryt. */
export function resolvePublicAppOrigin(
  requestHeaders?: HeaderReader,
): string | null {
  const configured = parseOrigin(process.env.NEXT_PUBLIC_APP_URL?.trim())
  if (configured) return configured

  // E-mailes Auth callbacket productionben soha nem építünk kérésből
  // származó Host / X-Forwarded-Host headerből. Hibás Railway env esetén
  // inkább fail closed, mint hogy host-header poisoninggel támadói link
  // kerülhessen a Supabase megerősítő levélbe.
  if (process.env.NODE_ENV === 'production') return null

  const forwardedHost = requestHeaders
    ?.get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim()
  const host = forwardedHost || requestHeaders?.get('host')?.trim()
  if (!host || /[\s/\\]/.test(host)) return null

  const forwardedProto = requestHeaders
    ?.get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
  const protocol =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : 'http'

  const fallbackOrigin = parseOrigin(`${protocol}://${host}`)
  if (!fallbackOrigin) return null

  const fallbackHostname = new URL(fallbackOrigin).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(fallbackHostname)) {
    return null
  }

  return fallbackOrigin
}
