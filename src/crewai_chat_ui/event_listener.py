import logging
from typing import Dict, List, Any, Optional
import json
import asyncio
from datetime import datetime
from fastapi import WebSocket
from crewai.utilities.events import (
    CrewKickoffStartedEvent,
    CrewKickoffCompletedEvent,
    AgentExecutionStartedEvent,
    AgentExecutionCompletedEvent,
    TaskStartedEvent,
    TaskCompletedEvent,
)
from crewai.utilities.events.base_event_listener import BaseEventListener

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Custom JSON encoder to handle datetime objects and other custom types
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        # Handle TaskOutput objects
        if hasattr(obj, '__dict__'):
            return str(obj)
        # Try to convert to string if all else fails
        try:
            return str(obj)
        except:
            return "[Unserializable Object]"
        return super().default(obj)

class CrewVisualizationListener(BaseEventListener):
    """Event listener for visualizing crew execution in the UI."""
    
    def __init__(self):
        super().__init__()
        self.active_connections: List[WebSocket] = []
        self.crew_state: Dict[str, Any] = {}
        self.agent_states: Dict[str, Dict[str, Any]] = {}
        self.task_states: Dict[str, Dict[str, Any]] = {}
        
    async def connect(self, websocket: WebSocket):
        """Connect a new WebSocket client."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")
        # Send current state to the new client
        if self.agent_states:
            logger.info(f"Sending initial state to new client")
            await self.send_update(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket client."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining connections: {len(self.active_connections)}")
    
    async def broadcast_update(self):
        """Broadcast the current state to all connected WebSocket clients."""
        if not self.active_connections:
            logger.info("No active connections to broadcast to")
            return
            
        logger.info(f"Broadcasting update to {len(self.active_connections)} clients")
        for connection in self.active_connections.copy():
            try:
                await self.send_update(connection)
            except Exception as e:
                logger.error(f"Error broadcasting update: {str(e)}")
                # Connection might be closed, will be cleaned up in send_update
    
    async def send_update(self, websocket: WebSocket):
        """Send the current state to a specific WebSocket client."""
        update = {
            "crew": self.crew_state,
            "agents": list(self.agent_states.values()),
            "tasks": list(self.task_states.values()),
        }
        json_data = json.dumps(update, cls=CustomJSONEncoder)
        try:
            await websocket.send_text(json_data)
            logger.debug(f"Sent update to WebSocket client")
        except Exception as e:
            logger.error(f"Error sending update: {str(e)}")
            # Remove the connection if it's closed
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
                logger.info(f"Removed closed connection. Remaining: {len(self.active_connections)}")
                
    def reset_state(self):
        """Reset the state when a new crew execution starts."""
        self.crew_state = {}
        self.agent_states = {}
        self.task_states = {}
        logger.info("State reset for new crew execution")
    
    def setup_listeners(self, crewai_event_bus):
        """Set up event listeners for crew visualization."""
        
        @crewai_event_bus.on(CrewKickoffStartedEvent)
        def on_crew_kickoff_started(source, event):
            logger.info(f"Crew '{event.crew_name}' execution started")
            
            # Reset state for new execution
            self.reset_state()
            
            # Store crew information
            self.crew_state = {
                "id": str(source.id) if hasattr(source, "id") else "unknown",
                "name": event.crew_name,
                "status": "running",
                "started_at": event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else event.timestamp,
            }
            
            # Store agent information
            for agent in source.agents:
                agent_id = str(agent.id) if hasattr(agent, "id") else f"agent_{len(self.agent_states)}"
                self.agent_states[agent_id] = {
                    "id": agent_id,
                    "role": agent.role,
                    "name": agent.name if hasattr(agent, "name") else agent.role,
                    "status": "waiting",
                    "description": agent.backstory[:100] + "..." if len(agent.backstory) > 100 else agent.backstory,
                }
            
            # Store task information if available
            if hasattr(source, "tasks"):
                for i, task in enumerate(source.tasks):
                    task_id = str(task.id) if hasattr(task, "id") else f"task_{i}"
                    self.task_states[task_id] = {
                        "id": task_id,
                        "description": task.description,
                        "status": "pending",
                        "agent_id": None,  # Will be set when task is assigned
                    }
            
            # Broadcast the update asynchronously
            asyncio.create_task(self.broadcast_update())
        
        @crewai_event_bus.on(AgentExecutionStartedEvent)
        def on_agent_execution_started(source, event):
            agent = event.agent
            agent_id = str(agent.id) if hasattr(agent, "id") else None
            
            if agent_id and agent_id in self.agent_states:
                logger.info(f"Agent '{agent.role}' started execution")
                
                # Update agent status
                self.agent_states[agent_id]["status"] = "running"
                
                # If there's a task associated with this execution, update it
                if hasattr(event, "task"):
                    task = event.task
                    task_id = str(task.id) if hasattr(task, "id") else None
                    
                    if task_id and task_id in self.task_states:
                        self.task_states[task_id]["status"] = "running"
                        self.task_states[task_id]["agent_id"] = agent_id
                
                # Broadcast the update asynchronously
                asyncio.create_task(self.broadcast_update())
        
        @crewai_event_bus.on(AgentExecutionCompletedEvent)
        def on_agent_execution_completed(source, event):
            agent = event.agent
            agent_id = str(agent.id) if hasattr(agent, "id") else None
            
            if agent_id and agent_id in self.agent_states:
                logger.info(f"Agent '{agent.role}' completed execution")
                
                # Update agent status
                self.agent_states[agent_id]["status"] = "completed"
                
                # If there's a task associated with this execution, update it
                if hasattr(event, "task"):
                    task = event.task
                    task_id = str(task.id) if hasattr(task, "id") else None
                    
                    if task_id and task_id in self.task_states:
                        self.task_states[task_id]["status"] = "completed"
                
                # Broadcast the update asynchronously
                asyncio.create_task(self.broadcast_update())
        
        @crewai_event_bus.on(TaskStartedEvent)
        def on_task_started(source, event):
            task = event.task
            task_id = str(task.id) if hasattr(task, "id") else None
            
            if task_id:
                logger.info(f"Task '{task.description[:30]}...' started")
                
                # Add task to state if it doesn't exist
                if task_id not in self.task_states:
                    self.task_states[task_id] = {
                        "id": task_id,
                        "description": task.description,
                        "status": "running",
                        "agent_id": None,
                    }
                else:
                    self.task_states[task_id]["status"] = "running"
                
                # If there's an agent assigned to this task, update it
                if hasattr(task, "agent"):
                    agent = task.agent
                    agent_id = str(agent.id) if hasattr(agent, "id") else None
                    
                    if agent_id:
                        self.task_states[task_id]["agent_id"] = agent_id
                        
                        # Also update agent status if it exists
                        if agent_id in self.agent_states:
                            self.agent_states[agent_id]["status"] = "running"
                
                # Broadcast the update asynchronously
                asyncio.create_task(self.broadcast_update())
        
        @crewai_event_bus.on(TaskCompletedEvent)
        def on_task_completed(source, event):
            task = event.task
            task_id = str(task.id) if hasattr(task, "id") else None
            
            if task_id and task_id in self.task_states:
                logger.info(f"Task '{task.description[:30]}...' completed")
                
                # Update task status
                self.task_states[task_id]["status"] = "completed"
                
                # Broadcast the update asynchronously
                asyncio.create_task(self.broadcast_update())
        
        @crewai_event_bus.on(CrewKickoffCompletedEvent)
        def on_crew_kickoff_completed(source, event):
            logger.info(f"Crew '{event.crew_name}' execution completed")
            
            # Update crew status
            self.crew_state["status"] = "completed"
            self.crew_state["completed_at"] = event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else event.timestamp
            self.crew_state["output"] = event.output
            
            # Broadcast the update asynchronously
            asyncio.create_task(self.broadcast_update())

# Create a singleton instance
crew_visualization_listener = CrewVisualizationListener()
