const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

let particlesArray = [];
let ambientParticlesArray = [];

let mouse = {
    x: null,
    y: null,
    radius: 150
};

// Global Variables for Idle Animation (Multi-Agent Virtual Mice)
let lastInteractionTime = Date.now();
// Create 3 virtual mice with DISTINCT properties (Size & Speed)
let virtualMice = [
    { x: 0, y: 0, targetX: null, targetY: null, isActive: false, radius: 90, speed: 0.03 },   // Medium
    { x: 0, y: 0, targetX: null, targetY: null, isActive: false, radius: 110, speed: 0.02 },  // Large
    { x: 0, y: 0, targetX: null, targetY: null, isActive: false, radius: 70, speed: 0.04 }    // Small
];

// Handle window resize and mouse movement
let resizeTimer = null;
window.addEventListener('resize', function () {
    // Debounce: re-sampling text on every resize event is expensive
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 150);
});

window.addEventListener('mousemove', function (event) {
    mouse.x = event.x;
    mouse.y = event.y;
    mouse.radius = 150;

    // Reset Idle Timer
    lastInteractionTime = Date.now();
    virtualMice.forEach(vm => vm.isActive = false);
});

window.addEventListener('mouseout', function () {
    mouse.x = null;
    mouse.y = null;
});

// Mobile Touch Support
window.addEventListener('touchstart', function (event) {
    mouse.x = event.touches[0].clientX;
    mouse.y = event.touches[0].clientY;
    mouse.radius = 150;
    lastInteractionTime = Date.now();
    virtualMice.forEach(vm => vm.isActive = false);
}, { passive: true });

window.addEventListener('touchmove', function (event) {
    mouse.x = event.touches[0].clientX;
    mouse.y = event.touches[0].clientY;
    lastInteractionTime = Date.now();
}, { passive: true });

window.addEventListener('touchend', function () {
    mouse.x = null;
    mouse.y = null;
});

// Frame-rate independent timing (1.0 == one frame at 60fps)
let viewW = 0;
let viewH = 0;
let lastFrameTime = null;
const MAX_DT = 4; // clamp so tab-switch / long stalls don't cause huge jumps

// Adaptive quality: if the real frame rate is low (e.g. weak GPU / software canvas),
// thin out particles automatically until the animation runs smoothly.
const AMBIENT_LEVELS = 5;
let qualityLevel = 0;
let perfAccum = 0;
let perfFrames = 0;
let perfCooldown = 60; // frames to ignore after start / after each quality drop

// Quality steps (never wipe out the title): dust is reduced first, text particles only lightly
// at the last steps, and survivors are enlarged so the glyphs stay solid.
function applyQualityStep(level) {
    if (level <= 2) {
        ambientParticlesArray.length = Math.floor(ambientParticlesArray.length * 0.5);
    } else {
        particlesArray = particlesArray.filter(() => Math.random() < 0.8);
        for (let i = 0; i < particlesArray.length; i++) particlesArray[i].size *= 1.12;
    }
}

function monitorPerformance(rawMs) {
    if (rawMs > 200) return; // ignore tab-switch stalls
    if (perfCooldown > 0) { perfCooldown--; return; }
    perfAccum += rawMs;
    perfFrames++;
    if (perfFrames >= 45) {
        const avg = perfAccum / perfFrames;
        perfAccum = 0;
        perfFrames = 0;
        if (avg > 25 && qualityLevel < 4) { // below ~40fps
            qualityLevel++;
            applyQualityStep(qualityLevel);
            perfCooldown = 45;
        }
    }
}

// Hero title font:
//  - Helvetica Neue installed (typically Mac/iOS): "Helvetica Neue", Helvetica, "Pretendard", Arial, sans-serif
//  - Not installed (typically Windows/Android): Pretendard first
// We detect "Helvetica Neue" itself because Windows silently maps plain "Helvetica" to Arial,
// which would otherwise stop Pretendard from being used there.
function isFontInstalled(name) {
    const c = document.createElement('canvas').getContext('2d');
    const text = 'mmmmmmmmmmlli WwQ0123456789';
    return ['monospace', 'serif', 'sans-serif'].some(function (base) {
        c.font = `72px ${base}`;
        const baseWidth = c.measureText(text).width;
        c.font = `72px "${name}", ${base}`;
        return c.measureText(text).width !== baseWidth;
    });
}
const HAS_HELVETICA = isFontInstalled('Helvetica Neue');
const HERO_FONT_FACE = HAS_HELVETICA
    ? `"Helvetica Neue", Helvetica, "Pretendard", Arial, sans-serif`
    : `"Pretendard", Arial, sans-serif`;

// Ambient Particle (Background Dust)
class AmbientParticle {
    constructor() {
        const dpr = window.devicePixelRatio || 1;
        this.w = canvas.width / dpr;
        this.h = canvas.height / dpr;

        this.x = Math.random() * this.w;
        this.y = Math.random() * this.h;
        const minSize = 1.0;
        const maxSize = 4.0;
        this.size = minSize + (Math.pow(Math.random(), 15) * (maxSize - minSize));
        const level = Math.floor(Math.random() * AMBIENT_LEVELS);
        this.level = level;
        this.speedX = (Math.random() * 0.5) - 0.25;
        this.speedY = (Math.random() * 0.5) - 0.25;
        this.color = `rgba(255, 255, 255, ${0.1 + level * 0.12})`;
    }
    update(repulsors, dt) {
        this.x += this.speedX * dt;
        this.y += this.speedY * dt;

        if (this.x > viewW) this.x = 0;
        else if (this.x < 0) this.x = viewW;
        if (this.y > viewH) this.y = 0;
        else if (this.y < 0) this.y = viewH;

        // Loop through all active repulsors (Mouse or Virtual Mice)
        for (let i = 0; i < repulsors.length; i++) {
            const r = repulsors[i];
            if (r.x == null) continue;
            const dx = r.x - this.x;
            const dy = r.y - this.y;
            const range = r.radius * 1.5;
            const distSq = dx * dx + dy * dy;
            if (distSq < range * range) {
                const distance = Math.sqrt(distSq);
                const cos = distance > 0 ? dx / distance : 1;
                const sin = distance > 0 ? dy / distance : 0;
                const force = (range - distance) / range;
                this.x -= cos * force * 2 * dt;
                this.y -= sin * force * 2 * dt;
            }
        }
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Text Particle
class Particle {
    constructor(x, y) {
        this.x = Math.random() * (canvas.width / (window.devicePixelRatio || 1));
        this.y = Math.random() * (canvas.height / (window.devicePixelRatio || 1));
        this.targetX = x;
        this.targetY = y;
        const isMobile = window.innerWidth < 768;
        // Low-DPR screens (typical Windows, dpr<2): bigger particles so neighbours overlap and the glyph looks solid
        const lowDpr = !isMobile && (window.devicePixelRatio || 1) < 2;
        const minSize = isMobile ? 0.6 : (lowDpr ? 1.4 : 1.0);
        const maxSize = isMobile ? 1.0 : (lowDpr ? 2.0 : 1.6);
        this.size = Math.random() * (maxSize - minSize) + minSize;
        this.baseAlpha = 1.0;
        this.density = (Math.random() * 10) + 1;
        this.vx = 0;
        this.vy = 0;
        this.friction = 0.92;
        this.ease = 0.05;
        this.distanceToMouse = 1000;

        // Polarity: 1 = Explode (Repel), -1 = Implode (Attract)
        // 70% Explode, 30% Implode for chaotic mix
        this.polarity = Math.random() < 0.3 ? -1 : 1;
    }
    // dt: frame multiplier (1 = 60fps frame), frictionDt: friction ^ dt (precomputed once per frame)
    update(repulsors, dt, frictionDt) {
        for (let i = 0; i < repulsors.length; i++) {
            const r = repulsors[i];
            if (r.x == null) continue;
            const dx = r.x - this.x;
            const dy = r.y - this.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < r.radius * r.radius) {
                const distance = Math.sqrt(distSq);

                // Standard EXPLOSION (Center -> Out)
                // Force is stronger at CENTER (distance close to 0)
                const force = (r.radius - distance) / r.radius;

                // dx/dy point TO the mouse; SUBTRACT velocity to move AWAY (explode)
                const cos = distance > 0 ? dx / distance : 1;
                const sin = distance > 0 ? dy / distance : 0;

                // High multiplier for strong shatter
                const impulse = force * this.density * 20 * dt;
                this.vx -= cos * impulse;
                this.vy -= sin * impulse;
            }
        }

        const homeDx = this.targetX - this.x;
        const homeDy = this.targetY - this.y;
        this.vx += homeDx * this.ease * 0.1 * dt;
        this.vy += homeDy * this.ease * 0.1 * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= frictionDt;
        this.vy *= frictionDt;
    }
}

function init() {
    spriteCache = []; // rebuild sprites in case devicePixelRatio changed (e.g. moved to another monitor)
    particlesArray = [];
    ambientParticlesArray = [];

    const header = document.getElementById('hero-header');
    const dpr = window.devicePixelRatio || 1;
    let clientWidth = window.innerWidth;
    let clientHeight = window.innerHeight;

    if (header) {
        clientWidth = header.clientWidth;
        clientHeight = header.clientHeight > 800 ? header.clientHeight : 800;
    }

    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    ctx.scale(dpr, dpr);
    viewW = clientWidth;
    viewH = clientHeight;

    // Low-DPR screens: render all particles into one pixel buffer (see drawPixelBuffer)
    bufDpr = dpr;
    usePixelBuffer = dpr < 2;
    stampCache = [];
    if (usePixelBuffer) {
        bufW = canvas.width;
        bufH = canvas.height;
        imgData = ctx.createImageData(bufW, bufH);
        buf32 = new Uint32Array(imgData.data.buffer);
    } else {
        imgData = null;
        buf32 = null;
    }

    for (let i = 0; i < 500; i++) {
        ambientParticlesArray.push(new AmbientParticle());
    }

    // Sample text pixels on a SEPARATE offscreen canvas. Calling getImageData on the visible
    // canvas makes Chrome (esp. on Windows) fall back to slow CPU rendering for every frame.
    const off = document.createElement('canvas');
    // Sample at >= 2x resolution so low-DPR screens (typical Windows, dpr=1) get the same
    // fine particle spacing as a retina Mac instead of a coarse 2px grid.
    const sampleScale = Math.max(dpr, 2);
    off.width = Math.floor(clientWidth * sampleScale);
    off.height = Math.floor(clientHeight * sampleScale);
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.scale(sampleScale, sampleScale);

    octx.fillStyle = 'white';
    const isMobile = window.innerWidth < 768;
    let fontSize = 144;
    let align = 'left';
    let startX = 64;
    let startY = 120;
    let lineHeightMultiplier = 0.85;

    if (isMobile) {
        fontSize = window.innerWidth * 0.16;
        if (fontSize > 130) fontSize = 130;
        align = 'left';
        startX = 24;
        startY = 100;
        lineHeightMultiplier = 0.95;
    }

    const lines = ["Creative", "eXperience", "Design", "Director"];
    const fontFace = HERO_FONT_FACE;

    // Shrink the font if the widest line would overflow the header (different fonts have different widths)
    octx.font = `900 ${Math.floor(fontSize)}px ${fontFace}`;
    let widest = 0;
    lines.forEach(line => { widest = Math.max(widest, octx.measureText(line).width); });
    const maxTextWidth = clientWidth - startX - 16;
    if (widest > maxTextWidth) fontSize = fontSize * (maxTextWidth / widest);

    const lineHeight = fontSize * lineHeightMultiplier;
    octx.font = `900 ${Math.floor(fontSize)}px ${fontFace}`;
    octx.textAlign = align;
    octx.textBaseline = 'top';

    lines.forEach((line, index) => {
        octx.fillText(line, startX, startY + (index * lineHeight));
    });

    const textCoordinates = octx.getImageData(0, 0, off.width, off.height);
    // Retina (dpr>=2): unchanged 2 device px (=1 css px at dpr 2).
    // Low DPR: 3 samples at 2x scale = 1.5 css px spacing; particles are enlarged (see Particle) so they overlap.
    const gap = dpr >= 2 ? 2 : 3;
    const texW = textCoordinates.width;
    const texH = textCoordinates.height;
    const texData = textCoordinates.data;

    for (let y = 0; y < texH; y += gap) {
        const iy = Math.floor(y);
        for (let x = 0; x < texW; x += gap) {
            const ix = Math.floor(x);
            if (texData[(iy * 4 * texW) + (ix * 4) + 3] > 128) {
                particlesArray.push(new Particle(x / sampleScale, y / sampleScale));
            }
        }
    }

    // Re-apply the quality reduction already learned (e.g. after a window resize)
    for (let l = 1; l <= qualityLevel; l++) applyQualityStep(l);

    const sourceTitle = document.getElementById('main-title-source');
    if (sourceTitle) {
        sourceTitle.style.opacity = '0';
    }
}

function updateVirtualMice(dt) {
    // Only runs when Idle
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Iterate through all virtual mice
    virtualMice.forEach((vm, index) => {
        if (!vm.isActive) {
            // Activate with Zone Separation
            if (index === 0 && mouse.x !== null) {
                // Agent 1: Inherits User Position (Seamless)
                vm.x = mouse.x;
                vm.y = mouse.y;
            } else if (index === 1) {
                // Agent 2: Large -> Spawns Top Right
                vm.x = width * 0.9;
                vm.y = height * 0.1;
            } else {
                // Agent 3: Tiny -> Spawns Bottom Left
                vm.x = width * 0.1;
                vm.y = height * 0.9;
            }
            vm.isActive = true;
            vm.targetX = null;
        }

        // Pick new random target
        // Text Zone is roughly Top-Left (0,0 to 0.6w, 0.6h)
        // We want to avoid it 80% of the time, picking "Safe Zones" instead.
        if (!vm.targetX || Math.random() < 1 - Math.pow(0.99, dt)) {
            const avoidText = Math.random() > 0.2; // 80% chance to avoid text

            if (avoidText) {
                // Pick a Safe Zone: Right Vertical Strip OR Bottom Horizontal Strip
                if (Math.random() > 0.5) {
                    // Right Strip (0.6w to 1.0w)
                    vm.targetX = width * 0.6 + Math.random() * width * 0.4;
                    vm.targetY = Math.random() * height;
                } else {
                    // Bottom Strip (0.6h to 1.0h)
                    vm.targetX = Math.random() * width;
                    vm.targetY = height * 0.6 + Math.random() * height * 0.4;
                }
            } else {
                // Danger Zone (Hit the text!)
                vm.targetX = Math.random() * width * 0.6;
                vm.targetY = Math.random() * height * 0.6;
            }
        }

        // Move
        const follow = 1 - Math.pow(1 - vm.speed, dt);
        vm.x += (vm.targetX - vm.x) * follow;
        vm.y += (vm.targetY - vm.y) * follow;

        // vm.radius is already set in object
    });

    return virtualMice;
}

// Round particles: one pre-rendered, anti-aliased circle per size bucket (0.25px steps), drawn 1:1.
// Scaling a single big sprite down to ~3px smears it into a square-ish blob, so each size gets a
// sprite rendered at its exact device-pixel size. drawImage of small images is batched => fast.
let spriteCache = [];
function getSprite(size) {
    const key = Math.max(1, Math.round(size * 4));
    let sp = spriteCache[key];
    if (!sp) {
        const d = window.devicePixelRatio || 1;
        const r = key / 4;
        const px = Math.ceil(r * 2 * d) + 2; // +2px padding for the anti-aliased edge
        const c = document.createElement('canvas');
        c.width = px;
        c.height = px;
        const sc = c.getContext('2d');
        sc.fillStyle = '#fff';
        sc.beginPath();
        sc.arc(px / 2, px / 2, r * d, 0, Math.PI * 2);
        sc.fill();
        sp = spriteCache[key] = { img: c, size: px / d }; // size in CSS px (== px device px on screen)
    }
    return sp;
}

// ---- Pixel-buffer renderer (low-DPR screens) ----
// Tens of thousands of per-particle draw calls are the bottleneck on Windows Chrome. Instead, every
// particle is stamped (as an anti-aliased round mask) into one RGBA buffer that is pushed to the
// canvas with a single putImageData per frame. Round look, constant number of draw calls.
let usePixelBuffer = false;
let imgData = null;
let buf32 = null;
let bufW = 0;
let bufH = 0;
let bufDpr = 1;
let stampCache = [];

function getStamp(size) {
    const key = Math.max(1, Math.round(size * 4)); // 0.25px size buckets
    let st = stampCache[key];
    if (!st) {
        const r = (key / 4) * bufDpr; // radius in device px
        const px = Math.ceil(r * 2) + 2;
        const mask = new Uint8Array(px * px);
        const c = px / 2;
        for (let j = 0; j < px; j++) {
            for (let i = 0; i < px; i++) {
                const dx = i + 0.5 - c;
                const dy = j + 0.5 - c;
                let cov = r + 0.5 - Math.sqrt(dx * dx + dy * dy); // 1px anti-aliased edge
                cov = cov < 0 ? 0 : (cov > 1 ? 1 : cov);
                mask[j * px + i] = Math.round(cov * 255);
            }
        }
        st = stampCache[key] = { px: px, mask: mask };
    }
    return st;
}

function stampParticle(x, y, st, alphaScale) {
    const px = st.px;
    const left = Math.round(x * bufDpr - px / 2);
    const top = Math.round(y * bufDpr - px / 2);
    const i0 = left < 0 ? -left : 0;
    const i1 = left + px > bufW ? bufW - left : px;
    const j0 = top < 0 ? -top : 0;
    const j1 = top + px > bufH ? bufH - top : px;
    if (i0 >= i1 || j0 >= j1) return;
    const mask = st.mask;
    for (let j = j0; j < j1; j++) {
        let k = (top + j) * bufW + left + i0;
        let m = j * px + i0;
        for (let i = i0; i < i1; i++, k++, m++) {
            const a = alphaScale === 1 ? mask[m] : (mask[m] * alphaScale) | 0;
            if (a > (buf32[k] >>> 24)) buf32[k] = (a << 24) | 0xFFFFFF; // white, alpha = a (union of overlapping dots)
        }
    }
}

function drawPixelBuffer() {
    buf32.fill(0);
    for (let i = 0; i < ambientParticlesArray.length; i++) {
        const p = ambientParticlesArray[i];
        stampParticle(p.x, p.y, getStamp(p.size), 0.1 + p.level * 0.12);
    }
    for (let i = 0; i < particlesArray.length; i++) {
        const p = particlesArray[i];
        stampParticle(p.x, p.y, getStamp(p.size), 1);
    }
    ctx.putImageData(imgData, 0, 0);
}

// Arc renderer (high-DPR screens such as retina Mac): the original round-dot drawing, minus the
// per-particle color-string allocation. drawImage per particle was slower here because retina
// screens carry several times more particles.
function drawSprites() {
    ctx.fillStyle = '#fff';
    for (let k = 0; k < AMBIENT_LEVELS; k++) {
        ctx.globalAlpha = 0.1 + k * 0.12;
        for (let i = 0; i < ambientParticlesArray.length; i++) {
            const p = ambientParticlesArray[i];
            if (p.level !== k) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < particlesArray.length; i++) {
        const p = particlesArray[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function animate(timestamp) {
    // Delta time normalised to 60fps (1.0 = 16.67ms). Keeps motion speed the same on slow/fast machines.
    if (timestamp === undefined) timestamp = performance.now();
    const rawMs = lastFrameTime === null ? 16.7 : (timestamp - lastFrameTime);
    let dt = lastFrameTime === null ? 1 : rawMs / (1000 / 60);
    lastFrameTime = timestamp;
    monitorPerformance(rawMs);
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt < 0.1) dt = 0.1;

    ctx.clearRect(0, 0, viewW, viewH);

    // Determine Logic State
    // Idle if NO interaction for 1.5s (REGARDLESS of mouse position)
    // This enables "Stationary Idle"
    const isIdle = (Date.now() - lastInteractionTime > 1500);

    let activeRepulsors = [];

    if (isIdle) {
        // Use Virtual Mice
        activeRepulsors = updateVirtualMice(dt);
    } else {
        // Use Real Mouse
        for (let i = 0; i < virtualMice.length; i++) virtualMice[i].isActive = false; // Reset virtuals
        if (mouse.x != null) {
            activeRepulsors = [mouse];
        }
    }

    // Update all particles, then render with the renderer suited to this screen
    for (let i = 0; i < ambientParticlesArray.length; i++) {
        ambientParticlesArray[i].update(activeRepulsors, dt);
    }
    const frictionDt = Math.pow(0.92, dt);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update(activeRepulsors, dt, frictionDt);
    }

    if (usePixelBuffer) drawPixelBuffer();
    else drawSprites();

    requestAnimationFrame(animate);
}

window.onload = function () {
    // Wait for Pretendard when it will be used so text is sampled with the right glyphs; never block more than 2.5s.
    const fontLoad = HAS_HELVETICA
        ? Promise.resolve()
        : document.fonts.load('900 144px "Pretendard"').catch(function () { });
    const timeout = new Promise(function (resolve) { setTimeout(resolve, 2500); });
    Promise.race([fontLoad, timeout])
        .then(function () { return document.fonts.ready; })
        .then(function () {
            init();
            animate();
        });
}
