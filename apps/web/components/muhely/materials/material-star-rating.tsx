'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'

interface MaterialStarRatingProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export function MaterialStarRating({ value, onChange, disabled = false }: MaterialStarRatingProps) {
  const [previewValue, setPreviewValue] = useState<number | null>(null)
  const displayedValue = previewValue ?? value

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="grid w-full max-w-[15rem] grid-cols-5 gap-1"
        role="group"
        aria-label="Segédanyag értékelése"
        onPointerLeave={() => setPreviewValue(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} csillag kijelölése`}
            aria-pressed={value === star}
            onPointerEnter={() => setPreviewValue(star)}
            onPointerDown={() => setPreviewValue(star)}
            onFocus={() => setPreviewValue(star)}
            onBlur={() => setPreviewValue(null)}
            onClick={() => onChange(star)}
            className="grid h-11 min-h-11 w-11 min-w-11 place-items-center rounded-full transition hover:scale-110 hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] disabled:cursor-wait disabled:opacity-55 motion-reduce:transition-none"
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                star <= displayedValue
                  ? 'fill-[#d3a45e] text-[#d3a45e]'
                  : 'text-[#cfc3b2]'
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <output
        className="inline-flex min-h-11 items-center gap-1 self-start rounded-full border border-[#dbc69f] bg-white/65 px-4 text-sm text-[#765f38] sm:self-auto"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong className="font-heading text-xl text-[#8b672f]">{displayedValue || '–'}</strong>
        <span>/ 5</span>
        <span className="ml-1 text-xs">
          {previewValue ? 'kijelölve' : value ? 'az értékelésed' : 'válassz csillagot'}
        </span>
      </output>
    </div>
  )
}
