#!/usr/bin/env node
/**
 * Dioceses + Congregations seed generator
 *
 * Forrás: https://reformatus.ro/cimtar (2026-04-30 lekérdezés)
 *
 * Erdélyi Református Egyházkerület — 15 egyházmegye, ~495 egyházközség.
 * Az adatok az ottani közzétett listákból származnak. Az esperes / vezetőségi
 * adatok NEM elérhetők a public oldalon — azokat a SQL seed után az adminok
 * kézzel pótolják.
 *
 * Output:
 *   migration-docs/dioceses-congregations-seed-2026-04-30.xlsx
 *
 * Sheet-ek:
 *   1. Egyházmegyék — 15 sor (egyházkerület, egyházmegye, esperes-stb. üres)
 *   2. Egyházközségek — egy sor per gyülekezet (egyházmegye, egyházközség, megjegyzés)
 *
 * Futtatás:
 *   node scripts/build-dioceses-seed.mjs
 */

import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUTPUT_FILE = path.join(REPO_ROOT, 'migration-docs', 'dioceses-congregations-seed-2026-04-30.xlsx')

// ─────────────────────────────────────────────────────────────────────
// Adatok — Erdélyi Református Egyházkerület 15 egyházmegye
// ─────────────────────────────────────────────────────────────────────

const EGYHAZKERULET = 'Erdélyi Református Egyházkerület'

const ERDELYI_DIOCESES = [
  {
    egyhazmegye: 'Brassói Református Egyházmegye',
    egyhazkozsegek: [
      'Alsórákosi Református Egyházközség',
      'Bákói Református Missziói Egyházközség',
      'Balázstelki Református Egyházközség',
      'Bodolai Református Egyházközség',
      'Brassó I. Református Egyházközség',
      'Brassó II. Református Egyházközség',
      'Brassó III. Református Egyházközség',
      'Bukarest I. Református Egyházközség',
      'Bukarest II. Református Egyházközség',
      'Bürkösi Református Egyházközség',
      'Erzsébetvárosi Református Egyházközség',
      'Fogarasi Református Egyházközség',
      'Galaci Református Egyházközség',
      'Keresztvári Református Egyházközség',
      'Kóbori Református Egyházközség',
      'Kőhalmi Református Egyházközség',
      'Küküllőalmási Református Egyházközség',
      'Medgyesi Református Egyházközség',
      'Mihályfalvi Református Egyházközség',
      'Nagymohai Református Egyházközség',
      'Nagyszebeni Református Egyházközség',
      'Négyfalusi Református Egyházközség',
      'Olthévízi Református Egyházközség',
      'Ramnicu Valcea-i Református Egyházközség',
      'Szentágotai Református Egyházközség',
      'Vízaknai Református Egyházközség',
      'Zernyesti Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Dési Református Egyházmegye',
    egyhazkozsegek: [
      'Almásmálomi Református Egyházközség',
      'Apanagyfalui Református Egyházközség',
      'Árpástói Református Egyházközség',
      'Bacai Református Egyházközség',
      'Bálványosváraljai Református Egyházközség',
      'Besztercei Református Egyházközség',
      'Bethleni Református Egyházközség',
      'Bonchidai Református Egyházközség',
      'Búzai Református Egyházközség',
      'Cegőtelkei Református Egyházközség',
      'Désaknai Református Egyházközség',
      'Déscichegyi Református Egyházközség',
      'Dési Református Egyházközség',
      'Esztényi Református Egyházközség',
      'Feketelaki Református Egyházközség',
      'Felőri Református Egyházközség',
      'Katonai Református Egyházközség',
      'Kékesi Református Egyházközség',
      'Kendilónai Református Egyházközség',
      'Kérői Református Egyházközség',
      'Kisiklódi Református Egyházközség',
      'Kozárvári Református Egyházközség',
      'Magyarberétei Református Egyházközség',
      'Magyarborzási Református Egyházközség',
      'Magyardécsei Református Egyházközség',
      'Magyarnemegyei Református Egyházközség',
      'Melegföldvári Református Egyházközség',
      'Mezőköbölkúti Református Egyházközség',
      'Mezőveresegyházi Református Egyházközség',
      'Nagysajói Református Egyházközség',
      'Naszódi Református Egyházközség',
      'Nyíresi Református Egyházközség',
      'Ördöngösfüzesi Református Egyházközség',
      'Rettegi Református Egyházközség',
      'Sajószentandrási Református Egyházközség',
      'Sófalvi Református Egyházközség',
      'Somkeréki Református Egyházközség',
      'Szamosújvári Református Egyházközség',
      'Szászlekence–Vermesi Református Egyházközség',
      'Széki Református Egyházközség',
      'Szentmargitai Református Egyházközség',
      'Szentmátéi Református Egyházközség',
      'Szépkenyerűszentmártoni Református Egyházközség',
      'Tacsi Református Egyházközség',
      'Újősi Református Egyházközség',
      'Várkudui Református Egyházközség',
      'Vicei Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Erdővidéki Református Egyházmegye',
    egyhazkozsegek: [
      'Bardoci Református Egyházközség',
      'Baróti Református Egyházközség',
      'Bibarcfalvi Református Egyházközség',
      'Bodosi Református Egyházközség',
      'Bölöni Református Egyházközség',
      'Erdőfülei Református Egyházközség',
      'Kisbaconi Református Egyházközség',
      'Köpeci Református Egyházközség',
      'Középajtai Református Egyházközség',
      'Magyarhermányi Református Egyházközség',
      'Nagyajtai Református Egyházközség',
      'Nagybaconi Református Egyházközség',
      'Olaszteleki Református Egyházközség',
      'Szárazajtai Református Egyházközség',
      'Székelyszáldobosi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Görgényi Református Egyházmegye',
    egyhazkozsegek: [
      'Abafájai Református Egyházközség',
      'Alsóbölkényi Református Egyházközség',
      'Beresztelkei Református Egyházközség',
      'Borszéki Református Missziói Egyházközség',
      'Dedrádszéplaki Református Egyházközség',
      'Disznajói Református Egyházközség',
      'Erdőcsinádi Református Egyházközség',
      'Fickói Református Egyházközség',
      'Gernyeszegi Református Egyházközség',
      'Görgényszentimrei Református Egyházközség',
      'Holtmarosi Református Egyházközség',
      'Jódratosnyai Református Egyházközség',
      'Kisfülpösi Református Egyházközség',
      'Körtvélyfájai Református Egyházközség',
      'Ludvégi Református Egyházközség',
      'Magyarfülpösi Református Egyházközség',
      'Magyarói Református Egyházközség',
      'Magyarpéterlakai Református Egyházközség',
      'Magyarrégeni Református Egyházközség',
      'Marosfelfalui Református Egyházközség',
      'Maroshévízi Református Egyházközség',
      'Marosjárai Református Egyházközség',
      'Marossárpataki Református Egyházközség',
      'Marosvécsi Református Egyházközség',
      'Mezőörményesi Református Egyházközség',
      'Pókai Református Egyházközség',
      'Pókakeresztúri Református Egyházközség',
      'Radnótfájai Református Egyházközség',
      'Sáromberki Református Egyházközség',
      'Szászrégeni Református Egyházközség',
      'Tekei Református Egyházközség',
      'Toldalagi Református Egyházközség',
      'Vajdaszentiványi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Hunyadi Református Egyházmegye',
    egyhazkozsegek: [
      'Alpestesi Református Egyházközség',
      'Brádi Református Egyházközség',
      'Dévai Református Egyházközség',
      'Harói Református Egyházközség',
      'Hátszegi Református Egyházközség',
      'Hosdáti Református Egyházközség',
      'Lupényi Református Egyházközség',
      'Petrilla-Lónyai Református Egyházközség',
      'Petrozsényi Református Egyházközség',
      'Piski Református Egyházközség',
      'Rákosdi Református Egyházközség',
      'Szászvárosi Református Egyházközség',
      'Vajdahunyadi Református Egyházközség',
      'Vulkáni Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Kalotaszegi Református Egyházmegye',
    egyhazkozsegek: [
      'Bánffyhunyadi Református Egyházközség',
      'Bogártelki Református Egyházközség',
      'Egeresi Református Egyházközség',
      'Farnasi Református Egyházközség',
      'Gyalui Református Egyházközség',
      'Gyerővásárhelyi Református Egyházközség',
      'Inaktelki Református Egyházközség',
      'Kalotadámosi Református Egyházközség',
      'Kalotaszentkirályi Református Egyházközség',
      'Ketesdi Református Egyházközség',
      'Kispetri Református Egyházközség',
      'Körösfői Református Egyházközség',
      'Középlaki Református Egyházközség',
      'Magyarbikali Református Egyházközség',
      'Magyargyerőmonostori Református Egyházközség',
      'Magyarkapusi Református Egyházközség',
      'Magyarkiskapusi Református Egyházközség',
      'Magyarlónai Református Egyházközség',
      'Magyarókerekei Református Egyházközség',
      'Magyarvalkói Református Egyházközség',
      'Magyarvistai Református Egyházközség',
      'Mákófalvi Református Egyházközség',
      'Mérai Református Egyházközség',
      'Nádasdaróczi Református Egyházközség',
      'Nagypetri Református Egyházközség',
      'Nyárszó-Sárvásári Református Egyházközség',
      'Sztánai Református Egyházközség',
      'Türei Református Egyházközség',
      'Váralmási Református Egyházközség',
      'Zsoboki Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Kézdi-Orbai Református Egyházmegye',
    egyhazkozsegek: [
      'Alsócsernátoni Református Egyházközség',
      'Barátosi Református Egyházközség',
      'Berecki Református Missziói Egyházközség',
      'Bitai Református Egyházközség',
      'Cófalvi Református Egyházközség',
      'Csomakőrösi Református Egyházközség',
      'Dálnoki Református Egyházközség',
      'Dr. Csiha Kálmán Református Kollégium – Iskolalelkészség',
      'Egerpataki Református Egyházközség',
      'Eresztevényi Református Egyházközség',
      'Feldobolyi Református Egyházközség',
      'Felsőcsernátoni Református Egyházközség',
      'Ikafalvi Református Egyházközség',
      'Karatnai Református Missziói Egyházközség',
      'Kézdialbisi Református Egyházközség',
      'Kézdimárkosfalvi Református Egyházközség',
      'Kézdimartonfalvi Református Egyházközség',
      'Kézdivásárhelyi Református Egyházközség',
      'Kisborosnyói Református Egyházközség',
      'Komandói Református Egyházközség',
      'Kovászna I.- Belvárosi Református Egyházközség',
      'Kovászna II. – Vajnafalvi Református Egyházközség',
      'Lécfalvi Református Egyházközség',
      'Maksai Református Egyházközség',
      'Nagyborosnyói Református Egyházközség',
      'Orbaiteleki Református Egyházközség',
      'Pákéi Református Egyházközség',
      'Papolci Református Egyházközség',
      'Pávai Református Egyházközség',
      'Sepsibesenyői Református Egyházközség',
      'Szacsvai Református Egyházközség',
      'Székelytamásfalvi Református Egyházközség',
      'Szörcsei Református Egyházközség',
      'Torjai Református Egyházközség',
      'Zabolai Református Egyházközség',
      'Zágoni Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Kolozsvári Református Egyházmegye',
    egyhazkozsegek: [
      'Apahidai Református Missziói Egyházközség',
      'Bádoki Református Egyházközség',
      'Bodonkúti Református Egyházközség',
      'FIKE egyetemi lp.',
      'Györgyfalvi Református Egyházközség',
      'Kajántói Református Egyházközség',
      'Kidei Református Egyházközség',
      'Kisbácsi Református Egyházközség',
      'Kolozsborsai Református Egyházközség',
      'Kolozsi Református Egyházközség',
      'Kolozsmonostori Református Egyházközség',
      'Kolozspatai Református Egyházközség',
      'Kolozsvár-Alsóvárosi Református Egyházközség',
      'Kolozsvár-Belvárosi Református Egyházközség',
      'Kolozsvár-Bulgáriatelepi Református Egyházközség',
      'Kolozsvár-Felsővárosi Református Egyházközség',
      'Kolozsvár-Hidelvei Református Egyházközség',
      'Kolozsvár-Irisztelepi Református Egyházközség',
      'Kolozsvár-Kerekdombi Református Egyházközség',
      'Kolozsvár-Törökvágási Református Egyházközség',
      'Kolozsvár-Tóvidéki Református Egyházközség',
      'Kolozsvár-Újalsóvárosi Református Egyházközség',
      'Kolozsvári Református Kollégium',
      'Kórházlelkész',
      'Magyarfenesi Református Egyházközség',
      'Magyarkályáni Református Missziói Egyházközség',
      'Magyarlétai Református Egyházközség',
      'Magyarpalatkai Református Egyházközség',
      'Magyarszováti Református Egyházközség',
      'Mezőkeszüi Református Egyházközség',
      'Mócsi Református Egyházközség',
      'Pusztakamarási Református Missziói Egyházközség',
      'Szamosfalvi Református Egyházközség',
      'Szászfenesi Református Egyházközség',
      'Szucsági Református Egyházközség',
      'Tordaszentlászlói Református Egyházközség',
      'Vajdakamarási Református Egyházközség',
      'Válaszúti Református Egyházközség',
      'Visai Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Küküllői Református Egyházmegye',
    egyhazkozsegek: [
      'Ádámosi Református Egyházközség',
      'Backamadarasi Református Egyházközség',
      'Balavásári Református Egyházközség',
      'Bedei Református Egyházközség',
      'Berekeresztúri Református Egyházközség',
      'Bonyhai Református Egyházközség',
      'Bözödi Református Egyházközség',
      'Csíkfalvi Református Missziói Egyházközség',
      'Désfalvi Református Egyházközség',
      'Dicsőszentmártoni Református Egyházközség',
      'Egrestői Református Egyházközség',
      'Erdőszentgyörgyi Református Egyházközség',
      'Fehéregyházi Református Egyházközség',
      'Gegesi Református Egyházközség',
      'Gógáni Református Egyházközség',
      'Gógánváraljai Református Egyházközség',
      'Gyulakutai Református Egyházközség',
      'Haranglábi Református Egyházközség',
      'Hármasfalui Református Egyházközség',
      'Havadi Református Egyházközség',
      'Havadtői Református Egyházközség',
      'Héderfáji Református Egyházközség',
      'Héjjasfalvi Református Egyházközség',
      'Kelementelki Református Egyházközség',
      'Kibédi Református Egyházközség',
      'Kiskendi Református Egyházközség',
      'Kóródszentmártoni Református Egyházközség',
      'Küküllőpócsfalvi Református Egyházközség',
      'Küküllőszéplaki Református Egyházközség',
      'Magyarkirályfalvi Református Egyházközség',
      'Májai Református Egyházközség',
      'Makfalvi Református Egyházközség',
      'Márkodi Református Egyházközség',
      'Mikefalvi Református Egyházközség',
      'Nagybúni Református Egyházközség',
      'Nagykendi Református Egyházközség',
      'Nyárádmagyarósi Református Egyházközség',
      'Nyárádselyei Református Egyházközség',
      'Nyárádszentannai Református Egyházközség',
      'Nyárádszentimrei Református Egyházközség',
      'Nyárádszentsimoni Református Egyházközség',
      'Nyárádszeredai Református Egyházközség',
      'Segesvári Református Egyházközség',
      'Sóváradi Református Egyházközség',
      'Sövényfalvi Református Egyházközség',
      'Szászcsávási Református Egyházközség',
      'Szederjesi Református Egyházközség',
      'Székelyabodi Református Egyházközség',
      'Székelytompai Református Egyházközség',
      'Szentgericei Református Egyházközség',
      'Szőkefalvi Református Egyházközség',
      'Szolokmai Református Egyházközség',
      'Szovátai Református Egyházközség',
      'Szövérdi Református Egyházközség',
      'Torboszlói Református Egyházközség',
      'Vadasdi Református Egyházközség',
      'Vámosgálfalvi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Maros-Mezőségi Református Egyházmegye',
    egyhazkozsegek: [
      'Csittszentiváni Református Egyházközség',
      'Galambodi Református Egyházközség',
      'Kissármási Református Egyházközség',
      'Madarasi-Feketei Református Egyházközség',
      'Marosszentannai Református Egyházközség',
      'Marosszentkirályi Református Egyházközség',
      'Marosvásárhely III. – Alsóvárosi Református Egyházközség',
      'Marosvásárhely IV. – Szabadi úti Református Egyházközség',
      'Marosvásárhely V. – Felsővárosi Református Egyházközség',
      'Marosvásárhely VI. – Meggyesfalvi Református Egyházközség',
      'Marosvásárhely VII. – Szabadság utcai Református Egyházközség',
      'Marosvásárhelyi Kórházlelkészség',
      'Mezőbándi Református Egyházközség',
      'Mezőbergenyei Református Egyházközség',
      'Mezőbodoni Református Egyházközség',
      'Mezőcsávási Református Egyházközség',
      'Mezőfelei Református Egyházközség',
      'Mezőkölpényi Református Egyházközség',
      'Mezőmadarasi Református Egyházközség',
      'Mezőméhesi Református Egyházközség',
      'Mezőpaniti Református Egyházközség',
      'Mezősámsondi Református Egyházközség',
      'Mezőzáhi Református Egyházközség',
      'MIFIKE – Marosvásárhelyi Egyetemi Lelkészség',
      'Nagyernyei Református Egyházközség',
      'Nagysármási Református Egyházközség',
      'Székelykakasdi Református Egyházközség',
      'Székelykövesdi Református Egyházközség',
      'Udvarfalvi Református Egyházközség',
      'Uzdiszentpéteri Református Egyházközség',
      'Várhegyi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Marosi Református Egyházmegye',
    egyhazkozsegek: [
      'Ákosfalvi Református Egyházközség',
      'Búzásbesenyői Református Egyházközség',
      'Csejdi Református Egyházközség',
      'Csekelaki Református Egyházközség',
      'Cserefalvi Református Egyházközség',
      'Dózsa Györgyi Református Egyházközség',
      'Fintaházi Református Egyházközség',
      'Gerendkeresztúri Református Egyházközség',
      'Göcsi Református Egyházközség',
      'Hagymásbodoni Református Egyházközség',
      'Harasztkeréki Református Egyházközség',
      'Istvánházi Református Egyházközség',
      'Jeddi Református Egyházközség',
      'Kántortanítóképző Főiskola',
      'Káposztásszentmiklósi Református Egyházközség',
      'Kebelei Református Egyházközség',
      'Kisgörgényi Református Egyházközség',
      'Kórházlelkész',
      'Koronkai Református Egyházközség',
      'Kutyfalvi Református Egyházközség',
      'Lőrincfalvi Református Egyházközség',
      'Ludastelepi Református Egyházközség',
      'Magyarbükkösi Református Egyházközség',
      'Magyardellői Református Egyházközség',
      'Magyarózdi Református Egyházközség',
      'Marosbogáti Református Egyházközség',
      'Maroscsapói Református Egyházközség',
      'Maroskeresztúri Református Egyházközség',
      'Marosludasi Református Egyházközség',
      'Marosszentgyörgyi Református Egyházközség',
      'Marosugrai Református Egyházközség',
      'Marosvásárhely I. – Vártemplomi Református Egyházközség',
      'Marosvásárhely II. – Gecse utcai Református Egyházközség',
      'Marosvásárhely VIII. – Cserealjai Református Egyházközség',
      'Marosvásárhely IX. – Tulipán utcai Református Egyházközség',
      'Marosvásárhely X. – Kövesdombi Református Egyházközség',
      'Marosvásárhelyi Református Kollégium – Iskolalelkészség',
      'Nyárádkarácsonfalvi Református Egyházközség',
      'Nyárádszentbenedeki Református Egyházközség',
      'Nyárádtői Református Egyházközség',
      'Oláhdellői Református Egyházközség',
      'Radnóti Református Egyházközség',
      'Somosdi Református Egyházközség',
      'Székelyvajai Református Egyházközség',
      'Székesi Református Egyházközség',
      'Teremiújfalui Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Nagyenyedi Református Egyházmegye',
    egyhazkozsegek: [
      'Abrudbányai Református Egyházközség',
      'Balázsfalvi Református Egyházközség',
      'Bethlen Gábor Kollégium – iskolalelkészség',
      'Bethlenszentmiklósi Református Egyházközség',
      'Búzásbocsárdi Református Egyházközség',
      'Csombordi Református Egyházközség',
      'Enyedszentkirályi Református Egyházközség',
      'Felenyedi Református Egyházközség',
      'Felvinci Református Egyházközség',
      'Gyulafehérvári Református Egyházközség',
      'Küküllőboldogfalvi Református Egyházközség',
      'Küküllővári Református Egyházközség',
      'Lőrincrévei Református Egyházközség',
      'Magyarbecei Református Egyházközség',
      'Magyarbényei Református Egyházközség',
      'Magyarigeni Református Missziói Egyházközség',
      'Magyarlapádi Református Egyházközség',
      'Magyarpéterfalvi Református Egyházközség',
      'Maroscsúcs-Koppándi Református Egyházközség',
      'Marosdécsei Református Egyházközség',
      'Marosgombás Református Egyházközség',
      'Marosnagylaki Református Egyházközség',
      'Marosújvári Református Egyházközség',
      'Miriszlói Református Egyházközség',
      'Nagyenyedi Református Egyházközség',
      'Nagymedvési Református Egyházközség',
      'Székelykocsárdi Református Egyházközség',
      'Torockószentgyörgyi Református Egyházközség',
      'Tövisi Református Egyházközség',
      'Vajasdi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Sepsi Református Egyházmegye',
    egyhazkozsegek: [
      'Aldobolyi Református Egyházközség',
      'Angyalosi Református Egyházközség',
      'Árapataki Református Egyházközség',
      'Árkosi Református Egyházközség',
      'Bikfalvi Református Egyházközség',
      'Erősdi Református Egyházközség',
      'Étfalvazoltáni Református Egyházközség',
      'Fotosmartonosi Református Egyházközség',
      'Gidófalvi Református Egyházközség',
      'Hídvégi Református Egyházközség',
      'Illyefalvi Református Egyházközség',
      'Kálnoki Református Egyházközség',
      'Kilyéni Református Egyházközség',
      'Kökösi Református Egyházközség',
      'Komollói Református Egyházközség',
      'Lisznyói Református Egyházközség',
      'Málnási Református Egyházközség',
      'Mikóújfalusi Református Egyházközség',
      'Oltszemi Református Egyházközség',
      'Rétyi Református Egyházközség',
      'Sepsibodoki Református Egyházközség',
      'Sepsikőröspataki Református Egyházközség',
      'Sepsimagyarosi Református Egyházközség',
      'Sepsiszentgyörgy I. – Vártemplomi Református Egyházközség',
      'Sepsiszentgyörgy II. – Szemerjai Református Egyházközség',
      'Sepsiszentgyörgy III. – Belvárosi Református Egyházközség',
      'Sepsiszentgyörgy IV. – Gyöngyvirág utcai Református Egyházközség',
      'Sepsiszentkirályi Református Egyházközség',
      'Szotyori Református Egyházközség',
      'Uzoni Református Egyházközség',
      'Zaláni Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Székelyudvarhelyi Református Egyházmegye',
    egyhazkozsegek: [
      'Agyagfalvi Református Egyházközség',
      'Alsóboldogfalvi Református Egyházközség',
      'Alsósófalvi Református Egyházközség',
      'Backamadarasi Kis Gergely Református Kollégium',
      'Bágyi Református Egyházközség',
      'Betfalvi Református Egyházközség',
      'Bikafalvi Református Egyházközség',
      'Bögözi Református Egyházközség',
      'Csekefalvi Református Missziói Egyházközség',
      'Csíkszentmártoni Református Missziói Egyházközség',
      'Csíkszeredai Református Egyházközség',
      'Etédi Református Egyházközség',
      'Farcádi Református Egyházközség',
      'Felsőboldogfalvi Református Egyházközség',
      'Felsősófalvi Református Egyházközség',
      'Fiatfalvi Református Egyházközség',
      'Gyergyószentmiklósi Református Missziói Egyházközség',
      'Hodgyai Református Egyházközség',
      'Homoródszentmártoni Református Missziói Egyházközség',
      'Kányádi Református Egyházközség',
      'Kecseti Református Egyházközség',
      'Kisgalambfalvi Református Egyházközség',
      'Kőrispataki Református Egyházközség',
      'Küsmődi Református Egyházközség',
      'Madéfalvi Református Missziói Egyházközség',
      'Mátisfalvi Református Egyházközség',
      'Nagygalambfalvi Református Egyházközség',
      'Nagysolymosi Református Egyházközség',
      'Ócfalvi Református Egyházközség',
      'Parajdi Református Egyházközség',
      'Patakfalvi Református Egyházközség',
      'Peteki Református Egyházközség',
      'Református Diákotthon',
      'Rugonfalvi Református Egyházközség',
      'Siklódi Református Egyházközség',
      'Siménfalvi Református Missziói Egyházközség',
      'Székelydályai Református Egyházközség',
      'Székelykeresztúri Református Egyházközség',
      'Székelymuzsnai Református Egyházközség',
      'Székelyszenterzsébeti Református Egyházközség',
      'Székelyudvarhely-Belvárosi Református Egyházközség',
      'Székelyudvarhely-Bethlen-negyedi Református Egyházközség',
      'Székelyudvarhely-Szombatfalvi Református Egyházközség',
      'Szentkeresztbányai Református Egyházközség',
      'Telekfalvi Református Egyházközség',
    ],
  },
  {
    egyhazmegye: 'Tordai Református Egyházmegye',
    egyhazkozsegek: [
      'Ajtoni Református Egyházközség',
      'Alsó-Felsőszentmihályi Református Egyházközség',
      'Aranyosegerbegyi Református Egyházközség',
      'Aranyosgerendi Református Egyházközség',
      'Aranyosgyéresi Református Egyházközség',
      'Aranyospolyáni Református Egyházközség',
      'Detrehemtelepi Református Egyházközség',
      'Harasztosi Református Egyházközség',
      'Kercsedi Református Egyházközség',
      'Magyarfrátai Református Egyházközség',
      'Mezőnagycsányi Református Egyházközség',
      'Ótordai Református Egyházközség',
      'Tordatúri Református Egyházközség',
      'Újtordai Református Egyházközség',
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────
// Excel-fájl generálás
// ─────────────────────────────────────────────────────────────────────

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Kartoteka — build-dioceses-seed.mjs'
  workbook.created = new Date()
  workbook.subject = 'Erdélyi Református Egyházkerület — egyházmegyék és egyházközségek seed'

  // ── Sheet 1: Egyházmegyék (15 sor) ────────────────────────────────
  const dioceseSheet = workbook.addWorksheet('Egyházmegyék')
  dioceseSheet.columns = [
    { header: 'Egyházkerület', key: 'egyhazkerulet', width: 32 },
    { header: 'Egyházmegye', key: 'egyhazmegye', width: 38 },
    { header: 'Esperes neve', key: 'esperes_nev', width: 24 },
    { header: 'Megye', key: 'cim_megye', width: 14 },
    { header: 'Település', key: 'cim_telepules', width: 18 },
    { header: 'Irányítószám', key: 'cim_iranyitoszam', width: 14 },
    { header: 'Utca és szám', key: 'cim_utca', width: 28 },
    { header: 'Telefon', key: 'telefon', width: 18 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Weboldal', key: 'weboldal', width: 24 },
    { header: 'Egyházközségek száma', key: 'egyhazkozsegek_szama', width: 16 },
  ]
  dioceseSheet.getRow(1).font = { bold: true }
  dioceseSheet.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' },
  }

  for (const d of ERDELYI_DIOCESES) {
    dioceseSheet.addRow({
      egyhazkerulet: EGYHAZKERULET,
      egyhazmegye: d.egyhazmegye,
      esperes_nev: '',
      cim_megye: '',
      cim_telepules: '',
      cim_iranyitoszam: '',
      cim_utca: '',
      telefon: '',
      email: '',
      weboldal: 'https://reformatus.ro',
      egyhazkozsegek_szama: d.egyhazkozsegek.length,
    })
  }

  // Total sor
  const totalRow = dioceseSheet.addRow({
    egyhazkerulet: '',
    egyhazmegye: 'Összesen',
    esperes_nev: '',
    cim_megye: '',
    cim_telepules: '',
    cim_iranyitoszam: '',
    cim_utca: '',
    telefon: '',
    email: '',
    weboldal: '',
    egyhazkozsegek_szama: ERDELYI_DIOCESES.reduce((s, d) => s + d.egyhazkozsegek.length, 0),
  })
  totalRow.font = { bold: true, italic: true }

  // ── Sheet 2: Egyházközségek (egy sor / gyülekezet) ──────────────────
  const kozsegSheet = workbook.addWorksheet('Egyházközségek')
  kozsegSheet.columns = [
    { header: 'Egyházkerület', key: 'egyhazkerulet', width: 32 },
    { header: 'Egyházmegye', key: 'egyhazmegye', width: 38 },
    { header: 'Egyházközség', key: 'egyhazkozseg', width: 50 },
    { header: 'Lelkész neve', key: 'lelkesz_nev', width: 24 },
    { header: 'Megye', key: 'cim_megye', width: 14 },
    { header: 'Település', key: 'cim_telepules', width: 18 },
    { header: 'Irányítószám', key: 'cim_iranyitoszam', width: 14 },
    { header: 'Utca és szám', key: 'cim_utca', width: 28 },
    { header: 'Telefon', key: 'telefon', width: 18 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Weboldal', key: 'weboldal', width: 24 },
    { header: 'Megjegyzés', key: 'megjegyzes', width: 30 },
  ]
  kozsegSheet.getRow(1).font = { bold: true }
  kozsegSheet.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' },
  }

  // Speciális elemek (intézmények, nem klasszikus gyülekezetek)
  const SPECIAL_PATTERNS = [
    /Kollégium/, /Iskolalelkészség/, /Iskolalelkészségbeli/,
    /Diákotthon/, /Főiskola/, /Kórházlelkész/, /lelkészség$/,
    /FIKE/, /MIFIKE/, /lp\.$/,
  ]
  function isSpecial(name) {
    return SPECIAL_PATTERNS.some(re => re.test(name))
  }

  for (const d of ERDELYI_DIOCESES) {
    for (const kozseg of d.egyhazkozsegek) {
      kozsegSheet.addRow({
        egyhazkerulet: EGYHAZKERULET,
        egyhazmegye: d.egyhazmegye,
        egyhazkozseg: kozseg,
        lelkesz_nev: '',
        cim_megye: '',
        cim_telepules: '',
        cim_iranyitoszam: '',
        cim_utca: '',
        telefon: '',
        email: '',
        weboldal: '',
        megjegyzes: isSpecial(kozseg) ? 'INTÉZMÉNY (kollégium/iskolalelkészség/kórházlelkész) — nem klasszikus egyházközség' : '',
      })
    }
  }

  // ── Sheet 3: Olvashatóság — fejléc + utasítás ─────────────────────
  const readmeSheet = workbook.addWorksheet('Olvasd el')
  readmeSheet.columns = [{ width: 100 }]
  readmeSheet.addRow(['Erdélyi Református Egyházkerület — egyházmegyék és egyházközségek seed'])
  readmeSheet.getRow(1).font = { bold: true, size: 14 }
  readmeSheet.addRow([])
  readmeSheet.addRow(['Forrás: https://reformatus.ro/cimtar (2026-04-30 lekérdezés)'])
  readmeSheet.addRow([])
  readmeSheet.addRow(['SHEET-ek tartalma:'])
  readmeSheet.addRow(['• Egyházmegyék — 15 sor, az egyházmegye-szintű adatok pótolható mezőkkel (esperes neve, cím, telefon, email).'])
  readmeSheet.addRow(['• Egyházközségek — minden gyülekezet külön sorban, az egyházmegyéjéhez besorolva. Speciális intézmények (Kollégium, Kórházlelkész, FIKE/MIFIKE) megjelölve.'])
  readmeSheet.addRow([])
  readmeSheet.addRow(['Total egyházközségek (intézményekkel együtt): ' + ERDELYI_DIOCESES.reduce((s, d) => s + d.egyhazkozsegek.length, 0)])
  readmeSheet.addRow([])
  readmeSheet.addRow(['Hiányzó adatok (vezetőség, lelkészi cím, telefon, email):'])
  readmeSheet.addRow(['A reformatus.ro/cimtar public oldalain a vezetőségi és lelkészi részletes adatok nem érhetők el.'])
  readmeSheet.addRow(['Ezeket a meglévő egyházmegyei információs forrásokból (papír címtár, belső adatbázis) kell pótolni.'])
  readmeSheet.addRow([])
  readmeSheet.addRow(['Királyhágómelléki Református Egyházkerület:'])
  readmeSheet.addRow(['Külön session-ben pótlandó (forrás-URL még nincs megadva).'])
  readmeSheet.addRow([])
  readmeSheet.addRow(['Importálás:'])
  readmeSheet.addRow(['1. Endre kitölti az üres mezőket (esperes, lelkész stb.) az egyházmegyei adatok birtokában.'])
  readmeSheet.addRow(['2. Egy SQL seed-ekkel (migration-docs/sql/2026-04-30-dioceses-seed.sql) a districts + dioceses tábla feltöltésre kerül.'])
  readmeSheet.addRow(['3. Az "Egyházközségek" sheet adatai a congregations táblába kerülnek (a saját gyülekezeteket NEM bántva).'])

  // ── Mentés ────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_FILE)
  console.log('✅ Excel mentve:', OUTPUT_FILE)
  console.log('   Egyházmegyék:', ERDELYI_DIOCESES.length)
  console.log('   Egyházközségek (intézményekkel):', ERDELYI_DIOCESES.reduce((s, d) => s + d.egyhazkozsegek.length, 0))
}

buildWorkbook().catch((err) => {
  console.error('❌ Hiba:', err)
  process.exit(1)
})
