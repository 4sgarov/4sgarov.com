(function () {
  var filters = document.querySelectorAll('.filter');
  var cards = document.querySelectorAll('.card');
  if (!filters.length) return;

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      filters.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      cards.forEach(function (c) {
        c.hidden = f !== 'all' && c.getAttribute('data-genre') !== f;
      });
      var grid = document.querySelector('.grid');
      if (grid) grid.scrollLeft = 0;
    });
  });
})();
