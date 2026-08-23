'use client'

/**
 * ÁSZF-ELFOGADÁS ŐR — a bizonyíték csendes rögzítője (2026-08-23).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT CSINÁL
 * ════════════════════════════════════════════════════════════════════════════
 * Az ÁSZF 13. pontja szerint „a további használat elfogadásnak minősül".
 * Amikor egy bejelentkezett felhasználó a belépés után ELŐSZÖR találkozik egy
 * verzióval, ez a komponens rögzít egy sort: profil + verzió + időpont.
 *
 * ⚠️ NEM RENDEREL SEMMIT, és NEM ZAVARJA a felhasználót. A dialógus, a pipa és
 * az elfogadó gomb MÁS tartomány dolga; ez itt kizárólag a NAPLÓ.
 *
 * ⚠️ A VERZIÓT A JOGI DIALÓGUS ADJA (`LEGAL_VERSION`), nincs második konstans.
 * Ha valaki emeli a jogi szöveg verzióját, ez a napló magától új sort ír — nem
 * kell rá emlékezni.
 *
 * ⚠️ ÉS AZÉRT DINAMIKUS AZ IMPORT. A `legal-dialog.tsx` a teljes magyar, román
 * és angol jogi szöveget tartalmazza (több ezer sor). Egy statikus import ezt
 * MINDEN irányítópult-oldal kezdő csomagjába behúzná — egy háttér-naplózás
 * kedvéért lassítanánk a lelkész minden egyes oldalbetöltését. Ezért:
 *   · munkamenetenként (böngészőfülenként) LEGFELJEBB EGYSZER futunk,
 *   · a betöltés a böngésző ÜRESJÁRATÁBAN indul (requestIdleCallback), tehát
 *     sosem versenyez a lap kirajzolásával,
 *   · ha a `localStorage` már tudja, hogy ezt a verziót rögzítettük, azonnal
 *     kilépünk.
 *
 * ⚠️ TELJESEN NÉMA HIBA ESETÉN. Ha a tábla még nincs meg (a kód előbb megy
 * élesbe, mint az SQL), a szerver-akció csendben `siker: false`-t ad — a
 * felhasználó ebből semmit nem lát, és semmi nem romlik el.
 */

import { useEffect } from 'react'

import { rogzitsAszfElfogadast } from '@/app/(dashboard)/admin/adatvedelem-actions'

const JELOLO_ELOTAG = 'kartoteka.aszf.elfogadva.'
const MUNKAMENET_ELOTAG = 'kartoteka.aszf.probalva.'

/** Üresjárat-ütemezés, ha a böngésző tudja; különben késleltetett időzítő. */
function utemezUresjaratban(futtat: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(futtat, { timeout: 8000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(futtat, 4000)
  return () => window.clearTimeout(id)
}

export function AszfElfogadasOr({ profileId }: { profileId: string | null }) {
  useEffect(() => {
    if (!profileId) return

    const munkamenetKulcs = MUNKAMENET_ELOTAG + profileId
    try {
      if (window.sessionStorage.getItem(munkamenetKulcs) === '1') return
    } catch {
      // A sessionStorage tiltható (privát mód) — ilyenkor a lenti localStorage
      // jelölő és a szerver egyediségi kulcsa is véd a fölösleges munkától.
    }

    let elvetve = false

    const megse = utemezUresjaratban(() => {
      if (elvetve) return
      try {
        window.sessionStorage.setItem(munkamenetKulcs, '1')
      } catch {
        // Nem baj.
      }
      void (async () => {
        try {
          // ⚠️ Dinamikus import: a jogi szöveg NEM kerül a kezdő csomagba.
          const { LEGAL_VERSION } = await import('@/components/auth/legal-dialog')
          if (elvetve) return

          const kulcs = JELOLO_ELOTAG + profileId + '.' + LEGAL_VERSION
          try {
            if (window.localStorage.getItem(kulcs) === '1') return
          } catch {
            // Tiltott tároló: a szerver egyediségi kulcsa (profile_id, verzio)
            // úgyis elnyeli az ismétlést.
          }

          const eredmeny = await rogzitsAszfElfogadast(LEGAL_VERSION)
          if (elvetve) return
          if (eredmeny.siker) {
            try {
              window.localStorage.setItem(kulcs, '1')
            } catch {
              // Nem baj: a következő munkamenetben újra próbáljuk.
            }
          }
        } catch {
          // Csendben. Ez háttér-naplózás, nem a felhasználó dolga.
        }
      })()
    })

    return () => {
      elvetve = true
      megse()
    }
  }, [profileId])

  return null
}
