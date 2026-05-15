'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { sanitizeAboutHtml } from '@/lib/public-site/sanitize'

interface TermsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TermsDialog({ open, onOpenChange }: TermsDialogProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadContent() {
    if (content) return
    setLoading(true)
    try {
      // Amennyiben elérhető a régi rendszer feltételek oldala
      const res = await fetch('/felhasznaloi-feltetelek-content')
      if (res.ok) {
        setContent(await res.text())
      } else {
        setContent(defaultContent)
      }
    } catch {
      setContent(defaultContent)
    }
    setLoading(false)
  }

  if (open && !content && !loading) {
    loadContent()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Felhasználói Feltételek és Adatvédelmi Tájékoztató</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Betöltés...</div>
        ) : (
          <div className="prose prose-sm max-w-none text-slate-700 space-y-4">
            {/* DIAGNOSTICS P1-3a: sanitize a fetch-elt vagy fallback HTML-en
                — admin-szerkesztett /felhasznaloi-feltetelek-content szolgáltatja,
                így admin-injection ellen védjük. */}
            <div dangerouslySetInnerHTML={{ __html: sanitizeAboutHtml(content || defaultContent) }} />
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>Bezárás</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const defaultContent = `
<h3>1. Az adatkezelés célja</h3>
<p>A Kartotéka rendszer az Erdélyi Református Egyházkerület (EREK) digitális nyilvántartási rendszere, amely egyházi célokra kezeli a gyülekezeti tagok adatait.</p>

<h3>2. Az adatkezelés jogalapja</h3>
<p>Az adatkezelés az EU 2016/679 rendelete (GDPR) 9. cikk (2) bekezdés d) pontja alapján történik: vallási szervezet által végzett adatkezelés tagjai vonatkozásában.</p>

<h3>3. Kezelt adatok köre</h3>
<p>Személyes adatok: név, születési dátum, lakcím, telefonszám, e-mail, vallási hovatartozás, családi állapot, pénzügyi adatok (járulékfizetés).</p>

<h3>4. Adatbiztonság</h3>
<p>A rendszer TLS 1.3 titkosítást, Row Level Security-t, szerepkör-alapú hozzáférés-kezelést (RBAC) és kétfaktoros hitelesítést alkalmaz. Az adatok az Európai Unióban (Frankfurt) tárolt Supabase felhőben vannak.</p>

<h3>5. Hozzáférési jogosultságok</h3>
<p>A rendszergazda kizárólag a gyülekezet lelkészének előzetes engedélyével férhet hozzá a gyülekezeti adatokhoz. Ez az engedély időkorlátozott és naplózott.</p>

<h3>6. Kapcsolat</h3>
<p>Adatvédelmi kérdésekkel forduljon az egyházkerületi rendszergazdához.</p>

<p><em>Románia: 190/2018. tv. · EU GDPR 2016/679</em></p>
`
