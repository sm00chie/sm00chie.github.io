function toggleNav() {
    const nav = document.querySelector('.nav');
    nav.classList.toggle('open');
}

document.querySelector('.hamburger').addEventListener('click', function() {
    document.querySelector('.nav').classList.toggle('open');
    this.classList.toggle('open');
});
