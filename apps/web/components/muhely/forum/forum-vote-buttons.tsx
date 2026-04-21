'use client'

import { useTransition } from 'react'
import { Heart, Users } from 'lucide-react'
import { supportIdea, toggleIdeaJoin } from '@/app/misszios-muhely/community-actions'
import { toast } from 'sonner'

interface ForumVoteButtonsProps {
  ideaId: string
  mySupport: boolean
  myJoin: boolean
  supportCount: number
  joinCount: number
}

export function ForumVoteButtons({ ideaId, mySupport, myJoin, supportCount, joinCount }: ForumVoteButtonsProps) {
  const [isPending, startTransition] = useTransition()

  function handleSupport() {
    startTransition(async () => {
      const result = await supportIdea(ideaId)
      if ('error' in result) toast.error(result.error)
      else toast.success('Köszönjük a támogatásodat!')
    })
  }

  function handleJoin() {
    startTransition(async () => {
      const result = await toggleIdeaJoin(ideaId)
      if ('error' in result) toast.error(result.error)
      else if (result.joined) toast.success('Csatlakoztál!')
      else toast.success('Kiléptél a csapatból.')
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSupport}
        disabled={isPending || mySupport}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
          mySupport
            ? 'bg-rose-50 text-rose-600 border border-rose-200'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300 hover:text-rose-600'
        } disabled:opacity-60`}
      >
        <Heart className={`w-4 h-4 ${mySupport ? 'fill-rose-500 text-rose-500' : ''}`} />
        {mySupport ? 'Támogatod' : 'Támogatom'} ({supportCount})
      </button>

      <button
        onClick={handleJoin}
        disabled={isPending}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
          myJoin
            ? 'bg-violet-50 text-violet-600 border border-violet-200'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-600'
        } disabled:opacity-60`}
      >
        <Users className="w-4 h-4" />
        {myJoin ? 'Csatlakoztál' : 'Csatlakozom'} ({joinCount})
      </button>
    </div>
  )
}
