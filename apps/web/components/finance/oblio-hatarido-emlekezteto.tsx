'use client'

/**
 * ANAF 60 napos határidő — emlékeztető e-mail KÉRÉSRE (2026-09-03).
 *
 * Endre kérése: „a lelkész kérésére akár e-mailt is tudjon küldeni, hogy már
 * 2 hónapja nem volt Oblio import".
 *
 * ⚠️ A RENDSZER MAGÁTÓL SOHA NEM KÜLD LEVELET. Ez a kártya csak akkor jelenik
 * meg, ha a határidő tényleg közeledik vagy lejárt, és a levél is kizárólag
 * tudatos kattintásra megy el. A címzett alapból a saját cím — más címzettet
 * külön be kell írni, és a küldés előtt a felület KIÍRJA, hova megy.
 *
 * Miért fontos: az ANAF SPV csak 60 napra visszamenőleg adja vissza a
 * befogadott számlákat. A 60. nap után a régebbieket már csak a beszállítótól
 * lehet elkérni, egyenként.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Mail, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  checkOblioDeadline,
  sendOblioDeadlineEmail,
} from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'

export function OblioHataridoEmlekezteto() {
  const [allapot, setAllapot] = useState<{
    mutat: boolean
    lejart: boolean
    eltelt?: number
    hatra?: number
    soha: boolean
  } | null>(null)
  const [nyitva, setNyitva] = useState(false)
  const [cimzett, setCimzett] = useState('')
  const [kuldes, setKuldes] = useState(false)

  useEffect(() => {
    let ervenyes = true
    void checkOblioDeadline()
      .then((r) => {
        if (!ervenyes) return
        // A kártya CSAK akkor jelenik meg, ha van miről szólni.
        const soha = r.status === 'never_downloaded'
        const mutat =
          soha || r.status === 'notified' || r.status === 'already_notified'
        setAllapot({
          mutat,
          lejart: (r.daysSince ?? 0) >= 60,
          eltelt: r.daysSince,
          hatra: r.daysRemaining,
          soha,
        })
      })
      .catch(() => {
        // A kártya elmaradása nem hiba a lelkész felé — a szerver naplóz.
        if (ervenyes) setAllapot(null)
      })
    return () => {
      ervenyes = false
    }
  }, [])

  if (!allapot?.mutat) return null

  const cim = allapot.soha
    ? 'Még nem volt e-Factura beolvasás'
    : allapot.lejart
      ? 'Lejárt az ANAF 60 napos letöltési határideje'
      : 'Közeledik az ANAF 60 napos letöltési határideje'

  const magyarazat = allapot.soha
    ? 'A rendszerben még egyetlen befogadott e-Factura beolvasás sincs rögzítve.'
    : allapot.lejart
      ? `${allapot.eltelt} napja (kb. ${Math.floor((allapot.eltelt ?? 0) / 30)} hónapja) nem volt beolvasás. Az ANAF SPV csak 60 napra visszamenőleg adja vissza a befogadott számlákat — az ennél régebbieket már csak a beszállítótól lehet elkérni.`
      : `${allapot.eltelt} napja nem volt beolvasás — még ${allapot.hatra} nap van hátra a 60 napos határidőig.`

  async function kuld() {
    setKuldes(true)
    try {
      const res = await sendOblioDeadlineEmail(
        cimzett.trim() ? { cimzettEmail: cimzett.trim() } : undefined,
      )
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Emlékeztető elküldve: ${res.cimzett}`)
      setNyitva(false)
      setCimzett('')
    } finally {
      setKuldes(false)
    }
  }

  return (
    <div
      className={`mb-4 rounded-2xl border p-4 ${
        allapot.lejart
          ? 'border-red-200 bg-red-50/70'
          : 'border-amber-200 bg-amber-50/70'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 size-5 shrink-0 ${allapot.lejart ? 'text-red-600' : 'text-amber-600'}`}
          aria-hidden
        />
        <div className="min-w-52 flex-1">
          <p className={`font-semibold ${allapot.lejart ? 'text-red-800' : 'text-amber-900'}`}>
            {cim}
          </p>
          <p className={`mt-1 text-sm ${allapot.lejart ? 'text-red-700' : 'text-amber-800'}`}>
            {magyarazat}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setNyitva((v) => !v)}
          className="shrink-0 bg-white"
        >
          <Mail className="mr-1.5 size-4" aria-hidden />
          Emlékeztető e-mail
        </Button>
      </div>

      {nyitva && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-700">
            Elküldjük ezt az emlékeztetőt e-mailben. Ha üresen hagyod a mezőt, a{' '}
            <strong>saját címedre</strong> megy — így egy elgépelés sem küld levelet idegennek.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="email"
              inputMode="email"
              value={cimzett}
              onChange={(e) => setCimzett(e.target.value)}
              placeholder="saját cím (hagyd üresen), vagy pl. a könyvelő címe"
              className="min-w-56 flex-1"
            />
            <Button type="button" onClick={kuld} disabled={kuldes}>
              {kuldes ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> Küldés…
                </>
              ) : (
                'Elküldöm'
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A Kartotéka magától soha nem küld ilyen levelet — csak most, erre a kattintásra.
          </p>
        </div>
      )}
    </div>
  )
}
