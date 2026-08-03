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
  /** „Ez így rendben van" — nincs teendő, csak tájékoztatás (PR-24) */
  infos: string[]
  /** 2026-08-04 (PR-32): rögzült-e MINDEN kért vér szerinti szülő-kapcsolat.
   *  Eddig a felület vakon állította, hogy „rögzült" — az INSERT hibája némán
   *  elveszett, és a családfán mégsem jelent meg a szülő. */
  parentLinked: boolean
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

/**
 * A FELNŐTT-szerepű ütközés terve (2026-08-03, PR-24 — „ez is legyen
 * automatikus"). A naiv áthelyezés itt TILOS: ha a tag a saját családi
 * kartonján családfő/házastárs, gyermekké tétele szétbontaná a saját családját
 * (a házastársa és a gyermekei elveszítenék), és a pénzügyi (járulék)
 * számítás alapját adó „egy aktív háztartás" szabályt is megsértené.
 * Ezért csak azt automatizáljuk, ami bizonyíthatóan ADATHIBA:
 *   - a tag KISKORÚ, EGYEDÜL áll egy kartonon (nincs házastárs, nincs gyermek)
 *     és nincs hozzá pénzügyi/látogatási előzmény → a téves felnőtt-karton
 *     lezárul, a tag a szülei kartonjára kerül.
 * Minden más eset HELYES adat (felnőtt saját családja / egyszemélyes
 * háztartása) — ott nincs teendő, csak megnyugtató visszajelzés.
 */
interface AdultConflictPlan {
  /** Lezárandó (téves, üres) felnőtt-kartonok */
  releaseFamilyIds: number[]
  moves: FamilyLinkMove[]
  /** Valódi anomália — átnézendő */
  notes: string[]
  /** „Így helyes" — nincs teendő */
  infos: string[]
  /** true = marad a tiltás (nem nyúlunk a tagsághoz) */
  block: boolean
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
 * A FELNŐTT-szerepű ütközés feldolgozása (PR-24). Lásd az AdultConflictPlan
 * doc-kommentjét: csak a bizonyítható adathibát (kiskorú, egyedül álló,
 * hivatkozás nélküli karton) rendezzük automatikusan.
 * Olvasási hibánál DOB — a hívó fail-closed módon kezeli.
 */
async function planAdultConflict(
  supabase: Db,
  childId: number,
  targetFamilyId: number,
  blocked: AssignConflict[],
  allowed: Set<number>,
): Promise<AdultConflictPlan> {
  const releaseFamilyIds: number[] = []
  const moves: FamilyLinkMove[] = []
  const notes: string[] = []
  const infos: string[] = []
  /** A tévesnek felismert kartonok neve — vegyes esetben ezt is ki kell írni */
  const releasableNames: string[] = []
  let block = false

  const famIds = [...new Set(blocked.map((b) => b.familyId))]
  const [famRes, gyRes, personRes] = await Promise.all([
    supabase.from('csalad').select('id, id_ferfi, id_no').in('id', famIds),
    supabase.from('gyerek').select('id_csalad, id_szemely').in('id_csalad', famIds),
    supabase.from('szemely').select('id, sz_datum').eq('id', childId).maybeSingle(),
  ])
  if (famRes.error) throw new Error(`felnott-karton-olvasas: ${famRes.error.message}`)
  if (gyRes.error) throw new Error(`gyerek-olvasas (felnott-karton): ${gyRes.error.message}`)
  if (personRes.error) throw new Error(`szemely-olvasas (felnott-karton): ${personRes.error.message}`)

  const szDatum = (personRes.data?.sz_datum as string | null) ?? null
  const eletkor = szDatum
    ? Math.floor((Date.now() - new Date(`${szDatum}T00:00:00Z`).getTime()) / (365.2425 * 24 * 3600 * 1000))
    : null
  const kiskoru = eletkor != null && eletkor < 18

  // Review-fix: a szerkesztett tag SAJÁT gyerek-sora (felnőtt ÉS gyermek
  // ugyanazon a kartonon — PR-18 előtti adathiba) nem számít „gyermeknek",
  // különben a téves karton „saját családot alapított" nyugtázást kapna.
  // A gyerek táblán nincs UNIQUE, ezért (karton, személy) szerint dedupálunk.
  const childCount = new Map<number, number>()
  const seenChild = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyRes.data || []) as any[]) {
    const fid = g.id_csalad as number
    const pid = g.id_szemely as number
    if (pid === childId) continue
    const key = `${fid}|${pid}`
    if (seenChild.has(key)) continue
    seenChild.add(key)
    childCount.set(fid, (childCount.get(fid) ?? 0) + 1)
  }

  const famNames = await loadFamilyDisplayNames(supabase, [targetFamilyId, ...famIds])
  const toName = famNames.get(targetFamilyId) ?? `Család #${targetFamilyId}`

  for (const b of blocked) {
    const fromName = b.familyName || famNames.get(b.familyId) || `Család #${b.familyId}`
    if (!allowed.has(b.familyId)) {
      block = true
      notes.push(
        `${b.personName} egy másik gyülekezet családi kartonján (${fromName}) felnőtt tag — ahhoz nem nyúlunk, ezért a családba sorolás elmaradt. A szülő-kapcsolat rögzült, a családfán látszik.`,
      )
      continue
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fam = ((famRes.data || []) as any[]).find((f) => f.id === b.familyId)
    const masikFelnott = fam
      ? [fam.id_ferfi as number | null, fam.id_no as number | null].find((v) => v != null && v !== childId) ?? null
      : null
    const gyermekek = childCount.get(b.familyId) ?? 0
    const egyedulAll = masikFelnott == null && gyermekek === 0

    if (egyedulAll && kiskoru) {
      // ADATHIBA: kiskorú saját, üres kartonon „felnőttként" — ezt rendezzük
      if (await hasFamilyReferences(supabase, b.familyId)) {
        block = true
        notes.push(
          `${b.personName} (${eletkor} éves) egy külön, üres kartonon (${fromName}) szerepel felnőttként, de ahhoz pénzügyi vagy látogatási előzmény kötődik, ezért nem zártuk le és nem is soroltuk át. Nézd át a kartont.`,
        )
        continue
      }
      releaseFamilyIds.push(b.familyId)
      releasableNames.push(fromName)
      moves.push({
        personId: childId,
        personName: b.personName,
        fromFamilyId: b.familyId,
        fromFamilyName: fromName,
        toFamilyId: targetFamilyId,
        toFamilyName: toName,
        sibling: false,
      })
      continue
    }

    // Nem adathiba → a tagságot NEM bántjuk
    block = true
    if (kiskoru && !egyedulAll) {
      notes.push(
        `${b.personName} ${eletkor} évesen felnőtt tagként (családfő vagy házastárs) szerepel a(z) ${fromName} kartonon — ez valószínűleg téves szerep. Nézd át a kartont; amíg így van, a szülei kartonjára nem soroltuk át.`,
      )
    } else if (egyedulAll) {
      infos.push(
        `${b.personName} saját, egyszemélyes háztartásként szerepel a nyilvántartásban (${fromName}), ezért ott hagytuk — a szülőkkel a rokoni kapcsolat rögzült, a családfán megjelenik. Ha mégis a szülei háztartásához tartozik, a személyi karton „Családhoz rendelés" gombjával helyezheted át.`,
      )
    } else {
      const reszek = [
        masikFelnott != null ? 'házastárssal' : null,
        gyermekek > 0 ? `${gyermekek} gyermekkel` : null,
      ].filter(Boolean).join(' és ')
      infos.push(
        `${b.personName} saját családot alapított (${fromName}${reszek ? `, ${reszek}` : ''}), ezért ott maradt felnőtt tagként — így helyes, nincs teendő. A szülőkkel a rokoni kapcsolat rögzült, a családfán megjelenik.`,
      )
    }
  }

  // Vegyes eset (review-fix): ha BÁRMELYIK karton blokkol, a tagságot nem
  // írjuk át, ezért a felismert téves kartont sem zárjuk le — de ez ne
  // vesszen el némán.
  if (block && releasableNames.length > 0) {
    const tobb = releasableNames.length > 1
    notes.push(
      `${releasableNames.join(', ')} — ${tobb ? 'ezeket a kartonokat' : 'ezt a kartont'} tévesnek ismertük fel (üres, egyszemélyes karton), de a fenti akadály miatt most nem zártuk le. Az akadály rendezése után mentsd újra a tagot, akkor automatikusan rendeződik.`,
    )
  }

  return { releaseFamilyIds, moves, notes, infos, block }
}

/**
 * Egy családi karton háztartásának ARCHIVÁLÁSA (a deleteFamily mintája):
 * isaktiv=false + ervenyes_ig, és minden nyitott tagság lezárása. A
 * syncHouseholdFromCsalad itt NEM jó: a célállapotot a csalad id_ferfi/id_no
 * mezői adják, ezért a tag háztartás-sora nyitva maradna (haztartas nélküli
 * kartonnál pedig új, üres háztartás keletkezne) — fantom háztartás lenne a
 * lélekszám- és körzet-számításokban.
 */
async function archiveFamilyHousehold(supabase: Db, congregationId: string, familyId: number) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: rows, error } = await supabase
    .from('haztartas')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('legacy_csalad_id', familyId)
    .is('ervenyes_ig', null)
  if (error) throw new Error(`haztartas-olvasas (archivalas): ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (rows || []) as any[]) {
    const { error: hErr } = await supabase
      .from('haztartas')
      .update({ isaktiv: false, ervenyes_ig: today })
      .eq('id', h.id)
    if (hErr) throw new Error(`haztartas-archivalas: ${hErr.message}`)
    const { error: tErr } = await supabase
      .from('haztartas_tag')
      .update({ ervenyes_ig: today })
      .eq('id_haztartas', h.id)
      .is('ervenyes_ig', null)
    if (tErr) throw new Error(`haztartas_tag-lezaras: ${tErr.message}`)
  }
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
  const infos: string[] = []
  const closedFamilies: string[] = []
  /** false = valamelyik szülő-él rögzítése elbukott (a fán nem fog látszani) */
  let parentEdgesOk = true
  const done = (linked: boolean, familyId: number | null): EnsureChildFamilyResult => ({
    linked,
    familyId,
    warning: notes.length > 0 ? notes.join(' ') : null,
    moves,
    notes,
    infos,
    closedFamilies,
    parentLinked: parentEdgesOk && !!(ferfiId || noId),
  })

  if (!ferfiId && !noId) return done(false, null)

  // 1) A szülő(k) aktív családja — vagy új család.
  // Review-fix: DETERMINISZTIKUS választás (order) + több-találat-őr: ha a
  // szülőnek több aktív kartonja van (pl. csak az egyik szülő oldódott fel),
  // a tagot a legrégebbibe soroljuk, de összevonást NEM végzünk.
  let query = supabase.from('csalad').select('id, id_ferfi, id_no').eq('isaktiv', true)
  if (ferfiId) query = query.eq('id_ferfi', ferfiId)
  if (noId) query = query.eq('id_no', noId)
  const { data: existingFam, error: famLookupErr } = await query.order('id', { ascending: true }).limit(10)
  /** true = nem hozunk létre új kartont (de a vér szerinti él rögzül) */
  let skipCreate = false
  /** true = meglévő „fél" kartont egészítettünk ki → a háztartást szinkronizálni kell */
  let filledHalf = false
  if (famLookupErr) {
    // Review-fix: FAIL-CLOSED. Az elnyelt olvasási hiba korábban 0 találatnak
    // látszott → új (duplikált) kartont hoztunk volna létre, és a VALÓDI
    // kartont vontuk volna össze bele.
    notes.push('A szülő családi kartonjának lekérdezése nem sikerült, ezért a családba sorolás most elmaradt — a szülő-kapcsolat a családfán rögzül; a családhoz rendelést próbáld újra a személyi karton „Családhoz rendelés" gombjával.')
    skipCreate = true
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const famCandidates = skipCreate ? 0 : ((existingFam || []) as any[]).length
  const bothParentsKnown = !!ferfiId && !!noId
  // Több aktív karton EGY ismert szülőnél = jellemzően ÚJRAHÁZASODÁS: nem
  // tudjuk eldönteni, melyik házasságból való a gyermek, és a rossz kartonra
  // sorolás a MÁSIK felnőttet tenné vér szerinti szülővé. Ilyenkor nem
  // rendezünk tagságot, csak jelezünk.
  const ambiguousTarget = famCandidates > 1 && !bothParentsKnown
  const allowMerge = famCandidates <= 1

  let famId: number | null = null
  /** true = a kartont MOST hoztuk létre — ha üresen marad, takarítjuk */
  let createdNow = false
  if (famCandidates > 0) {
    famId = existingFam![0].id as number
    if (ambiguousTarget) {
      notes.push(
        `A megtalált szülőnek ${famCandidates} aktív családi kartonja van (jellemzően újabb házasság vagy duplikátum), és a másik szülőt nem sikerült beazonosítani. Ezért a tagot NEM soroltuk automatikusan egyik kartonhoz sem — a szülő-kapcsolat rögzült (a családfán látszik), a családhoz rendelést a személyi karton „Családhoz rendelés" gombjával végezd el, hogy biztosan a jó kartonra kerüljön.`,
      )
    } else if (famCandidates > 1) {
      notes.push(
        `A szülő-párosnak ${famCandidates} aktív családi kartonja van a nyilvántartásban — a tagot a legrégebbibe soroltuk, és a kartonokat NEM vontuk össze. Nézd át őket, és a felesleges duplikátumot zárd le.`,
      )
    }
  } else if (bothParentsKnown && !skipCreate) {
    // 2026-08-04 (PR-26): FÉL KARTON KIEGÉSZÍTÉSE. A fenti keresés MINDKÉT
    // szülőre szűr, ezért a „csak apával" (vagy csak anyával) rögzített, üres
    // másik hellyel élő kartont nem találja meg — eddig ilyenkor ÚJ, duplikált
    // kartont hozott létre a már meglévő mellé. Most a hiányzó helyet töltjük
    // ki (ugyanazon az RPC-n, mint a Családok fül mentése), és csak akkor
    // készül új karton, ha ilyen fél karton sincs.
    const { data: halfRows, error: halfErr } = await supabase
      .from('csalad')
      .select('id, id_ferfi, id_no, id_csoport')
      .eq('isaktiv', true)
      .or(`and(id_ferfi.eq.${ferfiId},id_no.is.null),and(id_no.eq.${noId},id_ferfi.is.null)`)
      .order('id', { ascending: true })
      .limit(5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const halves = (halfRows || []) as any[]
    if (halfErr) {
      notes.push('A meglévő (hiányos) családi kartonok lekérdezése nem sikerült, ezért a családba sorolás most elmaradt — a szülő-kapcsolat a családfán rögzül; próbáld újra a személyi karton „Családhoz rendelés" gombjával.')
      skipCreate = true
    } else if (halves.length > 1) {
      notes.push('A szülőknek több, hiányosan kitöltött családi kartonja is van — nem tudtuk eldönteni, melyiket egészítsük ki, ezért a tagot nem soroltuk be (új kartont sem hoztunk létre). Nézd át a Családok fülön, és zárd le a feleslegeseket.')
      skipCreate = true
    } else if (halves.length === 1) {
      const half = halves[0]
      const hianyzo = half.id_ferfi == null ? 'édesapa' : 'édesanya'
      // A meglévő gyermek-lista FAIL-CLOSED olvasása: az RPC a p_id-s ágon
      // ÚJRAÍRJA a gyerek-sorokat, ezért egy elnyelt olvasási hiba az összes
      // gyermeket törölné a kartonról.
      const { data: gRows, error: gErr } = await supabase
        .from('gyerek').select('id_szemely').eq('id_csalad', half.id)
      if (gErr) {
        notes.push(`A(z) meglévő családi karton gyermeklistája nem olvasható (${gErr.message}), ezért biztonságból nem nyúltunk hozzá — a szülő-kapcsolat a családfán rögzül. Vedd fel a hiányzó ${hianyzo}t a családi kartonon.`)
        skipCreate = true
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingKids = [...new Set(((gRows || []) as any[]).map((r) => r.id_szemely as number))]
        const masGyerekek = existingKids.filter((id) => id !== childId)
        if (masGyerekek.length > 0) {
          // PR-23 P0-elv: a hiányzó szülő beírása a kartonon MÁR SZEREPLŐ
          // gyermekeknek is vér szerinti szülőjévé tenné (a háztartás-szinkron
          // mindkét felnőttől ír szülő-élt MINDEN gyermekre) — lehet, hogy
          // azoknak más az édesanyjuk/édesapjuk. Ezt nem tesszük automatikusan.
          // KONKRÉT jelentés (PR-30): melyik karton, ki van rajta, kit írnánk
          // be, és kik a rajta lévő gyermekek.
          const beirandoId = half.id_ferfi == null ? ferfiId : noId
          const meglevoId = half.id_ferfi == null ? noId : ferfiId
          const [{ data: nevRows }, famNev] = await Promise.all([
            supabase.from('szemely').select('id, csaladnev, k_nev')
              .in('id', [beirandoId, meglevoId, ...masGyerekek].filter((v): v is number => v != null)),
            loadFamilyDisplayNames(supabase, [half.id as number]),
          ])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nevOf = (id: number | null) => ((nevRows || []) as any[])
            .filter((r) => r.id === id)
            .map((r) => `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim())[0] || `#${id}`
          const kartonNev = famNev.get(half.id as number) ?? `Család #${half.id}`
          notes.push(
            `${kartonNev}: a kartonon ${nevOf(meglevoId)} szerepel, a(z) ${hianyzo} helye üres, és már rajta van ${masGyerekek.map(nevOf).join(', ')}. `
            + `Ha automatikusan beírnánk ${nevOf(beirandoId)} nevét, a rendszer őt ${masGyerekek.length > 1 ? 'ezeknek a gyermekeknek' : 'ennek a gyermeknek'} a VÉR SZERINTI szülőjévé is tenné — `
            + `ezért NEM írtuk be, a döntést rád bízzuk. Ha valóban ${nevOf(beirandoId)} a másik szülő, nyisd meg a(z) ${kartonNev} kartont, és vedd fel rá. `
            + `(Új kartont szándékosan nem hoztunk létre, hogy ne legyen duplikátum.)`,
          )
          skipCreate = true
        } else {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
            p_id: half.id as number,
            p_id_ferfi: ferfiId,
            p_id_no: noId,
            p_gyerek_ids: existingKids,
            p_c_utcaid: null,
            p_c_szam: null,
            // az RPC a körzetet FELTÉTEL NÉLKÜL felülírja — a meglévőt adjuk vissza
            p_id_csoport: (half.id_csoport as number | null) ?? null,
          })
          const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
          if (!rpcErr && rpcRes?.status === 'ok' && rpcRes.family_id) {
            famId = rpcRes.family_id
            filledHalf = true
            // KONKRÉT jelentés: melyik karton, ki volt rajta, kit írtunk be
            const beirtId = half.id_ferfi == null ? ferfiId : noId
            const meglevoId = half.id_ferfi == null ? noId : ferfiId
            const [{ data: nevRows }, famNev] = await Promise.all([
              supabase.from('szemely').select('id, csaladnev, k_nev').in('id', [beirtId, meglevoId]),
              loadFamilyDisplayNames(supabase, [half.id as number]),
            ])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nevOf = (id: number | null) => ((nevRows || []) as any[])
              .filter((r) => r.id === id)
              .map((r) => `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim())[0] || `#${id}`
            infos.push(
              `${famNev.get(half.id as number) ?? `Család #${half.id}`}: a kartonon eddig csak ${nevOf(meglevoId)} szerepelt, a(z) ${hianyzo} helye üres volt — oda ${nevOf(beirtId)} került. Új kartont szándékosan nem hoztunk létre, így nincs duplikátum. Nincs teendő.`,
            )
          } else {
            const ok = rpcErr?.message || rpcRes?.message || 'ismeretlen hiba'
            notes.push(`A meglévő (hiányos) családi karton kiegészítése nem sikerült (${ok}) — a tagot nem soroltuk családba; a szülő-kapcsolat a családfán rögzül. Nyisd meg a családi kartont, és vedd fel rá a hiányzó ${hianyzo}t.`)
            skipCreate = true
          }
        }
      }
    }
  }

  if (!famId && famCandidates === 0 && !skipCreate) {
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
      // 2026-08-03 (PR-25): a családi kartont UGYANAZZAL az RPC-vel hozzuk
      // létre, mint a Családok fül mentése. A közvetlen INSERT a `csalad`
      // RLS-szabályán bukhat: az még a RÉGI, szűk ellenőrzést használja
      // (profiles.congregation_id skalár), és nem ismeri az egyházkerületi
      // admin hatókört sem — az RPC viszont
      // SECURITY DEFINER, és a bővített current_user_can_access_congregation()
      // szerint dönt. Hibánál a TÉNYLEGES okot is kiírjuk.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
        p_id: null,
        p_id_ferfi: ferfiId,
        p_id_no: noId,
        p_gyerek_ids: [],
        p_c_utcaid: cUtcaid,
        p_c_szam: cSzam || '1',
        p_id_csoport: null,
      })
      const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
      if (!rpcErr && rpcRes?.status === 'ok' && rpcRes.family_id) {
        famId = rpcRes.family_id
        createdNow = true
      } else {
        const ok = rpcErr?.message
          || rpcRes?.message
          || (rpcRes?.status === 'forbidden'
            ? 'nincs jogosultságod ehhez a gyülekezethez (jelentkezz be újra, vagy válts profilt a fejlécben)'
            : 'ismeretlen hiba')
        notes.push(`Az új családi karton létrehozása nem sikerült (${ok}), ezért a tagot nem soroltuk családba — a szülő-kapcsolat rögzült. A családhoz rendelést a személyi karton „Családhoz rendelés" gombjával végezd el; ha ott is hibát kapsz, jelezd ezt az üzenetet.`)
      }
    } else {
      notes.push('A család nem hozható létre automatikusan, mert sem a taghoz, sem a szülőhöz nincs rögzített utca — add meg a lakcímet, majd használd a személyi karton „Családhoz rendelés" gombját.')
    }
  }

  // 2) Tagsági rendezés: automatikus áthelyezés / összevonás vagy észrevétel
  // Bizonytalan cél-karton (újraházasodás) → nem nyúlunk a tagsághoz
  let blockMembership = ambiguousTarget
  let plan: AutoMovePlan | null = null
  let adultRelease: AdultConflictPlan | null = null
  let allowedFamilies = new Set<number>()
  if (famId && !blockMembership) {
    try {
      const guard = await findMembershipConflicts(supabase, congregationId, [childId], famId)
      allowedFamilies = guard.allowed
      const fw = foreignMembershipWarning(guard.foreign)
      if (fw) notes.push(fw)

      if (guard.blocked.length > 0) {
        // FELNŐTT-szerepű ütközés (PR-24): a saját családot NEM bontjuk meg —
        // csak a bizonyítható adathibát (kiskorú, üres saját karton) rendezzük.
        const adultPlan = await planAdultConflict(supabase, childId, famId, guard.blocked, guard.allowed)
        notes.push(...adultPlan.notes)
        infos.push(...adultPlan.infos)
        blockMembership = adultPlan.block
        if (!adultPlan.block && adultPlan.releaseFamilyIds.length > 0) {
          adultRelease = adultPlan
        }
      }
      // Review-fix (P1): UGYANAZ a tag lehet EGYSZERRE felnőtt az egyik
      // kartonon (blocked) és gyermek egy másikon (movable). Ha a felnőtt-
      // ütközést feloldottuk, a gyermek-tagságot is rendezni KELL — különben
      // két aktív háztartásban maradna (a járulék-alap „egy aktív háztartás").
      // A felnőtt-ágon már rendezett (lezárandó) kartont NEM adjuk át a
      // gyermek-ágnak: azt az adultRelease teljes egészében kezeli (gyerek-sor
      // törlés + karton lezárás + háztartás archiválás). Különben a
      // moveChildMemberships szinkronja újra megnyitná a háztartást.
      const releasedIds = new Set(adultRelease?.releaseFamilyIds ?? [])
      const movableForPlan = guard.movable.filter((m) => !releasedIds.has(m.familyId))
      if (!blockMembership && movableForPlan.length > 0) {
        plan = await planAutoMove(supabase, congregationId, famId, movableForPlan, guard.allowed, { allowMerge })
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
          notes.push(`A gyermek családhoz sorolása nem sikerült (${error.message}) — próbáld újra a személyi karton „Családhoz rendelés" gombjával; ha ott is hibát kapsz, jelezd ezt az üzenetet.`)
        }
      }
      linked = insertOk && (have.has(childId) || toInsert.includes(childId))

      if (insertOk && adultRelease) {
        // PR-24: a téves, üres felnőtt-karton lezárása a beszúrás UTÁN
        moves.push(...adultRelease.moves)
        const famNames = await loadFamilyDisplayNames(supabase, adultRelease.releaseFamilyIds)
        for (const oldFamId of adultRelease.releaseFamilyIds) {
          const oldName = famNames.get(oldFamId) ?? `Család #${oldFamId}`
          // Az „egyszerre szülő ÉS gyermek ugyanazon a kartonon" adathibánál a
          // tagnak gyerek-sora is lehet rajta — az is szűnjön meg
          const { error: gyDelErr } = await supabase
            .from('gyerek').delete().eq('id_csalad', oldFamId).eq('id_szemely', childId)
          if (gyDelErr) {
            notes.push(`A(z) ${oldName} kartonról a tag gyermek-sorát nem sikerült törölni — nyisd meg és távolítsd el kézzel.`)
          }
          const { error: deErr } = await supabase.from('csalad').update({ isaktiv: false }).eq('id', oldFamId)
          if (deErr) {
            notes.push(`A tag a szülei kartonjára került, de a korábbi, üres saját kartonját (${oldName}) nem sikerült lezárni — nyisd meg és zárd le kézzel, különben két helyen szerepel.`)
            continue
          }
          closedFamilies.push(oldName)
          // Sikeres automatikus rendezés → semleges „nincs teendő" csatorna
          infos.push(`A tag külön, üres saját kartonja (${oldName}) tévesen mutatta felnőttnek, ezért lezártuk, és a szülei kartonjára soroltuk — nincs további teendő.`)
          try {
            // Review-fix: EXPLICIT archiválás (a sync itt nyitva hagyná a
            // tag háztartás-sorát, mert a csalad felnőtt-mezője rá mutat)
            await archiveFamilyHousehold(supabase, congregationId, oldFamId)
          } catch (e) {
            console.warn('[ensureChildFamilyLink] lezárt felnőtt-karton archiválása sikertelen:',
              e instanceof Error ? e.message : e)
            notes.push(`A(z) ${oldName} karton lezárult, de a hozzá tartozó háztartás archiválása nem sikerült — nyisd meg a Családok fülön és ellenőrizd.`)
          }
        }
      }
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
              // A kiürült karton háztartását EXPLICIT archiváljuk (a sync itt a
              // felnőtt-mezők miatt nyitva hagyná a tagságokat — fantom
              // háztartás lenne a lélekszám- és körzet-számításban). A
              // rokonsági éleket a moveChildMemberships szinkronja már
              // rendezte, a cél-családét pedig a 4. lépés.
              await archiveFamilyHousehold(supabase, congregationId, oldFamId)
            } catch (e) {
              console.warn('[ensureChildFamilyLink] lezárt család archiválása sikertelen:',
                e instanceof Error ? e.message : e)
              notes.push(`A(z) ${oldName} karton lezárult, de a hozzá tartozó háztartás archiválása nem sikerült — nyisd meg a Családok fülön és ellenőrizd.`)
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
      }
      if (insertOk && !adultRelease && !plan && toInsert.includes(childId)) {
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
    // 2026-08-04 (PR-32): a hibák NEM veszhetnek el némán — eddig egy elbukó
    // beszúrás után a felület azt állította, hogy „a szülő-kapcsolat rögzült",
    // a családfán viszont nem jelent meg semmi.
    const elHibak: string[] = []
    async function ensureSzuloKapcsolat(szuloId: number, cimke: string) {
      const { data: existing, error: readErr } = await supabase
        .from('szemely_kapcsolat')
        .select('id')
        .eq('id_szemely_1', szuloId)
        .eq('id_szemely_2', childId)
        .eq('tipus', 'szulo_gyermek')
        .is('ervenyes_ig', null)
        .limit(1)
      if (readErr) { elHibak.push(`${cimke}: ${readErr.message}`); return }
      if (existing?.length) return
      const { error: insErr } = await supabase.from('szemely_kapcsolat').insert([{
        id_szemely_1: szuloId, id_szemely_2: childId,
        tipus: 'szulo_gyermek', ver_szerinti: true,
        congregation_id: congregationId,
      }])
      if (insErr) elHibak.push(`${cimke}: ${insErr.message}`)
    }
    if (ferfiId) await ensureSzuloKapcsolat(ferfiId, 'édesapa')
    if (noId) await ensureSzuloKapcsolat(noId, 'édesanya')
    if (elHibak.length > 0) {
      parentEdgesOk = false
      notes.push(
        `A szülő-kapcsolat rögzítése NEM sikerült (${elHibak.join('; ')}), ezért a családfán most nem jelenik meg. Mentsd el újra a tagot; ha a hiba ismétlődik, jelezd ezt az üzenetet.`,
      )
    }

    // A fél karton kiegészítése után AKKOR is szinkronizálni kell, ha a tag
    // tagsága végül nem jött létre — különben a csalad-on már ott a másik
    // szülő, a háztartásban viszont nem.
    if (famId && (linked || filledHalf)) {
      await syncHouseholdFromCsalad(supabase, famId, congregationId)
    }
  } catch (e) {
    parentEdgesOk = false
    console.warn('[ensureChildFamilyLink] dual-write sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
    notes.push(
      `A szülő-kapcsolat rögzítése közben hiba történt (${e instanceof Error ? e.message : 'ismeretlen hiba'}) — mentsd el újra a tagot, és ellenőrizd a családfán.`,
    )
  }

  // 5) TAKARÍTÁS (2026-08-03, PR-25): ha MOST hoztunk létre kartont, de a tag
  //    végül nem került bele (ütközés vagy hiba), ne maradjon árva üres karton
  //    — különben minden sikertelen mentés szaporítaná a duplikátumokat.
  if (createdNow && !linked && famId) {
    const { error: cleanErr } = await supabase.from('csalad').update({ isaktiv: false }).eq('id', famId)
    if (!cleanErr) {
      try {
        await archiveFamilyHousehold(supabase, congregationId, famId)
      } catch (e) {
        console.warn('[ensureChildFamilyLink] üres karton archiválása sikertelen:',
          e instanceof Error ? e.message : e)
      }
      famId = null
    }
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
