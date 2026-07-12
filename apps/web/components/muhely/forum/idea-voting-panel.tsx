"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock3,
  Heart,
  LoaderCircle,
  Play,
  Sparkles,
  Sprout,
} from "lucide-react";
import { toast } from "sonner";

import {
  startIdeaVoting,
  supportIdea,
} from "@/app/misszios-muhely/community-actions";
import { useRewardCelebration } from "@/components/muhely/rewards/use-reward-celebration";

interface IdeaVotingPanelProps {
  ideaId: string;
  status: string | null;
  supportCount: number;
  mySupport: boolean;
  isOwner: boolean;
  voteStart: string | null;
  voteEnd: string | null;
  serverNow: string;
}

const SUPPORT_GOAL = 5;
const MINUTE = 60_000;
const DAY_IN_MINUTES = 24 * 60;

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getRemainingTime(endTimestamp: number | null, nowTimestamp: number) {
  if (endTimestamp === null || endTimestamp <= nowTimestamp) {
    return { days: 0, hours: 0, minutes: 0 };
  }

  const totalMinutes = Math.ceil((endTimestamp - nowTimestamp) / MINUTE);
  return {
    days: Math.floor(totalMinutes / DAY_IN_MINUTES),
    hours: Math.floor((totalMinutes % DAY_IN_MINUTES) / 60),
    minutes: totalMinutes % 60,
  };
}

function formatVotingDate(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
}

export function IdeaVotingPanel({
  ideaId,
  status,
  supportCount,
  mySupport,
  isOwner,
  voteStart,
  voteEnd,
  serverNow,
}: IdeaVotingPanelProps) {
  const router = useRouter();
  const celebrateReward = useRewardCelebration();
  const [isPending, startTransition] = useTransition();
  const [nowTimestamp, setNowTimestamp] = useState(
    () => parseTimestamp(serverNow) ?? 0,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowTimestamp(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  const normalizedStatus = status || "uj";
  const voteStartTimestamp = parseTimestamp(voteStart);
  const voteEndTimestamp = parseTimestamp(voteEnd);
  const hasVotingWindow =
    voteStartTimestamp !== null && voteEndTimestamp !== null;
  const votingIsActive =
    normalizedStatus === "szavazas" &&
    hasVotingWindow &&
    nowTimestamp >= voteStartTimestamp &&
    nowTimestamp < voteEndTimestamp;
  const votingHasEnded =
    normalizedStatus === "szavazas" &&
    voteEndTimestamp !== null &&
    nowTimestamp >= voteEndTimestamp;
  const votingStartsLater =
    normalizedStatus === "szavazas" &&
    voteStartTimestamp !== null &&
    nowTimestamp < voteStartTimestamp;
  const canManageVoting = isOwner;
  const canStartVoting = normalizedStatus === "uj";
  const safeSupportCount = Math.max(0, supportCount);
  const progressValue = Math.min(safeSupportCount, SUPPORT_GOAL);
  const progressPercent = (progressValue / SUPPORT_GOAL) * 100;
  const remaining = getRemainingTime(voteEndTimestamp, nowTimestamp);
  const remainingSupport = Math.max(SUPPORT_GOAL - safeSupportCount, 0);

  function handleVotingStart() {
    startTransition(async () => {
      const result = await startIdeaVoting(ideaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(
        "Elindult a szavazás!",
        {
          description:
            "A közösségnek 14 napja van, hogy az ötlet mellé álljon.",
        },
      );
      router.refresh();
    });
  }

  function handleSupport() {
    startTransition(async () => {
      const result = await supportIdea(ideaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      router.refresh();
      if (result.promoted) {
        toast.success("Közös alkotássá érett az ötlet!", {
          description:
            "Megérkezett az ötödik támogatás — kezdődhet a közös munka.",
        });
      } else {
        toast.success("Mellé álltál az ötletnek!", {
          description: `${result.supportCount}/${SUPPORT_GOAL} közösségi támogatás összegyűlt.`,
        });
      }
      celebrateReward(result.reward);
    });
  }

  const progressMessage =
    remainingSupport === 0
      ? "A közösségi küszöb teljesült."
      : safeSupportCount === 0
        ? "Az első bátorító jelre vár."
        : `Még ${remainingSupport} támogatás, és kezdődhet a közös alkotás.`;

  return (
    <section
      aria-labelledby="idea-voting-title"
      className="relative isolate overflow-hidden rounded-[1.7rem_1.15rem_1.9rem_1.3rem] border border-[#d7c49f] bg-[linear-gradient(145deg,#fffdf7_0%,#faf1df_55%,#eef2e9_100%)] p-4 shadow-[0_22px_54px_-36px_rgba(63,50,31,.78)] sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-16 -z-10 h-44 w-44 rounded-full bg-[#d3a45e]/15 blur-3xl"
      />
      <Sparkles
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 h-5 w-5 text-[#d3a45e]/70 motion-safe:animate-pulse"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,.75fr)] lg:items-stretch">
        <div className="min-w-0">
          <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[#d8c6a5] bg-[#fffdf7]/85 px-3 py-1 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-[#8b6838] min-[360px]:tracking-[0.13em]">
            <Sprout className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Ötlettől a közös alkotásig
          </div>

          <h2
            id="idea-voting-title"
            className="max-w-2xl font-heading text-2xl leading-tight text-[#26382f] sm:text-3xl"
          >
            Öt szívből jövő igen indítja útjára
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667068] sm:text-base sm:leading-7">
            A támogatás itt nem verseny: annak a jele, hogy mások is szívesen
            dolgoznának ezen a missziós gondolaton.
          </p>

          <div className="mt-5 rounded-[1.2rem_.85rem_1.3rem_.95rem] border border-[#ded0b9] bg-[#fffdf7]/80 p-3.5 sm:p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7c806f]">
                  Közösségi lendület
                </p>
                <p className="mt-1 text-sm font-medium text-[#4f5e53]">
                  {progressMessage}
                </p>
              </div>
              <p className="font-heading text-2xl tabular-nums text-[#9a684c]">
                {safeSupportCount}
                <span className="ml-1 text-sm text-[#7f847b]">
                  / {SUPPORT_GOAL}
                </span>
              </p>
            </div>

            <div
              role="progressbar"
              aria-label="Az öt támogatásból összegyűlt támogatások"
              aria-valuemin={0}
              aria-valuemax={SUPPORT_GOAL}
              aria-valuenow={progressValue}
              className="relative h-3 overflow-hidden rounded-full border border-[#d6c7b0] bg-[#eee5d7]"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#799269,#d3a45e)] shadow-[0_0_16px_rgba(121,146,105,.38)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
              {Array.from({ length: SUPPORT_GOAL }, (_, index) => {
                const reached = index < progressValue;
                return (
                  <span
                    key={index}
                    className={`flex h-7 items-center justify-center rounded-full border transition duration-500 motion-reduce:transition-none ${
                      reached
                        ? "border-[#91a485] bg-[#e8eee3] text-[#59704e] shadow-sm"
                        : "border-[#ded3c2] bg-[#f7f1e7] text-[#b4ab9d]"
                    }`}
                  >
                    {reached ? (
                      <Heart className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Sprout className="h-3.5 w-3.5" />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between rounded-[1.25rem_.9rem_1.4rem_1rem] border border-[#d8cbb8] bg-[#fffdf7]/90 p-4 shadow-[0_16px_34px_-30px_rgba(53,43,30,.78)] sm:p-5">
          <div>
            <div className="flex items-center gap-2 text-[#536a49]">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-[0.12em]">
                {votingIsActive
                  ? "A 14 napos szavazásból hátra"
                  : "Szavazási időszak"}
              </p>
            </div>

            {votingIsActive ? (
              <div
                role="timer"
                aria-label={`${remaining.days} nap, ${remaining.hours} óra, ${remaining.minutes} perc van hátra`}
                className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2"
              >
                {[
                  { value: remaining.days, label: "nap" },
                  { value: remaining.hours, label: "óra" },
                  { value: remaining.minutes, label: "perc" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-xl border border-[#e1d5c4] bg-[#f8f1e6] px-1.5 py-3 text-center"
                  >
                    <strong className="block font-heading text-xl tabular-nums text-[#3c5142] sm:text-2xl">
                      {item.value}
                    </strong>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#85877e]">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex min-h-24 items-center rounded-xl border border-dashed border-[#d8c9b4] bg-[#f8f2e8] px-4 py-3">
                <p className="text-sm leading-6 text-[#687169]">
                  {canStartVoting
                    ? "Egyetlen indítás után pontosan 14 napig gyűlhetnek a támogatások."
                    : votingHasEnded
                      ? "A 14 napos szavazás lezárult; új kör külön döntésig nem indul."
                      : votingStartsLater
                        ? `A szavazás ekkor indul: ${formatVotingDate(voteStart)}.`
                        : "A szavazás időzítése frissítésre vár."}
                </p>
              </div>
            )}

            {votingIsActive && voteEnd && (
              <p className="mt-3 text-center text-xs leading-5 text-[#7b8078]">
                Zárás:{" "}
                <time dateTime={voteEnd}>{formatVotingDate(voteEnd)}</time>
              </p>
            )}
          </div>

          <div className="mt-5 border-t border-dashed border-[#d8cbb8] pt-4">
            {canManageVoting && canStartVoting ? (
              <button
                type="button"
                onClick={handleVotingStart}
                disabled={isPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#9aaa8f] bg-[#617b56] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-16px_rgba(72,96,64,.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#526d49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isPending ? (
                  <LoaderCircle
                    className="h-4 w-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                )}
                {isPending
                  ? "Egy pillanat…"
                  : "Elindítom a 14 napot"}
              </button>
            ) : votingIsActive && !isOwner ? (
              <button
                type="button"
                onClick={handleSupport}
                disabled={isPending || mySupport}
                aria-pressed={mySupport}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold shadow-[0_12px_24px_-18px_rgba(110,65,45,.8)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed motion-reduce:transform-none motion-reduce:transition-none ${
                  mySupport
                    ? "border-[#d3aa99] bg-[#f5e4dd] text-[#99563f] disabled:opacity-100"
                    : "border-[#c37b5c] bg-[#b96749] text-white hover:-translate-y-0.5 hover:bg-[#a75b40] disabled:opacity-60"
                }`}
              >
                {isPending ? (
                  <LoaderCircle
                    className="h-4 w-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Heart
                    className={`h-4 w-4 ${mySupport ? "fill-current" : ""}`}
                    aria-hidden="true"
                  />
                )}
                {isPending
                  ? "Megérkezik a támogatás…"
                  : mySupport
                    ? "Már mellé álltál"
                    : "Mellé állok · +2 pont"}
              </button>
            ) : (
              <p className="rounded-xl border border-[#d8cbb8] bg-[#f8f2e8] px-3 py-2.5 text-center text-sm leading-6 text-[#667067]">
                {votingIsActive && isOwner
                  ? "Most a közösség visszajelzéseit várjuk — ötletgazdaként te vezeted az utat."
                  : votingHasEnded
                    ? "Ez a 14 napos kör lezárult. Az ötlet most lezárt szavazásként marad meg."
                    : "Az ötletgazda hamarosan megnyithatja a 14 napos szavazást."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
