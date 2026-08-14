'use client'

/**
 * Kassza-bátorító (2026-08-14, 13. pont — Endre kérése).
 *
 * A Kassza fül kiemelt rögzítő-sávjának tartalma: szépen kiírt felirat + egy
 * sáfársággal/hűséggel kapcsolatos bátorító igevers, és a párhuzamos
 * bevétel–kiadás vezetés biztatása. Az igevers naponta vált (az év napja
 * szerinti körforgás), így minden nap más ige köszön vissza.
 *
 * A szövegek a Károli-fordításból valók (a rendszer natív Károli-t használ,
 * lásd public/bibles/karoli.json) — itt rövid, kézzel válogatott idézetek.
 */

const SAFARSAG_IGEK: ReadonlyArray<{ hivatkozas: string; szoveg: string }> = [
  { hivatkozas: '2Kor 9,7', szoveg: 'A jókedvű adakozót szereti az Isten.' },
  { hivatkozas: 'Lk 16,10', szoveg: 'A ki hű a kevesen, a sokon is hű az.' },
  { hivatkozas: 'Péld 21,5', szoveg: 'A szorgalmatosnak igyekezete csak gyarapodásra van.' },
  { hivatkozas: '1Kor 4,2', szoveg: 'A mi pedig egyébiránt a sáfárokban megkívántatik, az, hogy mindenik hívnek találtassék.' },
  { hivatkozas: 'Mt 25,21', szoveg: 'Jól vagyon jó és hű szolgám, kevesen voltál hű, sokra bízlak ezután.' },
  { hivatkozas: 'Péld 27,23', szoveg: 'Szorgalmasan megismerd a te juhaid külsejét, gondolj a nyájakra.' },
  { hivatkozas: 'Kol 3,23', szoveg: 'És valamit tesztek, lélekből cselekedjétek, mint az Úrnak és nem embereknek.' },
  { hivatkozas: 'Lk 14,28', szoveg: 'Mert ha közületek valaki tornyot akar építeni, nemde először leülvén felszámítja a költséget, ha van-é mivel elvégezze?' },
  { hivatkozas: 'Róm 13,8', szoveg: 'Senkinek semmivel ne tartozzatok, hanem csak azzal, hogy egymást szeressétek.' },
  { hivatkozas: 'Péld 3,9', szoveg: 'Tiszteld az Urat a te marhádból, a te egész jövedelmed zsengéjéből.' },
]

export function KasszaBiztato() {
  // Az év napja szerinti körforgás — determinisztikus, naponta vált.
  const most = new Date()
  const evKezdete = Date.UTC(most.getFullYear(), 0, 1)
  const evNapja = Math.floor((Date.UTC(most.getFullYear(), most.getMonth(), most.getDate()) - evKezdete) / 86_400_000)
  const ige = SAFARSAG_IGEK[evNapja % SAFARSAG_IGEK.length]

  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        Vezesd a kasszát naprakészen — a bevételt és a kiadást is!
      </p>
      <p className="text-xs italic leading-relaxed text-emerald-800/90 dark:text-emerald-300/80">
        „{ige.szoveg}" <span className="not-italic font-medium">({ige.hivatkozas})</span>
      </p>
      <p className="text-[11px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/60">
        A mentés után a tételek dátum szerint rendezve kerülnek a helyükre.
      </p>
    </div>
  )
}
