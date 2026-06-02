'use client'

import { useEffect, useState } from 'react'
import { GitBranch, TreePine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getFamilyTreeDataByMemberId } from '@/lib/family-tree/get-family-tree'
import type { FamilyTreeData } from '@/lib/family-tree/types'
import { FamilyTreeView } from '@/components/family-tree/family-tree-view'

interface FamilyTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: number | null
}

/**
 * 2026-06-02 v2 — a régi balkan.app/familytree.js alapú dialógus lecserélve
 * az új saját családfa modulra (FamilyTreeView + szemely_kapcsolat-alapú
 * BFS). Egységes a családi karton "Családfa" füllel — ugyanaz a vizuáció,
 * ugyanaz az adatforrás.
 *
 * Központ: a megadott member köré épít — ha aktív háztartásban van, a
 * férj+nő pár a központ; egyébként saját maga.
 */
export function FamilyTreeDialog({ open, onOpenChange, memberId }: FamilyTreeDialogProps) {
  const [data, setData] = useState<FamilyTreeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!open || !memberId) return
    let cancelled = false
    setData(null)
    setError('')
    setLoading(true)
    getFamilyTreeDataByMemberId(memberId)
      .then((result) => {
        if (cancelled) return
        setData(result)
        if (result.members.length === 0) {
          setError('Nincs elegendő adat a családfa megjelenítéséhez. Rögzítse a szülő-gyermek és házastárs kapcsolatokat az anyakönyvi modulban.')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Hiba történt a családfa betöltésekor.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, memberId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] !w-[min(1260px,calc(100vw-2rem))] !max-w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1320px,calc(100vw-3rem))] sm:!max-w-[min(1320px,calc(100vw-3rem))]"
        showCloseButton={false}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-card shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
          <div className="px-6 pt-5 pb-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--primary))' }}
              >
                <TreePine className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Családfa</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {loading ? 'Betöltés…' : data ? `${data.members.length} személy` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Bezárás"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Családfa container */}
          <div className="flex-1 overflow-y-auto bg-muted/30 p-5">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <GitBranch className="size-12 text-accent animate-pulse mb-3" />
                <p className="text-sm text-muted-foreground">Családfa betöltése…</p>
              </div>
            )}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <TreePine className="size-16 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground font-medium max-w-md">{error}</p>
              </div>
            )}
            {!loading && !error && data && data.members.length > 0 && (
              <FamilyTreeView data={data} layoutMode="ego-top" />
            )}
          </div>

          <div className="px-6 py-3 border-t border-border flex justify-end shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl bg-muted hover:bg-muted/70 text-muted-foreground border-border"
              onClick={() => onOpenChange(false)}
            >
              Vissza az adatlaphoz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
