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
window.addEventListener('resize', function () {
    init();
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
        const alpha = Math.random() * 0.5 + 0.1;
        this.speedX = (Math.random() * 0.5) - 0.25;
        this.speedY = (Math.random() * 0.5) - 0.25;
        this.color = `rgba(255, 255, 255, ${alpha})`;
    }
    update(repulsors) {
        this.x += this.speedX;
        this.y += this.speedY;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        if (this.x > width) this.x = 0;
        else if (this.x < 0) this.x = width;
        if (this.y > height) this.y = 0;
        else if (this.y < 0) this.y = height;

        // Loop through all active repulsors (Mouse or Virtual Mice)
        repulsors.forEach(r => {
            if (r.x != null) {
                let dx = r.x - this.x;
                let dy = r.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < r.radius * 1.5) {
                    const angle = Math.atan2(dy, dx);
                    const force = (r.radius * 1.5 - distance) / (r.radius * 1.5);
                    const pushX = Math.cos(angle) * force * 2;
                    const pushY = Math.sin(angle) * force * 2;
                    this.x -= pushX;
                    this.y -= pushY;
                }
            }
        });
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
        const minSize = isMobile ? 0.6 : 1.0;
        const maxSize = isMobile ? 1.0 : 1.6;
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
    draw(repulsors) {
        let alpha = this.baseAlpha;

        let close = false;
        repulsors.forEach(r => {
            if (r.x != null) {
                let dx = r.x - this.x;
                let dy = r.y - this.y;
                if (Math.sqrt(dx * dx + dy * dy) < r.radius) close = true;
            }
        });

        if (close) alpha = 1.0;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }
    update(repulsors) {
        repulsors.forEach(r => {
            if (r.x != null) {
                let dx = r.x - this.x;
                let dy = r.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < r.radius) {
                    const angle = Math.atan2(dy, dx);

                    // REVERTED to Standard EXPLOSION (Center -> Out)
                    // Force is stronger at CENTER (distance close to 0)
                    const force = (r.radius - distance) / r.radius;

                    // Direction:
                    // dx = r.x - this.x (Vector pointing TO mouse)
                    // To move AWAY from mouse (Explode), we SUBTRACT velocity.

                    const directionX = Math.cos(angle) * force * this.density;
                    const directionY = Math.sin(angle) * force * this.density;

                    // High multiplier for strong shatter
                    this.vx -= directionX * 20;
                    this.vy -= directionY * 20;
                }
            }
        });

        let homeDx = this.targetX - this.x;
        let homeDy = this.targetY - this.y;
        this.vx += homeDx * this.ease * 0.1;
        this.vy += homeDy * this.ease * 0.1;

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.friction;
        this.vy *= this.friction;
    }
}

function init() {
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

    for (let i = 0; i < 500; i++) {
        ambientParticlesArray.push(new AmbientParticle());
    }

    ctx.fillStyle = 'white';
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

    const lineHeight = fontSize * lineHeightMultiplier;
    ctx.font = `900 ${Math.floor(fontSize)}px "Helvetica Neue Black", "Helvetica Neue", "Arial Black", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';

    const lines = ["Creative", "eXperience", "Design", "Director"];

    lines.forEach((line, index) => {
        ctx.fillText(line, startX, startY + (index * lineHeight));
    });

    const textCoordinates = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gap = 2;

    for (let y = 0, y2 = textCoordinates.height; y < y2; y += gap) {
        for (let x = 0, x2 = textCoordinates.width; x < x2; x += gap) {
            if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
                let logicalX = x / dpr;
                let logicalY = y / dpr;
                particlesArray.push(new Particle(logicalX, logicalY));
            }
        }
    }

    const sourceTitle = document.getElementById('main-title-source');
    if (sourceTitle) {
        sourceTitle.style.opacity = '0';
    }
}

function updateVirtualMice() {
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
        if (!vm.targetX || Math.random() < 0.01) {
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
        let dx = vm.targetX - vm.x;
        let dy = vm.targetY - vm.y;
        vm.x += dx * vm.speed;
        vm.y += dy * vm.speed;

        // vm.radius is already set in object
    });

    return virtualMice;
}

function animate() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    // Determine Logic State
    // Idle if NO interaction for 1.5s (REGARDLESS of mouse position)
    // This enables "Stationary Idle"
    const isIdle = (Date.now() - lastInteractionTime > 1500);

    let activeRepulsors = [];

    if (isIdle) {
        // Use Virtual Mice
        activeRepulsors = updateVirtualMice();
    } else {
        // Use Real Mouse
        virtualMice.forEach(vm => vm.isActive = false); // Reset virtuals
        if (mouse.x != null) {
            activeRepulsors = [mouse];
        }
    }

    for (let i = 0; i < ambientParticlesArray.length; i++) {
        ambientParticlesArray[i].draw();
        ambientParticlesArray[i].update(activeRepulsors);
    }

    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].draw(activeRepulsors);
        particlesArray[i].update(activeRepulsors);
    }

    requestAnimationFrame(animate);
}

window.onload = function () {
    document.fonts.ready.then(function () {
        init();
        animate();
    });
}
