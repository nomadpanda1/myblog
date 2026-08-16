/* 主页音乐播放器 */
(async function () {
    const API_ROOT = ['127.0.0.1', 'localhost'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const API_BASE = `${API_ROOT}/home`;
    const FAVORITES_KEY = 'home_music_favorites';
    const RECENT_KEY = 'home_music_recent';
    const CLIENT_KEY = 'home_music_client_id';
    const EMERGENCY_PLAYLIST = [
        {
            name: 'pulse',
            artist: '舞花',
            url: `${API_ROOT}/home/music/audio/479764519`,
            cover: 'https://p1.music.126.net/izNmlpS7ZO5-tQu6H-jHuw==/18950082904839814.jpg',
            lrc: '',
        },
        {
            name: 'うたかたの風と蝉時雨',
            artist: 'FELT',
            url: `${API_ROOT}/home/music/audio/729434`,
            cover: 'https://p1.music.126.net/sE0DrwNs70l-CFKnlSBZDQ==/712483534820216.jpg',
            lrc: '',
        },
        {
            name: 'Samsara（輪迴）',
            artist: 'みぃ',
            url: `${API_ROOT}/home/music/audio/737966`,
            cover: 'https://p1.music.126.net/NFPqcHhAuqf99whTDCLJdw==/920291232448746.jpg',
            lrc: '',
        },
    ];
    let audioGraph = null;
    let spectrumFrame = 0;
    let spectrumLastPaint = 0;
    let librarySyncPromise = null;

    function getClientId() {
        let clientId = localStorage.getItem(CLIENT_KEY);
        if (!clientId) {
            clientId = crypto.randomUUID();
            localStorage.setItem(CLIENT_KEY, clientId);
        }
        return clientId;
    }

    function readArray(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (error) {
            return [];
        }
    }

    function writeArray(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
        window.dispatchEvent(new CustomEvent('home:music-library-changed'));
    }

    function trackId(track) {
        const source = `${track.name || ''}|${track.artist || ''}|${track.url || ''}`;
        let hash = 2166136261;
        for (let index = 0; index < source.length; index++) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `track_${(hash >>> 0).toString(16)}`;
    }

    function currentTrack(player) {
        const track = player.list.audios[player.list.index] || {};
        return {
            id: trackId(track),
            title: track.name || '未知曲目',
            artist: track.artist || '未知艺术家',
            url: track.url || '',
            cover: track.cover || '',
        };
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const rest = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    }

    function createSpectrum() {
        const spectrum = document.getElementById('music-spectrum');
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < 72; index++) {
            const bar = document.createElement('span');
            const peak = 0.28 + ((index * 37) % 68) / 100;
            const speed = 0.48 + ((index * 17) % 58) / 100;
            bar.style.setProperty('--peak', peak.toFixed(2));
            bar.style.setProperty('--speed', `${speed.toFixed(2)}s`);
            bar.style.setProperty('--delay', `${(-index * 0.037).toFixed(3)}s`);
            fragment.appendChild(bar);
        }
        spectrum.replaceChildren(fragment);
    }

    function stopSpectrum() {
        if (spectrumFrame) cancelAnimationFrame(spectrumFrame);
        spectrumFrame = 0;
        spectrumLastPaint = 0;
        document.querySelectorAll('#music-spectrum span').forEach(bar => {
            bar.style.removeProperty('transform');
            bar.style.removeProperty('opacity');
        });
        document.getElementById('music-stage').style.removeProperty('--music-glow');
    }

    function ensureAudioGraph(player) {
        if (audioGraph) {
            if (audioGraph.context.state === 'suspended') audioGraph.context.resume().catch(() => {});
            return true;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;

        try {
            const context = new AudioContextClass();
            const analyser = context.createAnalyser();
            const source = context.createMediaElementSource(player.audio);
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.78;
            source.connect(analyser);
            analyser.connect(context.destination);
            audioGraph = {
                analyser,
                context,
                data: new Uint8Array(analyser.frequencyBinCount),
            };
            context.resume().catch(() => {});
            document.getElementById('music-stage').classList.add('is-audio-reactive');
            return true;
        } catch (error) {
            console.warn('真实音频频谱不可用，已切换到节拍动画', error);
            document.getElementById('music-stage').classList.remove('is-audio-reactive');
            return false;
        }
    }

    function startSpectrum(player) {
        stopSpectrum();
        const reactiveAudio = ensureAudioGraph(player);

        const bars = [...document.querySelectorAll('#music-spectrum span')];
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const paintInterval = reducedMotion ? 66 : 32;
        let analyserQuietFrames = 0;

        const paint = timestamp => {
            if (player.audio.paused) {
                stopSpectrum();
                return;
            }

            if (timestamp - spectrumLastPaint >= paintInterval) {
                if (reactiveAudio) {
                    audioGraph.analyser.getByteFrequencyData(audioGraph.data);
                    const energy = audioGraph.data.reduce((sum, value) => sum + value, 0);
                    analyserQuietFrames = energy < 8 ? analyserQuietFrames + 1 : 0;
                }
                const useAudioData = reactiveAudio && analyserQuietFrames < 8;
                const usableBins = useAudioData ? Math.min(96, audioGraph.data.length) : 0;
                let totalEnergy = 0;
                bars.forEach((bar, index) => {
                    let shaped;
                    if (useAudioData) {
                        const midpoint = (bars.length - 1) / 2;
                        const position = Math.abs(index - midpoint) / Math.max(1, midpoint);
                        const center = Math.round(Math.pow(position, 1.5) * (usableBins - 1));
                        const radius = center < 18 ? 2 : 3;
                        let total = 0;
                        let samples = 0;
                        for (let bin = Math.max(0, center - radius); bin <= Math.min(usableBins - 1, center + radius); bin++) {
                            total += audioGraph.data[bin];
                            samples++;
                        }
                        const energy = samples ? total / samples / 255 : 0;
                        shaped = Math.pow(Math.max(0, (energy - 0.03) / 0.97), 1.45);
                    } else {
                        // Some music CDNs do not expose CORS audio data. Keep the visualizer
                        // synchronized to playback time instead of leaving a frozen bar strip.
                        const time = player.audio.currentTime || timestamp / 1000;
                        const beat = Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 * 1.72)), 5);
                        const wave = (Math.sin(time * 5.1 + index * 0.47) + 1) / 2;
                        const shimmer = (Math.sin(time * 9.3 - index * 0.19) + 1) / 2;
                        shaped = Math.min(1, 0.08 + wave * 0.34 + shimmer * 0.18 + beat * (0.22 + (index % 7) / 18));
                    }
                    totalEnergy += shaped;
                    const scale = Math.min(1, 0.08 + shaped * 0.92);
                    bar.style.transform = `scaleY(${scale.toFixed(3)})`;
                    bar.style.opacity = String(Math.min(1, 0.42 + shaped * 0.7));
                });
                const averageEnergy = bars.length ? totalEnergy / bars.length : 0;
                document.getElementById('music-stage').style.setProperty('--music-glow', (0.05 + averageEnergy * 0.2).toFixed(3));
                spectrumLastPaint = timestamp;
            }
            spectrumFrame = requestAnimationFrame(paint);
        };

        spectrumFrame = requestAnimationFrame(paint);
    }

    async function apiRequest(path, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                ...options,
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.warn('音乐同步暂时不可用', error);
            return null;
        }
    }

    function isFavorite(track) {
        return readArray(FAVORITES_KEY).some(item => item.id === track.id);
    }

    function updateFavoriteButton(track) {
        const button = document.getElementById('music-favorite');
        const favorite = isFavorite(track);
        button.classList.toggle('is-favorite', favorite);
        button.setAttribute('aria-label', favorite ? '取消收藏当前音乐' : '收藏当前音乐');
        button.title = favorite ? '取消收藏' : '收藏';
        button.innerHTML = `<i class="${favorite ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }

    async function toggleFavorite(track) {
        const favorites = readArray(FAVORITES_KEY);
        const existing = favorites.findIndex(item => item.id === track.id);
        if (existing >= 0) {
            favorites.splice(existing, 1);
            await apiRequest(`/music/favorites/${encodeURIComponent(track.id)}?client_id=${encodeURIComponent(getClientId())}`, {
                method: 'DELETE',
            });
        } else {
            favorites.unshift({ ...track, added_at: new Date().toISOString() });
            await apiRequest(`/music/favorites/${encodeURIComponent(track.id)}`, {
                method: 'PUT',
                body: JSON.stringify({ client_id: getClientId(), ...track }),
            });
        }
        writeArray(FAVORITES_KEY, favorites.slice(0, 100));
        updateFavoriteButton(track);
    }

    function recordRecent(track) {
        const recent = readArray(RECENT_KEY).filter(item => item.id !== track.id);
        const item = { ...track, played_at: new Date().toISOString() };
        recent.unshift(item);
        writeArray(RECENT_KEY, recent.slice(0, 30));
        apiRequest('/music/events', {
            method: 'POST',
            body: JSON.stringify({ client_id: getClientId(), ...item }),
        });
    }

    async function mergeRemoteLibrary() {
        const state = await apiRequest(`/music/state?client_id=${encodeURIComponent(getClientId())}`);
        if (!state) return;
        const localFavorites = readArray(FAVORITES_KEY);
        const localRecent = readArray(RECENT_KEY);
        const favorites = [...state.favorites, ...localFavorites]
            .filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index)
            .slice(0, 100);
        const recent = [...state.recent, ...localRecent]
            .sort((left, right) => new Date(right.played_at) - new Date(left.played_at))
            .filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index)
            .slice(0, 30);
        writeArray(FAVORITES_KEY, favorites);
        writeArray(RECENT_KEY, recent);
    }

    async function performLibrarySync(session = window.homeAccountSession) {
        if (!session) {
            try {
                const response = await fetch(`${API_ROOT}/auth/session`, {
                    credentials: 'include',
                    signal: AbortSignal.timeout(8000),
                });
                if (response.ok) session = await response.json();
            } catch (error) {
                console.warn('账号状态暂时不可用，继续使用本机音乐库', error);
            }
        }

        if (session?.authenticated) {
            const linkedUser = localStorage.getItem('home_music_linked_user');
            if (linkedUser !== session.user.id) {
                const linkResponse = await fetch(`${API_ROOT}/auth/link-anonymous`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_id: getClientId() }),
                    signal: AbortSignal.timeout(8000),
                }).catch(() => null);

                if (linkResponse?.ok) {
                    for (const favorite of readArray(FAVORITES_KEY)) {
                        await apiRequest(`/music/favorites/${encodeURIComponent(favorite.id)}`, {
                            method: 'PUT',
                            body: JSON.stringify({ client_id: getClientId(), ...favorite }),
                        });
                    }
                    for (const recent of readArray(RECENT_KEY)) {
                        await apiRequest('/music/events', {
                            method: 'POST',
                            body: JSON.stringify({ client_id: getClientId(), ...recent }),
                        });
                    }
                    localStorage.setItem('home_music_linked_user', session.user.id);
                }
            }
        }

        await mergeRemoteLibrary();
        window.dispatchEvent(new CustomEvent('home:account-refresh'));
    }

    function synchronizeLibrary(session = window.homeAccountSession) {
        if (!librarySyncPromise) {
            librarySyncPromise = performLibrarySync(session).finally(() => {
                librarySyncPromise = null;
            });
        }
        return librarySyncPromise;
    }

    async function loadConfig() {
        try {
            const response = await fetch('./setting.json?v=20260816-5', { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`Setting returned ${response.status}`);
            const setting = await response.json();
            return {
                server: setting.music_server || 'netease',
                type: setting.music_type || 'playlist',
                id: setting.music_id || '52804225',
                volume: Number(setting.music_volume ?? 0.3),
            };
        } catch (error) {
            return { server: 'netease', type: 'playlist', id: '52804225', volume: 0.3 };
        }
    }

    function updateTrackUi(player) {
        const track = currentTrack(player);
        $('#music-name').text(`${track.title} - ${track.artist}`);
        $('#stage-track-name').text(`${track.title} · ${track.artist}`);
        updateFavoriteButton(track);
    }

    function updateProgress(player) {
        const current = player.audio.currentTime || 0;
        const duration = player.audio.duration || 0;
        $('#music-current-time').text(formatTime(current));
        $('#music-duration').text(formatTime(duration));
        if (!document.getElementById('music-progress').matches(':active')) {
            $('#music-progress').val(duration > 0 ? Math.round((current / duration) * 1000) : 0);
        }
    }

    async function fetchPlaylist(config) {
        let result;
        try {
            const params = new URLSearchParams({
                server: config.server,
                type: config.type,
                id: config.id,
            });
            const response = await fetch(`${API_BASE}/music/playlist?${params}`, {
                signal: AbortSignal.timeout(12000),
                cache: 'no-cache',
            });
            if (!response.ok) throw new Error(`Music service returned ${response.status}`);
            const payload = await response.json();
            result = Array.isArray(payload) ? payload : payload.items;
            if (!Array.isArray(result) || result.length === 0) throw new Error('Music service returned an empty playlist');
            if (payload.source && payload.source !== 'provider') {
                console.info(`音乐歌单已使用${payload.source === 'cache' ? '服务器缓存' : '备用来源'}`);
            }
        } catch (error) {
            console.warn('服务器歌单暂时不可用，已启用浏览器备用歌单', error);
            result = EMERGENCY_PLAYLIST;
        }
        const apiOrigin = new URL(API_ROOT, location.origin).origin;
        const resolveApiUrl = value => String(value || '').startsWith('/api/v1/')
            ? `${apiOrigin}${value}`
            : value || '';
        return result.map(track => ({
            name: track.name || '未知曲目',
            artist: track.artist || '未知艺术家',
            url: resolveApiUrl(track.url),
            cover: track.cover || track.pic || '',
            lrc: resolveApiUrl(track.lrc),
        })).filter(track => track.url);
    }

    createSpectrum();
    const config = await loadConfig();

    try {
        let data;
        try {
            data = await fetchPlaylist(config);
        } catch (error) {
            if (config.id === '52804225') throw error;
            data = await fetchPlaylist({ ...config, id: '52804225' });
        }
        const ap = new APlayer({
            container: document.getElementById('aplayer'),
            order: 'random',
            preload: 'metadata',
            listMaxHeight: '336px',
            volume: Math.min(1, Math.max(0, config.volume)),
            mutex: true,
            lrcType: 3,
            audio: data,
            autoplay: false,
        });
        ap.audio.crossOrigin = 'anonymous';
        ap.audio.load();
        window.homePlayer = ap;
        window.playHomeTrack = function (track) {
            let index = ap.list.audios.findIndex(audio => trackId(audio) === track.id);
            if (index < 0 && track.url) {
                ap.list.add([{
                    name: track.title,
                    artist: track.artist,
                    url: track.url,
                    cover: track.cover,
                }]);
                index = ap.list.audios.length - 1;
            }
            if (index >= 0) {
                ap.list.switch(index);
                ap.play();
            }
        };
        document.body.classList.add('music-stage-ready');
        document.getElementById('music-stage').classList.add('is-ready');
        $('#volume').val(config.volume);
        updateTrackUi(ap);
        synchronizeLibrary();

        window.addEventListener('home:account-changed', event => {
            if (event.detail?.authenticated) synchronizeLibrary(event.detail);
        });

        const lyricTimer = setInterval(function () {
            const lyric = $('.aplayer-lrc-current').text();
            if (lyric) {
                $('#stage-lyric').text(lyric);
                $('#lrc').html(`<span class="lrc-show"><i class="fa-solid fa-music"></i>&nbsp;${lyric}&nbsp;<i class="fa-solid fa-music"></i></span>`);
            }
        }, 500);

        ap.on('play', function () {
            const track = currentTrack(ap);
            iziToast.info({
                timeout: 3000,
                icon: 'fa-solid fa-circle-play',
                displayMode: 'replace',
                message: `${track.title} - ${track.artist}`,
            });
            $('#play').html("<i class='fa-solid fa-pause'></i>");
            $('#stage-play')
                .attr({ 'aria-label': '暂停', title: '暂停' })
                .html("<i class='fa-solid fa-pause'></i>");
            $('#music-stage').addClass('is-playing');
            startSpectrum(ap);
            updateTrackUi(ap);
            recordRecent(track);
            if ($(document).width() >= 990) {
                $('.power').css('display', 'none');
                $('#lrc').css('display', 'block');
            }
        });

        ap.on('pause', function () {
            $('#play').html("<i class='fa-solid fa-play'></i>");
            $('#stage-play')
                .attr({ 'aria-label': '播放', title: '播放' })
                .html("<i class='fa-solid fa-play'></i>");
            $('#music-stage').removeClass('is-playing');
            stopSpectrum();
            if ($(document).width() >= 990) {
                $('#lrc').css('display', 'none');
                $('.power').css('display', 'flex');
            }
        });

        ap.on('ended', function () {
            $('#stage-play')
                .attr({ 'aria-label': '播放', title: '播放' })
                .html("<i class='fa-solid fa-play'></i>");
            $('#music-stage').removeClass('is-playing');
            stopSpectrum();
        });
        ap.on('timeupdate', () => updateProgress(ap));
        ap.on('loadedmetadata', () => updateProgress(ap));
        ap.on('listswitch', () => {
            $('#stage-lyric').text('正在加载歌词');
            setTimeout(() => {
                updateTrackUi(ap);
                updateProgress(ap);
            }, 0);
        });

        const resumeAfterInteraction = () => {
            if (ap.audio.paused) ap.play();
            document.removeEventListener('pointerdown', resumeAfterInteraction, true);
            document.removeEventListener('keydown', resumeAfterInteraction, true);
        };
        setTimeout(async () => {
            if (!ap.audio.paused) return;
            try {
                await ap.audio.play();
            } catch (error) {
                document.addEventListener('pointerdown', resumeAfterInteraction, { once: true, capture: true });
                document.addEventListener('keydown', resumeAfterInteraction, { once: true, capture: true });
            }
        }, 650);

        $('#open-music').on('click', function () {
            $('#hitokoto').css('display', 'none');
            $('#music').css('display', 'flex');
        });
        $('#hitokoto').hover(
            () => $('#open-music').css('display', 'flex'),
            () => $('#open-music').css('display', 'none')
        );
        $('#music-close').on('click', function () {
            $('#music').css('display', 'none');
            $('#hitokoto').css('display', 'flex');
        });
        $('#play').on('click', () => ap.toggle());
        $('#last').on('click', () => { ap.skipBack(); ap.play(); });
        $('#next').on('click', () => { ap.skipForward(); ap.play(); });
        $('#stage-play').on('click', () => ap.toggle());
        $('#stage-prev').on('click', () => { ap.skipBack(); ap.play(); });
        $('#stage-next').on('click', () => { ap.skipForward(); ap.play(); });
        $('#music-open').on('click', function () {
            if ($(document).width() >= 990) {
                $('#box').css('display', 'block');
                $('#row').css('display', 'none');
                $('#more').css('cssText', 'display:none !important');
            }
        });

        $('#music-progress').on('input change', function () {
            const duration = ap.audio.duration || 0;
            if (duration > 0) ap.seek((Number(this.value) / 1000) * duration);
        });
        $('#music-favorite').on('click', () => toggleFavorite(currentTrack(ap)));
        $('#volume').on('input propertychange touchend', function () {
            const volume = Number(this.value);
            ap.volume(volume, true);
            const icon = volume === 0 ? 'fa-volume-xmark'
                : volume <= 0.3 ? 'fa-volume-off'
                    : volume <= 0.6 ? 'fa-volume-low' : 'fa-volume-high';
            $('#volume-ico').html(`<i class="fa-solid ${icon}"></i>`);
        });

        document.addEventListener('keydown', function (event) {
            const tag = document.activeElement?.tagName;
            if (event.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(tag)) {
                event.preventDefault();
                ap.toggle();
            }
        });

        window.addEventListener('beforeunload', () => {
            clearInterval(lyricTimer);
            stopSpectrum();
            if (audioGraph) audioGraph.context.close().catch(() => {});
        });
    } catch (error) {
        console.warn('音乐播放器加载失败', error);
        setTimeout(function () {
            iziToast.info({
                timeout: 6000,
                icon: 'fa-solid fa-circle-exclamation',
                displayMode: 'replace',
                message: '音乐播放器暂时不可用',
            });
        }, 2800);
    }
})();
