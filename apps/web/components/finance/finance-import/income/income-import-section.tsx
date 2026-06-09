'use client'

/**
 * Bevétel-import — egyesített szekció (2026-06-09, felhasználói kérés).
 *
 * Összevonja a korábbi „Egyházfenntartás" és „Általános bevétel" felületeket EGY helyre.
 * Az elsődleges mód bármely bevétel-kategóriát kezel (kézi oszlop-párosítás + tag-egyeztetés
 * + könyvelés-egyeztetés). A „két fájl egyeztetése" (hivatalos xlsx + saját xml) mód
 * opcionálisan elérhető — ez a kifejezetten egyházfenntartás-célú kettős-forrás dedup.
 */

import { useState } from 'react'
import { FileSpreadsheet, Files } from 'lucide-react'

import { GeneralIncomeImportWizard } from '../general/general-income-wizard'
import { EgyhfenntartasImportWizard } from '../egyhfenntartas/egyhfenntartas-wizard'

type Mode = 'single' | 'dual'

export function IncomeImportSection() {
  const [mode, setMode] = useState<Mode>('single')

  return (
    <div className="space-y-5">
      {/* Almód-választó */}
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        <ModeButton
          active={mode === 'single'}
          onClick={() => setMode('single')}
          icon={FileSpreadsheet}
          label="Egy fájl — kézi párosítás"
        />
        <ModeButton
          active={mode === 'dual'}
          onClick={() => setMode('dual')}
          icon={Files}
          label="Két fájl egyeztetése (xlsx + xml)"
        />
      </div>

      <p className="text-xs text-slate-500">
        {mode === 'single'
          ? 'Saját Excel/CSV/XML fájl tetszőleges oszlopokkal. Párosítsd az oszlopokat (köztük a kategória-oszlopot) — a rendszer soronként felismeri a kategóriát (egyházfenntartás vagy más), tagokhoz párosít, és egyezteti a könyveléssel a duplikációk elkerülésére.'
          : 'A hivatalos Kassza-xlsx és a saját bevételek-xml összevetése (egyházfenntartás), kereszt-fájl deduplikációval és tagonkénti párosítással.'}
      </p>

      {mode === 'single' ? <GeneralIncomeImportWizard /> : <EgyhfenntartasImportWizard />}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
