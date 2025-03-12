document.addEventListener('DOMContentLoaded', function() {
    const messagesContainer = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const crewNameElement = document.getElementById('crew-name');
    const crewDescriptionElement = document.getElementById('crew-description');
    
    let isProcessing = false;
    
    // Initialize the chat
    initializeChat();
    
    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
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
                    
                    // Add welcome message
                    addMessage('assistant', data.message);
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
        
        // Clear input field
        userInput.value = '';
        
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
        
        // Process markdown-like syntax (basic version)
        let formattedContent = content
            .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
            
        contentDiv.innerHTML = formattedContent;
        messageDiv.appendChild(contentDiv);
        
        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }
    
    function addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.id = 'loading-indicator';
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
});
