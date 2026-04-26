'use client'

/**
 * Webes wrapper — Sprint Q F2.2, v0.7.8 (2026-04-26).
 * A vizuális réteg átkerült a `@kartoteka/ui-app/finance/oblio`-ba.
 * A wrapper a sonner toast-ot köti be a callback prop-ra.
 */

import { toast } from 'sonner'

import {
  OblioEllenorzesFolderCard as SharedOblioEllenorzesFolderCard,
  type OblioEllenorzesFolderCardProps,
} from '@kartoteka/ui-app'

type WebProps = Omit<OblioEllenorzesFolderCardProps, 'onToast'>

export function OblioEllenorzesFolderCard(props: WebProps) {
  return (
    <SharedOblioEllenorzesFolderCard
      {...props}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else if (kind === 'warning') toast.warning(msg)
        else toast(msg)
      }}
    />
  )
}
