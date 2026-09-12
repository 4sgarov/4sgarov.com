/* Admin panel — talks to api/*.php on the same host. */
(function () {
  'use strict';

  var CFG = {
    api: '../api/',
    uploadDir: 'assets/uploads',
    chunkMB: 4,                 // upload in small parts so hosting limits don't apply
    imageMax: { cover: 2560, work: 1600 }
  };
  var VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    site: null,
    dirty: false,
    busy: 0,
    pendingDeletes: []
  };

  /* ---------- helpers ---------- */
  function toast(msg, isError, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!isError);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, ms || (isError ? 6000 : 3000));
  }
  function setDirty(d) {
    state.dirty = d;
    var s = $('#status');
    s.textContent = d ? 'Unsaved changes' : '';
    s.classList.toggle('is-dirty', d);
    $('#publish').disabled = !d || state.busy > 0;
  }
  function busy(delta) {
    state.busy = Math.max(0, state.busy + delta);
    $('#publish').disabled = !state.dirty || state.busy > 0;
  }
  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function set(obj, path, value) {
    var keys = path.split('.'), o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }
  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ə/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36); }
  function isVideo(src) { return VIDEO_EXT.test(src || ''); }

  /* ---------- API ---------- */
  function api(endpoint, body, opts) {
    opts = opts || {};
    var isForm = body instanceof FormData;
    return fetch(CFG.api + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: isForm ? { 'X-Requested-With': 'XMLHttpRequest' }
                      : { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body))
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = {};
        try { j = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('Server error (' + r.status + ')'); }
        if (r.status === 401 && !opts.noAuthRedirect) { showLogin('Session expired — sign in again'); }
        if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
        return j;
      });
    });
  }
  // Chunked upload — sends the blob in CFG.chunkMB parts, sequentially.
  function uploadBlob(blob, name, onProgress) {
    var size = CFG.chunkMB * 1024 * 1024;
    var total = Math.max(1, Math.ceil(blob.size / size));
    var id = uid();
    var i = 0;
    function next() {
      var fd = new FormData();
      fd.append('uploadId', id);
      fd.append('index', String(i));
      fd.append('total', String(total));
      fd.append('name', name);
      fd.append('chunk', blob.slice(i * size, (i + 1) * size), 'chunk');
      return api('upload.php', fd).then(function (r) {
        i++;
        if (onProgress) onProgress(i / total);
        return i < total ? next() : r.path;
      });
    }
    return next();
  }
  function deleteFile(p) { return api('media.php', { path: p }); }

  /* ---------- media processing ---------- */
  // Downscale large JPEG/PNG/WebP in the browser; leave GIF and video untouched.
  function processImage(file, maxDim) {
    var type = file.type;
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return Promise.resolve({ blob: file, ext: extOf(file.name) });
    return new Promise(function (res) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        if (scale === 1 && file.size < 1.5 * 1024 * 1024) return res({ blob: file, ext: extOf(file.name) });
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var outType = type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob(function (b) {
          res({ blob: b || file, ext: outType === 'image/png' ? 'png' : 'jpg' });
        }, outType, 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res({ blob: file, ext: extOf(file.name) }); };
      img.src = url;
    });
  }
  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : 'bin';
  }
  function uploadMedia(file, prefix, maxDim, onProgress) {
    var isVid = /^video\//.test(file.type) || isVideo(file.name);
    var prep = isVid ? Promise.resolve({ blob: file, ext: extOf(file.name) }) : processImage(file, maxDim);
    return prep.then(function (r) {
      var name = prefix + '-' + Date.now() + '.' + r.ext;
      return uploadBlob(r.blob, name, onProgress);
    });
  }
  function queueDelete(path) {
    if (path && path.indexOf(CFG.uploadDir + '/') === 0 && state.pendingDeletes.indexOf(path) < 0) {
      state.pendingDeletes.push(path);
    }
  }

  /* ---------- auth ---------- */
  var needsSetup = false;
  function authStatus() { return api('auth.php?action=status', undefined, { noAuthRedirect: true }); }

  /* ---------- load / publish ---------- */
  function loadSite() {
    return api('site.php').then(function (s) { state.site = s; normalize(state.site); });
  }
  function normalize(s) {
    s.home = s.home || {}; s.home.cover = s.home.cover || { desktop: '', mobile: '' };
    s.about = s.about || {}; s.about.hero = s.about.hero || { desktop: '', mobile: '' };
    s.about.columns = s.about.columns || [];
    while (s.about.columns.length < 2) s.about.columns.push({ heading: '', text: '' });
    s.portfolio = s.portfolio || {}; s.portfolio.categories = s.portfolio.categories || []; s.portfolio.works = s.portfolio.works || [];
    s.portfolio.works.forEach(function (w) { if (!w.id) w.id = uid(); });
    s.academy = s.academy || {}; s.academy.hero = s.academy.hero || { desktop: '', mobile: '' };
    s.academy.headline = s.academy.headline || ''; s.academy.text = s.academy.text || '';
    s.academy.programs = s.academy.programs || [];
    while (s.academy.programs.length < 3) s.academy.programs.push({ title: '', text: '' });
    s.academy.programs.forEach(function (p) { p.image = p.image || ''; p.price = p.price || ''; p.link = p.link || 'book.html'; });
    s.news = s.news || {}; s.news.categories = s.news.categories || []; s.news.posts = s.news.posts || [];
    s.news.posts.forEach(function (p) { if (!p.id) p.id = uid(); p.images = p.images || (p.image ? [p.image] : []); });
    s.contact = s.contact || {};
    if (s.contact.guestSpotEnabled === undefined) s.contact.guestSpotEnabled = true;
    s.contact.socials = s.contact.socials || [];
    s.contact.mapQuery = s.contact.mapQuery || ''; s.contact.mapEmbed = s.contact.mapEmbed || '';
    s.booking = s.booking || {};
    s.booking.intro = s.booking.intro || '';
    s.booking.services = s.booking.services || [];
    s.booking.services = s.booking.services.filter(function (x) { return x.id !== 'seminar' && x.kind !== 'seminar'; });
    s.booking.seminarTerms = s.booking.seminarTerms || 'Seminar price starts from $100 per day. If that works for you, tick to accept the terms.';
    s.booking.locations = s.booking.locations || [];
    s.booking.notifyEmail = s.booking.notifyEmail || '';
  }
  function publish() {
    if (!state.dirty || state.busy) return;
    busy(1);
    var btn = $('#publish'); btn.textContent = 'Publishing…';
    api('site.php', state.site).then(function () {
      var dels = state.pendingDeletes.slice(); state.pendingDeletes = [];
      return dels.reduce(function (p, path) {
        return p.then(function () { return deleteFile(path).catch(function () {}); });
      }, Promise.resolve());
    }).then(function () {
      setDirty(false);
      toast('Published — the site is updated.');
    }).catch(function (e) {
      toast('Publish failed: ' + e.message, true);
    }).then(function () {
      busy(-1); btn.textContent = 'Publish';
    });
  }

  /* ---------- rendering ---------- */
  function renderMediaSlots() {
    $$('.media-slot').forEach(function (slot) {
      var path = slot.dataset.media;
      var src = get(state.site, path) || '';
      var pv = $('.media-preview', slot);
      pv.innerHTML = '';
      if (src) {
        var el = isVideo(src) ? document.createElement('video') : document.createElement('img');
        el.src = '../' + src + '?v=' + Date.now();
        if (el.tagName === 'VIDEO') { el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true; }
        pv.appendChild(el);
      } else {
        pv.textContent = 'No media';
      }
      var f = $('.media-file', slot);
      if (!f) { f = document.createElement('div'); f.className = 'media-file'; slot.appendChild(f); }
      f.textContent = src ? src.split('/').pop() : '';
      $('.media-remove', slot).disabled = !src;
    });
  }
  function renderText() {
    $$('[data-bind]').forEach(function (el) {
      var v = get(state.site, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v || '';
    });
  }
  function renderCategories() {
    var list = $('#cat-list'); list.innerHTML = '';
    var cats = state.site.portfolio.categories;
    if (!cats.length) { list.innerHTML = '<div class="empty">No categories yet</div>'; }
    cats.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<span class="handle">' + (i + 1) + '</span>' +
        '<input type="text" value="">' +
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>';
      var input = $('input', row);
      input.value = c.name;
      input.addEventListener('input', function () { c.name = input.value; setDirty(true); });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === cats.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') { cats.splice(i - 1, 0, cats.splice(i, 1)[0]); }
        if (act === 'down') { cats.splice(i + 1, 0, cats.splice(i, 1)[0]); }
        if (act === 'del') {
          var used = state.site.portfolio.works.filter(function (w) { return w.category === c.id; }).length;
          if (!confirm('Delete "' + c.name + '"?' + (used ? ' ' + used + ' work(s) use it and will lose their category.' : ''))) return;
          cats.splice(i, 1);
          state.site.portfolio.works.forEach(function (w) { if (w.category === c.id) w.category = ''; });
        }
        setDirty(true); renderCategories(); renderWorks();
      });
      list.appendChild(row);
    });
  }
  function renderWorks() {
    var list = $('#work-list'); list.innerHTML = '';
    var works = state.site.portfolio.works;
    var cats = state.site.portfolio.categories;
    $('#work-count').textContent = works.length ? works.length + ' work' + (works.length > 1 ? 's' : '') : '';
    if (!works.length) { list.innerHTML = '<div class="empty">No works yet — upload images to start</div>'; return; }
    works.forEach(function (w, i) {
      var row = document.createElement('div');
      row.className = 'work';
      row.dataset.id = w.id;
      row.innerHTML =
        '<div class="work-thumb" title="Click to replace image">' + (w.image ? '<img src="../' + w.image + '" alt="">' : '') + '</div>' +
        '<div class="work-fields">' +
          '<label>Name<input type="text" data-k="title"></label>' +
          '<label>Category<select data-k="category"><option value="">— none —</option></select></label>' +
          '<label class="full">Link (optional)<input type="url" data-k="link" placeholder="https://…"></label>' +
        '</div>' +
        '<div class="work-actions">' +
          '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
          '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
          '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>' +
          '<div class="work-pos">' + (i + 1) + '/' + works.length + '</div>' +
        '</div>';
      var sel = $('select', row);
      cats.forEach(function (c) {
        var o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o);
      });
      $$('[data-k]', row).forEach(function (inp) {
        inp.value = w[inp.dataset.k] || '';
        inp.addEventListener('input', function () { w[inp.dataset.k] = inp.value; setDirty(true); });
      });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === works.length - 1;
      $('.work-actions', row).addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') works.splice(i - 1, 0, works.splice(i, 1)[0]);
        if (act === 'down') works.splice(i + 1, 0, works.splice(i, 1)[0]);
        if (act === 'del') {
          if (!confirm('Delete "' + (w.title || 'this work') + '"?')) return;
          queueDelete(w.image);
          works.splice(i, 1);
        }
        setDirty(true); renderWorks();
      });
      $('.work-thumb', row).addEventListener('click', function () {
        pickFiles(false, function (files) {
          replaceWorkImage(w, files[0], $('.work-thumb', row));
        });
      });
      list.appendChild(row);
    });
  }
  /* Countries: ISO codes → names via the browser, flag via regional indicators */
  var ISO = ('AF AL DZ AD AO AR AM AU AT AZ BH BD BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DO EC EG SV GQ ER EE ET FJ FI FR GA GM GE DE GH GR GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KW KG LA LV LB LS LR LY LI LT LU MO MK MG MW MY MV ML MT MR MU MX MD MC MN ME MA MZ MM NA NP NL NZ NI NE NG NO OM PK PA PG PY PE PH PL PT PR QA RO RU RW SA SN RS SC SL SG SK SI SO ZA KR ES LK SD SR SE CH SY TW TJ TZ TH TG TN TR TM UG UA AE GB US UY UZ VE VN YE ZM ZW').split(' ');
  var countryName = (function () {
    try { var dn = new Intl.DisplayNames(['en'], { type: 'region' }); return function (c) { return dn.of(c) || c; }; }
    catch (e) { return function (c) { return c; }; }
  })();
  function flag(code) {
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) { return 0x1F1E6 + c.charCodeAt(0) - 65; }));
  }
  function fillCountries() {
    var sel = $('#loc-country');
    ISO.map(function (c) { return { c: c, n: countryName(c) }; })
      .sort(function (a, b) { return a.n.localeCompare(b.n); })
      .forEach(function (x) { var o = document.createElement('option'); o.value = x.c; o.textContent = flag(x.c) + ' ' + x.n; sel.appendChild(o); });
  }

  // Kind is derived from the name: "cover" → cover up (also asks for the old tattoo photo).
  function kindOf(name) { return /cover/i.test(String(name)) ? 'coverup' : 'tattoo'; }
  function renderServices() {
    var list = $('#svc-list'); list.innerHTML = '';
    var items = state.site.booking.services;
    if (!items.length) list.innerHTML = '<div class="empty">No styles yet</div>';
    items.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<span class="handle">' + (i + 1) + '</span>' +
        '<input type="text">' +
        '<span class="kind-tag"></span>' +
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>';
      var input = $('input', row), tag = $('.kind-tag', row);
      s.kind = kindOf(s.name);
      input.value = s.name;
      function showKind() { tag.textContent = s.kind === 'coverup' ? '2 images' : '1 image'; tag.classList.toggle('is-two', s.kind === 'coverup'); }
      showKind();
      input.addEventListener('input', function () { s.name = input.value; s.kind = kindOf(s.name); showKind(); setDirty(true); });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === items.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') items.splice(i - 1, 0, items.splice(i, 1)[0]);
        if (act === 'down') items.splice(i + 1, 0, items.splice(i, 1)[0]);
        if (act === 'del') { if (!confirm('Delete "' + s.name + '"?')) return; items.splice(i, 1); }
        setDirty(true); renderServices();
      });
      list.appendChild(row);
    });
  }
  function renderLocations() {
    var list = $('#loc-list'); list.innerHTML = '';
    var items = state.site.booking.locations;
    if (!items.length) list.innerHTML = '<div class="empty">No cities yet — add where you\'ll be working</div>';
    items.forEach(function (l, i) {
      var row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<span class="flag"></span>' +
        '<div class="loc-fields">' +
          '<div><span class="loc-country"></span><input type="text" data-k="city" placeholder="City"></div>' +
          '<input type="date" data-k="from" title="From">' +
          '<input type="date" data-k="to" title="To">' +
        '</div>' +
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>' +
        '<div class="loc-cal"><div class="loc-cal-head"><span class="lc-title"></span><span class="lc-hint">Tap a day to mark it full / free. Green = confirmed booking.</span></div><div class="lc-grid"></div></div>';
      $('.flag', row).textContent = flag(l.code);
      $('.loc-country', row).textContent = l.country;
      l.blocked = l.blocked || [];
      renderLocCal(row, l);
      $$('[data-k]', row).forEach(function (inp) {
        inp.value = l[inp.dataset.k] || '';
        inp.addEventListener('input', function () { l[inp.dataset.k] = inp.value; setDirty(true); });
      });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === items.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') items.splice(i - 1, 0, items.splice(i, 1)[0]);
        if (act === 'down') items.splice(i + 1, 0, items.splice(i, 1)[0]);
        if (act === 'del') { if (!confirm('Delete ' + l.city + '?')) return; items.splice(i, 1); }
        setDirty(true); renderLocations();
      });
      list.appendChild(row);
    });
  }

  /* Per-city calendar: shows the trip (or the next 3 months), blocked days and confirmed bookings. */
  function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var locView = {}; // location id -> month offset
  function renderLocCal(row, l) {
    var grid = $('.lc-grid', row), title = $('.lc-title', row);
    var todayS = isoDate(new Date());
    var startS = l.from && l.from > todayS ? l.from : todayS;
    var endS = l.to || isoDate(new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0));
    var sp = startS.split('-');
    var base = new Date(+sp[0], sp[1] - 1, 1);
    var off = locView[l.id] || 0;
    var first = new Date(base.getFullYear(), base.getMonth() + off, 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    var confirmedDays = {};
    requests.forEach(function (r) { if (r.status === 'confirmed' && r.location && r.location.id === l.id) confirmedDays[r.date] = r.firstName + ' ' + r.lastName; });
    var canPrev = off > 0, canNext = isoDate(new Date(first.getFullYear(), first.getMonth() + 1, 1)) <= endS;
    title.innerHTML = '<button type="button" class="btn btn-small btn-icon" data-lc="-1"' + (canPrev ? '' : ' disabled') + '>‹</button> <b>' +
      first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + '</b> <button type="button" class="btn btn-small btn-icon" data-lc="1"' + (canNext ? '' : ' disabled') + '>›</button>';
    var html = '';
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function (d) { html += '<span class="lc-wd">' + d + '</span>'; });
    for (var i = 0; i < (first.getDay() + 6) % 7; i++) html += '<span></span>';
    for (var d = 1; d <= last.getDate(); d++) {
      var ds = isoDate(new Date(first.getFullYear(), first.getMonth(), d));
      var out = ds < startS || ds > endS;
      var cls = 'lc-day' + (out ? ' is-out' : '') + (l.blocked.indexOf(ds) >= 0 ? ' is-full' : '') + (confirmedDays[ds] ? ' is-booked' : '');
      html += '<button type="button" class="' + cls + '" data-d="' + ds + '"' + (out || confirmedDays[ds] ? ' disabled' : '') +
        (confirmedDays[ds] ? ' title="' + confirmedDays[ds].replace(/"/g, '') + '"' : '') + '>' + d + '</button>';
    }
    grid.innerHTML = html;
    title.onclick = function (e) {
      var b = e.target.closest('[data-lc]'); if (!b || b.disabled) return;
      locView[l.id] = off + (+b.dataset.lc); renderLocCal(row, l);
    };
    grid.onclick = function (e) {
      var b = e.target.closest('.lc-day'); if (!b || b.disabled) return;
      var ds = b.dataset.d, i = l.blocked.indexOf(ds);
      if (i >= 0) l.blocked.splice(i, 1); else l.blocked.push(ds);
      setDirty(true); renderLocCal(row, l);
    };
  }

  var requests = [];
  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function loadRequests() {
    return api('bookings.php').then(function (r) { requests = r; renderRequests(); renderLocations(); }).catch(function (e) { toast(e.message, true); });
  }
  function renderRequests() {
    var list = $('#req-list'); list.innerHTML = '';
    var fresh = requests.filter(function (r) { return (r.status || 'new') === 'new'; }).length;
    var badge = $('#req-badge'); badge.textContent = fresh; badge.hidden = !fresh;
    if (!requests.length) { list.innerHTML = '<div class="empty">No requests yet</div>'; return; }
    requests.forEach(function (r) {
      var st = r.status || 'new';
      var el = document.createElement('div');
      el.className = 'req is-' + st;
      el.innerHTML =
        '<div>' +
          '<div class="req-title"><span class="name"></span><span class="tag ' + st + '">' + st + '</span></div>' +
          '<div class="req-meta"></div>' +
          '<div class="req-idea"></div>' +
          '<div class="req-imgs"></div>' +
        '</div>' +
        '<div class="req-actions">' +
          (st === 'new' ? '<button class="btn btn-small btn-primary" data-act="confirmed">Confirm</button>' : '') +
          (st === 'confirmed' ? '<button class="btn btn-small" data-act="done">Mark done</button>' : '') +
          (st !== 'new' ? '<button class="btn btn-small" data-act="new">Reopen</button>' : '') +
          '<button class="btn btn-small btn-danger" data-act="del">Delete</button>' +
        '</div>';
      $('.name', el).textContent = r.firstName + ' ' + r.lastName;
      var meta = $('.req-meta', el);
      meta.innerHTML = '<b></b> · <span class="c"></span><br><span class="l"></span> · <span class="d"></span> · <span class="s"></span><br><span class="t"></span>';
      $('b', meta).textContent = r.contact;
      $('.c', meta).textContent = 'received ' + new Date(r.created).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      $('.l', meta).textContent = flag(r.location.code) + ' ' + r.location.city + ', ' + r.location.country;
      $('.d', meta).textContent = fmtDate(r.date);
      $('.s', meta).textContent = r.service.name;
      $('.t', meta).remove();
      $('.req-idea', el).textContent = r.idea;
      var imgs = $('.req-imgs', el);
      (r.images || []).forEach(function (f) {
        var a = document.createElement('a'); a.href = CFG.api + 'booking-file.php?id=' + r.id + '&file=' + f; a.target = '_blank';
        var im = document.createElement('img'); im.src = a.href; im.alt = f; a.appendChild(im); imgs.appendChild(a);
      });
      if (!(r.images || []).length) imgs.remove();
      $('.req-actions', el).addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (act === 'confirmed' || act === 'done' || act === 'new') {
          api('bookings.php', { action: 'status', id: r.id, status: act }).then(function () {
            r.status = act; renderRequests();
            if (act === 'confirmed') toast(fmtDate(r.date) + ' in ' + r.location.city + ' is now full');
          }).catch(function (err) { toast(err.message, true); });
        }
        if (act === 'del') {
          if (!confirm('Delete this request permanently?')) return;
          api('bookings.php', { action: 'delete', id: r.id }).then(function () {
            requests = requests.filter(function (x) { return x.id !== r.id; }); renderRequests();
          }).catch(function (err) { toast(err.message, true); });
        }
      });
      list.appendChild(el);
    });
  }

  function renderNewsCats() {
    var list = $('#ncat-list'); list.innerHTML = '';
    var cats = state.site.news.categories;
    if (!cats.length) list.innerHTML = '<div class="empty">No categories yet</div>';
    cats.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<span class="handle">' + (i + 1) + '</span>' +
        '<input type="text">' +
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>';
      var input = $('input', row); input.value = c.name;
      input.addEventListener('input', function () { c.name = input.value; setDirty(true); });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === cats.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') cats.splice(i - 1, 0, cats.splice(i, 1)[0]);
        if (act === 'down') cats.splice(i + 1, 0, cats.splice(i, 1)[0]);
        if (act === 'del') {
          if (!confirm('Delete "' + c.name + '"?')) return;
          cats.splice(i, 1);
          state.site.news.posts.forEach(function (p) { if (p.category === c.id) p.category = ''; });
        }
        setDirty(true); renderNewsCats(); renderPosts();
      });
      list.appendChild(row);
    });
  }
  function renderPosts() {
    var list = $('#post-list'); list.innerHTML = '';
    var posts = state.site.news.posts, cats = state.site.news.categories;
    $('#post-count').textContent = posts.length ? posts.length + ' post' + (posts.length > 1 ? 's' : '') : '';
    if (!posts.length) { list.innerHTML = '<div class="empty">No posts yet — press "New post"</div>'; return; }
    posts.forEach(function (p, i) {
      p.images = p.images || [];
      var row = document.createElement('div');
      row.className = 'post-card';
      row.innerHTML =
        '<div class="post-head">' +
          '<span class="handle">' + (i + 1) + '</span>' +
          '<input type="text" class="post-title-in" data-k="title" placeholder="Title">' +
          '<label class="check"><input type="checkbox" data-k="featured"><span>Featured</span></label>' +
          '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
          '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
          '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>' +
        '</div>' +
        '<div class="post-grid">' +
          '<label>Date<input type="date" data-k="date"></label>' +
          '<label>Category<select data-k="category"><option value="">— none —</option></select></label>' +
          '<label>Link (optional)<input type="url" data-k="link" placeholder="https://…"></label>' +
        '</div>' +
        '<div class="post-images"><div class="pi-list"></div><label class="btn btn-small">Add images<input type="file" accept="image/*" multiple hidden></label></div>' +
        '<textarea data-k="text" placeholder="Text… {image2} on its own line shows the 2nd image there; {image2 left} or {image2 right} floats it beside the text. Lines starting with • become bullets."></textarea>' +
        '<details class="post-az"><summary>Azerbaijani version <span class="az-state"></span></summary>' +
          '<div class="post-az-body">' +
            '<button type="button" class="btn btn-small az-auto">Auto-translate from English (draft)</button>' +
            '<input type="text" class="post-title-in" data-k="title_az" placeholder="Başlıq (AZ)">' +
            '<textarea data-k="text_az" placeholder="Mətn (AZ) — same {image2} and • rules"></textarea>' +
          '</div></details>';
      var sel = $('select', row);
      cats.forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
      var azState = $('.az-state', row);
      function showAz() { azState.textContent = p.text_az ? '✓' : ''; }
      showAz();
      $('.az-auto', row).addEventListener('click', function () {
        var btn = this;
        if (!p.text && !p.title) { toast('Write the English text first', true); return; }
        if (p.text_az && !confirm('Replace the current Azerbaijani text with a new draft?')) return;
        btn.disabled = true; btn.textContent = 'Translating…';
        translateDraft(p.title || '').then(function (t) {
          p.title_az = t;
          return translateDraft(p.text || '');
        }).then(function (t) {
          p.text_az = t; setDirty(true); renderPosts();
          toast('Draft translated — please read and correct it before publishing.', false, 6000);
        }).catch(function (e) { toast('Translation failed: ' + e.message, true); btn.disabled = false; btn.textContent = 'Auto-translate from English (draft)'; });
      });
      $$('[data-k]', row).forEach(function (inp) {
        if (inp.type === 'checkbox') {
          inp.checked = !!p.featured;
          inp.addEventListener('change', function () {
            if (inp.checked) posts.forEach(function (x) { x.featured = x === p; }); else p.featured = false;
            setDirty(true); renderPosts();
          });
          return;
        }
        inp.value = p[inp.dataset.k] || '';
        inp.addEventListener('input', function () { p[inp.dataset.k] = inp.value; setDirty(true); if (inp.dataset.k === 'text_az') showAz(); });
      });
      // images
      var pil = $('.pi-list', row);
      p.images.forEach(function (im, k) {
        if (typeof im === 'string') im = p.images[k] = { src: im, ratio: '5:4' };
        var t = document.createElement('div'); t.className = 'pi';
        t.innerHTML = '<img src="../' + im.src + '" alt=""><span class="pi-n">{image' + (k + 1) + '}</span>' +
          '<button type="button" class="pi-x" title="Remove">✕</button>';
        $('.pi-x', t).addEventListener('click', function () { queueDelete(im.src); p.images.splice(k, 1); setDirty(true); renderPosts(); });
        pil.appendChild(t);
      });
      $('.post-images input[type=file]', row).addEventListener('change', function () {
        var files = Array.prototype.slice.call(this.files); this.value = '';
        if (!files.length) return;
        busy(1); toast('Uploading…', false, 60000);
        files.reduce(function (pr, f) {
          return pr.then(function () { return uploadMedia(f, 'news', CFG.imageMax.cover).then(function (path) { p.images.push({ src: path, ratio: '5:4' }); setDirty(true); renderPosts(); }); });
        }, Promise.resolve()).then(function () { toast('Uploaded'); }).catch(function (e) { toast('Upload failed: ' + e.message, true); })
          .then(function () { busy(-1); });
      });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === posts.length - 1;
      $('.post-head', row).addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') posts.splice(i - 1, 0, posts.splice(i, 1)[0]);
        if (act === 'down') posts.splice(i + 1, 0, posts.splice(i, 1)[0]);
        if (act === 'del') { if (!confirm('Delete "' + (p.title || 'this post') + '"?')) return; p.images.forEach(function (im) { queueDelete(typeof im === 'string' ? im : im.src); }); posts.splice(i, 1); }
        setDirty(true); renderPosts();
      });
      list.appendChild(row);
    });
  }

  // Free machine translation for a first draft (MyMemory, ~5000 chars/day). Keeps {imageN} lines and bullets.
  function translateDraft(text) {
    var lines = String(text).split('\n');
    return lines.reduce(function (pr, line) {
      return pr.then(function (out) {
        var t = line.trim();
        if (!t || /^\{image\d+/i.test(t)) return out.concat([line]);
        var bullet = /^[•\-–*]\s*/.test(t) ? '• ' : '';
        var body = t.replace(/^[•\-–*]\s*/, '');
        return fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(body.slice(0, 490)) + '&langpair=en|az')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var tr = j && j.responseData && j.responseData.translatedText;
            if (!tr || /QUERY LENGTH|INVALID|LIMIT/i.test(tr)) throw new Error(tr || 'no result');
            return out.concat([bullet + tr]);
          });
      });
    }, Promise.resolve([])).then(function (out) { return out.join('\n'); });
  }

  function renderSocials() {
    var list = $('#social-list'); list.innerHTML = '';
    var items = state.site.contact.socials;
    if (!items.length) list.innerHTML = '<div class="empty">No links yet</div>';
    items.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        '<span class="handle">' + (i + 1) + '</span>' +
        '<div class="social-fields">' +
          '<input type="text" data-k="label" placeholder="Name">' +
          '<input type="text" data-k="handle" placeholder="@handle">' +
          '<input type="text" data-k="url" placeholder="Link">' +
        '</div>' +
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>';
      $$('[data-k]', row).forEach(function (inp) {
        inp.value = s[inp.dataset.k] || '';
        inp.addEventListener('input', function () { s[inp.dataset.k] = inp.value; setDirty(true); });
      });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === items.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') items.splice(i - 1, 0, items.splice(i, 1)[0]);
        if (act === 'down') items.splice(i + 1, 0, items.splice(i, 1)[0]);
        if (act === 'del') { if (!confirm('Delete "' + s.label + '"?')) return; items.splice(i, 1); }
        setDirty(true); renderSocials();
      });
      list.appendChild(row);
    });
  }

  function renderAll() {
    renderMediaSlots(); renderText(); renderCategories(); renderWorks(); renderServices(); renderLocations(); renderSocials(); renderNewsCats(); renderPosts();
    loadRequests();
  }

  /* ---------- actions ---------- */
  function pickFiles(multiple, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
    inp.onchange = function () { if (inp.files.length) cb(Array.prototype.slice.call(inp.files)); };
    inp.click();
  }
  function progressBar(container) {
    var p = document.createElement('div'); p.className = 'progress'; p.innerHTML = '<i></i>';
    container.appendChild(p);
    return function (frac) { p.firstChild.style.width = Math.round(frac * 100) + '%'; };
  }
  function replaceWorkImage(w, file, thumb) {
    busy(1);
    var prog = progressBar(thumb);
    uploadMedia(file, 'work', CFG.imageMax.work, prog).then(function (path) {
      queueDelete(w.image);
      w.image = path;
      setDirty(true); renderWorks();
      toast('Image uploaded');
    }).catch(function (e) { toast('Upload failed: ' + e.message, true); renderWorks(); })
      .then(function () { busy(-1); });
  }
  function addWorks(files) {
    var works = state.site.portfolio.works;
    var defaultCat = state.site.portfolio.categories[0] ? state.site.portfolio.categories[0].id : '';
    busy(1);
    toast('Uploading ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '…', false, 60000);
    files.reduce(function (p, file) {
      return p.then(function () {
        return uploadMedia(file, 'work', CFG.imageMax.work).then(function (path) {
          // newest first — reorder later with ↑ ↓ if needed
          works.unshift({ id: uid(), image: path, title: file.name.replace(/\.[^.]+$/, ''), category: defaultCat, link: '' });
          setDirty(true); renderWorks();
        });
      });
    }, Promise.resolve()).then(function () {
      toast('Uploaded. Fill in names and press Publish.');
    }).catch(function (e) { toast('Upload failed: ' + e.message, true); })
      .then(function () { busy(-1); });
  }
  function bindMediaSlots() {
    $$('.media-slot').forEach(function (slot) {
      var path = slot.dataset.media;
      var isCover = /cover|hero/.test(path);
      if (/programs/.test(path)) isCover = false;
      $('input[type=file]', slot).addEventListener('change', function () {
        var file = this.files[0]; if (!file) return;
        this.value = '';
        busy(1);
        var prog = progressBar($('.media-preview', slot));
        uploadMedia(file, path.split('.').join('-'), isCover ? CFG.imageMax.cover : CFG.imageMax.work, prog).then(function (p) {
          queueDelete(get(state.site, path));
          set(state.site, path, p);
          setDirty(true); renderMediaSlots();
          toast('Uploaded');
        }).catch(function (e) { toast('Upload failed: ' + e.message, true); renderMediaSlots(); })
          .then(function () { busy(-1); });
      });
      $('.media-remove', slot).addEventListener('click', function () {
        var cur = get(state.site, path);
        if (!cur || !confirm('Remove this media?')) return;
        queueDelete(cur);
        set(state.site, path, '');
        setDirty(true); renderMediaSlots();
      });
    });
  }

  /* ---------- boot ---------- */
  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderAll();
  }
  function showLogin(err) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-sub').textContent = needsSetup ? 'First time here — create the admin password.' : 'Enter your password to edit the site.';
    $('#pw-label').textContent = needsSetup ? 'New password (min 8 characters)' : 'Password';
    $('#pw2-wrap').hidden = !needsSetup;
    $('#password2').required = needsSetup;
    $('#password').autocomplete = needsSetup ? 'new-password' : 'current-password';
    $('#login-btn').textContent = needsSetup ? 'Create password' : 'Sign in';
    var e = $('#login-error');
    e.hidden = !err; e.textContent = err || '';
    $('#login-btn').disabled = false;
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('#password').value;
    if (needsSetup && pw !== $('#password2').value) { showLogin('Passwords do not match'); return; }
    var btn = $('#login-btn'); btn.disabled = true; btn.textContent = needsSetup ? 'Creating…' : 'Signing in…';
    api('auth.php?action=' + (needsSetup ? 'setup' : 'login'), { password: pw, remember: $('#remember').checked }, { noAuthRedirect: true })
      .then(function () { needsSetup = false; $('#password').value = ''; $('#password2').value = ''; return loadSite(); })
      .then(showApp)
      .catch(function (err) { showLogin(err.message); });
  });
  $('#logout').addEventListener('click', function () {
    if (state.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    api('auth.php?action=logout', {}).catch(function () {}).then(function () {
      state.site = null; setDirty(false); showLogin();
    });
  });
  $('#pw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var cur = $('#pw-current').value, nw = $('#pw-new').value, nw2 = $('#pw-new2').value;
    if (nw !== nw2) { toast('New passwords do not match', true); return; }
    api('auth.php?action=change', { current: cur, password: nw }).then(function () {
      $('#pw-form').reset();
      toast('Password changed');
    }).catch(function (err) { toast(err.message, true); });
  });
  $('#publish').addEventListener('click', publish);
  $('#tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    $$('.tab').forEach(function (x) { x.classList.toggle('is-active', x === t); });
    $$('.panel').forEach(function (p) { p.classList.toggle('is-active', p.dataset.panel === t.dataset.tab); });
    try { sessionStorage.setItem('admin_tab', t.dataset.tab); } catch (err) {}
  });
  $$('[data-bind]').forEach(function (el) {
    var ev = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, function () {
      set(state.site, el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
      setDirty(true);
    });
  });
  $('#cat-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('input', this); var name = inp.value.trim(); if (!name) return;
    var cats = state.site.portfolio.categories;
    var id = slug(name), base = id, n = 2;
    while (cats.some(function (c) { return c.id === id; })) id = base + '-' + n++;
    cats.push({ id: id, name: name });
    inp.value = '';
    setDirty(true); renderCategories(); renderWorks();
  });
  $('#work-add').addEventListener('change', function () {
    if (this.files.length) addWorks(Array.prototype.slice.call(this.files));
    this.value = '';
  });
  $('#svc-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('input', this); var name = inp.value.trim(); if (!name) return;
    var items = state.site.booking.services;
    var id = slug(name), base = id, n = 2;
    while (items.some(function (s) { return s.id === id; })) id = base + '-' + n++;
    items.push({ id: id, name: name, kind: kindOf(name) });
    inp.value = '';
    setDirty(true); renderServices();
  });
  $('#loc-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('#loc-country').value, city = $('#loc-city').value.trim();
    if (!code || !city) return;
    var from = $('#loc-from').value, to = $('#loc-to').value;
    if (from && to && to < from) { toast('"To" date is before "From"', true); return; }
    state.site.booking.locations.push({ id: uid(), code: code, country: countryName(code), city: city, from: from, to: to });
    this.reset();
    setDirty(true); renderLocations();
  });
  $('#ncat-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('input', this); var name = inp.value.trim(); if (!name) return;
    var cats = state.site.news.categories;
    var id = slug(name), base = id, n = 2;
    while (cats.some(function (c) { return c.id === id; })) id = base + '-' + n++;
    cats.push({ id: id, name: name });
    inp.value = '';
    setDirty(true); renderNewsCats(); renderPosts();
  });
  $('#post-add').addEventListener('click', function () {
    var cats = state.site.news.categories;
    state.site.news.posts.unshift({ id: uid(), title: '', text: '', images: [], link: '', date: new Date().toISOString().slice(0, 10), category: cats[0] ? cats[0].id : '', featured: false });
    setDirty(true); renderPosts();
    var first = $('#post-list input[data-k=title]'); if (first) first.focus();
  });
  $('#social-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var label = $('#social-label').value.trim(), url = $('#social-url').value.trim(), handle = $('#social-handle').value.trim();
    if (!label || !url) return;
    state.site.contact.socials.push({ label: label, handle: handle, url: url });
    this.reset();
    setDirty(true); renderSocials();
  });
  // Logo → 1200×630 share image (jpg) + 512 favicon (png)
  $('#brand-file').addEventListener('change', function () {
    var file = this.files[0]; this.value = '';
    if (!file) return;
    var dark = $('#brand-dark').checked;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      function draw(w, h, pad, bg) {
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        var s = Math.min((w - pad * 2) / img.naturalWidth, (h - pad * 2) / img.naturalHeight);
        var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return c;
      }
      var bg = dark ? '#000' : '#fff';
      var og = draw(1200, 630, 120, bg), icon = draw(512, 512, 48, bg);
      og.toBlob(function (ob) {
        icon.toBlob(function (ib) {
          var fd = new FormData();
          fd.append('og', ob, 'og.jpg'); fd.append('icon', ib, 'favicon.png');
          busy(1);
          api('brand.php', fd).then(function () {
            var p = $('#og-preview'); p.style.display = ''; p.src = '../assets/og.jpg?v=' + Date.now();
            toast('Logo saved — shared links will show it (social apps may cache the old preview for a while).', false, 6000);
          }).catch(function (e) { toast(e.message, true); }).then(function () { busy(-1); });
        }, 'image/png');
      }, 'image/jpeg', 0.9);
    };
    img.src = url;
  });
  $('#req-refresh').addEventListener('click', loadRequests);
  fillCountries();
  bindMediaSlots();
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // restore tab
  try {
    var savedTab = sessionStorage.getItem('admin_tab');
    if (savedTab) { var tb = $('.tab[data-tab="' + savedTab + '"]'); if (tb) tb.click(); }
  } catch (e) {}

  authStatus().then(function (st) {
    needsSetup = !!st.setup;
    if (st.signedIn) return loadSite().then(showApp);
    showLogin();
  }).catch(function (err) { showLogin('Cannot reach the server: ' + err.message); });
})();
