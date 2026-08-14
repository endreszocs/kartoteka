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

import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookOpen, Mail, Shield, ScrollText } from 'lucide-react'

export type LegalKind = 'privacy' | 'terms' | 'help' | 'contact'
export type LegalLang = 'hu' | 'ro' | 'en'

interface LegalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: LegalKind
}

const TITLES: Record<LegalLang, Record<LegalKind, string>> = {
  hu: {
    privacy: 'Adatvédelmi tájékoztató',
    terms: 'Általános Szerződési Feltételek',
    help: 'Súgó és gyakori kérdések',
    contact: 'Kapcsolat',
  },
  ro: {
    privacy: 'Politica de confidențialitate',
    terms: 'Termeni și condiții',
    help: 'Ajutor și întrebări frecvente',
    contact: 'Contact',
  },
  en: {
    privacy: 'Privacy notice',
    terms: 'Terms of service',
    help: 'Help and FAQ',
    contact: 'Contact',
  },
}

const ICONS: Record<LegalKind, typeof Shield> = {
  privacy: Shield,
  terms: ScrollText,
  help: BookOpen,
  contact: Mail,
}

export function LegalDialog({ open, onOpenChange, kind }: LegalDialogProps) {
  const [lang, setLang] = useState<LegalLang>('hu')
  const Icon = ICONS[kind]
  const title = TITLES[lang][kind]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
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
            <LangSwitcher lang={lang} onChange={setLang} />
          </div>
        </DialogHeader>

        <div className="kt-legal-content space-y-3 text-[14px] leading-relaxed text-slate-700">
          {lang === 'hu' && kind === 'privacy' && <PrivacyContent />}
          {lang === 'hu' && kind === 'terms' && <TermsContent />}
          {lang === 'hu' && kind === 'help' && <HelpContent />}
          {lang === 'hu' && kind === 'contact' && <ContactContent />}
          {lang === 'ro' && kind === 'privacy' && <PrivacyRO />}
          {lang === 'ro' && kind === 'terms' && <TermsRO />}
          {lang === 'ro' && kind === 'help' && <HelpRO />}
          {lang === 'ro' && kind === 'contact' && <ContactRO />}
          {lang === 'en' && kind === 'privacy' && <PrivacyEN />}
          {lang === 'en' && kind === 'terms' && <TermsEN />}
          {lang === 'en' && kind === 'help' && <HelpEN />}
          {lang === 'en' && kind === 'contact' && <ContactEN />}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button onClick={() => onOpenChange(false)}>
            {lang === 'hu' ? 'Bezárás' : lang === 'ro' ? 'Închidere' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LangSwitcher({ lang, onChange }: { lang: LegalLang; onChange: (l: LegalLang) => void }) {
  const langs: Array<{ value: LegalLang; label: string }> = [
    { value: 'hu', label: 'HU' },
    { value: 'ro', label: 'RO' },
    { value: 'en', label: 'EN' },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5 shrink-0">
      {langs.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => onChange(l.value)}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
            lang === l.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
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
        Az adatokat <strong>két, egymástól független professzionális európai
        szolgáltató</strong> kezeli a tőlünk telhető legmagasabb biztonsági szinten:
      </p>

      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          1. Supabase — adatbázis és felhasználói azonosítás
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          Tárolási hely: <strong>Frankfurt am Main, Németország (EU)</strong>. Az adatbázis
          PostgreSQL alapú — ez a világ legmegbízhatóbb adatbázis-rendszereinek egyike,
          banki és kormányzati rendszerek is ezt használják.
        </p>
      </div>

      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          2. Railway — alkalmazás-host (a weboldal kiszolgálása)
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          Tárolási hely: <strong>Amszterdam, Hollandia (EU)</strong>. Cloudflare védelem a
          támadások (DDoS) ellen, automatikus szerver-újraindítás, folyamatos terheléskiegyenlítés.
        </p>
      </div>

      <Term
        word="Felhő (cloud)"
        def={'távoli, professzionális szervergép, ahol az adatok tárolva vannak. Olyan, mint egy „távoli iratszekrény" — biztonságos épületben, kettős zárral, riasztóval, 24/7 felügyelettel.'}
      />
      <Term
        word="Supabase"
        def="európai jogi szabályoknak megfelelő technológiai szolgáltató. Az infrastruktúrája SOC 2 Type 2 és ISO 27001 tanúsítvánnyal rendelkezik — ezek nemzetközi információbiztonsági szabványok. Az adatainkat AES-256 titkosítással tárolják; ez ugyanaz a szint, amit a NATO és banki rendszerek használnak."
      />
      <Term
        word="Railway"
        def="modern, fejlesztőbarát alkalmazás-hosting platform, amely az EU-n belül szolgál ki minket (Amszterdam). Folyamatos szervermonitoring, automatikus mentés, és a Cloudflare globális hálózata véd a túlterheléses támadások (DDoS) ellen."
      />
      <Term
        word="DDoS"
        def={'„Distributed Denial of Service" — magyarul „elosztott szolgáltatásmegtagadási támadás". Ez azt jelenti, amikor sok ezer számítógép egyszerre próbálja meglátogatni a szervert, hogy az lefagyjon. A Cloudflare automatikusan kiszűri az ilyen támadási kísérleteket, mielőtt elérnék a Kartotékát.'}
      />
      <Term
        word="PostgreSQL"
        def="nyílt forráskódú, ipari szabványnak számító adatbázis-rendszer. Több mint 30 éve fejlesztik világszerte, és a legbiztosabb módon kezeli a tranzakciókat — soha nem veszhet el adat egy félbeszakadt mentés miatt."
      />
      <Term
        word="AES-256 titkosítás"
        def={'„Advanced Encryption Standard" 256 bites kulcsa. Ezt használja az amerikai Nemzetbiztonsági Hivatal a szigorúan titkos adatok védelmére. Egy mai szuperszámítógépnek is évmilliárdokba telne feltörni.'}
      />
      <Term
        word="SOC 2 Type 2 tanúsítvány"
        def={'„Service Organization Control 2 Type 2" — független könyvvizsgálók által több hónapon át elvégzett, részletes biztonsági audit. Csak az a szolgáltató kapja meg, aki bizonyíthatóan védi az ügyfél-adatait.'}
      />
      <Term
        word="ISO 27001 tanúsítvány"
        def="nemzetközi információbiztonsági szabvány. Az ezzel rendelkező szervezetek formálisan dokumentált, ellenőrzött folyamatokkal védik az adatokat — nemcsak technikailag, hanem szervezeti szinten is."
      />

      <Note>
        <strong>Miért jó ez Önnek?</strong> Mert így nem kell papírdobozokban őrizni az
        anyakönyvet, nem ázik be, nem lopható el, nem menthető le illetéktelenül USB-re, és
        bárhonnan elérhető — például egy vasárnapi szolgálat előtt mobilon ellenőrizhető a
        családi háttér. Ráadásul a tárolás <strong>Európában történik</strong>, így a
        GDPR teljes körű védelme alatt áll — nem kerülnek át USA-ba, ahol más jogrend
        érvényes.
      </Note>

      <SectionTitle>4. GDPR-megfelelőség — mit jelent ez konkrétan?</SectionTitle>
      <p>
        A Kartotéka rendszer minden eleme <strong>GDPR-konform</strong>, ami azt jelenti, hogy
        megfelel az Európai Unió 2018-ban hatályba lépett legszigorúbb adatvédelmi
        szabályainak.
      </p>
      <p>Ez konkrétan a következőket jelenti:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Adatminimalizálás</strong> — csak azokat az adatokat kezeljük, amelyek
          a gyülekezeti élethez TÉNYLEG szükségesek. Nem gyűjtünk „mert hátha jó lesz".</li>
        <li><strong>Célhoz kötöttség</strong> — minden adatnak van egy konkrét, dokumentált
          célja (pl. anyakönyv, járulék-kimutatás). Más célra nem használjuk.</li>
        <li><strong>EU-n belüli tárolás</strong> — Frankfurt és Amszterdam mindkettő uniós
          tagország. Az adatok soha nem kerülnek át harmadik országba.</li>
        <li><strong>Titkosítás</strong> mind átvitelkor (TLS 1.3), mind tárolásakor (AES-256)</li>
        <li><strong>Hozzáférési naplózás</strong> — minden lekérdezés rögzített, ki, mit, mikor
          látott</li>
        <li><strong>Érintetti jogok</strong> — a tagok bármikor kérhetik adataikat, helyesbítést,
          tiltakozhatnak</li>
        <li><strong>Adatvédelmi panaszjog</strong> — a romániai ANSPDCP-nél tehető panasz</li>
        <li><strong>Adatfeldolgozói szerződések</strong> — a Supabase és Railway szolgáltatókkal
          GDPR-konform Data Processing Agreement (DPA) van kötve</li>
      </ul>
      <Term
        word="DPA (Data Processing Agreement)"
        def="adatfeldolgozói szerződés. Ezt az EU-jog kötelezővé teszi, ha valaki a nevünkben adatot kezel. Tartalmazza, hogy a szolgáltató mit tehet az adatainkkal, mit nem, és hogyan jár el adatszivárgás esetén."
      />

      <SectionTitle>5. Mire használjuk az adatokat?</SectionTitle>
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

      <SectionTitle>6. Milyen jogi alapon kezeljük az adatokat?</SectionTitle>
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

      <SectionTitle>7. Milyen adatokat kezelünk pontosan?</SectionTitle>
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

      <SectionTitle>8. Hogyan védjük az adatokat? (a biztonsági rétegek)</SectionTitle>
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
      {/* 2026-08-14: ŐSZINTE megfogalmazás — fiókszintű 2FA még NINCS a
          rendszerben (a Profil → Biztonság oldalon bekapcsolható), továbbá a rendszergazdai
          műveletek külön megerősítő kódja. A jogi szöveg nem ígérhet többet,
          mint ami él. */}
      <Term
        word="Külön megerősítés érzékeny műveleteknél"
        def={'a rendszergazdai műveletekhez (pl. rendszergazdai módváltás) a jelszó mellett egy külön megerősítő kód is szükséges. A fiókszintű kétlépcsős belépés (hitelesítő alkalmazással, mentőkódokkal) elérhető és önkéntesen bekapcsolható a Profil → Biztonság oldalon.'}
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

      <SectionTitle>9. Az egyházi hierarchia és a hozzáférések</SectionTitle>
      <p>
        A Kartotéka rendszer pontosan tükrözi az <strong>egyházi szervezeti rendet</strong>:
        kerület → egyházmegye → gyülekezet. Mindenki csak azt látja, ami a szerepköréhez
        tartozik — sem többet, sem kevesebbet.
      </p>

      <Note>
        <strong>Ne féljen!</strong> Ez a legfontosabb biztosíték: <em>a kerület és az
        egyházmegye CSAK az évente kötelezően leadott összesítő adatokat látja</em>. A
        gyülekezet egyéni tagjainak részletes adataihoz <strong>kizárólag a gyülekezeti
        lelkész engedélyével</strong> férnek hozzá — még a rendszergazda is csak így!
      </Note>

      <SectionTitle>10. Ki mit lát pontosan?</SectionTitle>

      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Gyülekezet — Lelkipásztor
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          A <strong>saját gyülekezetének teljes</strong> adatát látja: tagokat, családokat,
          anyakönyvi eseményeket, pénzügyet, programokat, sírhelyeket, a saját pasztorális
          jegyzeteit. Más gyülekezetbe NEM lát be. A pasztorális (lelkészi) jegyzetekhez
          rajta kívül senki más nem fér hozzá — ezeket az ő szolgálati titkaként kezeljük.
        </p>
      </div>

      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Gyülekezet — Könyvelő
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          CSAK az általa kiszolgált gyülekezet <strong>pénzügyi adatait</strong> látja
          (befizetések, kiadások). A személyes, anyakönyvi, pasztorális adatokhoz NEM fér
          hozzá. Egy könyvelő több gyülekezetet is segíthet — ez a profilváltási rendszerrel
          történik.
        </p>
      </div>

      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Egyházmegye — Esperes / Egyházmegyei admin
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          KIZÁRÓLAG az <strong>egyházmegyéhez tartozó gyülekezetek éves kötelező
          összesítőit</strong> látja: éves tagság-számokat, keresztelések száma, házasságok,
          temetések száma, gyülekezeti járulékok összesítve. <strong>Egyetlen tag személyes
          adatát sem látja!</strong> Ha mégis részletes információra van szüksége
          (pl. fegyelmi eljárás), azt a gyülekezet lelkészével közvetlenül egyezteti.
        </p>
      </div>

      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Egyházmegye — Számvevő (pénzügyi ellenőr)
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          CSAK <strong>az ellenőrzési időszakban</strong> és CSAK a <strong>pénzügyi
          összesítőket</strong> látja. Nem férhet hozzá tagok személyes adataihoz, lelkészi
          jegyzetekhez. Az ellenőrzési időszak végén a hozzáférése automatikusan korlátozódik.
        </p>
      </div>

      <div className="rounded-2xl bg-rose-50/50 p-4 border border-rose-200/50 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Egyházkerület — Egyházkerületi admin / EREK hivatalvezető
        </p>
        <p className="text-[13px] text-slate-600 mt-1">
          CSAK a <strong>kerület-szintű, agregált összesítőket</strong> látja: az
          egyházmegyéktől beérkező éves jelentések összesítését. Az egyes gyülekezeti tagok
          személyes adataihoz <strong>NEM fér hozzá</strong>. A rendszer szerkezete éppen erre
          van tervezve: a kerület a STATISZTIKA és a JELENTÉSEK szintjén dolgozik, nem a
          személyes adat szintjén.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-100 p-4 border border-slate-300 my-3">
        <p className="text-[14px] font-semibold text-slate-900 mb-1">
          Rendszergazda — Szőcs Endre lelkipásztor
        </p>
        <p className="text-[13px] text-slate-700 mt-1">
          Technikai jogkörben gondozza a rendszert: hibakeresés, frissítések, biztonsági
          mentés. <strong>Egy gyülekezet adataihoz CSAK az adott gyülekezet lelkészének
          előzetes és kifejezett engedélyével férhet hozzá.</strong> Ez az engedély:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-[13px] text-slate-700 mt-2">
          <li><strong>Időkorláthoz kötött</strong> — csak a megegyezett ideig (pl. 30 perc)
            láthatja az adatokat</li>
          <li><strong>Naplózott</strong> — minden lépése rögzítve van, percre pontosan</li>
          <li><strong>Konkrét célhoz kötött</strong> — pl. „segíteni egy hiba megtalálásában",
            nem tetszőleges böngészés</li>
          <li><strong>A lelkész bármikor visszavonhatja</strong> — egy kattintással</li>
        </ul>
      </div>

      <Note>
        <strong>Ez nem üres ígéret — a rendszer technikailag kényszeríti ki!</strong>
        A „Row Level Security" (RLS) szabályok minden lekérdezésnél ellenőrzik, hogy az adott
        felhasználónak van-e joga az adott adat látásához. Ha nincs, a szervergép automatikusan
        üres választ ad — még akkor is, ha valaki technikailag próbálná megkerülni a
        jogosultságot.
      </Note>

      <SectionTitle>11. Ki látta az adataimat? — naplózás</SectionTitle>
      <p>
        Ha egy gyülekezeti tag rákérdez: „ki látta az adataimat?" — <strong>bármikor pontos
        választ tudunk adni</strong>. Minden hozzáférést rögzítünk: ki jelentkezett be, mit
        nézett meg, mit módosított, mikor. Ezeket a naplókat a rendszergazda sem tudja
        törölni — egyfajta „adatvédelmi feketedoboz" a Kartoteka mélyén.
      </p>
      <p>
        Ha egy érintett (tag) kéri, megmutatjuk neki a saját adatait érintő összes
        naplóbejegyzést — átláthatóan, érthető magyar nyelven, nem pedig technikai naplók
        formájában.
      </p>

      <SectionTitle>12. Meddig őrizzük az adatokat?</SectionTitle>
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

      <SectionTitle>13. Milyen jogai vannak Önnek és a tagoknak?</SectionTitle>
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

      <SectionTitle>14. Mit tegyen, ha úgy érzi, valami nem stimmel?</SectionTitle>
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

      <SectionTitle>15. Felelősségi nyilatkozat</SectionTitle>
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
        A bejelentkező oldalon (https://kartoteka.app) kattintson az{' '}
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

      <SectionTitle>Mire való a Kartotéka rendszer? (a teljes modul-térkép)</SectionTitle>
      <p>
        A Kartotéka egy <strong>teljes körű gyülekezeti nyilvántartó program</strong>, amely
        a református lelkészi munka minden napi területét lefedi. Az alábbiakban a teljes
        modul-listát találja, részletes magyarázattal.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        🏠 Irányítópult (kezdőlap)
      </h4>
      <p>
        A bejelentkezés utáni első oldal. Egy pillantásra látja: tagok száma, családok száma,
        éves pénzforgalom, születésnapok, közelgő alkalmak, koreloszlás-grafikon, friss
        bejegyzések.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        👥 Tagnyilvántartás
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Tagok és családok</strong> — egyének, családi kapcsolatok, családfa</li>
        <li><strong>Körzetek</strong> — gyülekezeti területi felosztás (presbiteri gondozás)</li>
        <li><strong>Presbiterek</strong> — gondozott körzetek és tisztségek</li>
        <li><strong>Választók</strong> — választói névjegyzék</li>
        <li><strong>Áttekintés</strong> — összesített statisztikák</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📖 Anyakönyv (8 fül)
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Keresztelés</strong> — felnőtt és gyermek</li>
        <li><strong>Konfirmáció</strong></li>
        <li><strong>Házasság</strong> — egyházi esketés</li>
        <li><strong>Temetés</strong></li>
        <li><strong>Beköltözött / Áttért</strong> — tagsági mozgások</li>
        <li><strong>Importálás</strong> — régi anyakönyvi adatok beolvasása Excel-ből</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        💰 Pénzügy
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Befizetés</strong> — egyházi járulék, adományok, célgyűjtés rögzítése</li>
        <li><strong>Kiadás</strong> — gyülekezeti költségek, számlák</li>
        <li><strong>Tartozás-kezelés</strong> — automatikus emlékeztető listák</li>
        <li><strong>Cashbook (kasszakönyv)</strong> — havi pénzforgalmi áttekintés</li>
        <li><strong>Bankszámla-kivonat import</strong> — BCR/CEC bank kivonat XLS feltöltése</li>
        <li><strong>Chitanta-kiadás</strong> — Romániai bevételi elismervény (sorszámozott,
          PDF-nyomtatható)</li>
        <li><strong>Oblio integráció</strong> — Romániai elektronikus számlázási rendszer</li>
        <li><strong>Audit, devizaértékelés, belső átvezetés</strong></li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📅 Munkanapló
      </h4>
      <p>
        Lelkészi szolgálatok rögzítése: igehirdetés, igét hirdetett (vasárnap, ünnep), keresztelés,
        házasságkötés, temetés, látogatás, jubileumi alkalom, hivatalos egyházi tanácskozás.
        Havi és éves összegzés.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📦 Leltár
      </h4>
      <p>
        Gyülekezeti vagyontárgyak nyilvántartása: liturgikus tárgyak (kelyhek, anyakönyvek),
        bútorok, hangszerek, ingatlanok, anyagraktár (építőanyag, takarítószer). Mozgások:
        kölcsönvétel, javítás, elhasználás.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📁 Iktatás
      </h4>
      <p>
        Bejövő és kimenő iratok nyilvántartása sorszámmal, dátummal, tárggyal,
        címzettel/feladóval. Iktatókönyv-nyomtatás, keresés, archiválás.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📜 Jegyzőkönyvek
      </h4>
      <p>
        Presbiteri ülések, közgyűlések jegyzőkönyveinek <strong>sablon-alapú generálása</strong>:
        napirend, határozatok, jelenlét rögzítése. PDF-export. Régi jegyzőkönyvek importja Excel-ből.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        ⚰️ Sírhelyek
      </h4>
      <p>
        Temető-nyilvántartás: parcella, sor, sír-szám, megváltási idő, családi kapcsolatok,
        sírkő-állapot. Térkép-szerű elrendezés, lekérdezhető temetésekkel.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📊 Éves jelentés
      </h4>
      <p>
        Az év végén kötelező egyházmegyei jelentés <strong>automatikus generálása</strong> a
        rendszer-adatokból. PDF + prezentáció-nézet a presbiteri ülésre. Az esperes csak az
        elkészült jelentést látja, részletes adatokhoz nem fér.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        🌐 Publikus gyülekezeti oldal
      </h4>
      <p>
        A gyülekezet saját, nyilvános weboldala (`gy/[slug]`). <strong>Egyetlen kapcsolóval
        bekapcsolható</strong>. Tartalom: alkalmak, hírek, kapcsolat, magazin (cikk-szerű
        bejegyzések), „Rólunk" oldal. A téma a gyülekezet választott vizuális témájához
        igazodik (Csendes parókia / Kerített kert / Zsoltáros).
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        💡 Missziós Műhely
      </h4>
      <p>
        Közösségi tér, ahol a lelkészek megoszthatnak ötleteket, segédanyagokat, és kérdéseket.
        <strong> Gamification-rendszer</strong>: pontok, jelvények, szintek bátorítanak a
        közösségi szolgálatra. Almenük: Kezdőlap, Segédanyagok, Fórum, Jutalmak, Profil.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        ⚙️ Beállítások és Profil
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Profil</strong> — saját adatok, jelszóváltás, szerepkörök</li>
        <li><strong>Kapcsolatok</strong> — meghívók, közös munkacsoportok</li>
        <li><strong>Vizuális téma</strong> — 3 választható: Csendes parókia, Kerített kert,
          Zsoltáros (világos/sötét móddal)</li>
        <li><strong>Értesítések</strong> — e-mail, in-app jelzések finomhangolása</li>
        <li><strong>Offline</strong> — diagnosztika, manuális szinkron, full backup</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        🔧 Admin (csak rendszergazdai szerepkörrel)
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li>Felhasználók kezelése, hozzáférés-kérelmek elbírálása</li>
        <li>Gyülekezetek és egyházmegyék felvitele</li>
        <li>Eszközök / licencek</li>
        <li>Broadcast-üzenet (rendszer-szintű hírek minden felhasználónak)</li>
        <li>Adatminőségi jelzések, audit-naplók</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        🗑️ Kuka és Visszaállítás
      </h4>
      <p>
        Törölt elemek 30 napig visszaállíthatók a Kukából. Utána automatikusan végleges
        törlés.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-emerald-800">
        📞 Támogatás
      </h4>
      <p>
        Beépített hibajegy-rendszer (support ticket) — nem kell külön e-mailt írni, a rendszerből
        is jelezhet hibát vagy kérdezhet.
      </p>

      <Note>
        <strong>Bátorítás:</strong> 12+ modul, rengeteg funkció, és minden összefügg egymással.
        Egy nyilvántartott tagra rákattintva azonnal látja az anyakönyvi eseményeit, a
        befizetéseit, a családját. Egy keresztelés-rögzítés automatikusan frissíti a tagot.
        A rendszer így „él" — nem 12 különálló füzet, hanem egy összekapcsolódó hálózat.
      </Note>

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

/* ================== ROMÁN — PRIVACY ================== */

function PrivacyRO() {
  return (
    <>
      <p>
        Stimate Pastor! Vă mulțumim că ați ales sistemul Kartotéka pentru gestionarea vieții
        congregației. Această notă privind confidențialitatea descrie modul în care protejăm
        datele dumneavoastră, ale congregației și ale familiilor pastorale.
      </p>

      <Note>
        <strong>Încurajare:</strong> Kartotéka este una dintre cele mai sigure forme de
        gestionare digitală a datelor, special concepute pentru viața bisericească reformată.
        Securitatea îndeplinește standardele bancare internaționale.
      </Note>

      <SectionTitle>1. Operatorul de date și administratorul sistemului</SectionTitle>
      <p>
        Operatorul de date și administratorul sistemului este același —{' '}
        <strong>pastorul reformat Endre Szőcs</strong>. El construiește, întreține și
        supraveghează accesul la Kartotéka.
      </p>

      <SectionTitle>2. Baza spirituală a sistemului</SectionTitle>
      <p>
        Baza spirituală a sistemului este sistemul de evidență bisericească al lui{' '}
        <strong>Tivadar Beke</strong>, dezvoltat în formă digitală cu respect și fidelitate
        față de tradiția reformată.
      </p>

      <SectionTitle>3. Unde sunt stocate datele?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> (Frankfurt am Main, Germania, UE) — bază de date
          PostgreSQL cu criptare AES-256, certificare SOC 2 Type 2 și ISO 27001</li>
        <li><strong>Railway</strong> (Amsterdam, Olanda, UE) — găzduire aplicație, protecție
          Cloudflare împotriva atacurilor DDoS, restart automat</li>
      </ul>
      <Note>
        Toate datele sunt stocate <strong>exclusiv în UE</strong>, sub protecția deplină a
        GDPR.
      </Note>

      <SectionTitle>4. Conformitate GDPR</SectionTitle>
      <p>Sistemul Kartotéka este conform cu GDPR (Regulamentul UE 2016/679):</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Minimizarea datelor — colectăm doar ce este necesar</li>
        <li>Limitarea scopului — utilizare exclusiv pentru viața bisericească</li>
        <li>Stocare în UE</li>
        <li>Criptare TLS 1.3 (transmisie) + AES-256 (stocare)</li>
        <li>Jurnalizare a accesului</li>
        <li>Drepturile persoanelor vizate (acces, rectificare, ștergere etc.)</li>
        <li>Drept de plângere la ANSPDCP</li>
        <li>Acord de prelucrare a datelor (DPA) cu Supabase și Railway</li>
      </ul>

      <SectionTitle>5. Scopul prelucrării</SectionTitle>
      <p>
        Exclusiv pentru sprijinirea vieții bisericești: evidența membrilor, registrele
        ecleziastice (botez, cununie, înmormântare), contribuții, vizite pastorale, programe.
      </p>

      <SectionTitle>6. Temei legal</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>GDPR art. 9 alin. (2) lit. d) — activități legitime ale comunității religioase</li>
        <li>Legea românească 190/2018 — implementarea GDPR</li>
      </ul>

      <SectionTitle>7. Datele prelucrate</SectionTitle>
      <p>
        Nume, data nașterii, adresă, telefon, e-mail, religia, starea civilă, evenimente
        ecleziastice (botez, cununie, înmormântare), contribuții bisericești.
      </p>

      <SectionTitle>8. Securitatea datelor</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>TLS 1.3</strong> — criptare a comunicării</li>
        <li><strong>RLS (Row Level Security)</strong> — verificare la nivel de înregistrare</li>
        <li><strong>RBAC</strong> — control bazat pe roluri</li>
        <li><strong>Confirmare suplimentară</strong> — cod separat de confirmare pentru operațiuni administrative sensibile (autentificarea în doi pași la nivel de cont este disponibilă opțional, cu coduri de rezervă)</li>
        <li><strong>Jurnalizare</strong> — toate accesurile înregistrate</li>
      </ul>

      <SectionTitle>9. Ierarhia bisericească și accesul</SectionTitle>
      <Note>
        <strong>Nu vă temeți!</strong> Districtul și protopopiatul văd <em>doar rapoartele
        anuale obligatorii</em>. Pentru date detaliate este necesar acordul pastorului
        congregației — chiar și administratorul sistemului poate accesa datele exclusiv cu
        permisiunea expresă a pastorului.
      </Note>

      <SectionTitle>10. Cine vede ce?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Pastorul</strong> — datele complete ale propriei congregații</li>
        <li><strong>Contabilul</strong> — doar date financiare, doar pentru congregația sa</li>
        <li><strong>Protopop / Admin protopopiat</strong> — exclusiv rapoartele anuale
          agregate, fără date personale individuale</li>
        <li><strong>Cenzor (auditor)</strong> — doar în perioada de control, doar date
          financiare</li>
        <li><strong>Admin district (KEK)</strong> — doar statistici la nivel de district</li>
        <li><strong>Administrator sistem (Endre Szőcs)</strong> — la datele unei congregații
          DOAR cu acordul prealabil al pastorului, limitat în timp, jurnalizat, pentru un
          scop concret</li>
      </ul>

      <SectionTitle>11. Drepturile persoanelor vizate</SectionTitle>
      <p>
        Conform GDPR aveți drept la informare, acces, rectificare, ștergere (limitat pentru
        evidențele bisericești permanente), restricționare, opoziție.
      </p>

      <SectionTitle>12. Contact și plângeri</SectionTitle>
      <p>
        Întrebări de confidențialitate: la administratorul sistemului. Plângeri oficiale: la
        ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter
        Personal), B-dul G-ral. Gheorghe Magheru 28-30, București.
      </p>

      <SectionTitle>13. Limitarea răspunderii</SectionTitle>
      <p>
        Sistemul este furnizat „așa cum este". Administratorul (Endre Szőcs) și persoana
        bazei spirituale (Tivadar Beke) nu răspund pentru: erori de introducere, pierderi
        cauzate de utilizator, întreruperi cauzate de terți, forță majoră, daune indirecte.
      </p>
    </>
  )
}

/* ================== ROMÁN — TERMS ================== */

function TermsRO() {
  return (
    <>
      <p>
        Stimate Pastor! Aceste reguli stabilesc folosirea pașnică și clară a sistemului
        Kartotéka pentru toți utilizatorii.
      </p>

      <Note>
        <strong>Încurajare:</strong> Kartotéka este un instrument de slujire bisericească.
        Termenii sunt scriși pentru folosirea cu conștiință curată — orice congregație poate
        beneficia de pe urma sa.
      </Note>

      <SectionTitle>1. Sistemul Kartotéka</SectionTitle>
      <p>
        Operator: pastorul reformat Endre Szőcs. Bază spirituală: sistemul de evidență
        bisericească al lui Tivadar Beke, dezvoltat digital.
      </p>

      <SectionTitle>2. Acces</SectionTitle>
      <p>
        Accesul necesită <strong>aprobare la nivel de district</strong> de către
        administratorul sistemului. Răspunsul ajunge de obicei în 1–3 zile lucrătoare. Accesul
        este personal și netransferabil.
      </p>

      <SectionTitle>3. Tarifare</SectionTitle>
      <p>
        Despre tariful și condițiile sistemului congregațiile primesc informații prin canalele
        administrative ale districtului.
      </p>

      <SectionTitle>4. Obligațiile utilizatorului</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Utilizare exclusiv în scop bisericesc</li>
        <li>Date corecte și actualizate</li>
        <li>Confidențialitatea parolei (schimbată anual)</li>
        <li>Anunțarea imediată a oricărei suspiciuni administratorului</li>
        <li>Interzisă ocolirea mecanismelor de securitate</li>
      </ul>

      <SectionTitle>5. Drepturile operatorului</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Întreruperi de mentenanță (cu anunțare prealabilă)</li>
        <li>Suspendarea accesului în caz de încălcare a regulilor</li>
        <li>Dezvoltarea și modificarea sistemului</li>
      </ul>

      <SectionTitle>6. Principiul „as is"</SectionTitle>
      <p>
        Sistemul este furnizat în forma actuală — cu toate caracteristicile și limitările
        sale. Nu se garantează funcționare fără erori sau disponibilitate continuă.
      </p>

      <SectionTitle>7. Limitarea răspunderii</SectionTitle>
      <p>
        Administratorul (Endre Szőcs) și persoana bazei spirituale (Tivadar Beke) nu
        răspund pentru: date introduse greșit, pierderi cauzate de utilizator, întreruperi de
        servicii ale terților, forță majoră (dezastre naturale, atacuri cibernetice), daune
        indirecte sau consecutive.
      </p>

      <SectionTitle>8. Confidențialitate</SectionTitle>
      <p>
        Detalii separate în Politica de confidențialitate.
      </p>

      <SectionTitle>9. Proprietate intelectuală</SectionTitle>
      <p>
        Codul, designul și documentația sunt proprietatea intelectuală a dezvoltatorului
        (Endre Szőcs). Congregațiile primesc drept de utilizare. Denumirea „Kartotéka" și
        baza ecleziastică se trag din munca lui Tivadar Beke.
      </p>

      <SectionTitle>10. Modificarea termenilor</SectionTitle>
      <p>
        Termenii pot fi modificați. Schimbările importante sunt anunțate. Utilizarea continuă
        înseamnă acceptarea noilor termeni.
      </p>

      <SectionTitle>11. Jurisdicție</SectionTitle>
      <p>
        Acestor termeni li se aplică legea română. Pentru dispute se urmărește mai întâi
        rezolvarea pașnică; în caz contrar, jurisdicția aparține instanțelor române
        competente.
      </p>
    </>
  )
}

/* ================== ROMÁN — HELP ================== */

function HelpRO() {
  return (
    <>
      <p>
        Stimate Pastor! Aici găsiți răspunsuri la întrebările frecvente. Pentru alte întrebări,
        contactați administratorul sistemului (pastorul reformat Endre Szőcs).
      </p>

      <SectionTitle>Cum solicit acces?</SectionTitle>
      <p>
        Pe pagina de autentificare apăsați „Creare cont nou" / „Új fiók létrehozása". Completați
        formularul (nume, e-mail, rol, congregație). Răspunsul ajunge în 1–3 zile lucrătoare.
      </p>

      <SectionTitle>Module ale sistemului</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Tablou de bord</strong> — privire de ansamblu</li>
        <li><strong>Evidența membrilor</strong> — persoane, familii, presbiteri, alegători</li>
        <li><strong>Registre bisericești</strong> — botez, cununie, înmormântare, confirmare</li>
        <li><strong>Finanțe</strong> — contribuții, cheltuieli, chitanță, integrare Oblio</li>
        <li><strong>Jurnal de lucru</strong> — slujbe pastorale</li>
        <li><strong>Inventar</strong> — bunuri ale congregației</li>
        <li><strong>Înregistrare documente</strong> — registru intrare/ieșire</li>
        <li><strong>Procese-verbale</strong> — generare automată din șabloane</li>
        <li><strong>Locuri de veci</strong> — evidența cimitirului</li>
        <li><strong>Raport anual</strong> — generare automată pentru protopopiat</li>
        <li><strong>Pagină web publică</strong> — site al congregației</li>
        <li><strong>Atelier misionar</strong> — spațiu comunitar pentru pastori</li>
      </ul>

      <SectionTitle>Am uitat parola</SectionTitle>
      <p>
        Pe pagina de autentificare — „Parolă uitată?" / „Elfelejtett jelszó?". Veți primi un
        link de resetare.
      </p>

      <SectionTitle>Utilizare offline</SectionTitle>
      <p>
        Da, datele deja încărcate pot fi vizualizate fără internet, modificările se
        sincronizează automat la revenirea conexiunii.
      </p>

      <SectionTitle>Tipărire</SectionTitle>
      <p>
        Toate modulele oferă vizualizare pentru tipărire (PDF). Chitanțele sunt în format
        românesc.
      </p>

      <SectionTitle>La cine să mă adresez?</SectionTitle>
      <p>La administratorul sistemului — pastorul reformat Endre Szőcs.</p>
    </>
  )
}

/* ================== ROMÁN — CONTACT ================== */

function ContactRO() {
  return (
    <>
      <p>
        Stimate Pastor! Mai jos găsiți pe cine să contactați pentru întrebări despre Kartotéka.
      </p>

      <SectionTitle>Operator de date și administrator sistem</SectionTitle>
      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Pastorul reformat Endre Szőcs
        </p>
        <p className="text-[13px] text-slate-600">
          Dezvoltatorul, operatorul și administratorul sistemului Kartotéka, în numele
          Eparhiei Reformate din Ardeal (KEK).
        </p>
      </div>

      <SectionTitle>Baza spirituală</SectionTitle>
      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Tivadar Beke
        </p>
        <p className="text-[13px] text-slate-600">
          Sistemul de evidență bisericească dezvoltat de el constituie baza spirituală a
          Kartotékăi.
        </p>
      </div>

      <SectionTitle>Când să scrieți?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Solicitări de acces, schimbări de rol</li>
        <li>Probleme de autentificare</li>
        <li>Cereri privind protecția datelor</li>
        <li>Erori tehnice, sugestii</li>
      </ul>

      <SectionTitle>Plângeri oficiale privind protecția datelor</SectionTitle>
      <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
        <p className="text-[14px] font-semibold text-slate-900">
          ANSPDCP — Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
          Caracter Personal
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          B-dul G-ral. Gheorghe Magheru 28-30, 010336 București
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          Web: <em>www.dataprotection.ro</em>
        </p>
      </div>

      <Note>
        Binecuvântarea Domnului fie peste slujirea dumneavoastră!
      </Note>
    </>
  )
}

/* ================== ENGLISH — PRIVACY ================== */

function PrivacyEN() {
  return (
    <>
      <p>
        Dear Pastor! Thank you for choosing Kartotéka for managing your congregation's life.
        This privacy notice describes how we protect the data of you, your congregation, and
        the families under pastoral care.
      </p>

      <Note>
        <strong>Encouragement:</strong> Kartotéka is one of the most secure forms of digital
        data management, specifically designed for Reformed church life. Security meets
        international banking standards.
      </Note>

      <SectionTitle>1. Data Controller and System Administrator</SectionTitle>
      <p>
        The data controller and system administrator is the same person —{' '}
        <strong>Reverend Endre Szőcs</strong> (Reformed pastor). He builds, maintains, and
        oversees access to the Kartotéka system.
      </p>

      <SectionTitle>2. The system's spiritual foundation</SectionTitle>
      <p>
        The spiritual foundation of the system is <strong>Tivadar Beke</strong>'s church
        record-keeping system, faithfully developed into digital form with respect for the
        Reformed tradition.
      </p>

      <SectionTitle>3. Where is the data stored?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> (Frankfurt am Main, Germany, EU) — PostgreSQL database
          with AES-256 encryption, SOC 2 Type 2 and ISO 27001 certified</li>
        <li><strong>Railway</strong> (Amsterdam, Netherlands, EU) — application hosting,
          Cloudflare DDoS protection, automatic restart and load balancing</li>
      </ul>
      <Note>
        All data is stored <strong>exclusively within the EU</strong>, under full GDPR
        protection.
      </Note>

      <SectionTitle>4. GDPR compliance</SectionTitle>
      <p>The Kartotéka system is fully compliant with GDPR (EU Regulation 2016/679):</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Data minimization — we only collect what is necessary</li>
        <li>Purpose limitation — exclusively for church life</li>
        <li>Storage within the EU</li>
        <li>Encryption: TLS 1.3 (in transit) + AES-256 (at rest)</li>
        <li>Access logging</li>
        <li>Data subject rights (access, rectification, erasure, etc.)</li>
        <li>Right to lodge a complaint at ANSPDCP (Romanian DPA)</li>
        <li>Data Processing Agreement (DPA) with Supabase and Railway</li>
      </ul>

      <SectionTitle>5. Purpose of processing</SectionTitle>
      <p>
        Solely to support church life: member records, ecclesiastical registers (baptism,
        marriage, funeral), contributions, pastoral visits, programs.
      </p>

      <SectionTitle>6. Legal basis</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>GDPR Article 9(2)(d) — legitimate activities of religious communities</li>
        <li>Romanian Law 190/2018 — implementation of GDPR</li>
      </ul>

      <SectionTitle>7. Data processed</SectionTitle>
      <p>
        Name, date of birth, address, phone, e-mail, religion, marital status, ecclesiastical
        events (baptism, marriage, funeral), church contributions.
      </p>

      <SectionTitle>8. Data security</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>TLS 1.3</strong> — communication encryption</li>
        <li><strong>RLS (Row Level Security)</strong> — record-level verification</li>
        <li><strong>RBAC</strong> — role-based access control</li>
        <li><strong>Extra confirmation</strong> — a separate confirmation code for sensitive administrative operations (optional account-level two-factor sign-in with backup codes is available)</li>
        <li><strong>Logging</strong> — all access events recorded</li>
      </ul>

      <SectionTitle>9. Church hierarchy and access</SectionTitle>
      <Note>
        <strong>Do not be afraid!</strong> The district and presbytery only see <em>the
        annual mandatory summary reports</em>. For detailed data the congregation pastor's
        permission is required — even the system administrator can only access congregation
        data with the explicit prior consent of the pastor.
      </Note>

      <SectionTitle>10. Who sees what?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Pastor</strong> — full data of own congregation</li>
        <li><strong>Bookkeeper</strong> — financial data only, only for own congregation</li>
        <li><strong>Dean / Presbytery admin</strong> — only annual aggregated reports, no
          individual personal data</li>
        <li><strong>Auditor</strong> — only during audit period, only financial data</li>
        <li><strong>District admin (EREK)</strong> — district-level statistics only</li>
        <li><strong>System administrator (Endre Szőcs)</strong> — congregation data ONLY
          with pastor's prior consent, time-limited, logged, purpose-bound</li>
      </ul>

      <SectionTitle>11. Data subject rights</SectionTitle>
      <p>
        Under GDPR you have the right to information, access, rectification, erasure (limited
        for permanent church records), restriction, and objection.
      </p>

      <SectionTitle>12. Contact and complaints</SectionTitle>
      <p>
        Privacy questions: contact the system administrator. Official complaints: ANSPDCP
        (Romanian DPA), B-dul G-ral. Gheorghe Magheru 28-30, Bucharest.
      </p>

      <SectionTitle>13. Liability disclaimer</SectionTitle>
      <p>
        The system is provided „as is". The administrator (Endre Szőcs) and the spiritual
        foundation source (Tivadar Beke) are not liable for: input errors, user-caused
        losses, third-party service interruptions, force majeure, indirect damages.
      </p>
    </>
  )
}

/* ================== ENGLISH — TERMS ================== */

function TermsEN() {
  return (
    <>
      <p>
        Dear Pastor! These rules establish the peaceful and clear use of the Kartotéka system
        for all users.
      </p>

      <Note>
        <strong>Encouragement:</strong> Kartotéka is a tool for church service. The terms
        are written for use with a clear conscience — every congregation can benefit from
        it.
      </Note>

      <SectionTitle>1. The Kartotéka system</SectionTitle>
      <p>
        Operator: Reverend Endre Szőcs. Spiritual foundation: Tivadar Beke's church
        record-keeping system, developed in digital form.
      </p>

      <SectionTitle>2. Access</SectionTitle>
      <p>
        Access requires <strong>district-level approval</strong> by the system administrator.
        Response usually within 1–3 business days. Access is personal and non-transferable.
      </p>

      <SectionTitle>3. Pricing</SectionTitle>
      <p>
        Information about the system's pricing and conditions is provided to congregations
        through district administrative channels.
      </p>

      <SectionTitle>4. User obligations</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Use exclusively for church purposes</li>
        <li>Accurate and current data entry</li>
        <li>Password confidentiality (changed annually)</li>
        <li>Immediately notify administrator of any suspicion</li>
        <li>Bypassing security mechanisms is prohibited</li>
      </ul>

      <SectionTitle>5. Operator's rights</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Maintenance windows (with advance notice)</li>
        <li>Suspending access in case of rule violation</li>
        <li>Developing and modifying the system</li>
      </ul>

      <SectionTitle>6. „As is" principle</SectionTitle>
      <p>
        The system is provided in its current form — with all its features and limitations.
        No guarantee of error-free operation or continuous availability.
      </p>

      <SectionTitle>7. Liability disclaimer</SectionTitle>
      <p>
        The administrator (Endre Szőcs) and the spiritual foundation source (Tivadar Beke)
        are not liable for: incorrectly entered data, user-caused losses, third-party service
        interruptions, force majeure (natural disasters, cyber-attacks), indirect or
        consequential damages.
      </p>

      <SectionTitle>8. Privacy</SectionTitle>
      <p>
        Detailed privacy rules are described in the separate Privacy Notice.
      </p>

      <SectionTitle>9. Intellectual property</SectionTitle>
      <p>
        The code, design, and documentation are the intellectual property of the developer
        (Endre Szőcs). Congregations receive a usage right. The name „Kartotéka" and the
        ecclesiastical foundation derive from Tivadar Beke's work.
      </p>

      <SectionTitle>10. Modification of terms</SectionTitle>
      <p>
        Terms may be modified. Significant changes are announced. Continued use means
        acceptance of new terms.
      </p>

      <SectionTitle>11. Jurisdiction</SectionTitle>
      <p>
        Romanian law applies. Disputes are first resolved peacefully; otherwise, competent
        Romanian courts have jurisdiction.
      </p>
    </>
  )
}

/* ================== ENGLISH — HELP ================== */

function HelpEN() {
  return (
    <>
      <p>
        Dear Pastor! Here you find answers to frequent questions. For other questions,
        contact the system administrator (Reverend Endre Szőcs).
      </p>

      <SectionTitle>How do I request access?</SectionTitle>
      <p>
        On the login page, click „Create new account" / „Új fiók létrehozása". Fill in the form
        (name, e-mail, role, congregation). Response within 1–3 business days.
      </p>

      <SectionTitle>System modules</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Dashboard</strong> — overview at a glance</li>
        <li><strong>Member registry</strong> — individuals, families, presbyters, voters</li>
        <li><strong>Ecclesiastical registers</strong> — baptism, confirmation, marriage,
          funeral</li>
        <li><strong>Finance</strong> — contributions, expenses, receipts (chitanță), Oblio
          integration</li>
        <li><strong>Work log</strong> — pastoral services</li>
        <li><strong>Inventory</strong> — congregation assets</li>
        <li><strong>Document registry</strong> — incoming/outgoing register</li>
        <li><strong>Minutes</strong> — automatic generation from templates</li>
        <li><strong>Cemetery</strong> — burial plot records</li>
        <li><strong>Annual report</strong> — automatic generation for the presbytery</li>
        <li><strong>Public website</strong> — congregation's website</li>
        <li><strong>Mission Workshop</strong> — community space for pastors</li>
      </ul>

      <SectionTitle>Forgot password</SectionTitle>
      <p>
        On the login page — „Forgot password?". You will receive a reset link.
      </p>

      <SectionTitle>Offline use</SectionTitle>
      <p>
        Yes, already loaded data can be viewed without internet; changes auto-sync upon
        reconnection.
      </p>

      <SectionTitle>Printing</SectionTitle>
      <p>
        All modules offer print views (PDF). Receipts are in Romanian format.
      </p>

      <SectionTitle>Whom should I contact?</SectionTitle>
      <p>The system administrator — Reverend Endre Szőcs.</p>
    </>
  )
}

/* ================== ENGLISH — CONTACT ================== */

function ContactEN() {
  return (
    <>
      <p>
        Dear Pastor! Below you find whom to contact for Kartotéka questions.
      </p>

      <SectionTitle>Data Controller and System Administrator</SectionTitle>
      <div className="rounded-2xl bg-amber-50/50 p-4 border border-amber-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Reverend Endre Szőcs
        </p>
        <p className="text-[13px] text-slate-600">
          Developer, operator, and administrator of the Kartotéka system, on behalf of the
          Reformed Church District of Transylvania (EREK).
        </p>
      </div>

      <SectionTitle>Spiritual foundation</SectionTitle>
      <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-200/50">
        <p className="text-[15px] font-semibold text-slate-900 mb-1">
          Tivadar Beke
        </p>
        <p className="text-[13px] text-slate-600">
          His church record-keeping system constitutes the spiritual foundation of Kartotéka.
        </p>
      </div>

      <SectionTitle>When to write?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Access requests, role changes</li>
        <li>Login problems</li>
        <li>Data protection requests</li>
        <li>Technical errors, suggestions</li>
      </ul>

      <SectionTitle>Official data protection complaints</SectionTitle>
      <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
        <p className="text-[14px] font-semibold text-slate-900">
          ANSPDCP — Romanian Data Protection Authority
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          B-dul G-ral. Gheorghe Magheru 28-30, 010336 Bucharest, Romania
        </p>
        <p className="text-[12.5px] text-slate-600 mt-1">
          Web: <em>www.dataprotection.ro</em>
        </p>
      </div>

      <Note>
        May the Lord's blessing be upon your service!
      </Note>
    </>
  )
}
