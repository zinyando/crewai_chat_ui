import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "../components/ui/button";
import ReactMarkdown from "react-markdown";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  Position,
  MarkerType,
  ConnectionLineType,
  Handle,
} from "@xyflow/react";
import type { Node, Edge, NodeTypes, NodeProps } from "@xyflow/react";
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
  isFirst?: boolean;
  isLast?: boolean;
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
  resetKey?: number; // Key that changes to trigger state reset
}

// Helper function for status colors
const getStatusColor = (status: string): string => {
  switch (status) {
    case "running":
      return "bg-emerald-500 animate-pulse";
    case "completed":
      return "bg-indigo-500";
    case "initializing":
      return "bg-amber-500 animate-pulse";
    case "waiting":
      return "bg-amber-500";
    case "pending":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
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
        ${typedData.status === "running" ? "border-emerald-500 border-2" : ""}
        ${typedData.status === "completed" ? "border-indigo-500" : ""}
      `}
    >
      {!typedData.isFirst && <Handle type="target" position={Position.Top} />}
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
          <span className="text-xs text-emerald-500 flex items-center">
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
      <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-700">
        <button
          className="w-full text-xs py-0.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded flex items-center justify-center transition-colors"
          onMouseEnter={() => setShowTasks(true)}
          onMouseLeave={() => setShowTasks(false)}
        >
          <span className="mr-1">Tasks</span>
          <span className="bg-slate-200 dark:bg-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-xs">
            {associatedTasks.length}
          </span>
        </button>

        {/* Task Popup */}
        {showTasks && (
          <div className="absolute z-10 mt-1 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg w-64">
            <h6 className="text-xs font-semibold mb-1.5">Associated Tasks:</h6>
            <div className="max-h-40 overflow-y-auto">
              {associatedTasks.length > 0 ? (
                associatedTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`text-xs p-1.5 mb-1 rounded ${
                      task.status === "running"
                        ? "bg-emerald-50 dark:bg-emerald-900/20"
                        : task.status === "completed"
                        ? "bg-indigo-50 dark:bg-indigo-900/20"
                        : "bg-slate-50 dark:bg-slate-800/50"
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
      {!typedData.isLast && <Handle type="source" position={Position.Bottom} />}
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
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
            : ""
        }
        ${
          typedData.status === "completed"
            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
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
              ? "text-emerald-600 dark:text-emerald-400 font-medium"
              : "text-muted-foreground"
          }`}
        >
          Agent: {typedData.assignedAgentName}
        </div>
      )}
      {(typedData.next_tasks?.length || typedData.depends_on?.length) && (
        <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 text-muted-foreground">
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
              ? "bg-amber-500"
              : typedData.status === "running"
              ? "bg-emerald-500"
              : typedData.status === "completed"
              ? "bg-indigo-500"
              : "bg-slate-400"
          }`}
        ></div>
        <h3 className="font-bold">{typedData.name}</h3>
      </div>
      {typedData.status === "running" && (
        <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 rounded-full flex items-center">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Running
        </span>
      )}
      {typedData.status === "completed" && (
        <span className="ml-2 px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100 rounded-full">
          Completed
        </span>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        {typedData.type && (
          <p className="mt-1 flex items-center">
            <span className="font-medium">Type:</span>
            <span className="ml-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full capitalize">
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
  resetKey = 0,
}) => {
  const navigate = useNavigate();
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

  // React Flow state - Initialize with typed arrays to help TypeScript inference
  const initialNodes: Node[] = [];
  const initialEdges: Edge[] = [];
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Connect to WebSocket when component mounts or crewId changes
  useEffect(() => {
    if (!crewId) return;

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Create a new WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/crew-visualization`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected for crew visualization");
      setConnected(true);
      setError(null);
      // We don't need to send crewId, the server handles it
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connection_test") {
          console.log("Received connection test message, not updating state");
          return;
        }

        if (
          (data.crew && Object.keys(data.crew).length > 0) ||
          (data.agents &&
            Array.isArray(data.agents) &&
            data.agents.length > 0) ||
          (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0)
        ) {
          setHasReceivedData(true);
        }

        setState((prevState) => {
          // Deep copy to avoid state mutation issues
          const newState = JSON.parse(JSON.stringify(prevState));

          // Update crew
          if (data.crew) {
            newState.crew = { ...(newState.crew || {}), ...data.crew };
          }

          // Update agents using a Map for efficient merging
          if (data.agents && Array.isArray(data.agents)) {
            const agentMap = new Map(
              newState.agents.map((a: Agent) => [a.id, a])
            );
            data.agents.forEach((newAgent: Agent) => {
              agentMap.set(newAgent.id, {
                ...(agentMap.get(newAgent.id) || {}),
                ...newAgent,
              });
            });
            newState.agents = Array.from(agentMap.values());
          }

          // Update tasks using a Map for efficient merging
          if (data.tasks && Array.isArray(data.tasks)) {
            const taskMap = new Map(newState.tasks.map((t: Task) => [t.id, t]));
            data.tasks.forEach((newTask: Task) => {
              taskMap.set(newTask.id, {
                ...(taskMap.get(newTask.id) || {}),
                ...newTask,
              });
            });
            newState.tasks = Array.from(taskMap.values());
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

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [crewId]);

  // Reset state when resetKey changes
  useEffect(() => {
    if (resetKey > 0) {
      setState({
        crew: null,
        agents: [],
        tasks: [],
      });
      setHasReceivedData(false);
      setError(null);
    }
  }, [resetKey]);

  // Update nodes and edges when state changes
  useEffect(() => {
    console.log("Updating nodes and edges with state:", state);

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // 1. Crew node
    if (state.crew) {
      const crewNode: Node = {
        id: `crew-${state.crew.id}`,
        type: "crew",
        data: {
          id: state.crew.id,
          name: state.crew.name,
          status: state.crew.status,
          started_at: state.crew.started_at,
          completed_at: state.crew.completed_at,
          output: state.crew.output,
          type: state.crew.type || "sequential",
          execution_order: state.crew.execution_order || [],
        },
        position: { x: 0, y: 50 },
        draggable: true,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        connectable: true,
      };
      newNodes.push(crewNode);
    }

    // 2. Create agent nodes in vertical layout
    const sortedAgents = [...state.agents].sort((a, b) => {
      const aFirstTask = state.tasks.find((t) => t.agent_id === a.id);
      const bFirstTask = state.tasks.find((t) => t.agent_id === b.id);

      if (aFirstTask && bFirstTask) {
        return (
          state.tasks.indexOf(aFirstTask) - state.tasks.indexOf(bFirstTask)
        );
      }

      if (aFirstTask && !bFirstTask) return -1;
      if (!aFirstTask && bFirstTask) return 1;

      return state.agents.indexOf(a) - state.agents.indexOf(b);
    });

    // Agent nodes are 208px (w-52) wide, crew node is 256px (w-64).
    // To center agents under the crew node, we offset them by half the difference.
    const agentXOffset = (256 - 208) / 2;

    sortedAgents.forEach((agent, index) => {
      const yPos = 300 + index * 150;
      const associatedTasks = state.tasks.filter(
        (t) => t.agent_id === agent.id
      );

      const agentNode: Node = {
        id: `agent-${agent.id}`,
        type: "agent",
        data: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          description: agent.description,
          associatedTasks: associatedTasks,
          isFirst: index === 0,
          isLast: index === sortedAgents.length - 1,
        },
        position: { x: agentXOffset, y: yPos },
        draggable: true,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        connectable: true,
      };

      newNodes.push(agentNode);
    });

    // 3. Create edges
    // Connect agents in sequence
    for (let i = 0; i < sortedAgents.length - 1; i++) {
      const currentAgent = sortedAgents[i];
      const nextAgent = sortedAgents[i + 1];

      const sourceId = `agent-${currentAgent.id}`;
      const targetId = `agent-${nextAgent.id}`;

      // Determine edge color based on current agent status
      let edgeColor = "#64748b"; // default slate-500
      let animated = true;

      if (currentAgent.status === "completed") {
        edgeColor = "#6366f1"; // indigo-500 for completed
      } else if (currentAgent.status === "running") {
        edgeColor = "#10b981"; // emerald-500 for running
        animated = true;
      }

      const agentEdge: Edge = {
        id: `agent-${currentAgent.id}-to-${nextAgent.id}`,
        source: sourceId,
        target: targetId,
        type: "default", // Use default edge type
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
        },
        style: {
          strokeWidth: 2,
          stroke: edgeColor,
        },
        animated: animated,
      };

      newEdges.push(agentEdge);
    }

    // Update nodes and edges using the setter functions
    setNodes(newNodes);
    setEdges(newEdges);
  }, [state, setNodes, setEdges]);

  return (
    <Card className="p-6 mb-6 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Crew Execution Visualization
        </h3>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1"
          onClick={() => {
            // Use the crew ID from the state (WebSocket data) if available, otherwise fall back to the prop
            const effectiveCrewId = state.crew?.id || crewId;
            console.log(`Using crew ID for traces: ${effectiveCrewId}`);
            navigate(`/kickoff/traces?crewId=${effectiveCrewId}`);
          }}
        >
          <ExternalLink className="h-4 w-4" />
          View Traces
        </Button>
      </div>

      {error && (
        <div className="bg-rose-100 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-3 rounded-md mb-4">
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

      {/* React Flow Canvas */}
      {(hasReceivedData || !isRunning) && (
        <div
          className="h-[600px] border rounded-md overflow-hidden mb-6"
          ref={canvasRef}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            attributionPosition="bottom-right"
            defaultEdgeOptions={{
              type: "default",
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            proOptions={{ hideAttribution: true }}
            minZoom={0.5}
            maxZoom={1.5}
            elementsSelectable={true}
          >
            <Background color="#aaa" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
        </div>
      )}

      {/* Crew Results Section */}
      {state.crew?.status === "completed" && state.crew?.output && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-4">Crew Results</h3>
          <div className="p-6 rounded-lg border bg-card overflow-auto">
            <div className="text-base leading-7">
              <ReactMarkdown
                components={{
                  h1: ({ ...props }) => (
                    <h1
                      className="text-2xl font-bold mt-6 mb-4"
                      {...props}
                    />
                  ),
                  h2: ({ ...props }) => (
                    <h2
                      className="text-xl font-bold mt-5 mb-3"
                      {...props}
                    />
                  ),
                  h3: ({ ...props }) => (
                    <h3
                      className="text-lg font-bold mt-4 mb-2"
                      {...props}
                    />
                  ),
                  p: ({ ...props }) => (
                    <p className="mb-4" {...props} />
                  ),
                  ul: ({ ...props }) => (
                    <ul className="list-disc pl-6 mb-4" {...props} />
                  ),
                  ol: ({ ...props }) => (
                    <ol className="list-decimal pl-6 mb-4" {...props} />
                  ),
                  li: ({ ...props }) => (
                    <li className="mb-1" {...props} />
                  ),
                  a: ({ ...props }) => (
                    <a
                      className="text-blue-500 hover:underline"
                      {...props}
                    />
                  ),
                  blockquote: ({ ...props }) => (
                    <blockquote
                      className="border-l-4 border-muted pl-4 italic my-4"
                      {...props}
                    />
                  ),
                  code: ({ children, className, ...props }: any) => {
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
                      <pre
                        className="bg-muted p-4 rounded-md overflow-x-auto mb-4"
                      >
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                }}
              >
                {state.crew.output}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default CrewAgentCanvas;
