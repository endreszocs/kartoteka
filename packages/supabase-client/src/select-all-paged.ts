/**
 * selectAllPaged — a TELJES eredményhalmaz letöltése `.range()`-lapokban.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-08-11 (5. kör, P3 #15) — MIÉRT EGY KÖZÖS HELPER
 *
 * A PostgREST/Supabase „Max Rows" beállítása (jelenleg 1000) NÉMÁN levágja a
 * nagy lekérdezéseket: nincs hibaüzenet, nincs jelzés, csak kevesebb sor. Egy
 * 1400 fős gyülekezet „1000 fő"-t jelent, a nyugtaszám-generátor MAX-a a 1000.
 * sornál megáll és ÚJRA KIAD egy már használt nyugtaszámot, az éves jelentés
 * pénzügyi összesítője pedig hiánytalannak látszó, de hibás számot nyomtat.
 *
 * A lapozás magát ugyanez a plafon teszi trükkössé: a `page.length < PAGE_SIZE`
 * stop-feltétel HIBÁS. Ha valaki a Supabase-projekt „Max Rows" értékét 1000 alá
 * viszi (pl. 500-ra, teljesítmény miatt), akkor a kért 1000-es lapra a szerver
 * 500 sort ad — a rövid lap ilyenkor NEM a halmaz vége, a ciklus mégis kilép.
 * Az eredmény ugyanaz a néma féladat, csak most már MINDEN listán egyszerre.
 * ⇒ CSAK AZ ÜRES LAP A BIZTOS STOP, és a lépésköz a TÉNYLEGESEN kapott sorszám.
 *
 * A repóban öt párhuzamos implementáció élt ebből (desktop `sync.ts`, web
 * `penzugy/actions.ts`, `tagnyilvantartas/actions.ts`,
 * `eves-jelentes/prezentacio/actions.ts`, `packages/core/.../list.ts`), plusz
 * 15 kézzel írt ciklus a TILTOTT stop-feltétellel. Ez a fájl az egyetlen
 * igazság-forrás; a `@kartoteka/supabase-client` azért a gazdája, mert ez a
 * legkönnyebb csomag, amit a web és a desktop EGYARÁNT függőségként listáz.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIÉRT KÖTELEZŐ A RENDEZÉS
 *
 * Minden lap külön HTTP-kérés, tehát külön DB-snapshot. `ORDER BY` nélkül a
 * Postgres nem garantálja a lapok közti stabil sorrendet (más terv, párhuzamos
 * seq scan, időközbeni UPDATE) — ugyanaz a sor két lapon is megjelenhet, más
 * sor pedig teljesen kimaradhat. Ezért a helper MAGA fűzi hozzá a rendezést
 * (alapértelmezés: `id` növekvő). Ha a hívó már rendezett (pl. `datum` szerint),
 * az `id` másodlagos kulcsként kerül mögé — pontosan a kívánt döntetlen-bontás.
 *
 * DEDUP: lapok KÖZBEN történő beszúrás/törlés eltolhatja az offseteket, így egy
 * sor két lapra is eshet. A kulcs (alapértelmezés: `id`) szerinti dedup ezt
 * kiegyenlíti — a `TRUNCATE + INSERT` fogyasztók így nem buknak UNIQUE-sértésen,
 * és az összegzők nem számolnak duplán. Ha a `select()` nem hozza le a kulcs-
 * oszlopot, a dedup egyszerűen kimarad (a sorrend akkor is megmarad).
 */

/** A `selectAllPaged` viselkedését hangoló opciók. */
export interface SelectAllPagedOptions {
  /** Lapméret. Felfelé 1000-re vágva — ennél többet a szerver úgysem ad. Alap: 1000. */
  pageSize?: number
  /**
   * A helper által hozzáfűzött (növekvő) rendező oszlop. `null` = a hívó MÁR
   * gondoskodott determinisztikus rendezésről. Alap: `'id'`.
   */
  orderColumn?: string | null
  /**
   * A dedup kulcs-oszlopa. `null` = nincs dedup. Alap: az `orderColumn` értéke.
   */
  dedupeBy?: string | null
  /**
   * Biztonsági szelep: ennyi sor fölött a helper HIBÁVAL áll meg (nem némán
   * csonkol). Alap: nincs korlát.
   */
  maxRows?: number
}

export interface SelectAllPagedResult<T> {
  /** A begyűjtött sorok. Hiba esetén az addig letöltött (RÉSZLEGES) halmaz. */
  data: T[]
  error: { message: string } | null
  /**
   * `true`, ha a `maxRows` szelep állította meg a letöltést (nem lekérdezési
   * hiba). Ilyenkor az `error` is ki van töltve — a hívó dönthet: ha a csonkolás
   * a felületén ELFOGADHATÓ és jelezhető („…és még több"), nézze a `truncated`
   * jelzőt; ha nem, ejtse a hibát. A hallgatás egyik esetben sem opció.
   */
  truncated: boolean
}

const MAX_SERVER_PAGE_SIZE = 1000

export async function selectAllPaged<
  // A lekérdezés sor-típusa a hívónál dől el; a builder típusa itt nem kifejezhető.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T = any,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  opts: SelectAllPagedOptions = {},
): Promise<SelectAllPagedResult<T>> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? MAX_SERVER_PAGE_SIZE, MAX_SERVER_PAGE_SIZE))
  const orderColumn = opts.orderColumn === undefined ? 'id' : opts.orderColumn
  const dedupeBy = opts.dedupeBy === undefined ? orderColumn : opts.dedupeBy
  const maxRows = opts.maxRows

  const ordered = orderColumn ? query.order(orderColumn, { ascending: true }) : query

  const byKey = dedupeBy ? new Map<unknown, T>() : null
  const plain: T[] = []
  const collected = () => (byKey ? [...byKey.values(), ...plain] : plain)
  const collectedCount = () => (byKey ? byKey.size : 0) + plain.length

  for (let from = 0; ; ) {
    const { data, error } = await ordered.range(from, from + pageSize - 1)
    if (error) return { data: collected(), error, truncated: false }

    const page = (data ?? []) as T[]
    for (const row of page) {
      const key = byKey && dedupeBy ? (row as Record<string, unknown>)[dedupeBy] : undefined
      if (byKey && key !== undefined) byKey.set(key, row)
      else plain.push(row)
    }

    // CSAK az ÜRES lap a biztos stop — a rövid lap még NEM a halmaz vége
    // (leszállított szerver-plafonnál a kért 1000 helyett is jöhet 500).
    if (page.length === 0) break
    from += page.length

    // Biztonsági szelep: HANGOS jelzés, nem néma csonkolás.
    if (maxRows !== undefined && collectedCount() >= maxRows) {
      return {
        data: collected(),
        error: {
          message:
            `A lekérdezés több mint ${maxRows} sort adott vissza — a betöltést biztonságból ` +
            'megszakítottuk, mert a részleges lista félrevezető lenne. Szűkítsd a szűrőket ' +
            '(pl. rövidebb időszak), vagy jelezd a rendszergazdának.',
        },
        truncated: true,
      }
    }
  }

  return { data: collected(), error: null, truncated: false }
}
