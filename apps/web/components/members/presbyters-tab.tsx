'use client'

/**
 * Tisztségek fül (2026-08-26, 5. kör) — a korábbi lapos „Presbiterek" kártyarács
 * helyett HÁROM al-fül:
 *   1. Presbitérium — fokozat (teljes/pót/tb.), funkció (főgondnok/gondnok),
 *      mandátum-lejárat badge, körzet, kánoni létszám-őr (4–36), egyszeri
 *      mandátum-feltöltő banner, „Új ciklus" varázsló;
 *   2. Bizottságok — gazdasági/leltározó/diakóniai szekciók (elnök kiemelve);
 *   3. Egyéb tisztségek — kántor, diakónus, elnökök, önkéntesek, küldött.
 *
 * MIÉRT 3 al-fül és nem 5 (Endre-döntés): telefonon az 5 fül két egymásba
 * ágyazott, csonkolódó fül-sort adna; a 3–7 fős bizottságok egy görgetéssel
 * áttekinthetők szekciókként.
 *
 * A komponens-név (PresbytersTab) szándékosan változatlan — a member-tabs-v4
 * lazy importja így nem törik.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserCheck, Phone, MapPin, Edit2, Trash2, CalendarClock, Globe2, Users, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  getPresbyters,
  getPresbiteriCiklusEv,
  deletePresbyterRow,
  lezarPresbiterMandatum,
  backfillPresbiterMandatumok,
  ujPresbiteriCiklus,
  type PresbiterRow,
} from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import {
  getTisztsegek,
  deleteTisztseg,
  lezarTisztsegMandatum,
  type TisztsegRow,
} from '@/app/(dashboard)/tagnyilvantartas/tisztseg-actions'
import { PresbiterFormDialog } from '@/components/modals/presbyter-form-dialog'
import { TisztsegFormDialog } from '@/components/modals/tisztseg-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ageFromDate } from '@/lib/utils/date'
import {
  aktivE,
  mandatumAllapot,
  MANDATUM_BADGE,
  PRESBITER_FOKOZAT_CIMKEK,
  PRESBITER_FUNKCIO_CIMKEK,
  BIZOTTSAGOK,
  BIZOTTSAG_CIMKEK,
  TISZTSEG_TIPUS_CIMKEK,
  KANTOR_JELLEG_CIMKEK,
  PRESBITERIUM_MIN_LETSZAM,
  PRESBITERIUM_MAX_LETSZAM,
  type PresbiterFokozat,
  type BizottsagKod,
  type TisztsegTipus,
} from '@/lib/tisztsegek/shared'

type AlFul = 'presbiterium' | 'bizottsagok' | 'egyeb'

const BADGE_SZIN: Record<string, string> = {
  zold: 'border-0 bg-emerald-100 text-emerald-700',
  sarga: 'border-0 bg-amber-100 text-amber-700',
  piros: 'border-0 bg-red-100 text-red-700',
  szurke: 'border-0 bg-slate-100 text-slate-500',
  kek: 'border-0 bg-sky-100 text-sky-700',
}

function MandatumJelzes({ kezdete, vege }: { kezdete: string | null; vege: string | null }) {
  const allapot = mandatumAllapot(kezdete, vege)
  const badge = MANDATUM_BADGE[allapot]
  const felirat =
    allapot === 'nincs_megadva'
      ? badge.cimke
      : `${kezdete ? kezdete.replaceAll('-', '. ') + '.' : '?'} – ${vege ? vege.replaceAll('-', '. ') + '.' : 'határozatlan'} · ${badge.cimke}`
  return (
    <Badge className={`text-[10px] ${BADGE_SZIN[badge.szin]}`}>
      <CalendarClock className="mr-1 h-3 w-3" /> {felirat}
    </Badge>
  )
}

export function PresbytersTab() {
  const [alFul, setAlFul] = useState<AlFul>('presbiterium')
  const [presbiters, setPresbiters] = useState<PresbiterRow[]>([])
  const [tisztsegek, setTisztsegek] = useState<TisztsegRow[]>([])
  const [tisztsegHiba, setTisztsegHiba] = useState<string | null>(null)
  const [ciklusEv, setCiklusEv] = useState(3)
  const [loading, setLoading] = useState(true)

  const [presbiterFormOpen, setPresbiterFormOpen] = useState(false)
  const [presbiterEditRow, setPresbiterEditRow] = useState<PresbiterRow | null>(null)
  const [tisztsegFormOpen, setTisztsegFormOpen] = useState(false)
  const [tisztsegEditRow, setTisztsegEditRow] = useState<TisztsegRow | null>(null)
  const [tisztsegDefaults, setTisztsegDefaults] = useState<{ tipus?: TisztsegTipus; bizottsag?: BizottsagKod }>({})

  // Mandátum-lezárás dialógus (presbiter VAGY tisztség sorra).
  const [lezarasCel, setLezarasCel] = useState<{ tipus: 'presbiter'; id: number; nev: string } | { tipus: 'tisztseg'; id: string; nev: string } | null>(null)
  const [lezarasDatum, setLezarasDatum] = useState('')
  const [lezarasFut, setLezarasFut] = useState(false)

  // Egyszeri mandátum-feltöltő banner.
  const [backfillDatum, setBackfillDatum] = useState('')
  const [backfillFut, setBackfillFut] = useState(false)

  // Új ciklus varázsló.
  const [ciklusOpen, setCiklusOpen] = useState(false)

  const load = useCallback(async () => {
    const [presbData, tisztsegData, ciklus] = await Promise.all([
      getPresbyters(),
      getTisztsegek(),
      getPresbiteriCiklusEv(),
    ])
    setPresbiters(presbData)
    setTisztsegek(tisztsegData.rows)
    setTisztsegHiba(tisztsegData.error || null)
    setCiklusEv(ciklus)
    setLoading(false)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => { cancelled = true }
  }, [load])

  // ── Presbitérium statisztika ────────────────────────────────
  const aktivPresbiterek = useMemo(
    () => presbiters.filter(p => aktivE(p.kezdete, p.vege)),
    [presbiters],
  )
  const aktivTeljes = aktivPresbiterek.filter(p => (p.fokozat || 'teljes') === 'teljes')
  const aktivPot = aktivPresbiterek.filter(p => p.fokozat === 'pot')
  const migracioHianyzik = presbiters.length > 0 && presbiters.every(p => p.fokozat === null)
  const backfillKell =
    !migracioHianyzik &&
    aktivPresbiterek.length > 0 &&
    aktivPresbiterek.every(p => !p.kezdete && !p.vege)
  const letszamGond =
    aktivTeljes.length > 0 &&
    (aktivTeljes.length < PRESBITERIUM_MIN_LETSZAM || aktivTeljes.length > PRESBITERIUM_MAX_LETSZAM)

  async function handleLezaras() {
    if (!lezarasCel || !lezarasDatum) {
      toast.error('A lezárás dátuma kötelező.')
      return
    }
    setLezarasFut(true)
    const result = lezarasCel.tipus === 'presbiter'
      ? await lezarPresbiterMandatum(lezarasCel.id, lezarasDatum)
      : await lezarTisztsegMandatum(lezarasCel.id, lezarasDatum)
    setLezarasFut(false)
    if (result.error) toast.error(result.error)
    else {
      toast.success('A mandátum lezárva — a sor megmarad a történetben.')
      setLezarasCel(null)
      refresh()
    }
  }

  async function handlePresbiterTorles(row: PresbiterRow) {
    const nev = `${row.szemely?.csaladnev || ''} ${row.szemely?.k_nev || ''}`.trim()
    if (!confirm(`Biztosan törli ${nev} EZEN bejegyzését? (Téves rögzítéshez való — mandátum végénél a Lezárást használd, hogy a történet megmaradjon.)`)) return
    const result = await deletePresbyterRow(row.id)
    if (result.error) toast.error(result.error)
    else { toast.success('A bejegyzés törölve.'); refresh() }
  }

  async function handleTisztsegTorles(row: TisztsegRow) {
    const nev = `${row.szemely?.csaladnev || ''} ${row.szemely?.k_nev || ''}`.trim()
    if (!confirm(`Biztosan törli ${nev} tisztség-bejegyzését? (Téves rögzítéshez — mandátum végénél a Lezárást használd.)`)) return
    const result = await deleteTisztseg(row.id)
    if (result.error) toast.error(result.error)
    else { toast.success('A tisztség törölve.'); refresh() }
  }

  async function handleBackfill() {
    if (!backfillDatum) { toast.error('Add meg az utolsó presbiterválasztás dátumát.'); return }
    setBackfillFut(true)
    const result = await backfillPresbiterMandatumok(backfillDatum)
    setBackfillFut(false)
    if (result.error) toast.error(result.error)
    else {
      toast.success(`Mandátumok feltöltve (${result.erintett} sor) — a lejárat: ${result.vege}. Soronként utólag pontosítható.`)
      refresh()
    }
  }

  function szemelyNev(sz: { csaladnev: string; k_nev: string } | null): string {
    return `${sz?.csaladnev || ''} ${sz?.k_nev || ''}`.trim() || 'Ismeretlen'
  }

  // ── Kártya (presbiter) ──────────────────────────────────────
  function PresbiterKartya({ row }: { row: PresbiterRow }) {
    const szemely = row.szemely!
    const nev = szemelyNev(szemely)
    const age = ageFromDate(szemely.sz_datum)
    const fokozat = (row.fokozat || 'teljes') as PresbiterFokozat
    const aktiv = aktivE(row.kezdete, row.vege)
    return (
      <div className={`card-raised p-4 ${aktiv ? '' : 'opacity-60'}`}>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${szemely.ferfi ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-pink-500 to-rose-500'}`}
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
          >
            {szemely.ferfi ? '♂' : '♀'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-700">{nev}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {row.funkcio && (
                <Badge className="border-0 bg-violet-100 text-[10px] font-semibold text-violet-700">
                  {PRESBITER_FUNKCIO_CIMKEK[row.funkcio as 'fogondnok' | 'gondnok'] || row.funkcio}
                </Badge>
              )}
              <Badge className="border-0 bg-amber-100 text-[10px] text-amber-700">
                {row.fokozat ? PRESBITER_FOKOZAT_CIMKEK[fokozat] : (row.tisztseg || 'Presbiter')}
              </Badge>
              {age !== null && <span className="text-[11px] text-slate-400">{age} éves</span>}
              {row.publikus && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] ${szemely.nev_publikalas_consent ? 'text-emerald-600' : 'text-amber-600'}`}
                  title={szemely.nev_publikalas_consent
                    ? 'Publikus — a weboldalon megjelenik'
                    : 'Publikusra jelölve, de a név-publikálási hozzájárulás hiányzik — a weboldalon NEM jelenik meg'}
                >
                  <Globe2 className="h-3 w-3" /> weboldal
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2">
          <MandatumJelzes kezdete={row.kezdete} vege={row.vege} />
        </div>

        {row.csoport && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">
              <MapPin className="h-3 w-3" /> {row.csoport.nev}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-white/60 pt-3">
          {szemely.telefon ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Phone className="h-3 w-3" /> {szemely.telefon}
            </span>
          ) : <span />}
          <div className="flex gap-1">
            <Button
              variant="ghost" size="sm"
              className="h-7 px-1.5 text-[11px] text-slate-400 hover:text-amber-600"
              title="Mandátum lezárása (a sor megmarad)"
              onClick={() => {
                setLezarasCel({ tipus: 'presbiter', id: row.id, nev })
                setLezarasDatum(new Date().toISOString().slice(0, 10))
              }}
            >
              Lezárás
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
              onClick={() => { setPresbiterEditRow(row); setPresbiterFormOpen(true) }}
              aria-label={`${nev} szerkesztése`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
              onClick={() => void handlePresbiterTorles(row)}
              aria-label={`${nev} bejegyzés törlése`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Kártya (nem-presbiteri tisztség) ────────────────────────
  function TisztsegKartya({ row }: { row: TisztsegRow }) {
    const nev = szemelyNev(row.szemely)
    const aktiv = aktivE(row.kezdete, row.vege)
    const cimke =
      row.tipus === 'egyeb'
        ? row.egyeb_megnevezes || 'Egyéb tisztség'
        : row.tipus === 'kantor' && row.jelleg
          ? `Kántor (${KANTOR_JELLEG_CIMKEK[row.jelleg as 'hivatasos' | 'onkentes']})`
          : TISZTSEG_TIPUS_CIMKEK[row.tipus as TisztsegTipus] || row.tipus
    return (
      <div className={`card-raised p-3 ${aktiv ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-700">{nev}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {row.bizottsagi_szerep === 'elnok' ? (
                <Badge className="border-0 bg-violet-100 text-[10px] font-semibold text-violet-700">elnök</Badge>
              ) : null}
              <Badge className="border-0 bg-teal-100 text-[10px] text-teal-700">{cimke}</Badge>
              {row.publikus && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] ${row.szemely?.nev_publikalas_consent ? 'text-emerald-600' : 'text-amber-600'}`}
                  title={row.szemely?.nev_publikalas_consent
                    ? 'Publikus — a weboldalon megjelenik'
                    : 'Publikusra jelölve, de a hozzájárulás hiányzik — a weboldalon NEM jelenik meg'}
                >
                  <Globe2 className="h-3 w-3" /> weboldal
                </span>
              )}
            </div>
            <div className="mt-1.5">
              <MandatumJelzes kezdete={row.kezdete} vege={row.vege} />
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost" size="sm"
              className="h-7 px-1.5 text-[11px] text-slate-400 hover:text-amber-600"
              title="Megbízatás lezárása"
              onClick={() => {
                setLezarasCel({ tipus: 'tisztseg', id: row.id, nev })
                setLezarasDatum(new Date().toISOString().slice(0, 10))
              }}
            >
              Lezárás
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
              onClick={() => { setTisztsegEditRow(row); setTisztsegFormOpen(true) }}
              aria-label={`${nev} szerkesztése`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
              onClick={() => void handleTisztsegTorles(row)}
              aria-label={`${nev} törlése`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const alFulek: Array<{ kulcs: AlFul; cimke: string }> = [
    { kulcs: 'presbiterium', cimke: 'Presbitérium' },
    { kulcs: 'bizottsagok', cimke: 'Bizottságok' },
    { kulcs: 'egyeb', cimke: 'Egyéb tisztségek' },
  ]

  return (
    <div className="space-y-4">
      {/* Al-fül választó — mobilon görgethető chip-sor */}
      <div className="flex flex-wrap gap-2">
        {alFulek.map(f => (
          <button
            key={f.kulcs}
            onClick={() => setAlFul(f.kulcs)}
            className={`min-h-9 rounded-full px-4 text-sm font-medium transition ${
              alFul === f.kulcs
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white/70 text-slate-600 hover:bg-white'
            }`}
          >
            {f.cimke}
          </button>
        ))}
      </div>

      {migracioHianyzik && (
        <div className="card-raised flex items-start gap-2 border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Az adatbázisból még hiányoznak az új presbiteri mezők (fokozat, mandátum) —
            futtasd le a <strong>2026-08-26-presbiterium-tisztsegek.sql</strong> migrációt,
            hogy a fokozat-jelölés és a lejárat-kijelzés működjön.
          </span>
        </div>
      )}
      {tisztsegHiba && !migracioHianyzik && (
        <div className="card-raised border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">{tisztsegHiba}</div>
      )}

      {loading ? (
        <div className="animate-pulse py-12 text-center text-sm text-slate-400">Betöltés...</div>
      ) : alFul === 'presbiterium' ? (
        <>
          <div className="card-raised flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex items-center gap-3">
              <div className="icon-raised h-10 w-10 bg-gradient-to-br from-amber-500 to-amber-600">
                <UserCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {aktivTeljes.length} teljes értékű presbiter
                  {aktivPot.length > 0 ? ` + ${aktivPot.length} pót` : ''}
                </p>
                <p className="text-xs text-slate-400">A gyülekezet presbitériuma · ciklus: {ciklusEv} év</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="outline" className="rounded-lg"
                onClick={() => setCiklusOpen(true)}
                title="Presbiterválasztás után: a régi ciklus lezárása + az új névsor felvétele egyben"
              >
                <Users className="mr-1.5 h-3.5 w-3.5" /> Új ciklus
              </Button>
              <Button size="sm" className="rounded-lg shadow-sm" onClick={() => { setPresbiterEditRow(null); setPresbiterFormOpen(true) }}>
                + Új presbiter
              </Button>
            </div>
          </div>

          {letszamGond && (
            <div className="card-raised flex items-start gap-2 border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Az aktív, teljes értékű presbiterek száma ({aktivTeljes.length}) a kánoni
                {' '}{PRESBITERIUM_MIN_LETSZAM}–{PRESBITERIUM_MAX_LETSZAM} fős sávon kívül esik.
              </span>
            </div>
          )}

          {backfillKell && (
            <div className="card-raised space-y-2 border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-900">
              <p className="font-medium">Mikor volt az utolsó presbiterválasztás?</p>
              <p className="text-xs text-sky-800">
                Egy dátummal minden presbiter megkapja a mandátum kezdetét és a {ciklusEv} éves
                ciklus szerinti lejáratát — utána soronként pontosíthatod.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={backfillDatum} onChange={e => setBackfillDatum(e.target.value)} className="w-44" />
                <Button size="sm" onClick={() => void handleBackfill()} disabled={backfillFut}>
                  {backfillFut ? 'Feltöltés…' : 'Mandátumok feltöltése'}
                </Button>
              </div>
            </div>
          )}

          {presbiters.length === 0 ? (
            <div className="card-raised p-8 text-center">
              <UserCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-slate-500">Még nincs presbiter rögzítve.</p>
              <p className="mt-1 text-xs text-slate-400">Kattintson az &quot;+ Új presbiter&quot; gombra a hozzáadáshoz.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...presbiters]
                .sort((a, b) => {
                  const aAktiv = aktivE(a.kezdete, a.vege) ? 0 : 1
                  const bAktiv = aktivE(b.kezdete, b.vege) ? 0 : 1
                  if (aAktiv !== bAktiv) return aAktiv - bAktiv
                  const rang = (r: PresbiterRow) => (r.funkcio === 'fogondnok' ? 0 : r.funkcio === 'gondnok' ? 1 : r.fokozat === 'pot' ? 3 : r.fokozat === 'tiszteletbeli' ? 4 : 2)
                  if (rang(a) !== rang(b)) return rang(a) - rang(b)
                  return szemelyNev(a.szemely).localeCompare(szemelyNev(b.szemely), 'hu')
                })
                .map(row => <PresbiterKartya key={row.id} row={row} />)}
            </div>
          )}
        </>
      ) : alFul === 'bizottsagok' ? (
        <div className="space-y-5">
          {BIZOTTSAGOK.map(kod => {
            const tagok = tisztsegek
              .filter(t => t.tipus === 'bizottsagi_tag' && t.bizottsag === kod)
              .sort((a, b) => {
                const aElnok = a.bizottsagi_szerep === 'elnok' ? 0 : 1
                const bElnok = b.bizottsagi_szerep === 'elnok' ? 0 : 1
                if (aElnok !== bElnok) return aElnok - bElnok
                return szemelyNev(a.szemely).localeCompare(szemelyNev(b.szemely), 'hu')
              })
            return (
              <section key={kod} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {BIZOTTSAG_CIMKEK[kod]}
                    <span className="ml-2 text-xs font-normal text-slate-400">{tagok.length} tag</span>
                  </h3>
                  <Button
                    size="sm" variant="outline" className="rounded-lg"
                    onClick={() => {
                      setTisztsegEditRow(null)
                      setTisztsegDefaults({ tipus: 'bizottsagi_tag', bizottsag: kod })
                      setTisztsegFormOpen(true)
                    }}
                  >
                    + Tag felvétele
                  </Button>
                </div>
                {tagok.length === 0 ? (
                  <p className="card-raised p-4 text-center text-xs text-slate-400">Még nincs tag rögzítve.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {tagok.map(row => <TisztsegKartya key={row.id} row={row} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm" className="rounded-lg shadow-sm"
              onClick={() => {
                setTisztsegEditRow(null)
                setTisztsegDefaults({ tipus: 'kantor' })
                setTisztsegFormOpen(true)
              }}
            >
              + Új tisztség
            </Button>
          </div>
          {(() => {
            const egyebek = tisztsegek.filter(t => t.tipus !== 'bizottsagi_tag')
            if (egyebek.length === 0) {
              return (
                <div className="card-raised p-8 text-center">
                  <p className="text-slate-500">Még nincs tisztség rögzítve.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Kántor, diakónus, nőszövetségi elnök, IKE-elnök, önkéntesek, egyházmegyei küldött…
                  </p>
                </div>
              )
            }
            return (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {egyebek
                  .sort((a, b) => szemelyNev(a.szemely).localeCompare(szemelyNev(b.szemely), 'hu'))
                  .map(row => <TisztsegKartya key={row.id} row={row} />)}
              </div>
            )
          })()}
        </div>
      )}

      {/* Dialógusok */}
      <PresbiterFormDialog
        open={presbiterFormOpen}
        onOpenChange={(open) => { setPresbiterFormOpen(open); if (!open) { setPresbiterEditRow(null); refresh() } }}
        editRow={presbiterEditRow}
        ciklusEv={ciklusEv}
      />
      <TisztsegFormDialog
        open={tisztsegFormOpen}
        onOpenChange={(open) => { setTisztsegFormOpen(open); if (!open) { setTisztsegEditRow(null); setTisztsegDefaults({}); refresh() } }}
        editRow={tisztsegEditRow}
        defaultTipus={tisztsegDefaults.tipus}
        defaultBizottsag={tisztsegDefaults.bizottsag}
      />

      {/* Mandátum-lezárás */}
      <Dialog open={!!lezarasCel} onOpenChange={open => { if (!open) setLezarasCel(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Mandátum lezárása</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>{lezarasCel?.nev}</strong> megbízatása lezárul a megadott nappal — a
              bejegyzés MEGMARAD a történetben (nem törlődik).
            </p>
            <div className="space-y-1.5">
              <Label>A mandátum utolsó napja *</Label>
              <Input type="date" value={lezarasDatum} onChange={e => setLezarasDatum(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setLezarasCel(null)}>Mégse</Button>
              <Button size="sm" onClick={() => void handleLezaras()} disabled={lezarasFut}>
                {lezarasFut ? 'Lezárás…' : 'Lezárás'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <UjCiklusVarazslo
        open={ciklusOpen}
        onOpenChange={open => { setCiklusOpen(open); if (!open) refresh() }}
        aktivak={aktivPresbiterek}
        ciklusEv={ciklusEv}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// „Új presbiteri ciklus" varázsló — választás után a régi névsor lezárása és
// az új felvétele EGY lépésben (25 fős testületnél ~50 kézi művelet helyett).
// ─────────────────────────────────────────────────────────────

interface CiklusTag {
  id_szemely: number
  nev: string
  fokozat: PresbiterFokozat
  funkcio: '' | 'fogondnok' | 'gondnok'
  id_csoport: number | null
  kivalasztva: boolean
}

function UjCiklusVarazslo({ open, onOpenChange, aktivak, ciklusEv }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  aktivak: PresbiterRow[]
  ciklusEv: number
}) {
  const [datum, setDatum] = useState('')
  const [tagok, setTagok] = useState<CiklusTag[]>([])
  const [fut, setFut] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string; sz_datum: string | null }[]>([])

  useEffect(() => {
    if (!open) return
    setDatum(new Date().toISOString().slice(0, 10))
    // Kiindulás: a jelenlegi aktív névsor (személyenként egy sor).
    const latott = new Set<number>()
    const kezdo: CiklusTag[] = []
    for (const p of aktivak) {
      const id = p.szemely?.id
      if (!id || latott.has(id)) continue
      latott.add(id)
      kezdo.push({
        id_szemely: id,
        nev: `${p.szemely!.csaladnev} ${p.szemely!.k_nev}`.trim(),
        fokozat: ((p.fokozat || 'teljes') as PresbiterFokozat),
        funkcio: (p.funkcio as 'fogondnok' | 'gondnok') || '',
        id_csoport: p.id_csoport,
        kivalasztva: true,
      })
    }
    setTagok(kezdo)
    setSearchQuery('')
    setSearchResults([])
  }, [open, aktivak])

  async function handleSearch(val: string) {
    setSearchQuery(val)
    if (val.length < 3) { setSearchResults([]); return }
    const results = await searchParentClient(val)
    setSearchResults(results)
  }

  async function searchParentClient(val: string) {
    const { searchParent } = await import('@/app/(dashboard)/tagnyilvantartas/actions')
    return (await searchParent(val, true)) as unknown as { id: number; csaladnev: string; k_nev: string; sz_datum: string | null }[]
  }

  function patchTag(id: number, patch: Partial<CiklusTag>) {
    setTagok(p => p.map(t => (t.id_szemely === id ? { ...t, ...patch } : t)))
  }

  async function handleSubmit() {
    const kivalasztottak = tagok.filter(t => t.kivalasztva)
    if (!datum) { toast.error('A választás dátuma kötelező.'); return }
    if (kivalasztottak.length === 0) { toast.error('Legalább egy presbitert jelölj ki.'); return }
    if (kivalasztottak.filter(t => t.funkcio === 'fogondnok').length > 1) {
      toast.error('Egyszerre csak egy főgondnok jelölhető.')
      return
    }
    setFut(true)
    const result = await ujPresbiteriCiklus({
      valasztasDatum: datum,
      tagok: kivalasztottak.map(t => ({
        id_szemely: t.id_szemely,
        fokozat: t.fokozat,
        funkcio: t.funkcio || null,
        id_csoport: t.id_csoport,
      })),
    })
    setFut(false)
    if (result.error) toast.error(result.error)
    else {
      toast.success(`Új ciklus rögzítve: ${result.letrehozva} presbiter, a mandátum ${result.vege}-ig szól.`)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Új presbiteri ciklus indítása</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A választás napjával minden jelenlegi mandátum lezárul, és a kijelölt névsor új,
            {' '}{ciklusEv} éves ciklust kap. A régi bejegyzések a történetben megmaradnak.
          </p>
          <div className="space-y-1.5">
            <Label>A presbiterválasztás napja *</Label>
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="w-48" />
          </div>

          <div className="space-y-2">
            <Label>Az új presbitérium névsora</Label>
            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {tagok.map(t => (
                <div key={t.id_szemely} className={`flex flex-wrap items-center gap-2 rounded-md p-1.5 ${t.kivalasztva ? 'bg-emerald-50/60' : 'opacity-60'}`}>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" checked={t.kivalasztva} onChange={e => patchTag(t.id_szemely, { kivalasztva: e.target.checked })} />
                    <span className="truncate font-medium">{t.nev}</span>
                  </label>
                  <select
                    value={t.fokozat}
                    onChange={e => {
                      const f = e.target.value as PresbiterFokozat
                      patchTag(t.id_szemely, { fokozat: f, ...(f !== 'teljes' ? { funkcio: '' } : {}) })
                    }}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="teljes">teljes</option>
                    <option value="pot">pót</option>
                    <option value="tiszteletbeli">tiszteletbeli</option>
                  </select>
                  <select
                    value={t.funkcio}
                    disabled={t.fokozat !== 'teljes'}
                    onChange={e => patchTag(t.id_szemely, { funkcio: e.target.value as CiklusTag['funkcio'] })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                  >
                    <option value="">— funkció —</option>
                    <option value="fogondnok">főgondnok</option>
                    <option value="gondnok">gondnok</option>
                  </select>
                </div>
              ))}
              {tagok.length === 0 && (
                <p className="p-2 text-center text-xs text-slate-400">Nincs jelenlegi aktív presbiter — add hozzá a megválasztottakat a keresővel.</p>
              )}
            </div>
          </div>

          <div className="relative space-y-1.5">
            <Label>Új személy hozzáadása</Label>
            <Input placeholder="Keresés név alapján (3+ karakter)..." value={searchQuery} onChange={e => void handleSearch(e.target.value)} />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-white shadow-lg">
                {searchResults.map(r => (
                  <div
                    key={r.id}
                    className="cursor-pointer border-b p-2 text-sm last:border-0 hover:bg-slate-50"
                    onClick={() => {
                      if (!tagok.some(t => t.id_szemely === r.id)) {
                        setTagok(p => [...p, {
                          id_szemely: r.id,
                          nev: `${r.csaladnev} ${r.k_nev}`.trim(),
                          fokozat: 'teljes',
                          funkcio: '',
                          id_csoport: null,
                          kivalasztva: true,
                        }])
                      }
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                  >
                    {r.csaladnev} {r.k_nev}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={fut}>
              {fut ? 'Rögzítés…' : `Ciklusváltás rögzítése (${tagok.filter(t => t.kivalasztva).length} fő)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
