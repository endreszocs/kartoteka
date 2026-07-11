'use client'

import { Lock } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { exitAdminOverride } from '@/app/(dashboard)/admin-override/actions'
import { useRouter } from 'next/navigation'

interface AdminOverrideBannerProps {
  congregationName: string
  remainingMinutes: number
}

export function AdminOverrideBanner({ congregationName, remainingMinutes }: AdminOverrideBannerProps) {
  const [exiting, setExiting] = useState(false)
  const router = useRouter()

  // 2026-07-11 fix: a hiba eddig némán elveszett (nem volt toast, a gomb
  // örökre 'Kilépés...' állapotban ragadt) — most hibánál visszaáll a gomb
  // és a felhasználó látja az okot.
  async function handleExit() {
    setExiting(true)
    try {
      const res = await exitAdminOverride()
      if (res?.error) {
        toast.error(`Nem sikerült kilépni: ${res.error}`)
        setExiting(false)
        return
      }
      router.refresh()
    } catch {
      toast.error('Nem sikerült kilépni — hálózati hiba. Próbáld újra.')
      setExiting(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2 text-sm text-white">
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <Lock className="size-4 shrink-0" aria-hidden />
        <span className="truncate">
          Engedélyezett hozzáférés — {congregationName}
          <span className="font-normal opacity-90"> ({remainingMinutes} perc hátra)</span>
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-white bg-transparent text-xs text-white hover:bg-orange-700 hover:text-white"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? 'Kilépés...' : 'Kilépés'}
      </Button>
    </div>
  )
}
