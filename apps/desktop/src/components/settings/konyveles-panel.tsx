/**
 * Könyvelés (Excel) beállítás-panel — E1 (2026-06-11).
 *
 * A hivatalos EREK Excel-könyvelés mappáját kezeli a desktopon:
 *   - megmutatja a Könyvelés-mappa útvonalát + az Adatok_<év>.xlsx állapotát,
 *   - „Mappa előkészítése" — a BECSOMAGOLT sablon-csomag teljes tartalmát a gép
 *     egy írható mappájába másolja (idempotens),
 *   - „Mappa megnyitása" — a fájlkezelőben,
 *   - Excel-szinkron be/ki kapcsoló (lokálisan tárolva).
 *
 * A tényleges DB→Excel write-through (E3) ezt az útvonalat fogja használni.
 * A hívások csak Tauri-ablakban működnek; sima böngészőben a try/catch elnyeli.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Building2, CheckCircle2, FolderOpen, FolderSync, RefreshCw } from 'lucide-react'

import { Button } from '@kartoteka/ui'

import {
  excelDefaultFolder,
  excelFolderInfo,
  excelOpenFolder,
  excelSetCells,
  excelSetupFolder,
  type ExcelFolderInfo,
} from '../../lib/excel'
import { getDesktopSupabase } from '../../lib/supabase'
import { getLocalOwnProfile, getLocalOwnCongregation } from '../../lib/sync'

const LS_FOLDER = 'kartoteka-excel-folder-v1'
const LS_SYNC = 'kartoteka-excel-sync-v1'

function loadSyncEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(LS_SYNC) === '1'
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
    setSyncEnabled(loadSyncEnabled())
    void refresh()
  }, [refresh])

  async function handleSetup() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const saved = window.localStorage.getItem(LS_FOLDER)
      const i = await excelSetupFolder(year, saved && saved.trim() ? saved : null)
      window.localStorage.setItem(LS_FOLDER, i.folderPath)
      setInfo(i)
      setMsg(
        i.created
          ? 'A könyvelés-mappa előkészítve (a hivatalos sablon a gépre másolva).'
          : 'A könyvelés-mappa már létezik — kész a használatra.',
      )
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

  // Gyülekezeti adatok (egyházmegye) alkalmazása az Excelre — ettől populálódik
  // a hivatalos chart. Az egyházmegye nevét a felhőből (dioceses.name) oldjuk fel
  // a congregation diocese_id-ja alapján; offline a denormalizált egyhazmegye-mezőt.
  async function handleApplyCongregation() {
    if (!info?.adatokPath) return
    setApplyingCong(true)
    setError(null)
    setMsg(null)
    try {
      const supabase = getDesktopSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Nincs bejelentkezett felhasználó.')
        return
      }
      const cong = await getLocalOwnCongregation(user.id)
      if (!cong) {
        await getLocalOwnProfile(user.id) // best-effort: profil hidratálás
        setError('A gyülekezeti adatok még nem töltődtek le — előbb legyen egyszer hálózat.')
        return
      }

      // Egyházmegye-név feloldása: elsődlegesen a hivatalos dioceses.name (online),
      // tartalékként a denormalizált egyhazmegye-mező.
      let dioceseName = cong.egyhazmegye?.trim() || null
      if (cong.diocese_id) {
        try {
          const { data } = await supabase
            .from('dioceses')
            .select('name')
            .eq('id', cong.diocese_id)
            .maybeSingle()
          if (data?.name) dioceseName = String(data.name).trim()
        } catch {
          /* offline — marad a denormalizált név */
        }
      }
      if (!dioceseName) {
        setError('Nincs egyházmegye beállítva a gyülekezethez.')
        return
      }

      await excelSetCells(info.adatokPath, [
        { sheet: 'Koltsegvetes', cell: 'V3', value: dioceseName },
      ])
      setMsg(
        `Egyházmegye beírva az Excelbe: „${dioceseName}". A költségvetési kategóriák így a megnyitáskor megjelennek.`,
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
    window.localStorage.setItem(LS_SYNC, next ? '1' : '0')
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
              költségvetési kategóriák. (Logó-beágyazás a következő frissítésben.)
            </p>
          </div>
        )}
      </div>

      {/* Szinkron kapcsoló */}
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
            Ha be van kapcsolva, a rögzített tételek automatikusan bekerülnek a könyvelés-fájlba is.
            <em> (A tényleges írás-bekötés a következő frissítésben élesedik — E3.)</em>
          </span>
        </span>
      </label>

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
        ami az apphoz csomagolva érkezik. Minden évhez külön mappa jön létre a gépeden.
      </p>
    </div>
  )
}
