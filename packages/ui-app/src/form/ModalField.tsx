'use client'

import type { ReactNode } from 'react'
import { cn } from '@kartoteka/ui'

export interface ModalFieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}

export function ModalField({ label, htmlFor, required, hint, children, className }: ModalFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-0.5 text-amber-700">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}
