import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ThreadPrimitive, ComposerPrimitive, MessagePrimitive } from '@assistant-ui/react'
import { ChatSidebar } from '~/components/assistant-ui/chat-sidebar'
import { useChatStore } from '~/lib/store'
import { CrewAIChatUIRuntimeProvider } from './CrewAIChatUIRuntimeProvider'
import { Thread } from "~/components/assistant-ui/thread";

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-lg">Loading chat...</div>
    </div>
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