'use server'

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { worklogSchema, type WorklogInput } from '@/lib/validations/worklog'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { isMissingDeletedColumn } from '@/lib/worklog/registry-sync'

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

/**
 * 2026-07-11 (F2): a `napszak` / `uv_templomban` / `uv_betegnel` oszlopok az
 * élesben most futtatott migrációból jönnek. Ha a mentés „column ... does not
 * exist" (42703) vagy PostgREST schema-cache hibát ad ezekre az oszlopokra,
 * érthető magyar üzenetet adunk, ami a migráció futtatására utal.
 */
function worklogSaveError(error: { message?: string } | null | undefined): string {
  const msg = error?.message || ''
  const lower = msg.toLowerCase()
  const isMissingColumn =
    (lower.includes('does not exist') && lower.includes('column')) ||
    lower.includes('schema cache')
  if (isMissingColumn && /napszak|uv_templomban|uv_betegnel/.test(lower)) {
    return 'Az adatbázisból még hiányoznak az új munkanapló-oszlopok (napszak, úrvacsorázók). Kérjük, futtassa le a 2026-07-11-es munkanapló-migrációt, majd próbálja újra a mentést.'
  }
  // 2026-08-25 (gyülekezeti egységek): normál esetben ide el sem jutunk — a
  // mentés az oszlop hiányát strip+retry-jal túléli (lásd saveWorklog). Ez a
  // vég-őr arra az esetre marad, ha a retry után is oszlop-hibát kapnánk.
  if (isMissingColumn && /egyseg_id/.test(lower)) {
    return 'Az adatbázisból még hiányzik a munkanapló egység-oszlopa (egyseg_id). Kérjük, futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd próbálja újra a mentést.'
  }
  return `Hiba: ${msg}`
}

/** A PostgREST „nincs ilyen oszlop: egyseg_id" hibájának felismerése —
 * az isMissingDeletedColumn (registry-sync) mintájára. */
function isMissingEgysegColumn(error: { message?: string } | null | undefined): boolean {
  const msg = (error?.message || '').toLowerCase()
  return msg.includes('egyseg_id') && (msg.includes('column') || msg.includes('schema cache'))
}

// A strip+retry figyelmeztetése — a hívó toast-ban jelzi, hogy a sor mentve
// van, de az egység-címke NEM (fail-closed: nincs néma adatvesztés).
const EGYSEG_OSZLOP_HIANYZIK_FIGYELMEZTETES =
  'A bejegyzés mentve, de az egység-címke nem került eltárolásra: az adatbázisból még hiányzik a munkanaplo.egyseg_id oszlop. Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt.'

/**
 * Munkanapló-bejegyzések lekérdezése.
 *
 * 2026-06-12 (Endre #3 munkanapló): a `period` lehet
 *  - 'YYYY-MM' → adott hónap (eddigi viselkedés)
 *  - 'YYYY'    → teljes év (az év/típus-szűrőhöz és a nyomtatási központhoz)
 *
 * A `deleted` szűrő fallback-kel fut: ha az oszlop még nem létezik a DB-ben
 * (a 2026-06-12c SQL lefuttatásáig), oszlop nélkül kérdezünk — különben a
 * teljes lista üresen jönne vissza (ez volt a modul fő hibája).
 */
async function queryWorklogs(period: string): Promise<{ entries: WorklogEntry[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  // Nincs aktív gyülekezet → üres lista, hiba nélkül (a getWorklogs eddigi
  // néma viselkedése — a hívó oldali guard felelőssége a kontextus megléte).
  if (!congId) return { entries: [], error: null }
  const isFullYear = /^\d{4}$/.test(period)
  // 2026-07-11 (P1 hónap-vég): a korábbi `${period}-31` februárra/30-napos
  // hónapokra Postgres 'date/time field value out of range' hibát dobott →
  // üres lista. Helyette exkluzív felső határ: a következő időszak 1-je.
  let startDate: string
  let endExclusive: string
  if (isFullYear) {
    startDate = `${period}-01-01`
    endExclusive = `${Number(period) + 1}-01-01`
  } else {
    const [y, m] = period.split('-').map(Number)
    startDate = `${period}-01`
    endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  }

  // 2026-07-16 (F4): a PostgREST alapértelmezetten legfeljebb 1000 sort ad
  // vissza kérésenként — egy aktív gyülekezet teljes éve ezt túllépheti, és a
  // lista némán csonkulna. Ezért 1000-es range-oldalakban lapozunk, amíg
  // rövid oldal nem érkezik. A másodlagos .order('id') a determinisztikus
  // lapozáshoz kell: azonos idopont-ú sorok stabil sorrendje nélkül az
  // oldalhatáron sor maradhatna ki vagy duplázódhatna.
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` a kézi ciklus helyett.
  // A régi `page.length < PAGE_SIZE` stop-feltétel HIBÁS: ha a Supabase „Max Rows"
  // 1000 alá kerül, a szerver a kért 1000-es lapra kevesebbet ad, és a munkanapló
  // az ELSŐ lap után megállt volna — némán a szolgálatok felét mutatva a lelkészi
  // jelentésben is. `orderColumn: null`, mert a rendezés itt DIREKT fordított.
  const fetchAllPages = async (withDeletedFilter: boolean) => {
    let q = supabase.from('munkanaplo').select('*')
      .eq('congregation_id', congId)
      .gte('idopont', startDate).lt('idopont', endExclusive)
    if (withDeletedFilter) q = q.eq('deleted', false)
    const res = await selectAllPaged<WorklogEntry>(
      q.order('idopont', { ascending: false }).order('id', { ascending: false }),
      { orderColumn: null, dedupeBy: 'id' },
    )
    if (res.error) return { data: null, error: res.error }
    return { data: res.data, error: null }
  }

  // A `deleted`-oszlop fallback változatlan: ha az oszlop még nem létezik a
  // DB-ben, szűrő nélkül kérdezünk újra (lásd a docblockot fent).
  let res = await fetchAllPages(true)
  if (res.error && isMissingDeletedColumn(res.error)) res = await fetchAllPages(false)
  if (res.error) return { entries: [], error: res.error.message || 'Ismeretlen adatbázis-hiba' }
  return { entries: res.data || [], error: null }
}

export async function getWorklogs(period: string): Promise<WorklogEntry[]> {
  const res = await queryWorklogs(period)
  if (res.error) {
    console.warn('[getWorklogs] lekérdezés hiba:', res.error)
    return []
  }
  return res.entries
}

/** Teljes éves lista — a nyomtatási központ (éves lelkészi jelentés) adatforrása. */
export async function getWorklogsForYear(year: number): Promise<WorklogEntry[]> {
  return getWorklogs(String(year))
}

/**
 * 2026-07-17 (F5): teljes éves lista HIBA-TOVÁBBADÁSSAL — a hivatalos lelkészi
 * jelentés aggregátora hívja. A sima getWorklogs hibánál üres tömböt ad vissza
 * (a naptár-UI ezt túléli), de HIVATALOS rubrikában a néma 0 tilos: itt a
 * lapozó hibája szövegesen visszamegy a hívónak, aki a worklog-alapú mezőket
 * null-on hagyja és jelzi a hibát.
 */
export async function getWorklogsForYearChecked(
  year: number,
): Promise<{ entries: WorklogEntry[]; error: string | null }> {
  return queryWorklogs(String(year))
}

/**
 * Mentés. Siker: `{ success: true }`; `warning` akkor jön mellé, ha a sor
 * mentve van, de az egység-címke a hiányzó egyseg_id oszlop miatt kimaradt
 * (a hívó toast-ban jelzi — nincs néma adatvesztés). Hiba: `{ error }`.
 */
export async function saveWorklog(
  data: WorklogInput,
): Promise<{ success?: true; warning?: string; error?: string }> {
  const parsed = worklogSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  // jelenlet_osszesen NOT NULL — automatikusan számítjuk ha nem adott
  const sumJelenlet =
    d.jelenlet_osszesen ??
    ((d.jelenlet_ferfi ?? 0) + (d.jelenlet_no ?? 0) + (d.jelenlet_gyermek ?? 0))

  const record: Record<string, unknown> = {
    idopont: d.idopont,
    jellege: d.jellege,
    kategoria: d.kategoria || 'szolgalat',
    id_jellege: d.id_jellege || null,
    bibliaolvasas: d.bibliaolvasas || null,
    alapige: d.alapige || null,
    cim: d.cim || null,
    enekek: d.enekek || null,
    jelenlet_ferfi: d.jelenlet_ferfi ?? null,
    jelenlet_no: d.jelenlet_no ?? null,
    jelenlet_gyermek: d.jelenlet_gyermek ?? null,
    jelenlet_osszesen: sumJelenlet,
    szolgalt: d.szolgalt || null,
    persely: d.persely ?? null,
    // 2026-07-11 (F2): a legacy `du` boolean a napszakkal szinkronban — ha
    // érkezett napszak, abból számoljuk; különben a küldött d.du marad.
    du: d.napszak != null ? d.napszak === 'du' : (d.du ?? false),
    napszak: d.napszak ?? null,
    // Úrvacsorázók — templomban / betegnél (csak szolgálatnál értelmezett;
    // üresen hagyva null, a 0 értelmes adat).
    uv_templomban: d.uv_templomban ?? null,
    uv_betegnel: d.uv_betegnel ?? null,
    megjegyzes: d.megjegyzes || null,
    deleted: false,
    congregation_id: congId,
  }
  // 2026-07-11 (mediapath-védelem): a dialog sosem küld mediapath-ot — ha a
  // kulcs feltétel nélkül szerepelne, minden szerkesztés NULL-ra írná a
  // meglévő csatolmány-útvonalat. Csak akkor írjuk, ha ténylegesen érkezett.
  if (d.mediapath !== undefined) record.mediapath = d.mediapath || null
  // 2026-08-25 (gyülekezeti egységek — a mediapath-minta): az egység-címke
  // csak akkor íródik, ha a kliens ténylegesen küldte. Ha az egység-választó
  // nem jelent meg (a lista nem töltődött be / migráció előtt), a meglévő
  // címke NEM nullázódik. A küldött null = anyaközpont (tudatos választás).
  if (d.egyseg_id !== undefined) record.egyseg_id = d.egyseg_id ?? null
  // 2026-08-25 (gyülekezeti egységek): egység-tulajdon ellenőrzés a mentés
  // ELŐTT — idegen gyülekezet egység-azonosítóját nem fogadjuk el. Az `aktiv`
  // oszlopra szándékosan NEM szűrünk: szerkesztésnél egy időközben inaktivált
  // egység címkéje megőrizhető. Ha a tábla még nem létezik (a migráció nem
  // futott le), NEM blokkoljuk a mentést — a lenti strip-retry út kezeli.
  if (d.egyseg_id !== undefined && d.egyseg_id !== null) {
    const egysegRes = await supabase
      .from('gyulekezeti_egysegek')
      .select('id')
      .eq('id', d.egyseg_id)
      .eq('congregation_id', congId)
      .limit(1)
    if (egysegRes.error) {
      if (!/does not exist|schema cache|could not find/i.test(egysegRes.error.message)) {
        // Fail-closed: ismeretlen hibánál nem engedjük át az ellenőrizetlen ID-t.
        return { error: `A gyülekezeti egység ellenőrzése nem sikerült: ${egysegRes.error.message}` }
      }
      // Hiányzó tábla (migráció előtt): a mentés mehet tovább.
    } else if ((egysegRes.data?.length ?? 0) === 0) {
      return { error: 'A megadott gyülekezeti egység nem ehhez a gyülekezethez tartozik.' }
    }
  }
  // Ha az egyseg_id oszlop még nem létezik a DB-ben (a 2026-08-25-ös migráció
  // előtt), a mentés nem dőlhet el: a címkét levágjuk, újrapróbálunk, és a
  // hívónak figyelmeztetést adunk vissza (strip + figyelmeztetés minta).
  let egysegWarning: string | undefined
  if (d.id) {
    // 2026-06-12: szerkesztéskor az id_jellege-t NEM nulláznánk ki — abban él
    // az anyakönyvi forrás-marker (pl. `keresztseg:123`). A dialog nem küldi,
    // ezért csak akkor írjuk, ha ténylegesen jött érték.
    if (!d.id_jellege) delete record.id_jellege
    // 2026-07-11 (konkurencia): ha a kliens revision-t küld, csak az azonos
    // revision-ű sort frissítjük (a DB bump-triggere lépteti) — így a
    // desktop/web párhuzamos szerkesztés nem írja felül egymást némán.
    const runUpdate = () => {
      let q = supabase.from('munkanaplo').update(record).eq('id', d.id!).eq('congregation_id', congId)
      if (d.revision !== undefined) q = q.eq('revision', d.revision)
      return q.select('id')
    }
    let upd = await runUpdate()
    if (upd.error && isMissingDeletedColumn(upd.error)) {
      delete record.deleted
      upd = await runUpdate()
    }
    if (upd.error && isMissingEgysegColumn(upd.error) && 'egyseg_id' in record) {
      delete record.egyseg_id
      egysegWarning = EGYSEG_OSZLOP_HIANYZIK_FIGYELMEZTETES
      upd = await runUpdate()
    }
    if (upd.error) return { error: worklogSaveError(upd.error) }
    if (!upd.data || upd.data.length === 0) {
      return { error: 'A bejegyzést időközben máshol módosították. Frissítse a listát, és próbálja újra.' }
    }
  } else {
    let ins = await supabase.from('munkanaplo').insert([record])
    if (ins.error && isMissingDeletedColumn(ins.error)) {
      delete record.deleted
      ins = await supabase.from('munkanaplo').insert([record])
    }
    if (ins.error && isMissingEgysegColumn(ins.error) && 'egyseg_id' in record) {
      delete record.egyseg_id
      egysegWarning = EGYSEG_OSZLOP_HIANYZIK_FIGYELMEZTETES
      ins = await supabase.from('munkanaplo').insert([record])
    }
    if (ins.error) return { error: worklogSaveError(ins.error) }
  }
  revalidatePath('/munkanaplo')
  return { success: true, warning: egysegWarning }
}

export async function deleteWorklog(id: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  // Soft-delete; ha a `deleted` oszlop még nem létezik, hard-delete fallback.
  let res = await supabase.from('munkanaplo').update({ deleted: true }).eq('id', id).eq('congregation_id', congId)
  if (res.error && isMissingDeletedColumn(res.error)) {
    res = await supabase.from('munkanaplo').delete().eq('id', id).eq('congregation_id', congId)
  }
  if (res.error) return { error: `Hiba: ${res.error.message}` }
  revalidatePath('/munkanaplo')
  return { success: true }
}
