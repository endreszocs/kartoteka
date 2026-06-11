/**
 * Chitanță (papír-nyugta) kiállítás — `/penzugy/chitanta` route.
 *
 * A-M7.2c (2026-04-23) — az első **kiállító** desktop-oldal:
 *   - Aktív tömb panel (tömbök listázás → derivált aktív, `ActiveChitantaTombPanel`)
 *   - Kiállítás form 9 mezővel (+ zod-validálás a core use-case-ben)
 *   - **Online-only** korlát (A-M7.2b): navigator.onLine figyelés +
 *     `offlineNotSupported` hibaflag kezelés
 *   - Siker-banner + "Új chitanță" gomb a folytatásra
 *
 * Lelkész-informálási alapelv (feedback_lelkesz_informalas.md):
 *   - loading / success / error / offline / sync-state kötelező
 *   - pasztorális magyar hibaüzenetek, technikai szleng nélkül
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Wallet,
  WifiOff,
} from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kartoteka/ui'
import {
  issueChitantaUseCase,
  listChitantaTombokUseCase,
  listChitantasUseCase,
  refillChitantaWalletUseCase,
  stornoChitantaUseCase,
  type IssueChitantaResult,
  type ListChitantaTombokResult,
  type ListChitantasResult,
  type RefillChitantaWalletResult,
  type StornoChitantaResult,
} from '@kartoteka/core'
import {
  type ChitantaListRow,
  type ChitantaTombRow,
} from '@kartoteka/validations'

import { ActiveChitantaTombPanel } from '../components/active-chitanta-tomb-panel'
import { ChitantaConflictDialog } from '../components/chitanta-conflict-dialog'
import { ChitantaPrintDialog } from '../components/chitanta-print-dialog'
import { PageHero } from '@kartoteka/ui-app'
import { runChitantaSyncManually } from '../lib/chitanta-sync'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'
import { getLocalOwnProfile } from '../lib/sync'

interface SuccessInfo {
  chitantaId: string
  sorozat: string
  szam: number
  klienesseg_nev: string
  osszeg: number
  /** Offline-módban állt-e ki (pending → szinkronizálásra vár). */
  pending: boolean
}

export function ChitantaPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [rows, setRows] = useState<ChitantaTombRow[]>([])
  const [loadingTombok, setLoadingTombok] = useState(true)
  const [tombokError, setTombokError] = useState<string | null>(null)

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  // Wallet-szám-elérhetőség — a form engedélyezéséhez offline-módban.
  // A ChitantaWalletPanel belső betöltés után `onStatusChange`-en keresztül
  // frissíti ezt a state-et.
  const [walletAvailable, setWalletAvailable] = useState<number>(0)

  const [success, setSuccess] = useState<SuccessInfo | null>(null)

  // ── Auth + congregation_id ──
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(async (resolvedUser) => {
        if (!mounted) return
        setUser(resolvedUser)
        if (resolvedUser) {
          try {
            const profile = await getLocalOwnProfile(resolvedUser.id)
            if (mounted) setCongregationId(profile?.congregation_id ?? null)
          } catch {
            /* csendes */
          }
        }
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // ── Online/offline tracking ──
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Nyugtatömbök betöltése (az aktív-tömb deriválásához) ──
  const loadTombok = useCallback(async () => {
    if (!congregationId) return
    setLoadingTombok(true)
    setTombokError(null)
    try {
      const supabase = getDesktopSupabase()
      const result: ListChitantaTombokResult = await listChitantaTombokUseCase(
        { congregationId },
        { supabase, storage: getTauriSqliteBackend(), runtime: 'desktop' },
      )
      if (result.success) {
        setRows(result.rows)
      } else {
        setTombokError(result.error)
      }
    } catch (err) {
      setTombokError(`Tömbök betöltési hiba: ${errorMessage(err)}`)
    } finally {
      setLoadingTombok(false)
    }
  }, [congregationId])

  useEffect(() => {
    void loadTombok()
  }, [loadTombok])

  // ── Aktív tömb deriválása (napi kritikus státusz) ──
  const activeTomb =
    [...rows]
      .filter((r) => r.aktiv)
      .sort((a, b) => a.szam_kezdet - b.szam_kezdet)[0] ?? null

  // Kiállítás engedélyezhető:
  // - online-módban MINDIG (a szerver adja a számot)
  // - offline-módban CSAK ha van legalább 1 szabad szám a walletben
  const canIssue =
    !!user && !!congregationId && !!activeTomb && (isOnline || walletAvailable > 0)

  // ── Siker-banner → új kiállítás ──
  const handleStartNew = useCallback(() => {
    setSuccess(null)
    void loadTombok() // az aktív tömb maradéka egy lépéssel csökkent
  }, [loadTombok])

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Nyugta"
          title="Chitanță kiállítása"
          description="Papír-nyugta (Oblio nélküli) kiállítás az aktív tömbből."
          Icon={ReceiptText}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadTombok()}
              disabled={loadingTombok}
              className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
            >
              <RefreshCw
                className={`mr-1.5 size-4 ${loadingTombok ? 'animate-spin' : ''}`}
              />
              Frissítés
            </Button>
          }
        />

        {/* Offline-figyelmeztetés — A-M7.2d2b óta kontextus-függő:
            - ha üres a wallet → kritikus (chitanță-kiállítás szünetel)
            - ha van szám → csak tájékoztatás (a tárcából fog menni) */}
        {!isOnline && (
          <OfflineWarning walletAvailable={walletAvailable} />
        )}

        {/* Aktív tömb panel */}
        {loadingTombok ? (
          <Card>
            <CardContent className="flex items-center justify-center py-6 text-muted-foreground">
              <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-3 text-sm">Nyugtatömbök betöltése…</span>
            </CardContent>
          </Card>
        ) : tombokError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {tombokError}
          </div>
        ) : (
          <ActiveChitantaTombPanel rows={rows} />
        )}

        {/* Offline szám-tárca (A-M7.2d1+A-M7.2d2b) — a lelkész a mezőn is tudjon
            kiállítani, ha hálózat nélkül van. Az `onStatusChange` a form
            engedélyezéséhez kell (offline + walletAvailable > 0). */}
        {congregationId && (
          <ChitantaWalletPanel
            congregationId={congregationId}
            isOnline={isOnline}
            onStatusChange={(avail) => setWalletAvailable(avail)}
          />
        )}

        {/* Siker-banner a kiállítás után (online vagy offline) */}
        {success && (
          <Card
            className={
              success.pending
                ? 'border-amber-300 bg-amber-50/60'
                : 'border-emerald-300 bg-emerald-50/60'
            }
          >
            <CardContent
              className={`space-y-3 py-5 text-sm ${
                success.pending ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className={`mt-0.5 size-5 ${
                    success.pending ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
                <div className="flex-1">
                  <p className="font-semibold">
                    {success.pending
                      ? 'Chitanță offline rögzítve.'
                      : 'Chitanță kiállítva.'}
                  </p>
                  <p className="mt-0.5">
                    Sorozat:{' '}
                    <span className="font-mono">{success.sorozat}</span>
                    {' · '}
                    Szám:{' '}
                    <span className="font-mono font-semibold">{success.szam}</span>
                    {' · '}
                    Összeg:{' '}
                    <span className="font-semibold">
                      {success.osszeg.toLocaleString('hu')} RON
                    </span>
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      success.pending ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    Átvevő: {success.klienesseg_nev}
                  </p>
                  {success.pending && (
                    <p className="mt-1.5 text-xs italic text-amber-800">
                      A chitanță lokálisan elmentve, és a szinkronizációs sorba
                      került. Amint a gép online lesz, automatikusan feltöltjük
                      a szerverre.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={handleStartNew}>
                  <Plus className="mr-1.5 size-4" />
                  Új chitanță
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista-szekció — a user látja a múltbeli chitantákat és sztornózhat
            (A-M7.2e, 2026-04-23). */}
        {user && congregationId && (
          <RecentChitantasSection
            congregationId={congregationId}
            refreshKey={success?.chitantaId ?? null}
          />
        )}

        {/* Kiállítás form */}
        {!success && user && congregationId && (
          <IssueChitantaForm
            congregationId={congregationId}
            userId={user.id}
            canIssue={canIssue}
            isOnline={isOnline}
            walletAvailable={walletAvailable}
            disabledReason={
              !isOnline && walletAvailable === 0
                ? 'Jelenleg nincs internet-kapcsolat, és üres a szám-tárca. Csatlakozz a hálózatra, vagy tölts fel sorszámokat a tárcába.'
                : !activeTomb
                  ? 'Nincs aktív nyugtatömb — rögzíts új tömböt a „Nyugtatömbök" oldalon.'
                  : null
            }
            onSuccess={(res) =>
              setSuccess({
                chitantaId: res.chitantaId,
                sorozat: res.sorozat,
                szam: res.szam,
                klienesseg_nev: res.klienesseg_nev,
                osszeg: res.osszeg,
                pending: res.pending,
              })
            }
          />
        )}
      </div>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Chitanta szám-tárca panel (A-M7.2d1)
// A lelkész előre-foglalt sorszámokkal offline is kiállíthat chitantát
// (a kiállítás offline-logikája az A-M7.2d2-ben jön).
// ─────────────────────────────────────────────────────────────────────────

function ChitantaWalletPanel({
  congregationId,
  isOnline,
  onStatusChange,
}: {
  congregationId: string
  isOnline: boolean
  /** Értesíti a parent-et az elérhető szám-mennyiségről (a form engedélyezéséhez). */
  onStatusChange?: (availableCount: number) => void
}) {
  const [available, setAvailable] = useState<number>(0)
  const [nextNumber, setNextNumber] = useState<number | null>(null)
  const [oldest, setOldest] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refilling, setRefilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getTauriSqliteBackend().getWalletStatus(congregationId)
      setAvailable(status.availableCount)
      setNextNumber(status.nextNumber)
      setOldest(status.oldestReservedAt)
      onStatusChange?.(status.availableCount)
    } catch (err) {
      setError(`Szám-tárca olvasási hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId, onStatusChange])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function handleRefill(count: number) {
    setRefilling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const supabase = getDesktopSupabase()
      const result: RefillChitantaWalletResult = await refillChitantaWalletUseCase(
        { congregationId, count },
        { supabase, runtime: 'desktop' },
      )
      if (!result.success) {
        setError(result.error)
        return
      }
      // Lokális wallet tárolás
      await getTauriSqliteBackend().insertWalletNumbers(
        congregationId,
        result.sorozat,
        result.numbers,
      )
      setSuccessMsg(
        `+${result.numbers.length} sorszám a tárcában (${result.sorozat} ${result.numbers[0]}-${result.numbers[result.numbers.length - 1]}).`,
      )
      setTimeout(() => setSuccessMsg(null), 4000)
      await loadStatus()
    } catch (err) {
      setError(`Foglalási hiba: ${errorMessage(err)}`)
    } finally {
      setRefilling(false)
    }
  }

  const low = available > 0 && available <= 3
  const empty = available === 0

  const toneClasses = empty
    ? 'border-red-200 bg-red-50/60 text-red-900'
    : low
      ? 'border-amber-300 bg-amber-50/70 text-amber-900'
      : 'border-indigo-200 bg-indigo-50/60 text-indigo-900'

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClasses}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
              Offline szám-tárca
            </p>
            {loading ? (
              <p className="mt-1 text-xs italic opacity-70">Betöltés…</p>
            ) : empty ? (
              <p className="mt-1">
                <strong>Üres.</strong> Online-módban tölts fel, hogy hálózat nélkül is tudj chitantát kiállítani.
              </p>
            ) : (
              <p className="mt-1">
                <span className="font-semibold">{available} szabad sorszám</span>
                {nextNumber !== null && (
                  <span>
                    {' · '}
                    következő: <span className="font-mono">{nextNumber}</span>
                  </span>
                )}
                {oldest && (
                  <span className="block text-[11px] italic opacity-75">
                    Legrégibb foglalás: {oldest.slice(0, 10)}
                  </span>
                )}
              </p>
            )}
            {low && !empty && (
              <p className="mt-1 text-xs font-semibold">⚠ Kevés szám maradt — érdemes feltölteni.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={empty || low ? 'default' : 'outline'}
            onClick={() => handleRefill(10)}
            disabled={!isOnline || refilling}
            title={
              !isOnline
                ? 'Csak online-módban lehet a tárcát feltölteni.'
                : 'Foglalj 10 sorszámot a szerverről.'
            }
          >
            <Plus className="mr-1.5 size-4" />
            {refilling ? 'Foglalás…' : '+10 szám'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadStatus()}
            disabled={loading || refilling}
            aria-label="Tárca frissítése"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-700">
          <AlertCircle className="mr-1 inline-block size-3.5" />
          {error}
        </p>
      )}
      {successMsg && (
        <p className="mt-2 text-xs text-emerald-700">
          <CheckCircle2 className="mr-1 inline-block size-3.5" />
          {successMsg}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Recent chitantas szekció (A-M7.2e) — a múltbeli chitantak + sztornó
// ─────────────────────────────────────────────────────────────────────────

interface LocalPendingChitanta {
  id: string
  sorozat: string
  szam: number
  szamla_datum: string
  klienesseg_nev: string
  klienesseg_cim: string | null
  osszeg_brut: number
  reprezentand: string | null
  sync_state: 'pending' | 'conflict'
  sync_error: string | null
  created_at: string
}

function RecentChitantasSection({
  congregationId,
  refreshKey,
}: {
  congregationId: string
  /** Ha változik, a lista újratöltődik (pl. sikeres kiállítás után). */
  refreshKey: string | null
}) {
  const [rows, setRows] = useState<ChitantaListRow[]>([])
  const [localPending, setLocalPending] = useState<LocalPendingChitanta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sztornó állapotok
  const [stornoFor, setStornoFor] = useState<ChitantaListRow | null>(null)
  const [stornoIndok, setStornoIndok] = useState('')
  const [stornoSubmitting, setStornoSubmitting] = useState(false)
  const [stornoError, setStornoError] = useState<string | null>(null)

  // Nyomtatás-állapot (A-M7.2f)
  const [printFor, setPrintFor] = useState<string | null>(null)

  // Push-sync állapot (A-M7.2d2c)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // Konfliktus-feloldó modal (A-M7.2d2d)
  const [conflictFor, setConflictFor] = useState<LocalPendingChitanta | null>(null)

  const loadRecent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1) Szerver-oldali lista (online) — a listChitantasUseCase mindkét
      //    platformon a szerverről olvas. Offline-ban üres tömböt ad vissza
      //    vagy hibát — ilyenkor csak a lokális listát mutatjuk.
      const supabase = getDesktopSupabase()
      const serverResult: ListChitantasResult = await listChitantasUseCase(
        { congregationId },
        { supabase, runtime: 'desktop' },
      )
      if (serverResult.success) {
        setRows(serverResult.rows.slice(0, 10))
      } else {
        // A szerver-lista elérhetetlen (offline vagy más hiba) — a lokális
        // pending listát ilyenkor is mutatjuk.
        setRows([])
        if (!/offline|network|fetch|connect|timeout/i.test(serverResult.error)) {
          // Valódi error — csak akkor mutatjuk, ha nem hálózati gond
          setError(serverResult.error)
        }
      }

      // 2) Lokális (pending + conflict) chitanțák — a listChitantasUseCase
      //    csak a szerverről olvas, ezért külön hívás.
      try {
        const pending = await getTauriSqliteBackend().listLocalPendingChitantas(
          congregationId,
        )
        setLocalPending(pending)
      } catch {
        // A lokális olvasás hiba nem blokkolja a szerver-listát — csendes fallback
        setLocalPending([])
      }
    } catch (err) {
      setError(`Lista-hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent, refreshKey])

  async function handleManualSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await runChitantaSyncManually()
      if (res.attempted === 0) {
        setSyncMsg('Nincs szinkronizálásra váró chitanță.')
      } else {
        const parts: string[] = []
        if (res.succeeded > 0) parts.push(`${res.succeeded} felküldve`)
        if (res.retrying > 0) parts.push(`${res.retrying} újrapróbálásra vár`)
        if (res.conflicts > 0) parts.push(`${res.conflicts} konfliktus`)
        setSyncMsg(parts.length > 0 ? parts.join(' · ') : 'Szinkronizáció kész.')
      }
      // Újratöltjük a listákat, hogy a synced-ek eltűnjenek a pending-ből
      void loadRecent()
      setTimeout(() => setSyncMsg(null), 5000)
    } catch (err) {
      setSyncMsg(`Szinkronizálási hiba: ${errorMessage(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleStornoSubmit() {
    if (!stornoFor) return
    setStornoError(null)
    if (stornoIndok.trim().length < 5) {
      setStornoError('A sztornó indoklás legalább 5 karakter legyen.')
      return
    }
    setStornoSubmitting(true)
    try {
      const supabase = getDesktopSupabase()
      const result: StornoChitantaResult = await stornoChitantaUseCase(
        {
          congregationId,
          chitantaId: stornoFor.id,
          indok: stornoIndok.trim(),
        },
        { supabase, runtime: 'desktop' },
      )
      if (result.success) {
        setStornoFor(null)
        setStornoIndok('')
        void loadRecent()
      } else {
        setStornoError(result.error)
      }
    } catch (err) {
      setStornoError(`Sztornó-hiba: ${errorMessage(err)}`)
    } finally {
      setStornoSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Utolsó chitantáim</CardTitle>
            <CardDescription className="text-xs">
              A legutóbbi 10 kiállított nyugta. A sztornózott sorok áthúzottan látszanak.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadRecent()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`}
            />
            Frissítés
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lista betöltése…</p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {error}
          </div>
        ) : rows.length === 0 && localPending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Még nincs kiállított chitanță a gyülekezeten.
          </p>
        ) : (
          <>
            {/* Lokális, még-nem-sync-elt chitanțák — a szerver-lista FÖLÖTT,
                hogy a lelkész rögtön lássa, mi vár a szinkronra. */}
            {localPending.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                    🕓 Szinkronizálásra várnak ({localPending.length})
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleManualSync()}
                    disabled={syncing}
                    className="h-7 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                    title="Azonnali push-szinkronizáció indítása (csak online-módban fut)"
                  >
                    <RefreshCw
                      className={`mr-1 size-3.5 ${syncing ? 'animate-spin' : ''}`}
                    />
                    {syncing ? 'Sync…' : 'Sync most'}
                  </Button>
                </div>
                {syncMsg && (
                  <p className="mb-1.5 text-[11px] italic text-amber-800">
                    {syncMsg}
                  </p>
                )}
                <ul className="divide-y divide-amber-100">
                  {localPending.map((r) => {
                    const isConflict = r.sync_state === 'conflict'
                    return (
                      <li
                        key={r.id}
                        className={`flex items-start justify-between gap-3 py-1.5 ${
                          isConflict
                            ? 'cursor-pointer rounded hover:bg-rose-50/60'
                            : ''
                        }`}
                        onClick={
                          isConflict
                            ? () => setConflictFor(r)
                            : undefined
                        }
                        role={isConflict ? 'button' : undefined}
                        title={
                          isConflict
                            ? 'Kattints a konfliktus feloldásához (új sorszám vagy törlés)'
                            : undefined
                        }
                      >
                        <div>
                          <p className="text-sm font-medium text-amber-900">
                            {r.sorozat} / {r.szam}
                            <span className="ml-2 text-xs font-normal text-amber-700">
                              {r.szamla_datum} · {r.osszeg_brut.toLocaleString('hu')} RON
                            </span>
                            {isConflict && (
                              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-800">
                                Konfliktus — kattints a feloldáshoz
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-amber-800">
                            {r.klienesseg_nev}
                            {r.reprezentand ? ` · ${r.reprezentand}` : ''}
                          </p>
                          {r.sync_error && (
                            <p className="mt-0.5 text-[11px] text-rose-700">
                              {r.sync_error}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                          offline
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`flex items-start justify-between gap-3 py-2 ${
                  r.stornozott ? 'opacity-60' : ''
                }`}
              >
                <div className={r.stornozott ? 'line-through' : ''}>
                  <p className="text-sm font-medium">
                    {r.sorozat} / {r.szam}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {r.szamla_datum} · {r.osszeg_brut.toLocaleString('hu')} RON
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.klienesseg_nev}
                    {r.reprezentand ? ` · ${r.reprezentand}` : ''}
                  </p>
                  {r.stornozott && r.stornozott_indok && (
                    <p className="mt-0.5 text-[11px] text-rose-700">
                      Sztornózva: {r.stornozott_indok}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPrintFor(r.id)}
                    title="Nyomtatás / PDF"
                  >
                    <Printer className="mr-1.5 size-3.5" />
                    Nyomtatás
                  </Button>
                  {!r.stornozott && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStornoFor(r)
                        setStornoIndok('')
                        setStornoError(null)
                      }}
                    >
                      <Ban className="mr-1.5 size-3.5" />
                      Sztornó
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
            )}
          </>
        )}

        {/* Nyomtatási dialog (A-M7.2f) */}
        {printFor && (
          <ChitantaPrintDialog
            chitantaId={printFor}
            congregationId={congregationId}
            onClose={() => setPrintFor(null)}
          />
        )}

        {/* Sztornó inline dialog */}
        {stornoFor && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900">
            <p className="font-semibold">
              Biztosan sztornózod a {stornoFor.sorozat} / {stornoFor.szam} chitantát?
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Átvevő: {stornoFor.klienesseg_nev} · {stornoFor.osszeg_brut.toLocaleString('hu')} RON ·{' '}
              {stornoFor.szamla_datum}
            </p>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="storno-indok" className="text-xs">
                Indoklás (legalább 5 karakter) *
              </Label>
              <Input
                id="storno-indok"
                maxLength={500}
                value={stornoIndok}
                onChange={(e) => setStornoIndok(e.currentTarget.value)}
                disabled={stornoSubmitting}
                placeholder="Pl. A kliens adatok tévesen lettek rögzítve."
              />
            </div>
            {stornoError && (
              <p className="mt-2 text-xs text-rose-700">
                <AlertCircle className="mr-1 inline-block size-3.5" />
                {stornoError}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStornoFor(null)
                  setStornoIndok('')
                  setStornoError(null)
                }}
                disabled={stornoSubmitting}
              >
                Mégse
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleStornoSubmit}
                disabled={stornoSubmitting}
              >
                {stornoSubmitting ? 'Sztornózás…' : 'Sztornó jóváhagyása'}
              </Button>
            </div>
          </div>
        )}

        {/* Konfliktus-feloldó modal (A-M7.2d2d) */}
        {conflictFor && (
          <ChitantaConflictDialog
            localId={conflictFor.id}
            congregationId={congregationId}
            chitanta={{
              sorozat: conflictFor.sorozat,
              szam: conflictFor.szam,
              szamla_datum: conflictFor.szamla_datum,
              klienesseg_nev: conflictFor.klienesseg_nev,
              osszeg_brut: conflictFor.osszeg_brut,
              sync_error: conflictFor.sync_error,
            }}
            onClose={() => setConflictFor(null)}
            onResolved={() => void loadRecent()}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Offline warning panel — tudatosan kiemelt a UX miatt
// ─────────────────────────────────────────────────────────────────────────

function OfflineWarning({ walletAvailable }: { walletAvailable: number }) {
  if (walletAvailable > 0) {
    // Van előre-foglalt szám — a kiállítás offline is megy
    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50/80 p-3 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-semibold">Offline munkamenet — a tárcából állítunk ki.</p>
            <p className="mt-1 text-blue-800">
              Nincs internet-kapcsolat, de az offline szám-tárcában van{' '}
              <span className="font-semibold">{walletAvailable}</span> szabad sorszám.
              A kiállított chitanțák a lokális adatbázisba kerülnek, és amint a gép
              újra online lesz, automatikusan feltöltődnek a szerverre.
            </p>
          </div>
        </div>
      </div>
    )
  }
  // Üres a wallet — klasszikus kritikus offline-figyelmeztetés
  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50/80 p-3 text-sm text-orange-900">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-orange-600" />
        <div>
          <p className="font-semibold">Offline munkamenet — chitanță-kiállítás szünetel.</p>
          <p className="mt-1 text-orange-800">
            Nincs internet-kapcsolat, és az offline szám-tárca üres. Csatlakozz
            a hálózatra, vagy a tárca feltöltése után (az „Offline szám-tárca"
            panel +10 szám gombjával) offline is tudsz kiállítani.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Issue form (inline kártya) — 9 mezős űrlap
// ─────────────────────────────────────────────────────────────────────────

function IssueChitantaForm({
  congregationId,
  userId,
  canIssue,
  isOnline,
  walletAvailable,
  disabledReason,
  onSuccess,
}: {
  congregationId: string
  userId: string
  canIssue: boolean
  isOnline: boolean
  walletAvailable: number
  disabledReason: string | null
  onSuccess: (res: {
    chitantaId: string
    sorozat: string
    szam: number
    klienesseg_nev: string
    osszeg: number
    pending: boolean
  }) => void
}) {
  const [sorozat, setSorozat] = useState('')
  const [szamlaDatum, setSzamlaDatum] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [klienessegNev, setKlienessegNev] = useState('')
  const [klienessegCim, setKlienessegCim] = useState('')
  const [klienessegCui, setKlienessegCui] = useState('')
  const [osszegBrut, setOsszegBrut] = useState('')
  const [reprezentand, setReprezentand] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offlineError, setOfflineError] = useState(false)
  const [duplicateError, setDuplicateError] = useState(false)
  const [walletEmptyError, setWalletEmptyError] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOfflineError(false)
    setDuplicateError(false)
    setWalletEmptyError(false)

    const osszegNum = Number.parseFloat(osszegBrut)
    if (!Number.isFinite(osszegNum) || osszegNum <= 0) {
      setError('Az összeg pozitív szám legyen.')
      return
    }

    setSubmitting(true)
    try {
      const supabase = getDesktopSupabase()
      // A-M7.2d2b — az offline-ág engedélyezése: ha `!isOnline`, átadjuk az
      // offlineBackend-et is a use-case ctx-be, így a core wallet-ből fog
      // sorszámot meríteni + lokálisan ment + outbox-ba tesz.
      const result: IssueChitantaResult = await issueChitantaUseCase(
        {
          congregationId,
          sorozat: sorozat.trim() || undefined,
          szamlaDatum,
          klienesseg_nev: klienessegNev.trim(),
          klienesseg_cim: klienessegCim.trim() || null,
          klienesseg_cui: klienessegCui.trim() || null,
          osszeg_brut: osszegNum,
          reprezentand: reprezentand.trim() || null,
          megjegyzes: megjegyzes.trim() || null,
        },
        {
          supabase,
          runtime: 'desktop',
          userId,
          isOnline,
          offlineBackend: isOnline ? undefined : getTauriSqliteBackend(),
        },
      )

      if (result.success) {
        onSuccess({
          chitantaId: result.chitantaId,
          sorozat: result.sorozat,
          szam: result.szam,
          klienesseg_nev: klienessegNev.trim(),
          osszeg: osszegNum,
          pending: result.pending === true,
        })
        return
      }

      if (result.offlineNotSupported) {
        setOfflineError(true)
        setError(result.error)
      } else if (result.walletEmpty) {
        setWalletEmptyError(true)
        setError(result.error)
      } else if (result.duplicateNumber) {
        setDuplicateError(true)
        setError(result.error)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const formDisabled = !canIssue || submitting

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Új chitanță</CardTitle>
        <CardDescription className="text-xs">
          A szerver automatikusan kiosztja a következő sorszámot, ha nem adsz
          meg kézzel. Az átvevő nevét, az összeget és a dátumot mindig töltsd ki.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {disabledReason && !submitting && (
          <div
            role="status"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {disabledReason}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cs-datum">Kiállítás dátuma *</Label>
              <Input
                id="cs-datum"
                type="date"
                required
                value={szamlaDatum}
                onChange={(e) => setSzamlaDatum(e.currentTarget.value)}
                disabled={formDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-sorozat">Sorozat (opcionális)</Label>
              <Input
                id="cs-sorozat"
                value={sorozat}
                onChange={(e) => setSorozat(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. EREKC24"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-nev">Átvevő (befizető) neve *</Label>
            <Input
              id="cs-nev"
              required
              maxLength={200}
              value={klienessegNev}
              onChange={(e) => setKlienessegNev(e.currentTarget.value)}
              disabled={formDisabled}
              placeholder="pl. Kovács János"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cs-cim">Lakcím (opcionális)</Label>
              <Input
                id="cs-cim"
                maxLength={200}
                value={klienessegCim}
                onChange={(e) => setKlienessegCim(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. Brates"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-cui">CUI / adószám (céges)</Label>
              <Input
                id="cs-cui"
                maxLength={32}
                value={klienessegCui}
                onChange={(e) => setKlienessegCui(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="Üresen hagyd magánszemélynél"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-osszeg">Bruttó összeg (RON) *</Label>
            <Input
              id="cs-osszeg"
              type="number"
              min={0.01}
              step={0.01}
              required
              value={osszegBrut}
              onChange={(e) => setOsszegBrut(e.currentTarget.value)}
              disabled={formDisabled}
              placeholder="pl. 100"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-reprez">Címén (reprezentând — opcionális)</Label>
            <Input
              id="cs-reprez"
              maxLength={300}
              value={reprezentand}
              onChange={(e) => setReprezentand(e.currentTarget.value)}
              disabled={formDisabled}
              placeholder="pl. Egyházfenntartó járulék 2024-2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cs-megjegy">Belső megjegyzés (opcionális)</Label>
            <Input
              id="cs-megjegy"
              maxLength={500}
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              disabled={formDisabled}
            />
          </div>

          {/* Offline-mód tájékoztató a form alján — ha van szám a walletben
              és a gép offline, a user tudja, hogy mi fog történni. */}
          {!isOnline && walletAvailable > 0 && !error && (
            <div className="rounded-md border border-blue-300 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
              <WifiOff className="mr-1.5 inline-block size-3.5" />
              Offline mód: a sorszám automatikusan a szám-tárcából kerül ki, a
              chitanță a lokális adatbázisba mentődik, és a szinkronizáció
              internet-visszatértkor automatikusan fut.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className={`rounded-md border px-3 py-2 text-sm ${
                offlineError || walletEmptyError
                  ? 'border-orange-300 bg-orange-50 text-orange-900'
                  : duplicateError
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
              }`}
            >
              <AlertCircle className="mr-1.5 inline-block size-4" />
              {error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={formDisabled}>
              {submitting
                ? isOnline
                  ? 'Kiállítás…'
                  : 'Offline mentés…'
                : isOnline
                  ? 'Chitanță kiállítása'
                  : 'Chitanță kiállítása offline'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
