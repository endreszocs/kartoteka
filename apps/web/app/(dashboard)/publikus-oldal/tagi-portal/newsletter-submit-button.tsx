"use client";

import { LoaderCircle, Send, XCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

type NewsletterSubmitTone = "sky" | "emerald" | "rose";

interface NewsletterSubmitButtonProps {
  idleLabel: string;
  pendingLabel: string;
  tone: NewsletterSubmitTone;
}

const TONE_CLASSES: Record<NewsletterSubmitTone, string> = {
  sky: "bg-sky-700 text-white hover:bg-sky-800 focus-visible:ring-sky-600/25",
  emerald:
    "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600/25",
  rose: "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 focus-visible:ring-rose-500/20 sm:self-end",
};

/**
 * A közvetlen szülő form Server Actionjének állapotát jelzi. A gomb
 * letiltása megakadályozza ugyanannak a hírlevélműveletnek a többszörös
 * elküldését, miközben a felirat képernyőolvasóval is frissül.
 */
export function NewsletterSubmitButton({
  idleLabel,
  pendingLabel,
  tone,
}: NewsletterSubmitButtonProps) {
  const { pending } = useFormStatus();
  const IdleIcon = tone === "rose" ? XCircle : Send;

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-wait disabled:opacity-70",
        TONE_CLASSES[tone],
      )}
    >
      {pending ? (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <IdleIcon className="size-4" aria-hidden="true" />
      )}
      <span aria-live="polite">{pending ? pendingLabel : idleLabel}</span>
    </button>
  );
}
