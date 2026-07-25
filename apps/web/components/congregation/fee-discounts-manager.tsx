'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  BadgePercent,
  CalendarDays,
  GraduationCap,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'

import { formatMonthDay, formatMonthDayRange } from '@kartoteka/ui-app'

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

// 2026-07-10 (S2-1d): látható beviteli mezők — a default Input (bg-card/78 + border-input/90)
// beleolvadt a panel világos hátterébe (Év/Sorrend/dátum/összeg mezők szinte láthatatlanok).
// A setup-wizard FIELD_INPUT_CLASS mintáját követjük (fehér háttér + határozott keret + teal fókusz).
const FIELD_INPUT_CLASS =
  'bg-white border-slate-300 shadow-sm hover:border-slate-400 focus-visible:border-teal-500 focus-visible:ring-teal-500/25'

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
    // 2026-07-17 (F5): a kor-kedvezmény módja — % (levonandó) VAGY fix RON (fizetendő).
    // A wizard eddig is tudott fix-módot, a kezelő némán 50%-ká rontotta szerkesztéskor.
    korMode: 'szazalek' as 'szazalek' | 'fix',
  }
}

/** Érvényes HH-NN (hónap 01-12, nap 01-31)? A puszta \d{2}-\d{2} regex a '13-01'-et
 *  is átengedte, amit a motor a KÖVETKEZŐ évre görgetett (rollover-csapda). */
function isValidMonthDay(value: string): boolean {
  return /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
}

// 2026-07-25 (G1): év-időszalag — a HH-NN kód pozíciója az éven belül (0..1).
const MONTH_CUM_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const YEAR_DAYS = 365

function monthDayToFraction(value: string | null | undefined): number | null {
  if (!value || !isValidMonthDay(value)) return null
  const [mm, dd] = value.split('-').map((part) => Number(part))
  const dayOfYear = MONTH_CUM_DAYS[mm - 1] + (dd - 1)
  return Math.min(1, Math.max(0, dayOfYear / YEAR_DAYS))
}

const MONTH_SHORT = ['J', 'F', 'M', 'Á', 'M', 'J', 'J', 'A', 'Sz', 'O', 'N', 'D']

// ─────────────────────────────────────────────────────────────
// FeeDiscountsManager — önálló KEDVEZMÉNYEK panel (jarulek_kedvezmeny CRUD)
// ─────────────────────────────────────────────────────────────

export function FeeDiscountsManager({
  congregationId,
  onChanged,
}: {
  congregationId: string
  /** 2026-07-10 (S2-1a): opcionális jelzés a szülőnek (pl. congregation-dialog-v2
   *  fül-badge + összefoglaló), hogy a kedvezmény-lista megváltozott. */
  onChanged?: () => void | Promise<void>
}) {
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([])
  const [discountSchemaReady, setDiscountSchemaReady] = useState(true)
  const [discountWarning, setDiscountWarning] = useState<string | null>(null)
  const [discountForm, setDiscountForm] = useState(getEmptyDiscountForm(new Date().getFullYear()))
  // 2026-07-25 (G1): TÖBB időszaki kedvezmény egyszerre — a welcome-varázsló
  // DiscountPeriodSlot-mintája szerint. Csak ÚJ rögzítésnél (szerkesztésnél a
  // meglévő egy sorra fókuszálunk), a mentés soronkénti upsert.
  const [extraPeriods, setExtraPeriods] = useState<
    Array<{ key: string; kezdet: string; hatarid: string; kedvOsszeg: number }>
  >([])
  const [savingAll, setSavingAll] = useState(false)

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

  /** Lista-frissítés az űrlap ürítése NÉLKÜL (részleges mentés hibaágához). */
  async function loadDiscountsKeepForm() {
    const refreshed = await getCongregationFeeDiscounts(congregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleSaveDiscount() {
    // 2026-07-17 (F5): kliens-oldali validációk a néma no-op / rollover-aknák ellen
    // (a zod-séma szerver-oldalon ugyanezt kényszeríti).
    if (discountForm.tipus === 'idoszak') {
      if (!isValidMonthDay(discountForm.kezdet) || !isValidMonthDay(discountForm.hatarid)) {
        toast.error('Érvénytelen dátum: hónap-nap (HH-NN) alakban add meg, pl. 07-01 = július 1.')
        return
      }
      if (!(discountForm.kedvOsszeg >= 1)) {
        toast.error('A kedvezményes összeg legalább 1 RON legyen — a 0 összegű időszaki szabály nem érvényesülne. Teljes mentesüléshez használd a felmentést vagy a foglalkozás-kedvezményt.')
        return
      }
      // 2026-07-25 (G1): fordított ablak (pl. 11-01 → 07-01) tiltása — a motor
      // ilyenkor jan. 1-től a VÉG-dátumig mindenkire a kedvezményes árat adná.
      if (discountForm.kezdet > discountForm.hatarid) {
        toast.error('A kezdő dátum nem lehet későbbi a vég dátumnál (pl. 01-01 → 07-01).')
        return
      }
    }
    if (discountForm.tipus === 'kor') {
      if (!(discountForm.korTol >= 18)) {
        toast.error('A korhatár legalább 18 év legyen (a járulék 18 éves kortól jár).')
        return
      }
      if (discountForm.korMode === 'szazalek' && !(discountForm.szazalek >= 1 && discountForm.szazalek <= 100)) {
        toast.error('A kedvezmény százaléka 1 és 100 között legyen.')
        return
      }
    }
    // 2026-07-25 (G1): a „Sorrend" mező megszűnt (a motorra nem hatott — mindig a
    // LEGKEDVEZŐBB szabály nyer). Új sornál automatikus, determinisztikus értéket
    // adunk (adott év+típus legnagyobbja + 1), szerkesztésnél a meglévő marad.
    const autoSorrend = discountForm.id
      ? discountForm.sorrend
      : discounts
          .filter((d) => d.ev === discountForm.ev && d.tipus === discountForm.tipus)
          .reduce((max, d) => Math.max(max, d.sorrend ?? 0), -1) + 1

    // 2026-07-25 (G1): a további időszakokat ELŐBB ellenőrizzük, és CSAK utána
    // mentünk bármit — így hibás sor esetén nem marad félkész (részleges) mentés.
    const savesExtras = !discountForm.id && discountForm.tipus === 'idoszak'
    const pendingExtras = savesExtras ? extraPeriods : []
    for (const [index, period] of pendingExtras.entries()) {
      const label = `A(z) ${index + 2}. időszak`
      if (!isValidMonthDay(period.kezdet) || !isValidMonthDay(period.hatarid)) {
        toast.error(`${label} dátuma érvénytelen (HH-NN alak kell, pl. 07-02).`)
        return
      }
      if (period.kezdet > period.hatarid) {
        toast.error(`${label} kezdő dátuma nem lehet későbbi a vég dátumnál.`)
        return
      }
      if (!(period.kedvOsszeg >= 1)) {
        toast.error(`${label} kedvezményes összege legalább 1 RON legyen.`)
        return
      }
    }

    setSavingAll(true)
    const result = await saveCongregationFeeDiscount(congregationId, {
      ...discountForm,
      sorrend: autoSorrend,
    })
    if (result.error) {
      setSavingAll(false)
      toast.error(result.error)
      return
    }

    // A további időszakok mentése — a MÁR mentett sorokat kivesszük az
    // állapotból, a maradék a képernyőn marad (nem kell újragépelni).
    let extraSaved = 0
    for (const [index, period] of pendingExtras.entries()) {
      const extraResult = await saveCongregationFeeDiscount(congregationId, {
        ...discountForm,
        id: undefined,
        kezdet: period.kezdet,
        hatarid: period.hatarid,
        kedvOsszeg: period.kedvOsszeg,
        sorrend: autoSorrend + index + 1,
      })
      if (extraResult.error) {
        setExtraPeriods(pendingExtras.slice(extraSaved))
        setSavingAll(false)
        toast.error(
          `${extraSaved + 1} kedvezmény elmentve, de a(z) ${index + 2}. időszak nem: ${extraResult.error}`,
        )
        await loadDiscountsKeepForm()
        void onChanged?.()
        return
      }
      extraSaved += 1
    }
    setExtraPeriods([])
    setSavingAll(false)

    toast.success(
      extraSaved > 0 ? `${extraSaved + 1} kedvezmény elmentve.` : result.success,
    )
    // #Endre: mentés után az űrlap ürül, de MEGTARTJUK az évet és a típust — így a lelkész
    // AZONNAL rögzítheti a következő (pl. újabb időszaki) kedvezményt anélkül, hogy újra beállítaná.
    setDiscountForm({ ...getEmptyDiscountForm(discountForm.ev), tipus: discountForm.tipus })
    const refreshed = await getCongregationFeeDiscounts(congregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
    // 2026-07-10 (S2-1a): a szülő (dialog badge/összefoglaló) is frissülhessen
    void onChanged?.()
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
    // 2026-07-10 (S2-1a): a szülő (dialog badge/összefoglaló) is frissülhessen
    void onChanged?.()
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
          A rendszer mindig a <strong>legkedvezőbb</strong> (legkisebb fizetendő összeget adó)
          érvényes szabályt alkalmazza — nincs kézi sorrend, nem is kell beállítani semmit.
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
                // 2026-07-25 (G1): SZEMANTIKUS rendezés a megszűnt „sorrend" helyett —
                // időszaki: határidő szerint (a lépcsőzetes korai fizetés természetes
                // időrendje), kor: korhatár szerint, foglalkozás: kulcsszó szerint.
                const TYPE_ORDER = { idoszak: 0, kor: 1, foglalkozas: 2, jovedelem: 3 } as const
                const yearDiscounts = discounts
                  .filter((d) => d.ev === year)
                  .sort((a, b) => {
                    const typeDiff = (TYPE_ORDER[a.tipus] ?? 9) - (TYPE_ORDER[b.tipus] ?? 9)
                    if (typeDiff !== 0) return typeDiff
                    if (a.tipus === 'idoszak') {
                      return (a.hatarid || '').localeCompare(b.hatarid || '')
                    }
                    if (a.tipus === 'kor') return (a.kor_tol ?? 0) - (b.kor_tol ?? 0)
                    return (a.jov_leiras || '').localeCompare(b.jov_leiras || '', 'hu')
                  })
                const periodDiscounts = yearDiscounts.filter(
                  (d) => d.tipus === 'idoszak' && d.aktiv,
                )
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
                    {/* 2026-07-25 (G1): év-időszalag — egy pillantással látszik, melyik
                        időszakban mennyi a fizetendő, és hol él a teljes éves díj. */}
                    {periodDiscounts.length > 0 && (
                      <DiscountTimeline year={year} periods={periodDiscounts} />
                    )}
                    <div className="grid gap-3 lg:grid-cols-2">
                      {yearDiscounts.map((discount) => (
                        <DiscountCard
                          key={discount.id}
                          discount={discount}
                          onEdit={() => {
                            setExtraPeriods([])
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
                              // F5: a wizard fix-RON módú kor-sora szerkesztéskor is fix marad
                              korMode: (discount.tipus === 'kor' && discount.fix_osszeg != null
                                ? 'fix'
                                : 'szazalek') as 'szazalek' | 'fix',
                            })
                          }}
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
              onClick={() => { setExtraPeriods([]); setDiscountForm((prev) => ({ ...prev, tipus: 'idoszak' })) }}
            />
            <DiscountTypeCard
              icon={<BadgePercent className="size-5" />}
              title="Nyugdíjas / kor"
              description="Egy korhatárhoz kötött százalékos kedvezmény."
              example="65+ éves tag 50%-ot kap — 75 RON-t fizet a 150 helyett."
              selected={discountForm.tipus === 'kor'}
              hasActive={activeTypes.has('kor')}
              onClick={() => { setExtraPeriods([]); setDiscountForm((prev) => ({ ...prev, tipus: 'kor' })) }}
            />
            <DiscountTypeCard
              icon={<GraduationCap className="size-5" />}
              title="Foglalkozás"
              description="A tag foglalkozása alapján (pl. tanuló, diák)."
              example="Tanuló / diák tag 0 RON-t fizet."
              selected={discountForm.tipus === 'foglalkozas'}
              hasActive={activeTypes.has('foglalkozas')}
              onClick={() => { setExtraPeriods([]); setDiscountForm((prev) => ({ ...prev, tipus: 'foglalkozas' })) }}
            />
          </div>
          {/* 2026-07-16: a „Szociális" (jovedelem) típus-kártya ELTÁVOLÍTVA. A
              `jarulek_kedvezmeny` táblán nincs id_szemely/id_csalad, csak
              congregation_id — egy ilyen szabály tehát nem szűkíthető EGY tagra,
              az EGÉSZ gyülekezetre hatna (egy „beteg tag 100%" szabály mindenkit
              ingyenessé tenne). Ezért a motorban sosem volt ága: a panel mentette
              és visszamutatta, de a számítás soha nem vette figyelembe — néma
              csapda volt. A személyre szóló mentesség helye a Felmentés. */}
          <div className="mt-3 rounded-[1rem] border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[11px] text-slate-600">
              <strong>Egy tagra szóló szociális mentesség?</strong> Azt nem itt, hanem a tag adatlapján
              a <strong>Felmentés</strong> résznél lehet rögzíteni (indokkal és évszámmal) — az itteni
              kedvezmények mindig az <strong>egész gyülekezetre</strong> vonatkoznak, ezért nem
              alkalmasak egyedi elbírálásra.
            </p>
          </div>
        </div>

        {/* 2. lépés — típus-specifikus mezők */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500">2. lépés — add meg az adatokat:</p>

          {/* 2026-07-25 (G1): a „Sorrend" mező TÖRÖLVE — a motorra semmilyen hatása
              nem volt (mindig a legkedvezőbb szabály nyer), a felirata viszont
              prioritást sugallt. Az értéket a rendszer automatikusan adja. */}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Év">
              <Input type="number" className={FIELD_INPUT_CLASS} value={discountForm.ev} onChange={(event) => setDiscountForm((prev) => ({ ...prev, ev: Number(event.target.value) }))} />
            </Field>
          </div>

          {discountForm.tipus === 'idoszak' && (
            <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-3">
                {/* 2026-07-16 (Endre): „nem lehet tudni melyik a hónap és melyik a nap" —
                    a beírt kód alatt élőben megjelenik a betűs feloldás. */}
                <Field label="Kezdő dátum (hónap-nap)">
                  <Input className={FIELD_INPUT_CLASS} value={discountForm.kezdet} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kezdet: event.target.value }))} placeholder="01-01" />
                  <p className="mt-1 text-[11px] font-medium text-teal-700">{formatMonthDay(discountForm.kezdet)}</p>
                </Field>
                <Field label="Vég dátum (hónap-nap)">
                  <Input className={FIELD_INPUT_CLASS} value={discountForm.hatarid} onChange={(event) => setDiscountForm((prev) => ({ ...prev, hatarid: event.target.value }))} placeholder="07-01" />
                  <p className="mt-1 text-[11px] font-medium text-teal-700">{formatMonthDay(discountForm.hatarid)}</p>
                </Field>
                <Field label="Kedvezményes összeg (RON)">
                  <Input type="number" min={0} className={FIELD_INPUT_CLASS} value={discountForm.kedvOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kedvOsszeg: Number(event.target.value) }))} />
                </Field>
              </div>
              {/* 2026-07-25 (G1): TÖBB időszak egy menetben — a lépcsőzetes korai
                  fizetés (pl. jún. 1-ig 130, júl. 15-ig 140) így egyszerre rögzíthető. */}
              {!discountForm.id && (
                <div className="mt-3 space-y-2">
                  {extraPeriods.map((period, index) => (
                    <div key={period.key} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <Field label={`${index + 2}. időszak — kezdő (hónap-nap)`}>
                        <Input
                          className={FIELD_INPUT_CLASS}
                          value={period.kezdet}
                          placeholder="07-02"
                          onChange={(event) =>
                            setExtraPeriods((prev) =>
                              prev.map((row) =>
                                row.key === period.key ? { ...row, kezdet: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <p className="mt-1 text-[11px] font-medium text-teal-700">{formatMonthDay(period.kezdet)}</p>
                      </Field>
                      <Field label="Vég (hónap-nap)">
                        <Input
                          className={FIELD_INPUT_CLASS}
                          value={period.hatarid}
                          placeholder="11-01"
                          onChange={(event) =>
                            setExtraPeriods((prev) =>
                              prev.map((row) =>
                                row.key === period.key ? { ...row, hatarid: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <p className="mt-1 text-[11px] font-medium text-teal-700">{formatMonthDay(period.hatarid)}</p>
                      </Field>
                      <Field label="Kedvezményes összeg (RON)">
                        <Input
                          type="number"
                          min={1}
                          className={FIELD_INPUT_CLASS}
                          value={period.kedvOsszeg}
                          onChange={(event) =>
                            setExtraPeriods((prev) =>
                              prev.map((row) =>
                                row.key === period.key
                                  ? { ...row, kedvOsszeg: Number(event.target.value) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mb-1 min-h-9 text-red-600 hover:text-red-700"
                        onClick={() => setExtraPeriods((prev) => prev.filter((row) => row.key !== period.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-9 rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50"
                    onClick={() =>
                      setExtraPeriods((prev) => [
                        ...prev,
                        {
                          key: `p${prev.length}-${prev.length + Math.floor(performance.now())}`,
                          kezdet: '',
                          hatarid: '',
                          kedvOsszeg: 0,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 size-3.5" />
                    További időszak hozzáadása
                  </Button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Aki ebben az időszakban fizet, a &bdquo;kedvezményes összeg&rdquo;-et fizeti a teljes díj helyett.
                A dátum <strong>hónap-nap</strong> sorrendben van: a <code>07-01</code> = <strong>július 1.</strong> (nem január 7.).
                <strong> Több időszak is felvehető</strong> — pl. <code>01-01</code>–<code>07-01</code> → 160,
                majd <code>07-02</code>–<code>11-01</code> → 190. Amelyik időszakba nem esik bele a fizetés,
                ott a <strong>teljes éves díj</strong> érvényes (azt nem kell külön felvenni).
              </p>
            </div>
          )}

          {discountForm.tipus === 'kor' && (
            <div className="rounded-[1rem] border border-amber-100 bg-amber-50/40 p-3">
              {/* 2026-07-17 (F5): %/fix mód-választó — a wizard fix-RON módú kor-szabályát
                  a kezelő eddig némán 50% levonássá konvertálta szerkesztéskor. */}
              <div className="mb-3 flex flex-wrap gap-2">
                {([
                  ['szazalek', 'Kedvezmény %-ban', 'pl. 50% levonás a díjból'],
                  ['fix', 'Fix fizetendő összeg', 'pl. 60 RON (0 = mentesül)'],
                ] as const).map(([mode, title, hint]) => (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm transition-colors ${
                      discountForm.korMode === mode
                        ? 'border-amber-400 bg-amber-100/60'
                        : 'border-slate-200 bg-white hover:border-amber-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="kor-mode"
                      className="size-3.5"
                      checked={discountForm.korMode === mode}
                      onChange={() => setDiscountForm((prev) => ({ ...prev, korMode: mode }))}
                    />
                    <span>
                      <strong className="block text-slate-800">{title}</strong>
                      <span className="block text-[11px] text-slate-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Korhatár (-től, év)">
                  <Input type="number" min={18} className={FIELD_INPUT_CLASS} value={discountForm.korTol} onChange={(event) => setDiscountForm((prev) => ({ ...prev, korTol: Number(event.target.value) }))} />
                </Field>
                {discountForm.korMode === 'szazalek' ? (
                  <Field label="Kedvezmény (%)">
                    <Input type="number" min={1} max={100} className={FIELD_INPUT_CLASS} value={discountForm.szazalek} onChange={(event) => setDiscountForm((prev) => ({ ...prev, szazalek: Number(event.target.value) }))} />
                  </Field>
                ) : (
                  <Field label="Fizetendő összeg (RON) — 0 = mentesül">
                    <Input type="number" min={0} className={FIELD_INPUT_CLASS} value={discountForm.fixOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, fixOsszeg: Number(event.target.value) }))} />
                  </Field>
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {discountForm.korMode === 'szazalek'
                  ? 'Aki a megadott évek fölött van, a kedvezmény százalékával kevesebbet fizet.'
                  : 'Aki a megadott évek fölött van, a megadott fix összeget fizeti (0 = teljesen mentesül).'}
              </p>
            </div>
          )}

          {discountForm.tipus === 'foglalkozas' && (
            <div className="rounded-[1rem] border border-indigo-100 bg-indigo-50/40 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Foglalkozás-kulcsszavak (vesszővel)">
                  <Input className={FIELD_INPUT_CLASS} value={discountForm.jovLeiras} onChange={(event) => setDiscountForm((prev) => ({ ...prev, jovLeiras: event.target.value }))} placeholder="pl. tanuló, diák, egyetemista" />
                </Field>
                <Field label="Fizetendő összeg (RON) — 0 = mentesül">
                  <Input type="number" min={0} className={FIELD_INPUT_CLASS} value={discountForm.fixOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, fixOsszeg: Number(event.target.value) }))} />
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
            <Button type="button" variant="ghost" onClick={() => { setExtraPeriods([]); setDiscountForm(getEmptyDiscountForm(discountForm.ev)) }}>
              Mégse (szerkesztés elvetése)
            </Button>
          ) : (
            <span className="text-[11px] text-slate-400">Kitöltés után kattints a hozzáadásra — több szabály is felvehető.</span>
          )}
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={savingAll}
            onClick={() => void handleSaveDiscount()}
          >
            {discountForm.id ? <Save className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
            {savingAll
              ? 'Mentés…'
              : discountForm.id
                ? 'Módosítás mentése'
                : discountForm.tipus === 'idoszak' && extraPeriods.length > 0
                  ? `${extraPeriods.length + 1} kedvezmény mentése`
                  : 'Kedvezmény hozzáadása'}
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

/**
 * 2026-07-25 (G1): ÉV-IDŐSZALAG az időszaki (korai fizetési) kedvezményekhez.
 *
 * A sáv az ÉRVÉNYES ÁRAT mutatja: ha több időszak fedi ugyanazt a napot, a
 * motorral azonosan a LEGKISEBB fizetendő nyer (jarulek-calculation.ts min-fold).
 * Ezért nem a nyers ablakokat rajzoljuk egymásra (az a legdrágábbat mutatná
 * felül), hanem határpontokon felszabdalt, összevont szakaszokat.
 */
function DiscountTimeline({
  year,
  periods,
}: {
  year: number
  periods: FeeDiscountRow[]
}) {
  const windows = periods
    .map((p) => {
      // Nyitott alsó határ (legacy kumulatív mód): kezdet nélkül az év elejétől él.
      const start = monthDayToFraction(p.kezdet) ?? 0
      const end = monthDayToFraction(p.hatarid)
      if (end == null || end < start) return null
      return { start, end, amount: Number(p.kedv_osszeg || 0) }
    })
    .filter((w): w is { start: number; end: number; amount: number } => w != null)

  if (windows.length === 0) return null

  // Határpontok → elemi szakaszok → szakaszonként a legkisebb érvényes ár.
  const bounds = Array.from(new Set([0, 1, ...windows.flatMap((w) => [w.start, w.end])])).sort(
    (a, b) => a - b,
  )
  type Segment = { start: number; end: number; amount: number | null }
  const raw: Segment[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]
    const to = bounds[i + 1]
    if (to <= from) continue
    const mid = (from + to) / 2
    const covering = windows.filter((w) => mid >= w.start && mid <= w.end)
    const amount = covering.length > 0 ? Math.min(...covering.map((w) => w.amount)) : null
    raw.push({ start: from, end: to, amount })
  }
  // Azonos árú szomszédok összevonása.
  const segments: Segment[] = []
  for (const seg of raw) {
    const prev = segments[segments.length - 1]
    if (prev && prev.amount === seg.amount) prev.end = seg.end
    else segments.push({ ...seg })
  }

  const today = new Date()
  const todayFraction =
    today.getFullYear() === year
      ? monthDayToFraction(
          `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        )
      : null

  // Olcsóbb ár = zöldebb (a rangsor az árak növekvő sorrendje).
  const prices = Array.from(
    new Set(segments.filter((seg) => seg.amount != null).map((seg) => seg.amount as number)),
  ).sort((a, b) => a - b)
  const TONES = [
    'bg-emerald-500/85 text-white',
    'bg-teal-500/85 text-white',
    'bg-sky-500/85 text-white',
    'bg-violet-500/85 text-white',
  ]

  return (
    <div className="mb-3 rounded-[1rem] border border-slate-200 bg-white/80 p-3">
      <p className="mb-2 text-[11px] font-medium text-slate-600">
        {year}. évi fizetendő összeg a befizetés ideje szerint — a szürke szakaszokon a
        teljes éves díj érvényes
      </p>
      <div className="relative h-9 w-full overflow-hidden rounded-lg bg-slate-100">
        {segments.map((seg) => {
          const width = Math.max(0.6, (seg.end - seg.start) * 100)
          const toneIndex = seg.amount != null ? prices.indexOf(seg.amount) : -1
          return (
            <div
              key={`${seg.start}-${seg.end}`}
              className={`absolute top-0 flex h-full items-center justify-center overflow-hidden text-[10px] font-semibold ${
                seg.amount == null
                  ? 'bg-slate-200 text-slate-500'
                  : TONES[toneIndex % TONES.length]
              }`}
              style={{ left: `${seg.start * 100}%`, width: `${width}%` }}
              title={
                seg.amount == null
                  ? 'Teljes éves díj'
                  : `${seg.amount.toLocaleString('hu-HU')} RON fizetendő`
              }
            >
              <span className="truncate px-1">
                {seg.amount == null ? 'teljes' : seg.amount.toLocaleString('hu-HU')}
              </span>
            </div>
          )
        })}
        {todayFraction != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-rose-600"
            style={{ left: `${todayFraction * 100}%` }}
            title="ma"
          />
        )}
      </div>
      {/* A hónap-feliratok a TÉNYLEGES nap-arány szerint (nem egyenletesen). */}
      <div className="relative mt-1 h-3">
        {MONTH_SHORT.map((month, index) => (
          <span
            key={`${month}-${index}`}
            className="absolute text-[9px] text-slate-400"
            style={{ left: `${(MONTH_CUM_DAYS[index] / YEAR_DAYS) * 100}%` }}
          >
            {month}
          </span>
        ))}
      </div>
      {/* Képernyőolvasónak: a szakaszok szövegesen is. */}
      <p className="sr-only">
        {segments
          .map(
            (seg) =>
              `${Math.round(seg.start * 12) + 1}. hónaptól: ${
                seg.amount == null ? 'teljes éves díj' : `${seg.amount} RON`
              }`,
          )
          .join('; ')}
      </p>
      <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
        A Beállítások „éves kedvezmény + határidő" mezője is korai-fizetési kedvezményt ad —
        az itteni sáv csak az ezen a panelen rögzített időszakokat mutatja.
      </p>
    </div>
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
      // 2026-07-16: betűs hónap — a nyers „01-01–07-01" nem volt egyértelmű.
      ? `${formatMonthDayRange(discount.kezdet, discount.hatarid)} · Kedvezményes összeg: ${Number(discount.kedv_osszeg || 0).toLocaleString('hu-HU')} RON`
      : discount.tipus === 'kor'
        ? discount.fix_osszeg != null
          ? `${discount.kor_tol || 0}+ éves kortól · fizetendő ${Number(discount.fix_osszeg) === 0 ? 'mentesül (0 RON)' : `${Number(discount.fix_osszeg).toLocaleString('hu-HU')} RON`}`
          : `${discount.kor_tol || 0}+ éves kortól · ${discount.szazalek || 0}% kedvezmény`
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
