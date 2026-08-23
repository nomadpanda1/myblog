(() => {
    const API_ROOT = ['localhost', '127.0.0.1'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const MODEL_PATH = '/img/live2d/mailili/mailili.model3.json';
    const CLIENT_KEY = 'lyf_home_ai_client_id';
    const POSITION_KEY = 'lyf_home_live2d_position_v1';
    const VOICE_KEY = 'lyf_home_live2d_voice_v1';
    const MODEL_VISIBLE_KEY = 'lyf_home_live2d_visible_v1';
    const state = {
        live2d: null,
        drag: null,
        touchReady: false,
        voiceAudio: null,
        voiceUrl: '',
        voiceRequestId: 0,
        voiceAbortController: null,
        dragFrame: 0,
        touchCount: 0,
    };
    const TOUCH_MESSAGES = [
        '喵……摸到我啦。',
        '耳朵动了一下，是在叫我吗？',
        '嗯哼，我有好好待在这里陪你。',
        '再轻一点嘛……不过，你开心就好。',
        '检测到触摸，猫娘助手已上线。',
        '我听见啦。主页里的项目，我都可以替七月的峰介绍。',
    ];

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

    function voiceEnabled() {
        return localStorage.getItem(VOICE_KEY) !== 'off';
    }

    function modelVisible() {
        return localStorage.getItem(MODEL_VISIBLE_KEY) !== 'off';
    }

    function updateVoiceButton() {
        const button = document.getElementById('home-ai-voice');
        if (!button) return;
        const enabled = voiceEnabled();
        button.classList.toggle('is-muted', !enabled);
        button.setAttribute('aria-label', enabled ? '关闭仙狐语音' : '开启仙狐语音');
        button.innerHTML = `<i class="fa-solid ${enabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>`;
    }

    function updateModelButton() {
        const button = document.getElementById('home-ai-model');
        const visible = modelVisible();
        document.body.classList.toggle('home-live2d-off', !visible);
        const modelStage = stage();
        modelStage?.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (!button) return;
        button.classList.toggle('is-muted', !visible);
        button.setAttribute('aria-label', visible ? '隐藏 Live2D 模型' : '显示 Live2D 模型');
        button.title = visible ? '隐藏 Live2D' : '显示 Live2D';
        button.innerHTML = `<i class="fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
    }

    function browserSpeak(text) {
        if (!('speechSynthesis' in window)) return;
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.04 + Math.random() * .08;
        utterance.pitch = 1.18 + Math.random() * .12;
        const voices = speechSynthesis.getVoices();
        const preferred = ['Xiaoyi', 'Xiaoxiao', '晓伊', '晓晓', 'Yaoyao', '瑶瑶'];
        utterance.voice = voices.find(voice => /^zh/i.test(voice.lang) && preferred.some(name => voice.name.includes(name)))
            || voices.find(voice => /^zh/i.test(voice.lang) && /female|woman|girl|女/i.test(voice.name))
            || voices.find(voice => /^zh/i.test(voice.lang));
        speechSynthesis.speak(utterance);
    }

    function stopVoice() {
        state.voiceRequestId += 1;
        state.voiceAbortController?.abort();
        state.voiceAbortController = null;
        state.voiceAudio?.pause();
        state.voiceAudio?.removeAttribute('src');
        state.voiceAudio?.load();
        state.voiceAudio = null;
        if (state.voiceUrl) URL.revokeObjectURL(state.voiceUrl);
        state.voiceUrl = '';
        if ('speechSynthesis' in window) speechSynthesis.cancel();
    }

    async function speak(message) {
        if (!voiceEnabled()) return;
        const text = String(message).replace(/[*#`]/g, '').slice(0, 300);
        const requestId = state.voiceRequestId + 1;
        state.voiceRequestId = requestId;
        state.voiceAbortController?.abort();
        state.voiceAbortController = new AbortController();
        state.voiceAudio?.pause();
        state.voiceAudio = null;
        if (state.voiceUrl) URL.revokeObjectURL(state.voiceUrl);
        state.voiceUrl = '';
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        try {
            const voiceRate = 5 + Math.floor(Math.random() * 5);
            const voicePitch = 9 + Math.floor(Math.random() * 7);
            const response = await fetch(`${API_ROOT}/blog/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, rate: voiceRate, pitch: voicePitch }),
                signal: state.voiceAbortController.signal,
            });
            if (!response.ok) throw new Error(`TTS returned ${response.status}`);
            const blob = await response.blob();
            if (requestId !== state.voiceRequestId || !voiceEnabled()) return;
            const voiceUrl = URL.createObjectURL(blob);
            state.voiceUrl = voiceUrl;
            state.voiceAudio = new Audio(voiceUrl);
            state.voiceAudio.volume = .9;
            state.voiceAudio.addEventListener('ended', () => {
                URL.revokeObjectURL(voiceUrl);
                if (state.voiceUrl === voiceUrl) state.voiceUrl = '';
            }, { once: true });
            await state.voiceAudio.play();
        } catch (error) {
            if (requestId !== state.voiceRequestId || error?.name === 'AbortError') return;
            console.warn('Home Live2D voice unavailable, using browser voice', error);
            browserSpeak(text);
        } finally {
            if (requestId === state.voiceRequestId) state.voiceAbortController = null;
        }
    }

    function showBubble(message, shouldSpeak = false) {
        try {
            state.live2d?.tipsMessage?.(String(message).slice(0, 120));
        } catch (error) {
            console.warn('Home Live2D bubble unavailable', error);
        }
        if (shouldSpeak) speak(message);
    }

    function readPosition() {
        try {
            return JSON.parse(localStorage.getItem(POSITION_KEY)) || { left: 12, bottom: 154 };
        } catch (error) {
            return { left: 12, bottom: 154 };
        }
    }

    function applyPosition(position = readPosition(), persist = false) {
        const node = stage();
        if (!node) return null;
        const width = node.offsetWidth || 320;
        const height = node.offsetHeight || 440;
        const requestedLeft = Number(position.left);
        const requestedBottom = Number(position.bottom);
        const maxLeft = Math.max(0, innerWidth - width);
        const maxBottom = Math.max(0, innerHeight - height);
        const left = Math.round(Math.max(0, Math.min(Number.isFinite(requestedLeft) ? requestedLeft : 12, maxLeft)));
        const bottom = Math.round(Math.max(0, Math.min(Number.isFinite(requestedBottom) ? requestedBottom : 154, maxBottom)));
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

        const scheduleDragPosition = () => {
            if (state.dragFrame) return;
            state.dragFrame = requestAnimationFrame(() => {
                state.dragFrame = 0;
                if (!state.drag) return;
                const dx = state.drag.nextLeft - state.drag.left;
                const dy = -(state.drag.nextBottom - state.drag.bottom);
                node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            });
        };
        const move = event => {
            if (!state.drag || state.drag.id !== event.pointerId) return;
            const dx = event.clientX - state.drag.x;
            const dy = event.clientY - state.drag.y;
            if (!state.drag.moved && Math.hypot(dx, dy) < 7) return;
            state.drag.moved = true;
            document.body.classList.add('home-live2d-dragging');
            state.drag.nextLeft = state.drag.left + dx;
            state.drag.nextBottom = state.drag.bottom - dy;
            event.preventDefault();
            scheduleDragPosition();
        };
        const finish = event => {
            if (!state.drag || state.drag.id !== event.pointerId) return;
            const moved = state.drag.moved;
            const finalPosition = { left: state.drag.nextLeft ?? state.drag.left, bottom: state.drag.nextBottom ?? state.drag.bottom };
            state.drag = null;
            if (state.dragFrame) cancelAnimationFrame(state.dragFrame);
            state.dragFrame = 0;
            if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
            if (moved) {
                applyPosition(finalPosition, true);
                node.style.removeProperty('transform');
            } else {
                openPanel();
                const message = TOUCH_MESSAGES[state.touchCount % TOUCH_MESSAGES.length];
                state.touchCount += 1;
                showBubble(message, true);
            }
            document.body.classList.remove('home-live2d-dragging');
        };
        node.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            const position = applyPosition() || { left: 12, bottom: 154 };
            state.drag = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: position.left,
                bottom: position.bottom,
                moved: false,
                nextLeft: position.left,
                nextBottom: position.bottom,
            };
            node.setPointerCapture?.(event.pointerId);
            document.body.classList.add('home-live2d-dragging');
        });
        addEventListener('pointermove', move, { passive: false });
        addEventListener('pointerup', finish);
        addEventListener('pointercancel', finish);
        addEventListener('resize', () => applyPosition(readPosition(), true), { passive: true });
        setTimeout(() => showBubble('欢迎回来。七月的峰是我的主人，需要我介绍一下这里的内容吗？'), 900);
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
                    position: [45, 44],
                    scale: .040,
                    stageStyle: { width: 320, height: 440, left: '12px', right: 'auto', bottom: '154px' },
                }],
                tips: {
                    style: { width: '196px', minHeight: '52px', padding: '10px', fontSize: '12px', lineHeight: '1.5' },
                    message: ['欢迎来到这里。七月的峰是我的主人。', '可以拖动我，也可以点我打开访客助手。'],
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
            showBubble(reply, true);
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
        document.getElementById('home-ai-model').addEventListener('click', () => {
            localStorage.setItem(MODEL_VISIBLE_KEY, modelVisible() ? 'off' : 'on');
            updateModelButton();
        });
        document.getElementById('home-ai-voice').addEventListener('click', () => {
            const enabled = !voiceEnabled();
            localStorage.setItem(VOICE_KEY, enabled ? 'on' : 'off');
            if (!enabled) {
                stopVoice();
            }
            updateVoiceButton();
            showBubble(enabled ? '语音打开啦，之后的回答我会念给你听。' : '语音已经安静下来啦。', enabled);
        });
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
        updateVoiceButton();
        updateModelButton();
        initLive2d();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
