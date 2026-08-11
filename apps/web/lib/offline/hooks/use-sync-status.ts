'use client'

/**
 * useSyncStatus — A SZINKRON-ÁLLAPOT EGYETLEN FORRÁSA (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * A szinkron állapotát korábban ÖT felület mutatta, és MIND AZ ÖT saját
 * `useState(syncing)`-et vezetett ugyanazokra az eseményekre:
 *   1. a képernyő tetején lebegő pirula (`sync-status-bar`),
 *   2. az avatár-menü „Offline mentés" sorának jelvénye,
 *   3. az /offline oldal „Kapcsolat" KPI-kártyája,
 *   4. a cache-áttekintő,
 *   5. a mutációs sor panelje.
 * Ez a „a második felület a régi implementációt őrzi" hibaosztály előszobája:
 * öt másolat előbb-utóbb ötfélét mond. Mostantól MIND EBBŐL olvas.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT JAVÍT AZ ESEMÉNY-KEZELÉSBEN
 * ════════════════════════════════════════════════════════════════════════════
 * · A `pull_completed` NEM törli a hibát, ha a kör HIBÁKKAL ért véget. Korábban
 *   a `completed` ág `setLastError(null)`-t hívott, ezért a magyar hibaüzenetek
 *   egyetlen render-ciklust sem éltek meg.
 * · A letöltés és a feltöltés KÜLÖN állapot. Korábban egyetlen `syncing`
 *   boolean fedte mindkettőt, és a 30 másodpercenkénti push `push_completed`-je
 *   rendszeresen lekapcsolta a jelzőt egy még FUTÓ letöltés közben.
 * · A várakozó munka MINDEN állapotát számoljuk: `pending`, `failed`, valamint
 *   a két veszélyes, eddig LÁTHATATLAN kategória — a feltöltés közben beragadt
 *   (`syncing`) és a véglegesen fentragadt (`dead`) mutációk.
 * · Feliratkozunk a `restore_detected` eseményre. Erre eddig SENKI nem
 *   iratkozott fel az egész kódbázisban, pedig ez a legfontosabb üzenet:
 *   a rendszergazda visszaállított egy korábbi mentést, és a lelkész el nem
 *   küldött módosításai karanténba kerültek.
 * · ⚠️ 2026-08-11 — NEM MUTATUNK ZÖLDET OTT, AHOL EL SEM INDULT A SZINKRON.
 *   A `SyncProvider` `if (!congregationId) return`-nel kilép, tehát rendszergazdai
 *   (system), egyházkerületi (district) és egyházmegyei (diocese) profilban az
 *   orchestrator SOHA nem indul el (`effectiveCongregationId === null`). A
 *   kulcsválasztás korábban csak az online/várakozó/hiba hármast nézte, ezért
 *   ilyenkor ÁLLANDÓ zöld pipa állt a fejlécben, a panel pedig kimondta, hogy „a
 *   legutóbbi letöltés hibátlan volt" — noha egyetlen letöltés sem futott le. A
 *   „Szinkronizálás most" gomb is némán semmit sem csinált. Mostantól a hook az
 *   orchestrator VALÓS állapotát kérdezi (`isActive()` + `getCongregationId()`),
 *   és külön `nincs_szinkron` kulcsot ad. A törölt `sync-status-bar` ezt még
 *   helyesen kezelte (nyugalomban egyszerűen eltűnt) — ne essünk vissza mögé.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'

import { getDb, type MutationEnvelope } from '../db'
import { useOnlineStatus } from './use-online-status'
import { getSyncOrchestrator, type SyncEvent } from '../sync-orchestrator'

/** A várakozó helyi munka állapot szerinti bontása. */
export interface SorBontas {
  /** Feltöltésre vár. */
  pending: number
  /** Hibázott, újrapróbálás alatt (exponenciális visszalépéssel). */
  failed: number
  /** Feltöltés közben beragadt — a következő indításkor visszaáll. */
  syncing: number
  /** Öt sikertelen próbálkozás után VÉGLEG fentragadt. Emberi beavatkozás kell. */
  dead: number
  /** Ütközés a szerverrel — feloldásra vár. */
  conflict: number
  /** Amit a felület „várakozó"-ként számol: MINDEN, ami nem ment fel. */
  osszesVarakozo: number
}

export type SyncAllapotKulcs =
  | 'offline'
  | 'visszaallitas'
  | 'konfliktus'
  | 'hiba'
  | 'fentragadt'
  | 'folyamatban'
  | 'varakozo'
  /** Ezen a profilon EL SEM INDULT a szinkron (nincs gyülekezet-kontextus). */
  | 'nincs_szinkron'
  | 'rendben'

export interface SyncAllapot {
  /** Kliens-oldali mount megtörtént-e (SSR-biztonság). */
  mounted: boolean
  online: boolean
  /** Fut-e ÉPPEN letöltés. */
  pullFut: boolean
  /** Fut-e ÉPPEN feltöltés. */
  pushFut: boolean
  /** Bármelyik irány fut. */
  fut: boolean
  /**
   * FUT-E EGYÁLTALÁN SZINKRON EZEN A PROFILON.
   *
   * `false`, ha az orchestrator el sem indult (nincs gyülekezet-kontextus:
   * rendszergazdai / kerületi / egyházmegyei profil). Ilyenkor a „Szinkronizálás
   * most" gomb sem csinálna semmit, tehát tiltva van.
   */
  szinkronAktiv: boolean
  bontas: SorBontas
  /** Az utolsó VALÓDI hibaüzenet (magyarul, ahogy a lánc megfogalmazta). */
  utolsoHiba: string | null
  /** A visszaállítás-üzenet, ha a rendszergazda visszaállított egy mentést. */
  visszaallitasUzenet: string | null
  /** A legsúlyosabb állapot kulcsa — a jelző ebből választ ikont/színt. */
  kulcs: SyncAllapotKulcs
  /** Kézi szinkron indítása. */
  szinkronizaljMost: () => Promise<void>
  /** A visszaállítás-üzenet nyugtázása (a lelkész elolvasta). */
  visszaallitasNyugtaz: () => void
}

const URES_BONTAS: SorBontas = {
  pending: 0,
  failed: 0,
  syncing: 0,
  dead: 0,
  conflict: 0,
  osszesVarakozo: 0,
}

export function useSyncStatus(): SyncAllapot {
  // SSR-biztonság: a Dexie-lekérdezés és a `navigator.onLine` csak kliensen él.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let megszakitva = false
    queueMicrotask(() => {
      if (!megszakitva) setMounted(true)
    })
    return () => {
      megszakitva = true
    }
  }, [])

  const online = useOnlineStatus()
  const [pullFut, setPullFut] = useState(false)
  const [pushFut, setPushFut] = useState(false)
  const [utolsoHiba, setUtolsoHiba] = useState<string | null>(null)
  const [visszaallitasUzenet, setVisszaallitasUzenet] = useState<string | null>(null)
  /**
   * ⚠️ SZÁNDÉKOSAN `true` a kezdőérték, és az első ellenőrzés csak az első
   * intervallum UTÁN fut (a `setInterval` nem sül el azonnal). Így nem villan fel
   * egy hamis „nem szinkronizál" a `SyncProvider` `start()`-ja előtt: a provider
   * és a fejléc külön komponens, a mount-sorrendjük nem garantált.
   */
  const [szinkronAktiv, setSzinkronAktiv] = useState(true)

  // A mutációs sor TELJES tartalma — a bontást ebből számoljuk. A sor kicsi
  // (feltöltésre váró helyi módosítások), ezért olcsóbb egyben olvasni, mint öt
  // külön count-lekérdezéssel.
  const sorok = useLiveQuery(async (): Promise<MutationEnvelope[]> => {
    if (typeof window === 'undefined') return []
    return await getDb()._mutation_queue.toArray()
  }, []) as MutationEnvelope[] | undefined

  const konfliktusok = useLiveQuery(async (): Promise<number> => {
    if (typeof window === 'undefined') return 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (getDb()._conflicts as any).where('resolved').equals(0).count()
  }, []) as number | undefined

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    const orchestrator = getSyncOrchestrator()

    // A VALÓS állapot, nem esemény-visszhang: ha a komponens egy már futó kör
    // KÖZBEN mountol, ne mutasson hamisan „kész"-t.
    // `queueMicrotask`: a setState nem futhat szinkron az effect törzsében
    // (react-hooks/set-state-in-effect → kaszkádoló újrarender). Ugyanaz a
    // minta, amit a `use-online-status` is használ.
    let megszakitva = false
    queueMicrotask(() => {
      if (!megszakitva) setPullFut(orchestrator.isSyncing())
    })

    /** ELINDULT-E EGYÁLTALÁN a szinkron ezen a profilon. */
    const ellenorizAktiv = () => {
      if (megszakitva) return
      setSzinkronAktiv(orchestrator.isActive() && orchestrator.getCongregationId() !== null)
    }
    // Az orchestrator nem ad „elindultam" eseményt, a `start()` pedig aszinkron
    // (wipe + karantén-ellenőrzés fut előtte). Ezért mintavételezünk — az első
    // minta az intervallum letelte után jön, ez a türelmi idő.
    const aktivIdozito = window.setInterval(ellenorizAktiv, AKTIV_ELLENORZES_MS)

    const unsubscribe = orchestrator.subscribe((event: SyncEvent) => {
      // Bármely szinkron-esemény bizonyíték arra, hogy a lánc él.
      ellenorizAktiv()
      switch (event.type) {
        case 'pull_started':
          setPullFut(true)
          break
        case 'push_started':
          setPushFut(true)
          break
        case 'pull_completed':
          setPullFut(false)
          // ⚠️ CSAK akkor töröljük a hibát, ha a kör TÉNYLEG hibátlan volt.
          if (event.errors && event.errors.length > 0) {
            setUtolsoHiba(event.errors[0].error)
          } else {
            setUtolsoHiba(null)
          }
          break
        case 'push_completed':
          setPushFut(false)
          break
        case 'pull_error':
          setPullFut(false)
          setUtolsoHiba(event.error || 'Ismeretlen hiba a letöltés közben.')
          break
        case 'push_error':
          setPushFut(false)
          setUtolsoHiba(event.error || 'Ismeretlen hiba a feltöltés közben.')
          break
        case 'restore_detected':
          setVisszaallitasUzenet(
            event.error ||
              'A rendszergazda visszaállította a gyülekezet adatait egy korábbi mentésből.',
          )
          break
      }
    })
    return () => {
      megszakitva = true
      window.clearInterval(aktivIdozito)
      unsubscribe()
    }
  }, [mounted])

  const szinkronizaljMost = useCallback(async () => {
    if (typeof window === 'undefined') return
    const orchestrator = getSyncOrchestrator()
    // Ha nincs gyülekezet-kontextus, a `syncNow()` NÉMÁN visszatér (a `pullAll`
    // és a `pushAll` is `!congregationId`-n kilép, esemény sem megy). A hívó
    // felület ilyenkor tiltva van, de a hook se tegyen úgy, mintha csinálna valamit.
    if (!orchestrator.isActive() || orchestrator.getCongregationId() === null) return
    await orchestrator.syncNow()
  }, [])

  const visszaallitasNyugtaz = useCallback(() => setVisszaallitasUzenet(null), [])

  const bontas: SorBontas = mounted && sorok ? bontasbolSzamol(sorok, konfliktusok || 0) : URES_BONTAS

  const fut = pullFut || pushFut
  const kulcs = valasztKulcs({
    mounted,
    online,
    fut,
    szinkronAktiv,
    bontas,
    utolsoHiba,
    visszaallitasUzenet,
  })

  return {
    mounted,
    online,
    pullFut,
    pushFut,
    fut,
    szinkronAktiv,
    bontas,
    utolsoHiba,
    visszaallitasUzenet,
    kulcs,
    szinkronizaljMost,
    visszaallitasNyugtaz,
  }
}

function bontasbolSzamol(sorok: MutationEnvelope[], konfliktusok: number): SorBontas {
  const b: SorBontas = { ...URES_BONTAS, conflict: konfliktusok }
  for (const m of sorok) {
    if (m.status === 'pending') b.pending += 1
    else if (m.status === 'failed') b.failed += 1
    else if (m.status === 'syncing') b.syncing += 1
    else if (m.status === 'dead') b.dead += 1
  }
  // MINDEN, ami nem ment fel. A korábbi számláló csak `pending + failed` volt —
  // épp a két veszélyes állapot (beragadt / véglegesen fentragadt) hiányzott.
  b.osszesVarakozo = b.pending + b.failed + b.syncing + b.dead
  return b
}

/** Milyen sűrűn nézzük meg, hogy fut-e egyáltalán a szinkron. */
const AKTIV_ELLENORZES_MS = 2_000

/** A legsúlyosabb állapot nyer. A sorrend SZÁNDÉKOS. */
function valasztKulcs(p: {
  mounted: boolean
  online: boolean
  fut: boolean
  szinkronAktiv: boolean
  bontas: SorBontas
  utolsoHiba: string | null
  visszaallitasUzenet: string | null
}): SyncAllapotKulcs {
  if (!p.mounted) return 'rendben'
  // A visszaállítás mindent megelőz: a lelkész aznapi munkája lehet érintve.
  if (p.visszaallitasUzenet) return 'visszaallitas'
  if (p.bontas.conflict > 0) return 'konfliktus'
  // A véglegesen fentragadt munka SÚLYOSABB, mint egy futó kör.
  if (p.bontas.dead > 0) return 'fentragadt'
  // ⚠️ EZ AZ ÁG MINDEN „szinkron-jellegű" állapot ELŐTT ÁLL. Ha az orchestrator
  //    el sem indult (nincs gyülekezet-kontextus: rendszergazdai / kerületi /
  //    egyházmegyei profil), akkor egyik alábbi mondat sem igaz rá:
  //      · „rendben"      → zöld pipa + „a legutóbbi letöltés hibátlan volt",
  //                         noha EGYETLEN letöltés sem futott,
  //      · „offline"      → „amit most beírsz, helyben mentődik" — nem mentődik,
  //      · „folyamatban"  → semmi nem fut,
  //      · „varakozo"     → „a következő körben felkerülnek" — nem lesz kör.
  //    FÖLÖTTE csak a valóban súlyos, emberi beavatkozást kívánó állapotok
  //    maradnak (visszaállítás, ütközés, véglegesen fentragadt munka), mert azok
  //    egy korábbi gyülekezeti profilból itt is érvényesek. A várakozó munka nem
  //    tűnik el: a gomb számláló-pöttye és a panel „A te módosításaid" szakasza
  //    a `bontas`-ból dolgozik, nem ebből a kulcsból.
  if (!p.szinkronAktiv) return 'nincs_szinkron'
  if (!p.online) return 'offline'
  if (p.utolsoHiba && !p.fut) return 'hiba'
  if (p.fut) return 'folyamatban'
  if (p.bontas.osszesVarakozo > 0) return 'varakozo'
  return 'rendben'
}
