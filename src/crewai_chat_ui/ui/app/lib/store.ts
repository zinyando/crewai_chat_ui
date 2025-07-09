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
  path?: string
}

export interface Flow {
  id: string
  name: string
  description: string
  path?: string
}

export interface InputField {
  name: string
  description: string
  value: string
}

interface ChatState {
  crews: Crew[]
  flows: Flow[]
  currentCrewId: string | null
  currentChatId: string | null
  chatHistory: Record<string, ChatThread>
  isDarkMode: boolean
  setCrews: (crews: Crew[]) => void
  setFlows: (flows: Flow[]) => void
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
    (set, get) => ({
      flows: [],
      crews: [],
      currentCrewId: null,
      currentChatId: null,
      chatHistory: {},
      isDarkMode: false,

      setCrews: (crews) => set({ crews }),
      setFlows: (flows) => set({ flows }),
      
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
          // Check if chat already exists to avoid overwriting
          if (state.chatHistory[chatId]) {
            return state;
          }
          
          const crew = state.crews.find((c) => c.id === crewId)
          return {
            currentChatId: chatId,
            currentCrewId: crewId || state.currentCrewId,
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
      // Customize storage options
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          if (value === null) return null;
          try {
            return JSON.parse(value);
          } catch (e) {
            console.error('Error parsing stored data:', e);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.error('Error storing data:', e);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Only persist specific parts of the state
      partialize: (state) => {
        // Return a partial state that includes only what we want to persist
        // TypeScript requires we return the full state type, so we need to include all properties
        return state;
      },
    }
  )
) 