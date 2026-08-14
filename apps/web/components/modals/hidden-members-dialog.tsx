'use client'

import { useEffect, useState, useTransition } from 'react'
import { EyeOff, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  listHiddenMembers,
  restoreHiddenMember,
} from '@/app/(dashboard)/tagnyilvantartas/actions'
import type { HiddenMemberItem } from '@/lib/members/removal-types'

/**
 * Rejtett személyek — lista + visszahozás (2026-08-14, 1. döntés).
 *
 * A „láthatatlanná tétel" (isvisible=false) eddig a weben fekete lyuk volt:
 * a törlés-védelem elrejtette a személyt, de visszahozó felület csak a
 * desktopon létezett. Ez a dialógus ad rálátást és visszautat.
 * A személy SZÁNDÉKOSAN nincs a Kukában (nincs deleted oszlopa — 1. döntés);
 * a rejtés nem jár lejárattal, semmi nem törlődik magától.
 */
export function HiddenMembersDialog({
  open,
  onOpenChange,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A hívó frissítheti a tag-listát egy sikeres visszahozás után. */
  onRestored?: () => void
}) {
  const [members, setMembers] = useState<HiddenMemberItem[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMembers(null)
    setTruncated(false)
    setError(null)
    listHiddenMembers()
      .then(res => {
        if (cancelled) return
        if (res.error) setError(res.error)
        setMembers(res.members)
        setTruncated(Boolean(res.truncated))
      })
      .catch(() => {
        if (!cancelled) setError('A rejtett személyek listája nem tölthető be.')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  function handleRestore(m: HiddenMemberItem) {
    if (!confirm(`Visszahozza a névsorba: ${m.nev}?`)) return
    startTransition(async () => {
      const res = await restoreHiddenMember(m.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${m.nev} visszakerült a névsorba.`)
      setMembers(prev => (prev ? prev.filter(x => x.id !== m.id) : prev))
      onRestored?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeOff className="size-4 text-muted-foreground" />
            Rejtett személyek
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Ezek a személyek törlés-védelem miatt kerültek ki a névsorból
          (védett kapcsolataik — pénzügy, anyakönyv, család — miatt nem
          törölhetők véglegesen). Nem törlődnek maguktól, és bármikor
          visszahozhatók.
        </p>

        {error && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
        )}

        {members === null && !error && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Betöltés…
          </div>
        )}

        {members !== null && members.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nincs rejtett személy ebben a gyülekezetben.
          </p>
        )}

        {truncated && (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            Csak az első 500 rejtett személy látszik — visszahozás után a
            lista újranyitva frissül.
          </div>
        )}

        {members !== null && members.length > 0 && (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
            {members.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.nev}</p>
                  {m.memberStatus && (
                    <p className="text-xs text-muted-foreground">Státusz: {m.memberStatus}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 rounded-lg"
                  onClick={() => handleRestore(m)}
                  disabled={isPending}
                >
                  <RotateCcw className="size-3.5" />
                  Visszahozás
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
