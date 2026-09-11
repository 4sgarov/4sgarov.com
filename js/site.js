/* Renders editable content from data/site.json into the pages. */
(function () {
  var MOBILE = '(max-width: 640px)';
  var VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

  function isMobile() { return window.matchMedia(MOBILE).matches; }

  function mediaEl(src) {
    var el;
    if (VIDEO_EXT.test(src)) {
      el = document.createElement('video');
      el.src = src;
      el.autoplay = true; el.muted = true; el.loop = true; el.playsInline = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
    } else {
      el = document.createElement('img');
      el.src = src; el.alt = '';
    }
    return el;
  }

  // Fill a container with the desktop or mobile media, re-evaluated on resize.
  function bindMedia(container, media) {
    if (!container || !media) return;
    function update() {
      var src = isMobile() ? (media.mobile || media.desktop) : (media.desktop || media.mobile);
      src = src || '';
      if (container.dataset.src === src) return;
      container.dataset.src = src;
      container.innerHTML = '';
      if (src) container.appendChild(mediaEl(src));
      document.body.classList.toggle('has-cover', !!src);
    }
    update();
    window.matchMedia(MOBILE).addEventListener('change', update);
  }

  function text(sel, value) {
    var el = document.querySelector(sel);
    if (el && value !== undefined) el.textContent = value;
  }

  function renderPortfolio(p) {
    var filters = document.querySelector('.filters');
    var grid = document.querySelector('.grid');
    if (!filters || !grid) return;

    var catName = {};
    p.categories.forEach(function (c) { catName[c.id] = c.name; });

    filters.innerHTML = '';
    var all = document.createElement('button');
    all.className = 'filter is-active'; all.dataset.filter = 'all'; all.textContent = 'All';
    filters.appendChild(all);
    p.categories.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'filter'; b.dataset.filter = c.id; b.textContent = c.name;
      filters.appendChild(b);
    });

    grid.innerHTML = '';
    p.works.forEach(function (w) {
      var card = document.createElement(w.link ? 'a' : 'div');
      card.className = 'card';
      card.dataset.genre = w.category || '';
      if (w.link) { card.href = w.link; card.target = '_blank'; card.rel = 'noopener'; }
      var img = document.createElement('div');
      img.className = 'card-img';
      if (w.image) {
        var i = document.createElement('img');
        i.src = w.image; i.alt = w.title || ''; i.loading = 'lazy';
        img.appendChild(i);
      }
      var body = document.createElement('div');
      body.className = 'card-body';
      body.innerHTML = '<h3 class="card-title"></h3><p class="card-genre"></p>';
      body.querySelector('.card-title').textContent = w.title || '';
      body.querySelector('.card-genre').textContent = catName[w.category] || '';
      card.appendChild(img); card.appendChild(body);
      grid.appendChild(card);
    });

    var btns = filters.querySelectorAll('.filter');
    var cards = grid.querySelectorAll('.card');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.dataset.filter;
        btns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        cards.forEach(function (c) { c.hidden = f !== 'all' && c.dataset.genre !== f; });
        grid.scrollLeft = 0;
      });
    });
  }

  fetch('data/site.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (r) {
      // Before the admin has published anything, fall back to the defaults.
      if (!r.ok) return fetch('data/site.default.json?v=' + Date.now(), { cache: 'no-store' });
      return r;
    })
    .then(function (r) { return r.json(); })
    .then(function (S) {
      // Sections added after the site was first installed come from the defaults.
      return fetch('data/site.default.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (D) { Object.keys(D).forEach(function (k) { if (S[k] === undefined) S[k] = D[k]; }); return S; })
        .catch(function () { return S; });
    })
    .then(function (S) {
      bindMedia(document.querySelector('.cover'), S.home && S.home.cover);
      if (S.about) {
        bindMedia(document.querySelector('.about-page .hero'), S.about.hero);
        text('.about-name', S.about.name);
        text('.about-role', S.about.role);
        var cols = document.querySelectorAll('.about-col');
        (S.about.columns || []).forEach(function (c, i) {
          if (!cols[i]) return;
          cols[i].querySelector('.about-heading').textContent = c.heading || '';
          cols[i].querySelector('.about-text').textContent = c.text || '';
        });
      }
      if (S.academy) {
        bindMedia(document.querySelector('.academy-hero .hero'), S.academy.hero);
        text('.academy-headline', S.academy.headline);
        text('.academy-text', S.academy.text);
      }
      if (S.portfolio) renderPortfolio(S.portfolio);
      document.dispatchEvent(new CustomEvent('site:loaded', { detail: S }));
    })
    .catch(function (e) { console.error('site.json failed', e); });
})();
