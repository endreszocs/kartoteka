'use client'

/**
 * Next.js 16 App Router `template.tsx` — Sprint R F4 (v0.8.3).
 *
 * A `template.tsx` minden navigation után UJ komponens-instance-t kap (a
 * `layout.tsx`-szel ellentétben). Ezt használjuk fade + translateY + blur
 * page-transition-höz: minden oldalváltáskor a `PageTransition` újrarenderelődik
 * és lejátssza a `kt-page-enter` keyframe-et.
 *
 * Az animáció 420ms — ha túl agresszívnak érződik, a `kt-page-enter` keyframe
 * `cubic-bezier(.2, .7, .2, 1)` görbéje és időzítése a
 * `packages/ui/src/kartoteka.css`-ben hangolható.
 */

import { PageTransition } from '@kartoteka/ui-app'

export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
