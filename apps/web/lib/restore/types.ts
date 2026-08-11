/**
 * Visszaállítás — közös típusok. 2026-08-11.
 *
 * NEM `'use server'` fájl: a Next.js 16 megszorítás miatt a típusok és a
 * konstansok testvérfájlban élnek, hogy a szerver-akciók kizárólag async
 * függvényt exportáljanak.
 *
 * Ezt a fájlt a kliens-komponensek is importálják — ezért itt SEMMI olyan nem
 * lehet, ami titkot vagy szerver-oldali modult ránt be.
 */

/**
 * A mentés-fájl manifestjét NEM írjuk le újra: a `lib/backup/types.ts`
 * `BackupManifest`-je az egyetlen igazság-forrás. Két párhuzamos manifest-típus
 * pontosan az a fajta széthúzás, amitől a visszaállítás némán hibás lenne.
 */

/**
 * Az indoklás minimális hossza. Ugyanaz, mint az adattörlésnél — és itt
 * TÉNYLEG a naplóba megy (`backup_restore_log.indoklas`), nem csak a felületen
 * él, mint a `wipe-congregation-panel.tsx:79-80` bevallott hiányossága.
 *
 * Itt lakik, mert MINDKÉT oldalnak kell: a szerver kényszeríti ki, a
 * kliens pedig ebből számolja a karakter-visszajelzést.
 */
export const INDOKLAS_MIN_HOSSZ = 8

/** Egyetlen tábla száraz-futás-eredménye. */
export interface RestoreTableDiff {
  tabla: string
  /** Hány sor van a mentésben. */
  mentesben: number
  /** Hány sor van MOST élőben. */
  elo: number
  /** Visszajönne (a mentésben megvan, élőben nincs). */
  beszuras: number
  /** Felülíródna (mindkettőben megvan, de más a tartalma). */
  modositas: number
  /** ⚠️ ELTŰNNE (élőben megvan, a mentésben nincs). */
  torles: number
  /** Érintetlen. */
  valtozatlan: number
  /** Max 5 címke arról, MI tűnne el. Fehérlistás mezőkből — soha nem CNP. */
  mintaTorles: string[]
  /** Max 3 címke arról, mi íródna felül. */
  mintaModositas: string[]
  /** Nincs elsődleges kulcsa → a módosítás nem értelmezhető, csak +/−. */
  nincsPk: boolean
  /** A mentésben van ilyen oszlop, az élő táblában MÁR NINCS → az érték elveszne. */
  elveszoOszlopok: string[]
  /** Az élő táblában van, a mentésben nem volt → a visszaállított sorokban üres lesz. */
  ujOszlopok: string[]
  /** Ha a tábla ma már nem létezik, vagy nincs érvényes szűrője. */
  hiba?: string
}

/** Olyan tábla, ami miatt a visszaállítás MEG FOG TAGADNI. */
export interface RestoreBlocker {
  tabla: string
  ok: string
}

/** A száraz futás teljes eredménye — ezt látja a rendszergazda a gomb ELŐTT. */
export interface RestorePreview {
  /** A `backup_log` sor azonosítója, amiből a visszaállítás menne. */
  backupLogId: number
  congregationId: string
  /** A pontosan begépelendő név (monospace-ben kiírva a felületen). */
  congregationNev: string
  /** A pontosan begépelendő dátum (`2026-08-08`). */
  runDate: string
  keszult: string | null
  /** A `backup_restore_log` preview-sorának azonosítója (a napló miatt). */
  dryRunLogId: number | null
  tablak: RestoreTableDiff[]
  osszesen: { beszuras: number; modositas: number; torles: number }
  /** Ha nem üres, a végrehajtás megtagadja — a felület le is tiltja a gombot. */
  blokkolo: RestoreBlocker[]
  /** Gyülekezeti táblák, amikhez a visszaállítás HOZZÁ SEM NYÚL. */
  erintetlen: string[]
  /** Nem blokkoló, de kimondandó észrevételek (séma-sodródás, jelszó-csere…). */
  figyelmeztetesek: string[]
  /** Amit a visszaállítás NEM tud — mindig látszik, a manifestből is bővül. */
  amitNemTud: string[]
  /** Egyszer használható terv-token. Enélkül a végrehajtás el sem indul. */
  planToken: string
  /** Meddig érvényes a terv-token (ISO). */
  planTokenLejar: string
}

export interface RestorePreviewResult {
  success: boolean
  preview?: RestorePreview
  error?: string
}

/** A végrehajtás bemenete — mind az öt kapu egy helyen. */
export interface RestoreExecuteInput {
  /** 1. kapu közvetett bizonyítéka: csak a száraz futás adhatta ki. */
  planToken: string
  /** 2. kapu: a gyülekezet PONTOS neve, betűre-ékezetre. */
  confirmName: string
  /** 3. kapu: a mentés dátuma `2026-08-08` alakban, a kártyáról átmásolva. */
  confirmDate: string
  /** 4. kapu: a MENTÉSI jelszó (nem a bejelentkezési). */
  passphrase: string
  /** 5. kapu: indoklás — TÉNYLEG a naplóba megy, nem csak a felületen él. */
  indoklas: string
}

export interface RestoreExecuteResult {
  success: boolean
  error?: string
  /** A `backup_restore_log` sor azonosítója — a napló ezen a néven őrzi. */
  restoreLogId?: number
  /** A visszaállítás ELŐTTI állapotról készült mentés — EZ AZ „UNDO". */
  preRestoreBackupLogId?: number
  preRestoreKeszult?: string
  congregationNev?: string
  restoreEpoch?: number
  /** Táblánként: előtte / utána sorszám. */
  tablak?: Array<{ tabla: string; elotte: number; utana: number }>
  figyelmeztetesek?: string[]
}

/** Egy visszaállítható mentés a választólistában. */
export interface RestorableBackup {
  backupLogId: number
  congregationId: string
  congregationNev: string
  runDate: string
  kind: string
  keszult: string | null
  totalRows: number
  /** CSAK ez jelenti, hogy a mentés igazolt (feltöltve ÉS visszaolvasva). */
  igazolt: boolean
}

/** Egy sor a visszaállítás-naplóban. */
export interface RestoreLogEntry {
  id: number
  tipus: string
  actorEmail: string | null
  congregationNev: string | null
  backupRunDate: string | null
  indoklas: string | null
  outcome: string
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  /** CSAK számok — se név, se összeg. */
  diffSummary: { beszuras: number; modositas: number; torles: number } | null
}
