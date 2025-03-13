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
    
    // Initialize flag to track if a new chat has been created
    let newChatCreated = false;
    
    // Check URL for crew and chat parameters
    const urlParams = new URLSearchParams(window.location.search);
    const crewIdFromUrl = urlParams.get('crew');
    const chatIdFromUrl = urlParams.get('chat');
    
    // Use chat ID from URL if available, otherwise generate a new one
    let chatId = chatIdFromUrl || generateChatId();
    
    // Load chat history - if we have a chat ID in the URL, we'll load that specific chat
    loadChatHistory(chatIdFromUrl);
    
    // Load available crews (passing the crew ID from URL if it exists)
    loadAvailableCrews(crewIdFromUrl, chatIdFromUrl);
    
    // Crew selection change handler
    crewSelect.addEventListener('change', function() {
        const selectedCrewId = this.value;
        if (selectedCrewId && selectedCrewId !== currentCrewId) {
            // Update URL with the selected crew ID
            updateUrlWithCrewId(selectedCrewId);
            initializeChat(selectedCrewId);
        }
    });
    
    // Function to update URL with crew ID and chat ID
    function updateUrlWithIds(crewId, chatIdToUse = null) {
        // Create a new URL object with the current URL
        const url = new URL(window.location.href);
        
        // Set the crew parameter to the crew ID
        if (crewId) {
            url.searchParams.set('crew', crewId);
        }
        
        // Set the chat parameter to the chat ID if provided
        if (chatIdToUse || chatId) {
            url.searchParams.set('chat', chatIdToUse || chatId);
        }
        
        // Update the URL without reloading the page
        window.history.pushState({}, '', url);
    }
    
    // Legacy function for backward compatibility
    function updateUrlWithCrewId(crewId) {
        updateUrlWithIds(crewId);
    }
    
    // Function to load a chat by ID
    function loadChatById(id) {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        if (history[id]) {
            // Set the chat ID and load conversation history
            chatId = id;
            conversationHistory = history[id].messages || [];
            
            // Load the crew associated with this chat if available
            // Check for both crew_id (old format) and crewId (new format)
            const chatCrewId = history[id].crewId || history[id].crew_id;
            if (chatCrewId) {
                // Set the current crew ID
                currentCrewId = chatCrewId;
                
                // Update crew name and description display
                crewNameElement.textContent = history[id].crew_name || 'CrewAI Chat';
                crewDescriptionElement.textContent = history[id].crew_description || '';
                
                // Update the crew dropdown selection if the crew exists in the dropdown
                if (currentCrewId && crewSelect) {
                    // Try to select the correct crew
                    const options = Array.from(crewSelect.options);
                    const option = options.find(opt => opt.value === currentCrewId);
                    if (option) {
                        crewSelect.value = currentCrewId;
                    }
                }
            }
            
            // Always update URL with both chat and crew IDs
            updateUrlWithIds(currentCrewId, id);
            
            // Update UI to mark this chat as active in the sidebar
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
            
            // Load all messages from the conversation history
            conversationHistory.forEach(msg => {
                addMessage(msg.role, msg.content);
            });
            
            // Mark that a chat has been loaded to prevent double initialization
            newChatCreated = true;
            
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
        // Create new chat session with a unique ID
        chatId = generateChatId();
        conversationHistory = [];
        
        // Clear all messages including welcome message
        messagesContainer.innerHTML = '';
        
        // Get the currently selected crew ID
        const selectedCrewId = crewSelect.value || currentCrewId;
        
        // Reset the newChatCreated flag to allow proper initialization
        newChatCreated = false;
        
        // Add a temporary loading message
        addLoadingMessage();
        
        // Update URL with both the selected crew ID and new chat ID
        if (selectedCrewId) {
            updateUrlWithIds(selectedCrewId, chatId);
        }
        
        // Re-initialize with the selected crew
        // This will trigger a full initialization with the crew's welcome message
        initializeChat(selectedCrewId);
    });
    
    // Optional features (placeholders)
    uploadButton.addEventListener('click', function() {
        alert('File upload feature coming soon!');
    });
    
    micButton.addEventListener('click', function() {
        alert('Voice input feature coming soon!');
    });
    
    // Function to load all available crews
    function loadAvailableCrews(initialCrewId = null, initialChatId = null) {
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
                    
                                    // If we have a crew ID from URL and it exists in available crews, use it
                    const targetCrewId = initialCrewId && data.crews.some(crew => crew.id === initialCrewId) 
                        ? initialCrewId 
                        : data.crews[0].id;
                    
                    // Set the current crew ID - this is critical for persistence
                    currentCrewId = targetCrewId;
                    
                    // Set the crew select dropdown to the target crew
                    crewSelect.value = targetCrewId;
                    
                    // Check if we have a specific chat ID from URL
                    const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
                    const history = JSON.parse(storedHistory);
                    
                    if (initialChatId && history[initialChatId]) {
                        // We already loaded this chat in loadChatHistory
                        newChatCreated = true;
                        
                        // Update URL with both chat and crew IDs
                        updateUrlWithIds(targetCrewId, initialChatId);
                    } else {
                        // Update URL with just the crew ID
                        updateUrlWithIds(targetCrewId);
                        
                        // Initialize the target crew if no new chat has been created yet
                        if (!newChatCreated) {
                            newChatCreated = true;
                            // Clear any existing welcome message first
                            messagesContainer.innerHTML = '';
                            initializeChat(targetCrewId);
                        }
                    }
                } else {
                    console.error('No crews available or error loading crews');
                    // If there's an error or no crews, initialize with a default
                    // Set a default crew ID for better persistence
                    currentCrewId = 'default';
                    
                    // Update URL with crew ID and chat ID if available
                    updateUrlWithIds(currentCrewId, initialChatId);
                    
                    // Initialize if no chat has been created yet
                    if (!newChatCreated) {
                        newChatCreated = true;
                        // Clear any existing welcome message first
                        messagesContainer.innerHTML = '';
                        initializeChat(currentCrewId);
                    }
                }
            })
            .catch(error => {
                console.error('Error loading crews:', error);
                // If there's an error, initialize with a default ID for better persistence
                // Set a default crew ID
                currentCrewId = 'default';
                
                // Update URL with crew ID and chat ID if available
                updateUrlWithIds(currentCrewId, initialChatId);
                
                // Initialize if no chat has been created yet
                if (!newChatCreated) {
                    newChatCreated = true;
                    // Clear any existing welcome message first
                    messagesContainer.innerHTML = '';
                    initializeChat(currentCrewId);
                }
            });
    }
    
    function initializeChat(crewId = null) {
        // If a crew ID is provided, update the current crew ID
        if (crewId) {
            currentCrewId = crewId;
            // Also update the URL with the crew ID and chat ID if available
            if (chatId) {
                updateUrlWithIds(crewId, chatId);
            } else {
                updateUrlWithCrewId(crewId);
            }
        }
        
        addLoadingMessage();
        
        let url = '/api/initialize';
        let options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // Include both crew ID and chat ID in the request to ensure thread persistence
        const requestData = {};
        
        if (crewId) {
            requestData.crew_id = crewId;
        } else if (currentCrewId) {
            requestData.crew_id = currentCrewId;
        }
        
        if (chatId) {
            requestData.chat_id = chatId;
        }
        
        // If we have any data to send, use POST method
        if (Object.keys(requestData).length > 0) {
            options.method = 'POST';
            options.body = JSON.stringify(requestData);
            console.log(`Initializing chat with data:`, requestData);
        }
        
        fetch(url, options)
            .then(response => response.json())
            .then(data => {
                removeLoadingMessage();
                
                if (data.status === 'success') {
                    // Update crew info
                    currentCrewId = data.crew_id || crewId;
                    crewNameElement.textContent = data.crew_name || 'CrewAI Chat';
                    crewDescriptionElement.textContent = data.crew_description || '';
                    
                    // Always update URL with the crew ID
                    if (currentCrewId) {
                        // We'll update the URL with the chat ID after createNewChat is called
                        // since that's when we'll have the new chat ID
                        
                        // Update the crew dropdown selection
                        if (crewSelect.querySelector(`option[value="${currentCrewId}"]`)) {
                            crewSelect.value = currentCrewId;
                        }
                    }
                    
                    // Create a new chat with this crew and the current chat ID
                    // This ensures the messages stay in the correct thread
                    createNewChat(data.message, chatId);
                } else {
                    // Even on error, maintain the crew ID if possible
                    if (crewId) {
                        currentCrewId = crewId;
                        updateUrlWithCrewId(currentCrewId);
                        
                        // Try to update the crew dropdown selection
                        if (crewSelect.querySelector(`option[value="${currentCrewId}"]`)) {
                            crewSelect.value = currentCrewId;
                        }
                    }
                    
                    // Display error message
                    messagesContainer.innerHTML = '';
                    addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                    addMessage('assistant', 'Error initializing chat: ' + data.message);
                }
            })
            .catch(error => {
                removeLoadingMessage();
                
                // Even on error, maintain the crew ID if possible
                if (crewId) {
                    currentCrewId = crewId;
                    updateUrlWithCrewId(currentCrewId);
                    
                    // Try to update the crew dropdown selection
                    if (crewSelect.querySelector(`option[value="${currentCrewId}"]`)) {
                        crewSelect.value = currentCrewId;
                    }
                }
                
                messagesContainer.innerHTML = '';
                addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
                addMessage('assistant', 'Error initializing chat. Please check if your crew is correctly set up.');
                console.error('Error:', error);
            });
    }
    
    function createNewChat(initialMessage, existingChatId = null) {
        // Clear messages container
        messagesContainer.innerHTML = '';
        
        // Use the provided chat ID or generate a new one
        if (existingChatId) {
            chatId = existingChatId;
            console.log(`Using existing chat ID: ${chatId}`);
        } else {
            chatId = generateChatId();
            console.log(`Generated new chat ID: ${chatId}`);
        }
        
        // Mark that a new chat has been created
        newChatCreated = true;
        
        // Add welcome message
        addMessage('system', 'Welcome to CrewAI Chat! How can I assist you today?');
        
        // Add the crew's initial message if it exists
        if (initialMessage && initialMessage.trim()) {
            addMessage('assistant', initialMessage);
            
            // Update conversation history
            conversationHistory = [{ role: 'assistant', content: initialMessage }];
            
            // Create a descriptive title based on the crew name if available
            const chatTitle = currentCrewId ? 
                `Chat with ${crewNameElement.textContent}` : 
                'New Chat';
            
            // Save to chat history with the current crew ID
            saveChatToHistory(chatId, chatTitle, conversationHistory);
            
            // Update URL with both chat and crew IDs
            updateUrlWithIds(currentCrewId, chatId);
        } else {
            // Empty conversation history
            conversationHistory = [];
            
            // Create a descriptive title based on the crew name if available
            const chatTitle = currentCrewId ? 
                `Chat with ${crewNameElement.textContent}` : 
                'New Chat';
                
            // Save to chat history with the current crew ID
            saveChatToHistory(chatId, chatTitle, conversationHistory);
            
            // Update URL with both chat and crew IDs
            updateUrlWithIds(currentCrewId, chatId);
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
        
        // Send message to server with chat ID and crew ID for proper thread tracking
        fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message: message,
                chat_id: chatId,
                crew_id: currentCrewId
            }),
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
                
                // Save to chat history with a meaningful title
                const chatTitle = getFirstUserMessage() || 
                    (currentCrewId ? `Chat with ${crewNameElement.textContent}` : 'New Chat');
                
                // Save to chat history and update URL to ensure thread persistence
                saveChatToHistory(chatId, chatTitle, conversationHistory);
                updateUrlWithIds(currentCrewId, chatId);
                
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
            messages: messages,
            crewId: currentCrewId,  // Store the current crew ID with the chat
            crew_name: crewNameElement.textContent,  // Store the crew name
            crew_description: crewDescriptionElement.textContent  // Store the crew description
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
                
                // Clear all messages including welcome
                messagesContainer.innerHTML = '';
                
                // Reset the newChatCreated flag to allow proper initialization
                newChatCreated = false;
                
                // Add a temporary loading message
                addLoadingMessage();
                
                // Get the currently selected crew ID
                const selectedCrewId = crewSelect.value || currentCrewId;
                
                // Update URL with both the new chat ID and crew ID
                if (selectedCrewId) {
                    updateUrlWithIds(selectedCrewId, chatId);
                }
                
                // Re-initialize with the selected crew
                // This will trigger a full initialization with the crew's welcome message
                initializeChat(selectedCrewId);
            }
            
            updateChatHistoryUI();
            return true;
        }
        
        return false;
    }
    
    function loadChatHistory(specificChatId = null) {
        const storedHistory = localStorage.getItem('crewai_chat_history') || '{}';
        const history = JSON.parse(storedHistory);
        
        // If a specific chat ID is provided and exists in history, load it
        if (specificChatId && history[specificChatId]) {
            loadChatById(specificChatId);
        }
        
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
                // Use loadChatById which handles all the necessary updates
                // This ensures consistent behavior when loading chats
                loadChatById(chat.id);
                
                // Mark that a chat has been loaded to prevent double initialization
                newChatCreated = true;
            });
            
            chatHistory.appendChild(historyItem);
        });
    }
    
    // Helper functions
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
});
