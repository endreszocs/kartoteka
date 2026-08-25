'use client'

/**
 * Leltar 3_43 munkafüzet importálása — dedikált kártya a leltár
 * „Rendszergazdai importáló" fülén (2026-08-26).
 *
 * Folyamat: fájl kiválasztása → szerveri előnézet (lapónkénti tételszám,
 * hibák, figyelmeztetések, duplikátum-előrejelzés) → „Importálás indítása".
 * A feldolgozás szabályai a lib/inventory/leltar343-shared rétegben élnek;
 * a kapuőrzés (PIN/god-mode) a szerver-akcióban fut — ez a kártya csak akkor
 * renderelődik, amikor az admin-import fül egyáltalán látszik.
 */

import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, FileSpreadsheet, Loader2, TriangleAlert, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  previewLeltar343,
  executeLeltar343Import,
} from '@/app/(dashboard)/leltar/leltar343-actions'
import type {
  Leltar343Preview,
  Leltar343ImportResult,
} from '@/lib/inventory/leltar343-import-types'

export function Leltar343ImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Leltar343Preview | null>(null)
  const [eredmeny, setEredmeny] = useState<Leltar343ImportResult | null>(null)
  const [isPreviewing, startPreviewing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return
    const ext = selected.name.toLowerCase().split('.').pop()
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('A Leltar 3_43 importáló Excel-munkafüzetet (.xlsx/.xls) vár.')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error('A fájl mérete meghaladja a 10 MB-os limitet.')
      return
    }
    setFile(selected)
    setPreview(null)
    setEredmeny(null)

    const formData = new FormData()
    formData.append('file', selected)
    startPreviewing(async () => {
      const result = await previewLeltar343(formData)
      if (result.error) {
        toast.error(result.error)
        setFile(null)
        return
      }
      setPreview(result)
    })
  }

  const handleImport = () => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    startImporting(async () => {
      const result = await executeLeltar343Import(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setEredmeny(result)
      toast.success(`Leltar 3_43 import kész: ${result.beszurt} tétel bekerült, ${result.kihagyott || 0} kimaradt.`)
    })
  }

  const osszesHiba = preview?.lapok?.reduce((sum, lap) => sum + lap.hibak.length, 0) || 0

  return (
    <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="size-5 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-base font-semibold">Leltar 3_43 munkafüzet importálása</h3>
          <Badge variant="outline" className="border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">
            hivatalos egyházmegyei formátum
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          A hivatalos <strong>Leltar 3_43.xlsx</strong> munkafüzet minden kitöltendő lapját felismerjük
          (Csekély értékű, Alapeszközök, Telkek, Könyvek, Kegyszerek, Kárpótlási jegyek, Bizományi + a
          Cimlap helyszín/felelős katalógusa). A Súgó szabályai szerint dolgozunk: hiányzó hónap/nap → január 1.,
          hiányzó mennyiség → 1 db; a negatív sorok részleges kivezetésként, alapeszköznél
          le-/felértékelésként kerülnek be. A már létező leltári számú tételeket nem írjuk felül.
        </p>

        {/* Fájlválasztó */}
        <div
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-white/60 p-6 text-center transition hover:border-emerald-500 dark:border-emerald-800 dark:bg-transparent"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault()
            handleFileSelect(event.dataTransfer.files?.[0] || null)
          }}
        >
          <Upload className="size-6 text-emerald-600" />
          <p className="text-sm font-medium">
            {file ? file.name : 'Kattints ide, vagy húzd ide a Leltar 3_43.xlsx fájlt'}
          </p>
          {isPreviewing && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> A munkafüzet elemzése…
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={event => {
              handleFileSelect(event.target.files?.[0] || null)
              event.target.value = ''
            }}
          />
        </div>

        {/* Előnézet */}
        {preview && (
          <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Egyházmegye (Cimlap):</span> {preview.egyhazmegye || '—'}</p>
              <p><span className="text-muted-foreground">Intézmény (Cimlap):</span> {preview.intezmeny || '—'}</p>
              <p><span className="text-muted-foreground">Vezető (Cimlap):</span> {preview.vezeto || '—'}</p>
              <p><span className="text-muted-foreground">Helyszín/felelős párok:</span> {preview.helyszinek || 0}</p>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-2 font-medium">Lap</th>
                    <th className="p-2 text-right font-medium">Tétel</th>
                    <th className="p-2 text-right font-medium">Kivezetett</th>
                    <th className="p-2 text-right font-medium">Le-/felértékelt</th>
                    <th className="p-2 text-right font-medium">Hiba</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.lapok || []).map(lap => (
                    <tr key={lap.sheet} className="border-t">
                      <td className="p-2">{lap.cimke}</td>
                      <td className="p-2 text-right tabular-nums">{lap.tetelek}</td>
                      <td className="p-2 text-right tabular-nums">{lap.kivezetett}</td>
                      <td className="p-2 text-right tabular-nums">{lap.ertekModositott}</td>
                      <td className="p-2 text-right tabular-nums">{lap.hibak.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(preview.dbDuplikatumok || 0) > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {preview.dbDuplikatumok} tétel leltári száma már létezik a rendszerben — ezek importáláskor
                kimaradnak (nem írunk felül).
              </p>
            )}

            {(preview.lapok || []).flatMap(lap =>
              [...lap.hibak.map(h => ({ ...h, lap: lap.cimke, tipus: 'hiba' as const })),
               ...lap.figyelmeztetesek.map(h => ({ ...h, lap: lap.cimke, tipus: 'figyelmeztetes' as const }))],
            ).slice(0, 12).map((h, i) => (
              <p key={i} className={`text-xs ${h.tipus === 'hiba' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                [{h.lap} · {h.sor}. sor] {h.uzenet}
              </p>
            ))}

            <Button
              onClick={handleImport}
              disabled={isImporting || (preview.osszesTetel || 0) === 0}
              className="min-h-11 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              {isImporting ? (
                <><Loader2 className="mr-1.5 size-4 animate-spin" /> Importálás folyamatban…</>
              ) : (
                `Importálás indítása (${preview.osszesTetel || 0} tétel${osszesHiba > 0 ? `, ${osszesHiba} hibás sor kimarad` : ''})`
              )}
            </Button>
          </div>
        )}

        {/* Eredmény */}
        {eredmeny?.success && (
          <div className="space-y-2 rounded-lg border border-emerald-300 bg-white/70 p-3 dark:border-emerald-800 dark:bg-transparent">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="size-4" /> Import kész: {eredmeny.beszurt} tétel bekerült,
              {' '}{eredmeny.kihagyott || 0} kimaradt.
            </p>
            {(eredmeny.figyelmeztetesek || []).slice(0, 8).map((f, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{f}</p>
            ))}
            {(eredmeny.hibak || []).slice(0, 8).map((h, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400">[{h.lap} · {h.sor}. sor] {h.uzenet}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
