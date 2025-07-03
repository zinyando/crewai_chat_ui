import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { useChatStore } from "~/lib/store";
import { MessageSquare, Zap, Moon, Sun } from "lucide-react";

export function meta() {
  return [
    { title: "CrewAI - Choose Your Interaction Mode" },
    { name: "description", content: "Choose how to interact with CrewAI" },
  ];
}

export default function Landing() {
  const navigate = useNavigate();
  const { crews, setCrews, isDarkMode, toggleDarkMode } = useChatStore();
  const [loading, setLoading] = useState(true);

  // Fetch available crews on component mount
  useEffect(() => {
    const fetchCrews = async () => {
      try {
        const response = await fetch("/api/crews");
        const data = await response.json();

        if (data.status === "success" && Array.isArray(data.crews)) {
          setCrews(data.crews);
        }
      } catch (error) {
        console.error("Error fetching crews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCrews();
  }, [setCrews]);

  const handleChatMode = () => {
    navigate("/chat");
  };

  const handleKickoffMode = () => {
    navigate("/kickoff");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="py-4 px-6 border-b bg-background">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CrewAI</h1>
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
      </header>

      {/* Main content */}
      <main className="flex-grow container mx-auto px-4 py-12 flex flex-col items-center justify-center">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Choose Your Interaction Mode
          </h2>
          <p className="text-xl max-w-2xl mx-auto">
            Select how you want to interact with the AI crew
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          {/* Chat Mode Card */}
          <div className="rounded-xl p-8 shadow-lg transition-all hover:shadow-xl bg-card">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 mx-auto">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-center">Chat Mode</h3>
            <p className="mb-6 text-center">
              Have a natural conversation with the AI crew. Ask questions and
              get detailed responses through an interactive chat interface.
            </p>
            <div className="flex justify-center">
              <Button onClick={handleChatMode} className="w-full" size="lg">
                Start Chatting
              </Button>
            </div>
          </div>

          {/* Kickoff Mode Card */}
          <div className="rounded-xl p-8 shadow-lg transition-all hover:shadow-xl bg-card">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 mx-auto">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-center">
              Kickoff Mode
            </h3>
            <p className="mb-6 text-center">
              Provide specific inputs to run the crew directly. Get results
              faster by specifying exactly what you need.
            </p>
            <div className="flex justify-center">
              <Button onClick={handleKickoffMode} className="w-full" size="lg">
                Start Kickoff
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-8 border-t">
        <div className="container mx-auto text-center">
          <p className="text-sm text-muted-foreground">
            CrewAI Chat UI - Powered by CrewAI
          </p>
        </div>
      </footer>
    </div>
  );
}
