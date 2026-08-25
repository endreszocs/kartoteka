/**
 * Alapeszköz-értékhatár (prag mijloc fix) — dátumfüggő, hivatalos küszöbök
 * (2026-08-26, Leltar 3_43 kör).
 *
 * MIÉRT DÁTUMFÜGGŐ: a román szabályozás a BESZERZÉS NAPJÁN érvényes
 * küszöböt rendeli alkalmazni, és a küszöb időben változott:
 *   - 1800 lej  — HG 105/2007 óta, 2013. június 30-ig
 *   - 2500 lej  — HG 276/2013, 2013. július 1-től
 *   - 5000 lej  — OUG 8/2026, 2026. február 25-től (a Hivatalos Közlönyben
 *                 való megjelenés napjától; NEM visszamenőleges — a 2025.
 *                 december 31-én már nyilvántartott eszközök a meglévő
 *                 leírási rendjük szerint futnak tovább). Az OUG 8/2026 azt
 *                 is kimondja, hogy a küszöböt évente kormányhatározat
 *                 aktualizálja a fogyasztói árindex alapján — új érték a
 *                 tömb VÉGÉRE kerül, a régiek nem módosulnak.
 *
 * A küszöb ITT CSAK FIGYELMEZTETÉST ad (kategória-javaslat), soha nem tilt:
 * a besorolás egyházi/könyvelői döntés, és a használati idő (>1 év) szempontja
 * önmagában is alapeszközzé tehet egy küszöb alatti tárgyat.
 */

export interface AlapeszkozErtekhatar {
  /** Ettől a naptól (ISO dátum, befoglaló) érvényes. */
  tol: string
  /** A küszöb lejben. */
  osszegLej: number
  /** A jogszabály, amely bevezette (súgókhoz, üzenetekhez). */
  jogszabaly: string
}

export const ALAPESZKOZ_ERTEKHATAROK: AlapeszkozErtekhatar[] = [
  { tol: '1900-01-01', osszegLej: 1800, jogszabaly: 'HG 105/2007' },
  { tol: '2013-07-01', osszegLej: 2500, jogszabaly: 'HG 276/2013' },
  { tol: '2026-02-25', osszegLej: 5000, jogszabaly: 'OUG 8/2026' },
]

/**
 * A beszerzés napján érvényes alapeszköz-értékhatár. Hiányzó/hibás dátumnál a
 * MAI napon érvényes küszöböt adja (a rögzítés tipikusan friss beszerzés).
 */
export function getAlapeszkozErtekhatar(beszerzesDatuma?: string | null): AlapeszkozErtekhatar {
  const datum = beszerzesDatuma && !Number.isNaN(new Date(beszerzesDatuma).getTime())
    ? beszerzesDatuma.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  let ervenyes = ALAPESZKOZ_ERTEKHATAROK[0]
  for (const hatar of ALAPESZKOZ_ERTEKHATAROK) {
    if (hatar.tol <= datum) ervenyes = hatar
  }
  return ervenyes
}

/**
 * Kategória-javaslat figyelmeztetés a rögzítéshez/importhoz. `null` = nincs
 * észrevétel. EGYSÉGÁRRA vet össze (a küszöb tárgyanként értendő, nem tételsor-
 * összegre).
 */
export function alapeszkozKuszobFigyelmeztetes(params: {
  kategoria: 'alapeszkoz' | 'csekely' | string
  egysegAr: number
  beszerzesDatuma?: string | null
}): string | null {
  const { kategoria, egysegAr, beszerzesDatuma } = params
  if (!(egysegAr > 0)) return null
  const hatar = getAlapeszkozErtekhatar(beszerzesDatuma)
  if (kategoria === 'alapeszkoz' && egysegAr < hatar.osszegLej) {
    return (
      `Az egységár (${egysegAr.toLocaleString('hu-HU')} lej) a beszerzés idején érvényes ` +
      `alapeszköz-értékhatár (${hatar.osszegLej.toLocaleString('hu-HU')} lej, ${hatar.jogszabaly}) ALATT van — ` +
      'jellemzően a Csekély értékű leltári tárgyak közé tartozik, kivéve ha az 1 évnél hosszabb ' +
      'használat miatt alapeszközként tartjátok nyilván.'
    )
  }
  if (kategoria === 'csekely' && egysegAr >= hatar.osszegLej) {
    return (
      `Az egységár (${egysegAr.toLocaleString('hu-HU')} lej) eléri a beszerzés idején érvényes ` +
      `alapeszköz-értékhatárt (${hatar.osszegLej.toLocaleString('hu-HU')} lej, ${hatar.jogszabaly}) — ` +
      'jellemzően az Alapeszközök közé tartozik (amortizációval).'
    )
  }
  return null
}
