import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card } from "../components/ui/card";
import { Loader2 } from "lucide-react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  NodeTypes,
  NodeProps,
  XYPosition
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Define domain models
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

// Define custom node data types
interface AgentNodeData extends Record<string, unknown> {
  id: string;
  role: string;
  name: string;
  status: "initializing" | "waiting" | "running" | "completed";
  description: string;
}

interface TaskNodeData extends Record<string, unknown> {
  id: string;
  description: string;
  status: "pending" | "running" | "completed";
  agent_id: string | null;
  output?: any;
  assignedAgentName?: string;
}

interface CrewNodeData extends Record<string, unknown> {
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

// Helper function for status colors
const getStatusColor = (status: string): string => {
  switch (status) {
    case "running":
      return "bg-green-500 animate-pulse";
    case "completed":
      return "bg-blue-500";
    case "initializing":
      return "bg-yellow-500 animate-pulse";
    case "waiting":
      return "bg-yellow-500";
    case "pending":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

// Custom node components
const AgentNode = ({ data }: NodeProps) => {
  const typedData = data as AgentNodeData;
  return (
    <div
      className={`
        border rounded-md p-3 bg-card w-64 shadow-md
        ${typedData.status === "running" ? "animate-pulse" : ""}
        ${typedData.status === "completed" ? "border-green-500" : ""}
      `}
    >
      <div className="flex items-center mb-2">
        <div
          className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(typedData.status)}`}
        ></div>
        <h5 className="font-medium">{typedData.name}</h5>
        {typedData.status === "running" && (
          <span className="ml-auto text-xs text-green-500 flex items-center">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Active
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{typedData.role}</p>
      <p className="text-sm text-muted-foreground">
        {typedData.description}
      </p>
      <div className="mt-2 text-xs text-muted-foreground">
        <p className="font-semibold">Role: {typedData.role}</p>
        <p className="mt-1">{typedData.description}</p>
      </div>
    </div>
  );
};

const TaskNode = ({ data }: NodeProps) => {
  const typedData = data as TaskNodeData;
  return (
    <div
      className={`
        text-xs p-2 rounded border w-48
        ${
          typedData.status === "running"
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 shadow-sm"
            : ""
        }
        ${
          typedData.status === "completed"
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            : ""
        }
        ${
          typedData.status === "pending"
            ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
            : ""
        }
      `}
    >
      <div className="flex items-center">
        <div
          className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(typedData.status)}`}
        ></div>
        {typedData.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        )}
        <span className="font-medium line-clamp-1">{typedData.description}</span>
      </div>
      {typedData.assignedAgentName && (
        <div
          className={`text-xs mt-1 ${
            typedData.status === "running"
              ? "text-green-600 font-medium"
              : "text-muted-foreground"
          }`}
        >
          Assigned to: {typedData.assignedAgentName}
          {typedData.status === "running" && " (Active)"}
        </div>
      )}
      {typedData.output && typedData.status === "completed" && (
        <div className="mt-2 p-2 bg-muted rounded-sm text-xs">
          <p className="font-semibold">Output:</p>
          <p className="whitespace-pre-wrap break-words">
            {typeof typedData.output === "string"
              ? typedData.output.length > 100
                ? `${typedData.output.substring(0, 100)}...`
                : typedData.output
              : JSON.stringify(typedData.output, null, 2)}
          </p>
        </div>
      )}
    </div>
  );
};

const CrewNode = ({ data }: NodeProps) => {
  const typedData = data as CrewNodeData;
  return (
    <div className="border rounded-md p-3 bg-card w-64 shadow-md">
      <div className="flex items-center mb-2">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            typedData.status === "initializing"
              ? "bg-yellow-500"
              : typedData.status === "running"
              ? "bg-green-500"
              : typedData.status === "completed"
              ? "bg-blue-500"
              : "bg-gray-500"
          }`}
        ></div>
        <h3 className="font-bold">{typedData.name}</h3>
      </div>
      {typedData.status === "running" && (
        <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded-full flex items-center">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Running
        </span>
      )}
      {typedData.status === "completed" && (
        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 rounded-full">
          Completed
        </span>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        {typedData.started_at && (
          <p className="mt-1">
            Started: {new Date(typedData.started_at).toLocaleString()}
          </p>
        )}
        {typedData.completed_at && (
          <p className="mt-1">
            Completed: {new Date(typedData.completed_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
};

// Define custom node types for React Flow
const nodeTypes: NodeTypes = {
  agent: AgentNode as any,
  task: TaskNode as any,
  crew: CrewNode as any,
};

const CrewAgentCanvas: React.FC<CrewAgentCanvasProps> = ({
  crewId,
  isRunning,
}) => {
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // State for visualization data
  const [state, setState] = useState<VisualizationState>({
    crew: null,
    agents: [],
    tasks: [],
  });

  // State for UI
  const [connected, setConnected] = useState<boolean>(false);
  const [hasReceivedData, setHasReceivedData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

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

      // Send the crew ID to the server
      if (crewId) {
        ws.send(JSON.stringify({ crew_id: crewId }));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        console.log("WebSocket message received:", event.data);
        const data = JSON.parse(event.data);

        // Check if this is a connection test message
        if (data.type === "connection_test") {
          console.log("Received connection test message, not updating state");
          return;
        }

        // Always set hasReceivedData to true if we receive any valid crew/agent/task data
        if (
          (data.crew && Object.keys(data.crew).length > 0) ||
          (data.agents &&
            Array.isArray(data.agents) &&
            data.agents.length > 0) ||
          (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0)
        ) {
          setHasReceivedData(true);
        }

        // Use a functional update to ensure we're working with the latest state
        setState((prevState) => {
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
            prevState.agents.forEach((agent) => agentMap.set(agent.id, agent));

            // Update or add new agents
            const updatedAgents = data.agents.map((newAgent: Agent) => {
              const existingAgent = agentMap.get(newAgent.id);
              return existingAgent
                ? { ...existingAgent, ...newAgent }
                : newAgent;
            });

            // Preserve agents that weren't in the update
            const updatedAgentIds = new Set(
              updatedAgents.map((a: Agent) => a.id)
            );
            const unchangedAgents = prevState.agents.filter(
              (a: Agent) => !updatedAgentIds.has(a.id)
            );

            newState.agents = [...unchangedAgents, ...updatedAgents];
          }

          // Update tasks by ID if provided
          if (data.tasks && Array.isArray(data.tasks)) {
            // Create a map of existing tasks by ID for faster lookup
            const taskMap = new Map();
            prevState.tasks.forEach((task) => taskMap.set(task.id, task));

            // Update or add new tasks
            const updatedTasks = data.tasks.map((newTask: Task) => {
              const existingTask = taskMap.get(newTask.id);
              return existingTask ? { ...existingTask, ...newTask } : newTask;
            });

            // Preserve tasks that weren't in the update
            const updatedTaskIds = new Set(updatedTasks.map((t: Task) => t.id));
            const unchangedTasks = prevState.tasks.filter(
              (t: Task) => !updatedTaskIds.has(t.id)
            );

            newState.tasks = [...unchangedTasks, ...updatedTasks];
          }

          return newState;
        });
      } catch (error: any) {
        console.error("Error parsing WebSocket message:", error);
        setError(`Error parsing data: ${error.message || "Unknown error"}`);
      }
    };

    ws.onerror = (event: Event) => {
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

  // Update nodes and edges when state changes
  useEffect(() => {
    if (!state?.agents?.length && !state?.crew) return;

    const newNodes: any[] = [];
    const newEdges: any[] = [];

    // Add crew node if available
    if (state.crew) {
      const crewData: CrewNodeData = {
        id: state.crew.id,
        name: state.crew.name,
        status: state.crew.status,
        started_at: state.crew.started_at,
        completed_at: state.crew.completed_at,
        output: state.crew.output,
      };

      newNodes.push({
        id: `crew-${state.crew.id}`,
        type: "crew",
        data: crewData,
        position: { x: 400, y: 50 },
        draggable: true,
      });
    }

    // Add agent nodes
    state.agents.forEach((agent: Agent, index: number) => {
      const xPos = 200 + (index % 3) * 300;
      const yPos = 200 + Math.floor(index / 3) * 150;

      const agentData: AgentNodeData = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        description: agent.description,
      };

      newNodes.push({
        id: `agent-${agent.id}`,
        type: "agent",
        data: agentData,
        position: { x: xPos, y: yPos },
        draggable: true,
      });

      if (state.crew) {
        newEdges.push({
          id: `edge-crew-${agent.id}`,
          source: `crew-${state.crew.id}`,
          target: `agent-${agent.id}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { strokeWidth: 2 },
          animated: agent.status === "running",
        });
      }
    });

    // Add task nodes
    state.tasks.forEach((task: Task, index: number) => {
      const assignedAgent = state.agents.find((a: Agent) => a.id === task.agent_id);
      const taskData: TaskNodeData = {
        id: task.id,
        description: task.description,
        status: task.status,
        agent_id: task.agent_id,
        output: task.output,
        assignedAgentName: assignedAgent?.name,
      };

      let xPos = 200 + (index % 4) * 250;
      let yPos = 400 + Math.floor(index / 4) * 150;

      if (assignedAgent) {
        const agentIndex = state.agents.findIndex(
          (a) => a.id === assignedAgent.id
        );
        const agentXPos = 200 + (agentIndex % 3) * 300;
        xPos = agentXPos + ((index % 2) * 100 - 50);
        yPos = 350 + Math.floor(index / 2) * 120;
      }

      newNodes.push({
        id: `task-${task.id}`,
        type: "task",
        data: taskData,
        position: { x: xPos, y: yPos },
        draggable: true,
      });

      if (assignedAgent) {
        newEdges.push({
          id: `edge-${assignedAgent.id}-${task.id}`,
          source: `agent-${assignedAgent.id}`,
          target: `task-${task.id}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { strokeWidth: 1.5 },
          animated: task.status === "running",
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [state, setNodes, setEdges]);

  // Handle node drag stop event
  const onNodeDragStop = useCallback((event: React.MouseEvent, node: any) => {
    console.log("Node moved:", node);
    // You could save node positions here if needed
  }, []);

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

      {/* Show loading state */}
      {isRunning && !hasReceivedData && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">
              Connecting to visualization service...
            </p>
          </div>
        </div>
      )}

      {/* Debug info in development mode */}
      {process.env.NODE_ENV === "development" && (
        <div className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
          <p>WebSocket connected: {connected ? "Yes" : "No"}</p>
          <p>Has received data: {hasReceivedData ? "Yes" : "No"}</p>
          <p>Agents: {state?.agents?.length || 0}</p>
          <p>Tasks: {state?.tasks?.length || 0}</p>
          <p>
            Running agents:{" "}
            {state?.agents?.filter((a) => a.status === "running").length || 0}
          </p>
          <p>
            Running tasks:{" "}
            {state?.tasks?.filter((t) => t.status === "running").length || 0}
          </p>
        </div>
      )}

      {/* React Flow Canvas */}
      {(hasReceivedData || !isRunning) && (
        <div
          className="h-[600px] border rounded-md overflow-hidden"
          ref={canvasRef}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
          >
            <Background color="#aaa" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
        </div>
      )}
    </Card>
  );
};

export default CrewAgentCanvas;
