'use client'

/**
 * Jegyzőkönyv szerkesztő — presbiteri ÉS közgyűlési.
 *
 * Struktúra: Résztvevők → Napirendi pontok → Jegyzőkönyvi pont (kifejtés) → Határozat
 * Funkciók: igevers, diktálás, Enter=új napirendi pont, szavazóképesség számláló
 */

import { useState, useTransition, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Save, Plus, Trash2, Lock, ArrowLeft, Users, Gavel, Mic, MicOff, Printer, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { saveMinutes, finalizeMinutes, getNextHatarozatSorszam, getPresbyterNames } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { MinutesPrintDialog } from './minutes-print-dialog'
import { buildMinutesPrintHtml } from '@/lib/minutes/print'
import { FinancialAttachment } from './financial-attachment'
import { toast } from 'sonner'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionType = any
/* eslint-enable @typescript-eslint/no-explicit-any */

type JkTipus = 'presbiteri' | 'kozgyulesi'

interface Resztvevo { nev: string; statusz: 'jelen' | 'igazoltan_tavol' | 'igazolatlanul_tavol' | 'meghivott'; szerep?: string }

interface Hatarozat { sorszam: number; szoveg: string; felelos: string; hatarido: string }

interface NapirendiPont {
  sorszam: number
  cim: string
  eloado: string
  targyalas: string  // = jegyzőkönyvi pont kifejtés
  hatarozatok: Hatarozat[]  // közvetlenül a napirendi ponthoz tartozó határozatok
  szavazas_igen: number
  szavazas_nem: number
  szavazas_tartozkodo: number
}

interface MinutesEditorProps {
  congregationName?: string
  initialData?: {
    id: string; tipus?: JkTipus; datum: string; hely: string; kezdes: string; zaras: string
    elnok_neve: string; jegyzo_neve: string; hitelesito1: string; hitelesito2: string
    igevers?: string; felolvasas?: string; megjegyzes: string; allapot: string
    resztvevok: Resztvevo[]; napirendi_pontok: Array<NapirendiPont & { id?: string }>
    hatarozatok: Hatarozat[]
  }
}

const TIPUS_LABELS: Record<JkTipus, string> = { presbiteri: 'Presbiteri gyűlés', kozgyulesi: 'Közgyűlés' }

export function MinutesEditor({ initialData, congregationName = 'Református Egyházközség' }: MinutesEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [printOpen, setPrintOpen] = useState(false)

  // Alap mezők
  const [tipus, setTipus] = useState<JkTipus>(initialData?.tipus || 'presbiteri')
  const [datum, setDatum] = useState(initialData?.datum || new Date().toISOString().split('T')[0])
  const [hely, setHely] = useState(initialData?.hely || '')
  const [kezdes, setKezdes] = useState(initialData?.kezdes || '18:00')
  const [zaras, setZaras] = useState(initialData?.zaras || '')
  const [elnok, setElnok] = useState(initialData?.elnok_neve || '')
  const [jegyzo, setJegyzo] = useState(initialData?.jegyzo_neve || '')
  const [hit1, setHit1] = useState(initialData?.hitelesito1 || '')
  const [hit2, setHit2] = useState(initialData?.hitelesito2 || '')
  const [igevers, setIgevers] = useState(initialData?.igevers || '')
  const [felolvasas, setFelolvasas] = useState(initialData?.felolvasas || '')
  const [megj, setMegj] = useState(initialData?.megjegyzes || '')

  const [resztvevok, setResztvevok] = useState<Resztvevo[]>(initialData?.resztvevok || [])
  const [napirend, setNapirend] = useState<NapirendiPont[]>(() => {
    // Ha van initialData, a határozatokat a napirendi pontokhoz rendeljük
    if (initialData?.napirendi_pontok) {
      return initialData.napirendi_pontok.map((np) => ({
        ...np,
        hatarozatok: np.hatarozatok || initialData.hatarozatok?.filter((h) => h.sorszam > 0) || [],
      }))
    }
    return []
  })

  // Diktálás
  const [dictating, setDictating] = useState(false)
  const [dictTarget, setDictTarget] = useState<{ npIdx: number; field: 'targyalas' | 'hatarozat'; hatIdx?: number } | null>(null)
  const recognitionRef = useRef<SpeechRecognitionType | null>(null)

  const isFinalized = initialData?.allapot === 'veglegesitett' || initialData?.allapot === 'hitelesitett'

  // Presbiterek betöltése
  useEffect(() => {
    if (initialData?.resztvevok && initialData.resztvevok.length > 0) return
    let cancelled = false
    void getPresbyterNames().then((data) => {
      if (cancelled) return
      if (!initialData) {
        setResztvevok(data.map((p) => ({ nev: p.nev, statusz: 'jelen' as const, szerep: p.tisztseg || undefined })))
      }
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Közgyűlési szavazóképesség — kézi checkbox
  const [kozgyulesQuorum, setKozgyulesQuorum] = useState(true)

  // ── Szavazóképesség ──────────────────────────────────────
  const jelenCount = resztvevok.filter((r) => r.statusz === 'jelen').length
  const totalPresbyters = resztvevok.length
  const quorumNeeded = Math.floor(totalPresbyters / 2) + 1
  const isQuorumMet = tipus === 'kozgyulesi' ? kozgyulesQuorum : jelenCount >= quorumNeeded

  // ── Napirendi pont CRUD ──────────────────────────────────
  function addNapirend() {
    const allHat = napirend.flatMap((np) => np.hatarozatok)
    const maxS = allHat.length > 0 ? Math.max(...allHat.map((h) => h.sorszam)) : 0
    setNapirend((p) => [...p, {
      sorszam: p.length + 1, cim: '', eloado: '', targyalas: '',
      hatarozatok: [{ sorszam: maxS + 1, szoveg: 'Tudomásul szolgál!', felelos: '', hatarido: '' }],
      szavazas_igen: 0, szavazas_nem: 0, szavazas_tartozkodo: 0,
    }])
  }
  function removeNapirend(i: number) {
    setNapirend((p) => p.filter((_, idx) => idx !== i).map((np, idx) => ({ ...np, sorszam: idx + 1 })))
  }
  function updateNapirend(i: number, updates: Partial<NapirendiPont>) {
    setNapirend((p) => p.map((np, idx) => idx === i ? { ...np, ...updates } : np))
  }

  // Határozat hozzáadás egy napirendi ponthoz
  async function addHatarozatToNp(npIdx: number) {
    const year = new Date(datum).getFullYear()
    const allHat = napirend.flatMap((np) => np.hatarozatok)
    const maxSorszam = allHat.length > 0 ? Math.max(...allHat.map((h) => h.sorszam)) : (await getNextHatarozatSorszam(year)) - 1
    const newSorszam = maxSorszam + 1
    updateNapirend(npIdx, {
      hatarozatok: [...napirend[npIdx].hatarozatok, { sorszam: newSorszam, szoveg: '', felelos: '', hatarido: '' }],
    })
  }
  function removeHatarozat(npIdx: number, hatIdx: number) {
    updateNapirend(npIdx, { hatarozatok: napirend[npIdx].hatarozatok.filter((_, i) => i !== hatIdx) })
  }
  function updateHatarozat(npIdx: number, hatIdx: number, updates: Partial<Hatarozat>) {
    updateNapirend(npIdx, {
      hatarozatok: napirend[npIdx].hatarozatok.map((h, i) => i === hatIdx ? { ...h, ...updates } : h),
    })
  }

  // ── Enter → új napirendi pont ────────────────────────────
  function handleCimKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (idx === napirend.length - 1) addNapirend()
      // Fókusz a következő cím mezőre
      setTimeout(() => {
        const next = document.getElementById(`np-cim-${idx + 1}`)
        if (next) (next as HTMLInputElement).focus()
      }, 50)
    }
  }

  // ── Diktálás ─────────────────────────────────────────────
  // A Web Speech API-nak nincs hivatalos TypeScript típusa minden böngészőben,
  // ezért minimális típus-aliasokat használunk, hogy ne kelljen `any`-ra építeni.
  const startDictation = useCallback((target: { npIdx: number; field: 'targyalas' | 'hatarozat'; hatIdx?: number }) => {
    type SpeechRecognitionAlt = new () => {
      lang: string
      continuous: boolean
      interimResults: boolean
      onresult: ((ev: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
      start: () => void
      stop: () => void
    }
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionAlt; webkitSpeechRecognition?: SpeechRecognitionAlt }
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) { toast.error('A böngésző nem támogatja a beszédfelismerést.'); return }
    const rec = new API()
    rec.lang = 'hu-HU'; rec.continuous = true; rec.interimResults = true
    rec.onresult = (ev) => {
      let text = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript
      if (ev.results[ev.results.length - 1].isFinal) {
        if (target.field === 'targyalas') {
          setNapirend((p) => p.map((np, i) => i === target.npIdx ? { ...np, targyalas: (np.targyalas ? np.targyalas + ' ' : '') + text } : np))
        } else if (target.field === 'hatarozat' && target.hatIdx !== undefined) {
          setNapirend((p) => p.map((np, i) => {
            if (i !== target.npIdx) return np
            return { ...np, hatarozatok: np.hatarozatok.map((h, j) => j === target.hatIdx ? { ...h, szoveg: (h.szoveg ? h.szoveg + ' ' : '') + text } : h) }
          }))
        }
      }
    }
    rec.onerror = () => { setDictating(false); setDictTarget(null) }
    rec.onend = () => { setDictating(false); setDictTarget(null) }
    recognitionRef.current = rec; rec.start()
    setDictating(true); setDictTarget(target)
    toast.success('Diktálás elindult!')
  }, [])

  function stopDictation() { recognitionRef.current?.stop(); setDictating(false); setDictTarget(null) }

  // ── Mentés ───────────────────────────────────────────────
  function handleSave() {
    if (!datum) { toast.error('A dátum kötelező.'); return }
    if (!hely.trim()) { toast.error('A helyszín kötelező.'); return }
    if (!kezdes) { toast.error('A kezdés időpontja kötelező.'); return }
    if (!elnok.trim()) { toast.error('Az elnök neve kötelező.'); return }
    if (!jegyzo.trim()) { toast.error('A jegyző neve kötelező.'); return }
    if (!hit1.trim()) { toast.error('Az 1. hitelesítő neve kötelező.'); return }
    if (!hit2.trim()) { toast.error('A 2. hitelesítő neve kötelező.'); return }
    startTransition(async () => {
      const allHatarozatok = napirend.flatMap((np) => np.hatarozatok.map((h) => ({ ...h, napirendi_pont_sorszam: np.sorszam })))
      const result = await saveMinutes({
        id: initialData?.id, tipus, datum, hely, kezdes, zaras,
        elnok_neve: elnok, jegyzo_neve: jegyzo, hitelesito1: hit1, hitelesito2: hit2,
        igevers, felolvasas, megjegyzes: megj,
        resztvevok: resztvevok.filter((r) => r.nev.trim()),
        napirendi_pontok: napirend.filter((np) => np.cim.trim()).map((np) => ({
          sorszam: np.sorszam, cim: np.cim, eloado: np.eloado, targyalas: np.targyalas,
          szavazas_igen: np.szavazas_igen, szavazas_nem: np.szavazas_nem, szavazas_tartozkodo: np.szavazas_tartozkodo,
        })),
        hatarozatok: allHatarozatok.filter((h) => h.szoveg.trim()),
      })
      if ('error' in result && result.error) toast.error(result.error)
      else {
        toast.success('Jegyzőkönyv mentve!')
        if (!initialData?.id && result.id) router.push(`/jegyzokonyvek/${result.id}`)
      }
    })
  }

  function handleFinalize() {
    if (!initialData?.id) { toast.error('Először mentsd el.'); return }
    if (!confirm('Biztosan véglegesíted? Ezután nem szerkeszthető.')) return
    startTransition(async () => {
      const result = await finalizeMinutes(initialData.id)
      if ('error' in result && result.error) toast.error(result.error)
      else { toast.success('Véglegesítve!'); router.refresh() }
    })
  }

  // ── Nyomtatás HTML generálás ─────────────────────────────
  // ⚠️ 2026-08-24 (biztonsági kör, B3 — tárolt XSS): a nyomtatvány HTML-je
  // a KÖZÖS `@/lib/minutes/print` modulban épül, ahol MINDEN felhasználói
  // mező escape-elődik (és a `\n` → `<br>` csere az escape UTÁN történik).
  // ⛔ Ide NE kerüljön vissza nyers sablon-interpoláció: a HTML-építés három
  // másolatából pontosan ez a fájl volt az egyik, ahol egy határozat szövegébe
  // írt `<img src=x onerror=…>` a NÉZŐ munkamenetében futott le.
  const generatePrintHtml = useCallback(
    (type: string): string =>
      buildMinutesPrintHtml(
        type,
        {
          congregationName,
          tipus,
          datum,
          hely,
          kezdes,
          elnok_neve: elnok,
          jegyzo_neve: jegyzo,
          hitelesito1: hit1,
          hitelesito2: hit2,
          igevers,
          felolvasas,
          megjegyzes: megj,
          resztvevok,
          napirendi_pontok: napirend,
          // A szerkesztőben a határozatok a napirendi pontokon ülnek.
          hatarozatok: [],
        },
        { napirendOszlop: true, presbiterLista: true },
      ),
    [datum, tipus, hely, kezdes, elnok, jegyzo, hit1, hit2, igevers, felolvasas, megj, resztvevok, napirend, congregationName],
  )

  return (
    <div className="space-y-5">
      {/* Fejléc */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => router.push('/jegyzokonyvek')}>
            <ArrowLeft className="size-4 mr-1" /> Vissza
          </Button>
          <h1 className="font-heading text-2xl text-slate-800">{initialData ? 'Jegyzőkönyv szerkesztése' : 'Új jegyzőkönyv'}</h1>
          {isFinalized && <Badge className="bg-emerald-50 text-emerald-700">Véglegesítve</Badge>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setPrintOpen(true)} className="rounded-xl"><Printer className="size-4 mr-1" /> Nyomtatási központ</Button>
          <Button onClick={handleSave} disabled={isPending || isFinalized} className="rounded-xl"><Save className="size-4 mr-1" /> {isPending ? 'Mentés...' : 'Mentés'}</Button>
          {initialData?.id && !isFinalized && (
            <Button variant="outline" onClick={handleFinalize} disabled={isPending} className="rounded-xl border-emerald-200 text-emerald-700"><Lock className="size-4 mr-1" /> Véglegesítés</Button>
          )}
        </div>
      </div>

      {/* Típus + Szavazóképesség */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-raised p-5">
          <h2 className="font-heading text-lg text-slate-800 mb-3">Gyűlés típusa</h2>
          <div className="flex gap-3">
            {(['presbiteri', 'kozgyulesi'] as JkTipus[]).map((t) => (
              <button key={t} type="button" onClick={() => !isFinalized && setTipus(t)} disabled={isFinalized}
                className={`flex-1 rounded-xl border p-3 text-center transition ${tipus === t ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-sm font-semibold ${tipus === t ? 'text-indigo-800' : 'text-slate-700'}`}>{TIPUS_LABELS[t]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Szavazóképesség */}
        <div className={`card-raised p-5 ${isQuorumMet ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}>
          <h2 className="font-heading text-lg text-slate-800 mb-2">Szavazóképesség</h2>
          {tipus === 'kozgyulesi' ? (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={kozgyulesQuorum} onChange={(e) => setKozgyulesQuorum(e.target.checked)} disabled={isFinalized}
                className="size-5 rounded border-slate-300 text-emerald-600" />
              <div>
                <p className={`text-sm font-semibold ${kozgyulesQuorum ? 'text-emerald-700' : 'text-red-700'}`}>
                  {kozgyulesQuorum ? 'A közgyűlés szavazóképes' : 'A közgyűlés NEM szavazóképes'}
                </p>
                <p className="text-xs text-slate-500">Jelöld be, ha a közgyűlés határozatképes</p>
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-3">
              {isQuorumMet ? <CheckCircle2 className="size-6 text-emerald-600" /> : <AlertTriangle className="size-6 text-red-600" />}
              <div>
                <p className={`text-sm font-semibold ${isQuorumMet ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isQuorumMet ? 'A gyűlés szavazóképes!' : 'A gyűlés NEM szavazóképes!'}
                </p>
                <p className="text-xs text-slate-500">{jelenCount} jelenlévő / {totalPresbyters} összesen — minimum {quorumNeeded} fő szükséges</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alapadatok + Igevers */}
      <div className="card-raised p-5">
        <h2 className="font-heading text-lg text-slate-800 mb-4">Gyűlés adatai</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Dátum *</label>
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Helyszín *</label>
            <Input value={hely} onChange={(e) => setHely(e.target.value)} placeholder="pl. Gyülésterem" disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Kezdés *</label>
            <Input type="time" value={kezdes} onChange={(e) => setKezdes(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Zárás</label>
            <Input type="time" value={zaras} onChange={(e) => setZaras(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Elnök *</label>
            <Input value={elnok} onChange={(e) => setElnok(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Jegyző *</label>
            <Input value={jegyzo} onChange={(e) => setJegyzo(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Hitelesítő 1 *</label>
            <Input value={hit1} onChange={(e) => setHit1(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Hitelesítő 2 *</label>
            <Input value={hit2} onChange={(e) => setHit2(e.target.value)} disabled={isFinalized} className="rounded-xl" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Felolvasott ige</label>
            <Input value={igevers} onChange={(e) => setIgevers(e.target.value)} placeholder="pl. Péld. 5,21" disabled={isFinalized} className="rounded-xl" /></div>
          <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Felolvasta</label>
            <Input value={felolvasas} onChange={(e) => setFelolvasas(e.target.value)} placeholder="pl. Elnök-lelkipásztor" disabled={isFinalized} className="rounded-xl" /></div>
        </div>
      </div>

      {/* Résztvevők */}
      <div className="card-raised p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-slate-800 flex items-center gap-2"><Users className="size-5 text-indigo-600" /> Résztvevők ({jelenCount}/{totalPresbyters})</h2>
          {!isFinalized && <Button size="sm" variant="outline" onClick={() => setResztvevok((p) => [...p, { nev: '', statusz: 'jelen' }])} className="rounded-xl"><Plus className="size-3.5 mr-1" /> Résztvevő</Button>}
        </div>
        <div className="space-y-2">
          {resztvevok.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input value={r.nev} onChange={(e) => setResztvevok((p) => p.map((x, i) => i === idx ? { ...x, nev: e.target.value } : x))} placeholder="Név" disabled={isFinalized} className="rounded-xl flex-1" />
              <select value={r.statusz} onChange={(e) => setResztvevok((p) => p.map((x, i) => i === idx ? { ...x, statusz: e.target.value as Resztvevo['statusz'] } : x))} disabled={isFinalized} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm">
                <option value="jelen">✓ Jelen</option><option value="igazoltan_tavol">○ Igazoltan távol</option><option value="igazolatlanul_tavol">✕ Igazolatlanul távol</option>
              </select>
              {!isFinalized && <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 shrink-0" onClick={() => setResztvevok((p) => p.filter((_, i) => i !== idx))}><Trash2 className="size-4" /></Button>}
            </div>
          ))}
        </div>
      </div>

      {/* Napirendi pontok + Jegyzőkönyvi pont + Határozatok */}
      <div className="card-raised p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-slate-800 flex items-center gap-2"><BookOpen className="size-5 text-indigo-600" /> Napirendi pontok és határozatok</h2>
          {!isFinalized && <Button size="sm" variant="outline" onClick={addNapirend} className="rounded-xl"><Plus className="size-3.5 mr-1" /> Napirend</Button>}
        </div>
        {napirend.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Adj hozzá napirendi pontokat. (Enter = következő pont)</p> : (
          <div className="space-y-5">
            {napirend.map((np, npIdx) => (
              <div key={npIdx} className="rounded-2xl border border-indigo-200/60 bg-indigo-50/20 p-4">
                {/* Napirendi pont fejléc */}
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-indigo-100 text-indigo-700 shrink-0">{np.sorszam}-{new Date(datum).getFullYear()}.</Badge>
                  <Input id={`np-cim-${npIdx}`} value={np.cim} onChange={(e) => updateNapirend(npIdx, { cim: e.target.value })}
                    onKeyDown={(e) => handleCimKeyDown(e, npIdx)} placeholder="Napirendi pont címe... (Enter = következő)" disabled={isFinalized} className="rounded-xl flex-1 font-semibold" />
                  {!isFinalized && <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 shrink-0" onClick={() => removeNapirend(npIdx)}><Trash2 className="size-4" /></Button>}
                </div>

                {/* Jegyzőkönyvi pont kifejtés (tárgyalás) */}
                <div className="ml-4 border-l-2 border-indigo-200 pl-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-500">Jegyzőkönyvi pont — kifejtés</label>
                    {!isFinalized && (
                      <Button variant="ghost" size="sm"
                        className={dictating && dictTarget?.npIdx === npIdx && dictTarget?.field === 'targyalas' ? 'text-red-600 animate-pulse' : 'text-indigo-600'}
                        onClick={() => dictating && dictTarget?.npIdx === npIdx && dictTarget?.field === 'targyalas' ? stopDictation() : startDictation({ npIdx, field: 'targyalas' })}>
                        {dictating && dictTarget?.npIdx === npIdx && dictTarget?.field === 'targyalas' ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                      </Button>
                    )}
                  </div>
                  <textarea value={np.targyalas} onChange={(e) => updateNapirend(npIdx, { targyalas: e.target.value })}
                    placeholder="A napirendi pont tárgyalásának leírása... (diktálás: 🎤)" rows={3} disabled={isFinalized}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm resize-y" />

                  {/* Pénzügyi adatok csatolása */}
                  <FinancialAttachment
                    year={new Date(datum).getFullYear()}
                    disabled={isFinalized}
                    onInsert={(html) => updateNapirend(npIdx, { targyalas: (np.targyalas ? np.targyalas + '\n' : '') + html })}
                  />

                  {/* Határozatok ehhez a napirendi ponthoz */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-amber-700 flex items-center gap-1"><Gavel className="size-3" /> Határozatok</label>
                      {!isFinalized && <Button size="sm" variant="ghost" className="text-xs text-amber-600" onClick={() => void addHatarozatToNp(npIdx)}><Plus className="size-3 mr-0.5" /> Határozat</Button>}
                    </div>
                    {np.hatarozatok.map((h, hatIdx) => (
                      <div key={hatIdx} className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className="bg-amber-100 text-amber-700 text-xs">{h.sorszam}/{new Date(datum).getFullYear()}. határozat</Badge>
                          <div className="flex gap-1">
                            {!isFinalized && (
                              <Button variant="ghost" size="sm"
                                className={dictating && dictTarget?.npIdx === npIdx && dictTarget?.field === 'hatarozat' && dictTarget?.hatIdx === hatIdx ? 'text-red-600 animate-pulse' : 'text-amber-600'}
                                onClick={() => dictating && dictTarget?.npIdx === npIdx && dictTarget?.hatIdx === hatIdx ? stopDictation() : startDictation({ npIdx, field: 'hatarozat', hatIdx })}>
                                {dictating && dictTarget?.npIdx === npIdx && dictTarget?.hatIdx === hatIdx ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                              </Button>
                            )}
                            {!isFinalized && <Button variant="ghost" size="sm" className="text-red-400" onClick={() => removeHatarozat(npIdx, hatIdx)}><Trash2 className="size-3.5" /></Button>}
                          </div>
                        </div>
                        <textarea value={h.szoveg} onChange={(e) => updateHatarozat(npIdx, hatIdx, { szoveg: e.target.value })}
                          placeholder="A határozat szövege..." rows={2} disabled={isFinalized}
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm resize-none" />
                        <div className="grid gap-2 sm:grid-cols-2 mt-2">
                          <Input value={h.felelos} onChange={(e) => updateHatarozat(npIdx, hatIdx, { felelos: e.target.value })} placeholder="Felelős" disabled={isFinalized} className="rounded-xl text-xs" />
                          <Input type="date" value={h.hatarido} onChange={(e) => updateHatarozat(npIdx, hatIdx, { hatarido: e.target.value })} disabled={isFinalized} className="rounded-xl text-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Megjegyzés */}
      <div className="card-raised p-5">
        <h2 className="font-heading text-lg text-slate-800 mb-3">Megjegyzés</h2>
        <textarea value={megj} onChange={(e) => setMegj(e.target.value)} placeholder="Egyéb megjegyzések..." rows={3} disabled={isFinalized}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm resize-none" />
      </div>

      {/* Diktálás indikátor */}
      {dictating && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-red-600 text-white px-6 py-3 shadow-lg flex items-center gap-3 animate-pulse">
          <Mic className="size-5" /><span className="text-sm font-semibold">Diktálás folyamatban...</span>
          <Button size="sm" variant="ghost" className="text-white hover:text-red-200" onClick={stopDictation}>Leállítás</Button>
        </div>
      )}

      {/* Nyomtatási központ */}
      <MinutesPrintDialog open={printOpen} onOpenChange={setPrintOpen} generateHtml={generatePrintHtml} year={new Date(datum).getFullYear()} />
    </div>
  )
}
