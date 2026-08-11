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
  isLocalityMapResolvable,
  isPlaceholderLocality,
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
  /** Feloldja-e a térkép magát a TELEPÜLÉST? (Boolean — stabil effect-függőség.) */
  const localityResolvable = isLocalityMapResolvable(address?.locality)
  /**
   * ⛔ 2026-08-11 — A HELYKITÖLTŐ („?") SORT EGYEZTETNI TILOS.
   *
   * Élesben 70 ÉLŐ TAG címe mutat egy „?" nevű `adrlocality` sorra. Az
   * egyeztetés EGYETLEN koordinátát ír a település sorára — a „?"-en elvégezve
   * 70 különböző valódi lakcím kerülne egyetlen hamis pontra, és onnantól az
   * `isLocalityMapResolvable` igazat mondana: a probléma VÉGLEG elnémulna.
   *
   * A régi kód ezt nem csak megengedte, hanem AJÁNLOTTA is: az alapértelmezett
   * szint a `locality` lett (mert a „?" sor tényleg nem feloldható), a
   * magyarázó doboz pedig azt ígérte, hogy „egyszerre rendbe jön mindenki
   * útvonala, aki a faluban lakik, és a Hibák füléről is eltűnik a jelzés".
   * A „?" soron MINDKÉT állítás hamis: nincs falu, és a Hibák fül tétele
   * NÉV-alapú (`isPlaceholderLocality`), tehát a pont mentése után is nyitva
   * marad. Ezért a település-ág itt ilyenkor TILTOTT — az utca viszont marad,
   * mert az ennek az egy tagnak valóban a házig visz.
   */
  const localityPlaceholder = isPlaceholderLocality(address?.locality)
  const localityUsable = Boolean(localityId) && !localityPlaceholder

  // ⚠️ 2026-08-11 — AZ ALAPÉRTELMEZETT SZINT A TÉNYLEGES HIÁNYBÓL KÖVETKEZIK,
  //    NEM AZ UTCA PUSZTA LÉTÉBŐL.
  //    A régi `streetId ? 'street' : 'locality'` azt jelentette, hogy MINDEN
  //    utcával rendelkező tagnál az utca-fül nyílt meg. Ha viszont a hiányzó
  //    láncszem maga a TELEPÜLÉS (a Hibák fül jelzése is arról szól), akkor a
  //    lelkész a nyitóállapotban mentve az UTCÁRA írta a pontot: a saját
  //    útvonala rendbe jött, a hibalista tétele viszont VÁLTOZATLANUL nyitva
  //    maradt, és a többi ott lakó tag sem javult — miközben a toast azt
  //    állította, hogy „mostantól mindenkinek jó lesz az útvonal". Elvégezte,
  //    amit kértünk, sikerjelzést kapott, és a lista mégis pirosan tartotta.
  //    Nyitáskor mindent nullázunk, hogy egy másik tag kartonjáról ne maradjon
  //    itt beillesztett koordináta (rossz címre menne el).
  //    ⛔ A HELYKITÖLTŐ SOR KIVÉTEL: ott a település-ág tiltott (lásd
  //    `localityPlaceholder`), tehát az alapértelmezés az utca — vagy ha utca
  //    sincs, a tiltott település-ág, ahol a doboz kimondja a valódi teendőt.
  useEffect(() => {
    if (!open) return
    setPasted('')
    setSaving(false)
    if (localityPlaceholder) setScope(streetId ? 'street' : 'locality')
    else if (localityId && !localityResolvable) setScope('locality')
    else setScope(streetId ? 'street' : 'locality')
  }, [open, streetId, localityId, localityResolvable, localityPlaceholder])

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
  /** A helykitöltő településre SEMMIT nem mentünk (lásd `localityPlaceholder`). */
  const scopeTiltott = scope === 'locality' && localityPlaceholder
  const canSave = Boolean(activeId) && !saving && !scopeTiltott && (Boolean(parsed.point) || nameChanged)

  if (!address) return null

  async function handleSave() {
    if (!activeId) return
    // MÁSODIK VÉDŐVONAL a tiltott gomb mellé: a mentés maga is visszautasítja.
    if (scope === 'locality' && localityPlaceholder) {
      toast.info(
        'Ehhez a címhez nincs valódi település rögzítve („?"), ezért erre a sorra nem menthetünk pontot — 70 különböző lakcím kerülne egyetlen helyre. Előbb az Elérhetőségeknél válaszd ki a tényleges települést.',
        { duration: 12000 },
      )
      return
    }
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
          ? 'Az utca egyeztetve — mostantól mindenkinek jó lesz az útvonal, aki ebben az utcában lakik.'
          : 'A település egyeztetve — mostantól mindenkinek jó lesz az útvonal, aki itt lakik.',
      )
      // ⚠️ Az utca egyeztetése NEM szünteti meg a település-szintű jelzést. Ha
      //    hallgatnánk róla, a lelkész elvégzett munka után is pirosan találná a
      //    Hibák fülön ugyanazt a tételt — és nem tudná, miért.
      if (scope === 'street' && !localityResolvable) {
        toast.warning(
          // ⚠️ A helykitöltő soron NEM az egyeztetésre küldünk vissza (az ott
          //    tiltott), hanem a valódi teendőre — különben egy elvégezhetetlen
          //    utasítást adnánk, és a lelkész körbe-körbe járna.
          localityPlaceholder
            ? 'A tag települése viszont továbbra is hiányzik (a címtörzsben csak egy „?" helykitöltő áll), ezért a Hibák fülön a jelzés megmarad. Nyisd meg a tag szerkesztőjét, és válaszd ki a tényleges települést — a térképpel ezt nem lehet pótolni.'
            : 'A települést viszont a térkép továbbra sem ismeri fel, ezért a Hibák fülön a jelzés megmarad, és a többi ott lakó tag útvonala sem javult. Nyisd meg újra ezt az ablakot, válaszd az „Ezt a települést" lehetőséget, és erősítsd meg a falut is — az egyszerre rendezi mindenkit.',
          { duration: 14000 },
        )
      }
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
                disabled={!localityUsable}
                onClick={() => setScope('locality')}
                aria-label={
                  localityPlaceholder
                    ? 'A település egyeztetése — nem elérhető, mert nincs valódi település rögzítve'
                    : 'A település egyeztetése'
                }
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none ${
                  scope === 'locality' && localityUsable ? 'border-primary bg-primary/10' : 'border-border/60 bg-background/60'
                }`}
              >
                <MapPin className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">Ezt a települést</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {localityPlaceholder
                      ? 'nincs valódi település'
                      : localityId
                        ? localityName?.text ?? 'település'
                        : 'nincs település rögzítve'}
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
            {/* ⛔ 2026-08-11 — A HELYKITÖLTŐ SOR SAJÁT, IGAZABB MONDATA.
                Ez a doboz korábban FELTÉTEL NÉLKÜL a település egyeztetésére
                bíztatott, a „?" soron is — két olyan ígérettel, amelyik ott
                mindkettő hamis („mindenki, aki a faluban lakik", „eltűnik a
                jelzés"). Élesben 70 élő tag. */}
            {localityId && localityPlaceholder && (
              <p className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Ehhez a címhez <strong>nincs valódi település rögzítve</strong> — a címtörzsben csak egy
                helykitöltő („{localityName?.text ?? '?'}") áll. Ezt a sort nem lehet a térképpel
                egyeztetni: egyetlen pont több tucat különböző lakcímre kerülne rá. Zárja be ezt az
                ablakot, nyissa meg a tag szerkesztőjét az Elérhetőségeknél, és válassza ki a tényleges
                települést.
                {streetId ? ' Az utca ettől függetlenül most is egyeztethető — az ennek az egy tagnak a házáig visz.' : ''}
              </p>
            )}
            {/* ⚑ 2026-08-11 — MIÉRT A TELEPÜLÉS AZ ALAPÉRTELMEZÉS.
                Ha a térkép magát a falut sem ismeri fel, akkor AZ a hiányzó
                láncszem: az utca egyeztetése csak ezt az egy tagot rendezné, a
                Hibák fül tétele pedig nyitva maradna. */}
            {localityId && !localityPlaceholder && !localityResolvable && (
              <p className="rounded-xl border border-border/60 bg-primary/5 p-3 text-xs leading-5 text-foreground">
                A térkép ezt a <strong>települést</strong> nem ismeri fel (nincs hivatalos román neve,
                és még nincs megerősített pontja) — ezért itt a település a hiányzó láncszem. Ha ezt
                egyezteti, egyszerre rendbe jön mindenki útvonala, aki a faluban lakik, és a
                tagnyilvántartás Hibák füléről is eltűnik a jelzés. Az utca ezután külön pontosítható.
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
              /* A helykitöltő sorra semmit nem mentünk — a mező se csábítson rá. */
              disabled={scopeTiltott}
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
              disabled={scopeTiltott}
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
