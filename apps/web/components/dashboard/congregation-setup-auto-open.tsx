'use client'

/**
 * Automatikusan megnyitja a CongregationSetupWizard-ot a /dashboard első
 * betöltéskor, ha a gyülekezet alapadatai még hiányoznak.
 */

import { useEffect, useState } from 'react'
import { CongregationSetupWizard } from '@/components/modals/congregation-setup-wizard'

interface Props {
  congregationId: string | null
  needsSetup: boolean
  /** 2026-06-05: ha épp indul a bevezető körbevezetés (walkthrough), a setup-
   *  wizard NE nyíljon ki azonnal — csak a walkthrough befejezése után. */
  deferForWalkthrough?: boolean
}

export function CongregationSetupAutoOpen({
  congregationId,
  needsSetup,
  deferForWalkthrough = false,
}: Props) {
  const shouldOpen = Boolean(needsSetup && congregationId)
  // Ha a walkthrough fut, kezdetben zárva; a 'kartoteka:walkthrough-done' esemény nyitja.
  const [open, setOpen] = useState(() => shouldOpen && !deferForWalkthrough)

  useEffect(() => {
    if (!deferForWalkthrough || !shouldOpen) return
    const onDone = () => setOpen(true)
    window.addEventListener('kartoteka:walkthrough-done', onDone)
    return () => window.removeEventListener('kartoteka:walkthrough-done', onDone)
  }, [deferForWalkthrough, shouldOpen])

  if (!congregationId) return null

  return (
    <CongregationSetupWizard
      open={open}
      onOpenChange={setOpen}
      congregationId={congregationId}
    />
  )
}
