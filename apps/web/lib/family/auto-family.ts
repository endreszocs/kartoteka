/**
 * Automatikus gyermek→család bekötés (2026-08-02, PR-20).
 *
 * A saveMember-ben évek óta inline élő logika kiemelése, hogy a szülő-név
 * alapú utólagos összekötés (linkMemberParents) is UGYANEZT futtassa:
 *   1. a szülő(k) aktív családjának megkeresése / létrehozása,
 *   2. dupla-tagsági őr (PR-18: máshol tag → figyelmeztetés, nem néma dupla),
 *   3. gyerek-sor + vér szerinti szemely_kapcsolat élek (a családfa ebből él),
 *   4. háztartás-szinkron (Családok fül / kereső azonnal látja).
 *
 * NEM 'use server' fájl — a server actionök importálják.
 */

import { findMembershipConflicts, syncHouseholdFromCsalad } from './family-membership'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface EnsureChildFamilyResult {
  /** Létrejött-e (vagy megvolt-e) a családi tagság-bekötés */
  linked: boolean
  familyId: number | null
  /** Felhasználónak szóló figyelmeztetés (dupla tagság / ellenőrzési hiba) */
  warning: string | null
}

/**
 * A gyermeket a szülei családjához köti (család keresés/létrehozás + gyerek-sor
 * + rokonsági élek + háztartás-szinkron), a PR-18-as dupla-tagsági őrrel.
 * A vér szerinti kapcsolat (szemely_kapcsolat) a tagságtól FÜGGETLENÜL rögzül.
 */
export async function ensureChildFamilyLink(
  supabase: Db,
  congregationId: string,
  childId: number,
  ferfiId: number | null,
  noId: number | null,
  address?: { c_utcaid?: number | null; c_szam?: string | null },
): Promise<EnsureChildFamilyResult> {
  if (!ferfiId && !noId) return { linked: false, familyId: null, warning: null }

  let warning: string | null = null

  // 1) A szülő(k) aktív családja — vagy új család
  let query = supabase.from('csalad').select('id').eq('isaktiv', true)
  if (ferfiId) query = query.eq('id_ferfi', ferfiId)
  if (noId) query = query.eq('id_no', noId)
  const { data: existingFam } = await query.limit(1)

  let famId: number | null = null
  if (existingFam?.[0]) {
    famId = existingFam[0].id as number
  } else {
    // Cím: a hívó adja (tag-űrlap címe), vagy a szülő lakcíme
    let cUtcaid = address?.c_utcaid ?? null
    let cSzam = address?.c_szam ?? null
    if (!cUtcaid) {
      const parentId = ferfiId || noId
      const { data: parentAddr } = await supabase
        .from('szemely')
        .select('c_utcaid, c_szam')
        .eq('id', parentId)
        .maybeSingle()
      cUtcaid = parentAddr?.c_utcaid ?? null
      cSzam = cSzam ?? parentAddr?.c_szam ?? null
    }
    if (cUtcaid) {
      const { data: newFam } = await supabase.from('csalad').insert([{
        id_ferfi: ferfiId, id_no: noId, c_utcaid: cUtcaid, c_szam: cSzam || '1', isaktiv: true,
      }]).select('id')
      if (newFam?.[0]) famId = newFam[0].id as number
    } else {
      warning = 'A család nem hozható létre automatikusan, mert sem a taghoz, sem a szülőhöz nincs rögzített utca — add meg a lakcímet, majd használd a személyi karton „Családhoz rendelés" gombját.'
    }
  }

  // 2) Dupla-tagsági őr (PR-18) — fail-closed
  let alreadyElsewhere = false
  if (famId) {
    try {
      const guard = await findMembershipConflicts(supabase, congregationId, [childId], famId)
      alreadyElsewhere = guard.blocked.length > 0 || guard.movable.length > 0
      if (alreadyElsewhere) {
        warning = 'A tag már egy másik család tagjaként szerepel, ezért NEM rendeltük hozzá automatikusan egy második családhoz. Áthelyezni a személyi karton „Családhoz rendelés / Áthelyezés" gombjával lehet — ott a rendszer rákérdez, és a korábbi tagságot szabályosan lezárja.'
      }
    } catch (e) {
      console.warn('[ensureChildFamilyLink] tagsági ellenőrzés sikertelen:', e instanceof Error ? e.message : e)
      alreadyElsewhere = true
      warning = 'A családtagsági ellenőrzés nem sikerült, ezért a tagot nem rendeltük hozzá automatikusan a családhoz — próbáld újra a személyi karton „Családhoz rendelés" gombjával.'
    }
  }

  // 3) gyerek-sor (csak ha az őr engedi)
  let linked = false
  if (famId && !alreadyElsewhere) {
    const { data: check } = await supabase.from('gyerek').select('id').eq('id_szemely', childId).eq('id_csalad', famId).limit(1)
    if (!check?.length) {
      const { error } = await supabase.from('gyerek').insert([{ id_csalad: famId, id_szemely: childId }])
      if (!error) linked = true
    } else {
      linked = true
    }
  }

  // 4) Vér szerinti kapcsolatok — a tagságtól FÜGGETLENÜL (a családfa ebből
  //    épül); + háztartás-szinkron, ha a tagság létrejött
  try {
    async function ensureSzuloKapcsolat(szuloId: number) {
      const { data: existing } = await supabase
        .from('szemely_kapcsolat')
        .select('id')
        .eq('id_szemely_1', szuloId)
        .eq('id_szemely_2', childId)
        .eq('tipus', 'szulo_gyermek')
        .is('ervenyes_ig', null)
        .limit(1)
      if (existing?.length) return
      await supabase.from('szemely_kapcsolat').insert([{
        id_szemely_1: szuloId, id_szemely_2: childId,
        tipus: 'szulo_gyermek', ver_szerinti: true,
        congregation_id: congregationId,
      }])
    }
    if (ferfiId) await ensureSzuloKapcsolat(ferfiId)
    if (noId) await ensureSzuloKapcsolat(noId)

    if (famId && !alreadyElsewhere) {
      await syncHouseholdFromCsalad(supabase, famId, congregationId)
    }
  } catch (e) {
    console.warn('[ensureChildFamilyLink] dual-write sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  return { linked, familyId: famId, warning }
}
