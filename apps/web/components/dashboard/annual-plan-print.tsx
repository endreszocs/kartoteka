'use client'

/**
 * ÉVES PROGRAMTERV — nyomtatvány-modál (2026-09-05, Endre 2. pontja: ÚJRATERVEZÉS).
 *
 * ⛔ MI VOLT A HIBA: a 2026-06-08-i egylapos nyomtatványon a NORMÁL prioritású
 *    program (az alapértelmezett!) csak egy 3 px-es pötty volt, a neve sehol —
 *    a lelkész joggal látta úgy, hogy „a mentett programok nem jelennek meg".
 *
 * MOST: a HTML-t a KÖZÖS, DOM-mentes építő adja (`buildEvesNaptar`,
 * packages/ui-app) — 1. lap Áttekintő + HAVI LAPOK minden program NEVÉVEL,
 * idejével, helyszínével; két változat (gyülekezeti terjesztésre / lelkészi
 * példány); anyakönyvi, születésnapi, névnapi réteg a kapcsolók szerint.
 * A modál csak az adatot gyűjti (programok + ünnepek + rétegek), az opciókat
 * tartja, és a közös előnézet-modállal (`NaptarNyomtatvanyModal`) nyomtat.
 *
 * ÁLLAPOT-SZABÁLY (cal-print-12): év + programok + rétegek EGY állapotban, a
 * betöltés UTÁN cserélve — nem épül „új év a régi programokkal", és a szülő
 * újratöltése sem ugrasztja vissza az évet (nincs effekt a propokra).
 *
 * Az ismétlődés-kibontás a webes `expandProgramOccurrences` — az építő a MÁR
 * KIBONTOTT előfordulásokat kapja, a logika egy helyen él.
 *
 * NAPLÓZÁS (cal-birthday-8): a LELKÉSZI példány a bekapcsolt rétegekkel a
 * tagok nevét és korát, az anyakönyvi neveket teszi papírra — ugyanaz az
 * adat, mint a köszöntő naptáré. A Nyomtatás/PDF ténye ezért ugyanazzal a
 * `naplozNaptarNyomtatas` akcióval kerül a betekintés-naplóba (a bíráló
 * találata: két csatorna, csak az egyik naplózott).
 */

import { useCallback, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { toast } from 'sonner'
import {
  HU_MONTHS,
  MAGAN_PROGRAM_TIPUSOK,
  PROGRAM_TYPES,
  PROG_TIPUS_COLOR,
  PROG_TIPUS_EMOJI,
  PROG_TIPUS_LABELS,
} from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import { getUnnepnapokForYear } from '@/lib/utils/reformed-holidays'
import { getProgramsForYear } from '@/app/(dashboard)/programs/actions'
import { getNaptarRetegek, naplozNaptarNyomtatas } from '@/app/(dashboard)/naptar/retegek-actions'
import { NAPTAR_RETEG_ALAP } from '@/lib/calendar/naptar-retegek-types'
import type { NaptarRetegKapcsolok, NaptarRetegek } from '@/lib/calendar/naptar-retegek-types'
// MÉLY import (nem a barrel): a ui-app barrel 'use client' komponenseket is
// exportál; az építő tiszta függvény, ugyanezt húzza majd a desktop is.
import {
  buildEvesNaptar,
  type EvesNaptarTipusMeta,
  type EvesNaptarValtozat,
} from '@kartoteka/ui-app/src/dashboard/eves-naptar-print'
import { NaptarNyomtatvanyModal } from './naptar-nyomtatvany-modal'

interface AnnualPlanPrintProps {
  allPrograms: Program[]
  year: number
  congregationName: string
  congregationLogo?: string | null
  /** 2026-08-10: ikonos (felirat nélküli) indítógomb a kompakt akciósávhoz. */
  compact?: boolean
  /**
   * 2026-09-05: a naptár-rétegek (anyakönyvi események, születésnapok,
   * névnapok) az adott évre — a csempe adja át; ha hiányzik (vagy más évre
   * szól), a modál maga tölti be a `getNaptarRetegek` akcióval.
   */
  retegek?: NaptarRetegek | null
}

interface Vezerige { text: string; ref: string }

/**
 * Az év vezérigéi — ALAPÉRTÉK, a modál opció-panelén felülírható (a szerkesztés
 * a nyomtatásra megy, nem mentődik — Endre kérése).
 * ⚠️ Forrás-megjelölés nincs (a 2025-ös tétel nem az ökumenikus évi ige —
 * nyitott kérdés Endrénél, brief 8/5); a lelkész a mezőben átírhatja.
 */
const EVI_IGE: Record<number, Vezerige> = {
  2024: { text: 'Minden dolgotok szeretetben menjen végbe!', ref: '1Korinthus 16,14' },
  2025: { text: 'Maradjatok meg az én szeretetemben.', ref: 'János 15,9' },
  2026: { text: 'Az Úr az én világosságom és üdvösségem: kitől féljek?', ref: 'Zsoltárok 27,1' },
  2027: { text: 'Hálát adok az én Istenemnek mindenkor ti felőletek.', ref: '1Korinthus 1,4' },
  2028: { text: 'Az Úr megőrzi a te ki- és bemeneteledet, mostantól fogva mindörökké.', ref: 'Zsoltárok 121,8' },
  2029: { text: 'Legyetek erősek az Úrban és az ő hatalmas erejében.', ref: 'Efézus 6,10' },
  2030: { text: 'Az Úr közel! Semmi felől ne aggódjatok.', ref: 'Filippi 4,5–6' },
}
const EVI_IGE_ALAP: Vezerige = { text: 'Mindennek rendelt ideje van, és ideje van az ég alatt minden akaratnak.', ref: 'Prédikátor 3,1' }

/** Típus-megjelenítés az építőnek — EGY forrás: constants/dashboard.ts. */
const TIPUS_META: Record<string, EvesNaptarTipusMeta> = Object.fromEntries(
  PROGRAM_TYPES.map((t) => [t, { cimke: PROG_TIPUS_LABELS[t], szin: PROG_TIPUS_COLOR[t], emoji: PROG_TIPUS_EMOJI[t] }]),
)

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

interface Nezet {
  year: number
  programs: Program[]
  retegek: NaptarRetegek | null
}

type Epites = { html: string; sheetCount: number; filename: string } | { hiba: string }

const KAPCSOLO_CIMKE: Record<keyof NaptarRetegKapcsolok, string> = {
  anyakonyv: 'Anyakönyvi események',
  szuletesnapok: 'Születésnapok',
  nevnapok: 'Névnapok',
}

export function AnnualPlanPrint({ allPrograms, year, congregationName, congregationLogo, compact, retegek }: AnnualPlanPrintProps) {
  const [open, setOpen] = useState(false)
  const [nezet, setNezet] = useState<Nezet | null>(null)
  const [betolt, setBetolt] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [retegHiba, setRetegHiba] = useState<string | null>(null)
  const [celEv, setCelEv] = useState(year)
  const [valtozat, setValtozat] = useState<EvesNaptarValtozat>('lelkeszi')
  const [kapcsolok, setKapcsolok] = useState<NaptarRetegKapcsolok>(NAPTAR_RETEG_ALAP)
  /** Évenként külön őrzött szerkesztés — évváltásnál az adott év alapértéke jön vissza. */
  const [vezerigeSzerk, setVezerigeSzerk] = useState<Record<number, Vezerige>>({})
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [keszult, setKeszult] = useState('')

  const gyulekezetNev = congregationName || 'Gyülekezet'

  const retegekBetoltese = useCallback(async (ev: number) => {
    try {
      const r = await getNaptarRetegek(ev)
      // Csak akkor kerül be, ha közben nem léptünk másik évre.
      setNezet((n) => (n && n.year === ev ? { ...n, retegek: r } : n))
      for (const h of r.hibak) toast.warning(h.uzenet)
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      setRetegHiba(`A naptár-rétegek (anyakönyv, születésnapok, névnapok) nem tölthetők be: ${uzenet}`)
      toast.error(`A naptár-rétegek nem tölthetők be: ${uzenet}`)
    }
  }, [])

  function megnyit() {
    setOpen(true)
    setHiba(null)
    setRetegHiba(null)
    setCelEv(year)
    setKeszult(keszultFelirat(new Date()))
    const kezdoRetegek = retegek && retegek.ev === year ? retegek : null
    setNezet({ year, programs: allPrograms, retegek: kezdoRetegek })
    if (kezdoRetegek) {
      for (const h of kezdoRetegek.hibak) toast.warning(h.uzenet)
    } else {
      void retegekBetoltese(year)
    }
    if (congregationLogo && !logoDataUrl) {
      void logoAdatUrl(congregationLogo).then((u) => { if (u) setLogoDataUrl(u) })
    }
  }
  const bezar = useCallback(() => setOpen(false), [])

  /** Évváltás: programok + rétegek EGYÜTT, a betöltés UTÁN egy állapotcserével. */
  async function evBetoltese(ny: number) {
    setCelEv(ny)
    setBetolt(true)
    setHiba(null)
    setRetegHiba(null)
    try {
      const [programs, r] = await Promise.all([
        getProgramsForYear(ny),
        getNaptarRetegek(ny).catch((e: unknown) => {
          const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
          setRetegHiba(`A naptár-rétegek nem tölthetők be: ${uzenet}`)
          return null
        }),
      ])
      setNezet({ year: ny, programs, retegek: r })
      if (r) for (const h of r.hibak) toast.warning(h.uzenet)
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      setHiba(`A(z) ${ny}. év programjai nem tölthetők be: ${uzenet}`)
      toast.error(`A(z) ${ny}. év programjai nem tölthetők be: ${uzenet}`)
    } finally {
      setBetolt(false)
    }
  }

  const vezerige: Vezerige = nezet ? (vezerigeSzerk[nezet.year] ?? EVI_IGE[nezet.year] ?? EVI_IGE_ALAP) : EVI_IGE_ALAP
  const vezerigeIr = (mezo: keyof Vezerige, ertek: string) => {
    if (!nezet) return
    const ev = nezet.year
    setVezerigeSzerk((s) => ({ ...s, [ev]: { ...(s[ev] ?? EVI_IGE[ev] ?? EVI_IGE_ALAP), [mezo]: ertek } }))
  }

  const epites = useMemo<Epites | null>(() => {
    if (!nezet) return null
    try {
      const r = buildEvesNaptar({
        ev: nezet.year,
        gyulekezetNev,
        logoUrl: logoDataUrl ?? congregationLogo ?? null,
        vezerige,
        elofordulasok: expandProgramOccurrences(nezet.programs, nezet.year),
        unnepek: getUnnepnapokForYear(nezet.year),
        retegek: nezet.retegek,
        tipusMeta: TIPUS_META,
        maganTipusok: MAGAN_PROGRAM_TIPUSOK,
        valtozat,
        kapcsolok,
        keszult,
      })
      return { html: r.html, sheetCount: r.sheetCount, filename: r.filename }
    } catch (e) {
      return { hiba: `A nyomtatvány nem állítható elő: ${e instanceof Error ? e.message : 'ismeretlen hiba'}` }
    }
  }, [nezet, gyulekezetNev, logoDataUrl, congregationLogo, vezerige, valtozat, kapcsolok, keszult])

  const retegHibak = nezet?.retegek?.hibak ?? []
  const lelkeszi = valtozat === 'lelkeszi'

  const beallitasok = (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kt-label">Változat</span>
        <div className="kt-segmented" role="radiogroup" aria-label="Változat">
          <button type="button" role="radio" aria-checked={lelkeszi} className={`kt-seg${lelkeszi ? ' is-active' : ''}`} style={{ minHeight: 44 }} onClick={() => setValtozat('lelkeszi')}>
            Lelkészi példány
          </button>
          <button type="button" role="radio" aria-checked={!lelkeszi} className={`kt-seg${!lelkeszi ? ' is-active' : ''}`} style={{ minHeight: 44 }} onClick={() => setValtozat('gyulekezeti')}>
            Gyülekezeti terjesztésre
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {lelkeszi
            ? 'Mindennel: szabadság, anyakönyvi alkalmak és a bekapcsolt rétegek. A személyes rétegek nyomtatása naplózódik.'
            : 'Kiosztható: a szabadság, az anyakönyvi alkalmak és a személyes rétegek nélkül.'}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kt-label">Rétegek {lelkeszi ? '' : <span className="font-normal text-muted-foreground">(csak lelkészi példányon)</span>}</span>
        <div className="kt-toggle-row">
          {(Object.keys(KAPCSOLO_CIMKE) as Array<keyof NaptarRetegKapcsolok>).map((k) => (
            <label key={k} className={`kt-switch${lelkeszi ? '' : ' opacity-50'}`} style={{ minHeight: 44 }}>
              <input
                type="checkbox"
                checked={kapcsolok[k]}
                disabled={!lelkeszi}
                onChange={(e) => setKapcsolok((s) => ({ ...s, [k]: e.target.checked }))}
              />
              <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
              {KAPCSOLO_CIMKE[k]}
            </label>
          ))}
        </div>
        {(retegHiba || retegHibak.length > 0) ? (
          <ul className="m-0 list-disc pl-4 text-xs text-destructive">
            {retegHiba ? <li>{retegHiba}</li> : null}
            {retegHibak.map((h) => <li key={h.reteg}>{h.uzenet}</li>)}
          </ul>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
        <label className="kt-label" htmlFor="eves-vezerige-szoveg">Az év vezérigéje</label>
        <input
          id="eves-vezerige-szoveg"
          className="kt-input"
          style={{ minHeight: 44 }}
          value={vezerige.text}
          onChange={(e) => vezerigeIr('text', e.target.value)}
          placeholder="Az igevers szövege"
        />
        <input
          className="kt-input"
          style={{ minHeight: 44 }}
          value={vezerige.ref}
          onChange={(e) => vezerigeIr('ref', e.target.value)}
          placeholder="Igehely (pl. Zsoltárok 27,1)"
          aria-label="Igehely"
        />
      </div>
    </>
  )

  const fejlecExtra = (
    <div className="kt-eves-yearnav">
      <button type="button" style={{ width: 44, height: 44 }} onClick={() => evBetoltese(celEv - 1)} disabled={betolt} aria-label="Előző év"><ChevronLeft size={16} /></button>
      <span>{celEv}</span>
      <button type="button" style={{ width: 44, height: 44 }} onClick={() => evBetoltese(celEv + 1)} disabled={betolt} aria-label="Következő év"><ChevronRight size={16} /></button>
    </div>
  )

  const epitesHiba = epites && 'hiba' in epites ? epites.hiba : null
  const kesz = epites && !('hiba' in epites) ? epites : null

  /**
   * A nyomtatás TÉNYÉNEK naplózása — best-effort, a nyomtatást nem blokkolja.
   * KAPU: csak a lelkészi példány, és csak ha legalább egy személyes réteg be
   * van kapcsolva ÉS a rétegek be is töltődtek (az építő `retegekAktiv`
   * feltétele ugyanez — réteg nélkül nem kerül tagnév a papírra). A tételszámok
   * a metadata-ba mennek: a naplóból látszik, MI ment ki.
   */
  const naploz = () => {
    if (!nezet || !kesz || valtozat !== 'lelkeszi' || !nezet.retegek) return
    if (!(kapcsolok.anyakonyv || kapcsolok.szuletesnapok || kapcsolok.nevnapok)) return
    const r = nezet.retegek
    void naplozNaptarNyomtatas({
      tipus: 'eves_terv',
      ev: nezet.year,
      szurok: {
        valtozat,
        anyakonyv: kapcsolok.anyakonyv,
        szuletesnapok: kapcsolok.szuletesnapok,
        nevnapok: kapcsolok.nevnapok,
        anyakonyvDb: kapcsolok.anyakonyv ? r.anyakonyv.length : 0,
        szuletesnapDb: kapcsolok.szuletesnapok ? r.szuletesnapok.length : 0,
        nevnapDb: kapcsolok.nevnapok ? r.nevnapok.length : 0,
        lapszam: kesz.sheetCount,
      },
    }).catch(() => { /* a naplózás hibája nem akadályozhatja a nyomtatást */ })
  }

  return (
    <>
      {/* 2026-08-10: `compact` = ikonos indítógomb az irányítópult-csempe
          egysoros akciósávjához (a felirat a tooltipbe költözik). */}
      {compact ? (
        <button type="button" className="kt-iconbtn" onClick={megnyit} title="Éves programterv" aria-label="Éves programterv">
          <Printer size={16} />
        </button>
      ) : (
        <button type="button" className="kt-btn kt-btn-outline" onClick={megnyit}>
          <Printer size={16} /> Éves terv
        </button>
      )}

      <NaptarNyomtatvanyModal
        open={open}
        onClose={bezar}
        cim="Éves programterv"
        alcim={gyulekezetNev}
        ikon={<Printer size={18} />}
        ariaLabel={`Éves programterv ${celEv}`}
        html={kesz?.html ?? null}
        sheetCount={kesz?.sheetCount ?? 0}
        filename={kesz?.filename ?? `Eves_programterv_${celEv}.pdf`}
        orientation="landscape"
        betolt={betolt}
        betoltFelirat={`A(z) ${celEv}. év programjai töltődnek…`}
        hiba={hiba ?? epitesHiba}
        onUjra={hiba ? () => evBetoltese(celEv) : undefined}
        fejlecExtra={fejlecExtra}
        beallitasok={beallitasok}
        onNyomtatasElott={naploz}
      />
    </>
  )
}
