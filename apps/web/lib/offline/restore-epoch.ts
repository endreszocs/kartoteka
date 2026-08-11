/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISSZAÁLLÍTÁS 4. FÁZISA — AZ OFFLINE KLIENS ŐRE. 2026-08-11.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A PROBLÉMA, AMIT MEGOLD (és ami e nélkül az egész visszaállítást hazuggá teszi)
 * ─────────────────────────────────────────────────────────────────────────────
 * A `backup_restore_apply` a visszaállított sorokat az EREDETI `updated_at`
 * értékükkel írja vissza. A helyi (Dexie) másolat viszont delta-szinkronnal
 * frissül: `WHERE updated_at > lastPullAt`. Vagyis
 *
 *   · a visszaállított (RÉGI időbélyegű) sorokat a kliens SOHA nem húzza le,
 *   · a visszaállítás által TÖRÖLT sorok a Dexie-ben ottmaradnak,
 *   · és a `push.ts` a helyi, ÚJABB verziókat visszaírja a szerverre.
 *
 * Vagyis a lelkész laptopja a következő szinkronnál RÉSZLEGESEN VISSZACSINÁLJA
 * a visszaállítást — némán, senkinek nem szólva. Az adatbázis félig a
 * visszaállított, félig a régi állapotot mutatná, és soha senki nem tudná meg,
 * melyik sor melyik.
 *
 * A MEGOLDÁS
 * ──────────
 * A `congregations.restore_epoch` minden visszaállításnál eggyel nő. A kliens
 * MINDEN szinkron-kör elején összeveti a sajátjával, és eltérésnél:
 *   1) a helyi mutációs sort KARANTÉNBA teszi (NEM dobja el — a lelkész munkája
 *      nem tűnhet el csak azért, mert a rendszergazda visszaállított),
 *   2) az adat-táblákat üríti, a pull-kurzorokat nullázza → TELJES újratöltés,
 *   3) rögzíti az új epoch-ot.
 *
 * ⛔ FAIL CLOSED A PUSH IRÁNYÁBAN. Ha az epoch-ot NEM tudjuk lekérdezni, a
 *    PUSH nem indulhat el: az a veszélyes irány, ami felülírhatná a frissen
 *    visszaállított adatot. A pull ilyenkor is mehet (az nem ront el semmit).
 */

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

import { getDb, getSyncMeta, setSyncMeta, type SyncMetaRecord } from './db'
import { TABLE_REGISTRY } from './table-registry'

/**
 * A `_sync_meta` táblában erre a KULCSRA tesszük el az ismert epoch-ot.
 * Nem valódi tábla — a `_sync_meta` elsődleges kulcsa a `table` mező, ezért egy
 * foglalt, `__`-előtagú név a legkevésbé zavaró hely. Új Dexie-verzió NEM kell
 * hozzá (nem indexelt mező).
 */
const EPOCH_META_KULCS = '__restore_epoch'

export type EpochEllenorzes =
  | { ok: true; epoch: number; valtozott: boolean }
  | { ok: false; hiba: string }

/** Az eltárolt (utoljára ismert) epoch. `null` = még sosem láttuk. */
export async function loadIsmertEpoch(): Promise<number | null> {
  if (typeof window === 'undefined') return null
  const db = getDb()
  const meta = await db._sync_meta.get(EPOCH_META_KULCS)
  const ertek = (meta as (SyncMetaRecord & { restoreEpoch?: number | null }) | undefined)
    ?.restoreEpoch
  return typeof ertek === 'number' ? ertek : null
}

async function saveIsmertEpoch(congregationId: string | null, epoch: number): Promise<void> {
  const meta = await getSyncMeta(EPOCH_META_KULCS, congregationId)
  await setSyncMeta({ ...meta, congregationId, restoreEpoch: epoch } as SyncMetaRecord)
}

/**
 * Lekérdezi a szerverről az aktuális epoch-ot, és összeveti a helyivel.
 *
 * ⚠️ NEM ír és nem töröl semmit — a döntést a hívóra bízza. A wipe önálló
 *    függvény, hogy a hívó tudja: MOST történik valami visszafordíthatatlan.
 */
export async function checkRestoreEpoch(congregationId: string): Promise<EpochEllenorzes> {
  if (typeof window === 'undefined') return { ok: false, hiba: 'Csak kliens-oldalon futtatható.' }

  const supabase = createBrowserSupabase()
  const { data, error } = await supabase
    .from('congregations')
    .select('restore_epoch')
    .eq('id', congregationId)
    .maybeSingle()

  if (error) {
    // Hiányzó oszlop (a migráció még nem futott le) — ilyenkor nincs mit
    // őrizni, és nem blokkolunk. Minden MÁS hiba viszont fail-closed.
    const uzenet = (error.message || '').toLowerCase()
    if (uzenet.includes('restore_epoch') && uzenet.includes('does not exist')) {
      return { ok: true, epoch: 0, valtozott: false }
    }
    return { ok: false, hiba: error.message }
  }
  if (!data) {
    return { ok: false, hiba: 'A gyülekezet nem olvasható — a szinkron nem folytatható.' }
  }

  const epoch = Number((data as { restore_epoch: number | null }).restore_epoch ?? 0)
  if (!Number.isFinite(epoch)) {
    return { ok: false, hiba: 'A visszaállítás-számláló értelmezhetetlen.' }
  }

  const ismert = await loadIsmertEpoch()
  // ELSŐ ALKALOM: nincs mihez hasonlítani. Ilyenkor CSAK RÖGZÍTÜNK — nem
  // ürítünk. Egy friss böngészőben a teljes letöltés úgyis megtörténik, és egy
  // fölösleges wipe csak elveszett offline munkát jelentene.
  if (ismert === null) {
    await saveIsmertEpoch(congregationId, epoch)
    return { ok: true, epoch, valtozott: false }
  }

  return { ok: true, epoch, valtozott: epoch !== ismert }
}

export interface KaranténEredmeny {
  /** Hány függőben lévő helyi módosítás került karanténba. */
  karantenozott: number
  /** Hány adat-táblát ürítettünk. */
  uritettTablak: number
}

/**
 * A TELJES ÚJRAKEZDÉS: karantén + ürítés + kurzor-nullázás.
 *
 * ⚠️ A MUTÁCIÓS SOR NEM TÖRLŐDIK. A `status = 'dead'` és a beszédes hibaüzenet
 *    azt jelenti: „ezt NEM küldtük el, itt van, nézd meg". Egy `clear()` a
 *    lelkész aznapi munkáját tüntetné el nyom nélkül — pontosan az a néma
 *    adatvesztés, ami ellen az egész mentés-rendszer épül.
 *
 *    A `wipeDb()`-t szándékosan NEM használjuk: az MINDENT töröl, a mutációs
 *    sorral együtt.
 */
export async function quarantineAndResync(
  congregationId: string,
  ujEpoch: number,
): Promise<KaranténEredmeny> {
  const db = getDb()
  const eredmeny: KaranténEredmeny = { karantenozott: 0, uritettTablak: 0 }

  // ── 1) KARANTÉN ──
  const fuggoben = await db._mutation_queue
    .where('status')
    .anyOf(['pending', 'failed', 'syncing', 'conflict'])
    .toArray()
  if (fuggoben.length > 0) {
    await db._mutation_queue.bulkPut(
      fuggoben.map((m) => ({
        ...m,
        status: 'dead' as const,
        errorMsg:
          'KARANTÉNBAN: a rendszergazda visszaállította a gyülekezet adatait egy korábbi ' +
          'mentésből, ezért ezt a helyi módosítást NEM küldtük el (felülírta volna a ' +
          'visszaállított állapotot). A tartalma megvan — nézd át, és ha kell, vidd fel újra.',
      })),
    )
    eredmeny.karantenozott = fuggoben.length
  }

  // ── 2) ADAT-TÁBLÁK ÜRÍTÉSE + KURZOR NULLÁZÁSA ──
  const adatTablak = new Set(TABLE_REGISTRY.map((e) => e.dexieTable))
  for (const t of db.tables) {
    if (!adatTablak.has(t.name)) continue
    await t.clear()
    eredmeny.uritettTablak += 1
    const meta = await db._sync_meta.get(t.name)
    if (meta) await db._sync_meta.put({ ...meta, lastPullAt: null, lastError: null })
  }
  // A konfliktus-tár is elavult: azok a szerver-verziók már nem léteznek.
  await db._conflicts.clear()

  // ── 3) AZ ÚJ EPOCH RÖGZÍTÉSE — LEGVÉGÜL ──
  // Ha bármi elhasal fölötte, az epoch RÉGI marad, és a következő szinkron
  // újrapróbálja. Egy félig lefutott újrakezdés így nem tud „késznek" látszani.
  await saveIsmertEpoch(congregationId, ujEpoch)
  return eredmeny
}
