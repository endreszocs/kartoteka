'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Building2, FileText, Plus, Pencil, Trash2, Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  formatCurrency,
  RENTAL_TIPUS_LABELS,
  RENTAL_FREQ_LABELS,
  type RentalContractRow,
} from '@/lib/constants/finance'
import { calculateEvesDij } from '@/lib/finance/rental-calculation'
import { deleteRentalContract } from '@/app/(dashboard)/penzugy/actions'
import { RentalContractDialog } from '@/components/modals/rental-contract-dialog'
import { OblioIssueInvoiceDialog } from '@/components/modals/oblio-issue-invoice-dialog'

interface RentalTabProps {
  contracts: RentalContractRow[]
  onChanged?: () => void | Promise<void>
}

type TipusFilter = 'mind' | 'terulet' | 'epulet'
type StatusFilter = 'aktiv' | 'mind'

export function RentalTab({ contracts, onChanged }: RentalTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RentalContractRow | null>(null)
  const [tipusFilter, setTipusFilter] = useState<TipusFilter>('mind')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('aktiv')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceContract, setInvoiceContract] = useState<RentalContractRow | null>(null)

  function handleIssueInvoice(contract: RentalContractRow) {
    if (contract.jogi_tipus === 'comodat') {
      toast.error('Haszonkölcsön (comodat) esetén nem állítható ki számla.')
      return
    }
    setInvoiceContract(contract)
    setInvoiceDialogOpen(true)
  }

  // Szűrt szerződések
  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return contracts.filter(c => {
      if (tipusFilter !== 'mind' && c.tipus !== tipusFilter) return false
      if (statusFilter === 'aktiv') {
        if (!c.aktiv || c.deleted) return false
        // Lejárt szerződések is aktívak lehetnek — a szűrő csak az aktiv=true kiszűri
        if (c.vege && c.vege < today) return false
      }
      return true
    })
  }, [contracts, tipusFilter, statusFilter])

  // KPI-ok (csak az aktív, nem lejárt szerződések alapján)
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const aktiv = contracts.filter(c => c.aktiv && !c.deleted && (!c.vege || c.vege >= today))
    const lejart = contracts.filter(c => c.aktiv && !c.deleted && c.vege && c.vege < today)
    const evesBevetel = aktiv.reduce((sum, c) => sum + calculateEvesDij(c), 0)
    return {
      aktivSzam: aktiv.length,
      lejartSzam: lejart.length,
      evesBevetel,
    }
  }, [contracts])

  function handleNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function handleEdit(contract: RentalContractRow) {
    setEditing(contract)
    setDialogOpen(true)
  }

  async function handleDelete(contract: RentalContractRow) {
    const confirmed = window.confirm(
      `Biztosan törlöd a következő szerződést?\n\nBérlő: ${contract.berlo_nev}\n${contract.leiras.slice(0, 100)}${contract.leiras.length > 100 ? '...' : ''}\n\nA szerződés eltűnik a listából, de a DB-ben marad (a historikus befizetések párosításához).`,
    )
    if (!confirmed) return

    setDeletingId(contract.id)
    const result = await deleteRentalContract(contract.id)
    setDeletingId(null)

    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }

    toast.success('Szerződés törölve.')
    if (onChanged) await onChanged()
  }

  return (
    <div className="space-y-4">
      {/* KPI kártyák */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          color="amber"
          icon={<Building2 className="h-5 w-5 text-white" />}
          value={String(kpis.aktivSzam)}
          label="Aktív szerződés"
        />
        <KpiCard
          color="emerald"
          icon={<Calendar className="h-5 w-5 text-white" />}
          value={`${formatCurrency(kpis.evesBevetel)} RON`}
          label="Éves várt bevétel"
        />
        <KpiCard
          color="slate"
          icon={<Clock className="h-5 w-5 text-white" />}
          value={String(kpis.lejartSzam)}
          label="Lejárt szerződés"
        />
      </div>

      {/* Fejléc + szűrők + új gomb */}
      <div className="card-raised flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">Bérleti szerződések</p>
          <p className="text-xs text-slate-500">
            Területek és épületek bérbeadása — a szerződések a befizetésekkel automatikusan párosulnak
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            <option value="aktiv">Aktív</option>
            <option value="mind">Összes (lejárt is)</option>
          </select>
          <select
            value={tipusFilter}
            onChange={e => setTipusFilter(e.target.value as TipusFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            <option value="mind">Mind</option>
            <option value="terulet">Terület</option>
            <option value="epulet">Épület</option>
          </select>
          <Button
            onClick={handleNew}
            className="rounded-xl bg-amber-600 hover:bg-amber-700"
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            Új szerződés
          </Button>
        </div>
      </div>

      {/* Lista: desktop táblázat + mobil kártyák */}
      {filtered.length > 0 && (
        <>
          {/* Desktop táblázat */}
          <div className="card-raised hidden overflow-hidden md:block">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">
                  {filtered.length} szerződés
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-white/85">
                  <tr>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Bérlő</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Leírás</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Típus</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Éves díj</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Ciklus</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Időtartam</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Műveletek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-amber-50/50">
                      <td className="p-3">
                        <div className="font-medium text-slate-700">{c.berlo_nev}</div>
                        {c.ceg_adoszam && (
                          <div className="text-xs text-slate-400">Adószám: {c.ceg_adoszam}</div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="line-clamp-2">{c.leiras}</div>
                        {c.targy && <div className="text-xs text-slate-400 mt-0.5">{c.targy}</div>}
                      </td>
                      <td className="p-3">
                        <TipusBadge tipus={c.tipus} />
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-700">
                        {formatCurrency(calculateEvesDij(c))} RON
                      </td>
                      <td className="p-3 text-slate-600">{RENTAL_FREQ_LABELS[c.fizetesi_ciklus]}</td>
                      <td className="p-3 text-slate-600">
                        <div className="text-xs">
                          <span className="text-slate-500">Kezdet:</span> {c.kezdet.slice(0, 10)}
                        </div>
                        {c.vege ? (
                          <div className="text-xs">
                            <span className="text-slate-500">Vége:</span> {c.vege.slice(0, 10)}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400">Nyitott</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {c.jogi_tipus !== 'comodat' && c.aktiv && (
                            <button
                              type="button"
                              onClick={() => handleIssueInvoice(c)}
                              className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-100 hover:text-teal-700"
                              title="Számlát kiállít (e-Factura)"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-100 hover:text-amber-700"
                            title="Szerkesztés"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                            title="Törlés"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil kártyák */}
          <div className="space-y-3 md:hidden">
            {filtered.map(c => (
              <div key={c.id} className="card-raised p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{c.berlo_nev}</p>
                    {c.targy && <p className="text-xs text-slate-500">{c.targy}</p>}
                  </div>
                  <TipusBadge tipus={c.tipus} />
                </div>
                <p className="text-xs text-slate-600 line-clamp-3">{c.leiras}</p>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Éves díj</p>
                    <p className="font-semibold text-slate-700">
                      {formatCurrency(calculateEvesDij(c))} RON
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">{RENTAL_FREQ_LABELS[c.fizetesi_ciklus]}</p>
                    <p className="text-xs text-slate-500">
                      {c.kezdet.slice(0, 10)} — {c.vege ? c.vege.slice(0, 10) : 'nyitott'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {c.jogi_tipus !== 'comodat' && c.aktiv && (
                    <Button
                      size="sm"
                      className="flex-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                      onClick={() => handleIssueInvoice(c)}
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      Számla
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-lg"
                    onClick={() => handleEdit(c)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Szerkesztés
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-lg text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(c)}
                    disabled={deletingId === c.id}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Törlés
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Üres állapot */}
      {filtered.length === 0 && (
        <div className="card-raised p-8 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-amber-200" />
          {contracts.length === 0 ? (
            <>
              <p className="text-sm font-medium text-slate-600">
                Még nincs bérleti szerződés rögzítve.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Kattints a „+ Új szerződés&rdquo; gombra, és vegyétek fel az első bérletet.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-300" />
              <p className="text-sm font-medium text-emerald-600">
                A szűrőfeltételekhez nem tartozik szerződés.
              </p>
              <p className="mt-1 text-xs text-slate-400">Változtasd a szűrőket vagy kattints az „Összes&rdquo;-re.</p>
            </>
          )}
        </div>
      )}

      {/* Modalok */}
      <RentalContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingContract={editing}
        onSaved={onChanged}
      />

      <OblioIssueInvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        contract={invoiceContract}
        onIssued={onChanged}
      />
    </div>
  )
}

function KpiCard({
  color,
  icon,
  value,
  label,
}: {
  color: 'amber' | 'emerald' | 'slate'
  icon: ReactNode
  value: string
  label: string
}) {
  const palette = {
    amber: { gradient: 'from-amber-500 to-amber-600', text: 'text-amber-700' },
    emerald: { gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-600' },
    slate: { gradient: 'from-slate-400 to-slate-600', text: 'text-slate-600' },
  } as const

  return (
    <div className="card-raised flex items-center gap-3 p-4">
      <div className={`icon-raised h-10 w-10 bg-gradient-to-br ${palette[color].gradient}`}>{icon}</div>
      <div>
        <p className={`text-xl font-bold ${palette[color].text}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function TipusBadge({ tipus }: { tipus: 'terulet' | 'epulet' }) {
  if (tipus === 'terulet') {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
        {RENTAL_TIPUS_LABELS.terulet}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-sky-100 text-sky-700">
      {RENTAL_TIPUS_LABELS.epulet}
    </Badge>
  )
}
