import { type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Moon, Plus, Sun, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useChatStore } from '~/lib/store'
import { cn } from '~/lib/utils'

interface ChatSidebarProps {
  children?: ReactNode
}

export const ChatSidebar = ({ children }: ChatSidebarProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    crews,
    currentCrewId,
    currentChatId,
    chatHistory,
    isDarkMode,
    setCurrentCrew,
    setCurrentChat,
    createChat,
    deleteChat,
    toggleDarkMode,
  } = useChatStore()

  // Generate a new chat ID
  const generateChatId = () => {
    return Math.random().toString(36).substring(2, 15)
  }

  // Create a new chat
  const handleNewChat = () => {
    const chatId = generateChatId()
    createChat(chatId, currentCrewId)
    setCurrentChat(chatId)
    setSearchParams(params => {
      params.set('chatId', chatId)
      if (currentCrewId) {
        params.set('crew', currentCrewId)
      }
      return params
    })
  }

  // Handle crew selection
  const handleCrewChange = (crewId: string) => {
    setCurrentCrew(crewId)
    setSearchParams(params => {
      params.set('crew', crewId)
      return params
    })
  }

  // Handle chat selection
  const handleChatSelect = (chatId: string) => {
    setCurrentChat(chatId)
    const chat = chatHistory[chatId]
    setSearchParams(params => {
      params.set('chatId', chatId)
      if (chat.crewId) {
        params.set('crew', chat.crewId)
      }
      return params
    })
  }

  // Handle chat deletion
  const handleDeleteChat = (chatId: string) => {
    if (window.confirm('Are you sure you want to delete this chat?')) {
      deleteChat(chatId)
      if (currentChatId === chatId) {
        setCurrentChat(null)
        setSearchParams(params => {
          params.delete('chatId')
          return params
        })
      }
    }
  }

  // Sort chats by last updated
  const sortedChats = Object.values(chatHistory).sort(
    (a, b) => b.lastUpdated - a.lastUpdated
  )

  return (
    <aside className="flex h-full w-64 flex-col bg-background border-r">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">CrewAI Chat UI</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkMode}
          className="h-8 w-8"
        >
          {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="p-4">
        <Select
          value={currentCrewId || ''}
          onValueChange={handleCrewChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a crew" />
          </SelectTrigger>
          <SelectContent>
            {crews.map((crew) => (
              <SelectItem key={crew.id} value={crew.id}>
                {crew.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleNewChat}
        className="mx-4 mb-4"
      >
        <Plus className="mr-2 h-4 w-4" />
        New Chat
      </Button>

      <div className="flex-1 overflow-y-auto p-2">
        {sortedChats.map((chat) => (
          <div
            key={chat.id}
            className={cn(
              'group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/50 cursor-pointer',
              currentChatId === chat.id && 'bg-accent'
            )}
            onClick={() => handleChatSelect(chat.id)}
          >
            <div className="flex-1 truncate">
              <p className="truncate text-sm">{chat.title}</p>
              {chat.crewName && (
                <p className="truncate text-xs text-muted-foreground">
                  {chat.crewName}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteChat(chat.id)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </aside>
  )
} 