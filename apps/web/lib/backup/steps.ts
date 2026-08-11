/**
 * A MENTÉS-FUTÁS LÉPÉSEI ÉS A TEENDŐ-MONDAT (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 2026-08-11-én ennyit látott a „Mentés most" gomb után:
 *
 *     „A biztonsági mentés futása sikertelen."
 *
 * Se lépés, se ok, se teendő. Közben a szerver PONTOSAN TUDTA a hibát (a
 * `route.ts` `reszlet` mezőben el is küldte), csak a felület felé vezető úton
 * eldobtuk. Egy MENTÉS-funkciónál ez a legrosszabb hibaosztály: pont akkor
 * némul el, amikor a legjobban számít.
 *
 * Ez a modul adja a hiányzó három dolgot:
 *   1) LÉPÉS-LISTA — meddig jutott a futás, és hol állt meg (pipa / kereszt /
 *      „idáig el sem jutottunk"),
 *   2) TEENDŐ — EGY magyar mondat arról, MIT KELL TENNIE (általában egy SQL
 *      lefuttatása vagy egy újrapróbálás),
 *   3) a kettő GÉPI azonosítója, hogy a felület stabilan tudjon rá építeni.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ TITOK SOHA NEM KERÜL IDE
 * ────────────────────────────────────────────────────────────────────────────
 * A `reszlet` mezőkbe kizárólag TÉNY megy: tábla-nevek, darabszámok, a tároló
 * neve, a lépés neve. Token, kulcs, jelszó, Google `code`, `client_secret`
 * SEM értékkel, SEM hosszal, SEM előtaggal. A bejövő technikai üzenetet a
 * hívók már tisztítják (`safeDbError`, `driveError`), ez a modul pedig
 * VÁGJA is (`vagd()`), hogy egy hosszú driver-szöveg ne tegye olvashatatlanná
 * a felületet.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NULLA FUTÁSIDEJŰ PROJEKT-IMPORT (csak `import type`) — így a
 * `scripts/selftest-backup.mjs` önmagában betölti és teszteli.
 */

import type { BackupFailureStage, BackupRunStep, BackupStepAllapot } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// A lépés
// ─────────────────────────────────────────────────────────────────────────────

export type { BackupRunStep, BackupStepAllapot }

/**
 * Az első olyan lépés, ami VALÓBAN elbukott. `null`, ha egyik sem.
 *
 * ⚠️ 2026-08-11: KIZÁRÓLAG a szigorú `=== false` számít bukásnak. A
 *    `'folyamatban'` (még nem végeztünk vele) és a `'figyelmeztetes'`
 *    (megtörtént, de hiányosan) NEM hiba — ha ezeket is idesorolnánk, a felület
 *    egy hibátlan, haladó futásra rajzolna piros keresztet, és a
 *    képernyőolvasónak azt mondaná: „ITT HIBÁZOTT".
 */
export function elsoBukottLepes(lepesek: BackupRunStep[]): BackupRunStep | null {
  for (const l of lepesek) {
    if (l.ok === false) return l
  }
  return null
}

/** Rövid, biztonságos szövegvágás — egy driver-üzenet nem nyelheti el a felületet. */
export function vagd(szoveg: string, hossz = 600): string {
  const tiszta = (szoveg || '').replace(/\s+/g, ' ').trim()
  if (tiszta.length <= hossz) return tiszta
  return `${tiszta.slice(0, hossz)}…`
}

// ─────────────────────────────────────────────────────────────────────────────
// A FUTÁS lépései (a hatókör-cikluson KÍVÜL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `runBackupWorker()` előkészítő lépései, ABBAN A SORRENDBEN, ahogy futnak.
 *
 * ⚠️ EZ A SORREND KÖTELEZŐEN EGYEZZEN a `worker.ts`-beli tényleges sorrenddel.
 *    Ha valaha új előkészítő lépés kerül a motorba, ide is fel kell venni —
 *    különben a felület egy nem létező lépésnél mutatna keresztet, ami rosszabb,
 *    mint a semmi.
 */
export const FUTAS_LEPESEK = [
  { id: 'kulcs', cimke: 'Titkosítási kulcs betöltése' },
  { id: 'leltar', cimke: 'Adatbázis-táblák leltára' },
  { id: 'besorolas', cimke: 'Tábla-besorolás ellenőrzése' },
  { id: 'tarolo', cimke: 'Tároló megnyitása (Google Drive)' },
  { id: 'helyreallito', cimke: 'Helyreállító kulcs ellenőrzése' },
  { id: 'hatokorok', cimke: 'Gyülekezetek listája' },
  { id: 'mentes', cimke: 'Mentés hatókörönként' },
  { id: 'takaritas', cimke: 'Takarítás' },
] as const

export type FutasLepesId = (typeof FUTAS_LEPESEK)[number]['id']

/**
 * Lépés-lista építő. A motor `jelol()`-lel halad; ami után nem jelöltünk,
 * az `null` marad — vagyis a felületen „idáig el sem jutottunk".
 *
 * Miért nem egy `stage` szám: mert a `reszlet` mezőt is vezetni akarjuk
 * (hány hatókör, melyik tároló), és mert egy lépés SIKERÜLHET úgy is, hogy
 * a következő már el sem indul.
 */
export function ujFutasLepesek(): BackupRunStep[] {
  return FUTAS_LEPESEK.map((l) => ({ id: l.id, cimke: l.cimke, ok: null }))
}

/**
 * Egy lépés kimenetelének rögzítése. Ismeretlen azonosítót SZÁNDÉKOSAN nem hoz létre.
 *
 * ⚠️ 2026-08-11: az `ok` ÖT értéket vehet fel (lásd `BackupStepAllapot`). A
 *    `false` KIZÁRÓLAG valódi bukást jelenthet — a „még nem végeztünk vele"
 *    `'folyamatban'`, a „megtörtént, de hiányosan" `'figyelmeztetes'`.
 */
export function jelolLepes(
  lepesek: BackupRunStep[],
  id: FutasLepesId,
  ok: BackupStepAllapot,
  reszlet?: string,
): BackupRunStep[] {
  for (const l of lepesek) {
    if (l.id === id) {
      l.ok = ok
      if (reszlet !== undefined) l.reszlet = vagd(reszlet, 200)
    }
  }
  return lepesek
}

// ─────────────────────────────────────────────────────────────────────────────
// EGY HATÓKÖR lépései (az `exportScope` belseje)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A gyülekezetenkénti mentés hat lépése — pontosan az a sorrend, ahogy az
 * `export.ts` halad rajtuk, és pontosan az a hat név, amit a tulajdonos lát.
 */
export const EXPORT_LEPESEK: Array<{ id: string; cimke: string; stage: BackupFailureStage }> = [
  { id: 'szamlalas', cimke: 'Adatbázis olvasása — sorok megszámolása', stage: 'szamlalas' },
  { id: 'dump', cimke: 'Adatbázis olvasása — tartalom kiolvasása', stage: 'dump' },
  { id: 'titkositas', cimke: 'Csomagolás és titkosítás', stage: 'titkositas' },
  { id: 'feltoltes', cimke: 'Feltöltés a tárolóba', stage: 'feltoltes' },
  { id: 'igazolas', cimke: 'Visszaolvasás és igazolás', stage: 'igazolas' },
  { id: 'nyeses', cimke: 'Régi mentések nyesése', stage: 'nyeses' },
]

/**
 * Egy hatókör lépés-listája a bukás helye alapján.
 *
 * A bukott lépés ELŐTTIEK pipát kapnak (odáig ELJUTOTTUNK — ez a tény), a
 * bukott lépés keresztet, az UTÁNA következők `null`-t (nem „rendben", hanem
 * „idáig el sem jutottunk"). A `null` és a `false` megkülönböztetése nem
 * kozmetika: enélkül a felület azt sugallná, hogy a feltöltés rendben volt,
 * miközben el sem indult.
 *
 * `stage === null` (ismeretlen bukási hely) esetén NEM találgatunk: minden
 * lépés `null` marad, és a teendő-mondat viszi a súlyt.
 */
export function exportLepesek(stage: BackupFailureStage | null, ok = false): BackupRunStep[] {
  const lista = EXPORT_LEPESEK.map((l) => ({ id: l.id, cimke: l.cimke, ok: null as boolean | null }))
  if (ok) {
    for (const l of lista) l.ok = true
    return lista
  }
  if (stage === null) return lista
  const index = lista.findIndex((l) => l.id === stage)
  if (index < 0) return lista
  for (let i = 0; i < lista.length; i++) {
    lista[i].ok = i < index ? true : i === index ? false : null
  }
  return lista
}

// ─────────────────────────────────────────────────────────────────────────────
// A TEENDŐ — EGY magyar mondat, amiből cselekedni lehet
// ─────────────────────────────────────────────────────────────────────────────

export interface MentesTeendo {
  /** Gépi azonosító (teszthez és a felület ikonválasztásához). */
  id: string
  /** A mondat, amit a tulajdonos lát. */
  szoveg: string
  /** Ha a megoldás egy SQL lefuttatása: a fájl útvonala. Különben `null`. */
  sql: string | null
}

const SQL_BESOROLAS = 'migration-docs/sql/2026-08-11-mentes-tabla-besorolas.sql'
const SQL_ALAP = 'migration-docs/sql/2026-08-11-biztonsagi-mentes.sql'

/**
 * A technikai hibaüzenetből EMBERI teendő.
 *
 * Miért szövegből: a motor dobással jelez, és a dobott `Error` nem hordoz
 * típusos mezőt — viszont MINDEN szöveg a mi kezünkben van, és mindegyik
 * megnevezi az okot. Az ismeretlen eset teljesen elfogadható: akkor a
 * „nézd meg a naplót" mondat megy ki, nem egy kitalált diagnózis.
 *
 * ⚠️ A sorrend SZÁMÍT: a szűkebb minta legyen elöl. A „besorolatlan" például
 *    a „leltár" szót is tartalmazhatja, és fordított sorrendben rossz — mert
 *    másik SQL-fájlt megnevező — tanácsot adnánk.
 */
export function mentesTeendo(uzenet: string | null | undefined): MentesTeendo {
  const m = (uzenet || '').toLowerCase()

  if (m.includes('besorolatlan élő tábla') || m.includes('besorolatlan elo tabla')) {
    return {
      id: 'besorolatlan_tabla',
      sql: SQL_BESOROLAS,
      szoveg:
        'Van olyan adatbázis-tábla, amiről nincs eldöntve, bekerüljön-e a mentésbe. A rendszer ' +
        'ilyenkor SZÁNDÉKOSAN el sem indul, nehogy némán kihagyjon adatot. Teendő: futtasd le a ' +
        `Supabase SQL-szerkesztőjében a(z) ${SQL_BESOROLAS} fájlt (egyben, elejétől a végéig), ` +
        'majd nyomd meg újra a „Mentés most" gombot.',
    }
  }

  if (m.includes('érvényes szűrő nélkül') || m.includes('ervenyes szuro nelkul')) {
    return {
      id: 'rossz_szuro',
      sql: SQL_BESOROLAS,
      szoveg:
        'Egy tábla gyülekezeti hatókörrel van besorolva, de nincs hozzá érvényes gyülekezet-szűrő — ' +
        'így MINDEN gyülekezet mentése elhasalna. Teendő: futtasd le a Supabase SQL-szerkesztőjében ' +
        `a(z) ${SQL_BESOROLAS} fájlt, majd próbáld újra.`,
    }
  }

  if (
    m.includes('tábla-leltár nem tölthető be') ||
    m.includes('tábla-leltár üres') ||
    m.includes('backup_live_tables') ||
    m.includes('sql-migrációja még nem futott')
  ) {
    return {
      id: 'nincs_sql',
      sql: SQL_ALAP,
      szoveg:
        'A mentés adatbázis-része nincs (vagy nincs teljesen) telepítve. Teendő: futtasd le a ' +
        `Supabase SQL-szerkesztőjében a(z) ${SQL_ALAP} fájlt, utána a(z) ${SQL_BESOROLAS} fájlt, ` +
        'majd próbáld újra.',
    }
  }

  if (m.includes('backup_dump_table rpc régebbi') || m.includes('régebbi változata fut')) {
    return {
      id: 'regi_rpc',
      sql: SQL_ALAP,
      szoveg:
        'Az adatbázisban a mentés-függvények RÉGEBBI változata fut. Teendő: futtasd le újra a ' +
        `Supabase SQL-szerkesztőjében a(z) ${SQL_ALAP} fájlt, majd próbáld újra.`,
    }
  }

  if (
    m.includes('google') ||
    m.includes('drive') ||
    m.includes('token') ||
    m.includes('hozzáférés lejárt')
  ) {
    return {
      id: 'drive',
      sql: null,
      szoveg:
        'A Google Drive kapcsolat nem használható (lejárt vagy visszavont hozzáférés, esetleg ' +
        'elérhetetlen Google). Teendő: az „Összekötött Google-fiók" kártyán nyomd meg a ' +
        '„Kapcsolat próbája" gombot; ha az is elhasal, kösd össze újra a Drive-ot.',
    }
  }

  if (m.includes('vödör') || m.includes('bucket')) {
    return {
      id: 'vodor',
      sql: null,
      szoveg:
        'A tartalék tároló (Supabase Storage) vödre nem elérhető. Teendő: hozd létre a ' +
        '„biztonsagi-mentes" vödröt a Supabase Studio → Storage felületén, PRIVÁTKÉNT — vagy ' +
        'kösd össze a Google Drive-ot, mert a mentés fő értéke az, hogy MÁSHOL van.',
    }
  }

  if (m.includes('napló-sor')) {
    return {
      id: 'naplo',
      sql: null,
      szoveg:
        'A mentési naplóba nem sikerült írni, ezért a futás megállt (napló nélkül nem tudnánk ' +
        'bizonyítani, hogy a mentés elkészült). Teendő: próbáld újra; ha megismétlődik, az ' +
        'adatbázis írási hibáját kell megnézni.',
    }
  }

  if (m.includes('titkosítási kulcs') || m.includes('backup_encryption_key')) {
    return {
      id: 'kulcs',
      sql: null,
      szoveg:
        'A mentés titkosítási kulcsa nincs beállítva a szerveren. Titkosítás nélkül SZÁNDÉKOSAN ' +
        'nem készítünk mentést (a fájlok személyi adatot tartalmaznak). Teendő: állítsd be a ' +
        'BACKUP_ENCRYPTION_KEY környezeti változót a Railway-en, majd próbáld újra.',
    }
  }

  if (m.includes('gyülekezetek listája')) {
    return {
      id: 'gyulekezet_lista',
      sql: null,
      szoveg:
        'A gyülekezetek listája nem tölthető be az adatbázisból, így nem tudjuk, kiről kellene ' +
        'mentés. Teendő: próbáld újra pár perc múlva; ha megismétlődik, az adatbázis elérhetőségét ' +
        'kell megnézni.',
    }
  }

  if (m.includes('korlát') && m.includes('mb')) {
    return {
      id: 'meret',
      sql: null,
      szoveg:
        'Egy mentés-fájl túllépte a megengedett méretet. Teendő: emeld a BACKUP_MAX_FILE_MB ' +
        'környezeti változó értékét a Railway-en, majd próbáld újra.',
    }
  }

  return {
    id: 'ismeretlen',
    sql: null,
    szoveg:
      'A pontos technikai okot lentebb, a „Részletek" alatt olvasod. Teendő: próbáld meg újra — ' +
      'ha ugyanez jön vissza, a Railway naplójában a „[backup]" sorok mutatják a teljes szöveget, ' +
      'a „Mentési előzmény" listában pedig a hibás sorok részletei.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A HALADÁS mondata
// ─────────────────────────────────────────────────────────────────────────────

export interface HaladasSzamok {
  /** Ennyi hatókört KELLETT volna érinteni (aktív gyülekezetek + globális). */
  osszes: number
  /** Ebből ennyi készült el MOST, igazoltan. */
  sikeres: number
  /** Ennyi bukott el. */
  sikertelen: number
  /** Ennyit hagytunk ki, mert MA MÁR volt róluk igazolt mentés. */
  kihagyva: number
  /** Ennyihez hozzá sem értünk ebben a futásban (idő- vagy darab-korlát). */
  hatralevo: number
}

/**
 * A haladás EGY magyar mondatban — akkor is, ha a futás nem végzett mindennel.
 *
 * ⚠️ A „nem végzett mindennel" KIMONDANDÓ. A legrosszabb kimenet az, ha a
 *    felület zöldet mutat 300 kész mentésre, miközben 484 hatókör hozzáérés
 *    nélkül maradt — a tulajdonos abból azt olvasná ki, hogy kész van.
 */
export function haladasMondat(sz: HaladasSzamok): string {
  const reszek: string[] = []
  reszek.push(`${sz.sikeres} hatókör igazolva`)
  if (sz.kihagyva > 0) reszek.push(`${sz.kihagyva} kihagyva (ma már készült róluk igazolt mentés)`)
  if (sz.sikertelen > 0) reszek.push(`${sz.sikertelen} elbukott`)
  if (sz.hatralevo > 0) reszek.push(`${sz.hatralevo} MÉG HÁTRAVAN`)

  const alap = `${reszek.join(', ')} — összesen ${sz.osszes} hatókörből.`
  if (sz.hatralevo > 0) {
    return (
      `${alap} Ez a futás NEM végzett mindennel: az idő- vagy darab-korlát miatt megállt. ` +
      'A már elkészült mentések MEGVANNAK — a folytatás onnan veszi fel a fonalat, ahol abbahagyta.'
    )
  }
  return alap
}
