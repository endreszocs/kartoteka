/**
 * Oblio ellenőrzés — XML ↔ kiadás párosítási algoritmus.
 *
 * A pure function: bemenet a parse-olt XML-ek + a kiadás-rekordok + a
 * korábban már perzisztált match-ek; kimenet a párosítások listája.
 *
 * Algoritmus:
 *   1. Manuálisan / korábban perzisztált match-ek elsőbbsége (anaf_uuid kulcs)
 *   2. Erős auto-match: CUI matchel + összeg ±0.5 RON + dátum ±5 nap
 *   3. Gyengébb auto-match: név fuzzy + összeg + dátum (ha nincs CUI a kiadáson)
 */

import type { UblInvoiceMeta } from './ubl-parser'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

export type MinimalKiadas = {
  id: number
  datum: string
  osszeg: number
  kedvezmenyzett?: string | null
  atvevo?: string | null
  kedvezmenyezett_cui?: string | null
}

export type ExistingMatch = {
  kiadasId: number
  anafUuid: string
}

export type XmlMatchResult = {
  /** Az XML ANAF UUID-ja. */
  anafUuid: string
  /** A párosított kiadás (vagy null, ha nincs match). */
  kiadasId: number | null
  /** Hogyan jött létre a párosítás. */
  method: 'auto_cui' | 'auto_name_amount_date' | 'manual' | 'none'
  /** Mennyire bizonyos a párosítás. */
  confidence: 'high' | 'medium' | 'low' | 'none'
  /** Magyar magyarázat a UI-hoz. */
  explanation: string
}

export type KiadasMatchResult = {
  /** A kiadás ID. */
  kiadasId: number
  /** A párosított ANAF UUID (vagy null, ha nincs SPV-ben). */
  anafUuid: string | null
  method: 'auto_cui' | 'auto_name_amount_date' | 'manual' | 'none'
  confidence: 'high' | 'medium' | 'low' | 'none'
}

// ─────────────────────────────────────────────────────────────
// Segéd: név normalizálás (fuzzy compare)
// ─────────────────────────────────────────────────────────────

const COMPANY_SUFFIXES = [
  'srl',
  'sa',
  's.a.',
  's.r.l.',
  'pfa',
  'i.i.',
  'i.f.',
  'kft',
  'rt',
  'zrt',
]

function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return ''
  // Először levágjuk a "societatea " / "compania " / "firma " / "soc." előtagokat —
  // ezek tipikus román cég-előtagok, amik nem hordoznak megkülönböztető infót
  let s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // ékezetek
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Cég-előtagok eltávolítása (pl. "societatea ", "compania ")
  s = s.replace(/^(societatea|compania|firma|soc|sc)\s+/i, '')
  // Cég-utótagok eltávolítása
  for (const suffix of COMPANY_SUFFIXES) {
    s = s.replace(new RegExp(`\\b${suffix.replace(/[.()]/g, '\\$&')}\\b`, 'g'), '')
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Substring + szó-egyezés alapú név match. Sokkal megengedőbb mint a
 * Jaccard-hasonlóság, mert a könyvelésben gyakran rövid névvel szerepel
 * ("Electrica"), míg az XML-ben hosszú a hivatalos név
 * ("Societatea Electrica Furnizare S.A.").
 *
 * Visszaadási értékek:
 *   - 1.0 = teljes egyezés
 *   - 0.9 = az egyik teljesen tartalmazza a másikat (pl. "electrica" benne
 *           van a "societatea electrica furnizare"-ban)
 *   - 0.7 = legalább 1 szignifikáns szó (4+ char) egyezik
 *   - 0.4 = közös szavak Jaccard-aránya 40%+
 *   - 0.0 = nincs egyezés
 */
function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  // Substring match — az egyik tartalmazza a másikat
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return 0.9
  }

  // Szignifikáns szó-egyezés (legalább 1 közös 4+ char szó)
  const wordsA = na.split(' ').filter((w) => w.length >= 4)
  const wordsB = nb.split(' ').filter((w) => w.length >= 4)
  const sigCommon = wordsA.filter((w) => wordsB.includes(w))
  if (sigCommon.length > 0) return 0.7

  // Jaccard fallback (rövid szavak is)
  const allA = new Set(na.split(' '))
  const allB = new Set(nb.split(' '))
  const intersect = [...allA].filter((w) => allB.has(w))
  const union = new Set([...allA, ...allB])
  return union.size === 0 ? 0 : intersect.length / union.size
}

// ─────────────────────────────────────────────────────────────
// Dátum ± nap segéd
// ─────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY
  return Math.abs((db - da) / 86_400_000)
}

// ─────────────────────────────────────────────────────────────
// Fő algoritmus
// ─────────────────────────────────────────────────────────────

// Az ÁFA-kerekítések, banki százalék-eltérések miatt 1 RON tolerancia
// reálisabb mint a korábbi 0.5 RON.
const AMOUNT_TOLERANCE = 1.0
// A kifizetés dátuma sokszor 30-60 nappal a számla kibocsátása UTÁN van
// (pl. nagy beszállítók 60 napos fizetési határidővel). Tág tolerancia a
// 3. lépésben (név fuzzy + összeg).
const DATE_TOLERANCE_DAYS = 60

export type MatchOptions = {
  amountTolerance?: number
  dateToleranceDays?: number
}

/** Kiadás-jelölt egy XML-hez (diagnosztikai célra). */
export type CandidateInfo = {
  kiadasId: number
  partner: string
  amount: number
  date: string
  amountDelta: number
  dateDelta: number
  nameSim: number
  reason: string
}

/** Egy párosítatlan XML diagnosztikai infója — a UI-n megjelenítjük. */
export type UnmatchedXmlDiag = {
  xmlAnafUuid: string | null
  xmlSupplier: string | null
  xmlCui: string | null
  xmlAmount: number | null
  xmlDate: string | null
  /** Az összes kiadás, ami az amount-toleranciára illeszkedik. */
  candidates: Array<{
    kiadasId: number
    partner: string
    amount: number
    date: string
    cuiKiadas: string | null
    amountDelta: number
    dateDelta: number
    nameSimPct: number
    alreadyMatched: boolean
  }>
}

/**
 * Az XML-eket párosítja a kiadásokkal. Visszaad három nézetet:
 *   - xmlResults: minden XML-re egy match (vagy 'none')
 *   - kiadasResults: minden kiadásra egy match (vagy 'none')
 *   - unmatchedDiag: a párosítatlanok részletes diagnosztikája
 */
export function matchXmlsToKiadas(
  xmls: UblInvoiceMeta[],
  kiadasok: MinimalKiadas[],
  existing: ExistingMatch[],
  options: MatchOptions = {},
): {
  xmlResults: XmlMatchResult[]
  kiadasResults: KiadasMatchResult[]
  unmatchedDiag: UnmatchedXmlDiag[]
} {
  const amountTol = options.amountTolerance ?? AMOUNT_TOLERANCE
  const dateTol = options.dateToleranceDays ?? DATE_TOLERANCE_DAYS

  // Indexek
  const existingByUuid = new Map<string, number>()
  const existingByKiadasId = new Map<number, string>()
  for (const e of existing) {
    existingByUuid.set(e.anafUuid, e.kiadasId)
    existingByKiadasId.set(e.kiadasId, e.anafUuid)
  }

  const xmlResults: XmlMatchResult[] = []
  const matchedKiadasIds = new Set<number>(existingByKiadasId.keys())
  const kiadasMatchByXml = new Map<string, KiadasMatchResult>()

  // 1. Manuálisan perzisztált match-ek (legmagasabb prioritás)
  for (const xml of xmls) {
    if (!xml.anafUuid) continue
    const persistedKiadasId = existingByUuid.get(xml.anafUuid)
    if (persistedKiadasId !== undefined) {
      xmlResults.push({
        anafUuid: xml.anafUuid,
        kiadasId: persistedKiadasId,
        method: 'manual',
        confidence: 'high',
        explanation: 'Korábban kézzel megerősített párosítás.',
      })
      kiadasMatchByXml.set(xml.anafUuid, {
        kiadasId: persistedKiadasId,
        anafUuid: xml.anafUuid,
        method: 'manual',
        confidence: 'high',
      })
    }
  }

  // 2. Auto-match: CUI + összeg + dátum
  for (const xml of xmls) {
    if (!xml.anafUuid || existingByUuid.has(xml.anafUuid)) continue
    if (!xml.supplier.cui || xml.amounts.brut === null || !xml.issueDate) continue

    const cui = xml.supplier.cui.replace(/^RO/i, '').trim()
    const candidates = kiadasok.filter((k) => {
      if (matchedKiadasIds.has(k.id)) return false
      const kCui = (k.kedvezmenyezett_cui || '').replace(/^RO/i, '').trim()
      return kCui && kCui === cui
    })

    let best: { k: MinimalKiadas; amountDelta: number; dateDelta: number } | null = null
    for (const k of candidates) {
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut)
      if (amountDelta > amountTol) continue
      const dateDelta = daysBetween(k.datum, xml.issueDate)
      if (dateDelta > dateTol) continue
      if (!best || amountDelta + dateDelta * 0.1 < best.amountDelta + best.dateDelta * 0.1) {
        best = { k, amountDelta, dateDelta }
      }
    }

    if (best) {
      matchedKiadasIds.add(best.k.id)
      xmlResults.push({
        anafUuid: xml.anafUuid,
        kiadasId: best.k.id,
        method: 'auto_cui',
        confidence: 'high',
        explanation: `Auto-match CUI alapján: ${xml.supplier.cui} (összeg eltérés: ${best.amountDelta.toFixed(2)} RON, dátum eltérés: ${best.dateDelta.toFixed(0)} nap).`,
      })
      kiadasMatchByXml.set(xml.anafUuid, {
        kiadasId: best.k.id,
        anafUuid: xml.anafUuid,
        method: 'auto_cui',
        confidence: 'high',
      })
    }
  }

  // 3. Gyengébb auto-match: név substring + összeg + dátum
  // A küszöb 0.4-ről 0.3-re csökkentve, mert a substring/szó-match
  // megbízhatóbb mint a Jaccard.
  for (const xml of xmls) {
    if (!xml.anafUuid) continue
    if (kiadasMatchByXml.has(xml.anafUuid)) continue
    if (!xml.supplier.name || xml.amounts.brut === null || !xml.issueDate) continue

    let best: { k: MinimalKiadas; nameSim: number; amountDelta: number; dateDelta: number } | null = null
    for (const k of kiadasok) {
      if (matchedKiadasIds.has(k.id)) continue
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut)
      if (amountDelta > amountTol) continue
      const dateDelta = daysBetween(k.datum, xml.issueDate)
      if (dateDelta > dateTol) continue
      const partner = k.kedvezmenyzett || k.atvevo || ''
      const sim = nameSimilarity(xml.supplier.name, partner)
      if (sim < 0.3) continue // küszöb csökkentve (substring match ad 0.7-0.9-et)
      if (!best || sim > best.nameSim) {
        best = { k, nameSim: sim, amountDelta, dateDelta }
      }
    }

    if (best) {
      const conf: XmlMatchResult['confidence'] =
        best.nameSim >= 0.9 ? 'high' : best.nameSim >= 0.7 ? 'medium' : 'low'
      matchedKiadasIds.add(best.k.id)
      xmlResults.push({
        anafUuid: xml.anafUuid,
        kiadasId: best.k.id,
        method: 'auto_name_amount_date',
        confidence: conf,
        explanation: `Név + összeg + dátum alapján (név hasonlóság: ${(best.nameSim * 100).toFixed(0)}%, összeg eltérés: ${best.amountDelta.toFixed(2)} RON, dátum eltérés: ${best.dateDelta.toFixed(0)} nap).`,
      })
      kiadasMatchByXml.set(xml.anafUuid, {
        kiadasId: best.k.id,
        anafUuid: xml.anafUuid,
        method: 'auto_name_amount_date',
        confidence: conf,
      })
    }
  }

  // 4. CSAK ÖSSZEG + DÁTUM fallback (low confidence) — pl. ha a beszállító
  // név teljesen másképp van rögzítve, vagy a könyvelésben rövidítve van
  // ami nem köthető semelyik szóhoz az XML-ben. Ezt csak akkor mutatjuk,
  // ha az összeg + dátum egyértelmű (pl. EGY kiadás van adott összeggel
  // adott napon — vagy 30 napon belül kifizetve).
  for (const xml of xmls) {
    if (!xml.anafUuid) continue
    if (kiadasMatchByXml.has(xml.anafUuid)) continue
    if (xml.amounts.brut === null || !xml.issueDate) continue

    // Tág tolerancia ide: 0.5 RON, 30 nap (a kifizetés gyakran később van)
    const candidates = kiadasok.filter((k) => {
      if (matchedKiadasIds.has(k.id)) return false
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut!)
      if (amountDelta > amountTol) return false
      const dateDelta = daysBetween(k.datum, xml.issueDate!)
      if (dateDelta > dateTol) return false
      return true
    })

    // Csak akkor matchelünk, ha PONTOSAN 1 jelölt van — egyértelmű
    if (candidates.length === 1) {
      const k = candidates[0]
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut)
      const dateDelta = daysBetween(k.datum, xml.issueDate)
      matchedKiadasIds.add(k.id)
      xmlResults.push({
        anafUuid: xml.anafUuid,
        kiadasId: k.id,
        method: 'auto_name_amount_date',
        confidence: 'low',
        explanation: `Csak összeg + dátum alapján (egyetlen lehetséges jelölt: összeg eltérés: ${amountDelta.toFixed(2)} RON, dátum eltérés: ${dateDelta.toFixed(0)} nap). A névegyezés gyenge — kérlek erősítsd meg a párosítást.`,
      })
      kiadasMatchByXml.set(xml.anafUuid, {
        kiadasId: k.id,
        anafUuid: xml.anafUuid,
        method: 'auto_name_amount_date',
        confidence: 'low',
      })
    }
  }

  // ─── DIAGNOSZTIKA: a maradék (none) XML-ekhez gyűjtsük a jelölteket ───
  const unmatchedXmls = xmls.filter(
    (xml) => xml.anafUuid && !kiadasMatchByXml.has(xml.anafUuid),
  )
  const unmatchedDiag: UnmatchedXmlDiag[] = unmatchedXmls.map((xml) => {
    // Az összes kiadás összegre passzol ±tolerancia. Ha xml.amount NULL,
    // minden kiadást jelölünk (info célra).
    const amountCandidates = kiadasok
      .filter((k) => {
        if (xml.amounts.brut === null) return true
        // Tág tolerancia a diagnosztikához (5 RON), hogy ne maradjon ki közeli
        return Math.abs(k.osszeg - xml.amounts.brut) <= 5
      })
      .map((k) => {
        const partner = k.kedvezmenyzett || k.atvevo || `#${k.id}`
        const sim = nameSimilarity(xml.supplier.name, partner)
        const dateDelta = xml.issueDate ? daysBetween(k.datum, xml.issueDate) : -1
        return {
          kiadasId: k.id,
          partner,
          amount: k.osszeg,
          date: k.datum.slice(0, 10),
          cuiKiadas: k.kedvezmenyezett_cui || null,
          amountDelta:
            xml.amounts.brut !== null ? Math.abs(k.osszeg - xml.amounts.brut) : -1,
          dateDelta,
          nameSimPct: Math.round(sim * 100),
          alreadyMatched: matchedKiadasIds.has(k.id),
        }
      })
      // Sorrend: legkisebb összeg-eltérés, aztán legkisebb dátum-eltérés
      .sort((a, b) => {
        if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta
        return a.dateDelta - b.dateDelta
      })
      .slice(0, 5) // top 5 jelölt minden XML-hez

    return {
      xmlAnafUuid: xml.anafUuid ?? null,
      xmlSupplier: xml.supplier.name,
      xmlCui: xml.supplier.cui,
      xmlAmount: xml.amounts.brut,
      xmlDate: xml.issueDate,
      candidates: amountCandidates,
    }
  })

  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    // Statisztikák a matching sikertelenségéhez
    const xmlsWithoutCui = xmls.filter(x => !x.supplier.cui).length
    const xmlsWithoutAmount = xmls.filter(x => x.amounts.brut === null).length
    const xmlsWithoutDate = xmls.filter(x => !x.issueDate).length
    const kiadasWithoutCui = kiadasok.filter(k => !k.kedvezmenyezett_cui).length
    const kiadasWithoutPartner = kiadasok.filter(k => !k.kedvezmenyzett && !k.atvevo).length

    console.log('[Oblio matcher] Párosítási riport:', {
      summary: {
        totalXmls: xmls.length,
        totalKiadas: kiadasok.length,
        matchedCount: kiadasMatchByXml.size,
        unmatchedCount: unmatchedXmls.length,
        successRate: xmls.length > 0 ? `${Math.round((kiadasMatchByXml.size / xmls.length) * 100)}%` : '0%',
      },
      dataQuality: {
        xmlsWithoutCui,
        xmlsWithoutAmount,
        xmlsWithoutDate,
        kiadasWithoutCui: `${kiadasWithoutCui} / ${kiadasok.length}`,
        kiadasWithoutPartner,
      },
      tolerances: {
        amountTolerance: amountTol,
        dateToleranceDays: dateTol,
      },
      unmatchedDetails: unmatchedDiag,
    })

    // Tippek a felhasználónak (csak ha vannak unmatched-ek)
    if (unmatchedXmls.length > 0) {
      const tips: string[] = []
      if (kiadasWithoutCui > kiadasok.length * 0.5) {
        tips.push(`A kiadások ${Math.round((kiadasWithoutCui / kiadasok.length) * 100)}%-án nincs CUI. A CUI-alapú erős matching nem működik. Töltsd fel a CUI-t a kiadás-szerkesztőben, vagy használj kézi párosítást.`)
      }
      if (xmlsWithoutCui > xmls.length * 0.3) {
        tips.push(`Az XML-ek ${Math.round((xmlsWithoutCui / xmls.length) * 100)}%-án nincs beszállítói CUI — ezek nem CUI-alapon, csak név+összeg+dátum alapján párosíthatóak.`)
      }
      if (tips.length > 0) {
        console.log('[Oblio matcher] Tippek a sikertelenség okára:', tips)
      }
    }
  }

  // 5. Maradék XML-ek nincs matchelve
  for (const xml of xmls) {
    if (!xml.anafUuid) continue
    if (kiadasMatchByXml.has(xml.anafUuid)) continue
    xmlResults.push({
      anafUuid: xml.anafUuid,
      kiadasId: null,
      method: 'none',
      confidence: 'none',
      explanation: 'Nincs párosítható kiadás (kézi hozzárendelés szükséges, vagy a kiadás még nincs rögzítve).',
    })
  }

  // 6. Kiadás-oldali nézet
  const kiadasResults: KiadasMatchResult[] = kiadasok.map((k) => {
    // Megkeressük, melyik XML választotta ki
    const matchingXml = [...kiadasMatchByXml.values()].find((m) => m.kiadasId === k.id)
    if (matchingXml) return matchingXml
    return {
      kiadasId: k.id,
      anafUuid: null,
      method: 'none',
      confidence: 'none',
    }
  })

  return { xmlResults, kiadasResults, unmatchedDiag }
}
