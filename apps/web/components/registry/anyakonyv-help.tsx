'use client'

import { useState } from 'react'
import {
  ArrowRightLeft,
  Baby,
  ChevronRight,
  Cross,
  FileSignature,
  Heart,
  Info,
  ScrollText,
  Sparkles,
} from 'lucide-react'

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgál az Anyakönyv' },
  { id: 'numbering', label: 'Egyházi szám', Icon: ScrollText, short: 'Évenkénti automata sorszám' },
  { id: 'baptism', label: 'Keresztelés', Icon: Baby, short: 'Mezők és kötelező adatok' },
  { id: 'confirmation', label: 'Konfirmáció', Icon: Sparkles, short: 'Hitvallás-tételek rögzítése' },
  { id: 'marriage', label: 'Esketés', Icon: Heart, short: 'Házasságkötések' },
  { id: 'burial', label: 'Temetés', Icon: Cross, short: 'Elhunyt anyakönyvezése' },
  { id: 'movement', label: 'Mozgás (be/elköltözés)', Icon: ArrowRightLeft, short: 'Gyülekezetbe lépés / távozás' },
  { id: 'denomination', label: 'Át- és kitérés', Icon: FileSignature, short: 'Vallásváltás követése' },
]

export function AnyakonyvHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Anyakönyv</h2>
            <p className="mt-1 text-xs text-slate-500">Sákramentumok és bejegyzések</p>
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
            {active === 'numbering' && <NumberingContent />}
            {active === 'baptism' && <BaptismContent />}
            {active === 'confirmation' && <ConfirmationContent />}
            {active === 'marriage' && <MarriageContent />}
            {active === 'burial' && <BurialContent />}
            {active === 'movement' && <MovementContent />}
            {active === 'denomination' && <DenominationContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
}
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{children}</code>
}

function GeneralContent() {
  return (
    <>
      <p>
        Az <strong>Anyakönyv</strong> modul a sákramentumok és más egyházi élethelyzetek
        hivatalos rögzítésére szolgál — keresztelés, konfirmáció, esketés, temetés,
        valamint a gyülekezeti mozgások (be- és elköltözés, áttérés, kitérés).
      </p>
      <S>A modul fő részei</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Áttekintés</strong> — éves összesítő grafikon és statisztika.</li>
        <li><strong>Keresztelés</strong>, <strong>Konfirmáció</strong>, <strong>Házasság</strong>, <strong>Temetés</strong> — sákramentum-bejegyzések.</li>
        <li><strong>Beköltözött</strong>, <strong>Elköltözött</strong> — gyülekezeti tagsági mozgások.</li>
        <li><strong>Áttért</strong>, <strong>Kitért</strong> — vallás-változás követése.</li>
      </ul>
      <S>Kapcsolódás más modulokhoz</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Tagnyilvántartás:</strong> a temetésbejegyzés automatikusan „elhunyt"-ra állítja a személyt.</li>
        <li><strong>Sírhelyek:</strong> a temetésbejegyzéshez érdemes sírhely-kartont is felvenni.</li>
        <li><strong>Iktató:</strong> az állami anyakönyvezéshez kimenő iratot szoktunk iktatni.</li>
        <li><strong>Éves jelentés:</strong> a sákramentumok statisztikája innen jön.</li>
      </ul>
    </>
  )
}

function NumberingContent() {
  return (
    <>
      <p>
        Minden bejegyzés automatikus <strong>egyházi számot</strong> kap a formában{' '}
        <C>ÉVTTNNNN</C>:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>ÉV</strong> — az aktuális év</li>
        <li><strong>TT</strong> — típuskód (keresztelés, konfirmáció, esketés, temetés)</li>
        <li><strong>NNNN</strong> — folyamatos sorszám az adott évre és típusra</li>
      </ul>
      <S>Évenkénti újraindulás</S>
      <p>
        A sorszám <strong>típusonként és évenként</strong> 1-től újraindul. Egy 2026-os
        keresztelési bejegyzés első egyházi száma <C>2026/K/0001</C> alakú; a temetéseké
        külön, <C>2026/T/0001</C>-ről indul.
      </p>
      <S>Állami szám</S>
      <p>
        Az egyházi szám MELLETT keresztelésnél és konfirmációnál van egy{' '}
        <strong>okirat</strong> (állami anyakönyvi szám) mező is, amit az állami hatóság
        ad. Esketésnél „hlevel" (házassági levél) szám van.
      </p>
      <S>Tipp</S>
      <p>
        Az egyházi szám utólag NEM módosítható. A rendszer automatikusan kínálja a
        következő szabad sorszámot, NEM kell kézzel megadni.
      </p>
    </>
  )
}

function BaptismContent() {
  return (
    <>
      <p>
        A <strong>keresztelési bejegyzés</strong> a megkeresztelt személy hivatalos
        regisztrálása.
      </p>
      <S>Kötelező adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Megkeresztelt személy</strong> — neve, születési adatok</li>
        <li><strong>Keresztelés dátuma</strong></li>
        <li><strong>Lelkész neve</strong> — aki a sákramentumot kiszolgáltatta</li>
        <li><strong>Egyházi szám</strong> — automatikusan</li>
      </ul>
      <S>Opcionális adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Szülők neve (apa, anya, anyja leánykori neve)</li>
        <li>Keresztszülők (komák)</li>
        <li>Születés dátuma és helye</li>
        <li>Lakcím</li>
        <li>Okirat (állami anyakönyvi szám)</li>
        <li>Megjegyzés (pl. szülőgyülekezet, ha másik gyülekezetből hozzák)</li>
      </ul>
      <S>Felnőtt keresztelés</S>
      <p>
        Felnőtt keresztelés esetén a hitvallás-tétel is részletezhető a megjegyzésben,
        valamint külön „felnőtt keresztelés" jelölést érdemes a kartonon hozzáfűzni.
      </p>
    </>
  )
}

function ConfirmationContent() {
  return (
    <>
      <p>
        A <strong>konfirmáció</strong> a fogadalom-tétel hivatalos rögzítése — az
        egyháztag első úrvacsorai részvétele.
      </p>
      <S>Kötelező adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Konfirmált személy</strong> — már léteznie kell a Tagnyilvántartásban</li>
        <li><strong>Konfirmáció dátuma</strong></li>
        <li><strong>Lelkész neve</strong></li>
        <li><strong>Egyházi szám</strong></li>
      </ul>
      <S>Opcionális adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Konfirmáció helye (általában a saját templom, de lehet más is)</li>
        <li>Hitvallás-tétel megjegyzés</li>
        <li>Okirat — ha az állami szervek is kérnek igazolást</li>
      </ul>
      <S>Kapcsolat a Tagnyilvántartással</S>
      <p>
        A konfirmáció állapota a Tagnyilvántartásban szerepel — a rendszer a sákramentum
        bejegyzésével automatikusan megjelöli a személy konfirmált státuszát.
      </p>
    </>
  )
}

function MarriageContent() {
  return (
    <>
      <p>
        Az <strong>esketés</strong> (házasságkötés) a házasság hivatalos egyházi megáldása.
      </p>
      <S>Kötelező adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Vőlegény és menyasszony</strong> — mindkettő külön rögzítve</li>
        <li><strong>Esketés dátuma</strong></li>
        <li><strong>Lelkész neve</strong></li>
        <li><strong>Egyházi szám</strong></li>
      </ul>
      <S>Opcionális adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Házassági levél száma (hlevel)</strong> — az állami anyakönyvi szám</li>
        <li>A felek vallása (vegyes esketésnél lényeges)</li>
        <li>Tanúk nevei</li>
        <li>Helyszín, ha nem a saját templom</li>
      </ul>
      <S>Vegyes házasság</S>
      <p>
        Ha az egyik fél nem református, a vegyes házasság tényét érdemes megjegyzésben
        rögzíteni. Ez nem tilos, de érdemes a sákramentum-szabályoknak megfelelni.
      </p>
    </>
  )
}

function BurialContent() {
  return (
    <>
      <p>
        A <strong>temetés</strong> az elhunyt egyháztag végső szolgálatának rögzítése.
      </p>
      <S>Kötelező adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Elhunyt neve</strong></li>
        <li><strong>Halál dátuma</strong></li>
        <li><strong>Temetés dátuma</strong></li>
        <li><strong>Lelkész neve</strong></li>
        <li><strong>Egyházi szám</strong></li>
      </ul>
      <S>Opcionális adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Életkor, születési dátum, születési hely</li>
        <li>Lakcím (utolsó)</li>
        <li>Halálok</li>
        <li>Sírhely (parcella/sor/szám) — kapcsolódhat a Sírhelyek modulhoz</li>
        <li>Hozzátartozók nevei</li>
      </ul>
      <S>Automatikus következmények</S>
      <p>
        A temetésbejegyzés után a rendszer:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>A Tagnyilvántartásban automatikusan „elhunyt"-ra állítja a személyt.</li>
        <li>Eltávolítja az aktív választói listáról.</li>
        <li>A statisztikákban a következő évi járulékfizetők közül kihagyja.</li>
      </ul>
    </>
  )
}

function MovementContent() {
  return (
    <>
      <p>
        A <strong>be- és elköltözés</strong> a gyülekezeti tagság fizikai mozgását követi,
        amikor egy egyháztag másik gyülekezetbe kerül vagy onnan érkezik.
      </p>

      <S>Beköltözött</S>
      <p>
        Egy korábban másik gyülekezethez tartozó tag a saját gyülekezetünkhöz csatlakozik.
        Kötelező: név, érkezés dátuma, küldő gyülekezet neve. A rendszerben automatikusan
        létrejön a személy-karton, ha még nincs.
      </p>

      <S>Elköltözött</S>
      <p>
        Egy gyülekezeti tag másik gyülekezetbe távozik. Az elköltözés állapot lehet:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Folyamatban (pending)</strong> — még nincs visszaigazolás a célgyülekezettől</li>
        <li><strong>Befogadva (accepted)</strong> — a célgyülekezet visszaigazolta</li>
        <li><strong>Elutasítva (rejected)</strong> — a célgyülekezet nem fogadta be</li>
      </ul>

      <S>Eljárás</S>
      <p>
        Az elköltözésnél hivatalos átküldő levelet (kimenő irat) kell írni a célgyülekezetnek.
        Ezt az Iktató modulban regisztráljuk. Ha visszajön az igazolás, az „Elköltözött"
        bejegyzést frissítjük „Befogadva"-ra.
      </p>
    </>
  )
}

function DenominationContent() {
  return (
    <>
      <p>
        Az <strong>át- és kitérés</strong> a vallás-változás követését szolgálja.
      </p>

      <S>Áttért</S>
      <p>
        Más egyházfelekezetből (pl. római katolikus, evangélikus, ortodox) áttért személy
        a református felekezetbe. Kötelező:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Név</li>
        <li>Áttérés dátuma</li>
        <li>Előző felekezet</li>
        <li>Lelkész neve, aki az áttérést rögzítette</li>
      </ul>

      <S>Kitért</S>
      <p>
        Református egyháztag más felekezetbe vagy ki-egyházi állapotba távozik. Kötelező:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Név</li>
        <li>Kitérés dátuma</li>
        <li>Új felekezet (vagy „egyháziatlan", ha kilépett)</li>
      </ul>

      <S>Következmények</S>
      <p>
        A kitérés állapotú személy:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Nem számít aktív református egyháztagnak.</li>
        <li>Nem szerepel a választói listán.</li>
        <li>Sákramentum (keresztelő, esketés, temetés) NEM szolgáltatható ki neki (kivételes esetben, püspöki engedéllyel).</li>
      </ul>
      <S>Tipp</S>
      <p>
        A kitérés érzékeny pasztorális helyzet — érdemes a megjegyzésben rögzíteni az
        okát és a kapcsolat fenntartási próbálkozásokat.
      </p>
    </>
  )
}
