import json
import logging
import os
import sys
from pathlib import Path
import threading

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

import click
from flask import Flask, request, jsonify, render_template, send_from_directory
import importlib.resources as pkg_resources

from crewai_chat_ui.crew_loader import load_crew
from crewai_chat_ui.chat_handler import ChatHandler


# Create Flask app
app = Flask(__name__)
chat_handler = None


@app.route("/")
def index():
    """Serve the main chat interface."""
    static_dir = Path(__file__).parent / "static"
    return send_from_directory(static_dir, "index.html")


@app.route("/static/<path:path>")
def serve_static(path):
    """Serve static files."""
    static_dir = Path(__file__).parent / "static"
    return send_from_directory(static_dir, path)


@app.route("/api/chat", methods=["POST"])
def chat():
    """API endpoint to handle chat messages."""
    data = request.json
    user_message = data.get("message", "")
    logging.info(f"Received chat message: {user_message}")

    if not user_message:
        logging.warning("No message provided in request")
        return jsonify({"error": "No message provided"}), 400

    try:
        logging.info("Processing message with chat_handler")
        response = chat_handler.process_message(user_message)
        logging.info(f"Response from chat_handler: {response}")
        
        # Ensure we have content in the response
        if not response.get("content") and response.get("status") == "success":
            logging.warning("Response content is empty despite successful status")
            response["content"] = "I'm sorry, but I couldn't generate a response. Please try again."
        
        return jsonify(response)
    except Exception as e:
        error_message = f"Error processing chat message: {str(e)}"
        logging.error(error_message, exc_info=True)
        return jsonify({"status": "error", "content": error_message}), 500


@app.route("/api/initialize", methods=["GET"])
def initialize():
    """Initialize the chat handler and return initial message."""
    try:
        initial_message = chat_handler.initialize()
        return jsonify(
            {
                "status": "success",
                "message": initial_message,
                "required_inputs": [
                    {"name": field.name, "description": field.description}
                    for field in chat_handler.crew_chat_inputs.inputs
                ],
                "crew_name": chat_handler.crew_name,
                "crew_description": chat_handler.crew_chat_inputs.crew_description,
            }
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def show_loading(stop_event, message):
    """Display animated loading dots while processing."""
    counter = 0
    while not stop_event.is_set():
        dots = "." * (counter % 4)
        click.echo(f"\r{message}{dots.ljust(3)}", nl=False)
        counter += 1
        threading.Event().wait(0.5)
    click.echo()  # Final newline


def main():
    """Main entry point for the CLI."""
    global chat_handler

    click.echo("CrewAI Chat UI - Starting up...")

    try:
        # Try to load the crew
        click.echo("Loading crew from current directory...")

        # Show loading indicator for crew loading
        stop_loading = threading.Event()
        loading_thread = threading.Thread(
            target=show_loading, args=(stop_loading, "Searching for crew files")
        )
        loading_thread.start()

        try:
            crew, crew_name = load_crew()
            stop_loading.set()
            loading_thread.join()
            click.echo(f"Successfully loaded crew: {crew_name}")
        except Exception as e:
            stop_loading.set()
            loading_thread.join()
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

        # Initialize the chat handler
        chat_handler = ChatHandler(crew, crew_name)

        # Start the Flask server
        host = "0.0.0.0"  # Listen on all interfaces
        port = 3100

        click.echo(f"Starting web server at http://localhost:{port}")
        click.echo(f"Access the chat UI in your browser")
        click.echo("Press Ctrl+C to stop the server")

        app.run(host=host, port=port, debug=False)

    except KeyboardInterrupt:
        click.echo("\nServer stopped")
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
