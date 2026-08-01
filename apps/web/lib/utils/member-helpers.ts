import { MALE_NAME_EXCEPTIONS } from '@/lib/constants/members'
import type { MemberRow, PaymentStatus } from '@/lib/constants/members'

// 2026-08-01 (PR-19): a név-formázás kanonikus implementációja a KÖZÖS
// @kartoteka/ui-app csomagba került (packages/ui-app/src/members/name-format.ts)
// — a desktop születésnapos listája és minden webes hely ugyanazt használja.
// Innen re-exportáljuk, hogy a meglévő importok változatlanul működjenek.
// MÉLY import (nem a barrel!): ezt a fájlt 'use server' action is húzza
// (generateCnp), a barrel viszont 'use client' komponenseket exportál.
export { formatNameWithPrefix, isPrefixLikeNamepattern, isOzvegyAllapot } from '@kartoteka/ui-app/src/members/name-format'

export function calculatePaymentStatus(
  member: MemberRow,
  paidPersonIds: Set<number>,
  paidFamilyIds: Set<number>,
  exemptPersonIds: Set<number>,
  exemptFamilyIds: Set<number>,
  familyId: number | null
): PaymentStatus {
  if (member.meghalt) return 'elhunyt'
  if (member.elkoltozott) return 'elkoltozott'
  if (member.member_status === 'kitért') return 'kitert'
  if (exemptPersonIds.has(member.id) || (familyId && exemptFamilyIds.has(familyId))) return 'felmentett'
  if (paidPersonIds.has(member.id) || (familyId && paidFamilyIds.has(familyId))) return 'rendezve'
  return 'hatralekos'
}

export function guessGender(firstName: string | null): 'ferfi' | 'no' {
  if (!firstName) return 'ferfi'
  const fn = firstName.toLowerCase().trim().split(/\s+/)[0]
  if (MALE_NAME_EXCEPTIONS.some(e => fn === e)) return 'ferfi'
  if (fn.endsWith('a') || fn.endsWith('e')) return 'no'
  return 'ferfi'
}

export function generateCnp(): string {
  return '999' + Math.floor(1000000 + Math.random() * 9000000).toString()
}

export function isActiveMember(
  m: MemberRow,
  paidPersonIds: Set<number>,
  /** "Bármikor fizetett egyházfenntartást" Set — bármely évben (Endre szabálya
   *  2026-04-30). Ha üres halmaz vagy nem adott, a fallback a régi paid (idei). */
  everPaidPersonIds?: Set<number>,
): boolean {
  // 2026-04-30 (Endre kérése): a member_status='elkoltozott' tagok kikerülnek
  // az aktív listából, amíg a célgyülekezet nem fogadta el / utasította el
  // (pending alatt is). Elutasítás után a member_status='aktív'-re visszaáll.
  if (m.meghalt || m.elkoltozott || m.member_status === 'elkoltozott' || m.member_status === 'kitért' || m.member_status === 'törölt') return false

  // 2026-04-30 (Endre kérése): "Aktív tag = református VAGY bármikor fizetett
  // egyházfenntartást." A korábbi szabály az ÜRES vallást is reformátusnak
  // vette — ezt visszavontuk. Az üres vallású tagok csak akkor aktívak, ha
  // valaha fizettek egyházfenntartást.
  // 2026-07-24 (PR-4 F5.6): NFD-normalizált összevetés — az ékezet nélküli
  // 'Reformatus' vallású (importált) tag eddig itt NEM számított aktívnak,
  // miközben a lista (registry-list) és a karton NFD-vel igen → felületenként
  // eltérő lélekszámok. Mostantól bit-azonos mindhárom hellyel.
  const v = (m.vallas || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const isReformatus = v === 'reformatus'
  const hasEverPaid = (everPaidPersonIds || paidPersonIds).has(m.id)
  return isReformatus || hasEverPaid
}
