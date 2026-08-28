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

const tabLoading = () => <div className="mt-4 h-64 animate-pulse rounded-2xl bg-slate-100" />
// A MEGLÉVŐ komponensek élnek tovább — nem másolat készült (Endre kérése).
// 2026-08-28 (Endre UX-köre): a webes Oblio-mappás fül és a külön
// „Kifizetetlen számlák" fül MEGSZŰNT — a feltöltés-első „Számlák" nézet
// mutatja a párosítást és a kifizetetlenséget is; a mappás egyeztetés az
// asztali programban él.
const SzamlaEgyeztetesMain = dynamic(
  () => import('@/components/dokumentumtar/szamla-egyeztetes-main').then((m) => m.SzamlaEgyeztetesMain),
  { ssr: false, loading: tabLoading },
)
const DokumentumtarMain = dynamic(
  () => import('@/components/dokumentumtar/dokumentumtar-main').then((m) => m.DokumentumtarMain),
  { ssr: false, loading: tabLoading },
)

type TabValue = 'szamlak' | 'dokumentumtar'
const TAB_VALUES = ['szamlak', 'dokumentumtar'] as const

interface SzamlakEgyeztetesTabsProps {
  congregationName: string
  congregationId: string
  /** Az Oblio-egyeztetés éve — ezen az oldalon a folyó naptári év (a szerver adja). */
  currentYear: number
}

export function SzamlakEgyeztetesTabs({
  congregationName,
  currentYear,
}: SzamlakEgyeztetesTabsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabValue>('szamlak')

  // Hash-alapú fülváltás (a finance-tabs.tsx applyHashToTab mintája) — így a
  // könyvjelzők és a sidebar-linkek fülre pontosan tudnak mutatni. A régi
  // #oblio_ellenorzes hash-t is értjük (a /penzugy felől átirányított
  // könyvjelzők kedvéért).
  useEffect(() => {
    function applyHashToTab() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
      // A régi #oblio / #oblio_ellenorzes / #kifizetetlen könyvjelzők mind az
      // új „Számlák" nézetre futnak be — ott van minden, amit kerestek.
      const mapped = ['oblio', 'oblio_ellenorzes', 'kifizetetlen'].includes(hash)
        ? 'szamlak'
        : hash
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
        description="Töltsd fel a befogadott számlákat, és azonnal látod, melyiknek van meg a párja a könyvelésben — és hol (bank vagy kassza)."
        pills={[
          { label: congregationName, icon: <Building2 className="size-3.5 text-teal-600" /> },
          {
            label: `${currentYear}. év`,
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
            // 2026-08-28 (Endre): a FELTÖLTÉS-első „Számlák" nézet az
            // alapértelmezett — a párosítás és a kifizetetlenség itt látszik.
            { value: 'szamlak', label: 'Számlák', color: 'emerald' },
            { value: 'dokumentumtar', label: 'Dokumentumtár', color: 'cyan' },
          ]}
          active={activeTab}
          onChange={(v) => setActiveTab(v as TabValue)}
        />

        <TabsContent value="szamlak" className="mt-4">
          <SzamlaEgyeztetesMain congregationName={congregationName} />
        </TabsContent>

        <TabsContent value="dokumentumtar" className="mt-4">
          <DokumentumtarMain
            congregationName={congregationName}
            // A kifizetetlen-infó a „Számlák" nézetben él — a belépő odavisz.
            onOpenKifizetetlen={() => setActiveTab('szamlak')}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
