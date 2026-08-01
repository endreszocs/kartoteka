'use client'

/**
 * Személyi karton NYOMTATÓ dialógus (2026-07-25, PR-17).
 *
 * A személyi kartonról nyitható: élő A4-előnézet + opcionális „hátoldalak":
 *   - Befizetések (a karton már betöltött befizetés-listájából)
 *   - Családfa (lustán töltve a getFamilyTreeDataByMemberId-ból, nemzedékekre
 *     bontva, rokonsági címkékkel)
 * Nyomtatás a böngésző beépített útján (Cél: „Mentés PDF-ként" is választható).
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getVoterPrintContext } from '@/app/(dashboard)/tagnyilvantartas/voter-actions'
import { getMemberDetails } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getFamilyTreeDataByMemberId } from '@/lib/family-tree/get-family-tree'
import {
  buildPersonCardHtml,
  type PersonCardPrintData,
  type PersonCardTreeMember,
} from '@/lib/members/person-card-print'
import { printToBrowser } from '@/lib/utils/print-engine-v2'
import type { EnrichedMember } from '@/lib/constants/members'

type MemberDetailsData = Awaited<ReturnType<typeof getMemberDetails>>

interface PersonCardPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  details: MemberDetailsData | null
}

function relName(rel?: { name?: string | null } | Array<{ name?: string | null }> | null): string | null {
  if (!rel) return null
  if (Array.isArray(rel)) return rel[0]?.name ?? null
  return rel.name ?? null
}

export function PersonCardPrintDialog({ open, onOpenChange, member, details }: PersonCardPrintDialogProps) {
  const [includePayments, setIncludePayments] = useState(false)
  const [includeTree, setIncludeTree] = useState(false)
  const [congName, setCongName] = useState('Gyülekezet')
  const [tree, setTree] = useState<PersonCardTreeMember[] | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getVoterPrintContext()
      .then((ctx) => { if (!cancelled) setCongName(ctx.congregationName) })
      .catch(() => { /* fallback marad */ })
    return () => { cancelled = true }
  }, [open])

  // Családfa — lustán, az első bekapcsoláskor
  useEffect(() => {
    if (!open || !includeTree || tree !== null || !member) return
    let cancelled = false
    setTreeLoading(true)
    getFamilyTreeDataByMemberId(member.id)
      .then((data) => {
        if (cancelled) return
        const mapped: PersonCardTreeMember[] = (data?.members ?? []).map((m) => ({
          generation: m.generation,
          label: m.isCenter ? 'Ő maga' : m.roleLabel ?? null,
          name: [m.csaladnev, m.k_nev].filter(Boolean).join(' ').trim() || `#${m.id}`,
          birthYear: m.sz_datum?.match(/^\d{4}/)?.[0] ?? null,
          deceased: !!m.meghalt,
          isCenter: !!m.isCenter,
        }))
        setTree(mapped)
        setTreeLoading(false)
        if (mapped.length === 0) toast.info('Ehhez a taghoz még nincs rögzített családi kapcsolat.')
      })
      .catch(() => {
        if (cancelled) return
        setTreeLoading(false)
        setIncludeTree(false)
        toast.error('A családfa betöltése nem sikerült.')
      })
    return () => { cancelled = true }
  }, [open, includeTree, tree, member])

  useEffect(() => {
    if (!open) {
      setIncludePayments(false)
      setIncludeTree(false)
      setTree(null)
    }
  }, [open])

  const cardData = useMemo<PersonCardPrintData | null>(() => {
    if (!member) return null
    const address = [
      member.adrlocality?.name,
      member.adrstreet?.name,
      member.c_szam,
    ].filter(Boolean).join(', ')
    return {
      congregationName: congName,
      personName: [member.csaladnev, member.k_nev].filter(Boolean).join(' ').trim(),
      szcsNev: member.szcs_nev ?? null,
      gender: member.ferfi === true ? 'ferfi' : member.ferfi === false ? 'no' : null,
      birthDate: member.sz_datum ?? null,
      birthPlace: member.birthLocality?.name ?? null,
      religion: member.vallas ?? null,
      occupation: member.foglalkozas ?? null,
      fatherName: member.apjaneve ?? null,
      motherName: member.anyjaneve ?? null,
      address: address || null,
      phone: member.telefon ?? null,
      email: member.email ?? null,
      cnp: member.cnp ?? null,
      photoUrl: member.photo_url ?? null,
      baptism: details?.kereszteles
        ? {
            date: details.kereszteles.datum ?? null,
            place: details.kereszteles.adrlocality?.name ?? null,
            pastor: details.kereszteles.lelkeszneve ?? null,
          }
        : null,
      confirmation: details?.konfirmacio
        ? {
            date: details.konfirmacio.datum ?? null,
            place: relName(details.konfirmacio.adrlocality),
            pastor: details.konfirmacio.lelkeszneve ?? null,
          }
        : null,
      note: member.megjegyzes ?? null,
      payments: includePayments
        ? (details?.befizetesek ?? []).map((p) => ({
            datum: p.datum ?? null,
            cel: p.befizetescel?.nev ?? null,
            ev: p.fizetettev ?? null,
            osszeg: Number(p.osszeg) || 0,
            stornozott: !!p.stornozott,
          }))
        : null,
      tree: includeTree && tree && tree.length > 0 ? tree : null,
    }
  }, [member, details, congName, includePayments, includeTree, tree])

  const report = useMemo(() => (cardData ? buildPersonCardHtml(cardData) : null), [cardData])

  async function handlePrint() {
    if (!report) return
    setSending(true)
    try {
      await printToBrowser(report.html)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem sikerült.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Személyi karton nyomtatása</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="card-raised space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mi kerüljön a hátoldalra?
              </p>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includePayments}
                  disabled={(details?.befizetesek ?? []).length === 0}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                />
                Befizetések ({(details?.befizetesek ?? []).length} tétel)
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeTree}
                  onChange={(e) => setIncludeTree(e.target.checked)}
                />
                Családfa nemzedékenként
                {treeLoading && <span className="text-xs text-muted-foreground">(betöltés…)</span>}
              </label>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900">
              <p className="font-semibold">💡 PDF-be mentés</p>
              <p className="mt-1">
                A <strong>Nyomtatás</strong> gomb után a <strong>Cél / Nyomtató</strong>{' '}
                listából válaszd a <strong>&bdquo;Mentés PDF-ként&rdquo;</strong> lehetőséget.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button className="min-h-11 rounded-xl" onClick={() => void handlePrint()} disabled={!report || sending}>
                {sending ? 'Nyomtatás…' : 'Nyomtatás / Mentés PDF-ként'}
              </Button>
              <Button variant="ghost" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-border bg-muted/40 p-2">
            {report ? (
              <iframe
                title={report.title}
                srcDoc={report.html}
                className="h-[72vh] min-h-[480px] w-full rounded-[16px] bg-white"
              />
            ) : (
              <div className="flex h-[72vh] items-center justify-center text-sm text-muted-foreground">
                Nincs megjeleníthető adat.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
