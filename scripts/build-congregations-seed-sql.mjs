#!/usr/bin/env node
/**
 * Congregations seed SQL generator
 *
 * Forrás: build-dioceses-seed.mjs (ugyanaz a 15 egyházmegye + 495 egyházközség)
 *
 * Output:
 *   migration-docs/sql/2026-04-30f-congregations-seed.sql
 *
 * Generál ~495 INSERT-et a `congregations` táblába:
 *   - id: gen_random_uuid()
 *   - name + nev_hu: a hivatalos név
 *   - district: 'Erdélyi Református Egyházkerület'
 *   - egyhazmegye: az egyházmegye név (legacy szöveg)
 *   - diocese_id: lookup a dioceses tábláról név alapján
 *   - country: 'Románia'
 *   - revision: 0
 *   - többi mező: default
 *
 * Idempotens: WHERE NOT EXISTS védve. A meglévő Barátosi rekordot NEM bántja.
 *
 * INTÉZMÉNYEK (Kollégiumok, FIKE, Kórházlelkész stb.) NEM kerülnek be —
 * azok nem klasszikus egyházközségek.
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUTPUT_FILE = path.join(REPO_ROOT, 'migration-docs', 'sql', '2026-04-30f-congregations-seed.sql')

// ─────────────────────────────────────────────────────────────────────
// Adatok — Erdélyi Református Egyházkerület 15 egyházmegye
// (Ugyanaz mint a build-dioceses-seed.mjs-ben — egyszerűsítés érdekében
//  duplikálva, hogy a SQL-generátor önállóan futhat.)
// ─────────────────────────────────────────────────────────────────────

const ERDELYI_DIOCESES = [
  { em: 'Brassói Református Egyházmegye', list: ['Alsórákosi','Bákói Református Missziói','Balázstelki','Bodolai','Brassó I.','Brassó II.','Brassó III.','Bukarest I.','Bukarest II.','Bürkösi','Erzsébetvárosi','Fogarasi','Galaci','Keresztvári','Kóbori','Kőhalmi','Küküllőalmási','Medgyesi','Mihályfalvi','Nagymohai','Nagyszebeni','Négyfalusi','Olthévízi','Ramnicu Valcea-i','Szentágotai','Vízaknai','Zernyesti'] },
  { em: 'Dési Református Egyházmegye', list: ['Almásmálomi','Apanagyfalui','Árpástói','Bacai','Bálványosváraljai','Besztercei','Bethleni','Bonchidai','Búzai','Cegőtelkei','Désaknai','Déscichegyi','Dési','Esztényi','Feketelaki','Felőri','Katonai','Kékesi','Kendilónai','Kérői','Kisiklódi','Kozárvári','Magyarberétei','Magyarborzási','Magyardécsei','Magyarnemegyei','Melegföldvári','Mezőköbölkúti','Mezőveresegyházi','Nagysajói','Naszódi','Nyíresi','Ördöngösfüzesi','Rettegi','Sajószentandrási','Sófalvi','Somkeréki','Szamosújvári','Szászlekence–Vermesi','Széki','Szentmargitai','Szentmátéi','Szépkenyerűszentmártoni','Tacsi','Újősi','Várkudui','Vicei'] },
  { em: 'Erdővidéki Református Egyházmegye', list: ['Bardoci','Baróti','Bibarcfalvi','Bodosi','Bölöni','Erdőfülei','Kisbaconi','Köpeci','Középajtai','Magyarhermányi','Nagyajtai','Nagybaconi','Olaszteleki','Szárazajtai','Székelyszáldobosi'] },
  { em: 'Görgényi Református Egyházmegye', list: ['Abafájai','Alsóbölkényi','Beresztelkei','Borszéki Református Missziói','Dedrádszéplaki','Disznajói','Erdőcsinádi','Fickói','Gernyeszegi','Görgényszentimrei','Holtmarosi','Jódratosnyai','Kisfülpösi','Körtvélyfájai','Ludvégi','Magyarfülpösi','Magyarói','Magyarpéterlakai','Magyarrégeni','Marosfelfalui','Maroshévízi','Marosjárai','Marossárpataki','Marosvécsi','Mezőörményesi','Pókai','Pókakeresztúri','Radnótfájai','Sáromberki','Szászrégeni','Tekei','Toldalagi','Vajdaszentiványi'] },
  { em: 'Hunyadi Református Egyházmegye', list: ['Alpestesi','Brádi','Dévai','Harói','Hátszegi','Hosdáti','Lupényi','Petrilla-Lónyai','Petrozsényi','Piski','Rákosdi','Szászvárosi','Vajdahunyadi','Vulkáni'] },
  { em: 'Kalotaszegi Református Egyházmegye', list: ['Bánffyhunyadi','Bogártelki','Egeresi','Farnasi','Gyalui','Gyerővásárhelyi','Inaktelki','Kalotadámosi','Kalotaszentkirályi','Ketesdi','Kispetri','Körösfői','Középlaki','Magyarbikali','Magyargyerőmonostori','Magyarkapusi','Magyarkiskapusi','Magyarlónai','Magyarókerekei','Magyarvalkói','Magyarvistai','Mákófalvi','Mérai','Nádasdaróczi','Nagypetri','Nyárszó-Sárvásári','Sztánai','Türei','Váralmási','Zsoboki'] },
  { em: 'Kézdi-Orbai Református Egyházmegye', list: ['Alsócsernátoni','Barátosi','Berecki Református Missziói','Bitai','Cófalvi','Csomakőrösi','Dálnoki','Egerpataki','Eresztevényi','Feldobolyi','Felsőcsernátoni','Ikafalvi','Karatnai Református Missziói','Kézdialbisi','Kézdimárkosfalvi','Kézdimartonfalvi','Kézdivásárhelyi','Kisborosnyói','Komandói','Kovászna I.- Belvárosi','Kovászna II. – Vajnafalvi','Lécfalvi','Maksai','Nagyborosnyói','Orbaiteleki','Pákéi','Papolci','Pávai','Sepsibesenyői','Szacsvai','Székelytamásfalvi','Szörcsei','Torjai','Zabolai','Zágoni'] },
  { em: 'Kolozsvári Református Egyházmegye', list: ['Apahidai Református Missziói','Bádoki','Bodonkúti','Györgyfalvi','Kajántói','Kidei','Kisbácsi','Kolozsborsai','Kolozsi','Kolozsmonostori','Kolozspatai','Kolozsvár-Alsóvárosi','Kolozsvár-Belvárosi','Kolozsvár-Bulgáriatelepi','Kolozsvár-Felsővárosi','Kolozsvár-Hidelvei','Kolozsvár-Irisztelepi','Kolozsvár-Kerekdombi','Kolozsvár-Törökvágási','Kolozsvár-Tóvidéki','Kolozsvár-Újalsóvárosi','Magyarfenesi','Magyarkályáni Református Missziói','Magyarlétai','Magyarpalatkai','Magyarszováti','Mezőkeszüi','Mócsi','Pusztakamarási Református Missziói','Szamosfalvi','Szászfenesi','Szucsági','Tordaszentlászlói','Vajdakamarási','Válaszúti','Visai'] },
  { em: 'Küküllői Református Egyházmegye', list: ['Ádámosi','Backamadarasi','Balavásári','Bedei','Berekeresztúri','Bonyhai','Bözödi','Csíkfalvi Református Missziói','Désfalvi','Dicsőszentmártoni','Egrestői','Erdőszentgyörgyi','Fehéregyházi','Gegesi','Gógáni','Gógánváraljai','Gyulakutai','Haranglábi','Hármasfalui','Havadi','Havadtői','Héderfáji','Héjjasfalvi','Kelementelki','Kibédi','Kiskendi','Kóródszentmártoni','Küküllőpócsfalvi','Küküllőszéplaki','Magyarkirályfalvi','Májai','Makfalvi','Márkodi','Mikefalvi','Nagybúni','Nagykendi','Nyárádmagyarósi','Nyárádselyei','Nyárádszentannai','Nyárádszentimrei','Nyárádszentsimoni','Nyárádszeredai','Segesvári','Sóváradi','Sövényfalvi','Szászcsávási','Szederjesi','Székelyabodi','Székelytompai','Szentgericei','Szőkefalvi','Szolokmai','Szovátai','Szövérdi','Torboszlói','Vadasdi','Vámosgálfalvi'] },
  { em: 'Maros-Mezőségi Református Egyházmegye', list: ['Csittszentiváni','Galambodi','Kissármási','Madarasi-Feketei','Marosszentannai','Marosszentkirályi','Marosvásárhely III. – Alsóvárosi','Marosvásárhely IV. – Szabadi úti','Marosvásárhely V. – Felsővárosi','Marosvásárhely VI. – Meggyesfalvi','Marosvásárhely VII. – Szabadság utcai','Mezőbándi','Mezőbergenyei','Mezőbodoni','Mezőcsávási','Mezőfelei','Mezőkölpényi','Mezőmadarasi','Mezőméhesi','Mezőpaniti','Mezősámsondi','Mezőzáhi','Nagyernyei','Nagysármási','Székelykakasdi','Székelykövesdi','Udvarfalvi','Uzdiszentpéteri','Várhegyi'] },
  { em: 'Marosi Református Egyházmegye', list: ['Ákosfalvi','Búzásbesenyői','Csejdi','Csekelaki','Cserefalvi','Dózsa Györgyi','Fintaházi','Gerendkeresztúri','Göcsi','Hagymásbodoni','Harasztkeréki','Istvánházi','Jeddi','Káposztásszentmiklósi','Kebelei','Kisgörgényi','Koronkai','Kutyfalvi','Lőrincfalvi','Ludastelepi','Magyarbükkösi','Magyardellői','Magyarózdi','Marosbogáti','Maroscsapói','Maroskeresztúri','Marosludasi','Marosszentgyörgyi','Marosugrai','Marosvásárhely I. – Vártemplomi','Marosvásárhely II. – Gecse utcai','Marosvásárhely VIII. – Cserealjai','Marosvásárhely IX. – Tulipán utcai','Marosvásárhely X. – Kövesdombi','Nyárádkarácsonfalvi','Nyárádszentbenedeki','Nyárádtői','Oláhdellői','Radnóti','Somosdi','Székelyvajai','Székesi','Teremiújfalui'] },
  { em: 'Nagyenyedi Református Egyházmegye', list: ['Abrudbányai','Balázsfalvi','Bethlenszentmiklósi','Búzásbocsárdi','Csombordi','Enyedszentkirályi','Felenyedi','Felvinci','Gyulafehérvári','Küküllőboldogfalvi','Küküllővári','Lőrincrévei','Magyarbecei','Magyarbényei','Magyarigeni Református Missziói','Magyarlapádi','Magyarpéterfalvi','Maroscsúcs-Koppándi','Marosdécsei','Marosgombás','Marosnagylaki','Marosújvári','Miriszlói','Nagyenyedi','Nagymedvési','Székelykocsárdi','Torockószentgyörgyi','Tövisi','Vajasdi'] },
  { em: 'Sepsi Református Egyházmegye', list: ['Aldobolyi','Angyalosi','Árapataki','Árkosi','Bikfalvi','Erősdi','Étfalvazoltáni','Fotosmartonosi','Gidófalvi','Hídvégi','Illyefalvi','Kálnoki','Kilyéni','Kökösi','Komollói','Lisznyói','Málnási','Mikóújfalusi','Oltszemi','Rétyi','Sepsibodoki','Sepsikőröspataki','Sepsimagyarosi','Sepsiszentgyörgy I. – Vártemplomi','Sepsiszentgyörgy II. – Szemerjai','Sepsiszentgyörgy III. – Belvárosi','Sepsiszentgyörgy IV. – Gyöngyvirág utcai','Sepsiszentkirályi','Szotyori','Uzoni','Zaláni'] },
  { em: 'Székelyudvarhelyi Református Egyházmegye', list: ['Agyagfalvi','Alsóboldogfalvi','Alsósófalvi','Bágyi','Betfalvi','Bikafalvi','Bögözi','Csekefalvi Református Missziói','Csíkszentmártoni Református Missziói','Csíkszeredai','Etédi','Farcádi','Felsőboldogfalvi','Felsősófalvi','Fiatfalvi','Gyergyószentmiklósi Református Missziói','Hodgyai','Homoródszentmártoni Református Missziói','Kányádi','Kecseti','Kisgalambfalvi','Kőrispataki','Küsmődi','Madéfalvi Református Missziói','Mátisfalvi','Nagygalambfalvi','Nagysolymosi','Ócfalvi','Parajdi','Patakfalvi','Peteki','Rugonfalvi','Siklódi','Siménfalvi Református Missziói','Székelydályai','Székelykeresztúri','Székelymuzsnai','Székelyszenterzsébeti','Székelyudvarhely-Belvárosi','Székelyudvarhely-Bethlen-negyedi','Székelyudvarhely-Szombatfalvi','Szentkeresztbányai','Telekfalvi'] },
  { em: 'Tordai Református Egyházmegye', list: ['Ajtoni','Alsó-Felsőszentmihályi','Aranyosegerbegyi','Aranyosgerendi','Aranyosgyéresi','Aranyospolyáni','Detrehemtelepi','Harasztosi','Kercsedi','Magyarfrátai','Mezőnagycsányi','Ótordai','Tordatúri','Újtordai'] },
]

// ─────────────────────────────────────────────────────────────────────
// Slug generálás (public_slug-hoz)
// ─────────────────────────────────────────────────────────────────────

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// SQL-string escape
function sqlEscape(s) {
  return s.replace(/'/g, "''")
}

// ─────────────────────────────────────────────────────────────────────
// SQL generálás
// ─────────────────────────────────────────────────────────────────────

const lines = []
lines.push('-- KARTOTEKA — Erdélyi Református Egyházkerület 495 egyházközség seed')
lines.push('-- Dátum: 2026-04-30f (hatodik a napon)')
lines.push('-- Futtatja: Endre (Supabase Studio SQL Editor)')
lines.push('--')
lines.push('-- HÁTTÉR: a 2026-04-30c-dioceses-cleanup után a `dioceses` tábla 15')
lines.push('-- egyházmegyét tartalmaz, de a `congregations` tábla CSAK a saját')
lines.push('-- Barátosi rekordot. Az átjelentkezési wizard célgyülekezet-választója')
lines.push('-- és az auto-javaslat ezért nem működik más gyülekezetekre.')
lines.push('--')
lines.push('-- Ez a SQL beimportálja a 495 erdélyi egyházközséget (klasszikus, intézmények')
lines.push('-- — kollégiumok, FIKE, Kórházlelkész — kihagyva). Mindegyik kap:')
lines.push("--   name + nev_hu: hivatalos név (pl. 'Brassó I. Református Egyházközség')")
lines.push("--   district: 'Erdélyi Református Egyházkerület'")
lines.push('--   diocese_id: a megfelelő dioceses sor (lookup name szerint)')
lines.push("--   country: 'Románia'")
lines.push("--   public_slug: slugified név (egyedi)")
lines.push('--')
lines.push('-- IDEMPOTENS: WHERE NOT EXISTS védi a duplikációkat. A meglévő')
lines.push('-- "Barátosi Református Egyházközség" rekordot NEM bántja.')
lines.push('')
lines.push('BEGIN;')
lines.push('')

// Statisztika kezdetben
let totalRows = 0

for (const dio of ERDELYI_DIOCESES) {
  lines.push('-- ' + '═'.repeat(76))
  lines.push(`-- ${dio.em} — ${dio.list.length} egyházközség`)
  lines.push('-- ' + '═'.repeat(76))

  for (const shortName of dio.list) {
    // Hivatalos teljes név: pl. "Brassó I. Református Egyházközség"
    // De néhánynál a missziói/kollégium suffix már bent van — vegyük át pontosan
    let fullName
    if (shortName.endsWith('Református Missziói')) {
      fullName = `${shortName} Egyházközség`
    } else {
      fullName = `${shortName} Református Egyházközség`
    }

    const slug = slugify(fullName)

    lines.push(`-- ${fullName}`)
    lines.push(`INSERT INTO public.congregations (id, name, nev_hu, district, egyhazmegye, diocese_id, country, public_slug, public_site_enabled, revision, created_at, updated_at)`)
    lines.push(`SELECT gen_random_uuid(), '${sqlEscape(fullName)}', '${sqlEscape(fullName)}', 'Erdélyi Református Egyházkerület', '${sqlEscape(dio.em)}', d.id, 'Románia', '${slug}', false, 0, now(), now()`)
    lines.push(`FROM public.dioceses d`)
    lines.push(`WHERE d.name = '${sqlEscape(dio.em)}'`)
    lines.push(`AND NOT EXISTS (SELECT 1 FROM public.congregations WHERE name = '${sqlEscape(fullName)}');`)
    lines.push('')
    totalRows += 1
  }
}

lines.push('COMMIT;')
lines.push('')
lines.push('-- ' + '═'.repeat(76))
lines.push('-- ELLENŐRZÉS')
lines.push('-- ' + '═'.repeat(76))
lines.push('')
lines.push('-- 1. Erdélyi gyülekezetek statisztikája egyházmegye szerint')
lines.push('SELECT d.name AS egyhazmegye, COUNT(c.id) AS gyulekezetek_szama')
lines.push('FROM public.dioceses d')
lines.push('LEFT JOIN public.congregations c ON c.diocese_id = d.id')
lines.push('JOIN public.districts dt ON d.district_id = dt.id')
lines.push("WHERE dt.name = 'Erdélyi Református Egyházkerület'")
lines.push('GROUP BY d.id, d.name')
lines.push('ORDER BY d.name;')
lines.push('')
lines.push('-- 2. Összes erdélyi gyülekezet (várt: ~' + totalRows + ' + a meglévők)')
lines.push('SELECT COUNT(*) AS osszes_erdelyi_gyulekezet')
lines.push('FROM public.congregations c')
lines.push('JOIN public.dioceses d ON c.diocese_id = d.id')
lines.push('JOIN public.districts dt ON d.district_id = dt.id')
lines.push("WHERE dt.name = 'Erdélyi Református Egyházkerület';")
lines.push('')
lines.push('-- 3. Példa: Sepsi Református Egyházmegyéhez tartozó gyülekezetek')
lines.push('SELECT c.name')
lines.push('FROM public.congregations c')
lines.push('JOIN public.dioceses d ON c.diocese_id = d.id')
lines.push("WHERE d.name = 'Sepsi Református Egyházmegye'")
lines.push('ORDER BY c.name;')
lines.push("-- Várt: 31 sor (Sepsiszentgyörgy 4 db, Árkosi, Rétyi, Gidófalvi, ...)")

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8')
console.log('✅ SQL mentve:', OUTPUT_FILE)
console.log('   INSERT-ek (új gyülekezet maximum):', totalRows)
console.log('   Idempotens: WHERE NOT EXISTS védi az ismételt futást')
