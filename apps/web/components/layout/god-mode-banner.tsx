'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { deactivateGodMode } from '@/app/(dashboard)/god-mode/actions-v2'
import { useRouter } from 'next/navigation'

interface GodModeBannerProps {
  expiresAt: number
}

export function GodModeBanner({ expiresAt }: GodModeBannerProps) {
  const [remaining, setRemaining] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function update() {
      const diff = expiresAt - Date.now()
      if (diff <= 0) {
        router.refresh()
        return
      }
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setRemaining(
        hours > 0 ? `${hours}ó ${mins}p ${secs}mp` : `${mins}p ${secs}mp`
      )
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, router])

  async function handleDeactivate() {
    setDeactivating(true)
    await deactivateGodMode()
    router.refresh()
  }

  return (
    <div className="bg-gradient-to-r from-red-600 to-red-500 text-white px-4 py-2 flex items-center justify-between text-sm shrink-0">
      <span className="font-semibold flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        God Mode aktív — {remaining} van hátra
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-white text-white hover:bg-red-700 hover:text-white h-7 text-xs"
        onClick={handleDeactivate}
        disabled={deactivating}
      >
        {deactivating ? 'Kilépés...' : 'Kilépés a God Mode-ból'}
      </Button>
    </div>
  )
}
