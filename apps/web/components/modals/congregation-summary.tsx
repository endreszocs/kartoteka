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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
}

const EMPTY = '—'
const ron = (n: number) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`
const huDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }) : null
// 2026-07-17 (F5, Q6): a tartozás-számítási mód kivezetve — mindig „akkori".

// ── Színpaletták kategóriánként (élénk, „apple settings" jelleg) ──────────────
type Accent = 'sky' | 'violet' | 'emerald' | 'amber' | 'teal' | 'rose' | 'indigo'
const ACCENTS: Record<Accent, { chip: string; ring: string; title: string; head: string }> = {
  sky: { chip: 'bg-sky-100 text-sky-700', ring: 'ring-sky-100', title: 'text-sky-800', head: 'from-sky-50 to-white' },
  violet: { chip: 'bg-violet-100 text-violet-700', ring: 'ring-violet-100', title: 'text-violet-800', head: 'from-violet-50 to-white' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-100', title: 'text-emerald-800', head: 'from-emerald-50 to-white' },
  amber: { chip: 'bg-amber-100 text-amber-700', ring: 'ring-amber-100', title: 'text-amber-800', head: 'from-amber-50 to-white' },
  teal: { chip: 'bg-teal-100 text-teal-700', ring: 'ring-teal-100', title: 'text-teal-800', head: 'from-teal-50 to-white' },
  rose: { chip: 'bg-rose-100 text-rose-700', ring: 'ring-rose-100', title: 'text-rose-800', head: 'from-rose-50 to-white' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700', ring: 'ring-indigo-100', title: 'text-indigo-800', head: 'from-indigo-50 to-white' },
}

function Group({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent: Accent; children: React.ReactNode }) {
  const a = ACCENTS[accent]
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm ring-1 ${a.ring}`}>
      <div className={`flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r ${a.head} px-4 py-2.5`}>
        <span className={`flex size-7 items-center justify-center rounded-xl ${a.chip} shadow-sm`}>{icon}</span>
        <h3 className={`text-[13px] font-bold uppercase tracking-wide ${a.title}`}>{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  )
}

function Row({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  const empty = value == null || value === '' || value === EMPTY
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className={`text-right text-sm ${empty ? 'italic text-slate-300' : `font-semibold text-slate-800 ${mono ? 'tabular-nums' : ''}`}`}>
        {empty ? EMPTY : value}
      </span>
    </div>
  )
}

export function CongregationSummary({
  data,
  onEdit,
}: {
  data: CongregationSummaryData
  onEdit: () => void
}) {
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
          <div className="flex shrink-0 gap-2">
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
          <Row label="Hivatalos név" value={data.nev || undefined} />
          <Row label="Magyar név" value={data.nevHu || undefined} />
          <Row label="Román név" value={data.nevRo || undefined} />
          <Row label="Angol név" value={data.nevEn || undefined} />
          <Row label="Adószám (CIF)" value={data.adoszam || undefined} mono />
          {data.bejegyzesiszam ? <Row label="Bejegyzési szám" value={data.bejegyzesiszam} mono /> : null}
        </Group>

        <Group icon={<Landmark className="size-4" />} title="Egyházi hovatartozás" accent="indigo">
          <Row label="Egyházkerület" value={data.districtName || undefined} />
          <Row label="Egyházmegye" value={data.dioceseName || undefined} />
        </Group>

        <Group icon={<MapPin className="size-4" />} title="Hivatalos cím" accent="rose">
          <Row label="Cím" value={data.cimSor || undefined} />
        </Group>

        <Group icon={<Phone className="size-4" />} title="Elérhetőség" accent="teal">
          <Row label="E-mail" value={data.email || undefined} />
          <Row label="Telefon" value={data.telefon || undefined} mono />
          <Row label="Weboldal" value={data.web || undefined} />
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

      <p className="px-1 text-center text-xs text-slate-400">
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
