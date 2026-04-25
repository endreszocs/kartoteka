/**
 * Bank-import parser registry — A-M7.10a (2026-04-25).
 *
 * Egységes parser-függvény signatúra mindhárom bank-formátumhoz. A desktop UI
 * (és a későbbi web wrapper) egyetlen `parseBankExport(provider, buffer)`
 * hívással kezelheti mindet.
 *
 * Most:
 *   - BCR — teljes (a webapp parser portolva, A-M7.10a)
 *   - Raiffeisen — skeleton (visszaad placeholder hibát)
 *   - BT — skeleton (visszaad placeholder hibát)
 *
 * Új parser hozzáadása: implementáld a `parseRaiffeisenExcel` / `parseBtExcel`
 * függvényt a `raiffeisen.ts` / `bt.ts` fájlban a `parseBcrExcel` mintájára,
 * és cseréld le a placeholdert ebben a registry-ben.
 */

import type { BankParseResult, BankProvider } from '@kartoteka/validations'

import { parseBcrExcel } from './bcr'

export type BankParser = (buffer: ArrayBuffer | Uint8Array) => BankParseResult

const PLACEHOLDER_MESSAGE =
  'Ez a bank-formátum még nem támogatott. Egyelőre csak a BCR XLSX export működik. Más bankok hozzáadása folyamatban.'

function notImplementedParser(): BankParseResult {
  return {
    transactions: [],
    detectedHeaders: {},
    error: PLACEHOLDER_MESSAGE,
  }
}

export const BANK_PARSERS: Record<BankProvider, BankParser> = {
  bcr: parseBcrExcel,
  raiffeisen: () => notImplementedParser(),
  bt: () => notImplementedParser(),
}

/**
 * Univerzális belépési pont a bank-export parsoláshoz.
 *
 * @example
 *   const buffer = await readFileAsArrayBuffer(file)
 *   const result = parseBankExport('bcr', buffer)
 *   if (result.error) { /* show error *\/ }
 *   else { /* result.transactions feldolgozása *\/ }
 */
export function parseBankExport(
  provider: BankProvider,
  buffer: ArrayBuffer | Uint8Array,
): BankParseResult {
  const parser = BANK_PARSERS[provider]
  if (!parser) {
    return {
      transactions: [],
      detectedHeaders: {},
      error: `Ismeretlen bank-szolgáltató: ${provider}`,
    }
  }
  return parser(buffer)
}

export { parseBcrExcel } from './bcr'

export {
  matchBankTransactionsUseCase,
  type MatchBankTransactionsCtx,
  type MatchBankTransactionsInput,
  type MatchBankTransactionsResultOrError,
} from './matcher'
