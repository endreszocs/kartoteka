'use client'

/**
 * Jegyzőkönyv rögzítési wizard — 7 lépéses.
 *
 * 1. Meghívó csatolás + alapadatok
 * 2. Igevers
 * 3. Résztvevők
 * 4. Napirendi pontok (első 2 automatikus: megnyitás + napirend elfogadása)
 * 5. Kifejtés + határozatok (napirendi pontonként)
 * 6. Ellenőrzés és mentés
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ArrowRight, Check, Save, Plus, Trash2, BookOpen, AlertTriangle, Link2 } from 'lucide-react'
import { saveMinutes, getPresbyterNames, getNextHatarozatSorszam } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { toast } from 'sonner'

type JkTipus = 'presbiteri' | 'kozgyulesi'
interface Resztvevo { nev: string; statusz: 'jelen' | 'igazoltan_tavol' | 'igazolatlanul_tavol' }
interface Hatarozat { sorszam: number; szoveg: string; felelos: string; hatarido: string }
interface NapirendiPont { sorszam: number; cim: string; eloado: string; targyalas: string; hatarozatok: Hatarozat[] }

const STEPS = [
  { id: 1, label: 'Meghívó + alapadatok' },
  { id: 2, label: 'Igevers' },
  { id: 3, label: 'Résztvevők' },
  { id: 4, label: 'Napirendi pontok' },
  { id: 5, label: 'Kifejtés + határozatok' },
  { id: 6, label: 'Előnézet' },
  { id: 7, label: 'Mentés' },
]

export function MinutesImportWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Meghívó csatolás
  const [meghivoIktatoszam, setMeghivoIktatoszam] = useState('')
  const [meghivoDatum, setMeghivoDatum] = useState('')
  const [meghivoNapirendek, setMeghivoNapirendek] = useState<string[]>([])

  // Alapadatok
  const [tipus, setTipus] = useState<JkTipus>('presbiteri')
  const [datum, setDatum] = useState('')
  const [hely, setHely] = useState('')
  const [kezdes, setKezdes] = useState('18:00')
  const [zaras, setZaras] = useState('')
  const [elnok, setElnok] = useState('')
  const [jegyzo, setJegyzo] = useState('')
  const [hit1, setHit1] = useState('')
  const [hit2, setHit2] = useState('')
  const [igevers, setIgevers] = useState('')
  const [felolvasas, setFelolvasas] = useState('')
  const [resztvevok, setResztvevok] = useState<Resztvevo[]>([])
  const [napirend, setNapirend] = useState<NapirendiPont[]>([])
  const [activeNpIdx, setActiveNpIdx] = useState(0)
  const [nextHatSorszam, setNextHatSorszam] = useState(1)

  // Presbiterek betöltése
  useEffect(() => {
    let cancelled = false
    void getPresbyterNames().then((data) => {
      if (cancelled) return
      setResztvevok(data.map((p) => ({ nev: p.nev, statusz: 'jelen' as const })))
    })
    return () => { cancelled = true }
  }, [])

  // Határozat sorszám
  useEffect(() => {
    if (!datum) return
    const year = new Date(datum).getFullYear()
    void getNextHatarozatSorszam(year).then(setNextHatSorszam)
  }, [datum])

  // Meghívó dátum ellenőrzés (min. 3 nappal korábban)
  const meghivoDateWarning = (() => {
    if (!meghivoDatum || !datum) return null
    const mDate = new Date(meghivoDatum)
    const jDate = new Date(datum)
    const diffDays = Math.floor((jDate.getTime() - mDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 3) return `A meghívó dátuma (${meghivoDatum}) kevesebb mint 3 nappal a gyűlés előtt van! (${diffDays} nap)`
    return null
  })()

  // Automatikus napirendi pontok generálása a meghívó alapján
  function generateAutomaticNapirend() {
    const year = datum ? new Date(datum).getFullYear() : new Date().getFullYear()
    const jelenNevek = resztvevok.filter((r) => r.statusz === 'jelen').map((r) => r.nev)

    // 1. pont: Megnyitás
    const megnyitasSzoveg = `Elnök-lelkipásztor ${igevers || '___'} olvasása, rövid beszéd és imádság után köszönti a megjelenteket. Megállapítja, hogy a ${meghivoIktatoszam || '___'} sz. meghívóval a gyűlés szabályszerűen hivatott egybe s a jelenlevők számát tekintve határozatképes. A jegyzőkönyv hitelesítésére ${hit1 || '___'} és ${hit2 || '___'} presbitereket kérve fel a gyűlést megnyitja és az előző gyűlés jegyzőkönyvének felolvasása és annak egyhangú elfogadása után elrendeli annak hitelesítését.`

    // 2. pont: Napirendi pontok elfogadása
    const napirendLista = meghivoNapirendek.filter((n) => n.trim()).join('; ')
    const napirendElfogadasSzoveg = `Az elnök lelkipásztor felsorolja a napirendi pontokat és kéri a presbitériumtól annak elfogadását vagy rendkívüli kérés esetén annak kiegészítését:\n${napirendLista || '___'}`

    // A sorszámok az éves határozat sorszámmal indulnak (folytatólagos!)
    const startNum = nextHatSorszam

    const autoNapirend: NapirendiPont[] = [
      {
        sorszam: startNum, cim: 'Megnyitás, határozatképesség megállapítása', eloado: elnok || '',
        targyalas: megnyitasSzoveg,
        hatarozatok: [{ sorszam: startNum, szoveg: 'Tudomásul szolgál!', felelos: '', hatarido: '' }],
      },
      {
        sorszam: startNum + 1, cim: 'Napirendi pontok elfogadása', eloado: elnok || '',
        targyalas: napirendElfogadasSzoveg,
        hatarozatok: [{ sorszam: startNum + 1, szoveg: 'A presbitérium egyhangúan elfogadja a napirendi pontokat.', felelos: '', hatarido: '' }],
      },
    ]

    // A meghívó napirendi pontjait is hozzáadjuk (folytatólagos sorszámmal)
    const extraNapirend = meghivoNapirendek.filter((n) => n.trim()).map((cim, i) => ({
      sorszam: startNum + 2 + i, cim, eloado: '', targyalas: '',
      hatarozatok: [{ sorszam: startNum + 2 + i, szoveg: 'Tudomásul szolgál!', felelos: '', hatarido: '' }],
    }))

    // Záró pont
    const zaroSorszam = startNum + 2 + meghivoNapirendek.filter((n) => n.trim()).length
    const zaroNapirend: NapirendiPont = {
      sorszam: zaroSorszam, cim: 'Zárás', eloado: '',
      targyalas: 'Több tárgy nem lévén a gyűlés az Úr imádságával és áldással zárult.',
      hatarozatok: [{ sorszam: zaroSorszam, szoveg: 'Tudomásul szolgál!', felelos: '', hatarido: '' }],
    }

    setNapirend([...autoNapirend, ...extraNapirend, zaroNapirend])
  }

  // A 3. lépésről a 4.-re lépésnél generáljuk az automatikus napirendet
  function handleStepForward() {
    if (step === 3 && napirend.length === 0) {
      generateAutomaticNapirend()
    }
    setStep((s) => s + 1)
  }

  function canGoNext(): boolean {
    if (step === 1) return !!datum && !!hely.trim() && !!elnok.trim() && !!jegyzo.trim() && !!hit1.trim() && !!hit2.trim()
    if (step === 4) return napirend.some((np) => np.cim.trim())
    return true
  }

  function addNapirend() {
    const maxNpS = napirend.length > 0 ? Math.max(...napirend.map((np) => np.sorszam)) : nextHatSorszam - 1
    const allHat = napirend.flatMap((np) => np.hatarozatok)
    const maxHatS = allHat.length > 0 ? Math.max(...allHat.map((h) => h.sorszam)) : maxNpS
    const newSorszam = Math.max(maxNpS, maxHatS) + 1
    setNapirend((p) => [...p, {
      sorszam: newSorszam, cim: '', eloado: '', targyalas: '',
      hatarozatok: [{ sorszam: newSorszam, szoveg: 'Tudomásul szolgál!', felelos: '', hatarido: '' }],
    }])
  }

  function addHatarozat(npIdx: number) {
    const allHat = napirend.flatMap((np) => np.hatarozatok)
    const maxS = allHat.length > 0 ? Math.max(...allHat.map((h) => h.sorszam)) : nextHatSorszam - 1
    setNapirend((p) => p.map((np, i) =>
      i === npIdx ? { ...np, hatarozatok: [...np.hatarozatok, { sorszam: maxS + 1, szoveg: '', felelos: '', hatarido: '' }] } : np
    ))
  }

  async function handleFinish() {
    setSaving(true)
    const year = new Date(datum).getFullYear()
    const allHatarozatok = napirend.flatMap((np) => np.hatarozatok.filter((h) => h.szoveg.trim()).map((h) => ({ ...h, napirendi_pont_sorszam: np.sorszam })))

    const result = await saveMinutes({
      tipus, datum, hely, kezdes, zaras,
      elnok_neve: elnok, jegyzo_neve: jegyzo, hitelesito1: hit1, hitelesito2: hit2,
      igevers, felolvasas, megjegyzes: '',
      resztvevok: resztvevok.filter((r) => r.nev.trim()),
      napirendi_pontok: napirend.filter((np) => np.cim.trim()).map((np) => ({
        sorszam: np.sorszam, cim: np.cim, eloado: np.eloado, targyalas: np.targyalas,
      })),
      hatarozatok: allHatarozatok,
    })

    setSaving(false)
    if ('error' in result && result.error) toast.error(result.error)
    else {
      toast.success('Jegyzőkönyv sikeresen rögzítve!')
      if (result.id) router.push(`/jegyzokonyvek/${result.id}`)
      else router.push('/jegyzokonyvek')
    }
  }

  const year = datum ? new Date(datum).getFullYear() : new Date().getFullYear()

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Fejléc */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => router.push('/jegyzokonyvek')}>
          <ArrowLeft className="size-4 mr-1" /> Vissza
        </Button>
        <div>
          <h1 className="font-heading text-2xl text-slate-800">Jegyzőkönyv rögzítése</h1>
          <p className="text-xs text-slate-500">Új vagy korábbi jegyzőkönyv lépésről lépésre történő rögzítése</p>
        </div>
      </div>

      {/* Lépés indikátor */}
      <div className="card-raised p-4">
        <div className="flex items-center gap-1">
          {STEPS.map((s) => (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === s.id ? 'bg-indigo-600 text-white' : step > s.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}>{step > s.id ? <Check className="size-3.5" /> : s.id}</div>
              <span className={`text-xs hidden sm:block ${step === s.id ? 'font-semibold text-indigo-700' : 'text-slate-400'}`}>{s.label}</span>
              {s.id < 7 && <div className={`h-px flex-1 ${step > s.id ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Lépés tartalom */}
      <div className="card-raised p-6">

        {/* ═══ 1. MEGHÍVÓ + ALAPADATOK ═══ */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-heading text-lg text-slate-800">1. Meghívó csatolása és alapadatok</h2>

            {/* Meghívó csatolás */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-violet-600" />
                <p className="text-sm font-semibold text-violet-800">Meghívó csatolása</p>
              </div>
              <p className="text-xs text-slate-500">Add meg a meghívó iktatószámát és dátumát. A napirendi pontok automatikusan kitöltődnek.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Meghívó iktatószáma</label>
                  <Input value={meghivoIktatoszam} onChange={(e) => setMeghivoIktatoszam(e.target.value)} placeholder="pl. 1/2026" className="rounded-xl" /></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Meghívó dátuma</label>
                  <Input type="date" value={meghivoDatum} onChange={(e) => setMeghivoDatum(e.target.value)} className="rounded-xl" /></div>
              </div>
              {/* Meghívó napirendi pontjai */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Napirendi pontok a meghívóról</label>
                <div className="space-y-2">
                  {meghivoNapirendek.map((np, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0">{idx + 1}.</Badge>
                      <Input value={np} onChange={(e) => setMeghivoNapirendek((p) => p.map((x, i) => i === idx ? e.target.value : x))} placeholder="Napirendi pont..." className="rounded-xl" />
                      <Button variant="ghost" size="sm" className="text-red-400 shrink-0" onClick={() => setMeghivoNapirendek((p) => p.filter((_, i) => i !== idx))}><Trash2 className="size-3.5" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="text-violet-600 text-xs" onClick={() => setMeghivoNapirendek((p) => [...p, ''])}><Plus className="size-3 mr-0.5" /> Napirendi pont</Button>
                </div>
              </div>
              {/* Dátum figyelmeztetés */}
              {meghivoDateWarning && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{meghivoDateWarning}</p>
                </div>
              )}
            </div>

            {/* Típus */}
            <div className="flex gap-3">
              {(['presbiteri', 'kozgyulesi'] as JkTipus[]).map((t) => (
                <button key={t} type="button" onClick={() => setTipus(t)}
                  className={`flex-1 rounded-xl border p-3 text-center text-sm font-medium transition ${tipus === t ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                  {t === 'presbiteri' ? 'Presbiteri gyűlés' : 'Közgyűlés'}
                </button>
              ))}
            </div>

            {/* Alapadatok */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Gyűlés dátuma *</label><Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Helyszín *</label><Input value={hely} onChange={(e) => setHely(e.target.value)} placeholder="pl. Gyülekezeti terem" className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Kezdés *</label><Input type="time" value={kezdes} onChange={(e) => setKezdes(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Zárás</label><Input type="time" value={zaras} onChange={(e) => setZaras(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Elnök *</label><Input value={elnok} onChange={(e) => setElnok(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Jegyző *</label><Input value={jegyzo} onChange={(e) => setJegyzo(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Hitelesítő 1 *</label><Input value={hit1} onChange={(e) => setHit1(e.target.value)} className="rounded-xl" /></div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-1">Hitelesítő 2 *</label><Input value={hit2} onChange={(e) => setHit2(e.target.value)} className="rounded-xl" /></div>
            </div>
          </div>
        )}

        {/* ═══ 2. IGEVERS ═══ */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-slate-800">2. Igevers</h2>
            <p className="text-sm text-slate-500">Ha a gyűlés igeolvasással kezdődött, add meg az igét.</p>
            <div><label className="text-xs font-semibold text-slate-500 block mb-1">Felolvasott ige</label><Input value={igevers} onChange={(e) => setIgevers(e.target.value)} placeholder="pl. Péld. 5,21" className="rounded-xl" /></div>
            <div><label className="text-xs font-semibold text-slate-500 block mb-1">Felolvasta</label><Input value={felolvasas} onChange={(e) => setFelolvasas(e.target.value)} placeholder="pl. Elnök-lelkipásztor" className="rounded-xl" /></div>
          </div>
        )}

        {/* ═══ 3. RÉSZTVEVŐK ═══ */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-slate-800">3. Résztvevők</h2>
            <p className="text-sm text-slate-500">Jelöld meg, ki volt jelen és ki volt távol.</p>
            <div className="space-y-2">
              {resztvevok.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input value={r.nev} onChange={(e) => setResztvevok((p) => p.map((x, i) => i === idx ? { ...x, nev: e.target.value } : x))} className="rounded-xl flex-1" />
                  <select value={r.statusz} onChange={(e) => setResztvevok((p) => p.map((x, i) => i === idx ? { ...x, statusz: e.target.value as Resztvevo['statusz'] } : x))} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm">
                    <option value="jelen">✓ Jelen</option><option value="igazoltan_tavol">○ Igazoltan távol</option><option value="igazolatlanul_tavol">✕ Igazolatlanul távol</option>
                  </select>
                  <Button variant="ghost" size="sm" className="text-red-400 shrink-0" onClick={() => setResztvevok((p) => p.filter((_, i) => i !== idx))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setResztvevok((p) => [...p, { nev: '', statusz: 'jelen' }])} className="rounded-xl"><Plus className="size-3.5 mr-1" /> Résztvevő</Button>
            </div>
          </div>
        )}

        {/* ═══ 4. NAPIRENDI PONTOK ═══ */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-slate-800">4. Napirendi pontok</h2>
            <p className="text-sm text-slate-500">Az első két pont automatikusan generálódott. Kiegészítheted vagy módosíthatod.</p>

            {napirend.length < 2 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Az automatikus napirendi pontok a következő lépésre lépéskor generálódnak a meghívó adatai alapján.</p>
              </div>
            )}

            <div className="space-y-2">
              {napirend.map((np, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Badge className={`shrink-0 ${idx < 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{np.sorszam}.</Badge>
                  <Input value={np.cim} onChange={(e) => setNapirend((p) => p.map((x, i) => i === idx ? { ...x, cim: e.target.value } : x))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (idx === napirend.length - 1) addNapirend(); setTimeout(() => (document.getElementById(`wiz-np-${idx + 1}`) as HTMLInputElement)?.focus(), 50) } }}
                    id={`wiz-np-${idx}`} placeholder={idx < 2 ? '(automatikus)' : 'Napirendi pont címe...'} className="rounded-xl flex-1" />
                  {idx >= 2 && (
                    <Button variant="ghost" size="sm" className="text-red-400 shrink-0" onClick={() => setNapirend((p) => p.filter((_, i) => i !== idx).map((x, i) => ({ ...x, sorszam: i + 1 })))}><Trash2 className="size-4" /></Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addNapirend} className="rounded-xl"><Plus className="size-3.5 mr-1" /> Napirend hozzáadása</Button>
            </div>
          </div>
        )}

        {/* ═══ 5. KIFEJTÉS + HATÁROZATOK ═══ */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-slate-800">5. Kifejtés és határozatok</h2>
              <Button size="sm" variant="outline" onClick={addNapirend} className="rounded-xl text-indigo-700 border-indigo-200">
                <Plus className="size-3.5 mr-1" /> Új napirendi pont
              </Button>
            </div>
            <p className="text-sm text-slate-500">Napirendi pontonként töltsd ki a tárgyalás szövegét és a határozatot. Ha a gyűlés során új kérdés vetődik fel, adj hozzá napirendi pontot.</p>

            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {napirend.filter((np) => np.cim.trim()).map((np, idx) => (
                <button key={idx} type="button" onClick={() => setActiveNpIdx(idx)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${activeNpIdx === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {np.sorszam}. {np.cim.slice(0, 25)}{np.cim.length > 25 ? '...' : ''}
                </button>
              ))}
            </div>

            {napirend[activeNpIdx] && (
              <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/20 p-4 space-y-4">
                <Badge className="bg-indigo-100 text-indigo-700">{napirend[activeNpIdx].sorszam}-{year}. {napirend[activeNpIdx].cim}</Badge>

                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Jegyzőkönyvi pont — kifejtés</label>
                  <textarea value={napirend[activeNpIdx].targyalas}
                    onChange={(e) => setNapirend((p) => p.map((x, i) => i === activeNpIdx ? { ...x, targyalas: e.target.value } : x))}
                    placeholder="A napirendi pont tárgyalásának szövege..."
                    rows={6} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm resize-y" />
                </div>

                <div className="border-t border-indigo-200/40 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-amber-700">Határozat:</label>
                    <Button size="sm" variant="ghost" className="text-amber-600 text-xs" onClick={() => addHatarozat(activeNpIdx)}><Plus className="size-3 mr-0.5" /> Határozat</Button>
                  </div>
                  {napirend[activeNpIdx].hatarozatok.map((h, hIdx) => (
                    <div key={hIdx} className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <Badge className="bg-amber-100 text-amber-700 text-xs">{h.sorszam}/{year}. határozat</Badge>
                        <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setNapirend((p) => p.map((x, i) => i === activeNpIdx ? { ...x, hatarozatok: x.hatarozatok.filter((_, j) => j !== hIdx) } : x))}><Trash2 className="size-3.5" /></Button>
                      </div>
                      <textarea value={h.szoveg}
                        onChange={(e) => setNapirend((p) => p.map((x, i) => i === activeNpIdx ? { ...x, hatarozatok: x.hatarozatok.map((hh, j) => j === hIdx ? { ...hh, szoveg: e.target.value } : hh) } : x))}
                        placeholder="A határozat szövege..."
                        rows={2} className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm resize-none" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ 6. A4-ES ELŐNÉZET ═══ */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-slate-800">6. Előnézet és javítás</h2>
              <Button size="sm" variant="outline" onClick={() => { addNapirend(); setStep(5) }} className="rounded-xl text-indigo-700 border-indigo-200">
                <Plus className="size-3.5 mr-1" /> Új napirendi pont
              </Button>
            </div>
            <p className="text-sm text-slate-500">A jegyzőkönyv A4-es nyomtatási képe. Olvasd át és javítsd a szöveget közvetlenül! Ha új kérdés merült fel, adj hozzá napirendi pontot.</p>

            <div className="rounded-2xl border border-slate-300 bg-white shadow-lg p-8 sm:p-10 max-w-[210mm] mx-auto" style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.7', color: '#111827' }}>
              {/* Fejléc */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '12px' }}>
                <div style={{ fontStyle: 'italic' }}>
                  <div style={{ fontWeight: 'bold' }}>Református Egyházközség</div>
                  <div>Lelkipásztori Hivatala.</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10pt', color: '#475569' }}>JEGYZŐKÖNYV</div>
              </div>

              {/* Nyitó formula */}
              <p style={{ textAlign: 'justify', fontStyle: 'italic' }}>
                Jegyzőkönyv, mely készült a Református Egyházközség {tipus === 'presbiteri' ? 'Presbitériumának' : 'Közgyűlésének'} <strong>{datum || '___'}</strong>-én a {hely || '___'} tartott rendes gyűlésén.
              </p>

              <p><strong>Elnök:</strong> {elnok || '—'} lelkipásztor, <strong>Jegyző:</strong> {jegyzo || '—'} gondnok-jegyző</p>
              {igevers && <p><strong>Felolvasott ige:</strong> {igevers}{felolvasas ? ` — ${felolvasas}` : ''}</p>}
              <p><strong><u>Jelen vannak:</u></strong> {resztvevok.filter((r) => r.statusz === 'jelen').map((r) => r.nev).join(', ') || '—'} presbiterek.</p>
              {resztvevok.filter((r) => r.statusz === 'igazoltan_tavol').length > 0 && (
                <p><strong>Igazoltan távol:</strong> {resztvevok.filter((r) => r.statusz === 'igazoltan_tavol').map((r) => r.nev).join(', ')}</p>
              )}

              {/* Napirendi pontok + határozatok */}
              {napirend.filter((np) => np.cim.trim()).map((np, idx) => (
                <div key={idx} style={{ marginTop: '16px' }}>
                  <strong>{np.sorszam}-{year}.</strong>&emsp;
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newCim = e.currentTarget.textContent || ''
                      setNapirend((p) => p.map((x, i) => i === idx ? { ...x, cim: newCim } : x))
                    }}
                    className="outline-none border-b border-transparent hover:border-indigo-300 focus:border-indigo-500 transition"
                  >{np.cim}</span>
                  {np.eloado && <span> — <em>Előadó: {np.eloado}</em></span>}

                  {np.targyalas && (
                    <p
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newText = e.currentTarget.innerText || ''
                        setNapirend((p) => p.map((x, i) => i === idx ? { ...x, targyalas: newText } : x))
                      }}
                      style={{ textAlign: 'justify', margin: '6px 0' }}
                      className="outline-none border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1 transition"
                    >{np.targyalas}</p>
                  )}

                  {np.hatarozatok.map((h, hIdx) => (
                    <p
                      key={hIdx}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newText = e.currentTarget.innerText || ''
                        setNapirend((p) => p.map((x, i) => i === idx ? { ...x, hatarozatok: x.hatarozatok.map((hh, j) => j === hIdx ? { ...hh, szoveg: newText } : hh) } : x))
                      }}
                      style={{ margin: '6px 0 6px 35%', textAlign: 'justify', fontStyle: 'italic' }}
                      className="outline-none border border-transparent hover:border-amber-200 focus:border-amber-400 rounded px-1 transition"
                    >{h.szoveg}</p>
                  ))}
                </div>
              ))}

              {/* Aláírások */}
              <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '11pt' }}>K.m.f</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '14px', textAlign: 'center', fontSize: '11pt' }}>
                <div><div style={{ marginTop: '28px', borderTop: '1px solid #111', paddingTop: '4px', width: '180px', margin: '28px auto 0' }}>{elnok || '___'}<br/>lelkipásztor</div></div>
                <div><div style={{ marginTop: '28px', borderTop: '1px solid #111', paddingTop: '4px', width: '180px', margin: '28px auto 0' }}>{jegyzo || '___'}<br/>gondnok-jegyző</div></div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '11pt', marginTop: '16px' }}>Hitelesítők:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '4px', textAlign: 'center', fontSize: '11pt' }}>
                <div><div style={{ marginTop: '24px', borderTop: '1px solid #111', paddingTop: '4px', width: '180px', margin: '24px auto 0' }}>{hit1 || '___'}</div></div>
                <div><div style={{ marginTop: '24px', borderTop: '1px solid #111', paddingTop: '4px', width: '180px', margin: '24px auto 0' }}>{hit2 || '___'}</div></div>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">Kattints bármelyik szövegre a közvetlen szerkesztéshez</p>
          </div>
        )}

        {/* ═══ 7. ELLENŐRZÉS ═══ */}
        {step === 7 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg text-slate-800 flex items-center gap-2"><BookOpen className="size-5 text-emerald-600" /> 7. Mentés</h2>
            <p className="text-sm text-slate-500">Ellenőrizd az adatokat, majd mentsd el a jegyzőkönyvet.</p>
            <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-sm">
              <div><strong>Típus:</strong> {tipus === 'presbiteri' ? 'Presbiteri gyűlés' : 'Közgyűlés'}</div>
              <div><strong>Meghívó:</strong> {meghivoIktatoszam || '—'} ({meghivoDatum || '—'})</div>
              <div><strong>Dátum:</strong> {datum} · <strong>Helyszín:</strong> {hely}</div>
              <div><strong>Elnök:</strong> {elnok} · <strong>Jegyző:</strong> {jegyzo}</div>
              <div><strong>Hitelesítők:</strong> {hit1}, {hit2}</div>
              {igevers && <div><strong>Igevers:</strong> {igevers}</div>}
              <div><strong>Jelenlévők:</strong> {resztvevok.filter((r) => r.statusz === 'jelen').length} / {resztvevok.length}</div>
              <div><strong>Napirendi pontok:</strong> {napirend.filter((np) => np.cim.trim()).length}</div>
              <div><strong>Határozatok:</strong> {napirend.flatMap((np) => np.hatarozatok).filter((h) => h.szoveg.trim()).length}</div>
            </div>
            {meghivoDateWarning && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{meghivoDateWarning}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigáció */}
      <div className="flex items-center justify-between">
        <Button variant="outline" className="rounded-xl" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
          <ArrowLeft className="size-4 mr-1" /> Előző
        </Button>
        {step < 7 ? (
          <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={handleStepForward} disabled={!canGoNext()}>
            Következő <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleFinish()} disabled={saving}>
            <Save className="size-4 mr-1" /> {saving ? 'Mentés...' : 'Jegyzőkönyv mentése'}
          </Button>
        )}
      </div>
    </div>
  )
}
