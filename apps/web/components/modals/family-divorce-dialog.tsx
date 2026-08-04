'use client'

import { useEffect, useRef, useState } from 'react'
import { HeartCrack, Info, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDivorceImpact, recordDivorce } from '@/app/(dashboard)/tagnyilvantartas/family-actions'

/**
 * 2026-08-04 (PR-44) — VÁLÁS / kapcsolat felbontása.
 *
 * Miért külön dialógus és nem a család-szerkesztő: a szerkesztőben a felnőtt
 * „kivétele" adatjavításnak számít, ezért a rendszer lezárja a kikerült felnőtt
 * és a megmaradt gyermekek rokoni kapcsolatát is. Válásnál pontosan ez NEM
 * történhet meg — a gyermekek vér szerinti szülő-kapcsolata megmarad.
 *
 * A dialógus a mentés ELŐTT két dolgot mond ki: (a) pontosan mi történik,
 * (b) mi a pénzügyi hatás, számokkal. Ha a pénzügyi összesítés nem olvasható,
 * a mentés le van tiltva (fail-closed) — vaktában nem engedünk dönteni.
 */

const FIELD_CLASS = 'h-11 rounded-xl border-border bg-background/70'

interface FamilyDivorceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  family: {
    id: number
    ferfi: { id: number; name: string }
    no: { id: number; name: string }
    childrenCount: number
  } | null
  /** Sikeres rögzítés után hívódik (a hívó újratölti a kartont / a listát). */
  onDone?: () => void
}

type Impact = Awaited<ReturnType<typeof getDivorceImpact>>

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function FamilyDivorceDialog({ open, onOpenChange, family, onDone }: FamilyDivorceDialogProps) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState<string | null>(null)

  const [datum, setDatum] = useState('')
  const [marad, setMarad] = useState<'ferfi' | 'no' | ''>('')
  const [ujKarton, setUjKarton] = useState(false)
  const [ujKartonSzam, setUjKartonSzam] = useState('')
  const [elvaltJelzo, setElvaltJelzo] = useState(true)
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)

  /** Dupla mentés elleni őr — a `saving` state két gyors kattintás közt még nem ér át. */
  const submitInFlightRef = useRef(false)

  const familyId = family?.id ?? null

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setImpact(null)
      setImpactError(null)
      setImpactLoading(true)
      // Alapértékek: ha van gyermek, alapból az édesanya marad a kartonon —
      // de szabadon módosítható.
      setDatum('')
      setMarad(family && family.childrenCount > 0 ? 'no' : '')
      setUjKarton(false)
      setUjKartonSzam('')
      setElvaltJelzo(true)
      setMegjegyzes('')
      getDivorceImpact(familyId)
        .then((value) => {
          if (cancelled) return
          setImpact(value)
          if (value.error) setImpactError(value.error)
          setImpactLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setImpactError('A karton adatainak betöltése nem sikerült — zárd be az ablakot, és próbáld újra.')
          setImpactLoading(false)
        })
    })
    return () => { cancelled = true }
    // A `family` objektum minden rendereléskor új referencia lehet — az id-ra kötünk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, familyId])

  if (!family) return null

  const elettars = impact?.partnership === 'elettars'
  const cimSzoveg = (() => {
    if (!marad) return null
    const tavozoId = marad === 'ferfi' ? family.no.id : family.ferfi.id
    const cim = impact?.cimek?.[tavozoId]
    if (!cim) return null
    return [cim.utca, cim.c_szam].filter(Boolean).join(' ') || null
  })()

  const tavozoNev = marad === 'ferfi' ? family.no.name : marad === 'no' ? family.ferfi.name : '—'
  const maradoNev = marad === 'ferfi' ? family.ferfi.name : marad === 'no' ? family.no.name : '—'

  const mentheto = !!datum && !!marad && !impactError && !impactLoading && !saving

  async function handleSubmit() {
    if (submitInFlightRef.current) return
    if (!family || !datum || !marad) return
    submitInFlightRef.current = true
    setSaving(true)
    try {
      const tavozoId = marad === 'ferfi' ? family.no.id : family.ferfi.id
      const cim = impact?.cimek?.[tavozoId]
      const result = await recordDivorce({
        familyId: family.id,
        datum,
        marad,
        ujKartonATavozonak: ujKarton,
        ujKarton: ujKarton
          ? { c_utcaid: cim?.c_utcaid ?? null, c_szam: ujKartonSzam.trim() || cim?.c_szam || '' }
          : undefined,
        elvaltJelzo: elvaltJelzo && !elettars,
        megjegyzes: megjegyzes.trim() || undefined,
      })
      if (result.error) {
        toast.error(result.error, { duration: 12000 })
        return
      }
      toast.success(result.message || 'A válás rögzítve.', { duration: 10000 })
      if (result.warning) toast.warning(result.warning, { duration: 14000 })
      onDone?.()
      onOpenChange(false)
    } catch (error) {
      console.error('[FamilyDivorceDialog] a válás rögzítése sikertelen:', error)
      toast.error('A válás rögzítése nem sikerült. Próbáld újra.')
    } finally {
      submitInFlightRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] border-border bg-card p-0 sm:w-[calc(100vw-2rem)] sm:max-w-lg [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-11">
        <DialogHeader className="sticky top-0 z-20 border-b border-border/70 bg-gradient-to-br from-amber-50 via-card to-card px-5 py-4 pr-14 backdrop-blur dark:from-amber-950/40">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg text-foreground sm:text-xl">
            <HeartCrack className="size-5 shrink-0 text-amber-700 dark:text-amber-400" />
            {elettars ? 'Élettársi kapcsolat felbontása' : 'Válás rögzítése'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 text-muted-foreground">
            {family.ferfi.name} és {family.no.name} · #{family.id} karton
          </DialogDescription>
        </DialogHeader>

        {impactLoading ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            A karton adatainak ellenőrzése…
          </div>
        ) : impactError ? (
          <div className="m-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm leading-6 text-destructive">
            <p className="font-semibold">A válás most nem rögzíthető</p>
            <p className="mt-1">{impactError}</p>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {/* 1. A válás dátuma */}
            <div className="space-y-1.5">
              <Label htmlFor="divorce-date" className="font-semibold text-foreground">
                {elettars ? 'A kapcsolat megszűnésének dátuma *' : 'A válás (jogerő) dátuma *'}
              </Label>
              <Input
                id="divorce-date"
                type="date"
                value={datum}
                max={todayIso()}
                min={impact?.parKezdet ?? undefined}
                onChange={(e) => setDatum(e.target.value)}
                className={FIELD_CLASS}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Ezzel a nappal zárul le a kapcsolat és a közös háztartás — nem a mai nappal.
                {impact?.parKezdet ? ` A kapcsolat kezdete: ${impact.parKezdet}.` : ''}
              </p>
            </div>

            {/* 2. Ki marad a kartonon */}
            <div className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
              <Label className="font-semibold text-foreground">
                Ki marad a jelenlegi kartonon{family.childrenCount > 0 ? ' a gyermekekkel' : ''}? *
              </Label>
              <div className="flex flex-col gap-2">
                {([
                  { value: 'ferfi' as const, name: family.ferfi.name },
                  { value: 'no' as const, name: family.no.name },
                ]).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                      marad === opt.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name="divorce-marad"
                      className="size-4"
                      checked={marad === opt.value}
                      onChange={() => setMarad(opt.value)}
                    />
                    <span className="font-medium">{opt.name}</span>
                    {family.childrenCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({family.childrenCount} gyermekkel)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* 3. Új karton a távozónak */}
            <div className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
              <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={ujKarton}
                  onChange={(e) => setUjKarton(e.target.checked)}
                />
                <span className="font-medium text-foreground">
                  {marad ? tavozoNev : 'A távozó fél'} kapjon saját családi kartont
                </span>
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                Enélkül {marad ? tavozoNev : 'a távozó fél'} a kartonok közül kikerül, de tagja marad a
                gyülekezetnek — a személyi kartonja és minden befizetése érintetlen.
              </p>
              {ujKarton && (
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="divorce-street" className="text-xs font-medium text-muted-foreground">Utca</Label>
                    <Input
                      id="divorce-street"
                      readOnly
                      value={cimSzoveg ?? ''}
                      placeholder="A távozó fél lakcíméből"
                      className={`${FIELD_CLASS} bg-muted/45 text-muted-foreground`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="divorce-house" className="text-xs font-medium text-muted-foreground">Házszám</Label>
                    <Input
                      id="divorce-house"
                      value={ujKartonSzam}
                      onChange={(e) => setUjKartonSzam(e.target.value)}
                      placeholder="Pl. 12/A"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. „elvált" jelző — csak házasságnál */}
            {!elettars && (
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-2xl border border-border/60 bg-background/50 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={elvaltJelzo}
                  onChange={(e) => setElvaltJelzo(e.target.checked)}
                />
                <span>
                  <span className="font-medium text-foreground">Mindkét fél kapja meg az „elvált” jelzőt</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Ettől a nevük előtt az „elv.” előtag jelenik meg a listákon és a kartonokon.
                  </span>
                </span>
              </label>
            )}

            {/* 5. Megjegyzés */}
            <div className="space-y-1.5">
              <Label htmlFor="divorce-note" className="font-semibold text-foreground">Megjegyzés</Label>
              <Input
                id="divorce-note"
                value={megjegyzes}
                maxLength={500}
                onChange={(e) => setMegjegyzes(e.target.value)}
                placeholder="Pl. bírósági határozat száma"
                className={FIELD_CLASS}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Csak a naplóba kerül — a kartonon nem jelenik meg.
              </p>
            </div>

            {/* (a) Mi történik pontosan */}
            <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-3 text-xs leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="size-4 shrink-0" />
                Mi történik pontosan
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>
                  A két fél {elettars ? 'élettársi' : 'házastársi'} kapcsolata a családfán <strong>lezárul</strong> a
                  megadott dátummal (a fán ezután „elvált” jelöléssel látszik).
                </li>
                <li>
                  <strong>A gyermekek szülő–gyermek kapcsolata mindkét szülővel megmarad</strong> — a családfáról
                  senki nem tűnik el.
                </li>
                <li>
                  {marad ? tavozoNev : 'A távozó fél'} lekerül a #{family.id} kartonról, így{' '}
                  <strong>újraházasodhat</strong>.
                </li>
                <li>
                  {marad ? maradoNev : 'A maradó fél'}{family.childrenCount > 0 ? ' a gyermekekkel' : ''} a #{family.id}{' '}
                  kartonon marad, és <strong>új házastársat vehet fel ugyanerre a kartonra</strong>.
                </li>
                <li>A karton nem törlődik és nem zárul le.</li>
              </ul>
            </div>

            {/* (b) Pénzügyi hatás — számokkal */}
            <div className="rounded-2xl border border-border bg-muted/40 p-3 text-xs leading-6 text-foreground">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Info className="size-4 shrink-0 text-primary" />
                Pénzügyi hatás
              </p>
              {impact?.penzugy && impact.penzugy.db > 0 ? (
                <p className="mt-1.5">
                  A kartonhoz <strong>{impact.penzugy.db} tétel</strong> ({impact.penzugy.osszeg.toFixed(0)} RON
                  {impact.penzugy.evek.length > 0 ? `, érintett évek: ${impact.penzugy.evek.join(', ')}` : ''}) van
                  családi befizetésként könyvelve. A válás után ezek a <strong>maradó</strong> fél és a gyermekek
                  járulék-jóváírásában számítanak; {marad ? tavozoNev : 'a távozó fél'} ezekre az évekre a saját
                  hátralék-kimutatásában már nem kap jóváírást.{' '}
                  <strong>A befizetések adatai nem változnak, egyetlen tétel sem íródik át és nem törlődik.</strong>
                  {impact.penzugy.csonkolt ? ' (Nagyon sok tétel — az összesítés csak a legelső húszezret nézte át.)' : ''}
                </p>
              ) : (
                <p className="mt-1.5">
                  A kartonhoz nincs tisztán családi befizetés könyvelve, ezért a válásnak nincs járulék-átrendező
                  hatása. <strong>Egyetlen befizetés sem íródik át és nem törlődik.</strong>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-20 flex gap-2 border-t border-border/70 bg-card/95 px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:justify-end sm:px-5">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl sm:flex-none sm:px-6"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Mégse
          </Button>
          <Button
            className="h-11 flex-1 rounded-xl bg-amber-600 text-white hover:bg-amber-700 sm:flex-none sm:px-6"
            disabled={!mentheto}
            onClick={() => void handleSubmit()}
          >
            {saving ? 'Rögzítés…' : elettars ? 'Kapcsolat felbontása' : 'Válás rögzítése'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
