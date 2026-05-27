'use client'

import { forwardRef } from 'react'
import {
  type EmleklapTemplate,
  type EmleklapField,
  fillTemplate,
} from '@/lib/constants/emleklap-templates'

/**
 * Az emléklap A4 méretarányban renderelődik. A háttérkép és minden szövegréteg
 * SZÁZALÉKBAN van pozicionálva (a sablon-mezők szerint), így a komponens
 * bármilyen méretben (előnézet, print) arányos marad.
 *
 * Print: a `@media print` CSS-szel teljesen kitölti az A4-et margók nélkül.
 *
 * Használat:
 *   <CertificateRenderer template={EMLEKLAP_TEMPLATES_MAP['kereszteles-erek']} data={sampleData} />
 *
 * PDF-export: a böngésző saját "Mentés PDF-ként" funkciójával működik a
 * `window.print()` után. A sablon dimenziói A4-re vannak kalibrálva.
 */

export interface CertificateRendererProps {
  template: EmleklapTemplate
  data: Record<string, string | undefined>
  /** Tetszőleges méretű előnézet — px-ben. Default: 700px szélesség (~A4 70%). */
  previewWidth?: number
  /** Print-mód (rejtve a hover-effektek és overlay). */
  printMode?: boolean
  /** Extra CSS-osztály a wrapper-en. */
  className?: string
}

export const CertificateRenderer = forwardRef<HTMLDivElement, CertificateRendererProps>(
  function CertificateRenderer({ template, data, previewWidth = 700, printMode = false, className = '' }, ref) {
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
        }}
        data-template-id={template.id}
      >
        {/* Háttér — a sablon-kép tartalmazza a kereteket, címert és az állandó címeket. */}
        <img
          src={template.backgroundImage}
          alt={template.name}
          className="absolute inset-0 h-full w-full select-none"
          draggable={false}
          style={{ objectFit: 'fill', userSelect: 'none' }}
        />

        {/* Szövegrétegek a háttérre — az `EmleklapField` koordinátái szerint. */}
        {template.fields.map((field) => (
          <FieldLayer
            key={field.id}
            field={field}
            text={fillTemplate(field.defaultValue, data)}
            containerHeight={previewHeight}
            printMode={printMode}
          />
        ))}
      </div>
    )
  },
)

interface FieldLayerProps {
  field: EmleklapField
  text: string
  containerHeight: number
  printMode: boolean
}

function FieldLayer({ field, text, containerHeight, printMode }: FieldLayerProps) {
  // A fontSize a magasság %-ában van; px-re konvertáljuk a layout-számításhoz
  const fontSizePx = (containerHeight * field.fontSize) / 100

  return (
    <div
      className={printMode ? 'pointer-events-none' : ''}
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
      }}
    >
      {text}
    </div>
  )
}
