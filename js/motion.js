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

    body.classList.add('motion-enabled');

    function initParticles() {
        const canvas = document.createElement('canvas');
        canvas.id = 'home-particles';
        canvas.setAttribute('aria-hidden', 'true');
        body.insertAdjacentElement('afterbegin', canvas);
        const context = canvas.getContext('2d');
        const pointer = { x: -1000, y: -1000 };
        let particles = [];
        let ripples = [];
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
            context.globalCompositeOperation = 'source-over';
            requestAnimationFrame(drawParticles);
        }

        window.addEventListener('resize', resizeParticles, { passive: true });
        window.addEventListener('pointermove', event => {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
        }, { passive: true });
        window.addEventListener('pointerdown', event => {
            ripples.push({ x: event.clientX, y: event.clientY, radius: 8, alpha: .72 });
        }, { passive: true });
        resizeParticles();
        drawParticles();
    }

    initParticles();

    function updateTimePhase() {
        const hour = new Date().getHours();
        body.dataset.timePhase = hour >= 6 && hour < 18 ? 'day' : hour < 22 ? 'dusk' : 'night';
    }

    window.addEventListener('home:audio-energy', event => {
        audioEnergy = Math.max(0, Math.min(1, Number(event.detail?.energy) || 0));
        root.style.setProperty('--ambient-energy', audioEnergy.toFixed(3));
    });
    window.addEventListener('home:weather-changed', event => {
        const code = Number(event.detail?.code);
        weatherMode = code >= 95 ? 'storm' : code >= 71 && code <= 86 ? 'snow' : code >= 51 && code <= 82 ? 'rain' : code >= 45 ? 'fog' : 'clear';
        body.dataset.ambient = weatherMode;
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

    if (!reducedMotion.matches && precisePointer.matches) {
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
            }, { passive: true });
            card.addEventListener('pointerleave', () => {
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
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
