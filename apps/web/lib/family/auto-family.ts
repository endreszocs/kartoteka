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
 *   - KARTON-ÖSSZEVONÁS: ha a két karton UGYANAZT a szülő-párost jelöli (a
 *     testvérek két kartonra szóródtak), a régi karton ÖSSZES gyermekét
 *     átvisszük, a kiürült kartont pedig lezárjuk.
 *   - ÖSSZEFÉRHETETLENSÉG esetén NEM nyúlunk az adathoz, hanem tételes
 *     észrevételt írunk (notes) — a vér szerinti kapcsolat ilyenkor is rögzül.
 *
 * 2026-08-03 (PR-23 review) — 23 megerősített találat javítása. A legfontosabb
 * (P0): az összevonás feltétele HALMAZ-EGYEZÉS, nem részhalmaz. Egy egy-szülős
 * karton ({anya, —}) NEM duplikátuma a párosnak ({apa, anya}): a testvérek
 * lehetnek egy korábbi kapcsolatból, és az áthozatal után a háztartás-szinkron
 * a MOSTOHASZÜLŐTŐL is vér szerinti szülő-élt írna be — amit az egyeztető
 * (a tagság „igazolja") soha nem zárna le. További őrök: több aktív szülő-
 * karton esetén nincs összevonás; idegen gyülekezeti / máshol felnőtt testvér
 * nem mozdul; a lezárás előtt pénzügyi-látogatási hivatkozás-ellenőrzés; a
 * múlt idejű mondatok CSAK sikeres írás után kerülnek a jelentésbe.
 *
 * NEM 'use server' fájl — a server actionök importálják.
 */

import {
  findMembershipConflicts,
  foreignMembershipWarning,
  loadFamilyDisplayNames,
  loadFamilyMemberships,
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
  /** Írástól FÜGGETLEN észrevétel (idegen gyülekezet, kihagyott testverek) */
  notes: string[]
  /** MÚLT IDEJŰ mondatok — CSAK sikeres tagság-írás után jelenthetők */
  doneNotes: string[]
  /** Kartononkénti összevonás-mondat — CSAK sikeres lezárás után jelenthető */
  mergeNoteByFamily: Map<number, string>
  /** Az összevonással áthozott testvérek (a cél-családba felveendők) */
  siblingIds: number[]
  /** A lezárandó korábbi gyermek-tagságok (a cél-mentés UTÁN futnak) */
  closes: AssignConflict[]
  /** A kiürülő, lezárandó családi kartonok */
  deactivate: number[]
  /** A lezárt kartonról a célra átveendő körzet (ha a célon hiányzik) */
  inheritCsoport: number | null
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
  opts: { allowMerge: boolean },
): Promise<AutoMovePlan> {
  const moves: FamilyLinkMove[] = []
  const notes: string[] = []
  const doneNotes: string[] = []
  const mergeNoteByFamily = new Map<number, string>()
  const siblingIds: number[] = []
  const closes: AssignConflict[] = []
  const deactivate: number[] = []
  let inheritCsoport: number | null = null

  const ownMovable = movable.filter((m) => allowed.has(m.familyId))
  for (const m of movable) {
    if (!allowed.has(m.familyId)) {
      notes.push(
        `${m.personName} egy másik gyülekezet családnyilvántartásában is szerepel (${m.familyName}) — ahhoz nem nyúltunk, azt a másik gyülekezet lelkésze tudja lezárni.`,
      )
    }
  }
  const emptyPlan: AutoMovePlan = {
    moves, notes, doneNotes, mergeNoteByFamily, siblingIds, closes, deactivate, inheritCsoport,
  }
  if (ownMovable.length === 0) return emptyPlan

  const oldFamilyIds = [...new Set(ownMovable.map((m) => m.familyId))]
  const CSALAD_COLS = 'id, id_ferfi, id_no, id_csoport'

  const [targetRes, oldFamRes, gyRes] = await Promise.all([
    supabase.from('csalad').select(CSALAD_COLS).eq('id', targetFamilyId).maybeSingle(),
    supabase.from('csalad').select(CSALAD_COLS).in('id', oldFamilyIds),
    supabase.from('gyerek').select('id_csalad, id_szemely').in('id_csalad', oldFamilyIds),
  ])
  if (targetRes.error) throw new Error(`cel-csalad-olvasas: ${targetRes.error.message}`)
  if (oldFamRes.error) throw new Error(`regi-csalad-olvasas: ${oldFamRes.error.message}`)
  if (gyRes.error) throw new Error(`gyerek-olvasas: ${gyRes.error.message}`)

  const targetCsoport = (targetRes.data?.id_csoport as number | null) ?? null
  const targetAdults = new Set<number>(
    [targetRes.data?.id_ferfi as number | null, targetRes.data?.id_no as number | null]
      .filter((v): v is number => v != null),
  )
  interface OldFam { id_ferfi: number | null; id_no: number | null; id_csoport: number | null }
  const oldFamilies = new Map<number, OldFam>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((oldFamRes.data || []) as any[]).map((f) => [f.id as number, {
      id_ferfi: f.id_ferfi ?? null, id_no: f.id_no ?? null, id_csoport: f.id_csoport ?? null,
    }]),
  )
  const childrenByFamily = new Map<number, number[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyRes.data || []) as any[]) {
    const list = childrenByFamily.get(g.id_csalad as number) ?? []
    if (!list.includes(g.id_szemely as number)) list.push(g.id_szemely as number)
    childrenByFamily.set(g.id_csalad as number, list)
  }

  // Nevek + SAJÁT-gyülekezeti szűrés (a testvér lehet idegen gyülekezeti tag,
  // az RLS-rejtett sor pedig fail-closed módon idegennek számít)
  const nameNeedIds = [...new Set([
    ...[...childrenByFamily.values()].flat(),
    ...[...oldFamilies.values()].flatMap((f) => [f.id_ferfi, f.id_no]).filter((v): v is number => v != null),
    ...targetAdults,
  ])]
  const nameById = new Map<number, string>()
  const ownPersonIds = new Set<number>()
  if (nameNeedIds.length > 0) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, congregation_id')
      .in('id', nameNeedIds)
    if (error) throw new Error(`szemely-olvasas (athelyezes-terv): ${error.message}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data || []) as any[]) {
      nameById.set(p.id as number, `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`)
      if (p.congregation_id === congregationId) ownPersonIds.add(p.id as number)
    }
  }
  const nev = (id: number) => nameById.get(id) ?? `#${id}`

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
    const hianyzoFelnottek = [...targetAdults].filter((a) => !oldAdults.includes(a))
    // P0 review-fix: CSAK a valódi duplikátum (AZONOS szülő-páros) vonható
    // össze. A részhalmaz (egy-szülős karton a párossal szemben) nem az: a
    // mellé kerülő felnőtt a testvéreknek MOSTOHASZÜLŐJE lehet, és a
    // háztartás-szinkron tőle is vér szerinti szülő-élt írna be.
    const azonosSzulopar = oldAdults.length > 0
      && idegenFelnottek.length === 0
      && hianyzoFelnottek.length === 0

    if (!azonosSzulopar) {
      if (oldAdults.length === 0) {
        doneNotes.push(
          `A korábbi kartonon (${fromName}) nincs rögzített szülő, ezért csak a gyermeket helyeztük át — a régi karton megmaradt, ha felesleges, töröld.`,
        )
      } else if (idegenFelnottek.length > 0) {
        doneNotes.push(
          `A korábbi kartonon (${fromName}) más szülő is szerepel (${idegenFelnottek.map(nev).join(', ')}), ezért CSAK a gyermeket helyeztük át — a régi karton és a testvérek érintetlenek maradtak. Ellenőrizd, melyik a helyes.`,
        )
        // A régi karton MÁSIK szülőjének vér szerinti éle a tagság megszűnésével
        // lezárul — kivéve, ha a gyermek kartonja név szerint igazolja (PR-22).
        doneNotes.push(
          `Ha ${idegenFelnottek.map(nev).join(', ')} valóban ${m.personName} szülője, írd be a nevét a személyi kartonjára (Édesapa/Édesanya mező) — akkor a családfán a kapcsolat megmarad; e nélkül a régi kapcsolat lezárul.`,
        )
      } else {
        doneNotes.push(
          `A korábbi kartonon (${fromName}) csak ${oldAdults.map(nev).join(', ')} szerepel szülőként, a(z) ${toName} kartonon viszont ${hianyzoFelnottek.map(nev).join(', ')} is. Ez lehet ugyanannak a családnak a hiányos kartonja, de az is, hogy a testvéreknek MÁS a másik szülőjük — ezért CSAK ${m.personName} került át, a testvérek és a régi karton érintetlenek maradtak. Ha a testvérek is ide tartoznak, vedd fel őket a(z) ${toName} kartonján.`,
        )
      }
      continue
    }

    if (!opts.allowMerge) {
      doneNotes.push(
        `A(z) ${fromName} ugyanazt a szülő-párost jelöli, mint a(z) ${toName}, de a szülőnek több aktív családi kartonja van, ezért az összevonást nem végeztük el automatikusan — nézd át a kartonokat.`,
      )
      continue
    }

    // ÖSSZEVONÁS: a két karton ugyanazt a szülő-párost jelöli → a testvérek is
    const others = (childrenByFamily.get(m.familyId) ?? []).filter((id) => id !== m.personId)
    const utkozo = others.filter((id) => targetAdults.has(id))
    const idegen = others.filter((id) => !targetAdults.has(id) && !ownPersonIds.has(id))
    let jeloltek = others.filter((id) => !targetAdults.has(id) && ownPersonIds.has(id))

    // A testvér se veszítse el a SAJÁT családját: akinek máshol felnőtt
    // (családfő/házastárs) szerepe van, nem mozdítjuk.
    const felnottMashol: number[] = []
    if (jeloltek.length > 0) {
      const memberships = await loadFamilyMemberships(supabase, jeloltek, { throwOnError: true })
      for (const sid of jeloltek) {
        const roles = memberships.get(sid) ?? []
        if (roles.some((r) => r.role === 'felnott' && r.familyId !== targetFamilyId)) felnottMashol.push(sid)
      }
      jeloltek = jeloltek.filter((sid) => !felnottMashol.includes(sid))
    }

    for (const sid of jeloltek) {
      if (!siblingIds.includes(sid)) siblingIds.push(sid)
      closes.push({ personId: sid, personName: nev(sid), familyId: m.familyId, familyName: fromName, role: 'gyermek' })
      moves.push({
        personId: sid,
        personName: nev(sid),
        fromFamilyId: m.familyId,
        fromFamilyName: fromName,
        toFamilyId: targetFamilyId,
        toFamilyName: toName,
        sibling: true,
      })
    }

    const maradok = [...utkozo, ...idegen, ...felnottMashol]
    if (utkozo.length > 0) {
      notes.push(
        `A(z) ${fromName} kartonon ${utkozo.map(nev).join(', ')} egyszerre szülőként és gyermekként is szerepel — ezt nem tudtuk automatikusan rendezni. Nyisd meg és javítsd.`,
      )
    }
    if (idegen.length > 0) {
      notes.push(
        `A(z) ${fromName} kartonon ${idegen.map(nev).join(', ')} másik gyülekezet tagja (vagy nem látható innen), ezért nem mozgattuk.`,
      )
    }
    if (felnottMashol.length > 0) {
      notes.push(
        `${felnottMashol.map(nev).join(', ')} már saját családi karton felnőtt tagja, ezért nem hoztuk át gyermekként — a saját családja érintetlen maradt.`,
      )
    }

    if (maradok.length > 0) {
      doneNotes.push(
        `A(z) ${fromName} kartonról ${[m.personName, ...jeloltek.map(nev)].join(', ')} átkerült a(z) ${toName} kartonra, de a régi kartont NEM zártuk le, mert maradt rajta tag.`,
      )
    } else {
      deactivate.push(m.familyId)
      if (inheritCsoport == null && targetCsoport == null) inheritCsoport = old?.id_csoport ?? null
      mergeNoteByFamily.set(
        m.familyId,
        jeloltek.length > 0
          ? `A(z) ${fromName} és a(z) ${toName} ugyanazt a szülő-párost jelölte, ezért összevontuk őket: a testvérek (${jeloltek.map(nev).join(', ')}) is átkerültek, a kiürült régi kartont lezártuk.`
          : `A(z) ${fromName} ugyanazt a szülő-párost jelölte, mint a(z) ${toName}, ezért a kiürült régi kartont lezártuk.`,
      )
    }
  }

  return { moves, notes, doneNotes, mergeNoteByFamily, siblingIds, closes, deactivate, inheritCsoport }
}

/**
 * A karton lezárása előtti fék: ha a régi családhoz pénzügyi vagy látogatási
 * előzmény kötődik (befizetés, felmentés, családlátogatás), NEM zárjuk le —
 * inkább maradjon a duplikátum, mint hogy egy hivatkozás inaktív kartonra
 * mutasson. Olvasási hibánál is fail-closed (nem zárunk).
 */
async function hasFamilyReferences(supabase: Db, familyId: number): Promise<boolean> {
  for (const table of ['befizetes', 'felmentes', 'csaladlatogatas']) {
    const { data, error } = await supabase.from(table).select('id').eq('id_csalad', familyId).limit(1)
    if (error) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (((data || []) as any[]).length > 0) return true
  }
  return false
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

  // 1) A szülő(k) aktív családja — vagy új család.
  // Review-fix: DETERMINISZTIKUS választás (order) + több-találat-őr: ha a
  // szülőnek több aktív kartonja van (pl. csak az egyik szülő oldódott fel),
  // a tagot a legrégebbibe soroljuk, de összevonást NEM végzünk.
  let query = supabase.from('csalad').select('id').eq('isaktiv', true)
  if (ferfiId) query = query.eq('id_ferfi', ferfiId)
  if (noId) query = query.eq('id_no', noId)
  const { data: existingFam } = await query.order('id', { ascending: true }).limit(10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const famCandidates = ((existingFam || []) as any[]).length
  const allowMerge = famCandidates <= 1

  let famId: number | null = null
  if (famCandidates > 0) {
    famId = existingFam![0].id as number
    if (famCandidates > 1) {
      notes.push(
        `A szülőnek ${famCandidates} aktív családi kartonja van a nyilvántartásban — a tagot a legrégebbibe soroltuk. Nézd át a kartonokat, és ha felesleges duplikátum van köztük, zárd le.`,
      )
    }
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
        plan = await planAutoMove(supabase, congregationId, famId, guard.movable, guard.allowed, { allowMerge })
        // Az írástól FÜGGETLEN észrevételek azonnal jelenthetők; a múlt idejű
        // mondatok csak a sikeres írás után (lentebb).
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
        // 3/b) A korábbi tagságok lezárása (csak saját gyülekezeti kartonok).
        // A gyermek(ek) MÁR a cél-családban vannak, ezért a mozgatást akkor is
        // jelentjük, ha a régi tagság zárása hibára fut — de akkor kiírjuk.
        moves.push(...plan.moves)
        let closesOk = true
        try {
          await moveChildMemberships(supabase, congregationId, plan.closes, allowedFamilies)
        } catch (e) {
          closesOk = false
          console.warn('[ensureChildFamilyLink] korábbi tagság lezárása sikertelen:',
            e instanceof Error ? e.message : e)
          notes.push('A tag az új családba került, de a korábbi családtagsága nem zárult le — nyisd meg a régi családi kartont, és távolítsd el onnan a tagot.')
        }
        notes.push(...plan.doneNotes)

        if (closesOk && plan.deactivate.length > 0) {
          const famNames = await loadFamilyDisplayNames(supabase, plan.deactivate)
          for (const oldFamId of plan.deactivate) {
            const oldName = famNames.get(oldFamId) ?? `Család #${oldFamId}`
            // Fék: pénzügyi/látogatási előzményhez kötött kartont nem zárunk le
            if (await hasFamilyReferences(supabase, oldFamId)) {
              notes.push(
                `A(z) ${oldName} kartonhoz befizetés / felmentés / családlátogatás kötődik, ezért NEM zártuk le — a gyermekek átkerültek, a régi kartont a pénzügyi előzmény átnézése után zárhatod le kézzel.`,
              )
              continue
            }
            const { error: deErr } = await supabase.from('csalad').update({ isaktiv: false }).eq('id', oldFamId)
            if (deErr) {
              notes.push(`A kiürült ${oldName} karton lezárása nem sikerült — nyisd meg és zárd le kézzel.`)
              continue
            }
            closedFamilies.push(oldName)
            const mergeNote = plan.mergeNoteByFamily.get(oldFamId)
            if (mergeNote) notes.push(mergeNote)
            try {
              await syncHouseholdFromCsalad(supabase, oldFamId, congregationId)
            } catch (e) {
              console.warn('[ensureChildFamilyLink] lezárt család szinkronja sikertelen:',
                e instanceof Error ? e.message : e)
            }
          }
          // Körzet-öröklés: a lezárt kartonról, ha a célon nincs körzet
          if (closedFamilies.length > 0 && plan.inheritCsoport != null) {
            const { error: csErr } = await supabase
              .from('csalad')
              .update({ id_csoport: plan.inheritCsoport })
              .eq('id', famId)
              .is('id_csoport', null)
            if (csErr) {
              console.warn('[ensureChildFamilyLink] körzet-öröklés sikertelen:', csErr.message)
            }
          }
        }
      } else if (insertOk && toInsert.includes(childId)) {
        // Csak TÉNYLEGES új tagságot jelentünk (ha a gyerek-sor már megvolt,
        // nem történt mozgatás — különben minden mentésnél felugrana az ablak).
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
