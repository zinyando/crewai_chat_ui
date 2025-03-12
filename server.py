import json
import os
import sys
from pathlib import Path
import threading

import click
from flask import Flask, request, jsonify, render_template, send_from_directory
import importlib.resources as pkg_resources

from crew_loader import load_crew
from chat_handler import ChatHandler


# Create Flask app
app = Flask(__name__)
chat_handler = None


@app.route('/')
def index():
    """Serve the main chat interface."""
    static_dir = Path(__file__).parent / 'static'
    return send_from_directory(static_dir, 'index.html')


@app.route('/static/<path:path>')
def serve_static(path):
    """Serve static files."""
    static_dir = Path(__file__).parent / 'static'
    return send_from_directory(static_dir, path)


@app.route('/api/chat', methods=['POST'])
def chat():
    """API endpoint to handle chat messages."""
    data = request.json
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({"error": "No message provided"}), 400
    
    response = chat_handler.process_message(user_message)
    return jsonify(response)


@app.route('/api/initialize', methods=['GET'])
def initialize():
    """Initialize the chat handler and return initial message."""
    try:
        initial_message = chat_handler.initialize()
        return jsonify({
            "status": "success",
            "message": initial_message,
            "required_inputs": [
                {
                    "name": field.name,
                    "description": field.description
                } 
                for field in chat_handler.crew_chat_inputs.inputs
            ],
            "crew_name": chat_handler.crew_name,
            "crew_description": chat_handler.crew_chat_inputs.crew_description
        })
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
            target=show_loading, 
            args=(stop_loading, "Searching for crew files")
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
            sys.exit(1)
        
        # Initialize the chat handler
        chat_handler = ChatHandler(crew, crew_name)
        
        # Start the Flask server
        host = '0.0.0.0'  # Listen on all interfaces
        port = 5000
        
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
