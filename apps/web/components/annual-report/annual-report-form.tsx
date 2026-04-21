'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Building2,
  Calendar,
  Church,
  ClipboardList,
  Coins,
  Cross,
  Download,
  Droplets,
  FileText,
  Heart,
  Printer,
  Save,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ModalField } from '@/components/ui/modal-field'
import {
  generateAnnualReportPreview,
  saveAnnualReport,
  type AnnualReportRow,
} from '@/app/(dashboard)/eves-jelentes/actions'
import type { AnnualReportSnapshot } from '@/lib/annual-report/generator'
import { buildAnnualReportPrintDocument } from '@/lib/annual-report/print'
import { printToPdf, printToBrowser } from '@/lib/utils/print-engine-v2'
import { formatCurrency } from '@/lib/constants/finance'

interface AnnualReportFormProps {
  /** A meglévő jelentés (ha létezik). Új évhez null. */
  existingReport: AnnualReportRow | null
  /** Az aktív év (a UI-ban a header mutatja). */
  year: number
}

export function AnnualReportForm({ existingReport, year }: AnnualReportFormProps) {
  const [snapshot, setSnapshot] = useState<AnnualReportSnapshot | null>(null)
  const [pastorNote, setPastorNote] = useState(existingReport?.pastor_note || '')
  const [generating, setGenerating] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Felhasználói szöveges szekciók (lokális szerkesztés)
  const [szekcio4Szoveg, setSzekcio4Szoveg] = useState('')
  const [szekcio9Szoveg, setSzekcio9Szoveg] = useState('')
  const [szekcio10Szoveg, setSzekcio10Szoveg] = useState('')

  // Indítás: ha van meglévő, betöltjük a snapshotot. Egyébként generálunk.
  useEffect(() => {
    if (existingReport) {
      const snap = existingReport.snapshot_data as AnnualReportSnapshot
      setSnapshot(snap)
      setSzekcio4Szoveg(snap.szekcio4_lelkielet?.szoveg || '')
      setSzekcio9Szoveg(snap.szekcio9_iskolaUgy?.szoveg || '')
      setSzekcio10Szoveg(snap.szekcio10_egyeb?.szoveg || '')
    } else {
      // Új jelentés — generáljuk a snapshotot
      void handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReport])

  async function handleGenerate() {
    setGenerating(true)
    const result = await generateAnnualReportPreview(year)
    setGenerating(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    if (result.snapshot) {
      setSnapshot(result.snapshot)
      setSzekcio4Szoveg(result.snapshot.szekcio4_lelkielet?.szoveg || '')
      setSzekcio9Szoveg(result.snapshot.szekcio9_iskolaUgy?.szoveg || '')
      setSzekcio10Szoveg(result.snapshot.szekcio10_egyeb?.szoveg || '')
      toast.success('Az éves jelentés adatai automatikusan összeálltak.')
    }
  }

  function buildSnapshotForSave(): AnnualReportSnapshot | null {
    if (!snapshot) return null
    return {
      ...snapshot,
      szekcio4_lelkielet: { ...snapshot.szekcio4_lelkielet, szoveg: szekcio4Szoveg.trim() || null },
      szekcio9_iskolaUgy: { szoveg: szekcio9Szoveg.trim() || null },
      szekcio10_egyeb: { szoveg: szekcio10Szoveg.trim() || null },
    }
  }

  function handleSave(asStatus: 'draft' | 'submitted') {
    const payload = buildSnapshotForSave()
    if (!payload) {
      toast.error('A jelentés még nem áll össze. Indítsd el a generálást.')
      return
    }

    startTransition(async () => {
      const result = await saveAnnualReport({
        year,
        snapshot: payload,
        pastorNote: pastorNote.trim() || null,
        asStatus,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(
        asStatus === 'submitted'
          ? 'Az éves jelentés beküldve az espereshez.'
          : 'Az éves jelentés mentve piszkozatként.',
      )
    })
  }

  async function handleExportPdf() {
    const payload = buildSnapshotForSave()
    if (!payload) {
      toast.error('A jelentés még nem áll össze. Indítsd el a generálást.')
      return
    }
    try {
      const doc = buildAnnualReportPrintDocument(payload)
      await printToPdf(doc.html, doc.filename, { orientation: doc.orientation })
      toast.success('PDF letöltve.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A PDF exportálás sikertelen.')
    }
  }

  async function handlePrint() {
    const payload = buildSnapshotForSave()
    if (!payload) {
      toast.error('A jelentés még nem áll össze. Indítsd el a generálást.')
      return
    }
    try {
      const doc = buildAnnualReportPrintDocument(payload)
      await printToBrowser(doc.html)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható.')
    }
  }

  if (generating || !snapshot) {
    return (
      <div className="card-raised flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Sparkles className="size-8 text-amber-500 animate-pulse" />
        <p className="text-sm font-medium text-slate-700">
          Az éves jelentés adatai épp összeállnak...
        </p>
        <p className="text-xs text-slate-500">
          A rendszer összegyűjti a tagnyilvántartás, anyakönyv, munkanapló, pénzügyi és leltár modulokból.
        </p>
      </div>
    )
  }

  const isReadOnly =
    existingReport?.status === 'received' ||
    existingReport?.status === 'reviewed' ||
    existingReport?.status === 'finalized'

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {existingReport && (
        <StatusBanner status={existingReport.status} reviewNotes={existingReport.review_notes} />
      )}

      {/* I. Gyülekezet adatai */}
      <Section
        roman="I."
        title="Gyülekezet adatai"
        icon={<Church className="size-5" />}
        tone="indigo"
      >
        <DataGrid
          rows={[
            { label: 'Gyülekezet neve', value: snapshot.szekcio1_gyulekezet.nev_hu || snapshot.szekcio1_gyulekezet.name },
            { label: 'Cím', value: snapshot.szekcio1_gyulekezet.cim || '—' },
            { label: 'E-mail', value: snapshot.szekcio1_gyulekezet.email || '—' },
            { label: 'Telefon', value: snapshot.szekcio1_gyulekezet.telefon || '—' },
            { label: 'Egyházmegye', value: snapshot.szekcio1_gyulekezet.diocese_name || snapshot.szekcio1_gyulekezet.egyhazmegye || '—' },
            { label: 'Lelkipásztor', value: snapshot.szekcio1_gyulekezet.lelkipasztor || '—' },
            { label: 'Esperes', value: snapshot.szekcio1_gyulekezet.esperes || '—' },
          ]}
        />
      </Section>

      {/* II. Istentiszteleti élet */}
      <Section
        roman="II."
        title="Istentiszteleti élet"
        icon={<Calendar className="size-5" />}
        tone="emerald"
      >
        <KpiGrid
          items={[
            { label: 'Összes alkalom', value: String(snapshot.szekcio2_istentisztelet.osszesAlkalom) },
            { label: 'Átlag jelenlét', value: `${snapshot.szekcio2_istentisztelet.atlagJelenlet} fő` },
            { label: 'Persely összesen', value: `${formatCurrency(snapshot.szekcio2_istentisztelet.perselyOsszesen)} RON` },
          ]}
        />
        {snapshot.szekcio2_istentisztelet.typusBontas.length > 0 && (
          <BontasTable
            rows={snapshot.szekcio2_istentisztelet.typusBontas.map(t => ({
              label: t.tipus,
              value: `${t.alkalom} alkalom · ${t.jelenlet} fő · ${formatCurrency(t.persely)} RON`,
            }))}
          />
        )}
      </Section>

      {/* III. Kazuáliák */}
      <Section
        roman="III."
        title="Kazuáliák"
        icon={<Droplets className="size-5" />}
        tone="sky"
      >
        <KpiGrid
          items={[
            { label: 'Keresztelők', value: String(snapshot.szekcio3_kazualiak.keresztseg) },
            { label: 'Esketések', value: String(snapshot.szekcio3_kazualiak.hazassag) },
            { label: 'Temetések', value: String(snapshot.szekcio3_kazualiak.temetes) },
            { label: 'Konfirmáltak', value: String(snapshot.szekcio3_kazualiak.konfirmalas) },
          ]}
        />
      </Section>

      {/* IV. Lelki élet (felhasználói szöveg) */}
      <Section
        roman="IV."
        title="Lelki élet"
        icon={<Heart className="size-5" />}
        tone="rose"
      >
        <p className="text-xs text-slate-500 mb-2">
          {snapshot.szekcio4_lelkielet.konfirmaltakSzama} fiatal konfirmált az évben.
        </p>
        <ModalField
          label="Megjegyzés a lelki élethez"
          hint="Pl. közösségi alkalmak, lelkigyakorlatok, ünnepek, missziói munka."
        >
          <Textarea
            value={szekcio4Szoveg}
            onChange={e => setSzekcio4Szoveg(e.target.value)}
            placeholder="Például: Az évben 4 csendesnap és 1 evangelizációs hét volt..."
            rows={3}
            disabled={isReadOnly}
          />
        </ModalField>
      </Section>

      {/* V. Katekézis */}
      <Section
        roman="V."
        title="Katekézis"
        icon={<Users className="size-5" />}
        tone="amber"
      >
        <KpiGrid
          items={[
            { label: 'Összes alkalom', value: String(snapshot.szekcio5_katekezis.osszesAlkalom) },
            { label: 'Összes jelenlét', value: `${snapshot.szekcio5_katekezis.osszesJelenlet} fő` },
          ]}
        />
        {snapshot.szekcio5_katekezis.typusBontas.length > 0 && (
          <BontasTable
            rows={snapshot.szekcio5_katekezis.typusBontas.map(t => ({
              label: t.tipus,
              value: `${t.alkalom} alkalom · ${t.jelenlet} fő`,
            }))}
          />
        )}
      </Section>

      {/* VI. Pénzügyi helyzet */}
      <Section
        roman="VI."
        title="Pénzügyi helyzet"
        icon={<Coins className="size-5" />}
        tone="emerald"
      >
        <KpiGrid
          items={[
            { label: 'Bevétel', value: `${formatCurrency(snapshot.szekcio6_penzugy.bevetel)} RON` },
            { label: 'Kiadás', value: `${formatCurrency(snapshot.szekcio6_penzugy.kiadas)} RON` },
            {
              label: 'Egyenleg',
              value: `${snapshot.szekcio6_penzugy.egyenleg >= 0 ? '' : '−'}${formatCurrency(Math.abs(snapshot.szekcio6_penzugy.egyenleg))} RON`,
            },
          ]}
        />
      </Section>

      {/* VII. Presbitérium */}
      <Section
        roman="VII."
        title="Presbitérium"
        icon={<Users className="size-5" />}
        tone="indigo"
      >
        <p className="text-sm text-slate-700 mb-3">
          A presbitérium <strong>{snapshot.szekcio7_presbiterium.presbiterekSzama}</strong> tagból áll.
        </p>
        {snapshot.szekcio7_presbiterium.nevek.length > 0 && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {snapshot.szekcio7_presbiterium.nevek.map((p, i) => (
              <div key={i} className="text-xs flex justify-between gap-2 rounded-lg bg-slate-50/80 px-3 py-1.5">
                <span className="font-medium text-slate-700 truncate">{p.nev}</span>
                <span className="text-slate-500">{p.tisztseg}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* VIII. Egyházi vagyon */}
      <Section
        roman="VIII."
        title="Egyházi vagyon (leltár)"
        icon={<Building2 className="size-5" />}
        tone="amber"
      >
        <KpiGrid
          items={[
            { label: 'Összes tétel', value: String(snapshot.szekcio8_vagyon.teteleSzama) },
            { label: 'Teljes érték', value: `${formatCurrency(snapshot.szekcio8_vagyon.teljesertek)} RON` },
          ]}
        />
        {snapshot.szekcio8_vagyon.kategoriaBontas.length > 0 && (
          <BontasTable
            rows={snapshot.szekcio8_vagyon.kategoriaBontas.map(k => ({
              label: k.kategoria,
              value: `${k.tetel} db · ${formatCurrency(k.ertek)} RON`,
            }))}
          />
        )}
      </Section>

      {/* IX. Iskolaügy */}
      <Section
        roman="IX."
        title="Iskolaügy"
        icon={<ClipboardList className="size-5" />}
        tone="slate"
      >
        <ModalField
          label="Iskolával kapcsolatos megjegyzés"
          hint="Ha a gyülekezet iskolát is fenntart, vagy hitoktatás zajlik a helyi iskolában — ide írhatja."
        >
          <Textarea
            value={szekcio9Szoveg}
            onChange={e => setSzekcio9Szoveg(e.target.value)}
            placeholder="Például: A helyi általános iskolában heti 2 óra hitoktatás zajlik..."
            rows={3}
            disabled={isReadOnly}
          />
        </ModalField>
      </Section>

      {/* X. Egyéb */}
      <Section
        roman="X."
        title="Egyéb"
        icon={<FileText className="size-5" />}
        tone="slate"
      >
        <ModalField
          label="Egyéb megjegyzések"
          hint="Pl. évközi rendkívüli események, halálozás, baleset, jelentősebb adományok."
        >
          <Textarea
            value={szekcio10Szoveg}
            onChange={e => setSzekcio10Szoveg(e.target.value)}
            placeholder="Itt rögzítheted az évhez kapcsolódó egyéb fontos eseményeket..."
            rows={3}
            disabled={isReadOnly}
          />
        </ModalField>
      </Section>

      {/* Lelkipásztor megjegyzés */}
      <div className="card-raised p-5">
        <ModalField
          label="Lelkipásztori megjegyzés (opcionális)"
          hint="A jelentés lezárása előtt megfogalmazott személyes gondolatok az elmúlt évről."
        >
          <Textarea
            value={pastorNote}
            onChange={e => setPastorNote(e.target.value)}
            placeholder="„Hálát adok a gyülekezetért, amely az elmúlt évben…"
            rows={3}
            disabled={isReadOnly}
          />
        </ModalField>
      </div>

      {/* Akciók */}
      <div className="card-raised flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            {isReadOnly ? 'Letöltés és nyomtatás' : 'Mentés, letöltés és beküldés'}
          </p>
          <p className="text-xs text-slate-500">
            {isReadOnly
              ? 'A jelentés már véglegesítve. Letöltheted PDF-ként vagy kinyomtathatod.'
              : 'Piszkozatként mentheted és később folytathatod, letöltheted PDF-ként, vagy beküldheted az esperesnek.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isReadOnly && (
            <Button
              variant="outline"
              className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
              onClick={() => void handleGenerate()}
              disabled={isPending}
            >
              <Sparkles className="mr-1.5 size-4" />
              Újrageneráljam
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50"
            onClick={() => void handleExportPdf()}
            disabled={isPending}
          >
            <Download className="mr-1.5 size-4" />
            PDF letöltése
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => void handlePrint()}
            disabled={isPending}
          >
            <Printer className="mr-1.5 size-4" />
            Nyomtatás
          </Button>
          {!isReadOnly && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => handleSave('draft')}
              disabled={isPending}
            >
              <Save className="mr-1.5 size-4" />
              Piszkozat mentése
            </Button>
          )}
          {!isReadOnly && (
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleSave('submitted')}
              disabled={isPending}
            >
              <Send className="mr-1.5 size-4" />
              Beküldés esperesnek
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Belső komponensek
// ─────────────────────────────────────────────────────────────────

type SectionTone = 'indigo' | 'emerald' | 'sky' | 'rose' | 'amber' | 'slate'

function Section({
  roman,
  title,
  icon,
  tone,
  children,
}: {
  roman: string
  title: string
  icon: React.ReactNode
  tone: SectionTone
  children: React.ReactNode
}) {
  const palette: Record<SectionTone, { bg: string; text: string }> = {
    indigo: { bg: 'bg-indigo-50/60', text: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50/60', text: 'text-emerald-700' },
    sky: { bg: 'bg-sky-50/60', text: 'text-sky-700' },
    rose: { bg: 'bg-rose-50/60', text: 'text-rose-700' },
    amber: { bg: 'bg-amber-50/60', text: 'text-amber-700' },
    slate: { bg: 'bg-slate-50/60', text: 'text-slate-700' },
  }
  const styles = palette[tone]

  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-3 border-b border-slate-100 ${styles.bg} px-5 py-3`}>
        <div className={styles.text}>{icon}</div>
        <h2 className="font-heading text-lg text-slate-800">
          <span className={`mr-2 font-semibold ${styles.text}`}>{roman}</span>
          {title}
        </h2>
      </div>
      <div className="space-y-3 p-5">{children}</div>
    </div>
  )
}

function KpiGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-200/60">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-800">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function BontasTable({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm ring-1 ring-slate-200/40">
          <span className="font-medium text-slate-700">{r.label}</span>
          <span className="text-slate-600 text-xs">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function DataGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={i} className="space-y-0.5">
          <p className="text-xs font-medium text-slate-500">{r.label}</p>
          <p className="text-sm font-semibold text-slate-800">{r.value}</p>
        </div>
      ))}
    </div>
  )
}

function StatusBanner({
  status,
  reviewNotes,
}: {
  status: AnnualReportRow['status']
  reviewNotes: string | null
}) {
  const config: Record<AnnualReportRow['status'], { tone: string; text: string }> = {
    draft: { tone: 'bg-slate-100 text-slate-700', text: 'Piszkozat — még nincs beküldve' },
    submitted: { tone: 'bg-blue-100 text-blue-700', text: 'Beküldve — esperesi feldolgozásra vár' },
    received: { tone: 'bg-amber-100 text-amber-700', text: 'Az esperes átvette — ellenőrzésre vár' },
    reviewed: { tone: 'bg-violet-100 text-violet-700', text: 'Esperesi ellenőrzés megtörtént' },
    finalized: { tone: 'bg-emerald-100 text-emerald-700', text: 'Véglegesítve — a kerület felé továbbítva' },
  }
  const { tone, text } = config[status]

  return (
    <div className="card-raised p-4 space-y-2">
      <Badge className={`${tone} hover:${tone}`}>{text}</Badge>
      {reviewNotes && (
        <div className="rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold mb-1">Esperesi megjegyzés:</p>
          <p>{reviewNotes}</p>
        </div>
      )}
    </div>
  )
}
