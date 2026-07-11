'use client'

/**
 * Rendszer (biztonság) fül — rendszergazdai PIN kezelés.
 *
 * 2026-07-11 admin-redesign + BIZTONSÁGI FIX:
 *   - a szerver többé nem küldi le a tényleges PIN-t (getGodModePinSettings
 *     csak metaadatot ad: isSet/source/schemaReady) — a mező write-only,
 *     type="password" + autoComplete="new-password";
 *   - token-alapú színek (dark-safe), mobil-first elrendezés;
 *   - a veszélyes szekció destructive-tónust kapott.
 */

import { useEffect, useState } from 'react'
import { LockKeyhole, ShieldAlert, ShieldCheck, ShieldEllipsis } from 'lucide-react'
import { toast } from 'sonner'

import { getGodModePinSettings, updateGodModePin } from '@/app/(dashboard)/god-mode/actions-v4'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
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
  /**
   * Ha a szerver megtagadja a PIN-metaadatok kiadását (nem fő rendszergazda),
   * a szerkeszthetőnek látszó, de valójában működésképtelen PIN-panel HELYETT
   * magyarázó kártyát mutatunk (a Veszélyes zóna nem-admin kártyájának mintájára).
   */
  const [accessError, setAccessError] = useState<string | null>(null)
  /** Az ÚJ PIN, amit a rendszergazda beír — a jelenlegi PIN sosem jön le a szerverről. */
  const [pin, setPin] = useState('')
  const [pinSet, setPinSet] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [source, setSource] = useState<PinSource>('none')
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      const result = await getGodModePinSettings()
      if (cancelled) return

      if ('error' in result) {
        // Nem fő rendszergazda: NEM mutatunk működésképtelen PIN-panelt,
        // hanem a lenti magyarázó kártyát (toast nélkül — a kártya elmagyarázza).
        setAccessError(result.error ?? 'Ehhez a művelethez nincs jogosultságod.')
        setLoading(false)
        return
      }

      setPinSet(result.isSet)
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
    setPin('')
    setPinSet(true)
    setSchemaReady(true)
    setSource('database')
    setWarning(null)
  }

  if (loading) {
    return <AdminSkeleton rows={4} className="py-4" />
  }

  // Nem fő rendszergazda — magyarázó kártya a nem-működő PIN-panel helyett.
  if (accessError) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive sm:size-12">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base text-foreground sm:text-lg">
              A rendszergazdai PIN kezelése csak a fő rendszergazdának érhető el
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              A te szerepköröddel a rendszer nem engedélyezi a rendszergazdai PIN
              megtekintését vagy módosítását — ezért a beállító panel nem jelenik meg.
              Ha PIN-változtatásra van szükség, kérd a fő rendszergazda segítségét.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        {/* PIN-módosítás — érzékeny művelet, destructive-tónus */}
        <section className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3 sm:gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive sm:size-12">
              <LockKeyhole className="size-5" />
            </div>
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'color-mix(in oklab, var(--destructive) 75%, var(--muted-foreground))' }}
              >
                Rendszergazdai PIN
              </p>
              <h3 className="mt-1 font-heading text-lg text-foreground sm:text-xl">6 számjegyű belépőkód</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                A rendszergazdai mód 2 órás, emelt jogosultságot ad. Itt állítható be
                a belépéshez használt PIN-kód — a jelenlegi kód biztonsági okból nem
                jelenik meg, csak új adható meg helyette.
              </p>
            </div>
          </div>

          {warning && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
              {warning}
            </div>
          )}

          {!schemaReady && (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-200">
              {source === 'env'
                ? 'A rendszer jelenleg a szerveren beállított (környezeti változós) PIN-t használja. Az adatbázisos, itt módosítható tároláshoz még telepíteni kell a kiegészítő adatbázis-bővítést.'
                : 'A PIN adatbázisos tárolója még nincs telepítve, és a szerveren sincs beállítva PIN — a rendszergazdai mód jelenleg nem aktiválható.'}
              <span className="mt-1 block text-xs opacity-75">
                Technikai részlet: <code>2026-04-09-god-mode-and-congregation-finance.sql</code>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="god-mode-admin-pin">Új PIN beállítása</Label>
                <span className="text-xs text-muted-foreground">
                  A jelenlegi PIN beállítva:{' '}
                  <span className="font-semibold text-foreground">{pinSet ? 'igen' : 'nem'}</span>
                </span>
              </div>
              <Input
                id="god-mode-admin-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Adj meg egy 6 számjegyű PIN-t. Ne válassz könnyen kitalálható számsort
                (pl. születési dátum, 123456). A PIN a rendszerbeállítások közt
                tárolódik; csak a fő rendszergazda módosíthatja.
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleSave}
              disabled={saving || pin.length !== 6}
              className="w-full sm:w-auto sm:min-w-36"
            >
              {saving ? 'Mentés…' : 'PIN mentése'}
            </Button>
          </div>
        </section>

        {/* Állapot-panel */}
        <section className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3 sm:gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:size-12">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'color-mix(in oklab, var(--primary) 65%, var(--muted-foreground))' }}
              >
                Állapot
              </p>
              <h3 className="mt-1 font-heading text-lg text-foreground sm:text-xl">Rendszergazdai védelem</h3>
            </div>
          </div>

          <div className="space-y-2.5">
            <InfoRow label="PIN forrása" value={SOURCE_LABELS[source]} />
            <InfoRow
              label="Jelenlegi PIN"
              value={
                pinSet ? (
                  <StatusBadge intent="success">Beállítva</StatusBadge>
                ) : (
                  <StatusBadge intent="warning">Nincs beállítva</StatusBadge>
                )
              }
            />
            <InfoRow label="Munkamenet időtartama" value="2 óra" />
            <InfoRow label="Tárolás módja" value={schemaReady ? 'Adatbázis' : 'Ideiglenes (szerver-beállítás)'} />
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            A rendszergazdai mód csak a fő rendszergazda számára használható. A lejárat
            után a rendszer automatikusan megszünteti a kiemelt hozzáférést.
          </div>
        </section>
      </div>

      {/* Ajánlott működési rend */}
      <section className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ShieldEllipsis className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base text-foreground sm:text-lg">Javasolt működési rend</h3>
            <p className="text-sm text-muted-foreground">
              A rendszergazdai módot csak tényleges rendszergazdai beavatkozáskor érdemes használni.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
      </section>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

function GuideCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}
