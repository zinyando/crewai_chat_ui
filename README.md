# CrewAI Chat UI

A modern web interface for interacting with CrewAI crews through an intuitive, feature-rich chat UI.

![CrewAI Chat UI Screenshot light mode](https://github.com/user-attachments/assets/b8b08a7c-d404-4b91-b4c9-6c8c0e84b468)

![CrewAI Chat UI Screenshot dark mode](https://github.com/user-attachments/assets/c09ccfb2-1881-44e1-8eb7-02cf24dc6b78)


*Screenshot: CrewAI Chat UI in action*

## Features

- 🌐 **Modern Web Interface**: Sleek, responsive chat UI for interacting with your CrewAI crews
- 🔍 **Auto-Discovery**: Automatically finds and loads your crew from the current directory
- 🎮 **Interactive**: Real-time chat with typing indicators and message formatting
- 📋 **Chat History**: Save and manage conversation threads with local storage
- 🗑️ **Thread Management**: Create new chats and delete old conversations
- 🔄 **State Persistence**: Conversations are saved and can be resumed
- 📱 **Responsive Design**: Optimized for various screen sizes
- 🚀 **Easy to Use**: Simple installation and setup process
- 🧵 **Multi-Thread Support**: Maintain multiple conversations with proper message tracking
- 🔔 **Cross-Thread Notifications**: Get notified when responses arrive in other threads
- 💬 **Persistent Typing Indicators**: Typing bubbles remain visible when switching threads
- 🔄 **Synchronization**: Messages are properly synchronized between client and server

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

1. Searches for crew.py or *_crew.py files in your current directory
2. Loads your crew instance
3. Uses the crew's chat_llm to initialize a chat interface
4. Provides a modern web-based UI for interacting with your crew
5. Manages chat history using local storage for persistent conversations

## Configuration

The chat UI uses the following configuration from your crew:

- `chat_llm`: The language model to use for chat interactions (required)
- Crew task descriptions: To understand your crew's purpose
- Agent descriptions: To understand the agents' roles

## Development

### Project Structure

```
src/
└── crewai_chat_ui/
    ├── __init__.py        # Package initialization
    ├── server.py          # Web server implementation
    ├── crew_loader.py     # Logic to load user's crew
    ├── chat_handler.py    # Chat functionality
    └── static/            # Frontend assets
        ├── index.html     # Main UI page
        ├── styles.css     # Styling
        └── scripts.js     # Client-side functionality
pyproject.toml          # Package configuration
README.md               # Documentation
```

### UI Features

#### Chat History Management

The UI provides several ways to manage your conversations:

- **Create New Chat**: Click the "New Chat" button in the sidebar to start a fresh conversation
- **View Past Conversations**: All your conversations are saved and accessible from the sidebar
- **Delete Conversations**: Each conversation in the sidebar has a delete button (trash icon) to remove unwanted threads
- **Clear Current Chat**: The "Clear" button in the header removes all messages in the current conversation while keeping the thread

#### Thread Management

The application supports sophisticated thread management:

- **Multiple Concurrent Threads**: Maintain multiple conversations with different crews simultaneously
- **Thread Persistence**: All messages are correctly stored in their respective threads
- **Cross-Thread Notifications**: When a response arrives in a thread you're not currently viewing, you'll receive a notification
- **Persistent Typing Indicators**: Typing bubbles remain visible when switching between threads until a response is received
- **Thread Synchronization**: Messages are properly synchronized between client and server to ensure no messages are lost

### Development

#### Building the Package

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
