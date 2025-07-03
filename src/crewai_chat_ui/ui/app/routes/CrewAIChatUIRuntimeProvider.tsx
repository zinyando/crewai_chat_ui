"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
  type TextContentPart,
} from "@assistant-ui/react";
import { useChatStore } from "~/lib/store";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function fetchCrews() {
  try {
    const response = await fetch('/api/crews');
    const data = await response.json();
    
    if (data.status === "success" && Array.isArray(data.crews)) {
      // Update the store with available crews
      useChatStore.getState().setCrews(data.crews);
    } else {
      console.error("Failed to fetch crews", data);
    }
  } catch (error) {
    console.error("Error fetching crews", error);
  }
}

const convertMessage = (message: ThreadMessageLike) => {
  const textContent = message.content[0] as TextContentPart;
  if (!textContent || textContent.type !== "text") {
    throw new Error("Only text messages are supported");
  }
  
  return {
    role: message.role,
    content: textContent.text,
    timestamp: Date.now(),
  };
};

export function CrewAIChatUIRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const currentChatId = useChatStore((state) => state.currentChatId);
  const currentCrewId = useChatStore((state) => state.currentCrewId);
  const chatHistory = useChatStore((state) => state.chatHistory);
  const messages = useChatStore((state) => 
    currentChatId ? state.chatHistory[currentChatId]?.messages || [] : []
  );
  
  const onNew = async (message: AppendMessage) => {
    if (!currentChatId || !currentCrewId) return;
    const textContent = message.content[0] as TextContentPart;
    if (!textContent || textContent.type !== "text") {
      throw new Error("Only text messages are supported");
    }

    const userContent = textContent.text;
    const { addMessage, updateChatTitle, chatHistory } = useChatStore.getState();
    
    addMessage(currentChatId, {
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    });

    const chat = chatHistory[currentChatId]

    if (!chat.title || chat.title === "New Chat") {
      const updatedTitle = userContent.split(" ")[0];
      updateChatTitle(currentChatId, updatedTitle);
    }

    setIsRunning(true);
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userContent,
          chat_id: currentChatId,
          crew_id: currentCrewId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === "success" && data.content) {
        addMessage(currentChatId, {
          role: 'assistant',
          content: data.content,
          timestamp: Date.now(),
        });
      } else {
        throw new Error(data.message || "Unknown error occurred");
      }
    } catch (error) {
      console.error("Error in chat:", error);
    } finally {
      setIsRunning(false);
    }
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: messages.map(msg => ({
      role: msg.role,
      content: [{ type: "text" as const, text: msg.content }],
    })),
    convertMessage,
    onNew,
  });
  
  async function initializeChat() {
    setIsRunning(true);

    try {
      await fetchCrews();
      
      const { addMessage, createChat, setCurrentChat } = useChatStore.getState();
      
      // Check if we have a stored chat ID in localStorage
      const storedChatId = localStorage.getItem('crewai_chat_id');
      const storedCrewId = localStorage.getItem('crewai_crew_id');
      
      // Determine which chat ID to use
      let chatId;
      
      // If we have a stored chat ID and it exists in our chat history
      if (storedChatId && chatHistory[storedChatId]) {
        chatId = storedChatId;
        setCurrentChat(chatId);
        
        // Update URL if needed
        if (window.location.pathname.includes('/chat/')) {
          navigate(`/chat/${chatId}?crew=${storedCrewId || ''}`);
        }
      } else {
        // Otherwise use current chat ID or generate a new one
        chatId = currentChatId || generateUUID();
        createChat(chatId, currentCrewId);
        setCurrentChat(chatId);
        
        // Store the new chat ID
        localStorage.setItem('crewai_chat_id', chatId);
        if (currentCrewId) {
          localStorage.setItem('crewai_crew_id', currentCrewId);
        }
        
        // Only initialize with API if it's a new chat
        const response = await fetch(`/api/initialize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            crew_id: currentCrewId,
          }),
        });
        
        const data = await response.json();
        
        if (data.status === "success") {
          if (data.message) {
            addMessage(chatId, {
              role: 'assistant',
              content: data.message,
              timestamp: Date.now(),
            });
          }
        } else {
          console.error("Failed to initialize chat", data);
        }
      }
    } catch (error) {
      console.error("Error initializing chat", error);
    } finally {
      setIsRunning(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeChat();
    }
  }, []);
  
  // Effect to update localStorage when current chat or crew changes
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('crewai_chat_id', currentChatId);
    }
    
    if (currentCrewId) {
      localStorage.setItem('crewai_crew_id', currentCrewId);
    }
  }, [currentChatId, currentCrewId]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}