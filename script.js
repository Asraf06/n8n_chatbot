marked.setOptions({
    highlight: function (code, lang) {
        const language = highlight.getLanguage(lang) ? lang : 'plaintext';
        return highlight.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-',
    breaks: true,
    gfm: true
});

let state = {
    messages: [{ role: 'assistant', content: "Hi! I'm connected to your n8n workflow. I support **Markdown** and `Code Blocks`!" }],
    webhookUrl: localStorage.getItem('n8n_webhook_url') || '',
    debugMode: false,
    isLoading: false
};
const els = {
    chatContainer: document.getElementById('chat-container'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    webhookInput: document.getElementById('webhook-url'),
    saveSettingsBtn: document.getElementById('save-settings'),
    statusIndicator: document.getElementById('status-indicator'),
    debugToggle: document.getElementById('debug-toggle'),
    templates: {
        user: document.getElementById('msg-template-user'),
        bot: document.getElementById('msg-template-bot'),
        loading: document.getElementById('loading-template'),
        debug: document.getElementById('debug-template')
    }
};

function init() {
    lucide.createIcons();
    els.webhookInput.value = state.webhookUrl;
    updateStatusUI();
    renderMessages();
}
function updateStatusUI() {
    const dot = els.statusIndicator.querySelector('span');
    if (state.webhookUrl) {
        dot.classList.remove('bg-amber-500');
        dot.classList.add('bg-green-500');
        els.statusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Connected';
    } else {
        dot.classList.remove('bg-green-500');
        dot.classList.add('bg-amber-500');
        els.statusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> Setup Required';
    }
}

function scrollToBottom() {
    els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
}

function toggleLoading(show) {
    const existingLoader = document.getElementById('loading-indicator');
    if (show && !existingLoader) {
        const loader = els.templates.loading.content.cloneNode(true);
        els.chatContainer.appendChild(loader);
        lucide.createIcons();
    } else if (!show && existingLoader) {
        existingLoader.remove();
    }
    scrollToBottom();
    els.sendBtn.disabled = show;
    els.chatInput.disabled = show;
    if (!show) els.chatInput.focus();
}

function appendMessage(role, content, rawDebugData = null) {
    const template = role === 'user' ? els.templates.user : els.templates.bot;
    const clone = template.content.cloneNode(true);
    const contentDiv = clone.querySelector('.markdown-body');
    contentDiv.innerHTML = marked.parse(content);
    if (state.debugMode && rawDebugData && role === 'assistant') {
        const debugClone = els.templates.debug.content.cloneNode(true);
        const pre = debugClone.querySelector('pre');
        pre.textContent = JSON.stringify(rawDebugData, null, 2);
        clone.querySelector('.max-w-\\[85\\%\\]').appendChild(debugClone);
    }

    els.chatContainer.appendChild(clone);
    lucide.createIcons();
    scrollToBottom();
}

function renderMessages() {
    els.chatContainer.innerHTML = '';
    state.messages.forEach(msg => {
        appendMessage(msg.role, msg.content, msg.rawDebug);
    });
}
const findResponseText = (data) => {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (data.text) return data.text;
    if (data.output) return data.output;
    if (data.response) return data.response;
    if (data.message && data.message !== "Workflow was started") return data.message;

    if (Array.isArray(data) && data.length > 0) return findResponseText(data[0]);

    const values = Object.values(data);
    for (const val of values) {
        if (typeof val === 'string' && val.length > 2 && val !== "Workflow was started") return val;
        if (typeof val === 'object' && val !== null) {
            const deepMatch = findResponseText(val);
            if (deepMatch) return deepMatch;
        }
    }
    return null;
};
els.settingsBtn.addEventListener('click', () => {
    els.settingsPanel.classList.toggle('hidden');
});

els.saveSettingsBtn.addEventListener('click', () => {
    const url = els.webhookInput.value.trim();
    state.webhookUrl = url;
    localStorage.setItem('n8n_webhook_url', url);
    updateStatusUI();
    els.settingsPanel.classList.add('hidden');
});

els.debugToggle.addEventListener('click', () => {
    state.debugMode = !state.debugMode;
    const knob = els.debugToggle.querySelector('div');

    if (state.debugMode) {
        els.debugToggle.classList.replace('bg-slate-300', 'bg-indigo-600');
        knob.style.transform = 'translateX(1.25rem)'; // Move right
    } else {
        els.debugToggle.classList.replace('bg-indigo-600', 'bg-slate-300');
        knob.style.transform = 'translateX(0)';
    }
});

els.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = els.chatInput.value.trim();
    if (!input || state.isLoading) return;

    if (!state.webhookUrl) {
        els.settingsPanel.classList.remove('hidden');
        els.webhookInput.focus();
        return;
    }
    state.messages.push({ role: 'user', content: input });
    appendMessage('user', input);

    els.chatInput.value = '';
    state.isLoading = true;
    toggleLoading(true);

    try {
        const response = await fetch(state.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatInput: input,
                message: input,
                sessionId: 'session-' + Math.random().toString(36).substr(2, 9)
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            console.warn("Non-JSON response");
            data = { text: text || "Empty response" };
        }

        const botText = findResponseText(data);
        const finalContent = botText || "Connected, but n8n returned no text. Enable Debug Mode.";

        state.messages.push({ role: 'assistant', content: finalContent, rawDebug: data });
        appendMessage('assistant', finalContent, data);

    } catch (error) {
        const errMsg = `Connection Error: ${error.message}`;
        state.messages.push({ role: 'assistant', content: errMsg });
        appendMessage('assistant', errMsg);
    } finally {
        state.isLoading = false;
        toggleLoading(false);
    }
});
init();
