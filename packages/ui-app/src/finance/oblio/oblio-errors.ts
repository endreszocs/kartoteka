/**
 * Oblio API hibakezelés.
 *
 * Az `OblioError` osztály egységes módon kezeli az API-ból, hálózatból,
 * és validációból származó hibákat. A server action-ök ezt fordítják
 * le felhasználói szöveggé.
 */

export type OblioErrorCode =
  | 'AUTH_FAILED'         // 401 — token invalid, API secret rossz
  | 'FORBIDDEN'           // 403 — nincs jog a CIF-re
  | 'NOT_FOUND'           // 404 — pl. számla nem található
  | 'VALIDATION_ERROR'    // 422 — hibás input (CUI formátum, stb.)
  | 'RATE_LIMITED'        // 429 — túl sok kérés
  | 'SERVER_ERROR'        // 500 — Oblio szerver hiba
  | 'NETWORK_ERROR'       // fetch timeout, DNS, stb.
  | 'DUPLICATE'           // már létezik számla erre a hónapra
  | 'CONFIG_MISSING'      // nincs Oblio konfig a gyülekezethez
  | 'DECRYPT_FAILED'      // az api_secret visszafejtése sikertelen
  | 'UNKNOWN'             // egyéb

export class OblioError extends Error {
  readonly code: OblioErrorCode
  readonly httpStatus?: number
  readonly oblioMessage?: string

  constructor(
    code: OblioErrorCode,
    userMessage: string,
    options?: {
      httpStatus?: number
      oblioMessage?: string
      cause?: unknown
    },
  ) {
    super(userMessage, { cause: options?.cause })
    this.name = 'OblioError'
    this.code = code
    this.httpStatus = options?.httpStatus
    this.oblioMessage = options?.oblioMessage
  }
}

/**
 * HTTP státuszkódból hibaobjektum létrehozása.
 */
export function oblioErrorFromStatus(
  status: number,
  body: string | Record<string, unknown>,
): OblioError {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)

  switch (status) {
    case 401:
      return new OblioError(
        'AUTH_FAILED',
        'Az Oblio API kulcs érvénytelen vagy lejárt. Ellenőrizd a beállításokban.',
        { httpStatus: 401, oblioMessage: bodyStr },
      )
    case 403:
      return new OblioError(
        'FORBIDDEN',
        'Nincs jogod ehhez a művelethez az Oblio-ban. Ellenőrizd a CIF-et.',
        { httpStatus: 403, oblioMessage: bodyStr },
      )
    case 404:
      return new OblioError(
        'NOT_FOUND',
        'Az erőforrás nem található az Oblio-ban.',
        { httpStatus: 404, oblioMessage: bodyStr },
      )
    case 422:
      return new OblioError(
        'VALIDATION_ERROR',
        `Az Oblio visszautasította az adatokat: ${bodyStr}`,
        { httpStatus: 422, oblioMessage: bodyStr },
      )
    case 429:
      return new OblioError(
        'RATE_LIMITED',
        'Túl sok kérés az Oblio felé. Várj pár percet és próbáld újra.',
        { httpStatus: 429, oblioMessage: bodyStr },
      )
    default:
      if (status >= 500) {
        return new OblioError(
          'SERVER_ERROR',
          'Az Oblio szolgáltatás átmenetileg nem elérhető. Próbáld újra pár perc múlva.',
          { httpStatus: status, oblioMessage: bodyStr },
        )
      }
      return new OblioError(
        'UNKNOWN',
        `Váratlan Oblio válasz (${status}): ${bodyStr}`,
        { httpStatus: status, oblioMessage: bodyStr },
      )
  }
}

/**
 * Hibás fetch válasz (hálózati hiba, timeout) → OblioError.
 */
export function oblioNetworkError(cause: unknown): OblioError {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new OblioError(
    'NETWORK_ERROR',
    `Kapcsolódási hiba az Oblio-hoz: ${message}. Ellenőrizd az internetkapcsolatot.`,
    { cause },
  )
}
