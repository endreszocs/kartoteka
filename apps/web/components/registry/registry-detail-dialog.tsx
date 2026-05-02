'use client'

/**
 * Anyakönyvi sor részletes nézete — Endre kérése (2026-04-30):
 * "Ha rákattintok egy sorra akkor jelenjen meg egy szép ablak az adatokkal,
 * ne csak akkor amikor szerkeszteni szeretném! Ez mindenki anyakönyvi fülön."
 *
 * Read-only nézet, "Szerkesztés" gomb visszahív a parent-be (átvált edit
 * módba). Minden 8 fülre profilozott layout, hogy a fülönkénti oszlopok
 * teljes adattartalma látszódjon.
 */

import { User } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { RegistryEntry, RegistryTab } from '@/lib/constants/registry'

interface RegistryDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: RegistryEntry | null
  tab: RegistryTab
  onEdit: () => void
  onDelete: () => void
}

const TAB_LABELS: Record<string, string> = {
  keresztseg: 'Keresztelés',
  konfirmalas: 'Konfirmáció',
  hazassag: 'Házasságkötés',
  temetes: 'Temetés',
  bekoltozott: 'Beköltözés',
  elkoltozott: 'Elköltözés',
  attert: 'Áttérés',
  kitert: 'Kitérés',
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return s.toString().split('T')[0]
}

function calcAge(szDatum?: string | null): string {
  if (!szDatum) return ''
  const m = String(szDatum).match(/^(\d{4})/)
  if (!m) return ''
  const age = new Date().getFullYear() - parseInt(m[1])
  return `${age} éves`
}

function Field({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  const display = value === undefined || value === null || value === '' || value === '—' ? '—' : value
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''} ${display === '—' ? 'text-slate-400 italic' : ''}`}>{display}</p>
    </div>
  )
}

function PersonCard({ label, person, icon }: {
  label: string
  person?: { csaladnev?: string | null; k_nev?: string | null; ferfi?: boolean | null; sz_datum?: string | null } | null
  icon?: React.ReactNode
}) {
  if (!person) return <Field label={label} value="—" />
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5">
        {person.csaladnev || ''} {person.k_nev || ''}
        {person.ferfi !== undefined && person.ferfi !== null && (
          <span className="ml-1.5 text-xs text-slate-400">{person.ferfi ? '♂' : '♀'}</span>
        )}
      </p>
      {person.sz_datum && (
        <p className="text-[11px] text-slate-500 mt-0.5">
          sz: {fmtDate(person.sz_datum)} {calcAge(person.sz_datum) && `• ${calcAge(person.sz_datum)}`}
        </p>
      )}
    </div>
  )
}

export function RegistryDetailDialog({ open, onOpenChange, entry, tab, onEdit, onDelete }: RegistryDetailDialogProps) {
  if (!entry) return null

  const title = TAB_LABELS[tab] || 'Bejegyzés'
  const helyseg = (entry.adrlocality as { name?: string } | null)?.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{title} — részletek</span>
            {entry.egyhazi_szam && (
              <span className="text-xs font-mono text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-100">
                {String(entry.egyhazi_szam)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── KERESZTELÉS ────────────────────────────────────── */}
          {tab === 'keresztseg' && (
            <>
              <PersonCard label="Megkeresztelt személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami anyakönyvi szám" value={entry.okirat as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Édesapa" value={entry.apjaneve as string} />
                <Field label="Édesanya" value={entry.anyjaneve as string} />
              </div>
              <Field label="Keresztszülők" value={entry.keresztszulok as string} />
              <Field label="Alapige" value={entry.alapige as string} />
              <Field label="Megjegyzés" value={(entry.megjegyzes as string)?.split('|sablon:')[0]} />
            </>
          )}

          {/* ── KONFIRMÁCIÓ ─────────────────────────────────── */}
          {tab === 'konfirmalas' && (
            <>
              <PersonCard label="Konfirmandus" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
                <Field label="Keresztelés ideje" value={fmtDate(entry.keresztelesideje as string)} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── HÁZASSÁG ─────────────────────────────────────── */}
          {tab === 'hazassag' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <PersonCard label="Vőlegény" person={entry.ferfi} icon={<User className="size-3" />} />
                <PersonCard label="Menyasszony" person={entry.no} icon={<User className="size-3" />} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami házassági levél" value={entry.hlevel as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              {(entry.vegyes as boolean) && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  ⚠️ Vegyes házasság (egyik fél nem református)
                </div>
              )}
              <Field label="Tanúk" value={entry.tanuk as string} />
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── TEMETÉS ──────────────────────────────────────── */}
          {tab === 'temetes' && (
            <>
              <PersonCard label="Eltemetett személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami halotti szám" value={entry.okirat as string} mono />
                <Field label="Halál dátuma" value={fmtDate(entry.hdatum as string)} />
                <Field label="Temetés dátuma" value={fmtDate(entry.tdatum as string)} />
                <Field label="Halál oka" value={entry.hoka as string} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              <Field label="Temetés helye" value={helyseg} />
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── BEKÖLTÖZÖTT ─────────────────────────────────── */}
          {tab === 'bekoltozott' && (
            <>
              <PersonCard label="Beköltözött személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Igazolás" value={entry.igazolas as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Honnan" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── ELKÖLTÖZÖTT ─────────────────────────────────── */}
          {tab === 'elkoltozott' && (() => {
            const targetCong = Array.isArray(entry.hova_congregation) ? entry.hova_congregation[0] : entry.hova_congregation
            const congName = targetCong?.nev_hu || targetCong?.name
            const notif = Array.isArray(entry.transfer_notification) ? entry.transfer_notification[0] : entry.transfer_notification
            const isKulfoldre = (entry.kulfoldre as boolean | undefined) === true
            return (
              <>
                <PersonCard label="Elköltözött személy" person={entry.szemely} icon={<User className="size-3" />} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                  <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                  <Field label="Hová (település)" value={helyseg} />
                  <Field label="Célgyülekezet" value={congName} />
                </div>
                {isKulfoldre && (
                  <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700">
                    🌍 Külföldre költözött
                  </div>
                )}
                {notif && (
                  <div className={`rounded-md border p-2.5 text-xs ${
                    notif.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    notif.status === 'accepted' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <p className="font-semibold">
                      Átjelentkezési értesítés:{' '}
                      {notif.status === 'pending' ? '⏳ Függőben' :
                       notif.status === 'accepted' ? '✓ Elfogadva' :
                       '✕ Elutasítva (a tag visszakerült)'}
                    </p>
                    {notif.responded_at && (
                      <p className="mt-0.5 text-[11px]">Válasz: {fmtDate(notif.responded_at)}</p>
                    )}
                  </div>
                )}
                <Field label="Megjegyzés" value={entry.megjegyzes as string} />
              </>
            )
          })()}

          {/* ── ÁTTÉRT ───────────────────────────────────────── */}
          {tab === 'attert' && (
            <>
              <PersonCard label="Áttért személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Igazolás" value={entry.igazolas as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Korábbi felekezet" value={entry.felekezet as string} />
                <Field label="Honnan" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── KITÉRT ───────────────────────────────────────── */}
          {tab === 'kitert' && (
            <>
              <PersonCard label="Kitért személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Új felekezet" value={entry.felekezet as string} />
                <Field label="Hova" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* Műveletek */}
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
              onClick={() => onOpenChange(false)}
            >
              Bezár
            </Button>
            <Button
              variant="outline"
              className="rounded-xl border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              onClick={() => { onOpenChange(false); onDelete() }}
            >
              Törlés
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => { onOpenChange(false); onEdit() }}
            >
              ✏️ Szerkesztés
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

