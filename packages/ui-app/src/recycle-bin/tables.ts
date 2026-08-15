/**
 * A desktop Kuka soft-delete táblalistája (2026-08-15, desktop-paritás
 * 3. szelet).
 *
 * ⚠️ KÉT LISTA, EGY ÍGÉRET — kölcsönös hivatkozással:
 * a webes Kuka a tábláit az `apps/web/lib/offline/table-registry.ts`
 * `softDelete: true` bejegyzéseiből származtatja (Dexie-alapú lista), a
 * desktop Kuka viszont EBBŐL a fájlból olvas, mert a paritás-terv 4.6.
 * kockázata szerint a Dexie-s `recycle-bin-actions.ts` desktopon nem
 * újrahasználható — ott direkt Supabase-lekérdezés fut. Ha a webes
 * registry-ben soft-delete tábla kerül be vagy ki (vagy a jelző-oszlop neve
 * változik), EZT A LISTÁT IS frissíteni kell, különben a desktop Kuka némán
 * hiányos lesz (a repó ismert hibaosztálya: „a második felület a régi
 * implementációt őrzi").
 *
 * A `label` a webes Kuka cím-formátumát tükrözi:
 * `MODULE_META[module].label · entry.label`.
 */

/**
 * Hatókör-mód a gyülekezet-szűréshez:
 *  - 'congregation_id': a táblán VAN congregation_id oszlop → közvetlen .eq
 *  - 'temeto_fk':   sirhely — a temetoid → sirhelytemeto.congregation_id láncon
 *  - 'sirhely_fk':  sirhelyberles / sirhelyelhunyt — a sirhelyid → sirhely →
 *                   sirhelytemeto láncon (a webes sirhelyek/actions.ts
 *                   `sirhelyAMienk` tulajdonjog-lánca)
 */
export type RecycleBinScope = 'congregation_id' | 'temeto_fk' | 'sirhely_fk'

export interface RecycleBinTableDef {
  /** Supabase tábla név (a Dexie-névvel azonos). */
  table: string
  /** Csoport-fejléc címe — a webes Kuka „Modul · Tábla" formátuma. */
  label: string
  /** A soft-delete jelző oszlopneve (a leltar_tetelek-nél `is_deleted`). */
  softDeleteColumn: 'deleted' | 'is_deleted'
  /** Gyülekezet-hatókör módja (fail-closed: minden táblának kötelező). */
  scope: RecycleBinScope
}

export const RECYCLE_BIN_TABLES: RecycleBinTableDef[] = [
  // Pénzügy
  { table: 'befizetes', label: 'Pénzügy · Befizetések', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  { table: 'kiadas', label: 'Pénzügy · Kiadások', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  { table: 'belsomozgas', label: 'Pénzügy · Belső mozgás', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  { table: 'berleti_szerzodes', label: 'Pénzügy · Bérleti szerződések', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  // Munkanapló
  { table: 'munkanaplo', label: 'Munkanapló · Munkanapló', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  // Iktató
  { table: 'iktato', label: 'Iktató · Iratok', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  { table: 'iktato_sablonok', label: 'Iktató · Sablonok', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  // Leltár — a jelző itt `is_deleted` (NEM `deleted`)!
  { table: 'leltar_tetelek', label: 'Leltár · Leltár tételek', softDeleteColumn: 'is_deleted', scope: 'congregation_id' },
  // Sírhely
  { table: 'sirhelytemeto', label: 'Sírhely · Temetők', softDeleteColumn: 'deleted', scope: 'congregation_id' },
  { table: 'sirhely', label: 'Sírhely · Sírhelyek', softDeleteColumn: 'deleted', scope: 'temeto_fk' },
  { table: 'sirhelyberles', label: 'Sírhely · Bérletek', softDeleteColumn: 'deleted', scope: 'sirhely_fk' },
  { table: 'sirhelyelhunyt', label: 'Sírhely · Elhunytak', softDeleteColumn: 'deleted', scope: 'sirhely_fk' },
]
