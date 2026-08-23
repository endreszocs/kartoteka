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

/* ═══════════════════ KITÖLTENDŐ KONFIG — KEZDET ═══════════════════ */
/**
 * ⚠️  ENDRE — EZ AZ EGYETLEN HELY, AHOL KITÖLTENIVALÓD VAN.  ⚠️
 *
 * A három jogi szöveg (Adatvédelmi tájékoztató, ÁSZF, Kapcsolat) mindhárom
 * nyelven ugyanezekre az adatokra hivatkozik: az üzemeltető hivatalos
 * elérhetőségére, jogi státuszára és néhány határidőre. Korábban ez 49 helyen,
 * kézzel írt „kitöltendő: …" felirattal volt szétszórva; MOST minden ilyen hely
 * EBBŐL a 13 mezőből olvas. Elég tehát ITT átírni egyetlen sort.
 *
 * HOGYAN TÖLTSD KI: a `null` helyére írd az értéket idézőjelben, pl.
 *     adatvedelmiEmail: 'adatvedelem@pelda.ro',
 *
 * AMÍG `null` MARAD: a felület az adott helyen feltűnő, borostyán
 * „⚠️ kitöltendő: …" jelölést mutat — mindegyik nyelven a saját feliratával.
 * Ez SZÁNDÉKOS (fail-closed): a jogi szöveg inkább vallja be a hiányt,
 * mint hogy valótlant állítson. Amint kitöltöd, a jelölés magától eltűnik,
 * és csak a beírt érték látszik, mindenféle megkülönböztetés nélkül.
 *
 * FONTOS: az itt megadott ÉRTÉK mind a három nyelven UGYANÚGY jelenik meg
 * (magyar, román, angol), ezért lehetőleg nyelvfüggetlen adatot írj be:
 * címet, e-mail-t, telefonszámot, adószámot, dátumot vagy PUSZTA SZÁMOT.
 * A mértékegység (év / hónap / nap) a szövegben van, nem az értékben — a
 * számoknál tehát elég a szám: 10, 12, 30.
 *
 * A nyelvenkénti feliratok a lenti HIANY_FELIRAT táblában vannak — ahhoz
 * NEM kell hozzányúlnod.
 */
interface UzemeltetoAdatok {
  /** Hivatalos e-mail-cím adatvédelmi ügyekre is. Pl. 'adatvedelem@pelda.ro' */
  adatvedelmiEmail: string | null
  /** Postázási cím (utca, házszám, település, irányítószám, ország). */
  postaiCim: string | null
  /** Telefonszám — nem kötelező; ha üresen marad, a felület jelzi a hiányt. */
  telefon: string | null
  /** Milyen minőségben üzemeltet: EREK-megbízás / egyházi jogi személy / egyéni vállalkozás. */
  jogiStatusz: string | null
  /** Adószám (CUI), ha van. */
  adoszam: string | null
  /** Adatvédelmi tisztviselő (DPO): van-e kijelölve, és mi az elérhetősége. */
  dpoElerhetoseg: string | null
  /** A pénzügyi-számviteli iratok megőrzési ideje ÉVBEN — csak a szám. Pl. '10'. */
  penzugyiMegorzesEv: string | null
  /** Az inaktív fiók törléséig eltelt idő HÓNAPBAN — csak a szám. Pl. '12'. */
  fiokTorlesHonap: string | null
  /** A napi biztonsági mentések megőrzési ideje NAPBAN — csak a szám. Pl. '30'. */
  mentesMegorzesNap: string | null
  /** Az adatvédelmi hatásvizsgálat (DPIA) állapota vagy elkészültének dátuma. */
  dpiaAllapot: string | null
  /** A gyülekezetekkel kötendő adatfeldolgozói szerződés (DPA) állapota. */
  dpaAllapot: string | null
  /** ÁSZF 4. pont: van-e díj, mekkora, ki számlázza, mi történik nemfizetéskor. */
  aszfDijazas: string | null
  /** Az adatkiadás határideje a hozzáférés megszűnésekor, NAPBAN — csak a szám. Pl. '30'. */
  aszfAdatkiadasNap: string | null
}

export const UZEMELTETO_ADATOK: UzemeltetoAdatok = {
  adatvedelmiEmail: null,
  postaiCim: null,
  telefon: null,
  jogiStatusz: null,
  adoszam: null,
  dpoElerhetoseg: null,
  penzugyiMegorzesEv: null,
  fiokTorlesHonap: null,
  mentesMegorzesNap: null,
  dpiaAllapot: null,
  dpaAllapot: null,
  aszfDijazas: null,
  aszfAdatkiadasNap: null,
}

type UzemeltetoMezo = keyof UzemeltetoAdatok

/**
 * A HIÁNYZÓ érték helyén megjelenő magyarázat — nyelvenként. Csak a FELIRAT
 * nyelvfüggő; maga az ÉRTÉK mindig az UZEMELTETO_ADATOK-ból jön.
 * A típus szigorú: ha egy mező lemarad vagy elgépeled, a typecheck szól.
 */
const HIANY_FELIRAT: Record<LegalLang, Record<UzemeltetoMezo, string>> = {
  hu: {
    adatvedelmiEmail: 'kitöltendő: hivatalos adatvédelmi e-mail-cím',
    postaiCim: 'kitöltendő: postázási cím',
    telefon: 'kitöltendő: telefonszám (nem kötelező)',
    jogiStatusz: 'kitöltendő: milyen minőségben — EREK-megbízás, egyházi jogi személy vagy egyéni vállalkozás',
    adoszam: 'kitöltendő: adószám, ha van',
    dpoElerhetoseg: 'kitöltendő: van-e kijelölt adatvédelmi tisztviselő (DPO), és mi az elérhetősége',
    penzugyiMegorzesEv: 'kitöltendő: hány év (a könyvelővel egyeztetve)',
    fiokTorlesHonap: 'kitöltendő: hány hónap',
    mentesMegorzesNap: 'kitöltendő: hány nap',
    dpiaAllapot: 'kitöltendő: a hatásvizsgálat elkészültének dátuma, vagy hogy folyamatban van',
    dpaAllapot: 'kitöltendő: a gyülekezetekkel kötendő adatfeldolgozói szerződés (DPA) állapota',
    aszfDijazas: 'kitöltendő: van-e díj, mekkora, milyen gyakorisággal, ki számlázza, mi történik nemfizetés esetén',
    aszfAdatkiadasNap: 'kitöltendő: hány nap',
  },
  ro: {
    adatvedelmiEmail: 'de completat: adresa oficială de e-mail pentru protecția datelor',
    postaiCim: 'de completat: adresa poștală',
    telefon: 'de completat: număr de telefon (facultativ)',
    jogiStatusz: 'de completat: în ce calitate — mandat al eparhiei, persoană juridică bisericească sau PFA',
    adoszam: 'de completat: codul fiscal (CUI), dacă există',
    dpoElerhetoseg: 'de completat: dacă este desemnat un DPO și datele sale de contact (art. 37 GDPR)',
    penzugyiMegorzesEv: 'de completat: câți ani (stabilit cu contabilul)',
    fiokTorlesHonap: 'de completat: câte luni',
    mentesMegorzesNap: 'de completat: câte zile',
    dpiaAllapot: 'de completat: data finalizării DPIA sau mențiunea că este în curs',
    dpaAllapot: 'de completat: stadiul acordului de prelucrare (DPA) cu congregațiile',
    aszfDijazas: 'de completat: există tarif, cuantum, periodicitate, cine facturează, consecințele neplății',
    aszfAdatkiadasNap: 'de completat: câte zile',
  },
  en: {
    adatvedelmiEmail: 'to be filled in: official data protection e-mail address',
    postaiCim: 'to be filled in: postal address',
    telefon: 'to be filled in: phone number (optional)',
    jogiStatusz: 'to be filled in: in what capacity — church mandate, church legal entity or sole trader',
    adoszam: 'to be filled in: tax number, if any',
    dpoElerhetoseg: 'to be filled in: whether a DPO is designated and their contact details (Art. 37 GDPR)',
    penzugyiMegorzesEv: 'to be filled in: how many years (agreed with the bookkeeper)',
    fiokTorlesHonap: 'to be filled in: number of months',
    mentesMegorzesNap: 'to be filled in: number of days',
    dpiaAllapot: 'to be filled in: DPIA completion date, or note that it is in progress',
    dpaAllapot: 'to be filled in: status of the data processing agreement (DPA) with congregations',
    aszfDijazas: 'to be filled in: whether a fee applies, amount, frequency, who invoices, consequences of non-payment',
    aszfAdatkiadasNap: 'to be filled in: number of days',
  },
}
/* ═══════════════════ KITÖLTENDŐ KONFIG — VÉGE ═══════════════════ */

/**
 * A `.kt-legal-content strong/em` szabály a packages/ui/src/kartoteka.css-ben FIX
 * sötét színt ad (#1f2a24 / #3a4740). Sötét módban ez a kártya-háttéren majdnem
 * láthatatlan, márpedig a jogi szövegek tele vannak `<strong>`-gal. Az a CSS-fájl
 * közös (desktop + web), ezért itt, helyben írjuk felül token-alapú színre:
 * azonos specificitás mellett a KÉSŐBBI szabály nyer, és ez a `<style>` a
 * stíluslap UTÁN kerül a dokumentumba.
 */
const KT_LEGAL_TOKEN_CSS = `
.kt-legal-content strong { color: var(--foreground); }
.kt-legal-content em { color: inherit; }
`

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
                className="flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"
                aria-hidden
              >
                <Icon className="size-5" strokeWidth={1.6} />
              </span>
              <span className="font-heading text-xl">{title}</span>
            </DialogTitle>
            <LangSwitcher lang={lang} onChange={setLang} />
          </div>
        </DialogHeader>

        <style dangerouslySetInnerHTML={{ __html: KT_LEGAL_TOKEN_CSS }} />

        <div className="kt-legal-content space-y-3 text-[14px] leading-relaxed text-foreground">
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

        <div className="flex justify-end pt-4 border-t border-border">
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
    <h3 className="mt-6 mb-2 font-heading text-[16px] font-semibold text-foreground">
      {children}
    </h3>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
      {children}
    </div>
  )
}

function Term({ word, def }: { word: string; def: string }) {
  return (
    <p className="text-[13px] text-muted-foreground">
      <strong className="text-foreground">{word}</strong> = {def}
    </p>
  )
}

/**
 * Kitöltendő helyőrző. Szándékosan FELTŰNŐ: a jogi szöveg addig nem teljes,
 * amíg ilyen maradt benne. A `scripts/selftest-jogi-dokumentumok.mjs` M5 mércéje
 * pontosan azt védi, hogy a hiányzó cégadatok helyére NE kerüljön kitalált érték.
 */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded border border-dashed border-accent bg-accent/30 px-1.5 py-0.5 text-[12.5px] font-semibold text-foreground">
      ⚠️ {children}
    </mark>
  )
}

/**
 * Igaz, ha a konfig-mező ténylegesen ki van töltve. Az üres / csak szóközös
 * érték NEM számít kitöltöttnek.
 *
 * Külön, exportált függvény, hogy a `scripts/selftest-jogi-dokumentumok.mjs`
 * ne egy MÁSOLATOT, hanem pontosan EZT a logikát játszhassa újra.
 */
export function kitoltottE(ertek: string | null | undefined): boolean {
  return typeof ertek === 'string' && ertek.trim().length > 0
}

/**
 * Egy kitöltendő adat megjelenítése — EZ az egyetlen hely, ahol helyőrző születik.
 *  · ki van töltve  → csak az érték, mindenféle jelölés nélkül;
 *  · nincs kitöltve → feltűnő helyőrző, a nyelvnek megfelelő felirattal.
 */
export function Adat({ lang, mezo }: { lang: LegalLang; mezo: UzemeltetoMezo }) {
  const ertek = UZEMELTETO_ADATOK[mezo]
  if (kitoltottE(ertek)) return <>{ertek}</>
  return <Placeholder>{HIANY_FELIRAT[lang][mezo]}</Placeholder>
}

/* Nyelvenkénti rövidítés — a szövegtörzsben így nem kell a `lang`-ot ismételni. */
function AdatHU({ mezo }: { mezo: UzemeltetoMezo }) {
  return <Adat lang="hu" mezo={mezo} />
}
function AdatRO({ mezo }: { mezo: UzemeltetoMezo }) {
  return <Adat lang="ro" mezo={mezo} />
}
function AdatEN({ mezo }: { mezo: UzemeltetoMezo }) {
  return <Adat lang="en" mezo={mezo} />
}

/* ================== ADATVÉDELEM ================== */

/**
 * A jogi szövegek verziója. Ha a tartalom érdemben változik, EZT is emeld,
 * mert az ÁSZF 13. pontja és az Adatvédelmi tájékoztató 19. szakasza erre hivatkozik.
 */
export const LEGAL_VERSION = '2.1'
export const LEGAL_EFFECTIVE_DATE = '2026. augusztus 23.'

function PrivacyContent() {
  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        Verzió: {LEGAL_VERSION} — hatályos {LEGAL_EFFECTIVE_DATE} napjától. Ez a tájékoztató
        az Európai Unió 2016/679 rendelete (GDPR) 12–14. cikke és a romániai 190/2018. sz.
        törvény szerint készült.
      </p>

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

      <SectionTitle>0. A lényeg dióhéjban</SectionTitle>
      <p>
        Ha most nincs ideje végigolvasni, ez a hat mondat a legfontosabb:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Az adatok <strong>az Európai Unión belül</strong> (Frankfurt és Amszterdam)
          tárolódnak; egyetlen, pontosan megnevezett kivétel van — a napi biztonsági
          mentés —, ezt a 7. szakaszban őszintén leírjuk.</li>
        <li>A gyülekezeti tagok adatainak gazdája <strong>a gyülekezet</strong>; a Kartotéka
          üzemeltetője a gyülekezet megbízásából, annak utasítására dolgozik (1. szakasz).</li>
        <li>Az <strong>egyházi tagság különleges adat</strong> — ezt a GDPR 9. cikk (2)
          bekezdés d) pontja alapján kezeljük, amely kifejezetten a vallási közösségeknek
          szól (5. szakasz).</li>
        <li>Minden érintettnek <strong>nyolc adatvédelmi joga</strong> van — a
          panaszjogon felül —, és ezeket egy e-mailben gyakorolhatja; egy hónapon
          belül, díjmentesen válaszolunk (9. szakasz).</li>
        <li>A rendszer <strong>nem hoz automatikus döntést</strong> senkiről, és nem
          profiloz (11. szakasz).</li>
        <li>Reklám- és követő sütit <strong>egyáltalán nem</strong> használunk (12. szakasz).</li>
      </ul>

      <SectionTitle>1. Ki kezeli az adatokat? — a két szint</SectionTitle>
      <p>
        Ez a legtöbb félreértés forrása, ezért világosan leírjuk. Az adatkezelésben{' '}
        <strong>két szerep</strong> különül el:
      </p>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          A gyülekezet (egyházközség) = adatkezelő
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          A gyülekezeti tagok, családok, anyakönyvi események és járulékok adatainak{' '}
          <strong>gazdája maga az egyházközség</strong>, amelyet a lelkipásztor és a
          presbitérium képvisel. Ők döntik el, kit vesznek nyilvántartásba, mi kerül be
          az anyakönyvbe, és meddig őrzik. A Kartotéka ehhez csak az eszközt adja.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          A Kartotéka üzemeltetője = adatfeldolgozó (és a fiókok tekintetében adatkezelő)
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          <strong>Szőcs Endre református lelkipásztor</strong> — ő építi és gondozza a
          Kartotékát. A gyülekezeti adatokat <em>a gyülekezet megbízásából és utasítására</em>{' '}
          kezeli: adatfeldolgozóként. Ugyanakkor <em>adatkezelő</em> abban a szűk körben,
          ami magához a rendszerhez tartozik: a felhasználói fiókok, a hozzáférés-kérelmek,
          a biztonsági naplók és a támogatási üzenetek.
        </p>
      </div>

      <Term
        word="Adatkezelő"
        def="az a személy vagy szervezet, aki eldönti, hogy egy adatot MIRE és HOGYAN használunk fel. A gyülekezeti tagok adatainál ez maga a gyülekezet; a belépési fiókoknál a rendszer üzemeltetője."
      />
      <Term
        word="Adatfeldolgozó"
        def="aki az adatkezelő megbízásából, annak utasítása szerint kezeli az adatot — a saját céljaira nem használhatja fel. A Kartotéka üzemeltetője ilyen a gyülekezeti adatok tekintetében."
      />
      <Term
        word="Érintett"
        def="az az élő személy, akiről az adat szól: a gyülekezeti tag, a hozzátartozó, a keresztelt gyermek, a felhasználó."
      />

      <p className="mt-3">
        <strong>Az üzemeltető elérhetőségei</strong> (adatvédelmi kérdésekben ide kell írni):
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Név: <strong>Szőcs Endre református lelkipásztor</strong></li>
        <li>E-mail: <AdatHU mezo="adatvedelmiEmail" /></li>
        <li>Postai cím: <AdatHU mezo="postaiCim" /></li>
        <li>Telefon: <AdatHU mezo="telefon" /></li>
        <li>Nyilvántartási/jogi státusz: <AdatHU mezo="jogiStatusz" /></li>
        <li>Adószám: <AdatHU mezo="adoszam" /></li>
      </ul>
      <Note>
        <strong>Adatvédelmi tisztviselő (DPO):</strong>{' '}
        <AdatHU mezo="dpoElerhetoseg" />.
        A GDPR 37. cikke akkor teszi kötelezővé a kijelölést, ha a szervezet fő tevékenysége
        nagy számban, rendszeresen kezel különleges adatot. Mivel a Kartotéka egyházi
        tagsági adatot kezel, ezt a kérdést az egyházkerülettel egyeztetve kell eldönteni.
      </Note>

      <SectionTitle>2. A rendszer szellemi alapja</SectionTitle>
      <p>
        A Kartotéka rendszer szellemi alapja{' '}
        <strong>Beke Tivadar</strong> egyházi nyilvántartási rendszere — ezt a kézzel készített,
        jól bevált rendet fejlesztette tovább digitális formába az üzemeltető. Ez azt jelenti,
        hogy a rendszer logikája és a nyomtatványok a református egyházi gyakorlathoz illenek,
        nem egy gyári „dobozos" megoldás.
      </p>

      <SectionTitle>3. Milyen adatokat kezelünk pontosan?</SectionTitle>
      <p>A gyülekezeti élethez szükséges mértékben, és nem többet:</p>

      <p className="mt-3 font-semibold text-foreground">a) Azonosító és kapcsolattartási adatok</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Név (előtag, vezetéknév, keresztnév, leánykori név)</li>
        <li>Születési hely, dátum, anyja neve</li>
        <li>Lakcím, postázási cím</li>
        <li>Telefonszám, e-mail-cím (ha van)</li>
        <li>Családi állapot, házastárs, gyermekek, családi kapcsolatok</li>
        <li>Foglalkozás (csak akkor, ha ezt önként megadta)</li>
      </ul>

      <p className="mt-3 font-semibold text-foreground">
        b) Különleges (érzékeny) adat — GDPR 9. cikk
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Vallási hovatartozás és egyházi tagság</strong> (református, áttért,
          kilépett, belépés és kilépés időpontja)</li>
        <li><strong>Egyházi események</strong>: keresztelés, konfirmáció, házasság, temetés —
          időpont, helyszín, szolgáló lelkész, keresztszülők, tanúk</li>
        <li>A <strong>lelkipásztori (pasztorális) jegyzetek</strong>, ha a lelkész ilyet
          rögzít — ez az adatok legérzékenyebb köre</li>
      </ul>
      <Term
        word="Különleges adat"
        def={'a GDPR 9. cikke szerinti, fokozottan védett adatkör: egyebek mellett a vallási meggyőződés és az egyházi tagság. Ezeket csak szigorúbb feltételekkel szabad kezelni — nálunk kifejezetten a vallási közösségekre írt kivétel alapján (lásd az 5. szakaszt).'}
      />

      <p className="mt-3 font-semibold text-foreground">c) Pénzügyi adatok</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Egyházi járulék éves összege, befizetések, adományok, célgyűjtések</li>
        <li>Nyugta- és elismervényadatok (chitanță), számlaszámok a gyülekezeti könyvelésben</li>
        <li>Sírhely-megváltás, temetői nyilvántartás</li>
      </ul>

      <p className="mt-3 font-semibold text-foreground">
        d) Felhasználói és technikai adatok (itt az üzemeltető az adatkezelő)
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Felhasználói fiók: név, e-mail-cím, szerepkör, gyülekezet, jelszó
          (kizárólag titkosított, visszafejthetetlen formában)</li>
        <li>Hozzáférés-kérelem adatai és indoklása</li>
        <li>Belépési és műveleti naplók (időbélyeg, művelet, felhasználó azonosítója,
          technikai adatok — pl. IP-cím a biztonsági naplókban)</li>
        <li>Támogatási (hibajegy) üzenetek tartalma</li>
      </ul>

      <Note>
        <strong>Amit NEM kezelünk:</strong> nem gyűjtünk egészségügyi adatot, politikai
        véleményt, szexuális irányultságra vonatkozó adatot, biometrikus vagy genetikai
        adatot. Bankkártyaszámot a rendszer nem tárol. A romániai személyi számot (CNP)
        a rendszer nem kéri kötelező mezőként — a 190/2018. sz. törvény 4. cikke ugyanis
        a nemzeti azonosító szám kezeléséhez külön garanciákat követel meg.
      </Note>

      <SectionTitle>4. Honnan származnak az adatok, és kötelező-e megadni?</SectionTitle>
      <p>
        A GDPR 14. cikke előírja, hogy ha valakiről nem tőle magától szerezzük az adatot,
        meg kell mondanunk, honnan való. Nálunk az adat forrása:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>maga az érintett</strong> — amikor egy tag megadja az adatait a
          lelkésznek vagy a presbiternek;</li>
        <li><strong>a gyülekezet korábbi, papíralapú nyilvántartása</strong> — a kézzel írt
          anyakönyvek, kartotéklapok, körzeti füzetek digitalizálása;</li>
        <li><strong>korábbi elektronikus nyilvántartás</strong> — Excel-táblák és régi
          programok importálása;</li>
        <li><strong>hozzátartozó bejelentése</strong> — például temetéskor az elhunyt adatai;</li>
        <li><strong>a gyülekezet szolgálattevői</strong> — presbiterek, gondnok, kántor,
          könyvelő a saját feladatkörükben.</li>
      </ul>
      <p>
        Nyilvánosan hozzáférhető forrásból (közösségi média, nyilvános adatbázis){' '}
        <strong>nem gyűjtünk</strong> adatot.
      </p>
      <p>
        <strong>Kötelező-e megadni?</strong> Az egyházi tagsághoz és a szolgálatokhoz
        (keresztelés, esketés, temetés) szükséges alapadatok megadása az egyházi rend
        szerinti feltétel: enélkül a szolgálat nem anyakönyvezhető. A többi adat
        (telefonszám, e-mail, foglalkozás) megadása önkéntes — hiányuk semmilyen hátránnyal
        nem jár, legfeljebb nehezebb elérni az illetőt.
      </p>

      <SectionTitle>5. Mire használjuk, és milyen jogalapon?</SectionTitle>
      <p>
        A GDPR szerint minden célhoz kell egy <strong>általános jogalap</strong> (6. cikk),
        és ha különleges adatról van szó, egy <strong>második, külön feltétel</strong> is
        (9. cikk). Célonként így néz ki:
      </p>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Tagnyilvántartás, anyakönyv, pasztorális gondozás
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          <strong>Cél:</strong> ki tartozik a gyülekezethez, milyen egyházi események
          történtek, kit mikor látogatott a lelkész.<br />
          <strong>Jogalap:</strong> GDPR 6. cikk (1) f) — az egyházközség jogos érdeke a
          tagsága nyilvántartására, valamint 6. cikk (1) c) az egyházi anyakönyvezési
          kötelezettség teljesítéséhez.<br />
          <strong>Különleges adatra:</strong> GDPR <strong>9. cikk (2) d)</strong> — vallási
          célú, nonprofit szervezet a tagjaira és korábbi tagjaira vonatkozó adatot,
          megfelelő garanciákkal, belső körben kezelheti. Ez a rendelkezés kifejezetten
          az egyházakra íródott.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Egyházi járulék, adományok, gyülekezeti könyvelés
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          <strong>Cél:</strong> a gyülekezet gazdálkodásának átlátható, elszámoltatható
          vezetése; nyugta, számadás, költségvetés.<br />
          <strong>Jogalap:</strong> GDPR 6. cikk (1) c) — jogi kötelezettség teljesítése
          (romániai számviteli és egyházi elszámolási előírások), valamint 6. cikk (1) f)
          jogos érdek a belső ellenőrzéshez.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Felhasználói fiókok, hozzáférés-kérelmek, támogatás
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          <strong>Cél:</strong> a rendszerhez való biztonságos hozzáférés biztosítása,
          a szerepkör igazolása, segítségnyújtás.<br />
          <strong>Jogalap:</strong> GDPR 6. cikk (1) b) — a szolgáltatás nyújtásához
          szükséges szerződéses jogviszony.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Biztonsági naplózás, visszaélés-megelőzés, biztonsági mentés
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          <strong>Cél:</strong> kiderüljön, ki mit látott és módosított; helyreállíthatóság
          hiba vagy támadás esetén.<br />
          <strong>Jogalap:</strong> GDPR 6. cikk (1) f) — jogos érdek az adatbiztonsághoz
          (ezt a GDPR (49) preambulumbekezdése kifejezetten elismeri), valamint 32. cikk.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-border bg-muted p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Publikus gyülekezeti oldal, hírlevél, önkéntes megjelenés
        </p>
        <p className="text-[13px] text-foreground mt-1">
          <strong>Cél:</strong> ha a gyülekezet bekapcsolja a nyilvános weboldalt, azon
          megjelenhetnek alkalmak, hírek, fényképek, elérhetőségek.<br />
          <strong>Jogalap:</strong> GDPR 6. cikk (1) a) — <strong>hozzájárulás</strong>.
          Nevesített személy fényképét vagy adatát csak az ő (kiskorúnál a szülő)
          hozzájárulásával tesszük közzé, és a hozzájárulás <em>bármikor, indoklás nélkül
          visszavonható</em>.
        </p>
      </div>

      <Note>
        Az adatokat <strong>marketingre, hirdetésre, harmadik fél részére</strong> SOHA nem
        adjuk át, és nem értékesítjük. A Kartotéka nem reklámozó vállalkozás — egyházi szolgálat.
      </Note>

      <SectionTitle>6. Hol vannak az adatok, és ki fér hozzájuk technikailag?</SectionTitle>
      <p>
        Az adatokat professzionális szolgáltatók („adatfeldolgozók") segítségével kezeljük.
        Mindegyikkel <strong>adatfeldolgozói szerződés (DPA)</strong> van érvényben. Íme a
        teljes lista — semmit nem hallgatunk el:
      </p>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          1. Supabase — adatbázis és felhasználói azonosítás
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Tárolási hely: <strong>Frankfurt am Main, Németország (EU)</strong>. Az adatbázis
          PostgreSQL alapú — ez a világ legmegbízhatóbb adatbázis-rendszereinek egyike,
          banki és kormányzati rendszerek is ezt használják.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          2. Railway (és a Cloudflare hálózata) — alkalmazás-host
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Tárolási hely: <strong>Amszterdam, Hollandia (EU)</strong>. Cloudflare védelem a
          túlterheléses (DDoS) támadások ellen, automatikus szerver-újraindítás, folyamatos
          terheléskiegyenlítés.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          3. Brevo — rendszer-e-mailek küldése
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Európai (franciaországi) levelezőszolgáltató. Csak a <strong>címzett neve és
          e-mail-címe</strong>, valamint a levél szövege kerül hozzá — jelszó-helyreállítás,
          meghívó, értesítés. Gyülekezeti adatbázist nem kap.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          4. Google Drive — a napi biztonsági mentés tárolása
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          A napi mentés titkosított állományként az üzemeltető által e célra fenntartott
          Google-fiókba kerül. <strong>Ez azt jelenti, hogy a mentés adatai kikerülnek az
          EU-ból</strong> — a garanciákat a 7. szakaszban írjuk le.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          5. Oblio — romániai elektronikus számlázás (csak ha a gyülekezet bekapcsolja)
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Romániai (EU-s) szolgáltató. Kizárólag a számlázáshoz szükséges adatokat kapja
          meg, és csak azoknál a gyülekezeteknél, amelyek ezt a modult saját döntésükből
          bekapcsolják.
        </p>
      </div>

      <p>
        Ezeken felül adatot csak akkor adunk ki, ha arra <strong>jogszabály kötelez</strong>{' '}
        (pl. hatósági megkeresés), vagy ha az egyházi szervezeti rend előírja
        (éves összesítők az egyházmegye és az egyházkerület felé — lásd a 16. szakaszt).
      </p>

      <Term
        word="Felhő (cloud)"
        def={'távoli, professzionális szervergép, ahol az adatok tárolva vannak. Olyan, mint egy „távoli iratszekrény" — biztonságos épületben, kettős zárral, riasztóval, 24/7 felügyelettel.'}
      />
      <Term
        word="DPA (adatfeldolgozói szerződés)"
        def="a GDPR 28. cikke által kötelezővé tett szerződés. Tartalmazza, hogy a szolgáltató mit tehet az adatainkkal, mit nem, kit vonhat be alvállalkozóként, és hogyan jár el adatszivárgás esetén."
      />
      <Term
        word="Supabase"
        def="európai jogi szabályoknak megfelelő technológiai szolgáltató. Az infrastruktúrája SOC 2 Type 2 és ISO 27001 tanúsítvánnyal rendelkezik — ezek nemzetközi információbiztonsági szabványok. Az adatainkat AES-256 titkosítással tárolják; ez ugyanaz a szint, amit a NATO és banki rendszerek használnak."
      />
      <Term
        word="Railway"
        def="modern alkalmazás-hosting platform, amely az EU-n belül szolgál ki minket (Amszterdam). Folyamatos szervermonitoring, automatikus mentés, és a Cloudflare globális hálózata véd a túlterheléses támadások (DDoS) ellen."
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

      <SectionTitle>7. Kikerül-e adat az Európai Unióból?</SectionTitle>
      <p>
        A <strong>napi működés</strong> teljes egészében az EU-n belül zajlik: az adatbázis
        Frankfurtban, az alkalmazás Amszterdamban fut. <strong>Egyetlen ponton</strong> lép
        ki mégis adat az EU-ból, és ezt kötelességünk őszintén megmondani:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          <strong>A napi biztonsági mentés</strong> a Google Drive-ba kerül. A Google LLC
          egyesült államokbeli szolgáltató; a továbbítás jogalapja az Európai Bizottság
          <strong> EU–USA adatvédelmi keretre</strong> vonatkozó megfelelőségi határozata,
          kiegészítve a Google általános szerződési feltételeibe épített uniós{' '}
          <strong>általános szerződési klauzulákkal (SCC)</strong>. A mentés titkosítva
          kerül fel.
        </li>
      </ol>
      <Term
        word="SCC (általános szerződési klauzulák)"
        def="az Európai Bizottság által jóváhagyott, kötelező szerződéses szövegek. Arra valók, hogy az EU-ból kikerülő adat is uniós szintű védelmet élvezzen: a fogadó fél szerződésben vállalja a GDPR szabályait, és az érintett közvetlenül is felléphet ellene."
      />
      <Note>
        <strong>Amit ígérhetünk:</strong> a gyülekezeti tagok élő adatbázisa, az anyakönyv
        és a pénzügyi nyilvántartás <strong>a napi működés során nem hagyja el az EU-t</strong>.
        A fenti kivételt pedig folyamatosan felülvizsgáljuk — ha uniós alternatíva
        elérhetővé válik (pl. európai mentés-tárhely), átállunk rá.
      </Note>

      <SectionTitle>8. Meddig őrizzük az adatokat?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Egyházi anyakönyvi adatok</strong> (keresztelés, konfirmáció, házasság,
          temetés): <strong>tartósan, időbeli korlát nélkül</strong> — az egyházi rend és a
          levéltári gyakorlat szerint, éppúgy, ahogy a kézzel írott anyakönyvek 100–200 éve
          fennmaradnak. Ez az egyházi közösség öröksége; ezekre a törlési jog korlátozott
          (lásd a 9. szakaszt).</li>
        <li><strong>Élő tagnyilvántartás</strong>: a tagsági viszony fennállásáig, majd
          az azt követő ésszerű ideig (elköltözés, visszaköltözés kezelése). Ezt követően
          az adat archív állományba kerül vagy törlésre kerül.</li>
        <li><strong>Pénzügyi és számviteli adatok</strong>: a romániai számviteli és
          egyházi elszámolási előírások szerinti megőrzési ideig. A gyülekezetre
          irányadó megőrzési idő években:{' '}
          <AdatHU mezo="penzugyiMegorzesEv" />.</li>
        <li><strong>Lelkipásztori (pasztorális) jegyzetek</strong>: amíg a lelkészi
          szolgálat indokolja; a lelkész bármikor törölheti őket.</li>
        <li><strong>Felhasználói fiók</strong>: a hozzáférés megszűnését követően a fiók
          inaktívvá válik, majd a rendszer törli. A törlésig eltelt idő hónapokban:{' '}
          <AdatHU mezo="fiokTorlesHonap" />. A hozzáférés-kérelmek dokumentációját az
          elbírálástól számított ideig őrizzük.</li>
        <li><strong>Biztonsági és hozzáférési naplók</strong>: az elszámoltathatóság
          érdekében tartósan megőrizzük; ezek utólag nem módosíthatók és nem törölhetők.</li>
        <li><strong>Kuka (törölt elemek)</strong>: 30 napig visszaállítható, azután a
          rendszer véglegesen törli.</li>
        <li><strong>Biztonsági mentések</strong>: gördülő rendszerben. A napi mentések
          megőrzési ideje napokban: <AdatHU mezo="mentesMegorzesNap" />. Egy törölt adat
          legkésőbb a mentési ciklus lejártával a mentésekből is eltűnik.</li>
      </ul>

      <SectionTitle>9. Milyen jogai vannak Önnek és a tagoknak?</SectionTitle>
      <p>
        A GDPR az érintetteknek (nálunk: a tagoknak, a hozzátartozóknak és a felhasználóknak)
        az alábbi jogokat adja:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Tájékoztatáshoz való jog</strong> (13–14. cikk) — pontosan ezt olvassa
          most.</li>
        <li><strong>Hozzáférés</strong> (15. cikk) — bárki kikérheti a róla kezelt adatok
          másolatát, és megtudhatja, mire, meddig, kinek.</li>
        <li><strong>Helyesbítés</strong> (16. cikk) — ha valami téves vagy hiányos, kérheti
          a javítást, kiegészítést.</li>
        <li><strong>Törlés („elfeledtetés")</strong> (17. cikk) — bizonyos esetekben kérheti
          az adat törlését. <em>Fontos:</em> az egyházi anyakönyvi bejegyzés megtörtént
          eseményt rögzít, ezért ez a jog itt korlátozott (17. cikk (3) bekezdés). Az élő
          nyilvántartásból viszont a tagsági adat kivezethető, és a kilépés rögzíthető.</li>
        <li><strong>Az adatkezelés korlátozása</strong> (18. cikk) — kérheti, hogy vitatott
          adatot átmenetileg „zároljunk", amíg tisztázódik a helyzet.</li>
        <li><strong>Tiltakozás</strong> (21. cikk) — a jogos érdeken alapuló kezelés ellen
          bármikor tiltakozhat; ilyenkor mérlegelünk, és ha nincs nyomós okunk, leállunk.</li>
        <li><strong>Adathordozhatóság</strong> (20. cikk) — a hozzájáruláson vagy szerződésen
          alapuló, elektronikusan kezelt adatait géppel olvasható formában (pl. Excel/CSV)
          kikérheti, vagy kérheti másik szervezethez való továbbítását.</li>
        <li><strong>Hozzájárulás visszavonása</strong> (7. cikk (3) bekezdés) — ahol
          hozzájárulást adott (pl. fénykép a gyülekezeti weboldalon), azt bármikor,
          indoklás nélkül visszavonhatja. A visszavonás a korábbi kezelést nem teszi
          jogszerűtlenné, de a jövőre nézve leállítja.</li>
        <li><strong>Panasz és bírósági jogorvoslat</strong> (77–79. cikk) — lásd a
          10. szakaszt.</li>
      </ul>
      <p>
        <strong>Hogyan élhet ezekkel?</strong> Írjon a gyülekezet lelkipásztorának (a tagok
        adatainál ő az elsődleges cím), vagy az üzemeltetőnek az 1. szakaszban megadott
        e-mail-címre. A kérést <strong>egy hónapon belül</strong> teljesítjük; ha a kérés
        bonyolult, ezt további két hónappal meghosszabbíthatjuk, de erről egy hónapon belül
        tájékoztatjuk. Az eljárás <strong>díjmentes</strong>. Ha nem tudjuk biztosan, hogy
        a kérelmező valóban az érintett, személyazonosság-igazolást kérhetünk — ez az Ön
        védelmét szolgálja.
      </p>
      <Note>
        <strong>Őszintén:</strong> a rendszerben jelenleg <em>nincs</em> önkiszolgáló
        „töröld az adataimat" gomb a gyülekezeti tagok számára — a kéréseket a lelkipásztor
        és az üzemeltető kézzel, dokumentáltan intézi. Ez nem jogsértés (a GDPR nem gombot
        ír elő, hanem határidőn belüli teljesítést), de tudnia kell, hogy így működik.
      </Note>

      <SectionTitle>10. Panasz és jogorvoslat</SectionTitle>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>Először <strong>a gyülekezet lelkipásztorához</strong>, illetve az{' '}
          <strong>üzemeltetőhöz</strong> forduljon — a legtöbb félreértés egy beszélgetéssel
          tisztázható.</li>
        <li>Ha nem kapott megfelelő választ, panaszt tehet a romániai adatvédelmi hatóságnál
          (<strong>ANSPDCP</strong>) — pontos elérhetőség a <em>Kapcsolat</em> fülön.</li>
        <li>Bírósághoz is fordulhat: a GDPR 79. cikke szerint a per megindítható a lakóhelye
          szerinti tagállamban is.</li>
      </ol>

      <SectionTitle>11. Automatikus döntéshozatal és profilalkotás</SectionTitle>
      <p>
        A Kartotéka <strong>nem hoz automatikus döntést</strong> senkiről, és{' '}
        <strong>nem profiloz</strong>: nem sorol be embereket kategóriákba, nem pontoz,
        nem jósol viselkedést. Ami „automatikus", az kizárólag összeadás és rendezés
        (statisztika, összesítő, listák) — ezek nem járnak joghatással senkire nézve.
      </p>

      <SectionTitle>12. Sütik és technikai tárolás</SectionTitle>
      <p>
        A Kartotéka <strong>nem használ reklám-, követő- vagy statisztikai sütit</strong>,
        ezért nem is jelenik meg süti-elfogadó ablak. Csak olyan tárolás történik, ami a
        szolgáltatás nyújtásához <em>feltétlenül szükséges</em> — ezek az uniós ePrivacy-
        szabályok szerint hozzájárulás nélkül használhatók:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Bejelentkezési süti</strong> (a Supabase munkamenet-sütije) — enélkül
          minden kattintásnál újra be kellene jelentkeznie.</li>
        <li><strong>„Maradjak bejelentkezve" jelző</strong> (<code>session-mode</code>) —
          azt tárolja, hogy a böngésző bezárásakor ki kell-e léptetni.</li>
        <li><strong>Nyitóképernyő-jelző</strong> (<code>kartoteka_splash_shown</code>,
          a böngésző munkamenet-tárában) — hogy a köszöntő animáció munkamenetenként csak
          egyszer fusson le.</li>
        <li><strong>Offline munkatár</strong> (a böngésző IndexedDB tárolója) — a
          gyülekezet adatainak ideiglenes másolata, hogy internet nélkül is tudjon dolgozni.
          Kijelentkezéskor, illetve a böngészőadatok törlésekor ürül.</li>
      </ul>
      <Note>
        <strong>Fontos gyakorlati tanács:</strong> közös vagy nyilvános gépen mindig
        jelentkezzen ki, mert az offline munkatár addig a gépen marad. Ez ugyanaz a
        gondosság, mint a papír-anyakönyvet elzárni a fiókba.
      </Note>

      <SectionTitle>13. Hogyan védjük az adatokat? (a biztonsági rétegek)</SectionTitle>
      <p>
        A Kartotéka <strong>több, egymásra épülő biztonsági réteget</strong> használ. Ezek
        ugyanolyanok, mint amit a banki rendszerek alkalmaznak — a GDPR 32. cikke pontosan
        ilyen „a kockázattal arányos" intézkedéseket vár el:
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
        word="Jelszó-tárolás"
        def="a jelszavát a rendszer SOHA nem tárolja olvasható formában, csak egy visszafejthetetlen matematikai lenyomatot. Ezért nem is tudjuk megmondani, mi a jelszava — csak újat lehet beállítani."
      />
      <Term
        word="Naplózás"
        def="minden érzékeny művelet (pl. ki látta meg az adatot, ki módosította) rögzítve van egy elszámolási naplóban. Ez azt jelenti, hogy ha valaha kérdés merülne fel, percre pontosan megmondható, ki, mit, mikor csinált. Soha nem törölhető."
      />
      <p>
        Ezeken túl: az üzemeltető <strong>adatkezelési nyilvántartást</strong> vezet
        (GDPR 30. cikk), a szolgáltatókkal adatfeldolgozói szerződést köt (28. cikk), és
        a különleges adatok miatt <strong>adatvédelmi hatásvizsgálatot</strong> (DPIA,
        35. cikk) készít:{' '}
        <AdatHU mezo="dpiaAllapot" />.
      </p>
      <Note>
        <strong>Az adatok napi szinten mentésre kerülnek</strong> — ha bármi történne (vírus,
        hardverhiba, emberi tévedés), 24 órán belül vissza tudjuk állítani azokat egy
        biztonsági mentésből. Ez sokkal biztonságosabb, mint a papír — egy elveszett füzetből
        nem lehet visszaállítani semmit.
      </Note>

      <SectionTitle>14. Mi történik adatvédelmi incidens esetén?</SectionTitle>
      <p>
        „Adatvédelmi incidens" az, ha adat illetéktelenhez kerül, elvész, vagy megsérül.
        Ilyenkor a GDPR 33–34. cikke szerint járunk el:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Az incidenst <strong>72 órán belül</strong> bejelentjük a romániai
          adatvédelmi hatóságnak (ANSPDCP), ha az valószínűsíthetően kockázattal jár.</li>
        <li>Ha az incidens <strong>magas kockázatot</strong> jelent az érintettekre,
          <strong> őket is közvetlenül értesítjük</strong> — közérthető nyelven: mi történt,
          mit tettünk, ők mit tehetnek.</li>
        <li>Minden incidenst <strong>belső nyilvántartásba</strong> veszünk, akkor is, ha
          bejelentési kötelezettség nem áll fenn.</li>
        <li>A gyülekezetet mint adatkezelőt <strong>késedelem nélkül</strong> tájékoztatjuk,
          hogy ő is eleget tudjon tenni a saját kötelezettségének.</li>
      </ul>

      <SectionTitle>15. Gyermekek adatai</SectionTitle>
      <p>
        A rendszer <strong>kiskorúak adatait is kezeli</strong>: keresztelt gyermekek,
        konfirmandusok, hittanosok, gyermekek a családi kartonon. Ezért:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A gyermekre vonatkozó adatokat a <strong>szülő vagy törvényes képviselő</strong>{' '}
          adja meg, és az érintetti jogokat is ő gyakorolja a gyermek nevében.</li>
        <li>Ahol <strong>hozzájárulás</strong> a jogalap (pl. fénykép a gyülekezeti
          weboldalon, tábor-beszámoló), ott <strong>a szülő hozzájárulása szükséges</strong>.
          Romániában a 190/2018. sz. törvény az információs társadalommal összefüggő
          szolgáltatásoknál <strong>16 évben</strong> határozza meg azt a korhatárt, amely
          fölött a gyermek maga is érvényesen hozzájárulhat.</li>
        <li>Gyermek adatát <strong>nyilvánosan soha nem tesszük közzé</strong> a szülő
          kifejezett hozzájárulása nélkül.</li>
        <li>Nagykorúvá válás után a fiatal maga is gyakorolhatja a jogait — kérheti a
          nyilvános megjelenés visszavonását.</li>
      </ul>

      <SectionTitle>16. Az egyházi hierarchia és a hozzáférések</SectionTitle>
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

      <SectionTitle>17. Ki mit lát pontosan?</SectionTitle>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Gyülekezet — Lelkipásztor
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          A <strong>saját gyülekezetének teljes</strong> adatát látja: tagokat, családokat,
          anyakönyvi eseményeket, pénzügyet, programokat, sírhelyeket, a saját pasztorális
          jegyzeteit. Más gyülekezetbe NEM lát be. A pasztorális (lelkészi) jegyzetekhez
          rajta kívül senki más nem fér hozzá — ezeket az ő szolgálati titkaként kezeljük.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Gyülekezet — Könyvelő
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          CSAK az általa kiszolgált gyülekezet <strong>pénzügyi adatait</strong> látja
          (befizetések, kiadások). A személyes, anyakönyvi, pasztorális adatokhoz NEM fér
          hozzá. Egy könyvelő több gyülekezetet is segíthet — ez a profilváltási rendszerrel
          történik.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Egyházmegye — Esperes / Egyházmegyei admin
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          KIZÁRÓLAG az <strong>egyházmegyéhez tartozó gyülekezetek éves kötelező
          összesítőit</strong> látja: éves tagság-számokat, keresztelések száma, házasságok,
          temetések száma, gyülekezeti járulékok összesítve. <strong>Egyetlen tag személyes
          adatát sem látja!</strong> Ha mégis részletes információra van szüksége
          (pl. fegyelmi eljárás), azt a gyülekezet lelkészével közvetlenül egyezteti.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Egyházmegye — Számvevő (pénzügyi ellenőr)
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          CSAK <strong>az ellenőrzési időszakban</strong> és CSAK a <strong>pénzügyi
          összesítőket</strong> látja. Nem férhet hozzá tagok személyes adataihoz, lelkészi
          jegyzetekhez. Az ellenőrzési időszak végén a hozzáférése automatikusan korlátozódik.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Egyházkerület — Egyházkerületi admin / EREK hivatalvezető
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          CSAK a <strong>kerület-szintű, agregált összesítőket</strong> látja: az
          egyházmegyéktől beérkező éves jelentések összesítését. Az egyes gyülekezeti tagok
          személyes adataihoz <strong>NEM fér hozzá</strong>. A rendszer szerkezete éppen erre
          van tervezve: a kerület a STATISZTIKA és a JELENTÉSEK szintjén dolgozik, nem a
          személyes adat szintjén.
        </p>
      </div>

      <div className="my-3 rounded-2xl border border-border bg-muted p-4">
        <p className="text-[14px] font-semibold text-foreground mb-1">
          Rendszergazda — Szőcs Endre lelkipásztor
        </p>
        <p className="text-[13px] text-foreground mt-1">
          Technikai jogkörben gondozza a rendszert: hibakeresés, frissítések, biztonsági
          mentés. <strong>Egy gyülekezet adataihoz CSAK az adott gyülekezet lelkészének
          előzetes és kifejezett engedélyével férhet hozzá.</strong> Ez az engedély:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-[13px] text-foreground mt-2">
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

      <SectionTitle>18. Ki látta az adataimat? — naplózás</SectionTitle>
      <p>
        Ha egy gyülekezeti tag rákérdez: „ki látta az adataimat?" — <strong>bármikor pontos
        választ tudunk adni</strong>. Minden hozzáférést rögzítünk: ki jelentkezett be, mit
        nézett meg, mit módosított, mikor. Ezeket a naplókat a rendszergazda sem tudja
        törölni — egyfajta „adatvédelmi feketedoboz" a Kartotéka mélyén.
      </p>
      <p>
        Ha egy érintett (tag) kéri, megmutatjuk neki a saját adatait érintő összes
        naplóbejegyzést — átláthatóan, érthető magyar nyelven, nem pedig technikai naplók
        formájában.
      </p>

      <SectionTitle>19. A tájékoztató módosítása</SectionTitle>
      <p>
        A jogszabályok és a rendszer is változik, ezért ezt a tájékoztatót időről időre
        frissítjük. A jelenlegi verzió: <strong>{LEGAL_VERSION}</strong>, hatályos{' '}
        <strong>{LEGAL_EFFECTIVE_DATE}</strong> napjától. Lényeges változás esetén a
        felhasználókat előzetesen értesítjük (e-mailben vagy a rendszerbe lépéskor
        megjelenő üzenetben), a korábbi verziókat pedig megőrizzük, hogy visszakereshető
        legyen, mikor mi volt hatályban.
      </p>

      <SectionTitle>20. Felelősségi nyilatkozat</SectionTitle>
      <p>
        Tisztelettel közöljük, hogy a Kartotéka rendszert <em>úgy ahogy van</em> állítjuk
        rendelkezésre — a tőlünk telhető legnagyobb gondossággal építettük és tartjuk karban.
        Az üzemeltető (Szőcs Endre lelkipásztor) és a szellemi alapot adó személy (Beke
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
      <p className="text-[13px] text-muted-foreground">
        A felelősség e korlátozása nem érinti azokat az eseteket, amelyekben a jog a
        felelősség kizárását nem engedi meg — így különösen a szándékosan vagy súlyos
        gondatlansággal okozott kárt, az életet, testi épséget vagy egészséget sértő
        károkozást, valamint a GDPR 82. cikke szerinti, adatvédelmi jogsértésből eredő
        kártérítési felelősséget.
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
      <p className="text-[12.5px] text-muted-foreground">
        Verzió: {LEGAL_VERSION} — hatályos {LEGAL_EFFECTIVE_DATE} napjától.
      </p>

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

      <SectionTitle>1. A szerződő felek</SectionTitle>
      <p>
        <strong>Üzemeltető (szolgáltató):</strong> Szőcs Endre református lelkipásztor.
        E-mail: <AdatHU mezo="adatvedelmiEmail" />. Postai cím: <AdatHU mezo="postaiCim" />.
        Jogi státusz: <AdatHU mezo="jogiStatusz" />. Adószám: <AdatHU mezo="adoszam" />.
      </p>
      <p>
        <strong>Felhasználó:</strong> az a gyülekezet, egyházmegye vagy egyházkerület,
        illetve annak nevében eljáró tisztségviselő, aki a rendszerhez jóváhagyott
        hozzáférést kapott.
      </p>
      <p>
        <strong>Szellemi alap:</strong> Beke Tivadar egyházi nyilvántartási rendszerének
        digitális továbbfejlesztése.
      </p>
      <Note>
        A Kartotéka <strong>nem fogyasztói szolgáltatás</strong>: egyházi szervezetek belső
        igazgatási eszköze, amelyet tisztségviselők a szolgálatuk keretében használnak.
        Ha valamely felhasználó mégis fogyasztónak minősülne, az őt megillető, jogszabályon
        alapuló jogokat a jelen ÁSZF nem korlátozza.
      </Note>

      <SectionTitle>2. Mi a Kartotéka rendszer?</SectionTitle>
      <p>
        A Kartotéka egy <strong>egyházi nyilvántartó program</strong>, amelyet a református
        gyülekezeti élet támogatására fejlesztettünk. Tagnyilvántartást, anyakönyvet,
        pénzügyet, anyakönyvi eseményeket, programokat, leltárt, iktatást, sírhelyeket és
        lelkészi munkanaplót egyaránt kezel, három szinten: gyülekezet, egyházmegye,
        egyházkerület.
      </p>
      <p>
        A szolgáltatás <strong>böngészőn keresztül</strong> érhető el (webalkalmazás),
        illetve asztali (offline is működő) programként. A rendszert folyamatosan
        fejlesztjük: új modulok jelenhetnek meg, régiek átalakulhatnak.
      </p>

      <SectionTitle>3. Ki használhatja?</SectionTitle>
      <p>
        A rendszer használatához <strong>kerületi jóváhagyás</strong> szükséges. Ez azt jelenti,
        hogy az üzemeltető ellenőrzi, hogy Ön valóban jogosult-e a megjelölt szerepkörre —
        például egy lelkészi hozzáférést csak az adott gyülekezet jelenlegi lelkésze kaphat meg.
      </p>
      <Term
        word="Kerületi jóváhagyás"
        def="az Erdélyi Református Egyházkerület (EREK) szervezeti szintjén történő ellenőrzés. Nem egy idegen hatóság — a saját egyházszervezete biztosítja, hogy csak az illetékes személy férjen az adatokhoz."
      />
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A hozzáférés <strong>személyre szól, és nem ruházható át</strong>. Közös fiók
          használata tilos — enélkül a naplózás értelmetlenné válna.</li>
        <li>A jóváhagyás általában <strong>1–3 munkanap</strong>. Sürgős esetben (pl. átvétel
          egy elhunyt lelkész utódaként) gyorsított ügyintézést is biztosítunk.</li>
        <li>Ha a tisztsége megszűnik (áthelyezés, nyugdíjazás, lemondás), azt{' '}
          <strong>köteles jelezni</strong>, hogy a hozzáférést lezárhassuk.</li>
      </ul>

      <SectionTitle>4. A szolgáltatás díjazása</SectionTitle>
      <p>
        A Kartotéka rendszer használati díjáról és feltételeiről az EREK-gyülekezetek a
        kerületi adminisztratív csatornákon keresztül kapnak részletes tájékoztatást:{' '}
        <AdatHU mezo="aszfDijazas" />.
        Az üzemeltető a szolgáltatás működtetésével és karbantartásával kapcsolatos
        kérdésekben mindig a gyülekezetek mellett áll.
      </p>

      <SectionTitle>5. Mire kéri Önt a rendszer? (a felhasználó kötelezettségei)</SectionTitle>
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
          e-mailben), <strong>azonnal jelezze az üzemeltetőnek</strong>. Nem zavaró kérdés —
          jobb egyszer feleslegesen szólni, mint bajba kerülni.</li>
        <li><strong>Tilos megkerülni a biztonsági mechanizmusokat</strong> — pl. más
          szerepkörrel próbálni belépni, harmadik személynek adatot „kifolyatni",
          automatizált eszközzel tömegesen lekérdezni, a rendszert visszafejteni.</li>
        <li><strong>Tartsa be az adatvédelmi szabályokat.</strong> A gyülekezet mint adatkezelő
          felel a tagok adataiért; a lelkipásztor gondoskodik arról, hogy csak az lássa őket,
          akinek szolgálati oka van rá. Papírra nyomtatott listát ne hagyjon őrizetlenül.</li>
      </ul>

      <SectionTitle>6. Mit tehet az üzemeltető?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Karbantartási időszakra <strong>időszakosan elérhetetlenné tenni</strong> a rendszert
          (általában éjszaka, vagy hétvégén — előzetes értesítéssel)</li>
        <li>A hozzáférést <strong>azonnali hatállyal felfüggeszteni</strong>, ha valaki a
          szabályokat megszegi (pl. visszaél az adatokkal, vagy egyházi rendet sért)</li>
        <li>A rendszert <strong>fejleszteni, módosítani</strong> — új modulokat, javításokat
          beépíteni</li>
        <li>Új <strong>adatfeldolgozót (alvállalkozót)</strong> bevonni, ha az a szolgáltatás
          működtetéséhez szükséges; erről az Adatvédelmi tájékoztató 6. szakasza ad naprakész
          listát</li>
      </ul>

      <SectionTitle>7. Rendelkezésre állás — mit ígérünk és mit nem</SectionTitle>
      <p>
        Törekszünk a folyamatos, zavartalan működésre, és a hibákat a lehető leggyorsabban
        javítjuk. Ugyanakkor <strong>nem vállalunk szerződéses rendelkezésre állási
        garanciát</strong> (SLA-t): a rendszert egyházi szolgálatként, nem üzleti
        szolgáltatásként üzemeltetjük.
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A tervezett karbantartásról előre értesítünk.</li>
        <li>Az adatokról <strong>napi biztonsági mentés</strong> készül.</li>
        <li>Az asztali (offline) program internet nélkül is használható, és visszatéréskor
          szinkronizál — így egy szolgáltatáskiesés sem állítja meg a szolgálatot.</li>
      </ul>

      <SectionTitle>8. „Úgy, ahogy van" — az „<em>as is</em>" elv</SectionTitle>
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

      <SectionTitle>9. Felelősség-korlátozás</SectionTitle>
      <p>
        Az üzemeltető (Szőcs Endre lelkipásztor) és a szellemi alapot adó személy (Beke
        Tivadar) <strong>nem vállal felelősséget</strong>:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A felhasználó által rosszul beadott vagy hiányos adatok következményeiért</li>
        <li>A felhasználó által okozott adatvesztésért, adatmódosításért</li>
        <li>Harmadik fél (pl. internet-szolgáltató, áramszolgáltató) miatti
          szolgáltatáskiesésért</li>
        <li>Vis maior okozta károkért (lásd lent)</li>
        <li>A rendszer használatából eredő közvetett vagy következményi károkért
          (elmaradt haszon, adatvesztésből eredő közvetett kár, jó hírnév sérelme)</li>
      </ul>
      <Term
        word="Vis maior"
        def={'latin: „nagyobb erő". Olyan helyzet, amit emberi módon nem lehet befolyásolni — pl. földrengés, tűzvész, háború, járvány, hatósági lezárás, kibertámadás. A jog elismeri, hogy ilyen esetekben senki nem felel azért, ami elromlik.'}
      />
      <p className="text-[13px] text-muted-foreground">
        <strong>Amit a jog nem enged kizárni, azt nem is zárjuk ki:</strong> a szándékosan
        vagy súlyos gondatlansággal okozott kárért, az életet, testi épséget vagy egészséget
        sértő károkozásért, valamint a GDPR 82. cikke szerinti adatvédelmi kártérítési
        felelősségért a felelősség a jogszabály szerint fennáll. Ezen kívül az üzemeltető
        felelőssége — amennyiben a jog ezt megengedi — legfeljebb a kárt megelőző tizenkét
        hónapban a felhasználó által ténylegesen megfizetett díj összegére korlátozódik;
        díjmentes használat esetén a felelősség a jogszabályi minimumra szorítkozik.
      </p>

      <SectionTitle>10. Adatvédelem és adatfeldolgozás</SectionTitle>
      <p>
        Az adatok kezelésének részletes szabályait külön <strong>Adatvédelmi
        tájékoztatóban</strong> írtuk le — kérjük, azt is olvassa végig.
      </p>
      <p>
        A gyülekezeti tagok adatai tekintetében <strong>a gyülekezet az adatkezelő</strong>,
        az üzemeltető pedig <strong>adatfeldolgozóként</strong> jár el. Ez azt jelenti, hogy
        az üzemeltető a gyülekezet utasítása szerint dolgozik, az adatokat saját célra nem
        használja, titoktartásra kötelezett, és a szolgáltatás megszűnésekor az adatokat a
        gyülekezet rendelkezése szerint kiadja vagy törli. A GDPR 28. cikke ehhez írásbeli
        adatfeldolgozói szerződést kíván meg:{' '}
        <AdatHU mezo="dpaAllapot" />.
      </p>

      <SectionTitle>11. Szellemi tulajdon</SectionTitle>
      <p>
        A Kartotéka rendszer kódja, dizájnja és dokumentációja a fejlesztő (Szőcs Endre)
        szellemi tulajdona. Az EREK-gyülekezetek <strong>nem kizárólagos, át nem ruházható
        használati jogot</strong> kapnak — ez azt jelenti, hogy szabadon használhatják a saját
        gyülekezetükben, de a rendszert nem értékesíthetik tovább, nem másolhatják le más
        célra, és nem fejthetik vissza.
      </p>
      <p>
        <strong>A gyülekezet által bevitt adat a gyülekezeté marad.</strong> Az üzemeltető
        ezen semmilyen tulajdonjogot nem szerez, és nem használja fel más célra.
      </p>
      <p>
        A „Kartotéka" elnevezés és a rendszer egyházi szellemi alapja{' '}
        <strong>Beke Tivadar</strong> munkájára vezethető vissza. Az ő úttörő rendszerét
        tisztelettel megőrizzük és digitális formába öntjük.
      </p>

      <SectionTitle>12. A hozzáférés megszűnése és az adatok sorsa</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>A <strong>felhasználó</strong> bármikor kérheti a hozzáférése megszüntetését.</li>
        <li>Az <strong>üzemeltető</strong> megszüntetheti a hozzáférést, ha a felhasználó
          súlyosan megszegi ezeket a feltételeket, ha megszűnik a tisztsége, vagy ha a
          szolgáltatást beszünteti — utóbbi esetben ésszerű felmondási idővel és előzetes
          értesítéssel.</li>
        <li>Megszűnés esetén a gyülekezet <strong>kérheti az adatai kiadását</strong> géppel
          olvasható formában (pl. Excel/CSV). Az adatkiadás határideje a kérés
          beérkezésétől számítva, napokban:{' '}
          <AdatHU mezo="aszfAdatkiadasNap" />.</li>
        <li>Az adatok végleges törlésére a kiadási határidő letelte után kerül sor, az
          Adatvédelmi tájékoztató 8. szakaszában írt megőrzési idők figyelembevételével.</li>
        <li>Azok a rendelkezések, amelyek természetüknél fogva a megszűnést is túlélik
          (titoktartás, szellemi tulajdon, felelősség-korlátozás), a jogviszony megszűnése
          után is hatályban maradnak.</li>
      </ul>

      <SectionTitle>13. Az ÁSZF módosítása</SectionTitle>
      <p>
        Az élet változik — új technológiák, új törvények érkeznek, új igények születnek.
        Ezért az ÁSZF-et időről-időre módosíthatjuk. Minden lényeges változásról{' '}
        <strong>előzetesen, legalább 15 nappal korábban tájékoztatjuk</strong> a felhasználókat
        (e-mailben vagy a rendszerbe lépéskor megjelenő üzenetben). Ha a változás után tovább
        használja a rendszert, az az új ÁSZF elfogadását jelenti — éppúgy, mint amikor egy új
        zsoltáros könyvet vesz használatba. Ha nem ért egyet, a hozzáférés megszüntetését
        kérheti.
      </p>

      <SectionTitle>14. Kapcsolattartás</SectionTitle>
      <p>
        A hivatalos értesítéseket a felhasználó által megadott e-mail-címre küldjük, illetve
        a rendszerbe lépéskor megjelenő üzenetben tesszük közzé. A felhasználó az
        üzemeltetőt az 1. pontban megadott elérhetőségeken, illetve a rendszerbe épített
        támogatási (hibajegy) felületen keresi meg.
      </p>

      <SectionTitle>15. Irányadó jog, vitarendezés, részleges érvénytelenség</SectionTitle>
      <p>
        A jelen ÁSZF-re a <strong>romániai jog</strong> az irányadó, a kötelezően alkalmazandó
        uniós jogszabályokkal (különösen a GDPR-ral) együtt. Ha bármilyen vita lenne
        — amit nem szeretnénk, és reményeink szerint sosem fordul elő —, a felek először{' '}
        <strong>békés úton</strong>, illetve az egyházi szervezeti rend szerinti egyeztetéssel
        próbálják rendezni. Ha ez nem sikerül, az illetékes romániai bíróság rendelkezik
        joghatósággal.
      </p>
      <p className="text-[13px] text-muted-foreground">
        Ha a jelen feltételek valamely rendelkezése érvénytelennek bizonyulna, az a többi
        rendelkezés érvényességét nem érinti; az érvénytelen rendelkezés helyébe a hozzá
        legközelebb álló, érvényes szabály lép.
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

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        🏠 Irányítópult (kezdőlap)
      </h4>
      <p>
        A bejelentkezés utáni első oldal. Egy pillantásra látja: tagok száma, családok száma,
        éves pénzforgalom, születésnapok, közelgő alkalmak, koreloszlás-grafikon, friss
        bejegyzések.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        👥 Tagnyilvántartás
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Tagok és családok</strong> — egyének, családi kapcsolatok, családfa</li>
        <li><strong>Körzetek</strong> — gyülekezeti területi felosztás (presbiteri gondozás)</li>
        <li><strong>Presbiterek</strong> — gondozott körzetek és tisztségek</li>
        <li><strong>Választók</strong> — választói névjegyzék</li>
        <li><strong>Áttekintés</strong> — összesített statisztikák</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
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

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
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

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        📅 Munkanapló
      </h4>
      <p>
        Lelkészi szolgálatok rögzítése: igehirdetés, igét hirdetett (vasárnap, ünnep), keresztelés,
        házasságkötés, temetés, látogatás, jubileumi alkalom, hivatalos egyházi tanácskozás.
        Havi és éves összegzés.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        📦 Leltár
      </h4>
      <p>
        Gyülekezeti vagyontárgyak nyilvántartása: liturgikus tárgyak (kelyhek, anyakönyvek),
        bútorok, hangszerek, ingatlanok, anyagraktár (építőanyag, takarítószer). Mozgások:
        kölcsönvétel, javítás, elhasználás.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        📁 Iktatás
      </h4>
      <p>
        Bejövő és kimenő iratok nyilvántartása sorszámmal, dátummal, tárggyal,
        címzettel/feladóval. Iktatókönyv-nyomtatás, keresés, archiválás.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        📜 Jegyzőkönyvek
      </h4>
      <p>
        Presbiteri ülések, közgyűlések jegyzőkönyveinek <strong>sablon-alapú generálása</strong>:
        napirend, határozatok, jelenlét rögzítése. PDF-export. Régi jegyzőkönyvek importja Excel-ből.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        ⚰️ Sírhelyek
      </h4>
      <p>
        Temető-nyilvántartás: parcella, sor, sír-szám, megváltási idő, családi kapcsolatok,
        sírkő-állapot. Térkép-szerű elrendezés, lekérdezhető temetésekkel.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        📊 Éves jelentés
      </h4>
      <p>
        Az év végén kötelező egyházmegyei jelentés <strong>automatikus generálása</strong> a
        rendszer-adatokból. PDF + prezentáció-nézet a presbiteri ülésre. Az esperes csak az
        elkészült jelentést látja, részletes adatokhoz nem fér.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        🌐 Publikus gyülekezeti oldal
      </h4>
      <p>
        A gyülekezet saját, nyilvános weboldala (`gy/[slug]`). <strong>Egyetlen kapcsolóval
        bekapcsolható</strong>. Tartalom: alkalmak, hírek, kapcsolat, magazin (cikk-szerű
        bejegyzések), „Rólunk" oldal. A téma a gyülekezet választott vizuális témájához
        igazodik (Csendes parókia / Kerített kert / Zsoltáros).
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        💡 Missziós Műhely
      </h4>
      <p>
        Közösségi tér, ahol a lelkészek megoszthatnak ötleteket, segédanyagokat, és kérdéseket.
        <strong> Gamification-rendszer</strong>: pontok, jelvények, szintek bátorítanak a
        közösségi szolgálatra. Almenük: Kezdőlap, Segédanyagok, Fórum, Jutalmak, Profil.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
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

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        🔧 Admin (csak rendszergazdai szerepkörrel)
      </h4>
      <ul className="list-disc pl-6 space-y-1">
        <li>Felhasználók kezelése, hozzáférés-kérelmek elbírálása</li>
        <li>Gyülekezetek és egyházmegyék felvitele</li>
        <li>Eszközök / licencek</li>
        <li>Broadcast-üzenet (rendszer-szintű hírek minden felhasználónak)</li>
        <li>Adatminőségi jelzések, audit-naplók</li>
      </ul>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
        🗑️ Kuka és Visszaállítás
      </h4>
      <p>
        Törölt elemek 30 napig visszaállíthatók a Kukából. Utána automatikusan végleges
        törlés.
      </p>

      <h4 className="mt-5 mb-2 font-heading text-[14px] font-semibold text-primary">
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
        <strong>Adatvédelmi tájékoztató</strong> 3. szakaszában találja.
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

      <h4 className="mt-6 mb-2 font-heading text-[15px] font-semibold text-primary">
        🛡️ Adatvédelem és adatbiztonság — gyakori kérdések
      </h4>

      <SectionTitle>Ki látja az adataimat?</SectionTitle>
      <p>
        Csak az, akinek a <strong>szerepköre</strong> megengedi. A gyülekezet teljes adatát
        egyedül a saját lelkipásztora látja; a könyvelő csak a pénzügyet; az esperes és a
        kerület <strong>kizárólag az éves összesítőket</strong>, tehát egyetlen tag személyes
        adatát sem. A lelkipásztori (pasztorális) jegyzeteket rajta kívül senki. Ezt nem
        ígéret tartja be, hanem a szervergép: minden lekérdezésnél sor-szintű
        jogosultság-ellenőrzés fut (RLS), és ha nincs jogosultság, üres választ ad.
      </p>

      <SectionTitle>Hol tárolódnak az adatok? Kikerülnek-e az EU-ból?</SectionTitle>
      <p>
        Az adatbázis <strong>Frankfurtban</strong> (Németország), az alkalmazás{' '}
        <strong>Amszterdamban</strong> (Hollandia) fut — mindkettő az EU-ban. A napi működés
        során az adat nem hagyja el az Uniót. <strong>Egyetlen kivétel van</strong>, és ezt
        őszintén megmondjuk: a napi biztonsági mentés a Google Drive-ba kerül (uniós
        garanciákkal: megfelelőségi határozat és általános szerződési klauzulák). Részletek
        az Adatvédelmi tájékoztató 6–7. szakaszában.
      </p>

      <SectionTitle>Van a rendszerben mesterséges intelligencia (AI)?</SectionTitle>
      <p>
        <strong>Nincs.</strong> A Kartotékában nem működik AI-csevegő és nem működik
        AI-asszisztens. Amit a rendszerbe beír, az nem kerül nyelvi modellt üzemeltető
        szolgáltatóhoz — a gyülekezet adatai kizárólag az Adatvédelmi tájékoztatóban
        felsorolt adatfeldolgozókhoz jutnak el.
      </p>

      <SectionTitle>Hogyan kérhetem az adataim törlését?</SectionTitle>
      <p>
        Írjon a gyülekezet lelkipásztorának, vagy az üzemeltetőnek a Kapcsolat fülön megadott
        címre. A kérést <strong>egy hónapon belül, díjmentesen</strong> teljesítjük.
        Két dolgot érdemes előre tudni:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Az élő tagnyilvántartásból</strong> az adat kivezethető, a kilépés
          rögzíthető, az elérhetőségek törölhetők.</li>
        <li><strong>Az egyházi anyakönyvi bejegyzés</strong> viszont megtörtént eseményt
          rögzít (keresztelés, esketés, temetés), ezért ezt a GDPR 17. cikk (3) bekezdése
          alapján megőrizzük — éppúgy, ahogy a 150 éves kézzel írt anyakönyveket sem
          radírozzuk ki.</li>
      </ul>
      <p>
        Ugyanígy kérhető: <strong>másolat</strong> a kezelt adatokról, <strong>javítás</strong>,{' '}
        <strong>korlátozás</strong>, <strong>tiltakozás</strong>, valamint a
        gyülekezeti weboldalon való megjelenéshez adott <strong>hozzájárulás
        visszavonása</strong>.
      </p>
      <Note>
        <strong>Őszintén:</strong> önkiszolgáló „töröld az adataimat" gomb jelenleg
        <strong> nincs</strong> a rendszerben — a kéréseket kézzel, dokumentáltan intézzük.
        Ez így is megfelel a jognak (a GDPR határidőt ír elő, nem gombot), de jó, ha tudja.
      </Note>

      <SectionTitle>Egy tag megkérdezi: „ki nézte meg az adataimat?"</SectionTitle>
      <p>
        Erre <strong>pontos választ tudunk adni</strong>. Minden érzékeny művelet naplózva
        van: ki lépett be, mit nézett meg, mit módosított, mikor. A naplót senki — még az
        üzemeltető — sem tudja törölni. Ha egy tag kéri, közérthető formában megmutatjuk neki
        a rá vonatkozó bejegyzéseket.
      </p>

      <SectionTitle>Mi történik a biztonsági mentésekkel?</SectionTitle>
      <p>
        A rendszer <strong>naponta</strong> teljes mentést készít, titkosított állományként.
        Ha baj történik (vírus, hardverhiba, emberi tévedés), az adatok visszaállíthatók.
        A mentések gördülő rendszerben egy meghatározott ideig őrződnek, azután automatikusan
        felülíródnak — így egy törölt adat végül a mentésekből is eltűnik. Mentést csak az
        üzemeltető tud visszaállítani, és ez is naplózott művelet.
      </p>

      <SectionTitle>Hogyan működik a három szint (hatókör)?</SectionTitle>
      <p>
        A rendszer az egyházi szervezeti rendet tükrözi: <strong>gyülekezet → egyházmegye →
        egyházkerület</strong>. Mindenki csak a saját szintjét látja, és fölfelé csak az
        halad, amit az egyházi rend előír:
      </p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Gyülekezet</strong> — teljes részletesség, de csak a sajátja.</li>
        <li><strong>Egyházmegye</strong> — a hozzá tartozó gyülekezetek <em>éves
          összesítői</em> (létszám, keresztelések, esketések, temetések, járulék összesítve),
          valamint a hozzá beküldött iratok. Egyéni tagadat nincs benne.</li>
        <li><strong>Egyházkerület</strong> — az egyházmegyék összesítőinek összesítése:
          statisztika és jelentés szintjén dolgozik.</li>
      </ul>
      <p>
        A könyvelő és a számvevő külön, szűkebb hatókört kap: csak pénzügyi adatot lát,
        a számvevő pedig csak az ellenőrzési időszakban.
      </p>

      <SectionTitle>Használ a rendszer sütiket? Miért nincs süti-ablak?</SectionTitle>
      <p>
        Azért nincs, mert <strong>nem használunk reklám-, követő- vagy statisztikai sütit</strong>.
        Csak olyan technikai tárolás történik, ami a belépéshez és a működéshez feltétlenül
        szükséges (bejelentkezési süti, a „maradjak bejelentkezve" jelző, a köszöntő képernyő
        egyszeri megjelenítése, és az offline munkatár a böngészőben). Az uniós szabályok
        szerint ezekhez nem kell hozzájárulást kérni.
      </p>
      <Note>
        <strong>Közös vagy nyilvános gépen mindig jelentkezzen ki</strong> — az offline
        munkatár addig a gépen marad. Ez ugyanaz a gondosság, mint a papír-anyakönyvet
        elzárni a fiókba.
      </Note>

      <SectionTitle>Mi történik, ha adatvédelmi incidens van?</SectionTitle>
      <p>
        Ha adat illetéktelenhez kerül, elvész vagy megsérül, azt <strong>72 órán belül</strong>{' '}
        bejelentjük a romániai adatvédelmi hatóságnak (ANSPDCP), ha kockázattal jár; magas
        kockázat esetén <strong>az érintetteket is közvetlenül értesítjük</strong>, közérthető
        nyelven. Az érintett gyülekezetet mindenképpen, késedelem nélkül tájékoztatjuk.
        Ha Ön gyanút fog (idegen belépési kísérlet, kiszivárgott jelszó, adathalász levél),
        azonnal jelezze.
      </p>

      <SectionTitle>Meddig őrzi a rendszer az adatokat?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Anyakönyvi adatok</strong> — tartósan, az egyházi rend szerint.</li>
        <li><strong>Élő tagnyilvántartás</strong> — a tagsági viszony fennállásáig, plusz
          ésszerű idő.</li>
        <li><strong>Pénzügyi adatok</strong> — a számviteli előírások szerinti megőrzési ideig.</li>
        <li><strong>Kuka</strong> — a törölt elemek 30 napig visszaállíthatók, azután a
          rendszer véglegesen törli őket.</li>
        <li><strong>Naplók</strong> — az elszámoltathatóság érdekében tartósan.</li>
      </ul>

      <SectionTitle>Kell-e a gyülekezetnek saját adatvédelmi tájékoztató?</SectionTitle>
      <p>
        Igen, érdemes. A tagok adatainak <strong>a gyülekezet az adatkezelője</strong> — a
        Kartotéka csak az eszköz. Praktikus megoldás: a jelen tájékoztatót kinyomtatva
        kifüggeszteni a hirdetőtáblára, a gyülekezeti weboldalra kitenni, és a
        keresztelési/esketési adatlapon egy mondattal utalni rá. Ha ebben segítség kell,
        írjon az üzemeltetőnek.
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
      <div className="rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Szőcs Endre református lelkipásztor
        </p>
        <p className="text-[13px] text-muted-foreground">
          Az Erdélyi Református Egyházkerület (EREK) megbízásából a Kartotéka rendszer
          fejlesztője, üzemeltetője, és egyben az adatkezelő.
        </p>
      </div>
      <ul className="list-disc pl-6 space-y-1">
        <li>E-mail (adatvédelmi ügyek is):{' '}
          <AdatHU mezo="adatvedelmiEmail" /></li>
        <li>Postai cím: <AdatHU mezo="postaiCim" /></li>
        <li>Telefon: <AdatHU mezo="telefon" /></li>
        <li>Adatvédelmi tisztviselő (DPO):{' '}
          <AdatHU mezo="dpoElerhetoseg" /></li>
      </ul>
      <p>
        A rendszerben <strong>belső üzenet</strong> (támogatási hibajegy) küldési lehetőség is
        rendelkezésre áll a bejelentkezést követően. Az egyházkerületi hivatal és a kerületi
        adminisztratív csatornák szintén továbbítják a megkereséseket.
      </p>
      <Note>
        <strong>Kihez forduljon egy gyülekezeti tag?</strong> A tagok adatainak{' '}
        <em>adatkezelője a gyülekezet</em>, ezért az érintetti kérelmeket (adatmásolat,
        helyesbítés, törlés, tiltakozás) elsősorban <strong>a gyülekezet
        lelkipásztorához</strong> kell címezni. Ha a lelkipásztor technikai segítséget kér, ő
        fordul az üzemeltetőhöz. Minden kérelemre <strong>egy hónapon belül, díjmentesen</strong>{' '}
        válaszolunk.
      </Note>

      <SectionTitle>A rendszer szellemi alapja</SectionTitle>
      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Beke Tivadar
        </p>
        <p className="text-[13px] text-muted-foreground">
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
      <div className="rounded-2xl border border-border bg-muted/60 p-4">
        <p className="text-[14px] font-semibold text-foreground">
          ANSPDCP — Romániai Adatvédelmi Hatóság
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Cím: B-dul G-ral. Gheorghe Magheru 28-30, 010336 București, Románia
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Telefon: +40 318 059 211 &nbsp;·&nbsp; Fax: +40 318 059 602
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          E-mail: anspdcp (kukac) dataprotection.ro
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Webhely: <em>www.dataprotection.ro</em>
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          A panasz a hatóság honlapján elérhető űrlapon, postai úton vagy e-mailben is
          benyújtható. A GDPR 79. cikke alapján bírósághoz is fordulhat — akár a saját
          lakóhelye szerinti tagállamban.
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
      <p className="text-[12.5px] text-muted-foreground">
        Versiunea {LEGAL_VERSION} — în vigoare din {LEGAL_EFFECTIVE_DATE}. Această notă este
        redactată conform art. 12–14 din Regulamentul (UE) 2016/679 (GDPR) și Legii nr.
        190/2018.
      </p>

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

      <SectionTitle>1. Cine prelucrează datele? — cele două niveluri</SectionTitle>
      <p>
        <strong>Congregația (parohia) este operatorul de date</strong> pentru datele
        membrilor, ale familiilor, ale registrelor ecleziastice și ale contribuțiilor. Ea
        decide cine este înregistrat, ce se consemnează și cât timp se păstrează.
      </p>
      <p>
        <strong>Administratorul sistemului Kartotéka — pastorul reformat Endre Szőcs</strong>{' '}
        acționează ca <strong>persoană împuternicită de operator</strong> (procesator),
        adică prelucrează datele congregației exclusiv pe baza instrucțiunilor acesteia.
        Totodată este <em>operator</em> pentru un cerc restrâns de date proprii sistemului:
        conturile de utilizator, cererile de acces, jurnalele de securitate și mesajele de
        asistență.
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Nume: <strong>pastorul reformat Endre Szőcs</strong></li>
        <li>E-mail: <AdatRO mezo="adatvedelmiEmail" /></li>
        <li>Adresă poștală: <AdatRO mezo="postaiCim" /></li>
        <li>Statut juridic: <AdatRO mezo="jogiStatusz" /></li>
        <li>CUI: <AdatRO mezo="adoszam" /></li>
        <li>Responsabil cu protecția datelor (DPO): <AdatRO mezo="dpoElerhetoseg" /></li>
      </ul>

      <SectionTitle>2. Baza spirituală a sistemului</SectionTitle>
      <p>
        Baza spirituală a sistemului este sistemul de evidență bisericească al lui{' '}
        <strong>Tivadar Beke</strong>, dezvoltat în formă digitală cu respect și fidelitate
        față de tradiția reformată.
      </p>

      <SectionTitle>3. Ce categorii de date prelucrăm?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Date de identificare și de contact:</strong> nume (inclusiv numele de
          naștere), locul și data nașterii, numele mamei, adresă, telefon, e-mail, stare
          civilă, legături de familie, ocupație (facultativ).</li>
        <li><strong>Categorii speciale de date (art. 9 GDPR):</strong> apartenența
          religioasă și calitatea de membru, evenimentele ecleziastice (botez, confirmare,
          cununie, înmormântare), precum și <em>însemnările pastorale</em>, dacă pastorul
          consemnează asemenea note.</li>
        <li><strong>Date financiare:</strong> contribuția bisericească anuală, donații,
          chitanțe, evidența locurilor de veci.</li>
        <li><strong>Date de utilizator și tehnice:</strong> cont (nume, e-mail, rol,
          congregație, parola stocată exclusiv sub formă de amprentă criptografică
          ireversibilă), cererea de acces, jurnale de autentificare și de operare
          (inclusiv adresa IP în jurnalele de securitate), mesaje de asistență.</li>
      </ul>
      <Note>
        <strong>Nu prelucrăm:</strong> date privind sănătatea, opinii politice, orientare
        sexuală, date biometrice sau genetice. Sistemul nu stochează date de card bancar.
        <strong> CNP-ul nu este un câmp obligatoriu</strong> — art. 4 din Legea 190/2018
        impune garanții suplimentare pentru prelucrarea numărului de identificare național.
      </Note>

      <SectionTitle>4. Sursa datelor și caracterul furnizării</SectionTitle>
      <p>
        Conform art. 14 GDPR vă comunicăm sursa datelor: de la persoana vizată însăși; din
        evidențele anterioare pe hârtie ale congregației (registre, fișe); din evidențe
        electronice anterioare (import Excel); de la aparținători (de exemplu la
        înmormântare); de la slujitorii congregației (presbiteri, curator, contabil).
        <strong> Nu colectăm date din surse public accesibile</strong> (rețele sociale, baze
        de date publice).
      </p>
      <p>
        Datele de bază necesare calității de membru și serviciilor religioase sunt o condiție
        prevăzută de rânduiala bisericească — fără ele slujba nu poate fi înregistrată în
        registru. Restul datelor (telefon, e-mail, ocupație) se furnizează voluntar, iar
        lipsa lor nu atrage niciun dezavantaj.
      </p>

      <SectionTitle>5. Scopurile și temeiurile legale</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Evidența membrilor, registre ecleziastice, grijă pastorală</strong> —
          art. 6 alin. (1) lit. f) (interesul legitim al parohiei de a-și ține evidența
          membrilor) și lit. c) (obligația de înregistrare bisericească); pentru datele
          speciale: <strong>art. 9 alin. (2) lit. d)</strong> — prelucrare internă, cu
          garanții adecvate, de către un organism cu scop religios, privind membrii sau
          foștii membri.</li>
        <li><strong>Contribuții, donații, contabilitatea congregației</strong> — art. 6
          alin. (1) lit. c) (obligații legale contabile) și lit. f) (control intern).</li>
        <li><strong>Conturi de utilizator, cereri de acces, asistență</strong> — art. 6
          alin. (1) lit. b) (executarea raportului contractual).</li>
        <li><strong>Jurnalizare, prevenirea abuzurilor, copii de siguranță</strong> — art. 6
          alin. (1) lit. f) și art. 32 (securitatea prelucrării).</li>
        <li><strong>Pagina web publică a congregației, fotografii, buletin informativ</strong>{' '}
          — art. 6 alin. (1) lit. a) — <strong>consimțământ</strong>, care poate fi retras
          oricând, fără justificare.</li>
      </ul>
      <Note>
        Datele nu sunt niciodată vândute și nu sunt transmise în scopuri de marketing.
      </Note>

      <SectionTitle>6. Unde sunt stocate datele? Persoane împuternicite</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Supabase</strong> (Frankfurt am Main, Germania, UE) — bază de date
          PostgreSQL cu criptare AES-256, certificare SOC 2 Type 2 și ISO 27001</li>
        <li><strong>Railway</strong> și rețeaua <strong>Cloudflare</strong> (Amsterdam,
          Olanda, UE) — găzduirea aplicației, protecție împotriva atacurilor DDoS</li>
        <li><strong>Brevo</strong> (Franța, UE) — trimiterea e-mailurilor de sistem; primește
          doar numele, adresa de e-mail și textul mesajului</li>
        <li><strong>Google Drive</strong> — stocarea copiei zilnice de siguranță (criptată);
          a se vedea secțiunea 7</li>
        <li><strong>Oblio</strong> (România, UE) — facturare electronică, doar dacă
          congregația activează acest modul</li>
      </ul>
      <p>
        Cu fiecare dintre aceștia există un <strong>acord de prelucrare a datelor (DPA)</strong>{' '}
        conform art. 28 GDPR. În rest, transmitem date doar dacă legea ne obligă, ori dacă
        rânduiala bisericească o prevede (rapoartele anuale către protopopiat și eparhie).
      </p>

      <SectionTitle>7. Transferuri în afara UE și garanțiile aplicabile</SectionTitle>
      <p>
        <strong>Funcționarea zilnică se desfășoară integral în UE.</strong> Există însă o
        singură excepție, pe care o declarăm deschis:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li><strong>Copia zilnică de siguranță</strong> ajunge în Google Drive. Google LLC
          este un furnizor din Statele Unite; transferul se întemeiază pe decizia de
          adecvare a Comisiei Europene privind <strong>Cadrul UE–SUA privind
          confidențialitatea datelor</strong>, completată cu <strong>clauzele contractuale
          standard (SCC)</strong>. Fișierul este criptat.</li>
      </ol>

      <SectionTitle>8. Cât timp păstrăm datele?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Registrele ecleziastice</strong> (botez, confirmare, cununie,
          înmormântare) — permanent, conform rânduielii bisericești și practicii arhivistice.</li>
        <li><strong>Evidența curentă a membrilor</strong> — pe durata calității de membru,
          plus o perioadă rezonabilă.</li>
        <li><strong>Date financiare și contabile</strong> — pe durata prevăzută de legislația
          contabilă. Durata de păstrare, în ani:{' '}
          <AdatRO mezo="penzugyiMegorzesEv" />.</li>
        <li><strong>Însemnări pastorale</strong> — atât timp cât slujirea o justifică.</li>
        <li><strong>Cont de utilizator</strong> — după încetarea accesului contul devine
          inactiv, apoi se șterge. Termenul de ștergere, în luni:{' '}
          <AdatRO mezo="fiokTorlesHonap" />.</li>
        <li><strong>Jurnale de securitate</strong> — permanent, pentru responsabilizare;
          nu pot fi modificate sau șterse.</li>
        <li><strong>Coșul de gunoi</strong> — elementele șterse pot fi restaurate 30 de zile,
          apoi sunt șterse definitiv.</li>
        <li><strong>Copii de siguranță</strong> — în sistem rotativ. Durata de păstrare,
          în zile: <AdatRO mezo="mentesMegorzesNap" />.</li>
      </ul>

      <SectionTitle>9. Drepturile persoanelor vizate</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Informare</strong> (art. 13–14)</li>
        <li><strong>Acces</strong> la date și la o copie a acestora (art. 15)</li>
        <li><strong>Rectificare</strong> (art. 16)</li>
        <li><strong>Ștergere</strong> (art. 17) — limitată pentru registrele ecleziastice,
          conform art. 17 alin. (3)</li>
        <li><strong>Restricționarea prelucrării</strong> (art. 18)</li>
        <li><strong>Portabilitatea datelor</strong> (art. 20) — în format lizibil automat
          (de ex. Excel/CSV)</li>
        <li><strong>Opoziție</strong> (art. 21)</li>
        <li><strong>Retragerea consimțământului</strong> (art. 7 alin. 3), oricând, fără
          justificare</li>
      </ul>
      <p>
        Cererile se adresează pastorului congregației sau administratorului sistemului.
        Răspundem <strong>în termen de o lună</strong>, gratuit; în cazuri complexe termenul
        poate fi prelungit cu două luni, cu informarea prealabilă. Dacă avem îndoieli
        justificate privind identitatea solicitantului, putem cere dovada identității.
      </p>
      <Note>
        <strong>Sincer:</strong> în sistem nu există (încă) un buton de autoservire pentru
        ștergerea datelor — cererile sunt soluționate manual și documentat. Acest lucru este
        conform legii, care impune un termen, nu un buton.
      </Note>

      <SectionTitle>10. Plângeri și căi de atac</SectionTitle>
      <p>
        Mai întâi adresați-vă pastorului sau administratorului sistemului. Dacă nu primiți un
        răspuns satisfăcător, puteți depune plângere la <strong>ANSPDCP</strong> (datele de
        contact în fila Contact) și vă puteți adresa instanței competente (art. 77–79 GDPR).
      </p>

      <SectionTitle>11. Decizii automate și crearea de profiluri</SectionTitle>
      <p>
        Sistemul <strong>nu ia decizii automate</strong> și <strong>nu creează profiluri</strong>.
        Operațiile automate se rezumă la însumări și sortări (statistici, rapoarte), fără
        efecte juridice asupra persoanelor.
      </p>

      <SectionTitle>12. Cookie-uri și stocare tehnică</SectionTitle>
      <p>
        Nu folosim cookie-uri de publicitate, de urmărire sau de statistică — de aceea nu
        apare nicio fereastră de consimțământ. Utilizăm doar stocarea{' '}
        <strong>strict necesară</strong> funcționării: cookie-ul de sesiune (autentificare),
        indicatorul „păstrează-mă autentificat" (<code>session-mode</code>), indicatorul
        ecranului de întâmpinare (<code>kartoteka_splash_shown</code>) și memoria offline a
        browserului (IndexedDB). Pe un calculator comun deconectați-vă întotdeauna.
      </p>

      <SectionTitle>13. Securitatea datelor</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>TLS 1.3</strong> — criptarea comunicării</li>
        <li><strong>RLS (Row Level Security)</strong> — verificare la nivel de înregistrare</li>
        <li><strong>RBAC</strong> — control al accesului bazat pe roluri</li>
        <li><strong>Confirmare suplimentară</strong> — cod separat pentru operațiuni
          administrative sensibile (autentificarea în doi pași la nivel de cont este
          disponibilă opțional, cu coduri de rezervă)</li>
        <li><strong>Parole</strong> — stocate exclusiv sub formă de amprentă ireversibilă</li>
        <li><strong>Jurnalizare</strong> — toate accesările sunt înregistrate</li>
        <li><strong>Copii de siguranță zilnice</strong></li>
      </ul>
      <p>
        Operatorul ține <strong>evidența activităților de prelucrare</strong> (art. 30) și,
        având în vedere categoriile speciale de date, întocmește o{' '}
        <strong>evaluare a impactului (DPIA, art. 35)</strong>:{' '}
        <AdatRO mezo="dpiaAllapot" />.
      </p>

      <SectionTitle>14. Incidente de securitate</SectionTitle>
      <p>
        În caz de încălcare a securității datelor notificăm ANSPDCP{' '}
        <strong>în termen de 72 de ore</strong> (art. 33) și, dacă riscul este ridicat,
        informăm direct persoanele vizate (art. 34). Congregația este informată fără
        întârziere.
      </p>

      <SectionTitle>15. Datele copiilor</SectionTitle>
      <p>
        Sistemul prelucrează și date ale minorilor (botezați, confirmanzi, copii în fișa de
        familie). Datele sunt furnizate de <strong>părinte sau reprezentantul legal</strong>,
        care exercită și drepturile în numele copilului. Acolo unde temeiul este
        consimțământul (fotografii pe pagina web, relatări de tabără) este necesar{' '}
        <strong>consimțământul părintelui</strong>; Legea 190/2018 stabilește vârsta de{' '}
        <strong>16 ani</strong> pentru consimțământul valabil al copilului în cazul
        serviciilor societății informaționale. Datele copiilor nu sunt publicate fără acordul
        expres al părintelui.
      </p>

      <SectionTitle>16. Ierarhia bisericească și accesul</SectionTitle>
      <Note>
        <strong>Nu vă temeți!</strong> Districtul și protopopiatul văd <em>doar rapoartele
        anuale obligatorii</em>. Pentru date detaliate este necesar acordul pastorului
        congregației — chiar și administratorul sistemului poate accesa datele exclusiv cu
        permisiunea expresă a pastorului.
      </Note>

      <SectionTitle>17. Cine vede ce?</SectionTitle>
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

      <SectionTitle>18. Modificarea acestei note</SectionTitle>
      <p>
        Versiunea curentă: <strong>{LEGAL_VERSION}</strong>, în vigoare din{' '}
        <strong>{LEGAL_EFFECTIVE_DATE}</strong>. Modificările importante sunt anunțate în
        prealabil, iar versiunile anterioare se păstrează.
      </p>

      <SectionTitle>19. Limitarea răspunderii</SectionTitle>
      <p>
        Sistemul este furnizat „așa cum este". Administratorul (Endre Szőcs) și persoana
        bazei spirituale (Tivadar Beke) nu răspund pentru: erori de introducere, pierderi
        cauzate de utilizator, întreruperi cauzate de terți, forță majoră, daune indirecte.
        Această limitare nu se aplică în cazurile în care legea nu permite exonerarea — în
        special dolul, culpa gravă, vătămarea vieții sau sănătății, precum și răspunderea
        pentru despăgubiri prevăzută de art. 82 GDPR.
      </p>
    </>
  )
}

/* ================== ROMÁN — TERMS ================== */

function TermsRO() {
  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        Versiunea {LEGAL_VERSION} — în vigoare din {LEGAL_EFFECTIVE_DATE}.
      </p>

      <p>
        Stimate Pastor! Aceste reguli stabilesc folosirea pașnică și clară a sistemului
        Kartotéka pentru toți utilizatorii.
      </p>

      <Note>
        <strong>Încurajare:</strong> Kartotéka este un instrument de slujire bisericească.
        Termenii sunt scriși pentru folosirea cu conștiință curată — orice congregație poate
        beneficia de pe urma sa.
      </Note>

      <SectionTitle>1. Părțile</SectionTitle>
      <p>
        <strong>Operator (furnizor):</strong> pastorul reformat Endre Szőcs.
        E-mail: <AdatRO mezo="adatvedelmiEmail" />. Adresă poștală: <AdatRO mezo="postaiCim" />.
        Statut juridic: <AdatRO mezo="jogiStatusz" />. CUI: <AdatRO mezo="adoszam" />.
      </p>
      <p>
        <strong>Utilizator:</strong> congregația, protopopiatul sau eparhia, respectiv
        slujitorul care acționează în numele acestora și care a primit acces aprobat.
      </p>
      <p>
        <strong>Bază spirituală:</strong> sistemul de evidență bisericească al lui Tivadar
        Beke, dezvoltat digital.
      </p>
      <Note>
        Kartotéka <strong>nu este un serviciu destinat consumatorilor</strong>, ci un
        instrument intern de administrare pentru organizații bisericești. Dacă totuși un
        utilizator ar avea calitatea de consumator, drepturile sale legale nu sunt limitate
        de prezenții termeni.
      </Note>

      <SectionTitle>2. Descrierea serviciului</SectionTitle>
      <p>
        Kartotéka este un program de evidență bisericească: evidența membrilor, registre
        ecleziastice, finanțe, jurnal de lucru, inventar, înregistrarea documentelor, locuri
        de veci — pe trei niveluri: congregație, protopopiat, eparhie. Accesul se face prin
        browser, respectiv prin aplicația desktop care funcționează și offline. Sistemul este
        dezvoltat continuu: pot apărea module noi, iar cele existente se pot modifica.
      </p>

      <SectionTitle>3. Cine poate folosi sistemul?</SectionTitle>
      <p>
        Accesul necesită <strong>aprobare la nivel de district</strong> de către
        administratorul sistemului. Răspunsul ajunge de obicei în 1–3 zile lucrătoare.
        Accesul este <strong>personal și netransferabil</strong>; conturile comune sunt
        interzise, deoarece ar face imposibilă jurnalizarea. Încetarea funcției (transfer,
        pensionare, demisie) trebuie anunțată, pentru închiderea accesului.
      </p>

      <SectionTitle>4. Tarifare</SectionTitle>
      <p>
        Despre tariful și condițiile sistemului congregațiile primesc informații prin canalele
        administrative ale districtului:{' '}
        <AdatRO mezo="aszfDijazas" />.
      </p>

      <SectionTitle>5. Obligațiile utilizatorului</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Utilizare exclusiv în scop bisericesc</li>
        <li>Date corecte și actualizate</li>
        <li>Confidențialitatea parolei (schimbată anual)</li>
        <li>Anunțarea imediată a oricărei suspiciuni administratorului</li>
        <li>Interzisă ocolirea mecanismelor de securitate, interogarea automatizată în masă
          și decompilarea sistemului</li>
        <li>Respectarea regulilor de protecție a datelor: congregația răspunde ca operator
          pentru datele membrilor; listele tipărite nu se lasă nesupravegheate</li>
      </ul>

      <SectionTitle>6. Drepturile operatorului</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Întreruperi de mentenanță (cu anunțare prealabilă)</li>
        <li>Suspendarea accesului în caz de încălcare a regulilor</li>
        <li>Dezvoltarea și modificarea sistemului</li>
        <li>Implicarea de noi persoane împuternicite (subcontractanți) necesare funcționării;
          lista actualizată se află în secțiunea 6 a Politicii de confidențialitate</li>
      </ul>

      <SectionTitle>7. Disponibilitate</SectionTitle>
      <p>
        Ne străduim să asigurăm funcționarea neîntreruptă, însă <strong>nu oferim o garanție
        contractuală de disponibilitate (SLA)</strong>: sistemul este operat ca slujire
        bisericească, nu ca serviciu comercial. Mentenanța planificată este anunțată în
        prealabil, se efectuează copii zilnice de siguranță, iar aplicația desktop
        funcționează și fără internet.
      </p>

      <SectionTitle>8. Principiul „as is"</SectionTitle>
      <p>
        Sistemul este furnizat în forma actuală — cu toate caracteristicile și limitările
        sale. Nu se garantează funcționare fără erori sau disponibilitate continuă.
      </p>

      <SectionTitle>9. Limitarea răspunderii</SectionTitle>
      <p>
        Administratorul (Endre Szőcs) și persoana bazei spirituale (Tivadar Beke) nu
        răspund pentru: date introduse greșit, pierderi cauzate de utilizator, întreruperi de
        servicii ale terților, forță majoră (dezastre naturale, atacuri cibernetice), daune
        indirecte sau consecutive.
      </p>
      <p className="text-[13px] text-muted-foreground">
        Nu excludem răspunderea acolo unde legea nu permite: pentru dol sau culpă gravă,
        pentru vătămarea vieții, integrității corporale sau sănătății, precum și pentru
        despăgubirile prevăzute de art. 82 GDPR. În rest, răspunderea operatorului se
        limitează — în măsura permisă de lege — la valoarea tarifelor efectiv achitate în
        ultimele douăsprezece luni; în cazul utilizării gratuite, la minimul legal.
      </p>

      <SectionTitle>10. Protecția datelor și prelucrarea</SectionTitle>
      <p>
        Detaliile se află în Politica de confidențialitate. Pentru datele membrilor{' '}
        <strong>congregația este operatorul</strong>, iar operatorul sistemului acționează ca{' '}
        <strong>persoană împuternicită</strong>: prelucrează numai pe baza instrucțiunilor,
        este ținut de confidențialitate, iar la încetarea serviciului predă sau șterge datele
        conform dispoziției congregației. Art. 28 GDPR impune un acord scris:{' '}
        <AdatRO mezo="dpaAllapot" />.
      </p>

      <SectionTitle>11. Proprietate intelectuală</SectionTitle>
      <p>
        Codul, designul și documentația sunt proprietatea intelectuală a dezvoltatorului
        (Endre Szőcs). Congregațiile primesc un drept de utilizare neexclusiv și
        netransferabil. <strong>Datele introduse rămân ale congregației.</strong> Denumirea
        „Kartotéka" și baza ecleziastică se trag din munca lui Tivadar Beke.
      </p>

      <SectionTitle>12. Încetarea accesului și soarta datelor</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Utilizatorul poate cere oricând încetarea accesului.</li>
        <li>Operatorul poate înceta accesul în caz de încălcare gravă, la încetarea funcției
          sau la sistarea serviciului, cu preaviz rezonabil.</li>
        <li>La încetare, congregația poate cere <strong>exportul datelor</strong> în format
          lizibil automat. Termenul de predare, în zile:{' '}
          <AdatRO mezo="aszfAdatkiadasNap" />.</li>
        <li>Clauzele privind confidențialitatea, proprietatea intelectuală și limitarea
          răspunderii rămân în vigoare și după încetare.</li>
      </ul>

      <SectionTitle>13. Modificarea termenilor</SectionTitle>
      <p>
        Termenii pot fi modificați. Schimbările importante sunt anunțate cu cel puțin 15 zile
        înainte. Utilizarea continuă înseamnă acceptarea noilor termeni; în caz contrar puteți
        cere încetarea accesului.
      </p>

      <SectionTitle>14. Comunicări</SectionTitle>
      <p>
        Notificările oficiale se trimit la adresa de e-mail indicată de utilizator sau se
        afișează la autentificare. Utilizatorul contactează operatorul prin datele de la
        pct. 1 sau prin sistemul de tichete integrat.
      </p>

      <SectionTitle>15. Jurisdicție și nulitate parțială</SectionTitle>
      <p>
        Se aplică legea română, împreună cu normele europene obligatorii (în special GDPR).
        Pentru dispute se urmărește mai întâi rezolvarea pașnică, respectiv medierea pe cale
        bisericească; în caz contrar, jurisdicția aparține instanțelor române competente.
      </p>
      <p className="text-[13px] text-muted-foreground">
        Dacă o clauză ar fi nulă, celelalte rămân valabile, iar clauza nulă se înlocuiește cu
        regula valabilă cea mai apropiată de intenția părților.
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

      <h4 className="mt-6 mb-2 font-heading text-[15px] font-semibold text-primary">
        🛡️ Protecția datelor — întrebări frecvente
      </h4>

      <SectionTitle>Cine îmi vede datele?</SectionTitle>
      <p>
        Doar cine are rolul potrivit. Datele complete ale congregației le vede numai pastorul
        propriu; contabilul doar finanțele; protopopul și eparhia{' '}
        <strong>exclusiv rapoartele anuale agregate</strong>, deci nicio dată personală
        individuală. Însemnările pastorale nu sunt vizibile pentru nimeni altcineva.
        Verificarea se face la nivel de înregistrare (RLS) la fiecare interogare.
      </p>

      <SectionTitle>Unde sunt stocate datele? Ies din UE?</SectionTitle>
      <p>
        Baza de date se află la <strong>Frankfurt</strong>, aplicația la{' '}
        <strong>Amsterdam</strong> — ambele în UE. În funcționarea zilnică datele nu părăsesc
        Uniunea. Există <strong>o singură excepție</strong>: copia zilnică de siguranță
        (Google Drive, cu decizie de adecvare și clauze contractuale standard).
      </p>

      <SectionTitle>Există inteligență artificială (AI) în sistem?</SectionTitle>
      <p>
        <strong>Nu.</strong> În Kartotéka nu funcționează niciun asistent AI. Ceea ce
        scrieți în sistem nu ajunge la niciun furnizor de modele lingvistice — datele
        congregației ajung numai la persoanele împuternicite enumerate în Nota de informare
        privind protecția datelor.
      </p>

      <SectionTitle>Cum pot cere ștergerea datelor mele?</SectionTitle>
      <p>
        Scrieți pastorului congregației sau administratorului sistemului (fila Contact).
        Răspundem <strong>în termen de o lună, gratuit</strong>. Din evidența curentă datele
        pot fi scoase; <strong>înregistrările din registrele ecleziastice</strong> se
        păstrează însă, conform art. 17 alin. (3) GDPR, pentru că atestă evenimente
        petrecute. Tot astfel puteți cere: o copie a datelor, rectificare, restricționare,
        opoziție sau retragerea consimțământului pentru pagina web.
      </p>
      <Note>
        Momentan nu există un buton de autoservire pentru ștergere — cererile se
        soluționează manual și documentat, în termenul legal.
      </Note>

      <SectionTitle>Ce se întâmplă cu copiile de siguranță?</SectionTitle>
      <p>
        Sistemul face <strong>zilnic</strong> o copie completă, criptată. La nevoie datele pot
        fi restaurate. Copiile se păstrează în sistem rotativ o perioadă determinată, apoi se
        suprascriu — astfel o dată ștearsă dispare în final și din copii. Restaurarea o poate
        face doar administratorul, iar operația este jurnalizată.
      </p>

      <SectionTitle>Cum funcționează cele trei niveluri?</SectionTitle>
      <p>
        <strong>Congregație → protopopiat → eparhie.</strong> Congregația vede totul despre
        sine; protopopiatul doar rapoartele anuale ale congregațiilor sale și documentele
        primite; eparhia doar sinteza rapoartelor. Contabilul și cenzorul au un domeniu și mai
        restrâns, exclusiv financiar.
      </p>

      <SectionTitle>Folosiți cookie-uri? De ce nu apare bannerul?</SectionTitle>
      <p>
        Pentru că nu folosim cookie-uri de publicitate, urmărire sau statistică. Există doar
        stocarea strict necesară (autentificare, „păstrează-mă autentificat", ecranul de
        întâmpinare, memoria offline din browser), pentru care legislația UE nu cere
        consimțământ. Pe un calculator comun deconectați-vă întotdeauna.
      </p>

      <SectionTitle>Ce se întâmplă în caz de incident de securitate?</SectionTitle>
      <p>
        Notificăm ANSPDCP <strong>în 72 de ore</strong>, iar dacă riscul este ridicat,
        informăm direct persoanele vizate. Congregația este anunțată fără întârziere. Dacă
        observați ceva suspect (încercare de autentificare necunoscută, parolă compromisă,
        e-mail de tip phishing), anunțați imediat.
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
      <div className="rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Pastorul reformat Endre Szőcs
        </p>
        <p className="text-[13px] text-muted-foreground">
          Dezvoltatorul și administratorul sistemului Kartotéka, în numele Eparhiei Reformate
          din Ardeal (KEK). Pentru datele membrilor{' '}
          <strong>congregația este operatorul</strong>, iar administratorul acționează ca
          persoană împuternicită.
        </p>
      </div>
      <ul className="list-disc pl-6 space-y-1 mt-2">
        <li>E-mail: <AdatRO mezo="adatvedelmiEmail" /></li>
        <li>Adresă poștală: <AdatRO mezo="postaiCim" /></li>
        <li>Telefon: <AdatRO mezo="telefon" /></li>
        <li>DPO: <AdatRO mezo="dpoElerhetoseg" /></li>
      </ul>
      <Note>
        Cererile persoanelor vizate (copie, rectificare, ștergere, opoziție) se adresează în
        primul rând <strong>pastorului congregației</strong>. Răspundem{' '}
        <strong>în termen de o lună, gratuit</strong>.
      </Note>

      <SectionTitle>Baza spirituală</SectionTitle>
      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Tivadar Beke
        </p>
        <p className="text-[13px] text-muted-foreground">
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
      <div className="rounded-2xl border border-border bg-muted/60 p-4">
        <p className="text-[14px] font-semibold text-foreground">
          ANSPDCP — Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
          Caracter Personal
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          B-dul G-ral. Gheorghe Magheru 28-30, 010336 București, România
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Telefon: +40 318 059 211 &nbsp;·&nbsp; Fax: +40 318 059 602
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          E-mail: anspdcp (at) dataprotection.ro
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Web: <em>www.dataprotection.ro</em>
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Plângerea se poate depune prin formularul de pe site, prin poștă sau prin e-mail.
          Conform art. 79 GDPR vă puteți adresa și instanței competente.
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
      <p className="text-[12.5px] text-muted-foreground">
        Version {LEGAL_VERSION} — effective from {LEGAL_EFFECTIVE_DATE}. This notice is drawn
        up under Articles 12–14 of Regulation (EU) 2016/679 (GDPR) and Romanian Law
        190/2018.
      </p>

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

      <SectionTitle>1. Who processes the data? — the two layers</SectionTitle>
      <p>
        <strong>The congregation (parish) is the data controller</strong> for member,
        family, register and contribution data. It decides who is recorded, what is entered
        and how long it is kept.
      </p>
      <p>
        <strong>The operator of Kartotéka — Reverend Endre Szőcs</strong> acts as a{' '}
        <strong>processor</strong>, handling congregation data solely on the congregation's
        instructions. He is a <em>controller</em> only for a narrow set of system-level data:
        user accounts, access requests, security logs and support messages.
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Name: <strong>Reverend Endre Szőcs</strong></li>
        <li>E-mail: <AdatEN mezo="adatvedelmiEmail" /></li>
        <li>Postal address: <AdatEN mezo="postaiCim" /></li>
        <li>Legal status: <AdatEN mezo="jogiStatusz" /></li>
        <li>Tax number: <AdatEN mezo="adoszam" /></li>
        <li>Data Protection Officer (DPO): <AdatEN mezo="dpoElerhetoseg" /></li>
      </ul>

      <SectionTitle>2. The system's spiritual foundation</SectionTitle>
      <p>
        The spiritual foundation of the system is <strong>Tivadar Beke</strong>'s church
        record-keeping system, faithfully developed into digital form with respect for the
        Reformed tradition.
      </p>

      <SectionTitle>3. What categories of data do we process?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Identification and contact data:</strong> name (including birth name),
          place and date of birth, mother's name, address, phone, e-mail, marital status,
          family relations, occupation (optional).</li>
        <li><strong>Special categories (Art. 9 GDPR):</strong> religious affiliation and
          church membership, ecclesiastical events (baptism, confirmation, marriage,
          funeral), and <em>pastoral notes</em> where the pastor keeps such notes.</li>
        <li><strong>Financial data:</strong> annual church contribution, donations, receipts
          (chitanță), cemetery plot records.</li>
        <li><strong>User and technical data:</strong> account (name, e-mail, role,
          congregation, password stored only as an irreversible cryptographic hash), access
          request, sign-in and operation logs (including IP address in security logs),
          support messages.</li>
      </ul>
      <Note>
        <strong>What we do NOT process:</strong> health data, political opinions, sexual
        orientation, biometric or genetic data. The system stores no payment card numbers.
        The Romanian national identification number (CNP) is not a mandatory field —
        Article 4 of Law 190/2018 requires additional safeguards for it.
      </Note>

      <SectionTitle>4. Source of the data, and is providing it mandatory?</SectionTitle>
      <p>
        As required by Article 14 GDPR, the sources are: the data subject; the congregation's
        earlier paper records (registers, index cards); earlier electronic records (Excel
        import); relatives (for example at a funeral); and congregation office-holders
        (presbyters, curator, bookkeeper). <strong>We do not collect data from publicly
        accessible sources</strong> such as social media or public databases.
      </p>
      <p>
        The core data needed for church membership and for services (baptism, marriage,
        funeral) is a requirement of church order — without it the service cannot be entered
        in the register. All other data (phone, e-mail, occupation) is voluntary and its
        absence carries no disadvantage.
      </p>

      <SectionTitle>5. Purposes and legal bases</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Member records, church registers, pastoral care</strong> — Art. 6(1)(f)
          (the parish's legitimate interest in keeping records of its membership) and
          Art. 6(1)(c) (church record-keeping obligation); for special category data:{' '}
          <strong>Art. 9(2)(d)</strong> — internal processing with appropriate safeguards by
          a not-for-profit body with a religious aim, relating to its members or former
          members.</li>
        <li><strong>Contributions, donations, congregation accounting</strong> — Art. 6(1)(c)
          (legal accounting obligations) and Art. 6(1)(f) (internal control).</li>
        <li><strong>User accounts, access requests, support</strong> — Art. 6(1)(b)
          (performance of the service relationship).</li>
        <li><strong>Security logging, abuse prevention, backups</strong> — Art. 6(1)(f) and
          Art. 32 (security of processing).</li>
        <li><strong>Public congregation website, photographs, newsletter</strong> —
          Art. 6(1)(a) <strong>consent</strong>, which may be withdrawn at any time without
          giving reasons.</li>
      </ul>
      <Note>
        Data is never sold and never shared for marketing purposes.
      </Note>

      <SectionTitle>6. Where is the data stored? Processors</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Supabase</strong> (Frankfurt am Main, Germany, EU) — PostgreSQL database
          with AES-256 encryption, SOC 2 Type 2 and ISO 27001 certified</li>
        <li><strong>Railway</strong> and the <strong>Cloudflare</strong> network (Amsterdam,
          Netherlands, EU) — application hosting, DDoS protection, automatic restart</li>
        <li><strong>Brevo</strong> (France, EU) — system e-mails; receives only the
          recipient's name, e-mail address and the message text</li>
        <li><strong>Google Drive</strong> — storage of the encrypted daily backup; see
          section 7</li>
        <li><strong>Oblio</strong> (Romania, EU) — electronic invoicing, only where the
          congregation switches the module on</li>
      </ul>
      <p>
        A <strong>data processing agreement (DPA)</strong> under Article 28 GDPR is in place
        with each of them. Otherwise data is disclosed only where the law requires it, or
        where church order provides for it (annual summaries to the presbytery and the
        district).
      </p>

      <SectionTitle>7. Does data leave the EU?</SectionTitle>
      <p>
        <strong>Day-to-day operation takes place entirely within the EU.</strong> There is
        a single exception, which we state openly:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li><strong>The daily backup</strong> is stored in Google Drive. Google LLC is a
          United States provider; the transfer relies on the European Commission's adequacy
          decision for the <strong>EU–US Data Privacy Framework</strong>, supplemented by the
          EU <strong>Standard Contractual Clauses (SCC)</strong>. The backup file is
          encrypted.</li>
      </ol>

      <SectionTitle>8. How long do we keep the data?</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Church register data</strong> (baptism, confirmation, marriage, funeral)
          — permanently, in line with church order and archival practice.</li>
        <li><strong>Live member records</strong> — for the duration of membership plus a
          reasonable period.</li>
        <li><strong>Financial and accounting data</strong> — for the statutory retention
          period. Retention period, in years: <AdatEN mezo="penzugyiMegorzesEv" />.</li>
        <li><strong>Pastoral notes</strong> — as long as the pastoral ministry justifies it.</li>
        <li><strong>User account</strong> — deactivated when access ends, then deleted.
          Time until deletion, in months: <AdatEN mezo="fiokTorlesHonap" />.</li>
        <li><strong>Security and access logs</strong> — kept permanently for accountability;
          they cannot be altered or deleted.</li>
        <li><strong>Recycle bin</strong> — deleted items can be restored for 30 days, after
          which the system deletes them permanently.</li>
        <li><strong>Backups</strong> — on a rolling basis. Retention, in days:{' '}
          <AdatEN mezo="mentesMegorzesNap" />.</li>
      </ul>

      <SectionTitle>9. Data subject rights</SectionTitle>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Information</strong> (Art. 13–14)</li>
        <li><strong>Access</strong> and a copy of the data (Art. 15)</li>
        <li><strong>Rectification</strong> (Art. 16)</li>
        <li><strong>Erasure</strong> (Art. 17) — limited for permanent church registers under
          Art. 17(3)</li>
        <li><strong>Restriction of processing</strong> (Art. 18)</li>
        <li><strong>Data portability</strong> (Art. 20) — in a machine-readable format
          (e.g. Excel/CSV)</li>
        <li><strong>Objection</strong> (Art. 21)</li>
        <li><strong>Withdrawal of consent</strong> (Art. 7(3)) at any time, without giving
          reasons</li>
      </ul>
      <p>
        Requests may be addressed to the congregation's pastor or to the system operator. We
        respond <strong>within one month</strong>, free of charge; for complex requests the
        deadline may be extended by two months, with prior notice. Where we have reasonable
        doubts about the identity of the requester, we may ask for proof of identity.
      </p>
      <Note>
        <strong>Honestly:</strong> there is currently no self-service „delete my data" button
        in the system — requests are handled manually and documented. This complies with the
        law, which prescribes a deadline rather than a button.
      </Note>

      <SectionTitle>10. Complaints and remedies</SectionTitle>
      <p>
        Please first contact the pastor or the system operator. If you are not satisfied, you
        may lodge a complaint with <strong>ANSPDCP</strong> (contact details on the Contact
        tab) and bring proceedings before the competent court (Art. 77–79 GDPR).
      </p>

      <SectionTitle>11. Automated decision-making and profiling</SectionTitle>
      <p>
        The system makes <strong>no automated decisions</strong> and does{' '}
        <strong>no profiling</strong>. Automated operations are limited to sums and sorting
        (statistics, reports) with no legal effect on any person.
      </p>

      <SectionTitle>12. Cookies and technical storage</SectionTitle>
      <p>
        We use <strong>no advertising, tracking or analytics cookies</strong>, which is why
        no consent banner appears. Only <strong>strictly necessary</strong> storage is used:
        the session (sign-in) cookie, the „keep me signed in" flag (<code>session-mode</code>),
        the welcome-screen flag (<code>kartoteka_splash_shown</code>) and the browser's
        offline working store (IndexedDB). Always sign out on a shared or public computer.
      </p>

      <SectionTitle>13. Data security</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>TLS 1.3</strong> — communication encryption</li>
        <li><strong>RLS (Row Level Security)</strong> — record-level verification</li>
        <li><strong>RBAC</strong> — role-based access control</li>
        <li><strong>Extra confirmation</strong> — a separate confirmation code for sensitive
          administrative operations (optional account-level two-factor sign-in with backup
          codes is available)</li>
        <li><strong>Passwords</strong> — stored only as an irreversible hash</li>
        <li><strong>Logging</strong> — all access events recorded</li>
        <li><strong>Daily backups</strong></li>
      </ul>
      <p>
        The operator maintains a <strong>record of processing activities</strong> (Art. 30)
        and, because special category data is involved, prepares a{' '}
        <strong>data protection impact assessment (DPIA, Art. 35)</strong>:{' '}
        <AdatEN mezo="dpiaAllapot" />.
      </p>

      <SectionTitle>14. Personal data breaches</SectionTitle>
      <p>
        In the event of a breach we notify ANSPDCP <strong>within 72 hours</strong>
        (Art. 33) and, where the risk is high, inform the affected individuals directly
        (Art. 34). The congregation is informed without undue delay.
      </p>

      <SectionTitle>15. Children's data</SectionTitle>
      <p>
        The system also processes minors' data (baptised children, confirmands, children on
        the family card). Such data is provided by the <strong>parent or legal
        guardian</strong>, who also exercises the rights on the child's behalf. Where consent
        is the basis (photographs on the website, camp reports), the{' '}
        <strong>parent's consent</strong> is required; Romanian Law 190/2018 sets{' '}
        <strong>16 years</strong> as the age at which a child may validly consent in relation
        to information society services. Children's data is never published without the
        parent's express consent.
      </p>

      <SectionTitle>16. Church hierarchy and access</SectionTitle>
      <Note>
        <strong>Do not be afraid!</strong> The district and presbytery only see <em>the
        annual mandatory summary reports</em>. For detailed data the congregation pastor's
        permission is required — even the system administrator can only access congregation
        data with the explicit prior consent of the pastor.
      </Note>

      <SectionTitle>17. Who sees what?</SectionTitle>
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

      <SectionTitle>18. Changes to this notice</SectionTitle>
      <p>
        Current version: <strong>{LEGAL_VERSION}</strong>, effective from{' '}
        <strong>{LEGAL_EFFECTIVE_DATE}</strong>. Material changes are announced in advance
        and earlier versions are retained.
      </p>

      <SectionTitle>19. Liability disclaimer</SectionTitle>
      <p>
        The system is provided „as is". The operator (Endre Szőcs) and the spiritual
        foundation source (Tivadar Beke) are not liable for: input errors, user-caused
        losses, third-party service interruptions, force majeure, indirect damages. This
        limitation does not apply where the law does not permit exclusion — in particular
        intent or gross negligence, injury to life, body or health, and liability for
        compensation under Article 82 GDPR.
      </p>
    </>
  )
}

/* ================== ENGLISH — TERMS ================== */

function TermsEN() {
  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        Version {LEGAL_VERSION} — effective from {LEGAL_EFFECTIVE_DATE}.
      </p>

      <p>
        Dear Pastor! These rules establish the peaceful and clear use of the Kartotéka system
        for all users.
      </p>

      <Note>
        <strong>Encouragement:</strong> Kartotéka is a tool for church service. The terms
        are written for use with a clear conscience — every congregation can benefit from
        it.
      </Note>

      <SectionTitle>1. The parties</SectionTitle>
      <p>
        <strong>Operator (provider):</strong> Reverend Endre Szőcs.
        E-mail: <AdatEN mezo="adatvedelmiEmail" />. Postal address: <AdatEN mezo="postaiCim" />.
        Legal status: <AdatEN mezo="jogiStatusz" />. Tax number: <AdatEN mezo="adoszam" />.
      </p>
      <p>
        <strong>User:</strong> the congregation, presbytery or church district, and the
        office-holder acting on their behalf who has been granted approved access.
      </p>
      <p>
        <strong>Spiritual foundation:</strong> Tivadar Beke's church record-keeping system,
        developed in digital form.
      </p>
      <Note>
        Kartotéka is <strong>not a consumer service</strong>: it is an internal administrative
        tool for church organisations, used by office-holders in the course of their ministry.
        Should a user nevertheless qualify as a consumer, these terms do not limit their
        statutory rights.
      </Note>

      <SectionTitle>2. Description of the service</SectionTitle>
      <p>
        Kartotéka is a church record-keeping program: member registry, ecclesiastical
        registers, finance, work log, inventory, document registry and cemetery records —
        across three levels: congregation, presbytery, church district. It is available
        through a browser and as a desktop application that also works offline. The system is
        under continuous development: new modules may appear and existing ones may change.
      </p>

      <SectionTitle>3. Who may use it?</SectionTitle>
      <p>
        Access requires <strong>district-level approval</strong> by the system operator.
        Response usually within 1–3 business days. Access is{' '}
        <strong>personal and non-transferable</strong>; shared accounts are prohibited, as
        they would render logging meaningless. The end of an office (transfer, retirement,
        resignation) must be reported so that access can be closed.
      </p>

      <SectionTitle>4. Pricing</SectionTitle>
      <p>
        Information about the system's pricing and conditions is provided to congregations
        through district administrative channels:{' '}
        <AdatEN mezo="aszfDijazas" />.
      </p>

      <SectionTitle>5. User obligations</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Use exclusively for church purposes</li>
        <li>Accurate and current data entry</li>
        <li>Password confidentiality (changed annually)</li>
        <li>Immediately notify the operator of any suspicion</li>
        <li>Bypassing security mechanisms, automated bulk querying and reverse engineering
          are prohibited</li>
        <li>Observe data protection rules: the congregation is the controller for member
          data; printed lists must not be left unattended</li>
      </ul>

      <SectionTitle>6. Operator's rights</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>Maintenance windows (with advance notice)</li>
        <li>Suspending access in case of rule violation</li>
        <li>Developing and modifying the system</li>
        <li>Engaging new processors (sub-contractors) needed to operate the service; the
          current list is in section 6 of the Privacy notice</li>
      </ul>

      <SectionTitle>7. Availability</SectionTitle>
      <p>
        We aim for continuous, undisturbed operation, but we offer{' '}
        <strong>no contractual availability guarantee (SLA)</strong>: the system is operated
        as church service, not as a commercial offering. Planned maintenance is announced in
        advance, daily backups are taken, and the desktop application works without internet.
      </p>

      <SectionTitle>8. „As is" principle</SectionTitle>
      <p>
        The system is provided in its current form — with all its features and limitations.
        No guarantee of error-free operation or continuous availability.
      </p>

      <SectionTitle>9. Limitation of liability</SectionTitle>
      <p>
        The operator (Endre Szőcs) and the spiritual foundation source (Tivadar Beke)
        are not liable for: incorrectly entered data, user-caused losses, third-party service
        interruptions, force majeure (natural disasters, cyber-attacks), indirect or
        consequential damages.
      </p>
      <p className="text-[13px] text-muted-foreground">
        We do not exclude liability where the law does not allow it: for intent or gross
        negligence, for injury to life, body or health, and for compensation under Article 82
        GDPR. Otherwise the operator's liability is limited — to the extent permitted by law
        — to the fees actually paid in the twelve months preceding the damage; where use is
        free of charge, to the statutory minimum.
      </p>

      <SectionTitle>10. Data protection and processing</SectionTitle>
      <p>
        Detailed privacy rules are described in the separate Privacy Notice. For member data{' '}
        <strong>the congregation is the controller</strong> and the operator acts as a{' '}
        <strong>processor</strong>: processing only on instructions, bound by
        confidentiality, and on termination returning or deleting the data as the
        congregation directs. Article 28 GDPR requires a written agreement:{' '}
        <AdatEN mezo="dpaAllapot" />.
      </p>

      <SectionTitle>11. Intellectual property</SectionTitle>
      <p>
        The code, design, and documentation are the intellectual property of the developer
        (Endre Szőcs). Congregations receive a non-exclusive, non-transferable right of use.{' '}
        <strong>Data entered remains the congregation's own.</strong> The name „Kartotéka"
        and the ecclesiastical foundation derive from Tivadar Beke's work.
      </p>

      <SectionTitle>12. Termination and the fate of the data</SectionTitle>
      <ul className="list-disc pl-6 space-y-1">
        <li>The user may request termination of access at any time.</li>
        <li>The operator may terminate access for serious breach, when the office ends, or if
          the service is discontinued — the latter with reasonable notice.</li>
        <li>On termination the congregation may request an <strong>export of its data</strong>{' '}
          in machine-readable form. Deadline for the export, in days:{' '}
          <AdatEN mezo="aszfAdatkiadasNap" />.</li>
        <li>Clauses on confidentiality, intellectual property and limitation of liability
          survive termination.</li>
      </ul>

      <SectionTitle>13. Modification of terms</SectionTitle>
      <p>
        Terms may be modified. Material changes are announced at least 15 days in advance.
        Continued use means acceptance of the new terms; otherwise access termination may be
        requested.
      </p>

      <SectionTitle>14. Notices</SectionTitle>
      <p>
        Official notices are sent to the e-mail address provided by the user or displayed on
        sign-in. The user contacts the operator using the details in section 1 or through the
        built-in support ticket system.
      </p>

      <SectionTitle>15. Governing law, disputes, severability</SectionTitle>
      <p>
        Romanian law applies, together with mandatory EU rules (in particular the GDPR).
        Disputes are first resolved peacefully, or through church-order mediation; otherwise,
        competent Romanian courts have jurisdiction.
      </p>
      <p className="text-[13px] text-muted-foreground">
        If any provision is found invalid, the remaining provisions remain in force and the
        invalid provision is replaced by the closest valid rule.
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

      <h4 className="mt-6 mb-2 font-heading text-[15px] font-semibold text-primary">
        🛡️ Data protection — frequently asked questions
      </h4>

      <SectionTitle>Who can see my data?</SectionTitle>
      <p>
        Only those whose role allows it. The full congregation record is visible to its own
        pastor alone; the bookkeeper sees finance only; the dean and the district see{' '}
        <strong>only the aggregated annual reports</strong>, so no individual personal data.
        Pastoral notes are visible to no one else. This is enforced at record level (RLS) on
        every single query.
      </p>

      <SectionTitle>Where is the data stored? Does it leave the EU?</SectionTitle>
      <p>
        The database runs in <strong>Frankfurt</strong> and the application in{' '}
        <strong>Amsterdam</strong> — both in the EU. Day-to-day operation never leaves the
        Union. There is <strong>a single exception</strong>: the encrypted daily backup
        stored in Google Drive (covered by the adequacy decision and Standard Contractual
        Clauses).
      </p>

      <SectionTitle>Is there artificial intelligence (AI) in the system?</SectionTitle>
      <p>
        <strong>No.</strong> Kartotéka runs no AI assistant. What you type into the system is
        not sent to any language-model provider — congregation data reaches only the
        processors listed in the Privacy Notice.
      </p>

      <SectionTitle>How can I request erasure of my data?</SectionTitle>
      <p>
        Write to the congregation's pastor or to the system operator (see the Contact tab).
        We respond <strong>within one month, free of charge</strong>. Data can be removed from
        the live member registry; <strong>church register entries</strong>, however, are
        retained under Article 17(3) GDPR because they record events that took place. You may
        equally request a copy of your data, rectification, restriction, objection, or
        withdrawal of consent for the public website.
      </p>
      <Note>
        There is currently no self-service erasure button — requests are handled manually and
        documented, within the statutory deadline.
      </Note>

      <SectionTitle>What happens to the backups?</SectionTitle>
      <p>
        The system takes a full, encrypted backup <strong>every day</strong>, so data can be
        restored after a virus, hardware failure or human error. Backups are kept on a rolling
        basis for a set period and then overwritten — so deleted data eventually disappears
        from backups too. Only the operator can restore a backup, and the operation is logged.
      </p>

      <SectionTitle>How do the three levels (scope) work?</SectionTitle>
      <p>
        <strong>Congregation → presbytery → church district.</strong> The congregation sees
        everything about itself; the presbytery only the annual summaries of its congregations
        and the documents submitted to it; the district only the consolidation of those
        summaries. The bookkeeper and the auditor have an even narrower, finance-only scope.
      </p>

      <SectionTitle>Do you use cookies? Why is there no banner?</SectionTitle>
      <p>
        Because we use no advertising, tracking or analytics cookies. Only strictly necessary
        storage is used (sign-in, „keep me signed in", the welcome screen flag and the
        browser's offline store), for which EU rules require no consent. Always sign out on a
        shared computer.
      </p>

      <SectionTitle>What happens in the event of a data breach?</SectionTitle>
      <p>
        We notify ANSPDCP <strong>within 72 hours</strong> and, where the risk is high,
        inform the affected individuals directly. The congregation is informed without undue
        delay. If you notice anything suspicious (unknown sign-in attempt, compromised
        password, phishing e-mail), report it immediately.
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
      <div className="rounded-2xl border border-accent/45 bg-accent/15 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Reverend Endre Szőcs
        </p>
        <p className="text-[13px] text-muted-foreground">
          Developer and administrator of the Kartotéka system, on behalf of the Reformed
          Church District of Transylvania (EREK). For member data{' '}
          <strong>the congregation is the controller</strong> and the operator acts as a
          processor.
        </p>
      </div>
      <ul className="list-disc pl-6 space-y-1 mt-2">
        <li>E-mail: <AdatEN mezo="adatvedelmiEmail" /></li>
        <li>Postal address: <AdatEN mezo="postaiCim" /></li>
        <li>Phone: <AdatEN mezo="telefon" /></li>
        <li>DPO: <AdatEN mezo="dpoElerhetoseg" /></li>
      </ul>
      <Note>
        Data subject requests (copy, rectification, erasure, objection) should be addressed
        first to <strong>the congregation's pastor</strong>. We respond{' '}
        <strong>within one month, free of charge</strong>.
      </Note>

      <SectionTitle>Spiritual foundation</SectionTitle>
      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <p className="text-[15px] font-semibold text-foreground mb-1">
          Tivadar Beke
        </p>
        <p className="text-[13px] text-muted-foreground">
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
      <div className="rounded-2xl border border-border bg-muted/60 p-4">
        <p className="text-[14px] font-semibold text-foreground">
          ANSPDCP — Romanian Data Protection Authority
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          B-dul G-ral. Gheorghe Magheru 28-30, 010336 Bucharest, Romania
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Phone: +40 318 059 211 &nbsp;·&nbsp; Fax: +40 318 059 602
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          E-mail: anspdcp (at) dataprotection.ro
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Web: <em>www.dataprotection.ro</em>
        </p>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          A complaint may be lodged via the authority's online form, by post or by e-mail.
          Under Article 79 GDPR you may also bring proceedings before the competent court.
        </p>
      </div>

      <Note>
        May the Lord's blessing be upon your service!
      </Note>
    </>
  )
}
