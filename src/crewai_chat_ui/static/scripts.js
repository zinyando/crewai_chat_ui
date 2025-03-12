document.addEventListener('DOMContentLoaded', function() {
    // Main DOM elements
    const messagesContainer = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const crewNameElement = document.getElementById('crew-name');
    const crewDescriptionElement = document.getElementById('crew-description');
    const clearButton = document.getElementById('clear-btn');
    const uploadButton = document.getElementById('upload-btn');
    const micButton = document.getElementById('mic-btn');
    const newChatButton = document.querySelector('.new-chat-btn');
    const chatHistory = document.getElementById('chat-history');
    
    // State variables
    let isProcessing = false;
    let chatId = generateChatId();
    let conversationHistory = [];
    
    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        const newHeight = Math.min(this.scrollHeight, 150);
        this.style.height = newHeight + 'px';
        
        // Enable/disable send button based on input
        if (this.value.trim() !== '') {
            sendButton.classList.add('active');
        } else {
            sendButton.classList.remove('active');
        }
    });
    
    // Initialize the chat
    initializeChat();
    loadChatHistory();
    
    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    clearButton.addEventListener('click', function() {
        // Confirm before clearing
        if (confirm('Are you sure you want to clear this conversation?')) {
            // Keep the welcome message, remove the rest
            const messages = messagesContainer.querySelectorAll('.message:not(.system-message)');
            messages.forEach(msg => msg.remove());
            
            // Clear conversation history
            conversationHistory = [];
            
            // Save empty chat history
            saveChatToHistory(chatId, 'New Chat', []);
        }
    });
    
    newChatButton.addEventListener('click', function() {
        // Create new chat session
        chatId = generateChatId();
        conversationHistory = [];
        
        // Clear messages except welcome
        const messages = messagesContainer.querySelectorAll('.message:not(.system-message)');
        messages.forEach(msg => msg.remove());
        
        // Add to chat history
        saveChatToHistory(chatId, 'New Chat', []);
        
        // Re-initialize
        initializeChat();
    });
    
    // Optional features (placeholders)
    uploadButton.addEventListener('click', function() {
        alert('File upload feature coming soon!');
    });
    
    micButton.addEventListener('click', function() {
        alert('Voice input feature coming soon!');
    });
    
    function initializeChat() {
        addLoadingMessage();
        
        fetch('/api/initialize')
            .then(response => response.json())
            .then(data => {
                removeLoadingMessage();
                
                if (data.status === 'success') {
                    // Update crew info
                    crewNameElement.textContent = data.crew_name;
                    crewDescriptionElement.textContent = data.crew_description;
                    
                    // Remove any existing welcome messages
                    const existingWelcomes = messagesContainer.querySelectorAll('.system-message');
                    existingWelcomes.forEach(msg => msg.remove());
                    
                    // First add a standard welcome message
                    addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                    
                    // Then add the crew's initial message as an assistant message if it exists
                    if (data.message && data.message.trim()) {
                        // Add the actual crew message
                        addMessage('assistant', data.message);
                        
                        // Save this initial message to conversation history
                        conversationHistory.push({ role: 'assistant', content: data.message });
                        saveChatToHistory(chatId, 'New Chat', conversationHistory);
                    }
                } else {
                    addMessage('assistant', 'Error initializing chat: ' + data.message);
                }
            })
            .catch(error => {
                removeLoadingMessage();
                addMessage('assistant', 'Error initializing chat. Please check if your crew is correctly set up.');
                console.error('Error:', error);
            });
    }
    
    function sendMessage() {
        const message = userInput.value.trim();
        
        if (!message || isProcessing) return;
        
        // Add user message to the chat
        addMessage('user', message);
        conversationHistory.push({ role: 'user', content: message });
        
        // Clear input field and reset height
        userInput.value = '';
        userInput.style.height = 'auto';
        sendButton.classList.remove('active');
        
        // Add loading indicator
        addLoadingMessage();
        isProcessing = true;
        
        // Send message to server
        fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message }),
        })
        .then(response => response.json())
        .then(data => {
            // Remove loading indicator
            removeLoadingMessage();
            isProcessing = false;
            
            if (data.status === 'success') {
                // Add assistant response
                addMessage('assistant', data.content);
                conversationHistory.push({ role: 'assistant', content: data.content });
                
                // Save to chat history
                saveChatToHistory(chatId, getFirstUserMessage() || 'New Chat', conversationHistory);
                
                // If there was a tool call, scroll to bottom
                if (data.has_tool_call) {
                    scrollToBottom();
                }
            } else {
                addMessage('assistant', 'Error: ' + data.content);
            }
        })
        .catch(error => {
            removeLoadingMessage();
            isProcessing = false;
            addMessage('assistant', 'An error occurred while processing your message.');
            console.error('Error:', error);
        });
    }
    
    function addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Process markdown-like syntax (enhanced version)
        let formattedContent = content
            .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
            
        contentDiv.innerHTML = formattedContent;
        messageDiv.appendChild(contentDiv);
        
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = formatTime(new Date());
        messageDiv.appendChild(timestamp);
        
        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }
    
    function addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.id = 'loading-indicator';
        
        // Create typing animation dots
        const typingAnimation = document.createElement('div');
        typingAnimation.className = 'typing-animation';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            typingAnimation.appendChild(dot);
        }
        
        loadingDiv.appendChild(typingAnimation);
        messagesContainer.appendChild(loadingDiv);
        scrollToBottom();
    }
    
    function removeLoadingMessage() {
        const loadingDiv = document.getElementById('loading-indicator');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
    
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Chat history management
    function generateChatId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    function getFirstUserMessage() {
        // Get the first user message for chat history title
        const userMsg = conversationHistory.find(msg => msg.role === 'user');
        if (userMsg) {
            // Truncate if too long
            return userMsg.content.length > 30 ? 
                userMsg.content.substring(0, 27) + '...' : 
                userMsg.content;
        }
        return null;
    }
    
    function saveChatToHistory(id, title, messages) {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        history[id] = {
            id: id,
            title: title,
            timestamp: new Date().toISOString(),
            messages: messages
        };
        
        localStorage.setItem('crewai_chat_history', JSON.stringify(history));
        updateChatHistoryUI();
    }
    
    function loadChatHistory() {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        updateChatHistoryUI(history);
    }
    
    function updateChatHistoryUI() {
        chatHistory.innerHTML = '';
        
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        // Sort by most recent
        const sortedHistory = Object.values(history).sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        if (sortedHistory.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-history';
            emptyState.textContent = 'No chat history yet';
            chatHistory.appendChild(emptyState);
            return;
        }
        
        sortedHistory.forEach(chat => {
            const historyItem = document.createElement('div');
            historyItem.className = 'chat-history-item';
            if (chat.id === chatId) {
                historyItem.classList.add('active');
            }
            
            const chatIcon = document.createElement('i');
            chatIcon.className = 'fa-solid fa-message';
            
            const chatTitle = document.createElement('span');
            chatTitle.textContent = chat.title || 'New Chat';
            
            historyItem.appendChild(chatIcon);
            historyItem.appendChild(chatTitle);
            
            historyItem.addEventListener('click', function() {
                // Load this chat
                chatId = chat.id;
                conversationHistory = chat.messages;
                
                // Update UI
                document.querySelectorAll('.chat-history-item').forEach(item => {
                    item.classList.remove('active');
                });
                historyItem.classList.add('active');
                
                // Clear current messages
                messagesContainer.innerHTML = '';
                
                // Add welcome message
                addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                
                // Load messages
                chat.messages.forEach(msg => {
                    addMessage(msg.role, msg.content);
                });
            });
            
            chatHistory.appendChild(historyItem);
        });
    }
    
    // Helper functions
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
});
