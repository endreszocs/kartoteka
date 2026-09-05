/**
 * Szállítói számla — NYOMTATHATÓ ADATLAP HTML-építő (2026-09-04, Endre 3. kérése).
 *
 * Endre: „A fakturák kinézete legyen ilyen, a csatolt képhez hasonló nyomtatási
 * képpel! Legyen jelölve az is, hogy a Kartotékából volt nyomtatva!"
 *
 * A minta az ANAF/Oblio által generált e-Factura lap SZERKEZETE: fejléc, két
 * hasáb (Furnizor / Client), sortétel-táblázat, összesítő, lábjegyzet. Amit
 * SZÁNDÉKOSAN NEM másolunk: az ANAF logót és feliratot (idegen hatóság
 * arculata) és az „e-Factura generată … cu Oblio" lábat (másik cég védjegye).
 * Az SPV-indexek (Index încărcare / descărcare) elvileg sem állíthatók elő —
 * azok az ANAF SPV üzenet-metaadatai, amikhez nincs hozzáférésünk.
 *
 * ADATFORRÁS: a `szallitoi_szamla` tábla CSAK fejléc-szintű; a sortételek, a
 * címek, az IBAN és az ÁFA-bontás a tárolt e-Factura XML-ből jönnek
 * (`parseUblSzamlaReszletek`), a lap betöltésekor. Ha az XML nem érhető el, a
 * lap NEM hazudik: HANGOS sáv mondja meg, hogy a tételek hiányoznak.
 *
 * ⛔ XSS: minden mező KÜLSŐ eredetű (idegen cég XML-je) — MINDEN érték `esc()`-en
 *    megy át. A print-engine same-originben futtatja a HTML-t, sandbox nélkül.
 *
 * Tiszta függvény, hálózat és React nélkül — a szerver-action és a lap is ezt hívja.
 */

import type { SzallitoiSzamla } from './szamla-types'
import type { UblSzamlaReszletek, UblFel, UblTetel } from '@/lib/oblio/ubl-parser'

export interface SzamlaNyomtatvanyVevo {
  nev: string | null
  cif: string | null
  cim: string | null
  megye: string | null
  orszag: string | null
  telefon: string | null
  email: string | null
}

export interface SzamlaNyomtatvanyPar {
  datum: string | null
  iratszam: string | null
  osszegResz: number
  hely: string
  ervenytelen: boolean
}

export interface SzamlaNyomtatvanyInput {
  szamla: SzallitoiSzamla
  /** null = az XML nem érhető el / nem parsolható → a lap kimondja. */
  reszletek: UblSzamlaReszletek | null
  /** Miért nincs XML (ha nincs) — a hangos sávba kerül. */
  xmlHiba: string | null
  /** A gyülekezet (vevő) hivatalos adatai — a szállító XML-jében állóval kiegészítve. */
  vevo: SzamlaNyomtatvanyVevo
  parok: SzamlaNyomtatvanyPar[]
  /** ISO időbélyeg — a hívó adja (a lap tiszta). */
  nyomtatasIdeje: string
  /** Aki nyomtatta (e-mail vagy név) — a lábjegyzetbe. */
  nyomtatta: string | null
}

export interface SzamlaNyomtatvanyResult {
  title: string
  html: string
  sheetCount: number
}

/**
 * A szerver-action válasza az előnézet-dialógusnak. ITT él, nem az action
 * fájljában: a Next.js 16 alatt a 'use server' fájl CSAK async függvényt
 * exportálhat — egy `export type` ott a build-et buktatja (a CI zölden átmegy).
 */
export type SzamlaNyomtatvanyValasz =
  | { html: string; title: string; sheetCount: number; xmlHiba: string | null; error: null }
  | { html: null; title: null; sheetCount: 0; xmlHiba: null; error: string }

function esc(v: unknown): string {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** 25481 → „25481.00" (az ANAF/Oblio lap alakja: pont a tizedes, nincs ezres-elválasztó). */
function penz(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toFixed(2)
}

function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)
  const [y, m, n] = d.split('-')
  return y && m && n ? `${n}.${m}.${y}` : d
}

/** UN/ECE Rec 20 mértékegység-kód → román rövidítés (az ANAF-lap „U.M." oszlopa). */
const MERTEKEGYSEG: Record<string, string> = {
  H87: 'buc', C62: 'buc', EA: 'buc', XPP: 'pachet', XBX: 'cutie',
  KGM: 'kg', GRM: 'g', TNE: 't', LTR: 'l', MLT: 'ml', MTQ: 'm³', MTK: 'm²', MTR: 'm', CMT: 'cm', MMT: 'mm',
  HUR: 'oră', DAY: 'zi', MON: 'lună', ANN: 'an', MIN: 'min', KWH: 'kWh', SET: 'set', PR: 'pereche',
}
function um(kod: string | null): string {
  if (!kod) return '—'
  return MERTEKEGYSEG[kod.toUpperCase()] ?? kod
}

function felBlokk(cim: string, f: UblFel | null, extra: { iban?: string[]; cif?: string | null; nev?: string | null; cimSor?: string | null; megye?: string | null; orszag?: string | null; telefon?: string | null; email?: string | null }): string {
  const nev = extra.nev ?? f?.nev ?? null
  const cif = extra.cif ?? f?.cui ?? null
  const cimSor = extra.cimSor ?? ([f?.utca, f?.iranyitoszam, f?.varos].filter(Boolean).join(', ') || null)
  const megye = extra.megye ?? f?.megye ?? null
  const orszag = extra.orszag ?? f?.orszag ?? null
  const tel = extra.telefon ?? f?.telefon ?? null
  const email = extra.email ?? f?.email ?? null
  const sor = (k: string, v: string | null | undefined) =>
    v ? `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>` : ''
  return `
    <div class="party">
      <div class="party-cap">${esc(cim)}</div>
      <div class="party-name">${esc(nev ?? '—')}</div>
      ${sor('Reg. com.:', f?.cegjegyzek)}
      ${sor('CIF:', cif)}
      ${sor('Adresa:', cimSor)}
      ${megye ? sor('Județ:', megye) : ''}
      ${orszag ? sor('Țara:', orszag) : ''}
      ${(extra.iban ?? []).map((i) => sor('IBAN:', i)).join('')}
      ${sor('Tel.:', tel)}
      ${sor('Email:', email)}
    </div>`
}

function tetelSor(t: UblTetel, i: number): string {
  const afa = t.afa ?? (t.netto != null && t.afaSzazalek != null ? Math.round(t.netto * t.afaSzazalek) / 100 : null)
  const nev = [t.megnevezes, t.leiras && t.leiras !== t.megnevezes ? t.leiras : null].filter(Boolean).join(' — ')
  return `
    <tr>
      <td class="c">${esc(t.sorszam ?? String(i + 1))}</td>
      <td>${esc(nev || '—')}</td>
      <td class="c">${esc(um(t.mertekegyseg))}</td>
      <td class="r">${t.mennyiseg == null ? '—' : esc(String(t.mennyiseg))}</td>
      <td class="r">${esc(penz(t.egysegar))}</td>
      <td class="r">${esc(penz(t.netto))}</td>
      <td class="r">${esc(penz(afa))}</td>
    </tr>`
}

function styles(): string {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, 'Liberation Sans', sans-serif; color: #1c2430; margin: 0; background: #e2e8f0; padding: 18px 0; font-size: 11px; line-height: 1.35; }
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 14mm 16mm 18mm 16mm; page-break-after: always; position: relative; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }

    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand .mark { width: 34px; height: 34px; border-radius: 9px; background: #6b8e4e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; letter-spacing: .02em; }
    .brand .t1 { font-size: 13px; font-weight: 700; letter-spacing: .06em; color: #3f5a2e; }
    .brand .t2 { font-size: 9.5px; color: #64748b; margin-top: 1px; }
    .doc { text-align: left; min-width: 82mm; }
    .doc .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 2.5px solid #2f4a8a; padding-bottom: 4px; }
    .doc .kind { font-size: 20px; color: #1e3a6e; }
    .doc .num { font-size: 20px; font-weight: 700; color: #1e3a6e; font-variant-numeric: tabular-nums; }
    .doc .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin-top: 6px; font-size: 10.5px; }
    .doc .meta b { color: #1c2430; }

    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 9mm; }
    .party-cap { font-weight: 700; font-size: 10.5px; color: #1c2430; }
    .party-name { font-weight: 700; font-size: 12.5px; margin: 2px 0 6px; }
    .kv { display: grid; grid-template-columns: 22mm 1fr; gap: 6px; padding: 1px 0; }
    .kv .k { font-weight: 700; color: #334155; }
    .kv .v { word-break: break-word; }

    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8mm; font-size: 10.5px; }
    table.items thead th { border-top: 2.5px solid #2f4a8a; border-bottom: 2px solid #2f4a8a; padding: 6px 5px; font-weight: 700; color: #1c2430; vertical-align: bottom; }
    table.items thead th small { display: block; font-weight: 400; color: #64748b; font-size: 9px; }
    table.items tbody td { padding: 6px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; }
    table.items tbody tr:last-child td { border-bottom: 1.5px solid #94a3b8; }
    .c { text-align: center; } .r { text-align: right; font-variant-numeric: tabular-nums; }
    table.items thead th.r, table.items thead th.c { text-align: inherit; }

    .totals { display: flex; justify-content: flex-end; margin-top: 4px; }
    .totals table { border-collapse: collapse; min-width: 96mm; font-size: 10.5px; }
    .totals td { padding: 4px 6px; }
    .totals td.l { color: #334155; }
    .totals td.r { font-variant-numeric: tabular-nums; }
    .totals tr.sub td { border-bottom: 2px solid #2f4a8a; }
    .totals tr.grand td { font-size: 15px; font-weight: 700; padding-top: 8px; }

    .note { margin-top: 8mm; font-size: 10px; color: #334155; }
    .note .kv { grid-template-columns: 44mm 1fr; }
    .warn { margin-top: 8mm; border: 1.5px solid #f59e0b; background: #fffbeb; color: #7c2d12; padding: 8px 10px; border-radius: 6px; font-size: 10.5px; }
    .warn b { display: block; margin-bottom: 2px; }

    .book { margin-top: 8mm; border-top: 1px solid #cbd5e1; padding-top: 6px; }
    .book h3 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #64748b; }
    .book table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .book td, .book th { padding: 3px 5px; border-bottom: 1px solid #eef2f7; text-align: left; }
    .book th { color: #64748b; font-weight: 600; }
    .book .dead { color: #94a3b8; text-decoration: line-through; }
    .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 700; border: 1px solid; }
    .pill.ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
    .pill.wait { background: #fffbeb; color: #92400e; border-color: #fde68a; }
    .pill.credit { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; }

    .foot { position: absolute; left: 16mm; right: 16mm; bottom: 9mm; border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; justify-content: space-between; gap: 10mm; font-size: 9px; color: #64748b; }
    .foot .kart { font-weight: 700; color: #3f5a2e; }
  `
}

export function buildSzallitoiSzamlaHtml(input: SzamlaNyomtatvanyInput): SzamlaNyomtatvanyResult {
  const { szamla, reszletek: r, xmlHiba, vevo, parok, nyomtatasIdeje, nyomtatta } = input
  const jovairo = szamla.tipus === 'jovairo'
  const kind = jovairo ? 'Notă de credit' : 'Factura'
  const szam = szamla.szamla_szam || '—'
  const penznem = (r?.osszesito.penznem || szamla.penznem || 'RON').toUpperCase()
  const eloParok = parok.filter((p) => !p.ervenytelen)
  const lejart = !szamla.kifizetve && !!szamla.fizetesi_hatarido && szamla.fizetesi_hatarido < nyomtatasIdeje.slice(0, 10)

  // ── Fejléc-meta: kiállítás, határidő, ÁFA-kulcs (ha egységes) ──
  const kulcs = r?.egysegesAfaKulcs
  const kulcsFelirat = kulcs == null ? null : `${kulcs}%${kulcs === 21 || kulcs === 19 ? ' - Normala' : kulcs === 0 ? ' - Scutit/0' : ' - Redusa'}`

  // ── Felek ──
  const szallitoHtml = felBlokk('Furnizor:', r?.szallito ?? null, {
    nev: szamla.szallito_nev ?? r?.szallito.nev ?? null,
    cif: szamla.szallito_cui ?? r?.szallito.cui ?? null,
    iban: r?.iban ?? [],
  })
  const vevoHtml = felBlokk('Client:', r?.vevo ?? null, {
    nev: vevo.nev ?? r?.vevo.nev ?? null,
    cif: vevo.cif ?? r?.vevo.cui ?? null,
    cimSor: vevo.cim ?? null,
    megye: vevo.megye ?? r?.vevo.megye ?? null,
    orszag: vevo.orszag ?? r?.vevo.orszag ?? null,
    telefon: vevo.telefon ?? r?.vevo.telefon ?? null,
    email: vevo.email ?? r?.vevo.email ?? null,
  })

  // ── Tételek + összesítő ──
  const tetelek = r?.tetelek ?? []
  const netto = r?.osszesito.netto ?? r?.osszesito.tetelekNetto ?? null
  const afaOsszesen = r?.osszesito.afaOsszesen ?? null
  const eloleg = r?.osszesito.eloleg ?? null
  const fizetendo = r?.osszesito.fizetendo ?? szamla.osszeg
  const afaBontasSorok = (r?.afaBontas ?? [])
    .filter((a) => a.szazalek != null)
    .map((a) => `<tr><td class="l">TVA ${esc(String(a.szazalek))}% (bază ${esc(penz(a.alap))})</td><td class="r">${esc(penz(a.afa))}</td></tr>`)
    .join('')

  const itemsHtml = tetelek.length > 0
    ? `
    <table class="items">
      <colgroup>
        <col style="width:9mm"><col><col style="width:14mm"><col style="width:14mm"><col style="width:26mm"><col style="width:24mm"><col style="width:22mm">
      </colgroup>
      <thead>
        <tr>
          <th class="c">Nr.</th>
          <th>Denumire produs/serviciu</th>
          <th class="c">U.M.</th>
          <th class="r">Cant.</th>
          <th class="r">Preț unitar<small>(${esc(penznem)} fără TVA)</small></th>
          <th class="r">Valoare<small>(${esc(penznem)})</small></th>
          <th class="r">TVA<small>(${esc(penznem)})</small></th>
        </tr>
      </thead>
      <tbody>${tetelek.map(tetelSor).join('')}</tbody>
    </table>
    <div class="totals">
      <table>
        <tr class="sub"><td class="l">Subtotal</td><td class="r">${esc(penz(netto))}</td></tr>
        ${afaBontasSorok || (afaOsszesen != null ? `<tr><td class="l">TVA</td><td class="r">${esc(penz(afaOsszesen))}</td></tr>` : '')}
        ${eloleg != null && eloleg !== 0 ? `<tr><td class="l">Avans achitat</td><td class="r">−${esc(penz(Math.abs(eloleg)))}</td></tr>` : ''}
        <tr class="grand"><td class="l">Total plată</td><td class="r">${esc(penz(fizetendo))} ${esc(penznem)}</td></tr>
      </table>
    </div>`
    : `
    <div class="warn">
      <b>A sortételek nem szerepelnek ezen a lapon.</b>
      ${esc(xmlHiba || 'Az eredeti e-Factura XML nem érhető el, ezért csak a tárolt fejléc-adatok nyomtathatók.')}
      A hiteles bizonylat az ANAF e-Factura XML / PDF — a Számlák nézetből letölthető.
    </div>
    <div class="totals">
      <table>
        <tr class="grand"><td class="l">Total plată</td><td class="r">${esc(penz(szamla.osszeg))} ${esc(penznem)}</td></tr>
      </table>
    </div>`

  // ── Megjegyzések (kiállítói + saját) ──
  const kiallitoiJegyzetek = (r?.megjegyzesek ?? []).filter((m) => m.length <= 400)
  const noteHtml = `
    <div class="note">
      ${r?.vevoHivatkozas ? `<div class="kv"><span class="k">Referință cumpărător:</span><span class="v">${esc(r.vevoHivatkozas)}</span></div>` : ''}
      ${r?.megrendelesSzam ? `<div class="kv"><span class="k">Comandă:</span><span class="v">${esc(r.megrendelesSzam)}</span></div>` : ''}
      ${r?.fizetesiFeltetel ? `<div class="kv"><span class="k">Condiții de plată:</span><span class="v">${esc(r.fizetesiFeltetel)}</span></div>` : ''}
      ${r?.fej.hivatkozottSzamla ? `<div class="kv"><span class="k">Stornează factura:</span><span class="v">${esc(r.fej.hivatkozottSzamla)}</span></div>` : ''}
      <div class="kv"><span class="k">Nyilvántartási azonosító (Kartotéka):</span><span class="v">${esc(szamla.anaf_uuid)}</span></div>
      ${kiallitoiJegyzetek.map((m) => `<div class="kv"><span class="k">Notă:</span><span class="v">${esc(m)}</span></div>`).join('')}
      ${szamla.megjegyzes ? `<div class="kv"><span class="k">Megjegyzés:</span><span class="v">${esc(szamla.megjegyzes)}</span></div>` : ''}
    </div>`

  // ── A mi többletünk: fizetettség + könyvelési párok ──
  const allapotHtml = `
    <div class="book">
      <h3>Állapot a Kartotékában · Stare în Kartotéka</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        ${jovairo ? '<span class="pill credit">Jóváíró / sztornó · Notă de credit</span>' : ''}
        <span class="pill ${szamla.kifizetve ? 'ok' : 'wait'}">${szamla.kifizetve ? 'Kifizetve · Achitată' : lejart ? 'Kifizetetlen — LEJÁRT · Neachitată, scadență depășită' : 'Kifizetetlen · Neachitată'}</span>
        <span class="pill ${eloParok.length > 0 ? 'ok' : 'wait'}">${eloParok.length > 0 ? `Könyvelve — ${esc([...new Set(eloParok.map((p) => p.hely))].join(', '))}` : 'Még nincs a könyvelésben'}</span>
      </div>
      ${parok.length > 0 ? `
      <table>
        <thead><tr><th>Dátum</th><th>Iratszám</th><th>Hely</th><th class="r">Összeg-rész</th></tr></thead>
        <tbody>
          ${parok.map((p) => `<tr class="${p.ervenytelen ? 'dead' : ''}"><td>${esc(datum(p.datum))}</td><td>${esc(p.iratszam || '—')}${p.ervenytelen ? ' (sztornózott)' : ''}</td><td>${esc(p.hely)}</td><td class="r">${esc(penz(p.osszegResz))} RON</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
    </div>`

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>${esc(kind)} ${esc(szam)} — ${esc(szamla.szallito_nev || '')}</title>
<style>${styles()}</style>
</head>
<body data-sheet-count="1">
<div class="sheet">
  <div class="head">
    <div class="brand">
      <div class="mark">K</div>
      <div>
        <div class="t1">KARTOTÉKA</div>
        <div class="t2">Befogadott e-Factura · nyomtatott adatlap</div>
      </div>
    </div>
    <div class="doc">
      <div class="row"><span class="kind">${esc(kind)}</span><span class="num">${esc(szam)}</span></div>
      <div class="meta">
        <div><b>Data emiterii:</b> ${esc(datum(szamla.kiallitas_datum))}</div>
        <div>${kulcsFelirat ? `<b>Cota TVA</b> (${esc(kulcsFelirat)})` : ''}</div>
        <div><b>Termen plată:</b> ${esc(datum(szamla.fizetesi_hatarido))}</div>
        <div></div>
      </div>
    </div>
  </div>

  <div class="parties">
    ${szallitoHtml}
    ${vevoHtml}
  </div>

  ${itemsHtml}
  ${noteHtml}
  ${allapotHtml}

  <div class="foot">
    <div><span class="kart">Kartotékából nyomtatva</span> · ${esc(datum(nyomtatasIdeje))}${nyomtatta ? ` · ${esc(nyomtatta)}` : ''}</div>
    <div>Ez a lap adatlap, NEM a hiteles bizonylat — az az ANAF e-Factura XML / PDF.</div>
  </div>
</div>
</body>
</html>`

  return { title: `${kind} ${szam}`, html, sheetCount: 1 }
}
