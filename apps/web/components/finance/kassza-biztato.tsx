'use client'

/**
 * Rögzítés-bátorító (2026-08-14, 13. pont — Endre kérése).
 *
 * Szépen kiírt felirat + egy sáfársággal/hűséggel kapcsolatos bátorító igevers,
 * és a párhuzamos bevétel–kiadás vezetés biztatása. Az igevers naponta vált (az
 * év napja szerinti körforgás), így minden nap más ige köszön vissza.
 *
 * 2026-08-15 (Endre): a blokk a Kassza fül rögzítő-sávjából a „Tétel rögzítése"
 * ABLAKBA költözött. A Kassza fülön ugyanis a sáv gombja megkettőzte a hero
 * „Tétel rögzítése" gombját; a bátorításnak pedig ott a helye, ahol a lelkész
 * ténylegesen rögzít.
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

export function RogzitesBiztato() {
  // Az év napja szerinti körforgás — determinisztikus, naponta vált.
  const most = new Date()
  const evKezdete = Date.UTC(most.getFullYear(), 0, 1)
  const evNapja = Math.floor((Date.UTC(most.getFullYear(), most.getMonth(), most.getDate()) - evKezdete) / 86_400_000)
  const ige = SAFARSAG_IGEK[evNapja % SAFARSAG_IGEK.length]

  // 2026-08-29 (Endre: „scrollozás nélkül lehessen mindent megoldani"): a blokk
  // EGYETLEN tömör sorra fogva — cím + igevers egymás mellett (szűk helyen törik),
  // a harmadik mondat pedig kikerült: a dialóg alcíme szó szerint ugyanezt mondja.
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50/70 px-4 py-2 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-teal-950/30">
      <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
        Vezesd naprakészen a bevételt és a kiadást is!
      </p>
      <blockquote className="border-l-2 border-emerald-400/70 pl-2.5 text-xs italic leading-relaxed text-emerald-800/90 dark:border-emerald-600/60 dark:text-emerald-300/85">
        „{ige.szoveg}"{' '}
        <span className="not-italic font-medium">({ige.hivatkozas})</span>
      </blockquote>
    </div>
  )
}
