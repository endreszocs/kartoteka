'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { saveIdeaComment } from '@/app/misszios-muhely/community-actions'
import { toast } from 'sonner'

interface ForumCommentComposerProps {
  ideaId: string
  parentId?: string | null
  placeholder?: string
  onSubmitted?: () => void
}

export function ForumCommentComposer({ ideaId, parentId, placeholder, onSubmitted }: ForumCommentComposerProps) {
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
      }
    })
  }

  return (
    <div className="flex items-end gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || 'Írj egy hozzászólást...'}
        rows={2}
        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isPending || !text.trim()}
        className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  )
}
