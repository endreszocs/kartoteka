'use client'

/**
 * Véglegesített dokumentumok listája — gyülekezet szerint csoportosítva.
 * Használja az egyházmegyei és az egyházkerületi dashboard is.
 */

import { FileCheck } from 'lucide-react'
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentSubmission,
  type DocumentType,
} from '@/lib/constants/documents'

interface FinalizedDocumentsListProps {
  docs: DocumentSubmission[]
  year: number
  emptyHint?: string
}

export function FinalizedDocumentsList({ docs, year, emptyHint }: FinalizedDocumentsListProps) {
  const finalized = docs.filter((d) => d.status === 'finalized')

  if (finalized.length === 0) {
    return (
      <div className="card-raised p-8 text-center">
        <FileCheck className="mx-auto size-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">
          Még nincs véglegesített dokumentum a(z) {year}. évre.
        </p>
        {emptyHint && <p className="text-xs text-slate-400 mt-1">{emptyHint}</p>}
      </div>
    )
  }

  // Gyülekezetek szerint csoportosítva
  const byCong = new Map<string, { name: string; docs: DocumentSubmission[] }>()
  for (const doc of finalized) {
    const key = doc.congregation_id
    if (!byCong.has(key)) byCong.set(key, { name: doc.congregation_name || 'Ismeretlen', docs: [] })
    byCong.get(key)!.docs.push(doc)
  }
  const sortedGroups = [...byCong.entries()].sort((a, b) =>
    (a[1].name || '').localeCompare(b[1].name || ''),
  )

  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <FileCheck className="size-4 text-emerald-700" />
          <h3 className="font-heading text-lg text-slate-800">Véglegesített dokumentumok — {year}. év</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          A gyülekezetek által leadott, véglegesített hivatalos iratok.
        </p>
      </div>
      <div className="divide-y divide-slate-200/60">
        {sortedGroups.map(([congId, group]) => (
          <div key={congId} className="px-5 py-3">
            <p className="text-sm font-semibold text-slate-800 mb-2">{group.name}</p>
            <div className="flex flex-wrap gap-2">
              {group.docs.map((doc) => (
                <span
                  key={doc.id}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  ✓ {DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] || doc.document_type}
                  {doc.finalized_at && (
                    <span className="text-emerald-500 ml-1">
                      {new Date(doc.finalized_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
