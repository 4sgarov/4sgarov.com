/* Book Now form: builds selects from site.json and submits to api/book.php */
(function () {
  var form = document.getElementById('book-form');
  if (!form) return;

  var services = {}, locations = {}, taken = {};
  var locSel = form.elements.location, dateInp = form.elements.date, svcSel = form.elements.service;
  var cal = document.getElementById('cal');
  var images = document.getElementById('images');
  var semChk = form.elements.seminar;
  var up1 = document.getElementById('upload1'), up2 = document.getElementById('upload2');

  function flag(code) {
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) { return 0x1F1E6 + c.charCodeAt(0) - 65; }));
  }
  function fmt(d) {
    if (!d) return '';
    var p = d.split('-');
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return iso(new Date()); }

  /* ---- calendar ---- */
  var view = null; // first day of the month being shown
  var collapsed = false;
  function renderCal() {
    var l = locations[locSel.value];
    var legend = document.querySelector('.cal-legend');
    legend.hidden = !l || (collapsed && !!dateInp.value);
    if (!l) { cal.innerHTML = '<div class="cal-empty">Choose a city first</div>'; return; }
    if (collapsed && dateInp.value) {
      var p0 = dateInp.value.split('-');
      cal.innerHTML = '<div class="cal-picked"><span>' + new Date(+p0[0], p0[1] - 1, +p0[2]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) + '</span>' +
        '<button type="button" class="cal-change">Change</button></div>';
      return;
    }
    var min = today(); if (l.from && l.from > min) min = l.from;
    var max = l.to || '';
    var full = taken[l.id] || [];
    if (!view) { var p = min.split('-'); view = new Date(+p[0], p[1] - 1, 1); }
    var y = view.getFullYear(), m = view.getMonth();
    var first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    var startPad = (first.getDay() + 6) % 7; // Monday first
    var canPrev = iso(new Date(y, m, 0)) >= min.slice(0, 7) + '-01';
    var canNext = !max || iso(new Date(y, m + 1, 1)) <= max;

    var html = '<div class="cal-head">' +
      '<button type="button" class="cal-nav" data-nav="-1"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
      '<span>' + first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + '</span>' +
      '<button type="button" class="cal-nav" data-nav="1"' + (canNext ? '' : ' disabled') + '>›</button></div>' +
      '<div class="cal-grid">';
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function (d) { html += '<span class="cal-wd">' + d + '</span>'; });
    for (var i = 0; i < startPad; i++) html += '<span></span>';
    for (var d = 1; d <= last.getDate(); d++) {
      var ds = iso(new Date(y, m, d));
      var out = ds < min || (max && ds > max);
      var isFull = full.indexOf(ds) >= 0;
      var cls = 'cal-day' + (out ? ' is-out' : '') + (isFull ? ' is-full' : '') + (dateInp.value === ds ? ' is-sel' : '');
      html += '<button type="button" class="' + cls + '" data-d="' + ds + '"' + ((out || isFull) ? ' disabled' : '') + '>' + d + '</button>';
    }
    cal.innerHTML = html + '</div>';
  }
  cal.addEventListener('click', function (e) {
    var nav = e.target.closest('.cal-nav');
    if (nav) { view = new Date(view.getFullYear(), view.getMonth() + (+nav.dataset.nav), 1); renderCal(); return; }
    var day = e.target.closest('.cal-day');
    if (day && !day.disabled) { dateInp.value = day.dataset.d; collapsed = true; renderCal(); }
    if (e.target.closest('.cal-change')) { collapsed = false; renderCal(); }
  });

  fetch('api/availability.php', { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function (t) { taken = t || {}; renderCal(); }).catch(function () {});

  document.addEventListener('site:loaded', function (e) {
    var b = (e.detail && e.detail.booking) || {};
    document.querySelector('.book-intro').textContent = b.intro || '';
    if (b.seminarTerms) document.getElementById('seminar-terms').textContent = b.seminarTerms;

    (b.locations || []).forEach(function (l) {
      locations[l.id] = l;
      var o = document.createElement('option');
      o.value = l.id;
      o.textContent = flag(l.code) + ' ' + l.country + ' — ' + l.city + (l.from ? ' (' + fmt(l.from) + (l.to ? ' – ' + fmt(l.to) : '') + ')' : '');
      locSel.appendChild(o);
    });
    (b.services || []).forEach(function (s) {
      if (s.kind === 'seminar') return;
      services[s.id] = s;
      var o = document.createElement('option');
      o.value = s.id; o.textContent = s.name;
      svcSel.appendChild(o);
    });
  });

  locSel.addEventListener('change', function () {
    var l = locations[locSel.value];
    dateInp.value = '';
    view = null; collapsed = false;
    renderCal();
    document.getElementById('loc-note').textContent = l && l.from
      ? 'In ' + l.city + ': ' + fmt(l.from) + (l.to ? ' – ' + fmt(l.to) : '') : '';
  });

  function currentKind() {
    if (semChk.checked) return 'seminar';
    var s = services[svcSel.value];
    return s ? s.kind : '';
  }
  function updateMode() {
    var kind = currentKind();
    var seminar = kind === 'seminar';
    form.querySelector('.tattoo-only').hidden = seminar;
    form.querySelector('.seminar-only').hidden = !seminar;
    form.elements.terms.required = seminar;
    images.hidden = seminar || !services[svcSel.value];
    up2.hidden = kind !== 'coverup';
    images.classList.toggle('single', kind !== 'coverup');
    form.elements.image2.required = kind === 'coverup';
    form.elements.image1.required = !seminar && !!services[svcSel.value];
    var idea = form.elements.idea, label = document.getElementById('idea-label');
    if (seminar) {
      label.textContent = 'What would you like to learn?';
      idea.placeholder = 'Briefly: your experience and what you want to learn in the seminar.';
    } else {
      label.textContent = 'Describe your idea';
      idea.placeholder = 'Size, placement, meaning, references…';
    }
  }
  svcSel.addEventListener('change', updateMode);
  semChk.addEventListener('change', updateMode);

  // previews
  [up1, up2].forEach(function (box) {
    var inp = box.querySelector('input'), img = box.querySelector('img'), txt = box.querySelector('.bf-drop-text');
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) { img.hidden = true; txt.hidden = false; return; }
      img.src = URL.createObjectURL(f); img.hidden = false; txt.hidden = true;
      box.classList.add('has-file');
    });
  });

  function showError(msg) {
    var e = document.getElementById('book-error');
    e.textContent = msg; e.hidden = !msg;
    if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    showError('');
    var f = form.elements;
    if (!f.firstName.value.trim() || !f.lastName.value.trim()) return showError('Please enter your first and last name.');
    if (!f.contact.value.trim()) return showError('Please enter your email, phone or Instagram.');
    if (!f.location.value) return showError('Please choose a city.');
    if (!f.date.value) return showError('Please pick a date.');
    var kind = currentKind();
    if (!kind) return showError('Please choose a style.');
    if (kind !== 'seminar' && !f.image1.files.length) return showError('Please add a reference image.');
    if (kind === 'coverup' && !f.image2.files.length) return showError('Please add a photo of the tattoo you want to cover.');
    if (!f.idea.value.trim()) return showError(kind === 'seminar' ? 'Please write what you would like to learn.' : 'Please describe your idea.');
    if (kind === 'seminar' && !f.terms.checked) return showError('Please accept the seminar terms.');
    if (!f.adult.checked) return showError('You must confirm you are 18 or older.');

    var fd = new FormData(form);
    if (kind === 'seminar') { fd.delete('image1'); fd.delete('image2'); fd.delete('service'); }
    var btn = form.querySelector('.bf-submit');
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('api/book.php', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); }); })
      .then(function () {
        form.hidden = true;
        document.getElementById('book-done').hidden = false;
        window.scrollTo({ top: document.querySelector('.book').offsetTop - 40, behavior: 'smooth' });
      })
      .catch(function (err) { showError(err.message); })
      .then(function () { btn.disabled = false; btn.textContent = 'Book now'; });
  });
})();
