'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { ArrowRight, BookOpen, Gift, HeartHandshake, Lightbulb, MessageCircleHeart, Plus, Search, Sparkles, Trophy, Users } from 'lucide-react'
import { toast } from 'sonner'

import { getIdeaComments, loadWorkshopExperience, saveIdeaComment, shareMissionMaterial, submitMissionIdea, supportIdea, toggleIdeaJoin } from '@/app/misszios-muhely/community-actions'
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
  uj: 'Új ötlet',
  aktiv: 'Közös munka alatt',
  megvalositva: 'Megvalósult',
  tovabbgondolas: 'Továbbgondolásra vár',
}

function isWorkshopPayload(result: WorkshopLoadResult): result is WorkshopPayload {
  return !('error' in result)
}

function isCommentPayload(result: WorkshopCommentLoadResult): result is Exclude<WorkshopCommentLoadResult, { error: string }> {
  return !('error' in result)
}

function formatShortDate(value: string) {
  if (!value) return 'Friss bejegyzés'
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function getIdeaCategoryNames(idea: WorkshopIdea) {
  return idea.mm_otlet_kategoriak.map((item) => item.mm_kategoriak?.nev).filter((name): name is string => Boolean(name))
}

function getMaterialCategoryNames(material: WorkshopMaterial) {
  return material.mm_segedanyag_kategoriak.map((item) => item.mm_kategoriak?.nev).filter((name): name is string => Boolean(name))
}

export function MissionWorkshopV3() {
  const [payload, setPayload] = useState<WorkshopPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'discover' | 'materials' | 'ideas' | 'rewards'>('discover')
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
  const [ideaForm, setIdeaForm] = useState({ cim: '', leiras: '', celcsoport: 'Gyülekezeti közösség', becsultIdo: '2-3 hét' })
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
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadExperience()
    })
    return () => { cancelled = true }
  }, [loadExperience])

  const filteredMaterials = useMemo(() => {
    if (!payload) return []
    return payload.materials.filter((material) => {
      const matchesCategory = selectedCategoryId === null || material.mm_segedanyag_kategoriak.some((item) => item.kategoria_id === selectedCategoryId)
      const searchable = `${material.cim} ${material.leiras || ''} ${getMaterialCategoryNames(material).join(' ')}`.toLowerCase()
      const matchesSearch = !search.trim() || searchable.includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [payload, search, selectedCategoryId])

  const filteredIdeas = useMemo(() => {
    if (!payload) return []
    return payload.ideas.filter((idea) => {
      const matchesCategory = selectedCategoryId === null || idea.mm_otlet_kategoriak.some((item) => item.kategoria_id === selectedCategoryId)
      const searchable = `${idea.cim} ${idea.leiras} ${idea.celcsoport || ''} ${getIdeaCategoryNames(idea).join(' ')}`.toLowerCase()
      const matchesSearch = !search.trim() || searchable.includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [payload, search, selectedCategoryId])

  const missionProgress = useMemo(() => payload ? getMissionProgress(payload.myStats.osszpontszam || 0) : null, [payload])

  async function openIdeaForum(idea: WorkshopIdea) {
    setSelectedIdea(idea)
    setIdeaDialogOpen(true)
    setCommentsLoading(true)
    const result = await getIdeaComments(idea.id)
    setComments(isCommentPayload(result) ? result.data : [])
    if (!isCommentPayload(result)) toast.error(result.error)
    setCommentsLoading(false)
  }

  function resetComposerState() {
    setSelectedComposerCategories([])
    setMaterialForm({ cim: '', leiras: '', forrasUrl: '' })
    setIdeaForm({ cim: '', leiras: '', celcsoport: 'Gyülekezeti közösség', becsultIdo: '2-3 hét' })
  }

  function closeComposer() {
    setComposerOpen(null)
    resetComposerState()
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
            <p className="mt-1 text-sm text-slate-500">Összerendezzük az ötleteket, segédanyagokat és a közös fórumot.</p>
          </div>
        </div>
      </div>
    )
  }

  const topIdeas = filteredIdeas.slice(0, 3)
  const topMaterials = filteredMaterials.slice(0, 3)

  function toggleComposerCategory(categoryId: number) {
    setSelectedComposerCategories((current) => current.includes(categoryId) ? current.filter((item) => item !== categoryId) : [...current, categoryId])
  }

  function handleMaterialSubmit() {
    startTransition(async () => {
      const result = await shareMissionMaterial({ cim: materialForm.cim, leiras: materialForm.leiras, forrasUrl: materialForm.forrasUrl, kategoriaIds: selectedComposerCategories })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('A segédanyag bekerült a közös műhelybe.')
      closeComposer()
      await loadExperience()
    })
  }

  function handleIdeaSubmit() {
    startTransition(async () => {
      const result = await submitMissionIdea({ cim: ideaForm.cim, leiras: ideaForm.leiras, kategoriaIds: selectedComposerCategories, celcsoport: ideaForm.celcsoport, becsultIdo: ideaForm.becsultIdo })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Az ötlet bekerült a közös ötletfórumba.')
      closeComposer()
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
    })
  }

  function handleCommentSubmit() {
    if (!selectedIdea || !newComment.trim()) return
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

  return (
    <>
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-[2.35rem] border border-white/70 bg-[linear-gradient(135deg,#0f766e_0%,#155e75_38%,#0f766e_62%,#f0b66d_100%)] px-6 py-7 text-white shadow-[0_36px_90px_-52px_rgba(15,118,110,0.72)] md:px-8 md:py-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_20rem),radial-gradient(circle_at_bottom_right,rgba(255,244,214,0.22),transparent_18rem)]" />
          <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/84">
                <Sparkles className="size-3.5" />
                Missziós Műhely
              </div>
              <h1 className="mt-4 font-heading text-4xl leading-tight md:text-5xl">Örömsziget a szolgálat sűrűjében.</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/82 md:text-base">Egy közös tér, ahol a lelkipásztorok ötletet cserélhetnek, segédanyagokat oszthatnak meg, szolgálati kérdéseket beszélhetnek át, és egymást bátoríthatják. A hasznos hozzájárulások pontokat, szinteket és jelvényeket hoznak.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button className="rounded-full bg-white text-teal-700 hover:bg-amber-50" onClick={() => setComposerOpen('material')}>
                  <BookOpen className="mr-2 size-4" />
                  Segédanyag megosztása
                </Button>
                <Button variant="outline" className="rounded-full border-white/24 bg-white/10 text-white hover:bg-white/15" onClick={() => setComposerOpen('idea')}>
                  <Lightbulb className="mr-2 size-4" />
                  Fórumtéma indítása
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <HeroMetric label="Jelenlegi szint" value={missionProgress.current.name} text={`${payload.myStats.osszpontszam || 0} pont · ${missionProgress.percent}% a következő szintig`} />
              <HeroMetric label="Következő cél" value={missionProgress.next?.name || 'Maximális szint'} text={missionProgress.next ? `${Math.max((missionProgress.next.minPoints || 0) - (payload.myStats.osszpontszam || 0), 0)} pont hiányzik` : 'Már elérted a legmagasabb szintet'} />
              <HeroMetric label="Közösségi hatás" value={`${payload.ideas.length + payload.materials.length}`} text="ötlet és segédanyag mozgatja most a műhelyt" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-0 shadow-none">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <ViewPill active={activeView === 'discover'} onClick={() => setActiveView('discover')} icon={<Sparkles className="size-4" />}>Felfedezés</ViewPill>
                  <ViewPill active={activeView === 'materials'} onClick={() => setActiveView('materials')} icon={<BookOpen className="size-4" />}>Segédanyagok</ViewPill>
                  <ViewPill active={activeView === 'ideas'} onClick={() => setActiveView('ideas')} icon={<MessageCircleHeart className="size-4" />}>Fórum és ötletek</ViewPill>
                  <ViewPill active={activeView === 'rewards'} onClick={() => setActiveView('rewards')} icon={<Gift className="size-4" />}>Jutalmazás</ViewPill>
                </div>
                <div className="relative w-full lg:w-[21rem]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés ötletre, témára, anyagra..." className="pl-9" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedCategoryId(null)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selectedCategoryId === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Minden téma</button>
                {payload.categories.map((category) => {
                  const active = selectedCategoryId === category.id
                  return (
                    <button key={category.id} type="button" onClick={() => setSelectedCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} style={active ? { backgroundColor: category.szin } : undefined}>
                      {category.nev}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <RewardMiniCard label="Ötletek" value={payload.myStats.otletek_szama || 0} />
            <RewardMiniCard label="Segédanyagok" value={payload.myStats.segedanyagok_feltoltve || 0} />
            <RewardMiniCard label="Jelvények" value={payload.myBadges.length} />
          </div>
        </div>

        {activeView === 'discover' ? (
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <Card className="border-0 shadow-none"><CardHeader><CardTitle className="text-slate-800">Mit érdemes most megnézni?</CardTitle></CardHeader><CardContent className="grid gap-3"><ServiceMoment title="Gyors ötletcsere" text="A fórumot úgy alakítottuk ki, hogy rögtön rá lehessen kapcsolódni egy kérdésre vagy szolgálati helyzetre." /><ServiceMoment title="Segédanyag-tár" text="Egy helyen gyűlnek a liturgiai ötletek, alkalmi vázlatok, ifjúsági kapaszkodók és hivatkozások." /><ServiceMoment title="Jutalmazó rendszer" text="Minden megosztás, hozzászólás és támogatás építi a személyes műhelyszintedet és új jelvényeket nyit meg." /></CardContent></Card>
              <Card className="border-0 shadow-none"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-slate-800">Friss segédanyagok</CardTitle><Button variant="ghost" className="rounded-full text-teal-700" onClick={() => setActiveView('materials')}>Mind megnyitása<ArrowRight className="ml-2 size-4" /></Button></CardHeader><CardContent className="grid gap-3">{topMaterials.length === 0 ? <EmptyState title="Még nincs találat" text="Indulhat az első közös megosztás: tölts fel egy bevált vázlatot vagy egy hasznos linket." /> : topMaterials.map((material) => <MaterialCard key={material.id} material={material} canDelete={payload.viewer.isAdmin || payload.viewer.id === material.feltolto_id} onDelete={() => handleDeleteMaterial(material.id)} />)}</CardContent></Card>
            </div>
            <div className="space-y-4">
              <Card className="border-0 shadow-none"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-slate-800">Futó beszélgetések</CardTitle><Button variant="ghost" className="rounded-full text-violet-700" onClick={() => setActiveView('ideas')}>Fórum megnyitása<ArrowRight className="ml-2 size-4" /></Button></CardHeader><CardContent className="grid gap-3">{topIdeas.length === 0 ? <EmptyState title="Még nincs fórumnyitó téma" text="Írd le bátran a szolgálati kérdésedet, és a műhely közössége tud rá kapcsolódni." /> : topIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} onOpen={() => openIdeaForum(idea)} onSupport={() => handleSupport(idea.id)} onJoin={() => handleJoin(idea.id)} busy={isPending} />)}</CardContent></Card>
              <Card className="border-0 shadow-none"><CardHeader><CardTitle className="text-slate-800">A hét műhelyhangulata</CardTitle></CardHeader><CardContent className="space-y-3">{payload.leaderboard.slice(0, 3).map((entry, index) => <div key={entry.userId} className="flex items-center justify-between rounded-[1.3rem] bg-slate-50/90 px-4 py-3"><div><p className="text-sm font-semibold text-slate-800">{entry.fullName}</p><p className="text-xs text-slate-500">{entry.congregationName}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-800">#{index + 1}</p><p className="text-xs text-slate-500">{entry.score} pont</p></div></div>)}</CardContent></Card>
            </div>
          </div>
        ) : null}

        {activeView === 'materials' ? <Card className="border-0 shadow-none"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-slate-800">Segédanyagok és szolgálati kapaszkodók</CardTitle><p className="mt-1 text-sm text-slate-500">Olyan anyagok gyűjteménye, amiket jó szívvel tovább lehet adni más lelkipásztoroknak is.</p></div><Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={() => setComposerOpen('material')}><Plus className="mr-2 size-4" />Új segédanyag</Button></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">{filteredMaterials.length === 0 ? <EmptyState title="Nincs a szűrésnek megfelelő segédanyag" text="Próbálj más keresést vagy témát, vagy te legyél az első, aki feltölt egy hasznos anyagot." /> : filteredMaterials.map((material) => <MaterialCard key={material.id} material={material} canDelete={payload.viewer.isAdmin || payload.viewer.id === material.feltolto_id} onDelete={() => handleDeleteMaterial(material.id)} />)}</CardContent></Card> : null}

        {activeView === 'ideas' ? <Card className="border-0 shadow-none"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-slate-800">Fórum, ötletek és közös tervek</CardTitle><p className="mt-1 text-sm text-slate-500">Kérdések, missziós ötletek, kipróbálható kezdeményezések és közös gondolkodás egy helyen.</p></div><Button className="rounded-full bg-violet-600 hover:bg-violet-700" onClick={() => setComposerOpen('idea')}><Plus className="mr-2 size-4" />Új fórumtéma</Button></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">{filteredIdeas.length === 0 ? <EmptyState title="Nincs a szűrésnek megfelelő ötlet" text="Nézd meg más témakörben, vagy indíts új beszélgetést a saját szolgálati kérdéseddel." /> : filteredIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} onOpen={() => openIdeaForum(idea)} onSupport={() => handleSupport(idea.id)} onJoin={() => handleJoin(idea.id)} busy={isPending} />)}</CardContent></Card> : null}

        {activeView === 'rewards' ? <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><Card className="border-0 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-slate-800"><Trophy className="size-4 text-amber-500" />Szintek és jelvények</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-[1.6rem] bg-gradient-to-r from-slate-900 to-teal-800 px-5 py-5 text-white"><p className="text-xs uppercase tracking-[0.24em] text-white/66">Jelenlegi szinted</p><p className="mt-2 text-3xl font-semibold">{missionProgress.current.name}</p><p className="mt-2 text-sm text-white/75">{missionProgress.current.description}</p></div><div className="grid gap-3 sm:grid-cols-2">{payload.myBadges.length === 0 ? <EmptyState title="Még nincs megszerzett jelvény" text="Az első megosztás, hozzászólás vagy támogatás után már indul a jelvénygyűjtés." /> : payload.myBadges.map((badge) => <RewardBadgeCard key={badge.id} title={badge.mm_jelveny_tipusok?.nev || 'Jelvény'} text={badge.mm_jelveny_tipusok?.leiras || 'Közösségi elismerés'} accent={badge.mm_jelveny_tipusok?.szin || '#0f766e'} />)}</div></CardContent></Card><Card className="border-0 shadow-none"><CardHeader><CardTitle className="text-slate-800">Közösségi ranglista</CardTitle></CardHeader><CardContent className="space-y-3">{payload.leaderboard.map((entry, index) => <div key={entry.userId} className="flex items-center justify-between rounded-[1.35rem] border border-white/70 bg-white/85 px-4 py-3"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{index + 1}</div><div><p className="font-semibold text-slate-800">{entry.fullName}</p><p className="text-xs text-slate-500">{entry.congregationName}</p></div></div><div className="text-right"><p className="text-sm font-semibold text-slate-800">{entry.score} pont</p><p className="text-xs text-slate-500">{entry.level}</p></div></div>)}</CardContent></Card></div> : null}
      </div>

      <Dialog open={composerOpen !== null} onOpenChange={(open) => !open && closeComposer()}>
        <DialogContent className="max-w-3xl rounded-[2rem] border-white/80 bg-white/96 p-0">
          <div className="p-6 sm:p-7">
            <DialogTitle className="text-2xl text-slate-800">{composerOpen === 'material' ? 'Új segédanyag megosztása' : 'Új fórumtéma vagy ötlet indítása'}</DialogTitle>
            <p className="mt-2 text-sm text-slate-500">{composerOpen === 'material' ? 'Adj tovább valami azonnal használhatót: egy vázlatot, liturgiai kapaszkodót, munkalapot vagy hasznos linket.' : 'Írj le egy szolgálati kérdést vagy kezdeményezést, amit jó lenne a közösséggel együtt továbbgondolni.'}</p>
            <div className="mt-5 grid gap-4">
              <Input value={composerOpen === 'material' ? materialForm.cim : ideaForm.cim} onChange={(event) => composerOpen === 'material' ? setMaterialForm((current) => ({ ...current, cim: event.target.value })) : setIdeaForm((current) => ({ ...current, cim: event.target.value }))} placeholder="Cím" />
              <textarea value={composerOpen === 'material' ? materialForm.leiras : ideaForm.leiras} onChange={(event) => composerOpen === 'material' ? setMaterialForm((current) => ({ ...current, leiras: event.target.value })) : setIdeaForm((current) => ({ ...current, leiras: event.target.value }))} placeholder="Leírás" className="min-h-36 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100" />
              {composerOpen === 'material' ? <Input value={materialForm.forrasUrl} onChange={(event) => setMaterialForm((current) => ({ ...current, forrasUrl: event.target.value }))} placeholder="Forrás URL (opcionális)" /> : <div className="grid gap-4 sm:grid-cols-2"><Input value={ideaForm.celcsoport} onChange={(event) => setIdeaForm((current) => ({ ...current, celcsoport: event.target.value }))} placeholder="Célcsoport" /><Input value={ideaForm.becsultIdo} onChange={(event) => setIdeaForm((current) => ({ ...current, becsultIdo: event.target.value }))} placeholder="Becsült idő" /></div>}
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Kapcsolódó témák</p><div className="mt-3 flex flex-wrap gap-2">{payload.categories.map((category) => { const active = selectedComposerCategories.includes(category.id); return <button key={category.id} type="button" onClick={() => toggleComposerCategory(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} style={active ? { backgroundColor: category.szin } : undefined}>{category.nev}</button> })}</div></div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3"><Button variant="outline" className="rounded-full" onClick={closeComposer}>Mégse</Button><Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={composerOpen === 'material' ? handleMaterialSubmit : handleIdeaSubmit} disabled={isPending}><Plus className="mr-2 size-4" />{composerOpen === 'material' ? 'Megosztás' : 'Fórumtémává alakítás'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ideaDialogOpen} onOpenChange={setIdeaDialogOpen}>
        <DialogContent className="max-w-5xl rounded-[2rem] border-white/80 bg-white/97 p-0">
          {selectedIdea ? <div className="p-6 sm:p-7"><DialogTitle className="text-2xl text-slate-800">{selectedIdea.cim}</DialogTitle><div className="mt-3 flex flex-wrap gap-2"><Badge className="border-0 bg-teal-100 text-teal-700">{IDEA_STATUS_LABELS[selectedIdea.statusz || 'uj'] || 'Közös gondolkodás'}</Badge><Badge className="border-0 bg-amber-100 text-amber-700">{selectedIdea.celcsoport || 'Gyülekezeti közösség'}</Badge><Badge className="border-0 bg-slate-100 text-slate-600">{selectedIdea.becsult_ido || 'Rugalmas időkeret'}</Badge></div><div className="mt-6 grid gap-5 xl:grid-cols-[0.78fr_1.22fr]"><div className="space-y-4"><Card className="border-0 shadow-none"><CardContent className="pt-6"><p className="text-sm leading-7 text-slate-600">{selectedIdea.leiras}</p><div className="mt-4 flex flex-wrap gap-2">{getIdeaCategoryNames(selectedIdea).map((category) => <Badge key={category} className="border-0 bg-violet-50 text-violet-700">{category}</Badge>)}</div></CardContent></Card><Card className="border-0 shadow-none"><CardContent className="grid gap-3 pt-6 sm:grid-cols-3"><StatPanel label="Támogatás" value={selectedIdea.tamogatasok_szama || 0} /><StatPanel label="Csatlakozó" value={selectedIdea.csatlakozok_szama || 0} /><StatPanel label="Fórum" value={selectedIdea.hozzaszolasok_szama || comments.length} /></CardContent></Card><Card className="border-0 shadow-none"><CardContent className="space-y-3 pt-6"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Ötletgazda</p><p className="text-lg font-semibold text-slate-800">{selectedIdea.otletgazda_nev || 'Közösségi bejegyzés'}</p><p className="text-sm text-slate-500">{selectedIdea.otletgazda_gyulekezet || 'Missziós közösségi tér'}</p><p className="text-xs text-slate-400">{formatShortDate(selectedIdea.created_at)}</p><div className="flex flex-wrap gap-2 pt-2"><Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={() => handleSupport(selectedIdea.id)} disabled={selectedIdea.mySupport || isPending}><HeartHandshake className="mr-2 size-4" />{selectedIdea.mySupport ? 'Már támogatod' : 'Támogatom'}</Button><Button variant="outline" className="rounded-full" onClick={() => handleJoin(selectedIdea.id)} disabled={isPending}><Users className="mr-2 size-4" />{selectedIdea.myJoin ? 'Kilépek' : 'Csatlakozom'}</Button></div></CardContent></Card></div><Card className="border-0 shadow-none"><CardHeader><CardTitle className="text-slate-800">Fórum és gyakorlati egyeztetés</CardTitle></CardHeader><CardContent className="space-y-4">{commentsLoading ? <div className="rounded-[1.25rem] bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Fórum betöltése...</div> : comments.length === 0 ? <EmptyState title="Még nincs hozzászólás" text="Kezdd el te a beszélgetést egy bátorító kérdéssel vagy rövid tapasztalattal." /> : comments.map((comment) => <CommentCard key={comment.id} comment={comment} />)}<div className="rounded-[1.35rem] border border-slate-100 bg-slate-50/80 p-4"><textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Írj bátorító kérdést, tapasztalatot vagy gyakorlati javaslatot..." className="min-h-28 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100" /><div className="mt-3 flex justify-end"><Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={handleCommentSubmit} disabled={isPending || !newComment.trim()}><MessageCircleHeart className="mr-2 size-4" />Hozzászólás küldése</Button></div></div></CardContent></Card></div></div> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ViewPill({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{icon}{children}</button>
}

function HeroMetric({ label, value, text }: { label: string; value: string; text: string }) {
  return <div className="rounded-[1.8rem] border border-white/15 bg-white/12 p-4 backdrop-blur-xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/66">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-3 text-sm leading-6 text-white/76">{text}</p></div>
}

function MaterialCard({ material, canDelete, onDelete }: { material: WorkshopMaterial; canDelete: boolean; onDelete: () => void }) {
  const categories = getMaterialCategoryNames(material)
  return <Card className="border-0 shadow-none"><CardContent className="pt-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.22em] text-slate-400">{formatShortDate(material.created_at)}</p><h3 className="mt-2 text-lg font-semibold text-slate-800">{material.cim}</h3></div>{canDelete ? <Button variant="ghost" size="sm" className="rounded-full text-red-500 hover:text-red-600" onClick={onDelete}>Archiválás</Button> : null}</div><p className="mt-3 text-sm leading-6 text-slate-500">{material.leiras || 'Rövid, azonnal kipróbálható szolgálati kapaszkodó.'}</p><div className="mt-4 flex flex-wrap gap-2">{categories.map((category) => <Badge key={category} className="border-0 bg-emerald-50 text-emerald-700">{category}</Badge>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-slate-400">{material.feltolto_nev || 'Közösségi anyag'} · {material.feltolto_gyulekezet || 'Megosztott tér'}</div>{material.forras_url ? <a href={material.forras_url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700">Megnyitás<ArrowRight className="ml-2 size-4" /></a> : null}</div></CardContent></Card>
}

function IdeaCard({ idea, onOpen, onSupport, onJoin, busy }: { idea: WorkshopIdea; onOpen: () => void; onSupport: () => void; onJoin: () => void; busy: boolean }) {
  const categories = getIdeaCategoryNames(idea)
  return <Card className="border-0 shadow-none"><CardContent className="pt-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.22em] text-slate-400">{formatShortDate(idea.created_at)}</p><h3 className="mt-2 text-lg font-semibold text-slate-800">{idea.cim}</h3></div><Badge className="border-0 bg-amber-100 text-amber-700">{IDEA_STATUS_LABELS[idea.statusz || 'uj'] || 'Közös gondolkodás'}</Badge></div><p className="mt-3 text-sm leading-6 text-slate-500">{idea.leiras}</p><div className="mt-4 flex flex-wrap gap-2">{categories.map((category) => <Badge key={category} className="border-0 bg-violet-50 text-violet-700">{category}</Badge>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><StatPanel label="Támogatás" value={idea.tamogatasok_szama || 0} /><StatPanel label="Csatlakozó" value={idea.csatlakozok_szama || 0} /><StatPanel label="Fórum" value={idea.hozzaszolasok_szama || 0} /></div><div className="mt-5 flex flex-wrap gap-2"><Button className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={onOpen}>Fórum megnyitása</Button><Button variant="outline" className="rounded-full" onClick={onSupport} disabled={idea.mySupport || busy}>{idea.mySupport ? 'Már támogatod' : 'Támogatom'}</Button><Button variant="outline" className="rounded-full" onClick={onJoin} disabled={busy}>{idea.myJoin ? 'Kilépek' : 'Csatlakozom'}</Button></div></CardContent></Card>
}

function ServiceMoment({ title, text }: { title: string; text: string }) {
  return <div className="rounded-[1.35rem] border border-white/70 bg-white/85 px-4 py-3"><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{text}</p></div>
}

function RewardMiniCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[1.3rem] bg-white/85 px-4 py-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.22)]"><p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p></div>
}

function RewardBadgeCard({ title, text, accent }: { title: string; text: string; accent: string }) {
  return <div className="rounded-[1.35rem] border border-white/70 bg-white/85 p-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.22)]"><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}><Gift className="size-5" /></div><div><p className="font-semibold text-slate-800">{title}</p><p className="text-xs text-slate-500">{text}</p></div></div></div>
}

function CommentCard({ comment }: { comment: WorkshopComment }) {
  return <div className="rounded-[1.2rem] border border-slate-100 bg-slate-50/80 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-800">{comment.user_nev || 'Ismeretlen lelkipásztor'}</p><span className="text-xs text-slate-400">{comment.user_gyulekezet || 'Közösségi tér'}</span><span className="text-xs text-slate-400">{formatShortDate(comment.created_at)}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{comment.szoveg}</p></div>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="rounded-[1.4rem] bg-slate-50/90 px-5 py-8 text-center"><p className="text-base font-semibold text-slate-700">{title}</p><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>
}

function StatPanel({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[1.1rem] bg-slate-50/90 px-3 py-2"><p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>
}
