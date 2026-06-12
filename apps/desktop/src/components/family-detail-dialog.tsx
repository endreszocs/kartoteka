/**
 * FamilyDetailDialog — M8.3a (read-only) + M8.3b (családfő-kijelölés) (2026-04-24).
 *
 * Egy család részleteit mutatja: férfi + nő (szülők) + gyerekek listája.
 * A `TauriSqliteBackend.getLocalCsaladDetail(familyId)`-t hívja, ami
 * join-olja a `szemely_local`-hez a neveket, `csaladfo` flaget és revision-t.
 *
 * M8.3b — családfő-kijelölés:
 *   - A jelenlegi családfő (szemely.csaladfo=1) kék "👑 Családfő" badge-et kap
 *   - Mellette (a nem-családfő tagoknál) "Kijelölés családfőnek" gomb
 *   - Kattintás: browser-confirm + (a) régi családfő false-ra állítása (b) új családfő true-ra
 *   - `updateSzemelyEntry` mindkettőhöz (online + offline outbox)
 *   - Siker után auto-refresh
 *
 * A későbbi M8.3c-ben jön:
 *   - Új gyermek hozzáadása a családhoz (gyerek-junction insert)
 *   - Tag eltávolítása a családból
 *   - Új család létrehozása
 *   - Család szerkesztése (id_ferfi, id_no, cím)
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Camera,
  Check,
  Crown,
  Home,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@kartoteka/ui'
import { AvatarEditorBody, MemberAvatar } from '@kartoteka/ui-app'

import { fetchSocialAvatarImageDesktop, saveMemberAvatarDesktop } from '../lib/avatar'

import { CsaladFormDialog } from './csalad-form-dialog'
import {
  addGyerekToCsalad,
  removeGyerekFromCsalad,
  updateSzemelyEntry,
} from '../lib/sync'
import { runGyerekSyncManually, startGyerekAutoSync } from '../lib/gyerek-write-sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface FamilyDetailDialogProps {
  userId: string
  congregationId?: string
  familyId: number
  onClose: () => void
}

type FamilyDetail = Awaited<
  ReturnType<ReturnType<typeof getTauriSqliteBackend>['getLocalCsaladDetail']>
>

type Banner =
  | { kind: 'success'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'offline'; text: string }
  | { kind: 'error'; text: string }
  | null

export function FamilyDetailDialog({
  userId,
  congregationId,
  familyId,
  onClose,
}: FamilyDetailDialogProps) {
  const [detail, setDetail] = useState<FamilyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  // 2026-06-11 (Endre): fénykép + közösségi link szerkesztő
  const [avatarEditPerson, setAvatarEditPerson] = useState<{ id: number; name: string; kepUrl?: string | null; socialUrl?: string | null } | null>(null)
  const [banner, setBanner] = useState<Banner>(null)
  const [editOpen, setEditOpen] = useState(false)

  // M8.3d — gyerek-add kereső
  const [addChildOpen, setAddChildOpen] = useState(false)
  const [childSearch, setChildSearch] = useState('')
  const [childSearchResults, setChildSearchResults] = useState<
    Array<{
      id: number
      csaladnev: string | null
      k_nev: string | null
      ferjk_nev: string | null
      sz_datum: string | null
      ferfi: number
    }>
  >([])
  const [addingChild, setAddingChild] = useState(false)
  const [removingGyerekId, setRemovingGyerekId] = useState<number | null>(null)

  // M8.3d — gyerek-sync auto-start
  useEffect(() => {
    startGyerekAutoSync()
  }, [])

  // Child-search debounce
  useEffect(() => {
    if (!addChildOpen || !congregationId) {
      setChildSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const list = await getTauriSqliteBackend().listLocalSzemely({
          congregationId,
          search: childSearch.trim() || undefined,
          statusFilter: 'aktiv',
          orderBy: 'csaladnev-asc',
          limit: 10,
        })
        // A már hozzárendelt gyerekeket kiszűrjük
        const existingIds = new Set<number>()
        if (detail?.ferfi?.id) existingIds.add(detail.ferfi.id)
        if (detail?.no?.id) existingIds.add(detail.no.id)
        for (const g of detail?.gyermekek ?? []) existingIds.add(g.szemely_id)
        setChildSearchResults(list.filter((m) => !existingIds.has(m.id)))
      } catch {
        setChildSearchResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [addChildOpen, childSearch, congregationId, detail])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTauriSqliteBackend().getLocalCsaladDetail(familyId)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Családfő kijelölése — 2 lépcsős UPDATE:
   *   1. A jelenlegi családfőt (ha van) csaladfo=false-ra állítjuk
   *   2. Az új tagot csaladfo=true-ra
   * Mindkettő külön `updateSzemelyEntry` — nem atomic, de V1-re elég.
   */
  async function handleSetCsaladfo(
    newCsaladfoId: number,
    newCsaladfoName: string,
    newCsaladfoRevision: number,
  ) {
    if (!detail) return

    // Az összes jelenlegi családtag (férfi + nő + gyerekek) csaladfo-listája
    const allMembers: Array<{ id: number; csaladfo: number; revision: number }> = []
    if (detail.ferfi) {
      allMembers.push({
        id: detail.ferfi.id,
        csaladfo: detail.ferfi.csaladfo,
        revision: detail.ferfi.revision,
      })
    }
    if (detail.no) {
      allMembers.push({
        id: detail.no.id,
        csaladfo: detail.no.csaladfo,
        revision: detail.no.revision,
      })
    }
    for (const g of detail.gyermekek) {
      allMembers.push({
        id: g.szemely_id,
        csaladfo: g.csaladfo,
        revision: g.revision,
      })
    }

    const currentCsaladfok = allMembers.filter((m) => m.csaladfo === 1)

    const confirmMsg =
      currentCsaladfok.length > 0
        ? `"${newCsaladfoName}" legyen az új családfő?\n\nA jelenlegi családfő(k) automatikusan lekerülnek a szerepkörből.`
        : `"${newCsaladfoName}" legyen a család családfője?\n\nEddig nem volt kijelölt családfő.`
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return

    setBusyMemberId(newCsaladfoId)
    setBanner(null)
    let anyConflict = false
    let anyOffline = false

    try {
      // 1. Régi családfő(k) → csaladfo: false
      for (const old of currentCsaladfok) {
        if (old.id === newCsaladfoId) continue // már ő van, nem kell módosítani
        const result = await updateSzemelyEntry(
          userId,
          old.id,
          { csaladfo: false },
          old.revision,
        )
        if (result.conflict) anyConflict = true
        if (result.queuedToOutbox) anyOffline = true
      }

      // 2. Új családfő → csaladfo: true
      const result = await updateSzemelyEntry(
        userId,
        newCsaladfoId,
        { csaladfo: true },
        newCsaladfoRevision,
      )
      if (result.conflict) anyConflict = true
      if (result.queuedToOutbox) anyOffline = true

      if (anyConflict) {
        setBanner({
          kind: 'conflict',
          text:
            'Más eszközről időközben módosítottak. Az adatokat frissítettem — ' +
            'nézd meg, és próbáld újra, ha szükséges.',
        })
      } else if (anyOffline) {
        setBanner({
          kind: 'offline',
          text:
            'Offline módban elmentve. A szinkron a következő online-menetben ' +
            'feltölti a szerverre.',
        })
      } else {
        setBanner({
          kind: 'success',
          text: `"${newCsaladfoName}" most a család családfője.`,
        })
      }

      await load()
    } catch (err: unknown) {
      setBanner({
        kind: 'error',
        text: `Hiba a családfő-kijelöléskor: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setBusyMemberId(null)
    }
  }

  /** M8.3d — Új gyermek hozzárendelése a családhoz */
  async function handleAddChild(szemelyId: number, name: string) {
    if (!detail?.family) return
    setAddingChild(true)
    setBanner(null)
    try {
      const result = await addGyerekToCsalad(userId, detail.family.id, szemelyId)
      if (result.synced) {
        setBanner({
          kind: 'success',
          text: `"${name}" hozzáadva a családhoz.`,
        })
      } else if (result.queuedToPending) {
        setBanner({
          kind: 'offline',
          text: `"${name}" hozzáadása offline elmentve, a szinkron feltölti.`,
        })
      } else {
        setBanner({
          kind: 'error',
          text: result.error ?? 'Nem sikerült a hozzárendelés.',
        })
      }
      setAddChildOpen(false)
      setChildSearch('')
      await load()
      void runGyerekSyncManually()
    } catch (err) {
      setBanner({
        kind: 'error',
        text: `Hiba: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setAddingChild(false)
    }
  }

  /** M8.3d — Gyermek eltávolítása a családból */
  async function handleRemoveChild(gyerekId: number, name: string) {
    if (typeof window !== 'undefined') {
      const confirmMsg = `Eltávolítod "${name}" gyermeket a családból?\n\nA tag adatai megmaradnak — csak a család-kapcsolat szűnik meg. Később újra hozzárendelhető.`
      if (!window.confirm(confirmMsg)) return
    }
    setRemovingGyerekId(gyerekId)
    setBanner(null)
    try {
      const result = await removeGyerekFromCsalad(userId, gyerekId)
      if (result.synced) {
        setBanner({ kind: 'success', text: `"${name}" eltávolítva a családból.` })
      } else if (result.queuedToPending) {
        setBanner({
          kind: 'offline',
          text: `"${name}" eltávolítása offline elmentve.`,
        })
      } else {
        setBanner({
          kind: 'error',
          text: result.error ?? 'Nem sikerült az eltávolítás.',
        })
      }
      await load()
      void runGyerekSyncManually()
    } catch (err) {
      setBanner({
        kind: 'error',
        text: `Hiba: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setRemovingGyerekId(null)
    }
  }

  const ferfi_name = formatName(
    detail?.ferfi?.csaladnev ?? null,
    detail?.ferfi?.k_nev ?? null,
    null,
  )
  const no_name = formatName(
    detail?.no?.csaladnev ?? null,
    detail?.no?.k_nev ?? null,
    detail?.no?.ferjk_nev ?? null,
  )
  const headline =
    ferfi_name && no_name
      ? `${ferfi_name} & ${no_name}`
      : ferfi_name || no_name || '(nincs szülő megadva)'

  const totalChildren = detail?.gyermekek?.length ?? 0
  const cimDisplay = detail?.family ? buildCimDisplay(detail.family) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && busyMemberId === null) onClose()
      }}
    >
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,251,250,0.98)_100%)] shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-slate-200/70">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-violet-200/35 blur-3xl" />
          <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-teal-200/30 blur-3xl" />
        </div>

        {/* Bezárás gomb */}
        <button
          type="button"
          onClick={onClose}
          disabled={busyMemberId !== null}
          className="absolute right-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-slate-500 shadow-sm transition hover:text-slate-700 disabled:opacity-50 sm:right-4 sm:top-4"
          aria-label="Bezárás"
        >
          <X className="size-4" />
        </button>

        {/* Fejléc */}
        <div className="relative border-b border-slate-200/70 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="min-w-0 pr-12 sm:pr-14">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
              Családi karton
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]">
                <Users className="size-7" />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  id="family-detail-title"
                  className="font-serif text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]"
                >
                  {loading ? 'Betöltés…' : headline}
                </h2>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {detail?.family ? (
                    detail.family.isaktiv !== 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                        <Check className="size-3.5" />
                        Aktív család
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        <Minus className="size-3.5" />
                        Inaktív család
                      </span>
                    )
                  ) : null}
                  {cimDisplay && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                      <Home className="size-3.5" />
                      {cimDisplay}
                    </span>
                  )}
                  {detail?.family && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                      <MapPin className="size-3.5 text-teal-600" />
                      Család #{detail.family.id}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {detail?.family && (
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                <StatChip label="Szülők" value={`${[detail.ferfi, detail.no].filter(Boolean).length} fő`} />
                <StatChip label="Gyermekek" value={`${totalChildren} fő`} />
                <StatChip label="Család" value={detail.family.isaktiv !== 0 ? 'Aktív' : 'Inaktív'} />
              </div>
            )}
          </div>
        </div>

        {/* Banner */}
        {banner && <DialogBanner banner={banner} />}

        <div className="relative max-h-[calc(92vh-16rem)] space-y-4 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {loading && (
            <div className="py-8 text-center">
              <div className="mx-auto size-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="mt-2 text-sm text-muted-foreground">Adatok betöltése…</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {detail && !loading && !detail.family && (
            <p className="text-sm text-muted-foreground">
              A család nem található a lokális cache-ben. Próbálj frissíteni.
            </p>
          )}

          {detail?.family && (
            <>
              {/* Szülők */}
              <DetailGroup title="Szülők">
                <MemberRow
                  label="Apa"
                  name={ferfi_name}
                  szDatum={detail.ferfi?.sz_datum}
                  kor="ferfi"
                  memberId={detail.ferfi?.id ?? null}
                  csaladfo={detail.ferfi?.csaladfo ?? 0}
                  revision={detail.ferfi?.revision ?? 0}
                  busyMemberId={busyMemberId}
                  onSetCsaladfo={handleSetCsaladfo}
                  kepUrl={detail.ferfi?.kep}
                  onEditAvatar={
                    detail.ferfi
                      ? () => setAvatarEditPerson({ id: detail.ferfi!.id, name: ferfi_name ?? 'Apa', kepUrl: detail.ferfi!.kep, socialUrl: detail.ferfi!.social_profil_url })
                      : undefined
                  }
                />
                <MemberRow
                  label="Anya"
                  name={no_name}
                  szDatum={detail.no?.sz_datum}
                  kor="no"
                  memberId={detail.no?.id ?? null}
                  csaladfo={detail.no?.csaladfo ?? 0}
                  revision={detail.no?.revision ?? 0}
                  busyMemberId={busyMemberId}
                  onSetCsaladfo={handleSetCsaladfo}
                  kepUrl={detail.no?.kep}
                  onEditAvatar={
                    detail.no
                      ? () => setAvatarEditPerson({ id: detail.no!.id, name: no_name ?? 'Anya', kepUrl: detail.no!.kep, socialUrl: detail.no!.social_profil_url })
                      : undefined
                  }
                />
              </DetailGroup>

              {/* Gyermekek */}
              <DetailGroup
                title={`Gyermekek${detail.gyermekek.length > 0 ? ` (${detail.gyermekek.length})` : ''}`}
              >
                {detail.gyermekek.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    Nincs gyermek a családhoz rendelve.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {detail.gyermekek.map((g) => {
                      const name = formatName(g.csaladnev, g.k_nev, null) ?? '(névtelen)'
                      const age = g.sz_datum ? ageFromIso(g.sz_datum) : null
                      const genderLabel = g.ferfi === 1 ? 'fiú' : 'lány'
                      const isCsaladfo = g.csaladfo === 1
                      const isBusyCsaladfo = busyMemberId === g.szemely_id
                      const isRemoving = removingGyerekId === g.id_gyerek
                      const anyBusy =
                        busyMemberId !== null || removingGyerekId !== null || addingChild
                      return (
                        <li
                          key={g.id_gyerek}
                          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                            isCsaladfo ? 'bg-amber-50/60' : 'bg-slate-50/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setAvatarEditPerson({ id: g.szemely_id, name, kepUrl: g.kep, socialUrl: g.social_profil_url })}
                            className="shrink-0 transition hover:scale-105"
                            title="Fénykép társítása"
                          >
                            <MemberAvatar name={name} kepUrl={g.kep} size={28} />
                          </button>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">
                              {name}
                              {isCsaladfo && <CsaladfoBadge />}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {genderLabel}
                              {age !== null && ` · ${age} éves`}
                              {g.sz_datum && ` · szül.: ${formatHuDate(g.sz_datum)}`}
                            </p>
                          </div>
                          {!isCsaladfo && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusyCsaladfo || anyBusy}
                              onClick={() =>
                                handleSetCsaladfo(g.szemely_id, name, g.revision)
                              }
                              className="text-[11px] px-2"
                              title="Ő legyen a család családfője"
                            >
                              <Crown className="mr-1 size-3" />
                              Családfő
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isRemoving || anyBusy}
                            onClick={() => handleRemoveChild(g.id_gyerek, name)}
                            className="text-[11px] px-2 text-rose-700 hover:bg-rose-50"
                            title="Eltávolítás a családból"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* Gyermek-hozzáadás */}
                {congregationId && !addChildOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddChildOpen(true)}
                    disabled={addingChild || busyMemberId !== null || removingGyerekId !== null}
                    className="mt-2 text-[11px]"
                  >
                    <Plus className="mr-1 size-3" />
                    Gyermek hozzáadása a családhoz
                  </Button>
                )}

                {addChildOpen && (
                  <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Search className="size-3.5 text-violet-700" />
                      <span className="text-[11px] font-medium text-violet-900">
                        Gyermek keresése — válassz egy tagot, akit ehhez a családhoz rendelsz
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAddChildOpen(false)
                          setChildSearch('')
                        }}
                        className="ml-auto rounded p-0.5 text-violet-700 hover:bg-violet-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Input
                      autoFocus
                      value={childSearch}
                      onChange={(e) => setChildSearch(e.currentTarget.value)}
                      placeholder="Név alapján…"
                      className="h-8 text-sm"
                    />
                    {childSearchResults.length > 0 ? (
                      <ul className="mt-2 max-h-48 divide-y divide-violet-100 overflow-y-auto rounded-md bg-white">
                        {childSearchResults.map((m) => {
                          const name = formatName(m.csaladnev, m.k_nev, m.ferjk_nev) ?? '(névtelen)'
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => handleAddChild(m.id, name)}
                                disabled={addingChild}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-violet-50 disabled:opacity-50"
                              >
                                <Users className="size-3.5 text-slate-400" />
                                <span>{name}</span>
                                {m.sz_datum && (
                                  <span className="text-[10px] text-muted-foreground">
                                    · {m.sz_datum.slice(0, 4)}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      childSearch.trim() && (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          Nincs találat (a már a családba tartozók ki vannak szűrve).
                        </p>
                      )
                    )}
                  </div>
                )}
              </DetailGroup>

              {/* Cím */}
              <DetailGroup title="Cím">
                <p className="text-sm text-slate-700">
                  {buildCimDisplay(detail.family) || (
                    <span className="italic text-muted-foreground">nincs cím megadva</span>
                  )}
                </p>
              </DetailGroup>

              <p className="text-[10px] italic text-slate-400">
                Revision: {detail.family.revision} · Új család létrehozása és szerkesztés
                a következő frissítésben jön.
              </p>
            </>
          )}
        </div>

        {/* Akciók */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          {congregationId && detail?.family ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={busyMemberId !== null}
            >
              <Pencil className="mr-2 size-4" />
              Szerkesztés
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={onClose} disabled={busyMemberId !== null}>
            Bezárás
          </Button>
        </div>
      </div>

      {/* Szerkesztés dialog */}
      {editOpen && detail?.family && congregationId && (
        <CsaladFormDialog
          mode="edit"
          userId={userId}
          congregationId={congregationId}
          existing={{
            id: detail.family.id,
            id_ferfi: detail.family.id_ferfi,
            id_no: detail.family.id_no,
            c_szam: detail.family.c_szam ?? '—',
            c_tombhaz: detail.family.c_tombhaz,
            c_lepcsohaz: detail.family.c_lepcsohaz,
            c_ajto: detail.family.c_ajto,
            c_emelet: detail.family.c_emelet,
            id_csoport: null,
            isaktiv: detail.family.isaktiv,
            revision: detail.family.revision,
          }}
          onSaved={() => void load()}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* 2026-06-11: fénykép + közösségi link szerkesztő (online művelet) */}
      {avatarEditPerson && congregationId && (
        <Dialog open onOpenChange={(o) => { if (!o) setAvatarEditPerson(null) }}>
          <DialogContent className="z-[70] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Fénykép és közösségi kapcsolat</DialogTitle>
            </DialogHeader>
            <AvatarEditorBody
              personName={avatarEditPerson.name}
              currentKepUrl={avatarEditPerson.kepUrl}
              currentSocialUrl={avatarEditPerson.socialUrl}
              onFetchFromSocial={(url) => fetchSocialAvatarImageDesktop(url)}
              onSave={(params) => saveMemberAvatarDesktop(avatarEditPerson.id, congregationId, params)}
              onSaved={() => {
                setAvatarEditPerson(null)
                void load()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-komponensek
// ─────────────────────────────────────────────────────────────────────────

function DialogBanner({ banner }: { banner: NonNullable<Banner> }) {
  const style: Record<NonNullable<Banner>['kind'], string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    conflict: 'border-amber-200 bg-amber-50 text-amber-900',
    offline: 'border-sky-200 bg-sky-50 text-sky-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }
  return (
    <div
      role="alert"
      className={`mx-5 mt-4 rounded-md border px-3 py-2 text-sm ${style[banner.kind]}`}
    >
      {banner.text}
    </div>
  )
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function MemberRow({
  label,
  name,
  szDatum,
  kor,
  memberId,
  csaladfo,
  revision,
  busyMemberId,
  onSetCsaladfo,
  kepUrl,
  onEditAvatar,
}: {
  label: string
  name: string | null
  szDatum: string | null | undefined
  kor: 'ferfi' | 'no'
  memberId: number | null
  csaladfo: number
  revision: number
  busyMemberId: number | null
  onSetCsaladfo: (id: number, name: string, revision: number) => void
  /** 2026-06-11: avatar + szerkesztő. */
  kepUrl?: string | null
  onEditAvatar?: () => void
}) {
  const age = szDatum ? ageFromIso(szDatum) : null
  const isCsaladfo = csaladfo === 1
  const isBusy = memberId !== null && busyMemberId === memberId
  const canAssign = memberId !== null && name !== null && !isCsaladfo

  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2 ${
        isCsaladfo ? 'bg-amber-50/60' : 'bg-slate-50/50'
      }`}
    >
      <div className="relative shrink-0">
        <MemberAvatar name={name ?? (kor === 'ferfi' ? 'Apa' : 'Anya')} kepUrl={kepUrl} size={36} />
        {onEditAvatar && name && (
          <button
            type="button"
            onClick={onEditAvatar}
            className="absolute -bottom-1 -right-1 inline-flex size-4.5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:scale-110 hover:text-violet-600"
            style={{ width: 18, height: 18 }}
            title="Fénykép társítása"
            aria-label="Fénykép társítása"
          >
            <Camera className="size-2.5" />
          </button>
        )}
      </div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">
          {name ?? <span className="italic text-muted-foreground">nincs megadva</span>}
          {age !== null && name && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {age} éves
            </span>
          )}
          {isCsaladfo && <CsaladfoBadge />}
        </p>
      </div>
      {canAssign && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy || busyMemberId !== null}
          onClick={() => memberId !== null && name !== null && onSetCsaladfo(memberId, name, revision)}
          className="text-[11px] px-2"
          title="Ő legyen a család családfője"
        >
          <Crown className="mr-1 size-3" />
          Családfő
        </Button>
      )}
    </div>
  )
}

function CsaladfoBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
      <Crown className="size-3" />
      Családfő
    </span>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] bg-white/85 px-3 py-2 shadow-[0_14px_28px_-22px_rgba(15,74,66,0.35)] ring-1 ring-white/70">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek
// ─────────────────────────────────────────────────────────────────────────

function formatName(
  csaladnev: string | null,
  k_nev: string | null,
  ferjk_nev: string | null,
): string | null {
  const last = ferjk_nev || csaladnev || ''
  const first = k_nev || ''
  const combined = [last, first].filter(Boolean).join(' ')
  return combined || null
}

function ageFromIso(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

function formatHuDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`
}

function buildCimDisplay(family: {
  c_szam: string | null
  c_tombhaz: string | null
  c_lepcsohaz: string | null
  c_emelet: string | null
  c_ajto: string | null
}): string | null {
  const bits: string[] = []
  if (family.c_szam?.trim()) bits.push(family.c_szam.trim())
  if (family.c_tombhaz?.trim()) bits.push(`tömb ${family.c_tombhaz.trim()}`)
  if (family.c_lepcsohaz?.trim()) bits.push(`lh. ${family.c_lepcsohaz.trim()}`)
  if (family.c_emelet?.trim()) bits.push(`em. ${family.c_emelet.trim()}`)
  if (family.c_ajto?.trim()) bits.push(`ajtó ${family.c_ajto.trim()}`)
  return bits.length > 0 ? bits.join(', ') : null
}
