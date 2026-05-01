/**
 * BottomVerse — fix igeszakasz csík a dashboard-layout aljára.
 *
 * Sablon (`shared/shell.jsx → BottomVerse`) szerint:
 * - 14×32 padding, justify-between flex
 * - Bal: idéző-ikon + igeszakasz idézet (font-display, italic)
 * - Jobb: "Segítség és támogatás" gomb (csak desktop)
 *
 * A jelenlegi rendszerben a Help-gomb már a header-en van, így itt
 * csak az ige-csík marad. A `mut.muted` halvány, hogy ne vonja el a
 * figyelmet a fő tartalomtól.
 */

import { Quote } from 'lucide-react'

const VERSE = {
  text: '„Én veled vagyok minden napon a világ végezetéig."',
  ref: 'Máté 28,20',
}

export function BottomVerse() {
  return (
    <div
      className="hidden shrink-0 items-center gap-3.5 border-t border-border bg-background/40 px-7 py-3.5 text-muted-foreground sm:flex"
      aria-label="Napi igeszakasz"
    >
      <Quote
        className="size-[18px] shrink-0 opacity-70"
        style={{ color: 'var(--accent)' }}
      />
      <div className="min-w-0 flex-1 truncate">
        <span
          className="font-heading text-[14px] italic text-foreground/82"
        >
          {VERSE.text}
        </span>
        <span className="ml-2.5 text-[11.5px] text-muted-foreground">
          {VERSE.ref}
        </span>
      </div>
    </div>
  )
}
