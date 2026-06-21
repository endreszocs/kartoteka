/**
 * Hivatalos pénzügyi bizonylatok nyomtatható HTML-jei.
 *
 *  - buildDecontHtml      → DECONT DE CHELTUIELI / ELSZÁMOLÁS (Elszamolas_2026.xlsx)
 *  - buildDispozitieHtml  → DISPOZIȚIE DE PLATĂ / ÎNCASARE (Dispozitie de plata_2026.xlsx)
 *
 * A nyomtatott dokumentum nyelve ROMÁN (a sablon eredetileg is kétnyelvű
 * címkéket használ: „Avans primit (RON) - kapott előleg"). A kitöltési UI
 * magyar magyarázatai külön, a dialog-body-ban vannak.
 *
 * Tiszta függvények — web és desktop egyaránt használja (élő előnézet + PDF).
 */

import { formatRon, ronInWordsDispozitie } from './ron-in-words'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** yyyy-mm-dd → "yyyy.mm.dd." */
function huDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[1]}.${m[2]}.${m[3]}.` : esc(iso)
}

// ═══════════════════════════════════════════════════════════════════
// DECONT — Elszámolás
// ═══════════════════════════════════════════════════════════════════

export interface DecontDocItem {
  actNr: string
  actType: string // pl. „Fact", „chit", „bon"
  actDate: string // yyyy-mm-dd (a számla SAJÁT, régi dátuma — csak megjelenítésre)
  issuer: string
  explanation: string
  amount: number
}

export interface DecontDocData {
  congregationName: string
  sorszam: number | string
  date: string // yyyy-mm-dd — a decont (könyvelési) dátuma
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  items: DecontDocItem[]
}

export function buildDecontHtml(d: DecontDocData): string {
  const total = d.items.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const diff = total - (Number(d.advance) || 0)
  const dePlata = diff >= 0 // kifizetni a személynek
  const absDiff = Math.abs(diff)

  const rowsHtml = d.items
    .map(
      (r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(r.actNr) || '&nbsp;'}</td>
        <td>${esc(r.actType) || '&nbsp;'}</td>
        <td class="c">${r.actDate ? huDate(r.actDate) : '&nbsp;'}</td>
        <td>${esc(r.issuer) || '&nbsp;'}</td>
        <td>${esc(r.explanation) || '&nbsp;'}</td>
        <td class="r">${formatRon(Number(r.amount) || 0)}</td>
      </tr>`,
    )
    .join('')

  const diffLabel = dePlata
    ? 'Diferența (de plată) - Különbözet, kifizetni:'
    : 'Diferența (de incasare) - Különbözet, visszafizetni:'

  const declaration = dePlata
    ? `Diferernța de plată ${formatRon(absDiff)} lei am primit azi<br/>
       ${formatRon(absDiff)} leit, mint az elszámolás különbözetét, a mai nap megkaptam
       <span class="line">&nbsp;</span>`
    : `Diferența de ${formatRon(absDiff)} lei s-a incasat cu chit nr. din data<br/>
       ${formatRon(absDiff)} leit, mint az elszámolás különbözetét, visszafizettem (nyugtaszám, dátum)
       <span class="line">&nbsp;</span>`

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"/>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Times New Roman", Georgia, serif; color: #14213d; font-size: 12px; margin: 0; }
    /* Képernyős előnézeten emuláljuk a lap-margót (a @page csak nyomtatásnál hat) */
    @media screen { body { padding: 14mm 12mm; } }
    .sheet { width: 100%; }
    .unit-band { border: 1px solid #94a3b8; background: #e7f3e7; height: 26px; }
    .unit-label { font-size: 11px; color: #1f3a5f; margin: 2px 0 10px; }
    .title { text-align: center; font-weight: bold; font-size: 15px; line-height: 1.35; }
    .subnum { text-align: center; font-weight: bold; font-size: 14px; }
    .subhint { text-align: center; font-size: 11px; color: #475569; margin-bottom: 12px; }
    .head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 10px; }
    .head .left { min-width: 45%; }
    .head .right { text-align: right; }
    .head .right div { margin-bottom: 4px; }
    .nev-label { font-size: 11px; color: #475569; }
    .nev { font-weight: bold; font-size: 14px; }
    .jelleg { font-size: 12px; }
    .amt { display: inline-block; min-width: 70px; text-align: right; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #64748b; padding: 4px 6px; vertical-align: top; }
    th { font-size: 11px; text-align: left; background: #f8fafc; white-space: pre-line; }
    td.c { text-align: center; }
    td.r { text-align: right; }
    .total-row td { font-weight: bold; }
    .signs { display: flex; justify-content: space-between; gap: 40px; margin-top: 56px; }
    .signs .col { width: 48%; font-size: 12px; }
    .signname { font-weight: bold; margin-top: 22px; min-height: 16px; }
    .signhint { font-size: 10px; color: #475569; }
    .line { display: inline-block; border-bottom: 1px solid #14213d; min-width: 180px; }
    .decl { margin-top: 48px; font-size: 12px; line-height: 1.9; }
    .decl .date { float: right; font-weight: bold; }
  </style></head>
  <body><div class="sheet">
    <div class="unit-band">&nbsp;${esc(d.congregationName)}</div>
    <div class="unit-label">Unitate - Egység</div>

    <div class="title">DECONT DE CHELTUIELI<br/>ELSZÁMOLÁS</div>
    <div class="subnum">${esc(d.sorszam)}/${huDate(d.date)}</div>
    <div class="subhint">(nr./data - sz./dátum)</div>

    <div class="head">
      <div class="left">
        <div class="nev-label">Nume - Név</div>
        <div class="nev">${esc(d.personName) || '&nbsp;'}</div>
        <div class="jelleg">${esc(d.jelleg) || '&nbsp;'}</div>
      </div>
      <div class="right">
        <div>Avans primit (RON) - kapott előleg: <span class="amt">${formatRon(Number(d.advance) || 0)}</span></div>
        <div>Total cheltuieli (RON) - összköltség: <span class="amt">${formatRon(total)}</span></div>
        <div>${diffLabel} <span class="amt">${formatRon(absDiff)}</span></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Nr.\nSz.</th>
          <th>Act nr\nIrat sz.</th>
          <th>Act\nIrat</th>
          <th>Data\nDátum</th>
          <th>Emitent\nKiállító cég</th>
          <th>Explicația - Magyarázat</th>
          <th>Suma - Összeg\n(RON)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td class="c">&nbsp;</td><td colspan="5"></td><td></td></tr>'}
        <tr class="total-row">
          <td></td><td></td><td></td><td></td><td></td>
          <td>Total - Összesen</td>
          <td class="r">${formatRon(total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="signs">
      <div class="col">
        Decontat de (semnătura) — Elszámolta
        <div class="signname">${esc(d.personName)}</div>
        <span class="line">&nbsp;</span><br/>
        <span class="signhint">(semnătura / aláírás)</span>
      </div>
      <div class="col">
        Aprobat — Jóváhagyta
        <div class="signname">${esc(d.approvedBy)}</div>
        <span class="line">&nbsp;</span><br/>
        <span class="signhint">(semnătura / aláírás)</span>
      </div>
    </div>

    <div class="decl">
      <span class="date">${huDate(d.date)}</span>
      ${declaration}
    </div>
  </div></body></html>`
}

// ═══════════════════════════════════════════════════════════════════
// DISPOZIȚIE DE PLATĂ / ÎNCASARE
// ═══════════════════════════════════════════════════════════════════

export interface DispozitieDocData {
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") — a fejléc 1. sora. */
  congregationNameRo?: string
  tipus: 'plata' | 'incasare'
  sorszam: number | string
  date: string // yyyy-mm-dd
  name: string
  tisztseg: string
  amount: number
  cel: string
  ciTipus?: string
  ciSerie?: string
  ciNr?: string
}

function dispozitieCopy(d: DispozitieDocData): string {
  const isPlata = d.tipus === 'plata'
  const titlu = isPlata ? 'Dispoziție de plată' : 'Dispoziție de încasare'
  const words = ronInWordsDispozitie(Number(d.amount) || 0)
  const sumStr = formatRon(Number(d.amount) || 0)
  const fill = (v: string | undefined, w = 140) =>
    v && v.trim() ? esc(v) : `<span class="line" style="min-width:${w}px">&nbsp;</span>`

  // Csak kifizetésnél: a beneficiar kiegészítő adatai
  const beneficiar = isPlata
    ? `<div class="block">
         <div class="block-title">Se completează numai pentru plăți — DATE SUPLIMENTARE PRIVIND BENEFICIARUL SUMEI:</div>
         <div>Actul de identitate: ${fill(d.ciTipus, 60)} &nbsp; Seria: ${fill(d.ciSerie, 50)} &nbsp; Nr: ${fill(d.ciNr, 60)}</div>
         <div>Am primit suma de: ${esc(words)} &nbsp;<span class="muted">(în litere)</span></div>
         <div>Data: ${huDate(d.date)} &nbsp;&nbsp; Semnătura: <span class="line">&nbsp;</span></div>
       </div>`
    : ''

  const casierLine = isPlata ? 'Plătit suma de: ' : 'Incasat suma de: '

  // Fejléc: a hivatalos román név (pl. „Parohia Reformată Brateș") felül, a magyar név alatta.
  const hasRo = !!(d.congregationNameRo && d.congregationNameRo.trim())
  const head = hasRo
    ? `<div class="dp-head">${esc(d.congregationNameRo as string)}</div>
       <div class="dp-head-hu">${esc(d.congregationName)}</div>`
    : `<div class="dp-head">${esc(d.congregationName)}</div>`

  return `<div class="dp">
    ${head}
    <div class="dp-title">${titlu}</div>
    <div class="dp-nr">nr. ${esc(d.sorszam)} din ${huDate(d.date)}</div>

    <div class="row">Numele şi prenumele: ${fill(d.name, 200)}</div>
    <div class="row">Funcţia (calitatea): ${fill(d.tisztseg, 200)}</div>
    <div class="row">Suma: <b>${sumStr}</b> lei &nbsp;<span class="muted">(în cifre)</span></div>
    <div class="row">(în litere): ${esc(words)}</div>
    <div class="row">Scopul ${isPlata ? 'plății' : 'încasării'}: ${fill(d.cel, 240)}</div>

    ${beneficiar}

    <div class="block">
      <div class="block-title">Casier,</div>
      <div>${casierLine}${esc(words)} &nbsp;<span class="muted">(în litere)</span></div>
      <div>Data: ${huDate(d.date)} &nbsp;&nbsp; Semnătura: <span class="line">&nbsp;</span></div>
    </div>
  </div>`
}

export function buildDispozitieHtml(d: DispozitieDocData): string {
  const copy = (label: string) => `<div class="dp">
      <div class="exno">${label}</div>
      ${dispozitieCopy(d)}
    </div>`
  // A4 álló, két A5 példány egymás alatt — szellős, nem zsúfolt.
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"/>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Times New Roman", Georgia, serif; color: #14213d; font-size: 13px; margin: 0; }
    @media screen { body { padding: 10mm; } }
    /* Két A5 példány EGY A4 oldalon: a magasságok úgy hangolva, hogy ne csússzon 2. oldalra. */
    .wrap { display: flex; flex-direction: column; gap: 6mm; }
    .dp { border: 1px solid #94a3b8; border-radius: 4px; padding: 8mm 12mm; min-height: 100mm; position: relative; break-inside: avoid; }
    .exno { position: absolute; top: 4mm; right: 5mm; font-size: 10px; color: #94a3b8; }
    .dp-head { text-align: center; font-weight: bold; font-size: 14px; }
    .dp-head-hu { text-align: center; font-weight: normal; font-size: 12px; color: #475569; margin-top: 1px; }
    .dp-title { text-align: center; font-weight: bold; font-size: 15px; margin-top: 6px; }
    .dp-nr { text-align: center; font-size: 12px; color: #475569; margin-bottom: 16px; }
    .row { margin-bottom: 11px; line-height: 1.7; }
    .muted { color: #64748b; font-size: 11px; }
    .line { display: inline-block; border-bottom: 1px solid #14213d; min-width: 150px; }
    .block { border-top: 1px dashed #94a3b8; margin-top: 14px; padding-top: 12px; }
    .block-title { font-weight: bold; font-size: 11px; margin-bottom: 9px; }
    .block div { margin-bottom: 9px; }
  </style></head>
  <body><div class="wrap">${copy('Exemplarul 1 (caserie)')}${copy('Exemplarul 2 (cotor)')}</div></body></html>`
}
