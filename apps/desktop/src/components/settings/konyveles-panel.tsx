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
} from 'lucide-react'

import { Button } from '@kartoteka/ui'
import { BANK_LETTERS } from '@kartoteka/core'

import {
  excelDefaultFolder,
  excelFolderInfo,
  excelOpenFolder,
  excelReadMeta,
  excelSaveFile,
  excelSetCells,
  excelSetupFolder,
  type ExcelFolderInfo,
  type SheetMeta,
} from '../../lib/excel'
import {
  LS_DIOCESE,
  LS_FOLDER,
  LS_LOGO,
  getBankMap,
  isExcelSyncEnabled,
  saveBankMap,
  setExcelSyncEnabled,
  type BankMapEntry,
} from '../../lib/excel-settings'
import {
  getExcelWriteSyncStatus,
  runExcelWriteSyncManually,
  retryBlockedExcelRows,
  startExcelWriteAutoSync,
} from '../../lib/excel-write-sync'
import { getDesktopSupabase } from '../../lib/supabase'
import { getDesktopUser } from '../../lib/desktop-user'
import { getLocalOwnProfile, getLocalOwnCongregation } from '../../lib/sync'
import { getTauriSqliteBackend } from '../../lib/tauri-sqlite-backend'

/** ArrayBuffer → base64 (a webview btoa-jával; a logók kicsik, ez bőven elég). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

interface BankAccountRow {
  id: number
  bank_neve: string
  valuta: string | null
}

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
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [bankSheets, setBankSheets] = useState<SheetMeta[]>([])
  const [mapDraft, setMapDraft] = useState<Record<number, string>>({})
  const [mapConfirmed, setMapConfirmed] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapMsg, setMapMsg] = useState<string | null>(null)

  // Élő szinkron-státusz
  const [outboxCounts, setOutboxCounts] = useState<{ pending: number; blocked: number; done: number } | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [syncRunning, setSyncRunning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const saved = window.localStorage.getItem(LS_FOLDER)
      const path = saved && saved.trim() ? saved : await excelDefaultFolder(year)
      const i = await excelFolderInfo(path)
      setInfo(i)
    } catch (e) {
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
  const loadBankMapping = useCallback(async (target: ExcelFolderInfo | null) => {
    setMapLoading(true)
    setMapMsg(null)
    try {
      const supabase = getDesktopSupabase()
      const user = await getDesktopUser()
      if (!user) return
      const profile = await getLocalOwnProfile(user.id)
      const cid = profile?.congregation_id ?? null
      setCongregationId(cid)
      if (!cid) return

      // Bankszámlák — online; offline a mentett térkép nevei maradnak
      try {
        const { data } = await supabase
          .from('bankszamlak')
          .select('id, bank_neve, valuta')
          .eq('congregation_id', cid)
          .eq('aktiv', true)
          .order('bank_neve')
        if (data) setBankAccounts(data as BankAccountRow[])
      } catch {
        /* offline — a mentett térkép alapján mutatunk */
      }

      // Excel betű-lapok (deviza a C3-ból) — a javaslathoz
      if (target?.adatokPath) {
        try {
          const meta = await excelReadMeta(target.adatokPath)
          setBankSheets(meta.sheets.filter((s) => s.isBank))
        } catch {
          /* csendes */
        }
      }

      // Mentett térkép
      const saved = getBankMap(cid, new Date().getFullYear())
      if (saved) {
        setMapConfirmed(saved.confirmed)
        const draft: Record<number, string> = {}
        for (const e of saved.entries) draft[e.bankszamlaId] = e.letter
        setMapDraft(draft)
      }
    } finally {
      setMapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (info) void loadBankMapping(info)
  }, [info, loadBankMapping])

  // Deviza-alapú javaslat: az első olyan betű-lap, amelynek C3-deviza egyezik,
  // és még nincs másik bankhoz rendelve (bank_neve sorrendben).
  function suggestLetters(): Record<number, string> {
    const draft: Record<number, string> = { ...mapDraft }
    const used = new Set(Object.values(draft))
    for (const acc of bankAccounts) {
      if (draft[acc.id]) continue
      const wanted = (acc.valuta ?? 'RON').trim().toUpperCase()
      const candidate = bankSheets.find(
        (s) =>
          !used.has(s.name) &&
          (s.currency ?? '').trim().toUpperCase() === wanted,
      )
      if (candidate) {
        draft[acc.id] = candidate.name
        used.add(candidate.name)
      }
    }
    return draft
  }

  function handleSuggest() {
    const draft = suggestLetters()
    setMapDraft(draft)
    setMapConfirmed(false)
    setMapMsg('Javaslat kész — ellenőrizd, majd erősítsd meg a párosítást.')
  }

  function handleLetterChange(bankId: number, letter: string) {
    setMapDraft((d) => ({ ...d, [bankId]: letter }))
    setMapConfirmed(false)
  }

  function handleConfirmMap() {
    if (!congregationId) return
    const entries: BankMapEntry[] = bankAccounts
      .filter((a) => mapDraft[a.id])
      .map((a) => ({
        bankszamlaId: a.id,
        bankNeve: a.bank_neve,
        valuta: a.valuta,
        letter: mapDraft[a.id],
      }))
    // Duplikált betű-védelem
    const letters = entries.map((e) => e.letter)
    if (new Set(letters).size !== letters.length) {
      setMapMsg('Két bank nem kaphatja ugyanazt a betű-lapot — javítsd a kiosztást.')
      return
    }
    saveBankMap(congregationId, year, { confirmed: true, entries })
    setMapConfirmed(true)
    setMapMsg(
      `Párosítás megerősítve (${entries.length} számla). A várakozó banki tételek a következő szinkronnál bekerülnek.`,
    )
    void runExcelWriteSyncManually()
  }

  async function handleSetup() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const saved = window.localStorage.getItem(LS_FOLDER)
      const i = await excelSetupFolder(year, saved && saved.trim() ? saved : null)
      window.localStorage.setItem(LS_FOLDER, i.folderPath)
      setInfo(i)

      const baseMsg = i.created
        ? 'A könyvelés-mappa előkészítve (a hivatalos sablon a gépre másolva).'
        : 'A könyvelés-mappa már létezik — kész a használatra.'

      // A rendszer automatikusan beírja a gyülekezet egyházmegyéjét (best-effort —
      // ettől populálódik a chart; ha most nem sikerül, a gombbal külön elvégezhető).
      let appliedNote = ''
      if (i.adatokPath) {
        try {
          const r = await applyCongregationTo(i)
          if ('dioceseName' in r) {
            appliedNote =
              ` Egyházmegye automatikusan beírva: „${r.dioceseName}".` +
              (r.logoCached ? ' A gyülekezeti logó is letöltve.' : '')
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

  // Gyülekezeti kontextus feloldása: az egyházmegye nevét (elsődlegesen a hivatalos
  // `dioceses.name` online, a congregation diocese_id-ja alapján; tartalékként a
  // denormalizált egyhazmegye-mező, majd a lokális cache offline) + a logó URL-jét.
  async function getCongregationContext(): Promise<{
    dioceseName: string | null
    cimerUrl: string | null
  }> {
    let cimerUrl: string | null = null
    try {
      const supabase = getDesktopSupabase()
      const user = await getDesktopUser()
      if (user) {
        const cong = await getLocalOwnCongregation(user.id)
        if (!cong) await getLocalOwnProfile(user.id) // best-effort hidratálás
        cimerUrl = cong?.cimer_url ?? null
        let name = cong?.egyhazmegye?.trim() || null
        if (cong?.diocese_id) {
          try {
            const { data } = await supabase
              .from('dioceses')
              .select('name')
              .eq('id', cong.diocese_id)
              .maybeSingle()
            if (data?.name) name = String(data.name).trim()
          } catch {
            /* offline — marad a denormalizált / cache */
          }
        }
        if (name) {
          window.localStorage.setItem(LS_DIOCESE, name)
          return { dioceseName: name, cimerUrl }
        }
      }
    } catch {
      /* csendes — esünk a cache-re */
    }
    return { dioceseName: window.localStorage.getItem(LS_DIOCESE), cimerUrl }
  }

  // A gyülekezeti logó letöltése + lokális cache-elése a Könyvelés-mappába
  // („csak letöltés/cache", NEM az Excelbe ágyazva). Best-effort: null hiba esetén.
  async function cacheLogo(folderPath: string, cimerUrl: string): Promise<string | null> {
    try {
      const res = await fetch(cimerUrl)
      if (!res.ok) return null
      const buf = await res.arrayBuffer()
      const ext = (
        cimerUrl.split('?')[0].match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[1] ?? 'png'
      ).toLowerCase()
      const sep = folderPath.includes('\\') ? '\\' : '/'
      const dest = `${folderPath}${sep}cimer.${ext}`
      await excelSaveFile(dest, arrayBufferToBase64(buf))
      window.localStorage.setItem(LS_LOGO, dest)
      return dest
    } catch {
      return null
    }
  }

  // Az egyházmegye beírása az `Koltsegvetes!V3`-ba (ettől populálódik a hivatalos
  // chart) + a gyülekezeti logó letöltése/cache-elése (ha van beállítva).
  async function applyCongregationTo(
    target: ExcelFolderInfo,
  ): Promise<{ dioceseName: string; logoCached: boolean } | { error: string }> {
    const ctx = await getCongregationContext()
    if (!ctx.dioceseName) {
      return {
        error:
          'Nincs egyházmegye (még nem töltődött le — előbb legyen egyszer hálózat —, vagy nincs beállítva a gyülekezethez).',
      }
    }
    if (target.adatokPath) {
      await excelSetCells(target.adatokPath, [
        { sheet: 'Koltsegvetes', cell: 'V3', value: ctx.dioceseName },
      ])
    }
    let logoCached = false
    if (ctx.cimerUrl) {
      logoCached = (await cacheLogo(target.folderPath, ctx.cimerUrl)) !== null
    }
    return { dioceseName: ctx.dioceseName, logoCached }
  }

  async function handleApplyCongregation() {
    if (!info?.adatokPath) return
    setApplyingCong(true)
    setError(null)
    setMsg(null)
    try {
      const r = await applyCongregationTo(info)
      if ('error' in r) setError(r.error)
      else
        setMsg(
          `Egyházmegye beírva az Excelbe: „${r.dioceseName}". A költségvetési kategóriák a megnyitáskor megjelennek.` +
            (r.logoCached ? ' A gyülekezeti logó is letöltve.' : ''),
        )
    } catch (e) {
      setError(`A gyülekezeti adatok alkalmazása nem sikerült: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setApplyingCong(false)
    }
  }

  function toggleSync() {
    const next = !syncEnabled
    setSyncEnabled(next)
    setExcelSyncEnabled(next)
    if (next) {
      // Bekapcsoláskor azonnal indítjuk a workert (boot-on az auth-gate indítja)
      startExcelWriteAutoSync()
    }
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

        {/* Gyülekezeti adatok alkalmazása — az egyházmegyét írja az Excelbe */}
        {info?.exists && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleApplyCongregation()}
              disabled={applyingCong}
              className="border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              {applyingCong ? (
                <RefreshCw className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Building2 className="mr-1.5 size-4" />
              )}
              Gyülekezeti adatok alkalmazása
            </Button>
            <p className="mt-1.5 text-xs text-slate-500">
              A gyülekezet egyházmegyéjét beírja az Excelbe — ettől jelennek meg a hivatalos
              költségvetési kategóriák —, és letölti a gyülekezeti logót a könyvelés-mappába.
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
    </div>
  )
}
