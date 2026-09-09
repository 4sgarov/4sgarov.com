/* ============ Preloader ============ */
window.addEventListener('load', () => {
  const preloader = document.getElementById('preloader');
  setTimeout(() => preloader?.remove(), 1800);
});

/* ============ Custom cursor ============ */
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
const cursorLabel = document.getElementById('cursorLabel');
const isFinePointer = window.matchMedia('(hover: hover)').matches;

let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

if (isFinePointer && cursorDot && cursorRing) {
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
  });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    requestAnimationFrame(animateRing);
  }
  animateRing();

  document.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hover-link'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hover-link'));
  });

  document.querySelectorAll('.tile').forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursorRing.classList.add('hover-view');
      cursorLabel.textContent = 'BAX';
    });
    el.addEventListener('mouseleave', () => {
      cursorRing.classList.remove('hover-view');
      cursorLabel.textContent = '';
    });
  });
}

/* ============ Magnetic buttons ============ */
document.querySelectorAll('.btn-magnetic').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const relX = e.clientX - rect.left - rect.width / 2;
    const relY = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${relX * 0.28}px, ${relY * 0.35}px)`;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translate(0, 0)';
  });
});

/* ============ Generative dot mandala ============ */
const mandalaGroup = document.getElementById('dotMandala');
if (mandalaGroup) {
  const cx = 120, cy = 120;
  const rings = [
    { r: 22, count: 10, size: 2.4 },
    { r: 38, count: 16, size: 2.1 },
    { r: 54, count: 22, size: 1.9 },
    { r: 70, count: 28, size: 1.6 },
    { r: 86, count: 34, size: 1.3 },
    { r: 100, count: 40, size: 1 }
  ];
  const frag = document.createDocumentFragment();
  rings.forEach(({ r, count, size }) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      dot.setAttribute('r', size);
      frag.appendChild(dot);
    }
  });
  mandalaGroup.appendChild(frag);
}

/* ============ Hero ink scatter ============ */
const heroScatter = document.getElementById('heroScatter');
if (heroScatter) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 22; i++) {
    const dot = document.createElement('i');
    const size = Math.random() * 5 + 2;
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    dot.style.left = Math.random() * 100 + '%';
    dot.style.top = Math.random() * 100 + '%';
    dot.style.opacity = (Math.random() * 0.35 + 0.08).toFixed(2);
    frag.appendChild(dot);
  }
  heroScatter.appendChild(frag);
}

/* ============ Gallery filter ============ */
const filterBtns = document.querySelectorAll('.filter-btn');
const tiles = document.querySelectorAll('.tile');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;

    tiles.forEach(tile => {
      const match = filter === 'all' || tile.dataset.category === filter;
      tile.classList.toggle('hidden-tile', !match);
    });
  });
});

/* ============ Lightbox ============ */
const lightbox = document.getElementById('lightbox');
const lightboxSvg = document.getElementById('lightboxSvg');
const lightboxTitle = document.getElementById('lightboxTitle');
const lightboxDesc = document.getElementById('lightboxDesc');
const lightboxCategory = document.getElementById('lightboxCategory');
const lightboxClose = document.getElementById('lightboxClose');

const categoryLabels = {
  fineline: 'Fine Line',
  blackwork: 'Blackwork',
  geometric: 'Geometrik',
  traditional: 'Ənənəvi',
  dotwork: 'Dotwork'
};

tiles.forEach(tile => {
  tile.addEventListener('click', () => {
    const svg = tile.querySelector('.tile-svg');
    lightboxSvg.innerHTML = svg ? svg.outerHTML : '';
    lightboxTitle.textContent = tile.dataset.title || '';
    lightboxDesc.textContent = tile.dataset.desc || '';
    lightboxCategory.textContent = categoryLabels[tile.dataset.category] || '';
    lightbox.classList.add('open');
  });
});

function closeLightbox() {
  lightbox.classList.remove('open');
}
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

/* ============ Mobile menu ============ */
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

/* ============ Scroll reveal ============ */
const revealEls = document.querySelectorAll('.reveal, .hero-title .line');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealEls.forEach(el => revealObserver.observe(el));

/* ============ Animated counters ============ */
const counters = document.querySelectorAll('.stat-num');
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
counters.forEach(counter => counterObserver.observe(counter));

function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1200;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============ Active nav link + navbar scroll state ============ */
const navbar = document.getElementById('navbar');
const progressBar = document.getElementById('progressBar');
const sections = document.querySelectorAll('main section[id]');
const navItems = document.querySelectorAll('.nav-link');

function updateActiveLink() {
  let current = sections[0]?.id;
  const offset = 140;
  sections.forEach(section => {
    if (window.scrollY >= section.offsetTop - offset) current = section.id;
  });
  navItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === '#' + current);
  });
}

function onScroll() {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  progressBar.style.width = pct + '%';
  updateActiveLink();
}
window.addEventListener('scroll', onScroll, { passive: true });

/* ============ Back to top ============ */
const toTop = document.getElementById('toTop');
toTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ============ Footer year ============ */
document.getElementById('year').textContent = new Date().getFullYear();

/* ============ Initial state ============ */
onScroll();
