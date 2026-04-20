'use client'

import { GitBranch } from 'lucide-react'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

interface FamilyTreeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: number | null
}

interface PersonRecord {
  id: number
  cnp: string | null
  csaladnev: string | null
  k_nev: string | null
  ferfi: boolean | null
  sz_datum: string | null
  meghalt: boolean | null
  id_apja: string | null
  id_anyja: string | null
}

interface TreeNode {
  id: number
  pids: number[]
  fid?: number
  mid?: number
  name: string
  born: string
  deceased: string
  tags: string[]
}

declare class FamilyTree {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static templates: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static match: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static action: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(container: HTMLElement, options: any)
  destroy(): void
}

function formatBornSummary(value: string | null) {
  if (!value) return 'Születési adat nincs'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const year = parsed.getFullYear()
  const currentYear = new Date().getFullYear()
  const age = currentYear - year

  return `sz. ${year}${age >= 0 ? ` (${age} év)` : ''}`
}

function ensureTreeTemplates() {
  if (typeof FamilyTree === 'undefined' || FamilyTree.templates.kivalasztott) return

  const nodeWidth = 250
  const nodeHeight = 120

  const maleAvatar =
    '<circle cx="52" cy="40" r="12" fill="{avatar}" opacity="0.92"></circle>' +
    '<path d="M35,70 C35,55 43,49 52,49 C61,49 69,55 69,70" fill="{avatar}" opacity="0.8"></path>'

  const femaleAvatar =
    '<circle cx="52" cy="40" r="12" fill="{avatar}" opacity="0.92"></circle>' +
    '<path d="M35,70 C35,55 43,49 52,49 C61,49 69,55 69,70" fill="{avatar}" opacity="0.8"></path>' +
    '<path d="M39,35 C39,25 45,21 52,21 C59,21 65,25 65,35 L65,41 C65,41 62,39 60,41 C58,39 56,38 52,39 C48,38 46,39 44,41 C42,39 39,41 39,41 Z" fill="{avatar}" opacity="0.45"></path>'

  function buildMilaNode({
    shellColor,
    accentColor,
    avatarBg,
    avatarSvg,
  }: {
    shellColor: string
    accentColor: string
    avatarBg: string
    avatarSvg: string
  }) {
    return [
      `<rect x="0" y="0" width="${nodeWidth}" height="${nodeHeight}" rx="20" ry="20" fill="${shellColor}" stroke="${accentColor}" stroke-width="1.5"></rect>`,
      `<rect x="16" y="16" width="${nodeWidth - 32}" height="44" rx="18" ry="18" fill="${accentColor}" fill-opacity="0.92"></rect>`,
      `<rect x="16" y="70" width="${nodeWidth - 32}" height="34" rx="12" ry="12" fill="#ffffff" stroke="${accentColor}" stroke-width="1"></rect>`,
      `<rect x="24" y="24" width="56" height="56" rx="18" ry="18" fill="${avatarBg}"></rect>`,
      avatarSvg.replace(/\{avatar\}/g, '#ffffff'),
      `<circle cx="${nodeWidth - 32}" cy="38" r="6" fill="#ffffff" fill-opacity="0.18"></circle>`,
      `<circle cx="${nodeWidth - 18}" cy="38" r="4" fill="#ffffff" fill-opacity="0.32"></circle>`,
    ].join('')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createTemplate(nodeSvg: string): any {
    const template = Object.assign({}, FamilyTree.templates.hugo)
    template.size = [nodeWidth, nodeHeight]
    template.node = nodeSvg
    template.field_0 =
      '<text data-width="180" style="font-size: 16px; font-weight: 700;" fill="#1e293b" x="125" y="92" text-anchor="middle">{val}</text>'
    template.field_1 =
      '<text data-width="132" style="font-size: 12px; font-weight: 600;" fill="#ffffff" x="94" y="36" text-anchor="start">{val}</text>'
    template.field_2 =
      '<text data-width="132" style="font-size: 11px;" fill="#eff6ff" x="94" y="53" text-anchor="start">{val}</text>'
    template.ripple = { radius: 0, color: 'transparent', rect: null }
    return template
  }

  FamilyTree.templates.ferfi = createTemplate(
    buildMilaNode({
      shellColor: '#eff6ff',
      accentColor: '#2563eb',
      avatarBg: '#60a5fa',
      avatarSvg: maleAvatar,
    }),
  )
  FamilyTree.templates.no = createTemplate(
    buildMilaNode({
      shellColor: '#fdf2f8',
      accentColor: '#db2777',
      avatarBg: '#f472b6',
      avatarSvg: femaleAvatar,
    }),
  )
  FamilyTree.templates.ferfi_elhunyt = createTemplate(
    buildMilaNode({
      shellColor: '#f8fafc',
      accentColor: '#94a3b8',
      avatarBg: '#cbd5e1',
      avatarSvg: maleAvatar,
    }),
  )
  FamilyTree.templates.no_elhunyt = createTemplate(
    buildMilaNode({
      shellColor: '#f8fafc',
      accentColor: '#94a3b8',
      avatarBg: '#cbd5e1',
      avatarSvg: femaleAvatar,
    }),
  )
  FamilyTree.templates.kivalasztott = createTemplate(
    buildMilaNode({
      shellColor: '#ecfdf5',
      accentColor: '#0f766e',
      avatarBg: '#14b8a6',
      avatarSvg: maleAvatar,
    }),
  )
}

export function FamilyTreeDialog({ open, onOpenChange, memberId }: FamilyTreeDialogProps) {
  const [loading, setLoading] = useState(true)
  const [nodeCount, setNodeCount] = useState(0)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<FamilyTree | null>(null)

  useEffect(() => {
    if (!open || !memberId) return

    let cancelled = false
    const currentMemberId = memberId

    async function loadTree() {
      setLoading(true)
      setError('')
      setNodeCount(0)

      if (typeof FamilyTree === 'undefined') {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://balkan.app/js/familytree.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('A családfa könyvtár nem tölthető be.'))
          document.head.appendChild(script)
        })
      }

      ensureTreeTemplates()

      const supabase = createClient()
      const visited = new Set<number>()
      const nodes: TreeNode[] = []

      async function fetchById(id: number): Promise<PersonRecord | null> {
        if (!id || visited.has(id)) return null
        visited.add(id)
        const { data } = await supabase.from('szemely').select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja').eq('id', id).maybeSingle()
        return (data || null) as PersonRecord | null
      }

      async function fetchByCnp(cnp: string): Promise<PersonRecord | null> {
        if (!cnp) return null
        const { data } = await supabase.from('szemely').select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja').eq('cnp', cnp).maybeSingle()
        if (data) visited.add(data.id)
        return (data || null) as PersonRecord | null
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function toNode(p: any, fid?: number, mid?: number, isSelf = false): TreeNode {
        const genderTag = p.ferfi ? 'ferfi' : 'no'
        const tag = isSelf ? 'kivalasztott' : p.meghalt ? genderTag + '_elhunyt' : genderTag
        return {
          id: p.id, pids: [], fid, mid,
          name: `${p.csaladnev || ''} ${p.k_nev || ''}`.trim(),
          born: formatBornSummary(p.sz_datum),
          deceased: p.meghalt ? '✝ Elhunyt' : '',
          tags: [tag],
        }
      }

      const currentMember = await fetchById(currentMemberId)
      if (!currentMember) {
        throw new Error('A kiválasztott személy nem található.')
      }

      nodes.push(toNode(currentMember, undefined, undefined, true))

      let currentFather = currentMember.id_apja ? await fetchByCnp(currentMember.id_apja) : null
      let currentMother = currentMember.id_anyja ? await fetchByCnp(currentMember.id_anyja) : null

      if (currentFather) nodes.push(toNode(currentFather))
      if (currentMother) nodes.push(toNode(currentMother))

      if (currentFather && currentMother) {
        const currentFatherId = currentFather.id
        const currentMotherId = currentMother.id
        const fatherNode = nodes.find((node) => node.id === currentFatherId)
        const motherNode = nodes.find((node) => node.id === currentMotherId)
        if (fatherNode && currentMother) fatherNode.pids = [currentMother.id]
        if (motherNode && currentFather) motherNode.pids = [currentFather.id]
      }

      const selfNode = nodes.find((node) => node.id === currentMember.id)
      if (selfNode) {
        if (currentFather) selfNode.fid = currentFather.id
        if (currentMother) selfNode.mid = currentMother.id
      }

      const { data: birthFamilyLink } = await supabase
        .from('gyerek')
        .select('id_csalad')
        .eq('id_szemely', currentMember.id)
        .maybeSingle()

      if (birthFamilyLink?.id_csalad) {
        const { data: birthFamily } = await supabase
          .from('csalad')
          .select('id, id_ferfi, id_no')
          .eq('id', birthFamilyLink.id_csalad)
          .maybeSingle()

        if (birthFamily) {
          if (!currentFather && birthFamily.id_ferfi && birthFamily.id_ferfi !== currentMember.id) {
            currentFather = await fetchById(birthFamily.id_ferfi)
            if (currentFather) nodes.push(toNode(currentFather))
          }
          if (!currentMother && birthFamily.id_no && birthFamily.id_no !== currentMember.id) {
            currentMother = await fetchById(birthFamily.id_no)
            if (currentMother) nodes.push(toNode(currentMother))
          }

          const refreshedSelfNode = nodes.find((node) => node.id === currentMember.id)
          if (refreshedSelfNode) {
            if (currentFather) refreshedSelfNode.fid = currentFather.id
            if (currentMother) refreshedSelfNode.mid = currentMother.id
          }

          if (currentFather && currentMother) {
            const currentFatherId = currentFather.id
            const currentMotherId = currentMother.id
            const fatherNode = nodes.find((node) => node.id === currentFatherId)
            const motherNode = nodes.find((node) => node.id === currentMotherId)
            if (fatherNode && fatherNode.pids.length === 0 && currentMother) fatherNode.pids = [currentMother.id]
            if (motherNode && motherNode.pids.length === 0 && currentFather) motherNode.pids = [currentFather.id]
          }

          const { data: siblings } = await supabase
            .from('gyerek')
            .select('id_szemely')
            .eq('id_csalad', birthFamily.id)
            .neq('id_szemely', currentMember.id)

          if (siblings) {
            for (const siblingRow of siblings) {
              const sibling = await fetchById(siblingRow.id_szemely)
              if (sibling) {
                nodes.push(toNode(sibling, currentFather?.id, currentMother?.id))
              }
            }
          }
        }
      }

      // A személy családjának megkeresése
      const { data: fam } = await supabase.from('csalad')
        .select('id, id_ferfi, id_no')
        .or(`id_ferfi.eq.${currentMemberId},id_no.eq.${currentMemberId}`)
        .limit(1)
        .maybeSingle()

      if (!fam) {
        // Nincs család → csak a személy
        const person = await fetchById(currentMemberId)
        if (person) nodes.push(toNode(person))
      } else {
        const husband = fam.id_ferfi ? await fetchById(fam.id_ferfi) : null
        const wife = fam.id_no ? await fetchById(fam.id_no) : null

        if (husband) nodes.push(toNode(husband))
        if (wife) nodes.push(toNode(wife))
        if (husband && wife) {
          const hNode = nodes.find(n => n.id === husband.id)
          const wNode = nodes.find(n => n.id === wife.id)
          if (hNode) hNode.pids = [wife.id]
          if (wNode) wNode.pids = [husband.id]
        }

        // Gyerekek
        const { data: children } = await supabase.from('gyerek').select('id_szemely').eq('id_csalad', fam.id)
        if (children) {
          for (const c of children) {
            const child = await fetchById(c.id_szemely)
            if (child) {
              nodes.push(toNode(child, husband?.id, wife?.id))
            }
          }
        }

        // Szülők (CNP alapján)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async function addParents(person: any) {
          if (!person) return
          let fatherId: number | undefined, motherId: number | undefined
          if (person.id_apja) {
            const father = await fetchByCnp(person.id_apja)
            if (father) { fatherId = father.id; nodes.push(toNode(father)) }
          }
          if (person.id_anyja) {
            const mother = await fetchByCnp(person.id_anyja)
            if (mother) { motherId = mother.id; nodes.push(toNode(mother)) }
          }
          if (fatherId && motherId) {
            const fn = nodes.find(n => n.id === fatherId)
            const mn = nodes.find(n => n.id === motherId)
            if (fn) fn.pids = [motherId]
            if (mn) mn.pids = [fatherId]
          }
          const pNode = nodes.find(n => n.id === person.id)
          if (pNode) {
            if (fatherId) pNode.fid = fatherId
            if (motherId) pNode.mid = motherId
          }
        }
        await addParents(husband)
        await addParents(wife)
      }

      const dedupedNodes = Array.from(
        nodes.reduce((acc, node) => {
          const existing = acc.get(node.id)
          if (existing) {
            existing.pids = Array.from(new Set([...(existing.pids || []), ...(node.pids || [])]))
            existing.fid = existing.fid || node.fid
            existing.mid = existing.mid || node.mid
            if (existing.tags[0] !== 'kivalasztott' && node.tags[0] === 'kivalasztott') {
              existing.tags = node.tags
            }
          } else {
            acc.set(node.id, { ...node, pids: Array.from(new Set(node.pids || [])) })
          }
          return acc
        }, new Map<number, TreeNode>()),
      ).map(([, node]) => node)

      if (dedupedNodes.length <= 1) {
        if (!cancelled) {
          setError('Nincs elegendő adat a családfa megjelenítéséhez. Rögzítse a családtagok szüleit és kapcsolatait!')
          setLoading(false)
        }
        return
      }

      if (!cancelled) {
        setNodeCount(dedupedNodes.length)
      }

      // Template-ek (Mila stílus alapú, egyedi)
      if (!FamilyTree.templates.ferfi) {
        const nW = 220, nH = 80
        const maleAvatar = '<circle cx="35" cy="30" r="12" fill="{af}" opacity="0.8"></circle><path d="M18,58 C18,46 26,40 35,40 C44,40 52,46 52,58" fill="{af}" opacity="0.5"></path>'
        const femaleAvatar = maleAvatar + '<path d="M23,25 C23,16 28,14 35,14 C42,14 47,16 47,25 L47,30 C47,30 44,28 42,30 C40,28 38,27 35,28 C32,27 30,28 28,30 C26,28 23,30 23,30 Z" fill="{af}" opacity="0.35"></path>'

        function buildSvg(border: string, bg: string, af: string, avatar: string) {
          return `<rect x="0" y="0" width="${nW}" height="${nH}" rx="12" ry="12" fill="${bg}" stroke="${border}" stroke-width="1.5"></rect><line x1="68" y1="12" x2="68" y2="${nH-12}" stroke="${border}" stroke-width="0.5" opacity="0.3"></line>${avatar.replace(/\{af\}/g, af)}`
        }
        const fields = {
          field_0: '<text x="78" y="30" font-size="13" font-weight="600" font-family="DM Sans,Inter,sans-serif" fill="#1e293b">{val}</text>',
          field_1: '<text x="78" y="47" font-size="10.5" font-family="DM Sans,Inter,sans-serif" fill="#64748b">{val}</text>',
          field_2: '<text x="78" y="62" font-size="9.5" font-family="DM Sans,Inter,sans-serif" fill="#94a3b8">{val}</text>',
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function makeTpl(nodeSvg: string): any {
          const t = Object.assign({}, FamilyTree.templates.hugo)
          t.size = [nW, nH]; t.node = nodeSvg
          t.field_0 = fields.field_0; t.field_1 = fields.field_1; t.field_2 = fields.field_2
          t.ripple = { radius: 0, color: 'transparent', rect: null }
          return t
        }
        FamilyTree.templates.ferfi = makeTpl(buildSvg('#3b82f6', '#f0f7ff', '#3b82f6', maleAvatar))
        FamilyTree.templates.no = makeTpl(buildSvg('#ec4899', '#fdf2f8', '#ec4899', femaleAvatar))
        FamilyTree.templates.ferfi_elhunyt = makeTpl(`<g opacity="0.45">${buildSvg('#94a3b8', '#f8fafc', '#94a3b8', maleAvatar)}</g>`)
        FamilyTree.templates.no_elhunyt = makeTpl(`<g opacity="0.45">${buildSvg('#94a3b8', '#f8fafc', '#94a3b8', femaleAvatar)}</g>`)
      }

      // Renderelés
      if (instanceRef.current) { try { instanceRef.current.destroy() } catch {} }
      if (!containerRef.current) return

      instanceRef.current = new FamilyTree(containerRef.current, {
        nodes: dedupedNodes,
        nodeBinding: { field_0: 'name', field_1: 'born', field_2: 'deceased' },
        editForm: { enabled: false },
        toolbar: { zoom: true, fit: true },
        template: 'hugo',
        scaleInitial: FamilyTree.match.boundary,
        enableSearch: false,
        mouseScrool: FamilyTree.action.zoom,
      })

      if (!cancelled) {
        setLoading(false)
      }
    }

    loadTree().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Hiba történt a családfa betöltésekor.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      if (instanceRef.current) { try { instanceRef.current.destroy() } catch {} instanceRef.current = null }
    }
  }, [open, memberId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] !w-[min(1260px,calc(100vw-2rem))] !max-w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1320px,calc(100vw-3rem))] sm:!max-w-[min(1320px,calc(100vw-3rem))]"
        showCloseButton={false}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,251,250,0.98)_100%)] shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-slate-200/70">
        <div className="px-6 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="font-heading text-lg">Családfa</DialogTitle>
              <p className="text-xs text-zinc-400">{nodeCount > 0 ? `${nodeCount} személy` : 'Betöltés...'}</p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors" aria-label="Bezárás">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Családfa container */}
        <div className="flex-1 relative bg-zinc-50">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <GitBranch className="w-12 h-12 text-emerald-300 animate-pulse mb-3" />
              <p className="text-sm text-zinc-500">Családfa betöltése...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 text-center">
              <GitBranch className="w-16 h-16 text-zinc-200 mb-4" />
              <p className="text-zinc-500 font-medium">{error}</p>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full min-h-[400px]" />
        </div>

        <div className="px-6 py-3 border-t border-zinc-100 flex justify-end shrink-0">
          <Button variant="outline" size="sm" className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200" onClick={() => onOpenChange(false)}>
            Vissza az adatlaphoz
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
