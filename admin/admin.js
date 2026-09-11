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
    s.booking = s.booking || {};
    s.booking.intro = s.booking.intro || '';
    s.booking.services = s.booking.services || [];
    if (!s.booking.services.some(function (x) { return /seminar/i.test(x.name); })) s.booking.services.push({ id: 'seminar', name: 'Seminar', kind: 'seminar' });
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
      el.value = get(state.site, el.dataset.bind) || '';
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

  // Kind is derived from the name: "cover" → cover up (asks for the old tattoo photo), "seminar" → no images.
  function kindOf(name) {
    var n = String(name).toLowerCase();
    return /seminar/.test(n) ? 'seminar' : /cover/.test(n) ? 'coverup' : 'tattoo';
  }
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
        '<button class="btn btn-small btn-icon" data-act="up" title="Move up">↑</button>' +
        '<button class="btn btn-small btn-icon" data-act="down" title="Move down">↓</button>' +
        '<button class="btn btn-small btn-icon btn-danger" data-act="del" title="Delete">✕</button>';
      var input = $('input', row);
      s.kind = kindOf(s.name);
      input.value = s.name;
      if (s.kind === 'seminar') { input.readOnly = true; $('[data-act=del]', row).disabled = true; $('[data-act=del]', row).title = 'Seminar can\'t be deleted'; }
      input.addEventListener('input', function () { s.name = input.value; s.kind = kindOf(s.name); setDirty(true); });
      $('[data-act=up]', row).disabled = i === 0;
      $('[data-act=down]', row).disabled = i === items.length - 1;
      row.addEventListener('click', function (e) {
        var act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'up') items.splice(i - 1, 0, items.splice(i, 1)[0]);
        if (act === 'down') items.splice(i + 1, 0, items.splice(i, 1)[0]);
        if (act === 'del') { if (s.kind === 'seminar' || !confirm('Delete "' + s.name + '"?')) return; items.splice(i, 1); }
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
        '<div class="loc-blocked"><span class="lb-label">Full dates:</span><span class="lb-chips"></span>' +
          '<input type="date" class="lb-date"><button type="button" class="btn btn-small" data-act="block">Mark full</button></div>';
      $('.flag', row).textContent = flag(l.code);
      $('.loc-country', row).textContent = l.country;
      l.blocked = l.blocked || [];
      var chips = $('.lb-chips', row);
      l.blocked.slice().sort().forEach(function (d) {
        var chip = document.createElement('span'); chip.className = 'chip';
        chip.innerHTML = '<span></span><button type="button" title="Unblock">✕</button>';
        chip.firstChild.textContent = fmtDate(d);
        chip.lastChild.addEventListener('click', function () { l.blocked = l.blocked.filter(function (x) { return x !== d; }); setDirty(true); renderLocations(); });
        chips.appendChild(chip);
      });
      if (!l.blocked.length) chips.innerHTML = '<span class="lb-none">none</span>';
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
        if (act === 'block') {
          var d = $('.lb-date', row).value;
          if (!d) { toast('Pick a date first', true); return; }
          if (l.blocked.indexOf(d) < 0) l.blocked.push(d);
        }
        setDirty(true); renderLocations();
      });
      list.appendChild(row);
    });
  }

  var requests = [];
  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function loadRequests() {
    return api('bookings.php').then(function (r) { requests = r; renderRequests(); }).catch(function (e) { toast(e.message, true); });
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

  function renderAll() {
    renderMediaSlots(); renderText(); renderCategories(); renderWorks(); renderServices(); renderLocations();
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
    el.addEventListener('input', function () { set(state.site, el.dataset.bind, el.value); setDirty(true); });
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
    if (kindOf(name) === 'seminar') { toast('Seminar already exists', true); return; }
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
