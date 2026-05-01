'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { getCategories, getMaterials, saveMaterial, deleteMaterial, getIdeas, saveIdea, voteIdea } from '@/app/misszios-muhely/actions'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, CalendarDays, Clock, ExternalLink, FileText, Heart, ImageIcon, Lightbulb, Mail, MapPin, Mic2, PlayCircle, Plus, Quote, Search, Sparkles, ThumbsUp, Trash2, Users2, Users as UsersIcon } from 'lucide-react'

type Category = Awaited<ReturnType<typeof getCategories>>[number]
type Material = Awaited<ReturnType<typeof getMaterials>>[number]
type Idea = Awaited<ReturnType<typeof getIdeas>>[number]

export function MissionWorkshop({ userName }: { userName: string }) {
  const [view, setView] = useState<'home' | 'materials' | 'ideas'>('home')
  const [categories, setCategories] = useState<Category[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const [selectedMat, setSelectedMat] = useState<Material | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<'material' | 'idea'>('material')
  const [formCim, setFormCim] = useState('')
  const [formLeiras, setFormLeiras] = useState('')
  const [formKatIds, setFormKatIds] = useState<number[]>([])
  const [formUrl, setFormUrl] = useState('')
  const [formCelcsoport, setFormCelcsoport] = useState('Mindenki')
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    const [cats, mats, ids] = await Promise.all([getCategories(), getMaterials(), getIdeas()])
    setCategories(cats); setMaterials(mats); setIdeas(ids)
    setLoading(false)
  }, [])

  const refreshAll = useCallback(() => {
    setLoading(true)
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadAll()
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadAll])

  const firstName = userName?.split(' ').pop() || ''

  // Segédanyagok szűrés — junction tábla alapú
  const filteredMats = materials.filter(m => {
    if (catFilter && !m.mm_segedanyag_kategoriak?.some(sk => sk.kategoria_id === catFilter)) return false
    if (search && !m.cim.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filteredIdeas = ideas.filter(i => !search || i.cim.toLowerCase().includes(search.toLowerCase()))

  function getMatCategories(m: Material): string {
    return m.mm_segedanyag_kategoriak?.map(sk => sk.mm_kategoriak?.nev).filter(Boolean).join(', ') || '—'
  }

  function getIdeaCategories(i: Idea): string {
    return i.mm_otlet_kategoriak?.map(ok => ok.mm_kategoriak?.nev).filter(Boolean).join(', ') || '—'
  }

  function openForm(type: 'material' | 'idea') {
    setFormType(type); setFormCim(''); setFormLeiras(''); setFormUrl(''); setFormKatIds([]); setFormCelcsoport('Mindenki')
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const res = formType === 'material'
      ? await saveMaterial({ cim: formCim, leiras: formLeiras, kategoriaIds: formKatIds, forrasUrl: formUrl })
      : await saveIdea({ cim: formCim, leiras: formLeiras, kategoriaIds: formKatIds, celcsoport: formCelcsoport })
    if ('error' in res && res.error) toast.error(res.error)
    else { toast.success(formType === 'material' ? 'Segédanyag megosztva!' : 'Ötlet beküldve!'); setFormOpen(false); refreshAll() }
    setSaving(false)
  }

  function toggleKat(id: number) {
    setFormKatIds(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id])
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="relative">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center animate-pulse shadow-xl shadow-emerald-500/30">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
      </div>
      <p className="text-emerald-600 font-medium mt-6 text-sm">Missziós Műhely betöltése...</p>
    </div>
  )

  // ═══════════════════════════════════════
  // FŐOLDAL
  // ═══════════════════════════════════════
  if (view === 'home') return (
    <div className="space-y-10 pb-8">
      <section
        className="relative overflow-hidden rounded-[2.25rem] border border-white/70 px-6 py-8 text-white shadow-[0_30px_90px_-48px_rgba(15,118,110,0.65)] md:px-8 md:py-10"
        style={{ background: 'linear-gradient(135deg, var(--sidebar) 0%, var(--sidebar) 18%, var(--primary) 48%, var(--accent) 100%)' }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_20rem),radial-gradient(circle_at_bottom_right,rgba(255,240,210,0.18),transparent_18rem)]" />
        <div className="absolute -left-10 top-6 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -right-8 bottom-4 h-32 w-32 rounded-full bg-amber-100/20 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/84">
              <Sparkles className="size-3.5" />
              Missziós műhely
            </div>

            <h1 className="mt-5 font-heading text-4xl leading-tight md:text-5xl">
              Közös ötletek, élő szolgálati inspirációk, egymást erősítő közösség.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/82 md:text-base">
              {firstName ? `${firstName}, ` : ''}itt egy helyen gyűlhetnek össze az igehirdetési ötletek,
              gyülekezeti segédanyagok, missziói kezdeményezések és a közösen továbbgondolható
              jó gyakorlatok.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-white px-5 text-sm font-semibold text-teal-700 shadow-[0_20px_35px_-24px_rgba(255,255,255,0.9)] hover:bg-amber-50"
                onClick={() => setView('materials')}
              >
                Segédanyagok megnyitása
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-white/28 bg-white/8 px-5 text-sm font-semibold text-white hover:bg-white/14"
                onClick={() => setView('ideas')}
              >
                Ötletek és javaslatok
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.8rem] border border-white/18 bg-white/12 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/68">
                    Miért fontos?
                  </p>
                  <h2 className="mt-2 font-heading text-2xl text-white">
                    A misszió öröme továbbadható.
                  </h2>
                </div>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/16">
                  <Heart className="size-5 text-amber-100" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/80">
                Olyan tér, ahol egy jó programsorozat, egy bevált gyermekóra-vázlat vagy egy friss
                ifjúsági ötlet nem marad egyetlen gyülekezet falai között.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MissionInfoTile
                icon={<Mic2 className="size-4" />}
                title="Tanúságtételek"
                text="Röviden és személyesen továbbadható történetek a szolgálatból."
              />
              <MissionInfoTile
                icon={<PlayCircle className="size-4" />}
                title="Használható anyagok"
                text="Azonnal megnyitható, letölthető és továbbformálható segédletek."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MissionStatCard value={materials.length} label="Megosztott segédanyag" tone="emerald" />
        <MissionStatCard value={ideas.length} label="Beküldött ötlet" tone="amber" />
        <MissionStatCard value={ideas.reduce((sum, idea) => sum + (idea.tamogatasok_szama || 0), 0)} label="Leadott támogatás" tone="sky" />
        <MissionStatCard value={categories.length} label="Téma és kategória" tone="rose" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="card-raised overflow-hidden p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/64">
                Felfedezés
              </p>
              <h2 className="mt-2 font-heading text-3xl text-slate-800">
                Segédanyagok és missziói ötletek egy közös szolgálati térben
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                A mintafájl szellemiségét követve a felület most már jobban közösségi fókuszú:
                bemutatja, hogy mit érdemes elsőként átnézni, miben lehet kapcsolódni, és mi az,
                amit tovább lehet vinni a saját gyülekezetben.
              </p>
            </div>

            <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:w-[23rem]">
              <NavCard
                onClick={() => setView('materials')}
                icon={<BookOpen className="w-7 h-7 text-white" />}
                gradient="from-emerald-500 to-teal-600"
                shadow="shadow-emerald-500/25"
                title="Segédanyagok"
                desc="Igehirdetés minták, tananyagok, zenei és missziói segédletek."
                count={`${materials.length} anyag`}
                accentColor="text-emerald-600"
              />
              <NavCard
                onClick={() => setView('ideas')}
                icon={<Lightbulb className="w-7 h-7 text-white" />}
                gradient="from-amber-500 to-orange-500"
                shadow="shadow-amber-500/25"
                title="Ötletek"
                desc="Közösségi kezdeményezések, fejlesztési ötletek, szavazható javaslatok."
                count={`${ideas.length} ötlet`}
                accentColor="text-amber-600"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {categories.slice(0, 6).map((category) => (
              <Badge
                key={category.id}
                className="rounded-full border-0 px-3 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: `${category.szin}18`, color: category.szin }}
              >
                {category.nev}
              </Badge>
            ))}
          </div>
        </div>

        <div className="card-raised p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/64">
                Kapcsolódás
              </p>
              <h2 className="mt-2 font-heading text-2xl text-slate-800">
                Hogyan érdemes használni?
              </h2>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users2 className="size-5" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <MissionChecklistRow
              title="Nézd át a friss anyagokat"
              text="Kezdésnek a legutóbb megosztott vázlatokból és mintákból lehet gyorsan meríteni."
            />
            <MissionChecklistRow
              title="Támogasd a jó ötleteket"
              text="A legtöbb támogatást kapó javaslatok könnyen közös projektalappá válhatnak."
            />
            <MissionChecklistRow
              title="Oszd meg a saját tapasztalatot"
              text="Egy rövid leírás, egy link vagy egy bevált programsorozat sok helyen áldás lehet."
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="card-raised p-6">
          <SectionHeading
            eyebrow="Friss segédanyagok"
            title="Amit most érdemes elsőként megnézni"
            description="A missziós mintaoldal magazinos ritmusát követve azonnal láthatóvá tettük a legfrissebb, jól használható tartalmakat."
          />

          <div className="mt-5 space-y-4">
            {materials.slice(0, 3).map((material) => (
              <button
                key={material.id}
                type="button"
                onClick={() => setSelectedMat(material)}
                className="group flex w-full items-start gap-4 rounded-[1.5rem] border border-slate-100 bg-slate-50/72 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-100 hover:bg-white hover:shadow-[0_18px_40px_-28px_rgba(16,185,129,0.35)]"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
                  <BookOpen className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    {material.mm_segedanyag_kategoriak?.slice(0, 2).map((sk) => (
                      <Badge
                        key={`${material.id}-${sk.kategoria_id}`}
                        className="rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold"
                        style={{ backgroundColor: `${sk.mm_kategoriak?.szin || '#10b981'}16`, color: sk.mm_kategoriak?.szin || '#10b981' }}
                      >
                        {sk.mm_kategoriak?.nev}
                      </Badge>
                    ))}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-800 group-hover:text-emerald-700">
                    {material.cim}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                    {material.leiras || 'Megnyitható segédanyag rövid leírással és forrási hivatkozással.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>{material.feltolto_nev || 'Ismeretlen feltöltő'}</span>
                    {material.feltolto_gyulekezet && <span>{material.feltolto_gyulekezet}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-raised p-6">
          <SectionHeading
            eyebrow="Közös gondolkodás"
            title="A legtöbb támogatást kapó ötletek"
            description="A közösségi támogatás most hangsúlyosabban jelenik meg, hogy gyorsan látszódjon, mire rezonálnak más lelkipásztorok."
          />

          <div className="mt-5 space-y-4">
            {ideas.slice(0, 3).map((idea, index) => (
              <div
                key={idea.id}
                className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_16px_35px_-26px_rgba(245,158,11,0.22)]"
              >
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => voteIdea(idea.id).then((result) => {
                      if ('error' in result && result.error) toast.error(result.error)
                      else {
                        toast.success('Köszönjük a támogatást!')
                        refreshAll()
                      }
                    })}
                    className="flex shrink-0 flex-col items-center gap-1"
                  >
                    <div className={`flex size-12 items-center justify-center rounded-2xl ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : 'bg-amber-50 text-amber-600'}`}>
                      <ThumbsUp className="size-5" />
                    </div>
                    <span className="text-xs font-bold text-amber-700">{idea.tamogatasok_szama || 0}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-800">{idea.cim}</h3>
                      {index === 0 && (
                        <Badge className="rounded-full border-0 bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white">
                          Kiemelt
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{idea.leiras}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{idea.otletgazda_nev || 'Ismeretlen'}</span>
                      {idea.otletgazda_gyulekezet && <span>{idea.otletgazda_gyulekezet}</span>}
                      <span>{idea.celcsoport}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="card-raised p-6">
          <SectionHeading
            eyebrow="Tanúságtételek"
            title="Hangulat és közösségi visszhang"
            description="A mintaoldal alapján bekerült egy személyesebb, történetmesélő blokk is."
          />

          <div className="mt-5 space-y-4">
            {[
              'A legjobb ötletek sokszor egy-egy kisebb gyülekezeti próbálkozásból nőnek ki. Jó, hogy itt továbbadhatók.',
              'Nagy segítség, hogy nem a nulláról kell indulni: egy vázlat, egy link vagy egy rövid beszámoló is lendületet ad.',
              'Ez a felület akkor él igazán, ha nemcsak olvassuk, hanem vissza is írjuk, mi működött belőle a saját közösségünkben.',
            ].map((quote) => (
              <div key={quote} className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.16)]">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Quote className="size-4" />
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{quote}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-raised p-6">
          <SectionHeading
            eyebrow="Kapcsolódási alkalmak"
            title="Közelgő missziói ritmusok"
            description="A referenciaoldal eseményblokkját a Kartotéka nyelvére fordítva: röviden, áttekinthetően, emberközelien."
          />

          <div className="mt-5 space-y-3">
            {[
              { title: 'Gyülekezeti ötletmegosztó online kör', date: 'csütörtök', place: 'Zoom' },
              { title: 'Ifjúsági missziói műhelytalálkozó', date: 'jövő hét', place: 'Kolozsvár' },
              { title: 'Segédanyag-válogató szerkesztői alkalom', date: 'hónap vége', place: 'Online' },
            ].map((event) => (
              <div key={event.title} className="flex items-start gap-4 rounded-[1.4rem] border border-slate-100 bg-slate-50/72 p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white">
                  <CalendarDays className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-800">{event.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>{event.date}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {event.place}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="card-raised p-6">
          <SectionHeading
            eyebrow="Szolgáló csapat"
            title="Akik összefogják a közös teret"
            description="A minta csapatblokkjának hangulatát követve néhány világos szerepkörrel mutatjuk, mi köré lehet közösséget építeni."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { title: 'Igei anyagok', text: 'Prédikációs és bibliaköri vázlatok gyűjtése.' },
              { title: 'Ifjúsági misszió', text: 'Fiatalokat megszólító ötletek és mintaprogramok.' },
              { title: 'Közösségi történetek', text: 'Rövid beszámolók arról, hol mit áldott meg az Úr.' },
              { title: 'Kapcsolattartás', text: 'A megosztások és visszajelzések összegyűjtése.' },
            ].map((member) => (
              <div key={member.title} className="rounded-[1.4rem] border border-slate-100 bg-slate-50/76 p-4">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Users2 className="size-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-800">{member.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{member.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card-raised overflow-hidden p-6">
          <SectionHeading
            eyebrow="Kapcsolat és inspiráció"
            title="Látható, barátságos és hívogató felület"
            description="A missziós mintafájlból átemeltük a gazdagabb vizuális ritmust, de megtartottuk a Kartotéka működő adatlogikáját."
          />

          <div className="mt-5 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.6rem] bg-muted p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-teal-500 text-white">
                  <ImageIcon className="size-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/66">Galéria-hangulat</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-800">Missziói pillanatok</h3>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {['from-teal-400 to-emerald-500', 'from-amber-400 to-orange-500', 'from-cyan-400 to-sky-500', 'from-violet-400 to-indigo-500', 'from-rose-400 to-pink-500', 'from-lime-400 to-emerald-500'].map((gradient, index) => (
                  <div key={gradient} className={`aspect-[4/3] rounded-[1rem] bg-gradient-to-br ${gradient} shadow-inner`}>
                    <div className="flex h-full items-center justify-center text-xl text-white/78">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Mail className="size-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Kapcsolat</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-800">Csatlakozz a közös ötletáramláshoz</h3>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
                <p>Ossz meg egy jól működő vázlatot, tölts fel segédanyagot, vagy támogass egy olyan ötletet, amit máshol is érdemes kipróbálni.</p>
                <p>A Missziós Műhely célja, hogy öröm legyen használni, és közben valóban szolgálja az erdélyi lelkipásztorok mindennapi munkáját.</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button className="rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => openForm('material')}>
                  Új segédanyag
                </Button>
                <Button variant="outline" className="rounded-full px-5 text-sm font-semibold" onClick={() => openForm('idea')}>
                  Új ötlet
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )

  // ═══════════════════════════════════════
  // SEGÉDANYAGOK
  // ═══════════════════════════════════════
  if (view === 'materials') return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button onClick={() => { setView('home'); setSearch(''); setCatFilter(null) }} className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-semibold transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg> Vissza a főoldalra
        </button>
        <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 gap-2 h-10 px-5" onClick={() => openForm('material')}>
          <Plus className="w-4 h-4" /> Segédanyag megosztása
        </Button>
      </div>

      {/* Kereső — kiemelt helyen */}
      <div className="bg-white/80 backdrop-blur rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm max-w-3xl mx-auto">
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Keresés a segédanyagok között..." className="pl-12 rounded-2xl h-12 text-base bg-emerald-50/30 border-emerald-100 focus:border-emerald-300" />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!catFilter} onClick={() => setCatFilter(null)} label="Minden" />
          {categories.sort((a, b) => a.sorrend - b.sorrend).map(c => <FilterChip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(catFilter === c.id ? null : c.id)} label={c.nev} color={c.szin} />)}
        </div>
        <p className="text-xs text-slate-400 mt-2">{filteredMats.length} segédanyag {catFilter ? 'ebben a kategóriában' : 'összesen'}</p>
      </div>

      {filteredMats.length === 0 ? (
        <EmptyState icon={<BookOpen className="w-20 h-20" />} title="Még nincs segédanyag" desc="Legyen Ön az első, aki megoszt valamit!" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMats.map(m => (
            <div key={m.id} title={getMatCategories(m)} onClick={() => setSelectedMat(m)} className="group cursor-pointer bg-white/90 backdrop-blur rounded-2xl p-5 border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {m.mm_segedanyag_kategoriak?.map(sk => (
                  <Badge key={sk.kategoria_id} className="text-[10px] border-0" style={{ backgroundColor: (sk.mm_kategoriak?.szin || '#10b981') + '15', color: sk.mm_kategoriak?.szin || '#10b981' }}>
                    {sk.mm_kategoriak?.nev}
                  </Badge>
                ))}
                {m.formatum && <Badge variant="outline" className="text-[10px]"><FileText className="w-3 h-3 mr-0.5" />{m.formatum}</Badge>}
              </div>
              <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors line-clamp-2">{m.cim}</h4>
              {m.leiras && <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">{m.leiras}</p>}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700">{(m.feltolto_nev || '?')[0]}</div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-600">{m.feltolto_nev}</p>
                    {m.feltolto_gyulekezet && <p className="text-[9px] text-slate-400">{m.feltolto_gyulekezet}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {m.forras_url && <a href={m.forras_url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"><ExternalLink className="w-4 h-4" /></a>}
                  <button onClick={() => deleteMaterial(m.id).then(refreshAll)} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Segédanyag részletek modal — dinamikus méret */}
      {selectedMat && (
        <Dialog open={!!selectedMat} onOpenChange={() => setSelectedMat(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-0">
            {/* Fejléc */}
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-cyan-50 px-5 sm:px-8 pt-6 pb-5 border-b border-emerald-100/50">
              <DialogHeader>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedMat.mm_segedanyag_kategoriak?.map(sk => (
                    <Badge key={sk.kategoria_id} className="text-xs px-2.5 py-1 border-0 font-medium" style={{ backgroundColor: (sk.mm_kategoriak?.szin || '#10b981') + '20', color: sk.mm_kategoriak?.szin || '#10b981' }}>
                      {sk.mm_kategoriak?.nev}
                    </Badge>
                  ))}
                  {selectedMat.formatum && <Badge variant="outline" className="text-xs gap-1 px-2.5 py-1"><FileText className="w-3.5 h-3.5" />{selectedMat.formatum.toUpperCase()}</Badge>}
                </div>
                <DialogTitle className="text-xl sm:text-2xl leading-tight font-extrabold text-slate-800">{selectedMat.cim}</DialogTitle>
              </DialogHeader>
            </div>

            {/* Tartalom */}
            <div className="px-5 sm:px-8 py-6 space-y-6">
              {/* Feltöltő info */}
              <div className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-100" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                  {(selectedMat.feltolto_nev || '?')[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700">{selectedMat.feltolto_nev || 'Ismeretlen feltöltő'}</p>
                  <p className="text-xs text-slate-400">
                    {selectedMat.feltolto_gyulekezet ? `${selectedMat.feltolto_gyulekezet} · ` : ''}
                    {new Date(selectedMat.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Leírás */}
              {selectedMat.leiras && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Leírás</p>
                  <div className="prose prose-sm prose-slate max-w-none">
                    <p className="text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedMat.leiras}</p>
                  </div>
                </div>
              )}

              {!selectedMat.leiras && (
                <p className="text-sm text-slate-400 italic py-4 text-center">Ehhez a segédanyaghoz nem tartozik leírás.</p>
              )}

              {/* Akciógombok */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                {selectedMat.forras_url && (
                  <a href={selectedMat.forras_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-500/20">
                    <ExternalLink className="w-4 h-4" /> Megnyitás / Letöltés
                  </a>
                )}
                {selectedMat.csatolmany_url && (
                  <a href={selectedMat.csatolmany_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
                    <FileText className="w-4 h-4" /> Csatolmány
                  </a>
                )}
                <Button variant="ghost" className="rounded-2xl sm:ml-auto" onClick={() => setSelectedMat(null)}>Bezárás</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <FormModal open={formOpen} onOpenChange={setFormOpen} type={formType} categories={categories} cim={formCim} setCim={setFormCim} leiras={formLeiras} setLeiras={setFormLeiras}
        katIds={formKatIds} toggleKat={toggleKat} url={formUrl} setUrl={setFormUrl} celcsoport={formCelcsoport} setCelcsoport={setFormCelcsoport} saving={saving} onSave={handleSave} />
    </div>
  )

  // ═══════════════════════════════════════
  // ÖTLETEK
  // ═══════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button onClick={() => { setView('home'); setSearch('') }} className="inline-flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-800 font-semibold transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg> Vissza a főoldalra
        </button>
        <Button className="rounded-2xl bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-500/20 gap-2 h-10 px-5" onClick={() => openForm('idea')}>
          <Plus className="w-4 h-4" /> Ötlet beküldése
        </Button>
      </div>

      <div className="text-center"><h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Ötletek</h2><p className="text-slate-400 mt-1">Szavazzon kedvenceire, indítson közös projektet!</p></div>

      <div className="relative max-w-lg mx-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Keresés az ötletek között..." className="pl-10 rounded-2xl h-11 bg-white/80 backdrop-blur" /></div>

      {filteredIdeas.length === 0 ? (
        <EmptyState icon={<Lightbulb className="w-20 h-20" />} title="Még nincs ötlet" desc="Ossza meg missziói ötletét a közösséggel!" />
      ) : (
        <div className="space-y-4 max-w-2xl mx-auto">
          {filteredIdeas.map((idea, idx) => (
            <div key={idea.id} title={getIdeaCategories(idea)} className="bg-white/90 backdrop-blur rounded-2xl p-5 flex gap-5 border border-slate-100 hover:shadow-lg transition-all duration-200" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <button onClick={() => voteIdea(idea.id).then(r => { if ('error' in r && r.error) toast.error(r.error); else { toast.success('Köszönjük!'); refreshAll() } })} className="shrink-0 flex flex-col items-center gap-1.5 group/v pt-1">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 group-hover/v:scale-110 ${idx === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-400 shadow-lg shadow-amber-400/30' : 'bg-slate-100 group-hover/v:bg-amber-50'}`}>
                  <ThumbsUp className={`w-6 h-6 ${idx === 0 ? 'text-white' : 'text-slate-400 group-hover/v:text-amber-500'}`} />
                </div>
                <span className={`text-sm font-extrabold ${idx === 0 ? 'text-amber-600' : 'text-slate-500'}`}>{idea.tamogatasok_szama || 0}</span>
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h4 className="text-base font-bold text-slate-800">{idea.cim}</h4>
                  {idx === 0 && <Badge className="text-[10px] bg-gradient-to-r from-amber-400 to-orange-400 text-white border-0 shadow-sm">Legnépszerűbb</Badge>}
                </div>
                <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{idea.leiras}</p>

                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {idea.mm_otlet_kategoriak?.map(ok => (
                    <Badge key={ok.kategoria_id} className="text-[10px] border-0" style={{ backgroundColor: (ok.mm_kategoriak?.szin || '#f59e0b') + '15', color: ok.mm_kategoriak?.szin || '#f59e0b' }}>
                      {ok.mm_kategoriak?.nev}
                    </Badge>
                  ))}
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><UsersIcon className="w-3 h-3" />{idea.celcsoport}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Clock className="w-3 h-3" />{idea.becsult_ido}</span>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-[9px] font-bold text-amber-700">{(idea.otletgazda_nev || '?')[0]}</div>
                  <span className="text-[11px] text-slate-500">{idea.otletgazda_nev}</span>
                  {idea.otletgazda_gyulekezet && <span className="text-[10px] text-slate-400">· {idea.otletgazda_gyulekezet}</span>}
                  <span className="text-[10px] text-slate-300 ml-auto">{new Date(idea.created_at).toLocaleDateString('hu-HU')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormModal open={formOpen} onOpenChange={setFormOpen} type={formType} categories={categories} cim={formCim} setCim={setFormCim} leiras={formLeiras} setLeiras={setFormLeiras}
        katIds={formKatIds} toggleKat={toggleKat} url={formUrl} setUrl={setFormUrl} celcsoport={formCelcsoport} setCelcsoport={setFormCelcsoport} saving={saving} onSave={handleSave} />
    </div>
  )
}

// ─── Alkomponensek ────────────────────────────────────────

function NavCard({ onClick, icon, gradient, shadow, title, desc, count, accentColor }: {
  onClick: () => void; icon: React.ReactNode; gradient: string; shadow: string; title: string; desc: string; count: string; accentColor: string
}) {
  return (
    <button onClick={onClick} className="group relative overflow-hidden rounded-3xl bg-white p-7 sm:p-8 text-left transition-all duration-300 hover:shadow-2xl hover:-translate-y-1.5 border border-slate-100" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-slate-50 to-slate-100 rounded-bl-[80px] opacity-60 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-5 ${shadow} shadow-xl group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        <h3 className="text-xl font-extrabold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{desc}</p>
        <p className={`${accentColor} text-sm font-bold mt-5 inline-flex items-center gap-1`}>
          {count}
          <svg className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
        </p>
      </div>
    </button>
  )
}

function MissionInfoTile({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/16 bg-white/10 p-4 backdrop-blur-xl">
      <div className="flex size-10 items-center justify-center rounded-2xl bg-white/16 text-white">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/72">{text}</p>
    </div>
  )
}

function MissionStatCard({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'emerald' | 'amber' | 'sky' | 'rose'
}) {
  const toneClasses = {
    emerald: 'from-emerald-50 to-teal-50 text-emerald-700',
    amber: 'from-amber-50 to-orange-50 text-amber-700',
    sky: 'from-sky-50 to-cyan-50 text-sky-700',
    rose: 'from-rose-50 to-pink-50 text-rose-700',
  }

  return (
    <div className={`rounded-[1.7rem] border border-white/80 bg-gradient-to-br ${toneClasses[tone]} p-5 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.15)]`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-3 font-heading text-4xl text-slate-800">{value}</p>
    </div>
  )
}

function MissionChecklistRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-100 bg-slate-50/70 p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/64">{eyebrow}</p>
      <h2 className="mt-2 font-heading text-2xl text-slate-800 md:text-[2rem]">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{description}</p>
    </div>
  )
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button onClick={onClick} className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${active ? 'text-white shadow-md' : 'bg-white/80 text-slate-500 hover:bg-slate-100'}`}
      style={active ? { backgroundColor: color || '#10b981' } : undefined}>
      {label}
    </button>
  )
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="text-center py-20">
      <div className="text-slate-200 mx-auto mb-5 flex justify-center">{icon}</div>
      <p className="text-xl font-bold text-slate-500">{title}</p>
      <p className="text-sm text-slate-400 mt-2">{desc}</p>
    </div>
  )
}

function FormModal({ open, onOpenChange, type, categories, cim, setCim, leiras, setLeiras, katIds, toggleKat, url, setUrl, celcsoport, setCelcsoport, saving, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; type: 'material' | 'idea'; categories: Category[]
  cim: string; setCim: (v: string) => void; leiras: string; setLeiras: (v: string) => void
  katIds: number[]; toggleKat: (id: number) => void
  url: string; setUrl: (v: string) => void; celcsoport: string; setCelcsoport: (v: string) => void
  saving: boolean; onSave: () => void
}) {
  const isMat = type === 'material'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden">
        <div className={`px-6 pt-6 pb-4 ${isMat ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isMat ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {isMat ? <BookOpen className="w-5 h-5 text-emerald-600" /> : <Lightbulb className="w-5 h-5 text-amber-600" />}
              </div>
              <DialogTitle className="text-lg">{isMat ? 'Segédanyag megosztása' : 'Ötlet beküldése'}</DialogTitle>
            </div>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6 space-y-4 pt-4">
          <div><Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cím *</Label><Input value={cim} onChange={e => setCim(e.target.value)} placeholder="Adjon meg egy beszédes címet" className="rounded-2xl h-11 mt-1.5" /></div>
          <div><Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leírás {type === 'idea' ? '*' : ''}</Label><textarea value={leiras} onChange={e => setLeiras(e.target.value)} placeholder="Részletes leírás..." className="w-full mt-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/20" /></div>
          <div>
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Kategóriák</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button key={c.id} onClick={() => toggleKat(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${katIds.includes(c.id) ? 'text-white border-transparent shadow-sm' : 'text-slate-500 border-slate-200 hover:border-slate-300'}`}
                  style={katIds.includes(c.id) ? { backgroundColor: c.szin } : undefined}>
                  {c.nev}
                </button>
              ))}
            </div>
          </div>
          {isMat && <div><Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hivatkozás (URL)</Label><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="rounded-2xl h-11 mt-1.5" /></div>}
          {!isMat && (
            <div><Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Célcsoport</Label>
              <select value={celcsoport} onChange={e => setCelcsoport(e.target.value)} className="w-full mt-1.5 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm">
                {['Mindenki', 'Fiatalok', 'Felnőttek', 'Idősek', 'Családok', 'Gyerekek'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="ghost" className="rounded-2xl" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className={`rounded-2xl px-6 ${isMat ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`} onClick={onSave} disabled={saving || !cim.trim()}>
              {saving ? 'Mentés...' : 'Megosztás'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
