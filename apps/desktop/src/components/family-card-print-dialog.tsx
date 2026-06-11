/**
 * DesktopFamilyCardPrintDialog — nyomtatható családi karton (2026-06-11, Endre).
 *
 * A webes `family-card-print-dialog.tsx` desktop tükre: a HTML-t a KÖZÖS
 * `buildFamilyCardHtml` (@kartoteka/ui-app) építi, az adatokat a webes
 * `getFamilyCardPrintData` server action lekérdezés-sora adja — itt direkt
 * Supabase-hívásokkal (online művelet; a kartonhoz anyakönyvi dátumok,
 * befizetések és látogatások kellenek, amik nem mind élnek lokálisan).
 * Bal oldalt opciók, jobbra élő iframe-előnézet; nyomtatás az iframe-ből.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogTitle } from '@kartoteka/ui'
import { buildFamilyCardHtml, type FamilyCardPrintData, type FamilyCardPrintPerson } from '@kartoteka/ui-app'

import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
  congregationId: string | null
}

/** A webes getFamilyCardPrintData tükre (RLS + congregation_id szűréssel). */
async function loadPrintData(
  familyId: number,
  congregationId: string,
): Promise<FamilyCardPrintData | { error: string }> {
  if (!(await isOnlineWithSession())) {
    return { error: 'A családi karton összeállításához internetkapcsolat és belépés szükséges (anyakönyvi adatok).' }
  }
  const supabase = getDesktopSupabase()

  const { data: family, error: famErr } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no, c_szam, id_csoport, adrstreet!c_utcaid(name, adrlocality!localityid(name)), csoport!id_csoport(nev)')
    .eq('id', familyId)
    .maybeSingle()
  if (famErr) return { error: famErr.message }
  if (!family) return { error: 'A család nem található.' }

  type Fam = {
    id: number
    id_ferfi: number | null
    id_no: number | null
    c_szam: string | null
    adrstreet: { name: string | null; adrlocality: { name: string | null } | { name: string | null }[] | null } | { name: string | null; adrlocality: { name: string | null } | null }[] | null
    csoport: { nev: string | null } | { nev: string | null }[] | null
  }
  const fam = family as unknown as Fam
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] || null : v)

  const { data: childRows } = await supabase.from('gyerek').select('id_szemely').eq('id_csalad', familyId)
  const childIds = ((childRows || []) as { id_szemely: number }[]).map((r) => r.id_szemely)
  const adultIds = [fam.id_ferfi, fam.id_no].filter(Boolean) as number[]
  const allIds = [...adultIds, ...childIds]
  if (allIds.length === 0) return { error: 'A családnak nincs rögzített tagja.' }

  const currentYear = new Date().getFullYear()
  const [personsRes, keresztRes, konfirmRes, hazassagRes, paymentsRes, visitsRes, congRes] = await Promise.all([
    supabase.from('szemely')
      .select('id, csaladnev, k_nev, szcs_nev, ferfi, sz_datum, megjegyzes, meghalt')
      .in('id', allIds).eq('congregation_id', congregationId),
    supabase.from('keresztseg').select('id_szemely, datum').in('id_szemely', allIds).eq('congregation_id', congregationId),
    supabase.from('konfirmalas').select('id_szemely, datum').in('id_szemely', allIds).eq('congregation_id', congregationId),
    fam.id_ferfi && fam.id_no
      ? supabase.from('hazassag').select('datum, lelkeszneve')
          .eq('id_ferfi', fam.id_ferfi).eq('id_no', fam.id_no)
          .eq('congregation_id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('befizetes')
      .select('datum, osszeg, fizetettev, id_szemely, id_csalad, befizetescel(nev)')
      .eq('congregation_id', congregationId)
      .or(`id_csalad.eq.${familyId},id_szemely.in.(${allIds.join(',')})`)
      .or('deleted.eq.false,deleted.is.null')
      .gte('fizetettev', currentYear - 4)
      .order('datum', { ascending: false })
      .limit(60),
    supabase.from('csaladlatogatas')
      .select('datum, lelkesz, megjegyzes')
      .eq('id_csalad', familyId).eq('congregation_id', congregationId)
      .order('datum', { ascending: false }).limit(6),
    supabase.from('congregations').select('name, nev_hu').eq('id', congregationId).maybeSingle(),
  ])

  type PersonRow = { id: number; csaladnev: string | null; k_nev: string | null; szcs_nev: string | null; ferfi: boolean | null; sz_datum: string | null; megjegyzes: string | null; meghalt: boolean | null }
  const persons = (personsRes.data || []) as PersonRow[]
  const keresztMap = new Map(((keresztRes.data || []) as { id_szemely: number; datum: string | null }[]).map((r) => [r.id_szemely, r.datum]))
  const konfirmMap = new Map(((konfirmRes.data || []) as { id_szemely: number; datum: string | null }[]).map((r) => [r.id_szemely, r.datum]))

  const personName = (p: PersonRow) =>
    `${p.csaladnev || ''} ${p.k_nev || ''}`.trim() + (p.szcs_nev ? ` (szül. ${p.szcs_nev})` : '')
  const toPrint = (p: PersonRow, szerep: string): FamilyCardPrintPerson => ({
    szerep,
    nev: personName(p),
    szuletes: p.sz_datum,
    keresztseg: keresztMap.get(p.id) || null,
    konfirmacio: konfirmMap.get(p.id) || null,
    megjegyzes: p.megjegyzes,
    meghalt: !!p.meghalt,
  })

  const husband = persons.find((p) => p.id === fam.id_ferfi)
  const wife = persons.find((p) => p.id === fam.id_no)
  const children = childIds
    .map((id) => persons.find((p) => p.id === id))
    .filter(Boolean) as PersonRow[]
  children.sort((a, b) => (a.sz_datum || '9999').localeCompare(b.sz_datum || '9999'))

  const street = one(fam.adrstreet)
  const locality = street ? one((street as { adrlocality?: unknown }).adrlocality as { name: string | null } | { name: string | null }[] | null) : null
  const congregation = congRes.data as { name: string | null; nev_hu: string | null } | null
  const marriage = hazassagRes.data as { datum: string | null; lelkeszneve: string | null } | null

  return {
    familyId,
    familyName:
      [husband ? personName(husband) : null, wife ? personName(wife) : null].filter(Boolean).join(' és ') || 'Család',
    address: [locality?.name, street?.name, fam.c_szam].filter(Boolean).join(', ') || null,
    district: one(fam.csoport)?.nev || null,
    congregation: congregation?.nev_hu || congregation?.name || '',
    marriage: marriage ? { datum: marriage.datum, lelkesz: marriage.lelkeszneve } : null,
    adults: [
      ...(husband ? [toPrint(husband, 'Családfő')] : []),
      ...(wife ? [toPrint(wife, 'Házastárs')] : []),
    ],
    children: children.map((c) => toPrint(c, c.ferfi ? 'Fiú' : 'Lány')),
    payments: ((paymentsRes.data || []) as { datum: string | null; osszeg: number | string | null; fizetettev: number | null; befizetescel: { nev: string | null } | { nev: string | null }[] | null }[]).map((r) => ({
      datum: r.datum,
      ev: r.fizetettev,
      osszeg: Number(r.osszeg || 0),
      cel: one(r.befizetescel)?.nev || null,
    })),
    visits: ((visitsRes.data || []) as { datum: string | null; lelkesz: string | null; megjegyzes: string | null }[]).map((v) => ({
      datum: v.datum,
      lelkesz: v.lelkesz,
      megjegyzes: v.megjegyzes,
    })),
  }
}

export function DesktopFamilyCardPrintDialog({ open, onOpenChange, familyId, congregationId }: Props) {
  const [data, setData] = useState<FamilyCardPrintData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [includePayments, setIncludePayments] = useState(false)
  const [includeVisits, setIncludeVisits] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !familyId || !congregationId) return
    let cancelled = false
    setLoading(true)
    setData(null)
    setError(null)
    void loadPrintData(familyId, congregationId).then((d) => {
      if (cancelled) return
      if ('error' in d) setError(d.error)
      else setData(d)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, familyId, congregationId])

  const html = useMemo(
    () => (data ? buildFamilyCardHtml(data, { payments: includePayments, visits: includeVisits }) : null),
    [data, includePayments, includeVisits],
  )

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] !w-[min(1060px,calc(100vw-2rem))] !max-w-[min(1060px,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <DialogTitle className="font-heading text-lg">Családi karton nyomtatása</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-400">
                A4-es, lefűzhető lap — relációkkal, anyakönyvi adatokkal és megjegyzésekkel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-700"
              aria-label="Bezárás"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row">
            <div className="w-full shrink-0 space-y-3 sm:w-60">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Tartalom</p>
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <input type="checkbox" checked readOnly className="mt-0.5 accent-teal-600" disabled />
                <span>
                  <span className="font-medium text-slate-700">Relációk + anyakönyv</span>
                  <span className="block text-xs text-slate-400">Mindig a karton része</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includePayments}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Befizetések</span>
                  <span className="block text-xs text-slate-400">Az utolsó 5 év tételei</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includeVisits}
                  onChange={(e) => setIncludeVisits(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Családlátogatások</span>
                  <span className="block text-xs text-slate-400">Utolsó alkalmak</span>
                </span>
              </label>

              <Button
                onClick={handlePrint}
                disabled={!html || loading}
                className="w-full gap-2 rounded-xl bg-teal-600 hover:bg-teal-700"
              >
                <Printer className="size-4" /> Nyomtatás
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
              {loading && (
                <div className="flex h-full animate-pulse items-center justify-center text-sm text-slate-400">
                  Családi karton összeállítása…
                </div>
              )}
              {!loading && error && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-amber-700">
                  {error}
                </div>
              )}
              {!loading && html && (
                <iframe ref={iframeRef} title="Családi karton előnézet" srcDoc={html} className="h-full w-full bg-white" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
