/**
 * JEGYZŐKÖNYV-NYOMTATVÁNYOK — KÖZÖS HTML-ÉPÍTŐ
 * (jegyzőkönyv · határozat-kivonat · meghívó)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT EZ A FÁJL (2026-08-24, biztonsági kör — B3: tárolt XSS)
 * ════════════════════════════════════════════════════════════════════════════
 * A nyomtatvány HTML-jét eddig HÁROM komponens állította elő, egymástól
 * függetlenül lemásolva:
 *   · components/minutes/minutes-editor.tsx
 *   · components/minutes/minutes-list.tsx
 *   · components/minutes/minutes-print-selector.tsx
 * és EGYIK sem escape-elt EGYETLEN mezőt sem (h.szoveg, np.cim, np.targyalas,
 * np.eloado, résztvevő-nevek, elnök/jegyző/hitelesítők, hely, igevers,
 * megjegyzés, gyülekezetnév). A `.replace(/\n/g, '<br>')` még segített is a
 * támadónak: a sortörések megmaradtak, a tagek nem törtek el.
 *
 * TÁMADÁSI LÁNC: egy jegyzőkönyv-írásra jogosult felhasználó beírt egy
 * `<img src=x onerror=...>`-t egy határozat szövegébe → BÁRKI, aki később
 * megnyitotta a „Nyomtatás" előnézetet (esperes, számvevő, RENDSZERGAZDA a
 * felülvizsgálatkor), a SAJÁT munkamenetével futtatta le, a kartoteka.app
 * originben — hozzáféréssel a session-tokenhez.
 *
 * A JAVÍTÁS KÉT LÁBON ÁLL:
 *  1. MINDEN interpolált szövegmező az `esc()`-en megy át (lásd lentebb).
 *  2. A HTML-építés EGY helyen van — ez a fájl. A projekt dokumentált
 *     hibaosztálya, hogy „a második felület a régi implementációt őrzi":
 *     három másolatnál egy jövőbeli mező-bővítés simán maradhatna escape
 *     nélkül az egyik példányban.
 *
 * ⚠️ SORREND-SZABÁLY: ELŐSZÖR escape, AZTÁN a sortörés-konverzió
 * (`\n` → `<br>`). Fordítva a beszúrt `<br>` maga is escape-elődne, és a
 * sortörés elveszne a hivatalos nyomtatványból. Erre külön asszert van a
 * `scripts/selftest-jegyzokonyv-xss.mjs`-ben.
 *
 * Az escape-elő a repó MEGLÉVŐ, közös implementációja (`@/lib/filing/templates`),
 * ugyanaz, amit az iktató és a dokumentum-családok használnak — nem másolat.
 */

import { escapeHtml } from '@/lib/filing/templates'

// ─────────────────────────────────────────────────────────────────────────────
// Escape-elők
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Egy EGYSOROS szövegmező HTML-be írása.
 * MINDEN felhasználói eredetű érték ezen keresztül kerül a nyomtatványba.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return escapeHtml(String(value))
}

/**
 * Egy TÖBBSOROS szövegmező HTML-be írása (a sortörések megmaradnak).
 * ⚠️ A sorrend kötött: escape → utána `<br>`. Lásd a fájl fejlécét.
 */
export function escTobbsoros(value: unknown): string {
  return esc(value).replace(/\n/g, '<br>')
}

// ─────────────────────────────────────────────────────────────────────────────
// Adatmodell — a szerkesztő (memóriabeli) és a mentett (adatbázisbeli) alak
// közös nevezője. Minden mező elhagyható: hiányzó adatnál kitöltő vonal jön.
// ─────────────────────────────────────────────────────────────────────────────

export type MinutesPrintType = 'jegyzokonyv' | 'meghivo' | 'hatarozat_kivonat'

export interface MinutesPrintResztvevo {
  nev?: string | null
  statusz?: string | null
}

export interface MinutesPrintHatarozat {
  sorszam?: number | string | null
  szoveg?: string | null
  /** Mentett adatnál: melyik napirendi ponthoz tartozik. */
  napirendi_pont_id?: string | null
}

export interface MinutesPrintNapirend {
  id?: string | null
  sorszam?: number | string | null
  cim?: string | null
  eloado?: string | null
  targyalas?: string | null
  /** A szerkesztőben a határozatok közvetlenül a napirendi ponton ülnek. */
  hatarozatok?: MinutesPrintHatarozat[]
}

export interface MinutesPrintData {
  congregationName?: string | null
  tipus?: string | null
  datum?: string | null
  hely?: string | null
  kezdes?: string | null
  elnok_neve?: string | null
  jegyzo_neve?: string | null
  hitelesito1?: string | null
  hitelesito2?: string | null
  igevers?: string | null
  felolvasas?: string | null
  megjegyzes?: string | null
  resztvevok?: MinutesPrintResztvevo[]
  napirendi_pontok?: MinutesPrintNapirend[]
  /** Mentett adatnál a határozatok külön listában érkeznek. */
  hatarozatok?: MinutesPrintHatarozat[]
}

export interface MinutesPrintOptions {
  /** A határozat-kivonatban legyen-e „Napirend" oszlop (a szerkesztőben igen). */
  napirendOszlop?: boolean
  /** A meghívó végén a „Tudomásul vették" aláíró lista (a szerkesztőben igen). */
  presbiterLista?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Segédek
// ─────────────────────────────────────────────────────────────────────────────

const KITOLTO = '_______________'

function evSzam(datum?: string | null): number {
  if (datum) {
    const d = new Date(datum)
    if (!Number.isNaN(d.getTime())) return d.getFullYear()
  }
  return new Date().getFullYear()
}

function kozgyulesE(data: MinutesPrintData): boolean {
  return data.tipus === 'kozgyulesi'
}

function vanSzoveg(h: MinutesPrintHatarozat): boolean {
  return String(h.szoveg ?? '').trim() !== ''
}

/**
 * A határozatok napirendi pontokhoz rendelése.
 *
 * Két bemeneti alak van, és MINDKETTŐT ugyanide vezetjük:
 *  · szerkesztő: a határozatok a napirendi ponton ülnek (`np.hatarozatok`),
 *  · mentett adat: külön lista, `napirendi_pont_id` hivatkozással.
 * Ami egyik napirendi pontra sem hivatkozik, az a napirend UTÁN jelenik meg —
 * így nem tűnhet el egyetlen elfogadott határozat sem.
 */
function csoportositottHatarozatok(data: MinutesPrintData): {
  napirendenkent: MinutesPrintHatarozat[][]
  maradek: MinutesPrintHatarozat[]
} {
  const napirend = data.napirendi_pontok ?? []
  const laza = (data.hatarozatok ?? []).filter(vanSzoveg)
  const felhasznalt = new Set<MinutesPrintHatarozat>()

  const napirendenkent = napirend.map((np) => {
    const sajat = (np.hatarozatok ?? []).filter(vanSzoveg)
    if (sajat.length > 0) return sajat
    if (!np.id) return []
    const csatolt = laza.filter((h) => h.napirendi_pont_id && h.napirendi_pont_id === np.id)
    csatolt.forEach((h) => felhasznalt.add(h))
    return csatolt
  })

  return { napirendenkent, maradek: laza.filter((h) => !felhasznalt.has(h)) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Közös stílus és aláírás-blokk
// ─────────────────────────────────────────────────────────────────────────────

const ALAP_STILUS = `
      * { box-sizing: border-box; }
      body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; padding: 30mm 25mm; font-size: 12pt; line-height: 1.7; background: #fff; }
      @page { size: A4 portrait; margin: 0; }
      @media print { body { padding: 20mm 25mm 30mm 30mm; } }
    `

function alairasBlokk(data: MinutesPrintData): string {
  return `<div style="margin-top:28px;text-align:center;font-size:11pt;">K.m.f</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;">
        <div style="text-align:center;font-size:11pt;"><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin-left:auto;margin-right:auto;">${esc(data.elnok_neve) || KITOLTO}<br>lelkipásztor</div></div>
        <div style="text-align:center;font-size:11pt;"><div style="margin-top:28px;border-top:1px solid #111;padding-top:4px;width:180px;margin-left:auto;margin-right:auto;">${esc(data.jegyzo_neve) || KITOLTO}<br>gondnok-jegyző</div></div>
      </div>
      <div style="text-align:center;font-size:11pt;margin-top:16px;">Hitelesítők:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px;">
        <div style="text-align:center;font-size:11pt;"><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin-left:auto;margin-right:auto;">${esc(data.hitelesito1) || KITOLTO}</div></div>
        <div style="text-align:center;font-size:11pt;"><div style="margin-top:24px;border-top:1px solid #111;padding-top:4px;width:180px;margin-left:auto;margin-right:auto;">${esc(data.hitelesito2) || KITOLTO}</div></div>
      </div>`
}

function dokumentum(cim: string, torzs: string): string {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(cim)}</title><style>${ALAP_STILUS}</style></head><body>${torzs}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HATÁROZAT KIVONAT
// ─────────────────────────────────────────────────────────────────────────────

function hatarozatKivonat(data: MinutesPrintData, opciok: MinutesPrintOptions): string {
  const ev = evSzam(data.datum)
  const napirend = data.napirendi_pontok ?? []
  const { napirendenkent, maradek } = csoportositottHatarozatok(data)

  const sorok: Array<{ h: MinutesPrintHatarozat; napirendCim: string }> = []
  napirendenkent.forEach((lista, i) => {
    lista.forEach((h) => sorok.push({ h, napirendCim: String(napirend[i]?.cim ?? '') }))
  })
  maradek.forEach((h) => sorok.push({ h, napirendCim: '' }))

  const napirendOszlop = opciok.napirendOszlop === true
  const hatarozatSorok = sorok
    .map(({ h, napirendCim }) => {
      const napirendCella = napirendOszlop
        ? `<td style="border:1px solid #334155;padding:6px 8px;font-size:10pt;">${esc(napirendCim)}</td>`
        : ''
      return `<tr><td style="border:1px solid #334155;padding:6px 8px;text-align:center;font-weight:bold;">${esc(h.sorszam)}/${ev}</td><td style="border:1px solid #334155;padding:6px 8px;">${escTobbsoros(h.szoveg)}</td>${napirendCella}</tr>`
    })
    .join('')

  const napirendFejlec = napirendOszlop
    ? '<th style="border:1px solid #334155;padding:6px;background:#e2e8f0;font-size:10pt;">Napirend</th>'
    : ''

  return dokumentum(
    'Határozat kivonat',
    `<div style="text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:3px;font-size:14pt;margin-bottom:16px;">HATÁROZAT KIVONAT — ${ev}</div>
        <div style="border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:14px;font-style:italic;font-weight:bold;">${esc(data.congregationName)}</div>
        <table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #334155;padding:6px;background:#e2e8f0;font-size:10pt;">Szám</th><th style="border:1px solid #334155;padding:6px;background:#e2e8f0;font-size:10pt;">Határozat</th>${napirendFejlec}</tr></thead><tbody>${hatarozatSorok}</tbody></table>
        ${alairasBlokk(data)}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MEGHÍVÓ
// ─────────────────────────────────────────────────────────────────────────────

function meghivo(data: MinutesPrintData, opciok: MinutesPrintOptions): string {
  const kozgyules = kozgyulesE(data)
  const gyulesCimke = kozgyules ? 'közgyűlésre' : 'presbiteri gyűlésre'
  const megszolitott = kozgyules ? 'Gyülekezet tagjait' : 'Presbitérium tagjait'

  const napirendLista = (data.napirendi_pontok ?? [])
    .filter((np) => String(np.cim ?? '').trim() !== '')
    .map((np) => `<div style="margin-bottom:3px;padding-left:16px;">— ${esc(np.cim)}</div>`)
    .join('')

  let presbiterSorok = ''
  if (opciok.presbiterLista === true) {
    presbiterSorok = (data.resztvevok ?? [])
      .map((r) => String(r.nev ?? '').trim())
      .filter((nev) => nev !== '')
      .map(
        (nev, i) =>
          `<div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:11pt;"><span>${i + 1}. ${esc(nev)}</span><span style="flex:1;border-bottom:1px dotted #94a3b8;margin:0 8px 4px;"></span></div>`,
      )
      .join('')
  }

  return dokumentum(
    'Meghívó',
    `<div style="border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:16px;">
          <div style="font-size:13pt;font-weight:bold;font-style:italic;">${esc(data.congregationName)}</div>
          <div style="font-style:italic;font-weight:bold;">Lelkipásztori Hivatala.</div>
        </div>
        <div style="text-align:center;font-weight:bold;font-style:italic;font-size:14pt;letter-spacing:6px;margin:24px 0 16px;">M e g h í v ó</div>
        <p style="text-align:justify;">Tisztelettel és szeretettel hívom meg a ${megszolitott} a <strong>${esc(data.datum) || '___'}</strong>-én, <strong>${esc(data.kezdes) || '___'}</strong> órakor kezdődő, ${gyulesCimke}. A gyűlés helye: <strong>${esc(data.hely) || '___'}</strong>.</p>
        ${napirendLista ? `<p style="font-weight:bold;margin:16px 0 8px;">Tárgysorozat:</p>${napirendLista}` : ''}
        <p style="margin-top:24px;">Kelt: ${esc(data.datum) || '___'}</p>
        <p style="font-style:italic;">Atyafiai köszöntéssel,</p>
        <div style="margin-top:16px;"><div style="border-top:1px solid #111;width:180px;padding-top:4px;font-size:11pt;">lelkipásztor</div></div>
        ${presbiterSorok ? `<p style="font-weight:bold;font-size:11pt;margin-top:20px;">Tudomásul vették:</p><div style="columns:2;column-gap:24px;margin-top:8px;">${presbiterSorok}</div>` : ''}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. JEGYZŐKÖNYV
// ─────────────────────────────────────────────────────────────────────────────

function jegyzokonyv(data: MinutesPrintData): string {
  const ev = evSzam(data.datum)
  const kozgyules = kozgyulesE(data)
  const testuletNev = kozgyules ? 'Közgyűlésének' : 'Presbitériumának'
  const resztvevok = data.resztvevok ?? []
  const nev = (r: MinutesPrintResztvevo) => String(r.nev ?? '')
  const jelen = resztvevok.filter((r) => r.statusz === 'jelen').map(nev).join(', ')
  const igazoltanTavol = resztvevok
    .filter((r) => r.statusz === 'igazoltan_tavol')
    .map(nev)
    .join(', ')

  const napirend = data.napirendi_pontok ?? []
  const { napirendenkent, maradek } = csoportositottHatarozatok(data)

  const hatarozatBlokk = (h: MinutesPrintHatarozat) =>
    `<div style="margin:8px 0 8px 35%;text-align:justify;font-style:italic;">${escTobbsoros(h.szoveg)}</div>`

  let torzs = ''
  napirend.forEach((np, i) => {
    torzs += `<div style="margin-top:16px;"><strong>${esc(np.sorszam)}-${ev}.</strong>&emsp;${esc(np.cim)}${np.eloado ? ` — <em>Előadó: ${esc(np.eloado)}</em>` : ''}`
    if (np.targyalas) {
      torzs += `<p style="text-align:justify;margin:6px 0;">${escTobbsoros(np.targyalas)}</p>`
    }
    napirendenkent[i].forEach((h) => { torzs += hatarozatBlokk(h) })
    torzs += '</div>'
  })
  maradek.forEach((h) => { torzs += hatarozatBlokk(h) })

  // A „presbiterek." toldalék CSAK presbiteri gyűlésnél igaz — közgyűlésen a
  // jelenlévők nem (csak) presbiterek.
  const jelenToldalek = kozgyules ? '' : ' presbiterek.'

  const igeSor = data.igevers
    ? `<p><strong>Felolvasott ige:</strong> ${esc(data.igevers)}${data.felolvasas ? ` — ${esc(data.felolvasas)}` : ''}</p>`
    : ''

  return dokumentum(
    'Jegyzőkönyv',
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;">
        <div style="font-style:italic;"><div style="font-weight:bold;font-size:12pt;">${esc(data.congregationName)}</div><div>Lelkipásztori Hivatala.</div></div>
        <div style="text-align:right;font-size:10pt;color:#475569;">JEGYZŐKÖNYV</div>
      </div>
      <p style="text-align:justify;font-style:italic;">Jegyzőkönyv, mely készült a ${esc(data.congregationName)} ${testuletNev} <strong>${esc(data.datum)}</strong>-én a ${esc(data.hely) || 'gyülekezeti teremben'} tartott rendes gyűlésén.</p>
      <p><strong>Elnök:</strong> ${esc(data.elnok_neve) || '—'} lelkipásztor, <strong>Jegyző:</strong> ${esc(data.jegyzo_neve) || '—'} gondnok-jegyző</p>
      ${igeSor}
      <p><strong><u>Jelen vannak:</u></strong> ${esc(jelen) || '—'}${jelenToldalek}</p>
      ${igazoltanTavol ? `<p><strong>Igazoltan távol:</strong> ${esc(igazoltanTavol)}</p>` : ''}
      ${torzs}
      ${data.megjegyzes ? `<p style="margin-top:12px;">${escTobbsoros(data.megjegyzes)}</p>` : ''}
      ${alairasBlokk(data)}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Belépési pont — MINDHÁROM felület ezt hívja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A kiválasztott jegyzőkönyv-nyomtatvány teljes HTML-je.
 *
 * ⚠️ Ne épüljön újra HTML a komponensekben: minden mező itt megy át az
 * `esc()`/`escTobbsoros()`-on. Lásd a fájl fejlécét.
 */
export function buildMinutesPrintHtml(
  type: MinutesPrintType | string,
  data: MinutesPrintData,
  opciok: MinutesPrintOptions = {},
): string {
  if (type === 'hatarozat_kivonat') return hatarozatKivonat(data, opciok)
  if (type === 'meghivo') return meghivo(data, opciok)
  return jegyzokonyv(data)
}
