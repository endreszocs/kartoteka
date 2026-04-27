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
  }, [activeSheet, helysegHeaderKeys, effectiveMapping])

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

  // ─── A tényleges import-rows építése (locality_id alkalmazva) ─────
  const buildRpcRows = useCallback(
    (allRows: Array<Record<string, string | number | null>>) => {
      const transformed = buildTransformedRows(allRows, effectiveMapping)
      return transformed.map((r) => {
        const out: Record<string, string | number | boolean | null> = {}
        // Csak DB-mezők (nem _ prefix) kerülhetnek a végső sorba
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('_')) continue
          if (v == null) continue
          out[k] = v
        }

        // Helység-text → ID (csak ha van)
        const helysegLookup = (textKey: string, fkKey: string) => {
          const text = r[textKey]
          if (typeof text === 'string' && text.trim()) {
            const norm = text.toLowerCase().trim().replace(/\s+/g, ' ')
            const id = localityIdMap[norm]
            if (id) out[fkKey] = id
          }
        }
        // Profil szerint melyik FK
        if (profile.key === 'baptism' || profile.key === 'confirmation' || profile.key === 'marriage') {
          helysegLookup('_helyseg_text', 'helyid')
        } else if (profile.key === 'burial') {
          helysegLookup('_hhelyseg_text', 'hhelyid')
          helysegLookup('_thelyseg_text', 'thelyid')
        } else if (profile.key === 'movement_bekoltozott' || profile.key === 'movement_attert') {
          helysegLookup('_helyseg_text', 'honnanid')
        } else if (profile.key === 'movement_elkoltozott' || profile.key === 'movement_kitert') {
          helysegLookup('_helyseg_text', 'hovaid')
        }

        // Esketés global vegyes flag (csak ha a sor nem hozott)
        if (profile.key === 'marriage' && specialConfig.marriageVegyesGlobal && out.vegyes == null) {
          out.vegyes = true
        }

        // Konfirmáció → create_baptism_first JSONB
        if (
          profile.key === 'confirmation' &&
          specialConfig.autoCreateBaptismForConfirmation &&
          r.keresztelesideje
        ) {
          out.create_baptism_first = JSON.stringify({
            datum: r.keresztelesideje,
            helyid: out.helyid ?? null,
            lelkeszneve: out.lelkeszneve ?? null,
          })
        }

        // _csaladnev / _k_nev / _sz_datum / _ferfi → még megőrizzük
        // (a server action resolveLookups újra fel fogja oldani őket id-vé)
        for (const k of [
          '_csaladnev', '_k_nev', '_sz_datum', '_ferfi',
          '_ferfi_csaladnev', '_ferfi_k_nev', '_ferfi_sz_datum',
          '_no_csaladnev', '_no_k_nev', '_no_sz_datum',
        ]) {
          if (r[k] != null) out[k] = r[k]
        }

        return out
      })
    },
    [effectiveMapping, localityIdMap, profile, specialConfig],
  )

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
      // Először SERVER-OLDALON resolve-oljuk a person+locality-t (a wizard
      // előrebecslése csak sample-en futott — most a teljes sheet-en futtatjuk)
      // Ehhez a teljes sheet rows-t használjuk:
      const allRows = (activeSheet.sampleRows as Array<Record<string, string | number | null>>)
      // megj.: a `parseAndPreview` jelenleg max 100 sor sample-t ad — ha nagyobb XML
      // van, akkor is a sample alapján megyünk. Későbbi: szerver-oldali full-parse.

      const rpcRows = buildRpcRows(allRows)

      const formData = new FormData()
      formData.append('profileKey', profile.key)
      formData.append('rows', JSON.stringify(rpcRows))
      formData.append('defaultMunkanaploba', 'false')
      if (mode === 'admin' && selectedCongId) {
        formData.append('targetCongregationId', selectedCongId)
      }

      // SERVER-OLDALI lookup: meghívjuk a person-resolve-ot, hogy a quad-mezőkből
      // id_szemely / id_ferfi / id_no legyen
      const resolveFormData = new FormData()
      resolveFormData.append('rows', JSON.stringify(rpcRows))
      resolveFormData.append('profileKey', profile.key)
      if (mode === 'admin' && selectedCongId) {
        resolveFormData.append('targetCongregationId', selectedCongId)
      }
      // A person-link már részben elvégezte ezt — most a teljes sheet-re újra
      // (A teljesen szerver-oldali resolveolás később kerül a server action-be,
      //  most a person-link-step CSAK STATISZTIKA volt; az import maga az
      //  RPC-ből futtat resolveLookups-szal egyenértékűt.)

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
  }, [file, activeSheet, mode, selectedCongId, profile, buildRpcRows, router])

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
          onContinue={() => setStage('person-link')}
        />
      )}

      {/* 3. Person-link */}
      {stage === 'person-link' && activeSheet && (
        <PersonLinkStep
          rows={transformedRows}
          profileKey={profile.key}
          targetCongregationId={mode === 'admin' ? selectedCongId : congregationId || ''}
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

      {/* 4. Locality */}
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
