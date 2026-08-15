/**
 * inventory-write — a leltár desktop írás-rétege (2026-08-15, desktop-paritás
 * 4. szelet — „Leltár: rögzítés + fisa").
 *
 * MIÉRT online-only (paritás-terv 4.4. kockázat, a Kuka-szelet mintája): a
 * leltári szám kiosztása a szerveren már kiadott számok TELJES listájából
 * történik — offline outbox-szal két gépen ugyanaz a szám ismétlődhetne.
 * Ezért a mentés kizárólag élő kapcsolattal fut; offline a hívó felület
 * HANGOS magyarázatot mutat.
 *
 * KÖZÖS SZABÁLY-RÉTEG (@kartoteka/ui-app inventory/save.ts): a validáció, a
 * szám-generálás szabálya, a kanonikus + fallback payload és a séma-fallback
 * felismerés a webes Server Actionnel (apps/web/app/(dashboard)/leltar/
 * actions.ts) KÖZÖS forrásból jön — itt csak az IO és az őr-lánc desktopos:
 *   - getVerifiedSession (4.3. kockázat: session + lejárat + fiók-egyezőség)
 *   - kézi hatókör-őr az RLS-en FELÜL (4.8. kockázat): minden írás
 *     `.eq('congregation_id', …)`-vel szűkítve, fail-closed
 *   - szerver-visszaigazolás: minden írás `.select('id')`-del zár, 0 sor =
 *     HANGOS magyar hiba (a PostgREST a 0 sort érintő UPDATE-re is hibátlan
 *     választ ad — néma siker TILOS; a recycle-bin.ts élő mintája)
 *
 * Excel write-through SZÁNDÉKOSAN nincs (4.9. kockázat): a leltár nem része
 * az Excel-könyvelés tükrének — a pénzügyi write-flow-k Excel-sora itt nem
 * értelmezett.
 */

import {
  buildInventoryUpsertPayloads,
  isInventoryLegacySchemaError,
  leltariSzamQueryFailedMessage,
  nextLeltariSzam,
  validateInventoryUpsertInput,
  INVENTORY_CATEGORY_PREFIXES,
  type InventoryCategory,
  type InventoryUpsertInput,
} from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { getVerifiedSession } from './verified-session'
import { selectAllPaged } from './sync'

type SupabaseClient = ReturnType<typeof getDesktopSupabase>

/**
 * A következő leltári szám a szerverről, LAPOZVA és fail-closed módon
 * (a webes `generateNextLeltariSzam` desktop-párja; a szabály közös).
 */
async function generateNextLeltariSzamDesktop(
  supabase: SupabaseClient,
  congregationId: string,
  category: InventoryCategory,
): Promise<string> {
  const prefix = INVENTORY_CATEGORY_PREFIXES[category]
  const { data, error } = await selectAllPaged<{ leltari_szam: string | null }>(
    supabase
      .from('leltar_tetelek')
      .select('leltari_szam')
      .eq('congregation_id', congregationId)
      .ilike('leltari_szam', `${prefix}-%`),
    // A leltari_szam nem egyedi kulcs a lapozáshoz — az alap `id` rendezés jó.
  )
  if (error) {
    // Fail-closed: hiányos listából egy MÁR HASZNÁLT szám ismétlődne.
    throw new Error(leltariSzamQueryFailedMessage(error.message))
  }
  return nextLeltariSzam((data ?? []).map(r => r.leltari_szam), category)
}

/** Írás-előkészítés: fail-closed hatókör + verified-session őr. */
async function preparedWrite(congregationId: string): Promise<SupabaseClient> {
  if (!congregationId) {
    throw new Error('Hiányzó gyülekezet-azonosító — a leltári tétel nem menthető.')
  }
  // 4.3. kockázat: MINDEN felhő-írás a verified-session őrön át
  // (session + lejárat + fiók-egyezőség) — hibánál érthető magyar üzenet.
  const verified = await getVerifiedSession()
  if (!verified.ok) throw new Error(verified.message)
  return getDesktopSupabase()
}

/**
 * Leltári tétel mentése (új rögzítés vagy szerkesztés) a szerverre.
 *
 * A webes `saveInventoryItem` desktop-párja: közös validáció + közös payload;
 * új tételnél szám-generálás és 23505-ütközésnél (párhuzamos rögzítés) max.
 * 3 újrapróbálás FRISS számmal — pontosan mint a weben.
 */
export async function saveInventoryItemDesktop(
  congregationId: string,
  input: InventoryUpsertInput,
): Promise<{ leltariSzam: string | null }> {
  const validationError = validateInventoryUpsertInput(input)
  if (validationError) throw new Error(validationError)

  const supabase = await preparedWrite(congregationId)
  const { record, modernFallback } = buildInventoryUpsertPayloads(input, congregationId)

  if (input.id) {
    // ── Szerkesztés ────────────────────────────────────────────────────────
    // Kézi hatókör-őr az RLS-en FELÜL: csak a saját gyülekezet sora írható.
    let { data, error } = await supabase
      .from('leltar_tetelek')
      .update(record)
      .eq('id', input.id)
      .eq('congregation_id', congregationId)
      .select('id')
    if (isInventoryLegacySchemaError(error?.message)) {
      const retry = await supabase
        .from('leltar_tetelek')
        .update(modernFallback)
        .eq('id', input.id)
        .eq('congregation_id', congregationId)
        .select('id')
      data = retry.data
      error = retry.error
    }
    if (error) throw new Error(`A leltári tétel mentése nem sikerült: ${error.message}`)
    // Szerver-visszaigazolás: 0 érintett sor = NEM történt meg (néma siker tilos).
    if (!data || data.length === 0) {
      throw new Error(
        'A mentés nem történt meg a szerveren — lehet, hogy a tételt közben törölték, vagy nincs hozzá jogosultságod. Frissítsd a listát, és próbáld újra.',
      )
    }
    return { leltariSzam: null }
  }

  // ── Új tétel ────────────────────────────────────────────────────────────
  let leltariSzam = await generateNextLeltariSzamDesktop(supabase, congregationId, input.kategoria)
  let lastError: { code?: string; message: string } | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      // Párhuzamos rögzítésnél két hívó ugyanazt a számot kaphatja — az
      // egyediségi index 23505-tel utasítja el a másodikat; FRISS számmal újra.
      leltariSzam = await generateNextLeltariSzamDesktop(supabase, congregationId, input.kategoria)
    }
    record.leltari_szam = leltariSzam
    modernFallback.leltari_szam = leltariSzam

    let { data, error } = await supabase.from('leltar_tetelek').insert([record]).select('id')
    if (isInventoryLegacySchemaError(error?.message)) {
      const retry = await supabase.from('leltar_tetelek').insert([modernFallback]).select('id')
      data = retry.data
      error = retry.error
    }
    if (!error) {
      // Szerver-visszaigazolás az inserten is: üres válasz = nem jött létre sor.
      if (!data || data.length === 0) {
        throw new Error(
          'A rögzítés nem történt meg a szerveren — a szerver nem igazolta vissza az új tételt. Frissítsd a listát, és próbáld újra.',
        )
      }
      return { leltariSzam }
    }
    lastError = error
    if (error.code !== '23505') break
  }
  throw new Error(`A leltári tétel rögzítése nem sikerült: ${lastError?.message ?? 'ismeretlen hiba'}`)
}
