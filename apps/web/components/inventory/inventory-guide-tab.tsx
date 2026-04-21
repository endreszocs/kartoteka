'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { INVENTORY_PRINT_TYPES } from '@/lib/inventory/reporting'

type GuideSection = {
  id: string
  title: string
  intro: string
  summary: string[]
  steps: string[]
  tips: string[]
  caution?: string
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'alapok',
    title: '1. Mi a leltár, és mire való?',
    intro:
      'A leltár modul a gyülekezet vagyoni nyilvántartása. Ide kerülnek azok a tárgyak, könyvek, kegyszerek, telkek és egyéb vagyonelemek, amelyekről a gyülekezetnek hivatalosan számot kell adnia.',
    summary: [
      'A leltár nem csak egy lista, hanem hivatalos nyilvántartás.',
      'Az itt rögzített adatokból készülnek az éves nyomtatványok és a vagyonleltári jelentés.',
      'A tárgyak év közben is változhatnak: új beszerzés, törlés, áthelyezés, felelős személy változása.',
      'Ezért maguk a leltári tételek szerkeszthetők maradnak, még akkor is, ha egy éves jelentés már véglegesítve lett.',
    ],
    steps: [
      'Először nézze át, hogy az adott tárgy már szerepel-e a rendszerben.',
      'Ha még nincs benne, vegye fel új tételként.',
      'Ha már szerepel, szerkessze a meglévő rekordot, ne hozzon létre duplikátumot.',
      'Törlés helyett mindig gondolja végig, hogy valóban kivezetésről van-e szó, vagy csak javítani kell az adatot.',
    ],
    tips: [
      'A leltárban a pontosság fontosabb, mint a gyorsaság.',
      'A helyszín és a felelős személy megadása sokat segít a helyszíni ellenőrzésnél.',
      'A beszerzési bizonylat száma később is visszakereshetővé teszi a tételt.',
    ],
  },
  {
    id: 'rogzites',
    title: '2. Új leltári tétel rögzítése',
    intro:
      'Egy új tárgy felvételekor a rendszer automatikusan leltári számot ad, majd a megadott adatok alapján a megfelelő kategóriába sorolja a tételt.',
    summary: [
      'Kötelező a megnevezés és a beszerzési érték.',
      'A kategória meghatározza, hogy melyik hivatalos nyomtatványba milyen sorban kerül majd a tétel.',
      'A mennyiség és mértékegység akkor fontos, ha nem egyetlen darabról van szó.',
    ],
    steps: [
      'Kattintson az „Új tétel” gombra.',
      'Írja be a tárgy pontos megnevezését úgy, ahogyan később is felismerhető marad.',
      'Válassza ki a kategóriát: alapeszköz, csekély értékű, könyv, kegyszer és így tovább.',
      'Adja meg a beszerzési értéket és lehetőleg a beszerzés dátumát.',
      'Töltse ki a helyszínt, a felelős személyt és – ha van – a beszerzési irat számát.',
      'Mentés után ellenőrizze a listában, hogy a tétel a megfelelő helyre került-e.',
    ],
    tips: [
      'Ha ugyanabból a tárgyból több azonos darab van, a mennyiség mezőt használja.',
      'A megnevezés legyen rövid, de pontos: például „irodai nyomtató” vagy „úrasztali kehely”.',
      'A beszerzési dátum segít az értékcsökkenés számításában és az éves kimutatásokban.',
    ],
    caution: 'Ha nem biztos abban, hogy új tétel kell-e, inkább előbb keressen rá a meglévő listában.',
  },
  {
    id: 'kategoriak',
    title: '3. Mit jelent a 7 leltári kategória?',
    intro:
      'A hivatalos leltárprogram hét fő tárgycsoporttal dolgozik. Ezek nem díszítő címkék, hanem a hivatalos összesítések alapjai.',
    summary: [
      'Alapeszközök: nagyobb értékű, hosszabb ideig használt eszközök.',
      'Telkek, földek, erdők: ingatlan jellegű vagyonelemek.',
      'Csekély értékű tárgyak: kisebb értékű, de nyilvántartandó eszközök.',
      'Könyvek: állományjelleggel kezelt könyvtári vagy gyűjteményi tételek.',
      'Kegyszerek: egyházi, liturgikus használatú tárgyak.',
      'Kárpótlási jegyek, részvények: pénzügyi vagy tulajdonjogi jellegű vagyonelemek.',
      'Bizományi tételek: olyan tárgyak, amelyek a gyülekezet kezelésében vannak, de külön figyelmet igényelnek.',
    ],
    steps: [
      'Kategóriát mindig a tárgy tényleges természete alapján válasszon.',
      'Ha bizonytalan, nézze meg, melyik nyomtatványban milyen logikai blokkba illene a tétel.',
      'A kategória később módosítható, de csak indokolt esetben.',
    ],
    tips: [
      'Az alapeszközök és a csekély értékű tételek összekeverése torzíthatja az éves jelentéseket.',
      'A könyveknek és kegyszereknek külön csoportja van, ezért ne általános tárgyként vegye fel őket.',
    ],
  },
  {
    id: 'ertekcsokkenes',
    title: '4. Érték, jelenlegi érték és értékcsökkenés',
    intro:
      'A rendszer a beszerzési értékből és – ahol van – a használati időből számolja a leltári értéket. Ez különösen az alapeszközöknél fontos.',
    summary: [
      'Beszerzési érték: amennyiért a tárgy bekerült a gyülekezet vagyonába.',
      'Könyv szerinti érték: a nyilvántartott alapérték, mennyiséggel szorozva.',
      'Leltári érték: a jelenleg számolt érték, szükség esetén értékcsökkenéssel korrigálva.',
      'Az alapeszközöknél a használati idő és a beszerzési dátum számít a leginkább.',
    ],
    steps: [
      'Ha a tétel alapeszköz, töltse ki a használati időt vagy a megfelelő katalógusadatot.',
      'Mentés után ellenőrizze a listában a könyv szerinti és a leltári értéket.',
      'Ha az érték túl alacsony vagy irreális, nézze meg a dátumot, a mennyiséget és a használati időt.',
    ],
    tips: [
      'Régi, de még használatban levő tárgynál is fontos, hogy a beszerzési év lehetőleg helyes legyen.',
      'Ha nincs biztos adat, inkább kerüljön be megjegyzés, mint egy félrevezető pontatlan szám.',
    ],
  },
  {
    id: 'szures',
    title: '5. Szűrés, keresés és napi használat',
    intro:
      'A leltár akkor igazán használható, ha gyorsan meg tudja találni, amit keres. A felső szűrősor ezért nem dísz, hanem napi munkafelület.',
    summary: [
      'A kategóriaszűrő csak az adott tárgycsoportot mutatja.',
      'A helyszínszűrő segít például parókia, templom, gyűlésterem vagy raktár szerint keresni.',
      'Az időszakszűrés a beszerzési dátum alapján működik.',
      'A kereső egyszerre figyeli a megnevezést, leltári számot, helyszínt, felelős személyt és bizonylatot.',
    ],
    steps: [
      'Ha csak egy tárgycsoporttal szeretne dolgozni, először válassza ki a kategóriát.',
      'Ha csak egy helyiséget vagy épületet szeretne áttekinteni, állítson be helyszínszűrőt.',
      'Ha egy adott időszak beszerzéseit keresi, használja az időszak kezdete és vége mezőket.',
      'Ha még így is sok a találat, írjon be egy részletet a tárgy nevéből vagy a leltári számból.',
    ],
    tips: [
      'A nyomtatási központ mindig a jelenlegi szűrt állapotból indul ki.',
      'Ha a képernyőn csak az alapeszközök látszanak, a nyomtatott lista is csak az alapeszközöket fogja tartalmazni.',
    ],
  },
  {
    id: 'nyomtatas',
    title: '6. Nyomtatási központ és hivatalos kimenetek',
    intro:
      'A nyomtatási központból több különböző hivatalos dokumentum állítható elő. Ezek nem ugyanazt a célt szolgálják.',
    summary: INVENTORY_PRINT_TYPES.map((type) => `${type.title}: ${type.description}`),
    steps: [
      'Állítsa be előbb a kívánt szűrőket a leltár főoldalon.',
      'Nyissa meg a Nyomtatási központot.',
      'Válassza ki a megfelelő nyomtatványt.',
      'Nézze meg az előnézetet, hogy a lista valóban azt mutatja-e, amit szeretne.',
      'Válasszon: PDF-be mentés vagy direkt nyomtatás.',
    ],
    tips: [
      'A direkt nyomtatás a böngésző nyomtatási előnézetét nyitja meg, ott lehet nyomtatót választani.',
      'Többoldalas dokumentumnál az oldalszám és a fejléc is megjelenik a nyomtatási nézetben.',
      'Ha csak egy helyszínt vagy egy kategóriát szeretne nyomtatni, ezt még a nyomtatási központ megnyitása előtt szűrje be.',
    ],
    caution: 'A Vagyonleltári jelentést csak akkor véglegesítse, ha biztos benne, hogy az éves adatok rendben vannak.',
  },
  {
    id: 'veglegesites',
    title: '7. Mi záródik le, és mi nem?',
    intro:
      'Ez az egyik legfontosabb különbség: a rendszerben nem maguk a leltári tárgyak záródnak le, hanem az adott évre készített vagyonleltári jelentés.',
    summary: [
      'A leltári tárgyak év közben továbbra is kezelhetők.',
      'A véglegesítés azt akadályozza meg, hogy ugyanarra az évre új végleges jelentést készítsen engedély nélkül.',
      'Ha az egyházmegye feloldást ad, utána újra véglegesíthető a jelentés.',
    ],
    steps: [
      'Év közben nyugodtan vigyen fel új tárgyat, módosítson helyszínt vagy felelős személyt.',
      'Az éves zárás előtt ellenőrizze a nyomtatványokat.',
      'Ha minden rendben van, véglegesítse a Vagyonleltári jelentést.',
      'Ha utólag mégis javítás kell, kérjen feloldást a jelentéshez.',
    ],
    tips: [
      'A véglegesítés előtt érdemes legalább a Leltárív és a Vagyonleltári jelentés előnézetét átnézni.',
      'A véglegesített jelentés leadható az egyházmegye felé, de a nyilvántartás napi használata ettől nem áll le.',
    ],
  },
  {
    id: 'gyakori',
    title: '8. Gyakori kérdések és tipikus hibák',
    intro:
      'A legtöbb hiba nem technikai, hanem adatbeviteli hiba: rossz kategória, hiányzó dátum, vagy nem egyértelmű megnevezés.',
    summary: [
      'Miért nem találom a tárgyat? — Lehet, hogy más helyszínen, más kategóriában vagy más megnevezéssel van rögzítve.',
      'Miért üres a nyomtatvány? — Valószínűleg túl szűk szűrő maradt bekapcsolva.',
      'Miért más a leltári érték, mint a beszerzési érték? — Az értékcsökkenés vagy a mennyiség is befolyásolja.',
      'Miért nem kerül bele valami a Vagyonleltári jelentésbe? — Ellenőrizni kell a kategóriát, a dátumot és a szűrt időszakot.',
    ],
    steps: [
      'Ha valami hiányzik, először törölje a szűrőket, és nézze meg újra.',
      'Ha egy tárgy rossz összesítőbe kerül, ellenőrizze a kategóriáját.',
      'Ha nyomtatáskor nem a várt adatok jelennek meg, ellenőrizze a szűrt időszakot és a helyszínt.',
      'Ha bizonytalan, használja a megjegyzés mezőt, így később is látszik a döntés háttere.',
    ],
    tips: [
      'A legbiztonságosabb munkaforma: rögzítés, ellenőrzés, előnézet, majd csak ezután véglegesítés.',
      'A rendszer segít, de a hivatalos nyilvántartás felelőssége továbbra is a gyülekezeté.',
    ],
  },
]

export function InventoryGuideTab() {
  const [activeSection, setActiveSection] = useState<string>(GUIDE_SECTIONS[0]?.id || 'alapok')
  const selected = useMemo(
    () => GUIDE_SECTIONS.find((section) => section.id === activeSection) || GUIDE_SECTIONS[0],
    [activeSection],
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="card-raised space-y-2 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Leltár súgó</p>
            <h3 className="mt-1 font-heading text-2xl text-slate-800">Kezdőbarát használati útmutató</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Ez a fül úgy vezeti végig a leltárprogramot, mintha most használná először. A cél nem csak az, hogy
              „mit kell kattintani”, hanem az is, hogy értse, mi miért történik.
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            8 témakör, lépésről lépésre, a napi használattól a végleges jelentésig
          </div>

          <div className="space-y-2">
            {GUIDE_SECTIONS.map((section, index) => {
              const active = section.id === activeSection
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-teal-400 bg-teal-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{String(index + 1).padStart(2, '0')}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{section.title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{section.intro}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-raised p-5 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Aktív fejezet</p>
                <h3 className="mt-1 font-heading text-3xl text-slate-800">{selected.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{selected.intro}</p>
              </div>
              <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs">
                Részletes magyarázat
              </Badge>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <InfoBlock
                eyebrow="Mit érdemes tudni?"
                title="Összefoglaló"
                items={selected.summary}
                tone="teal"
              />
              <InfoBlock
                eyebrow="Mit csináljak?"
                title="Lépésről lépésre"
                items={selected.steps}
                tone="blue"
                ordered
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <InfoBlock
                eyebrow="Jó gyakorlat"
                title="Hasznos tanácsok"
                items={selected.tips}
                tone="emerald"
              />
              <div className="space-y-4">
                {selected.caution ? (
                  <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700/70">Figyeljen erre</p>
                    <p className="mt-2 text-sm leading-6 text-amber-900">{selected.caution}</p>
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mihez kapcsolódik?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">Leltári tárgyak</Badge>
                    <Badge variant="secondary">Nyomtatási központ</Badge>
                    <Badge variant="secondary">Vagyonleltári jelentés</Badge>
                    <Badge variant="secondary">Éves leadás</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-raised p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700/70">Hivatalos nyomtatványok röviden</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {INVENTORY_PRINT_TYPES.map((type) => (
                <div key={type.id} className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{type.title}</p>
                  <p className="mt-1 text-xs font-medium text-teal-700">{type.subtitle}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{type.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoBlock({
  eyebrow,
  title,
  items,
  tone,
  ordered = false,
}: {
  eyebrow: string
  title: string
  items: string[]
  tone: 'teal' | 'blue' | 'emerald'
  ordered?: boolean
}) {
  const styles = {
    teal: 'border-teal-100 bg-teal-50/70 text-teal-900',
    blue: 'border-blue-100 bg-blue-50/70 text-blue-900',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-900',
  }[tone]

  return (
    <div className={`rounded-[1.75rem] border p-4 ${styles}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{eyebrow}</p>
      <h4 className="mt-1 text-lg font-semibold">{title}</h4>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl bg-white/70 px-4 py-3 text-sm leading-6 ring-1 ring-white/70">
            {ordered ? <span className="mr-2 font-semibold">{index + 1}.</span> : null}
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
