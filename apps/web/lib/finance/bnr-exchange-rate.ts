/**
 * BNR (Banca Naţională a României) napi árfolyam lekérdezés.
 *
 * Forrás: https://www.bnr.ro/nbrfxrates.xml
 *
 * A BNR XML formátum (egyszerűsített):
 *   <DataSet>
 *     <Header>...</Header>
 *     <Body>
 *       <Subject>Reference rates</Subject>
 *       <Cube date="2025-12-31">
 *         <Rate currency="AED">1.3490</Rate>
 *         <Rate currency="EUR">4.9532</Rate>
 *         <Rate currency="HUF" multiplier="100">1.2876</Rate>
 *         ...
 *       </Cube>
 *     </Body>
 *   </DataSet>
 *
 * Mivel a XML kicsi (kb. 20-30 deviza, fix struktúra), regex-szel parseoljuk —
 * nincs új npm dependency. A multiplier attribútum csak néhány devizánál van
 * (pl. HUF, KRW), és azt elosztjuk vele, hogy az árfolyam 1 egységre vonatkozzon.
 *
 * Ha a BNR site nem elérhető vagy formátumváltozás történik, a hibakód
 * visszaadódik, és a UI-ban a felhasználó manuálisan adhat meg árfolyamot.
 */

const BNR_URL = 'https://www.bnr.ro/nbrfxrates.xml'
/** BNR éves historikus XML — pl. 2025-ra: nbrfxrates2025.xml. */
const BNR_YEARLY_URL = (year: number) =>
  `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`
// Frankfurter.app → frankfurter.dev áttéréstől (2026) a /v1/ prefix kell.
const FRANKFURTER_LATEST_URL = 'https://api.frankfurter.dev/v1/latest?base=RON&symbols=EUR,HUF,USD'
/** Historikus Frankfurter URL — ha a dátum nem munkanap, automatikusan a legközelebbi publikáltat adja. */
const FRANKFURTER_DATE_URL = (dateIso: string) =>
  `https://api.frankfurter.dev/v1/${dateIso}?base=RON&symbols=EUR,HUF,USD`
const FETCH_TIMEOUT_MS = 8000

export interface BnrFetchResult {
  /** A publikált árfolyam dátuma (általában az előző munkanap), pl. "2025-12-31". */
  date: string | null
  /** EUR/RON árfolyam (1 EUR = X RON). null, ha nem sikerült beolvasni. */
  eur: number | null
  /** HUF/RON árfolyam (1 HUF = X RON, már elosztva a multiplier-rel). null, ha nem sikerült. */
  huf: number | null
  /** USD/RON árfolyam (1 USD = X RON). null, ha nem sikerült beolvasni. */
  usd: number | null
  /** Forrás: 'bnr' — BNR hivatalos, 'frankfurter' — ECB fallback, 'none' — sikertelen. */
  source?: 'bnr' | 'frankfurter' | 'none'
  /** Egyéb hiba esetén a hibaüzenet. */
  error?: string
}

/**
 * AbortController alapú fetch timeout-tal — a Next.js 16 natív fetch némelyik
 * Windows környezetben "fetch failed"-del hal el, ha nincs explicit timeout
 * (pl. DNS-szű lassulás, lokális tűzfal, antivirus proxy).
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { next?: { revalidate?: number } } = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * BNR napi árfolyamok lekérdezése. Fallback: frankfurter.dev (ECB alapú).
 *
 * @param targetDate  Ha megadot (pl. "2025-01-01"), a TÖRTÉNELMI árfolyamot
 *                    adjuk vissza erre a napra (vagy a legközelebbi publikáltra,
 *                    ha az adott nap ünnep/hétvége). Ha nincs megadva, az
 *                    AKTUÁLIS BNR árfolyam.
 *
 * Server-oldalon hívható (server action vagy API route), nem a böngészőben
 * (CORS politika miatt a BNR site nem engedi).
 *
 * **Könyvelési megjegyzés**: az év eleji (január 1-i) nyitó egyenleghez az
 * ELŐZŐ év utolsó publikált árfolyama használatos (pl. 2024. december 31-i
 * BNR/ECB árfolyam). A Frankfurter API ezt automatikusan kezeli: ha
 * `2025-01-01`-re kérsz, az utolsó publikáltat (2024-12-31) adja vissza.
 */
export async function fetchBnrRates(targetDate?: string): Promise<BnrFetchResult> {
  const isHistorical = !!targetDate
  const targetYear = targetDate ? Number(targetDate.slice(0, 4)) : new Date().getFullYear()
  const currentYear = new Date().getFullYear()
  const isCurrentYear = targetYear === currentYear

  // 1. kísérlet: BNR
  //   - AKTUÁLIS évre a napi XML (közvetlen, frissebb)
  //   - HISTORIKUS évre az éves XML + esetleg az ELŐZŐ év utolsó napi
  //     publikációja (mert január 1-2 ünnep, a nyitót december 31 zárja)
  try {
    if (!isHistorical || isCurrentYear) {
      const resp = await fetchWithTimeout(BNR_URL, {
        next: { revalidate: 3600 },
        headers: {
          'User-Agent': 'KARTOTEKA-FX-Reval/1.0',
          Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        },
      })

      if (resp.ok) {
        const xml = await resp.text()
        const parsed = parseBnrXml(xml)
        if (parsed.eur || parsed.huf || parsed.usd) {
          return { ...parsed, source: 'bnr' }
        }
      }
    } else {
      // Történelmi év: év eleji nyitóhoz az ELŐZŐ év utolsó publikáltját
      // használjuk (pl. 2025-01-01 nyitó → 2024-12-31 BNR árfolyam).
      // Ha nincs vagy nem pont január 1., a célév XML-ből próbáljuk.
      const isoMonthDay = targetDate!.slice(5) // "MM-DD"
      const useYearForXml = isoMonthDay === '01-01' ? targetYear - 1 : targetYear

      const resp = await fetchWithTimeout(BNR_YEARLY_URL(useYearForXml), {
        next: { revalidate: 86400 }, // historikus adatok 1 napig cache-elhetők
        headers: {
          'User-Agent': 'KARTOTEKA-FX-Reval/1.0',
          Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        },
      })

      if (resp.ok) {
        const xml = await resp.text()
        // Ha az előző év XML-jéből olvasunk, a "december utolsó publikált napot" keressük,
        // ami egyszerűen a legnagyobb Cube date az XML-ben (év vége)
        const searchTarget = isoMonthDay === '01-01' ? `${useYearForXml}-12-31` : targetDate!
        const parsed = parseBnrYearlyXml(xml, searchTarget)
        if (parsed && (parsed.eur || parsed.huf || parsed.usd)) {
          return { ...parsed, source: 'bnr' }
        }
      }
    }
  } catch {
    // csendben megyünk tovább a fallback-re
  }

  // 2. kísérlet: Frankfurter (ECB — stabilabb, HTTP/2-n fut)
  try {
    const url = isHistorical ? FRANKFURTER_DATE_URL(targetDate!) : FRANKFURTER_LATEST_URL
    const resp = await fetchWithTimeout(url, {
      next: { revalidate: isHistorical ? 86400 : 3600 },
      headers: { Accept: 'application/json' },
    })

    if (!resp.ok) {
      return {
        date: null,
        eur: null,
        huf: null,
        usd: null,
        source: 'none',
        error: `BNR nem elérhető, Frankfurter fallback hibakód: ${resp.status} ${resp.statusText}. Írd be az árfolyamot manuálisan.`,
      }
    }

    const json = (await resp.json()) as {
      date?: string
      rates?: { EUR?: number; HUF?: number; USD?: number }
    }
    // Frankfurter: 1 RON = X EUR, 1 RON = Y HUF, 1 RON = Z USD → nekünk az inverze kell
    // 1 EUR = 1/X RON, 1 HUF = 1/Y RON, 1 USD = 1/Z RON
    const ronToEur = json.rates?.EUR
    const ronToHuf = json.rates?.HUF
    const ronToUsd = json.rates?.USD
    const eur = ronToEur && ronToEur > 0 ? Number((1 / ronToEur).toFixed(4)) : null
    const huf = ronToHuf && ronToHuf > 0 ? Number((1 / ronToHuf).toFixed(4)) : null
    const usd = ronToUsd && ronToUsd > 0 ? Number((1 / ronToUsd).toFixed(4)) : null
    return {
      date: json.date || null,
      eur,
      huf,
      usd,
      source: 'frankfurter',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ismeretlen hiba'
    return {
      date: null,
      eur: null,
      huf: null,
      usd: null,
      source: 'none',
      error:
        `Sem a BNR, sem a Frankfurter nem elérhető (${msg}). ` +
        'Lehetséges okok: hálózati kapcsolat megszakadt, lokális tűzfal/antivirus blokkol, ' +
        'vagy a BNR/ECB API ideiglenes hibája. Írd be az árfolyamot manuálisan a BNR honlapról: https://www.bnr.ro/Exchange-rates-1224.aspx',
    }
  }
}

/**
 * BNR éves historikus XML-ből kikeresi a kért dátumhoz legközelebbi
 * publikált árfolyamot. A BNR formátuma:
 *
 * ```xml
 * <Body>
 *   <Cube date="2025-01-02">
 *     <Rate currency="EUR">4.9720</Rate>
 *     <Rate currency="HUF" multiplier="100">1.2103</Rate>
 *     ...
 *   </Cube>
 *   <Cube date="2025-01-03">...</Cube>
 *   ...
 * </Body>
 * ```
 *
 * Ha a kért dátum ünnep/hétvége (pl. január 1.), a LEGUTOLSÓ publikált
 * ≤ kért dátum napot használjuk. Ez egyezik a könyvelési gyakorlattal
 * (év eleji nyitó → előző év utolsó publikálta).
 */
export function parseBnrYearlyXml(xml: string, targetDate: string): BnrFetchResult | null {
  // Minden <Cube date="YYYY-MM-DD"> blokk kinyerése
  const cubeRegex = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Cube>/gi
  const target = targetDate
  let bestMatch: { date: string; xml: string } | null = null

  let m: RegExpExecArray | null
  while ((m = cubeRegex.exec(xml)) !== null) {
    const cubeDate = m[1]
    const cubeBody = m[2]
    if (cubeDate > target) continue // későbbi publikációk nem érdekelnek
    if (!bestMatch || cubeDate > bestMatch.date) {
      bestMatch = { date: cubeDate, xml: cubeBody }
    }
  }

  // Ha nem találunk ≤ target-hez publikációt (pl. az év elejére nem kaptunk
  // január 1-ig érvényes árfolyamot), a legkisebb elérhetőt vesszük
  if (!bestMatch) {
    cubeRegex.lastIndex = 0
    while ((m = cubeRegex.exec(xml)) !== null) {
      const cubeDate = m[1]
      const cubeBody = m[2]
      if (!bestMatch || cubeDate < bestMatch.date) {
        bestMatch = { date: cubeDate, xml: cubeBody }
      }
    }
  }

  if (!bestMatch) return null

  return {
    date: bestMatch.date,
    eur: extractRate(bestMatch.xml, 'EUR'),
    huf: extractRate(bestMatch.xml, 'HUF'),
    usd: extractRate(bestMatch.xml, 'USD'),
  }
}

/**
 * BNR XML parser regex-szel.
 *
 * Külön exportálva, hogy unit-tesztelhető legyen mock XML-lel.
 */
export function parseBnrXml(xml: string): BnrFetchResult {
  // <Cube date="YYYY-MM-DD"> attribútum kinyerése
  const dateMatch = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"/i.exec(xml)
  const date = dateMatch?.[1] || null

  return {
    date,
    eur: extractRate(xml, 'EUR'),
    huf: extractRate(xml, 'HUF'),
    usd: extractRate(xml, 'USD'),
  }
}

/**
 * Egy adott deviza árfolyamának kinyerése.
 *
 * Két formátum:
 *   <Rate currency="EUR">4.9532</Rate>
 *   <Rate currency="HUF" multiplier="100">1.2876</Rate>
 *
 * A multiplier-rel osztunk, hogy az árfolyam mindig 1 deviza = X RON formában legyen.
 */
function extractRate(xml: string, currency: 'EUR' | 'HUF' | 'USD'): number | null {
  // A regex case-insensitive és toleráns a whitespace-re.
  // A multiplier opcionális — ha hiányzik, 1.
  const pattern = new RegExp(
    `<Rate\\s+currency="${currency}"(?:\\s+multiplier="(\\d+)")?\\s*>\\s*([\\d.]+)\\s*<\\/Rate>`,
    'i',
  )
  const match = pattern.exec(xml)
  if (!match) return null

  const multiplier = parseInt(match[1] || '1', 10)
  const value = parseFloat(match[2])

  if (!Number.isFinite(value) || multiplier <= 0) return null

  return value / multiplier
}
