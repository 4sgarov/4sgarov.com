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

  /* Big headings: letters rise in one after another */
  var HEADINGS = ['.portfolio-title span', '.news-title', '.contact-title', '.about-name', '.academy-headline', '.guest-title'];
  function splitLetters() {
    HEADINGS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.dataset.split || !el.textContent.trim()) return;
        el.dataset.split = '1';
        var text = el.textContent; el.textContent = '';
        var i = 0;
        text.split('').forEach(function (ch) {
          if (ch === '\n') { el.appendChild(document.createElement('br')); return; }
          var s = document.createElement('span');
          s.className = 'ltr';
          s.textContent = ch === ' ' ? '\u00a0' : ch;
          s.style.transitionDelay = (i * 45) + 'ms';
          el.appendChild(s); i++;
        });
        el.classList.add('letters');
      });
    });
  }

  function mark() {
    splitLetters();
    var n = 0;
    SELECTORS.forEach(function (sel) {
      var i = 0;
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        el.style.transitionDelay = Math.min(i * 110, 880) + 'ms';
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
