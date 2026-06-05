/**
 * Walkthrough step definíciók — interaktív dashboard túra új lelkésznek.
 *
 * Minden step:
 *  - id: egyedi azonosító
 *  - target: CSS selector az érintett DOM elem felé (ha undefined, középen lebegő)
 *  - emoji: figyelemfelkeltő ikon a kártya fejlécébe
 *  - title: rövid, motiváló szlogen
 *  - description: 1-2 mondatos magyarázat, pásztorális hangvétellel
 *  - highlights: rövid, konkrét "mit tehet itt" felsorolás (max 3)
 *  - placement: hova helyezkedjen el a tooltip a target-hez képest
 *
 * A target-ek a dashboard komponensekben `data-walkthrough="<slug>"` attribútummal
 * vannak megjelölve.
 */

export interface WalkthroughStep {
  id: string
  target?: string
  emoji?: string
  title: string
  description: string
  highlights?: string[]
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

// `{firstName}` helyettesítő — a kliensoldalon cseréljük a lelkész keresztnevére
export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Üdvözlöm, {firstName}!',
    description:
      'Öröm, hogy itt van! A Kartotéka az Ön gyülekezeti munkáját hivatott megkönnyíteni — a tagnyilvántartástól a pénzügyön át az anyakönyvig minden egy helyen. Engedje meg, hogy két perc alatt körbevezessem; megmutatom, mire képes a rendszer. Bármikor kihagyhatja, és később a Profil beállításokban újraindíthatja.',
    placement: 'center',
  },
  {
    id: 'sidebar',
    target: '[data-walkthrough="sidebar"]',
    emoji: '🧭',
    title: 'Az Ön irányítópultja',
    description:
      'Ez a bal oldali menü a rendszer szíve — innen érhető el minden modul. Nem kell papírokat lapozgatni: minden, amire a gyülekezet vezetéséhez szüksége van, egyetlen kattintásnyira van.',
    highlights: [
      'Tagok, családok, presbiterek',
      'Pénzügy és számadás',
      'Anyakönyv és munkanapló',
    ],
    placement: 'right',
  },
  {
    id: 'tagnyilvantartas',
    target: '[data-walkthrough="menu-tagnyilvantartas"]',
    emoji: '👨‍👩‍👧‍👦',
    title: 'Ismerje a nyáját — Tagnyilvántartás',
    description:
      'A gyülekezet minden tagja, családja, presbitere és választója rendezetten, kereshetően egy helyen. Soha többé elveszett cédulák — a teljes közösség áttekinthető néhány másodperc alatt.',
    highlights: [
      'Új tagok és családok rögzítése',
      'Választói névjegyzék, presbitérium',
      'Gyors keresés és szűrés',
    ],
    placement: 'right',
  },
  {
    id: 'anyakonyv',
    target: '[data-walkthrough="menu-anyakonyv"]',
    emoji: '📖',
    title: 'A szent pillanatok helye — Anyakönyv',
    description:
      'Keresztelések, konfirmációk, esketések és temetések — mind egyetlen, biztonságos modulban. Az okiratszámozással nem kell bajlódnia: a rendszer automatikusan, hibátlanul vezeti.',
    highlights: [
      'Automatikus okiratszámozás',
      'Kereszt-, házassági és halotti anyakönyv',
      'Nyomtatható oklevelek, kivonatok',
    ],
    placement: 'right',
  },
  {
    id: 'penzugy',
    target: '[data-walkthrough="menu-penzugy"]',
    emoji: '💰',
    title: 'Rend a számokban — Pénzügy',
    description:
      'A rendszer legrészletesebb modulja, mégis egyszerű. Bevételek, kiadások, költségvetés és számadás átláthatóan — a presbitérium és a számvevő elé bizalommal teheti.',
    highlights: [
      'Bevétel, kiadás, költségvetés, számadás',
      'Banki kivonatok beolvasása',
      'Oblio / e-Factura integráció',
    ],
    placement: 'right',
  },
  {
    id: 'munkanaplo',
    target: '[data-walkthrough="menu-munkanaplo"]',
    emoji: '✍️',
    title: 'A szolgálat tükre — Munkanapló',
    description:
      'Istentiszteletek, családlátogatások, bibliaórák — a lelkészi szolgálat személyes naplója. Az anyakönyvi bejegyzések kérésére automatikusan ide is bekerülnek, így év végén kész az összegzés.',
    highlights: [
      'Istentiszteletek és alkalmak',
      'Családlátogatások, lelkigondozás',
      'Automatikus átvezetés az anyakönyvből',
    ],
    placement: 'right',
  },
  {
    id: 'dashboard-widgets',
    target: '[data-walkthrough="dashboard-widgets"]',
    emoji: '📊',
    title: 'Egy pillantás — és mindent lát',
    description:
      'A kezdőoldal kártyái élőben mutatják a legfontosabb számokat: aktív tagok, éves bevétel, közelgő alkalmak. Minden kártya kattintható — egyenesen a részletekhez vezet.',
    placement: 'top',
  },
  {
    id: 'help-tooltips',
    target: '[data-walkthrough="help-indicator"]',
    emoji: '💡',
    title: 'Soha nem marad egyedül',
    description:
      'A modulok mellett kis kérdőjeleket (?) talál. Bármikor elakad, kattintson rájuk — közérthető magyarázatot kap az adott funkcióról. A rendszer végig segíti Önt.',
    placement: 'bottom',
  },
  {
    id: 'profile',
    target: '[data-walkthrough="user-menu"]',
    emoji: '⚙️',
    title: 'Az Ön fiókja',
    description:
      'Itt találja a saját profilját, a munkatársait (könyvelő, számvevő), az értesítéseit és a kijelentkezést. Ha több gyülekezethez vagy szerepkörhöz is tartozik, itt válthat közöttük.',
    highlights: [
      'Profil és jelszó',
      'Munkatársak meghívása',
      'Profilváltás több szerepkör esetén',
    ],
    placement: 'bottom',
  },
  {
    id: 'finish',
    emoji: '🙏',
    title: 'Áldás kísérje szolgálatát, {firstName}!',
    description:
      'Készen áll! Mostantól a Kartotéka az Ön segítőtársa a mindennapokban. Kezdje bátran — ha bármi kérdése van, a kérdőjelek és a fejlesztők mindig segítenek. Sok örömöt és áldást a munkájához!',
    placement: 'center',
  },
]
