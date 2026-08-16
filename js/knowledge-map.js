(function () {
    const overlay = document.getElementById('knowledge-map');
    const canvas = document.getElementById('knowledge-map-canvas');
    if (!overlay || !canvas) return;

    const API_ROOT = ['127.0.0.1', 'localhost'].includes(location.hostname)
        ? 'http://127.0.0.1:8090/api/v1'
        : '/api/v1';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = {
        nodes: [], links: [], simulation: null, scene: null, camera: null, renderer: null,
        controls: null, raycaster: null, pointer: null, nodeMeshes: new Map(), pickMeshes: [],
        linkLines: [], selected: null, hovered: null, pathMode: false, pathAnchor: null,
        pathNodes: new Set(), pathEdges: new Set(), favorites: new Set(), filter: 'all',
        query: '', width: 0, height: 0, loaded: false, loading: false, pointerDown: null,
        cameraTween: null, resumeRotateTimer: 0, stars: null, clock: null,
    };

    const colors = {
        article: '#ff9b87', project: '#63e6be', topic: '#d9b8ff', profile: '#ffd27a',
        site: '#7bc7ff', tool: '#83d9ff', game: '#b9c5ff',
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
        return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function nodeGroup(node) {
        if (node.kind === 'topic') return 'topic';
        if (node.kind === 'article') return 'article';
        if (['project', 'tool', 'site', 'game'].includes(node.kind)) return 'project';
        return 'profile';
    }

    function nodeColor(node) { return colors[node.kind] || '#d5f2e9'; }
    function nodeRadius(node) { return node.kind === 'topic' ? 5.4 + node.weight * 1.5 : 3.5 + node.weight * 1.45; }
    function edgeKey(source, target) { return [source, target].sort().join('::'); }
    function defaultCameraDistance() { return window.innerWidth < 700 ? 440 : 610; }

    function isMatch(node) {
        if (state.filter !== 'all' && nodeGroup(node) !== state.filter) return false;
        if (!state.query) return true;
        const haystack = `${node.label} ${node.title} ${node.summary} ${(node.topics || []).join(' ')}`.toLowerCase();
        return haystack.includes(state.query);
    }

    function hashDepth(value) {
        let hash = 2166136261;
        for (const character of String(value)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) / 4294967295 - .5) * 290;
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
        applyVisualState();
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

    function selectedNeighbors() { return new Set(visibleRelated(state.selected).map(node => node.id)); }

    function makeGlowTexture() {
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = textureCanvas.height = 128;
        const context = textureCanvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(.14, 'rgba(255,255,255,.75)');
        gradient.addColorStop(.42, 'rgba(255,255,255,.16)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(textureCanvas);
    }

    function makeLabel(node) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 84;
        const context = labelCanvas.getContext('2d');
        context.clearRect(0, 0, 512, 84);
        context.font = `${node.kind === 'topic' ? '700' : '600'} ${node.kind === 'topic' ? 27 : 23}px "Microsoft YaHei", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = 'rgba(0,0,0,.95)';
        context.shadowBlur = 8;
        context.lineWidth = 5;
        context.strokeStyle = 'rgba(4,12,15,.92)';
        const value = String(node.label || '').length > 27 ? `${String(node.label).slice(0, 26)}…` : node.label;
        context.strokeText(value, 256, 42);
        context.fillStyle = node.kind === 'topic' ? '#f5f0ff' : '#dcefeb';
        context.fillText(value, 256, 42);
        const texture = new THREE.CanvasTexture(labelCanvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .92 });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(112, 18.4, 1);
        sprite.position.y = nodeRadius(node) + 13;
        return sprite;
    }

    function createNodeObject(node, glowTexture) {
        const group = new THREE.Group();
        const radius = nodeRadius(node);
        const color = new THREE.Color(nodeColor(node));
        const core = new THREE.Mesh(
            new THREE.IcosahedronGeometry(radius, 2),
            new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: .3, shininess: 95, transparent: true })
        );
        core.userData.node = node;
        group.add(core);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture, color, transparent: true, opacity: node.kind === 'topic' ? .62 : .42,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.scale.setScalar(radius * 5.6);
        group.add(glow);
        let ring = null;
        if (node.kind === 'topic') {
            ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius * 1.55, .32, 8, 44),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, blending: THREE.AdditiveBlending })
            );
            ring.rotation.x = Math.PI / 2.5;
            group.add(ring);
        }
        const label = makeLabel(node);
        group.add(label);
        group.userData = { node, core, glow, label, ring };
        state.pickMeshes.push(core);
        state.nodeMeshes.set(node.id, group);
        return group;
    }

    function createStars() {
        const count = window.innerWidth < 700 ? 420 : 900;
        const positions = new Float32Array(count * 3);
        for (let index = 0; index < count; index += 1) {
            const radius = 320 + Math.random() * 620;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[index * 3 + 2] = radius * Math.cos(phi);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        state.stars = new THREE.Points(geometry, new THREE.PointsMaterial({
            color: 0x8fe8df, size: 1.25, transparent: true, opacity: .42, sizeAttenuation: true,
        }));
        state.scene.add(state.stars);
    }

    function setupScene() {
        if (state.renderer) return;
        if (!window.THREE || !THREE.OrbitControls) throw new Error('Three.js unavailable');
        state.scene = new THREE.Scene();
        state.scene.fog = new THREE.FogExp2(0x071012, .00115);
        state.camera = new THREE.PerspectiveCamera(48, 1, .1, 2400);
        state.camera.position.set(0, 26, defaultCameraDistance());
        state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
        canvas.dataset.renderer = 'three-webgl';
        state.renderer.setClearColor(0x071012, 0);
        state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        state.renderer.outputEncoding = THREE.sRGBEncoding;
        state.controls = new THREE.OrbitControls(state.camera, canvas);
        state.controls.enableDamping = !prefersReducedMotion;
        state.controls.dampingFactor = .065;
        state.controls.rotateSpeed = .52;
        state.controls.zoomSpeed = .75;
        state.controls.minDistance = 180;
        state.controls.maxDistance = 1050;
        state.controls.autoRotate = !prefersReducedMotion;
        state.controls.autoRotateSpeed = .24;
        state.controls.enablePan = true;
        state.controls.screenSpacePanning = true;
        state.controls.addEventListener('start', () => {
            clearTimeout(state.resumeRotateTimer);
            state.controls.autoRotate = false;
        });
        state.controls.addEventListener('end', () => {
            if (!prefersReducedMotion) state.resumeRotateTimer = setTimeout(() => { state.controls.autoRotate = true; }, 3600);
        });
        state.scene.add(new THREE.AmbientLight(0xa8fff0, .28));
        const keyLight = new THREE.PointLight(0x63e6be, .7, 850);
        keyLight.position.set(140, 180, 260);
        state.scene.add(keyLight);
        const rimLight = new THREE.PointLight(0xd9b8ff, .5, 780);
        rimLight.position.set(-210, -130, 110);
        state.scene.add(rimLight);
        const grid = new THREE.GridHelper(900, 24, 0x2d867c, 0x153d3b);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = -250;
        grid.material.transparent = true;
        grid.material.opacity = .16;
        state.scene.add(grid);
        createStars();
        state.raycaster = new THREE.Raycaster();
        state.pointer = new THREE.Vector2(2, 2);
        state.clock = new THREE.Clock();
        resize();
        animate();
    }

    function updateNodePositions() {
        state.nodes.forEach(node => {
            const group = state.nodeMeshes.get(node.id);
            if (group) group.position.set(Number(node.x || 0), Number(node.y || 0), Number(node.z || 0));
        });
        state.linkLines.forEach(({ line, link }) => {
            const source = link.source;
            const target = link.target;
            if (!source || !target) return;
            const positions = line.geometry.attributes.position.array;
            positions[0] = source.x || 0; positions[1] = source.y || 0; positions[2] = source.z || 0;
            positions[3] = target.x || 0; positions[4] = target.y || 0; positions[5] = target.z || 0;
            line.geometry.attributes.position.needsUpdate = true;
        });
    }

    function applyVisualState() {
        if (!state.renderer) return;
        const neighbors = selectedNeighbors();
        state.nodes.forEach(node => {
            const group = state.nodeMeshes.get(node.id);
            if (!group) return;
            const match = isMatch(node);
            const selected = state.selected?.id === node.id;
            const hovered = state.hovered?.id === node.id;
            const connected = neighbors.has(node.id);
            const onPath = state.pathNodes.has(node.id);
            const color = new THREE.Color(onPath ? '#ffd27a' : nodeColor(node));
            group.userData.core.material.color.copy(color);
            group.userData.core.material.emissive.copy(color);
            group.userData.core.material.opacity = match ? 1 : .08;
            group.userData.glow.material.color.copy(color);
            group.userData.glow.material.opacity = match ? (selected || hovered || onPath ? .86 : .38) : .025;
            group.userData.label.visible = match && (selected || hovered || connected || onPath || node.kind === 'topic');
            group.userData.label.material.opacity = selected ? 1 : .82;
            group.scale.setScalar(selected || hovered ? 1.34 : onPath ? 1.18 : 1);
            if (group.userData.ring) {
                group.userData.ring.material.color.copy(color);
                group.userData.ring.material.opacity = match ? .5 : .04;
            }
        });
        state.linkLines.forEach(({ line, link }) => {
            const source = link.source;
            const target = link.target;
            const onPath = state.pathEdges.has(edgeKey(source.id, target.id));
            const connected = state.selected && (source.id === state.selected.id || target.id === state.selected.id);
            const visible = isMatch(source) && isMatch(target);
            line.material.color.set(onPath ? '#ffd27a' : connected ? '#a1f7dd' : link.kind === 'topic' ? '#5aa99d' : '#548195');
            line.material.opacity = onPath ? .95 : connected ? .7 : visible ? .2 : .018;
        });
    }

    function animateCamera(time) {
        if (!state.cameraTween) return;
        const elapsed = Math.min(1, (time - state.cameraTween.started) / state.cameraTween.duration);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        state.camera.position.lerpVectors(state.cameraTween.fromPosition, state.cameraTween.toPosition, eased);
        state.controls.target.lerpVectors(state.cameraTween.fromTarget, state.cameraTween.toTarget, eased);
        if (elapsed >= 1) state.cameraTween = null;
    }

    function animate(time = performance.now()) {
        requestAnimationFrame(animate);
        if (!state.renderer || !state.scene || !state.camera) return;
        const elapsed = state.clock?.getElapsedTime() || 0;
        animateCamera(time);
        state.controls.update();
        if (state.stars && !prefersReducedMotion) {
            state.stars.rotation.y += .00013;
            state.stars.rotation.x = Math.sin(elapsed * .05) * .06;
        }
        state.nodeMeshes.forEach(group => {
            if (group.userData.ring && !prefersReducedMotion) group.userData.ring.rotation.z += .003;
            if (state.selected?.id === group.userData.node.id) {
                const pulse = 1.28 + Math.sin(elapsed * 2.8) * .06;
                group.scale.setScalar(pulse);
            }
        });
        state.renderer.render(state.scene, state.camera);
    }

    function resize() {
        if (!state.renderer) return;
        const bounds = canvas.parentElement.getBoundingClientRect();
        state.width = Math.max(1, bounds.width);
        state.height = Math.max(1, bounds.height);
        state.camera.aspect = state.width / state.height;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(state.width, state.height, false);
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
        document.getElementById('knowledge-map-detail-tags').innerHTML = (node.topics || []).map(topic => `<span>${escapeHtml(topic)}</span>`).join('');
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
        applyVisualState();
    }

    function matchingNodes() { return state.nodes.filter(isMatch); }

    function focusNode(node) {
        const group = state.nodeMeshes.get(node?.id);
        if (!group || !state.camera) return;
        const target = group.position.clone();
        const direction = state.camera.position.clone().sub(state.controls.target).normalize();
        const distance = Math.max(235, Math.min(390, state.camera.position.distanceTo(state.controls.target) * .72));
        state.cameraTween = {
            fromPosition: state.camera.position.clone(), toPosition: target.clone().add(direction.multiplyScalar(distance)),
            fromTarget: state.controls.target.clone(), toTarget: target, started: performance.now(), duration: 520,
        };
    }

    function resetView() {
        if (!state.camera) return;
        state.cameraTween = {
            fromPosition: state.camera.position.clone(), toPosition: new THREE.Vector3(0, 26, defaultCameraDistance()),
            fromTarget: state.controls.target.clone(), toTarget: new THREE.Vector3(0, 0, 0),
            started: performance.now(), duration: 620,
        };
    }

    function setFilter(filter) {
        state.filter = filter;
        document.querySelectorAll('[data-map-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.mapFilter === filter));
        const match = matchingNodes()[0];
        if (match) selectNode(match, { explore: false });
        else applyVisualState();
    }

    function setupGraph(data) {
        setupScene();
        state.nodes = (data.nodes || []).map(node => ({ ...node, z: hashDepth(node.id) + (node.kind === 'topic' ? 18 : 0) }));
        state.links = (data.edges || []).map(link => ({ ...link }));
        const glowTexture = makeGlowTexture();
        state.nodes.forEach(node => state.scene.add(createNodeObject(node, glowTexture)));
        state.simulation = d3.forceSimulation(state.nodes)
            .force('link', d3.forceLink(state.links).id(node => node.id).distance(link => link.kind === 'topic' ? 76 : 112).strength(link => .16 + Number(link.weight || .5) * .12))
            .force('charge', d3.forceManyBody().strength(node => node.kind === 'topic' ? -255 : -122).distanceMax(620))
            .force('center', d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide(node => nodeRadius(node) + 12).iterations(2))
            .on('tick', updateNodePositions);
        state.links.forEach(link => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
            const material = new THREE.LineBasicMaterial({
                color: 0x548195, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            state.scene.add(line);
            state.linkLines.push({ line, link });
        });
        updateNodePositions();
        state.loaded = true;
        canvas.dataset.nodes = String(state.nodes.length);
        canvas.dataset.links = String(state.links.length);
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
            setupScene();
            const response = await fetch(`${API_ROOT}/home/knowledge-graph?limit=42`, {
                credentials: 'include', signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setupGraph(await response.json());
        } catch (error) {
            console.warn('知识星图加载失败', error);
            document.getElementById('knowledge-map-loading').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>三维关系场暂时不可用</span>';
        } finally {
            state.loading = false;
        }
    }

    function updatePointer(event) {
        if (!state.camera || !state.raycaster) return null;
        const bounds = canvas.getBoundingClientRect();
        state.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        state.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        state.raycaster.setFromCamera(state.pointer, state.camera);
        return state.raycaster.intersectObjects(state.pickMeshes, false)[0]?.object?.userData?.node || null;
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
    document.getElementById('knowledge-map-reset').addEventListener('click', resetView);
    document.getElementById('knowledge-map-path-mode').addEventListener('click', () => {
        state.pathMode = !state.pathMode;
        state.pathAnchor = state.pathMode ? state.selected : null;
        paintPath(state.pathAnchor ? [state.pathAnchor.id] : []);
        renderExploreState(state.selected);
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
        } else applyVisualState();
    });
    document.getElementById('knowledge-map-related-list').addEventListener('click', event => {
        const button = event.target.closest('[data-map-node]');
        if (!button) return;
        const node = state.nodes.find(item => item.id === button.dataset.mapNode);
        selectNode(node);
        focusNode(node);
    });
    canvas.addEventListener('pointerdown', event => {
        state.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    }, { passive: true });
    canvas.addEventListener('pointermove', event => {
        if (!state.loaded) return;
        const hovered = updatePointer(event);
        if (hovered?.id !== state.hovered?.id) {
            state.hovered = hovered;
            canvas.style.cursor = hovered ? 'pointer' : 'grab';
            applyVisualState();
        }
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => {
        state.hovered = null;
        canvas.style.cursor = 'grab';
        applyVisualState();
    }, { passive: true });
    canvas.addEventListener('pointerup', event => {
        if (!state.pointerDown) return;
        const distance = Math.hypot(event.clientX - state.pointerDown.x, event.clientY - state.pointerDown.y);
        const duration = performance.now() - state.pointerDown.time;
        state.pointerDown = null;
        if (distance < 6 && duration < 500) selectNode(updatePointer(event));
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('home:knowledge-map-open', openMap);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeMap();
    });
})();
