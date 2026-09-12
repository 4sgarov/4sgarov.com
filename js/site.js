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

  // Plain text → paragraphs; lines starting with "•" or "-" become a bulleted list.
  function richText(el, value) {
    el.innerHTML = '';
    var list = null;
    String(value).split('\n').forEach(function (line) {
      var t = line.trim();
      if (!t) { list = null; return; }
      var m = /^[•\-–*]\s*(.+)$/.exec(t);
      if (m) {
        if (!list) { list = document.createElement('ul'); el.appendChild(list); }
        var li = document.createElement('li'); li.textContent = m[1]; list.appendChild(li);
      } else {
        list = null;
        var pEl = document.createElement('p'); pEl.textContent = t; el.appendChild(pEl);
      }
    });
  }

  function text(sel, value) {
    var el = document.querySelector(sel);
    if (el && value !== undefined) el.textContent = value;
  }

  function flag(code) {
    return String.fromCodePoint.apply(null, String(code).toUpperCase().split('').map(function (c) { return 0x1F1E6 + c.charCodeAt(0) - 65; }));
  }
  function fmtDay(d) {
    var p = d.split('-');
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  var ICONS = {
    instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2L4 20z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" fill="currentColor" stroke="none"/></svg>',
    telegram: '<svg viewBox="0 0 24 24"><path d="M21 4L3 11l6 2 2 6 3-4 5 3z"/><path d="M9 13l10-8"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c0 2.5 2 4.5 4.5 4.5"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
    email: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };
  function iconFor(s) {
    var k = (s.label + ' ' + s.url).toLowerCase();
    if (/instagram/.test(k)) return ICONS.instagram;
    if (/whatsapp|wa\.me/.test(k)) return ICONS.whatsapp;
    if (/telegram|t\.me/.test(k)) return ICONS.telegram;
    if (/tiktok/.test(k)) return ICONS.tiktok;
    if (/facebook|fb\.com/.test(k)) return ICONS.facebook;
    if (/youtube|youtu\.be/.test(k)) return ICONS.youtube;
    if (/mailto:|e-?mail/.test(k)) return ICONS.email;
    if (/tel:|phone/.test(k)) return ICONS.phone;
    return ICONS.link;
  }
  function renderContact(c, booking) {
    var guest = document.getElementById('guest');
    if (!guest) return;
    var list = guest.querySelector('.guest-list');
    list.innerHTML = '';
    var trips = ((booking && booking.locations) || []).filter(function (l) { return l.from; });
    trips.forEach(function (l) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="g-flag"></span><span class="g-place"></span><span class="g-dates"></span>';
      li.querySelector('.g-flag').textContent = flag(l.code);
      li.querySelector('.g-place').textContent = l.country + ' — ' + l.city;
      li.querySelector('.g-dates').textContent = fmtDay(l.from) + (l.to ? ' – ' + fmtDay(l.to) : '');
      list.appendChild(li);
    });
    guest.hidden = !c.guestSpotEnabled || !trips.length;

    var socials = document.querySelector('.socials');
    socials.innerHTML = '';
    (c.socials || []).forEach(function (s) {
      if (!s.url) return;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<span class="s-icon">' + iconFor(s) + '</span><span class="s-label"></span><span class="s-handle"></span>';
      a.querySelector('.s-label').textContent = s.label || s.url;
      a.querySelector('.s-handle').textContent = s.handle || '';
      li.appendChild(a); socials.appendChild(li);
    });

    var map = document.getElementById('map');
    map.innerHTML = '';
    var src = c.mapEmbed || (c.mapQuery ? 'https://www.google.com/maps?q=' + encodeURIComponent(c.mapQuery) + '&output=embed' : '');
    if (src) {
      var f = document.createElement('iframe');
      f.src = src; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.allowFullscreen = true;
      f.title = 'Map';
      map.appendChild(f);
    } else map.hidden = true;
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
        var progs = document.querySelectorAll('.program');
        (S.academy.programs || []).forEach(function (p, i) {
          if (!progs[i]) return;
          progs[i].querySelector('.program-title').textContent = p.title || '';
          var body = progs[i].querySelector('.program-text');
          richText(body, p.text || '');
          if (p.image) {
            var logo = document.createElement('img');
            logo.className = 'program-logo'; logo.src = p.image; logo.alt = '';
            var firstList = body.querySelector('ul');
            if (firstList) body.insertBefore(logo, firstList); else body.appendChild(logo);
          }
          progs[i].querySelector('.program-btn').href = p.link || 'book.html';
          var price = progs[i].querySelector('.program-price');
          var pv = String(p.price || '').trim();
          var isFree = /^free$/i.test(pv);
          // a bare number gets a dollar sign; anything else is shown as typed
          price.textContent = isFree ? 'Free' : (/^\d+([.,]\d+)?$/.test(pv) ? pv + ' $' : pv);
          price.hidden = !pv;
          price.classList.toggle('is-free', isFree);
        });
      }
      if (S.contact) renderContact(S.contact, S.booking);
      if (S.portfolio) renderPortfolio(S.portfolio);
      document.dispatchEvent(new CustomEvent('site:loaded', { detail: S }));
    })
    .catch(function (e) { console.error('site.json failed', e); });
})();
