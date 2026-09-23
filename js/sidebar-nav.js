(() => {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  const menu = document.getElementById('mobileMenu');
  if (!sidebar || !menu) return;

  const setOpen = (open) => {
    sidebar.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };

  menu.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));

  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('.nav-item')) setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!sidebar.classList.contains('open')) return;
    if (!sidebar.contains(event.target) && !menu.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) setOpen(false);
  }, { passive: true });
})();
