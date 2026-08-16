(function () {
    const overlay = document.getElementById('knowledge-map');
    const canvas = document.getElementById('knowledge-map-canvas');
    if (!overlay || !canvas) return;

    const API_ROOT = ['127.0.0.1', 'localhost'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const context = canvas.getContext('2d');
    const state = {
        nodes: [],
        links: [],
        simulation: null,
        zoom: null,
        transform: d3.zoomIdentity,
        selected: null,
        hovered: null,
        pathMode: false,
        pathAnchor: null,
        pathNodes: new Set(),
        pathEdges: new Set(),
        favorites: new Set(),
        filter: 'all',
        query: '',
        width: 0,
        height: 0,
        loaded: false,
        loading: false,
    };

    const colors = {
        article: '#ff9b87',
        project: '#63e6be',
        topic: '#d9b8ff',
        profile: '#ffd27a',
        site: '#7bc7ff',
        tool: '#83d9ff',
        game: '#b9c5ff',
    };

    try {
        state.favorites = new Set(JSON.parse(localStorage.getItem('home_knowledge_favorites') || '[]'));
    } catch (error) {
        localStorage.removeItem('home_knowledge_favorites');
    }

    function text(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function nodeGroup(node) {
        if (node.kind === 'topic') return 'topic';
        if (node.kind === 'article') return 'article';
        if (['project', 'tool', 'site', 'game'].includes(node.kind)) return 'project';
        return 'profile';
    }

    function nodeColor(node) {
        return colors[node.kind] || '#d5f2e9';
    }

    function isMatch(node) {
        if (state.filter !== 'all' && nodeGroup(node) !== state.filter) return false;
        if (!state.query) return true;
        const haystack = `${node.label} ${node.title} ${node.summary} ${(node.topics || []).join(' ')}`.toLowerCase();
        return haystack.includes(state.query);
    }

    function nodeRadius(node) {
        return node.kind === 'topic' ? 7 + node.weight * 2.2 : 4.2 + node.weight * 2.4;
    }

    function edgeKey(source, target) {
        return [source, target].sort().join('::');
    }

    function shortestPath(startId, endId) {
        if (!startId || !endId) return [];
        const adjacency = new Map(state.nodes.map(node => [node.id, []]));
        state.links.forEach(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            if (adjacency.has(source) && adjacency.has(target)) {
                adjacency.get(source).push(target);
                adjacency.get(target).push(source);
            }
        });
        const queue = [startId];
        const previous = new Map([[startId, null]]);
        while (queue.length) {
            const current = queue.shift();
            if (current === endId) break;
            adjacency.get(current)?.forEach(next => {
                if (!previous.has(next)) {
                    previous.set(next, current);
                    queue.push(next);
                }
            });
        }
        if (!previous.has(endId)) return [];
        const path = [];
        for (let current = endId; current; current = previous.get(current)) path.unshift(current);
        return path;
    }

    function paintPath(path) {
        state.pathNodes = new Set(path);
        state.pathEdges = new Set(path.slice(1).map((id, index) => edgeKey(path[index], id)));
        const panel = document.getElementById('knowledge-map-path');
        const labels = path.map(id => state.nodes.find(node => node.id === id)?.label).filter(Boolean);
        panel.hidden = !labels.length;
        text('knowledge-map-path-text', labels.length > 1 ? labels.join(' → ') : labels[0] ? `起点：${labels[0]}，继续选择目标节点` : '');
    }

    function visibleRelated(node) {
        if (!node) return [];
        const relatedIds = new Map();
        state.links.forEach(link => {
            const source = typeof link.source === 'object' ? link.source : state.nodes.find(item => item.id === link.source);
            const target = typeof link.target === 'object' ? link.target : state.nodes.find(item => item.id === link.target);
            if (!source || !target) return;
            const other = source.id === node.id ? target : target.id === node.id ? source : null;
            if (other) relatedIds.set(other.id, other);
        });
        return [...relatedIds.values()].slice(0, 8);
    }

    function selectedNeighbors() {
        return new Set(visibleRelated(state.selected).map(node => node.id));
    }

    function draw() {
        if (!state.width || !state.height) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, state.width, state.height);
        context.save();
        context.translate(state.transform.x, state.transform.y);
        context.scale(state.transform.k, state.transform.k);

        const neighbors = selectedNeighbors();
        state.links.forEach(link => {
            const source = link.source;
            const target = link.target;
            if (!source || !target) return;
            const sourceMatch = isMatch(source);
            const targetMatch = isMatch(target);
            const connected = state.selected && (source.id === state.selected.id || target.id === state.selected.id);
            const onPath = state.pathEdges.has(edgeKey(source.id, target.id));
            context.beginPath();
            context.moveTo(source.x, source.y);
            context.lineTo(target.x, target.y);
            context.strokeStyle = onPath ? 'rgba(255,210,122,.95)' : connected ? 'rgba(180,255,235,.72)' : sourceMatch && targetMatch ? link.kind === 'topic' ? 'rgba(159,235,220,.25)' : 'rgba(180,210,235,.18)' : 'rgba(159,235,220,.035)';
            context.lineWidth = (onPath ? 2.7 : connected ? 1.8 : link.kind === 'topic' ? 1.1 : .75) / state.transform.k;
            context.stroke();
        });

        state.nodes.forEach(node => {
            const match = isMatch(node);
            const selected = state.selected?.id === node.id;
            const hovered = state.hovered?.id === node.id;
            const connected = neighbors.has(node.id);
            const onPath = state.pathNodes.has(node.id);
            const radius = nodeRadius(node) / (selected || hovered ? .88 : 1);
            context.beginPath();
            context.arc(node.x, node.y, radius, 0, Math.PI * 2);
            context.globalAlpha = match ? 1 : .1;
            context.fillStyle = onPath ? '#ffd27a' : nodeColor(node);
            context.shadowBlur = selected || hovered ? 20 : node.kind === 'topic' ? 12 : 7;
            context.shadowColor = onPath ? '#ffd27a' : nodeColor(node);
            context.fill();
            context.shadowBlur = 0;
            if (selected || hovered || connected || onPath) {
                context.beginPath();
                context.arc(node.x, node.y, radius + 4 / state.transform.k, 0, Math.PI * 2);
                context.strokeStyle = selected ? 'rgba(255,255,255,.9)' : 'rgba(210,255,243,.4)';
                context.lineWidth = 1 / state.transform.k;
                context.stroke();
            }
            context.globalAlpha = 1;

            const showLabel = selected || hovered || connected || node.kind === 'topic' || state.transform.k > 1.08;
            if (showLabel && match) {
                context.font = `${node.kind === 'topic' ? 700 : 500} ${node.kind === 'topic' ? 12 : 10}px Segoe UI, Microsoft YaHei, sans-serif`;
                context.fillStyle = selected ? '#ffffff' : 'rgba(236,247,244,.78)';
                context.textAlign = 'center';
                context.textBaseline = 'top';
                const label = String(node.label || '').length > 24 ? `${String(node.label).slice(0, 23)}…` : node.label;
                context.fillText(label, node.x, node.y + radius + 6 / state.transform.k);
            }
        });
        context.restore();
    }

    function resize() {
        const bounds = canvas.parentElement.getBoundingClientRect();
        state.width = Math.max(1, bounds.width);
        state.height = Math.max(1, bounds.height);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(state.width * ratio);
        canvas.height = Math.round(state.height * ratio);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        if (state.simulation) state.simulation.force('center', d3.forceCenter(state.width / 2, state.height / 2)).alpha(.15).restart();
        draw();
    }

    function renderRelated(node) {
        const related = visibleRelated(node);
        text('knowledge-map-related-count', related.length);
        const list = document.getElementById('knowledge-map-related-list');
        list.innerHTML = related.length
            ? related.map(item => `<button type="button" data-map-node="${escapeHtml(item.id)}"><i></i><span>${escapeHtml(item.label)}</span></button>`).join('')
            : '<span class="knowledge-map-no-related">暂无直接关联</span>';
    }

    function renderExploreState(node) {
        const pathButton = document.getElementById('knowledge-map-path-mode');
        pathButton.classList.toggle('is-active', state.pathMode);
        pathButton.setAttribute('aria-pressed', String(state.pathMode));
        const favoriteButton = document.getElementById('knowledge-map-favorite');
        const favorite = Boolean(node && state.favorites.has(node.id));
        favoriteButton.classList.toggle('is-active', favorite);
        favoriteButton.setAttribute('aria-pressed', String(favorite));
        favoriteButton.innerHTML = favorite
            ? '<i class="fa-solid fa-bookmark"></i><span>已收藏</span>'
            : '<i class="fa-regular fa-bookmark"></i><span>收藏节点</span>';
    }

    function selectNode(node, options = {}) {
        if (!node) return;
        state.selected = node;
        if (state.pathMode && options.explore !== false) {
            if (!state.pathAnchor) {
                state.pathAnchor = node;
                paintPath([node.id]);
            } else if (state.pathAnchor.id !== node.id) {
                paintPath(shortestPath(state.pathAnchor.id, node.id));
            }
        }
        text('knowledge-map-detail-kind', `${nodeGroup(node).toUpperCase()} / ${node.site || 'KNOWLEDGE'}`);
        text('knowledge-map-detail-title', node.title || node.label);
        text('knowledge-map-detail-summary', node.summary || '暂无摘要');
        const tags = document.getElementById('knowledge-map-detail-tags');
        tags.innerHTML = (node.topics || []).map(topic => `<span>${escapeHtml(topic)}</span>`).join('');
        renderRelated(node);
        renderExploreState(node);
        const link = document.getElementById('knowledge-map-detail-link');
        if (node.url) {
            link.hidden = false;
            link.href = node.url;
        } else {
            link.hidden = true;
            link.removeAttribute('href');
        }
        draw();
    }

    function matchingNodes() {
        return state.nodes.filter(isMatch);
    }

    function focusNode(node) {
        if (!node || !state.zoom) return;
        const scale = Math.min(2.1, Math.max(1.25, state.transform.k));
        const transform = d3.zoomIdentity.translate(state.width / 2 - node.x * scale, state.height / 2 - node.y * scale).scale(scale);
        d3.select(canvas).transition().duration(380).call(state.zoom.transform, transform);
    }

    function setFilter(filter) {
        state.filter = filter;
        document.querySelectorAll('[data-map-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.mapFilter === filter));
        const match = matchingNodes()[0];
        if (match) selectNode(match, { explore: false });
        draw();
    }

    function setupGraph(data) {
        state.nodes = (data.nodes || []).map(node => ({ ...node }));
        state.links = (data.edges || []).map(link => ({ ...link }));
        state.simulation = d3.forceSimulation(state.nodes)
            .force('link', d3.forceLink(state.links).id(node => node.id).distance(link => link.kind === 'topic' ? 78 : 126).strength(link => .16 + Number(link.weight || .5) * .15))
            .force('charge', d3.forceManyBody().strength(node => node.kind === 'topic' ? -310 : -145).distanceMax(650))
            .force('center', d3.forceCenter(state.width / 2, state.height / 2))
            .force('collide', d3.forceCollide(node => nodeRadius(node) + 12).iterations(2))
            .on('tick', draw);
        state.zoom = d3.zoom().scaleExtent([.42, 3.4]).on('zoom', event => { state.transform = event.transform; draw(); });
        d3.select(canvas).call(state.zoom).on('dblclick.zoom', null);
        d3.select(canvas).call(d3.drag()
            .container(canvas)
            .subject(event => {
                const [x, y] = state.transform.invert(d3.pointer(event, canvas));
                return state.simulation.find(x, y, 28 / state.transform.k);
            })
            .on('start', event => {
                if (!event.active) state.simulation.alphaTarget(.24).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            })
            .on('drag', event => {
                const [x, y] = state.transform.invert(d3.pointer(event.sourceEvent, canvas));
                event.subject.fx = x;
                event.subject.fy = y;
            })
            .on('end', event => {
                if (!event.active) state.simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }));
        state.loaded = true;
        text('knowledge-map-node-count', state.nodes.length);
        text('knowledge-map-edge-count', data.stats?.connections ?? state.links.length);
        document.getElementById('knowledge-map-loading').classList.add('is-hidden');
        selectNode(state.nodes.find(node => node.kind === 'topic') || state.nodes[0], { explore: false });
    }

    async function loadGraph() {
        if (state.loaded || state.loading) return;
        state.loading = true;
        try {
            if (!window.d3) throw new Error('D3 unavailable');
            const response = await fetch(`${API_ROOT}/home/knowledge-graph?limit=42`, { credentials: 'include', signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setupGraph(await response.json());
        } catch (error) {
            console.warn('知识星图加载失败', error);
            const loading = document.getElementById('knowledge-map-loading');
            loading.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>关系数据暂时不可用</span>';
        } finally {
            state.loading = false;
        }
    }

    function openMap() {
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('knowledge-map-open');
        resize();
        loadGraph();
        setTimeout(() => document.getElementById('knowledge-map-query').focus(), 80);
    }

    function closeMap() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('knowledge-map-open');
    }

    document.getElementById('knowledge-map-open').addEventListener('click', openMap);
    document.getElementById('knowledge-map-close').addEventListener('click', closeMap);
    document.getElementById('knowledge-map-reset').addEventListener('click', () => {
        if (state.zoom) d3.select(canvas).transition().duration(350).call(state.zoom.transform, d3.zoomIdentity);
    });
    document.getElementById('knowledge-map-path-mode').addEventListener('click', () => {
        state.pathMode = !state.pathMode;
        state.pathAnchor = state.pathMode ? state.selected : null;
        paintPath(state.pathAnchor ? [state.pathAnchor.id] : []);
        renderExploreState(state.selected);
        draw();
    });
    document.getElementById('knowledge-map-favorite').addEventListener('click', () => {
        if (!state.selected) return;
        if (state.favorites.has(state.selected.id)) state.favorites.delete(state.selected.id);
        else state.favorites.add(state.selected.id);
        localStorage.setItem('home_knowledge_favorites', JSON.stringify([...state.favorites]));
        renderExploreState(state.selected);
    });
    document.querySelectorAll('[data-map-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.mapFilter)));
    document.getElementById('knowledge-map-query').addEventListener('input', event => {
        state.query = event.target.value.trim().toLowerCase();
        const match = matchingNodes()[0];
        if (match) {
            selectNode(match, { explore: false });
            focusNode(match);
        } else {
            draw();
        }
    });
    document.getElementById('knowledge-map-related-list').addEventListener('click', event => {
        const button = event.target.closest('[data-map-node]');
        if (button) selectNode(state.nodes.find(node => node.id === button.dataset.mapNode));
    });
    canvas.addEventListener('pointermove', event => {
        if (!state.simulation) return;
        const [x, y] = state.transform.invert(d3.pointer(event, canvas));
        state.hovered = state.simulation.find(x, y, 24 / state.transform.k) || null;
        canvas.style.cursor = state.hovered ? 'pointer' : 'grab';
        draw();
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => { state.hovered = null; draw(); }, { passive: true });
    canvas.addEventListener('click', event => {
        if (!state.simulation) return;
        const [x, y] = state.transform.invert(d3.pointer(event, canvas));
        selectNode(state.simulation.find(x, y, 24 / state.transform.k));
    });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('home:knowledge-map-open', openMap);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeMap();
    });
})();
