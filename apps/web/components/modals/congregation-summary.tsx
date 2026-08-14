'use client'

/**
 * Gyülekezetünk adatai — READ-ONLY, kategorizált, SZÍNES „Apple-beállítások" stílusú
 * összefoglaló, NYOMTATHATÓ formában. (Endre, 2026-07-01, redizájn 2026-07-02.)
 *
 * Ez az ablak KIZÁRÓLAG megtekintés + nyomtatás — a szerkesztés a „Gyülekezet beállítása"
 * ablakban történik (a „Szerkesztés a beállításokban" gomb odavisz).
 */

import {
  Landmark, Pencil, Printer, Building2, MapPin, Phone, Wallet, Coins, PiggyBank, Users, ShieldCheck,
  Share2, Copy as CopyIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

export interface CongregationSummaryData {
  cimerUrl: string
  nevHu: string
  nev: string
  nevRo: string
  nevEn: string
  adoszam: string
  bejegyzesiszam?: string
  districtName: string | null
  dioceseName: string | null
  cimSor: string
  email: string
  telefon: string
  web: string
  banks: Array<{ bank_neve: string; iban: string | null; valuta: string; is_default: boolean }>
  evesJarulek: number
  jarulekKedvezmenyes: number
  jarulekHatarid: string
  tartozasSzamitasMod: 'akkori' | 'aktualis'
  discounts: string[]
  pastors: Array<{ full_name: string; started_at: string | null; ended_at: string | null; role?: string | null }>
  status: string | null
  /** 2026-08-14 (4. pont): a publikus oldal slugja (ha be van kapcsolva) — a Megosztás gombhoz. */
  publicSlug?: string
}

const EMPTY = '—'
const ron = (n: number) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`
const huDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }) : null
// 2026-07-17 (F5, Q6): a tartozás-számítási mód kivezetve — mindig „akkori".

// ── Színpaletták kategóriánként (élénk, „apple settings" jelleg) ──────────────
// 2026-08-14 (4. pont): minden akcentus SÖTÉT variánst kapott — korábban a
// kártyafejlécek sötét módban világos pasztell sávok maradtak világos
// szöveggel (olvashatatlan), a színkódolás pedig élesben megsemmisült.
type Accent = 'sky' | 'violet' | 'emerald' | 'amber' | 'teal' | 'rose' | 'indigo'
const ACCENTS: Record<Accent, { chip: string; ring: string; title: string; head: string }> = {
  sky: { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300', ring: 'ring-sky-100 dark:ring-sky-400/20', title: 'text-sky-800 dark:text-sky-300', head: 'from-sky-50 to-white dark:from-sky-400/10 dark:to-transparent' },
  violet: { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300', ring: 'ring-violet-100 dark:ring-violet-400/20', title: 'text-violet-800 dark:text-violet-300', head: 'from-violet-50 to-white dark:from-violet-400/10 dark:to-transparent' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300', ring: 'ring-emerald-100 dark:ring-emerald-400/20', title: 'text-emerald-800 dark:text-emerald-300', head: 'from-emerald-50 to-white dark:from-emerald-400/10 dark:to-transparent' },
  amber: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300', ring: 'ring-amber-100 dark:ring-amber-400/20', title: 'text-amber-800 dark:text-amber-300', head: 'from-amber-50 to-white dark:from-amber-400/10 dark:to-transparent' },
  teal: { chip: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300', ring: 'ring-teal-100 dark:ring-teal-400/20', title: 'text-teal-800 dark:text-teal-300', head: 'from-teal-50 to-white dark:from-teal-400/10 dark:to-transparent' },
  rose: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300', ring: 'ring-rose-100 dark:ring-rose-400/20', title: 'text-rose-800 dark:text-rose-300', head: 'from-rose-50 to-white dark:from-rose-400/10 dark:to-transparent' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300', ring: 'ring-indigo-100 dark:ring-indigo-400/20', title: 'text-indigo-800 dark:text-indigo-300', head: 'from-indigo-50 to-white dark:from-indigo-400/10 dark:to-transparent' },
}

function Group({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent: Accent; children: React.ReactNode }) {
  const a = ACCENTS[accent]
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm ring-1 dark:border-slate-700 dark:bg-slate-900/60 ${a.ring}`}>
      <div className={`flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r px-4 py-2.5 dark:border-slate-800 ${a.head}`}>
        <span className={`flex size-7 items-center justify-center rounded-xl shadow-sm ${a.chip}`}>{icon}</span>
        <h3 className={`text-[13px] font-bold uppercase tracking-wide ${a.title}`}>{title}</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </section>
  )
}

function Row({
  label, value, mono, copyText, copyLabel, href,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
  /** 2026-08-14 (4. pont): ha megadott, másolás-gomb áll a sor végén. */
  copyText?: string
  copyLabel?: string
  /** mailto:/tel:/https link — telefonon ez a leggyakoribb művelet. */
  href?: string
}) {
  const empty = value == null || value === '' || value === EMPTY
  // A hosszú, szóköz nélküli értékek (IBAN, adószám, e-mail) mobilon kilógtak
  // és levágódtak → min-w-0 + break-all a mono, break-words a szöveges értékekre.
  const valueClass = `min-w-0 text-right text-sm ${
    empty
      ? 'italic text-slate-300 dark:text-slate-600'
      : `font-semibold text-slate-800 dark:text-slate-100 ${mono ? 'break-all tabular-nums' : 'break-words'}`
  }`
  const inner = empty ? EMPTY : value
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex min-w-0 items-start gap-1">
        {href && !empty ? (
          <a href={href} className={`${valueClass} underline-offset-2 hover:underline`} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {inner}
          </a>
        ) : (
          <span className={valueClass}>{inner}</span>
        )}
        {copyText && !empty && <CopyButton value={copyText} label={copyLabel || label} className="-mr-1.5 -mt-0.5" />}
      </span>
    </div>
  )
}

/** A főbb adatok szöveges összefoglalója — a Másolás és a Megosztás közös forrása. */
function buildShareText(data: CongregationSummaryData, publicUrl: string | null): string {
  const sorok: string[] = [data.nevHu || data.nev || 'Gyülekezet']
  if (data.dioceseName) sorok.push(data.dioceseName)
  sorok.push('')
  if (data.cimSor) sorok.push(`Cím: ${data.cimSor}`)
  if (data.email) sorok.push(`E-mail: ${data.email}`)
  if (data.telefon) sorok.push(`Telefon: ${data.telefon}`)
  if (data.web) sorok.push(`Weboldal: ${data.web}`)
  if (data.adoszam) sorok.push(`Adószám (CIF): ${data.adoszam}`)
  for (const b of data.banks) {
    if (b.iban) sorok.push(`${b.bank_neve || 'Bank'} (${b.valuta}): ${b.iban}`)
  }
  if (publicUrl) sorok.push('', publicUrl)
  return sorok.join('\n')
}

export function CongregationSummary({
  data,
  onEdit,
}: {
  data: CongregationSummaryData
  onEdit: () => void
}) {
  // 2026-08-14 (4. pont): gyors megosztás + másolás. Az abszolút publikus URL
  // eseménykezelőben épül (window.location.origin) — staging/lokál is helyes.
  const publicUrlOf = () =>
    data.publicSlug ? `${window.location.origin}/gy/${data.publicSlug}` : null

  async function handleShare() {
    const publicUrl = publicUrlOf()
    const text = buildShareText(data, publicUrl)
    const title = data.nevHu || data.nev || 'Gyülekezet'
    // A birthday-card-dialog kiforrott mintája: canShare-ellenőrzés, az
    // AbortError = a felhasználó mégse — az NEM hiba, nincs toast.
    if (navigator.share) {
      try {
        await navigator.share(publicUrl ? { title, text, url: publicUrl } : { title, text })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        // NotAllowedError vagy más → vágólap-fallback lentebb.
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        toast.success('A megosztás itt nem érhető el — a főbb adatok a vágólapra kerültek.')
        return
      } catch { /* a lenti hibaüzenet jön */ }
    }
    toast.error('Sem a megosztás, sem a vágólap nem érhető el ebben a böngészőben.')
  }

  async function handleCopyAll() {
    if (!navigator.clipboard?.writeText) {
      toast.error('A vágólap nem érhető el ebben a böngészőben.')
      return
    }
    try {
      await navigator.clipboard.writeText(buildShareText(data, publicUrlOf()))
      toast.success('A főbb adatok a vágólapra kerültek — beillesztheted levélbe, üzenetbe.')
    } catch {
      toast.error('A másolás nem sikerült.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Színes hero — címer + név + gombok */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-teal-500 via-emerald-500 to-sky-600 p-5 text-white shadow-lg sm:p-6">
        <div className="absolute -right-8 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-12 left-10 size-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white shadow-md">
              {data.cimerUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={data.cimerUrl} alt="Címer" className="h-full w-full object-contain p-1.5" />
                : <Building2 className="size-9 text-teal-500" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">Gyülekezetünk adatai</p>
              <h2 className="font-heading text-2xl leading-tight sm:text-3xl">{data.nevHu || data.nev || 'Gyülekezet'}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {data.dioceseName && <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium backdrop-blur">{data.dioceseName}</span>}
                {data.status === 'inactive'
                  ? <span className="rounded-full bg-amber-300/90 px-2.5 py-0.5 font-semibold text-amber-900">Inaktív</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-medium backdrop-blur"><ShieldCheck className="size-3" /> Aktív</span>}
              </div>
            </div>
          </div>
          {/* 2026-08-14 (4. pont): flex-wrap — mobilon a gombok eddig egy nem
              törő sorban ragadtak; + gyors Megosztás és Másolás gomb. */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/90 text-slate-800 hover:bg-white"
              onClick={() => void handleShare()}
              title={data.publicSlug ? 'A főbb adatok + a publikus oldal linkjének megosztása' : 'A főbb adatok megosztása'}
            >
              <Share2 className="mr-1.5 size-4" /> Megosztás
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/90 text-slate-800 hover:bg-white"
              onClick={() => void handleCopyAll()}
              title="A főbb adatok másolása szövegként (levélbe, üzenetbe illeszthető)"
            >
              <CopyIcon className="mr-1.5 size-4" /> Másolás
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/90 text-slate-800 hover:bg-white"
              onClick={() => void printToBrowser(buildCongregationSummaryPrintHtml(data))}
            >
              <Printer className="mr-1.5 size-4" /> Nyomtatás
            </Button>
            <Button
              size="sm"
              className="bg-slate-900/85 text-white hover:bg-slate-900"
              onClick={onEdit}
            >
              <Pencil className="mr-1.5 size-4" /> Szerkesztés a beállításokban
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Group icon={<Building2 className="size-4" />} title="Megnevezések" accent="sky">
          <Row label="Hivatalos név" value={data.nev || undefined} copyText={data.nev} copyLabel="Hivatalos név" />
          <Row label="Magyar név" value={data.nevHu || undefined} />
          <Row label="Román név" value={data.nevRo || undefined} copyText={data.nevRo} copyLabel="Román név" />
          <Row label="Angol név" value={data.nevEn || undefined} />
          <Row label="Adószám (CIF)" value={data.adoszam || undefined} mono copyText={data.adoszam} copyLabel="Adószám" />
          {data.bejegyzesiszam ? <Row label="Bejegyzési szám" value={data.bejegyzesiszam} mono copyText={data.bejegyzesiszam} copyLabel="Bejegyzési szám" /> : null}
        </Group>

        <Group icon={<Landmark className="size-4" />} title="Egyházi hovatartozás" accent="indigo">
          <Row label="Egyházkerület" value={data.districtName || undefined} />
          <Row label="Egyházmegye" value={data.dioceseName || undefined} />
        </Group>

        <Group icon={<MapPin className="size-4" />} title="Hivatalos cím" accent="rose">
          <Row label="Cím" value={data.cimSor || undefined} copyText={data.cimSor} copyLabel="Cím" />
        </Group>

        <Group icon={<Phone className="size-4" />} title="Elérhetőség" accent="teal">
          <Row label="E-mail" value={data.email || undefined} copyText={data.email} copyLabel="E-mail cím" href={data.email ? `mailto:${data.email}` : undefined} />
          <Row label="Telefon" value={data.telefon || undefined} mono copyText={data.telefon} copyLabel="Telefonszám" href={data.telefon ? `tel:${data.telefon.replace(/\s/g, '')}` : undefined} />
          <Row label="Weboldal" value={data.web || undefined} copyText={data.web} copyLabel="Weboldal" href={data.web ? (data.web.startsWith('http') ? data.web : `https://${data.web}`) : undefined} />
        </Group>

        <Group icon={<Wallet className="size-4" />} title="Bankszámlák" accent="violet">
          {data.banks.length === 0
            ? <Row label="Bankszámla" value={undefined} />
            : data.banks.map((b, i) => (
                <Row
                  key={i}
                  label={`${b.bank_neve || 'Bank'}${b.is_default ? ' · fő' : ''} (${b.valuta})`}
                  value={b.iban || undefined}
                  mono
                  copyText={b.iban || undefined}
                  copyLabel={`${b.bank_neve || 'Bank'} IBAN`}
                />
              ))}
        </Group>

        <Group icon={<Coins className="size-4" />} title="Pénzügyi alap" accent="emerald">
          <Row label="Éves egyházfenntartás" value={ron(data.evesJarulek)} mono />
          <Row label="Kedvezményes alapösszeg" value={ron(data.jarulekKedvezmenyes)} mono />
          <Row label="Járulék határidő" value={data.jarulekHatarid || undefined} mono />
          <Row label="Tartozás-számítás" value="Akkori évi besorolás (rögzített)" />
        </Group>

        {data.discounts.length > 0 && (
          <Group icon={<PiggyBank className="size-4" />} title="Kedvezmények" accent="amber">
            {data.discounts.map((d, i) => <Row key={i} label={`#${i + 1}`} value={d} />)}
          </Group>
        )}

        {data.pastors.length > 0 && (
          <Group icon={<Users className="size-4" />} title="Lelkészek" accent="sky">
            {data.pastors.map((p, i) => {
              const start = huDate(p.started_at)
              const end = huDate(p.ended_at)
              const period = start ? `${start} – ${end || 'jelenleg'}` : (end || undefined)
              return <Row key={i} label={p.full_name || 'Lelkész'} value={period} />
            })}
          </Group>
        )}
      </div>

      <p className="px-1 text-center text-xs text-slate-400 dark:text-slate-500">
        Ez az ablak csak megtekintésre és nyomtatásra szolgál. A szerkesztés a Gyülekezet beállítása ablakban érhető el.
      </p>
    </div>
  )
}

// ── Nyomtatható HTML (izolált iframe/ablak — csak hex színek, A4) ──────────────
export function buildCongregationSummaryPrintHtml(data: CongregationSummaryData): string {
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
  const rowsHtml = (rows: Array<[string, string | null | undefined]>) =>
    rows
      .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${v ? esc(v) : '—'}</td></tr>`)
      .join('')

  const section = (title: string, color: string, inner: string) =>
    `<div class="section"><h2 style="color:${color};border-color:${color}22;background:${color}0d">${esc(title)}</h2><table>${inner}</table></div>`

  const banks = data.banks.length
    ? data.banks.map((b) => [`${b.bank_neve || 'Bank'}${b.is_default ? ' · fő' : ''} (${b.valuta})`, b.iban] as [string, string | null])
    : [['Bankszámla', null] as [string, null]]

  const pastors = data.pastors.map((p) => {
    const start = huDate(p.started_at)
    const end = huDate(p.ended_at)
    return [p.full_name || 'Lelkész', start ? `${start} – ${end || 'jelenleg'}` : (end || '')] as [string, string]
  })

  const today = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(data.nevHu || data.nev || 'Gyülekezet')} — adatlap</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 16mm 15mm; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; }
  .head img { width: 66px; height: 66px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 12px; padding: 4px; }
  .head h1 { font-size: 21px; margin: 0; color: #0f172a; }
  .head .sub { color: #0f766e; font-size: 12px; margin-top: 3px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .section { break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin: 0; padding: 6px 10px; border-bottom: 1px solid; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 10px; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
  tr:last-child td { border-bottom: none; }
  td.k { color: #64748b; width: 42%; }
  td.v { color: #0f172a; font-weight: 600; text-align: right; }
  .foot { margin-top: 16px; text-align: right; color: #94a3b8; font-size: 10px; }
</style></head><body>
  <div class="head">
    ${data.cimerUrl ? `<img src="${esc(data.cimerUrl)}" alt="címer">` : ''}
    <div>
      <h1>${esc(data.nevHu || data.nev || 'Gyülekezet')}</h1>
      <div class="sub">${esc([data.districtName, data.dioceseName].filter(Boolean).join(' · ') || 'Gyülekezeti adatlap')}</div>
    </div>
  </div>
  <div class="grid">
    ${section('Megnevezések', '#0369a1', rowsHtml([
      ['Hivatalos név', data.nev],
      ['Magyar név', data.nevHu],
      ['Román név', data.nevRo],
      ['Angol név', data.nevEn],
      ['Adószám (CIF)', data.adoszam],
      ...(data.bejegyzesiszam ? [['Bejegyzési szám', data.bejegyzesiszam] as [string, string]] : []),
    ]))}
    ${section('Egyházi hovatartozás', '#4338ca', rowsHtml([
      ['Egyházkerület', data.districtName],
      ['Egyházmegye', data.dioceseName],
    ]))}
    ${section('Hivatalos cím', '#be123c', rowsHtml([['Cím', data.cimSor]]))}
    ${section('Elérhetőség', '#0f766e', rowsHtml([
      ['E-mail', data.email],
      ['Telefon', data.telefon],
      ['Weboldal', data.web],
    ]))}
    ${section('Bankszámlák', '#6d28d9', rowsHtml(banks))}
    ${section('Pénzügyi alap', '#047857', rowsHtml([
      ['Éves egyházfenntartás', ron(data.evesJarulek)],
      ['Kedvezményes alapösszeg', ron(data.jarulekKedvezmenyes)],
      ['Járulék határidő', data.jarulekHatarid],
      ['Tartozás-számítás', 'Akkori évi besorolás (rögzített)'],
    ]))}
    ${data.discounts.length ? section('Kedvezmények', '#b45309', rowsHtml(data.discounts.map((d, i) => [`#${i + 1}`, d] as [string, string]))) : ''}
    ${pastors.length ? section('Lelkészek', '#0369a1', rowsHtml(pastors)) : ''}
  </div>
  <div class="foot">Kartotéka · nyomtatva: ${esc(today)}</div>
</body></html>`
}
