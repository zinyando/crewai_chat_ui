import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useChatStore } from "~/lib/store";
import { ArrowLeft, Loader2, Moon, Sun } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import ReactMarkdown from "react-markdown";
import CrewAgentCanvas from "../components/CrewAgentCanvas";

export function meta() {
  return [
    { title: "CrewAI - Kickoff Mode" },
    {
      name: "description",
      content: "Run a crew directly with specific inputs",
    },
  ];
}

interface InputField {
  name: string;
  description: string;
  value: string;
}

interface CrewDetails {
  id: string;
  name: string;
  description: string;
  required_inputs: InputField[];
}

export default function Kickoff() {
  const navigate = useNavigate();
  const { crews, setCrews, isDarkMode, toggleDarkMode } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [crewDetails, setCrewDetails] = useState<CrewDetails | null>(null);
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isRunningCrew, setIsRunningCrew] = useState(false);
  const [resetKey, setResetKey] = useState(0); // Key to trigger reset in CrewAgentCanvas

  // Reset state on page load/refresh
  useEffect(() => {
    // Reset all state on component mount (page load/refresh)
    setIsRunningCrew(false);
    setResult(null);
    setError(null);
    setResetKey(1); // Set to 1 on initial load to trigger reset
  }, []);

  // Fetch available crews on component mount
  useEffect(() => {
    const fetchCrews = async () => {
      try {
        const response = await fetch("/api/crews");
        const data = await response.json();
        if (data.crews) {
          setCrews(data.crews);
          
          // Automatically select the first crew if none is selected
          if (data.crews.length > 0 && !selectedCrewId) {
            setSelectedCrewId(data.crews[0].id);
          }
        }
      } catch (error) {
        console.error("Error fetching crews:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!crews.length) {
      setLoading(true);
      fetchCrews();
    } else {
      // If crews are already loaded but no crew is selected, select the first one
      if (crews.length > 0 && !selectedCrewId) {
        setSelectedCrewId(crews[0].id);
      }
      setLoading(false);
    }
  }, [crews.length, setCrews, selectedCrewId]);

  // Fetch crew details and required inputs when a crew is selected
  useEffect(() => {
    const fetchCrewDetails = async () => {
      if (!selectedCrewId) {
        setCrewDetails(null);
        setInputFields([]);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(
          `/api/initialize?crew_id=${selectedCrewId}`
        );
        const data = await response.json();

        if (data.status === "success") {
          const crew = crews.find((c) => c.id === selectedCrewId);
          if (crew) {
            setCrewDetails({
              id: crew.id,
              name: crew.name,
              description: crew.description,
              required_inputs: data.required_inputs || [],
            });

            // Initialize input fields with empty values
            setInputFields(
              (data.required_inputs || []).map(
                (input: { name: string; description: string }) => ({
                  name: input.name,
                  description: input.description,
                  value: "",
                })
              )
            );
          }
        } else {
          setError(data.detail || "Failed to fetch crew details");
        }
      } catch (error) {
        console.error("Error fetching crew details:", error);
        setError("Failed to fetch crew details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchCrewDetails();
  }, [selectedCrewId, crews]);

  const handleInputChange = (name: string, value: string) => {
    setInputFields((fields) =>
      fields.map((field) => (field.name === name ? { ...field, value } : field))
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCrewId) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setIsRunningCrew(true);
    setResetKey(prev => prev + 1); // Increment reset key to trigger state reset

    // Convert input fields to the expected format
    const inputs: Record<string, string> = {};
    inputFields.forEach((field) => {
      inputs[field.name] = field.value;
    });

    try {
      const response = await fetch(`/api/crews/${selectedCrewId}/kickoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
      });

      const data = await response.json();

      if (data.status === "success") {
        // The result will be displayed by the CrewAgentCanvas component
        // via the WebSocket connection, so we don't need to handle it here
      } else {
        setError(data.detail || "Failed to run crew");
      }
    } catch (error) {
      console.error("Error running crew:", error);
      setError("Failed to run crew. Please try again later.");
    } finally {
      setLoading(false);
      // We don't set isRunningCrew to false here because we want to keep showing the visualization
      // even after the crew has completed running
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="py-4 px-6 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="mr-4"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Kickoff Mode</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="h-8 w-8"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Layout with Sidebar and Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r flex-shrink-0 overflow-y-auto p-4 bg-background">
          <div className="sticky top-0 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Select a Crew</h3>
              <Select
                value={selectedCrewId}
                onValueChange={setSelectedCrewId}
                disabled={loading}
              >
                <SelectTrigger id="crew-select" className="w-full">
                  <SelectValue placeholder="Select a crew" />
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

            {crewDetails && (
              <div className="p-4 rounded-lg border bg-accent/50">
                <h3 className="text-lg font-semibold mb-2">
                  {crewDetails.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {crewDetails.description}
                </p>
              </div>
            )}

            {inputFields.length > 0 && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-lg font-semibold">Required Inputs</h3>

                {inputFields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name} className="text-sm font-medium">
                      {field.name}
                      {field.description && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">
                          {field.description}
                        </span>
                      )}
                    </Label>
                    {field.description.toLowerCase().includes("longer") ? (
                      <Textarea
                        id={field.name}
                        value={field.value}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          handleInputChange(field.name, e.target.value)
                        }
                        disabled={loading}
                        className="min-h-24 text-sm"
                      />
                    ) : (
                      <Input
                        id={field.name}
                        value={field.value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleInputChange(field.name, e.target.value)
                        }
                        disabled={loading}
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    loading || inputFields.some((field) => !field.value)
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Crew...
                    </>
                  ) : (
                    "Run Crew"
                  )}
                </Button>
              </form>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-background">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Crew Agent Visualization Canvas */}
          {selectedCrewId && (
            <CrewAgentCanvas 
            crewId={selectedCrewId} 
            isRunning={isRunningCrew} 
            resetKey={resetKey}
          />
          )}

          {!error && !selectedCrewId && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold mb-2">Run a Crew Directly</h2>
                <p className="text-muted-foreground mb-4">
                  Select a crew from the sidebar, provide the required inputs,
                  and run it to see results here.
                </p>
                {loading && (
                  <div className="flex justify-center mt-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results are now displayed in the CrewAgentCanvas component */}
        </main>
      </div>
    </div>
  );
}
