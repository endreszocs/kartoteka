'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  Landmark,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react'

import { getCongregations } from '@/app/(dashboard)/admin/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportLogList } from './import-log-list'

type ImportType = 'income' | 'worklog' | 'baptism' | 'filing'
type ExtendedImportType = ImportType | 'members' | 'inventory' | 'finance'

interface CongregationOption {
  id: string
  nev_hu?: string | null
  name?: string | null
  dioceses?: { name?: string | null } | { name?: string | null }[] | null
}

const IMPORT_TYPES: {
  value: ExtendedImportType
  label: string
  desc: string
  formats: string[]
  features: string[]
}[] = [
  {
    value: 'income',
    label: 'Bevetel (Kassza)',
    desc: 'Befizetesek importja szemelyparositassal es kategoriakodokkal.',
    formats: ['.xlsx', '.xls'],
    features: ['Szemelyparositas', 'Ev es osszeg ellenorzes', 'Befizetesi cel validalas'],
  },
  {
    value: 'worklog',
    label: 'Munkanaplo',
    desc: 'EREK sablon es egyedi Excel munkanaplo eloellenorzes.',
    formats: ['.xlsx', '.xls'],
    features: ['Sablonfelismeres', 'Datumellenorzes', 'Szolgalati tipusok egyeztetese'],
  },
  {
    value: 'baptism',
    label: 'Kereszteles',
    desc: 'Anyakonyvi keresztelesi adatok import-elokeszitese fuzzy szemelyegyeztetessel.',
    formats: ['.xlsx', '.xls'],
    features: ['Fuzzy nevparositas', 'Szuletesi datum kontroll', 'Anyakonyvi mezoellenorzes'],
  },
  {
    value: 'filing',
    label: 'Iktatas',
    desc: 'Iktatoszamok es targymezoek strukturalt importja.',
    formats: ['.xlsx', '.xls', '.csv'],
    features: ['Iktatoszam-szetbontas', 'Sorszam validalas', 'Targykivonat ellenorzes'],
  },
  {
    value: 'members',
    label: 'Szemelyek es csaladok',
    desc: 'Tagok, csaladok es kapcsolodo torzsadatok labor-importja.',
    formats: ['.xlsx', '.xls', '.csv'],
    features: ['Torzsadat-ellenorzes', 'Csaladkapcsolatok validalasa', 'CNP es duplikacio kontroll'],
  },
  {
    value: 'inventory',
    label: 'Leltar',
    desc: 'Leltari tetelek, targycsoportok es ertekek kontrollalt betoltese.',
    formats: ['.xlsx', '.xls', '.csv'],
    features: ['Ertek-ellenorzes', 'Targykategoria normalizalas', 'Hianyzo mezo diagnosztika'],
  },
  {
    value: 'finance',
    label: 'Penzugyi batch',
    desc: 'Nagy mennyisegu penzugyi adatok labor-importja eloellenorzessel.',
    formats: ['.xlsx', '.xls', '.csv'],
    features: ['Celkod-validalas', 'Iratszam kontroll', 'Szemely es csalad parositas'],
  },
] as const

function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? `.${parts.pop()}` : ''
}

function getDioceseLabel(value: CongregationOption['dioceses']) {
  if (!value) return 'Nincs egyhazmegye megadva'
  if (Array.isArray(value)) return value[0]?.name || 'Nincs egyhazmegye megadva'
  return value.name || 'Nincs egyhazmegye megadva'
}

export function ImportTabRefined({ isGodMode = false }: { isGodMode?: boolean }) {
  const [selectedType, setSelectedType] = useState<ExtendedImportType>('income')
  const [congregations, setCongregations] = useState<CongregationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCongregation, setSelectedCongregation] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    getCongregations()
      .then((result) => {
        if ('data' in result) {
          setCongregations((result.data || []) as CongregationOption[])
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const activeType = useMemo(
    () => IMPORT_TYPES.find((item) => item.value === selectedType) || IMPORT_TYPES[0],
    [selectedType]
  )

  const selectedCongregationMeta = congregations.find((item) => item.id === selectedCongregation)
  const selectedExtension = selectedFile ? getFileExtension(selectedFile.name) : ''
  const isSupportedFormat = selectedFile ? activeType.formats.includes(selectedExtension) : false
  const isLargeFile = selectedFile ? selectedFile.size > 10 * 1024 * 1024 : false
  const isPreflightReady = Boolean(selectedCongregation && selectedFile && isSupportedFormat && !isLargeFile)

  return (
    <div className="mt-4 space-y-6">
      <div className="card-raised relative overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700/70">Admin import labor</p>
            <h3 className="font-heading text-3xl text-slate-800">Tomeges adatimport elokeszitese</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              A parser- es batch-import motor migracioja meg folyamatban van. A tenyleges laborimport csak aktiv rendszergazdai modban erheto el,
              de az eloellenorzes es a kovetelmenyek attekintese mar most is hasznalhato.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <HeroStat label="Importtipus" value={IMPORT_TYPES.length} hint="labor profillal" icon={FileSpreadsheet} />
            <HeroStat label="Gyulekezet" value={congregations.length} hint="valaszthato celhely" icon={Landmark} />
            <HeroStat label="Allapot" value={isGodMode ? 'aktiv' : 'zarva'} hint={isGodMode ? 'labor mód nyitva' : 'rendszergazdai mód kell'} icon={FlaskConical} />
          </div>
        </div>
      </div>

      <div className={`rounded-[1.5rem] border p-4 text-sm leading-relaxed ${
        isGodMode
          ? 'border-emerald-200 bg-emerald-50/85 text-emerald-800'
          : 'border-red-200 bg-red-50/85 text-red-800'
      }`}>
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {isGodMode ? 'A labor-import jelenleg engedelyezett.' : 'A labor-import jelenleg zarolt.'}
            </p>
            <p className="mt-1">
              {isGodMode
                ? 'Ebben a munkamenetben a nagy mennyisegu, erzekeny importok elokeszitese es diagnosztikaja futtathato.'
                : 'A tenyleges tomeges importok csak aktiv rendszergazdai mod mellett indulhatnak, hogy az erzekeny adatok vedettek maradjanak.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.15fr]">
        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-800">Importtipusok</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {IMPORT_TYPES.map((item) => {
              const active = item.value === selectedType

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setSelectedType(item.value)
                    setSelectedFile(null)
                  }}
                  className={`rounded-[1.4rem] border p-4 text-left transition ${
                    active
                      ? 'border-indigo-200 bg-indigo-50/85 shadow-[0_22px_44px_-34px_rgba(79,70,229,0.36)]'
                      : 'border-white/70 bg-white/85 hover:border-slate-200 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                    </div>
                    {active && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-indigo-600" />}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.formats.map((format) => (
                      <span
                        key={format}
                        className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-800">Eloellenorzes es keszenlet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cel gyulekezet
                </label>
                <select
                  value={selectedCongregation}
                  onChange={(event) => setSelectedCongregation(event.target.value)}
                  disabled={!isGodMode}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white/85 px-4 text-sm text-slate-700 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)] outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/60"
                >
                  <option value="">Valasszon gyulekezetet...</option>
                  {congregations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {(item.nev_hu || item.name || 'Ismeretlen gyulekezet')} · {getDioceseLabel(item.dioceses)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Feltoltendo fajl
                </label>
                <label className="flex h-11 cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white/82 px-4 text-sm text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/40">
                  <span className="truncate pr-3">
                    {selectedFile ? selectedFile.name : `Valasszon ${activeType.formats.join(', ')} fajlt`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <Upload className="size-3.5" />
                    Tallozas
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept={activeType.formats.join(',')}
                    disabled={!isGodMode}
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ReadyState
                label="Fajleloellenorzes"
                state={!isGodMode ? 'warning' : selectedFile ? (isSupportedFormat && !isLargeFile ? 'ready' : 'warning') : 'idle'}
                description={!isGodMode ? 'A labor mod nincs aktiválva.' : selectedFile ? (isSupportedFormat ? 'Formatum elfogadva' : 'Nem tamogatott kiterjesztes') : 'Meg nincs fajl kivalasztva'}
              />
              <ReadyState
                label="Parser es elonezet"
                state={isGodMode ? 'warning' : 'idle'}
                description={isGodMode ? 'A migracios motor meg nincs teljesen bekotve.' : 'Eloszor aktivald a rendszergazdai modot.'}
              />
              <ReadyState
                label="Batch import"
                state={isGodMode ? 'warning' : 'idle'}
                description={isGodMode ? 'A vegleges tomeges betoltes kovetkezo fazisban aktivalhato.' : 'Erzekeny import, csak labor modban.'}
              />
            </div>

            <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Aktiv importprofil</p>
              <h4 className="mt-2 text-lg font-semibold text-slate-800">{activeType.label}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{activeType.desc}</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {activeType.features.map((feature) => (
                  <div key={feature} className="rounded-2xl bg-white/85 px-3 py-2 text-sm text-slate-700 shadow-[0_18px_34px_-34px_rgba(15,23,42,0.25)]">
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card className="border-0 bg-white/70 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.24)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-800">Kijelolt celpont</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  {loading ? (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="size-4 animate-spin" />
                      Gyulekezetek betoltese...
                    </div>
                  ) : selectedCongregationMeta ? (
                    <>
                      <p className="font-semibold text-slate-800">
                        {selectedCongregationMeta.nev_hu || selectedCongregationMeta.name || 'Ismeretlen gyulekezet'}
                      </p>
                      <p>{getDioceseLabel(selectedCongregationMeta.dioceses)}</p>
                    </>
                  ) : (
                    <p>Meg nincs kivalasztott gyulekezet.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 bg-white/70 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.24)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-800">Fajl-diagnosztika</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  {selectedFile ? (
                    <>
                      <DiagnosticRow label="Fajlnev" value={selectedFile.name} />
                      <DiagnosticRow label="Kiterjesztes" value={selectedExtension || 'ismeretlen'} />
                      <DiagnosticRow label="Meret" value={`${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`} />
                      <DiagnosticRow
                        label="Formatum"
                        value={isSupportedFormat ? 'Tamogatott' : 'Nem tamogatott'}
                        emphasis={isSupportedFormat ? 'success' : 'danger'}
                      />
                      <DiagnosticRow
                        label="Meretkorlat"
                        value={isLargeFile ? '10 MB folott van' : 'Rendben'}
                        emphasis={isLargeFile ? 'danger' : 'success'}
                      />
                    </>
                  ) : (
                    <p>Meg nincs kivalasztott fajl.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className={`rounded-[1.4rem] border p-4 text-sm leading-relaxed ${
              isGodMode && isPreflightReady
                ? 'border-emerald-100 bg-emerald-50/80 text-emerald-800'
                : 'border-amber-100 bg-amber-50/80 text-amber-800'
            }`}>
              <div className="flex items-start gap-2">
                {isPreflightReady ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">
                    {isGodMode && isPreflightReady ? 'Az eloellenorzes kesz a kovetkezo migracios korhoz.' : 'Meg hianyzik nehany feltetel az eloellenorzes lezarasahoz.'}
                  </p>
                  <p className="mt-1">
                    {isGodMode && isPreflightReady
                      ? 'A gyulekezet es a fajl kivalasztasa rendben van. A kovetkezo fejlesztesi korben erre mar kozvetlen parser- es preview-motor epitheto.'
                      : !isGodMode
                        ? 'Aktivald a rendszergazdai modot, es utana valassz ki egy gyulekezetet es egy tamogatott fajlt.'
                        : 'Valasszon ki egy gyulekezetet es egy tamogatott fajlt, hogy az import elokeszitese teljes legyen.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* E1 — Import előzmények */}
      <div className="mt-6">
        <ImportLogList />
      </div>
    </div>
  )
}

function HeroStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: number | string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-[1.35rem] bg-white/78 px-4 py-3 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  )
}

function ReadyState({
  label,
  state,
  description,
}: {
  label: string
  state: 'idle' | 'ready' | 'warning'
  description: string
}) {
  const stateMap = {
    idle: 'bg-slate-50 text-slate-700',
    ready: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  } as const

  const labelMap = {
    idle: 'Varakozik',
    ready: 'Kesz',
    warning: 'Migracio alatt',
  } as const

  return (
    <div className={`rounded-[1.3rem] px-4 py-3 ${stateMap[state]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">{labelMap[state]}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed opacity-85">{description}</p>
    </div>
  )
}

function DiagnosticRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: 'success' | 'danger'
}) {
  const emphasisClass =
    emphasis === 'success'
      ? 'text-emerald-700'
      : emphasis === 'danger'
        ? 'text-rose-600'
        : 'text-slate-700'

  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-medium ${emphasisClass}`}>{value}</span>
    </div>
  )
}
