'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Church,
  FileBadge,
  Landmark,
  Loader2,
  MapPin,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { getCongregationContext } from '@/app/(setup)/welcome/actions'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
import { Button } from '@/components/ui/button'

import {
  WizardSectionCard,
  WizardField,
  WizardInputGrid,
  WizardBanner,
  Input,
} from './_helpers/wizard-ui'
import {
  BankAccountsSection,
  type BankAccountSlot,
} from './_helpers/bank-accounts-section'
import type { WizardData } from '../welcome-wizard-client'

interface Step2Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: (
    congregation: WizardData['congregation'],
    bankAccounts: BankAccountSlot[],
  ) => void | Promise<void>
  onBack: () => void
  saving?: boolean
  /** 2026-06-05: "Adatok ellenőrzése" mód — egy újabb lelkésznél, ahol a
   *  gyülekezetet egy korábbi lelkész már beállította. A mezők előre kitöltöttek;
   *  a felhasználó csak átnézi és a hiányzókat pótolja. */
  reviewMode?: boolean
}

export function Step2Congregation({
  data,
  updateData,
  onNext,
  onBack,
  saving,
  reviewMode = false,
}: Step2Props) {
  const [form, setForm] = useState(data.congregation)
  const [bankAccounts, setBankAccounts] = useState(data.bankAccounts)
  const [districtName, setDistrictName] = useState<string | null>(null)
  const [dioceseName, setDioceseName] = useState<string | null>(null)
  const [dioceseLoading, setDioceseLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await getCongregationContext()
      if (cancelled) return
      if ('data' in result) {
        setDistrictName(result.data.districtName)
        setDioceseName(result.data.dioceseName)
        // 2026-06-04: auto-kitöltés a hozzárendelt gyülekezet meglévő adataiból
        // (regisztrációból + seed). CSAK az üres mezőket töltjük, hogy a
        // felhasználó esetleges beírását ne írjuk felül.
        const cong = result.data.congregation
        if (cong) {
          setForm((f) => ({
            ...f,
            // A regisztrációnál választott egyházközség neve (a lista a
            // COALESCE(nev_hu, name)-t mutatta) — ezt töltjük a hivatalos
            // elnevezésekbe is. Üres mezőket nem írunk felül.
            nev: f.nev || cong.nev_hu || cong.name || '',
            nev_hu: f.nev_hu || cong.nev_hu || cong.name || '',
            nev_ro: f.nev_ro || cong.nev_ro || '',
            adoszam: f.adoszam || cong.adoszam || '',
            email: f.email || cong.email || '',
            telefon: f.telefon || cong.telefon || '',
            web: f.web || cong.web || '',
            megye: f.megye || cong.megye || '',
            varos: f.varos || cong.varos || '',
            cim: f.cim || cong.cim || '',
            iranyitoszam: f.iranyitoszam || cong.iranyitoszam || '',
            hazszam: f.hazszam || cong.hazszam || '',
            country: f.country || cong.country || 'Románia',
            adrlocality_id: f.adrlocality_id ?? cong.adrlocality_id ?? null,
            adrstreet_id: f.adrstreet_id ?? cong.adrstreet_id ?? null,
          }))
        }
      }
      setDioceseLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!form.nev.trim()) {
      toast.error('A gyülekezet neve kötelező')
      return
    }
    if (!form.varos.trim()) {
      toast.error(
        'A helységet ki kell tölteni — válasszon megyét és helységet a "Hivatalos cím" szakaszban.',
      )
      return
    }
    // Banki számlák validáció: ha van legalább egy, mindegyiknek legyen
    // bank_neve és valuta. IBAN opcionális (pasztorálisan, sok kis számla
    // még nem tudja a saját IBAN-ját). Ha üres a lista, az is OK.
    const invalid = bankAccounts.find(b => !b.bank_neve.trim())
    if (invalid) {
      toast.error(
        'Minden banki számlához add meg a bank nevét — vagy töröld a felesleges sorokat.',
      )
      return
    }
    // Pontosan egy fő számla kell, ha van legalább egy
    if (bankAccounts.length > 0 && !bankAccounts.some(b => b.is_default)) {
      const next = bankAccounts.map((b, i) => ({ ...b, is_default: i === 0 }))
      setBankAccounts(next)
      updateData({ congregation: form, bankAccounts: next })
      await onNext(form, next)
      return
    }
    updateData({ congregation: form, bankAccounts })
    await onNext(form, bankAccounts)
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
          <Church className="size-6 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl text-slate-800">
            {reviewMode ? 'Adatok ellenőrzése' : 'Gyülekezeti alapadatok'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {reviewMode
              ? 'A gyülekezet adatait egy korábbi lelkész már kitöltötte. Kérjük, nézd át, és ha valami hiányzik vagy pontosításra szorul, itt kiegészítheted. Ha minden rendben, kattints a Tovább gombra.'
              : 'Az itt megadott adatok a gyülekezetére vonatkoznak — ezek szerepelnek majd a hivatalos iratokon, nyomtatványokon. A saját személyes adatait a következő lépésen adja meg.'}
          </p>
        </div>
      </header>

      {reviewMode && (
        <WizardBanner tone="info">
          <p>
            <strong>Ezt a lépést átugorhatod,</strong> ha a lentebbi adatok rendben
            vannak — semmit nem kötelező módosítanod. Csak akkor írj át valamit, ha
            hiányos vagy pontatlan.
          </p>
        </WizardBanner>
      )}

      {/* Egyházi hovatartozás (egyházkerület + egyházmegye) — csak olvasható,
          a regisztrációból / admin-jóváhagyásból */}
      <WizardSectionCard
        icon={Landmark}
        iconColor="text-sky-700"
        iconBg="bg-sky-50"
        title="Egyházi hovatartozás"
        description="A regisztrációkor megadott, a rendszergazda által jóváhagyott besorolás — itt csak információ."
      >
        {dioceseLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Betöltés…</span>
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Egyházkerület
              </p>
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
                {districtName || '— nincs beállítva —'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Egyházmegye
              </p>
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
                {dioceseName || '— nincs beállítva —'}
              </p>
            </div>
          </div>
        )}
      </WizardSectionCard>

      {/* Hivatalos elnevezések */}
      <WizardSectionCard
        icon={Church}
        iconColor="text-emerald-700"
        iconBg="bg-emerald-50"
        title="Hivatalos elnevezések"
        description="A gyülekezet ahogy a hivatalos iratokon megjelenik."
      >
        <WizardField
          id="nev"
          label="Gyülekezet neve (hivatalos)"
          required
          hint="A hivatalos romániai név (CIF/CUI alapján)."
        >
          <Input
            id="nev"
            placeholder="pl. Barátosi Református Egyházközség"
            value={form.nev}
            onChange={e => update('nev', e.target.value)}
          />
        </WizardField>

        <WizardInputGrid cols={2}>
          <WizardField id="nev_hu" label="Magyar név (rövid)" hint="Belső használatra.">
            <Input
              id="nev_hu"
              placeholder="pl. Barátosi Református"
              value={form.nev_hu}
              onChange={e => update('nev_hu', e.target.value)}
            />
          </WizardField>
          <WizardField id="nev_ro" label="Román név" hint="Hivatalos román nyelvű név.">
            <Input
              id="nev_ro"
              placeholder="pl. Parohia Reformată Brateș"
              value={form.nev_ro}
              onChange={e => update('nev_ro', e.target.value)}
            />
          </WizardField>
        </WizardInputGrid>
      </WizardSectionCard>

      {/* Jogi azonosító */}
      <WizardSectionCard
        icon={FileBadge}
        iconColor="text-violet-700"
        iconBg="bg-violet-50"
        title="Jogi azonosító"
        description="A gyülekezet hivatalos romániai adóazonosítója."
      >
        <div className="md:max-w-md">
          <WizardField
            id="adoszam"
            label="Adószám (CUI)"
            hint="Az ANAF által kiosztott egyedi szám. Bizonylatokon, hivatalos leveleken szerepel."
          >
            <Input
              id="adoszam"
              placeholder="pl. 12345678"
              value={form.adoszam}
              onChange={e => update('adoszam', e.target.value)}
            />
          </WizardField>
        </div>
      </WizardSectionCard>

      {/* Hivatalos cím */}
      <WizardSectionCard
        icon={MapPin}
        iconColor="text-rose-700"
        iconBg="bg-rose-50"
        title="Hivatalos cím"
        description="A gyülekezet (templom, parókia) hivatalos címe."
      >
        <p className="text-xs text-slate-500">
          A megye és helység a hivatalos romániai adatbázisból választható; az
          irányítószám automatikusan kitöltődik az utca alapján.
        </p>

        <AddressForm
          value={{
            countyId: null,
            localityId: form.adrlocality_id,
            streetId: form.adrstreet_id,
            country: form.country || 'Románia',
            county: form.megye || '',
            locality: form.varos || '',
            street: form.cim || '',
            houseNumber: form.hazszam || '',
            postalcode: form.iranyitoszam || '',
            isForeign: form.isForeign || false,
          }}
          onChange={(v: AddressValue) =>
            setForm(f => ({
              ...f,
              country: v.country,
              megye: v.county,
              varos: v.locality,
              cim: v.street,
              hazszam: v.houseNumber,
              iranyitoszam: v.postalcode,
              adrlocality_id: v.localityId,
              adrstreet_id: v.streetId,
              isForeign: v.isForeign,
            }))
          }
          lang="hu"
        />
      </WizardSectionCard>

      {/* Elérhetőségek — banner figyelmeztet, hogy NEM saját, hanem gyülekezeti */}
      <WizardSectionCard
        icon={AtSign}
        iconColor="text-indigo-700"
        iconBg="bg-indigo-50"
        title="Gyülekezeti elérhetőségek"
        description="Hivatalos kapcsolattartási adatok. NEM a saját adatait — azt a következő lépésen adja meg."
        banner={
          <WizardBanner tone="warning" icon={ShieldAlert}>
            <p>
              <strong>Figyelem!</strong> Itt a <em>gyülekezet</em> hivatalos
              elérhetőségeit add meg (parókiai e-mail, közös telefon, gyülekezeti
              honlap) — <strong>NEM a saját elérhetőségeidet</strong>. A saját
              telefon-/email-címedet a következő, &bdquo;Lelkészi adatok&rdquo;
              lépésben adhatod meg.
            </p>
          </WizardBanner>
        }
      >
        <WizardInputGrid cols={3}>
          <WizardField
            id="cong-email"
            label="Gyülekezeti e-mail"
            hint="A gyülekezet közös, hivatalos e-mail címe."
          >
            <Input
              id="cong-email"
              type="email"
              placeholder="gyulekezet@erek.ro"
              value={form.email}
              onChange={e => update('email', e.target.value)}
            />
          </WizardField>
          <WizardField
            id="cong-telefon"
            label="Gyülekezeti telefon"
            hint="A parókia telefonszáma."
          >
            <Input
              id="cong-telefon"
              placeholder="+40 740 123 456"
              value={form.telefon}
              onChange={e => update('telefon', e.target.value)}
            />
          </WizardField>
          <WizardField
            id="cong-web"
            label="Gyülekezeti weboldal"
            hint="Ha van — opcionális."
          >
            <Input
              id="cong-web"
              placeholder="pl. baratos.erek.ro"
              value={form.web}
              onChange={e => update('web', e.target.value)}
            />
          </WizardField>
        </WizardInputGrid>
      </WizardSectionCard>

      {/* Banki adatok — multi-számla */}
      <BankAccountsSection
        accounts={bankAccounts}
        onChange={setBankAccounts}
      />

      {/* Nav buttons */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" disabled={saving}>
          <ArrowLeft className="size-4" />
          Vissza
        </Button>
        <Button
          size="lg"
          className="gap-2 rounded-xl px-6"
          onClick={handleNext}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {saving ? 'Mentés…' : 'Tovább'}
        </Button>
      </div>
    </div>
  )
}
