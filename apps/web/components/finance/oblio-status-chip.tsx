'use client'

/**
 * Oblio állapot-chip a Pénzügy modul fejlécében (hero).
 *
 * Egy kompakt chip, amely minden Pénzügy fülön ott van, és gyors állapotot
 * mutat:
 *   - 🔴 nincs beállítva (amber alap)
 *   - 🟢 kapcsolat OK (emerald alap)
 *   - 🟡 kapcsolat hibás vagy régi teszt (amber alap)
 *   - ⚪ betöltés alatt
 *
 * Kattintásra modal nyílik a beállítással / kapcsolat teszttel / módosítással.
 *
 * (A korábbi `OblioConfigCard`-ot ez a chip + modal kombináció váltja le.)
 */

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Settings2,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  getOblioConfig,
  saveOblioConfig,
  testOblioConnection,
  deleteOblioConfig,
  type OblioConfigStatus,
} from '@/app/(dashboard)/penzugy/oblio-config-actions'

type ChipState = 'loading' | 'ok' | 'warn' | 'missing' | 'error'

function deriveState(status: OblioConfigStatus | null, loading: boolean): ChipState {
  if (loading) return 'loading'
  if (!status?.hasConfig) return 'missing'
  if (status.config?.utolso_teszt_ok === true) return 'ok'
  if (status.config?.utolso_teszt_ok === false) return 'error'
  return 'warn' // még nem tesztelt
}

const CHIP_STYLES: Record<ChipState, { bg: string; text: string; ring: string; icon: typeof KeyRound; label: string; tooltip: string }> = {
  loading: {
    bg: 'bg-white/80',
    text: 'text-slate-500',
    ring: '',
    icon: Loader2,
    label: 'Oblio: ellenőrzés…',
    tooltip: 'Az Oblio kapcsolat állapotának ellenőrzése folyamatban',
  },
  missing: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-1 ring-amber-200',
    icon: ShieldAlert,
    label: 'Oblio: nincs beállítva',
    tooltip: 'Az Oblio e-Factura kapcsolat még nincs beállítva — kattints a beállításhoz',
  },
  ok: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-1 ring-emerald-200',
    icon: CheckCircle2,
    label: 'Oblio: kapcsolva',
    tooltip: 'Az Oblio kapcsolat sikeresen tesztelve — kattints a beállítások megtekintéséhez',
  },
  warn: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-1 ring-amber-200',
    icon: AlertCircle,
    label: 'Oblio: tesztelendő',
    tooltip: 'Az Oblio kapcsolatot még nem teszteltük ebben a környezetben — kattints a teszteléshez',
  },
  error: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-1 ring-red-200',
    icon: AlertCircle,
    label: 'Oblio: kapcsolat hiba',
    tooltip: 'Az utolsó kapcsolat-teszt hibát adott — kattints a hibaüzenethez és újrapróbáláshoz',
  },
}

export function OblioStatusChip() {
  const [status, setStatus] = useState<OblioConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await getOblioConfig()
      setStatus(res)
    } finally {
      setLoading(false)
    }
  }

  const state = deriveState(status, loading)
  const cfg = status?.config
  const style = CHIP_STYLES[state]
  const Icon = style.icon

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={style.tooltip}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-all hover:shadow-md hover:scale-[1.02] ${style.bg} ${style.text} ${style.ring}`}
      >
        <Icon className={`size-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} />
        <span>{style.label}</span>
      </button>

      <OblioConfigDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) void refresh()
        }}
        status={status}
        onChanged={refresh}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Modal — beállítás + kapcsolat teszt
// ─────────────────────────────────────────────────────────────

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: OblioConfigStatus | null
  onChanged: () => Promise<void>
}

function OblioConfigDialog({ open, onOpenChange, status, onChanged }: DialogProps) {
  const cfg = status?.config
  const hasConfig = Boolean(status?.hasConfig)

  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [cif, setCif] = useState('')
  const [sorozat, setSorozat] = useState('KA')
  const [serviceName, setServiceName] = useState('Chirie spațiu')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Megnyitáskor kezdő állapot — szerkesztés ki, ha van config
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setEditing(!hasConfig) // ha nincs config, egyből szerkesztésbe ugorjon
      if (cfg) {
        setEmail(cfg.email)
        setCif(cfg.cif)
        setSorozat(cfg.sorozat_default || 'KA')
        setServiceName(cfg.nev_default_service || 'Chirie spațiu')
      } else {
        setEmail('')
        setCif('')
        setSorozat('KA')
        setServiceName('Chirie spațiu')
      }
      setApiSecret('') // soha ne töltsük elő
    })
    return () => { cancelled = true }
  }, [open, hasConfig, cfg])

  async function handleSave() {
    if (!email.includes('@')) {
      toast.error('Érvényes email kötelező.')
      return
    }
    if (apiSecret.length < 20) {
      toast.error('Az API secret legalább 20 karakter legyen.')
      return
    }
    if (cif.length < 4) {
      toast.error('Érvényes CIF kötelező.')
      return
    }

    setSaving(true)
    const res = await saveOblioConfig({
      email: email.trim(),
      apiSecret: apiSecret.trim(),
      cif: cif.trim(),
      sorozat_default: sorozat.trim(),
      nev_default_service: serviceName.trim(),
    })
    setSaving(false)

    if (res.error) {
      toast.error(res.error)
      return
    }

    toast.success('Oblio beállítás mentve.')
    setEditing(false)
    setApiSecret('')
    await onChanged()
  }

  async function handleTest() {
    setTesting(true)
    const res = await testOblioConnection()
    setTesting(false)
    if (res.success) {
      toast.success(`Kapcsolat sikeres: ${res.companyName || 'OK'}`)
    } else {
      toast.error(res.error || 'Ismeretlen hiba.')
    }
    await onChanged()
  }

  async function handleDelete() {
    const ok = window.confirm(
      'Biztosan törlöd az Oblio beállítást? A kiállított számlák megmaradnak, de új számlát nem tudsz kiállítani, amíg újra be nem állítod.',
    )
    if (!ok) return
    const res = await deleteOblioConfig()
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Oblio beállítás törölve.')
    await onChanged()
    setEditing(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[90dvh] overflow-y-auto
          border border-teal-200 bg-gradient-to-br from-white via-white to-teal-50/40
          p-0 gap-0 rounded-2xl
        "
      >
        {/* Fejléc — saját padding-gel, hogy szellős legyen */}
        <DialogHeader className="border-b border-teal-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm">
              <KeyRound className="size-5" />
            </span>
            Oblio e-Factura kapcsolat
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Az Oblio román számlázó rendszer, ami automatikusan továbbítja az e-Facturákat
            az ANAF SPV-be. <strong>Ingyenes</strong> szinten max. 3 dokumentum/hó, fizetős
            (29 €/év) korlátlan.
          </DialogDescription>
        </DialogHeader>

        {/* Tartalom — szellős, jól tagolt */}
        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-5">
          {/* Olvasási nézet */}
          {!editing && hasConfig && cfg && (
            <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <Row label="Email" value={cfg.email} />
                <Row label="CIF / CUI" value={cfg.cif} mono />
                <Row label="Számlasorozat" value={cfg.sorozat_default || '—'} />
                <Row label="Szolgáltatás név" value={cfg.nev_default_service || '—'} />
              </div>
              {cfg.utolso_teszt_at && (
                <div className="rounded-xl border border-emerald-200 bg-white/60 px-4 py-3 text-xs">
                  <p className="text-slate-600">
                    Utolsó teszt: <strong>{new Date(cfg.utolso_teszt_at).toLocaleString('hu-HU')}</strong>
                  </p>
                  {cfg.utolso_teszt_ok ? (
                    <p className="text-emerald-700 font-medium">✓ Sikeres kapcsolat</p>
                  ) : (
                    <p className="text-red-600">
                      ✗ Hiba: {cfg.utolso_teszt_hiba || 'ismeretlen'}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  className="rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Tesztelés…
                    </>
                  ) : (
                    'Kapcsolat tesztelése'
                  )}
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => setEditing(true)}>
                  <Settings2 className="mr-1.5 size-4" /> Módosítás
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 ml-auto"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-1.5 size-4" /> Törlés
                </Button>
              </div>
            </div>
          )}

          {/* Üres állapot — még nincs config, de nem szerkesztünk */}
          {!editing && !hasConfig && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 sm:p-6">
              <p className="text-sm leading-6 text-amber-800">
                Még nincs Oblio beállítás. Kattints a &bdquo;Beállítás indítása&rdquo; gombra a kapcsolat
                létrehozásához.
              </p>
              <div className="mt-4 rounded-xl bg-white/70 border border-amber-100 p-4 text-xs leading-6 text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Szükséged lesz:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li><strong>Oblio email</strong> — a fiókod e-mail címe</li>
                  <li><strong>API secret</strong> — Oblio Beállítások → Account Data → Generate API secret</li>
                  <li><strong>CIF / CUI</strong> — a gyülekezet adószáma</li>
                </ul>
              </div>
              <Button
                className="mt-4 rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                onClick={() => setEditing(true)}
              >
                Beállítás indítása
              </Button>
            </div>
          )}

          {/* Szerkesztés form */}
          {editing && (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Oblio email *">
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="fiok@gyulekezet.hu"
                    autoComplete="off"
                    className="h-10"
                  />
                </Field>
                <Field label="API secret * (min. 20 karakter)">
                  <Input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Új secret — nem mutatjuk vissza"
                    autoComplete="new-password"
                    className="h-10"
                  />
                </Field>
                <Field label="CIF / CUI *">
                  <Input
                    value={cif}
                    onChange={(e) => setCif(e.target.value)}
                    placeholder="pl. 23456789"
                    className="h-10 font-mono"
                  />
                </Field>
                <Field label="Számlasorozat">
                  <Input
                    value={sorozat}
                    onChange={(e) => setSorozat(e.target.value)}
                    placeholder="KA"
                    className="h-10"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Alapértelmezett szolgáltatás név (román)">
                    <Input
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="Chirie spațiu"
                      className="h-10"
                    />
                  </Field>
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                🔒 Az API secret <strong>titkosítva tárolódik</strong>, nem olvasható vissza. Ha elfelejted,
                újat kell generálni az Oblio fiókban.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  className="rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                    </>
                  ) : (
                    'Mentés'
                  )}
                </Button>
                {hasConfig && (
                  <Button variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>
                    <X className="mr-1.5 size-4" />
                    Mégse
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`font-medium text-slate-800 break-all ${mono ? 'font-mono text-sm' : ''}`}>{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
