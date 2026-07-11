'use client'

/**
 * Üres állapotok a Felhasználók oldalhoz (2026-07-11 redesign) — a közös
 * AdminEmptyState-re épül, a variánsok (nincs user / nincs találat / szűrés
 * üres) megmaradtak. A "nincs találat" tanács most a keresés VALÓS képességét
 * tükrözi (név, email, gyülekezet, megye, kerület, szerepkör-név).
 */

import { Inbox, SearchX, UserSearch } from 'lucide-react'

import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
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
        ? 'A keresés a névre, emailre, gyülekezetre, egyházmegyére, egyházkerületre és a szerepkör-nevekre is rákeres — próbálja rövidebb részlettel, vagy törölje a szűrőket.'
        : 'Lazítson a szűrőkön, hogy szélesebb listát lásson.'

  return (
    <div className="card-raised">
      <AdminEmptyState
        icon={Icon}
        title={title}
        hint={hint}
        action={
          onClearFilters && variant !== 'noUsers' ? (
            <Button size="sm" variant="outline" onClick={onClearFilters}>
              Szűrők törlése
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
