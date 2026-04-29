'use client'

/**
 * Anyakönyvi Import Wizard — fő orchestrator komponens.
 *
 * 7 lépés:
 *   1. Upload (fájl + auto-detect anyakönyv-típus a fájlnévből)
 *   2. Mapping (oszlop-párosítás)
 *   3. Person-link (quad-lookup ellenőrzés: hány tag található)
 *   4. Locality (helység-egyeztetés a Hely / Honnan / Hova oszlopokra)
 *   5. Special-fields (konfirmáció: keresztelés-stub; esketés: vegyes flag)
 *   6. Preview (első 10 sor + statok)
 *   7. Result (inserted / skipped / errors)
 *
 * A wizard 8 anyakönyvi profilt támogat: baptism, confirmation, marriage,
 * burial + 4 mozgás (bekoltozott, elkoltozott, attert, kitert).
 *
 * Két használati mód:
 *   - mode='module' → az anyakönyv-page tabján; az aktív gyülekezetbe importál
 *   - mode='admin' → admin/Import tab; gyülekezet-választó megelőzi
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { toast } from 'sonner'

import { PageHero } from '@kartoteka/ui-app'
import { getCongregations } from '@/app/(dashboard)/admin/actions'
import {
  REGISTRY_PROFILES,
  type ImportProfile,
} from '@/lib/import/import-profiles'
import { parseAndPreview } from '@/lib/import/batch-import-actions'
import { executeRegistryImport } from '@/lib/import/import-registry-actions'
import { scanRegistryLocalitiesAction } from '@/lib/import/registry-locality-scan-action'
import type { ParseResult, ParsedSheetPreview } from '@/lib/import/batch-import-types'

import { WizardStepper, type WizardStep } from '../members/tagnyilvantartas-import/wizard-stepper'
import { ColumnMappingStep } from '../members/tagnyilvantartas-import/column-mapping-step'
import { LocalityMatchStep, type LocalityResolutionMap } from '../members/tagnyilvantartas-import/locality-match-step'
import { PreviewStep } from '../members/tagnyilvantartas-import/preview-step'
import { ResultStep, type ResultData } from '../members/tagnyilvantartas-import/result-step'
import { RegistryFileUploadStep } from './registry-import/file-upload-step'
import { PersonLinkStep } from './registry-import/person-link-step'
import { SpecialFieldsStep, type SpecialFieldsConfig } from './registry-import/special-fields-step'

// ─── Konstansok ─────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: 'upload', label: 'Fájl' },
  { id: 'mapping', label: 'Oszlopok' },
  { id: 'person-link', label: 'Tagok' },
  { id: 'locality', label: 'Helységek' },
  { id: 'special', label: 'Beállítások' },
  { id: 'preview', label: 'Előnézet' },
  { id: 'result', label: 'Eredmény' },
]

// ─── Típusok ─────────────────────────────────────────────────────────────

type WizardStage =
  | 'upload'
  | 'mapping'
  | 'person-link'
  | 'locality'
  | 'special'
  | 'preview'
  | 'importing'
  | 'result'

interface CongregationOption {
  id: string
  name: string
}

interface RegistryImportWizardProps {
  /** 'module' = anyakönyv-page; 'admin' = admin-import gyülekezet-választóval */
  mode: 'module' | 'admin'
  /** Az aktív gyülekezet (mode='module' esetén kötelező) */
  congregationId?: string | null
  congregationName?: string | null
  /** Admin módban az elérhető gyülekezetek (ha nem adott, getCongregations()-szel lekérjük) */
  adminCongregations?: CongregationOption[]
}

interface RawCongregationRow {
  id: string
  nev_hu?: string | null
  name?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────

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
    if (requiredHeaders.length < requiredDbCols.length) {
      skipped += 1
      continue
    }
    if (hasAllRequired) importable += 1
    else skipped += 1
  }
  return { importable, skipped }
}

/**
 * A kliens-oldali transzformáló — egyszerű mapping-szerű (nem futtatja a teljes
 * lookup-resolvert, csak átnevezi az Excel-fejléceket DB-oszlopokká). A
 * `executeRegistryImport` server action a teljes RPC-t hívja.
 */
function buildTransformedRows(
  rows: Array<Record<string, string | number | null>>,
  mapping: Record<string, string | null>,
): Array<Record<string, string | number | boolean | null>> {
  const result: Array<Record<string, string | number | boolean | null>> = []
  for (const row of rows) {
    const out: Record<string, string | number | boolean | null> = {}
    for (const [excelHeader, value] of Object.entries(row)) {
      const dbCol = mapping[excelHeader]
      if (!dbCol) continue
      out[dbCol] = value
    }
    result.push(out)
  }
  return result
}

// ─── Komponens ───────────────────────────────────────────────────────────

export function RegistryImportWizard({
  mode,
  congregationId,
  congregationName,
  adminCongregations,
}: RegistryImportWizardProps) {
  const router = useRouter()

  // Admin módnál: gyülekezet választás
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
  const [profileKey, setProfileKey] = useState<string>('baptism')
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string | null>>({})
  const [resolvedLocalityMap, setResolvedLocalityMap] = useState<LocalityResolutionMap>({})
  const [specialConfig, setSpecialConfig] = useState<SpecialFieldsConfig>({
    autoCreateBaptismForConfirmation: true,
    marriageVegyesGlobal: false,
  })
  /** Manuális tag-pick a person-link-step-en — kulcs: "rowIdx_slot", érték: szemely_id.
   *  Ha üres → automatikus quad-lookup eredménye érvényes. */
  const [manualPicks, setManualPicks] = useState<Record<string, number>>({})
  /** A teljes fájlból kinyert egyedi helység-szövegek (a sample 5 sornál
   *  több, mert a server action a TELJES fájlt parse-olja). 2026-04-30. */
  const [fullFileLocalities, setFullFileLocalities] = useState<string[] | null>(null)
  const [isScanningLocalities, startScanningLocalities] = useTransition()
  const handleManualPickChange = useCallback((key: string, szemelyId: number | null) => {
    setManualPicks((prev) => {
      if (szemelyId === null) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: szemelyId }
    })
  }, [])
  const [importResult, setImportResult] = useState<ResultData | null>(null)

  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ─── Aktuális profil objektum ─────────────────────────────────────
  const profile = useMemo<ImportProfile>(
    () => REGISTRY_PROFILES.find((p) => p.key === profileKey) || REGISTRY_PROFILES[0],
    [profileKey],
  )

  // ─── Aktív sheet (derived) ────────────────────────────────────────
  const activeSheet = useMemo<ParsedSheetPreview | null>(() => {
    if (!parseResult?.sheets || parseResult.sheets.length === 0) return null
    const firstNonEmpty = parseResult.sheets.find((s) => !s.warning && s.rowCount > 0)
    return firstNonEmpty || parseResult.sheets[0]
  }, [parseResult])

  // ─── Reset új importhoz ──────────────────────────────────────────
  const reset = useCallback(() => {
    setStage('upload')
    setFile(null)
    setParseResult(null)
    setMappingOverrides({})
    setResolvedLocalityMap({})
    setManualPicks({})
    setFullFileLocalities(null)
    setImportResult(null)
  }, [])

  // ─── Parse a file-upload-step "Tovább" gombra ────────────────────
  const handleParseFile = useCallback(() => {
    if (!file) {
      toast.error('Először válassz fájlt.')
      return
    }
    if (mode === 'admin' && !selectedCongId) {
      toast.error('Először válaszd ki a cél gyülekezetet.')
      return
    }
    if (!profileKey) {
      toast.error('Először válaszd ki az anyakönyv típusát.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', 'registry')

    startParsing(async () => {
      const result = await parseAndPreview(formData)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      setParseResult(result)
      const firstSheet = result.sheets?.find((s) => !s.warning && s.rowCount > 0)
      if (firstSheet) {
        setMappingOverrides({})
        setStage('mapping')
        toast.success(
          `${firstSheet.headers.length} oszlop és ${firstSheet.rowCount} sor felismerve.`,
        )
      } else {
        toast.error('A fájl nem tartalmaz feldolgozható sort.')
      }
    })
  }, [file, mode, selectedCongId, profileKey])

  // ─── Profil váltás → mapping reset ───────────────────────────────
  const handleProfileChange = useCallback((key: string) => {
    setProfileKey(key)
    setMappingOverrides({})
  }, [])

  const handleOverrideChange = useCallback(
    (excelHeader: string, dbColumn: string | null) => {
      setMappingOverrides((prev) => ({ ...prev, [excelHeader]: dbColumn }))
    },
    [],
  )

  // ─── Effektív mapping ────────────────────────────────────────────
  const effectiveMapping = useMemo<Record<string, string | null>>(() => {
    if (!activeSheet) return {}
    const auto = autoMapHeaders(activeSheet.headers, profile)
    return { ...auto, ...mappingOverrides }
  }, [activeSheet, profile, mappingOverrides])

  // ─── A teljes (kliens-oldali) transzformált rows a person-link / preview-hoz ───
  const transformedRows = useMemo(() => {
    if (!activeSheet) return []
    return buildTransformedRows(
      activeSheet.sampleRows as Array<Record<string, string | number | null>>,
      effectiveMapping,
    )
  }, [activeSheet, effectiveMapping])

  // ─── Egyedi helység-nevek (csak ha a profil tartalmaz _helyseg_text-et) ───
  const helysegHeaderKeys = useMemo<string[]>(() => {
    // A profil dbColumn-jaiban szereplő helység-jellegű virtuális mezők
    const helysegLikeDbCols = ['_helyseg_text', '_hhelyseg_text', '_thelyseg_text']
    return helysegLikeDbCols.filter((dbCol) =>
      profile.columnMap.some((c) => c.dbColumn === dbCol),
    )
  }, [profile])

  const uniqueLocalityInputs = useMemo<string[]>(() => {
    // Ha már lefutott a TELJES fájl-szken, azt használjuk (autoritatív).
    if (fullFileLocalities !== null) return fullFileLocalities
    // Egyébként a sample-alapú előzetes (csak az 5 sample-sorra) — ezt
    // a wizard scan-action-jel cseréli, mielőtt a locality-step megnyílik.
    if (!activeSheet || helysegHeaderKeys.length === 0) return []
    const set = new Set<string>()
    for (const row of activeSheet.sampleRows as Array<Record<string, string | number | null>>) {
      for (const helysegDbCol of helysegHeaderKeys) {
        const matchingHeader = activeSheet.headers.find((h) => effectiveMapping[h] === helysegDbCol)
        if (matchingHeader) {
          const val = row[matchingHeader]
          if (typeof val === 'string' && val.trim() !== '') set.add(val.trim())
        }
      }
    }
    return Array.from(set)
  }, [activeSheet, helysegHeaderKeys, effectiveMapping, fullFileLocalities])

  // Server-side TELJES fájl helység-szken — a wizard a person-link → locality
  // átmenet előtt hívja, hogy minden 6+ sori új helyszín is bekerüljön a listába.
  const runFullLocalityScan = useCallback(() => {
    if (!file || !activeSheet) return
    if (helysegHeaderKeys.length === 0) {
      setFullFileLocalities([])
      return
    }
    startScanningLocalities(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', activeSheet.sheetName)
      formData.append('profileKey', profile.key)
      formData.append('mapping', JSON.stringify(effectiveMapping))
      const res = await scanRegistryLocalitiesAction(formData)
      if (res.error) {
        toast.error(`Helyszín-szken: ${res.error}`)
        // Fallback: sample-alapú lista marad
        return
      }
      setFullFileLocalities(res.uniqueValues || [])
    })
  }, [file, activeSheet, helysegHeaderKeys, profile, effectiveMapping])

  // ─── Statisztikák ──────────────────────────────────────────────────
  const counts = useMemo(() => {
    if (!activeSheet) return { importable: 0, skipped: 0 }
    return countImportableRows(
      activeSheet.sampleRows as Array<Record<string, string | number | null>>,
      activeSheet.headers,
      profile,
      effectiveMapping,
    )
  }, [activeSheet, profile, effectiveMapping])

  const estimatedImportable = activeSheet
    ? Math.round((counts.importable / Math.max(activeSheet.sampleRows.length, 1)) * activeSheet.rowCount)
    : 0
  const estimatedSkipped = activeSheet ? activeSheet.rowCount - estimatedImportable : 0

  // ─── Konfirmáció: hány sorhoz van keresztelés ideje ───────────────
  const confirmationsWithBaptismDate = useMemo(() => {
    if (profile.key !== 'confirmation') return 0
    return transformedRows.filter((r) => {
      const v = r['keresztelesideje']
      return v != null && v !== ''
    }).length
  }, [profile, transformedRows])

  // ─── Helység-resolution map → kulcs (normalized) → locality_id ────
  const localityIdMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const [input, resolution] of Object.entries(resolvedLocalityMap)) {
      const normKey = input.toLowerCase().trim().replace(/\s+/g, ' ')
      if (resolution.kind === 'auto' || resolution.kind === 'manual_pick') {
        map[normKey] = resolution.locality.locality_id
      } else if (resolution.kind === 'new_locality') {
        map[normKey] = resolution.localityId
      }
    }
    return map
  }, [resolvedLocalityMap])

  // 2026-04-28 ÁTÍRÁS: a `buildRpcRows` kliens-oldali kompozíció ELTÁVOLÍTVA.
  // Az `executeRegistryImport` action server-oldalon parse-olja a teljes
  // fájlt + resolveLookups-szal feloldja a quad-kulcsokat → id_szemely.
  // A wizard csak a fájlt + locality-map + special-config-ot küldi.

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
      // 2026-04-28 ÁTÍRÁS: a server action MAGA parse-olja a teljes fájlt.
      // A korábbi verzió csak a sampleRows-t (max 5 sor) küldte JSON-ben,
      // ezért 81-soros XML-ből csak 5 importálódott.
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', activeSheet.sheetName)
      formData.append('profileKey', profile.key)
      formData.append('resolvedLocalityMap', JSON.stringify(localityIdMap))
      formData.append('specialFieldsConfig', JSON.stringify(specialConfig))
      formData.append('defaultMunkanaploba', 'false')
      // Manuális tag-pick (a person-link-step-ről)
      if (Object.keys(manualPicks).length > 0) {
        formData.append('manualPicks', JSON.stringify(manualPicks))
      }
      if (mode === 'admin' && selectedCongId) {
        formData.append('targetCongregationId', selectedCongId)
      }

      const result = await executeRegistryImport(formData)

      if (result.error) {
        toast.error(result.error)
        setStage('preview')
        return
      }

      const insertedCount = result.insertedCount ?? 0
      const skippedCount = result.skippedCount ?? 0
      const allIssues = result.rowErrors ?? []

      setImportResult({
        insertedTotal: insertedCount,
        insertedSzemely: insertedCount,
        skippedCount,
        errors: allIssues,
      })
      setStage('result')

      const warningCount = allIssues.filter((e) => e.severity === 'warning').length
      if (insertedCount > 0) {
        const baseMsg = `${insertedCount} ${profile.label.toLowerCase()} bejegyzés rögzítve.`
        if (warningCount > 0) {
          toast.warning(`${baseMsg} ${warningCount} sornál figyelmeztetés.`)
        } else {
          toast.success(baseMsg)
        }
      } else {
        toast.warning('Egyetlen sor sem került be — nézd át a hibaüzeneteket.')
      }
      router.refresh()
    })
  }, [file, activeSheet, mode, selectedCongId, profile, localityIdMap, specialConfig, manualPicks, router])

  // ─── Stepper aktív és befejezett lépések ─────────────────────────
  const activeStepId = stage === 'importing' ? 'preview' : stage
  const stageOrder: WizardStage[] = [
    'upload', 'mapping', 'person-link', 'locality', 'special', 'preview', 'result',
  ]
  const currentIdx = stageOrder.indexOf(activeStepId === 'preview' && stage === 'importing' ? 'preview' : stage)
  const completedIds = stageOrder.slice(0, Math.max(currentIdx, 0)).map((s) => s as string)

  // ─── Render ──────────────────────────────────────────────────────
  const isMovementProfile = profile.key.startsWith('movement_')
  const skipLocality = uniqueLocalityInputs.length === 0
  const skipSpecial = profile.key !== 'confirmation' && profile.key !== 'marriage' && !isMovementProfile

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={mode === 'admin' ? 'Rendszergazdai importáló' : 'Anyakönyv'}
        title="Anyakönyvi adatok importálása"
        description="Excel, CSV vagy XML fájlból keresztelési, konfirmációs, esketési, temetési bejegyzések és tagmozgások beolvasása."
        Icon={BookOpen}
        stats={[
          { label: 'Cél gyülekezet', value: selectedCongName },
          { label: 'Anyakönyv-típus', value: profile.label },
        ]}
      />

      <WizardStepper steps={STEPS} activeId={activeStepId} completedIds={completedIds} />

      {/* Admin gyülekezet választó */}
      {mode === 'admin' && stage === 'upload' && (
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
            Cél gyülekezet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Válaszd ki, melyik gyülekezet anyakönyvébe kerüljenek a beolvasott bejegyzések.
          </p>
          <select
            value={selectedCongId}
            onChange={(e) => setSelectedCongId(e.target.value)}
            className="mt-3 h-11 w-full rounded-2xl border border-violet-200 bg-white px-4 text-sm text-slate-700 shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
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

      {/* 1. Upload */}
      {stage === 'upload' && (
        <RegistryFileUploadStep
          selectedFile={file}
          onFileSelected={setFile}
          onClearFile={() => setFile(null)}
          onContinue={handleParseFile}
          isParsing={isParsing}
          selectedProfileKey={profileKey}
          onProfileChange={handleProfileChange}
        />
      )}

      {/* 2. Mapping */}
      {stage === 'mapping' && activeSheet && (
        <ColumnMappingStep
          excelHeaders={activeSheet.headers}
          profile={profile}
          overrides={mappingOverrides}
          onOverrideChange={handleOverrideChange}
          availableProfiles={REGISTRY_PROFILES}
          selectedProfileKey={profile.key}
          onProfileChange={handleProfileChange}
          onBack={() => setStage('upload')}
          onContinue={() => {
            // 2026-04-30: TELJES fájl helység-szken indítása a háttérben.
            // Mire a felhasználó eljut a locality-stage-ig, addigra megvan
            // az ÖSSZES helység-szöveg listája (nem csak a sample 5 soré).
            runFullLocalityScan()
            setStage('person-link')
          }}
        />
      )}

      {/* 3. Person-link */}
      {stage === 'person-link' && activeSheet && file && (
        <PersonLinkStep
          file={file}
          sheetName={activeSheet.sheetName}
          profileKey={profile.key}
          targetCongregationId={mode === 'admin' ? selectedCongId : congregationId || ''}
          manualPicks={manualPicks}
          onPickChange={handleManualPickChange}
          onBack={() => setStage('mapping')}
          onContinue={() => {
            if (skipLocality) {
              if (skipSpecial) setStage('preview')
              else setStage('special')
            } else {
              setStage('locality')
            }
          }}
        />
      )}

      {/* 4. Locality — szken-loader */}
      {stage === 'locality' && activeSheet && isScanningLocalities && fullFileLocalities === null && (
        <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-700 ring-1 ring-violet-100">
          A teljes fájlból gyűjtjük a helységeket… (52+ sor esetén pár másodperc)
        </div>
      )}

      {/* 4. Locality — match step */}
      {stage === 'locality' && activeSheet && (
        <LocalityMatchStep
          uniqueLocalityInputs={uniqueLocalityInputs}
          resolvedMap={resolvedLocalityMap}
          onResolutionChange={(input, resolution) =>
            setResolvedLocalityMap((prev) => ({ ...prev, [input]: resolution }))
          }
          onBack={() => setStage('person-link')}
          onContinue={() => {
            if (skipSpecial) setStage('preview')
            else setStage('special')
          }}
        />
      )}

      {/* 5. Special-fields */}
      {stage === 'special' && activeSheet && (
        <SpecialFieldsStep
          profileKey={profile.key}
          config={specialConfig}
          onConfigChange={setSpecialConfig}
          confirmationsWithBaptismDate={confirmationsWithBaptismDate}
          totalRows={activeSheet.rowCount}
          onBack={() => (skipLocality ? setStage('person-link') : setStage('locality'))}
          onContinue={() => setStage('preview')}
        />
      )}

      {/* 6. Preview + import */}
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
            if (!skipSpecial) setStage('special')
            else if (!skipLocality) setStage('locality')
            else setStage('person-link')
          }}
          onConfirmImport={handleConfirmImport}
          isImporting={isImporting}
        />
      )}

      {/* 7. Result */}
      {stage === 'result' && importResult && (
        <ResultStep result={importResult} onNewImport={reset} />
      )}
    </div>
  )
}
