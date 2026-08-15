'use client'

/**
 * BEKÜLDÖTT IRATOK ARCHÍVUMA — egyházmegyei felület (2026-08-15, terv 3.2).
 *
 * ENDRE KÖVETELMÉNYE: „a beküldött hivatalos iratok gyülekezetenként, ÉVEKRE
 * VISSZAMENŐLEG, átláthatóan" — mind a HAT irat-típusra (számadás,
 * költségvetés, költségvetés-módosítás, vagyonleltári jelentés, választók
 * névjegyzéke, LELKÉSZI JELENTÉS).
 *
 * MIÉRT KÜLÖN FELÜLET a dashboard „Dokumentumok" füle mellett: az ottani
 * dokumentumközpont MUNKA-felület (a folyó szezon iratainak átvétele,
 * ellenőrzése, továbbítása). Ez itt ARCHÍVUM: a hangsúly a gyülekezeti
 * DOSSZIÉN és az évek egymásutánján van — az esperes ebben keresi vissza,
 * mit adott le egy gyülekezet öt éve. A két nézet UGYANAZT az adatcsomagot és
 * UGYANAZT a pillanatkép-nézőt használja (közös komponens, nem másolat).
 *
 * ENDRE 2. DÖNTÉSE: az archívum CSAK a rendszerből véglegesített (és így
 * beküldött) iratokat tartalmazza — papír-alapú korábbi évek kézi feltöltése
 * NEM része ennek a körnek. Ezt a felület ki is mondja, hogy senki ne higgye
 * hiánynak azt, ami sosem került a rendszerbe.
 */

import { useMemo, useState } from 'react'
import {
  Archive,
  Building2,
  CalendarRange,
  ChevronDown,
  FileText,
  Info,
  Search,
  TriangleAlert,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SnapshotDialog, STATUS_UI } from '@/components/dashboard/document-center'
import type { DocumentCenterData } from '@/app/(dashboard)/dashboard-egyhazmegye/document-shared'
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentSubmission,
  type DocumentType,
} from '@/lib/constants/documents'

/** A hat hivatalos irat-típus — az archívum oszlop-sorrendje. */
const ARCHIVUM_TIPUSOK: DocumentType[] = [
  'szamadas',
  'koltsegvetes',
  'koltsegvetes_modositas',
  'vagyonleltar',
  'valasztok_nevjegyzeke',
  'lelkeszi_jelentes',
]

type Nezet = 'gyulekezet' | 'ev'

interface Props {
  data: DocumentCenterData
}

function datum(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

function tipusCimke(sub: DocumentSubmission): string {
  const alap = DOCUMENT_TYPE_LABELS[sub.document_type as DocumentType] || String(sub.document_type)
  return sub.modification_number ? `${alap} (${sub.modification_number}.)` : alap
}

function StatuszJelveny({ status }: { status: DocumentStatus }) {
  const ui = STATUS_UI[status]
  if (!ui) return <span className="text-xs text-muted-foreground">{status}</span>
  const Ikon = ui.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ui.className}`}
    >
      <Ikon className="size-3" />
      {ui.label}
    </span>
  )
}

export function DioceseArchivumView({ data }: Props) {
  const [nezet, setNezet] = useState<Nezet>('gyulekezet')
  const [kereses, setKereses] = useState('')
  const [tipusSzuro, setTipusSzuro] = useState<DocumentType | 'mind'>('mind')
  const [evSzuro, setEvSzuro] = useState<number | 'mind'>('mind')
  const [nyitottGyulekezet, setNyitottGyulekezet] = useState<string | null>(null)
  const [megnyitott, setMegnyitott] = useState<DocumentSubmission | null>(null)

  const bekuldesek = data.submissions

  const evek = useMemo(() => {
    const halmaz = new Set<number>()
    for (const s of bekuldesek) if (typeof s.year === 'number') halmaz.add(s.year)
    return [...halmaz].sort((a, b) => b - a)
  }, [bekuldesek])

  const szurt = useMemo(() => {
    return bekuldesek.filter((s) => {
      if (tipusSzuro !== 'mind' && s.document_type !== tipusSzuro) return false
      if (evSzuro !== 'mind' && s.year !== evSzuro) return false
      return true
    })
  }, [bekuldesek, tipusSzuro, evSzuro])

  /** Gyülekezetenkénti dosszié: a hatókör TELJES listája (nem a beküldőkből). */
  const dossziek = useMemo(() => {
    const q = kereses.trim().toLowerCase()
    const tetelek = new Map<string, DocumentSubmission[]>()
    for (const s of szurt) {
      const lista = tetelek.get(s.congregation_id)
      if (lista) lista.push(s)
      else tetelek.set(s.congregation_id, [s])
    }
    return data.congregations
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => {
        const iratok = (tetelek.get(c.id) || []).slice().sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year
          return (b.submitted_at || '').localeCompare(a.submitted_at || '')
        })
        const evekLista = [...new Set(iratok.map((s) => s.year))].sort((a, b) => b - a)
        return { id: c.id, nev: c.name, iratok, evek: evekLista }
      })
      .sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
  }, [data.congregations, szurt, kereses])

  /** Év-nézet: évenként gyülekezet × típus mátrix. */
  const evNezet = useMemo(() => {
    const q = kereses.trim().toLowerCase()
    const gyulekezetek = data.congregations
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
    const evLista = evSzuro === 'mind' ? evek : [evSzuro]
    return evLista.map((e) => ({
      ev: e,
      sorok: gyulekezetek.map((c) => {
        const cellak = new Map<DocumentType, DocumentSubmission>()
        for (const s of szurt) {
          if (s.congregation_id !== c.id || s.year !== e) continue
          const tipus = s.document_type as DocumentType
          const elozo = cellak.get(tipus)
          // Több módosítás esetén a legfrissebb beküldés jelvénye látszik.
          if (!elozo || (s.submitted_at || '') > (elozo.submitted_at || '')) cellak.set(tipus, s)
        }
        return { id: c.id, nev: c.name, cellak }
      }),
    }))
  }, [data.congregations, szurt, evek, evSzuro, kereses])

  const osszesIrat = bekuldesek.length

  return (
    <div className="space-y-4">
      {/* ── Fail-closed hibasáv ─────────────────────────────────────────── */}
      {data.error && (
        <div className="card-raised rounded-2xl border-amber-300/60 p-4 dark:border-amber-400/30">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">{data.error}</p>
          </div>
        </div>
      )}

      {data.scopeNotice && (
        <p className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
          {data.scopeNotice}
        </p>
      )}

      {/* ── Szűrő-sáv ───────────────────────────────────────────────────── */}
      <div className="card-raised space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Archive className="size-4 text-teal-600" />
          <p className="text-base font-semibold text-foreground">Beküldött iratok archívuma</p>
          <Badge variant="outline" className="rounded-full border-border text-muted-foreground">
            {osszesIrat.toLocaleString('hu-HU')} irat · {evek.length} év
          </Badge>
          <div className="ml-auto flex gap-1.5">
            <NezetGomb aktiv={nezet === 'gyulekezet'} onClick={() => setNezet('gyulekezet')}>
              <Building2 className="mr-1 size-3.5" />
              Gyülekezetenként
            </NezetGomb>
            <NezetGomb aktiv={nezet === 'ev'} onClick={() => setNezet('ev')}>
              <CalendarRange className="mr-1 size-3.5" />
              Évenként
            </NezetGomb>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Keresés gyülekezet neve szerint…"
            value={kereses}
            onChange={(e) => setKereses(e.target.value)}
            className="h-9 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <SzuroChip aktiv={tipusSzuro === 'mind'} onClick={() => setTipusSzuro('mind')}>
            Minden irat
          </SzuroChip>
          {ARCHIVUM_TIPUSOK.map((t) => (
            <SzuroChip key={t} aktiv={tipusSzuro === t} onClick={() => setTipusSzuro(t)}>
              {DOCUMENT_TYPE_LABELS[t]}
            </SzuroChip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <SzuroChip aktiv={evSzuro === 'mind'} onClick={() => setEvSzuro('mind')}>
            Minden év
          </SzuroChip>
          {evek.map((e) => (
            <SzuroChip key={e} aktiv={evSzuro === e} onClick={() => setEvSzuro(e)}>
              {e}.
            </SzuroChip>
          ))}
        </div>

        {/* Endre 2. döntése — kimondva, hogy a hiány ne tűnjön adatvesztésnek. */}
        <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Az archívum azokat az iratokat tartalmazza, amelyeket a gyülekezetek a rendszerben
          véglegesítettek és beküldtek. A rendszer bevezetése előtti, papíron leadott évek nincsenek
          benne — azok kézi feltöltése egy későbbi bővítés.
        </p>
      </div>

      {/* ── GYÜLEKEZETENKÉNTI DOSSZIÉ ───────────────────────────────────── */}
      {nezet === 'gyulekezet' && (
        <div className="space-y-3">
          {dossziek.length === 0 ? (
            <UresAllapot szoveg="Nincs a keresésnek megfelelő gyülekezet." />
          ) : (
            dossziek.map((d) => {
              const nyitva = nyitottGyulekezet === d.id
              return (
                <div key={d.id} className="card-raised overflow-hidden rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setNyitottGyulekezet(nyitva ? null : d.id)}
                    className="flex w-full items-center gap-3 p-4 text-left max-sm:min-h-12"
                  >
                    <div className="rounded-xl bg-teal-50 p-2 dark:bg-teal-400/10">
                      <Building2 className="size-4 text-teal-600 dark:text-teal-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{d.nev}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {d.iratok.length === 0
                          ? 'Nincs beküldött irat ebben a szűrésben'
                          : `${d.iratok.length} irat · ${d.evek.length} év (${d.evek[d.evek.length - 1]}–${d.evek[0]})`}
                      </p>
                    </div>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${nyitva ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {nyitva && (
                    <div className="border-t border-border p-4 pt-3">
                      {d.iratok.length === 0 ? (
                        <p className="text-sm italic text-muted-foreground">
                          Ez a gyülekezet a jelenlegi szűrésben nem küldött be iratot.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {d.evek.map((e) => (
                            <div key={e}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {e}. év
                              </p>
                              <ul className="mt-1.5 space-y-1.5">
                                {d.iratok
                                  .filter((s) => s.year === e)
                                  .map((s) => (
                                    <li key={s.id}>
                                      <button
                                        type="button"
                                        onClick={() => setMegnyitott(s)}
                                        className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-left transition hover:bg-muted/40 max-sm:min-h-11"
                                      >
                                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                        <span className="text-sm text-foreground">{tipusCimke(s)}</span>
                                        <StatuszJelveny status={s.status as DocumentStatus} />
                                        <span className="ml-auto text-xs text-muted-foreground">
                                          Beküldve: {datum(s.submitted_at)}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── ÉVENKÉNTI MÁTRIX ────────────────────────────────────────────── */}
      {nezet === 'ev' && (
        <div className="space-y-4">
          {evNezet.length === 0 ? (
            <UresAllapot szoveg="Ebben a szűrésben nincs beküldött irat." />
          ) : (
            evNezet.map((blokk) => (
              <div key={blokk.ev} className="card-raised overflow-hidden rounded-2xl">
                <p className="border-b border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-foreground">
                  {blokk.ev}. év
                </p>
                {/* A mátrix SAJÁT vízszintes görgetőben — az oldal törzse nem
                    görgethet oldalra (mobil-first követelmény). */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">
                          Gyülekezet
                        </th>
                        {ARCHIVUM_TIPUSOK.map((t) => (
                          <th key={t} className="p-2 text-left text-xs font-medium text-muted-foreground">
                            {DOCUMENT_TYPE_LABELS[t]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {blokk.sorok.map((sor) => (
                        <tr key={sor.id}>
                          <td className="p-2 text-foreground">{sor.nev}</td>
                          {ARCHIVUM_TIPUSOK.map((t) => {
                            const s = sor.cellak.get(t)
                            return (
                              <td key={t} className="p-2">
                                {s ? (
                                  <button
                                    type="button"
                                    onClick={() => setMegnyitott(s)}
                                    className="rounded-full"
                                    title={`${tipusCimke(s)} — beküldve: ${datum(s.submitted_at)}`}
                                  >
                                    <StatuszJelveny status={s.status as DocumentStatus} />
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Hiányzik</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* A KÖZÖS pillanatkép-néző (idővonal + napló + nyomtatás). */}
      <SnapshotDialog sub={megnyitott} level="diocese" onClose={() => setMegnyitott(null)} />
    </div>
  )
}

function NezetGomb({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-xl border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-10 ${
        aktiv
          ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/15 dark:text-teal-300'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function SzuroChip({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-9 ${
        aktiv
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function UresAllapot({ szoveg }: { szoveg: string }) {
  return (
    <div className="card-raised rounded-2xl p-8 text-center">
      <Archive className="mx-auto size-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">{szoveg}</p>
    </div>
  )
}
