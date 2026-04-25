(function () {
  //inject style
  const style = document.createElement('style');
  style.textContent = `
    #chatbot-toggle {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 1050;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #0d6efd;
      border: none;
      color: white;
      font-size: 1.4rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.15s;
    }
    #chatbot-toggle:hover { background: white; color: #0d6efd; }

    #chatbot-panel {
      position: fixed;
      bottom: 5.5rem;
      right: 1.5rem;
      z-index: 1049;
      width: 340px;
      height: 480px;
      background: white;
      border: 1px solid #dee2e6;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: opacity 0.2s, transform 0.2s;
    }
    #chatbot-panel.chatbot-hidden {
      opacity: 0;
      transform: translateY(12px);
      pointer-events: none;
    }

    #chatbot-header {
      background: #0d6efd;
      color: white;
      padding: 0.75rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    #chatbot-header span { font-weight: 600; font-size: 0.95rem; }
    #chatbot-clear {
      background: none;
      border: none;
      color: rgba(255,255,255,0.75);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0;
    }
    #chatbot-clear:hover { color: white; }

    #chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .chatbot-msg {
      max-width: 82%;
      padding: 0.45rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      line-height: 1.45;
      word-break: break-word;
    }
    .chatbot-msg.user {
      align-self: flex-end;
      background: #0d6efd;
      color: white;
      border-bottom-right-radius: 3px;
    }
    .chatbot-msg.bot {
      align-self: flex-start;
      background: #f1f3f5;
      color: #212529;
      border-bottom-left-radius: 3px;
    }
    .chatbot-msg.bot.loading { color: #6c757d; font-style: italic; }

    #chatbot-footer {
      border-top: 1px solid #dee2e6;
      padding: 0.6rem;
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    #chatbot-input {
      flex: 1;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 0.4rem 0.65rem;
      font-size: 0.875rem;
      outline: none;
      resize: none;
      font-family: inherit;
    }
    #chatbot-input:focus { border-color: #0d6efd; box-shadow: 0 0 0 2px rgba(13,110,253,0.15); }
    #chatbot-send {
      background: #0d6efd;
      border: none;
      color: white;
      border-radius: 8px;
      padding: 0.4rem 0.75rem;
      font-size: 0.875rem;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    #chatbot-send:hover { background: #0b5ed7; }
    #chatbot-send:disabled { background: #6c757d; cursor: not-allowed; }

    @media (max-width: 480px) {
      #chatbot-panel { width: calc(100vw - 2rem); right: 1rem; left: 1rem; }
    }
  `;
  document.head.appendChild(style);

  //inject html
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button id="chatbot-toggle" aria-label="Open AI assistant" title="AI Assistant">💬</button>

    <div id="chatbot-panel" class="chatbot-hidden" aria-live="polite">
      <div id="chatbot-header">
        <span>AI Assistant</span>
      </div>
      <div id="chatbot-messages"></div>
      <div id="chatbot-footer">
        <textarea id="chatbot-input" rows="1" placeholder="Ask something…" maxlength="500"></textarea>
        <button id="chatbot-send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const panel      = document.getElementById('chatbot-panel');
  const toggle     = document.getElementById('chatbot-toggle');
  const messages   = document.getElementById('chatbot-messages');
  const input      = document.getElementById('chatbot-input');
  const sendBtn    = document.getElementById('chatbot-send');
  let isOpen       = false;
  let history      = JSON.parse(localStorage.getItem('chatbot_history') || '[]');

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = `chatbot-msg ${role === 'user' ? 'user' : 'bot'}`;
    el.textContent = text;
    messages.appendChild(el);
    scrollToBottom();
    return el;
  }

  function setLoading(isLoading) {
    sendBtn.disabled = isLoading;
    input.disabled   = isLoading;
  }

  //keep chat history
  history.forEach(msg => appendMessage(msg.role, msg.content));

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('chatbot-hidden', !isOpen);
    toggle.textContent = isOpen ? '✕' : '💬';
    if (isOpen) {
      input.focus();
      scrollToBottom();
    }
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    localStorage.setItem('chatbot_history', JSON.stringify(history));

    setLoading(true);
    const loadingEl = appendMessage('bot', 'Thinking…');
    loadingEl.classList.add('loading');

    try {
      //CONNECT API HERE
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('token')
            ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
            : {}),
        },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.reply || data.error || 'Request failed');
      const reply = data.reply || 'Sorry, I didn\'t get a response.';

      loadingEl.textContent = reply;
      loadingEl.classList.remove('loading');
      history.push({ role: 'assistant', content: reply });
      localStorage.setItem('chatbot_history', JSON.stringify(history));

    } catch (error) {
      loadingEl.textContent = error.message || 'Something went wrong. Please try again.';
      loadingEl.classList.remove('loading');
      history.pop();
      localStorage.setItem('chatbot_history', JSON.stringify(history));
    } finally {
      setLoading(false);
      input.focus();
      scrollToBottom();
    }
  }

  sendBtn.addEventListener('click', sendMessage);

  // Send on Enter (Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

})();
