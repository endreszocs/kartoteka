/*
'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  ArrowRight,
  BookOpen,
  HeartHandshake,
  Lightbulb,
  MessageCircleHeart,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getIdeaComments,
  loadWorkshopExperience,
  saveIdeaComment,
  shareMissionMaterial,
  submitMissionIdea,
  supportIdea,
  toggleIdeaJoin,
} from '@/app/misszios-muhely/community-actions'
import { deleteMaterial } from '@/app/misszios-muhely/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getMissionProgress } from '@/lib/missions/gamification'

type WorkshopLoadResult = Awaited<ReturnType<typeof loadWorkshopExperience>>
type WorkshopPayload = Exclude<WorkshopLoadResult, { error: string }>
type WorkshopIdea = WorkshopPayload['ideas'][number]
type WorkshopMaterial = WorkshopPayload['materials'][number]
type WorkshopCommentLoadResult = Awaited<ReturnType<typeof getIdeaComments>>
type WorkshopComment = Exclude<WorkshopCommentLoadResult, { error: string }>['data'][number]

const IDEA_STATUS_LABELS: Record<string, string> = {
  uj: 'Új kezdeményezés',
  aktiv: 'Közös munka alatt',
  megvalositva: 'Megvalósult',
  tovabbgondolas: 'Továbbgondolásra vár',
}

function isWorkshopPayload(result: WorkshopLoadResult): result is WorkshopPayload {
  return !('error' in result)
}

function isCommentPayload(
  result: WorkshopCommentLoadResult,
): result is Exclude<WorkshopCommentLoadResult, { error: string }> {
  return !('error' in result)
}

function formatShortDate(value: string) {
  if (!value) return 'Friss bejegyzés'
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function getIdeaCategoryNames(idea: WorkshopIdea) {
  return idea.mm_otlet_kategoriak
    .map((item) => item.mm_kategoriak?.nev)
    .filter((name): name is string => Boolean(name))
}

function getMaterialCategoryNames(material: WorkshopMaterial) {
  return material.mm_segedanyag_kategoriak
    .map((item) => item.mm_kategoriak?.nev)
    .filter((name): name is string => Boolean(name))
}

export function MissionWorkshopV2() {
  const [payload, setPayload] = useState<WorkshopPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'discover' | 'materials' | 'ideas' | 'rewards'>(
    'discover',
  )
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [composerOpen, setComposerOpen] = useState<'material' | 'idea' | null>(null)
  const [selectedComposerCategories, setSelectedComposerCategories] = useState<number[]>([])
  const [selectedIdea, setSelectedIdea] = useState<WorkshopIdea | null>(null)
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false)
  const [comments, setComments] = useState<WorkshopComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [materialForm, setMaterialForm] = useState({ cim: '', leiras: '', forrasUrl: '' })
  const [ideaForm, setIdeaForm] = useState({
    cim: '',
    leiras: '',
    celcsoport: 'Gyülekezeti közösség',
    becsultIdo: '2-3 hét',
  })
  const [isPending, startTransition] = useTransition()

  const loadExperience = useCallback(async () => {
    setLoading(true)
    const result = await loadWorkshopExperience()

    if (!isWorkshopPayload(result)) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    setPayload(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadExperience()
  }, [loadExperience])

  const filteredMaterials = useMemo(() => {
    if (!payload) return []

    return payload.materials.filter((material) => {
      const matchesCategory =
        selectedCategoryId === null ||
        material.mm_segedanyag_kategoriak.some((item) => item.kategoria_id === selectedCategoryId)
      const searchable =
        `${material.cim} ${material.leiras || ''} ${getMaterialCategoryNames(material).join(' ')}`.toLowerCase()
      const matchesSearch = !search.trim() || searchable.includes(search.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [payload, search, selectedCategoryId])

  const filteredIdeas = useMemo(() => {
    if (!payload) return []

    return payload.ideas.filter((idea) => {
      const matchesCategory =
        selectedCategoryId === null ||
        idea.mm_otlet_kategoriak.some((item) => item.kategoria_id === selectedCategoryId)
      const searchable =
        `${idea.cim} ${idea.leiras} ${idea.celcsoport || ''} ${getIdeaCategoryNames(idea).join(' ')}`.toLowerCase()
      const matchesSearch = !search.trim() || searchable.includes(search.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [payload, search, selectedCategoryId])

  const missionProgress = useMemo(() => {
    if (!payload) return null
    return getMissionProgress(payload.myStats.osszpontszam || 0)
  }, [payload])

  async function openIdeaForum(idea: WorkshopIdea) {
    setSelectedIdea(idea)
    setIdeaDialogOpen(true)
    setCommentsLoading(true)

    const result = await getIdeaComments(idea.id)
    if (isCommentPayload(result)) {
      setComments(result.data)
    } else {
      toast.error(result.error)
      setComments([])
    }

    setCommentsLoading(false)
  }

  function resetComposerState() {
    setSelectedComposerCategories([])
    setMaterialForm({ cim: '', leiras: '', forrasUrl: '' })
    setIdeaForm({
      cim: '',
      leiras: '',
      celcsoport: 'Gyülekezeti közösség',
      becsultIdo: '2-3 hét',
    })
  }

  function toggleComposerCategory(categoryId: number) {
    setSelectedComposerCategories((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    )
  }

  function handleMaterialSubmit() {
    startTransition(async () => {
      const result = await shareMissionMaterial({
        cim: materialForm.cim,
        leiras: materialForm.leiras,
        forrasUrl: materialForm.forrasUrl,
        kategoriaIds: selectedComposerCategories,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('A segédanyag bekerült a közös műhelybe.')
      setComposerOpen(null)
      resetComposerState()
      await loadExperience()
    })
  }

  function handleIdeaSubmit() {
    startTransition(async () => {
      const result = await submitMissionIdea({
        cim: ideaForm.cim,
        leiras: ideaForm.leiras,
        kategoriaIds: selectedComposerCategories,
        celcsoport: ideaForm.celcsoport,
        becsultIdo: ideaForm.becsultIdo,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Az ötlet bekerült a közös ötletfórumba.')
      setComposerOpen(null)
      resetComposerState()
      await loadExperience()
    })
  }

  function handleSupport(ideaId: string) {
    startTransition(async () => {
      const result = await supportIdea(ideaId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Az ötlet támogatása rögzítve lett.')
      await loadExperience()
    })
  }

  function handleJoin(ideaId: string) {
    startTransition(async () => {
      const result = await toggleIdeaJoin(ideaId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success(result.joined ? 'Csatlakoztál a közös munkához.' : 'Kiléptél a közös munkából.')
      await loadExperience()
      if (selectedIdea?.id === ideaId) {
        const refreshed = await loadWorkshopExperience()
        if (isWorkshopPayload(refreshed)) {
          setSelectedIdea(refreshed.ideas.find((idea) => idea.id === ideaId) || null)
        }
      }
    })
  }

  function handleCommentSubmit() {
    if (!selectedIdea) return

    startTransition(async () => {
      const result = await saveIdeaComment(selectedIdea.id, newComment)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('A hozzászólás megérkezett a fórumba.')
      setNewComment('')
      await openIdeaForum(selectedIdea)
      await loadExperience()
    })
  }

  function handleDeleteMaterial(materialId: string) {
    startTransition(async () => {
      const result = await deleteMaterial(materialId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('A segédanyag archiválva lett.')
      await loadExperience()
    })
  }

  if (loading || !payload || !missionProgress) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_22px_50px_-28px_rgba(13,148,136,0.8)]">
            <Sparkles className="size-8 animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">A Missziós Műhely készül</p>
            <p className="mt-1 text-sm text-slate-500">
              Összerendezzük az ötleteket, segédanyagokat és a közös fórumot.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={composerOpen !== null} onOpenChange={(open) => !open && setComposerOpen(null)}>
        <DialogContent className="max-w-3xl rounded-[2rem] border-white/80 bg-white/96 p-0">
          <div className="p-6 sm:p-7">
            <DialogTitle className="text-2xl text-slate-800">
              {composerOpen === 'material' ? 'Új segédanyag megosztása' : 'Új fórumtéma vagy ötlet indítása'}
            </DialogTitle>
            <p className="mt-2 text-sm text-slate-500">
              {composerOpen === 'material'
                ? 'Adj tovább valami azonnal használhatót: egy vázlatot, liturgiai kapaszkodót, munkalapot vagy hasznos linket.'
                : 'Írj le egy szolgálati kérdést vagy kezdeményezést, amit jó lenne a közösséggel együtt továbbgondolni.'}
            </p>

            <div className="mt-5 grid gap-4">
              <Input
                value={composerOpen === 'material' ? materialForm.cim : ideaForm.cim}
                onChange={(event) =>
                  composerOpen === 'material'
                    ? setMaterialForm((current) => ({ ...current, cim: event.target.value }))
                    : setIdeaForm((current) => ({ ...current, cim: event.target.value }))
                }
                placeholder="Cím"
              />

              <textarea
                value={composerOpen === 'material' ? materialForm.leiras : ideaForm.leiras}
                onChange={(event) =>
                  composerOpen === 'material'
                    ? setMaterialForm((current) => ({ ...current, leiras: event.target.value }))
                    : setIdeaForm((current) => ({ ...current, leiras: event.target.value }))
                }
                placeholder="Leírás"
                className="min-h-36 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
              />

              {composerOpen === 'material' ? (
                <Input
                  value={materialForm.forrasUrl}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, forrasUrl: event.target.value }))
                  }
                  placeholder="Forrás URL (opcionális)"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    value={ideaForm.celcsoport}
                    onChange={(event) =>
                      setIdeaForm((current) => ({ ...current, celcsoport: event.target.value }))
                    }
                    placeholder="Célcsoport"
                  />
                  <Input
                    value={ideaForm.becsultIdo}
                    onChange={(event) =>
                      setIdeaForm((current) => ({ ...current, becsultIdo: event.target.value }))
                    }
                    placeholder="Becsült idő"
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Kapcsolódó témák</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {payload.categories.map((category) => {
                    const active = selectedComposerCategories.includes(category.id)
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleComposerCategory(category.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={active ? { backgroundColor: category.szin } : undefined}
                      >
                        {category.nev}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" className="rounded-full" onClick={() => setComposerOpen(null)}>
                Mégse
              </Button>
              <Button
                className="rounded-full bg-teal-600 hover:bg-teal-700"
                onClick={composerOpen === 'material' ? handleMaterialSubmit : handleIdeaSubmit}
                disabled={isPending}
              >
                <Plus className="mr-2 size-4" />
                {composerOpen === 'material' ? 'Megosztás' : 'Fórumtémává alakítás'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ideaDialogOpen} onOpenChange={setIdeaDialogOpen}>
        <DialogContent className="max-w-4xl rounded-[2rem] border-white/80 bg-white/97 p-0">
          {selectedIdea && (
            <div className="p-6 sm:p-7">
              <DialogTitle className="text-2xl text-slate-800">{selectedIdea.cim}</DialogTitle>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="border-0 bg-teal-100 text-teal-700">
                  {IDEA_STATUS_LABELS[selectedIdea.statusz || 'uj'] || 'Közös gondolkodás'}
                </Badge>
                <Badge className="border-0 bg-amber-100 text-amber-700">
                  {selectedIdea.celcsoport || 'Gyülekezeti közösség'}
                </Badge>
                <Badge className="border-0 bg-slate-100 text-slate-600">
                  {selectedIdea.becsult_ido || 'Rugalmas időkeret'}
                </Badge>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">{selectedIdea.leiras}</p>

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
                <div className="space-y-4">
                  <StatPanel label="Támogatás" value={selectedIdea.tamogatasok_szama || 0} />
                  <StatPanel label="Csatlakozó" value={selectedIdea.csatlakozok_szama || 0} />
                  <StatPanel label="Hozzászólás" value={selectedIdea.hozzaszolasok_szama || comments.length} />

                  <div className="rounded-[1.6rem] border border-white/70 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-5 text-white">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/65">Ötletgazda</p>
                    <p className="mt-2 text-xl font-semibold">{selectedIdea.otletgazda_nev || 'Közösségi bejegyzés'}</p>
                    <p className="mt-1 text-sm text-white/72">
                      {selectedIdea.otletgazda_gyulekezet || 'Missziós közösségi tér'}
                    </p>
                    <p className="mt-4 text-xs text-white/60">{formatShortDate(selectedIdea.created_at)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="rounded-full bg-teal-600 hover:bg-teal-700"
                      onClick={() => handleSupport(selectedIdea.id)}
                      disabled={selectedIdea.mySupport || isPending}
                    >
                      <HeartHandshake className="mr-2 size-4" />
                      {selectedIdea.mySupport ? 'Már támogatod' : 'Támogatom'}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => handleJoin(selectedIdea.id)}
                      disabled={isPending}
                    >
                      <Users className="mr-2 size-4" />
                      {selectedIdea.myJoin ? 'Kilépés a közös munkából' : 'Csatlakozom'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.6rem] border border-slate-100 bg-white/90 p-5">
                    <p className="text-sm font-semibold text-slate-800">Fórum és kérdések</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Itt lehet megbeszélni a szolgálati kérdéseket, pontosítani a részleteket és egymást segíteni.
                    </p>

                    <div className="mt-4 space-y-3">
                      {commentsLoading ? (
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                          Fórum betöltése...
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                          Még nincs hozzászólás. Kezdd el te a beszélgetést.
                        </div>
                      ) : (
                        comments.map((comment) => (
                          <div key={comment.id} className="rounded-[1.2rem] border border-slate-100 bg-slate-50/80 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800">
                                {comment.user_nev || 'Ismeretlen lelkipásztor'}
                              </p>
                              <span className="text-xs text-slate-400">{comment.user_gyulekezet || 'Közösségi tér'}</span>
                              <span className="text-xs text-slate-400">{formatShortDate(comment.created_at)}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{comment.szoveg}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      <textarea
                        value={newComment}
                        onChange={(event) => setNewComment(event.target.value)}
                        placeholder="Írj bátorító kérdést, tapasztalatot vagy gyakorlati javaslatot..."
                        className="min-h-28 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
                      />
                      <div className="flex justify-end">
                        <Button
                          className="rounded-full bg-teal-600 hover:bg-teal-700"
                          onClick={handleCommentSubmit}
                          disabled={isPending || !newComment.trim()}
                        >
                          <MessageCircleHeart className="mr-2 size-4" />
                          Hozzászólás küldése
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function HeroMetric({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <div className="rounded-[1.8rem] border border-white/15 bg-white/12 p-4 backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/66">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-white/76">{text}</p>
    </div>
  )
}

function MaterialCard({
  material,
  canDelete,
  onDelete,
}: {
  material: WorkshopMaterial
  canDelete: boolean
  onDelete: () => void
}) {
  return (
    <Card className="border-0 shadow-none">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{formatShortDate(material.created_at)}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-800">{material.cim}</h3>
          </div>
          {canDelete && (
            <Button variant="ghost" size="sm" className="rounded-full text-red-500 hover:text-red-600" onClick={onDelete}>
              Archiválás
            </Button>
          )}
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-500">{material.leiras || 'Rövid szolgálati segédanyag a közösség számára.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {getMaterialCategoryNames(material).map((name) => (
            <Badge key={name} className="border-0 bg-slate-100 text-slate-600">
              {name}
            </Badge>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {material.feltolto_nev || 'Ismeretlen feltöltő'} · {material.feltolto_gyulekezet || 'Közösségi műhely'}
          </div>
          <Button asChild className="rounded-full bg-teal-600 hover:bg-teal-700">
            <a href={material.forras_url || '#'} target="_blank" rel="noreferrer">
              Megnyitás
              <ArrowRight className="ml-2 size-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IdeaCard({
  idea,
  onOpen,
  onSupport,
  onJoin,
  busy,
}: {
  idea: WorkshopIdea
  onOpen: () => void
  onSupport: () => void
  onJoin: () => void
  busy: boolean
}) {
  return (
    <Card className="border-0 shadow-none">
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-teal-100 text-teal-700">
            {IDEA_STATUS_LABELS[idea.statusz || 'uj'] || 'Közösségi ötlet'}
          </Badge>
          <Badge className="border-0 bg-amber-100 text-amber-700">{idea.celcsoport || 'Közösségi tér'}</Badge>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-800">{idea.cim}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{idea.leiras}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {getIdeaCategoryNames(idea).map((name) => (
            <Badge key={name} className="border-0 bg-slate-100 text-slate-600">
              {name}
            </Badge>
          ))}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <StatPanel label="Támogatás" value={idea.tamogatasok_szama || 0} />
          <StatPanel label="Csatlakozó" value={idea.csatlakozok_szama || 0} />
          <StatPanel label="Fórum" value={idea.hozzaszolasok_szama || 0} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={onOpen}>
            Fórum megnyitása
          </Button>
          <Button variant="outline" className="rounded-full" onClick={onSupport} disabled={idea.mySupport || busy}>
            {idea.mySupport ? 'Már támogatod' : 'Támogatom'}
          </Button>
          <Button variant="outline" className="rounded-full" onClick={onJoin} disabled={busy}>
            {idea.myJoin ? 'Kilépek' : 'Csatlakozom'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ServiceMoment({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/70 bg-white/85 px-4 py-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}

function RewardMiniCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.3rem] bg-slate-50/90 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function StatPanel({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.1rem] bg-slate-50/90 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
*/

export { MissionWorkshopV3 as MissionWorkshopV2 } from './mission-workshop-v3'
