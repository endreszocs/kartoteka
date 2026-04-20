'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { deactivateGodMode } from '@/app/(dashboard)/god-mode/actions-v4'
import { Button } from '@/components/ui/button'

interface GodModeBannerV3Props {
  expiresAt: number
}

function formatRemaining(expiresAt: number) {
  const diff = expiresAt - Date.now()
  if (diff <= 0) return null

  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)

  return hours > 0 ? `${hours} ó ${minutes} p ${seconds} mp` : `${minutes} p ${seconds} mp`
}

export function GodModeBannerV3({ expiresAt }: GodModeBannerV3Props) {
  const [remaining, setRemaining] = useState(() => formatRemaining(expiresAt) || '')
  const [deactivating, setDeactivating] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function updateRemaining() {
      const formatted = formatRemaining(expiresAt)
      if (!formatted) {
        router.refresh()
        return
      }

      setRemaining(formatted)
    }

    updateRemaining()
    const interval = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt, router])

  async function handleDeactivate() {
    setDeactivating(true)
    await deactivateGodMode()
    router.refresh()
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 bg-gradient-to-r from-red-600 to-rose-500 px-4 py-2.5 text-sm text-white sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-4" />
        Rendszergazdai mód aktív — {remaining} van hátra
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="h-9 self-start rounded-full border-0 bg-white px-4 text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700 sm:self-auto"
        onClick={handleDeactivate}
        disabled={deactivating}
      >
        {deactivating ? 'Kilépés...' : 'Kilépés a rendszergazdai módból'}
      </Button>
    </div>
  )
}
