'use client'

import { useState } from 'react'
import { Church, Loader2, UserCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DioceseLite {
  id: string
  name: string
}

interface ApprovePendingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  userEmail: string
  dioceses: DioceseLite[]
  isPending: boolean
  onConfirm: (dioceseId: string, congregationName: string) => void
}

export function ApprovePendingDialog({
  open,
  onOpenChange,
  userName,
  userEmail,
  dioceses,
  isPending,
  onConfirm,
}: ApprovePendingDialogProps) {
  const [dioceseId, setDioceseId] = useState('')
  const [congregationName, setCongregationName] = useState(userName || '')

  const ready = dioceseId !== '' && congregationName.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDioceseId('')
          setCongregationName(userName || '')
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-2">
            <UserCheck className="size-5 text-emerald-600" />
            Részletes jóváhagyás
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{userName || '(nincs név)'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userEmail}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Egyházmegye <span className="text-rose-500">*</span>
            </label>
            <select
              value={dioceseId}
              onChange={(e) => setDioceseId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              disabled={isPending}
              autoFocus
            >
              <option value="">— Válasszon egyházmegyét —</option>
              {dioceses.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Gyülekezet neve <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Church className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={congregationName}
                onChange={(e) => setCongregationName(e.target.value)}
                placeholder="Pl.: Barátosi gyülekezet"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 pl-9 pr-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                disabled={isPending}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              Ha a megadott névvel létezik már gyülekezet, ahhoz kerül hozzárendelésre. Ha nem létezik, automatikusan létrejön.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={() => {
              if (ready) onConfirm(dioceseId, congregationName.trim())
            }}
            disabled={!ready || isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Jóváhagyás véglegesítése
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
