'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  BadgePercent,
  CalendarDays,
  Coins,
  GraduationCap,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'

import {
  deleteCongregationFeeDiscount,
  getCongregationFeeDiscounts,
  saveCongregationFeeDiscount,
} from '@/app/(dashboard)/congregation/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────
// Típusok (a dialog-v2.tsx-ből 1:1 kiemelve)
// ─────────────────────────────────────────────────────────────

interface FeeDiscountRow {
  id: string
  ev: number
  tipus: 'idoszak' | 'kor' | 'jovedelem' | 'foglalkozas'
  sorrend: number
  aktiv: boolean
  kezdet: string | null
  hatarid: string | null
  kedv_osszeg: number | null
  kor_tol: number | null
  szazalek: number | null
  fix_osszeg: number | null
  jov_leiras: string | null
}

// A discountForm belső (camelCase) alakja — a saveCongregationFeeDiscount
// action ebben a formában várja a payloadot (feeDiscountSchema).
function getEmptyDiscountForm(defaultYear: number) {
  return {
    id: undefined as string | undefined,
    ev: defaultYear,
    tipus: 'idoszak' as 'idoszak' | 'kor' | 'jovedelem' | 'foglalkozas',
    sorrend: 0,
    aktiv: true,
    kezdet: '01-01',
    hatarid: '07-01',
    kedvOsszeg: 0,
    korTol: 65,
    szazalek: 50,
    fixOsszeg: 0,
    jovLeiras: '',
  }
}

// ─────────────────────────────────────────────────────────────
// FeeDiscountsManager — önálló KEDVEZMÉNYEK panel (jarulek_kedvezmeny CRUD)
// ─────────────────────────────────────────────────────────────

export function FeeDiscountsManager({ congregationId }: { congregationId: string }) {
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([])
  const [discountSchemaReady, setDiscountSchemaReady] = useState(true)
  const [discountWarning, setDiscountWarning] = useState<string | null>(null)
  const [discountForm, setDiscountForm] = useState(getEmptyDiscountForm(new Date().getFullYear()))

  const loadDiscounts = useCallback(async () => {
    if (!congregationId) return
    const result = await getCongregationFeeDiscounts(congregationId)
    if ('error' in result && result.error) toast.error(result.error)
    setDiscounts((result.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(result.schemaReady !== false)
    setDiscountWarning('warning' in result ? result.warning || null : null)
    setDiscountForm(getEmptyDiscountForm(new Date().getFullYear()))
  }, [congregationId])

  useEffect(() => {
    // A setState-et mikrotaszkba halasztjuk (react-hooks/set-state-in-effect + a kódbázis mintája).
    queueMicrotask(() => { void loadDiscounts() })
  }, [loadDiscounts])

  async function handleSaveDiscount() {
    const result = await saveCongregationFeeDiscount(congregationId, discountForm)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    // #Endre: mentés után az űrlap ürül, de MEGTARTJUK az évet és a típust — így a lelkész
    // AZONNAL rögzítheti a következő (pl. újabb időszaki) kedvezményt anélkül, hogy újra beállítaná.
    setDiscountForm({ ...getEmptyDiscountForm(discountForm.ev), tipus: discountForm.tipus })
    const refreshed = await getCongregationFeeDiscounts(congregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleDeleteDiscount(discountId: string) {
    const result = await deleteCongregationFeeDiscount(congregationId, discountId)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    const refreshed = await getCongregationFeeDiscounts(congregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  // #Endre (6d): mely kedvezmény-TÍPUSOKBAN van élő (aktív) szabály — a típus-kártya zöld jelöléséhez.
  const activeTypes = new Set(discounts.filter((d) => d.aktiv).map((d) => d.tipus))

  return (
    <div className="space-y-4 pt-4">
      {!discountSchemaReady && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A kedvezményrendszer tárolásához még futtatni kell a <code>migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql</code> fájlt.
        </div>
      )}
      {discountWarning && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {discountWarning}
        </div>
      )}

      <Panel title="Meglévő kedvezmények">
        <div className="mb-3 rounded-[1rem] border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs leading-5 text-emerald-900">
          <strong>💡 Több kedvezmény egy évben:</strong> Egy évre <strong>több időszaki
          kedvezményt</strong> is be lehet állítani — pl. lépcsőzetes korai-fizetés
          kedvezménnyel (jún. 1-ig 130 RON, júl. 15-ig 140 RON, aug. 1-ig 160 RON).
          A rendszer a <strong>sorrend</strong> szerint alkalmazza: a legalacsonyabb
          sorrend-értékű a legjobb kedvezmény.
        </div>

        {discounts.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Még nincs kedvezményszabály. Alul hozhatsz létre újat — 4 típus közül választhatsz, mindhez példát találsz.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Csoportosítás év szerint, évek csökkenő sorrendben */}
            {Array.from(new Set(discounts.map((d) => d.ev)))
              .sort((a, b) => b - a)
              .map((year) => {
                const yearDiscounts = discounts
                  .filter((d) => d.ev === year)
                  .sort((a, b) => a.sorrend - b.sorrend)
                return (
                  <div key={year}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-semibold text-slate-700">
                        {year}
                      </span>
                      <span className="text-xs text-slate-500">
                        {yearDiscounts.length} kedvezmény
                      </span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {yearDiscounts.map((discount) => (
                        <DiscountCard
                          key={discount.id}
                          discount={discount}
                          onEdit={() =>
                            setDiscountForm({
                              id: discount.id,
                              ev: discount.ev,
                              tipus: discount.tipus,
                              sorrend: discount.sorrend,
                              aktiv: discount.aktiv,
                              kezdet: discount.kezdet || '01-01',
                              hatarid: discount.hatarid || '07-01',
                              kedvOsszeg: discount.kedv_osszeg ?? 0,
                              korTol: discount.kor_tol ?? 65,
                              szazalek: discount.szazalek ?? 50,
                              fixOsszeg: discount.fix_osszeg ?? 0,
                              jovLeiras: discount.jov_leiras || '',
                            })
                          }
                          onDelete={() => void handleDeleteDiscount(discount.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </Panel>

      <Panel title={discountForm.id ? 'Kedvezmény szerkesztése' : 'Új kedvezmény létrehozása'}>
        {/* 3 kártyás típus-választó */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-slate-500">1. lépés — válaszd ki a kedvezmény típusát:</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <DiscountTypeCard
              icon={<CalendarDays className="size-5" />}
              title="Korai fizetés"
              description="Határidőhöz kötött kedvezményes összeg."
              example="Aki júl. 1-ig fizet, 130 RON-t fizet a 150 helyett."
              selected={discountForm.tipus === 'idoszak'}
              hasActive={activeTypes.has('idoszak')}
              onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'idoszak' }))}
            />
            <DiscountTypeCard
              icon={<BadgePercent className="size-5" />}
              title="Nyugdíjas / kor"
              description="Egy korhatárhoz kötött százalékos kedvezmény."
              example="65+ éves tag 50%-ot kap — 75 RON-t fizet a 150 helyett."
              selected={discountForm.tipus === 'kor'}
              hasActive={activeTypes.has('kor')}
              onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'kor' }))}
            />
            <DiscountTypeCard
              icon={<GraduationCap className="size-5" />}
              title="Foglalkozás"
              description="A tag foglalkozása alapján (pl. tanuló, diák)."
              example="Tanuló / diák tag 0 RON-t fizet."
              selected={discountForm.tipus === 'foglalkozas'}
              hasActive={activeTypes.has('foglalkozas')}
              onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'foglalkozas' }))}
            />
            <DiscountTypeCard
              icon={<Coins className="size-5" />}
              title="Szociális"
              description="Egyedi elbírálás (betegség, nehéz helyzet)."
              example="Súlyos beteg tag 100% — 0 RON-t fizet."
              selected={discountForm.tipus === 'jovedelem'}
              hasActive={activeTypes.has('jovedelem')}
              onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'jovedelem' }))}
            />
          </div>
        </div>

        {/* 2. lépés — típus-specifikus mezők */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500">2. lépés — add meg az adatokat:</p>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Év">
              <Input type="number" value={discountForm.ev} onChange={(event) => setDiscountForm((prev) => ({ ...prev, ev: Number(event.target.value) }))} />
            </Field>
            <Field label="Sorrend (ha több szabály érvényes)">
              <Input type="number" value={discountForm.sorrend} onChange={(event) => setDiscountForm((prev) => ({ ...prev, sorrend: Number(event.target.value) }))} />
            </Field>
          </div>

          {discountForm.tipus === 'idoszak' && (
            <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Kezdő dátum (HH-NN)">
                  <Input value={discountForm.kezdet} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kezdet: event.target.value }))} placeholder="01-01" />
                </Field>
                <Field label="Vég dátum (HH-NN)">
                  <Input value={discountForm.hatarid} onChange={(event) => setDiscountForm((prev) => ({ ...prev, hatarid: event.target.value }))} placeholder="07-01" />
                </Field>
                <Field label="Kedvezményes összeg (RON)">
                  <Input type="number" min={0} value={discountForm.kedvOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kedvOsszeg: Number(event.target.value) }))} />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Aki a <strong>kezdő–vég dátum</strong> időablakban fizet, a &bdquo;kedvezményes összeg&rdquo;-et fizeti a teljes díj helyett. Több időablak is felvehető (pl. 01-01–07-01 → 160, 07-02–10-31 → 190).
              </p>
            </div>
          )}

          {discountForm.tipus === 'kor' && (
            <div className="rounded-[1rem] border border-amber-100 bg-amber-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Korhatár (-től, év)">
                  <Input type="number" min={0} value={discountForm.korTol} onChange={(event) => setDiscountForm((prev) => ({ ...prev, korTol: Number(event.target.value) }))} />
                </Field>
                <Field label="Kedvezmény (%)">
                  <Input type="number" min={0} max={100} value={discountForm.szazalek} onChange={(event) => setDiscountForm((prev) => ({ ...prev, szazalek: Number(event.target.value) }))} />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Aki a megadott évek fölött van, a kedvezmény százalékával kevesebbet fizet.
              </p>
            </div>
          )}

          {discountForm.tipus === 'jovedelem' && (
            <div className="rounded-[1rem] border border-rose-100 bg-rose-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Kedvezmény (%) — vagy add meg a fix RON-ot">
                  <Input type="number" min={0} max={100} value={discountForm.szazalek} onChange={(event) => setDiscountForm((prev) => ({ ...prev, szazalek: Number(event.target.value) }))} />
                </Field>
                <Field label="Fix RON kedvezmény — ha inkább összeg">
                  <Input type="number" min={0} value={discountForm.fixOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, fixOsszeg: Number(event.target.value) }))} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Jogosultsági feltétel (szabad szöveg)">
                  <Input value={discountForm.jovLeiras} onChange={(event) => setDiscountForm((prev) => ({ ...prev, jovLeiras: event.target.value }))} placeholder="pl. Tartós betegség presbitériumi döntés alapján" />
                </Field>
              </div>
            </div>
          )}

          {discountForm.tipus === 'foglalkozas' && (
            <div className="rounded-[1rem] border border-indigo-100 bg-indigo-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Foglalkozás-kulcsszavak (vesszővel)">
                  <Input value={discountForm.jovLeiras} onChange={(event) => setDiscountForm((prev) => ({ ...prev, jovLeiras: event.target.value }))} placeholder="pl. tanuló, diák, egyetemista" />
                </Field>
                <Field label="Fizetendő összeg (RON) — 0 = mentesül">
                  <Input type="number" min={0} value={discountForm.fixOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, fixOsszeg: Number(event.target.value) }))} />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                A tag <strong>foglalkozás</strong> mezőjéhez illeszt (ékezet/kisbetű-érzéketlen, teljes szóra). Aki egyezik, a megadott <strong>fizetendő összeg</strong>et fizeti (0 = teljesen mentesül). Több kulcsszó vesszővel.
              </p>
            </div>
          )}

          {/* Aktív toggle — nem dropdown */}
          <label className="flex cursor-pointer items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/40 p-3">
            <input
              type="checkbox"
              checked={discountForm.aktiv}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, aktiv: event.target.checked }))}
              className="size-4"
            />
            <div>
              <div className="text-sm font-medium text-slate-800">
                {discountForm.aktiv ? 'Aktív kedvezmény' : 'Inaktív (mentve, de nem alkalmazódik)'}
              </div>
              <div className="text-[11px] text-slate-500">
                Egy kedvezmény lehet mentve, de kikapcsolva — pl. ha egy évre felfüggeszted.
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {/* #Endre (6c): a „+" MOSTANTÓL a valódi hozzáadás-gombon van (kiemelt, emerald). A
              ballal csak SZERKESZTÉSKOR lehet elvetni. Mentés után az űrlap ürül (év+típus marad),
              így egyből rögzíthető a következő kedvezmény. */}
          {discountForm.id ? (
            <Button type="button" variant="ghost" onClick={() => setDiscountForm(getEmptyDiscountForm(discountForm.ev))}>
              Mégse (szerkesztés elvetése)
            </Button>
          ) : (
            <span className="text-[11px] text-slate-400">Kitöltés után kattints a hozzáadásra — több szabály is felvehető.</span>
          )}
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void handleSaveDiscount()}>
            {discountForm.id ? <Save className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
            {discountForm.id ? 'Módosítás mentése' : 'Kedvezmény hozzáadása'}
          </Button>
        </div>
      </Panel>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AL-komponensek (a dialog-v2.tsx-ből 1:1 kiemelve)
// ─────────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-raised p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/**
 * Kedvezmény-típus kártya a 3-kártyás típus-választóhoz.
 * Emerald keretre vált, ha a kártya kiválasztott.
 */
function DiscountTypeCard({
  icon,
  title,
  description,
  example,
  selected,
  hasActive,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  example: string
  selected: boolean
  hasActive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-full flex-col items-start gap-2 rounded-[1.1rem] border-2 p-3 text-left transition ${
        selected
          ? 'border-emerald-500 bg-emerald-50/80 shadow-sm'
          : hasActive
            ? 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {/* #Endre (6d): jelvény, ha ebben a kategóriában van ÉLŐ (aktív) kedvezmény ebben a gyülekezetben */}
      {hasActive && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
          ● él
        </span>
      )}
      <div className={`flex size-9 items-center justify-center rounded-full ${selected || hasActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{description}</div>
      <div className={`mt-auto rounded-md px-2 py-1 text-[11px] leading-tight ${selected ? 'bg-emerald-100/70 text-emerald-900' : 'bg-slate-50 text-slate-500'}`}>
        <strong>Példa:</strong> {example}
      </div>
    </button>
  )
}

function DiscountCard({
  discount,
  onEdit,
  onDelete,
}: {
  discount: FeeDiscountRow
  onEdit: () => void
  onDelete: () => void
}) {
  const description =
    discount.tipus === 'idoszak'
      ? `Időablak: ${discount.kezdet || '—'}–${discount.hatarid || '—'} · Kedvezményes összeg: ${Number(discount.kedv_osszeg || 0).toLocaleString('hu-HU')} RON`
      : discount.tipus === 'kor'
        ? `${discount.kor_tol || 0}+ éves kortól · ${discount.szazalek || 0}% kedvezmény`
        : discount.tipus === 'foglalkozas'
          ? `Foglalkozás: ${discount.jov_leiras || '—'} · Fizetendő: ${Number(discount.fix_osszeg || 0).toLocaleString('hu-HU')} RON`
          : `${discount.szazalek || 0}% vagy ${Number(discount.fix_osszeg || 0).toLocaleString('hu-HU')} RON · ${discount.jov_leiras || 'Szociális kedvezmény'}`

  return (
    <div className="rounded-[1.2rem] border border-slate-200/70 bg-white/92 p-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {discount.ev}. év · {discount.tipus === 'idoszak' ? 'Kedvezményes időszak' : discount.tipus === 'kor' ? 'Fizetés / nyugdíj alapú' : discount.tipus === 'foglalkozas' ? 'Foglalkozás-alapú' : 'Szociális alapú'}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{description}</p>
          <p className="mt-2 text-xs text-slate-500">{discount.aktiv ? 'Aktív szabály' : 'Inaktív szabály'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>Szerkesztés</Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
