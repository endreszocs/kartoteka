/**
 * Tagnyilvántartás-hibák validációs motor
 * ----------------------------------------
 * Pure functions — input: tagok listája, output: hibák listája.
 *
 * Súlyosság-rendszer:
 *   - **critical**: a rekord alapvető működéséhez nélkülözhetetlen (vezetéknév,
 *                   keresztnév, születési dátum logikai sérülés)
 *   - **medium**:   az anyakönyvi/pasztorális munkát akadályozza (anyja neve,
 *                   lakcím, formátumhibás email/telefon, duplikáció)
 *   - **warning**:  finom adattisztasági jelzés (pl. irreálisan régi sz_datum)
 *
 * A modul NEM ír DB-be — a `validation-actions.ts` server action veszi át a
 * kimenetet és INSERT/UPDATE-eli a `member_validation_errors` táblát.
 */

import type { MemberRow } from '@/lib/constants/members'

export type ValidationSeverity = 'critical' | 'medium' | 'warning'
export type ValidationErrorType = 'missing' | 'format' | 'logic' | 'duplicate'

export interface ValidationError {
  member_id: number
  field_name: string
  error_type: ValidationErrorType
  error_message: string
  severity: ValidationSeverity
  duplicate_of_member_id?: number
}

/**
 * EGY FELOLDHATATLAN TELEPÜLÉS — a Hibák fül EGYETLEN tétele (2026-08-11).
 *
 * ⚠️ MIÉRT NEM TAGONKÉNT (ez a mérés, nem ízlés): a defekt is, a javítás is
 *    TELEPÜLÉS-szintű — egyetlen `adrlocality`-sorból hiányzik a hivatalos név.
 *    Ha tagonként írnánk ki, Barátos léptékében 549 szó szerint AZONOS `medium`
 *    sor születne (a mért adat: „Barátoson 549 tag él"), ami a `medium` KPI-t és
 *    a listát is maga alá temetné — minden VALÓDI hibával együtt. A lelkésznek
 *    egy teendője van, tehát egy sort lát; a sor megmondja, hány tagot érint.
 */
export interface TerkepTelepulesHiba {
  /** A település nyilvántartásbeli (MAGYAR) neve — ezt ismeri fel a lelkész. */
  nev: string
  /** Ennek a tagnak a sorára kerül a tétel (a legkisebb érintett tag-id). */
  gazdaTagId: number
  /** Hány élő tag címét érinti ugyanez az egy hiányzó törzsadat. */
  erintettTagok: number
}

/**
 * KONTEXTUS (2026-08-11) — amit a motor önmagából NEM tudhat.
 *
 * A „megtalálja-e a térkép ezt a címet?" kérdés JOIN-t igényel
 * (`adrlocality → adrcounty → adrcountry` + az egyeztetett pont oszlopai), a
 * motor viszont SZÁNDÉKOSAN tiszta: nem olvas adatbázist, ezért önmagában
 * tesztelhető marad. A hívó (`validation-actions.ts`) számolja ki, és ADJA ÁT.
 *
 * ⚠️ A `feloldhatatlanTelepulesek` KÉSZRE SZŰRVE érkezik: csak olyan település
 *    kerülhet bele, amely (a) a térképen tényleg nem oldható fel, ÉS
 *    (b) BIZONYÍTHATÓAN romániai. A külföldi települések (Budapest, Debrecen,
 *    Gödöllő, Győr, Hollandia) SOHA nincsenek benne — azokat a térkép a saját
 *    nevükön megtalálja, tehát a címük nem hibás. A szűrés egyetlen helyen, a
 *    `lib/members/directions.ts` `shouldReportUnresolvableLocality`-jában él.
 *    A `gazdaTagId` szintén készen érkezik: a hívó ott zárja ki azokat a
 *    tagokat, akiknek az UTCÁJÁN már van egyeztetett pont (nekik az útvonal a
 *    település hiánya ellenére is a házig visz).
 */
/**
 * HELYKITÖLTŐ TELEPÜLÉS — ugyanaz az alak, MÁS jelentés (2026-08-11).
 *
 * A `nev` itt nem egy falu neve, hanem az, AMI A TÖRZSBEN ÁLL helyette („?").
 * A `gazdaTagId` és az `erintettTagok` szerepe azonos: egyetlen sor áll a
 * listában, és az megmondja, hányan érintettek.
 */
export type HelykitoltoTelepulesHiba = TerkepTelepulesHiba

export interface ValidationContext {
  /** Település-id → a hozzá tartozó EGYETLEN tétel leírása. */
  feloldhatatlanTelepulesek?: Map<number, TerkepTelepulesHiba>
  /**
   * Település-id → helykitöltő („?") sor. A hívó KÉSZRE SZŰRVE adja át
   * (`lib/members/directions.ts` → `isPlaceholderLocality`), és ugyanaz a
   * szűrés zárja ki ezeket a `feloldhatatlanTelepulesek`-ből, hogy egyetlen
   * tag se kapjon KÉT tételt ugyanarra a címre.
   */
  helykitoltoTelepulesek?: Map<number, HelykitoltoTelepulesHiba>
  /**
   * Utca-id → település-id. Sok import-örökség soron a `c_helysegid` NULL,
   * miközben a `c_utcaid` pontosan tudja a települést — e nélkül azoknál a
   * tagoknál némán elmaradna a jelzés.
   */
  utcaTelepulesId?: Map<number, number>
}

// ── Helper-ek ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Romániai telefon-szám tűrő minta — vezető 0 vagy +40, 9-10 számjegy,
// szóközök/kötőjelek megengedettek.
const PHONE_RE = /^[+\d][\d\s\-/().]{6,20}$/
// 2026-07-24 (PR-9): a cnp mező EGYHÁZI belső azonosító (EC-ÉÉÉÉ-… is érvényes),
// NEM az állami CNP — formátum-ellenőrzés nincs. Ez a regex már CSAK a
// duplikátum-kereséshez él: a valódi (13 számjegyű) állami CNP-k ütközését
// jelzi; a generált egyházi azonosítók egyediségét a DB partial-unique index védi.
const CNP_RE = /^\d{13}$/

function isPlainText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function yearsAgo(dateStr: string): number {
  const today = new Date()
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 0
  let diff = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) diff--
  return diff
}

// ── Egyetlen tag validálása ─────────────────────────────────────────────────

/**
 * A tag TÉNYLEGES települése: elsődlegesen a `c_helysegid`, tartalékként az
 * utcán keresztül. (Ugyanaz a fallback, mint a karton cím-lekérdezésében.)
 */
function resolveMemberLocalityId(member: MemberRow, context: ValidationContext): number | null {
  if (typeof member.c_helysegid === 'number') return member.c_helysegid
  if (typeof member.c_utcaid === 'number') return context.utcaTelepulesId?.get(member.c_utcaid) ?? null
  return null
}

export function validateMember(member: MemberRow, context: ValidationContext = {}): ValidationError[] {
  const errors: ValidationError[] = []
  const id = member.id

  // ── KÖTELEZŐ MEZŐK ──
  if (!isPlainText(member.csaladnev)) {
    errors.push({
      member_id: id,
      field_name: 'csaladnev',
      error_type: 'missing',
      error_message: 'Hiányzik a vezetéknév.',
      severity: 'critical',
    })
  }
  if (!isPlainText(member.k_nev)) {
    errors.push({
      member_id: id,
      field_name: 'k_nev',
      error_type: 'missing',
      error_message: 'Hiányzik a keresztnév.',
      severity: 'critical',
    })
  }
  if (!member.sz_datum) {
    errors.push({
      member_id: id,
      field_name: 'sz_datum',
      error_type: 'missing',
      error_message: 'Hiányzik a születési dátum.',
      severity: 'critical',
    })
  }
  if (!isPlainText(member.anyjaneve)) {
    errors.push({
      member_id: id,
      field_name: 'anyjaneve',
      error_type: 'missing',
      error_message: 'Hiányzik az anyja neve (anyakönyvi adatokhoz szükséges).',
      severity: 'medium',
    })
  }

  // Lakcím — csak akkor jelez, ha SE helység, SE utca nincs
  if (!member.c_helysegid && !member.c_utcaid) {
    errors.push({
      member_id: id,
      field_name: 'lakcim',
      error_type: 'missing',
      error_message: 'Hiányzik a lakcím (helység vagy utca).',
      severity: 'medium',
    })
  }

  // ── A CÍMET A TÉRKÉP NEM TALÁLJA (2026-08-11) ──────────────────────────
  //
  // MIÉRT `medium` ÉS NEM `critical`: a `critical` a rekord ALAPVETŐ
  // működését érinti (név, születési dátum) — anélkül a tag nem azonosítható,
  // nem anyakönyvezhető. Egy nehezen megtalálható cím nem ilyen: a tag
  // azonosítható, a járuléka könyvelhető, az anyakönyve vezethető. A `medium`
  // saját definíciója viszont szó szerint ezt az esetet írja le: „az
  // anyakönyvi/pasztorális munkát akadályozza (… lakcím …)" — a lelkész
  // családlátogatáskor ténylegesen elakad tőle. Felfújni kártékony lenne: a
  // `critical` szám a Hibák fül legfelső KPI-ja, amire azonnal reagálni kell.
  //
  // MIÉRT `format` ÉS NEM `missing`: a tag rekordjából SEMMI nem hiányzik —
  // a település ki van választva. Ami hiányzik, az a címtörzs hivatalos
  // (román) alakja, vagyis a rögzített cím nem hozható a térkép által
  // értelmezhető FORMÁRA. Gyakorlati haszna is van: a `field_name` így
  // maradhat `lakcim` (ezt látja és ezt javítja a lelkész a kartonon)
  // ÜTKÖZÉS NÉLKÜL a fenti „Hiányzik a lakcím" tétellel — a
  // `validation-actions` kulcsa `member_id|field_name|error_type|dup`.
  //
  // MIÉRT CSAK A „GAZDA" TAGNÁL: lásd a `TerkepTelepulesHiba` fejlécét. A tétel
  // TELEPÜLÉSENKÉNT EGY, és a legkisebb id-jű ÉRINTETT tag sorára kerül — ő a
  // fogantyú, amin keresztül a lelkész eljut a kartonra és az egyeztető ablakba.
  const localityId = resolveMemberLocalityId(member, context)
  const gond = localityId !== null ? context.feloldhatatlanTelepulesek?.get(localityId) : undefined
  if (gond && gond.gazdaTagId === id) {
    const tobbiek =
      gond.erintettTagok > 1
        ? `Ez a hiányzó törzsadat ${gond.erintettTagok} tag címét érinti, de EGYSZER kell javítani — ezért csak ez az egy sor áll itt. `
        : ''
    errors.push({
      member_id: id,
      field_name: 'lakcim',
      error_type: 'format',
      error_message:
        `A térkép nem találja meg ezt a települést: „${gond.nev}". ` +
        tobbiek +
        'Nyisd meg a személyi kartont → Elérhetőségek → „Cím egyeztetése", és erősítsd meg a helyet a térképen. ' +
        'Egyszer elég: onnantól a település minden tagjának jó lesz az útvonala.',
      severity: 'medium',
    })
  }

  // ── HIÁNYZIK A TELEPÜLÉS: „?" HELYKITÖLTŐ A CÍMBEN (2026-08-11) ─────────
  //
  // A MÉRT ESET: élesben 70 ÉLŐ TAG címe egy „?" NEVŰ `adrlocality` sorra
  // mutat. Ez a gyülekezet LEGNAGYOBB egyetlen adathiba-csoportja.
  //
  // MIÉRT NEM FOGJA MEG A FENTI „Hiányzik a lakcím": az NULL-ra tesztel, nem
  // ÉRTELMESSÉGRE — ezeknek a tagoknak KI VAN TÖLTVE a `c_helysegid`/
  // `c_utcaid`, csak épp egy helykitöltőre. Látszólag van címük.
  //
  // MIÉRT NEM „a térkép nem találja": az a tétel a „Cím egyeztetése" gombra
  // küld, ami EGYETLEN koordinátát ír a település sorára. A „?"-en elvégezve
  // 70 különböző valódi lakcímet szegeznénk egy hamis pontra, és a probléma
  // VÉGLEG elnémulna. Igaz mondat, romboló utasítással — az rosszabb, mint a
  // hallgatás.
  //
  // MIÉRT `medium`: a `medium` saját definíciója szó szerint ezt írja le — „az
  // anyakönyvi/pasztorális munkát akadályozza (… lakcím …)". A lelkész ezt a
  // 70 tagot NEM TUDJA MEGLÁTOGATNI: nem tudja, melyik faluban laknak. Nem
  // `critical`, mert a rekord alapvetően működik (a tag azonosítható,
  // anyakönyvezhető, a járuléka könyvelhető) — a `critical` a Hibák fül
  // legfelső KPI-ja, amire azonnal reagálni kell, és felfújva pont azt a
  // számot rontanánk el, ami a valódi vészhelyzeteket jelzi. Nem is `warning`:
  // ez nem adattisztasági finomság, hanem 70 hiányzó lakcím.
  //
  // MIÉRT EGY SOR ÉS NEM 70: a Hibák fül elárasztása ugyanaz a kár, mint a
  // hamis jelzés — 70 azonos `medium` sor minden VALÓDI hibát maga alá temetne.
  // ⚠️ DE A JAVÍTÁS ITT TAGONKÉNTI (a térkép-tétellel ELLENTÉTBEN, ahol egy
  //    javítás mindenkit rendbe tesz) — ezért az üzenet ezt KIMONDJA, a
  //    számláló pedig minden újraellenőrzésnél fogy, és mindig egy új „gazda"
  //    tag kerül a sorba. Így a lelkész egy folyamatosan rövidülő munkasort
  //    kap, nem egy megbénult listát.
  // ⚑ 2026-08-11 — AZ ÜZENET KIJÁRATOT IS AD. Az egy-sor-per-futás forma
  //    önmagában 70 teljes újraellenőrzést jelentene (gyülekezet + minden
  //    település + minden utca), csak hogy kiderüljön, ki a következő. Ezért a
  //    Hibák fülön a sor mellett ott a „Mutasd mindet" gomb, ami a Személyek
  //    fülre visz, település-szűrővel — az üzenet erre hivatkozik.
  const helykitolto =
    localityId !== null ? context.helykitoltoTelepulesek?.get(localityId) : undefined
  if (helykitolto && helykitolto.gazdaTagId === id) {
    const tobbiek =
      helykitolto.erintettTagok > 1
        ? `Összesen ${helykitolto.erintettTagok} tagot érint, és — a térkép-hibákkal ellentétben — MINDEGYIKET külön kell pótolni: ők mind máshol laknak. A „Mutasd mindet" gombbal egyszerre kilistázhatod az összes érintettet a Személyek fülön. Ez a sor mindig a soron következő tagot mutatja, és a szám minden újraellenőrzés után fogy. `
        : ''
    errors.push({
      member_id: id,
      field_name: 'lakcim',
      error_type: 'logic',
      error_message:
        'Ebből a lakcímből hiányzik a település: a címtörzsben csak egy helykitöltő ' +
        `(„${helykitolto.nev}") áll, nem valódi helység. ` +
        tobbiek +
        'Nyisd meg a személyi kartont → Elérhetőségek, és válaszd ki a tényleges települést. ' +
        'A térképpel ezt NEM lehet egyeztetni — előbb a település kell.',
      severity: 'medium',
    })
  }

  // ── FORMÁTUM-HIBÁK ──
  if (member.email && !EMAIL_RE.test(member.email.trim())) {
    errors.push({
      member_id: id,
      field_name: 'email',
      error_type: 'format',
      error_message: `Hibás e-mail formátum: "${member.email}".`,
      severity: 'medium',
    })
  }
  if (member.telefon && !PHONE_RE.test(member.telefon.trim())) {
    errors.push({
      member_id: id,
      field_name: 'telefon',
      error_type: 'format',
      error_message: `Szokatlan telefonszám-formátum: "${member.telefon}".`,
      severity: 'warning',
    })
  }
  // 2026-07-24 (PR-9, RENDSZERSZINTŰ DÖNTÉS): a `cnp` mező a rendszerben
  // NEM az állami román CNP, hanem az EGYHÁZI belső, személyenként egyedi
  // azonosító (EC-ÉÉÉÉ-XXXX formátum is teljesen érvényes). Ezért a
  // "13 számjegy" formátum-ellenőrzés TELJESEN KIKERÜLT — árasztotta a
  // Hibák fület ál-hibákkal minden importált tagra. A cnp egyediségét a
  // partial-unique index védi (nem itt). Lásd: memory/cnp_egyhazi_azonosito.
  // (A régi, még nyitott CNP-formátumhibákat a legközelebbi „Hibák
  // újraellenőrzése" automatikusan RESOLVED-re állítja.)

  // ── LOGIKAI HIBÁK ──
  if (member.sz_datum) {
    const d = new Date(member.sz_datum)
    if (!Number.isNaN(d.getTime())) {
      if (d > new Date()) {
        errors.push({
          member_id: id,
          field_name: 'sz_datum',
          error_type: 'logic',
          error_message: 'A születési dátum a jövőben van.',
          severity: 'critical',
        })
      } else {
        const age = yearsAgo(member.sz_datum)
        if (age > 130) {
          errors.push({
            member_id: id,
            field_name: 'sz_datum',
            error_type: 'logic',
            error_message: `Irreálisan régi születési dátum (${age} év).`,
            severity: 'warning',
          })
        }
      }
    } else {
      errors.push({
        member_id: id,
        field_name: 'sz_datum',
        error_type: 'format',
        error_message: `A születési dátum nem értelmezhető: "${member.sz_datum}".`,
        severity: 'medium',
      })
    }
  }

  return errors
}

// ── Duplikáció-detektor (összes tag alapján) ────────────────────────────────

/**
 * A duplikációk csak a teljes lista ismeretében detektálhatók.
 * Visszaadja: minden talált gyanús párt EGYSZER, az alacsonyabb id-t kapja
 * az "elsődleges" hiba (a magasabb id-t mint `duplicate_of_member_id`).
 *
 * Detektor-szabályok:
 *   1. CNP egyezés (a CNP elvileg egyedi → ha kettő ugyanaz, az kritikus)
 *   2. Email egyezés (medium)
 *   3. Név + sz_datum egyezés (medium — gyakori adatduplikáció)
 */
export function findDuplicates(members: MemberRow[]): ValidationError[] {
  const errors: ValidationError[] = []

  // 1. CNP duplikációk
  const byCnp = new Map<string, MemberRow[]>()
  for (const m of members) {
    if (m.cnp && CNP_RE.test(m.cnp.trim())) {
      const key = m.cnp.trim()
      const arr = byCnp.get(key) || []
      arr.push(m)
      byCnp.set(key, arr)
    }
  }
  for (const [, group] of byCnp) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.id - b.id)
    const primary = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      errors.push({
        member_id: primary.id,
        field_name: 'cnp',
        error_type: 'duplicate',
        error_message: `Másik taggal azonos CNP: "${primary.cnp}" (#${sorted[i].id}: ${sorted[i].csaladnev || '?'} ${sorted[i].k_nev || ''}).`,
        severity: 'critical',
        duplicate_of_member_id: sorted[i].id,
      })
    }
  }

  // 2. Email duplikációk (csak ha az email valid)
  const byEmail = new Map<string, MemberRow[]>()
  for (const m of members) {
    if (m.email && EMAIL_RE.test(m.email.trim())) {
      const key = m.email.trim().toLowerCase()
      const arr = byEmail.get(key) || []
      arr.push(m)
      byEmail.set(key, arr)
    }
  }
  for (const [, group] of byEmail) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.id - b.id)
    const primary = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      errors.push({
        member_id: primary.id,
        field_name: 'email',
        error_type: 'duplicate',
        error_message: `Másik tag email-je megegyezik (#${sorted[i].id}: ${sorted[i].csaladnev || '?'} ${sorted[i].k_nev || ''}).`,
        severity: 'medium',
        duplicate_of_member_id: sorted[i].id,
      })
    }
  }

  // 3. Név + sz_datum duplikációk
  const byNameDate = new Map<string, MemberRow[]>()
  for (const m of members) {
    if (m.csaladnev && m.k_nev && m.sz_datum) {
      const key = `${m.csaladnev.trim().toLowerCase()}|${m.k_nev.trim().toLowerCase()}|${m.sz_datum}`
      const arr = byNameDate.get(key) || []
      arr.push(m)
      byNameDate.set(key, arr)
    }
  }
  for (const [, group] of byNameDate) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.id - b.id)
    const primary = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      errors.push({
        member_id: primary.id,
        field_name: 'name_birthdate',
        error_type: 'duplicate',
        error_message: `Azonos név + születési dátum (#${sorted[i].id}). Lehetséges duplikáció.`,
        severity: 'medium',
        duplicate_of_member_id: sorted[i].id,
      })
    }
  }

  return errors
}

// ── Teljes validáció (egy gyülekezet összes tagjára) ────────────────────────

export function validateAll(members: MemberRow[], context: ValidationContext = {}): ValidationError[] {
  const all: ValidationError[] = []
  for (const m of members) {
    if (m.meghalt) continue // elhunyt tagokat nem validálunk
    all.push(...validateMember(m, context))
  }
  all.push(...findDuplicates(members.filter(m => !m.meghalt)))
  return all
}
