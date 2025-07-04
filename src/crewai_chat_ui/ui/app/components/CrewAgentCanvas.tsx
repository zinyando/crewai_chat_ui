import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
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
  next_tasks?: string[];
  depends_on?: string[];
}

interface Crew {
  id: string;
  name: string;
  status: "initializing" | "running" | "completed";
  started_at?: string;
  completed_at?: string;
  output?: string;
  type?: "sequential" | "hierarchical";
  execution_order?: string[];
}

// Define custom node data types
interface AgentNodeData extends Record<string, unknown> {
  id: string;
  role: string;
  name: string;
  status: "initializing" | "waiting" | "running" | "completed";
  description: string;
  associatedTasks?: Task[];
}

interface TaskNodeData extends Record<string, unknown> {
  id: string;
  description: string;
  status: "pending" | "running" | "completed";
  agent_id: string | null;
  output?: any;
  assignedAgentName?: string;
  next_tasks?: string[];
  depends_on?: string[];
}

interface CrewNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  status: "initializing" | "running" | "completed";
  started_at?: string;
  completed_at?: string;
  output?: string;
  type?: "sequential" | "hierarchical";
  execution_order?: string[];
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
  const [showTasks, setShowTasks] = useState(false);
  const [associatedTasks, setAssociatedTasks] = useState<Task[]>([]);

  // Access tasks from the data property that we'll pass in
  useEffect(() => {
    // Get tasks from the data property
    if (typedData.associatedTasks) {
      setAssociatedTasks(typedData.associatedTasks);
    } else {
      setAssociatedTasks([]);
    }
  }, [typedData.associatedTasks]);

  return (
    <div
      className={`
        border rounded-md p-2 bg-card shadow-md w-52
        ${typedData.status === "running" ? "border-green-500 border-2" : ""}
        ${typedData.status === "completed" ? "border-blue-500" : ""}
      `}
    >
      {/* Agent Header - Name and Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div
            className={`w-2.5 h-2.5 rounded-full mr-1.5 ${getStatusColor(
              typedData.status
            )}`}
          ></div>
          <h5 className="font-bold text-sm truncate max-w-[120px]">
            {typedData.name}
          </h5>
        </div>
        {typedData.status === "running" && (
          <span className="text-xs text-green-500 flex items-center">
            <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" />
            Active
          </span>
        )}
      </div>

      {/* Role - Critical Info */}
      <div className="text-xs text-muted-foreground truncate">
        {typedData.role}
      </div>

      {/* Tasks Button */}
      <div className="mt-1.5 pt-1.5 border-t border-dashed border-gray-200 dark:border-gray-700">
        <button
          className="w-full text-xs py-0.5 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded flex items-center justify-center transition-colors"
          onMouseEnter={() => setShowTasks(true)}
          onMouseLeave={() => setShowTasks(false)}
        >
          <span className="mr-1">Tasks</span>
          <span className="bg-gray-200 dark:bg-gray-700 rounded-full w-4 h-4 flex items-center justify-center text-xs">
            {associatedTasks.length}
          </span>
        </button>

        {/* Task Popup */}
        {showTasks && (
          <div className="absolute z-10 mt-1 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg w-64">
            <h6 className="text-xs font-semibold mb-1.5">Associated Tasks:</h6>
            <div className="max-h-40 overflow-y-auto">
              {associatedTasks.length > 0 ? (
                associatedTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`text-xs p-1.5 mb-1 rounded ${
                      task.status === "running"
                        ? "bg-green-50 dark:bg-green-900/20"
                        : task.status === "completed"
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "bg-gray-50 dark:bg-gray-800/50"
                    }`}
                  >
                    <div className="flex items-center">
                      <div
                        className={`w-2 h-2 rounded-full mr-1.5 ${getStatusColor(
                          task.status
                        )}`}
                      ></div>
                      <span className="truncate">{task.description}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No tasks assigned
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TaskNode = ({ data }: NodeProps) => {
  const typedData = data as TaskNodeData;
  return (
    <div
      className={`
        text-xs p-3 rounded border shadow-md
        ${
          typedData.status === "running"
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            : ""
        }
        ${
          typedData.status === "completed"
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            : ""
        }
      `}
    >
      <div className="flex items-center">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(
            typedData.status
          )}`}
        ></div>
        {typedData.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        )}
        <span className="font-medium">{typedData.description}</span>
      </div>
      {typedData.assignedAgentName && (
        <div
          className={`text-xs mt-2 ${
            typedData.status === "running"
              ? "text-green-600 font-medium"
              : "text-muted-foreground"
          }`}
        >
          Agent: {typedData.assignedAgentName}
        </div>
      )}
      {(typedData.next_tasks?.length || typedData.depends_on?.length) && (
        <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700 text-muted-foreground">
          {typedData.depends_on?.length && (
            <div className="text-xs">
              <span className="font-medium">Depends on:</span>{" "}
              {typedData.depends_on?.length}
            </div>
          )}
          {typedData.next_tasks?.length && (
            <div className="text-xs">
              <span className="font-medium">Next tasks:</span>{" "}
              {typedData.next_tasks?.length}
            </div>
          )}
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
        {typedData.type && (
          <p className="mt-1 flex items-center">
            <span className="font-medium">Type:</span>
            <span className="ml-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full capitalize">
              {typedData.type}
            </span>
          </p>
        )}
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
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        setError("Error parsing message");
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      setConnected(false);
    };

    ws.onerror = (event: Event) => {
      console.error("WebSocket error:", event);
      setError("Error occurred");
    };
  }, [crewId]);

  // Update nodes and edges when state changes
  useEffect(() => {
    if (!state?.agents?.length && !state?.crew) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Add crew node if available
    if (state.crew) {
      const crewData: CrewNodeData = {
        id: state.crew.id,
        name: state.crew.name,
        status: state.crew.status,
        started_at: state.crew.started_at,
        completed_at: state.crew.completed_at,
        output: state.crew.output,
        type: state.crew.type,
        execution_order: state.crew.execution_order,
      };

      newNodes.push({
        id: `crew-${state.crew.id}`,
        type: "crew",
        data: crewData,
        position: { x: 0, y: 50 },
        draggable: true,
        sourcePosition: Position.Bottom,
      });
    }

    // Determine the order of agents. If the crew provides `execution_order`, respect it; otherwise, keep the original array order.
    const orderedAgents: Agent[] = state.crew?.execution_order?.length
      ? state.crew.execution_order
          .map((agentId) => state.agents.find((a) => a.id === agentId))
          .filter(Boolean) as Agent[]
      : [...state.agents];

    // Add agent nodes in a vertical flow layout
    orderedAgents.forEach((agent: Agent, index: number) => {
      // Align all nodes at x = 0. React-Flow `fitView` will keep them centred in the viewport.
      const xPos = 0;
      // Stack nodes vertically with equal spacing
      const yPos = 200 + index * 150;

      // Find tasks associated with this agent
      const associatedTasks = state.tasks.filter(
        (task) => task.agent_id === agent.id
      );

      const agentData: AgentNodeData = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        description: agent.description,
        associatedTasks: associatedTasks,
      };

      newNodes.push({
        id: `agent-${agent.id}`,
        type: "agent",
        data: agentData,
        position: { x: xPos, y: yPos },
        draggable: true,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
    });

    // Create vertical flow connections between nodes
    if (state.agents.length > 0) {
      // Connect crew to first agent if crew exists
      if (state.crew && orderedAgents.length > 0) {
        const firstAgent = orderedAgents[0];
        newEdges.push({
          id: `edge-crew-${state.crew.id}-agent-${firstAgent.id}`,
          source: `crew-${state.crew.id}`,
          target: `agent-${firstAgent.id}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { strokeWidth: 1, stroke: "#666", strokeDasharray: "5,5" },
          animated: false,
        });
      }

      // Connect agents in a vertical chain (like in the screenshot)
      for (let i = 0; i < orderedAgents.length - 1; i++) {
        const sourceAgent = orderedAgents[i];
        const targetAgent = orderedAgents[i + 1];

        newEdges.push({
          id: `edge-agent-${sourceAgent.id}-agent-${targetAgent.id}`,
          source: `agent-${sourceAgent.id}`,
          target: `agent-${targetAgent.id}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { strokeWidth: 1, stroke: "#666", strokeDasharray: "5,5" },
          animated: false,
        });
      }
    }

    // Update the React Flow nodes and edges
    setNodes(newNodes);
    setEdges(newEdges);
  }, [state])

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
