import { type ReactNode, useState, useEffect } from 'react'
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
import { DeleteChatModal } from './delete-chat-modal'

interface ChatSidebarProps {
  children?: ReactNode
}

export const ChatSidebar = ({ children }: ChatSidebarProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const {
    crews,
    currentCrewId,
    currentChatId,
    chatHistory,
    isDarkMode,
    setCrews,
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

  // Set initial chat when component mounts
  useEffect(() => {
    // Fetch crews if not already loaded
    if (crews.length === 0) {
      fetch('/api/crews')
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success' && Array.isArray(data.crews)) {
            setCrews(data.crews);
          }
        })
        .catch(error => console.error('Error fetching crews:', error));
    }
    
    // Check if we have a chat ID in the URL
    const chatIdFromUrl = searchParams.get('chatId');
    const crewIdFromUrl = searchParams.get('crew');
    
    // Check if we have a stored chat ID in localStorage
    const storedChatId = localStorage.getItem('crewai_chat_id');
    const storedCrewId = localStorage.getItem('crewai_crew_id');
    
    if (!chatIdFromUrl) {
      // No chat ID in URL, check localStorage and chat history
      if (storedChatId && chatHistory[storedChatId]) {
        // We have a stored chat ID that exists in history
        setCurrentChat(storedChatId);
        if (storedCrewId) {
          setCurrentCrew(storedCrewId);
        }
        
        // Update URL params
        setSearchParams(params => {
          params.set('chatId', storedChatId);
          if (storedCrewId) {
            params.set('crew', storedCrewId);
          }
          return params;
        });
      } else if (Object.keys(chatHistory).length > 0) {
        // No stored chat ID or it doesn't exist, but we have chats in history
        // Use the most recent chat
        const sortedChats = Object.values(chatHistory).sort(
          (a, b) => b.lastUpdated - a.lastUpdated
        );
        const mostRecentChat = sortedChats[0];
        
        setCurrentChat(mostRecentChat.id);
        if (mostRecentChat.crewId) {
          setCurrentCrew(mostRecentChat.crewId);
        }
        
        // Update localStorage
        localStorage.setItem('crewai_chat_id', mostRecentChat.id);
        if (mostRecentChat.crewId) {
          localStorage.setItem('crewai_crew_id', mostRecentChat.crewId);
        }
        
        // Update URL params
        setSearchParams(params => {
          params.set('chatId', mostRecentChat.id);
          if (mostRecentChat.crewId) {
            params.set('crew', mostRecentChat.crewId);
          }
          return params;
        });
      } else {
        // No chats in history, create a new one
        const newChatId = generateChatId();
        createChat(newChatId, currentCrewId);
        setCurrentChat(newChatId);
        
        // Update localStorage
        localStorage.setItem('crewai_chat_id', newChatId);
        if (currentCrewId) {
          localStorage.setItem('crewai_crew_id', currentCrewId);
        }
        
        // Update URL params
        setSearchParams(params => {
          params.set('chatId', newChatId);
          if (currentCrewId) {
            params.set('crew', currentCrewId);
          }
          return params;
        });
      }
    } else if (chatHistory[chatIdFromUrl]) {
      // Chat ID from URL exists in history, use it
      setCurrentChat(chatIdFromUrl);
      
      // Update localStorage
      localStorage.setItem('crewai_chat_id', chatIdFromUrl);
      
      // Handle crew ID if present
      if (crewIdFromUrl) {
        setCurrentCrew(crewIdFromUrl);
        localStorage.setItem('crewai_crew_id', crewIdFromUrl);
      }
    }
  }, [chatHistory, currentCrewId, searchParams, setCurrentChat, setSearchParams, createChat, crews.length, setCrews, setCurrentCrew])

  // Create a new chat
  const handleNewChat = () => {
    const chatId = generateChatId()
    const chatTitle = "New Chat" // Set a default title or prompt for user input
    createChat(chatId, currentCrewId, chatTitle) // Pass the title to createChat
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
    
    // Update localStorage with selected chat
    localStorage.setItem('crewai_chat_id', chatId);
    if (chat.crewId) {
      localStorage.setItem('crewai_crew_id', chat.crewId);
    }
    
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
    setChatToDelete(chatId)
  }

  const confirmDelete = () => {
    if (chatToDelete) {
      deleteChat(chatToDelete)
      if (currentChatId === chatToDelete) {
        setCurrentChat(null)
        setSearchParams(params => {
          params.delete('chatId')
          return params
        })
      }
      setChatToDelete(null)
    }
  }

  // Sort chats by last updated
  const sortedChats = Object.values(chatHistory).sort(
    (a, b) => b.lastUpdated - a.lastUpdated
  )

  return (
    <>
      <aside className="flex h-full w-64 flex-col bg-background border-r">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Chats</h2>
        </div>

        <div className="p-4">
          <Select
            value={currentCrewId ?? ""}
            onValueChange={handleCrewChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a crew">
                {crews.find(c => c.id === currentCrewId)?.name || "Select a crew"}
              </SelectValue>
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
                onClick={(e: React.MouseEvent) => {
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
      <DeleteChatModal
        isOpen={chatToDelete !== null}
        onClose={() => setChatToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
} 