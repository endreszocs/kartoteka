/**
 * DesktopAdomanyozokTab — a közös `AdomanyozokBody` desktop-bekötése
 * (Endre 5. kérése, 2026-08-27).
 *
 * A MEGJELENÍTÉS és az ÖSSZESÍTÉS közös a webbel (`@kartoteka/ui-app` +
 * `@kartoteka/core`), így ugyanarra az évre nem adhat két különböző végösszeget.
 * Itt csak az adatbetöltés él, a desktop Supabase-kliensével.
 *
 * MIÉRT ONLINE-ONLY: a fül több év adományait olvassa, ami a lokális
 * (SQLCipher) tükörben nincs meg. A `desktop-rental-tab.tsx` mintája szerint
 * offline HANGOSAN jelezzük, hogy online kapcsolat kell — üres listát mutatni
 * itt kifejezetten káros lenne: azt üzenné, hogy senki nem adományozott.
 *
 * CSV-mentés SZÁNDÉKOSAN nincs átadva: a böngészős `<a download>` út a Tauri
 * webview-ban nem megbízható, a natív fájlmentés pedig külön kör. Az
 * `onCsvExport` prop opcionális, ezért a gomb egyszerűen nem jelenik meg —
 * nem egy néma, nem működő gomb marad ott.
 */

import { useCallback, useEffect, useState } from 'react'
import { AdomanyozokBody } from '@kartoteka/ui-app'
import type { AdomanyozokOsszesito } from '@kartoteka/core'
import { adomanyozokOnline, adomanyEvekOnline } from '../lib/finance-entry-lookups'

interface Props {
  congregationId: string
  currentYear: number
}

export function DesktopAdomanyozokTab({ congregationId, currentYear }: Props) {
  const [evek, setEvek] = useState<number[]>([currentYear])
  const [evTol, setEvTol] = useState(currentYear)
  const [evIg, setEvIg] = useState(currentYear)
  const [osszesito, setOsszesito] = useState<AdomanyozokOsszesito | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [betoltes, setBetoltes] = useState(true)

  useEffect(() => {
    let el = true
    void (async () => {
      const lista = await adomanyEvekOnline(congregationId)
      if (!el || !lista.length) return
      setEvek(lista.includes(currentYear) ? lista : [currentYear, ...lista])
    })()
    return () => { el = false }
  }, [congregationId, currentYear])

  useEffect(() => {
    let el = true
    setBetoltes(true)
    void (async () => {
      const res = await adomanyozokOnline(congregationId, evTol, evIg)
      if (!el) return
      if ('error' in res) { setError(res.error); setOsszesito(null) }
      else { setError(null); setOsszesito(res.osszesito) }
      setBetoltes(false)
    })()
    return () => { el = false }
  }, [congregationId, evTol, evIg])

  const onEvValtas = useCallback((tol: number, ig: number) => {
    setEvTol(Math.min(tol, ig))
    setEvIg(Math.max(tol, ig))
  }, [])

  return (
    <AdomanyozokBody
      osszesito={osszesito}
      error={error}
      betoltes={betoltes}
      valaszthatoEvek={evek}
      evTol={evTol}
      evIg={evIg}
      onEvValtas={onEvValtas}
    />
  )
}
