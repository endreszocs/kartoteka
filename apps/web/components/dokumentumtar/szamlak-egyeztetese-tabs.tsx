'use client'

/**
 * Számlák egyeztetése — hub-oldal három füllel (Endre 2026-08-15).
 *
 * Endre szó szerinti kérése: „az oblio ellenőrzés helyén a webes felületnél
 * legyen az hogy számlák egyeztetése és ott legyen a mostani dokumentumtár
 * mert az nem egyértelmű! Ott legyen visszalépő gomb és legyen egyértelmű
 * oblió fájlok feltöltésére alkalmas sablon felület! ami már élt a
 * rendszerben is!"
 *
 * Ezért:
 *  - FELÜL jól látható visszalépő gomb („← Vissza a Pénzügyhöz"),
 *  - a cím „Számlák egyeztetése", rövid magyarázattal,
 *  - HÁROM fül (a finance-tabs.tsx ColorTabs-mintájával):
 *      (a) „Oblio egyeztetés" — a MEGLÉVŐ OblioEllenorzesTab (a megszokott,
 *          sablonos Oblio-feltöltő felület, ami a /penzugy modáljában élt),
 *      (b) „Dokumentumtár" — a gyülekezeti fájl-terület (DokumentumtarMain),
 *      (c) „Kifizetetlen számlák" — a kifizetetlen-nézet (KifizetetlenMain).
 *  - alapértelmezett fül az Oblio egyeztetés — Endre ezt a felületet kérte
 *    vissza kiemelt helyre.
 *
 * A fülek dynamic importtal töltődnek (a finance-tabs mintája): az inaktív
 * fül kódja le sem töltődik, a base-ui Tabs.Panel (keepMounted=false) nem
 * rendereli. Hash-navigáció: #oblio / #dokumentumtar / #kifizetetlen — a
 * régi /penzugy#oblio_ellenorzes könyvjelzők átirányítása is ide fut be.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Building2, FileCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ColorTabs } from '@/components/ui/color-tabs'
import { ModuleHero } from '@/components/shared/module-hero'
import { slugifyCongregationName } from '@/lib/utils/slugify'

const tabLoading = () => <div className="mt-4 h-64 animate-pulse rounded-2xl bg-slate-100" />
// A MEGLÉVŐ komponensek élnek tovább — nem másolat készült (Endre kérése).
const OblioEllenorzesTab = dynamic(
  () => import('@/components/finance/oblio-ellenorzes-tab').then((m) => m.OblioEllenorzesTab),
  { ssr: false, loading: tabLoading },
)
const DokumentumtarMain = dynamic(
  () => import('@/components/dokumentumtar/dokumentumtar-main').then((m) => m.DokumentumtarMain),
  { ssr: false, loading: tabLoading },
)
const KifizetetlenMain = dynamic(
  () => import('@/components/dokumentumtar/kifizetetlen-main').then((m) => m.KifizetetlenMain),
  { ssr: false, loading: tabLoading },
)

type TabValue = 'oblio' | 'dokumentumtar' | 'kifizetetlen'
const TAB_VALUES = ['oblio', 'dokumentumtar', 'kifizetetlen'] as const

interface SzamlakEgyeztetesTabsProps {
  congregationName: string
  congregationId: string
  /** Az Oblio-egyeztetés éve — ezen az oldalon a folyó naptári év (a szerver adja). */
  currentYear: number
}

export function SzamlakEgyeztetesTabs({
  congregationName,
  congregationId,
  currentYear,
}: SzamlakEgyeztetesTabsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabValue>('oblio')

  // Hash-alapú fülváltás (a finance-tabs.tsx applyHashToTab mintája) — így a
  // könyvjelzők és a sidebar-linkek fülre pontosan tudnak mutatni. A régi
  // #oblio_ellenorzes hash-t is értjük (a /penzugy felől átirányított
  // könyvjelzők kedvéért).
  useEffect(() => {
    function applyHashToTab() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
      const mapped = hash === 'oblio_ellenorzes' ? 'oblio' : hash
      if ((TAB_VALUES as readonly string[]).includes(mapped)) {
        setActiveTab(mapped as TabValue)
      }
    }
    // setTimeout 0: a szinkron setState az effect törzsében kaszkád-render
    // lint-hibát ad — a repó bevett mintája (vö. dokumentumtar-main.tsx).
    const t = window.setTimeout(applyHashToTab, 0)
    window.addEventListener('hashchange', applyHashToTab)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('hashchange', applyHashToTab)
    }
  }, [])

  // Fülváltáskor frissítjük az URL hash-t (replaceState, NEM pushState — a
  // Vissza gomb ne fülváltásonként lépkedjen).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const currentHash = window.location.hash.replace(/^#/, '')
    if (currentHash === activeTab) return
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#${activeTab}`,
    )
  }, [activeTab])

  return (
    <div className="space-y-4">
      {/* FELÜL, jól látható visszalépő gomb — Endre explicit kérése. */}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl border-teal-200 bg-teal-50/60 font-medium text-teal-700 shadow-sm transition hover:bg-teal-50"
          onClick={() => router.push('/penzugy')}
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Vissza a Pénzügyhöz
        </Button>
      </div>

      <ModuleHero
        eyebrow="Pénzügy"
        title="Számlák egyeztetése"
        description="A gyülekezet számláinak közös munkaterülete: az Oblio-ból letöltött e-Factura fájlok egyeztetése a könyveléssel, a feltöltött dokumentumok tára, és a még kifizetetlen számlák listája — egy helyen, három fülön."
        pills={[
          { label: congregationName, icon: <Building2 className="size-3.5 text-teal-600" /> },
          {
            label: `Oblio-egyeztetés éve: ${currentYear}`,
            icon: <FileCheck className="size-3.5" />,
            tone: 'sky',
          },
        ]}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <ColorTabs
          tabs={[
            // Az Oblio egyeztetés az ELSŐ és alapértelmezett fül — ez a
            // „sablonos Oblio-feltöltő felület", amit Endre visszakért.
            { value: 'oblio', label: 'Oblio egyeztetés', color: 'cyan' },
            { value: 'dokumentumtar', label: 'Dokumentumtár', color: 'emerald' },
            { value: 'kifizetetlen', label: 'Kifizetetlen számlák', color: 'amber' },
          ]}
          active={activeTab}
          onChange={(v) => setActiveTab(v as TabValue)}
        />

        <TabsContent value="oblio" className="mt-4">
          {/* A /penzugy modáljából ideköltözött MEGLÉVŐ Oblio-felület —
              kliens-oldali, saját server-action adatlekérésekkel dolgozik. */}
          <OblioEllenorzesTab
            congregationSlug={slugifyCongregationName(congregationName)}
            congregationName={congregationName}
            currentYear={currentYear}
          />
        </TabsContent>

        <TabsContent value="dokumentumtar" className="mt-4">
          <DokumentumtarMain
            congregationName={congregationName}
            // A hubon belül a „Kifizetetlen számlák" belépő fülváltás legyen,
            // ne külön oldalra navigálás — a felhasználó ne „essen ki" a hubból.
            onOpenKifizetetlen={() => setActiveTab('kifizetetlen')}
          />
        </TabsContent>

        <TabsContent value="kifizetetlen" className="mt-4">
          <KifizetetlenMain
            congregationName={congregationName}
            congregationId={congregationId}
            // Beágyazva a saját „Dokumentumtár" vissza-gombja fölösleges
            // (ugyanezen az oldalon vagyunk) — elrejtjük.
            embedded
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
