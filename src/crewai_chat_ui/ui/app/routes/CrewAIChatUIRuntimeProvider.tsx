"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { useChatStore } from "~/lib/store";
import { useEffect } from "react";

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

const CrewAIChatUIModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { currentChatId, currentCrewId, addMessage } = useChatStore.getState();
    
    const lastMessage = messages[messages.length - 1] as ThreadMessage;
    const userContent = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : lastMessage.content[0]?.type === 'text' 
        ? lastMessage.content[0].text 
        : '';
    
    const chatId = currentChatId || generateUUID();
    
    addMessage(chatId, {
      role: lastMessage.role,
      content: userContent,
      timestamp: Date.now(),
    });
    
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userContent,
        chat_id: chatId,
        crew_id: currentCrewId,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === "success" && data.content) {
      addMessage(chatId, {
        role: 'assistant',
        content: data.content,
        timestamp: Date.now(),
      });
      
      yield {
        content: [{ type: "text", text: data.content }],
      };
    } else {
      throw new Error(data.message || "Unknown error occurred");
    }
  },
};

async function initializeChat() {
  try {
    await fetchCrews();
    
    const { currentChatId, currentCrewId, addMessage, createChat } = useChatStore.getState();
    
    const chatId = currentChatId || generateUUID();
    
    createChat(chatId, currentCrewId);
    
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
      console.log("Chat initialized successfully", data);
      
      if (data.message) {
        addMessage(chatId, {
          role: 'assistant',
          content: data.message,
          timestamp: Date.now(),
        });
      }

      const { chatHistory } = useChatStore.getState();
      console.log("Current chat history:", chatHistory);
    } else {
      console.error("Failed to initialize chat", data);
    }
  } catch (error) {
    console.error("Error initializing chat", error);
  }
}

export function CrewAIChatUIRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const runtime = useLocalRuntime(CrewAIChatUIModelAdapter);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeChat();
    }
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}