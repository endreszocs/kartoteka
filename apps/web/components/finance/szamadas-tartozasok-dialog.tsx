'use client'

/**
 * Tartozások és kintlévőségek (év végi) — a hivatalos Számadás 116–133. sorai.
 *
 * 2026-08-14 (K2): a hivatalos ív Datorii (117–127) és Creanţe (129–133)
 * sorainak rögzítője. A sor-katalógus a @kartoteka/ui-app-ból jön
 * (SZAMADAS_DATORII_SOROK / SZAMADAS_CREANTE_SOROK) — ugyanabból, amiből a
 * nyomtatvány épül, így a feliratok nem tudnak széthúzni.
 *
 * Az EREK Útmutató (116. sor): „A jegyzőkönyvbe nem vett tartozásokat nem
 * lehet kifizetni a következő évben. Ha nincs tartozás, akkor jegyzőkönyvezni
 * kell azt is, hogy nincs tartozás." — az üresen hagyott mező 0-ként nyomtatódik.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  SZAMADAS_DATORII_SOROK,
  SZAMADAS_CREANTE_SOROK,
  type BealitasRow,
} from '@kartoteka/ui-app'

import { parseImportAmount } from '@/lib/import/amount-parse'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { saveSzamadasTartozasok } from '@/app/(dashboard)/penzugy/actions'

const fmt = new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SzamadasTartozasokDialog({
  open,
  onOpenChange,
  year,
  settings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  year: number
  settings: BealitasRow
  onSaved: () => void
}) {
  const finalized = !!settings.accounting_finalized
  const [tartozasok, setTartozasok] = useState<Record<string, string>>({})
  const [kintlevosegek, setKintlevosegek] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Megnyitáskor a tárolt értékekből töltünk (üres mező = még nincs rögzítve).
  useEffect(() => {
    if (!open) return
    const stored = settings.szamadas_tartozasok
    const toStr = (m?: Record<string, number>): Record<string, string> => {
      const ki: Record<string, string> = {}
      for (const [nr, v] of Object.entries(m || {})) ki[nr] = String(v)
      return ki
    }
    setTartozasok(toStr(stored?.tartozasok ?? undefined))
    setKintlevosegek(toStr(stored?.kintlevosegek ?? undefined))
  }, [open, settings.szamadas_tartozasok])

  // P0-17 (audit 2026-08-28): a korábbi naiv vessző→pont csere az ezres-
  // elválasztós beírást („1 234,56", „1.234") némán 0-ra vagy ezredére vitte —
  // a kanonikus parser a lib/import/amount-parse.
  const num = (v: string | undefined): number => {
    const n = parseImportAmount(v ?? '')
    return n !== null && n >= 0 ? n : 0
  }
  const datoriiTotal = useMemo(
    () => SZAMADAS_DATORII_SOROK.reduce((s, [nr]) => s + num(tartozasok[String(nr)]), 0),
    [tartozasok],
  )
  const creanteTotal = useMemo(
    () => SZAMADAS_CREANTE_SOROK.reduce((s, [nr]) => s + num(kintlevosegek[String(nr)]), 0),
    [kintlevosegek],
  )

  async function handleSave() {
    setBusy(true)
    try {
      const toNum = (m: Record<string, string>): Record<string, number> => {
        const ki: Record<string, number> = {}
        for (const [nr, v] of Object.entries(m)) {
          if (String(v).trim() === '') continue // üres = nincs rögzítve (0-ként nyomtatódik)
          ki[nr] = num(v)
        }
        return ki
      }
      const res = await saveSzamadasTartozasok(year, {
        tartozasok: toNum(tartozasok),
        kintlevosegek: toNum(kintlevosegek),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Tartozások és kintlévőségek elmentve — a Számadás nyomtatványra ezek a számok kerülnek.')
      onOpenChange(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const sorBlokk = (
    cim: string,
    sorok: ReadonlyArray<[number, string, string]>,
    values: Record<string, string>,
    setValues: (fn: (cur: Record<string, string>) => Record<string, string>) => void,
    total: number,
    totalNr: number,
  ) => (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between rounded-t-xl border-b border-border bg-muted/40 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{cim}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {totalNr}. sor összesen: <strong className="text-foreground">{fmt.format(total)} lej</strong>
        </p>
      </div>
      <div className="divide-y divide-border">
        {sorok.map(([nr, ro, hu]) => (
          <label key={nr} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-8 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{nr}.</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground" title={`${ro} / ${hu}`}>{hu}</span>
              <span className="block truncate text-[11px] text-muted-foreground" title={ro}>{ro}</span>
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              disabled={finalized}
              value={values[String(nr)] ?? ''}
              placeholder="0"
              onChange={(e) => setValues((cur) => ({ ...cur, [String(nr)]: e.target.value }))}
              className="h-9 w-32 shrink-0 rounded-lg border border-input bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tartozások és kintlévőségek — {year}. év vége</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-relaxed text-muted-foreground">
          A hivatalos Számadás 116–133. sorai. Az EREK Útmutató szerint a jegyzőkönyvbe nem vett
          tartozást nem lehet kifizetni a következő évben — <strong>ha nincs tartozás, azt is
          jegyzőkönyvezni kell</strong> (ilyenkor hagyd üresen a mezőket, a nyomtatványra nullák
          kerülnek). ⚠️ A kintlévőségbe <strong>nem</strong> számít bele a kintlévő egyházfenntartói
          járulék, a megígért adomány és a perselypénz.
        </p>

        {finalized && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            A(z) {year}. évi számadás véglegesítve van — az értékek csak megtekinthetők.
            Módosításhoz kérj javítási engedélyt az egyházmegyétől.
          </p>
        )}

        <div className="space-y-3">
          {sorBlokk('Tartozások / Datorii (117–127)', SZAMADAS_DATORII_SOROK, tartozasok, setTartozasok, datoriiTotal, 116)}
          {sorBlokk('Kintlévőségek / Creanţe (129–133)', SZAMADAS_CREANTE_SOROK, kintlevosegek, setKintlevosegek, creanteTotal, 128)}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)} disabled={busy}>
            Mégse
          </Button>
          <Button className="rounded-lg" onClick={() => void handleSave()} disabled={busy || finalized}>
            {busy ? 'Mentés…' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
