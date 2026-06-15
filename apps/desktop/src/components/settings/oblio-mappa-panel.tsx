/**
 * Befogadott e-Factura (Oblio) mappa-panel — desktop (2026-06-14).
 *
 * A böngésző mappaválasztója sok hibalehetőséget hordoz (rossz mappa,
 * megtagadott engedély, felhő-szinkronizált hely). Az asztali appban a RENDSZER
 * birtokolja a mappát: egy fix, ismert helyen a Dokumentumok-ban
 * (`…\Documents\Kartoteka\Oblio\befogadott`). A lelkész ide teszi az Oblio
 * Wallet-ből letöltött ZIP-et — nem kell mappát keresgélnie.
 *
 * Maga az egyeztetés (XML ↔ kiadás párosítás) jelenleg a webes felületen
 * (Pénzügy → Oblio ellenőrzés) történik, ugyanerre a fizikai mappára mutatva.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FolderCheck,
  FolderOpen,
  FolderSync,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { excelOpenFolder } from '../../lib/excel'
import { oblioFolderInfo, oblioSetupFolder, type OblioFolderInfo } from '../../lib/oblio'

export function OblioMappaPanel() {
  const [info, setInfo] = useState<OblioFolderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInfo(await oblioFolderInfo())
    } catch {
      setError('A befogadott e-Factura mappa csak a letöltött asztali appban érhető el (böngészőben nem).')
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSetup() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const i = await oblioSetupFolder()
      setInfo(i)
      setMsg('A mappa kész — ide töltsd az Oblio ZIP-et. A „Mappa megnyitása” gombbal rögtön megnyithatod.')
    } catch (e) {
      setError(`Nem sikerült előkészíteni a mappát: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen() {
    if (!info?.folderPath) return
    try {
      // A mappának léteznie kell a megnyitáshoz — ha még nincs, előkészítjük.
      if (!info.exists) {
        const i = await oblioSetupFolder()
        setInfo(i)
      }
      await excelOpenFolder(info.folderPath)
    } catch (e) {
      setError(`A mappa megnyitása nem sikerült: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-heading text-lg text-slate-800">
          <FileArchive className="size-5 text-cyan-600" />
          Befogadott e-Factura (Oblio) mappa
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          A beszállítóktól az ANAF SPV-n (e-Factura) érkező számlák ellenőrzéséhez a rendszer egy
          fix mappát kezel a gépeden a Dokumentumok-ban. Az Oblio Wallet-ből letöltött ZIP-et
          mindig <strong>ebbe a mappába</strong> tedd — nem kell mappát választanod, és nem
          tévesztheted el a helyét.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          A mappa helye
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
                    Kész — a mappában: {info.zipCount} ZIP, {info.xmlCount} XML, {info.pdfCount} PDF.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-amber-600" />
                  <span className="text-amber-700">
                    Még nincs előkészítve — kattints a „Mappa előkészítése” gombra.
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
              <FolderCheck className="mr-1.5 size-4" />
            )}
            {info?.exists ? 'Mappa frissítése' : 'Mappa előkészítése'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleOpen()}
            disabled={!info || busy}
          >
            <FolderOpen className="mr-1.5 size-4" />
            Mappa megnyitása
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
            Állapot frissítése
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4 text-sm leading-relaxed text-slate-700">
        <p className="flex items-center gap-1.5 font-medium text-cyan-900">
          <FolderSync className="size-4" />
          Így használd (lépésről lépésre)
        </p>
        <ol className="mt-2 ml-5 list-decimal space-y-1">
          <li>
            Az <strong>Oblio Wallet</strong>-ben (Setări → Import/Export) exportáld a befogadott
            számlákat <strong>ZIP</strong>-be (lásd a Pénzügy súgó „Oblio e-Factura ellenőrzés” fejezetét).
          </li>
          <li>
            Itt kattints a <strong>„Mappa megnyitása”</strong> gombra, és másold a letöltött ZIP-et
            ebbe a mappába.
          </li>
          <li>
            Nyisd meg a <strong>Pénzügy → Oblio ellenőrzés</strong> fület, és kattints a
            <strong> „Beolvasás”</strong> gombra — a rendszer kibontja a ZIP-et, a fájlokat áthelyezi
            egy belső <em>feldolgozott</em> mappába, és párosítja a számlákat a kiadásokkal.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Csak ZIP, XML és PDF fájlt tegyél a mappába. <strong>Beolvasás után a bedobó mappa kiürül</strong>
          {' '}(a fájlok a belső tárba kerülnek) — így mindig látod, mit olvasott már be a rendszer, és a
          mappa tiszta marad. Az ANAF SPV a számlákat csak 60 napra visszamenőleg engedi letölteni — a
          csengőnél időben figyelmeztetünk.
        </p>
      </div>

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
  )
}
