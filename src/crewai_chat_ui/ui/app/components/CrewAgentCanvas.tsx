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
        
        // Always set hasReceivedData to true if we receive any valid crew/agent/task data
        // This ensures we show the visualization as soon as possible
        if ((data.crew && Object.keys(data.crew).length > 0) || 
            (data.agents && Array.isArray(data.agents) && data.agents.length > 0) || 
            (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0)) {
          console.log("Received valid crew/agent/task data");
          setHasReceivedData(true);
        }
        
        console.log("Updating state with:", data);
        // Use a functional update to ensure we're working with the latest state
        setState(prevState => {
          // Create a deep merge of the state
          const newState = { ...prevState };
          
          // Update crew if provided
          if (data.crew) {
            newState.crew = { ...prevState.crew, ...data.crew };
          }
          
          // Update agents by ID if provided
          if (data.agents && Array.isArray(data.agents)) {
            // Create a map of existing agents by ID for faster lookup
            const agentMap = new Map();
            prevState.agents.forEach(agent => agentMap.set(agent.id, agent));
            
            // Update or add new agents
            const updatedAgents = data.agents.map((newAgent: Agent) => {
              const existingAgent = agentMap.get(newAgent.id);
              return existingAgent ? { ...existingAgent, ...newAgent } : newAgent;
            });
            
            // Preserve agents that weren't in the update
            const updatedAgentIds = new Set(updatedAgents.map((a: Agent) => a.id));
            const unchangedAgents = prevState.agents.filter((a: Agent) => !updatedAgentIds.has(a.id));
            
            newState.agents = [...unchangedAgents, ...updatedAgents];
          }
          
          // Update tasks by ID if provided
          if (data.tasks && Array.isArray(data.tasks)) {
            // Create a map of existing tasks by ID for faster lookup
            const taskMap = new Map();
            prevState.tasks.forEach(task => taskMap.set(task.id, task));
            
            // Update or add new tasks
            const updatedTasks = data.tasks.map((newTask: Task) => {
              const existingTask = taskMap.get(newTask.id);
              return existingTask ? { ...existingTask, ...newTask } : newTask;
            });
            
            // Preserve tasks that weren't in the update
            const updatedTaskIds = new Set(updatedTasks.map((t: Task) => t.id));
            const unchangedTasks = prevState.tasks.filter((t: Task) => !updatedTaskIds.has(t.id));
            
            newState.tasks = [...unchangedTasks, ...updatedTasks];
          }
          
          console.log("State after deep merge:", newState);
          return newState;
        });
        
        // We can't log the updated state here as it won't be updated until the next render
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
    switch (status?.toLowerCase()) {
      case 'running':
        return 'bg-green-500 animate-pulse';
      case 'completed':
        return 'bg-blue-500';
      case 'initializing':
        return 'bg-yellow-500 animate-pulse';
      case 'pending':
        return 'bg-gray-400';
      case 'waiting':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
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

      <div className="mb-6">
        <div className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
              state?.crew?.status || ''
            )}`}
          ></div>
          <h3 className="text-lg font-medium">{state?.crew?.name || 'Crew'}</h3>
          {state?.crew?.status === 'running' && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded-full flex items-center">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Running
            </span>
          )}
          {state?.crew?.status === 'completed' && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 rounded-full">
              Completed
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Status: <span className="capitalize">{state?.crew?.status || 'unknown'}</span>
          {state?.crew?.started_at && (
            <span className="ml-2">Started: {new Date(state.crew.started_at).toLocaleTimeString()}</span>
          )}
          {state?.crew?.completed_at && (
            <span className="ml-2">Completed: {new Date(state.crew.completed_at).toLocaleTimeString()}</span>
          )}
        </p>
        {/* Add debug info in development mode */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
            <p>WebSocket connected: {connected ? 'Yes' : 'No'}</p>
            <p>Has received data: {hasReceivedData ? 'Yes' : 'No'}</p>
            <p>Agents: {state?.agents?.length || 0}</p>
            <p>Tasks: {state?.tasks?.length || 0}</p>
            <p>Running agents: {state?.agents?.filter(a => a.status === 'running').length || 0}</p>
            <p>Running tasks: {state?.tasks?.filter(t => t.status === 'running').length || 0}</p>
          </div>
        )}
      </div>

      {/* Agent visualization */}
      <div className="relative" ref={canvasRef}>
        <div className="flex flex-wrap gap-4 mb-6">
          {state?.agents?.map((agent) => (
            <div
              key={agent.id}
              className={`border rounded-md p-3 bg-card ${agent.status === 'running' ? 'border-green-500 shadow-md' : ''}`}
            >
              <div className="flex items-center mb-2">
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(
                    agent.status
                  )}`}
                ></div>
                <h5 className="font-medium">{agent.name}</h5>
                {agent.status === 'running' && (
                  <span className="ml-auto text-xs text-green-500 flex items-center">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{agent.role}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {agent.description}
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                Status: <span className={agent.status === 'running' ? 'text-green-500 font-medium' : ''}>{agent.status}</span>
              </div>
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
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 shadow-sm animate-pulse"
                          : ""
                      }
                      ${
                        task.status === "completed"
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
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
                        {task.status === "running" && (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        )}
                        <span className="font-medium line-clamp-1">
                          {task.description}
                        </span>
                      </div>
                      {assignedAgent && (
                        <div className={`text-xs mt-1 ${task.status === 'running' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          Assigned to: {assignedAgent.name}
                          {task.status === 'running' && ' (Active)'}
                        </div>
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
