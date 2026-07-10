'use client'

/**
 * Bankszámla hozzáadás / szerkesztés dialog — a Pénzügy → Bank fülről indítva.
 *
 * Ez a modal egy egyszerűsített UI-t kínál a bankszámlák gyors kezeléséhez
 * közvetlenül a pénzügyi kontextusból, a Gyülekezet beállításokba való
 * átnavigálás nélkül.
 *
 * Funkciók:
 *   - Új bankszámla rögzítése (bármilyen devizában)
 *   - Létező bankszámla szerkesztése (név, IBAN, nyitó egyenleg, aktív)
 *   - Alapértelmezett megjelölés
 *   - Szín-választó (a kártyák színét adja)
 *
 * 2026-07-10 (S4-#9): újratervezés több-deviza támogatással:
 *   - KERESHETŐ deviza-választó: gyakori devizák elöl (RON, EUR, HUF, USD,
 *     GBP, CHF) + a teljes ISO-4217 lista statikus tömbből (nincs új függőség)
 *   - Jól látható input-mezők (border-slate-300 + bg-white + shadow-sm)
 *   - IBAN alap format-ellenőrzés (RO + 22 karakter) — CSAK figyelmeztetés,
 *     nem blokkol (külföldi IBAN is megengedett)
 *   - Magyarázat: a deviza-számlák tételei napi BNR árfolyamon váltódnak RON-ra
 *
 * A háttér-művelethez a `saveCongregationBankAccount` akciót használjuk
 * (ugyanaz mint a Gyülekezet dialog).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Landmark,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveCongregationBankAccount } from '@/app/(dashboard)/congregation/actions'
import type { BankAccount } from '@/lib/constants/finance'

// 2026-07-10 (S4-#9): közös, JÓL LÁTHATÓ input-mező stílus — eddig a mezők
// beleolvadtak a világos háttérbe.
const FIELD_INPUT_CLS =
  'rounded-lg border-slate-300 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-200'

type CurrencyOption = { code: string; name: string }

/** 2026-07-10 (S4-#9): gyakori devizák — a kereshető lista TETEJÉN jelennek meg. */
const COMMON_CURRENCIES: CurrencyOption[] = [
  { code: 'RON', name: 'román lej' },
  { code: 'EUR', name: 'euró' },
  { code: 'HUF', name: 'magyar forint' },
  { code: 'USD', name: 'amerikai dollár' },
  { code: 'GBP', name: 'angol font' },
  { code: 'CHF', name: 'svájci frank' },
]

/** 2026-07-10 (S4-#9): a teljes ISO-4217 lista (a gyakoriakon felül) —
 *  statikus konstans-tömb, szándékosan NEM külső npm csomag. */
const OTHER_CURRENCIES: CurrencyOption[] = [
  { code: 'AED', name: 'emírségekbeli dirham' },
  { code: 'AFN', name: 'afgán afgáni' },
  { code: 'ALL', name: 'albán lek' },
  { code: 'AMD', name: 'örmény dram' },
  { code: 'ANG', name: 'holland antilláki gulden' },
  { code: 'AOA', name: 'angolai kwanza' },
  { code: 'ARS', name: 'argentin peso' },
  { code: 'AUD', name: 'ausztrál dollár' },
  { code: 'AWG', name: 'arubai florin' },
  { code: 'AZN', name: 'azeri manat' },
  { code: 'BAM', name: 'bosnyák konvertibilis márka' },
  { code: 'BBD', name: 'barbadosi dollár' },
  { code: 'BDT', name: 'bangladesi taka' },
  { code: 'BGN', name: 'bolgár leva' },
  { code: 'BHD', name: 'bahreini dinár' },
  { code: 'BIF', name: 'burundi frank' },
  { code: 'BMD', name: 'bermudai dollár' },
  { code: 'BND', name: 'brunei dollár' },
  { code: 'BOB', name: 'bolíviai boliviano' },
  { code: 'BRL', name: 'brazil real' },
  { code: 'BSD', name: 'bahamai dollár' },
  { code: 'BTN', name: 'bhutáni ngultrum' },
  { code: 'BWP', name: 'botswanai pula' },
  { code: 'BYN', name: 'belarusz rubel' },
  { code: 'BZD', name: 'belize-i dollár' },
  { code: 'CAD', name: 'kanadai dollár' },
  { code: 'CDF', name: 'kongói frank' },
  { code: 'CLP', name: 'chilei peso' },
  { code: 'CNY', name: 'kínai jüan' },
  { code: 'COP', name: 'kolumbiai peso' },
  { code: 'CRC', name: 'costa rica-i colón' },
  { code: 'CUP', name: 'kubai peso' },
  { code: 'CVE', name: 'zöld-foki escudo' },
  { code: 'CZK', name: 'cseh korona' },
  { code: 'DJF', name: 'dzsibuti frank' },
  { code: 'DKK', name: 'dán korona' },
  { code: 'DOP', name: 'dominikai peso' },
  { code: 'DZD', name: 'algériai dinár' },
  { code: 'EGP', name: 'egyiptomi font' },
  { code: 'ERN', name: 'eritreai nakfa' },
  { code: 'ETB', name: 'etióp birr' },
  { code: 'FJD', name: 'fidzsi dollár' },
  { code: 'FKP', name: 'falkland-szigeteki font' },
  { code: 'GEL', name: 'grúz lari' },
  { code: 'GHS', name: 'ghánai cedi' },
  { code: 'GIP', name: 'gibraltári font' },
  { code: 'GMD', name: 'gambiai dalasi' },
  { code: 'GNF', name: 'guineai frank' },
  { code: 'GTQ', name: 'guatemalai quetzal' },
  { code: 'GYD', name: 'guyanai dollár' },
  { code: 'HKD', name: 'hongkongi dollár' },
  { code: 'HNL', name: 'hondurasi lempira' },
  { code: 'HTG', name: 'haiti gourde' },
  { code: 'IDR', name: 'indonéz rúpia' },
  { code: 'ILS', name: 'izraeli új sékel' },
  { code: 'INR', name: 'indiai rúpia' },
  { code: 'IQD', name: 'iraki dinár' },
  { code: 'IRR', name: 'iráni riál' },
  { code: 'ISK', name: 'izlandi korona' },
  { code: 'JMD', name: 'jamaicai dollár' },
  { code: 'JOD', name: 'jordániai dinár' },
  { code: 'JPY', name: 'japán jen' },
  { code: 'KES', name: 'kenyai shilling' },
  { code: 'KGS', name: 'kirgiz szom' },
  { code: 'KHR', name: 'kambodzsai riel' },
  { code: 'KMF', name: 'comore-i frank' },
  { code: 'KPW', name: 'észak-koreai von' },
  { code: 'KRW', name: 'dél-koreai von' },
  { code: 'KWD', name: 'kuvaiti dinár' },
  { code: 'KYD', name: 'kajmán-szigeteki dollár' },
  { code: 'KZT', name: 'kazah tenge' },
  { code: 'LAK', name: 'laoszi kip' },
  { code: 'LBP', name: 'libanoni font' },
  { code: 'LKR', name: 'Srí Lanka-i rúpia' },
  { code: 'LRD', name: 'libériai dollár' },
  { code: 'LSL', name: 'lesothói loti' },
  { code: 'LYD', name: 'líbiai dinár' },
  { code: 'MAD', name: 'marokkói dirham' },
  { code: 'MDL', name: 'moldáv lej' },
  { code: 'MGA', name: 'madagaszkári ariary' },
  { code: 'MKD', name: 'macedón dénár' },
  { code: 'MMK', name: 'mianmari kyat' },
  { code: 'MNT', name: 'mongol tugrik' },
  { code: 'MOP', name: 'makaói pataca' },
  { code: 'MRU', name: 'mauritániai ouguiya' },
  { code: 'MUR', name: 'mauritiusi rúpia' },
  { code: 'MVR', name: 'maldív rúfia' },
  { code: 'MWK', name: 'malawi kwacha' },
  { code: 'MXN', name: 'mexikói peso' },
  { code: 'MYR', name: 'maláj ringgit' },
  { code: 'MZN', name: 'mozambiki metical' },
  { code: 'NAD', name: 'namíbiai dollár' },
  { code: 'NGN', name: 'nigériai naira' },
  { code: 'NIO', name: 'nicaraguai córdoba' },
  { code: 'NOK', name: 'norvég korona' },
  { code: 'NPR', name: 'nepáli rúpia' },
  { code: 'NZD', name: 'új-zélandi dollár' },
  { code: 'OMR', name: 'ománi riál' },
  { code: 'PAB', name: 'panamai balboa' },
  { code: 'PEN', name: 'perui sol' },
  { code: 'PGK', name: 'pápua új-guineai kina' },
  { code: 'PHP', name: 'fülöp-szigeteki peso' },
  { code: 'PKR', name: 'pakisztáni rúpia' },
  { code: 'PLN', name: 'lengyel zloty' },
  { code: 'PYG', name: 'paraguayi guaraní' },
  { code: 'QAR', name: 'katari riál' },
  { code: 'RSD', name: 'szerb dinár' },
  { code: 'RUB', name: 'orosz rubel' },
  { code: 'RWF', name: 'ruandai frank' },
  { code: 'SAR', name: 'szaúdi riál' },
  { code: 'SBD', name: 'salamon-szigeteki dollár' },
  { code: 'SCR', name: 'seychelle-i rúpia' },
  { code: 'SDG', name: 'szudáni font' },
  { code: 'SEK', name: 'svéd korona' },
  { code: 'SGD', name: 'szingapúri dollár' },
  { code: 'SHP', name: 'Szent Ilona-i font' },
  { code: 'SLE', name: 'Sierra Leone-i leone' },
  { code: 'SOS', name: 'szomáliai shilling' },
  { code: 'SRD', name: 'suriname-i dollár' },
  { code: 'SSP', name: 'dél-szudáni font' },
  { code: 'STN', name: 'São Tomé-i dobra' },
  { code: 'SYP', name: 'szíriai font' },
  { code: 'SZL', name: 'szváziföldi lilangeni' },
  { code: 'THB', name: 'thai baht' },
  { code: 'TJS', name: 'tádzsik szomoni' },
  { code: 'TMT', name: 'türkmén manat' },
  { code: 'TND', name: 'tunéziai dinár' },
  { code: 'TOP', name: 'tongai paanga' },
  { code: 'TRY', name: 'török líra' },
  { code: 'TTD', name: 'Trinidad és Tobagó-i dollár' },
  { code: 'TWD', name: 'tajvani dollár' },
  { code: 'TZS', name: 'tanzániai shilling' },
  { code: 'UAH', name: 'ukrán hrivnya' },
  { code: 'UGX', name: 'ugandai shilling' },
  { code: 'UYU', name: 'uruguayi peso' },
  { code: 'UZS', name: 'üzbég szom' },
  { code: 'VES', name: 'venezuelai bolívar' },
  { code: 'VND', name: 'vietnámi dong' },
  { code: 'VUV', name: 'vanuatui vatu' },
  { code: 'WST', name: 'szamoai tala' },
  { code: 'XAF', name: 'közép-afrikai CFA frank' },
  { code: 'XCD', name: 'kelet-karibi dollár' },
  { code: 'XOF', name: 'nyugat-afrikai CFA frank' },
  { code: 'XPF', name: 'csendes-óceáni CFP frank' },
  { code: 'YER', name: 'jemeni riál' },
  { code: 'ZAR', name: 'dél-afrikai rand' },
  { code: 'ZMW', name: 'zambiai kwacha' },
  { code: 'ZWG', name: 'zimbabwei ZiG' },
]

const ALL_CURRENCIES: CurrencyOption[] = [...COMMON_CURRENCIES, ...OTHER_CURRENCIES]

/** Ékezet- és kisbetű-érzéketlen normalizálás a kereséshez.
 *  Az NFD-bontás után a kombináló ékezet-jeleket (Unicode Mark kategória)
 *  távolítjuk el. */
function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * 2026-07-10 (S4-#9): IBAN alap format-ellenőrzés — CSAK FIGYELMEZTETÉS,
 * sosem blokkolja a mentést (külföldi IBAN is megengedett).
 *   - Román IBAN: "RO" + 22 karakter = összesen 24
 *   - Egyéb: 2 betű országkód + 2 számjegy ellenőrzőszám + max 30 karakter
 */
function getIbanWarning(raw: string): string | null {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (!iban) return null
  if (iban.startsWith('RO')) {
    if (iban.length !== 24) {
      return `A román IBAN 24 karakter hosszú (RO + 22) — a beírt érték ${iban.length} karakter. Ellenőrizd a számot.`
    }
    if (!/^RO\d{2}[A-Z0-9]{20}$/.test(iban)) {
      return 'A román IBAN formátuma: RO + 2 számjegy + 20 karakter. Ellenőrizd a beírt értéket.'
    }
    return null
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) {
    return 'Az IBAN formátuma szokatlan (2 betűs országkód + 2 számjegy + azonosító). Külföldi IBAN esetén is érdemes ellenőrizni.'
  }
  return null
}

/**
 * 2026-07-10 (S4-#9): kereshető deviza-választó — gyakori devizák elöl,
 * alatta a teljes ISO-4217 lista. Nincs külső függőség; a mintát a
 * SearchableCategorySelect adta (egyszerűsítve, a dialogon belüli
 * abszolút pozicionálással).
 */
function CurrencySearchSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = ALL_CURRENCIES.find((c) => c.code === value) || null

  // Szűrés: kód VAGY név alapján, ékezet-érzéketlenül
  const { common, others } = useMemo(() => {
    const q = normalizeSearch(search)
    const match = (c: CurrencyOption) =>
      !q || normalizeSearch(c.code).includes(q) || normalizeSearch(c.name).includes(q)
    return {
      common: COMMON_CURRENCIES.filter(match),
      others: OTHER_CURRENCIES.filter(match),
    }
  }, [search])
  const flat = useMemo(() => [...common, ...others], [common, others])

  // Klikk-kívüli bezárás
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Nyitáskor fókusz a keresőmezőre. (A kiemelés-visszaállítás az openDropdown
  // eseménykezelőben történik — effektben szinkron setState tilos.)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // Nyitás — a kiemelés az első elemre áll vissza.
  function openDropdown() {
    setHighlightIdx(0)
    setOpen(true)
  }

  function pick(code: string) {
    onChange(code)
    setOpen(false)
    setSearch('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const p = flat[highlightIdx]
      if (p) pick(p.code)
    }
  }

  function renderItem(c: CurrencyOption, idx: number) {
    const isSelected = c.code === value
    const isHighlight = idx === highlightIdx
    return (
      <li
        key={c.code}
        role="option"
        aria-selected={isSelected}
        onClick={() => pick(c.code)}
        onMouseEnter={() => setHighlightIdx(idx)}
        className={`flex min-h-[40px] cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
          isHighlight ? 'bg-violet-50' : ''
        } ${isSelected ? 'font-medium text-violet-700' : 'text-slate-700'}`}
      >
        <span className="w-11 shrink-0 font-mono text-xs font-semibold text-slate-500">
          {c.code}
        </span>
        <span className="flex-1 truncate">{c.name}</span>
        {isSelected && <Check className="size-4 shrink-0 text-violet-600" />}
      </li>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={handleKeyDown}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm shadow-sm transition hover:border-slate-400 focus:outline-none focus-visible:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 truncate text-slate-800">
          <span className="font-mono font-semibold">{value}</span>
          {selected && <span className="text-slate-500"> — {selected.name}</span>}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlightIdx(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Keresés: kód vagy név…"
              className="w-full bg-transparent px-3 py-2.5 pl-9 text-sm outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Keresés törlése"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto">
            {flat.length === 0 ? (
              <p className="p-4 text-center text-sm italic text-slate-400">
                Nincs találat — próbáld a 3 betűs ISO-kóddal (pl. SEK).
              </p>
            ) : (
              <ul role="listbox" className="py-1">
                {common.length > 0 && (
                  <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Gyakori
                  </li>
                )}
                {common.map((c, idx) => renderItem(c, idx))}
                {others.length > 0 && (
                  <li className="border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Összes deviza (ISO-4217)
                  </li>
                )}
                {others.map((c, idx) => renderItem(c, common.length + idx))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Gyorsválasztó színek — a bankkártyák hátteréhez. */
const COLOR_SWATCHES = [
  '#206bc4', // kék
  '#059669', // zöld
  '#7c3aed', // lila
  '#d97706', // narancs
  '#dc2626', // piros
  '#0891b2', // cián
  '#4338ca', // indigó
  '#65a30d', // olíva
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadott: szerkesztési mód. */
  account?: BankAccount | null
  /** Az aktív gyülekezet ID-ja. */
  congregationId: string
  /** Sikeres mentés után. */
  onSaved?: () => void | Promise<void>
}

export function BankAccountDialog({
  open,
  onOpenChange,
  account,
  congregationId,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [bankNeve, setBankNeve] = useState('')
  const [iban, setIban] = useState('')
  const [valuta, setValuta] = useState('RON')
  const [nyitoEgyenleg, setNyitoEgyenleg] = useState<number | ''>(0)
  const [szin, setSzin] = useState('#206bc4')
  const [isDefault, setIsDefault] = useState(false)
  const [aktiv, setAktiv] = useState(true)

  // 2026-07-10 (S4-#9): élő IBAN-figyelmeztetés (nem blokkol)
  const ibanWarning = useMemo(() => getIbanWarning(iban), [iban])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      // Betöltéskor: vagy szerkesztési adatokkal, vagy üres űrlappal
      if (account) {
        setBankNeve(account.bank_neve || '')
        setIban(account.iban || '')
        setValuta(account.valuta || 'RON')
        setNyitoEgyenleg(account.nyito_egyenleg ?? 0)
        setSzin(account.szin || '#206bc4')
        setIsDefault(account.is_default || false)
        setAktiv(account.aktiv !== false)
      } else {
        setBankNeve('')
        setIban('')
        setValuta('RON')
        setNyitoEgyenleg(0)
        setSzin('#206bc4')
        setIsDefault(false)
        setAktiv(true)
      }
    })
    return () => { cancelled = true }
  }, [open, account])

  async function handleSave() {
    if (!bankNeve.trim() || bankNeve.trim().length < 2) {
      toast.error('A bankszámla nevéhez legalább 2 karakter kell.')
      return
    }

    setSaving(true)
    const payload = {
      id: account?.id,
      bankNeve: bankNeve.trim(),
      iban: iban.trim() || undefined,
      valuta: valuta.trim().toUpperCase(),
      nyitoEgyenleg: typeof nyitoEgyenleg === 'number' ? nyitoEgyenleg : 0,
      szin,
      ikon: 'building-2',
      isDefault,
      aktiv,
    }

    const result = await saveCongregationBankAccount(congregationId, payload)
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(account ? 'Bankszámla frissítve.' : 'Bankszámla hozzáadva.')
    onOpenChange(false)
    if (onSaved) await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-xl
          max-h-[90vh] overflow-y-auto
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-violet-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm">
              <Landmark className="size-5" />
            </span>
            {account ? 'Bankszámla szerkesztése' : 'Új bankszámla hozzáadása'}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            A bankszámla a pénzügyi forgalom könyveléséhez szükséges. Többféle devizát
            is használhat egymás mellett.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-5">
          {/* Megnevezés */}
          <div className="space-y-1.5">
            <Label>Megnevezés *</Label>
            <Input
              value={bankNeve}
              onChange={(e) => setBankNeve(e.target.value)}
              placeholder="pl. BCR fő számla"
              className={`h-11 ${FIELD_INPUT_CLS}`}
            />
            <p className="text-[11px] text-slate-500">
              Ez jelenik meg a bankkártyán (pl. &bdquo;BCR fő számla&rdquo;, &bdquo;OTP EUR&rdquo;).
            </p>
          </div>

          {/* IBAN + Deviza */}
          <div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="RO00 XXXX 0000 0000 0000 0000"
                className={`h-11 font-mono text-sm tracking-wide ${FIELD_INPUT_CLS}`}
              />
              {/* 2026-07-10 (S4-#9): alap format-ellenőrzés — csak WARNING,
                  nem blokkol (külföldi IBAN is megengedett). */}
              {ibanWarning ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>{ibanWarning}</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">Opcionális, de ajánlott banki importhoz.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Deviza *</Label>
              {/* 2026-07-10 (S4-#9): kereshető deviza-lista — gyakoriak elöl,
                  teljes ISO-4217 kereshetően. */}
              <CurrencySearchSelect value={valuta} onChange={setValuta} />
              <p className="text-[11px] leading-snug text-slate-500">
                A deviza-számlák tételei az adott napi BNR árfolyamon számítódnak át RON-ra.
              </p>
            </div>
          </div>

          {/* Nyitó egyenleg — a Bank fülön / banki import során ÉVENKÉNTI bontásban kezelt */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-1">
              💡 Nyitó egyenleget hol adhatod meg?
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              A bankszámla létrehozásakor NEM kötelező a nyitó egyenleg. Az első
              banki Excel import során (<strong>Pénzügy → Bank → Excel import</strong>)
              a wizard megkérdezi az <strong>év eleji nyitó egyenleget</strong> (évenként).
              Valutás számlánál <strong>RON ekvivalenst is</strong> megad (árfolyammal).
            </p>
            {account && (
              <p className="text-[11px] text-slate-500 mt-2">
                Szerkesztési módban: a korábban rögzített induló érték megmarad,
                az éves nyitók kezelése a Bank fülre költözött.
              </p>
            )}
          </div>

          {/* Szín */}
          <div className="space-y-1.5">
            <Label>Szín</Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSzin(c)}
                  className={`size-9 rounded-xl border-2 transition-all ${
                    szin === c ? 'border-slate-800 scale-110 shadow-md' : 'border-white hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Szín ${c}`}
                />
              ))}
              <Input
                type="color"
                value={szin}
                onChange={(e) => setSzin(e.target.value)}
                className="w-12 h-9 p-1"
              />
            </div>
          </div>

          {/* Kártya-előnézet */}
          <div className="card-raised p-4">
            <div className="text-[10px] uppercase text-slate-400 tracking-wider mb-2">
              Előnézet
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${szin}15` }}
              >
                <Building2 className="h-5 w-5" style={{ color: szin }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">
                  {bankNeve || 'Bankszámla neve'}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {iban || 'Nincs IBAN'} · {valuta}
                </p>
                <p className="text-[11px] text-slate-500">
                  Nyitó egyenleg:{' '}
                  {typeof nyitoEgyenleg === 'number'
                    ? nyitoEgyenleg.toLocaleString('hu-HU', { maximumFractionDigits: 2 })
                    : '0'}{' '}
                  {valuta}
                </p>
              </div>
            </div>
          </div>

          {/* Kapcsolók */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Legyen az alapértelmezett bankszámla
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={aktiv}
                onChange={(e) => setAktiv(e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Aktív (használatban)
            </label>
          </div>

          {/* Mentés / Mégse */}
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                </>
              ) : account ? (
                'Módosítások mentése'
              ) : (
                'Bankszámla hozzáadása'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
