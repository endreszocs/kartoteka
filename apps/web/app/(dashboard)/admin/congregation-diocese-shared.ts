/**
 * Gyülekezet ⇄ egyházmegye kötés javítása — megosztott típusok (2026-08-10).
 *
 * Külön fájl, mert a Next.js 16 'use server' szabálya szerint az action-fájl
 * csak async függvényt exportálhat (típust/konstanst nem).
 */

export interface AssignableDiocese {
  id: string
  name: string
  districtId: string | null
  districtName: string | null
}

export interface AssignableDiocesesResult {
  rows?: AssignableDiocese[]
  /** 'master' | 'admin' → korlátlan; 'district_admin' → csak a saját kerülete egyházmegyéi. */
  accessLevel?: 'master' | 'admin' | 'district_admin'
  error?: string
}

export interface AssignCongregationDioceseResult {
  success?: string
  /** Nem-blokkoló megjegyzések (pl. a lelkészi profil-skalárok szinkronja részleges). */
  warnings?: string[]
  error?: string
}
