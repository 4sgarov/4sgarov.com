/* Admin panel — edits data/site.json and uploads media straight to GitHub. */
(function () {
  'use strict';

  var CFG = {
    owner: '4sgarov',
    repo: '4sgarov.com',
    branch: 'main',
    dataPath: 'data/site.json',
    uploadDir: 'assets/uploads',
    maxUploadMB: 95,           // GitHub contents API hard limit is 100 MB
    warnUploadMB: 40,
    imageMax: { cover: 2560, work: 1600 }
  };
  var VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    token: null,
    site: null,
    sha: null,
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
  function b64utf8(str) { return btoa(unescape(encodeURIComponent(str))); }
  function utf8b64(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
  function fileToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  /* ---------- GitHub API ---------- */
  function gh(path, opts) {
    opts = opts || {};
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + state.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 404 && opts.allow404) return null;
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || ('GitHub error ' + r.status));
        return j;
      });
    });
  }
  function contentsPath(p) {
    return '/repos/' + CFG.owner + '/' + CFG.repo + '/contents/' + p.split('/').map(encodeURIComponent).join('/');
  }
  function getFile(p) {
    return gh(contentsPath(p) + '?ref=' + CFG.branch, { allow404: true });
  }
  function getSha(p) {
    return getFile(p).then(function (f) { return f ? f.sha : null; });
  }
  // PUT with upload progress (XHR) — content is base64.
  function putFile(p, base64, message, sha, onProgress) {
    return new Promise(function (res, rej) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', 'https://api.github.com' + contentsPath(p));
      xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      }
      xhr.onload = function () {
        var j = {};
        try { j = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) res(j);
        else rej(new Error(j.message || ('GitHub error ' + xhr.status)));
      };
      xhr.onerror = function () { rej(new Error('Network error')); };
      var body = { message: message, content: base64, branch: CFG.branch };
      if (sha) body.sha = sha;
      xhr.send(JSON.stringify(body));
    });
  }
  function deleteFile(p, message) {
    return getSha(p).then(function (sha) {
      if (!sha) return null;
      return gh(contentsPath(p), { method: 'DELETE', body: { message: message, sha: sha, branch: CFG.branch } });
    });
  }

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
      var mb = r.blob.size / 1024 / 1024;
      if (mb > CFG.maxUploadMB) throw new Error('File is ' + mb.toFixed(0) + ' MB — max ' + CFG.maxUploadMB + ' MB. Compress it first.');
      if (mb > CFG.warnUploadMB) toast('Large file (' + mb.toFixed(0) + ' MB) — upload may take a while.', false, 5000);
      var name = prefix + '-' + Date.now() + '-' + uid().slice(0, 4) + '.' + r.ext;
      var path = CFG.uploadDir + '/' + name;
      return fileToBase64(r.blob).then(function (b64) {
        return putFile(path, b64, 'Upload ' + name, null, onProgress);
      }).then(function () { return path; });
    });
  }
  function queueDelete(path) {
    if (path && path.indexOf(CFG.uploadDir + '/') === 0 && state.pendingDeletes.indexOf(path) < 0) {
      state.pendingDeletes.push(path);
    }
  }

  /* ---------- auth ---------- */
  function saveToken(token, remember) {
    try {
      (remember ? localStorage : sessionStorage).setItem('gh_token', token);
      (remember ? sessionStorage : localStorage).removeItem('gh_token');
    } catch (e) {}
  }
  function loadToken() {
    try {
      var t = localStorage.getItem('gh_token');
      if (t) return { token: t, remember: true };
      t = sessionStorage.getItem('gh_token');
      if (t) return { token: t, remember: false };
    } catch (e) {}
    return null;
  }
  function clearToken() {
    try { localStorage.removeItem('gh_token'); sessionStorage.removeItem('gh_token'); } catch (e) {}
  }
  function verifyToken() {
    return gh('/repos/' + CFG.owner + '/' + CFG.repo).then(function (r) {
      if (!r.permissions || !r.permissions.push) throw new Error('Token has no write access to ' + CFG.owner + '/' + CFG.repo + '. Check Contents: Read and write.');
      return true;
    });
  }

  /* ---------- load / publish ---------- */
  function loadSite() {
    return getFile(CFG.dataPath).then(function (f) {
      if (!f) throw new Error(CFG.dataPath + ' not found in repo');
      state.sha = f.sha;
      state.site = JSON.parse(utf8b64(f.content));
      normalize(state.site);
    });
  }
  function normalize(s) {
    s.home = s.home || {}; s.home.cover = s.home.cover || { desktop: '', mobile: '' };
    s.about = s.about || {}; s.about.hero = s.about.hero || { desktop: '', mobile: '' };
    s.about.columns = s.about.columns || [];
    while (s.about.columns.length < 2) s.about.columns.push({ heading: '', text: '' });
    s.portfolio = s.portfolio || {}; s.portfolio.categories = s.portfolio.categories || []; s.portfolio.works = s.portfolio.works || [];
    s.portfolio.works.forEach(function (w) { if (!w.id) w.id = uid(); });
  }
  function publish() {
    if (!state.dirty || state.busy) return;
    busy(1);
    var btn = $('#publish'); btn.textContent = 'Publishing…';
    var json = JSON.stringify(state.site, null, 2) + '\n';
    getSha(CFG.dataPath).then(function (sha) {
      return putFile(CFG.dataPath, b64utf8(json), 'Update site content', sha || state.sha);
    }).then(function (r) {
      state.sha = r.content.sha;
      var dels = state.pendingDeletes.slice(); state.pendingDeletes = [];
      return dels.reduce(function (p, path) {
        return p.then(function () { return deleteFile(path, 'Remove ' + path.split('/').pop()).catch(function () {}); });
      }, Promise.resolve());
    }).then(function () {
      setDirty(false);
      toast('Published. The site updates in about a minute.');
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
  function renderAll() {
    renderMediaSlots(); renderText(); renderCategories(); renderWorks();
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
          works.push({ id: uid(), image: path, title: file.name.replace(/\.[^.]+$/, ''), category: defaultCat, link: '' });
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
    var e = $('#login-error');
    e.hidden = !err; e.textContent = err || '';
    $('#login-btn').disabled = false; $('#login-btn').textContent = 'Sign in';
  }
  function signIn(token, remember) {
    state.token = token;
    return verifyToken().then(loadSite).then(function () {
      saveToken(token, remember);
      showApp();
    });
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var token = $('#token').value.trim();
    if (!token) return;
    $('#login-btn').disabled = true; $('#login-btn').textContent = 'Signing in…';
    signIn(token, $('#remember').checked).catch(function (err) {
      state.token = null;
      showLogin(err.message);
    });
  });
  $('#logout').addEventListener('click', function () {
    if (state.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    clearToken(); state.token = null; state.site = null; setDirty(false);
    $('#token').value = '';
    showLogin();
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
  bindMediaSlots();
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // restore tab
  try {
    var savedTab = sessionStorage.getItem('admin_tab');
    if (savedTab) { var tb = $('.tab[data-tab="' + savedTab + '"]'); if (tb) tb.click(); }
  } catch (e) {}

  var saved = loadToken();
  if (saved) {
    signIn(saved.token, saved.remember).catch(function (err) { clearToken(); showLogin(err.message); });
  } else {
    showLogin();
  }
})();
