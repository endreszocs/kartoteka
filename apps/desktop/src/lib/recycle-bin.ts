/**
 * recycle-bin — a Kuka desktop adat-rétege (2026-08-15, desktop-paritás
 * 3. szelet — „Kuka a desktopra").
 *
 * MIÉRT direkt Supabase, és nem a webes Dexie-út (paritás-terv 4.6.
 * kockázat): a webes `apps/web/lib/offline/recycle-bin-actions.ts` a Dexie +
 * mutation-queue optimista modelljére épül — desktopon nincs Dexie, a lokális
 * SQLCipher-tükör pedig `deleted=false`-ra szűrve pull-ol, tehát a törölt
 * sorok NINCSENEK meg helyben. A Kuka ezért itt KIZÁRÓLAG online működik:
 * a lista a szerverről jön, és minden művelet SZERVER-VISSZAIGAZOLÁSSAL fut.
 *
 * SZERVER-VISSZAIGAZOLÁS (néma siker TILOS): a PostgREST a 0 sort érintő
 * UPDATE/DELETE-re is hibátlan választ ad (pl. RLS-megtagadás vagy közben
 * eltűnt sor) — ezért minden írás `.select('id')`-del zár, és ha 0 sor jött
 * vissza, HANGOS magyar hibát dobunk (a webes sirhelyek/actions.ts 2026-08-15
 * óta élő mintája).
 *
 * KÉZI HATÓKÖR-ŐRÖK (4.8. kockázat): desktopon nincs middleware és nincs
 * Server Action — az RLS-en FELÜL kézzel is kikényszerítjük, hogy csak a
 * saját gyülekezet rekordjai listázódjanak és törlődjenek. A sirhely-lánc
 * (sirhely → sirhelytemeto, sirhelyberles/sirhelyelhunyt → sirhely →
 * sirhelytemeto) a webes sirhelyek/actions.ts `sirhelyAMienk` tükre. Minden
 * szűrő fail-closed (memória-hibaosztály: „skalár hatókör + `if (id) filter`
 * = néma teljes szivárgás"): hiányzó hatókör-adatnál a tábla HIBÁSKÉNT
 * jelenik meg, nem szűretlenül.
 *
 * A tábla-lista a KÖZÖS @kartoteka/ui-app `RECYCLE_BIN_TABLES` — ha a webes
 * table-registry soft-delete készlete változik, azt a listát kell frissíteni.
 */

import {
  buildRecycleBinLabel,
  purgeCountdownDays,
  RECYCLE_BIN_TABLES,
  type RecycleBinDisplayRow,
  type RecycleBinTableDef,
} from '@kartoteka/ui-app'

import { errorMessage } from './error'
import { logAuditDesktop } from './member-removal'
import { getDesktopSupabase } from './supabase'
import { getVerifiedSession } from './verified-session'

// A webes Kuka is 500 sort mutat táblánként — azonos plafon.
const LIST_LIMIT_PER_TABLE = 500
// Egy PostgREST `.in()`-be ennyi id megy (URL-hossz korlát — a webes
// kuka/actions.ts ID_CHUNK mintája).
const FK_ID_CHUNK = 100
// A sirhely-hatókör lapozása: a PostgREST kérésenként legfeljebb ~1000 sort
// ad — e fölött lapozunk, és plafon fölött HIBÁT jelzünk (hiányos hatókör-
// listából nem szabad „üres kukát" hazudni).
const SIRHELY_PAGE = 1000
const SIRHELY_MAX_PAGES = 10

type SupabaseClient = ReturnType<typeof getDesktopSupabase>

export interface DesktopRecycleBinList {
  rows: RecycleBinDisplayRow[]
  /** Azok a táblák (címkével), amelyek tartalmát nem sikerült kiolvasni. */
  failedTables: string[]
}

function requireTableDef(table: string): RecycleBinTableDef {
  const def = RECYCLE_BIN_TABLES.find(t => t.table === table)
  if (!def) {
    // Fail-closed: ismeretlen táblán SEMMILYEN művelet nem futhat.
    throw new Error(`Ismeretlen kuka-tábla: ${table} — a művelet nem futtatható.`)
  }
  return def
}

// ─────────────────────────────────────────────────────────────────
// Sirhely-lánc hatókör (a webes sirhelyek/actions.ts tükre)
// ─────────────────────────────────────────────────────────────────

/** A temető a hívó gyülekezetéé? Hibánál DOB (hangos), nem enged át. */
async function assertTemetoOwned(
  supabase: SupabaseClient,
  temetoid: number,
  congregationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('sirhelytemeto')
    .select('id')
    .eq('id', temetoid)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (error) {
    throw new Error(`A tulajdonjog-ellenőrzés nem sikerült: ${error.message}`)
  }
  if (!data) {
    throw new Error('A rekord nem a saját gyülekezethez tartozik — a művelet nem futtatható.')
  }
}

/**
 * Írás előtti tulajdonjog-őr. A congregation_id-s tábláknál nem itt, hanem
 * magán az íráson lévő `.eq('congregation_id', …)` kényszeríti a hatókört;
 * az FK-láncos temetői tábláknál a lánc végigjárása kötelező.
 */
async function assertOwnedForWrite(
  supabase: SupabaseClient,
  def: RecycleBinTableDef,
  id: string | number,
  congregationId: string,
): Promise<void> {
  if (def.scope === 'congregation_id') return

  if (def.scope === 'temeto_fk') {
    // sirhely: temetoid → sirhelytemeto.congregation_id
    const { data, error } = await supabase
      .from(def.table)
      .select('temetoid')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      throw new Error(`A tulajdonjog-ellenőrzés nem sikerült: ${error.message}`)
    }
    const temetoid = (data as { temetoid: number | null } | null)?.temetoid
    if (typeof temetoid !== 'number') {
      throw new Error('A sírhely nem található, vagy nincs temetőhöz rendelve — a művelet nem futtatható.')
    }
    await assertTemetoOwned(supabase, temetoid, congregationId)
    return
  }

  // sirhely_fk: sirhelyid → sirhely.temetoid → sirhelytemeto.congregation_id
  const { data, error } = await supabase
    .from(def.table)
    .select('sirhelyid')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new Error(`A tulajdonjog-ellenőrzés nem sikerült: ${error.message}`)
  }
  const sirhelyid = (data as { sirhelyid: number | null } | null)?.sirhelyid
  if (typeof sirhelyid !== 'number') {
    throw new Error('A rekord nem található, vagy nincs sírhelyhez rendelve — a művelet nem futtatható.')
  }
  const { data: plot, error: plotErr } = await supabase
    .from('sirhely')
    .select('temetoid')
    .eq('id', sirhelyid)
    .maybeSingle()
  if (plotErr) {
    throw new Error(`A tulajdonjog-ellenőrzés nem sikerült: ${plotErr.message}`)
  }
  const temetoid = (plot as { temetoid: number | null } | null)?.temetoid
  if (typeof temetoid !== 'number') {
    throw new Error('A kapcsolódó sírhely nem található — a művelet nem futtatható.')
  }
  await assertTemetoOwned(supabase, temetoid, congregationId)
}

// ─────────────────────────────────────────────────────────────────
// Lista — a Kuka tartalma a szerverről
// ─────────────────────────────────────────────────────────────────

interface FkScopeIds {
  /** null = a hatókör-lista nem olvasható → az érintett táblák HIBÁSAK. */
  temetoIds: number[] | null
  sirhelyIds: number[] | null
}

/** A sirhely-lánc hatókör-azonosítói (fail-closed: hibánál null). */
async function loadFkScopeIds(
  supabase: SupabaseClient,
  congregationId: string,
): Promise<FkScopeIds> {
  let temetoIds: number[] | null = null
  try {
    const { data, error } = await supabase
      .from('sirhelytemeto')
      .select('id')
      .eq('congregation_id', congregationId)
    if (error) throw new Error(error.message)
    temetoIds = ((data ?? []) as Array<{ id: number }>).map(r => r.id)
  } catch (err) {
    console.warn('[kuka desktop] temető-hatókör nem olvasható:', errorMessage(err))
    return { temetoIds: null, sirhelyIds: null }
  }

  if (temetoIds.length === 0) return { temetoIds, sirhelyIds: [] }

  const sirhelyIds: number[] = []
  try {
    for (let page = 0; ; page++) {
      if (page >= SIRHELY_MAX_PAGES) {
        // Plafon: a hatókör-lista HIÁNYOS lenne → a sirhely-láncos táblák
        // hibásként jelennek meg, nem „üresként" (P1 #26 tanulság).
        throw new Error(`több mint ${SIRHELY_MAX_PAGES * SIRHELY_PAGE} sírhely — a hatókör-lista csonka lenne`)
      }
      const { data, error } = await supabase
        .from('sirhely')
        .select('id')
        .in('temetoid', temetoIds)
        .order('id', { ascending: true })
        .range(page * SIRHELY_PAGE, page * SIRHELY_PAGE + SIRHELY_PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<{ id: number }>
      sirhelyIds.push(...rows.map(r => r.id))
      if (rows.length < SIRHELY_PAGE) break
    }
  } catch (err) {
    console.warn('[kuka desktop] sírhely-hatókör nem olvasható:', errorMessage(err))
    return { temetoIds, sirhelyIds: null }
  }

  return { temetoIds, sirhelyIds }
}

async function fetchDeletedRowsForTable(
  supabase: SupabaseClient,
  def: RecycleBinTableDef,
  congregationId: string,
  fk: FkScopeIds,
): Promise<Array<Record<string, unknown>>> {
  if (def.scope === 'congregation_id') {
    const { data, error } = await supabase
      .from(def.table)
      .select('*')
      .eq(def.softDeleteColumn, true)
      // Kézi hatókör-őr az RLS-en FELÜL (4.8. kockázat) — fail-closed.
      .eq('congregation_id', congregationId)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT_PER_TABLE)
    if (error) throw new Error(error.message)
    return (data ?? []) as Array<Record<string, unknown>>
  }

  if (def.scope === 'temeto_fk') {
    if (fk.temetoIds === null) {
      throw new Error('a temető-hatókör nem olvasható — a tábla nem listázható')
    }
    if (fk.temetoIds.length === 0) return []
    const { data, error } = await supabase
      .from(def.table)
      .select('*')
      .eq(def.softDeleteColumn, true)
      .in('temetoid', fk.temetoIds)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT_PER_TABLE)
    if (error) throw new Error(error.message)
    return (data ?? []) as Array<Record<string, unknown>>
  }

  // sirhely_fk — darabolt .in() (URL-hossz)
  if (fk.sirhelyIds === null) {
    throw new Error('a sírhely-hatókör nem olvasható — a tábla nem listázható')
  }
  if (fk.sirhelyIds.length === 0) return []
  const acc: Array<Record<string, unknown>> = []
  for (
    let i = 0;
    i < fk.sirhelyIds.length && acc.length < LIST_LIMIT_PER_TABLE;
    i += FK_ID_CHUNK
  ) {
    const chunk = fk.sirhelyIds.slice(i, i + FK_ID_CHUNK)
    const { data, error } = await supabase
      .from(def.table)
      .select('*')
      .eq(def.softDeleteColumn, true)
      .in('sirhelyid', chunk)
      .limit(LIST_LIMIT_PER_TABLE)
    if (error) throw new Error(error.message)
    acc.push(...((data ?? []) as Array<Record<string, unknown>>))
  }
  return acc.slice(0, LIST_LIMIT_PER_TABLE)
}

/**
 * A Kuka teljes tartalma a szerverről, gyülekezet-hatókörrel.
 *
 * A `deleted_at`-ot a sor hordozza, ha a 2026-08-14-kuka-deleted-at.sql
 * migráció élesben van (PONTOS visszaszámláló); különben az `updated_at` a
 * FELSŐ becslés — pontosan mint a weben.
 */
export async function listDeletedRecordsDesktop(
  congregationId: string,
): Promise<DesktopRecycleBinList> {
  // Fail-closed hatókör-őr: üres congregation_id-vel SOHA nem listázunk.
  if (!congregationId) {
    throw new Error('Hiányzó gyülekezet-azonosító — a Kuka nem tölthető be.')
  }
  const supabase = getDesktopSupabase()
  const rows: RecycleBinDisplayRow[] = []
  const failedTables: string[] = []
  const now = Date.now()

  const fk = await loadFkScopeIds(supabase, congregationId)

  for (const def of RECYCLE_BIN_TABLES) {
    try {
      const records = await fetchDeletedRowsForTable(supabase, def, congregationId, fk)
      const labeler = buildRecycleBinLabel(def.table)
      for (const record of records) {
        const exactDeletedAt =
          typeof record.deleted_at === 'string' ? record.deleted_at : null
        const updatedAt =
          typeof record.updated_at === 'string' ? record.updated_at : null
        const deletedAt = exactDeletedAt ?? updatedAt
        rows.push({
          table: def.table,
          id: record.id as string | number,
          displayLabel: labeler(record),
          deletedAt,
          deletedAtIsExact: Boolean(exactDeletedAt),
          daysUntilPurge: purgeCountdownDays(deletedAt, now),
        })
      }
    } catch (err) {
      // HANGOS: a hibás tábla a figyelmeztető sávba kerül, és amíg ott van,
      // az ürítés tilos (P1 #26 — hiányos lista sose hazudjon üres kukát).
      console.warn('[kuka desktop list]', def.table, errorMessage(err))
      failedTables.push(def.label)
    }
  }

  return { rows, failedTables }
}

// ─────────────────────────────────────────────────────────────────
// Írások — verified-session őr + szerver-visszaigazolás
// ─────────────────────────────────────────────────────────────────

async function preparedWrite(
  congregationId: string,
  table: string,
  id: string | number,
): Promise<{ supabase: SupabaseClient; def: RecycleBinTableDef }> {
  const def = requireTableDef(table)
  if (!congregationId) {
    throw new Error('Hiányzó gyülekezet-azonosító — a művelet nem futtatható.')
  }
  // 4.3. kockázat: MINDEN felhő-írás a verified-session őrön át
  // (session + lejárat + fiók-egyezőség) — hibánál érthető magyar üzenet.
  const verified = await getVerifiedSession()
  if (!verified.ok) throw new Error(verified.message)
  const supabase = getDesktopSupabase()
  await assertOwnedForWrite(supabase, def, id, congregationId)
  return { supabase, def }
}

/** Egy soft-deleted sor visszaállítása a szerveren (jelző-oszlop → false). */
export async function restoreRecordDesktop(
  congregationId: string,
  table: string,
  id: string | number,
): Promise<void> {
  const { supabase, def } = await preparedWrite(congregationId, table, id)

  let query = supabase
    .from(def.table)
    .update({ [def.softDeleteColumn]: false })
    .eq('id', id)
  if (def.scope === 'congregation_id') {
    // Kézi hatókör-szűkítés az RLS-en FELÜL (4.8. kockázat).
    query = query.eq('congregation_id', congregationId)
  }
  const { data, error } = await query.select('id')
  if (error) throw new Error(`A visszaállítás nem sikerült: ${error.message}`)
  // Szerver-visszaigazolás: 0 érintett sor = NEM történt meg (néma siker tilos).
  if (!data || data.length === 0) {
    throw new Error(
      'A visszaállítás nem történt meg a szerveren — lehet, hogy a rekordot közben véglegesen törölték, vagy nincs hozzá jogosultságod. Frissítsd a listát.',
    )
  }
  await logAuditDesktop({
    action: 'recyclebin.restore',
    targetTable: def.table,
    targetId: String(id),
  })
}

/** Egy sor VÉGLEGES törlése a szerveren (DELETE + visszaigazolás). */
export async function hardDeleteRecordDesktop(
  congregationId: string,
  table: string,
  id: string | number,
): Promise<void> {
  const { supabase, def } = await preparedWrite(congregationId, table, id)

  let query = supabase.from(def.table).delete().eq('id', id)
  if (def.scope === 'congregation_id') {
    query = query.eq('congregation_id', congregationId)
  }
  const { data, error } = await query.select('id')
  if (error) throw new Error(`A végleges törlés nem sikerült: ${error.message}`)
  // Szerver-visszaigazolás: a PostgREST a 0 sort érintő DELETE-re is hibátlan
  // választ ad (RLS-megtagadás, FK-védelem nélküli néma eset) — enélkül a
  // „semmi sem történt" megint sikernek látszana.
  if (!data || data.length === 0) {
    throw new Error(
      'A végleges törlés nem történt meg a szerveren — lehet, hogy a rekordot közben más törölte, vagy nincs hozzá jogosultságod. Frissítsd a listát.',
    )
  }
  await logAuditDesktop({
    action: 'recyclebin.harddelete',
    targetTable: def.table,
    targetId: String(id),
  })
}

/**
 * Kuka-ürítés: a MÁR KILISTÁZOTT (tehát hatókör-ellenőrzött) sorokból törli
 * a küszöbnél régebbieket, soronkénti szerver-visszaigazolással.
 *
 * @param olderThanDays 0 = mindent; egyébként a legalább ennyi napja töröltek.
 *   A küszöb a sor `deletedAt`-jából dől el — a szerverről listázott sor a
 *   PONTOS `deleted_at`-ot hordozza, ha a migráció élesben van; dátum nélküli
 *   sort küszöbnél NEM törlünk (a webes emptyBin szemantikája).
 */
export async function emptyBinDesktop(
  congregationId: string,
  rows: RecycleBinDisplayRow[],
  olderThanDays: number,
): Promise<{ count: number }> {
  const toDelete = rows.filter(d => {
    if (olderThanDays === 0) return true
    if (!d.deletedAt) return false
    const elapsedDays =
      (Date.now() - new Date(d.deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    return elapsedDays >= olderThanDays
  })

  let count = 0
  const hibak: string[] = []
  for (const d of toDelete) {
    try {
      await hardDeleteRecordDesktop(congregationId, d.table, d.id)
      count += 1
    } catch (err) {
      hibak.push(`${d.displayLabel}: ${errorMessage(err)}`)
    }
  }
  if (hibak.length > 0) {
    // Részleges siker is HANGOS: a lelkész lássa, mennyi ment, mennyi nem.
    throw new Error(
      `${count} rekord véglegesen törölve, ${hibak.length} viszont NEM — az első hiba: ${hibak[0]}${
        hibak.length > 1 ? ` (+${hibak.length - 1} további, lásd a naplót)` : ''
      }`,
    )
  }
  return { count }
}
