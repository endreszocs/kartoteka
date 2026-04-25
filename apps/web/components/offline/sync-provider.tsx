'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { getExcelWatcher } from '@/lib/offline/excel-watcher'
import { getSyncOrchestrator } from '@/lib/offline/sync-orchestrator'

/**
 * SyncProvider — a sync orchestrator inicializálása belépés után.
 *
 * Ezt a `app/(dashboard)/layout.tsx` vagy egy még magasabb szintű
 * komponens mountolja egyszer, a logout + scope-változás figyelemmel.
 *
 * A `congregationId` a server-oldalon lekért effective scope — ha null,
 * az orchestrator nem indul el (pl. csak lelkészi belépés nélkül).
 *
 * Scope változás (pl. god-mode override) esetén a `congregationId` prop
 * változik → az orchestrator újraindul → a Dexie cache wipe-olódik.
 *
 * Plusz: az Excel Watcher is itt indul (P4.4) — ha a lelkész kézzel
 * módosít egy .xlsx-ben, toast-ot kap + link a /offline/import oldalra.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/[óöő]/g, 'o')
    .replace(/[úüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function SyncProvider({
  congregationId,
  congregationName,
  children,
}: {
  congregationId: string | null
  congregationName?: string | null
  children: React.ReactNode
}) {
  // Debounce toast — ha egyszerre több modul változik, egy toast legyen
  const toastDebounceRef = useRef<number | null>(null)
  const changedModulesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!congregationId) return

    // M6.3 (2026-04-22): a portable standalone kivezetésével az orchestrator
    // mindig elindul — nincs több feltételes "no-op in standalone" ág.
    const orchestrator = getSyncOrchestrator()
    void orchestrator.start(congregationId)

    // Excel watcher a web PWA Excel-sync flow-jához
    const slug = slugify(
      congregationName || congregationId || 'ismeretlen',
    )
    const watcher = getExcelWatcher()
    void watcher.start(slug)

    // Watcher event subscribe → toast
    const unsubscribe = watcher.subscribe(event => {
      if (event.type === 'excel_changed') {
        changedModulesRef.current.add(event.module)

        // Debounce 2s — ha egyszerre több fájl változik, egy toast legyen
        if (toastDebounceRef.current !== null) {
          window.clearTimeout(toastDebounceRef.current)
        }
        toastDebounceRef.current = window.setTimeout(() => {
          const modules = Array.from(changedModulesRef.current)
          changedModulesRef.current.clear()
          toastDebounceRef.current = null

          const modLabel =
            modules.length === 1
              ? modules[0]
              : `${modules.length} modul`

          toast.warning('Excel változás észlelve', {
            description: `Kézi módosítást észleltünk: ${modLabel}. Kattints a részletekért.`,
            duration: 10_000,
            action: {
              label: 'Áttekintés',
              onClick: () => {
                window.location.href = '/offline/import'
              },
            },
          })
        }, 2_000)
      } else if (event.type === 'excel_error') {
        toast.error(
          `Excel figyelési hiba (${event.module}): ${event.error || 'ismeretlen'}`,
        )
      }
    })

    return () => {
      if (orchestrator) orchestrator.stop()
      watcher.stop()
      unsubscribe()
      if (toastDebounceRef.current !== null) {
        window.clearTimeout(toastDebounceRef.current)
      }
    }
  }, [congregationId, congregationName])

  return <>{children}</>
}
