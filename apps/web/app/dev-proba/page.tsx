'use client'

// ═══════════════════════════════════════════════════════════════════════════
// FEJLESZTŐI PRÓBAPAD (2026-08-25) — KIZÁRÓLAG development módban érhető el
// (a middleware isDevProbapadRoute kapuja; élesben a normál auth-kapu él).
//
// Célja: auth nélküli, mock-adatos, IZOLÁLT reprodukció a beépített
// böngészőben — jelenleg: (1) a lelkészi jelentés PDF-render útjai
// (per-lap / legacy, datauri-ként megjelenítve), (2) a Szervezeti forma
// dialógus túlcsordulás-hibája.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { buildLelkesziJelentesHtml } from '@/lib/lelkeszi-jelentes/print'
import type { LelkesziJelentesData } from '@/lib/lelkeszi-jelentes/types'
import { printToPdfProba } from '@/lib/utils/print-engine-v2'
import { KotesDialog, type AnyaJelolt } from '@/components/admin/szervezet/kotes-dialog'
import type { FaGyulekezet } from '@/app/(dashboard)/admin/szervezet-shared'

// Endre képernyőjéhez hasonló, jórészt üres jelentés-adat (I.10/I.11 kitöltve)
function mockJelentes(): LelkesziJelentesData {
  const auto: Record<string, number | string | null> = {}
  for (const id of ['I.2a', 'I.2b', 'I.2c', 'I.3a', 'I.3b', 'I.3c', 'I.8', 'I.9', 'I.16', 'I.17']) auto[id] = 0
  auto['I.10'] = 546
  auto['I.11'] = 412
  return {
    ev: 2026,
    congregationName: 'Barátosi Református Egyházközség',
    egyhazmegyeNev: 'Kézdi-Orbai Református Egyházmegye',
    submission: null,
    auto,
    kezi: {},
    felulirasok: {},
    hatarozat: {},
    statusz: 'szerkesztes',
    tobbEvesAdatok: [
      { ev: 2024, mezok: { 'I.10': 552, 'I.2c': 4, 'I.3c': 9, 'II.1a': 52, 'II.1b': 41, 'II.1c': 7.4, 'II.12': 6, 'V.3': 30, 'III.7': 24, 'VII.1': 21500, 'VII.3': 8300, 'VII.8': 5400 } },
      { ev: 2025, mezok: { 'I.10': 549, 'I.2c': 3, 'I.3c': 7, 'II.1a': 53, 'II.1b': 40, 'II.1c': 7.3, 'II.12': 6, 'V.3': 31, 'III.7': 26, 'VII.1': 22100, 'VII.3': 8650, 'VII.8': 6100 } },
    ],
    veglegesitveAt: null,
  }
}

const mockGyulekezet = {
  id: '00000000-0000-4000-8000-000000000001',
  nev: 'Bákói Református Missziói Egyházközség',
  dioceseId: null,
  tagszam: 120,
  felhasznalok: 1,
  szerepek: [],
  aktiv: true,
  utolsoAktivitas: null,
  hianyzoMezok: [],
  szervezetiTipus: 'misszioi',
  anyaId: undefined,
  lelkeszNevek: 'Teszt Lelkész',
  egysegek: [],
} as unknown as FaGyulekezet

const mockJeloltek: AnyaJelolt[] = [
  { id: '00000000-0000-4000-8000-000000000002', nev: 'Példa Anyaegyházközség' },
  { id: '00000000-0000-4000-8000-000000000003', nev: 'Másik Példa Egyházközség' },
]

export default function DevProbaPage() {
  // Éles buildben a lap üres tájékoztató — a middleware amúgy is auth mögé teszi.
  if (process.env.NODE_ENV !== 'development') {
    return <p className="p-6 text-sm text-muted-foreground">A próbapad csak fejlesztői módban érhető el.</p>
  }
  return <ProbaTartalom />
}

function ProbaTartalom() {
  const [pdfUri, setPdfUri] = useState<string | null>(null)
  const [reszletek, setReszletek] = useState<string[]>([])
  const [hiba, setHiba] = useState<string | null>(null)
  const [fut, setFut] = useState(false)
  const [htmlElonezet, setHtmlElonezet] = useState<string | null>(null)
  const [kotesNyitva, setKotesNyitva] = useState(false)

  async function futtat(forceLegacy: boolean) {
    setFut(true)
    setHiba(null)
    setPdfUri(null)
    setReszletek([])
    try {
      const html = buildLelkesziJelentesHtml(mockJelentes())
      const res = await printToPdfProba(html, { forceLegacy })
      setPdfUri(res.dataUri)
      setReszletek([`mód: ${res.mod}`, ...res.reszletek, `datauri hossza: ${res.dataUri.length}`])
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setFut(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-bold">Fejlesztői próbapad</h1>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">1. Lelkészi jelentés — PDF-render próba</h2>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-border bg-muted px-3 py-2 text-sm" disabled={fut}
            onClick={() => setHtmlElonezet(buildLelkesziJelentesHtml(mockJelentes()))}>
            HTML előnézet
          </button>
          <button className="rounded-md border border-border bg-muted px-3 py-2 text-sm" disabled={fut}
            onClick={() => futtat(false)}>
            {fut ? 'Renderelés…' : 'PDF próba (normál út)'}
          </button>
          <button className="rounded-md border border-border bg-muted px-3 py-2 text-sm" disabled={fut}
            onClick={() => futtat(true)}>
            PDF próba (kényszerített legacy)
          </button>
        </div>
        {hiba && <p className="rounded-md bg-red-100 p-2 text-sm text-red-800">HIBA: {hiba}</p>}
        {reszletek.length > 0 && (
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs" data-proba="reszletek">
            {reszletek.join('\n')}
          </pre>
        )}
        {pdfUri && (
          <iframe title="PDF eredmény" src={pdfUri} className="h-[900px] w-full rounded-md border border-border bg-white" />
        )}
        {htmlElonezet && !pdfUri && (
          <iframe title="HTML előnézet" srcDoc={htmlElonezet} className="h-[900px] w-full rounded-md border border-border bg-white" />
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">2. Szervezeti forma dialógus (túlcsordulás-próba)</h2>
        <button className="rounded-md border border-border bg-muted px-3 py-2 text-sm" onClick={() => setKotesNyitva(true)}>
          Dialógus megnyitása
        </button>
        <KotesDialog
          gyulekezet={kotesNyitva ? mockGyulekezet : null}
          anyaJeloltek={mockJeloltek}
          onOpenChange={(o) => setKotesNyitva(o)}
          onSaved={() => setKotesNyitva(false)}
        />
      </section>
    </div>
  )
}
