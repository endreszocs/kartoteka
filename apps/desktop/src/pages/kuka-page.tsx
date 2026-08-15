/**
 * Kuka oldal — `/kuka` route (2026-08-15, desktop-paritás 3. szelet).
 *
 * A webes `/kuka` oldal desktop-párja: a megjelenítés és a megerősítő/toast-
 * logika a KÖZÖS `RecycleBinBody` + `useRecycleBinHandlers`
 * (@kartoteka/ui-app), az adat-réteg viszont desktop-saját
 * (`lib/recycle-bin.ts`): a törölt sorok NEM részei a lokális
 * SQLCipher-tükörnek (a pull `deleted=false`-ra szűr), ezért a lista direkt
 * Supabase-lekérdezéssel érkezik, és minden művelet szerver-visszaigazolással
 * fut.
 *
 * MIÉRT online-only (paritás-terv 4.4. + 4.6. kockázat, a desktop-rental-tab
 * mintája): a visszaállítás és a végleges törlés felelős, azonnal a szerveren
 * ható művelet — offline nem kerül várakozó sorba (fail-closed): kapcsolat
 * vagy online belépés nélkül az oldal HANGOS magyarázó kártyát mutat.
 *
 * A visszaállított tétel a lokális tükörben a következő teljes pull után
 * jelenik meg újra (4.6. kockázat) — a siker-üzenet ezt meg is mondja.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CloudOff, RefreshCw, Trash2, X } from 'lucide-react'

import { Button, Card, CardContent } from '@kartoteka/ui'
import {
  PageHero,
  RecycleBinBody,
  RECYCLE_BIN_TABLES,
  useRecycleBinHandlers,
  type RecycleBinDisplayRow,
  type RecycleBinToastKind,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import {
  emptyBinDesktop,
  hardDeleteRecordDesktop,
  listDeletedRecordsDesktop,
  restoreRecordDesktop,
} from '../lib/recycle-bin'
import { getLocalOwnProfile } from '../lib/sync'
import { isOnlineWithSession } from '../lib/use-session-online'

export function KukaPage() {
  // null = a profil még feloldás alatt; '' = nincs hozzárendelt gyülekezet.
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [rows, setRows] = useState<RecycleBinDisplayRow[] | undefined>(undefined)
  const [failedTables, setFailedTables] = useState<string[]>([])
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<{ kind: RecycleBinToastKind; msg: string } | null>(null)

  // Gyülekezet-feloldás: getDesktopUser (SOHA nem auth.getUser — offline
  // indulásnál az némán null-t adna) → lokális profil → congregation_id.
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(user => (user ? getLocalOwnProfile(user.id) : null))
      .then(profile => {
        if (mounted) setCongregationId(profile?.congregation_id ?? '')
      })
      .catch(() => {
        if (mounted) setCongregationId('')
      })
    return () => {
      mounted = false
    }
  }, [])

  const load = useCallback(async () => {
    // ⚠️ Effect-szabály: az első setState csak az első await UTÁN futhat —
    // ezért az online-ellenőrzés áll elöl (az mindig await-tel jár).
    const online = await isOnlineWithSession()
    // Fail-closed hatókör-őr: üres congregation_id-vel SOHA nem indítunk
    // lekérdezést — hangos hiba, nem szűretlen lista.
    if (!congregationId) {
      setOffline(false)
      setLoadError('Nincs hozzárendelt gyülekezet ezen a gépen — a Kuka nem tölthető be. Jelentkezz be online egyszer, hogy a profilod letöltődjön.')
      return
    }
    if (!online) {
      setLoadError(null)
      setOffline(true)
      return
    }
    setOffline(false)
    setLoading(true)
    try {
      const result = await listDeletedRecordsDesktop(congregationId)
      setLoadError(null)
      setRows(result.rows)
      setFailedTables(result.failedTables)
    } catch (err) {
      setLoadError(`A Kuka betöltése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId])

  useEffect(() => {
    if (congregationId === null) return // a profil még feloldás alatt
    void load()
  }, [congregationId, load])

  // A közös művelet-hook: a megerősítő kérdések és a toast-szövegek a webbel
  // azonosak; a műveletek a desktop szerver-visszaigazolásos útján futnak.
  const handlers = useRecycleBinHandlers({
    restore: (table, id) => restoreRecordDesktop(congregationId ?? '', table, id),
    hardDelete: (table, id) => hardDeleteRecordDesktop(congregationId ?? '', table, id),
    emptyBin: olderThanDays =>
      emptyBinDesktop(congregationId ?? '', rows ?? [], olderThanDays),
    onToast: (msg, kind) => setBanner({ kind, msg }),
    hasReadError: failedTables.length > 0,
    // A webes szöveg a Dexie-optimista útról szól — itt a szerver az igazság,
    // és a lokális tükör csak a következő teljes pull-nál frissül (4.6.).
    restoreSuccessMessage:
      'Visszaállítva a szerveren. A helyi listákban a következő frissítés (teljes szinkron) után jelenik meg újra.',
    // Desktopon nincs live query — sikeres művelet után újratöltünk.
    onChanged: () => void load(),
  })

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Kuka"
          title="Törölt rekordok visszaállítása"
          description="Itt találod a legutóbb törölt rekordokat. 30 napon belül bármelyiket visszaállíthatod — utána a szerver automatikusan véglegesen törli őket. A lista közvetlenül a szerverről érkezik, ezért internetkapcsolat és online belépés kell hozzá."
          Icon={Trash2}
          actions={
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading || congregationId === null}
              className="rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_16px_30px_-22px_rgba(190,18,60,0.55)]"
            >
              <RefreshCw className={`mr-1 size-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Frissítés…' : 'Frissítés most'}
            </Button>
          }
        />

        {/* Oldal-szintű visszajelzés (a dialógus-toast desktop-mintája) */}
        {banner && (
          <Card
            className={
              banner.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50/80'
                : 'border-red-200 bg-red-50/80'
            }
          >
            <CardContent
              className={`flex items-start gap-2 p-3 text-sm ${
                banner.kind === 'success' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {banner.kind === 'success' ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="flex-1">{banner.msg}</span>
              <button
                type="button"
                aria-label="Üzenet bezárása"
                onClick={() => setBanner(null)}
                className="shrink-0 opacity-60 hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            </CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="mr-1.5 size-3.5" />
                Újrapróbálás
              </Button>
            </CardContent>
          </Card>
        )}

        {offline && (
          <div className="card-raised p-8 text-center">
            <CloudOff className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              A Kukához internetkapcsolat és online belépés szükséges.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              A törölt rekordoknak nincs helyi másolata ezen a gépen — a lista és a
              visszaállítás a kapcsolat helyreállása és online bejelentkezés után
              érhető el.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void load()}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Újrapróbálás
            </Button>
          </div>
        )}

        {!offline && !loadError && (
          <RecycleBinBody
            moduleLabel="Minden modul"
            groups={RECYCLE_BIN_TABLES.map(t => ({ table: t.table, label: t.label }))}
            rows={rows}
            failedTables={failedTables}
            handlers={handlers}
          />
        )}
      </div>
    </DesktopShell>
  )
}
