/**
 * CsaladFormDialog — M8.3c (2026-04-24).
 *
 * Közös dialog új család létrehozásához és meglévő szerkesztéséhez.
 * A mode propja alapján eldöntjük, mely flow-t használjuk:
 *   - `mode: 'create'` → új család; a szülőket a meglévő `szemely_local`
 *     listából kereshető-választhatóan jelöljük ki
 *   - `mode: 'edit'` → meglévő család szerkesztése; ugyanazok a mezők
 *     előre kitöltve
 *
 * UX:
 *   - Szülő-kijelölés egy Popup-listával vagy egy debounced search-el —
 *     V1-ben egyszerű szöveges input + lista (hasonló a member-create
 *     CNP-search-éhez)
 *   - Kötelező: legalább apa VAGY anya ki van választva
 *   - Cím: `c_szam` + opcionális tömbház / lépcsőház / emelet / ajtó
 *   - Isaktiv: toggle (default aktív)
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Home, Search, Users, X } from 'lucide-react'

import { Button, Input, Label } from '@kartoteka/ui'
import {
  csaladCreateInputSchema,
  csaladUpdateInputSchema,
  normalizeCsaladPayload,
  type CsaladCreateInput,
  type CsaladUpdateInput,
} from '@kartoteka/validations'

import { createCsaladEntry, updateCsaladEntry } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface CsaladFormDialogProps {
  mode: 'create' | 'edit'
  userId: string
  congregationId: string
  /** edit mode-ban a meglévő család adatai */
  existing?: {
    id: number
    id_ferfi: number | null
    id_no: number | null
    c_szam: string
    c_tombhaz: string | null
    c_lepcsohaz: string | null
    c_ajto: string | null
    c_emelet: string | null
    id_csoport: number | null
    isaktiv: number
    revision: number
  }
  onSaved?: () => void
  onClose: () => void
}

type FormFields = {
  id_ferfi: number | null
  ferfi_display: string
  id_no: number | null
  no_display: string
  c_szam: string
  c_tombhaz: string
  c_lepcsohaz: string
  c_emelet: string
  c_ajto: string
  isaktiv: '0' | '1'
}

type Banner =
  | { kind: 'success'; text: string }
  | { kind: 'offline'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'error'; text: string }
  | null

type MemberChoice = {
  id: number
  csaladnev: string | null
  k_nev: string | null
  ferjk_nev: string | null
  ferfi: number
  sz_datum: string | null
}

export function CsaladFormDialog({
  mode,
  userId,
  congregationId,
  existing,
  onSaved,
  onClose,
}: CsaladFormDialogProps) {
  const [form, setForm] = useState<FormFields>(() => buildInitial(existing))
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)

  // Kereső state
  const [searchFor, setSearchFor] = useState<'ferfi' | 'no' | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<MemberChoice[]>([])

  // Edit-mode: a szülő-név megjelenítéséhez a `buildInitial` a `#<id>`
  // placeholder-t adja. A teljes név V1-ben nem töltődik előre; a user
  // a „Törlés" gombbal módosíthatja a kijelölést és új tagot választhat
  // a keresővel. Későbbi polish: direkt `findSzemelyById` a backend-en.

  // Debounced keresés (300 ms)
  useEffect(() => {
    if (searchFor === null) {
      setSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const list = await getTauriSqliteBackend().listLocalSzemely({
          congregationId,
          search: searchTerm.trim() || undefined,
          statusFilter: 'aktiv',
          orderBy: 'csaladnev-asc',
          limit: 20,
        })
        // Nem-megfelelő nem-szűrés: ha ferfi-t keres, csak férfiak; ha no-t, csak nők
        const filtered =
          searchFor === 'ferfi'
            ? list.filter((m) => m.ferfi === 1)
            : list.filter((m) => m.ferfi === 0)
        setSearchResults(filtered.slice(0, 10))
      } catch {
        setSearchResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [searchFor, searchTerm, congregationId])

  function selectMember(m: MemberChoice) {
    const name = formatName(m.csaladnev, m.k_nev, m.ferjk_nev) ?? '(névtelen)'
    if (searchFor === 'ferfi') {
      setForm((f) => ({ ...f, id_ferfi: m.id, ferfi_display: name }))
    } else if (searchFor === 'no') {
      setForm((f) => ({ ...f, id_no: m.id, no_display: name }))
    }
    setSearchFor(null)
    setSearchTerm('')
    setSearchResults([])
  }

  function clearParent(who: 'ferfi' | 'no') {
    if (who === 'ferfi') {
      setForm((f) => ({ ...f, id_ferfi: null, ferfi_display: '' }))
    } else {
      setForm((f) => ({ ...f, id_no: null, no_display: '' }))
    }
  }

  const canSubmit = useMemo(() => {
    if (mode === 'create' && form.id_ferfi === null && form.id_no === null) {
      return false
    }
    return true
  }, [mode, form])

  async function handleSave() {
    setSaving(true)
    setBanner(null)
    try {
      if (mode === 'create') {
        // Zod validáció
        const input: CsaladCreateInput = {
          id_ferfi: form.id_ferfi,
          id_no: form.id_no,
          c_szam: form.c_szam || '—',
          c_tombhaz: form.c_tombhaz || null,
          c_lepcsohaz: form.c_lepcsohaz || null,
          c_emelet: form.c_emelet || null,
          c_ajto: form.c_ajto || null,
          id_csoport: null,
          isaktiv: form.isaktiv === '1',
        }
        const parsed = csaladCreateInputSchema.safeParse(input)
        if (!parsed.success) {
          setBanner({
            kind: 'error',
            text: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.',
          })
          return
        }
        const normalized = normalizeCsaladPayload(
          parsed.data as Record<string, unknown>,
        )
        const result = await createCsaladEntry(userId, {
          id_ferfi: (normalized.id_ferfi as number | null) ?? null,
          id_no: (normalized.id_no as number | null) ?? null,
          c_szam: (normalized.c_szam as string) ?? '—',
          c_tombhaz: (normalized.c_tombhaz as string | null) ?? null,
          c_lepcsohaz: (normalized.c_lepcsohaz as string | null) ?? null,
          c_ajto: (normalized.c_ajto as string | null) ?? null,
          c_emelet: (normalized.c_emelet as string | null) ?? null,
          id_csoport: (normalized.id_csoport as number | null) ?? null,
          isaktiv: Boolean(normalized.isaktiv),
        })
        if (result.synced) {
          setBanner({
            kind: 'success',
            text: `Új család létrehozva — azonosító: ${result.serverId}`,
          })
          onSaved?.()
          setTimeout(() => onClose(), 1200)
        } else if (result.pending) {
          setBanner({
            kind: 'offline',
            text: 'Offline módban elmentve. A szinkron feltölti, amint online leszel.',
          })
          onSaved?.()
          setTimeout(() => onClose(), 1500)
        } else {
          setBanner({
            kind: 'error',
            text: result.error ?? 'Ismeretlen hiba a mentéskor.',
          })
        }
      } else {
        // Edit mode
        if (!existing) return
        const patch: CsaladUpdateInput = {
          id_ferfi: form.id_ferfi,
          id_no: form.id_no,
          c_szam: form.c_szam || '—',
          c_tombhaz: form.c_tombhaz || null,
          c_lepcsohaz: form.c_lepcsohaz || null,
          c_emelet: form.c_emelet || null,
          c_ajto: form.c_ajto || null,
          isaktiv: form.isaktiv === '1',
        }
        const parsed = csaladUpdateInputSchema.safeParse(patch)
        if (!parsed.success) {
          setBanner({
            kind: 'error',
            text: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.',
          })
          return
        }
        const normalized = normalizeCsaladPayload(
          parsed.data as Record<string, unknown>,
        )
        const result = await updateCsaladEntry(
          userId,
          existing.id,
          normalized,
          existing.revision,
        )
        if (result.synced) {
          setBanner({ kind: 'success', text: 'A család adatai frissítve.' })
          onSaved?.()
          setTimeout(() => onClose(), 1000)
        } else if (result.conflict) {
          setBanner({
            kind: 'conflict',
            text:
              'Más eszközről módosították időközben. Zárd be és frissítsd a listát, ' +
              'majd próbáld újra.',
          })
        } else if (result.queuedToPending) {
          setBanner({
            kind: 'offline',
            text: 'Offline módban elmentve. Szinkron a következő online-menetben.',
          })
          onSaved?.()
          setTimeout(() => onClose(), 1500)
        } else {
          setBanner({
            kind: 'error',
            text: result.error ?? 'Nem sikerült a mentés.',
          })
        }
      }
    } catch (err) {
      setBanner({
        kind: 'error',
        text: `Hiba: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900">
            <Home className="size-6 text-violet-700" />
            {mode === 'create' ? 'Új család rögzítése' : 'Család szerkesztése'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        {banner && <DialogBanner banner={banner} />}

        <div className="space-y-4 p-5">
          {/* Szülők választása */}
          <Section title="Szülők (legalább az egyik kötelező)">
            <ParentPicker
              label="Apa"
              displayName={form.ferfi_display}
              selected={form.id_ferfi !== null}
              onOpenSearch={() => {
                setSearchFor('ferfi')
                setSearchTerm('')
              }}
              onClear={() => clearParent('ferfi')}
              disabled={saving}
            />
            <ParentPicker
              label="Anya"
              displayName={form.no_display}
              selected={form.id_no !== null}
              onOpenSearch={() => {
                setSearchFor('no')
                setSearchTerm('')
              }}
              onClear={() => clearParent('no')}
              disabled={saving}
            />
          </Section>

          {/* Kereső */}
          {searchFor !== null && (
            <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Search className="size-4 text-violet-700" />
                <span className="text-xs font-medium text-violet-900">
                  {searchFor === 'ferfi' ? 'Apa keresése' : 'Anya keresése'} — válassz a
                  lenti listából
                </span>
                <button
                  type="button"
                  onClick={() => setSearchFor(null)}
                  className="ml-auto rounded p-0.5 text-violet-700 hover:bg-violet-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder="Név vagy cím alapján…"
                className="h-8 text-sm"
              />
              {searchResults.length > 0 ? (
                <ul className="mt-2 max-h-48 divide-y divide-violet-100 overflow-y-auto rounded-md bg-white">
                  {searchResults.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => selectMember(m)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-violet-50"
                      >
                        <Users className="size-3.5 text-slate-400" />
                        <span>{formatName(m.csaladnev, m.k_nev, m.ferjk_nev)}</span>
                        {m.sz_datum && (
                          <span className="text-[10px] text-muted-foreground">
                            · {m.sz_datum.slice(0, 4)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                searchTerm.trim() && (
                  <p className="mt-2 text-[11px] italic text-muted-foreground">
                    Nincs találat. Ellenőrizd az elnevezést, vagy vegyél fel új tagot először.
                  </p>
                )
              )}
            </div>
          )}

          {/* Cím */}
          <Section title="Cím">
            <FormRow label="Házszám (kötelező)">
              <Input
                value={form.c_szam}
                onChange={(e) => setForm({ ...form, c_szam: e.currentTarget.value })}
                disabled={saving}
                className="h-8 text-sm"
                placeholder="pl. 12 vagy —"
              />
            </FormRow>
            <div className="grid grid-cols-2 gap-2">
              <FormRowCompact label="Tömbház">
                <Input
                  value={form.c_tombhaz}
                  onChange={(e) => setForm({ ...form, c_tombhaz: e.currentTarget.value })}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </FormRowCompact>
              <FormRowCompact label="Lépcsőház">
                <Input
                  value={form.c_lepcsohaz}
                  onChange={(e) =>
                    setForm({ ...form, c_lepcsohaz: e.currentTarget.value })
                  }
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </FormRowCompact>
              <FormRowCompact label="Emelet">
                <Input
                  value={form.c_emelet}
                  onChange={(e) => setForm({ ...form, c_emelet: e.currentTarget.value })}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </FormRowCompact>
              <FormRowCompact label="Ajtó">
                <Input
                  value={form.c_ajto}
                  onChange={(e) => setForm({ ...form, c_ajto: e.currentTarget.value })}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </FormRowCompact>
            </div>
          </Section>

          {/* Státusz */}
          <Section title="Státusz">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isaktiv === '1'}
                onChange={(e) =>
                  setForm({ ...form, isaktiv: e.currentTarget.checked ? '1' : '0' })
                }
                disabled={saving}
                className="size-4 accent-violet-600"
              />
              Aktív család (látszik a default listán)
            </label>
          </Section>
        </div>

        {/* Akciók */}
        <div className="flex justify-between gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Mégse
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSubmit}
            className="bg-violet-700 text-white hover:bg-violet-800"
          >
            <Check className="mr-2 size-4" />
            {saving ? 'Mentés…' : mode === 'create' ? 'Létrehozás' : 'Mentés'}
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
    offline: 'border-sky-200 bg-sky-50 text-sky-900',
    conflict: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }
  const icon =
    banner.kind === 'error' || banner.kind === 'conflict' ? (
      <AlertCircle className="size-4 shrink-0" />
    ) : (
      <Check className="size-4 shrink-0" />
    )
  return (
    <div
      role="alert"
      className={`mx-5 mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${style[banner.kind]}`}
    >
      {icon}
      <span>{banner.text}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <Label className="col-span-1 text-xs text-slate-500">{label}</Label>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

function FormRowCompact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-slate-500">{label}</Label>
      {children}
    </div>
  )
}

function ParentPicker({
  label,
  displayName,
  selected,
  onOpenSearch,
  onClear,
  disabled,
}: {
  label: string
  displayName: string
  selected: boolean
  onOpenSearch: () => void
  onClear: () => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <Label className="col-span-1 text-xs text-slate-500">{label}</Label>
      <div className="col-span-2 flex items-center gap-2">
        {selected ? (
          <>
            <span className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
              {displayName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={disabled}
            >
              Törlés
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={onOpenSearch}
            disabled={disabled}
            className="flex-1 justify-start text-sm text-muted-foreground"
          >
            <Search className="mr-2 size-3.5" />
            Tag kiválasztása…
          </Button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek
// ─────────────────────────────────────────────────────────────────────────

function buildInitial(
  existing: CsaladFormDialogProps['existing'] | undefined,
): FormFields {
  if (!existing) {
    return {
      id_ferfi: null,
      ferfi_display: '',
      id_no: null,
      no_display: '',
      c_szam: '—',
      c_tombhaz: '',
      c_lepcsohaz: '',
      c_emelet: '',
      c_ajto: '',
      isaktiv: '1',
    }
  }
  return {
    id_ferfi: existing.id_ferfi,
    ferfi_display: existing.id_ferfi !== null ? `#${existing.id_ferfi}` : '',
    id_no: existing.id_no,
    no_display: existing.id_no !== null ? `#${existing.id_no}` : '',
    c_szam: existing.c_szam || '—',
    c_tombhaz: existing.c_tombhaz ?? '',
    c_lepcsohaz: existing.c_lepcsohaz ?? '',
    c_emelet: existing.c_emelet ?? '',
    c_ajto: existing.c_ajto ?? '',
    isaktiv: existing.isaktiv === 1 ? '1' : '0',
  }
}

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
