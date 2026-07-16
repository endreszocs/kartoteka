import { Inbox } from 'lucide-react'

interface MuhelyEmptyStateProps {
  icon?: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
}

export function MuhelyEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: MuhelyEmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[2rem_1.4rem_2rem_1.6rem] border border-dashed border-[#cdbfa9] bg-[#fffdf7]/80 px-6 py-16 text-center">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#d3a45e]/10 blur-2xl" aria-hidden="true" />
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#d8c7a9] bg-[#f4ebdd] shadow-[0_8px_22px_-15px_rgba(72,57,39,0.7)]">
        <Icon className="h-7 w-7 text-[#647a52]" />
      </div>
      <h3 className="mb-2 font-heading text-2xl text-[#26382f]">{title}</h3>
      <p className="max-w-md text-sm leading-6 text-[#687066]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
