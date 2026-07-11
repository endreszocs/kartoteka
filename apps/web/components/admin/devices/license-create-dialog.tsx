'use client'

/**
 * Új licenc kibocsátása — dialógus (2026-07-11, admin-redesign 2. kör).
 *
 * Felhasználó-kereső (email/név, listActiveUsersForLicense), a kiválasztott
 * felhasználó gyülekezete automatikusan a licenchez kötve; eszköz-limit
 * (alap 2), érvényesség (alap: ma → +1 év), megjegyzés. A tényleges INSERT +
 * audit a createLicense server actionben történik.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  createLicense,
  listActiveUsersForLicense,
} from '@/app/(dashboard)/admin/devices-licenses-actions'
import type { LicenseUserOption } from '@/app/(dashboard)/admin/devices-licenses-shared'

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultDates(): { from: string; until: string } {
  const today = new Date()
  const next = new Date(today)
  next.setFullYear(next.getFullYear() + 1)
  return { from: isoDate(today), until: isoDate(next) }
}

export function LicenseCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<LicenseUserOption[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<LicenseUserOption | null>(null)

  const [deviceLimit, setDeviceLimit] = useState(2)
  const [validFrom, setValidFrom] = useState(() => defaultDates().from)
  const [validUntil, setValidUntil] = useState(() => defaultDates().until)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // A megnyitáskor visszaáll az alapállapot (a záráskori maradék adat ne
  // szivárogjon a következő megnyitásba). A setState-et egy frame-re kitoljuk
  // (a set-state-in-effect lint elkerülésére — az AdminConfirmDialog mintája).
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      const d = defaultDates()
      setSearch('')
      setResults([])
      setSelected(null)
      setDeviceLimit(2)
      setValidFrom(d.from)
      setValidUntil(d.until)
      setNotes('')
      setSaving(false)
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Felhasználó-kereső — 250 ms debounce, csak amíg nincs kiválasztott user.
  const searchSeq = useRef(0)
  const runSearch = useCallback(async (needle: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    const res = await listActiveUsersForLicense(needle)
    if (seq !== searchSeq.current) return // elavult válasz — eldobjuk
    setSearching(false)
    if (res.error) {
      toast.error(res.error)
      setResults([])
      return
    }
    setResults(res.data ?? [])
  }, [])

  useEffect(() => {
    if (!open || selected) return
    const t = setTimeout(() => void runSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [open, search, selected, runSearch])

  async function handleSubmit() {
    if (!selected) {
      toast.error('Válassz felhasználót a licenchez.')
      return
    }
    if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 10) {
      toast.error('Az eszköz-limit 1 és 10 közötti egész szám lehet.')
      return
    }
    if (validUntil <= validFrom) {
      toast.error('A lejárat dátumának a kezdet utáninak kell lennie.')
      return
    }
    setSaving(true)
    const res = await createLicense({
      userId: selected.id,
      congregationId: selected.congregation_id,
      deviceLimit,
      validFrom,
      validUntil,
      notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Licenc kibocsátva.')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            <UserPlus className="size-5 shrink-0 text-primary" aria-hidden />
            Új licenc kibocsátása
          </DialogTitle>
          <DialogDescription>
            A licenc egy felhasználóhoz kötődik: meghatározza a maximális
            eszközszámot és a lejáratot. A desktop-kliens ezt olvassa offline is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── Felhasználó ─── */}
          <div className="space-y-1.5">
            <Label>Felhasználó</Label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selected.full_name || selected.email || '—'}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {selected.email}
                    {selected.congregation_name ? ` · ${selected.congregation_name}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => {
                    setSelected(null)
                    setSearch('')
                  }}
                  aria-label="Másik felhasználó választása"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Keresés név vagy email szerint…"
                    className="pl-9"
                    aria-label="Felhasználó keresése"
                    autoFocus
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                  {results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {searching ? 'Keresés…' : 'Nincs találat.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {results.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(u)}
                            className="flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {u.full_name || u.email || '—'}
                              </p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {u.email}
                                {u.congregation_name ? ` · ${u.congregation_name}` : ''}
                              </p>
                            </div>
                            <Check className="size-4 shrink-0 text-transparent" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ─── Eszköz-limit + érvényesség ─── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lic-device-limit">Eszköz-limit</Label>
              <Input
                id="lic-device-limit"
                type="number"
                min={1}
                max={10}
                value={deviceLimit}
                onChange={(e) => setDeviceLimit(Number(e.target.value))}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lic-valid-from">Érvényes ettől</Label>
              <Input
                id="lic-valid-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lic-valid-until">Lejárat</Label>
              <Input
                id="lic-valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="tabular-nums"
                aria-invalid={validUntil <= validFrom}
              />
            </div>
          </div>

          {/* ─── Megjegyzés ─── */}
          <div className="space-y-1.5">
            <Label htmlFor="lic-notes">Megjegyzés (opcionális)</Label>
            <Textarea
              id="lic-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pl. próbaidőszak, támogatói licenc…"
              rows={2}
              className="min-h-[64px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Mégse
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !selected} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Kibocsátás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
