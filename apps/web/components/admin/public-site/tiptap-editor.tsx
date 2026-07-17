'use client'

/**
 * TipTap WYSIWYG editor — Word-szerű szerkesztő bejegyzésekhez és leírásokhoz.
 * Toolbar: Bold, Italic, Heading 1-3, Bullet list, Ordered list, Link, Horizontal rule.
 * A formázás azonnal látható a szerkesztő mezőben.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Minus,
  ImageIcon,
  Undo,
  Redo,
} from 'lucide-react'

interface TiptapEditorProps {
  content: string
  onChange: (html: string) => void
  ariaLabel: string
  placeholder?: string
  /** Kompakt mód (kisebb magasság, pl. about szekció) */
  compact?: boolean
}

export function TiptapEditor({
  content,
  onChange,
  ariaLabel,
  placeholder,
  compact,
}: TiptapEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Kezdj el írni...',
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${compact ? 'min-h-[120px]' : 'min-h-[300px]'} px-4 py-3`,
        role: 'textbox',
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
      },
    },
  })

  if (!editor) return null

  function handleLink() {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href || ''
    const url = window.prompt('Link URL:', previousUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  function handleImage() {
    if (!editor) return
    const url = window.prompt('Kép URL:')
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2">
      {/* Toolbar */}
      <div
        role="group"
        aria-label={`${ariaLabel} formázási eszközei`}
        className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5"
      >
        <ToolbarButton
          pressed={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Félkövér"
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Dőlt"
        >
          <Italic className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <ToolbarButton
          pressed={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Címsor 1"
        >
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Címsor 2"
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Címsor 3"
        >
          <Heading3 className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <ToolbarButton
          pressed={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Felsorolás"
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Számozott lista"
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <ToolbarButton
          pressed={editor.isActive('link')}
          onClick={handleLink}
          title="Link"
        >
          <Link2 className="size-4" />
        </ToolbarButton>
        {!compact && (
          <ToolbarButton onClick={handleImage} title="Kép beszúrása">
            <ImageIcon className="size-4" />
          </ToolbarButton>
        )}
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Vonal"
        >
          <Minus className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Visszavonás">
          <Undo className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Újra">
          <Redo className="size-4" />
        </ToolbarButton>
      </div>

      {/* Editor tartalom */}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  children,
  pressed,
  onClick,
  title,
}: {
  children: React.ReactNode
  pressed?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
        pressed
          ? 'bg-slate-200 text-slate-900'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}
