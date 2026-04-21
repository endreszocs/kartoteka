import { MALE_NAME_EXCEPTIONS } from '@/lib/constants/members'
import type { MemberRow, PaymentStatus } from '@/lib/constants/members'

export function formatNameWithPrefix(
  member: Pick<MemberRow, 'csaladnev' | 'k_nev' | 'namepattern' | 'allapot'>,
  spouseDeceased?: boolean
): string {
  if (!member) return '-'
  const prefixes: string[] = []

  if (member.allapot === 'elvált') prefixes.push('elv.')

  let isOzvegy = member.allapot === 'özvegy'
  if (!isOzvegy && spouseDeceased) isOzvegy = true
  if (isOzvegy) prefixes.push('özv.')

  if (member.namepattern) prefixes.push(member.namepattern)

  const prefix = prefixes.length > 0 ? prefixes.join(' ') + ' ' : ''
  return `${prefix}${member.csaladnev || ''} ${member.k_nev || ''}`.trim()
}

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
  paidPersonIds: Set<number>
): boolean {
  if (m.meghalt || m.elkoltozott || m.member_status === 'kitért' || m.member_status === 'törölt') return false
  const v = (m.vallas || '').trim().toLowerCase()
  const isRefOrEmpty = v === '' || v === 'református'
  const isPayer = paidPersonIds.has(m.id)
  return isRefOrEmpty || isPayer
}
