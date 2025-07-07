import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Moon,
  Sun,
  Clock,
  List,
  BarChart2,
  Info,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { useChatStore } from "../lib/store";
import { TraceTimeline } from "../components/TraceTimeline";
import { TraceSpanView } from "../components/TraceSpanView";
import { TraceSpanDetail } from "../components/TraceSpanDetail";
import { Separator } from "../components/ui/separator";
import { ScrollArea } from "../components/ui/scroll-area";

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

// Visualization data types
interface TimelineSpan {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  parentId?: string;
  children: TimelineSpan[];
  depth: number;
  duration: number;
  serviceName?: string;
  operation?: string;
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
  const [selectedSpan, setSelectedSpan] = useState<TimelineSpan | null>(null);

  const handleBack = () => {
    navigate("/kickoff");
  };

  // Transform trace data into timeline spans
  const timelineSpans = useMemo(() => {
    if (!selectedTrace) return [];

    const spans: TimelineSpan[] = [];

    // Add crew span as root
    const crewStartTime = new Date(selectedTrace.start_time);
    const crewEndTime = selectedTrace.end_time
      ? new Date(selectedTrace.end_time)
      : null;
    const crewDuration = crewEndTime
      ? crewEndTime.getTime() - crewStartTime.getTime()
      : 0;

    const crewSpan: TimelineSpan = {
      id: selectedTrace.id,
      name: `Crew: ${selectedTrace.crew_name}`,
      startTime: crewStartTime,
      endTime: crewEndTime,
      status: selectedTrace.status,
      depth: 0,
      duration: crewDuration,
      serviceName: "crew",
      operation: "execution",
      children: [],
    };
    spans.push(crewSpan);

    // Add agent spans
    Object.values(selectedTrace.agents).forEach((agent) => {
      const agentStartTime = new Date(agent.start_time);
      const agentEndTime = agent.end_time ? new Date(agent.end_time) : null;
      const agentDuration = agentEndTime
        ? agentEndTime.getTime() - agentStartTime.getTime()
        : 0;

      const agentSpan: TimelineSpan = {
        id: agent.id,
        name: `Agent: ${agent.name}`,
        startTime: agentStartTime,
        endTime: agentEndTime,
        status: agent.status,
        parentId: selectedTrace.id,
        depth: 1,
        duration: agentDuration,
        serviceName: "agent",
        operation: agent.role,
        children: [],
      };
      spans.push(agentSpan);
    });

    // Add task spans
    Object.values(selectedTrace.tasks).forEach((task) => {
      const taskStartTime = new Date(task.start_time);
      const taskEndTime = task.end_time ? new Date(task.end_time) : null;
      const taskDuration = taskEndTime
        ? taskEndTime.getTime() - taskStartTime.getTime()
        : 0;

      const taskSpan: TimelineSpan = {
        id: task.id,
        name:
          task.description.length > 30
            ? `${task.description.substring(0, 30)}...`
            : task.description,
        startTime: taskStartTime,
        endTime: taskEndTime,
        status: task.status,
        parentId: task.agent_id || selectedTrace.id,
        depth: 2,
        duration: taskDuration,
        serviceName: "task",
        operation: "execution",
        children: [],
      };
      spans.push(taskSpan);
    });

    // Build parent-child relationships
    const spanMap = new Map<string, TimelineSpan>();
    spans.forEach((span) => spanMap.set(span.id, span));

    spans.forEach((span) => {
      if (span.parentId && spanMap.has(span.parentId)) {
        const parent = spanMap.get(span.parentId)!;
        parent.children.push(span);
      }
    });

    return spans;
  }, [selectedTrace]);

  // Calculate total duration for timeline
  const totalDuration = useMemo(() => {
    if (!selectedTrace) return 0;
    const startTime = new Date(selectedTrace.start_time).getTime();
    const endTime = selectedTrace.end_time
      ? new Date(selectedTrace.end_time).getTime()
      : Date.now();
    return endTime - startTime;
  }, [selectedTrace]);

  // Handle span selection
  const handleSpanClick = (span: TimelineSpan) => {
    setSelectedSpan(span);
  };

  // Render timeline visualization
  const renderTimeline = () => {
    if (!selectedTrace) return null;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Timeline</CardTitle>
            <CardDescription>
              Visualization of execution spans over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TraceTimeline
              spans={timelineSpans}
              onSpanClick={handleSpanClick}
            />
          </CardContent>
        </Card>

        {selectedSpan && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Span Details</CardTitle>
            </CardHeader>
            <CardContent>
              <TraceSpanDetail span={selectedSpan} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Render hierarchical span view
  const renderSpans = () => {
    if (!selectedTrace) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Spans</CardTitle>
                <CardDescription>
                  Hierarchical view of execution spans
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <TraceSpanView
                    spans={timelineSpans}
                    totalDuration={totalDuration}
                    onSpanClick={handleSpanClick}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Span Details</CardTitle>
              </CardHeader>
              <CardContent>
                <TraceSpanDetail span={selectedSpan} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  // Fetch traces on component mount
  useEffect(() => {
    async function fetchTraces() {
      try {
        setLoading(true);
        const response = await fetch(`/api/crews/${crewId}/traces`);
        if (!response.ok) {
          throw new Error(`Failed to fetch traces: ${response.statusText}`);
        }
        const data = await response.json();
        setTraces(data);
        // Select the first trace by default
        if (data.length > 0) {
          setSelectedTrace(data[0]);
        }
      } catch (err) {
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
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border-green-200 dark:border-green-800";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border-red-200 dark:border-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300 border-gray-200 dark:border-gray-800";
    }
  };

  // Render the list of traces
  const renderTraceList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading traces...</span>
        </div>
      );
    }

    if (error) {
      return <div className="p-4 text-red-500">{error}</div>;
    }

    if (traces.length === 0) {
      return <div className="p-4 text-gray-500 dark:text-gray-400">No traces found.</div>;
    }

    return (
      <div className="space-y-2">
        {traces.map((trace) => (
          <div
            key={trace.id}
            className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
              selectedTrace?.id === trace.id
                ? "border-primary bg-gray-50 dark:bg-gray-800"
                : ""
            }`}
            onClick={() => {
              setSelectedTrace(trace);
              setSelectedSpan(null); // Reset selected span when changing traces
            }}
          >
            <div className="flex justify-between items-center">
              <div className="font-medium">{trace.crew_name}</div>
              <Badge
                variant={
                  trace.status === "completed"
                    ? "outline"
                    : trace.status === "running"
                    ? "default"
                    : "destructive"
                }
                className={
                  trace.status === "completed"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                    : ""
                }
              >
                {trace.status}
              </Badge>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-1">
              <div>{formatTime(trace.start_time)}</div>
              <div className="flex items-center">
                <span className="mr-1">
                  {Object.keys(trace.agents).length} agents
                </span>
                <span>{Object.keys(trace.tasks).length} tasks</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render overview tab with timeline
  const renderOverviewWithTimeline = () => {
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
        </div>

        {/* Timeline visualization */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Execution Timeline</CardTitle>
            <CardDescription>
              A hierarchical view of the execution spans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TraceTimeline
              spans={timelineSpans}
              onSpanClick={handleSpanClick}
            />
          </CardContent>
        </Card>

        {selectedSpan && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Span Details</CardTitle>
              <CardDescription>
                Detailed information for the selected span: {selectedSpan.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TraceSpanDetail span={selectedSpan} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Render agents tab
  const renderAgents = () => {
    if (!selectedTrace) return null;

    const agents = Object.values(selectedTrace.agents);

    if (agents.length === 0) {
      return <div className="p-4 text-gray-500 dark:text-gray-400">No agent data available.</div>;
    }

    return (
      <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {agents.map((agent) => (
            <AccordionItem key={agent.id} value={agent.id}>
              <AccordionTrigger className="hover:bg-gray-50 dark:hover:bg-gray-800/50 px-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <Badge
                      className={getStatusColor(agent.status)}
                      variant="outline"
                    >
                      {agent.status}
                    </Badge>
                    <span className="ml-2 font-medium">{agent.name}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      ({agent.role})
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {calculateDuration(agent.start_time, agent.end_time)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 py-2 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Agent ID</div>
                  <div className="text-sm font-mono">{agent.id}</div>

                  <div className="text-sm text-gray-500 dark:text-gray-400">Start Time</div>
                  <div>{formatTime(agent.start_time)}</div>

                  {agent.end_time && (
                    <div className="grid grid-cols-2 col-span-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400">End Time</div>
                      <div>{formatTime(agent.end_time)}</div>
                    </div>
                  )}

                  {agent.output && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Output</div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-md text-sm whitespace-pre-wrap font-mono">
                        {agent.output}
                      </div>
                    </div>
                  )}

                  {agent.events.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Events</div>
                      <div className="border rounded-md divide-y dark:divide-gray-700 col-span-2">
                        {agent.events.map((event, idx) => (
                          <div
                            key={idx}
                            className="p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <div className="flex justify-between">
                              <Badge variant="outline">{event.type}</Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {Object.keys(event.data).length > 0 && (
                              <div className="mt-1 text-xs font-mono bg-gray-50 dark:bg-gray-800/50 p-1 rounded">
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
      return <div className="p-4 text-gray-500 dark:text-gray-400">No task data available.</div>;
    }

    return (
      <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {tasks.map((task) => (
            <AccordionItem key={task.id} value={task.id}>
              <AccordionTrigger className="hover:bg-gray-50 dark:hover:bg-gray-800/50 px-4">
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
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {calculateDuration(task.start_time, task.end_time)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 py-2 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Task ID</div>
                  <div className="text-sm font-mono">{task.id}</div>

                  {task.agent_id && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Assigned Agent
                      </div>
                      <div className="text-sm font-mono">{task.agent_id}</div>
                    </div>
                  )}

                  <div className="text-sm text-gray-500 dark:text-gray-400">Start Time</div>
                  <div>{formatTime(task.start_time)}</div>

                  {task.end_time && (
                    <div className="grid grid-cols-2 col-span-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400">End Time</div>
                      <div>{formatTime(task.end_time)}</div>
                    </div>
                  )}

                  {task.output && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Output</div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-md text-sm whitespace-pre-wrap font-mono">
                        {task.output}
                      </div>
                    </div>
                  )}

                  {task.events.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Events</div>
                      <div className="border rounded-md divide-y dark:divide-gray-700 col-span-2">
                        {task.events.map((event, idx) => (
                          <div
                            key={idx}
                            className="p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <div className="flex justify-between">
                              <Badge variant="outline">{event.type}</Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {Object.keys(event.data).length > 0 && (
                              <div className="mt-1 text-xs font-mono bg-gray-50 dark:bg-gray-800/50 p-1 rounded">
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
      return <div className="p-4 text-gray-500 dark:text-gray-400">No event data available.</div>;
    }

    return (
      <div className="space-y-4">
        <div className="border rounded-md divide-y dark:divide-gray-700">
          {selectedTrace.events.map((event, idx) => (
            <div key={idx} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex justify-between items-center">
                <Badge variant="outline">{event.type}</Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTime(event.timestamp)}
                </span>
              </div>
              {Object.keys(event.data).length > 0 && (
                <div className="mt-2 text-xs font-mono bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
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
                    <TabsList className="grid grid-cols-3 mb-4">
                      <TabsTrigger
                        value="overview"
                        className="flex items-center gap-1"
                      >
                        <Info className="h-4 w-4" />
                        <span>Overview</span>
                      </TabsTrigger>
                      <TabsTrigger value="agents">Agents</TabsTrigger>
                      <TabsTrigger value="tasks">Tasks</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                      {renderOverviewWithTimeline()}
                    </TabsContent>

                    <TabsContent value="agents">{renderAgents()}</TabsContent>

                    <TabsContent value="tasks">{renderTasks()}</TabsContent>
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
