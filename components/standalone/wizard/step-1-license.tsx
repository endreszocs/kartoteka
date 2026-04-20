'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Loader2, Lock, Wifi } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { WizardData } from '../welcome-wizard-client'

interface Step1Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: () => void
}

/**
 * Egyszerű, RFC 5322-konzisztens e-mail formátum-ellenőrzés.
 * Nem kvázi-tökéletes (a teljes spec hatalmas), de elkapja a leggyakoribb
 * gépelési hibákat ANTE a Supabase auth-hívás előtt — gyorsabb és világosabb
 * hibaüzenet a felhasználónak.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * "Elfelejtetted a jelszót" link cél URL — env var-ral felülírható, hogy
 * dev/staging build-ek a saját Supabase-jükre mutassanak. Production fallback
 * a hivatalos kartoteka.erek.ro domain.
 */
const FORGOT_PASSWORD_URL =
  process.env.NEXT_PUBLIC_FORGOT_PASSWORD_URL ||
  'https://kartoteka.erek.ro/forgot-password'

export function Step1License({ data, updateData, onNext }: Step1Props) {
  const [email, setEmail] = useState(data.email)
  const [password, setPassword] = useState(data.password)
  const [understood, setUnderstood] = useState(false)
  const [loading, setLoading] = useState(false)

  // Re-entry guard — a `setLoading(true)` aszinkron, ezért két gyors klikk
  // két párhuzamos /activate kérést indítana. A useRef SZINKRON, így a második
  // klikk azonnal blokkolódik, mielőtt egyetlen request is elindulna.
  const submittingRef = useRef(false)

  async function handleActivate() {
    // 0) Re-entry guard
    if (submittingRef.current) return

    // 1) Form validáció
    if (!email || !password) {
      toast.error('Add meg az email címedet és a jelszavadat')
      return
    }
    const trimmedEmail = email.trim()
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      toast.error('Az e-mail cím formátuma hibás (példa: nev@ekha.ro)')
      return
    }
    if (password.length < 6) {
      toast.error('A jelszó túl rövid (minimum 6 karakter)')
      return
    }
    if (!understood) {
      toast.error('Kérlek, erősítsd meg hogy értetted a gép-kötést')
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      // Supabase bejelentkezés + license kérés
      const response = await fetch('/api/standalone/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Aktiválás sikertelen')
      }

      updateData({
        email: trimmedEmail,
        password: '', // Ne tartsuk meg a jelszót a state-ben
        userId: result.userId,
        licenseToken: result.token,
        congregationId: result.congregationId,
      })

      toast.success('Sikeres aktiválás! Folytasd a beállítást.')
      onNext()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ismeretlen hiba')
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h2 className="font-heading text-2xl text-slate-800">Licensz aktiválás</h2>
        <p className="mt-1 text-sm text-slate-600">
          Jelentkezz be az e-mail címeddel, amit az esperesi hivataltól kaptál.
        </p>
      </div>

      {/* Internet-kapcsolat figyelmeztetés */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
        <p className="flex items-start gap-2 font-semibold">
          <Wifi className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <span>Internet-kapcsolat szükséges</span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed">
          Az első aktiváláshoz <strong>egyszer</strong> csatlakozni kell az
          internethez (kb. 5 perc). Utána bármikor dolgozhatsz offline is.
          Ha nincs otthon internet, használj mobil-hotspotot vagy menj el egy
          ismerős WiFi-jét használni.
        </p>
      </div>

      {/* Bejelentkezés */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail cím</Label>
          <Input
            id="email"
            type="email"
            placeholder="pl. szabo.janos@erek.ro"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Jelszó</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />
          <p className="text-xs text-slate-500">
            Elfelejtetted a jelszavad?{' '}
            <a
              href={FORGOT_PASSWORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              Kattints ide
            </a>
            {' '}— de előbb csatlakozz internethez.
          </p>
        </div>
      </div>

      {/* Anti-copy figyelmeztetés */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 text-sm">
        <p className="flex items-start gap-2 font-semibold text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <span>FONTOS — a telepítés gép-kötött</span>
        </p>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-amber-900">
          <p>
            <Lock className="mr-1 inline size-3.5" />
            <strong>Ez a telepítés CSAK ezen a gépen fog működni.</strong> A
            rendszer a számítógép <strong>hardveres ujjlenyomatát</strong>{' '}
            rögzíti, amikor aktiválod a licenszt.
          </p>
          <p>
            Ha másik gépre szeretnéd áttenni a KARTOTEKÁ-t (pl. új laptop),{' '}
            <strong>új telepítést kell kérned</strong> az esperesi hivatalból
            — NEM másolhatod át egyszerűen a fájlokat. Ez biztonsági okból van
            így, hogy a gyülekezet személyes adatai NE kerüljenek illetéktelen
            kezekbe.
          </p>
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white/80 p-3 text-xs text-amber-900 transition-colors hover:bg-white">
          <input
            type="checkbox"
            checked={understood}
            onChange={e => setUnderstood(e.target.checked)}
            disabled={loading}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-amber-400 text-amber-600 focus:ring-amber-500"
          />
          <span>
            <strong>Megerősítem, értettem.</strong> Tudom, hogy a licensz a
            gépemhez kötött, és ha áthelyezésre van szükségem, a hivatalos
            procedúrán keresztül kérek újat.
          </span>
        </label>
      </div>

      {/* Activate button */}
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button
          size="lg"
          className="gap-2 rounded-xl px-6"
          onClick={handleActivate}
          disabled={loading || !email || !password || !understood}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Lock className="size-4" />
          )}
          {loading ? 'Aktiválás folyamatban...' : 'Licensz aktiválása'}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
