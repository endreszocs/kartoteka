'use client'

/**
 * ÉLŐ FRISSÍTÉS AZ `ertesitesek` TÁBLÁRÓL (2026-09-05, H4).
 *
 * A régi csengő CSAK `INSERT`-re figyelt: ha a lelkész a /notifications
 * oldalon olvasottnak jelölt vagy archivált (vagy a mentés-riasztó „megoldva"-ra
 * állított egy sort), a jelvény a következő teljes újratöltésig a régi számot
 * mutatta. Mostantól `event: '*'` (INSERT + UPDATE + DELETE), a saját sorokra
 * szűrve; a hívó egy újraolvasást kap — az adat MINDIG a szerver-akcióból jön,
 * a realtime csak jelez.
 *
 * ⚠️ 300 ms-os összevonás: egy „összes olvasottnak" 40 UPDATE-eseményt is
 *    küldhet — 40 újraolvasás helyett egy.
 * ⚠️ Ha az `ertesitesek` nincs a `supabase_realtime` publikációban, a csatorna
 *    csendben nem tüzel — ezért a felületek a saját műveleteik után SAJÁT
 *    újraolvasást is végeznek; a realtime csak a MÁSIK fül/eszköz változását
 *    hozza át.
 *
 * ⛔ EGYEDI TOPIC MINDEN ELŐFIZETÉSNEK (2026-09-05, bírálói P1).
 *    A böngésző-kliens SINGLETON (`@supabase/ssr` createBrowserClient →
 *    `cachedBrowserClient`), és a realtime-js `RealtimeClient.channel()` AZONOS
 *    topic-ra a MÁR LÉTEZŐ csatornát adja vissza. Ezt a hookot két helyen
 *    hívják ugyanazzal a userId-val: a csengő (a headerben, mindig él) és a
 *    /notifications nézet. Egy közös `ertesitesek-<userId>` topic-kal a nézet
 *    leszerelése (`removeChannel` → `unsubscribe` → `socket._remove`) a
 *    CSENGŐ csatornáját is bezárta: a jelvény a következő teljes újratöltésig
 *    állt, hibajelzés nélkül. Ezért minden előfizetés SAJÁT, sorszámozott
 *    topic-ot kap — két független csatorna ugyanarra a `postgres_changes`
 *    szűrőre, és a `removeChannel` csak a sajátját zárja. (A sorszám modul-
 *    szintű: a React StrictMode kettős effektje is két külön csatornát kap,
 *    és mindkettő a sajátját takarítja.)
 */

import { useEffect, useRef } from 'react'

import { createClient } from '@/lib/supabase/client'

const OSSZEVONAS_MS = 300

/** Előfizetés-sorszám — a topic egyediségéhez (lásd a fejléc ⛔ pontját). */
let elofizetesSorszam = 0

export function useErtesitesRealtime(userId: string | null | undefined, onValtozas: () => void) {
  // A legfrissebb callback egy ref-ben, hogy a csatorna ne iratkozzon át minden renderen.
  const callbackRef = useRef(onValtozas)
  useEffect(() => {
    callbackRef.current = onValtozas
  }, [onValtozas])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    let idozito: ReturnType<typeof setTimeout> | null = null
    const jelez = () => {
      if (idozito) clearTimeout(idozito)
      idozito = setTimeout(() => {
        idozito = null
        callbackRef.current()
      }, OSSZEVONAS_MS)
    }

    // ⚠️ A sorszám NEM hagyható el: azonos topic = KÖZÖS csatorna a singleton
    //    kliensen, és a másik felület leszerelése ezt is megölné.
    const sorszam = ++elofizetesSorszam
    const csatorna = supabase
      .channel(`ertesitesek-${userId}-${sorszam}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ertesitesek', filter: `user_id=eq.${userId}` },
        jelez,
      )
      .subscribe()

    return () => {
      if (idozito) clearTimeout(idozito)
      supabase.removeChannel(csatorna)
    }
  }, [userId])
}
