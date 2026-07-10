'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteCongregationCustomFee,
  getCongregationCustomFees,
  saveCongregationCustomFee,
  type CustomFeeRow,
} from '@/app/(dashboard)/congregation/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─────────────────────────────────────────────────────────────────────────────
// EGYÉB (gyülekezet-specifikus) DÍJAK panel — congregation_custom_fees CRUD.
//
// Kiemelve a congregation-dialog-v2.tsx „Egyéb díjak" al-tabjából 1:1-ben
// (JSX + state + handlerek + al-komponensek). Self-contained: saját state,
// saját betöltés (mountkor), saját sonner-toastok. A szerver-actionök
// változatlanul a meglévő helyükről importálódnak.
// ─────────────────────────────────────────────────────────────────────────────

// 2026-07-10 (S2-1d): látható beviteli mezők — a default Input beleolvadt a panel
// hátterébe; a setup-wizard FIELD_INPUT_CLASS mintáját követjük (fehér + határozott keret).
const FIELD_INPUT_CLASS =
  'bg-white border-slate-300 shadow-sm hover:border-slate-400 focus-visible:border-teal-500 focus-visible:ring-teal-500/25'

/** A díj-űrlap belső (kamelt) állapota — bit-azonos a dialog-v2 customFeeForm-jával. */
interface CustomFeeFormState {
  id: string | undefined
  name: string
  description: string
  amount: number
  currency: string
  yearFrom: number
  yearTo: number | null
  korTol: number | null
  korIg: number | null
  aktiv: boolean
}

function getEmptyCustomFeeForm(): CustomFeeFormState {
  return {
    id: undefined,
    name: '',
    description: '',
    amount: 0,
    currency: 'RON',
    yearFrom: new Date().getFullYear(),
    yearTo: null,
    korTol: null,
    korIg: null,
    aktiv: true,
  }
}

export function CustomFeesManager({
  congregationId,
  onChanged,
}: {
  congregationId: string
  /** 2026-07-10 (S2-1a): opcionális jelzés a szülőnek (pl. congregation-dialog-v2
   *  fül-badge), hogy a díj-lista megváltozott. */
  onChanged?: () => void | Promise<void>
}) {
  const [customFees, setCustomFees] = useState<CustomFeeRow[]>([])
  const [customFeeSchemaReady, setCustomFeeSchemaReady] = useState(true)
  const [customFeeWarning, setCustomFeeWarning] = useState<string | null>(null)
  const [customFeeForm, setCustomFeeForm] = useState<CustomFeeFormState>(getEmptyCustomFeeForm)

  // ── Betöltés a mountkor ──────────────────────────────────────────────────
  const loadCustomFees = useCallback(async () => {
    const result = await getCongregationCustomFees(congregationId)
    if ('error' in result && result.error) toast.error(result.error)
    setCustomFees(result.rows || [])
    setCustomFeeSchemaReady(result.schemaReady !== false)
    setCustomFeeWarning('warning' in result ? result.warning || null : null)
  }, [congregationId])

  useEffect(() => {
    // A setState-et mikrotaszkba halasztjuk (react-hooks/set-state-in-effect + a kódbázis mintája).
    queueMicrotask(() => { void loadCustomFees() })
  }, [loadCustomFees])

  // ── Handlerek ─────────────────────────────────────────────────────────────
  async function handleSaveCustomFee() {
    const result = await saveCongregationCustomFee(congregationId, customFeeForm)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationCustomFees(congregationId)
    setCustomFees(refreshed.rows || [])
    setCustomFeeSchemaReady(refreshed.schemaReady !== false)
    setCustomFeeWarning('warning' in refreshed ? refreshed.warning || null : null)
    // Form reset — új létrehozás mód
    setCustomFeeForm(getEmptyCustomFeeForm())
    // 2026-07-10 (S2-1a): a szülő (dialog badge) is frissülhessen
    void onChanged?.()
  }

  async function handleDeleteCustomFee(feeId: string) {
    const result = await deleteCongregationCustomFee(congregationId, feeId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationCustomFees(congregationId)
    setCustomFees(refreshed.rows || [])
    setCustomFeeSchemaReady(refreshed.schemaReady !== false)
    setCustomFeeWarning('warning' in refreshed ? refreshed.warning || null : null)
    // 2026-07-10 (S2-1a): a szülő (dialog badge) is frissülhessen
    void onChanged?.()
  }

  return (
    <div className="space-y-4 pt-4">
      {!customFeeSchemaReady && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A gyülekezet-specifikus díjak tárolásához még futtatni kell a{' '}
          <code>migration-docs/sql/2026-04-21-congregation-custom-fees.sql</code> fájlt.
        </div>
      )}
      {customFeeWarning && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {customFeeWarning}
        </div>
      )}

      <Panel title="Meglévő gyülekezeti díjak">
        <div className="mb-3 rounded-[1rem] border border-rose-100 bg-rose-50/60 px-4 py-3 text-xs leading-5 text-rose-900">
          <strong>💡 Mi ez?</strong> A gyülekezet által <strong>presbitériumi határozattal</strong>{' '}
          megszavazott különdíjak — pl. <em>temetős karbantartás</em>, <em>harangozási díj</em>,{' '}
          <em>kántorilletmény</em>. Ezek nem az egyházfenntartás részei, a rendszer a
          tartozás számításánál hozzáadja őket.
        </div>

        {customFees.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Még nincs rögzített gyülekezeti díj. Alul hozhatsz létre újat.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {customFees.map((fee) => (
              <CustomFeeCard
                key={fee.id}
                fee={fee}
                onEdit={() =>
                  setCustomFeeForm({
                    id: fee.id,
                    name: fee.name,
                    description: fee.description || '',
                    amount: fee.amount,
                    currency: fee.currency,
                    yearFrom: fee.year_from,
                    yearTo: fee.year_to,
                    korTol: fee.kor_tol,
                    korIg: fee.kor_ig,
                    aktiv: fee.aktiv,
                  })
                }
                onDelete={() => void handleDeleteCustomFee(fee.id)}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title={customFeeForm.id ? 'Díj szerkesztése' : 'Új gyülekezeti díj'}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Megnevezés *">
              <Input
                className={FIELD_INPUT_CLASS}
                value={customFeeForm.name}
                onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="pl. Temetős karbantartási díj"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Leírás / hivatkozás (opcionális)">
              <Input
                className={FIELD_INPUT_CLASS}
                value={customFeeForm.description}
                onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="pl. 2025/03. presbitériumi jegyzőkönyv alapján"
              />
            </Field>
          </div>
          <Field label="Éves összeg (RON / tag)">
            <Input
              type="number"
              min={0}
              className={FIELD_INPUT_CLASS}
              value={customFeeForm.amount}
              onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
            />
          </Field>
          <Field label="Érvényesség kezdete (év)">
            <Input
              type="number"
              min={1900}
              max={2999}
              className={FIELD_INPUT_CLASS}
              value={customFeeForm.yearFrom}
              onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, yearFrom: Number(event.target.value) }))}
            />
          </Field>
          <Field label="Érvényesség vége (év, opcionális)">
            <Input
              type="number"
              min={1900}
              max={2999}
              className={FIELD_INPUT_CLASS}
              value={customFeeForm.yearTo ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setCustomFeeForm((prev) => ({ ...prev, yearTo: v ? Number(v) : null }))
              }}
              placeholder="Üresen = visszavonásig"
            />
          </Field>
          <Field label="Korhatár — (tól, év, opcionális)">
            <Input
              type="number"
              min={0}
              className={FIELD_INPUT_CLASS}
              value={customFeeForm.korTol ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setCustomFeeForm((prev) => ({ ...prev, korTol: v ? Number(v) : null }))
              }}
              placeholder="pl. 18 (csak nagykorúak)"
            />
          </Field>
          <Field label="Korhatár — (ig, év, opcionális)">
            <Input
              type="number"
              min={0}
              className={FIELD_INPUT_CLASS}
              value={customFeeForm.korIg ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setCustomFeeForm((prev) => ({ ...prev, korIg: v ? Number(v) : null }))
              }}
              placeholder="üresen = felső határ nincs"
            />
          </Field>
        </div>

        {/* Aktív toggle */}
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/40 p-3">
          <input
            type="checkbox"
            checked={customFeeForm.aktiv}
            onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, aktiv: event.target.checked }))}
            className="size-4"
          />
          <div>
            <div className="text-sm font-medium text-slate-800">
              {customFeeForm.aktiv ? 'Aktív díj' : 'Inaktív (mentve, de nem számítjuk tartozásnak)'}
            </div>
            <div className="text-[11px] text-slate-500">
              Ha felfüggesztesz egy díjat — pl. átmenetileg — kapcsold ki a toggle-val,
              ne töröld. Így a régi adatok megmaradnak.
            </div>
          </div>
        </label>

        <div className="mt-4 flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCustomFeeForm(getEmptyCustomFeeForm())}
          >
            <Plus className="mr-2 size-4" />
            Új üres
          </Button>
          <Button type="button" onClick={() => void handleSaveCustomFee()}>
            <Save className="mr-2 size-4" />
            {customFeeForm.id ? 'Módosítás mentése' : 'Díj létrehozása'}
          </Button>
        </div>
      </Panel>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Al-komponensek (a dialog-v2-ből 1:1-ben átemelve)
// ─────────────────────────────────────────────────────────────────────────────

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
 * Gyülekezet-specifikus díj megjelenítő kártya — olvasásra, szerkesztés / törlés gombbal.
 */
function CustomFeeCard({
  fee,
  onEdit,
  onDelete,
}: {
  fee: CustomFeeRow
  onEdit: () => void
  onDelete: () => void
}) {
  const yearLabel = fee.year_to ? `${fee.year_from}–${fee.year_to}` : `${fee.year_from}-től`
  const ageLabel =
    fee.kor_tol !== null && fee.kor_ig !== null
      ? `${fee.kor_tol}–${fee.kor_ig} évesek`
      : fee.kor_tol !== null
        ? `${fee.kor_tol}+ évesek`
        : fee.kor_ig !== null
          ? `${fee.kor_ig} éves korig`
          : 'Minden tag'

  return (
    <div className={`rounded-[1.1rem] border-2 p-3 ${fee.aktiv ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/70 opacity-70'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800">{fee.name}</div>
          {fee.description && (
            <div className="mt-0.5 truncate text-[11px] text-slate-500">{fee.description}</div>
          )}
        </div>
        {!fee.aktiv && (
          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            inaktív
          </span>
        )}
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-white/85 px-2 py-0.5 font-mono">
          {fee.amount.toLocaleString('hu-HU')} {fee.currency}
        </span>
        <span className="rounded-full bg-white/85 px-2 py-0.5">{yearLabel}</span>
        <span className="rounded-full bg-white/85 px-2 py-0.5">{ageLabel}</span>
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
          Szerkeszt
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="size-3.5 text-rose-600" />
        </Button>
      </div>
    </div>
  )
}
