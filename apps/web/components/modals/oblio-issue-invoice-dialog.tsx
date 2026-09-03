'use client'

import { useEffect, useState } from 'react'
import { FileText, Receipt } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import type { RentalContractRow } from '@/lib/constants/finance'
import { formatCurrency } from '@/lib/constants/finance'
import { issueInvoice } from '@/app/(dashboard)/penzugy/oblio-actions'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: RentalContractRow | null
  onIssued?: () => void | Promise<void>
}

// Román hónapnevek a szolgáltatás-időszak-cimkéhez
const HO_NEVEK_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function aktualisIdoszak(): string {
  const now = new Date()
  return `${HO_NEVEK_RO[now.getMonth()]} ${now.getFullYear()}`
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function OblioIssueInvoiceDialog({ open, onOpenChange, contract, onIssued }: Props) {
  const [szamlaDatum, setSzamlaDatum] = useState('')
  const [esedekesseg, setEsedekesseg] = useState('')
  const [idoszak, setIdoszak] = useState('')
  const [osszeg, setOsszeg] = useState<number | ''>('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [loading, setLoading] = useState(false)
  /** 2026-09-03: duplikátum-gyanú — a szerver üzenete + a tudatos felülbírálás. */
  const [duplikatumFigyelmeztetes, setDuplikatumFigyelmeztetes] = useState<string | null>(null)
  const [duplikatumVallalva, setDuplikatumVallalva] = useState(false)

  useEffect(() => {
    if (!open || !contract) return
    // Promise.resolve() kerüli el a szinkron setState-et az effect body-ban
    Promise.resolve().then(() => {
      const today = new Date().toISOString().slice(0, 10)
      setSzamlaDatum(today)
      setEsedekesseg(addDays(today, 15))
      setIdoszak(aktualisIdoszak())
      setOsszeg(contract.osszeg)
      setMegjegyzes('')
    })
  }, [open, contract])

  async function handleSubmit() {
    if (!contract) return

    if (!szamlaDatum || !esedekesseg) {
      toast.error('A dátumok kötelezőek.')
      return
    }
    if (esedekesseg < szamlaDatum) {
      toast.error('Az esedékesség nem lehet korábbi, mint a számla dátuma.')
      return
    }
    if (!idoszak.trim()) {
      toast.error('Az időszak megnevezése kötelező.')
      return
    }
    const numOsszeg = Number(osszeg)
    if (!numOsszeg || numOsszeg <= 0) {
      toast.error('Érvényes pozitív összeg kötelező.')
      return
    }

    setLoading(true)
    const res = await issueInvoice({
      berletiSzerzodesId: contract.id,
      szamlaDatum,
      esedekesseg,
      idoszak: idoszak.trim(),
      osszeg: numOsszeg,
      megjegyzes: megjegyzes.trim() || undefined,
      // Csak akkor megy át a kapun, ha a lelkész EXPLICIT bepipálta.
      megerositettDuplikatum: duplikatumVallalva || undefined,
    })
    setLoading(false)

    if (res.error) {
      // 2026-09-03 (átvilágítás P0): duplikátum-gyanúnál nem elég egy toast —
      // a jelölőt is fel kell kínálni, különben a lelkész csak annyit lát,
      // hogy „nem sikerült", és keresi, mit rontott el.
      if (res.duplikatumGyanu) setDuplikatumFigyelmeztetes(res.error)
      toast.error(res.error)
      return
    }

    toast.success('Számla kiállítva az Oblio-n keresztül!')
    setDuplikatumFigyelmeztetes(null)
    setDuplikatumVallalva(false)
    onOpenChange(false)
    if (onIssued) await onIssued()
  }

  if (!contract) return null

  const isCeg = !!contract.ceg_nev
  const berlo = isCeg ? contract.ceg_nev : contract.berlo_nev

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-teal-600" />
            Számla kiállítása (e-Factura)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bérlő + szerződés összefoglaló */}
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Szerződés</p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {berlo} {isCeg && contract.ceg_adoszam ? `· ${contract.ceg_adoszam}` : ''}
            </p>
            <p className="text-xs text-slate-600">{contract.leiras}</p>
            <p className="mt-1 text-xs text-slate-500">
              Alapdíj: <strong>{formatCurrency(contract.osszeg)} RON</strong> · fizetési ciklus:{' '}
              {contract.fizetesi_ciklus === 'havi' ? 'havi' : 'éves'}
            </p>
          </div>

          {/* Összeg */}
          <ModalField label="Számla összege (RON)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={osszeg}
              onChange={(e) => setOsszeg(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </ModalField>

          {/* Szolgáltatás időszaka */}
          <ModalField
            label="Szolgáltatás időszaka (román)"
            required
            hint={'Ez kerül a számla tételére. Pl. „martie 2026", „T1 2026", „ianuarie — iunie 2026".'}
          >
            <Input
              value={idoszak}
              onChange={(e) => setIdoszak(e.target.value)}
              placeholder="pl. martie 2026"
            />
          </ModalField>

          {/* Dátumok */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Számla dátuma" required>
              <Input
                type="date"
                value={szamlaDatum}
                onChange={(e) => {
                  setSzamlaDatum(e.target.value)
                  // Auto: esedékesség = +15 nap
                  if (e.target.value) {
                    setEsedekesseg(addDays(e.target.value, 15))
                  }
                }}
              />
            </ModalField>
            <ModalField label="Fizetési határidő" required>
              <Input
                type="date"
                value={esedekesseg}
                onChange={(e) => setEsedekesseg(e.target.value)}
              />
            </ModalField>
          </div>

          {/* Megjegyzés */}
          <ModalField label="Belső megjegyzés (opcionális)" hint="Csak a rendszerben látszik, nem a számlán.">
            <Textarea
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
              rows={2}
              placeholder="pl. „Megbeszélve Kovács János bérlővel."
            />
          </ModalField>

          {/* Jogi figyelmeztetés */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-5 text-amber-900">
            <p className="flex items-center gap-1">
              <Receipt className="size-3.5" />
              <strong>Figyelem</strong>
            </p>
            <p className="mt-1">
              A számla kiállítása után az Oblio automatikusan továbbítja az ANAF SPV-be. A státusz
              (&bdquo;függőben&rdquo; → &bdquo;elfogadva&rdquo;) 1-24 óra alatt áll be az ANAF-nál — de a
              Kartotéka ezt NEM kérdezi le magától, az aktuális állapot az Oblio felületén nézhető meg.
              Sztornó csak külön
              sztornó-számlával lehetséges (könyvelővel egyeztetve).
            </p>
          </div>

          {/* 2026-09-03 (átvilágítás P0): duplikátum-gyanú — a felülbírálást
              KÜLÖN, tudatos lépésként kell megtenni. A jelölő csak akkor
              jelenik meg, ha a szerver ütközést talált; alapból nincs ott,
              hogy senki ne pipálja be „csak úgy". */}
          {duplikatumFigyelmeztetes && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Lehet, hogy ez a számla már elkészült</p>
              <p className="mt-1 leading-relaxed">{duplikatumFigyelmeztetes}</p>
              <p className="mt-2 leading-relaxed">
                Mielőtt újat állítasz ki, <strong>nézd meg az Oblio felületén</strong>, hogy tényleg
                hiányzik-e. Egy fölöslegesen kiállított e-Factura az ANAF-hoz is felmegy, és csak
                sztornó-számlával vonható vissza.
              </p>
              <label className="mt-2 flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={duplikatumVallalva}
                  onChange={(e) => setDuplikatumVallalva(e.target.checked)}
                />
                <span>Ellenőriztem, és tudatosan újabb számlát állítok ki.</span>
              </label>
            </div>
          )}

          {/* Gombok */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Mégse
            </Button>
            <Button
              onClick={handleSubmit}
              // Duplikátum-gyanú után a gomb CSAK a tudatos vállalással él újra.
              disabled={loading || (!!duplikatumFigyelmeztetes && !duplikatumVallalva)}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {loading
                ? 'Kiállítás...'
                : duplikatumFigyelmeztetes
                  ? 'Mégis kiállítom'
                  : 'Számla kiállítása'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
