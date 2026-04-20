/**
 * Magyar keresztnevek jelentései és eredete.
 *
 * Forrás: Ladó János — Bíró Ágnes: Magyar utónévkönyv (Akadémiai Kiadó),
 * kiegészítve a Magyar Tudományos Akadémia Nyelvtudományi Intézete által
 * jóváhagyott, anyakönyvezhető utónevek jegyzékéből.
 *
 * A leggyakoribb ~100 név jelentése — ha egy név nem szerepel itt,
 * az UI szépen fallback-el (csak a nevet mutatja, jelentés nélkül).
 */

export interface NameMeaning {
  /** Név (nominatív, ékezetekkel) */
  name: string
  /** Eredet: héber, görög, latin, germán, szláv, magyar, stb. */
  origin: string
  /** Jelentés magyarul, rövid mondatban */
  meaning: string
}

export const NAME_MEANINGS: NameMeaning[] = [
  // Női nevek
  { name: 'Anna', origin: 'héber', meaning: "kegyelem, kegyes" },
  { name: 'Ágnes', origin: 'görög', meaning: "szemérmes, tiszta" },
  { name: 'Ágota', origin: 'görög', meaning: "jó, jóságos" },
  { name: 'Aliz', origin: 'germán', meaning: "nemes származású" },
  { name: 'Andrea', origin: 'görög', meaning: "férfias, bátor" },
  { name: 'Anita', origin: 'héber', meaning: "kegyelem" },
  { name: 'Barbara', origin: 'görög', meaning: "idegen, külföldi" },
  { name: 'Beáta', origin: 'latin', meaning: "boldog" },
  { name: 'Bernadett', origin: 'germán', meaning: "medve-erős" },
  { name: 'Boglárka', origin: 'magyar', meaning: "ékesség, virág" },
  { name: 'Borbála', origin: 'görög', meaning: "idegen, külhoni" },
  { name: 'Brigitta', origin: 'kelta', meaning: "erős, hatalmas" },
  { name: 'Cecília', origin: 'latin', meaning: "vaknak vezetője" },
  { name: 'Csilla', origin: 'magyar', meaning: "Vörösmarty-alkotta, csillag-eredetű" },
  { name: 'Diána', origin: 'latin', meaning: "istennő, fényességes" },
  { name: 'Dóra', origin: 'görög', meaning: "Isten ajándéka (Dorottya rövidítése)" },
  { name: 'Dorottya', origin: 'görög', meaning: "Isten ajándéka" },
  { name: 'Edit', origin: 'angolszász', meaning: "győzelem-ajándék" },
  { name: 'Edina', origin: 'germán', meaning: "gazdag barát" },
  { name: 'Eleonóra', origin: 'görög', meaning: "könyörületes, irgalmas" },
  { name: 'Emese', origin: 'magyar', meaning: "anya, emlő (ősmagyar)" },
  { name: 'Emma', origin: 'germán', meaning: "univerzális, mindennek anyja" },
  { name: 'Enikő', origin: 'magyar', meaning: "szarvasünő (Vörösmarty)" },
  { name: 'Erika', origin: 'germán', meaning: "örök uralkodó" },
  { name: 'Erzsébet', origin: 'héber', meaning: "Isten az én esküm" },
  { name: 'Eszter', origin: 'perzsa', meaning: "csillag, mirtuszvirág" },
  { name: 'Éva', origin: 'héber', meaning: "élet, élő" },
  { name: 'Fruzsina', origin: 'görög', meaning: "öröm, vidámság" },
  { name: 'Gabriella', origin: 'héber', meaning: "Isten embere" },
  { name: 'Gizella', origin: 'germán', meaning: "túsz, kezes" },
  { name: 'Hajnalka', origin: 'magyar', meaning: "hajnal, a nap kezdete" },
  { name: 'Hanna', origin: 'héber', meaning: "kegyelem (Anna eredeti alakja)" },
  { name: 'Henrietta', origin: 'germán', meaning: "házura, birtokos" },
  { name: 'Ibolya', origin: 'magyar', meaning: "ibolya-virág" },
  { name: 'Ida', origin: 'germán', meaning: "munka, serénység" },
  { name: 'Ildikó', origin: 'germán', meaning: "harcos" },
  { name: 'Ilona', origin: 'görög', meaning: "fénylő, tündöklő" },
  { name: 'Irén', origin: 'görög', meaning: "béke" },
  { name: 'Izabella', origin: 'héber', meaning: "Isten fogadalma (Erzsébet változata)" },
  { name: 'Júlia', origin: 'latin', meaning: "Jupiterhez tartozó, fiatal" },
  { name: 'Judit', origin: 'héber', meaning: "Júdea asszonya, a magasztalt" },
  { name: 'Katalin', origin: 'görög', meaning: "tiszta, feddhetetlen" },
  { name: 'Klára', origin: 'latin', meaning: "fényes, ragyogó, híres" },
  { name: 'Krisztina', origin: 'görög', meaning: "Krisztushoz tartozó" },
  { name: 'Laura', origin: 'latin', meaning: "babérkoszorúval megjutalmazott" },
  { name: 'Lilla', origin: 'magyar', meaning: "liliom" },
  { name: 'Linda', origin: 'germán', meaning: "hársfa, szelíd" },
  { name: 'Lujza', origin: 'germán', meaning: "híres harcosnő" },
  { name: 'Magdolna', origin: 'héber', meaning: "Magdalából való" },
  { name: 'Margit', origin: 'görög', meaning: "gyöngy" },
  { name: 'Mária', origin: 'héber', meaning: "szeretett, keserű, úrnő" },
  { name: 'Márta', origin: 'arám', meaning: "úrnő" },
  { name: 'Melinda', origin: 'magyar', meaning: "Katona József alkotta, 'szelíd' jelentéssel" },
  { name: 'Mónika', origin: 'görög', meaning: "tanácsadó, egyetlen" },
  { name: 'Nóra', origin: 'latin', meaning: "becsület, tisztesség (Eleonóra)" },
  { name: 'Orsolya', origin: 'latin', meaning: "kis medve" },
  { name: 'Piroska', origin: 'magyar', meaning: "piros, tiszta (Prisca)" },
  { name: 'Réka', origin: 'magyar', meaning: "Attila felesége, ősmagyar" },
  { name: 'Renáta', origin: 'latin', meaning: "újjászületett" },
  { name: 'Rita', origin: 'görög', meaning: "gyöngy (Margaréta)" },
  { name: 'Rózsa', origin: 'latin', meaning: "rózsa-virág" },
  { name: 'Sára', origin: 'héber', meaning: "úrnő, fejedelemasszony" },
  { name: 'Sarolta', origin: 'magyar', meaning: "fehér menyét, ősmagyar (Saroldu)" },
  { name: 'Szilvia', origin: 'latin', meaning: "erdei" },
  { name: 'Szófia', origin: 'görög', meaning: "bölcsesség" },
  { name: 'Teréz', origin: 'görög', meaning: "nyár, arató" },
  { name: 'Tímea', origin: 'görög', meaning: "Jókai Mór alkotta, 'tisztelt' jelentésből" },
  { name: 'Tünde', origin: 'magyar', meaning: "Vörösmarty alkotta, tündér" },
  { name: 'Valéria', origin: 'latin', meaning: "erős, egészséges" },
  { name: 'Veronika', origin: 'görög', meaning: "győzelmet hozó, igazi képmás" },
  { name: 'Viktória', origin: 'latin', meaning: "győzelem" },
  { name: 'Virág', origin: 'magyar', meaning: "virág" },
  { name: 'Zita', origin: 'olasz', meaning: "kis leány" },
  { name: 'Zsófia', origin: 'görög', meaning: "bölcsesség" },
  { name: 'Zsuzsanna', origin: 'héber', meaning: "liliom" },

  // Férfi nevek
  { name: 'Adrián', origin: 'latin', meaning: "Hadria városából származó" },
  { name: 'Ákos', origin: 'magyar', meaning: "fehér sólyom (ősmagyar)" },
  { name: 'Albert', origin: 'germán', meaning: "nemes-fényes" },
  { name: 'Aladár', origin: 'germán', meaning: "mindenek ura" },
  { name: 'András', origin: 'görög', meaning: "férfias, bátor" },
  { name: 'Antal', origin: 'latin', meaning: "hervadhatatlan, becses" },
  { name: 'Árpád', origin: 'magyar', meaning: "árpa, az aratás fejedelme" },
  { name: 'Attila', origin: 'gót', meaning: "atyácska" },
  { name: 'Balázs', origin: 'latin', meaning: "selypítő" },
  { name: 'Bálint', origin: 'latin', meaning: "erős, egészséges (Valentinus)" },
  { name: 'Béla', origin: 'magyar', meaning: "szív, bél (ősmagyar)" },
  { name: 'Bence', origin: 'latin', meaning: "győző (Vincentius)" },
  { name: 'Benedek', origin: 'latin', meaning: "áldott" },
  { name: 'Bertalan', origin: 'arám', meaning: "Tolmaj fia" },
  { name: 'Botond', origin: 'magyar', meaning: "bunkósbottal harcoló (ősmagyar vezér)" },
  { name: 'Csaba', origin: 'magyar', meaning: "pásztor, vándor (ősmagyar)" },
  { name: 'Dániel', origin: 'héber', meaning: "Isten bírám" },
  { name: 'Dávid', origin: 'héber', meaning: "szeretett" },
  { name: 'Dénes', origin: 'görög', meaning: "Dionüszoszhoz tartozó" },
  { name: 'Dezső', origin: 'latin', meaning: "óhajtott, kívánt (Dezideriusz)" },
  { name: 'Domonkos', origin: 'latin', meaning: "az Úrhoz tartozó" },
  { name: 'Elek', origin: 'görög', meaning: "védelmező (Alexiosz)" },
  { name: 'Emil', origin: 'latin', meaning: "versengő, vetélkedő" },
  { name: 'Ernő', origin: 'germán', meaning: "komoly, elszánt" },
  { name: 'Ervin', origin: 'germán', meaning: "vadkan-barát" },
  { name: 'Fábián', origin: 'latin', meaning: "babtermelő" },
  { name: 'Ferenc', origin: 'latin', meaning: "francia, szabad" },
  { name: 'Gábor', origin: 'héber', meaning: "Isten embere, Isten erőssége" },
  { name: 'Gáspár', origin: 'perzsa', meaning: "kincset védő" },
  { name: 'Géza', origin: 'magyar', meaning: "fejedelmecske (ősmagyar)" },
  { name: 'György', origin: 'görög', meaning: "földműves" },
  { name: 'Gyula', origin: 'magyar', meaning: "vezér, fejedelem (ősmagyar méltóság)" },
  { name: 'Henrik', origin: 'germán', meaning: "birtokos, házura" },
  { name: 'Hunor', origin: 'magyar', meaning: "a hunok őse" },
  { name: 'Imre', origin: 'germán', meaning: "nagy király (Henrik mása)" },
  { name: 'István', origin: 'görög', meaning: "korona, koszorú" },
  { name: 'Iván', origin: 'héber', meaning: "Isten kegyelme (János keleti alakja)" },
  { name: 'Jakab', origin: 'héber', meaning: "sarkos, sarkot megragadó" },
  { name: 'János', origin: 'héber', meaning: "Isten kegyelme, Isten kegyelmes" },
  { name: 'József', origin: 'héber', meaning: "(Isten) gyarapít, megsokasít" },
  { name: 'Károly', origin: 'germán', meaning: "legény, férfi" },
  { name: 'Kálmán', origin: 'magyar', meaning: "maradvány, megmaradt (ősmagyar)" },
  { name: 'Kristóf', origin: 'görög', meaning: "Krisztust hordozó" },
  { name: 'László', origin: 'szláv', meaning: "dicső úr" },
  { name: 'Lajos', origin: 'germán', meaning: "híres harcos" },
  { name: 'Levente', origin: 'magyar', meaning: "lenni, élő (ősmagyar)" },
  { name: 'Márk', origin: 'latin', meaning: "Mars istenhez tartozó" },
  { name: 'Márton', origin: 'latin', meaning: "Marshoz tartozó, harcias" },
  { name: 'Máté', origin: 'héber', meaning: "Isten ajándéka" },
  { name: 'Mátyás', origin: 'héber', meaning: "Isten ajándéka" },
  { name: 'Mihály', origin: 'héber', meaning: "ki olyan, mint az Isten?" },
  { name: 'Miklós', origin: 'görög', meaning: "a nép győzője" },
  { name: 'Nándor', origin: 'germán', meaning: "merész utazó (Ferdinánd)" },
  { name: 'Norbert', origin: 'germán', meaning: "északról jövő, fényes" },
  { name: 'Ödön', origin: 'germán', meaning: "örökös védelmezője (Edmund)" },
  { name: 'Ottó', origin: 'germán', meaning: "örökség, vagyon" },
  { name: 'Pál', origin: 'latin', meaning: "kicsi, kisebb" },
  { name: 'Péter', origin: 'görög', meaning: "szikla" },
  { name: 'Richárd', origin: 'germán', meaning: "hatalmas, erős király" },
  { name: 'Róbert', origin: 'germán', meaning: "fényes hírű, dicsőséges" },
  { name: 'Roland', origin: 'germán', meaning: "hazája dicsősége" },
  { name: 'Sámuel', origin: 'héber', meaning: "Isten nevét kiáltja" },
  { name: 'Sándor', origin: 'görög', meaning: "férfiak védelmezője (Alexandrosz)" },
  { name: 'Szilárd', origin: 'magyar', meaning: "szilárd, állhatatos" },
  { name: 'Tamás', origin: 'arám', meaning: "iker" },
  { name: 'Tibor', origin: 'latin', meaning: "Tiberius folyóhoz tartozó" },
  { name: 'Tivadar', origin: 'görög', meaning: "Isten ajándéka (Theodor)" },
  { name: 'Vilmos', origin: 'germán', meaning: "erős akaratú védelmező" },
  { name: 'Viktor', origin: 'latin', meaning: "győztes" },
  { name: 'Vince', origin: 'latin', meaning: "győztes" },
  { name: 'Zoltán', origin: 'magyar', meaning: "fejedelem, élet (ősmagyar)" },
  { name: 'Zsigmond', origin: 'germán', meaning: "győzelem-védő" },
  { name: 'Zsolt', origin: 'magyar', meaning: "méltóságnév, szultán-eredetű" },
]

// Index a gyors kereséshez — ékezetekkel és azon kívül is
const MEANING_INDEX = new Map<string, NameMeaning>()
NAME_MEANINGS.forEach((entry) => {
  MEANING_INDEX.set(entry.name.toLowerCase(), entry)
  // Ékezet nélküli fallback (pl. "Ágnes" ↔ "agnes")
  const normalized = entry.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalized !== entry.name.toLowerCase()) {
    MEANING_INDEX.set(normalized, entry)
  }
})

/**
 * Visszaadja a név jelentését, vagy null, ha nem található.
 * Ékezet-toleráns.
 */
export function lookupNameMeaning(name: string): NameMeaning | null {
  const key = name.trim().toLowerCase()
  if (MEANING_INDEX.has(key)) return MEANING_INDEX.get(key)!
  const normalized = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return MEANING_INDEX.get(normalized) ?? null
}
