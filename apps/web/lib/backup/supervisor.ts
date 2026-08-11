import 'server-only'

/**
 * A MENTÉS-FUTÁS FELÜGYELŐJE — EGY KATTINTÁS, VÉGIGFUT (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A BAJ, AMIT EZ MEGOLD — MÉRT ESET, NEM ELMÉLET
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos megnyomta a „Mentés most" gombot. 15 hatókör IGAZOLTAN elkészült
 * (feltöltés → visszaolvasás → sorszám-egyeztetés), aztán a böngésző ezt kapta:
 *
 *     „An unexpected response was received from the server."
 *
 * Ez a mondat a Next.js SAJÁT kliens-kódjából jön, és pontosan akkor, ha a
 * böngésző KAPOTT egy választ, de az nem `text/x-component` volt — vagyis nem a
 * szerver-akciónk felelt, hanem valaki más. Az az „valaki más" a Railway
 * edge-proxyja: egy HTTP-kérés 15 percig élhet, DE CSAK ha közben adat mozog;
 * ha nincs adatforgalom, 5 PERC (300 másodperc) után lezárják. Egy Next.js
 * szerver-akció a munka teljes ideje alatt NULLA bájtot küld — tehát ránk
 * mindig a 300 másodperces „néma kérés" korlát vonatkozik. A kódunk viszont
 * végig a 15 perces számra volt kalibrálva.
 *
 * 784 hatókör × ~18 másodperc ≈ 4 óra. Ez SEMMILYEN kérés-időkeretbe nem fér
 * bele. Ezért a helyes válasz nem a szelet rövidítése, hanem az, hogy
 * A MUNKA NE EGY HTTP-KÉRÉSBEN LAKJON.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A MEGOLDÁS: A KÉRÉS CSAK ELINDÍTJA — A FUTÁS A FOLYAMATBAN ÉL
 * ════════════════════════════════════════════════════════════════════════════
 * A „Mentés most" gomb egy MÁSODPERCEN BELÜL visszatérő szerver-akciót hív, ami
 * elindít egy háttér-ciklust ebben a Node-folyamatban, és azonnal válaszol. A
 * ciklus szeletenként hívja a `runBackupWorker`-t, amíg el nem fogy a munka.
 *
 * Ettől a futás FÜGGETLEN a böngészőtől: a tulajdonos bezárhatja a fület,
 * elveszítheti a hálózatot, lezárhatja a telefonját — a mentés megy tovább.
 * A felület nem „vezeti" a futást, csak NÉZI.
 *
 * ⚠️ EZ AZÉRT MŰKÖDIK ITT, MERT SAJÁT NODE-SZERVERÜNK VAN. A `next.config.ts`
 *    `output: 'standalone'`, a `start` parancs `next start` — nem szerver
 *    nélküli platform, ahol a válasz elküldése után a futtatókörnyezet
 *    befagyasztja a folyamatot. Ha ez valaha megváltozik, ez a modul NEM fog
 *    működni, és a mentés némán félbemaradna: ezért van róla önteszt
 *    (`scripts/selftest-backup.mjs`) és ezért mondja ki a felület is, hogy a
 *    futás a szerveren él.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NINCS MÁSODIK ÁLLAPOT-TÁROLÓ — AZ IGAZSÁG A `backup_log` MARAD
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a modul NEM tárolja, mi készült el. A haladás (N / 784) MINDIG a
 * `backup_log` mai sorainak megszámolásából jön (`lib/backup/progress.ts`).
 * Amit itt tartunk, az kizárólag a FUTÁS SAJÁT állapota: fut-e, mióta, hányadik
 * szeletnél, kérték-e a leállítását. Ez nem az igazság forrása — ha a folyamat
 * újraindul, ez elveszik, a `backup_log` viszont megmarad, és a következő
 * indítás pontosan ott folytatja.
 *
 * ⚠️ BEVALLOTT KORLÁT. Egy telepítés (deploy) vagy egy folyamat-újraindulás
 *    megöli a futó ciklust. Ilyenkor SEMMI nem vész el (minden kész hatókörnek
 *    megvan az igazolt napló-sora), de nincs, aki folytassa: a tulajdonosnak
 *    újra kell indítania, vagy megvárnia az éjszakai cront. A felület ezt
 *    KIMONDJA — nem hallgatjuk el.
 *
 * ⚠️ A PÁRHUZAMOSSÁG ELLEN NEM EZ VÉD. Ez a modul csak azt akadályozza meg,
 *    hogy EBBEN a folyamatban két ciklus induljon. A cron egy MÁSIK folyamatból
 *    érkezik — a valódi védelmet a `backup_log` sorára tett BÉRLET adja
 *    (`worker.ts` → `claimBackupLog`).
 */

import { kellMegSzelet } from './batch'
import { bucharestRunDate } from './payload'
import { runBackupWorker } from './worker'
import type { BackupRunStep } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Korlátok
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Egy háttér-szelet időkerete.
 *
 * ⚠️ MIÉRT SZELETELÜNK EGYÁLTALÁN, HA NINCS HTTP-KORLÁT. Két okból:
 *   1) MEMÓRIA. Egy hatókör teljes tartalma a memóriában áll össze; a szelet
 *      vége természetes pont, ahol minden köztes adat elengedhető.
 *   2) FRISS FOLYTATÁSI PONT. Minden szelet ÚJRA beolvassa, mely hatókörök
 *      készültek el MA — így ha közben az éjszakai cron is dolgozott, nem
 *      mentjük le ugyanazt még egyszer.
 * 10 perc: elég hosszú, hogy a szeletenkénti előkészítés (leltár + 783
 * gyülekezet lekérése) elhanyagolható legyen, és elég rövid a fenti kettőhöz.
 */
export const HATTER_SZELET_MS = 600_000

/**
 * Ennyi szeletnél tovább egy indítás nem megy.
 *
 * ⚠️ MIÉRT KELL FELSŐ KORLÁT. Ha egy hatókör TARTÓSAN bukik, a hátralévők száma
 *    nem csökkenne, és a ciklus a végtelenségig pörögne. 60 × 10 perc = 10 óra,
 *    ami 784 hatókörre (≈4 óra) bőven elég, de nem végtelen.
 */
export const HATTER_MAX_SZELET = 60

/**
 * Fali idő szerinti felső korlát. A szelet-számnál is erősebb kapu: ha egy
 * szelet valamiért nagyon lassú, ez akkor is megállítja a futást.
 */
export const HATTER_MAX_FUTAS_MS = 10 * 3_600_000

// ─────────────────────────────────────────────────────────────────────────────
// Állapot
// ─────────────────────────────────────────────────────────────────────────────

/** Miért ért véget a futás. A felület EBBŐL mond igazat a tulajdonosnak. */
export type BefejezesOka =
  /** Minden hatókörhöz hozzáértünk, nincs hátralévő. */
  | 'kesz'
  /** A tulajdonos a „Leállítás" gombot nyomta. */
  | 'leallitva'
  /** A szelet-ciklus nem haladt (minden hátralévőt más futás tart, vagy tartós bukás). */
  | 'nem_halad'
  /** Elfogyott a szelet- vagy idő-korlát, DE maradt hátra. */
  | 'korlat'
  /** Az előkészítő fázis vagy a motor dobott. */
  | 'hiba'

export interface BackupRunAllapot {
  /** Fut-e MOST egy háttér-mentés EBBEN a folyamatban. */
  fut: boolean
  /** Melyik naphoz (Europe/Bucharest) készül a mentés. */
  runDate: string | null
  /** Mikor indult (ISO). */
  indultAt: string | null
  /** Mikor ért véget (ISO). `null`, amíg fut. */
  vegzettAt: string | null
  /** Hányadik szeletnél tartunk (1-től). */
  szelet: number
  /** Ennyi hatókör mentése készült el EBBEN a futásban. */
  sikeres: number
  /** Az UTOLSÓ szelet bukott hatóköreinek száma. */
  sikertelen: number
  /** Ennyi hatókör MÁR IGAZOLT volt, mielőtt ez a futás elindult. */
  korabbanKesz: number
  /** Az utolsó szelet szerint ennyi hatókör van hátra. `null` = még nem tudjuk. */
  hatralevo: number | null
  /** Ennyi hatókört egy MÁSIK futás tart a kezében. */
  foglalt: number
  /** Kérték-e a leállítást (a futó szelet még befejeződik). */
  megallitasKerve: boolean
  /** Miért ért véget. `null`, amíg fut, vagy ha még sosem futott. */
  befejezesOka: BefejezesOka | null
  /** Az utolsó szelet hibaüzenete (titokmentes), ha volt. */
  utolsoHiba: string | null
  /** Az utolsó szelet lépés-listája — „meddig jutott a futás". */
  lepesek: BackupRunStep[] | null
  /** Az utolsó szelet futás-szintű figyelmeztetései. */
  figyelmeztetesek: string[]
  /** A bukott hatókörök NÉVVEL (az utolsó szeletből, legfeljebb 50). */
  bukottak: Array<{ scope: string; nev: string | null; stage: string | null; hiba: string | null }>
}

function uresAllapot(): BackupRunAllapot {
  return {
    fut: false,
    runDate: null,
    indultAt: null,
    vegzettAt: null,
    szelet: 0,
    sikeres: 0,
    sikertelen: 0,
    korabbanKesz: 0,
    hatralevo: null,
    foglalt: 0,
    megallitasKerve: false,
    befejezesOka: null,
    utolsoHiba: null,
    lepesek: null,
    figyelmeztetesek: [],
    bukottak: [],
  }
}

/**
 * ⚠️ MODUL-SZINTŰ ÁLLAPOT — SZÁNDÉKOSAN. Egy Node-folyamat, egy futás. A
 *    fejlesztői gyorsjavítás (HMR) újratölthetné a modult; élesben nem.
 */
let allapot: BackupRunAllapot = uresAllapot()
/** A ténylegesen futó ciklus — ebből tudjuk, hogy NE indítsunk másikat. */
let futoCiklus: Promise<void> | null = null

/** Az aktuális állapot MÁSOLATA (a hívó nem tudja véletlenül átírni). */
export function getBackupRunAllapot(): BackupRunAllapot {
  return { ...allapot, figyelmeztetesek: [...allapot.figyelmeztetesek], bukottak: [...allapot.bukottak] }
}

/**
 * Leállítást kér. A FUTÓ hatókör és a futó szelet BEFEJEZŐDIK — félbehagyott
 * hatókör nem maradhat, mert az „fut" állapotban ragadt napló-sort jelentene.
 */
export function requestBackupRunStop(): boolean {
  if (!allapot.fut) return false
  allapot = { ...allapot, megallitasKerve: true }
  return true
}

/** ⚠️ CSAK TESZTHEZ: visszaállítja a modult alaphelyzetbe. */
export function __resetBackupSupervisorForTests(): void {
  allapot = uresAllapot()
  futoCiklus = null
}

// ─────────────────────────────────────────────────────────────────────────────
// Indítás
// ─────────────────────────────────────────────────────────────────────────────

export interface IndulasEredmeny {
  /** `true` = MI indítottuk el most. `false` = már futott (nem indítottunk másodikat). */
  indult: boolean
  allapot: BackupRunAllapot
}

/**
 * Elindítja a háttér-futást, ha még nem fut. AZONNAL visszatér.
 *
 * ⚠️ SOHA NEM VÁRJA MEG a ciklust — ez a lényege. A hívó szerver-akció
 *    ezredmásodpercek alatt válaszol, tehát semmilyen proxy-időkorlátba nem
 *    ütközhet.
 */
export function startBackupRun(): IndulasEredmeny {
  if (allapot.fut && futoCiklus) {
    // ⚠️ NEM INDÍTUNK MÁSODIKAT. Két párhuzamos ciklus ugyanabban a folyamatban
    //    ugyanazokat a hatóköröket kapná — a bérlet ugyan megfogná, de az
    //    eredmény 784 fölösleges adatbázis-körfordulás és zavaros jelentés.
    return { indult: false, allapot: getBackupRunAllapot() }
  }

  allapot = {
    ...uresAllapot(),
    fut: true,
    runDate: bucharestRunDate(),
    indultAt: new Date().toISOString(),
  }

  // ⚠️ A `catch` NEM ELHAGYHATÓ. Egy elkapatlan elutasítás a háttérben
  //    `unhandledRejection`-t ad, ami a Node alapbeállításával MEGÖLI a
  //    folyamatot — vagyis egy mentési hiba az egész alkalmazást vinné.
  futoCiklus = ciklus().catch((e: unknown) => {
    allapot = {
      ...allapot,
      fut: false,
      vegzettAt: new Date().toISOString(),
      befejezesOka: 'hiba',
      utolsoHiba: e instanceof Error ? e.message : 'ismeretlen hiba',
    }
    console.error('[backup-supervisor] A háttér-ciklus váratlanul elszállt.', e)
  })

  return { indult: true, allapot: getBackupRunAllapot() }
}

// ─────────────────────────────────────────────────────────────────────────────
// A ciklus
// ─────────────────────────────────────────────────────────────────────────────

async function ciklus(): Promise<void> {
  const kezdet = Date.now()
  let befejezesOka: BefejezesOka = 'korlat'

  try {
    for (let szelet = 1; szelet <= HATTER_MAX_SZELET; szelet++) {
      if (allapot.megallitasKerve) {
        befejezesOka = 'leallitva'
        break
      }
      if (Date.now() - kezdet > HATTER_MAX_FUTAS_MS) {
        befejezesOka = 'korlat'
        break
      }

      allapot = { ...allapot, szelet }

      let eredmeny: Awaited<ReturnType<typeof runBackupWorker>>
      try {
        eredmeny = await runBackupWorker({
          kind: 'napi',
          // ⚠️ A NAPOT A FUTÁS INDULÁSAKOR RÖGZÍTETTÜK, ÉS MINDEN SZELET EZT
          //    KAPJA (2026-08-11). Enélkül minden szelet FRISSEN hívta a
          //    `bucharestRunDate()`-et: egy 22 órakor indított futás alatt
          //    bukaresti éjfélkor átcsúszott volna a KÖVETKEZŐ napra. Az addig
          //    elkészült 784 mentés egy csapásra „nem mainak" minősült volna, a
          //    haladás-sáv 100%-ról 0%-ra esik, és a futás elölről kezdi az
          //    egészet — miközben a tulajdonos azt látja, hogy a kész mentése
          //    elveszett. A `runDate` mindig az, amire a futás INDULT.
          runDate: allapot.runDate ?? undefined,
          maxFutasiIdoMs: HATTER_SZELET_MS,
          // ⚠️ A LEÁLLÍTÁS ENÉLKÜL 10 PERCET KÉSNE. A szelet-határok között
          //    hiába néznénk a jelzést: a tulajdonos megnyomná a gombot, és
          //    negyed óráig nem történne semmi látható. Így a futó gyülekezet
          //    befejezése után (~18 másodperc) megállunk.
          megallj: () => allapot.megallitasKerve,
        })
      } catch (e: unknown) {
        // Az ELŐKÉSZÍTŐ fázis bukása (nincs kulcs, besorolatlan tábla, halott
        // tároló). Ez nem egy gyülekezet gondja — a következő szelet ugyanide
        // futna, ezért megállunk, és KIMONDJUK, mi történt.
        const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
        const lepesek =
          e && typeof e === 'object' && 'lepesek' in e
            ? ((e as { lepesek: BackupRunStep[] }).lepesek ?? null)
            : null
        allapot = { ...allapot, utolsoHiba: uzenet, lepesek }
        befejezesOka = 'hiba'
        break
      }

      // Az ELSŐ szelet `kihagyva` mezője azt mondja meg, mennyi volt MÁR kész,
      // mielőtt elindultunk. ⚠️ NEM ADJUK ÖSSZE a szeletek között: minden szelet
      // a MAI NAP EGÉSZÉT látja, tehát a 2. szelettől kezdve a saját korábbi
      // sikereink is benne vannak — összeadva a haladás 100% fölé szaladna.
      const korabbanKesz = szelet === 1 ? eredmeny.kihagyva : allapot.korabbanKesz

      allapot = {
        ...allapot,
        korabbanKesz,
        // ⚠️ A `sikeres` VISZONT összeadódik: ezek a MI mostani mentéseink,
        //    szeletenként külön halmaz.
        sikeres: allapot.sikeres + eredmeny.sikeres,
        sikertelen: eredmeny.sikertelen,
        hatralevo: eredmeny.hatralevo,
        foglalt: eredmeny.foglalt,
        lepesek: eredmeny.lepesek,
        figyelmeztetesek: eredmeny.figyelmeztetesek,
        bukottak: eredmeny.hatokorok
          .filter((h) => h.ok !== true && h.kihagyva !== true)
          .slice(0, 50)
          .map((h) => ({
            scope: h.scope,
            nev: h.congregationNev,
            stage: h.stage,
            hiba: h.hiba,
          })),
      }

      console.log('[backup-supervisor] Szelet kész.', {
        szelet,
        runDate: eredmeny.runDate,
        sikeres: eredmeny.sikeres,
        sikertelen: eredmeny.sikertelen,
        kihagyva: eredmeny.kihagyva,
        foglalt: eredmeny.foglalt,
        hatralevo: eredmeny.hatralevo,
      })

      if (eredmeny.futottVegig || eredmeny.hatralevo <= 0) {
        befejezesOka = 'kesz'
        break
      }

      // ⚠️ A LEÁLLÍTÁST A HALADÁS-FELTÉTEL ELŐTT NÉZZÜK. Ha a tulajdonos még az
      //    első hatókör előtt állította le, a szelet nulla feldolgozottal tér
      //    vissza — a haladás-feltétel ezt „elakadás"-nak (`nem_halad`)
      //    minősítené, és a felület hibát írna ki egy TELJESEN SZABÁLYOS
      //    leállításra.
      if (allapot.megallitasKerve) {
        befejezesOka = 'leallitva'
        break
      }

      // ⚠️ A FOLYTATÁS FELTÉTELE UGYANAZ A FÜGGVÉNY, mint a cron-szkriptben —
      //    szándékosan, hogy a két út ne sodródjon szét. A `kellMegSzelet` a
      //    `sikeres`-t nézi, NEM a `feldolgozva`-t és NEM a `kihagyva`-t: a
      //    következő szelet listáját KIZÁRÓLAG a SIKER szűkíti (csak az igazolt
      //    napló-sor kerül a folytatási pontba). Egy csupa-bukás szelet
      //    („feldolgozva 200, sikeres 0") ugyanazt a 200 hatökört próbálná újra,
      //    a végtelenségig — 10 órán át, ebben a webkiszolgáló-folyamatban.
      if (
        !kellMegSzelet({
          osszes: eredmeny.osszes,
          feldolgozva: eredmeny.feldolgozva,
          sikeres: eredmeny.sikeres,
          sikertelen: eredmeny.sikertelen,
          kihagyva: eredmeny.kihagyva,
          hatralevo: eredmeny.hatralevo,
          foglalt: eredmeny.foglalt,
          futottVegig: eredmeny.futottVegig,
        })
      ) {
        befejezesOka = 'nem_halad'
        break
      }
    }
  } catch (e: unknown) {
    // A ciklus SAJÁT hibája (nem a motoré — azt fentebb elkaptuk). Ide például
    // egy állapot-frissítés vagy egy váratlan típushiba kerülhet. Nem dobjuk
    // tovább: a `startBackupRun` háttérben hívja, egy elkapatlan elutasítás
    // pedig megölné a folyamatot.
    befejezesOka = 'hiba'
    allapot = { ...allapot, utolsoHiba: e instanceof Error ? e.message : 'ismeretlen hiba' }
    console.error('[backup-supervisor] A szelet-ciklus hibára futott.', e)
  } finally {
    allapot = {
      ...allapot,
      fut: false,
      vegzettAt: new Date().toISOString(),
      befejezesOka,
      megallitasKerve: false,
    }
    futoCiklus = null
  }
}
