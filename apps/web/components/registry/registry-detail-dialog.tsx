'use client'

/**
 * Anyakönyvi sor részletes nézete — Endre kérése (2026-04-30):
 * "Ha rákattintok egy sorra akkor jelenjen meg egy szép ablak az adatokkal,
 * ne csak akkor amikor szerkeszteni szeretném! Ez mindenki anyakönyvi fülön."
 *
 * Read-only nézet, "Szerkesztés" gomb visszahív a parent-be (átvált edit
 * módba). Minden 8 fülre profilozott layout, hogy a fülönkénti oszlopok
 * teljes adattartalma látszódjon.
 */

import { useMemo, useRef, useState } from 'react'
import { Printer, Sparkles, User } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { RegistryEntry, RegistryTab } from '@/lib/constants/registry'
import { CertificateRenderer } from './emleklap/certificate-renderer'
import {
  EMLEKLAP_TEMPLATES_MAP,
  fillTemplate,
  type EmleklapTemplate,
} from '@/lib/constants/emleklap-templates'
import {
  extractCityFromCongregationName,
  formatHungarianDate,
} from '@/lib/utils/emleklap-data-mapper'
import { toast } from 'sonner'

interface RegistryDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: RegistryEntry | null
  tab: RegistryTab
  /** 2026-05-29: a kereszt./esket./konfirm. tabokon az emléklap-preview-hoz. */
  congregationName?: string
  onEdit: () => void
  onDelete: () => void
}

const TAB_LABELS: Record<string, string> = {
  keresztseg: 'Keresztelés',
  konfirmalas: 'Konfirmáció',
  hazassag: 'Házasságkötés',
  temetes: 'Temetés',
  bekoltozott: 'Beköltözés',
  elkoltozott: 'Elköltözés',
  attert: 'Áttérés',
  kitert: 'Kitérés',
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return s.toString().split('T')[0]
}

function calcAge(szDatum?: string | null): string {
  if (!szDatum) return ''
  const m = String(szDatum).match(/^(\d{4})/)
  if (!m) return ''
  const age = new Date().getFullYear() - parseInt(m[1])
  return `${age} éves`
}

function Field({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  const display = value === undefined || value === null || value === '' || value === '—' ? '—' : value
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''} ${display === '—' ? 'text-slate-400 italic' : ''}`}>{display}</p>
    </div>
  )
}

function PersonCard({ label, person, icon }: {
  label: string
  person?: { csaladnev?: string | null; k_nev?: string | null; ferfi?: boolean | null; sz_datum?: string | null } | null
  icon?: React.ReactNode
}) {
  if (!person) return <Field label={label} value="—" />
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5">
        {person.csaladnev || ''} {person.k_nev || ''}
        {person.ferfi !== undefined && person.ferfi !== null && (
          <span className="ml-1.5 text-xs text-slate-400">{person.ferfi ? '♂' : '♀'}</span>
        )}
      </p>
      {person.sz_datum && (
        <p className="text-[11px] text-slate-500 mt-0.5">
          sz: {fmtDate(person.sz_datum)} {calcAge(person.sz_datum) && `• ${calcAge(person.sz_datum)}`}
        </p>
      )}
    </div>
  )
}

export function RegistryDetailDialog({ open, onOpenChange, entry, tab, congregationName = '', onEdit, onDelete }: RegistryDetailDialogProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // 2026-05-29: a kereszt./esket./konfirm. fülön az emléklap-preview-hoz a
  // sablon kiválasztása. Más fülnél template = null és nem renderelünk preview-t.
  // 2026-05-30: kereszt. esetén variant-választó (erek/kerek/kek)
  const [kerVariant, setKerVariant] = useState<'erek' | 'kerek' | 'kek'>(() => {
    try {
      const saved = (typeof window !== 'undefined' && localStorage.getItem('kartoteka.emleklap.kereszteloVariant')) || 'erek'
      return (saved === 'kerek' || saved === 'kek') ? saved : 'erek'
    } catch { return 'erek' }
  })
  function changeKerVariant(v: 'erek' | 'kerek' | 'kek') {
    setKerVariant(v)
    try { localStorage.setItem('kartoteka.emleklap.kereszteloVariant', v) } catch {}
  }
  const template: EmleklapTemplate | null = useMemo(() => {
    if (tab === 'keresztseg') return EMLEKLAP_TEMPLATES_MAP[`kereszteles-${kerVariant}`] ?? EMLEKLAP_TEMPLATES_MAP['kereszteles-erek'] ?? null
    if (tab === 'konfirmalas') return EMLEKLAP_TEMPLATES_MAP['konfirmacio-erek'] ?? null
    if (tab === 'hazassag') return EMLEKLAP_TEMPLATES_MAP['esketes-erek'] ?? null
    if (tab === 'temetes') return EMLEKLAP_TEMPLATES_MAP['temetes-erek'] ?? null
    return null
  }, [tab, kerVariant])

  const fieldValues = useMemo<Record<string, string>>(() => {
    if (!template || !entry) return {}
    let savedGondnok = ''
    try { savedGondnok = (typeof window !== 'undefined' && localStorage.getItem('kartoteka.emleklap.gondnokName')) || '' } catch {}
    const issueDate = entry.datum ? formatHungarianDate(entry.datum as string) : ''
    const issueLocation = extractCityFromCongregationName(congregationName)
    // 2026-05-30: proper case-ben tartjuk — az EREK/KEREK templet textTransform-mal
    // uppercase-eli, a KÉK natural case-t kér.
    const pastorName = (entry.lelkeszneve as string | undefined) || ''
    const wardenName = savedGondnok

    let data: Record<string, string> = {}
    if (tab === 'keresztseg') {
      const childName = entry.szemely
        ? `${entry.szemely.csaladnev || ''} ${entry.szemely.k_nev || ''}`.trim()
        : ''
      // 2026-05-30: az apjaneve/anyjaneve a SZEMELY táblában van (a gyermek
       // rekordon), nem a keresztseg-ben. Ezért entry.szemely.apjaneve.
      const parentsNames = [
        (entry.szemely?.apjaneve as string | undefined) || (entry.apjaneve as string | undefined) || '',
        (entry.szemely?.anyjaneve as string | undefined) || (entry.anyjaneve as string | undefined) || '',
      ].filter(Boolean).join(' és ')
      const birthDate = entry.szemely?.sz_datum ? formatHungarianDate(entry.szemely.sz_datum) + '-én' : ''
      const baptismDate = entry.datum ? formatHungarianDate(entry.datum as string) + '-én' : ''
      data = {
        congregationName,
        fullName: childName,
        parentsNames,
        birthPlace: '',
        birthDate,
        baptismCongregation: congregationName ? congregationName + 'ben' : '',
        baptismDate,
        issueLocation,
        issueDate,
        pastorName,
        wardenName,
        // 2026-05-30 (KÉK template): igevers + igehely default
        verseText: 'Engedjétek hozzám jönni a kisgyermekeket,\nés ne tiltsátok el őket tőlem;\nmert ilyeneké az Isten országa.',
        verseReference: 'Márk 10,14',
      }
    } else if (tab === 'konfirmalas') {
      const fullName = entry.szemely
        ? `${entry.szemely.csaladnev || ''} ${entry.szemely.k_nev || ''}`.trim().toUpperCase()
        : ''
      const birthDate = entry.szemely?.sz_datum ? formatHungarianDate(entry.szemely.sz_datum) + '-én' : ''
      data = {
        congregationName,
        fullName,
        birthPlace: '',
        birthDate,
        baptismCongregation: '',
        baptismDate: '',
        confirmCongregation: congregationName ? congregationName + 'ben' : '',
        issueLocation,
        issueDate: issueDate.toUpperCase(),
        mainWardenName: wardenName,
        pastorName,
      }
    } else if (tab === 'hazassag') {
      const husbandName = entry.ferfi ? `${entry.ferfi.csaladnev || ''} ${entry.ferfi.k_nev || ''}`.trim() : ''
      const wifeName = entry.no ? `${entry.no.csaladnev || ''} ${entry.no.k_nev || ''}`.trim() : ''
      const marriageDate = entry.datum ? formatHungarianDate(entry.datum as string) + '-én' : ''
      // 2026-05-30: szül. dátum a tag-rekordból, hely + igevers sablon JSON-ből
      const husbandBirthDate = entry.ferfi?.sz_datum
        ? formatHungarianDate(entry.ferfi.sz_datum) + '-én'
        : ''
      const wifeBirthDate = entry.no?.sz_datum
        ? formatHungarianDate(entry.no.sz_datum) + '-án'
        : ''
      const rawMegj = (entry.megjegyzes as string) || ''
      const sIdx = rawMegj.indexOf('|sablon:')
      let husbandBirthPlace = ''
      let wifeBirthPlace = ''
      let verseText = ''
      let verseReference = ''
      if (sIdx > -1) {
        try {
          const s = JSON.parse(rawMegj.slice(sIdx + 8))
          husbandBirthPlace = s.husband_birth_place || ''
          wifeBirthPlace = s.wife_birth_place || ''
          verseText = s.verse_text || ''
          verseReference = s.verse_reference || ''
        } catch { /* invalid */ }
      }
      data = {
        congregationName,
        husbandName,
        husbandBirthPlace,
        husbandBirthDate,
        wifeName,
        wifeBirthPlace,
        wifeBirthDate,
        marriageCongregation: congregationName ? congregationName + 'ben' : '',
        marriageDate,
        verseText,
        verseReference,
        issueLocation,
        issueDate,
        pastorName,
        wardenName,
      }
    } else if (tab === 'temetes') {
      // 2026-05-30: temetés/gyászjelentés-preview a read-only részletek nézethez.
      const fullName = entry.szemely
        ? `${entry.szemely.csaladnev || ''} ${entry.szemely.k_nev || ''}`.trim().toUpperCase()
        : ''
      // Életkor: születés + halálozás dátum különbsége (években).
      let age = ''
      if (entry.szemely?.sz_datum && entry.hdatum) {
        try {
          const b = new Date(entry.szemely.sz_datum)
          const d = new Date(entry.hdatum as string)
          if (!isNaN(b.getTime()) && !isNaN(d.getTime())) {
            let a = d.getFullYear() - b.getFullYear()
            const m = d.getMonth() - b.getMonth()
            if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--
            age = String(a)
          }
        } catch {}
      }
      // 2026-05-30: kicsomagoljuk a megjegyzés sablon JSON-jából a mentett
      // virrasztó / temetés-időpont / igevers értékeket.
      let funeralTimeStored = ''
      let funeralPlaceStored = ''
      let vigilDateStored = ''
      let vigilTimeStored = ''
      let vigilPlaceStored = ''
      let verseTextStored = 'Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.'
      let verseReferenceStored = 'Jób 1,21'
      let relativeRelationStored = 'egyháztagunk és hitbeli testvérünk'
      let mournersStored = 'Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték'
      const megj = (entry.megjegyzes as string) || ''
      const sablonIdx = megj.indexOf('|sablon:')
      if (sablonIdx > -1) {
        try {
          const s = JSON.parse(megj.slice(sablonIdx + 8))
          if (s.funeral_time) funeralTimeStored = s.funeral_time
          if (s.funeral_place) funeralPlaceStored = s.funeral_place
          if (s.vigil_date) vigilDateStored = s.vigil_date
          if (s.vigil_time) vigilTimeStored = s.vigil_time
          if (s.vigil_place) vigilPlaceStored = s.vigil_place
          if (s.verse_text) verseTextStored = s.verse_text
          if (s.verse_reference) verseReferenceStored = s.verse_reference
          if (s.relative_relation) relativeRelationStored = s.relative_relation
          if (s.mourners !== undefined && s.mourners !== null) mournersStored = s.mourners
        } catch {}
      }
      const deathDate = entry.hdatum ? formatHungarianDate(entry.hdatum as string) + '-án' : ''
      const funeralDateBase = entry.tdatum ? formatHungarianDate(entry.tdatum as string) + '-én' : ''
      const funeralDate = funeralDateBase
        ? (funeralTimeStored ? `${funeralDateBase}, ${funeralTimeStored} órakor lesz` : `${funeralDateBase} lesz`)
        : ''
      const funeralPlace = funeralPlaceStored
        || ((entry.adrlocality as { name?: string } | null)?.name
          ? `a ${(entry.adrlocality as { name?: string }).name} temetőjében.`
          : 'a Református Temetőben.')

      // Virrasztó vonal (csak ha van mentett adat)
      let vigilLine = ''
      if (vigilDateStored || vigilTimeStored || vigilPlaceStored) {
        const vigilDateFmt = vigilDateStored ? formatHungarianDate(vigilDateStored) + '-én' : ''
        const parts: string[] = []
        if (vigilDateFmt) parts.push(vigilDateFmt)
        if (vigilTimeStored) parts.push(`${vigilTimeStored} órakor`)
        let head = parts.join(' ')
        if (vigilPlaceStored) head = head ? `${head}, ${vigilPlaceStored}` : vigilPlaceStored
        vigilLine = head ? `Virrasztás: ${head}` : ''
      }

      data = {
        fullName,
        relativeRelation: relativeRelationStored,
        age,
        deathDate,
        funeralDate,
        funeralPlace,
        vigilLine,
        mourners: mournersStored,
        verseText: verseTextStored,
        verseReference: verseReferenceStored,
      }
    }
    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, entry, tab, congregationName])

  function handlePrint() {
    if (!printRef.current) return
    const html = printRef.current.outerHTML
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) { toast.error('A böngésző blokkolta a popup-ot.'); return }
    // 2026-05-30: temetésnél fekete háttér (a gyászjelentés-sablon stílusához)
    const printBg = tab === 'temetes' ? '#020202' : 'white'
    const docTitle = tab === 'temetes' ? 'Gyászjelentés' : 'Anyakönyvi emléklap'
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${docTitle}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: ${printBg}; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        @media print { html, body { width: 210mm; height: 297mm; } .certificate-renderer { box-shadow: none !important; } }
      </style>
    </head><body>${html}<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script></body></html>`)
    win.document.close()
  }

  if (!entry) return null

  const title = TAB_LABELS[tab] || 'Bejegyzés'
  const helyseg = (entry.adrlocality as { name?: string } | null)?.name
  const hasPreview = template !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[92vh] overflow-y-auto ${hasPreview ? 'w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl' : 'sm:max-w-2xl'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{title} — részletek</span>
            {entry.egyhazi_szam && (
              <span className="text-xs font-mono text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-100">
                {String(entry.egyhazi_szam)}
              </span>
            )}
            {hasPreview && (
              <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
                <Sparkles className="size-3.5" />
                {tab === 'temetes' ? 'gyászjelentés-előnézet' : 'emléklap-előnézet'}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className={hasPreview ? 'grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]' : 'space-y-4'}>
          <div className="space-y-4 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
          {/* ── KERESZTELÉS ────────────────────────────────────── */}
          {tab === 'keresztseg' && (
            <>
              <PersonCard label="Megkeresztelt személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami anyakönyvi szám" value={entry.okirat as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Édesapa" value={(entry.szemely?.apjaneve as string | undefined) || (entry.apjaneve as string | undefined)} />
                <Field label="Édesanya" value={(entry.szemely?.anyjaneve as string | undefined) || (entry.anyjaneve as string | undefined)} />
              </div>
              <Field label="Keresztszülők" value={entry.keresztszulok as string} />
              <Field label="Alapige" value={entry.alapige as string} />
              <Field label="Megjegyzés" value={(entry.megjegyzes as string)?.split('|sablon:')[0]} />
            </>
          )}

          {/* ── KONFIRMÁCIÓ ─────────────────────────────────── */}
          {tab === 'konfirmalas' && (
            <>
              <PersonCard label="Konfirmandus" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
                <Field label="Keresztelés ideje" value={fmtDate(entry.keresztelesideje as string)} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── HÁZASSÁG ─────────────────────────────────────── */}
          {tab === 'hazassag' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <PersonCard label="Vőlegény" person={entry.ferfi} icon={<User className="size-3" />} />
                <PersonCard label="Menyasszony" person={entry.no} icon={<User className="size-3" />} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami házassági levél" value={entry.hlevel as string} mono />
                <Field label="Dátum" value={fmtDate(entry.datum as string)} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              {(entry.vegyes as boolean) && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  ⚠️ Vegyes házasság (egyik fél nem református)
                </div>
              )}
              <Field label="Tanúk" value={entry.tanuk as string} />
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── TEMETÉS ──────────────────────────────────────── */}
          {tab === 'temetes' && (
            <>
              <PersonCard label="Eltemetett személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Állami halotti szám" value={entry.okirat as string} mono />
                <Field label="Halál dátuma" value={fmtDate(entry.hdatum as string)} />
                <Field label="Temetés dátuma" value={fmtDate(entry.tdatum as string)} />
                <Field label="Halál oka" value={entry.hoka as string} />
                <Field label="Lelkész" value={entry.lelkeszneve as string} />
              </div>
              <Field label="Temetés helye" value={helyseg} />
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── BEKÖLTÖZÖTT ─────────────────────────────────── */}
          {tab === 'bekoltozott' && (
            <>
              <PersonCard label="Beköltözött személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Igazolás" value={entry.igazolas as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Honnan" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── ELKÖLTÖZÖTT ─────────────────────────────────── */}
          {tab === 'elkoltozott' && (() => {
            const targetCong = Array.isArray(entry.hova_congregation) ? entry.hova_congregation[0] : entry.hova_congregation
            const congName = targetCong?.nev_hu || targetCong?.name
            const notif = Array.isArray(entry.transfer_notification) ? entry.transfer_notification[0] : entry.transfer_notification
            const isKulfoldre = (entry.kulfoldre as boolean | undefined) === true
            return (
              <>
                <PersonCard label="Elköltözött személy" person={entry.szemely} icon={<User className="size-3" />} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                  <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                  <Field label="Hová (település)" value={helyseg} />
                  <Field label="Célgyülekezet" value={congName} />
                </div>
                {isKulfoldre && (
                  <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700">
                    🌍 Külföldre költözött
                  </div>
                )}
                {notif && (
                  <div className={`rounded-md border p-2.5 text-xs ${
                    notif.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    notif.status === 'accepted' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <p className="font-semibold">
                      Átjelentkezési értesítés:{' '}
                      {notif.status === 'pending' ? '⏳ Függőben' :
                       notif.status === 'accepted' ? '✓ Elfogadva' :
                       '✕ Elutasítva (a tag visszakerült)'}
                    </p>
                    {notif.responded_at && (
                      <p className="mt-0.5 text-[11px]">Válasz: {fmtDate(notif.responded_at)}</p>
                    )}
                  </div>
                )}
                <Field label="Megjegyzés" value={entry.megjegyzes as string} />
              </>
            )
          })()}

          {/* ── ÁTTÉRT ───────────────────────────────────────── */}
          {tab === 'attert' && (
            <>
              <PersonCard label="Áttért személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Igazolás" value={entry.igazolas as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Korábbi felekezet" value={entry.felekezet as string} />
                <Field label="Honnan" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          {/* ── KITÉRT ───────────────────────────────────────── */}
          {tab === 'kitert' && (
            <>
              <PersonCard label="Kitért személy" person={entry.szemely} icon={<User className="size-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Egyházi anyakönyvi szám" value={entry.egyhazi_szam as string} mono />
                <Field label="Dátum" value={fmtDate(entry.mikor as string)} />
                <Field label="Új felekezet" value={entry.felekezet as string} />
                <Field label="Hova" value={helyseg} />
              </div>
              <Field label="Megjegyzés" value={entry.megjegyzes as string} />
            </>
          )}

          </div>

          {/* ─── JOBB OSZLOP: élő emléklap-vászon (csak a 3 sákramentum-fülön) ─── */}
          {hasPreview && template && (
            <aside className="md:sticky md:top-0 md:self-start">
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <Sparkles className="size-3 inline mr-1 text-amber-600" />
                  {tab === 'temetes'
                    ? 'Az anyakönyvi adatok alapján generált gyászjelentés. A „Nyomtatás" gombbal A4-en kinyomtathatod.'
                    : 'Az anyakönyvi adatok alapján generált emléklap. A „Nyomtatás" gombbal A4-en kinyomtathatod.'}
                </p>
              </div>
              {/* 2026-05-30: variant-választó keresztelési ágon (Erdélyi új / Királyhágós új / Hagyományos kék) */}
              {tab === 'keresztseg' && (
                <div className="flex gap-1 mb-2 rounded-md bg-slate-100 p-1">
                  <button type="button" onClick={() => changeKerVariant('erek')}
                    className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${kerVariant === 'erek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Erdélyi új</button>
                  <button type="button" onClick={() => changeKerVariant('kerek')}
                    className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${kerVariant === 'kerek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Királyhágós új</button>
                  <button type="button" onClick={() => changeKerVariant('kek')}
                    className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${kerVariant === 'kek' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
                    title="Kék-fehér népi díszítésű hagyományos sablon">Hagyományos kék</button>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-inner">
                <CertificateRenderer
                  ref={printRef}
                  template={template}
                  fieldValues={fieldValues}
                  previewWidth={360}
                  showBackground={true}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 text-center">
                {tab === 'temetes'
                  ? 'A4 álló · Gyászjelentés sablon'
                  : tab === 'keresztseg'
                    ? `A4 álló · ${kerVariant === 'kek' ? 'Hagyományos kék' : kerVariant === 'kerek' ? 'Királyhágós új' : 'Erdélyi új'} keresztelői sablon`
                    : `A4 álló · Erdélyi új ${tab === 'konfirmalas' ? 'konfirmációi' : 'esketési'} sablon`}
              </p>
            </aside>
          )}
        </div>

        {/* Műveletek — a grid alatt, mindkét oszlopra kiterjedve */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
          <Button
            variant="outline"
            className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
            onClick={() => onOpenChange(false)}
          >
            Bezár
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
            onClick={() => { onOpenChange(false); onDelete() }}
          >
            Törlés
          </Button>
          <div className="flex-1" />
          {hasPreview && (
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={handlePrint}
            >
              <Printer className="size-4 mr-1.5" />
              Nyomtatás
            </Button>
          )}
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => { onOpenChange(false); onEdit() }}
          >
            ✏️ Szerkesztés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

