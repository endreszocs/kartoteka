/**
 * XML-overlay — a hivatalos xlsx bevétel-sorait a `bevételek YYYY.xml` referencia-
 * fájllal egyezteti, és átveszi belőle a PONTOS adatokat:
 *   - „Befizetett év" (col 11) → a több-éves hátralék helyes besorolása
 *     (pl. Kádár Barna Zsolt 5 tétele 2021–2025-re, nem mind 2025-re)
 *   - hivatalos 5-jegyű iratszám (col 8) → stabil dedup-kulcs
 *
 * 2026-06-19 — az egységes importálóhoz. Az xml CSAK bevételt fed, ezért az overlay
 * KIZÁRÓLAG income-sorokon fut (a kiadás/belső-mozgás érintetlen).
 *
 * Kulcs-egyezés (a `cross-source-matcher` elvével azonos, de a ClassifiedKasszaRow
 * alakra szabva): `xlsx.iratszam (sorszám) ⇆ xml.nyugta` + összeg (|Δ|<0.01) +
 * név-hasonlóság (Jaro–Winkler ≥ 0.88). Pont: 1 (nyugta) +1 (összeg) +1 (név).
 * Csak ≥2 pontnál (nyugta + összeg VAGY név) veszünk át adatot — óvatos.
 */

import type { ClassifiedKasszaRow } from '@/app/(dashboard)/penzugy/finance-import-types'
import type { XmlBevetelekRow } from '@/components/finance/finance-import/egyhfenntartas/helpers/xml-bevetelek-parser'
import { nameSimilarity } from '@/lib/import/jaro-winkler'

export interface XmlOverlayMatch {
  fizetettev: number | null
  iratszamHivatalos: string | null
  /** Egyezés-pontszám 1..3 (a magasabb biztosabb). */
  confidence: number
}

export interface XmlOverlayResult {
  /** ClassifiedKasszaRow.rowIndex → a felülírandó XML-adatok. */
  byRowIndex: Map<number, XmlOverlayMatch>
  matchedCount: number
  /** XML-sorok, amelyekhez NEM találtunk xlsx-párt (a review-ban jelzendők). */
  onlyXml: XmlBevetelekRow[]
}

function parseIntOrNull(s: string | null | undefined): number | null {
  if (s == null) return null
  const n = Number.parseInt(String(s).trim(), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * @param incomeRows CSAK az income-kind ClassifiedKasszaRow-k (a hívó szűri).
 * @param xmlRows    a parseXmlBevetelek({categoryKeyword:null}) eredménye (minden bevétel).
 */
export function applyXmlOverlay(
  incomeRows: ClassifiedKasszaRow[],
  xmlRows: XmlBevetelekRow[],
): XmlOverlayResult {
  // XML indexelése nyugta-szám szerint (egy nyugtán több sor lehet — háztartás).
  const xmlByNyugta = new Map<number, XmlBevetelekRow[]>()
  for (const x of xmlRows) {
    if (x.nyugta == null) continue
    const arr = xmlByNyugta.get(x.nyugta) ?? []
    arr.push(x)
    xmlByNyugta.set(x.nyugta, arr)
  }

  const byRowIndex = new Map<number, XmlOverlayMatch>()
  const consumed = new Set<XmlBevetelekRow>()
  let matchedCount = 0

  for (const row of incomeRows) {
    const sorszam = parseIntOrNull(row.iratszam)
    if (sorszam == null) continue
    const candidates = xmlByNyugta.get(sorszam)
    if (!candidates || candidates.length === 0) continue

    // A legjobb (még fel nem használt) XML-pár kiválasztása.
    let best: XmlBevetelekRow | null = null
    let bestScore = -1
    for (const c of candidates) {
      if (consumed.has(c)) continue
      let score = 1 // nyugta == sorszám
      if (typeof row.amount === 'number' && Math.abs(row.amount - c.osszeg) < 0.01) score++
      if (nameSimilarity(row.donorString ?? '', c.rawForrasa) >= 0.88) score++
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }

    // Óvatos: legalább nyugta + (összeg VAGY név) kell az átvételhez.
    if (best && bestScore >= 2) {
      consumed.add(best)
      byRowIndex.set(row.rowIndex, {
        fizetettev: best.fizetettev,
        iratszamHivatalos: best.iratszam != null ? String(best.iratszam) : null,
        confidence: bestScore,
      })
      matchedCount++
    }
  }

  const onlyXml = xmlRows.filter((x) => !consumed.has(x))
  return { byRowIndex, matchedCount, onlyXml }
}
