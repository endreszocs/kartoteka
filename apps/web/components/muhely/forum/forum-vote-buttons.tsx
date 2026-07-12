"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PartyPopper, Sprout, Users } from "lucide-react";
import { toast } from "sonner";

import { toggleIdeaJoin } from "@/app/misszios-muhely/community-actions";
import { useRewardCelebration } from "@/components/muhely/rewards/use-reward-celebration";

interface ForumVoteButtonsProps {
  ideaId: string;
  status: string | null;
  myJoin: boolean;
  joinCount: number;
  isOwner?: boolean;
}

export function ForumVoteButtons({
  ideaId,
  status,
  myJoin,
  joinCount,
  isOwner = false,
}: ForumVoteButtonsProps) {
  const router = useRouter();
  const celebrateReward = useRewardCelebration();
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      const result = await toggleIdeaJoin(ideaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      router.refresh();
      if (result.joined) {
        toast.success("Helyet foglaltál az alkotókörben!", {
          description: "Mostantól együtt formálhatjátok valósággá az ötletet.",
        });
        celebrateReward(result.reward);
      } else {
        toast.success("Kiléptél a csapatból.");
      }
    });
  }

  if (status === "megvalosult") {
    return (
      <div className="relative isolate flex min-h-24 w-full flex-col justify-center overflow-hidden rounded-[1.25rem_.9rem_1.4rem_1rem] border border-[#aebda5] bg-[linear-gradient(135deg,#edf3e9,#fffaf0)] px-4 py-4 text-[#405d3e] shadow-[0_14px_30px_-26px_rgba(57,81,51,.8)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
        <Sprout
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-3 -z-10 h-24 w-24 rotate-[-12deg] text-[#6d8660]/10"
        />
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#aebda5] bg-[#fffdf7] shadow-sm">
            <PartyPopper
              className="h-5 w-5 text-[#b3764e]"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg leading-6 text-[#31503a]">
              Ez az ötlet már gyümölcsöt termett
            </p>
            <p className="mt-1 text-sm leading-6 text-[#647366]">
              {isOwner
                ? "Ötletgazdaként te indítottad el ezt a közös történetet."
                : myJoin
                  ? "Te is részese voltál a megvalósító csapatnak."
                  : "A műhely közössége együtt vitte el a megvalósulásig."}
            </p>
          </div>
        </div>
        <span className="mt-3 self-start rounded-full border border-[#b6c4ae] bg-[#fffdf7]/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#526943] sm:mt-0 sm:self-center">
          {joinCount} csatlakozó
        </span>
      </div>
    );
  }

  if (isOwner) {
    return (
      <div className="flex min-h-20 w-full items-start gap-3 rounded-[1.2rem_.9rem_1.3rem_1rem] border border-[#bdc9b5] bg-[#edf2e9] px-4 py-3.5 text-sm leading-6 text-[#526943] sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#bdc9b5] bg-[#fffdf7]">
          <Sprout className="h-5 w-5" aria-hidden="true" />
        </span>
        <span>
          <strong className="block text-[#405a3c]">
            Te tartod kézben az ötlet fonalát.
          </strong>
          Ötletgazdaként automatikusan a csapat része vagy · {joinCount} ember
          csatlakozott melléd.
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-[1.2rem_.9rem_1.3rem_1rem] border border-[#dfd2be] bg-[#f4ebdd]/75 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d5c7b3] bg-[#fffdf7] text-[#647a52] shadow-sm">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-base text-[#31443a] sm:text-lg">
            Nyitott alkotókör
          </p>
          <p className="text-sm leading-5 text-[#70776e]">
            {joinCount} csatlakozó · bármikor helyet foglalhatsz közöttük
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleJoin}
        disabled={isPending}
        aria-pressed={myJoin}
        className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto motion-reduce:transform-none motion-reduce:transition-none ${
          myJoin
            ? "border-[#aebda5] bg-[#e8efe3] text-[#526943] hover:-translate-y-0.5 hover:bg-[#dfe9d9]"
            : "border-[#78906c] bg-[#617b56] text-white hover:-translate-y-0.5 hover:bg-[#526d49]"
        }`}
      >
        {isPending ? (
          <LoaderCircle
            className="h-4 w-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Users className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending
          ? "Egy pillanat…"
          : myJoin
            ? "Kilépek a csapatból"
            : "Csatlakozom · +5 pont"}
      </button>
    </div>
  );
}
