import os
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from groq import Groq

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes (future API use)

# Configure the Groq AI client
api_key = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=api_key) if api_key else None

# The elite Co-founder system prompt
SYSTEM_PROMPT = """You are Co-founder.AI, an elite Indian Tech Startup Co-founder and active VC.
You act like a brilliant, data-driven, visionary business partner operating specifically in the massive Indian Startup Ecosystem.
When the user asks you a question or pitches an idea, you MUST reply with high-value insights, actionable frameworks, deep analytics, and strategic foresight.

Follow these strict persona rules:
1. Be opinionated, wildly brilliant, and extremely fast. Use Indian VC/Startup context (e.g., Tier-1 vs Tier-2 cities, INR (₹) pricing, UPI scaling, Peak XV/Sequoia India benchmarks).
2. Constantly provide deep data analytics, mathematical tables, and CAC vs LTV unit economics.
3. STRUCTURE: Use markdown headings, bold text, and numbered lists beautifully.
4. GRAPHICAL CHARTS: You MUST generate visual graphs to prove your point! To do this, simply output a Mermaid.js code block. ALWAYS include a Mermaid chart if discussing data, revenue, or pipelines!
Example:
```mermaid
pie title Indian Market Share
    "Tier 1" : 45
    "Tier 2" : 35
    "Tier 3" : 20
```
5. Keep responses punchy, actionable, and never generic. You are the best co-founder money can't buy.
"""

@app.route('/')
def home():
    """Route that serves your main HTML page."""
    return render_template('index.html')

@app.route('/login')
def login():
    """Route that serves the login and registration page."""
    return render_template('login.html')

@app.route('/chat')
def chat():
    """Route that serves the massive Full-Box SaaS workspace."""
    return render_template('chat.html')

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint — useful for uptime monitoring."""
    return jsonify({
        "status": "ok",
        "model": "llama-3.3-70b-versatile",
        "ai_ready": client is not None
    })

@app.route('/api/chat', methods=['POST'])
def chat_api():
    """
    API route that connects our frontend JavaScript to the real AI backend.
    Accepts a full conversation history for multi-turn dialogue context.
    """
    data = request.json
    user_message = data.get('message', '')
    # Full conversation history from the frontend (list of {role, content} dicts)
    history = data.get('history', [])

    # If there is no Groq API key, guide them to the free portal.
    if not client:
        demo_reply = (
            "Hello! I am Co-founder.AI. "
            "My creator hasn't added the 'GROQ_API_KEY' environment variable. "
            "You can get a screaming-fast, completely FREE API key in 5 seconds at https://console.groq.com/keys — "
            "Once added to the server, I will be powered by Llama 3.3-70B!"
        )
        return jsonify({"status": "success", "response": demo_reply})

    try:
        # Build the full message thread: system + history + new user message
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Append prior conversation turns for context memory
        for turn in history:
            if turn.get("role") in ("user", "assistant") and turn.get("content"):
                messages.append({"role": turn["role"], "content": turn["content"]})

        # Append the new user message
        messages.append({"role": "user", "content": user_message})

        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.75,
            max_tokens=2048,  # Upgraded from 1500 for richer, deeper responses
        )

        reply = chat_completion.choices[0].message.content

    except Exception as e:
        error_str = str(e)
        if "429" in error_str:
            reply = "I'm thinking too fast! (Groq Rate Limit). Try waiting a moment to reset the limit."
        else:
            reply = f"Ah, I ran into an error connecting to my neural net: {error_str}"

    return jsonify({
        "status": "success",
        "response": reply
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
