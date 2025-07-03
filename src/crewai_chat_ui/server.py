import json
import logging
import os
import sys
from pathlib import Path
import threading
from typing import Dict, Optional, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import click
import socket

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
        
        # Create a handler for this crew if it doesn't exist
        if crew_id not in chat_handlers:
            chat_handlers[crew_id] = ChatHandler(crew_instance, crew_name)
        
        handler = chat_handlers[crew_id]
        
        # Run the crew directly
        inputs = request.inputs or {}
        
        # Create a thread to run the crew
        result = handler.run_crew(inputs)
        
        return JSONResponse(content={
            "status": "success",
            "crew_id": crew_id,
            "crew_name": crew_name,
            "result": result
        })
    except HTTPException as e:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_message = f"Error running crew: {str(e)}"
        logging.error(error_message, exc_info=True)
        raise HTTPException(status_code=500, detail=error_message)


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
