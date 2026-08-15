/**
 * DesktopMemberRemoveDialog — a közös négyutas kivezetés-dialógus
 * desktop-bekötése (2026-08-15, desktop-paritás 2. szelet — „A törlés egy
 * nyelvet beszéljen", 19. pont desktopra).
 *
 * A közös dialógus (@kartoteka/ui-app MemberRemoveDialog) kapja a desktop-
 * műveleteket: az előzetes kapcsolat-ellenőrzést és a kivezetés-tükröt
 * (lib/member-removal.ts — verified-session őrrel, kézi IDOR-ellenőrzéssel).
 *
 * MIÉRT online-only (paritás-terv 4.4. kockázat, a desktop-rental-tab
 * mintája): offline vagy session nélkül a dialógus HANGOS magyarázó kártyát
 * mutat — a kivezetés NEM kerül outbox-ba (fail-closed), mert anyakönyvi
 * lánccal és szerver-RPC-vel jár, amit offline nem lehet felelősen elvégezni.
 */

import { CloudOff } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import { MemberRemoveDialog as SharedMemberRemoveDialog, type MemberRemoveToastKind } from '@kartoteka/ui-app'

import { checkPersonReferencesDesktop, removeMemberDesktop } from '../lib/member-removal'
import { useSessionOnline } from '../lib/use-session-online'

interface DesktopMemberRemoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: number; name: string } | null
  congregationId: string
  /** Siker/figyelmeztetés kijelzése (a hiba a dialóguson belül jelenik meg). */
  onToast: (message: string, kind: MemberRemoveToastKind) => void
  /** Sikeres kivezetés után — lista-frissítés (teljes pull) a hívónál. */
  onRemoved?: () => void
}

export function DesktopMemberRemoveDialog({
  open,
  onOpenChange,
  member,
  congregationId,
  onToast,
  onRemoved,
}: DesktopMemberRemoveDialogProps) {
  // ONLINE = hálózat + érvényes Supabase-session (PIN-es offline munkamenetben
  // false). A hook induláskor false-ról indul — ez fail-closed irányba téved:
  // legfeljebb egy pillanatra a kapcsolat-kártya látszik, írás nem indulhat.
  const online = useSessionOnline()

  if (!member) return null

  if (!online) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* z-[70]: a tag-portré dialógus (z-50) FÖLÉ rétegzés — az
            AvatarEditorBody bevált mintája a member-detail-dialogban. */}
        <DialogContent className="z-[70] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tag kivezetése: {member.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <CloudOff className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              A kivezetéshez internetkapcsolat és online belépés szükséges.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              A kivezetés anyakönyvi bejegyzéssel, a kapcsolatok lezárásával és a
              választói névjegyzék frissítésével jár — ezt a rendszer nem teszi
              várakozó sorba, hogy félkész állapot ne születhessen. Kapcsolódj a
              hálózatra, jelentkezz be online, majd nyisd meg újra ezt az ablakot.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Bezárás
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <SharedMemberRemoveDialog
      open={open}
      onOpenChange={onOpenChange}
      member={member}
      // Modul-szintű, referencia-stabil függvény (a közös dialógus effektje
      // függ tőle — inline lambda minden renderrel újraindítaná a betöltést).
      checkReferences={checkPersonReferencesDesktop}
      removeMember={(input) => removeMemberDesktop(congregationId, input)}
      onToast={onToast}
      onRemoved={onRemoved}
      contentClassName="z-[70]"
    />
  )
}
