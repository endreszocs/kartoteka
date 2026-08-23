/**
 * A KIÁLLÍTÓ (egyházközség / egyházmegye / egyházkerület) HIVATALOS NEVE a
 * nyomtatványok fejlécébe — EGY forrásból, minden ívnek.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A FÁJL — KÉT HIBAOSZTÁLY EGYSZERRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  (1) NÉMA MAGYAR VISSZAESÉS. A román nyomtatványok fejléce eddig a
 *      `nev_ro || magyar` vagy-láncot használta (reporting.ts:384, 466, 596,
 *      1112). Ha a `nev_ro` üres — és a `dioceses.nev_ro` oszlop csak
 *      2026-08-15 óta létezik, a MEGLÉVŐ megye-sorokon NULL —, akkor a
 *      REGISTRU CASA fejlécébe HANG NÉLKÜL a magyar név került
 *      („Kézdi-Orbai Református Egyházmegye" egy végig román íven). A vagy-lánc
 *      nem hibázott: pontosan azt tette, amit írtak — csak senki nem látta,
 *      hogy visszaesett.
 *
 *  (2) SZÉTHÚZÓ MÁSOLATOK. Ugyanez a döntés 12+ helyen kellett. A
 *      `budget-reporting.ts` `hivatalosEntitasNev`-je MÁR a helyes mintát vitte
 *      (magyar / román, üres románnál CSAK a magyar), a többi ív viszont vagy
 *      vagy-láncot használt, vagy egyáltalán nem is ismerte a román nevet. Két
 *      felület, két viselkedés — a projekt visszatérő hibaosztálya.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A SZABÁLY (Endre döntése, ESZREVETELEK-TERV-2026-08-22.md „6. pont")
 * ════════════════════════════════════════════════════════════════════════════
 *   · van román név  → `MAGYAR NÉV / ROMÁN NÉV`
 *   · nincs román név → CSAK a magyar név, SABLON-KIEGÉSZÍTÉS NÉLKÜL
 *
 * ⛔ SOHA NE GENERÁLJ román nevet prefixből („PAROHIA REFORMATĂ" + magyar név),
 *    címerből vagy szint-felismerésből. A magyarból képzett román alak HAMIS
 *    ADAT egy aláírható, hivatalos iraton. A hiányzó nevet a beállítás-
 *    varázslón át kell pótolni (adatoldal), nem a nyomtatóban kitalálni.
 *
 * ⚠️ EZ A FÜGGVÉNY NEM TILT. A hiányzó román név a papírt HIÁNYOSSÁ teszi, de
 *    nem hazuggá — a nyomtatás emiatt nem áll meg (a fail-closed kapu
 *    szándékosan aszimmetrikus, csak a MAGYAR név hiányát tiltja; lásd
 *    apps/web/components/finance/finance-print-dialog.tsx MIÉRT-blokkját).
 *
 * ⚠️ HTML-ESCAPE: ez a függvény NYERS SZÖVEGET ad vissza. A hívó dolga az
 *    `esc()`. Mivel az elválasztó (` / `) escape-elendő karaktert nem
 *    tartalmaz, az `esc(hivatalosKetnyelvuNev(hu, ro))` ÉS a részenkénti
 *    escape-elés ugyanazt adja.
 *
 * Tiszta függvény, függőség nélkül — web és desktop egyaránt ezt hívja.
 */

export interface KetnyelvuNevOpts {
  /**
   * NAGYBETŰS alak. A hivatalos ívek fejléce (Számadás/Költségvetés borító) így
   * kéri; a magyar rész `hu-HU`, a román rész `ro-RO` locale szerint.
   * Alapérték: `false`.
   */
  nagybetus?: boolean
  /**
   * Melyik nyelv áll ELÖL. Alapérték: `'hu'` (a fenti egységes szabály).
   *
   * A `'ro'` KIZÁRÓLAG olyan ívre való, amelynek EGÉSZ szövege nyelvet vált
   * (ma egyedül a Fișa mijlocului fix: `lang === 'ro'` esetén a teljes karton
   * román-elsővé fordul, minden címkéjével együtt). Ott a magyar-elsős fejléc
   * mondana ellent a lap többi részének.
   */
  elol?: 'hu' | 'ro'
  /** Az elválasztó. Alapérték: `' / '`. */
  elvalaszto?: string
}

/**
 * A kiállító hivatalos, kétnyelvű megnevezése.
 *
 * @param hu a MAGYAR hivatalos név (congregations.name / dioceses.name /
 *           districts.name) — a kötelező mező
 * @param ro a ROMÁN hivatalos név (`nev_ro`) — opcionális; üresnél a magyar áll
 *           EGYEDÜL, kiegészítés nélkül
 *
 * @example hivatalosKetnyelvuNev('Barátosi Református Egyházközség', 'Parohia Reformată Brateș')
 *          // → 'Barátosi Református Egyházközség / Parohia Reformată Brateș'
 * @example hivatalosKetnyelvuNev('Kézdi-Orbai Református Egyházmegye', null)
 *          // → 'Kézdi-Orbai Református Egyházmegye'   (NEM „… / PROTOPOPIATUL REFORMAT")
 */
export function hivatalosKetnyelvuNev(
  hu: string | null | undefined,
  ro: string | null | undefined,
  opts: KetnyelvuNevOpts = {},
): string {
  const { nagybetus = false, elol = 'hu', elvalaszto = ' / ' } = opts
  const huTiszta = (hu || '').trim()
  const roTiszta = (ro || '').trim()
  const huResz = nagybetus ? huTiszta.toLocaleUpperCase('hu-HU') : huTiszta
  const roResz = nagybetus ? roTiszta.toLocaleUpperCase('ro-RO') : roTiszta

  // Ha az egyik nyelv hiányzik, a MÁSIK áll egyedül — sablon nélkül.
  if (!roResz) return huResz
  if (!huResz) return roResz

  return elol === 'ro' ? `${roResz}${elvalaszto}${huResz}` : `${huResz}${elvalaszto}${roResz}`
}
