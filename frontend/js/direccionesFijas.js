/* ============================================================
   direccionesFijas.js — CRUD de direcciones fijas (Google Sheets)
   ============================================================ */

const DireccionesFijas = (() => {

  // ── Columnas del Sheet (orden exacto) ─────────────────────
  const HEADERS = ['id','nombre_referencia','address1','city','zip_code','lat','lng','deposito_id','veces_usada','fecha_creacion'];

  let fijas = [];          // filas visibles para el usuario actual
  let _todasFijas = [];   // filas completas del sheet (incluyendo otros depósitos)
  let selectedFijaId = null;

  // ── Config helpers ─────────────────────────────────────────
  function _sheetId()  { return (typeof CONFIG !== 'undefined') ? CONFIG.FIJAS_SHEET_ID  : null; }
  function _sheetTab() { return (typeof CONFIG !== 'undefined') ? (CONFIG.FIJAS_SHEET_TAB || 'Fijas') : 'Fijas'; }

  // ── Conversión objeto ↔ fila ──────────────────────────────
  function _rowToFija(r) {
    return {
      id:                String(r.id || ''),
      nombre_referencia: r.nombre_referencia || '',
      address1:          r.address1  || null,
      city:              r.city      || null,
      zip_code:          r.zip_code  || null,
      lat:               r.lat  ? parseFloat(r.lat)  : null,
      lng:               r.lng  ? parseFloat(r.lng)  : null,
      deposito_id:       r.deposito_id || null,
      veces_usada:       r.veces_usada ? parseInt(r.veces_usada) : 0,
      fecha_creacion:    r.fecha_creacion || '',
    };
  }

  function _fijaToRow(f) {
    return HEADERS.map(h => (f[h] !== null && f[h] !== undefined) ? String(f[h]) : '');
  }

  // ── Escribir todo el array fijas al Sheet ─────────────────
  async function _guardar() {
    const sheetId = _sheetId();
    if (!sheetId) {
      // Sin config → guardar en localStorage como fallback
      localStorage.setItem('andesmar_fijas', JSON.stringify(fijas));
      return;
    }
    // Reconstruir el sheet completo: filas de otros depósitos + filas del usuario actual
    const user = Auth.getUser();
    let toWrite;
    if (user?.rol === 'admin') {
      toWrite = fijas; // admin ve y escribe todo
    } else {
      // Filas que NO pertenecen al depósito del usuario actual (no tocar)
      const otras = _todasFijas.filter(f => f.deposito_id && f.deposito_id !== user?.deposito_id);
      toWrite = [...otras, ...fijas];
    }
    await Sheets.sobreescribirSheet(sheetId, _sheetTab(), HEADERS, toWrite.map(_fijaToRow));
  }

  // ── Cargar desde Sheets (o localStorage como fallback) ────
  async function cargar() {
    const sheetId = _sheetId();
    if (sheetId) {
      const { rows } = await Sheets.leerSheet(sheetId);
      const todasSheets = rows.filter(r => r.id).map(_rowToFija);
      _todasFijas = todasSheets; // guardar copia completa para _guardar()
      const user = Auth.getUser();
      fijas = (user?.rol === 'admin')
        ? todasSheets
        : todasSheets.filter(f => !f.deposito_id || f.deposito_id === user?.deposito_id);
    } else {
      // Fallback localStorage
      try {
        const todas = JSON.parse(localStorage.getItem('andesmar_fijas') || '[]');
        const user = Auth.getUser();
        // Normalizar IDs a string para consistencia
        const todasStr = todas.map(f => ({ ...f, id: String(f.id) }));
        fijas = (user?.rol === 'admin')
          ? todasStr
          : todasStr.filter(f => !f.deposito_id || f.deposito_id === user?.deposito_id);
      } catch { fijas = []; }
    }
    return fijas;
  }

  function getAll() { return fijas; }

  // ── CRUD ───────────────────────────────────────────────────
  async function crear(datos) {
    await cargar(); // siempre re-leer del sheet antes de escribir
    const nuevo = {
      id:                String(Date.now()),
      nombre_referencia: datos.nombre_referencia,
      address1:          datos.address1    || null,
      city:              datos.city        || null,
      zip_code:          datos.zip_code    || null,
      lat:               parseFloat(datos.lat),
      lng:               parseFloat(datos.lng),
      deposito_id:       datos.deposito_id || null,
      veces_usada:       0,
      fecha_creacion:    new Date().toISOString(),
    };
    fijas.push(nuevo);
    await _guardar();
    return nuevo;
  }

  async function actualizar(id, datos) {
    await cargar(); // siempre re-leer del sheet antes de escribir
    const sid = String(id);
    const idx = fijas.findIndex(f => String(f.id) === sid);
    if (idx < 0) throw new Error('No encontrada');
    fijas[idx] = { ...fijas[idx], ...datos, id: sid };
    await _guardar();
  }

  async function eliminar(id) {
    await cargar(); // siempre re-leer del sheet antes de escribir
    const sid = String(id);
    fijas = fijas.filter(f => String(f.id) !== sid);
    await _guardar();
  }

  async function registrarUso(id) {
    const sid = String(id);
    const f = fijas.find(f => String(f.id) === sid);
    if (f) {
      f.veces_usada = (f.veces_usada || 0) + 1;
      await _guardar();
    }
  }

  // ── Render tabla de gestión ────────────────────────────────
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

    const user = Auth.getUser();
    tbody.innerHTML = fijas.map(f => `
      <tr>
        <td><strong style="font-size:13px;">${esc(f.nombre_referencia)}</strong>${user?.rol === 'admin' && f.deposito_id ? `<div class="text-xs text-muted">${esc(f.deposito_id)}</div>` : ''}</td>
        <td>${esc(f.address1 || '—')}</td>
        <td>${esc(f.city || '—')}</td>
        <td>${esc(f.zip_code || '—')}</td>
        <td style="font-family:monospace;font-size:11px;">${f.lat?.toFixed(6) || '—'}</td>
        <td style="font-family:monospace;font-size:11px;">${f.lng?.toFixed(6) || '—'}</td>
        <td><span class="badge badge-cyan">${f.veces_usada || 0}x</span></td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" onclick="DireccionesFijas.openEditModal('${esc(f.id)}')">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="DireccionesFijas.confirmDelete('${esc(f.id)}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── Render selector (modal aplicar fija) ──────────────────
  function renderSelectorList(containerId, onSelect) {
    selectedFijaId = null;
    const container = document.getElementById(containerId);
    if (!container) return;

    const searchInput = document.getElementById('fijas-selector-search');
    if (searchInput) searchInput.value = '';

    if (!fijas.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-msg">No hay direcciones fijas guardadas.</div></div>';
      return;
    }

    function _renderCards(lista) {
      container.innerHTML = '';
      if (!lista.length) {
        container.innerHTML = '<div class="text-muted text-sm" style="padding:12px;text-align:center;">Sin resultados.</div>';
        return;
      }
      lista.forEach(f => {
        const el = document.createElement('div');
        el.className = 'card';
        el.style.cssText = 'cursor:pointer;border:0.5px solid var(--border-color);padding:10px 14px;';
        el.dataset.fijaId = f.id;
        el.innerHTML = `
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
        `;
        el.addEventListener('click', () => {
          _selectFija(f.id, el);
          if (onSelect) onSelect(f.id);
        });
        container.appendChild(el);
      });
    }

    _renderCards(fijas);

    if (searchInput) {
      const fresh = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(fresh, searchInput);
      fresh.addEventListener('input', () => {
        const q = fresh.value.toLowerCase().trim();
        if (!q) { _renderCards(fijas); return; }
        const filtered = fijas.filter(f =>
          [f.nombre_referencia, f.address1, f.city]
            .filter(Boolean).join(' ').toLowerCase().includes(q)
        );
        _renderCards(filtered);
      });
      fresh.focus();
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
    return fijas.find(f => String(f.id) === String(selectedFijaId)) || null;
  }

  function openEditModal(id) {
    const sid = String(id);
    const fija = fijas.find(f => String(f.id) === sid);
    if (!fija) return;
    document.getElementById('fija-nombre').value   = fija.nombre_referencia || '';
    document.getElementById('fija-address1').value = fija.address1  || '';
    document.getElementById('fija-city').value     = fija.city      || '';
    document.getElementById('fija-zip').value      = fija.zip_code  || '';
    document.getElementById('fija-lat').value      = fija.lat       || '';
    document.getElementById('fija-lng').value      = fija.lng       || '';
    const modal = document.getElementById('modal-nueva-fija');
    modal.dataset.editId = sid;
    modal.querySelector('.modal-title').textContent = 'Editar dirección fija';
    modal.dataset.editDepositoId = fija.deposito_id || '';
    modal.dispatchEvent(new CustomEvent('fija-edit-open', { detail: { depositoId: fija.deposito_id || null } }));
    modal.classList.add('active');
  }

  function confirmDelete(id) {
    const sid = String(id);
    const fija = fijas.find(f => String(f.id) === sid);
    if (!fija) return;
    if (!confirm(`¿Eliminar "${fija.nombre_referencia}"?`)) return;
    eliminar(sid)
      .then(() => { renderTabla(); Toast.success('Dirección fija eliminada'); })
      .catch(err => Toast.error('Error al eliminar: ' + err.message));
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
