/**
 * CHANGELOG-jelölések — megosztott típusok (2026-08-12).
 *
 * Külön fájl, mert a Next.js 16 szabálya szerint a `use server` action-fájl
 * CSAK async függvényt exportálhat (típust/konstanst nem).
 */

export interface JelolesEredmeny {
  success?: boolean
  error?: string
  /** true = a 2026-08-12-changelog-jelolesek.sql még nem futott le élesben. */
  needsSql?: boolean
}
