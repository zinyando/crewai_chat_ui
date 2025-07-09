import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
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
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function meta() {
  return [
    { title: "CrewAI - Flow Traces" },
    {
      name: "description",
      content: "View execution traces for flows",
    },
  ];
}

interface TraceSpan {
  id: string;
  name: string;
  start_time: number;
  end_time?: number;
  status: "running" | "completed" | "failed";
  parent_id?: string;
  attributes: Record<string, any>;
  events: TraceEvent[];
  children: TraceSpan[];
}

interface TraceEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, any>;
}

interface FlowTrace {
  id: string;
  flow_id: string;
  flow_name: string;
  start_time: number;
  end_time?: number;
  status: "running" | "completed" | "failed";
  spans: TraceSpan[];
}

export default function FlowTraces() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { flows, setFlows, isDarkMode, toggleDarkMode } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [traces, setTraces] = useState<FlowTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("timeline");

  // Get selected trace from traces array
  const selectedTrace = useMemo(
    () => traces.find((trace) => trace.id === selectedTraceId),
    [traces, selectedTraceId]
  );

  // Initialize from URL params
  useEffect(() => {
    const flowId = searchParams.get("flowId");
    const traceId = searchParams.get("traceId");

    if (flowId) {
      setSelectedFlowId(flowId);
    }

    if (traceId) {
      setSelectedTraceId(traceId);
    }
  }, [searchParams]);

  // Update URL params when selections change
  useEffect(() => {
    const newParams = new URLSearchParams();
    if (selectedFlowId) {
      newParams.set("flowId", selectedFlowId);
    }
    if (selectedTraceId) {
      newParams.set("traceId", selectedTraceId);
    }
    setSearchParams(newParams);
  }, [selectedFlowId, selectedTraceId, setSearchParams]);

  // Fetch available flows on component mount
  useEffect(() => {
    const fetchFlows = async () => {
      try {
        const response = await fetch("/api/flows");
        const data = await response.json();
        if (data.flows) {
          setFlows(data.flows);

          // If no flow is selected but we have flows, select the first one
          if (data.flows.length > 0 && !selectedFlowId) {
            setSelectedFlowId(data.flows[0].id);
          }
        }
      } catch (error) {
        console.error("Error fetching flows:", error);
        setError("Failed to fetch flows. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    if (!flows.length) {
      setLoading(true);
      fetchFlows();
    } else if (!selectedFlowId && flows.length > 0) {
      // If flows are already loaded but no flow is selected, select the first one
      setSelectedFlowId(flows[0].id);
    }
  }, [flows, setFlows, selectedFlowId]);

  // Fetch traces when a flow is selected
  useEffect(() => {
    const fetchTraces = async () => {
      if (!selectedFlowId) {
        setTraces([]);
        setSelectedTraceId("");
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/flows/${selectedFlowId}/traces`);
        const data = await response.json();

        if (data.status === "success" && data.traces) {
          setTraces(data.traces);

          // Select the first trace if none is selected
          if (data.traces.length > 0 && !selectedTraceId) {
            setSelectedTraceId(data.traces[0].id);
          } else if (data.traces.length === 0) {
            setSelectedTraceId("");
          }
        } else {
          setError(data.detail || "Failed to fetch flow traces");
          setTraces([]);
          setSelectedTraceId("");
        }
      } catch (error) {
        console.error("Error fetching flow traces:", error);
        setError("Failed to fetch flow traces. Please try again later.");
        setTraces([]);
        setSelectedTraceId("");
      } finally {
        setLoading(false);
      }
    };

    fetchTraces();
  }, [selectedFlowId]);

  // Process trace data for timeline view
  const timelineSpans = useMemo(() => {
    if (!selectedTrace) return [];

    // Function to flatten spans into a single array with level information
    const flattenSpans = (
      spans: TraceSpan[],
      level = 0,
      result: Array<TraceSpan & { level: number }> = []
    ) => {
      spans.forEach((span) => {
        result.push({ ...span, level });
        if (span.children && span.children.length > 0) {
          flattenSpans(span.children, level + 1, result);
        }
      });
      return result;
    };

    return flattenSpans(selectedTrace.spans);
  }, [selectedTrace]);

  // Process trace data for hierarchical view
  const hierarchicalSpans = useMemo(() => {
    if (!selectedTrace) return [];
    return selectedTrace.spans;
  }, [selectedTrace]);

  // Helper function to format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Helper function to format duration
  const formatDuration = (start: number, end?: number) => {
    if (!end) return "In progress";
    const duration = end - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const handleBack = () => {
    navigate("/flow");
  };

  // Recursive component for hierarchical span view
  const SpanTree = ({
    spans,
    level = 0,
  }: {
    spans: TraceSpan[];
    level?: number;
  }) => {
    return (
      <div className="space-y-2">
        {spans.map((span) => (
          <div key={span.id} className="space-y-2">
            <div
              className={`p-3 border rounded-md ${level > 0 ? "ml-6" : ""}`}
              style={{
                borderLeftWidth: "4px",
                borderLeftColor:
                  span.status === "completed"
                    ? "#4caf50"
                    : span.status === "failed"
                    ? "#f44336"
                    : "#2196f3",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
                      span.status
                    )}`}
                  ></div>
                  <span className="font-medium">{span.name}</span>
                </div>
                <Badge
                  variant={
                    span.status === "running"
                      ? "secondary"
                      : span.status === "completed"
                      ? "default"
                      : span.status === "failed"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {span.status}
                </Badge>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                <div>Start: {formatTime(span.start_time)}</div>
                {span.end_time && <div>End: {formatTime(span.end_time)}</div>}
                <div>
                  Duration: {formatDuration(span.start_time, span.end_time)}
                </div>
              </div>

              {span.attributes && Object.keys(span.attributes).length > 0 && (
                <div className="mt-2">
                  <details className="text-xs">
                    <summary className="font-medium cursor-pointer">
                      Attributes
                    </summary>
                    <pre className="mt-1 p-2 bg-muted rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap">
                      {JSON.stringify(span.attributes, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {span.events && span.events.length > 0 && (
                <div className="mt-2">
                  <details className="text-xs">
                    <summary className="font-medium cursor-pointer">
                      Events ({span.events.length})
                    </summary>
                    <div className="mt-1 space-y-2">
                      {span.events.map((event, idx) => (
                        <div key={idx} className="p-2 bg-muted rounded-md">
                          <div className="font-medium">{event.name}</div>
                          <div className="text-muted-foreground">
                            {formatTime(event.timestamp)}
                          </div>
                          {event.attributes &&
                            Object.keys(event.attributes).length > 0 && (
                              <pre className="mt-1 overflow-auto max-h-[100px] whitespace-pre-wrap">
                                {JSON.stringify(event.attributes, null, 2)}
                              </pre>
                            )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>

            {span.children && span.children.length > 0 && (
              <SpanTree spans={span.children} level={level + 1} />
            )}
          </div>
        ))}
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
            <h1 className="text-2xl font-bold">Flow Traces</h1>
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
                onValueChange={setSelectedFlowId}
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

            {traces.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Select a Trace</h3>
                <Select
                  value={selectedTraceId}
                  onValueChange={setSelectedTraceId}
                  disabled={loading}
                >
                  <SelectTrigger id="trace-select" className="w-full">
                    <SelectValue placeholder="Select a trace" />
                  </SelectTrigger>
                  <SelectContent>
                    {traces.map((trace) => (
                      <SelectItem key={trace.id} value={trace.id}>
                        {new Date(trace.start_time).toLocaleString()} -{" "}
                        {trace.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTrace && (
              <Card>
                <CardHeader>
                  <CardTitle>Trace Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Flow:</span>
                      <span>{selectedTrace.flow_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge
                        variant={
                          selectedTrace.status === "running"
                            ? "secondary"
                            : selectedTrace.status === "completed"
                            ? "default"
                            : selectedTrace.status === "failed"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {selectedTrace.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started:</span>
                      <span>
                        {new Date(selectedTrace.start_time).toLocaleString()}
                      </span>
                    </div>
                    {selectedTrace.end_time && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ended:</span>
                        <span>
                          {new Date(selectedTrace.end_time).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span>
                        {formatDuration(
                          selectedTrace.start_time,
                          selectedTrace.end_time
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Spans:</span>
                      <span>{timelineSpans.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && !error && !selectedTrace && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-bold mb-2">Flow Traces</h2>
                <p className="text-muted-foreground mb-4">
                  Select a flow and a trace from the sidebar to view execution
                  details.
                </p>
              </div>
            </div>
          )}

          {selectedTrace && (
            <div className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="mt-4">
                  <ScrollArea className="h-[calc(100vh-200px)]">
                    <div className="space-y-2">
                      {timelineSpans.map((span) => (
                        <div
                          key={span.id}
                          className="p-3 border rounded-md"
                          style={{
                            marginLeft: `${span.level * 24}px`,
                            borderLeftWidth: "4px",
                            borderLeftColor:
                              span.status === "completed"
                                ? "#4caf50"
                                : span.status === "failed"
                                ? "#f44336"
                                : "#2196f3",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div
                                className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
                                  span.status
                                )}`}
                              ></div>
                              <span className="font-medium">{span.name}</span>
                            </div>
                            <Badge
                              variant={
                                span.status === "running"
                                  ? "secondary"
                                  : span.status === "completed"
                                  ? "default"
                                  : span.status === "failed"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {span.status}
                            </Badge>
                          </div>

                          <div className="mt-2 text-xs text-muted-foreground">
                            <div>Start: {formatTime(span.start_time)}</div>
                            {span.end_time && (
                              <div>End: {formatTime(span.end_time)}</div>
                            )}
                            <div>
                              Duration:{" "}
                              {formatDuration(span.start_time, span.end_time)}
                            </div>
                          </div>

                          {span.attributes &&
                            Object.keys(span.attributes).length > 0 && (
                              <div className="mt-2">
                                <details className="text-xs">
                                  <summary className="font-medium cursor-pointer">
                                    Attributes
                                  </summary>
                                  <pre className="mt-1 p-2 bg-muted rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap">
                                    {JSON.stringify(span.attributes, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="hierarchy" className="mt-4">
                  <ScrollArea className="h-[calc(100vh-200px)]">
                    <SpanTree spans={hierarchicalSpans} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
