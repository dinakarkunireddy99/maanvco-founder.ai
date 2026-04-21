import os
import sqlite3
import re
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify,
    session, redirect, url_for
)
from flask_cors import CORS
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_seasurf import SeaSurf
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from groq import Groq

# ─────────────────────────────────────────────
#  APP CONFIG
# ─────────────────────────────────────────────
app = Flask(__name__)

# Enforce secret key from environment
app.secret_key = os.environ.get("SECRET_KEY")
if not app.secret_key:
    # Use a secure fallback for dev, but in prod this must be set
    app.secret_key = "maanv-dev-fallback-key-2026-secure-32782"

CORS(app, supports_credentials=True)

# CSRF Protection
csrf = SeaSurf(app)

# Security Headers (Talisman)
csp = {
    'default-src': '\'self\'',
    'script-src': [
        '\'self\'',
        'https://cdn.jsdelivr.net',
        '\'unsafe-inline\'', 
        '\'unsafe-eval\''
    ],
    'style-src': [
        '\'self\'',
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net',
        '\'unsafe-inline\''
    ],
    'font-src': [
        '\'self\'',
        'https://fonts.gstatic.com',
        'data:'
    ],
    'img-src': [
        '\'self\'',
        'data:',
        'https://www.svgrepo.com'
    ]
}
talisman = Talisman(app, content_security_policy=csp, force_https=False)

# Rate Limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "100 per hour"],
    storage_uri="memory://"
)

# Password Hashing (Argon2)
ph = PasswordHasher()

# ─────────────────────────────────────────────
#  GROQ CLIENT
# ─────────────────────────────────────────────
api_key = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=api_key) if api_key else None

# ─────────────────────────────────────────────
#  DATABASE SETUP  (SQLite — zero dependencies)
# ─────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name   TEXT    NOT NULL,
                email       TEXT    NOT NULL UNIQUE,
                password    TEXT    NOT NULL,
                provider    TEXT    DEFAULT 'email',
                created_at  TEXT    NOT NULL
            )
        """)
        conn.commit()


init_db()

# ─────────────────────────────────────────────
#  AI SYSTEM PROMPT (The Elite Co-founder Persona)
# ─────────────────────────────────────────────
SYSTEM_PROMPT = """You are Co-founder.AI, an elite Indian Tech Startup Co-founder and active VC.
You act like a brilliant, data-driven, visionary business partner operating specifically in the massive Indian Startup Ecosystem.
When the user asks you a question or pitches an idea, you MUST reply with high-value insights, actionable frameworks, deep analytics, and strategic foresight.

Follow these strict persona rules:
1. **Be Elite & Opinionated**: You are wildly brilliant, extremely fast, and direct. You hate mediocrity. Use Indian VC/Startup context (e.g., Tier-1 vs Tier-2 cities, INR (₹) pricing, UPI scaling, Peak XV/Sequoia India benchmarks, ONDC ripple effects).
2. **Data-First Analysis**: Constantly provide deep data analytics, mathematical tables, and CAC vs LTV unit economics. If you discuss growth, you MUST discuss the "Magic Number" or "Rule of 40".
3. **Structured Excellence**: Use markdown headings (###), bold text, and numbered lists beautifully. Your responses should look like professional strategy documents.
4. **Visual Strategy**: You MUST generate visual graphs to prove your point using Mermaid.js! 
   - ALWAYS include a Mermaid chart if discussing data, revenue, pipelines, or user flows.
   - Use `pie`, `graph TD`, or `sequenceDiagram` as appropriate.
5. **No Placeholders**: Never say "I can help you with X". Just DO it. Provide the actual strategy, the actual numbers, and the actual roadmap immediately.
6. **Tone**: Premium, elite, high-energy, and deeply knowledgeable about Indian logistics, consumer behavior, and regulatory (RBI/SEBI) landscapes.

Example Output Structure:
### 📈 Market Analysis: [Topic]
[Insightful paragraph about the Indian context]

```mermaid
graph TD
    A[User Acquisition] --> B[Activation]
    B --> C[Retention]
    C --> D[Revenue]
```

### 💸 Unit Economics & Projections
[Table with metrics like CAC, LTV, Payback Period in INR]
"""

# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────
def is_valid_email(email: str) -> bool:
    return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email.strip()))


def login_required(f):
    """Decorator to protect routes that need an authenticated session."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"status": "error", "message": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────
#  PAGE ROUTES
# ─────────────────────────────────────────────
@app.route('/')
def home():
    return render_template('index.html')


@app.route('/login')
def login_page():
    if "user_id" in session:
        return redirect(url_for('chat'))
    return render_template('login.html')


@app.route('/chat')
def chat():
    if "user_id" not in session:
        return redirect(url_for('login_page'))
    return render_template('chat.html')


# ─────────────────────────────────────────────
#  AUTH API
# ─────────────────────────────────────────────
@app.route('/api/register', methods=['POST'])
@limiter.limit("10 per hour")
def register():
    """Register a new user (email/password or social provider)."""
    data = request.get_json(silent=True) or {}
    full_name = data.get('full_name', '').strip()
    email     = data.get('email', '').strip().lower()
    password  = data.get('password', '').strip()
    provider  = data.get('provider', 'email')  # 'email' | 'google' | 'github' | 'apple'

    # ── Validation ──
    if not full_name:
        return jsonify({"status": "error", "message": "Full name is required."}), 400
    if not is_valid_email(email):
        return jsonify({"status": "error", "message": "Please enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"status": "error", "message": "Password must be at least 8 characters."}), 400

    hashed = ph.hash(password)

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (full_name, email, password, provider, created_at) VALUES (?,?,?,?,?)",
                (full_name, email, hashed, provider, datetime.utcnow().isoformat())
            )
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "An account with this email already exists."}), 409

    # Create session
    session.permanent = True
    session['user_id']   = user['id']
    session['user_name'] = user['full_name']
    session['email']     = user['email']

    return jsonify({
        "status": "success",
        "message": f"Welcome to MAANV.AI, {full_name.split()[0]}!",
        "user": {"name": full_name, "email": email}
    }), 201


@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per hour")
def login_api():
    """Login with email + password."""
    data = request.get_json(silent=True) or {}
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not is_valid_email(email):
        return jsonify({"status": "error", "message": "Please enter a valid email address."}), 400
    if not password:
        return jsonify({"status": "error", "message": "Password is required."}), 400

    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()

    if not user:
        return jsonify({"status": "error", "message": "Invalid email or password."}), 401

    try:
        ph.verify(user['password'], password)
    except VerifyMismatchError:
        return jsonify({"status": "error", "message": "Invalid email or password."}), 401
    except Exception:
        return jsonify({"status": "error", "message": "Authentication failed."}), 401

    # Create session
    session.permanent = True
    session['user_id']   = user['id']
    session['user_name'] = user['full_name']
    session['email']     = user['email']

    return jsonify({
        "status": "success",
        "message": f"Welcome back, {user['full_name'].split()[0]}!",
        "user": {"name": user['full_name'], "email": user['email']}
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    """Destroy server-side session."""
    session.clear()
    return jsonify({"status": "success", "message": "Logged out successfully."})


@app.route('/api/me', methods=['GET'])
def me():
    """Return current logged-in user info (used by frontend on load)."""
    if "user_id" not in session:
        return jsonify({"status": "guest"}), 200
    return jsonify({
        "status": "authenticated",
        "user": {
            "name":  session.get('user_name'),
            "email": session.get('email')
        }
    })


# ─────────────────────────────────────────────
#  CHAT API
# ─────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": "llama-3.3-70b-versatile",
        "ai_ready": client is not None,
        "authenticated": "user_id" in session
    })


@app.route('/api/chat', methods=['POST'])
@login_required
def chat_api():
    """
    Protected chat endpoint.
    Accepts: { message: str, history: [{role, content}] }
    """
    data         = request.get_json(silent=True) or {}
    user_message = data.get('message', '').strip()
    history      = data.get('history', [])

    if not user_message:
        return jsonify({"status": "error", "message": "Message cannot be empty."}), 400

    if not client:
        demo_reply = (
            "Hello! I am Co-founder.AI. "
            "My creator hasn't added the **GROQ_API_KEY** environment variable. "
            "Get a free key in 5 seconds at https://console.groq.com/keys — "
            "Once added, I'll be powered by Llama 3.3-70B!"
        )
        return jsonify({"status": "success", "response": demo_reply})

    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        for turn in history:
            if turn.get("role") in ("user", "assistant") and turn.get("content"):
                messages.append({"role": turn["role"], "content": turn["content"]})

        messages.append({"role": "user", "content": user_message})

        completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.75,
            max_tokens=2048,
        )
        reply = completion.choices[0].message.content

    except Exception as e:
        err = str(e)
        if "429" in err:
            reply = "⏳ I'm thinking too fast! (Groq Rate Limit hit). Wait a moment and try again."
        elif "401" in err:
            reply = "🔑 Invalid GROQ_API_KEY. Please check your environment variable."
        else:
            reply = f"⚠️ Error reaching my neural net: {err}"

    return jsonify({"status": "success", "response": reply})


# ─────────────────────────────────────────────
#  RUN
# ─────────────────────────────────────────────
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
