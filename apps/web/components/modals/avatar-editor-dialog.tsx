'use client'

/**
 * AvatarEditorDialog (web) — kép társítása egy személyhez (2026-06-11).
 *
 * A megosztott `AvatarEditorBody` webes wrapperje: a közösségi-link letöltést
 * és a mentést a server actionök adják (`fetchSocialAvatarImage`,
 * `saveMemberAvatar`), a visszajelzés sonner-toast.
 */

import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AvatarEditorBody } from '@kartoteka/ui-app'
import {
  fetchSocialAvatarImage,
  saveMemberAvatar,
} from '@/app/(dashboard)/tagnyilvantartas/avatar-actions'

export interface AvatarEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: {
    id: number
    name: string
    kepUrl?: string | null
    socialUrl?: string | null
  } | null
  onSaved?: () => void | Promise<void>
}

export function AvatarEditorDialog({ open, onOpenChange, person, onSaved }: AvatarEditorDialogProps) {
  if (!person) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fénykép és közösségi kapcsolat</DialogTitle>
        </DialogHeader>
        <AvatarEditorBody
          personName={person.name}
          currentKepUrl={person.kepUrl}
          currentSocialUrl={person.socialUrl}
          onFetchFromSocial={(url) => fetchSocialAvatarImage(url)}
          onSave={(params) => saveMemberAvatar(person.id, params)}
          onSaved={async () => {
            onOpenChange(false)
            if (onSaved) await onSaved()
          }}
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
