'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  saveMagazine,
  saveMagazineIssue,
  deleteMagazineIssue,
} from '@/app/(dashboard)/publikus-oldal/magazin/actions'
import { Plus, Save, Trash2, FileText, Eye, EyeOff } from 'lucide-react'

interface Magazine {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
}

interface Issue {
  id: string
  issue_number: string
  title: string | null
  cover_image_url: string | null
  pdf_url: string
  published_at: string | null
  notes: string | null
  is_published: boolean
}

interface Props {
  magazine: Magazine | null
  issues: Issue[]
}

type NewIssueForm = {
  issue_number: string
  title: string
  cover_image_url: string
  pdf_url: string
  published_at: string
  notes: string
  is_published: boolean
}

const EMPTY_ISSUE: NewIssueForm = {
  issue_number: '',
  title: '',
  cover_image_url: '',
  pdf_url: '',
  published_at: '',
  notes: '',
  is_published: false,
}

export function MagazineManager({ magazine, issues }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Magazin alapadatok form
  const [magForm, setMagForm] = useState({
    title: magazine?.title || '',
    description: magazine?.description || '',
    cover_image_url: magazine?.cover_image_url || '',
  })

  // Új lapszám form (ha van magazin)
  const [showNewIssueForm, setShowNewIssueForm] = useState(false)
  const [newIssue, setNewIssue] = useState<NewIssueForm>(EMPTY_ISSUE)

  function handleSaveMagazine() {
    if (!magForm.title.trim()) {
      toast.error('A magazin címe kötelező.')
      return
    }
    startTransition(async () => {
      const result = await saveMagazine({
        id: magazine?.id,
        title: magForm.title,
        description: magForm.description || null,
        cover_image_url: magForm.cover_image_url || null,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Magazin alapadatok elmentve')
        router.refresh()
      }
    })
  }

  function handleCreateIssue() {
    if (!magazine) {
      toast.error('Előbb hozz létre egy magazint.')
      return
    }
    if (!newIssue.issue_number.trim() || !newIssue.pdf_url.trim()) {
      toast.error('A lapszám és a PDF URL kötelező.')
      return
    }
    startTransition(async () => {
      const result = await saveMagazineIssue({
        magazine_id: magazine.id,
        issue_number: newIssue.issue_number,
        title: newIssue.title || null,
        cover_image_url: newIssue.cover_image_url || null,
        pdf_url: newIssue.pdf_url,
        published_at: newIssue.published_at || null,
        notes: newIssue.notes || null,
        is_published: newIssue.is_published,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Lapszám hozzáadva')
        setNewIssue(EMPTY_ISSUE)
        setShowNewIssueForm(false)
        router.refresh()
      }
    })
  }

  function handleTogglePublish(issue: Issue) {
    if (!magazine) return
    startTransition(async () => {
      const result = await saveMagazineIssue({
        id: issue.id,
        magazine_id: magazine.id,
        issue_number: issue.issue_number,
        title: issue.title || null,
        cover_image_url: issue.cover_image_url || null,
        pdf_url: issue.pdf_url,
        published_at: issue.published_at || null,
        notes: issue.notes || null,
        is_published: !issue.is_published,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(issue.is_published ? 'Visszavonva' : 'Publikálva')
        router.refresh()
      }
    })
  }

  function handleDeleteIssue(issue: Issue) {
    if (!confirm(`Biztosan törlöd a ${issue.issue_number} lapszámot?`)) return
    startTransition(async () => {
      const result = await deleteMagazineIssue(issue.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Törölve')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Magazin alapadatok */}
      <section className="card-raised p-6">
        <h2 className="font-heading text-xl text-slate-800 mb-4">Magazin alapadatok</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Magazin címe *
            </label>
            <input
              type="text"
              value={magForm.title}
              onChange={(e) => setMagForm({ ...magForm, title: e.target.value })}
              placeholder="pl. Református Hírnök"
              className="modal-input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Leírás
            </label>
            <textarea
              value={magForm.description}
              onChange={(e) => setMagForm({ ...magForm, description: e.target.value })}
              rows={2}
              className="modal-input"
              placeholder="Rövid leírás a magazinról"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Borítókép URL (opcionális)
            </label>
            <input
              type="url"
              value={magForm.cover_image_url}
              onChange={(e) => setMagForm({ ...magForm, cover_image_url: e.target.value })}
              className="modal-input"
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={handleSaveMagazine}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            {magazine ? 'Alapadatok mentése' : 'Magazin létrehozása'}
          </button>
        </div>
      </section>

      {/* Lapszámok listája */}
      {magazine && (
        <section className="card-raised p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl text-slate-800">Lapszámok ({issues.length})</h2>
            <button
              type="button"
              onClick={() => setShowNewIssueForm(!showNewIssueForm)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Új lapszám
            </button>
          </div>

          {/* Új lapszám form */}
          {showNewIssueForm && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-50/40 border border-emerald-100/70 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Lapszám (pl. 2026/1) *
                  </label>
                  <input
                    type="text"
                    value={newIssue.issue_number}
                    onChange={(e) => setNewIssue({ ...newIssue, issue_number: e.target.value })}
                    className="modal-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Cím (opcionális)
                  </label>
                  <input
                    type="text"
                    value={newIssue.title}
                    onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
                    placeholder="pl. Húsvéti különszám"
                    className="modal-input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    PDF URL *
                  </label>
                  <input
                    type="url"
                    value={newIssue.pdf_url}
                    onChange={(e) => setNewIssue({ ...newIssue, pdf_url: e.target.value })}
                    placeholder="https://..."
                    className="modal-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Borítókép URL
                  </label>
                  <input
                    type="url"
                    value={newIssue.cover_image_url}
                    onChange={(e) => setNewIssue({ ...newIssue, cover_image_url: e.target.value })}
                    className="modal-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Megjelenés dátuma
                  </label>
                  <input
                    type="date"
                    value={newIssue.published_at}
                    onChange={(e) => setNewIssue({ ...newIssue, published_at: e.target.value })}
                    className="modal-input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Megjegyzések
                  </label>
                  <textarea
                    value={newIssue.notes}
                    onChange={(e) => setNewIssue({ ...newIssue, notes: e.target.value })}
                    rows={2}
                    className="modal-input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newIssue.is_published}
                      onChange={(e) => setNewIssue({ ...newIssue, is_published: e.target.checked })}
                    />
                    Azonnal publikálható
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewIssueForm(false)
                    setNewIssue(EMPTY_ISSUE)
                  }}
                  className="px-4 py-2 rounded-full text-sm text-slate-600 hover:bg-slate-100"
                >
                  Mégse
                </button>
                <button
                  type="button"
                  onClick={handleCreateIssue}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  Mentés
                </button>
              </div>
            </div>
          )}

          {issues.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="italic">Még nincs lapszám.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {issue.cover_image_url ? (
                      <img
                        src={issue.cover_image_url}
                        alt={issue.issue_number}
                        className="w-12 h-16 object-cover rounded-lg shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{issue.issue_number}</span>
                        {issue.is_published ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                            Publikált
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                            Piszkozat
                          </span>
                        )}
                      </div>
                      {issue.title && (
                        <div className="text-sm text-slate-600 truncate">{issue.title}</div>
                      )}
                      {issue.published_at && (
                        <div className="text-xs text-slate-400">
                          Megjelent: {new Date(issue.published_at).toLocaleDateString('hu-HU')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(issue)}
                      disabled={isPending}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-60"
                      title={issue.is_published ? 'Visszavonás' : 'Publikálás'}
                    >
                      {issue.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <a
                      href={issue.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      title="PDF megtekintése"
                    >
                      <FileText className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteIssue(issue)}
                      disabled={isPending}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 disabled:opacity-60"
                      title="Törlés"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
