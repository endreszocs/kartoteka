/**
 * CHANGELOG-bejegyzések ÁLLAPOT-LOGIKÁJA — 2026-08-12.
 *
 * TISZTA függvények (csak `import type`), hogy a `scripts/selftest-changelog.mjs`
 * be tudja tölteni őket. Egyetlen helyen dől el, hogy egy bejegyzés
 * „kiküldésre vár"-e — a felület, a hírlevél-szerkesztő és az admin ÁTTEKINTÉS
 * csempéje MIND innen kérdezi, így nem tudnak széthúzni.
 */

import type { ChangelogEntry } from './types'

/**
 * ELINTÉZETT-e a bejegyzés? KÉT, egymástól MEGKÜLÖNBÖZTETETT módon lehet az:
 *   (a) tényleg ki lett küldve (`alreadySent` — van `system_broadcasts` sor),
 *   (b) a rendszergazda KÉZZEL kiküldöttnek jelölte.
 *
 * ⚠️ A kettőt a FELÜLETEN sosem szabad összemosni (más ikon, más szöveg) — de a
 * „mi vár még kiküldésre" kérdésre mindkettő ugyanazt feleli: semmi.
 */
export function elintezett(entry: ChangelogEntry): boolean {
  return entry.alreadySent || !!entry.jeloles?.kikuldottnekJelolveAt
}

/**
 * Kiküldésre vár-e? A `readMarked` (a küszöb előtti, archivált bejegyzések)
 * NEM várnak kiküldésre — azokat a rendszer eleve nem kínálja fel.
 */
export function varKikuldesre(entry: ChangelogEntry): boolean {
  if (entry.readMarked) return false
  return !elintezett(entry)
}

/** A betűvel toldott dátumú fejléceket felismerő elemző-javítás napja. */
export const ELEMZO_JAVITAS_DATUMA = '2026-08-12'

/**
 * AZ ELEMZŐ-JAVÍTÁS HOZTA-E FELSZÍNRE A BEJEGYZÉST? — 2026-08-12.
 *
 * ⚠️ MIÉRT KELL EZ, ÉS MIÉRT PONT ÍGY.
 * A régi elemző csak a sima `[ÉÉÉÉ-HH-NN]` fejlécet ismerte fel, a betűvel
 * toldottat (`[2026-05-06c]`) nem — azok NÉMÁN beleolvadtak az előttük álló
 * bejegyzés törzsébe. Külön bejegyzésként nem is léteztek, tehát SOHA nem
 * kaphattak saját `system_broadcasts` sort.
 *
 * A javítás után egy csapásra 111 ilyen bejegyzés kerül elő, ebből 63 a
 * `NEWSLETTER_READ_CUTOFF` FÖLÖTT — vagyis mind a 63 azonnal „kiküldésre vár"
 * lenne. A kiküldésre várók száma 222-ről 285-re ugrana, az admin ÁTTEKINTÉS
 * csempéje pedig azt írná ki: „285 fejlesztésről még nem kaptak értesítést a
 * gyülekezetek". A bejelentett panasz („azokat is mutatja, hogy nem volt
 * kiküldve, amik már voltak") így nem csökkenne, hanem 63 tétellel NŐNE — és a
 * „Még nem küldöttek kijelölése" + „Kijelöltek küldése" páros EGY kattintással
 * 285 VALÓDI kiküldést kínálna fel ~495 gyülekezetnek, visszavonhatatlanul.
 *
 * A feltétel PONTOS, nem közelítés:
 *   · `dateLabel !== date`  = van betű-toldalék, tehát a RÉGI elemző a fejlécet
 *                             nem látta → külön bejegyzésként nem létezett;
 *   · `date < ELEMZO_JAVITAS_DATUMA` = a javítás ELŐTTI kiadás. A javítás utáni,
 *                             újonnan írt toldalékos bejegyzések teljes értékű,
 *                             kiküldhető bejegyzések maradnak.
 *
 * MIÉRT ARCHIVÁLUNK, ÉS MIÉRT NEM JELÖLJÜK „KIKÜLDÖTTNEK". Mert nem tudjuk, és
 * nem is állíthatjuk, hogy kimentek. A „kézzel kiküldöttnek jelölve" TÉNY-
 * állítás lenne a rendszer állapotáról — pont az a fajta valótlanság, ami ellen
 * ez az egész kör szól. Az archiválás semmit nem állít: a bejegyzés a
 * „Archivált korábbi bejegyzések" csoportban végig megnézhető, és ha Endre
 * mégis ki akarja küldeni, ott van előtte.
 */
export function elemzoJavitasHoztaFelszinre(entry: ChangelogEntry): boolean {
  return entry.dateLabel !== entry.date && entry.date < ELEMZO_JAVITAS_DATUMA
}

/** Csillagozott-e. */
export function kiemelt(entry: ChangelogEntry): boolean {
  return entry.jeloles?.kiemelt === true
}

/**
 * A felületi sorrend: KIEMELT elöl, azon belül a legfrissebb felül.
 *
 * A `dateLabel` szerint rendezünk (nem a `date` szerint), mert az azonos napra
 * eső, betűvel toldott bejegyzéseket (`2026-05-06`, `-b`, `-c`) csak ez
 * választja el egymástól. A rendezés STABIL: a bemeneti tömböt nem módosítja.
 */
export function rendez(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => {
    const ka = kiemelt(a) ? 1 : 0
    const kb = kiemelt(b) ? 1 : 0
    if (ka !== kb) return kb - ka
    return b.dateLabel.localeCompare(a.dateLabel)
  })
}

/**
 * Egy e-mailbe/értesítésbe még belefér-e a bejegyzés törzse?
 *
 * ⚠️ MIÉRT VAN EZ. A régi elemző a betűvel toldott dátumú fejléceket nem
 * ismerte fel, ezért a `[2026-05-04]` bejegyzés törzse 141 794 karakteresre
 * hízott (58 kiadást nyelt el). Egy „Kiküldés" kattintás ekkora értesítést és
 * e-mailt küldött volna ~495 gyülekezetnek. Az elemző javítva van, de az őr
 * MARAD: a következő ilyen hízás ne csendben menjen ki.
 */
export const TORZS_FIGYELMEZTETES_KARAKTER = 20_000

export function torzsTulNagy(entry: ChangelogEntry): boolean {
  return entry.bodyMarkdown.length > TORZS_FIGYELMEZTETES_KARAKTER
}

/** Emberi méret-felirat a figyelmeztetéshez. */
export function torzsMeretFelirat(entry: ChangelogEntry): string {
  const kb = Math.round(entry.bodyMarkdown.length / 1024)
  return `${kb} kB`
}
