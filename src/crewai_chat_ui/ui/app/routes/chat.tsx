import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ThreadPrimitive, ComposerPrimitive, MessagePrimitive } from '@assistant-ui/react'
import { ChatSidebar } from '~/components/assistant-ui/chat-sidebar'
import { useChatStore } from '~/lib/store'
import { CrewAIChatUIRuntimeProvider } from './CrewAIChatUIRuntimeProvider'
import { MarkdownText } from '~/components/assistant-ui/markdown-text'

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-lg">Loading chat...</div>
    </div>
  )
}

const UserMessage = () => (
  <MessagePrimitive.Root>
    <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-5 py-2.5">
      <MessagePrimitive.Content />
    </div>
  </MessagePrimitive.Root>
)

const AssistantMessage = () => (
  <MessagePrimitive.Root>
    <div className="text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7">
      <MessagePrimitive.Content components={{ Text: MarkdownText }} />
    </div>
  </MessagePrimitive.Root>
)

function Thread() {
  return (
    <ThreadPrimitive.Root
      className="bg-background box-border flex h-full flex-col overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "42rem",
      }}
    >
      <ThreadPrimitive.Viewport className="flex h-full flex-col items-center overflow-y-scroll scroll-smooth bg-inherit px-4 pt-8">
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
        <div className="min-h-8 flex-grow" />
        <div className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
          <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in">
            <ComposerPrimitive.Input
              rows={1}
              autoFocus
              placeholder="Write a message..."
              className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
            />
            <ComposerPrimitive.Send className="my-2.5 size-8 p-2 transition-opacity ease-in">
              <span className="sr-only">Send message</span>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

export function HydrateFallback() {
  return <LoadingFallback />
}

export default function ChatLayout() {
  const navigate = useNavigate()
  const { chatId } = useParams()
  const [searchParams] = useSearchParams()
  const crewId = searchParams.get('crew')
  
  const {
    currentChatId,
    currentCrewId,
    setCurrentChat,
    setCurrentCrew,
    chatHistory,
  } = useChatStore()

  // Sync URL params with store state
  useEffect(() => {
    if (chatId && chatId !== currentChatId) {
      if (chatHistory[chatId]) {
        setCurrentChat(chatId)
        // Store chat ID in localStorage for the runtime
        localStorage.setItem('crewai_chat_id', chatId)
      } else {
        // Chat doesn't exist, redirect to home
        navigate('/')
      }
    }
  }, [chatId, currentChatId, chatHistory, navigate, setCurrentChat])

  useEffect(() => {
    if (crewId !== currentCrewId) {
      setCurrentCrew(crewId)
      // Store crew ID in localStorage for the runtime
      if (crewId) {
        localStorage.setItem('crewai_crew_id', crewId)
      } else {
        localStorage.removeItem('crewai_crew_id')
      }
    }
  }, [crewId, currentCrewId, setCurrentCrew])

  // if (!currentChatId) {
  //   return <LoadingFallback />
  // }

  return (
    <CrewAIChatUIRuntimeProvider>
      <div className="flex h-screen">
        <ChatSidebar />
        <main className="flex-1 overflow-hidden">
          <Thread />
        </main>
      </div>
    </CrewAIChatUIRuntimeProvider>
  )
} 