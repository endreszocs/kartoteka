/**
 * MemberDetailDialog — M8.0a (read-only) + M8.0b (edit-mode) (2026-04-24).
 *
 * Két állapot:
 *   - 'view': read-only tag-portré, csoportos megjelenítés (eredeti M8.0a)
 *   - 'edit': inline szerkesztő form a `szemely_local` / Supabase `szemely`
 *     írásához. A write-back az `updateSzemelyEntry` sync-helper-en megy,
 *     ami optimistic-local UPDATE + online conditional-revision UPDATE +
 *     outbox-fallback offline módban (M8.0c write-offline ugyanezen a síkon).
 *
 * UX-elvek (feedback_modal_design_system, feedback_lelkesz_informalas):
 *   - Serif cím, csoportos szekciók, pasztorális feedback-sávok
 *   - Konfliktus esetén világos magyar üzenet (`másik eszközről módosították`)
 *   - Offline esetén zöld banner: `sync-re váró` jelzéssel
 *   - A kevésbé érzékeny mezők szerkeszthetők (név, cím, kontakt, identitás);
 *     az admin-jellegű mezők (meghalt, member_status, voter_eligible) disabled
 *     — azokhoz külön admin UI jön későbbi körben
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Pencil, X } from 'lucide-react'

import { Button, Input, Label } from '@kartoteka/ui'
import {
  normalizeSzemelyPatch,
  szemelyUpdateInputSchema,
  type SzemelyListRow,
  type SzemelyUpdateInput,
} from '@kartoteka/validations'

import { updateSzemelyEntry } from '../lib/sync'

interface MemberDetailDialogProps {
  member: SzemelyListRow
  /** A szerkesztés után a parent hívja meg a lista-újratöltést. */
  onSaved?: () => void
  /** Bezárás callback. */
  onClose: () => void
  /** A bejelentkezett felhasználó id-je — a sync-helper-hez kell (pull-hoz). */
  userId: string
  /** Az aktuális szerver-revision (a szemely_local.revision mezőből olvasva). */
  currentRevision: number
}

type Mode = 'view' | 'edit'

type Banner =
  | { kind: 'success'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'offline'; text: string }
  | { kind: 'error'; text: string }
  | null

export function MemberDetailDialog({
  member: m,
  onSaved,
  onClose,
  userId,
  currentRevision,
}: MemberDetailDialogProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [form, setForm] = useState<EditableFields>(() => extractEditable(m))
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)

  // A tag-referencia változhat (pl. lista-refresh után); ha változik, reset.
  useEffect(() => {
    setForm(extractEditable(m))
    setBanner(null)
    // view-mode-ba állítunk vissza, ha a parent más tagot küld
    setMode('view')
  }, [m])

  const fullName = useMemo(() => formatFullName(m), [m])
  const age = m.sz_datum ? ageFromIso(m.sz_datum) : null

  async function handleSave() {
    setSaving(true)
    setBanner(null)

    // 1. Csak a változott mezőket küldjük el
    const patch = buildPatch(m, form)
    if (Object.keys(patch).length === 0) {
      setBanner({ kind: 'success', text: 'Nincs változás a mentéshez.' })
      setSaving(false)
      setTimeout(() => setMode('view'), 600)
      return
    }

    // 2. Zod-validáció — kliens-oldali early-fail
    const parsed = szemelyUpdateInputSchema.safeParse(patch)
    if (!parsed.success) {
      const firstMsg = parsed.error.issues[0]?.message ?? 'Érvénytelen adat.'
      setBanner({ kind: 'error', text: firstMsg })
      setSaving(false)
      return
    }

    // 3. Normalizálás (üres string → null) + sync
    const normalized = normalizeSzemelyPatch(parsed.data as SzemelyUpdateInput)
    try {
      const result = await updateSzemelyEntry(userId, m.id, normalized, currentRevision)
      if (result.conflict) {
        // Tudatosan NEM hívjuk meg az onSaved-et — különben a parent lista-
        // refresh-ül, új member-objektum érkezik props-ban, és a
        // useEffect[m] reseteli a form-ot → a lelkész elveszíti a félig
        // megírt változtatásait. Inkább a Mégse (Cancel) gombra bízzuk.
        setBanner({
          kind: 'conflict',
          text:
            'Más eszközről módosították ezt a tagot időközben. ' +
            'A „Mégse" gombbal visszaállíthatod a szerver-verziót, vagy ' +
            'újragondolhatod a saját változtatásaidat és újra próbálhatod.',
        })
      } else if (result.queuedToOutbox) {
        setBanner({
          kind: 'offline',
          text: 'Elmentettem offline-ban. A szinkron a következő online-menetben küldi fel.',
        })
        onSaved?.()
        setTimeout(() => setMode('view'), 1500)
      } else {
        setBanner({ kind: 'success', text: 'A változás mentve.' })
        onSaved?.()
        setTimeout(() => setMode('view'), 800)
      }
    } catch (err: unknown) {
      setBanner({
        kind: 'error',
        text: `Hiba mentéskor: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setForm(extractEditable(m))
    setBanner(null)
    setMode('view')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && mode === 'view') onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div>
            <h2
              id="member-detail-title"
              className="font-serif text-2xl font-semibold text-slate-900"
            >
              {fullName}
              {m.meghalt === 1 && <span className="ml-2 text-base text-slate-500">†</span>}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              CNP: <span className="font-mono">{m.cnp}</span>
              {age !== null && <span className="ml-2">· {age} éves</span>}
              {m.allapot && <span className="ml-2">· {m.allapot}</span>}
              {m.csaladfo === 1 && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                  családfő
                </span>
              )}
              {m.voter_eligible === 1 && (
                <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                  választó
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Bezárás"
            disabled={saving}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Banner */}
        {banner && <DialogBanner banner={banner} />}

        {/* Tartalom */}
        <div className="space-y-4 p-5">
          {mode === 'view' ? (
            <ViewBody member={m} />
          ) : (
            <EditBody form={form} setForm={setForm} disabled={saving} />
          )}

          {m.megjegyzes && mode === 'view' && (
            <DetailGroup title="Megjegyzés">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{m.megjegyzes}</p>
            </DetailGroup>
          )}

          <p className="text-[10px] italic text-slate-400">
            Utolsó frissítés a szerverről: {formatHuDateTime(m.updated_at)}
            {' · '}Revision: {currentRevision}
          </p>
        </div>

        {/* Akciók */}
        <div className="flex justify-between gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          {mode === 'view' ? (
            <>
              <Button type="button" variant="outline" onClick={() => setMode('edit')}>
                <Pencil className="mr-2 size-4" />
                Szerkesztés
              </Button>
              <Button type="button" onClick={onClose}>
                Bezárás
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                Mégse
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                <Check className="mr-2 size-4" />
                {saving ? 'Mentés…' : 'Mentés'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Read-only body
// ─────────────────────────────────────────────────────────────────────────

function ViewBody({ member: m }: { member: SzemelyListRow }) {
  return (
    <>
      <DetailGroup title="Személyes adatok">
        <DetailRow label="Keresztnév" value={m.k_nev} />
        <DetailRow label="Családnév" value={m.csaladnev} />
        <DetailRow label="Születési családnév" value={m.szcs_nev} />
        {m.ferfi === 0 && <DetailRow label="Férjezett név" value={m.ferjk_nev} />}
        <DetailRow label="Nem" value={m.ferfi === 1 ? 'férfi' : 'nő'} />
        <DetailRow label="Születési dátum" value={formatHuDate(m.sz_datum)} />
        <DetailRow label="Családi állapot" value={m.allapot} />
        <DetailRow label="Member status" value={m.member_status} />
      </DetailGroup>

      <DetailGroup title="Származás">
        <DetailRow label="Apa neve" value={m.apjaneve} />
        <DetailRow label="Anya neve" value={m.anyjaneve} />
      </DetailGroup>

      <DetailGroup title="Cím">
        <DetailRow label="Teljes cím" value={m.c_szcim} />
        <DetailRow label="Házszám" value={m.c_szam} />
        <DetailRow label="Tömbház" value={m.c_tombhaz} />
        <DetailRow label="Lépcsőház" value={m.c_lepcsohaz} />
        <DetailRow label="Emelet" value={m.c_emelet} />
        <DetailRow label="Ajtó" value={m.c_ajto} />
      </DetailGroup>

      <DetailGroup title="Elérhetőség">
        <DetailRow label="Telefon" value={m.telefon} mono />
        <DetailRow label="E-mail" value={m.email} />
      </DetailGroup>

      <DetailGroup title="Identitás">
        <DetailRow label="Vallás" value={m.vallas} />
        <DetailRow label="Foglalkozás" value={m.foglalkozas} />
        <DetailRow label="Nemzetiség" value={m.nemzetiseg} />
      </DetailGroup>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Edit body (inline form)
// ─────────────────────────────────────────────────────────────────────────

type EditableFields = {
  k_nev: string
  csaladnev: string
  szcs_nev: string
  ferjk_nev: string
  allapot: string
  sz_datum: string
  apjaneve: string
  anyjaneve: string
  c_szcim: string
  c_szam: string
  c_tombhaz: string
  c_lepcsohaz: string
  c_emelet: string
  c_ajto: string
  telefon: string
  email: string
  vallas: string
  foglalkozas: string
  nemzetiseg: string
  megjegyzes: string
}

function EditBody({
  form,
  setForm,
  disabled,
}: {
  form: EditableFields
  setForm: (f: EditableFields) => void
  disabled: boolean
}) {
  function upd<K extends keyof EditableFields>(key: K, value: string) {
    setForm({ ...form, [key]: value })
  }

  return (
    <>
      <EditGroup title="Személyes adatok">
        <EditField label="Keresztnév" id="k_nev" value={form.k_nev} onChange={(v) => upd('k_nev', v)} disabled={disabled} />
        <EditField label="Családnév" id="csaladnev" value={form.csaladnev} onChange={(v) => upd('csaladnev', v)} disabled={disabled} />
        <EditField label="Születési családnév" id="szcs_nev" value={form.szcs_nev} onChange={(v) => upd('szcs_nev', v)} disabled={disabled} />
        <EditField label="Férjezett név" id="ferjk_nev" value={form.ferjk_nev} onChange={(v) => upd('ferjk_nev', v)} disabled={disabled} />
        <EditField label="Születési dátum" id="sz_datum" type="date" value={form.sz_datum} onChange={(v) => upd('sz_datum', v)} disabled={disabled} />
        <EditField label="Családi állapot" id="allapot" value={form.allapot} onChange={(v) => upd('allapot', v)} disabled={disabled} placeholder="pl. nőtlen, házas, özvegy…" />
      </EditGroup>

      <EditGroup title="Származás">
        <EditField label="Apa neve" id="apjaneve" value={form.apjaneve} onChange={(v) => upd('apjaneve', v)} disabled={disabled} />
        <EditField label="Anya neve" id="anyjaneve" value={form.anyjaneve} onChange={(v) => upd('anyjaneve', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Cím">
        <EditField label="Teljes cím" id="c_szcim" value={form.c_szcim} onChange={(v) => upd('c_szcim', v)} disabled={disabled} placeholder="utca, helység, irányítószám" />
        <div className="grid grid-cols-2 gap-2">
          <EditField label="Házszám" id="c_szam" value={form.c_szam} onChange={(v) => upd('c_szam', v)} disabled={disabled} compact />
          <EditField label="Tömbház" id="c_tombhaz" value={form.c_tombhaz} onChange={(v) => upd('c_tombhaz', v)} disabled={disabled} compact />
          <EditField label="Lépcsőház" id="c_lepcsohaz" value={form.c_lepcsohaz} onChange={(v) => upd('c_lepcsohaz', v)} disabled={disabled} compact />
          <EditField label="Emelet" id="c_emelet" value={form.c_emelet} onChange={(v) => upd('c_emelet', v)} disabled={disabled} compact />
          <EditField label="Ajtó" id="c_ajto" value={form.c_ajto} onChange={(v) => upd('c_ajto', v)} disabled={disabled} compact />
        </div>
      </EditGroup>

      <EditGroup title="Elérhetőség">
        <EditField label="Telefon" id="telefon" value={form.telefon} onChange={(v) => upd('telefon', v)} disabled={disabled} placeholder="+40 …" />
        <EditField label="E-mail" id="email" type="email" value={form.email} onChange={(v) => upd('email', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Identitás">
        <EditField label="Vallás" id="vallas" value={form.vallas} onChange={(v) => upd('vallas', v)} disabled={disabled} />
        <EditField label="Foglalkozás" id="foglalkozas" value={form.foglalkozas} onChange={(v) => upd('foglalkozas', v)} disabled={disabled} />
        <EditField label="Nemzetiség" id="nemzetiseg" value={form.nemzetiseg} onChange={(v) => upd('nemzetiseg', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Megjegyzés">
        <textarea
          id="megjegyzes"
          value={form.megjegyzes}
          onChange={(e) => upd('megjegyzes', e.currentTarget.value)}
          disabled={disabled}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </EditGroup>
    </>
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
  const icon =
    banner.kind === 'conflict' || banner.kind === 'error' ? (
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

function EditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  if (!value) return null
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="col-span-1 text-xs text-slate-500">{label}</span>
      <span className={`col-span-2 ${mono ? 'font-mono text-xs' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  )
}

function EditField({
  label,
  id,
  value,
  onChange,
  type,
  placeholder,
  disabled,
  compact,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'date'
  placeholder?: string
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1' : 'grid grid-cols-3 items-center gap-2'}>
      <Label htmlFor={id} className={compact ? 'text-[10px] text-slate-500' : 'col-span-1 text-xs text-slate-500'}>
        {label}
      </Label>
      <Input
        id={id}
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={compact ? 'h-8 text-sm' : 'col-span-2 h-8 text-sm'}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek (SzemelyListRow ↔ EditableFields + patch + formázás)
// ─────────────────────────────────────────────────────────────────────────

const EDITABLE_KEYS: (keyof EditableFields)[] = [
  'k_nev',
  'csaladnev',
  'szcs_nev',
  'ferjk_nev',
  'allapot',
  'sz_datum',
  'apjaneve',
  'anyjaneve',
  'c_szcim',
  'c_szam',
  'c_tombhaz',
  'c_lepcsohaz',
  'c_emelet',
  'c_ajto',
  'telefon',
  'email',
  'vallas',
  'foglalkozas',
  'nemzetiseg',
  'megjegyzes',
]

function extractEditable(m: SzemelyListRow): EditableFields {
  const out = {} as EditableFields
  for (const key of EDITABLE_KEYS) {
    const raw = (m as unknown as Record<string, unknown>)[key]
    out[key] = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
  }
  return out
}

/**
 * A `SzemelyUpdateInput`-kompatibilis patch. Csak azokat a mezőket tartja
 * meg, amelyek ténylegesen változtak — így a Supabase UPDATE csak a delta-t
 * küldi, és a revision-trigger nem fut feleslegesen.
 */
function buildPatch(m: SzemelyListRow, form: EditableFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of EDITABLE_KEYS) {
    const original = (m as unknown as Record<string, unknown>)[key]
    const originalStr = original == null ? '' : String(original)
    if (originalStr !== form[key]) {
      // Az üres string tovább megy, a `normalizeSzemelyPatch` konvertálja null-ra
      patch[key] = form[key]
    }
  }
  return patch
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

function formatHuDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${formatHuDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatFullName(m: SzemelyListRow): string {
  const last = (m.ferfi === 0 && m.ferjk_nev) || m.csaladnev || m.szcs_nev || ''
  const first = m.k_nev || ''
  const combined = [last, first].filter(Boolean).join(' ')
  return combined || '(névtelen)'
}
