import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Loader2, ChevronRight, ChevronDown, ArrowLeft, Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { useChatStore } from "../lib/store";

// Define trace data types
interface TraceEvent {
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

interface TraceAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  start_time: string;
  end_time?: string;
  output?: string;
  events: TraceEvent[];
}

interface TraceTask {
  id: string;
  description: string;
  agent_id: string | null;
  status: string;
  start_time: string;
  end_time?: string;
  output?: string;
  events: TraceEvent[];
}

interface Trace {
  id: string;
  crew_id: string;
  crew_name: string;
  start_time: string;
  end_time?: string;
  status: string;
  output?: string;
  events: TraceEvent[];
  agents: Record<string, TraceAgent>;
  tasks: Record<string, TraceTask>;
}

export default function TracesPage() {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useChatStore();
  const [searchParams] = useSearchParams();
  const crewId = searchParams.get("crewId");

  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  
  const handleBack = () => {
    navigate("/kickoff");
  };

  // Fetch traces on component mount
  useEffect(() => {
    async function fetchTraces() {
      try {
        setLoading(true);
        setError(null);

        // If crewId is provided, fetch traces for that crew
        // Otherwise, fetch all recent traces
        const endpoint = crewId ? `/api/crews/${crewId}/traces` : "/api/traces";

        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error(`Failed to fetch traces: ${response.statusText}`);
        }

        const data = await response.json();
        setTraces(data);

        // Select the first trace by default if available
        if (data.length > 0) {
          setSelectedTrace(data[0]);
        }
      } catch (err) {
        console.error("Error fetching traces:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    fetchTraces();
  }, [crewId]);

  // Format timestamp to readable format
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate duration between two timestamps
  const calculateDuration = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return "N/A";

    try {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      const durationMs = end - start;

      // Format duration
      if (durationMs < 1000) {
        return `${durationMs}ms`;
      } else if (durationMs < 60000) {
        return `${(durationMs / 1000).toFixed(2)}s`;
      } else {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = ((durationMs % 60000) / 1000).toFixed(2);
        return `${minutes}m ${seconds}s`;
      }
    } catch (e) {
      return "Invalid time";
    }
  };

  // Get status color based on status
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "running":
      case "initializing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
    }
  };

  // Render the list of traces
  const renderTraceList = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    if (error) {
      return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    if (traces.length === 0) {
      return (
        <div className="p-4 text-gray-500">No traces found.</div>
      );
    }

    return (
      <div className="space-y-2">
        {traces.map((trace) => (
          <div
            key={trace.id}
            className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
              selectedTrace?.id === trace.id ? "border-blue-500 bg-blue-50" : ""
            }`}
            onClick={() => setSelectedTrace(trace)}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">{trace.crew_name}</h3>
                <p className="text-sm text-gray-500">
                  {formatTime(trace.start_time)}
                </p>
              </div>
              <Badge className={getStatusColor(trace.status)}>
                {trace.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render overview tab
  const renderOverview = () => {
    if (!selectedTrace) return null;

    const agentCount = Object.keys(selectedTrace.agents).length;
    const taskCount = Object.keys(selectedTrace.tasks).length;
    const eventCount = selectedTrace.events.length;

    const completedAgents = Object.values(selectedTrace.agents).filter(
      (agent) => agent.status === "completed"
    ).length;

    const completedTasks = Object.values(selectedTrace.tasks).filter(
      (task) => task.status === "completed"
    ).length;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{agentCount}</div>
              <div className="text-sm text-gray-500">
                Agents ({completedAgents} completed)
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{taskCount}</div>
              <div className="text-sm text-gray-500">
                Tasks ({completedTasks} completed)
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{eventCount}</div>
              <div className="text-sm text-gray-500">Events</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Execution Details</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-sm text-gray-500">Crew ID</div>
            <div className="text-sm font-mono">{selectedTrace.crew_id}</div>

            <div className="text-sm text-gray-500">Trace ID</div>
            <div className="text-sm font-mono">{selectedTrace.id}</div>

            <div className="text-sm text-gray-500">Status</div>
            <div>
              <Badge className={getStatusColor(selectedTrace.status)}>
                {selectedTrace.status}
              </Badge>
            </div>

            <div className="text-sm text-gray-500">Start Time</div>
            <div className="text-sm">
              {formatTime(selectedTrace.start_time)}
            </div>

            {selectedTrace.end_time && (
              <>
                <div className="text-sm text-gray-500">End Time</div>
                <div className="text-sm">
                  {formatTime(selectedTrace.end_time)}
                </div>

                <div className="text-sm text-gray-500">Duration</div>
                <div className="text-sm">
                  {calculateDuration(
                    selectedTrace.start_time,
                    selectedTrace.end_time
                  )}
                </div>
              </>
            )}
          </div>

          {selectedTrace.output && (
            <div className="mt-4">
              <h4 className="text-md font-semibold mb-2">Output</h4>
              <div className="bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap font-mono">
                {selectedTrace.output}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render agents tab
  const renderAgents = () => {
    if (!selectedTrace) return null;

    const agents = Object.values(selectedTrace.agents);

    if (agents.length === 0) {
      return <div className="p-4 text-gray-500">No agent data available.</div>;
    }

    return (
      <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {agents.map((agent) => (
            <AccordionItem key={agent.id} value={agent.id}>
              <AccordionTrigger className="hover:bg-gray-50 px-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <Badge
                      className={getStatusColor(agent.status)}
                      variant="outline"
                    >
                      {agent.status}
                    </Badge>
                    <span className="ml-2 font-medium">{agent.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      ({agent.role})
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {calculateDuration(agent.start_time, agent.end_time)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 py-2 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-500">Agent ID</div>
                  <div className="text-sm font-mono">{agent.id}</div>

                  <div className="text-sm text-gray-500">Start Time</div>
                  <div>{formatTime(agent.start_time)}</div>

                  {agent.end_time && (
                    <div className="grid grid-cols-2 col-span-2">
                      <div className="text-sm text-gray-500">End Time</div>
                      <div>{formatTime(agent.end_time)}</div>
                    </div>
                  )}

                  {agent.output && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Output</div>
                      <div className="bg-gray-50 p-2 rounded-md text-sm whitespace-pre-wrap font-mono col-span-2">
                      </div>
                    </div>
                  )}

                  {agent.events.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Events</div>
                      <div className="border rounded-md divide-y col-span-2">
                        {agent.events.map((event, idx) => (
                          <div
                            key={idx}
                            className="p-2 text-sm hover:bg-gray-50"
                          >
                            <div className="flex justify-between">
                              <Badge variant="outline">{event.type}</Badge>
                              <span className="text-xs text-gray-500">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {Object.keys(event.data).length > 0 && (
                              <div className="mt-1 text-xs font-mono bg-gray-50 p-1 rounded">
                                {JSON.stringify(event.data, null, 2)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  };

  // Render tasks tab
  const renderTasks = () => {
    if (!selectedTrace) return null;

    const tasks = Object.values(selectedTrace.tasks);

    if (tasks.length === 0) {
      return <div className="p-4 text-gray-500">No task data available.</div>;
    }

    return (
      <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {tasks.map((task) => (
            <AccordionItem key={task.id} value={task.id}>
              <AccordionTrigger className="hover:bg-gray-50 px-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <Badge
                      className={getStatusColor(task.status)}
                      variant="outline"
                    >
                      {task.status}
                    </Badge>
                    <span className="ml-2 font-medium truncate max-w-md">
                      {task.description}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {calculateDuration(task.start_time, task.end_time)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 py-2 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-500">Task ID</div>
                  <div className="text-sm font-mono">{task.id}</div>

                  {task.agent_id && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm text-gray-500">
                        Assigned Agent
                      </div>
                      <div className="text-sm font-mono">{task.agent_id}</div>
                    </div>
                  )}

                  <div className="text-sm text-gray-500">Start Time</div>
                  <div>{formatTime(task.start_time)}</div>

                  {task.end_time && (
                    <div className="grid grid-cols-2 col-span-2">
                      <div className="text-sm text-gray-500">End Time</div>
                      <div>{formatTime(task.end_time)}</div>
                    </div>
                  )}

                  {task.output && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Output</div>
                      <div className="bg-gray-50 p-2 rounded-md text-sm whitespace-pre-wrap font-mono col-span-2">
                      </div>
                    </div>
                  )}

                  {task.events.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Events</div>
                      <div className="border rounded-md divide-y col-span-2">
                        {task.events.map((event, idx) => (
                          <div
                            key={idx}
                            className="p-2 text-sm hover:bg-gray-50"
                          >
                            <div className="flex justify-between">
                              <Badge variant="outline">{event.type}</Badge>
                              <span className="text-xs text-gray-500">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {Object.keys(event.data).length > 0 && (
                              <div className="mt-1 text-xs font-mono bg-gray-50 p-1 rounded">
                                {JSON.stringify(event.data, null, 2)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  };

  // Render events tab
  const renderEvents = () => {
    if (!selectedTrace) return null;

    if (selectedTrace.events.length === 0) {
      return <div className="p-4 text-gray-500">No event data available.</div>;
    }

    return (
      <div className="space-y-4">
        <div className="border rounded-md divide-y">
          {selectedTrace.events.map((event, idx) => (
            <div key={idx} className="p-3 hover:bg-gray-50">
              <div className="flex justify-between items-center">
                <Badge variant="outline">{event.type}</Badge>
                <span className="text-xs text-gray-500">
                  {formatTime(event.timestamp)}
                </span>
              </div>
              {Object.keys(event.data).length > 0 && (
                <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded">
                  {JSON.stringify(event.data, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
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
            <h1 className="text-2xl font-bold">Execution Traces</h1>
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
            <Card>
              <CardHeader>
                <CardTitle>Traces</CardTitle>
              </CardHeader>
              <CardContent>{renderTraceList()}</CardContent>
            </Card>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {selectedTrace ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedTrace.crew_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs
                    defaultValue="overview"
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="w-full"
                  >
                    <TabsList className="grid grid-cols-4 mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="agents">Agents</TabsTrigger>
                      <TabsTrigger value="tasks">Tasks</TabsTrigger>
                      <TabsTrigger value="events">Events</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">{renderOverview()}</TabsContent>

                    <TabsContent value="agents">{renderAgents()}</TabsContent>

                    <TabsContent value="tasks">{renderTasks()}</TabsContent>

                    <TabsContent value="events">{renderEvents()}</TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : loading ? (
              <div className="flex justify-center items-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="text-center p-8 text-gray-500">
                Select a trace to view details
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
