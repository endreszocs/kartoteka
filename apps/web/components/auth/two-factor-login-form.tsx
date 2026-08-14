'use client'

import { useState } from 'react'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { mentokodBelepes } from '@/app/(dashboard)/profile/biztonsag/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

/**
 * Belépés 2. lépcsője (2026-08-15, 8. pont): TOTP-kód VAGY mentőkód.
 * Mentőkódnál a szerver a kódot elhasználja és a faktort leveszi — a
 * felhasználó bejut, a 2FA-t újra be kell kapcsolnia (kimondjuk neki).
 */
export function TwoFactorLoginForm() {
  const [mod, setMod] = useState<'totp' | 'mentokod'>('totp')
  const [kod, setKod] = useState('')
  const [dolgozik, setDolgozik] = useState(false)

  async function totpEllenorzes() {
    const tiszta = kod.replace(/\D/g, '')
    if (tiszta.length !== 6) {
      toast.error('A hitelesítő app 6 számjegyű kódját írd be.')
      return
    }
    setDolgozik(true)
    try {
      const supabase = createClient()
      const { data: f, error: fErr } = await supabase.auth.mfa.listFactors()
      const totp = (f?.totp || []).find((x) => x.status === 'verified')
      if (fErr || !totp) {
        // Nincs (már) faktor → az őr úgyis továbbenged.
        window.location.href = '/valassz-profilt'
        return
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr || !ch) {
        toast.error(`Az ellenőrzés nem indult el: ${chErr?.message || 'ismeretlen hiba'}`)
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.id,
        code: tiszta,
      })
      if (vErr) {
        toast.error('A kód nem stimmel — az appban 30 mp-enként új szám jelenik meg, a frisset írd be.')
        return
      }
      window.location.href = '/valassz-profilt'
    } finally {
      setDolgozik(false)
    }
  }

  async function mentokodEllenorzes() {
    setDolgozik(true)
    try {
      const res = await mentokodBelepes(kod)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.warning(
        'Mentőkóddal léptél be — a kétlépcsős belépés most KIKAPCSOLT. A Profil → Biztonság oldalon kapcsold vissza!',
        { duration: 15000 },
      )
      window.location.href = '/valassz-profilt'
    } finally {
      setDolgozik(false)
    }
  }

  async function kilep() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-4 p-4">
      <div className="card-raised space-y-4 p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h1 className="font-heading text-lg text-slate-800">Belépés — 2. lépés</h1>
        </div>

        {mod === 'totp' ? (
          <>
            <p className="text-sm text-slate-600">
              A fiókodon kétlépcsős belépés van. Írd be a telefonod hitelesítő alkalmazásában látható
              6 számjegyű kódot:
            </p>
            <Input
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              inputMode="numeric"
              maxLength={7}
              placeholder="123 456"
              autoFocus
              className="text-center text-xl tracking-widest"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void totpEllenorzes()
              }}
            />
            <Button onClick={totpEllenorzes} disabled={dolgozik} className="w-full gap-2">
              {dolgozik ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Belépés
            </Button>
            <button
              type="button"
              onClick={() => {
                setMod('mentokod')
                setKod('')
              }}
              className="w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
            >
              Nincs nálam a telefonom — mentőkóddal lépek be
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              <KeyRound className="mr-1 inline h-4 w-4" />
              Írd be az egyik <strong>mentőkódodat</strong> (a bekapcsoláskor kinyomtatott/felírt 8
              kód egyike). A kód egyszer használható, és utána a kétlépcsős belépés kikapcsol — újra
              be kell majd kapcsolnod.
            </p>
            <Input
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              placeholder="XXXX-XXXX"
              autoFocus
              className="text-center text-xl tracking-widest uppercase"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void mentokodEllenorzes()
              }}
            />
            <Button onClick={mentokodEllenorzes} disabled={dolgozik} className="w-full gap-2">
              {dolgozik ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Belépés mentőkóddal
            </Button>
            <button
              type="button"
              onClick={() => {
                setMod('totp')
                setKod('')
              }}
              className="w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
            >
              Vissza a hitelesítő appos kódhoz
            </button>
          </>
        )}

        <button
          type="button"
          onClick={kilep}
          className="w-full text-center text-xs text-slate-400 underline hover:text-slate-600"
        >
          Mégse — kijelentkezés
        </button>
      </div>
    </div>
  )
}
