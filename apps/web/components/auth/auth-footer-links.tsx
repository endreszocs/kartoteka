'use client'

/**
 * AuthFooterLinks — a `(auth)/layout.tsx` és a `(public)/hozzaferes-kerese/page.tsx`
 * footer-jén a 4 jogi/segéd-link button-ja, amely a `LegalDialog` 4 tartalmát nyitja.
 *
 * Plus opcionális `extraLeading` prop (pl. "Belépés" link a hozzaferes-kerese page-en).
 */

import { useState, type ReactNode } from 'react'
import { LegalDialog, type LegalKind } from './legal-dialog'

interface AuthFooterLinksProps {
  extraLeading?: ReactNode
}

export function AuthFooterLinks({ extraLeading }: AuthFooterLinksProps) {
  const [openKind, setOpenKind] = useState<LegalKind | null>(null)

  function open(kind: LegalKind) {
    setOpenKind(kind)
  }

  return (
    <>
      <div className="kt-auth-footer-left">
        <svg
          className="kt-auth-footer-cross"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M11 2h2v6h6v2h-6v12h-2V10H5V8h6V2z" />
        </svg>
        {extraLeading}
        <button type="button" className="kt-auth-footer-link" onClick={() => open('privacy')}>
          Adatvédelem
        </button>
        <button type="button" className="kt-auth-footer-link" onClick={() => open('terms')}>
          ÁSZF
        </button>
        <button type="button" className="kt-auth-footer-link" onClick={() => open('help')}>
          Súgó
        </button>
        <button type="button" className="kt-auth-footer-link" onClick={() => open('contact')}>
          Kapcsolat
        </button>
      </div>

      {openKind && (
        <LegalDialog
          open={openKind !== null}
          onOpenChange={(o) => !o && setOpenKind(null)}
          kind={openKind}
        />
      )}
    </>
  )
}
