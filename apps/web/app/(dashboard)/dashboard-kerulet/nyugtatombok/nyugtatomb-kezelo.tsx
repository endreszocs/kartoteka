'use client'

/**
 * EGYHÁZKERÜLETI NYUGTATÖMB-KEZELŐ — a `/dashboard-kerulet/nyugtatombok`
 * felülete (2026-08-17, kerületi S6).
 *
 * A megyei párja: components/dashboard/diocese/diocese-chitanta-tombok-section.tsx.
 * Ugyanaz az öt művelet (lista, aktív státusz, nyitás, lezárás, törlés), a
 * kerületi szint szabályaival. A megyei fájlhoz NEM nyúlunk: ez ÚJ felület.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLENŐRI (SZÁMVEVŐI) NÉZET: LETILTVA, NEM ELREJTVE
 * ─────────────────────────────────────────────────────────────────────────────
 * A kerületi SZÁMVEVŐ olvas, de nem ír. Az ő nézetében minden gomb LÁTSZIK, de
 * le van tiltva, és mellette ott a szerverrel SZÓ SZERINT azonos magyarázat
 * (`readOnlyReason`, a `describeDistrictWriteBlock` szövege). Az elrejtés azt
 * üzenné, hogy „ez a funkció nem létezik" — a letiltás azt, hogy „létezik, de
 * más kezében van". Ez utóbbi az igazság. (A megyei párja ezt még nem tudja:
 * ott a gombok mindig aktívak, és a tiltás csak a szerver hibájából derül ki.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AMIT EZ A FELÜLET SZÁNDÉKOSAN NEM ÁLLÍT
 * ─────────────────────────────────────────────────────────────────────────────
 * A „következő szám" a `felhasznalt_darabszam` KÉZI számlálóból jön, amit
 * kerületi szinten semmi nem növel automatikusan (a nyugta-kronológia egyik
 * felső szinten sem létezik — lásd penzugy/actions.ts). Ezért NEM tényként
 * írjuk ki, hanem „nyilvántartás szerinti" felirattal, mellette a figyelmeztetés,
 * hogy kiállítás előtt a fizikai tömböt kell megnézni. Egy magabiztosan
 * kiírt, téves következő szám két ALÁÍRT nyugtát okozna azonos sorszámmal —
 * rosszabb, mint egy hiányzó adat.
 *
 * Design: a kerületi szint token-alapú, sötét módot is kiszolgáló nyelve
 * (card-raised, rounded-2xl), mobil-first: a táblázat SAJÁT vízszintes
 * görgetőben ül, az oldal törzse nem görget oldalra.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { MAX_NYUGTA_TOMBBEN } from '@kartoteka/validations'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'

import {
  closeKeruletiChitantaTomb,
  createKeruletiChitantaTomb,
  deleteKeruletiChitantaTomb,
  getAktivKeruletiChitantaTombStatus,
  listKeruletiChitantaTombok,
  type KeruletiChitantaTomb,
  type KeruletiChitantaTombStatusz,
} from '@/app/(dashboard)/dashboard-kerulet/chitanta-tombok-actions'

interface Props {
  /** A felület egyházkerülete — a hívó oldal a szerep-szűrt hatókörből adja. */
  districtId: string
  /** A kerület neve a fejléchez (a `districts` törzsadatból). */
  districtNev: string | null
}

export function NyugtatombKezelo({ districtId, districtNev }: Props) {
  const [tombok, setTombok] = useState<KeruletiChitantaTomb[]>([])
  const [aktiv, setAktiv] = useState<KeruletiChitantaTombStatusz | null>(null)
  const [canWrite, setCanWrite] = useState(false)
  const [tiltasSzoveg, setTiltasSzoveg] = useState<string | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [toltes, setToltes] = useState(true)
  const [dialogNyitva, setDialogNyitva] = useState(false)
  const [muvelet, startMuvelet] = useTransition()
  const [folyamatbanId, setFolyamatbanId] = useState<string | null>(null)

  const betolt = useCallback(async () => {
    setToltes(true)
    try {
      const [lista, statusz] = await Promise.all([
        listKeruletiChitantaTombok(districtId),
        getAktivKeruletiChitantaTombStatus(districtId),
      ])

      // A jogosultság MINDIG a szervertől jön — a kliens nem dönt róla.
      setCanWrite(lista.canWrite)
      setTiltasSzoveg(lista.readOnlyReason)

      // HANGOS hiba: a néma üres lista azt sugallná, hogy nincs nyugtatömb.
      // Egy hivatalos nyilvántartásban ez a legdrágább hazugság — a kerület
      // új tömböt venne fel a meglévő tartományra.
      const uzenet = lista.error || statusz.error || null
      setHiba(uzenet)
      setTombok(lista.data)
      setAktiv(statusz.active ?? null)
    } catch {
      setHiba(
        'A nyugtatömbök most nem tölthetők be. Ez NEM azt jelenti, hogy nincs nyilvántartott ' +
          'tömb — az adat beolvasása hiúsult meg. Frissíts, és ha megmarad, jelezd a rendszergazdának.',
      )
    } finally {
      setToltes(false)
    }
  }, [districtId])

  // Az effect TÖRZSÉBEN nincs szinkron setState — a betöltés microtaskban indul
  // (a repó bevett mintája; a react-hooks/set-state-in-effect nálunk ERROR).
  useEffect(() => {
    let elavult = false
    queueMicrotask(() => {
      if (!elavult) void betolt()
    })
    return () => {
      elavult = true
    }
  }, [betolt])

  const dolgozik = muvelet || toltes

  function lezar(t: KeruletiChitantaTomb) {
    if (!canWrite) return
    if (
      !confirm(
        `Biztosan lezárod a(z) „${t.seria} ${t.szam_kezdet}–${t.szam_veg}” tömböt?\n\n` +
          'A lezárt tömbből nem állítható ki több nyugta, de a nyilvántartásban megmarad.',
      )
    ) {
      return
    }
    setFolyamatbanId(t.id)
    startMuvelet(async () => {
      const res = await closeKeruletiChitantaTomb(t.id)
      setFolyamatbanId(null)
      if (res.error) toast.error(res.error)
      else {
        toast.success('A nyugtatömb lezárva.')
        await betolt()
      }
    })
  }

  function torol(t: KeruletiChitantaTomb) {
    if (!canWrite) return
    if (
      !confirm(
        `Biztosan TÖRLÖD a(z) „${t.seria} ${t.szam_kezdet}–${t.szam_veg}” tömböt?\n\n` +
          'A törlés végleges. Csak akkor tedd, ha a tömb tévedésből került be — használt ' +
          'tömböt zárj le a törlés helyett.',
      )
    ) {
      return
    }
    setFolyamatbanId(t.id)
    startMuvelet(async () => {
      const res = await deleteKeruletiChitantaTomb(t.id)
      setFolyamatbanId(null)
      if (res.error) toast.error(res.error)
      else {
        toast.success('A nyugtatömb törölve.')
        await betolt()
      }
    })
  }

  if (toltes && tombok.length === 0 && !hiba) {
    return (
      <div className="card-raised flex items-center justify-center gap-2 rounded-2xl p-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Nyugtatömbök betöltése…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Fejléc: aktív tömb + műveleti gombok ─────────────────────────── */}
      <div className="card-raised rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base text-foreground">
              {districtNev ? `${districtNev} — nyugtatömbjei` : 'Egyházkerületi nyugtatömbök'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Az egyházkerület SAJÁT nyugtatömbjei a készpénzes bevételeihez. Az egyházmegyék és a
              gyülekezetek nyugtatömbjei ide nem tartoznak — azokat a saját szintjük vezeti.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl max-sm:min-h-10"
              onClick={() => void betolt()}
              disabled={dolgozik}
            >
              <RefreshCw className="mr-1 size-3.5" />
              Frissítés
            </Button>
            <Button
              size="sm"
              className="ml-auto rounded-xl bg-violet-600 text-white hover:bg-violet-700 max-sm:min-h-10 sm:ml-0"
              onClick={() => setDialogNyitva(true)}
              disabled={!canWrite || dolgozik}
              title={canWrite ? undefined : tiltasSzoveg || undefined}
            >
              <Plus className="mr-1 size-4" />
              Új tömb
            </Button>
          </div>
        </div>

        {/* Ellenőri (számvevői) nézet — a letiltott gombok mellé MAGYARÁZAT. */}
        {!canWrite && tiltasSzoveg && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>{tiltasSzoveg}</span>
          </p>
        )}

        {/* Betöltési / lekérdezési hiba — kimondva, nem néma üresség. */}
        {hiba && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{hiba}</span>
          </p>
        )}

        {/* Aktív tömb státusza */}
        {aktiv ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                cimke="Aktív tömb"
                ertek={`${aktiv.seria} ${aktiv.szam_kezdet}–${aktiv.szam_veg}`}
                szin="violet"
              />
              <Kpi cimke="Nyilvántartott felhasznált" ertek={String(aktiv.felhasznalt)} szin="rose" />
              <Kpi
                cimke="Nyilvántartott maradék"
                ertek={String(aktiv.maradek)}
                szin={aktiv.maradek > 10 ? 'emerald' : 'amber'}
              />
              <Kpi
                cimke="Nyilvántartás szerinti következő"
                ertek={aktiv.kovetkezo_szam != null ? String(aktiv.kovetkezo_szam) : '—'}
                szin="indigo"
              />
            </div>
            {/* ⚠️ A KPI-k a KÉZI számlálóból jönnek. Ezt kimondjuk — lásd a fájl
                fejlécének „amit ez a felület szándékosan nem állít" pontját. */}
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Ezek a számok a NYILVÁNTARTOTT értékek: kerületi szinten a nyugta kiállítása nem
                növeli automatikusan a felhasznált darabszámot. Nyugta kiállítása előtt mindig a
                fizikai tömb következő üres lapját nézd meg — ne ezt a számot írd a nyugtára.
              </span>
            </p>
          </>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              Nincs aktív egyházkerületi nyugtatömb.
              {canWrite
                ? ' Az „Új tömb” gombbal veheted fel a megvásárolt tömb adatait.'
                : ' Az új tömb felvétele az egyházkerületi adminisztrátor feladata.'}
            </span>
          </p>
        )}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      <section className="card-raised overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
          <FileText className="size-4 text-violet-600 dark:text-violet-300" />
          <h2 className="font-heading text-base text-foreground">Nyugtatömb-nyilvántartás</h2>
          <Badge variant="outline" className="rounded-full border-border text-muted-foreground">
            {tombok.length} tömb
          </Badge>
          {toltes && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {/* A táblázat SAJÁT vízszintes görgetőben — az oldal törzse sosem
            görget oldalra (mobil-first követelmény). */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-xs">
            <thead className="border-b border-border/60 bg-muted/20">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Széria</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Számok</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Db</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Felhasznált</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Maradék</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Vásárlás</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Ár</th>
                <th className="p-2 text-center font-medium text-muted-foreground">Aktív</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Művelet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {tombok.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center italic text-muted-foreground">
                    {hiba
                      ? 'A lista most nem olvasható — lásd a fenti figyelmeztetést.'
                      : 'Még nincs felvéve egyházkerületi nyugtatömb.'}
                  </td>
                </tr>
              )}
              {tombok.map((t) => {
                const maradek = (t.darabszam_ossz || 0) - (t.felhasznalt_darabszam || 0)
                const sorDolgozik = folyamatbanId === t.id && muvelet
                return (
                  <tr key={t.id} className={t.aktiv ? 'hover:bg-muted/30' : 'opacity-60 hover:bg-muted/20'}>
                    <td className="p-2 font-semibold text-foreground">
                      {t.seria}
                      {t.block_nr ? (
                        <span className="ml-1 font-normal text-muted-foreground">({t.block_nr})</span>
                      ) : null}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {t.szam_kezdet}–{t.szam_veg}
                    </td>
                    <td className="p-2 text-right tabular-nums">{t.darabszam_ossz}</td>
                    <td className="p-2 text-right tabular-nums text-rose-600 dark:text-rose-300">
                      {t.felhasznalt_darabszam}
                    </td>
                    <td className="p-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {maradek}
                    </td>
                    <td className="p-2 text-[11px] text-muted-foreground">
                      <Calendar className="mr-1 inline size-3" />
                      {t.vasarlas_datuma}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {t.vasarlas_ara != null ? `${t.vasarlas_ara} RON` : '—'}
                    </td>
                    <td className="p-2 text-center">
                      {t.aktiv ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {sorDolgozik && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                        {t.aktiv && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-amber-700 dark:text-amber-300"
                            title={canWrite ? 'Lezárás' : tiltasSzoveg || undefined}
                            aria-label="Nyugtatömb lezárása"
                            disabled={!canWrite || dolgozik}
                            onClick={() => lezar(t)}
                          >
                            <Lock className="size-3.5" />
                          </Button>
                        )}
                        {/* A törlés CSAK használatlan tömbnél jelenik meg — a
                            szerver is ezt ellenőrzi, a két oldal nem húzhat szét. */}
                        {(t.felhasznalt_darabszam || 0) === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-rose-600 dark:text-rose-300"
                            title={canWrite ? 'Törlés (csak használatlan tömbnél)' : tiltasSzoveg || undefined}
                            aria-label="Nyugtatömb törlése"
                            disabled={!canWrite || dolgozik}
                            onClick={() => torol(t)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialogNyitva && (
        <UjTombDialog
          districtId={districtId}
          open={dialogNyitva}
          onOpenChange={setDialogNyitva}
          onKesz={() => {
            setDialogNyitva(false)
            void betolt()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI kártya
// ---------------------------------------------------------------------------

function Kpi({
  cimke,
  ertek,
  szin,
}: {
  cimke: string
  ertek: string
  szin: 'violet' | 'emerald' | 'rose' | 'amber' | 'indigo'
}) {
  const szinek: Record<typeof szin, string> = {
    violet:
      'border-violet-200 bg-violet-50/60 text-violet-800 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200',
    emerald:
      'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200',
    rose: 'border-rose-200 bg-rose-50/60 text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200',
    amber:
      'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200',
    indigo:
      'border-indigo-200 bg-indigo-50/60 text-indigo-800 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200',
  }
  return (
    <div className={`rounded-xl border px-3 py-2 ${szinek[szin]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{cimke}</p>
      <p className="truncate font-mono text-base font-semibold tabular-nums">{ertek}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Új tömb felvétele
// ---------------------------------------------------------------------------

/**
 * ⚠️ A SZÉRIA NINCS ELŐRE KITÖLTVE. A megyei párja „EGY"-gyel indul — az egy
 * TALÁLGATÁS: a tömbre nyomtatott betűjelet a nyomda adja, és ha a felhasználó
 * ott hagyja az előre írt értéket, a nyilvántartásban rossz széria alatt fut
 * majd egy hivatalos szám-tartomány. Üres mező + magyarázó helyőrző:
 * fail-closed. Ugyanezért nincs előre kitöltött szám-tartomány sem.
 */
function UjTombDialog({
  districtId,
  open,
  onOpenChange,
  onKesz,
}: {
  districtId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onKesz: () => void
}) {
  const [seria, setSeria] = useState('')
  const [blockNr, setBlockNr] = useState('')
  const [kezdet, setKezdet] = useState('')
  const [veg, setVeg] = useState('')
  const [vasarlasDatuma, setVasarlasDatuma] = useState(new Date().toISOString().slice(0, 10))
  const [ar, setAr] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [mentes, startMentes] = useTransition()

  const kezdetSzam = Number.parseInt(kezdet, 10)
  const vegSzam = Number.parseInt(veg, 10)
  const tartomanyOk =
    Number.isFinite(kezdetSzam) && Number.isFinite(vegSzam) && kezdetSzam > 0 && vegSzam >= kezdetSzam
  const darabszam = tartomanyOk ? vegSzam - kezdetSzam + 1 : null

  // Élő ellenőrzés: a felhasználó ne a mentés UTÁN tudja meg, mi hiányzik.
  // A szerver ugyanezeket a szabályokat újra ellenőrzi — a kliens csak előre
  // szól, nem ő a kapu.
  let mezoHiba: string | null = null
  if (!seria.trim()) mezoHiba = 'A széria kötelező — a nyugtatömbre nyomtatott betűjel.'
  else if (!kezdet.trim() || !veg.trim()) mezoHiba = 'Add meg a kezdő- és a végszámot.'
  else if (!tartomanyOk) mezoHiba = 'A végszám nem lehet kisebb a kezdőszámnál, és mindkettő pozitív egész.'
  // Egy nyugtatömb 50 lapos (Endre, 2026-09-02) — a szerver ugyanezt ellenőrzi.
  else if (darabszam != null && darabszam > MAX_NYUGTA_TOMBBEN)
    mezoHiba = `Egy nyugtatömb ${MAX_NYUGTA_TOMBBEN} lapos, a megadott tartomány ${darabszam} db. Ellenőrizd a kezdő- és a végszámot.`
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(vasarlasDatuma)) mezoHiba = 'A vásárlás dátuma kötelező.'

  function mentesInditasa() {
    if (mezoHiba || darabszam == null) {
      if (mezoHiba) toast.error(mezoHiba)
      return
    }
    startMentes(async () => {
      const res = await createKeruletiChitantaTomb({
        districtId,
        block_nr: blockNr.trim(),
        seria: seria.trim(),
        szam_kezdet: kezdetSzam,
        szam_veg: vegSzam,
        darabszam_ossz: darabszam,
        vasarlas_datuma: vasarlasDatuma,
        vasarlas_ara: ar.trim() ? Number(ar) : null,
        megjegyzes: megjegyzes.trim(),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Az egyházkerületi nyugtatömb rögzítve.')
      onKesz()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            Új egyházkerületi nyugtatömb
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            A megvásárolt tömb adatait pontosan úgy add meg, ahogy a tömbre nyomtatva szerepel. A
            szám-tartomány nem fedheti át egy korábbi, azonos szériájú tömbét — ezt mentés előtt
            ellenőrizzük.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Széria *">
              <Input
                value={seria}
                onChange={(e) => setSeria(e.target.value)}
                placeholder="A tömbre nyomtatott betűjel"
                autoFocus
              />
            </ModalField>
            <ModalField label="Tömb száma (opcionális)">
              <Input
                value={blockNr}
                onChange={(e) => setBlockNr(e.target.value)}
                placeholder="Belső nyilvántartás"
              />
            </ModalField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <ModalField label="Kezdő szám *">
              <Input
                type="number"
                inputMode="numeric"
                value={kezdet}
                onChange={(e) => {
                  const ertek = e.target.value
                  setKezdet(ertek)
                  // 50 lapos tömb: a végszámot felajánljuk, de CSAK amíg üres —
                  // a kézzel beírt értéket soha nem írjuk felül.
                  const k = Number.parseInt(ertek, 10)
                  if (Number.isFinite(k) && k > 0 && !veg.trim()) {
                    setVeg(String(k + MAX_NYUGTA_TOMBBEN - 1))
                  }
                }}
                placeholder="pl. 1"
              />
            </ModalField>
            <ModalField label="Vég szám *">
              <Input
                type="number"
                inputMode="numeric"
                value={veg}
                onChange={(e) => setVeg(e.target.value)}
                placeholder="pl. 50"
              />
            </ModalField>
            <ModalField label="Darabszám (számított)">
              <Input value={darabszam != null ? String(darabszam) : '—'} readOnly className="bg-muted/40" />
            </ModalField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Vásárlás dátuma *">
              <Input
                type="date"
                value={vasarlasDatuma}
                onChange={(e) => setVasarlasDatuma(e.target.value)}
              />
            </ModalField>
            <ModalField label="Vásárlás ára (RON)">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={ar}
                onChange={(e) => setAr(e.target.value)}
                placeholder="pl. 35"
              />
            </ModalField>
          </div>

          <ModalField label="Megjegyzés">
            <Input value={megjegyzes} onChange={(e) => setMegjegyzes(e.target.value)} />
          </ModalField>

          {mezoHiba && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{mezoHiba}</span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={mentes}>
            Mégse
          </Button>
          <Button
            className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            onClick={mentesInditasa}
            disabled={mentes || !!mezoHiba}
            title={mezoHiba || undefined}
          >
            {mentes ? 'Rögzítés…' : 'Rögzítés'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
