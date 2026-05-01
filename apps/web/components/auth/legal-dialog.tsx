'use client'

/**
 * LegalDialog — Adatvédelem / ÁSZF / Súgó / Kapcsolat tartalmak
 * egyetlen komponensben.
 *
 * A bejelentkezés (`(auth)/layout.tsx`) és a hozzáférés-kérő
 * (`(public)/hozzaferes-kerese/page.tsx`) oldal footer-éből nyitható,
 * valamint az `AccessRequestForm` "elolvastam" pipa-link-jeiből.
 *
 * A hangvétel megnyugtató, lelkipásztorbarát; minden szakkifejezés
 * és rövidítés magyarázattal van. Adatkezelő és rendszergazda is
 * Szőcs Endre református lelkipásztor; szellemi alap: Beke Tivadar
 * egyházi nyilvántartási rendszere.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookOpen, Mail, Shield, ScrollText } from 'lucide-react'

export type LegalKind = 'privacy' | 'terms' | 'help' | 'contact'

interface LegalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: LegalKind
}

const TITLES: Record<LegalKind, string> = {
  privacy: 'Adatvédelmi tájékoztató',
  terms: 'Általános Szerződési Feltételek',
  help: 'Súgó és gyakori kérdések',
  contact: 'Kapcsolat',
}

const ICONS: Record<LegalKind, typeof Shield> = {
  privacy: Shield,
  terms: ScrollText,
  help: BookOpen,
  contact: Mail,
}

export function LegalDialog({ open, onOpenChange, kind }: LegalDialogProps) {
  const Icon = ICONS[kind]
  const title = TITLES[kind]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-xl"
              style={{
                background: 'rgba(74, 135, 98, 0.1)',
                border: '1px solid rgba(74, 135, 98, 0.25)',
                color: '#275638',
              }}
              aria-hidden
            >
              <Icon className="size-5" strokeWidth={1.6} />
            </span>
            <span className="font-heading text-xl">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="kt-legal-content space-y-3 text-[14px] leading-relaxed text-slate-700">
          {kind === 'privacy' && <PrivacyContent />}
          {kind === 'terms' && <TermsContent />}
          {kind === 'help' && <HelpContent />}
          {kind === 'contact' && <ContactContent />}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button onClick={() => onOpenChange(false)}>Bezárás</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ================== KÖZÖS UI ================== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 font-heading text-[16px] font-semibold text-slate-900">
      {children}
    </h3>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="my-3 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
      style={{
        background: 'rgba(74, 135, 98, 0.08)',
        border: '1px solid rgba(74, 135, 98, 0.2)',
        color: '#275638',
      }}
    >
      {children}
    </div>
  )
}

function Term({ word, def }: { word: string; def: string }) {
  return (
    <p className="text-[13px] text-slate-600">
      <strong className="text-slate-900">{word}</strong> = {def}
    </p>
  )
}

/* ================== ADATVÉDELEM ================== */

function PrivacyContent() {
  return (
    <>
      <p>
        Kedves Lelkipásztor Testvérünk! Köszönjük, hogy a Kartotéka rendszert választotta a
        gyülekezet életének nyilvántartásához. A jelen tájékoztató a <em>Te</em>, a gyülekezet
        és a gondozott családok adatainak biztonságos kezeléséről szól. Igyekeztünk laikus,
        közérthető nyelvet használni — a szakkifejezéseket az első előforduláskor mindig
        megmagyarázzuk.
      </p>

      <Note>
        <strong>Bátorítás:</strong> a Kartotéka rendszer a digitális adatkezelés egyik
        legbiztonságosabb formája, amelyet a református egyházi életre szabva állítottunk össze.
        Aki használja, a gyülekezet adatait olyan védelemben részesíti, ami nemzetközi banki
        szabványoknak felel meg — miközben mindezt szabad szívvel és nyugodt lelkiismerettel
        teheti.
      </Note>

      <SectionTitle>1. Ki kezeli az adatokat?</SectionTitle>
      <p>
        Az <strong>adatkezelő</strong> és egyben a <strong>rendszergazda</strong> is{' '}
        <strong>Szőcs Endre református lelkipásztor</strong> — ő építi és gondozza a Kartotékát,
        ő felügyeli a hozzáféréseket, és Hozzá lehet fordulni minden kérdéssel.
      </p>
      <Term
        word="Adatkezelő"
        def="az a személy vagy szervezet, aki eldönti, hogy egy adatot mire és hogyan használunk fel. A Kartotéka esetében ez a személy Szőcs Endre lelkipásztor."
      />
      <Term
        word="Rendszergazda"
        def="aki a rendszert technikailag karbantartja, frissíti, és segít, ha valami nem működik. A Kartotéka esetében szintén Szőcs Endre lelkipásztor."
      />

      <SectionTitle>2. A rendszer szellemi alapja</SectionTitle>
      <p>
        A Kartotéka rendszer szellemi alapja{' '}
        <strong>Beke Tivadar</strong> egyházi nyilvántartási rendszere — ezt a kézzel készített,
        jól bevált rendet fejlesztette tovább digitális formába a rendszergazda. Ez azt jelenti,
        hogy a rendszer logikája és a nyomtatványok a református egyházi gyakorlathoz illenek,
        nem egy gyári „dobozos" megoldás.
      </p>

      <SectionTitle>3. Hol vannak az adatok? (a „felhő")</SectionTitle>
      <p>
        Az adatok egy <strong>biztonságos európai adatközpontban</strong> tárolódnak,
        Frankfurtban (Németország), egy <em>Supabase</em> nevű szolgáltatáson keresztül.
      </p>
      <Term
        word="Felhő (cloud)"
        def={'távoli, professzionális szervergép, ahol az adatok tárolva vannak. Olyan, mint egy „távoli iratszekrény" — biztonságos épületben, kettős zárral, riasztóval.'}
      />
      <Term
        word="Supabase"
        def="egy ismert, európai jogi szabályoknak megfelelő technológiai szolgáltató. Ők tartják fent a szervert, mi viszont a teljes adatot titkosítva küldjük át — ők sem látják belülről."
      />
      <Note>
        <strong>Miért jó ez Önnek?</strong> Mert így nem kell papírdobozokban őrizni az
        anyakönyvet, nem ázik be, nem lopható el, nem menthető le illetéktelenül USB-re, és
        bárhonnan elérhető — például egy vasárnapi szolgálat előtt mobilon ellenőrizhető a
        családi háttér.
      </Note>

      <SectionTitle>4. Mire használjuk az adatokat?</SectionTitle>
      <p>
        Kizárólag a <strong>gyülekezet egyházi életének</strong> támogatására:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Tagnyilvántartás</strong> — ki tartozik a gyülekezethez, hol lakik, mi a kapcsolata
          a többi családtaggal</li>
        <li><strong>Anyakönyv</strong> — keresztelési, házassági, temetési, konfirmációs események
          rögzítése (ez egyházi kötelezettség is)</li>
        <li><strong>Egyházi járulék (perselypénz, hozzájárulás)</strong> — éves nyilvántartás, ki
          mennyit tett le a közös szolgálatra</li>
        <li><strong>Pasztorális látogatás</strong> — kit, mikor és milyen lelki ügyben látogatott meg
          a lelkész (csak a lelkész látja)</li>
        <li><strong>Programok és események</strong> — istentiszteletek, alkalmak, jubileumok</li>
        <li><strong>Sírhelyek</strong> — temető-nyilvántartás</li>
      </ul>
      <Note>
        Az adatokat <strong>marketingre, hirdetésre, harmadik fél részére</strong> SOHA nem
        adjuk át, és nem értékesítjük. A Kartotéka nem reklámozó vállalkozás — egyházi szolgálat.
      </Note>

      <SectionTitle>5. Milyen jogi alapon kezeljük az adatokat?</SectionTitle>
      <p>
        Két jogi alapra támaszkodunk, mindkettő <em>az érintett védelmét szolgálja</em>:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>GDPR 9. cikk (2) bekezdés d) pontja</strong> — az európai adatvédelmi rendelet
          kifejezetten megengedi a vallási közösségeknek, hogy a tagjaik adatait kezelhessék.
        </li>
        <li>
          <strong>Romániai 190/2018. sz. törvény</strong> — ez Romániában a GDPR helyi
          végrehajtási szabálya. Tehát a romániai bíróságok ugyanazt a jogot védik nálunk is.
        </li>
      </ul>
      <Term
        word="GDPR"
        def={'„General Data Protection Regulation" — az Európai Unió 2016/679-es rendelete, amely 2018 óta hatályos. Azért született, hogy a polgárok adatait minden uniós országban azonos szigorral védjék. Magyarul „Általános Adatvédelmi Rendelet".'}
      />

      <SectionTitle>6. Milyen adatokat kezelünk pontosan?</SectionTitle>
      <p>A gyülekezeti életéhez szükséges mértékben, és nem többet:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Név (előtag, vezetéknév, keresztnév, leánykori név)</li>
        <li>Születési hely, dátum, anyja neve</li>
        <li>Lakcím, postázási cím</li>
        <li>Telefonszám, e-mail cím (ha van)</li>
        <li>Vallási hovatartozás (református, áttért, kilépett stb.)</li>
        <li>Családi állapot, házastárs, gyermekek</li>
        <li>Egyházi események: keresztelés, konfirmáció, házasság, temetés (időpont, helyszín,
          szolgáló lelkész)</li>
        <li>Foglalkozás (csak akkor, ha ezt önként megadta)</li>
        <li>Egyházi járulék éves összege</li>
        <li>Belépés időpontja, kilépés időpontja</li>
      </ul>

      <SectionTitle>7. Hogyan védjük az adatokat? (a biztonsági rétegek)</SectionTitle>
      <p>
        A Kartotéka <strong>több, egymásra épülő biztonsági réteget</strong> használ. Ezek
        ugyanolyanok, mint amit a banki rendszerek alkalmaznak:
      </p>
      <Term
        word="TLS 1.3 titkosítás"
        def={'„Transport Layer Security" — minden alkalommal, amikor az Ön gépe és a szerver beszélget, az adatokat egy „digitális borítékba" zárjuk. Ezt a borítékot csak a két fél tudja kinyitni — útközben senki más nem tudja elolvasni, akkor sem, ha nyilvános Wi-Fi-n van.'}
      />
      <Term
        word="Row Level Security (RLS)"
        def={'„sor-szintű biztonság" — a szervergép minden egyes lekérdezésnél ellenőrzi, hogy az adott felhasználó tényleg jogosult-e látni az adott sort (pl. egy tagot, egy családot). Ha nem, automatikusan üres választ ad.'}
      />
      <Term
        word="Szerepkör-alapú jogosultság (RBAC)"
        def={'„Role-Based Access Control" — minden felhasználónak van egy szerepköre (pl. lelkész, esperes, könyvelő), és csak azt látja, amit a szerepköre megenged. Egy könyvelő nem látja a pasztorális jegyzeteket; egy gondnok nem látja a pénzügyi adatokat.'}
      />
      <Term
        word="Kétfaktoros hitelesítés (2FA)"
        def={'„Two-Factor Authentication" — ahol érzékeny műveletet végzünk (pl. rendszergazdai módváltás), ott a jelszó mellett egy másik megerősítés is kell (pl. e-mailre küldött kód). Így ha egy jelszó valahogy mégis kiszivárogna, akkor sem lehet visszaélni vele.'}
      />
      <Term
        word="Naplózás"
        def="minden érzékeny művelet (pl. ki látta meg az adatot, ki módosította) rögzítve van egy elszámolási naplóban. Ez azt jelenti, hogy ha valaha kérdés merülne fel, percre pontosan megmondható, ki, mit, mikor csinált. Soha nem törölhető."
      />
      <Note>
        <strong>Az adatok napi szinten mentésre kerülnek</strong> — ha bármi történne (vírus,
        hardverhiba, emberi tévedés), 24 órán belül vissza tudjuk állítani azokat egy
        biztonsági mentésből. Ez sokkal biztonságosabb, mint a papír — egy elveszett füzetből
        nem lehet visszaállítani semmit.
      </Note>

      <SectionTitle>8. Ki láthatja az adatokat?</SectionTitle>
      <p>
        Csak az, akinek hozzáférése van — és aki a saját gyülekezetének adatait nézheti.
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>A gyülekezet lelkésze</strong> — a saját gyülekezete teljes adatát</li>
        <li><strong>A kerületi/egyházmegyei adminisztrátor</strong> — összesített, statisztikai
          adatokat (pl. „hány keresztelés volt egy évben")</li>
        <li><strong>Könyvelő</strong> — csak a pénzügyi adatokat, csak az ő gyülekezetéből</li>
        <li><strong>Számvevő</strong> — szintén csak pénzügyi és csak ellenőrzési időszakban</li>
        <li><strong>Rendszergazda (Szőcs Endre)</strong> — csak technikai gondnál, a lelkész
          előzetes engedélyével, időkorláttal és <em>naplózással</em></li>
      </ul>
      <Note>
        Ha egy gyülekezeti tag rákérdez: „ki látta az adataimat?" — bármikor pontos választ
        tudunk adni, mert minden hozzáférés naplózva van.
      </Note>

      <SectionTitle>9. Meddig őrizzük az adatokat?</SectionTitle>
      <p>
        Az <strong>egyházi anyakönyvi adatokat</strong> (keresztelés, házasság, temetés) az
        egyházi rend szerint <strong>tartósan</strong> megőrizzük — éppúgy, ahogy a régi
        kézzel írott anyakönyvek 100-200 éve fennmaradnak. Ez egyházi öröksége a református
        közösségnek.
      </p>
      <p>
        A többi személyes adatot addig őrizzük, ameddig a tagsági viszony fennáll, plusz egy
        ésszerű idő (pl. ha valaki visszaköltözik egy év múlva). Amikor egy adatra már nincs
        szükség, a rendszergazda kéréskor törli vagy archiválja.
      </p>

      <SectionTitle>10. Milyen jogai vannak Önnek és a tagoknak?</SectionTitle>
      <p>A GDPR az érintetteknek (nálunk: a tagoknak és a hozzátartozóknak) <strong>hat alapvető jogot</strong> ad:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Tájékoztatás</strong> — bárki kérheti, milyen adatait kezeljük</li>
        <li><strong>Hozzáférés</strong> — kikérheti az ő rá vonatkozó adatok másolatát</li>
        <li><strong>Helyesbítés</strong> — ha valami téves, kéri a javítást</li>
        <li><strong>Törlés</strong> — bizonyos esetekben kérheti az adat törlését (egyházi
          anyakönyvi adatoknál ez korlátozott, mert egyházi rend szerint őrizzük)</li>
        <li><strong>Korlátozás</strong> — kérheti, hogy átmenetileg ne kezeljük az adatát</li>
        <li><strong>Tiltakozás</strong> — kérheti a kezelés leállítását</li>
      </ul>
      <p>
        Ezeket a kéréseket a <em>Kapcsolat</em> menüpontban megadott csatornákon át lehet
        leadni; általában 30 napon belül válaszolunk.
      </p>

      <SectionTitle>11. Mit tegyen, ha úgy érzi, valami nem stimmel?</SectionTitle>
      <p>
        Ha bármilyen aggálya van az adatkezelés körül:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>Először <strong>a rendszergazdához</strong> (Szőcs Endre lelkipásztorhoz) forduljon —
          a legtöbb félreértés egy beszélgetéssel tisztázható</li>
        <li>Ha úgy érzi, nem kapott megfelelő választ, panaszt tehet a romániai{' '}
          <strong>ANSPDCP</strong>-nél (a hatóság teljes nevét és címét a Kapcsolat-pontban
          olvassa)</li>
      </ol>

      <SectionTitle>12. Felelősségi nyilatkozat</SectionTitle>
      <p>
        Tisztelettel közöljük, hogy a Kartotéka rendszert <em>úgy ahogy van</em> állítjuk
        rendelkezésre — a tőlünk telhető legnagyobb gondossággal építettük és tartjuk karban.
        A rendszergazda (Szőcs Endre lelkipásztor) és a szellemi alapot adó személy (Beke
        Tivadar) <strong>nem vállal felelősséget</strong> az alábbiakból eredő esetleges
        károkért:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>A felhasználó által hibásan bevitt vagy elmulasztott adatok</li>
        <li>Internetes szolgáltató, áramkimaradás vagy harmadik fél hibája</li>
        <li>Természeti csapás, kibertámadás, hatósági intézkedés (vis maior)</li>
        <li>A használatból eredő közvetett vagy következményi kár</li>
      </ul>
      <p>
        Az adatok <strong>tartalmi pontosságáért</strong> az adott gyülekezet lelkésze felel —
        éppúgy, mint a papír-anyakönyv esetében. Ez nem új követelmény, csak digitálisan jelenik meg.
      </p>

      <Note>
        <strong>Köszönet:</strong> azzal, hogy ezt a tájékoztatót végigolvasta, már most
        biztosabb kezekben vannak a gyülekezet adatai. Isten áldása kísérje a szolgálatát!
      </Note>
    </>
  )
}

/* ================== ÁSZF ================== */

function TermsContent() {
  return (
    <>
      <p>
        Kedves Lelkipásztor Testvérünk! Az alábbi szabályok segítenek abban, hogy mindenki
        számára <strong>egyértelmű és békés</strong> legyen a Kartotéka rendszer használata.
        Igyekszünk röviden és közérthetően leírni — minden szakkifejezést megmagyarázunk.
      </p>

      <Term
        word="ÁSZF"
        def={'„Általános Szerződési Feltételek" — egy közös megegyezés a rendszer üzemeltetője és a felhasználó között. Olyan, mint egy lelki segédkönyv: leírja, mire számíthat, és mit várunk Öntől.'}
      />

      <Note>
        <strong>Bátorítás:</strong> ne ijedjen meg a jogi nyelvezettől — a Kartotéka egy{' '}
        <em>egyházi szolgálati eszköz</em>. Ezeket a feltételeket kifejezetten azért írtuk meg,
        hogy Ön nyugodtan, jó lelkiismerettel használhassa, és a gyülekezet is tudja, hogy
        minden átlátható. Minden gyülekezetnek <em>áldás</em> lehet, ha helyesen használjuk.
      </Note>

      <SectionTitle>1. Mi a Kartotéka rendszer?</SectionTitle>
      <p>
        A Kartotéka egy <strong>egyházi nyilvántartó program</strong>, amelyet a református
        gyülekezeti élet támogatására fejlesztettünk. Tagnyilvántartást, anyakönyvet, pénzügyet,
        anyakönyvi eseményeket, programokat, sírhelyeket és lelkészi munkanaplót egyaránt
        kezel.
      </p>
      <p>
        <strong>Üzemeltető és rendszergazda:</strong> Szőcs Endre református lelkipásztor.{' '}
        <strong>Szellemi alap:</strong> Beke Tivadar egyházi nyilvántartási rendszerének
        digitális továbbfejlesztése.
      </p>

      <SectionTitle>2. Hogyan kap valaki hozzáférést?</SectionTitle>
      <p>
        A rendszer használatához <strong>kerületi jóváhagyás</strong> szükséges. Ez azt jelenti,
        hogy a rendszergazda (Szőcs Endre lelkipásztor) ellenőrzi, hogy Ön valóban jogosult-e
        a megjelölt szerepkörre — például egy lelkészi hozzáférést csak az adott gyülekezet
        jelenlegi lelkésze kaphat meg.
      </p>
      <Term
        word="Kerületi jóváhagyás"
        def="az Erdélyi Református Egyházkerület (EREK) szervezeti szintjén történő ellenőrzés. Nem egy idegen hatóság — a saját egyházszervezete biztosítja, hogy csak az illetékes személy férjen az adatokhoz."
      />
      <p>
        A jóváhagyás általában <strong>1–3 munkanap</strong>. Sürgős esetben (pl. átvétel
        egy elhunyt lelkész utódaként) gyorsított ügyintézést is biztosítunk — a Kapcsolat-on
        keresztül lehet jelezni.
      </p>

      <SectionTitle>3. A szolgáltatás díjazása</SectionTitle>
      <p>
        A Kartotéka rendszer használati díjáról és feltételeiről az EREK-gyülekezetek a
        kerületi adminisztratív csatornákon keresztül kapnak részletes tájékoztatást.
        A rendszergazda a szolgáltatás működtetésével és karbantartásával kapcsolatos
        kérdésekben mindig a gyülekezetek mellett áll.
      </p>

      <SectionTitle>4. Mire kéri Önt a rendszer?</SectionTitle>
      <p>A felhasználó kötelezettségei egyszerűek és tiszták:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Csak egyházi célra</strong> használja a rendszert — szolgálati feladatok
          támogatására, gyülekezeti élet nyilvántartására.</li>
        <li><strong>Pontosan adja be az adatokat.</strong> Egy elgépelt cím, egy rossz dátum
          ugyanúgy okozhat problémát digitálisan, mint a papíron.</li>
        <li><strong>Tartsa titokban a jelszavát.</strong> Senkinek ne adja át, és kerülje az olyan
          jelszavakat, amik könnyen kitalálhatók (név, születési dátum). Évente cserélje le.
          Ha egyszer „lehullott a kalap" (pl. valaki belesett a vállra), nyugodtan változtasson
          jelszót.</li>
        <li><strong>Ha gyanús dolgot tapasztal</strong> (pl. ismeretlen bejelentkezési kísérlet
          e-mailben), <strong>azonnal jelezze a rendszergazdának</strong>. Nem zavaró kérdés —
          jobb egyszer feleslegesen szólni, mint bajba kerülni.</li>
        <li><strong>Tilos megkerülni a biztonsági mechanizmusokat</strong> — pl. más
          szerepkörrel próbálni belépni, harmadik személynek adatot „kifolyatni".</li>
      </ul>

      <SectionTitle>5. Mit tehet az üzemeltető?</SectionTitle>
      <p>
        Az üzemeltető (Szőcs Endre lelkipásztor) jogosult:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Karbantartási időszakra <strong>időszakosan elérhetetlenné tenni</strong> a rendszert
          (általában éjszaka, vagy hétvégén — előzetes értesítéssel)</li>
        <li>A hozzáférést <strong>azonnali hatállyal felfüggeszteni</strong>, ha valaki a
          szabályokat megszegi (pl. visszaél az adatokkal, vagy egyházi rendet sért)</li>
        <li>A rendszert <strong>fejleszteni, módosítani</strong> — új modulokat, javításokat
          beépíteni</li>
      </ul>

      <SectionTitle>6. „Úgy, ahogy van" — az „<em>as is</em>" elv</SectionTitle>
      <Term
        word='"As is" (úgy, ahogy van)'
        def={'ez egy nemzetközi jogi kifejezés. Azt jelenti, hogy a szolgáltatás a jelenlegi formájában érhető el — minden feature-rel és minden korláttal együtt. Nem ígérünk olyat, amit nem tudunk garantálni (pl. „soha semmi nem fog elromlani"), de a tőlünk telhető legjobban gondozzuk.'}
      />
      <p>
        Ez nem azt jelenti, hogy felelőtlenül építjük — ellenkezőleg. De a digitális világban
        100%-os garancia nincs, ezért ezt kifejezetten leírjuk: <em>az interneten alapvetően
        nincs olyan rendszer, amit ne lehetne valamilyen módon megbontani</em>. Mi mindent
        megteszünk, ami emberileg lehetséges, de vis maior esetén (lásd alább) a felelősség
        korlátozott.
      </p>

      <SectionTitle>7. Felelősség-kizárás</SectionTitle>
      <p>
        A rendszergazda (Szőcs Endre lelkipásztor) és a szellemi alapot adó személy (Beke
        Tivadar) <strong>nem vállal felelősséget</strong>:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A felhasználó által rosszul beadott vagy hiányos adatok következményeiért</li>
        <li>A felhasználó által okozott adatvesztésért, adatmódosításért</li>
        <li>Harmadik fél (pl. internet-szolgáltató, áramszolgáltató) miatti
          szolgáltatáskiesésért</li>
        <li>Vis maior okozta károkért (lásd lent)</li>
        <li>A rendszer használatából eredő közvetett vagy következményi károkért</li>
      </ul>
      <Term
        word="Vis maior"
        def={'latin: „nagyobb erő". Olyan helyzet, amit emberi módon nem lehet befolyásolni — pl. földrengés, tűzvész, háború, járvány, hatósági lezárás, kibertámadás. A jog elismeri, hogy ilyen esetekben senki nem felel azért, ami elromlik.'}
      />
      <p>
        A felelősség mértékét a vonatkozó jogszabályok és a szolgáltatás jellege szerint
        a lehető legkisebbre korlátozzuk. Az üzemeltető és a szellemi alapot adó személy
        felelőssége — amennyiben a jog ezt megengedi — minden esetben a vonatkozó
        szerződéses keretek által meghatározott mértékre szorítkozik.
      </p>

      <SectionTitle>8. Adatvédelem</SectionTitle>
      <p>
        Az adatok kezelésének részletes szabályait külön <strong>Adatvédelmi tájékoztatóban</strong>{' '}
        írtuk le. Kérjük, azt is olvassa végig — ott szerepel minden, amire egy gyülekezeti
        adattal kapcsolatban szüksége lehet.
      </p>

      <SectionTitle>9. Szellemi tulajdon</SectionTitle>
      <p>
        A Kartotéka rendszer kódja, dizájnja és dokumentációja a fejlesztő (Szőcs Endre)
        szellemi tulajdona. Az EREK-gyülekezetek <strong>használati jogot</strong> kapnak —
        ez azt jelenti, hogy szabadon használhatják a saját gyülekezetükben, de a rendszert
        nem értékesíthetik tovább, nem másolhatják le más célra.
      </p>
      <p>
        A „Kartotéka" elnevezés és a rendszer egyházi szellemi alapja{' '}
        <strong>Beke Tivadar</strong> munkájára vezethető vissza. Az ő úttörő rendszerét
        tisztelettel megőrizzük és digitális formába öntjük.
      </p>

      <SectionTitle>10. Az ÁSZF módosítása</SectionTitle>
      <p>
        Az élet változik — új technológiák, új törvények érkeznek, új igények születnek.
        Ezért az ÁSZF-et időről-időre módosíthatjuk. Minden lényeges változásról{' '}
        <strong>előzetesen tájékoztatjuk</strong> a felhasználókat (pl. e-mailben vagy a
        rendszerbe lépéskor megjelenő üzenetben). Ha a változás után tovább használja a
        rendszert, az az új ÁSZF elfogadását jelenti — éppúgy, mint amikor egy új zsoltáros
        könyvet vesz használatba.
      </p>

      <SectionTitle>11. Joghatóság</SectionTitle>
      <p>
        A jelen ÁSZF-re a <strong>Romániai jog</strong> vonatkozik. Ha bármilyen vita lenne
        — amit nem szeretnénk, és reményeink szerint sosem fordul elő —, a felek először{' '}
        <strong>békés úton</strong> próbálják rendezni. Ha ez nem sikerül, akkor az illetékes
        romániai bíróság rendelkezik joghatósággal.
      </p>

      <Note>
        <strong>Még egy bátorító szó:</strong> sok-sok gyülekezet használja már a Kartotékát,
        és sok lelkipásztor mondta: „nem tudom, hogyan dolgoztam nélküle". A papír kis-cédulák,
        kézzel írt füzetek, elveszett jegyzetek korszaka véget ért. A Kartotékában minden
        rendezett, biztonságos, kereshető — és Ön szabadabb a tényleges szolgálatra.
      </Note>
    </>
  )
}

/* ================== SÚGÓ ================== */

function HelpContent() {
  return (
    <>
      <p>
        Kedves Lelkipásztor Testvérünk! Az alábbi gyakori kérdésekre adunk részletes, közérthető
        választ. Ha kérdése nem szerepel itt, bátran írjon a rendszergazdának (Szőcs Endre
        lelkipásztor) — a Kapcsolat-menüpontban megtalálja az elérhetőségeit.
      </p>

      <Note>
        <strong>Bátorítás:</strong> kezdetben minden új rendszer szokatlannak tűnik. De a
        Kartotékát kifejezetten lelkipásztoroknak építettük, akik nem informatikusok. Pár nap
        alatt megszokja, és utána természetes lesz. Aki ki akar próbálni, akár csak első
        lépéssel, már nyer a szolgálatában.
      </Note>

      <SectionTitle>Hogyan kérhetek hozzáférést?</SectionTitle>
      <p>
        A bejelentkező oldalon (https://kartotekaweb-production.up.railway.app) kattintson az{' '}
        <strong>„Új fiók létrehozása"</strong> gombra. Ekkor megnyílik a kérelem-űrlap, ahol
        megadhatja:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Teljes nevét</li>
        <li>E-mail-címét</li>
        <li>A szerepkörét (lelkész / esperes / könyvelő stb.)</li>
        <li>A gyülekezet nevét, ha tudja</li>
        <li>Telefonszámát (opcionális, de hasznos)</li>
        <li>Rövid indoklást, hogy miért kéri a hozzáférést</li>
      </ul>
      <p>
        A rendszergazda <strong>1–3 munkanapon belül</strong> válaszol. Jóváhagyás esetén
        e-mailben kap egy belépési linket, amelyen beállíthatja a saját jelszavát.
      </p>

      <SectionTitle>Mire való a Kartotéka rendszer?</SectionTitle>
      <p>
        A Kartotéka egy <strong>teljes gyülekezeti nyilvántartó program</strong>. Az alábbi
        moduljai vannak:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Tagnyilvántartás</strong> — egyének, családok, körzetek, presbiterek,
          választók</li>
        <li><strong>Anyakönyv</strong> — keresztelés, házasság, temetés, konfirmáció</li>
        <li><strong>Pénzügy</strong> — befizetések, kiadások, éves egyházi járulék, adományok,
          chitanta-kiadás (Romániai elismervény)</li>
        <li><strong>Munkanapló</strong> — lelkészi szolgálatok rögzítése (igehirdetés, látogatás,
          temetés stb.)</li>
        <li><strong>Leltár</strong> — gyülekezeti vagyontárgyak nyilvántartása</li>
        <li><strong>Iktatás</strong> — bejövő és kimenő iratok</li>
        <li><strong>Jegyzőkönyvek</strong> — presbiteri ülések, közgyűlések jegyzőkönyveinek
          generálása sablon alapján</li>
        <li><strong>Sírhelyek</strong> — temető-nyilvántartás</li>
        <li><strong>Missziós Műhely</strong> — közösségi tér, ahol a lelkészek megoszthatnak
          ötleteket, segédanyagokat, és gamification-rendszer (pontok, jelvények) bátorít a
          szolgálatra</li>
        <li><strong>Publikus gyülekezeti oldal</strong> — saját, nyilvános weboldal a
          gyülekezetnek (alkalmak, hírek, lelkész-elérhetőség)</li>
      </ul>

      <SectionTitle>Elfelejtettem a jelszavam — mit tegyek?</SectionTitle>
      <p>
        A bejelentkező oldalon kattintson az <strong>„Elfelejtett jelszó?"</strong> linkre.
        Adja meg az e-mail-címét, és a rendszer 1-2 percen belül küld egy{' '}
        <strong>helyreállító linket</strong>. Erre kattintva új jelszót állíthat be magának.
      </p>
      <p>
        Ha az e-mail nem érkezik meg <strong>15 percen belül</strong>:
      </p>
      <ol className="list-decimal pl-6 space-y-1">
        <li>Ellenőrizze a <em>Spam / Levélszemét</em> mappát</li>
        <li>Ha ott sincs, próbálja még egyszer megadni az e-mail-címet (gondosan, elgépelés
          nélkül)</li>
        <li>Ha továbbra sem érkezik, írjon a rendszergazdának</li>
      </ol>

      <SectionTitle>Milyen adatokat kezel a rendszer?</SectionTitle>
      <p>
        Egyházi célú személyes és pénzügyi adatokat. A részletes felsorolást az{' '}
        <strong>Adatvédelmi tájékoztató</strong> 6. szakaszában találja.
      </p>

      <SectionTitle>Mit tegyek, ha biztonsági aggályom van?</SectionTitle>
      <p>
        Ha a következők bármelyikét tapasztalja, <strong>azonnal</strong> értesítse a
        rendszergazdát:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Ismeretlen bejelentkezési kísérletről kap e-mailt</li>
        <li>A jelszavát mások is megtudhatták</li>
        <li>Olyan adatot lát a rendszerben, ami nem az Ön gyülekezetéé</li>
        <li>Phishing (csaló) e-mailt kap, ami „Kartotéka"-nak adja ki magát</li>
      </ul>
      <Term
        word="Phishing (adathalászat)"
        def={'csaló e-mail vagy weboldal, ami megpróbálja kicsalni a jelszavát. Tipikus jelek: rossz helyesírás, ismeretlen feladó, „azonnal cselekedjen!" sürgetés, gyanús linkek. A Kartotéka SOHA nem kéri Öntől a jelszavát e-mailben.'}
      />
      <Note>
        <strong>Jó hír:</strong> a Kartotéka minden bejelentkezést és érzékeny műveletet
        naplóz. Ha bármi furcsa történne, percre pontosan rekonstruálható, hogy mi és kik
        érték el az adatokat. Ezt soha senki nem tudja törölni — még a rendszergazda sem.
      </Note>

      <SectionTitle>Offline használat — internet nélkül?</SectionTitle>
      <p>
        Igen, korlátozottan. Ha bejelentkezett és a rendszerben dolgozott, és közben elveszik
        az internet (pl. mobilon van), a már betöltött adatokat továbbra is látja, és tud
        rögzíteni új adatokat. Amikor visszatér az internet, a rendszer{' '}
        <strong>automatikusan szinkronizál</strong> — felviszi a felhőbe, amit közben rögzített.
      </p>
      <Note>
        Ezt különösen lelkészi látogatások közben, autóban vagy elszigetelt településeken
        találja praktikusnak. Nincs „nincs hálózat, nem tudok dolgozni" probléma.
      </Note>

      <SectionTitle>Több gyülekezet adatát kezelhetem?</SectionTitle>
      <p>
        Igen — például egy esperes vagy egyházmegyei adminisztrátor több gyülekezethez is
        hozzáférhet. A rendszer „<strong>profilváltási</strong>" funkciója egy pillanat alatt
        átkapcsol a megfelelő nézetbe, és csak az adott szerepkör adatait mutatja.
      </p>

      <SectionTitle>Lehet-e nyomtatni belőle?</SectionTitle>
      <p>
        Természetesen. Minden modulnak van <strong>nyomtatási nézete</strong>:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Anyakönyvi nyomtatványok (sablon szerint)</li>
        <li>Befizetési elismervény (chitanta) — Románia-szerinti formában</li>
        <li>Éves beszámolók, statisztikák</li>
        <li>Sírhelyek terv-nyomtatása</li>
        <li>Jegyzőkönyv-sablonok</li>
      </ul>
      <p>
        Sok modulban PDF-export is elérhető, így könnyen küldhet anyagot e-mailben az espereshez
        vagy a kerületi hivatalba.
      </p>

      <SectionTitle>A gyülekezetnek kell publikus weboldalt készíteni?</SectionTitle>
      <p>
        Nem kötelező, de <strong>egy kattintással bekapcsolható</strong>. A Beállítások-ban
        engedélyezheti, és a rendszer automatikusan generál egy egyszerű, gyönyörű weboldalt a
        gyülekezetnek (alkalmak, hírek, lelkész-elérhetőség). A megjelenés a gyülekezet
        választott témájához igazodik (Csendes parókia, Kerített kert, Zsoltáros).
      </p>

      <SectionTitle>Kit kérdezzek, ha valami nem érthető?</SectionTitle>
      <p>
        A rendszergazdát: <strong>Szőcs Endre református lelkipásztort</strong>. A pontos
        elérhetőség a Kapcsolat-menüpontban szerepel.
      </p>
      <Note>
        <strong>Egy szó még:</strong> ne féljen kérdezni — minden „buta kérdés" a felhasználó
        szempontjából egy <em>jogos kérdés</em>, amire valaki egyszerű választ tud adni.
        Rendszerünk azért épül, hogy <strong>bárki használni tudja</strong>, lelkészi
        szolgálathoz, nem informatikai szakértelemhez.
      </Note>
    </>
  )
}

/* ================== KAPCSOLAT ================== */

function ContactContent() {
  return (
    <>
      <p>
        Kedves Lelkipásztor Testvérünk! Az alábbiakban megtalálja, kihez fordulhat, ha kérdése,
        kérelme vagy aggálya van a Kartotéka rendszerrel kapcsolatban. <strong>Ne legyen
        gátlás</strong> — a rendszergazda éppen azért van, hogy segítsen.
      </p>

      <SectionTitle>Adatkezelő és rendszergazda</SectionTitle>
      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Szőcs Endre református lelkipásztor
        </p>
        <p className="text-[13px] text-slate-600">
          Az Erdélyi Református Egyházkerület (EREK) megbízásából a Kartotéka rendszer
          fejlesztője, üzemeltetője, és egyben az adatkezelő.
        </p>
      </div>
      <p>
        A pontos elérhetőséget (e-mail-cím, telefonszám, postai cím) az egyházkerületi
        hivatal és a kerületi adminisztratív csatornák biztosítják. A rendszerben{' '}
        <strong>belső üzenet</strong> küldési lehetőség is rendelkezésre áll a bejelentkezést
        követően.
      </p>

      <SectionTitle>A rendszer szellemi alapja</SectionTitle>
      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Beke Tivadar
        </p>
        <p className="text-[13px] text-slate-600">
          Az ő egyházi nyilvántartási rendszerének szellemi öröksége és gyakorlati logikája
          képezi a Kartotéka alapját. A digitális formába öntés tisztelettel és hűséggel
          történt.
        </p>
      </div>

      <SectionTitle>Mikor írjon a rendszergazdának?</SectionTitle>
      <p>Bátran keresse:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Hozzáférés-kérelem ügyek</strong> — új felhasználó, szerepkör-módosítás,
          gyülekezetváltás</li>
        <li><strong>Bejelentkezési problémák</strong> — elfelejtett jelszó, nem érkezik a
          helyreállító e-mail, „nem ismer fel a rendszer"</li>
        <li><strong>Adatvédelmi kérelmek</strong> — egy tag adatainak helyesbítése, törlése
          (egyházi anyakönyvnél korlátozott), másolat-kérés</li>
        <li><strong>Technikai hiba</strong> — „valami nem megy", „nem találok egy menüpontot",
          „lefagyott a rendszer". Minél részletesebben írja le, mit csinált, mi történt — annál
          gyorsabban tud segíteni.</li>
        <li><strong>Új modul-kérelem</strong> — hiányzik egy funkció, ami nagyon segítene a
          szolgálatban? Írja meg, hogy az új igények beépüljenek a következő verzióba.</li>
        <li><strong>Visszajelzés, javaslat, kritika</strong> — minden szempont fontos. A rendszer
          a használók visszajelzésére épül.</li>
      </ul>

      <SectionTitle>Sürgős esetek</SectionTitle>
      <p>
        Az alábbi esetekben <strong>azonnal</strong> jelezze a rendszergazdának:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Ismeretlen bejelentkezési kísérletről kap e-mailt</li>
        <li>Gyanú szerint kiszivárgott a jelszava</li>
        <li>Phishing (csaló) e-mailt kap, ami a Kartotékát mímeli</li>
        <li>Olyan adatot lát a rendszerben, amit nem kellene látnia</li>
      </ul>
      <Note>
        Sürgős esetekben a rendszergazda <strong>azonnali intézkedést</strong> tud tenni —
        pl. ideiglenesen lezárhatja az érintett fiókot, kicserélheti a jelszavát, vagy
        ellenőrizheti a hozzáférési naplót.
      </Note>

      <SectionTitle>Hivatalos adatvédelmi panaszok</SectionTitle>
      <p>
        Ha úgy érzi, hogy az adatkezelés körüli problémát a rendszergazdával nem tudja
        rendezni, hivatalosan is panaszt tehet a romániai adatvédelmi hatóságnál.
      </p>
      <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
        <p className="text-[14px] font-semibold text-slate-900">
          ANSPDCP — Romániai Adatvédelmi Hatóság
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          Cím: B-dul G-ral. Gheorghe Magheru 28-30, 010336 București
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          Webhely: <em>www.dataprotection.ro</em>
        </p>
      </div>
      <Term
        word="ANSPDCP"
        def={'rövidítés a teljes román névből: „Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal" — magyarul „Nemzeti Hatóság a Személyes Adatok Kezelésének Felügyeletére". Ők a romániai megfelelője a magyar NAIH-nak.'}
      />

      <SectionTitle>Egyházi csatorna</SectionTitle>
      <p>
        Egyházi-szervezeti kérdésekben (pl. egy gyülekezetváltás esperesi/egyházkerületi
        egyeztetése) a megszokott egyházszervezeti utat is használhatja:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Esperesi hivatal</li>
        <li>Egyházmegyei tanács</li>
        <li>Egyházkerületi (EREK) hivatal</li>
      </ul>

      <Note>
        <strong>Záró bátorítás:</strong> a Kartotéka rendszer egyházi szolgálati eszköz.
        Minden visszajelzés, minden kérdés, minden javaslat <em>épít</em>: a rendszer a
        gyülekezetekre van szabva, és csak akkor lesz egyre jobb, ha a használók megosztják
        a tapasztalataikat. Bátran írjon — Isten áldása legyen a szolgálatán.
      </Note>
    </>
  )
}
