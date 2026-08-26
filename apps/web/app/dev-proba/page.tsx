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
// 2026-08-27 (leltár-import varázsló): a lépés-jelző, az összegző csempék és a
// sorlista MOCK adatokkal — a valódi képernyő auth mögött van, itt viszont
// ellenőrizhető a látvány (világos/sötét téma, telefon-szélesség).
import {
  Leltar343Stepper,
  Leltar343Osszegzo,
  Leltar343SorLista,
} from '@/components/inventory/leltar343-import-wizard'
import {
  ellenorizSorok,
  osztSzamokat,
  type Leltar343Javitasok,
  type Leltar343ReviewSor,
} from '@/lib/inventory/leltar343-review'
import { alkalmazJavitasok } from '@/lib/inventory/leltar343-review'
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

function mockReviewSor(
  sor: number,
  extra: Partial<Leltar343ReviewSor> = {},
): Leltar343ReviewSor {
  return {
    id: `Csekely_erteku_targyak:${sor}`,
    lap: 'Csekely_erteku_targyak',
    lapCimke: 'Csekély értékű leltári tárgyak',
    sor,
    kategoria: 'csekely',
    megnevezes: 'Éjjeliszekrény',
    szerzo: null,
    megjegyzes: null,
    leltari_szam: `II./A/6 - ${sor}`,
    helyszin: 'Parókia',
    felelos_neve: 'Szőcs Endre',
    beszerzes_datuma: '2019-01-01',
    beszerzesi_ertek: 350,
    mennyiseg: 1,
    mertekegyseg: 'db',
    beszerzes_bizonylat: 'Sz-12',
    torles_datuma: null,
    torles_bizonylat: null,
    is_deleted: false,
    hasznalati_ido_ev: null,
    alapeszkoz_csoport: null,
    ertek_modositas: 0,
    ertek_modositas_megjegyzes: null,
    uzenetek: [],
    elutasitott: false,
    feloldas: 'import',
    ...extra,
  }
}

const MOCK_SOROK: Leltar343ReviewSor[] = [
  mockReviewSor(5),
  mockReviewSor(6, { megnevezes: 'Szőnyeg', leltari_szam: 'II./A/6 - 6', beszerzesi_ertek: 0,
    uzenetek: [{ szint: 'figyelmeztetes', kod: 'hianyzo_ertek', uzenet: 'Hiányzó vagy 0 beszerzési érték.' }] }),
  mockReviewSor(7, { megnevezes: 'Pad', leltari_szam: 'II./B/e - 23' }),
  mockReviewSor(8, { megnevezes: '', leltari_szam: null, elutasitott: true, feloldas: 'kihagy',
    uzenetek: [{ szint: 'hiba', kod: 'hianyzo_megnevezes', uzenet: 'Hiányzó megnevezés — a sor kimaradt.' }] }),
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
  const [probaLepes, setProbaLepes] = useState<1 | 2 | 3 | 4>(2)
  const [probaJavitasok, setProbaJavitasok] = useState<Leltar343Javitasok>({})
  const [nyitottSor, setNyitottSor] = useState<string | null>(null)
  const [probaZarolt, setProbaZarolt] = useState(false)

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

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">3. Leltár-import varázsló (mock adatokkal)</h2>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
              onClick={() => setProbaLepes(n as 1 | 2 | 3 | 4)}
            >
              {n}. lépés
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={probaZarolt}
              onChange={(e) => setProbaZarolt(e.target.checked)}
            />
            Véglegesített év (zárolt felülírás)
          </label>
        </div>
        {(() => {
          const sorok = alkalmazJavitasok(MOCK_SOROK, probaJavitasok)
          const ctx = {
            aktivSzamok: ['II./B/e - 23'],
            kivezetettSzamok: [] as string[],
            veglegesitve: probaZarolt,
          }
          const ellenorzes = ellenorizSorok(sorok, ctx)
          const kiosztott = osztSzamokat(sorok, ctx)
          const sorAllapot = (s: Leltar343ReviewSor) => {
            const g = ellenorzes.gondok[s.id] || []
            if (g.some((x) => x.szint === 'hiba')) return 'hiba' as const
            if (g.some((x) => x.szint === 'figyelmeztetes') || s.uzenetek.length > 0)
              return 'figyelmeztetes' as const
            return 'rendben' as const
          }
          return (
            <div className="space-y-3" data-proba="leltar-varazslo">
              <Leltar343Stepper lepes={probaLepes} />
              <Leltar343Osszegzo osszegzes={ellenorzes.osszegzes} />
              <Leltar343SorLista
                sorok={sorok}
                ellenorzes={ellenorzes}
                kiosztott={kiosztott}
                sorAllapot={sorAllapot}
                nyitottSor={nyitottSor}
                setNyitottSor={setNyitottSor}
                setFeloldas={(id, f) =>
                  setProbaJavitasok((e) => ({ ...e, [id]: { ...e[id], feloldas: f } }))
                }
                setMezo={(id, mezo, ertek) =>
                  setProbaJavitasok((e) => ({
                    ...e,
                    [id]: { ...e[id], mezok: { ...e[id]?.mezok, [mezo]: ertek } },
                  }))
                }
                aktivSzamok={ctx.aktivSzamok}
                zarolt={probaZarolt}
              />
            </div>
          )
        })()}
      </section>
    </div>
  )
}
