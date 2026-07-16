"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { ForumVoteButtons } from "./forum-vote-buttons";
import { IdeaVotingPanel } from "./idea-voting-panel";
import { ForumCommentComposer } from "./forum-comment-composer";
import { getIdeaComments } from "@/app/misszios-muhely/community-actions";
import { MessageCircle, Quote, Sprout, User } from "lucide-react";
import { ProjectPanel } from "@/components/muhely/project/project-panel";

interface Comment {
  id: string;
  otlet_id: string;
  user_id: string;
  user_nev: string | null;
  user_gyulekezet: string | null;
  szoveg: string;
  szulo_id: string | null;
  created_at: string;
}

interface ForumThreadViewProps {
  idea: {
    id: string;
    cim: string;
    leiras: string;
    celcsoport: string | null;
    statusz: string | null;
    tamogatasok_szama: number | null;
    csatlakozok_szama: number | null;
    hozzaszolasok_szama: number | null;
    szavazas_kezdete: string | null;
    szavazas_vege: string | null;
    otletgazda_nev: string | null;
    otletgazda_gyulekezet: string | null;
    created_at: string;
    mySupport: boolean;
    myJoin: boolean;
    mm_otlet_kategoriak: {
      kategoria_id: number;
      mm_kategoriak: { nev: string; szin: string } | null;
    }[];
  };
  // D1 — projekt-réteg props (opcionális, alapértelmezett fallback)
  currentUserId?: string | null;
  isOwner?: boolean;
  isMember?: boolean;
  isAdmin?: boolean;
  serverNow: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uj: {
    label: "Friss hajtás",
    color: "border-[#bdc9b5] bg-[#edf2e9] text-[#526943]",
  },
  szavazas: {
    label: "Körbejárjuk",
    color: "border-[#dfc48f] bg-[#fbf0d8] text-[#8c6634]",
  },
  kozos_munka: {
    label: "Közös alkotás",
    color: "border-[#d8ab98] bg-[#f6e6df] text-[#99563f]",
  },
  megvalosult: {
    label: "Gyümölcsöt termett",
    color: "border-[#99ae8d] bg-[#e6eee1] text-[#405d3e]",
  },
  archivalt: {
    label: "Eltettük későbbre",
    color: "border-[#d6d1c8] bg-[#f2efe9] text-[#74746e]",
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CommentCard({
  comment,
  depth = 0,
  allComments,
  ideaId,
}: {
  comment: Comment;
  depth?: number;
  allComments: Comment[];
  ideaId: string;
}) {
  const [replying, setReplying] = useState(false);
  const replies = allComments.filter((c) => c.szulo_id === comment.id);
  const maxDepth = 2;

  return (
    <div
      className={`${depth > 0 ? "ml-3 border-l border-dashed border-[#aebba4] pl-3 sm:ml-7 sm:pl-5" : ""}`}
    >
      <article className="mb-2 rounded-[1rem_0.8rem_1.1rem_0.85rem] border border-[#ded2c0] bg-[#fffdf7] p-4 shadow-[0_8px_22px_-20px_rgba(52,43,31,.75)]">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c9b4] bg-[#f4ebdd]">
            <User className="h-3.5 w-3.5 text-[#647a52]" />
          </div>
          <span className="min-w-0 max-w-[8rem] truncate text-sm font-semibold text-[#35443a] sm:max-w-[14rem]">
            {comment.user_nev || "Ismeretlen"}
          </span>
          {comment.user_gyulekezet && (
            <span className="max-w-[7rem] truncate text-xs text-[#7f847b] sm:max-w-none">
              · {comment.user_gyulekezet}
            </span>
          )}
          <time
            dateTime={comment.created_at}
            className="ml-auto shrink-0 text-[10px] text-[#878b82] sm:text-xs"
          >
            {formatDate(comment.created_at)}
          </time>
        </div>
        <p className="whitespace-pre-line pl-10 text-sm leading-7 text-[#5d665e]">
          {comment.szoveg}
        </p>
        {depth < maxDepth && (
          <button
            type="button"
            onClick={() => setReplying(!replying)}
            aria-expanded={replying}
            className="ml-10 mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[#9a684c] underline decoration-transparent underline-offset-4 transition hover:decoration-[#d2b397] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60"
          >
            {replying ? "Mégse" : "Válaszolok"}
          </button>
        )}
      </article>

      {replying && (
        <div className="mb-3 ml-3 sm:ml-7">
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
  );
}

export function ForumThreadView({
  idea,
  currentUserId = null,
  isOwner = false,
  isMember = false,
  isAdmin = false,
  serverNow,
}: ForumThreadViewProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsPending, startTransition] = useTransition();

  const loadComments = useCallback(() => {
    startTransition(async () => {
      const result = await getIdeaComments(idea.id);
      if ("data" in result) setComments(result.data || []);
    });
  }, [idea.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const normalizedStatus = idea.statusz || "uj";
  const status = STATUS_MAP[normalizedStatus] || STATUS_MAP.uj;
  const categories = idea.mm_otlet_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; szin: string }[];

  const rootComments = comments.filter((c) => !c.szulo_id);

  return (
    <div className="space-y-7">
      {/* Thread header */}
      <article className="relative isolate overflow-hidden rounded-[2rem_1.4rem_2.2rem_1.5rem] border border-[#d7c7b0] bg-[#fffdf7] p-5 shadow-[0_20px_48px_-30px_rgba(53,43,30,.75)] sm:p-8">
        <div
          className="pointer-events-none absolute -right-10 -top-12 -z-10 h-44 w-44 rounded-full bg-[#d3a45e]/10 blur-3xl"
          aria-hidden="true"
        />
        <Sprout
          className="pointer-events-none absolute -bottom-7 -right-2 -z-10 h-36 w-36 rotate-[-14deg] text-[#647a52]/[0.07]"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${status.color}`}
          >
            {status.label}
          </span>
          {idea.celcsoport && (
            <span className="rounded-full border border-[#dfc99e] bg-[#fbf1dc] px-2.5 py-1 text-xs font-medium text-[#8c683b]">
              {idea.celcsoport}
            </span>
          )}
          {categories.map((cat) => (
            <span
              key={cat.nev}
              className="rounded-full border border-[#d8c9d7] bg-[#f2edf2] px-2.5 py-1 text-xs font-medium text-[#735f73]"
            >
              {cat.nev}
            </span>
          ))}
        </div>

        <h1 className="mb-4 max-w-4xl font-heading text-3xl leading-tight text-[#26382f] sm:text-4xl">
          {idea.cim}
        </h1>

        <p className="mb-6 max-w-4xl whitespace-pre-line text-sm leading-7 text-[#59635b] sm:text-base sm:leading-8">
          {idea.leiras}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#d8cbb8] pt-4">
          <span className="text-sm text-[#70776e]">
            {idea.otletgazda_nev || "Ismeretlen"}
            {idea.otletgazda_gyulekezet && ` · ${idea.otletgazda_gyulekezet}`}
            {" · "}
            {formatDate(idea.created_at)}
          </span>
          <Quote className="h-5 w-5 text-[#d3a45e]" aria-hidden="true" />
        </div>
      </article>

      {(normalizedStatus === "uj" || normalizedStatus === "szavazas") && (
        <IdeaVotingPanel
          ideaId={idea.id}
          status={normalizedStatus}
          supportCount={idea.tamogatasok_szama || 0}
          mySupport={idea.mySupport}
          isOwner={isOwner}
          voteStart={idea.szavazas_kezdete}
          voteEnd={idea.szavazas_vege}
          serverNow={serverNow}
        />
      )}

      {(normalizedStatus === "kozos_munka" ||
        normalizedStatus === "megvalosult") && (
        <ForumVoteButtons
          ideaId={idea.id}
          status={normalizedStatus}
          myJoin={idea.myJoin}
          joinCount={idea.csatlakozok_szama || 0}
          isOwner={isOwner}
        />
      )}

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
      <section
        className="rounded-[1.8rem_1.25rem_2rem_1.4rem] border border-[#d9cab4] bg-[#f7f0e5]/80 p-4 sm:p-6"
        aria-labelledby="comments-title"
        aria-busy={commentsPending}
      >
        <div className="mb-5 flex items-center gap-3 border-b border-dashed border-[#d8cbb8] pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c9b4] bg-[#fffdf7]">
            <MessageCircle className="h-4 w-4 text-[#647a52]" />
          </div>
          <h2
            id="comments-title"
            className="font-heading text-xl text-[#26382f]"
          >
            Hozzászólások ({comments.length})
          </h2>
        </div>

        <div className="mb-6 space-y-1">
          {rootComments.length === 0 && (
            <p className="py-8 text-center font-heading text-lg italic text-[#858a80]">
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
      </section>
    </div>
  );
}
