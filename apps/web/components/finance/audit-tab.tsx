'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getUnlinkedPayments, linkPaymentToPerson, searchMembersForFinance } from '@/app/(dashboard)/penzugy/actions'
import { formatCurrency } from '@/lib/constants/finance'
import { parseHungarianWomensName } from '@/lib/utils/finance-helpers'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle, Search, Link2, Sparkles } from 'lucide-react'

interface UnlinkedPayment {
  id: number; datum: string; forrasa: string | null; osszeg: number
  nyugta: string | null; iratszam: string | null; fizetettev: number | null; id_befizetescel: number | null
}

interface SearchResult {
  id: number; csaladnev: string; k_nev: string; sz_datum: string | null
  adrlocality?: { name: string } | null; adrstreet?: { name: string } | null; c_szam?: string | null
}

export function AuditTab() {
  const [payments, setPayments] = useState<UnlinkedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInputs, setSearchInputs] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<Record<number, SearchResult[]>>({})
  const [selectedPerson, setSelectedPerson] = useState<Record<number, { id: number; name: string }>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  const loadData = useCallback(async () => {
    const data = await getUnlinkedPayments()
    setPayments(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadData()
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadData])

  function splitForrasa(forrasa: string | null) {
    if (!forrasa) return { namePart: '', streetPart: '' }
    const idx = forrasa.indexOf(' - ')
    if (idx === -1) return { namePart: forrasa.trim(), streetPart: '' }
    return { namePart: forrasa.slice(0, idx).trim(), streetPart: forrasa.slice(idx + 3).trim() }
  }

  function getSearchHint(namePart: string): string | null {
    const parsed = parseHungarianWomensName(namePart)
    if (!parsed) return null
    if (parsed.maidenFull) return `Lánykori: ${parsed.maidenFull}`
    if (parsed.wifeFirst) return `${parsed.husbandFamily} ${parsed.wifeFirst}`
    return `${parsed.husbandFamily} felesége`
  }

  async function handleSearch(payId: number, query: string) {
    setSearchInputs(prev => ({ ...prev, [payId]: query }))
    if (query.trim().length < 2) {
      setSearchResults(prev => ({ ...prev, [payId]: [] }))
      return
    }
    const results = await searchMembersForFinance(query)
    setSearchResults(prev => ({ ...prev, [payId]: results as unknown as SearchResult[] }))
  }

  function selectPerson(payId: number, person: SearchResult) {
    const name = `${person.csaladnev} ${person.k_nev}`
    setSelectedPerson(prev => ({ ...prev, [payId]: { id: person.id, name } }))
    setSearchInputs(prev => ({ ...prev, [payId]: name }))
    setSearchResults(prev => ({ ...prev, [payId]: [] }))
  }

  async function handleSave(payId: number) {
    const person = selectedPerson[payId]
    if (!person) return
    setSaving(prev => ({ ...prev, [payId]: true }))
    const res = await linkPaymentToPerson(payId, person.id)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success(`Sikeresen párosítva: ${person.name}`)
      setPayments(prev => prev.filter(p => p.id !== payId))
    }
    setSaving(prev => ({ ...prev, [payId]: false }))
  }

  if (loading) return <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Párosítatlan befizetések betöltése...</div>

  if (payments.length === 0) {
    return (
      <div className="card-raised p-8 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
        <p className="text-lg font-semibold text-emerald-600">Minden befizetés párosítva!</p>
        <p className="text-sm text-slate-400 mt-1">Nincs párosítatlan tétel — remek munka!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Fejléc */}
      <div className="card-raised p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/30">
        <div className="flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{payments.length} párosítatlan befizetés</p>
            <p className="text-xs text-slate-400">Ezek a tételek nem jelennek meg a tagok kartotékáján</p>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {payments.map(p => {
          const { namePart } = splitForrasa(p.forrasa)
          const hint = namePart ? getSearchHint(namePart) : null
          const results = searchResults[p.id] || []
          const selected = selectedPerson[p.id]
          const isSaving = saving[p.id]

          return (
            <div key={p.id} className="card-raised p-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {/* Befizetés adatok */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">{p.datum?.split('T')[0]}</span>
                    {p.fizetettev && <Badge variant="outline" className="text-[10px]">{p.fizetettev}. évre</Badge>}
                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(p.osszeg)} RON</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">{p.forrasa || <span className="text-slate-300 italic">Nincs név megadva</span>}</p>
                  {hint && (
                    <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {hint}
                    </p>
                  )}
                  {p.iratszam && <p className="text-[10px] text-slate-400 mt-0.5">Iratszám: {p.iratszam}</p>}
                </div>

                {/* Személy keresés */}
                <div className="w-full sm:w-64 shrink-0 space-y-1.5">
                  <div className="relative">
                    <Input
                      value={searchInputs[p.id] || ''}
                      onChange={e => handleSearch(p.id, e.target.value)}
                      placeholder="Keresés név alapján..."
                      className="rounded-xl text-sm pr-8"
                    />
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />

                    {/* Találatok */}
                    {results.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {results.map(r => {
                          const name = `${r.csaladnev} ${r.k_nev}`
                          const addr = [r.adrlocality?.name, r.adrstreet?.name, r.c_szam].filter(Boolean).join(', ')
                          return (
                            <button
                              key={r.id}
                              onClick={() => selectPerson(p.id, r)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                            >
                              <p className="text-sm font-medium text-blue-700">{name}</p>
                              {addr && <p className="text-[10px] text-slate-400">{addr}</p>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Mentés gomb */}
                  {selected && (
                    <Button size="sm" className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => handleSave(p.id)} disabled={isSaving}>
                      <Link2 className="w-3.5 h-3.5" />
                      {isSaving ? 'Mentés...' : `Párosítás: ${selected.name}`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
