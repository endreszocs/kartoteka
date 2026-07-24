/**
 * MemberCreateDialog — M8.1 (2026-04-24).
 *
 * Új tag rögzítés desktop-dialogként. A `MemberDetailDialog` stílusát követi
 * (serif cím, csoportos form, pasztorális UX), de INSERT-flow-t végez:
 *   - CNP kliens-oldali kötelező validáció (13 számjegy + checksum)
 *   - Kliens-oldali CNP-dupláció-check (`findSzemelyByCnp` — gyors UX-feedback)
 *   - Online: közvetlen Supabase INSERT → szerver-id visszaírása a lokálba
 *   - Offline: a `szemely_pending_local` tábla queue-ja automatikusan push-ol
 *     amint online leszünk
 *
 * Három kötelező blokk:
 *   1. Azonosítás — CNP (dup-check inline, debounced)
 *   2. Nevek — k_nev + csaladnev (kötelező)
 *   3. Személyes — sz_datum + ferfi (kötelező)
 *
 * A többi mező opcionális. A dialog Save-re:
 *   - zod-validáció (`szemelyCreateInputSchema`)
 *   - `createSzemelyEntry` hívás
 *   - banner (success/offline/duplicate/error)
 *   - Siker esetén 1200 ms után bezár, parent list-refresh
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, UserPlus, X } from 'lucide-react'

import { Button, Input, Label } from '@kartoteka/ui'
import {
  normalizeSzemelyCreate,
  szemelyCreateInputSchema,
  validateRomanianCnp,
  type SzemelyCreateInput,
} from '@kartoteka/validations'

import { createSzemelyEntry } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface MemberCreateDialogProps {
  userId: string
  congregationId: string
  onCreated?: () => void
  onClose: () => void
}

type FormFields = {
  cnp: string
  k_nev: string
  csaladnev: string
  szcs_nev: string
  ferjk_nev: string
  allapot: string
  sz_datum: string
  ferfi: '1' | '0'
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
  csaladfo: '1' | '0'
  /** 2026-07-24 (PR-8 review): 3-állapotú választói felülbírálás — '' = automatikus
   *  (a szabály dönt a következő újraszámításkor), '1'/'0' = kézi, MEGMARADÓ döntés. */
  voter_override: '' | '1' | '0'
  member_status: string
  megjegyzes: string
}

const EMPTY: FormFields = {
  cnp: '',
  k_nev: '',
  csaladnev: '',
  szcs_nev: '',
  ferjk_nev: '',
  allapot: '',
  sz_datum: '',
  ferfi: '1',
  apjaneve: '',
  anyjaneve: '',
  c_szcim: '',
  c_szam: '',
  c_tombhaz: '',
  c_lepcsohaz: '',
  c_emelet: '',
  c_ajto: '',
  telefon: '',
  email: '',
  vallas: 'református',
  foglalkozas: '',
  nemzetiseg: '',
  csaladfo: '0',
  voter_override: '',
  member_status: 'aktív',
  megjegyzes: '',
}

type Banner =
  | { kind: 'success'; text: string }
  | { kind: 'offline'; text: string }
  | { kind: 'duplicate'; text: string }
  | { kind: 'error'; text: string }
  | null

export function MemberCreateDialog({
  userId,
  congregationId,
  onCreated,
  onClose,
}: MemberCreateDialogProps) {
  const [form, setForm] = useState<FormFields>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const [dupHint, setDupHint] = useState<string | null>(null)

  // CNP debounced dup-check (~400 ms a gépelés után)
  useEffect(() => {
    const cnp = form.cnp.trim()
    if (!/^\d{13}$/.test(cnp)) {
      setDupHint(null)
      return
    }
    if (!validateRomanianCnp(cnp)) {
      setDupHint('A CNP ellenőrző számjegye nem stimmel.')
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const dup = await getTauriSqliteBackend().findSzemelyByCnp(congregationId, cnp)
        if (cancelled) return
        if (dup) {
          const fullName = [dup.csaladnev ?? '', dup.k_nev ?? ''].filter(Boolean).join(' ')
          const src =
            dup.source === 'szemely_local' ? 'már a listában' : 'még szinkronra váró új tag'
          setDupHint(`Ezzel a CNP-vel már van egy tag (${src}): ${fullName || '(névtelen)'}`)
        } else {
          setDupHint(null)
        }
      } catch {
        /* csendes — a zod-validáció és a szerver-oldali UNIQUE a végső védelem */
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [form.cnp, congregationId])

  const canSubmit = useMemo(() => {
    if (!form.cnp.trim()) return false
    if (!form.k_nev.trim()) return false
    if (!form.csaladnev.trim()) return false
    if (!form.sz_datum.trim()) return false
    if (!validateRomanianCnp(form.cnp.trim())) return false
    return true
  }, [form])

  async function handleSave() {
    setSaving(true)
    setBanner(null)

    // 1. Zod validáció
    const input: SzemelyCreateInput = {
      congregation_id: congregationId,
      cnp: form.cnp.trim(),
      k_nev: form.k_nev.trim(),
      csaladnev: form.csaladnev.trim(),
      szcs_nev: form.szcs_nev.trim() || null,
      ferjk_nev: form.ferjk_nev.trim() || null,
      allapot: form.allapot.trim() || null,
      sz_datum: form.sz_datum,
      ferfi: form.ferfi === '1',
      apjaneve: form.apjaneve.trim() || null,
      anyjaneve: form.anyjaneve.trim() || null,
      c_szcim: form.c_szcim.trim() || null,
      c_szam: form.c_szam.trim() || null,
      c_tombhaz: form.c_tombhaz.trim() || null,
      c_lepcsohaz: form.c_lepcsohaz.trim() || null,
      c_emelet: form.c_emelet.trim() || null,
      c_ajto: form.c_ajto.trim() || null,
      telefon: form.telefon.trim() || null,
      email: form.email.trim() || null,
      vallas: form.vallas.trim() || null,
      foglalkozas: form.foglalkozas.trim() || null,
      nemzetiseg: form.nemzetiseg.trim() || null,
      csaladfo: form.csaladfo === '1',
      // 2026-07-24 (PR-8 review): 3-állapotú felülbírálás — a kézi döntés
      // felülbírálásként rögzül (a webes „Jogosultság frissítése" megőrzi);
      // automatikus módban a szabály dönt a következő újraszámításkor.
      voter_eligible: form.voter_override === '1',
      voter_manual_override: form.voter_override === '' ? null : form.voter_override === '1' ? 1 : 0,
      meghalt: false,
      member_status: form.member_status || 'aktív',
      isvisible: true,
      type: 'normal',
      family_id: null,
      megjegyzes: form.megjegyzes.trim() || null,
    }

    const parsed = szemelyCreateInputSchema.safeParse(input)
    if (!parsed.success) {
      const firstMsg = parsed.error.issues[0]?.message ?? 'Érvénytelen adat.'
      setBanner({ kind: 'error', text: firstMsg })
      setSaving(false)
      return
    }

    // 2. Normalizálás + createSzemelyEntry
    const normalized = normalizeSzemelyCreate(parsed.data)
    try {
      const result = await createSzemelyEntry(userId, normalized)

      if (result.duplicateCnp) {
        setBanner({
          kind: 'duplicate',
          text:
            result.error ??
            `A CNP (${form.cnp}) már létezik ebben a gyülekezetben. ` +
              `Keresd meg a listában, vagy lépj kapcsolatba egy adminnal.`,
        })
      } else if (result.synced) {
        setBanner({
          kind: 'success',
          text: `Új tag rögzítve — azonosító: ${result.serverId}. A listában megjelenik.`,
        })
        onCreated?.()
        setTimeout(() => onClose(), 1200)
      } else if (result.pending) {
        setBanner({
          kind: 'offline',
          text:
            'Új tag mentve offline-ban. A szinkron feltölti, amint online leszünk. ' +
            'A pending-listában addig is látszik.',
        })
        onCreated?.()
        setTimeout(() => onClose(), 1500)
      } else {
        setBanner({
          kind: 'error',
          text: result.error ?? 'Ismeretlen hiba a mentéskor.',
        })
      }
    } catch (err) {
      setBanner({
        kind: 'error',
        text: `Hiba mentéskor: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  function upd<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setForm({ ...form, [key]: value })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-create-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div>
            <h2
              id="member-create-title"
              className="flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900"
            >
              <UserPlus className="size-6 text-violet-700" />
              Új tag rögzítése
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A CNP-t, nevet és születési dátumot kötelező kitölteni; a többi
              opcionális és később is pótolható. Offline is lehet menteni —
              a szinkron automatikusan feltölti.
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

        {/* Form */}
        <div className="space-y-4 p-5">
          <FormGroup title="Azonosítás (kötelező)">
            <FormField
              label="CNP"
              id="cnp"
              required
              value={form.cnp}
              onChange={(v) => upd('cnp', v)}
              placeholder="13 számjegy"
              disabled={saving}
              mono
              maxLength={13}
            />
            {dupHint && (
              <p
                className={`pl-[33%] text-[11px] ${
                  dupHint.includes('ellenőrző') ? 'text-rose-600' : 'text-amber-700'
                }`}
              >
                {dupHint}
              </p>
            )}
          </FormGroup>

          <FormGroup title="Nevek (kötelező)">
            <FormField
              label="Keresztnév"
              id="k_nev"
              required
              value={form.k_nev}
              onChange={(v) => upd('k_nev', v)}
              disabled={saving}
            />
            <FormField
              label="Családnév"
              id="csaladnev"
              required
              value={form.csaladnev}
              onChange={(v) => upd('csaladnev', v)}
              disabled={saving}
            />
            <FormField
              label="Születési családnév"
              id="szcs_nev"
              value={form.szcs_nev}
              onChange={(v) => upd('szcs_nev', v)}
              disabled={saving}
            />
            {form.ferfi === '0' && (
              <FormField
                label="Férjezett név"
                id="ferjk_nev"
                value={form.ferjk_nev}
                onChange={(v) => upd('ferjk_nev', v)}
                disabled={saving}
              />
            )}
          </FormGroup>

          <FormGroup title="Személyes (kötelező)">
            <FormField
              label="Születési dátum"
              id="sz_datum"
              required
              type="date"
              value={form.sz_datum}
              onChange={(v) => upd('sz_datum', v)}
              disabled={saving}
            />
            <div className="grid grid-cols-3 items-center gap-2">
              <Label className="col-span-1 text-xs text-slate-500">Nem</Label>
              <div className="col-span-2 flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ferfi"
                    checked={form.ferfi === '1'}
                    onChange={() => upd('ferfi', '1')}
                    disabled={saving}
                  />
                  férfi
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ferfi"
                    checked={form.ferfi === '0'}
                    onChange={() => upd('ferfi', '0')}
                    disabled={saving}
                  />
                  nő
                </label>
              </div>
            </div>
            <FormField
              label="Családi állapot"
              id="allapot"
              value={form.allapot}
              onChange={(v) => upd('allapot', v)}
              placeholder="pl. nőtlen, házas, özvegy…"
              disabled={saving}
            />
          </FormGroup>

          <FormGroup title="Származás (opcionális)">
            <FormField
              label="Apa neve"
              id="apjaneve"
              value={form.apjaneve}
              onChange={(v) => upd('apjaneve', v)}
              disabled={saving}
            />
            <FormField
              label="Anya neve"
              id="anyjaneve"
              value={form.anyjaneve}
              onChange={(v) => upd('anyjaneve', v)}
              disabled={saving}
            />
          </FormGroup>

          <FormGroup title="Cím (opcionális)">
            <FormField
              label="Teljes cím"
              id="c_szcim"
              value={form.c_szcim}
              onChange={(v) => upd('c_szcim', v)}
              placeholder="utca, helység, irányítószám"
              disabled={saving}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Házszám" id="c_szam" value={form.c_szam} onChange={(v) => upd('c_szam', v)} disabled={saving} compact />
              <FormField label="Tömbház" id="c_tombhaz" value={form.c_tombhaz} onChange={(v) => upd('c_tombhaz', v)} disabled={saving} compact />
              <FormField label="Lépcsőház" id="c_lepcsohaz" value={form.c_lepcsohaz} onChange={(v) => upd('c_lepcsohaz', v)} disabled={saving} compact />
              <FormField label="Emelet" id="c_emelet" value={form.c_emelet} onChange={(v) => upd('c_emelet', v)} disabled={saving} compact />
              <FormField label="Ajtó" id="c_ajto" value={form.c_ajto} onChange={(v) => upd('c_ajto', v)} disabled={saving} compact />
            </div>
          </FormGroup>

          <FormGroup title="Elérhetőség (opcionális)">
            <FormField label="Telefon" id="telefon" value={form.telefon} onChange={(v) => upd('telefon', v)} placeholder="+40 …" disabled={saving} />
            <FormField label="E-mail" id="email" type="email" value={form.email} onChange={(v) => upd('email', v)} disabled={saving} />
          </FormGroup>

          <FormGroup title="Identitás (opcionális)">
            <FormField label="Vallás" id="vallas" value={form.vallas} onChange={(v) => upd('vallas', v)} disabled={saving} />
            <FormField label="Foglalkozás" id="foglalkozas" value={form.foglalkozas} onChange={(v) => upd('foglalkozas', v)} disabled={saving} />
            <FormField label="Nemzetiség" id="nemzetiseg" value={form.nemzetiseg} onChange={(v) => upd('nemzetiseg', v)} disabled={saving} />
          </FormGroup>

          <FormGroup title="Jelzők (opcionális)">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.csaladfo === '1'}
                onChange={(e) => upd('csaladfo', e.currentTarget.checked ? '1' : '0')}
                disabled={saving}
                className="size-4 accent-violet-600"
              />
              Családfő
            </label>
            {/* 2026-07-24 (PR-8 review): a sima jelölő némán ÖRÖK kézi felül-
                bírálást hozott létre — helyette a szerkesztővel egyező,
                3-állapotú választó, felirattal a megmaradásról. */}
            <label className="flex items-center gap-2 text-sm">
              Választói jogosultság
              <select
                value={form.voter_override}
                onChange={(e) => upd('voter_override', e.currentTarget.value as '' | '1' | '0')}
                disabled={saving}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Automatikus (a rendszer számítja)</option>
                <option value="1">Kézi felülbírálás: VÁLASZTÓ</option>
                <option value="0">Kézi felülbírálás: nem választó</option>
              </select>
            </label>
            <p className="-mt-1 text-[10px] italic text-slate-500">
              A kézi felülbírálás a jogosultság-újraszámítás után is megmarad.
            </p>
          </FormGroup>

          <FormGroup title="Megjegyzés (opcionális)">
            <textarea
              value={form.megjegyzes}
              onChange={(e) => upd('megjegyzes', e.currentTarget.value)}
              disabled={saving}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </FormGroup>
        </div>

        {/* Akciók */}
        <div className="flex justify-between gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Mégse
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !canSubmit}>
            <Check className="mr-2 size-4" />
            {saving ? 'Mentés…' : 'Rögzítés'}
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
    duplicate: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }
  const icon =
    banner.kind === 'duplicate' || banner.kind === 'error' ? (
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

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FormField({
  label,
  id,
  value,
  onChange,
  type,
  placeholder,
  disabled,
  required,
  mono,
  compact,
  maxLength,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'date'
  placeholder?: string
  disabled?: boolean
  required?: boolean
  mono?: boolean
  compact?: boolean
  maxLength?: number
}) {
  return (
    <div className={compact ? 'space-y-1' : 'grid grid-cols-3 items-center gap-2'}>
      <Label htmlFor={id} className={compact ? 'text-[10px] text-slate-500' : 'col-span-1 text-xs text-slate-500'}>
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </Label>
      <Input
        id={id}
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={`${compact ? 'h-8 text-sm' : 'col-span-2 h-8 text-sm'} ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
