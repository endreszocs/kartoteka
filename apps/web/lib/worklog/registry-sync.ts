/**
 * Anyakönyv ⇄ Munkanapló szinkron-helper (2026-06-12, Endre #3-4 munkanapló).
 *
 * A keresztelés / esketés / temetés / konfirmálás / családlátogatás rögzítésekor
 * a "Rögzítés a munkanaplóba" pipa hatására a munkanaplo táblába is kerül egy
 * "elvégzett szolgálat" bejegyzés. Ez a modul adja a KÖZÖS, IDEMPOTENS írási utat:
 *
 *  - A forrás-táblák (keresztseg, hazassag, temetes, konfirmalas, csaladlatogatas)
 *    MÁR TARTALMAZNAK egy `munkanaplo_id` oszlopot — ez a kanonikus link.
 *  - A munkanaplo.id_jellege mezőbe forrás-marker kerül (`keresztseg:123`),
 *    így a link nélküli (legacy) sorok is felismerhetők — duplikáció helyett
 *    a meglévő bejegyzés frissül.
 *  - Szerkesztéskor a munkanapló-bejegyzés KÖVETI az anyakönyvi adatot
 *    (dátum, nevek, lelkész), de a jelenlét/persely mezőkhöz nem nyúl —
 *    azokat a lelkész a Munkanapló oldalon töltheti ki.
 *  - Storno/törlés: a kapcsolt munkanapló-bejegyzés soft-delete-et kap
 *    (deleted = true) — a DB-ben visszaállítható marad. DÖNTÉS: a kicsekkolt
 *    pipa (munkanaploba=false) szerkesztéskor szintén eltávolítja a bejegyzést,
 *    mert a pipa a felhasználó kifejezett szándékát tükrözi.
 *
 * FONTOS séma-megjegyzés: a munkanaplo.jelenlet_osszesen NOT NULL és nincs
 * default-ja, ezért MINDEN insertnek kötelező kitöltenie (0). A korábbi
 * integrációs kísérletek emiatt buktak el némán. A `deleted` oszlop a
 * 2026-06-12c SQL-lel jön létre — amíg Endre nem futtatta le, a kód
 * fallback-kel (oszlop nélküli újrapróbálkozással) működik.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

export interface RegistryWorklogPayload {
  /** YYYY-MM-DD — az anyakönyvi esemény dátuma. */
  idopont: string
  /** Munkanapló-típus: 'Keresztelő' | 'Esketés' | 'Temetés' | 'Konfirmáció' | 'Családlátogatás'... */
  jellege: string
  cim?: string | null
  alapige?: string | null
  szolgalt?: string | null
  megjegyzes?: string | null
  /** 'szolgalat' (default) | 'katekezis' | 'latogatas' */
  kategoria?: string
}

/** A PostgREST "nincs ilyen oszlop: deleted" hibájának felismerése. */
export function isMissingDeletedColumn(error: { message?: string } | null | undefined): boolean {
  const msg = (error?.message || '').toLowerCase()
  return msg.includes('deleted') && (msg.includes('column') || msg.includes('schema cache'))
}

/** A forrás-marker a munkanaplo.id_jellege mezőbe: pl. `keresztseg:123`. */
export function registryWorklogMarker(sourceTable: string, sourceId: number | string): string {
  return `${sourceTable}:${sourceId}`
}

/**
 * Munkanapló-bejegyzés létrehozása VAGY frissítése egy anyakönyvi eseményhez.
 * Visszaadja a munkanaplo.id-t (vagy null-t, ha nem sikerült — nem blokkoló).
 *
 * Idempotencia három rétegben:
 *  1. ha van `existingWorklogId` → UPDATE arra a sorra
 *  2. ha nincs link, de a marker (`id_jellege`) alapján már létezik sor → UPDATE
 *  3. különben INSERT
 */
export async function upsertRegistryWorklog(
  supabase: AnySupabase,
  congregationId: string,
  sourceTable: string,
  sourceId: number | string,
  existingWorklogId: number | null | undefined,
  payload: RegistryWorklogPayload,
): Promise<number | null> {
  const marker = registryWorklogMarker(sourceTable, sourceId)

  // A szinkronizált (anyakönyv-tulajdonú) mezők. A jelenlét-/persely-mezőket
  // szándékosan NEM írjuk felül update-kor.
  const syncFields: Record<string, unknown> = {
    idopont: payload.idopont,
    jellege: payload.jellege,
    kategoria: payload.kategoria || 'szolgalat',
    id_jellege: marker,
    cim: payload.cim || null,
    alapige: payload.alapige || null,
    szolgalt: payload.szolgalt || null,
    megjegyzes: payload.megjegyzes || null,
  }

  try {
    // 1) Meglévő link → UPDATE
    if (existingWorklogId) {
      const { data, error } = await supabase
        .from('munkanaplo')
        .update(syncFields)
        .eq('id', existingWorklogId)
        .eq('congregation_id', congregationId)
        .select('id')
      if (!error && data && data.length > 0) return existingWorklogId
      // 0 érintett sor (a bejegyzést időközben kézzel törölték) → továbblépünk
      // a marker-keresésre / insertre.
    }

    // 2) Marker-alapú keresés (legacy / link nélküli sor)
    const { data: byMarker } = await supabase
      .from('munkanaplo')
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('id_jellege', marker)
      .limit(1)
    if (byMarker && byMarker.length > 0) {
      const id = byMarker[0].id as number
      await supabase
        .from('munkanaplo')
        .update(syncFields)
        .eq('id', id)
        .eq('congregation_id', congregationId)
      return id
    }

    // 3) INSERT — jelenlet_osszesen NOT NULL (nincs default!), ezért kötelező.
    const insertRecord: Record<string, unknown> = {
      ...syncFields,
      jelenlet_osszesen: 0,
      congregation_id: congregationId,
      deleted: false,
    }
    let inserted = await supabase.from('munkanaplo').insert([insertRecord]).select('id')
    if (inserted.error && isMissingDeletedColumn(inserted.error)) {
      // A `deleted` oszlop még nem létezik (2026-06-12c SQL nem futott) —
      // anélkül próbáljuk újra.
      delete insertRecord.deleted
      inserted = await supabase.from('munkanaplo').insert([insertRecord]).select('id')
    }
    if (inserted.error || !inserted.data?.[0]) {
      console.warn(`[worklog-sync] munkanaplo insert sikertelen (${marker}):`, inserted.error?.message)
      return null
    }
    return inserted.data[0].id as number
  } catch (e) {
    console.warn(`[worklog-sync] váratlan hiba (${marker}):`, e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Az anyakönyvi eseményhez kapcsolt munkanapló-bejegyzés eltávolítása
 * (soft-delete). Ha a `deleted` oszlop még nem létezik, hard-delete-tel
 * pótoljuk — az auto-generált sort a forrás-esemény "birtokolja", a
 * felhasználói szándék a megszüntetés.
 */
export async function softDeleteRegistryWorklog(
  supabase: AnySupabase,
  congregationId: string,
  worklogId: number,
): Promise<void> {
  try {
    const res = await supabase
      .from('munkanaplo')
      .update({ deleted: true })
      .eq('id', worklogId)
      .eq('congregation_id', congregationId)
    if (res.error && isMissingDeletedColumn(res.error)) {
      await supabase
        .from('munkanaplo')
        .delete()
        .eq('id', worklogId)
        .eq('congregation_id', congregationId)
    }
  } catch (e) {
    console.warn(`[worklog-sync] munkanaplo törlés sikertelen (id=${worklogId}):`, e instanceof Error ? e.message : e)
  }
}

/**
 * Teljes szinkron-lépés egy anyakönyvi mentés végén:
 *  - munkanaploba=true  → bejegyzés upsert + a forrás-sor `munkanaplo_id`-jának
 *    visszaírása (ha változott)
 *  - munkanaploba=false → ha volt kapcsolt bejegyzés, soft-delete + link törlése
 *
 * Minden hiba nem-blokkoló (warn) — az anyakönyvi mentés már sikerült.
 */
export async function syncRegistryWorklogLink(
  supabase: AnySupabase,
  congregationId: string,
  opts: {
    sourceTable: 'keresztseg' | 'hazassag' | 'temetes' | 'konfirmalas' | 'csaladlatogatas'
    sourceId: number
    currentWorklogId: number | null
    munkanaploba: boolean
    payload: RegistryWorklogPayload
  },
): Promise<number | null> {
  const { sourceTable, sourceId, currentWorklogId, munkanaploba, payload } = opts

  if (!munkanaploba) {
    if (currentWorklogId) {
      await softDeleteRegistryWorklog(supabase, congregationId, currentWorklogId)
      const { error } = await supabase
        .from(sourceTable)
        .update({ munkanaplo_id: null })
        .eq('id', sourceId)
        .eq('congregation_id', congregationId)
      if (error) console.warn(`[worklog-sync] ${sourceTable}.munkanaplo_id nullázás sikertelen:`, error.message)
    }
    return null
  }

  const worklogId = await upsertRegistryWorklog(
    supabase, congregationId, sourceTable, sourceId, currentWorklogId, payload,
  )
  if (worklogId && worklogId !== currentWorklogId) {
    const { error } = await supabase
      .from(sourceTable)
      .update({ munkanaplo_id: worklogId })
      .eq('id', sourceId)
      .eq('congregation_id', congregationId)
    if (error) console.warn(`[worklog-sync] ${sourceTable}.munkanaplo_id visszaírás sikertelen:`, error.message)
  }
  return worklogId
}
