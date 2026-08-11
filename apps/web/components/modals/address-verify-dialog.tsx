'use client'

/**
 * CÍM-EGYEZTETÉS A TÉRKÉPPEL (2026-08-11).
 * ─────────────────────────────────────────────────────────────────────────────
 * A tulajdonos kérése szó szerint: „A személyi karton útvonal funkciójánál nem
 * tökéletes, mert nem találja! Legyen valamilyen egyeztetés és lekérés, hogy
 * biztosan jól működjön!"
 *
 * EZ AZ „EGYEZTETÉS ÉS LEKÉRÉS" — és tudatosan KULCS NÉLKÜLI:
 *   · a LEKÉRÉS a saját, hivatalos címtörzsünkből (`name_ro`, megye,
 *     irányítószám) történik, plusz maga a Google Térkép, amit a lelkész
 *     megnyit. Az egyeztetés tehát PONTOSAN abban az eszközben zajlik, amelyik
 *     utána navigálni fog — ennél erősebb garancia nincs.
 *   · az EGYEZTETÉS eredménye (koordináta és/vagy a hivatalos román név)
 *     ELTÁROLÓDIK a TELEPÜLÉS vagy az UTCA sorára, nem a személyre. Egy
 *     „Barátos → Brateș" egyeztetés így EGYSZERRE javít mindenkit, aki ott lakik.
 *   · lekérdezéskor a koordinátához SEMMILYEN külső szolgáltatás nem kell —
 *     működik gyenge térerőn is, és soha nem jár le.
 *
 * MEGSZÓLÍTÁS: a karton látható szövege MAGÁZ, a toastok TEGEZNEK — ez az ablak
 * a karton része, ezért a törzsszöveg magáz.
 */

import { useEffect, useMemo, useState } from 'react'
import { Compass, ExternalLink, MapPin, Route, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildMapSearchUrl } from '@/lib/public-site/map-link'
import { saveAddressGeo } from '@/lib/members/address-geo-actions'
import {
  buildDirectionsTarget,
  buildLookupQuery,
  formatGeoPoint,
  localityGeoPoint,
  parseGeoInput,
  resolveLocalityName,
  resolveStreetName,
  streetGeoPoint,
  type AddressGeoScope,
  type MemberDirectionsAddress,
} from '@/lib/members/directions'

interface AddressVerifyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A tag lakcíme a címtörzsből (a karton `details.cim` mezője). */
  address: MemberDirectionsAddress | null
  /** Csak a fejléc-mondathoz — a mentés a címtörzsre megy, nem a személyre. */
  memberName: string
  /** Sikeres mentés után: a karton töltse újra a részleteket. */
  onSaved: () => void
}

export function AddressVerifyDialog({ open, onOpenChange, address, memberName, onSaved }: AddressVerifyDialogProps) {
  const [scope, setScope] = useState<AddressGeoScope>('locality')
  const [pasted, setPasted] = useState('')
  const [nameRoDraft, setNameRoDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const localityId = address?.locality?.id ?? null
  const streetId = address?.street?.id ?? null
  const streetName = resolveStreetName(address?.street)
  const localityName = resolveLocalityName(address?.locality)

  // Alapértelmezés: az UTCA a pontosabb szint — de csak ha van utca-sor.
  // Nyitáskor mindent nullázunk, hogy egy másik tag kartonjáról ne maradjon
  // itt beillesztett koordináta (rossz címre menne el).
  useEffect(() => {
    if (!open) return
    setPasted('')
    setSaving(false)
    setScope(streetId ? 'street' : 'locality')
  }, [open, streetId, localityId])

  const activeId = scope === 'street' ? streetId : localityId
  const existingNameRo = (scope === 'street' ? address?.street?.name_ro : address?.locality?.name_ro) || ''
  const registryName =
    (scope === 'street' ? address?.street?.name ?? address?.street?.name_hu : address?.locality?.name ?? address?.locality?.name_hu) || ''
  const existingPoint = scope === 'street' ? streetGeoPoint(address?.street) : localityGeoPoint(address?.locality)

  // A név-mező a szint váltásakor újratöltődik a meglévő hivatalos névvel.
  useEffect(() => {
    setNameRoDraft(existingNameRo)
  }, [scope, open, existingNameRo])

  const target = useMemo(() => buildDirectionsTarget(address), [address])
  const lookupUrl = useMemo(() => {
    const query = address ? buildLookupQuery(address) : null
    return buildMapSearchUrl(query)
  }, [address])

  const parsed = useMemo(() => parseGeoInput(pasted), [pasted])
  const nameChanged = nameRoDraft.trim().length > 0 && nameRoDraft.trim() !== existingNameRo.trim()
  const canSave = Boolean(activeId) && !saving && (Boolean(parsed.point) || nameChanged)

  if (!address) return null

  async function handleSave() {
    if (!activeId) return
    setSaving(true)
    try {
      const res = await saveAddressGeo({
        scope,
        id: activeId,
        lat: parsed.point?.lat ?? null,
        lng: parsed.point?.lng ?? null,
        nameRo: nameChanged ? nameRoDraft.trim() : null,
      })
      if (res.error) {
        toast.error(res.error, { duration: 10000 })
        return
      }
      toast.success(
        scope === 'street'
          ? 'Az utca egyeztetve — mostantól mindenkinek jó lesz az útvonal, aki itt lakik.'
          : 'A település egyeztetve — mostantól mindenkinek jó lesz az útvonal, aki itt lakik.',
      )
      if (res.warning) toast.warning(res.warning, { duration: 10000 })
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error('A mentés nem sikerült. Ellenőrizd a kapcsolatot, és próbáld újra.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Compass className="size-5 text-primary" />
            Cím egyeztetése a térképpel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* MIÉRT — egy mondat, magázva, a lelkész nyelvén. */}
          <p className="text-sm leading-6 text-muted-foreground">
            A nyilvántartás magyarul tárolja a helységet és az utcát, a térkép viszont a hivatalos
            román nevet keresi (Barátos = <strong className="text-foreground">Brateș</strong>, Főút =
            <strong className="text-foreground"> Strada Principală</strong>). Ha az útvonal mégsem
            találja meg {memberName ? `${memberName} címét` : 'a címet'}, itt egyszer megerősítheti a
            helyet — utána már soha nem téved el.
          </p>

          {/* 1. LÉPÉS — mit küldünk most a térképnek */}
          <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1. Amit most a térkép kap
            </p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">
              {target?.destination ?? 'Nincs elég adat a cím összeállításához.'}
            </p>
            {target?.warnings.map((warning) => (
              <p key={warning} className="mt-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
                {warning}
              </p>
            ))}
            {lookupUrl && (
              <a
                href={lookupUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="A cím megnyitása a Google Térképen új lapon"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <ExternalLink className="size-4" aria-hidden />
                Megnyitom a térképen
              </a>
            )}
          </div>

          {/* 2. LÉPÉS — melyik szintre mentünk */}
          <div className="space-y-2">
            <Label className="font-semibold text-foreground">2. Mit egyeztet?</Label>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <button
                type="button"
                disabled={!streetId}
                onClick={() => setScope('street')}
                aria-label="Az utca egyeztetése"
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none ${
                  scope === 'street' && streetId ? 'border-primary bg-primary/10' : 'border-border/60 bg-background/60'
                }`}
              >
                <Route className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">Ezt az utcát</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {streetId ? streetName?.text ?? 'utca' : 'nincs utca rögzítve'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={!localityId}
                onClick={() => setScope('locality')}
                aria-label="A település egyeztetése"
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none ${
                  scope === 'locality' && localityId ? 'border-primary bg-primary/10' : 'border-border/60 bg-background/60'
                }`}
              >
                <MapPin className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">Ezt a települést</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {localityId ? localityName?.text ?? 'település' : 'nincs település rögzítve'}
                  </span>
                </span>
              </button>
            </div>
            {!activeId && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Ehhez a taghoz nincs címtörzsből választott település vagy utca, ezért az egyeztetés
                  nem menthető. Nyissa meg a tag szerkesztőjét, és válassza ki a települést a listából.
                </span>
              </p>
            )}
            {existingPoint && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Már van egyeztetett pont ezen a szinten ({formatGeoPoint(existingPoint)}). Új pont
                mentése felülírja.
              </p>
            )}
          </div>

          {/* 3. LÉPÉS — a pont beillesztése */}
          <div className="space-y-2">
            <Label htmlFor="address-verify-point" className="font-semibold text-foreground">
              3. A pontos hely a térképről
            </Label>
            <p className="text-xs leading-5 text-muted-foreground">
              A megnyitott térképen keresse meg a házat, <strong>nyomja hosszan</strong> a pontot, és a
              megjelenő számpárt (például <code className="rounded bg-muted px-1">46.123456, 26.123456</code>)
              másolja ide. Számítógépen: jobb gomb a házon → az első sorban álló koordináta.
            </p>
            <Input
              id="address-verify-point"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder="46.123456, 26.123456 — vagy a teljes térkép-link"
              inputMode="text"
              autoComplete="off"
              className="h-11 rounded-xl"
              aria-describedby="address-verify-point-hint"
            />
            <p id="address-verify-point-hint" className="text-xs leading-5">
              {parsed.error ? (
                <span className="text-rose-700 dark:text-rose-300">{parsed.error}</span>
              ) : parsed.point ? (
                <span className="text-emerald-700 dark:text-emerald-300">
                  Felismert pont: {formatGeoPoint(parsed.point)}
                  {parsed.warning ? ` — ${parsed.warning}` : ''}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Elhagyható, ha csak a hivatalos nevet pótolja — de a koordináta az, ami soha nem hibázik.
                </span>
              )}
            </p>
          </div>

          {/* 4. LÉPÉS — a hivatalos román név pótlása */}
          <div className="space-y-2">
            <Label htmlFor="address-verify-name" className="font-semibold text-foreground">
              4. Hivatalos román név {existingNameRo ? '(már rögzítve)' : '(ha hiányzik)'}
            </Label>
            <Input
              id="address-verify-name"
              value={nameRoDraft}
              onChange={(event) => setNameRoDraft(event.target.value)}
              placeholder={scope === 'street' ? 'Például: Principală' : 'Például: Brateș'}
              autoComplete="off"
              maxLength={120}
              className="h-11 rounded-xl"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              A nyilvántartásban a magyar név ({registryName || '—'}) marad — ez csak a térkép és a
              hivatalos iratok számára tárolt párja. Meglévő hivatalos nevet nem írunk felül.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3 min-[420px]:flex-row">
            <Button className="min-h-11 flex-1 rounded-xl" disabled={!canSave} onClick={() => void handleSave()}>
              {saving ? 'Mentés…' : 'Egyeztetés mentése'}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-xl"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Mégse
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
