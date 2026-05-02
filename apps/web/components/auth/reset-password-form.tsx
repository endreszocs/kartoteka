'use client'

import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { setNewPassword } from '@/app/(auth)/forgot-password/actions'
import { createClient } from '@/lib/supabase/client'

/**
 * Reset password form (v0.9.44, 2026-05-02).
 *
 * A Supabase reset-password magic-link erre az oldalra mutat. A query string
 * a recovery-tokent tartalmazza — a `supabase-js` SSR-helper (createClient)
 * automatikusan átveszi az URL-token-eket a session-ré.
 *
 * A user ide érkezik:
 *   1. /forgot-password → resetPassword() futott
 *   2. Email-en kattint a magic-linket
 *   3. Ide érkezik az `?code=...` query stringgel
 *   4. A Supabase exchangeCodeForSession() automatikusan futtatja
 *   5. A user új jelszót ad meg
 *   6. setNewPassword() → updateUser({ password })
 *   7. Átirányítás /login-ra a sikeres üzenettel
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [tokenChecking, setTokenChecking] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)

  // Token-ellenőrzés a betöltéskor — ha nincs session a recovery-tokenből,
  // akkor a magic-link lejárt vagy érvénytelen
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    // A Supabase SSR-en már elvégezte az exchangeCodeForSession-t (ha volt code).
    // Ellenőrizzük, hogy van-e érvényes session.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      setTokenValid(!!user)
      setTokenChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const tooShort = pwd.length > 0 && pwd.length < 8
  const mismatch = pwd2.length > 0 && pwd !== pwd2
  const canSubmit = pwd.length >= 8 && pwd === pwd2 && !busy && tokenValid

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const res = await setNewPassword(pwd)
    setBusy(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setDone(true)
    toast.success(res.success || 'A jelszó beállítva. Most beléphet az új jelszóval.')
    setTimeout(() => router.push('/login'), 2000)
  }

  // ── Sikeres ─────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="kt-auth-card-inner py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="size-7 text-emerald-600" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Jelszó beállítva</h2>
        <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          A jelszót sikeresen frissítettük. <strong>Néhány másodperc múlva</strong> átirányítjuk
          a bejelentkező oldalra.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-semibold transition"
        >
          <ArrowRight className="size-4" />
          Belépés most
        </Link>
      </div>
    )
  }

  // ── Token-ellenőrzés folyamatban ────────────────────────────────
  if (tokenChecking) {
    return (
      <div className="kt-auth-card-inner py-12 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">Magic-link ellenőrzése folyamatban…</p>
      </div>
    )
  }

  // ── Lejárt / érvénytelen token ──────────────────────────────────
  if (!tokenValid) {
    return (
      <div className="kt-auth-card-inner py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-rose-100">
          <KeyRound className="size-7 text-rose-700" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Lejárt vagy érvénytelen link</h2>
        <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          A jelszó-visszaállító link lejárt vagy érvénytelen. Kérjen új linket az
          Elfelejtett jelszó oldalon.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 font-semibold transition"
        >
          <ArrowRight className="size-4" />
          Új link kérése
        </Link>
      </div>
    )
  }

  // ── Új jelszó form ──────────────────────────────────────────────
  return (
    <div className="kt-auth-card-inner">
      <div className="text-center mb-6">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-100">
          <KeyRound className="size-6 text-amber-700" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Új jelszó beállítása</h2>
        <p className="mt-2 text-sm text-slate-600">
          Adjon meg egy új, biztonságos jelszót, és ezzel beléphet a fiókjába.
        </p>
      </div>

      <form onSubmit={handle} className="space-y-4">
        <div className="kt-auth-field">
          <label className="kt-auth-field-label" htmlFor="reset-pwd">
            Új jelszó
          </label>
          <div className="kt-auth-input-wrap">
            <span className="kt-auth-input-ico">
              <KeyRound className="size-[18px]" strokeWidth={1.6} />
            </span>
            <input
              id="reset-pwd"
              type={show ? 'text' : 'password'}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Min. 8 karakter"
              autoComplete="new-password"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="kt-auth-reveal"
              aria-label={show ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
            >
              {show ? <EyeOff className="size-[18px]" strokeWidth={1.6} /> : <Eye className="size-[18px]" strokeWidth={1.6} />}
            </button>
          </div>
          {tooShort && <div className="kt-auth-field-msg">A jelszó legalább 8 karakter legyen.</div>}
        </div>

        <div className="kt-auth-field">
          <label className="kt-auth-field-label" htmlFor="reset-pwd2">
            Új jelszó megerősítése
          </label>
          <div className={`kt-auth-input-wrap ${mismatch ? 'is-error' : ''}`}>
            <span className="kt-auth-input-ico">
              <KeyRound className="size-[18px]" strokeWidth={1.6} />
            </span>
            <input
              id="reset-pwd2"
              type={show ? 'text' : 'password'}
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              placeholder="Írja be újra a jelszót"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          {mismatch && <div className="kt-auth-field-msg">A két jelszó nem egyezik.</div>}
        </div>

        <button type="submit" className="kt-auth-btn-primary" disabled={!canSubmit}>
          {busy ? (
            <>
              <Loader2 className="size-[18px] animate-spin" />
              Mentés folyamatban…
            </>
          ) : (
            <>
              <KeyRound className="size-[18px]" strokeWidth={2} />
              Új jelszó mentése
            </>
          )}
        </button>
      </form>
    </div>
  )
}
