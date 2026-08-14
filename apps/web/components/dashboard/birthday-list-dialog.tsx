'use client'

/**
 * BirthdayListDialog — Születésnapos lista szűrővel és nyomtatással.
 *
 * Használat a Celebrations kártyáról megnyíló gombbal. A lelkész szűrhet:
 *   - Dátum-tartomány (előre beállított: ezen a héten / ezen a hónapban /
 *     következő hónapban / egész év / egyéni tól-ig)
 *   - Életkor-tartomány (opcionális)
 *   - Férfi / nő (opcionális)
 *
 * A lista nyomtatható — A4 portrait, gyülekezeti logóval.
 *
 * 2026-08-11 (5. kör, P2-#18): a taglista MEGADHATÓ (`allMembers`), de ha a
 * hívó nem adja meg, a dialógus az első megnyitáskor MAGA tölti be
 * (getBirthdayListData). Így az irányítópult szerver-komponensének nem kell a
 * teljes aktív taglistát belesütnie az oldal RSC-csomagjába egy modálért,
 * amit a lelkész többnyire ki sem nyit.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Cake, Filter, Gift, Printer, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBirthdayListAddresses } from '@/app/(dashboard)/dashboard/actions'
import { getBirthdayListData } from '@/app/(dashboard)/tagnyilvantartas/birthday-list-actions'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { BirthdayCardDialog, type BirthdayCardPerson } from '@/components/dashboard/birthday-card-dialog'

interface Member {
  id: string
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  /** 2026-08-01 (PR-19): az özv./elv. előtaghoz */
  allapot?: string | null
  sz_datum: string | null
  ferfi: boolean | null
}

interface BirthdayEntry {
  id: string
  name: string
  birthDate: Date
  month: number
  day: number
  age: number
  isMale: boolean | null
  /** Összeállított teljes lakcím: „Helység, Utca Házszám" — ha hiányos, ami rendelkezésre áll */
  address: string | null
}

interface BirthdayListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * A tagok listája. Ha NINCS megadva, a dialógus az első megnyitáskor maga
   * tölti be (2026-08-11, P2-#18) — a hívó oldalnak nem kell átadnia.
   */
  allMembers?: Member[]
  /** Ha nincs megadva, a betöltött adatcsomagból jön. */
  congregationName?: string
  congregationLogo?: string | null
}

type DatePreset = 'week' | 'month' | 'next-month' | 'year' | 'custom'

export function BirthdayListDialog({
  open,
  onOpenChange,
  allMembers,
  congregationName,
  congregationLogo,
}: BirthdayListDialogProps) {
  // ── Kérésre töltött taglista (2026-08-11, P2-#18) ────────────────────────
  // Ha a hívó nem ad `allMembers`-t, az első megnyitáskor lekérjük. A hiba
  // NEM néma üres lista: külön hibaállapotot mutatunk, újrapróbálkozással —
  // különben a lelkész azt hinné, nincs egyetlen születésnapos sem.
  const [fetched, setFetched] = useState<{
    members: Member[]
    congregationName: string
    congregationLogo: string | null
  } | null>(null)
  const [membersError, setMembersError] = useState(false)
  const selfLoading = allMembers === undefined

  useEffect(() => {
    if (!open || !selfLoading || fetched !== null || membersError) return
    let cancelled = false
    getBirthdayListData()
      .then((data) => {
        if (cancelled) return
        setFetched({
          members: data.members,
          congregationName: data.congregationName,
          congregationLogo: data.congregationLogo,
        })
      })
      .catch(() => {
        if (cancelled) return
        setMembersError(true)
        toast.error('A születésnaposok betöltése nem sikerült — próbáld újra.')
      })
    return () => {
      cancelled = true
    }
  }, [open, selfLoading, fetched, membersError])

  // A betöltés-állapot SZÁRMAZTATOTT (nincs külön state) — így az effect
  // kizárólag a külső rendszerrel (szerver-akció) szinkronizál.
  const membersLoading = selfLoading && open && fetched === null && !membersError
  const members = useMemo(() => allMembers ?? fetched?.members ?? [], [allMembers, fetched])
  const headerName = congregationName ?? fetched?.congregationName ?? 'Gyülekezet'
  const headerLogo = congregationLogo ?? fetched?.congregationLogo ?? null

  const [preset, setPreset] = useState<DatePreset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all')
  const [showAddress, setShowAddress] = useState(false)
  // 2026-08-01 (PR-19): megosztható üdvözlőkártya (egyéni / lista mód)
  const [cardOpen, setCardOpen] = useState(false)
  const [cardPersonId, setCardPersonId] = useState<string | null>(null)

  // 2026-06-30 (perf): a lakcímek KÉRÉSRE töltődnek — a dashboard fő lekérdezése
  // már nem hozza a cím-joinokat. Csak akkor kérjük le, ha a felhasználó a
  // „Lakhely megjelenítése" kapcsolót bekapcsolja (modálonként egyszer).
  const [addressMap, setAddressMap] = useState<Record<string, string> | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)

  // Esemény-vezérelt (NEM effect): a kapcsoló bekapcsolásakor töltjük a címeket,
  // modálonként egyszer. Így nincs felesleges lekérés, ha a felhasználó sosem
  // kapcsolja be a „Lakhely megjelenítése" opciót.
  function loadAddressesIfNeeded() {
    if (addressMap !== null || addressLoading) return
    setAddressLoading(true)
    getBirthdayListAddresses()
      .then((map) => setAddressMap(map))
      .catch(() => setAddressMap({}))
      .finally(() => setAddressLoading(false))
  }

  // 1. lépés: szerkesztett születésnap-entries (névvel, életkorral)
  const allEntries: BirthdayEntry[] = useMemo(() => {
    const today = new Date()
    const currentYear = today.getFullYear()
    return members
      .filter((m) => m.sz_datum)
      .map((m) => {
        const birthDate = new Date(m.sz_datum!)
        if (isNaN(birthDate.getTime())) return null
        // 2026-08-01 (PR-19 BUGFIX): a namepattern csak ELŐTAG (id./ifj./özv.) —
        // korábban teljes névként jelent meg helyette („ifj." név nélkül).
        const name = formatNameWithPrefix({
          csaladnev: m.csaladnev,
          k_nev: m.k_nev,
          namepattern: m.namepattern,
          allapot: m.allapot ?? null,
        })
        // Az idei születésnap hónap/nap alapján
        const month = birthDate.getMonth()
        const day = birthDate.getDate()
        const thisYearBday = new Date(currentYear, month, day)
        const ageThisYear = currentYear - birthDate.getFullYear()
        return {
          id: m.id,
          name,
          birthDate,
          month,
          day,
          age: ageThisYear,
          isMale: m.ferfi,
          thisYearBday,
          // Lakcím a kérésre betöltött térképből (lásd getBirthdayListAddresses)
          address: addressMap?.[String(m.id)] ?? null,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => {
        if (a.month !== b.month) return a.month - b.month
        if (a.day !== b.day) return a.day - b.day
        return a.name.localeCompare(b.name, 'hu')
      })
  }, [members, addressMap])

  // 2. lépés: dátum-tartomány meghatározása a preset alapján
  const dateRange = useMemo((): { from: Date; to: Date } | null => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const year = today.getFullYear()

    if (preset === 'week') {
      // Hétfőtől vasárnapig (európai hét)
      const dow = today.getDay() || 7 // vasárnap = 0 → 7
      const from = new Date(today)
      from.setDate(today.getDate() - (dow - 1))
      const to = new Date(from)
      to.setDate(from.getDate() + 6)
      return { from, to }
    }
    if (preset === 'month') {
      const from = new Date(year, today.getMonth(), 1)
      const to = new Date(year, today.getMonth() + 1, 0)
      return { from, to }
    }
    if (preset === 'next-month') {
      const from = new Date(year, today.getMonth() + 1, 1)
      const to = new Date(year, today.getMonth() + 2, 0)
      return { from, to }
    }
    if (preset === 'year') {
      return { from: new Date(year, 0, 1), to: new Date(year, 11, 31) }
    }
    // custom
    // 2026-08-02 (PR-19 review-fix): a 'YYYY-MM-DD' formát a new Date() UTC
    // éjfélként értelmezi (= hajnali 2-3 óra helyi időben), miközben a
    // születésnap-jelöltek HELYI éjfélre esnek → a tartomány ELSŐ napjának
    // ünnepeltjei kimaradtak volna. Helyi dátumként parsoljuk.
    if (!customFrom || !customTo) return null
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m || 1) - 1, d || 1)
    }
    const from = parseLocal(customFrom)
    const to = parseLocal(customTo)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
    return { from, to }
  }, [preset, customFrom, customTo])

  // 3. lépés: szűrés a dátum-tartomány + életkor + nem alapján
  const filtered = useMemo(() => {
    if (!dateRange) return []
    const { from, to } = dateRange
    const yFrom = from.getFullYear()
    return allEntries
      .flatMap((e) => {
        // 2026-08-01 (PR-19 BUGFIX): a születésnap ÉVFORDULÓ — az évhatár-
        // átnyúlást (pl. dec. 20. – jan. 10.) is kezeljük: a from évében ÉS a
        // rákövetkező évben is megnézzük. 2026-08-02 (review-fix): az életkor
        // a TALÁLT évforduló évéből számítódik (különben a jövő januári
        // ünnepelt 1 évvel fiatalabbként jelent volna meg a listán, a
        // nyomtatáson ÉS az üdvözlőkártyán is).
        const matchYear = [yFrom, yFrom + 1].find((y) => {
          const candidate = new Date(y, e.month, e.day)
          return candidate >= from && candidate <= to
        })
        if (matchYear === undefined) return []
        const age = matchYear - e.birthDate.getFullYear()
        // Életkor
        if (ageMin && age < Number(ageMin)) return []
        if (ageMax && age > Number(ageMax)) return []
        // Nem
        if (genderFilter === 'male' && e.isMale !== true) return []
        if (genderFilter === 'female' && e.isMale !== false) return []
        return [{ ...e, age, occursOn: new Date(matchYear, e.month, e.day) }]
      })
      // Az előfordulás időrendjében (évhatár-átnyúlásnál a december a január
      // ELŐTT — a hónap/nap sorrend itt fordítva mutatta volna)
      .sort((a, b) => a.occursOn.getTime() - b.occursOn.getTime() || a.name.localeCompare(b.name, 'hu'))
  }, [allEntries, dateRange, ageMin, ageMax, genderFilter])

  // ──────────────────────────────────────────────────────────────
  // Nyomtatás — saját ablakban
  // ──────────────────────────────────────────────────────────────
  function handlePrint() {
    if (filtered.length === 0) return
    const today = new Date()
    const todayLabel = today.toLocaleDateString('hu', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const rangeLabel = dateRange
      ? `${dateRange.from.toLocaleDateString('hu')} — ${dateRange.to.toLocaleDateString('hu')}`
      : ''

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const rows = filtered
      .map((e) => {
        const bday = `${String(e.month + 1).padStart(2, '0')}.${String(e.day).padStart(2, '0')}`
        const genderIcon = e.isMale === true ? '♂' : e.isMale === false ? '♀' : '—'
        const addressStr = e.address || '—'
        return `<tr>
          <td class="c-date">${bday}.</td>
          <td class="c-name">${esc(e.name)}</td>
          <td class="c-gender">${genderIcon}</td>
          <td class="c-age">${e.age} éves</td>
          ${showAddress ? `<td class="c-address">${esc(addressStr)}</td>` : ''}
        </tr>`
      })
      .join('')

    const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
      <title>${esc(headerName)} — Születésnaposok</title>
      <style>
        @page { size: A4 portrait; margin: 16mm; }
        @media print { .toolbar { display: none !important; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; }
        .toolbar { position: sticky; top: 0; z-index: 100; background: linear-gradient(135deg, #1e3a5f, #0f766e); padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; }
        .toolbar .title { color: #fff; font-size: 14px; font-weight: 600; }
        .tb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
        .tb-btn-print { background: #fff; color: #1e3a5f; }
        .tb-btn-close { background: rgba(255,255,255,.15); color: #fff; }
        .page { max-width: 720px; margin: 20px auto; padding: 24px; background: #fff; }
        @media print { .page { margin: 0; padding: 0; max-width: 100%; } }
        .header { display: flex; align-items: center; gap: 20px; padding-bottom: 18px; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
        .logo { width: 72px; height: 72px; border-radius: 10px; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .logo img { width: 100%; height: 100%; object-fit: contain; }
        .header-text { flex: 1; }
        .header-text .church { font-size: 16px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.04em; }
        .header-text .title { font-size: 22px; font-weight: 800; color: #0f766e; margin-top: 4px; }
        .header-text .meta { font-size: 11px; color: #64748b; margin-top: 6px; }
        .section { margin-bottom: 22px; }
        .section-title { font-size: 14px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 600; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #cbd5e1; }
        td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:hover td { background: #fefce8; }
        .c-date { font-family: 'Consolas', monospace; color: #0f766e; font-weight: 600; width: 72px; }
        .c-name { font-weight: 500; color: #1e293b; }
        .c-gender { text-align: center; color: #64748b; width: 32px; font-size: 15px; }
        .c-age { color: #64748b; width: 84px; text-align: right; font-size: 11px; }
        .c-address { color: #475569; font-size: 10.5px; font-style: italic; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
      </style>
      </head><body>
        <div class="toolbar">
          <div>
            <span class="title">${esc(headerName)} — Születésnaposok</span>
          </div>
          <div>
            <button class="tb-btn tb-btn-print" onclick="window.print()">🖨 Nyomtatás</button>
            <button class="tb-btn tb-btn-close" onclick="window.close()">Bezárás</button>
          </div>
        </div>
        <div class="page">
          <div class="header">
            ${headerLogo
              ? `<div class="logo"><img src="${esc(headerLogo)}" alt="Címer"/></div>`
              : `<div class="logo" style="font-size: 28px;">⛪</div>`}
            <div class="header-text">
              <div class="church">${esc(headerName)}</div>
              <div class="title">Születésnaposok listája</div>
              <div class="meta">Időszak: ${esc(rangeLabel)} · Összesen: ${filtered.length} fő · Nyomtatva: ${esc(todayLabel)}</div>
            </div>
          </div>
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th style="width: 72px;">Nap</th>
                  <th>Név</th>
                  <th style="width: 32px;"></th>
                  <th style="width: 84px; text-align: right;">Életkor</th>
                  ${showAddress ? '<th style="width: 260px;">Lakhely</th>' : ''}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="footer">
            <span>Kartotéka rendszer</span>
            <span>${esc(todayLabel)}</span>
          </div>
        </div>
      </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
              <Cake className="size-5" />
            </span>
            Születésnaposok szűrése és nyomtatása
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dátum-tartomány */}
          <div className="rounded-[1.2rem] border border-slate-100 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="size-4 text-slate-500" />
              Időszak
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { value: 'week', label: 'Ezen a héten' },
                { value: 'month', label: 'Ez a hónap' },
                { value: 'next-month', label: 'Köv. hónap' },
                { value: 'year', label: 'Egész év' },
                { value: 'custom', label: 'Egyéni' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPreset(opt.value as DatePreset)}
                  className={`rounded-[0.8rem] border-2 px-3 py-2 text-xs font-medium transition ${
                    preset === opt.value
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bd-from">Tól</Label>
                  <Input
                    id="bd-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bd-to">Ig</Label>
                  <Input
                    id="bd-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Életkor + nem szűrő */}
          <div className="rounded-[1.2rem] border border-slate-100 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Kiegészítő szűrők</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="bd-age-min">Életkor-tól</Label>
                <Input
                  id="bd-age-min"
                  type="number"
                  min={0}
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="pl. 65"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bd-age-max">Életkor-ig</Label>
                <Input
                  id="bd-age-max"
                  type="number"
                  min={0}
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="üres = nincs felső"
                />
              </div>
              <div className="space-y-1">
                <Label>Nem</Label>
                <div className="flex gap-1.5">
                  {[
                    { value: 'all', label: 'Mindenki' },
                    { value: 'male', label: 'Férfi' },
                    { value: 'female', label: 'Nő' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGenderFilter(opt.value as 'all' | 'male' | 'female')}
                      className={`flex-1 rounded-[0.6rem] border px-2.5 py-1.5 text-xs font-medium transition ${
                        genderFilter === opt.value
                          ? 'border-amber-400 bg-amber-50 text-amber-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lakhely opcionális megjelenítés — nyomtatáshoz és képernyőn is */}
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-[0.8rem] border border-slate-200 bg-slate-50/60 px-3 py-2">
              <input
                type="checkbox"
                checked={showAddress}
                onChange={(e) => {
                  setShowAddress(e.target.checked)
                  if (e.target.checked) loadAddressesIfNeeded()
                }}
                className="size-4"
              />
              <span className="text-sm font-medium text-slate-700">
                Lakhely megjelenítése (város + cím)
              </span>
              <span className="ml-auto text-[11px] text-slate-500">
                {addressLoading ? 'Címek betöltése…' : 'A nyomtatási listára is kikerül'}
              </span>
            </label>
          </div>

          {/* Eredménylista */}
          <div className="rounded-[1.2rem] border border-slate-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Eredmény:{' '}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  {filtered.length} fő
                </span>
              </h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  onClick={() => { setCardPersonId(null); setCardOpen(true) }}
                  disabled={filtered.length === 0}
                  title="Megosztható üdvözlőkártya a listáról"
                >
                  <Gift className="mr-2 size-4" />
                  Üdvözlőkártya
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePrint}
                  disabled={filtered.length === 0}
                >
                  <Printer className="mr-2 size-4" />
                  Nyomtatás
                </Button>
              </div>
            </div>
            {/* 2026-08-11 (P2-#18): a kérésre töltött lista három állapota külön
                látszik. Betöltés és HIBA esetén SOHA nem írjuk ki, hogy „nincs
                találat" — az azt a hamis képet keltené, hogy nincs egyetlen
                születésnapos sem. */}
            {membersLoading ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Születésnaposok betöltése…
              </div>
            ) : membersError ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  A születésnaposok listáját most nem sikerült betölteni, ezért nem mutatunk
                  hiányos listát. Ellenőrizd az internetkapcsolatot, és próbáld újra.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                  onClick={() => setMembersError(false)}
                >
                  Újrapróbálom
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Nincs találat a megadott szűrőkhöz.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Nap
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Név
                      </th>
                      {showAddress && (
                        <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Lakhely
                        </th>
                      )}
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Kor
                      </th>
                      <th className="w-10" aria-label="Üdvözlőkártya" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-mono text-xs text-teal-700">
                          {String(e.month + 1).padStart(2, '0')}.
                          {String(e.day).padStart(2, '0')}.
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {e.name}
                          {e.isMale === true && <span className="ml-1.5 text-xs text-sky-500">♂</span>}
                          {e.isMale === false && <span className="ml-1.5 text-xs text-rose-500">♀</span>}
                        </td>
                        {showAddress && (
                          <td className="px-2 py-2 text-xs italic text-slate-500 max-w-[16rem] truncate">
                            {e.address || '—'}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right text-xs text-slate-500">
                          {e.age} éves
                        </td>
                        <td className="w-10 px-1 py-1 text-right">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-amber-600 transition hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                            title={`Üdvözlőkártya: ${e.name}`}
                            aria-label={`Üdvözlőkártya készítése — ${e.name}`}
                            onClick={() => { setCardPersonId(e.id); setCardOpen(true) }}
                          >
                            <Gift className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 2026-08-01 (PR-19): megosztható születésnapi üdvözlőkártya */}
        <BirthdayCardDialog
          open={cardOpen}
          onOpenChange={setCardOpen}
          people={filtered.map((e): BirthdayCardPerson => ({
            id: e.id,
            name: e.name,
            month: e.month,
            day: e.day,
            age: e.age,
          }))}
          initialPersonId={cardPersonId}
          congregationName={headerName}
          congregationLogo={headerLogo}
        />

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="mr-2 size-4" />
            Bezárás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
