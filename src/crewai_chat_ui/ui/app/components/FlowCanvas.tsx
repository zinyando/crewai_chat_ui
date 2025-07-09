import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeTypes,
  EdgeTypes,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";

// Define node types for the flow visualization
const nodeTypes: NodeTypes = {
  flowNode: FlowNode,
  stepNode: StepNode,
  outputNode: OutputNode,
};

interface FlowCanvasProps {
  flowId: string;
  isRunning: boolean;
  resetKey: number; // Key to trigger reset
}

interface FlowState {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  steps: FlowStep[];
  outputs: Record<string, any>;
  error?: string;
}

interface FlowStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error?: string;
  parent_id?: string;
  dependencies?: string[];
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// Custom node components
const FlowNode = ({ data }: { data: any }) => {
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

  return (
    <div className="px-4 py-2 shadow-md rounded-md border bg-card">
      <div className="flex flex-col">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(data.status)}`}></div>
          <div className="font-bold text-lg">{data.label}</div>
        </div>
        <div className="mt-2">
          <Badge variant={data.status === "running" ? "secondary" : 
                         data.status === "completed" ? "success" : 
                         data.status === "failed" ? "destructive" : "outline"}>
            {data.status}
          </Badge>
        </div>
      </div>
    </div>
  );
};

const StepNode = ({ data }: { data: any }) => {
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

  return (
    <div className="px-4 py-2 shadow-md rounded-md border bg-card min-w-[200px]">
      <div className="flex flex-col">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(data.status)}`}></div>
          <div className="font-bold">{data.label}</div>
        </div>
        {data.description && (
          <div className="mt-1 text-xs text-muted-foreground">
            {data.description}
          </div>
        )}
        <div className="mt-2">
          <Badge variant={data.status === "running" ? "secondary" : 
                         data.status === "completed" ? "success" : 
                         data.status === "failed" ? "destructive" : "outline"}>
            {data.status}
          </Badge>
        </div>
        {data.error && (
          <div className="mt-2 text-xs text-red-500">
            Error: {data.error}
          </div>
        )}
      </div>
    </div>
  );
};

const OutputNode = ({ data }: { data: any }) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-md border bg-card min-w-[250px]">
      <div className="flex flex-col">
        <div className="font-bold mb-2">Flow Output</div>
        <div className="text-xs overflow-auto max-h-[200px]">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(data.outputs, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

const FlowCanvas = ({ flowId, isRunning, resetKey }: FlowCanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [state, setState] = useState<FlowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset state when resetKey changes
  useEffect(() => {
    setState(null);
    setError(null);
    setNodes([]);
    setEdges([]);
    
    // Close existing socket if any
    if (socket) {
      socket.close();
      setSocket(null);
    }
  }, [resetKey, setNodes, setEdges]);

  // Connect to WebSocket when flowId changes or isRunning becomes true
  useEffect(() => {
    if (!flowId || !isRunning) return;
    
    setLoading(true);
    setError(null);

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/flow/${flowId}`;
    
    const newSocket = new WebSocket(wsUrl);
    
    newSocket.onopen = () => {
      console.log("WebSocket connected for flow:", flowId);
      setLoading(false);
    };
    
    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Flow WebSocket message:", data);
        
        if (data.type === "flow_state") {
          setState(data.payload);
        } else if (data.type === "error") {
          setError(data.message || "An error occurred during flow execution");
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };
    
    newSocket.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("Failed to connect to flow execution. Please try again.");
      setLoading(false);
    };
    
    newSocket.onclose = () => {
      console.log("WebSocket connection closed");
    };
    
    setSocket(newSocket);
    
    // Clean up on unmount
    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [flowId, isRunning, resetKey]);

  // Create nodes and edges based on flow state
  useEffect(() => {
    if (!state) return;
    
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Create flow node (main/root node)
    const flowNode: Node = {
      id: `flow-${state.id}`,
      type: "flowNode",
      position: { x: 400, y: 50 },
      data: {
        label: state.name,
        status: state.status,
        id: state.id,
      },
    };
    newNodes.push(flowNode);
    
    // Create step nodes with horizontal positioning
    const stepCount = state.steps.length;
    const stepWidth = 250;
    const totalWidth = stepCount * stepWidth;
    const startX = 400 - (totalWidth / 2) + (stepWidth / 2);
    
    state.steps.forEach((step, index) => {
      // Create step node
      const stepNode: Node = {
        id: `step-${step.id}`,
        type: "stepNode",
        position: { x: startX + (index * stepWidth), y: 200 },
        data: {
          label: step.name,
          description: step.description,
          status: step.status,
          id: step.id,
          inputs: step.inputs,
          outputs: step.outputs,
          error: step.error,
        },
      };
      newNodes.push(stepNode);
      
      // Create edge from flow to step
      newEdges.push({
        id: `flow-to-step-${step.id}`,
        source: `flow-${state.id}`,
        target: `step-${step.id}`,
        type: "smoothstep",
        animated: step.status === "running",
        style: { 
          stroke: getStatusColor(step.status),
          strokeWidth: 2 
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getStatusColor(step.status),
        },
      });
      
      // Create edges between steps based on dependencies
      if (step.dependencies && step.dependencies.length > 0) {
        step.dependencies.forEach((depId) => {
          newEdges.push({
            id: `step-${depId}-to-step-${step.id}`,
            source: `step-${depId}`,
            target: `step-${step.id}`,
            type: "smoothstep",
            animated: step.status === "running",
            style: { 
              stroke: "#ff9800", 
              strokeWidth: 2,
              strokeDasharray: "5 5" 
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#ff9800",
            },
          });
        });
      }
    });
    
    // Create output node if flow is completed
    if (state.status === "completed" && Object.keys(state.outputs || {}).length > 0) {
      const outputNode: Node = {
        id: "output-node",
        type: "outputNode",
        position: { x: 400, y: 350 },
        data: {
          outputs: state.outputs,
        },
      };
      newNodes.push(outputNode);
      
      // Create edge from flow to output
      newEdges.push({
        id: "flow-to-output",
        source: `flow-${state.id}`,
        target: "output-node",
        type: "smoothstep",
        style: { 
          stroke: "#4caf50", 
          strokeWidth: 2 
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#4caf50",
        },
      });
    }
    
    setNodes(newNodes);
    setEdges(newEdges);
  }, [state, setNodes, setEdges]);

  // Helper function to get color based on status
  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "#2196f3"; // Blue
      case "completed":
        return "#4caf50"; // Green
      case "failed":
        return "#f44336"; // Red
      default:
        return "#9e9e9e"; // Gray
    }
  };

  return (
    <div className="w-full h-[calc(100vh-180px)] border rounded-lg overflow-hidden bg-background">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">
              Connecting to flow execution...
            </p>
          </div>
        </div>
      )}
      
      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {!isRunning && !state && !loading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <h3 className="text-lg font-medium mb-2">Flow Visualization</h3>
            <p className="text-sm text-muted-foreground">
              Run the flow to see its execution visualized here.
            </p>
          </div>
        </div>
      )}
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
        <Panel position="top-right">
          <div className="bg-background border rounded-md p-2 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium">Status:</span>
              {state ? (
                <Badge variant={state.status === "running" ? "secondary" : 
                              state.status === "completed" ? "success" : 
                              state.status === "failed" ? "destructive" : "outline"}>
                  {state.status}
                </Badge>
              ) : (
                <Badge variant="outline">Not started</Badge>
              )}
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default FlowCanvas;
