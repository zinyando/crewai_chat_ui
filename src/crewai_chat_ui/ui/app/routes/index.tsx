import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useChatStore } from '~/lib/store'

export default function Index() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { createChat, setCurrentChat, currentCrewId, chatHistory } = useChatStore()

  useEffect(() => {
    try {
      // Get crew ID from URL if present
      const crewId = searchParams.get('crew') || currentCrewId

      // Generate a new chat ID using a more secure method
      const chatId = Math.random().toString(36).substring(2, 15)

      // Create a new chat with the crew ID
      createChat(chatId, crewId)
      setCurrentChat(chatId)

      // Store chat ID in localStorage for the runtime
      localStorage.setItem('crewai_chat_id', chatId)

      // Store crew ID in localStorage if present
      if (crewId) {
        localStorage.setItem('crewai_crew_id', crewId)
      }

      // Redirect to the chat route with appropriate parameters
      navigate(`/chat/${chatId}${crewId ? `?crew=${crewId}` : ''}`)
    } catch (error) {
      console.error('Error creating new chat:', error)
      // Redirect to home on error
      navigate('/')
    }
  }, [navigate, createChat, setCurrentChat, currentCrewId, searchParams])

  return null
} 