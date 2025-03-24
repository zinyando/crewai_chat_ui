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

// Generate a random UUID for chat_id if not provided
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Fetch available crews from the server
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
    
    // Extract the last message which is from the user
    const lastMessage = messages[messages.length - 1] as ThreadMessage;
    const userContent = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : lastMessage.content[0]?.type === 'text' 
        ? lastMessage.content[0].text 
        : '';
    
    // Get chat_id from store or generate a new one
    const chatId = currentChatId || generateUUID();
    
    // Add the user message to our store
    addMessage(chatId, {
      role: lastMessage.role,
      content: userContent,
      timestamp: Date.now(),
    });
    
    // Prepare the request payload according to our FastAPI server's expected format
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

    // Our FastAPI server returns a JSON response, not a stream
    const data = await response.json();
    
    if (data.status === "success" && data.content) {
      // Add the assistant message to our store
      addMessage(chatId, {
        role: 'assistant',
        content: data.content,
        timestamp: Date.now(),
      });
      
      // Return the content as a text message
      yield {
        content: [{ type: "text", text: data.content }],
      };
    } else {
      // Handle error cases
      throw new Error(data.message || "Unknown error occurred");
    }
  },
};

// Initialize the chat when the component is mounted
async function initializeChat() {
  try {
    // First fetch available crews
    await fetchCrews();
    
    const { currentChatId, currentCrewId } = useChatStore.getState();
    
    // Call the initialize endpoint
    const response = await fetch(`/api/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: currentChatId,
        crew_id: currentCrewId,
      }),
    });
    
    const data = await response.json();
    
    if (data.status === "success") {
      console.log("Chat initialized successfully", data);
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
  // Create the runtime with our adapter
  const runtime = useLocalRuntime(CrewAIChatUIModelAdapter);
  
  // Initialize the chat when the component is mounted
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Only run in browser environment
      initializeChat();
    }
  }, []); // Empty dependency array means this only runs once on mount

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}