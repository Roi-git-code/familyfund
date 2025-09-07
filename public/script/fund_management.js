
(function () {
  if (window.__fundCustomModalsInit) return;
  window.__fundCustomModalsInit = true;

  const isOpen = (el) => getComputedStyle(el).display !== 'none';
  
const openModal = (sel) => {
  // Close all first
  document.querySelectorAll('.c-modal').forEach(modal => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  });

  const el = document.querySelector(sel);
  if (!el) return;

  el.style.display = 'flex';
  el.setAttribute('aria-hidden', 'false');

  const backdrop = el.querySelector('.c-modal__backdrop');
  if (backdrop) backdrop.style.display = 'block';

  document.body.classList.add('modal-open');

  // Re-append to top
  document.body.appendChild(el);
};


const closeModal = (nodeInside) => {
  const el = nodeInside.closest('.c-modal');
  if (!el) return;

  // Hide entire modal
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');

  // Explicitly hide its backdrop
  const backdrop = el.querySelector('.c-modal__backdrop');
  if (backdrop) backdrop.style.display = 'none';

  // Kill stray Bootstrap backdrop
  document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());

  // Remove modal-open only if no modals are open
  const anyOpen = Array.from(document.querySelectorAll('.c-modal'))
    .some(m => getComputedStyle(m).display !== 'none');
  if (!anyOpen) {
    document.body.classList.remove('modal-open');
  }
};
  
  // Enhanced event listener with better Bootstrap compatibility
  document.addEventListener('click', function (e) {
    const trigger = e.target.closest('[data-bs-target]');
    if (!trigger) return;

    const targetSel = trigger.getAttribute('data-bs-target');
    if (!targetSel || !targetSel.includes('CategoryModal')) return;

    const modalEl = document.querySelector(targetSel);
    if (!modalEl || !modalEl.classList.contains('c-modal')) return;

    // Prevent Bootstrap default behavior
    e.preventDefault();
    e.stopImmediatePropagation();
    
    openModal(targetSel);
  }, true);

  // Close handlers
  document.addEventListener('click', function (e) {
    if (e.target.matches('[data-close], .btn-close')) {
      e.preventDefault();
      closeModal(e.target);
    } else if (e.target.classList.contains('c-modal__backdrop')) {
      closeModal(e.target);
    }
  });

  // Escape key to close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const openModals = Array.from(document.querySelectorAll('.c-modal')).filter(m => isOpen(m));
      if (openModals.length) {
        closeModal(openModals[openModals.length - 1]);
      }
    }
  });
})();
