'use server'

/**
 * Egyházmegyei szintű szerver akciók:
 *  - Feloldási kérelmek lekérdezése és elbírálása
 *  - Későbbiekben: dokumentum workflow (Fázis D)
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  canWriteDioceseScope,
  describeDioceseWriteBlock,
  resolveDioceseScopeId,
  resolveDioceseScopeIds,
} from '@/lib/auth/level-scope'
import { documentSeasonYear, type UnlockRequest } from '@/lib/constants/documents'

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
  // 2026-08-11 (számvevő-kör): a feloldás ÍRÁS. A számvevő (ellenőr) a kérelmet
  // LÁTJA, de nem bírálja el — és ezt beszédes magyar szöveggel mondjuk meg,
  // nem nyers RLS-hibával vagy néma 0-soros UPDATE-tel.
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága a feloldáshoz.' }
  }

  // 2026-08-09: a cél-gyülekezetnek a hívó egyházmegyéjébe kell tartoznia
  const ownershipError = await assertCongregationInCallerDiocese(access, congregationId)
  if (ownershipError) return { error: ownershipError }

  const { supabase } = access
  /** Melyik költségvetés-szint oldódott fel: null = alap, 1..3 = a módosítás. */
  let unlockedBudgetModNumber: 1 | 2 | 3 | null = null

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
      // 2026-08-11 (6. kör, P1 — KÖLTSÉGVETÉS-MÓDOSÍTÁS ZSÁKUTCA): a feloldás
      // eddig MINDIG az ALAP költségvetést nyitotta ki. Csakhogy a gyülekezeti
      // BudgetTab a LEGUTOLSÓ véglegesített szintre kér feloldást (a gomb csak
      // ahhoz jelenik meg, és az indoklás elé is azt írja: „[1. módosítás] …").
      // Ha tehát a lelkész az 1. módosítást akarta javítani, a jóváhagyás után:
      //   - a `budget_mod1_finalized` zárva maradt (a módosítás nem szerkeszthető),
      //   - viszont a `budget_finalized` kinyílt, amitől a módosítás-fülek EL IS
      //     TŰNTEK (azok csak véglegesített alap mellett látszanak).
      // Vagyis a lelkész se javítani, se visszazárni nem tudott — fejlesztő
      // nélkül nem volt kiút. Mostantól a LEGMAGASABB véglegesített szintet
      // oldjuk fel, pontosan azt, amelyikre a kérelem szólt.
      const { data: lockRow, error: lockErr } = await supabase
        .from('bealitas')
        .select('budget_finalized, budget_mod1_finalized, budget_mod2_finalized, budget_mod3_finalized')
        .eq('id', year)
        .eq('congregation_id', congregationId)
        .maybeSingle()

      if (lockErr) {
        // Séma-drift (régi adatbázis a mod-oszlopok nélkül): a régi, alap-szintű
        // viselkedés marad, hogy a feloldás egyáltalán működjön — de hangosan
        // naplózzuk, mert a módosítás-feloldás ilyenkor nem elérhető.
        console.error(
          '[dashboard-egyhazmegye] a költségvetés zár-szintjeinek olvasása hibára futott, ' +
            'ezért az ALAP költségvetést oldjuk fel:',
          lockErr.message,
        )
        updates.budget_finalized = false
      } else {
        const row = (lockRow || {}) as Record<string, unknown>
        if (row.budget_mod3_finalized) updates.budget_mod3_finalized = false
        else if (row.budget_mod2_finalized) updates.budget_mod2_finalized = false
        else if (row.budget_mod1_finalized) updates.budget_mod1_finalized = false
        else updates.budget_finalized = false
      }
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
    // A ténylegesen feloldott költségvetés-szint — a beküldött dokumentum-sor
    // kinyitásához (lentebb) tudni kell, alap vagy hányadik módosítás volt.
    unlockedBudgetModNumber = updates.budget_mod3_finalized === false
      ? 3
      : updates.budget_mod2_finalized === false
        ? 2
        : updates.budget_mod1_finalized === false
          ? 1
          : null
  }

  // 2026-08-09 (review-fix): a feloldás a BEKÜLDÖTT dokumentum sorát is
  // nyitja. Enélkül a lelkész feloldás után sem tudná újra beküldeni az
  // iratot: a dokumentumközpont felülírás-védelme a 'finalized' sort blokkolja
  // ('returned' viszont újra beküldhető). Best-effort: ha nincs ilyen sor
  // (még nem küldték be), az nem hiba.
  // 2026-08-11 (6. kör): ha a feloldás egy KÖLTSÉGVETÉS-MÓDOSÍTÁSRA szólt, nem
  // az alap 'koltsegvetes' sort kell kinyitni, hanem a megfelelő
  // 'koltsegvetes_modositas' sort a maga módosítás-sorszámával — különben a
  // lelkész a javítás után a felülírás-védelembe futna bele.
  const unlockedDocType: string | null =
    type === 'accounting' ? 'szamadas'
      : type === 'budget' ? (unlockedBudgetModNumber ? 'koltsegvetes_modositas' : 'koltsegvetes')
        : type === 'jelentes' ? 'lelkeszi_jelentes'
          : type === 'inventory' ? 'vagyonleltar'
            : null
  if (unlockedDocType) {
    try {
      let subQuery = supabase
        .from('document_submissions')
        .select('id, status, notes')
        .eq('congregation_id', congregationId)
        .eq('document_type', unlockedDocType)
        .eq('year', Number(year))
        .in('status', ['submitted', 'received', 'reviewed', 'finalized'])
      subQuery = unlockedBudgetModNumber
        ? subQuery.eq('modification_number', unlockedBudgetModNumber)
        : subQuery.is('modification_number', null)
      const { data: subRow } = await subQuery.maybeSingle()
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
  // 2026-08-11 (számvevő-kör): az elutasítás is ÍRÁS — lásd approveUnlockRequest.
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága az elutasításhoz.' }
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
  // 2026-08-11 (számvevő-kör): OLVASÁSI kapu — az esperes/megyei admin mellett
  // az egyházmegyei számvevő is beleesik (az adatbázis ugyanezt engedi:
  // current_user_diocese_olvaso_ids()).
  if (!canReadDioceseScope(access)) return []

  const { supabase } = access
  // 2026-08-09: feloldott hatókör (aktív szerep → profile_roles → skalár) +
  // FAIL-CLOSED: NULL-scope diocese-felhasználó ÜRES listát kap, nem az egész
  // egyház gyülekezeteit (a congregations SELECT RLS USING(true), nincs backstop).
  const dioceseId = resolveDioceseScopeId(access)
  if (!dioceseId && !access.master && !access.admin) return []
  const currentYear = new Date().getFullYear()

  /**
   * 2026-08-11 (6. kör, P0 — JAVÍTÁSI ZSÁKUTCA): ez a lekérdezés a NAPTÁRI évre
   * volt szegezve (`bealitas.id = String(currentYear)`), miközben a beszámolási
   * szezon átnyúlik az évhatáron: a lelkész a TÁRGYÉV (N) számadását a KÖVETKEZŐ
   * év (N+1) januárjában véglegesíti és küldi be, és a javítási kérelmét is az
   * N-es `bealitas` sorra írja. A megye viszont az N+1-es sort kereste — vagyis a
   * kérelem SOHA nem jelent meg az esperesnél. A lelkész oldalán közben a gomb
   * „Javítási kérelem elbírálás alatt…" állapotba ragadt (a flag be volt írva),
   * tehát újra sem tudta küldeni: fejlesztő nélkül nem volt kiút. Ugyanez a
   * dokumentum-darabszámokra és a beküldött választói létszámra is állt.
   *
   * A javítás ugyanazt az ÉV-ABLAKOT használja, mint a dokumentumközpont
   * (lib/constants/documents.ts `documentSeasonYear`): szezon-év + naptári év +
   * az azt megelőző év. Az egyes kérelmek a SAJÁT évükkel mennek tovább, mert az
   * `approveUnlockRequest` / `rejectUnlockRequest` ezt az évet írja a
   * `bealitas.id`-ba — ha itt a naptári évet adnánk, a jóváhagyás egy MÁSIK év
   * sorát oldaná fel (vagy 0 sort érintve hangosan elbukna).
   */
  const seasonYear = documentSeasonYear()
  const relevantYears = [...new Set([currentYear, seasonYear, seasonYear - 1])].sort(
    (a, b) => b - a,
  )

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
    .in('id', relevantYears.map(String))

  // 2026-07-17 (F5): lelkészi jelentés feloldás-kérelmek (lelkeszi_jelentes) —
  // itt is csak a kérelem-flageket kérdezzük, nem a jelentés tartalmát.
  // Év-szűrés nincs: korábbi évi jelentés feloldás-kérése is megjelenik.
  const { data: jelentesUnlockData } = await supabase
    .from('lelkeszi_jelentes')
    .select('congregation_id, ev, unlock_reason')
    .in('congregation_id', congIds)
    .eq('unlock_requested', true)

  // Dokumentum beküldések — ez az engedélyezett adatforrás az egyházmegye számára
  // 2026-08-11 (6. kör): ugyanaz az év-ablak, mint a kérelmeknél — a naptári évre
  // szegezett régi szűrő januárban 0 dokumentumot mutatott minden gyülekezetnél
  // (a szezon iratai az ELŐZŐ év kulcsán érkeznek), és a választói létszám is
  // eltűnt a gyülekezet-kártyáról.
  const { data: docData } = await supabase
    .from('document_submissions')
    .select('congregation_id, status, document_type, snapshot_data, year')
    .in('congregation_id', congIds)
    .in('year', relevantYears)

  // Választók száma — KIZÁRÓLAG a beküldött választók névjegyzékéből (nem szemely táblából!)
  // 2026-08-11 (6. kör): az év-ablak miatt egy gyülekezethez több év névjegyzéke
  // is jöhet — a LEGFRISSEBB év számít (a régebbi nem írhatja felül).
  const voterCounts = new Map<string, { year: number; count: number }>()
  for (const d of (docData || []) as Array<{ congregation_id: string; document_type: string; snapshot_data: Record<string, unknown> | null; year: number | null }>) {
    if (d.document_type !== 'valasztok_nevjegyzeke' || !d.snapshot_data) continue
    const snap = d.snapshot_data as { totalCount?: number; voterCount?: number }
    const count = typeof snap.totalCount === 'number' ? snap.totalCount
      : typeof snap.voterCount === 'number' ? snap.voterCount
      : null
    if (count === null) continue
    const year = typeof d.year === 'number' ? d.year : 0
    const prev = voterCounts.get(d.congregation_id)
    if (!prev || year >= prev.year) voterCounts.set(d.congregation_id, { year, count })
  }

  // 2026-08-11 (6. kör): gyülekezetenként az ÖSSZES releváns év `bealitas` sora —
  // a régi `.find(...)` az elsőt vette, tehát az év-ablak bővítése után némán
  // elnyelte volna a többi év kérelmeit. A kérelem a SAJÁT évével megy tovább.
  const bealitasByCong = new Map<string, Array<Record<string, unknown>>>()
  for (const row of (bealitasData || []) as Array<Record<string, unknown>>) {
    const congId = String(row.congregation_id)
    const list = bealitasByCong.get(congId)
    if (list) list.push(row)
    else bealitasByCong.set(congId, [row])
  }

  // Összesítés
  return congregations.map((cong: { id: string; name: string }) => {
    const requests: UnlockRequest[] = []

    // Év szerint csökkenő sorrendben — a frissebb kérelem kerül a lista élére.
    const bealitasRows = (bealitasByCong.get(cong.id) || []).sort(
      (a, b) => Number(b.id) - Number(a.id),
    )
    for (const bealitas of bealitasRows) {
      const rowYear = String(bealitas.id)
      if (bealitas.unlock_requested) {
        requests.push({ congregationId: cong.id, congregationName: cong.name, year: rowYear, type: 'budget', reason: (bealitas.unlock_reason as string) || null, requestedAt: null })
      }
      if (bealitas.accounting_unlock_requested) {
        requests.push({ congregationId: cong.id, congregationName: cong.name, year: rowYear, type: 'accounting', reason: (bealitas.accounting_unlock_reason as string) || null, requestedAt: null })
      }
      if (bealitas.leltar_unlock_requested) {
        requests.push({ congregationId: cong.id, congregationName: cong.name, year: rowYear, type: 'inventory', reason: (bealitas.leltar_unlock_reason as string) || null, requestedAt: null })
      }
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
      voterCount: voterCounts.get(cong.id)?.count ?? null,
    }
  }).sort((a: { congregationName: string }, b: { congregationName: string }) => a.congregationName.localeCompare(b.congregationName))
}
