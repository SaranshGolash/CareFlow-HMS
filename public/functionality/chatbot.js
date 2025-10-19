document.addEventListener('DOMContentLoaded', function() {
    const chatbotForm = document.getElementById('chatbotForm');
    const chatbotInput = document.getElementById('chatbotInput');
    const chatbotBody = document.getElementById('chatbotBody');
    const chatbotModalElement = document.getElementById('chatbotModal');

    // --- Function to add a message to the chat window ---
    function addMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', sender); // 'user' or 'bot'

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.textContent = message;

        messageDiv.appendChild(contentDiv);
        chatbotBody.appendChild(messageDiv);

        // Scroll to the bottom
        chatbotBody.scrollTop = chatbotBody.scrollHeight;
    }

    // --- Function to show bot is typing ---
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('chat-message', 'bot', 'typing-indicator');
        typingDiv.innerHTML = `
            <div class="message-content">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
        `;
        chatbotBody.appendChild(typingDiv);
        chatbotBody.scrollTop = chatbotBody.scrollHeight;
    }
    
    // --- Function to remove typing indicator ---
    function removeTypingIndicator() {
        const indicator = chatbotBody.querySelector('.typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // --- Handle Form Submission ---
    if (chatbotForm) {
        chatbotForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const messageText = chatbotInput.value.trim();

            if (!messageText) return;

            // 1. Display user's message
            addMessage(messageText, 'user');
            chatbotInput.value = ''; // Clear input

            // 2. Show typing indicator
            showTypingIndicator();

            // 3. Send message to backend API
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: messageText }),
                });

                removeTypingIndicator(); // Remove indicator once response starts

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // 4. Display bot's reply
                addMessage(data.reply, 'bot');

            } catch (error) {
                removeTypingIndicator(); // Ensure indicator is removed on error too
                console.error('Error sending message:', error);
                addMessage('Sorry, something went wrong. Please try again later.', 'bot');
            }
        });
    }

    // --- Optional: Focus input when modal opens ---
    if (chatbotModalElement) {
        chatbotModalElement.addEventListener('shown.bs.modal', function () {
            chatbotInput.focus();
        });
    }
    
    // --- CSS for Typing Indicator (Inject or add to chatbot.css) ---
    const style = document.createElement('style');
    style.innerHTML = `
        .typing-indicator .dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #aaa;
            margin: 0 2px;
            animation: typing 1s infinite ease-in-out;
        }
        .typing-indicator .dot:nth-child(1) { animation-delay: 0s; }
        .typing-indicator .dot:nth-child(2) { animation-delay: 0.1s; }
        .typing-indicator .dot:nth-child(3) { animation-delay: 0.2s; }
        @keyframes typing {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }
    `;
    document.head.appendChild(style);

});