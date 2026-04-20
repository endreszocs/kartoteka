'use client'

import { useState } from 'react'
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

  async function handleExit() {
    setExiting(true)
    await exitAdminOverride()
    router.refresh()
  }

  return (
    <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm shrink-0">
      <span className="font-semibold flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Engedélyezett hozzáférés — {congregationName} ({remainingMinutes} perc hátra)
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-white text-white hover:bg-orange-700 hover:text-white h-7 text-xs"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? 'Kilépés...' : 'Kilépés'}
      </Button>
    </div>
  )
}
