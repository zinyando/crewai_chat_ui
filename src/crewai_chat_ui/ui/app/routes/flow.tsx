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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import FlowCanvas from "../components/FlowCanvas";

export function meta() {
  return [
    { title: "CrewAI - Flow Mode" },
    {
      name: "description",
      content: "Run a flow directly with specific inputs",
    },
  ];
}

interface InputField {
  name: string;
  description: string;
  value: string;
}

interface FlowDetails {
  id: string;
  name: string;
  description: string;
  required_inputs: InputField[];
}

export default function Flow() {
  const navigate = useNavigate();
  const { flows, setFlows, isDarkMode, toggleDarkMode } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [flowDetails, setFlowDetails] = useState<FlowDetails | null>(null);
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"init" | "execution">("init");
  const [result, setResult] = useState<string | null>(null);
  const [isRunningFlow, setIsRunningFlow] = useState(false);
  const [resetKey, setResetKey] = useState(0); // Key to trigger reset in FlowCanvas

  // Reset state on page load/refresh
  useEffect(() => {
    // Reset all state on component mount (page load/refresh)
    setIsRunningFlow(false);
    setResult(null);
    setError(null);
    setResetKey(1); // Set to 1 on initial load to trigger reset
  }, []);

  // Fetch available flows on component mount
  useEffect(() => {
    const fetchFlows = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/flows");
        const data = await response.json();
        if (data.flows) {
          setFlows(data.flows);

          if (data.flows.length > 0) {
            // If no flow is selected or the selected one is no longer valid,
            // select the first one from the new list.
            const currentFlowIsValid = data.flows.some(
              (flow: { id: string }) => flow.id === selectedFlowId
            );
            if (!currentFlowIsValid) {
              setSelectedFlowId(data.flows[0].id);
            }
          } else {
            // No flows are available, clear selection and details
            setSelectedFlowId("");
            setFlowDetails(null);
            setInputFields([]);
            setError("No flows available. Please check your configuration.");
          }
        }
      } catch (error) {
        console.error("Error fetching flows:", error);
        setError("Failed to fetch flows. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, [setFlows]);

  // Fetch flow details and required inputs when a flow is selected
  useEffect(() => {
    const fetchFlowDetails = async () => {
      if (!selectedFlowId) {
        setFlowDetails(null);
        setInputFields([]);
        return;
      }

      try {
        setLoading(true);

        // First check if the flow exists in our list
        const flow = flows.find((f) => f.id === selectedFlowId);
        if (!flow) {
          setError(
            `Flow with ID ${selectedFlowId} not found. Please select a valid flow.`
          );
          setLoading(false);
          return;
        }

        // Fetch flow initialization details
        const response = await fetch(`/api/flows/${selectedFlowId}/initialize`);

        if (!response.ok) {
          if (response.status === 404) {
            setError(
              `Flow with ID ${selectedFlowId} not found. Please select a valid flow.`
            );
          } else {
            setError(`Error fetching flow details: ${response.statusText}`);
          }
          setLoading(false);
          return;
        }

        const data = await response.json();

        if (data.status === "success") {
          setFlowDetails({
            id: flow.id,
            name: flow.name,
            description: flow.description,
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
        } else {
          setError(data.detail || "Failed to fetch flow details");
        }
      } catch (error) {
        console.error("Error fetching flow details:", error);
        setError("Failed to fetch flow details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchFlowDetails();
  }, [selectedFlowId, flows]);

  const handleInputChange = (name: string, value: string) => {
    setInputFields((fields) =>
      fields.map((field) => (field.name === name ? { ...field, value } : field))
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFlowId) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setIsRunningFlow(true);
    setViewMode("execution"); // Switch to execution view when running the flow
    setResetKey((prev) => prev + 1); // Increment reset key to trigger state reset

    // Convert input fields to the expected format
    const inputs: Record<string, string> = {};
    inputFields.forEach((field) => {
      inputs[field.name] = field.value;
    });

    try {
      const response = await fetch(`/api/flows/${selectedFlowId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
      });

      const data = await response.json();

      if (data.status === "success") {
        // The result will be displayed by the FlowCanvas component
        // via the WebSocket connection, so we don't need to handle it here
      } else {
        setError(data.detail || "Failed to run flow");
      }
    } catch (error) {
      console.error("Error running flow:", error);
      setError("Failed to run flow. Please try again later.");
    } finally {
      setLoading(false);
      // We don't set isRunningFlow to false here because we want to keep showing the visualization
      // even after the flow has completed running
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
            <h1 className="text-2xl font-bold">Flow Mode</h1>
          </div>
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

      {/* Main Layout with Sidebar and Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r flex-shrink-0 overflow-y-auto p-4 bg-background">
          <div className="sticky top-0 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Select a Flow</h3>
              <Select
                value={selectedFlowId}
                onValueChange={(value) => {
                  setSelectedFlowId(value);
                  // Reset the view mode to init when selecting a new flow
                  setViewMode("init");
                  setResetKey((prev) => prev + 1);
                }}
                disabled={loading}
              >
                <SelectTrigger id="flow-select" className="w-full">
                  <SelectValue placeholder="Select a flow" />
                </SelectTrigger>
                <SelectContent>
                  {flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {flowDetails && (
              <div className="p-4 rounded-lg border bg-accent/50">
                <h3 className="text-lg font-semibold mb-2">
                  {flowDetails.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {flowDetails.description}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-lg font-semibold">Required Inputs</h3>

              {inputFields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>{field.name}</Label>
                  {field.name.toLowerCase().includes("prompt") ? (
                    <Textarea
                      id={field.name}
                      placeholder={field.description}
                      value={field.value}
                      onChange={(e) =>
                        handleInputChange(field.name, e.target.value)
                      }
                      className="min-h-[100px]"
                    />
                  ) : (
                    <Input
                      id={field.name}
                      placeholder={field.description}
                      value={field.value}
                      onChange={(e) =>
                        handleInputChange(field.name, e.target.value)
                      }
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                </div>
              ))}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || inputFields.some((field) => !field.value)}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Flow...
                  </>
                ) : (
                  "Run Flow"
                )}
              </Button>
            </form>
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

          {/* Flow Visualization Canvas */}
          {selectedFlowId && (
            <FlowCanvas
              flowId={selectedFlowId}
              isRunning={isRunningFlow}
              resetKey={resetKey}
              viewMode={viewMode}
            />
          )}

          {!error && !selectedFlowId && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold mb-2">Run a Flow Directly</h2>
                <p className="text-muted-foreground mb-4">
                  Select a flow from the sidebar, provide the required inputs,
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

          {/* Results are displayed in the FlowCanvas component */}
        </main>
      </div>
    </div>
  );
}
