/**
 * MAANV.AI — Co-founder.AI Frontend Controller
 * Handles: multi-turn chat, markdown + Mermaid rendering, copy buttons,
 *          prompt chips, auto-grow textarea, scroll reveal, mobile nav.
 */

document.addEventListener("DOMContentLoaded", () => {

    // ============================================================
    //  ELEMENT REFS
    // ============================================================
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chipsWrapper = document.getElementById('prompt-chips-wrapper');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const newChatBtn = document.getElementById('new-chat-btn');

    // ============================================================
    //  SCROLL-REVEAL — Feature cards + step cards + testimonials + pricing
    // ============================================================
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target); // fire once
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

    document.querySelectorAll(
        '.feature-card, .step-card, .testimonial-card, .pricing-card'
    ).forEach(el => revealObserver.observe(el));

    // ============================================================
    //  EARLY EXIT — no chat elements on this page (e.g. pricing page)
    // ============================================================
    if (!chatHistory || !chatInput || !sendBtn) return;

    // ============================================================
    //  CONVERSATION HISTORY (multi-turn context memory)
    //  Format: [{ role: 'user'|'assistant', content: '...' }, ...]
    // ============================================================
    let conversationHistory = [];

    // ============================================================
    //  APPEND MESSAGE — renders markdown + Mermaid charts for AI
    // ============================================================
    async function appendMessage(type, text) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${type}`;

        if (type === 'ai') {
            // Render markdown
            if (window.marked) {
                bubble.innerHTML = window.marked.parse(text);
            } else {
                bubble.textContent = text;
            }
            chatHistory.appendChild(bubble);
            scrollToBottom();

            // Render Mermaid diagrams
            if (window.mermaid) {
                const mermaidBlocks = bubble.querySelectorAll('.language-mermaid, code.language-mermaid');
                for (let block of mermaidBlocks) {
                    const code = block.textContent.trim();
                    if (!code) continue;
                    try {
                        const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                        const { svg } = await window.mermaid.render(id, code);
                        const wrapper = document.createElement('div');
                        wrapper.className = 'ai-chart-render';
                        wrapper.innerHTML = `
                            <div class="chart-controls">
                                <button class="chart-btn" onclick="downloadChart('${id}')" title="Download SVG">⬇</button>
                                <button class="chart-btn" onclick="toggleFullscreenChart('${id}')" title="Toggle Fullscreen">⛶</button>
                            </div>
                            <div id="${id}-container" class="svg-container">${svg}</div>
                        `;
                        // Replace the pre>code block
                        const preEl = block.closest('pre') || block;
                        preEl.replaceWith(wrapper);
                    } catch (err) {
                        console.warn("Mermaid render error:", err);
                    }
                }
            }

            // Inject copy button
            injectCopyButton(bubble, text);
            scrollToBottom();

        } else {
            // Human bubble — plain text
            bubble.textContent = text;
            chatHistory.appendChild(bubble);
            scrollToBottom();
        }

        return bubble;
    }

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // ============================================================
    //  COPY BUTTON — injected on every AI response
    // ============================================================
    function injectCopyButton(bubble, rawText) {
        const btn = document.createElement('button');
        btn.className = 'bubble-copy-btn';
        btn.innerHTML = '⎘ Copy';
        btn.title = 'Copy response to clipboard';

        btn.addEventListener('click', async () => {
            try {
                // Copy the raw markdown text (cleaner than innerHTML)
                await navigator.clipboard.writeText(rawText);
                btn.innerHTML = '✓ Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = '⎘ Copy';
                    btn.classList.remove('copied');
                }, 2200);
            } catch {
                btn.innerHTML = 'Failed';
                setTimeout(() => { btn.innerHTML = '⎘ Copy'; }, 2000);
            }
        });

        bubble.appendChild(btn);
    }

    // ============================================================
    //  HANDLE SEND
    // ============================================================
    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Auth gate — redirect to login if not logged in (unless on landing page for the first time)
        const isLoggedIn = localStorage.getItem('user_logged_in');
        const onLanding = window.location.pathname === '/' || window.location.pathname === '/index.html';
        const hasUsedFreeTrial = localStorage.getItem('maanv_free_trial_used');

        if (!isLoggedIn) {
            if (onLanding && !hasUsedFreeTrial) {
                // Allow ONE free message on landing
                localStorage.setItem('maanv_free_trial_used', 'true');
            } else {
                sessionStorage.setItem("pending_first_msg", text);
                window.location.href = '/login';
                return;
            }
        }

        // Landing page teleporter (for logged in users only, or after trial)
        if (onLanding && isLoggedIn) {
            sessionStorage.setItem("pending_first_msg", text);
            window.location.href = '/chat';
            return;
        }

        // Clear input & reset textarea height
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Hide prompt chips after first message
        if (chipsWrapper) chipsWrapper.style.display = 'none';

        // Show user bubble
        await appendMessage('human', text);

        // Show typing indicator with dynamic text
        const thinkingMessages = [
            "Co-founder.AI is thinking",
            "Analyzing market fit...",
            "Validating unit economics...",
            "Drafting GTM roadmap...",
            "Checking competitive landscape...",
            "Consulting the neural network..."
        ];
        let msgIndex = 0;
        const typingBubble = document.createElement('div');
        typingBubble.className = 'chat-bubble ai typing';
        typingBubble.textContent = thinkingMessages[0];
        chatHistory.appendChild(typingBubble);
        scrollToBottom();

        const thinkingInterval = setInterval(() => {
            msgIndex = (msgIndex + 1) % thinkingMessages.length;
            typingBubble.textContent = thinkingMessages[msgIndex];
        }, 1500);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify({
                    message: text,
                    history: conversationHistory   // ← send full context
                })
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            clearInterval(thinkingInterval);
            typingBubble.remove();

            const reply = data.response || "I didn't receive a response. Please try again.";
            await appendMessage('ai', reply);

            // Update conversation history for multi-turn context
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: reply });

            // Update sidebar with snippet of conversation
            updateSidebarHistory(text);

        } catch (error) {
            console.error("Chat error:", error);
            clearInterval(thinkingInterval);
            typingBubble.remove();
            await appendMessage('ai',
                "Hmm, I couldn't reach my neural network. Make sure the Flask server is running (`python app.py`) and the GROQ_API_KEY is set."
            );
        }
    }

    // ============================================================
    //  SIDEBAR — dynamic conversation history snippets
    // ============================================================
    function updateSidebarHistory(lastMessage) {
        const historyList = document.getElementById('sidebar-history-list');
        if (!historyList) return;

        // Only create a new item on the first message of a session
        if (conversationHistory.length === 2) {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = lastMessage.slice(0, 45) + (lastMessage.length > 45 ? '...' : '');
            item.title = lastMessage;
            // Insert after the "Current Conversation" placeholder
            const current = document.getElementById('current-session-item');
            if (current) current.after(item);
        }
    }

    // ============================================================
    //  CLEAR CHAT
    // ============================================================
    function clearChat() {
        conversationHistory = [];
        if (chipsWrapper) chipsWrapper.style.display = '';
        // Remove all bubbles except the welcome message (first 2 children)
        const children = Array.from(chatHistory.children);
        children.slice(2).forEach(el => el.remove());
    }

    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Clear this conversation? This cannot be undone.')) {
                clearChat();
            }
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            clearChat();
            chatInput.focus();
        });
    }

    // ============================================================
    //  PROMPT CHIPS
    // ============================================================
    document.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const msg = chip.getAttribute('data-msg');
            if (msg) {
                chatInput.value = msg;
                autoGrowTextarea();
                chatInput.focus();
                handleSend();
            }
        });
    });

    // ============================================================
    //  AUTO-GROW TEXTAREA
    // ============================================================
    function autoGrowTextarea() {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
    }

    if (chatInput && chatInput.tagName === 'TEXTAREA') {
        chatInput.addEventListener('input', autoGrowTextarea);
    }

    // ============================================================
    //  SEND BUTTON + KEYBOARD SHORTCUTS
    // ============================================================
    if (sendBtn) {
        sendBtn.addEventListener('click', handleSend);
    }

    chatInput.addEventListener('keydown', (e) => {
        // Enter on the landing page input (not textarea) — plain Enter sends
        if (chatInput.tagName === 'INPUT' && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
            return;
        }
        // Chat page textarea — Ctrl+Enter sends, plain Enter = newline
        if (chatInput.tagName === 'TEXTAREA') {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
            }
        }
    });

    // ============================================================
    //  WATCH DEMO BUTTON (landing page)
    // ============================================================
    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
        demoBtn.addEventListener('click', () => {
            alert("🎬 The interactive demo is currently being produced. Check back very soon!");
        });
    }

    // ============================================================
    //  DYNAMIC AUTH STATE — landing page nav button
    // ============================================================
    const ctaBtn = document.getElementById('auth-btn');
    if (ctaBtn && localStorage.getItem('user_logged_in')) {
        ctaBtn.textContent = "Go to Dashboard →";
        ctaBtn.removeAttribute("onclick");
        ctaBtn.addEventListener('click', () => window.location.href = '/chat');
    }

    // ============================================================
    //  ONBOARDING TRIGGER — "Meet Co-founder.AI" button  
    // ============================================================
    window.triggerOnboarding = function () {
        const preview = document.querySelector('.product-preview');
        if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            appendMessage('ai',
                "Hello! 👋 I'm **Co-founder.AI** — your elite AI business partner built for the Indian ecosystem.\n\n" +
                "I can help you with:\n- 💡 Idea validation & PMF analysis\n- 📊 Pitch decks & financial models\n- 📈 GTM strategy & unit economics\n- 🏗️ Technical architecture & MVP planning\n\n" +
                "So tell me — **what are we building today?**"
            );
        }, 500);

        setTimeout(() => chatInput.focus(), 1400);
    };

});

// ============================================================
//  MOBILE NAV TOGGLES (global scope)
// ============================================================
window.toggleMobileNav = function () {
    const nav = document.getElementById('nav-links');
    if (nav) nav.classList.toggle('active');
};

window.toggleSidebar = function () {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!sidebar) return;
    sidebar.classList.toggle('active');
    if (overlay) {
        overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
    }
};

// ============================================================
//  CHART HELPERS (Download & Fullscreen)
// ============================================================
window.downloadChart = function(id) {
    const container = document.getElementById(id + '-container');
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maanv-strategy-${id}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

window.toggleFullscreenChart = function(id) {
    const container = document.getElementById(id + '-container');
    if (!container) return;
    
    if (document.fullscreenElement) {
        document.exitFullscreen();
        container.classList.remove('fullscreen-svg');
    } else {
        container.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
        container.classList.add('fullscreen-svg');
    }
};

// Handle fullscreen change to remove class if exited via ESC
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.querySelectorAll('.svg-container').forEach(el => el.classList.remove('fullscreen-svg'));
    }
});
