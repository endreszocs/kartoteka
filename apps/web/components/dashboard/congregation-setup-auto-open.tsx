'use client'

/**
 * Automatikusan megnyitja a CongregationSetupWizard-ot a /dashboard első
 * betöltéskor, ha a gyülekezet alapadatai még hiányoznak.
 *
 * 2026-06-05 (Endre kérése): a varázsló addig jelenik meg újra és újra, amíg
 * a kötelező adatok hiányoznak — DE ha a felhasználó a „Később" gombra kattint
 * (vagy bezárja a kitöltés befejezése nélkül), 24 órán át nem zaklatjuk vele.
 * A snooze a böngészőben (localStorage) tárolódik, gyülekezetenként.
 */

import { useEffect, useRef, useState } from 'react'
import { CongregationSetupWizard } from '@/components/modals/congregation-setup-wizard'

interface Props {
  congregationId: string | null
  needsSetup: boolean
  /** 2026-06-05: ha épp indul a bevezető körbevezetés (walkthrough), a setup-
   *  wizard NE nyíljon ki azonnal — csak a walkthrough befejezése után. */
  deferForWalkthrough?: boolean
}

const SNOOZE_MS = 24 * 60 * 60 * 1000 // 24 óra

function snoozeKey(congregationId: string): string {
  return `kartoteka:setup-snooze:${congregationId}`
}

/** True, ha a felhasználó a közelmúltban (24 órán belül) elhalasztotta. */
function isSnoozed(congregationId: string): boolean {
  try {
    const raw = window.localStorage.getItem(snoozeKey(congregationId))
    if (!raw) return false
    const ts = Number.parseInt(raw, 10)
    if (Number.isNaN(ts)) return false
    return Date.now() - ts < SNOOZE_MS
  } catch {
    return false
  }
}

export function CongregationSetupAutoOpen({
  congregationId,
  needsSetup,
  deferForWalkthrough = false,
}: Props) {
  const shouldOpen = Boolean(needsSetup && congregationId)
  const [open, setOpen] = useState(false)
  // Ha a kitöltés sikeresen befejeződött, NEM kell snooze-t írni záráskor.
  const completedRef = useRef(false)

  // Megnyitás-logika (kliens-oldal): a snooze-t csak a böngészőben tudjuk
  // ellenőrizni, ezért useEffect-ben döntünk a megnyitásról.
  useEffect(() => {
    if (!shouldOpen || !congregationId) return
    if (isSnoozed(congregationId)) return

    if (deferForWalkthrough) {
      // A walkthrough befejezése után nyitjuk (akkor is csak ha nincs snooze)
      const onDone = () => {
        if (!isSnoozed(congregationId)) setOpen(true)
      }
      window.addEventListener('kartoteka:walkthrough-done', onDone)
      return () => window.removeEventListener('kartoteka:walkthrough-done', onDone)
    }

    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (a synchronous
    // setState-in-effect figyelmeztetés elkerülésére).
    const raf = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [shouldOpen, deferForWalkthrough, congregationId])

  function handleOpenChange(next: boolean) {
    // Bezárás a kitöltés befejezése nélkül → 24 órás halasztás.
    if (!next && !completedRef.current && congregationId) {
      try {
        window.localStorage.setItem(snoozeKey(congregationId), String(Date.now()))
      } catch {
        // best-effort — ha nincs localStorage, egyszerűen nem snooze-olunk
      }
    }
    setOpen(next)
  }

  function handleCompleted() {
    // A sikeres mentés után töröljük az esetleges snooze-t, és nem írunk újat.
    completedRef.current = true
    if (congregationId) {
      try {
        window.localStorage.removeItem(snoozeKey(congregationId))
      } catch {
        // best-effort
      }
    }
  }

  if (!congregationId) return null

  return (
    <CongregationSetupWizard
      open={open}
      onOpenChange={handleOpenChange}
      congregationId={congregationId}
      onCompleted={handleCompleted}
    />
  )
}
