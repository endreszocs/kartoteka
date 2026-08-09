'use client'

/**
 * Meghívó szekció — a jegyzőkönyvek főoldalán.
 * Meghívó generálás presbiteri gyűlésre vagy közgyűlésre.
 */

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail, Plus, Trash2, Printer, MessageCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { getPresbyterNames, createInvitation } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { getNextFilingNumberPreview } from '@/app/(dashboard)/iktato/actions'
import { toast } from 'sonner'

type JkTipus = 'presbiteri' | 'kozgyulesi'

export function InvitationSection({ congregationName = 'Református Egyházközség' }: { congregationName?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [tipus, setTipus] = useState<JkTipus>('presbiteri')
  const [datum, setDatum] = useState('')
  const [hely, setHely] = useState('')
  const [kezdes, setKezdes] = useState('18:00')
  const [napirendPontok, setNapirendPontok] = useState<string[]>([''])
  const [presbyters, setPresbyters] = useState<Array<{ nev: string; telefon: string | null }>>([])
  // 2026-08-10 (K4 iktatószám-diagnosztika #2): ELŐNÉZET (nem foglalt) és a
  // ténylegesen KIOSZTOTT szám külön állapotban. Eddig egyetlen, szerkeszthető
  // mező volt, amelynek az értékét a szerver figyelmen kívül hagyta — a
  // kinyomtatott meghívón így olyan szám szerepelhetett, ami MÁSIK irathoz
  // tartozott (vagy két meghívón ugyanaz).
  const [previewIktatoszam, setPreviewIktatoszam] = useState<string | null>(null)
  const [issuedIktatoszam, setIssuedIktatoszam] = useState<string | null>(null)

  // Az iktatás mindig a KELT dátum évébe történik (createInvitation) — az
  // előnézetet is arra az évre kérjük, nem a mai évre.
  const targetYear = useMemo(() => {
    const y = Number((datum || '').slice(0, 4))
    return Number.isFinite(y) && y >= 1800 && y <= 2200 ? y : new Date().getFullYear()
  }, [datum])

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    void getPresbyterNames().then((data) => {
      if (!cancelled) setPresbyters(data)
    })
    return () => { cancelled = true }
  }, [expanded])

  // A következő iktatószám előnézete — a panel kinyitásakor ÉS évváltáskor.
  // (A setState csak a promise-callbackben fut: az effektus-testből hívott
  // szinkron setState kaszkádolt renderelést okozna — react-hooks szabály.)
  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    void getNextFilingNumberPreview(targetYear).then((res) => {
      if (cancelled) return
      setPreviewIktatoszam(res.error ? null : res.iratszam)
    })
    return () => { cancelled = true }
  }, [expanded, targetYear])

  // A nyomtatványra kerülő szám: a VÉGLEGES, kiosztott iktatószám — iktatás
  // előtt kitöltő-vonal (az igazolás-kiállító dialógus bevett mintája).
  const iktatoszamNyomtatasra = issuedIktatoszam || '__________'

  function addNapirend() { setNapirendPontok((p) => [...p, '']) }
  function removeNapirend(i: number) { setNapirendPontok((p) => p.filter((_, idx) => idx !== i)) }

  function handlePrint(iktatoszamOverride?: string) {
    // Az iktatás UTÁN a friss, kiosztott számmal nyomtatunk — a React state
    // ekkor még nem biztos, hogy frissült, ezért explicit paraméter.
    const szamSor = iktatoszamOverride || iktatoszamNyomtatasra
    const tipusLabel = tipus === 'presbiteri' ? 'Presbitérium tagjait' : 'gyülekezet tagjait'
    const napLabel = tipus === 'presbiteri' ? 'presbiteri' : 'közgyűlési'
    const napirendHtml = napirendPontok.filter((n) => n.trim()).map((n) => `<div style="margin-bottom:3px;padding-left:16px;">- ${n}</div>`).join('')

    // Presbiterek listája aláírási sorral
    let presbiterRows = ''
    presbyters.forEach((p, i) => {
      presbiterRows += `<div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:12px;">
        <span>${i + 1}. ${p.nev}</span>
        <span style="flex:1;border-bottom:1px dotted #94a3b8;margin:0 8px 4px;"></span>
      </div>`
    })

    const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Meghívó</title>
    <style>
      @page { size: A4 portrait; margin: 20mm 20mm 13mm 30mm; }
      body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; padding: 0; font-size: 12pt; line-height: 1.6; }
      .letterhead { border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 16px; }
      .letterhead .church { font-size: 14pt; font-weight: bold; font-style: italic; }
      .letterhead .office { font-style: italic; font-weight: bold; }
      .letterhead .address { font-style: italic; font-size: 11pt; color: #475569; }
      .letterhead .contact { font-size: 11pt; color: #475569; }
      .iktato { text-align: right; font-weight: bold; font-style: italic; margin: 12px 0; }
      .title { text-align: center; font-weight: bold; font-style: italic; font-size: 14pt; letter-spacing: 6px; margin: 24px 0 16px; }
      .body { text-align: justify; margin: 12px 0; }
      .tsorozat-title { font-weight: bold; margin: 16px 0 8px; }
      .date-line { margin-top: 24px; }
      .closing { margin: 8px 0; font-style: italic; }
      .sig-name { font-weight: bold; margin-top: 16px; }
      .sig-title { font-size: 11pt; margin-left: 8px; }
      .tudomasul { margin-top: 24px; font-size: 11pt; font-weight: bold; }
      .presb-list { margin-top: 8px; columns: 2; column-gap: 24px; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="letterhead">
        <div class="church">${congregationName}</div>
        <div class="office">Lelkipásztori Hivatala.</div>
        <div class="office">Lelkipásztori Hivatala.</div>
      </div>

      <div class="iktato">Szám: ${szamSor}</div>

      <div class="title">M e g h í v ó</div>

      <div class="body">
        Tisztelettel és szeretettel hívom meg a ${tipusLabel} a ${datum || '___'}-${tipus === 'presbiteri' ? 'e' : 'á'}n, ${kezdes || '___'} órakor kezdődő, ${napLabel} gyűlésre. A gyűlés helye: ${hely || 'az egyházközség gyülekezeti terme'}.
      </div>

      ${napirendHtml ? `<div class="tsorozat-title">Tárgysorozat:</div>${napirendHtml}` : ''}

      <div class="date-line">Kelt: ${datum || '___'}</div>
      <div class="closing">Atyafiai köszöntéssel,</div>

      <div class="sig-title">lelkipásztor</div>

      ${presbiterRows ? `<div class="tudomasul">Tudomásul vették:</div><div class="presb-list">${presbiterRows}</div>` : ''}
    </body></html>`

    const win = window.open('', '_blank', 'width=900,height=820')
    if (win) { win.document.write(html); win.document.close() }
  }

  function handleIktatas() {
    if (!datum) { toast.error('A dátum kötelező.'); return }
    if (!hely.trim()) { toast.error('A helyszín kötelező.'); return }
    if (!kezdes) { toast.error('A kezdés időpontja kötelező.'); return }
    startTransition(async () => {
      const result = await createInvitation({
        datum, hely, kezdes, tipus,
        napirendi_pontok: napirendPontok.filter((n) => n.trim()),
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      // 2026-08-10: a nyomtatásra a szerver által ATOMIKUSAN kiosztott szám
      // kerül — nem az előnézet (az két meghívónál ugyanaz lehetett).
      const kiosztott = result.iktatoszam || null
      setIssuedIktatoszam(kiosztott)
      if (kiosztott) {
        toast.success(`Meghívó iktatva: ${kiosztott}`)
        handlePrint(kiosztott)
      } else {
        toast.warning('A meghívó iktatva, de a kiosztott iktatószámot nem sikerült visszaolvasni — ellenőrizd az iktatókönyvben.')
        handlePrint()
      }
    })
  }

  function handleWhatsApp() {
    const tipusLabel = tipus === 'presbiteri' ? 'presbiteri gyűlésre' : 'közgyűlésre'
    const napirendText = napirendPontok.filter((n) => n.trim()).map((n, i) => `${i + 1}. ${n}`).join('\n')
    const message = `Meghívó ${tipusLabel}\n\n📅 ${datum}, ${kezdes}\n📍 ${hely}\n\n${napirendText ? `Napirendi pontok:\n${napirendText}\n\n` : ''}Megjelenésére számítok!`
    const encoded = encodeURIComponent(message)

    const withPhone = presbyters.filter((p) => p.telefon)
    if (withPhone.length > 0) {
      const phone = withPhone[0].telefon!.replace(/[^+\d]/g, '')
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank')
      toast.success(`WhatsApp megnyitva — ${withPhone.length} presbiternek van telefonszáma.`)
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank')
      toast.info('WhatsApp megnyílt — válaszd ki a címzettet.')
    }
  }

  return (
    <div className="card-raised overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Mail className="size-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">Meghívó készítése</p>
            <p className="text-xs text-slate-500">Presbiteri gyűlésre vagy közgyűlésre — nyomtatás, iktatás, WhatsApp küldés</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Típus */}
          <div className="flex gap-2">
            {(['presbiteri', 'kozgyulesi'] as JkTipus[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipus(t)}
                className={`flex-1 rounded-xl border p-3 text-center text-sm font-medium transition ${tipus === t ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {t === 'presbiteri' ? 'Presbiteri gyűlés' : 'Közgyűlés'}
              </button>
            ))}
          </div>

          {/* Adatok */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Iktatószám</label>
              {/* 2026-08-10: READ-ONLY. Korábban szerkeszthető volt, de a
                  createInvitation a beírt értéket figyelmen kívül hagyta (saját
                  számot osztott) — a papíron így MÁSIK irat száma szerepelhetett. */}
              <Input
                value={issuedIktatoszam || previewIktatoszam || '…'}
                readOnly
                aria-readonly
                className="rounded-xl font-semibold text-indigo-700 bg-slate-50"
              />
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {issuedIktatoszam
                  ? 'Iktatva — ez a végleges szám került a nyomtatványra.'
                  : 'Várható szám — csak az „Iktatás + nyomtatás" gombra véglegesedik. Iktatás előtti nyomtatásnál a szám helyére kitöltő-vonal kerül.'}
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Dátum *</label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Helyszín *</label>
              <Input value={hely} onChange={(e) => setHely(e.target.value)} placeholder="pl. Gyülésterem" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Kezdés *</label>
              <Input type="time" value={kezdes} onChange={(e) => setKezdes(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          {/* Napirendi pontok */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Napirendi pontok</label>
              <Button size="sm" variant="ghost" onClick={addNapirend} className="text-xs text-violet-600">
                <Plus className="size-3 mr-1" /> Pont hozzáadása
              </Button>
            </div>
            <div className="space-y-2">
              {napirendPontok.map((pont, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs shrink-0">{idx + 1}.</Badge>
                  <Input
                    value={pont}
                    onChange={(e) => setNapirendPontok((p) => p.map((x, i) => i === idx ? e.target.value : x))}
                    placeholder="Napirendi pont címe..."
                    className="rounded-xl"
                  />
                  {napirendPontok.length > 1 && (
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 shrink-0" onClick={() => removeNapirend(idx)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Presbiterek info */}
          {presbyters.length > 0 && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">
                <strong>{presbyters.length}</strong> presbiter · <strong>{presbyters.filter((p) => p.telefon).length}</strong> telefonszámmal
              </p>
              <p className="text-xs text-slate-400 truncate">{presbyters.map((p) => p.nev).join(', ')}</p>
            </div>
          )}

          {/* Akció gombok */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => handlePrint()}>
              <Printer className="size-4 mr-1" /> Meghívó nyomtatása
            </Button>
            <Button variant="outline" className="rounded-xl border-indigo-200 text-indigo-700" onClick={handleIktatas} disabled={isPending}>
              <FileText className="size-4 mr-1" /> {isPending ? 'Iktatás...' : 'Iktatás + nyomtatás'}
            </Button>
            <Button variant="outline" className="rounded-xl border-green-200 text-green-700" onClick={handleWhatsApp}>
              <MessageCircle className="size-4 mr-1" /> WhatsApp küldés
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
