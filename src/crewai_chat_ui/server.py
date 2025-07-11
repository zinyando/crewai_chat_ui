import json
import logging
import os
import sys
import datetime
import uuid
from pathlib import Path
import threading
from typing import Dict, Optional, List, Any
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import click
import socket
import asyncio
import importlib
import inspect
from crewai_chat_ui.tool_loader import discover_available_tools

# Configure logging
logging.basicConfig(
    level=logging.WARNING, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Suppress Werkzeug logging
log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

# Load environment variables from a .env file if present
try:
    from dotenv import load_dotenv, find_dotenv

    env_path = find_dotenv(usecwd=True)
    if env_path:
        load_dotenv(env_path, override=False)
        logging.getLogger(__name__).info(
            "Environment variables loaded from %s", env_path
        )
    else:
        logging.getLogger(__name__).warning(
            "No .env file found when initialising server"
        )
except ImportError:
    # python-dotenv not installed; proceed without loading
    pass

from crewai_chat_ui.crew_loader import (
    load_crew,
    load_crew_from_module,
    discover_available_crews,
)
from crewai_chat_ui.chat_handler import ChatHandler
from crewai_chat_ui.event_listener import crew_visualization_listener
from crewai_chat_ui.tool_loader import discover_available_tools as discover_tools
from crewai_chat_ui.telemetry import telemetry_service
from crewai_chat_ui.flow_api import router as flow_router, get_active_execution

# Create FastAPI app
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the flow API router
app.include_router(flow_router)


# Telemetry API endpoints
@app.get("/api/traces")
async def get_traces(limit: int = 10):
    """Get the most recent traces."""
    return telemetry_service.get_traces(limit=limit)


@app.get("/api/traces/{trace_id}")
async def get_trace(trace_id: str):
    """Get a specific trace by ID."""
    trace = telemetry_service.get_trace(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@app.get("/api/crews/{crew_id}/traces")
async def get_crew_traces(crew_id: str):
    """Get all traces for a specific crew."""
    logging.info(f"API: Fetching traces for crew_id: {crew_id}")

    # Debug: Check what traces are available
    all_traces = telemetry_service.get_traces(limit=100)
    logging.info(f"API: Total traces available: {len(all_traces)}")

    # Get traces for this specific crew
    crew_traces = telemetry_service.get_traces_for_crew(crew_id)
    logging.info(f"API: Found {len(crew_traces)} traces for crew_id: {crew_id}")

    return crew_traces


# Get the directory containing the built React app
ui_dir = Path(__file__).parent / "ui" / "build" / "client"

# Mount the static files from the React build
app.mount("/assets", StaticFiles(directory=str(ui_dir / "assets")), name="assets")

# Global state
chat_handler = None
chat_handlers: Dict[str, ChatHandler] = {}
chat_threads: Dict[str, Dict[str, List]] = {}
discovered_crews: List[Dict] = []


# Pydantic models for request/response validation
class ChatMessage(BaseModel):
    message: str
    crew_id: Optional[str] = None
    chat_id: Optional[str] = None


class InitializeRequest(BaseModel):
    crew_id: Optional[str] = None
    chat_id: Optional[str] = None


class KickoffRequest(BaseModel):
    inputs: Optional[Dict[str, str]] = None


class ToolExecuteRequest(BaseModel):
    inputs: Optional[Dict[str, str]] = None


@app.post("/api/chat")
async def chat(message: ChatMessage) -> JSONResponse:
    """API endpoint to handle chat messages."""
    global chat_handler

    user_message = message.message
    crew_id = message.crew_id
    chat_id = message.chat_id
    logging.debug(f"Received chat message for chat_id: {chat_id}, crew_id: {crew_id}")

    if not user_message:
        logging.warning("No message provided in request")
        raise HTTPException(status_code=400, detail="No message provided")

    try:
        # If no chat_id is provided, we can't properly track the thread
        if not chat_id:
            raise HTTPException(
                status_code=400,
                detail="No chat ID provided. Unable to track conversation thread.",
            )

        # If a specific crew_id is provided, use that chat handler
        if crew_id and crew_id in chat_handlers:
            handler = chat_handlers[crew_id]
            # Update the global chat handler to track the currently active one
            chat_handler = handler
        elif chat_handler is None:
            raise HTTPException(
                status_code=400,
                detail="No crew has been initialized. Please select a crew first.",
            )

        # Always store messages in the appropriate chat thread
        # Initialize the thread if it doesn't exist
        if chat_id not in chat_threads:
            chat_threads[chat_id] = {"crew_id": crew_id, "messages": []}
            logging.debug(f"Created new chat thread for chat_id: {chat_id}")

        # Add user message to the thread
        chat_threads[chat_id]["messages"].append(
            {"role": "user", "content": user_message}
        )
        logging.debug(
            f"Added user message to chat_id: {chat_id}, message count: {len(chat_threads[chat_id]['messages'])}"
        )

        # Always restore the conversation history for this thread
        if hasattr(chat_handler, "messages"):
            # Save the current thread first if it exists and is different
            current_thread = getattr(chat_handler, "current_chat_id", None)
            if (
                current_thread
                and current_thread != chat_id
                and hasattr(chat_handler, "messages")
            ):
                # Create a deep copy of the messages to avoid reference issues
                chat_threads[current_thread] = {
                    "crew_id": (
                        crew_id
                        if crew_id
                        else getattr(chat_handler, "crew_name", "default")
                    ),
                    "messages": (
                        chat_handler.messages.copy()
                        if isinstance(chat_handler.messages, list)
                        else []
                    ),
                }
                logging.debug(
                    f"Saved {len(chat_handler.messages)} messages from previous thread: {current_thread}"
                )

            # Restore the thread we're working with - create a deep copy to avoid reference issues
            if chat_id in chat_threads:
                chat_handler.messages = (
                    chat_threads[chat_id]["messages"].copy()
                    if isinstance(chat_threads[chat_id]["messages"], list)
                    else []
                )
                # Mark the current thread
                chat_handler.current_chat_id = chat_id
                logging.debug(
                    f"Restored {len(chat_handler.messages)} messages for chat_id: {chat_id}"
                )

        logging.debug(f"Processing message with chat_handler for chat_id: {chat_id}")
        response = chat_handler.process_message(user_message)

        # Ensure we have content in the response
        if not response.get("content") and response.get("status") == "success":
            logging.warning("Response content is empty despite successful status")
            response["content"] = (
                "I'm sorry, but I couldn't generate a response. Please try again."
            )

        # Always add the response to the chat thread if it's valid
        if response.get("status") == "success" and response.get("content"):
            # Add the assistant response to the chat thread
            chat_threads[chat_id]["messages"].append(
                {"role": "assistant", "content": response["content"]}
            )

            # Ensure chat_handler.messages is synchronized with chat_threads
            # This is critical to ensure messages are preserved correctly
            if hasattr(chat_handler, "messages"):
                # Synchronize the chat handler's messages with the thread
                chat_handler.messages = chat_threads[chat_id]["messages"].copy()

            logging.debug(
                f"Added assistant response to chat_id: {chat_id}, message count: {len(chat_threads[chat_id]['messages'])}"
            )

        # Always include the chat_id in the response to ensure proper thread tracking
        response["chat_id"] = chat_id
        response["crew_id"] = (
            crew_id if crew_id else getattr(chat_handler, "crew_name", "default")
        )
        logging.debug(
            f"Sending response for chat_id: {chat_id}, crew_id: {response['crew_id']}"
        )

        return JSONResponse(content=response)
    except Exception as e:
        error_message = f"Error processing chat message: {str(e)}"
        logging.error(error_message, exc_info=True)
        raise HTTPException(status_code=500, detail=error_message)


@app.post("/api/initialize")
@app.get("/api/initialize")
async def initialize(request: InitializeRequest = None) -> JSONResponse:
    """Initialize the chat handler and return initial message."""
    global chat_handler

    # Handle both GET and POST requests
    crew_id = None
    chat_id = None

    if request:
        crew_id = request.crew_id
        chat_id = request.chat_id

    logging.debug(f"Initializing chat with crew_id: {crew_id}, chat_id: {chat_id}")

    try:
        # If crew_id is provided and valid, initialize that specific crew
        if crew_id:
            # If we already have this crew handler cached, use it
            if crew_id in chat_handlers:
                chat_handler = chat_handlers[crew_id]
            else:
                # Find the crew path from the discovered crews
                crew_path = None
                for crew in discovered_crews:
                    if crew.get("id") == crew_id:
                        crew_path = crew.get("path")
                        break

                if not crew_path:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Crew with ID {crew_id} not found",
                    )

                # Load and initialize the specified crew
                crew_instance, crew_name = load_crew_from_module(Path(crew_path))
                new_handler = ChatHandler(crew_instance, crew_name)
                chat_handlers[crew_id] = new_handler
                chat_handler = new_handler

        # If no chat handler is set at this point, initialize with the default
        if not chat_handler:
            # Load and initialize the first available crew
            if discovered_crews:
                crew_path = discovered_crews[0].get("path")
                crew_instance, crew_name = load_crew_from_module(Path(crew_path))
                chat_handler = ChatHandler(crew_instance, crew_name)
                chat_handlers[discovered_crews[0].get("id")] = chat_handler
            else:
                # Fall back to the original behavior
                crew_instance, crew_name = load_crew()
                chat_handler = ChatHandler(crew_instance, crew_name)

        # Initialize the chat handler
        initial_message = chat_handler.initialize()

        # If a chat_id is provided, associate it with this chat handler
        if chat_id:
            # Set the current chat ID for this handler
            chat_handler.current_chat_id = chat_id

            # If this chat thread already exists, restore its messages
            if chat_id in chat_threads:
                # Only restore if the crew matches
                if chat_threads[chat_id]["crew_id"] == crew_id:
                    # Create a deep copy of the messages to avoid reference issues
                    chat_handler.messages = (
                        chat_threads[chat_id]["messages"].copy()
                        if isinstance(chat_threads[chat_id]["messages"], list)
                        else []
                    )
                    logging.debug(
                        f"Restored {len(chat_handler.messages)} messages for chat_id: {chat_id}"
                    )
                else:
                    # If crew doesn't match, create a new thread with the same ID but different crew
                    chat_threads[chat_id] = {"crew_id": crew_id, "messages": []}
                    chat_handler.messages = []
                    logging.debug(
                        f"Created new chat thread for chat_id: {chat_id} with different crew"
                    )
            else:
                # Initialize a new chat thread
                chat_threads[chat_id] = {"crew_id": crew_id, "messages": []}
                chat_handler.messages = []
                logging.debug(f"Created new chat thread for chat_id: {chat_id}")

        return JSONResponse(
            content={
                "status": "success",
                "message": initial_message,
                "required_inputs": [
                    {"name": field.name, "description": field.description}
                    for field in chat_handler.crew_chat_inputs.inputs
                ],
                "crew_id": crew_id or chat_handler.crew_name,
                "crew_name": chat_handler.crew_name,
                "crew_description": chat_handler.crew_chat_inputs.crew_description,
                "chat_id": chat_id,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/crews")
async def get_available_crews() -> JSONResponse:
    """Get a list of all available crews."""
    return JSONResponse(content={"status": "success", "crews": discovered_crews})


@app.get("/api/tools")
async def get_available_tools() -> JSONResponse:
    """Get a list of all available tools from the CrewAI toolkit.

    Returns:
        JSONResponse with the list of available tools and their schemas
    """
    try:
        # Discover available tools
        tools_list = discover_available_tools()

        if not tools_list:
            logging.warning("No tools were discovered")

        # Process each tool to ensure all properties have descriptions
        for tool in tools_list:
            if "parameters" in tool and "properties" in tool["parameters"]:
                for prop_name, prop_schema in tool["parameters"]["properties"].items():
                    # If there's a title but no description, use the title as description
                    if "title" in prop_schema and not prop_schema.get("description"):
                        prop_schema["description"] = prop_schema["title"]
                    # If there's still no description, add a default one
                    elif not prop_schema.get("description"):
                        prop_schema["description"] = f"Parameter: {prop_name}"

        return JSONResponse(content={"status": "success", "tools": tools_list})
    except Exception as e:
        logging.error(f"Error getting available tools: {str(e)}")
        return JSONResponse(
            content={"status": "error", "message": str(e)}, status_code=500
        )


@app.post("/api/tools/{tool_name}/execute")
async def execute_tool(tool_name: str, request: ToolExecuteRequest) -> JSONResponse:
    """Execute a specific tool with the provided inputs.

    Args:
        tool_name: The name of the tool to execute
        request: The inputs for the tool

    Returns:
        JSONResponse with the tool execution results
    """
    try:
        # Get all available tools
        tools = discover_available_tools()

        # Find the requested tool
        tool_info = None
        for tool in tools:
            if tool["name"] == tool_name:
                tool_info = tool
                break

        if not tool_info:
            return JSONResponse(
                content={"status": "error", "message": f"Tool '{tool_name}' not found"},
                status_code=404,
            )

        # Import the tool class or function dynamically
        module_path = tool_info["module"]
        attr_name = tool_info["class_name"]
        is_class = tool_info.get(
            "is_class", True
        )  # Default to class-based for backward compatibility

        # Import the module
        try:
            module = importlib.import_module(module_path)
            tool_attr = getattr(module, attr_name)
        except (ImportError, AttributeError) as e:
            logging.error(f"Error importing tool: {str(e)}")
            return JSONResponse(
                content={
                    "status": "error",
                    "message": f"Error importing tool: {str(e)}",
                },
                status_code=500,
            )

        # Execute the tool based on its type
        inputs = request.inputs or {}

        if is_class:
            # Class-based tool: instantiate and call _run
            try:
                # Try instantiating with required parameters
                try:
                    # First try with name and description
                    tool_instance = tool_attr(
                        name=tool_info["name"], description=tool_info["description"]
                    )
                except Exception as name_desc_error:
                    logging.warning(
                        f"Error instantiating tool with name/description: {str(name_desc_error)}"
                    )
                    # Try with just the required parameters from the inputs
                    required_params = {}
                    if (
                        "parameters" in tool_info
                        and "required" in tool_info["parameters"]
                    ):
                        for param in tool_info["parameters"]["required"]:
                            if param in inputs:
                                required_params[param] = inputs[param]

                    try:
                        tool_instance = tool_attr(**required_params)
                    except Exception:
                        # Last resort: try with no parameters
                        tool_instance = tool_attr()

                # Call the _run method with inputs
                result = tool_instance._run(**inputs)
            except Exception as e:
                logging.error(f"Error executing class-based tool: {str(e)}")
                raise Exception(f"Failed to execute tool: {str(e)}")
        else:
            # Function-based tool: might be a function or a BaseTool instance returned by @tool decorator
            try:
                # Check if it's a BaseTool instance (from @tool decorator)
                if hasattr(tool_attr, "_run"):
                    # It's a BaseTool instance, use _run method
                    result = tool_attr._run(**inputs)
                else:
                    # It's a regular function, call directly
                    result = tool_attr(**inputs)

                # Handle async functions
                if inspect.iscoroutine(result):
                    import asyncio

                    result = asyncio.run(result)
            except Exception as e:
                logging.error(f"Error executing function-based tool: {str(e)}")
                raise Exception(f"Failed to execute tool: {str(e)}")

        # Convert non-serializable objects to strings
        if not isinstance(result, (str, int, float, bool, list, dict, type(None))):
            result = str(result)

        return JSONResponse(content={"status": "success", "result": result})
    except ImportError as e:
        logging.error(f"Error importing tool module: {str(e)}")
        return JSONResponse(
            content={
                "status": "error",
                "message": f"Error importing tool module: {str(e)}",
            },
            status_code=500,
        )
    except Exception as e:
        logging.error(f"Error executing tool {tool_name}: {str(e)}")
        return JSONResponse(
            content={"status": "error", "message": f"Error executing tool: {str(e)}"},
            status_code=500,
        )


@app.post("/api/crews/{crew_id}/kickoff")
async def kickoff_crew(crew_id: str, request: KickoffRequest) -> JSONResponse:
    """Run a specific crew directly with optional inputs.

    Args:
        crew_id: The ID of the crew to run
        request: Optional inputs for the crew

    Returns:
        JSONResponse with the crew run results
    """
    try:
        # Find the crew path from the discovered crews
        crew_path = None
        for crew in discovered_crews:
            if crew.get("id") == crew_id:
                crew_path = crew.get("path")
                break

        if not crew_path:
            raise HTTPException(
                status_code=404,
                detail=f"Crew with ID {crew_id} not found",
            )

        # Load the crew
        crew_instance, crew_name = load_crew_from_module(Path(crew_path))

        # Get the crew's event bus and set up the visualization listener
        if hasattr(crew_instance, "get_event_bus"):
            event_bus = crew_instance.get_event_bus()
            crew_visualization_listener.setup_listeners(event_bus)
            logging.info(f"Crew visualization listener set up for crew: {crew_id}")
        else:
            # If the crew doesn't have a get_event_bus method, use the global event bus
            from crewai.utilities.events import crewai_event_bus

            crew_visualization_listener.setup_listeners(crewai_event_bus)
            logging.info(
                f"Using global event bus for crew: {crew_id} since it doesn't have get_event_bus method"
            )

            # Set the crew ID explicitly to ensure consistent tracking
            if hasattr(crew_instance, "id"):
                logging.info(f"Crew ID from instance: {crew_instance.id}")
            else:
                # Set an ID on the crew instance if it doesn't have one
                import uuid

                crew_instance.id = crew_id
                logging.info(f"Set crew ID to: {crew_id} on crew instance")

        # Create a handler for this crew if it doesn't exist
        if crew_id not in chat_handlers:
            chat_handlers[crew_id] = ChatHandler(crew_instance, crew_name)

        handler = chat_handlers[crew_id]

        # Run the crew directly
        inputs = request.inputs or {}

        # Run the crew kickoff in a separate thread to not block the API
        thread = threading.Thread(target=handler.run_crew, args=(inputs,))
        thread.start()

        return JSONResponse(
            content={
                "status": "success",
                "message": f"Crew '{crew_name}' kickoff started.",
                "crew_id": crew_id,
            }
        )
    except HTTPException as e:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_message = f"Error running crew: {str(e)}"
        logging.error(error_message, exc_info=True)
        raise HTTPException(status_code=500, detail=error_message)


@app.websocket("/ws/crew-visualization")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time crew visualization updates."""
    logging.info("New WebSocket connection request for crew visualization")
    try:
        # Connect the WebSocket client to the event listener
        await crew_visualization_listener.connect(websocket)
        logging.info("WebSocket client connected successfully")

        # Send a test message to verify the connection is working
        try:
            from crewai_chat_ui.event_listener import CustomJSONEncoder

            test_message = {
                "type": "connection_test",
                "status": "connected",
                "timestamp": datetime.datetime.now(),
            }
            await websocket.send_text(json.dumps(test_message, cls=CustomJSONEncoder))
            logging.info("Test message sent to WebSocket client")
        except Exception as e:
            logging.error(f"Failed to send test message: {str(e)}", exc_info=True)

        # Keep the connection open and handle messages
        while True:
            # Wait for messages from the client (if any)
            try:
                data = await websocket.receive_text()
                logging.debug(f"Received message from client: {data}")
                # Currently we don't expect any messages from the client
                # but we could handle them here if needed
            except WebSocketDisconnect:
                # Handle disconnection
                logging.info("WebSocket client disconnected")
                crew_visualization_listener.disconnect(websocket)
                break
    except WebSocketDisconnect:
        logging.info("WebSocket disconnected during handshake")
        crew_visualization_listener.disconnect(websocket)
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}", exc_info=True)
        # Try to disconnect if there was an error
        try:
            crew_visualization_listener.disconnect(websocket)
        except:
            pass


@app.websocket("/ws/flow/{flow_id}")
async def flow_websocket_endpoint(websocket: WebSocket, flow_id: str):
    """WebSocket endpoint for real-time flow execution visualization."""
    logging.info(f"New WebSocket connection request for flow {flow_id}")
    await websocket.accept()

    try:
        # Get the flow execution from the flow API's active flows cache
        flow_execution = get_active_execution(flow_id)
        
        # If no active execution is found, wait a short time for it to be created
        # This helps with race conditions where the WebSocket connects before the flow is fully initialized
        if not flow_execution:
            logging.info(f"No active execution found for flow {flow_id}, waiting for initialization...")
            # Wait up to 5 seconds for the flow execution to be created
            for _ in range(10):
                await asyncio.sleep(0.5)
                flow_execution = get_active_execution(flow_id)
                if flow_execution:
                    logging.info(f"Flow execution for {flow_id} found after waiting")
                    break
        
        # If still no execution found after waiting, send error
        if not flow_execution:
            logging.error(f"No active execution found for flow {flow_id} after waiting")
            await websocket.send_json(
                {
                    "type": "error",
                    "message": f"No active execution found for flow {flow_id}. Please try running the flow again.",
                }
            )
            await websocket.close()
            return

        # Create a queue for this connection
        queue: asyncio.Queue = asyncio.Queue()

        # Register this connection
        connection_id = str(uuid.uuid4())
        flow_router.register_websocket_queue(flow_id, connection_id, queue)

        try:
            # Send initial state
            initial_state = flow_router.get_flow_state(flow_id)
            if initial_state:
                await websocket.send_json(
                    {"type": "flow_state", "payload": initial_state}
                )

            # Listen for updates from the flow execution
            while True:
                try:
                    # Wait for messages with a timeout
                    message = await asyncio.wait_for(queue.get(), timeout=1.0)
                    await websocket.send_json(message)
                except asyncio.TimeoutError:
                    # Check if the flow execution is still active
                    if not flow_router.is_execution_active(flow_id):
                        # Send final state before closing
                        final_state = flow_router.get_flow_state(flow_id)
                        if final_state:
                            await websocket.send_json(
                                {"type": "flow_state", "payload": final_state}
                            )
                        break
                    # Otherwise continue waiting
                    continue
        except WebSocketDisconnect:
            logging.info(f"WebSocket client disconnected: {connection_id}")
        except Exception as e:
            logging.error(f"Error in flow WebSocket: {str(e)}")
        finally:
            # Unregister this connection
            flow_router.unregister_websocket_queue(flow_id, connection_id)
    except Exception as e:
        logging.error(f"Flow WebSocket error: {str(e)}", exc_info=True)
    finally:
        await websocket.close()


@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve the React application and handle client-side routing."""
    # Check if the path points to an existing file in the build directory
    requested_file = ui_dir / full_path

    if requested_file.exists() and requested_file.is_file():
        return FileResponse(requested_file)

    # If ui/build/client/index.html exists, serve it for client-side routing
    if ui_dir.exists() and (ui_dir / "index.html").exists():
        return FileResponse(ui_dir / "index.html")


def show_loading(stop_event, message):
    """Display animated loading dots while processing."""
    counter = 0
    while not stop_event.is_set():
        dots = "." * (counter % 4)
        click.echo(f"\r{message}{dots.ljust(3)}", nl=False)
        counter += 1
        threading.Event().wait(0.5)
    click.echo()  # Final newline


def find_available_port(start_port: int = 8000, max_attempts: int = 100) -> int:
    """Find the next available port starting from start_port."""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("", port))
                return port
        except OSError:
            continue
    raise RuntimeError(
        f"Could not find an available port after {max_attempts} attempts"
    )


def main():
    """Main entry point for the CLI."""
    global chat_handler, discovered_crews

    click.echo("CrewAI Chat UI - Starting up...")

    try:
        # Try to discover all crews in the current directory
        click.echo("Discovering crews in current directory...")

        # Show loading indicator for crew loading
        stop_loading = threading.Event()
        loading_thread = threading.Thread(
            target=show_loading, args=(stop_loading, "Searching for crew files")
        )
        loading_thread.start()

        try:
            # Discover all available crews
            crews_info = discover_available_crews()

            # Add unique IDs to each crew
            for i, crew in enumerate(crews_info):
                crew["id"] = f"crew_{i}" if not crew.get("id") else crew["id"]

            discovered_crews = crews_info

            stop_loading.set()
            loading_thread.join()

            if crews_info:
                click.echo(f"Found {len(crews_info)} crews:")
                for i, crew in enumerate(crews_info):
                    click.echo(f"  {i+1}. {crew['name']} - {crew['directory']}")

                # Initialize the first crew
                try:
                    crew_path = Path(crews_info[0]["path"])
                    crew, crew_name = load_crew_from_module(crew_path)
                    chat_handler = ChatHandler(crew, crew_name)
                    chat_handlers[crews_info[0]["id"]] = chat_handler
                    click.echo(f"Initialized {crew_name} as the default crew")
                except Exception as e:
                    click.echo(f"Error initializing first crew: {str(e)}", err=True)
            else:
                click.echo("No crews found. Trying fallback method...")
                try:
                    # Fallback to the original method
                    crew, crew_name = load_crew()
                    chat_handler = ChatHandler(crew, crew_name)
                    click.echo(f"Successfully loaded crew: {crew_name}")

                    # Add this to discovered crews
                    discovered_crews = [
                        {
                            "id": "default_crew",
                            "name": crew_name,
                            "path": str(Path(os.getcwd()) / "crew.py"),
                            "directory": ".",
                        }
                    ]
                except Exception as e:
                    click.echo(f"Error loading crew: {str(e)}", err=True)

                    # Add helpful debugging information
                    click.echo("\nFor debugging help:")
                    click.echo(
                        "1. Make sure your crew.py file contains a Crew instance or a function that returns one"
                    )
                    click.echo(
                        "2. If using a function, name it 'crew', 'get_crew', 'create_crew', or similar"
                    )
                    click.echo(
                        "3. Check that your CrewAI imports are correct for your installed version"
                    )
                    click.echo(
                        "4. Run your crew file directly with 'python crew.py' to test it"
                    )
                    sys.exit(1)
        except Exception as e:
            stop_loading.set()
            loading_thread.join()
            click.echo(f"Error discovering crews: {str(e)}", err=True)
            sys.exit(1)

        # Start the FastAPI server with uvicorn
        host = "0.0.0.0"  # Listen on all interfaces
        default_port = 8000

        try:
            port = find_available_port(default_port)
            if port != default_port:
                click.echo(
                    click.style(
                        f"Port {default_port} is in use, using port {port} instead",
                        fg="yellow",
                    )
                )
        except RuntimeError as e:
            click.echo(f"Error finding available port: {str(e)}", err=True)
            sys.exit(1)

        click.echo(
            click.style(f"Server running! Access the chat UI at: ", fg="green")
            + click.style(f"http://localhost:{port}", fg="bright_green", bold=True)
        )
        click.echo(click.style("Press Ctrl+C to stop the server", fg="yellow"))

        # Run the FastAPI app with uvicorn
        uvicorn.run(app, host=host, port=port, log_level="error")

    except KeyboardInterrupt:
        click.echo("\nServer stopped")
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
