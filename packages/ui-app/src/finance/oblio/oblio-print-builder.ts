/**
 * Oblio befogadott számla HTML builder a nyomtatási központhoz.
 *
 * Magyar–román kétnyelvű, ANAF e-Factura UBL XML-ből szépen formázott
 * összefoglaló. Akkor használjuk, ha a ZIP-ben NEM jött PDF — különben a
 * helyi PDF-et nyomtatjuk közvetlenül.
 *
 * A KARTOTEKA branding lábléce egyértelművé teszi, hogy ez egy belső
 * összefoglaló, nem a hivatalos jogi dokumentum (ami az ANAF SPV-ben tárolt
 * digitálisan aláírt eredeti).
 */

import type { UblInvoiceMeta } from './ubl-parser'

export type OblioInvoicePrintInput = {
  meta: UblInvoiceMeta
  /** A gyülekezet (befogadó) neve. */
  congregationName?: string
  /** Az XML fájl neve (a fejlécbe). */
  fileName?: string
  /** Mikor készült a nyomtatás (alapértelmezetten most). */
  printedAt?: Date
  /**
   * Az Erdélyi Református Egyházkerület logo abszolút URL-je. A iframe
   * srcDoc-ban relatív URL nem működik, ezért abszolút URL kell.
   * Pl.: `${window.location.origin}/EREK.png`
   */
  logoUrl?: string
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtMoney(n: number | null, currency = 'RON'): string {
  if (n === null) return '—'
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return s
}

function fmtDateTimeHu(d: Date): string {
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildOblioInvoicePrintHtml(input: OblioInvoicePrintInput): string {
  const m = input.meta
  const isCreditNote = m.documentType === 'credit_note'
  const titleRo = isCreditNote ? 'Notă de credit primită' : 'Factură primită'
  const titleHu = isCreditNote ? 'Befogadott jóváíró számla' : 'Befogadott e-Factura számla'
  const printedAt = input.printedAt ?? new Date()

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titleRo)} / ${escapeHtml(titleHu)} — ${escapeHtml(m.invoiceNumber || '')}</title>
  <style>
    /* @page szabályok — natív böngésző print-jén érvényesülnek.
       A böngésző Save-as-PDF (a print dialógusból) ugyanezt produkálja. */
    @page {
      size: A4;
      margin: 16mm 14mm 22mm 14mm;
      /* Lapszám a jobb alsó sarokban + KARTOTEKA branding középen */
      @bottom-right {
        content: counter(page) " / " counter(pages);
        font-family: Arial, sans-serif;
        font-size: 8pt;
        color: #94a3b8;
        padding-bottom: 6mm;
      }
      @bottom-center {
        content: "KARTOTEKA · Egyházi pénzügyi nyilvántartó";
        font-family: Arial, sans-serif;
        font-size: 7.5pt;
        color: #cbd5e1;
        padding-bottom: 6mm;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      line-height: 1.45;
      margin: 0;
      /* Preview-ban a body padding ugyanazt a layoutot adja, mint a print
         @page margin. Print-kor felülírjuk, hogy ne duplázódjon. */
      padding: 16mm 14mm 22mm 14mm;
    }
    @media print {
      body { padding: 0; }
      /* HTML5 page-break vezérlés: az adatkártyák ne törjenek szét */
      .header-grid, .info-card, table.amounts { page-break-inside: avoid; }
    }

    /* Brand fejléc */
    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8pt 0;
      border-bottom: 2pt solid #0e7490;
      margin-bottom: 14pt;
    }
    .brand-bar .brand {
      display: flex;
      align-items: center;
      gap: 10pt;
    }
    .brand-logo {
      width: 36pt; height: 36pt;
      object-fit: contain;
    }
    .brand-logo-fallback {
      width: 36pt; height: 36pt;
      border-radius: 6pt;
      background: linear-gradient(135deg, #0e7490 0%, #0891b2 100%);
      color: white;
      display: flex; align-items: center; justify-content: center;
      font-family: Georgia, serif;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: -0.5pt;
    }
    .brand-text {
      font-family: Georgia, serif;
      font-size: 11pt;
      font-weight: 700;
      color: #0e7490;
      letter-spacing: 0.3pt;
      line-height: 1.2;
    }
    .brand-subtext {
      font-size: 7.5pt;
      color: #64748b;
      margin-top: 1pt;
    }
    .brand-meta {
      text-align: right;
      font-size: 8.5pt;
      color: #64748b;
      line-height: 1.35;
    }

    /* Cím */
    h1 {
      font-family: Georgia, serif;
      font-size: 18pt;
      color: #0e7490;
      margin: 0;
      letter-spacing: 0.3pt;
    }
    h1 .hu {
      display: block;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      color: #475569;
      font-style: italic;
      font-weight: normal;
      letter-spacing: 0;
      margin-top: 2pt;
    }

    .subtitle {
      font-size: 9pt;
      color: #64748b;
      margin: 4pt 0 16pt 0;
    }
    .subtitle .label-hu { font-style: italic; color: #94a3b8; }

    /* Adatkártyák — beszállító + számla */
    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14pt;
      margin-bottom: 16pt;
    }
    .info-card {
      padding: 10pt 12pt;
      background: linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%);
      border-radius: 8pt;
      border: 1px solid #cffafe;
    }
    .info-card h3 {
      margin: 0 0 8pt 0;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.8pt;
      color: #0369a1;
      display: flex;
      align-items: baseline;
      gap: 6pt;
    }
    .info-card h3 .label-hu {
      font-size: 8pt;
      font-style: italic;
      letter-spacing: 0;
      color: #64748b;
      text-transform: none;
    }
    .field { margin: 4pt 0; display: flex; align-items: baseline; gap: 4pt; flex-wrap: wrap; }
    .field-label {
      flex: 0 0 110pt;
      color: #64748b;
      font-size: 8.5pt;
    }
    .field-label .hu { font-style: italic; color: #94a3b8; font-size: 8pt; }
    .field-value { font-weight: 600; color: #0f172a; flex: 1; min-width: 100pt; }
    .field-value.mono { font-family: ui-monospace, 'Courier New', monospace; }

    /* Pénzügyi táblázat */
    table.amounts {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4pt;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8pt;
      overflow: hidden;
    }
    table.amounts th, table.amounts td {
      padding: 8pt 12pt;
      text-align: right;
      border-bottom: 1px solid #f1f5f9;
    }
    table.amounts th {
      background: #f8fafc;
      text-align: left;
      font-weight: 600;
      color: #475569;
      font-size: 9pt;
    }
    table.amounts th .label-hu {
      display: block;
      font-style: italic;
      font-weight: normal;
      color: #94a3b8;
      font-size: 8pt;
    }
    table.amounts td.label {
      text-align: left;
    }
    table.amounts td.label .hu {
      display: block;
      font-style: italic;
      color: #94a3b8;
      font-size: 8pt;
    }
    table.amounts tr.total {
      background: #f0fdfa;
      font-weight: 700;
      font-size: 11pt;
    }
    table.amounts tr.total td { color: #0f766e; border-bottom: none; }
    table.amounts tr.total td.label .hu { color: #14b8a6; }

    /* Megjegyzés / disclaimer */
    .footer-note {
      margin-top: 14pt;
      padding: 10pt 12pt;
      background: #fefce8;
      border-left: 3pt solid #eab308;
      border-radius: 4pt;
      font-size: 8.5pt;
      color: #713f12;
      line-height: 1.5;
    }
    .footer-note strong { color: #422006; }
    .footer-note .ro { display: block; margin-top: 2pt; font-style: italic; color: #92400e; }

    /* KARTOTEKA lábléc */
    .kartoteka-footer {
      margin-top: 18pt;
      padding-top: 8pt;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
    }
    .kartoteka-footer .system {
      font-weight: 600;
      color: #475569;
    }

    /* ANAF UUID badge */
    .anaf-uuid {
      font-family: ui-monospace, 'Courier New', monospace;
      font-size: 8pt;
      background: #e0f2fe;
      color: #075985;
      padding: 2pt 6pt;
      border-radius: 3pt;
    }
  </style>
</head>
<body>
  <!-- KARTOTEKA brand fejléc — Erdélyi Református Egyházkerület logóval -->
  <div class="brand-bar">
    <div class="brand">
      ${
        input.logoUrl
          ? `<img src="${escapeHtml(input.logoUrl)}" alt="EREK" class="brand-logo" />`
          : `<div class="brand-logo-fallback">EREK</div>`
      }
      <div>
        <div class="brand-text">Erdélyi Református Egyházkerület</div>
        <div class="brand-subtext">KARTOTEKA · Egyházi nyilvántartó rendszer</div>
      </div>
    </div>
    <div class="brand-meta">
      <div><strong>${escapeHtml(input.congregationName || '—')}</strong></div>
      <div>Nyomtatva: ${escapeHtml(fmtDateTimeHu(printedAt))}</div>
    </div>
  </div>

  <!-- Cím + alcím -->
  <h1>
    ${escapeHtml(titleRo)}
    <span class="hu">${escapeHtml(titleHu)}</span>
  </h1>
  <div class="subtitle">
    ${
      m.anafUuid
        ? `<span>ANAF UUID:</span> <span class="anaf-uuid">${escapeHtml(m.anafUuid)}</span>`
        : ''
    }
    ${
      input.fileName
        ? ` &middot; <span class="label-hu">forrás:</span> <span style="font-family: ui-monospace, 'Courier New', monospace;">${escapeHtml(input.fileName)}</span>`
        : ''
    }
  </div>

  <!-- Beszállító + Számla adatok -->
  <div class="header-grid">
    <div class="info-card">
      <h3>
        Furnizor
        <span class="label-hu">/ Beszállító</span>
      </h3>
      <div class="field">
        <span class="field-label">Denumire <span class="hu">/ Név</span>:</span>
        <span class="field-value">${escapeHtml(m.supplier.name)}</span>
      </div>
      <div class="field">
        <span class="field-label">CUI / CIF:</span>
        <span class="field-value mono">${escapeHtml(m.supplier.cui)}</span>
      </div>
      ${
        m.supplier.address
          ? `<div class="field">
        <span class="field-label">Adresă <span class="hu">/ Cím</span>:</span>
        <span class="field-value">${escapeHtml(m.supplier.address)}</span>
      </div>`
          : ''
      }
      ${
        m.supplier.countryCode
          ? `<div class="field">
        <span class="field-label">Țară <span class="hu">/ Ország</span>:</span>
        <span class="field-value">${escapeHtml(m.supplier.countryCode)}</span>
      </div>`
          : ''
      }
    </div>

    <div class="info-card">
      <h3>
        Date factură
        <span class="label-hu">/ Számla adatai</span>
      </h3>
      <div class="field">
        <span class="field-label">Nr. factură <span class="hu">/ Számlaszám</span>:</span>
        <span class="field-value mono">${escapeHtml(m.invoiceNumber)}</span>
      </div>
      <div class="field">
        <span class="field-label">Data emiterii <span class="hu">/ Kibocsátás</span>:</span>
        <span class="field-value">${escapeHtml(fmtDate(m.issueDate))}</span>
      </div>
      ${
        m.dueDate
          ? `<div class="field">
        <span class="field-label">Scadență <span class="hu">/ Esedékesség</span>:</span>
        <span class="field-value">${escapeHtml(fmtDate(m.dueDate))}</span>
      </div>`
          : ''
      }
      <div class="field">
        <span class="field-label">Monedă <span class="hu">/ Pénznem</span>:</span>
        <span class="field-value">${escapeHtml(m.currency || 'RON')}</span>
      </div>
    </div>
  </div>

  <!-- Pénzügyi összesítő -->
  <table class="amounts">
    <thead>
      <tr>
        <th>
          Articol
          <span class="label-hu">/ Tétel</span>
        </th>
        <th style="text-align:right">
          Sumă
          <span class="label-hu">/ Összeg</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="label">
          Bază (fără TVA)
          <span class="hu">Nettó (ÁFA nélkül)</span>
        </td>
        <td>${fmtMoney(m.amounts.netto, m.currency || 'RON')}</td>
      </tr>
      <tr>
        <td class="label">
          TVA
          <span class="hu">Forgalmi adó (ÁFA)</span>
        </td>
        <td>${fmtMoney(m.amounts.tva, m.currency || 'RON')}</td>
      </tr>
      <tr class="total">
        <td class="label">
          Total de plată
          <span class="hu">Bruttó (fizetendő)</span>
        </td>
        <td>${fmtMoney(m.amounts.brut, m.currency || 'RON')}</td>
      </tr>
    </tbody>
  </table>

  <!-- Disclaimer -->
  <div class="footer-note">
    <strong>Megjegyzés:</strong> ez a HTML kizárólag az UBL 2.1 XML alapján
    generált <strong>belső áttekintés</strong> a KARTOTEKA-ból. A számla
    jogi értelemben az ANAF SPV-ben tárolt, digitálisan aláírt eredeti
    dokumentum.
    <span class="ro"><strong>Notă:</strong> acest document este un rezumat
    intern generat din XML-ul UBL 2.1. Documentul oficial este factura
    semnată digital din SPV ANAF.</span>
  </div>

  <!-- KARTOTEKA lábléc -->
  <div class="kartoteka-footer">
    <div>
      <span class="system">KARTOTEKA</span> &middot; Egyházi pénzügyi nyilvántartó &middot;
      ${escapeHtml(input.congregationName || '—')}
    </div>
    <div>
      Nyomtatva / Tipărit: ${escapeHtml(fmtDateTimeHu(printedAt))}
    </div>
  </div>
</body>
</html>`
}

/**
 * Egyszerű KARTOTEKA fedlap HTML akkor, amikor a beszállító CSAK PDF-et
 * küldött (nincs UBL XML). Ugyanaz a brand fejléc + lábléc, mint az
 * UBL-alapú változatban — egységes nyomtatási megjelenés.
 */
export type PdfOnlyCoverInput = {
  fileName: string
  fileSize: number
  fileLastModified: number
  congregationName?: string
  logoUrl?: string
  printedAt?: Date
  anafUuid?: string | null
}

export function buildPdfOnlyCoverHtml(input: PdfOnlyCoverInput): string {
  const printedAt = input.printedAt ?? new Date()
  const fileSizeKb = (input.fileSize / 1024).toFixed(1)
  const fileDate = new Date(input.fileLastModified)

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <title>Befogadott számla fedlap — ${escapeHtml(input.fileName)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 22mm 14mm;
      @bottom-right {
        content: counter(page) " / " counter(pages);
        font-family: Arial, sans-serif;
        font-size: 8pt;
        color: #94a3b8;
        padding-bottom: 6mm;
      }
      @bottom-center {
        content: "KARTOTEKA · Egyházi pénzügyi nyilvántartó";
        font-family: Arial, sans-serif;
        font-size: 7.5pt;
        color: #cbd5e1;
        padding-bottom: 6mm;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      line-height: 1.45;
      margin: 0;
      padding: 16mm 14mm 22mm 14mm;
    }
    @media print { body { padding: 0; } }

    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8pt 0;
      border-bottom: 2pt solid #0e7490;
      margin-bottom: 14pt;
    }
    .brand-bar .brand { display: flex; align-items: center; gap: 10pt; }
    .brand-logo { width: 36pt; height: 36pt; object-fit: contain; }
    .brand-logo-fallback {
      width: 36pt; height: 36pt;
      border-radius: 6pt;
      background: linear-gradient(135deg, #0e7490 0%, #0891b2 100%);
      color: white;
      display: flex; align-items: center; justify-content: center;
      font-family: Georgia, serif;
      font-size: 16pt; font-weight: 700;
    }
    .brand-text {
      font-family: Georgia, serif;
      font-size: 11pt; font-weight: 700;
      color: #0e7490; letter-spacing: 0.3pt;
    }
    .brand-subtext { font-size: 7.5pt; color: #64748b; margin-top: 1pt; }
    .brand-meta { text-align: right; font-size: 8.5pt; color: #64748b; }

    h1 {
      font-family: Georgia, serif;
      font-size: 20pt;
      color: #0e7490;
      margin: 16pt 0 4pt 0;
    }
    h1 .hu {
      display: block;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      color: #475569;
      font-style: italic;
      font-weight: normal;
      margin-top: 2pt;
    }
    .subtitle { font-size: 9pt; color: #64748b; margin: 0 0 18pt 0; }

    .info-card {
      padding: 12pt 14pt;
      background: linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%);
      border-radius: 8pt;
      border: 1px solid #cffafe;
      margin-bottom: 14pt;
    }
    .info-card h3 {
      margin: 0 0 8pt 0;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.8pt;
      color: #0369a1;
    }
    .field { margin: 4pt 0; display: flex; align-items: baseline; gap: 6pt; }
    .field-label { color: #64748b; font-size: 9pt; flex: 0 0 120pt; }
    .field-value { font-weight: 600; color: #0f172a; flex: 1; }
    .field-value.mono { font-family: ui-monospace, 'Courier New', monospace; }

    .pdf-pointer {
      margin-top: 14pt;
      padding: 14pt 16pt;
      background: #fef3c7;
      border-left: 3pt solid #f59e0b;
      border-radius: 4pt;
      font-size: 10pt;
      color: #713f12;
      line-height: 1.5;
    }
    .pdf-pointer strong { color: #422006; }
    .pdf-pointer .ro { display: block; margin-top: 3pt; font-style: italic; color: #92400e; font-size: 9pt; }

    .kartoteka-footer {
      margin-top: 18pt; padding-top: 8pt;
      border-top: 1px dashed #cbd5e1;
      display: flex; justify-content: space-between;
      font-size: 7.5pt; color: #94a3b8;
    }
    .kartoteka-footer .system { font-weight: 600; color: #475569; }
  </style>
</head>
<body>
  <div class="brand-bar">
    <div class="brand">
      ${
        input.logoUrl
          ? `<img src="${escapeHtml(input.logoUrl)}" alt="EREK" class="brand-logo" />`
          : `<div class="brand-logo-fallback">EREK</div>`
      }
      <div>
        <div class="brand-text">Erdélyi Református Egyházkerület</div>
        <div class="brand-subtext">KARTOTEKA · Egyházi nyilvántartó rendszer</div>
      </div>
    </div>
    <div class="brand-meta">
      <div><strong>${escapeHtml(input.congregationName || '—')}</strong></div>
      <div>Nyomtatva: ${escapeHtml(fmtDateTimeHu(printedAt))}</div>
    </div>
  </div>

  <h1>
    Factură primită — Fișă de copertă
    <span class="hu">Befogadott számla — KARTOTEKA borítólap</span>
  </h1>
  <p class="subtitle">
    A beszállító csak PDF-et küldött — UBL XML nincs csatolva.
    Az alábbi adatok a fájl meta-információin alapulnak.
  </p>

  <div class="info-card">
    <h3>Fájl adatok / Date fișier</h3>
    <div class="field">
      <span class="field-label">Fájl neve / Nume fișier:</span>
      <span class="field-value mono">${escapeHtml(input.fileName)}</span>
    </div>
    <div class="field">
      <span class="field-label">Méret / Dimensiune:</span>
      <span class="field-value">${escapeHtml(fileSizeKb)} KB</span>
    </div>
    <div class="field">
      <span class="field-label">Utolsó módosítás / Modificat:</span>
      <span class="field-value">${escapeHtml(fmtDateTimeHu(fileDate))}</span>
    </div>
    ${
      input.anafUuid
        ? `<div class="field">
      <span class="field-label">ANAF UUID:</span>
      <span class="field-value mono">${escapeHtml(input.anafUuid)}</span>
    </div>`
        : ''
    }
  </div>

  <div class="pdf-pointer">
    <strong>📕 A számla teljes tartalma az eredeti PDF-ben található.</strong>
    A KARTOTEKA „Nyomtatási központjában" megnyithatod az „Eredeti PDF" tabot
    a teljes tartalom megjelenítéséhez és nyomtatásához.
    <span class="ro"><strong>Conținutul integral al facturii este în PDF-ul
    original.</strong> În „Centrul de tipărire" KARTOTEKA poți deschide tab-ul
    „PDF original" pentru afișare și tipărire.</span>
  </div>

  <div class="kartoteka-footer">
    <div>
      <span class="system">KARTOTEKA</span> &middot; Egyházi pénzügyi nyilvántartó &middot;
      ${escapeHtml(input.congregationName || '—')}
    </div>
    <div>Nyomtatva / Tipărit: ${escapeHtml(fmtDateTimeHu(printedAt))}</div>
  </div>
</body>
</html>`
}
