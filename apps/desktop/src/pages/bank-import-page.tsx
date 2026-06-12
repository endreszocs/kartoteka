/**
 * Bank-import oldal — `/penzugy/bank-import` route
 * (2026-06-12, Endre #4 bank-import — a webes wizard tükre).
 *
 * A korábbi default-kategóriás tömeges import UI-t a webes 5-lépéses BCR
 * import wizard KÖZÖS törzse (`BcrImportWizardBody`, @kartoteka/ui-app)
 * váltja inline (Dialog-héj nélküli) módban: fájl → nyitó egyenleg →
 * soronkénti kategorizálás → megerősítés → kész.
 *
 * Minden hálózati hívás itt, a wrapperben dől el (a Body platform-független):
 *   - parse: core `parseBankExport('bcr', ...)` — a webview-ban fut,
 *   - legutolsó banki dátum / nyitó egyenleg / év eleji ellenőrzés: core
 *     use-case-ek (`getLatestBankTransactionDateUseCase`,
 *     `getBankszamlaNyitoEgyenleg/upsert`, `checkYearStartStateUseCase`),
 *   - import: `importBankTransactionsUseCase` (web-azonos duplikáció-védelem,
 *     valuta+árfolyam, belső-mozgás aktív párosítás) — `getVerifiedSession`
 *     őrrel (felhő-írás csak hitelesített, fiók-egyező sessionnel),
 *   - Excel-write-through (E3): a sikeres sorok `enqueueEntryExcelRow`-val a
 *     bankszámla betű-lapjára kerülnek,
 *   - BNR árfolyam: Rust `fetch_page_text` parancson át (lib/bnr-rate.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import {
  getBankszamlaNyitoEgyenlegUseCase,
  getLatestBankTransactionDateUseCase,
  checkYearStartStateUseCase,
  importBankTransactionsUseCase,
  listBefizetesCelekUseCase,
  listKiadasCelekUseCase,
  parseBankExport,
  upsertBankszamlaNyitoEgyenlegUseCase,
} from '@kartoteka/core'
import type { BefizetesCelRow, KiadasCelRow } from '@kartoteka/validations'
import {
  BcrImportWizardBody,
  BELSO_MOZGAS_ROGZITO_KODS,
  isGyulekezetiKonyvelhetoKod,
  PageHero,
  type BankAccount,
  type BankImportItem as WizardBankImportItem,
  type BankImportResult as WizardBankImportResult,
  type BcrWizardParseResult,
  type BnrRateResult,
  type WizardNyitoEgyenlegUpsertInput,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import { fetchBnrRatesDesktop } from '../lib/bnr-rate'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { getLocalOwnProfile } from '../lib/sync'
import { getVerifiedSession } from '../lib/verified-session'

/** Üres import-eredmény hibaághoz (a wizard `error`-t vár + nullás számokat). */
function emptyImportResult(error: string): WizardBankImportResult & { error: string } {
  return { error, totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [] }
}

export function BankImportPage() {
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // A wizard adatforrásai: aktív bankszámlák + bevétel/kiadás kategóriák.
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [banksLoaded, setBanksLoaded] = useState(false)
  const [befizetesCelek, setBefizetesCelek] = useState<BefizetesCelRow[]>([])
  const [kiadasCelek, setKiadasCelek] = useState<KiadasCelRow[]>([])

  // Page-szintű visszajelzés (a penzugy-page toast-mintája — a Body onToast-ja ide ír).
  const [pageToast, setPageToast] = useState<
    { kind: 'success' | 'error' | 'info'; msg: string } | null
  >(null)

  // A wizard kulcsa — `onOpenChange(false)` (Mégse / Bezárás / FX-átirányítás)
  // friss példányt mountol, így a következő import tiszta lappal indul.
  const [wizardKey, setWizardKey] = useState(0)

  // Congregation_id + userId a profile-ból (a meglévő oldal fetch-mintája)
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(async (resolvedUser) => {
        if (!mounted || !resolvedUser) return
        setUserId(resolvedUser.id)
        try {
          const profile = await getLocalOwnProfile(resolvedUser.id)
          if (mounted) setCongregationId(profile?.congregation_id ?? null)
        } catch {
          /* csendes */
        }
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // Aktív bankszámlák betöltése — a wizard BankAccount-alakjával (iban stb. is kell)
  useEffect(() => {
    if (!congregationId) return
    let mounted = true
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const { data } = await supabase
          .from('bankszamlak')
          .select('id, bank_neve, iban, valuta, aktiv, nyito_egyenleg, szin, ikon, is_default')
          .eq('congregation_id', congregationId)
          .eq('aktiv', true)
          .order('bank_neve')
        if (mounted && data) setBankAccounts(data as BankAccount[])
      } catch {
        /* offline — az import úgyis online művelet */
      } finally {
        if (mounted) setBanksLoaded(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [congregationId])

  // Kategóriák betöltése egyszer (a meglévő oldal fetch-mintája)
  useEffect(() => {
    void (async () => {
      const supabase = getDesktopSupabase()
      try {
        const [befizetesRes, kiadasRes] = await Promise.all([
          listBefizetesCelekUseCase({ onlyActive: true }, { supabase, runtime: 'desktop' }),
          listKiadasCelekUseCase({ onlyActive: true }, { supabase, runtime: 'desktop' }),
        ])
        if (befizetesRes.success) setBefizetesCelek(befizetesRes.rows)
        if (kiadasRes.success) setKiadasCelek(kiadasRes.rows)
      } catch {
        /* csendes — a kategória-betöltés hiba esetén a lista üres marad */
      }
    })()
  }, [])

  // Page-toast automatikus eltűntetése pár másodperc után.
  useEffect(() => {
    if (!pageToast) return
    const t = setTimeout(() => setPageToast(null), 6000)
    return () => clearTimeout(t)
  }, [pageToast])

  // Kategória-opciók a wizardhoz — a web-azonos szabállyal: csak a hivatalos
  // levél-kódok (101.xx–107.xx / 201.xx–207.xx) + a kanonikus belső-mozgás
  // kódok könyvelhetők (a kod = befizetescel/kiadascel.id_szamadasicel).
  const incomeCategories = useMemo(
    () =>
      befizetesCelek
        .map((c) => ({
          id: c.id,
          kod: c.id_szamadasicel,
          nev: (c.nev || '').trim() || c.id_szamadasicel,
        }))
        .filter((c) => isGyulekezetiKonyvelhetoKod(c.kod) || BELSO_MOZGAS_ROGZITO_KODS.has(c.kod))
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    [befizetesCelek],
  )

  const expenseCategories = useMemo(
    () =>
      kiadasCelek
        .map((c) => ({
          id: c.id,
          kod: c.id_szamadasicel,
          nev: (c.nev || '').trim() || c.id_szamadasicel,
        }))
        .filter((c) => isGyulekezetiKonyvelhetoKod(c.kod) || BELSO_MOZGAS_ROGZITO_KODS.has(c.kod))
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    [kiadasCelek],
  )

  // ── Wizard-callbackek ──────────────────────────────────────────────────

  const handleToast = useCallback(
    (msg: string, kind?: 'success' | 'error' | 'info') => {
      setPageToast({ kind: kind ?? 'info', msg })
    },
    [],
  )

  /** A kiválasztott Excel parsolása — core parser + adapter a Body alakjára. */
  const handleParseFile = useCallback(async (file: File): Promise<BcrWizardParseResult> => {
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseBankExport('bcr', new Uint8Array(buffer))
      return {
        transactions: parsed.transactions.map((t) => ({
          rowIndex: t.rowIndex,
          date: t.date,
          description: t.description,
          reference: t.reference ?? null,
          amount: t.amount,
          balance: t.balance ?? null,
          counterparty: t.counterparty ?? null,
        })),
        error: parsed.error,
      }
    } catch (err) {
      return { transactions: [], error: `Fájl-olvasási hiba: ${errorMessage(err)}` }
    }
  }, [])

  /** A legutolsó banki tranzakció dátuma (duplikáció-szűrő a wizardban). */
  const handleGetLatestDate = useCallback(
    async (bankszamlaId: number) => {
      if (!congregationId) return { error: 'Nincs aktív gyülekezet a profilhoz rendelve.' }
      try {
        return await getLatestBankTransactionDateUseCase(
          { congregationId, bankszamlaId },
          { supabase: getDesktopSupabase(), runtime: 'desktop' },
        )
      } catch (err) {
        return { error: errorMessage(err) }
      }
    },
    [congregationId],
  )

  /** Éves nyitó egyenleg lekérdezése. */
  const handleLoadNyitoEgyenleg = useCallback(
    async (bankszamlaId: number, eve: number) => {
      if (!congregationId) return { error: 'Nincs aktív gyülekezet a profilhoz rendelve.' }
      try {
        return await getBankszamlaNyitoEgyenlegUseCase(
          { congregationId, bankszamlaId, eve },
          { supabase: getDesktopSupabase(), runtime: 'desktop' },
        )
      } catch (err) {
        return { error: errorMessage(err) }
      }
    },
    [congregationId],
  )

  /** Éves nyitó egyenleg rögzítése/frissítése. */
  const handleUpsertNyitoEgyenleg = useCallback(
    async (input: WizardNyitoEgyenlegUpsertInput) => {
      if (!congregationId) return { error: 'Nincs aktív gyülekezet a profilhoz rendelve.' }
      if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
      try {
        return await upsertBankszamlaNyitoEgyenlegUseCase(
          { ...input, congregationId },
          { supabase: getDesktopSupabase(), runtime: 'desktop', userId },
        )
      } catch (err) {
        return { error: errorMessage(err) }
      }
    },
    [congregationId, userId],
  )

  /** Év eleji állapot-ellenőrzés (FX revaluation megléte stb.). */
  const handleCheckYearStart = useCallback(
    async (args: {
      bankszamlaId: number
      eve: number
      newYearValuta: number
      newYearArfolyam: number
    }) => {
      if (!congregationId) return { error: 'Nincs aktív gyülekezet a profilhoz rendelve.' }
      try {
        return await checkYearStartStateUseCase(
          { congregationId, ...args },
          { supabase: getDesktopSupabase(), runtime: 'desktop' },
        )
      } catch (err) {
        return { error: errorMessage(err) }
      }
    },
    [congregationId],
  )

  /** BNR/ECB árfolyam — Rust fetch_page_text-en át (CORS-mentes). */
  const handleFetchBnrRate = useCallback(
    (targetDate?: string): Promise<BnrRateResult> => fetchBnrRatesDesktop(targetDate),
    [],
  )

  /**
   * A batch-import futtatása: getVerifiedSession-őr → core use-case → siker
   * után az importált sorok Excel-enqueue-ja (E3) a bankszámla betű-lapjára.
   */
  const handleImport = useCallback(
    async (
      items: WizardBankImportItem[],
    ): Promise<WizardBankImportResult & { error?: string }> => {
      if (!congregationId) {
        return emptyImportResult('Nincs aktív gyülekezet a profilhoz rendelve.')
      }
      // Felhő-írás CSAK hitelesített és fiók-egyező sessionnel (B6-őr).
      const verified = await getVerifiedSession()
      if (!verified.ok) return emptyImportResult(verified.message)

      try {
        const result = await importBankTransactionsUseCase(
          { congregationId, items },
          {
            supabase: getDesktopSupabase(),
            runtime: 'desktop',
            userId: verified.session.user.id,
          },
        )

        // E3: minden sikeresen beszúrt sor (a belső-mozgás bank-oldali sora is)
        // a kiválasztott bankszámla betű-lapjára kerül az Excel-könyvelésben.
        for (const row of result.importedRows) {
          if (row.id > 0) {
            void enqueueEntryExcelRow({
              type: row.side === 'income' ? 'befizetes' : 'kiadas',
              serverId: row.id,
              congregationId,
              datum: row.date,
              iratszam: row.iratszam,
              irattipus: 'Banki',
              nev: row.counterparty || 'Bank-import',
              osszeg: Math.abs(row.amount),
              celId: row.categoryId ?? 0,
              megjegyzes: row.megjegyzes,
              bankszamlaId: row.bankszamlaId,
              ev: new Date(row.date).getFullYear(),
            })
          }
        }

        return result
      } catch (err) {
        return emptyImportResult(`Import-hiba: ${errorMessage(err)}`)
      }
    },
    [congregationId],
  )

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Bank-import"
          title="Bank-import"
          description="A BCR-ből exportált Excel betöltése 5 lépéses varázslóval: fájl, év eleji nyitó egyenleg, soronkénti kategorizálás, megerősítés, kész. A webes wizard pontos tükre — duplikáció-védelemmel és kassza-párosítással."
          Icon={Download}
        />

        {/* Page-toast (a Body onToast-ja ide ír — web: sonner, desktop: banner) */}
        {pageToast && (
          <div
            role={pageToast.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-md border px-3 py-2 text-sm ${
              pageToast.kind === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : pageToast.kind === 'info'
                  ? 'border-sky-300 bg-sky-50 text-sky-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            {pageToast.msg}
          </div>
        )}

        {/* Ha nincs aktív bankszámla, a wizard nem tud célt választani — útmutató */}
        {banksLoaded && bankAccounts.length === 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
            Nincs aktív bankszámla rögzítve — előbb vedd fel a Pénzügy → Bank
            fülön (vagy a webes felületen), és térj vissza ide.
          </div>
        )}

        {/* A közös wizard-törzs inline módban (Dialog-héj nélkül) */}
        <BcrImportWizardBody
          key={wizardKey}
          inline
          onOpenChange={(open) => {
            // Inline módban a „bezárás" = friss wizard (a kulcs-csere remountol)
            if (!open) setWizardKey((k) => k + 1)
          }}
          bankAccounts={bankAccounts}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          onToast={handleToast}
          onParseFile={handleParseFile}
          onGetLatestDate={handleGetLatestDate}
          onLoadNyitoEgyenleg={handleLoadNyitoEgyenleg}
          onUpsertNyitoEgyenleg={handleUpsertNyitoEgyenleg}
          onCheckYearStart={handleCheckYearStart}
          onFetchBnrRate={handleFetchBnrRate}
          onImport={handleImport}
        />
      </div>
    </DesktopShell>
  )
}
