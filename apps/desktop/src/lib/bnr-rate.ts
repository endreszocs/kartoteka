/**
 * BNR / Frankfurter árfolyam-lekérdezés DESKTOPRA (2026-06-12, Endre #4
 * bank-import — a webes wizard tükre).
 *
 * A webes `apps/web/lib/finance/bnr-exchange-rate.ts` `fetchBnrRates`
 * logikájának portja. A webview-ból közvetlen fetch a BNR-re a CORS miatt
 * nem megy, ezért a letöltés a Rust-oldali `fetch_page_text` parancson át
 * történik (minta: lib/avatar.ts). A parser (regex-es XML-olvasás) a webes
 * fájlból változatlanul átemelve — a viselkedés 1:1 azonos:
 *
 *   1. kísérlet: BNR — aktuális évre a napi XML, historikus évre az éves XML
 *      (január 1-i nyitóhoz az ELŐZŐ év utolsó publikáltja — könyvelési
 *      gyakorlat: az év eleji nyitót az előző év záró árfolyama értékeli);
 *   2. kísérlet: Frankfurter (ECB) fallback;
 *   3. őszinte hibaüzenet manuális beírási útmutatóval.
 */

import { invoke } from '@tauri-apps/api/core'

import type { BnrRateResult } from '@kartoteka/ui-app'

const BNR_URL = 'https://www.bnr.ro/nbrfxrates.xml'
/** BNR éves historikus XML — pl. 2025-re: nbrfxrates2025.xml. */
const BNR_YEARLY_URL = (year: number) =>
  `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`
// Frankfurter.app → frankfurter.dev áttéréstől (2026) a /v1/ prefix kell.
const FRANKFURTER_LATEST_URL = 'https://api.frankfurter.dev/v1/latest?base=RON&symbols=EUR,HUF'
/** Historikus Frankfurter URL — nem-munkanapra a legközelebbi publikáltat adja. */
const FRANKFURTER_DATE_URL = (dateIso: string) =>
  `https://api.frankfurter.dev/v1/${dateIso}?base=RON&symbols=EUR,HUF`

/** Rust-oldali szöveg-letöltés (CORS-mentes, Endre lakossági IP-jéről). */
async function fetchTextViaRust(url: string): Promise<string> {
  return invoke<string>('fetch_page_text', { url })
}

/**
 * Egy adott deviza árfolyamának kinyerése a BNR XML-ből.
 *
 * Két formátum:
 *   <Rate currency="EUR">4.9532</Rate>
 *   <Rate currency="HUF" multiplier="100">1.2876</Rate>
 *
 * A multiplier-rel osztunk, hogy az árfolyam mindig 1 deviza = X RON legyen.
 */
function extractRate(xml: string, currency: 'EUR' | 'HUF'): number | null {
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

/** BNR napi XML parser (a webes parseBnrXml tükre). */
function parseBnrXml(xml: string): BnrRateResult {
  const dateMatch = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"/i.exec(xml)
  return {
    date: dateMatch?.[1] || null,
    eur: extractRate(xml, 'EUR'),
    huf: extractRate(xml, 'HUF'),
  }
}

/**
 * BNR éves historikus XML-ből a kért dátumhoz legközelebbi (≤ target)
 * publikált árfolyam — ünnep/hétvége esetén az előző publikáció
 * (a webes parseBnrYearlyXml tükre).
 */
function parseBnrYearlyXml(xml: string, targetDate: string): BnrRateResult | null {
  const cubeRegex = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Cube>/gi
  let bestMatch: { date: string; xml: string } | null = null

  let m: RegExpExecArray | null
  while ((m = cubeRegex.exec(xml)) !== null) {
    const cubeDate = m[1]
    const cubeBody = m[2]
    if (cubeDate > targetDate) continue // későbbi publikációk nem érdekelnek
    if (!bestMatch || cubeDate > bestMatch.date) {
      bestMatch = { date: cubeDate, xml: cubeBody }
    }
  }

  // Ha nincs ≤ target publikáció, a legkorábbi elérhetőt vesszük
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
  }
}

/**
 * BNR napi/éves árfolyamok lekérdezése desktopon. Fallback: frankfurter.dev.
 *
 * @param targetDate Ha megadott (pl. "2025-01-01"), a TÖRTÉNELMI árfolyam erre
 *                   a napra (vagy a legközelebbi publikáltra). Ha nincs, a friss.
 */
export async function fetchBnrRatesDesktop(targetDate?: string): Promise<BnrRateResult> {
  const isHistorical = !!targetDate
  const targetYear = targetDate ? Number(targetDate.slice(0, 4)) : new Date().getFullYear()
  const currentYear = new Date().getFullYear()
  const isCurrentYear = targetYear === currentYear

  // 1. kísérlet: BNR (napi vagy éves XML)
  try {
    if (!isHistorical || isCurrentYear) {
      const xml = await fetchTextViaRust(BNR_URL)
      const parsed = parseBnrXml(xml)
      if (parsed.eur || parsed.huf) {
        return { ...parsed, source: 'bnr' }
      }
    } else {
      // Történelmi év: január 1-i nyitóhoz az ELŐZŐ év utolsó publikáltja
      // (pl. 2025-01-01 nyitó → 2024-12-31 BNR árfolyam).
      const isoMonthDay = targetDate!.slice(5) // "MM-DD"
      const useYearForXml = isoMonthDay === '01-01' ? targetYear - 1 : targetYear

      const xml = await fetchTextViaRust(BNR_YEARLY_URL(useYearForXml))
      const searchTarget = isoMonthDay === '01-01' ? `${useYearForXml}-12-31` : targetDate!
      const parsed = parseBnrYearlyXml(xml, searchTarget)
      if (parsed && (parsed.eur || parsed.huf)) {
        return { ...parsed, source: 'bnr' }
      }
    }
  } catch {
    // csendben megyünk tovább a fallback-re
  }

  // 2. kísérlet: Frankfurter (ECB — stabilabb)
  try {
    const url = isHistorical ? FRANKFURTER_DATE_URL(targetDate!) : FRANKFURTER_LATEST_URL
    const jsonText = await fetchTextViaRust(url)
    const json = JSON.parse(jsonText) as {
      date?: string
      rates?: { EUR?: number; HUF?: number }
    }
    // Frankfurter: 1 RON = X EUR / Y HUF → nekünk az inverze kell
    const ronToEur = json.rates?.EUR
    const ronToHuf = json.rates?.HUF
    const eur = ronToEur && ronToEur > 0 ? Number((1 / ronToEur).toFixed(4)) : null
    const huf = ronToHuf && ronToHuf > 0 ? Number((1 / ronToHuf).toFixed(4)) : null
    return {
      date: json.date || null,
      eur,
      huf,
      source: 'frankfurter',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      date: null,
      eur: null,
      huf: null,
      source: 'none',
      error:
        `Sem a BNR, sem a Frankfurter nem elérhető (${msg}). ` +
        'Lehetséges okok: nincs internet-kapcsolat, tűzfal/antivirus blokkol, ' +
        'vagy a BNR/ECB API ideiglenes hibája. Írd be az árfolyamot manuálisan a BNR honlapról: https://www.bnr.ro/Exchange-rates-1224.aspx',
    }
  }
}
