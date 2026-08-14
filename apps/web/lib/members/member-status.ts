import type { MemberRow } from '@/lib/constants/members'

/**
 * 2026-08-15 (átvilágítás #22): a tag-státusz KANONIKUS, ékezet-érzéketlen
 * predikátum-készlete — EGY forrás a Személyek fülnek és az Áttekintés fülnek.
 *
 * MIÉRT KELLETT: az Áttekintés (`member-overview.ts`) nyers, ÉKEZET NÉLKÜLI
 * `'elkoltozott'` sztringgel hasonlított, miközben az app minden elköltözés-írása
 * ÉKEZETES `'elköltözött'`-et ír (tagnyilvantartas/actions.ts removeMember,
 * iktato/atadas-actions.ts átadás). Következmény: az elköltözött tag bennmaradt
 * az aktív lélekszámban, az „Elköltözött" pirula pedig mindig 0 volt — ugyanazon
 * a képernyőn a Személyek fül (amely már normalizálva hasonlított) MÁS számot
 * mutatott, mint az Áttekintés, és a lélekszám széthúzott a hivatalos jelentéssel.
 *
 * MIÉRT KÜLÖN FÁJL: a helyes minta a `registry-list-actions.ts`-ben élt, az
 * viszont `'use server'` modul — abból csak async függvény exportálható, tehát
 * ezek a szinkron segédek nem húzhatók onnan. A közös forrás ezért ide került,
 * és MINDKÉT hívóhely erre köt (nem másolat, hanem egyetlen implementáció).
 *
 * MIÉRT NORMALIZÁLUNK: az éles adatban a `member_status` mindkét írásmódban él
 * ('elköltözött' és 'elkoltozott', 'kitért' és 'kitert'), mert import és kézi
 * rögzítés is töltötte. Ezért NFD-vel leszedjük az ékezeteket, `hu-HU`
 * kisbetűsítünk, és a szóközt/kötőjelet/aláhúzást is elhagyjuk.
 *
 * FIGYELEM: a `szemely` táblán NINCS `elkoltozott` boolean oszlop (az egy külön
 * TÁBLA, `id_szemely` FK-val) — a költözés KIZÁRÓLAG a `member_status`
 * szövegmezőben él. Ezért itt szándékosan nem hivatkozunk `member.elkoltozott`-ra:
 * az mindig `undefined` lenne, és némán mindig hamisra értékelődne.
 */

/** Ékezet- és kisbetű-érzéketlen kulcs kereséshez és összevetéshez. */
export function normalizeForSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('hu-HU')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kereső-tokenek (szóközzel tagolt, AND-kapcsolatban illesztendő darabok). */
export function searchTokens(value: string) {
  return normalizeForSearch(value).split(' ').filter(Boolean)
}

/** A `member_status` összevetési kulcsa: ékezet, kisbetű, szóköz/kötőjel nélkül. */
export function normalizeMemberStatus(value: string | null | undefined) {
  return normalizeForSearch(value).replace(/[\s_-]+/g, '')
}

export function isMovedMember(member: Pick<MemberRow, 'member_status'>) {
  return normalizeMemberStatus(member.member_status) === 'elkoltozott'
}

export function hasLeftMember(member: Pick<MemberRow, 'member_status'>) {
  return normalizeMemberStatus(member.member_status) === 'kitert'
}

export function isDeletedMember(member: Pick<MemberRow, 'member_status'>) {
  return normalizeMemberStatus(member.member_status) === 'torolt'
}

export function isReformedMember(member: Pick<MemberRow, 'vallas'>) {
  return normalizeForSearch(member.vallas) === 'reformatus'
}

/**
 * Élő, a gyülekezethez tartozó tag: nem hunyt el, nem költözött el, nem tért ki,
 * és nincs törölve. FAIL-CLOSED: ismeretlen/üres státusz esetén bennmarad —
 * a kivezetés mindig explicit írás, tehát a hiánya nem jelent kivezetést.
 */
export function isLivingMember(member: Pick<MemberRow, 'meghalt' | 'member_status'>) {
  if (member.meghalt) return false
  return !isMovedMember(member) && !hasLeftMember(member) && !isDeletedMember(member)
}

export type ActiveMemberInput =
  Pick<MemberRow, 'meghalt' | 'member_status' | 'vallas'>
  & { hasEverPaid: boolean }

/**
 * Aktív gyülekezeti tag (Endre szabálya, 2026-04-30): élő tag ÉS
 * (református VAGY valaha fizetett egyházfenntartási járulékot).
 */
export function isActiveMember(member: ActiveMemberInput) {
  if (!isLivingMember(member)) return false
  return isReformedMember(member) || member.hasEverPaid
}
