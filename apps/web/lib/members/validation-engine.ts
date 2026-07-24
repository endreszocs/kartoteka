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

export function validateMember(member: MemberRow): ValidationError[] {
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

export function validateAll(members: MemberRow[]): ValidationError[] {
  const all: ValidationError[] = []
  for (const m of members) {
    if (m.meghalt) continue // elhunyt tagokat nem validálunk
    all.push(...validateMember(m))
  }
  all.push(...findDuplicates(members.filter(m => !m.meghalt)))
  return all
}
