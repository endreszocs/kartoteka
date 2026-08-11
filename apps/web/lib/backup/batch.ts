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
  /** `true`, ha a futás MINDEN hatókörhöz hozzáért (nem maradt halasztott). */
  futottVegig: boolean
}

/**
 * Kell-e még egy szelet?
 *
 * ⚠️ HALADÁS-FELTÉTEL: csak akkor kérünk újabb szeletet, ha az előző TÉNYLEGESEN
 *    haladt (dolgozott vagy kihagyott legalább egyet). Enélkül egy tartósan
 *    bukó hatókör végtelen ciklusba vinné a cront — és a végtelen ciklus
 *    rosszabb, mint a bevallott féleredmény.
 */
export function kellMegSzelet(allapot: SzeletAllapot): boolean {
  if (allapot.futottVegig) return false
  if (allapot.hatralevo <= 0) return false
  return allapot.feldolgozva + allapot.kihagyva > 0
}
