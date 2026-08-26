'use client'

/**
 * Leltar 3_43 import-VARÁZSLÓ — négy lépés, javítható hibákkal (2026-08-27).
 *
 * ⛔ MI VOLT A BAJ (Endre két jelzése):
 *   1. „egy rakás gomb és doboz, ami nem vezet sehová" — a régi kártya egy
 *      hosszú, görgetős lap volt, a lépések nem látszottak;
 *   2. „nem importált egyet sem" — 217 sor NÉMÁN kimaradt, mert a leltári
 *      számuk már létezett, és NEM lehetett dönteni róluk; a lista pedig az
 *      import után sem töltődött újra.
 *
 * A VARÁZSLÓ:
 *   1. Fájl        — a hivatalos munkafüzet feltöltése
 *   2. Ellenőrzés  — MINDEN sor, csonkolás nélkül, szűrhetően
 *   3. Javítás     — a döntést igénylő sorok: mező-szerkesztés + feloldás
 *                    (bevitel / új szám / meglévő frissítése / kihagyás)
 *   4. Importálás  — mit fogunk tenni, majd a valódi eredmény
 *
 * A 2. és 3. lépés ellenőrzése a KÖZÖS `leltar343-review` rétegből jön —
 * ugyanaz fut a szerveren is, tehát amit itt „rendben"-nek látsz, az be is megy.
 */

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Search,
  TriangleAlert,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  previewLeltar343,
  executeLeltar343Import,
} from '@/app/(dashboard)/leltar/leltar343-actions'
import { useInventoryRefresh } from '@/components/inventory/inventory-refresh-context'
import {
  alkalmazJavitasok,
  ellenorizSorok,
  osztSzamokat,
  LELTAR343_FELOLDAS_CIMKE,
  type Leltar343Feloldas,
  type Leltar343Gond,
  type Leltar343Javitasok,
  type Leltar343Mezo,
  type Leltar343ReviewSor,
} from '@/lib/inventory/leltar343-review'
import type {
  Leltar343Preview,
  Leltar343ImportResult,
} from '@/lib/inventory/leltar343-import-types'
// 2026-08-27 (Endre 5. pontja): EGYETLEN ejtőzóna. A generikus (egyszerű
// listás) import ugyanebben a négylépéses keretben fut — a fájl fajtáját a
// SZERVER ismeri fel, nem a felhasználónak kell eltalálnia, melyik dobozba
// húzza.
import { parseAndPreview, executeBatchImport } from '@/lib/import/batch-import-actions'
import type { ParseResult, BatchImportResult } from '@/lib/import/batch-import-types'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

const LEPESEK = ['Fájl', 'Ellenőrzés', 'Javítás', 'Importálás'] as const
type Lepes = 1 | 2 | 3 | 4

type Szuro = 'mind' | 'hiba' | 'figyelmeztetes' | 'rendben'
const OLDAL_MERET = 25

const SZURO_CIMKE: Record<Szuro, string> = {
  mind: 'Mind',
  hiba: 'Javítandó',
  figyelmeztetes: 'Figyelmeztetés',
  rendben: 'Rendben',
}

function penz(n: number): string {
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 }).format(n)
}

export function Leltar343ImportWizard({
  importProfiles = [],
  importModule = 'inventory',
}: {
  /** A generikus (egyszerű listás) ág profiljai. */
  importProfiles?: ImportProfile[]
  importModule?: ImportModule
} = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refreshApi = useInventoryRefresh()

  const [lepes, setLepes] = useState<Lepes>(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Leltar343Preview | null>(null)
  const [javitasok, setJavitasok] = useState<Leltar343Javitasok>({})
  const [eredmeny, setEredmeny] = useState<Leltar343ImportResult | null>(null)
  const [isPreviewing, startPreviewing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  const [szuro, setSzuro] = useState<Szuro>('mind')
  const [lapSzuro, setLapSzuro] = useState<string>('')
  const [kereses, setKereses] = useState('')
  const [oldal, setOldal] = useState(0)
  const [nyitottSor, setNyitottSor] = useState<string | null>(null)
  /** Melyik ágon vagyunk: a hivatalos munkafüzet, vagy egyszerű lista? */
  const [mod, setMod] = useState<'leltar343' | 'lista' | null>(null)
  const [listaParse, setListaParse] = useState<ParseResult | null>(null)
  const [listaLapok, setListaLapok] = useState<ListaLap[]>([])
  const [listaEredmeny, setListaEredmeny] = useState<BatchImportResult | null>(null)

  // ── Élő ellenőrzés — UGYANAZZAL a réteggel, amit a szerver futtat ─────────
  const ctx = useMemo(
    () => ({
      aktivSzamok: preview?.aktivSzamok || [],
      kivezetettSzamok: preview?.kivezetettSzamok || [],
      // A lezárt év zára: a szerver dönti el, a felület csak tükrözi (és
      // ugyanezzel a réteggel számol, tehát nem ígérhet mást).
      veglegesitve: !!preview?.veglegesitve,
    }),
    [preview],
  )
  const zarolt = !!preview?.veglegesitve

  const sorok = useMemo(
    () => alkalmazJavitasok(preview?.sorok || [], javitasok),
    [preview, javitasok],
  )
  const ellenorzes = useMemo(() => ellenorizSorok(sorok, ctx), [sorok, ctx])
  const kiosztott = useMemo(() => osztSzamokat(sorok, ctx), [sorok, ctx])
  const osszegzes = ellenorzes.osszegzes

  const sorAllapot = useCallback(
    (s: Leltar343ReviewSor): Szuro => {
      const g = ellenorzes.gondok[s.id] || []
      if (g.some(x => x.szint === 'hiba')) return 'hiba'
      if (g.some(x => x.szint === 'figyelmeztetes') || s.uzenetek.length > 0) return 'figyelmeztetes'
      return 'rendben'
    },
    [ellenorzes],
  )

  const szurtSorok = useMemo(() => {
    const q = kereses
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    return sorok.filter(s => {
      if (lapSzuro && s.lap !== lapSzuro) return false
      if (szuro !== 'mind' && sorAllapot(s) !== szuro) return false
      if (!q) return true
      return `${s.megnevezes} ${s.leltari_szam || ''} ${s.helyszin || ''} ${s.felelos_neve || ''}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .includes(q)
    })
  }, [sorok, szuro, lapSzuro, kereses, sorAllapot])

  const oldalak = Math.max(1, Math.ceil(szurtSorok.length / OLDAL_MERET))
  const aktualisOldal = Math.min(oldal, oldalak - 1)
  const lathatoSorok = szurtSorok.slice(
    aktualisOldal * OLDAL_MERET,
    aktualisOldal * OLDAL_MERET + OLDAL_MERET,
  )

  /**
   * A „Javítás" lépés STABIL sorlistája.
   *
   * ⚠️ MIÉRT NEM az élő hibás halmaz: ha a lista minden billentyűleütésre
   * újraszámolna, a sor abban a pillanatban ELTŰNNE a képernyőről, amikor a
   * javítás érvényessé válik — kirántva a fókuszt a beviteli mezőből, gépelés
   * közben. Ezért a listát az EREDETI (javítatlan) állapot rögzíti, és a
   * megjavított sor ott marad, csak zöldre vált.
   */
  const javitandoIdk = useMemo(() => {
    const alap = preview?.sorok || []
    const ell = ellenorizSorok(alap, ctx)
    return new Set(
      alap
        .filter(s => s.elutasitott || (ell.gondok[s.id] || []).some(g => g.szint === 'hiba'))
        .map(s => s.id),
    )
  }, [preview, ctx])

  const javitandoSorok = useMemo(
    () => sorok.filter(s => javitandoIdk.has(s.id)),
    [sorok, javitandoIdk],
  )

  // ── Javítás-műveletek ────────────────────────────────────────────────────
  const setFeloldas = useCallback((id: string, feloldas: Leltar343Feloldas) => {
    setJavitasok(elozo => ({ ...elozo, [id]: { ...elozo[id], feloldas } }))
  }, [])

  const setMezo = useCallback((id: string, mezo: Leltar343Mezo, ertek: string) => {
    setJavitasok(elozo => ({
      ...elozo,
      [id]: { ...elozo[id], mezok: { ...elozo[id]?.mezok, [mezo]: ertek } },
    }))
  }, [])

  /** Tömeges feloldás minden olyan sorra, ahol adott kódú blokkoló hiba van. */
  const tomegesFeloldas = useCallback(
    (kod: Leltar343Gond['kod'], feloldas: Leltar343Feloldas) => {
      let db = 0
      setJavitasok(elozo => {
        const uj = { ...elozo }
        for (const s of sorok) {
          const g = ellenorzes.gondok[s.id] || []
          if (!g.some(x => x.szint === 'hiba' && x.kod === kod)) continue
          uj[s.id] = { ...uj[s.id], feloldas }
          db += 1
        }
        return uj
      })
      toast.success(`${db} sor beállítva: ${LELTAR343_FELOLDAS_CIMKE[feloldas].toLowerCase()}.`)
    },
    [sorok, ellenorzes],
  )

  const mindenHibasKihagy = useCallback(() => {
    let db = 0
    setJavitasok(elozo => {
      const uj = { ...elozo }
      for (const s of sorok) {
        if (sorAllapot(s) !== 'hiba') continue
        uj[s.id] = { ...uj[s.id], feloldas: 'kihagy' }
        db += 1
      }
      return uj
    })
    toast.success(`${db} javítandó sor kihagyásra állítva.`)
  }, [sorok, sorAllapot])

  // ── Fájl + szerver ───────────────────────────────────────────────────────
  const handleFileSelect = (selected: File | null) => {
    if (!selected) return
    const ext = (selected.name.toLowerCase().split('.').pop() || '')
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Elfogadott formátumok: .xlsx, .xls vagy .csv')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error('A fájl mérete meghaladja a 10 MB-os limitet.')
      return
    }
    setFile(selected)
    setPreview(null)
    setJavitasok({})
    setEredmeny(null)
    setListaParse(null)
    setListaLapok([])
    setListaEredmeny(null)
    setMod(null)
    setOldal(0)

    startPreviewing(async () => {
      // ⚠️ MEMÓRIAMÁSOLAT, nem a böngésző File-referenciája: a varázslóban a
      // fájlválasztás és az importálás között PERCEK telhetnek (ellenőrzés,
      // javítás). Ha közben a fájlt a lemezen mentik vagy mozgatják, az
      // eredeti referencia elavul, és az import ERR_UPLOAD_FILE_CHANGED
      // hibával hasal el — a lelkész számára megmagyarázhatatlanul.
      let stabil: File
      try {
        const buffer = await selected.arrayBuffer()
        stabil = new File([buffer], selected.name, { type: selected.type })
      } catch {
        toast.error('A fájl beolvasása sikertelen — válaszd ki újra.')
        setFile(null)
        return
      }
      setFile(stabil)

      // ── A FAJTÁT A SZERVER ISMERI FEL ──────────────────────────────────
      // A `parseAndPreview` a lapnevekből eldönti, hogy a hivatalos Leltar
      // 3_43 munkafüzetről van-e szó. Így a lelkésznek EGYETLEN ejtőzónája
      // van, és nem neki kell eltalálnia, melyik dobozba húzza a fájlt.
      const felismeroData = new FormData()
      felismeroData.append('file', stabil)
      felismeroData.append('module', importModule)
      const felismert = await parseAndPreview(felismeroData)

      if (felismert.error) {
        toast.error(felismert.error)
        setFile(null)
        return
      }

      if (felismert.leltar343) {
        const formData = new FormData()
        formData.append('file', stabil)
        const result = await previewLeltar343(formData)
        if (result.error) {
          toast.error(result.error)
          setFile(null)
          return
        }
        setMod('leltar343')
        setPreview(result)
        setLepes(2)
        return
      }

      // ── Egyszerű lista ág ──────────────────────────────────────────────
      const lapok = (felismert.sheets || []).map(sheet => ({
        sheetName: sheet.sheetName,
        // ⚠️ A profil CSAK javaslat. Ha a lap nevéből nem következik, akkor
        // egyprofilos modulnál felkínáljuk, de NEM kapcsoljuk be magától:
        // egy munkafüzet több füle közül csak a felhasználó tudja, melyik a
        // leltár — a vak bekapcsolás idegen adatot importálna.
        profileKey: sheet.suggestedProfileKey ?? (importProfiles.length === 1 ? importProfiles[0].key : null),
        enabled: !!sheet.suggestedProfileKey && sheet.rowCount > 0 && !sheet.warning,
      }))
      setMod('lista')
      setListaParse(felismert)
      setListaLapok(lapok)
      setLepes(2)
    })
  }

  /** Az egyszerű lista ág importja (generikus multi-sheet út). */
  const handleListaImport = () => {
    if (!file) return
    const kivalasztott = listaLapok.filter(l => l.enabled && l.profileKey)
    if (kivalasztott.length === 0) {
      toast.error('Legalább egy fület ki kell választani profillal.')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', importModule)
    formData.append(
      'config',
      JSON.stringify(kivalasztott.map(l => ({ sheetName: l.sheetName, profileKey: l.profileKey }))),
    )
    startImporting(async () => {
      const result = await executeBatchImport(formData)
      setListaEredmeny(result)
      if (!result.success) {
        toast.error(result.error || 'Az import sikertelen.')
      } else if ((result.insertedCount ?? 0) > 0) {
        toast.success(
          `Import kész: ${result.insertedCount ?? 0} sor bekerült` +
            (result.skippedCount ? `, ${result.skippedCount} kimaradt.` : '.'),
        )
      } else {
        toast.warning(`Egyetlen sor sem került be — ${result.skippedCount ?? 0} sor kimaradt.`)
      }
      // ⚠️ UGYANAZ A GYÖKÉROK, mint a hivatalos ágon: a lista magától NEM
      // töltődik újra, és a lelkész azt hiszi, semmi nem ment be.
      await refreshApi?.frissit()
    })
  }

  const handleImport = () => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('javitasok', JSON.stringify(javitasok))
    startImporting(async () => {
      const result = await executeLeltar343Import(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setEredmeny(result)
      const beirt = (result.beszurt || 0) + (result.frissitett || 0)
      if (beirt > 0) {
        toast.success(
          `Import kész: ${result.beszurt || 0} új tétel, ${result.frissitett || 0} frissítve, ${result.kihagyott || 0} kimaradt.`,
        )
      } else {
        // Nem hazudunk sikert: ha egy sor sem ment be, azt mondjuk ki.
        toast.warning(`Egyetlen tétel sem került be — ${result.kihagyott || 0} sor kimaradt.`)
      }
      // ⚠️ A GYÖKÉROK JAVÍTÁSA: a lista magától NEM töltődik újra.
      await refreshApi?.frissit()
    })
  }

  const ujrakezdes = () => {
    setLepes(1)
    setFile(null)
    setPreview(null)
    setJavitasok({})
    setEredmeny(null)
    setMod(null)
    setListaParse(null)
    setListaLapok([])
    setListaEredmeny(null)
    setSzuro('mind')
    setLapSzuro('')
    setKereses('')
    setOldal(0)
  }

  /** Bármelyik ágon készen van-e az eredmény? */
  const vanEredmeny = !!eredmeny || !!listaEredmeny

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-base font-semibold">Leltár-import</h3>
          {mod === 'leltar343' && (
            <Badge
              variant="outline"
              className="border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300"
            >
              hivatalos Leltar 3_43 munkafüzet
            </Badge>
          )}
          {mod === 'lista' && (
            <Badge variant="outline" className="border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300">
              egyszerű lista (Excel/CSV)
            </Badge>
          )}
        </div>

        <Leltar343Stepper lepes={lepes} />

        {/* ── 1. FÁJL ────────────────────────────────────────────────── */}
        {lepes === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Húzd ide a fájlt — a rendszer <strong>felismeri, milyen fájlt kapott</strong>, és a
              megfelelő úton viszi tovább. A hivatalos <strong>Leltar 3_43.xlsx</strong> munkafüzet
              minden kitöltendő lapját ismerjük (Csekély értékű, Alapeszközök, Telkek, Könyvek,
              Kegyszerek, Kárpótlási jegyek, Bizományi + a Cimlap helyszín/felelős katalógusa); a
              Súgó szabályai szerint dolgozunk: hiányzó hónap/nap → január 1., hiányzó mennyiség →
              1 db, a negatív sorok részleges kivezetésként (alapeszköznél le-/felértékelésként)
              kerülnek be. <strong>Egyszerű leltár-listát</strong> (Excel vagy CSV, egy sor = egy
              tétel) ugyanide tölthetsz fel.
            </p>
            <div
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-white/60 p-6 text-center transition hover:border-emerald-500 dark:border-emerald-800 dark:bg-transparent sm:p-8"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault()
                handleFileSelect(event.dataTransfer.files?.[0] || null)
              }}
            >
              <Upload className="size-6 text-emerald-600" />
              <p className="text-sm font-medium">
                {file ? file.name : 'Kattints ide, vagy húzd ide a leltár-fájlt'}
              </p>
              <p className="text-xs text-muted-foreground">
                Elfogadott: .xlsx, .xls vagy .csv — max. 10 MB
              </p>
              {isPreviewing && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> A fájl elemzése…
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={event => {
                  handleFileSelect(event.target.files?.[0] || null)
                  event.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        {/* ── 2. ELLENŐRZÉS ─────────────────────────────────────────── */}
        {lepes === 2 && mod === 'leltar343' && preview && (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Egyházmegye (Cimlap):</span>{' '}
                {preview.egyhazmegye || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Intézmény (Cimlap):</span>{' '}
                {preview.intezmeny || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Vezető (Cimlap):</span> {preview.vezeto || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Helyszín/felelős párok:</span>{' '}
                {preview.helyszinek || 0}
              </p>
            </div>

            <Leltar343Osszegzo osszegzes={osszegzes} />

            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-2 font-medium">Lap</th>
                    <th className="p-2 text-right font-medium">Tétel</th>
                    <th className="p-2 text-right font-medium">Kivezetett</th>
                    <th className="p-2 text-right font-medium">Le-/felértékelt</th>
                    <th className="p-2 text-right font-medium">Beolvasási hiba</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.lapok || []).map(lap => (
                    <tr key={lap.sheet} className="border-t">
                      <td className="p-2">{lap.cimke}</td>
                      <td className="p-2 text-right tabular-nums">{lap.tetelek}</td>
                      <td className="p-2 text-right tabular-nums">{lap.kivezetett}</td>
                      <td className="p-2 text-right tabular-nums">{lap.ertekModositott}</td>
                      <td className="p-2 text-right tabular-nums">{lap.hibakSzama}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(preview.hianyzoLapok || []).length > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Hiányzó lap a munkafüzetből: {(preview.hianyzoLapok || []).join(', ')}
              </p>
            )}

            <SorSzuroSav
              szuro={szuro}
              setSzuro={s => {
                setSzuro(s)
                setOldal(0)
              }}
              lapSzuro={lapSzuro}
              setLapSzuro={l => {
                setLapSzuro(l)
                setOldal(0)
              }}
              lapok={(preview.lapok || []).map(l => ({ sheet: l.sheet, cimke: l.cimke }))}
              kereses={kereses}
              setKereses={k => {
                setKereses(k)
                setOldal(0)
              }}
              sorok={sorok}
              sorAllapot={sorAllapot}
            />

            <Leltar343SorLista
              sorok={lathatoSorok}
              ellenorzes={ellenorzes}
              kiosztott={kiosztott}
              sorAllapot={sorAllapot}
              nyitottSor={nyitottSor}
              setNyitottSor={setNyitottSor}
              setFeloldas={setFeloldas}
              setMezo={setMezo}
              aktivSzamok={ctx.aktivSzamok}
              zarolt={zarolt}
            />

            <Lapozo
              oldal={aktualisOldal}
              oldalak={oldalak}
              osszes={szurtSorok.length}
              meret={OLDAL_MERET}
              setOldal={setOldal}
            />
          </div>
        )}

        {/* ── 3. JAVÍTÁS ────────────────────────────────────────────── */}
        {lepes === 3 && mod === 'leltar343' && preview && (
          <div className="space-y-4">
            {javitandoSorok.length === 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-white/70 p-4 text-sm dark:border-emerald-800 dark:bg-transparent">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  Nincs javítandó sor — minden tétel importálható. Lépj tovább az{' '}
                  <strong>Importálás</strong> lépésre.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">
                    {osszegzes.hibas > 0
                      ? `${osszegzes.hibas} sor döntést vagy javítást igényel.`
                      : 'Minden sor rendben — a lista alább a javított sorokat is mutatja.'}
                  </p>
                  <p className="mt-1">
                    Nyisd le a sort a szerkesztéshez, vagy használd az alábbi tömeges gombokat.
                    Amíg egy sor javítandó, addig <strong>nem</strong> kerül be az importba.
                  </p>
                </div>

                <TomegesGombok
                  sorok={sorok}
                  ellenorzes={ellenorzes}
                  tomegesFeloldas={tomegesFeloldas}
                  mindenHibasKihagy={mindenHibasKihagy}
                  zarolt={zarolt}
                />
              </>
            )}

            <Leltar343Osszegzo osszegzes={osszegzes} />

            <Leltar343SorLista
              sorok={javitandoSorok.slice(0, 200)}
              ellenorzes={ellenorzes}
              kiosztott={kiosztott}
              sorAllapot={sorAllapot}
              nyitottSor={nyitottSor}
              setNyitottSor={setNyitottSor}
              setFeloldas={setFeloldas}
              setMezo={setMezo}
              aktivSzamok={ctx.aktivSzamok}
              zarolt={zarolt}
              // Sok javítandó sornál a nyitott űrlapok (soronként 11 mező)
              // érezhetően lassítanák a gépelést — ott a „Javítás" gomb nyit.
              mindigNyitva={javitandoSorok.length <= 25}
            />
            {javitandoSorok.length > 200 && (
              <p className="text-xs text-muted-foreground">
                A javító lista egyszerre 200 sort mutat ({javitandoSorok.length} javítandó összesen) —
                javítsd ezeket, és a maradék automatikusan előrébb kerül.
              </p>
            )}
          </div>
        )}

        {/* ── 4. IMPORTÁLÁS / EREDMÉNY ──────────────────────────────── */}
        {lepes === 4 && mod === 'leltar343' && preview && !eredmeny && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Mi fog történni?</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-emerald-500" />
                  <strong className="tabular-nums">{osszegzes.beszurando}</strong> új tétel kerül be
                  {osszegzes.ujSzamos > 0 && (
                    <span className="text-muted-foreground">
                      (ebből {osszegzes.ujSzamos} kap rendszer által kiadott leltári számot)
                    </span>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-sky-500" />
                  <strong className="tabular-nums">{osszegzes.felulirando}</strong> meglévő tétel
                  frissül
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-slate-400" />
                  <strong className="tabular-nums">{osszegzes.kihagyando}</strong> sor kimarad
                </li>
                {osszegzes.hibas > 0 && (
                  <li className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="size-4 shrink-0" />
                    <strong className="tabular-nums">{osszegzes.hibas}</strong> sor még javítandó —
                    ezek nem mennek be
                  </li>
                )}
              </ul>
            </div>

            {osszegzes.hibas > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Ha most indítod az importot, a javítandó sorok kimaradnak. Lépj vissza a{' '}
                <strong>Javítás</strong> lépésre, ha be szeretnéd vinni őket.
              </p>
            )}

            {osszegzes.felulirando > 0 && (
              <p className="flex items-start gap-1.5 rounded-xl border border-sky-300 bg-sky-50/70 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  A frissítés csak a munkafüzetben <strong>kitöltött</strong> mezőket írja felül —
                  az üres cella nem törli a rendszerben már rögzített helyszínt, felelőst vagy
                  megjegyzést. A leltári szám és a rögzítő nem változik.
                </span>
              </p>
            )}

            {zarolt && (
              <p className="flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {preview.veglegesitesBizonytalan ? (
                    <>
                      A jelentés lezárt állapotát <strong>nem sikerült lekérdezni</strong>, ezért a
                      rendszer — a hivatalos irat védelmében — véglegesítettnek tekinti az évet:
                      meglévő tételt most nem lehet felülírni. Új tétel bevitele nincs zárolva.
                    </>
                  ) : (
                    <>
                      A tárgyévi vagyonleltári jelentés <strong>véglegesítve</strong> van, ezért
                      meglévő tételt <strong>nem lehet felülírni</strong> — ahhoz az egyházmegye
                      feloldása kell (kérd a Leltári nyilvántartás fülön). Új tétel bevitele nincs
                      zárolva.
                    </>
                  )}
                </span>
              </p>
            )}

            <Button
              onClick={handleImport}
              disabled={isImporting || osszegzes.beszurando + osszegzes.felulirando === 0}
              className="min-h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:w-auto"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Importálás folyamatban…
                </>
              ) : (
                `Importálás indítása (${osszegzes.beszurando + osszegzes.felulirando} tétel)`
              )}
            </Button>
          </div>
        )}

        {/* ── EGYSZERŰ LISTA ág: 2., 3. és 4. lépés ─────────────────── */}
        {lepes === 2 && mod === 'lista' && listaParse && (
          <ListaEllenorzes
            parse={listaParse}
            lapok={listaLapok}
            setLapok={setListaLapok}
            profiles={importProfiles}
          />
        )}

        {lepes === 3 && mod === 'lista' && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-white/70 p-4 text-sm dark:border-emerald-800 dark:bg-transparent">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p>
              Az egyszerű listánál nincs soronkénti javító lépés: a hibás sorokat a rendszer az
              import után tételesen felsorolja, és a fájl javítása után újra feltöltheted. A már
              létező leltári számú sorokat nem írjuk felül.
            </p>
          </div>
        )}

        {lepes === 4 && mod === 'lista' && !listaEredmeny && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">Mi fog történni?</p>
              <ul className="mt-2 space-y-1.5">
                {listaLapok
                  .filter(l => l.enabled && l.profileKey)
                  .map(l => {
                    const sheet = (listaParse?.sheets || []).find(x => x.sheetName === l.sheetName)
                    const profil = importProfiles.find(p => p.key === l.profileKey)
                    return (
                      <li key={l.sheetName} className="flex items-center gap-2">
                        <span className="inline-block size-2 rounded-full bg-emerald-500" />
                        <strong>{l.sheetName}</strong>
                        <span className="text-muted-foreground">
                          — {sheet?.rowCount ?? 0} sor, {profil?.label || l.profileKey} profillal
                        </span>
                      </li>
                    )
                  })}
                {listaLapok.filter(l => l.enabled && l.profileKey).length === 0 && (
                  <li className="text-amber-700 dark:text-amber-400">
                    Egyetlen fül sincs kijelölve — lépj vissza az Ellenőrzés lépésre.
                  </li>
                )}
              </ul>
            </div>
            <Button
              onClick={handleListaImport}
              disabled={isImporting || listaLapok.filter(l => l.enabled && l.profileKey).length === 0}
              className="min-h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:w-auto"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Importálás folyamatban…
                </>
              ) : (
                'Importálás indítása'
              )}
            </Button>
          </div>
        )}

        {lepes === 4 && eredmeny && (
          <EredmenyPanel
            eredmeny={eredmeny}
            onUjra={ujrakezdes}
            onLista={() => refreshApi?.listaraUgras()}
            vanLista={!!refreshApi}
          />
        )}

        {lepes === 4 && listaEredmeny && (
          <EredmenyPanel
            eredmeny={{
              success: listaEredmeny.success,
              beszurt: listaEredmeny.insertedCount ?? 0,
              frissitett: 0,
              kihagyott: listaEredmeny.skippedCount ?? 0,
              hibak: (listaEredmeny.errors || []).map(e => ({
                lap: e.sheet,
                sor: e.row,
                uzenet: e.message,
              })),
            }}
            onUjra={ujrakezdes}
            onLista={() => refreshApi?.listaraUgras()}
            vanLista={!!refreshApi}
          />
        )}

        {/* ── Navigáció ─────────────────────────────────────────────── */}
        {(preview || listaParse) && !vanEredmeny && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setLepes(l => (Math.max(1, l - 1) as Lepes))}
              disabled={lepes === 1}
            >
              <ChevronLeft className="mr-1 size-4" /> Vissza
            </Button>
            <span className="text-xs text-muted-foreground">
              {lepes}. lépés / {LEPESEK.length} — {LEPESEK[lepes - 1]}
            </span>
            <Button
              className="rounded-xl"
              onClick={() => setLepes(l => (Math.min(4, l + 1) as Lepes))}
              disabled={lepes === 4}
            >
              Tovább <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Lépés-jelző
// ---------------------------------------------------------------------------

export function Leltar343Stepper({ lepes }: { lepes: Lepes }) {
  return (
    <ol
      aria-label="Az import lépései"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-2.5 sm:px-4"
    >
      {LEPESEK.map((cimke, index) => {
        const szam = index + 1
        const kesz = lepes > szam
        const aktiv = lepes === szam
        return (
          <li key={cimke} className="flex items-center gap-2">
            {index > 0 && <span className="hidden h-px w-5 bg-border sm:block" aria-hidden />}
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                kesz
                  ? 'bg-emerald-500 text-white dark:bg-emerald-600'
                  : aktiv
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              }`}
              aria-hidden
            >
              {kesz ? <Check className="size-3.5" /> : szam}
            </span>
            <span
              className={`text-xs font-semibold sm:text-sm ${aktiv ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {cimke}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Összegző csempék
// ---------------------------------------------------------------------------

export function Leltar343Osszegzo({
  osszegzes,
}: {
  osszegzes: {
    osszes: number
    beszurando: number
    felulirando: number
    kihagyando: number
    hibas: number
    figyelmeztetett: number
  }
}) {
  const csempek = [
    { cimke: 'Összes sor', ertek: osszegzes.osszes, szin: 'text-foreground' },
    { cimke: 'Bekerül', ertek: osszegzes.beszurando, szin: 'text-emerald-600 dark:text-emerald-400' },
    { cimke: 'Frissül', ertek: osszegzes.felulirando, szin: 'text-sky-600 dark:text-sky-400' },
    { cimke: 'Javítandó', ertek: osszegzes.hibas, szin: 'text-red-600 dark:text-red-400' },
    { cimke: 'Figyelmeztetés', ertek: osszegzes.figyelmeztetett, szin: 'text-amber-600 dark:text-amber-400' },
    { cimke: 'Kimarad', ertek: osszegzes.kihagyando, szin: 'text-muted-foreground' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {csempek.map(cs => (
        <div key={cs.cimke} className="rounded-xl border bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {cs.cimke}
          </p>
          <p className={`text-lg font-semibold tabular-nums ${cs.szin}`}>{cs.ertek}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Szűrősáv
// ---------------------------------------------------------------------------

function SorSzuroSav({
  szuro,
  setSzuro,
  lapSzuro,
  setLapSzuro,
  lapok,
  kereses,
  setKereses,
  sorok,
  sorAllapot,
}: {
  szuro: Szuro
  setSzuro: (s: Szuro) => void
  lapSzuro: string
  setLapSzuro: (l: string) => void
  lapok: Array<{ sheet: string; cimke: string }>
  kereses: string
  setKereses: (k: string) => void
  sorok: Leltar343ReviewSor[]
  sorAllapot: (s: Leltar343ReviewSor) => Szuro
}) {
  const darabszam = useMemo(() => {
    const ki: Record<Szuro, number> = { mind: sorok.length, hiba: 0, figyelmeztetes: 0, rendben: 0 }
    for (const s of sorok) ki[sorAllapot(s)] += 1
    return ki
  }, [sorok, sorAllapot])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SZURO_CIMKE) as Szuro[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSzuro(s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              szuro === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {SZURO_CIMKE[s]}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
              {darabszam[s]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={kereses}
            onChange={e => setKereses(e.target.value)}
            placeholder="Keresés megnevezésre, leltári számra, helyszínre…"
            className="h-10 pl-9"
            aria-label="Keresés a sorok között"
          />
        </div>
        <select
          value={lapSzuro}
          onChange={e => setLapSzuro(e.target.value)}
          aria-label="Szűrés lapra"
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">Minden lap</option>
          {lapok.map(l => (
            <option key={l.sheet} value={l.sheet}>
              {l.cimke}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tömeges gombok
// ---------------------------------------------------------------------------

function TomegesGombok({
  sorok,
  ellenorzes,
  tomegesFeloldas,
  mindenHibasKihagy,
  zarolt = false,
}: {
  sorok: Leltar343ReviewSor[]
  ellenorzes: { gondok: Record<string, Leltar343Gond[]> }
  tomegesFeloldas: (kod: Leltar343Gond['kod'], feloldas: Leltar343Feloldas) => void
  mindenHibasKihagy: () => void
  zarolt?: boolean
}) {
  const utkozok = sorok.filter(s =>
    (ellenorzes.gondok[s.id] || []).some(g => g.szint === 'hiba' && g.kod === 'szam_utkozes_db'),
  ).length

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Wand2 className="size-4 text-primary" /> Tömeges döntés
      </p>
      {utkozok > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {utkozok} sor leltári száma már ki van adva:
          </span>
          {/* Lezárt évben a felülírás nem választható — a gombot sem
              kínáljuk fel, hogy ne vezessen zsákutcába. */}
          {!zarolt && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => tomegesFeloldas('szam_utkozes_db', 'felulir')}
            >
              Mind frissítse a meglévőt
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => tomegesFeloldas('szam_utkozes_db', 'uj_szam')}
          >
            Mind kapjon új számot
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => tomegesFeloldas('szam_utkozes_db', 'kihagy')}
          >
            Mind maradjon ki
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Minden javítandó sor:</span>
        <Button size="sm" variant="outline" className="rounded-full" onClick={mindenHibasKihagy}>
          <X className="mr-1 size-3.5" /> Kihagyás
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sorlista (mobil-first kártyák)
// ---------------------------------------------------------------------------

export function Leltar343SorLista({
  sorok,
  ellenorzes,
  kiosztott,
  sorAllapot,
  nyitottSor,
  setNyitottSor,
  setFeloldas,
  setMezo,
  aktivSzamok,
  zarolt = false,
  mindigNyitva = false,
}: {
  sorok: Leltar343ReviewSor[]
  ellenorzes: { gondok: Record<string, Leltar343Gond[]> }
  kiosztott: Record<string, string>
  sorAllapot: (s: Leltar343ReviewSor) => Szuro
  nyitottSor: string | null
  setNyitottSor: (id: string | null) => void
  setFeloldas: (id: string, f: Leltar343Feloldas) => void
  setMezo: (id: string, mezo: Leltar343Mezo, ertek: string) => void
  aktivSzamok: string[]
  /** Lezárt (véglegesített) év: a „Meglévő frissítése" nem választható. */
  zarolt?: boolean
  mindigNyitva?: boolean
}) {
  if (sorok.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Nincs a szűrésnek megfelelő sor.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {sorok.map(s => {
        const gondok = ellenorzes.gondok[s.id] || []
        const allapot = sorAllapot(s)
        const nyitva = mindigNyitva || nyitottSor === s.id
        const ujSzam = kiosztott[s.id]
        return (
          <li
            key={s.id}
            className={`rounded-xl border bg-card ${
              allapot === 'hiba'
                ? 'border-red-300 dark:border-red-900'
                : allapot === 'figyelmeztetes'
                  ? 'border-amber-300 dark:border-amber-900'
                  : 'border-border'
            }`}
          >
            {/* ⚠️ MOBIL: a `min-w-0 flex-1` önmagában NEM tördel — telefonon a
                cím-oszlop 23 pixelre nyomódott össze a legördülő mellett
                (mérve: 375 px-en). A `basis-[60%]` kikényszeríti a tördelést,
                a vezérlők pedig kis képernyőn saját, teljes szélességű sorba
                kerülnek. */}
            <div className="flex flex-wrap items-start gap-2 p-3">
              <AllapotJel allapot={allapot} />
              <div className="min-w-[11rem] flex-1 basis-[60%]">
                <p className="truncate text-sm font-semibold text-foreground">
                  {s.megnevezes || <span className="italic text-red-600">nincs megnevezés</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {s.lapCimke} · {s.sor}. sor
                  </span>
                  <span>
                    Leltári szám: <strong>{s.leltari_szam || '—'}</strong>
                    {ujSzam && <span className="text-emerald-600"> → {ujSzam}</span>}
                  </span>
                  <span>
                    {penz(s.beszerzesi_ertek)} lej × {s.mennyiseg} {s.mertekegyseg}
                  </span>
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <FeloldasValaszto
                  ertek={s.feloldas}
                  onChange={f => setFeloldas(s.id, f)}
                  felulirhato={!zarolt && !!s.leltari_szam && aktivSzamok.includes(s.leltari_szam)}
                  zarolt={zarolt}
                />
                {!mindigNyitva && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => setNyitottSor(nyitva ? null : s.id)}
                    aria-expanded={nyitva}
                  >
                    {nyitva ? 'Bezár' : 'Javítás'}
                  </Button>
                )}
              </div>
            </div>

            {(gondok.length > 0 || s.uzenetek.length > 0) && (
              <div className="space-y-1 border-t px-3 py-2">
                {gondok.map((g, i) => (
                  <p
                    key={`g${i}`}
                    className={`text-xs ${
                      g.szint === 'hiba'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {g.uzenet}
                  </p>
                ))}
                {s.uzenetek.map((u, i) => (
                  <p
                    key={`u${i}`}
                    className={`text-xs ${
                      u.szint === 'hiba'
                        ? 'text-red-600/80 dark:text-red-400/80'
                        : 'text-amber-700/80 dark:text-amber-400/80'
                    }`}
                  >
                    Beolvasáskor: {u.uzenet}
                  </p>
                ))}
              </div>
            )}

            {nyitva && (
              <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
                <MezoInput cimke="Megnevezés" ertek={s.megnevezes} onChange={v => setMezo(s.id, 'megnevezes', v)} />
                <MezoInput cimke="Leltári szám" ertek={s.leltari_szam || ''} onChange={v => setMezo(s.id, 'leltari_szam', v)} />
                <MezoInput cimke="Helyszín" ertek={s.helyszin || ''} onChange={v => setMezo(s.id, 'helyszin', v)} />
                <MezoInput cimke="Felelős" ertek={s.felelos_neve || ''} onChange={v => setMezo(s.id, 'felelos_neve', v)} />
                <MezoInput cimke="Beszerzés dátuma" ertek={s.beszerzes_datuma || ''} tipus="date" onChange={v => setMezo(s.id, 'beszerzes_datuma', v)} />
                <MezoInput cimke="Egységár (lej)" ertek={String(s.beszerzesi_ertek)} tipus="number" onChange={v => setMezo(s.id, 'beszerzesi_ertek', v)} />
                <MezoInput cimke="Mennyiség" ertek={String(s.mennyiseg)} tipus="number" onChange={v => setMezo(s.id, 'mennyiseg', v)} />
                <MezoInput cimke="Mértékegység" ertek={s.mertekegyseg} onChange={v => setMezo(s.id, 'mertekegyseg', v)} />
                <MezoInput cimke="Beszerzési irat" ertek={s.beszerzes_bizonylat || ''} onChange={v => setMezo(s.id, 'beszerzes_bizonylat', v)} />
                {s.kategoria === 'konyv' && (
                  <MezoInput cimke="Szerző" ertek={s.szerzo || ''} onChange={v => setMezo(s.id, 'szerzo', v)} />
                )}
                <MezoInput cimke="Megjegyzés" ertek={s.megjegyzes || ''} onChange={v => setMezo(s.id, 'megjegyzes', v)} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AllapotJel({ allapot }: { allapot: Szuro }) {
  if (allapot === 'hiba') {
    return <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Javítandó" />
  }
  if (allapot === 'figyelmeztetes') {
    return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Figyelmeztetés" />
  }
  return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Rendben" />
}

function FeloldasValaszto({
  ertek,
  onChange,
  felulirhato,
  zarolt = false,
}: {
  ertek: Leltar343Feloldas
  onChange: (f: Leltar343Feloldas) => void
  felulirhato: boolean
  zarolt?: boolean
}) {
  return (
    <select
      value={ertek}
      onChange={e => onChange(e.target.value as Leltar343Feloldas)}
      aria-label="Mi történjen ezzel a sorral?"
      className="h-9 rounded-md border border-border bg-card px-2 text-xs font-medium"
    >
      <option value="import">{LELTAR343_FELOLDAS_CIMKE.import}</option>
      <option value="uj_szam">{LELTAR343_FELOLDAS_CIMKE.uj_szam}</option>
      <option value="felulir" disabled={!felulirhato}>
        {zarolt
          ? `${LELTAR343_FELOLDAS_CIMKE.felulir} — zárolva`
          : LELTAR343_FELOLDAS_CIMKE.felulir}
      </option>
      <option value="kihagy">{LELTAR343_FELOLDAS_CIMKE.kihagy}</option>
    </select>
  )
}

function MezoInput({
  cimke,
  ertek,
  onChange,
  tipus = 'text',
}: {
  cimke: string
  ertek: string
  onChange: (v: string) => void
  tipus?: 'text' | 'number' | 'date'
}) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{cimke}</span>
      <Input
        type={tipus}
        value={ertek}
        onChange={e => onChange(e.target.value)}
        className="mt-1 h-9"
        step={tipus === 'number' ? 'any' : undefined}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Lapozó
// ---------------------------------------------------------------------------

function Lapozo({
  oldal,
  oldalak,
  osszes,
  meret,
  setOldal,
}: {
  oldal: number
  oldalak: number
  osszes: number
  meret: number
  setOldal: (o: number) => void
}) {
  if (osszes === 0) return null
  const tol = oldal * meret + 1
  const ig = Math.min(osszes, (oldal + 1) * meret)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {tol}–{ig} / {osszes} sor
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => setOldal(Math.max(0, oldal - 1))}
          disabled={oldal === 0}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-xs tabular-nums">
          {oldal + 1} / {oldalak}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => setOldal(Math.min(oldalak - 1, oldal + 1))}
          disabled={oldal >= oldalak - 1}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Eredmény
// ---------------------------------------------------------------------------

function EredmenyPanel({
  eredmeny,
  onUjra,
  onLista,
  vanLista,
}: {
  eredmeny: Leltar343ImportResult
  onUjra: () => void
  onLista: () => void
  vanLista: boolean
}) {
  const beirt = (eredmeny.beszurt || 0) + (eredmeny.frissitett || 0)
  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border p-4 ${
          beirt > 0
            ? 'border-emerald-300 bg-white/70 dark:border-emerald-800 dark:bg-transparent'
            : 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30'
        }`}
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {beirt > 0 ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <TriangleAlert className="size-4 text-amber-600" />
          )}
          {beirt > 0
            ? `Import kész: ${eredmeny.beszurt || 0} új tétel, ${eredmeny.frissitett || 0} frissítve, ${eredmeny.kihagyott || 0} kimaradt.`
            : `Egyetlen tétel sem került be — ${eredmeny.kihagyott || 0} sor kimaradt.`}
        </p>
        {beirt > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            A leltári nyilvántartás listáját már frissítettük.
          </p>
        )}
      </div>

      {(eredmeny.figyelmeztetesek || []).length > 0 && (
        <details className="rounded-xl border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-700 dark:text-amber-400">
            Figyelmeztetések ({(eredmeny.figyelmeztetesek || []).length})
          </summary>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {(eredmeny.figyelmeztetesek || []).map((f, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                {f}
              </p>
            ))}
          </div>
        </details>
      )}

      {(eredmeny.hibak || []).length > 0 && (
        <details className="rounded-xl border bg-card p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-red-600 dark:text-red-400">
            Kimaradt sorok ({(eredmeny.hibak || []).length})
          </summary>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {(eredmeny.hibak || []).map((h, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400">
                [{h.lap} · {h.sor}. sor] {h.uzenet}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {vanLista && (
          <Button className="rounded-xl" onClick={onLista}>
            Ugrás a leltári nyilvántartásra <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
        <Button variant="outline" className="rounded-xl" onClick={onUjra}>
          Új import indítása
        </Button>
      </div>
    </div>
  )
}

// ── Az EGYSZERŰ LISTA (generikus multi-sheet) ág ─────────────────────────
// Ugyanabban a négylépéses keretben fut, mint a hivatalos munkafüzet — a
// felhasználónak egyetlen ejtőzónája van, a fajtát a SZERVER ismeri fel.

interface ListaLap {
  sheetName: string
  profileKey: string | null
  enabled: boolean
}

function ListaEllenorzes({
  parse,
  lapok,
  setLapok,
  profiles,
}: {
  parse: ParseResult
  lapok: ListaLap[]
  setLapok: (fn: (elozo: ListaLap[]) => ListaLap[]) => void
  profiles: ImportProfile[]
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A fájl <strong>{(parse.sheets || []).length}</strong> fület tartalmaz. Jelöld ki, melyiket
        importáljuk, és melyik profil szerint. A be nem jelölt fülek érintetlenül maradnak.
      </p>
      <ul className="space-y-2">
        {(parse.sheets || []).map(sheet => {
          const config = lapok.find(l => l.sheetName === sheet.sheetName)
          const ures = sheet.rowCount === 0
          return (
            <li key={sheet.sheetName} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={!!config?.enabled}
                    disabled={ures || !!sheet.warning}
                    onChange={e =>
                      setLapok(elozo =>
                        elozo.map(l =>
                          l.sheetName === sheet.sheetName ? { ...l, enabled: e.target.checked } : l,
                        ),
                      )
                    }
                  />
                  {sheet.sheetName}
                </label>
                <span className="text-xs text-muted-foreground">
                  {sheet.rowCount} sor · {sheet.headers.length} oszlop
                </span>
                {sheet.warning && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">{sheet.warning}</span>
                )}
                <select
                  value={config?.profileKey || ''}
                  onChange={e => {
                    const key = e.target.value || null
                    setLapok(elozo =>
                      elozo.map(l =>
                        l.sheetName === sheet.sheetName
                          ? { ...l, profileKey: key, enabled: !!key && l.enabled }
                          : l,
                      ),
                    )
                  }}
                  aria-label={`${sheet.sheetName} importprofilja`}
                  className="ml-auto h-9 rounded-md border border-border bg-card px-2 text-xs"
                >
                  <option value="">— Kihagyás —</option>
                  {profiles.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {sheet.headers.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Oszlopok: {sheet.headers.join(' · ')}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
