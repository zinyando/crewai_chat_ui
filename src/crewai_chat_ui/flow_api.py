"""
Flow API for CrewAI Chat UI

This module provides API endpoints for managing CrewAI flows.
"""

import os
from typing import Dict, List, Any, Optional
import logging
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from .flow_loader import discover_flows, load_flow, FlowInfo, FlowInput

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/flows", tags=["flows"])



# In-memory storage for flows and traces
flows_cache: Dict[str, FlowInfo] = {}
flow_traces: Dict[str, List[Dict[str, Any]]] = {}
active_flows: Dict[str, Any] = {}

# WebSocket connection management
flow_websocket_queues: Dict[str, Dict[str, asyncio.Queue]] = {}


class FlowExecuteRequest(BaseModel):
    """Request model for flow execution"""
    inputs: Dict[str, Any]


class FlowResponse(BaseModel):
    """Response model for flow information"""
    id: str
    name: str
    description: str
    required_inputs: List[FlowInput] = []


@router.on_event("startup")
async def startup_event():
    """Load flows on startup"""
    refresh_flows()


def refresh_flows():
    """Refresh the flows cache"""
    global flows_cache
    
    # Get the flows directory from environment or use current directory
    flows_dir = os.environ.get("CREWAI_FLOWS_DIR", os.getcwd())
    
    # Discover flows
    flows = discover_flows(flows_dir)
    
    # Update cache
    flows_cache = {flow.id: flow for flow in flows}
    
    logger.info(f"Loaded {len(flows_cache)} flows")

# Load flows immediately on module import to ensure cache is populated even if
# the router-level startup event is not executed (which can happen when
# FastAPI mounts routers without triggering individual router events).
refresh_flows()


@router.get("/")
@router.get("")
async def get_flows() -> Dict[str, Any]:
    """
    Get all available flows
    
    Returns:
        Dict with list of flows
    """
    flow_list = [
        {
            "id": flow.id,
            "name": flow.name,
            "description": flow.description
        }
        for flow in flows_cache.values()
    ]
    
    return {"status": "success", "flows": flow_list}


@router.get("/{flow_id}/initialize")
async def initialize_flow(flow_id: str) -> Dict[str, Any]:
    """
    Initialize a flow and get its required inputs
    
    Args:
        flow_id: ID of the flow to initialize
        
    Returns:
        Dict with flow initialization data
    """
    if flow_id not in flows_cache:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    flow_info = flows_cache[flow_id]
    
    return {
        "status": "success",
        "required_inputs": [
            {"name": input.name, "description": input.description}
            for input in flow_info.required_inputs
        ]
    }


async def _execute_flow_async(flow_id: str, inputs: Dict[str, Any]):
    """
    Execute a flow asynchronously
    
    Args:
        flow_id: ID of the flow to execute
        inputs: Input parameters for the flow
    """
    try:
        flow_info = flows_cache[flow_id]
        
        # Create a trace entry
        trace_id = f"trace_{len(flow_traces.get(flow_id, []))}"
        trace = {
            "id": trace_id,
            "flow_id": flow_id,
            "flow_name": flow_info.name,
            "status": "initializing",
            "start_time": asyncio.get_event_loop().time(),
            "nodes": {},
            "edges": [],
            "events": []
        }
        
        # Store trace
        if flow_id not in flow_traces:
            flow_traces[flow_id] = []
        flow_traces[flow_id].append(trace)
        
        # Initialize flow state for WebSocket updates
        flow_state = {
            "flow_id": flow_id,
            "status": "initializing",
            "steps": [],
            "outputs": {},
            "errors": [],
            "timestamp": asyncio.get_event_loop().time()
        }
        active_flows[flow_id] = flow_state
        
        # Send initial state update via WebSocket
        await broadcast_flow_update(flow_id, {
            "type": "flow_state",
            "payload": flow_state
        })
        
        # Load flow
        flow = load_flow(flow_info, inputs)
        
        # Update flow state to running
        flow_state["status"] = "running"
        flow_state["timestamp"] = asyncio.get_event_loop().time()
        
        # Update trace status
        trace["status"] = "running"
        trace["events"].append({
            "type": "status_change",
            "timestamp": flow_state["timestamp"],
            "data": {"status": "running"}
        })
        
        # Send running state update via WebSocket
        await broadcast_flow_update(flow_id, {
            "type": "flow_state",
            "payload": flow_state
        })
        
        # Set up step monitoring if the flow has steps
        if hasattr(flow, "steps") and flow.steps:
            flow_state["steps"] = [{
                "id": step.id if hasattr(step, "id") else f"step_{i}",
                "name": step.name if hasattr(step, "name") else f"Step {i+1}",
                "description": step.description if hasattr(step, "description") else "",
                "status": "pending",
                "dependencies": step.dependencies if hasattr(step, "dependencies") else [],
                "outputs": {}
            } for i, step in enumerate(flow.steps)]
            
            # Send steps update via WebSocket
            await broadcast_flow_update(flow_id, {
                "type": "flow_state",
                "payload": flow_state
            })
            
            # Monitor step execution if the flow has a step_started method
            if hasattr(flow, "on_step_started"):
                original_on_step_started = flow.on_step_started
                
                async def wrapped_on_step_started(step_id, **kwargs):
                    # Call original method
                    result = original_on_step_started(step_id, **kwargs)
                    
                    # Update step status
                    for step in flow_state["steps"]:
                        if step["id"] == step_id:
                            step["status"] = "running"
                            break
                    
                    flow_state["timestamp"] = asyncio.get_event_loop().time()
                    
                    # Send step update via WebSocket
                    await broadcast_flow_update(flow_id, {
                        "type": "flow_state",
                        "payload": flow_state
                    })
                    
                    return result
                
                flow.on_step_started = wrapped_on_step_started
            
            # Monitor step completion if the flow has a step_completed method
            if hasattr(flow, "on_step_completed"):
                original_on_step_completed = flow.on_step_completed
                
                async def wrapped_on_step_completed(step_id, outputs, **kwargs):
                    # Call original method
                    result = original_on_step_completed(step_id, outputs, **kwargs)
                    
                    # Update step status and outputs
                    for step in flow_state["steps"]:
                        if step["id"] == step_id:
                            step["status"] = "completed"
                            step["outputs"] = outputs
                            break
                    
                    flow_state["timestamp"] = asyncio.get_event_loop().time()
                    
                    # Send step update via WebSocket
                    await broadcast_flow_update(flow_id, {
                        "type": "flow_state",
                        "payload": flow_state
                    })
                    
                    return result
                
                flow.on_step_completed = wrapped_on_step_completed
        
        # Execute flow
        result = await flow.run_async() if hasattr(flow, "run_async") else flow.run()
        
        # Update flow state with results
        flow_state["status"] = "completed"
        flow_state["outputs"] = result
        flow_state["timestamp"] = asyncio.get_event_loop().time()
        
        # Update trace with results
        trace["status"] = "completed"
        trace["end_time"] = flow_state["timestamp"]
        trace["output"] = result
        trace["events"].append({
            "type": "status_change",
            "timestamp": trace["end_time"],
            "data": {"status": "completed"}
        })
        
        # Send final state update via WebSocket
        await broadcast_flow_update(flow_id, {
            "type": "flow_state",
            "payload": flow_state
        })
        
        # Clean up
        if flow_id in active_flows:
            del active_flows[flow_id]
        
        return result
    
    except Exception as e:
        logger.error(f"Error executing flow {flow_id}: {str(e)}")
        
        # Update flow state with error
        if flow_id in active_flows:
            flow_state = active_flows[flow_id]
            flow_state["status"] = "failed"
            flow_state["errors"].append(str(e))
            flow_state["timestamp"] = asyncio.get_event_loop().time()
            
            # Send error update via WebSocket
            await broadcast_flow_update(flow_id, {
                "type": "flow_state",
                "payload": flow_state
            })
        
        # Update trace with error
        if flow_id in flow_traces and flow_traces[flow_id]:
            trace = flow_traces[flow_id][-1]
            trace["status"] = "failed"
            trace["end_time"] = asyncio.get_event_loop().time()
            trace["error"] = str(e)
            trace["events"].append({
                "type": "error",
                "timestamp": trace["end_time"],
                "data": {"error": str(e)}
            })
        
        # Clean up
        if flow_id in active_flows:
            del active_flows[flow_id]
        
        raise


@router.post("/{flow_id}/execute")
async def execute_flow(
    flow_id: str, 
    request: FlowExecuteRequest,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """
    Execute a flow with the provided inputs
    
    Args:
        flow_id: ID of the flow to execute
        request: Flow execution request with inputs
        
    Returns:
        Dict with execution status
    """
    if flow_id not in flows_cache:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    try:
        # Start flow execution in background
        background_tasks.add_task(_execute_flow_async, flow_id, request.inputs)
        
        return {
            "status": "success",
            "detail": f"Flow {flow_id} execution started"
        }
    
    except Exception as e:
        logger.error(f"Error starting flow execution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error starting flow execution: {str(e)}")


@router.get("/{flow_id}/traces")
async def get_flow_traces(flow_id: str):
    """
    Get execution traces for a flow
    
    Args:
        flow_id: ID of the flow
        
    Returns:
        List of trace objects
    """
    if flow_id not in flow_traces:
        return {"status": "success", "traces": []}
    
    return {"status": "success", "traces": flow_traces[flow_id]}


@router.get("/{flow_id}/structure")
async def get_flow_structure(flow_id: str):
    """
    Get the structure of a flow for visualization
    
    Args:
        flow_id: ID of the flow
        
    Returns:
        Dict with flow structure information
    """
    if flow_id not in flows_cache:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    flow_info = flows_cache[flow_id]
    
    try:
        # Load the flow class without instantiating it
        flow_class = flow_info.flow_class
        
        # Extract methods from the flow class
        methods = []
        dependencies = {}
        
        # Get all methods that are steps
        step_methods = []
        if hasattr(flow_class, "steps") and isinstance(flow_class.steps, list):
            step_methods = [step.__name__ if hasattr(step, "__name__") else str(step) 
                          for step in flow_class.steps]
        
        # Extract methods and their dependencies
        for name in dir(flow_class):
            # Skip private methods and properties
            if name.startswith("_") or name in ["steps", "run", "run_async"]:
                continue
                
            attr = getattr(flow_class, name)
            if callable(attr):
                # Check if this is a step method
                is_step = name in step_methods
                
                # Get method dependencies if available
                method_deps = []
                if hasattr(attr, "dependencies"):
                    method_deps = attr.dependencies
                
                methods.append({
                    "id": name,
                    "name": name.replace("_", " ").title(),
                    "description": attr.__doc__.strip() if attr.__doc__ else "",
                    "is_step": is_step,
                    "dependencies": method_deps
                })
                
                dependencies[name] = method_deps
        
        # Return the flow structure
        return {
            "status": "success",
            "flow": {
                "id": flow_info.id,
                "name": flow_info.name,
                "description": flow_info.description,
                "methods": methods
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting flow structure: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting flow structure: {str(e)}")



# WebSocket management functions
def register_websocket_queue(flow_id: str, connection_id: str, queue: asyncio.Queue):
    """
    Register a WebSocket connection queue for a flow
    
    Args:
        flow_id: ID of the flow
        connection_id: Unique ID for the WebSocket connection
        queue: Asyncio queue for sending messages to the WebSocket
    """
    if flow_id not in flow_websocket_queues:
        flow_websocket_queues[flow_id] = {}
    
    flow_websocket_queues[flow_id][connection_id] = queue
    logger.info(f"Registered WebSocket connection {connection_id} for flow {flow_id}")


def unregister_websocket_queue(flow_id: str, connection_id: str):
    """
    Unregister a WebSocket connection queue for a flow
    
    Args:
        flow_id: ID of the flow
        connection_id: Unique ID for the WebSocket connection
    """
    if flow_id in flow_websocket_queues and connection_id in flow_websocket_queues[flow_id]:
        del flow_websocket_queues[flow_id][connection_id]
        logger.info(f"Unregistered WebSocket connection {connection_id} for flow {flow_id}")
        
        # Clean up empty flow entries
        if not flow_websocket_queues[flow_id]:
            del flow_websocket_queues[flow_id]


async def broadcast_flow_update(flow_id: str, message: Dict[str, Any]):
    """
    Broadcast a message to all WebSocket connections for a flow
    
    Args:
        flow_id: ID of the flow
        message: Message to broadcast
    """
    if flow_id not in flow_websocket_queues:
        return
    
    for connection_id, queue in flow_websocket_queues[flow_id].items():
        try:
            await queue.put(message)
            logger.debug(f"Sent message to WebSocket connection {connection_id} for flow {flow_id}")
        except Exception as e:
            logger.error(f"Error sending message to WebSocket connection {connection_id}: {str(e)}")


def get_active_execution(flow_id: str):
    """
    Get the active flow execution for a flow ID
    
    Args:
        flow_id: ID of the flow
        
    Returns:
        Active flow execution or None if not found
    """
    return active_flows.get(flow_id)


def is_execution_active(flow_id: str) -> bool:
    """
    Check if a flow execution is active
    
    Args:
        flow_id: ID of the flow
        
    Returns:
        True if the flow execution is active, False otherwise
    """
    return flow_id in active_flows


def get_flow_state(flow_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the current state of a flow execution
    
    Args:
        flow_id: ID of the flow
        
    Returns:
        Current state of the flow execution or None if not found
    """
    if flow_id not in active_flows:
        return None
    
    flow_execution = active_flows[flow_id]
    
    # Extract relevant state information from the flow execution
    return {
        "flow_id": flow_id,
        "status": flow_execution.get("status", "unknown"),
        "steps": flow_execution.get("steps", []),
        "outputs": flow_execution.get("outputs", {}),
        "errors": flow_execution.get("errors", []),
        "timestamp": flow_execution.get("timestamp")
    }
