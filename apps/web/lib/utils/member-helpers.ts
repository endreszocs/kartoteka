import { MALE_NAME_EXCEPTIONS } from '@/lib/constants/members'
import type { MemberRow, PaymentStatus } from '@/lib/constants/members'

/**
 * Detektálja, hogy egy `namepattern` érték TÉNYLEG PREFIX-szerű-e.
 * Példák amelyeket prefixnek tekintünk:
 *   - "id."  / "ifj."   (apa-fia disztinkció)
 *   - "Dr."  / "dr."    (akadémiai cím)
 *   - "Gr."  / "Br."    (nemesi cím — ritka)
 *   - "Özv." / "özv."   (családi állapot — fallback)
 *
 * NEM prefix-szerű (pl. teljes név, hosszabb szöveg, stb.) → false.
 *
 * Heurisztika: max 6 karakter ÉS ponttal végződik ÉS nincs benne szóköz.
 */
function isPrefixLikeNamepattern(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 6) return false
  if (!trimmed.endsWith('.')) return false
  if (/\s/.test(trimmed)) return false
  return true
}

/**
 * "Özvegy" detektálás — kezeli az "özvegy", "Özv.", "özv.", "ozv" formákat.
 */
function isOzvegyAllapot(allapot: string | null | undefined): boolean {
  if (!allapot) return false
  const norm = allapot.trim().toLowerCase().replace(/\.$/, '')
  return norm === 'özvegy' || norm === 'özv' || norm === 'ozvegy' || norm === 'ozv'
}

export function formatNameWithPrefix(
  member: Pick<MemberRow, 'csaladnev' | 'k_nev' | 'namepattern' | 'allapot'>,
  spouseDeceased?: boolean
): string {
  if (!member) return '-'
  const prefixes: string[] = []

  if (member.allapot === 'elvált') prefixes.push('elv.')

  let isOzvegy = isOzvegyAllapot(member.allapot)
  if (!isOzvegy && spouseDeceased) isOzvegy = true
  if (isOzvegy) prefixes.push('özv.')

  // FONTOS: a namepattern-t CSAK akkor használjuk prefixként, ha tényleg
  // PREFIX-SZERŰ (pl. "id.", "ifj."). Ha hosszabb szöveg (pl. teljes név),
  // ignore — nem akarunk duplikációt a UI-ban.
  if (isPrefixLikeNamepattern(member.namepattern)) {
    prefixes.push(member.namepattern!.trim())
  }

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
  // 2026-04-30 (Endre kérése): a member_status='elkoltozott' tagok kikerülnek
  // az aktív listából, amíg a célgyülekezet nem fogadta el / utasította el
  // (pending alatt is). Elutasítás után a member_status='aktív'-re visszaáll.
  if (m.meghalt || m.elkoltozott || m.member_status === 'elkoltozott' || m.member_status === 'kitért' || m.member_status === 'törölt') return false
  const v = (m.vallas || '').trim().toLowerCase()
  const isRefOrEmpty = v === '' || v === 'református'
  const isPayer = paidPersonIds.has(m.id)
  return isRefOrEmpty || isPayer
}
