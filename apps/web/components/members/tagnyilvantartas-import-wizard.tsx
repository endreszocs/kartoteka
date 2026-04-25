'use client'

/**
 * Tagnyilvántartás Import Wizard — fő orchestrator komponens.
 *
 * 5 lépéses wizard:
 *   1. Fájl feltöltés (drag-drop, .xlsx/.xls/.csv/.xml)
 *   2. Oszlop párosítás (auto-suggested + manuális override)
 *   3. Előnézet (első 10 sor + statok)
 *   4. Importálás (progress + RPC/batch insert)
 *   5. Eredmény (inserted/skipped/errors)
 *
 * Két használati mód:
 *   - mode='module' — a tagnyilvántartás-oldal "Rendszergazdai importáló" tabján;
 *     az aktív gyülekezetbe importál.
 *   - mode='admin' — az admin/Import tabban; gyülekezet-választó megelőzi a wizardot.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Network, Users } from 'lucide-react'
import { toast } from 'sonner'

import { PageHero } from '@kartoteka/ui-app'
import { Button } from '@/components/ui/button'
import { getCongregations } from '@/app/(dashboard)/admin/actions'
import {
  PROFILE_PERSONS,
  PROFILE_FAMILY_HEADS,
  type ImportProfile,
} from '@/lib/import/import-profiles'
import { parseAndPreview } from '@/lib/import/batch-import-actions'
import { executeFamilyHeadImport } from '@/lib/import/family-head-import-actions'
import type { ParseResult, ParsedSheetPreview } from '@/lib/import/batch-import-types'

import { WizardStepper, type WizardStep } from './tagnyilvantartas-import/wizard-stepper'
import { FileUploadStep } from './tagnyilvantartas-import/file-upload-step'
import { ColumnMappingStep } from './tagnyilvantartas-import/column-mapping-step'
import { LocalityMatchStep, type LocalityResolutionMap } from './tagnyilvantartas-import/locality-match-step'
import { StreetPostalcodeStep, type StreetPostalcodeMap } from './tagnyilvantartas-import/street-postalcode-step'
import { PreviewStep } from './tagnyilvantartas-import/preview-step'
import { ResultStep, type ResultData } from './tagnyilvantartas-import/result-step'
import { FamilyLinkStep } from './tagnyilvantartas-import/family-link-step'

// ─── Konstansok ─────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: 'upload', label: 'Fájl' },
  { id: 'mapping', label: 'Oszlopok' },
  { id: 'locality', label: 'Helységek' },
  { id: 'postalcode', label: 'Postakódok' },
  { id: 'preview', label: 'Előnézet' },
  { id: 'result', label: 'Eredmény' },
  { id: 'family-link', label: 'Családok' },
]

const AVAILABLE_PROFILES: ImportProfile[] = [PROFILE_PERSONS, PROFILE_FAMILY_HEADS]

// ─── Típusok ─────────────────────────────────────────────────────────────

type WizardStage =
  | 'upload'
  | 'mapping'
  | 'locality'
  | 'postalcode'
  | 'preview'
  | 'importing'
  | 'result'
  | 'family-link'

interface CongregationOption {
  id: string
  name: string
}

interface TagnyilvantartasImportWizardProps {
  /** 'module' = aktív gyülekezetbe; 'admin' = választható gyülekezet */
  mode: 'module' | 'admin'
  /** Az aktív gyülekezet (mode='module' esetén kötelező) */
  congregationId?: string | null
  congregationName?: string | null
  /**
   * Admin módban az elérhető gyülekezetek listája — ha nincs megadva,
   * a wizard magától lekérdezi a `getCongregations()` server action-rel.
   */
  adminCongregations?: CongregationOption[]
}

interface RawCongregationRow {
  id: string
  nev_hu?: string | null
  name?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function detectInitialProfile(fileName: string): ImportProfile {
  const lower = fileName.toLowerCase()
  if (lower.includes('csalad') || lower.includes('family')) return PROFILE_FAMILY_HEADS
  if (lower.includes('szemely') || lower.includes('tagok') || lower.includes('person')) {
    return PROFILE_PERSONS
  }
  return PROFILE_PERSONS
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[.\s_-]+/g, '').trim()
}

function autoMapHeaders(
  excelHeaders: string[],
  profile: ImportProfile,
): Record<string, string | null> {
  const map: Record<string, string | null> = {}
  for (const header of excelHeaders) {
    const norm = normalizeForMatch(header)
    let matched: string | null = null
    for (const col of profile.columnMap) {
      if (normalizeForMatch(col.excelHeader) === norm) {
        matched = col.dbColumn
        break
      }
      if (col.excelAliases?.some((a) => normalizeForMatch(a) === norm)) {
        matched = col.dbColumn
        break
      }
    }
    map[header] = matched
  }
  return map
}

function countImportableRows(
  rows: Array<Record<string, string | number | null>>,
  headers: string[],
  profile: ImportProfile,
  mapping: Record<string, string | null>,
): { importable: number; skipped: number } {
  // A kötelező mezőkhöz milyen Excel-fejlécek vannak rendelve?
  const requiredDbCols = profile.columnMap
    .filter((c) => c.required)
    .map((c) => c.dbColumn)
  const requiredHeaders: string[] = []
  for (const dbCol of requiredDbCols) {
    const matchingHeader = headers.find((h) => mapping[h] === dbCol)
    if (matchingHeader) requiredHeaders.push(matchingHeader)
  }

  let importable = 0
  let skipped = 0
  for (const row of rows) {
    let hasAllRequired = true
    for (const reqHeader of requiredHeaders) {
      const v = row[reqHeader]
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
        hasAllRequired = false
        break
      }
    }
    // Ha nincs minden kötelező mappinghez tartozó header, már a sheet-szinten elbukik
    if (requiredHeaders.length < requiredDbCols.length) {
      skipped += 1
      continue
    }
    if (hasAllRequired) importable += 1
    else skipped += 1
  }
  return { importable, skipped }
}

// ─── Komponens ───────────────────────────────────────────────────────────

export function TagnyilvantartasImportWizard({
  mode,
  congregationId,
  congregationName,
  adminCongregations,
}: TagnyilvantartasImportWizardProps) {
  const router = useRouter()

  // Admin módnál: gyülekezet választás (saját lekérdezéssel ha nincs prop)
  const [selectedCongId, setSelectedCongId] = useState<string>(
    mode === 'module' ? congregationId || '' : '',
  )
  const [loadedCongregations, setLoadedCongregations] = useState<CongregationOption[] | null>(
    adminCongregations ?? null,
  )

  useEffect(() => {
    if (mode !== 'admin') return
    if (loadedCongregations !== null) return
    let cancelled = false
    getCongregations()
      .then((result) => {
        if (cancelled) return
        if ('data' in result && result.data) {
          const opts: CongregationOption[] = (result.data as RawCongregationRow[]).map((c) => ({
            id: c.id,
            name: c.nev_hu || c.name || 'Ismeretlen gyülekezet',
          }))
          setLoadedCongregations(opts)
        } else {
          setLoadedCongregations([])
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedCongregations([])
      })
    return () => {
      cancelled = true
    }
  }, [mode, loadedCongregations])

  const effectiveAdminList = useMemo<CongregationOption[]>(
    () => loadedCongregations || [],
    [loadedCongregations],
  )
  const selectedCongName = useMemo(() => {
    if (mode === 'module') return congregationName || 'Aktuális gyülekezet'
    const found = effectiveAdminList.find((c) => c.id === selectedCongId)
    return found?.name || 'Válassz gyülekezetet'
  }, [mode, congregationName, effectiveAdminList, selectedCongId])

  // Wizard state
  const [stage, setStage] = useState<WizardStage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [profile, setProfile] = useState<ImportProfile>(PROFILE_PERSONS)
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string | null>>({})
  const [resolvedLocalityMap, setResolvedLocalityMap] = useState<LocalityResolutionMap>({})
  const [resolvedPostalcodes, setResolvedPostalcodes] = useState<StreetPostalcodeMap>({})
  const [importResult, setImportResult] = useState<ResultData | null>(null)

  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ─── Aktív sheet (derived a parseResult-ból, nem state) ──────────
  const activeSheet = useMemo<ParsedSheetPreview | null>(() => {
    if (!parseResult?.sheets || parseResult.sheets.length === 0) return null
    const firstNonEmpty = parseResult.sheets.find((s) => !s.warning && s.rowCount > 0)
    return firstNonEmpty || parseResult.sheets[0]
  }, [parseResult])

  // ─── Visszaállítás új importhoz ─────────────────────────────────
  const reset = useCallback(() => {
    setStage('upload')
    setFile(null)
    setParseResult(null)
    setProfile(PROFILE_PERSONS)
    setMappingOverrides({})
    setResolvedLocalityMap({})
    setResolvedPostalcodes({})
    setImportResult(null)
  }, [])

  // ─── Parse trigger (Tovább gomb a file-upload step-en) ──────────
  const handleParseFile = useCallback(() => {
    if (!file) {
      toast.error('Először válassz fájlt.')
      return
    }
    if (mode === 'admin' && !selectedCongId) {
      toast.error('Először válaszd ki a cél gyülekezetet.')
      return
    }

    const targetProfile = detectInitialProfile(file.name)
    setProfile(targetProfile)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', 'members')

    startParsing(async () => {
      const result = await parseAndPreview(formData)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      setParseResult(result)
      // Auto-mapping az első nem-üres sheet alapján
      const firstSheet = result.sheets?.find((s) => !s.warning && s.rowCount > 0)
      if (firstSheet) {
        setMappingOverrides({}) // reset, az auto-mapping a column-mapping-step-ben történik
        setStage('mapping')
        toast.success(
          `${firstSheet.headers.length} oszlop és ${firstSheet.rowCount} sor felismerve a "${firstSheet.sheetName}" fülön.`,
        )
      } else {
        toast.error('A fájl nem tartalmaz feldolgozható sort.')
      }
    })
  }, [file, mode, selectedCongId])

  // ─── Profil váltás → mapping reset ─────────────────────────────
  const handleProfileChange = useCallback((key: string) => {
    const next = AVAILABLE_PROFILES.find((p) => p.key === key)
    if (next) {
      setProfile(next)
      setMappingOverrides({}) // új auto-mapping a column-mapping-step-ben
    }
  }, [])

  // ─── Override kezelés ────────────────────────────────────────────
  const handleOverrideChange = useCallback(
    (excelHeader: string, dbColumn: string | null) => {
      setMappingOverrides((prev) => ({ ...prev, [excelHeader]: dbColumn }))
    },
    [],
  )

  // ─── Az effektív mapping (auto + override) ───────────────────────
  const effectiveMapping = useMemo<Record<string, string | null>>(() => {
    if (!activeSheet) return {}
    const auto = autoMapHeaders(activeSheet.headers, profile)
    return { ...auto, ...mappingOverrides }
  }, [activeSheet, profile, mappingOverrides])

  // ─── Egyedi helység-nevek (a 3. step-hez) ─────────────────────────
  const helysegHeader = useMemo<string | null>(() => {
    if (!activeSheet) return null
    // Olyan Excel-fejléc, amit a `_helyseg_text` virtuális dbColumn-ra map-elünk
    for (const header of activeSheet.headers) {
      if (effectiveMapping[header] === '_helyseg_text') return header
    }
    return null
  }, [activeSheet, effectiveMapping])

  const utcaHeader = useMemo<string | null>(() => {
    if (!activeSheet) return null
    for (const header of activeSheet.headers) {
      if (effectiveMapping[header] === '_utca_text') return header
    }
    return null
  }, [activeSheet, effectiveMapping])

  const uniqueLocalityInputs = useMemo<string[]>(() => {
    if (!activeSheet || !helysegHeader) return []
    const set = new Set<string>()
    for (const row of activeSheet.sampleRows as Array<Record<string, string | number | null>>) {
      const val = row[helysegHeader]
      if (typeof val === 'string' && val.trim() !== '') {
        set.add(val.trim())
      }
    }
    return Array.from(set)
  }, [activeSheet, helysegHeader])

  // ─── Becsült importálható / kihagyott ────────────────────────────
  const counts = useMemo(() => {
    if (!activeSheet) return { importable: 0, skipped: 0 }
    return countImportableRows(
      activeSheet.sampleRows as Array<Record<string, string | number | null>>,
      activeSheet.headers,
      profile,
      effectiveMapping,
    )
  }, [activeSheet, profile, effectiveMapping])

  // A becslés a sample-en alapul, a totalRows pedig a teljes sheet
  const estimatedImportable = activeSheet
    ? Math.round((counts.importable / Math.max(activeSheet.sampleRows.length, 1)) * activeSheet.rowCount)
    : 0
  const estimatedSkipped = activeSheet ? activeSheet.rowCount - estimatedImportable : 0

  // ─── Import indítás ──────────────────────────────────────────────
  const handleConfirmImport = useCallback(() => {
    if (!file || !activeSheet) {
      toast.error('Hiányzó fájl vagy sheet.')
      return
    }
    if (mode === 'admin' && !selectedCongId) {
      toast.error('Hiányzó cél gyülekezet.')
      return
    }

    setStage('importing')

    startImporting(async () => {
      // Mindkét profil az RPC-alapú executeFamilyHeadImport-ot használja:
      // a server action garantálja az utca/helység lookup-ot, ami a szemely.c_utcaid
      // (és csalad.c_utcaid) NOT NULL constraint teljesüléséhez kell.
      // A különbség csak: a PROFILE_PERSONS-nál createCsalad=false, a
      // PROFILE_FAMILY_HEADS-nél createCsalad=true (a sor a families táblába is).
      const isFamilyHeads = profile.key === PROFILE_FAMILY_HEADS.key

      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', activeSheet.sheetName)
      formData.append('profileKey', profile.key)
      formData.append('createCsalad', isFamilyHeads ? 'true' : 'false')
      if (mode === 'admin' && selectedCongId) {
        formData.append('targetCongregationId', selectedCongId)
      }

      // Helység-egyeztetés (3. lépés) — JSONB map átadása az import RPC-nek
      // A SQL-oldali `normalize_name` ugyanúgy normalizál, így a kulcsok egyeznek
      const localityMapForRpc: Record<string, number> = {}
      for (const [input, resolution] of Object.entries(resolvedLocalityMap)) {
        const normKey = input.toLowerCase().trim().replace(/\s+/g, ' ')
        if (resolution.kind === 'auto' || resolution.kind === 'manual_pick') {
          localityMapForRpc[normKey] = resolution.locality.locality_id
        } else if (resolution.kind === 'new_locality') {
          localityMapForRpc[normKey] = resolution.localityId
        }
      }
      if (Object.keys(localityMapForRpc).length > 0) {
        formData.append('resolvedLocalityMap', JSON.stringify(localityMapForRpc))
      }

      // Utca-postakód (4. lépés) — JSONB map
      if (Object.keys(resolvedPostalcodes).length > 0) {
        formData.append('resolvedStreetPostalcodes', JSON.stringify(resolvedPostalcodes))
      }

      const result = await executeFamilyHeadImport(formData)
      if (result.error) {
        toast.error(result.error)
        setStage('preview')
        return
      }

      const insertedSzemely = result.insertedSzemely ?? 0
      const insertedCsalad = result.insertedCsalad ?? 0
      const allIssues = result.rowErrors ?? []
      // A skippedCount CSAK a tényleges hibák — a warning/info-jegyek nem számítanak,
      // mert azoknál a sorok beszúrásra kerültek.
      const skippedCount = allIssues.filter((e) => (e.severity ?? 'error') === 'error').length

      setImportResult({
        insertedTotal: insertedSzemely + insertedCsalad,
        insertedSzemely,
        insertedCsalad: isFamilyHeads ? insertedCsalad : undefined,
        skippedCount,
        errors: allIssues,
      })
      setStage('result')

      const warningCount = allIssues.filter((e) => e.severity === 'warning').length
      if (insertedSzemely > 0) {
        const baseMsg = isFamilyHeads
          ? `${insertedSzemely} új családfő + ${insertedCsalad} új család beolvasva.`
          : `${insertedSzemely} új személy beolvasva.`
        if (warningCount > 0) {
          toast.warning(`${baseMsg} ${warningCount} sornál figyelmeztetés — ellenőrizd!`)
        } else {
          toast.success(baseMsg)
        }
      }
      router.refresh()
    })
  }, [file, activeSheet, profile, mode, selectedCongId, router])

  // ─── Stepper aktív és befejezett lépések ─────────────────────────
  const activeStepId =
    stage === 'importing' ? 'preview'
      : stage === 'result' ? 'result'
      : stage === 'family-link' ? 'family-link'
      : stage
  const completedIds: string[] = []
  if (['mapping', 'locality', 'postalcode', 'preview', 'importing', 'result', 'family-link'].includes(stage)) {
    completedIds.push('upload')
  }
  if (['locality', 'postalcode', 'preview', 'importing', 'result', 'family-link'].includes(stage)) {
    completedIds.push('mapping')
  }
  if (['postalcode', 'preview', 'importing', 'result', 'family-link'].includes(stage)) {
    completedIds.push('locality')
  }
  if (['preview', 'importing', 'result', 'family-link'].includes(stage)) {
    completedIds.push('postalcode')
  }
  if (['result', 'family-link'].includes(stage)) {
    completedIds.push('preview')
  }
  if (stage === 'family-link') {
    completedIds.push('result')
  }

  // Mely gyülekezet ID-ját kapja az auto-link?
  const linkTargetCongId = mode === 'admin' ? selectedCongId : (congregationId || '')

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={mode === 'admin' ? 'Rendszergazdai importáló' : 'Tagnyilvántartás'}
        title="Adatok importálása"
        description="Excel, CSV vagy XML fájlból személyek és családok beolvasása az adatbázisba — egy tisztán végigvezetett folyamatban."
        Icon={Users}
        stats={[
          { label: 'Cél gyülekezet', value: selectedCongName },
          {
            label: 'Aktív profil',
            value: profile.label,
          },
        ]}
      />

      <WizardStepper steps={STEPS} activeId={activeStepId} completedIds={completedIds} />

      {/* Admin mode: gyülekezet választó */}
      {mode === 'admin' && stage === 'upload' && (
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Cél gyülekezet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Válaszd ki, melyik gyülekezet adatbázisába kerüljenek a beolvasott sorok.
          </p>
          <select
            value={selectedCongId}
            onChange={(e) => setSelectedCongId(e.target.value)}
            className="mt-3 h-11 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm text-slate-700 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">— Válassz gyülekezetet —</option>
            {effectiveAdminList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loadedCongregations === null && (
            <p className="mt-2 text-xs text-slate-500">Gyülekezetek betöltése…</p>
          )}
        </div>
      )}

      {/* Lépés 1: Fájl feltöltés */}
      {stage === 'upload' && (
        <FileUploadStep
          selectedFile={file}
          onFileSelected={setFile}
          onClearFile={() => setFile(null)}
          onContinue={handleParseFile}
          isParsing={isParsing}
        />
      )}

      {/* Lépés 2: Oszlop párosítás */}
      {stage === 'mapping' && activeSheet && (
        <ColumnMappingStep
          excelHeaders={activeSheet.headers}
          profile={profile}
          overrides={mappingOverrides}
          onOverrideChange={handleOverrideChange}
          availableProfiles={AVAILABLE_PROFILES}
          selectedProfileKey={profile.key}
          onProfileChange={handleProfileChange}
          onBack={() => setStage('upload')}
          onContinue={() => {
            // Ha vannak helységek, megyünk a 3. step-re; egyébként ugorjuk át
            if (uniqueLocalityInputs.length > 0) {
              setStage('locality')
            } else {
              setStage('preview')
            }
          }}
        />
      )}

      {/* Lépés 3: Helység-egyeztetés (csak ha vannak helységek) */}
      {stage === 'locality' && activeSheet && (
        <LocalityMatchStep
          uniqueLocalityInputs={uniqueLocalityInputs}
          resolvedMap={resolvedLocalityMap}
          onResolutionChange={(input, resolution) =>
            setResolvedLocalityMap((prev) => ({ ...prev, [input]: resolution }))
          }
          onBack={() => setStage('mapping')}
          onContinue={() => setStage('postalcode')}
        />
      )}

      {/* Lépés 4: Utca-postakód-egyeztetés (átugorható) */}
      {stage === 'postalcode' && activeSheet && (
        <StreetPostalcodeStep
          rows={activeSheet.sampleRows as Array<Record<string, string | number | null>>}
          helysegHeader={helysegHeader}
          utcaHeader={utcaHeader}
          resolvedLocalityMap={resolvedLocalityMap}
          resolvedPostalcodes={resolvedPostalcodes}
          onPostalcodeChange={(key, postalcode) =>
            setResolvedPostalcodes((prev) => ({ ...prev, [key]: postalcode }))
          }
          onBack={() => setStage('locality')}
          onContinue={() => setStage('preview')}
          onSkip={() => {
            setResolvedPostalcodes({})
            setStage('preview')
          }}
        />
      )}

      {/* Lépés 5: Előnézet + import gomb */}
      {(stage === 'preview' || stage === 'importing') && activeSheet && (
        <PreviewStep
          rows={activeSheet.sampleRows as Array<Record<string, string | number | null>>}
          headers={activeSheet.headers}
          profile={profile}
          mapping={effectiveMapping}
          totalRows={activeSheet.rowCount}
          congregationName={selectedCongName}
          importableCount={estimatedImportable}
          skippedCount={estimatedSkipped}
          onBack={() => {
            // Vissza a 4. (postalcode) lépésre, vagy ha üres, a 3.-ra (locality), vagy a 2.-ra
            if (uniqueLocalityInputs.length > 0) {
              setStage('postalcode')
            } else {
              setStage('mapping')
            }
          }}
          onConfirmImport={handleConfirmImport}
          isImporting={isImporting}
        />
      )}

      {/* Lépés 4: Eredmény */}
      {stage === 'result' && importResult && (
        <ResultStep
          result={importResult}
          onNewImport={reset}
          extraAction={
            linkTargetCongId && importResult.insertedTotal > 0 ? (
              <Button
                type="button"
                onClick={() => setStage('family-link')}
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Network className="mr-1.5 size-4" />
                Családszerkezet összeállítása
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Lépés 5: Családszerkezet összeállítása (auto-link) */}
      {stage === 'family-link' && linkTargetCongId && (
        <FamilyLinkStep
          congregationId={linkTargetCongId}
          congregationName={selectedCongName}
          onBack={() => setStage('result')}
        />
      )}
    </div>
  )
}
