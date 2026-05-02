/**
 * Cég/intézmény-detektálás a Kassza/XML "Forrása" / "Név" stringek alapján.
 *
 * A pénzügyi import során a befizetők egy része magánszemély, másik része
 * cég/intézmény. A magánszemélyeket a tagnyilvántartáshoz kötjük (id_szemely
 * FK), a cég/intézmény-jellegű tételeket csak a `befizetes.forrasa` szöveges
 * mezőben tartjuk meg, és külön cég-listát képezünk az import-eredmény végén.
 *
 * 2026-05-02 (Fázis 2): a regex-set a valós EREK Kassza 2025 adatokra
 * lett kalibrálva.
 *
 * **Kritikus szempont**: a magyar szövegben az ASCII `\b` szóhatár megbízhatatlan
 * az `é`, `á`, `í` stb. unicode betűk mellett. Ezért a rövid cégformákat
 * (RT, BT, SA, KFT, SRL) **token-szinten** ellenőrizzük: a stringet szóközökkel
 * felbontjuk, és minden tokenre vizsgáljuk az illeszkedést. Így "Lénárt Rita"
 * nem fog tévesen RT-cégnek minősülni.
 *
 * Detektálási típusok a 2025-os Kasszában (37 egyedi cég):
 *   - "INTERNATIONAL PAPER BUSINESS SRL"  → SRL suffix
 *   - "S.C. LEROY MERLIN ROMANIA SRL"     → SC prefix + SRL suffix
 *   - "CN POSTA ROMANIA SA"               → CN prefix + SA suffix
 *   - "Kis Z.Zoltan PFA"                  → PFA token
 *   - "FUNDATIA KOEN"                     → Fundatia prefix
 *   - "Parohia Reformata Borosneu Mare"   → Parohia prefix
 *   - "DEPUNERE NUMERAR" / "Depunere numerar" → DEPUNERE prefix
 *   - "Referinta 250108S744931084"        → Referinta prefix
 *   - "ATCT", "ATM"                       → CSUPA NAGYBETŰ (≤4 char)
 */

/**
 * Önálló-tokenként vizsgált cégforma-minták.
 * A token = a string szóközökkel elválasztott darabja.
 */
const TOKEN_COMPANY_FORMS = [
  /^S\.?R\.?L\.?$/i, // SRL
  /^S\.?A\.?$/i, // SA
  /^SCM$/i,
  /^PFA$/i,
  /^IF$/i, // Întreprindere Familială (csak elszigetelt token)
  /^IN[ŞS][AĂ]$/i,
  /^KFT$/i,
  /^BT$/i,
  /^RT$/i,
  /^ZRT$/i,
  /^NYRT$/i,
  /^KKT$/i,
]

/**
 * Stringben (egészként) vizsgált prefix-minták.
 */
const STRING_PREFIX_PATTERNS = [
  /^S\.?C\.?\s/i, // SC vagy S.C. prefix
  /^FUNDA[ŢȚT]I[AĂ]\s/i, // Fundația / Fundatia
  /^PAROHIA\s/i,
  /^COMUNA\s/i,
  /^ASOCIA[ŢȚT]I[AĂ]\s/i,
  /^PRIM[ĂA]RIA\s/i,
  /^CN\s/i, // CN — Compania Națională
  /^CREAN[ŢȚT]ELE?\b/i, // Creanțele bugetelor locale
  /^Pago\*/i,
  /^Referinta\s/i,
  /^DEPUNERE\b/i,
  /^Depunere\b/,
  /^TRANSFER\b/i,
]

/**
 * Csupa nagybetűs intézmény-szerű minta (rövid, max 6 char, csak ha nincs " - ").
 * Példa: "ATCT", "ATM", "TEGA".
 */
const ALL_CAPS_INSTITUTION = /^[A-Z][A-Z0-9&]{1,5}$/

/**
 * Igaz, ha a megadott név cég/intézmény/banki referencia.
 */
export function detectCompany(name: string): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false

  // 1. String-szintű prefix-szabályok (Fundatia, Parohia, SC, Referinta, Depunere)
  if (STRING_PREFIX_PATTERNS.some((p) => p.test(trimmed))) {
    return true
  }

  // 2. Token-szintű cégforma (SRL, SA, PFA, KFT, BT, RT stb. mint különálló szó)
  const tokens = trimmed.split(/[\s.]+/).filter((t) => t.length > 0)
  if (tokens.some((t) => TOKEN_COMPANY_FORMS.some((p) => p.test(t)))) {
    return true
  }

  // 3. Csupa nagybetűs rövidítés (csak ha nincs " - " kötőjel-cím, és rövid)
  if (!trimmed.includes(' - ') && ALL_CAPS_INSTITUTION.test(trimmed)) {
    return true
  }

  return false
}

/* ───────────────────────────────────────────────────────────────────────
 * @testdata — manuális ellenőrzéshez
 *
 * Cégek (várt: true):
 *   detectCompany('INTERNATIONAL PAPER BUSINESS SRL')      // → true
 *   detectCompany('ARLERO DIGITAL PRESS SRL')              // → true
 *   detectCompany('S.C. LEROY MERLIN ROMANIA SRL')         // → true
 *   detectCompany('CN POSTA ROMANIA SA')                   // → true
 *   detectCompany('Kis Z.Zoltan PFA')                      // → true
 *   detectCompany('FUNDATIA KOEN')                         // → true
 *   detectCompany('Parohia Reformata Borosneu Mare')       // → true
 *   detectCompany('DEPUNERE NUMERAR')                      // → true
 *   detectCompany('Referinta 250108S744931084')            // → true
 *   detectCompany('ATCT')                                  // → true
 *   detectCompany('ATM')                                   // → true
 *
 * Magánszemélyek (várt: false):
 *   detectCompany('Beder Győzőné Elvira - Főút 27')         // → false
 *   detectCompany('Szőcs Endre - Parókia 214')             // → false
 *   detectCompany('Kiss Csabáné Lénárt Rita - Főút 33')    // → false (Lénárt nem RT-cég!)
 *   detectCompany('Bajkó Szende')                          // → false
 *   detectCompany('Mihailescu Rozalia')                    // → false
 *   detectCompany('Nagy Sándor és cs.')                    // → false
 * ─────────────────────────────────────────────────────────────────────── */
