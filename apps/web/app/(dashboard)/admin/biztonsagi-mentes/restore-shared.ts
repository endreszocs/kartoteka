/**
 * Visszaállítás — a szerver-akciók KÖZÖS típusai és konstansai. 2026-08-11.
 *
 * Next.js 16: egy `'use server'` fájl KIZÁRÓLAG async függvényt exportálhat,
 * ezért a típusok és a konstansok ebben a testvérfájlban élnek. A
 * kliens-komponensek is innen importálnak.
 *
 * ⚠️ Ide semmilyen szerver-oldali modul nem kerülhet — ez a fájl a böngésző
 *    bundle-jébe is bekerülhet.
 */

export type {
  RestorableBackup,
  RestoreBlocker,
  RestoreExecuteInput,
  RestoreExecuteResult,
  RestoreLogEntry,
  RestorePreview,
  RestorePreviewResult,
  RestoreTableDiff,
} from '@/lib/restore/types'

/**
 * 5 másodperces késleltetés a végső megerősítő dialógus megnyitása után.
 *
 * MIÉRT: megtöri az izommemóriás átkattintást. Az előző mezőből Enterrel nem
 * érhető el a gomb, mert addig letiltott. Ez az EGYETLEN időzített kapu — a
 * kapuk értéke abból jön, hogy ritkák.
 */
export const RESTORE_KESLELTETES_MP = 5

/**
 * Az indoklás minimális hossza — ugyanaz az érték, amit a SZERVER kényszerít
 * ki. Szándékosan onnan jön, nem itt van újradeklarálva: két külön konstansból
 * előbb-utóbb két külön szabály lesz, és a felület olyat engedne, amit a
 * szerver elutasít.
 */
export { INDOKLAS_MIN_HOSSZ as RESTORE_INDOKLAS_MIN } from '@/lib/restore/types'

/** A visszaállítás-napló listájának alapértelmezett hossza. */
export const RESTORE_NAPLO_LIMIT = 20
