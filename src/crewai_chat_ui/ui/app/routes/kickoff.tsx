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
import { ArrowLeft, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import ReactMarkdown from "react-markdown";

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
  const { crews, setCrews, isDarkMode } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [selectedCrewId, setSelectedCrewId] = useState<string>("");
  const [crewDetails, setCrewDetails] = useState<CrewDetails | null>(null);
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Fetch available crews on component mount
  useEffect(() => {
    const fetchCrews = async () => {
      try {
        const response = await fetch("/api/crews");
        const data = await response.json();
        if (data.crews) {
          setCrews(data.crews);
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
      setLoading(false);
    }
  }, [crews.length, setCrews]);

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
        // Handle nested result structure
        if (data.result && typeof data.result === "object") {
          if (data.result.status === "success") {
            setResult(data.result.result);
          } else {
            setError(data.result.detail || "Failed to run crew");
          }
        } else {
          setResult(data.result);
        }
      } else {
        setError(data.detail || "Failed to run crew");
      }
    } catch (error) {
      console.error("Error running crew:", error);
      setError("Failed to run crew. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="py-4 px-6 border-b">
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

          {!result && !error && (
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

          {result && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold mb-6">Result</h2>
              <div className="p-6 rounded-lg border bg-card overflow-auto">
                <div className="text-base leading-7">
                  <ReactMarkdown
                    components={{
                      h1: ({ node, ...props }) => (
                        <h1
                          className="text-2xl font-bold mt-6 mb-4"
                          {...props}
                        />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2
                          className="text-xl font-bold mt-5 mb-3"
                          {...props}
                        />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3
                          className="text-lg font-bold mt-4 mb-2"
                          {...props}
                        />
                      ),
                      p: ({ node, ...props }) => (
                        <p className="mb-4" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-6 mb-4" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-6 mb-4" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="mb-1" {...props} />
                      ),
                      a: ({ node, ...props }) => (
                        <a
                          className="text-blue-500 hover:underline"
                          {...props}
                        />
                      ),
                      blockquote: ({ node, ...props }) => (
                        <blockquote
                          className="border-l-4 border-muted pl-4 italic my-4"
                          {...props}
                        />
                      ),
                      code: ({ node, children, className, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline =
                          !match && !children?.toString().includes("\n");
                        return isInline ? (
                          <code
                            className="bg-muted px-1 py-0.5 rounded"
                            {...props}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            className="block bg-muted p-2 rounded my-4 overflow-x-auto"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {result}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
