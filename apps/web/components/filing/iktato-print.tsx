'use client'

/**
 * Iktató nyomtatási funkciók — EREK 2024-es ügykörjegyzékhez igazítva.
 *
 * 1. Iktatópecsét — egy adott irathoz nyomtatható pecsét-blokk (a hivatalos
 *    PDF minta szerint): Iktatva / Kelt / Ikt. sz / I.gy / Sorsz / Elintézve.
 *
 * 2. Iktatókönyv 9 rovatos formátum — az adott évre minden bejegyzés egy
 *    hivatalos 9-rovatos táblázatban kinyomtatható.
 *
 * Mindkét nyomtatás `window.print()`-tel, új böngészőablakban — a böngésző
 * print dialógusa kezeli a PDF-mentést.
 */

import type { FilingEntry } from '@/lib/constants/filing'
import { FILING_UGYKOROK_MAP } from '@/lib/constants/filing-ugykorjegyzek'

interface PrintOptions {
  congregationName: string
  egyhazmegyeNev?: string
  year: number
}

function openPrintWindow(html: string, title: string): void {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('A böngésző blokkolta a nyomtatási ablak megnyitását. Engedélyezd a popupokat!')
    return
  }
  win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      @page { size: A4; margin: 1.5cm; }
      * { box-sizing: border-box; }
      body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 0; font-size: 11pt; line-height: 1.4; }
      h1 { font-size: 16pt; margin: 0 0 8px 0; text-align: center; }
      h2 { font-size: 12pt; margin: 12px 0 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 9pt; }
      th, td { border: 1px solid #475569; padding: 4px 6px; vertical-align: top; text-align: left; }
      th { background: #f1f5f9; font-weight: 600; }
      .iktato-pecset {
        display: inline-block;
        border: 2px solid #1e3a8a;
        padding: 8px 12px;
        font-family: 'Courier New', monospace;
        font-size: 10pt;
        line-height: 1.6;
        background: white;
        min-width: 180px;
      }
      .iktato-pecset .title { font-weight: bold; text-transform: uppercase; font-size: 11pt; margin-bottom: 4px; }
      .source-irat { margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px dashed #94a3b8; }
      .source-irat p { margin: 2px 0; font-size: 10pt; }
      .meta { text-align: right; font-size: 9pt; color: #64748b; margin-top: 6px; }
      .signature-row { margin-top: 32px; display: flex; gap: 24px; justify-content: space-between; }
      .signature-block { flex: 1; text-align: center; font-size: 10pt; }
      .signature-block .line { border-top: 1px solid #1f2937; margin: 32px 8px 4px 8px; }
      .closing { margin-top: 28px; font-style: italic; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head><body>${html}
    <script>window.onload = function() { window.print(); };</script>
  </body></html>`)
  win.document.close()
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '_________'
  return s.split('T')[0]
}

function fmtUgykor(kod: string | null | undefined): string {
  if (!kod) return '—'
  const entry = FILING_UGYKOROK_MAP[kod]
  return entry ? `${entry.kod} ${entry.nev}` : kod
}

/**
 * Iktatópecsét nyomtatás egy adott irathoz.
 * A pecsétblokk a beérkezett irat jobb felső sarkára kerül.
 */
export function printIktatoPecset(entry: FilingEntry, opts: PrintOptions): void {
  const ugykor = fmtUgykor(entry.ugykor_kod)
  const html = `
    <h1>${opts.congregationName} — Iktatópecsét</h1>
    <div class="source-irat">
      <p><strong>Beérkezett irat adatai:</strong></p>
      ${entry.sender_or_recipient ? `<p>Küldő: <strong>${entry.sender_or_recipient}</strong></p>` : ''}
      ${entry.external_ref_szam ? `<p>Külső iktatószám: <strong>${entry.external_ref_szam}</strong></p>` : ''}
      ${entry.external_ref_kelt ? `<p>Külső irat kelte: <strong>${fmtDate(entry.external_ref_kelt)}</strong></p>` : ''}
      <p>Tárgy: <strong>${entry.subject}</strong></p>
    </div>

    <h2>Iktatópecsét (másolható az irat jobb felső sarkára)</h2>
    <div class="iktato-pecset">
      <div class="title">Iktatva</div>
      <div>Kelt: ${fmtDate(entry.beerkezes_ideje || entry.kelt)}</div>
      <div>Ikt. sz: <strong>${entry.year}/${entry.sequence_number}</strong></div>
      <div>I.gy: ${entry.ugykor_kod || '—'}</div>
      <div>Sorsz: ${entry.sequence_number}</div>
      <div>Elintézve: ${fmtDate(entry.elintezes_ideje)}</div>
    </div>

    <div class="meta">
      <p>Ügykör: ${ugykor}</p>
      <p>Mellékletek száma: ${entry.mellekletek_szama ?? '—'}</p>
      ${entry.valasz_iktatoszam ? `<p>Kereszt-hivatkozás: ${entry.valasz_iktatoszam}</p>` : ''}
    </div>
  `
  openPrintWindow(html, `Iktatópecset — ${entry.year}/${entry.sequence_number}`)
}

/**
 * Az adott év teljes iktatókönyvének 9-rovatos formátumú nyomtatása.
 * Az EREK PDF-ben (VII. Iktatókönyv) szereplő hivatalos struktúrában.
 */
export function printIktatokonyv(entries: FilingEntry[], opts: PrintOptions): void {
  if (entries.length === 0) {
    alert('Nincs iktatott irat az adott évre.')
    return
  }
  const sorted = [...entries].sort((a, b) => a.sequence_number - b.sequence_number)
  const rows = sorted
    .map((e) => `
      <tr>
        <td style="font-family: monospace;">${e.year}/${e.sequence_number}</td>
        <td>${e.external_ref_szam || '—'}<br /><span style="color:#64748b; font-size: 8pt;">${e.external_ref_kelt ? fmtDate(e.external_ref_kelt) : ''}</span></td>
        <td>${fmtDate(e.beerkezes_ideje || e.kelt)}</td>
        <td style="text-align:center;">${e.mellekletek_szama ?? ''}</td>
        <td>${e.sender_or_recipient || '—'}</td>
        <td>${e.subject || ''}${e.targykivonat ? `<br /><span style="color:#475569; font-size:8pt;">${e.targykivonat}</span>` : ''}</td>
        <td>${fmtDate(e.elintezes_ideje)}</td>
        <td style="font-family: monospace; font-size:8pt;">${e.ugykor_kod || '—'}</td>
        <td style="font-size:8pt;">${e.valasz_iktatoszam || ''}</td>
      </tr>
    `)
    .join('')

  const html = `
    <h1>Iktatókönyv — ${opts.year}. év</h1>
    <p style="text-align:center; margin: 0; font-size: 10pt;">${opts.congregationName}${opts.egyhazmegyeNev ? ` · ${opts.egyhazmegyeNev}` : ''}</p>
    <p class="meta" style="text-align:left; margin-top: 8px;">Hivatalos 9-rovatos iktatókönyv az EREK 2024-es ügykörjegyzéke szerint (Igazgatótanács 66/2023.)</p>

    <table>
      <thead>
        <tr>
          <th style="width:7%;">1. Iktató-<br/>szám</th>
          <th style="width:11%;">2. Külső szám<br/>+ kelte</th>
          <th style="width:8%;">3. Beérkezés<br/>ideje</th>
          <th style="width:5%;">4. Mell.<br/>szám</th>
          <th style="width:14%;">5. Küldő</th>
          <th style="width:24%;">6. Ügy / válasz<br/>rövid tartalma</th>
          <th style="width:8%;">7. Ellátás</th>
          <th style="width:9%;">8. Irattári<br/>szám</th>
          <th style="width:14%;">9. Hivatkozás<br/>(lásd ...)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p class="closing">Lezárva ${opts.year}. december 31-én.</p>

    <div class="signature-row">
      <div class="signature-block">
        <div class="line"></div>
        Lelkipásztor
      </div>
      <div class="signature-block">
        <div class="line"></div>
        (Fő)gondnok
      </div>
    </div>
  `
  openPrintWindow(html, `Iktatókönyv ${opts.year}`)
}
