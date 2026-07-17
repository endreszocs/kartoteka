'use client'

/**
 * Hozzáférés-kérő űrlap (publikus, anon elérhető) — M0.2.
 *
 * Szerver action: `submitAccessRequest()` — rate-limit + INSERT + emailek.
 * UX:
 *   - Visszacsatolás in-place (toast + sikeres/hibás üzenet)
 *   - Sikeres beküldés után köszönőoldal inline
 *   - Kötelező mezők: email, teljes név, szerepkör. Opcionális: gyülekezet, telefon, indoklás
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowRight, Building2, CheckCircle2, Church, Eye, EyeOff, FileUp, KeyRound, Lock, LogIn, Mail, Paperclip, Send, X, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LegalDialog, type LegalKind } from '@/components/auth/legal-dialog'
import { ContactSysadminDialog } from '@/components/public/contact-sysadmin-dialog'
import { createClient } from '@/lib/supabase/client'
import {
  submitAccessRequest,
  type AccessRequestRole,
} from '@/app/(public)/hozzaferes-kerese/actions'

interface RefDistrict { id: string; name: string }
interface RefDiocese { id: string; name: string; district_id: string | null }
interface RefCongregation { id: string; name: string; diocese_id: string | null }

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 MB

const ROLES: { value: AccessRequestRole; label: string; description: string }[] = [
  { value: 'lelkesz', label: 'Lelkész', description: 'Gyülekezet vezető lelkésze' },
  { value: 'esperes', label: 'Esperes', description: 'Egyházmegye elöljárója' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin', description: 'Egyházmegyei hivatalvezető' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin', description: 'EREK hivatalvezető' },
  { value: 'konyvelo', label: 'Könyvelő', description: 'Gyülekezeti/egyházmegyei könyvelő' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő', description: 'Egyházmegyei pénzügyi ellenőr' },
]

export function AccessRequestForm() {
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [alreadyExists, setAlreadyExists] = useState(false)
  // 2026-06-05: melyik gyülekezetnél van már regisztrálva (ha kideríthető)
  const [alreadyExistsCong, setAlreadyExistsCong] = useState<string | null>(null)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [openLegal, setOpenLegal] = useState<LegalKind | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [form, setForm] = useState({
    email: '',
    // 2026-05-02 (v0.9.38): a teljes név két mezőből áll össze (magyar
    // konvenció szerint: vezetéknév előbb, keresztnév utána)
    family_name: '',
    given_name: '',
    requested_role: 'lelkesz' as AccessRequestRole,
    congregation_slug: '',
    phone: '',
    justification: '',
    referrer: '',
  })

  // ── 2026-06-03: egyházkerület + egyházmegye (DB-ből, kötelező) ────────────
  const supabase = useMemo(() => createClient(), [])
  const [districts, setDistricts] = useState<RefDistrict[]>([])
  const [dioceses, setDioceses] = useState<RefDiocese[]>([])
  const [congregations, setCongregations] = useState<RefCongregation[]>([])
  const [districtId, setDistrictId] = useState('')
  const [dioceseId, setDioceseId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [refDataError, setRefDataError] = useState(false)

  // ── 2026-06-03: opcionális igazolás (dokumentum) ──────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [districtRes, dioceseRes, congRes] = await Promise.all([
        supabase.from('districts').select('id, name').order('name'),
        supabase.from('dioceses').select('id, name, district_id').order('name'),
        supabase.rpc('congregations_for_registration'),
      ])
      if (!active) return
      if (districtRes.error || dioceseRes.error || congRes.error) {
        setRefDataError(true)
        return
      }
      setDistricts((districtRes.data as RefDistrict[]) ?? [])
      setDioceses((dioceseRes.data as RefDiocese[]) ?? [])
      setCongregations((congRes.data as RefCongregation[]) ?? [])
    })()
    return () => {
      active = false
    }
  }, [supabase])

  // A választott egyházkerülethez tartozó egyházmegyék
  const filteredDioceses = useMemo(
    () => (districtId ? dioceses.filter((d) => d.district_id === districtId) : []),
    [districtId, dioceses],
  )

  // A választott egyházmegyéhez tartozó egyházközségek
  const filteredCongregations = useMemo(
    () => (dioceseId ? congregations.filter((c) => c.diocese_id === dioceseId) : []),
    [dioceseId, congregations],
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!ALLOWED_DOC_TYPES.includes(f.type)) {
      setFileError('Csak PDF, JPG vagy PNG fájl tölthető fel.')
      setFile(null)
      return
    }
    if (f.size > MAX_DOC_BYTES) {
      setFileError('A fájl legfeljebb 10 MB lehet.')
      setFile(null)
      return
    }
    setFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!acceptPrivacy || !acceptTerms) {
      toast.error('Kérjük, fogadja el az Adatvédelmi tájékoztatót és az ÁSZF-et.')
      return
    }
    if (!form.family_name.trim() || !form.given_name.trim()) {
      toast.error('Kérjük, adja meg a vezetéknevét és a keresztnevét.')
      return
    }
    if (!form.phone.trim()) {
      toast.error('Kérjük, adja meg a telefonszámát.')
      return
    }
    if (!districtId) {
      toast.error('Kérjük, válassza ki az egyházkerületet.')
      return
    }
    if (!dioceseId) {
      toast.error('Kérjük, válassza ki az egyházmegyét.')
      return
    }
    if (!congregationId) {
      toast.error('Kérjük, válassza ki az egyházközséget.')
      return
    }
    if (password.length < 8) {
      toast.error('A jelszó legalább 8 karakter hosszú legyen.')
      return
    }
    if (password !== passwordConfirm) {
      toast.error('A jelszó és a megerősítése nem egyezik.')
      return
    }
    startTransition(async () => {
      // A privát bucketbe csak a szerver action tölthet; a böngésző nem kap
      // INSERT policy-t és nem állíthat elő megbízhatónak tekintett útvonalat.
      let documentData: FormData | undefined
      if (file) {
        documentData = new FormData()
        documentData.set('document', file)
      }

      // Magyar konvenció: vezetéknév + keresztnév (Szőcs Endre)
      const fullName = `${form.family_name.trim()} ${form.given_name.trim()}`
      // A congregation_slug-ot a kiválasztott gyülekezet nevével töltjük (megjelenítéshez,
      // backward-compat); a tényleges hozzárendelés a requested_congregation_id alapján megy.
      const selectedCong = congregations.find((c) => c.id === congregationId)
      const res = await submitAccessRequest(
        {
          email: form.email.trim(),
          full_name: fullName,
          requested_role: form.requested_role,
          password,
          congregation_slug: selectedCong?.name || undefined,
          phone: form.phone.trim() || undefined,
          justification: form.justification.trim() || undefined,
          referrer: form.referrer.trim() || undefined,
          requested_district_id: districtId,
          requested_diocese_id: dioceseId,
          requested_congregation_id: congregationId,
        },
        documentData,
      )

      if (res.success) {
        setSubmittedEmail(form.email.trim())
        setSubmitted(true)
        toast.success('Kérelmét rögzítettük — email-t kapott.')
      } else if (res.alreadyExists) {
        // Email-foglalt — speciális képernyőre váltunk a Belépés / Elfelejtett jelszó link-ekkel
        setSubmittedEmail(form.email.trim())
        setAlreadyExistsCong(res.congregationName || null)
        setAlreadyExists(true)
      } else if (res.rateLimited) {
        toast.error(res.error || 'Túl sok kérelem ebből az eszközből.')
      } else {
        toast.error(res.error || 'Hiba történt a kérelem rögzítése során.')
      }
    })
  }

  // ── Email-foglalt képernyő ─────────────────────────────────────────────
  // 2026-05-02 (v0.9.43): a felhasználó kérése — ha az email már regisztrálva
  // van, mondjuk meg konkrétan, és kínáljuk fel a Belépés + Elfelejtett jelszó
  // gombokat (ne csendben fogadjuk el a kérelmet, ne hagyjuk találgatni).
  if (alreadyExists) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-100">
          <Mail className="size-7 text-amber-700" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">
          Ez az email már regisztrálva van
        </h2>
        <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          A <strong className="text-slate-900">{submittedEmail}</strong> email-cím már szerepel a
          Kartotéka rendszerben
          {alreadyExistsCong ? (
            <>
              {' — '}
              <strong className="text-slate-900">{alreadyExistsCong}</strong> gyülekezetnél
            </>
          ) : null}
          . Ha emlékszik a jelszavára, lépjen be — különben állítsa vissza
          az <em>Elfelejtett jelszó</em> oldalon.
        </p>

        <div className="mt-6 space-y-2 max-w-sm mx-auto">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 font-semibold transition shadow-sm"
          >
            <LogIn className="size-4" />
            Belépés a meglévő fiókkal
            <ArrowRight className="size-4" />
          </Link>

          <Link
            href="/forgot-password"
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 text-slate-700 px-4 py-3 font-medium transition"
          >
            <KeyRound className="size-4 text-amber-700" />
            Elfelejtettem a jelszót
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            setAlreadyExists(false)
            // Új email-re újra próbálni — a többi mezőt megtartjuk
            setForm({ ...form, email: '' })
          }}
          className="mt-6 text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
        >
          ← Más email-cím megadása
        </button>
      </div>
    )
  }

  if (submitted) {
    return (
      <>
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="size-7 text-emerald-600" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Kérelmét rögzítettük</h2>
          <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Visszaigazoló emailt küldtünk a{' '}
            <strong className="text-slate-900">{submittedEmail}</strong> címre. A rendszergazda
            rövidesen átnézi a kérelmét — általában <strong>1-3 munkanap</strong> alatt válaszolunk.
          </p>
          <div className="mt-6 rounded-xl bg-amber-50/60 p-4 ring-1 ring-amber-200/60 max-w-md mx-auto text-left">
            <p className="text-[13px] text-amber-900/80 leading-relaxed">
              <strong>Nem kapja meg az emailt?</strong> Ellenőrizze a spam mappát is. Ha 10 percen
              belül sem érkezik meg, kérjük lépjen kapcsolatba a{' '}
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950 hover:decoration-amber-600 transition"
              >
                rendszergazdával
              </button>
              .
            </p>
          </div>
        </div>
        <ContactSysadminDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          defaultEmail={submittedEmail}
          defaultName={`${form.family_name.trim()} ${form.given_name.trim()}`.trim()}
        />
      </>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Név — 2 mező magyar konvenció szerint (vezetéknév előbb) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-family-name">
            Vezetéknév <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="ar-family-name"
            required
            minLength={2}
            value={form.family_name}
            onChange={(e) => setForm({ ...form, family_name: e.target.value })}
            placeholder="pl. Szőcs"
            disabled={isPending}
            autoComplete="family-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ar-given-name">
            Keresztnév <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="ar-given-name"
            required
            minLength={2}
            value={form.given_name}
            onChange={(e) => setForm({ ...form, given_name: e.target.value })}
            placeholder="pl. Endre"
            disabled={isPending}
            autoComplete="given-name"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ar-email">
          Email-cím <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="ar-email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="pl. lelkesz@example.com"
          disabled={isPending}
          autoComplete="email"
        />
      </div>

      {/* Jelszó-mezők — v0.9.37 felhasználó kérése.
          A signUp() ezzel a jelszóval hozza létre az auth.users sort. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-password">
            Jelszó <span className="text-rose-500">*</span>
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="ar-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 karakter"
              disabled={isPending}
              autoComplete="new-password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Erre a jelszóra fog majd belépni az admin elfogadása után.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ar-password-confirm">
            Jelszó megerősítése <span className="text-rose-500">*</span>
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="ar-password-confirm"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Írja be újra a jelszót"
              disabled={isPending}
              autoComplete="new-password"
              className={`pl-9 ${
                passwordConfirm && password !== passwordConfirm
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                  : ''
              }`}
            />
          </div>
          {passwordConfirm && password !== passwordConfirm && (
            <p className="text-[11px] text-rose-600">A két jelszó nem egyezik.</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          Szerepkör <span className="text-rose-500">*</span>
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map((r) => {
            const isActive = form.requested_role === r.value
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm({ ...form, requested_role: r.value })}
                disabled={isPending}
                className={`rounded-xl border-2 px-3 py-2 text-left transition ${
                  isActive
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-semibold ${isActive ? 'text-teal-900' : 'text-slate-800'}`}>
                  {r.label}
                </p>
                <p className={`mt-0.5 text-[11px] ${isActive ? 'text-teal-700/80' : 'text-slate-500'}`}>
                  {r.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Egyházkerület + Egyházmegye — kötelező, DB-ből (2026-06-03) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-district">
            Egyházkerület <span className="text-rose-500">*</span>
          </Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <select
              id="ar-district"
              required
              value={districtId}
              onChange={(e) => {
                setDistrictId(e.target.value)
                setDioceseId('')
              }}
              disabled={isPending || districts.length === 0}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:opacity-60"
            >
              <option value="">— Válasszon —</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ar-diocese">
            Egyházmegye <span className="text-rose-500">*</span>
          </Label>
          <select
            id="ar-diocese"
            required
            value={dioceseId}
            onChange={(e) => {
              setDioceseId(e.target.value)
              setCongregationId('')
            }}
            disabled={isPending || !districtId}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:opacity-60"
          >
            <option value="">
              {districtId ? '— Válasszon —' : 'Előbb válasszon egyházkerületet'}
            </option>
            {filteredDioceses.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Egyházközség — kötelező, a választott egyházmegyéhez szűrve (2026-06-04) */}
      <div className="space-y-1.5">
        <Label htmlFor="ar-congregation-select">
          Egyházközség <span className="text-rose-500">*</span>
        </Label>
        <div className="relative">
          <Church className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <select
            id="ar-congregation-select"
            required
            value={congregationId}
            onChange={(e) => setCongregationId(e.target.value)}
            disabled={isPending || !dioceseId}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:opacity-60"
          >
            <option value="">
              {dioceseId ? '— Válasszon egyházközséget —' : 'Előbb válasszon egyházmegyét'}
            </option>
            {filteredCongregations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {dioceseId && filteredCongregations.length === 0 && (
          <p className="text-[11px] text-amber-600">
            Ehhez az egyházmegyéhez még nincs gyülekezet a listában. Kérjük, jelezze a
            rendszergazdának.
          </p>
        )}
      </div>

      {refDataError && (
        <p className="text-[12px] text-rose-600">
          Az egyházkerület/egyházmegye lista betöltése nem sikerült. Kérjük, frissítse az oldalt,
          vagy próbálja meg később.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-phone">
            Telefonszám <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="ar-phone"
            type="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="pl. +40 720 123 456"
            disabled={isPending}
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ar-justification">Rövid indoklás (opcionális)</Label>
        <textarea
          id="ar-justification"
          rows={3}
          value={form.justification}
          onChange={(e) => setForm({ ...form, justification: e.target.value })}
          placeholder="Pl. A gyülekezet új lelkésze vagyok, a nyilvántartáshoz szeretnék hozzáférést."
          disabled={isPending}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ar-referrer">Honnan hallott rólunk? (opcionális)</Label>
        <Input
          id="ar-referrer"
          value={form.referrer}
          onChange={(e) => setForm({ ...form, referrer: e.target.value })}
          placeholder="Pl. esperesi körlevél, kollégám ajánlása"
          disabled={isPending}
        />
      </div>

      {/* Opcionális igazolás feltöltése — egyházmegyei/egyházkerületi (2026-06-03) */}
      <div className="space-y-1.5">
        <Label htmlFor="ar-document">Igazolás csatolása (opcionális)</Label>
        {file ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-teal-900">
              <Paperclip className="size-4 shrink-0" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-teal-700/70">({Math.round(file.size / 1024)} KB)</span>
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              disabled={isPending}
              className="shrink-0 text-teal-700 hover:text-teal-900"
              aria-label="Fájl eltávolítása"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="ar-document"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600 transition hover:border-teal-400 hover:bg-teal-50/40"
          >
            <FileUp className="size-4 text-slate-400" />
            Kattintson a feltöltéshez — PDF, JPG vagy PNG (max 10 MB)
          </label>
        )}
        <input
          id="ar-document"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={handleFileChange}
          disabled={isPending}
          className="hidden"
        />
        {fileError && <p className="text-[11px] text-rose-600">{fileError}</p>}
        <p className="text-[11px] text-slate-500">
          Pl. egyházmegyei vagy egyházkerületi igazolás a szolgálatáról — segíti a rendszergazda
          elbírálását.
        </p>
      </div>

      {/* Kötelező pipák — adatvédelem + ÁSZF (modal-link-kel) */}
      <div className="space-y-2 pt-3 border-t border-slate-100">
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => setAcceptPrivacy(e.target.checked)}
            disabled={isPending}
            required
            className="mt-0.5 size-4 rounded border-slate-300 text-teal-600 focus:ring-2 focus:ring-teal-200"
          />
          <span className="text-[12.5px] leading-snug text-slate-700">
            Elolvastam és elfogadom az{' '}
            <button
              type="button"
              onClick={() => setOpenLegal('privacy')}
              className="font-semibold text-teal-700 underline-offset-2 hover:underline"
            >
              Adatvédelmi tájékoztatót
            </button>
            . <span className="text-rose-500">*</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            disabled={isPending}
            required
            className="mt-0.5 size-4 rounded border-slate-300 text-teal-600 focus:ring-2 focus:ring-teal-200"
          />
          <span className="text-[12.5px] leading-snug text-slate-700">
            Elolvastam és elfogadom az{' '}
            <button
              type="button"
              onClick={() => setOpenLegal('terms')}
              className="font-semibold text-teal-700 underline-offset-2 hover:underline"
            >
              Általános Szerződési Feltételeket
            </button>
            . <span className="text-rose-500">*</span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          A kérelem rögzítésével Ön a megadott adatok kezeléséhez hozzájárul (GDPR-alap:
          jogos érdek + hozzájárulás).
        </p>
        <Button
          type="submit"
          disabled={isPending || !acceptPrivacy || !acceptTerms}
          className="rounded-xl bg-teal-600 text-white hover:bg-teal-700 gap-1.5 shrink-0 disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Küldés…
            </>
          ) : (
            <>
              <Send className="size-4" />
              Kérelem elküldése
            </>
          )}
        </Button>
      </div>

      {openLegal && (
        <LegalDialog
          open={openLegal !== null}
          onOpenChange={(o) => !o && setOpenLegal(null)}
          kind={openLegal}
        />
      )}
    </form>
  )
}
