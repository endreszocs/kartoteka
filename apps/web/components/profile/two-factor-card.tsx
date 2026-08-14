'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, Printer, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'

import {
  generateMentokodok,
  getMentokodStatus,
  logMfaEsemeny,
} from '@/app/(dashboard)/profile/biztonsag/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

/**
 * Kétlépcsős belépés (2FA) kártya — Supabase natív TOTP (2026-08-15, 8. pont).
 *
 * Folyamat (Endre döntése szerint opt-in, érthető magyarázattal):
 *  Bekapcsolás → QR-kód a hitelesítő apphoz → 6 jegyű kód ellenőrzése →
 *  8 mentőkód (EGYSZER látszik, nyomtatható) → kész.
 *  Kikapcsolás: megerősítés után a faktor lekerül a fiókról.
 *
 * A tiszta lapot eseménykezelők állítják (effektben szinkron setState tilos
 * — CI lint-hibaosztály); az effekt csak aszinkron betölt.
 */

type Allapot =
  | { fazis: 'betolt' }
  | { fazis: 'ki' }
  | { fazis: 'be'; factorId: string; szabadKod: number; elhasznaltKod: number }
  | { fazis: 'enroll'; factorId: string; qr: string; secret: string }
  | { fazis: 'mentokodok'; kodok: string[] }

export function TwoFactorCard() {
  const [allapot, setAllapot] = useState<Allapot>({ fazis: 'betolt' })
  const [kod, setKod] = useState('')
  const [dolgozik, setDolgozik] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.all([supabase.auth.mfa.listFactors(), getMentokodStatus()])
      .then(([f, m]) => {
        if (cancelled) return
        const totp = (f.data?.totp || []).find((x) => x.status === 'verified')
        if (totp) setAllapot({ fazis: 'be', factorId: totp.id, szabadKod: m.szabad, elhasznaltKod: m.elhasznalt })
        else setAllapot({ fazis: 'ki' })
      })
      .catch(() => {
        if (!cancelled) setAllapot({ fazis: 'ki' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function bekapcsol() {
    setDolgozik(true)
    try {
      const supabase = createClient()
      // Félbehagyott korábbi (nem ellenőrzött) faktor eltakarítása, hogy a
      // folyamat mindig tiszta QR-ral induljon.
      const { data: f } = await supabase.auth.mfa.listFactors()
      for (const regi of f?.totp || []) {
        if (regi.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: regi.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Kartotéka' })
      if (error || !data) {
        toast.error(`A bekapcsolás nem indult el: ${error?.message || 'ismeretlen hiba'}`)
        return
      }
      setKod('')
      setAllapot({ fazis: 'enroll', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } finally {
      setDolgozik(false)
    }
  }

  async function ellenoriz() {
    if (allapot.fazis !== 'enroll') return
    const tiszta = kod.replace(/\D/g, '')
    if (tiszta.length !== 6) {
      toast.error('A hitelesítő app 6 számjegyű kódját írd be.')
      return
    }
    setDolgozik(true)
    try {
      const supabase = createClient()
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: allapot.factorId })
      if (chErr || !ch) {
        toast.error(`Az ellenőrzés nem indult el: ${chErr?.message || 'ismeretlen hiba'}`)
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: allapot.factorId,
        challengeId: ch.id,
        code: tiszta,
      })
      if (vErr) {
        toast.error('A kód nem stimmel — nézd meg az appban a friss (30 mp-enként változó) számot.')
        return
      }
      // Sikeres ellenőrzés → KÖTELEZŐ mentőkód-generálás (kizárás-védelem).
      const mk = await generateMentokodok()
      await logMfaEsemeny('bekapcsolva')
      if (mk.error || !mk.kodok) {
        toast.warning(
          `A kétlépcsős belépés bekapcsolt, de a mentőkódok nem készültek el: ${mk.error || 'ismeretlen hiba'}. Generáld újra őket erről az oldalról!`,
          { duration: 15000 },
        )
        setAllapot({ fazis: 'be', factorId: allapot.factorId, szabadKod: 0, elhasznaltKod: 0 })
        return
      }
      setAllapot({ fazis: 'mentokodok', kodok: mk.kodok })
    } finally {
      setDolgozik(false)
    }
  }

  async function kikapcsol() {
    if (allapot.fazis !== 'be') return
    if (
      !confirm(
        'Biztosan kikapcsolod a kétlépcsős belépést? A fiókodat ezután csak a jelszó védi, és a mentőkódjaid érvénytelenné válnak.',
      )
    )
      return
    setDolgozik(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId: allapot.factorId })
      if (error) {
        toast.error(`A kikapcsolás nem sikerült: ${error.message}`)
        return
      }
      await logMfaEsemeny('kikapcsolva')
      toast.success('A kétlépcsős belépés kikapcsolva.')
      setAllapot({ fazis: 'ki' })
    } finally {
      setDolgozik(false)
    }
  }

  async function ujMentokodok() {
    if (!confirm('Új mentőkódokat kérsz? A korábbiak azonnal érvénytelenné válnak.')) return
    setDolgozik(true)
    try {
      const mk = await generateMentokodok()
      if (mk.error || !mk.kodok) {
        toast.error(mk.error || 'A mentőkódok nem készültek el.')
        return
      }
      setAllapot({ fazis: 'mentokodok', kodok: mk.kodok })
    } finally {
      setDolgozik(false)
    }
  }

  function nyomtatKodok() {
    if (allapot.fazis !== 'mentokodok') return
    const ablak = window.open('', '_blank', 'width=600,height=700')
    if (!ablak) return
    ablak.document.write(
      `<html><head><title>Kartotéka — mentőkódok</title></head><body style="font-family:monospace;padding:24px"><h2>Kartotéka — 2FA mentőkódok</h2><p>Mindegyik kód egyszer használható. Tartsd biztonságos helyen!</p><ol>${allapot.kodok
        .map((k) => `<li style="font-size:18px;margin:6px 0">${k}</li>`)
        .join('')}</ol></body></html>`,
    )
    ablak.document.close()
    ablak.print()
  }

  return (
    <div className="card-raised space-y-4 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <h2 className="font-heading text-lg text-slate-800">Kétlépcsős belépés (2FA)</h2>
      </div>

      {allapot.fazis === 'betolt' && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Betöltés…
        </div>
      )}

      {allapot.fazis === 'ki' && (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            A kétlépcsős belépés a jelszó mellé egy <strong>második zárat</strong> tesz a fiókodra:
            belépéskor a telefonod hitelesítő alkalmazása (Google Authenticator, Microsoft
            Authenticator vagy Aegis) 6 számjegyű, 30 másodpercenként változó kódját is be kell írni.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>A bekapcsolás egyszeri, kb. 2 perc; belépéskor ez +5 másodperc.</li>
            <li>Nem kell hozzá SMS és internet sem a telefonon — külföldön is ugyanúgy működik.</li>
            <li>Kapsz 8 nyomtatható mentőkódot — ha a telefon elveszne, ezekkel akkor is bejutsz.</li>
            <li>Önkéntes: ha nem kapcsolod be, semmi nem változik.</li>
          </ul>
          <Button onClick={bekapcsol} disabled={dolgozik} className="gap-2">
            {dolgozik ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Kétlépcsős belépés bekapcsolása
          </Button>
        </div>
      )}

      {allapot.fazis === 'enroll' && (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <strong>1. lépés:</strong> nyisd meg a telefonodon a hitelesítő alkalmazást, és olvasd be
            ezt a QR-kódot:
          </p>
          <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-3">
            {/* A Supabase SVG-QR-t ad — adat-URI-ként jelenítjük meg. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                allapot.qr.startsWith('data:')
                  ? allapot.qr
                  : `data:image/svg+xml;utf8,${encodeURIComponent(allapot.qr)}`
              }
              alt="2FA QR-kód"
              width={190}
              height={190}
            />
          </div>
          <p className="text-xs text-slate-500">
            Ha a QR nem olvasható, kézzel is beírhatod az appba: <code className="select-all">{allapot.secret}</code>
          </p>
          <p>
            <strong>2. lépés:</strong> írd be az app által mutatott 6 számjegyű kódot:
          </p>
          <div className="flex gap-2">
            <Input
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              inputMode="numeric"
              maxLength={7}
              placeholder="123 456"
              className="max-w-40 text-center text-lg tracking-widest"
            />
            <Button onClick={ellenoriz} disabled={dolgozik} className="gap-2">
              {dolgozik ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ellenőrzés
            </Button>
          </div>
        </div>
      )}

      {allapot.fazis === 'mentokodok' && (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="font-semibold text-emerald-700">A kétlépcsős belépés bekapcsolt. ✅</p>
          <p>
            Ezek a <strong>mentőkódjaid</strong> — mindegyik egyszer használható, és ha a telefonod
            elveszne, ezekkel akkor is be tudsz lépni. <strong>MOST mentsd el</strong> (nyomtasd ki
            vagy írd fel) — később nem jelennek meg újra:
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-base sm:grid-cols-4">
            {allapot.kodok.map((k) => (
              <span key={k} className="select-all">{k}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={nyomtatKodok} className="gap-2">
              <Printer className="h-4 w-4" /> Nyomtatás
            </Button>
            <Button
              onClick={() => {
                setAllapot({ fazis: 'betolt' })
                const supabase = createClient()
                Promise.all([supabase.auth.mfa.listFactors(), getMentokodStatus()]).then(([f, m]) => {
                  const totp = (f.data?.totp || []).find((x) => x.status === 'verified')
                  if (totp) setAllapot({ fazis: 'be', factorId: totp.id, szabadKod: m.szabad, elhasznaltKod: m.elhasznalt })
                  else setAllapot({ fazis: 'ki' })
                })
              }}
            >
              Elmentettem a kódokat
            </Button>
          </div>
        </div>
      )}

      {allapot.fazis === 'be' && (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="font-semibold text-emerald-700">A kétlépcsős belépés BE van kapcsolva. ✅</p>
          <p className="text-slate-600">
            Mentőkódok: <strong>{allapot.szabadKod} szabad</strong>
            {allapot.elhasznaltKod > 0 ? ` · ${allapot.elhasznaltKod} elhasznált` : ''}. Ha elfogytak
            vagy elvesztek, generálj újakat.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={ujMentokodok} disabled={dolgozik} className="gap-2">
              <KeyRound className="h-4 w-4" /> Új mentőkódok
            </Button>
            <Button
              variant="outline"
              onClick={kikapcsol}
              disabled={dolgozik}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
            >
              <ShieldOff className="h-4 w-4" /> Kikapcsolás
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
