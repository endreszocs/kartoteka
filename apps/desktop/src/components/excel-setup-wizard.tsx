/**
 * Excel-beállítás varázsló (2026-06-12, Endre #1 Excel-wizard).
 *
 * Az Excel-szinkronizáció előkészítésének VEZETETT útja 5 lépésben, hogy
 * véletlenül se maradjon ki semmi:
 *   1. Könyvelés-mappa előkészítése (hivatalos EREK-sablon a gépre)
 *   2. Excel-fejléc (Koltsegvetes!B78 = egyházmegye, B79 = egyházközség)
 *   3. Bankszámla → betű-lap párosítás (deviza-javaslat + KÖTELEZŐ megerősítés)
 *   4. Excel-szinkron kapcsoló
 *   5. Záró ellenőrzés (zöld pipák + E4-egyeztetés ajánlása)
 *
 * A lépés-logika a `lib/excel-setup-flow.ts` KÖZÖS moduljából jön — a
 * Beállítások → Könyvelés panel ugyanazokat a függvényeket hívja, itt csak a
 * vezetett UI él. Továbblépni csak KÉSZ lépésről lehet (mappa létezik /
 * B78+B79 kitöltve / párosítás megerősítve VAGY nincs aktív bankszámla /
 * kapcsoló bekapcsolva).
 *
 * Megnyitás: a desktop-shell a 'kartoteka:open-excel-wizard' eseményre
 * mountolja (Pénzügy hero-gomb hiányos előkészítésnél + Könyvelés-panel gombja).
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  FolderOpen,
  FolderSync,
  Landmark,
  RefreshCw,
  ToggleRight,
} from 'lucide-react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kartoteka/ui'
import { BANK_LETTERS } from '@kartoteka/core'

import { excelOpenFolder, type ExcelFolderInfo, type SheetMeta } from '../lib/excel'
import { EXCEL_EGYHAZMEGYEK, isExcelSyncEnabled } from '../lib/excel-settings'
import {
  applyExcelFejlec,
  applyExcelSyncEnabled,
  confirmExcelBankMapping,
  emitExcelSetupChanged,
  loadExcelBankMappingState,
  loadExcelFejlecState,
  loadExcelFolderState,
  setupExcelFolder,
  suggestBankLetters,
  type ExcelBankAccountRow,
} from '../lib/excel-setup-flow'

interface ExcelSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A varázsló 5 lépése — a pöttysor és a lépés-fejlécek forrása. */
const STEPS = [
  { key: 'mappa', short: 'Mappa', title: 'Könyvelés-mappa előkészítése', icon: FolderSync },
  { key: 'fejlec', short: 'Fejléc', title: 'Excel-fejléc kitöltése', icon: Building2 },
  { key: 'bank', short: 'Bank', title: 'Bankszámla → betű-lap párosítás', icon: Landmark },
  { key: 'kapcsolo', short: 'Kapcsoló', title: 'Excel-szinkron bekapcsolása', icon: ToggleRight },
  { key: 'zaro', short: 'Ellenőrzés', title: 'Záró ellenőrzés', icon: ClipboardCheck },
] as const

export function ExcelSetupWizard({ open, onOpenChange }: ExcelSetupWizardProps) {
  const year = new Date().getFullYear()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [envError, setEnvError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 1. lépés — mappa
  const [info, setInfo] = useState<ExcelFolderInfo | null>(null)

  // 2. lépés — fejléc (a fájl B78/B79 értéke + szerkesztő-draftok)
  const [fileMegye, setFileMegye] = useState('')
  const [fileNev, setFileNev] = useState('')
  const [megyeDraft, setMegyeDraft] = useState('')
  const [nevDraft, setNevDraft] = useState('')

  // 3. lépés — bank-párosítás
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [bankAccounts, setBankAccounts] = useState<ExcelBankAccountRow[]>([])
  const [bankSheets, setBankSheets] = useState<SheetMeta[]>([])
  const [mapDraft, setMapDraft] = useState<Record<number, string>>({})
  const [mapConfirmed, setMapConfirmed] = useState(false)
  const [bankLoaded, setBankLoaded] = useState(false)

  // 4. lépés — kapcsoló
  const [syncEnabled, setSyncEnabled] = useState(false)

  // ── Állapot-betöltés (a közös flow-modulból; a panel ugyanezt hívja) ──
  const hydrate = useCallback(
    async (target: ExcelFolderInfo) => {
      const [fej, bank] = await Promise.all([
        loadExcelFejlecState(target),
        loadExcelBankMappingState(target, year),
      ])
      if (fej) {
        setFileMegye(fej.fileMegye)
        setFileNev(fej.fileNev)
        setMegyeDraft(fej.megyeDraft)
        setNevDraft(fej.nevDraft)
      }
      setCongregationId(bank.congregationId)
      if (bank.bankAccounts.length > 0) setBankAccounts(bank.bankAccounts)
      if (bank.bankSheets.length > 0) setBankSheets(bank.bankSheets)
      if (bank.confirmed || Object.keys(bank.draft).length > 0) {
        setMapConfirmed(bank.confirmed)
        setMapDraft(bank.draft)
      }
      setBankLoaded(true)
    },
    [year],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setEnvError(null)
    try {
      const i = await loadExcelFolderState(year)
      setInfo(i)
      setSyncEnabled(isExcelSyncEnabled())
      if (i.exists) {
        await hydrate(i)
      } else {
        setBankLoaded(true)
      }
    } catch {
      setEnvError(
        'Az Excel-könyvelés csak a letöltött asztali appban érhető el (böngészőben nem).',
      )
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [year, hydrate])

  // Megnyitáskor mindent tiszta lappal töltünk — a varázsló sosem mutat
  // korábbi futásból ottragadt állapotot.
  useEffect(() => {
    if (!open) return
    setStep(0)
    setMsg(null)
    setError(null)
    setBusy(false)
    setInfo(null)
    setFileMegye('')
    setFileNev('')
    setMegyeDraft('')
    setNevDraft('')
    setCongregationId(null)
    setBankAccounts([])
    setBankSheets([])
    setMapDraft({})
    setMapConfirmed(false)
    setBankLoaded(false)
    void reload()
  }, [open, reload])

  // ── Lépés-készenlét (a továbblépés kapuja) ──
  const folderDone = Boolean(info?.exists)
  const fejlecDone = Boolean(fileMegye && fileNev)
  // Párosítás megerősítve VAGY nincs aktív bankszámla (offline-t is beleértve).
  const bankDone = mapConfirmed || (bankLoaded && bankAccounts.length === 0)
  const syncDone = syncEnabled
  const allDone = folderDone && fejlecDone && bankDone && syncDone
  const doneByStep = [folderDone, fejlecDone, bankDone, syncDone, allDone]

  function canGoTo(target: number): boolean {
    if (target <= step) return true
    for (let j = 0; j < target; j++) {
      if (!doneByStep[j]) return false
    }
    return true
  }

  function goTo(target: number) {
    if (!canGoTo(target)) return
    setMsg(null)
    setError(null)
    setStep(target)
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    // Bezáráskor a nyitva maradt Könyvelés-panel frissül (közös flow-állapot).
    if (!next) emitExcelSetupChanged()
  }

  // ── Lépés-akciók (mind a közös excel-setup-flow modult hívja) ──

  async function handleSetupFolder() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const i = await setupExcelFolder(year)
      setInfo(i)
      setMsg(
        i.created
          ? 'A könyvelés-mappa előkészítve (a hivatalos sablon a gépre másolva).'
          : 'A könyvelés-mappa már létezik — kész a használatra.',
      )
      await hydrate(i)
    } catch (e) {
      setError(
        `Nem sikerült előkészíteni a mappát: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenFolder() {
    if (!info?.folderPath) return
    try {
      await excelOpenFolder(info.folderPath)
    } catch (e) {
      setError(
        `A mappa megnyitása nem sikerült: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  async function handleApplyFejlec() {
    if (!info?.adatokPath) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const r = await applyExcelFejlec(info, { megye: megyeDraft, nev: nevDraft })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setFileMegye(r.megye)
      setFileNev(r.nev)
      setMegyeDraft(r.megye)
      setNevDraft(r.nev)
      setMsg(
        `Az Excel-fejléc kitöltve: „${r.megye}" egyházmegye, „${r.nev}" egyházközség.` +
          (r.logoCached ? ' A gyülekezeti logó is letöltve.' : ''),
      )
    } catch (e) {
      setError(
        `A fejléc beírása nem sikerült: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  function handleSuggest() {
    setError(null)
    setMapDraft(suggestBankLetters(bankAccounts, bankSheets, mapDraft))
    setMapConfirmed(false)
    setMsg('Javaslat kész — ellenőrizd, majd erősítsd meg a párosítást.')
  }

  function handleLetterChange(bankId: number, letter: string) {
    setMapDraft((d) => ({ ...d, [bankId]: letter }))
    setMapConfirmed(false)
  }

  function handleConfirmMap() {
    if (!congregationId) return
    setError(null)
    setMsg(null)
    const r = confirmExcelBankMapping(congregationId, year, bankAccounts, mapDraft)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setMapConfirmed(true)
    setMsg(
      `Párosítás megerősítve (${r.count} számla). A várakozó banki tételek a következő szinkronnál bekerülnek.`,
    )
  }

  function handleToggleSync() {
    const next = !syncEnabled
    setSyncEnabled(next)
    applyExcelSyncEnabled(next)
  }

  const isLastStep = step === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-white via-white to-teal-50/20 p-0 sm:max-w-2xl">
        {/* Fejléc + lépés-pöttysor */}
        <DialogHeader className="shrink-0 rounded-t-2xl border-b border-teal-100 bg-white/70 px-6 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-3 font-heading text-xl text-slate-800">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <FileSpreadsheet className="size-5" />
            </span>
            <span>
              Excel-könyvelés beállítása
              <p className="mt-0.5 text-xs font-normal text-zinc-400">
                Öt lépés a hivatalos EREK-fájl (Adatok_{year}.xlsx) előkészítéséhez —
                semmi nem marad ki
              </p>
            </span>
          </DialogTitle>

          {/* Lépés-pöttyök: kész = zöld pipa, aktuális = teal gyűrű */}
          <div className="flex items-start pt-2">
            {STEPS.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && (
                  <div
                    className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded ${
                      canGoTo(i) ? 'bg-teal-300' : 'bg-slate-200'
                    }`}
                  />
                )}
                <div className="flex w-16 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={!canGoTo(i)}
                    title={s.title}
                    className={`flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition ${
                      doneByStep[i]
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : i === step
                          ? 'border-teal-600 bg-white text-teal-700 ring-2 ring-teal-200'
                          : canGoTo(i)
                            ? 'border-slate-300 bg-white text-slate-500 hover:border-teal-300'
                            : 'border-slate-200 bg-slate-50 text-slate-300'
                    }`}
                  >
                    {doneByStep[i] ? <Check className="size-4" /> : i + 1}
                  </button>
                  <span
                    className={`text-center text-[10px] leading-tight ${
                      i === step ? 'font-semibold text-teal-700' : 'text-slate-400'
                    }`}
                  >
                    {s.short}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        </DialogHeader>

        {/* Lépés-tartalom */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">
              <RefreshCw className="mr-1.5 inline size-4 animate-spin" />
              Állapot betöltése…
            </p>
          ) : envError ? (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {envError}
            </p>
          ) : (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 font-heading text-base text-slate-800">
                {(() => {
                  const Icon = STEPS[step].icon
                  return <Icon className="size-4 text-teal-600" />
                })()}
                {step + 1}. lépés — {STEPS[step].title}
              </h3>

              {/* ── 1. Könyvelés-mappa ── */}
              {step === 0 && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    A rendszer a hivatalos EREK könyvelés-csomagot (Adatok, Kimutatások,
                    Nyomtatványok, útmutatók) a gépedre másolja — minden évhez külön
                    mappa jön létre. Ide íródnak majd a Kartotékában rögzített tételek.
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Könyvelés-mappa
                    </p>
                    {info ? (
                      <>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {info.folderPath}
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 text-sm">
                          {info.exists ? (
                            <>
                              <CheckCircle2 className="size-4 text-emerald-600" />
                              <span className="text-emerald-700">
                                Kész — az {info.adatokPath?.split(/[\\/]/).pop() ?? 'Adatok'}{' '}
                                fájl megvan.
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="size-4 text-amber-600" />
                              <span className="text-amber-700">
                                Még nincs előkészítve — kattints a „Mappa előkészítése"
                                gombra.
                              </span>
                            </>
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">—</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSetupFolder()}
                        disabled={busy}
                      >
                        {busy ? (
                          <RefreshCw className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <FolderSync className="mr-1.5 size-4" />
                        )}
                        {info?.exists ? 'Mappa frissítése' : 'Mappa előkészítése'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleOpenFolder()}
                        disabled={!info?.exists}
                      >
                        <FolderOpen className="mr-1.5 size-4" />
                        Mappa megnyitása
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* ── 2. Excel-fejléc ── */}
              {step === 1 && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    A hivatalos fájl csak akkor kínálja fel a költségvetési kategóriákat
                    (és csak akkor szerkeszthető kézzel), ha a Koltsegvetes lapon ki van
                    töltve az egyházmegye és az egyházközség neve. A rendszer a
                    gyülekezeted adataiból ajánlja fel — egy kattintással beírod.
                  </p>

                  {fejlecDone ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Kitöltve: <strong>{fileMegye}</strong> egyházmegye,{' '}
                        <strong>{fileNev}</strong> egyházközség.
                      </span>
                    </p>
                  ) : (
                    <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Még hiányzik {!fileMegye && 'az egyházmegye'}
                        {!fileMegye && !fileNev && ' és '}
                        {!fileNev && 'az egyházközség neve'} a fájlból — töltsd ki lent,
                        majd kattints a „Beírás az Excelbe" gombra.
                      </span>
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium text-slate-600"
                        htmlFor="wizard-fejlec-megye"
                      >
                        Egyházmegye (hivatalos lista)
                      </label>
                      <select
                        id="wizard-fejlec-megye"
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={megyeDraft}
                        onChange={(e) => setMegyeDraft(e.currentTarget.value)}
                        disabled={busy}
                      >
                        <option value="">— válassz egyházmegyét —</option>
                        {EXCEL_EGYHAZMEGYEK.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium text-slate-600"
                        htmlFor="wizard-fejlec-nev"
                      >
                        Egyházközség neve („Református" és „Egyházközség" nélkül)
                      </label>
                      <Input
                        id="wizard-fejlec-nev"
                        className="h-9"
                        value={nevDraft}
                        onChange={(e) => setNevDraft(e.target.value)}
                        placeholder="pl. Szászfenesi"
                        disabled={busy}
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleApplyFejlec()}
                    disabled={busy || !megyeDraft || !nevDraft.trim()}
                  >
                    {busy ? (
                      <RefreshCw className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Building2 className="mr-1.5 size-4" />
                    )}
                    Beírás az Excelbe
                  </Button>
                  <p className="text-xs text-slate-500">
                    A beírás előtt automatikus biztonsági másolat készül. Ha az Excel
                    éppen nyitva van, előbb zárd be — különben a fájl zárolt.
                  </p>
                </>
              )}

              {/* ── 3. Bank → betű-lap párosítás ── */}
              {step === 2 && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    A hivatalos Excelben minden bankszámlának saját betű-lapja van
                    (A, B, C…). A rendszer a deviza alapján javaslatot tesz, de az ELSŐ
                    banki írás előtt neked kell megerősítened — megerősítés nélkül banki
                    tétel nem kerül a fájlba.
                  </p>

                  {bankAccounts.length === 0 ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>
                        Nincs aktív bankszámla a Kartotékában (vagy offline vagy) — ez a
                        lépés most kihagyható. Ha később bankszámlát rögzítesz, a
                        párosítás a Beállítások → Könyvelés panelen végezhető el.
                      </span>
                    </p>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      {bankAccounts.map((acc) => (
                        <div key={acc.id} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                            {acc.bank_neve}
                            <span className="ml-1.5 text-xs text-slate-400">
                              ({acc.valuta ?? 'RON'})
                            </span>
                          </span>
                          <select
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                            value={mapDraft[acc.id] ?? ''}
                            onChange={(e) => handleLetterChange(acc.id, e.currentTarget.value)}
                          >
                            <option value="">— nincs —</option>
                            {BANK_LETTERS.map((l) => {
                              const sheetMeta = bankSheets.find((s) => s.name === l)
                              return (
                                <option key={l} value={l}>
                                  {l}
                                  {sheetMeta?.currency ? ` (${sheetMeta.currency})` : ''}
                                </option>
                              )
                            })}
                          </select>
                        </div>
                      ))}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={handleSuggest}>
                          Javaslat deviza alapján
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleConfirmMap}
                          disabled={Object.keys(mapDraft).length === 0}
                          className={mapConfirmed ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                        >
                          <CheckCircle2 className="mr-1.5 size-4" />
                          {mapConfirmed ? 'Párosítás megerősítve' : 'Párosítás megerősítése'}
                        </Button>
                      </div>
                      {mapConfirmed && (
                        <p className="text-xs text-emerald-700">
                          ✓ Megerősítve — a banki tételek és belső mozgások a kiosztott
                          betű-lapokra íródnak.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── 4. Excel-szinkron kapcsoló ── */}
              {step === 3 && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Az utolsó beállítás: kapcsold be az Excel-szinkront. Ettől kezdve a
                    Kartotékában rögzített készpénzes és banki tételek automatikusan
                    bekerülnek a könyvelés-fájlba is — akár a Kartotékában nézed, akár
                    az Excelben, minden egyezik.
                  </p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={handleToggleSync}
                      className="mt-0.5 size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-800">
                        Excel-szinkron bekapcsolása
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Ha be van kapcsolva, a rögzített tételek automatikusan bekerülnek
                        a könyvelés-fájlba is (sztornó esetén ellentételező sorral — a
                        hivatalos könyv mindig nettó-helyes marad).
                      </span>
                    </span>
                  </label>
                  {syncDone && (
                    <p className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      Bekapcsolva — a háttér-szinkron elindult.
                    </p>
                  )}
                </>
              )}

              {/* ── 5. Záró ellenőrzés ── */}
              {step === 4 && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Minden lépés állapota egy helyen — ha mindenhol zöld pipát látsz, az
                    Excel-szinkronizáció teljesen elő van készítve.
                  </p>
                  <ul className="space-y-2">
                    <SummaryRow
                      done={folderDone}
                      doneText={`Könyvelés-mappa előkészítve: ${info?.folderPath ?? ''}`}
                      missingText="A könyvelés-mappa még nincs előkészítve (1. lépés)."
                    />
                    <SummaryRow
                      done={fejlecDone}
                      doneText={`Excel-fejléc kitöltve: „${fileMegye}" egyházmegye, „${fileNev}" egyházközség.`}
                      missingText="Az Excel-fejléc (egyházmegye + egyházközség) még hiányzik (2. lépés)."
                    />
                    <SummaryRow
                      done={bankDone}
                      doneText={
                        mapConfirmed
                          ? `Bank → betű-lap párosítás megerősítve (${Object.values(mapDraft).filter(Boolean).length} számla).`
                          : 'Nincs aktív bankszámla — párosítás most nem szükséges (később a Beállítások → Könyvelés panelen).'
                      }
                      missingText="A bank → betű-lap párosítás még nincs megerősítve (3. lépés)."
                    />
                    <SummaryRow
                      done={syncDone}
                      doneText="Excel-szinkron bekapcsolva — a tételek automatikusan a fájlba íródnak."
                      missingText="Az Excel-szinkron még nincs bekapcsolva (4. lépés)."
                    />
                  </ul>
                  <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                    <p className="text-xs leading-relaxed text-teal-900">
                      <strong>Tipp:</strong> az első rögzített tételek után futtasd le az
                      „Egyeztetés — Excel ↔ Kartotéka" (E4) összevetést a Beállítások →
                      Könyvelés panelen — lap-szintű összegekkel mutatja, hogy minden a
                      helyére került-e.
                    </p>
                  </div>
                </>
              )}

              {/* Lépés-szintű visszajelzések */}
              {msg && (
                <p className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  {msg}
                </p>
              )}
              {error && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Lábléc — Vissza / Tovább (továbblépés csak KÉSZ lépésnél) */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goTo(step - 1)}
            disabled={step === 0 || busy}
            className="rounded-xl"
          >
            <ChevronLeft className="mr-1 size-4" />
            Vissza
          </Button>
          <div className="flex items-center gap-3">
            {!doneByStep[step] && !loading && !envError && (
              <span className="text-xs text-slate-400">
                A továbblépéshez fejezd be ezt a lépést.
              </span>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (isLastStep) {
                  handleOpenChange(false)
                } else {
                  goTo(step + 1)
                }
              }}
              disabled={Boolean(envError) || loading || busy || !doneByStep[step]}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="mr-1 size-4" />
                  Befejezés
                </>
              ) : (
                <>
                  Tovább
                  <ChevronRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Egy záró-ellenőrzési sor: zöld pipa (kész) vagy borostyán jelzés (hiányzik). */
function SummaryRow({
  done,
  doneText,
  missingText,
}: {
  done: boolean
  doneText: string
  missingText: string
}) {
  return (
    <li
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        done
          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
          : 'border-amber-200 bg-amber-50/60 text-amber-800'
      }`}
    >
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <span className="break-all">{done ? doneText : missingText}</span>
    </li>
  )
}
