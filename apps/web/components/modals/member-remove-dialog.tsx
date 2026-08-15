'use client'

/**
 * MemberRemoveDialog (web) — a közös négyutas kivezetés-dialógus web-bekötése.
 *
 * 2026-08-15 (desktop-paritás 2. szelet): a teljes dialógus-logika a közös
 * @kartoteka/ui-app csomagba került (members/MemberRemoveDialog.tsx) — a
 * desktop UGYANAZT a dialógust rendereli, csak direkt Supabase-tükörrel a
 * Server Action-ök helyén. Ez a wrapper a webes műveleteket és a sonner
 * toastot injektálja; a props-felülete változatlan (persons-tab kompatibilis).
 */

import { MemberRemoveDialog as SharedMemberRemoveDialog } from '@kartoteka/ui-app'
import { checkPersonReferences, removeMember } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { toast } from 'sonner'

interface MemberRemoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: number; name: string } | null
}

export function MemberRemoveDialog({ open, onOpenChange, member }: MemberRemoveDialogProps) {
  return (
    <SharedMemberRemoveDialog
      open={open}
      onOpenChange={onOpenChange}
      member={member}
      checkReferences={checkPersonReferences}
      removeMember={removeMember}
      onToast={(msg, kind) => {
        if (kind === 'success') toast.success(msg)
        // 2026-08-04 (PR-42): a best-effort utómunkák (párkapcsolat-lezárás,
        // választói újraszámítás) hibája hosszabb ideig látsszon.
        else toast.warning(msg, { duration: 12000 })
      }}
    />
  )
}
