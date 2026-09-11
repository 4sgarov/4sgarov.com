(function () {
  var btn = document.querySelector('.menu-btn');
  if (!btn) return;

  function toggle(open) {
    var isOpen = open !== undefined ? open : !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', isOpen);
    btn.setAttribute('aria-expanded', isOpen);
    btn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  }

  btn.addEventListener('click', function () { toggle(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') toggle(false);
  });
})();
