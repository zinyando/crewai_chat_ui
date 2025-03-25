import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

export interface ChatThread {
  id: string
  title: string
  crewId: string | null
  crewName?: string
  messages: ChatMessage[]
  lastUpdated: number
}

export interface Crew {
  id: string
  name: string
  description: string
}

interface ChatState {
  crews: Crew[]
  currentCrewId: string | null
  currentChatId: string | null
  chatHistory: Record<string, ChatThread>
  isDarkMode: boolean
  setCrews: (crews: Crew[]) => void
  setCurrentCrew: (crewId: string | null) => void
  setCurrentChat: (chatId: string | null) => void
  addMessage: (chatId: string, message: ChatMessage) => void
  createChat: (chatId: string, crewId: string | null, title?: string) => void
  deleteChat: (chatId: string) => void
  toggleDarkMode: () => void
  updateChatTitle: (chatId: string, title: string) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      crews: [],
      currentCrewId: null,
      currentChatId: null,
      chatHistory: {},
      isDarkMode: false,

      setCrews: (crews) => set((state) => ({ 
        crews,
        currentCrewId: crews.some(c => c.id === state.currentCrewId) 
          ? state.currentCrewId 
          : crews.length > 0 ? crews[0].id : null
      })),
      
      setCurrentCrew: (crewId) => set((state) => {
        if (crewId === null || state.crews.some(c => c.id === crewId)) {
          return { currentCrewId: crewId }
        }
        return state
      }),
      
      setCurrentChat: (chatId) => set({ currentChatId: chatId }),
      
      addMessage: (chatId, message) =>
        set((state) => {
          const chat = state.chatHistory[chatId]
          if (!chat) return state

          return {
            chatHistory: {
              ...state.chatHistory,
              [chatId]: {
                ...chat,
                messages: [...chat.messages, message],
                lastUpdated: Date.now(),
              },
            },
          }
        }),

      createChat: (chatId, crewId, title = 'New Chat') =>
        set((state) => {
          const crew = state.crews.find((c) => c.id === crewId)
          return {
            chatHistory: {
              ...state.chatHistory,
              [chatId]: {
                id: chatId,
                title,
                crewId,
                crewName: crew?.name,
                messages: [],
                lastUpdated: Date.now(),
              },
            },
          }
        }),

      deleteChat: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.chatHistory
          return { chatHistory: rest }
        }),

      toggleDarkMode: () =>
        set((state) => ({ isDarkMode: !state.isDarkMode })),

      updateChatTitle: (chatId, title) =>
        set((state) => {
          const chat = state.chatHistory[chatId]
          if (!chat) return state

          return {
            chatHistory: {
              ...state.chatHistory,
              [chatId]: {
                ...chat,
                title,
              },
            },
          }
        }),
    }),
    {
      name: 'chat-storage',
    }
  )
) 