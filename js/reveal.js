/* Entrance animations: elements fade and rise as they come into view. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SELECTORS = [
    '.sidebar-nav .nav-link',
    '.about-name', '.about-role', '.about-col',
    '.portfolio-title', '.filters', '.grid .card',
    '.book-intro', '.book-form > *',
    '.academy-headline', '.academy-text', '.program',
    '.news-title', '.featured', '.news-card',
    '.contact-title', '.guest', '.socials li', '.map'
  ];

  function mark() {
    var n = 0;
    SELECTORS.forEach(function (sel) {
      var i = 0;
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        el.style.transitionDelay = Math.min(i * 70, 560) + 'ms';
        i++; n++;
      });
    });
    return n;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

  function observe() {
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) { io.observe(el); });
  }

  mark(); observe();
  // content rendered later by site.js (portfolio cards, news, contact)
  document.addEventListener('site:loaded', function () { requestAnimationFrame(function () { mark(); observe(); }); });
})();
