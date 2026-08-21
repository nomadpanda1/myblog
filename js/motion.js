(function () {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const root = document.documentElement;
    const body = document.body;
    let sceneFrame = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let audioEnergy = 0;
    let weatherMode = 'clear';
    let ambient3d = null;

    body.classList.add('motion-enabled');

    function initThreeAmbient() {
        const canvas = document.createElement('canvas');
        canvas.id = 'home-particles';
        canvas.dataset.renderer = 'three-webgl';
        canvas.setAttribute('aria-hidden', 'true');
        body.insertAdjacentElement('afterbegin', canvas);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(46, 1, .1, 220);
        camera.position.z = 42;
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

        const constellation = new THREE.Group();
        scene.add(constellation);
        const count = reducedMotion.matches ? 72 : window.innerWidth < 720 ? 96 : 162;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const seeds = [];
        for (let index = 0; index < count; index += 1) {
            const seed = {
                x: (Math.random() - .5) * 62,
                y: (Math.random() - .5) * 38,
                z: (Math.random() - .5) * 34,
                accent: index % 7 === 0,
            };
            seeds.push(seed);
            positions[index * 3] = seed.x;
            positions[index * 3 + 1] = seed.y;
            positions[index * 3 + 2] = seed.z;
        }
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const pointMaterial = new THREE.PointsMaterial({
            size: reducedMotion.matches ? .42 : .34,
            transparent: true,
            opacity: .96,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const points = new THREE.Points(pointGeometry, pointMaterial);
        constellation.add(points);

        const fieldCount = reducedMotion.matches ? 110 : window.innerWidth < 720 ? 180 : 360;
        const fieldPositions = new Float32Array(fieldCount * 3);
        const fieldColors = new Float32Array(fieldCount * 3);
        const fieldVelocity = [];
        const fieldPhase = [];
        for (let index = 0; index < fieldCount; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 26;
            fieldPositions[index * 3] = Math.cos(angle) * radius;
            fieldPositions[index * 3 + 1] = Math.sin(angle) * radius * .58;
            fieldPositions[index * 3 + 2] = (Math.random() - .5) * 18;
            fieldVelocity.push({
                x: (Math.random() - .5) * .018,
                y: (Math.random() - .5) * .018,
                z: (Math.random() - .5) * .012,
            });
            fieldPhase.push(Math.random() * Math.PI * 2);
        }
        const fieldGeometry = new THREE.BufferGeometry();
        fieldGeometry.setAttribute('position', new THREE.BufferAttribute(fieldPositions, 3));
        fieldGeometry.setAttribute('color', new THREE.BufferAttribute(fieldColors, 3));
        const fieldMaterial = new THREE.PointsMaterial({
            size: reducedMotion.matches ? .5 : .38,
            transparent: true,
            opacity: .78,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const field = new THREE.Points(fieldGeometry, fieldMaterial);
        constellation.add(field);

        const linkPositions = [];
        seeds.forEach((seed, index) => {
            const candidates = seeds.map((other, otherIndex) => ({
                other,
                otherIndex,
                distance: otherIndex === index ? Infinity : Math.hypot(seed.x - other.x, seed.y - other.y, seed.z - other.z),
            })).sort((a, b) => a.distance - b.distance).slice(0, index % 4 === 0 ? 2 : 1);
            candidates.forEach(({ other, otherIndex }) => {
                if (otherIndex < index) return;
                linkPositions.push(seed.x, seed.y, seed.z, other.x, other.y, other.z);
            });
        });
        const linkGeometry = new THREE.BufferGeometry();
        linkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3));
        const linkMaterial = new THREE.LineBasicMaterial({
            color: 0x72d8cb,
            transparent: true,
            opacity: .34,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        constellation.add(new THREE.LineSegments(linkGeometry, linkMaterial));

        const rings = [9, 15.5, 22].map((radius, index) => {
            const ring = new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, step) => {
                    const angle = step / 96 * Math.PI * 2;
                    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * .48, 0);
                })),
                new THREE.LineBasicMaterial({ color: index === 1 ? 0xffd691 : 0x63e6be, transparent: true, opacity: .12 })
            );
            ring.rotation.set(.36 + index * .18, -.18 + index * .34, index * .55);
            constellation.add(ring);
            return ring;
        });

        // A compact reactor layer gives the ambient field a focal point instead of a flat star field.
        const reactor = new THREE.Group();
        reactor.position.set(14, -10.5, -3.5);
        reactor.scale.setScalar(window.innerWidth < 720 ? .58 : .74);
        const reactorShell = new THREE.Mesh(
            new THREE.IcosahedronGeometry(2.35, 2),
            new THREE.MeshBasicMaterial({ color: 0x52f4dc, wireframe: true, transparent: true, opacity: .34, blending: THREE.AdditiveBlending }),
        );
        const reactorCore = new THREE.Mesh(
            new THREE.SphereGeometry(1.12, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xd8fff6, transparent: true, opacity: .62, blending: THREE.AdditiveBlending }),
        );
        const reactorGlow = new THREE.Mesh(
            new THREE.SphereGeometry(2.8, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0x38d9d0, transparent: true, opacity: .045, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        reactor.add(reactorGlow, reactorCore, reactorShell);
        const reactorRings = [
            [3.2, 0x59f0ff, .34, .3],
            [4.3, 0xffc76c, .22, -.22],
        ].map(([radius, color, opacity, tilt]) => {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius, .018, 8, 96),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending }),
            );
            ring.rotation.set(Math.PI * .5 + tilt, tilt, tilt * 1.7);
            reactor.add(ring);
            return ring;
        });
        const reactorStreams = Array.from({ length: 5 }, (_, index) => {
            const points = Array.from({ length: 30 }, (_, step) => {
                const progress = step / 29;
                const angle = progress * Math.PI * 2 + index * 1.26;
                const radius = 4.8 - progress * 2.1;
                return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * .48, (progress - .5) * 1.8);
            });
            const stream = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color: index % 2 ? 0xffc76c : 0x6df7dc, transparent: true, opacity: .44, blending: THREE.AdditiveBlending }),
            );
            reactor.add(stream);
            return stream;
        });
        constellation.add(reactor);

        const meteorGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-4.5, 0, 0), new THREE.Vector3(0, 0, 0),
        ]);
        const meteorMaterial = new THREE.LineBasicMaterial({ color: 0xd9fff7, transparent: true, opacity: .7, blending: THREE.AdditiveBlending });
        const meteor = new THREE.Line(meteorGeometry, meteorMaterial);
        meteor.visible = !reducedMotion.matches;
        constellation.add(meteor);
        const ripples = [];
        const trailCapacity = !precisePointer.matches ? 0 : reducedMotion.matches ? 36 : 84;
        const trailPositions = trailCapacity ? new Float32Array(trailCapacity * 3) : null;
        const trailColors = trailCapacity ? new Float32Array(trailCapacity * 3) : null;
        const trailParticles = trailCapacity ? Array.from({ length: trailCapacity }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 })) : null;
        let trailCursor = 0;
        let lastTrailWorld = null;
        let trailPoints = null;
        let trailMaterial = null;
        if (trailCapacity) {
            trailPositions.fill(-100);
            const trailGeometry = new THREE.BufferGeometry();
            trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
            trailMaterial = new THREE.PointsMaterial({
                size: .22,
                transparent: true,
                opacity: .78,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true,
            });
            trailPoints = new THREE.Points(trailGeometry, trailMaterial);
            scene.add(trailPoints);
        }
        let energy = 0;
        let mode = 'clear';
        let pointerX = 0;
        let pointerY = 0;
        let fieldPulse = 0;
        let lastTime = performance.now();

        function setPalette(nextMode) {
            mode = nextMode;
            const primary = new THREE.Color(nextMode === 'rain' || nextMode === 'storm' ? '#84ceff' : nextMode === 'snow' ? '#e1eeff' : '#90ffec');
            const accent = new THREE.Color(nextMode === 'storm' ? '#d7b8ff' : '#ffd691');
            seeds.forEach((seed, index) => {
                const color = seed.accent ? accent : primary;
                colors[index * 3] = color.r;
                colors[index * 3 + 1] = color.g;
                colors[index * 3 + 2] = color.b;
            });
            pointGeometry.attributes.color.needsUpdate = true;
            for (let index = 0; index < fieldCount; index += 1) {
                const color = index % 9 === 0 ? accent : primary;
                fieldColors[index * 3] = color.r;
                fieldColors[index * 3 + 1] = color.g;
                fieldColors[index * 3 + 2] = color.b;
            }
            fieldGeometry.attributes.color.needsUpdate = true;
            linkMaterial.color.copy(primary);
        }

        function resize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            camera.aspect = width / Math.max(1, height);
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        }

        function spawnRipple(event) {
            // A direct click is explicit user input, so keep this short feedback even when ambient motion is reduced.
            canvas.dataset.lastPulse = String(Date.now());
            const distance = camera.position.z;
            const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
            const worldWidth = worldHeight * camera.aspect;
            const x = (event.clientX / window.innerWidth - .5) * worldWidth;
            const y = -(event.clientY / window.innerHeight - .5) * worldHeight;
            const colors = [0x8effe9, 0xffd691];
            colors.forEach((color, index) => {
                const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .52 - index * .12, blending: THREE.AdditiveBlending, depthWrite: false });
                const ripple = new THREE.Mesh(new THREE.RingGeometry(.42 + index * .28, .52 + index * .28, 48), material);
                ripple.position.set(x, y, 1.5 - index * .25);
                scene.add(ripple);
                ripples.push({ mesh: ripple, life: 1 - index * .12 });
            });
            fieldPulse = Math.min(2.2, fieldPulse + 1.15);
        }

        function pointerToWorld(clientX, clientY) {
            const distance = camera.position.z;
            const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
            const worldWidth = worldHeight * camera.aspect;
            return {
                x: (clientX / Math.max(1, window.innerWidth) - .5) * worldWidth,
                y: -(clientY / Math.max(1, window.innerHeight) - .5) * worldHeight,
            };
        }

        function spawnHoverTrail(event) {
            if (!trailCapacity) return;
            const current = pointerToWorld(event.clientX, event.clientY);
            const previous = lastTrailWorld || current;
            const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
            lastTrailWorld = current;
            if (distance < .35) return;
            const count = Math.min(5, Math.max(1, Math.round(distance / 3.4)));
            for (let step = 0; step < count; step += 1) {
                const index = trailCursor;
                trailCursor = (trailCursor + 1) % trailCapacity;
                const particle = trailParticles[index];
                const progress = (step + 1) / count;
                const offset = index * 3;
                trailPositions[offset] = previous.x + (current.x - previous.x) * progress + (Math.random() - .5) * .42;
                trailPositions[offset + 1] = previous.y + (current.y - previous.y) * progress + (Math.random() - .5) * .42;
                trailPositions[offset + 2] = 1.6 + Math.random() * 1.8;
                particle.life = .48 + Math.random() * .24;
                particle.vx = (Math.random() - .5) * .028 - (current.x - previous.x) * .012;
                particle.vy = (Math.random() - .5) * .028 - (current.y - previous.y) * .012;
                particle.vz = (Math.random() - .5) * .018;
                const color = index % 4 === 0 ? new THREE.Color(0xffd691) : new THREE.Color(0x8effe9);
                trailColors[offset] = color.r;
                trailColors[offset + 1] = color.g;
                trailColors[offset + 2] = color.b;
            }
            trailPoints.geometry.attributes.position.needsUpdate = true;
            trailPoints.geometry.attributes.color.needsUpdate = true;
        }

        function animate(time) {
            requestAnimationFrame(animate);
            const delta = Math.min(.05, (time - lastTime) / 1000);
            lastTime = time;
            if (document.hidden || body.classList.contains('knowledge-map-open')) return;
            if (!reducedMotion.matches) {
                constellation.rotation.y += delta * (.018 + energy * .045);
                constellation.rotation.z += delta * .004;
            }
            constellation.rotation.x += (pointerY * .09 - constellation.rotation.x) * .028;
            constellation.rotation.y += (pointerX * .12 - constellation.rotation.y * .12) * .003;
            pointMaterial.size = .22 + energy * .2 + (mode === 'snow' ? .08 : 0);
            pointMaterial.opacity = .72 + energy * .24;
            fieldMaterial.size = .28 + energy * .22;
            fieldMaterial.opacity = .48 + energy * .3;
            linkMaterial.opacity = .13 + energy * .24;
            const fieldArray = fieldGeometry.attributes.position.array;
            const distance = camera.position.z;
            const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
            const worldWidth = worldHeight * camera.aspect;
            const attractX = pointerX * worldWidth * .38;
            const attractY = -pointerY * worldHeight * .38;
            for (let index = 0; index < fieldCount; index += 1) {
                const offset = index * 3;
                const velocity = fieldVelocity[index];
                const phase = fieldPhase[index];
                const x = fieldArray[offset];
                const y = fieldArray[offset + 1];
                const z = fieldArray[offset + 2];
                const dx = attractX - x;
                const dy = attractY - y;
                const radius = Math.max(2, Math.hypot(dx, dy));
                const force = Math.min(1, 16 / radius) * (.018 + energy * .024);
                velocity.x += (dx / radius) * force + (-dy / radius) * .006;
                velocity.y += (dy / radius) * force + (dx / radius) * .006;
                velocity.z += ((Math.sin(time * .001 + phase) * .003) - z * .0008);
                if (fieldPulse > 0) {
                    velocity.x -= (dx / radius) * fieldPulse * .018;
                    velocity.y -= (dy / radius) * fieldPulse * .018;
                }
                velocity.x *= .985;
                velocity.y *= .985;
                velocity.z *= .975;
                fieldArray[offset] = x + velocity.x * (1 + energy * 2.4);
                fieldArray[offset + 1] = y + velocity.y * (1 + energy * 2.4);
                fieldArray[offset + 2] = z + velocity.z;
                if (Math.abs(fieldArray[offset]) > worldWidth * .8) fieldArray[offset] *= -.84;
                if (Math.abs(fieldArray[offset + 1]) > worldHeight * .8) fieldArray[offset + 1] *= -.84;
                if (Math.abs(fieldArray[offset + 2]) > 18) fieldArray[offset + 2] *= -.84;
            }
            fieldGeometry.attributes.position.needsUpdate = true;
            if (trailCapacity) {
                trailParticles.forEach((particle, index) => {
                    const offset = index * 3;
                    if (particle.life <= 0) {
                        trailPositions[offset + 2] = -100;
                        return;
                    }
                    particle.life -= delta;
                    particle.vx *= .965;
                    particle.vy *= .965;
                    particle.vz *= .96;
                    trailPositions[offset] += particle.vx * (1 + energy * 2);
                    trailPositions[offset + 1] += particle.vy * (1 + energy * 2);
                    trailPositions[offset + 2] += particle.vz;
                    const glow = Math.max(0, particle.life * 2);
                    trailColors[offset] = glow;
                    trailColors[offset + 1] = Math.min(1, glow * .98);
                    trailColors[offset + 2] = Math.min(1, glow * .88);
                });
                trailMaterial.opacity = .62 + energy * .28;
                trailPoints.geometry.attributes.position.needsUpdate = true;
                trailPoints.geometry.attributes.color.needsUpdate = true;
            }
            fieldPulse = Math.max(0, fieldPulse - delta * 1.8);
            if (!reducedMotion.matches) {
                rings.forEach((ring, index) => { ring.rotation.z += delta * (.012 + index * .007); });
                reactor.rotation.y += delta * (.08 + energy * .15);
                reactor.rotation.x += delta * .018;
                reactorShell.rotation.x -= delta * .12;
                reactorShell.rotation.z += delta * .09;
                reactorCore.scale.setScalar(1 + Math.sin(time * .0024) * (.06 + energy * .11));
                reactorGlow.material.opacity = .035 + energy * .11 + Math.sin(time * .0018) * .012;
                reactorRings.forEach((ring, index) => { ring.rotation.z += delta * (index ? -.08 : .12); });
                reactorStreams.forEach((stream, index) => { stream.rotation.z += delta * (index % 2 ? -.035 : .045); stream.material.opacity = .25 + energy * .3; });
            }
            if (meteor.visible) {
                meteor.position.x += delta * (7 + energy * 5);
                meteor.position.y += delta * 2.1;
                if (meteor.position.x > 34) meteor.position.set(-34, -12 + Math.random() * 25, -4 + Math.random() * 8);
            }
            for (let index = ripples.length - 1; index >= 0; index -= 1) {
                const ripple = ripples[index];
                ripple.life -= delta * 1.45;
                ripple.mesh.scale.multiplyScalar(1 + delta * 2.8);
                ripple.mesh.material.opacity = Math.max(0, ripple.life * .5);
                if (ripple.life <= 0) {
                    scene.remove(ripple.mesh);
                    ripple.mesh.geometry.dispose();
                    ripple.mesh.material.dispose();
                    ripples.splice(index, 1);
                }
            }
            renderer.render(scene, camera);
        }

        window.addEventListener('resize', resize, { passive: true });
        window.addEventListener('pointermove', event => {
            pointerX = (event.clientX / Math.max(1, window.innerWidth) - .5) * 2;
            pointerY = (event.clientY / Math.max(1, window.innerHeight) - .5) * 2;
            spawnHoverTrail(event);
        }, { passive: true });
        window.addEventListener('pointerdown', spawnRipple, { passive: true });
        resize();
        setPalette(weatherMode);
        animate(performance.now());
        ambient3d = {
            setEnergy(value) { energy = value; },
            setWeather(value) { setPalette(value); },
        };
    }

    function initParticles() {
        const canvas = document.createElement('canvas');
        canvas.id = 'home-particles';
        canvas.setAttribute('aria-hidden', 'true');
        body.insertAdjacentElement('afterbegin', canvas);
        const context = canvas.getContext('2d');
        const pointer = { x: -1000, y: -1000 };
        let particles = [];
        let ripples = [];
        let hoverTrail = [];
        let lastPointer = null;
        let comet = null;
        let frame = 0;

        function resizeParticles() {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * ratio;
            canvas.height = window.innerHeight * ratio;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            const target = Math.round(window.innerWidth * window.innerHeight / 25000);
            const count = Math.min(84, Math.max(45, reducedMotion.matches ? target * .55 : target));
            particles = Array.from({ length: Math.round(count) }, (_, index) => ({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: ((index * 19) % 13 - 6) * .018,
                vy: ((index * 23) % 11 - 5) * .016,
                radius: 1.45 + (index % 4) * .44,
            }));
        }

        function drawParticles() {
            context.clearRect(0, 0, window.innerWidth, window.innerHeight);
            context.globalCompositeOperation = 'lighter';
            frame += 1;
            const energyBoost = 1 + audioEnergy * 1.8;
            const connectionRange = 118 + audioEnergy * 34;
            if (!reducedMotion.matches && (!comet || comet.life <= 0) && frame % Math.max(120, Math.round(230 - audioEnergy * 95)) === 0) {
                comet = { x: -80, y: 70 + Math.random() * window.innerHeight * .42, vx: 7.2, vy: 2.1, life: 120 };
            }
            if (comet?.life > 0) {
                const gradient = context.createLinearGradient(comet.x - 130, comet.y - 38, comet.x, comet.y);
                gradient.addColorStop(0, 'rgba(99,230,190,0)');
                gradient.addColorStop(1, 'rgba(220,255,248,.88)');
                context.strokeStyle = gradient;
                context.lineWidth = 1.6;
                context.beginPath();
                context.moveTo(comet.x - 130, comet.y - 38);
                context.lineTo(comet.x, comet.y);
                context.stroke();
                comet.x += comet.vx;
                comet.y += comet.vy;
                comet.life -= 1;
            }
            particles.forEach((particle, index) => {
                const dx = particle.x - pointer.x;
                const dy = particle.y - pointer.y;
                const distance = Math.hypot(dx, dy);
                if (!reducedMotion.matches && distance < 125 && distance > 0) {
                    particle.x += dx / distance * .34;
                    particle.y += dy / distance * .34;
                }
                particle.x = (particle.x + particle.vx * energyBoost + window.innerWidth) % window.innerWidth;
                particle.y = (particle.y + particle.vy * energyBoost + window.innerHeight) % window.innerHeight;
                const rainy = weatherMode === 'rain' || weatherMode === 'storm';
                const primary = rainy ? '132,206,255' : '144,255,236';
                const accent = weatherMode === 'snow' ? '225,238,255' : '255,214,145';
                context.fillStyle = index % 5 === 0 ? `rgba(${accent},.96)` : `rgba(${primary},.94)`;
                context.shadowBlur = 12 + audioEnergy * 14;
                context.shadowColor = index % 5 === 0 ? `rgba(${accent},.62)` : `rgba(${primary},.68)`;
                context.beginPath();
                context.arc(particle.x, particle.y, particle.radius + audioEnergy * 1.15, 0, Math.PI * 2);
                context.fill();
                for (let next = index + 1; next < particles.length; next += 1) {
                    const sibling = particles[next];
                    const lineDistance = Math.hypot(particle.x - sibling.x, particle.y - sibling.y);
                    if (lineDistance < connectionRange) {
                        context.shadowBlur = 0;
                        context.strokeStyle = `rgba(${primary},${(1 - lineDistance / connectionRange) * (.38 + audioEnergy * .3)})`;
                        context.lineWidth = 1;
                        context.beginPath();
                        context.moveTo(particle.x, particle.y);
                        context.lineTo(sibling.x, sibling.y);
                        context.stroke();
                    }
                }
            });
            ripples = ripples.filter(ripple => ripple.alpha > .01);
            ripples.forEach(ripple => {
                ripple.radius += 2.5;
                ripple.alpha *= .94;
                context.shadowBlur = 10;
                context.shadowColor = 'rgba(99,230,190,.7)';
                context.strokeStyle = `rgba(145,255,236,${ripple.alpha})`;
                context.lineWidth = 1.4;
                context.beginPath();
                context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
                context.stroke();
            });
            hoverTrail = hoverTrail.filter(spark => spark.life > .01);
            hoverTrail.forEach(spark => {
                spark.life -= .028;
                spark.x += spark.vx;
                spark.y += spark.vy;
                spark.vx *= .96;
                spark.vy *= .96;
                context.fillStyle = `rgba(255,214,145,${spark.life * .72})`;
                context.shadowBlur = 14;
                context.shadowColor = 'rgba(142,255,233,.72)';
                context.beginPath();
                context.arc(spark.x, spark.y, 1.1 + spark.life * 1.8, 0, Math.PI * 2);
                context.fill();
            });
            context.globalCompositeOperation = 'source-over';
            requestAnimationFrame(drawParticles);
        }

        window.addEventListener('resize', resizeParticles, { passive: true });
        window.addEventListener('pointermove', event => {
            if (precisePointer.matches && lastPointer) {
                const distance = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
                const count = Math.min(4, Math.max(1, Math.round(distance / 18)));
                for (let index = 0; index < count; index += 1) {
                    const progress = (index + 1) / count;
                    hoverTrail.push({
                        x: lastPointer.x + (event.clientX - lastPointer.x) * progress,
                        y: lastPointer.y + (event.clientY - lastPointer.y) * progress,
                        vx: (Math.random() - .5) * 1.4,
                        vy: (Math.random() - .5) * 1.4,
                        life: .68 + Math.random() * .18,
                    });
                }
                if (hoverTrail.length > 100) hoverTrail.splice(0, hoverTrail.length - 100);
            }
            lastPointer = { x: event.clientX, y: event.clientY };
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        }, { passive: true });
        window.addEventListener('pointerdown', event => {
            ripples.push({ x: event.clientX, y: event.clientY, radius: 8, alpha: .72 });
        }, { passive: true });
        resizeParticles();
        drawParticles();
    }

    function initPixelField() {
        const canvas = document.createElement('canvas');
        canvas.id = 'home-particles';
        canvas.dataset.renderer = 'constellation-field';
        canvas.setAttribute('aria-hidden', 'true');
        body.insertAdjacentElement('afterbegin', canvas);
        const context = canvas.getContext('2d', { alpha: true });
        const pointer = { x: -1000, y: -1000 };
        const ripples = [];
        const sparks = [];
        let points = [];
        let orbitals = [];
        let width = 0;
        let height = 0;
        let lastFrame = 0;

        function resize() {
            width = innerWidth;
            height = innerHeight;
            const ratio = Math.min(devicePixelRatio || 1, 1.15);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            const target = Math.round(width * height / 18500);
            const count = reducedMotion.matches
                ? Math.min(58, Math.max(38, Math.round(target * .7)))
                : Math.min(108, Math.max(54, target));
            points = Array.from({ length: count }, (_, index) => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: ((index * 17) % 11 - 5) * .014,
                vy: ((index * 23) % 13 - 6) * .012,
                r: 1.2 + (index % 4) * .42,
                phase: Math.random() * Math.PI * 2,
                shape: index % 5,
                warm: index % 6 === 0,
            }));
            orbitals = [
                { x: width * .27, y: height * .29, rx: Math.max(52, width * .09), ry: 16, tilt: -.28, angle: .2, speed: .55, color: '118,222,204' },
                { x: width * .75, y: height * .69, rx: Math.max(48, width * .085), ry: 14, tilt: .65, angle: 2.5, speed: -.43, color: '255,202,121' },
            ];
        }

        function drawShape(point, x, y, size, time) {
            const color = point.warm ? '255,202,121' : '142,220,255';
            context.fillStyle = `rgba(${color},${.38 + Math.sin(time * .001 + point.phase) * .12})`;
            if (point.shape === 0) {
                context.fillRect(x - size * .5, y - size * .5, size, size);
            } else if (point.shape === 1 || point.shape === 2) {
                context.beginPath();
                context.moveTo(x, y - size);
                context.lineTo(x + size, y + size);
                context.lineTo(x - size, y + size);
                context.closePath();
                context.fill();
            } else {
                context.beginPath();
                context.moveTo(x, y - size);
                context.lineTo(x + size, y);
                context.lineTo(x, y + size);
                context.lineTo(x - size, y);
                context.closePath();
                context.fill();
            }
        }

        function draw(time) {
            requestAnimationFrame(draw);
            const frameInterval = innerWidth < 720 ? 24 : 16;
            if (document.hidden || body.classList.contains('knowledge-map-open') || time - lastFrame < frameInterval) return;
            lastFrame = time;
            context.clearRect(0, 0, width, height);
            const pointerEnabled = precisePointer.matches;
            points.forEach((point, index) => {
                point.x = (point.x + point.vx + width) % width;
                point.y = (point.y + point.vy + height) % height;
                const waveX = Math.sin(time * .00022 + point.phase) * 7;
                const waveY = Math.cos(time * .00018 + point.phase) * 5;
                let x = point.x + waveX;
                let y = point.y + waveY;
                const dx = x - pointer.x;
                const dy = y - pointer.y;
                const distance = Math.hypot(dx, dy);
                if (pointerEnabled && distance > 0 && distance < 120) {
                    const force = (1 - distance / 120) * 10;
                    x += dx / distance * force;
                    y += dy / distance * force;
                }
                for (let sibling = index + 1; sibling < Math.min(points.length, index + 9); sibling += 1) {
                    const other = points[sibling];
                    const otherX = other.x + Math.sin(time * .00022 + other.phase) * 7;
                    const otherY = other.y + Math.cos(time * .00018 + other.phase) * 5;
                    const lineDistance = Math.hypot(x - otherX, y - otherY);
                    if (lineDistance < 138) {
                        context.strokeStyle = `rgba(87,189,205,${(1 - lineDistance / 138) * .24})`;
                        context.lineWidth = .7;
                        context.beginPath();
                        context.moveTo(x, y);
                        context.lineTo(otherX, otherY);
                        context.stroke();
                    }
                }
                drawShape(point, x, y, point.r, time);
            });
            orbitals.forEach(orbit => {
                orbit.angle += orbit.speed * .024;
                context.save();
                context.translate(orbit.x, orbit.y);
                context.rotate(orbit.tilt);
                context.strokeStyle = `rgba(${orbit.color},.2)`;
                context.lineWidth = .8;
                context.beginPath();
                context.ellipse(0, 0, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
                context.stroke();
                const ex = Math.cos(orbit.angle) * orbit.rx;
                const ey = Math.sin(orbit.angle) * orbit.ry;
                context.fillStyle = `rgba(${orbit.color},.78)`;
                context.fillRect(ex - 2, ey - 2, 4, 4);
                context.restore();
            });
            ripples.forEach(ripple => {
                ripple.radius += 3;
                ripple.alpha *= .9;
                context.strokeStyle = `rgba(171,235,255,${ripple.alpha})`;
                context.strokeRect(ripple.x - ripple.radius, ripple.y - ripple.radius, ripple.radius * 2, ripple.radius * 2);
            });
            while (ripples.length && ripples[0].alpha < .02) ripples.shift();
            sparks.forEach(spark => {
                spark.life -= .05;
                spark.x += spark.vx;
                spark.y += spark.vy;
                context.fillStyle = `rgba(255,202,121,${spark.life})`;
                context.fillRect(spark.x, spark.y, 2, 2);
            });
            while (sparks.length && sparks[0].life <= 0) sparks.shift();
        }

        addEventListener('resize', resize, { passive: true });
        reducedMotion.addEventListener?.('change', resize);
        addEventListener('pointermove', event => {
            if (precisePointer.matches && pointer.x > -500) {
                const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
                const count = Math.min(2, Math.max(1, Math.round(distance / 38)));
                for (let index = 0; index < count; index += 1) {
                    sparks.push({ x: event.clientX, y: event.clientY, vx: (Math.random() - .5) * 1.2, vy: (Math.random() - .5) * 1.2, life: .65 });
                }
                if (sparks.length > 50) sparks.splice(0, sparks.length - 50);
            }
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        }, { passive: true });
        addEventListener('pointerdown', event => {
            ripples.push({ x: event.clientX, y: event.clientY, radius: 8, alpha: .62 });
            if (ripples.length > 4) ripples.shift();
        }, { passive: true });
        resize();
        draw(performance.now());
    }

    try {
        initPixelField();
    } catch (error) {
        console.warn('Three.js 环境层不可用，切换到兼容模式', error);
        initParticles();
    }

    function updateTimePhase() {
        const hour = new Date().getHours();
        body.dataset.timePhase = hour >= 6 && hour < 18 ? 'day' : hour < 22 ? 'dusk' : 'night';
    }

    window.addEventListener('home:audio-energy', event => {
        audioEnergy = Math.max(0, Math.min(1, Number(event.detail?.energy) || 0));
        root.style.setProperty('--ambient-energy', audioEnergy.toFixed(3));
        ambient3d?.setEnergy(audioEnergy);
    });
    window.addEventListener('home:weather-changed', event => {
        const code = Number(event.detail?.code);
        weatherMode = code >= 95 ? 'storm' : code >= 71 && code <= 86 ? 'snow' : code >= 51 && code <= 82 ? 'rain' : code >= 45 ? 'fog' : 'clear';
        body.dataset.ambient = weatherMode;
        ambient3d?.setWeather(weatherMode);
    });
    updateTimePhase();
    setInterval(updateTimePhase, 60000);

    function paintScene() {
        currentX += (targetX - currentX) * 0.12;
        currentY += (targetY - currentY) * 0.12;
        root.style.setProperty('--scene-bg-x', `${(-currentX * 9).toFixed(2)}px`);
        root.style.setProperty('--scene-bg-y', `${(-currentY * 7).toFixed(2)}px`);
        root.style.setProperty('--scene-fg-x', `${(currentX * 2.5).toFixed(2)}px`);
        root.style.setProperty('--scene-fg-y', `${(currentY * 2).toFixed(2)}px`);
        if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
            sceneFrame = requestAnimationFrame(paintScene);
        } else {
            sceneFrame = 0;
        }
    }

    function scheduleScene() {
        if (!sceneFrame) sceneFrame = requestAnimationFrame(paintScene);
    }

    function resetScene() {
        targetX = 0;
        targetY = 0;
        scheduleScene();
    }

    if (precisePointer.matches) {
        window.addEventListener('pointermove', event => {
            targetX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
            targetY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
            scheduleScene();
        }, { passive: true });
        document.documentElement.addEventListener('pointerleave', resetScene);

        document.querySelectorAll('.message, .hitokoto, .time, .link-card').forEach(card => {
            card.classList.add('motion-tilt');
            card.addEventListener('pointermove', event => {
                const bounds = card.getBoundingClientRect();
                const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5;
                const y = (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5;
                card.style.setProperty('--tilt-x', `${(-y * 4).toFixed(2)}deg`);
                card.style.setProperty('--tilt-y', `${(x * 4).toFixed(2)}deg`);
                card.style.setProperty('--card-pointer-x', `${((x + 0.5) * 100).toFixed(1)}%`);
                card.style.setProperty('--card-pointer-y', `${((y + 0.5) * 100).toFixed(1)}%`);
            }, { passive: true });
            card.addEventListener('pointerleave', () => {
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
                card.style.setProperty('--card-pointer-x', '50%');
                card.style.setProperty('--card-pointer-y', '50%');
            });
        });
    }

    document.querySelectorAll('.page-tools button, .social .link, .panel-close').forEach(control => {
        control.addEventListener('pointerdown', () => {
            control.classList.remove('motion-pressed');
            requestAnimationFrame(() => control.classList.add('motion-pressed'));
        });
        control.addEventListener('animationend', () => control.classList.remove('motion-pressed'));
    });

    const timeCard = document.getElementById('upWeather');
    const timeDisplay = document.getElementById('time');
    if (timeCard && timeDisplay && !reducedMotion.matches) {
        const timeObserver = new MutationObserver(() => {
            timeCard.classList.remove('motion-tick');
            requestAnimationFrame(() => timeCard.classList.add('motion-tick'));
        });
        timeObserver.observe(timeDisplay, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener('load', () => {
        setTimeout(() => body.classList.add('motion-ready'), reducedMotion.matches ? 0 : 100);
    }, { once: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetScene();
    });
})();
