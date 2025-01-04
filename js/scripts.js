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
