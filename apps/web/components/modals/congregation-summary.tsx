'use client'

/**
 * Gyülekezetünk adatai — READ-ONLY, kategorizált „Apple-beállítások" stílusú összefoglaló,
 * NYOMTATHATÓ formában. (Endre, 2026-07-01.)
 *
 * A „Gyülekezetünk adatai" ablak alap-nézete: a rögzített adatok szép, csoportosított
 * áttekintése + Nyomtatás. A szerkesztés a „Szerkesztés" gombbal érhető el (a meglévő
 * szerkesztő nézet), illetve a hivatalos alapadatok a „Gyülekezet beállítása" ablakban.
 */

import { Landmark, Pencil, Printer, Building2, MapPin, Phone, Wallet, Coins, PiggyBank, Users } from 'lucide-react'
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
const modeLabel = (m: 'akkori' | 'aktualis') => (m === 'aktualis' ? 'Aktuális évi besorolás' : 'Akkori évi besorolás')

// ── On-screen: „Apple-beállítások" jellegű csoport + sor ──────────────────────
function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-lg bg-slate-200/70 text-slate-600">{icon}</span>
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
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
      <span className={`text-right text-sm ${empty ? 'italic text-slate-300' : `font-medium text-slate-800 ${mono ? 'tabular-nums' : ''}`}`}>
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
  const addressLine = data.cimSor || EMPTY

  return (
    <div className="space-y-4">
      {/* Fejléc: címer + név + gombok */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {data.cimerUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={data.cimerUrl} alt="Címer" className="h-full w-full object-contain p-1.5" />
              : <Building2 className="size-8 text-slate-300" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-2xl text-slate-800">{data.nevHu || data.nev || 'Gyülekezet'}</h2>
            {data.nev && data.nev !== data.nevHu && <p className="text-sm text-slate-500">{data.nev}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {data.dioceseName && <span className="rounded-full bg-white px-2 py-0.5 shadow-sm">{data.dioceseName}</span>}
              {data.status === 'inactive' && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Inaktív</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void printToBrowser(buildCongregationSummaryPrintHtml(data))}>
            <Printer className="mr-1.5 size-4" /> Nyomtatás
          </Button>
          <Button size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 size-4" /> Szerkesztés
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Group icon={<Landmark className="size-3.5" />} title="Egyházi hovatartozás">
          <Row label="Egyházkerület" value={data.districtName || undefined} />
          <Row label="Egyházmegye" value={data.dioceseName || undefined} />
        </Group>

        <Group icon={<Building2 className="size-3.5" />} title="Megnevezések">
          <Row label="Hivatalos név" value={data.nev || undefined} />
          <Row label="Magyar név" value={data.nevHu || undefined} />
          <Row label="Román név" value={data.nevRo || undefined} />
          <Row label="Angol név" value={data.nevEn || undefined} />
          <Row label="Adószám (CIF)" value={data.adoszam || undefined} mono />
          {data.bejegyzesiszam ? <Row label="Bejegyzési szám" value={data.bejegyzesiszam} mono /> : null}
        </Group>

        <Group icon={<MapPin className="size-3.5" />} title="Hivatalos cím">
          <Row label="Cím" value={addressLine} />
        </Group>

        <Group icon={<Phone className="size-3.5" />} title="Elérhetőség">
          <Row label="E-mail" value={data.email || undefined} />
          <Row label="Telefon" value={data.telefon || undefined} mono />
          <Row label="Weboldal" value={data.web || undefined} />
        </Group>

        <Group icon={<Wallet className="size-3.5" />} title="Bankszámlák">
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

        <Group icon={<Coins className="size-3.5" />} title="Pénzügyi alap">
          <Row label="Éves egyházfenntartás" value={ron(data.evesJarulek)} mono />
          <Row label="Kedvezményes alapösszeg" value={ron(data.jarulekKedvezmenyes)} mono />
          <Row label="Járulék határidő" value={data.jarulekHatarid || undefined} mono />
          <Row label="Tartozás-számítás" value={modeLabel(data.tartozasSzamitasMod)} />
        </Group>

        {data.discounts.length > 0 && (
          <Group icon={<PiggyBank className="size-3.5" />} title="Kedvezmények">
            {data.discounts.map((d, i) => <Row key={i} label={`#${i + 1}`} value={d} />)}
          </Group>
        )}

        {data.pastors.length > 0 && (
          <Group icon={<Users className="size-3.5" />} title="Lelkészek">
            {data.pastors.map((p, i) => {
              const start = huDate(p.started_at)
              const end = huDate(p.ended_at)
              const period = start ? `${start} – ${end || 'jelenleg'}` : (end || undefined)
              return <Row key={i} label={p.full_name || 'Lelkész'} value={period} />
            })}
          </Group>
        )}
      </div>
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

  const section = (title: string, inner: string) =>
    `<div class="section"><h2>${esc(title)}</h2><table>${inner}</table></div>`

  const banks = data.banks.length
    ? data.banks
        .map((b) => [`${b.bank_neve || 'Bank'}${b.is_default ? ' · fő' : ''} (${b.valuta})`, b.iban] as [string, string | null])
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
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 18mm 16mm; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; }
  .head img { width: 64px; height: 64px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px; }
  .head h1 { font-size: 20px; margin: 0; color: #0f172a; }
  .head .sub { color: #64748b; font-size: 12px; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .section { break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #0f766e; background: #f1f5f9; margin: 0; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
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
    ${section('Megnevezések', rowsHtml([
      ['Hivatalos név', data.nev],
      ['Magyar név', data.nevHu],
      ['Román név', data.nevRo],
      ['Angol név', data.nevEn],
      ['Adószám (CIF)', data.adoszam],
      ...(data.bejegyzesiszam ? [['Bejegyzési szám', data.bejegyzesiszam] as [string, string]] : []),
    ]))}
    ${section('Egyházi hovatartozás', rowsHtml([
      ['Egyházkerület', data.districtName],
      ['Egyházmegye', data.dioceseName],
    ]))}
    ${section('Hivatalos cím', rowsHtml([['Cím', data.cimSor]]))}
    ${section('Elérhetőség', rowsHtml([
      ['E-mail', data.email],
      ['Telefon', data.telefon],
      ['Weboldal', data.web],
    ]))}
    ${section('Bankszámlák', rowsHtml(banks))}
    ${section('Pénzügyi alap', rowsHtml([
      ['Éves egyházfenntartás', ron(data.evesJarulek)],
      ['Kedvezményes alapösszeg', ron(data.jarulekKedvezmenyes)],
      ['Járulék határidő', data.jarulekHatarid],
      ['Tartozás-számítás', modeLabel(data.tartozasSzamitasMod)],
    ]))}
    ${data.discounts.length ? section('Kedvezmények', rowsHtml(data.discounts.map((d, i) => [`#${i + 1}`, d] as [string, string]))) : ''}
    ${pastors.length ? section('Lelkészek', rowsHtml(pastors)) : ''}
  </div>
  <div class="foot">Kartotéka · nyomtatva: ${esc(today)}</div>
</body></html>`
}
