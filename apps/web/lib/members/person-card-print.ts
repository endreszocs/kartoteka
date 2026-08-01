/**
 * Nyomtatható SZEMÉLYI KARTON (2026-07-25, PR-17).
 *
 * A4 `.sheet`-alapú (data-sheet-count) nyomtatvány a bevált WYSIWYG-sémával:
 *   - 1. lap: a személyi karton — fénykép-mező, személyes/egyházi törzsadatok,
 *     lakcím + elérhetőség, anyakönyvi blokk, megjegyzés, keltezés+aláírás.
 *     A KITÖLTETLEN mezők pontozott vonalként jelennek meg — így az űrlap
 *     ÉLŐ ELŐNÉZETKÉNT is szolgál (gépelés közben töltődik ki a karton),
 *     és üresen kinyomtatva kézi kitöltésre is alkalmas.
 *   - opcionális 2. lap: befizetések táblázata („hátoldal").
 *   - opcionális 3. lap: családfa nemzedékenként, ágaztatott listával.
 *
 * Tudatosan PURE modul (nincs React/DB) — a web űrlap-előnézete és a
 * karton-nyomtató dialógus ugyanazt hívja.
 */

export interface PersonCardRegistryEvent {
  date?: string | null
  place?: string | null
  pastor?: string | null
}

export interface PersonCardPayment {
  datum: string | null
  cel: string | null
  ev: number | null
  osszeg: number
  stornozott?: boolean
}

export interface PersonCardTreeMember {
  /** Negatív = ős-nemzedék (‑2 nagyszülők…), 0 = saját, pozitív = leszármazottak. */
  generation: number
  /** Rokonsági címke (pl. „Nagyapa", „Unokatestvér"). */
  label: string | null
  name: string
  birthYear?: string | null
  deceased?: boolean
  isCenter?: boolean
}

export interface PersonCardPrintData {
  congregationName: string
  personName: string
  szcsNev?: string | null
  gender?: 'ferfi' | 'no' | null
  birthDate?: string | null
  birthPlace?: string | null
  religion?: string | null
  occupation?: string | null
  fatherName?: string | null
  motherName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  cnp?: string | null
  photoUrl?: string | null
  baptism?: PersonCardRegistryEvent | null
  confirmation?: PersonCardRegistryEvent | null
  note?: string | null
  /** Ha megadva: külön lap a befizetésekkel. */
  payments?: PersonCardPayment[] | null
  /** Ha megadva: külön lap a családfával. */
  tree?: PersonCardTreeMember[] | null
}

export interface PersonCardPrintResult {
  title: string
  html: string
  sheetCount: number
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Érték VAGY pontozott kitöltő-vonal (élő előnézet + kézi kitöltés). */
function val(v: string | null | undefined, minWidth = '6rem'): string {
  const s = (v ?? '').trim()
  if (!s) return `<span class="blank" style="min-width:${minWidth}"></span>`
  return `<span class="val">${esc(s)}</span>`
}

function fmtDate(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v.includes('T') ? v : `${v}T00:00:00`)
  if (Number.isNaN(d.getTime())) return v
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }).format(d)
}

const GEN_LABELS: Record<number, string> = {
  [-5]: 'Szépszülők nemzedéke',
  [-4]: 'Ükszülők nemzedéke',
  [-3]: 'Dédszülők nemzedéke',
  [-2]: 'Nagyszülők nemzedéke',
  [-1]: 'Szülők nemzedéke',
  0: 'Saját nemzedék',
  1: 'Gyermekek',
  2: 'Unokák',
  3: 'Dédunokák',
}

function styles() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #14251f; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 14mm 16mm 16mm 18mm; page-break-after: always; position: relative; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }

    .head { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px double #1f5c50; padding-bottom: 8px; }
    .head .cong { font-size: 11px; color: #47635a; }
    .head h1 { margin: 2px 0 0; font-size: 21px; letter-spacing: .12em; color: #1f5c50; }
    .photo { width: 32mm; height: 40mm; border: 1.5px solid #1f5c50; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #7f958d; background: #f4f8f6; overflow: hidden; flex: 0 0 auto; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }

    .section { margin-top: 14px; }
    .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #1f5c50; border-bottom: 1px solid #b9cfc7; padding-bottom: 3px; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 24px; }
    .row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; padding: 2.5px 0; }
    .row .k { flex: 0 0 auto; color: #47635a; font-size: 10.5px; }
    .val { font-weight: 600; }
    .blank { display: inline-block; flex: 1; border-bottom: 1px dotted #8aa39a; height: 1em; }
    .row .fill { flex: 1; }

    .note-box { border: 1px solid #b9cfc7; border-radius: 6px; min-height: 22mm; padding: 6px 8px; font-size: 11.5px; white-space: pre-wrap; }
    .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 16mm; }
    .sig div { text-align: center; font-size: 11px; border-top: 1px solid #14251f; padding-top: 4px; }
    .date-line { margin-top: 10mm; font-size: 11.5px; }

    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #47635a; padding: 4px 7px; font-size: 10.5px; text-align: left; }
    th { background: #eaf2ee; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .storno { text-decoration: line-through; color: #8aa39a; }

    /* Családfa — nemzedék-sávok, ágaztatott sorokkal */
    .gen { margin: 0 0 10px; }
    .gen h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .14em; color: #1f5c50; margin: 0 0 4px; }
    .branch { margin-left: 6px; border-left: 2px solid #b9cfc7; padding-left: 0; }
    .branch li { list-style: none; position: relative; padding: 2.5px 0 2.5px 16px; font-size: 11.5px; }
    .branch li::before { content: ''; position: absolute; left: 0; top: 50%; width: 12px; border-top: 2px solid #b9cfc7; }
    .branch .who { font-weight: 600; }
    .branch .who.center { color: #1f5c50; }
    .branch .rel { color: #47635a; font-size: 10px; margin-left: 6px; }
    .branch .meta { color: #7f958d; font-size: 10px; margin-left: 6px; }

    .sheet-footer { position: absolute; bottom: 7mm; left: 18mm; right: 16mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  `
}

export function buildPersonCardHtml(data: PersonCardPrintData): PersonCardPrintResult {
  const payments = (data.payments ?? []).slice(0, 30)
  const tree = data.tree ?? []
  const sheetCount = 1 + (payments.length > 0 ? 1 : 0) + (tree.length > 0 ? 1 : 0)
  const footer = (page: number) =>
    `<div class="sheet-footer"><span>Kartotéka · ${esc(data.congregationName)}</span><span>${page}/${sheetCount}</span></div>`

  const genderLabel = data.gender === 'ferfi' ? 'férfi' : data.gender === 'no' ? 'nő' : null

  const mainSheet = `<div class="sheet">
    <div class="head">
      <div>
        <div class="cong">${esc(data.congregationName)}</div>
        <h1>SZEMÉLYI KARTON</h1>
        <div class="row" style="margin-top:8px"><span class="k">Név:</span><span class="fill">${val(data.personName, '14rem')}</span></div>
        <div class="row"><span class="k">Születési családnév:</span><span class="fill">${val(data.szcsNev, '10rem')}</span></div>
        <div class="row"><span class="k">Egyházi azonosító:</span><span class="fill">${val(data.cnp, '10rem')}</span></div>
      </div>
      <div class="photo">${data.photoUrl ? `<img src="${esc(data.photoUrl)}" alt="" />` : 'FÉNYKÉP'}</div>
    </div>

    <div class="section">
      <h2>Személyes adatok</h2>
      <div class="grid">
        <div class="row"><span class="k">Született:</span><span class="fill">${val(fmtDate(data.birthDate))}</span></div>
        <div class="row"><span class="k">Születési hely:</span><span class="fill">${val(data.birthPlace)}</span></div>
        <div class="row"><span class="k">Neme:</span><span class="fill">${val(genderLabel)}</span></div>
        <div class="row"><span class="k">Vallása:</span><span class="fill">${val(data.religion)}</span></div>
        <div class="row"><span class="k">Foglalkozása:</span><span class="fill">${val(data.occupation)}</span></div>
        <div class="row"><span class="k">&nbsp;</span><span class="fill"></span></div>
        <div class="row"><span class="k">Édesapja neve:</span><span class="fill">${val(data.fatherName)}</span></div>
        <div class="row"><span class="k">Édesanyja neve:</span><span class="fill">${val(data.motherName)}</span></div>
      </div>
    </div>

    <div class="section">
      <h2>Lakóhely és elérhetőség</h2>
      <div class="row"><span class="k">Lakcím:</span><span class="fill">${val(data.address, '20rem')}</span></div>
      <div class="grid">
        <div class="row"><span class="k">Telefon:</span><span class="fill">${val(data.phone)}</span></div>
        <div class="row"><span class="k">E-mail:</span><span class="fill">${val(data.email)}</span></div>
      </div>
    </div>

    <div class="section">
      <h2>Anyakönyvi adatok</h2>
      <div class="grid">
        <div>
          <div class="row"><span class="k">Keresztelés ideje:</span><span class="fill">${val(fmtDate(data.baptism?.date))}</span></div>
          <div class="row"><span class="k">Helye:</span><span class="fill">${val(data.baptism?.place)}</span></div>
          <div class="row"><span class="k">Keresztelő lelkész:</span><span class="fill">${val(data.baptism?.pastor)}</span></div>
        </div>
        <div>
          <div class="row"><span class="k">Konfirmáció ideje:</span><span class="fill">${val(fmtDate(data.confirmation?.date))}</span></div>
          <div class="row"><span class="k">Helye:</span><span class="fill">${val(data.confirmation?.place)}</span></div>
          <div class="row"><span class="k">Konfirmáló lelkész:</span><span class="fill">${val(data.confirmation?.pastor)}</span></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Megjegyzés</h2>
      <div class="note-box">${esc((data.note ?? '').trim())}</div>
    </div>

    <div class="date-line">Kelt: ______________________, ________ év ______ hó ____ nap</div>
    <div class="sig"><div>lelkipásztor</div><div>a karton kitöltője</div></div>
    ${footer(1)}
  </div>`

  let paymentsSheet = ''
  if (payments.length > 0) {
    const rows = payments
      .map(
        (p) => `<tr${p.stornozott ? ' class="storno"' : ''}>
          <td>${esc(fmtDate(p.datum) ?? '—')}</td>
          <td>${esc(p.cel || 'Általános befizetés')}</td>
          <td class="num">${p.ev ?? '—'}</td>
          <td class="num">${p.osszeg.toFixed(2)} RON</td>
        </tr>`,
      )
      .join('')
    const total = payments.reduce((s, p) => s + (p.stornozott ? 0 : p.osszeg), 0)
    paymentsSheet = `<div class="sheet">
      <div class="head"><div><div class="cong">${esc(data.congregationName)}</div><h1>BEFIZETÉSEK</h1>
        <div class="row" style="margin-top:8px"><span class="k">Név:</span><span class="fill">${val(data.personName, '14rem')}</span></div>
      </div></div>
      <div class="section">
        <table>
          <thead><tr><th>Dátum</th><th>Cél</th><th class="num">Év</th><th class="num">Összeg</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><th colspan="3">Összesen (stornó nélkül)</th><th class="num">${total.toFixed(2)} RON</th></tr></tfoot>
        </table>
      </div>
      ${footer(2)}
    </div>`
  }

  let treeSheet = ''
  if (tree.length > 0) {
    const byGen = new Map<number, PersonCardTreeMember[]>()
    for (const m of tree) {
      if (!byGen.has(m.generation)) byGen.set(m.generation, [])
      byGen.get(m.generation)!.push(m)
    }
    const genBlocks = [...byGen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gen, members]) => {
        const label = GEN_LABELS[gen] ?? (gen < 0 ? `${-gen}. ős-nemzedék` : `${gen}. leszármazott-nemzedék`)
        const rows = members
          .map(
            (m) => `<li>
              <span class="who${m.isCenter ? ' center' : ''}">${m.deceased ? '✝ ' : ''}${esc(m.name)}</span>
              ${m.label ? `<span class="rel">${esc(m.label)}</span>` : ''}
              ${m.birthYear ? `<span class="meta">*${esc(m.birthYear)}</span>` : ''}
            </li>`,
          )
          .join('')
        return `<div class="gen"><h3>${esc(label)} (${members.length})</h3><ul class="branch">${rows}</ul></div>`
      })
      .join('')
    treeSheet = `<div class="sheet">
      <div class="head"><div><div class="cong">${esc(data.congregationName)}</div><h1>CSALÁDFA</h1>
        <div class="row" style="margin-top:8px"><span class="k">Kiinduló személy:</span><span class="fill">${val(data.personName, '14rem')}</span></div>
      </div></div>
      <div class="section">${genBlocks}</div>
      ${footer(sheetCount)}
    </div>`
  }

  return {
    title: `Személyi karton — ${data.personName || 'új tag'}`,
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Személyi karton</title><style>${styles()}</style></head><body data-sheet-count="${sheetCount}">${mainSheet}${paymentsSheet}${treeSheet}</body></html>`,
    sheetCount,
  }
}
