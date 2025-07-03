import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChatSidebar } from '~/components/assistant-ui/chat-sidebar'
import { useChatStore } from '~/lib/store'
import { CrewAIChatUIRuntimeProvider } from './CrewAIChatUIRuntimeProvider'
import { Thread } from "~/components/assistant-ui/thread"
import { Button } from '~/components/ui/button'
import { ArrowLeft } from 'lucide-react'

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-lg">Loading chat...</div>
    </div>
  )
}


export function meta() {
  return [
    { title: "CrewAI - Chat Mode" },
    { name: "description", content: "Chat with CrewAI" },
  ];
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

  const handleBack = () => {
    navigate('/');
  };

  return (
    <CrewAIChatUIRuntimeProvider>
      <div className="flex h-screen flex-col">
        <header className="py-2 px-4 border-b flex items-center bg-background">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Chat Mode</h1>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <ChatSidebar />
          <main className="flex-1 overflow-hidden">
            <Thread />
          </main>
        </div>
      </div>
    </CrewAIChatUIRuntimeProvider>
  )
} 