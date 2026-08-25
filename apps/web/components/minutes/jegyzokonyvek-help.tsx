'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSignature,
  Gavel,
  Info,
  Stamp,
  Users,
} from 'lucide-react'

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgálnak a jegyzőkönyvek' },
  { id: 'types', label: 'Jegyzőkönyv típusok', Icon: ClipboardList, short: 'Presbiteri vs közgyűlés' },
  { id: 'participants', label: 'Részvevők és tisztségek', Icon: Users, short: 'Elnök, jegyző, hitelesítők' },
  { id: 'agenda', label: 'Napirend', Icon: FileSignature, short: 'Napirendi pontok és tárgyalás' },
  { id: 'resolutions', label: 'Határozatok', Icon: Gavel, short: 'Sorszámozás, felelős, határidő' },
  { id: 'status', label: 'Állapotok', Icon: CheckCircle2, short: 'Vázlat → véglegesítve → hitelesítve' },
  { id: 'sealing', label: 'Esperesi iktatás', Icon: Stamp, short: 'Iktatás és aláírások' },
]

export function JegyzokonyvekHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Jegyzőkönyvek</h2>
            <p className="mt-1 text-xs text-slate-500">Presbiteri és közgyűlési ülések</p>
          </div>
          <nav className="px-2 pb-3">
            {CATEGORIES.map((cat) => {
              const isActive = cat.id === active
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActive(cat.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    <cat.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{cat.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{cat.short}</span>
                  </span>
                  <ChevronRight className={`size-3.5 shrink-0 ${isActive ? 'text-slate-400' : 'opacity-0'}`} />
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <activeCategory.Icon className="size-5" />
            </span>
            <div>
              <h3 className="font-heading text-2xl text-slate-800">{activeCategory.label}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{activeCategory.short}</p>
            </div>
          </div>

          <div className="space-y-5 text-sm leading-relaxed text-slate-700">
            {active === 'general' && <GeneralContent />}
            {active === 'types' && <TypesContent />}
            {active === 'participants' && <ParticipantsContent />}
            {active === 'agenda' && <AgendaContent />}
            {active === 'resolutions' && <ResolutionsContent />}
            {active === 'status' && <StatusContent />}
            {active === 'sealing' && <SealingContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'cyan' | 'violet' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

function GeneralContent() {
  return (
    <>
      <p>
        A <strong>Jegyzőkönyvek</strong> modul a gyülekezet hivatalos döntéshozó testületeinek
        (presbitérium, közgyűlés) üléseinek dokumentálására szolgál. Minden ülés egy
        jegyzőkönyvbe kerül, határozatokkal, napirendi pontokkal, jelenléti listával.
      </p>
      <S>Mire jó?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Presbiteri és közgyűlési határozatok hivatalos rögzítése.</li>
        <li>Évenkénti határozat-sorszámozás folyamatosan.</li>
        <li>Aláírások és hitelesítés követése.</li>
        <li>3 nyomtatható forma: meghívó, határozat-kivonat, teljes jegyzőkönyv.</li>
        <li>A pénzügyi vizsgálat számára kötelező mellékletek (pl. számadás-jóváhagyó határozat).</li>
      </ul>
    </>
  )
}

function TypesContent() {
  return (
    <>
      <S>Presbiteri ülés</S>
      <p>
        A presbitérium rendes vagy rendkívüli ülése. A presbitérium tagjai döntenek a
        gyülekezet napi életéhez kötődő ügyekben (lelkészi szolgálatok beosztása, kisebb
        pénzügyi döntések, közlemények, javítások).
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Évente több ülés (általában havonta vagy negyedévente).</li>
        <li>Határozatképesség: a tagok többsége jelen kell legyen.</li>
      </ul>

      <S>Közgyűlés</S>
      <p>
        A gyülekezet egészének döntéshozó fóruma. Az aktív, választói joggal rendelkező
        egyháztagok ülnek össze, általában évente egyszer.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>A <strong>számadás</strong> jóváhagyása ezen történik.</li>
        <li>A <strong>presbiterválasztás</strong> — az Erdélyi Református
          Egyházkerületben a ciklus 3 év (a gyülekezeti ciklus-hossz a
          rendszerben állítható).</li>
        <li>Egyéb fontos egyházközségi döntések (épület-eladás, hitelek, stb.).</li>
      </ul>

      <S>Mit különböztet meg a két típus?</S>
      <p>
        A típus a jegyzőkönyv fejlécében és a határozat-sorszámozásban is megjelenik. A
        rendszer mindkettőhöz külön sorszám-sorozatot tart (pl. <em>Presbiteri 5/2026</em>{' '}
        és <em>Közgyűlési 1/2026</em>).
      </p>
    </>
  )
}

function ParticipantsContent() {
  return (
    <>
      <S>Kötelező tisztségviselők</S>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Elnök</strong> — általában a gyülekezet lelkipásztora vagy az esperes</li>
        <li><strong>Jegyző</strong> — a jegyzőkönyvet vezető tag (általában a gondnok vagy egy presbiter)</li>
        <li><strong>Hitelesítő 1</strong> — két, az ülésen részt vevő, választott hitelesítő</li>
        <li><strong>Hitelesítő 2</strong> — a második hitelesítő</li>
      </ul>

      <S>Jelenléti lista</S>
      <p>
        Minden meghívott személyhez a rendszerben jelölhetjük az állapotát:
      </p>
      <div className="flex flex-wrap gap-2">
        <Pill tone="emerald">Jelen</Pill>
        <Pill tone="cyan">Igazoltan távol</Pill>
        <Pill tone="amber">Igazolatlanul távol</Pill>
        <Pill tone="violet">Meghívott</Pill>
      </div>

      <S>Határozatképesség</S>
      <p>
        Egy ülés akkor határozatképes, ha a szavazati jogú tagok többsége (50% + 1)
        jelen van. A rendszer 2026-08-26-tól így számol: az alap a <strong>teljes
        értékű, aktív mandátumú presbiterek</strong> + a <strong>lelkész</strong>
        (hivatalból, az ülés elnökeként). A <strong>pót-</strong> és
        <strong> tiszteletbeli presbiter</strong> tanácskozási joggal vesz részt, a
        kvórumba nem számít. Ha az ülés nem határozatképes, a jegyzőkönyvben rögzíteni
        kell — érdemi határozat nem hozható, új ülést kell összehívni.
      </p>
    </>
  )
}

function AgendaContent() {
  return (
    <>
      <p>
        Minden ülés <strong>napirendi pontokból</strong> áll. Egy napirendi pont egy
        konkrét megtárgyalandó témát fed le.
      </p>

      <S>Egy napirendi pont szerkezete</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Cím</strong> — rövid, beszédes (pl. „2026. évi költségvetés elfogadása")</li>
        <li><strong>Előadó</strong> — aki a témát ismerteti az ülésen</li>
        <li><strong>Tárgyalás</strong> — szöveges leírás a vitáról, érvek és ellenérvek</li>
        <li><strong>Szavazás</strong> — igen / nem / tartózkodás szavazat-számok</li>
        <li><strong>Határozat</strong> — a napirendi pont eredménye (lásd Határozatok kategória)</li>
      </ul>

      <S>Gyors új-napirend létrehozás</S>
      <p>
        A rendszerben az új napirendi pont címét beírva, Enter-t nyomva automatikusan
        létrejön egy alapértelmezett határozat: <em>„Tudomásul szolgál!"</em> — ha csak
        tájékoztatás történt, ez maradhat; ha érdemi döntés született, módosítani kell.
      </p>
    </>
  )
}

function ResolutionsContent() {
  return (
    <>
      <p>
        A <strong>határozat</strong> a jegyzőkönyv legfontosabb eleme — itt kerül rögzítésre,
        hogy mit döntött a testület.
      </p>

      <S>Egy határozat szerkezete</S>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Sorszám</strong> — évente és típusonként folyamatosan (pl. <em>Presbiteri 12/2026</em>)</li>
        <li><strong>Szöveg</strong> — a határozat pontos megfogalmazása</li>
        <li><strong>Felelős</strong> — aki a végrehajtásért felel (személy vagy testület)</li>
        <li><strong>Határidő</strong> — meddig kell végrehajtani</li>
      </ul>

      <S>Sorszámozás</S>
      <p>
        A rendszer automatikusan adja a következő sorszámot az ülés típusa és éve szerint.
        A sorszám már a határozat létrehozásakor véglegesedik, NEM kell utólag módosítani.
      </p>

      <S>Tipp — pontos megfogalmazás</S>
      <p>
        A határozat szövegét úgy fogalmazd, hogy <em>akció-orientált</em> legyen
        (pl. „A presbitérium elfogadja a 2026. évi költségvetést, melynek főösszege …"). A
        „Tudomásul szolgál!" csak akkor, ha tényleg tájékoztatás történt érdemi döntés
        nélkül.
      </p>

      <S>Hivatkozás más határozatokra</S>
      <p>
        A jegyzőkönyv szövegén belül szabadon hivatkozhatsz korábbi határozatokra
        (pl. „A 14/2025. számú presbiteri határozat módosítása"). A rendszer NEM
        ellenőrzi a hivatkozást — a precíz fogalmazás a jegyzőé.
      </p>
    </>
  )
}

function StatusContent() {
  return (
    <>
      <p>
        Egy jegyzőkönyv három fő állapotban lehet:
      </p>

      <S>Állapotok</S>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Pill tone="slate">Vázlat</Pill>
          {' '}— szerkesztés alatt, nem véglegesített. Bárki módosíthat, akinek
          jogosultsága van.
        </li>
        <li>
          <Pill tone="cyan">Véglegesítve</Pill>
          {' '}— a tartalom lezárva, de még nincsenek aláírások. Innen már nem
          módosítható szöveges tartalom.
        </li>
        <li>
          <Pill tone="emerald">Hitelesítve</Pill>
          {' '}— az elnök, jegyző és két hitelesítő aláírta. A nyomtatható forma
          (meghívó / kivonat / jegyzőkönyv) elérhető.
        </li>
      </ul>

      <S>Mit lehet nyomtatni?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Meghívó</strong> — az ülés előtti tájékoztató napirenddel</li>
        <li><strong>Határozat-kivonat</strong> — csak a határozatok listája</li>
        <li><strong>Teljes jegyzőkönyv</strong> — minden tartalom, aláírásokkal</li>
      </ul>

      <S>Visszalépés</S>
      <p>
        Egy hitelesített jegyzőkönyvet utólag <strong>csak Esperesi vagy Püspöki
        vizitáció</strong> alkalmával lehet módosítani — saját kezdeményezésből nem.
      </p>
    </>
  )
}

function SealingContent() {
  return (
    <>
      <S>Esperesi hivatal iktatás</S>
      <p>
        Az elfogadott jegyzőkönyveket a <strong>esperesi hivatalba</strong> be kell
        küldeni iktatásra. Az esperesi hivatal iktatószámával ellátott példányt is meg
        kell őrizni az irattárban.
      </p>

      <S>Hová csatlakozik más modulhoz?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Pénzügy:</strong> a költségvetés, számadás, hitelek, jelentős kiadások
          mind kötelezően <em>presbiteri határozaton</em> alapulnak.
        </li>
        <li>
          <strong>Leltár:</strong> a selejtezés (leírás) is kötelezően presbiteri
          határozatra történik.
        </li>
        <li>
          <strong>Tagnyilvántartás:</strong> a könyvelői hozzárendelések jóváhagyása is
          presbiteri határozaton alapul.
        </li>
      </ul>

      <S>Aláírások</S>
      <p>
        A hagyományos eljárás szerint <strong>4 aláírás</strong> szükséges minden
        jegyzőkönyvre: elnök, jegyző és két hitelesítő. Ezt a fizikai példányon
        kéziratosan kell megerősíteni; a digitális jegyzőkönyv „hitelesítve" státusza
        azt jelzi, hogy a folyamat lezárult.
      </p>

      <S>Megőrzés</S>
      <p>
        A jegyzőkönyveket <strong>tartósan</strong> meg kell őrizni (nincs selejtezési
        határidő). A nyomtatott jegyzőkönyveket évente lefűzni és kemény laptáblába
        beköttetni javasolt — ez egyháztörténeti dokumentum is.
      </p>
    </>
  )
}
