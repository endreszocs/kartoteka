/**
 * Oblio REST API kliens.
 *
 * Egységes wrapper az Oblio API végpontokra. Minden hívás Bearer tokennel
 * authentikál (az `oblio-auth.ts` kezeli a token cache-t).
 *
 * Server-oldalon fut. A hibákat `OblioError`-ré konvertálja.
 */

import 'server-only'
import { getOblioToken, OBLIO_BASE_URL } from './oblio-auth'
import { OblioError, oblioErrorFromStatus, oblioNetworkError } from './oblio-errors'
import type {
  OblioCompaniesResponse,
  OblioInvoiceCreateRequest,
  OblioInvoiceResponse,
  OblioCollectRequest,
  OblioCollectResponse,
  OblioInvoiceDeleteRequest,
  OblioInvoiceDeleteResponse,
  OblioInvoiceListParams,
  OblioInvoiceListResponse,
} from './oblio-types'

const TIMEOUT_MS = 20_000

/**
 * Belső: autentikált fetch az Oblio API-ra.
 */
async function oblioFetch<T>(
  email: string,
  apiSecret: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await getOblioToken(email, apiSecret)

  let resp: Response
  try {
    resp = await fetch(`${OBLIO_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw oblioNetworkError(err)
  }

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => '')

    // Ha 401, próbáljuk újra egyszer (token lejárt?)
    if (resp.status === 401) {
      const { clearTokenCache } = await import('./oblio-auth')
      clearTokenCache(email)
      const newToken = await getOblioToken(email, apiSecret)

      let retryResp: Response
      try {
        retryResp = await fetch(`${OBLIO_BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${newToken}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (err) {
        throw oblioNetworkError(err)
      }

      if (!retryResp.ok) {
        const retryBody = await retryResp.text().catch(() => '')
        throw oblioErrorFromStatus(retryResp.status, retryBody)
      }

      return retryResp.json() as Promise<T>
    }

    throw oblioErrorFromStatus(resp.status, errorBody)
  }

  return resp.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────
// Publikus API metódusok
// ─────────────────────────────────────────────────────────────

/**
 * A fiók alá tartozó cégek lekérdezése (CIF-ek).
 * Hasznos a konfiguráció tesztelésekor.
 */
export async function getCompanies(
  email: string,
  apiSecret: string,
): Promise<OblioCompaniesResponse> {
  return oblioFetch(email, apiSecret, 'GET', '/api/nomenclature/companies')
}

/**
 * Számla kiállítása.
 *
 * A válaszban kapjuk a PDF URL-t és az e-Factura UUID-t (ha SPV-n megy).
 */
export async function createInvoice(
  email: string,
  apiSecret: string,
  request: OblioInvoiceCreateRequest,
): Promise<OblioInvoiceResponse> {
  return oblioFetch(email, apiSecret, 'POST', '/api/docs/invoice', request as unknown as Record<string, unknown>)
}

/**
 * Számla lekérdezése sorozat + szám alapján.
 *
 * A válaszból a PDF URL és az e-Factura státusz lekérdezhető.
 */
export async function getInvoice(
  email: string,
  apiSecret: string,
  cif: string,
  seriesName: string,
  number: number,
): Promise<OblioInvoiceResponse> {
  return oblioFetch(
    email,
    apiSecret,
    'GET',
    `/api/docs/invoice?cif=${encodeURIComponent(cif)}&seriesName=${encodeURIComponent(seriesName)}&number=${number}`,
  )
}

/**
 * Számla-lista lekérdezés (search). Dátum, partner, sorozat szerint szűrhető.
 *
 * FŐ HASZNÁLATI ESET: egy KARTOTEKA tranzakcióhoz tartozik-e Oblio számla?
 * Kérdezzük: cif = gyülekezet CIF, issuedAfter = tranzakció dátum,
 * issuedBefore = tranzakció dátum, client[name] = partner neve,
 * withEInvoiceStatus = 1. Egyetlen hívással választ kapunk.
 */
export async function listInvoices(
  email: string,
  apiSecret: string,
  params: OblioInvoiceListParams,
): Promise<OblioInvoiceListResponse> {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'boolean') {
      qs.set(key, value ? '1' : '0')
    } else {
      qs.set(key, String(value))
    }
  }
  return oblioFetch(email, apiSecret, 'GET', `/api/docs/invoice?${qs.toString()}`)
}

/**
 * Kifizetés rögzítése egy kiállított számlán.
 */
export async function collectInvoice(
  email: string,
  apiSecret: string,
  request: OblioCollectRequest,
): Promise<OblioCollectResponse> {
  return oblioFetch(email, apiSecret, 'PUT', '/api/docs/invoice/collect', request as unknown as Record<string, unknown>)
}

/**
 * Számla törlése / sztornó.
 *
 * VIGYÁZAT: ha a számla már SPV-re felment (e-Factura), nem törlés
 * történik, hanem sztornó-számla kiállítása szükséges. Az Oblio API
 * doksi szerint a DELETE csak tervezet-állapotú számlákat töröl.
 * SPV-t érintő számlánál inkább sztornó-számlát kell kiállítani (POST).
 */
export async function deleteInvoice(
  email: string,
  apiSecret: string,
  request: OblioInvoiceDeleteRequest,
): Promise<OblioInvoiceDeleteResponse> {
  return oblioFetch(email, apiSecret, 'DELETE', '/api/docs/invoice', request as unknown as Record<string, unknown>)
}

/**
 * Kapcsolat tesztelése — a `getCompanies`-t hívja és megnézi, hogy
 * a megadott CIF szerepel-e az Oblio fiók alatt.
 */
export async function testConnection(
  email: string,
  apiSecret: string,
  expectedCif: string,
): Promise<{
  success: boolean
  companyName?: string
  error?: string
}> {
  try {
    const resp = await getCompanies(email, apiSecret)

    if (!resp.data || resp.data.length === 0) {
      return { success: false, error: 'Az Oblio fiók alatt nem találhatóak cégek.' }
    }

    const match = resp.data.find((c) => c.cif === expectedCif)
    if (!match) {
      return {
        success: false,
        error: `A megadott CIF (${expectedCif}) nem található az Oblio fiók alatt. Elérhető CIF-ek: ${resp.data.map((c) => c.cif).join(', ')}`,
      }
    }

    return { success: true, companyName: match.company }
  } catch (err) {
    if (err instanceof OblioError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: String(err) }
  }
}
