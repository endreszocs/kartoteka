'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircleHeart, SendHorizonal, Sparkles, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AI_CONFIG } from '@/lib/constants/ai'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SESSION_KEY = 'kartoteka_ai_history'
const SESSION_OPEN = 'kartoteka_ai_open'
const QUICK_PROMPTS = [
  'Hogyan rögzítsek egy új családot?',
  'Mit hova könyveljek a pénzügyekben?',
  'Hol találom a hiányzó anyakönyvi adatokat?',
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mdToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul class="list-disc space-y-1 pl-4">$1</ul>')
    .replace(/\n/g, '<br/>')
}

export function AiChatWidget({ hasApiKey = true }: { hasApiKey?: boolean }) {
  const [isOpen, setIsOpen] = useState(() => {
    if (!hasApiKey || typeof window === 'undefined') return false
    try {
      return sessionStorage.getItem(SESSION_OPEN) === 'true'
    } catch {
      return false
    }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!hasApiKey || typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [rateLimitActive, setRateLimitActive] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hasApiKey) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages))
      sessionStorage.setItem(SESSION_OPEN, String(isOpen))
    } catch {
      // sessionStorage can be unavailable in private contexts
    }
  }, [messages, isOpen, hasApiKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current)
    }
  }, [])

  if (!hasApiKey) return null

  async function sendMessage(prefill?: string) {
    const messageText = (prefill ?? input).trim()
    if (!messageText || isLoading || rateLimitActive) return

    const userMsg: Message = { role: 'user', content: messageText }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setRateLimitActive(true)

    if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current)
    rateLimitTimerRef.current = setTimeout(() => {
      setRateLimitActive(false)
      rateLimitTimerRef.current = null
    }, AI_CONFIG.rateLimitMs)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages.slice(-AI_CONFIG.maxHistoryMessages),
        }),
      })

      const data = await response.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || 'Most nem tudtam válaszolni. Próbáljuk meg újra egy rövidebb kérdéssel.',
          },
        ])
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Hálózati hiba történt. Ellenőrizd a kapcsolatot, aztán próbáljuk meg újra.',
        },
      ])
    }

    setIsLoading(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
    if (event.key === 'Escape') setIsOpen(false)
  }

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 sm:bottom-6 sm:right-6">
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex h-16 items-center gap-3 rounded-full border border-white/60 px-4 text-white shadow-lg transition hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 60%, var(--accent2) 100%)' }}
            title="Aladár megnyitása"
            aria-label="Aladár megnyitása"
          >
            <span className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition group-hover:opacity-100" />
            <span className="relative flex size-11 items-center justify-center rounded-full bg-white/18 ring-1 ring-white/30">
              <MessageCircleHeart className="size-5" />
            </span>
            <span className="relative hidden text-left sm:block">
              <span className="block text-sm font-semibold">Aladár</span>
              <span className="block text-[11px] text-white/80">AI asszisztens a szolgálat mellé</span>
            </span>
            <span className="relative rounded-full bg-white/16 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
              AI
            </span>
          </button>
        </div>
      )}

      {isOpen && (
        <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border border-border bg-popover shadow-2xl backdrop-blur-2xl sm:bottom-6 sm:right-6 sm:h-[min(78vh,760px)] sm:max-h-[78vh] sm:w-[420px] sm:rounded-[2rem]">
          <div
            className="relative overflow-hidden border-b border-border px-5 py-4 text-white"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 60%, var(--accent2) 100%)' }}
          >
            <div className="absolute right-[-1rem] top-[-1.5rem] h-24 w-24 rounded-full bg-white/14 blur-2xl" />
            <div className="absolute bottom-[-1rem] left-[-1rem] h-20 w-20 rounded-full bg-amber-200/20 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-white/18 ring-1 ring-white/28">
                  <Bot className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/75">Kartotéka AI</p>
                  <h3 className="font-heading text-2xl leading-none">Aladár</h3>
                  <p className="mt-1 text-xs leading-5 text-white/82">
                    Kérdezhetsz a modulokról, a használatról, vagy arról is, hogyan érdemes tovább lépni egy-egy feladatban.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex size-10 items-center justify-center rounded-full border border-white/25 bg-white/14 text-white/90 transition hover:bg-white/20"
                aria-label="Bezárás"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.94),rgba(239,248,246,0.82))] px-4 py-4 sm:px-5">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-teal-100 bg-white/86 p-4 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
                  <div className="flex items-center gap-2 text-teal-700">
                    <Sparkles className="size-4" />
                    <p className="text-sm font-semibold">Miben tudok segíteni?</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Kérhetsz gyors útmutatót, hibakeresést, pénzügyi eligazítást vagy modul-szintű magyarázatot is.
                  </p>
                </div>

                <div className="grid gap-2">
                  {QUICK_PROMPTS.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-[1.25rem] border border-slate-200 bg-white/92 px-4 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-teal-200 hover:text-teal-700"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={message.role === 'user'
                      ? 'max-w-[88%] rounded-[1.4rem] rounded-br-md bg-teal-600 px-4 py-3 text-sm leading-6 text-white shadow-[0_14px_28px_-20px_rgba(13,148,136,0.72)]'
                      : 'max-w-[90%] rounded-[1.4rem] rounded-bl-md border border-white/75 bg-white/94 px-4 py-3 text-sm leading-6 text-slate-700 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.18)]'
                    }
                  >
                    {message.role === 'assistant'
                      ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(message.content) }} />
                      : message.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-[1.3rem] rounded-bl-md border border-white/75 bg-white/94 px-4 py-3 text-sm text-slate-500 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.18)]">
                    Aladár éppen válaszol...
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/70 bg-white/92 px-4 py-3 sm:px-5">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Írd be a kérdésedet..."
                className="min-h-[54px] flex-1 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 shadow-inner outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                disabled={isLoading}
              />
              <Button
                type="button"
                className="h-auto rounded-[1.2rem] bg-teal-600 px-4 hover:bg-teal-700"
                onClick={() => void sendMessage()}
                disabled={isLoading || !input.trim() || rateLimitActive}
              >
                <SendHorizonal className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              {rateLimitActive
                ? 'Egy rövid pillanat, Aladár még befejezi az előző választ.'
                : 'Enter = küldés · Shift+Enter = új sor · Escape = bezárás'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
