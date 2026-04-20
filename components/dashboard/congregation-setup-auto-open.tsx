'use client'

/**
 * Automatikusan megnyitja a CongregationSetupWizard-ot a /dashboard első
 * betöltéskor, ha a gyülekezet alapadatai még hiányoznak.
 */

import { useState } from 'react'
import { CongregationSetupWizard } from '@/components/modals/congregation-setup-wizard'

interface Props {
  congregationId: string | null
  needsSetup: boolean
}

export function CongregationSetupAutoOpen({ congregationId, needsSetup }: Props) {
  // Az initial state közvetlenül a prop-ból — nincs setState-in-effect.
  const [open, setOpen] = useState(() => Boolean(needsSetup && congregationId))

  if (!congregationId) return null

  return (
    <CongregationSetupWizard
      open={open}
      onOpenChange={setOpen}
      congregationId={congregationId}
    />
  )
}
