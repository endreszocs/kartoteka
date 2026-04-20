'use client'

import { useState } from 'react'
import { INVENTORY_GUIDE_SECTIONS } from '@/lib/inventory/reporting'

export function InventoryHelpSection() {
  const [activeSection, setActiveSection] = useState<string>(INVENTORY_GUIDE_SECTIONS[0]?.id || 'alapok')
  const selected = INVENTORY_GUIDE_SECTIONS.find(section => section.id === activeSection) || INVENTORY_GUIDE_SECTIONS[0]

  return (
    <section className="card-raised p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Leltár súgó</p>
          <h3 className="font-heading text-2xl text-slate-800">Hivatalos útmutató lelkészeknek</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            A hivatalos leltárprogram, a munkafüzet és a szabályzati dokumentumok logikája szerint összerendezett
            magyarázatok. Így nem kell külön fájlokat keresni, ha kérdés merül fel.
          </p>
        </div>
        <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Részletes és kategorizált segítség
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {INVENTORY_GUIDE_SECTIONS.map(section => {
            const active = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-teal-400 bg-teal-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">{section.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
              </button>
            )
          })}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-inner">
          <div className="rounded-[24px] border border-white bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700/70">{selected.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selected.description}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {selected.bullets.map(bullet => (
                <div
                  key={bullet}
                  className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-slate-700"
                >
                  {bullet}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
