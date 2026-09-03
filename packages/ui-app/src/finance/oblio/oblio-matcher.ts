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
  /** A kiadás pénzneme, ha ismert (alapértelmezés: RON). */
  currency?: string | null
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
  'srl-d',
  'sa',
  's.a.',
  's.r.l.',
  'pfa',
  'i.i.',
  'i.f.',
  'snc',
  'scs',
  'kft',
  'rt',
  'zrt',
]

/**
 * Általános, megkülönböztető erővel NEM bíró cég-szótövek. Egy ilyen
 * egyetlen közös szó (pl. "construct", "trans", "total") önmagában NEM
 * jelent céget — különben fals pozitív párosítás keletkezne.
 */
const GENERIC_NAME_STEMS = new Set([
  'construct', 'constructii', 'trans', 'transport', 'comert', 'comserv',
  'comimpex', 'impex', 'total', 'prod', 'product', 'productie', 'grup',
  'group', 'company', 'invest', 'consulting', 'service', 'servicii',
  'distributie', 'distribution', 'romania', 'international', 'global',
  'asociatia', 'fundatia', 'societatea',
])

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
    s = s.replace(new RegExp(`\\b${suffix.replace(/[.()-]/g, '\\$&')}\\b`, 'g'), '')
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * CUI egységes normalizálása — RO-prefix, írásjelek, szóközök és vezető
 * nullák levágása. Így a "RO 12.345" és a "12345" azonosnak számít.
 */
function normalizeCui(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.toUpperCase().replace(/^RO/, '').replace(/\D/g, '')
  return digits.replace(/^0+/, '')
}

/**
 * RON-e a pénznem? A hiányzó pénznemet RON-nak vesszük (a könyvelés RON-ban
 * van). Az ANAF "LEI" jelölést is RON-ként kezeljük.
 */
export function isRon(cur: string | null | undefined): boolean {
  if (!cur) return true
  const c = cur.trim().toUpperCase()
  return c === 'RON' || c === 'LEI'
}

/** Szóhatáron illeszkedik-e a `needle` a `haystack`-ben? */
function wordBoundarySubstring(haystack: string, needle: string): boolean {
  if (!needle) return false
  const re = new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
  return re.test(haystack)
}

/**
 * Substring + szó-egyezés alapú név match. Sokkal megengedőbb mint a
 * Jaccard-hasonlóság, mert a könyvelésben gyakran rövid névvel szerepel
 * ("Electrica"), míg az XML-ben hosszú a hivatalos név
 * ("Societatea Electrica Furnizare S.A.").
 *
 * Visszaadási értékek:
 *   - 1.0 = teljes egyezés
 *   - 0.9 = az egyik (>=6 char) szóhatáron teljesen benne van a másikban
 *   - 0.85 = legalább 2 közös szignifikáns (4+ char, nem generikus) szó
 *   - 0.7 = pontosan 1 közös szignifikáns szó
 *   - <0.7 = közös szavak Jaccard-aránya
 *   - 0.0 = nincs egyezés
 *
 * 2026-06-14 (P1-4): szigorítva a fals pozitívok ellen — a substring már csak
 * >=6 karakteres, szóhatáron illeszkedő névre ad 0.9-et, és az általános
 * cég-szótövek (construct, trans, total, …) nem számítanak szignifikáns szónak.
 */
function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  // Substring match — csak ha a rövidebb név elég hosszú (>=6) ÉS szóhatáron
  // illeszkedik a hosszabbon belül (nem ad pl. "total" → bármi 0.9-et).
  const shorter = na.length <= nb.length ? na : nb
  const longer = shorter === na ? nb : na
  if (shorter.length >= 6 && wordBoundarySubstring(longer, shorter)) return 0.9

  // Szignifikáns szó-egyezés — 4+ char ÉS nem általános cég-szótő.
  const wordsA = na.split(' ').filter((w) => w.length >= 4 && !GENERIC_NAME_STEMS.has(w))
  const wordsB = nb.split(' ').filter((w) => w.length >= 4 && !GENERIC_NAME_STEMS.has(w))
  const sigCommon = wordsA.filter((w) => wordsB.includes(w))
  if (sigCommon.length >= 2) return 0.85
  if (sigCommon.length === 1) return 0.7

  // Jaccard fallback (minden szó)
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

/**
 * Előjeles nap-különbség: `kiadasDatum - issueDate` napban.
 * Pozitív = a kiadás (kifizetés) a számla kibocsátása UTÁN van (normális eset),
 * negatív = a kiadás a számla előtt (előleg — csak kis tűréssel reális).
 */
function signedDaysBetween(kiadasDatum: string, issueDate: string): number {
  const dk = new Date(kiadasDatum + 'T00:00:00Z').getTime()
  const di = new Date(issueDate + 'T00:00:00Z').getTime()
  if (!Number.isFinite(dk) || !Number.isFinite(di)) return Number.POSITIVE_INFINITY
  return (dk - di) / 86_400_000
}

/** Irányérzékeny dátum-ablak: kis előleg-tűrés (-5 nap), nagy kifizetés-tűrés. */
const DATE_FLOOR_DAYS = -5

/**
 * Méret-arányos összeg-tolerancia: nagy számláknál a fix 1 RON túl szigorú,
 * kicsiknél túl tág. max(1 RON, az összeg 0.1%-a).
 */
function amountToleranceFor(amount: number, baseTol: number): number {
  return Math.max(baseTol, Math.abs(amount) * 0.001)
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
    // P1-1: deviza-számlát (nem RON) NEM párosítunk automatikusan — a RON-os
    // összeggel való összevetés értelmetlen. Kézi párosításra hagyjuk.
    if (!isRon(xml.currency)) continue
    // P1-2: jóváíró/sztornó (CreditNote) számlát NEM párosítunk automatikusan —
    // az előjel automatikus kezelése nem biztonságos, kézi megerősítést igényel.
    if (xml.documentType === 'credit_note') continue

    const cui = normalizeCui(xml.supplier.cui)
    if (!cui) continue
    const amountTolX = amountToleranceFor(xml.amounts.brut, amountTol)
    const candidates = kiadasok.filter((k) => {
      if (matchedKiadasIds.has(k.id)) return false
      return normalizeCui(k.kedvezmenyezett_cui) === cui
    })

    let best: { k: MinimalKiadas; amountDelta: number; dateDelta: number; cost: number } | null = null
    let secondBestCost = Number.POSITIVE_INFINITY
    for (const k of candidates) {
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut)
      if (amountDelta > amountTolX) continue
      const signed = signedDaysBetween(k.datum, xml.issueDate)
      if (signed < DATE_FLOOR_DAYS || signed > dateTol) continue
      const dateDelta = Math.abs(signed)
      const cost = amountDelta + dateDelta * 0.1
      if (!best || cost < best.cost) {
        if (best) secondBestCost = best.cost
        best = { k, amountDelta, dateDelta, cost }
      } else if (cost < secondBestCost) {
        secondBestCost = cost
      }
    }

    if (best) {
      // P1-3: ha két jelölt szinte azonos „költséggel" verseng ugyanazért az
      // azonos CUI-jú számláért (pl. két azonos összegű havi díj), a párosítás
      // kétértelmű — ne adjunk „biztos" szintet, hanem kérjünk megerősítést.
      const ambiguous = secondBestCost - best.cost < 0.5
      matchedKiadasIds.add(best.k.id)
      xmlResults.push({
        anafUuid: xml.anafUuid,
        kiadasId: best.k.id,
        method: 'auto_cui',
        confidence: ambiguous ? 'low' : 'high',
        explanation: ambiguous
          ? `CUI egyezik (${xml.supplier.cui}), de több azonos összegű/dátumú kiadás is illeszkedik — kérlek erősítsd meg a párosítást.`
          : `Auto-match CUI alapján: ${xml.supplier.cui} (összeg eltérés: ${best.amountDelta.toFixed(2)} RON, dátum eltérés: ${best.dateDelta.toFixed(0)} nap).`,
      })
      kiadasMatchByXml.set(xml.anafUuid, {
        kiadasId: best.k.id,
        anafUuid: xml.anafUuid,
        method: 'auto_cui',
        confidence: ambiguous ? 'low' : 'high',
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
    if (!isRon(xml.currency)) continue // P1-1: deviza-számla nem auto
    if (xml.documentType === 'credit_note') continue // P1-2: sztornó nem auto

    const amountTolX = amountToleranceFor(xml.amounts.brut, amountTol)
    let best: { k: MinimalKiadas; nameSim: number; amountDelta: number; dateDelta: number } | null = null
    for (const k of kiadasok) {
      if (matchedKiadasIds.has(k.id)) continue
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut)
      if (amountDelta > amountTolX) continue
      const signed = signedDaysBetween(k.datum, xml.issueDate)
      if (signed < DATE_FLOOR_DAYS || signed > dateTol) continue
      const dateDelta = Math.abs(signed)
      const partner = k.kedvezmenyzett || k.atvevo || ''
      const sim = nameSimilarity(xml.supplier.name, partner)
      if (sim < 0.3) continue // küszöb csökkentve (substring match ad 0.7-0.9-et)
      // P1-3: azonos név-hasonlóságnál a kisebb összeg+dátum eltérés nyer (nem
      // pusztán a tömb-sorrend), így determinisztikus és pontosabb a választás.
      if (
        !best ||
        sim > best.nameSim ||
        (sim === best.nameSim &&
          amountDelta + dateDelta * 0.1 < best.amountDelta + best.dateDelta * 0.1)
      ) {
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
  // P3-1: a csak-összeg+dátum ágban szűkebb dátum-ablak (max 30 nap), mert itt
  // nincs név/CUI megerősítés, így a tévedés kockázata nagyobb.
  const dateTol4 = Math.min(30, dateTol)
  for (const xml of xmls) {
    if (!xml.anafUuid) continue
    if (kiadasMatchByXml.has(xml.anafUuid)) continue
    if (xml.amounts.brut === null || !xml.issueDate) continue
    if (!isRon(xml.currency)) continue // P1-1: deviza-számla nem auto
    if (xml.documentType === 'credit_note') continue // P1-2: sztornó nem auto

    const amountTolX = amountToleranceFor(xml.amounts.brut, amountTol)
    const candidates = kiadasok.filter((k) => {
      if (matchedKiadasIds.has(k.id)) return false
      const amountDelta = Math.abs(k.osszeg - xml.amounts.brut!)
      if (amountDelta > amountTolX) return false
      const signed = signedDaysBetween(k.datum, xml.issueDate!)
      if (signed < DATE_FLOOR_DAYS || signed > dateTol4) return false
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
    let explanation =
      'Nincs párosítható kiadás (kézi hozzárendelés szükséges, vagy a kiadás még nincs rögzítve).'
    if (xml.documentType === 'credit_note') {
      explanation =
        'Jóváíró / sztornó számla — az automatikus párosítást szándékosan kihagytuk (az előjel kezelése nem biztonságos). Kérlek kézzel rendeld a megfelelő kiadáshoz.'
    } else if (!isRon(xml.currency)) {
      explanation = `Deviza-számla (${xml.currency}) — az automatikus, RON-alapú párosítást kihagytuk. Kérlek kézzel ellenőrizd és párosítsd.`
    }
    xmlResults.push({
      anafUuid: xml.anafUuid,
      kiadasId: null,
      method: 'none',
      confidence: 'none',
      explanation,
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
