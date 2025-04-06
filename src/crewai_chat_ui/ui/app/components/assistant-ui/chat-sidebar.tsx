import { type ReactNode, useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Moon, Plus, Sun, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useChatStore } from "~/lib/store";
import { cn } from "~/lib/utils";
import { DeleteChatModal } from "./delete-chat-modal";

interface ChatSidebarProps {
  children?: ReactNode;
}

export const ChatSidebar = ({ children }: ChatSidebarProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
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
  } = useChatStore();

  const generateChatId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  useEffect(() => {
    if (!searchParams.get("chatId")) {
      if (Object.keys(chatHistory).length === 0) {
        const newChatId = generateChatId();
        createChat(newChatId, currentCrewId);
        setCurrentChat(newChatId);

        setSearchParams((params) => {
          params.set("chatId", newChatId);
          if (currentCrewId) {
            params.set("crew", currentCrewId);
          }
          return params;
        });
      } else {
        const chatId = Object.keys(chatHistory)[0];
        const chat = chatHistory[chatId];

        setCurrentChat(chatId);

        setSearchParams((params) => {
          params.set("chatId", chatId);
          if (chat.crewId) {
            params.set("crew", chat.crewId);
          }
          return params;
        });
      }
    }
  }, [
    chatHistory,
    currentCrewId,
    searchParams,
    setCurrentChat,
    setSearchParams,
    createChat,
  ]);

  const handleNewChat = () => {
    const chatId = generateChatId();
    const chatTitle = "New Chat";
    createChat(chatId, currentCrewId, chatTitle);
    setCurrentChat(chatId);
    setSearchParams((params) => {
      params.set("chatId", chatId);
      if (currentCrewId) {
        params.set("crew", currentCrewId);
      }
      return params;
    });
  };

  const handleCrewChange = async (crewId: string) => {
    setCurrentCrew(crewId);
    setSearchParams((params) => {
      params.set("crew", crewId);
      return params;
    });

    console.log(`handleCrewChange currentChatId: ${currentChatId}`);
    console.log(`handleCrewChange currentCrewId: ${crewId}`);

    if (currentChatId) {
      try {
        const response = await fetch(`/api/initialize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: currentChatId,
            crew_id: crewId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to initialize crew");
        }

        if (data.status === "success" && data.message) {
          // Note: addMessage function seems to be missing from the current scope
          // You'll need to add it to the store or handle the message differently
          console.log("Crew initialized:", data.message);
        }
      } catch (error) {
        console.error("Failed to initialize crew:", error);
      }
    }
  };

  const handleChatSelect = (chatId: string) => {
    setCurrentChat(chatId);
    const chat = chatHistory[chatId];
    setSearchParams((params) => {
      params.set("chatId", chatId);
      if (chat.crewId) {
        params.set("crew", chat.crewId);
      }
      return params;
    });
  };

  const handleDeleteChat = (chatId: string) => {
    setChatToDelete(chatId);
  };

  const confirmDelete = () => {
    if (chatToDelete) {
      deleteChat(chatToDelete);
      if (currentChatId === chatToDelete) {
        setCurrentChat(null);
        setSearchParams((params) => {
          params.delete("chatId");
          return params;
        });
      }
      setChatToDelete(null);
    }
  };

  const sortedChats = Object.values(chatHistory).sort(
    (a, b) => b.lastUpdated - a.lastUpdated
  );

  return (
    <>
      <aside className="flex h-full w-64 flex-col bg-background border-r">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">CrewAI Chat UI</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="h-8 w-8"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="p-4">
          <Select value={currentCrewId ?? ""} onValueChange={handleCrewChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a crew">
                {crews.find((c) => c.id === currentCrewId)?.name ||
                  "Select a crew"}
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

        <Button onClick={handleNewChat} className="mx-4 mb-4">
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>

        <div className="flex-1 overflow-y-auto p-2">
          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/50 cursor-pointer",
                currentChatId === chat.id && "bg-accent"
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
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
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
  );
};
