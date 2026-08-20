(() => {
    const API_ROOT = ['localhost', '127.0.0.1'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const MODEL_PATH = '/img/live2d/mailili/mailili.model3.json';
    const CLIENT_KEY = 'lyf_home_ai_client_id';
    const POSITION_KEY = 'lyf_home_live2d_position_v1';
    const state = { live2d: null, drag: null, touchReady: false };

    function clientId() {
        const saved = localStorage.getItem(CLIENT_KEY);
        if (/^[0-9a-f-]{36}$/i.test(saved || '')) return saved;
        const value = crypto.randomUUID?.() || '00000000-0000-4000-8000-000000000000';
        localStorage.setItem(CLIENT_KEY, value);
        return value;
    }

    function stage() {
        return document.querySelector('#oml2d-stage, .oml2d-stage');
    }

    function showBubble(message) {
        try {
            state.live2d?.tipsMessage?.(String(message).slice(0, 120));
        } catch (error) {
            console.warn('Home Live2D bubble unavailable', error);
        }
    }

    function readPosition() {
        try {
            return JSON.parse(localStorage.getItem(POSITION_KEY)) || { left: 12, bottom: 96 };
        } catch (error) {
            return { left: 12, bottom: 96 };
        }
    }

    function applyPosition(position = readPosition(), persist = false) {
        const node = stage();
        if (!node) return null;
        const width = node.offsetWidth || 230;
        const height = node.offsetHeight || 350;
        const left = Math.round(Math.max(8, Math.min(Number(position.left) || 12, innerWidth - width - 8)));
        const bottom = Math.round(Math.max(84, Math.min(Number(position.bottom) || 96, innerHeight - height - 8)));
        node.style.setProperty('left', `${left}px`, 'important');
        node.style.setProperty('right', 'auto', 'important');
        node.style.setProperty('bottom', `${bottom}px`, 'important');
        node.dataset.homeLeft = String(left);
        node.dataset.homeBottom = String(bottom);
        if (persist) localStorage.setItem(POSITION_KEY, JSON.stringify({ left, bottom }));
        return { left, bottom };
    }

    function bindModel() {
        if (state.touchReady) return;
        const node = stage();
        if (!node) {
            setTimeout(bindModel, 400);
            return;
        }
        state.touchReady = true;
        node.setAttribute('aria-label', '可拖动的主页 Live2D 助手');
        node.title = '拖动调整位置，单击打开 AI 助手';
        applyPosition();

        node.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            const position = applyPosition() || { left: 12, bottom: 96 };
            state.drag = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: position.left,
                bottom: position.bottom,
                moved: false,
            };
            node.setPointerCapture?.(event.pointerId);
        });
        node.addEventListener('pointermove', event => {
            if (!state.drag || state.drag.id !== event.pointerId) return;
            const dx = event.clientX - state.drag.x;
            const dy = event.clientY - state.drag.y;
            if (!state.drag.moved && Math.hypot(dx, dy) < 7) return;
            state.drag.moved = true;
            event.preventDefault();
            applyPosition({ left: state.drag.left + dx, bottom: state.drag.bottom - dy });
        });
        const finish = event => {
            if (!state.drag || state.drag.id !== event.pointerId) return;
            const moved = state.drag.moved;
            state.drag = null;
            if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
            if (moved) {
                applyPosition({ left: Number(node.dataset.homeLeft), bottom: Number(node.dataset.homeBottom) }, true);
            } else {
                openPanel();
                showBubble('我在。可以问我主页、文章、项目，或者让我给一个下一步建议。');
            }
        };
        node.addEventListener('pointerup', finish);
        node.addEventListener('pointercancel', () => { state.drag = null; });
        addEventListener('resize', () => applyPosition(readPosition(), true), { passive: true });
        setTimeout(() => showBubble('欢迎回来。需要我结合网站资料给你一个建议吗？'), 900);
    }

    function initLive2d() {
        if (innerWidth <= 900 || typeof OML2D === 'undefined') return;
        try {
            state.live2d = OML2D.loadOml2d({
                sayHello: false,
                menus: { disable: true },
                statusBar: { disable: true },
                models: [{
                    name: 'Mailili',
                    path: MODEL_PATH,
                    position: [76, 44],
                    scale: .065,
                    stageStyle: { width: 230, height: 350, left: '12px', right: 'auto', bottom: '96px' },
                }],
                tips: {
                    style: { width: '220px', minHeight: '54px', padding: '11px', fontSize: '13px', lineHeight: '1.55' },
                    message: ['主页与各个项目的资料已经连接。', '可以拖动我，也可以点我打开 AI 助手。'],
                },
            });
            setTimeout(bindModel, 650);
        } catch (error) {
            document.body.classList.add('home-live2d-off');
            console.warn('Home Live2D unavailable', error);
        }
    }

    function appendMessage(role, text, sources = []) {
        const messages = document.getElementById('home-ai-messages');
        const item = document.createElement('div');
        item.className = `home-ai-message is-${role}`;
        item.textContent = text;
        if (sources.length) {
            const sourceList = document.createElement('div');
            sourceList.className = 'home-ai-sources';
            sources.slice(0, 3).forEach(source => {
                const link = document.createElement('a');
                link.href = source.url || '#';
                link.target = '_blank';
                link.rel = 'noopener';
                link.textContent = source.title || '资料来源';
                sourceList.appendChild(link);
            });
            item.appendChild(sourceList);
        }
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
        return item;
    }

    function openPanel() {
        const panel = document.getElementById('home-ai-panel');
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
    }

    function closePanel() {
        const panel = document.getElementById('home-ai-panel');
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
    }

    async function ask(message) {
        appendMessage('user', message);
        const pending = appendMessage('pending', '正在检索主页、文章与项目资料...');
        const submit = document.querySelector('#home-ai-form button');
        submit.disabled = true;
        showBubble('稍等一下，我正在对照网站里的资料。');
        try {
            const response = await fetch(`${API_ROOT}/blog/chat`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    page_title: '峰的主页、子网站与项目入口',
                    client_id: clientId(),
                }),
                signal: AbortSignal.timeout(30000),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
            pending.remove();
            const reply = String(data.reply || '').trim();
            appendMessage('assistant', reply, Array.isArray(data.knowledge_sources) ? data.knowledge_sources : []);
            showBubble(reply);
        } catch (error) {
            pending.textContent = error.message || '知识服务暂时不可用';
            pending.classList.remove('is-pending');
            pending.classList.add('is-error');
            showBubble('这次没有连上知识服务，稍后再试一下吧。');
        } finally {
            submit.disabled = false;
        }
    }

    function boot() {
        const launcher = document.getElementById('home-ai-launcher');
        const panel = document.getElementById('home-ai-panel');
        const form = document.getElementById('home-ai-form');
        if (!launcher || !panel || !form) return;
        launcher.addEventListener('click', () => panel.classList.contains('is-open') ? closePanel() : openPanel());
        document.getElementById('home-ai-close').addEventListener('click', closePanel);
        document.querySelectorAll('.home-assistant-prompts button').forEach(button => {
            button.addEventListener('click', () => {
                openPanel();
                ask(button.textContent.trim());
            });
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const input = document.getElementById('home-ai-input');
            const message = input.value.trim();
            if (!message) return;
            input.value = '';
            ask(message);
        });
        document.getElementById('home-ai-input').addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closePanel();
        });
        initLive2d();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
