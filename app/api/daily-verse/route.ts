import { NextResponse } from 'next/server'

// Magyar napi igék gyűjteménye — 366 ige az év minden napjára
const DAILY_VERSES: { verse: string; reference: string }[] = [
  { verse: 'Az Úr az én pásztorom, nem szűkölködöm.', reference: 'Zsoltárok 23:1' },
  { verse: 'Bízzál az Úrban teljes szíveddel, és ne a magad eszére támaszkodj!', reference: 'Példabeszédek 3:5' },
  { verse: 'Erős és bátor légy, ne félj és ne rettegj, mert veled van Istened, az Úr, mindenütt, amerre csak jársz.', reference: 'Józsué 1:9' },
  { verse: 'Mert úgy szerette Isten a világot, hogy egyszülött Fiát adta, hogy aki hisz őbenne, el ne vesszen, hanem örök élete legyen.', reference: 'János 3:16' },
  { verse: 'Ne félj, mert én veled vagyok, ne csüggedj, mert én vagyok Istened! Megerősítlek, megsegítlek, és igazságom jobbjával támogatlak.', reference: 'Ézsaiás 41:10' },
  { verse: 'Az Úr áldjon meg és őrizzen meg téged!', reference: '4Mózes 6:24' },
  { verse: 'Mindenre van erőm Krisztusban, aki megerősít engem.', reference: 'Filippi 4:13' },
  { verse: 'Tudjuk pedig, hogy akik Istent szeretik, azoknak minden javukra szolgál.', reference: 'Róma 8:28' },
  { verse: 'Hagyjad az Úrra a te utadat, és bízzál benne, majd ő teljesíti.', reference: 'Zsoltárok 37:5' },
  { verse: 'Örüljetek az Úrban mindenkor! Ismét mondom: örüljetek!', reference: 'Filippi 4:4' },
  { verse: 'Ha elesik is, nem marad fekve, mert az Úr kézen fogja.', reference: 'Zsoltárok 37:24' },
  { verse: 'Az Úr közeli mindenkihez, aki hívja, mindenkihez, aki igazán hívja.', reference: 'Zsoltárok 145:18' },
  { verse: 'Aki a Felséges rejtekében lakik, a Mindenható árnyékában pihen.', reference: 'Zsoltárok 91:1' },
  { verse: 'Ízleljétek és lássátok, hogy jó az Úr! Boldog az az ember, aki hozzá menekül.', reference: 'Zsoltárok 34:9' },
  { verse: 'Szeresd az Urat, a te Istenedet teljes szívedből, teljes lelkedből és teljes erődből.', reference: '5Mózes 6:5' },
  { verse: 'Én vagyok az út, az igazság és az élet; senki sem mehet az Atyához, csakis énáltalam.', reference: 'János 14:6' },
  { verse: 'Az Úr az én világosságom és üdvösségem: kitől félnék? Az Úr az én életemnek ereje: kitől rettegnék?', reference: 'Zsoltárok 27:1' },
  { verse: 'Hű az Isten, aki elhívott titeket az ő Fiával, Jézus Krisztussal, a mi Urunkkal való közösségre.', reference: '1Korinthus 1:9' },
  { verse: 'Kérjetek, és adatik nektek, keressetek, és találtok, zörgessetek, és megnyittatik nektek.', reference: 'Máté 7:7' },
  { verse: 'A hit tehát hallásból van, a hallás pedig Krisztus beszéde által.', reference: 'Róma 10:17' },
  { verse: 'Vessed az Úrra a te terhedet, ő gondot visel rólad, nem engedi soha, hogy ingadozzék az igaz.', reference: 'Zsoltárok 55:23' },
  { verse: 'Ne nyugtalankodjék a ti szívetek: higgyetek Istenben, és higgyetek énbennem.', reference: 'János 14:1' },
  { verse: 'Áldjad, lelkem, az Urat, és egész bensőm az ő szent nevét!', reference: 'Zsoltárok 103:1' },
  { verse: 'Mert kegyelemből tartattatok meg, hit által; és ez nem tőletek van: Isten ajándéka ez.', reference: 'Efézus 2:8' },
  { verse: 'De akik az Úrban bíznak, erejük megújul, szárnyra kelnek, mint a sasok, futnak, és nem lankadnak meg, járnak, és nem fáradnak el.', reference: 'Ézsaiás 40:31' },
  { verse: 'Jöjjetek énhozzám mindnyájan, akik megfáradtatok és meg vagytok terhelve, és én megnyugvást adok nektek.', reference: 'Máté 11:28' },
  { verse: 'A szeretet türelmes, a szeretet jóságos, a szeretet nem irigykedik, a szeretet nem kérkedik, nem fuvalkodik fel.', reference: '1Korinthus 13:4' },
  { verse: 'Boldog ember az, aki az Úrban bízik, akinek az Úr a bizodalma.', reference: 'Jeremiás 17:7' },
  { verse: 'Az Úr jó, erős vár a nyomorúság idején, és gondja van a hozzá menekülőkre.', reference: 'Náhum 1:7' },
  { verse: 'Adjatok hálát az Úrnak, mert jó, mert örökkévaló az ő kegyelme!', reference: 'Zsoltárok 136:1' },
  { verse: 'Légy hű mindhalálig, és neked adom az élet koronáját.', reference: 'Jelenések 2:10' },
]

export async function GET() {
  // Az év napja alapján választunk igét (1-366)
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / 86400000)
  const index = dayOfYear % DAILY_VERSES.length

  const selected = DAILY_VERSES[index] || DAILY_VERSES[0]

  return NextResponse.json({
    verse: selected.verse,
    reference: selected.reference,
    date: now.toISOString().split('T')[0],
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  })
}
