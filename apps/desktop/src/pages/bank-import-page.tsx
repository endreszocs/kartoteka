/**
 * Bank-import oldal — `/penzugy/bank-import` route.
 *
 * A-M7.10a (2026-04-25) — első iteráció: parser-infrastruktúra + BCR XLSX
 * parse + preview tábla.
 *
 * A-M7.10b (2026-04-25) — második iteráció: matcher use-case + UI bővítés.
 * A „Párosítás" gombbal a banki tranzakciók egybe-vethetők a már rögzített
 * befizetés/kiadás tételekkel (datum + osszeg + iratszám-egyezés). Minden
 * sor kap egy státuszt: matched / multiple / unmatched.
 *
 * Flow:
 *   1. Bank-választó + file-pick + parse → preview (A-M7.10a)
 *   2. „Párosítás" gomb → `matchBankTransactionsUseCase(...)` → státusz-oszlop
 *   3. Az unmatched-eket az A-M7.10c-ben lehet majd új tételként importálni
 *
 * Lelkész-informálási alapelv: pasztorális üzenetek, loading/success/error.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Download,
  HelpCircle,
  Upload,
  XCircle,
} from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from '@kartoteka/ui'
import {
  listBefizetesCelekUseCase,
  listKiadasCelekUseCase,
  matchBankTransactionsUseCase,
  parseBankExport,
  saveExpenseUseCase,
  saveIncomeUseCase,
} from '@kartoteka/core'
import {
  BANK_PROVIDER_LABELS,
  BANK_PROVIDER_VALUES,
  type BankMatchResult,
  type BankParseResult,
  type BankProvider,
  type BankTransaction,
  type BefizetesCelRow,
  type KiadasCelRow,
  type MatchStatus,
} from '@kartoteka/validations'

import { PageHero } from '@kartoteka/ui-app'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile } from '../lib/sync'

const MAX_PREVIEW_ROWS = 50

export function BankImportPage() {
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [provider, setProvider] = useState<BankProvider>('bcr')
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<BankParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A-M7.10b — matcher state
  const [matching, setMatching] = useState(false)
  const [matchResult, setMatchResult] = useState<BankMatchResult | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)

  // A-M7.10c — kategóriák + import state
  const [befizetesCelek, setBefizetesCelek] = useState<BefizetesCelRow[]>([])
  const [kiadasCelek, setKiadasCelek] = useState<KiadasCelRow[]>([])
  const [defaultIncomeCelId, setDefaultIncomeCelId] = useState<number | null>(null)
  const [defaultExpenseCelId, setDefaultExpenseCelId] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    errors: Array<{ rowIndex: number; reason: string }>
  } | null>(null)

  // Congregation_id + userId a profile-ból (a matcher + import-flow-hoz)
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!mounted || !data.user) return
        setUserId(data.user.id)
        try {
          const profile = await getLocalOwnProfile(data.user.id)
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

  // A-M7.10c — kategóriák betöltése egyszer (a default-dropdownokhoz)
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
        /* csendes — a kategória-betöltés hiba esetén a dropdown üres marad */
      }
    })()
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setResult(null)
    setMatchResult(null)
    setMatchError(null)
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parseBankExport(provider, buffer)
      setResult(parsed)
    } catch (err) {
      setError(`Fájl-olvasási hiba: ${errorMessage(err)}`)
    } finally {
      setParsing(false)
    }
  }

  function handleReset() {
    setFileName(null)
    setResult(null)
    setError(null)
    setMatchResult(null)
    setMatchError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleMatch() {
    if (!result || !congregationId) return
    setMatching(true)
    setMatchError(null)
    setMatchResult(null)
    setImportResult(null)
    try {
      const supabase = getDesktopSupabase()
      const res = await matchBankTransactionsUseCase(
        {
          congregationId,
          transactions: result.transactions,
          dateBufferDays: 2,
        },
        { supabase, runtime: 'desktop' },
      )
      if (!res.success) {
        setMatchError(res.error)
        return
      }
      setMatchResult(res.data)
    } catch (err) {
      setMatchError(`Párosítási hiba: ${errorMessage(err)}`)
    } finally {
      setMatching(false)
    }
  }

  /**
   * A-M7.10c — Bulk-import: a párosítatlan tranzakciókat új befizetés/kiadás
   * tételként rögzíti. Egyenként meghívja a `saveIncomeUseCase`-t (positive
   * amount) vagy `saveExpenseUseCase`-t (negative amount), majd visszajelez
   * összesítve. A `irattipus = 'Banki'`, az `iratszam` a banki referencia
   * vagy auto-generált prefix (`BANK-yyyymmdd-NN`), a `forrasa = 'Bank-import'`.
   */
  async function handleImportUnmatched() {
    if (!matchResult || !congregationId || !userId) return
    if (!defaultIncomeCelId && !defaultExpenseCelId) {
      setImportResult({
        success: 0,
        failed: 0,
        errors: [
          {
            rowIndex: 0,
            reason: 'Előbb válassz default kategóriát (legalább a meglévő tranzakció-típushoz).',
          },
        ],
      })
      return
    }

    setImporting(true)
    setImportResult(null)
    const supabase = getDesktopSupabase()
    const errors: Array<{ rowIndex: number; reason: string }> = []
    let successCount = 0

    const unmatched = matchResult.rows.filter((r) => r.status === 'unmatched')

    for (const row of unmatched) {
      const tx: BankTransaction = row.transaction
      const isIncome = tx.amount > 0

      try {
        if (isIncome) {
          if (!defaultIncomeCelId) {
            errors.push({
              rowIndex: tx.rowIndex,
              reason: 'Nincs default befizetés-kategória — sor kihagyva.',
            })
            continue
          }
          const iratszamFromBank = bankRowToIratszam(tx)
          const res = await saveIncomeUseCase(
            {
              congregationId,
              osszeg: Math.abs(tx.amount),
              datum: tx.date,
              id_befizetescel: defaultIncomeCelId,
              id_szemely: null,
              id_csalad: null,
              forrasa: 'Bank-import',
              iratszam: iratszamFromBank,
              irattipus: 'Banki',
              fizetettev: new Date(tx.date).getFullYear(),
              megjegyzes: composeMegjegyzes(tx),
            },
            { supabase, runtime: 'desktop', userId },
          )
          if (!res.success) {
            errors.push({
              rowIndex: tx.rowIndex,
              reason: res.error,
            })
          } else {
            successCount += 1
          }
        } else {
          if (!defaultExpenseCelId) {
            errors.push({
              rowIndex: tx.rowIndex,
              reason: 'Nincs default kiadás-kategória — sor kihagyva.',
            })
            continue
          }
          const iratszamFromBank = bankRowToIratszam(tx)
          const res = await saveExpenseUseCase(
            {
              congregationId,
              osszeg: Math.abs(tx.amount),
              datum: tx.date,
              id_kiadascel: defaultExpenseCelId,
              atvevoid: null,
              atvevo: tx.counterparty || tx.description.slice(0, 100),
              kedvezmenyezett_cui: null,
              vonatkozo_idoszak: null,
              iratszam: iratszamFromBank,
              irattipus: 'Banki',
              megjegyzes: composeMegjegyzes(tx),
            },
            { supabase, runtime: 'desktop', userId },
          )
          if (!res.success) {
            errors.push({
              rowIndex: tx.rowIndex,
              reason: res.error,
            })
          } else {
            successCount += 1
          }
        }
      } catch (err) {
        errors.push({
          rowIndex: tx.rowIndex,
          reason: `Váratlan hiba: ${errorMessage(err)}`,
        })
      }
    }

    setImportResult({ success: successCount, failed: errors.length, errors })
    setImporting(false)

    // Sikeres import után újra-párosítás (hogy az újonnan rögzített tételek átjöjjenek match-re)
    if (successCount > 0) {
      void handleMatch()
    }
  }

  const transactionCount = result?.transactions.length ?? 0
  const previewRows = result?.transactions.slice(0, MAX_PREVIEW_ROWS) ?? []
  const hasMore = transactionCount > MAX_PREVIEW_ROWS

  // A-M7.10b — match-státuszok rendezése a sor-indexre, hogy a preview-táblában
  // gyors lookup lehessen (rowIndex → match info)
  const matchByRowIndex = new Map(matchResult?.rows.map((r) => [r.rowIndex, r]) ?? [])

  // Bevétel / kiadás összegek a preview-hoz (ne a teljes éves képet keverje)
  const incomeTotal = (result?.transactions ?? [])
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0)
  const expenseTotal = (result?.transactions ?? [])
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Bank-import"
          title="Bank-import"
          description="A bankodból exportált Excel fájl betöltése, tranzakciók előnézete. A meglévő tételekkel való párosítás és az automata import a következő kiadásban jön."
          Icon={Download}
        />

        {/* Bank-választó + file-pick */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fájl beolvasása</CardTitle>
            <CardDescription className="text-xs">
              Válaszd ki a bankot, majd töltsd be az Excel fájlt. A BCR XLSX export
              jelenleg teljesen támogatott.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-provider">Bank</Label>
                <select
                  id="bank-provider"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.currentTarget.value as BankProvider)
                    handleReset()
                  }}
                  disabled={parsing}
                >
                  {BANK_PROVIDER_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {BANK_PROVIDER_LABELS[v]}
                      {v !== 'bcr' && ' (még nem támogatott)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-file">Excel fájl (.xlsx)</Label>
                <input
                  ref={fileInputRef}
                  id="bank-file"
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  disabled={parsing}
                  className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:text-primary-foreground hover:file:opacity-90"
                />
              </div>
            </div>

            {fileName && (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <span className="font-mono">{fileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={parsing}
                >
                  Törlés
                </Button>
              </div>
            )}

            {parsing && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="size-4 animate-pulse" />
                Fájl olvasása…
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mr-1.5 inline-block size-4" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Eredmény-blokkok */}
        {result && result.error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            <span className="font-semibold">Parse hiba:</span> {result.error}
          </div>
        )}

        {result && !result.error && transactionCount > 0 && (
          <>
            {/* Összesítő */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  <CheckCircle2 className="mr-2 inline-block size-4 text-emerald-600" />
                  Beolvasva: {transactionCount} tranzakció
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
                    <p className="text-xs text-emerald-700">Bevétel (jóváírás)</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-emerald-900">
                      +{incomeTotal.toLocaleString('hu')} RON
                    </p>
                  </div>
                  <div className="rounded-md border border-rose-200 bg-rose-50/40 p-3 text-sm">
                    <p className="text-xs text-rose-700">Kiadás (terhelés)</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-rose-900">
                      −{expenseTotal.toLocaleString('hu')} RON
                    </p>
                  </div>
                </div>

                {/* Felismert oszlopok */}
                {Object.keys(result.detectedHeaders).length > 0 && (
                  <details className="mt-3 text-xs text-slate-600">
                    <summary className="cursor-pointer hover:text-slate-900">
                      Felismert oszlopok ({Object.keys(result.detectedHeaders).length})
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 pl-4">
                      {Object.entries(result.detectedHeaders).map(([key, label]) => (
                        <li key={key}>
                          <span className="font-mono text-[10px] text-slate-500">{key}:</span>{' '}
                          {label}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* A-M7.10b — Párosítás gomb */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Párosítás a meglévő tételekkel
                    </p>
                    <p className="text-xs text-slate-600">
                      Megnézzük, hogy a banki tranzakciók közül melyik tartozik egy
                      már rögzített befizetéshez vagy kiadáshoz (dátum + összeg + iratszám).
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleMatch()}
                    disabled={matching || !congregationId}
                  >
                    <CheckCircle
                      className={`mr-2 size-4 ${matching ? 'animate-pulse' : ''}`}
                    />
                    {matching
                      ? 'Párosítás folyamatban…'
                      : matchResult
                        ? 'Újra-párosítás'
                        : 'Párosítás futtatása'}
                  </Button>
                </div>
                {matchError && (
                  <div
                    role="alert"
                    className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    <AlertCircle className="mr-1.5 inline-block size-3.5" />
                    {matchError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* A-M7.10b — Match summary */}
            {matchResult && <MatchSummaryCard summary={matchResult.summary} />}

            {/* A-M7.10c — Import-form panel a párosítatlanokra */}
            {matchResult && matchResult.summary.unmatched > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Párosítatlan tranzakciók importálása ({matchResult.summary.unmatched})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    A párosítatlan tételeket új befizetés vagy kiadás bejegyzésként
                    rögzítjük. Válassz default kategóriát mindkét oldalra (a banki
                    leírás megjegyzésként megmarad). Banki irattípus, az iratszámot a
                    banki referenciából vagy auto-generáljuk.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="default-income">Default befizetés-kategória</Label>
                      <select
                        id="default-income"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={defaultIncomeCelId ?? ''}
                        onChange={(e) =>
                          setDefaultIncomeCelId(
                            e.currentTarget.value ? Number(e.currentTarget.value) : null,
                          )
                        }
                        disabled={importing || befizetesCelek.length === 0}
                      >
                        <option value="">— válassz —</option>
                        {befizetesCelek.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nev}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="default-expense">Default kiadás-kategória</Label>
                      <select
                        id="default-expense"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={defaultExpenseCelId ?? ''}
                        onChange={(e) =>
                          setDefaultExpenseCelId(
                            e.currentTarget.value ? Number(e.currentTarget.value) : null,
                          )
                        }
                        disabled={importing || kiadasCelek.length === 0}
                      >
                        <option value="">— válassz —</option>
                        {kiadasCelek.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nev}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => void handleImportUnmatched()}
                    disabled={
                      importing ||
                      (!defaultIncomeCelId && !defaultExpenseCelId) ||
                      !congregationId ||
                      !userId
                    }
                    className="w-full"
                  >
                    <Upload className={`mr-2 size-4 ${importing ? 'animate-pulse' : ''}`} />
                    {importing
                      ? 'Importálás folyamatban…'
                      : `Párosítatlan tranzakciók importálása (${matchResult.summary.unmatched})`}
                  </Button>
                  <p className="text-[11px] italic text-slate-500">
                    Az import után a párosítást automatikusan újrafuttatjuk, hogy az
                    újonnan rögzített tételek a következő körben már megvannak.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* A-M7.10c — Import eredmény */}
            {importResult && (
              <ImportResultCard result={importResult} />
            )}

            {/* Preview tábla */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tranzakciók előnézete</CardTitle>
                <CardDescription className="text-xs">
                  {hasMore
                    ? `Az első ${MAX_PREVIEW_ROWS} sor a ${transactionCount}-ből (a teljes lista az import során lesz feldolgozva).`
                    : 'Minden beolvasott tranzakció.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-600">
                        <th className="px-2 py-1.5">Sor</th>
                        <th className="px-2 py-1.5">Dátum</th>
                        <th className="px-2 py-1.5">Leírás</th>
                        <th className="px-2 py-1.5">Partner</th>
                        <th className="px-2 py-1.5 text-right">Összeg</th>
                        {matchResult && <th className="px-2 py-1.5">Státusz</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((tx) => {
                        const isIncome = tx.amount > 0
                        const matchInfo = matchByRowIndex.get(tx.rowIndex)
                        return (
                          <tr
                            key={tx.rowIndex}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                              {tx.rowIndex}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-slate-700">{tx.date}</td>
                            <td className="px-2 py-1.5 text-slate-800">
                              <span className="line-clamp-1">{tx.description}</span>
                              {tx.reference && (
                                <span className="block text-[10px] text-slate-500">
                                  ref: {tx.reference}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700">
                              {tx.counterparty ?? '—'}
                            </td>
                            <td
                              className={`px-2 py-1.5 text-right font-mono font-semibold ${
                                isIncome ? 'text-emerald-800' : 'text-rose-800'
                              }`}
                            >
                              {isIncome ? '+' : '−'}
                              {Math.abs(tx.amount).toLocaleString('hu')}
                            </td>
                            {matchResult && (
                              <td className="px-2 py-1.5">
                                <MatchStatusBadge matchInfo={matchInfo} />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Mit lehet most + mit jön */}
            {!matchResult && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                <p className="font-semibold">💡 Tipp</p>
                <p className="mt-1">
                  A „Párosítás futtatása" gombbal megnézzük, melyik banki tranzakció
                  tartozik egy már rögzített tételhez. A párosítatlanok az
                  A-M7.10c-ben automatikusan importálhatók lesznek.
                </p>
              </div>
            )}
            {matchResult && matchResult.summary.unmatched > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                <p className="font-semibold">🚧 A következő lépés (A-M7.10c)</p>
                <p className="mt-1">
                  {matchResult.summary.unmatched} párosítatlan tranzakció lesz importálható
                  új befizetés/kiadás tételként (a következő iterációban). A párosított
                  tételek nem ismétlődnek meg.
                </p>
              </div>
            )}
          </>
        )}

        {result && !result.error && transactionCount === 0 && (
          <div
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900"
          >
            A fájlban nincs felismert tranzakció. Ellenőrizd, hogy a megfelelő bankot
            választottad-e és a fájl tartalmazza-e a fejléceket.
          </div>
        )}
      </div>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A-M7.10b — Match status badge + summary kártya
// ─────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MatchStatus, { label: string; tone: string; Icon: typeof CheckCircle }> = {
  matched: { label: 'Megvan', tone: 'bg-emerald-100 text-emerald-800', Icon: CheckCircle },
  multiple: { label: 'Több jelölt', tone: 'bg-amber-100 text-amber-800', Icon: HelpCircle },
  unmatched: { label: 'Nincs', tone: 'bg-rose-100 text-rose-800', Icon: XCircle },
  duplicate: { label: 'Már importálva', tone: 'bg-slate-100 text-slate-700', Icon: CheckCircle2 },
}

function MatchStatusBadge({
  matchInfo,
}: {
  matchInfo:
    | {
        status: MatchStatus
        candidates: Array<{ iratszam: string; confidence: number; reason: string }>
        unmatchedReason?: string | null
      }
    | undefined
}) {
  if (!matchInfo) {
    return <span className="text-[10px] text-slate-400">—</span>
  }
  const { label, tone, Icon } = STATUS_LABELS[matchInfo.status]
  const tooltip =
    matchInfo.status === 'matched'
      ? `Iratszám ${matchInfo.candidates[0]?.iratszam} (${matchInfo.candidates[0]?.reason})`
      : matchInfo.status === 'multiple'
        ? `${matchInfo.candidates.length} jelölt: ${matchInfo.candidates.map((c) => c.iratszam).join(', ')}`
        : matchInfo.unmatchedReason || ''
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
    >
      <Icon className="size-3" />
      {label}
      {matchInfo.status === 'matched' && matchInfo.candidates[0] && (
        <span className="font-mono">#{matchInfo.candidates[0].iratszam}</span>
      )}
    </span>
  )
}

function MatchSummaryCard({
  summary,
}: {
  summary: { matched: number; multiple: number; unmatched: number; duplicate: number }
}) {
  const total = summary.matched + summary.multiple + summary.unmatched + summary.duplicate
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Párosítás eredménye ({total} tranzakció)</CardTitle>
        <CardDescription className="text-xs">
          A banki sorok melletti státusz mutatja, melyiket találtuk meg a meglévő tételek között.
          A párosítatlanok az A-M7.10c-ben lesznek importálhatók.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-4">
          <SummaryStat label="Megvan" count={summary.matched} tone="emerald" />
          <SummaryStat label="Több jelölt" count={summary.multiple} tone="amber" />
          <SummaryStat label="Nincs" count={summary.unmatched} tone="rose" />
          <SummaryStat label="Már importálva" count={summary.duplicate} tone="slate" />
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryStat({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-900',
    rose: 'border-rose-200 bg-rose-50/40 text-rose-900',
    slate: 'border-slate-200 bg-slate-50/40 text-slate-700',
  }
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold">{count}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A-M7.10c — Import helper függvények és UI komponens
// ─────────────────────────────────────────────────────────────────────────

/**
 * Iratszám előállítás bank-tranzakcióból:
 *   - Ha van banki referencia → azt használjuk
 *   - Egyébként `BANK-yyyymmdd-NN` formátum (NN a sor-index)
 *
 * Banki tételeknél nem ütközik a Készpénz-iratszám pool-lal, mert az
 * `irattipus = 'Banki'` szűrés kizárja a `getNextReceiptNumberUseCase`-ből.
 */
function bankRowToIratszam(tx: BankTransaction): string {
  if (tx.reference && tx.reference.trim()) {
    return tx.reference.trim()
  }
  const dateCompact = tx.date.replace(/-/g, '')
  const rowSuffix = String(tx.rowIndex).padStart(2, '0')
  return `BANK-${dateCompact}-${rowSuffix}`
}

/**
 * Megjegyzés-szöveg: a banki leírás + opcionálisan a partner és referencia,
 * hogy a lelkész a desktopon utólag is tudja, mi volt a tranzakció eredete.
 */
function composeMegjegyzes(tx: BankTransaction): string {
  const parts: string[] = [`[Bank-import] ${tx.description}`]
  if (tx.counterparty) parts.push(`Partner: ${tx.counterparty}`)
  if (tx.reference) parts.push(`Ref: ${tx.reference}`)
  if (tx.balance !== null && tx.balance !== undefined) {
    parts.push(`Egyenleg: ${tx.balance.toLocaleString('hu')} RON`)
  }
  return parts.join(' · ')
}

function ImportResultCard({
  result,
}: {
  result: { success: number; failed: number; errors: Array<{ rowIndex: number; reason: string }> }
}) {
  const total = result.success + result.failed
  return (
    <Card
      className={
        result.failed === 0
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-amber-200 bg-amber-50/40'
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {result.failed === 0 ? (
            <>
              <CheckCircle className="mr-2 inline-block size-4 text-emerald-700" />
              Import sikeres ({result.success} tétel)
            </>
          ) : (
            <>
              <AlertCircle className="mr-2 inline-block size-4 text-amber-700" />
              Import részben sikeres ({result.success} OK, {result.failed} hiba)
            </>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          {total} párosítatlan tranzakcióból {result.success} került rögzítésre.
          A hibás tételeket alább látod — ellenőrizd, és szükség esetén kézzel
          rögzítsd.
        </CardDescription>
      </CardHeader>
      {result.errors.length > 0 && (
        <CardContent>
          <ul className="space-y-1.5 text-xs">
            {result.errors.slice(0, 20).map((err, idx) => (
              <li
                key={`${err.rowIndex}-${idx}`}
                className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5"
              >
                <span className="font-mono text-[10px] text-rose-700">
                  Sor {err.rowIndex}:
                </span>{' '}
                <span className="text-rose-900">{err.reason}</span>
              </li>
            ))}
            {result.errors.length > 20 && (
              <li className="text-[10px] italic text-slate-500">
                …és további {result.errors.length - 20} hiba
              </li>
            )}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
