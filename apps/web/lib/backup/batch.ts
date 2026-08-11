/**
 * KÖTEGELÉS ÉS FOLYTATÁS — a 784 hatókör egyetlen kérésben NEM fér el (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A BAJ, AMIT EZ A MODUL MEGOLD
 * ════════════════════════════════════════════════════════════════════════════
 * A napi futás 783 aktív gyülekezet + 1 globális hatókört érint. Hatókörönként
 * ~90 tábla megszámolása ÉS kiolvasása (két-két RPC-hívás), plusz a feltöltés
 * és a visszaolvasás — nagyságrendileg 150 000 adatbázis-körfordulás. Ez ÓRÁK,
 * nem percek. Az egyetlen HTTP-kérés viszont legfeljebb 15 percig él.
 *
 * A régi kód ezt egyetlen `for` ciklussal próbálta: se időkeret, se darab-korlát,
 * se folytatási pont. A várható kimenet az lett volna, hogy a futás félúton
 * elvágódik — és mivel a hívó SEMMIT nem tud a részeredményről, a felület
 * „sikertelen"-t írna 300 KÉSZ mentés mellett is.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A MEGOLDÁS: SZELETELÉS + A NAPI KULCS, MINT FOLYTATÁSI PONT
 * ════════════════════════════════════════════════════════════════════════════
 * Nem kell külön „folytatási token". A `backup_log` napi egyedi indexe már ma is
 * megmondja, MELYIK hatókörről van MA igazolt mentés. Egy futás tehát:
 *
 *   1) betölti a MAI, IGAZOLT hatókörök kulcsait EGYETLEN lekérdezéssel,
 *   2) ezeket kihagyja (nulla munka, nulla napló-írás),
 *   3) a maradékból annyit dolgoz fel, amennyi az időkeretbe és a darab-korlátba
 *      belefér,
 *   4) a többit HALASZTOTTKÉNT jelenti — nem hibaként.
 *
 * A következő indítás (a cron következő szelete, vagy a felületen a „Folytatás")
 * pontosan ott veszi fel a fonalat, ahol az előző abbahagyta. Az elkészült
 * mentések SOHA nem vesznek el: mindegyik a saját napló-sorát kapta és le is
 * záródott, MIELŐTT a következő elindult volna.
 *
 * ⚠️ A KIHAGYÁS NEM SZÁMÍT MUNKÁNAK. Ha a darab-korlát a kihagyottakra is
 *    vonatkozna, egy folytatás a keretét a már kész hatókörök újra-átlépésére
 *    költené, és SOHA nem jutna előre. Ez a modul legfontosabb szabálya.
 *
 * ⚠️ MINDEN FUTÁS LÉP LEGALÁBB EGYET. Ha az időkeret már az első hatókör előtt
 *    szűkös, akkor is megpróbálunk egyet — különben egy rosszul beállított keret
 *    örökös tétlenséget okozna, ami pontosan úgy néz ki, mint egy működő rendszer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NULLA FUTÁSIDEJŰ PROJEKT-IMPORT — a `scripts/selftest-backup.mjs` önmagában
 * betölti és teszteli.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Korlátok
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A napi (cron) szelet időkerete. 10 perc — bőven a 15 perces HTTP-korlát alatt,
 * hogy a rendezett megállásra és a válasz összeállítására is maradjon idő.
 */
export const ALAP_IDOKERET_MS = 600_000

/**
 * A felületi „Mentés most" szeletének időkerete. 4 perc: a böngésző nem vár
 * negyed órát egy szerver-akcióra, és a haladás így 4 percenként LÁTHATÓAN
 * előre megy, ahelyett hogy a felhasználó egy pörgő ikont nézne.
 */
export const KEZI_IDOKERET_MS = 240_000

/** Felső korlát: efölé egyetlen szelet sem mehet (a 15 perces HTTP-korlát miatt). */
export const MAX_IDOKERET_MS = 840_000

/** Alsó korlát: ennél rövidebb keret értelmetlen (egy hatókör sem férne bele). */
export const MIN_IDOKERET_MS = 10_000

export interface FutasKorlatok {
  /** Ennyi ideig dolgozhat a hatókör-ciklus. */
  maxFutasiIdoMs: number
  /** Ennyi hatókört dolgozhat fel ténylegesen. `0` = nincs darab-korlát. */
  maxHatokor: number
}

/**
 * Korlátok beolvasása tetszőleges (környezeti változóból vagy kérés-törzsből
 * jövő) nyers értékből. FAIL-SAFE: érvénytelen bemenetnél az alapértelmezés
 * érvényesül, nem dobunk — egy elgépelt env-változó nem állíthatja meg a mentést.
 */
export function korlatokBeolvasasa(args: {
  nyersIdo?: unknown
  nyersDarab?: unknown
  alapIdoMs?: number
}): FutasKorlatok {
  const alap = args.alapIdoMs ?? ALAP_IDOKERET_MS

  let ido = Number(args.nyersIdo)
  if (!Number.isFinite(ido) || ido <= 0) ido = alap
  ido = Math.min(Math.max(Math.floor(ido), MIN_IDOKERET_MS), MAX_IDOKERET_MS)

  let darab = Number(args.nyersDarab)
  if (!Number.isFinite(darab) || darab < 0) darab = 0
  darab = Math.floor(darab)

  return { maxFutasiIdoMs: ido, maxHatokor: darab }
}

// ─────────────────────────────────────────────────────────────────────────────
// BÉRLET — hogy két futás ne mentse le UGYANAZT (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MEDDIG ÉL EGY FOGLALÁS a `backup_log` során.
 *
 * Egy hatókör mentése ~15-30 másodperc (≈90 tábla × 2 RPC + titkosítás +
 * feltöltés + VISSZAOLVASÁS). A 15 perc nagyságrendekkel több ennél: a bérlet
 * CSAK azt a sort veszi vissza, amelyik mögül a futó folyamat eltűnt (telepítés,
 * újraindulás, összeomlás).
 *
 * ⚠️ RÖVIDEBB nem lehet: a MÉG DOLGOZÓ futás alól venné el a sort — vagyis
 *    pontosan azt a kettős mentést okozná, ami ellen íródott.
 * ⚠️ HOSSZABB sem érdemes: egy összeomlás után ennyi ideig a hatókör
 *    „foglaltnak" látszik, és a folytatás nem tudja újrapróbálni.
 */
export const BERLET_MS = 15 * 60_000

/**
 * A bérlet-határ időbélyege, PostgREST-BARÁT alakban.
 *
 * ⚠️ MIÉRT KELL A MÁSODPERCTÖRTET LEVÁGNI. Ez az érték egy `or=(…)` szűrőbe
 *    kerül, ahol a PostgREST az `oszlop.operátor.érték` hármast a PONTOKON
 *    hasítja. Egy `2026-08-11T15:32:00.000Z` alakú érték tizedespontja elrontaná
 *    az elemzést — és egy elrontott szűrő itt NÉMÁN TÁGÍTANA: a feltételes
 *    frissítés minden sorra illeszkedne, a bérlet nem védene semmit, és két
 *    futás ugyanazt a gyülekezetet mentené le kétszer. A vessző ugyanígy tilos
 *    (az a feltételeket választja el); ISO-időbélyegben egyik sem fordul elő,
 *    de ezt a függvényt önteszt őrzi.
 */
export function berletHatarIso(most: number = Date.now()): string {
  return new Date(most - BERLET_MS).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ─────────────────────────────────────────────────────────────────────────────
// Hatókör-kulcs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Egy hatókör azonosítója a napi kulcsban.
 *
 * A `globalis` hatókörnek nincs gyülekezete — a `null`-t EXPLICIT szóval
 * jelöljük, nem üres sztringgel: egy üres sztring egy törölt/hiányzó azonosítóval
 * összekeveredne, és a globális mentés némán „késznek" látszana.
 */
export function scopeKulcs(scope: string, congregationId: string | null | undefined): string {
  return `${scope}:${congregationId ?? 'GLOBALIS'}`
}

// ─────────────────────────────────────────────────────────────────────────────
// A szelet megtervezése
// ─────────────────────────────────────────────────────────────────────────────

export interface FutasTerv<T> {
  /** MA MÁR IGAZOLT hatókörök — nulla munka, nulla napló-írás. */
  kihagyando: T[]
  /** Ebben a szeletben ténylegesen megpróbálandó hatökörök. */
  futtatando: T[]
  /** Kimaradt a darab-korlát miatt — NEM hiba, a következő futás elviszi. */
  halasztott: T[]
}

/**
 * Szétosztja a hatóköröket kihagyandó / futtatandó / halasztott csoportra.
 *
 * A sorrend MEGMARAD (a hívó adja meg, ő is felel érte) — így egy folytatás
 * determinisztikusan halad előre, és nem ugrál össze-vissza a listán.
 */
export function tervezFutas<T>(args: {
  hatokorok: readonly T[]
  kulcs: (h: T) => string
  /** A MA MÁR IGAZOLT hatókörök kulcsai. */
  keszKulcsok: Iterable<string>
  /** `0` = nincs darab-korlát. */
  maxHatokor: number
}): FutasTerv<T> {
  const kesz = args.keszKulcsok instanceof Set ? args.keszKulcsok : new Set(args.keszKulcsok)
  const out: FutasTerv<T> = { kihagyando: [], futtatando: [], halasztott: [] }
  const korlat = args.maxHatokor > 0 ? args.maxHatokor : Number.POSITIVE_INFINITY

  for (const h of args.hatokorok) {
    if (kesz.has(args.kulcs(h))) {
      // ⚠️ A kihagyás NEM fogyasztja a darab-korlátot — különben egy folytatás
      //    a keretét a már kész hatókörökre költené, és sosem jutna előre.
      out.kihagyando.push(h)
      continue
    }
    if (out.futtatando.length < korlat) out.futtatando.push(h)
    else out.halasztott.push(h)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Az időkeret
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Belefér-e még EGY újabb hatókör az időkeretbe?
 *
 * Nem az eltelt időt nézzük önmagában, hanem azt, hogy a következő hatókör
 * VÁRHATÓ ideje (az eddigi átlag) még belefér-e. Enélkül a keret legvégén
 * elindítanánk egy 40 másodperces gyülekezetet, ami átlógna a HTTP-korláton —
 * és egy átlógó futás nem rendezetten áll meg, hanem elvágódik: a napló-sor
 * „fut" állapotban ragadna.
 *
 * @param feldolgozott Hány hatókört fejeztünk be MÁR ebben a futásban.
 *                     Ha nulla, MINDIG megpróbálunk egyet (haladás-garancia).
 */
export function ferBeleUjabbHatokor(args: {
  elteltMs: number
  maxFutasiIdoMs: number
  /** Az eddigi hatókörök átlagos ideje. `null` = még nincs mérésünk. */
  atlagosHatokorMs: number | null
  feldolgozott: number
}): boolean {
  // Nincs korlát.
  if (args.maxFutasiIdoMs <= 0) return true

  // ⚠️ HALADÁS-GARANCIA: minden futás megpróbál LEGALÁBB egy hatökört. Egy
  //    rosszul beállított (túl rövid) keret különben örökös tétlenséget okozna,
  //    ami kívülről pontosan úgy néz ki, mint egy működő rendszer.
  if (args.feldolgozott === 0) return true

  if (args.elteltMs >= args.maxFutasiIdoMs) return false
  if (args.atlagosHatokorMs === null) return true
  return args.elteltMs + args.atlagosHatokorMs <= args.maxFutasiIdoMs
}

/**
 * Egy szelet összefoglalója gépi alakban — ebből épül a felület haladás-jelzője
 * és a cron döntése arról, kell-e még egy szelet.
 */
export interface SzeletAllapot {
  osszes: number
  feldolgozva: number
  sikeres: number
  sikertelen: number
  kihagyva: number
  hatralevo: number
  /** Ennyi hatókört egy MÁSIK, éppen futó mentés tartott a kezében. */
  foglalt?: number
  /** `true`, ha a futás MINDEN hatókörhöz hozzáért (nem maradt halasztott). */
  futottVegig: boolean
}

/**
 * Kell-e még egy szelet?
 *
 * ⚠️ HALADÁS-FELTÉTEL: csak akkor kérünk újabb szeletet, ha az előző TÉNYLEGESEN
 *    ELŐRE IS VITTE a mentést. Enélkül egy tartósan bukó hatókör végtelen
 *    ciklusba vinné a futást — és a végtelen ciklus rosszabb, mint a bevallott
 *    féleredmény.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11 JAVÍTÁS (2. menet) — A `sikeres` A MÉRVADÓ, NEM A `feldolgozva`
 * ════════════════════════════════════════════════════════════════════════════
 * Először `feldolgozva + kihagyva > 0` állt itt. Az első javítás a `kihagyva`-t
 * vette ki (egy FOLYTATÁSNÁL az mindig nagy, tehát „haladást" mutatott akkor is,
 * ha egyetlen hatókörhöz sem nyúltunk hozzá). A `feldolgozva` viszont MÉG MINDIG
 * nem a haladást méri, hanem a PRÓBÁLKOZÁST:
 *
 *   · a `feldolgozva` a BUKOTT hatókört is számolja (`worker.ts`: a számláló a
 *     `try` ELŐTT nő, a `catch` csak a `sikertelen`-t emeli),
 *   · a FOLYTATÁSI PONT viszont KIZÁRÓLAG a sikerből épül: a `keszKulcsok`
 *     halmazba csak `status='ok' AND drive_verified_at IS NOT NULL` sor kerül.
 *
 * Vagyis ha egy szeletben MINDEN megpróbált hatókör elbukik (lejárt Drive-token,
 * tele Drive, halott adatbázis — pont az a rendszerszintű baj, amitől MINDEN
 * mentés bukik), akkor a `keszKulcsok` ÜRESEN marad, a következő szelet
 * UGYANAZT a listát UGYANONNAN kezdi — miközben a `feldolgozva > 0` „haladást"
 * jelentett. 60 szeleten át ez ~12 000 fölösleges hatókör-export (hatókörönként
 * ~90 tábla dump + titkosítás + bukott feltöltés) az ÉLES web-folyamatban, a
 * haladás-sáv pedig végig 0 / 784.
 *
 * A `sikeres > 0` PONTOSAN azt méri, ami a következő szelet listáját szűkíti.
 * A „bukott hatókör nem állítja meg a futást" szerződés sértetlen: ott egy-két
 * bukás mellett sok a siker, tehát `sikeres > 0` → megyünk tovább.
 *
 * A „minden kész" eset szintén 0 sikerrel zárul, de azt a `futottVegig` és a
 * `hatralevo <= 0` ág már fentebb elkapja: ott a válasz „nem kell több szelet",
 * nem pedig „elakadtunk".
 */
export function kellMegSzelet(allapot: SzeletAllapot): boolean {
  if (allapot.futottVegig) return false
  if (allapot.hatralevo <= 0) return false
  return allapot.sikeres > 0
}
