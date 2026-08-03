/**
 * Automatikus gyermek→család bekötés (2026-08-02, PR-20).
 *
 * A saveMember-ben évek óta inline élő logika kiemelése, hogy a szülő-név
 * alapú utólagos összekötés (linkMemberParents) is UGYANEZT futtassa:
 *   1. a szülő(k) aktív családjának megkeresése / létrehozása,
 *   2. tagsági rendezés (PR-23: AUTOMATIKUS áthelyezés + karton-összevonás),
 *   3. gyerek-sor + vér szerinti szemely_kapcsolat élek (a családfa ebből él),
 *   4. háztartás-szinkron (Családok fül / kereső azonnal látja).
 *
 * 2026-08-03 (PR-23) — „legyen automatikus, és írja le, honnan hová került":
 *   - GYERMEKKÉNTI kettős tagság már nem blokkol: a tagot a szülők családjába
 *     soroljuk, a korábbi (saját gyülekezeti) tagságát lezárjuk, és a lépést
 *     tételesen jelentjük (moves).
 *   - KARTON-ÖSSZEVONÁS: ha a korábbi család felnőttjei a cél-család
 *     felnőttjeinek részhalmaza (ugyanaz a szülőpár két kartonon, a testvérek
 *     szétszórva), a régi karton ÖSSZES gyermekét átvisszük — így egyik testvér
 *     sem marad le —, a kiürült kartont pedig lezárjuk.
 *   - ÖSSZEFÉRHETETLENSÉG (felnőtt szerep máshol, idegen gyülekezet, eltérő
 *     felnőttek) esetén NEM nyúlunk az adathoz, hanem tételes észrevételt írunk
 *     (notes) — a vér szerinti kapcsolat ilyenkor is rögzül, a fa mutatja.
 *
 * NEM 'use server' fájl — a server actionök importálják.
 */

import {
  findMembershipConflicts,
  foreignMembershipWarning,
  loadFamilyDisplayNames,
  moveChildMemberships,
  syncHouseholdFromCsalad,
  type AssignConflict,
} from './family-membership'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Egy tényleges tagság-mozgatás („honnan hová"). */
export interface FamilyLinkMove {
  personId: number
  personName: string
  fromFamilyId: number | null
  fromFamilyName: string | null
  toFamilyId: number
  toFamilyName: string
  /** true = a karton-összevonás hozta át (testvér), nem a szerkesztett tag */
  sibling: boolean
}

export interface EnsureChildFamilyResult {
  /** Létrejött-e (vagy megvolt-e) a családi tagság-bekötés */
  linked: boolean
  familyId: number | null
  /** Felhasználónak szóló összefoglaló figyelmeztetés (a notes összefűzve) */
  warning: string | null
  /** Tételes áthelyezés-napló — a felületen és az auditban is megjelenik */
  moves: FamilyLinkMove[]
  /** Összeférhetetlenségi / tájékoztató észrevételek */
  notes: string[]
  /** Az összevonás során lezárt (kiürült) családi kartonok nevei */
  closedFamilies: string[]
}

/** „Márk Ildikó: Kovács család → Márk család" alakú, olvasható mondatok. */
export function describeMoves(moves: FamilyLinkMove[]): string[] {
  return moves.map((m) => {
    const who = m.sibling ? `${m.personName} (testvér)` : m.personName
    return m.fromFamilyName
      ? `${who}: ${m.fromFamilyName} → ${m.toFamilyName}`
      : `${who} → ${m.toFamilyName} (új családtagság)`
  })
}

interface AutoMovePlan {
  moves: FamilyLinkMove[]
  notes: string[]
  /** Az összevonással áthozott testvérek (a cél-családba felveendők) */
  siblingIds: number[]
  /** A lezárandó korábbi gyermek-tagságok (a cél-mentés UTÁN futnak) */
  closes: AssignConflict[]
  /** A kiürülő, lezárandó családi kartonok */
  deactivate: number[]
}

/**
 * Az áthelyezés MEGTERVEZÉSE (írás nélkül): eldönti, hogy a korábbi karton a
 * cél-család duplikátuma-e (összevonás), vagy külön család (csak a gyermek
 * kerül át). Olvasási hibánál DOB — a hívó fail-closed módon kezeli.
 */
async function planAutoMove(
  supabase: Db,
  congregationId: string,
  targetFamilyId: number,
  movable: AssignConflict[],
  allowed: Set<number>,
): Promise<AutoMovePlan> {
  const moves: FamilyLinkMove[] = []
  const notes: string[] = []
  const siblingIds: number[] = []
  const closes: AssignConflict[] = []
  const deactivate: number[] = []

  const ownMovable = movable.filter((m) => allowed.has(m.familyId))
  for (const m of movable) {
    if (!allowed.has(m.familyId)) {
      notes.push(
        `${m.personName} egy másik gyülekezet családnyilvántartásában is szerepel (${m.familyName}) — ahhoz nem nyúltunk, azt a másik gyülekezet lelkésze tudja lezárni.`,
      )
    }
  }
  if (ownMovable.length === 0) return { moves, notes, siblingIds, closes, deactivate }

  const oldFamilyIds = [...new Set(ownMovable.map((m) => m.familyId))]

  const [targetRes, oldFamRes, gyRes] = await Promise.all([
    supabase.from('csalad').select('id, id_ferfi, id_no').eq('id', targetFamilyId).maybeSingle(),
    supabase.from('csalad').select('id, id_ferfi, id_no').in('id', oldFamilyIds),
    supabase.from('gyerek').select('id_csalad, id_szemely').in('id_csalad', oldFamilyIds),
  ])
  if (targetRes.error) throw new Error(`cel-csalad-olvasas: ${targetRes.error.message}`)
  if (oldFamRes.error) throw new Error(`regi-csalad-olvasas: ${oldFamRes.error.message}`)
  if (gyRes.error) throw new Error(`gyerek-olvasas: ${gyRes.error.message}`)

  const targetAdults = new Set<number>(
    [targetRes.data?.id_ferfi as number | null, targetRes.data?.id_no as number | null]
      .filter((v): v is number => v != null),
  )
  const oldFamilies = new Map<number, { id_ferfi: number | null; id_no: number | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((oldFamRes.data || []) as any[]).map((f) => [f.id as number, { id_ferfi: f.id_ferfi ?? null, id_no: f.id_no ?? null }]),
  )
  const childrenByFamily = new Map<number, number[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyRes.data || []) as any[]) {
    const list = childrenByFamily.get(g.id_csalad as number) ?? []
    if (!list.includes(g.id_szemely as number)) list.push(g.id_szemely as number)
    childrenByFamily.set(g.id_csalad as number, list)
  }

  // Nevek: a testvérek + a régi kartonok „idegen" felnőttjei
  const nameNeedIds = [...new Set([
    ...[...childrenByFamily.values()].flat(),
    ...[...oldFamilies.values()].flatMap((f) => [f.id_ferfi, f.id_no]).filter((v): v is number => v != null),
  ])]
  const nameById = new Map<number, string>()
  if (nameNeedIds.length > 0) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev')
      .in('id', nameNeedIds)
    if (error) throw new Error(`szemely-olvasas (athelyezes-terv): ${error.message}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data || []) as any[]) {
      nameById.set(p.id as number, `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`)
    }
  }

  const famNames = await loadFamilyDisplayNames(supabase, [targetFamilyId, ...oldFamilyIds])
  const famName = (id: number) => famNames.get(id) ?? `Család #${id}`
  const toName = famName(targetFamilyId)

  for (const m of ownMovable) {
    const fromName = m.familyName || famName(m.familyId)
    closes.push(m)
    moves.push({
      personId: m.personId,
      personName: m.personName,
      fromFamilyId: m.familyId,
      fromFamilyName: fromName,
      toFamilyId: targetFamilyId,
      toFamilyName: toName,
      sibling: false,
    })

    const old = oldFamilies.get(m.familyId)
    const oldAdults = [old?.id_ferfi ?? null, old?.id_no ?? null].filter((v): v is number => v != null)
    const idegenFelnottek = oldAdults.filter((a) => !targetAdults.has(a))
    const osszevonhato = oldAdults.length > 0 && idegenFelnottek.length === 0

    if (!osszevonhato) {
      notes.push(
        oldAdults.length === 0
          ? `A korábbi kartonon (${fromName}) nincs rögzített szülő, ezért csak a gyermeket helyeztük át — a régi karton megmaradt, ha felesleges, töröld.`
          : `A korábbi kartonon (${fromName}) más szülő is szerepel (${idegenFelnottek.map((a) => nameById.get(a) ?? `#${a}`).join(', ')}), ezért CSAK a gyermeket helyeztük át — a régi karton érintetlen maradt. Ellenőrizd, melyik a helyes.`,
      )
      continue
    }

    // ÖSSZEVONÁS: a régi karton ugyanazt a szülőpárt jelöli → minden gyermeke átjön
    const others = (childrenByFamily.get(m.familyId) ?? []).filter((id) => id !== m.personId)
    const utkozo = others.filter((id) => targetAdults.has(id))
    const athozhato = others.filter((id) => !targetAdults.has(id))
    for (const sid of athozhato) {
      if (!siblingIds.includes(sid)) siblingIds.push(sid)
      closes.push({
        personId: sid,
        personName: nameById.get(sid) ?? `#${sid}`,
        familyId: m.familyId,
        familyName: fromName,
        role: 'gyermek',
      })
      moves.push({
        personId: sid,
        personName: nameById.get(sid) ?? `#${sid}`,
        fromFamilyId: m.familyId,
        fromFamilyName: fromName,
        toFamilyId: targetFamilyId,
        toFamilyName: toName,
        sibling: true,
      })
    }
    if (utkozo.length > 0) {
      notes.push(
        `A(z) ${fromName} kartonon ${utkozo.map((id) => nameById.get(id) ?? `#${id}`).join(', ')} egyszerre szülőként és gyermekként is szerepel — ezt nem tudtuk automatikusan rendezni, ezért a régi kartont nem zártuk le. Nyisd meg és javítsd.`,
      )
    } else {
      deactivate.push(m.familyId)
      notes.push(
        athozhato.length > 0
          ? `A(z) ${fromName} és a(z) ${toName} ugyanazt a szülőpárt jelölte, ezért összevontuk őket: a testvérek (${athozhato.map((id) => nameById.get(id) ?? `#${id}`).join(', ')}) is átkerültek, a kiürült régi kartont lezártuk.`
          : `A(z) ${fromName} ugyanazt a szülőpárt jelölte, mint a(z) ${toName}, ezért a kiürült régi kartont lezártuk.`,
      )
    }
  }

  return { moves, notes, siblingIds, closes, deactivate }
}

/**
 * A gyermeket a szülei családjához köti (család keresés/létrehozás + gyerek-sor
 * + rokonsági élek + háztartás-szinkron), PR-23 óta automatikus áthelyezéssel.
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
  const moves: FamilyLinkMove[] = []
  const notes: string[] = []
  const closedFamilies: string[] = []
  const done = (linked: boolean, familyId: number | null): EnsureChildFamilyResult => ({
    linked,
    familyId,
    warning: notes.length > 0 ? notes.join(' ') : null,
    moves,
    notes,
    closedFamilies,
  })

  if (!ferfiId && !noId) return done(false, null)

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
      notes.push('A család nem hozható létre automatikusan, mert sem a taghoz, sem a szülőhöz nincs rögzített utca — add meg a lakcímet, majd használd a személyi karton „Családhoz rendelés" gombját.')
    }
  }

  // 2) Tagsági rendezés: automatikus áthelyezés / összevonás vagy észrevétel
  let blockMembership = false
  let plan: AutoMovePlan | null = null
  let allowedFamilies = new Set<number>()
  if (famId) {
    try {
      const guard = await findMembershipConflicts(supabase, congregationId, [childId], famId)
      allowedFamilies = guard.allowed
      const fw = foreignMembershipWarning(guard.foreign)
      if (fw) notes.push(fw)

      if (guard.blocked.length > 0) {
        // ÖSSZEFÉRHETETLENSÉG: felnőttként (házastárs/családfő) máshol tag —
        // a saját családját nem bontjuk meg.
        blockMembership = true
        for (const b of guard.blocked) {
          notes.push(
            `${b.personName} a(z) ${b.familyName} FELNŐTT tagja (családfő vagy házastárs), ezért gyermekként nem soroltuk át — a saját családja érintetlen maradt. A szülőkkel a vér szerinti kapcsolat így is rögzült, a családfán megjelenik. Ha mégis a szüleihez tartozik, előbb a(z) ${b.familyName} kartonján kell módosítani a felnőtt tagokat.`,
          )
        }
      } else if (guard.movable.length > 0) {
        plan = await planAutoMove(supabase, congregationId, famId, guard.movable, guard.allowed)
        notes.push(...plan.notes)
      }
    } catch (e) {
      console.warn('[ensureChildFamilyLink] tagsági ellenőrzés sikertelen:', e instanceof Error ? e.message : e)
      blockMembership = true
      notes.push('A családtagsági ellenőrzés nem sikerült, ezért a tagot nem soroltuk át — próbáld újra a személyi karton „Családhoz rendelés" gombjával.')
    }
  }

  // 3) gyerek-sorok a cél-családba — ELŐBB az ÚJ tagság, és csak SIKER után
  //    zárjuk a régit (fordított sorrendben egy hiba családtalanul hagyná).
  let linked = false
  if (famId && !blockMembership) {
    const wantedIds = [childId, ...(plan?.siblingIds ?? [])]
    const { data: existingRows, error: existingErr } = await supabase
      .from('gyerek')
      .select('id_szemely')
      .eq('id_csalad', famId)
      .in('id_szemely', wantedIds)
    if (existingErr) {
      notes.push('A meglévő gyermek-sorok ellenőrzése nem sikerült — nyisd meg a családi kartont, és ellenőrizd a gyermekeket.')
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const have = new Set(((existingRows || []) as any[]).map((r) => r.id_szemely as number))
      const toInsert = wantedIds.filter((id) => !have.has(id))
      let insertOk = true
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('gyerek')
          .insert(toInsert.map((id) => ({ id_csalad: famId, id_szemely: id })))
        if (error) {
          insertOk = false
          notes.push('A gyermek családhoz sorolása nem sikerült — próbáld újra a személyi karton „Családhoz rendelés" gombjával.')
        }
      }
      linked = insertOk && (have.has(childId) || toInsert.includes(childId))

      if (insertOk && plan) {
        // 3/b) A korábbi tagságok lezárása (csak saját gyülekezeti kartonok)
        try {
          await moveChildMemberships(supabase, congregationId, plan.closes, allowedFamilies)
          const famNames = await loadFamilyDisplayNames(supabase, plan.deactivate)
          for (const oldFamId of plan.deactivate) {
            const { error: deErr } = await supabase.from('csalad').update({ isaktiv: false }).eq('id', oldFamId)
            if (deErr) {
              notes.push(`A kiürült ${famNames.get(oldFamId) ?? `#${oldFamId}`} karton lezárása nem sikerült — nyisd meg és zárd le kézzel.`)
              continue
            }
            closedFamilies.push(famNames.get(oldFamId) ?? `Család #${oldFamId}`)
            try {
              await syncHouseholdFromCsalad(supabase, oldFamId, congregationId)
            } catch (e) {
              console.warn('[ensureChildFamilyLink] lezárt család szinkronja sikertelen:',
                e instanceof Error ? e.message : e)
            }
          }
          moves.push(...plan.moves)
        } catch (e) {
          console.warn('[ensureChildFamilyLink] korábbi tagság lezárása sikertelen:',
            e instanceof Error ? e.message : e)
          notes.push('A tag az új családba került, de a korábbi családtagsága nem zárult le — nyisd meg a régi családi kartont, és távolítsd el onnan a tagot.')
        }
      } else if (insertOk) {
        moves.push({
          personId: childId,
          personName: '',
          fromFamilyId: null,
          fromFamilyName: null,
          toFamilyId: famId,
          toFamilyName: '',
          sibling: false,
        })
      }
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

    if (famId && linked) {
      await syncHouseholdFromCsalad(supabase, famId, congregationId)
    }
  } catch (e) {
    console.warn('[ensureChildFamilyLink] dual-write sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  // A név nélkül felvett „új tagság" bejegyzés kiegészítése olvasható névvel
  const needsName = moves.filter((m) => !m.personName || !m.toFamilyName)
  if (needsName.length > 0 && famId) {
    const famNames = await loadFamilyDisplayNames(supabase, [famId])
    const { data: personRow } = await supabase
      .from('szemely')
      .select('csaladnev, k_nev')
      .eq('id', childId)
      .maybeSingle()
    const childName = `${personRow?.csaladnev ?? ''} ${personRow?.k_nev ?? ''}`.trim() || `#${childId}`
    for (const m of needsName) {
      if (!m.personName) m.personName = childName
      if (!m.toFamilyName) m.toFamilyName = famNames.get(famId) ?? `Család #${famId}`
    }
  }

  return done(linked, famId)
}
