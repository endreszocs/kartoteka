/**
 * Walkthrough step definíciók — interaktív dashboard túra új lelkésznek.
 *
 * Minden step:
 *  - id: egyedi azonosító
 *  - target: CSS selector az érintett DOM elem felé (ha undefined, középen lebegő)
 *  - title: rövid szlogen
 *  - description: 1-2 mondatos magyarázat, pásztorális hangvétellel
 *  - placement: hova helyezkedjen el a tooltip a target-hez képest
 *
 * A target-ek a dashboard komponensekben `data-walkthrough="<slug>"` attribútummal
 * vannak megjelölve.
 */

export interface WalkthroughStep {
  id: string
  target?: string
  title: string
  description: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

// `{firstName}` helyettesítő — a kliensoldalon cseréljük a lelkész keresztnevére
export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'Üdvözlöm, {firstName}!',
    description:
      'Egy rövid körbenézést ajánlok — kb. 90 másodperc alatt megmutatom, hol találja a legfontosabb eszközöket. Bármikor kihagyhatja.',
    placement: 'center',
  },
  {
    id: 'sidebar',
    target: '[data-walkthrough="sidebar"]',
    title: 'Navigáció',
    description:
      'Itt találja a rendszer összes modulját — pénzügy, tagnyilvántartás, anyakönyv, munkanapló és a többi.',
    placement: 'right',
  },
  {
    id: 'tagnyilvantartas',
    target: '[data-walkthrough="menu-tagnyilvantartas"]',
    title: 'Tagnyilvántartás',
    description:
      'A gyülekezet tagjai, családjai, presbiterjei és választói egy helyen. Itt rögzítheti az új tagokat.',
    placement: 'right',
  },
  {
    id: 'anyakonyv',
    target: '[data-walkthrough="menu-anyakonyv"]',
    title: 'Anyakönyv',
    description:
      'Keresztelések, konfirmációk, esketések, temetések — mind egy modulban. Az okiratszámozást a rendszer automatikusan kezeli.',
    placement: 'right',
  },
  {
    id: 'penzugy',
    target: '[data-walkthrough="menu-penzugy"]',
    title: 'Pénzügy',
    description:
      'Bevételek, kiadások, költségvetés, számadás, banki kivonatok, Oblio / e-Factura — a rendszer legrészletesebb modulja.',
    placement: 'right',
  },
  {
    id: 'munkanaplo',
    target: '[data-walkthrough="menu-munkanaplo"]',
    title: 'Munkanapló',
    description:
      'A lelkészi szolgálat személyes naplója: istentiszteletek, családlátogatások, bibliaórák. Az anyakönyvi bejegyzések automatikusan ide is bekerülnek (ha bejelöli).',
    placement: 'right',
  },
  {
    id: 'dashboard-widgets',
    target: '[data-walkthrough="dashboard-widgets"]',
    title: 'Gyors áttekintés',
    description:
      'A kezdőoldalon látja a legfontosabb számokat — aktív tagok, éves bevétel, közelgő programok. Minden kártya kattintható.',
    placement: 'top',
  },
  {
    id: 'help-tooltips',
    target: '[data-walkthrough="help-indicator"]',
    title: 'Segítség kérdőjelei',
    description:
      'A modulok mellett kis kérdőjeleket talál (?) — rájuk kattintva bővebb magyarázatot kap az adott funkcióról.',
    placement: 'bottom',
  },
  {
    id: 'profile',
    target: '[data-walkthrough="user-menu"]',
    title: 'Fiókbeállítások',
    description:
      'A saját profilja, kapcsolatai (könyvelő, számvevő), értesítések és kijelentkezés — mind innen érhető el.',
    placement: 'bottom',
  },
  {
    id: 'finish',
    title: 'Áldás kísérje szolgálatát, {firstName}!',
    description:
      'Ezzel a túra véget ért. Bármikor újraindíthatja a Profil beállításokban. Sok sikert és áldást a Kartotéka használatához!',
    placement: 'center',
  },
]
