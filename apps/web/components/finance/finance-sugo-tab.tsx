'use client'

/**
 * Webes Pénzügy-Súgó belépési pont.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.3): a vizuális réteg + a checklist átkerült
 * a `@kartoteka/ui-app/finance` shared package-be (FinanceSugoTab +
 * FinanceSugoChecklist komponensek). A wrapper a webes oldalon a
 * print engine-t (`print-engine-v2.ts` + `guide-pdfs.ts`) köti be a callback
 * prop-okra, és a `sonner` toast-ot biztosítja. A `finalizeHref` a webes
 * routing-on alapul.
 *
 * A shared komponens platform-független — desktop (Tauri) és iOS
 * (Tauri-mobile) oldalon ugyanaz a komponens fut, csak a print/toast
 * implementáció cserélődik a wrapperben.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-08-11 (K5 #5): A SÚGÓ SZÉTCSÚSZÁSÁNAK JAVÍTÁSA.
 *
 * Mi volt a hiba: ezt a wrappert SENKI nem importálta (halott kód volt), a
 * `finance-tabs.tsx` helyette egy teljesen független, webes-only súgó-doksit
 * (`penzugy-help.tsx`) mountolt. Következmény: a desktop és a web súgója némán
 * szétfejlődött, és a WEBRŐL HIÁNYZOTT az élő év végi zárási checklist
 * (FinanceSugoChecklist) a „Véglegesítés indítása" ugrópontjával — a lelkész
 * desktopon látta, weben nem.
 *
 * Döntés (EGY tulajdonos a modul-kalauzra): a modul működését leíró súgó
 * egyetlen igazság-forrása mostantól a MEGOSZTOTT `FinanceSugoTab` — web és
 * desktop is ezt rendereli, tehát egy javítás mindkét kliensre érvényes.
 *
 * Miért maradt meg a `penzugy-help.tsx` külön nézetként (és NEM olvadt bele
 * az `extraSections` prop-ba, ahogy a desktop az offline-fejezetét beadja):
 * a webes doksi tartalma MÁS MŰFAJ — az EREK hivatalos szabálykönyve
 * (teljes 101–105 / 201–205 / 106–107 / 206–207 kódtáblázatok, pénzügyi
 * vizsgálat irat-listája, készpénz-szabályok). A shared `Topic` típus csak
 * szöveges lépéseket/tippeket/példákat ismer, TÁBLÁZATOT nem — a kódlisták
 * `Step[]`-be gyúrása egyszerre rontaná a használhatóságot és kockáztatná a
 * hivatalos könyvelési kódok kézi átgépelésénél az elírást. Ezért a webes
 * fejezetek VÁLTOZATLANUL megmaradnak, csak egy kapcsolóval választhatók.
 * (A shared `Topic` táblázat-támogatása a `@kartoteka/ui-app` kiterjesztését
 * igényelné — az egy külön, önálló lépés.)
 */

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { BookOpen, Scale } from 'lucide-react'

import { toast } from 'sonner'

import {
  FinanceSugoTab as SharedFinanceSugoTab,
  type FinanceSugoTopicPdfData,
} from '@kartoteka/ui-app'

import { buildTopicPdfHtml } from '@/lib/finance/guide-pdfs'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

// A webes EREK-szabálykönyv csak akkor töltődik le, ha a felhasználó tényleg
// átvált rá — a Súgó fül kezdeti JS-bundle-je így nem nő meg.
const PenzugyHelp = dynamic(() => import('./penzugy-help').then((m) => m.PenzugyHelp), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-muted" />,
})

type SugoView = 'kalauz' | 'erek'

const VIEWS: Array<{ key: SugoView; label: string; hint: string; icon: typeof BookOpen }> = [
  {
    key: 'kalauz',
    label: 'Modul-kalauz',
    hint: 'Hogyan használd a Pénzügy modult + év végi checklist',
    icon: BookOpen,
  },
  {
    key: 'erek',
    label: 'EREK szabályok',
    hint: 'Hivatalos kódlisták, vizsgálati iratok, készpénz-szabályok',
    icon: Scale,
  },
]

export function FinanceSugoTab() {
  const [view, setView] = useState<SugoView>('kalauz')

  return (
    <div className="space-y-4">
      {/* Nézetválasztó — a két súgó-műfaj között vált. */}
      <div
        role="tablist"
        aria-label="Súgó nézetek"
        className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-2 ring-1 ring-border sm:flex-row"
      >
        {VIEWS.map((v) => {
          const isActive = v.key === view
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setView(v.key)}
              className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60'
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                  isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <v.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{v.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{v.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {view === 'kalauz' ? (
        <SharedFinanceSugoTab
          // 2026-08-11 (K5 #5): a `?tab=accounting` forma HALOTT — a `/penzugy`
          // oldal kizárólag a `#hash`-t olvassa (finance-tabs.tsx applyHashToTab),
          // a `tab` query-paramétert soha senki nem dolgozza fel. A checklist
          // „Véglegesítés indítása" linkje eddig a Dashboard fülön kötött ki.
          finalizeHref="/penzugy#accounting"
          onPrintTopicToBrowser={async (topicData: FinanceSugoTopicPdfData) => {
            const html = buildTopicPdfHtml(topicData)
            await printToBrowser(html)
          }}
          onPrintTopicToPdf={async (topicData: FinanceSugoTopicPdfData, filename: string) => {
            const html = buildTopicPdfHtml(topicData)
            await printToPdf(html, filename, {
              orientation: 'portrait',
              margin: [15, 15],
              format: 'a4',
            })
          }}
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
        />
      ) : (
        <PenzugyHelp />
      )}
    </div>
  )
}
