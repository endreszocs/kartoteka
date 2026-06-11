/**
 * Kiadás (expense) oldal — `/penzugy/kiadas` route.
 *
 * A-M7.4d (2026-04-24) — a befizetés-page.tsx tükörképe a kiadás-körre:
 *   - Év-szűrő (aktuális + elmúlt 5 év)
 *   - Új kiadás form (kategória + összeg + átvevő: tag vagy szöveg + CUI + időszak)
 *   - Lista szekció (50 legfrissebb, szűrőkkel, összesítővel, exporttal)
 *   - Sztornó inline panel (belső-mozgás pár cascade-visszajelzéssel)
 *   - Online-only (az offline az A-M7.4e-ben jön)
 *
 * A befizetés-mintához képest kiadás-specifikus:
 *   - Átvevő lehet tag (atvevoid) VAGY szöveg (atvevo) — legalább egyik kötelező
 *   - CUI-mező (cég esetén, TVA-követelmény)
 *   - „Vonatkozó időszak" (pl. „2026 01") — pl. fűtés, bérlet
 *   - NINCS család, NINCS fizetettev
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  Ban,
  Banknote,
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  Trash2,
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
  getNextReceiptNumberForExpenseUseCase,
  listExpenseUseCase,
  listKiadasCelekUseCase,
  saveExpenseUseCase,
  searchMembersForFinanceUseCase,
  softDeleteExpenseUseCase,
  stornoExpenseUseCase,
  type ListExpenseResult,
  type SaveExpenseResultOrError,
  type SoftDeleteExpenseResult,
  type StornoExpenseResult,
} from '@kartoteka/core'
import {
  type KiadasCelRow,
  type KiadasListRow,
  type MemberSearchResult,
} from '@kartoteka/validations'

import { IratszamWalletPanel } from '../components/iratszam-wallet-panel'
import { PageHero, GYULEKEZETI_KONYVELHETO_KOD_RE } from '@kartoteka/ui-app'
import { WriteSyncConflictDialog } from '../components/write-sync-conflict-dialog'
import {
  buildKiadasCsv,
  buildKiadasCsvFilename,
  downloadKiadasCsv,
} from '../lib/export/kiadas-csv'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { runKiadasSyncManually } from '../lib/kiadas-write-sync'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { useSessionOnline } from '../lib/use-session-online'
import { getLocalOwnProfile } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

// ─────────────────────────────────────────────────────────────────────────
// Fő oldal-komponens
// ─────────────────────────────────────────────────────────────────────────

export function KiadasPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [year, setYear] = useState<number>(() => new Date().getFullYear())

  const [celek, setCelek] = useState<KiadasCelRow[]>([])
  const [celekError, setCelekError] = useState<string | null>(null)

  // 2026-06-11: session-tudatos online-allapot (PIN-modban offline ag!)
  const isOnline = useSessionOnline()
  // Auth + congregation_id
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

  // Kategóriák betöltése
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const result = await listKiadasCelekUseCase(
          { onlyActive: true },
          { supabase, runtime: 'desktop' },
        )
        if (result.success) {
          // 2026-06-11 (Endre): csak a hivatalos LEVÉL-kategóriák könyvelhetők —
          // az aggregát kategóriafejek ("(5+...+12)") és a belső-mozgás kódok
          // itt nem választhatók (utóbbiak a Belső mozgás oldalon élnek).
          setCelek(
            result.rows.filter((r) =>
              GYULEKEZETI_KONYVELHETO_KOD_RE.test(r.id_szamadasicel ?? ''),
            ),
          )
        } else {
          setCelekError(result.error)
        }
      } catch (err) {
        setCelekError(`Kategóriák betöltési hiba: ${errorMessage(err)}`)
      }
    })()
  }, [])

  const [refreshKey, setRefreshKey] = useState<number>(0)

  // ── A-M7.9b — Iratszám-tárca állapot (kiadás form engedélyezéséhez offline-módban) ──
  const [walletAvailable, setWalletAvailable] = useState<number>(0)

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Kiadás"
          title="Kiadás rögzítése"
          description="A gyülekezet kiadásainak rögzítése, kategóriák szerinti listázás. Tag vagy külső átvevő (cég, kereskedő) is megadható."
          Icon={Banknote}
          actions={
            <>
              <Label htmlFor="year-select" className="text-xs text-slate-500">
                Év:
              </Label>
              <select
                id="year-select"
                className="rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                value={year}
                onChange={(e) => setYear(Number(e.currentTarget.value))}
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          }
        />

        {/* A-M7.9b — Iratszám-tárca panel (Készpénz offline-rögzítéséhez) */}
        {user && congregationId && (
          <IratszamWalletPanel
            congregationId={congregationId}
            tipus="kiadas"
            ev={year}
            isOnline={isOnline}
            onStatusChange={setWalletAvailable}
          />
        )}

        {/* Offline figyelmeztető — wallet-érzékeny */}
        {!isOnline && (
          <KiadasOfflineWarning walletAvailable={walletAvailable} />
        )}

        {celekError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {celekError}
          </div>
        )}

        {user && congregationId && celek.length > 0 && (
          <ExpenseForm
            userId={user.id}
            congregationId={congregationId}
            celek={celek}
            isOnline={isOnline}
            walletAvailable={walletAvailable}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {user && congregationId && (
          <RecentExpenseSection
            userId={user.id}
            congregationId={congregationId}
            year={year}
            refreshKey={refreshKey}
            celek={celek}
          />
        )}
      </div>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Offline figyelmeztetés (A-M7.9b) — wallet-érzékeny
// ─────────────────────────────────────────────────────────────────────────

function KiadasOfflineWarning({ walletAvailable }: { walletAvailable: number }) {
  if (walletAvailable > 0) {
    return (
      <div className="rounded-lg border border-sky-300 bg-sky-50/80 p-3 text-sm text-sky-900">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div>
            <p className="font-semibold">Offline munkamenet — Készpénzes kiadás rögzíthető.</p>
            <p className="mt-1 text-sky-800">
              <span className="font-semibold">{walletAvailable}</span> szabad sorszám a tárcában.
              A rögzített tételek a hálózatra csatlakozáskor automatikusan szinkronizálódnak.
              Banki kifizetések online-módban rögzíthetők.
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50/80 p-3 text-sm text-orange-900">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-orange-600" />
        <div>
          <p className="font-semibold">Offline munkamenet — kiadás rögzítése szünetel.</p>
          <p className="mt-1 text-orange-800">
            Üres az iratszám-tárca. Csatlakozz a hálózatra, tölts fel legalább egy sorszámot
            (Iratszám-tárca panel → +10 szám), és utána offline-ban is tudsz Készpénzes
            kiadást rögzíteni.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Új kiadás rögzítő form
// ─────────────────────────────────────────────────────────────────────────

type IrattipusOption = 'Készpénz' | 'Banki'

function ExpenseForm({
  userId,
  congregationId,
  celek,
  isOnline,
  walletAvailable,
  onSaved,
}: {
  userId: string
  congregationId: string
  celek: KiadasCelRow[]
  isOnline: boolean
  walletAvailable: number
  onSaved: () => void
}) {
  const [datum, setDatum] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [osszeg, setOsszeg] = useState('')
  const [irattipus, setIrattipus] = useState<IrattipusOption>('Készpénz')
  const [iratszam, setIratszam] = useState('')
  const [celId, setCelId] = useState<number | null>(null)
  const [megjegyzes, setMegjegyzes] = useState('')
  const [kedvezmenyezettCui, setKedvezmenyezettCui] = useState('')
  const [vonatkozoIdoszak, setVonatkozoIdoszak] = useState('')

  // Átvevő: tag vagy szöveg (exkluzív)
  const [atvevoMode, setAtvevoMode] = useState<'tag' | 'szoveges'>('szoveges')
  const [atvevoSzoveg, setAtvevoSzoveg] = useState('')

  // Tag-kereső
  const [tagQuery, setTagQuery] = useState('')
  const [tagHits, setTagHits] = useState<MemberSearchResult[]>([])
  const [tagSearching, setTagSearching] = useState(false)
  const [selectedTag, setSelectedTag] = useState<MemberSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<string | null>(null)

  // Auto-load next iratszám
  useEffect(() => {
    if (!isOnline || irattipus !== 'Készpénz' || iratszam.trim() !== '') return
    let cancelled = false
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const profile = await getLocalOwnProfile(userId)
        const congregationId = profile?.congregation_id
        if (!congregationId) return
        const res = await getNextReceiptNumberForExpenseUseCase(
          { congregationId, year: new Date(datum).getFullYear() },
          { supabase, runtime: 'desktop' },
        )
        if (!cancelled && res.success) {
          setIratszam(String(res.nextNumber))
        }
      } catch {
        /* csendes */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irattipus, datum, isOnline])

  // Tag-kereső debounce
  useEffect(() => {
    if (atvevoMode !== 'tag') return
    if (selectedTag) return
    if (tagQuery.trim().length < 2) {
      setTagHits([])
      setSearchError(null)
      return
    }
    const timer = setTimeout(async () => {
      setTagSearching(true)
      setSearchError(null)
      try {
        const supabase = getDesktopSupabase()
        const profile = await getLocalOwnProfile(userId)
        const congregationId = profile?.congregation_id
        if (!congregationId) {
          setSearchError('Nincs gyülekezet-hozzáférés.')
          return
        }
        const res = await searchMembersForFinanceUseCase(
          { congregationId, query: tagQuery.trim(), limit: 8 },
          { supabase, runtime: 'desktop' },
        )
        if (res.success) setTagHits(res.members)
        else setSearchError(res.error)
      } catch (err) {
        setSearchError(`Keresési hiba: ${errorMessage(err)}`)
      } finally {
        setTagSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tagQuery, userId, selectedTag, atvevoMode])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccessInfo(null)

    const osszegNum = Number.parseFloat(osszeg)
    if (!Number.isFinite(osszegNum) || osszegNum <= 0) {
      setError('Az összeg pozitív szám legyen.')
      return
    }
    if (celId === null) {
      setError('Válassz kategóriát.')
      return
    }

    const hasTag = atvevoMode === 'tag' && selectedTag !== null
    const hasSzoveg = atvevoMode === 'szoveges' && atvevoSzoveg.trim().length > 0
    if (!hasTag && !hasSzoveg) {
      setError(
        atvevoMode === 'tag'
          ? 'Válassz átvevő tagot a listából.'
          : 'Add meg az átvevő nevét (pl. cégnév, beszállító).',
      )
      return
    }

    setSubmitting(true)
    try {
      const supabase = getDesktopSupabase()

      // A-M7.9b — offline-ág: ha nincs hálózat, a wallet-ből veszünk iratszámot
      // és a `kiadas_pending_local`-ba mentünk, outbox-on át sync-re vár.
      const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()

      const result: SaveExpenseResultOrError = await saveExpenseUseCase(
        {
          congregationId,
          osszeg: osszegNum,
          datum,
          id_kiadascel: celId,
          atvevoid: hasTag ? selectedTag!.id : null,
          atvevo: hasSzoveg ? atvevoSzoveg.trim() : null,
          kedvezmenyezett_cui: kedvezmenyezettCui.trim() || null,
          vonatkozo_idoszak: vonatkozoIdoszak.trim() || null,
          iratszam: isOnline ? (iratszam.trim() || null) : null,
          irattipus,
          megjegyzes: megjegyzes.trim() || null,
        },
        {
          supabase,
          runtime: 'desktop',
          userId,
          isOnline,
          offlineBackend,
        },
      )

      if (!result.success) {
        if (result.duplicateReceipt) {
          setError(`${result.error} (tipp: frissítsd az iratszámot)`)
        } else if (result.walletEmpty) {
          setError(
            `${result.error} (a panel +10 gombjával tölts fel sorszámokat, online-mód alatt)`,
          )
        } else {
          setError(result.error)
        }
        return
      }

      // E3: online mentés sikerkor a hivatalos Excelbe is (várólistán át).
      if (!result.pending && result.data.id > 0) {
        void enqueueEntryExcelRow({
          type: 'kiadas',
          serverId: result.data.id,
          congregationId,
          datum,
          iratszam: result.data.iratszam,
          irattipus,
          nev: hasSzoveg
            ? atvevoSzoveg.trim()
            : selectedTag
              ? `${selectedTag.csaladnev ?? ''} ${selectedTag.k_nev ?? ''}`.trim()
              : '',
          osszeg: osszegNum,
          celId,
          megjegyzes: megjegyzes.trim() || null,
        })
      }

      const pendingNote = result.pending
        ? ' · Szinkronizálásra vár, a hálózatra csatlakozáskor felmegy.'
        : ''
      setSuccessInfo(
        `Kiadás rögzítve (iratszám: ${result.data.iratszam}, összeg: ${osszegNum.toLocaleString('hu')} RON).${pendingNote}`,
      )
      // Form-reset
      setOsszeg('')
      setIratszam('')
      setMegjegyzes('')
      setKedvezmenyezettCui('')
      setVonatkozoIdoszak('')
      setAtvevoSzoveg('')
      setTagQuery('')
      setSelectedTag(null)
      setTagHits([])
      setTimeout(() => setSuccessInfo(null), 6000)
      onSaved()
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // A-M7.9b — formDisabled finomítva (a befizetés mintára)
  const isCashOffline = !isOnline && irattipus === 'Készpénz' && walletAvailable > 0
  const formDisabled = (!isOnline && !isCashOffline) || submitting

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Új kiadás rögzítése</CardTitle>
        <CardDescription className="text-xs">
          Készpénzes vagy banki kiadás rögzítése. Átvevő lehet tag (pl. lelkész, gondnok)
          vagy külső szereplő (cég, kereskedő).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Dátum + kategória */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="k-datum">Kiadás dátuma *</Label>
              <Input
                id="k-datum"
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.currentTarget.value)}
                disabled={formDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-cel">Kategória *</Label>
              <select
                id="k-cel"
                required
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={celId ?? ''}
                onChange={(e) => setCelId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
                disabled={formDisabled}
              >
                <option value="">— Válassz —</option>
                {celek.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nev}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Átvevő mód-toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm">Átvevő *</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAtvevoMode('szoveges')}
                disabled={formDisabled}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  atvevoMode === 'szoveges'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                Külső (cég, magánszemély)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAtvevoMode('tag')
                  setAtvevoSzoveg('')
                }}
                disabled={formDisabled}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  atvevoMode === 'tag'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                Gyülekezeti tag
              </button>
            </div>
          </div>

          {atvevoMode === 'tag' ? (
            <div className="space-y-1.5">
              {selectedTag ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="font-medium">
                      {selectedTag.csaladnev} {selectedTag.k_nev}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedTag(null)
                      setTagQuery('')
                    }}
                    disabled={formDisabled}
                  >
                    Törlés
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.currentTarget.value)}
                      disabled={formDisabled}
                      placeholder="Kezdj el gépelni (pl. Kovács János)…"
                      className="pl-8"
                    />
                  </div>
                  {tagSearching && <p className="text-xs italic text-muted-foreground">Keresés…</p>}
                  {searchError && (
                    <p className="text-xs text-rose-700">
                      <AlertCircle className="mr-1 inline-block size-3.5" />
                      {searchError}
                    </p>
                  )}
                  {tagHits.length > 0 && (
                    <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white text-sm shadow-sm">
                      {tagHits.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTag(m)
                              setTagQuery('')
                              setTagHits([])
                            }}
                            className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                          >
                            <span className="font-medium">
                              {m.csaladnev} {m.k_nev}
                            </span>
                            {m.sz_datum && (
                              <span className="text-xs text-muted-foreground">
                                sz. {m.sz_datum.slice(0, 10)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="k-atvevo">Átvevő neve *</Label>
                <Input
                  id="k-atvevo"
                  maxLength={200}
                  value={atvevoSzoveg}
                  onChange={(e) => setAtvevoSzoveg(e.currentTarget.value)}
                  disabled={formDisabled}
                  placeholder="pl. Electrica SA"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="k-cui">CUI / adószám (opcionális)</Label>
                <Input
                  id="k-cui"
                  maxLength={32}
                  value={kedvezmenyezettCui}
                  onChange={(e) => setKedvezmenyezettCui(e.currentTarget.value)}
                  disabled={formDisabled}
                  placeholder="pl. RO12345678"
                />
              </div>
            </div>
          )}

          {/* Összeg + típus + iratszám */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-osszeg">Összeg (RON) *</Label>
              <Input
                id="k-osszeg"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={osszeg}
                onChange={(e) => setOsszeg(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. 500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-tipus">Típus *</Label>
              <select
                id="k-tipus"
                required
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={irattipus}
                onChange={(e) => setIrattipus(e.currentTarget.value as IrattipusOption)}
                disabled={formDisabled}
              >
                <option value="Készpénz">Készpénz</option>
                <option value="Banki">Banki átutalás</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-iratszam">Iratszám</Label>
              <Input
                id="k-iratszam"
                value={iratszam}
                onChange={(e) => setIratszam(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="Automatikus…"
              />
            </div>
          </div>

          {/* Vonatkozó időszak + megjegyzés */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="k-idoszak">Vonatkozó időszak (opcionális)</Label>
              <Input
                id="k-idoszak"
                maxLength={50}
                value={vonatkozoIdoszak}
                onChange={(e) => setVonatkozoIdoszak(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. 2026 01 (januári villany)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-megjegy">Belső megjegyzés (opcionális)</Label>
              <Input
                id="k-megjegy"
                maxLength={500}
                value={megjegyzes}
                onChange={(e) => setMegjegyzes(e.currentTarget.value)}
                disabled={formDisabled}
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mr-1.5 inline-block size-4" />
              {error}
            </div>
          )}
          {successInfo && (
            <div
              role="status"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              <CheckCircle2 className="mr-1.5 inline-block size-4" />
              {successInfo}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={formDisabled}>
              {submitting ? 'Rögzítés…' : 'Kiadás rögzítése'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lista szekció
// ─────────────────────────────────────────────────────────────────────────

interface PendingKiadasRow {
  id: string
  iratszam: string
  datum: string
  osszeg: number
  id_kiadascel: number
  atvevoid: number | null
  atvevo: string | null
  vonatkozo_idoszak: string | null
  kedvezmenyezett_cui: string | null
  megjegyzes: string | null
  ev: number
  sync_state: 'pending' | 'conflict'
  sync_error: string | null
  created_at: string
}

function RecentExpenseSection({
  userId,
  congregationId,
  year,
  refreshKey,
  celek,
}: {
  userId: string
  congregationId: string
  year: number
  refreshKey: number
  celek: KiadasCelRow[]
}) {
  const [rows, setRows] = useState<KiadasListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Szűrők
  const [filterCelId, setFilterCelId] = useState<number | null>(null)

  // Sztornó
  const [stornoFor, setStornoFor] = useState<KiadasListRow | null>(null)
  const [stornoIndok, setStornoIndok] = useState('')
  const [stornoSubmitting, setStornoSubmitting] = useState(false)
  const [stornoError, setStornoError] = useState<string | null>(null)
  const [stornoSuccessMsg, setStornoSuccessMsg] = useState<string | null>(null)

  const [deleteSubmitting, setDeleteSubmitting] = useState<number | null>(null)

  // A-M7.9b — pending lokál sorok (offline-rögzített, sync-re vár / conflict)
  const [pendingRows, setPendingRows] = useState<PendingKiadasRow[]>([])
  const [syncBusy, setSyncBusy] = useState(false)

  // A-M7.9c — conflict-feloldó dialog
  const [conflictRow, setConflictRow] = useState<PendingKiadasRow | null>(null)

  const celNevById = new Map(celek.map((c) => [c.id, c.nev]))

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getDesktopSupabase()
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) {
        setError('Nincs aktív gyülekezet-hozzáférés.')
        return
      }
      const result: ListExpenseResult = await listExpenseUseCase(
        {
          congregationId,
          year,
          kiadasceId: filterCelId,
          orderBy: 'datum-desc',
          limit: 500,
          includeDeleted: false,
          includeStornozott: true,
        },
        { supabase, runtime: 'desktop' },
      )
      if (result.success) {
        setRows(result.rows)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(`Lista-hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [userId, year, filterCelId])

  useEffect(() => {
    void loadList()
  }, [loadList, refreshKey])

  // A-M7.9b — pending lokál sorok lekérdezése (offline-rögzített)
  const loadPending = useCallback(async () => {
    try {
      const list = await getTauriSqliteBackend().listLocalPendingKiadas(
        congregationId,
        year,
      )
      setPendingRows(list)
    } catch {
      /* csendes — a pending-blokk hiba esetén üresen marad */
    }
  }, [congregationId, year])

  useEffect(() => {
    void loadPending()
  }, [loadPending, refreshKey])

  async function handleSyncNow() {
    setSyncBusy(true)
    try {
      await runKiadasSyncManually()
      await Promise.all([loadList(), loadPending()])
    } catch {
      /* csendes — a sync-fn maga is csak result-ban dob */
    } finally {
      setSyncBusy(false)
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
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) {
        setStornoError('Nincs aktív gyülekezet.')
        return
      }
      const result: StornoExpenseResult = await stornoExpenseUseCase(
        {
          congregationId,
          kiadasId: stornoFor.id,
          indok: stornoIndok.trim(),
        },
        { supabase, runtime: 'desktop', userId },
      )
      if (!result.success) {
        setStornoError(result.error)
        return
      }
      setStornoSuccessMsg(
        result.cascadedInternalTransfer
          ? 'Kiadás sztornózva. A belső kassza↔bank transfer párja is sztornózva.'
          : 'Kiadás sztornózva.',
      )
      setStornoFor(null)
      setStornoIndok('')
      void loadList()
      setTimeout(() => setStornoSuccessMsg(null), 6000)
    } catch (err) {
      setStornoError(`Sztornó-hiba: ${errorMessage(err)}`)
    } finally {
      setStornoSubmitting(false)
    }
  }

  async function handleDelete(row: KiadasListRow) {
    if (
      !window.confirm(
        `Biztosan törlöd a ${row.iratszam} sz. kiadást (${row.osszeg.toLocaleString('hu')} RON)? Visszaállítható.`,
      )
    ) {
      return
    }
    setDeleteSubmitting(row.id)
    try {
      const supabase = getDesktopSupabase()
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) return
      const result: SoftDeleteExpenseResult = await softDeleteExpenseUseCase(
        { congregationId, kiadasId: row.id },
        { supabase, runtime: 'desktop' },
      )
      if (!result.success) {
        alert(`Törlés sikertelen: ${result.error}`)
        return
      }
      void loadList()
    } catch (err) {
      alert(`Törlési hiba: ${errorMessage(err)}`)
    } finally {
      setDeleteSubmitting(null)
    }
  }

  const filtersActive = filterCelId !== null
  const activeRows = rows.filter((r) => !r.stornozott && !r.deleted)
  const totalOsszeg = activeRows.reduce((sum, r) => sum + (r.osszeg || 0), 0)

  return (
    <div className="space-y-4">
      {/* A-M7.9b — Pending lokál sorok (offline-rögzített, sync-re vár / conflict) */}
      {pendingRows.length > 0 && (
        <PendingExpenseBlock
          rows={pendingRows}
          celNevById={celNevById}
          syncBusy={syncBusy}
          onSyncNow={() => void handleSyncNow()}
          onConflictClick={(row) => setConflictRow(row)}
        />
      )}

      {/* A-M7.9c — Konfliktus-feloldó dialog */}
      {conflictRow && (
        <WriteSyncConflictDialog
          entity="kiadas"
          localId={conflictRow.id}
          congregationId={congregationId}
          ev={conflictRow.ev}
          display={{
            iratszam: conflictRow.iratszam,
            datum: conflictRow.datum,
            osszeg: conflictRow.osszeg,
            label:
              conflictRow.atvevo ||
              celNevById.get(conflictRow.id_kiadascel) ||
              null,
            sync_error: conflictRow.sync_error,
          }}
          onClose={() => setConflictRow(null)}
          onResolved={() => {
            setConflictRow(null)
            void loadList()
            void loadPending()
          }}
        />
      )}

      {/* Összesítő */}
      {activeRows.length > 0 && (
        <Card className="border-rose-100 bg-rose-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-rose-900">
              {filtersActive ? 'Szűrt összesítő' : `${year}. évi összes kiadás`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                  Összes kiadás
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold text-rose-900">
                  {totalOsszeg.toLocaleString('hu')}{' '}
                  <span className="text-sm font-normal">RON</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                  Darabszám
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold text-rose-900">
                  {activeRows.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Kiadások ({year})</CardTitle>
              <CardDescription className="text-xs">
                A {year}. évhez tartozó maximum 500 kiadás. A sztornózott sorok áthúzottan látszanak.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const csv = buildKiadasCsv(rows)
                  const filename = buildKiadasCsvFilename(year, filtersActive)
                  downloadKiadasCsv(csv, filename)
                }}
                disabled={loading || rows.length === 0}
                title="CSV export (Excel-kompatibilis)"
              >
                <Download className="mr-1.5 size-4" />
                Excel export
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadList()}
                disabled={loading}
              >
                <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
                Frissítés
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Szűrő */}
          <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="filter-cel" className="text-xs">
                Kategória:
              </Label>
              <select
                id="filter-cel"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={filterCelId ?? ''}
                onChange={(e) =>
                  setFilterCelId(e.currentTarget.value ? Number(e.currentTarget.value) : null)
                }
              >
                <option value="">Mind</option>
                {celek.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nev}
                  </option>
                ))}
              </select>
              {filtersActive && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilterCelId(null)}
                  className="h-7 text-xs"
                >
                  Szűrő törlése
                </Button>
              )}
            </div>
          </div>

          {stornoSuccessMsg && (
            <div
              role="status"
              className="rounded-md border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-800"
            >
              <CheckCircle2 className="mr-1.5 inline-block size-4" />
              {stornoSuccessMsg}
            </div>
          )}

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
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nincs rögzített kiadás {year}. évre.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const celNev =
                  r.kiadascel_nev ||
                  celNevById.get(r.id_kiadascel) ||
                  `Kategória #${r.id_kiadascel}`
                const atvevoDisplay = r.atvevo_nev || r.atvevo || '(nincs átvevő)'
                return (
                  <li
                    key={r.id}
                    className={`flex items-start justify-between gap-3 py-2 ${r.stornozott ? 'opacity-60' : ''}`}
                  >
                    <div className={r.stornozott ? 'line-through' : ''}>
                      <p className="text-sm font-medium">
                        {r.iratszam}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {r.datum.slice(0, 10)} · {r.osszeg.toLocaleString('hu')} RON · {r.irattipus}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {celNev} · {atvevoDisplay}
                        {r.vonatkozo_idoszak && ` · ${r.vonatkozo_idoszak}`}
                      </p>
                      {r.stornozott && r.stornozott_indok && (
                        <p className="mt-0.5 text-[11px] text-rose-700">
                          Sztornózva: {r.stornozott_indok}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {!r.stornozott && (
                        <>
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDelete(r)}
                            disabled={deleteSubmitting === r.id}
                            className="border-rose-200 text-rose-800 hover:bg-rose-50"
                          >
                            <Trash2 className="mr-1.5 size-3.5" />
                            {deleteSubmitting === r.id ? 'Törlés…' : 'Törlés'}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Inline sztornó */}
          {stornoFor && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Biztosan sztornózod a {stornoFor.iratszam} kiadást?
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Összeg: {stornoFor.osszeg.toLocaleString('hu')} RON · Dátum:{' '}
                {stornoFor.datum.slice(0, 10)}
              </p>
              <p className="mt-1 text-xs italic text-amber-800">
                Ha belső mozgás (kassza↔bank) része, a párja is sztornózva lesz.
              </p>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="k-storno-indok" className="text-xs">
                  Indoklás (legalább 5 karakter) *
                </Label>
                <Input
                  id="k-storno-indok"
                  maxLength={500}
                  value={stornoIndok}
                  onChange={(e) => setStornoIndok(e.currentTarget.value)}
                  disabled={stornoSubmitting}
                  placeholder="Pl. Rossz kategóriába került, újrarögzítem."
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
                <Button type="button" size="sm" onClick={handleStornoSubmit} disabled={stornoSubmitting}>
                  {stornoSubmitting ? 'Sztornózás…' : 'Sztornó jóváhagyása'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A-M7.9b — Pending lokál sorok blokkja (offline-rögzített kiadások)
// ─────────────────────────────────────────────────────────────────────────

function PendingExpenseBlock({
  rows,
  celNevById,
  syncBusy,
  onSyncNow,
  onConflictClick,
}: {
  rows: PendingKiadasRow[]
  celNevById: Map<number, string>
  syncBusy: boolean
  onSyncNow: () => void
  onConflictClick: (row: PendingKiadasRow) => void
}) {
  const pendingCount = rows.filter((r) => r.sync_state === 'pending').length
  const conflictCount = rows.filter((r) => r.sync_state === 'conflict').length

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-amber-900">
              🕓 Szinkronizálásra vár ({rows.length})
            </CardTitle>
            <CardDescription className="text-xs text-amber-800">
              Offline rögzített kiadás{rows.length > 1 ? 'ok' : ''} a hálózat-csatlakozást
              várj{rows.length > 1 ? 'ák' : 'a'}.
              {pendingCount > 0 && ` ${pendingCount} pending`}
              {pendingCount > 0 && conflictCount > 0 && ' · '}
              {conflictCount > 0 && (
                <span className="font-semibold text-rose-800">
                  {conflictCount} ütközés feloldásra vár
                </span>
              )}
              .
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSyncNow}
            disabled={syncBusy}
            className="border-amber-300"
          >
            <RefreshCw className={`mr-1.5 size-4 ${syncBusy ? 'animate-spin' : ''}`} />
            {syncBusy ? 'Szinkron…' : 'Sync most'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y divide-amber-200/70">
          {rows.map((r) => {
            const isConflict = r.sync_state === 'conflict'
            const celNev = celNevById.get(r.id_kiadascel) ?? `#${r.id_kiadascel}`
            const datumDisplay = r.datum.slice(0, 10)
            return (
              <li
                key={r.id}
                className={`flex flex-wrap items-start justify-between gap-2 py-2 ${
                  isConflict ? 'cursor-pointer hover:bg-rose-50/40' : ''
                }`}
                onClick={isConflict ? () => onConflictClick(r) : undefined}
                role={isConflict ? 'button' : undefined}
                tabIndex={isConflict ? 0 : undefined}
                onKeyDown={
                  isConflict
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onConflictClick(r)
                        }
                      }
                    : undefined
                }
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono text-xs">{r.iratszam}</span>
                    {' · '}
                    {datumDisplay}
                    {' · '}
                    <span className="font-semibold">{r.osszeg.toLocaleString('hu')} RON</span>
                    {r.atvevo && (
                      <span className="ml-1 text-xs text-amber-800">→ {r.atvevo}</span>
                    )}
                    {r.kedvezmenyezett_cui && (
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                        CUI: {r.kedvezmenyezett_cui}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-amber-800">{celNev}</p>
                  {isConflict && r.sync_error && (
                    <p className="mt-1 text-xs text-rose-700">
                      <AlertCircle className="mr-1 inline-block size-3" />
                      {r.sync_error}
                      <span className="ml-2 text-[10px] italic text-rose-600">
                        (kattints a feloldáshoz)
                      </span>
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isConflict
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-200/70 text-amber-900'
                  }`}
                >
                  {isConflict ? 'ütközés' : 'sync-re vár'}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
