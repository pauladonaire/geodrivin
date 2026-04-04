/* ============================================================
   direccionesFijas.js — CRUD de direcciones fijas (localStorage)
   ============================================================ */

const DireccionesFijas = (() => {
  const FIJAS_KEY = 'andesmar_fijas';
  let fijas = [];
  let selectedFijaId = null;

  function _load() {
    try { fijas = JSON.parse(localStorage.getItem(FIJAS_KEY) || '[]'); } catch { fijas = []; }
    return fijas;
  }

  function _save() {
    localStorage.setItem(FIJAS_KEY, JSON.stringify(fijas));
  }

  async function cargar() {
    return _load();
  }

  function getAll() { return fijas; }

  async function crear(datos) {
    _load();
    const nuevo = {
      id: Date.now(),
      nombre_referencia: datos.nombre_referencia,
      address1:  datos.address1  || null,
      city:      datos.city      || null,
      zip_code:  datos.zip_code  || null,
      lat:       parseFloat(datos.lat),
      lng:       parseFloat(datos.lng),
      veces_usada: 0,
      fecha_creacion: new Date().toISOString()
    };
    fijas.push(nuevo);
    _save();
    return nuevo;
  }

  async function actualizar(id, datos) {
    _load();
    const idx = fijas.findIndex(f => f.id === id);
    if (idx < 0) throw new Error('No encontrada');
    fijas[idx] = { ...fijas[idx], ...datos };
    _save();
  }

  async function eliminar(id) {
    _load();
    fijas = fijas.filter(f => f.id !== id);
    _save();
  }

  async function registrarUso(id) {
    _load();
    const f = fijas.find(f => f.id === id);
    if (f) { f.veces_usada = (f.veces_usada || 0) + 1; _save(); }
  }

  function renderTabla() {
    const tbody = document.getElementById('fijas-tbody');
    const empty = document.getElementById('fijas-empty');
    if (!tbody) return;

    if (!fijas.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = fijas.map(f => `
      <tr>
        <td><strong style="font-size:13px;">${esc(f.nombre_referencia)}</strong></td>
        <td>${esc(f.address1 || '—')}</td>
        <td>${esc(f.city || '—')}</td>
        <td>${esc(f.zip_code || '—')}</td>
        <td style="font-family:monospace;font-size:11px;">${f.lat?.toFixed(6) || '—'}</td>
        <td style="font-family:monospace;font-size:11px;">${f.lng?.toFixed(6) || '—'}</td>
        <td><span class="badge badge-cyan">${f.veces_usada || 0}x</span></td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" onclick="DireccionesFijas.openEditModal(${f.id})">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="DireccionesFijas.confirmDelete(${f.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderSelectorList(containerId, onSelect) {
    selectedFijaId = null;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!fijas.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-msg">No hay direcciones fijas guardadas.</div></div>';
      return;
    }

    container.innerHTML = fijas.map(f => `
      <div class="card" style="cursor:pointer;border:0.5px solid var(--border-color);padding:10px 14px;"
           data-fija-id="${f.id}" onclick="DireccionesFijas._selectFija(${f.id}, this)">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-weight:600;font-size:13px;">${esc(f.nombre_referencia)}</div>
            <div class="text-muted text-sm">${esc(f.address1 || '')} ${esc(f.city ? '— ' + f.city : '')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:monospace;font-size:11px;color:var(--cyan);">${f.lat?.toFixed(5)}, ${f.lng?.toFixed(5)}</div>
            <div class="text-xs text-muted">usada ${f.veces_usada || 0}x</div>
          </div>
        </div>
      </div>
    `).join('');

    if (onSelect) {
      container.querySelectorAll('[data-fija-id]').forEach(el => {
        el.addEventListener('click', () => onSelect(parseInt(el.dataset.fijaId)));
      });
    }
  }

  function _selectFija(id, el) {
    document.querySelectorAll('[data-fija-id]').forEach(e => {
      e.style.borderColor = 'var(--border-color)';
      e.style.background  = '';
    });
    el.style.borderColor = 'var(--cyan)';
    el.style.background  = 'rgba(1,254,255,0.06)';
    selectedFijaId = id;
    const btn = document.getElementById('btn-aplicar-fija-confirmar');
    if (btn) btn.disabled = false;
  }

  function getSelected() {
    if (!selectedFijaId) return null;
    return fijas.find(f => f.id === selectedFijaId) || null;
  }

  function openEditModal(id) {
    const fija = fijas.find(f => f.id === id);
    if (!fija) return;
    document.getElementById('fija-nombre').value   = fija.nombre_referencia || '';
    document.getElementById('fija-address1').value = fija.address1  || '';
    document.getElementById('fija-city').value     = fija.city      || '';
    document.getElementById('fija-zip').value      = fija.zip_code  || '';
    document.getElementById('fija-lat').value      = fija.lat       || '';
    document.getElementById('fija-lng').value      = fija.lng       || '';
    const modal = document.getElementById('modal-nueva-fija');
    modal.dataset.editId = id;
    modal.querySelector('.modal-title').textContent = 'Editar dirección fija';
    modal.classList.add('active');
  }

  function confirmDelete(id) {
    const fija = fijas.find(f => f.id === id);
    if (!fija) return;
    if (!confirm(`¿Eliminar "${fija.nombre_referencia}"?`)) return;
    eliminar(id)
      .then(() => { renderTabla(); Toast.success('Dirección fija eliminada'); })
      .catch(() => Toast.error('Error al eliminar'));
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    cargar, getAll, crear, actualizar, eliminar, registrarUso,
    renderTabla, renderSelectorList, getSelected,
    openEditModal, confirmDelete, _selectFija
  };
})();

window.DireccionesFijas = DireccionesFijas;
