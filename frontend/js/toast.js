/* ============================================================
   toast.js — Sistema de notificaciones
   ============================================================ */

const Toast = (() => {
  function show({ type = 'info', title = '', msg = '', duration = 4000, closeable = true }) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: '🔵' };
    const classMap = { success: 'toast-success', error: 'toast-error', warning: 'toast-warning', info: 'toast-info' };

    const el = document.createElement('div');
    el.className = `toast ${classMap[type] || 'toast-info'}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || '🔵'}</span>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${msg   ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
      ${closeable ? `<button class="toast-close" aria-label="Cerrar">✕</button>` : ''}
    `;

    container.appendChild(el);

    if (closeable) {
      el.querySelector('.toast-close')?.addEventListener('click', () => remove(el));
    }

    if (duration > 0) {
      setTimeout(() => remove(el), duration);
    }

    return el;
  }

  function remove(el) {
    if (!el || el.classList.contains('removing')) return;
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback por si animationend no dispara
    setTimeout(() => el.remove(), 400);
  }

  return {
    success: (msg, title = 'Éxito') => show({ type: 'success', title, msg, duration: 3000 }),
    error:   (msg, title = 'Error', duration = 5000) => show({ type: 'error', title, msg, duration, closeable: true }),
    warning: (msg, title = 'Atención') => show({ type: 'warning', title, msg, duration: 4000 }),
    info:    (msg, title = 'Info') => show({ type: 'info', title, msg, duration: 3000 }),
    show,
    remove
  };
})();

window.Toast = Toast;
