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
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="font-heading text-xl text-slate-700 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
