'use client'

/**
 * SZÜLETÉSNAPOS ÉS NÉVNAPOS NAPTÁR — nyomtatvány-modál (2026-09-05, Endre 2. pontja).
 *
 * MIÉRT: eddig nem volt nyomtatható köszöntő-NAPTÁR — a születésnapos lista
 * „Nyomtatás" gombja egy folyó táblázatot adott hónap-fejléc, névnap,
 * lapszám-őr és PDF-út nélkül. Ez a modál a `getNaptarRetegek(ev)` rétegeiből
 * (ugyanaz a forrás, mint az éves programtervé és a csempéé) a KÖZÖS,
 * DOM-mentes építővel (`buildKoszontoNaptar`, packages/ui-app) A4 álló, havi
 * blokkos naptárat állít elő: nap | 🎂 Név (kor) | 💐 Név (névnap-név).
 *
 * SZŰRŐK (a modál fejléce alatt): hónap-tartomány (alap: egész év), csak
 * születésnap / csak névnap / mindkettő, életkor kiírása (alap: igen a
 * felnőtteknél; a kiskorúak kora ALAPBÓL NEM — csak a név), év-lapozás.
 *
 * ADAT: a `retegek` propból, ha a hívó adja (és az évre szól); különben a
 * modál tölti be megnyitáskor — a betöltés és a hiba LÁTHATÓ (nem néma üres
 * naptár). A nyomtatás/PDF tényét a KÖZÖS `naplozNaptarNyomtatas` akció
 * naplózza (`koszonto` fajta) — ugyanaz a naplózó, mint az éves programterv
 * lelkészi példányáé (személyes adat hagyja el a rendszert papíron).
 */

import { useCallback, useMemo, useState } from 'react'
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { HU_MONTHS } from '@/lib/constants/dashboard'
import { getNaptarRetegek, naplozNaptarNyomtatas } from '@/app/(dashboard)/naptar/retegek-actions'
import type { NaptarRetegek } from '@/lib/calendar/naptar-retegek-types'
// MÉLY import (nem a barrel): a ui-app barrel 'use client' komponenseket is
// exportál; az építő tiszta függvény — a desktop ugyanezt húzza majd.
import {
  buildKoszontoNaptar,
  KOSZONTO_OPCIOK_ALAP,
  type KoszontoMod,
} from '@kartoteka/ui-app/src/members/koszonto-naptar'
import { NaptarNyomtatvanyModal } from './naptar-nyomtatvany-modal'

export interface SzuletesnaposNaptarPrintProps {
  year: number
  congregationName: string
  congregationLogo?: string | null
  /** Előre betöltött rétegek (a csempe adja); ha hiányzik, a komponens tölti be. */
  retegek?: NaptarRetegek | null
  /** Ikonos indítógomb a kompakt akciósávhoz. */
  compact?: boolean
}

interface Nezet { year: number; retegek: NaptarRetegek }
type Epites = { html: string; sheetCount: number; filename: string; szuletesnapDb: number; nevnapDb: number } | { hiba: string }

const MOD_CIMKE: Record<KoszontoMod, string> = {
  mindketto: 'Mindkettő',
  szuletesnap: 'Csak születésnap',
  nevnap: 'Csak névnap',
}
const HONAPOK = HU_MONTHS.map((nev, i) => ({ ertek: i + 1, nev }))

function keszultFelirat(d: Date): string {
  return `${d.getFullYear()}. ${HU_MONTHS[d.getMonth()].toLowerCase()} ${d.getDate()}.`
}

/** A címer adat-URL-ként — a PDF-render és a nyomtatás is biztosan látja (CORS-mentes). */
async function logoAdatUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function SzuletesnaposNaptarPrint({ year, congregationName, congregationLogo, retegek, compact }: SzuletesnaposNaptarPrintProps) {
  const [open, setOpen] = useState(false)
  const [nezet, setNezet] = useState<Nezet | null>(null)
  const [betolt, setBetolt] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [celEv, setCelEv] = useState(year)
  const [mod, setMod] = useState<KoszontoMod>(KOSZONTO_OPCIOK_ALAP.mod)
  const [honapTol, setHonapTol] = useState(1)
  const [honapIg, setHonapIg] = useState(12)
  const [eletkor, setEletkor] = useState(KOSZONTO_OPCIOK_ALAP.eletkor)
  const [kiskoruKor, setKiskoruKor] = useState(KOSZONTO_OPCIOK_ALAP.kiskoruKor)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [keszult, setKeszult] = useState('')

  const gyulekezetNev = congregationName || 'Gyülekezet'

  /** Az év rétegei — LÁTHATÓ betöltéssel és hibával (soha nem néma üres naptár). */
  async function retegekBetoltese(ev: number) {
    setCelEv(ev)
    setBetolt(true)
    setHiba(null)
    try {
      const r = await getNaptarRetegek(ev)
      setNezet({ year: ev, retegek: r })
      for (const h of r.hibak) toast.warning(h.uzenet)
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      setHiba(`A(z) ${ev}. év születésnapjai és névnapjai nem tölthetők be: ${uzenet}`)
      toast.error(`A köszöntő naptár adatai nem tölthetők be: ${uzenet}`)
    } finally {
      setBetolt(false)
    }
  }

  function megnyit() {
    setOpen(true)
    setHiba(null)
    setKeszult(keszultFelirat(new Date()))
    if (retegek && retegek.ev === year) {
      setCelEv(year)
      setNezet({ year, retegek })
      for (const h of retegek.hibak) toast.warning(h.uzenet)
    } else {
      void retegekBetoltese(year)
    }
    if (congregationLogo && !logoDataUrl) {
      void logoAdatUrl(congregationLogo).then((u) => { if (u) setLogoDataUrl(u) })
    }
  }
  const bezar = useCallback(() => setOpen(false), [])

  const epites = useMemo<Epites | null>(() => {
    if (!nezet) return null
    try {
      const r = buildKoszontoNaptar({
        ev: nezet.year,
        honapTol,
        honapIg,
        gyulekezetNev,
        logoUrl: logoDataUrl ?? congregationLogo ?? null,
        szuletesnapok: nezet.retegek.szuletesnapok,
        nevnapok: nezet.retegek.nevnapok,
        opciok: { mod, eletkor, kiskoruKor },
        keszult,
      })
      return { html: r.html, sheetCount: r.sheetCount, filename: r.filename, szuletesnapDb: r.szuletesnapDb, nevnapDb: r.nevnapDb }
    } catch (e) {
      return { hiba: `A naptár nem állítható elő: ${e instanceof Error ? e.message : 'ismeretlen hiba'}` }
    }
  }, [nezet, honapTol, honapIg, gyulekezetNev, logoDataUrl, congregationLogo, mod, eletkor, kiskoruKor, keszult])

  const kesz = epites && !('hiba' in epites) ? epites : null
  const epitesHiba = epites && 'hiba' in epites ? epites.hiba : null

  /** A nyomtatás TÉNYÉNEK naplózása — best-effort, a nyomtatást nem blokkolja. */
  const naploz = () => {
    if (!nezet || !kesz) return
    void naplozNaptarNyomtatas({
      tipus: 'koszonto',
      ev: nezet.year,
      szurok: {
        mod, honapTol, honapIg, eletkor, kiskoruKor,
        szuletesnapDb: kesz.szuletesnapDb, nevnapDb: kesz.nevnapDb, lapszam: kesz.sheetCount,
      },
    }).catch(() => { /* a naplózás hibája nem akadályozhatja a nyomtatást */ })
  }

  const retegHibak = nezet?.retegek.hibak ?? []
  const nincsAdat = !!nezet && nezet.retegek.szuletesnapok.length === 0 && nezet.retegek.nevnapok.length === 0 && retegHibak.length === 0

  const honapValt = (mezo: 'tol' | 'ig', ertek: number) => {
    if (mezo === 'tol') {
      setHonapTol(ertek)
      if (ertek > honapIg) setHonapIg(ertek)
    } else {
      setHonapIg(ertek)
      if (ertek < honapTol) setHonapTol(ertek)
    }
  }

  const beallitasok = (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kt-label">Mit mutasson</span>
        <div className="kt-segmented" role="radiogroup" aria-label="Mit mutasson">
          {(Object.keys(MOD_CIMKE) as KoszontoMod[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mod === m} className={`kt-seg${mod === m ? ' is-active' : ''}`} style={{ minHeight: 44 }} onClick={() => setMod(m)}>
              {MOD_CIMKE[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kt-label">Hónapok</span>
        <div className="flex items-center gap-2">
          <select className="kt-input" style={{ minHeight: 44 }} value={honapTol} onChange={(e) => honapValt('tol', Number(e.target.value))} aria-label="Kezdő hónap">
            {HONAPOK.map((h) => <option key={h.ertek} value={h.ertek}>{h.nev}</option>)}
          </select>
          <span className="text-muted-foreground">–</span>
          <select className="kt-input" style={{ minHeight: 44 }} value={honapIg} onChange={(e) => honapValt('ig', Number(e.target.value))} aria-label="Záró hónap">
            {HONAPOK.map((h) => <option key={h.ertek} value={h.ertek}>{h.nev}</option>)}
          </select>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kt-label">Életkor</span>
        <div className="kt-toggle-row">
          <label className="kt-switch" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={eletkor} onChange={(e) => setEletkor(e.target.checked)} />
            <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
            Életkor kiírása
          </label>
          <label className={`kt-switch${eletkor ? '' : ' opacity-50'}`} style={{ minHeight: 44 }}>
            <input type="checkbox" checked={kiskoruKor} disabled={!eletkor} onChange={(e) => setKiskoruKor(e.target.checked)} />
            <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
            A 18 alattiak kora is
          </label>
        </div>
        <span className="text-xs text-muted-foreground">
          Születési év sosem kerül a lapra; a kiskorúak alapból csak névvel szerepelnek. A nyomtatás ténye naplózódik.
        </span>
        {retegHibak.length > 0 ? (
          <ul className="m-0 list-disc pl-4 text-xs text-destructive">
            {retegHibak.map((h) => <li key={h.reteg}>{h.uzenet}</li>)}
          </ul>
        ) : null}
        {nincsAdat ? (
          <span className="text-xs text-muted-foreground">Ebben az évben nincs köszöntendő tag a nyilvántartásban (születési dátum nélkül nincs születésnap; névnap csak egyező keresztnévvel).</span>
        ) : null}
      </div>
    </>
  )

  const fejlecExtra = (
    <div className="kt-eves-yearnav">
      <button type="button" style={{ width: 44, height: 44 }} onClick={() => retegekBetoltese(celEv - 1)} disabled={betolt} aria-label="Előző év"><ChevronLeft size={16} /></button>
      <span>{celEv}</span>
      <button type="button" style={{ width: 44, height: 44 }} onClick={() => retegekBetoltese(celEv + 1)} disabled={betolt} aria-label="Következő év"><ChevronRight size={16} /></button>
    </div>
  )

  return (
    <>
      {compact ? (
        <button type="button" className="kt-iconbtn" onClick={megnyit} title="Születésnapos és névnapos naptár" aria-label="Születésnapos és névnapos naptár">
          <Cake size={16} />
        </button>
      ) : (
        <button type="button" className="kt-btn kt-btn-outline" onClick={megnyit}>
          <Cake size={16} /> Születésnapos naptár
        </button>
      )}

      <NaptarNyomtatvanyModal
        open={open}
        onClose={bezar}
        cim="Születésnapos és névnapos naptár"
        alcim={gyulekezetNev}
        ikon={<Cake size={18} />}
        ariaLabel={`Születésnapos és névnapos naptár ${celEv}`}
        html={kesz?.html ?? null}
        sheetCount={kesz?.sheetCount ?? 0}
        filename={kesz?.filename ?? `Koszonto_naptar_${celEv}.pdf`}
        orientation="portrait"
        betolt={betolt}
        betoltFelirat={`A(z) ${celEv}. év születésnapjai és névnapjai töltődnek…`}
        hiba={hiba ?? epitesHiba}
        onUjra={hiba ? () => retegekBetoltese(celEv) : undefined}
        fejlecExtra={fejlecExtra}
        beallitasok={beallitasok}
        onNyomtatasElott={naploz}
      />
    </>
  )
}
