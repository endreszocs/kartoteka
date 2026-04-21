'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { ForumVoteButtons } from './forum-vote-buttons'
import { ForumCommentComposer } from './forum-comment-composer'
import { getIdeaComments } from '@/app/misszios-muhely/community-actions'
import { MessageCircle, User } from 'lucide-react'
import { ProjectPanel } from '@/components/muhely/project/project-panel'

interface Comment {
  id: string
  otlet_id: string
  user_id: string
  user_nev: string | null
  user_gyulekezet: string | null
  szoveg: string
  szulo_id: string | null
  created_at: string
}

interface ForumThreadViewProps {
  idea: {
    id: string
    cim: string
    leiras: string
    celcsoport: string | null
    statusz: string | null
    tamogatasok_szama: number | null
    csatlakozok_szama: number | null
    hozzaszolasok_szama: number | null
    otletgazda_nev: string | null
    otletgazda_gyulekezet: string | null
    created_at: string
    mySupport: boolean
    myJoin: boolean
    mm_otlet_kategoriak: {
      kategoria_id: number
      mm_kategoriak: { nev: string; szin: string } | null
    }[]
  }
  // D1 — projekt-réteg props (opcionális, alapértelmezett fallback)
  currentUserId?: string | null
  isOwner?: boolean
  isMember?: boolean
  isAdmin?: boolean
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uj: { label: 'Új ötlet', color: 'bg-sky-50 text-sky-700' },
  szavazas: { label: 'Szavazás alatt', color: 'bg-amber-50 text-amber-700' },
  kozos_munka: { label: 'Közös munka', color: 'bg-violet-50 text-violet-700' },
  megvalosult: { label: 'Megvalósult', color: 'bg-emerald-50 text-emerald-700' },
  archivalt: { label: 'Archivált', color: 'bg-slate-50 text-slate-500' },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CommentCard({ comment, depth = 0, allComments, ideaId }: {
  comment: Comment
  depth?: number
  allComments: Comment[]
  ideaId: string
}) {
  const [replying, setReplying] = useState(false)
  const replies = allComments.filter((c) => c.szulo_id === comment.id)
  const maxDepth = 2

  return (
    <div className={`${depth > 0 ? 'ml-6 pl-4 border-l-2 border-slate-100' : ''}`}>
      <div className="rounded-xl bg-white/60 p-4 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <span className="text-sm font-medium text-slate-700">{comment.user_nev || 'Ismeretlen'}</span>
          {comment.user_gyulekezet && (
            <span className="text-xs text-slate-400">· {comment.user_gyulekezet}</span>
          )}
          <span className="text-xs text-slate-400 ml-auto">{formatDate(comment.created_at)}</span>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{comment.szoveg}</p>
        {depth < maxDepth && (
          <button
            onClick={() => setReplying(!replying)}
            className="text-xs text-violet-500 hover:text-violet-700 mt-2 font-medium"
          >
            Válasz
          </button>
        )}
      </div>

      {replying && (
        <div className="ml-6 mb-3">
          <ForumCommentComposer
            ideaId={ideaId}
            parentId={comment.id}
            placeholder="Válaszolj..."
            onSubmitted={() => setReplying(false)}
          />
        </div>
      )}

      {replies.map((reply) => (
        <CommentCard
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          allComments={allComments}
          ideaId={ideaId}
        />
      ))}
    </div>
  )
}

export function ForumThreadView({
  idea,
  currentUserId = null,
  isOwner = false,
  isMember = false,
  isAdmin = false,
}: ForumThreadViewProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [, startTransition] = useTransition()

  const loadComments = useCallback(() => {
    startTransition(async () => {
      const result = await getIdeaComments(idea.id)
      if ('data' in result) setComments(result.data || [])
    })
  }, [idea.id])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  const status = STATUS_MAP[idea.statusz || 'uj'] || STATUS_MAP.uj
  const categories = idea.mm_otlet_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; szin: string }[]

  const rootComments = comments.filter((c) => !c.szulo_id)

  return (
    <div className="space-y-6">
      {/* Thread header */}
      <div className="rounded-2xl bg-white/90 border border-white/60 shadow-sm p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
            {status.label}
          </span>
          {idea.celcsoport && (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
              {idea.celcsoport}
            </span>
          )}
          {categories.map((cat) => (
            <span key={cat.nev} className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 text-xs font-medium">
              {cat.nev}
            </span>
          ))}
        </div>

        <h1 className="font-heading text-2xl sm:text-3xl text-slate-800 mb-3">{idea.cim}</h1>

        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line mb-4">
          {idea.leiras}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            {idea.otletgazda_nev || 'Ismeretlen'}
            {idea.otletgazda_gyulekezet && ` · ${idea.otletgazda_gyulekezet}`}
            {' · '}
            {formatDate(idea.created_at)}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <ForumVoteButtons
        ideaId={idea.id}
        mySupport={idea.mySupport}
        myJoin={idea.myJoin}
        supportCount={idea.tamogatasok_szama || 0}
        joinCount={idea.csatlakozok_szama || 0}
      />

      {/* D1 — Közös Munka projekt-réteg (csak kozos_munka/megvalosult státuszban) */}
      <ProjectPanel
        ideaId={idea.id}
        ideaStatus={idea.statusz}
        currentUserId={currentUserId}
        isOwner={isOwner}
        isMember={isMember}
        isAdmin={isAdmin}
      />

      {/* Comments section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-violet-500" />
          <h2 className="font-semibold text-slate-800">
            Hozzászólások ({comments.length})
          </h2>
        </div>

        <div className="space-y-1 mb-6">
          {rootComments.length === 0 && (
            <p className="text-sm text-slate-400 italic py-6 text-center">
              Még nincsenek hozzászólások — légy te az első!
            </p>
          )}
          {rootComments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              allComments={comments}
              ideaId={idea.id}
            />
          ))}
        </div>

        <ForumCommentComposer
          ideaId={idea.id}
          placeholder="Szólj hozzá a beszélgetéshez..."
          onSubmitted={loadComments}
        />
      </div>
    </div>
  )
}
