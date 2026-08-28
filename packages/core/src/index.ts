/**
 * @kartoteka/core — közös business logic réteg.
 *
 * M6.1 skeleton (2026-04-21). A valós tartalom az M7+ modul-hullámokból kerül
 * ide, domain-mappákba:
 *   - finance/   — chitanta, bank-import, tva, oblio, budget, jarulek, finalization
 *   - members/   — szemely, csalad, presbyter, voter
 *   - anyakonyv/ — kereszteles, hazassag, temetes
 *   - minutes/, inventory/, filing/, annual-report/, programs/, sirhelyek/
 *
 * Use-case minta (kötelező forma minden új üzleti műveletnél):
 *
 *   export interface IssueChitantaInput { ... }  // zod-validated
 *   export interface IssueChitantaCtx {
 *     supabase: SupabaseClient
 *     runtime: 'web' | 'desktop'
 *     audit: AuditLogger
 *   }
 *   export async function issueChitantaUseCase(
 *     input: IssueChitantaInput,
 *     ctx: IssueChitantaCtx,
 *   ): Promise<IssueChitantaResult> { ... }
 *
 * Biztonsági réteg: a use-case-ek RLS-védett Supabase-hívásokra támaszkodnak.
 * A service_role kulcsot igénylő admin műveletek NEM ide, hanem az apps/web
 * server-only helper-ébe kerülnek.
 *
 * Külső API (Oblio / Brevo / Resend / Anthropic Claude) nem hívódhat innen —
 * azok Supabase Edge Function-be (`supabase/functions/*`) kerülnek az M6.4-ben.
 *
 * Jelenlegi use-case-ek:
 *   - mail/send                 → sendMailUseCase (Edge Function wrapper)      [A-M6.4b]
 *   - finance/chitanta-tomb/list → listChitantaTombokUseCase (online-first,    [A-M7.1a]
 *                                  offline-fallback minta minden jövőbeli use-case-nek)
 */

export {
  sendMailUseCase,
  type EmailRecipient,
  type MailSendArgs,
  type MailSendCtx,
  type MailSendResult,
} from './mail/send'

export {
  CHITANTA_TOMBOK_TABLE,
  listChitantaTombokUseCase,
  type ListChitantaTombokCtx,
  type ListChitantaTombokInput,
  type ListChitantaTombokResult,
} from './finance/chitanta-tomb/list'

export {
  createChitantaTombUseCase,
  type CreateChitantaTombCtx,
  type CreateChitantaTombResult,
} from './finance/chitanta-tomb/create'

export {
  getActiveChitantaTombStatusUseCase,
  type GetActiveChitantaTombStatusCtx,
  type GetActiveChitantaTombStatusInput,
  type GetActiveChitantaTombStatusResult,
} from './finance/chitanta-tomb/active-status'

export {
  computeChitantaTombUsage,
  extractNyomdaiSzamFromIratszam,
  getChitantaTombUsageUseCase,
  type ChitantaTombRangeLike,
  type ChitantaTombUsage,
  type GetChitantaTombUsageCtx,
  type GetChitantaTombUsageInput,
  type GetChitantaTombUsageResult,
  type NyomdaiSzamAdat,
} from './finance/chitanta-tomb/usage'

export {
  issueChitantaUseCase,
  type IssueChitantaCtx,
  type IssueChitantaResult,
  type OfflineChitantaBackend,
  type OfflineMutation,
  type LocalChitantaRow,
} from './finance/chitanta/issue'

export {
  listChitantasUseCase,
  type ListChitantasCtx,
  type ListChitantasResult,
} from './finance/chitanta/list'

export {
  stornoChitantaUseCase,
  type StornoChitantaCtx,
  type StornoChitantaResult,
} from './finance/chitanta/storno'

export {
  getChitantaForPrintUseCase,
  type GetChitantaForPrintCtx,
  type GetChitantaForPrintInput,
  type GetChitantaForPrintResult,
} from './finance/chitanta/print'

// Nyugta auto-kiállítás befizetésből + batch lookup (Kassza fül) — C1c
export {
  autoIssueChitantaForBefizetesUseCase,
  getChitantakForBefizetesekUseCase,
  type AutoIssueChitantaForBefizetesInput,
  type AutoIssueChitantaForBefizetesResult,
  type AutoIssueChitantaCtx,
  type GetChitantakForBefizetesekInput,
  type GetChitantakForBefizetesekResult,
  type GetChitantakForBefizetesekCtx,
} from './finance/chitanta/auto-issue-for-befizetes'

export {
  refillChitantaWalletUseCase,
  type RefillChitantaWalletCtx,
  type RefillChitantaWalletInput,
  type RefillChitantaWalletResult,
} from './finance/chitanta-wallet/refill'

export {
  refillIratszamWalletUseCase,
  type IratszamTipus,
  type RefillIratszamWalletCtx,
  type RefillIratszamWalletInput,
  type RefillIratszamWalletResult,
} from './finance/iratszam-wallet/refill'

export {
  BANK_PARSERS,
  matchBankTransactionsUseCase,
  parseBcrExcel,
  parseBankExport,
  type BankParser,
  type MatchBankTransactionsCtx,
  type MatchBankTransactionsInput,
  type MatchBankTransactionsResultOrError,
} from './finance/bank-import'

// ── HASONLÓ (esetleg duplikált) TÉTEL FIGYELMEZTETÉS — Endre 8. kérése (2026-08-27)
// A párosítás tiszta magja + a név-hasonlóság. A web (serveraction) ÉS a desktop
// (online lookup) UGYANINNEN dönt, hogy mi számít „kb. ugyanaz"-nak.
export {
  HASONLO_NAP_ABLAK,
  HASONLO_NEV_KUSZOB,
  hasonloDatumAblak,
  hasonloIsoNap,
  hasonloNapEltres,
  hasonloTetelekKeresese,
  type HasonloTetelKerdes,
  type HasonloTetelMeglevo,
  type HasonloTetelTalalat,
} from './finance/hasonlo-tetel/match'
export {
  jaroWinkler,
  nameSimilarity,
  normalizeNameForMatch,
} from './finance/hasonlo-tetel/jaro-winkler'

// ── ADOMÁNYOZÓK ÉS SZPONZOROK — Endre 5. kérése (2026-08-27) ─────────────
// A 10 adomány/szponzor kód + a tiszta összesítő. A web és a desktop fül
// UGYANEZT használja — külön aggregálás két eltérő végösszeget adna.
export {
  ADOMANY_KODOK,
  adomanyKodE,
  adomanyKodNev,
  adomanyozoKulcsNev,
  cegGyanusNev,
  osszesitAdomanyozok,
  type AdomanyKod,
  type AdomanyTetel,
  type Adomanyozo,
  type AdomanyozoTipus,
  type AdomanyozokOsszesito,
} from './finance/adomanyozok/aggregate'

export {
  listIncomeUseCase,
  type ListIncomeCtx,
  type ListIncomeResult,
} from './finance/befizetes/list'

export {
  saveIncomeUseCase,
  type LocalBefizetesRow,
  type OfflineIncomeBackend,
  type OfflineIncomeMutation,
  type SaveIncomeCtx,
  type SaveIncomeResultOrError,
} from './finance/befizetes/save'

export {
  getNextReceiptNumberUseCase,
  type NextReceiptNumberCtx,
  type NextReceiptNumberResult,
} from './finance/befizetes/next-receipt-number'

export {
  checkReceiptDuplicateUseCase,
  type CheckReceiptDuplicateCtx,
  type CheckReceiptDuplicateResult,
} from './finance/befizetes/check-receipt-duplicate'

export {
  searchMembersForFinanceUseCase,
  type SearchMembersCtx,
  type SearchMembersResult,
} from './finance/befizetes/search-members'

export {
  getFamilyIdForPersonUseCase,
  type FamilyIdForPersonCtx,
  type FamilyIdForPersonResult,
} from './finance/befizetes/family-id-for-person'

export {
  softDeleteIncomeUseCase,
  type SoftDeleteIncomeCtx,
  type SoftDeleteIncomeResult,
} from './finance/befizetes/soft-delete'

export {
  stornoIncomeUseCase,
  type StornoIncomeCtx,
  type StornoIncomeResult,
} from './finance/befizetes/storno'

export {
  listBefizetesCelekUseCase,
  type ListBefizetesCelekCtx,
  type ListBefizetesCelekResult,
} from './finance/befizetes/list-cel'

export {
  listExpenseUseCase,
  type ListExpenseCtx,
  type ListExpenseResult,
} from './finance/kiadas/list'

export {
  listKiadasCelekUseCase,
  type ListKiadasCelekCtx,
  type ListKiadasCelekResult,
} from './finance/kiadas/list-cel'

export {
  saveExpenseUseCase,
  type LocalKiadasRow,
  type OfflineExpenseBackend,
  type OfflineExpenseMutation,
  type SaveExpenseCtx,
  type SaveExpenseResultOrError,
} from './finance/kiadas/save'

export {
  getNextReceiptNumberForExpenseUseCase,
  type NextExpenseReceiptNumberCtx,
  type NextExpenseReceiptNumberResult,
} from './finance/kiadas/next-receipt-number'

export {
  checkExpenseReceiptDuplicateUseCase,
  type CheckExpenseReceiptDuplicateCtx,
  type CheckExpenseReceiptDuplicateResult,
} from './finance/kiadas/check-receipt-duplicate'

export {
  softDeleteExpenseUseCase,
  type SoftDeleteExpenseCtx,
  type SoftDeleteExpenseResult,
} from './finance/kiadas/soft-delete'

export {
  stornoExpenseUseCase,
  type StornoExpenseCtx,
  type StornoExpenseResult,
} from './finance/kiadas/storno'

// Sztornó visszavonása (befizetes + kiadas, belső-mozgás párral) — C1c
export {
  undoStornoUseCase,
  type UndoStornoCtx,
  type UndoStornoInput,
  type UndoStornoResult,
  type UndoStornoType,
} from './finance/undo-storno'

// Év-zár (számadás-véglegesítés) őr — 2026-08-11 (5. kör, P1): a befizetés /
// kiadás / belső mozgás mentés-use-case-ek közös védelme, hogy a desktop se
// könyvelhessen egy már véglegesített és beküldött évbe.
//
// 2026-08-15 (átvilágítás, ⛔1): a TÖRLÉS-ág (`assertYearsNotFinalizedForDelete`)
// is ide került — a `deleted = true` volt az utolsó pénzügyi írási út, amelyen
// nem volt zár-kapu.
export {
  assertYearNotFinalizedOffline,
  assertYearsNotFinalizedForCreate,
  assertYearsNotFinalizedForDelete,
  readYearFinalized,
  yearFinalizedCreateError,
  yearFinalizedDeleteError,
  type YearLockError,
} from './finance/year-lock'

// Tétel-szerkesztés (befizetes + kiadas alapmezők) + dátum-utolsó check — C1c
export {
  updateTransactionUseCase,
  isLastTransactionOfTypeUseCase,
  type UpdateTransactionCtx,
  type UpdateTransactionInput,
  type UpdateTransactionResult,
  type UpdateTransactionType,
  type IsLastTransactionCtx,
  type IsLastTransactionInput,
  type IsLastTransactionResult,
} from './finance/update-transaction'

export {
  listInternalTransfersUseCase,
  type ListInternalTransfersCtx,
  type ListInternalTransfersResult,
} from './finance/belsomozgas/list'

export {
  saveInternalTransferUseCase,
  type SaveInternalTransferCtx,
  type SaveInternalTransferResultOrError,
} from './finance/belsomozgas/save'

export {
  softDeleteInternalTransferUseCase,
  type SoftDeleteInternalTransferCtx,
  type SoftDeleteInternalTransferResult,
} from './finance/belsomozgas/soft-delete'

// Excel write-through (E3) — pure D–L sor-építő + hivatalos belső-mozgás nevek
export {
  buildIncomeExcelRow,
  buildExpenseExcelRow,
  buildReversalRow,
  buildTransferExcelRows,
  buildBankBankExcelRows,
  irattipToExcel,
  roundCent,
  type ExcelKasszaRow,
  type BuildEntryRowInput,
  type BuildTransferRowsInput,
  type TransferExcelRows,
  type BuildBankBankRowsInput,
  type BankBankExcelRows,
} from './finance/excel/row-builder'

export {
  BELSO_MOZGAS_EXCEL_NEVEK,
  BANK_LETTERS,
  type BankLetter,
} from './finance/excel/belso-mozgas-nevek'

// ── Költségvetés-kompat (web `lib/finance/budget-compat` áthelyezve, 2026-06-11) ──
export {
  loadBudgetRowsCompat,
  saveBudgetRowsCompat,
  saveBudgetModification,
  type BudgetCompatRow,
} from './finance/budget-compat'

// ── Bank-import batch + nyitó egyenleg (web actionök portja, 2026-06-12, Endre #4) ──
export {
  importBankTransactionsUseCase,
  getLatestBankTransactionDateUseCase,
  type BankImportItem,
  type BankImportItemAction,
  type BankImportResult,
  type BankImportedRow,
  type BankImportReadCtx,
  type GetLatestBankTransactionDateInput,
  type ImportBankTransactionsCtx,
  type ImportBankTransactionsInput,
} from './finance/bank-import/import-transactions'

export {
  getBankszamlaNyitoEgyenlegUseCase,
  upsertBankszamlaNyitoEgyenlegUseCase,
  checkYearStartStateUseCase,
  computeCarryoverNyitoEgyenlegUseCase,
  refreshNextYearCarryoverUseCase,
  type CarryoverNyitoResult,
  type CheckYearStartStateInput,
  type ComputeCarryoverNyitoInput,
  type GetBankszamlaNyitoEgyenlegInput,
  type NyitoEgyenlegRow,
  type UpsertBankszamlaNyitoEgyenlegInput,
  type UpsertNyitoEgyenlegInput,
  type YearStartCheckResult,
} from './finance/bank-import/nyito-egyenleg'

export {
  resolveNyitoEgyenlegekUseCase,
  resolveNyitoForYear,
  type NyitoRecordedRow,
  type ResolvedNyito,
  type ResolveNyitoCtx,
  type ResolveNyitoInput,
  type ResolveNyitoResult,
} from './finance/bank-import/resolve-nyito'

// ── Részszámadás — időszaki nyitó/záró egyenlegek (2026-08-11, 6. kör) ──
export {
  KASSZA,
  computePeriodBalances,
  type AccountBalance,
  type ComputePeriodBalancesInput,
  type PeriodBalances,
  type PeriodRow,
} from './finance/reszszamadas/period-balances'

// ── Készpénzhasználati törvényi korlátok (2026-08-14, Endre kérése) ──
// Figyelmeztetések (nem blokkolók): 50 000 kassza-plafon · 1 000 decont-előleg ·
// 5 000/partner/nap · 10 000/nap összes kifizetés · feldarabolás-tilalom.
export {
  KASSZAPLAFON_LEJ,
  DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ,
  CEG_NAPI_KESZPENZ_LEJ,
  NAPI_OSSZES_CEGKIFIZETES_LEJ,
  MAGANSZEMELY_NAPI_KESZPENZ_LEJ,
  kasszaplafonUzenet,
  decontElolegUzenet,
  keszpenzKorlatFigyelmeztetesek,
  type KeszpenzTetel,
  type KeszpenzFigyelmeztetes,
  type KeszpenzFigyelmeztetesKod,
} from './finance/keszpenz-korlatok'

// ── Tagnyilvántartás — közös use-case helperek (2026-08-15, desktop-paritás
// 2. szelet: a webes kivezetés-lánc megosztott darabjai, a desktop-tükör is
// ezeket hívja) ──
export {
  VOTER_RECOMPUTE_WARNING,
  refreshVoterEligibility,
  type VoterRecomputeResult,
} from './members/voter-recompute'
export { getOrCreateLocality } from './members/locality'
