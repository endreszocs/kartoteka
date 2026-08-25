'use client'

// 2026-08-25: Gyülekezetformák — lépésről lépésre útmutató lelkészeknek.
// Önálló tartalom-komponens: a munkanapló-súgó „Gyülekezetformák" fejezete
// rendereli, de bárhonnan beágyazható (saját wrapper-rel, nem függ a súgó
// keretétől). Az öt szervezeti forma (anya / leány / missziói / társ /
// szórvány), a Kartotéka-beállítás lépései és a gyakori kérdések.
// Kizárólag téma-tokenek (bg-card, bg-muted, text-foreground,
// text-muted-foreground, border-border, text-primary) — nincs hardcode-olt szín.

import { Church, Handshake, HomeIcon, Map, MapPin } from 'lucide-react'

function S({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-heading text-base font-semibold text-foreground mt-6 first:mt-0">
      {children}
    </h4>
  )
}

// Egy szervezeti forma kártyája.
function FormaKartya({
  Icon,
  cim,
  alcim,
  leiras,
  pelda,
}: {
  Icon: React.ComponentType<{ className?: string }>
  cim: string
  alcim: string
  leiras: string
  pelda: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <h5 className="flex items-center gap-2 font-semibold text-foreground">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        {cim}
      </h5>
      <p className="mt-1 text-xs text-muted-foreground">{alcim}</p>
      <p className="mt-2">{leiras}</p>
      <p className="mt-2 text-muted-foreground">
        <strong className="text-foreground">Példa:</strong> {pelda}
      </p>
    </div>
  )
}

// Gyakori kérdés — lenyíló panel.
function Kerdes({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {q}
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
    </details>
  )
}

// „Társegyházközség vagy leányegyházközség?" — páros összevetés. A két forma
// összetévesztése a leggyakoribb hiba: mindkettőnél több település, mindkettőnél
// átjáró lelkész — a különbség az EGYENRANGÚSÁG.
const TARS_LEANY_OSSZEVETES: ReadonlyArray<{
  szempont: string
  tars: string
  leany: string
}> = [
  {
    szempont: 'Alkotás',
    tars: 'Egymással egyenrangú egyházrészek közös egyházközsége — nincs „központ" és „alárendelt".',
    leany: 'Egy anyaegyházközséghez kapcsolódik, annak gondozásában.',
  },
  {
    szempont: 'Presbitérium',
    tars: 'Minden egyházrésznek külön presbitériuma van — helyben intézik a saját ügyeiket.',
    leany: 'Van helyi presbitériuma, de igazgatásban az anyaegyházközséghez kötődik.',
  },
  {
    szempont: 'Lelkész',
    tars: 'Közösen fenntartott lelkészi állás — a lelkész minden társult településen szolgál.',
    leany: 'Az anyaegyházközség lelkipásztora látja el.',
  },
  {
    szempont: 'Viszony',
    tars: 'Együttműködési megállapodás, amelyet az egyházmegyei közgyűlés hagy jóvá.',
    leany: 'Az anyához rendelt szervezeti kapcsolat.',
  },
]

// Mobilon kártyapárként (egymás alatt, mini-címkével), sm-től táblaszerű
// rácsban — kizárólag téma-tokenekkel.
function TarsLeanyOsszevetes() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden gap-x-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold text-foreground sm:grid sm:grid-cols-[6.5rem_1fr_1fr]">
        <span aria-hidden />
        <span>Társegyházközség</span>
        <span>Leányegyházközség</span>
      </div>
      <div className="divide-y divide-border">
        {TARS_LEANY_OSSZEVETES.map((sor) => (
          <div
            key={sor.szempont}
            className="grid grid-cols-1 gap-1.5 bg-card px-4 py-3 sm:grid-cols-[6.5rem_1fr_1fr] sm:gap-x-3"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:pt-0.5">
              {sor.szempont}
            </p>
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-foreground sm:hidden">Társ: </span>
              {sor.tars}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground sm:hidden">Leány: </span>
              {sor.leany}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GyulekezetformakUtmutato() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
      {/* ───── (a) Az öt szervezeti forma ───── */}
      <S>Milyen formában működhet egy egyházközség?</S>
      <p>
        A Romániai Református Egyház törvénytára szerint egy gyülekezet többféle
        szervezeti formában működhet. A forma azt mondja meg, mennyire önálló a
        közösség, és ki gondoskodik róla lelkipásztorilag. Az öt forma:
      </p>

      <div className="space-y-3">
        <FormaKartya
          Icon={Church}
          cim="Anyaegyházközség"
          alcim="Önálló egyházközség saját lelkészi állással"
          leiras="Teljesen önálló gyülekezet: saját lelkésze, presbitériuma és hivatala van. Hozzá kapcsolódhatnak leányegyházközségek és szórványok, amelyeket az ő lelkészi hivatala gondoz."
          pelda="a falu vagy város gyülekezete, ahol a lelkész lakik, és minden vasárnap van istentisztelet."
        />
        <FormaKartya
          Icon={HomeIcon}
          cim="Leányegyházközség"
          alcim="Szervezett gyülekezet, saját lelkészi állás nélkül"
          leiras="Van saját presbitériuma, gyakran temploma is — de lelkipásztori ellátás és egyházigazgatás tekintetében egy anyaegyházközséghez tartozik: a lelkész onnan jár át szolgálni."
          pelda="a szomszéd falu szervezett gyülekezete, ahová kéthetente átjársz istentiszteletet tartani."
        />
        <FormaKartya
          Icon={Map}
          cim="Missziói egyházközség"
          alcim="Több település szórtan élő reformátusai, közös lelkészi állással"
          leiras="Több település kis református közösségei együtt alkotnak egy egyházközséget, közös lelkészi állással és egyházi támogatással. A lelkész sorra járja a településeket."
          pelda="egy vidék öt-hat kis települése együtt tart fenn egy lelkészi állást — a lelkész mindegyikbe rendszeresen kijár."
        />
        <FormaKartya
          Icon={Handshake}
          cim="Társegyházközség"
          alcim="Egyenrangú egyházrészek közös egyházközsége"
          leiras="Két vagy több, egymáshoz közel fekvő település református közösségének KÖZÖS egyházközsége. Nem anya–leány viszony: az egyházrészek egymással egyenrangúak, mindegyiknek külön presbitériuma van (helyben intézik saját ügyeiket), a lelkipásztori állást pedig együttesen tartják fenn — a közös lelkész minden társult településen szolgál. A társegyházközség jogi személy: egyházi és gazdasági ügyekben közösen jár el. Az egyházrészek viszonyát (fenntartási költségek, lelkész-javadalmazás, istentiszteleti rend, közös vagyon) írásos megállapodás rendezi, amelyet az egyházmegyei közgyűlés hagy jóvá."
          pelda="két közeli falu külön templommal és presbitériummal, de egyik sem tudna külön lelkészt fenntartani — egy lelkész szolgál mindkét helyen, pl. vasárnap délelőtt az egyikben, délután a másikban."
        />
        <FormaKartya
          Icon={MapPin}
          cim="Szórvány"
          alcim="Kis közösség — nem önálló egyházközség"
          leiras="Kis létszámú református közösség, amely nem alkot önálló egyházközséget: egy kijelölt anyaegyházközség gondozza. A kijelölést az egyházmegye javasolja, és a kerületi közgyűlés erősíti meg."
          pelda="egy kis közösség a szomszéd faluban, ahol havonta egyszer van istentisztelet — ez tipikusan szórvány."
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="font-semibold text-foreground">
          Fejlődési út: szórvány → leányegyházközség → anyaegyházközség
        </p>
        <p className="mt-1">
          Ha egy közösség megerősödik, előreléphet a következő formába. Ehhez a
          való életben egyházmegyei javaslat és kerületi jóváhagyás kell — a
          Kartotékában pedig a rendszergazda vezeti át a hivatalos formát
          (a változás dátuma a naplóból később is visszakereshető).
        </p>
      </div>

      {/* ───── Társegyházközség vagy leányegyházközség? ───── */}
      <S>Társegyházközség vagy leányegyházközség?</S>
      <p>
        Mindkettőnél több település, mindkettőnél „átjáró" lelkész — a döntő
        különbség az <strong>egyenrangúság</strong>: a társegyházközségben nincs
        anya és alárendelt, a leányegyházközség viszont mindig egy
        anyaegyházközséghez tartozik.
      </p>
      <TarsLeanyOsszevetes />

      {/* ───── (b) Beállítás lépésről lépésre ───── */}
      <S>Hogyan állítsd be a Kartotékában — lépésről lépésre</S>
      <p>
        A kapcsolt közösségek (leány, szórvány) <strong>nem külön
        Kartoték-fiókok</strong>: minden adat az anyaegyházközség közös
        kartotékájában marad, az egységek csak címkék. Így egy helyen dolgozol,
        nem kell fiókot váltanod — a rendszer mégis tudja, mi hol történt.
      </p>
      <ol className="list-decimal pl-5 space-y-2">
        <li>
          <strong>Beállítod a szervezeti formát</strong> a Gyülekezet-beállító
          varázsló „Áttekintés és alapadatok” paneljén — leányegyházközségnél
          az anyaegyházközség kiválasztásával. A rendszergazda a Szervezeti
          fán ugyanezt kezeli, és vitás besorolásnál felülbírál (minden
          módosítás naplózott).
        </li>
        <li>
          <strong>Felveszed az egységeket</strong> a Gyülekezet-beállító
          varázsló „Egységek" paneljén: minden leány- és szórványközösségnek
          adsz egy nevet és típust (pl. „Páva — leányegyházközség",
          „Kovászna-szórvány"). Az anyaközpontot nem kell felvenni.{' '}
          <strong>Társegyházközségnél</strong> az egyházrészeket „Egyházrész"
          típusú egységként vedd fel — ott mindegyik település saját egységet
          kap, mert nincs kitüntetett központ.
        </li>
        <li>
          <strong>Besorolod a tagokat</strong>: tömegesen település szerint a
          Tagnyilvántartásban („minden X faluban lakó tag → Y egység"), vagy
          egyénileg a személyi kartonon. Akit nem sorolsz be, az automatikusan
          az anyaközponthoz számít.
        </li>
        <li>
          <strong>A munkanaplóban rögzítéskor megjelölöd a helyszínt</strong> —
          a helyszín-választó csak akkor jelenik meg, ha van egységed; üresen
          hagyva az alkalom az anyaközponthoz számít.
        </li>
        <li>
          <strong>A lelkészi jelentés „Gyülekezetenkénti bontás" táblája
          magától összeáll</strong> a címkékből. Ha a naplózás év közben
          indult, a bontás hiányos lehet — az érintett cella ilyenkor üresen
          marad (nem hamis nulla), és kézzel pótolhatod; minden cella
          felülírható.
        </li>
        <li>
          <strong>Nyomtatod a fekvő A4 mellékletet</strong> a jelentés mellé —
          az egyházmegyének beküldött hivatalos űrlap változatlan marad, a
          bontás külön lapon kerül mellé.
        </li>
      </ol>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="font-semibold text-foreground">A legfontosabb elv</p>
        <p className="mt-1">
          Az egység-címke nélküli adat mindig az <strong>anyaközponthoz</strong>{' '}
          számít. Ezért a korábbi éveid adatai visszamenőleg is helyesek, és
          semmi nem romlik el, ha valamit nem címkézel meg — legfeljebb a
          bontás lesz kevésbé részletes. <strong>Társegyházközségnél</strong>{' '}
          nincs kitüntetett központ: ott a címke nélküli adat a{' '}
          <strong>közös</strong> (az egész egyházközséget érintő) tételt
          jelenti.
        </p>
      </div>

      {/* ───── (c) Gyakori kérdések ───── */}
      <S>Gyakori kérdések</S>
      <div className="space-y-2">
        <Kerdes
          q="Mikor legyen külön Kartoték-fiókja a leányegyházközségnek?"
          a="Csak akkor, ha ténylegesen önállóan adminisztrál: saját felhasználói vannak, saját munkanaplót és tagnyilvántartást vezet. Ha — mint a legtöbb helyen — az anyaegyházközség lelkészi hivatala intéz mindent, akkor egység-címkeként vedd fel: így minden egy közös kartotékban marad, és nem kell fiókot váltanod."
        />
        <Kerdes
          q="Mi történik, ha nem címkézek semmit?"
          a="Semmi baj: minden adat az anyaközponthoz számít, az összesítések és a hivatalos lelkészi jelentés ugyanúgy helyesek maradnak. Csak a gyülekezetenkénti bontás oszlopai maradnak üresen — azokat kézzel is kitöltheted, ha szükséged van rájuk."
        />
        <Kerdes
          q="Mi lesz az egység törlésekor?"
          a="A hozzá tartozó címkék az anyaközpontra esnek vissza, és az egység oszlopa eltűnik a bontásból. Ezért törlés helyett inkább inaktiváld az egységet: úgy az új rögzítőkben már nem ajánlja fel a rendszer, de a korábbi évek bontása visszanézhető marad."
        />
        <Kerdes
          q="Hogyan lesz a szórványból leányegyházközség?"
          a="A való életben egyházmegyei javaslat és kerületi közgyűlési jóváhagyás kell hozzá. Utána a Kartotékában a rendszergazda átvezeti a hivatalos formát, te pedig az egység típusát állítod át szórványról leányra — a korábbi adatok és címkék mind megmaradnak."
        />
        <Kerdes
          q="Egyeznie kell-e a bontásnak a hivatalos űrlappal?"
          a="A bontás-tábla Kartotéka-többlet (belső használatra és vizitációra), az egyházmegyének beküldött hivatalos űrlap nem változik. Az automatikusan számolt soroknál az Összesen oszlop magától megegyezik a fő jelentéssel; kézzel kitöltött celláknál a rendszer jelzi, ha az oszlopok összege eltér a fő jelentés rovatától."
        />
        <Kerdes
          q="Mi a különbség a társegyházközség és a leányegyházközség között?"
          a="A leányegyházközség egy anyaegyházközséghez kapcsolódik: van saját presbitériuma, de a lelkipásztori ellátást és az egyházigazgatást az anya végzi. A társegyházközségben nincs anya: két vagy több egyenrangú egyházrész közösen tart fenn egy lelkészi állást, mindegyiknek külön presbitériuma van, a viszonyukat pedig az egyházmegyei közgyűlés által jóváhagyott írásos megállapodás rendezi. A Kartotékában a társegyházközség egy közös kartoték, az egyházrészek „Egyházrész” típusú egységek."
        />
        <Kerdes
          q="Missziói egyházközség vagyunk — mit vegyek fel egységnek?"
          a="A gondozott településeket vedd fel szórvány típusú egységként; a központi település marad az anyaközpont. Így a bontásban településenként látod az alkalmakat, a tagokat és a perselypénzt."
        />
      </div>
    </div>
  )
}
