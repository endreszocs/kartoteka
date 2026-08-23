'use client'

/**
 * Hiányzó nyugták — BEVÉTELI ELSZÁMOLÁS (Decont de încasări). (Endre, 2026-07-02.)
 *
 * A Nyugtafigyelő „hiányzó nyugták" gombja nyitja. Könyvelői háttér (OMF 2634/2015):
 * a már KIÁLLÍTOTT Chitanță maga a bizonylat → minden nyugtát a saját Irat sz.-ával
 * BEVÉTELKÉNT a kasszába (Registrul de casă) könyvelünk, „utólag elszámolt" nyommal.
 *
 * #Endre észrevételek (2026-07-02):
 *  1. Ez ELSZÁMOLÁS (decont), bevétellel — nem „Dispoziție de încasare".
 *  2. A Kerületi sz. a szomszédos nyugták számaiból KIKÖVETKEZTETVE előtöltődik
 *     (missingReceipts a computeReceiptHealth-ből).
 *  3. Egy nyugtára TÖBB befizető is rögzíthető (a nyugtán több név szerepelhet);
 *     a tag-párosítás OPCIONÁLIS (nem gyülekezeti tag is adhat adományt);
 *     részletes kereső (avatar + életkor + cím).
 *  4. ÉLŐ A4 ELŐNÉZET a decont-ablak mintájára (buildDecontIncasareHtml + iframe).
 *
 * 2026-07-10 (ÚJ #4): (a) nyugtánként KÜLÖN jogcím — a fejléc közös selectje marad
 * alapértéknek/kitöltőnek, a kártyán kompakt select írja felül; (b) CSALÁD is lehet
 * befizető — a kereső a személyek MELLETT családokat is ad (searchFamilies), a család
 * EGY payerként kerül a sorhoz id_csalad-dal; (c) kereső-finomítás: párhuzamos
 * személy+család lekérés, elavult-válasz-védelem (kérés-sorszám).
 *
 * Mentés: saveIncomeBatch — soronként/befizetőnként egy `befizetes` BEVÉTEL a kasszába
 * (bankszamla_id NULL), irattipus='Chitanță', nyugta = a gyülekezeti Irat sz. (így a
 * figyelő „hiányzó" listájáról lekerül), több befizetőnél a kerületi szám /N utótaggal.
 *
 * 2026-07-10 (S4-1): teljes VIZUÁLIS újratervezés — halvány hátterű könyvelés-fejléc-sáv,
 * számozott nyugta-kártyák színezett bal szegéllyel + fejléc-sávval + összeg-jelvénnyel,
 * avatar-kezdőbetűs befizető-sorok, „élő előnézet" címke, alsó ragadós összesítő-sáv a
 * Mentés gombbal; mobilon (lg alatt) az előnézet a lista ALÁ kerül. A működés változatlan.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, Check, Coins, Plus, Trash2, Loader2, UserPlus, Users, X } from 'lucide-react'
// 2026-07-10 (ÚJ #4): searchFamilies — a kereső a személyek mellett családokat is ajánl.
//
// 2026-08-23 (kisebb rések, 2.): a befizető-kereső a SCOPE-TUDATOS
// `searchIncomePartners`-re költözött. A régi `searchMembersForFinance` a
// `getProfileCongregation()`-ből jövő `effectiveCongregationId`-re szűr, ami
// FELSŐ SZINTŰ (megyei/kerületi) aktív profilnál definíció szerint `null` →
// azonnali üres tömb, hibaüzenet nélkül. A fő tétel-rögzítő (combined-entry-dialog)
// már 2026-08-22 óta az új keresőt hívja; ez az ablak és a bérleti szerződés
// dialógus a RÉGIT őrizte — pontosan a projekt visszatérő hibaosztálya
// („a második felület a régi implementációt őrzi").
//
// ⚠️ A GYÜLEKEZETI VISELKEDÉS VÁLTOZATLAN: a `searchIncomePartners`
// `congregation` ága a MAI tag-kereső törzsét futtatja (`queryCongregationMembers`,
// penzugy/actions.ts) — ugyanaz a select, ugyanaz a három szűrő, ugyanaz a limit.
import { saveIncomeBatch, searchFamilies, searchIncomePartners } from '@/app/(dashboard)/penzugy/actions'
import type { IncomeBatchRowInput } from '@/lib/validations/finance'
import { buildDecontIncasareHtml, type DecontIncasareItem, type MissingReceipt } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingNumbers: number[]
  /** #Endre (issue 2): iratSz + kikövetkeztetett keruletiSz párok — ha van, ebből seedelünk. */
  missingReceipts?: MissingReceipt[]
  incomeCategories: Array<{ id: number; nev: string; kod?: string }>
  defaultDate?: string
  /** Az élő előnézet fejlécéhez (Unitate). */
  congregationName?: string
  /** 2026-08-22 (6. pont): a hivatalos ROMÁN név (`nev_ro`) — a végig román
   *  DECONT DE ÎNCASĂRI „Unitate" sávjába, a magyar név mellé. Ha nincs, csak a
   *  magyar áll ott (kitalált román nevet SOHA nem írunk a lapra). */
  congregationNameRo?: string
  onDone?: () => void
}

/** Egy befizető egy nyugtán — az id OPCIONÁLIS (null = nem gyülekezeti tag / szabad szöveg). */
// 2026-07-10 (ÚJ #4): familyId — CSALÁD is lehet befizető (mentéskor id_csalad); az id-vel kölcsönösen kizáró.
type Payer = { uid: string; id: number | null; familyId: number | null; name: string; osszeg: string }
// 2026-07-10 (ÚJ #4): categoryId — a nyugta SAJÁT jogcíme (null = a fejléc közös jogcímét örökli).
type Row = { id: string; iratsz: string; keruleti: string; categoryId: number | null; people: Payer[] }

/** A `searchIncomePartners` egy sora (a szerver típusa `'use server'` fájlban él,
 *  ezért nem importálható — a hívás visszatérési típusából vezetjük le). */
type PartnerTalalat = Awaited<ReturnType<typeof searchIncomePartners>>[number]

// 2026-07-10 (ÚJ #4): kind — a találat személy VAGY család (a család egy payerként kerül a sorhoz).
//
// 2026-08-23 (kisebb rések, 2.): harmadik fajta — `'partner'`. Felső (megyei /
// kerületi) hatókörben a kereső GYÜLEKEZETEKET, LELKÉSZEKET és EGYHÁZMEGYÉKET is
// ad vissza. ⛔ EZEK AZONOSÍTÓJA NEM `szemely.id`: a szerver NEGATÍV ál-azonosítót
// oszt nekik, épp azért, hogy soha ne kerülhessen `id_szemely` idegen kulcsba.
// A `'partner'` találat ezért CSAK A NEVET adja (szabad szövegként) — a mentés
// `id_szemely`/`id_csalad` mezője marad `null`.
type Hit = {
  kind: 'person' | 'family' | 'partner'
  id: number
  name: string
  detail?: string
  age?: number
  birthYear?: string
  /** `'partner'` találatnál a fajta magyar címkéje (gyülekezet / lelkész / egyházmegye). */
  badge?: string
}

/** A felső szintű partner-fajták magyar címkéi (a találat-chiphez). */
const PARTNER_CIMKEK: Record<string, string> = {
  gyulekezet: 'gyülekezet',
  lelkesz: 'lelkész',
  egyhazmegye: 'egyházmegye',
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const uid = () => `${Math.random().toString(36).slice(2)}-${Date.now()}`
const ron = (n: number) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`

function ageFromBirth(szDatum: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(szDatum || ''))
  if (!m) return null
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}
/**
 * A scope-tudatos kereső egy sora → találat.
 *
 * ⛔ A `kind !== 'szemely'` sorok NEM lesznek `'person'`-ok. A szerver ezekhez
 * NEGATÍV ál-azonosítót ad (nem `szemely.id`), tehát a `'person'`-ná alakítás
 * egy nem létező személy azonosítóját tolná az `id_szemely` idegen kulcsba a
 * mentésnél.
 */
function toHit(sor: PartnerTalalat): Hit {
  if (sor.kind === 'szemely') {
    return {
      kind: 'person',
      id: sor.id,
      name: sor.name,
      detail: sor.detail ?? undefined,
      age: ageFromBirth(sor.szDatum) ?? undefined,
      birthYear: sor.szDatum ? String(sor.szDatum).slice(0, 4) : undefined,
    }
  }
  return {
    kind: 'partner',
    id: sor.id,
    name: sor.name,
    detail: sor.detail ?? undefined,
    badge: PARTNER_CIMKEK[sor.kind] ?? 'partner',
  }
}

const emptyPayer = (): Payer => ({ uid: uid(), id: null, familyId: null, name: '', osszeg: '' })

// ── Befizető-kereső (portálos dropdown — a CombinedEntryBody PayerNameSearch mintájára) ──
// Avatar + életkor-badge + cím-detail; a tag-párosítás OPCIONÁLIS (szabad szöveg is mehet).
// 2026-07-10 (ÚJ #4): a személyek MELLETT családok is a találatok közt (searchFamilies).
function PayerSearch({
  value, linkedKind, onType, onPick, autoFocus,
}: {
  value: string
  /** 2026-07-10 (ÚJ #4): mihez kötött a mező — 'person' | 'family' | null (szabad szöveg). */
  linkedKind: 'person' | 'family' | null
  onType: (t: string) => void
  onPick: (h: Hit) => void
  autoFocus?: boolean
}) {
  const linked = linkedKind != null
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  /**
   * 2026-08-23 (kisebb rések, 2.): a keresés HIBÁJA LÁTHATÓ.
   *
   * Eddig `.catch(() => [])` állt a két hívás körül: hálózati hiba, RLS-tiltás és
   * „tényleg nincs találat" PONTOSAN UGYANÚGY nézett ki — üres lista, néma
   * képernyő. A lelkész ilyenkor azt hitte, a tag nincs a rendszerben, és szabad
   * szövegként rögzítette (elveszett a személy-kötés), vagy percekig gépelt egy
   * halott keresőbe. `null` = nincs gond; string = a látható magyar magyarázat.
   */
  const [hiba, setHiba] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  // 2026-07-10 (ÚJ #4): kérés-sorszám — az elavult (lassabb) válasz nem írja felül a frissebbet.
  const seqRef = useRef(0)
  const justPickedRef = useRef(false)
  const [dropRect, setDropRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const measure = () => {
    const el = inputRef.current
    if (!el) { setDropRect(null); return }
    const r = el.getBoundingClientRect()
    setDropRect({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  useEffect(() => {
    if (autoFocus) queueMicrotask(() => inputRef.current?.focus())
  }, [autoFocus])

  useEffect(() => {
    // 2026-08-23: a HIBA-doboz is a mérésre épül (ugyanoda kerül, mint a
    // találati lista) — enélkül a hibaüzenetnek nem volna hova kirajzolódnia.
    if (!open && !hiba) return
    // setState mikrotaszkban (react-hooks/set-state-in-effect — a kódbázis mintája)
    queueMicrotask(measure)
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, hits, hiba])

  useEffect(() => {
    const reset = () => queueMicrotask(() => { setHits([]); setOpen(false); setHiba(null) })
    if (linked) { reset(); return }
    if (justPickedRef.current) { justPickedRef.current = false; return }
    const q = value.trim()
    if (q.length < 2) { reset(); return }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    queueMicrotask(() => setLoading(true))
    debounceRef.current = window.setTimeout(() => {
      // 2026-07-10 (ÚJ #4): befizető + család PÁRHUZAMOSAN; kérés-sorszámmal az elavult
      // válasz eldobódik (gyors gépelésnél a lassabb korábbi kérés nem írja felül a frissebbet).
      //
      // 2026-08-23 (kisebb rések, 2.): `allSettled`, NEM `all` + `catch(() => [])`.
      //  · az `all` egyetlen elbukó ágnál MINDKÉT listát eldobná,
      //  · a `catch(() => [])` viszont NÉMÁN üres listát adott — a hiba
      //    megkülönböztethetetlen volt a „nincs találat"-tól.
      // Így ági bontásban tudjuk, MI bukott el, a másik ág találatai megmaradnak,
      // és a felhasználó LÁTHATÓ magyar mondatot kap.
      const seq = ++seqRef.current
      void Promise.allSettled([searchIncomePartners(q), searchFamilies(q)])
        .then(([partnerAg, csaladAg]) => {
          if (seq !== seqRef.current) return
          const gondok: string[] = []

          let partnerHits: Hit[] = []
          if (partnerAg.status === 'fulfilled') {
            partnerHits = (partnerAg.value || []).map(toHit).slice(0, 8)
          } else {
            gondok.push('a befizető-kereső')
          }

          let familyHits: Hit[] = []
          if (csaladAg.status === 'fulfilled') {
            familyHits = (csaladAg.value || [])
              .slice(0, 4)
              .map((f) => ({ kind: 'family' as const, id: f.id, name: f.name, detail: f.detail }))
          } else {
            gondok.push('a család-kereső')
          }

          setHiba(
            gondok.length === 0
              ? null
              : `${gondok.join(' és ')} most nem válaszolt, ezért a lista hiányos lehet. ` +
                'Ellenőrizd az internetkapcsolatot, és gépelj újra — addig a nevet szabad szövegként is beírhatod.',
          )
          const merged = [...partnerHits, ...familyHits]
          setHits(merged)
          setOpen(merged.length > 0)
        })
        .finally(() => { if (seq === seqRef.current) setLoading(false) })
    }, 300)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [value, linked])

  return (
    <div className="relative flex items-center gap-1.5">
      {linkedKind === 'person' && (
        <span className="inline-block size-2 shrink-0 rounded-full bg-emerald-500" title="Regisztrált tag hozzárendelve" />
      )}
      {/* 2026-07-10 (ÚJ #4): család-jelvény — a tétel a családhoz kapcsolódik (id_csalad). */}
      {linkedKind === 'family' && (
        <span
          className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700"
          title="Család hozzárendelve — a tétel a családhoz kapcsolódik"
        >
          család
        </span>
      )}
      <input
        ref={inputRef}
        className={`h-8 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 ${
          linkedKind === 'family'
            ? 'border-sky-300 bg-sky-50/50 font-medium text-sky-900 focus-visible:ring-sky-400'
            : linked
              ? 'border-emerald-300 bg-emerald-50/50 font-medium text-emerald-900 focus-visible:ring-emerald-400'
              : 'border-slate-300 bg-white focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25'
        }`}
        value={value}
        placeholder="Név — tag-kereső VAGY szabad szöveg"
        onChange={(e) => onType(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => hits.length > 0 && setOpen(true)}
      />
      {loading && <Loader2 className="absolute right-2 size-3.5 animate-spin text-slate-300" />}
      {/* 2026-08-23 (kisebb rések, 2.): HIBA ≠ „nincs találat". A piros chip
          azonnal látszik (a magyarázó doboz a mező alatt nyílik ki), a szürke
          „nem tag" chip pedig CSAK akkor, ha a keresés tényleg lefutott. */}
      {!linked && value.trim().length >= 2 && !loading && hiba && (
        <span
          className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700"
          title={hiba}
        >
          kereső hiba
        </span>
      )}
      {!linked && value.trim().length >= 2 && !loading && !hiba && hits.length === 0 && (
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500" title="Nincs tag-találat — szabad szövegként mentődik (nem gyülekezeti tag is adhat)">
          nem tag
        </span>
      )}
      {/* EGYETLEN portál a hibaüzenetnek ÉS a találatoknak — két külön lebegő
          doboz ugyanarra a koordinátára egymásra csúszna, és a hiba szövege
          eltakarná a listát (vagy fordítva). */}
      {((open && hits.length > 0) || hiba) && dropRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[200] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl ring-1 ring-black/5"
            style={{ left: dropRect.left, top: dropRect.top, width: Math.max(dropRect.width, 300) }}
          >
            {hiba && (
              <div
                role="alert"
                className="mb-1 rounded-lg border border-rose-300 bg-rose-50 p-2 text-[11px] leading-relaxed text-rose-800"
              >
                {hiba}
              </div>
            )}
            {hits.map((h) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  h.kind === 'family' ? 'hover:bg-sky-50' : h.kind === 'partner' ? 'hover:bg-amber-50' : 'hover:bg-emerald-50'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { justPickedRef.current = true; onPick(h); setHits([]); setOpen(false) }}
              >
                {/* 2026-07-10 (ÚJ #4): család-találat — Users-ikon + „család" chip (személynél avatar + életkor).
                    2026-08-23 (kisebb rések, 2.): felső szintű partner — Building2-ikon + fajta-chip. */}
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold ${
                    h.kind === 'family'
                      ? 'from-sky-100 to-indigo-100 text-sky-700'
                      : h.kind === 'partner'
                        ? 'from-amber-100 to-orange-100 text-amber-700'
                        : 'from-emerald-100 to-teal-100 text-emerald-700'
                  }`}
                >
                  {h.kind === 'family' ? (
                    <Users className="size-4" />
                  ) : h.kind === 'partner' ? (
                    <Building2 className="size-4" />
                  ) : (
                    (h.name.trim()[0] || '?').toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{h.name}</span>
                    {h.kind === 'family' ? (
                      <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 group-hover:bg-white">
                        család
                      </span>
                    ) : h.kind === 'partner' ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 group-hover:bg-white">
                        {h.badge || 'partner'}
                      </span>
                    ) : h.age != null ? (
                      <span
                        className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 group-hover:bg-white"
                        title={h.birthYear ? `Született: ${h.birthYear}` : undefined}
                      >
                        {h.age} éves
                      </span>
                    ) : null}
                  </span>
                  {h.detail && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{h.detail}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function DispozitieIncasareWizard({
  open, onOpenChange, missingNumbers, missingReceipts, incomeCategories, defaultDate, congregationName, congregationNameRo, onDone,
}: Props) {
  const [date, setDate] = useState(defaultDate || todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [megj, setMegj] = useState('Utólag elszámolt nyugta')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  // Az újonnan hozzáadott befizető mezője automatikusan fókuszt kap.
  const [focusUid, setFocusUid] = useState<string | null>(null)

  // Megnyitáskor friss állapot + seed: missingReceipts (Kerületi sz. ELŐTÖLTVE a szomszédokból
  // kikövetkeztetve), fallback a nyers missingNumbers-re.
  useEffect(() => {
    if (!open) return
    setDate(defaultDate || todayIso())
    setCategoryId('')
    setMegj('Utólag elszámolt nyugta')
    setBusy(false)
    setFocusUid(null)
    const seeds: Array<{ iratsz: string; keruleti: string }> =
      missingReceipts && missingReceipts.length
        ? missingReceipts.map((m) => ({ iratsz: String(m.iratSz), keruleti: m.keruletiSz ?? '' }))
        : (missingNumbers.length ? missingNumbers : [0]).map((n) => ({ iratsz: n ? String(n) : '', keruleti: '' }))
    // 2026-07-10 (ÚJ #4): categoryId: null = a fejléc közös jogcímét örökli.
    setRows(seeds.map((s) => ({ id: uid(), iratsz: s.iratsz, keruleti: s.keruleti, categoryId: null, people: [emptyPayer()] })))
  }, [open, missingReceipts, missingNumbers, defaultDate])

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, { id: uid(), iratsz: '', keruleti: '', categoryId: null, people: [emptyPayer()] }]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? cur : cur.filter((r) => r.id !== id))) }

  // ── Befizető-műveletek (a CombinedEntryBody appendPayers/updatePayer/removePayer mintájára) ──
  function addPayer(rowId: string) {
    const p = emptyPayer()
    setRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, people: [...r.people, p] } : r)))
    setFocusUid(p.uid)
  }
  function updatePayer(rowId: string, payerUid: string, patch: Partial<Payer>) {
    setRows((cur) =>
      cur.map((r) =>
        r.id === rowId ? { ...r, people: r.people.map((p) => (p.uid === payerUid ? { ...p, ...patch } : p)) } : r,
      ),
    )
  }
  function removePayer(rowId: string, payerUid: string) {
    setRows((cur) =>
      cur.map((r) =>
        r.id === rowId
          ? { ...r, people: r.people.length === 1 ? [emptyPayer()] : r.people.filter((p) => p.uid !== payerUid) }
          : r,
      ),
    )
  }

  // Érvényes befizető: összeg > 0 ÉS (van neve VAGY taghoz/családhoz kötött) — a párosítás NEM kötelező.
  const validPayersOf = (r: Row) => r.people.filter((p) => Number(p.osszeg) > 0 && (p.name.trim() || p.id != null || p.familyId != null))
  const rowSum = (r: Row) => r.people.reduce((s, p) => s + (Number(p.osszeg) || 0), 0)
  const validRows = useMemo(() => rows.filter((r) => r.iratsz.trim() && validPayersOf(r).length > 0), [rows])
  const total = useMemo(() => validRows.reduce((s, r) => s + validPayersOf(r).reduce((x, p) => x + Number(p.osszeg), 0), 0), [validRows])
  const linkedCount = useMemo(() => validRows.reduce((s, r) => s + validPayersOf(r).filter((p) => p.id != null).length, 0), [validRows])
  // 2026-07-10 (ÚJ #4): családhoz kötött befizetők száma (összesítő + toast).
  const familyCount = useMemo(() => validRows.reduce((s, r) => s + validPayersOf(r).filter((p) => p.familyId != null).length, 0), [validRows])
  // 2026-07-10 (S4-1): összes érvényes befizető — az alsó összesítő-sáv „M befizető" számához.
  const payerCount = useMemo(() => validRows.reduce((s, r) => s + validPayersOf(r).length, 0), [validRows])

  // 2026-07-10 (ÚJ #4): a sor ÉRVÉNYES jogcíme — a saját categoryId, különben a fejléc közös jogcíme.
  const effectiveCategoryId = (r: Row): number | null => r.categoryId ?? (categoryId === '' ? null : Number(categoryId))
  const categoryNameOf = (id: number | null) => incomeCategories.find((c) => c.id === id)?.nev || ''
  // 2026-07-10 (ÚJ #4): validáció — van érvényes sor, de sem közös, sem soronkénti jogcím nincs rajta.
  const rowsMissingCategory = validRows.some((r) => effectiveCategoryId(r) == null)
  const canSave = validRows.length > 0 && !rowsMissingCategory && !busy

  const categoryName = incomeCategories.find((c) => c.id === categoryId)?.nev || ''

  // ── ÉLŐ ELŐNÉZET (issue 4) — a decont-ablak mintájára (buildDecontIncasareHtml + iframe) ──
  // 2026-07-10 (ÚJ #4): soronként a SAJÁT jogcím neve megy az explanation-be (fallback: közös).
  const previewHtml = useMemo(() => {
    const items: DecontIncasareItem[] = rows
      .filter((r) => r.iratsz.trim())
      .map((r) => ({
        iratSz: r.iratsz.trim(),
        keruletiSz: r.keruleti.trim(),
        payer: r.people.filter((p) => p.name.trim()).map((p) => p.name.trim()).join(', '),
        explanation: categoryNameOf(effectiveCategoryId(r)),
        amount: rowSum(r),
      }))
    // Fejléc-jogcím: a közös; ha nincs, de minden sor ugyanazt használja, akkor az; többfélénél „vegyes".
    const uniqNames = [...new Set(items.map((i) => i.explanation).filter(Boolean))]
    const headerCategory =
      categoryName || (uniqNames.length === 1 ? uniqNames[0] : uniqNames.length > 1 ? 'Diverse — vegyes (soronként)' : '')
    return buildDecontIncasareHtml({
      congregationName: congregationName || '',
      congregationNameRo,
      date,
      category: headerCategory,
      note: megj.trim(),
      items,
    })
  }, [rows, date, categoryId, categoryName, incomeCategories, megj, congregationName, congregationNameRo])

  async function handleSave() {
    if (validRows.length === 0) return
    // 2026-07-10 (ÚJ #4): jogcím-validáció — ha sem közös, sem soronkénti nincs, hibaüzenet.
    if (rowsMissingCategory) {
      toast.error('Hiányzó jogcím — válassz közös bevétel-jogcímet, vagy állíts be soronkéntit a nyugta-kártyán.')
      return
    }
    setBusy(true)
    try {
      const year = Number(date.slice(0, 4)) || new Date().getFullYear()
      const batch: IncomeBatchRowInput[] = []
      for (const r of validRows) {
        const iratsz = r.iratsz.trim()
        const keruleti = r.keruleti.trim()
        // 2026-07-10 (ÚJ #4): a batch-sor jogcíme a sor SAJÁT kategóriája (fallback: a közös).
        const rowCategoryId = effectiveCategoryId(r)
        if (rowCategoryId == null) continue // a rowsMissingCategory-guard után nem fordulhat elő
        const payers = validPayersOf(r)
        const multi = payers.length > 1
        const note = `${megj.trim() || 'Utólag elszámolt nyugta'} (Chitanță ${iratsz})`
        payers.forEach((p, i) => {
          batch.push({
            datum: date,
            id_befizetescel: rowCategoryId,
            forrasa: p.name.trim() || null,
            // Több befizetőnél a kerületi szám /N utótagot kap (fizikai nyugta = közös alap).
            iratszam: keruleti ? (multi ? `${keruleti}/${i + 1}` : keruleti) : null,
            nyugta: iratsz,
            irattipus: 'Chitanță',
            osszeg: Number(p.osszeg),
            fizetettev: year,
            megjegyzes: note,
            // 2026-07-10 (ÚJ #4): család-befizető → id_csalad (a személlyel kölcsönösen kizáró).
            id_szemely: p.id ?? null,
            id_csalad: p.familyId ?? null,
          })
        })
      }
      const res = await saveIncomeBatch(batch)
      if ('error' in res && res.error) {
        toast.error(`A könyvelés nem sikerült — ${res.error}`)
        return
      }
      toast.success(
        `${validRows.length} nyugta (${batch.length} tétel) bevételként a kasszába könyvelve${linkedCount ? ` · ${linkedCount} személyhez kötve` : ''}${familyCount ? ` · ${familyCount} családhoz kötve` : ''}.`,
      )
      onDone?.()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-[96vw] xl:max-w-[1400px]">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Hiányzó nyugták — bevételi elszámolás (Decont de încasări)</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Minden hiányzó Chitanță bevételként a kasszába — egy nyugtára több befizető (személy vagy család) is rögzíthető,
                  a tag-párosítás nem kötelező, a jogcím nyugtánként felülírható.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 2026-07-10 (S4-1): lg-től két oszlop — mobilon 1 oszlop, az előnézet a lista ALÁ kerül. */}
        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          {/* ── BAL: kitöltő ── */}
          <div className="space-y-4">
            {/* 2026-07-10 (S4-1): könyvelés-fejléc — halvány hátterű, elkülönített sávban. */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/50 p-4 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Könyvelés-fejléc — minden nyugtára érvényes
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-600">Könyvelési dátum
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 rounded-lg border-slate-300 bg-white shadow-sm"
                  />
                </label>
                {/* 2026-07-10 (ÚJ #4): a közös jogcím ALAPÉRTÉK — a nyugta-kártyán soronként felülírható. */}
                <label className="text-sm font-medium text-slate-600">Bevétel-jogcím (közös — soronként felülírható)
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/25"
                  >
                    <option value="">— válassz —</option>
                    {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.kod ? `${c.kod} · ${c.nev}` : c.nev}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-sm font-medium text-slate-600">Megjegyzés (minden tételre kerül — &bdquo;utólag elszámolt&rdquo; nyom)
                <Input
                  value={megj}
                  onChange={(e) => setMegj(e.target.value)}
                  className="mt-1 rounded-lg border-slate-300 bg-white shadow-sm"
                />
              </label>
            </div>

            {/* Tételek — nyugtánként egy kártya, több befizetővel.
                2026-07-10 (S4-1): számozott, árnyékolt kártyák — fejléc-sáv (Irat sz. + Kerületi sz.
                + jogcím + összeg-jelvény jobbra), színezett bal szegély (zöld=kész, rózsa=hiányzó
                jogcím, szürke=üres), a befizetők a kártya testében avatar-kezdőbetűvel. */}
            <div className="space-y-3">
              {rows.map((r, idx) => {
                const sum = rowSum(r)
                const hasPayers = validPayersOf(r).length > 0
                const missingCat = effectiveCategoryId(r) == null && hasPayers
                const complete = Boolean(r.iratsz.trim()) && hasPayers && !missingCat
                return (
                  <div
                    key={r.id}
                    className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-md transition-colors ${
                      missingCat ? 'border-l-rose-400' : complete ? 'border-l-emerald-500' : 'border-l-slate-300'
                    }`}
                  >
                    {/* Kártya-fejléc: sorszám + azonosítók + jogcím + összeg-összesítő jobbra */}
                    <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
                      <span
                        className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold tabular-nums text-emerald-700 shadow-sm ring-1 ring-emerald-200"
                        title={`${idx + 1}. nyugta`}
                      >
                        {idx + 1}
                      </span>
                      <label className="text-xs font-medium text-slate-500">Irat sz.
                        <Input
                          value={r.iratsz}
                          onChange={(e) => patchRow(r.id, { iratsz: e.target.value })}
                          className="mt-0.5 h-8 w-24 rounded-lg border-slate-300 bg-white tabular-nums shadow-sm"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-500">
                        Kerületi sz.
                        <Input
                          value={r.keruleti}
                          onChange={(e) => patchRow(r.id, { keruleti: e.target.value })}
                          placeholder="—"
                          className="mt-0.5 h-8 w-28 rounded-lg border-slate-300 bg-white tabular-nums shadow-sm"
                          title="A szomszédos nyugták számaiból kikövetkeztetve — ellenőrizd, szükség esetén javítsd"
                        />
                      </label>
                      {/* 2026-07-10 (ÚJ #4): nyugtánkénti SAJÁT jogcím — üresen a fejléc közös jogcímét örökli. */}
                      <label className="text-xs font-medium text-slate-500">Jogcím
                        <select
                          value={r.categoryId ?? ''}
                          onChange={(e) => patchRow(r.id, { categoryId: e.target.value ? Number(e.target.value) : null })}
                          className={`mt-0.5 block h-8 w-44 rounded-lg border bg-white px-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 ${
                            missingCat
                              ? 'border-rose-300 focus-visible:border-rose-400 focus-visible:ring-rose-400/25'
                              : 'border-slate-300 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25'
                          }`}
                          title="Ennek a nyugtának a saját jogcíme — üresen a fejléc közös jogcímét használja"
                        >
                          <option value="">{categoryName ? `— közös: ${categoryName} —` : '— közös jogcím —'}</option>
                          {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.kod ? `${c.kod} · ${c.nev}` : c.nev}</option>)}
                        </select>
                      </label>
                      {/* 2026-07-10 (S4-1): összeg-összesítő jelvény a fejléc jobb szélén. */}
                      <span className="ml-auto self-center rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-800 ring-1 ring-emerald-200/70">
                        {ron(sum)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="flex h-10 w-9 items-center justify-center self-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                        title="Nyugta-sor törlése"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Befizetők — a nyugtán több név is szerepelhet */}
                    <div className="space-y-1.5 p-3">
                      {r.people.map((p) => (
                        <div
                          key={p.uid}
                          className="grid grid-cols-[1.75rem_1fr_4.75rem_2.25rem] items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-slate-50 sm:grid-cols-[2rem_1fr_6rem_2.5rem] sm:gap-2"
                        >
                          {/* 2026-07-10 (S4-1): avatar-kezdőbetű — család: Users-ikon (kék), tag: zöld, szabad szöveg: szürke. */}
                          <span
                            className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold sm:size-8 ${
                              p.familyId != null
                                ? 'bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700'
                                : p.id != null
                                  ? 'bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {p.familyId != null ? <Users className="size-4" /> : (p.name.trim()[0] || '?').toUpperCase()}
                          </span>
                          <PayerSearch
                            value={p.name}
                            linkedKind={p.familyId != null ? 'family' : p.id != null ? 'person' : null}
                            autoFocus={focusUid === p.uid}
                            onType={(t) => updatePayer(r.id, p.uid, { name: t, id: null, familyId: null })}
                            /* 2026-07-10 (ÚJ #4): család-találat → a család EGY payerként, id_csalad-dal.
                               2026-08-23 (kisebb rések, 2.): ⛔ a `'partner'` (felső szintű gyülekezet /
                               lelkész / egyházmegye) találat CSAK A NEVET adja: az azonosítója NEGATÍV
                               ál-azonosító, nem `szemely.id` — FK-ba írva a mentés hasalna el. */
                            onPick={(h) =>
                              updatePayer(
                                r.id,
                                p.uid,
                                h.kind === 'family'
                                  ? { id: null, familyId: h.id, name: h.name }
                                  : h.kind === 'partner'
                                    ? { id: null, familyId: null, name: h.name }
                                    : { id: h.id, familyId: null, name: h.name },
                              )
                            }
                          />
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={p.osszeg}
                            placeholder="0"
                            onChange={(e) => updatePayer(r.id, p.uid, { osszeg: e.target.value })}
                            className="h-8 rounded-lg border-slate-300 bg-white text-right tabular-nums shadow-sm"
                          />
                          {/* 2026-07-10 (S4-1): törlés — hoverre emelkedik ki, de mindig látható (mobil-erintés). */}
                          <button
                            type="button"
                            aria-label="Befizető törlése"
                            onClick={() => removePayer(r.id, p.uid)}
                            className="flex h-10 w-9 items-center justify-center justify-self-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addPayer(r.id)}
                        className="mt-1 inline-flex min-h-10 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                        title="Még egy befizető ugyanarra a nyugtára — a nyugtán több név is szerepelhet"
                      >
                        <UserPlus className="size-3.5" /> Még egy befizető
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button variant="ghost" size="sm" onClick={addRow} className="min-h-10">
              <Plus className="mr-1 size-4" /> Új nyugta-sor
            </Button>

            {/* 2026-07-10 (ÚJ #4): jogcím-validáció — sem közös, sem soronkénti jogcím nincs. */}
            {validRows.length > 0 && rowsMissingCategory && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                Hiányzó jogcím: válassz <strong>közös</strong> bevétel-jogcímet fent, vagy adj meg <strong>soronkénti</strong> jogcímet
                a nyugta-kártyán.
              </p>
            )}

            <p className="text-xs text-slate-500">
              Mentéskor minden tétel <strong>Chitanță-bevételként</strong> a kasszába (Registrul de casă) és a
              számadásba könyvelődik, a nyugta saját Irat sz.-ával — így a Nyugtafigyelő &bdquo;hiányzó&rdquo; listájáról lekerül.
            </p>
          </div>

          {/* ── JOBB: élő A4-előnézet (a decont-ablak mintájára) ──
              2026-07-10 (S4-1): finom keret + „élő előnézet" címke pulzáló ponttal;
              mobilon (lg alatt) a lista ALÁ kerül, alacsonyabb iframe-fel. */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">Előnézet — Decont de încasări</p>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Élő előnézet
                </span>
              </div>
              <iframe title="Bevételi elszámolás előnézet" srcDoc={previewHtml} className="block h-[420px] w-full bg-white sm:h-[560px] lg:h-[720px]" />
            </div>
          </div>
        </div>

        {/* 2026-07-10 (S4-1): alsó ragadós összesítő-sáv — „N nyugta · M befizető · Összesen X RON"
            + Mégse/Mentés; a görgethető modal-tartalom alján marad látható (sticky bottom). */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.12)] backdrop-blur sm:px-6">
          <p className="min-w-0 text-sm text-slate-600">
            <strong className="tabular-nums text-slate-800">{validRows.length}</strong> nyugta
            {' · '}
            <strong className="tabular-nums text-slate-800">{payerCount}</strong> befizető
            {' · '}
            Összesen <strong className="tabular-nums text-emerald-700">{ron(total)}</strong>
            {linkedCount > 0 && <span className="text-emerald-600"> · {linkedCount} személyhez kötve</span>}
            {familyCount > 0 && <span className="text-sky-600"> · {familyCount} családhoz kötve</span>}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-10">Mégse</Button>
            <Button onClick={handleSave} disabled={!canSave} className="min-h-10 bg-emerald-600 shadow-md hover:bg-emerald-700">
              {busy ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Könyvelés…</> : <><Check className="mr-1.5 size-4" /> Mentés és könyvelés</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
