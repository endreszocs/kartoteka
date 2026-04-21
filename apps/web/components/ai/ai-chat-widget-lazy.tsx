'use client'

import dynamic from 'next/dynamic'

const AiChatWidget = dynamic(
  () => import('@/components/ai/ai-chat-widget').then(module => module.AiChatWidget),
  { ssr: false },
)

export function AiChatWidgetLazy({ hasApiKey = true }: { hasApiKey?: boolean }) {
  return <AiChatWidget hasApiKey={hasApiKey} />
}
