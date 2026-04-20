'use client'

import { useEffect, useState } from 'react'
import { LockKeyhole, ShieldCheck, ShieldEllipsis } from 'lucide-react'
import { toast } from 'sonner'

import { getGodModePinSettings, updateGodModePin } from '@/app/(dashboard)/god-mode/actions-v4'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SOURCE_LABELS = {
  database: 'Adatbázis',
  env: 'Környezeti változó',
  none: 'Nincs beállítva',
} as const

type PinSource = 'database' | 'env' | 'none'

export function SecuritySettingsTabV2() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pin, setPin] = useState('')
  const [schemaReady, setSchemaReady] = useState(true)
  const [source, setSource] = useState<PinSource>('none')
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      const result = await getGodModePinSettings()
      if (cancelled) return

      if ('error' in result) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      // Ha nincs beállított PIN, üres input-ot mutatunk
      setPin(result.pin || '')
      setSchemaReady(result.schemaReady)
      setSource(result.source)
      setWarning(result.warning)
      setLoading(false)
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    const result = await updateGodModePin(pin)
    setSaving(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    setSchemaReady(true)
    setSource('database')
    setWarning(null)
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Rendszerbiztonsági beállítások betöltése...</div>
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card-raised p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500/80">Rendszergazdai PIN</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-800">6 számjegyű belépőkód</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                A rendszergazdai mód 2 órás, emelt rendszergazdai jogosultságot ad. Itt módosítható a belépéshez használt PIN-kód.
              </p>
            </div>
          </div>

          {warning && (
            <div className="mb-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {warning}
            </div>
          )}

          {!schemaReady && (
            <div className="mb-4 rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              A rendszer jelenleg a környezeti változóból érkező PIN-t használja. A tartós adatbázisos mentéshez futtasd a{' '}
              <code>migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql</code>{' '}
              fájlt.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="god-mode-admin-pin">Rendszergazdai PIN</Label>
              <Input
                id="god-mode-admin-pin"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
              />
              <p className="text-xs text-slate-500">
                Adj meg egy 6 számjegyű PIN-t. Biztonsági okból ne válassz könnyen kitalálható számsort (pl. születési dátum, 123456). A PIN titkosan tárolódik az adatbázisban.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving || pin.length !== 6} className="min-w-40">
              {saving ? 'Mentés...' : 'PIN mentése'}
            </Button>
          </div>
        </div>

        <div className="card-raised p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500/80">Állapot</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-800">Rendszergazdai védelem</h3>
            </div>
          </div>

          <div className="space-y-3">
            <InfoRow label="PIN forrása" value={SOURCE_LABELS[source]} />
            <InfoRow label="PIN hossza" value={`${pin.length || 6} számjegy`} />
            <InfoRow label="Munkamenet időtartama" value="2 óra" />
            <InfoRow label="Tárolás módja" value={schemaReady ? 'Adatbázis vagy fallback' : 'Fallback mód'} />
          </div>

          <div className="mt-4 rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            A rendszergazdai mód csak főadmin számára használható. A lejárat után a rendszer automatikusan megszünteti a kiemelt hozzáférést.
          </div>
        </div>
      </div>

      <div className="card-raised p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <ShieldEllipsis className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Javasolt működési rend</h3>
            <p className="text-sm text-slate-500">A rendszergazdai módot csak tényleges rendszergazdai beavatkozáskor érdemes használni.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <GuideCard
            title="Rövid ideig használd"
            text="A kiemelt mód célja az ellenőrzött, ideiglenes adminisztráció. Munka után mindig lépj ki belőle."
          />
          <GuideCard
            title="PIN-t időnként cserélj"
            text="A 6 számjegyű kód legyen egyedi, és célszerű rendszeresen frissíteni, főleg szerepkörváltás után."
          />
          <GuideCard
            title="Kérésalapú hozzáférés"
            text="A rendszergazdai mód a legvégső eszköz legyen. A normál hozzáféréseket továbbra is jóváhagyási folyamattal kezeld."
          />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-slate-100 bg-white/80 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )
}

function GuideCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-100 bg-white/80 p-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.18)]">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}
