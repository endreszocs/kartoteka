'use client'

/**
 * Licenc-kezelő dialógusok (2026-07-11, admin-redesign 2. kör):
 *   - LicenseExtendDialog — a lejárat (valid_until) meghosszabbítása,
 *   - LicenseEditDialog — eszköz-limit + megjegyzés szerkesztése.
 *
 * A visszavonás/visszaállítás a szülő AdminConfirmDialog-jával történik
 * (a device-műveletek mintájára), ide csak a mező-módosító dialógusok kerülnek.
 */

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, Pencil } from 'lucide-react'
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
  extendLicense,
  updateLicense,
} from '@/app/(dashboard)/admin/devices-licenses-actions'
import type { License } from '@/app/(dashboard)/admin/devices-licenses-shared'

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A megadott dátumhoz (vagy máihoz, ha korábbi) ad n évet, YYYY-MM-DD-ben. */
function plusYears(fromIso: string, years: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(fromIso) ? new Date(`${fromIso}T00:00:00`) : new Date()
  const today = new Date()
  const start = base.getTime() > today.getTime() ? base : today
  const d = new Date(start)
  d.setFullYear(d.getFullYear() + years)
  return isoDate(d)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU')
}

// ─────────────────────────────────────────────────────────────────────────
// Hosszabbítás
// ─────────────────────────────────────────────────────────────────────────

export function LicenseExtendDialog({
  license,
  onOpenChange,
  onDone,
}: {
  license: License | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [validUntil, setValidUntil] = useState('')
  const [saving, setSaving] = useState(false)

  // A setState-et egy frame-re kitoljuk (set-state-in-effect lint elkerülése).
  useEffect(() => {
    if (!license) return
    const raf = requestAnimationFrame(() => setValidUntil(plusYears(license.valid_until, 1)))
    return () => cancelAnimationFrame(raf)
  }, [license])

  const open = !!license
  const invalid = !!license && validUntil <= license.valid_from

  async function handleSubmit() {
    if (!license) return
    if (invalid) {
      toast.error('A lejárat dátumának a kezdet utáninak kell lennie.')
      return
    }
    setSaving(true)
    const res = await extendLicense({ id: license.id, validUntil })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Licenc meghosszabbítva.')
    onOpenChange(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            <CalendarClock className="size-5 shrink-0 text-primary" aria-hidden />
            Licenc hosszabbítása
          </DialogTitle>
          <DialogDescription>
            {license ? (
              <>
                {license.user_full_name || license.user_email || 'Felhasználó'} licence — jelenlegi
                lejárat: <strong>{formatDate(license.valid_until)}</strong>.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lic-extend-until">Új lejárat</Label>
            <Input
              id="lic-extend-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="tabular-nums"
              aria-invalid={invalid}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => license && setValidUntil(plusYears(license.valid_until, 1))}
            >
              +1 év
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => license && setValidUntil(plusYears(license.valid_until, 2))}
            >
              +2 év
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Mégse
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || invalid} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Hosszabbítás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Szerkesztés (eszköz-limit + megjegyzés)
// ─────────────────────────────────────────────────────────────────────────

export function LicenseEditDialog({
  license,
  onOpenChange,
  onDone,
}: {
  license: License | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [deviceLimit, setDeviceLimit] = useState(2)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // A setState-et egy frame-re kitoljuk (set-state-in-effect lint elkerülése).
  useEffect(() => {
    if (!license) return
    const raf = requestAnimationFrame(() => {
      setDeviceLimit(license.device_limit)
      setNotes(license.notes ?? '')
    })
    return () => cancelAnimationFrame(raf)
  }, [license])

  const open = !!license
  const invalid = !Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 10

  async function handleSubmit() {
    if (!license) return
    if (invalid) {
      toast.error('Az eszköz-limit 1 és 10 közötti egész szám lehet.')
      return
    }
    setSaving(true)
    const res = await updateLicense({ id: license.id, deviceLimit, notes: notes.trim() || undefined })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Licenc módosítva.')
    onOpenChange(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            <Pencil className="size-5 shrink-0 text-primary" aria-hidden />
            Licenc szerkesztése
          </DialogTitle>
          <DialogDescription>
            {license ? (
              <>{license.user_full_name || license.user_email || 'Felhasználó'} licence.</>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lic-edit-limit">Eszköz-limit</Label>
            <Input
              id="lic-edit-limit"
              type="number"
              min={1}
              max={10}
              value={deviceLimit}
              onChange={(e) => setDeviceLimit(Number(e.target.value))}
              className="tabular-nums"
              aria-invalid={invalid}
            />
            <p className="text-[11px] text-muted-foreground">
              Hány gépen használhatja egyszerre a desktop-klienst (1–10).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lic-edit-notes">Megjegyzés</Label>
            <Textarea
              id="lic-edit-notes"
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
          <Button onClick={() => void handleSubmit()} disabled={saving || invalid} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Mentés
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
