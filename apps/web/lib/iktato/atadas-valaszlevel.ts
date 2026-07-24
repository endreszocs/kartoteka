/**
 * Iktató F8c — átjelentkezés-elfogadó VÁLASZLEVÉL generátor.
 *
 * Amikor a fogadó gyülekezet lelkésze ELFOGADJA az átjelentkezési kérelmet
 * (respondToTransferNotification), automatikus hivatalos válaszlevél készül:
 *  - a fogadó iktatójában KIMENŐ iratként iktatva (saveFilingEntry),
 *  - a küldő gyülekezet iktatójában BEJÖVŐ iratként megjelenve
 *    (iktato_atadas_bejegyzes RPC, hivatkozással a válasz-iratszámra),
 *  - a szövege best-effort ertesitesek-üzenetként megy a küldő lelkészeinek.
 *
 * WYSIWYG-elv (minta: eletut-igazolas.ts): @page A4 portrait, a lap-margót a
 * .sheet paddingja adja — az előnézet, a PDF és a nyomtatás ugyanazt a HTML-t
 * kapja. Tisztán pure modul (nincs DOM-hivatkozás, nincs import) — a hívó
 * iframe/srcdoc-ba töltheti, vagy sima szöveggé alakítva üzenetbe teheti.
 * Minden dinamikus érték esc()-en megy át (XSS + törött markup ellen).
 */

// ─────────────────────────────────────────────────────────────────
// Publikus típus — a hívó (respondToTransferNotification) opciói
// ─────────────────────────────────────────────────────────────────

export interface AtadasValaszlevelOptions {
  /** A FOGADÓ (elfogadó) egyházközség megjelenítendő neve. */
  fogadoGyulekezet: string
  /** A KÜLDŐ (eredeti) egyházközség megjelenítendő neve — a címzett. */
  kuldoGyulekezet: string
  /** Az átjelentkező egyháztag teljes neve. */
  szemelyNev: string
  /** A küldő eredeti átadási igazolásának iktatószáma (ha ismert). */
  eredetiIratszam: string | null
  /** A válaszlevél saját (fogadó-oldali, kimenő) iktatószáma. */
  valaszIratszam: string
  /** Keltezés megjelenítésre kész szövegként (pl. „2026. július 25."). */
  kelt: string
  /** Az elfogadó lelkipásztor neve (aláírás-blokk). */
  lelkipasztor: string
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek
// ─────────────────────────────────────────────────────────────────

/** HTML-escape MINDEN dinamikus értékre (XSS + törött markup ellen). */
function esc(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Nullable szöveg trimmelve — null/undefined → ''. */
function txt(v: string | null | undefined): string {
  return (v || '').trim()
}

/** „a" / „az" névelő zárójeles alakja gyülekezet-név elé: „A(z)". */
function neveloNagy(nev: string): string {
  const elso = (nev.trim().charAt(0) || '').toLowerCase()
  return 'aáeéiíoóöőuúüű'.includes(elso) ? 'Az' : 'A(z)'
}

// ─────────────────────────────────────────────────────────────────
// A válaszlevél HTML-je (A4, Times — nyomtatás- és iframe-kompatibilis)
// ─────────────────────────────────────────────────────────────────

/**
 * Rövid hivatalos válaszlevél: a fogadó egyházközség visszaigazolja, hogy az
 * egyháztag átjelentkezési kérelmét elfogadta és nevezettet nyilvántartásába
 * felvette — hivatkozással a küldő eredeti iktatószámára.
 */
export function buildAtadasValaszlevelHtml(opts: AtadasValaszlevelOptions): string {
  const fogado = txt(opts.fogadoGyulekezet) || 'az egyházközség'
  const kuldo = txt(opts.kuldoGyulekezet) || 'az egyházközség'
  const nev = txt(opts.szemelyNev) || 'az egyháztag'
  const eredeti = txt(opts.eredetiIratszam)
  const valasz = txt(opts.valaszIratszam)
  const kelt = txt(opts.kelt)
  const lelkipasztor = txt(opts.lelkipasztor)

  const hivatkozasMondat = eredeti
    ? ` Hivatkozás: a(z) ${esc(kuldo)} Egyházközség ${esc(eredeti)} iktatószámú egyháztag-átadási igazolása.`
    : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>Átjelentkezés visszaigazolása — ${esc(nev)}</title>
<style>
  /* WYSIWYG: A4 portrait, a lap-margót a .sheet paddingja adja. */
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body {
    font-family: 'Times New Roman', Times, serif;
    color: #111827;
    font-size: 12pt;
    line-height: 1.55;
  }
  .sheet {
    box-sizing: border-box;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #ffffff;
    /* 18mm bal lefűző-margó (iktatós iratok bevett gyakorlata). */
    padding: 20mm 18mm 20mm 22mm;
  }
  @media print {
    html, body { background: #ffffff; }
    .sheet { margin: 0; }
  }
  .fejlec {
    text-align: center;
    border-bottom: 1.5pt solid #111827;
    padding-bottom: 4mm;
    margin-bottom: 6mm;
  }
  .fejlec .gyulekezet {
    font-size: 14pt;
    font-weight: bold;
    letter-spacing: 0.4pt;
    text-transform: uppercase;
  }
  .fejlec .hivatal { font-size: 10.5pt; margin-top: 1mm; }
  .iktatosor {
    display: flex;
    justify-content: space-between;
    gap: 8mm;
    font-size: 11pt;
    margin-bottom: 8mm;
  }
  .cimzett { margin-bottom: 8mm; }
  .cimzett .nev { font-weight: bold; }
  .targy { font-weight: bold; margin-bottom: 6mm; }
  .torzs p { text-align: justify; text-indent: 10mm; margin: 0 0 4mm; }
  .zaras { margin-top: 10mm; text-indent: 10mm; }
  .lablec {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 10mm;
    margin-top: 18mm;
  }
  .lablec .kelt { font-size: 11.5pt; }
  .alairas { text-align: center; min-width: 55mm; }
  .alairas .vonal {
    border-top: 1pt solid #111827;
    margin-bottom: 1.5mm;
    padding-top: 1.5mm;
  }
  .alairas .tisztseg { font-size: 10.5pt; }
  .ph { text-align: center; font-size: 10pt; color: #374151; margin-top: 6mm; }
</style>
</head>
<body data-sheet-count="1">
  <div class="sheet">
    <div class="fejlec">
      <div class="gyulekezet">${esc(fogado)} Egyházközség</div>
      <div class="hivatal">Lelkészi Hivatal</div>
    </div>

    <div class="iktatosor">
      <span>Iktatószám: <strong>${esc(valasz)}</strong></span>
      <span>Hivatkozási szám: ${eredeti ? `<strong>${esc(eredeti)}</strong>` : '—'}</span>
    </div>

    <div class="cimzett">
      <div class="nev">${esc(kuldo)} Egyházközség</div>
      <div>Lelkészi Hivatala részére</div>
    </div>

    <div class="targy">Tárgy: Átjelentkezés visszaigazolása — ${esc(nev)}</div>

    <div class="torzs">
      <p>Nagytiszteletű Lelkészi Hivatal!</p>
      <p>
        ${esc(neveloNagy(fogado))} <strong>${esc(fogado)} Egyházközség</strong> visszaigazolja,
        hogy <strong>${esc(nev)}</strong> átjelentkezési kérelmét <strong>elfogadta</strong>,
        nevezettet nyilvántartásába felvette.${hivatkozasMondat}
      </p>
      <p>
        Az egyháztag felvételének tényét egyházközségünk iktatókönyvében a fenti
        iktatószámon tartjuk nyilván.
      </p>
    </div>

    <div class="zaras">Atyafiságos tisztelettel,</div>

    <div class="lablec">
      <div class="kelt">Kelt: ${esc(kelt)}</div>
      <div class="alairas">
        <div class="vonal">${esc(lelkipasztor) || '&nbsp;'}</div>
        <div class="tisztseg">lelkipásztor</div>
      </div>
    </div>

    <div class="ph">P.&nbsp;H.</div>
  </div>
</body>
</html>`
}
