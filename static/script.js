document.addEventListener("DOMContentLoaded", () => {
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    // 1. Scroll Reveal Animations (Feature Cards)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card').forEach(el => {
        observer.observe(el);
    });

    // 2. Interactive Chat Logic
    if(!chatHistory || !chatInput || !sendBtn) return;

    async function appendMessage(type, text) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${type}`;
        
        if (type === 'ai') {
            // Render advanced Markdown formats
            if (window.marked) {
                bubble.innerHTML = window.marked.parse(text);
            } else {
                bubble.textContent = text;
            }
            chatHistory.appendChild(bubble);
            chatHistory.scrollTop = chatHistory.scrollHeight;

            // Intercept Mermaid code blocks and actively draw the graphics!
            if (window.mermaid) {
                const mermaidBlocks = bubble.querySelectorAll('.language-mermaid');
                for (let i = 0; i < mermaidBlocks.length; i++) {
                    const block = mermaidBlocks[i];
                    const graphCode = block.textContent;
                    try {
                        const id = 'render-' + Math.random().toString(36).substr(2, 9);
                        const { svg } = await window.mermaid.render(id, graphCode);
                        // Replace the code block box with the stunning SVG drawing!
                        block.parentElement.outerHTML = `<div class="ai-chart-render" style="background:#ffffff; border-radius:10px; padding:10px; margin: 15px 0;">${svg}</div>`;
                    } catch(e) {
                         console.error("Chart Math Error:", e);
                    }
                }
            }
            chatHistory.scrollTop = chatHistory.scrollHeight;
        } else {
            bubble.textContent = text;
            chatHistory.appendChild(bubble);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    async function handleSend() {
        const text = chatInput.value.trim();
        if(!text) return;
        
        // --- 0. AUTHENTICATION LOCK TASTE-OF-MAGIC ---
        if (!localStorage.getItem('user_logged_in')) {
            // They typed their masterplan! Now we redirect them to sign up to get the answer.
            window.location.href = '/login';
            return;
        }
        
        // --- 0.5 HOMEPAGE TELEPORTER ---
        // If we are on the tiny landing page, take them to the full dashboard box!
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            sessionStorage.setItem("pending_first_msg", text);
            window.location.href = '/chat';
            return;
        }
        
        chatInput.value = ''; // clear input field
        
        // --- 1. Show user message instantly ---
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble human';
        userBubble.textContent = text;
        chatHistory.appendChild(userBubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        // --- 2. Show AI thinking indicator ---
        const typingBubble = document.createElement('div');
        typingBubble.className = 'chat-bubble ai typing';
        chatHistory.appendChild(typingBubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        // --- 3. Fetch from Python Server ---
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) throw new Error("Backend not reached");
            const data = await response.json();
            
            // --- 4. Remove typing indicator & print official response ---
            typingBubble.remove();
            appendMessage('ai', data.response);

        } catch (error) {
            console.error("Backend error:", error);
            typingBubble.remove();
            appendMessage('ai', "Hmm, I couldn't connect to my Python brain. Make sure you started the backend server using 'python app.py' in the terminal!");
        }
    }

    // --- 5. Watch Demo Button Logic ---
    const demoBtn = document.querySelector('.secondary-btn');
    if (demoBtn) {
        demoBtn.addEventListener('click', () => {
            alert("The interactive demo presentation is currently being rendered. Check back soon!");
        });
    }

    // Attach click and enter key handlers
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') handleSend();
    });

    // We removed the aggressive focus interceptor so the user can type their intent hook!

    // --- 6. Dynamic Account State (Logout Button Override) ---
    const ctaBtn = document.querySelector('.cta-btn');
    if (ctaBtn && localStorage.getItem('user_logged_in')) {
        ctaBtn.textContent = "Log Out";
        ctaBtn.title = "Log out from MAANV.AI";
        // Remove the old /login onclick attribute generated by HTML directly
        ctaBtn.removeAttribute("onclick");
        ctaBtn.addEventListener('click', () => {
            localStorage.removeItem('user_logged_in');
            window.location.reload(); // Refresh page to relock chat
        });
    }

    // --- 7. Taste of Magic Onboarding Trigger ---
    window.triggerOnboarding = function() {
        // 1. Smoothly scroll down to center the chat window
        document.querySelector('.product-preview').scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 2. Add an engaging AI greeting after a short dramatic pause
        setTimeout(() => {
            appendMessage('ai', "Hello! I am your new AI Co-founder. Before we start building your next unicorn, tell me... what industry are you disrupting today?");
        }, 600);
        
        // 3. Auto-focus the input shortly after starting to type
        setTimeout(() => {
            chatInput.focus();
        }, 1500);
    };
});

// --- MOBILE RESPONSIVENESS LOGIC ---
window.toggleMobileNav = function() {
    const nav = document.getElementById('nav-links');
    if(nav) nav.classList.toggle('active');
}

window.toggleSidebar = function() {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if(sidebar) {
        sidebar.classList.toggle('active');
        if(sidebar.classList.contains('active')) {
            overlay.style.display = "block";
        } else {
            overlay.style.display = "none";
        }
    }
}
