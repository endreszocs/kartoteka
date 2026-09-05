'use client'

/**
 * ÜZENET-TÖRZS (2026-09-05) — EGY helyen: markdown-HTML, sima szöveg
 * autolinkkel, „Teendő" doboz, „Tovább / Kevesebb".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A HÍRLEVÉL NYERS MARKDOWNJA (P1) — MIÉRT ITT SZŰNIK MEG
 * ════════════════════════════════════════════════════════════════════════════
 * A rendszergazdai hírlevél törzse markdown, amit eddig a csengő, a részletes
 * ablak és az értesítések oldala mind szó szerint mutatott (`## …`, `**…**`).
 * A renderelés a SZERVEREN történik (`lib/notifications/ertesites-render.ts`,
 * marked + sanitize-html, szűk engedélylista), a kliens KÉSZ, megtisztított
 * HTML-t kap az `uzenetHtml` mezőben.
 *
 * ⛔ A `dangerouslySetInnerHTML` KIZÁRÓLAG az `uzenetHtml`-t kaphatja meg —
 *    a nyers `uzenet` SOHA. A felhasználói szabad szöveget hordozó üzenetek
 *    (elutasítás indoklása, átjelentkezési megjegyzés) `uzenetHtml: null`-lal
 *    érkeznek, és escape-elt szövegként, sortörésekkel, http(s)-autolinkkel
 *    jelennek meg — React-csomópontokból, HTML-építés nélkül. A
 *    `scripts/selftest-ertesites-nezet.mjs` forrás-őre ezt a kaput őrzi.
 *
 * A tipográfia a `.uzenet-torzs`-nek szánt szabályok Tailwind-változata
 * (`[&_h2]:…`), mert a sanitizer NEM enged `class`-t a HTML-ben — a stílus
 * kizárólag a konténeré.
 */

import { useState } from 'react'
import { Wrench } from 'lucide-react'

import { autolinkTokenek, hosszuUzenetE, torzsEsTeendo } from '@/lib/notifications/beszelgetesek'
import type { UzenetSor } from '@/lib/notifications/uzenetek-shared'
import { cn } from '@/lib/utils'

/** A megtisztított HTML tipográfiája — csak a konténeren, mert a HTML-ben nincs class. */
const HTML_TIPOGRAFIA = cn(
  'text-sm leading-relaxed text-foreground',
  '[&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2:first-child]:mt-0',
  '[&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3:first-child]:mt-0',
  '[&_h4]:mt-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4:first-child]:mt-0',
  '[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]',
  '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words dark:[&_a]:text-foreground',
)

export function UzenetTorzs({
  sor,
  className,
}: {
  sor: Pick<UzenetSor, 'uzenet' | 'uzenetHtml' | 'uzenetFormat'>
  className?: string
}) {
  const [kibontva, setKibontva] = useState(false)
  const hosszu = hosszuUzenetE(sor.uzenet)
  const osszecsukva = hosszu && !kibontva

  // ⚠️ FAIL-CLOSED: csak a szerver által renderelt HTML mehet HTML-ként.
  const html = typeof sor.uzenetHtml === 'string' && sor.uzenetHtml.length > 0 ? sor.uzenetHtml : null

  return (
    <div className={cn('min-w-0', className)}>
      {html ? (
        <div
          className={cn(HTML_TIPOGRAFIA, 'break-words', osszecsukva && 'line-clamp-6')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <SzovegTorzs uzenet={sor.uzenet} osszecsukva={osszecsukva} />
      )}

      {hosszu ? (
        <button
          type="button"
          onClick={() => setKibontva((v) => !v)}
          aria-expanded={kibontva}
          /* 44 px érintőfelület — a lelkész telefonon olvas. */
          className="-ml-1 mt-0.5 inline-flex min-h-11 items-center rounded px-1 text-[12.5px] font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
        >
          {kibontva ? 'Kevesebb' : 'Tovább'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Sima szöveg: escape-elt (a React teszi), sortörésekkel, http(s)-autolinkkel;
 * a „Teendő:" sor külön dobozba kerül — a lelkész első kérdése nem az, hogy mi
 * történt, hanem hogy MIT TEGYEK.
 */
function SzovegTorzs({ uzenet, osszecsukva }: { uzenet: string; osszecsukva: boolean }) {
  const { torzs, teendo } = torzsEsTeendo(uzenet)
  return (
    <>
      {torzs ? (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
            osszecsukva && 'line-clamp-6',
          )}
        >
          {autolinkTokenek(torzs).map((t, i) =>
            t.tipus === 'link' ? (
              <a
                // A kulcs a pozíció + a link szövege: a tokenlista a törzsből
                // determinisztikusan áll elő, nem gépelés közben változik.
                key={`${i}-${t.ertek}`}
                href={t.ertek}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2 break-all dark:text-foreground"
              >
                {t.ertek}
              </a>
            ) : (
              <span key={`${i}-sz`}>{t.ertek}</span>
            ),
          )}
        </p>
      ) : null}

      {teendo && !osszecsukva ? <TeendoDoboz teendo={teendo} /> : null}
    </>
  )
}

export function TeendoDoboz({ teendo }: { teendo: string }) {
  return (
    <div className="mt-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Wrench className="size-3.5" aria-hidden />
        Mit tegyek?
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{teendo}</p>
    </div>
  )
}
