/**
 * Iktató F8b (B3) — egyháztag-átadás flow típusai.
 *
 * Külön fájlban, mert a `'use server'` modul (atadas-actions.ts) NEM
 * exportálhat típust/konstanst (Next.js 16 runtime-szabály, lásd MEMORY:
 * nextjs16_use_server_only_async).
 */

/** A gyülekezet-kereső (searchCongregations) egy találata. */
export interface CongregationSearchHit {
  id: string
  /** Megjelenítendő név — nev_hu, ennek híján a hivatalos name. */
  nev: string
  /** Az egyházmegye neve (dioceses.name), ha feloldható. */
  megye: string | null
}

/** A registerAtadas bemenete. */
export interface RegisterAtadasInput {
  /** Az átadott egyháztag szemely.id-je (a SAJÁT gyülekezetből). */
  szemelyId: number
  /** A cél-egyházközség congregations.id-je (uuid). */
  celCongregationId: string
  /** A kiállított igazolás iktatószáma (pl. "2026/152") — a kiállító adja. */
  iktatoszam: string
  /** A kiállított dokumentum HTML-je — az értesítés törzsébe (szövegként) kerül. */
  dokumentumHtml?: string
}

/** A registerAtadas eredménye. */
export interface RegisterAtadasResult {
  success: boolean
  error: string | null
  /**
   * Nem-blokkoló figyelmeztetések (pl. az ertesitesek-beszúrást az RLS
   * elutasította — a beépített átjelentkezési értesítés ettől még kézbesül).
   */
  warnings: string[]
}
