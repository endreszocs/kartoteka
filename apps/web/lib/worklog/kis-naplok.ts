/**
 * A hivatalos munkanapló KATEKÉZIS és CSALÁDLÁTOGATÁS naplólapjai
 * (2026-08-14, 18. pont 2. szelet — EREK-spec 3. és 4. szakasz).
 *
 * A hivatalos munkafüzet HÁROM naplólapból áll: Szolgálati alkalmak (ezt az
 * official-journal.ts adja, A4 fekvő), Katekézis és Családlátogatás (ezek itt,
 * A4 álló). Oszlopok a spec szerint:
 *   Katekézis:        Ssz. | Dátum | Katekézis jellege | Részt vett |
 *                     Tananyag | Perselypénz | A katekézist tartotta | Megjegyzés
 *   Családlátogatás:  Ssz. | Dátum | CsL/BL | A meglátogatott család neve |
 *                     A meglátogatott család címe | Jelen volt | Jegyzet
 *
 * Mező-térkép (a munkanapló-rögzítő bevett kontraktusa szerint):
 *   Tananyag / család neve ← cim · tartotta ← szolgalt · Részt vett/Jelen
 *   volt ← jelenlet_osszesen (részszámok összege fallback) · Jegyzet ←
 *   bibliaolvasás + énekek + megjegyzés (a spec: „olvasott bibliai rész,
 *   ének, egyéb").
 *   ⚠️ A meglátogatott család CÍMÉT a munkanapló nem tárolja — az oszlop a
 *   hivatalos forma miatt szerepel, kézzel tölthető a nyomtatott lapon.
 *
 * A sorszám ÉVEN BELÜL folyamatos (évváltásnál a hívó új dokumentumot kér).
 * SZÁNDÉKOSAN nulla importtal készül — a scripts/selftest-kis-naplok.mjs
 * önállóan fordítja és futtatja.
 */

export interface KisNaploSor {
  idopont: string | null
  jellege: string | null
  cim: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  bibliaolvasas: string | null
  enekek: string | null
}

/** Egy lapra kerülő sorok száma (A4 álló, a fejléccel együtt kényelmes). */
export const KIS_NAPLO_SOR_PER_LAP = 26

/**
 * A hivatalos CsL/BL jel a látogatás típusából. BL = beteg-jellegű látogatás
 * (a hivatalos ív két kategóriát ismer): Beteglátogatás, Kórházlátogatás,
 * Idősek otthona. Minden más (Családlátogatás, Börtönlátogatás, Egyéb
 * látogatás, ismeretlen) → CsL.
 */
export function csalBlJel(jellege: string | null | undefined): 'CsL' | 'BL' {
  const j = (jellege || '').trim()
  if (j === 'Beteglátogatás' || j === 'Kórházlátogatás' || j === 'Idősek otthona') return 'BL'
  return 'CsL'
}

function esc(v: string | null | undefined): string {
  return (v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtDatum(v: string | null | undefined): string {
  if (!v) return ''
  return (v.split('T')[0] || '').replace(/-/g, '. ') + '.'
}

function jelenlet(s: KisNaploSor): number {
  if (s.jelenlet_osszesen > 0) return s.jelenlet_osszesen
  return (s.jelenlet_ferfi || 0) + (s.jelenlet_no || 0) + (s.jelenlet_gyermek || 0)
}

function fmtPersely(n: number | null): string {
  if (n == null || n === 0) return ''
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1]
}

/** Jegyzet a családlátogatás-laphoz: bibliai rész + ének + egyéb, egyben. */
function jegyzet(s: KisNaploSor): string {
  const reszek: string[] = []
  if (s.bibliaolvasas) reszek.push(s.bibliaolvasas)
  if (s.enekek) reszek.push(`é.: ${s.enekek}`)
  if (s.megjegyzes) reszek.push(s.megjegyzes)
  return reszek.join(' · ')
}

function lapokra<T>(sorok: T[], meret: number): T[][] {
  if (sorok.length === 0) return [[]]
  const lapok: T[][] = []
  for (let i = 0; i < sorok.length; i += meret) lapok.push(sorok.slice(i, i + meret))
  return lapok
}

function lapFejlec(cim: string, nev: string, idoszak: string, lap: number, osszLap: number): string {
  return `<div class="title">${esc(cim)}</div>
    <div class="subtitle">${esc(nev)} — ${esc(idoszak)}${osszLap > 1 ? ` · ${lap}/${osszLap}. lap` : ''}</div>`
}

/** A hivatalos Katekézis naplólap (A4 álló) — .page blokkok sora. */
export function buildKatekezisNaploLapok(
  sorok: KisNaploSor[],
  gyulekezetNev: string,
  idoszak: string,
): string {
  const lapok = lapokra(sorok, KIS_NAPLO_SOR_PER_LAP)
  let sorszam = 0
  return lapok
    .map((lapSorok, lapIdx) => {
      const tbody = lapSorok
        .map((s) => {
          sorszam += 1
          return `<tr>
            <td class="text-center">${sorszam}</td>
            <td>${fmtDatum(s.idopont)}</td>
            <td>${esc(s.jellege)}</td>
            <td class="text-center">${jelenlet(s) || ''}</td>
            <td>${esc(s.cim)}</td>
            <td class="text-right">${fmtPersely(s.persely)}</td>
            <td>${esc(s.szolgalt)}</td>
            <td>${esc(s.megjegyzes)}</td>
          </tr>`
        })
        .join('')
      return `<div class="page">
        ${lapFejlec('Munkanapló — Katekézis', gyulekezetNev, idoszak, lapIdx + 1, lapok.length)}
        <table>
          <thead><tr>
            <th>Ssz.</th><th>Dátum</th><th>Katekézis jellege</th><th>Részt vett</th>
            <th>Tananyag</th><th>Perselypénz</th><th>A katekézist tartotta</th><th>Megjegyzés</th>
          </tr></thead>
          <tbody>${tbody || '<tr><td colspan="8" class="text-center">Nincs bejegyzés az időszakban.</td></tr>'}</tbody>
        </table>
      </div>`
    })
    .join('')
}

/** A hivatalos Családlátogatás naplólap (A4 álló) — .page blokkok sora. */
export function buildCsaladlatogatasNaploLapok(
  sorok: KisNaploSor[],
  gyulekezetNev: string,
  idoszak: string,
): string {
  const lapok = lapokra(sorok, KIS_NAPLO_SOR_PER_LAP)
  let sorszam = 0
  return lapok
    .map((lapSorok, lapIdx) => {
      const tbody = lapSorok
        .map((s) => {
          sorszam += 1
          return `<tr>
            <td class="text-center">${sorszam}</td>
            <td>${fmtDatum(s.idopont)}</td>
            <td class="text-center">${csalBlJel(s.jellege)}</td>
            <td>${esc(s.cim)}</td>
            <td></td>
            <td class="text-center">${jelenlet(s) || ''}</td>
            <td>${esc(jegyzet(s))}</td>
          </tr>`
        })
        .join('')
      return `<div class="page">
        ${lapFejlec('Munkanapló — Családlátogatás', gyulekezetNev, idoszak, lapIdx + 1, lapok.length)}
        <table>
          <thead><tr>
            <th>Ssz.</th><th>Dátum</th><th>CsL/BL</th><th>A meglátogatott család neve</th>
            <th>A meglátogatott család címe</th><th>Jelen volt</th><th>Jegyzet</th>
          </tr></thead>
          <tbody>${tbody || '<tr><td colspan="7" class="text-center">Nincs bejegyzés az időszakban.</td></tr>'}</tbody>
        </table>
        <div class="footnote">CsL = családlátogatás · BL = beteglátogatás. A család címe a munkanaplóban nem rögzített adat — a nyomtatott lapon kézzel tölthető.</div>
      </div>`
    })
    .join('')
}
