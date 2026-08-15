/**
 * InventoryItemDialog — új leltári tétel / szerkesztés (2026-08-15,
 * desktop-paritás 4. szelet — „Leltár: rögzítés + fisa").
 *
 * A webes leltár-dialógus (apps/web/components/inventory/inventory-main-v3.tsx)
 * desktop-párja. A mezőkészlet, a kategóriák, az amortizációs katalógus és a
 * kétnyelvű fişă-builder a KÖZÖS @kartoteka/ui-app rétegből jön; a mentés a
 * desktop írás-rétegén fut (lib/inventory-write.ts: verified-session őr +
 * kézi hatókör-szűkítés + szerver-visszaigazolás).
 *
 * ONLINE-ONLY (paritás-terv 4.4. kockázat): a leltári szám kiosztása miatt a
 * mentés élő kapcsolatot kíván — offline a dialógus HANGOS magyarázó kártyát
 * mutat, és a mentés le van tiltva. A fişă-nyomtatás offline is megy (lokális
 * művelet).
 *
 * Webes eltérések (SZÁNDÉKOS, jelezve): a „Kikeresés a könyvelésből"
 * kiadás-választó web-only Server Actionre épül (listExpensesForInventoryPicker)
 * — ide nem került át; szerkesztésnél a meglévő penzugy_xkey kapcsolat
 * VÁLTOZATLANUL megmarad (a közös payload-építő undefined-nél nem nyúl hozzá).
 *
 * Effect-szabály: nincs effect-beli szinkron setState — az űrlap állapota a
 * `key`-remount mintával inicializálódik (a szülő `key={editItem?.id ?? 'uj'}`
 * kulccsal szereli fel a belső űrlapot).
 */

import { useMemo, useState } from 'react'
import { AlertCircle, CloudOff, Printer } from 'lucide-react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kartoteka/ui'
import {
  INVENTORY_AMORTIZATION_CATALOG,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ROMANIAN_LABELS,
  buildInventoryItemCardHtml,
  calculateInventoryCurrentValue,
  getInventoryAmortizationCatalogEntry,
  normalizeInventoryCategory,
  type InventoryCategory,
  type InventoryItem,
  type InventoryItemCardData,
} from '@kartoteka/ui-app'

import { errorMessage } from '../lib/error'
import { saveInventoryItemDesktop } from '../lib/inventory-write'
import { printHtmlViaIframe } from '../lib/print-html'
import { useSessionOnline } from '../lib/use-session-online'
import type { InventoryItemLocalRow } from '../lib/sync'

export interface InventoryItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = a profil még nem oldódott fel — a mentés ilyenkor tiltott. */
  congregationId: string | null
  congregationName: string
  /** null = új tétel rögzítése. */
  editItem: InventoryItemLocalRow | null
  /** A fişă nyelve — a lista-oldali nyomtatással KÖZÖS állapot (webes minta). */
  fisaLang: 'hu' | 'ro'
  onFisaLangChange: (lang: 'hu' | 'ro') => void
  /** Sikeres mentés után hívjuk (üzenettel) — a szülő zár + full-pullt indít. */
  onSaved: (message: string) => void
}

export function InventoryItemDialog(props: InventoryItemDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {props.editItem ? 'Leltári tétel szerkesztése' : 'Új leltári tétel'}
          </DialogTitle>
        </DialogHeader>
        {/* key-remount: nyitáskor mindig az aktuális tétel (vagy üres űrlap)
            állapotával indul — effect-beli setState nélkül. */}
        {props.open && (
          <InventoryItemForm key={props.editItem?.id ?? 'uj-tetel'} {...props} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InventoryItemForm({
  onOpenChange,
  congregationId,
  congregationName,
  editItem,
  fisaLang,
  onFisaLangChange,
  onSaved,
}: InventoryItemDialogProps) {
  const online = useSessionOnline()

  // ── Űrlap-állapot — a webes dialógus mezőkészletének tükre ──────────────
  const [fMegnevezes, setFMegnevezes] = useState(editItem?.megnevezes ?? '')
  const [fKategoria, setFKategoria] = useState<InventoryCategory>(
    normalizeInventoryCategory(editItem?.kategoria) ?? 'alapeszkoz',
  )
  const [fErtek, setFErtek] = useState<number>(editItem?.beszerzes_erteke ?? 0)
  const [fDatum, setFDatum] = useState(editItem?.beszerzes_datuma?.split('T')[0] ?? '')
  const [fHelyszin, setFHelyszin] = useState(editItem?.helyszin ?? '')
  const [fFelelos, setFFelelos] = useState(editItem?.felelos_nev ?? '')
  const [fMegj, setFMegj] = useState(editItem?.megjegyzes ?? '')
  const [fMennyiseg, setFMennyiseg] = useState<number>(editItem?.mennyiseg ?? 1)
  const [fMertekegyseg, setFMertekegyseg] = useState(editItem?.mertekegyseg ?? 'db')
  const [fBizonylat, setFBizonylat] = useState(editItem?.beszerzes_bizonylat ?? '')
  const [fKatalogusKod, setFKatalogusKod] = useState(editItem?.katalogus_kod ?? '')
  const [fHasznalatiIdo, setFHasznalatiIdo] = useState<number | ''>(
    editItem?.hasznalati_ido ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCatalogEntry = useMemo(
    () => getInventoryAmortizationCatalogEntry(fKatalogusKod || null),
    [fKatalogusKod],
  )

  // ── Fişă-adat az űrlap pillanatnyi értékeiből (webes formCardData tükre) ──
  function buildCardData(): InventoryItemCardData {
    const catalogEntry = getInventoryAmortizationCatalogEntry(fKatalogusKod || null)
    // Szintetikus tétel az amortizáció-számításhoz (csak a használt mezőkkel).
    const syntheticItem = {
      kategoria_key: fKategoria,
      beszerzes_erteke: fErtek || 0,
      mennyiseg: fMennyiseg || 1,
      hasznalati_ido:
        fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
      beszerzes_datuma: fDatum || null,
    } as InventoryItem
    return {
      congregationName: congregationName || 'Gyülekezet',
      leltariSzam: editItem?.leltari_szam ?? null,
      regiLeltariSzam: editItem?.regi_leltari_szam ?? null,
      megnevezes: fMegnevezes,
      kategoriaLabel: INVENTORY_CATEGORY_LABELS[fKategoria],
      kategoriaLabelRo: INVENTORY_CATEGORY_ROMANIAN_LABELS[fKategoria],
      isAlapeszkoz: fKategoria === 'alapeszkoz',
      mennyiseg: fMennyiseg || 1,
      mertekegyseg: fMertekegyseg || 'db',
      beszerzesDatuma: fDatum || null,
      beszerzesBizonylat: fBizonylat || null,
      beszerzesErteke: fErtek > 0 ? fErtek : null,
      katalogusKod: fKategoria === 'alapeszkoz' ? fKatalogusKod || null : null,
      katalogusNev: fKategoria === 'alapeszkoz' ? catalogEntry?.nev ?? null : null,
      hasznalatiIdoEv:
        fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
      aktualisErtek: fErtek > 0 ? calculateInventoryCurrentValue(syntheticItem) : null,
      helyszin: fHelyszin || null,
      felelosNev: fFelelos || null,
      megjegyzes: fMegj || null,
      szerzo: editItem?.szerzo ?? null,
      konyvIsbn: editItem?.konyv_isbn ?? null,
    }
  }

  function handleFisaPrint() {
    void printHtmlViaIframe(buildInventoryItemCardHtml({ ...buildCardData(), lang: fisaLang }).html)
  }

  async function handleSave() {
    // Kliens-oldali gyorsellenőrzés — a webes toast-üzenetek tükre (a valódi
    // kapu a közös validateInventoryUpsertInput az írás-rétegben).
    if (!fMegnevezes.trim()) {
      setError('A megnevezés kötelező.')
      return
    }
    if (fErtek <= 0) {
      setError('Az érték pozitív szám kell legyen.')
      return
    }
    if (!congregationId) {
      setError('Nincs hozzárendelt gyülekezet ezen a gépen — a mentés nem futtatható.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await saveInventoryItemDesktop(congregationId, {
        id: editItem?.id,
        megnevezes: fMegnevezes.trim(),
        kategoria: fKategoria,
        beszerzes_erteke: fErtek,
        beszerzes_datuma: fDatum || null,
        helyszin: fHelyszin || null,
        felelos_nev: fFelelos || null,
        megjegyzes: fMegj || null,
        mennyiseg: fMennyiseg,
        mertekegyseg: fMertekegyseg || 'db',
        beszerzes_bizonylat: fBizonylat || null,
        katalogus_kod: fKategoria === 'alapeszkoz' ? fKatalogusKod || null : null,
        hasznalati_ido:
          fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
        // penzugy_xkey SZÁNDÉKOSAN nincs a payloadban (undefined): a webes
        // kiadás-választóval felvett kapcsolat szerkesztéskor megmarad.
      })
      onSaved(
        editItem
          ? 'A leltári tétel frissült a szerveren.'
          : `A leltári tétel rögzítve lett (${result.leltariSzam ?? 'új szám'}).`,
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'mt-1'
  const selectCls =
    'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

  return (
    <div className="space-y-4">
      {/* Online-only magyarázó kártya (a Kuka-oldal offline-mintája) */}
      {!online && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-800">
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <span>
            A leltári tétel mentéséhez internetkapcsolat és online belépés szükséges —
            a leltári számot a szerver osztja ki, ezért a rögzítés nem kerül offline
            várakozó sorba. A fişă nyomtatása offline is működik.
          </span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Megnevezés *</Label>
          <Input value={fMegnevezes} onChange={e => setFMegnevezes(e.target.value)} className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <Label>Kategória *</Label>
          <select
            value={fKategoria}
            onChange={e => {
              const nextCategory = e.target.value as InventoryCategory
              setFKategoria(nextCategory)
              if (nextCategory !== 'alapeszkoz') {
                setFKatalogusKod('')
                setFHasznalatiIdo('')
              }
            }}
            className={selectCls}
          >
            {INVENTORY_CATEGORIES.map(category => (
              <option key={category} value={category}>
                {INVENTORY_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Beszerzési érték (RON) *</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={fErtek || ''}
            onChange={e => setFErtek(Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Mennyiség</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={fMennyiseg || 1}
            onChange={e => setFMennyiseg(Number(e.target.value) || 1)}
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Mértékegység</Label>
          <Input value={fMertekegyseg} onChange={e => setFMertekegyseg(e.target.value)} placeholder="db" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <Label>Beszerzési dátum</Label>
          <Input type="date" value={fDatum} onChange={e => setFDatum(e.target.value)} className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <Label>Beszerzési irat száma</Label>
          <Input
            value={fBizonylat}
            onChange={e => setFBizonylat(e.target.value)}
            placeholder="Számla / jegyzőkönyv / határozat"
            className={inputCls}
          />
          {/* A webes „Kikeresés a könyvelésből" web-only Server Actionre épül —
              desktopon szándékosan nincs (lásd a fájl fejlécét). */}
        </div>

        {fKategoria === 'alapeszkoz' ? (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Amortizációs katalóguskód</Label>
              <select
                value={fKatalogusKod}
                onChange={e => {
                  const nextCode = e.target.value
                  setFKatalogusKod(nextCode)
                  const entry = getInventoryAmortizationCatalogEntry(nextCode)
                  if (entry) setFHasznalatiIdo(entry.defEv)
                }}
                className={selectCls}
              >
                <option value="">Kézi beállítás / nincs kiválasztva</option>
                {INVENTORY_AMORTIZATION_CATALOG.map(entry => (
                  <option key={entry.kod} value={entry.kod}>
                    {entry.kod} - {entry.nev} ({entry.minEv}-{entry.maxEv} év)
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Az alapeszközöknél a rendszer a hivatalos katalóguskód és a
                használati idő alapján számolja az amortizációt.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Használati idő (év)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={fHasznalatiIdo}
                onChange={e => setFHasznalatiIdo(e.target.value ? Number(e.target.value) : '')}
                placeholder="pl. 5"
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Amortizációs összefoglaló</Label>
              <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-slate-700">
                {selectedCatalogEntry ? (
                  <>
                    <div className="font-semibold text-slate-900">{selectedCatalogEntry.nev}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Javasolt tartomány: {selectedCatalogEntry.minEv}-{selectedCatalogEntry.maxEv} év · Alapértelmezett: {selectedCatalogEntry.defEv} év
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-500">
                    Ha nincs katalóguskód kiválasztva, a rendszer a kézzel megadott
                    használati idővel számol.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        <div className="space-y-1.5">
          <Label>Helyszín</Label>
          <Input value={fHelyszin} onChange={e => setFHelyszin(e.target.value)} className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <Label>Felelős személy</Label>
          <Input value={fFelelos} onChange={e => setFFelelos(e.target.value)} className={inputCls} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Megjegyzés</Label>
          <Input value={fMegj} onChange={e => setFMegj(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {/* Kétnyelvű fişă: HU = magyar elsődleges, RO = hivatalos román forma */}
        <div className="mr-auto flex items-center gap-2">
          <div
            className="inline-flex overflow-hidden rounded-lg border border-input"
            role="group"
            aria-label="A fişă nyelve"
          >
            {(['hu', 'ro'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => onFisaLangChange(l)}
                className={`min-h-9 px-2.5 text-xs font-semibold uppercase transition ${
                  fisaLang === l
                    ? 'bg-emerald-600 text-white'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
                title={
                  l === 'hu'
                    ? 'Magyar elsődleges, román alcímkék'
                    : 'Román elsődleges (hivatalos forma), magyar alcímkék'
                }
              >
                {l}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleFisaPrint}>
            <Printer className="mr-1.5 size-3.5" /> Fişă nyomtatása
          </Button>
        </div>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          Mégse
        </Button>
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !online || !congregationId}
          title={!online ? 'A mentéshez internetkapcsolat és online belépés kell.' : undefined}
        >
          {saving ? 'Mentés…' : 'Mentés'}
        </Button>
      </div>
    </div>
  )
}
