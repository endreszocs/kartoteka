/**
 * FamilyDetailDialog — M8.3a read-only (2026-04-24).
 *
 * Egy család részleteit mutatja: férfi + nő (szülők) + gyerekek listája.
 * A `TauriSqliteBackend.getLocalCsaladDetail(familyId)`-t hívja, ami
 * join-olja a `szemely_local`-hez a neveket és adatokat.
 *
 * A későbbi M8.3b/c-ben jön:
 *   - "Családfő kijelölése" (szemely.csaladfo flag toggle)
 *   - "Tag áthelyezése" (szemely.family_id változtatás)
 *   - "Új gyermek hozzáadása" (gyerek insert)
 *   - "Család szerkesztése" (id_ferfi, id_no, cím)
 */

import { useEffect, useState } from 'react'
import { Home, Users, X } from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface FamilyDetailDialogProps {
  familyId: number
  onClose: () => void
}

type FamilyDetail = Awaited<
  ReturnType<ReturnType<typeof getTauriSqliteBackend>['getLocalCsaladDetail']>
>

export function FamilyDetailDialog({ familyId, onClose }: FamilyDetailDialogProps) {
  const [detail, setDetail] = useState<FamilyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getTauriSqliteBackend().getLocalCsaladDetail(familyId)
        if (mounted) setDetail(data)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [familyId])

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
        if (e.target === e.currentTarget) onClose()
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
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

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
                <ParentRow
                  label="Apa"
                  name={ferfi_name}
                  szDatum={detail.ferfi?.sz_datum}
                  kor="ferfi"
                />
                <ParentRow
                  label="Anya"
                  name={no_name}
                  szDatum={detail.no?.sz_datum}
                  kor="no"
                />
              </DetailGroup>

              {/* Gyerekek */}
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
                      return (
                        <li
                          key={g.id_gyerek}
                          className="flex items-center gap-3 rounded-md bg-slate-50/50 px-3 py-1.5 text-sm"
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
                            <p className="font-medium text-slate-900">{name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {genderLabel}
                              {age !== null && ` · ${age} éves`}
                              {g.sz_datum && ` · szül.: ${formatHuDate(g.sz_datum)}`}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </DetailGroup>

              {/* Cím */}
              <DetailGroup title="Cím">
                <p className="text-sm text-slate-700">
                  {buildCimDisplay(detail.family) || <span className="italic text-muted-foreground">nincs cím megadva</span>}
                </p>
              </DetailGroup>

              <p className="text-[10px] italic text-slate-400">
                Revision: {detail.family.revision} · A szerkesztési funkció a következő
                frissítésben jön.
              </p>
            </>
          )}
        </div>

        {/* Akciók */}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          <Button type="button" onClick={onClose}>
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

function ParentRow({
  label,
  name,
  szDatum,
  kor,
}: {
  label: string
  name: string | null
  szDatum: string | null | undefined
  kor: 'ferfi' | 'no'
}) {
  const color = kor === 'ferfi' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
  const age = szDatum ? ageFromIso(szDatum) : null

  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50/50 px-3 py-2">
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
        </p>
      </div>
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
