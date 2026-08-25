'use server'

/**
 * SZERVEZETI TÉRKÉP — egyházmegyei szerver-akció (2026-08-25).
 *
 * Az anya→leány kapcsolatok + a kartotékán belüli egységek (leány/szórvány) +
 * a lelkész-nevek adatforrása a `gyulekezeti_hierarchia()` RPC
 * (migration-docs/sql/2026-08-25-gyulekezeti-egysegek.sql). Az RPC SECURITY
 * DEFINER és MAGA hatókör-szűr (megyei szerep → a saját megye gyülekezetei;
 * fail-closed: hatókör nélküli hívónak üres) — az app-oldali szűrés itt NEM
 * bizalmi kérdés, hanem a kontextus-metszet szabálya (lásd lentebb).
 *
 * ALAPELV-MEGFELELÉS (2026-04-17): az egyházmegyei oldal NEM kérdezhet
 * `szemely` / `befizetes` / anyakönyvi táblát. Ez az akció KIZÁRÓLAG az RPC-t
 * hívja; a `letszam_elo` a MEGYEI hívónak az RPC-ben SZÁNDÉKOSAN NULL — az
 * egyházmegye a beküldött iratokból (választók névjegyzéke) kap létszámot,
 * app-oldalon (a felület a congregationOverview választó-létszámát mutatja).
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  resolveDioceseReadScopeIds,
} from '@/lib/auth/level-scope'
import type {
  HierarchiaSor,
  SzervezetTerkepEredmeny,
} from '@/lib/gyulekezet/egysegek-shared'

/**
 * Hiányzó RPC felismerése. PGRST202 = a PostgREST séma-gyorsítótára nem ismeri
 * a függvényt; 42883 = undefined_function; a szöveg-minta a proxy-átírt
 * változatokat fogja meg (a repó bevett hármasa — lásd egysegek-actions.ts).
 */
const HIANYZO_RPC_MINTA = /could not find|does not exist|schema cache/i

function rpcHianyzikE(error: { code?: string; message: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    HIANYZO_RPC_MINTA.test(error.message || '')
  )
}

const MIGRACIO_UZENET =
  'A szervezeti térkép adatforrása még nincs telepítve az adatbázisban. ' +
  'Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd frissítse az oldalt.'

/**
 * A megyei szervezeti térkép sorai.
 *
 * @param kontextusDioceseId A KÉPERNYŐN ÉPPEN LÁTHATÓ egyházmegye (a hívó
 *   oldal kontextusa) — a `getCongregationOverviewData` dokumentált mintája
 *   szerint. A SZABÁLY: METSZET(jogosultság, képernyő-kontextus) — soha unió,
 *   soha tágítás. Ha a képernyő egy KONKRÉT egyházmegyét mutat, a térkép is
 *   CSAK azt mutathatja — akkor is, ha a hívó rendszergazda. Az RPC hatókör-
 *   szűrése mellé ez a második, app-oldali szűkítő réteg (két réteg, amelyik
 *   közül egyik sem tágíthat a másikon túl).
 */
export async function getSzervezetTerkep(
  kontextusDioceseId?: string | null,
): Promise<SzervezetTerkepEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user) {
    return { nincsHatokor: true, error: 'Nincs bejelentkezett felhasználó.' }
  }
  // OLVASÁSI kapu — ugyanaz, ami a megyei irányítópultot őrzi (esperes /
  // megyei admin / megyei számvevő + rendszergazda/kerületi admin).
  if (!canReadDioceseScope(access)) {
    return {
      nincsHatokor: true,
      error: 'A szervezeti térkép megtekintéséhez egyházmegyei jogosultság kell.',
    }
  }

  // SZEREP-SZŰRT olvasási hatókör — az adatbázis
  // current_user_diocese_olvaso_ids() tükre, hogy a két réteg ne húzzon szét.
  const dioceseIds = resolveDioceseReadScopeIds(access)
  const rendszergazda = !!access.admin || !!access.master

  // ── A SZŰRŐ MEGHATÁROZÁSA — FAIL-CLOSED (a getCongregationOverviewData
  // mintája betűre) ─────────────────────────────────────────────────────────
  // `null` = szűretlen. Ide KIZÁRÓLAG a rendszergazda juthat, és CSAK akkor,
  // ha a képernyő SEM mutat konkrét egyházmegyét (összesített admin-nézet) —
  // az RPC ilyenkor is a saját fail-closed hatókörét adja, tehát a `null`
  // itt nem „minden", hanem „nem szűkítünk tovább az RPC eredményén".
  let szuroIds: string[] | null
  if (kontextusDioceseId) {
    szuroIds = rendszergazda
      ? [kontextusDioceseId]
      : dioceseIds.includes(kontextusDioceseId)
        ? [kontextusDioceseId]
        : []
  } else if (dioceseIds.length > 0) {
    szuroIds = dioceseIds
  } else if (rendszergazda) {
    szuroIds = null
  } else {
    szuroIds = []
  }

  // Üres hatókör → NEM üres lista, hanem kimondott „nincs hatókör" állapot.
  if (szuroIds !== null && szuroIds.length === 0) {
    return {
      nincsHatokor: true,
      error:
        'Nem sikerült egyházmegye-hatókört feloldani a fiókodhoz, ezért a szervezeti térkép nem jeleníthető meg.',
    }
  }

  const { data, error } = await access.supabase.rpc('gyulekezeti_hierarchia')

  if (error) {
    if (rpcHianyzikE(error)) {
      return { rpcHianyzik: true, error: MIGRACIO_UZENET }
    }
    // A hibát TOVÁBBADJUK (414/proxy-tanulság: a hívó sose találgasson).
    return { error: `A szervezeti térkép betöltése sikertelen: ${error.message}` }
  }

  const sorok = (Array.isArray(data) ? data : []) as HierarchiaSor[]

  // App-oldali METSZET: az RPC hatókörén belül is csak a kontextus/jogosultság
  // metszete megy tovább. `diocese_id` nélküli sort a szűrt ág eldob —
  // megye-nézetben megye nélküli gyülekezet nem lehet a hívóé (fail-closed).
  if (szuroIds === null) return { sorok }
  const engedettMegyek = szuroIds
  return {
    sorok: sorok.filter(
      (s) => s.diocese_id !== null && engedettMegyek.includes(s.diocese_id),
    ),
  }
}
