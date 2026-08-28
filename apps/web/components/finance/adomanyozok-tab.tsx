'use client'

/**
 * Adományozók és szponzorok fül — webes adatbetöltő burok (Endre 5. kérése).
 *
 * A MEGJELENÍTÉS a közös `AdomanyozokBody` (@kartoteka/ui-app), az ÖSSZESÍTÉS a
 * `@kartoteka/core` — itt csak a szerver-hívás és a CSV-mentés él, mert ez a két
 * dolog felület-specifikus (a desktop offline-kliensből, más letöltés-úton).
 */

import { useCallback, useEffect, useState } from 'react'
import { AdomanyozokBody } from '@kartoteka/ui-app'
import type { AdomanyozokOsszesito } from '@kartoteka/core'
import { getAdomanyozok, getAdomanyEvek } from '@/app/(dashboard)/penzugy/adomanyozok-actions'

interface Props {
  currentYear: number
}

/** CSV-mező idézőjelezés — a név vesszőt és idézőjelet is tartalmazhat. */
function csvMezo(v: string): string {
  const s = String(v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function AdomanyozokTab({ currentYear }: Props) {
  const [evek, setEvek] = useState<number[]>([currentYear])
  const [evTol, setEvTol] = useState(currentYear)
  const [evIg, setEvIg] = useState(currentYear)
  // A betöltött adat a SAJÁT kulcsával együtt áll — a „tölt éppen?" ebből
  // LEVEZETETT, nem külön tárolt állapot.
  //
  // MIÉRT ÍGY: egy `setBetoltes(true)` az effekt törzsében szinkron setState
  // lenne, ami kaszkádoló újrarenderelést okoz (a `react-hooks/set-state-in-effect`
  // szabály HIBAKÉNT tiltja is). A kulcs-összevetés ugyanazt adja, mellékhatás
  // nélkül: amíg a betöltött kulcs nem az aktuális évpár, addig tölt.
  const [adat, setAdat] = useState<{
    kulcs: string
    osszesito: AdomanyozokOsszesito | null
    error: string | null
  } | null>(null)
  const kulcs = `${evTol}-${evIg}`
  const betoltes = adat?.kulcs !== kulcs
  const osszesito = adat?.osszesito ?? null
  const error = adat?.error ?? null

  // Az évválasztó a VALÓS adatból töltődik — nem egy kitalált év-listából.
  useEffect(() => {
    let el = true
    void (async () => {
      const res = await getAdomanyEvek()
      if (!el) return
      if ('error' in res) return // a lista betöltése külön jelzi a hibát
      if (res.evek.length) setEvek(res.evek.includes(currentYear) ? res.evek : [currentYear, ...res.evek])
    })()
    return () => { el = false }
  }, [currentYear])

  useEffect(() => {
    let el = true
    void (async () => {
      const res = await getAdomanyozok({ evTol, evIg })
      if (!el) return
      setAdat({
        kulcs: `${evTol}-${evIg}`,
        osszesito: res.osszesito ?? null,
        error: res.error ?? null,
      })
    })()
    return () => { el = false }
  }, [evTol, evIg])

  const onEvValtas = useCallback((tol: number, ig: number) => {
    // A felhasználó fordítva is beállíthatja — a sorrendet itt rendezzük,
    // hogy a szerver ne kapjon üres tartományt.
    setEvTol(Math.min(tol, ig))
    setEvIg(Math.max(tol, ig))
  }, [])

  const onCsvExport = useCallback((sorok: string[][]) => {
    const csv = sorok.map((s) => s.map(csvMezo).join(';')).join('\r\n')
    // BOM: enélkül az Excel a magyar ékezeteket elrontja.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `adomanyozok-${evTol}-${evIg}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [evTol, evIg])

  return (
    <AdomanyozokBody
      osszesito={osszesito}
      error={error}
      betoltes={betoltes}
      valaszthatoEvek={evek}
      evTol={evTol}
      evIg={evIg}
      onEvValtas={onEvValtas}
      onCsvExport={onCsvExport}
    />
  )
}
