'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Landmark,
  ReceiptText,
  Scale,
  Wallet,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AuditStatus = 'Kész' | 'Részleges' | 'Tervezett'
type GuideCategoryKey =
  | 'alapok'
  | 'konyveles'
  | 'kassza-bank'
  | 'koltsegvetes'
  | 'szamadas'
  | 'monetar'
  | 'audit'
  | 'terv'

const categories: Array<{
  key: GuideCategoryKey
  label: string
  icon: typeof BookOpen
  description: string
}> = [
  {
    key: 'alapok',
    label: 'Alapelvek',
    icon: BookOpen,
    description: 'A legfontosabb EREK pénzügyi működési elvek röviden.',
  },
  {
    key: 'konyveles',
    label: 'Mit hova könyveljek?',
    icon: ReceiptText,
    description: 'Tipikus bevételi és kiadási tételek ajánlott célkód-csoporttal.',
  },
  {
    key: 'kassza-bank',
    label: 'Kassza és bank',
    icon: Wallet,
    description: 'Készpénz, bank, belső mozgások és napi fegyelem.',
  },
  {
    key: 'koltsegvetes',
    label: 'Költségvetés',
    icon: Landmark,
    description: 'Hogyan készüljön a terv és mire jó a költségvetési nézet.',
  },
  {
    key: 'szamadas',
    label: 'Számadás',
    icon: Scale,
    description: 'Évközi és év végi számadási logika, ellenőrzőpontokkal.',
  },
  {
    key: 'monetar',
    label: 'Monetár',
    icon: Wallet,
    description: 'Címletenkénti készpénzellenőrzés és eltérések értelmezése.',
  },
  {
    key: 'audit',
    label: 'Rendszeraudit',
    icon: ClipboardCheck,
    description: 'Mi működik már teljesen, mi részleges és mi hiányzik még.',
  },
  {
    key: 'terv',
    label: 'Beépítési terv',
    icon: FileText,
    description: 'A következő fejlesztési lépések, prioritási sorrendben.',
  },
]

const principleBullets = [
  'Minden tételt először egyházi logika szerint kell elhelyezni, és csak utána rögzíteni bevételként vagy kiadásként.',
  'A kassza, a bank és a belső mozgás három külön világ: ezeket nem szabad összekeverni.',
  'A költségvetés a tervet mutatja, a számadás pedig a tényleges teljesülést. A kettőt végig külön kell kezelni.',
  'A rendszerben minden tétel akkor jó, ha később a számadásban és az ellenőrzéskor is egyértelműen visszakövethető.',
]

const bookkeepingGroups = [
  {
    code: '101 / 201',
    title: 'Egyházi tevékenység és működés',
    examples: [
      'egyházfenntartói járulék',
      'perselypénz',
      'általános adomány',
      'gyülekezeti működéshez kapcsolódó rezsi vagy fenntartási kiadás',
    ],
  },
  {
    code: '102 / 202',
    title: 'Misszió és diakónia',
    examples: [
      'ifjúsági alkalomhoz kötött bevétel vagy költség',
      'nőszövetségi, presbiteri vagy diakóniai célra adott adomány',
      'szeretetvendégség, közösségi szolgálat, diakóniai segélyezés',
    ],
  },
  {
    code: '103 / 203',
    title: 'Más egyházi tevékenység',
    examples: [
      'pályázati támogatás',
      'iratterjesztés vagy külön célra adott egyházi bevétel',
      'olyan egyházi tétel, amely nem az alapműködéshez tartozik',
    ],
  },
  {
    code: '104 / 204',
    title: 'Gazdasági tevékenység',
    examples: [
      'bérleti díj',
      'mezőgazdasági bevétel',
      'gazdasági tevékenység fenntartási és működési költségei',
    ],
  },
  {
    code: '105 / 205',
    title: 'Szubvenciók és beruházások',
    examples: [
      'felújítási támogatás',
      'beruházási támogatás',
      'értéknövelő nagyobb javítás, építés, eszközbeszerzés',
    ],
  },
]

const bookkeepingExamples = [
  {
    title: 'Egyházfenntartás és járulék',
    recommendation: 'Jellemzően a 101-es bevételi csoportba kerüljön.',
  },
  {
    title: 'Adomány konkrét missziós célra',
    recommendation: 'Ha a cél ifjúsági, diakóniai vagy közösségi szolgálat, inkább a 102-es csoporthoz igazodjon.',
  },
  {
    title: 'Belső pénzmozgás kassza és bank között',
    recommendation: 'Ne normál bevételként vagy kiadásként könyveld, hanem belső mozgásként kezeld.',
  },
  {
    title: 'Beruházás vagy nagyobb felújítás',
    recommendation: 'Ha a vagyon értékét növeli vagy tartós fejlesztésről van szó, általában a 105 / 205 vonal a jó irány.',
  },
]

const cashBankBullets = [
  'A kassza csak azt mutassa, ami fizikailag is ott van a lelkésznél vagy a pénztárban.',
  'A banki tételeket ne keverd a készpénzes mozgásokkal: külön számlaforrás és külön ellenőrzés kell.',
  'A belső mozgásokhoz BM-logika kell: ez nem adomány és nem kiadás, hanem pénzeszköz-áthelyezés.',
  'A párosítatlan tételeket rendszeresen nézd át, hogy ne maradjanak személyhez vagy családhoz nem kötött befizetések.',
]

const budgetBullets = [
  'A költségvetést év elején töltsd fel, lehetőleg célkódonként és pénzügyi logika szerint.',
  'A terv számai legyenek reálisak: a számadás százalékos teljesülése csak így lesz hasznos visszajelzés.',
  'A nagyobb támogatások, beruházások és missziós célok külön soron legyenek követhetők.',
]

const accountingBullets = [
  'Az élő számadás azt mutatja, hogy a költségvetéshez képest hol tart a tényleges megvalósulás.',
  'Év végén ellenőrizni kell a célkódokat, a belső mozgásokat, a monetárt, a párosítatlan tételeket és a záró egyenlegeket.',
  'A zárszámadási metaadatok és az időközi nyomtatási workflow még további erősítésre szorulnak.',
]

const monetaryBullets = [
  'A Monetár fülön címletenként kell beírni a fizikailag megszámolt bankjegyeket és érméket.',
  'A rendszer azonnal megmutatja, hogy a könyvelt készpénzegyenleghez képest hiány, többlet vagy egyezőség látszik.',
  'Ha itt eltérés van, előbb a rögzített készpénzes tételeket és a belső mozgásokat kell átnézni.',
]

const auditItems: Array<{
  title: string
  status: AuditStatus
  detail: string
}> = [
  {
    title: 'Bevételek és kiadások rögzítése',
    status: 'Kész',
    detail: 'Az alap könyvelési rögzítés, a célkódhoz kötés és a tételek listázása működik.',
  },
  {
    title: 'Kassza és bank élő egyenlegek',
    status: 'Kész',
    detail: 'A rendszer külön kassza- és banknézetben mutatja az egyenlegeket a rögzített adatok alapján.',
  },
  {
    title: 'Költségvetés és élő számadás',
    status: 'Kész',
    detail: 'A költségvetési tervhez képest látszik a tényleges megvalósulás százaléka.',
  },
  {
    title: 'Monetár címletenként',
    status: 'Kész',
    detail: 'A címletenkénti fizikai készpénzellenőrzés elérhető, és összevethető a könyvelt kasszával.',
  },
  {
    title: 'Párosítatlan befizetések kezelése',
    status: 'Kész',
    detail: 'A nem személyhez vagy családhoz kötött befizetések külön auditfelületen ellenőrizhetők.',
  },
  {
    title: 'Belső mozgások teljes BM-workflow-ja',
    status: 'Részleges',
    detail: 'A belső mozgás alapjai vannak, de a teljes BM-sorszámos, kettős könyvelési nyom még erősítendő.',
  },
  {
    title: 'Résszámadás és időközi nyomtatás',
    status: 'Tervezett',
    detail: 'Az EREK-gyakorlat szerinti időközi kimutatásokhoz külön nyomtatási és zárási folyamat szükséges.',
  },
  {
    title: 'Zárszámadási metaadatok és iktatás',
    status: 'Részleges',
    detail: 'A véglegesítés megvan, de az iktatószám, jegyzőkönyvi szám és hivatalos metaadat-kezelés még bővítendő.',
  },
  {
    title: 'Devizás átértékelés',
    status: 'Tervezett',
    detail: 'A devizás számlák év végi átértékelése még külön workflow-t igényel.',
  },
]

const roadmap = [
  'BM-sorszámos belső mozgás teljes kettős könyvelése a bevételi és kiadási oldalon is.',
  'Résszámadás és időközi nyomtatási workflow.',
  'Zárszámadási metaadat-panel: iktatószám, jegyzőkönyvi szám, dátum, aláírók.',
  'Devizás bankszámlák év végi átértékelése és árfolyam-különbözet kezelése.',
  'EREK-szintű véglegesítési ellenőrzőlista a számadás lezárása előtt.',
]

function statusTone(status: AuditStatus) {
  if (status === 'Kész') {
    return {
      badge: 'bg-emerald-100 text-emerald-700',
      card: 'border-emerald-100 bg-emerald-50/70',
      icon: CheckCircle2,
    }
  }

  if (status === 'Részleges') {
    return {
      badge: 'bg-amber-100 text-amber-700',
      card: 'border-amber-100 bg-amber-50/70',
      icon: AlertTriangle,
    }
  }

  return {
    badge: 'bg-sky-100 text-sky-700',
    card: 'border-sky-100 bg-sky-50/70',
    icon: ClipboardCheck,
  }
}

export function ErekFinanceGuideTab() {
  const [selectedCategory, setSelectedCategory] = useState<GuideCategoryKey>('konyveles')

  const selectedMeta = useMemo(
    () => categories.find((category) => category.key === selectedCategory) ?? categories[0],
    [selectedCategory],
  )
  const SelectedIcon = selectedMeta.icon

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-none">
        <CardContent className="card-raised relative overflow-hidden p-6">
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-amber-200/35 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-white/90 text-teal-700 shadow-sm">EREK pénzügyi rend</Badge>
              <Badge className="border-0 bg-amber-50 text-amber-700 shadow-sm">Használati útmutató + audit</Badge>
            </div>

            <h3 className="mt-4 font-heading text-3xl text-slate-800">EREK PÉNZÜGYEK</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Kategóriákra bontott pénzügyi súgó: itt lehet gyorsan megnézni, mit hova érdemes könyvelni,
              hogyan működik a rendszer jelenleg, és melyik területen milyen további fejlesztés várható.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-800">Témakörök</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map(({ key, label, icon: Icon, description }) => {
              const active = key === selectedCategory
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCategory(key)}
                  className={`w-full rounded-[1.2rem] border px-4 py-3 text-left transition ${
                    active
                      ? 'border-teal-200 bg-teal-50 text-teal-900 shadow-[0_18px_36px_-32px_rgba(13,148,136,0.35)]'
                      : 'border-white/70 bg-white/88 text-slate-700 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.14)] hover:border-teal-100 hover:bg-teal-50/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex size-9 items-center justify-center rounded-2xl ${active ? 'bg-white text-teal-700' : 'bg-slate-50 text-slate-500'}`}>
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <SelectedIcon className="size-4 text-teal-600" />
              {selectedMeta.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCategory === 'alapok' && (
              <div className="space-y-3">
                {principleBullets.map((text) => (
                  <GuideBullet key={text} icon={<BookOpen className="size-4 text-teal-600" />} text={text} />
                ))}
              </div>
            )}

            {selectedCategory === 'konyveles' && (
              <div className="space-y-4">
                <div className="rounded-[1.3rem] border border-amber-100 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
                  Ezek tipikus EREK-es könyvelési irányok. Határesetnél mindig a hivatalos útmutató logikája legyen az elsődleges,
                  de a rendszerben ez a bontás segít gyorsan jó helyre tenni a tételeket.
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {bookkeepingGroups.map((group) => (
                    <div key={group.code} className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.16)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{group.code}</p>
                      <h4 className="mt-2 text-base font-semibold text-slate-800">{group.title}</h4>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                        {group.examples.map((example) => (
                          <li key={example}>• {example}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {bookkeepingExamples.map((item) => (
                    <div key={item.title} className="rounded-[1.25rem] border border-teal-100 bg-teal-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCategory === 'kassza-bank' && (
              <div className="space-y-3">
                {cashBankBullets.map((text) => (
                  <GuideBullet key={text} icon={<ArrowLeftRight className="size-4 text-violet-600" />} text={text} />
                ))}
              </div>
            )}

            {selectedCategory === 'koltsegvetes' && (
              <div className="space-y-3">
                {budgetBullets.map((text) => (
                  <GuideBullet key={text} icon={<Landmark className="size-4 text-amber-600" />} text={text} />
                ))}
              </div>
            )}

            {selectedCategory === 'szamadas' && (
              <div className="space-y-3">
                {accountingBullets.map((text) => (
                  <GuideBullet key={text} icon={<Scale className="size-4 text-blue-600" />} text={text} />
                ))}
              </div>
            )}

            {selectedCategory === 'monetar' && (
              <div className="space-y-3">
                {monetaryBullets.map((text) => (
                  <GuideBullet key={text} icon={<Wallet className="size-4 text-emerald-600" />} text={text} />
                ))}
              </div>
            )}

            {selectedCategory === 'audit' && (
              <div className="grid gap-3 lg:grid-cols-2">
                {auditItems.map((item) => {
                  const tone = statusTone(item.status)
                  const Icon = tone.icon
                  return (
                    <div key={item.title} className={`rounded-[1.4rem] border p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.16)] ${tone.card}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                            <Icon className="size-4 text-slate-700" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-800">{item.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                          </div>
                        </div>
                        <Badge className={`border-0 ${tone.badge}`}>{item.status}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedCategory === 'terv' && (
              <div className="space-y-3">
                <div className="rounded-[1.35rem] border border-amber-100 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
                  Ezek a következő lépések ahhoz, hogy a pénzügyi modul teljesen lefedje az EREK-es napi, évközi és év végi működést.
                </div>
                {roadmap.map((item, index) => (
                  <div key={item} className="flex items-start gap-3 rounded-[1.25rem] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.14)]">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function GuideBullet({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.25rem] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.14)]">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-50">
        {icon}
      </div>
      <p className="text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}
