/**
 * Befizetés (pénzbeszedés) oldal — `/penzugy/befizetes` route.
 *
 * A-M7.3d1 (2026-04-24) — az A-M7.3 kör első desktop UI-ja:
 *   - Év-szűrő (alapértelmezés: aktuális év)
 *   - Új befizetés rögzítő form (tag-autocomplete + kategória + összeg + irattípus)
 *   - Lista szekció (50 legfrissebb, dátum-csökkenő, sztornó + soft-delete gombokkal)
 *   - Online-only (A-M7.3 backend online-only; offline-cache az A-M7.3d2-ben jön)
 *
 * A chitanta-page.tsx szerkezete a minta (aktív tömb → wallet → form → lista).
 *
 * Lelkész-informálási alapelv (feedback_lelkesz_informalas.md):
 *   - Loading / error / empty / offline-state explicit kezelve
 *   - Pasztorális hibaüzenetek (a core adja, itt csak renderelünk)
 *   - Inline sztornó-panel + soft-delete confirm
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
  getFamilyIdForPersonUseCase,
  getNextReceiptNumberUseCase,
  listBefizetesCelekUseCase,
  listIncomeUseCase,
  saveIncomeUseCase,
  searchMembersForFinanceUseCase,
  softDeleteIncomeUseCase,
  stornoIncomeUseCase,
  type ListIncomeResult,
  type SaveIncomeResultOrError,
  type SoftDeleteIncomeResult,
  type StornoIncomeResult,
} from '@kartoteka/core'
import {
  type BefizetesCelRow,
  type BefizetesListRow,
  type MemberSearchResult,
} from '@kartoteka/validations'

import { IratszamWalletPanel } from '../components/iratszam-wallet-panel'
import { PageHero, GYULEKEZETI_KONYVELHETO_KOD_RE } from '@kartoteka/ui-app'
import { WriteSyncConflictDialog } from '../components/write-sync-conflict-dialog'
import {
  buildBefizetesCsv,
  buildBefizetesCsvFilename,
  downloadCsv,
} from '../lib/export/befizetes-csv'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { runBefizetesSyncManually } from '../lib/befizetes-write-sync'
import { enqueueEntryExcelRow } from '../lib/excel-enqueue'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { useSessionOnline } from '../lib/use-session-online'
import { getLocalOwnProfile } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

// ─────────────────────────────────────────────────────────────────────────
// Fő oldal-komponens
// ─────────────────────────────────────────────────────────────────────────

export function BefizetesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [year, setYear] = useState<number>(() => new Date().getFullYear())

  const [celek, setCelek] = useState<BefizetesCelRow[]>([])
  const [celekError, setCelekError] = useState<string | null>(null)

  // 2026-06-11: session-tudatos online-allapot (PIN-modban offline ag!)
  const isOnline = useSessionOnline()
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

  // ── Befizetés-célok (kategóriák) betöltése egyszer ──
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const result = await listBefizetesCelekUseCase(
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

  // ── Lista-frissítő állapot (a lista-komponensből signal) ──
  const [refreshKey, setRefreshKey] = useState<number>(0)

  // ── A-M7.9a — Iratszám-tárca állapot (befizetés form engedélyezéséhez offline-módban) ──
  const [walletAvailable, setWalletAvailable] = useState<number>(0)

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Bevétel"
          title="Befizetés rögzítése"
          description="Tag- vagy családi befizetések rögzítése a gyülekezet bevétel-nyilvántartásába."
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

        {/* A-M7.9a — Iratszám-tárca panel (Készpénz offline-rögzítéséhez).
            A wallet az aktuális év-szűrőre szól; az IncomeForm-ban a `fizetettev` mező
            ettől eltérő lehet — ha igen, ott külön walletet kellene használni, de a
            jelenlegi UX-ben a year-szűrő és a fizetettev általában egybeesik. */}
        {user && congregationId && (
          <IratszamWalletPanel
            congregationId={congregationId}
            tipus="befizetes"
            ev={year}
            isOnline={isOnline}
            onStatusChange={setWalletAvailable}
          />
        )}

        {/* Offline-figyelmeztetés — A-M7.9a-ban kibővítve a wallet-állapottal */}
        {!isOnline && (
          <OfflineWarning walletAvailable={walletAvailable} />
        )}

        {/* Kategória-betöltés hiba */}
        {celekError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {celekError}
          </div>
        )}

        {/* Új befizetés form */}
        {user && congregationId && celek.length > 0 && (
          <IncomeForm
            userId={user.id}
            congregationId={congregationId}
            celek={celek}
            isOnline={isOnline}
            walletAvailable={walletAvailable}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {/* Lista szekció */}
        {user && congregationId && (
          <RecentIncomeSection
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
// Offline figyelmeztetés (A-M7.9a) — wallet-érzékeny
// ─────────────────────────────────────────────────────────────────────────

function OfflineWarning({ walletAvailable }: { walletAvailable: number }) {
  if (walletAvailable > 0) {
    // Van szám a tárcában → kék (informatív, NEM blokkoló)
    return (
      <div className="rounded-lg border border-sky-300 bg-sky-50/80 p-3 text-sm text-sky-900">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div>
            <p className="font-semibold">Offline munkamenet — Készpénzes befizetés rögzíthető.</p>
            <p className="mt-1 text-sky-800">
              <span className="font-semibold">{walletAvailable}</span> szabad sorszám a tárcában.
              A rögzített tételek a hálózatra csatlakozáskor automatikusan szinkronizálódnak.
              Banki átutalások online-módban rögzíthetők.
            </p>
          </div>
        </div>
      </div>
    )
  }
  // Üres a wallet → narancs (kritikus offline-figyelmeztetés)
  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50/80 p-3 text-sm text-orange-900">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-orange-600" />
        <div>
          <p className="font-semibold">Offline munkamenet — befizetés rögzítése szünetel.</p>
          <p className="mt-1 text-orange-800">
            Üres az iratszám-tárca. Csatlakozz a hálózatra, tölts fel legalább egy sorszámot
            (Iratszám-tárca panel → +10 szám), és utána offline-ban is tudsz Készpénzes
            befizetést rögzíteni.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Új befizetés rögzítő form
// ─────────────────────────────────────────────────────────────────────────

type IrattipusOption = 'Készpénz' | 'Banki'

function IncomeForm({
  userId,
  congregationId,
  celek,
  isOnline,
  walletAvailable,
  onSaved,
}: {
  userId: string
  congregationId: string
  celek: BefizetesCelRow[]
  isOnline: boolean
  walletAvailable: number
  onSaved: () => void
}) {
  const [datum, setDatum] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [fizetettev, setFizetettev] = useState<number>(() => new Date().getFullYear())
  const [osszeg, setOsszeg] = useState('')
  const [irattipus, setIrattipus] = useState<IrattipusOption>('Készpénz')
  const [iratszam, setIratszam] = useState('')
  const [celId, setCelId] = useState<number | null>(null)
  const [megjegyzes, setMegjegyzes] = useState('')

  // Tag-kereső állapot
  const [tagQuery, setTagQuery] = useState('')
  const [tagHits, setTagHits] = useState<MemberSearchResult[]>([])
  const [tagSearching, setTagSearching] = useState(false)
  const [selectedTag, setSelectedTag] = useState<MemberSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Család-állapot (A-M7.3d3) — ha a kiválasztott tag családhoz tartozik,
  // felajánljuk a család-szintű befizetést
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [isFamilyPayment, setIsFamilyPayment] = useState(false)
  const [familyLookupDone, setFamilyLookupDone] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<string | null>(null)

  // Auto-load next iratszám amikor Készpénz + ha üres a mező
  //
  // 2026-08-11 (P1 #28): itt egy hardkódolt csupa-nulla UUID ment le
  // („placeholder, valójában a ctx-ben lesz"), miközben a komponens MEGKAPJA a
  // valódi `congregationId` propot, és mentéskor helyesen azt is használja. A
  // `getNextReceiptNumberUseCase` `.eq('congregation_id', …)`-vel szűr, tehát a
  // placeholderre MINDIG 0 sort talált → mindig „1"-et ajánlott. A lelkész 4711
  // meglévő nyugta mellett is 1-est kapott: mentéskor a duplikáció-ellenőrzés
  // (ami a VALÓDI congregationId-t kapja) elutasította, vagy — ha az 1-es szám
  // import-hézag miatt szabad volt — visszalépő sorszám került a hivatalos,
  // hézagmentes nyugta-sorozatba.
  useEffect(() => {
    if (!isOnline || irattipus !== 'Készpénz' || iratszam.trim() !== '') return
    let cancelled = false
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const res = await getNextReceiptNumberUseCase(
          {
            congregationId,
            year: fizetettev,
          },
          { supabase, runtime: 'desktop' },
        )
        if (!cancelled && res.success) {
          setIratszam(String(res.nextNumber))
        }
      } catch {
        /* csendes — a user kézzel is megadhatja */
      }
    })()
    return () => {
      cancelled = true
    }
    // Szándékosan `irattipus` + `fizetettev` + `congregationId` triggerli; a
    // `iratszam` NEM, mert akkor körkörös
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irattipus, fizetettev, isOnline, congregationId])

  // Amikor tag kiválasztódik, lekérdezzük a családját
  // (hogy a család-befizetés checkbox meg tudjon jelenni)
  useEffect(() => {
    if (!selectedTag) {
      setFamilyId(null)
      setIsFamilyPayment(false)
      setFamilyLookupDone(false)
      return
    }
    let cancelled = false
    void (async () => {
      setFamilyLookupDone(false)
      try {
        const supabase = getDesktopSupabase()
        const profile = await getLocalOwnProfile(userId)
        const congregationId = profile?.congregation_id
        if (!congregationId) return
        const res = await getFamilyIdForPersonUseCase(
          { congregationId, personId: selectedTag.id },
          { supabase, runtime: 'desktop' },
        )
        if (cancelled) return
        if (res.success) {
          setFamilyId(res.familyId)
        } else {
          setFamilyId(null)
        }
        setFamilyLookupDone(true)
      } catch {
        if (!cancelled) {
          setFamilyId(null)
          setFamilyLookupDone(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedTag, userId])

  // Tag-kereső debounce
  useEffect(() => {
    if (selectedTag) return // már választott egyet, ne keressünk
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
        // A user profile-ból már tudjuk a congregationId-t, de egyszerűsítésért
        // újra olvassuk — az useCase validálja a UUID-ot
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
  }, [tagQuery, userId, selectedTag])

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
      setError('Válassz kategóriát a befizetéshez.')
      return
    }
    if (!selectedTag && !tagQuery.trim()) {
      setError('Válassz tagot a listából, vagy hagyd üresen (általános befizetés).')
      return
    }

    setSubmitting(true)
    try {
      const supabase = getDesktopSupabase()

      // A-M7.3d3: ha „család-szintű" checkbox aktív ÉS van familyId,
      // a befizetést család-szinten rögzítjük; egyébként tag-szinten.
      const useFamilyMode = isFamilyPayment && familyId !== null

      // A-M7.9a — offline-ág: ha nincs hálózat, a wallet-ből veszünk iratszámot
      // és a `befizetes_pending_local`-ba mentünk, outbox-on át sync-re vár.
      // Az iratszám mező offline-ban üres marad — a backend wallet-ből választ.
      const offlineBackend = isOnline ? undefined : getTauriSqliteBackend()

      const result: SaveIncomeResultOrError = await saveIncomeUseCase(
        {
          congregationId,
          osszeg: osszegNum,
          datum,
          id_befizetescel: celId,
          id_szemely: useFamilyMode ? null : selectedTag?.id ?? null,
          id_csalad: useFamilyMode ? familyId : null,
          forrasa: isOnline ? 'Desktop rögzítés' : 'Desktop offline rögzítés',
          iratszam: isOnline ? (iratszam.trim() || null) : null,
          irattipus,
          fizetettev,
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
        } else if (result.offlineNotSupported) {
          setError(result.error)
        } else {
          setError(result.error)
        }
        return
      }

      // E3: online mentés sikerkor a hivatalos Excelbe is (várólistán át).
      // Offline tételt a push-sync enqueue-ol, amikor már van szerver-id.
      if (!result.pending && result.data.id > 0) {
        void enqueueEntryExcelRow({
          type: 'befizetes',
          serverId: result.data.id,
          congregationId,
          datum,
          iratszam: result.data.iratszam,
          irattipus,
          nev: selectedTag
            ? `${selectedTag.csaladnev ?? ''} ${selectedTag.k_nev ?? ''}`.trim()
            : '',
          osszeg: osszegNum,
          celId,
          megjegyzes: megjegyzes.trim() || null,
          ev: fizetettev,
        })
      }

      const pendingNote = result.pending
        ? ' · Szinkronizálásra vár, a hálózatra csatlakozáskor felmegy.'
        : ''
      setSuccessInfo(
        `Befizetés rögzítve (iratszám: ${result.data.iratszam}, összeg: ${osszegNum.toLocaleString('hu')} RON${useFamilyMode ? ', család-szintű' : ''}).${pendingNote}`,
      )
      // Form-reset — csak a változó mezők, a dátum + kategória marad
      setOsszeg('')
      setIratszam('')
      setMegjegyzes('')
      setTagQuery('')
      setSelectedTag(null)
      setTagHits([])
      setFamilyId(null)
      setIsFamilyPayment(false)
      setFamilyLookupDone(false)

      setTimeout(() => setSuccessInfo(null), 6000)
      onSaved() // jelez a parent-nek, hogy töltse újra a listát
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // A-M7.9a — formDisabled finomított logika:
  //   - online + Készpénz / Banki: engedélyezve
  //   - offline + Készpénz + walletAvailable > 0: engedélyezve (offline-ág)
  //   - offline + Banki: tiltva (csak online-ban rögzíthető)
  //   - offline + Készpénz + walletAvailable = 0: tiltva
  const isCashOffline = !isOnline && irattipus === 'Készpénz' && walletAvailable > 0
  const formDisabled = (!isOnline && !isCashOffline) || submitting

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Új befizetés rögzítése</CardTitle>
        <CardDescription className="text-xs">
          Készpénzes vagy banki befizetés a gyülekezet bevétel-nyilvántartásába. A tag-mezőt
          üresen hagyva általános (nem tag-specifikus) bevétel is rögzíthető.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Dátum + Fizetett év */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-datum">Befizetés dátuma *</Label>
              <Input
                id="b-datum"
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.currentTarget.value)}
                disabled={formDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-ev">Melyik évre *</Label>
              <Input
                id="b-ev"
                type="number"
                min={2000}
                max={2100}
                required
                value={fizetettev}
                onChange={(e) => setFizetettev(Number(e.currentTarget.value))}
                disabled={formDisabled}
              />
            </div>
          </div>

          {/* Tag-kereső */}
          <div className="space-y-1.5">
            <Label htmlFor="b-tag">Tag (opcionális — hagyd üresen általános befizetéshez)</Label>
            {selectedTag ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="font-medium">
                      {selectedTag.csaladnev} {selectedTag.k_nev}
                    </span>
                    {selectedTag.sz_datum && (
                      <span className="text-xs text-emerald-800">
                        sz. {selectedTag.sz_datum.slice(0, 10)}
                      </span>
                    )}
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
                {/* Család-szintű befizetés checkbox (A-M7.3d3) */}
                {familyLookupDone && familyId !== null && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-900 hover:bg-sky-50">
                    <input
                      type="checkbox"
                      checked={isFamilyPayment}
                      onChange={(e) => setIsFamilyPayment(e.currentTarget.checked)}
                      disabled={formDisabled}
                      className="size-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>
                      <span className="font-medium">Család-szintű befizetés</span>
                      <span className="ml-1 text-xs text-sky-800">
                        (a befizetés az egész családhoz rögzül, nem csak ehhez a taghoz)
                      </span>
                    </span>
                  </label>
                )}
                {familyLookupDone && familyId === null && (
                  <p className="text-[11px] italic text-muted-foreground">
                    Ez a tag nem tartozik családhoz a nyilvántartásban — a befizetés tag-szintű lesz.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="b-tag"
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.currentTarget.value)}
                    disabled={formDisabled}
                    placeholder="Kezdj el gépelni (pl. Kovács János)…"
                    className="pl-8"
                  />
                </div>
                {tagSearching && (
                  <p className="text-xs italic text-muted-foreground">Keresés…</p>
                )}
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
                          <span className="text-xs text-muted-foreground">
                            {m.sz_datum ? `sz. ${m.sz_datum.slice(0, 10)}` : ''}
                            {m.cim_nev ? ` · ${m.cim_nev}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Kategória + Összeg */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-cel">Kategória *</Label>
              <select
                id="b-cel"
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
            <div className="space-y-1.5">
              <Label htmlFor="b-osszeg">Összeg (RON) *</Label>
              <Input
                id="b-osszeg"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={osszeg}
                onChange={(e) => setOsszeg(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. 150"
              />
            </div>
          </div>

          {/* Irattípus + Iratszám */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-tipus">Típus *</Label>
              <select
                id="b-tipus"
                required
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={irattipus}
                onChange={(e) => setIrattipus(e.currentTarget.value as IrattipusOption)}
                disabled={formDisabled}
              >
                <option value="Készpénz">Készpénz (nyugta)</option>
                <option value="Banki">Banki átutalás</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-iratszam">Iratszám (automatikus, módosítható)</Label>
              <Input
                id="b-iratszam"
                value={iratszam}
                onChange={(e) => setIratszam(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="Automatikus generálás…"
              />
            </div>
          </div>

          {/* Megjegyzés */}
          <div className="space-y-1.5">
            <Label htmlFor="b-megjegy">Belső megjegyzés (opcionális)</Label>
            <Input
              id="b-megjegy"
              maxLength={500}
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              disabled={formDisabled}
              placeholder="pl. 2024. évi pótbefizetés"
            />
          </div>

          {/* Hiba / Siker */}
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
              {submitting ? 'Rögzítés…' : 'Befizetés rögzítése'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lista szekció — a múltbeli befizetések + sztornó / törlés
// ─────────────────────────────────────────────────────────────────────────

interface PendingBefizetesRow {
  id: string
  iratszam: string
  datum: string
  osszeg: number
  id_befizetescel: number
  id_szemely: number | null
  id_csalad: number | null
  csalad: number
  forrasa: string | null
  megjegyzes: string | null
  fizetettev: number
  sync_state: 'pending' | 'conflict'
  sync_error: string | null
  created_at: string
}

function RecentIncomeSection({
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
  celek: BefizetesCelRow[]
}) {
  const [rows, setRows] = useState<BefizetesListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // A-M7.9a — pending lokál sorok (offline-rögzített, sync-re vár / conflict)
  const [pendingRows, setPendingRows] = useState<PendingBefizetesRow[]>([])
  const [syncBusy, setSyncBusy] = useState(false)

  // A-M7.9c — conflict-feloldó dialog
  const [conflictRow, setConflictRow] = useState<PendingBefizetesRow | null>(null)

  // Szűrők (A-M7.3d4)
  const [filterSzemelyId, setFilterSzemelyId] = useState<number | null>(null)
  const [filterSzemelyLabel, setFilterSzemelyLabel] = useState<string>('')
  const [filterCelId, setFilterCelId] = useState<number | null>(null)
  const [filterTagQuery, setFilterTagQuery] = useState('')
  const [filterTagHits, setFilterTagHits] = useState<MemberSearchResult[]>([])
  const [filterTagSearching, setFilterTagSearching] = useState(false)

  // Sztornó állapot
  const [stornoFor, setStornoFor] = useState<BefizetesListRow | null>(null)
  const [stornoIndok, setStornoIndok] = useState('')
  const [stornoSubmitting, setStornoSubmitting] = useState(false)
  const [stornoError, setStornoError] = useState<string | null>(null)
  // Sztornó cascade-visszajelzés (A-M7.3d3) — pár mp-ig látható success-üzenet
  const [stornoSuccessMsg, setStornoSuccessMsg] = useState<string | null>(null)

  // Törlés állapot
  const [deleteSubmitting, setDeleteSubmitting] = useState<number | null>(null)

  // Cél-ID → név map (a lista-megjelenítéshez, ha az use-case join nem adott nevet)
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
      const result: ListIncomeResult = await listIncomeUseCase(
        {
          congregationId,
          year,
          yearField: 'fizetettev',
          szemelyId: filterSzemelyId,
          befizetescelId: filterCelId,
          orderBy: 'datum-desc',
          // A-M7.3d4 — 500 limit a teljes évhez, hogy a kliens-oldali summary korrekt legyen
          // 2026-07-25 (F6.1): 500 → 2000 (a lista-séma plafonja). 2025-ben már
          // 470 tétel/év volt — az 500 az idei évet is levágta volna.
          limit: 2000,
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
  }, [userId, year, filterSzemelyId, filterCelId])

  useEffect(() => {
    void loadList()
  }, [loadList, refreshKey])

  // A-M7.9a — pending lokál sorok lekérdezése (offline-rögzített)
  const loadPending = useCallback(async () => {
    try {
      const list = await getTauriSqliteBackend().listLocalPendingBefizetes(
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
      await runBefizetesSyncManually()
      await Promise.all([loadList(), loadPending()])
    } catch {
      /* csendes — a sync-fn maga is csak result-ban dob */
    } finally {
      setSyncBusy(false)
    }
  }

  // Tag-szűrő kereső debounce (A-M7.3d4)
  useEffect(() => {
    if (filterSzemelyId !== null) return // már választott tagot
    if (filterTagQuery.trim().length < 2) {
      setFilterTagHits([])
      return
    }
    const timer = setTimeout(async () => {
      setFilterTagSearching(true)
      try {
        const supabase = getDesktopSupabase()
        const profile = await getLocalOwnProfile(userId)
        const congregationId = profile?.congregation_id
        if (!congregationId) return
        const res = await searchMembersForFinanceUseCase(
          { congregationId, query: filterTagQuery.trim(), limit: 6 },
          { supabase, runtime: 'desktop' },
        )
        if (res.success) setFilterTagHits(res.members)
      } catch {
        /* csendes */
      } finally {
        setFilterTagSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [filterTagQuery, userId, filterSzemelyId])

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
      const result: StornoIncomeResult = await stornoIncomeUseCase(
        {
          congregationId,
          befizetesId: stornoFor.id,
          indok: stornoIndok.trim(),
        },
        { supabase, runtime: 'desktop', userId },
      )
      if (!result.success) {
        setStornoError(result.error)
        return
      }
      // Siker — zárjuk a panel-t, a cascade-visszajelzést rövid ideig mutatjuk
      const cascadeParts: string[] = []
      if (result.cascadedChitantas > 0) {
        cascadeParts.push(
          `${result.cascadedChitantas} chitanța is sztornózva`,
        )
      }
      if (result.cascadedInternalTransfer) {
        cascadeParts.push('a belső kassza↔bank transfer párja is sztornózva')
      }
      const cascadeMsg =
        cascadeParts.length > 0
          ? `Befizetés sztornózva. Mellé: ${cascadeParts.join(' + ')}.`
          : 'Befizetés sztornózva.'
      setStornoSuccessMsg(cascadeMsg)
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

  async function handleDelete(row: BefizetesListRow) {
    if (
      !window.confirm(
        `Biztosan törlöd a ${row.iratszam} sz. befizetést (${row.osszeg.toLocaleString('hu')} RON)? Visszaállítható — a sor a DB-ben marad „törölve" jelzéssel.`,
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
      const result: SoftDeleteIncomeResult = await softDeleteIncomeUseCase(
        { congregationId, befizetesId: row.id },
        { supabase, runtime: 'desktop', userId },
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

  const filtersActive = filterSzemelyId !== null || filterCelId !== null

  return (
    <div className="space-y-4">
      {/* Éves összesítő kártya (A-M7.3d4) */}
      <IncomeSummary year={year} rows={rows} filtersActive={filtersActive} />

      {/* A-M7.9a — Pending lokál sorok (offline-rögzített, sync-re vár / conflict) */}
      {pendingRows.length > 0 && (
        <PendingIncomeBlock
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
          entity="befizetes"
          localId={conflictRow.id}
          congregationId={congregationId}
          ev={conflictRow.fizetettev}
          display={{
            iratszam: conflictRow.iratszam,
            datum: conflictRow.datum,
            osszeg: conflictRow.osszeg,
            label: celNevById.get(conflictRow.id_befizetescel) ?? null,
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

      <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Befizetések ({year})</CardTitle>
            <CardDescription className="text-xs">
              A {year}. évhez tartozó maximum 500 befizetés. A sztornózott sorok áthúzottan látszanak.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const csv = buildBefizetesCsv(rows)
                const filename = buildBefizetesCsvFilename(year, filtersActive)
                downloadCsv(csv, filename)
              }}
              disabled={loading || rows.length === 0}
              title="CSV export (Excel-kompatibilis, UTF-8 BOM)"
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
        {/* Szűrő-sáv (A-M7.3d4) */}
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Szűrők
            </p>
            {filtersActive && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilterSzemelyId(null)
                  setFilterSzemelyLabel('')
                  setFilterCelId(null)
                  setFilterTagQuery('')
                  setFilterTagHits([])
                }}
                className="h-6 text-xs"
              >
                Szűrők törlése
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {/* Tag-szűrő */}
            <div className="space-y-1">
              <Label htmlFor="filter-tag" className="text-xs">
                Tag
              </Label>
              {filterSzemelyId !== null ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-sm">
                  <span className="truncate text-xs">{filterSzemelyLabel}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFilterSzemelyId(null)
                      setFilterSzemelyLabel('')
                      setFilterTagQuery('')
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    ×
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="filter-tag"
                      value={filterTagQuery}
                      onChange={(e) => setFilterTagQuery(e.currentTarget.value)}
                      placeholder="Keress tagot a listához…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  {filterTagSearching && (
                    <p className="text-[11px] italic text-muted-foreground">Keresés…</p>
                  )}
                  {filterTagHits.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white text-sm shadow-sm">
                      {filterTagHits.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSzemelyId(m.id)
                              setFilterSzemelyLabel(
                                `${m.csaladnev ?? ''} ${m.k_nev ?? ''}`.trim() ||
                                  `#${m.id}`,
                              )
                              setFilterTagQuery('')
                              setFilterTagHits([])
                            }}
                            className="w-full border-b border-slate-100 px-2.5 py-1.5 text-left text-xs last:border-0 hover:bg-slate-50"
                          >
                            <span className="font-medium">
                              {m.csaladnev} {m.k_nev}
                            </span>
                            {m.sz_datum && (
                              <span className="ml-1.5 text-muted-foreground">
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

            {/* Kategória-szűrő */}
            <div className="space-y-1">
              <Label htmlFor="filter-cel" className="text-xs">
                Kategória
              </Label>
              <select
                id="filter-cel"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
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
            </div>
          </div>
        </div>

        {/* Sztornó cascade-visszajelzés (A-M7.3d3) */}
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
          <p className="text-sm text-muted-foreground">
            Nincs rögzített befizetés {year}. évre.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const celNev = r.befizetescel_nev || celNevById.get(r.id_befizetescel) || `Kategória #${r.id_befizetescel}`
              return (
                <li
                  key={r.id}
                  className={`flex items-start justify-between gap-3 py-2 ${r.stornozott ? 'opacity-60' : ''}`}
                >
                  <div className={r.stornozott ? 'line-through' : ''}>
                    <p className="text-sm font-medium">
                      {r.iratszam}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {r.datum} · {r.osszeg.toLocaleString('hu')} RON · {r.irattipus}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {celNev}
                      {r.szemely_nev ? ` · ${r.szemely_nev}` : ''}
                      {r.csalad && (
                        <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                          család
                        </span>
                      )}
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

        {/* Inline sztornó panel */}
        {stornoFor && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900">
            <p className="font-semibold">
              Biztosan sztornózod a {stornoFor.iratszam} befizetést?
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Összeg: {stornoFor.osszeg.toLocaleString('hu')} RON · Dátum: {stornoFor.datum}
              {stornoFor.szemely_nev ? ` · Tag: ${stornoFor.szemely_nev}` : ''}
            </p>
            <p className="mt-1 text-xs italic text-amber-800">
              A kapcsolt chitantákat (ha vannak) automatikusan sztornózzuk. A belső mozgás párja is
              sztornózva lesz.
            </p>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="b-storno-indok" className="text-xs">
                Indoklás (legalább 5 karakter) *
              </Label>
              <Input
                id="b-storno-indok"
                maxLength={500}
                value={stornoIndok}
                onChange={(e) => setStornoIndok(e.currentTarget.value)}
                disabled={stornoSubmitting}
                placeholder="Pl. Tévesen a másik tagnál rögzítettem."
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
// Éves összesítő kártya (A-M7.3d4)
// ─────────────────────────────────────────────────────────────────────────

function IncomeSummary({
  year,
  rows,
  filtersActive,
}: {
  year: number
  rows: BefizetesListRow[]
  filtersActive: boolean
}) {
  // Csak a NEM sztornózott, NEM törölt sorokat számítjuk be
  const activeRows = rows.filter((r) => !r.stornozott && !r.deleted)
  const stornoCount = rows.filter((r) => r.stornozott).length

  const totalOsszeg = activeRows.reduce((sum, r) => sum + (r.osszeg || 0), 0)
  const totalCount = activeRows.length

  // Kategóriánkénti összegzés
  const byCategory = new Map<string, { osszeg: number; count: number }>()
  for (const r of activeRows) {
    const name = r.befizetescel_nev || `Kategória #${r.id_befizetescel}`
    const cur = byCategory.get(name) || { osszeg: 0, count: 0 }
    cur.osszeg += r.osszeg || 0
    cur.count += 1
    byCategory.set(name, cur)
  }
  const categoryEntries = Array.from(byCategory.entries())
    .sort((a, b) => b[1].osszeg - a[1].osszeg)
    .slice(0, 5)

  if (totalCount === 0) return null

  const title = filtersActive ? `Szűrt összesítő` : `${year}. évi összesítő`

  return (
    <Card className="border-emerald-100 bg-emerald-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-emerald-900">{title}</CardTitle>
          {stornoCount > 0 && (
            <span className="text-[11px] italic text-muted-foreground">
              + {stornoCount} sztornózott (nem számítva)
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Fő számok */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Összes befizetés
            </p>
            <p className="mt-0.5 font-mono text-2xl font-bold text-emerald-900">
              {totalOsszeg.toLocaleString('hu')}{' '}
              <span className="text-sm font-normal">RON</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Darabszám
            </p>
            <p className="mt-0.5 font-mono text-2xl font-bold text-emerald-900">{totalCount}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Átlag / befizetés
            </p>
            <p className="mt-0.5 font-mono text-2xl font-bold text-emerald-900">
              {Math.round(totalOsszeg / totalCount).toLocaleString('hu')}{' '}
              <span className="text-sm font-normal">RON</span>
            </p>
          </div>
        </div>

        {/* Top kategóriák */}
        {categoryEntries.length > 0 && !filtersActive && (
          <div className="border-t border-emerald-200/60 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Top kategóriák
            </p>
            <ul className="space-y-1.5">
              {categoryEntries.map(([name, stat]) => {
                const pct = totalOsszeg > 0 ? Math.round((stat.osszeg / totalOsszeg) * 100) : 0
                return (
                  <li key={name} className="text-xs">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="font-medium text-emerald-900">{name}</span>
                      <span className="font-mono text-emerald-800">
                        {stat.osszeg.toLocaleString('hu')} RON ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-emerald-100">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{stat.count} db</p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A-M7.9a — Pending lokál sorok blokkja (offline-rögzített befizetések)
// ─────────────────────────────────────────────────────────────────────────

function PendingIncomeBlock({
  rows,
  celNevById,
  syncBusy,
  onSyncNow,
  onConflictClick,
}: {
  rows: PendingBefizetesRow[]
  celNevById: Map<number, string>
  syncBusy: boolean
  onSyncNow: () => void
  onConflictClick: (row: PendingBefizetesRow) => void
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
              Offline rögzített befizetés{rows.length > 1 ? 'ek' : ''} a hálózat-csatlakozást
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
            const celNev = celNevById.get(r.id_befizetescel) ?? `#${r.id_befizetescel}`
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
                    {r.datum}
                    {' · '}
                    <span className="font-semibold">{r.osszeg.toLocaleString('hu')} RON</span>
                    {r.csalad === 1 && (
                      <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">
                        család
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
