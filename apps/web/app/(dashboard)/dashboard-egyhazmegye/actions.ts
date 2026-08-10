'use server'

/**
 * Egyházmegyei szintű szerver akciók:
 *  - Feloldási kérelmek lekérdezése és elbírálása
 *  - Későbbiekben: dokumentum workflow (Fázis D)
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveDioceseScopeId, resolveDioceseScopeIds } from '@/lib/auth/level-scope'
import type { UnlockRequest } from '@/lib/constants/documents'

// ---------------------------------------------------------------------------
// 2026-08-11 (K5 P2 #6) — TÖRÖLVE: `getUnlockRequests` (106 sor).
// Egyetlen fogyasztója a `components/dashboard/unlock-requests-card.tsx` volt,
// amit egyetlen útvonal sem mountolt (helyette a
// `components/dashboard/diocese/requests-section.tsx` fut). A feloldási
// kérelmeket ugyanebben a fájlban a LENTEBBI `getCongregationOverviewData`
// állítja elő ugyanabból a két táblából — vagyis ugyanaz a lekérdezés élt itt
// kétszer, és a két másolat már el is kezdett szétcsúszni. Az elbíráló akciók
// (`approveUnlockRequest` / `rejectUnlockRequest`) ÉLNEK, azokhoz nem nyúltam.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Feloldási kérelmek elbírálása
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<UnlockRequest['type'], string> = {
  budget: 'költségvetés',
  accounting: 'számadás',
  inventory: 'vagyonleltár',
  jelentes: 'lelkészi jelentés',
}

/**
 * 2026-08-09: tulajdon-ellenőrzés a feloldási mutációk előtt.
 *
 * A kliens által küldött congregationId-t NEM fogadjuk el vakon: a cél-gyülekezet
 * diocese_id-jának egyeznie kell a hívó feloldott egyházmegye-hatókörével
 * (master/rendszergazda kivétel). Enélkül — az RLS állapotától függően — egy
 * esperes IDEGEN egyházmegye gyülekezetének költségvetését/számadását is
 * fel tudta oldani (cross-diocese un-finalization).
 *
 * @returns null, ha rendben; különben magyar hibaüzenet.
 */
async function assertCongregationInCallerDiocese(
  access: Awaited<ReturnType<typeof getEffectiveAccessContext>>,
  congregationId: string,
): Promise<string | null> {
  if (access.master || access.admin) return null

  // 2026-08-09 (review-fix): a TELJES hatókör-unió számít (két egyházmegyét is
  // vihet ugyanaz a tisztségviselő) — a document-actions assert-jével azonosan.
  const dioceseIds = resolveDioceseScopeIds(access)
  if (dioceseIds.length === 0) {
    return 'Nincs egyházmegye rendelve a fiókjához — a kérelem nem bírálható el.'
  }

  const { data: cong, error } = await access.supabase
    .from('congregations')
    .select('diocese_id')
    .eq('id', congregationId)
    .maybeSingle()

  if (error) return `Hiba a gyülekezet ellenőrzésekor: ${error.message}`
  if (!cong) return 'A gyülekezet nem található.'
  const congDioceseId = (cong as { diocese_id: string | null }).diocese_id
  if (!congDioceseId || !dioceseIds.includes(congDioceseId)) {
    return 'Ez a gyülekezet nem az Ön egyházmegyéjéhez tartozik.'
  }
  return null
}

export async function approveUnlockRequest(
  congregationId: string,
  year: string,
  type: UnlockRequest['type'],
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.esperes && !access.admin && !access.master) {
    return { error: 'Nincs jogosultsága a feloldáshoz.' }
  }

  // 2026-08-09: a cél-gyülekezetnek a hívó egyházmegyéjébe kell tartoznia
  const ownershipError = await assertCongregationInCallerDiocese(access, congregationId)
  if (ownershipError) return { error: ownershipError }

  const { supabase } = access

  if (type === 'jelentes') {
    // 2026-07-17 (F5): a hivatalos lelkészi jelentés külön táblában él
    // (lelkeszi_jelentes, kulcs: congregation_id + ev). A feloldás
    // visszaállítja szerkeszthetőre és törli a véglegesítés nyomait —
    // a snapshot is nullázódik, mert az a véglegesített állapot fagyasztása.
    // 2026-08-09: .select()-tel a 0-soros (RLS által elnyelt) update-et is
    // hibaként jelezzük, nem hamis sikerként.
    const { data: updated, error } = await supabase
      .from('lelkeszi_jelentes')
      .update({
        statusz: 'szerkesztes',
        snapshot: null,
        veglegesitve_at: null,
        veglegesito_profile_id: null,
        unlock_requested: false,
        unlock_reason: null,
      })
      .eq('ev', Number(year))
      .eq('congregation_id', congregationId)
      .select('congregation_id')

    if (error) return { error: `Hiba: ${error.message}` }
    if (!updated || updated.length === 0) {
      return { error: 'A feloldás nem történt meg — a jelentés nem található, vagy nincs jogosultsága hozzá.' }
    }
  } else {
    const updates: Record<string, unknown> = {}
    if (type === 'budget') {
      updates.budget_finalized = false
      updates.unlock_requested = false
      updates.unlock_reason = null
    } else if (type === 'accounting') {
      updates.accounting_finalized = false
      updates.accounting_unlock_requested = false
      updates.accounting_unlock_reason = null
    } else if (type === 'inventory') {
      updates.leltar_unlock_requested = false
      updates.leltar_unlock_reason = null
      // A leltár véglegesítési flag más logikával működik (leltar_tetelek szintjén)
    }

    // 2026-08-09: 0-soros update (RLS-elnyelés / rossz kulcs) = hiba, nem siker
    const { data: updated, error } = await supabase
      .from('bealitas')
      .update(updates)
      .eq('id', year)
      .eq('congregation_id', congregationId)
      .select('congregation_id')

    if (error) return { error: `Hiba: ${error.message}` }
    if (!updated || updated.length === 0) {
      return { error: 'A feloldás nem történt meg — a beállítás-sor nem található, vagy nincs jogosultsága hozzá.' }
    }
  }

  // 2026-08-09 (review-fix): a feloldás a BEKÜLDÖTT dokumentum sorát is
  // nyitja. Enélkül a lelkész feloldás után sem tudná újra beküldeni az
  // iratot: a dokumentumközpont felülírás-védelme a 'finalized' sort blokkolja
  // ('returned' viszont újra beküldhető). Best-effort: ha nincs ilyen sor
  // (még nem küldték be), az nem hiba.
  const unlockedDocType: string | null =
    type === 'accounting' ? 'szamadas'
      : type === 'budget' ? 'koltsegvetes'
        : type === 'jelentes' ? 'lelkeszi_jelentes'
          : type === 'inventory' ? 'vagyonleltar'
            : null
  if (unlockedDocType) {
    try {
      const { data: subRow } = await supabase
        .from('document_submissions')
        .select('id, status, notes')
        .eq('congregation_id', congregationId)
        .eq('document_type', unlockedDocType)
        .eq('year', Number(year))
        .in('status', ['submitted', 'received', 'reviewed', 'finalized'])
        .maybeSingle()
      if (subRow?.id) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        const prev = (subRow.notes as string | null) || ''
        await supabase
          .from('document_submissions')
          .update({
            status: 'returned',
            finalized_at: null,
            finalized_by: null,
            forwarded_to_kerulet: false,
            forwarded_at: null,
            notes: `${prev ? `${prev}\n` : ''}[${stamp}] Szerkesztésre feloldva az egyházmegye jóváhagyásával — a javítás után újra beküldhető.`,
          })
          .eq('id', subRow.id)
      }
    } catch {
      // Nem kritikus — a feloldás maga megtörtént.
    }
  }

  // Csengő értesítés a gyülekezet aktív lelkészei + könyvelői részére
  await sendUnlockDecisionNotification(supabase, {
    congregationId,
    year,
    type,
    decision: 'approved',
  })

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/penzugy')
  revalidatePath('/leltar')
  if (type === 'jelentes') revalidatePath('/munkanaplo')
  return { success: true }
}

export async function rejectUnlockRequest(
  congregationId: string,
  year: string,
  type: UnlockRequest['type'],
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.esperes && !access.admin && !access.master) {
    return { error: 'Nincs jogosultsága az elutasításhoz.' }
  }

  // 2026-08-09: a cél-gyülekezetnek a hívó egyházmegyéjébe kell tartoznia
  const ownershipError = await assertCongregationInCallerDiocese(access, congregationId)
  if (ownershipError) return { error: ownershipError }

  const { supabase } = access

  if (type === 'jelentes') {
    // 2026-07-17 (F5): elutasításkor CSAK a kérelem-mezők nullázódnak —
    // a jelentés véglegesített marad (statusz/snapshot érintetlen).
    // 2026-08-09: 0-soros update = hiba, nem hamis siker.
    const { data: updated, error } = await supabase
      .from('lelkeszi_jelentes')
      .update({ unlock_requested: false, unlock_reason: null })
      .eq('ev', Number(year))
      .eq('congregation_id', congregationId)
      .select('congregation_id')

    if (error) return { error: `Hiba: ${error.message}` }
    if (!updated || updated.length === 0) {
      return { error: 'Az elutasítás nem történt meg — a jelentés nem található, vagy nincs jogosultsága hozzá.' }
    }
  } else {
    const updates: Record<string, unknown> = {}
    if (type === 'budget') {
      updates.unlock_requested = false
      updates.unlock_reason = null
    } else if (type === 'accounting') {
      updates.accounting_unlock_requested = false
      updates.accounting_unlock_reason = null
    } else if (type === 'inventory') {
      updates.leltar_unlock_requested = false
      updates.leltar_unlock_reason = null
    }

    // 2026-08-09: 0-soros update = hiba, nem hamis siker
    const { data: updated, error } = await supabase
      .from('bealitas')
      .update(updates)
      .eq('id', year)
      .eq('congregation_id', congregationId)
      .select('congregation_id')

    if (error) return { error: `Hiba: ${error.message}` }
    if (!updated || updated.length === 0) {
      return { error: 'Az elutasítás nem történt meg — a beállítás-sor nem található, vagy nincs jogosultsága hozzá.' }
    }
  }

  // Csengő értesítés a gyülekezet aktív lelkészei + könyvelői részére
  await sendUnlockDecisionNotification(supabase, {
    congregationId,
    year,
    type,
    decision: 'rejected',
  })

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/penzugy')
  if (type === 'jelentes') revalidatePath('/munkanaplo')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Csengő értesítés küldés a javítási kérelem elbírálásáról
// A gyülekezet aktív lelkészei + jóváhagyott könyvelői kapják meg.
// Csendes hibakezelés — ha az értesítés fail, az elbírálás már megtörtént.
// ---------------------------------------------------------------------------

type SupabaseClient = Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase']

async function sendUnlockDecisionNotification(
  supabase: SupabaseClient,
  args: {
    congregationId: string
    year: string
    type: UnlockRequest['type']
    decision: 'approved' | 'rejected'
  },
) {
  try {
    // 1. Címzettek: a gyülekezethez fő szerepkörrel tartozó MINDEN aktív felhasználó.
    //    A congregation_id-vel szűrünk, NEM a role-lal — így ha valaki egyszerre
    //    egyházmegyei admin és lelkész is (dual role), a gyülekezeti minőségében
    //    is megkapja az értesítést. A user_id-alapú Set garantálja, hogy senki
    //    nem kap kétszer ugyanazt.
    const { data: congregationStaff } = await supabase
      .from('profiles')
      .select('id')
      .eq('congregation_id', args.congregationId)
      .eq('status', 'active')

    // 2. Címzettek: jóváhagyott, aktív könyvelők (profile_congregations)
    const { data: bookkeepers } = await supabase
      .from('profile_congregations')
      .select('profile_id')
      .eq('congregation_id', args.congregationId)
      .eq('role_scope', 'konyvelo')
      .eq('approval_status', 'approved')
      .eq('active', true)

    const recipientIds = new Set<string>()
    ;(congregationStaff ?? []).forEach((p) => p.id && recipientIds.add(p.id))
    ;(bookkeepers ?? []).forEach((b) => b.profile_id && recipientIds.add(b.profile_id))

    if (recipientIds.size === 0) return

    const docLabel = TYPE_LABELS[args.type]
    const cim = args.decision === 'approved'
      ? `Javítási kérelem jóváhagyva: ${docLabel}`
      : `Javítási kérelem elutasítva: ${docLabel}`
    const uzenet = args.decision === 'approved'
      ? `Az egyházmegye jóváhagyta a(z) ${args.year}. évi ${docLabel} javítási kérelmét. ` +
        `A dokumentumot újra szerkesztheti, majd véglegesítheti és beküldheti.`
      : `Az egyházmegye elutasította a(z) ${args.year}. évi ${docLabel} javítási kérelmét. ` +
        `A dokumentum véglegesített állapotban marad. Ha szükséges, vegye fel a kapcsolatot az espertessel.`

    // A lelkészi jelentés a munkanapló-oldalon él, a leltár a saját oldalán,
    // minden más a pénzügy-oldalon.
    const hivatkozas = args.type === 'jelentes'
      ? '/munkanaplo'
      : args.type === 'inventory'
        ? '/leltar'
        : '/penzugy'

    const rows = Array.from(recipientIds).map((userId) => ({
      user_id: userId,
      congregation_id: args.congregationId,
      cim,
      uzenet,
      tipus: args.decision === 'approved' ? 'success' : 'warning',
      hivatkozas,
    }))

    await supabase.from('ertesitesek').insert(rows)
  } catch {
    // Csendes — az elbírálás már megtörtént.
  }
}

// ---------------------------------------------------------------------------
// Gyülekezeti áttekintő — egy helyen az összes kérelem + dokumentum
// ---------------------------------------------------------------------------

/**
 * Gyülekezeti áttekintő adatok az egyházmegyei dashboard számára.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházmegye NEM lát bele a gyülekezet pénzügyi/anyakönyvi/tagnyilvántartási
 *   adataiba. CSAK a kötelezően leadott évi dokumentumokat (document_submissions),
 *   az éves jelentést (annual_reports) és a feloldási kérelmeket láthatja.
 *
 *   EZÉRT NEM kérdezzük közvetlenül a `szemely` táblát (tagnyilvántartás).
 *   A választók száma a `valasztok_nevjegyzeke` snapshot-jából kell jönnie
 *   (jövőbeli iteráció), addig nem mutatunk taglétszámot.
 */
export async function getCongregationOverviewData(): Promise<Array<{
  congregationId: string
  congregationName: string
  unlockRequests: UnlockRequest[]
  documentCount: number
  pendingDocuments: number
  /** Választók száma — csak akkor van érték, ha a gyülekezet leadta a választók
   *  névjegyzékét. Egyébként null (nem ismert egyházmegyei szinten). */
  voterCount: number | null
}>> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return []
  if (!access.esperes && !access.admin && !access.master) return []

  const { supabase } = access
  // 2026-08-09: feloldott hatókör (aktív szerep → profile_roles → skalár) +
  // FAIL-CLOSED: NULL-scope diocese-felhasználó ÜRES listát kap, nem az egész
  // egyház gyülekezeteit (a congregations SELECT RLS USING(true), nincs backstop).
  const dioceseId = resolveDioceseScopeId(access)
  if (!dioceseId && !access.master && !access.admin) return []
  const currentYear = new Date().getFullYear()

  // Gyülekezetek lekérdezése — szűretlenül CSAK a rendszergazdai/master ág futhat
  let congQuery = supabase
    .from('congregations')
    .select('id, name')

  if (dioceseId && !access.master) {
    congQuery = congQuery.eq('diocese_id', dioceseId)
  }

  const { data: congregations } = await congQuery

  if (!congregations || congregations.length === 0) return []

  const congIds = congregations.map((c: { id: string }) => c.id)

  // Feloldási kérelmek (bealitas) — flag-eket kérdezzük le, nem pénzügyi adatot
  const { data: bealitasData } = await supabase
    .from('bealitas')
    .select('id, congregation_id, unlock_requested, unlock_reason, accounting_unlock_requested, accounting_unlock_reason, leltar_unlock_requested, leltar_unlock_reason')
    .in('congregation_id', congIds)
    .eq('id', String(currentYear))

  // 2026-07-17 (F5): lelkészi jelentés feloldás-kérelmek (lelkeszi_jelentes) —
  // itt is csak a kérelem-flageket kérdezzük, nem a jelentés tartalmát.
  // Év-szűrés nincs: korábbi évi jelentés feloldás-kérése is megjelenik.
  const { data: jelentesUnlockData } = await supabase
    .from('lelkeszi_jelentes')
    .select('congregation_id, ev, unlock_reason')
    .in('congregation_id', congIds)
    .eq('unlock_requested', true)

  // Dokumentum beküldések — ez az engedélyezett adatforrás az egyházmegye számára
  const { data: docData } = await supabase
    .from('document_submissions')
    .select('congregation_id, status, document_type, snapshot_data')
    .in('congregation_id', congIds)
    .eq('year', currentYear)

  // Választók száma — KIZÁRÓLAG a beküldött választók névjegyzékéből (nem szemely táblából!)
  const voterCounts = new Map<string, number>()
  for (const d of (docData || []) as Array<{ congregation_id: string; document_type: string; snapshot_data: Record<string, unknown> | null }>) {
    if (d.document_type !== 'valasztok_nevjegyzeke' || !d.snapshot_data) continue
    const snap = d.snapshot_data as { totalCount?: number; voterCount?: number }
    const count = typeof snap.totalCount === 'number' ? snap.totalCount
      : typeof snap.voterCount === 'number' ? snap.voterCount
      : null
    if (count !== null) voterCounts.set(d.congregation_id, count)
  }

  // Összesítés
  return congregations.map((cong: { id: string; name: string }) => {
    const bealitas = (bealitasData || []).find((b: { congregation_id: string }) => b.congregation_id === cong.id) as Record<string, unknown> | undefined
    const requests: UnlockRequest[] = []

    if (bealitas?.unlock_requested) {
      requests.push({ congregationId: cong.id, congregationName: cong.name, year: String(currentYear), type: 'budget', reason: (bealitas.unlock_reason as string) || null, requestedAt: null })
    }
    if (bealitas?.accounting_unlock_requested) {
      requests.push({ congregationId: cong.id, congregationName: cong.name, year: String(currentYear), type: 'accounting', reason: (bealitas.accounting_unlock_reason as string) || null, requestedAt: null })
    }
    if (bealitas?.leltar_unlock_requested) {
      requests.push({ congregationId: cong.id, congregationName: cong.name, year: String(currentYear), type: 'inventory', reason: (bealitas.leltar_unlock_reason as string) || null, requestedAt: null })
    }
    // 2026-07-17 (F5): lelkészi jelentés kérelmek — évenként külön sor lehet
    for (const j of (jelentesUnlockData || []).filter((row: { congregation_id: string }) => row.congregation_id === cong.id)) {
      requests.push({ congregationId: cong.id, congregationName: cong.name, year: String(j.ev), type: 'jelentes', reason: j.unlock_reason || null, requestedAt: null })
    }

    const docs = (docData || []).filter((d: { congregation_id: string }) => d.congregation_id === cong.id)
    const pendingDocs = docs.filter((d: { status: string }) => d.status !== 'finalized').length

    return {
      congregationId: cong.id,
      congregationName: cong.name,
      unlockRequests: requests,
      documentCount: docs.length,
      pendingDocuments: pendingDocs,
      voterCount: voterCounts.get(cong.id) ?? null,
    }
  }).sort((a: { congregationName: string }, b: { congregationName: string }) => a.congregationName.localeCompare(b.congregationName))
}
