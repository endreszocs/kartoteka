/**
 * Az egyházmegyei összesítő megosztott típusai (2026-08-15).
 *
 * Külön fájl, mert a Next.js 16 'use server' szabálya szerint az action-fájl
 * (osszesito-actions.ts) CSAK async függvényt exportálhat — típust nem.
 */

import type { MegyeiOsszesito } from '@/lib/diocese/osszesito-core'
import type { OsszesitoFelkuldesAllapot } from '@/lib/finance/diocese-felterjesztes'

/** A `getMegyeiOsszesito` adatcsomagja (a felület egyetlen bemenete). */
export interface OsszesitoOldalAdat {
  osszesito?: MegyeiOsszesito
  /** Mely években van beküldés a megyében (év-választó) — csökkenő sorrend. */
  evek?: number[]
  /** Írhat-e a néző (számvevő: false → a felküldés-gomb nem jelenik meg). */
  canWrite?: boolean
  /** Miért nem írhat — beszédes magyar magyarázat (számvevői nézet). */
  readOnlyReason?: string | null
  /** Az egyházmegye hivatalos neve (duplázás-védetten) a fejlécekhez. */
  dioceseNev?: string | null
  /** A felküldés (véglegesítés) állapota — a KÖZÖS véglegesítés-gombhoz. */
  felkuldes?: OsszesitoFelkuldesAllapot
  /**
   * A felküldés-állapot betöltésének hibája. A SZÁMOK ilyenkor is látszanak,
   * de a véglegesítés-gomb helyén ez a magyarázat áll — fail-closed: nem
   * mutatunk „nincs felküldve" képet egy elnyelt hibából.
   */
  felkuldesHiba?: string
  /** Fail-closed hibaüzenet (nincs hatókör / lekérdezési hiba). */
  error?: string
}
