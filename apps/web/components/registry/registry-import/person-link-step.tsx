'use client'

/**
 * Anyakönyvi import wizard 3. lépés — Person-link.
 *
 * Quad-lookup-pal feloldja a tagokat (csaladnev + k_nev + sz_datum + ferfi)
 * a tagnyilvántartásból. Ha vannak nem-talált sorok, a felhasználó dönt:
 *   - Csak a talált sorok importálása (kihagyja a többit)
 *   - Vissza a szerkesztésre (módosítható az XML / mapping)
 *
 * Esketésnél (marriage profil) dual-lookup: vőlegény + menyasszony külön.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertTriangle, Users, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  resolveRegistryPersonsAction,
  type RegistryPersonResolveResult,
} from '@/lib/import/registry-person-resolve-action'
import { executeCreateMissingPersonsForRegistry } from '@/lib/import/registry-create-missing-persons-action'
import { UnresolvedCandidatesList } from './unresolved-candidates-list'

interface PersonLinkStepProps {
  /** A feltöltött fájl (a server action MAGA parse-olja a teljes sheet-et) */
  file: File
  /** Melyik sheet-et dolgozzuk fel */
  sheetName: string
  /** Az aktuális profil-kulcs */
  profileKey: string
  /** A célzott gyülekezet */
  targetCongregationId: string
  /** Manuális tag-választás state — kulcs: "rowIdx_slot", érték: szemely_id */
  manualPicks: Record<string, number>
  onPickChange: (key: string, szemelyId: number | null) => void
  onBack: () => void
  onContinue: () => void
}

export function PersonLinkStep({
  file,
  sheetName,
  profileKey,
  targetCongregationId,
  manualPicks,
  onPickChange,
  onBack,
  onContinue,
}: PersonLinkStepProps) {
  const [result, setResult] = useState<RegistryPersonResolveResult | null>(null)
  const [isResolving, startResolving] = useTransition()
  const [isCreating, startCreating] = useTransition()
  const hasRunRef = useRef(false)

  const runResolve = useCallback(() => {
    startResolving(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', sheetName)
      formData.append('profileKey', profileKey)
      formData.append('targetCongregationId', targetCongregationId)
      const res = await resolveRegistryPersonsAction(formData)
      if (res.error) {
        toast.error(res.error)
      }
      setResult(res)
    })
  }, [file, sheetName, profileKey, targetCongregationId])

  // Auto-futtatás amikor a step megnyílik (egyszer — ref-fel hogy ne triggereljen
  // re-rendert; az ESLint react-hooks/set-state-in-effect-et ezzel kerüljük el)
  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true
    runResolve()
  }, [runResolve])

  // "Új tagok létrehozása ezekhez a sorokhoz" — minimal szemely-rekordokat hoz
  // létre a NEM-talált sorokhoz (csak csaladnev/k_nev/sz_datum/ferfi). Aztán
  // automatikusan újra-futtatja a person-resolve-ot, hogy most már megtalálja őket.
  const handleCreateMissing = useCallback(() => {
    startCreating(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', sheetName)
      formData.append('profileKey', profileKey)
      formData.append('targetCongregationId', targetCongregationId)
      const res = await executeCreateMissingPersonsForRegistry(formData)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const created = res.createdCount ?? 0
      const errors = res.errorCount ?? 0
      if (created > 0) {
        toast.success(`${created} új tag létrehozva${errors > 0 ? ` (${errors} hibás sor)` : ''}.`)
      } else if (errors > 0) {
        toast.warning(`${errors} sornál nem sikerült létrehozni a tagot.`)
      }
      // Újrafuttatjuk a resolve-ot, hogy az új ID-k beépüljenek a UI-ba
      runResolve()
    })
  }, [file, sheetName, profileKey, targetCongregationId, runResolve])

  const isMarriage = profileKey === 'marriage'

  // A teljes sheet sorszáma (server-side parse-ból)
  const totalRows = result?.totalRows ?? 0
  const resolvedTotal = isMarriage
    ? (result?.dualResolvedCount ?? 0)
    : (result?.resolvedCount ?? 0)
  const unresolvedTotal = isMarriage
    ? (result?.dualPartialCount ?? 0) + (result?.unresolvedCount ?? 0)
    : (result?.unresolvedCount ?? 0)
  const allResolved = result?.success && unresolvedTotal === 0

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.25)]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-800">Tagok azonosítása</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Minden anyakönyvi bejegyzéshez megkeressük a tagnyilvántartásban
              szereplő tagot családnév + keresztnév + születési dátum alapján.
              {isMarriage && ' Esketésnél a vőlegényt és a menyasszonyt is külön azonosítjuk.'}
            </p>
          </div>
        </div>

        {isResolving && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-violet-50 p-4 text-sm text-violet-700">
            <Loader2 className="size-4 animate-spin" />
            Tagok keresése a nyilvántartásban…
          </div>
        )}

        {!isResolving && result?.error && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {result.error}
          </div>
        )}

        {!isResolving && result?.success && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-700">
                  {isMarriage ? 'Mindkét fél megvan' : 'Tag megvan'}
                </p>
              </div>
              <p className="mt-2 text-2xl font-bold text-emerald-800">
                {resolvedTotal}
                <span className="ml-1 text-sm font-normal text-emerald-600">/ {totalRows} sor</span>
              </p>
            </div>

            <div
              className={`rounded-2xl p-4 ring-1 ${
                unresolvedTotal === 0
                  ? 'bg-slate-50 ring-slate-100'
                  : 'bg-amber-50 ring-amber-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`size-5 ${unresolvedTotal === 0 ? 'text-slate-400' : 'text-amber-600'}`}
                />
                <p
                  className={`text-sm font-semibold ${
                    unresolvedTotal === 0 ? 'text-slate-600' : 'text-amber-700'
                  }`}
                >
                  Nem található tag
                </p>
              </div>
              <p
                className={`mt-2 text-2xl font-bold ${
                  unresolvedTotal === 0 ? 'text-slate-700' : 'text-amber-800'
                }`}
              >
                {unresolvedTotal}
                <span
                  className={`ml-1 text-sm font-normal ${
                    unresolvedTotal === 0 ? 'text-slate-500' : 'text-amber-600'
                  }`}
                >
                  / {totalRows} sor
                </span>
              </p>
            </div>
          </div>
        )}

        {/* ELSŐDLEGES ÚT: Manuális tag-pick — TOP-5 jelölt pontszámmal.
            Ez a legtöbb esetben a megfelelő megoldás: a tagok már a rendszerben
            vannak, csak az automata quad-lookup nem találta meg őket
            (elírás, becenév, lánykori név stb.). */}
        {!isResolving && unresolvedTotal > 0 && (
          <div className="mt-4">
            <UnresolvedCandidatesList
              file={file}
              sheetName={sheetName}
              profileKey={profileKey}
              targetCongregationId={targetCongregationId}
              manualPicks={manualPicks}
              onPickChange={onPickChange}
            />
          </div>
        )}

        {/* MÁSODLAGOS ÚT: ha tényleg nem szerepelnek a tagnyilvántartásban,
            akkor itt lehet egyszerre létrehozni őket. */}
        {!isResolving && result?.unresolvedExamples && result.unresolvedExamples.length > 0 && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-700">
              Csak ha biztosan nincs még a rendszerben
            </p>
            <p className="mt-1 text-xs text-slate-600">
              A fenti listából a megfelelő tagot kiválasztva az anyakönyvi
              bejegyzés a már létező taghoz kapcsolódik. <strong>Ezt válaszd
              először</strong>, mert a legtöbb keresztelt/konfirmált tag már a
              tagnyilvántartásban van — csak az automatikus kereső nem találta
              meg pontosan (pl. elírás, becenév, lánykori név miatt).
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Az alábbi gomb csak <strong>végső megoldás</strong>: ha tényleg
              nincs még tag a rendszerben, akkor felveszi a maradék nem-talált
              sorokhoz a minimális adatokat (név, születési dátum, nem). A
              többi adat (lakcím, családszerkezet stb.) később pótolható a
              tagnyilvántartásban.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Mely sorok érintettek? ({result.unresolvedExamples.length} példa)
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {result.unresolvedExamples.map((ex, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-slate-400">{ex.rowIndex}.</span>
                    <span>{ex.description}</span>
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateMissing}
                disabled={isCreating || isResolving}
                className="rounded-full border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Új tagok felvétele…
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-1.5 size-4" />
                    Új tagok felvétele a maradék sorokhoz (végső megoldás)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Speciális üzenet: minden megvan */}
        {!isResolving && allResolved && (
          <div className="mt-4 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-800">
            ✨ Minden anyakönyvi bejegyzéshez megtaláltunk egy tagot. Mehetünk tovább!
          </div>
        )}
      </div>

      {/* Navigáció */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="rounded-full"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>

        <Button
          type="button"
          onClick={onContinue}
          disabled={isResolving || !result?.success || resolvedTotal === 0}
          className="rounded-full bg-violet-600 hover:bg-violet-700"
        >
          {resolvedTotal === 0 ? (
            'Egyetlen tag sem található'
          ) : (
            <>
              {unresolvedTotal > 0
                ? `Tovább a ${resolvedTotal} talált sorral`
                : 'Tovább'}
              <ArrowRight className="ml-1.5 size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
