'use client'

import { Button } from '@/components/ui/button'
import { progColor, progEmoji } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'

interface ProgramListProps {
  events: Program[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleDone: (id: string, done: boolean) => void
}

export function ProgramList({ events, onEdit, onDelete, onToggleDone }: ProgramListProps) {
  if (events.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-3">
        Nincs tervezett program.
      </p>
    )
  }

  return (
    <div className="space-y-1 max-h-60 overflow-y-auto">
      {events.map(e => {
        const d = new Date(e.datum + 'T00:00:00')
        let dateLabel = `${d.getDate()}.`
        if (e.datum_vege && e.datum_vege !== e.datum) {
          const d2 = new Date(e.datum_vege + 'T00:00:00')
          dateLabel += `–${d2.getDate()}.`
        }
        const timeStr = e.ido_kezdes ? e.ido_kezdes.slice(0, 5) : ''

        return (
          <div
            key={e.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer group text-sm"
            onClick={() => onEdit(e.id)}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: progColor(e) }} />
            <span className="text-xs text-muted-foreground w-10 shrink-0">{dateLabel}</span>
            <span className="text-xs">{progEmoji(e)}</span>
            <span className={`flex-1 truncate ${e.teljesitett ? 'line-through text-muted-foreground' : ''}`}>
              {e.cim}
            </span>
            {timeStr && <span className="text-xs text-muted-foreground shrink-0">{timeStr}</span>}

            {/* Akciógombok (hover-re láthatóak) */}
            <div className="hidden group-hover:flex gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                title={e.teljesitett ? 'Visszavonás' : 'Teljesítve'}
                onClick={() => onToggleDone(e.id, !e.teljesitett)}
              >
                {e.teljesitett ? '↩' : '✓'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-xs text-red-500 hover:text-red-700"
                title="Törlés"
                onClick={() => onDelete(e.id)}
              >
                ✕
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
