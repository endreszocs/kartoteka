'use client'

/**
 * „Egyházmegyénk" — az egyházmegye alapadatainak szerkesztője.
 *
 * A gyülekezet adatlap mintájára készült (congregation-dialog-v2). Mezők:
 *   - Alapadatok: név, CIF, adószám
 *   - Cím: ország, megye, település, irányítószám, utca
 *   - Elérhetőségek: email, telefon, weboldal
 *   - Banki adatok: bank név, IBAN, valuta
 *   - Vezetés: esperes név/cím, jegyző név
 *   - Megjegyzés
 *
 * Szerkesztheti: esperes, egyházmegyei admin, rendszergazda.
 */

import { useEffect, useState, useTransition } from 'react'
import { Save, Building2, FileText, MapPin, Phone, Landmark, Users, StickyNote } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import {
  getDiocese, updateDiocese,
  type DioceseRecord,
} from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'

export function OurDioceseSection({ dioceseId }: { dioceseId: string }) {
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<DioceseRecord | null>(null)
  const [form, setForm] = useState({
    name: '',
    cif: '', adoszam: '', cnp_letter: '',
    cim_orszag: 'Románia', cim_megye: '', cim_telepules: '', cim_iranyitoszam: '', cim_utca: '',
    email: '', telefon: '', weboldal: '',
    bank_nev: '', bank_fo_iban: '', bank_fo_iban_valuta: 'RON',
    esperes_nev: '', esperes_cim: '', jegyzo_nev: '',
    megjegyzes: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await getDiocese(dioceseId)
      if (res.error) {
        toast.error(res.error)
      } else if (res.data) {
        setRecord(res.data)
        setForm({
          name: res.data.name || '',
          cif: res.data.cif || '',
          adoszam: res.data.adoszam || '',
          cnp_letter: res.data.cnp_letter || '',
          cim_orszag: res.data.cim_orszag || 'Románia',
          cim_megye: res.data.cim_megye || '',
          cim_telepules: res.data.cim_telepules || '',
          cim_iranyitoszam: res.data.cim_iranyitoszam || '',
          cim_utca: res.data.cim_utca || '',
          email: res.data.email || '',
          telefon: res.data.telefon || '',
          weboldal: res.data.weboldal || '',
          bank_nev: res.data.bank_nev || '',
          bank_fo_iban: res.data.bank_fo_iban || '',
          bank_fo_iban_valuta: res.data.bank_fo_iban_valuta || 'RON',
          esperes_nev: res.data.esperes_nev || '',
          esperes_cim: res.data.esperes_cim || '',
          jegyzo_nev: res.data.jegyzo_nev || '',
          megjegyzes: res.data.megjegyzes || '',
        })
      }
      setLoading(false)
    })()
  }, [dioceseId])

  function handleSave() {
    setFieldErrors({})
    startTransition(async () => {
      const res = await updateDiocese({
        id: dioceseId,
        ...form,
      })
      if (res.error) {
        toast.error(res.error)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      toast.success('Egyházmegye adatai mentve!')
    })
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Egyházmegye betöltése…</div>
  }

  if (!record) {
    return <div className="py-12 text-center text-sm text-rose-500">Nem sikerült betölteni az egyházmegye adatait.</div>
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="card-raised p-5 bg-gradient-to-br from-violet-50/60 to-white border-violet-100">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
            <Building2 className="size-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-violet-700/70 font-semibold">Egyházmegyénk</p>
            <h2 className="font-heading text-2xl text-slate-800 leading-tight">{record.name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Az egyházmegye hivatalos adatai. A CIF és a címadatok a nyugtatömbökön és pénzügyi dokumentumokon megjelennek.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-xl bg-violet-600 text-white hover:bg-violet-700 gap-1.5 shrink-0"
          >
            <Save className="size-4" />
            {isPending ? 'Mentés…' : 'Mentés'}
          </Button>
        </div>
      </div>

      {/* 1. Alapadatok */}
      <Section icon={<FileText className="size-4 text-indigo-600" />} title="Alapadatok és jogi azonosítók">
        <div className="grid gap-3 md:grid-cols-2">
          <ModalField label="Egyházmegye neve *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {fieldErrors.name && <p className="text-xs text-rose-600 mt-1">{fieldErrors.name}</p>}
          </ModalField>
          <ModalField label="CIF (román adóazonosító)">
            <Input value={form.cif} onChange={(e) => setForm({ ...form, cif: e.target.value })} placeholder="Pl. 12345678" />
          </ModalField>
          <ModalField label="Magyar adószám (opcionális)">
            <Input value={form.adoszam} onChange={(e) => setForm({ ...form, adoszam: e.target.value })} />
          </ModalField>
          <ModalField label="Hivatali főszám">
            <Input value={form.cnp_letter} onChange={(e) => setForm({ ...form, cnp_letter: e.target.value })} />
          </ModalField>
        </div>
      </Section>

      {/* 2. Cím */}
      <Section icon={<MapPin className="size-4 text-sky-600" />} title="Cím">
        <div className="grid gap-3 md:grid-cols-4">
          <ModalField label="Ország">
            <Input value={form.cim_orszag} onChange={(e) => setForm({ ...form, cim_orszag: e.target.value })} />
          </ModalField>
          <ModalField label="Megye">
            <Input value={form.cim_megye} onChange={(e) => setForm({ ...form, cim_megye: e.target.value })} />
          </ModalField>
          <ModalField label="Irányítószám">
            <Input value={form.cim_iranyitoszam} onChange={(e) => setForm({ ...form, cim_iranyitoszam: e.target.value })} />
          </ModalField>
          <ModalField label="Település">
            <Input value={form.cim_telepules} onChange={(e) => setForm({ ...form, cim_telepules: e.target.value })} />
          </ModalField>
          <div className="md:col-span-4">
            <ModalField label="Utca, házszám">
              <Input value={form.cim_utca} onChange={(e) => setForm({ ...form, cim_utca: e.target.value })} />
            </ModalField>
          </div>
        </div>
      </Section>

      {/* 3. Elérhetőségek */}
      <Section icon={<Phone className="size-4 text-emerald-600" />} title="Elérhetőségek">
        <div className="grid gap-3 md:grid-cols-3">
          <ModalField label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pl. office@egyhazmegye.ro" />
            {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
          </ModalField>
          <ModalField label="Telefon">
            <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
          </ModalField>
          <ModalField label="Weboldal">
            <Input value={form.weboldal} onChange={(e) => setForm({ ...form, weboldal: e.target.value })} placeholder="https://..." />
          </ModalField>
        </div>
      </Section>

      {/* 4. Bank */}
      <Section icon={<Landmark className="size-4 text-teal-600" />} title="Banki adatok">
        <p className="text-xs text-slate-500 mb-2">
          A fő IBAN és bank neve. További bankszámlák részletesebb kezelése a &bdquo;Pénzügy&rdquo; fülön.
        </p>
        <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_0.8fr]">
          <ModalField label="Bank neve">
            <Input value={form.bank_nev} onChange={(e) => setForm({ ...form, bank_nev: e.target.value })} placeholder="Pl. BCR" />
          </ModalField>
          <ModalField label="IBAN">
            <Input value={form.bank_fo_iban} onChange={(e) => setForm({ ...form, bank_fo_iban: e.target.value })} placeholder="RO..." className="font-mono text-xs" />
          </ModalField>
          <ModalField label="Valuta">
            <select
              value={form.bank_fo_iban_valuta}
              onChange={(e) => setForm({ ...form, bank_fo_iban_valuta: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
              <option value="HUF">HUF</option>
              <option value="USD">USD</option>
            </select>
          </ModalField>
        </div>
      </Section>

      {/* 5. Vezetés */}
      <Section icon={<Users className="size-4 text-amber-600" />} title="Vezetés">
        <div className="grid gap-3 md:grid-cols-3">
          <ModalField label="Esperes neve">
            <Input value={form.esperes_nev} onChange={(e) => setForm({ ...form, esperes_nev: e.target.value })} />
          </ModalField>
          <ModalField label="Esperes címe / rangja">
            <Input value={form.esperes_cim} onChange={(e) => setForm({ ...form, esperes_cim: e.target.value })} placeholder="pl. esperes, esperesi megbízott" />
          </ModalField>
          <ModalField label="Egyházmegyei jegyző">
            <Input value={form.jegyzo_nev} onChange={(e) => setForm({ ...form, jegyzo_nev: e.target.value })} />
          </ModalField>
        </div>
      </Section>

      {/* 6. Megjegyzés */}
      <Section icon={<StickyNote className="size-4 text-slate-500" />} title="Megjegyzés">
        <Textarea
          value={form.megjegyzes}
          onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })}
          placeholder="Egyéb fontos információ az egyházmegyéről…"
          rows={3}
        />
      </Section>

      {/* Alsó mentő gomb */}
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-violet-600 text-white hover:bg-violet-700 gap-1.5"
        >
          <Save className="size-4" />
          {isPending ? 'Mentés folyamatban…' : 'Mentés'}
        </Button>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="card-raised p-5 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-heading text-base text-slate-800">{title}</h3>
      </div>
      {children}
    </section>
  )
}
