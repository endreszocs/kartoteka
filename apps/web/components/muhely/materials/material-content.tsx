import type { ReactNode } from 'react'

const SECTION_MARKERS = [
  'Cél:',
  'Missziós kategória:',
  'Egyházi ünnepkör:',
  'Módszertan:',
  'Korosztály:',
  'Nehézségi szint:',
  'Időtartam:',
  'Szükséges kellékek',
  'Előkészületek:',
  'Bevezető',
  'Ráhangolódás',
  'Alapige',
  'Igemagyarázat',
  'Feldolgozás',
  'Közös megbeszélés',
  'Megbeszélés',
  'Kérdések',
  'Csoportmunka',
  'Alkalmazás',
  'Összefoglalás',
  'Befejezés',
  'Záró ima',
  'Záró ének',
  'Házi feladat',
] as const

const LABEL_MARKERS = SECTION_MARKERS.filter((marker) => marker.endsWith(':'))
const NUMBERED_SECTION = /^\d+\.\s+(játék|feladat|lépés|kérdés|rész)\b/iu
const BULLET_PREFIX = /^[•*–-]\s*/u
const EMOJI_PREFIX = /^\p{Extended_Pictographic}/u

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitMaterialText(text: string) {
  let prepared = text.replace(/\r\n?/g, '\n').trim()

  for (const marker of SECTION_MARKERS) {
    // A „Bevezető – Ráhangolódás” jellegű összetett címsorokat egyben
    // hagyjuk; csak akkor kezdünk új blokkot, ha a marker előtt nem kötőjel áll.
    const pattern = new RegExp(`(?<![–—-])\\s+(?=${escapeRegExp(marker)})`, 'giu')
    prepared = prepared.replace(pattern, '\n')
  }

  prepared = prepared
    .replace(/\s*•\s*/gu, '\n• ')
    .replace(/\s+(?=\d+\.\s+(?:játék|feladat|lépés|kérdés|rész)\b)/giu, '\n')

  return prepared
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function startsWithKnownMarker(line: string) {
  const withoutEmoji = line.replace(/^\p{Extended_Pictographic}\s*/u, '')
  return SECTION_MARKERS.some((marker) => withoutEmoji.startsWith(marker))
}

function splitKnownLabel(line: string): { label: string; value: string } | null {
  const withoutEmoji = line.replace(/^\p{Extended_Pictographic}\s*/u, '')
  const marker = LABEL_MARKERS.find((candidate) => withoutEmoji.startsWith(candidate))
  if (!marker) return null
  return { label: marker, value: withoutEmoji.slice(marker.length).trim() }
}

interface MaterialContentProps {
  content: string | null
}

export function MaterialContent({ content }: MaterialContentProps) {
  if (!content?.trim()) {
    return (
      <p className="rounded-2xl border border-dashed border-[#d8cbb8] bg-[#f8f2e9] px-5 py-8 text-center text-sm italic text-[#7a8077]">
        Ehhez a segédanyaghoz még nem került részletes tartalom.
      </p>
    )
  }

  const lines = splitMaterialText(content)
  const blocks: ReactNode[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const key = `${index}-${line.slice(0, 32)}`

    if (BULLET_PREFIX.test(line)) {
      const items: string[] = []
      while (index < lines.length && BULLET_PREFIX.test(lines[index])) {
        items.push(lines[index].replace(BULLET_PREFIX, '').trim())
        index += 1
      }
      index -= 1
      blocks.push(
        <ul key={key} className="my-5 space-y-2 pl-6 marker:text-[#8a9a74]">
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item.slice(0, 24)}`} className="pl-1">
              {item}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^MISSZIÓS? MŰHELY\b/iu.test(line)) {
      blocks.push(
        <p
          key={key}
          className="my-5 rounded-2xl border border-[#d9c59e] bg-[#f8ecd3] px-4 py-3 text-sm font-semibold tracking-[0.02em] text-[#6f5936]"
        >
          {line}
        </p>,
      )
      continue
    }

    const label = splitKnownLabel(line)
    if (label) {
      blocks.push(
        <p key={key} className="my-3">
          <strong className="font-semibold text-[#415846]">{label.label}</strong>{' '}
          {label.value}
        </p>,
      )
      continue
    }

    if (NUMBERED_SECTION.test(line) || startsWithKnownMarker(line) || EMOJI_PREFIX.test(line)) {
      blocks.push(
        <h3 key={key} className="mb-2 mt-7 font-heading text-[1.3rem] leading-snug text-[#314b3b] sm:text-[1.45rem]">
          {line}
        </h3>,
      )
      continue
    }

    blocks.push(
      <p key={key} className="my-3">
        {line}
      </p>,
    )
  }

  return (
    <div className="min-w-0 hyphens-manual [overflow-wrap:anywhere] [word-break:normal] font-serif text-[1rem] leading-[1.85] text-[#4d5a51] [font-kerning:normal] sm:text-[1.075rem] sm:leading-[1.9]">
      {blocks}
    </div>
  )
}
