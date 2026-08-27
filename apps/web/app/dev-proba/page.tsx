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
// 2026-08-27 (nyomtatási központ): a lapozható, ablakhoz illesztett előnézet
// mock adatokkal — a valódi képernyő auth mögött van.
import { PrintPreviewFrame } from '@/components/inventory/print-preview-frame'
import { PublicEvNaptar } from '@/components/public/public-ev-naptar'
// 2026-08-27 (banki import kör): a párosítatlan belső mozgás figyelmeztető sávja.
// A valódi képernyő auth mögött van; itt MOCK adattal ellenőrizhető a látvány —
// külön a „várakozó" és az „árva" eset, ami eddig NÉMA volt.
import { InternalMovementWarning } from '@/components/finance/internal-movement-warning'
import type { InternalMovementHealth } from '@/lib/finance/internal-movement-health'
import { ProgramDialog } from '@/components/modals/program-dialog'
import type { PublicEsemeny } from '@/lib/public-site/tisztsegek-events-loader'
import { buildInventoryPrintDocument, type InventoryPrintType } from '@/lib/inventory/reporting'
import type { PrintLang } from '@/lib/inventory/print-layout'
import type { InventoryItem } from '@/lib/constants/inventory.next'
import type { FaGyulekezet } from '@/app/(dashboard)/admin/szervezet-shared'


// ── Belső mozgás figyelmeztetés — mock egészség-állapotok ────────────────────
// (A) az ÉLES eset kicsinyítve: 3 árva, banki importból, pár nélkül.
const MOCK_BM_ARVA: InternalMovementHealth = {
  unpairedCount: 3,
  orphanCount: 3,
  unpairedIds: new Set([5703, 5704, 5709]),
  items: [
    { datum: '2026-04-16', osszeg: 16300, side: 'income', orphan: true, description: '' },
    { datum: '2026-02-18', osszeg: 15015, side: 'income', orphan: true, description: '' },
    { datum: '2026-02-18', osszeg: 2055, side: 'income', orphan: true, description: '' },
  ],
}
// (B) a RÉGI, ismert eset: a másik oldal még nincs importálva → magától megoldódik.
const MOCK_BM_VARAKOZO: InternalMovementHealth = {
  unpairedCount: 1,
  orphanCount: 0,
  unpairedIds: new Set([9001]),
  items: [
    { datum: '2026-03-10', osszeg: 500, side: 'expense', orphan: false, description: '' },
  ],
}
// (C) VEGYES: mindkét fajta egyszerre — a sáv mindkét üzenetet mutatja.
const MOCK_BM_VEGYES: InternalMovementHealth = {
  unpairedCount: 4,
  orphanCount: 3,
  unpairedIds: new Set([5703, 5704, 5709, 9001]),
  items: [...MOCK_BM_ARVA.items, ...MOCK_BM_VARAKOZO.items],
}

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

const MOCK_LELTAR: InventoryItem[] = Array.from({ length: 120 }, (_, i) => ({
  id: `p-${i}`,
  leltari_szam: `CS-${String(i + 1).padStart(3, '0')}`,
  regi_leltari_szam: null,
  // ⚠️ ENDRE ÉLES ADATÁNAK VEGYES MINTÁZATA: hosszú termékazonosítók, rövid
  // magyar nevek, és megjegyzések, amelyek egy része tördelődik. Épp ettől
  // lettek a lapok EGYENETLENEK (az egyiken 11 sor, a másikon 20).
  megnevezes:
    i % 4 === 0
      ? `KIPSTA Vest diferenere Sporturi deVerde turcoaz universal - 0.048 kg (${i + 1})`
      : i % 4 === 1
        ? `DS-2CE17D0T-IT5F(C) Camera exterior FULL HD, IR 80 metri, TurboHD/CVI/AHD/CVBS, Hikvision (${i + 1})`
        : i % 4 === 2
          ? `SP-RCAT5FTPCCA SP-RCAT5FTPCCA - CABLU FTP CCA CAT5 ROLA 305M (${i + 1})`
          : `Szék ${i + 1}`,
  kategoria: 'Csekély értékű',
  kategoria_key: 'csekely',
  beszerzes_erteke: 250,
  beszerzes_datuma: '2019-05-05',
  beszerzes_bizonylat: 'Sz-12',
  katalogus_kod: null,
  hasznalati_ido: null,
  helyszin: 'Templom',
  felelos_szemely_id: null,
  felelos_nev: 'Szőcs Endre',
  vonalkod: null,
  megjegyzes: i % 3 === 0 ? 'RON értékében' : i % 3 === 1 ? 'Garázs: 6x8 m - RON értékében' : '',
  mennyiseg: 1,
  mertekegyseg: 'db',
  torles_datuma: null,
  torles_bizonylat: null,
  torles_indoklasa: null,
  ertek_modositas: 0,
  ertek_modositas_megjegyzes: null,
  alapeszkoz_csoport: null,
  penzugy_xkey: null,
  szerzo: null,
  konyv_isbn: null,
  konyv_kiado: null,
  konyv_kiadas_helye: null,
  konyv_kiadas_eve: null,
  konyv_terjedelem: null,
  konyv_sorozatcim: null,
  created_at: null,
  deleted: false,
})) as unknown as InventoryItem[]


/**
 * 5. szakasz — a gyülekezeti weboldal ÉVES NAPTÁRA (2026-08-27).
 *
 * MIÉRT KELL IDE: a naptárt csak akkor lehetne élő adaton látni, ha egy
 * gyülekezet MÁR megjelölt programokat nyilvánosnak. Endre bejelentése épp az
 * volt, hogy nem látszik semmi — tehát az „üres" állapotból nem derül ki, hogy
 * a MEGJELENÍTÉS jó-e. Ez a próbapad a valós adatra jellemző vegyes esetekkel
 * dolgozik: többnapos alkalom, idő nélküli alkalom, hosszú leírás, emoji,
 * vasárnapi és hétköznapi nap.
 */
const MOCK_PUBLIKUS_ESEMENYEK: PublicEsemeny[] = [
  {
    cim: 'Vakációs bibliahét',
    leiras:
      'Egy héten át délelőttönként várjuk az iskolás gyermekeket bibliai történetekkel, kézműves foglalkozással, énektanulással és közös játékkal. A részvétel ingyenes, előzetes jelentkezés a lelkészi hivatalban.',
    datum: '2026-08-03',
    datum_vege: '2026-08-07',
    ido_kezdes: '09:00:00',
    ido_befejezes: '13:00:00',
    helyszin: 'Gyülekezeti terem',
    tipus: 'gyerekprogram',
    egyedi_tipus_nev: null,
    egyedi_emoji: '🧒',
  },
  {
    cim: 'Vasárnapi istentisztelet',
    leiras: null,
    datum: '2026-08-09',
    datum_vege: null,
    ido_kezdes: '11:00:00',
    ido_befejezes: null,
    helyszin: 'Templom',
    tipus: 'istentisztelet',
    egyedi_tipus_nev: null,
    egyedi_emoji: null,
  },
  {
    cim: 'Gyülekezeti nap',
    leiras: 'Közös ebéd, gyermekműsor és délutáni beszélgetés a templomkertben.',
    datum: '2026-08-16',
    datum_vege: null,
    ido_kezdes: null,
    ido_befejezes: null,
    helyszin: 'Templomkert',
    tipus: 'kozossegi',
    egyedi_tipus_nev: null,
    egyedi_emoji: '🎉',
  },
  {
    cim: 'Evangelizációs hét',
    leiras: 'Esténként vendéglelkészek szolgálnak igehirdetéssel.',
    datum: '2026-09-14',
    datum_vege: '2026-09-20',
    ido_kezdes: '18:00:00',
    ido_befejezes: '19:30:00',
    helyszin: 'Templom',
    tipus: 'evangelizacio',
    egyedi_tipus_nev: null,
    egyedi_emoji: null,
  },
  {
    cim: 'Adventi gyertyagyújtás',
    leiras: null,
    datum: '2026-11-29',
    datum_vege: null,
    ido_kezdes: '17:00:00',
    ido_befejezes: null,
    helyszin: 'Templom',
    tipus: 'unnep',
    egyedi_tipus_nev: null,
    egyedi_emoji: '🕯️',
  },
]

export default function DevProbaPage() {
  // Éles buildben a lap üres tájékoztató — a middleware amúgy is auth mögé teszi.
  if (process.env.NODE_ENV !== 'development') {
    return <p className="p-6 text-sm text-muted-foreground">A próbapad csak fejlesztői módban érhető el.</p>
  }
  return <ProbaTartalom />
}

function ProbaTartalom() {
  const [programNyitva, setProgramNyitva] = useState(false)
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
  const [nyTipus, setNyTipus] = useState<InventoryPrintType>('leltariv')
  const [nyNyelv, setNyNyelv] = useState<PrintLang>('hu')

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

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">4. Nyomtatási előnézet (120 mock tétel)</h2>
        <div className="flex flex-wrap gap-2">
          {(['leltariv', 'registru_inventar', 'aktiv_passziv', 'torolt_targyak', 'vagyonleltari_jelentes'] as const).map(
            (tipus) => (
              <button
                key={tipus}
                className={`rounded-md border px-3 py-2 text-sm ${nyTipus === tipus ? 'border-primary bg-primary/10' : 'border-border bg-muted'}`}
                onClick={() => setNyTipus(tipus)}
              >
                {tipus}
              </button>
            ),
          )}
          {(['hu', 'ro'] as const).map((l) => (
            <button
              key={l}
              className={`rounded-md border px-3 py-2 text-sm uppercase ${nyNyelv === l ? 'border-primary bg-primary/10' : 'border-border bg-muted'}`}
              onClick={() => setNyNyelv(l)}
            >
              {l}
            </button>
          ))}
        </div>
        {(() => {
          const doc = buildInventoryPrintDocument({
            type: nyTipus,
            items: MOCK_LELTAR,
            congregationName: 'Barátosi Református Egyházközség',
            congregationNameRo: 'Parohia Reformată Brateș',
            year: 2026,
            lang: nyNyelv,
          })
          return (
            <div className="h-[70dvh]" data-proba="nyomtatas-elonezet" data-lapszam={doc.lapszam}>
              <PrintPreviewFrame
                html={doc.html}
                orientation={doc.orientation}
                lapszam={doc.lapszam}
                cim={doc.title}
              />
            </div>
          )
        })()}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">6. Program-rögzítő — LEÍRÁS mező</h2>
        <p className="text-sm text-muted-foreground">
          ⛔ Endre 2026-08-27-én képernyőképpel jelezte, hogy az űrlapon csak „Megjegyzés" van.
          A nyilvános naptár viszont a <code>leiras</code> mezőt publikálja — amit a webes űrlap
          SOHA nem írt. A „leírással együtt" kérés így némán üres maradt volna.
        </p>
        <button
          type="button"
          className="rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm"
          onClick={() => setProgramNyitva(true)}
          data-proba="program-dialogus-nyit"
        >
          Új program megnyitása
        </button>
        <ProgramDialog open={programNyitva} onOpenChange={setProgramNyitva} defaultDate="2026-08-03" />
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">5. Gyülekezeti weboldal — éves naptár</h2>
        <p className="text-sm text-muted-foreground">
          A publikus Alkalmaink oldal naptára. Vegyes eset: többnapos alkalom, idő nélküli
          alkalom, hosszú leírás, emoji, vasárnap.
        </p>
        <div className="public-site-root rounded-xl bg-white p-4" data-proba="ev-naptar">
          <PublicEvNaptar esemenyek={MOCK_PUBLIKUS_ESEMENYEK} ev={2026} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">6. Pénzügy — párosítatlan belső mozgás figyelmeztetés</h2>
        <p className="text-sm text-muted-foreground">
          A 2026-08-27-i javítás: az „árva" sorok (belső mozgás kategória, de párosító
          kulcs nélkül — tipikusan banki importból) eddig LÁTHATATLANOK voltak, mert az őr
          csak a már párosított sorokat nézte. Alul a három eset egymás alatt.
        </p>

        <p className="text-xs font-medium text-muted-foreground">(A) Csak ÁRVA sorok — az éles eset</p>
        <div data-proba="bm-figyelmeztetes-arva">
          <InternalMovementWarning health={MOCK_BM_ARVA} />
        </div>

        <p className="text-xs font-medium text-muted-foreground">(B) Csak VÁRAKOZÓ — magától megoldódik</p>
        <div data-proba="bm-figyelmeztetes-varakozo">
          <InternalMovementWarning health={MOCK_BM_VARAKOZO} />
        </div>

        <p className="text-xs font-medium text-muted-foreground">(C) VEGYES — mindkét üzenet</p>
        <div data-proba="bm-figyelmeztetes-vegyes">
          <InternalMovementWarning health={MOCK_BM_VEGYES} />
        </div>
      </section>
    </div>
  )
}
