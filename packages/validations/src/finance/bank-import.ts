/**
 * Bank-import zod sémák — A-M7.10a (2026-04-25).
 *
 * A pénzügyi modul kiegészítése: a lelkész a bankjából exportált fájlt feltölti,
 * a rendszer parsolja és párosítja a meglévő befizetés/kiadás tételekkel.
 *
 * Támogatott bankok (a desktop wave-ben):
 *   - BCR (Banca Comercială Română) — XLSX export
 *   - Raiffeisen — skeleton (későbbi)
 *   - Banca Transilvania (BT) — skeleton (későbbi)
 *
 * Az `amount` előjeles:
 *   > 0 — bevétel (a banki számlán jóváírás)
 *   < 0 — kiadás (a banki számlán terhelés)
 */

import { z } from 'zod'

export const BANK_PROVIDER_VALUES = ['bcr', 'raiffeisen', 'bt'] as const
export const bankProviderSchema = z.enum(BANK_PROVIDER_VALUES)
export type BankProvider = z.infer<typeof bankProviderSchema>

export const BANK_PROVIDER_LABELS: Record<BankProvider, string> = {
  bcr: 'BCR (Banca Comercială Română)',
  raiffeisen: 'Raiffeisen Bank',
  bt: 'Banca Transilvania',
}

/**
 * Egyetlen banki tranzakció a bank-export fájlból.
 * Az adatok már normalizáltak — a bankspecifikus parser ezt produkálja.
 */
export const bankTransactionSchema = z.object({
  /** A forrás-fájl sorindex-e (1-től) — a hibák visszakereséséhez. */
  rowIndex: z.number().int().nonnegative(),
  /** Tranzakció dátuma, ISO 'YYYY-MM-DD'. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum-formátum.'),
  /** A bank által küldött leírás (megjegyzés / közlemény). */
  description: z.string().min(1),
  /** Banki referencia (opcionális — pl. BCR-ben „Referinta tranzactiei"). */
  reference: z.string().nullable().optional(),
  /**
   * Előjeles összeg RON-ban:
   *   > 0 — bevétel (jóváírás)
   *   < 0 — kiadás (terhelés)
   *
   * A 0-ás (semlegesítő) tranzakciók már a parsernél kiszűrve.
   */
  amount: z.number().refine((n) => n !== 0 && Number.isFinite(n), {
    message: 'Az összeg nem lehet 0 vagy érvénytelen.',
  }),
  /** Egyenleg a tranzakció után (opcionális — nem minden bank exportálja). */
  balance: z.number().nullable().optional(),
  /** Partner / kedvezményezett / küldő (opcionális — ha kiolvasható). */
  counterparty: z.string().nullable().optional(),
})
export type BankTransaction = z.infer<typeof bankTransactionSchema>

export const bankParseResultSchema = z.object({
  transactions: z.array(bankTransactionSchema),
  /** A fájlban felismert oszlop-fejlécek (debug a UI-ban). */
  detectedHeaders: z.record(z.string(), z.string()),
  /** Egyetlen üzenet, ha a parse teljesen sikertelen (különben null). */
  error: z.string().nullable(),
})
export type BankParseResult = z.infer<typeof bankParseResultSchema>

// ─────────────────────────────────────────────────────────────────────────
// A-M7.10b — Matcher (BankTransaction → meglévő befizetés/kiadás párosítás)
// ─────────────────────────────────────────────────────────────────────────

export const MATCH_STATUS_VALUES = [
  'matched', // egyetlen biztos egyezés
  'multiple', // több potenciális egyezés (user dönt)
  'unmatched', // nincs egyezés (új tételként importálható)
  'duplicate', // a banki sor már korábban importálva volt (sync_state-szerű duplikáció-detekció)
] as const
export const matchStatusSchema = z.enum(MATCH_STATUS_VALUES)
export type MatchStatus = z.infer<typeof matchStatusSchema>

export const matchCandidateSchema = z.object({
  /** A meglévő tétel típusa: bevétel = befizetés, kiadás = kiadás. */
  tipus: z.enum(['befizetes', 'kiadas']),
  /** Server PK (int). */
  id: z.number().int().nonnegative(),
  iratszam: z.string(),
  datum: z.string(),
  osszeg: z.number(),
  irattipus: z.string(),
  /** Mennyire pontos az egyezés — 1.0 = pontos, 0.5 = toleráns. */
  confidence: z.number().min(0).max(1),
  /** Magyarázat a matchről (user-facing). */
  reason: z.string(),
})
export type MatchCandidate = z.infer<typeof matchCandidateSchema>

export const bankMatchRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  transaction: bankTransactionSchema,
  status: matchStatusSchema,
  /** Ha 'matched': egyetlen jelölt. Ha 'multiple': mindegyik. Ha 'unmatched': üres. */
  candidates: z.array(matchCandidateSchema),
  /** Magyarázat ha 'unmatched' (pl. „nincs befizetés ezen a dátumon"). */
  unmatchedReason: z.string().nullable().optional(),
})
export type BankMatchRow = z.infer<typeof bankMatchRowSchema>

export const bankMatchResultSchema = z.object({
  rows: z.array(bankMatchRowSchema),
  summary: z.object({
    matched: z.number().int().nonnegative(),
    multiple: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
  }),
})
export type BankMatchResult = z.infer<typeof bankMatchResultSchema>
