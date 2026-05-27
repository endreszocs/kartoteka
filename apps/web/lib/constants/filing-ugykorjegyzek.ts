/**
 * EREK 2024-es egyházközségi ügykörjegyzék — szálas iratok
 *
 * Forrás: Igazgatótanács 66/2023. számú határozata, 2024. január 1-től érvényes.
 * Részletes magyarázat a 14. Egyházi Adminisztrációs útmutatóban.
 *
 * 18 fő ügykör + alegységek (~30 választható kategória). Minden ügykörhöz
 * tartozik egy megőrzési típus:
 *   - F.Á. (folyamatosan állandó) — a dossziét akkor zárjuk le, amikor megtelik
 *   - É.Á. (évente állandó) — minden év végén lezárjuk az iratmennyiségtől függetlenül
 */

export type RetentionType = 'F.Á.' | 'É.Á.'

export interface UgykorEntry {
  /** Az ügykörjegyzék pontszáma (pl. "1.", "6/1.", "13/2."). Ez kerül az `iktato.ugykor_kod` mezőbe. */
  kod: string
  /** A kategória magyar megnevezése. */
  nev: string
  /** Megőrzési típus. */
  retention: RetentionType
  /** Opcionális magyarázat — UI hover-szöveghez vagy súgóhoz. */
  desc?: string
  /** Az alegységek (pl. "6.1", "6.2", ...) szülő-kódja. Csak akkor van, ha ez egy ALEGYSÉG. */
  parentKod?: string
}

/**
 * A szálas iratok teljes ügykörjegyzéke. A `parentKod` szerinti csoportosítás
 * segíti a UI-szelektor hierarchikus megjelenítését.
 */
export const FILING_UGYKOROK: UgykorEntry[] = [
  // ─── 1. Levelezés ───
  {
    kod: '1.',
    nev: 'Levelezés',
    retention: 'É.Á.',
    desc: 'Egyházkerületi, egyházmegyei, egyházközségi, világi hatóságokkal, intézményekkel, szervezetekkel, magánszemélyekkel folytatott levelezés. Itt őrizzük a presbiteri meghívókat is.',
  },

  // ─── 2. Anya- és családkönyvi levelezés ───
  {
    kod: '2.',
    nev: 'Anya- és családkönyvi levelezés és adatvédelmi nyilatkozatok',
    retention: 'F.Á.',
    desc: 'Halotti igazolások (Adeverinta), át- és kitértek nyilatkozatai, keresztelési és konfirmációi igazolások, ki- és beköltözöttek jelentése.',
  },

  // ─── 3. Jelentések ───
  {
    kod: '3.',
    nev: 'Jelentések',
    retention: 'F.Á.',
    desc: 'Évi lelkészi, belmissziói, ifjúsági, lélekszám- és egyéb felsőbb hatósághoz küldött jelentések aláírt másodpéldánya.',
  },

  // ─── 4. Választói névjegyzékek ───
  {
    kod: '4.',
    nev: 'Választói névjegyzékek',
    retention: 'F.Á.',
    desc: 'A Kánon 2006. évi 1. jogszabály 37. paragrafusa szerint. Az Esperesi Hivataltól visszaérkezett hitelesített példányt és fellebbezéseket.',
  },

  // ─── 5. Egyházi alkalmazottak személyi iratgyűjtője ───
  {
    kod: '5.',
    nev: 'Egyházi alkalmazottak személyi iratgyűjtője',
    retention: 'F.Á.',
    desc: 'Lelkipásztor törzskönyvi lap (3 példányban), diplomák, munkaszerződés, munkaköri leírás, megválasztási határozat, besorolás, GDPR nyilatkozatok, orvosi iratok.',
  },

  // ─── 6. Leltári ügyek (6/1–6/7) ───
  {
    kod: '6.',
    nev: 'Leltári ügyek (általános)',
    retention: 'F.Á.',
    desc: 'Általános leltári hivatalos iratok. Az alegységek külön dossziékba.',
  },
  {
    kod: '6/1.',
    nev: 'Vagyonleltári jelentések, leltárívek, selejtezési jegyzőkönyvek',
    retention: 'É.Á.',
    parentKod: '6.',
    desc: 'Év végi és alkalmi leltározások, selejtezési jegyzőkönyvek. Minden év végén lezárjuk.',
  },
  {
    kod: '6/2.',
    nev: 'Birtokívek, telekkönyvi kivonatok, cod fiscal, gépkocsik törzskönyve',
    retention: 'F.Á.',
    parentKod: '6.',
    desc: 'Eredeti okmányok — páncélszekrényben vagy zárható szekrényben tartandók.',
  },
  {
    kod: '6/3.',
    nev: 'Alapeszközök nyilvántartó lapjai',
    retention: 'F.Á.',
    parentKod: '6.',
    desc: '2500 RON érték fölötti vagy 1 évnél hosszabb használatú vagyontárgyak. Leltár programból nyomtatható.',
  },
  {
    kod: '6/4.',
    nev: 'Ingatlanadók, felértékelések, kockázatfelmérések, biztosítások',
    retention: 'F.Á.',
    parentKod: '6.',
  },
  {
    kod: '6/5.',
    nev: 'Részvények és banki kötvények',
    retention: 'F.Á.',
    parentKod: '6.',
  },
  {
    kod: '6/6.',
    nev: 'Pecsétnyomók nyilvántartása',
    retention: 'F.Á.',
    parentKod: '6.',
    desc: 'Bélyegzők lenyomattal. Megrongálódott bélyegzőt nem semmisítünk meg, a levéltárban őrizzük.',
  },
  {
    kod: '6/7.',
    nev: 'Anyagraktári ügyek',
    retention: 'F.Á.',
    parentKod: '6.',
    desc: 'Nyugtatömbök, építkezési anyagok, nyomtatványok raktárkönyve.',
  },

  // ─── 7. Műemlékek, műkincsek ───
  {
    kod: '7.',
    nev: 'Műemlékek, műkincsek, történeti értékű tárgyak',
    retention: 'F.Á.',
    desc: 'Klenódiumok, textíliák, 1900 előtti levéltári iratok, 1850 előtti könyvek és kéziratok, templomi bútorzat, zászlók, festmények.',
  },

  // ─── 8. Költségvetések, számadások ───
  {
    kod: '8.',
    nev: 'Költségvetések, költségvetés-módosítások, számadások',
    retention: 'F.Á.',
    desc: 'Az év utolsó előtti hónapjában a következő évi költségvetés, év letelte után zárszámadás. 2-2 példányban felterjesztjük az Egyházmegyéhez.',
  },

  // ─── 9. Pénzügyi igazoló iratok (9/1, 9/2) ───
  {
    kod: '9.',
    nev: 'Pénzügyi igazoló iratok (általános)',
    retention: 'É.Á.',
    desc: '15 évig megőrzendők. Pályázati elszámolásnál az eredeti a 14-es iratgyűjtőben, ide hitelesített másolatok.',
  },
  {
    kod: '9/1.',
    nev: 'Pénztári igazoló iratok (készpénz)',
    retention: 'É.Á.',
    parentKod: '9.',
    desc: 'Kifizetési bizonylat (nyugta), számla, pénztárnapló ("kasszakönyv"), kifizetést kísérő irat.',
  },
  {
    kod: '9/2.',
    nev: 'Banki igazoló iratok',
    retention: 'É.Á.',
    parentKod: '9.',
    desc: 'Átutalási szelvény, számla, számlakivonat, banknapló, megrendelőlap.',
  },

  // ─── 10. Csoportnapló ───
  {
    kod: '10.',
    nev: 'Csoportnapló',
    retention: 'É.Á.',
    desc: 'Az elektronikus könyvelésből bevételi és kiadási tételek szerint nyomtatható.',
  },

  // ─── 11. Fizetési jegyzékek ───
  {
    kod: '11.',
    nev: 'Fizetési jegyzékek',
    retention: 'F.Á.',
    desc: 'Az ellátott fizetési jegyzékek (státok).',
  },

  // ─── 12. Munkavédelem, tűzvédelem ───
  {
    kod: '12.',
    nev: 'Munkavédelem, tűzvédelem',
    retention: 'F.Á.',
    desc: 'Alkalmazottak munka- és tűzvédelmi felkészítését igazoló füzetek.',
  },

  // ─── 13. Szerződések (13/1, 13/2, 13/3) ───
  {
    kod: '13.',
    nev: 'Szerződések (általános)',
    retention: 'F.Á.',
  },
  {
    kod: '13/1.',
    nev: 'Bérleti szerződések',
    retention: 'F.Á.',
    parentKod: '13.',
  },
  {
    kod: '13/2.',
    nev: 'Közüzemi szerződések (energia, telekom, víz, csatorna)',
    retention: 'F.Á.',
    parentKod: '13.',
  },
  {
    kod: '13/3.',
    nev: 'Szolgáltatási és támogatási szerződések',
    retention: 'F.Á.',
    parentKod: '13.',
  },

  // ─── 14. Pályázatok ───
  {
    kod: '14.',
    nev: 'Pályázatok',
    retention: 'F.Á.',
    desc: 'Pályázatonként külön iratgyűjtő (14/1, 14/2, ...). Pályázati felhívás, beadott pályázat, mellékletek, szerződések, elszámolások eredeti iratai.',
  },

  // ─── 15. Ellenőrzési jegyzőkönyvek ───
  {
    kod: '15.',
    nev: 'Ellenőrzési jegyzőkönyvek',
    retention: 'F.Á.',
    desc: 'Belső, gazdasági bizottsági, egyházi felsőbb hatósági és világi hatósági ellenőrzések jegyzőkönyvei iktatószám szerinti sorrendben.',
  },

  // ─── 16. Egyházközségi egyesületek és alapítványok ───
  {
    kod: '16.',
    nev: 'Egyházközségi egyesületek és alapítványok',
    retention: 'F.Á.',
    desc: 'Statútum, hivatalos adatok, bírósági kivonatok.',
  },

  // ─── 17. Temetőügyek ───
  {
    kod: '17.',
    nev: 'Temetőügyek',
    retention: 'F.Á.',
    desc: 'Temetői szabályzatok, nyilvántartások, a temetővel kapcsolatos iratok.',
  },

  // ─── 18. Gyülekezeti kiadványok ───
  {
    kod: '18.',
    nev: 'Gyülekezeti kiadványok, aprónyomtatványok, rendezvények dokumentumai',
    retention: 'F.Á.',
    desc: 'Gyülekezeti újság/hírlevél, rendezvény-meghívók, plakátok, műsorlapok, gyászjelentők, emléklapok, ismeretterjesztő füzetek.',
  },
]

/**
 * Map kód → entry a gyors keresés érdekében.
 */
export const FILING_UGYKOROK_MAP: Record<string, UgykorEntry> = FILING_UGYKOROK.reduce(
  (acc, entry) => {
    acc[entry.kod] = entry
    return acc
  },
  {} as Record<string, UgykorEntry>,
)

/**
 * Az ügykörkód alapján visszaadja a megfelelő megőrzési típust.
 * Ha a kód nem található vagy hibás, fallback `F.Á.`.
 */
export function getRetentionForUgykor(kod: string | null | undefined): RetentionType {
  if (!kod) return 'F.Á.'
  return FILING_UGYKOROK_MAP[kod]?.retention ?? 'F.Á.'
}

/**
 * UI helper — a kód formázott megjelenítéséhez.
 * Pl. "6/1." → "6/1 — Vagyonleltári jelentések…"
 */
export function formatUgykorLabel(kod: string | null | undefined): string {
  if (!kod) return '—'
  const entry = FILING_UGYKOROK_MAP[kod]
  if (!entry) return kod
  return `${entry.kod} ${entry.nev}`
}
