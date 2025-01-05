// Fetch and inject navigation bar from nav.html
fetch('/nav.html')
    .then(response => {
        if (!response.ok) throw new Error('Failed to load nav.html');
        return response.text();
    })
    .then(html => {
        // Inject the nav HTML into the placeholder
        const placeholder = document.getElementById('nav-placeholder');
        placeholder.innerHTML = html;

        // Initialize hamburger menu toggle functionality
        const hamburger = document.querySelector('.hamburger-menu');
        if (hamburger) {
            hamburger.addEventListener('click', () => {
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.toggle('open');
            });
        }
    })
    .catch(error => console.error('Error loading navigation:', error));

// Only disable scrolling on the index.html page
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    document.body.style.overflow = 'hidden';
} else {
    document.body.style.overflow = 'auto';
}

// Dynamically adjust navigation bar on window resize
window.addEventListener('resize', () => {
    const nav = document.querySelector('.nav');
    if (nav && window.innerWidth > 768) {
        nav.classList.remove('open'); // Ensure nav is closed on desktop
    }
});

// Handle active link highlighting (optional, but useful for UX)
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.nav a');

    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
});

// Random number generator with seed
function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// Function to generate art
function generateArt() {
    const container = document.querySelector('.art-background');
    if (!container) return;

    container.innerHTML = ''; // Clear previous shapes

    const now = Date.now();
    const seed = now % 10000;

    const colors = [
        'rgba(255, 85, 0, 0.7)',
        'rgba(255, 100, 50, 0.7)',
        'rgba(100, 150, 255, 0.7)',
        'rgba(50, 100, 150, 0.7)',
        'rgba(200, 100, 50, 0.7)'
    ];

    const numShapes = 3 + Math.floor(seededRandom(seed) * 3);

    for (let i = 0; i < numShapes; i++) {
        const shape = document.createElement('div');
        shape.className = 'shape';

        const size = Math.random() * 200 + 100; // Random size between 100px and 300px
        const left = Math.random() * (window.innerWidth - size);
        const top = Math.random() * (window.innerHeight - size);

        shape.style.width = `${size}px`;
        shape.style.height = `${size}px`;
        shape.style.left = `${left}px`;
        shape.style.top = `${top}px`;

        const gradient = `radial-gradient(circle, ${colors[Math.floor(Math.random() * colors.length)]} 0%, rgba(255, 255, 255, 0) 100%)`;
        shape.style.background = gradient;

        container.appendChild(shape);
    }
}

// Function for subtle color changes
document.addEventListener('click', (event) => {
    // Exclude clicks on the navbar
    if (event.target.closest('nav')) return;

    const shapes = document.querySelectorAll('.shape');
    shapes.forEach((shape) => {
        const currentColor = getComputedStyle(shape).backgroundImage;

        // Subtle adjustments to hue and lightness
        const hueAdjustment = Math.random() * 30 - 15; // -15 to +15
        const lightnessAdjustment = Math.random() * 30 - 15; // -15 to +15

        const newColor = currentColor.replace(
            /hsla\((\d+), (\d+)%, (\d+)%, ([\d.]+)\)/,
            (match, hue, saturation, lightness, alpha) => {
                const newHue = Math.max(0, Math.min(360, parseFloat(hue) + hueAdjustment));
                const newLightness = Math.max(20, Math.min(80, parseFloat(lightness) + lightnessAdjustment));
                return `hsla(${newHue}, ${saturation}%, ${newLightness}%, ${alpha})`;
            }
        );

        shape.style.transition = 'background-color 1s ease';
        shape.style.background = newColor;
    });
});


// Function for subtle movement animations
function animateShapes() {
    const shapes = document.querySelectorAll('.shape');
    shapes.forEach((shape, index) => {
        const offsetX = Math.sin(Date.now() / 1000 + index) * 15; // Horizontal oscillation
        const offsetY = Math.cos(Date.now() / 1000 + index) * 15; // Vertical oscillation

        shape.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    requestAnimationFrame(animateShapes);
}

// Generate art initially and on window resize
window.addEventListener('resize', generateArt);
generateArt();

// Start the animation loop
animateShapes();
