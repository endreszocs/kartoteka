'use client'

import { useEffect, useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getVoters, recomputeVoterEligibility, setVoterOverride, getVoterConfirmationRequirement, setVoterConfirmationRequirement, getValasztokFinalizationStatus, finalizeValasztok, requestValasztokUnlock, type VoterRow } from '@/app/(dashboard)/tagnyilvantartas/voter-actions'
import { Users, User, UserRound, CheckCircle, Printer, Send, Scale as ScaleIcon, RefreshCw, Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
// 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb — ugyanaz a
// komponens, mint a számadás/költségvetés/leltár/lelkészi jelentés felületén.
import { FinalizeButton } from '@kartoteka/ui-app'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import { VoterPrintDialog } from '@/components/members/voter-print-dialog'
import { toast } from 'sonner'

export function VotersTab() {
  const [voters, setVoters] = useState<VoterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jarulekFilter, setJarulekFilter] = useState('fizeto')
  const [nemFilter, setNemFilter] = useState('')
  const [korzetFilter, setKorzetFilter] = useState('')
  const [eligFilter, setEligFilter] = useState('mind')
  const [printOpen, setPrintOpen] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  // 2026-07-24 (PR-9, 1. észrevétel): konfirmáció-kritérium kapcsoló
  const [confirmationRequired, setConfirmationRequired] = useState(true)
  const [confirmationSaving, setConfirmationSaving] = useState(false)
  // 2026-06-30 (perf): csak az első `visibleCount` sort rendereljük; a fejléc-szám,
  // az egyházmegyének beküldött létszám és a nyomtatás TOVÁBBRA IS a teljes
  // halmazon dolgozik — csak a DOM-ba írt sorok száma korlátozott.
  const [visibleCount, setVisibleCount] = useState(150)
  // 2026-08-15 (Endre 4. szakasz): az idei névjegyzék véglegesítés-állapota —
  // a szerver adja az év-kulcsot is, hogy a beküldés bit-azonos évvel menjen.
  const [finalization, setFinalization] = useState<{
    year: number
    finalized: boolean
    finalizedAt: string | null
    unlockRequested: boolean
  }>({ year: new Date().getFullYear(), finalized: false, finalizedAt: null, unlockRequested: false })

  const currentYear = new Date().getFullYear()

  function reload() {
    return getVoters().then(data => { setVoters(data); setLoading(false) })
  }

  function reloadFinalization() {
    return getValasztokFinalizationStatus().then(setFinalization)
  }

  useEffect(() => {
    reload()
    void getVoterConfirmationRequirement().then(setConfirmationRequired)
    void reloadFinalization()
  }, [])

  async function handleFinalize() {
    const res = await finalizeValasztok()
    if (res.error) { toast.error(res.error); return }
    toast.success(`A(z) ${finalization.year}. évi választók névjegyzéke véglegesítve lett.`)
    await reloadFinalization()
  }

  async function handleUnlockRequest(reason: string) {
    const res = await requestValasztokUnlock(reason)
    if (res.error) { toast.error(res.error); return { error: res.error } }
    toast.success('Feloldási kérelem elküldve az egyházmegyének.')
    await reloadFinalization()
    return { success: true }
  }

  async function handleConfirmationToggle(required: boolean) {
    setConfirmationSaving(true)
    setConfirmationRequired(required) // optimista — hibánál visszaáll
    const res = await setVoterConfirmationRequirement(required)
    setConfirmationSaving(false)
    if (!res.ok) {
      setConfirmationRequired(!required)
      toast.error(res.error || 'A beállítás mentése nem sikerült.')
      return
    }
    await reload()
    toast.success(
      required
        ? `Konfirmáció megkövetelve — ${res.eligible ?? 0} jogosult a friss szabály szerint.`
        : `Konfirmáció-feltétel kikapcsolva — aki fizet és aktív 18+ tag, az jogosult (${res.eligible ?? 0} fő).`,
    )
  }

  async function handleRecompute() {
    setRecomputing(true)
    const res = await recomputeVoterEligibility()
    setRecomputing(false)
    if (!res.ok) { toast.error(res.error || 'Hiba az újraszámításkor.'); return }
    await reload()
    toast.success(`Névjegyzék frissítve: ${res.eligible} jogosult (${res.added ?? 0} új, ${res.removed ?? 0} kikerült).`)
  }

  async function handleOverride(id: number, override: 0 | 1 | null) {
    const res = await setVoterOverride(id, override)
    if (!res.ok) { toast.error(res.error || 'Hiba.'); return }
    await reload()
  }

  const korzetOptions = useMemo(() => {
    const names = new Set(voters.map(v => v.korzet_nev).filter(Boolean))
    return [...names].sort()
  }, [voters])

  const filtered = useMemo(() => {
    return voters.filter(v => {
      if (search && !v.nev.toLowerCase().includes(search.toLowerCase())) return false
      if (nemFilter === 'ferfi' && !v.ferfi) return false
      if (nemFilter === 'no' && v.ferfi) return false
      if (jarulekFilter === 'fizeto' && !v.jarulekFizeto) return false
      if (jarulekFilter === 'nem_fizeto' && v.jarulekFizeto) return false
      if (korzetFilter === 'none' && v.korzet_nev) return false
      if (korzetFilter === 'none' && !v.korzet_nev) return true
      if (korzetFilter && korzetFilter !== 'none' && v.korzet_nev !== korzetFilter) return false
      if (eligFilter === 'jogosult' && !v.eligible) return false
      if (eligFilter === 'nem_jogosult' && v.eligible) return false
      return true
    })
  }, [voters, search, nemFilter, jarulekFilter, korzetFilter, eligFilter])

  // 2026-06-30 (perf): a 4 KPI-számláló egyetlen memoizált menetbe vonva — korábban
  // 4 teljes .filter() futott MINDEN renderkor (pl. minden gépelésnél a keresőben).
  // A teljes voters halmazon dolgozik (nem a szűrt listán), ezért [voters] a függőség.
  // 2026-07-17 (PR-2, D1): az „Összes választó" a KANONIKUS névjegyzék-tagság
  // (jogosult ÉS fizetett-vagy-felmentett), nem a puszta járulékfizetés.
  const { canonCount, maleCount, femaleCount, eligibleCount } = useMemo(() => {
    let canon = 0, male = 0, female = 0, eligible = 0
    for (const v of voters) {
      if (v.nevjegyzekTag) { canon++; if (v.ferfi) male++; else female++ }
      if (v.eligible) eligible++
    }
    return { canonCount: canon, maleCount: male, femaleCount: female, eligibleCount: eligible }
  }, [voters])

  return (
    <div className="space-y-4">
      {/* KPI kártyák */}
      {/* 2026-07-24 (PR-12): a 4. kártya címkéje pontosítva — az a NYERS jogosultak
          száma (18+, aktív; fizetés nélkül is), ami több lehet, mint a névjegyzék:
          a régi „Jogosult (névjegyzék)" felirat mellett a 412 > 301 hibának tűnt. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={<Users className="w-5 h-5" />} gradient="from-blue-500 to-indigo-600" value={canonCount} label="Névjegyzéki választó" />
        <KpiCard icon={<User className="w-5 h-5" />} gradient="from-blue-400 to-blue-500" value={maleCount} label="Férfi" />
        <KpiCard icon={<UserRound className="w-5 h-5" />} gradient="from-pink-500 to-rose-500" value={femaleCount} label="Nő" />
        <KpiCard icon={<ScaleIcon className="w-5 h-5" />} gradient="from-emerald-500 to-green-600" value={eligibleCount} label="Jogosult (fizetés nélkül is)" />
      </div>

      {/* Műveletek */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={handleRecompute}
          disabled={recomputing || loading || finalization.finalized}
          title={finalization.finalized
            ? `A(z) ${finalization.year}. évi névjegyzék véglegesítve — az újraszámítás zárolva (feloldás az egyházmegyétől kérhető).`
            : confirmationRequired
              ? 'A választói névjegyzék frissítése a szabály alapján: 18+, konfirmált, élő aktív tag (a kézi felülbírálás megmarad)'
              : 'A választói névjegyzék frissítése a szabály alapján: 18+, élő aktív tag — konfirmáció-feltétel KIKAPCSOLVA (a kézi felülbírálás megmarad)'}
        >
          <RefreshCw className={`mr-1 size-3.5 ${recomputing ? 'animate-spin' : ''}`} />
          {recomputing ? 'Frissítés…' : 'Jogosultság frissítése'}
        </Button>
        {/* 2026-07-24 (PR-9, 1. észrevétel): a konfirmáció-kritérium kikapcsolható —
            ha a konfirmálási anyakönyv még nincs bevezetve, aki fizet és aktív
            18+ tag, az jogosultnak számít. */}
        <label
          className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          title={finalization.finalized
            ? `A(z) ${finalization.year}. évi névjegyzék véglegesítve — a kritérium-váltás zárolva.`
            : 'Ha a konfirmálási anyakönyv még nincs bevezetve a rendszerbe, kapcsold ki — ilyenkor aki fizet (vagy felmentett) és aktív 18+ tag, az jogosultnak számít.'}
        >
          <input
            type="checkbox"
            checked={confirmationRequired}
            disabled={confirmationSaving || loading || finalization.finalized}
            onChange={e => void handleConfirmationToggle(e.target.checked)}
            className="rounded"
          />
          Konfirmáció megkövetelése
        </label>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => setPrintOpen(true)}
          disabled={loading || voters.length === 0}
        >
          <Printer className="mr-1 size-3.5" />
          Nyomtatási központ
        </Button>
        {/* 2026-08-15 (Endre 4. szakasz): a beküldés — a leltárral azonos
            mintára — csak VÉGLEGESÍTETT névjegyzéknél érhető el: a megye azt
            lássa, amit a gyülekezet véglegesített. Az év-kulcs a szerverről jön
            (finalization.year), így a véglegesítés és a beküldés éve bit-azonos. */}
        {finalization.finalized && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={async () => {
              const year = finalization.year
              if (!confirm(`Beküldöd a(z) ${year}. évi választók névjegyzékét az egyházmegyének? (${canonCount} fő)`)) return
              // 2026-07-17 (PR-2 F1.5): a beküldött létszám a KANONIKUS definíció
              // (jogosult ÉS fizetett-vagy-felmentett), NEM a képernyőn épp aktív
              // szűrők (pl. keresőmező) eredménye — a definíció a snapshotba kerül.
              const snapshot = { voterCount: canonCount, year, rule: 'eligible_and_paid_or_exempt' }
              const result = await submitDocument('valasztok_nevjegyzeke', year, snapshot)
              if ('error' in result && result.error) toast.error(result.error)
              else toast.success(`Választók névjegyzéke beküldve az egyházmegyének (${canonCount} fő)!`)
            }}
          >
            <Send className="mr-1 size-3.5" />
            Beküldés egyházmegyének
          </Button>
        )}
        {/* 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb a
            fejléc-sáv (műveletsor) jobb szélén — mind a 6 irat-típusnál
            ugyanez a komponens, ugyanitt. */}
        <FinalizeButton
          className="ml-auto"
          documentLabel="választók névjegyzéke"
          year={finalization.year}
          finalized={finalization.finalized}
          finalizedAt={finalization.finalizedAt}
          unlockRequested={finalization.unlockRequested}
          confirmDescription={`A névjegyzékben jelenleg ${canonCount} választó szerepel. A véglegesítés után a jogosultság-újraszámítás és a kézi módosítás a(z) ${finalization.year}. évre zárolva lesz.`}
          disabled={loading}
          onFinalize={handleFinalize}
          onRequestUnlock={handleUnlockRequest}
          unlockPlaceholder="Pl. Két új konfirmált tag kimaradt, a névjegyzéket pótolni szeretném."
        />
      </div>

      {/* Szűrők */}
      <div className="card-raised flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <Input placeholder="Keresés név alapján..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-56 rounded-lg" />
        <select value={jarulekFilter} onChange={e => setJarulekFilter(e.target.value)} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-sm">
          <option value="fizeto">Járulékfizetők</option>
          <option value="nem_fizeto">Nem fizetők</option>
          <option value="mind">Mindenki (18+)</option>
        </select>
        <select value={nemFilter} onChange={e => setNemFilter(e.target.value)} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-sm">
          <option value="">Minden nem</option>
          <option value="ferfi">Férfi</option>
          <option value="no">Nő</option>
        </select>
        <select value={korzetFilter} onChange={e => setKorzetFilter(e.target.value)} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-sm">
          <option value="">Minden körzet</option>
          {korzetOptions.map(k => <option key={k} value={k}>{k}</option>)}
          <option value="none">Körzet nélküli</option>
        </select>
        <select value={eligFilter} onChange={e => setEligFilter(e.target.value)} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm shadow-sm" title="Választói jogosultság (névjegyzék)">
          <option value="mind">Minden jogosultság</option>
          <option value="jogosult">Csak jogosultak</option>
          <option value="nem_jogosult">Nem jogosultak</option>
        </select>
        <span className="text-sm text-slate-400">{filtered.length} fő</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Betöltés...</div>
      ) : filtered.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nincs a szűrésnek megfelelő választó.</p>
        </div>
      ) : (
        <div className="card-raised overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/60 bg-white/60">
                <tr>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500 w-8">#</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Név</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden md:table-cell">Kor</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">Foglalkozás</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden md:table-cell">Lakcím</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">Körzet</th>
                  <th className="p-2.5 text-center text-xs font-medium text-slate-500">Konf.</th>
                  <th className="p-2.5 text-center text-xs font-medium text-slate-500">Járulék</th>
                  <th className="p-2.5 text-center text-xs font-medium text-slate-500">Jogosult</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {filtered.slice(0, visibleCount).map((v, i) => (
                  <tr key={v.id} className="transition-colors hover:bg-secondary/55">
                    <td className="p-2.5 text-slate-400 text-xs">{i + 1}</td>
                    <td className="p-2.5">
                      <span className={`inline-flex items-center gap-1 font-medium ${v.ferfi ? 'text-blue-700' : 'text-pink-700'}`}>
                        {v.ferfi ? '♂' : '♀'} {v.nev}
                      </span>
                    </td>
                    <td className="p-2.5 hidden md:table-cell text-slate-500">{v.age} év</td>
                    <td className="p-2.5 hidden lg:table-cell text-slate-400">{v.foglalkozas || '—'}</td>
                    <td className="p-2.5 hidden md:table-cell text-slate-400 text-xs">{v.lakhely}, {v.lakcim}</td>
                    <td className="p-2.5 hidden lg:table-cell">{v.korzet_nev ? <Badge variant="outline" className="text-[10px] border-cyan-200 text-cyan-700">{v.korzet_nev}</Badge> : <span className="text-slate-300">—</span>}</td>
                    <td className="p-2.5 text-center">{v.konfirmalt ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                    <td className="p-2.5 text-center">
                      {v.jarulekFizeto
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">{v.jarulekMaxEv}</Badge>
                        : <span className="text-xs text-red-400">—</span>}
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {v.eligible
                          ? <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">Jogosult</Badge>
                          : <span className="text-xs text-slate-300">—</span>}
                        {v.override !== null && (
                          <span title={v.override === 1 ? 'Kézi: mindig jogosult' : 'Kézi: kizárva'}>
                            <Lock className={`w-3 h-3 ${v.override === 1 ? 'text-blue-500' : 'text-rose-500'}`} />
                          </span>
                        )}
                        {/* Felülbírálás-vezérlő: auto → jogosult → kizárt → auto.
                            2026-08-15 (Endre 4. szakasz): véglegesített névjegyzéknél
                            tiltva — a szerver-oldali zár mellett a kattintás is. */}
                        <button
                          type="button"
                          className="text-slate-300 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={finalization.finalized}
                          title={
                            finalization.finalized
                              ? `A(z) ${finalization.year}. évi névjegyzék véglegesítve — a kézi módosítás zárolva.`
                              : v.override === null ? 'Kézi felülbírálás: jogosulttá tétel'
                              : v.override === 1 ? 'Kézi felülbírálás: kizárás'
                              : 'Vissza automatikusra'
                          }
                          onClick={() => handleOverride(v.id, v.override === null ? 1 : v.override === 1 ? 0 : null)}
                        >
                          {v.override === null ? <Unlock className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > visibleCount && (
            <div className="flex items-center justify-between border-t border-white/60 px-4 py-3">
              <span className="text-xs text-slate-400">{visibleCount} / {filtered.length} sor megjelenítve</span>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setVisibleCount(c => c + 150)}>
                További 150 megjelenítése
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Nyomtatási központ */}
      <VoterPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        voters={voters}
        currentYear={currentYear}
      />
    </div>
  )
}

function KpiCard({ icon, gradient, value, label }: { icon: React.ReactNode; gradient: string; value: number; label: string }) {
  return (
    <div className="card-raised p-4 flex items-center gap-3">
      <div className={`icon-raised w-10 h-10 bg-gradient-to-br ${gradient} shrink-0`}>
        <span className="text-white">{icon}</span>
      </div>
      <div>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value.toLocaleString('hu')}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  )
}
