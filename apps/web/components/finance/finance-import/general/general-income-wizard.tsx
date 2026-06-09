'use client'

/**
 * Általános bevétel-import wizard — KÉZI oszlop-párosítással (#D, 2026-06-09).
 *
 * A felhasználó saját Excel/CSV/XML fájljához: tetszőleges oszlopnevek/sorrend.
 * 3 lépés:
 *   1. upload — fájl + cél-kategória + év
 *   2. mapping — a fájl fejléceit a cél-mezőkhöz rendeli (Név/Összeg/Dátum kötelező)
 *   3. result — beszúrás (dedup) + tag-feloldás statisztika + könyvelés-egyeztetés
 */

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  parseGeneralPreview,
  executeGeneralImport,
  type GeneralSheetPreview,
  type GeneralImportResult,
} from '@/app/(dashboard)/penzugy/general-income-actions'

type Stage = 'upload' | 'mapping' | 'result'

/** A cél-mezők, amikhez a fájl oszlopait rendelni kell. */
const TARGET_FIELDS = [
  { key: 'nev', label: 'Név / Forrás', required: true },
  { key: 'osszeg', label: 'Összeg', required: true },
  { key: 'datum', label: 'Dátum', required: true },
  { key: 'kategoria', label: 'Kategória (kód vagy név)', required: true },
  { key: 'iratszam', label: 'Iratszám', required: false },
  { key: 'nyugta', label: 'Nyugta', required: false },
  { key: 'fizetettev', label: 'Befizetett év', required: false },
  { key: 'megjegyzes', label: 'Megjegyzés', required: false },
] as const
type FieldKey = (typeof TARGET_FIELDS)[number]['key']

const NONE = '__none__'

function parseAmount(v: string | number | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function GeneralIncomeImportWizard() {
  const [stage, setStage] = useState<Stage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const [sheets, setSheets] = useState<GeneralSheetPreview[]>([])
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    nev: NONE, osszeg: NONE, datum: NONE, kategoria: NONE, iratszam: NONE, nyugta: NONE, fizetettev: NONE, megjegyzes: NONE,
  })

  const [result, setResult] = useState<GeneralImportResult | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  const sheet = useMemo(
    () => sheets.find((s) => s.name === activeSheet) ?? sheets[0],
    [sheets, activeSheet],
  )

  const handleParse = useCallback(() => {
    if (!file) {
      toast.error('Válassz egy fájlt.')
      return
    }
    startParsing(async () => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await parseGeneralPreview(fd)
      if (res.error || !res.sheets) {
        toast.error(res.error || 'A fájl nem olvasható.')
        return
      }
      setSheets(res.sheets)
      setActiveSheet(res.sheets[0]?.name ?? '')
      // Heurisztikus auto-mapping a fejlécek alapján
      autoMap(res.sheets[0])
      setStage('mapping')
    })
  }, [file])

  function autoMap(s: GeneralSheetPreview | undefined) {
    if (!s) return
    const find = (cands: string[]) =>
      s.headers.find((h) => cands.some((c) => h.toLowerCase().replace(/\s+/g, '').includes(c))) ?? NONE
    setMapping({
      nev: find(['forrás', 'forras', 'név', 'nev', 'befizet']),
      osszeg: find(['összeg', 'osszeg', 'amount']),
      datum: find(['dátum', 'datum', 'date']),
      kategoria: find(['célja', 'celja', 'kategória', 'kategoria', 'költsszám', 'koltsszam', 'kód', 'kod', 'category']),
      iratszam: find(['iratszám', 'iratszam']),
      nyugta: find(['nyugta', 'chitanta']),
      fizetettev: find(['befizetettév', 'befizetettev', 'fizetettév', 'fizetettev']),
      megjegyzes: find(['megjegyzés', 'megjegyzes', 'note']),
    })
  }

  const handleImport = useCallback(() => {
    if (!sheet) return
    if (
      mapping.nev === NONE ||
      mapping.osszeg === NONE ||
      mapping.datum === NONE ||
      mapping.kategoria === NONE
    ) {
      toast.error('A Név, Összeg, Dátum és Kategória mezőt kötelező párosítani.')
      return
    }
    const rows = sheet.rows
      .map((row) => {
        const get = (k: FieldKey) => (mapping[k] !== NONE ? row[mapping[k]] : null)
        const fevRaw = get('fizetettev')
        const fizetettev =
          typeof fevRaw === 'number'
            ? Math.trunc(fevRaw)
            : typeof fevRaw === 'string' && /^\d{4}$/.test(fevRaw.trim())
              ? parseInt(fevRaw.trim(), 10)
              : null
        return {
          nev: String(get('nev') ?? '').trim(),
          osszeg: parseAmount(get('osszeg')),
          datum: String(get('datum') ?? '').trim(),
          kategoria: String(get('kategoria') ?? '').trim(),
          iratszam: String(get('iratszam') ?? '').trim(),
          nyugta: String(get('nyugta') ?? '').trim(),
          fizetettev,
          megjegyzes: get('megjegyzes') != null ? String(get('megjegyzes')) : null,
        }
      })
      .filter((r) => r.nev && r.osszeg > 0)

    if (rows.length === 0) {
      toast.error('Nincs érvényes sor (Név + pozitív Összeg szükséges).')
      return
    }

    startImporting(async () => {
      const res = await executeGeneralImport({ rows, year })
      setResult(res)
      setStage('result')
      if (res.error) toast.error(res.error)
      else toast.success(`Beszúrva: ${res.inserted} tétel.`)
    })
  }, [sheet, mapping, year])

  function reset() {
    setStage('upload')
    setFile(null)
    setSheets([])
    setResult(null)
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {stage === 'upload' && (
        <div className="space-y-5">
          <header className="flex items-start gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
              <FileSpreadsheet className="size-6 text-sky-600" />
            </div>
            <div>
              <h2 className="font-heading text-2xl text-slate-800">Általános bevétel-import</h2>
              <p className="mt-1 text-sm text-slate-600">
                Saját Excel/CSV/XML fájl tetszőleges oszlopokkal. A következő lépésben kézzel
                rendeled a fájl oszlopait a cél-mezőkhöz. A tételek a kiválasztott kategóriába
                kerülnek, a befizetőket automatikusan a tagnyilvántartáshoz párosítjuk, és
                duplikáció-védelem mellett szúrjuk be.
              </p>
            </div>
          </header>

          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900">
            <strong>Automatikus kategória-felismerés:</strong> nem kell cél-kategóriát választani.
            A következő lépésben kiválasztod, melyik oszlop tartalmazza a kategóriát (kód, pl.
            „101.01", vagy név, pl. „Egyházfenntartói járulék"), és a rendszer soronként
            felismeri, hogy egyházfenntartás vagy más bevétel, majd a könyveléssel egyezteti.
          </div>

          <div className="max-w-xs space-y-2">
            <Label htmlFor="gen-year">Befizetett év (alap, ha a sorból hiányzik)</Label>
            <Input
              id="gen-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center transition hover:border-sky-400 hover:bg-sky-50/30">
            <UploadCloud className="size-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {file ? file.name : 'Fájl tallózása (.xlsx, .csv, .xml)'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
                e.target.value = ''
              }}
            />
          </label>

          <div className="flex justify-end">
            <Button onClick={handleParse} disabled={!file || isParsing} className="gap-2 rounded-xl">
              {isParsing ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Tovább az oszlop-párosításhoz
            </Button>
          </div>
        </div>
      )}

      {stage === 'mapping' && sheet && (
        <div className="space-y-5">
          <header>
            <h2 className="font-heading text-2xl text-slate-800">Oszlop-párosítás</h2>
            <p className="mt-1 text-sm text-slate-600">
              Rendeld a fájl oszlopait a cél-mezőkhöz. A Név, Összeg és Dátum kötelező.
              ({sheet.rowCount} sor a(z) „{sheet.name}" lapon.)
            </p>
          </header>

          {sheets.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {sheets.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setActiveSheet(s.name)
                    autoMap(s)
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    s.name === activeSheet
                      ? 'border-sky-400 bg-sky-50 font-semibold text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {s.name} ({s.rowCount})
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>
                  {f.label}
                  {f.required && <span className="ml-1 text-rose-600">*</span>}
                </Label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={mapping[f.key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value={NONE}>— nincs —</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Minta-előnézet */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {sheet.headers.map((h) => (
                    <th key={h} className="border-b px-2 py-1 text-left font-medium text-slate-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50/40">
                    {sheet.headers.map((h) => (
                      <td key={h} className="border-b px-2 py-1 text-slate-700">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStage('upload')} className="gap-2 rounded-xl">
              <ArrowLeft className="size-4" />
              Vissza
            </Button>
            <Button onClick={handleImport} disabled={isImporting} className="gap-2 rounded-xl">
              {isImporting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Importálás
            </Button>
          </div>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
            <h2 className="font-heading text-xl text-emerald-900">Import kész</h2>
            <p className="mt-1 text-sm text-emerald-800">
              {result.inserted} tétel beszúrva
              {result.skippedDuplicates ? `, ${result.skippedDuplicates} duplikátum kihagyva` : ''}
              {result.skippedNoCategory ? `, ${result.skippedNoCategory} ismeretlen kategória` : ''}
              {result.skippedInvalid ? `, ${result.skippedInvalid} érvénytelen sor` : ''}.
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Auto-felismerés: {result.egyhfenntartasCount} egyházfenntartás (101.01) ·{' '}
              {result.otherIncomeCount} egyéb bevétel.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <ResKpi label="Beszúrva" value={result.inserted} />
            <ResKpi label="Duplikátum kihagyva" value={result.skippedDuplicates} />
            <ResKpi label="Tag párosítva" value={result.personResolved} />
            <ResKpi label="Ismeretlen kategória" value={result.skippedNoCategory} />
          </div>

          {result.reconcile && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">Egyeztetés a könyveléssel</p>
              <p className="mt-1">
                🟢 {result.reconcile.stats.matchCount} egyezik · 🔵{' '}
                {result.reconcile.stats.missingFromBooksCount} hiányzott a könyvelésből · 🟠{' '}
                {result.reconcile.stats.onlyInBooksCount} csak a könyvelésben · 🟡{' '}
                {result.reconcile.stats.discrepancyCount} eltérés
              </p>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-800">
              <p className="font-semibold">Hibák ({result.errors.length}):</p>
              <ul className="mt-1 list-disc pl-4">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="outline" onClick={reset} className="rounded-xl">
            Új import
          </Button>
        </div>
      )}
    </div>
  )
}

function ResKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}
