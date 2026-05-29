'use client'

import { forwardRef, useEffect, useRef } from 'react'
import {
  type EmleklapTemplate,
  type EmleklapField,
} from '@/lib/constants/emleklap-templates'

/**
 * A4-arányú emléklap renderer.
 *
 * 2026-05-29 átalakítás: a szövegmezők IN-PLACE szerkeszthetőek lettek
 * (contentEditable). A lelkész a kész emléklap-vásznon közvetlenül a szövegre
 * kattintva tud módosítani — nincs külön űrlap. A placeholder-feloldás már a
 * generator-ban megtörténik (`fieldValues`), itt csak a renderelés.
 */

export interface OverlayImage {
  id: string
  src: string
  x: number
  y: number
  width: number
  rotation?: number
}

export interface FieldOverride {
  x?: number
  y?: number
  width?: number
  fontSize?: number
}

export interface CertificateRendererProps {
  template: EmleklapTemplate
  /** Mező-azonosító → szövegérték. A generator tölti fel a sablonból + adatból. */
  fieldValues: Record<string, string>
  previewWidth?: number
  printMode?: boolean
  className?: string
  showBackground?: boolean
  overlays?: OverlayImage[]
  onOverlayDrag?: (id: string, newX: number, newY: number) => void
  /** In-place szerkesztés engedélyezett (false: print/kalibráció). */
  editable?: boolean
  /** Mező szövegének módosítása (blur-kor hívódik). */
  onFieldEdit?: (fieldId: string, newText: string) => void
  /** Kalibrációs mód: szövegmezők keret + drag. */
  calibrationMode?: boolean
  activeFieldId?: string | null
  fieldOverrides?: Record<string, FieldOverride>
  onFieldSelect?: (fieldId: string) => void
  onFieldDrag?: (fieldId: string, newX: number, newY: number) => void
}

export const CertificateRenderer = forwardRef<HTMLDivElement, CertificateRendererProps>(
  function CertificateRenderer(
    {
      template,
      fieldValues,
      previewWidth = 700,
      printMode = false,
      className = '',
      showBackground = true,
      overlays = [],
      onOverlayDrag,
      editable = false,
      onFieldEdit,
      calibrationMode = false,
      activeFieldId = null,
      fieldOverrides,
      onFieldSelect,
      onFieldDrag,
    },
    ref,
  ) {
    const previewHeight = previewWidth / template.aspectRatio

    return (
      <div
        ref={ref}
        className={`certificate-renderer relative ${className}`}
        style={{
          width: `${previewWidth}px`,
          height: `${previewHeight}px`,
          maxWidth: '100%',
          aspectRatio: `${template.aspectRatio}`,
          background: showBackground ? 'transparent' : '#ffffff',
        }}
        data-template-id={template.id}
      >
        {showBackground && (
          <img
            src={template.backgroundImage}
            alt={template.name}
            className="absolute inset-0 h-full w-full select-none"
            draggable={false}
            style={{ objectFit: 'fill', userSelect: 'none' }}
          />
        )}

        {calibrationMode && !printMode && <CalibrationGuides />}

        {template.fields.map((field) => {
          const override = fieldOverrides?.[field.id]
          const mergedField: EmleklapField = override
            ? {
                ...field,
                x: override.x ?? field.x,
                y: override.y ?? field.y,
                width: override.width ?? field.width,
                fontSize: override.fontSize ?? field.fontSize,
              }
            : field
          return (
            <FieldLayer
              key={field.id}
              field={mergedField}
              text={fieldValues[field.id] ?? ''}
              containerWidth={previewWidth}
              containerHeight={previewHeight}
              printMode={printMode}
              editable={editable && !calibrationMode}
              onEdit={onFieldEdit}
              calibrationMode={calibrationMode}
              isActive={calibrationMode && activeFieldId === field.id}
              onSelect={onFieldSelect}
              onDrag={onFieldDrag}
            />
          )
        })}

        {overlays.map((overlay) => (
          <OverlayLayer
            key={overlay.id}
            overlay={overlay}
            containerWidth={previewWidth}
            containerHeight={previewHeight}
            printMode={printMode}
            onDrag={onOverlayDrag}
          />
        ))}
      </div>
    )
  },
)

function CalibrationGuides() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: [
          'linear-gradient(to right, rgba(255, 0, 0, 0.4) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(255, 0, 0, 0.4) 1px, transparent 1px)',
          'linear-gradient(to right, rgba(255, 0, 0, 0.12) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(255, 0, 0, 0.12) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '50% 50%, 50% 50%, 10% 10%, 10% 10%',
      }}
    />
  )
}

interface FieldLayerProps {
  field: EmleklapField
  text: string
  containerWidth: number
  containerHeight: number
  printMode: boolean
  editable: boolean
  onEdit?: (fieldId: string, newText: string) => void
  calibrationMode: boolean
  isActive: boolean
  onSelect?: (fieldId: string) => void
  onDrag?: (fieldId: string, newX: number, newY: number) => void
}

function FieldLayer({
  field,
  text,
  containerWidth,
  containerHeight,
  printMode,
  editable,
  onEdit,
  calibrationMode,
  isActive,
  onSelect,
  onDrag,
}: FieldLayerProps) {
  const fontSizePx = (containerHeight * field.fontSize) / 100
  const editableRef = useRef<HTMLDivElement>(null)

  // A contentEditable belső szövegét csak akkor frissítjük, ha eltér a propstól
  // és nincs fókuszban (egyébként szétugrik a kurzor szerkesztés közben).
  useEffect(() => {
    const el = editableRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerText !== text) el.innerText = text
  }, [text])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (printMode || !calibrationMode || !onDrag) return
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(field.id)
    const startX = e.clientX
    const startY = e.clientY
    const startFieldX = field.x
    const startFieldY = field.y
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const dxPx = ev.clientX - startX
      const dyPx = ev.clientY - startY
      const dxPercent = (dxPx / containerWidth) * 100
      const dyPercent = (dyPx / containerHeight) * 100
      onDrag!(field.id, startFieldX + dxPercent, startFieldY + dyPercent)
    }
    function onUp() {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!editable || !onEdit) return
    const newText = e.currentTarget.innerText
    if (newText !== text) onEdit(field.id, newText)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!editable) return
    if (!field.multiline && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  const calibStyles: React.CSSProperties = calibrationMode
    ? {
        outline: isActive ? '2px solid #16a34a' : '1px dashed rgba(20, 184, 166, 0.7)',
        outlineOffset: 0,
        backgroundColor: isActive ? 'rgba(22, 163, 74, 0.08)' : 'rgba(20, 184, 166, 0.04)',
        cursor: 'move',
      }
    : {}

  const editableHoverStyles: React.CSSProperties =
    editable && !printMode
      ? {
          cursor: 'text',
        }
      : {}

  return (
    <div
      ref={editableRef}
      onPointerDown={handlePointerDown}
      onBlur={editable ? handleBlur : undefined}
      onKeyDown={editable ? handleKeyDown : undefined}
      contentEditable={editable && !calibrationMode && !printMode}
      suppressContentEditableWarning
      spellCheck={editable && !printMode}
      data-field-id={field.id}
      data-field-editable={editable ? 'true' : 'false'}
      className={`${printMode ? 'pointer-events-none' : ''} ${editable ? 'editable-field' : ''}`}
      style={{
        position: 'absolute',
        left: `${field.x}%`,
        top: `${field.y}%`,
        width: `${field.width}%`,
        fontFamily: field.fontFamily,
        fontSize: `${fontSizePx}px`,
        fontWeight: field.fontWeight,
        fontStyle: field.italic ? 'italic' : 'normal',
        color: field.color,
        textAlign: field.textAlign,
        lineHeight: field.lineHeight,
        letterSpacing: `${field.letterSpacing}em`,
        textTransform: field.textTransform ?? 'none',
        whiteSpace: field.multiline ? 'pre-wrap' : 'nowrap',
        wordBreak: field.multiline ? 'normal' : 'keep-all',
        overflow: 'visible',
        outline: 'none',
        touchAction: calibrationMode ? 'none' : undefined,
        userSelect: calibrationMode ? 'none' : undefined,
        ...editableHoverStyles,
        ...calibStyles,
      }}
    >
      {calibrationMode && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: -14,
            left: 0,
            fontFamily: 'monospace',
            fontSize: 9,
            background: isActive ? '#16a34a' : '#0d9488',
            color: 'white',
            padding: '1px 4px',
            borderRadius: 2,
            whiteSpace: 'nowrap',
            letterSpacing: 0,
            fontWeight: 500,
            lineHeight: 1.2,
            textTransform: 'none',
          }}
        >
          {field.id} · {field.x.toFixed(1)},{field.y.toFixed(1)} · {field.fontSize.toFixed(2)}
        </span>
      )}
      {/* A kezdeti tartalmat az effect tölti — itt nem renderelünk children-t,
          mert a contentEditable mód miatt React/DOM szinkronizációs problémák lennének. */}
      {!editable && text}
    </div>
  )
}

interface OverlayLayerProps {
  overlay: OverlayImage
  containerWidth: number
  containerHeight: number
  printMode: boolean
  onDrag?: (id: string, newX: number, newY: number) => void
}

function OverlayLayer({ overlay, containerWidth, containerHeight, printMode, onDrag }: OverlayLayerProps) {
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (printMode || !onDrag) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startOverlayX = overlay.x
    const startOverlayY = overlay.y
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const dxPx = ev.clientX - startX
      const dyPx = ev.clientY - startY
      const dxPercent = (dxPx / containerWidth) * 100
      const dyPercent = (dyPx / containerHeight) * 100
      onDrag!(overlay.id, startOverlayX + dxPercent, startOverlayY + dyPercent)
    }
    function onUp() {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        transform: overlay.rotation ? `rotate(${overlay.rotation}deg)` : undefined,
        cursor: printMode ? 'default' : 'move',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <img
        src={overlay.src}
        alt=""
        draggable={false}
        className="w-full h-auto select-none"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}
