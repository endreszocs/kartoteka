/**
 * issueChitantaUseCase — A-M7.2b (2026-04-22), A-M7.2d2b offline-ág (2026-04-24).
 *
 * Papír-chitanță (nyugta) kiállítás. A chitanță az `oblio_szamlak` táblába
 * kerül `tipus = 'chitanta_papir'`-ral, `oblio_fiok_id = null`-lal (nincs
 * Oblio API-hívás). A sorszám szerver-oldali `next_chitanta_number()`
 * PL/pgSQL RPC-vel foglalódik (concurrency-safe).
 *
 * ──────────────────────────────────────────────────────────────────────
 *  ONLINE ÁG (A-M7.2b óta)
 * ──────────────────────────────────────────────────────────────────────
 * `ctx.isOnline === true`: a szerver-RPC szám-foglalás + `oblio_szamlak`
 * insert. Ez a tipikus flow mindkét platformon.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  OFFLINE ÁG (A-M7.2d2b — desktop-only)
 * ──────────────────────────────────────────────────────────────────────
 * `ctx.isOnline === false` + `ctx.offlineBackend` megadva:
 *   1) `claimNextWalletNumber()` — atomikus szám-kivétel a szám-tárcából
 *   2) `insertLocalChitanta()` — lokális `chitantak_local` rekord létrehozása
 *   3) `enqueueMutation()` — az outbox-ba kerül, a gép online-lal feltöltjük
 *   4) Return: `{ success: true, pending: true, chitantaId: 'local-<uuid>', ... }`
 *
 * Ha offline van, de NINCS `offlineBackend` (web, vagy desktop amiből a
 * caller explicit kihagyta) → `offlineNotSupported: true` hiba.
 *
 * Ha offline van, `offlineBackend` van, de üres a wallet → `walletEmpty: true`
 * hiba — a UI javasolja az online-ra váltást + wallet-feltöltést.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  chitantaIssueInputSchema,
  type ChitantaIssueInput,
  type ChitantaIssueResult,
} from '@kartoteka/validations'

/**
 * Minimális backend-interface a core számára — a `TauriSqliteBackend` osztály
 * duck-type alapon implementálja. A core SZÁNDÉKOSAN nem importál az
 * `@kartoteka/offline-sync`-ből, hogy a függőségi gráf egyszerű maradjon.
 *
 * A `OfflineMutation` shape a `@kartoteka/offline-sync.Mutation`-nal kompat —
 * a backend `enqueueMutation` közvetlenül elfogadja.
 */
export interface OfflineMutation {
  id: string
  table: string
  pk: string
  kind: 'insert' | 'update' | 'delete'
  payload?: Record<string, unknown>
  expectedRevision?: number
  attempts: number
  createdAt: string
}

export interface OfflineChitantaBackend {
  /**
   * Atomikusan vesz egy szabad sorszámot a wallet-ből + `used=1`-re állítja.
   * Null, ha nincs szabad szám.
   */
  claimNextWalletNumber(
    congregationId: string,
    sorozat: string | null,
    chitantaLocalId: string,
  ): Promise<{ id: number; szam: number; sorozat: string } | null>

  /** Visszadobja a sorszámot a pool-ba (`used=0`) — csak pre-outbox hibánál. */
  releaseWalletNumber(walletId: number): Promise<void>

  /** A `chitantak_local` táblába ír egy új sort (offline-kiállított chitanta). */
  insertLocalChitanta(row: LocalChitantaRow): Promise<void>

  /** Az outbox-ba tesz egy `insert oblio_szamlak` mutation-t a majdani push-hoz. */
  enqueueMutation(mutation: OfflineMutation): Promise<void>
}

export interface LocalChitantaRow {
  id: string                       // 'local-<uuid>'
  congregation_id: string
  sorozat: string
  szam: number
  szamla_datum: string             // ISO 'YYYY-MM-DD'
  klienesseg_nev: string
  klienesseg_cui: string | null
  klienesseg_cim: string | null
  osszeg_brut: number
  reprezentand: string | null
  befizetes_id: string | null
  megjegyzes: string | null
  issued_by: string                // user uuid
  collected_at: string             // ISO timestamp
}

export interface IssueChitantaCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A kiállító user UUID-ja — `issued_by` mezőbe megy. */
  userId: string
  /**
   * Opcionális default-sorozat (ha az input-ban nincs megadva). A web-oldal
   * ezt a `oblio_fiokok.chitanta_sorozat_default`-ból tölti; desktop-on
   * ugyanúgy érhető el lokális cache-ből vagy explicit user-választással.
   */
  defaultSorozat?: string | null
  /**
   * Hálózati állapot a hívás idején. Ha `false` és `offlineBackend` is
   * jelen → offline-ág; ha `false` de nincs `offlineBackend` →
   * `offlineNotSupported` hiba.
   *
   * Ha nincs megadva, `true`-nak veszi (backward-kompat — az A-M7.2b
   * óta minden hívó online-módban hívta).
   */
  isOnline?: boolean
  /** Desktop-oldali offline-tárház (TauriSqliteBackend). Web-en undefined. */
  offlineBackend?: OfflineChitantaBackend
}

export type IssueChitantaResult =
  | {
      success: true
      chitantaId: string
      sorozat: string
      szam: number
      /** `true`, ha offline-módban állt ki — az outbox várja a push-t. */
      pending?: boolean
    }
  | {
      success: false
      error: string
      /** Ha true, ez egy offline-specifikus hiba — a UI felajánlja az online-váltást. */
      offlineNotSupported?: boolean
      /** Ha true, szám-ütközés volt (ugyanaz a sorozat+szám már létezik). */
      duplicateNumber?: boolean
      /** Ha true, a wallet üres — a UI javasolja a feltöltést vagy online-váltást. */
      walletEmpty?: boolean
    }

export async function issueChitantaUseCase(
  input: ChitantaIssueInput,
  ctx: IssueChitantaCtx,
): Promise<IssueChitantaResult> {
  // 1) Zod-validálás (mindkét ágban szükséges)
  const parsed = chitantaIssueInputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      success: false,
      error: issue?.message || 'Érvénytelen chitanță adat.',
    }
  }
  const clean = parsed.data

  // 2) Sorozat eldöntése (input vagy default vagy 'CHIT' fallback)
  const sorozat = (clean.sorozat || ctx.defaultSorozat || 'CHIT').trim()
  if (!sorozat) {
    return { success: false, error: 'Nincs megadott sorozat.' }
  }

  const isOnline = ctx.isOnline !== false // default: true

  // ──────────────────────────────────────────────────────────────────────
  //  OFFLINE ÁG
  // ──────────────────────────────────────────────────────────────────────
  if (!isOnline) {
    if (!ctx.offlineBackend) {
      return {
        success: false,
        error:
          'A chitanță-kiállításhoz internetes kapcsolat szükséges (a sorszámot a szerver osztja ki). Csatlakozz online, és próbáld újra.',
        offlineNotSupported: true,
      }
    }
    if (clean.szam) {
      return {
        success: false,
        error:
          'Offline módban nem adhatsz meg kézzel sorszámot — a szám-tárcából kerül ki a következő szabad szám.',
      }
    }
    return issueOfflineBranch(clean, sorozat, ctx, ctx.offlineBackend)
  }

  // ──────────────────────────────────────────────────────────────────────
  //  ONLINE ÁG (meglévő A-M7.2b logika)
  // ──────────────────────────────────────────────────────────────────────
  let szam: number | undefined = clean.szam
  if (!szam) {
    try {
      const { data, error } = await ctx.supabase.rpc('next_chitanta_number', {
        p_congregation_id: clean.congregationId,
        p_sorozat: sorozat,
      })
      if (error) {
        // Ha a hálózat nem elérhető, vagy az RPC nem válaszol — offline-gyanú
        if (/fetch|network|connect|timeout/i.test(error.message)) {
          return {
            success: false,
            error:
              'A chitanță-kiállításhoz internetes kapcsolat szükséges (a sorszámot a szerver osztja ki). Csatlakozz online, és próbáld újra.',
            offlineNotSupported: true,
          }
        }
        return {
          success: false,
          error: `Szám-lefoglalási hiba: ${error.message}`,
        }
      }
      szam = Number(data)
      if (!Number.isFinite(szam) || szam <= 0) {
        return {
          success: false,
          error: 'A szerver érvénytelen sorszámot adott.',
        }
      }
    } catch {
      // Hálózati exception (pl. CORS/DNS) — offline-gyanús, a UI a
      // offlineNotSupported flag alapján felajánlja az online-váltást.
      return {
        success: false,
        error:
          'Offline állapotban nem tudunk chitantát kiállítani (a sorszám-foglalás online-ban lehetséges). Csatlakozz a hálózatra, és próbáld újra.',
        offlineNotSupported: true,
      }
    }
  }

  // 4) Insert az `oblio_szamlak`-ba
  try {
    const { data: inserted, error: insErr } = await ctx.supabase
      .from('oblio_szamlak')
      .insert({
        congregation_id: clean.congregationId,
        oblio_fiok_id: null, // chitanță NEM Oblio
        tipus: 'chitanta_papir',
        sorozat,
        szam,
        szamla_datum: clean.szamlaDatum,
        klienesseg_nev: clean.klienesseg_nev,
        klienesseg_cui: clean.klienesseg_cui || null,
        klienesseg_cim: clean.klienesseg_cim || null,
        osszeg_net: clean.osszeg_brut, // chitanță-nál nincs külön TVA
        osszeg_tva: 0,
        osszeg_brut: clean.osszeg_brut,
        e_factura_status: 'not_applicable',
        reprezentand: clean.reprezentand || null,
        befizetes_id: clean.befizetes_id ?? null,
        megjegyzes: clean.megjegyzes || null,
        issued_by: ctx.userId,
        collected_at: new Date(clean.szamlaDatum).toISOString(),
      })
      .select('id, sorozat, szam')
      .maybeSingle()

    if (insErr) {
      // Unique constraint-sérülés — a szám már létezik (párhuzamos kiállítás)
      if (insErr.code === '23505') {
        return {
          success: false,
          error: `A ${sorozat} sorozat ${szam} száma már létezik. Ellenőrizd a tömböt, vagy próbáld újra (másik sorszámmal).`,
          duplicateNumber: true,
        }
      }
      return { success: false, error: `Mentés sikertelen: ${insErr.message}` }
    }

    if (!inserted || !inserted.id) {
      return { success: false, error: 'A chitanță mentése után nem kaptunk ID-t.' }
    }

    const result: ChitantaIssueResult = {
      chitantaId: inserted.id as string,
      sorozat: (inserted.sorozat as string) ?? sorozat,
      szam: Number(inserted.szam ?? szam),
    }

    return { success: true, ...result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Kiállítási hiba: ${msg}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  OFFLINE ÁG helper — A-M7.2d2b
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generál egy kliens-oldali ID-t a lokális chitanțának. `local-` prefix
 * jelzi hogy nem szerver-UUID; a köv. 16 hex-karakter random, ami a
 * `crypto.getRandomValues` vagy `Math.random` fallback-ból jön.
 */
function generateLocalChitantaId(): string {
  // `crypto.randomUUID()` általában elérhető (Node 16+, modern browserek, Tauri)
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) {
    return `local-${cryptoObj.randomUUID()}`
  }
  // Fallback — nem kriptográfiailag biztonságos, csak egyediség szempontból
  const rand = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `local-${rand}-${Date.now().toString(16)}`
}

async function issueOfflineBranch(
  clean: ChitantaIssueInput,
  sorozat: string,
  ctx: IssueChitantaCtx,
  backend: OfflineChitantaBackend,
): Promise<IssueChitantaResult> {
  const chitantaLocalId = generateLocalChitantaId()

  // 1) Atomikus szám-kivétel a wallet-ből
  const claim = await backend.claimNextWalletNumber(
    clean.congregationId,
    sorozat,
    chitantaLocalId,
  )
  if (!claim) {
    return {
      success: false,
      error:
        'Üres az offline szám-tárca. Csatlakozz a hálózatra, és tölts fel legalább egy sorszámot (Offline szám-tárca panel → +10 szám).',
      walletEmpty: true,
    }
  }

  const nowIso = new Date().toISOString()
  const collectedAtIso = new Date(clean.szamlaDatum).toISOString()

  // 2) Lokális chitanță-sor beszúrása
  try {
    await backend.insertLocalChitanta({
      id: chitantaLocalId,
      congregation_id: clean.congregationId,
      sorozat: claim.sorozat,
      szam: claim.szam,
      szamla_datum: clean.szamlaDatum,
      klienesseg_nev: clean.klienesseg_nev,
      klienesseg_cui: clean.klienesseg_cui || null,
      klienesseg_cim: clean.klienesseg_cim || null,
      osszeg_brut: clean.osszeg_brut,
      reprezentand: clean.reprezentand || null,
      // A `befizetes_id` a server-oldalon integer; offline-ban string-ként tároljuk
      // (UUID-helyettesítőként), a push előtt parse-oljuk vissza.
      befizetes_id:
        clean.befizetes_id === null || clean.befizetes_id === undefined
          ? null
          : String(clean.befizetes_id),
      megjegyzes: clean.megjegyzes || null,
      issued_by: ctx.userId,
      collected_at: collectedAtIso,
    })
  } catch (err) {
    // Ha az insert elbukott — adjuk vissza a wallet-számot, hogy ne vesszen el
    await backend.releaseWalletNumber(claim.id).catch(() => {
      /* csendes — a release hiba másodlagos */
    })
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Lokális mentés hiba: ${msg}`,
    }
  }

  // 3) Outbox mutation — a push-sync később felküldi az `oblio_szamlak`-ba
  try {
    await backend.enqueueMutation({
      id: chitantaLocalId, // a mutation_id megegyezik a local chitanta ID-val (unique)
      table: 'oblio_szamlak',
      pk: chitantaLocalId,
      kind: 'insert',
      payload: {
        // A pusher ebből összerakja a server-oldali insertet; a szerver a saját
        // UUID-ját adja majd, amit a sikeres push után a `chitantak_local.server_id`-ra
        // írunk (A-M7.2d2c outbox-push logika).
        congregation_id: clean.congregationId,
        oblio_fiok_id: null,
        tipus: 'chitanta_papir',
        sorozat: claim.sorozat,
        szam: claim.szam,
        szamla_datum: clean.szamlaDatum,
        klienesseg_nev: clean.klienesseg_nev,
        klienesseg_cui: clean.klienesseg_cui || null,
        klienesseg_cim: clean.klienesseg_cim || null,
        osszeg_net: clean.osszeg_brut,
        osszeg_tva: 0,
        osszeg_brut: clean.osszeg_brut,
        e_factura_status: 'not_applicable',
        reprezentand: clean.reprezentand || null,
        befizetes_id: clean.befizetes_id ?? null,
        megjegyzes: clean.megjegyzes || null,
        issued_by: ctx.userId,
        collected_at: collectedAtIso,
      },
      attempts: 0,
      createdAt: nowIso,
    })
  } catch (err) {
    // A lokális sor megmarad, a wallet-szám foglalt — a user a "Sync most"
    // gombbal újra-enqueue-olhatja. Nem hozunk vissza `walletEmpty`-t, mert
    // nem a wallet a hibás.
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Offline outbox-mentés hiba: ${msg}. A chitanță lokálisan elmentve, de a szinkronizációs sor frissítése sikertelen.`,
    }
  }

  return {
    success: true,
    chitantaId: chitantaLocalId,
    sorozat: claim.sorozat,
    szam: claim.szam,
    pending: true,
  }
}
