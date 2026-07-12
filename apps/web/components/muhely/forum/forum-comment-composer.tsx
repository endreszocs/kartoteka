'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { saveIdeaComment } from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { toast } from 'sonner'

interface ForumCommentComposerProps {
  ideaId: string
  parentId?: string | null
  placeholder?: string
  onSubmitted?: () => void
}

export function ForumCommentComposer({ ideaId, parentId, placeholder, onSubmitted }: ForumCommentComposerProps) {
  const celebrateReward = useRewardCelebration()
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!text.trim()) return

    startTransition(async () => {
      const result = await saveIdeaComment(ideaId, text.trim(), parentId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Hozzászólás elküldve!')
        setText('')
        onSubmitted?.()
        celebrateReward(result.reward)
      }
    })
  }

  return (
    <div className="flex items-end gap-2 rounded-[1rem_0.75rem_1.1rem_0.85rem] border border-[#d8cbb8] bg-[#fffdf7] p-2 shadow-[0_8px_22px_-19px_rgba(53,43,31,.8)] focus-within:border-[#9daa8f] focus-within:ring-4 focus-within:ring-[#647a52]/8">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || 'Írj egy hozzászólást...'}
        rows={2}
        aria-label={placeholder || 'Hozzászólás'}
        className="min-h-[52px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-[#26382f] outline-none placeholder:text-[#999d94]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !text.trim()}
        className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#314b3b] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#26382f] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
        aria-label={isPending ? 'Hozzászólás küldése folyamatban' : 'Hozzászólás elküldése'}
        title="Küldés (Enter)"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
