'use client'

import { Inbox, SearchX, UserSearch } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Variant = 'noUsers' | 'noSearchMatch' | 'filteredEmpty'

interface EmptyStateProps {
  variant: Variant
  searchQuery?: string
  onClearFilters?: () => void
}

export function EmptyState({ variant, searchQuery, onClearFilters }: EmptyStateProps) {
  const Icon = variant === 'noSearchMatch' ? SearchX : variant === 'filteredEmpty' ? UserSearch : Inbox

  const title =
    variant === 'noUsers'
      ? 'Még nincs felhasználó a rendszerben.'
      : variant === 'noSearchMatch'
        ? `Nincs találat ${searchQuery ? `a „${searchQuery}" keresésre` : 'a keresésre'}.`
        : 'Nincs olyan felhasználó, aki megfelelne a beállított szűrőknek.'

  const hint =
    variant === 'noUsers'
      ? 'Amint új lelkipásztor regisztrál, itt fog megjelenni — itt lehet majd jóváhagyni és szerepkört rendelni hozzá.'
      : variant === 'noSearchMatch'
        ? 'Próbálja más kereszt- vagy gyülekezet-névvel. Lehet, hogy a keresett felhasználó még nincs a rendszerben.'
        : 'Lazítson a szűrőkön, hogy szélesebb listát lásson.'

  return (
    <div className="card-raised p-8 sm:p-10 text-center space-y-4">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="size-7" />
      </div>
      <div className="space-y-1.5">
        <p className="font-heading text-lg text-slate-800">{title}</p>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">{hint}</p>
      </div>
      {onClearFilters && variant !== 'noUsers' && (
        <Button size="sm" variant="outline" onClick={onClearFilters}>
          Szűrők törlése
        </Button>
      )}
    </div>
  )
}
