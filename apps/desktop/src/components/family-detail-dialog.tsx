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
import { Crown, Home, Users, X } from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { updateSzemelyEntry } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface FamilyDetailDialogProps {
  userId: string
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

export function FamilyDetailDialog({ userId, familyId, onClose }: FamilyDetailDialogProps) {
  const [detail, setDetail] = useState<FamilyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  const [banner, setBanner] = useState<Banner>(null)

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && busyMemberId === null) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div>
            <h2
              id="family-detail-title"
              className="flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900"
            >
              <Home className="size-6 text-violet-700" />
              {loading ? 'Betöltés…' : headline}
            </h2>
            {detail?.family && (
              <p className="mt-0.5 text-xs text-slate-500">
                Család-azonosító: #{detail.family.id}
                {detail.family.isaktiv === 0 && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                    inaktív
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busyMemberId !== null}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Banner */}
        {banner && <DialogBanner banner={banner} />}

        <div className="space-y-4 p-5">
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
                      const isBusy = busyMemberId === g.szemely_id
                      return (
                        <li
                          key={g.id_gyerek}
                          className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm ${
                            isCsaladfo ? 'bg-amber-50/60' : 'bg-slate-50/50'
                          }`}
                        >
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                              g.ferfi === 1
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-pink-100 text-pink-800'
                            }`}
                          >
                            <Users className="size-3.5" />
                          </div>
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
                              disabled={isBusy || busyMemberId !== null}
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
                        </li>
                      )
                    })}
                  </ul>
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
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          <Button type="button" onClick={onClose} disabled={busyMemberId !== null}>
            Bezárás
          </Button>
        </div>
      </div>
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
}) {
  const color = kor === 'ferfi' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
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
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${color}`}>
        {kor === 'ferfi' ? '♂' : '♀'}
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
