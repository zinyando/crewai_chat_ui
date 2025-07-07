"""
Telemetry service for CrewAI Chat UI using OpenTelemetry.

This module provides OpenTelemetry integration for tracing CrewAI executions.
"""
import logging
import json
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
import uuid

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.trace.span import Span
# AI SpanAttributes not available in this version of OpenTelemetry
from opentelemetry.semconv.trace import SpanAttributes

# Configure logging
logger = logging.getLogger(__name__)

# In-memory storage for traces
traces_storage: Dict[str, Dict[str, Any]] = {}

class CrewAITelemetry:
    """Telemetry service for CrewAI executions."""
    
    def __init__(self):
        """Initialize the telemetry service."""
        # Set up the tracer provider
        resource = Resource.create({"service.name": "crewai-chat-ui"})
        trace.set_tracer_provider(TracerProvider(resource=resource))
        
        # Add console exporter for debugging
        console_exporter = ConsoleSpanExporter()
        trace.get_tracer_provider().add_span_processor(
            BatchSpanProcessor(console_exporter)
        )
        
        # Try to set up OTLP exporter if endpoint is available
        # Check if collector is available before attempting to connect
        import socket
        collector_available = False
        try:
            # Try to connect to the collector with a short timeout
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)  # 100ms timeout
            s.connect(('localhost', 4318))
            s.close()
            collector_available = True
        except (socket.timeout, socket.error, ConnectionRefusedError):
            logger.info("OpenTelemetry collector not available at localhost:4318, using console exporter only")
        
        if collector_available:
            try:
                otlp_exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
                trace.get_tracer_provider().add_span_processor(
                    BatchSpanProcessor(otlp_exporter)
                )
                logger.info("Successfully connected to OpenTelemetry collector")
            except Exception as e:
                logger.warning(f"Failed to set up OTLP exporter: {e}")
        
        self.tracer = trace.get_tracer("crewai.telemetry")
        self.active_spans: Dict[str, Span] = {}
        
    def start_crew_trace(self, crew_id: str, crew_name: str) -> str:
        """Start a new trace for a crew execution.
        
        Args:
            crew_id: The ID of the crew
            crew_name: The name of the crew
            
        Returns:
            The ID of the trace
        """
        # Ensure crew_id is a string
        crew_id = str(crew_id).strip()
        
        logger.info(f"Starting trace for crew_id: {crew_id}, crew_name: {crew_name}")
        logger.info(f"Current traces in storage: {len(traces_storage)}")
        
        trace_id = str(uuid.uuid4())
        with self.tracer.start_as_current_span(
            name=f"crew.execute.{crew_name}",
            attributes={
                "llm.workflow.name": crew_name,
                "llm.workflow.id": crew_id,
                "crew.id": crew_id,
                "crew.name": crew_name,
            },
        ) as span:
            span_context = span.get_span_context()
            trace_id = format(span_context.trace_id, "032x")
            
            # Store the trace in memory
            traces_storage[trace_id] = {
                "id": trace_id,
                "crew_id": crew_id,
                "crew_name": crew_name,
                "start_time": datetime.utcnow().isoformat(),
                "status": "running",
                "events": [],
                "agents": {},
                "tasks": {},
            }
            
            # Store the active span
            self.active_spans[crew_id] = span
            
            logger.info(f"Started trace with ID: {trace_id} for crew_id: {crew_id}")
            logger.info(f"Total traces in storage: {len(traces_storage)}")
        return trace_id
    
    def end_crew_trace(self, crew_id: str, output: Any = None):
        """End a trace for a crew execution.
        
        Args:
            crew_id: The ID of the crew
            output: The output of the crew execution
        """
        # Ensure crew_id is a string
        crew_id = str(crew_id).strip()
        
        logger.info(f"Ending trace for crew_id: {crew_id}")
        
        # Find the trace for this crew - try exact match first
        trace_id = None
        for tid, trace in traces_storage.items():
            if trace.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        # If no exact match, try case-insensitive comparison
        if not trace_id:
            normalized_crew_id = crew_id.lower()
            for tid, trace in traces_storage.items():
                if trace.get("crew_id") and str(trace.get("crew_id")).strip().lower() == normalized_crew_id:
                    trace_id = tid
                    # Update the crew_id to match the one we're using now for consistency
                    traces_storage[tid]["crew_id"] = crew_id
                    logger.info(f"Found trace with case-insensitive match, updated crew_id to: {crew_id}")
                    break
        
        if not trace_id:
            logger.error(f"No trace found for crew_id: {crew_id}")
            return
        
        logger.info(f"Found trace with ID: {trace_id} for crew_id: {crew_id}")
        
        # Update the trace with the output
        if output:
            try:
                output_text = output.raw if hasattr(output, 'raw') else str(output)
                logger.info(f"Output length: {len(output_text) if output_text else 0}")
                traces_storage[trace_id]["output"] = output_text
            except Exception as e:
                logger.warning(f"Failed to convert output to string: {e}")
                traces_storage[trace_id]["output"] = "Output conversion failed"
        
        # Mark the trace as completed
        traces_storage[trace_id]["status"] = "completed"
        traces_storage[trace_id]["end_time"] = datetime.utcnow().isoformat()
        
        # End the span if it exists
        if crew_id in self.active_spans:
            self.active_spans[crew_id].end()
            del self.active_spans[crew_id]
        
        logger.info(f"Completed trace with ID: {trace_id} for crew_id: {crew_id}")
    
    def start_agent_execution(self, crew_id: str, agent_id: str, agent_name: str, agent_role: str):
        """Start tracing an agent execution.
        
        Args:
            crew_id: The ID of the crew
            agent_id: The ID of the agent
            agent_name: The name of the agent
            agent_role: The role of the agent
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Add the agent to the trace
        if agent_id not in traces_storage[trace_id]["agents"]:
            traces_storage[trace_id]["agents"][agent_id] = {
                "id": agent_id,
                "name": agent_name,
                "role": agent_role,
                "status": "running",
                "start_time": datetime.utcnow().isoformat(),
                "events": []
            }
        else:
            # Update the agent status
            traces_storage[trace_id]["agents"][agent_id]["status"] = "running"
            traces_storage[trace_id]["agents"][agent_id]["start_time"] = datetime.utcnow().isoformat()
        
        # Add an event
        self.add_event(crew_id, "agent.started", {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "agent_role": agent_role,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Create a span for the agent execution
        parent_span = self.active_spans.get(crew_id)
        if parent_span:
            with self.tracer.start_as_current_span(
                name=f"agent.execute.{agent_role}",
                attributes={
                    "llm.user.role": agent_role,
                    "llm.user.id": agent_id,
                    "agent.id": agent_id,
                    "agent.name": agent_name,
                    "agent.role": agent_role,
                },
            ) as span:
                # Store the active span
                self.active_spans[agent_id] = span
    
    def end_agent_execution(self, crew_id: str, agent_id: str, output: Any = None):
        """End tracing an agent execution.
        
        Args:
            crew_id: The ID of the crew
            agent_id: The ID of the agent
            output: The output of the agent execution
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Update the agent status
        if agent_id in traces_storage[trace_id]["agents"]:
            traces_storage[trace_id]["agents"][agent_id]["status"] = "completed"
            traces_storage[trace_id]["agents"][agent_id]["end_time"] = datetime.utcnow().isoformat()
            
            # Add the output
            if output:
                try:
                    # Try to convert to string if it's not already
                    if not isinstance(output, str):
                        output_str = str(output)
                    else:
                        output_str = output
                        
                    traces_storage[trace_id]["agents"][agent_id]["output"] = output_str
                except Exception as e:
                    logger.warning(f"Failed to convert output to string: {e}")
                    traces_storage[trace_id]["agents"][agent_id]["output"] = "Output conversion failed"
        
        # Add an event
        self.add_event(crew_id, "agent.completed", {
            "agent_id": agent_id,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # End the span
        if agent_id in self.active_spans:
            self.active_spans[agent_id].end()
            del self.active_spans[agent_id]
    
    def start_task_execution(self, crew_id: str, task_id: str, task_description: str, agent_id: Optional[str] = None):
        """Start tracing a task execution.
        
        Args:
            crew_id: The ID of the crew
            task_id: The ID of the task
            task_description: The description of the task
            agent_id: The ID of the agent executing the task
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Add the task to the trace
        if task_id not in traces_storage[trace_id]["tasks"]:
            traces_storage[trace_id]["tasks"][task_id] = {
                "id": task_id,
                "description": task_description,
                "agent_id": agent_id,
                "status": "running",
                "start_time": datetime.utcnow().isoformat(),
                "events": []
            }
        else:
            # Update the task status
            traces_storage[trace_id]["tasks"][task_id]["status"] = "running"
            traces_storage[trace_id]["tasks"][task_id]["start_time"] = datetime.utcnow().isoformat()
            
            # Update the agent ID if provided
            if agent_id:
                traces_storage[trace_id]["tasks"][task_id]["agent_id"] = agent_id
        
        # Add an event
        self.add_event(crew_id, "task.started", {
            "task_id": task_id,
            "task_description": task_description,
            "agent_id": agent_id,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Create a span for the task execution
        parent_span = self.active_spans.get(agent_id) if agent_id else self.active_spans.get(crew_id)
        if parent_span:
            with self.tracer.start_as_current_span(
                name=f"task.execute",
                attributes={
                    "task.id": task_id,
                    "task.description": task_description,
                    "agent.id": agent_id if agent_id else "unknown",
                },
            ) as span:
                # Store the active span
                self.active_spans[task_id] = span
    
    def end_task_execution(self, crew_id: str, task_id: str, output: Any = None):
        """End tracing a task execution.
        
        Args:
            crew_id: The ID of the crew
            task_id: The ID of the task
            output: The output of the task execution
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Update the task status
        if task_id in traces_storage[trace_id]["tasks"]:
            traces_storage[trace_id]["tasks"][task_id]["status"] = "completed"
            traces_storage[trace_id]["tasks"][task_id]["end_time"] = datetime.utcnow().isoformat()
            
            # Add the output
            if output:
                try:
                    # Try to convert to string if it's not already
                    if not isinstance(output, str):
                        output_str = str(output)
                    else:
                        output_str = output
                        
                    traces_storage[trace_id]["tasks"][task_id]["output"] = output_str
                except Exception as e:
                    logger.warning(f"Failed to convert output to string: {e}")
                    traces_storage[trace_id]["tasks"][task_id]["output"] = "Output conversion failed"
        
        # Add an event
        self.add_event(crew_id, "task.completed", {
            "task_id": task_id,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # End the span
        if task_id in self.active_spans:
            self.active_spans[task_id].end()
            del self.active_spans[task_id]
    
    def trace_tool_execution(self, crew_id: str, agent_id: Optional[str], tool_name: str, inputs: Dict[str, Any], output: Any = None):
        """Trace a tool execution.
        
        Args:
            crew_id: The ID of the crew
            agent_id: The ID of the agent executing the tool
            tool_name: The name of the tool
            inputs: The inputs to the tool
            output: The output of the tool execution
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Add an event
        event_data = {
            "tool_name": tool_name,
            "inputs": inputs,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if agent_id:
            event_data["agent_id"] = agent_id
            
        if output:
            try:
                # Try to convert to string if it's not already
                if not isinstance(output, str):
                    output_str = str(output)
                else:
                    output_str = output
                    
                event_data["output"] = output_str
            except Exception as e:
                logger.warning(f"Failed to convert output to string: {e}")
                event_data["output"] = "Output conversion failed"
        
        self.add_event(crew_id, "tool.executed", event_data)
        
        # Create a span for the tool execution
        parent_span = None
        if agent_id and agent_id in self.active_spans:
            parent_span = self.active_spans[agent_id]
        elif crew_id in self.active_spans:
            parent_span = self.active_spans[crew_id]
            
        if parent_span:
            with self.tracer.start_as_current_span(
                name=f"tool.execute.{tool_name}",
                attributes={
                    "tool.name": tool_name,
                    "tool.inputs": json.dumps(inputs),
                    "agent.id": agent_id if agent_id else "unknown",
                },
            ) as span:
                # Add the output to the span
                if output:
                    try:
                        if isinstance(output, str):
                            span.set_attribute("tool.output", output)
                        else:
                            span.set_attribute("tool.output", str(output))
                    except Exception:
                        span.set_attribute("tool.output", "Output conversion failed")
    
    def add_event(self, crew_id: str, event_type: str, event_data: Dict[str, Any]):
        """Add an event to a trace.
        
        Args:
            crew_id: The ID of the crew
            event_type: The type of event
            event_data: The event data
        """
        # Find the trace for this crew
        trace_id = None
        for tid, trace_data in traces_storage.items():
            if trace_data.get("crew_id") == crew_id:
                trace_id = tid
                break
        
        if not trace_id:
            logger.warning(f"No trace found for crew {crew_id}")
            return
        
        # Add the event to the trace
        event = {
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": event_data
        }
        traces_storage[trace_id]["events"].append(event)
        
        # If the event is related to an agent, add it to the agent's events
        if "agent_id" in event_data and event_data["agent_id"] in traces_storage[trace_id]["agents"]:
            traces_storage[trace_id]["agents"][event_data["agent_id"]]["events"].append(event)
        
        # If the event is related to a task, add it to the task's events
        if "task_id" in event_data and event_data["task_id"] in traces_storage[trace_id]["tasks"]:
            traces_storage[trace_id]["tasks"][event_data["task_id"]]["events"].append(event)
    
    def get_traces(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get the most recent traces.
        
        Args:
            limit: The maximum number of traces to return
            
        Returns:
            A list of traces
        """
        # Sort traces by start time (newest first)
        sorted_traces = sorted(
            traces_storage.values(),
            key=lambda t: t.get("start_time", ""),
            reverse=True
        )
        
        # Return the most recent traces
        return sorted_traces[:limit]
    
    def get_trace(self, trace_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific trace by ID.
        
        Args:
            trace_id: The ID of the trace
            
        Returns:
            The trace data or None if not found
        """
        return traces_storage.get(trace_id)
    
    def get_traces_for_crew(self, crew_id: str) -> List[Dict[str, Any]]:
        """Get all traces for a specific crew.
        
        Args:
            crew_id: The ID of the crew
            
        Returns:
            A list of traces for the crew
        """
        logger.info(f"Looking for traces with crew_id: {crew_id}")
        logger.info(f"Current traces in storage: {len(traces_storage)}")
        
        # Normalize the crew ID for comparison
        normalized_crew_id = str(crew_id).strip().lower()
        
        # Debug: Log all crew IDs in storage
        all_crew_ids = set(trace.get("crew_id") for trace in traces_storage.values())
        logger.info(f"Available crew IDs in storage: {all_crew_ids}")
        
        # Try exact match first
        traces = [
            trace for trace in traces_storage.values()
            if trace.get("crew_id") == crew_id
        ]
        
        # If no exact matches, try case-insensitive comparison
        if not traces:
            logger.info(f"No exact matches found, trying case-insensitive comparison for: {crew_id}")
            traces = [
                trace for trace in traces_storage.values()
                if trace.get("crew_id") and str(trace.get("crew_id")).strip().lower() == normalized_crew_id
            ]
            
        # If still no matches and crew_id looks like a simple name (e.g., "crew_0"), try to find any trace
        # that might contain this as part of the crew name
        if not traces and ("_" in crew_id or crew_id.isalnum()):
            logger.info(f"No matches found, trying to match by crew name pattern: {crew_id}")
            traces = [
                trace for trace in traces_storage.values()
                if trace.get("crew_name") and crew_id.lower() in str(trace.get("crew_name")).lower()
            ]
            
            # If we found traces by name pattern, log this information
            if traces:
                logger.info(f"Found {len(traces)} traces by matching crew name pattern: {crew_id}")
                # Log the actual crew IDs that were matched
                matched_ids = set(trace.get("crew_id") for trace in traces)
                logger.info(f"Matched crew IDs: {matched_ids}")
        
        logger.info(f"Found {len(traces)} traces for crew_id: {crew_id}")
        return traces

# Create a singleton instance
telemetry_service = CrewAITelemetry()
