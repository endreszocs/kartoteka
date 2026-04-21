import { cn } from '@/lib/utils'

interface ModalFieldProps {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

export function ModalField({ label, required, hint, children, className }: ModalFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-amber-700 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}
