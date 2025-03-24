"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";

// Generate a random UUID for chat_id if not provided
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const CrewAIChatUIModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Extract the last message which is from the user
    const lastMessage = messages[messages.length - 1];
    
    // Generate a chat_id if we don't have one stored in localStorage
    let chatId = localStorage.getItem('crewai_chat_id');
    if (!chatId) {
      chatId = generateUUID();
      localStorage.setItem('crewai_chat_id', chatId);
    }
    
    // Prepare the request payload according to our FastAPI server's expected format
    const response = await fetch("http://localhost:8000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: lastMessage.content,
        chat_id: chatId,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    // Our FastAPI server returns a JSON response, not a stream
    const data = await response.json();
    
    if (data.status === "success" && data.content) {
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
    // Get or create a chat_id
    let chatId = localStorage.getItem('crewai_chat_id');
    if (!chatId) {
      chatId = generateUUID();
      localStorage.setItem('crewai_chat_id', chatId);
    }
    
    // Call the initialize endpoint
    const response = await fetch(`http://localhost:8000/api/initialize?chat_id=${chatId}`);
    const data = await response.json();
    
    if (data.status === "success") {
      console.log("Chat initialized successfully", data);
      // Store crew_id if provided
      if (data.crew_id) {
        localStorage.setItem('crewai_crew_id', data.crew_id);
      }
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
  if (typeof window !== 'undefined') {
    // Only run in browser environment
    initializeChat();
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}