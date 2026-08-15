'use client'

/**
 * MemberRemoveDialog — a négyutas tag-kivezetés KÖZÖS dialógusa
 * (elhunyt / elköltözött / kitért / végleges törlés).
 *
 * 2026-08-15 (desktop-paritás 2. szelet — „A törlés egy nyelvet beszéljen"):
 * az apps/web/components/modals/member-remove-dialog.tsx teljes dialógus-
 * logikája ide került, hogy a desktop NE régi (isvisible-toggle) úton
 * vezessen ki tagot, hanem pontosan ugyanazon a felületen és láncon, mint a
 * web. A platform-függő részek props-injektálással érkeznek (ui-app szabály:
 * semmilyen platform-API import):
 *
 *   - `checkReferences`  — webes: checkPersonReferences Server Action;
 *                          desktop: direkt `szemely_kapcsolatok` RPC-hívás.
 *   - `removeMember`     — webes: removeMember Server Action;
 *                          desktop: removeMemberDesktop tükör (verified-session
 *                          őrrel, direkt Supabase-hívásokkal).
 *   - `onToast`          — siker/figyelmeztetés kijelzése a gazda-felület
 *                          eszközével (web: sonner; desktop: oldal-banner).
 *
 * A HIBA szándékosan NEM toast: a dialóguson BELÜL jelenik meg (piros sáv),
 * így a lelkész a nyitva maradó űrlap mellett látja, mi nem sikerült —
 * desktopon a dialógus fölé rétegzett toast nem is látszana.
 */

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@kartoteka/ui'
import {
  REMOVE_REASONS,
  REMOVE_REASON_LABELS,
  type PersonReferencesResult,
  type RemoveReason,
  type SzemelyRemoveInput,
  type SzemelyRemoveResult,
} from '@kartoteka/validations'

/** A gazda-felület toast-fajtái — a hibát a dialógus maga mutatja (inline). */
export type MemberRemoveToastKind = 'success' | 'warning'

export interface MemberRemoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: number; name: string } | null
  /**
   * Előzetes kapcsolat-ellenőrzés a 'torles' ághoz (fail-soft: available:false).
   * ⚠️ Referencia-stabil függvényt adj át (modul-szintű import vagy useCallback) —
   * inline lambda minden renderrel újraindítaná a betöltő effektet.
   */
  checkReferences: (personId: number) => Promise<PersonReferencesResult>
  /** A tényleges kivezetés-művelet (web: Server Action; desktop: direkt tükör). */
  removeMember: (input: SzemelyRemoveInput) => Promise<SzemelyRemoveResult>
  /** Siker/figyelmeztetés kijelzése — a dialógus sikernél magától záródik. */
  onToast: (message: string, kind: MemberRemoveToastKind) => void
  /** Sikeres kivezetés után (a toast után) — lista-frissítés a hívónál. */
  onRemoved?: () => void
  /** Plusz className a DialogContent-re (pl. desktop z-rétegzés: 'z-[70]'). */
  contentClassName?: string
}

export function MemberRemoveDialog({
  open,
  onOpenChange,
  member,
  checkReferences,
  removeMember,
  onToast,
  onRemoved,
  contentClassName,
}: MemberRemoveDialogProps) {
  const [step, setStep] = useState<'choose' | 'form'>('choose')
  const [reason, setReason] = useState<RemoveReason | null>(null)
  const [loading, setLoading] = useState(false)
  // A művelet hibája — a dialóguson belül jelenik meg, nem toastban.
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 2026-08-14 (1. döntés): ELŐZETES kapcsolat-ellenőrzés a 'torles' ághoz —
  // a lelkész a megerősítés ELŐTT látja, hogy végleges törlés vagy elrejtés
  // lesz-e, és pontosan mi védi a személyt. null = még fut / nem indult.
  const [refs, setRefs] = useState<PersonReferencesResult | null>(null)
  // Az effektben CSAK az aszinkron betöltés él — a tiszta lapot (refs=null)
  // az eseménykezelők állítják (selectReason/resetForm): effektben a szinkron
  // setState tilos (react-hooks/set-state-in-effect, a CI lint hibának veszi).
  useEffect(() => {
    if (!(open && step === 'form' && reason === 'torles' && member)) return
    let cancelled = false
    checkReferences(member.id)
      .then(r => {
        if (!cancelled) setRefs(r)
      })
      .catch(() => {
        if (!cancelled) setRefs({ available: false, blokkolo: [], veleTorlodik: [] })
      })
    return () => {
      cancelled = true
    }
  }, [open, step, reason, member, checkReferences])

  // Form mezők
  const [hdatum, setHdatum] = useState('')
  const [tdatum, setTdatum] = useState('')
  const [hhely, setHhely] = useState('')
  const [thely, setThely] = useState('')
  const [hoka, setHoka] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [koltDatum, setKoltDatum] = useState('')
  const [koltHova, setKoltHova] = useState('')
  const [kulfold, setKulfold] = useState(false)
  const [koltMegj, setKoltMegj] = useState('')
  const [kitDatum, setKitDatum] = useState('')
  const [kitVallas, setKitVallas] = useState('')
  const [kitHova, setKitHova] = useState('')
  const [kitMegj, setKitMegj] = useState('')

  function resetForm() {
    setStep('choose'); setReason(null); setRefs(null); setSubmitError(null)
    setHdatum(''); setTdatum(''); setHhely(''); setThely(''); setHoka(''); setLelkesz('')
    setKoltDatum(''); setKoltHova(''); setKulfold(false); setKoltMegj('')
    setKitDatum(''); setKitVallas(''); setKitHova(''); setKitMegj('')
  }

  function selectReason(r: RemoveReason) {
    setReason(r)
    // Az előzetes kapcsolat-ellenőrzés tiszta lappal indul — a gomb addig
    // tiltott, amíg az effekt be nem tölti az eredményt.
    setRefs(null)
    setSubmitError(null)
    setStep('form')
  }

  async function handleSubmit() {
    if (!member || !reason) return

    if (reason === 'torles') {
      // A megerősítő szöveg azt mondja, ami TÉNYLEG történni fog (előzetes
      // kapcsolat-ellenőrzés alapján): elrejtés vagy végleges törlés. Amíg az
      // ellenőrzés fut, a gomb le van tiltva; ha az ellenőrzés nem érhető el
      // (a migráció még nincs élesben), a szöveg NEM állít véglegességet —
      // kimondja, hogy a szerver dönt.
      const uzenet = refs?.available
        ? refs.blokkolo.length > 0
          ? 'A személy védett kapcsolatai miatt NEM törlődik véglegesen, hanem elrejtésre kerül a névsorból. Folytatja?'
          : 'Biztosan VÉGLEGESEN törli ezt a személyt? A törlésről napló készül, de a művelet nem visszavonható.'
        : 'Biztosan kivezeti ezt a személyt? A rendszer dönti el: ha védett kapcsolata (pénzügy, anyakönyv, család…) van, elrejtés történik, különben végleges, nem visszavonható törlés.'
      if (!confirm(uzenet)) return
    }

    setLoading(true)
    setSubmitError(null)
    const result = await removeMember({
      id: member.id,
      reason,
      hdatum: hdatum || undefined,
      tdatum: tdatum || undefined,
      hhely: hhely || undefined,
      thely: thely || undefined,
      hoka: hoka || undefined,
      lelkesz: lelkesz || undefined,
      kolt_datum: koltDatum || undefined,
      kolt_hova: koltHova || undefined,
      kulfold,
      kolt_megj: koltMegj || undefined,
      kitert_datum: kitDatum || undefined,
      kitert_vallas: kitVallas || undefined,
      kitert_hova: kitHova || undefined,
      kitert_megj: kitMegj || undefined,
    })

    if (result.error) {
      setSubmitError(result.error)
    } else {
      onToast(result.message || 'Művelet sikeresen végrehajtva.', 'success')
      // 2026-08-04 (PR-42): a háztartás/párkapcsolat lezárásának hibája eddig
      // némán elveszett — most a lelkész is látja, hogy van teendője.
      if (result.warning) {
        onToast(result.warning, 'warning')
      }
      resetForm()
      onOpenChange(false)
      onRemoved?.()
    }
    setLoading(false)
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className={`sm:max-w-lg ${contentClassName ?? ''}`}>
        <DialogHeader>
          <DialogTitle>Tag kivezetése: {member.name}</DialogTitle>
        </DialogHeader>

        {step === 'choose' && (
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Válassza ki a kivezetés okát:</p>
            {REMOVE_REASONS.map(r => (
              <Button key={r} variant="outline" className={`w-full justify-start ${r === 'torles' ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}`} onClick={() => selectReason(r)}>
                {r === 'meghalt' && '✝ '}{r === 'elkoltozott' && '🚚 '}{r === 'kitert' && '↪ '}{r === 'torles' && '🗑️ '}
                {REMOVE_REASON_LABELS[r]}
              </Button>
            ))}
          </div>
        )}

        {step === 'form' && reason === 'meghalt' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál dátuma *</Label><Input type="date" value={hdatum} onChange={e => setHdatum(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Temetés dátuma *</Label><Input type="date" value={tdatum} onChange={e => setTdatum(e.target.value)} required /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál helye</Label><Input value={hhely} onChange={e => setHhely(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Temetés helye</Label><Input value={thely} onChange={e => setThely(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál oka</Label><Input value={hoka} onChange={e => setHoka(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Lelkész neve</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 'form' && reason === 'elkoltozott' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Dátum</Label><Input type="date" value={koltDatum} onChange={e => setKoltDatum(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Hová költözött</Label><Input value={koltHova} onChange={e => setKoltHova(e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kulfold} onChange={e => setKulfold(e.target.checked)} /> Külföldre költözött</label>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={koltMegj} onChange={e => setKoltMegj(e.target.value)} /></div>
          </div>
        )}

        {step === 'form' && reason === 'kitert' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Dátum</Label><Input type="date" value={kitDatum} onChange={e => setKitDatum(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Új felekezet *</Label><Input value={kitVallas} onChange={e => setKitVallas(e.target.value)} placeholder="Pl. Római katolikus" /></div>
            </div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={kitMegj} onChange={e => setKitMegj(e.target.value)} /></div>
          </div>
        )}

        {step === 'form' && reason === 'torles' && (
          <div className="space-y-2">
            {/* 2026-08-14 (1. döntés): előzetes kapcsolat-ellenőrzés — a
                megerősítés ELŐTT kiderül, mi fog történni. */}
            {refs === null && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Kapcsolatok ellenőrzése…
              </div>
            )}
            {refs?.available && refs.blokkolo.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">
                  A személyt {refs.blokkolo.reduce((s, b) => s + b.darab, 0)} védett kapcsolat őrzi
                  — nem törölhető véglegesen.
                </p>
                <p className="mt-1">A végrehajtással a névsorból lesz <strong>elrejtve</strong> (később visszahozható). Ami védi:</p>
                <ul className="mt-1 list-disc pl-5">
                  {refs.blokkolo.map(b => (
                    <li key={b.kulcs}>{b.cimke} — {b.darab} db</li>
                  ))}
                </ul>
                {refs.blokkolo.some(b => b.kulcs === 'portal_link') && (
                  <p className="mt-1">
                    Az aktív tagi portál-összekötés miatt a rendszer a kivezetést
                    el is utasíthatja — ilyenkor előbb a portál-hozzáférést kell
                    visszavonni.
                  </p>
                )}
              </div>
            )}
            {refs?.available && refs.blokkolo.length === 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Nincs védett kapcsolat — a személy VÉGLEGESEN törölhető.</p>
                <p className="mt-1">A törlésről napló készül (ki, kit, mikor). Ez a művelet nem visszavonható!</p>
                {refs.veleTorlodik.length > 0 && (
                  <p className="mt-1">
                    Vele együtt törlődik:{' '}
                    {refs.veleTorlodik.map(v => `${v.cimke} (${v.darab} db)`).join(', ')}.
                  </p>
                )}
              </div>
            )}
            {refs !== null && !refs.available && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Figyelem!</p>
                <p>Ha a taghoz pénzügyi tranzakció vagy más védett kapcsolat tartozik, a rendszer nem törli véglegesen, hanem elrejti a névsorból.</p>
                {refs.error && <p className="mt-1 font-semibold">{refs.error}</p>}
              </div>
            )}
          </div>
        )}

        {/* A művelet hibája — a dialóguson belül, hogy az űrlap mellett látsszon. */}
        {step === 'form' && submitError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {step === 'form' && (
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="ghost" onClick={() => { setSubmitError(null); setStep('choose') }}>Vissza</Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              // 2026-08-14 bírálói javítás: amíg az előzetes ellenőrzés fut
              // (refs === null), a destruktív gomb TILTOTT — különben a
              // megerősítő szöveg mást mondana, mint ami történni fog.
              disabled={
                loading ||
                (reason === 'meghalt' && (!hdatum || !tdatum)) ||
                (reason === 'torles' && refs === null)
              }
            >
              {loading
                ? 'Feldolgozás...'
                : reason === 'torles' && refs === null
                  ? 'Ellenőrzés…'
                  : reason === 'torles' && refs?.available
                    ? refs.blokkolo.length > 0
                      ? 'Elrejtés a névsorból'
                      : 'Végleges törlés'
                    : 'Végrehajtás'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
