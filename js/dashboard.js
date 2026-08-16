(function () {
    const API_ROOT = ['127.0.0.1', 'localhost'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const API_BASE = `${API_ROOT}/home`;

    const sites = [
        { name: '主页', description: 'www.lyf233.cn', url: 'https://www.lyf233.cn/', icon: 'fa-solid fa-house', keywords: 'home 主页' },
        { name: '独立博客', description: 'blog.lyf233.cn', url: 'https://blog.lyf233.cn/', icon: 'fa-solid fa-blog', keywords: 'blog 文章 博客' },
        { name: '虚拟实验室', description: 'lab.lyf233.cn', url: 'https://lab.lyf233.cn/', icon: 'fa-solid fa-flask-vial', keywords: 'lab 实验 仿真' },
        { name: '知识检索', description: 'ai.lyf233.cn · 跨站全文搜索', url: 'https://ai.lyf233.cn/', icon: 'fa-solid fa-magnifying-glass-chart', keywords: 'search rag 向量 全文 知识库' },
        { name: '物联网仪表盘', description: 'iot.lyf233.cn', url: 'https://iot.lyf233.cn/', icon: 'fa-solid fa-atom', keywords: 'iot 物联网 仪表盘' },
        { name: '个人简历', description: 'resume.lyf233.cn', url: 'https://resume.lyf233.cn/', icon: 'fa-solid fa-address-card', keywords: 'resume cv 简历' },
        { name: 'Hextris', description: 'hextris.lyf233.cn', url: 'https://hextris.lyf233.cn/', icon: 'fa-solid fa-gamepad', keywords: 'hextris 游戏' },
        { name: '西西弗斯', description: 'sisyphus.lyf233.cn', url: 'https://sisyphus.lyf233.cn/', icon: 'fa-solid fa-mountain', keywords: 'sisyphus 西西弗斯 游戏' },
    ];

    const weatherDescriptions = {
        0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴', 45: '有雾', 48: '雾凇',
        51: '小毛毛雨', 53: '毛毛雨', 55: '强毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨',
        71: '小雪', 73: '中雪', 75: '大雪', 80: '小阵雨', 81: '阵雨', 82: '强阵雨',
        85: '小阵雪', 86: '强阵雪', 95: '雷雨', 96: '雷雨伴冰雹', 99: '强雷雨伴冰雹',
    };

    const palette = document.getElementById('command-palette');
    const commandInput = document.getElementById('command-input');
    const commandResults = document.getElementById('command-results');
    let commandMatches = sites;
    let activeCommandIndex = 0;
    let searchTimer = 0;
    let searchSequence = 0;

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function paintCommands() {
        activeCommandIndex = Math.min(activeCommandIndex, Math.max(0, commandMatches.length - 1));

        commandResults.innerHTML = commandMatches.length
            ? commandMatches.map((site, index) => `
                <button type="button" class="command-result${index === activeCommandIndex ? ' is-active' : ''}" data-command-index="${index}">
                    <i class="${site.icon}"></i>
                    <span><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.description)}</small>${site.summary ? `<small class="command-summary">${escapeHtml(site.summary)}</small>` : ''}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </button>`).join('')
            : '<div class="empty-state">没有找到相关内容</div>';
    }

    async function renderCommands(query = '') {
        const normalized = query.trim().toLowerCase();
        const localMatches = sites.filter(site =>
            `${site.name} ${site.description} ${site.keywords}`.toLowerCase().includes(normalized)
        );
        commandMatches = normalized ? localMatches : sites;
        activeCommandIndex = 0;
        paintCommands();
        clearTimeout(searchTimer);
        if (!normalized) return;
        const sequence = ++searchSequence;
        searchTimer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_ROOT}/search?q=${encodeURIComponent(query.trim())}&limit=12`, {
                    credentials: 'include', signal: AbortSignal.timeout(10000),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (sequence !== searchSequence) return;
                const remote = (data.items || []).map(item => ({
                    name: item.title,
                    description: `${item.site} · ${item.kind} · 相关度 ${Math.round(item.score)}%`,
                    summary: item.summary,
                    url: item.url,
                    icon: item.kind === 'article' ? 'fa-solid fa-file-lines' : item.kind === 'profile' ? 'fa-solid fa-address-card' : 'fa-solid fa-cube',
                    keywords: '',
                }));
                commandMatches = [...localMatches, ...remote].filter((item, index, items) =>
                    items.findIndex(candidate => candidate.url === item.url) === index
                );
                paintCommands();
            } catch (error) {
                console.warn('Cross-site search unavailable', error);
            }
        }, 220);
    }

    function openPalette() {
        renderCommands('');
        commandInput.value = '';
        palette.classList.add('is-open');
        palette.setAttribute('aria-hidden', 'false');
        setTimeout(() => commandInput.focus(), 50);
    }

    function closePalette() {
        palette.classList.remove('is-open');
        palette.setAttribute('aria-hidden', 'true');
    }

    function openActiveCommand() {
        const site = commandMatches[activeCommandIndex];
        if (site) window.location.href = site.url;
    }

    document.getElementById('quick-nav-open').addEventListener('click', openPalette);
    document.getElementById('command-close').addEventListener('click', closePalette);
    palette.addEventListener('click', event => {
        if (event.target === palette) closePalette();
        const result = event.target.closest('[data-command-index]');
        if (result) {
            activeCommandIndex = Number(result.dataset.commandIndex);
            openActiveCommand();
        }
    });
    commandInput.addEventListener('input', () => renderCommands(commandInput.value));
    commandInput.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeCommandIndex = Math.min(activeCommandIndex + 1, commandMatches.length - 1);
            paintCommands();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeCommandIndex = Math.max(activeCommandIndex - 1, 0);
            paintCommands();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            openActiveCommand();
        }
    });
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            palette.classList.contains('is-open') ? closePalette() : openPalette();
        } else if (event.key === 'Escape') {
            closePalette();
            closePanel();
        }
    });

    const panel = document.getElementById('home-panel');
    const panelScrim = document.getElementById('panel-scrim');
    const panelTabs = [...document.querySelectorAll('[data-view]')];
    const panelViews = [...document.querySelectorAll('[data-view-content]')];
    const loadedViews = new Set();

    function closePanel() {
        panel.classList.remove('is-open');
        panelScrim.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
    }

    function setPanelView(view) {
        panelTabs.forEach(tab => {
            const active = tab.dataset.view === view;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        panelViews.forEach(content => content.classList.toggle('is-active', content.dataset.viewContent === view));

        if (view === 'weather') loadWeatherDetails();
        if (view === 'status') loadStatus();
        if (view === 'activity') loadActivity();
        if (view === 'music') renderMusicLibrary();
        if (view === 'account') loadAccount();
    }

    function openPanel(view) {
        panel.classList.add('is-open');
        panelScrim.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        setPanelView(view);
    }

    document.getElementById('panel-close').addEventListener('click', closePanel);
    panelScrim.addEventListener('click', closePanel);
    panelTabs.forEach(tab => tab.addEventListener('click', () => setPanelView(tab.dataset.view)));
    document.querySelectorAll('[data-panel-view]').forEach(button =>
        button.addEventListener('click', () => openPanel(button.dataset.panelView))
    );
    document.getElementById('upWeather').addEventListener('click', () => openPanel('weather'));

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'include',
            ...options,
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
    }

    function accountMarkup(session) {
        if (!session.authenticated) {
            return `
                <div class="account-identity is-local">
                    <span class="account-avatar"><i class="fa-solid fa-laptop"></i></span>
                    <div><strong>本机模式</strong><small>登录后可在不同设备同步音乐库</small></div>
                </div>
                <div class="account-auth-modes" role="tablist" aria-label="账号操作">
                    <button type="button" class="is-active" data-auth-mode="login" role="tab">登录</button>
                    <button type="button" data-auth-mode="register" role="tab">注册</button>
                </div>
                <form class="account-form" id="account-login-form">
                    <label><span>用户名</span><input name="username" autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" required></label>
                    <label><span>密码</span><input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label>
                    <button class="account-primary" type="submit"><i class="fa-solid fa-right-to-bracket"></i><span>登录</span></button>
                </form>
                <form class="account-form" id="account-register-form" hidden>
                    <label><span>显示名称</span><input name="display_name" autocomplete="name" maxlength="64" required></label>
                    <label><span>用户名</span><input name="username" autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" required></label>
                    <label><span>密码</span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
                    <button class="account-primary" type="submit"><i class="fa-solid fa-user-plus"></i><span>创建账号</span></button>
                </form>
                <div class="account-form-message" id="account-form-message" aria-live="polite"></div>`;
        }
        const user = session.user;
        const avatar = user.avatar_url
            ? `<img class="account-avatar" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.name)}">`
            : '<span class="account-avatar"><i class="fa-solid fa-user"></i></span>';
        const profileAction = user.profile_url
            ? `<a href="${escapeHtml(user.profile_url)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"></i><span>GitHub 主页</span></a>`
            : '';
        return `
            <div class="account-identity">
                ${avatar}
                <div><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)}</small></div>
                <span class="account-online" title="已同步"></span>
            </div>
            <div class="account-counts">
                <div><strong>${Number(session.counts?.favorites || 0)}</strong><span>收藏</span></div>
                <div><strong>${Number(session.counts?.recent || 0)}</strong><span>最近播放</span></div>
            </div>
            <div class="account-sync-state is-synced"><i class="fa-solid fa-cloud-arrow-up"></i><span>已开启跨设备同步</span></div>
            <div class="account-actions">
                ${profileAction}
                <button type="button" id="account-logout"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>退出登录</span></button>
            </div>`;
    }

    async function loadAccount(force = false) {
        if (loadedViews.has('account') && !force) return window.homeAccountSession;
        const content = document.getElementById('account-content');
        try {
            const session = await fetchJson(`${API_ROOT}/auth/session`);
            const previousIdentity = window.homeAccountSession?.user?.id || null;
            window.homeAccountSession = session;
            content.innerHTML = accountMarkup(session);
            loadedViews.add('account');
            if (previousIdentity !== (session.user?.id || null)) {
                window.dispatchEvent(new CustomEvent('home:account-changed', { detail: session }));
            }
            return session;
        } catch (error) {
            console.warn('账号状态加载失败', error);
            content.innerHTML = '<div class="empty-state">账号服务暂时不可用</div>';
            return null;
        }
    }

    document.getElementById('account-content').addEventListener('click', async event => {
        const modeButton = event.target.closest('[data-auth-mode]');
        if (modeButton) {
            document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('is-active', button === modeButton));
            document.getElementById('account-login-form').hidden = modeButton.dataset.authMode !== 'login';
            document.getElementById('account-register-form').hidden = modeButton.dataset.authMode !== 'register';
            document.getElementById('account-form-message').textContent = '';
            return;
        }
        if (!event.target.closest('#account-logout')) return;
        try {
            await fetch(`${API_ROOT}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                redirect: 'manual',
                signal: AbortSignal.timeout(8000),
            });
        } finally {
            localStorage.removeItem('home_music_favorites');
            localStorage.removeItem('home_music_recent');
            localStorage.removeItem('home_music_linked_user');
            window.dispatchEvent(new CustomEvent('home:music-library-changed'));
            loadedViews.delete('account');
            await loadAccount(true);
        }
    });

    document.getElementById('account-content').addEventListener('submit', async event => {
        const form = event.target.closest('.account-form');
        if (!form) return;
        event.preventDefault();
        const message = document.getElementById('account-form-message');
        const submit = form.querySelector('[type="submit"]');
        const formData = Object.fromEntries(new FormData(form));
        const action = form.id === 'account-register-form' ? 'register' : 'login';
        submit.disabled = true;
        message.textContent = action === 'register' ? '正在创建账号' : '正在登录';
        try {
            const response = await fetch(`${API_ROOT}/auth/${action}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) {
                if (response.status === 401) throw new Error('用户名或密码不正确');
                if (response.status === 409) throw new Error('这个用户名已经被使用');
                if (response.status === 429) throw new Error('尝试次数过多，请稍后再试');
                throw new Error('请检查填写内容');
            }
            loadedViews.delete('account');
            await loadAccount(true);
        } catch (error) {
            message.textContent = error.message || '账号服务暂时不可用';
        } finally {
            submit.disabled = false;
        }
    });

    window.addEventListener('home:account-refresh', () => {
        loadedViews.delete('account');
        loadAccount(true);
    });

    async function loadWeatherDetails(force = false) {
        if (loadedViews.has('weather') && !force) return;
        const summary = document.getElementById('weather-summary');
        const hourly = document.getElementById('hourly-forecast');
        summary.innerHTML = '<div class="empty-state">正在读取天气</div>';
        hourly.innerHTML = '';

        const locationData = window.homeWeatherLocation || {
            city: document.getElementById('city_text').textContent.trim() || '当地',
            latitude: 30.5728,
            longitude: 104.0668,
            timezone: 'Asia/Shanghai',
        };
        const weatherParams = new URLSearchParams({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            timezone: locationData.timezone || 'auto',
        });

        try {
            const data = await fetchJson(`${API_BASE}/weather?${weatherParams}`);
            const forecast = data.forecast;
            const air = data.air_quality;
            const aqiValue = Number(air?.current?.european_aqi);
            const pm25Value = Number(air?.current?.pm2_5);
            const aqi = Number.isFinite(aqiValue) ? Math.round(aqiValue) : null;
            const pm25 = Number.isFinite(pm25Value) ? Math.round(pm25Value) : null;
            summary.innerHTML = `
                <div class="weather-summary-main">
                    <div><strong>${escapeHtml(locationData.city)}</strong><div>${escapeHtml(weatherDescriptions[forecast.current.weather_code] || '天气变化中')}</div></div>
                    <strong>${Math.round(forecast.current.apparent_temperature)}°C</strong>
                </div>
                <div class="weather-summary-grid">
                    <div class="weather-metric"><span>相对湿度</span><strong>${Math.round(forecast.current.relative_humidity_2m)}%</strong></div>
                    <div class="weather-metric"><span>空气质量</span><strong>${aqi ?? '--'} AQI</strong></div>
                    <div class="weather-metric"><span>PM2.5</span><strong>${pm25 ?? '--'} μg/m³</strong></div>
                </div>`;

            const currentHour = `${forecast.current.time.slice(0, 13)}:00`;
            const rows = forecast.hourly.time.map((time, index) => ({
                time,
                temperature: forecast.hourly.temperature_2m[index],
                rain: forecast.hourly.precipitation_probability[index],
                code: forecast.hourly.weather_code[index],
            })).filter(item => item.time >= currentHour).slice(0, 10);
            hourly.innerHTML = rows.map(item => `
                <div class="hourly-item">
                    <strong>${escapeHtml(item.time.slice(11, 16))}</strong>
                    <span>${escapeHtml(weatherDescriptions[item.code] || '变化中')}</span>
                    <span><i class="fa-solid fa-droplet"></i>&nbsp;${Math.round(item.rain)}%</span>
                    <strong>${Math.round(item.temperature)}°</strong>
                </div>`).join('');
            loadedViews.add('weather');
        } catch (error) {
            console.warn('天气详情加载失败', error);
            summary.innerHTML = '<div class="empty-state">天气详情暂时不可用</div>';
        }
    }

    async function loadStatus(force = false) {
        if (loadedViews.has('status') && !force) return;
        const meta = document.getElementById('status-meta');
        const list = document.getElementById('status-list');
        meta.textContent = '正在读取状态';
        list.innerHTML = '';
        try {
            const data = await fetchJson(`${API_BASE}/status`);
            meta.textContent = data.checked_at
                ? `最近检查 ${new Date(data.checked_at).toLocaleString('zh-CN')}`
                : '等待首次检查';
            list.innerHTML = data.items.map(item => `
                <a class="status-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                    <span class="status-dot ${escapeHtml(item.status)}"></span>
                    <span class="status-detail"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.domain)}</small></span>
                    <span class="status-latency">${item.latency_ms == null ? '--' : `${Math.round(item.latency_ms)} ms`}</span>
                </a>`).join('');
            loadedViews.add('status');
        } catch (error) {
            console.warn('站点状态加载失败', error);
            meta.textContent = '状态服务暂时不可用';
            list.innerHTML = '<div class="empty-state">稍后再试</div>';
        }
    }

    async function loadActivity(force = false) {
        if (loadedViews.has('activity') && !force) return;
        const meta = document.getElementById('activity-meta');
        const list = document.getElementById('activity-list');
        meta.textContent = '正在读取动态';
        list.innerHTML = '';
        try {
            const data = await fetchJson(`${API_BASE}/activity`);
            meta.textContent = data.updated_at
                ? `最近同步 ${new Date(data.updated_at).toLocaleString('zh-CN')}`
                : '等待首次同步';
            list.innerHTML = data.items.length ? data.items.map(item => `
                <a class="activity-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                    <span class="activity-icon"><i class="fa-solid fa-code-commit"></i></span>
                    <span class="activity-detail"><strong>${escapeHtml(item.message)}</strong><small>${escapeHtml(item.repo)} · ${escapeHtml(item.occurred_at ? new Date(item.occurred_at).toLocaleDateString('zh-CN') : item.branch || '')}</small></span>
                </a>`).join('') : '<div class="empty-state">暂无公开提交动态</div>';
            loadedViews.add('activity');
        } catch (error) {
            console.warn('项目动态加载失败', error);
            meta.textContent = '动态服务暂时不可用';
            list.innerHTML = '<div class="empty-state">稍后再试</div>';
        }
    }

    function readStoredArray(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (error) {
            return [];
        }
    }

    const musicItems = new Map();

    function renderMusicItems(target, items, emptyText) {
        items.forEach(item => musicItems.set(item.id, item));
        target.innerHTML = items.length ? items.map(item => `
            <button type="button" class="music-library-item" data-music-track="${escapeHtml(item.id)}">
                <span class="music-library-detail"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.artist || '未知艺术家')}</small></span>
                <span class="music-library-action">${item.played_at ? escapeHtml(new Date(item.played_at).toLocaleDateString('zh-CN')) : ''}<i class="fa-solid fa-play"></i></span>
            </button>`).join('') : `<div class="empty-state">${emptyText}</div>`;
    }

    function renderMusicLibrary() {
        renderMusicItems(document.getElementById('favorite-list'), readStoredArray('home_music_favorites'), '还没有收藏音乐');
        renderMusicItems(document.getElementById('recent-list'), readStoredArray('home_music_recent'), '还没有播放记录');
    }

    window.addEventListener('home:music-library-changed', renderMusicLibrary);
    document.getElementById('home-panel').addEventListener('click', event => {
        const button = event.target.closest('[data-music-track]');
        const track = button ? musicItems.get(button.dataset.musicTrack) : null;
        if (track && typeof window.playHomeTrack === 'function') {
            window.playHomeTrack(track);
        }
    });
    renderCommands();
    loadAccount();
})();
