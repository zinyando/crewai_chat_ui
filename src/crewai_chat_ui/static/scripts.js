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
    const crewSelect = document.getElementById('crew-select');
    
    // State variables
    let isProcessing = false;
    let chatId = generateChatId();
    let conversationHistory = [];
    let currentCrewId = null;
    let availableCrews = [];
    
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
    
    // Load chat history
    loadChatHistory();
    
    // Load available crews
    loadAvailableCrews();
    
    // Crew selection change handler
    crewSelect.addEventListener('change', function() {
        const selectedCrewId = this.value;
        if (selectedCrewId && selectedCrewId !== currentCrewId) {
            initializeChat(selectedCrewId);
        }
    });
    
    // Function to load a chat by ID
    function loadChatById(id) {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        if (history[id]) {
            chatId = id;
            conversationHistory = history[id].messages || [];
            
            // Load the crew associated with this chat if available
            if (history[id].crew_id) {
                currentCrewId = history[id].crew_id;
                crewNameElement.textContent = history[id].crew_name || 'CrewAI Chat';
                
                // Update the crew dropdown selection
                if (currentCrewId && crewSelect) {
                    // Try to select the correct crew
                    const options = Array.from(crewSelect.options);
                    const option = options.find(opt => opt.value === currentCrewId);
                    if (option) {
                        crewSelect.value = currentCrewId;
                    }
                }
            }
            
            // Update UI to mark this chat as active
            document.querySelectorAll('.chat-history-item').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('data-chat-id') === chatId) {
                    item.classList.add('active');
                }
            });
            
            // Clear current messages
            messagesContainer.innerHTML = '';
            
            // Add welcome message
            addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
            
            // Load messages
            conversationHistory.forEach(msg => {
                addMessage(msg.role, msg.content);
            });
            
            return true;
        }
        
        return false;
    }
    
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
        
        // Re-initialize with the current crew
        initializeChat(currentCrewId);
    });
    
    // Optional features (placeholders)
    uploadButton.addEventListener('click', function() {
        alert('File upload feature coming soon!');
    });
    
    micButton.addEventListener('click', function() {
        alert('Voice input feature coming soon!');
    });
    
    // Function to load all available crews
    function loadAvailableCrews() {
        fetch('/api/crews')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.crews && data.crews.length > 0) {
                    // Store the crews data
                    availableCrews = data.crews;
                    
                    // Clear any existing options except the placeholder
                    while (crewSelect.options.length > 1) {
                        crewSelect.remove(1);
                    }
                    
                    // Add each crew to the dropdown
                    data.crews.forEach(crew => {
                        const option = document.createElement('option');
                        option.value = crew.id;
                        option.textContent = crew.name;
                        crewSelect.appendChild(option);
                    });
                    
                    // Initialize the first crew by default if we don't have a current crew
                    if (!currentCrewId) {
                        initializeChat(data.crews[0].id);
                    }
                } else {
                    console.error('No crews available or error loading crews');
                    // If there's an error or no crews, initialize without a specific crew ID
                    if (!currentCrewId) {
                        initializeChat();
                    }
                }
            })
            .catch(error => {
                console.error('Error loading crews:', error);
                // If there's an error, initialize without a specific crew ID
                if (!currentCrewId) {
                    initializeChat();
                }
            });
    }
    
    function initializeChat(crewId = null) {
        addLoadingMessage();
        
        let url = '/api/initialize';
        let options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // If a specific crew ID is provided, use POST method with the crew ID
        if (crewId) {
            options.method = 'POST';
            options.body = JSON.stringify({ crew_id: crewId });
        } else if (currentCrewId) {
            // If we already have a current crew ID but no new one is provided, use it
            options.method = 'POST';
            options.body = JSON.stringify({ crew_id: currentCrewId });
        }
        
        fetch(url, options)
            .then(response => response.json())
            .then(data => {
                removeLoadingMessage();
                
                if (data.status === 'success') {
                    // Update crew info
                    currentCrewId = data.crew_id;
                    crewNameElement.textContent = data.crew_name;
                    crewDescriptionElement.textContent = data.crew_description;
                    
                    // Update the crew dropdown selection
                    if (currentCrewId) {
                        crewSelect.value = currentCrewId;
                    }
                    
                    // Create a new chat with this crew
                    createNewChat(data.message);
                } else {
                    // Display error message
                    messagesContainer.innerHTML = '';
                    addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                    addMessage('assistant', 'Error initializing chat: ' + data.message);
                }
            })
            .catch(error => {
                removeLoadingMessage();
                messagesContainer.innerHTML = '';
                addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                addMessage('assistant', 'Error initializing chat. Please check if your crew is correctly set up.');
                console.error('Error:', error);
            });
    }
    
    function createNewChat(initialMessage) {
        // Clear messages container
        messagesContainer.innerHTML = '';
        
        // Add welcome message
        addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
        
        // Add the crew's initial message if it exists
        if (initialMessage && initialMessage.trim()) {
            addMessage('assistant', initialMessage);
            
            // Update conversation history
            conversationHistory = [{ role: 'assistant', content: initialMessage }];
            
            // Save to chat history
            saveChatToHistory(chatId, 'New Chat', conversationHistory);
        } else {
            // Empty conversation history
            conversationHistory = [];
            saveChatToHistory(chatId, 'New Chat', conversationHistory);
        }
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
    
    function deleteChatFromHistory(id) {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        if (history[id]) {
            delete history[id];
            localStorage.setItem('crewai_chat_history', JSON.stringify(history));
            
            // If we deleted the active chat, create a new one
            if (id === chatId) {
                // Create new chat session
                chatId = generateChatId();
                conversationHistory = [];
                
                // Clear messages except welcome
                const messages = messagesContainer.querySelectorAll('.message:not(.system-message)');
                messages.forEach(msg => msg.remove());
                
                // Re-initialize
                initializeChat();
            }
            
            updateChatHistoryUI();
            return true;
        }
        
        return false;
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
            historyItem.setAttribute('data-chat-id', chat.id);
            if (chat.id === chatId) {
                historyItem.classList.add('active');
            }
            
            // Create container for chat info (icon and title)
            const chatInfo = document.createElement('div');
            chatInfo.className = 'chat-info';
            
            const chatIcon = document.createElement('i');
            chatIcon.className = 'fa-solid fa-message';
            
            const chatTitle = document.createElement('span');
            chatTitle.className = 'chat-title';
            chatTitle.textContent = chat.title || 'New Chat';
            
            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-chat-btn';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = 'Delete this conversation';
            
            // Add event listener for delete button with stopPropagation to prevent triggering parent click
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this conversation?')) {
                    deleteChatFromHistory(chat.id);
                }
            });
            
            // Append elements
            chatInfo.appendChild(chatIcon);
            chatInfo.appendChild(chatTitle);
            
            historyItem.appendChild(chatInfo);
            historyItem.appendChild(deleteBtn);
            
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
