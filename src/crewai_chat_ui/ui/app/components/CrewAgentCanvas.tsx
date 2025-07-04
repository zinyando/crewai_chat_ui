import React, { useEffect, useRef, useState } from "react";
import { Card } from "../components/ui/card";
import { Loader2 } from "lucide-react";

interface Agent {
  id: string;
  role: string;
  name: string;
  status: "initializing" | "waiting" | "running" | "completed";
  description: string;
}

interface Task {
  id: string;
  description: string;
  status: "pending" | "running" | "completed";
  agent_id: string | null;
  output?: any;
}

interface Crew {
  id: string;
  name: string;
  status: "initializing" | "running" | "completed";
  started_at?: string;
  completed_at?: string;
  output?: string;
}

interface VisualizationState {
  crew: Crew | null;
  agents: Agent[];
  tasks: Task[];
}

interface CrewAgentCanvasProps {
  crewId: string;
  isRunning: boolean;
}

const CrewAgentCanvas: React.FC<CrewAgentCanvasProps> = ({
  crewId,
  isRunning,
}) => {
  const [state, setState] = useState<VisualizationState>({
    crew: null,
    agents: [],
    tasks: [],
  });
  const [connected, setConnected] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Connect to WebSocket when component mounts or crewId changes
  useEffect(() => {
    if (!crewId) return;

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    console.log("Establishing WebSocket connection for crew visualization...");

    // Create a new WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/crew-visualization`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected for crew visualization");
      setConnected(true);
      setError(null);
      
      // Log the current state when connection is established
      console.log("Current state on WebSocket connection:", state);
    };

    ws.onmessage = (event) => {
      try {
        console.log("WebSocket message received:", event.data);
        const data = JSON.parse(event.data);
        console.log("Parsed WebSocket data:", data);
        
        // Check if this is a connection test message
        if (data.type === 'connection_test') {
          console.log("Received connection test message, not updating state");
          return;
        }
        
        // Check if this is real data with agents
        if (data.agents && Array.isArray(data.agents) && data.agents.length > 0) {
          console.log("Received real data with agents:", data.agents.length);
          setHasReceivedData(true);
        }
        
        console.log("Updating state with:", data);
        setState(data);
        console.log("State after update:", state); // Note: This will show the previous state due to closure
      } catch (err: any) {
        console.error("Error parsing WebSocket message:", err);
        setError(`Error parsing data: ${err.message || 'Unknown error'}`);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("Failed to connect to visualization service");
      setConnected(false);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
    };

    // Clean up WebSocket connection when component unmounts
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [crewId]);

  // Log state changes and debug rendering
  useEffect(() => {
    console.log("State updated in useEffect:", state);
    console.log("Agents length:", state?.agents?.length);
    
    if (!canvasRef.current || !state?.agents?.length) return;

    // Canvas drawing logic will be implemented here
    // For now, we'll just use the DOM-based visualization
  }, [state]);

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "initializing":
        return "bg-yellow-500";
      case "waiting":
      case "pending":
      default:
        return "bg-gray-300 dark:bg-gray-600";
    }
  };

  // Always show the component, even if not running
  // This allows us to display agents as soon as they're available

  console.log("Rendering with state:", { connected, hasReceivedData, agentsLength: state?.agents?.length });
  
  // Show loading if not connected
  if (!connected) {
    return (
      <Card className="p-6 mb-6">
        <div className="flex flex-col items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">
            Connecting to visualization service...
          </p>
        </div>
      </Card>
    );
  }
  
  // Show initializing UI if connected but haven't received real data yet
  if (!hasReceivedData) {
    return (
      <Card className="p-6 mb-6">
        <div className="flex flex-col items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">
            Crew is initializing. Visualization will appear shortly...
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 mb-6 overflow-hidden">
      <h3 className="text-lg font-semibold mb-4">
        Crew Execution Visualization
      </h3>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
              state?.crew?.status || ''
            )}`}
          ></div>
          <h3 className="text-lg font-medium">{state?.crew?.name || 'Crew'}</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Status: <span className="capitalize">{state?.crew?.status || 'unknown'}</span>
        </p>
      </div>

      {/* Agent visualization */}
      <div className="relative" ref={canvasRef}>
        <div className="flex flex-wrap gap-4 mb-6">
          {state?.agents?.map((agent, index) => (
            <div
              key={agent.id}
              className={`
                relative border rounded-lg p-4 flex-1 min-w-[200px] transition-all duration-300
                ${
                  agent.status === "running"
                    ? "shadow-lg border-blue-500 dark:border-blue-400"
                    : ""
                }
              `}
            >
              <div className="flex items-center mb-2">
                <div
                  className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
                    agent.status
                  )}`}
                ></div>
                <h4 className="font-medium">{agent.role}</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {agent.description}
              </p>
              <div className="text-xs font-medium">
                Status: <span className="capitalize">{agent.status}</span>
              </div>

              {/* Draw connection lines between agents */}
              {index < (state?.agents?.length || 0) - 1 && (
                <div className="hidden md:block absolute top-1/2 right-0 w-4 h-0.5 bg-gray-300 dark:bg-gray-600 translate-x-full"></div>
              )}
            </div>
          ))}
        </div>

        {/* Task information if available */}
        {(state?.tasks?.length || 0) > 0 && (
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Tasks</h4>
            <div className="space-y-2">
              {state?.tasks?.map((task) => {
                const assignedAgent = state?.agents?.find(
                  (a: any) => a.id === task.agent_id
                );
                return (
                  <div
                    key={task.id}
                    className={`
                      text-xs p-2 rounded border
                      ${
                        task.status === "running"
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          : ""
                      }
                      ${
                        task.status === "completed"
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : ""
                      }
                      ${
                        task.status === "pending"
                          ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                          : ""
                      }
                    `}
                  >
                    <div className="flex justify-between">
                      <div className="flex items-center">
                        <div
                          className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(
                            task.status
                          )}`}
                        ></div>
                        <span className="font-medium line-clamp-1">
                          {task.description}
                        </span>
                      </div>
                      {assignedAgent && (
                        <span className="text-muted-foreground">
                          Agent: {assignedAgent.role}
                        </span>
                      )}
                    </div>
                    {task?.status === "completed" && task?.output ? (
                      <div className="mt-1">
                        <div className="font-medium">Output:</div>
                        <div className="whitespace-pre-wrap">
                          {typeof task?.output === "string"
                            ? task.output
                            : JSON.stringify(task?.output, null, 2)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results section if crew is completed */}
        {state.crew?.status === "completed" && state.crew?.output && (
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Crew Result</h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded text-sm max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {state.crew.output}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CrewAgentCanvas;
