document.querySelector('.hamburger').addEventListener('click', function() {
    document.querySelector('.nav').classList.toggle('open');
    this.classList.toggle('open');
});


document.addEventListener('DOMContentLoaded', () => {
    fetch('/nav.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('nav-placeholder').innerHTML = html;
        })
        .catch(error => console.error('Error loading navigation:', error));
});

function toggleNav() {
    const nav = document.querySelector('.nav');
    nav.classList.toggle('open');
}
