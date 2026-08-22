'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { getModuleScopeContext, moduleWriteBlock } from '@/lib/auth/module-scope'
import { buildRecycleBinLabel } from '@/lib/offline/recycle-bin-labels'
import {
  MODULE_META,
  TABLE_REGISTRY,
  type TableRegistryEntry,
} from '@/lib/offline/table-registry'

/**
 * Kuka — pontos törlés-dátumok a szerverről (2026-08-14, 6. pont 2. ütem).
 *
 * MIÉRT KÜLÖN AKCIÓ, MIÉRT NEM A SYNC-PULL: a soft-delete táblák pull-select
 * listái EXPLICITEK — ha a `deleted_at`-ot most beletennénk, a szinkron
 * 42703-mal (nincs ilyen oszlop) törne el MINDEN gépen, amíg a
 * 2026-08-14-kuka-deleted-at.sql migráció nem fut le élesben. Ez az akció
 * ehelyett FAIL-SOFT: ha az oszlop (még) nem létezik, üres térképet ad
 * vissza, és a Kuka a régi, „legfeljebb N nap" becslést mutatja tovább.
 *
 * Biztonság:
 *  - FAIL-CLOSED hatókör: congregation-kontextus nélkül ÜRES a válasz — a
 *    „NULL skalár → szűretlen lista" hibaosztály (2026-08-09) tiltott minta;
 *  - a tábla-nevek a TABLE_REGISTRY-vel szemben validálódnak (csak
 *    soft-delete tábla kérdezhető), a sorokat az RLS is szűri;
 *  - CSAK a kliens által ténylegesen mutatott azonosítókra kérdezünk
 *    (darabolt .in), nem a teljes törölt állományra.
 */

// Egy PostgREST-kérésben ennyi id megy (URL-hossz korlát miatt darabolunk).
const ID_CHUNK = 100
// Táblánként legfeljebb ennyi id-t szolgálunk ki — a Kuka-nézet 500/tábla
// sort mutat, ez bőven fedezi; a plafon HANGOS (levágásnál warn).
const MAX_IDS_PER_TABLE = 600

export async function fetchExactDeletedAt(
  items: Array<{ table: string; ids: Array<string | number> }>,
): Promise<Record<string, string>> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()

  // Fail-closed: a Kuka gyülekezet-szintű felület. Kontextus nélkül nem
  // esünk vissza szűretlen lekérdezésre — üres térkép megy vissza.
  if (!congregationId) return {}

  const result: Record<string, string> = {}

  for (const item of items) {
    const entry = TABLE_REGISTRY.find(
      t => t.dexieTable === item.table && t.softDelete,
    )
    if (!entry) continue // ismeretlen vagy nem soft-delete tábla — nem kérdezzük
    if (!Array.isArray(item.ids) || item.ids.length === 0) continue

    const ids = item.ids
      .filter(id => typeof id === 'string' || typeof id === 'number')
      .slice(0, MAX_IDS_PER_TABLE)
    if (item.ids.length > MAX_IDS_PER_TABLE) {
      console.warn(
        '[kuka fetchExactDeletedAt] id-plafon:',
        item.table,
        `${item.ids.length} → ${MAX_IDS_PER_TABLE}`,
      )
    }

    const jelzo = entry.softDeleteColumn ?? 'deleted'
    try {
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const chunk = ids.slice(i, i + ID_CHUNK)
        let query = supabase
          .from(entry.supabaseTable)
          .select('id, deleted_at')
          .eq(jelzo, true)
          .in('id', chunk)
        if (entry.scopeFilter === 'congregation_id') {
          query = query.eq('congregation_id', congregationId)
        }
        const { data, error } = await query
        if (error) {
          // 42703 (nincs deleted_at oszlop) várható, amíg a migráció nem fut le.
          console.warn('[kuka fetchExactDeletedAt]', item.table, error.message)
          break
        }
        for (const row of (data ?? []) as Array<{
          id: string | number
          deleted_at: string | null
        }>) {
          if (row.deleted_at) result[`${item.table}:${row.id}`] = row.deleted_at
        }
      }
    } catch (e) {
      console.warn('[kuka fetchExactDeletedAt]', item.table, e)
    }
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// KERÜLETI KUKA (2026-08-22, S7 — első fél)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ A TÜNET, AMI MIATT EZ MEGÉPÜLT — „ADAT-TEMETŐ"
// ───────────────────────────────────────────────────────────────────────────
// Az S5 óta a hat scope-oszlopos táblából háromban (leltar_tetelek, iktato,
// iktato_sablonok) KERÜLETI sorok is élnek (`district_id IS NOT NULL`,
// `congregation_id IS NULL`). Ezeket a kerületi ügyintéző TÖRÖLNI tudja —
// de utána:
//   · a Kuka NEM mutatja őket, mert a webes Kuka a DEXIE-ből olvas, a pull
//     pedig `congregation_id = $1`-re szűr (lib/offline/pull.ts) — kerületi
//     sor SOHA nem kerül a helyi másolatba;
//   · a `purge_recycle_bin()` NEM törli őket fizikailag, mert már szűkítve van
//     `congregation_id IS NOT NULL`-ra.
// Vagyis a törölt kerületi sor ÖRÖKRE ott ül soft-delete állapotban,
// láthatatlanul: se vissza nem hozható, se el nem tűnik. Nem adatvesztés —
// adat-temető.
//
// MIÉRT SZERVER-OLDALI EZ AZ ÁG, ÉS MIÉRT NEM A DEXIE-S KUKA BŐVÍTÉSE
// ───────────────────────────────────────────────────────────────────────────
// A Dexie-s út bővítése azt jelentené, hogy a `TABLE_REGISTRY.scopeFilter`
// szemantikája megváltozik, és a pull ELKEZDENE kerületi sorokat is letölteni
// MINDEN gépre. Azt a mezőt viszont a `pull.ts`, a `full-backup.ts` és a
// „Kapcsolat nélküli mód" panel biztonsági listája (`SZURETLEN_TABLAK`) is
// olvassa, a desktop is ráfordul — ~500 gyülekezet napi szinkronja és a napi
// mentés múlik rajta. A kerületi Kuka ehhez képest EGY felhasználói kör
// ESETI művelete. Ezért a kerületi ág DIREKT Supabase-lekérdezés, itt,
// szerver-oldalon; a `table-registry.ts` és a `db.ts` BYTE-RA VÁLTOZATLAN.
//
// ⚠️ A GYÜLEKEZETI ÚT (fentebb: `fetchExactDeletedAt` + a Dexie-s
//    `recycle-bin-view.tsx`) EGYETLEN BÁJTJA SEM VÁLTOZOTT.

/**
 * A hat scope-oszlopos tábla — a `lib/auth/module-scope-core.ts` fejlécében
 * dokumentált kanonikus lista futásidejű alakja. SZÁNDÉKOSAN mind a hat itt
 * van, nem csak a jelenleg soft-delete-es három: a Kuka listáját ennek és a
 * `TABLE_REGISTRY` `softDelete` jelzőjének a METSZETE adja. Ha holnap az
 * `iktato_csatolmany` kap soft-delete-et és registry-bejegyzést, MAGÁTÓL
 * megjelenik itt; ha az `iktato` elveszti a soft-delete-et, magától eltűnik.
 * Így nem születik egy negyedik, kézzel karbantartott tábla-lista, ami némán
 * széthúzhatna a registryvel (a repó ismert hibaosztálya: „a második felület a
 * régi implementációt őrzi").
 */
const SCOPE_OSZLOPOS_TABLAK: readonly string[] = [
  'leltar_tetelek',
  'iktato',
  'iktato_sablonok',
  'iktato_yearly_closures',
  'iktato_csatolmany',
  'iktato_sequence_pointers',
]

/** Táblánként legfeljebb ennyi törölt kerületi sort mutatunk (hangos plafon). */
const KERULETI_SOR_PLAFON = 500

/**
 * A kerületi táblák id-je mind UUID (`iktato`, `iktato_sablonok`,
 * `leltar_tetelek` → `Table<…, string>` a `lib/offline/db.ts`-ben). A minta a
 * `tagi-portal/actions.ts` UUID-őrének mása: érvénytelen azonosítóra MEGÁLLUNK,
 * nem küldünk félkész szűrőt a PostgREST-nek.
 */
const UUID_MINTA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const KUKA_UTVONAL = '/kuka'

/** Egy törölt kerületi sor a felületnek — CSAK sima adat (Server→Client). */
interface KeruletiKukaSor {
  /** A Supabase tábla neve — ez megy vissza a visszaállító űrlapban. */
  tabla: string
  id: string
  /** Ember-olvasható cím (`buildRecycleBinLabel`, a gyülekezeti Kukával azonos). */
  cimke: string
  /** A törlés időpontja ISO-ban, ha ismert. */
  toroltEkkor: string | null
  /**
   * `true`, ha a dátum a `deleted_at` oszlopból jött (PONTOS); `false`, ha az
   * `updated_at`-ból (FELSŐ becslés — a soft-delete maga is egy update).
   */
  pontosDatum: boolean
}

/** Egy tábla csoportja a felületen. */
interface KeruletiKukaCsoport {
  tabla: string
  /** „Iktató · Iratok" — a gyülekezeti Kuka cím-formátuma. */
  cim: string
  sorok: KeruletiKukaSor[]
}

/**
 * A kerületi Kuka teljes állapota. DISZKRIMINÁLT UNIÓ: a `keruleti: false` ág
 * azt jelenti, hogy a hívó NEM kerületi hatókörben jár el — ilyenkor a
 * `page.tsx` a VÁLTOZATLAN gyülekezeti felületet rajzolja ki.
 */
type KeruletiKukaAllapot =
  | { keruleti: false }
  | {
      keruleti: true
      /** A kerület megjelenítendő neve (csak felirat, jogosultságról nem dönt). */
      keruletNev: string | null
      /** Írhat-e a hívó? A kerületi SZÁMVEVŐ olvashat, de nem állíthat vissza. */
      irhat: boolean
      /** Miért nem írhat — lelkész-barát magyar szöveg; `null`, ha írhat. */
      olvasoiUzenet: string | null
      csoportok: KeruletiKukaCsoport[]
      /**
       * Azok a táblák, amelyek olvasása HIBÁRA futott. Ha ez nem üres, a lista
       * HIÁNYOS — a felület ezt kiírja, és SOHA nem ígér „a kuka üres"-t.
       * (A gyülekezeti Kuka 2026-08-11-es tanulsága: a megnyugtató üres-állapot
       * a lelkésszel azt hitette el, hogy az adat véglegesen elveszett.)
       */
      hibasTablak: string[]
    }

/**
 * A kerületi Kukában megjelenő táblák — a fenti metszet, pull-prioritás
 * szerint (ugyanaz a sorrend, amit a gyülekezeti Kuka is használ).
 */
function keruletiKukaTablak(): TableRegistryEntry[] {
  return TABLE_REGISTRY.filter(
    t => t.softDelete && SCOPE_OSZLOPOS_TABLAK.includes(t.supabaseTable),
  ).sort((a, b) => a.priority - b.priority)
}

function csoportCim(entry: TableRegistryEntry): string {
  return `${MODULE_META[entry.module].label} · ${entry.label}`
}

/**
 * A kerületi hatókör feloldása a KANONIKUS feloldóval, fail-closed.
 *
 * ⚠️ ITT NINCS ÚJ, NEGYEDIK HATÓKÖR-FELOLDÓ. A `getModuleScopeContext()` az,
 * amit a Leltár és az Iktató is használ — ha a Kuka saját logikát gyártana,
 * pontosan az a „két réteg némán széthúz" hibaosztály térne vissza, ami miatt
 * a `module-scope.ts` egyáltalán megszületett. A benne lévő admin-override
 * kapu is ide öröklődik: „Belépés a gyülekezetbe" közben a hívó GYÜLEKEZETI
 * kontextust kap, tehát a változatlan gyülekezeti Kukát látja.
 *
 * `null` = a hívó NEM kerületi hatókörben jár el (gyülekezeti vagy megyei
 * szerep, aktív admin-override, vagy egyáltalán nincs feloldható hatókör).
 */
async function keruletiKontextus() {
  const ctx = await getModuleScopeContext()
  if ('error' in ctx) return null
  // A MEGYEI szint SZÁNDÉKOSAN nincs megnyitva (külön döntés) — a `!==` ág
  // tehát a diocese-t is a változatlan gyülekezeti felületre engedi vissza.
  if (ctx.scope !== 'district') return null
  // Öv-és-nadrágtartó a „NULL skalár → szűretlen lista" hibaosztály ellen: a
  // feloldó szerződése szerint a `scopeId` mindig kitöltött, de ha valaki
  // egyszer átírja, itt MEGÁLLUNK — nem kérdezünk szűrő nélkül.
  if (!ctx.scopeId) return null
  return ctx
}

/**
 * A kerület soft-delete sorai — a Kuka kerületi ága.
 *
 * FAIL-CLOSED: kerületi hatókör nélkül `{ keruleti: false }`, és EGYETLEN
 * lekérdezés sem fut le. Minden lekérdezés `.eq(ctx.scopeCol, ctx.scopeId)`-vel
 * szűr, ahol a `scopeCol` a kanonikus `moduleScopeColumn('district')`
 * eredménye — SOHA nem kézzel írt oszlopnév-literál (az némán a MÁSIK scope
 * oszlopára szűrne), és soha nem `if (id) query.eq(...)` alak (üres
 * azonosítónál a szűrő NÉMÁN eltűnne, és a felhasználó MINDEN gyülekezet
 * törölt sorait látná).
 */
export async function listDistrictDeletedRows(): Promise<KeruletiKukaAllapot> {
  const ctx = await keruletiKontextus()
  if (!ctx) return { keruleti: false }

  const csoportok: KeruletiKukaCsoport[] = []
  const hibasTablak: string[] = []

  for (const entry of keruletiKukaTablak()) {
    const jelzo = entry.softDeleteColumn ?? 'deleted'
    const alapOszlopok = entry.select ?? '*'

    // FAIL-SOFT a `deleted_at`-ra: a 2026-08-14-kuka-deleted-at.sql migráció
    // előtti adatbázison a PostgREST 42703-at adna, és a teljes tábla kiesne a
    // Kukából. Ezért ELŐSZÖR a pontos dátummal kérdezünk, és CSAK hibánál
    // esünk vissza a registry oszloplistájára (`updated_at` = felső becslés).
    let sorok: Array<Record<string, unknown>> | null = null
    let utolsoHiba: string | null = null

    for (const oszlopok of [`${alapOszlopok}, deleted_at`, alapOszlopok]) {
      const { data, error } = await ctx.supabase
        .from(entry.supabaseTable)
        .select(oszlopok)
        .eq(jelzo, true)
        .eq(ctx.scopeCol, ctx.scopeId)
        .order('updated_at', { ascending: false })
        .limit(KERULETI_SOR_PLAFON)

      if (!error) {
        sorok = (data ?? []) as unknown as Array<Record<string, unknown>>
        break
      }
      utolsoHiba = error.message
    }

    if (!sorok) {
      console.warn('[kuka kerületi lista]', entry.supabaseTable, utolsoHiba)
      hibasTablak.push(csoportCim(entry))
      continue
    }
    if (sorok.length === 0) continue

    if (sorok.length === KERULETI_SOR_PLAFON) {
      console.warn(
        '[kuka kerületi lista] sor-plafon:',
        entry.supabaseTable,
        `= ${KERULETI_SOR_PLAFON} (a lista csonka lehet)`,
      )
    }

    const cimkezo = buildRecycleBinLabel(entry.dexieTable)
    csoportok.push({
      tabla: entry.supabaseTable,
      cim: csoportCim(entry),
      sorok: sorok.map(sor => {
        const pontos = (sor.deleted_at as string | null | undefined) ?? null
        return {
          tabla: entry.supabaseTable,
          id: String(sor.id ?? ''),
          cimke: cimkezo(sor),
          toroltEkkor: pontos ?? ((sor.updated_at as string | null) ?? null),
          pontosDatum: Boolean(pontos),
        }
      }),
    })
  }

  return {
    keruleti: true,
    keruletNev: ctx.scopeName,
    irhat: ctx.canWrite,
    olvasoiUzenet: ctx.canWrite ? null : ctx.readOnlyReason,
    csoportok,
    hibasTablak,
  }
}

/** Üzenet-visszajelzés az űrlap után — a `tagi-portal/actions.ts` mintája. */
function keruletiValasz(kind: 'success' | 'error', message: string): never {
  redirect(`${KUKA_UTVONAL}?${new URLSearchParams({ [kind]: message }).toString()}`)
}

/**
 * EGY kerületi sor visszaállítása (soft-delete jelző → `false`).
 *
 * A kapuk sorrendje szándékos:
 *   1. kerületi hatókör feloldása (fail-closed, KANONIKUS feloldó) — az akció
 *      SOHA nem tágabb jogosultság, mint az őt kirajzoló oldal;
 *   2. `moduleWriteBlock` — a kerületi SZÁMVEVŐ (ellenőr) OLVASHAT, de nem
 *      állíthat vissza; enélkül a mentése az RLS-en bukna el nyers,
 *      érthetetlen PostgREST-hibával vagy néma 0-soros update-tel;
 *   3. a tábla a fenti METSZETTEL szemben validálódik (tetszőleges tábla-nevet
 *      NEM lehet beküldeni az űrlapban);
 *   4. az update `.eq('id') + .eq(scopeCol, scopeId) + .eq(jelzo, true)` — a
 *      hatókör-szűrő a WHERE-ben van, nem csak az RLS-ben (öv és nadrágtartó),
 *      és csak TÖRÖLT sort állítunk vissza.
 */
export async function restoreDistrictRow(formData: FormData): Promise<void> {
  const tablaNev = String(formData.get('tabla') ?? '').trim()
  const id = String(formData.get('id') ?? '').trim()

  const ctx = await keruletiKontextus()
  if (!ctx) {
    keruletiValasz(
      'error',
      'Ehhez a művelethez egyházkerületi hatókör kell. Ha kerületi szerepben jársz el, válts profilt, és próbáld újra.',
    )
  }

  const blokk = moduleWriteBlock(ctx)
  if (blokk) keruletiValasz('error', blokk.error)

  const entry = keruletiKukaTablak().find(t => t.supabaseTable === tablaNev)
  if (!entry) keruletiValasz('error', 'Ismeretlen vagy nem visszaállítható tábla.')

  if (!UUID_MINTA.test(id)) keruletiValasz('error', 'Érvénytelen azonosító.')

  const jelzo = entry.softDeleteColumn ?? 'deleted'
  const { data, error } = await ctx.supabase
    .from(entry.supabaseTable)
    .update({ [jelzo]: false })
    .eq('id', id)
    .eq(ctx.scopeCol, ctx.scopeId)
    .eq(jelzo, true)
    .select('id')

  if (error) {
    console.error('[kuka kerületi visszaállítás]', entry.supabaseTable, error.message)
    keruletiValasz(
      'error',
      'A visszaállítás most nem sikerült. Próbáld meg újra, és ha marad, jelezd a rendszergazdának.',
    )
  }

  // NÉMA 0-SOROS UPDATE ELLEN: ha az RLS vagy a hatókör-szűrő kizárta a sort,
  // a PostgREST nem ad hibát — csak üres tömböt jelent. Ilyenkor NEM írunk
  // sikert, mert a felhasználó azt hinné, hogy a tétel visszakerült.
  if (!data || (data as unknown[]).length === 0) {
    keruletiValasz(
      'error',
      'Ez a tétel már nincs a kukában, vagy nem ehhez az egyházkerülethez tartozik.',
    )
  }

  revalidatePath(KUKA_UTVONAL)
  keruletiValasz('success', 'A tételt visszaállítottuk.')
}
