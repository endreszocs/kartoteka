'use client'

/**
 * Kifizetetlen számlák — fő felület (7. pont C szelet).
 *
 * KÉT FORRÁS egy listában, hangos állapot-jelzéssel:
 *  - a feltöltött szállítói számlák (kifizetve=false) → FIZETENDŐ,
 *  - az Oblio-ban kiállított, be nem szedett számlák (collected=0) → KINTLÉVŐSÉG.
 * Lejárat szerint rendezve; a LEJÁRT tételek pirossal kiemelve. Ha az Oblio
 * nem elérhető, a helyi lista attól még él, de a hiba HANGOSAN látszik.
 *
 * „Kifizetés rögzítése": a MEGLÉVŐ CombinedEntryDialog-ot nyitja — az
 * előkitöltés a rögzítő saját auto-vázlat (localStorage) csatornáján megy
 * (partner=szállító az átvevő-mezőbe, összeg, iratszám, megjegyzés), így a
 * közös komponenshez NEM kellett hozzányúlni. Mentés után a kapcsoló dialógus
 * köti a kiadást a számlához (szallitoi_szamla_kiadas), és teljes fedezetnél
 * kifizetettnek jelöli a számlát.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  HandCoins,
  Link2,
  Loader2,
  ReceiptText,
  RefreshCw,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModuleHero } from '@/components/shared/module-hero'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { CombinedEntryDialog } from '@/components/modals/combined-entry-dialog'
import { SzamlaKapcsolasDialog } from '@/components/dokumentumtar/szamla-kapcsolas-dialog'
import {
  formatOsszeg,
  lejartE,
  maiIsoDatum,
  napokAHataridoig,
  type KifizetesRogzitoAdatok,
  type KifizetetlenEredmeny,
  type KifizetetlenTetel,
} from '@/lib/dokumentumtar/kifizetetlen-types'
import {
  getKifizetesRogzitoAdatok,
  getKifizetetlenSzamlak,
} from '@/app/(dashboard)/dokumentumtar/kifizetetlen-actions'
import { setSzamlaKifizetve } from '@/app/(dashboard)/dokumentumtar/szamla-actions'
import { getDokumentumUrl } from '@/app/(dashboard)/dokumentumtar/actions'

interface KifizetetlenMainProps {
  congregationName: string
  congregationId: string
}

function datumSzoveg(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU')
}

/** A rögzítő auto-vázlatának kulcsa — BIT-AZONOS a combined-entry-dialog.tsx-ben átadottal. */
function draftKulcs(congregationId: string): string {
  return `kartoteka:combined-entry-draft:${congregationId || 'default'}`
}

/** A rögzítő EntryRow-alakjával kompatibilis sor (a vázlat-csatornához). */
type VazlatSor = {
  id: string
  datum: string
  categoryId: number | ''
  partner: string
  docType: string
  iratszam: string
  gyulekezetiSzam: string
  amount: string
  megjegyzes: string
  bankId: number | ''
  evre: string
  people: Array<{ uid: string; id: number | null; name: string; osszeg: string; evre: string }>
}

function vazlatSorTartalmas(r: Partial<VazlatSor> | null | undefined): boolean {
  if (!r) return false
  return !!(
    (r.amount || '').trim() ||
    (r.partner || '').trim() ||
    (Array.isArray(r.people) && r.people.length > 0) ||
    (r.categoryId !== '' && r.categoryId != null) ||
    (r.iratszam || '').trim() ||
    (r.megjegyzes || '').trim()
  )
}

export function KifizetetlenMain({ congregationName, congregationId }: KifizetetlenMainProps) {
  const router = useRouter()
  const ma = maiIsoDatum()

  // ── Lista betöltése ──────────────────────────────────────────
  const [eredmeny, setEredmeny] = useState<KifizetetlenEredmeny | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (oblioFrissites = false) => {
    setLoading(true)
    const res = await getKifizetetlenSzamlak({ oblioFrissites })
    setEredmeny(res)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const tetelek = eredmeny?.tetelek || []
  const fizetendok = useMemo(() => tetelek.filter((t) => t.irany === 'fizetendo'), [tetelek])
  const kintlevosegek = useMemo(() => tetelek.filter((t) => t.irany === 'kintlevoseg'), [tetelek])
  const lejartDb = useMemo(
    () => tetelek.filter((t) => lejartE(t.fizetesiHatarido, ma)).length,
    [tetelek, ma],
  )
  // Összeg-summák pénznemenként (vegyes pénznemnél nem adunk össze némán!).
  const osszegzes = useCallback((lista: KifizetetlenTetel[]): string => {
    const map = new Map<string, number>()
    for (const t of lista) {
      // A jóváíró CSÖKKENTI a tartozást — az összesítőben negatív előjellel.
      const elojel = t.tipus === 'jovairo' ? -1 : 1
      map.set(t.penznem, (map.get(t.penznem) || 0) + elojel * t.osszeg)
    }
    if (map.size === 0) return '0,00 RON'
    return [...map.entries()].map(([p, o]) => formatOsszeg(o, p)).join(' + ')
  }, [])

  // ── Fájl-megnyitás ───────────────────────────────────────────
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  function tetelKulcs(t: KifizetetlenTetel): string {
    return t.szamlaId || `${t.forras}:${t.szamlaSzam || ''}:${t.kiallitasDatum || ''}`
  }
  function handleMegnyitas(t: KifizetetlenTetel) {
    if (t.forras === 'oblio') {
      if (!t.pdfUrl) {
        toast.error('Ehhez az Oblio-számlához nem érkezett PDF-link.')
        return
      }
      window.open(t.pdfUrl, '_blank', 'noopener')
      return
    }
    const dokId = t.pdfDokumentumId || t.xmlDokumentumId
    if (!dokId) {
      toast.error('Ehhez a számlához nincs tárolt fájl a dokumentumtárban.')
      return
    }
    // Szinkron ablak-nyitás (popup-blokkoló ellen), mint a dokumentumtár-listában.
    const win = window.open('', '_blank')
    setOpeningKey(tetelKulcs(t))
    void getDokumentumUrl(dokId, false).then(({ url, error }) => {
      setOpeningKey(null)
      if (error || !url) {
        try {
          win?.close()
        } catch {
          /* ignore */
        }
        toast.error(error || 'A megnyitási link készítése sikertelen.')
        return
      }
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    })
  }

  // ── „Kifizetés rögzítése" — CombinedEntryDialog vázlat-előkitöltéssel ──
  const [rogzitoAdatok, setRogzitoAdatok] = useState<KifizetesRogzitoAdatok | null>(null)
  const [rogzitoBetolt, setRogzitoBetolt] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  /** Az aktív rögzítés: melyik számlához, és melyik vázlat-sor id-val ment be. */
  const [aktivRogzites, setAktivRogzites] = useState<{ tetel: KifizetetlenTetel; rowId: string } | null>(null)

  /**
   * A rögzítő vázlatába írja az előkitöltött KIADÁS-sort. A MEGLÉVŐ vázlatot
   * MEGŐRZI (hozzáfűz) — felülírni adatvesztés lenne. Ha a meglévő vázlat
   * olvashatatlan, NEM írunk (fail-closed), és hangosan jelezzük.
   */
  function irjElokitoltestAVazlatba(t: KifizetetlenTetel): { rowId: string; elokitoltve: boolean } {
    const rowId = crypto.randomUUID()
    const ujSor: VazlatSor = {
      id: rowId,
      datum: ma,
      categoryId: '',
      partner: t.partnerNev || '',
      docType: 'Factură',
      iratszam: t.szamlaSzam || '',
      gyulekezetiSzam: '',
      amount: String(t.osszeg),
      megjegyzes: `Szállítói számla kifizetése${t.szamlaSzam ? `: ${t.szamlaSzam}` : ''}`,
      bankId: '',
      evre: String(new Date().getFullYear()),
      people: [],
    }
    try {
      const kulcs = draftKulcs(congregationId)
      let incomeRows: unknown[] = []
      let expenseRows: VazlatSor[] = []
      const raw = window.localStorage.getItem(kulcs)
      if (raw) {
        // Meglévő vázlat: megőrizzük, az új sort a kiadás-fül végére fűzzük.
        const d = JSON.parse(raw) as { incomeRows?: unknown[]; expenseRows?: VazlatSor[] }
        incomeRows = Array.isArray(d.incomeRows) ? d.incomeRows : []
        expenseRows = (Array.isArray(d.expenseRows) ? d.expenseRows : []).filter(vazlatSorTartalmas)
      }
      expenseRows.push(ujSor)
      window.localStorage.setItem(
        kulcs,
        JSON.stringify({
          incomeRows,
          expenseRows,
          tab: 'expense',
          savedAt: new Date().toISOString(),
        }),
      )
      return { rowId, elokitoltve: true }
    } catch {
      // Olvashatatlan meglévő vázlat vagy letiltott tárhely — NEM írunk rá.
      return { rowId, elokitoltve: false }
    }
  }

  async function handleKifizetesRogzites(t: KifizetetlenTetel) {
    // A rögzítő törzsadatait egyszer töltjük be (jogcímek + bankszámlák).
    let adatok = rogzitoAdatok
    if (!adatok) {
      setRogzitoBetolt(true)
      adatok = await getKifizetesRogzitoAdatok()
      setRogzitoBetolt(false)
      if (adatok.error) {
        // FAIL-CLOSED: törzsadat nélkül a rögzítő menthetetlen sort adna.
        toast.error(adatok.error)
        return
      }
      setRogzitoAdatok(adatok)
    }

    const { rowId, elokitoltve } = irjElokitoltestAVazlatba(t)
    if (elokitoltve) {
      toast.info(
        'A kiadás-űrlap előkitöltve a számla adataival — válaszd ki a jogcímet, ellenőrizd, majd mentsd.',
      )
    } else {
      toast.warning(
        'A rögzítő korábbi vázlata nem olvasható, ezért az előkitöltés kimaradt — a számla adatait kézzel írd be.',
      )
    }
    setAktivRogzites({ tetel: t, rowId })
    setEntryOpen(true)
  }

  // A rögzítő bezárásakor: ha a vázlatból ELTŰNT az előkitöltött sor (sikeres
  // mentés törli a vázlatot), felkínáljuk a számla↔kiadás kapcsolást.
  function handleEntryClose(open: boolean) {
    setEntryOpen(open)
    if (open || !aktivRogzites) return
    const { tetel, rowId } = aktivRogzites
    setAktivRogzites(null)
    void load()

    let mentve = true
    try {
      const raw = window.localStorage.getItem(draftKulcs(congregationId))
      if (raw) {
        const d = JSON.parse(raw) as { expenseRows?: Array<{ id?: string }> }
        if ((d.expenseRows || []).some((r) => r?.id === rowId)) mentve = false
      }
    } catch {
      // Ha nem tudjuk eldönteni, inkább felkínáljuk a kapcsolást (ártalmatlan).
      mentve = true
    }
    if (mentve && tetel.forras === 'helyi') {
      setKapcsolasSzamla(tetel)
    } else if (!mentve) {
      toast.info('A kifizetés nem lett elmentve — a vázlat megmaradt, később folytatható.')
    }
  }

  // ── Kapcsolás + kifizetve-jelölés ────────────────────────────
  const [kapcsolasSzamla, setKapcsolasSzamla] = useState<KifizetetlenTetel | null>(null)
  const [kifizetveConfirm, setKifizetveConfirm] = useState<KifizetetlenTetel | null>(null)
  const [kifizetveBusy, setKifizetveBusy] = useState(false)

  async function handleKifizetve() {
    if (!kifizetveConfirm?.szamlaId) return
    setKifizetveBusy(true)
    const { error } = await setSzamlaKifizetve(kifizetveConfirm.szamlaId, true)
    setKifizetveBusy(false)
    setKifizetveConfirm(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A számla kifizetettként megjelölve.')
    void load()
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <ModuleHero
        eyebrow="Dokumentumtár"
        title="Kifizetetlen számlák"
        description="A még rendezetlen számlák egy helyen: a feltöltött szállítói számlák (amit a gyülekezet fizet) és — ha van Oblio-kapcsolat — a kiállított, még be nem folyt számlák. A lejárt határidejű tételek pirossal kiemelve."
        pills={[
          { label: congregationName, icon: <Building2 className="size-3.5 text-teal-600" /> },
          ...(lejartDb > 0
            ? [
                {
                  label: `${lejartDb} lejárt határidejű`,
                  icon: <AlertTriangle className="size-3.5" />,
                  tone: 'red' as const,
                },
              ]
            : []),
        ]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl border-slate-200 font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => router.push('/dokumentumtar')}
            >
              <ArrowLeft className="mr-1.5 size-4" aria-hidden />
              Dokumentumtár
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl border-teal-200 bg-teal-50/60 font-medium text-teal-700 hover:bg-teal-50"
              disabled={loading}
              onClick={() => void load(true)}
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 size-4" aria-hidden />
              )}
              Frissítés
            </Button>
          </>
        }
      />

      {/* ── HANGOS forrás-állapotok ── */}
      {eredmeny?.helyiHiba ? (
        <div className="card-raised border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>A feltöltött számlák listája nem tölthető be.</strong> {eredmeny.helyiHiba}
            </span>
          </p>
        </div>
      ) : null}
      {eredmeny?.oblioHiba ? (
        <div className="card-raised border-amber-300 bg-amber-50/70 p-4" role="alert">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>Az online (Oblio) forrás most nem elérhető</strong> — a lista csak a
              feltöltött számlákat mutatja. Részlet: {eredmeny.oblioHiba}
            </span>
          </p>
        </div>
      ) : null}
      {eredmeny && !eredmeny.oblioAktiv && !eredmeny.oblioHiba ? (
        <div className="card-raised border-slate-200 bg-slate-50/70 p-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CloudOff className="size-3.5 shrink-0" aria-hidden />
            Oblio-kapcsolat nincs beállítva ehhez a gyülekezethez — csak a feltöltött (ZIP/XML)
            számlák látszanak. Az Oblio a Pénzügy oldalon köthető be.
          </p>
        </div>
      ) : null}
      {eredmeny?.oblioTobbLehet ? (
        <div className="card-raised border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs text-amber-800">
            Az Oblio-lista elérte a lekérdezési korlátot (100 tétel) — lehet, hogy ennél több
            kifizetetlen számla is van az Oblio-fiókban.
          </p>
        </div>
      ) : null}

      {/* ── Összegző kártyák ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="card-raised rounded-2xl border border-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Banknote className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Fizetendő — szállítói számlák
              </p>
              <p className="truncate text-lg font-semibold text-slate-800">
                {osszegzes(fizetendok)}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  ({fizetendok.length} db)
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className="card-raised rounded-2xl border border-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <HandCoins className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Kintlévőség — kiállított számláink (Oblio)
              </p>
              <p className="truncate text-lg font-semibold text-slate-800">
                {osszegzes(kintlevosegek)}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  ({kintlevosegek.length} db)
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="card-raised p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-base text-slate-800">Kifizetetlen tételek</h3>
          <span className="text-xs text-slate-500">
            {tetelek.length === 0 ? 'Nincs tétel' : `${tetelek.length} tétel · határidő szerint`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Kifizetetlen számlák betöltése… (az online forrás lekérdezése pár másodpercig tarthat)
          </div>
        ) : tetelek.length === 0 && !eredmeny?.helyiHiba ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" aria-hidden />
            <p className="text-sm font-medium text-emerald-800">Minden számla rendezve.</p>
            <p className="mt-1 text-xs text-emerald-700/80">
              Új szállítói számlát a Dokumentumtárban tölthetsz fel (ANAF-os ZIP vagy e-Factura
              XML, „Szállítói számlák" mappa) — a feldolgozás után itt jelenik meg.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tetelek.map((t) => {
              const kulcs = tetelKulcs(t)
              const lejart = lejartE(t.fizetesiHatarido, ma)
              const napok = napokAHataridoig(t.fizetesiHatarido, ma)
              const fizetendo = t.irany === 'fizetendo'
              return (
                <li
                  key={kulcs}
                  className={`rounded-2xl border p-3 sm:p-4 ${
                    lejart
                      ? 'border-rose-300 bg-rose-50/60 ring-1 ring-rose-200'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {/* Bal: partner + részletek */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                          {t.partnerNev || 'Ismeretlen partner'}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            fizetendo
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-sky-200 bg-sky-50 text-sky-700'
                          }
                        >
                          {fizetendo ? 'Fizetendő' : 'Kintlévőség'}
                        </Badge>
                        {t.tipus === 'jovairo' ? (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                            Jóváíró
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="shrink-0 text-slate-500">
                          {t.forras === 'helyi' ? 'Feltöltött számla' : 'Oblio'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t.szamlaSzam ? <>Számla: {t.szamlaSzam} · </> : null}
                        Kiállítva: {datumSzoveg(t.kiallitasDatum)}
                      </p>
                      <p className={`mt-0.5 text-xs font-medium ${lejart ? 'text-rose-700' : 'text-slate-600'}`}>
                        {t.fizetesiHatarido ? (
                          <>
                            Határidő: {datumSzoveg(t.fizetesiHatarido)}
                            {napok !== null ? (
                              lejart ? (
                                <strong className="ml-1">
                                  — {Math.abs(napok)} napja lejárt!
                                </strong>
                              ) : (
                                <span className="ml-1 text-slate-500">
                                  — még {napok} nap
                                </span>
                              )
                            ) : null}
                          </>
                        ) : (
                          'Nincs megadott fizetési határidő'
                        )}
                      </p>
                    </div>

                    {/* Jobb: összeg + műveletek */}
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                      <p className={`text-lg font-bold ${lejart ? 'text-rose-700' : 'text-slate-800'}`}>
                        {formatOsszeg(t.osszeg, t.penznem)}
                      </p>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-9 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                          disabled={openingKey === kulcs}
                          onClick={() => handleMegnyitas(t)}
                          title="A számla-fájl megnyitása"
                        >
                          {openingKey === kulcs ? (
                            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <ExternalLink className="mr-1 size-3.5" aria-hidden />
                          )}
                          Megnyitás
                        </Button>
                        {t.forras === 'helyi' ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="min-h-9 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 font-semibold text-white hover:from-teal-700 hover:to-emerald-700"
                              disabled={rogzitoBetolt}
                              onClick={() => void handleKifizetesRogzites(t)}
                              title="Kiadás rögzítése a számla adataival, majd összekapcsolás"
                            >
                              {rogzitoBetolt ? (
                                <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <ReceiptText className="mr-1 size-3.5" aria-hidden />
                              )}
                              Kifizetés rögzítése
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-cyan-700 hover:bg-cyan-50"
                              aria-label="Összekapcsolás meglévő kiadással"
                              title="Összekapcsolás meglévő kiadással"
                              onClick={() => setKapcsolasSzamla(t)}
                            >
                              <Link2 aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-emerald-700 hover:bg-emerald-50"
                              aria-label="Megjelölés kifizetettnek"
                              title="Megjelölés kifizetettnek"
                              onClick={() => setKifizetveConfirm(t)}
                            >
                              <CheckCircle2 aria-hidden />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── „Kifizetés rögzítése" — a MEGLÉVŐ összevont rögzítő ── */}
      {rogzitoAdatok && !rogzitoAdatok.error ? (
        <CombinedEntryDialog
          open={entryOpen}
          onOpenChange={handleEntryClose}
          incomeCategories={rogzitoAdatok.incomeCategories}
          expenseCategories={rogzitoAdatok.expenseCategories}
          bankAccounts={rogzitoAdatok.bankAccounts}
          currentYear={new Date().getFullYear()}
          congregationId={congregationId}
          offerExpenseInventory
        />
      ) : null}

      {/* ── Számla ↔ kiadás kapcsolás ── */}
      <SzamlaKapcsolasDialog
        open={kapcsolasSzamla !== null}
        onOpenChange={(open) => {
          if (!open) setKapcsolasSzamla(null)
        }}
        szamla={kapcsolasSzamla}
        onChanged={() => void load()}
      />

      {/* ── Kifizetve-jelölés megerősítése ── */}
      <AdminConfirmDialog
        open={kifizetveConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setKifizetveConfirm(null)
        }}
        title="Számla megjelölése kifizetettnek"
        description={
          kifizetveConfirm ? (
            <>
              A(z) <strong>{kifizetveConfirm.partnerNev || 'ismeretlen szállító'}</strong>
              {kifizetveConfirm.szamlaSzam ? <> ({kifizetveConfirm.szamlaSzam})</> : null} számlája
              — <strong>{formatOsszeg(kifizetveConfirm.osszeg, kifizetveConfirm.penznem)}</strong> —
              kifizetettként lesz megjelölve, és lekerül erről a listáról. Kiadás-kapcsolat NEM
              készül — ha a kifizetést könyvelni is szeretnéd, előbb a „Kifizetés rögzítése"
              gombot használd.
            </>
          ) : null
        }
        confirmLabel="Kifizetve"
        loading={kifizetveBusy}
        onConfirm={() => void handleKifizetve()}
      />
    </div>
  )
}
