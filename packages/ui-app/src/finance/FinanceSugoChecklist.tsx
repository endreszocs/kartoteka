'use client'

/**
 * FinanceSugoChecklist — élő pénzügyi év végi zárás checklist
 * (Sprint Q F1, v0.7.3, 2026-04-25).
 *
 * A lelkész az év során folyamatosan bepipálhatja az elvégzett pénzügyi
 * teendőket. A pipálások localStorage-ba kerülnek, évenkénti bontásban
 * (kulcs: `kartoteka_finance_checklist_<year>`).
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - `localStorage` használat — működik iOS WKWebView-ban is, csak nem
 *   szinkronizál eszközök között (privát, személyes lista).
 * - `window.confirm` `typeof window` guard mögött — iOS-en is működik
 *   (UX nem natív; iOS-barát: `onConfirm` prop override-olja, ha átadva).
 * - Semmilyen platform-API import (sonner, next/*, Supabase, Tauri).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Circle,
  Lightbulb,
  ListChecks,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

interface ChecklistItem {
  id: string
  title: string
  description: string
  category: 'napi' | 'havi' | 'negyedeves' | 'evvegi'
  /** Súgó-topic kulcs, amire linkelhetne (nem használt aktívan, jövőbeli horoga). */
  relatedTopic?: string
}

interface ChecklistGroup {
  category: 'napi' | 'havi' | 'negyedeves' | 'evvegi'
  label: string
  emoji: string
  description: string
  items: ChecklistItem[]
}

const CHECKLIST_DATA: ChecklistGroup[] = [
  {
    category: 'napi',
    label: 'Napi / heti teendők',
    emoji: '📅',
    description: 'A mindennapi pénzügyi rutin pillanatai',
    items: [
      {
        id: 'napi-1',
        title: 'Minden készpénzes bevétel rögzítve',
        description: 'Az istentisztelet utáni perselypénz, adományok, járulékok bekerültek a Kassza fülre.',
        category: 'napi',
      },
      {
        id: 'napi-2',
        title: 'Nyugták automatikusan kiállítva',
        description: 'A Kassza fülön minden új bevétel után nyugta is készült (sor végén nyomtató ikon).',
        category: 'napi',
        relatedTopic: 'nyugta-kiallitas',
      },
      {
        id: 'napi-3',
        title: 'Készpénzes kiadások bizonylatokkal',
        description: 'Minden kiadás mellett ott van a nyugta / számla (fényképezve vagy papíron).',
        category: 'napi',
      },
    ],
  },
  {
    category: 'havi',
    label: 'Havi teendők',
    emoji: '📆',
    description: 'Minden hónap elején érdemes ellenőrizni',
    items: [
      {
        id: 'havi-1',
        title: 'Banki kivonat importálva',
        description: 'A BCR-ből letöltött Excel banki kivonatot importáltam a Bank fülön.',
        category: 'havi',
        relatedTopic: 'bank-import',
      },
      {
        id: 'havi-2',
        title: 'Belső mozgások egyeztetve',
        description: 'A készpénz → bank és bank → készpénz mozgások mindkét oldalon rögzítve vannak.',
        category: 'havi',
      },
      {
        id: 'havi-3',
        title: 'Kasszakönyv (Registru Casa) kinyomtatva',
        description: 'Havi kasszakönyv (Registru Casa) a Nyomtatási központból kinyomtatva / PDF-ben mentve.',
        category: 'havi',
      },
      {
        id: 'havi-4',
        title: 'Banki könyv (Registru Banca) kinyomtatva',
        description: 'Havi banki kimutatás minden bankszámlára kinyomtatva / PDF-ben mentve.',
        category: 'havi',
      },
      {
        id: 'havi-5',
        title: 'Anyagraktár mozgások rögzítve',
        description: 'A hónap során beszerzett vagy felhasznált anyagok (nyugtatömb, papír, tisztítószer) bekerültek az Anyagraktárba.',
        category: 'havi',
        relatedTopic: 'anyagraktar',
      },
    ],
  },
  {
    category: 'negyedeves',
    label: 'Negyedéves teendők',
    emoji: '📊',
    description: 'Minden negyedév végén',
    items: [
      {
        id: 'q-1',
        title: 'Részszámadás (félév / negyedév) nyomtatva',
        description: 'A Költségvetés fülön időszakra szűrt részszámadás kinyomtatva a presbitériumnak.',
        category: 'negyedeves',
      },
      {
        id: 'q-2',
        title: 'Járulékfizetők listája frissítve',
        description: 'A Tartozások fülön átnéztem, ki nincs naprakész a járulékkal.',
        category: 'negyedeves',
      },
      {
        id: 'q-3',
        title: 'Oblio befogadott számlák bevezetve',
        description: 'A 60 napos ANAF-határidő miatt minden befogadott számlát ellenőriztem és bevezettem.',
        category: 'negyedeves',
        relatedTopic: 'oblio',
      },
    ],
  },
  {
    category: 'evvegi',
    label: 'Év végi zárás',
    emoji: '🎯',
    description: 'December-január — a számadás lezárásához',
    items: [
      {
        id: 'eve-1',
        title: 'Minden bevétel / kiadás rögzítve',
        description: 'Nincs elmaradt tétel — az utolsó december 31-i sor is a rendszerben van.',
        category: 'evvegi',
      },
      {
        id: 'eve-2',
        title: 'Nyugtafigyelő sárga / piros jelzések nullázva',
        description: 'Minden hiányos tétel (nincs cél, nincs személy) javítva.',
        category: 'evvegi',
      },
      {
        id: 'eve-3',
        title: 'Kassza záró egyenleg fizikailag ellenőrizve',
        description: 'December 31-i készpénz-egyenleg fizikailag megszámolva, a rendszerrel egyezik.',
        category: 'evvegi',
      },
      {
        id: 'eve-4',
        title: 'Banki záró egyenlegek egyeznek',
        description: 'Minden bankszámla záró egyenlege megegyezik a december 31-i banki kivonattal.',
        category: 'evvegi',
      },
      {
        id: 'eve-5',
        title: 'Valutás számlák átértékelve (FX revaluation)',
        description: 'EUR / HUF bankszámlák év végi BNR árfolyammal át vannak értékelve (Bank fül).',
        category: 'evvegi',
      },
      {
        id: 'eve-6',
        title: 'Nyugtatömb kimutatás kinyomtatva',
        description: 'Éves nyugtatömb kimutatás a nyomtatási központból kinyomtatva aláírási blokkokkal.',
        category: 'evvegi',
        relatedTopic: 'nyugtatomb',
      },
      {
        id: 'eve-7',
        title: 'Vagyonleltári jelentés véglegesítve',
        description: 'A Leltár oldalon a tárgyi leltár + anyagraktár záró értéke együtt, véglegesítve.',
        category: 'evvegi',
      },
      {
        id: 'eve-8',
        title: 'Költségvetés-számadás eltérések indokolva',
        description: 'A terv vs tény jelentős eltérések (>20%) presbitériumi jegyzőkönyvben indokolva.',
        category: 'evvegi',
      },
      {
        id: 'eve-9',
        title: 'Számadás véglegesítve és beküldve',
        description: 'A Számadás fülön „Véglegesítés és beküldés" gomb megnyomva — az egyházmegye értesítést kapott.',
        category: 'evvegi',
      },
    ],
  },
]

export interface FinanceSugoChecklistProps {
  /**
   * Belső véglegesítés gomb URL-je (pl. `/penzugy?tab=accounting`).
   * Ha nincs megadva, a banner csak szöveggel jelenik meg, hivatkozás
   * nélkül — a szülő dönti el, hova vezet (web vs. desktop útvonal).
   */
  finalizeHref?: string
  /**
   * Megerősítő dialógus override — opcionális. Ha a hívó átad egy callback-et,
   * az használódik a `window.confirm` helyett (iOS-en natív alert-controller,
   * desktopon shadcn AlertDialog stb.). Ha undefined: `window.confirm` fallback
   * (visszafelé kompatibilis).
   */
  onConfirm?: (message: string) => boolean | Promise<boolean>
}

export function FinanceSugoChecklist({ finalizeHref, onConfirm }: FinanceSugoChecklistProps = {}) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  const storageKey = `kartoteka_finance_checklist_${year}`

  // Mount után töltjük be localStorage-ból (SSR-kompatibilitás)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setMounted(true)
      try {
        if (typeof window === 'undefined') return
        const raw = window.localStorage.getItem(storageKey)
        if (raw) {
          const arr = JSON.parse(raw) as string[]
          setChecked(new Set(arr))
        } else {
          setChecked(new Set())
        }
      } catch {
        setChecked(new Set())
      }
    })
    return () => {
      cancelled = true
    }
  }, [storageKey])

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
        }
      } catch {
        /* ignored */
      }
      return next
    })
  }

  async function resetAll() {
    if (typeof window === 'undefined') return
    const message = `Biztosan törlöd az összes pipát a ${year}. évre?`
    const confirmed = onConfirm ? await onConfirm(message) : window.confirm(message)
    if (!confirmed) return
    setChecked(new Set())
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* ignored */
    }
  }

  const allItems = useMemo(() => CHECKLIST_DATA.flatMap((g) => g.items), [])
  const totalCount = allItems.length
  const checkedCount = allItems.filter((i) => checked.has(i.id)).length
  const percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  const evvegiItems = CHECKLIST_DATA.find((g) => g.category === 'evvegi')?.items || []
  const evvegiChecked = evvegiItems.filter((i) => checked.has(i.id)).length
  const evvegiReady = evvegiItems.length > 0 && evvegiChecked === evvegiItems.length

  return (
    <div className="card-raised bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-emerald-200 p-5 sm:p-6">
      {/* Fejléc */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <ListChecks className="size-6" />
          </span>
          <div>
            <h3 className="font-heading text-xl text-slate-800">
              Év végi zárás — élő checklist
            </h3>
            <p className="text-sm text-slate-600 mt-0.5 leading-snug">
              Pipáld ki, amit elvégeztél — a rendszer elmenti a böngésződben.
              Így lépésről-lépésre látod, mi van készen, és mi vár még rád.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600">Év:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Minden pipát töröl az adott évre"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>

      {/* Progress sáv */}
      {mounted && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-600">
              <strong className="text-slate-800">{checkedCount}</strong> / {totalCount} feladat
              kipipálva
            </span>
            <span
              className={`font-bold ${percent === 100 ? 'text-emerald-700' : 'text-slate-700'}`}
            >
              {percent}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-white border border-emerald-200 overflow-hidden">
            <div
              className={`h-full transition-all ${
                percent === 100
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-r from-emerald-400 to-teal-400'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Csoportok */}
      <div className="space-y-4">
        {CHECKLIST_DATA.map((group) => {
          const groupChecked = group.items.filter((i) => checked.has(i.id)).length
          const groupTotal = group.items.length
          return (
            <div
              key={group.category}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{group.emoji}</span>
                <h4 className="font-semibold text-slate-800">{group.label}</h4>
                <span className="text-xs text-slate-500 ml-2">{group.description}</span>
                <span className="ml-auto text-xs font-medium text-emerald-700">
                  {groupChecked}/{groupTotal}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const isChecked = checked.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-start gap-3 rounded-xl p-2.5 text-left transition-colors ${
                        isChecked
                          ? 'bg-emerald-50/70 hover:bg-emerald-100/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 flex items-center justify-center size-5 rounded-md border-2 ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && (
                          <Check className="size-3.5 text-white" strokeWidth={3} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            isChecked
                              ? 'text-emerald-800 line-through decoration-emerald-400/60'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p
                          className={`text-xs mt-0.5 leading-relaxed ${
                            isChecked
                              ? 'text-emerald-700/80 line-through decoration-emerald-400/60'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Év végi zárás kész banner */}
      {mounted && evvegiReady && (
        <div className="mt-5 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md mb-3">
            <CheckCircle2 className="size-8" />
          </div>
          <h4 className="font-heading text-xl text-emerald-900 mb-1">
            Készen állsz az év végi zárásra! 🎉
          </h4>
          <p className="text-sm text-emerald-800 mb-3">
            Minden év végi pont ki van pipálva. Nyugodtan léphetsz a Számadás fülre, és
            indíthatod a véglegesítést + beküldést az egyházmegyének.
          </p>
          {finalizeHref && (
            <a
              href={finalizeHref}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Sparkles className="size-4" />
              Véglegesítés indítása
            </a>
          )}
        </div>
      )}

      {/* Magyarázó szöveg */}
      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 italic">
        <Lightbulb className="size-3.5 shrink-0 mt-0.5" />
        <p>
          A pipálások csak a böngésződben tárolódnak — nem szinkronizálódnak másik
          eszközzel vagy felhasználóval. Privát, személyes ellenőrző lista.
        </p>
      </div>
    </div>
  )
}

// Placeholder Circle ikon — némelyik böngésző nem render-eli az SVG-t,
// de a Circle import védőháló (used-import, ne tüntesd el)
const _keepCircleImport = Circle
void _keepCircleImport
