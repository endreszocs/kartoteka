'use client'

import { useEffect, useState, useTransition } from 'react'
import { BookmarkCheck, BookmarkPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

/**
 * MM Bookmark toggle gomb — „Mentés offline-ra" / „Offline mentve".
 *
 * A user egy adott ötletre, projektre, vagy segédanyagra kattintva jelzi,
 * hogy szeretné-e azt helyileg (Dexie + Excel) elérhetővé tenni offline-ban.
 *
 * Az auto-bookmarkolt tartalmak (saját ötlet, saját projekt, saját segédanyag)
 * mindig elérhetők offline — ezekre a gomb el van rejtve, vagy csak disabled
 * állapotban jelenik meg.
 *
 * Működés:
 *  1. Mount-kor lekéri a jelenlegi bookmark-állapotot (supabase.from('mm_bookmarks')...)
 *  2. Kattintásra insert (új bookmark) vagy delete (meglévő törlése)
 *  3. A Dexie scope autómagától frissül (a sync-orchestrator revalidál)
 */

/**
 * MEGJEGYZÉS a célpontokról:
 * A Missziós Műhelyben nincs külön `mm_projektek` tábla — egy "projekt"
 * valójában egy `mm_otletek` rekord, amihez `mm_feladatok` és `mm_merfoldkovek`
 * tartoznak. Ezért a bookmark csak 2 célpontot ismer: 'otlet' és 'segedanyag'.
 */
type BookmarkKind = 'otlet' | 'segedanyag'

export function MmBookmarkToggle({
  kind,
  entityId,
  isOwner = false,
  size = 'default',
}: {
  kind: BookmarkKind
  entityId: string
  /** Ha a user a tulajdonos, a tartalom auto-bookmarkolt — a gomb disabled. */
  isOwner?: boolean
  size?: 'default' | 'sm'
}) {
  const [isPending, startTransition] = useTransition()
  const [isBookmarked, setIsBookmarked] = useState<boolean | null>(null) // null = loading
  const [bookmarkId, setBookmarkId] = useState<string | null>(null)

  // Lekérjük a bookmark státuszt
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          if (!cancelled) setIsBookmarked(false)
          return
        }

        const fkColumn = kind === 'otlet' ? 'otlet_id' : 'segedanyag_id'

        const { data } = await supabase
          .from('mm_bookmarks')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq(fkColumn, entityId)
          .maybeSingle()

        if (cancelled) return
        if (data?.id) {
          setIsBookmarked(true)
          setBookmarkId(data.id)
        } else {
          setIsBookmarked(false)
          setBookmarkId(null)
        }
      } catch (e) {
        console.error('[mm bookmark load]', e)
        if (!cancelled) setIsBookmarked(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, entityId])

  function handleToggle() {
    startTransition(async () => {
      try {
        const supabase = createClient()
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          toast.error('Nincs bejelentkezett felhasználó.')
          return
        }

        if (isBookmarked && bookmarkId) {
          // Eltávolítás
          const { error } = await supabase
            .from('mm_bookmarks')
            .delete()
            .eq('id', bookmarkId)
          if (error) throw error
          setIsBookmarked(false)
          setBookmarkId(null)
          toast.info('Offline mentés eltávolítva.')
        } else {
          // Hozzáadás
          const payload: Record<string, unknown> = {
            user_id: userData.user.id,
          }
          if (kind === 'otlet') payload.otlet_id = entityId
          else payload.segedanyag_id = entityId

          const { data, error } = await supabase
            .from('mm_bookmarks')
            .insert(payload)
            .select('id')
            .single()
          if (error) throw error
          setIsBookmarked(true)
          setBookmarkId(data?.id || null)
          toast.success(
            'Offline mentve! A következő szinkronnál bekerül a Dexie cache-be és az Excel biztonsági mentésbe.',
          )
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Offline mentés sikertelen.',
        )
      }
    })
  }

  // Tulajdonos esetén mindig bookmarkolt — csak jelzünk, nem togle-olunk
  if (isOwner) {
    return (
      <Button
        variant="outline"
        size={size}
        className="rounded-lg border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
        disabled
      >
        <BookmarkCheck className="mr-1 h-3.5 w-3.5" />
        Offline (saját)
      </Button>
    )
  }

  if (isBookmarked === null) {
    return (
      <Button variant="outline" size={size} disabled>
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        Betöltés...
      </Button>
    )
  }

  if (isBookmarked) {
    return (
      <Button
        variant="outline"
        size={size}
        className="rounded-lg border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50"
        onClick={handleToggle}
        disabled={isPending}
      >
        <BookmarkCheck className="mr-1 h-3.5 w-3.5" />
        Offline mentve
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size={size}
      className="rounded-lg border-slate-300 text-slate-700 hover:bg-fuchsia-50 hover:text-fuchsia-700"
      onClick={handleToggle}
      disabled={isPending}
    >
      <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
      Mentés offline-ra
    </Button>
  )
}
