(function () {
  var T = {
    en: {
      'nav.about': 'About me', 'nav.portfolio': 'Portfolio', 'nav.book': 'Book now',
      'nav.academy': 'Academy', 'nav.news': 'News', 'nav.contact': 'Contact',
      'about.name': 'Rauf Asgarov', 'about.bio': 'Tattoo artist based in Baku. Bio text goes here.',
      'lang.title': 'Choose your language', 'lang.remember': 'Remember my choice', 'lang.confirm': 'Continue'
    },
    ru: {
      'nav.about': 'Обо мне', 'nav.portfolio': 'Портфолио', 'nav.book': 'Записаться',
      'nav.academy': 'Академия', 'nav.news': 'Новости', 'nav.contact': 'Контакты',
      'about.name': 'Рауф Аскеров', 'about.bio': 'Тату-мастер из Баку. Здесь будет текст биографии.',
      'lang.title': 'Выберите язык', 'lang.remember': 'Запомнить мой выбор', 'lang.confirm': 'Продолжить'
    },
    az: {
      'nav.about': 'Haqqımda', 'nav.portfolio': 'Portfolio', 'nav.book': 'Rezervasiya',
      'nav.academy': 'Akademiya', 'nav.news': 'Xəbərlər', 'nav.contact': 'Əlaqə',
      'about.name': 'Rauf Əsgərov', 'about.bio': 'Bakıda tatu ustası. Bio mətni burada olacaq.',
      'lang.title': 'Dil seçin', 'lang.remember': 'Seçimimi yadda saxla', 'lang.confirm': 'Davam et'
    }
  };

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function apply(lang) {
    var d = T[lang] || T.en;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (d[key] !== undefined) el.textContent = d[key];
    });
    document.querySelectorAll('.lang-switch a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-lang') === lang);
    });
  }

  function detect() {
    var nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return T[nav] ? nav : 'en';
  }

  var saved = read('lang');
  var remember = read('langRemember') === '1';
  var askedThisSession = false;
  try { askedThisSession = sessionStorage.getItem('langAsked') === '1'; } catch (e) {}

  var current = saved || detect();
  apply(current);

  // Language switcher links (in nav)
  document.querySelectorAll('.lang-switch a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      current = a.getAttribute('data-lang');
      store('lang', current);
      apply(current);
    });
  });

  // Entry modal
  var modal = document.querySelector('.lang-modal');
  if (!modal) return;

  if (remember && saved) { modal.remove(); return; }
  if (askedThisSession) { modal.remove(); return; }

  var opts = modal.querySelectorAll('.lang-opt');
  var chk = modal.querySelector('#lang-remember');

  function select(lang) {
    current = lang;
    opts.forEach(function (b) { b.classList.toggle('is-selected', b.getAttribute('data-lang') === lang); });
    apply(lang);
  }
  opts.forEach(function (b) {
    b.addEventListener('click', function () { select(b.getAttribute('data-lang')); });
  });
  select(current);

  modal.querySelector('.lang-confirm').addEventListener('click', function () {
    store('lang', current);
    store('langRemember', chk.checked ? '1' : '0');
    try { sessionStorage.setItem('langAsked', '1'); } catch (e) {}
    modal.classList.add('is-hidden');
    setTimeout(function () { modal.remove(); }, 300);
  });

  document.body.classList.add('lang-modal-open');
  modal.classList.add('is-visible');
})();
