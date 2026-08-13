'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Printer,
  RotateCcw,
  Upload,
  Trash2,
  ImageOff,
  Image as ImageIcon,
  Eraser,
  RotateCw,
  Ruler,
  Copy,
  Pencil,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  EMLEKLAP_TEMPLATES,
  EMLEKLAP_SAMPLE_DATA,
  fillTemplate,
  type EmleklapTemplate,
  type EmleklapType,
} from '@/lib/constants/emleklap-templates'
import { CertificateRenderer, type OverlayImage, type FieldOverride } from './certificate-renderer'
import { fileToDataUrl, removeWhiteBackground } from '@/lib/utils/image-bg-remove'

/**
 * Anyakönyvi emléklap-stúdió (2026-05-29 átdolgozás).
 *
 * UX-elv: a lelkész a kész emléklap-vásznon közvetlenül kattintva tudja
 * szerkeszteni a szövegeket — nincs külön „űrlap" oldal. A felül lévő toolbar
 * a sablon-választást, háttér-toggle-t és a nyomtatást vezérli, a jobb oldalon
 * pedig csak a képi rétegek (pecsét, aláírások) kerülnek.
 */

interface CertificateGeneratorProps {
  initialType?: EmleklapType
  initialVariant?: 'erek' | 'kerek' | 'kek' | 'hagyomanyos'
  initialData?: Record<string, string | undefined>
  onClose?: () => void
  /** Ha true, a típus-választó rejtve van — a stúdió a megnyitáskor kapott
   *  típushoz van rögzítve (pl. ha az anyakönyv „keresztelés" tabjáról nyílt). */
  lockType?: boolean
}

interface OverlaySlot {
  id: 'seal' | 'pastorSignature' | 'wardenSignature'
  label: string
  defaultX: number
  defaultY: number
  defaultWidth: number
  allowRotate: boolean
}

const OVERLAY_SLOTS: OverlaySlot[] = [
  { id: 'pastorSignature', label: 'Lelkipásztor aláírása', defaultX: 10, defaultY: 76, defaultWidth: 22, allowRotate: false },
  { id: 'wardenSignature', label: 'Gondnok aláírása', defaultX: 68, defaultY: 76, defaultWidth: 22, allowRotate: false },
  { id: 'seal', label: 'Pecsét', defaultX: 40, defaultY: 75, defaultWidth: 20, allowRotate: true },
]

/** Adat-objektum normalizálása: undefined → '' (a fillTemplate erre számít). */
function normalizeData(data: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v != null) out[k] = v
  }
  return out
}

/**
 * 2026-05-30: a gondnok neve a baptism-dialog-ban localStorage-be mentődik
 * (`kartoteka.emleklap.gondnokName`), hogy a következő rögzítéskor automatikus
 * legyen. A stúdiónak is innen kell betöltenie, ha a caller nem adott át
 * `wardenName`-et — különben a sor-szintű „Emléklap" gombból nyitott stúdió
 * üres gondnok-mezővel jelenik meg, és a felhasználó azt hiszi, „nem jegyezte
 * meg" a rendszer.
 */
function enrichFromLocalStorage(data: Record<string, string>): Record<string, string> {
  if (typeof window === 'undefined') return data
  const out = { ...data }
  try {
    if (!out.wardenName) {
      const saved = localStorage.getItem('kartoteka.emleklap.gondnokName')
      if (saved) out.wardenName = saved
    }
  } catch { /* SSR / private mode — silent */ }
  return out
}

/** Adott sablonra az alap szövegértékek (placeholder → adat behelyettesítés). */
function buildInitialFieldValues(
  template: EmleklapTemplate,
  data: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of template.fields) {
    out[field.id] = fillTemplate(field.defaultValue, data)
  }
  return out
}

export function CertificateGenerator({
  initialType = 'kereszteles',
  initialVariant = 'erek',
  initialData,
  onClose,
  lockType = false,
}: CertificateGeneratorProps) {
  const [selectedType, setSelectedType] = useState<EmleklapType>(initialType)
  const [selectedVariant, setSelectedVariant] = useState<'erek' | 'kerek' | 'kek' | 'hagyomanyos'>(initialVariant)
  const [showBackground, setShowBackground] = useState(true)
  const [overlays, setOverlays] = useState<OverlayImage[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showCalibration, setShowCalibration] = useState(false)
  const [calibrationMode, setCalibrationMode] = useState(false)
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, FieldOverride>>({})

  const activeTemplate: EmleklapTemplate = useMemo(() => {
    const id = `${selectedType === 'konfirmacio' ? 'konfirmacio' : selectedType}-${selectedVariant}`
    return EMLEKLAP_TEMPLATES.find((t) => t.id === id) ?? EMLEKLAP_TEMPLATES[0]
  }, [selectedType, selectedVariant])

  // Sablon-váltáskor az új sablon mezőinek alapértékeit építjük (placeholder feloldva)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const base = { ...EMLEKLAP_SAMPLE_DATA[selectedType], ...(initialData ? normalizeData(initialData) : {}) }
    return buildInitialFieldValues(activeTemplate, enrichFromLocalStorage(base))
  })

  // Sablon-váltáskor reset
  useEffect(() => {
    const base = { ...EMLEKLAP_SAMPLE_DATA[selectedType], ...(initialData ? normalizeData(initialData) : {}) }
    setFieldValues(buildInitialFieldValues(activeTemplate, enrichFromLocalStorage(base)))
    setFieldOverrides({})
    setActiveFieldId(null)
  }, [activeTemplate.id, selectedType, initialData])

  function resetToSample() {
    const base = { ...EMLEKLAP_SAMPLE_DATA[selectedType], ...(initialData ? normalizeData(initialData) : {}) }
    setFieldValues(buildInitialFieldValues(activeTemplate, enrichFromLocalStorage(base)))
  }

  const printRef = useRef<HTMLDivElement>(null)

  // ─── Mezőszöveg-szerkesztés ─────────────────────────────────────────────
  function handleFieldEdit(fieldId: string, newText: string) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: newText }))
    // 2026-05-30: a gondnok nevét localStorage-ben is tároljuk, hogy a
    // következő stúdió-megnyitáskor / kereszteléskor sticky legyen
    // (a baptism-dialog ugyanezt a kulcsot használja).
    if (fieldId === 'wardenName' && newText.trim()) {
      try { localStorage.setItem('kartoteka.emleklap.gondnokName', newText.trim()) } catch {}
    }
  }

  // ─── Overlay-kezelők ─────────────────────────────────────────────────────
  async function handleUpload(slot: OverlaySlot, file: File) {
    try {
      const dataUrl = await fileToDataUrl(file)
      setOverlays((prev) => {
        const others = prev.filter((o) => o.id !== slot.id)
        return [
          ...others,
          { id: slot.id, src: dataUrl, x: slot.defaultX, y: slot.defaultY, width: slot.defaultWidth, rotation: 0 },
        ]
      })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  async function handleRemoveBg(id: string) {
    const overlay = overlays.find((o) => o.id === id)
    if (!overlay) return
    setProcessingId(id)
    try {
      const processed = await removeWhiteBackground(overlay.src)
      setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, src: processed } : o)))
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setProcessingId(null)
    }
  }

  function handleRemoveOverlay(id: string) {
    setOverlays((prev) => prev.filter((o) => o.id !== id))
  }

  function handleOverlayDrag(id: string, newX: number, newY: number) {
    setOverlays((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) } : o,
      ),
    )
  }

  function handleOverlayResize(id: string, width: number) {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, width } : o)))
  }

  function handleOverlayRotate(id: string, rotation: number) {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, rotation } : o)))
  }

  // ─── Mező-kalibráció (rejtett fejlesztői felület) ────────────────────────
  function getFieldEffective(fieldId: string) {
    const field = activeTemplate.fields.find((f) => f.id === fieldId)
    if (!field) return null
    const ov = fieldOverrides[fieldId]
    return {
      x: ov?.x ?? field.x,
      y: ov?.y ?? field.y,
      width: ov?.width ?? field.width,
      fontSize: ov?.fontSize ?? field.fontSize,
    }
  }

  function setFieldValue(fieldId: string, key: keyof FieldOverride, value: number) {
    setFieldOverrides((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], [key]: value } }))
  }

  function handleFieldDrag(fieldId: string, newX: number, newY: number) {
    const clampedX = Math.max(0, Math.min(100, newX))
    const clampedY = Math.max(0, Math.min(100, newY))
    setFieldOverrides((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], x: clampedX, y: clampedY } }))
  }

  function resetFieldOverride(fieldId: string) {
    setFieldOverrides((prev) => {
      const { [fieldId]: _omit, ...rest } = prev
      return rest
    })
  }

  function resetAllOverrides() {
    setFieldOverrides({})
  }

  async function copyOverridesJson() {
    const effective = activeTemplate.fields.map((f) => {
      const ov = fieldOverrides[f.id]
      return {
        id: f.id,
        x: Number((ov?.x ?? f.x).toFixed(2)),
        y: Number((ov?.y ?? f.y).toFixed(2)),
        width: Number((ov?.width ?? f.width).toFixed(2)),
        fontSize: Number((ov?.fontSize ?? f.fontSize).toFixed(2)),
      }
    })
    const json = JSON.stringify({ templateId: activeTemplate.id, fields: effective }, null, 2)
    try {
      await navigator.clipboard.writeText(json)
      alert(`Vágólapra másolva (${effective.length} mező).`)
    } catch {
      console.log(json)
      alert('Vágólapra másolás sikertelen — a JSON a konzolba került.')
    }
  }

  function handlePrint() {
    if (!printRef.current) return
    const html = printRef.current.outerHTML
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) {
      alert('A böngésző blokkolta a popup-ot. Engedélyezd a felugró ablakokat.')
      return
    }
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Emléklap nyomtatás</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        .editable-field { outline: none !important; }
        @media print {
          html, body { width: 210mm; height: 297mm; }
          .certificate-renderer { box-shadow: none !important; }
        }
      </style>
    </head><body>${html}<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script></body></html>`)
    win.document.close()
  }

  const activeFieldInfo = activeFieldId ? getFieldEffective(activeFieldId) : null

  return (
    <div className="flex flex-col gap-3">
      {/* ─── Felső toolbar ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Pencil className="size-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-600">Sablon:</span>
        </div>
        {lockType ? (
          // Rögzített típus — pl. ha az anyakönyv „keresztelés" tabjáról nyílt meg
          // a stúdió, ne lehessen átváltani konfirmáció/esketés sablonra.
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700">
            {selectedType === 'kereszteles'
              ? 'Keresztelői emléklap'
              : selectedType === 'esketes'
                ? 'Házasságkötési emléklap'
                : 'Konfirmációi emléklap'}
          </span>
        ) : (
          <select
            value={selectedType}
            onChange={(e) => {
              const next = e.target.value as EmleklapType
              setSelectedType(next)
              // 2026-05-30: a KÉK csak keresztelőn, a Hagyományos csak esketésen.
              if (selectedVariant === 'kek' && next !== 'kereszteles') setSelectedVariant('erek')
              if (selectedVariant === 'hagyomanyos' && next !== 'esketes') setSelectedVariant('erek')
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="kereszteles">Keresztelői emléklap</option>
            <option value="esketes">Házasságkötési emléklap</option>
            <option value="konfirmacio">Konfirmációi emléklap</option>
          </select>
        )}

        <div className="ml-1 flex gap-1 rounded-md bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setSelectedVariant('erek')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${selectedVariant === 'erek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Erdélyi új
          </button>
          <button
            type="button"
            onClick={() => setSelectedVariant('kerek')}
            className={`px-2.5 py-1 text-xs font-medium rounded ${selectedVariant === 'kerek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Királyhágós új
          </button>
          {/* 2026-05-30: Hagyományos kék — csak keresztelőhöz, mert a kék-fehér
              népi díszítésű sablon csak keresztelési ágon van. */}
          {selectedType === 'kereszteles' && (
            <button
              type="button"
              onClick={() => setSelectedVariant('kek')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${selectedVariant === 'kek' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
              title="Kék-fehér népi díszítésű hagyományos sablon"
            >
              Hagyományos kék
            </button>
          )}
          {/* 2026-05-30: Hagyományos (piros népi keret) — csak esketéshez */}
          {selectedType === 'esketes' && (
            <button
              type="button"
              onClick={() => setSelectedVariant('hagyomanyos')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${selectedVariant === 'hagyomanyos' ? 'bg-white text-red-800 shadow-sm' : 'text-slate-500'}`}
              title="Piros népi keret — hagyományos sablon"
            >
              Hagyományos
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowBackground((s) => !s)}
            className="h-8 px-2.5 text-xs"
            title={showBackground ? 'Háttér elrejtése' : 'Háttér megjelenítése'}
          >
            {showBackground ? <ImageIcon className="size-3.5" /> : <ImageOff className="size-3.5" />}
            <span className="ml-1.5 hidden sm:inline">Háttér</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToSample}
            className="h-8 px-2.5 text-xs"
            title="Szövegek visszaállítása az alap-adatokra"
          >
            <RotateCcw className="size-3.5" />
            <span className="ml-1.5 hidden sm:inline">Alaphelyzet</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700"
          >
            <Printer className="size-3.5 mr-1.5" />
            Nyomtatás
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2" title="Bezárás">
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
        {/* ─── Fő terület: emléklap-vászon ─── */}
        <main className="flex flex-col items-center justify-start gap-2">
          <p className="text-xs text-slate-500 text-center">
            <Pencil className="size-3 inline mr-1" />
            A szövegekre kattintva közvetlenül szerkesztheted őket az emléklapon. A pecsét/aláírás képeket egérrel húzhatod.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-inner">
            <CertificateRenderer
              ref={printRef}
              template={activeTemplate}
              fieldValues={fieldValues}
              previewWidth={560}
              showBackground={showBackground}
              overlays={overlays}
              onOverlayDrag={handleOverlayDrag}
              editable={!calibrationMode}
              onFieldEdit={handleFieldEdit}
              calibrationMode={calibrationMode}
              activeFieldId={activeFieldId}
              fieldOverrides={fieldOverrides}
              onFieldSelect={setActiveFieldId}
              onFieldDrag={handleFieldDrag}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            A4 álló · {activeTemplate.fields.length} szövegréteg · {overlays.length} képréteg
          </p>

          {/* Rejtett kalibrációs panel (fejlesztői használatra) */}
          <div className="w-full max-w-xl mt-2">
            <button
              type="button"
              onClick={() => setShowCalibration((s) => !s)}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline"
            >
              {showCalibration ? '▴ Kalibrációs eszközök elrejtése' : '▾ Pixelpontos kalibráció (fejlesztői)'}
            </button>
            {showCalibration && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Ruler className="size-3.5" />
                    <span className="font-medium">Kalibrációs mód</span>
                  </div>
                  <Button
                    type="button"
                    variant={calibrationMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalibrationMode((m) => !m)}
                    className="h-6 px-2 text-[11px]"
                  >
                    {calibrationMode ? 'BE' : 'KI'}
                  </Button>
                </div>
                {calibrationMode && (
                  <>
                    <select
                      value={activeFieldId ?? ''}
                      onChange={(e) => setActiveFieldId(e.target.value || null)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                    >
                      <option value="">— válassz mezőt —</option>
                      {activeTemplate.fields.map((f) => (
                        <option key={f.id} value={f.id}>{f.id} ({f.label})</option>
                      ))}
                    </select>
                    {activeFieldInfo && activeFieldId && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <CalibInput label="X" value={activeFieldInfo.x} step={0.1} onChange={(v) => setFieldValue(activeFieldId, 'x', v)} />
                        <CalibInput label="Y" value={activeFieldInfo.y} step={0.1} onChange={(v) => setFieldValue(activeFieldId, 'y', v)} />
                        <CalibInput label="W" value={activeFieldInfo.width} step={0.5} onChange={(v) => setFieldValue(activeFieldId, 'width', v)} />
                        <CalibInput label="Font" value={activeFieldInfo.fontSize} step={0.05} onChange={(v) => setFieldValue(activeFieldId, 'fontSize', v)} />
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      {activeFieldId && (
                        <Button type="button" variant="outline" size="sm" onClick={() => resetFieldOverride(activeFieldId)} className="h-6 px-2 text-[10px] flex-1">
                          Mező vissza
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={resetAllOverrides} className="h-6 px-2 text-[10px] flex-1">
                        Mind vissza
                      </Button>
                      <Button type="button" size="sm" onClick={copyOverridesJson} className="h-6 px-2 text-[10px] flex-1 bg-emerald-600 hover:bg-emerald-700">
                        <Copy className="size-3 mr-1" />
                        JSON
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ─── Jobb oldal: pecsét + aláírás-feltöltések ─── */}
        <aside className="space-y-2.5 lg:max-h-[78dvh] lg:overflow-y-auto lg:pr-1">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Képi rétegek
            </h4>
            <p className="text-[11px] leading-relaxed text-slate-500 mb-3">
              Töltsd fel a szkennelt pecsétet vagy aláírást. Az emléklap-vásznon egérrel húzhatod a helyére.
            </p>

            {OVERLAY_SLOTS.map((slot) => {
              const current = overlays.find((o) => o.id === slot.id)
              return (
                <div key={slot.id} className="rounded-md border border-slate-200 p-2.5 space-y-2 mb-2 last:mb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{slot.label}</span>
                    {current && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOverlay(slot.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Eltávolítás"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {!current ? (
                    <label className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100">
                      <Upload className="size-3.5" />
                      Kép feltöltése
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleUpload(slot, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <img
                          src={current.src}
                          alt=""
                          className="h-8 w-8 rounded border border-slate-200 bg-white object-contain"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveBg(slot.id)}
                          disabled={processingId === slot.id}
                          className="h-7 px-2 text-[11px] flex-1"
                        >
                          <Eraser className="size-3 mr-1" />
                          {processingId === slot.id ? 'Folyamatban…' : 'Háttér el'}
                        </Button>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 flex items-center justify-between">
                          <span>Méret</span>
                          <span className="font-mono">{current.width.toFixed(0)}%</span>
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={50}
                          step={0.5}
                          value={current.width}
                          onChange={(e) => handleOverlayResize(slot.id, Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      {slot.allowRotate && (
                        <div>
                          <label className="text-[10px] text-slate-500 flex items-center justify-between">
                            <span className="flex items-center gap-1"><RotateCw className="size-2.5" /> Forgatás</span>
                            <span className="font-mono">{(current.rotation ?? 0).toFixed(0)}°</span>
                          </label>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={1}
                            value={current.rotation ?? 0}
                            onChange={(e) => handleOverlayRotate(slot.id, Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-[11px] leading-relaxed text-amber-900">
              <strong>💡 Tipp:</strong> A változó szövegek (név, dátum, hely, lelkipásztor neve…) közvetlenül a vásznon szerkeszthetőek — kattints rá, és gépeld be a helyes adatot. Enter-rel kiléphetsz a mezőből.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

interface CalibInputProps {
  label: string
  value: number
  step: number
  onChange: (v: number) => void
}

function CalibInput({ label, value, step, onChange }: CalibInputProps) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-slate-600">
      <span className="font-mono w-5">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-right font-mono text-[10px]"
      />
    </label>
  )
}
