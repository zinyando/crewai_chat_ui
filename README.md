# CrewAI Chat UI

A web interface for interacting with CrewAI crews through a chat-based UI.

## Features

- 🌐 **Web Interface**: Easy-to-use chat UI for interacting with your CrewAI crews
- 🔍 **Auto-Discovery**: Automatically finds and loads your crew from the current directory
- 🎮 **Interactive**: Real-time chat with your AI crew
- 🚀 **Easy to Use**: Simple installation and setup process

## Installation

### From PyPI (when published)

```bash
pip install crewai-chat-ui
```

### From source

1. Clone this repository or download the source code
2. Navigate to the directory containing the `pyproject.toml` file
3. Install with pip:

```bash
pip install -e .
```

## Requirements

- Python 3.9+
- CrewAI 0.98.0+
- A properly configured CrewAI project with a crew instance

## Usage

1. Navigate to your CrewAI project directory
2. Run the chat UI:

```bash
crewai-chat-ui
```

3. Open your browser and go to `http://localhost:5000`
4. Start chatting with your crew!

## How It Works

The CrewAI Chat UI:

1. Searches for crew.py or *_crew.py files in your current directory and subdirectories
2. Loads your crew instance
3. Uses the crew's chat_llm to initialize a chat interface
4. Analyzes your crew to understand its purpose and required inputs
5. Provides a web-based UI for interacting with your crew

## Configuration

The chat UI uses the following configuration from your crew:

- `chat_llm`: The language model to use for chat interactions (required)
- Crew task descriptions: To understand your crew's purpose
- Agent descriptions: To understand the agents' roles

## Development

### Project Structure

```
crewai_chat_ui/
├── __init__.py        # Package initialization
├── server.py          # Web server implementation
├── crew_loader.py     # Logic to load user's crew
├── chat_handler.py    # Chat functionality
└── static/            # Frontend assets
    ├── index.html     # Main UI page
    ├── styles.css     # Styling
    └── scripts.js     # Client-side functionality
```

### Building the Package

To build the package:

```bash
pip install build
python -m build
```

The package will be available in the `dist/` directory.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
