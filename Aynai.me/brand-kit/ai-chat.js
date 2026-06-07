/* ==================================================================
   AYN AI · Generator AI chat module
   Calls OpenAI API directly with a user-provided key stored in
   localStorage. Side-by-side chat that fills the doc state.
   ================================================================== */

(function () {
  const MEMORY_KEY = 'aynai-generator-memory';
  const KEY_KEY = 'aynai-openai-key';
  const MODEL = 'gpt-4o-mini';

  function loadMemory() {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveMemory(patch) {
    const cur = loadMemory();
    const next = { ...cur, ...patch };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    return next;
  }
  function getKey() { return localStorage.getItem(KEY_KEY) || ''; }
  function setKey(v) { localStorage.setItem(KEY_KEY, v); }

  async function callOpenAI({ key, messages, system }) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'system', content: system }, ...messages],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`API ${r.status}: ${txt.slice(0, 200)}`);
    }
    const data = await r.json();
    return (data.choices?.[0]?.message?.content) || '';
  }

  function mountChat({ docType, getState, applyJson, schemaHint, examples }) {
    const formScroll = document.querySelector('.form-pane .form-scroll');
    if (!formScroll) return;

    const chat = document.createElement('div');
    chat.className = 'ai-chat';
    chat.innerHTML = `
      <div class="ai-chat-head">
        <span class="ai-chat-title">✦ Fill with AI</span>
        <button class="ai-chat-clear" type="button" title="Clear chat">clear</button>
      </div>
      <p class="ai-chat-hint">Describe what you're sending the customer. The AI fills the doc.</p>
      <div class="ai-key-row" id="ai-key-row" style="${getKey() ? 'display:none;' : ''}">
        <input type="password" id="ai-key-input" placeholder="paste OpenAI API key (sk-...)" />
        <button class="btn" type="button" id="ai-key-save">save</button>
      </div>
      <div class="ai-key-hint" id="ai-key-hint" style="${getKey() ? '' : 'display:none;'}">
        ✓ key saved · <a href="#" id="ai-key-edit">change</a> · <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">get key</a>
      </div>
      <div class="ai-chat-log" id="ai-chat-log"></div>
      <div class="ai-chat-input-wrap">
        <textarea id="ai-chat-input" rows="3" placeholder="${examples || 'e.g. invoice welUp $500 build + 3×$100 retainer · jane@welup.io · due in 3 days'}"></textarea>
        <button class="ai-chat-send btn primary" type="button">Send →</button>
      </div>
      <div class="ai-chat-foot">
        <span id="ai-chat-status">ready · client memory: <b id="ai-mem-name">none</b></span>
      </div>
    `;
    const head = formScroll.querySelector('.form-head');
    if (head && head.nextSibling) {
      formScroll.insertBefore(chat, head.nextSibling.nextSibling || head.nextSibling);
    } else {
      formScroll.insertBefore(chat, formScroll.firstChild);
    }

    const log = chat.querySelector('#ai-chat-log');
    const input = chat.querySelector('#ai-chat-input');
    const sendBtn = chat.querySelector('.ai-chat-send');
    const clearBtn = chat.querySelector('.ai-chat-clear');
    const statusEl = chat.querySelector('#ai-chat-status');
    const memNameEl = chat.querySelector('#ai-mem-name');
    const keyRow = chat.querySelector('#ai-key-row');
    const keyHint = chat.querySelector('#ai-key-hint');
    const keyInput = chat.querySelector('#ai-key-input');
    const keySaveBtn = chat.querySelector('#ai-key-save');
    const keyEditLink = chat.querySelector('#ai-key-edit');

    let history = [];

    function refreshMemoryDisplay() {
      const mem = loadMemory();
      memNameEl.textContent = mem.clientName || 'none';
    }
    refreshMemoryDisplay();

    keySaveBtn.addEventListener('click', () => {
      const v = keyInput.value.trim();
      if (!v) return;
      setKey(v);
      keyInput.value = '';
      keyRow.style.display = 'none';
      keyHint.style.display = '';
    });
    keyEditLink.addEventListener('click', (e) => {
      e.preventDefault();
      keyRow.style.display = '';
      keyHint.style.display = 'none';
    });

    function addBubble(role, text) {
      const b = document.createElement('div');
      b.className = 'ai-bubble ' + role;
      b.textContent = text;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      const key = getKey();
      if (!key) {
        addBubble('assistant', '⚠ Add your OpenAI API key first.');
        keyRow.style.display = '';
        return;
      }
      input.value = '';
      addBubble('user', text);
      history.push({ role: 'user', content: text });

      const thinking = addBubble('assistant', '...');
      sendBtn.disabled = true;
      statusEl.textContent = 'thinking…';

      try {
        const memory = loadMemory();
        const system = `You are filling out an AYN AI ${docType} document. The user types plain English about what they're sending the customer. Return ONLY a raw JSON object that matches the document's state shape. No explanation, no markdown fences, no prose. Just JSON.

CURRENT STATE:
${JSON.stringify(getState(), null, 2)}

CLIENT MEMORY (from prior generators — pre-fill if relevant):
${JSON.stringify(memory, null, 2)}

SCHEMA:
${schemaHint}

RULES:
- Return only keys you want to change. The doc merges your patch.
- For arrays, return the FULL replacement array.
- Dates: ISO format YYYY-MM-DD.
- If user mentions client name/email/address, include "_memory": {"clientName": "...", "clientEmail": "...", "clientAddress": "..."} at top level.
- Money: numbers only, no symbols.
- AYN AI defaults: build $500 + 3×$100 retainer. USD via Skydo. Net 3.
- Pre-fill aggressively. Better to draft and let user edit than to ask questions.`;

        const reply = await callOpenAI({
          key,
          system,
          messages: history.map(h => ({ role: h.role, content: h.content })),
        });

        const json = extractJson(reply);
        if (!json) {
          thinking.textContent = '⚠ Could not parse reply:\n' + reply.slice(0, 400);
          history.push({ role: 'assistant', content: reply });
          return;
        }

        if (json._memory) {
          saveMemory(json._memory);
          refreshMemoryDisplay();
          delete json._memory;
        }

        applyJson(json);
        const summary = summarizePatch(json);
        thinking.textContent = '✓ ' + summary;
        history.push({ role: 'assistant', content: JSON.stringify(json) });
        statusEl.innerHTML = `ready · client memory: <b>${loadMemory().clientName || 'none'}</b>`;
      } catch (e) {
        thinking.textContent = '⚠ ' + (e.message || 'Failed');
        statusEl.textContent = 'error';
      } finally {
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    });
    clearBtn.addEventListener('click', () => { history = []; log.innerHTML = ''; });

    return { send, addBubble };
  }

  function extractJson(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)); }
    catch { return null; }
  }

  function summarizePatch(json) {
    const keys = Object.keys(json).filter(k => !k.startsWith('_'));
    if (keys.length === 0) return 'no changes';
    const parts = [];
    for (const k of keys) {
      const v = json[k];
      if (Array.isArray(v)) parts.push(`${k}: ${v.length} items`);
      else if (v && typeof v === 'object') parts.push(`${k}: updated`);
      else parts.push(`${k}: ${String(v).slice(0, 30)}`);
    }
    return 'Updated ' + parts.join(' · ');
  }

  window.AIChat = { mountChat, loadMemory, saveMemory };
})();
