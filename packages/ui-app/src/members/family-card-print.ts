/**
 * Családi karton — nyomtatható A4 lap HTML-buildere (közös, 2026-06-11).
 *
 * A webes `family-card-print-dialog.tsx` belső `buildCardHtml`-je VÁLTOZATLAN
 * logikával ide költözött, hogy a desktop ugyanazt a hivatalos kartont
 * nyomtassa (web: import-csere, desktop: új dialóg). Festéktakarékos,
 * lefűzhető lap — relációk, anyakönyvi dátumok, megjegyzések; opcionálisan
 * befizetések + családlátogatások.
 */

export interface FamilyCardPrintPerson {
  szerep: string
  nev: string
  szuletes: string | null
  keresztseg: string | null
  konfirmacio: string | null
  megjegyzes: string | null
  meghalt: boolean
}

export interface FamilyCardPrintData {
  familyId: number
  familyName: string
  address: string | null
  district: string | null
  congregation: string
  marriage: { datum: string | null; lelkesz: string | null } | null
  adults: FamilyCardPrintPerson[]
  children: FamilyCardPrintPerson[]
  payments: Array<{ datum: string | null; ev: number | null; osszeg: number; cel: string | null }>
  visits: Array<{ datum: string | null; lelkesz: string | null; megjegyzes: string | null }>
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('hu-HU')
}

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildFamilyCardHtml(
  data: FamilyCardPrintData,
  opts: { payments: boolean; visits: boolean },
): string {
  const personRow = (p: FamilyCardPrintPerson) => `
    <tr>
      <td class="role">${esc(p.szerep)}</td>
      <td class="name">${esc(p.nev)}${p.meghalt ? ' <span class="dagger">†</span>' : ''}</td>
      <td>${fmtDate(p.szuletes)}</td>
      <td>${fmtDate(p.keresztseg)}</td>
      <td>${fmtDate(p.konfirmacio)}</td>
    </tr>
    ${p.megjegyzes ? `<tr class="note-row"><td></td><td colspan="4" class="note">Megjegyzés: ${esc(p.megjegyzes)}</td></tr>` : ''}
  `

  const paymentsBlock = opts.payments && data.payments.length > 0 ? `
    <h2>Befizetések (utolsó 5 év)</h2>
    <table class="data">
      <thead><tr><th>Dátum</th><th>Év</th><th>Cél</th><th class="right">Összeg</th></tr></thead>
      <tbody>
        ${data.payments.map(p => `
          <tr>
            <td>${fmtDate(p.datum)}</td>
            <td>${p.ev ?? '—'}</td>
            <td>${esc(p.cel) || 'Befizetés'}</td>
            <td class="right">${p.osszeg.toFixed(2)} RON</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  const visitsBlock = opts.visits && data.visits.length > 0 ? `
    <h2>Családlátogatások</h2>
    <table class="data">
      <thead><tr><th>Dátum</th><th>Lelkész</th><th>Megjegyzés</th></tr></thead>
      <tbody>
        ${data.visits.map(v => `
          <tr>
            <td>${fmtDate(v.datum)}</td>
            <td>${esc(v.lelkesz) || '—'}</td>
            <td>${esc(v.megjegyzes) || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>Családi karton — ${esc(data.familyName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; margin: 0; font-size: 12.5px; line-height: 1.45; }
  .head { text-align: center; border-bottom: 2.5px double #0f766e; padding-bottom: 10px; }
  .head .cong { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #475569; }
  .head h1 { font-size: 21px; margin: 6px 0 2px; letter-spacing: 0.06em; }
  .head .fam { font-size: 16px; font-weight: 700; color: #0f766e; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; margin: 10px 0 4px; font-size: 12px; color: #334155; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: #0f766e; border-bottom: 1px solid #99f6e4; padding-bottom: 3px; margin: 18px 0 6px; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 4px 6px; }
  table.data td { padding: 4.5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.role { font-weight: 700; color: #0f766e; white-space: nowrap; width: 80px; }
  td.name { font-weight: 600; }
  td.right, th.right { text-align: right; }
  tr.note-row td { border-bottom: 1px solid #e2e8f0; padding-top: 0; }
  td.note { font-size: 11px; font-style: italic; color: #64748b; }
  .dagger { color: #64748b; }
  .marriage { margin: 6px 0 0; font-size: 12px; color: #334155; }
  .footer { margin-top: 26px; display: flex; justify-content: space-between; font-size: 10.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  .sign { margin-top: 34px; display: flex; justify-content: flex-end; }
  .sign .line { width: 220px; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid #94a3b8; padding-top: 4px; }
</style>
</head>
<body>
  <div class="head">
    <p class="cong">${esc(data.congregation)}</p>
    <h1>CSALÁDI KARTON</h1>
    <p class="fam">${esc(data.familyName)}</p>
  </div>

  <div class="meta">
    <span><strong>Lakcím:</strong> ${esc(data.address) || 'nincs rögzítve'}</span>
    <span><strong>Körzet:</strong> ${esc(data.district) || '—'}</span>
  </div>

  <h2>A család tagjai</h2>
  <table class="data">
    <thead>
      <tr><th>Reláció</th><th>Név</th><th>Született</th><th>Keresztelve</th><th>Konfirmált</th></tr>
    </thead>
    <tbody>
      ${data.adults.map(personRow).join('')}
      ${data.children.map(personRow).join('')}
    </tbody>
  </table>
  ${data.marriage ? `<p class="marriage"><strong>Házasságkötés:</strong> ${fmtDate(data.marriage.datum)}${data.marriage.lelkesz ? ` — eskette: ${esc(data.marriage.lelkesz)}` : ''}</p>` : ''}

  ${paymentsBlock}
  ${visitsBlock}

  <div class="sign"><div class="line">lelkipásztor</div></div>

  <div class="footer">
    <span>Kartotéka — családi karton</span>
    <span>Nyomtatva: ${new Date().toLocaleDateString('hu-HU')}</span>
  </div>
</body>
</html>`
}
