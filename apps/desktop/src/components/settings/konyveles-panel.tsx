/**
 * Könyvelés (Excel) beállítás-panel — E1 (2026-06-11), E3-élesítés (2026-06-11).
 *
 * A hivatalos EREK Excel-könyvelés mappáját és a DB→Excel írást kezeli:
 *   - Könyvelés-mappa előkészítése/megnyitása (E1) + gyülekezeti auto-konfig (E1.5),
 *   - Bank → betű-lap párosítás deviza-alapú javaslattal + KÖTELEZŐ megerősítés
 *     (enélkül a worker bank-lapra sosem ír),
 *   - Excel-szinkron kapcsoló ÉLŐ státusszal (várakozó/blokkolt tételek,
 *     „Excel nyitva" jelzés, Szinkron most gomb).
 *
 * 2026-06-12 (Endre #1 Excel-wizard): a lépés-logika a KÖZÖS
 * `lib/excel-setup-flow.ts` modulba került — a panel ÉS az Excel-beállítás
 * varázsló (excel-setup-wizard.tsx) ugyanazokat a függvényeket hívja. A panel
 * tetejéről a varázsló is indítható (első beállításhoz ajánlott út).
 *
 * A tényleges fájl-írást kizárólag az `excel-write-sync.ts` worker végzi.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FolderOpen,
  FolderSync,
  Landmark,
  PlayCircle,
  RefreshCw,
  Wand2,
} from 'lucide-react'

import { Button, Input } from '@kartoteka/ui'
import { BANK_LETTERS } from '@kartoteka/core'

import {
  excelOpenFolder,
  excelReadSheetSums,
  type ExcelFolderInfo,
  type SheetMeta,
} from '../../lib/excel'
import {
  getBankMap,
  isExcelSyncEnabled,
  EXCEL_EGYHAZMEGYEK,
} from '../../lib/excel-settings'
import {
  EXCEL_SETUP_CHANGED_EVENT,
  OPEN_EXCEL_WIZARD_EVENT,
  applyExcelFejlec,
  applyExcelSyncEnabled,
  confirmExcelBankMapping,
  loadExcelBankMappingState,
  loadExcelFejlecState,
  loadExcelFolderState,
  setupExcelFolder,
  suggestBankLetters,
  type ExcelBankAccountRow,
} from '../../lib/excel-setup-flow'
import {
  getExcelWriteSyncStatus,
  runExcelWriteSyncManually,
  retryBlockedExcelRows,
} from '../../lib/excel-write-sync'
import { getDesktopSupabase } from '../../lib/supabase'
import { getTauriSqliteBackend } from '../../lib/tauri-sqlite-backend'
import { OblioMappaPanel } from './oblio-mappa-panel'

export function KonyvelesPanel() {
  const year = new Date().getFullYear()
  const [info, setInfo] = useState<ExcelFolderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [applyingCong, setApplyingCong] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [syncEnabled, setSyncEnabled] = useState(false)

  // Bank-párosítás állapot
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [bankAccounts, setBankAccounts] = useState<ExcelBankAccountRow[]>([])
  const [bankSheets, setBankSheets] = useState<SheetMeta[]>([])
  const [mapDraft, setMapDraft] = useState<Record<number, string>>({})
  const [mapConfirmed, setMapConfirmed] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapMsg, setMapMsg] = useState<string | null>(null)
  // ── Koltsegvetes-fejléc (Endre #1, 2026-06-11): B78 = egyházmegye (a sablon
  // 24 hivatalos rövid neve közül), B79 = egyházközség neve csupaszon. Enélkül
  // a fájl kategória-lenyílói üresek — kézzel nem szerkeszthető.
  const [fejlecFileMegye, setFejlecFileMegye] = useState<string>('')
  const [fejlecFileNev, setFejlecFileNev] = useState<string>('')
  const [megyeDraft, setMegyeDraft] = useState<string>('')
  const [nevDraft, setNevDraft] = useState<string>('')
  const [fejlecLoading, setFejlecLoading] = useState(false)

  // Élő szinkron-státusz
  const [outboxCounts, setOutboxCounts] = useState<{ pending: number; blocked: number; done: number } | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [syncRunning, setSyncRunning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const i = await loadExcelFolderState(year)
      setInfo(i)
    } catch {
      setError(
        'Az Excel-könyvelés csak a letöltött asztali appban érhető el (böngészőben nem).',
      )
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    setSyncEnabled(isExcelSyncEnabled())
    void refresh()
  }, [refresh])

  // A varázsló bezárása után a panel állapota frissül (2026-06-12, Endre #1
  // Excel-wizard) — a wizard ugyanazt a flow-modult hívja, itt szinkronizálunk.
  useEffect(() => {
    function onSetupChanged() {
      setSyncEnabled(isExcelSyncEnabled())
      void refresh()
    }
    window.addEventListener(EXCEL_SETUP_CHANGED_EVENT, onSetupChanged)
    return () => window.removeEventListener(EXCEL_SETUP_CHANGED_EVENT, onSetupChanged)
  }, [refresh])

  // ── Élő státusz-poll (5 mp, amíg a panel nyitva) ──
  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const backend = getTauriSqliteBackend()
        const counts = await backend.getExcelOutboxCounts()
        if (!mounted) return
        setOutboxCounts(counts)
        const st = getExcelWriteSyncStatus()
        setSyncNote(st.lastNote)
        setSyncRunning(st.running)
      } catch {
        /* csendes — böngészőben nincs Tauri */
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), 5000)
    return () => {
      mounted = false
      window.clearInterval(id)
    }
  }, [])

  // ── Bank-párosítás betöltése (bankszámlák online + Excel-lapok + mentett térkép) ──
  // A tényleges betöltés a közös excel-setup-flow modulban él (a wizard is azt hívja).
  const loadBankMapping = useCallback(async (target: ExcelFolderInfo | null) => {
    setMapLoading(true)
    setMapMsg(null)
    try {
      const state = await loadExcelBankMappingState(target, new Date().getFullYear())
      setCongregationId(state.congregationId)
      if (!state.congregationId) return
      // Rész-hibáknál (offline / zárolt fájl) a korábbi értékeket hagyjuk meg.
      if (state.bankAccounts.length > 0) setBankAccounts(state.bankAccounts)
      if (state.bankSheets.length > 0) setBankSheets(state.bankSheets)
      if (state.confirmed || Object.keys(state.draft).length > 0) {
        setMapConfirmed(state.confirmed)
        setMapDraft(state.draft)
      }
    } finally {
      setMapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (info) void loadBankMapping(info)
  }, [info, loadBankMapping])

  // ── Koltsegvetes-fejléc állapota: a fájl B78/B79 cellái + javaslatok ──
  // A cella-olvasás + javaslat-képzés a közös excel-setup-flow modulban él.
  const loadFejlec = useCallback(async (target: ExcelFolderInfo | null) => {
    if (!target?.adatokPath) return
    setFejlecLoading(true)
    try {
      const st = await loadExcelFejlecState(target)
      // null = nem olvasható (pl. nyitott/zárolt fájl) — az Állapot frissítése gombbal újra.
      if (st) {
        setFejlecFileMegye(st.fileMegye)
        setFejlecFileNev(st.fileNev)
        setMegyeDraft(st.megyeDraft)
        setNevDraft(st.nevDraft)
      }
    } finally {
      setFejlecLoading(false)
    }
  }, [])

  useEffect(() => {
    if (info?.exists) void loadFejlec(info)
  }, [info, loadFejlec])

  // Deviza-alapú javaslat — a közös suggestBankLetters (excel-setup-flow) hívása.
  function handleSuggest() {
    const draft = suggestBankLetters(bankAccounts, bankSheets, mapDraft)
    setMapDraft(draft)
    setMapConfirmed(false)
    setMapMsg('Javaslat kész — ellenőrizd, majd erősítsd meg a párosítást.')
  }

  function handleLetterChange(bankId: number, letter: string) {
    setMapDraft((d) => ({ ...d, [bankId]: letter }))
    setMapConfirmed(false)
  }

  // Megerősítés (duplikált-betű védelem + mentés + azonnali szinkron-kísérlet)
  // a közös confirmExcelBankMapping-gel — a wizard is pontosan ezt hívja.
  function handleConfirmMap() {
    if (!congregationId) return
    const r = confirmExcelBankMapping(congregationId, year, bankAccounts, mapDraft)
    if (!r.ok) {
      setMapMsg(r.error)
      return
    }
    setMapConfirmed(true)
    setMapMsg(
      `Párosítás megerősítve (${r.count} számla). A várakozó banki tételek a következő szinkronnál bekerülnek.`,
    )
  }

  async function handleSetup() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const i = await setupExcelFolder(year)
      setInfo(i)

      const baseMsg = i.created
        ? 'A könyvelés-mappa előkészítve (a hivatalos sablon a gépre másolva).'
        : 'A könyvelés-mappa már létezik — kész a használatra.'

      // A rendszer automatikusan beírja a gyülekezet egyházmegyéjét (best-effort —
      // ettől populálódik a chart; ha most nem sikerül, a gombbal külön elvégezhető).
      let appliedNote = ''
      if (i.adatokPath) {
        try {
          const r = await applyExcelFejlec(i, { megye: megyeDraft, nev: nevDraft })
          if ('megye' in r) {
            setFejlecFileMegye(r.megye)
            setFejlecFileNev(r.nev)
            setMegyeDraft(r.megye)
            setNevDraft(r.nev)
            appliedNote =
              ` Az Excel-fejléc automatikusan kitöltve: „${r.megye}" egyházmegye, „${r.nev}" egyházközség.` +
              (r.logoCached ? ' A gyülekezeti logó is letöltve.' : '')
          } else {
            appliedNote = ` FIGYELEM: ${r.error}`
          }
        } catch {
          /* az auto-konfig best-effort */
        }
      }
      setMsg(baseMsg + appliedNote)
    } catch (e) {
      setError(`Nem sikerült előkészíteni a mappát: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen() {
    if (!info?.folderPath) return
    try {
      await excelOpenFolder(info.folderPath)
    } catch (e) {
      setError(`A mappa megnyitása nem sikerült: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // A Koltsegvetes-fejléc beírása a közös applyExcelFejlec-kel (excel-setup-flow):
  // B78 = egyházmegye, B79 = egyházközség, V3 gyári suffix öngyógyítása + logó-cache.
  async function handleApplyCongregation() {
    if (!info?.adatokPath) return
    setApplyingCong(true)
    setError(null)
    setMsg(null)
    try {
      const r = await applyExcelFejlec(info, { megye: megyeDraft, nev: nevDraft })
      if ('error' in r) setError(r.error)
      else {
        setFejlecFileMegye(r.megye)
        setFejlecFileNev(r.nev)
        setMegyeDraft(r.megye)
        setNevDraft(r.nev)
        setMsg(
          `Az Excel-fejléc kitöltve: „${r.megye}" egyházmegye, „${r.nev}" egyházközség. ` +
            'A költségvetési kategóriák a fájl következő megnyitásakor megjelennek.' +
            (r.logoCached ? ' A gyülekezeti logó is letöltve.' : ''),
        )
      }
    } catch (e) {
      setError(`A gyülekezeti adatok alkalmazása nem sikerült: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setApplyingCong(false)
    }
  }

  function toggleSync() {
    const next = !syncEnabled
    setSyncEnabled(next)
    // Közös flow-helper: kapcsoló mentése + bekapcsoláskor a worker azonnali indítása.
    applyExcelSyncEnabled(next)
  }

  async function handleSyncNow() {
    setSyncRunning(true)
    try {
      const r = await runExcelWriteSyncManually()
      const note = getExcelWriteSyncStatus().lastNote
      setSyncNote(note)
      setMsg(
        `Szinkron lefutott — beírva: ${r.written}, várakozik: ${r.waiting}, blokkolt: ${r.blocked}.`,
      )
      const backend = getTauriSqliteBackend()
      setOutboxCounts(await backend.getExcelOutboxCounts())
    } catch (e) {
      setError(`Szinkron-hiba: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncRunning(false)
    }
  }

  // ── E4: Excel ↔ Kartotéka egyeztetés (tájékoztató összevetés) ──
  interface E4Row {
    lap: string
    excelDb: number
    excelBev: number
    excelKiad: number
    kartotekaDb: number | null
    kartotekaBev: number | null
    kartotekaKiad: number | null
    egyezik: boolean | null
  }
  const [e4Rows, setE4Rows] = useState<E4Row[] | null>(null)
  const [e4Busy, setE4Busy] = useState(false)

  async function handleE4Check() {
    if (!info?.adatokPath || !congregationId) return
    setE4Busy(true)
    setError(null)
    try {
      const supabase = getDesktopSupabase()
      const ev = year
      const rows: E4Row[] = []

      // Kassza-lap ↔ készpénzes tételek (nem sztornózott — az Excel a tükör-
      // sorokkal nettóz, így az összegnek a nem-sztornózott DB-összeggel kell
      // nagyságrendileg egyeznie; kézzel vezetett sorok eltérést adhatnak).
      const kasszaSums = await excelReadSheetSums(info.adatokPath, 'Kassza')
      let kBev: number | null = null
      let kKiad: number | null = null
      let kDb: number | null = null
      try {
        const [bevRes, kiadRes] = await Promise.all([
          supabase
            .from('befizetes')
            .select('osszeg')
            .eq('congregation_id', congregationId)
            .eq('deleted', false)
            .eq('stornozott', false)
            .is('bankszamla_id', null)
            .gte('datum', `${ev}-01-01`)
            .lte('datum', `${ev}-12-31`),
          supabase
            .from('kiadas')
            .select('osszeg')
            .eq('congregation_id', congregationId)
            .eq('deleted', false)
            .eq('stornozott', false)
            .is('bankszamla_id', null)
            .gte('datum', `${ev}-01-01`)
            .lte('datum', `${ev}-12-31`),
        ])
        if (!bevRes.error && !kiadRes.error) {
          const bevList = (bevRes.data ?? []) as Array<{ osszeg: number }>
          const kiadList = (kiadRes.data ?? []) as Array<{ osszeg: number }>
          kBev = Math.round(bevList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100
          kKiad = Math.round(kiadList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100
          kDb = bevList.length + kiadList.length
        }
      } catch {
        /* offline — csak az Excel-oldal látszik */
      }
      rows.push({
        lap: 'Kassza',
        excelDb: kasszaSums.rowCount,
        excelBev: kasszaSums.bevSum,
        excelKiad: kasszaSums.kiadSum,
        kartotekaDb: kDb,
        kartotekaBev: kBev,
        kartotekaKiad: kKiad,
        egyezik:
          kBev == null || kKiad == null
            ? null
            : Math.abs(kasszaSums.bevSum - kBev) < 0.005 &&
              Math.abs(kasszaSums.kiadSum - kKiad) < 0.005,
      })

      // Megerősített bank-lapok ↔ az adott bankszámla tételei
      const map = getBankMap(congregationId, ev)
      if (map?.confirmed) {
        for (const entry of map.entries) {
          const sums = await excelReadSheetSums(info.adatokPath, entry.letter)
          let bBev: number | null = null
          let bKiad: number | null = null
          let bDb: number | null = null
          try {
            const [bevRes, kiadRes] = await Promise.all([
              supabase
                .from('befizetes')
                .select('osszeg')
                .eq('congregation_id', congregationId)
                .eq('deleted', false)
                .eq('stornozott', false)
                .eq('bankszamla_id', entry.bankszamlaId)
                .gte('datum', `${ev}-01-01`)
                .lte('datum', `${ev}-12-31`),
              supabase
                .from('kiadas')
                .select('osszeg')
                .eq('congregation_id', congregationId)
                .eq('deleted', false)
                .eq('stornozott', false)
                .eq('bankszamla_id', entry.bankszamlaId)
                .gte('datum', `${ev}-01-01`)
                .lte('datum', `${ev}-12-31`),
            ])
            if (!bevRes.error && !kiadRes.error) {
              const bevList = (bevRes.data ?? []) as Array<{ osszeg: number }>
              const kiadList = (kiadRes.data ?? []) as Array<{ osszeg: number }>
              bBev = Math.round(bevList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100
              bKiad = Math.round(kiadList.reduce((t, r) => t + Number(r.osszeg || 0), 0) * 100) / 100
              bDb = bevList.length + kiadList.length
            }
          } catch {
            /* offline */
          }
          rows.push({
            lap: `${entry.letter} (${entry.bankNeve})`,
            excelDb: sums.rowCount,
            excelBev: sums.bevSum,
            excelKiad: sums.kiadSum,
            kartotekaDb: bDb,
            kartotekaBev: bBev,
            kartotekaKiad: bKiad,
            egyezik:
              bBev == null || bKiad == null
                ? null
                : Math.abs(sums.bevSum - bBev) < 0.005 &&
                  Math.abs(sums.kiadSum - bKiad) < 0.005,
          })
        }
      }

      setE4Rows(rows)
    } catch (e) {
      setError(`Egyeztetés-hiba: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setE4Busy(false)
    }
  }

  async function handleRetryBlocked() {
    setSyncRunning(true)
    try {
      const r = await retryBlockedExcelRows()
      setMsg(
        `Blokkolt tételek újrapróbálva — beírva: ${r.written}, várakozik: ${r.waiting}, blokkolt maradt: ${r.blocked}.`,
      )
      const backend = getTauriSqliteBackend()
      setOutboxCounts(await backend.getExcelOutboxCounts())
    } catch (e) {
      setError(`Újrapróbálás-hiba: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 font-heading text-lg text-slate-800">
          <FolderSync className="size-5 text-teal-600" />
          Könyvelés (hivatalos EREK Excel)
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          A Kartotékában rögzített készpénzes és banki tételek a hivatalos EREK
          könyvelés-fájlba (<code className="rounded bg-slate-100 px-1">Adatok_{year}.xlsx</code>)
          is bekerülnek — így akár a Kartotékában nézed, akár az Excelben, minden egyezik.
        </p>
      </div>

      {/* Varázsló-indító (2026-06-12, Endre #1 Excel-wizard) — az előkészítés
          vezetett, 5 lépéses útja; ugyanazt a flow-logikát hívja, mint ez a panel. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Wand2 className="size-4 text-teal-600" />
            Beállítás varázslóval
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Első beállításhoz ajánlott — öt lépés vezet végig (mappa, fejléc,
            bank-párosítás, kapcsoló, ellenőrzés), hogy véletlenül se maradjon ki semmi.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EXCEL_WIZARD_EVENT))}
          className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
        >
          <Wand2 className="mr-1.5 size-4" />
          Varázsló indítása
        </Button>
      </div>

      {/* Mappa-állapot */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Könyvelés-mappa
        </p>
        {loading ? (
          <p className="mt-1 text-sm text-slate-400">Betöltés…</p>
        ) : info ? (
          <>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">{info.folderPath}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              {info.exists ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-emerald-700">
                    Kész — az {info.adatokPath?.split(/[\\/]/).pop() ?? 'Adatok'} fájl megvan.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-amber-600" />
                  <span className="text-amber-700">
                    Még nincs előkészítve — kattints a „Mappa előkészítése" gombra.
                  </span>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-400">—</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void handleSetup()} disabled={busy || loading}>
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
            onClick={() => void handleOpen()}
            disabled={!info?.exists}
          >
            <FolderOpen className="mr-1.5 size-4" />
            Mappa megnyitása
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
            Állapot frissítése
          </Button>
        </div>

        {/* Koltsegvetes-fejléc: egyházmegye + egyházközség (Endre #1) */}
        {info?.exists && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Building2 className="size-3.5" />
              Excel-fejléc — egyházmegye és egyházközség
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              A hivatalos könyvelés-fájl csak akkor kínálja fel a költségvetési
              tételeket (és csak akkor szerkeszthető kézzel), ha a Koltsegvetes
              lapon ki van töltve az egyházmegye és az egyházközség neve. Itt egy
              kattintással beíratod — a rendszer a gyülekezeted adataiból ajánlja fel.
            </p>

            {fejlecFileMegye && fejlecFileNev ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>
                  Kitöltve: <strong>{fejlecFileMegye}</strong> egyházmegye,{' '}
                  <strong>{fejlecFileNev}</strong> egyházközség.
                </span>
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Még hiányzik {!fejlecFileMegye && 'az egyházmegye'}
                  {!fejlecFileMegye && !fejlecFileNev && ' és '}
                  {!fejlecFileNev && 'az egyházközség neve'} a fájlból — töltsd ki
                  lent, majd kattints a „Beírás az Excelbe" gombra.
                </span>
              </p>
            )}

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="fejlec-megye">
                  Egyházmegye (hivatalos lista)
                </label>
                <select
                  id="fejlec-megye"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={megyeDraft}
                  onChange={(e) => setMegyeDraft(e.currentTarget.value)}
                  disabled={applyingCong || fejlecLoading}
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
                <label className="text-xs font-medium text-slate-600" htmlFor="fejlec-nev">
                  Egyházközség neve („Református" és „Egyházközség" nélkül)
                </label>
                <Input
                  id="fejlec-nev"
                  className="h-9"
                  value={nevDraft}
                  onChange={(e) => setNevDraft(e.target.value)}
                  placeholder="pl. Szászfenesi"
                  disabled={applyingCong || fejlecLoading}
                />
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleApplyCongregation()}
              disabled={applyingCong || fejlecLoading || !megyeDraft || !nevDraft.trim()}
              className="mt-2 border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              {applyingCong ? (
                <RefreshCw className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Building2 className="mr-1.5 size-4" />
              )}
              Beírás az Excelbe
            </Button>
            <p className="mt-1.5 text-xs text-slate-500">
              A beírás előtt automatikus biztonsági másolat készül. Ha az Excel
              éppen nyitva van, előbb zárd be — különben a fájl zárolt.
            </p>
          </div>
        )}
      </div>

      {/* Bank → betű-lap párosítás */}
      {info?.exists && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Landmark className="size-3.5" />
            Bankszámla → Excel betű-lap párosítás
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            A hivatalos Excelben minden bankszámlának saját betű-lapja van (A, B, C…).
            A rendszer a deviza alapján javaslatot tesz, de az ELSŐ banki írás előtt
            neked kell megerősítened — megerősítés nélkül banki tétel nem kerül a fájlba.
          </p>

          {mapLoading ? (
            <p className="mt-2 text-sm text-slate-400">Betöltés…</p>
          ) : bankAccounts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Nincs aktív bankszámla a Kartotékában (vagy offline vagy — csatlakozz egyszer a hálózatra).
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {bankAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {acc.bank_neve}
                    <span className="ml-1.5 text-xs text-slate-400">({acc.valuta ?? 'RON'})</span>
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
              {mapMsg && <p className="text-xs text-teal-700">{mapMsg}</p>}
              {mapConfirmed && (
                <p className="text-xs text-emerald-700">
                  ✓ Megerősítve — a banki tételek és belső mozgások a kiosztott betű-lapokra íródnak.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Szinkron kapcsoló + élő státusz */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={toggleSync}
          className="mt-0.5 size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm">
          <span className="font-medium text-slate-800">Excel-szinkron bekapcsolása</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Ha be van kapcsolva, a rögzített tételek automatikusan bekerülnek a könyvelés-fájlba is
            (sztornó esetén ellentételező sorral — a hivatalos könyv mindig nettó-helyes marad).
          </span>
        </span>
      </label>

      {syncEnabled && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Excel-szinkron állapota
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-slate-700">
              Várakozó: <strong>{outboxCounts?.pending ?? '–'}</strong>
            </span>
            <span className="text-slate-700">
              Beírva eddig: <strong>{outboxCounts?.done ?? '–'}</strong>
            </span>
            <span className={outboxCounts?.blocked ? 'text-amber-700' : 'text-slate-700'}>
              Blokkolt: <strong>{outboxCounts?.blocked ?? '–'}</strong>
            </span>
            {syncRunning && (
              <span className="flex items-center gap-1 text-teal-700">
                <RefreshCw className="size-3.5 animate-spin" /> fut…
              </span>
            )}
          </div>
          {syncNote && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              {syncNote}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void handleSyncNow()} disabled={syncRunning}>
              <PlayCircle className="mr-1.5 size-4" />
              Szinkron most
            </Button>
            {(outboxCounts?.blocked ?? 0) > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleRetryBlocked()}
                disabled={syncRunning}
                className="border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                Blokkolt tételek újrapróbálása
              </Button>
            )}
          </div>
        </div>
      )}

      {/* E4 — Egyeztetés (Excel ↔ Kartotéka), tájékoztató összevetés */}
      {info?.exists && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Egyeztetés — Excel ↔ Kartotéka
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Lap-szintű összevetés: az Excel adatsorainak összegei a Kartotéka idei
            (nem sztornózott) tételeivel. Ha kézzel is vezettél sorokat az Excelben,
            az eltérés természetes — a nagy eltérés viszont kihagyott tételt jelez.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => void handleE4Check()}
            disabled={e4Busy}
          >
            {e4Busy ? (
              <RefreshCw className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" />
            )}
            Egyeztetés futtatása
          </Button>
          {e4Rows && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1 pr-2">Lap</th>
                    <th className="py-1 pr-2 text-right">Excel sor</th>
                    <th className="py-1 pr-2 text-right">Excel bevétel</th>
                    <th className="py-1 pr-2 text-right">Excel kiadás</th>
                    <th className="py-1 pr-2 text-right">Kartotéka bevétel</th>
                    <th className="py-1 pr-2 text-right">Kartotéka kiadás</th>
                    <th className="py-1">Állapot</th>
                  </tr>
                </thead>
                <tbody>
                  {e4Rows.map((r) => (
                    <tr key={r.lap} className="border-b border-slate-100">
                      <td className="py-1 pr-2 font-medium text-slate-700">{r.lap}</td>
                      <td className="py-1 pr-2 text-right">{r.excelDb}</td>
                      <td className="py-1 pr-2 text-right">{r.excelBev.toLocaleString('hu-HU')}</td>
                      <td className="py-1 pr-2 text-right">{r.excelKiad.toLocaleString('hu-HU')}</td>
                      <td className="py-1 pr-2 text-right">
                        {r.kartotekaBev == null ? '— (offline)' : r.kartotekaBev.toLocaleString('hu-HU')}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {r.kartotekaKiad == null ? '— (offline)' : r.kartotekaKiad.toLocaleString('hu-HU')}
                      </td>
                      <td className="py-1">
                        {r.egyezik == null ? (
                          <span className="text-slate-400">n/a</span>
                        ) : r.egyezik ? (
                          <span className="font-semibold text-emerald-700">egyezik ✓</span>
                        ) : (
                          <span className="font-semibold text-amber-700">eltér — nézd át!</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

      <p className="text-[11px] leading-relaxed text-slate-400">
        A könyvelés-csomag (Adatok, Kimutatások, Nyomtatványok, útmutatók) a hivatalos EREK-sablon,
        ami az apphoz csomagolva érkezik. Minden évhez külön mappa jön létre a gépeden. Az Excel-fájl
        minden írás előtt automatikus biztonsági másolatot kap.
      </p>

      {/* Befogadott e-Factura (Oblio) mappa — a rendszer által kezelt fix mappa
          a Dokumentumok-ban, hogy a böngésző mappaválasztó hibalehetőségeit elkerüljük. */}
      <div className="border-t border-slate-200 pt-5">
        <OblioMappaPanel />
      </div>
    </div>
  )
}
